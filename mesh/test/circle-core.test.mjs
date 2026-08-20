import assert from 'node:assert/strict';
import test from 'node:test';

import { digestObject } from '../src/lib/canonical.mjs';
import {
  CIRCLE_APPEAL_SCHEMA,
  CIRCLE_CHARTER_SCHEMA,
  CIRCLE_CORE_PACKAGE_SCHEMA,
  CIRCLE_DECISION_SCHEMA,
  CIRCLE_EXPORT_SCHEMA,
  CIRCLE_INVITATION_SCHEMA,
  CIRCLE_MEMBERSHIP_SCHEMA,
  CIRCLE_PROPOSAL_SCHEMA,
  CIRCLE_SCHEMA,
  CIRCLE_TASK_SCHEMA,
  circleCoreDigest,
  validateCircleCorePackage
} from '../src/lib/circle-core.mjs';

function fixture() {
  const circle = {
    schema: CIRCLE_SCHEMA,
    circle_id: 'circle.research-alpha',
    name: 'Research Alpha',
    purpose: 'Coordinate a low-risk research collaboration without ambient authority.',
    created_by: 'human.owner',
    created_at: '2026-08-20T12:00:00.000Z',
    trust_anchor_id: 'anchor.research-alpha',
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
    roles: [
      {
        role_id: 'member',
        label: 'Member',
        declared_modes: ['propose', 'deliberate', 'evidence', 'vote', 'appeal', 'observe'],
        execution_authority: false
      },
      {
        role_id: 'reviewer',
        label: 'Independent reviewer',
        declared_modes: ['evidence', 'review', 'appeal', 'observe'],
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
  const charterDigest = digestObject(charter);
  const invitation = {
    schema: CIRCLE_INVITATION_SCHEMA,
    invitation_id: 'invite.owner.1',
    circle_id: circle.circle_id,
    invited_principal: 'human.owner',
    membership_class: 'member',
    role_ids: ['member'],
    issued_by: 'human.owner',
    issued_at: '2026-08-20T12:01:00.000Z',
    expires_at: '2026-08-27T12:01:00.000Z',
    charter_digest: charterDigest,
    one_use: true,
    authority_effect: 'none'
  };
  const membership = {
    schema: CIRCLE_MEMBERSHIP_SCHEMA,
    membership_id: 'membership.owner.1',
    circle_id: circle.circle_id,
    invitation_id: invitation.invitation_id,
    principal_id: 'human.owner',
    role_ids: ['member'],
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
    proposal_id: 'proposal.study.1',
    circle_id: circle.circle_id,
    charter_digest: charterDigest,
    proposer: 'human.owner',
    title: 'Run a bounded literature reproduction',
    summary: 'Approve a non-consequential local reproduction and retain evidence for later review.',
    created_at: '2026-08-20T12:03:00.000Z',
    closes_at: '2026-08-22T12:03:00.000Z',
    status: 'open',
    evidence_refs: [],
    execution_effect: 'none',
    authority_effect: 'none'
  };
  const task = {
    schema: CIRCLE_TASK_SCHEMA,
    task_id: 'task.reproduce.1',
    circle_id: circle.circle_id,
    proposal_id: proposal.proposal_id,
    assigned_membership_id: membership.membership_id,
    description: 'Prepare a reproducible evidence package. This record does not grant execution authority.',
    created_at: '2026-08-20T12:04:00.000Z',
    due_at: '2026-08-23T12:04:00.000Z',
    status: 'open',
    evidence_refs: [],
    execution_authority: false,
    authority_effect: 'none'
  };
  const decision = {
    schema: CIRCLE_DECISION_SCHEMA,
    decision_id: 'decision.study.1',
    circle_id: circle.circle_id,
    proposal_id: proposal.proposal_id,
    charter_digest: charterDigest,
    outcome: 'accepted',
    decided_at: '2026-08-21T12:00:00.000Z',
    participant_receipts: [],
    finality: 'circle-local-accepted',
    runtime_authority: false,
    authority_effect: 'none'
  };
  const appeal = {
    schema: CIRCLE_APPEAL_SCHEMA,
    appeal_id: 'appeal.study.1',
    circle_id: circle.circle_id,
    target_type: 'decision',
    target_id: decision.decision_id,
    filed_by: 'human.owner',
    reason: 'Request an explicit review of the evidence threshold before any later effect is considered.',
    filed_at: '2026-08-21T12:10:00.000Z',
    status: 'open',
    resolved_at: null,
    authority_effect: 'none'
  };
  const exportRecord = {
    schema: CIRCLE_EXPORT_SCHEMA,
    export_id: 'circle-export.1',
    circle_id: circle.circle_id,
    exported_by: 'human.owner',
    exported_at: '2026-08-21T12:20:00.000Z',
    disclosure_class: 'member-private',
    included_record_digests: [digestObject(proposal), digestObject(decision)],
    portable_authority: false,
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
    proposals: [proposal],
    tasks: [task],
    decisions: [decision],
    appeals: [appeal],
    exits: [],
    exports: [exportRecord],
    authority_effect: 'none',
    network_effect: 'none',
    runtime_activation: false
  };
}

function clone(value) {
  return structuredClone(value);
}

test('Circle Core v0 validates a bounded inert collaboration package', () => {
  const document = fixture();
  const result = validateCircleCorePackage(document, {
    now: new Date('2026-08-21T13:00:00.000Z')
  });
  assert.equal(result.valid, true);
  assert.equal(result.circle_id, document.circle.circle_id);
  assert.equal(result.charter_digest, digestObject(document.charter));
  assert.equal(result.package_digest, digestObject(document));
  assert.equal(result.authority_effect, 'none');
  assert.equal(result.network_effect, 'none');
  assert.equal(result.runtime_activation, false);
  assert.deepEqual(result.counts, {
    invitations: 1,
    memberships: 1,
    proposals: 1,
    tasks: 1,
    decisions: 1,
    appeals: 1,
    exits: 0,
    exports: 1
  });
  assert.equal(circleCoreDigest(document), digestObject(document));
});

test('Circle Core v0 rejects unknown fields and activation laundering', () => {
  const unknown = fixture();
  unknown.circle.hidden_authority = true;
  assert.throws(() => validateCircleCorePackage(unknown), /fields are invalid/);

  const activated = fixture();
  activated.runtime_activation = true;
  assert.throws(() => validateCircleCorePackage(activated), /activation boundary/);

  const networked = fixture();
  networked.circle.network_effect = 'federate';
  assert.throws(() => validateCircleCorePackage(networked), /descriptor is invalid/);
});

test('Circle membership cannot widen roles beyond the exact invitation', () => {
  const document = fixture();
  document.memberships[0].role_ids = ['member', 'reviewer'];
  assert.throws(() => validateCircleCorePackage(document), /membership is invalid/);
});

test('Circle membership rejects acceptance after invitation expiry', () => {
  const document = fixture();
  document.memberships[0].accepted_at = '2026-08-28T12:02:00.000Z';
  document.memberships[0].status_effective_at = '2026-08-28T12:02:00.000Z';
  assert.throws(() => validateCircleCorePackage(document), /expired invitation/);
});

test('Circle one-use invitation cannot create multiple membership records', () => {
  const document = fixture();
  const duplicate = clone(document.memberships[0]);
  duplicate.membership_id = 'membership.owner.2';
  duplicate.status = 'revoked';
  duplicate.status_effective_at = '2026-08-20T12:03:00.000Z';
  document.memberships.push(duplicate);
  assert.throws(
    () => validateCircleCorePackage(document),
    /one-use and cannot create multiple memberships/
  );
});

test('Circle records reject cross-Circle and stale-charter substitution', () => {
  const wrongCircle = fixture();
  wrongCircle.proposals[0].circle_id = 'circle.other';
  assert.throws(() => validateCircleCorePackage(wrongCircle), /proposal is invalid/);

  const staleCharter = fixture();
  staleCharter.decisions[0].charter_digest = '0'.repeat(64);
  assert.throws(() => validateCircleCorePackage(staleCharter), /decision is invalid/);
});

test('Circle decisions and tasks cannot mint runtime execution authority', () => {
  const decision = fixture();
  decision.decisions[0].runtime_authority = true;
  assert.throws(() => validateCircleCorePackage(decision), /decision is invalid/);

  const task = fixture();
  task.tasks[0].execution_authority = true;
  assert.throws(() => validateCircleCorePackage(task), /task is invalid/);
});

test('Circle exit appends history instead of rewriting membership', () => {
  const document = fixture();
  document.exits.push({
    schema: 'axiom-circle-exit.v0',
    exit_id: 'exit.owner.1',
    circle_id: document.circle.circle_id,
    membership_id: document.memberships[0].membership_id,
    principal_id: document.memberships[0].principal_id,
    initiated_by: document.memberships[0].principal_id,
    kind: 'voluntary-exit',
    effective_at: '2026-08-24T12:00:00.000Z',
    reason_code: 'member-request',
    future_obligation_effect: 'ends-except-explicit-post-exit-rules',
    history_rewrite: false,
    authority_effect: 'none'
  });
  assert.equal(document.memberships[0].status, 'active');
  const result = validateCircleCorePackage(document);
  assert.equal(result.counts.exits, 1);

  const rewritten = clone(document);
  rewritten.exits[0].history_rewrite = true;
  assert.throws(() => validateCircleCorePackage(rewritten), /exit is invalid/);
});

test('Circle export carries records but never portable authority', () => {
  const document = fixture();
  document.exports[0].portable_authority = true;
  assert.throws(() => validateCircleCorePackage(document), /export is invalid/);
});
