import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import test from 'node:test';
import { verifyAxiomHostH1Configuration } from '../src/check-axiom-host-h1.mjs';
import { inventoryH1Directory } from '../src/axiom-host-h1-disk.mjs';
import { verifyAxiomHostH1Workflow } from '../src/release.mjs';

test('AXIOM Host H1 appliance contract is immutable-root, state-separated, and non-promoting', async () => {
  const result = await verifyAxiomHostH1Configuration();
  assert.equal(result.valid, true);
  assert.equal(result.stage, 'H1');
  assert.equal(result.issue, 1053);
  assert.equal(result.firmware, 'uefi');
  assert.equal(result.boot_artifact, 'systemd-boot-with-unsigned-uki');
  assert.equal(result.root, 'read-only-ext4-dm-verity');
  assert.equal(result.durable_state, 'separate-ext4-var');
  assert.deepEqual(result.guest_checks, ['npm run setup:check', 'npm run check']);
  assert.equal(result.authority_path, 'Gateway -> Hypervisor -> Sandbox -> Grid');
  assert.equal(result.production_promoted, false);
});

test('AXIOM Host H1 rejects a mutable root and authority promotion', async () => {
  await withFixture(async fixture => {
    const mutableRoot = fixture.source.root.replace('ReadOnly=yes', 'ReadOnly=no');
    await writeFile(fixture.paths.root, mutableRoot);
    await assert.rejects(
      verifyAxiomHostH1Configuration(fixture.urls),
      /root ReadOnly must equal yes/
    );
  });

  await withFixture(async fixture => {
    const policy = JSON.parse(fixture.source.policy);
    policy.authority.host_grants_mesh_authority = true;
    await writeFile(fixture.paths.policy, `${JSON.stringify(policy, null, 2)}\n`);
    await assert.rejects(
      verifyAxiomHostH1Configuration(fixture.urls),
      /authority.host_grants_mesh_authority must equal false/
    );
  });
});

test('AXIOM Host H1 workflow is immutable and release-governed', async () => {
  const workflow = await readFile(
    new URL('../../.github/workflows/axiom-host-h1-appliance.yml', import.meta.url),
    'utf8'
  );
  const result = verifyAxiomHostH1Workflow(workflow);
  assert.equal(result.status, 'laboratory-only');
  assert.equal(result.production_promoted, false);
  assert.match(result.workflow_sha256, /^[a-f0-9]{64}$/);
  assert.throws(
    () => verifyAxiomHostH1Workflow(
      workflow.replace(
        'actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1',
        'actions/checkout@v7'
      )
    ),
    /mutable action or runner reference/
  );
});

test('AXIOM Host H1 boot-file inventory binds sorted regular-file bytes', async () => {
  const root = await mkdtemp(join(tmpdir(), 'axiom-host-h1-inventory-'));
  try {
    await mkdir(join(root, 'EFI', 'BOOT'), { recursive: true });
    await writeFile(join(root, 'EFI', 'BOOT', 'BOOTX64.EFI'), 'efi');
    await writeFile(join(root, 'seed'), 'seed');
    const inventory = await inventoryH1Directory(root);
    assert.deepEqual(inventory.files, [
      {
        path: 'EFI/BOOT/BOOTX64.EFI',
        bytes: 3,
        sha256: '2ae51aec19821f26c9e68a250f067ce569a3454302107efc48d4e3f2a48efe90'
      },
      {
        path: 'seed',
        bytes: 4,
        sha256: '19b25856e1c150ca834cffc8b59b23adbd0ec0389e58eb22b3b64768098d002b'
      }
    ]);
    assert.match(inventory.inventory_sha256, /^[a-f0-9]{64}$/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

async function withFixture(callback) {
  const sourceRoot = new URL('../../host/h1/', import.meta.url);
  const names = {
    policy: 'axiom-host-h1-policy.json',
    config: 'mkosi.conf',
    tools: 'mkosi.tools.conf',
    snapshot: 'mkosi.snapshot',
    version: 'mkosi.version',
    esp: 'mkosi.repart/00-esp.conf',
    root: 'mkosi.repart/10-root.conf',
    verity: 'mkosi.repart/20-root-verity.conf',
    state: 'mkosi.repart/30-var.conf',
    finalize: 'mkosi.finalize',
    unit: 'mkosi.extra/usr/lib/systemd/system/axiom-host-h1-check.service',
    fstab: 'mkosi.extra/etc/fstab',
    guestCheck: 'mkosi.extra/usr/libexec/axiom-host-h1-check.mjs'
  };
  const root = await mkdtemp(join(tmpdir(), 'axiom-host-h1-'));
  try {
    const source = {};
    const paths = {};
    const urls = {};
    for (const [key, name] of Object.entries(names)) {
      source[key] = await readFile(new URL(name, sourceRoot), 'utf8');
      const path = join(root, `${key}.txt`);
      await writeFile(path, source[key]);
      paths[key] = path;
      urls[key] = pathToFileURL(path);
    }
    await callback({ source, paths, urls });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}
