import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { sha256 } from '../src/lib/canonical.mjs';
import {
  assertEmptyAxiomHostOutput,
  inventoryAxiomHostArtifacts,
  verifyAxiomHostArtifactInventory
} from '../src/axiom-host-artifact-inventory.mjs';

test('AXIOM Host H0 artifact inventory binds exact sorted bytes including nested mkosi output', async () => {
  const root = await mkdtemp(join(tmpdir(), 'axiom-host-artifacts-'));
  try {
    await writeFile(join(root, 'z.raw'), Buffer.from('image-bytes'));
    await writeFile(join(root, 'a.sha256'), Buffer.from('checksum-bytes'));
    await mkdir(join(root, 'axiom-host-lab_0.1.0-h0'));
    await writeFile(
      join(root, 'axiom-host-lab_0.1.0-h0', 'manifest.json'),
      Buffer.from('nested-manifest')
    );

    const first = await inventoryAxiomHostArtifacts(root);
    const second = await inventoryAxiomHostArtifacts(root);
    assert.deepEqual(first, second);
    assert.deepEqual(first.inventory.map(item => item.name), [
      'a.sha256',
      'axiom-host-lab_0.1.0-h0/manifest.json',
      'z.raw'
    ]);
    assert.equal(first.inventory[0].bytes, 14);
    assert.equal(first.inventory[1].bytes, 15);
    assert.equal(first.inventory[2].bytes, 11);
    assert.match(first.digest, /^[a-f0-9]{64}$/);
    assert.equal(verifyAxiomHostArtifactInventory(first.inventory), true);

    await writeFile(join(root, 'z.raw'), Buffer.from('changed-image-bytes'));
    const changed = await inventoryAxiomHostArtifacts(root);
    assert.notEqual(changed.digest, first.digest);
    assert.notEqual(changed.inventory[2].sha256, first.inventory[2].sha256);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('H0 output accepts only bounded internal symlink aliases and binds their exact targets', async () => {
  const root = await mkdtemp(join(tmpdir(), 'axiom-host-output-'));
  try {
    assert.equal(await assertEmptyAxiomHostOutput(root), true);
    await writeFile(join(root, 'stale.raw'), 'stale');
    await assert.rejects(
      assertEmptyAxiomHostOutput(root),
      /must be empty before build/
    );

    await rm(join(root, 'stale.raw'));
    await mkdir(join(root, 'nested'));
    await writeFile(join(root, 'nested', 'payload.raw'), 'payload');
    await symlink('nested/payload.raw', join(root, 'linked.raw'));

    const inventory = await inventoryAxiomHostArtifacts(root);
    assert.deepEqual(inventory.inventory.map(item => item.name), [
      'linked.raw',
      'nested/payload.raw'
    ]);
    assert.equal(inventory.inventory[0].link_target, 'nested/payload.raw');
    assert.equal(inventory.inventory[0].bytes, Buffer.byteLength('nested/payload.raw'));
    assert.equal(
      inventory.inventory[0].sha256,
      sha256(Buffer.from('nested/payload.raw', 'utf8'))
    );

    await rm(join(root, 'linked.raw'));
    await symlink('../escape.raw', join(root, 'linked.raw'));
    await assert.rejects(
      inventoryAxiomHostArtifacts(root),
      /symlink escapes or has an invalid target/
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('artifact inventory verification rejects duplicate, unsorted, forged, and unsafe paths', () => {
  const a = { name: 'a.raw', bytes: 1, sha256: 'a'.repeat(64) };
  const b = { name: 'nested/b.raw', bytes: 2, sha256: 'b'.repeat(64) };
  assert.equal(verifyAxiomHostArtifactInventory([a, b]), true);
  assert.throws(
    () => verifyAxiomHostArtifactInventory([b, a]),
    /strictly name-sorted/
  );
  assert.throws(
    () => verifyAxiomHostArtifactInventory([a, a]),
    /repeats a.raw/
  );
  assert.throws(
    () => verifyAxiomHostArtifactInventory([{ ...a, sha256: 'not-a-digest' }]),
    /invalid entry/
  );
  assert.throws(
    () => verifyAxiomHostArtifactInventory([{ ...a, name: '../escape.raw' }]),
    /invalid entry/
  );

  const linkTarget = 'versioned/image.raw';
  const link = {
    name: 'image.raw',
    bytes: Buffer.byteLength(linkTarget),
    sha256: sha256(Buffer.from(linkTarget, 'utf8')),
    link_target: linkTarget
  };
  assert.equal(verifyAxiomHostArtifactInventory([link]), true);
  assert.throws(
    () => verifyAxiomHostArtifactInventory([{ ...link, sha256: 'f'.repeat(64) }]),
    /symlink digest does not match/
  );
});
