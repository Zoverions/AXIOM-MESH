#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { copyFile, open, readFile, stat, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { ValidationError } from './lib/canonical.mjs';

const SECTOR_BYTES = 512;
const COPY_BYTES = 16 * 1024 * 1024;
const GPT_SIGNATURE = Buffer.from('EFI PART', 'ascii');

export async function inspectH1Disk(path) {
  const metadata = await stat(path);
  if (!metadata.isFile() || metadata.size < 34 * SECTOR_BYTES) {
    throw new ValidationError('AXIOM Host H1 disk input must be a regular GPT image');
  }
  const handle = await open(path, 'r');
  try {
    const header = Buffer.alloc(SECTOR_BYTES);
    await readExact(handle, header, SECTOR_BYTES);
    if (!header.subarray(0, 8).equals(GPT_SIGNATURE)) {
      throw new ValidationError('AXIOM Host H1 disk input is missing a GPT header');
    }
    const entriesLba = Number(header.readBigUInt64LE(72));
    const count = header.readUInt32LE(80);
    const size = header.readUInt32LE(84);
    if (!Number.isSafeInteger(entriesLba) || count < 1 || count > 256 || size < 128 || size > 4096) {
      throw new ValidationError('AXIOM Host H1 GPT geometry is invalid');
    }
    const entries = Buffer.alloc(count * size);
    await readExact(handle, entries, entriesLba * SECTOR_BYTES);
    const partitions = [];
    for (let index = 0; index < count; index += 1) {
      const entry = entries.subarray(index * size, (index + 1) * size);
      if (entry.subarray(0, 16).every(byte => byte === 0)) continue;
      const firstLba = Number(entry.readBigUInt64LE(32));
      const lastLba = Number(entry.readBigUInt64LE(40));
      const offset = firstLba * SECTOR_BYTES;
      const bytes = (lastLba - firstLba + 1) * SECTOR_BYTES;
      if (!Number.isSafeInteger(offset) || !Number.isSafeInteger(bytes) || offset < 0 || bytes < 1 || offset + bytes > metadata.size) {
        throw new ValidationError('AXIOM Host H1 GPT partition range is invalid');
      }
      partitions.push({
        index: index + 1,
        name: decodeUtf16(entry.subarray(56, 128)),
        type_guid: formatGuid(entry.subarray(0, 16)),
        offset,
        bytes
      });
    }
    return { path, bytes: metadata.size, partitions };
  } finally {
    await handle.close();
  }
}

export async function hashH1Partitions(path) {
  const disk = await inspectH1Disk(path);
  const handle = await open(path, 'r');
  try {
    const partitions = [];
    for (const partition of disk.partitions) {
      partitions.push({ ...partition, sha256: await hashRange(handle, partition.offset, partition.bytes) });
    }
    return { schema: 'axiom-host-h1-partition-hashes.v1', disk_bytes: disk.bytes, partitions };
  } finally {
    await handle.close();
  }
}

async function exportPartition(rawPath, name, outputPath) {
  const disk = await inspectH1Disk(rawPath);
  const partition = requirePartition(disk, name);
  const source = await open(rawPath, 'r');
  const target = await open(outputPath, 'w', 0o600);
  try {
    await copyRange(source, target, partition.offset, 0, partition.bytes);
  } finally {
    await source.close();
    await target.close();
  }
  return { action: 'export', partition, output: outputPath };
}

async function importPartition(partitionPath, rawPath, name) {
  const disk = await inspectH1Disk(rawPath);
  const partition = requirePartition(disk, name);
  const input = await stat(partitionPath);
  if (!input.isFile() || input.size !== partition.bytes) {
    throw new ValidationError(`AXIOM Host H1 partition import size must equal ${partition.bytes}`);
  }
  const source = await open(partitionPath, 'r');
  const target = await open(rawPath, 'r+');
  try {
    await copyRange(source, target, 0, partition.offset, partition.bytes);
  } finally {
    await source.close();
    await target.close();
  }
  return { action: 'import', partition, input: partitionPath };
}

