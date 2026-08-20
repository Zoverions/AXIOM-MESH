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
  deriveCircleMembershipCredentialState,
  validateCircleMembershipCredentialLifecycle
} from '../../packages/axiom-circle-membership-credential-lifecycle/index.mjs';

const policyUrl = new URL('../config/circle-membership-credential-lifecycle.v0.json', import.meta.url);

async function loadPolicy() {
  return JSON.parse(await readFile(policyUrl, 'utf8'));
}

function circleFixture() {
  const circle = {
    schema: CIRCLE_SCHEMA,
    circle_id: 'circle.credential.hardening',
    name: 'Credential Hardening Circle',
    purpose: 'Exercise fail-closed credential lineage and compromise chronology.',
    created_by: 'human.alpha',
    created_at: '2026-08-20T12:00:00.000Z',
    trust_anchor_id: 'anchor.credential.hardening',
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
      declared_modes: ['observe'],
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
    invitation_id: 'invite.alpha.credential.hardening',
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
    membership_id: 'membership.alpha.credential.hardening',
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

function device(deviceId, registeredAt = '2026-08-20T12:05:00.000Z') {
  return {
    schema: 'axiom-circle-member-device.v0',
    device_id: deviceId,
    circle_id: 'circle.credential.hardening',
    membership_id: 'membership.alpha.credential.hardening',
    principal_id: 'human.alpha',
    registered_at: registeredAt,
    state_owner: 'independent-node',
    secret_material_included: false,
    execution_authority: false,
    authority_effect: 'none',
    network_effect: 'none'
  };
}

function credential({ id, deviceId, fingerprint, issuedAt, supersedes = null }) {
  return {
    schema: 'axiom-circle-member-device-credential.v0',
    credential_id: id,
    device_id: deviceId,
    circle_id: 'circle.credential.hardening',
    membership_id: 'membership.alpha.credential.hardening',
    principal_id: 'human.alpha',
    algorithm: 'Ed25519',
    public_key_fingerprint: fingerprint,
    issued_at: issuedAt,
    expires_at: '2027-08-19T12:06:00.000Z',
    supersedes_credential_id: supersedes,
    secret_material_included: false,
    execution_authority: false,
    authority_effect: 'none',
    network_effect: 'none'
  };
}

function lifecycleFixture() {
  return {
    schema: 'axiom-circle-membership-credential-lifecycle.v0',
    circle_id: 'circle.credential.hardening',
    membership_id: 'membership.alpha.credential.hardening',
    principal_id: 'human.alpha',
    term: {
      schema: 'axiom-circle-membership-term.v0',
      term_id: 'term.alpha.credential.hardening',
      circle_id: 'circle.credential.hardening',
      membership_id: 'membership.alpha.credential.hardening',
      principal_id: 'human.alpha',
      begins_at: '2026-08-20T12:02:00.000Z',
      ends_at: '2027-08-20T12:02:00.000Z',
      changes_core_membership: false,
      authority_effect: 'none'
    },
    devices: [device('device.alpha.phone')],
    credentials: [
      credential({
        id: 'credential.alpha.phone.1',
        deviceId: 'device.alpha.phone',
        fingerprint: 'a'.repeat(64),
        issuedAt: '2026-08-20T12:06:00.000Z'
      }),
      credential({
        id: 'credential.alpha.phone.2',
        deviceId: 'device.alpha.phone',
        fingerprint: 'b'.repeat(64),
        issuedAt: '2026-08-20T12:30:00.000Z',
        supersedes: 'credential.alpha.phone.1'
      })
    ],
    events: [],
    recovery_proposals: [],
    authority_effect: 'none',
    network_effect: 'none',
    runtime_activation: false
  };
}

function compromiseEvent(at = '2026-08-20T13:00:00.000Z') {
  return {
    schema: 'axiom-circle-member-credential-event.v0',
    event_id: 'event.device.alpha.phone.compromise',
    circle_id: 'circle.credential.hardening',
    membership_id: 'membership.alpha.credential.hardening',
    principal_id: 'human.alpha',
    target_type: 'device',
    target_id: 'device.alpha.phone',
    kind: 'device-compromise',
    at,
    reason_code: 'device-lost',
    authority_effect: 'none',
    network_effect: 'none'
  };
}

test('one device may have only one root credential lineage', async () => {
  const policy = await loadPolicy();
  const circle = circleFixture();
  const lifecycle = lifecycleFixture();
  lifecycle.credentials.push(credential({
    id: 'credential.alpha.phone.parallel-root',
    deviceId: 'device.alpha.phone',
    fingerprint: 'c'.repeat(64),
    issuedAt: '2026-08-20T12:40:00.000Z'
  }));

  assert.throws(
    () => validateCircleMembershipCredentialLifecycle(policy, circle, lifecycle),
    /cannot have parallel root credential lineages/
  );
  assert.throws(
    () => deriveCircleMembershipCredentialState(policy, circle, lifecycle, {
      asOf: '2026-08-20T12:45:00.000Z'
    }),
    /cannot have parallel root credential lineages/
  );
});

test('distinct devices retain independent single credential lineages', async () => {
  const policy = await loadPolicy();
  const circle = circleFixture();
  const lifecycle = lifecycleFixture();
  lifecycle.devices.push(device('device.alpha.laptop', '2026-08-20T12:07:00.000Z'));
  lifecycle.credentials.push(credential({
    id: 'credential.alpha.laptop.1',
    deviceId: 'device.alpha.laptop',
    fingerprint: 'c'.repeat(64),
    issuedAt: '2026-08-20T12:08:00.000Z'
  }));

  const result = validateCircleMembershipCredentialLifecycle(policy, circle, lifecycle);
  assert.equal(result.valid, true);
  assert.equal(result.device_count, 2);
  assert.equal(result.credential_count, 3);
});

test('a compromised device cannot issue or rotate credentials at or after compromise', async () => {
  const policy = await loadPolicy();
  const circle = circleFixture();
  const lifecycle = lifecycleFixture();
  lifecycle.events.push(compromiseEvent());
  lifecycle.credentials.push(credential({
    id: 'credential.alpha.phone.after-compromise',
    deviceId: 'device.alpha.phone',
    fingerprint: 'c'.repeat(64),
    issuedAt: '2026-08-20T13:01:00.000Z',
    supersedes: 'credential.alpha.phone.2'
  }));

  assert.throws(
    () => validateCircleMembershipCredentialLifecycle(policy, circle, lifecycle),
    /cannot issue credentials at or after compromise/
  );
  assert.throws(
    () => deriveCircleMembershipCredentialState(policy, circle, lifecycle, {
      asOf: '2026-08-20T13:05:00.000Z'
    }),
    /cannot issue credentials at or after compromise/
  );
});

test('credential issuance exactly at compromise also fails closed', async () => {
  const policy = await loadPolicy();
  const circle = circleFixture();
  const lifecycle = lifecycleFixture();
  lifecycle.events.push(compromiseEvent());
  lifecycle.credentials.push(credential({
    id: 'credential.alpha.phone.at-compromise',
    deviceId: 'device.alpha.phone',
    fingerprint: 'c'.repeat(64),
    issuedAt: '2026-08-20T13:00:00.000Z',
    supersedes: 'credential.alpha.phone.2'
  }));

  assert.throws(
    () => validateCircleMembershipCredentialLifecycle(policy, circle, lifecycle),
    /cannot issue credentials at or after compromise/
  );
});
