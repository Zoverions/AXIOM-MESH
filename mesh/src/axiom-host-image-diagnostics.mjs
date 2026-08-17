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
const CHUNK_BYTES = 16 * 1024 * 1024;
const EXT4_SUPERBLOCK_OFFSET = 1024;
const EXT4_SUPERBLOCK_BYTES = 1024;
const EXT4_MAGIC = 0xef53;
const FAT_BOOT_BYTES = 512;
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
      tools_config_sha256: buildEvidence.configuration.tools_config_sha256,
      repart_definitions_sha256: buildEvidence.configuration.repart_definitions_sha256,
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
    interpretation: 'GPT, filesystem-header, partition, and fixed-size chunk hashes localize H0 raw-image byte drift. They do not establish filesystem correctness, boot success, authenticity, or production readiness.'
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
        ),
        chunk_bytes: CHUNK_BYTES,
        chunks: await hashChunks(rawImagePath, start, bytes, CHUNK_BYTES),
        filesystem: await inspectFilesystem(handle, start, bytes)
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

async function inspectFilesystem(handle, partitionStart, partitionBytes) {
  if (partitionBytes >= EXT4_SUPERBLOCK_OFFSET + EXT4_SUPERBLOCK_BYTES) {
    const superblock = await readExact(
      handle,
      EXT4_SUPERBLOCK_BYTES,
      partitionStart + EXT4_SUPERBLOCK_OFFSET
    );
    if (superblock.readUInt16LE(0x38) === EXT4_MAGIC) {
      return inspectExt4Superblock(superblock);
    }
  }

  if (partitionBytes >= FAT_BOOT_BYTES) {
    const boot = await readExact(handle, FAT_BOOT_BYTES, partitionStart);
    if (looksLikeFat32BootSector(boot)) {
      return inspectFat32(handle, partitionStart, partitionBytes, boot);
    }
  }

  return {
    kind: 'unrecognized',
    recognized: false
  };
}

function inspectExt4Superblock(superblock) {
  const blockSize = 1024 * (2 ** superblock.readUInt32LE(0x18));
  const featureCompat = superblock.readUInt32LE(0x5c);
  const uuid = formatRawUuid(superblock.subarray(0x68, 0x78));
  const volumeName = decodeFixedAscii(superblock.subarray(0x78, 0x88));
  const lastMounted = decodeFixedAscii(superblock.subarray(0x88, 0xc8));
  return {
    kind: 'ext4',
    recognized: true,
    superblock_offset_bytes: EXT4_SUPERBLOCK_OFFSET,
    superblock_sha256: sha256(superblock),
    magic: `0x${superblock.readUInt16LE(0x38).toString(16).padStart(4, '0')}`,
    uuid,
    volume_name: volumeName,
    last_mounted: lastMounted,
    inode_count: superblock.readUInt32LE(0x00),
    block_count_low: superblock.readUInt32LE(0x04),
    reserved_block_count_low: superblock.readUInt32LE(0x08),
    free_block_count_low: superblock.readUInt32LE(0x0c),
    free_inode_count: superblock.readUInt32LE(0x10),
    first_data_block: superblock.readUInt32LE(0x14),
    block_size: blockSize,
    blocks_per_group: superblock.readUInt32LE(0x20),
    inodes_per_group: superblock.readUInt32LE(0x28),
    mount_time: timestampField(superblock.readUInt32LE(0x2c)),
    write_time: timestampField(superblock.readUInt32LE(0x30)),
    mount_count: superblock.readUInt16LE(0x34),
    maximum_mount_count: superblock.readInt16LE(0x36),
    filesystem_state: `0x${superblock.readUInt16LE(0x3a).toString(16).padStart(4, '0')}`,
    error_behavior: `0x${superblock.readUInt16LE(0x3c).toString(16).padStart(4, '0')}`,
    last_check: timestampField(superblock.readUInt32LE(0x40)),
    check_interval_seconds: superblock.readUInt32LE(0x44),
    creator_os: superblock.readUInt32LE(0x48),
    revision_level: superblock.readUInt32LE(0x4c),
    first_non_reserved_inode: superblock.readUInt32LE(0x54),
    inode_size: superblock.readUInt16LE(0x58),
    feature_compat: hex32(featureCompat),
    has_journal: (featureCompat & 0x00000004) !== 0,
    feature_incompat: hex32(superblock.readUInt32LE(0x60)),
    feature_ro_compat: hex32(superblock.readUInt32LE(0x64)),
    journal_uuid: formatRawUuid(superblock.subarray(0xd0, 0xe0)),
    journal_inode: superblock.readUInt32LE(0xe0),
    hash_seed_hex: superblock.subarray(0xec, 0xfc).toString('hex'),
    default_hash_version: superblock.readUInt8(0xfc),
    descriptor_size: superblock.readUInt16LE(0xfe),
    mkfs_time: timestampField(superblock.readUInt32LE(0x108)),
    superblock_checksum: hex32(superblock.readUInt32LE(0x3fc))
  };
}