async function corruptPartition(sourcePath, outputPath, name) {
  await copyFile(sourcePath, outputPath);
  const disk = await inspectH1Disk(outputPath);
  const partition = requirePartition(disk, name);
  const handle = await open(outputPath, 'r+');
  try {
    const pattern = Buffer.alloc(Math.min(COPY_BYTES, partition.bytes), 0xa5);
    let written = 0;
    while (written < partition.bytes) {
      const bytes = Math.min(pattern.length, partition.bytes - written);
      await handle.write(pattern, 0, bytes, partition.offset + written);
      written += bytes;
    }
  } finally {
    await handle.close();
  }
  return { action: 'corrupt', partition, pattern: '0xa5', bytes_overwritten: partition.bytes, output: outputPath };
}

function requirePartition(disk, name) {
  const matches = disk.partitions.filter(partition => partition.name === name);
  if (matches.length !== 1) throw new ValidationError(`AXIOM Host H1 expected exactly one GPT partition named ${name}`);
  return matches[0];
}

async function copyRange(source, target, sourceOffset, targetOffset, bytes) {
  const buffer = Buffer.alloc(Math.min(COPY_BYTES, bytes));
  let copied = 0;
  while (copied < bytes) {
    const length = Math.min(buffer.length, bytes - copied);
    const { bytesRead } = await source.read(buffer, 0, length, sourceOffset + copied);
    if (bytesRead !== length) throw new ValidationError('AXIOM Host H1 partition copy ended early');
    await target.write(buffer, 0, length, targetOffset + copied);
    copied += length;
  }
}

async function hashRange(handle, offset, bytes) {
  const hash = createHash('sha256');
  const buffer = Buffer.alloc(Math.min(COPY_BYTES, bytes));
  let consumed = 0;
  while (consumed < bytes) {
    const length = Math.min(buffer.length, bytes - consumed);
    const { bytesRead } = await handle.read(buffer, 0, length, offset + consumed);
    if (bytesRead !== length) throw new ValidationError('AXIOM Host H1 partition hash ended early');
    hash.update(buffer.subarray(0, bytesRead));
    consumed += bytesRead;
  }
  return hash.digest('hex');
}

async function readExact(handle, buffer, position) {
  const { bytesRead } = await handle.read(buffer, 0, buffer.length, position);
  if (bytesRead !== buffer.length) throw new ValidationError('AXIOM Host H1 GPT read ended early');
}

function decodeUtf16(value) {
  const text = value.toString('utf16le');
  const end = text.indexOf('\0');
  return (end < 0 ? text : text.slice(0, end)).trim();
}

function formatGuid(value) {
  const a = Buffer.from(value.subarray(0, 4)).reverse().toString('hex');
  const b = Buffer.from(value.subarray(4, 6)).reverse().toString('hex');
  const c = Buffer.from(value.subarray(6, 8)).reverse().toString('hex');
  return `${a}-${b}-${c}-${value.subarray(8, 10).toString('hex')}-${value.subarray(10, 16).toString('hex')}`;
}

async function main() {
  const [command, ...args] = process.argv.slice(2);
  let result;
  if (command === 'inspect' && args.length === 1) result = await inspectH1Disk(args[0]);
  else if (command === 'hash' && args.length === 1) result = await hashH1Partitions(args[0]);
  else if (command === 'export' && args.length === 3) result = await exportPartition(args[0], args[1], args[2]);
  else if (command === 'import' && args.length === 3) result = await importPartition(args[0], args[1], args[2]);
  else if (command === 'corrupt' && args.length === 3) result = await corruptPartition(args[0], args[1], args[2]);
  else throw new ValidationError('Usage: axiom-host-h1-disk.mjs inspect RAW | hash RAW | export RAW NAME OUT | import PARTITION RAW NAME | corrupt RAW_IN RAW_OUT NAME');
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
