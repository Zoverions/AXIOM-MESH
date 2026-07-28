import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import {
  runRecoveryDrill,
  verifyRecoveryDrillEvidence
} from '../src/recovery-drill.mjs';

test('disposable production recovery drill emits signed, secret-free evidence', async t => {
  const root = await mkdtemp(join(tmpdir(), 'axiom-recovery-drill-test-'));
  const workspace = join(root, 'workspace');
  t.after(() => rm(root, { recursive: true, force: true }));

  const evidence = await runRecoveryDrill({
    workspaceDir: workspace,
    sourceRevision: 'a'.repeat(40)
  });
  assert.equal(evidence.status, 'passed');
  assert.equal(evidence.source.revision, 'a'.repeat(40));
  assert.ok(Object.values(evidence.checks).every(Boolean));
  assert.equal(evidence.recovery.recovery_point.lost, 1);
  assert.ok(evidence.recovery.rto_ms >= 0);
  assert.ok(evidence.backup.duration_ms >= 0);
  assert.ok(evidence.total_duration_ms >= evidence.recovery.rto_ms);
  assert.doesNotMatch(evidence.recovery.rollback_artifact, /^(\.\.|[A-Za-z]:|\/)/);
  assert.equal(verifyRecoveryDrillEvidence(evidence).valid, true);

  const serialized = JSON.stringify(evidence);
  const dataKey = (
    await readFile(join(workspace, 'secrets', 'data-protection.key'), 'utf8')
  ).trim();
  const operatorToken = (
    await readFile(join(workspace, 'secrets', 'operator.token'), 'utf8')
  ).trim();
  assert.doesNotMatch(serialized, new RegExp(dataKey));
  assert.doesNotMatch(serialized, new RegExp(operatorToken));

  const tampered = structuredClone(evidence);
  tampered.recovery.rto_ms += 1;
  assert.throws(
    () => verifyRecoveryDrillEvidence(tampered),
    /attestation/
  );
  await assert.rejects(
    () => runRecoveryDrill({ workspaceDir: workspace }),
    /workspace must be empty/
  );
});
