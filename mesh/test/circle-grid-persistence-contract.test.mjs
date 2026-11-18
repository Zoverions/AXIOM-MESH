import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { digestObject } from '../src/lib/canonical.mjs';
import {
  CIRCLE_CHARTER_SCHEMA,
  CIRCLE_CORE_PACKAGE_SCHEMA,
  CIRCLE_INVITATION_SCHEMA,
  CIRCLE_SCHEMA
} from '../src/lib/circle-core.mjs';
import {
  assessCircleGridPersistenceReplay,
  buildCircleGridPersistenceCandidate,
  buildCircleGridPersistenceReceipt,
  validateCircleGridPersistencePolicy
} from '../../packages/axiom-circle-grid-persistence/index.mjs';

const persistencePolicyUrl = new URL('../config/circle-grid-persistence.v0.json', import.meta.url);
const historicalPolicyUrl = new URL('../config/circle-historical-rule-binding.v0.json', import.meta.url);
const charterPolicyUrl = new URL('../config/circle-charter-lifecycle.v0.json', import.meta.url);

async function policies() {
  const [persistencePolicy, historicalPolicy, charterPolicy] = await Promise.all([
    readFile(persistencePolicyUrl, 'utf8').then(JSON.parse),
    readFile(historicalPolicyUrl, 'utf8').then(JSON.parse),
    readFile(charterPolicyUrl, 'utf8').then(JSON.parse)
  ]);
  return { persistencePolicy, historicalPolicy, charterPolicy };
}

function circleDescriptor() {
  return {
    schema: CIRCLE_SCHEMA,
    circle_id: 'circle.grid.persistence',
    name: 'Circle Grid Persistence',
    purpose: 'Exercise inert durable Grid admission semantics for Circle history.',
    created_by: 'human.alpha',
    created_at: '2026-08-20T12:00:00.000Z',
    trust_anchor_id: 'anchor.circle.grid.persistence',
    participation_model: 'voluntary',
    member_state_ownership: 'independent-node',
    policy_floor: 'raise-only',
    authority_effect: 'none',
    network_effect: 'none',
    runtime_activation: false
  };
}

function charterV1() {
  return {
    schema: CIRCLE_CHARTER_SCHEMA,
    circle_id: 'circle.grid.persistence',
    version: 1,
    effective_from: '2026-08-20T12:05:00.000Z',
    supersedes_digest: null,
    roles: [{
      role_id: 'member',
      label: 'Member',
      declared_modes: ['observe', 'deliberate', 'vote'],
      execution_authority: false
    }],
    decision_rule: {
      quorum_basis_points: 5000,
      approval_basis_points: 6000,
      abstention_counts_toward_quorum: true
    },
    appeal_enabled: true,
    member_exit_enabled: true,
    execution_authority: false,
    authority_effect: 'none'
  };
}

function charterV2() {
  const first = charterV1();
  return {
    schema: CIRCLE_CHARTER_SCHEMA,
    circle_id: 'circle.grid.persistence',
    version: 2,
    effective_from: '2026-08-20T13:00:00.000Z',
    supersedes_digest: digestObject(first),
    roles: [
      ...first.roles,
      {
        role_id: 'reviewer',
        label: 'Reviewer',
        declared_modes: ['observe', 'review'],
        execution_authority: false
      }
    ],
    decision_rule: {
      quorum_basis_points: 6000,
      approval_basis_points: 7000,
      abstention_counts_toward_quorum: true
    },
    appeal_enabled: true,
    member_exit_enabled: true,
    execution_authority: false,
    authority_effect: 'none'
  };
}

function circlePackage(activeCharter = charterV1()) {
  return {
    schema: CIRCLE_CORE_PACKAGE_SCHEMA,
    version: 0,
    status: 'inert-contract-laboratory',
    circle: circleDescriptor(),
    charter: activeCharter,
    invitations: [],
    memberships: [],
    proposals: [],
    tasks: [],
    decisions: [],
    appeals: [],
    exits: [],
    exports: [],
    authority_effect: 'none',
    network_effect: 'none',
    runtime_activation: false
  };
}

