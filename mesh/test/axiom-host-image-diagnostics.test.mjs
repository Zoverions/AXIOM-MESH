import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import {
  diagnoseGptImage,
  HOST_IMAGE_DIAGNOSTIC_SCHEMA
} from '../src/axiom-host-image-diagnostics.mjs';
import { exportDiagnosticSlices } from '../src/axiom-host-image-slices.mjs';
import { canonicalJson, sha256 } from '../src/lib/canonical.mjs';

const SECTOR = 512;
const SECTORS = 4096;
const ENTRY_SIZE = 128;
const ENTRY_COUNT = 4;

test('H0 GPT diagnostics bind disk, filesystem headers, chunks, and partition byte ranges', async () => {
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
    assert.equal(first.partitions[0].chunks.length, 1);
    assert.equal(first.partitions[1].chunks.length, 1);
    assert.match(first.disk_sha256, /^[a-f0-9]{64}$/);
    assert.match(first.partition_entries_sha256, /^[a-f0-9]{64}$/);

    assert.equal(first.partitions[0].filesystem.kind, 'fat32');
    assert.equal(first.partitions[0].filesystem.volume_id, '0x1234abcd');
    assert.equal(first.partitions[0].filesystem.volume_label, 'AXIOMH0');
    assert.equal(first.partitions[0].filesystem.fsinfo_sector, 1);
    assert.equal(first.partitions[0].filesystem.backup_boot_sector, 6);
    assert.equal(first.partitions[0].filesystem.backup_matches_primary_boot_sector, true);
    assert.equal(first.partitions[0].filesystem.volume_label_entry.name, 'AXIOMH0');
    assert.equal(first.partitions[0].filesystem.volume_label_entry.creation.time_raw, '0x4b5a');
    assert.equal(first.partitions[0].filesystem.volume_label_entry.creation.date_raw, '0x466e');
    assert.match(first.partitions[0].filesystem.fsinfo_sha256, /^[a-f0-9]{64}$/);

    assert.equal(first.partitions[1].filesystem.kind, 'ext4');
    assert.equal(first.partitions[1].filesystem.magic, '0xef53');
    assert.equal(first.partitions[1].filesystem.uuid, '00112233-4455-6677-8899-aabbccddeeff');
    assert.equal(first.partitions[1].filesystem.volume_name, 'axiom-root');
    assert.equal(first.partitions[1].filesystem.block_size, 4096);
    assert.equal(first.partitions[1].filesystem.has_journal, false);
    assert.equal(first.partitions[1].filesystem.mkfs_time.unix_seconds, 1_786_500_000);
    assert.match(first.partitions[1].filesystem.superblock_sha256, /^[a-f0-9]{64}$/);

    image[2048 * SECTOR + 8192] ^= 0xff;
    await writeFile(path, image);
    const changed = await diagnoseGptImage(path);
    assert.notEqual(changed.disk_sha256, first.disk_sha256);
    assert.notEqual(changed.partitions[0].sha256, first.partitions[0].sha256);
    assert.notEqual(changed.partitions[0].chunks[0].sha256, first.partitions[0].chunks[0].sha256);
    assert.equal(changed.partitions[0].filesystem.boot_sector_sha256, first.partitions[0].filesystem.boot_sector_sha256);
    assert.equal(changed.partitions[1].sha256, first.partitions[1].sha256);
    assert.equal(changed.partitions[1].filesystem.superblock_sha256, first.partitions[1].filesystem.superblock_sha256);
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

test('H0 diagnostic slice export is bounded by the digest-bound diagnostic chunk map', async () => {
  const root = await mkdtemp(join(tmpdir(), 'axiom-host-gpt-slices-'));
  try {
    const path = join(root, 'image.raw');
    await writeFile(path, syntheticGptImage());
    const image = await diagnoseGptImage(path);
    const unsigned = {
      schema: HOST_IMAGE_DIAGNOSTIC_SCHEMA,
      status: 'diagnostic-only',
      source: { revision: 'a'.repeat(40), tree: 'b'.repeat(40), source_date_epoch: 1_786_500_000 },
      configuration: {},
      image,
      controls: {
        raw_image_bound_to_build_evidence: true,
        diagnostic_only: true,
        production_promoted: false
      },
      interpretation: 'test fixture'
    };
    const diagnostic = {
      ...unsigned,
      diagnostic_sha256: sha256(canonicalJson(unsigned))
    };
    const output = join(root, 'slices');
    const result = await exportDiagnosticSlices(path, diagnostic, output, ['ESP:0', 'root:0']);

    assert.equal(result.slices.length, 2);
    assert.equal(result.slices[0].sha256, image.partitions[0].chunks[0].sha256);
    assert.equal(result.slices[1].sha256, image.partitions[1].chunks[0].sha256);
    assert.equal((await readFile(join(output, 'ESP-chunk-0.bin'))).length, 512 * SECTOR);
    assert.equal((await readFile(join(output, 'root-chunk-0.bin'))).length, 1024 * SECTOR);

    await assert.rejects(
      exportDiagnosticSlices(path, diagnostic, output, ['ESP:1']),
      /outside the recorded partition/
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
  writeFat32(image, 2048 * SECTOR, 512);
  writeExt4Superblock(image, 2560 * SECTOR);

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

function writeFat32(image, offset, totalSectors) {
  const boot = image.subarray(offset, offset + SECTOR);
  boot.fill(0);
  Buffer.from([0xeb, 0x58, 0x90]).copy(boot, 0);
  Buffer.from('MSDOS5.0', 'ascii').copy(boot, 3);
  boot.writeUInt16LE(SECTOR, 11);
  boot.writeUInt8(1, 13);
  boot.writeUInt16LE(32, 14);
  boot.writeUInt8(2, 16);
  boot.writeUInt16LE(0, 17);
  boot.writeUInt16LE(0, 19);
  boot.writeUInt8(0xf8, 21);
  boot.writeUInt16LE(0, 22);
  boot.writeUInt16LE(63, 24);
  boot.writeUInt16LE(255, 26);
  boot.writeUInt32LE(0, 28);
  boot.writeUInt32LE(totalSectors, 32);
  boot.writeUInt32LE(16, 36);
  boot.writeUInt16LE(0, 40);
  boot.writeUInt16LE(0, 42);
  boot.writeUInt32LE(2, 44);
  boot.writeUInt16LE(1, 48);
  boot.writeUInt16LE(6, 50);
  boot.writeUInt8(0x80, 64);
  boot.writeUInt8(0x29, 66);
  boot.writeUInt32LE(0x1234abcd, 67);
  Buffer.from('AXIOMH0    ', 'ascii').copy(boot, 71);
  Buffer.from('FAT32   ', 'ascii').copy(boot, 82);
  boot.writeUInt16LE(0xaa55, 510);

  const fsInfo = image.subarray(offset + SECTOR, offset + 2 * SECTOR);
  fsInfo.fill(0);
  fsInfo.writeUInt32LE(0x41615252, 0);
  fsInfo.writeUInt32LE(0x61417272, 484);
  fsInfo.writeUInt32LE(100, 488);
  fsInfo.writeUInt32LE(3, 492);
  fsInfo.writeUInt32LE(0xaa550000, 508);

  boot.copy(image, offset + 6 * SECTOR);

  const rootEntry = image.subarray(offset + 64 * SECTOR, offset + 64 * SECTOR + 32);
  rootEntry.fill(0);
  Buffer.from('AXIOMH0    ', 'ascii').copy(rootEntry, 0);
  rootEntry.writeUInt8(0x08, 11);
  rootEntry.writeUInt16LE(0x4b5a, 14);
  rootEntry.writeUInt16LE(0x466e, 16);
  rootEntry.writeUInt16LE(0x466e, 18);
  rootEntry.writeUInt16LE(0x4b5a, 22);
  rootEntry.writeUInt16LE(0x466e, 24);
}

function writeExt4Superblock(image, partitionOffset) {
  const superblock = image.subarray(
    partitionOffset + 1024,
    partitionOffset + 2048
  );
  superblock.fill(0);
  superblock.writeUInt32LE(4096, 0x00);
  superblock.writeUInt32LE(128, 0x04);
  superblock.writeUInt32LE(64, 0x0c);
  superblock.writeUInt32LE(2048, 0x10);
  superblock.writeUInt32LE(0, 0x14);
  superblock.writeUInt32LE(2, 0x18);
  superblock.writeUInt32LE(32768, 0x20);
  superblock.writeUInt32LE(4096, 0x28);
  superblock.writeUInt32LE(1_786_500_000, 0x2c);
  superblock.writeUInt32LE(1_786_500_000, 0x30);
  superblock.writeUInt16LE(0, 0x34);
  superblock.writeInt16LE(-1, 0x36);
  superblock.writeUInt16LE(0xef53, 0x38);
  superblock.writeUInt16LE(1, 0x3a);
  superblock.writeUInt16LE(1, 0x3c);
  superblock.writeUInt32LE(1_786_500_000, 0x40);
  superblock.writeUInt32LE(0, 0x44);
  superblock.writeUInt32LE(0, 0x48);
  superblock.writeUInt32LE(1, 0x4c);
  superblock.writeUInt32LE(11, 0x54);
  superblock.writeUInt16LE(256, 0x58);
  Buffer.from('00112233445566778899aabbccddeeff', 'hex').copy(superblock, 0x68);
  Buffer.from('axiom-root', 'ascii').copy(superblock, 0x78);
  superblock.writeUInt32LE(1_786_500_000, 0x108);
  superblock.writeUInt32LE(0xdeadbeef, 0x3fc);
}
