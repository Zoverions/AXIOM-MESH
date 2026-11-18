import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { digestObject } from '../src/lib/canonical.mjs';
import {
  CIRCLE_CHARTER_SCHEMA,
  CIRCLE_CORE_PACKAGE_SCHEMA,
  CIRCLE_INVITATION_SCHEMA,
  CIRCLE_MEMBERSHIP_SCHEMA,
  CIRCLE_SCHEMA
} from '../src/lib/circle-core.mjs';
import {
  validateCircleHistoricalRuleBindingLedger
} from '../../packages/axiom-circle-historical-rule-binding/index.mjs';

const policyUrl = new URL('../config/circle-historical-rule-binding.v0.json', import.meta.url);
const charterPolicyUrl = new URL('../config/circle-charter-lifecycle.v0.json', import.meta.url);

async function policies() {
  const [policy, charterPolicy] = await Promise.all([
    readFile(policyUrl, 'utf8').then(JSON.parse),
    readFile(charterPolicyUrl, 'utf8').then(JSON.parse)
  ]);
  return { policy, charterPolicy };
}

function charter() {
  return {
    schema: CIRCLE_CHARTER_SCHEMA,
    circle_id: 'circle.history.replay',
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

function circlePackage() {
  const activeCharter = charter();
  return {
    schema: CIRCLE_CORE_PACKAGE_SCHEMA,
    version: 0,
    status: 'inert-contract-laboratory',
    circle: {
      schema: CIRCLE_SCHEMA,
      circle_id: 'circle.history.replay',
      name: 'Historical Replay Circle',
      purpose: 'Prove one-use invitations remain one-use in historical bindings.',
      created_by: 'human.alpha',
      created_at: '2026-08-20T12:00:00.000Z',
      trust_anchor_id: 'anchor.history.replay',
      participation_model: 'voluntary',
      member_state_ownership: 'independent-node',
      policy_floor: 'raise-only',
      authority_effect: 'none',
      network_effect: 'none',
      runtime_activation: false
    },
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

function charterLifecycle() {
  const activeCharter = charter();
  const charterDigest = digestObject(activeCharter);
  return {
    schema: 'axiom-circle-charter-lifecycle.v0',
    circle_id: 'circle.history.replay',
    entries: [{
      schema: 'axiom-circle-charter-history-entry.v0',
      circle_id: 'circle.history.replay',
      charter: activeCharter,
      charter_digest: charterDigest,
      recorded_at: '2026-08-20T12:01:00.000Z',
      activation: {
        schema: 'axiom-circle-charter-activation.v0',
        circle_id: 'circle.history.replay',
        charter_digest: charterDigest,
        basis_charter_digest: null,
        activated_at: activeCharter.effective_from,
        evidence_refs: ['evidence:history:replay:charter'],
        creates_runtime_authority: false,
        authority_effect: 'none',
        network_effect: 'none'
      },
      authority_effect: 'none',
      network_effect: 'none'
    }],
    authority_effect: 'none',
    network_effect: 'none',
    runtime_activation: false
  };
}

function invitation() {
  return {
    schema: CIRCLE_INVITATION_SCHEMA,
    invitation_id: 'invite.replay',
    circle_id: 'circle.history.replay',
    invited_principal: 'human.alpha',
    membership_class: 'member',
    role_ids: ['member'],
    issued_by: 'human.alpha',
    issued_at: '2026-08-20T12:10:00.000Z',
    expires_at: '2026-08-20T12:50:00.000Z',
    charter_digest: digestObject(charter()),
    one_use: true,
    authority_effect: 'none'
  };
}

function membership(id, acceptedAt) {
  return {
    schema: CIRCLE_MEMBERSHIP_SCHEMA,
    membership_id: id,
    circle_id: 'circle.history.replay',
    invitation_id: 'invite.replay',
    principal_id: 'human.alpha',
    role_ids: ['member'],
    accepted_at: acceptedAt,
    status: 'active',
    status_effective_at: acceptedAt,
    member_state_ownership: 'independent-node',
    disclosure_profile: 'selective',
    authority_effect: 'none',
    network_effect: 'none'
  };
}

function binding({ id, type, record, eventTime, boundAt, previous = null, basis = null }) {
  const idField = type === 'invitation' ? 'invitation_id' : 'membership_id';
  return {
    schema: 'axiom-circle-historical-rule-binding.v0',
    binding_id: id,
    circle_id: 'circle.history.replay',
    record_type: type,
    record_id: record[idField],
    record_digest: digestObject(record),
    record,
    event_time: eventTime,
    bound_at: boundAt,
    previous_binding_digest: previous === null ? null : digestObject(previous),
    basis_binding_id: basis,
    binding_mode: type === 'invitation'
      ? 'resolve-at-event'
      : 'invitation-current-at-acceptance',
    governing_charter_digest: digestObject(charter()),
    authority_effect: 'none',
    network_effect: 'none',
    runtime_activation: false
  };
}

function replayLedger() {
  const invitationRecord = invitation();
  const first = binding({
    id: 'binding.invite.replay',
    type: 'invitation',
    record: invitationRecord,
    eventTime: invitationRecord.issued_at,
    boundAt: '2026-08-20T12:11:00.000Z'
  });

  const firstMembership = membership('membership.replay.one', '2026-08-20T12:20:00.000Z');
  const second = binding({
    id: 'binding.membership.replay.one',
    type: 'membership',
    record: firstMembership,
    eventTime: firstMembership.accepted_at,
    boundAt: '2026-08-20T12:21:00.000Z',
    previous: first,
    basis: first.binding_id
  });

  const secondMembership = membership('membership.replay.two', '2026-08-20T12:25:00.000Z');
  const third = binding({
    id: 'binding.membership.replay.two',
    type: 'membership',
    record: secondMembership,
    eventTime: secondMembership.accepted_at,
    boundAt: '2026-08-20T12:26:00.000Z',
    previous: second,
    basis: first.binding_id
  });

  return {
    schema: 'axiom-circle-historical-rule-binding-ledger.v0',
    circle_id: 'circle.history.replay',
    bindings: [first, second, third],
    authority_effect: 'none',
    network_effect: 'none',
    runtime_activation: false
  };
}

test('one-use invitation binding cannot create two historical membership acceptances', async () => {
  const { policy, charterPolicy } = await policies();
  const ledger = replayLedger();

  assert.throws(
    () => validateCircleHistoricalRuleBindingLedger(
      policy,
      charterPolicy,
      circlePackage(),
      charterLifecycle(),
      ledger,
      { now: new Date('2026-08-20T13:00:00.000Z') }
    ),
    /is one-use and cannot create multiple memberships/
  );
});
