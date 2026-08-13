#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { open, readFile, stat } from 'node:fs/promises';
import { basename } from 'node:path';
import { pathToFileURL } from 'node:url';
import { canonicalJson, sha256, ValidationError } from './lib/canonical.mjs';
import { verifyAxiomHostH0BuildEvidence } from './axiom-host-lab-compare.mjs';

export const HOST_IMAGE_DIAGNOSTIC_SCHEMA = 'axiom-host-h0-image-diagnostics.v1';

const GPT_SIGNATURE = Buffer.from('EFI PART', 'ascii');
const SECTOR_CANDIDATES = Object.freeze([512, 4096]);
const MAX_GPT_ENTRY_BYTES = 16 * 1024 * 1024;
const MAX_PARTITIONS = 256;
const SAMPLE_BYTES = 1024 * 1024;
const SHA256 = /^[a-f0-9]{64}$/;

export async function diagnoseAxiomHostImage(rawImagePath, buildEvidence) {
  verifyAxiomHostH0BuildEvidence(buildEvidence);
  const diagnostic = await diagnoseGptImage(rawImagePath);
  const rawName = basename(rawImagePath);
  const boundArtifact = buildEvidence.builder_observation.artifact_inventory.find(
    artifact => artifact.name === rawName && artifact.link_target === undefined
  );
  if (!boundArtifact) {
    throw new ValidationError(`AXIOM Host H0 evidence does not bind raw image artifact ${rawName}`);
  }
  if (
    boundArtifact.bytes !== diagnostic.disk_bytes
    || boundArtifact.sha256 !== diagnostic.disk_sha256
  ) {
    throw new ValidationError('AXIOM Host H0 raw image diagnostics do not match the bound build evidence');
  }

  const result = {
    schema: HOST_IMAGE_DIAGNOSTIC_SCHEMA,
    status: 'diagnostic-only',
    source: {
      revision: buildEvidence.source.revision,
      tree: buildEvidence.source.tree,
      source_date_epoch: buildEvidence.source.source_date_epoch
    },
    configuration: {
      policy_sha256: buildEvidence.configuration.policy_sha256,
      mkosi_config_sha256: buildEvidence.configuration.mkosi_config_sha256,
      snapshot_lock_sha256: buildEvidence.configuration.snapshot_lock_sha256,
      snapshot: buildEvidence.configuration.snapshot,
      image_version: buildEvidence.configuration.image_version,
      mkosi_version: buildEvidence.builder_observation.mkosi_version
    },
    image: diagnostic,
    controls: {
      raw_image_bound_to_build_evidence: true,
      diagnostic_only: true,
      production_promoted: false
    },
    interpretation: 'Partition-level hashes localize H0 raw-image byte drift. They do not establish filesystem correctness, boot success, authenticity, or production readiness.'
  };
  return {
    ...result,
    diagnostic_sha256: sha256(canonicalJson(result))
  };
}

