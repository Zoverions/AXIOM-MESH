import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { digestObject } from '../src/lib/canonical.mjs';
import {
  assessCircleGridPersistenceReplay,
  validateCircleGridPersistenceCandidate
} from '../../packages/axiom-circle-grid-persistence/index.mjs';

const policyUrl = new URL('../config/circle-grid-persistence.v0.json', import.meta.url);

async function loadPolicy() {
  return JSON.parse(await readFile(policyUrl, 'utf8'));
}

function candidateFixture(policy) {
  const recordDigest = 'a'.repeat(64);
  const governingCharterDigest = 'b'.repeat(64);
  const historicalPolicyDigest = 'c'.repeat(64);
  const charterPolicyDigest = 'd'.repeat(64);
  const historicalPrefixDigest = 'e'.repeat(64);
  const charterPrefixDigest = 'f'.repeat(64);
  const binding = {
    schema: 'axiom-circle-historical-rule-binding.v0',
    binding_id: 'binding.grid.hardening',
    circle_id: 'circle.grid.hardening',
    record_type: 'invitation',
    record_id: 'invite.grid.hardening',
    record_digest: recordDigest,
    record: { opaque_snapshot: true },
    event_time: '2026-08-20T12:10:00.000Z',
    bound_at: '2026-08-20T12:11:00.000Z',
    previous_binding_digest: null,
    basis_binding_id: null,
    binding_mode: 'resolve-at-event',
    governing_charter_digest: governingCharterDigest,
    authority_effect: 'none',
    network_effect: 'none',
    runtime_activation: false
  };
  const bindingDigest = digestObject(binding);
  const policyDigest = digestObject(policy);
  const eventIdentityDigest = digestObject({
    schema: 'axiom-circle-grid-persistence-event-identity.v0',
    circle_id: binding.circle_id,
    binding_digest: bindingDigest
  });
  const payload = {
    schema: policy.schemas.payload,
    circle_id: binding.circle_id,
    binding_id: binding.binding_id,
    binding_digest: bindingDigest,
    binding,
    record_type: binding.record_type,
    record_id: binding.record_id,
    record_digest: binding.record_digest,
    governing_charter_digest: binding.governing_charter_digest,
    previous_circle_binding_digest: null,
    resulting_circle_head_digest: bindingDigest,
    historical_ledger_prefix_digest: historicalPrefixDigest,
    historical_ledger_prefix_length: 1,
    charter_lifecycle_prefix_digest: charterPrefixDigest,
    charter_lifecycle_prefix_length: 1,
    persistence_policy_digest: policyDigest,
    historical_policy_digest: historicalPolicyDigest,
    charter_policy_digest: charterPolicyDigest,
    runtime_authority: false,
    portable_authority: false,
    authority_effect: 'none',
    network_effect: 'none'
  };
  return {
    schema: policy.schemas.candidate,
    circle_id: binding.circle_id,
    binding_id: binding.binding_id,
    binding_digest: bindingDigest,
    expected_prior_circle_head_digest: null,
    resulting_circle_head_digest: bindingDigest,
    event: {
      event_id: `${policy.event_id_prefix}${eventIdentityDigest}`,
      kind: policy.grid_event_kind,
      subject: binding.circle_id,
      payload
    },
    payload_digest: digestObject(payload),
    policy_digest: policyDigest,
    historical_policy_digest: historicalPolicyDigest,
    charter_policy_digest: charterPolicyDigest,
    historical_ledger_prefix_digest: historicalPrefixDigest,
    charter_lifecycle_prefix_digest: charterPrefixDigest,
    runtime_activation: false,
    runtime_authority: false,
    portable_authority: false,
    authority_effect: 'none',
    network_effect: 'none'
  };
}

function refreshPayloadDigest(candidate) {
  candidate.payload_digest = digestObject(candidate.event.payload);
  return candidate;
}

test('canonical reconstructed candidate validates', async () => {
  const policy = await loadPolicy();
  const candidate = candidateFixture(policy);
  assert.equal(validateCircleGridPersistenceCandidate(policy, candidate), true);
});

test('deterministic-looking but incorrect Grid event identity is rejected', async () => {
  const policy = await loadPolicy();
  const candidate = candidateFixture(policy);
  candidate.event.event_id = `${policy.event_id_prefix}${'0'.repeat(64)}`;
  assert.throws(
    () => validateCircleGridPersistenceCandidate(policy, candidate),
    /event candidate is invalid/
  );
});

test('hidden payload extensions fail even when the payload digest is recomputed', async () => {
  const policy = await loadPolicy();
  const candidate = candidateFixture(policy);
  candidate.event.payload.shadow_authority = 'pretend';
  refreshPayloadDigest(candidate);
  assert.throws(
    () => validateCircleGridPersistenceCandidate(policy, candidate),
    /payload fields are invalid/
  );
});

test('candidate cannot substitute a self-consistent digest for the active persistence policy', async () => {
  const policy = await loadPolicy();
  const candidate = candidateFixture(policy);
  const forgedDigest = '9'.repeat(64);
  candidate.policy_digest = forgedDigest;
  candidate.event.payload.persistence_policy_digest = forgedDigest;
  refreshPayloadDigest(candidate);
  assert.throws(
    () => validateCircleGridPersistenceCandidate(policy, candidate),
    /candidate boundary is invalid/
  );
});

test('payload metadata must be derived from the embedded historical binding', async () => {
  const policy = await loadPolicy();
  const mutations = [
    payload => { payload.record_type = 'decision'; },
    payload => { payload.record_id = 'decision.forged'; },
    payload => { payload.record_digest = '8'.repeat(64); },
    payload => { payload.governing_charter_digest = '7'.repeat(64); }
  ];

  for (const mutate of mutations) {
    const candidate = candidateFixture(policy);
    mutate(candidate.event.payload);
    refreshPayloadDigest(candidate);
    assert.throws(
      () => validateCircleGridPersistenceCandidate(policy, candidate),
      /payload binding is invalid/
    );
  }
});

test('replay assessment refuses a reconstructed candidate that fails canonical validation', async () => {
  const policy = await loadPolicy();
  const candidate = candidateFixture(policy);
  candidate.event.payload.record_id = 'invite.shadow';
  refreshPayloadDigest(candidate);
  assert.throws(
    () => assessCircleGridPersistenceReplay(policy, candidate, null),
    /payload binding is invalid/
  );
});
