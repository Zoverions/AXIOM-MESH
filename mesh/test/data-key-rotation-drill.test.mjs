import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import {
  runDataKeyRotationDrill,
  verifyDataKeyRotationDrillEvidence
} from '../src/data-key-rotation-drill.mjs';

test('real-stack data-key drill proves rotation, rejection, recovery, and rollback', async t => {
  const workspace = await mkdtemp(join(tmpdir(), 'axiom-data-key-drill-'));
  t.after(() => rm(workspace, { recursive: true, force: true }));

  const evidence = await runDataKeyRotationDrill({
    workspaceDir: workspace
  });

  assert.equal(evidence.status, 'passed');
  assert.ok(Object.values(evidence.checks).every(Boolean));
  assert.equal(evidence.rotation.data_key_changed, true);
  assert.ok(evidence.rotation.protected_values > 0);
  assert.equal(evidence.rotation.protected_artifacts, 1);
  assert.equal(evidence.recovery.restored_with_rotated_key, true);
  assert.equal(evidence.rollback.exact_original_key_restored, true);
  assert.equal(evidence.rollback.preserves_post_rotation_grid_state, true);
  assert.equal(evidence.rejection.original_key_after_rotation, true);
  assert.equal(evidence.rejection.rotated_key_after_rollback, true);
  assert.equal(verifyDataKeyRotationDrillEvidence(evidence).valid, true);

  const originalKey = (
    await readFile(join(workspace, 'retired-original-data.key'), 'utf8')
  ).trim();
  const rotatedKey = (
    await readFile(join(workspace, 'retired-rotated-data.key'), 'utf8')
  ).trim();
  const serialized = JSON.stringify(evidence);
  assert.equal(serialized.includes(originalKey), false);
  assert.equal(serialized.includes(rotatedKey), false);

  const tampered = structuredClone(evidence);
  tampered.rollback.duration_ms += 1;
  assert.throws(
    () => verifyDataKeyRotationDrillEvidence(tampered),
    /attestation/
  );
  await assert.rejects(
    () => runDataKeyRotationDrill({ workspaceDir: workspace }),
    /workspace must be empty/
  );
});
