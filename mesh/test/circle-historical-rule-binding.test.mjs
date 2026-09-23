import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { digestObject } from '../src/lib/canonical.mjs';
import {
  CIRCLE_CHARTER_SCHEMA,
  CIRCLE_CORE_PACKAGE_SCHEMA,
  CIRCLE_DECISION_SCHEMA,
  CIRCLE_INVITATION_SCHEMA,
  CIRCLE_MEMBERSHIP_SCHEMA,
  CIRCLE_PROPOSAL_SCHEMA,
  CIRCLE_SCHEMA
} from '../src/lib/circle-core.mjs';
import {
  validateCircleHistoricalRuleBindingLedger,
  validateCircleHistoricalRuleBindingPolicy
} from '../../packages/axiom-circle-historical-rule-binding/index.mjs';

const policyUrl = new URL('../config/circle-historical-rule-binding.v0.json', import.meta.url);
const charterPolicyUrl = new URL('../config/circle-charter-lifecycle.v0.json', import.meta.url);

async function loadPolicies() {
  const [policy, charterPolicy] = await Promise.all([
    readFile(policyUrl, 'utf8').then(JSON.parse),
    readFile(charterPolicyUrl, 'utf8').then(JSON.parse)
  ]);
  return { policy, charterPolicy };
}

function circleDescriptor() {
  return {
    schema: CIRCLE_SCHEMA,
    circle_id: 'circle.history',
    name: 'Historical Binding Circle',
    purpose: 'Exercise immutable event snapshots across charter amendments.',
    created_by: 'human.alpha',
    created_at: '2026-08-20T12:00:00.000Z',
    trust_anchor_id: 'anchor.history',
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
    circle_id: 'circle.history',
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
    circle_id: 'circle.history',
    version: 2,
    effective_from: '2026-08-20T13:00:00.000Z',
    supersedes_digest: digestObject(first),
    roles: [
      ...first.roles,
      {
        role_id: 'reviewer',
        label: 'Reviewer',
        declared_modes: ['observe', 'review', 'appeal'],
        execution_authority: false
      }
    ],
    decision_rule: {
      quorum_basis_points: 7000,
      approval_basis_points: 7500,
      abstention_counts_toward_quorum: true
    },
    appeal_enabled: true,
    member_exit_enabled: true,
    execution_authority: false,
    authority_effect: 'none'
  };
}

