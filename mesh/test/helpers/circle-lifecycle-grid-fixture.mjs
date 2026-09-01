import { readFile } from 'node:fs/promises';

import { digestObject } from '../../src/lib/canonical.mjs';
import {
  CIRCLE_CHARTER_SCHEMA,
  CIRCLE_CORE_PACKAGE_SCHEMA,
  CIRCLE_INVITATION_SCHEMA,
  CIRCLE_MEMBERSHIP_SCHEMA,
  CIRCLE_SCHEMA
} from '../../src/lib/circle-core.mjs';

export const FIXTURE_NOW = new Date('2026-08-20T13:00:00.000Z');
export const FIXTURE_CIRCLE_ID = 'circle.lifecycle.grid';
export const FIXTURE_PRINCIPAL = 'human.lifecycle.alpha';
export const FIXTURE_MEMBERSHIP_ID = 'membership.lifecycle.alpha';
export const FIXTURE_CREDENTIAL_ID = 'credential.lifecycle.alpha.1';

const urls = {
  memberEligibilityPolicy: new URL('../../config/circle-member-eligibility-lifecycle.v0.json', import.meta.url),
  credentialPolicy: new URL('../../config/circle-membership-credential-lifecycle.v0.json', import.meta.url),
  charterPolicy: new URL('../../config/circle-charter-lifecycle.v0.json', import.meta.url),
  historicalBindingPolicy: new URL('../../config/circle-historical-rule-binding.v0.json', import.meta.url)
};

export async function loadCircleLifecycleFixturePolicies() {
  return Object.fromEntries(await Promise.all(Object.entries(urls).map(async ([key, url]) => [
    key,
    JSON.parse(await readFile(url, 'utf8'))
  ])));
}

