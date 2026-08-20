import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { digestObject } from '../src/lib/canonical.mjs';
import {
  CIRCLE_CHARTER_SCHEMA,
  CIRCLE_CORE_PACKAGE_SCHEMA,
  CIRCLE_INVITATION_SCHEMA,
  CIRCLE_MEMBERSHIP_SCHEMA,
  CIRCLE_PROPOSAL_SCHEMA,
  CIRCLE_SCHEMA
} from '../src/lib/circle-core.mjs';
import {
  simulateCircleDeliberation,
  validateCircleSimulationPolicy
} from '../../packages/axiom-circle-simulation/index.mjs';

const policyUrl = new URL('../config/circle-multiprincipal-simulation.v0.json', import.meta.url);

async function loadPolicy() {
  return JSON.parse(await readFile(policyUrl, 'utf8'));
}

function fixture() {
  const circle = {
    schema: CIRCLE_SCHEMA,
    circle_id: 'circle.simulation',
    name: 'Simulation Circle',
    purpose: 'Exercise plural deliberation without creating runtime authority.',
    created_by: 'human.alpha',
    created_at: '2026-08-20T12:00:00.000Z',
    trust_anchor_id: 'anchor.simulation',
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
  const charterDigest = digestObject(charter);
  const invitations = [
    {
      schema: CIRCLE_INVITATION_SCHEMA,
      invitation_id: 'invite.alpha',
      circle_id: circle.circle_id,
      invited_principal: 'human.alpha',
      membership_class: 'member',
      role_ids: ['member'],
      issued_by: 'human.alpha',
      issued_at: '2026-08-20T12:01:00.000Z',
      expires_at: '2026-08-27T12:01:00.000Z',
      charter_digest: charterDigest,
      one_use: true,
      authority_effect: 'none'
    },
    {
      schema: CIRCLE_INVITATION_SCHEMA,
      invitation_id: 'invite.beta',
      circle_id: circle.circle_id,
      invited_principal: 'human.beta',
      membership_class: 'member',
      role_ids: ['member'],
      issued_by: 'human.alpha',
      issued_at: '2026-08-20T12:01:30.000Z',
      expires_at: '2026-08-27T12:01:30.000Z',
      charter_digest: charterDigest,
      one_use: true,
      authority_effect: 'none'
    }
  ];
  const memberships = [
    {
      schema: CIRCLE_MEMBERSHIP_SCHEMA,
      membership_id: 'membership.alpha',
      circle_id: circle.circle_id,
      invitation_id: 'invite.alpha',
      principal_id: 'human.alpha',
      role_ids: ['member'],
      accepted_at: '2026-08-20T12:02:00.000Z',
      status: 'active',
      status_effective_at: '2026-08-20T12:02:00.000Z',
      member_state_ownership: 'independent-node',
      disclosure_profile: 'selective',
      authority_effect: 'none',
      network_effect: 'none'
    },
    {
      schema: CIRCLE_MEMBERSHIP_SCHEMA,
      membership_id: 'membership.beta',
      circle_id: circle.circle_id,
      invitation_id: 'invite.beta',
      principal_id: 'human.beta',
      role_ids: ['member'],
      accepted_at: '2026-08-20T12:02:30.000Z',
      status: 'active',
      status_effective_at: '2026-08-20T12:02:30.000Z',
      member_state_ownership: 'independent-node',
      disclosure_profile: 'selective',
      authority_effect: 'none',
      network_effect: 'none'
    }
  ];
  const proposal = {
    schema: CIRCLE_PROPOSAL_SCHEMA,
    proposal_id: 'proposal.simulation.1',
    circle_id: circle.circle_id,
    charter_digest: charterDigest,
    proposer: 'human.alpha',
    title: 'Test a simulated collaboration choice',
    summary: 'Exercise deliberation and vote accounting without producing a real Circle decision.',
    created_at: '2026-08-20T12:03:00.000Z',
    closes_at: '2026-08-22T12:03:00.000Z',
    status: 'open',
    evidence_refs: [],
    execution_effect: 'none',
    authority_effect: 'none'
  };
  return {
    schema: CIRCLE_CORE_PACKAGE_SCHEMA,
    version: 0,
    status: 'inert-contract-laboratory',
    circle,
    charter,
    invitations,
    memberships,
    proposals: [proposal],
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

function actions(document) {
  const charterDigest = digestObject(document.charter);
  const base = {
    schema: 'axiom-circle-simulation-action.v0',
    circle_id: document.circle.circle_id,
    charter_digest: charterDigest,
    proposal_id: document.proposals[0].proposal_id,
    authority_effect: 'none',
    network_effect: 'none'
  };
  return [
    {
      ...base,
      action_id: 'action.alpha.deliberate',
      membership_id: 'membership.alpha',
      principal_id: 'human.alpha',
      mode: 'deliberate',
      at: '2026-08-20T12:10:00.000Z',
      payload: { statement_digest: 'a'.repeat(64) }
    },
    {
      ...base,
      action_id: 'action.beta.evidence',
      membership_id: 'membership.beta',
      principal_id: 'human.beta',
      mode: 'evidence',
      at: '2026-08-20T12:11:00.000Z',
      payload: { evidence_ref: 'evidence:local:test-fixture' }
    },
    {
      ...base,
      action_id: 'action.alpha.vote',
      membership_id: 'membership.alpha',
      principal_id: 'human.alpha',
      mode: 'vote',
      at: '2026-08-20T12:12:00.000Z',
      payload: { choice: 'approve' }
    },
    {
      ...base,
      action_id: 'action.beta.vote',
      membership_id: 'membership.beta',
      principal_id: 'human.beta',
      mode: 'vote',
      at: '2026-08-20T12:13:00.000Z',
      payload: { choice: 'approve' }
    }
  ];
}

test('Circle multi-principal simulation policy is inert and non-authorizing', async () => {
  const policy = await loadPolicy();
  assert.equal(validateCircleSimulationPolicy(policy), true);
  assert.equal(policy.runtime_activation, false);
  assert.equal(policy.authority_effect, 'none');
  assert.equal(policy.network_effect, 'none');
  assert.equal(policy.output.finality, 'simulation-only');
  assert.equal(policy.output.may_mutate_circle, false);
  assert.equal(policy.output.may_mint_runtime_authority, false);
  assert.equal(policy.output.may_create_grid_event, false);
  assert.equal(policy.output.may_create_gateway_action, false);
});

test('two active principals can simulate deliberation and an accepted outcome without creating a decision', async () => {
  const policy = await loadPolicy();
  const document = fixture();
  const before = digestObject(document);
  const transcript = simulateCircleDeliberation(policy, document, actions(document), {
    now: new Date('2026-08-20T13:00:00.000Z')
  });
  assert.equal(digestObject(document), before);
  assert.equal(transcript.schema, 'axiom-circle-simulation-transcript.v0');
  assert.deepEqual(transcript.participant_principals, ['human.alpha', 'human.beta']);
  assert.equal(transcript.action_count, 4);
  assert.equal(transcript.proposal_results.length, 1);
  assert.deepEqual(transcript.proposal_results[0].votes, {
    approve: 2,
    reject: 0,
    abstain: 0
  });
  assert.equal(transcript.proposal_results[0].quorum_basis_points_observed, 10000);
  assert.equal(transcript.proposal_results[0].approval_basis_points_observed, 10000);
  assert.equal(transcript.proposal_results[0].simulated_outcome, 'accepted');
  assert.equal(transcript.proposal_results[0].creates_circle_decision, false);
  assert.equal(transcript.proposal_results[0].runtime_authority, false);
  assert.equal(transcript.finality, 'simulation-only');
  assert.equal(transcript.may_mutate_circle, false);
  assert.equal(transcript.may_mint_runtime_authority, false);
  assert.equal(transcript.authority_effect, 'none');
  assert.equal(transcript.network_effect, 'none');
  assert.equal(document.decisions.length, 0);
});

test('simulation requires actions from multiple distinct principals', async () => {
  const policy = await loadPolicy();
  const document = fixture();
  const attempted = actions(document).filter(action => action.principal_id === 'human.alpha');
  assert.throws(
    () => simulateCircleDeliberation(policy, document, attempted),
    /actions from multiple distinct principals/
  );
});

test('simulation rejects mode laundering through a role that does not declare vote', async () => {
  const policy = await loadPolicy();
  const document = fixture();
  document.invitations[1].role_ids = ['observer'];
  document.memberships[1].role_ids = ['observer'];
  const attempted = actions(document);
  assert.throws(
    () => simulateCircleDeliberation(policy, document, attempted),
    /role does not declare this mode/
  );
});

test('simulation rejects duplicate votes, stale charter substitution, and out-of-window actions', async () => {
  const policy = await loadPolicy();
  const document = fixture();

  const duplicate = actions(document);
  duplicate.push({
    ...duplicate[2],
    action_id: 'action.alpha.vote.again',
    at: '2026-08-20T12:14:00.000Z'
  });
  assert.throws(
    () => simulateCircleDeliberation(policy, document, duplicate),
    /one vote per membership per proposal/
  );

  const stale = actions(document);
  stale[1].charter_digest = 'f'.repeat(64);
  assert.throws(
    () => simulateCircleDeliberation(policy, document, stale),
    /action boundary is invalid/
  );

  const late = actions(document);
  late[3].at = '2026-08-23T12:13:00.000Z';
  assert.throws(
    () => simulateCircleDeliberation(policy, document, late),
    /outside the proposal window/
  );
});

test('simulation rejects duplicate active membership for one principal to prevent double-vote ambiguity', async () => {
  const policy = await loadPolicy();
  const document = fixture();
  document.invitations[1].invited_principal = 'human.alpha';
  document.memberships[1].principal_id = 'human.alpha';
  assert.throws(
    () => simulateCircleDeliberation(policy, document, actions(document)),
    /one active membership per principal/
  );
});