export async function diagnoseGptImage(rawImagePath) {
  const metadata = await stat(rawImagePath);
  if (!metadata.isFile() || metadata.size < 34 * 512) {
    throw new ValidationError('AXIOM Host H0 diagnostic input must be a regular GPT disk image');
  }
  const diskBytes = metadata.size;
  const handle = await open(rawImagePath, 'r');
  try {
    const sectorSize = await detectSectorSize(handle);
    if (diskBytes % sectorSize !== 0) {
      throw new ValidationError('AXIOM Host H0 disk size is not aligned to the detected sector size');
    }
    const mbr = await readExact(handle, sectorSize, 0);
    if (mbr[510] !== 0x55 || mbr[511] !== 0xaa) {
      throw new ValidationError('AXIOM Host H0 disk image is missing the protective MBR signature');
    }

    const headerSector = await readExact(handle, sectorSize, sectorSize);
    const header = parseGptHeader(headerSector, sectorSize, diskBytes);
    const entryBytes = header.partition_entry_count * header.partition_entry_size;
    if (entryBytes < 1 || entryBytes > MAX_GPT_ENTRY_BYTES) {
      throw new ValidationError('AXIOM Host H0 GPT partition-entry array has an invalid size');
    }
    const entryOffset = safeOffset(header.partition_entry_lba, sectorSize);
    const entryBuffer = await readExact(handle, entryBytes, entryOffset);
    const partitions = parsePartitions(entryBuffer, header, sectorSize, diskBytes);
    if (partitions.length < 1 || partitions.length > MAX_PARTITIONS) {
      throw new ValidationError('AXIOM Host H0 GPT partition count is outside the diagnostic bound');
    }

    const backupOffset = safeOffset(header.backup_lba, sectorSize);
    const backupHeaderSector = await readExact(handle, sectorSize, backupOffset);
    if (!backupHeaderSector.subarray(0, 8).equals(GPT_SIGNATURE)) {
      throw new ValidationError('AXIOM Host H0 disk image is missing a valid backup GPT header signature');
    }

    const partitionDiagnostics = [];
    for (const partition of partitions) {
      const start = safeOffset(BigInt(partition.first_lba), sectorSize);
      const bytes = (partition.last_lba - partition.first_lba + 1) * sectorSize;
      const firstSampleBytes = Math.min(SAMPLE_BYTES, bytes);
      const lastSampleBytes = Math.min(SAMPLE_BYTES, bytes);
      partitionDiagnostics.push({
        ...partition,
        bytes,
        sha256: await hashRange(rawImagePath, start, bytes),
        first_sample_bytes: firstSampleBytes,
        first_sample_sha256: await hashRange(rawImagePath, start, firstSampleBytes),
        last_sample_bytes: lastSampleBytes,
        last_sample_sha256: await hashRange(
          rawImagePath,
          start + bytes - lastSampleBytes,
          lastSampleBytes
        )
      });
    }

    return {
      disk_bytes: diskBytes,
      disk_sha256: await hashRange(rawImagePath, 0, diskBytes),
      sector_size: sectorSize,
      protective_mbr_sha256: sha256(mbr),
      primary_gpt_header: {
        revision: header.revision,
        header_size: header.header_size,
        header_crc32: header.header_crc32,
        current_lba: header.current_lba,
        backup_lba: header.backup_lba,
        first_usable_lba: header.first_usable_lba,
        last_usable_lba: header.last_usable_lba,
        disk_guid: header.disk_guid,
        partition_entry_lba: header.partition_entry_lba,
        partition_entry_count: header.partition_entry_count,
        partition_entry_size: header.partition_entry_size,
        partition_entry_crc32: header.partition_entry_crc32,
        sha256: sha256(headerSector.subarray(0, header.header_size))
      },
      partition_entries_sha256: sha256(entryBuffer),
      backup_gpt_header_sha256: sha256(backupHeaderSector.subarray(0, header.header_size)),
      partitions: partitionDiagnostics
    };
  } finally {
    await handle.close();
  }
}

async function detectSectorSize(handle) {
  for (const sectorSize of SECTOR_CANDIDATES) {
    const signature = Buffer.alloc(8);
    const { bytesRead } = await handle.read(signature, 0, signature.length, sectorSize);
    if (bytesRead === 8 && signature.equals(GPT_SIGNATURE)) return sectorSize;
  }
  throw new ValidationError('AXIOM Host H0 disk image does not expose a GPT header at a supported sector size');
}

function parseGptHeader(buffer, sectorSize, diskBytes) {
  if (!buffer.subarray(0, 8).equals(GPT_SIGNATURE)) {
    throw new ValidationError('AXIOM Host H0 GPT header signature is invalid');
  }
  const headerSize = buffer.readUInt32LE(12);
  const entryCount = buffer.readUInt32LE(80);
  const entrySize = buffer.readUInt32LE(84);
  if (headerSize < 92 || headerSize > sectorSize || entrySize < 128 || entrySize % 8 !== 0) {
    throw new ValidationError('AXIOM Host H0 GPT header contains unsupported sizing');
  }
  const diskLbas = diskBytes / sectorSize;
  const header = {
    revision: `0x${buffer.readUInt32LE(8).toString(16).padStart(8, '0')}`,
    header_size: headerSize,
    header_crc32: `0x${buffer.readUInt32LE(16).toString(16).padStart(8, '0')}`,
    current_lba: safeNumber(buffer.readBigUInt64LE(24), 'current_lba'),
    backup_lba: safeNumber(buffer.readBigUInt64LE(32), 'backup_lba'),
    first_usable_lba: safeNumber(buffer.readBigUInt64LE(40), 'first_usable_lba'),
    last_usable_lba: safeNumber(buffer.readBigUInt64LE(48), 'last_usable_lba'),
    disk_guid: decodeGuid(buffer.subarray(56, 72)),
    partition_entry_lba: safeNumber(buffer.readBigUInt64LE(72), 'partition_entry_lba'),
    partition_entry_count: entryCount,
    partition_entry_size: entrySize,
    partition_entry_crc32: `0x${buffer.readUInt32LE(88).toString(16).padStart(8, '0')}`
  };
  if (
    header.current_lba !== 1
    || header.backup_lba !== diskLbas - 1
    || header.first_usable_lba >= header.last_usable_lba
    || header.partition_entry_lba < 2
  ) {
    throw new ValidationError('AXIOM Host H0 GPT header geometry is inconsistent');
  }
  return header;
}

