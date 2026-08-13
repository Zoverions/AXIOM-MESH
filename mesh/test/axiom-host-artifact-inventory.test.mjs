import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import {
  assertEmptyAxiomHostOutput,
  inventoryAxiomHostArtifacts,
  verifyAxiomHostArtifactInventory
} from '../src/axiom-host-artifact-inventory.mjs';

test('AXIOM Host H0 artifact inventory binds exact sorted bytes', async () => {
  const root = await mkdtemp(join(tmpdir(), 'axiom-host-artifacts-'));
  try {
    await writeFile(join(root, 'z.raw'), Buffer.from('image-bytes'));
    await writeFile(join(root, 'a.sha256'), Buffer.from('checksum-bytes'));

    const first = await inventoryAxiomHostArtifacts(root);
    const second = await inventoryAxiomHostArtifacts(root);
    assert.deepEqual(first, second);
    assert.deepEqual(first.inventory.map(item => item.name), ['a.sha256', 'z.raw']);
    assert.equal(first.inventory[0].bytes, 14);
    assert.equal(first.inventory[1].bytes, 11);
    assert.match(first.digest, /^[a-f0-9]{64}$/);
    assert.equal(verifyAxiomHostArtifactInventory(first.inventory), true);

    await writeFile(join(root, 'z.raw'), Buffer.from('changed-image-bytes'));
    const changed = await inventoryAxiomHostArtifacts(root);
    assert.notEqual(changed.digest, first.digest);
    assert.notEqual(changed.inventory[1].sha256, first.inventory[1].sha256);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('H0 output must begin empty and cannot hide nested output state', async () => {
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
    await assert.rejects(
      inventoryAxiomHostArtifacts(root),
      /unsupported non-file artifact nested/
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('artifact inventory verification rejects duplicate, unsorted, and forged entries', () => {
  const a = { name: 'a.raw', bytes: 1, sha256: 'a'.repeat(64) };
  const b = { name: 'b.raw', bytes: 2, sha256: 'b'.repeat(64) };
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
});