async function inspectFat32(handle, partitionStart, partitionBytes, boot) {
  const bytesPerSector = boot.readUInt16LE(11);
  const sectorsPerCluster = boot.readUInt8(13);
  const reservedSectorCount = boot.readUInt16LE(14);
  const fatCount = boot.readUInt8(16);
  const fatSize32 = boot.readUInt32LE(36);
  const rootCluster = boot.readUInt32LE(44);
  const fsInfoSector = boot.readUInt16LE(48);
  const backupBootSector = boot.readUInt16LE(50);
  const result = {
    kind: 'fat32',
    recognized: true,
    boot_sector_sha256: sha256(boot),
    jump_hex: boot.subarray(0, 3).toString('hex'),
    oem_name: decodeFixedAscii(boot.subarray(3, 11)),
    bytes_per_sector: bytesPerSector,
    sectors_per_cluster: sectorsPerCluster,
    reserved_sector_count: reservedSectorCount,
    fat_count: fatCount,
    root_entry_count: boot.readUInt16LE(17),
    total_sectors_16: boot.readUInt16LE(19),
    media_descriptor: `0x${boot.readUInt8(21).toString(16).padStart(2, '0')}`,
    fat_size_16: boot.readUInt16LE(22),
    sectors_per_track: boot.readUInt16LE(24),
    head_count: boot.readUInt16LE(26),
    hidden_sector_count: boot.readUInt32LE(28),
    total_sectors_32: boot.readUInt32LE(32),
    fat_size_32: fatSize32,
    extended_flags: `0x${boot.readUInt16LE(40).toString(16).padStart(4, '0')}`,
    filesystem_version: `0x${boot.readUInt16LE(42).toString(16).padStart(4, '0')}`,
    root_cluster: rootCluster,
    fsinfo_sector: fsInfoSector,
    backup_boot_sector: backupBootSector,
    drive_number: boot.readUInt8(64),
    extended_boot_signature: `0x${boot.readUInt8(66).toString(16).padStart(2, '0')}`,
    volume_id: `0x${boot.readUInt32LE(67).toString(16).padStart(8, '0')}`,
    volume_label: decodeFixedAscii(boot.subarray(71, 82)),
    filesystem_type_label: decodeFixedAscii(boot.subarray(82, 90)),
    boot_signature: `0x${boot.readUInt16LE(510).toString(16).padStart(4, '0')}`
  };

  if (bytesPerSector >= 512 && bytesPerSector <= 4096 && isPowerOfTwo(bytesPerSector)) {
    const fsInfoOffset = fsInfoSector * bytesPerSector;
    if (fsInfoSector > 0 && fsInfoOffset + bytesPerSector <= partitionBytes) {
      const fsInfo = await readExact(handle, bytesPerSector, partitionStart + fsInfoOffset);
      result.fsinfo_sha256 = sha256(fsInfo);
      result.fsinfo_lead_signature = hex32(fsInfo.readUInt32LE(0));
      result.fsinfo_structure_signature = hex32(fsInfo.readUInt32LE(484));
      result.fsinfo_free_cluster_count = fsInfo.readUInt32LE(488);
      result.fsinfo_next_free_cluster = fsInfo.readUInt32LE(492);
      result.fsinfo_trail_signature = hex32(fsInfo.readUInt32LE(508));
    }

    const backupOffset = backupBootSector * bytesPerSector;
    if (backupBootSector > 0 && backupOffset + bytesPerSector <= partitionBytes) {
      const backup = await readExact(handle, bytesPerSector, partitionStart + backupOffset);
      result.backup_boot_sector_sha256 = sha256(backup);
      result.backup_matches_primary_boot_sector = backup.subarray(0, FAT_BOOT_BYTES).equals(boot);
    }

    const rootOffset = (
      reservedSectorCount
      + fatCount * fatSize32
      + (rootCluster - 2) * sectorsPerCluster
    ) * bytesPerSector;
    if (rootCluster >= 2 && rootOffset >= 0 && rootOffset + 32 <= partitionBytes) {
      const entry = await readExact(handle, 32, partitionStart + rootOffset);
      if (entry[0] !== 0x00 && entry[0] !== 0xe5 && (entry[11] & 0x08) !== 0) {
        result.volume_label_entry = {
          offset_bytes: rootOffset,
          sha256: sha256(entry),
          name: decodeFixedAscii(entry.subarray(0, 11)),
          attributes: `0x${entry[11].toString(16).padStart(2, '0')}`,
          creation: fatTimestampField(entry.readUInt16LE(14), entry.readUInt16LE(16)),
          access_date: fatDateField(entry.readUInt16LE(18)),
          write: fatTimestampField(entry.readUInt16LE(22), entry.readUInt16LE(24)),
          first_cluster: entry.readUInt16LE(20) * 65_536 + entry.readUInt16LE(26),
          bytes: entry.readUInt32LE(28)
        };
      }
    }
  }

  return result;
}

