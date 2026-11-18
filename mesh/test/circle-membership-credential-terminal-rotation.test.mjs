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
import { validateCircleMembershipCredentialLifecycle } from '../../packages/axiom-circle-membership-credential-lifecycle/index.mjs';

const policyUrl = new URL('../config/circle-membership-credential-lifecycle.v0.json', import.meta.url);

async function loadPolicy() {
  return JSON.parse(await readFile(policyUrl, 'utf8'));
}

function circleFixture() {
  const circle = {
    schema: CIRCLE_SCHEMA,
    circle_id: 'circle.terminal.rotation',
    name: 'Terminal Rotation Circle',
    purpose: 'Reject ordinary rotation after terminal credential invalidation.',
    created_by: 'human.alpha',
    created_at: '2026-08-20T12:00:00.000Z',
    trust_anchor_id: 'anchor.terminal.rotation',
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
    invitation_id: 'invite.alpha.terminal.rotation',
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
    membership_id: 'membership.alpha.terminal.rotation',
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

function baseLifecycle() {
  return {
    schema: 'axiom-circle-membership-credential-lifecycle.v0',
    circle_id: 'circle.terminal.rotation',
    membership_id: 'membership.alpha.terminal.rotation',
    principal_id: 'human.alpha',
    term: {
      schema: 'axiom-circle-membership-term.v0',
      term_id: 'term.alpha.terminal.rotation',
      circle_id: 'circle.terminal.rotation',
      membership_id: 'membership.alpha.terminal.rotation',
      principal_id: 'human.alpha',
      begins_at: '2026-08-20T12:02:00.000Z',
      ends_at: '2027-08-20T12:02:00.000Z',
      changes_core_membership: false,
      authority_effect: 'none'
    },
    devices: [{
      schema: 'axiom-circle-member-device.v0',
      device_id: 'device.alpha.phone',
      circle_id: 'circle.terminal.rotation',
      membership_id: 'membership.alpha.terminal.rotation',
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
      credential_id: 'credential.alpha.phone.1',
      device_id: 'device.alpha.phone',
      circle_id: 'circle.terminal.rotation',
      membership_id: 'membership.alpha.terminal.rotation',
      principal_id: 'human.alpha',
      algorithm: 'Ed25519',
      public_key_fingerprint: 'a'.repeat(64),
      issued_at: '2026-08-20T12:06:00.000Z',
      expires_at: '2026-08-20T13:00:00.000Z',
      supersedes_credential_id: null,
      secret_material_included: false,
      execution_authority: false,
      authority_effect: 'none',
      network_effect: 'none'
    }],
    events: [],
    recovery_proposals: [],
    authority_effect: 'none',
    network_effect: 'none',
    runtime_activation: false
  };
}

function successor(issuedAt) {
  return {
    schema: 'axiom-circle-member-device-credential.v0',
    credential_id: 'credential.alpha.phone.2',
    device_id: 'device.alpha.phone',
    circle_id: 'circle.terminal.rotation',
    membership_id: 'membership.alpha.terminal.rotation',
    principal_id: 'human.alpha',
    algorithm: 'Ed25519',
    public_key_fingerprint: 'b'.repeat(64),
    issued_at: issuedAt,
    expires_at: '2027-08-19T12:06:00.000Z',
    supersedes_credential_id: 'credential.alpha.phone.1',
    secret_material_included: false,
    execution_authority: false,
    authority_effect: 'none',
    network_effect: 'none'
  };
}

function revocation(at) {
  return {
    schema: 'axiom-circle-member-credential-event.v0',
    event_id: 'event.credential.alpha.phone.1.revoke',
    circle_id: 'circle.terminal.rotation',
    membership_id: 'membership.alpha.terminal.rotation',
    principal_id: 'human.alpha',
    target_type: 'credential',
    target_id: 'credential.alpha.phone.1',
    kind: 'credential-revoke',
    at,
    reason_code: 'owner-revoke',
    authority_effect: 'none',
    network_effect: 'none'
  };
}

test('rotation before predecessor revocation and expiry remains valid', async () => {
  const policy = await loadPolicy();
  const lifecycle = baseLifecycle();
  lifecycle.credentials.push(successor('2026-08-20T12:40:00.000Z'));
  lifecycle.events.push(revocation('2026-08-20T12:45:00.000Z'));
  const result = validateCircleMembershipCredentialLifecycle(policy, circleFixture(), lifecycle);
  assert.equal(result.valid, true);
});

test('ordinary rotation at or after predecessor revocation fails closed', async () => {
  const policy = await loadPolicy();

  for (const issuedAt of ['2026-08-20T12:45:00.000Z', '2026-08-20T12:46:00.000Z']) {
    const lifecycle = baseLifecycle();
    lifecycle.credentials.push(successor(issuedAt));
    lifecycle.events.push(revocation('2026-08-20T12:45:00.000Z'));
    assert.throws(
      () => validateCircleMembershipCredentialLifecycle(policy, circleFixture(), lifecycle),
      /cannot rotate from a revoked predecessor/
    );
  }
});

test('ordinary rotation at or after predecessor expiry fails closed', async () => {
  const policy = await loadPolicy();

  for (const issuedAt of ['2026-08-20T13:00:00.000Z', '2026-08-20T13:01:00.000Z']) {
    const lifecycle = baseLifecycle();
    lifecycle.credentials.push(successor(issuedAt));
    assert.throws(
      () => validateCircleMembershipCredentialLifecycle(policy, circleFixture(), lifecycle),
      /cannot rotate from an expired predecessor/
    );
  }
});
