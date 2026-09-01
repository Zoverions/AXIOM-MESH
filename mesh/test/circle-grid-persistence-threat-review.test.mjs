import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const reviewUrl = new URL('../config/circle-grid-persistence-threat-review.v0.json', import.meta.url);

async function loadReview() {
  return JSON.parse(await readFile(reviewUrl, 'utf8'));
}

const EXPECTED_THREATS = new Set([
  'deterministic-event-id-substitution',
  'hidden-payload-extension-or-metadata-substitution',
  'persistence-policy-digest-substitution',
  'stale-or-skipped-circle-head',
  'exact-replay-versus-conflicting-event-reuse',
  'retry-instability-after-history-extension',
  'request-replay-guard-misrepresented-as-durable-idempotency',
  'parallel-circle-database-or-ledger-fork',
  'grid-receipt-evidence-laundering',
  'persistence-reinterpreted-as-governance-authority',
  'runtime-integration-overclaim'
]);

test('Circle Grid persistence threat review is exact-scope and inert', async () => {
  const review = await loadReview();
  assert.equal(review.schema, 'axiom-circle-grid-persistence-threat-review.v0');
  assert.equal(review.version, 0);
  assert.equal(review.status, 'inert-grid-persistence-threat-review');
  assert.equal(review.runtime_activation, false);
  assert.equal(review.authority_effect, 'none');
  assert.equal(review.network_effect, 'none');
  assert.equal(
    review.scope,
    'circle-historical-binding-to-existing-grid-event-chain-admission-contract-only'
  );
  const ids = new Set(review.threats.map(threat => threat.id));
  assert.equal(ids.size, EXPECTED_THREATS.size);
  for (const id of EXPECTED_THREATS) assert.ok(ids.has(id), `missing threat ${id}`);
});

test('every persistence threat has multiple mitigations and a meaningful residual limit', async () => {
  const review = await loadReview();
  for (const threat of review.threats) {
    assert.ok(Array.isArray(threat.mitigations));
    assert.ok(threat.mitigations.length >= 2, `${threat.id} has insufficient mitigations`);
    assert.equal(new Set(threat.mitigations).size, threat.mitigations.length);
    assert.equal(typeof threat.residual_limit, 'string');
    assert.ok(threat.residual_limit.length >= 80, `${threat.id} residual limit is too weak`);
  }
});

test('durable identity is not confused with request ReplayGuard freshness', async () => {
  const review = await loadReview();
  const replayGuard = review.threats.find(
    threat => threat.id === 'request-replay-guard-misrepresented-as-durable-idempotency'
  );
  assert.ok(replayGuard.mitigations.includes('request-replay-guard-counts-as-durable-persistence-false'));
  assert.ok(replayGuard.mitigations.includes('deterministic-grid-event-id-used-for-durable-identity'));
  assert.equal(review.non_claims.request_replay_guard_is_durable_idempotency, false);
});

test('Grid persistence does not create a second storage authority or governance authority', async () => {
  const review = await loadReview();
  const parallel = review.threats.find(
    threat => threat.id === 'parallel-circle-database-or-ledger-fork'
  );
  const authority = review.threats.find(
    threat => threat.id === 'persistence-reinterpreted-as-governance-authority'
  );
  assert.ok(parallel.mitigations.includes('separate-circle-database-created-false'));
  assert.ok(parallel.mitigations.includes('global-grid-chain-is-reused'));
  assert.match(authority.residual_limit, /does not prove consent, quorum, legitimacy/);
  assert.equal(review.non_claims.separate_circle_database_exists, false);
  assert.equal(review.non_claims.runtime_authority_granted, false);
  assert.equal(review.non_claims.portable_authority_granted, false);
  assert.equal(review.non_claims.distributed_consensus_enabled, false);
});

test('live promotion blockers require atomic Grid state, internal verification, and recovery coverage', async () => {
  const review = await loadReview();
  for (const blocker of [
    'grid-internal-circle-event-preflight',
    'durable-circle-head-lookup-or-projection',
    'atomic-expected-head-compare-and-set-with-grid-append',
    'durable-event-id-replay-and-conflict-lookup',
    'receipt-built-from-grid-internal-chain-verification-not-caller-supplied-evidence',
    'crash-restart-and-concurrent-writer-tests',
    'backup-restore-and-chain-checkpoint-recovery-tests'
  ]) {
    assert.ok(review.promotion_blockers.includes(blocker), `missing blocker ${blocker}`);
  }
  assert.equal(review.non_claims.circle_persistence_is_live, false);
});