function historyEntry(charter, recordedAt, evidenceRef) {
  const charterDigest = digestObject(charter);
  return {
    schema: 'axiom-circle-charter-history-entry.v0',
    circle_id: 'circle.grid.persistence',
    charter,
    charter_digest: charterDigest,
    recorded_at: recordedAt,
    activation: {
      schema: 'axiom-circle-charter-activation.v0',
      circle_id: 'circle.grid.persistence',
      charter_digest: charterDigest,
      basis_charter_digest: charter.supersedes_digest,
      activated_at: charter.effective_from,
      evidence_refs: [evidenceRef],
      creates_runtime_authority: false,
      authority_effect: 'none',
      network_effect: 'none'
    },
    authority_effect: 'none',
    network_effect: 'none'
  };
}

function charterLifecycle({ extended = false } = {}) {
  const first = charterV1();
  const entries = [historyEntry(first, '2026-08-20T12:01:00.000Z', 'evidence:grid:charter:v1')];
  if (extended) {
    entries.push(historyEntry(
      charterV2(),
      '2026-08-20T12:50:00.000Z',
      'evidence:grid:charter:v2'
    ));
  }
  return {
    schema: 'axiom-circle-charter-lifecycle.v0',
    circle_id: 'circle.grid.persistence',
    entries,
    authority_effect: 'none',
    network_effect: 'none',
    runtime_activation: false
  };
}

function invitation({
  id,
  issuedAt,
  expiresAt,
  charterDigest
}) {
  return {
    schema: CIRCLE_INVITATION_SCHEMA,
    invitation_id: id,
    circle_id: 'circle.grid.persistence',
    invited_principal: 'human.alpha',
    membership_class: 'member',
    role_ids: ['member'],
    issued_by: 'human.alpha',
    issued_at: issuedAt,
    expires_at: expiresAt,
    charter_digest: charterDigest,
    one_use: true,
    authority_effect: 'none'
  };
}

function invitationBinding({
  id,
  record,
  boundAt,
  previous = null,
  governingCharterDigest
}) {
  return {
    schema: 'axiom-circle-historical-rule-binding.v0',
    binding_id: id,
    circle_id: 'circle.grid.persistence',
    record_type: 'invitation',
    record_id: record.invitation_id,
    record_digest: digestObject(record),
    record,
    event_time: record.issued_at,
    bound_at: boundAt,
    previous_binding_digest: previous === null ? null : digestObject(previous),
    basis_binding_id: null,
    binding_mode: 'resolve-at-event',
    governing_charter_digest: governingCharterDigest,
    authority_effect: 'none',
    network_effect: 'none',
    runtime_activation: false
  };
}

function baseLedger() {
  const v1 = digestObject(charterV1());
  const firstRecord = invitation({
    id: 'invite.grid.v1',
    issuedAt: '2026-08-20T12:10:00.000Z',
    expiresAt: '2026-08-20T12:45:00.000Z',
    charterDigest: v1
  });
  const first = invitationBinding({
    id: 'binding.grid.v1',
    record: firstRecord,
    boundAt: '2026-08-20T12:11:00.000Z',
    governingCharterDigest: v1
  });
  return {
    schema: 'axiom-circle-historical-rule-binding-ledger.v0',
    circle_id: 'circle.grid.persistence',
    bindings: [first],
    authority_effect: 'none',
    network_effect: 'none',
    runtime_activation: false
  };
}

function extendedLedger() {
  const ledger = structuredClone(baseLedger());
  const previous = ledger.bindings[0];
  const v2 = digestObject(charterV2());
  const secondRecord = invitation({
    id: 'invite.grid.v2',
    issuedAt: '2026-08-20T13:10:00.000Z',
    expiresAt: '2026-08-20T14:00:00.000Z',
    charterDigest: v2
  });
  ledger.bindings.push(invitationBinding({
    id: 'binding.grid.v2',
    record: secondRecord,
    boundAt: '2026-08-20T13:11:00.000Z',
    previous,
    governingCharterDigest: v2
  }));
  return ledger;
}

const NOW_BASE = new Date('2026-08-20T12:30:00.000Z');
const NOW_EXTENDED = new Date('2026-08-20T15:00:00.000Z');

async function candidateFor({
  ledger = baseLedger(),
  circle = circlePackage(),
  lifecycle = charterLifecycle(),
  bindingId = 'binding.grid.v1',
  expectedPriorCircleHeadDigest = null,
  now = NOW_BASE
} = {}) {
  const { persistencePolicy, historicalPolicy, charterPolicy } = await policies();
  return buildCircleGridPersistenceCandidate(
    persistencePolicy,
    historicalPolicy,
    charterPolicy,
    circle,
    lifecycle,
    ledger,
    { bindingId, expectedPriorCircleHeadDigest, now }
  );
}

