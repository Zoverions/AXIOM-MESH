import assert from 'node:assert/strict';
import test from 'node:test';

import { digestObject } from '../src/lib/canonical.mjs';
import {
  CIRCLE_CHARTER_SCHEMA,
  CIRCLE_CORE_PACKAGE_SCHEMA,
  CIRCLE_INVITATION_SCHEMA,
  CIRCLE_MEMBERSHIP_SCHEMA,
  CIRCLE_PROPOSAL_SCHEMA,
  CIRCLE_SCHEMA,
  CIRCLE_TASK_SCHEMA,
  validateCircleCorePackage
} from '../src/lib/circle-core.mjs';

function ceilingFixture() {
  const circle = {
    schema: CIRCLE_SCHEMA,
    circle_id: 'circle.boundary-test',
    name: 'Boundary Test',
    purpose: 'Exercise the published Circle Core role and evidence collection ceilings.',
    created_by: 'human.owner',
    created_at: '2026-08-20T12:00:00.000Z',
    trust_anchor_id: 'anchor.boundary-test',
    participation_model: 'voluntary',
    member_state_ownership: 'independent-node',
    policy_floor: 'raise-only',
    authority_effect: 'none',
    network_effect: 'none',
    runtime_activation: false
  };

  const roles = Array.from({ length: 64 }, (_, index) => ({
    role_id: `role.${index + 1}`,
    label: `Role ${index + 1}`,
    declared_modes: ['observe'],
    execution_authority: false
  }));

  const charter = {
    schema: CIRCLE_CHARTER_SCHEMA,
    circle_id: circle.circle_id,
    version: 1,
    effective_from: '2026-08-20T12:00:00.000Z',
    supersedes_digest: null,
    roles,
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

  const charterDigest = digestObject(charter);
  const roleIds = roles.map(role => role.role_id);
  const evidenceRefs = Array.from({ length: 512 }, (_, index) => `evidence:${index + 1}`);

  const invitation = {
    schema: CIRCLE_INVITATION_SCHEMA,
    invitation_id: 'invite.boundary.1',
    circle_id: circle.circle_id,
    invited_principal: 'human.owner',
    membership_class: 'member',
    role_ids: roleIds,
    issued_by: 'human.owner',
    issued_at: '2026-08-20T12:01:00.000Z',
    expires_at: '2026-08-27T12:01:00.000Z',
    charter_digest: charterDigest,
    one_use: true,
    authority_effect: 'none'
  };

  const membership = {
    schema: CIRCLE_MEMBERSHIP_SCHEMA,
    membership_id: 'membership.boundary.1',
    circle_id: circle.circle_id,
    invitation_id: invitation.invitation_id,
    principal_id: 'human.owner',
    role_ids: roleIds,
    accepted_at: '2026-08-20T12:02:00.000Z',
    status: 'active',
    status_effective_at: '2026-08-20T12:02:00.000Z',
    member_state_ownership: 'independent-node',
    disclosure_profile: 'selective',
    authority_effect: 'none',
    network_effect: 'none'
  };

  const proposal = {
    schema: CIRCLE_PROPOSAL_SCHEMA,
    proposal_id: 'proposal.boundary.1',
    circle_id: circle.circle_id,
    charter_digest: charterDigest,
    proposer: 'human.owner',
    title: 'Exercise collection ceilings',
    summary: 'Confirm semantic validation accepts the same maximum collection sizes as the published schema.',
    created_at: '2026-08-20T12:03:00.000Z',
    closes_at: '2026-08-21T12:03:00.000Z',
    status: 'open',
    evidence_refs: evidenceRefs,
    execution_effect: 'none',
    authority_effect: 'none'
  };

  const taskRecord = {
    schema: CIRCLE_TASK_SCHEMA,
    task_id: 'task.boundary.1',
    circle_id: circle.circle_id,
    proposal_id: proposal.proposal_id,
    assigned_membership_id: membership.membership_id,
    description: 'Retain boundary evidence without granting execution authority.',
    created_at: '2026-08-20T12:04:00.000Z',
    due_at: null,
    status: 'open',
    evidence_refs: evidenceRefs,
    execution_authority: false,
    authority_effect: 'none'
  };

  return {
    schema: CIRCLE_CORE_PACKAGE_SCHEMA,
    version: 0,
    status: 'inert-contract-laboratory',
    circle,
    charter,
    invitations: [invitation],
    memberships: [membership],
    proposals: [proposal],
    tasks: [taskRecord],
    decisions: [],
    appeals: [],
    exits: [],
    exports: [],
    authority_effect: 'none',
    network_effect: 'none',
    runtime_activation: false
  };
}

test('Circle Core semantic validation accepts exact published collection ceilings', () => {
  const document = ceilingFixture();
  const result = validateCircleCorePackage(document);

  assert.equal(document.charter.roles.length, 64);
  assert.equal(document.invitations[0].role_ids.length, 64);
  assert.equal(document.memberships[0].role_ids.length, 64);
  assert.equal(document.proposals[0].evidence_refs.length, 512);
  assert.equal(document.tasks[0].evidence_refs.length, 512);
  assert.equal(result.valid, true);
});
