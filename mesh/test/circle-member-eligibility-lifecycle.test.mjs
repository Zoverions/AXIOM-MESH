import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { digestObject } from '../src/lib/canonical.mjs';
import {
  CIRCLE_CHARTER_SCHEMA,
  CIRCLE_CORE_PACKAGE_SCHEMA,
  CIRCLE_EXIT_SCHEMA,
  CIRCLE_INVITATION_SCHEMA,
  CIRCLE_MEMBERSHIP_SCHEMA,
  CIRCLE_SCHEMA
} from '../src/lib/circle-core.mjs';
import {
  assessCircleMemberCredentialEligibility,
  resolveCircleMembershipStateAt,
  validateCircleMemberEligibilityPolicy,
  validateCircleMembershipStateLifecycle
} from '../../packages/axiom-circle-member-eligibility/index.mjs';

const NOW = new Date('2026-08-20T15:00:00.000Z');
const urls = {
  policy: new URL('../config/circle-member-eligibility-lifecycle.v0.json', import.meta.url),
  charterPolicy: new URL('../config/circle-charter-lifecycle.v0.json', import.meta.url),
  historicalBindingPolicy: new URL('../config/circle-historical-rule-binding.v0.json', import.meta.url),
  credentialPolicy: new URL('../config/circle-membership-credential-lifecycle.v0.json', import.meta.url)
};

async function policies() {
  const entries = await Promise.all(Object.entries(urls).map(async ([key, url]) => [
    key,
    JSON.parse(await readFile(url, 'utf8'))
  ]));
  return Object.fromEntries(entries);
}

