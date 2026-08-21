import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  getCirclePossessionChallengeIdempotencyPolicy,
  validateCirclePossessionChallengeIdempotencyPolicy
} from '../src/grid/circle-possession-challenge-idempotency.mjs';

test('same-request idempotency does not claim challenge reuse was observed or consumed', async () => {
  const policy = getCirclePossessionChallengeIdempotencyPolicy();
  assert.equal(validateCirclePossessionChallengeIdempotencyPolicy(policy), true);
  assert.equal(policy.requirements.durable_challenge_consumption_required, false);
  assert.equal(policy.requirements.challenge_single_use_required_for_v0_state_safety, false);
  assert.ok(policy.non_claims.includes('challenge-single-use'));

  const source = await readFile(
    new URL('../src/grid/circle-possession-challenge-idempotency.mjs', import.meta.url),
    'utf8'
  );
  assert.doesNotMatch(source, /challenge_reuse_observed\s*:\s*true/);
  assert.doesNotMatch(source, /challenge_consumed\s*:\s*true/);
  assert.doesNotMatch(source, /single_use_verified\s*:\s*true/);
  assert.doesNotMatch(source, /consumed_challenge_ledger/);
});

test('idempotency assessment remains grant-equivalence evidence rather than replay telemetry', async () => {
  const source = await readFile(
    new URL('../src/grid/circle-possession-challenge-idempotency.mjs', import.meta.url),
    'utf8'
  );
  assert.match(source, /first_capability_digest/);
  assert.match(source, /second_capability_digest/);
  assert.match(source, /same_exact_prepared_request:\s*true/);
  assert.match(source, /deterministic_target_event:\s*true/);
  assert.match(source, /retained_event_different_capability_replay:\s*'reject-trace-mismatch'/);
  assert.doesNotMatch(source, /challenge_observation_count/);
  assert.doesNotMatch(source, /challenge_first_observed_at/);
  assert.doesNotMatch(source, /challenge_last_observed_at/);
});
