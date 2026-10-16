import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('challenge idempotency contract remains unwired and mints no runtime authority', async () => {
  const source = await readFile(new URL('../src/grid/circle-possession-challenge-idempotency.mjs', import.meta.url), 'utf8');
  const gridServer = await readFile(new URL('../src/grid/server.mjs', import.meta.url), 'utf8');
  const hypervisorServer = await readFile(new URL('../src/hypervisor/server.mjs', import.meta.url), 'utf8');
  const gatewayServer = await readFile(new URL('../src/gateway/server.mjs', import.meta.url), 'utf8');

  for (const server of [gridServer, hypervisorServer, gatewayServer]) {
    assert.doesNotMatch(server, /circle-possession-challenge-idempotency\.mjs/);
    assert.doesNotMatch(server, /assessCirclePossessionBoundGrantReissue/);
  }
  assert.doesNotMatch(source, /runtime_authority:\s*true/);
  assert.doesNotMatch(source, /external_effect_authority:\s*true/);
});

test('same-request idempotency remains anchored to parent deterministic event and retained-event trace mismatch', async () => {
  const idempotency = await readFile(new URL('../src/grid/circle-possession-challenge-idempotency.mjs', import.meta.url), 'utf8');
  const parent = await readFile(new URL('../src/grid/circle-possession-bound-atomic-admission.mjs', import.meta.url), 'utf8');
  const policy = JSON.parse(await readFile(new URL('../config/circle-possession-challenge-idempotency.v0.json', import.meta.url), 'utf8'));

  assert.match(idempotency, /same_request_reissue_may_not_change_target_event/);
  assert.match(idempotency, /retained_event_different_capability_replay:\s*'reject-trace-mismatch'/);
  assert.match(parent, /gridEvent\.trace_id !== traceId/);
  assert.match(parent, /circle_possession_bound_replay_mismatch/);
  assert.equal(policy.requirements.circle_event_id_deterministic_and_content_bound, true);
  assert.equal(policy.requirements.first_successful_grid_admission_is_single_state_transition, true);
  assert.equal(policy.requirements.later_different_capability_replay_of_retained_event_rejected, true);
  assert.equal(policy.requirements.external_effects_may_inherit_policy, false);
  assert.equal(policy.requirements.non_deterministic_effects_may_inherit_policy, false);
});
