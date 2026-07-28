import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { loadTelemetryRoutingPolicy } from '../src/telemetry-relay.mjs';
import {
  runTelemetryRelayDrill,
  verifyTelemetryRelayEvidence
} from '../src/telemetry-relay-drill.mjs';

test('telemetry relay drill proves least privilege, retry, receipts, and redaction', {
  skip: process.platform === 'win32'
}, async t => {
  const root = await mkdtemp(join(tmpdir(), 'axiom-telemetry-relay-drill-'));
  const workspace = join(root, 'workspace');
  t.after(() => rm(root, { recursive: true, force: true }));
  const policy = await loadTelemetryRoutingPolicy();
  const evidence = await runTelemetryRelayDrill({
    workspaceDir: workspace,
    sourceRevision: 'a'.repeat(40),
    generatedAt: '2026-07-28T22:30:00.000Z',
    policy
  });
  assert.equal(evidence.status, 'passed');
  assert.equal(evidence.collection.services, 4);
  assert.equal(evidence.collection.metric_points, 68);
  assert.equal(evidence.delivery.transient_retries, 2);
  assert.equal(evidence.delivery.successful_deliveries, 2);
  assert.equal(evidence.delivery.receipts.length, 2);
  assert.ok(Object.values(evidence.checks).every(Boolean));
  assert.equal(verifyTelemetryRelayEvidence(evidence, policy).valid, true);

  const serialized = JSON.stringify(evidence);
  for (const name of [
    'operator.token',
    'telemetry-relay.token',
    'data-protection.key'
  ]) {
    const secret = (
      await readFile(join(workspace, 'secrets', name), 'utf8')
    ).trim();
    assert.equal(serialized.includes(secret), false);
  }
  const tampered = structuredClone(evidence);
  tampered.delivery.successful_deliveries = 3;
  assert.throws(
    () => verifyTelemetryRelayEvidence(tampered, policy),
    /delivery evidence/
  );
  await assert.rejects(
    () => runTelemetryRelayDrill({ workspaceDir: workspace, policy }),
    /workspace must be empty/
  );
});