export function lifecycleCharter() {
  return {
    schema: CIRCLE_CHARTER_SCHEMA,
    circle_id: FIXTURE_CIRCLE_ID,
    version: 1,
    effective_from: '2026-08-20T12:01:00.000Z',
    supersedes_digest: null,
    roles: [{
      role_id: 'member',
      label: 'Member',
      declared_modes: ['approve', 'propose', 'vote', 'review', 'observe'],
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

export function lifecycleInvitation() {
  return {
    schema: CIRCLE_INVITATION_SCHEMA,
    invitation_id: 'invite.lifecycle.alpha',
    circle_id: FIXTURE_CIRCLE_ID,
    invited_principal: FIXTURE_PRINCIPAL,
    membership_class: 'member',
    role_ids: ['member'],
    issued_by: FIXTURE_PRINCIPAL,
    issued_at: '2026-08-20T12:02:00.000Z',
    expires_at: '2026-08-20T12:45:00.000Z',
    charter_digest: digestObject(lifecycleCharter()),
    one_use: true,
    authority_effect: 'none'
  };
}

export function lifecycleMembership({
  status = 'active',
  statusEffectiveAt = '2026-08-20T12:03:00.000Z',
  roleIds = ['member']
} = {}) {
  return {
    schema: CIRCLE_MEMBERSHIP_SCHEMA,
    membership_id: FIXTURE_MEMBERSHIP_ID,
    circle_id: FIXTURE_CIRCLE_ID,
    invitation_id: 'invite.lifecycle.alpha',
    principal_id: FIXTURE_PRINCIPAL,
    role_ids: [...roleIds],
    accepted_at: '2026-08-20T12:03:00.000Z',
    status,
    status_effective_at: statusEffectiveAt,
    member_state_ownership: 'independent-node',
    disclosure_profile: 'selective',
    authority_effect: 'none',
    network_effect: 'none'
  };
}

export function lifecycleCirclePackage(membership = lifecycleMembership(), exits = []) {
  return {
    schema: CIRCLE_CORE_PACKAGE_SCHEMA,
    version: 0,
    status: 'inert-contract-laboratory',
    circle: {
      schema: CIRCLE_SCHEMA,
      circle_id: FIXTURE_CIRCLE_ID,
      name: 'Lifecycle Grid Circle',
      purpose: 'Exercise durable lifecycle-head persistence without runtime authority.',
      created_by: FIXTURE_PRINCIPAL,
      created_at: '2026-08-20T12:00:00.000Z',
      trust_anchor_id: 'anchor.lifecycle.grid',
      participation_model: 'voluntary',
      member_state_ownership: 'independent-node',
      policy_floor: 'raise-only',
      authority_effect: 'none',
      network_effect: 'none',
      runtime_activation: false
    },
    charter: lifecycleCharter(),
    invitations: [lifecycleInvitation()],
    memberships: [membership],
    proposals: [],
    tasks: [],
    decisions: [],
    appeals: [],
    exits,
    exports: [],
    authority_effect: 'none',
    network_effect: 'none',
    runtime_activation: false
  };
}

export function lifecycleCharterHistory() {
  const charter = lifecycleCharter();
  const charterDigest = digestObject(charter);
  return {
    schema: 'axiom-circle-charter-lifecycle.v0',
    circle_id: FIXTURE_CIRCLE_ID,
    entries: [{
      schema: 'axiom-circle-charter-history-entry.v0',
      circle_id: FIXTURE_CIRCLE_ID,
      charter,
      charter_digest: charterDigest,
      recorded_at: '2026-08-20T12:00:30.000Z',
      activation: {
        schema: 'axiom-circle-charter-activation.v0',
        circle_id: FIXTURE_CIRCLE_ID,
        charter_digest: charterDigest,
        basis_charter_digest: null,
        activated_at: charter.effective_from,
        evidence_refs: ['evidence:lifecycle:grid:charter'],
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

function binding({ id, type, record, previous = null, basis = null, boundAt }) {
  const idField = type === 'invitation' ? 'invitation_id' : 'membership_id';
  const eventTime = type === 'invitation' ? record.issued_at : record.accepted_at;
  return {
    schema: 'axiom-circle-historical-rule-binding.v0',
    binding_id: id,
    circle_id: FIXTURE_CIRCLE_ID,
    record_type: type,
    record_id: record[idField],
    record_digest: digestObject(record),
    record,
    event_time: eventTime,
    bound_at: boundAt,
    previous_binding_digest: previous === null ? null : digestObject(previous),
    basis_binding_id: basis,
    binding_mode: type === 'invitation' ? 'resolve-at-event' : 'invitation-current-at-acceptance',
    governing_charter_digest: digestObject(lifecycleCharter()),
    authority_effect: 'none',
    network_effect: 'none',
    runtime_activation: false
  };
}

export function lifecycleHistoricalLedger() {
  const invitation = lifecycleInvitation();
  const invitationBinding = binding({
    id: 'binding.invite.lifecycle.alpha',
    type: 'invitation',
    record: invitation,
    boundAt: '2026-08-20T12:02:10.000Z'
  });
  const membership = lifecycleMembership();
  const membershipBinding = binding({
    id: 'binding.membership.lifecycle.alpha',
    type: 'membership',
    record: membership,
    previous: invitationBinding,
    basis: invitationBinding.binding_id,
    boundAt: '2026-08-20T12:03:10.000Z'
  });
  return {
    schema: 'axiom-circle-historical-rule-binding-ledger.v0',
    circle_id: FIXTURE_CIRCLE_ID,
    bindings: [invitationBinding, membershipBinding],
    authority_effect: 'none',
    network_effect: 'none',
    runtime_activation: false
  };
}

export function lifecycleMembershipHistory(events = []) {
  return {
    schema: 'axiom-circle-member-eligibility-lifecycle.v0',
    circle_id: FIXTURE_CIRCLE_ID,
    membership_id: FIXTURE_MEMBERSHIP_ID,
    principal_id: FIXTURE_PRINCIPAL,
    acceptance_binding_id: 'binding.membership.lifecycle.alpha',
    events,
    authority_effect: 'none',
    network_effect: 'none',
    runtime_activation: false
  };
}

export function lifecycleCredentialHistory({ events = [], credentials = null } = {}) {
  return {
    schema: 'axiom-circle-membership-credential-lifecycle.v0',
    circle_id: FIXTURE_CIRCLE_ID,
    membership_id: FIXTURE_MEMBERSHIP_ID,
    principal_id: FIXTURE_PRINCIPAL,
    term: {
      schema: 'axiom-circle-membership-term.v0',
      term_id: 'term.lifecycle.alpha',
      circle_id: FIXTURE_CIRCLE_ID,
      membership_id: FIXTURE_MEMBERSHIP_ID,
      principal_id: FIXTURE_PRINCIPAL,
      begins_at: '2026-08-20T12:03:00.000Z',
      ends_at: '2027-08-20T12:03:00.000Z',
      changes_core_membership: false,
      authority_effect: 'none'
    },
    devices: [{
      schema: 'axiom-circle-member-device.v0',
      device_id: 'device.lifecycle.alpha',
      circle_id: FIXTURE_CIRCLE_ID,
      membership_id: FIXTURE_MEMBERSHIP_ID,
      principal_id: FIXTURE_PRINCIPAL,
      registered_at: '2026-08-20T12:03:10.000Z',
      state_owner: 'independent-node',
      secret_material_included: false,
      execution_authority: false,
      authority_effect: 'none',
      network_effect: 'none'
    }],
    credentials: credentials ?? [{
      schema: 'axiom-circle-member-device-credential.v0',
      credential_id: FIXTURE_CREDENTIAL_ID,
      device_id: 'device.lifecycle.alpha',
      circle_id: FIXTURE_CIRCLE_ID,
      membership_id: FIXTURE_MEMBERSHIP_ID,
      principal_id: FIXTURE_PRINCIPAL,
      algorithm: 'Ed25519',
      public_key_fingerprint: 'b'.repeat(64),
      issued_at: '2026-08-20T12:03:20.000Z',
      expires_at: '2027-08-19T12:03:20.000Z',
      supersedes_credential_id: null,
      secret_material_included: false,
      execution_authority: false,
      authority_effect: 'none',
      network_effect: 'none'
    }],
    events,
    recovery_proposals: [],
    authority_effect: 'none',
    network_effect: 'none',
    runtime_activation: false
  };
}

export function lifecycleEvent({ kind, at, previous = null, targetId = null, roleIds = null, coreExitId = null, id = null }) {
  return {
    schema: 'axiom-circle-member-eligibility-event.v0',
    event_id: id ?? `eligibility.lifecycle.${kind}`,
    circle_id: FIXTURE_CIRCLE_ID,
    membership_id: FIXTURE_MEMBERSHIP_ID,
    principal_id: FIXTURE_PRINCIPAL,
    kind,
    at,
    previous_event_digest: previous === null ? null : digestObject(previous),
    role_ids: roleIds,
    core_exit_id: coreExitId,
    authority_effect: 'none',
    network_effect: 'none',
    ...(targetId === null ? {} : { target_id: targetId })
  };
}

export async function buildLifecycleGridFixtureInput(overrides = {}) {
  const policies = await loadCircleLifecycleFixturePolicies();
  return {
    ...policies,
    circlePackage: lifecycleCirclePackage(),
    charterLifecycle: lifecycleCharterHistory(),
    historicalLedger: lifecycleHistoricalLedger(),
    membershipLifecycle: lifecycleMembershipHistory(),
    credentialLifecycle: lifecycleCredentialHistory(),
    previousGridLifecycleHeadDigest: null,
    now: FIXTURE_NOW,
    ...overrides
  };
}