function charter() {
  return {
    schema: CIRCLE_CHARTER_SCHEMA,
    circle_id: 'circle.eligibility',
    version: 1,
    effective_from: '2026-08-20T12:00:00.000Z',
    supersedes_digest: null,
    roles: [
      {
        role_id: 'governor',
        label: 'Governor',
        declared_modes: ['approve', 'propose', 'vote', 'review', 'observe'],
        execution_authority: false
      },
      {
        role_id: 'observer',
        label: 'Observer',
        declared_modes: ['observe'],
        execution_authority: false
      }
    ],
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

function circle() {
  return {
    schema: CIRCLE_SCHEMA,
    circle_id: 'circle.eligibility',
    name: 'Eligibility Circle',
    purpose: 'Exercise historical member eligibility without granting runtime authority.',
    created_by: 'human.alpha',
    created_at: '2026-08-20T12:00:00.000Z',
    trust_anchor_id: 'anchor.eligibility',
    participation_model: 'voluntary',
    member_state_ownership: 'independent-node',
    policy_floor: 'raise-only',
    authority_effect: 'none',
    network_effect: 'none',
    runtime_activation: false
  };
}

function invitation() {
  return {
    schema: CIRCLE_INVITATION_SCHEMA,
    invitation_id: 'invite.alpha.eligibility',
    circle_id: 'circle.eligibility',
    invited_principal: 'human.alpha',
    membership_class: 'member',
    role_ids: ['governor'],
    issued_by: 'human.alpha',
    issued_at: '2026-08-20T12:01:00.000Z',
    expires_at: '2026-08-21T12:01:00.000Z',
    charter_digest: digestObject(charter()),
    one_use: true,
    authority_effect: 'none'
  };
}

function acceptance() {
  return {
    schema: CIRCLE_MEMBERSHIP_SCHEMA,
    membership_id: 'membership.alpha.eligibility',
    circle_id: 'circle.eligibility',
    invitation_id: 'invite.alpha.eligibility',
    principal_id: 'human.alpha',
    role_ids: ['governor'],
    accepted_at: '2026-08-20T12:02:00.000Z',
    status: 'active',
    status_effective_at: '2026-08-20T12:02:00.000Z',
    member_state_ownership: 'independent-node',
    disclosure_profile: 'selective',
    authority_effect: 'none',
    network_effect: 'none'
  };
}

function corePackage({ status = 'active', statusEffectiveAt = '2026-08-20T12:02:00.000Z', roles = ['governor'], exit = null } = {}) {
  return {
    schema: CIRCLE_CORE_PACKAGE_SCHEMA,
    version: 0,
    status: 'inert-contract-laboratory',
    circle: circle(),
    charter: charter(),
    invitations: [invitation()],
    memberships: [{ ...acceptance(), status, status_effective_at: statusEffectiveAt, role_ids: [...roles] }],
    proposals: [],
    tasks: [],
    decisions: [],
    appeals: [],
    exits: exit === null ? [] : [exit],
    exports: [],
    authority_effect: 'none',
    network_effect: 'none',
    runtime_activation: false
  };
}

function charterLifecycle() {
  const value = charter();
  const charterDigest = digestObject(value);
  return {
    schema: 'axiom-circle-charter-lifecycle.v0',
    circle_id: 'circle.eligibility',
    entries: [{
      schema: 'axiom-circle-charter-history-entry.v0',
      circle_id: 'circle.eligibility',
      charter: value,
      charter_digest: charterDigest,
      recorded_at: '2026-08-20T12:00:00.000Z',
      activation: {
        schema: 'axiom-circle-charter-activation.v0',
        circle_id: 'circle.eligibility',
        charter_digest: charterDigest,
        basis_charter_digest: null,
        activated_at: value.effective_from,
        evidence_refs: ['evidence:eligibility:charter:v1'],
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

function binding({ id, type, record, previous = null, basis = null, eventTime, boundAt }) {
  const idField = type === 'invitation' ? 'invitation_id' : 'membership_id';
  return {
    schema: 'axiom-circle-historical-rule-binding.v0',
    binding_id: id,
    circle_id: 'circle.eligibility',
    record_type: type,
    record_id: record[idField],
    record_digest: digestObject(record),
    record,
    event_time: eventTime,
    bound_at: boundAt,
    previous_binding_digest: previous === null ? null : digestObject(previous),
    basis_binding_id: basis,
    binding_mode: type === 'invitation' ? 'resolve-at-event' : 'invitation-current-at-acceptance',
    governing_charter_digest: digestObject(charter()),
    authority_effect: 'none',
    network_effect: 'none',
    runtime_activation: false
  };
}

function historicalLedger() {
  const invite = invitation();
  const first = binding({
    id: 'binding.invite.alpha.eligibility',
    type: 'invitation',
    record: invite,
    eventTime: invite.issued_at,
    boundAt: '2026-08-20T12:01:10.000Z'
  });
  const accepted = acceptance();
  const second = binding({
    id: 'binding.membership.alpha.eligibility',
    type: 'membership',
    record: accepted,
    previous: first,
    basis: first.binding_id,
    eventTime: accepted.accepted_at,
    boundAt: '2026-08-20T12:02:10.000Z'
  });
  return {
    schema: 'axiom-circle-historical-rule-binding-ledger.v0',
    circle_id: 'circle.eligibility',
    bindings: [first, second],
    authority_effect: 'none',
    network_effect: 'none',
    runtime_activation: false
  };
}

function eligibilityLifecycle(events = []) {
  return {
    schema: 'axiom-circle-member-eligibility-lifecycle.v0',
    circle_id: 'circle.eligibility',
    membership_id: 'membership.alpha.eligibility',
    principal_id: 'human.alpha',
    acceptance_binding_id: 'binding.membership.alpha.eligibility',
    events,
    authority_effect: 'none',
    network_effect: 'none',
    runtime_activation: false
  };
}

function eligibilityEvent({ kind, at, roleIds = null, coreExitId = null, previous = null, id = `event.${kind}` }) {
  return {
    schema: 'axiom-circle-member-eligibility-event.v0',
    event_id: id,
    circle_id: 'circle.eligibility',
    membership_id: 'membership.alpha.eligibility',
    principal_id: 'human.alpha',
    kind,
    at,
    previous_event_digest: previous === null ? null : digestObject(previous),
    role_ids: roleIds,
    core_exit_id: coreExitId,
    authority_effect: 'none',
    network_effect: 'none'
  };
}

function credentialLifecycle({ events = [] } = {}) {
  return {
    schema: 'axiom-circle-membership-credential-lifecycle.v0',
    circle_id: 'circle.eligibility',
    membership_id: 'membership.alpha.eligibility',
    principal_id: 'human.alpha',
    term: {
      schema: 'axiom-circle-membership-term.v0',
      term_id: 'term.alpha.eligibility',
      circle_id: 'circle.eligibility',
      membership_id: 'membership.alpha.eligibility',
      principal_id: 'human.alpha',
      begins_at: '2026-08-20T12:02:00.000Z',
      ends_at: '2027-08-20T12:02:00.000Z',
      changes_core_membership: false,
      authority_effect: 'none'
    },
    devices: [{
      schema: 'axiom-circle-member-device.v0',
      device_id: 'device.alpha.eligibility',
      circle_id: 'circle.eligibility',
      membership_id: 'membership.alpha.eligibility',
      principal_id: 'human.alpha',
      registered_at: '2026-08-20T12:05:00.000Z',
      state_owner: 'independent-node',
      secret_material_included: false,
      execution_authority: false,
      authority_effect: 'none',
      network_effect: 'none'
    }],
    credentials: [{
      schema: 'axiom-circle-member-device-credential.v0',
      credential_id: 'credential.alpha.eligibility.1',
      device_id: 'device.alpha.eligibility',
      circle_id: 'circle.eligibility',
      membership_id: 'membership.alpha.eligibility',
      principal_id: 'human.alpha',
      algorithm: 'Ed25519',
      public_key_fingerprint: 'a'.repeat(64),
      issued_at: '2026-08-20T12:06:00.000Z',
      expires_at: '2027-08-19T12:06:00.000Z',
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

function credentialEvent({ kind = 'device-compromise', at = '2026-08-20T12:09:00.000Z' } = {}) {
  return {
    schema: 'axiom-circle-member-credential-event.v0',
    event_id: `event.${kind}.eligibility`,
    circle_id: 'circle.eligibility',
    membership_id: 'membership.alpha.eligibility',
    principal_id: 'human.alpha',
    target_type: kind === 'device-compromise' ? 'device' : 'credential',
    target_id: kind === 'device-compromise' ? 'device.alpha.eligibility' : 'credential.alpha.eligibility.1',
    kind,
    at,
    reason_code: 'security-event',
    authority_effect: 'none',
    network_effect: 'none'
  };
}

function coreExit(kind = 'revocation', effectiveAt = '2026-08-20T12:20:00.000Z') {
  return {
    schema: CIRCLE_EXIT_SCHEMA,
    exit_id: 'exit.alpha.eligibility',
    circle_id: 'circle.eligibility',
    membership_id: 'membership.alpha.eligibility',
    principal_id: 'human.alpha',
    initiated_by: 'human.alpha',
    kind,
    effective_at: effectiveAt,
    reason_code: 'eligibility-terminal',
    future_obligation_effect: 'ends-except-explicit-post-exit-rules',
    history_rewrite: false,
    authority_effect: 'none'
  };
}

async function lifecycleInput({ packageOverride = corePackage(), lifecycle = eligibilityLifecycle() } = {}) {
  const loaded = await policies();
  return {
    policy: loaded.policy,
    charterPolicy: loaded.charterPolicy,
    historicalBindingPolicy: loaded.historicalBindingPolicy,
    circlePackage: packageOverride,
    charterLifecycle: charterLifecycle(),
    historicalLedger: historicalLedger(),
    lifecycle,
    now: NOW
  };
}

async function credentialInput({
  packageOverride = corePackage(),
  membershipLifecycle = eligibilityLifecycle(),
  credentials = credentialLifecycle(),
  asOf = '2026-08-20T12:08:00.000Z',
  requiredMode = 'propose',
  principal = 'human.alpha'
} = {}) {
  const loaded = await policies();
  return {
    policy: loaded.policy,
    charterPolicy: loaded.charterPolicy,
    historicalBindingPolicy: loaded.historicalBindingPolicy,
    credentialPolicy: loaded.credentialPolicy,
    circlePackage: packageOverride,
    charterLifecycle: charterLifecycle(),
    historicalLedger: historicalLedger(),
    membershipLifecycle,
    credentialLifecycle: credentials,
    authenticatedPrincipal: principal,
    credentialId: 'credential.alpha.eligibility.1',
    asOf,
    requiredMode,
    now: NOW
  };
}

test('member eligibility policy is exact, inert, and refuses resume or role widening', async () => {
  const { policy } = await policies();
  assert.equal(validateCircleMemberEligibilityPolicy(policy), true);
  assert.equal(policy.requirements.membership_resume_supported, false);
  assert.equal(policy.requirements.role_widening_supported, false);
  assert.equal(policy.requirements.role_narrowing_only, true);
  assert.equal(policy.output.runtime_authority, false);
});

test('active acceptance resolves historically and credential eligibility remains non-authorizing', async () => {
  const input = await lifecycleInput();
  const validation = validateCircleMembershipStateLifecycle(input);
  assert.equal(validation.derived_status, 'active');
  assert.deepEqual(validation.derived_role_ids, ['governor']);

  const resolved = resolveCircleMembershipStateAt(input, { at: '2026-08-20T12:08:00.000Z' });
  assert.equal(resolved.membership_active, true);
  assert.deepEqual(resolved.role_ids, ['governor']);

  const result = assessCircleMemberCredentialEligibility(await credentialInput());
  assert.equal(result.assessment.credential_eligible, true);
  assert.equal(result.assessment.authenticated_principal_binding_checked, true);
  assert.equal(result.assessment.credential_possession_verified, false);
  assert.equal(result.assessment.caller_authentication_assurance_external, true);
  assert.equal(result.assessment.runtime_authority, false);
  assert.equal(result.assessment.external_effect_authority, false);
});

test('role narrowing is historical, monotonic, and blocks later use without rewriting earlier eligibility', async () => {
  const event = eligibilityEvent({
    kind: 'role-narrow',
    at: '2026-08-20T12:10:00.000Z',
    roleIds: []
  });
  const lifecycle = eligibilityLifecycle([event]);
  const packageOverride = corePackage({ roles: [] });
  const input = await lifecycleInput({ packageOverride, lifecycle });
  const before = resolveCircleMembershipStateAt(input, { at: '2026-08-20T12:08:00.000Z' });
  const after = resolveCircleMembershipStateAt(input, { at: '2026-08-20T12:12:00.000Z' });
  assert.deepEqual(before.role_ids, ['governor']);
  assert.deepEqual(after.role_ids, []);

  const beforeCredential = assessCircleMemberCredentialEligibility(await credentialInput({
    packageOverride,
    membershipLifecycle: lifecycle,
    asOf: '2026-08-20T12:08:00.000Z'
  }));
  assert.equal(beforeCredential.assessment.credential_eligible, true);

  const afterCredentialInput = await credentialInput({
    packageOverride,
    membershipLifecycle: lifecycle,
    asOf: '2026-08-20T12:12:00.000Z'
  });
  assert.throws(
    () => assessCircleMemberCredentialEligibility(afterCredentialInput),
    /lacks required propose mode/
  );
});

test('role widening fails closed even when the new role exists in the charter', async () => {
  const event = eligibilityEvent({
    kind: 'role-narrow',
    at: '2026-08-20T12:10:00.000Z',
    roleIds: ['governor', 'observer']
  });
  const input = await lifecycleInput({ lifecycle: eligibilityLifecycle([event]) });
  assert.throws(() => validateCircleMembershipStateLifecycle(input), /cannot add or substitute roles/);
});

test('suspension is one-way in v0 and current snapshot must match derived history', async () => {
  const suspend = eligibilityEvent({ kind: 'membership-suspend', at: '2026-08-20T12:15:00.000Z' });
  const lifecycle = eligibilityLifecycle([suspend]);
  const suspendedPackage = corePackage({ status: 'suspended', statusEffectiveAt: suspend.at });
  const input = await lifecycleInput({ packageOverride: suspendedPackage, lifecycle });
  assert.equal(resolveCircleMembershipStateAt(input, { at: '2026-08-20T12:14:00.000Z' }).status, 'active');
  assert.equal(resolveCircleMembershipStateAt(input, { at: '2026-08-20T12:16:00.000Z' }).status, 'suspended');

  const suspendedCredentialInput = await credentialInput({
    packageOverride: suspendedPackage,
    membershipLifecycle: lifecycle,
    asOf: '2026-08-20T12:16:00.000Z'
  });
  assert.throws(() => assessCircleMemberCredentialEligibility(suspendedCredentialInput), /membership is not active/);

  const staleInput = await lifecycleInput({ packageOverride: corePackage(), lifecycle });
  assert.throws(() => validateCircleMembershipStateLifecycle(staleInput), /snapshot does not match derived eligibility head/);
});

test('terminal revocation binds exactly one matching Circle Core exit and is irreversible', async () => {
  const exit = coreExit();
  const revoke = eligibilityEvent({
    kind: 'membership-revoke',
    at: exit.effective_at,
    coreExitId: exit.exit_id
  });
  const packageOverride = corePackage({
    status: 'revoked',
    statusEffectiveAt: exit.effective_at,
    exit
  });
  const lifecycle = eligibilityLifecycle([revoke]);
  const input = await lifecycleInput({ packageOverride, lifecycle });
  assert.equal(resolveCircleMembershipStateAt(input, { at: '2026-08-20T12:21:00.000Z' }).status, 'revoked');

  const later = eligibilityEvent({
    kind: 'role-narrow',
    at: '2026-08-20T12:25:00.000Z',
    roleIds: [],
    previous: revoke,
    id: 'event.after.revoke'
  });
  const invalid = await lifecycleInput({
    packageOverride,
    lifecycle: eligibilityLifecycle([revoke, later])
  });
  assert.throws(() => validateCircleMembershipStateLifecycle(invalid), /terminal state is irreversible/);
});

test('compromised credential cannot become eligible even while membership itself remains active', async () => {
  const credentials = credentialLifecycle({ events: [credentialEvent()] });
  const input = await credentialInput({
    credentials,
    asOf: '2026-08-20T12:10:00.000Z'
  });
  assert.throws(() => assessCircleMemberCredentialEligibility(input), /credential is not authentication-eligible/);
});

test('wrong authenticated principal cannot borrow another member credential', async () => {
  const input = await credentialInput({ principal: 'human.beta' });
  assert.throws(() => assessCircleMemberCredentialEligibility(input), /does not match membership principal/);
});
