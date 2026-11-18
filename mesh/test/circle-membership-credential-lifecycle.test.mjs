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
  deriveCircleMembershipCredentialState,
  validateCircleMembershipCredentialLifecycle,
  validateCircleMembershipCredentialPolicy
} from '../../packages/axiom-circle-membership-credential-lifecycle/index.mjs';

const policyUrl = new URL('../config/circle-membership-credential-lifecycle.v0.json', import.meta.url);

async function loadPolicy() {
  return JSON.parse(await readFile(policyUrl, 'utf8'));
}

function circleFixture() {
  const circle = {
    schema: CIRCLE_SCHEMA,
    circle_id: 'circle.credentials',
    name: 'Credential Test Circle',
    purpose: 'Exercise inert member device and credential lifecycle semantics.',
    created_by: 'human.alpha',
    created_at: '2026-08-20T12:00:00.000Z',
    trust_anchor_id: 'anchor.credentials',
    participation_model: 'voluntary',
    member_state_ownership: 'independent-node',
    policy_floor: 'raise-only',
    authority_effect: 'none',
    network_effect: 'none',
    runtime_activation: false
  };
  const charter = {
    schema: CIRCLE_CHARTER_SCHEMA,
    circle_id: circle.circle_id,
    version: 1,
    effective_from: '2026-08-20T12:00:00.000Z',
    supersedes_digest: null,
    roles: [{
      role_id: 'member',
      label: 'Member',
      declared_modes: ['deliberate', 'evidence', 'vote', 'observe'],
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
  const invitation = {
    schema: CIRCLE_INVITATION_SCHEMA,
    invitation_id: 'invite.alpha.credentials',
    circle_id: circle.circle_id,
    invited_principal: 'human.alpha',
    membership_class: 'member',
    role_ids: ['member'],
    issued_by: 'human.alpha',
    issued_at: '2026-08-20T12:01:00.000Z',
    expires_at: '2026-08-27T12:01:00.000Z',
    charter_digest: digestObject(charter),
    one_use: true,
    authority_effect: 'none'
  };
  const membership = {
    schema: CIRCLE_MEMBERSHIP_SCHEMA,
    membership_id: 'membership.alpha.credentials',
    circle_id: circle.circle_id,
    invitation_id: invitation.invitation_id,
    principal_id: 'human.alpha',
    role_ids: ['member'],
    accepted_at: '2026-08-20T12:02:00.000Z',
    status: 'active',
    status_effective_at: '2026-08-20T12:02:00.000Z',
    member_state_ownership: 'independent-node',
    disclosure_profile: 'selective',
    authority_effect: 'none',
    network_effect: 'none'
  };
  return {
    schema: CIRCLE_CORE_PACKAGE_SCHEMA,
    version: 0,
    status: 'inert-contract-laboratory',
    circle,
    charter,
    invitations: [invitation],
    memberships: [membership],
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

function lifecycleFixture() {
  return {
    schema: 'axiom-circle-membership-credential-lifecycle.v0',
    circle_id: 'circle.credentials',
    membership_id: 'membership.alpha.credentials',
    principal_id: 'human.alpha',
    term: {
      schema: 'axiom-circle-membership-term.v0',
      term_id: 'term.alpha.2026',
      circle_id: 'circle.credentials',
      membership_id: 'membership.alpha.credentials',
      principal_id: 'human.alpha',
      begins_at: '2026-08-20T12:02:00.000Z',
      ends_at: '2027-08-20T12:02:00.000Z',
      changes_core_membership: false,
      authority_effect: 'none'
    },
    devices: [{
      schema: 'axiom-circle-member-device.v0',
      device_id: 'device.alpha.phone',
      circle_id: 'circle.credentials',
      membership_id: 'membership.alpha.credentials',
      principal_id: 'human.alpha',
      registered_at: '2026-08-20T12:05:00.000Z',
      state_owner: 'independent-node',
      secret_material_included: false,
      execution_authority: false,
      authority_effect: 'none',
      network_effect: 'none'
    }],
    credentials: [
      {
        schema: 'axiom-circle-member-device-credential.v0',
        credential_id: 'credential.alpha.phone.1',
        device_id: 'device.alpha.phone',
        circle_id: 'circle.credentials',
        membership_id: 'membership.alpha.credentials',
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
      },
      {
        schema: 'axiom-circle-member-device-credential.v0',
        credential_id: 'credential.alpha.phone.2',
        device_id: 'device.alpha.phone',
        circle_id: 'circle.credentials',
        membership_id: 'membership.alpha.credentials',
        principal_id: 'human.alpha',
        algorithm: 'Ed25519',
        public_key_fingerprint: 'b'.repeat(64),
        issued_at: '2026-08-20T12:30:00.000Z',
        expires_at: '2027-08-19T12:30:00.000Z',
        supersedes_credential_id: 'credential.alpha.phone.1',
        secret_material_included: false,
        execution_authority: false,
        authority_effect: 'none',
        network_effect: 'none'
      }
    ],
    events: [
      {
        schema: 'axiom-circle-member-credential-event.v0',
        event_id: 'event.credential.suspend.1',
        circle_id: 'circle.credentials',
        membership_id: 'membership.alpha.credentials',
        principal_id: 'human.alpha',
        target_type: 'credential',
        target_id: 'credential.alpha.phone.2',
        kind: 'credential-suspend',
        at: '2026-08-20T13:00:00.000Z',
        reason_code: 'owner-pause',
        authority_effect: 'none',
        network_effect: 'none'
      },
      {
        schema: 'axiom-circle-member-credential-event.v0',
        event_id: 'event.credential.resume.1',
        circle_id: 'circle.credentials',
        membership_id: 'membership.alpha.credentials',
        principal_id: 'human.alpha',
        target_type: 'credential',
        target_id: 'credential.alpha.phone.2',
        kind: 'credential-resume',
        at: '2026-08-20T13:05:00.000Z',
        reason_code: 'owner-resume',
        authority_effect: 'none',
        network_effect: 'none'
      },
      {
        schema: 'axiom-circle-member-credential-event.v0',
        event_id: 'event.credential.revoke.1',
        circle_id: 'circle.credentials',
        membership_id: 'membership.alpha.credentials',
        principal_id: 'human.alpha',
        target_type: 'credential',
        target_id: 'credential.alpha.phone.2',
        kind: 'credential-revoke',
        at: '2026-08-20T13:10:00.000Z',
        reason_code: 'owner-revoke',
        authority_effect: 'none',
        network_effect: 'none'
      },
      {
        schema: 'axiom-circle-member-credential-event.v0',
        event_id: 'event.device.compromise.1',
        circle_id: 'circle.credentials',
        membership_id: 'membership.alpha.credentials',
        principal_id: 'human.alpha',
        target_type: 'device',
        target_id: 'device.alpha.phone',
        kind: 'device-compromise',
        at: '2026-08-20T14:00:00.000Z',
        reason_code: 'device-lost',
        authority_effect: 'none',
        network_effect: 'none'
      }
    ],
    recovery_proposals: [{
      schema: 'axiom-circle-member-recovery-proposal.v0',
      recovery_id: 'recovery.alpha.phone.1',
      circle_id: 'circle.credentials',
      membership_id: 'membership.alpha.credentials',
      principal_id: 'human.alpha',
      compromised_device_id: 'device.alpha.phone',
      proposed_replacement_device_id: 'device.alpha.phone.replacement',
      proposed_replacement_credential_id: 'credential.alpha.phone.replacement.1',
      proposed_at: '2026-08-20T14:05:00.000Z',
      grants_authority: false,
      requires_explicit_admission: true,
      authority_effect: 'none',
      network_effect: 'none'
    }],
    authority_effect: 'none',
    network_effect: 'none',
    runtime_activation: false
  };
}

test('Circle membership credential policy is inert, public-material-only, and non-authorizing', async () => {
  const policy = await loadPolicy();
  assert.equal(validateCircleMembershipCredentialPolicy(policy), true);
  assert.equal(policy.runtime_activation, false);
  assert.equal(policy.requirements.member_state_owner, 'independent-node');
  assert.equal(policy.requirements.public_material_only, true);
  assert.equal(policy.requirements.secret_material_included, false);
  assert.equal(policy.requirements.credential_may_change_roles, false);
  assert.equal(policy.requirements.credential_may_mint_execution_authority, false);
  assert.equal(policy.requirements.recovery_proposal_grants_authority, false);
  assert.equal(policy.output.portable_authority, false);
  assert.equal(policy.output.runtime_authority, false);
});

test('valid lifecycle binds one exact active membership and exact evidence digests', async () => {
  const policy = await loadPolicy();
  const circle = circleFixture();
  const lifecycle = lifecycleFixture();
  const result = validateCircleMembershipCredentialLifecycle(policy, circle, lifecycle, {
    now: new Date('2026-08-20T15:00:00.000Z')
  });
  assert.equal(result.valid, true);
  assert.equal(result.circle_id, circle.circle.circle_id);
  assert.equal(result.membership_id, circle.memberships[0].membership_id);
  assert.equal(result.principal_id, 'human.alpha');
  assert.equal(result.device_count, 1);
  assert.equal(result.credential_count, 2);
  assert.equal(result.event_count, 4);
  assert.equal(result.recovery_proposal_count, 1);
  assert.equal(result.policy_digest, digestObject(policy));
  assert.equal(result.circle_package_digest, digestObject(circle));
  assert.equal(result.lifecycle_digest, digestObject(lifecycle));
  assert.equal(result.authority_effect, 'none');
  assert.equal(result.network_effect, 'none');
});

test('derived credential state preserves rotation, suspension, revocation, and compromise chronology', async () => {
  const policy = await loadPolicy();
  const circle = circleFixture();
  const lifecycle = lifecycleFixture();

  const beforeRotation = deriveCircleMembershipCredentialState(policy, circle, lifecycle, {
    asOf: '2026-08-20T12:20:00.000Z'
  });
  assert.equal(beforeRotation.credentials[0].status, 'active');
  assert.equal(beforeRotation.credentials[0].authentication_eligible, true);
  assert.equal(beforeRotation.credentials[1].status, 'not-yet-issued');

  const afterRotation = deriveCircleMembershipCredentialState(policy, circle, lifecycle, {
    asOf: '2026-08-20T12:40:00.000Z'
  });
  assert.equal(afterRotation.credentials[0].status, 'superseded');
  assert.equal(afterRotation.credentials[0].authentication_eligible, false);
  assert.equal(afterRotation.credentials[1].status, 'active');

  const suspended = deriveCircleMembershipCredentialState(policy, circle, lifecycle, {
    asOf: '2026-08-20T13:02:00.000Z'
  });
  assert.equal(suspended.credentials[1].status, 'suspended');
  assert.equal(suspended.credentials[1].authentication_eligible, false);

  const resumed = deriveCircleMembershipCredentialState(policy, circle, lifecycle, {
    asOf: '2026-08-20T13:06:00.000Z'
  });
  assert.equal(resumed.credentials[1].status, 'active');

  const revoked = deriveCircleMembershipCredentialState(policy, circle, lifecycle, {
    asOf: '2026-08-20T13:11:00.000Z'
  });
  assert.equal(revoked.credentials[1].status, 'revoked');
  assert.equal(revoked.credentials[1].authentication_eligible, false);

  const compromised = deriveCircleMembershipCredentialState(policy, circle, lifecycle, {
    asOf: '2026-08-20T14:01:00.000Z'
  });
  assert.equal(compromised.credentials[0].status, 'device-compromised');
  assert.equal(compromised.credentials[1].status, 'device-compromised');
  assert.equal(compromised.credentials[1].grants_roles, false);
  assert.equal(compromised.credentials[1].grants_runtime_authority, false);
});

test('credential records cannot carry secret material or widen role/execution authority', async () => {
  const policy = await loadPolicy();
  const circle = circleFixture();

  const secret = lifecycleFixture();
  secret.credentials[0].secret_material_included = true;
  assert.throws(
    () => validateCircleMembershipCredentialLifecycle(policy, circle, secret),
    /credential is invalid/
  );

  const widened = lifecycleFixture();
  widened.credentials[0].role_ids = ['administrator'];
  assert.throws(
    () => validateCircleMembershipCredentialLifecycle(policy, circle, widened),
    /fields are invalid/
  );

  const executable = lifecycleFixture();
  executable.devices[0].execution_authority = true;
  assert.throws(
    () => validateCircleMembershipCredentialLifecycle(policy, circle, executable),
    /device is invalid/
  );
});

test('rotation rejects key reuse, binding changes, missing predecessors, and branching successors', async () => {
  const policy = await loadPolicy();
  const circle = circleFixture();

  const reused = lifecycleFixture();
  reused.credentials[1].public_key_fingerprint = reused.credentials[0].public_key_fingerprint;
  assert.throws(
    () => validateCircleMembershipCredentialLifecycle(policy, circle, reused),
    /cannot reuse a public key fingerprint/
  );

  const missing = lifecycleFixture();
  missing.credentials[1].supersedes_credential_id = 'credential.missing';
  assert.throws(
    () => validateCircleMembershipCredentialLifecycle(policy, circle, missing),
    /predecessor is invalid/
  );

  const branched = lifecycleFixture();
  branched.credentials.push({
    ...branched.credentials[1],
    credential_id: 'credential.alpha.phone.3',
    public_key_fingerprint: 'c'.repeat(64),
    issued_at: '2026-08-20T12:31:00.000Z'
  });
  assert.throws(
    () => validateCircleMembershipCredentialLifecycle(policy, circle, branched),
    /cannot branch from one predecessor/
  );
});

test('revocation is irreversible and a compromised device cannot be reactivated by credential events', async () => {
  const policy = await loadPolicy();
  const circle = circleFixture();

  const rerevoke = lifecycleFixture();
  rerevoke.events.splice(3, 0, {
    ...rerevoke.events[2],
    event_id: 'event.credential.revoke.again',
    at: '2026-08-20T13:11:00.000Z'
  });
  assert.throws(
    () => validateCircleMembershipCredentialLifecycle(policy, circle, rerevoke),
    /revocation is irreversible/
  );

  const reactivated = lifecycleFixture();
  reactivated.events.push({
    ...reactivated.events[1],
    event_id: 'event.credential.resume.after-compromise',
    at: '2026-08-20T14:01:00.000Z'
  });
  assert.throws(
    () => validateCircleMembershipCredentialLifecycle(policy, circle, reactivated),
    /cannot reactivate a compromised device/
  );
});

test('recovery proposal requires prior compromise and entirely new replacement identifiers', async () => {
  const policy = await loadPolicy();
  const circle = circleFixture();

  const noCompromise = lifecycleFixture();
  noCompromise.events = noCompromise.events.filter(event => event.kind !== 'device-compromise');
  assert.throws(
    () => validateCircleMembershipCredentialLifecycle(policy, circle, noCompromise),
    /requires prior device compromise/
  );

  const existingReplacement = lifecycleFixture();
  existingReplacement.recovery_proposals[0].proposed_replacement_device_id = 'device.alpha.phone';
  assert.throws(
    () => validateCircleMembershipCredentialLifecycle(policy, circle, existingReplacement),
    /recovery proposal is invalid/
  );

  const authority = lifecycleFixture();
  authority.recovery_proposals[0].grants_authority = true;
  assert.throws(
    () => validateCircleMembershipCredentialLifecycle(policy, circle, authority),
    /recovery proposal is invalid/
  );
});

test('lifecycle rejects expired/ended membership context and append-only exit ambiguity', async () => {
  const policy = await loadPolicy();

  const earlyTerm = lifecycleFixture();
  earlyTerm.term.begins_at = '2026-08-20T12:01:00.000Z';
  assert.throws(
    () => validateCircleMembershipCredentialLifecycle(policy, circleFixture(), earlyTerm),
    /term predates membership activation/
  );

  const exitedCircle = circleFixture();
  exitedCircle.exits.push({
    schema: CIRCLE_EXIT_SCHEMA,
    exit_id: 'exit.alpha.credentials',
    circle_id: exitedCircle.circle.circle_id,
    membership_id: exitedCircle.memberships[0].membership_id,
    principal_id: 'human.alpha',
    initiated_by: 'human.alpha',
    kind: 'voluntary-exit',
    effective_at: '2026-08-20T13:30:00.000Z',
    reason_code: 'member-request',
    future_obligation_effect: 'ends-except-explicit-post-exit-rules',
    history_rewrite: false,
    authority_effect: 'none'
  });
  assert.throws(
    () => validateCircleMembershipCredentialLifecycle(policy, exitedCircle, lifecycleFixture()),
    /rejects exit history on active membership/
  );
});