function looksLikeFat32BootSector(boot) {
  if (boot.length < FAT_BOOT_BYTES || boot.readUInt16LE(510) !== 0xaa55) return false;
  const bytesPerSector = boot.readUInt16LE(11);
  const sectorsPerCluster = boot.readUInt8(13);
  const reserved = boot.readUInt16LE(14);
  const fats = boot.readUInt8(16);
  const rootEntries = boot.readUInt16LE(17);
  const fat16 = boot.readUInt16LE(22);
  const fat32 = boot.readUInt32LE(36);
  return bytesPerSector >= 512
    && bytesPerSector <= 4096
    && isPowerOfTwo(bytesPerSector)
    && sectorsPerCluster > 0
    && isPowerOfTwo(sectorsPerCluster)
    && reserved > 0
    && fats > 0
    && rootEntries === 0
    && fat16 === 0
    && fat32 > 0;
}

async function hashChunks(path, start, length, chunkBytes) {
  const chunks = [];
  let offset = 0;
  let index = 0;
  while (offset < length) {
    const currentBytes = Math.min(chunkBytes, length - offset);
    chunks.push({
      index,
      offset_bytes: offset,
      bytes: currentBytes,
      sha256: await hashRange(path, start + offset, currentBytes)
    });
    offset += currentBytes;
    index += 1;
  }
  return chunks;
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

function formatRawUuid(bytes) {
  if (bytes.length !== 16) throw new ValidationError('AXIOM Host H0 filesystem UUID has an invalid size');
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function decodeFixedAscii(bytes) {
  return bytes.toString('ascii').replace(/\u0000+$/g, '').trimEnd();
}

function timestampField(seconds) {
  return {
    unix_seconds: seconds,
    iso8601: seconds === 0 ? null : new Date(seconds * 1000).toISOString()
  };
}

function fatTimestampField(time, date) {
  return {
    time_raw: `0x${time.toString(16).padStart(4, '0')}`,
    date_raw: `0x${date.toString(16).padStart(4, '0')}`,
    year: 1980 + (date >> 9),
    month: (date >> 5) & 0x0f,
    day: date & 0x1f,
    hour: time >> 11,
    minute: (time >> 5) & 0x3f,
    second: (time & 0x1f) * 2
  };
}

function fatDateField(date) {
  return {
    date_raw: `0x${date.toString(16).padStart(4, '0')}`,
    year: 1980 + (date >> 9),
    month: (date >> 5) & 0x0f,
    day: date & 0x1f
  };
}

function hex32(value) {
  return `0x${value.toString(16).padStart(8, '0')}`;
}

function isPowerOfTwo(value) {
  return Number.isInteger(value) && value > 0 && (value & (value - 1)) === 0;
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