function circlePackage() {
  return {
    schema: CIRCLE_CORE_PACKAGE_SCHEMA,
    version: 0,
    status: 'inert-contract-laboratory',
    circle: circleDescriptor(),
    charter: charterV2(),
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

function charterHistoryEntry(charter, recordedAt, evidenceRef) {
  const charterDigest = digestObject(charter);
  return {
    schema: 'axiom-circle-charter-history-entry.v0',
    circle_id: 'circle.history',
    charter,
    charter_digest: charterDigest,
    recorded_at: recordedAt,
    activation: {
      schema: 'axiom-circle-charter-activation.v0',
      circle_id: 'circle.history',
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

function charterLifecycle() {
  const first = charterV1();
  const second = charterV2();
  return {
    schema: 'axiom-circle-charter-lifecycle.v0',
    circle_id: 'circle.history',
    entries: [
      charterHistoryEntry(first, '2026-08-20T12:01:00.000Z', 'evidence:history:charter:v1'),
      charterHistoryEntry(second, '2026-08-20T12:50:00.000Z', 'evidence:history:charter:v2')
    ],
    authority_effect: 'none',
    network_effect: 'none',
    runtime_activation: false
  };
}

function invitationRecord({
  invitationId = 'invite.alpha',
  issuedAt = '2026-08-20T12:10:00.000Z',
  expiresAt = '2026-08-20T12:55:00.000Z',
  charterDigest = digestObject(charterV1()),
  roleIds = ['member']
} = {}) {
  return {
    schema: CIRCLE_INVITATION_SCHEMA,
    invitation_id: invitationId,
    circle_id: 'circle.history',
    invited_principal: 'human.alpha',
    membership_class: 'member',
    role_ids: roleIds,
    issued_by: 'human.alpha',
    issued_at: issuedAt,
    expires_at: expiresAt,
    charter_digest: charterDigest,
    one_use: true,
    authority_effect: 'none'
  };
}

function membershipRecord({
  membershipId = 'membership.alpha',
  invitationId = 'invite.alpha',
  acceptedAt = '2026-08-20T12:20:00.000Z',
  roleIds = ['member'],
  principalId = 'human.alpha',
  status = 'active'
} = {}) {
  return {
    schema: CIRCLE_MEMBERSHIP_SCHEMA,
    membership_id: membershipId,
    circle_id: 'circle.history',
    invitation_id: invitationId,
    principal_id: principalId,
    role_ids: roleIds,
    accepted_at: acceptedAt,
    status,
    status_effective_at: acceptedAt,
    member_state_ownership: 'independent-node',
    disclosure_profile: 'selective',
    authority_effect: 'none',
    network_effect: 'none'
  };
}

function proposalRecord({
  proposalId = 'proposal.alpha',
  createdAt = '2026-08-20T12:30:00.000Z',
  closesAt = '2026-08-20T13:30:00.000Z',
  charterDigest = digestObject(charterV1()),
  status = 'open'
} = {}) {
  return {
    schema: CIRCLE_PROPOSAL_SCHEMA,
    proposal_id: proposalId,
    circle_id: 'circle.history',
    charter_digest: charterDigest,
    proposer: 'human.alpha',
    title: 'Historical rule proposal',
    summary: 'Freeze the governing charter at proposal creation.',
    created_at: createdAt,
    closes_at: closesAt,
    status,
    evidence_refs: ['evidence:history:proposal:alpha'],
    execution_effect: 'none',
    authority_effect: 'none'
  };
}

function decisionRecord({
  decisionId = 'decision.alpha',
  proposalId = 'proposal.alpha',
  decidedAt = '2026-08-20T13:10:00.000Z',
  charterDigest = digestObject(charterV1())
} = {}) {
  return {
    schema: CIRCLE_DECISION_SCHEMA,
    decision_id: decisionId,
    circle_id: 'circle.history',
    proposal_id: proposalId,
    charter_digest: charterDigest,
    outcome: 'accepted',
    decided_at: decidedAt,
    participant_receipts: ['receipt:history:decision:alpha'],
    finality: 'circle-local-accepted',
    runtime_authority: false,
    authority_effect: 'none'
  };
}

function binding({
  bindingId,
  recordType,
  record,
  eventTime,
  boundAt,
  previous = null,
  basisBindingId = null,
  governingCharterDigest
}) {
  const idField = {
    invitation: 'invitation_id',
    membership: 'membership_id',
    proposal: 'proposal_id',
    decision: 'decision_id'
  }[recordType];
  const bindingMode = {
    invitation: 'resolve-at-event',
    membership: 'invitation-current-at-acceptance',
    proposal: 'resolve-at-event-and-freeze',
    decision: 'inherit-proposal-frozen-charter'
  }[recordType];
  return {
    schema: 'axiom-circle-historical-rule-binding.v0',
    binding_id: bindingId,
    circle_id: 'circle.history',
    record_type: recordType,
    record_id: record[idField],
    record_digest: digestObject(record),
    record,
    event_time: eventTime,
    bound_at: boundAt,
    previous_binding_digest: previous === null ? null : digestObject(previous),
    basis_binding_id: basisBindingId,
    binding_mode: bindingMode,
    governing_charter_digest: governingCharterDigest,
    authority_effect: 'none',
    network_effect: 'none',
    runtime_activation: false
  };
}

function ledgerFixture() {
  const v1 = digestObject(charterV1());
  const invitation = invitationRecord();
  const invitationBinding = binding({
    bindingId: 'binding.invitation.alpha',
    recordType: 'invitation',
    record: invitation,
    eventTime: invitation.issued_at,
    boundAt: '2026-08-20T12:11:00.000Z',
    governingCharterDigest: v1
  });

  const membership = membershipRecord();
  const membershipBinding = binding({
    bindingId: 'binding.membership.alpha',
    recordType: 'membership',
    record: membership,
    eventTime: membership.accepted_at,
    boundAt: '2026-08-20T12:21:00.000Z',
    previous: invitationBinding,
    basisBindingId: invitationBinding.binding_id,
    governingCharterDigest: v1
  });

  const proposal = proposalRecord();
  const proposalBinding = binding({
    bindingId: 'binding.proposal.alpha',
    recordType: 'proposal',
    record: proposal,
    eventTime: proposal.created_at,
    boundAt: '2026-08-20T12:31:00.000Z',
    previous: membershipBinding,
    governingCharterDigest: v1
  });

  const decision = decisionRecord();
  const decisionBinding = binding({
    bindingId: 'binding.decision.alpha',
    recordType: 'decision',
    record: decision,
    eventTime: decision.decided_at,
    boundAt: '2026-08-20T13:11:00.000Z',
    previous: proposalBinding,
    basisBindingId: proposalBinding.binding_id,
    governingCharterDigest: v1
  });

  return {
    schema: 'axiom-circle-historical-rule-binding-ledger.v0',
    circle_id: 'circle.history',
    bindings: [invitationBinding, membershipBinding, proposalBinding, decisionBinding],
    authority_effect: 'none',
    network_effect: 'none',
    runtime_activation: false
  };
}

function rebuildChain(ledger) {
  let previous = null;
  for (const item of ledger.bindings) {
    item.previous_binding_digest = previous === null ? null : digestObject(previous);
    previous = item;
  }
  return ledger;
}

const NOW = new Date('2026-08-20T15:00:00.000Z');

async function validate(ledger, now = NOW) {
  const { policy, charterPolicy } = await loadPolicies();
  return validateCircleHistoricalRuleBindingLedger(
    policy,
    charterPolicy,
    circlePackage(),
    charterLifecycle(),
    ledger,
    { now }
  );
}

test('historical rule binding policy is exact and non-authorizing', async () => {
  const { policy } = await loadPolicies();
  assert.equal(validateCircleHistoricalRuleBindingPolicy(policy), true);
  assert.equal(policy.runtime_activation, false);
  assert.equal(policy.requirements.record_is_event_snapshot_not_live_mutable_projection, true);
  assert.equal(policy.requirements.membership_rejects_stale_invitation_after_amendment, true);
  assert.equal(policy.requirements.mid_proposal_charter_change_cannot_change_decision_rules, true);
  assert.equal(policy.output.runtime_authority, false);
  assert.equal(policy.output.portable_authority, false);
});

test('valid ledger binds event snapshots and preserves proposal-frozen rules across an amendment', async () => {
  const ledger = ledgerFixture();
  const result = await validate(ledger);
  assert.equal(result.valid, true);
  assert.equal(result.binding_count, 4);
  assert.deepEqual(result.counts, {
    invitation: 1,
    membership: 1,
    proposal: 1,
    decision: 1
  });
  assert.equal(result.head_binding_digest, digestObject(ledger.bindings.at(-1)));
  assert.equal(result.ledger_digest, digestObject(ledger));
  assert.equal(result.runtime_authority, false);
  assert.equal(result.authority_effect, 'none');

  const decision = ledger.bindings.at(-1);
  assert.equal(decision.event_time, '2026-08-20T13:10:00.000Z');
  assert.equal(decision.governing_charter_digest, digestObject(charterV1()));
  assert.notEqual(decision.governing_charter_digest, digestObject(charterV2()));
});

test('membership acceptance rejects an invitation made stale by charter amendment', async () => {
  const v1 = digestObject(charterV1());
  const invitation = invitationRecord({
    invitationId: 'invite.stale',
    issuedAt: '2026-08-20T12:50:00.000Z',
    expiresAt: '2026-08-20T13:30:00.000Z'
  });
  const first = binding({
    bindingId: 'binding.invitation.stale',
    recordType: 'invitation',
    record: invitation,
    eventTime: invitation.issued_at,
    boundAt: '2026-08-20T12:51:00.000Z',
    governingCharterDigest: v1
  });
  const membership = membershipRecord({
    membershipId: 'membership.stale',
    invitationId: invitation.invitation_id,
    acceptedAt: '2026-08-20T13:05:00.000Z'
  });
  const second = binding({
    bindingId: 'binding.membership.stale',
    recordType: 'membership',
    record: membership,
    eventTime: membership.accepted_at,
    boundAt: '2026-08-20T13:06:00.000Z',
    previous: first,
    basisBindingId: first.binding_id,
    governingCharterDigest: digestObject(charterV2())
  });
  const ledger = {
    schema: 'axiom-circle-historical-rule-binding-ledger.v0',
    circle_id: 'circle.history',
    bindings: [first, second],
    authority_effect: 'none',
    network_effect: 'none',
    runtime_activation: false
  };

  await assert.rejects(() => validate(ledger), /invitation made stale by charter amendment/);
});

test('decision cannot switch to the charter active at decision time when proposal froze an older charter', async () => {
  const ledger = ledgerFixture();
  const decisionBinding = ledger.bindings.at(-1);
  decisionBinding.record.charter_digest = digestObject(charterV2());
  decisionBinding.record_digest = digestObject(decisionBinding.record);
  decisionBinding.governing_charter_digest = digestObject(charterV2());
  rebuildChain(ledger);

  await assert.rejects(() => validate(ledger), /must inherit the proposal frozen charter/);
});

test('membership and proposal bindings require immutable event snapshots rather than later projections', async () => {
  const membershipLedger = ledgerFixture();
  membershipLedger.bindings[1].record.status = 'revoked';
  membershipLedger.bindings[1].record_digest = digestObject(membershipLedger.bindings[1].record);
  rebuildChain(membershipLedger);
  await assert.rejects(() => validate(membershipLedger), /membership acceptance snapshot is invalid/);

  const proposalLedger = ledgerFixture();
  proposalLedger.bindings[2].record.status = 'closed';
  proposalLedger.bindings[2].record_digest = digestObject(proposalLedger.bindings[2].record);
  rebuildChain(proposalLedger);
  await assert.rejects(() => validate(proposalLedger), /proposal creation snapshot is invalid/);
});

test('membership acceptance must match invitation principal and exact role set', async () => {
  const principal = ledgerFixture();
  principal.bindings[1].record.principal_id = 'human.attacker';
  principal.bindings[1].record_digest = digestObject(principal.bindings[1].record);
  rebuildChain(principal);
  await assert.rejects(() => validate(principal), /does not match its invitation basis/);

  const roles = ledgerFixture();
  roles.bindings[1].record.role_ids = ['reviewer'];
  roles.bindings[1].record_digest = digestObject(roles.bindings[1].record);
  rebuildChain(roles);
  await assert.rejects(() => validate(roles), /does not match its invitation basis/);
});

test('invitation and proposal charter digests must match the charter active at their event time', async () => {
  const invitation = ledgerFixture();
  invitation.bindings[0].record.charter_digest = digestObject(charterV2());
  invitation.bindings[0].record_digest = digestObject(invitation.bindings[0].record);
  rebuildChain(invitation);
  await assert.rejects(() => validate(invitation), /not bound to the charter active at issue/);

  const proposal = ledgerFixture();
  proposal.bindings[2].record.charter_digest = digestObject(charterV2());
  proposal.bindings[2].record_digest = digestObject(proposal.bindings[2].record);
  proposal.bindings[2].governing_charter_digest = digestObject(charterV2());
  rebuildChain(proposal);
  await assert.rejects(() => validate(proposal), /not bound to the charter active at creation/);
});

test('ledger rejects record-digest substitution and broken append-only binding chain', async () => {
  const recordDigest = ledgerFixture();
  recordDigest.bindings[1].record_digest = 'f'.repeat(64);
  await assert.rejects(() => validate(recordDigest), /record digest does not match record/);

  const chain = ledgerFixture();
  chain.bindings[2].previous_binding_digest = 'e'.repeat(64);
  await assert.rejects(() => validate(chain), /binding digest chain is invalid/);
});

test('basis bindings must already exist and use the required record type', async () => {
  const missing = ledgerFixture();
  missing.bindings[1].basis_binding_id = 'binding.invitation.missing';
  rebuildChain(missing);
  await assert.rejects(() => validate(missing), /membership basis binding is invalid/);

  const wrongType = ledgerFixture();
  wrongType.bindings[3].basis_binding_id = wrongType.bindings[1].binding_id;
  rebuildChain(wrongType);
  await assert.rejects(() => validate(wrongType), /decision basis binding is invalid/);
});

test('binding event time must equal the source record event and binding time must be chronological', async () => {
  const event = ledgerFixture();
  event.bindings[2].event_time = '2026-08-20T12:31:00.000Z';
  rebuildChain(event);
  await assert.rejects(() => validate(event), /event_time does not match record event/);

  const bound = ledgerFixture();
  bound.bindings[2].bound_at = bound.bindings[1].bound_at;
  rebuildChain(bound);
  await assert.rejects(() => validate(bound), /binding times must strictly increase/);
});

test('binding cannot predate its event or claim future event/binding time', async () => {
  const predates = ledgerFixture();
  predates.bindings[3].bound_at = '2026-08-20T13:09:00.000Z';
  rebuildChain(predates);
  await assert.rejects(() => validate(predates), /cannot predate its event/);

  const future = ledgerFixture();
  future.bindings[3].record.decided_at = '2026-08-20T16:00:00.000Z';
  future.bindings[3].event_time = future.bindings[3].record.decided_at;
  future.bindings[3].bound_at = '2026-08-20T16:01:00.000Z';
  future.bindings[3].record_digest = digestObject(future.bindings[3].record);
  rebuildChain(future);
  await assert.rejects(() => validate(future), /cannot contain future event or binding time/);
});

test('decision cannot predate its proposal', async () => {
  const ledger = ledgerFixture();
  ledger.bindings[3].record.decided_at = '2026-08-20T12:29:00.000Z';
  ledger.bindings[3].event_time = ledger.bindings[3].record.decided_at;
  ledger.bindings[3].bound_at = '2026-08-20T12:32:00.000Z';
  ledger.bindings[3].record_digest = digestObject(ledger.bindings[3].record);
  rebuildChain(ledger);
  await assert.rejects(() => validate(ledger), /decision predates its proposal/);
});

test('record identities and record digests cannot be reused', async () => {
  const identity = ledgerFixture();
  const duplicate = structuredClone(identity.bindings[0]);
  duplicate.binding_id = 'binding.invitation.duplicate';
  duplicate.bound_at = '2026-08-20T13:20:00.000Z';
  duplicate.previous_binding_digest = digestObject(identity.bindings.at(-1));
  identity.bindings.push(duplicate);
  await assert.rejects(() => validate(identity), /reuse a record digest|Duplicate Circle historical record identity/);
});

test('canonical evidence references reject control characters and edge whitespace', async () => {
  const proposal = ledgerFixture();
  proposal.bindings[2].record.evidence_refs = [' evidence:forged'];
  proposal.bindings[2].record_digest = digestObject(proposal.bindings[2].record);
  rebuildChain(proposal);
  await assert.rejects(() => validate(proposal), /proposal evidence_refs are invalid/);

  const decision = ledgerFixture();
  decision.bindings[3].record.participant_receipts = ['receipt:ok\nreceipt:forged'];
  decision.bindings[3].record_digest = digestObject(decision.bindings[3].record);
  rebuildChain(decision);
  await assert.rejects(() => validate(decision), /decision participant_receipts are invalid/);
});
