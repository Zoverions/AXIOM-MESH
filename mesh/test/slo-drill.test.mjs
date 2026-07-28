import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import {
  BASELINE_PROFILE,
  runSloBaseline,
  verifySloBaselineEvidence
} from '../src/slo-drill.mjs';

test('production SLO drill measures load, saturation, and restart without secrets', async t => {
  const root = await mkdtemp(join(tmpdir(), 'axiom-slo-drill-test-'));
  const workspace = join(root, 'workspace');
  t.after(() => rm(root, { recursive: true, force: true }));

  const evidence = await runSloBaseline({
    workspaceDir: workspace,
    sourceRevision: 'b'.repeat(40)
  });
  assert.equal(evidence.status, 'passed');
  assert.equal(evidence.source.revision, 'b'.repeat(40));
  assert.equal(evidence.profile.measured_requests, BASELINE_PROFILE.measured_requests);
  assert.equal(evidence.results.measured_successes, BASELINE_PROFILE.measured_requests);
  assert.equal(evidence.results.error_rate, 0);
  assert.equal(evidence.results.latency.samples, BASELINE_PROFILE.measured_requests);
  assert.ok(evidence.results.latency.p95_ms <= BASELINE_PROFILE.p95_latency_ceiling_ms);
  assert.ok(evidence.capacity.gateway_max_in_flight >= 2);
  assert.equal(evidence.capacity.services.length, 4);
  assert.ok(Object.values(evidence.checks).every(Boolean));
  assert.equal(verifySloBaselineEvidence(evidence).valid, true);

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
  tampered.results.latency.p95_ms += 1;
  assert.throws(
    () => verifySloBaselineEvidence(tampered),
    /attestation/
  );
  await assert.rejects(
    () => runSloBaseline({ workspaceDir: workspace }),
    /workspace must be empty/
  );
});
