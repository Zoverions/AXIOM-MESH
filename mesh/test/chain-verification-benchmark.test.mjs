import assert from 'node:assert/strict';
import test from 'node:test';

import {
  runChainVerificationBenchmark,
  verifyChainVerificationBenchmarkEvidence
} from '../src/chain-verification-benchmark.mjs';

test('chain verification benchmark emits signed comparable process evidence', async () => {
  const evidence = await runChainVerificationBenchmark({
    eventCount: 1_200,
    batchSize: 100,
    checkpointInterval: 500,
    sourceRevision: 'a'.repeat(40),
    generatedAt: '2026-07-30T17:00:00.000Z'
  });
  assert.equal(evidence.status, 'passed');
  assert.equal(evidence.fixture.events, 1_200);
  assert.equal(evidence.measurements.full.verification.verified_events, 1_200);
  assert.ok(evidence.measurements.checkpoint.verification.verified_events < 500);
  assert.equal(evidence.comparison.checkpoint_suffix_bounded, true);
  assert.equal(evidence.comparison.heads_identical, true);
  assert.equal(verifyChainVerificationBenchmarkEvidence(evidence).valid, true);
  assert.doesNotMatch(JSON.stringify(evidence), /PRIVATE KEY/);

  const tampered = structuredClone(evidence);
  tampered.measurements.checkpoint.verification.head = 'f'.repeat(64);
  assert.throws(
    () => verifyChainVerificationBenchmarkEvidence(tampered),
    /evidence is invalid|attestation is invalid/
  );
});
