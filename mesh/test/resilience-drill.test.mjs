import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import {
  loadResilienceDrillPolicy,
  runResilienceDrill,
  validateResilienceDrillPolicy,
  verifyResilienceDrillEvidence
} from '../src/resilience-drill.mjs';

const REVISION = 'c'.repeat(40);

test('resilience policy fixes bounded request pressure and dependency fault scope', async () => {
  const policy = await loadResilienceDrillPolicy();
  const verification = validateResilienceDrillPolicy(policy);
  assert.equal(verification.valid, true);
  assert.equal(verification.burst_requests, 24);
  assert.equal(verification.dependency, 'sandbox');

  const weakened = structuredClone(policy);
  weakened.request_pressure.max_body_bytes = 1_048_576;
  assert.throws(
    () => validateResilienceDrillPolicy(weakened),
    /invalid or weakened/
  );
});

test(
  'resilience drill proves request bounds, dependency degradation, fail-closed exit, and recovery',
  { skip: process.platform === 'win32' },
  async t => {
    const root = await mkdtemp(join(tmpdir(), 'axiom-resilience-drill-'));
    const workspace = join(root, 'workspace');
    t.after(() => rm(root, { recursive: true, force: true }));

    const evidence = await runResilienceDrill({
      workspaceDir: workspace,
      sourceRevision: REVISION,
      generatedAt: '2026-07-29T05:00:00.000Z'
    });
    const verification = verifyResilienceDrillEvidence(evidence);
    assert.equal(verification.valid, true);
    assert.equal(verification.source_revision, REVISION);
    assert.equal(evidence.request_pressure.oversized_status, 413);
    assert.ok(evidence.request_pressure.burst.rate_limited > 0);
    assert.equal(evidence.dependency_loss.readiness_status, 503);
    assert.equal(evidence.dependency_loss.supervisor_exit_code, 1);
    assert.equal(evidence.dependency_loss.gateway_after_exit_status, 0);
    assert.equal(evidence.recovery.persisted_intent_status, 200);
    assert.equal(evidence.recovery.post_restart_intent_status, 200);
    assert.ok(Object.values(evidence.checks).every(Boolean));

    const serialized = JSON.stringify(evidence);
    const dataKey = (
      await readFile(join(workspace, 'secrets', 'data-protection.key'), 'utf8')
    ).trim();
    const operatorToken = (
      await readFile(join(workspace, 'secrets', 'operator.token'), 'utf8')
    ).trim();
    const privateKey = await readFile(
      join(workspace, 'data', 'identities', 'grid', 'private.pem'),
      'utf8'
    );
    assert.equal(serialized.includes(dataKey), false);
    assert.equal(serialized.includes(operatorToken), false);
    assert.equal(serialized.includes(privateKey), false);

    const tampered = structuredClone(evidence);
    tampered.dependency_loss.readiness_status = 200;
    assert.throws(
      () => verifyResilienceDrillEvidence(tampered),
      /dependency-loss/
    );
    await assert.rejects(
      () => runResilienceDrill({ workspaceDir: workspace }),
      /workspace must be empty/
    );
  }
);