function gridEventFor(candidate, overrides = {}) {
  const envelope = {
    seq: 7,
    event_id: candidate.event.event_id,
    trace_id: 'trace_circle_grid_persist_0001',
    actor: 'human.alpha',
    kind: candidate.event.kind,
    subject: candidate.event.subject,
    occurred_at: '2026-08-20T12:15:00.000Z',
    payload_digest: candidate.payload_digest,
    prev_hash: 'a'.repeat(64),
    ...overrides
  };
  return {
    ...envelope,
    event_hash: digestObject(envelope),
    signature: {
      algorithm: 'Ed25519',
      key_id: 'grid:test-key',
      digest: 'b'.repeat(64),
      signature: 'test-signature'
    }
  };
}

test('Circle Grid persistence policy stays inert and reuses the signed Grid chain', async () => {
  const { persistencePolicy } = await policies();
  assert.equal(validateCircleGridPersistencePolicy(persistencePolicy), true);
  assert.equal(persistencePolicy.runtime_activation, false);
  assert.equal(persistencePolicy.runtime_integration.live_grid_append, false);
  assert.equal(persistencePolicy.runtime_integration.grid_route, false);
  assert.equal(persistencePolicy.runtime_integration.uses_existing_signed_grid_chain, true);
  assert.equal(persistencePolicy.requirements.separate_circle_database_created, false);
  assert.equal(
    persistencePolicy.requirements.request_replay_guard_counts_as_durable_persistence,
    false
  );
});

test('candidate is deterministic, Grid-projection compatible, immutable, and non-authorizing', async () => {
  const first = await candidateFor();
  const second = await candidateFor();
  assert.deepEqual(first, second);
  assert.match(first.event.event_id, /^circle_binding_[a-f0-9]{64}$/);
  assert.deepEqual(Object.keys(first.event).sort(), ['event_id', 'kind', 'payload', 'subject']);
  assert.equal(first.event.kind, 'circle.historical.binding.persist.requested');
  assert.equal(first.event.subject, 'circle.grid.persistence');
  assert.equal(first.payload_digest, digestObject(first.event.payload));
  assert.equal(first.resulting_circle_head_digest, first.binding_digest);
  assert.equal(first.expected_prior_circle_head_digest, null);
  assert.equal(first.runtime_activation, false);
  assert.equal(first.runtime_authority, false);
  assert.equal(first.portable_authority, false);
  assert.equal(Object.isFrozen(first), true);
  assert.equal(Object.isFrozen(first.event.payload.binding), true);
});

test('retry candidate remains byte-stable after both charter and historical ledgers extend', async () => {
  const before = await candidateFor();
  const after = await candidateFor({
    ledger: extendedLedger(),
    circle: circlePackage(charterV2()),
    lifecycle: charterLifecycle({ extended: true }),
    now: NOW_EXTENDED
  });
  assert.equal(after.event.event_id, before.event.event_id);
  assert.equal(after.payload_digest, before.payload_digest);
  assert.equal(digestObject(after.event.payload), digestObject(before.event.payload));
  assert.equal(after.binding_digest, before.binding_digest);
  assert.equal(after.historical_ledger_prefix_digest, before.historical_ledger_prefix_digest);
  assert.equal(after.charter_lifecycle_prefix_digest, before.charter_lifecycle_prefix_digest);
  assert.deepEqual(after.event, before.event);
});

test('later binding requires the exact persisted predecessor as current Circle head', async () => {
  const ledger = extendedLedger();
  const firstDigest = digestObject(ledger.bindings[0]);
  const candidate = await candidateFor({
    ledger,
    circle: circlePackage(charterV2()),
    lifecycle: charterLifecycle({ extended: true }),
    bindingId: 'binding.grid.v2',
    expectedPriorCircleHeadDigest: firstDigest,
    now: NOW_EXTENDED
  });
  assert.equal(candidate.expected_prior_circle_head_digest, firstDigest);
  assert.equal(candidate.event.payload.previous_circle_binding_digest, firstDigest);

  await assert.rejects(() => candidateFor({
    ledger,
    circle: circlePackage(charterV2()),
    lifecycle: charterLifecycle({ extended: true }),
    bindingId: 'binding.grid.v2',
    expectedPriorCircleHeadDigest: 'f'.repeat(64),
    now: NOW_EXTENDED
  }), /expected prior Circle head does not match binding predecessor/);
});

