import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { diagnoseGptImage } from '../src/axiom-host-image-diagnostics.mjs';

const SECTOR = 512;
const SECTORS = 4096;
const ENTRY_SIZE = 128;
const ENTRY_COUNT = 4;

test('H0 GPT diagnostics bind disk geometry and partition byte ranges', async () => {
  const root = await mkdtemp(join(tmpdir(), 'axiom-host-gpt-'));
  try {
    const path = join(root, 'image.raw');
    const image = syntheticGptImage();
    await writeFile(path, image);

    const first = await diagnoseGptImage(path);
    assert.equal(first.disk_bytes, SECTOR * SECTORS);
    assert.equal(first.sector_size, SECTOR);
    assert.equal(first.primary_gpt_header.current_lba, 1);
    assert.equal(first.primary_gpt_header.backup_lba, SECTORS - 1);
    assert.equal(first.primary_gpt_header.partition_entry_count, ENTRY_COUNT);
    assert.equal(first.partitions.length, 2);
    assert.equal(first.partitions[0].name, 'ESP');
    assert.equal(first.partitions[1].name, 'root');
    assert.equal(first.partitions[0].bytes, 512 * SECTOR);
    assert.equal(first.partitions[1].bytes, 1024 * SECTOR);
    assert.match(first.disk_sha256, /^[a-f0-9]{64}$/);
    assert.match(first.partition_entries_sha256, /^[a-f0-9]{64}$/);

    image[2048 * SECTOR + 17] ^= 0xff;
    await writeFile(path, image);
    const changed = await diagnoseGptImage(path);
    assert.notEqual(changed.disk_sha256, first.disk_sha256);
    assert.notEqual(changed.partitions[0].sha256, first.partitions[0].sha256);
    assert.equal(changed.partitions[1].sha256, first.partitions[1].sha256);
    assert.equal(changed.primary_gpt_header.sha256, first.primary_gpt_header.sha256);
    assert.equal(changed.partition_entries_sha256, first.partition_entries_sha256);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('H0 GPT diagnostics reject non-GPT input', async () => {
  const root = await mkdtemp(join(tmpdir(), 'axiom-host-not-gpt-'));
  try {
    const path = join(root, 'image.raw');
    await writeFile(path, Buffer.alloc(64 * 1024));
    await assert.rejects(
      diagnoseGptImage(path),
      /does not expose a GPT header/
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

function syntheticGptImage() {
  const image = Buffer.alloc(SECTOR * SECTORS);
  image[510] = 0x55;
  image[511] = 0xaa;

  const header = image.subarray(SECTOR, SECTOR * 2);
  Buffer.from('EFI PART', 'ascii').copy(header, 0);
  header.writeUInt32LE(0x00010000, 8);
  header.writeUInt32LE(92, 12);
  header.writeUInt32LE(0x12345678, 16);
  header.writeBigUInt64LE(1n, 24);
  header.writeBigUInt64LE(BigInt(SECTORS - 1), 32);
  header.writeBigUInt64LE(34n, 40);
  header.writeBigUInt64LE(BigInt(SECTORS - 34), 48);
  Buffer.from('00112233445566778899aabbccddeeff', 'hex').copy(header, 56);
  header.writeBigUInt64LE(2n, 72);
  header.writeUInt32LE(ENTRY_COUNT, 80);
  header.writeUInt32LE(ENTRY_SIZE, 84);
  header.writeUInt32LE(0x87654321, 88);

  const entries = image.subarray(SECTOR * 2, SECTOR * 3);
  writePartition(entries.subarray(0, ENTRY_SIZE), {
    type: '11223344556677889900aabbccddeeff',
    unique: 'ffeeddccbbaa00998877665544332211',
    first: 2048,
    last: 2559,
    name: 'ESP'
  });
  writePartition(entries.subarray(ENTRY_SIZE, ENTRY_SIZE * 2), {
    type: 'aabbccddeeff00112233445566778899',
    unique: '0123456789abcdeffedcba9876543210',
    first: 2560,
    last: 3583,
    name: 'root'
  });

  image.fill(0x11, 2048 * SECTOR, 2560 * SECTOR);
  image.fill(0x22, 2560 * SECTOR, 3584 * SECTOR);

  const backup = image.subarray((SECTORS - 1) * SECTOR, SECTORS * SECTOR);
  Buffer.from('EFI PART', 'ascii').copy(backup, 0);
  backup.writeUInt32LE(0x00010000, 8);
  backup.writeUInt32LE(92, 12);
  return image;
}

function writePartition(entry, { type, unique, first, last, name }) {
  Buffer.from(type, 'hex').copy(entry, 0);
  Buffer.from(unique, 'hex').copy(entry, 16);
  entry.writeBigUInt64LE(BigInt(first), 32);
  entry.writeBigUInt64LE(BigInt(last), 40);
  entry.writeBigUInt64LE(0n, 48);
  Buffer.from(name, 'utf16le').copy(entry, 56);
}
