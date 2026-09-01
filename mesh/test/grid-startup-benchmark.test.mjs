import assert from 'node:assert/strict';
import test from 'node:test';

import {
  runGridStartupBenchmark,
  verifyGridStartupBenchmarkEvidence
} from '../src/grid-startup-benchmark.mjs';

test('startup benchmark emits signed evidence that the anchored restart replays nothing', async () => {
  const evidence = await runGridStartupBenchmark({
    eventCount: 1_200,
    batchSize: 32,
    checkpointInterval: 500,
    sourceRevision: 'b'.repeat(40),
    generatedAt: '2026-08-24T12:00:00.000Z'
  });
  assert.equal(evidence.status, 'passed');
  assert.equal(evidence.fixture.events, 1_200);
  assert.equal(evidence.measurements.anchored.materialization.mode, 'anchored');
  assert.equal(evidence.measurements.anchored.materialization.replayed_events, 0);
  assert.equal(evidence.measurements.anchored.protected_columns.mode, 'sampled');
  assert.equal(evidence.measurements.rebuild.materialization.mode, 'full_rebuild');
  assert.equal(evidence.measurements.rebuild.materialization.replayed_events, 1_200);
  assert.equal(evidence.comparison.logical_states_identical, true);
  assert.equal(evidence.comparison.anchored_replay_bounded, true);
  assert.equal(typeof evidence.measurements.anchored.materialized_state_storage_digest, 'string');
  assert.equal(evidence.measurements.anchored.logical_materialized_state_digest, evidence.measurements.rebuild.logical_materialized_state_digest);
  assert.equal(verifyGridStartupBenchmarkEvidence(evidence).valid, true);
  assert.doesNotMatch(JSON.stringify(evidence), /PRIVATE KEY/);

  const tampered = structuredClone(evidence);
  tampered.measurements.anchored.materialization.replayed_events = 1_200;
  assert.throws(
    () => verifyGridStartupBenchmarkEvidence(tampered),
    /evidence is invalid|attestation is invalid/
  );

  const restated = structuredClone(evidence);
  restated.measurements.anchored.wall_time_ms = 0.001;
  assert.throws(
    () => verifyGridStartupBenchmarkEvidence(restated),
    /attestation is invalid/
  );
});

test('startup benchmark rejects fixture batches larger than the Grid commit boundary', async () => {
  await assert.rejects(
    () => runGridStartupBenchmark({ eventCount: 100, batchSize: 33, checkpointInterval: 50 }),
    /batch size must be an integer between 1 and 32/
  );
});
