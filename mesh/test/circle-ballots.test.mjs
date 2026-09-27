import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
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
  circleBallotReceipt,
  createCircleBallot,
  verifyCircleDecision
} from '../src/lib/circle-ballots.mjs';

const keys = Object.fromEntries(
  ['alice', 'bob', 'carol', 'dana', 'erin'].map(name => [name, generateKeyPairSync('ed25519')])
);
const voterKeys = Object.fromEntries(Object.entries(keys).map(([name, pair]) => [name, pair.publicKey]));

const OPENED = '2026-08-20T13:00:00.000Z';
const CLOSES = '2026-08-22T13:00:00.000Z';
const DECIDED = '2026-08-22T12:00:00.000Z';

function circlePackage({ abstentionCounts = true, extraMembers = [] } = {}) {
  const circle = {
    schema: CIRCLE_SCHEMA,
    circle_id: 'circle.ballots',
    name: 'Ballot test Circle',
    purpose: 'Exercise signed ballots and tallies without authority.',
    created_by: 'alice',
    created_at: '2026-08-20T12:00:00.000Z',
    trust_anchor_id: 'anchor.ballots',
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
    effective_from: circle.created_at,
    supersedes_digest: null,
    roles: [
      { role_id: 'member', label: 'Member', declared_modes: ['propose', 'vote', 'appeal'], execution_authority: false },
      { role_id: 'reviewer', label: 'Reviewer', declared_modes: ['review', 'observe'], execution_authority: false }
    ],
    decision_rule: {
      quorum_basis_points: 5000,
      approval_basis_points: 6000,
      abstention_counts_toward_quorum: abstentionCounts
    },
    appeal_enabled: true,
    member_exit_enabled: true,
    execution_authority: false,
    authority_effect: 'none'
  };
  const charterDigest = digestObject(charter);
  const people = [
    { name: 'alice', role: 'member', accepted: '2026-08-20T12:05:00.000Z' },
    { name: 'bob', role: 'member', accepted: '2026-08-20T12:05:00.000Z' },
    { name: 'carol', role: 'member', accepted: '2026-08-20T12:05:00.000Z' },
    { name: 'dana', role: 'reviewer', accepted: '2026-08-20T12:05:00.000Z' },
    ...extraMembers
  ];
  const invitations = people.map(person => ({
    schema: CIRCLE_INVITATION_SCHEMA,
    invitation_id: `invite.${person.name}`,
    circle_id: circle.circle_id,
    invited_principal: person.name,
    membership_class: 'member',
    role_ids: [person.role],
    issued_by: 'alice',
    issued_at: '2026-08-20T12:01:00.000Z',
    expires_at: '2026-08-30T12:01:00.000Z',
    charter_digest: charterDigest,
    one_use: true,
    authority_effect: 'none'
  }));
  const memberships = people.map(person => ({
    schema: CIRCLE_MEMBERSHIP_SCHEMA,
    membership_id: `membership.${person.name}`,
    circle_id: circle.circle_id,
    invitation_id: `invite.${person.name}`,
    principal_id: person.name,
    role_ids: [person.role],
    accepted_at: person.accepted,
    status: 'active',
    status_effective_at: person.accepted,
    member_state_ownership: 'independent-node',
    disclosure_profile: 'selective',
    authority_effect: 'none',
    network_effect: 'none'
  }));
  const proposal = {
    schema: CIRCLE_PROPOSAL_SCHEMA,
    proposal_id: 'proposal.1',
    circle_id: circle.circle_id,
    charter_digest: charterDigest,
    proposer: 'alice',
    title: 'Adopt the shared calendar',
    summary: 'Decide whether to adopt a shared calendar. No effect is executed.',
    created_at: OPENED,
    closes_at: CLOSES,
    status: 'closed',
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

function ballot(document, name, choice, castAt = '2026-08-21T12:00:00.000Z', privateKey = keys[name].privateKey) {
  return createCircleBallot({
    circleId: document.circle.circle_id,
    proposalId: 'proposal.1',
    charterDigest: digestObject(document.charter),
    principalId: name,
    choice,
    castAt,
    privateKey
  });
}

function decide(document, outcome, ballots) {
  document.decisions = [{
    schema: CIRCLE_DECISION_SCHEMA,
    decision_id: 'decision.1',
    circle_id: document.circle.circle_id,
    proposal_id: 'proposal.1',
    charter_digest: digestObject(document.charter),
    outcome,
    decided_at: DECIDED,
    participant_receipts: ballots.map(circleBallotReceipt),
    finality: 'circle-local-accepted',
    runtime_authority: false,
    authority_effect: 'none'
  }];
  return document;
}

const verify = (document, ballots, overrides = {}) => verifyCircleDecision({
  document,
  decisionId: 'decision.1',
  ballots,
  voterKeys,
  ...overrides
});

test('a decision verifies only when its ballots produce its outcome under the charter', () => {
  const document = circlePackage();
  const ballots = [ballot(document, 'alice', 'approve'), ballot(document, 'bob', 'approve')];
  const tally = verify(decide(document, 'accepted', ballots), ballots);
  assert.deepEqual(
    { electorate: tally.electorate, approve: tally.approve, quorum: tally.quorum_met, outcome: tally.outcome },
    { electorate: 3, approve: 2, quorum: true, outcome: 'accepted' }
  );
  assert.equal(tally.authority_effect, 'none');

  const rejected = [ballot(document, 'alice', 'approve'), ballot(document, 'bob', 'reject'), ballot(document, 'carol', 'reject')];
  assert.throws(() => verify(decide(circlePackage(), 'accepted', rejected), rejected), /ballots give 'rejected'/);
  assert.equal(verify(decide(circlePackage(), 'rejected', rejected), rejected).outcome, 'rejected');

  const lonely = [ballot(document, 'alice', 'approve')];
  assert.throws(() => verify(decide(circlePackage(), 'accepted', lonely), lonely), /ballots give 'no-quorum'/);
  assert.equal(verify(decide(circlePackage(), 'no-quorum', lonely), lonely).outcome, 'no-quorum');
});

test('abstentions count toward quorum only when the charter says so', () => {
  const counts = circlePackage({ abstentionCounts: true });
  const ballots = [ballot(counts, 'alice', 'approve'), ballot(counts, 'bob', 'abstain')];
  assert.equal(verify(decide(counts, 'accepted', ballots), ballots).outcome, 'accepted');

  const excluded = circlePackage({ abstentionCounts: false });
  const same = [ballot(excluded, 'alice', 'approve'), ballot(excluded, 'bob', 'abstain')];
  assert.equal(verify(decide(excluded, 'no-quorum', same), same).outcome, 'no-quorum');
});

test('participant receipts must be exactly the ballots counted', () => {
  const document = circlePackage();
  const ballots = [ballot(document, 'alice', 'approve'), ballot(document, 'bob', 'approve')];
  decide(document, 'accepted', ballots);
  assert.throws(() => verify(document, ballots.slice(0, 1)), /ballots give 'no-quorum'|do not match/);
  document.decisions[0].participant_receipts.push('f'.repeat(64));
  assert.throws(() => verify(document, ballots), /participant_receipts do not match/);
});

test('ballots need a valid signature from the member\'s own key, one per member and one member per key', () => {
  const document = circlePackage();
  const forged = [ballot(document, 'alice', 'approve'), ballot(document, 'bob', 'approve', undefined, keys.carol.privateKey)];
  assert.throws(() => verify(decide(document, 'accepted', forged), forged), /signature from bob is invalid/);

  const twice = [ballot(document, 'alice', 'approve'), ballot(document, 'alice', 'approve', '2026-08-21T13:00:00.000Z')];
  assert.throws(() => verify(decide(circlePackage(), 'accepted', twice), twice), /more than one ballot/);

  const shared = { ...voterKeys, bob: keys.alice.publicKey };
  const sharedBallots = [ballot(document, 'alice', 'approve'), ballot(document, 'bob', 'approve', undefined, keys.alice.privateKey)];
  assert.throws(
    () => verify(decide(circlePackage(), 'accepted', sharedBallots), sharedBallots, { voterKeys: shared }),
    /One key cannot vote for more than one member/
  );

  const tampered = [ballot(document, 'alice', 'approve'), ballot(document, 'bob', 'reject')];
  const edited = [tampered[0], { ...tampered[1], body: { ...tampered[1].body, choice: 'approve' } }];
  assert.throws(() => verify(decide(circlePackage(), 'accepted', edited), edited), /signature from bob is invalid/);
});

test('only members who could vote when the proposal opened, and still could, are counted', () => {
  const reviewer = circlePackage();
  const byReviewer = [ballot(reviewer, 'alice', 'approve'), ballot(reviewer, 'dana', 'approve')];
  assert.throws(() => verify(decide(reviewer, 'accepted', byReviewer), byReviewer), /dana could not vote when the proposal opened/);

  const late = circlePackage({ extraMembers: [{ name: 'erin', role: 'member', accepted: '2026-08-21T00:00:00.000Z' }] });
  const byLateJoiner = [ballot(late, 'alice', 'approve'), ballot(late, 'erin', 'approve')];
  assert.throws(() => verify(decide(late, 'accepted', byLateJoiner), byLateJoiner), /erin could not vote when the proposal opened/);

  const exited = circlePackage();
  exited.exits = [{
    schema: 'axiom-circle-exit.v0',
    exit_id: 'exit.bob',
    circle_id: exited.circle.circle_id,
    membership_id: 'membership.bob',
    principal_id: 'bob',
    initiated_by: 'bob',
    kind: 'voluntary-exit',
    effective_at: '2026-08-21T06:00:00.000Z',
    reason_code: 'member-request',
    future_obligation_effect: 'ends-except-explicit-post-exit-rules',
    history_rewrite: false,
    authority_effect: 'none'
  }];
  const afterExit = [ballot(exited, 'alice', 'approve'), ballot(exited, 'bob', 'approve')];
  assert.throws(() => verify(decide(exited, 'accepted', afterExit), afterExit), /bob could not vote when the ballot was cast/);
  const beforeExit = [ballot(exited, 'alice', 'approve'), ballot(exited, 'bob', 'approve', '2026-08-21T05:00:00.000Z')];
  assert.equal(verify(decide(exited, 'accepted', beforeExit), beforeExit).outcome, 'accepted');
});

test('ballots are bound to the voting window, the proposal and the charter', () => {
  const document = circlePackage();
  for (const castAt of ['2026-08-20T12:59:59.000Z', '2026-08-22T12:30:00.000Z']) {
    const ballots = [ballot(document, 'alice', 'approve'), ballot(document, 'bob', 'approve', castAt)];
    assert.throws(() => verify(decide(circlePackage(), 'accepted', ballots), ballots), /outside the voting window/);
  }

  const otherCharter = createCircleBallot({
    circleId: document.circle.circle_id,
    proposalId: 'proposal.1',
    charterDigest: 'a'.repeat(64),
    principalId: 'bob',
    choice: 'approve',
    castAt: '2026-08-21T12:00:00.000Z',
    privateKey: keys.bob.privateKey
  });
  const ballots = [ballot(document, 'alice', 'approve'), otherCharter];
  assert.throws(() => verify(decide(circlePackage(), 'accepted', ballots), ballots), /not bound to this proposal and charter/);
});

test('Circle Ballot v0 schema preserves the inert boundary', async () => {
  const schema = JSON.parse(await readFile(new URL('../config/circle-ballot-v0.schema.json', import.meta.url), 'utf8'));
  assert.equal(schema.$schema, 'https://json-schema.org/draft/2020-12/schema');
  assert.equal(schema.additionalProperties, false);
  assert.equal(schema.properties.body.additionalProperties, false);
  assert.equal(schema.properties.body.properties.schema.const, 'axiom-circle-ballot.v0');
  assert.equal(schema.properties.body.properties.authority_effect.const, 'none');
  assert.equal(schema.properties.attestation.properties.algorithm.const, 'Ed25519');
  assert.equal(schema['x-axiom-semantic-validator'], 'mesh/src/lib/circle-ballots.mjs');
});