function parsePartitions(buffer, header, sectorSize, diskBytes) {
  const partitions = [];
  for (let index = 0; index < header.partition_entry_count; index += 1) {
    const offset = index * header.partition_entry_size;
    const entry = buffer.subarray(offset, offset + header.partition_entry_size);
    if (entry.length < header.partition_entry_size) {
      throw new ValidationError('AXIOM Host H0 GPT partition-entry array is truncated');
    }
    if (entry.subarray(0, 16).every(byte => byte === 0)) continue;
    const firstLba = safeNumber(entry.readBigUInt64LE(32), `partition_${index + 1}_first_lba`);
    const lastLba = safeNumber(entry.readBigUInt64LE(40), `partition_${index + 1}_last_lba`);
    const maxLba = diskBytes / sectorSize - 1;
    if (
      firstLba < header.first_usable_lba
      || lastLba < firstLba
      || lastLba > header.last_usable_lba
      || lastLba >= maxLba
    ) {
      throw new ValidationError(`AXIOM Host H0 GPT partition ${index + 1} has invalid geometry`);
    }
    const nameBytes = entry.subarray(56, Math.min(entry.length, 128));
    const name = nameBytes.toString('utf16le').replace(/\u0000+$/g, '');
    partitions.push({
      index: index + 1,
      name,
      type_guid: decodeGuid(entry.subarray(0, 16)),
      unique_guid: decodeGuid(entry.subarray(16, 32)),
      first_lba: firstLba,
      last_lba: lastLba,
      attributes: `0x${entry.readBigUInt64LE(48).toString(16).padStart(16, '0')}`
    });
  }
  return partitions;
}

function decodeGuid(bytes) {
  if (bytes.length !== 16) throw new ValidationError('AXIOM Host H0 GPT GUID has an invalid size');
  const hex = bytes.toString('hex');
  const a = Buffer.from(hex.slice(0, 8), 'hex').reverse().toString('hex');
  const b = Buffer.from(hex.slice(8, 12), 'hex').reverse().toString('hex');
  const c = Buffer.from(hex.slice(12, 16), 'hex').reverse().toString('hex');
  return `${a}-${b}-${c}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function safeOffset(lba, sectorSize) {
  const value = typeof lba === 'bigint' ? lba : BigInt(lba);
  return safeNumber(value * BigInt(sectorSize), 'byte_offset');
}

function safeNumber(value, label) {
  if (value < 0n || value > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new ValidationError(`AXIOM Host H0 GPT ${label} exceeds safe numeric range`);
  }
  return Number(value);
}

async function readExact(handle, length, position) {
  const buffer = Buffer.alloc(length);
  let offset = 0;
  while (offset < length) {
    const { bytesRead } = await handle.read(buffer, offset, length - offset, position + offset);
    if (bytesRead === 0) throw new ValidationError('AXIOM Host H0 disk image ended unexpectedly');
    offset += bytesRead;
  }
  return buffer;
}

async function hashRange(path, start, length) {
  if (!Number.isSafeInteger(start) || start < 0 || !Number.isSafeInteger(length) || length < 0) {
    throw new ValidationError('AXIOM Host H0 diagnostic hash range is invalid');
  }
  const hash = createHash('sha256');
  if (length === 0) return hash.digest('hex');
  const stream = createReadStream(path, { start, end: start + length - 1 });
  for await (const chunk of stream) hash.update(chunk);
  const digest = hash.digest('hex');
  if (!SHA256.test(digest)) throw new ValidationError('AXIOM Host H0 diagnostic hash failed');
  return digest;
}

async function main() {
  const [rawImagePath, evidencePath] = process.argv.slice(2);
  if (!rawImagePath || !evidencePath || process.argv.length !== 4) {
    throw new ValidationError('Usage: axiom-host-image-diagnostics.mjs <raw-image> <build-evidence.json>');
  }
  let evidence;
  try {
    evidence = JSON.parse(await readFile(evidencePath, 'utf8'));
  } catch {
    throw new ValidationError('AXIOM Host H0 build evidence input is not valid JSON');
  }
  process.stdout.write(`${JSON.stringify(await diagnoseAxiomHostImage(rawImagePath, evidence), null, 2)}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