test('replay assessment distinguishes new, exact replay, conflict, and wrong lookup identity', async () => {
  const { persistencePolicy } = await policies();
  const candidate = await candidateFor();
  assert.equal(
    assessCircleGridPersistenceReplay(persistencePolicy, candidate, null).state,
    'new'
  );

  const exact = {
    event_id: candidate.event.event_id,
    kind: candidate.event.kind,
    subject: candidate.event.subject,
    payload_digest: candidate.payload_digest
  };
  assert.equal(
    assessCircleGridPersistenceReplay(persistencePolicy, candidate, exact).state,
    'exact-replay'
  );

  const conflicting = { ...exact, payload_digest: 'f'.repeat(64) };
  assert.equal(
    assessCircleGridPersistenceReplay(persistencePolicy, candidate, conflicting).state,
    'conflict'
  );

  assert.throws(
    () => assessCircleGridPersistenceReplay(
      persistencePolicy,
      candidate,
      { ...exact, event_id: 'circle_binding_wrong' }
    ),
    /wrong Grid event/
  );
});

test('receipt binds exact Grid envelope and verified chain evidence without granting authority', async () => {
  const { persistencePolicy } = await policies();
  const candidate = await candidateFor();
  const event = gridEventFor(candidate);
  const verification = {
    valid: true,
    verification_mode: 'full',
    events: event.seq,
    verified_events: event.seq,
    verified_from_seq: 1,
    verified_through_seq: event.seq
  };
  const receipt = buildCircleGridPersistenceReceipt(
    persistencePolicy,
    candidate,
    event,
    verification
  );
  assert.equal(receipt.grid_seq, event.seq);
  assert.equal(receipt.grid_event_hash, event.event_hash);
  assert.equal(receipt.grid_payload_digest, candidate.payload_digest);
  assert.equal(receipt.resulting_circle_head_digest, candidate.binding_digest);
  assert.equal(receipt.grid_chain_verified, true);
  assert.equal(receipt.runtime_authority, false);
  assert.equal(receipt.portable_authority, false);
  assert.equal(receipt.authority_effect, 'none');
});

test('receipt rejects forged Grid envelope, insufficient chain coverage, and failed chain verification', async () => {
  const { persistencePolicy } = await policies();
  const candidate = await candidateFor();
  const event = gridEventFor(candidate);

  assert.throws(
    () => buildCircleGridPersistenceReceipt(
      persistencePolicy,
      candidate,
      { ...event, event_hash: 'f'.repeat(64) },
      { valid: true, events: event.seq }
    ),
    /event hash does not match envelope/
  );

  assert.throws(
    () => buildCircleGridPersistenceReceipt(
      persistencePolicy,
      candidate,
      event,
      { valid: true, events: event.seq - 1 }
    ),
    /requires Grid chain verification covering the event/
  );

  assert.throws(
    () => buildCircleGridPersistenceReceipt(
      persistencePolicy,
      candidate,
      event,
      { valid: false, events: event.seq }
    ),
    /requires Grid chain verification covering the event/
  );
});

test('candidate payload binds immutable history prefixes, not mutable full-tail digests', async () => {
  const candidate = await candidateFor();
  const payload = candidate.event.payload;
  assert.match(payload.historical_ledger_prefix_digest, /^[a-f0-9]{64}$/);
  assert.match(payload.charter_lifecycle_prefix_digest, /^[a-f0-9]{64}$/);
  assert.equal(Object.hasOwn(payload, 'historical_ledger_digest'), false);
  assert.equal(Object.hasOwn(payload, 'charter_lifecycle_digest'), false);
  assert.equal(Object.hasOwn(payload, 'circle_package_digest'), false);
  assert.equal(Object.hasOwn(payload, 'circle_descriptor_digest'), false);
});

test('policy weakening cannot silently enable live Grid effects or reinterpret ReplayGuard as persistence', async () => {
  const { persistencePolicy } = await policies();
  const live = structuredClone(persistencePolicy);
  live.runtime_integration.live_grid_append = true;
  assert.throws(() => validateCircleGridPersistencePolicy(live), /runtime integration boundary drifted/);

  const replay = structuredClone(persistencePolicy);
  replay.requirements.request_replay_guard_counts_as_durable_persistence = true;
  assert.throws(() => validateCircleGridPersistencePolicy(replay), /requirement was weakened/);
});
