import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import test from 'node:test';

import { digestObject } from '../src/lib/canonical.mjs';
import {
  CIRCLE_CHARTER_SCHEMA,
  CIRCLE_INVITATION_SCHEMA,
  CIRCLE_MEMBERSHIP_SCHEMA,
  CIRCLE_PROPOSAL_SCHEMA,
  CIRCLE_SCHEMA
} from '../src/lib/circle-core.mjs';
import { createCircleBallot } from '../src/lib/circle-ballots.mjs';
import {
  CircleReplica,
  createCircleGenesis,
  createCircleUpdate
} from '../src/lib/circle-exchange.mjs';

const people = ['alice', 'bob', 'carol', 'dana', 'mallory'];
const keys = Object.fromEntries(people.map(name => [name, generateKeyPairSync('ed25519')]));
const roster = Object.fromEntries(people.map(name => [name, keys[name].publicKey]));
const AFTER_CLOSE = '2026-08-23T00:00:00.000Z';

function genesisFor({ quorum = 5000 } = {}) {
  const circle = {
    schema: CIRCLE_SCHEMA,
    circle_id: 'circle.exchange',
    name: 'Exchange test Circle',
    purpose: 'Exchange Circle records between members’ own nodes without authority.',
    created_by: 'alice',
    created_at: '2026-08-20T12:00:00.000Z',
    trust_anchor_id: 'anchor.exchange',
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
      { role_id: 'steward', label: 'Steward', declared_modes: ['propose', 'vote', 'approve', 'appeal'], execution_authority: false },
      { role_id: 'member', label: 'Member', declared_modes: ['propose', 'vote', 'appeal'], execution_authority: false },
      { role_id: 'reviewer', label: 'Reviewer', declared_modes: ['review', 'observe'], execution_authority: false }
    ],
    decision_rule: { quorum_basis_points: quorum, approval_basis_points: 6000, abstention_counts_toward_quorum: true },
    appeal_enabled: true,
    member_exit_enabled: true,
    execution_authority: false,
    authority_effect: 'none'
  };
  return createCircleGenesis({ circle, charter });
}

/** Builds each author's signed, hash-linked log. */
function logsFor(genesis, script) {
  const logs = {};
  for (const [author, recordType, record] of script) {
    const log = logs[author] ?? (logs[author] = []);
    log.push(createCircleUpdate({
      genesis,
      author,
      counter: log.length + 1,
      previous: log.at(-1) ?? null,
      recordType,
      record,
      privateKey: keys[author].privateKey
    }));
  }
  return logs;
}

function invitation(genesis, invitee, role, issuedBy = 'alice', issuedAt = '2026-08-20T12:01:00.000Z') {
  return {
    schema: CIRCLE_INVITATION_SCHEMA,
    invitation_id: `invite.${invitee}`,
    circle_id: genesis.circle.circle_id,
    invited_principal: invitee,
    membership_class: 'member',
    role_ids: [role],
    issued_by: issuedBy,
    issued_at: issuedAt,
    expires_at: '2026-08-30T12:00:00.000Z',
    charter_digest: digestObject(genesis.charter),
    one_use: true,
    authority_effect: 'none'
  };
}

function membership(genesis, principal, role, acceptedAt = '2026-08-20T12:10:00.000Z') {
  return {
    schema: CIRCLE_MEMBERSHIP_SCHEMA,
    membership_id: `membership.${principal}`,
    circle_id: genesis.circle.circle_id,
    invitation_id: `invite.${principal}`,
    principal_id: principal,
    role_ids: [role],
    accepted_at: acceptedAt,
    status: 'active',
    status_effective_at: acceptedAt,
    member_state_ownership: 'independent-node',
    disclosure_profile: 'selective',
    authority_effect: 'none',
    network_effect: 'none'
  };
}

function proposal(genesis, proposer = 'alice', id = 'proposal.calendar') {
  return {
    schema: CIRCLE_PROPOSAL_SCHEMA,
    proposal_id: id,
    circle_id: genesis.circle.circle_id,
    charter_digest: digestObject(genesis.charter),
    proposer,
    title: 'Adopt the shared calendar',
    summary: 'Decide whether to adopt a shared calendar. Nothing is executed.',
    created_at: '2026-08-20T13:00:00.000Z',
    closes_at: '2026-08-22T13:00:00.000Z',
    status: 'open',
    evidence_refs: [],
    execution_effect: 'none',
    authority_effect: 'none'
  };
}

function ballot(genesis, principal, choice, castAt = '2026-08-21T12:00:00.000Z', id = 'proposal.calendar') {
  return createCircleBallot({
    circleId: genesis.circle.circle_id,
    proposalId: id,
    charterDigest: digestObject(genesis.charter),
    principalId: principal,
    choice,
    castAt,
    privateKey: keys[principal].privateKey
  });
}

function standardScript(genesis) {
  return [
    ['alice', 'invitation', invitation(genesis, 'alice', 'steward')],
    ['alice', 'membership', membership(genesis, 'alice', 'steward', '2026-08-20T12:05:00.000Z')],
    ['alice', 'invitation', invitation(genesis, 'bob', 'member')],
    ['alice', 'invitation', invitation(genesis, 'carol', 'member')],
    ['alice', 'invitation', invitation(genesis, 'dana', 'reviewer')],
    ['bob', 'membership', membership(genesis, 'bob', 'member')],
    ['carol', 'membership', membership(genesis, 'carol', 'member')],
    ['dana', 'membership', membership(genesis, 'dana', 'reviewer')],
    ['alice', 'proposal', proposal(genesis)],
    ['alice', 'ballot', ballot(genesis, 'alice', 'approve')],
    ['bob', 'ballot', ballot(genesis, 'bob', 'approve')],
    ['carol', 'ballot', ballot(genesis, 'carol', 'reject')],
    ['dana', 'ballot', ballot(genesis, 'dana', 'approve')]
  ];
}

/** Interleaves authors' logs in a seeded order, preserving each author's own order. */
function interleave(logs, seed) {
  const queues = Object.values(logs).map(log => [...log]);
  const out = [];
  let state = seed;
  while (queues.some(queue => queue.length)) {
    state = (state * 1103515245 + 12345) % 2 ** 31;
    const live = queues.filter(queue => queue.length);
    out.push(live[state % live.length].shift());
  }
  return out;
}

function replicaWith(genesis, updates) {
  const replica = new CircleReplica({ genesis, roster });
  for (const update of updates) replica.receive(update);
  return replica;
}

test('every delivery order yields the same Circle and the same ballot-derived decision', () => {
  const genesis = genesisFor();
  const logs = logsFor(genesis, standardScript(genesis));
  const views = [1, 2, 3, 5, 8, 13, 21, 34].map(seed => {
    const replica = new CircleReplica({ genesis, roster });
    for (const update of interleave(logs, seed)) {
      assert.equal(replica.receive(update).status, 'accepted');
    }
    return replica.view({ asOf: AFTER_CLOSE });
  });
  assert.equal(new Set(views.map(view => view.package_digest)).size, 1);

  const [view] = views;
  assert.equal(view.package.memberships.length, 4);
  assert.equal(view.package.decisions.length, 1);
  assert.equal(view.package.decisions[0].outcome, 'accepted');
  assert.deepEqual(
    { electorate: view.tallies[0].electorate, approve: view.tallies[0].approve, reject: view.tallies[0].reject },
    { electorate: 3, approve: 2, reject: 1 }
  );
  assert.match(view.tallies[0].rejected[0].reason, /dana could not vote/);
  assert.equal(view.authority_effect, 'none');
});

test('replicas agree on heads once they hold the same updates', () => {
  const genesis = genesisFor();
  const logs = logsFor(genesis, standardScript(genesis));
  const one = replicaWith(genesis, interleave(logs, 4));
  const two = replicaWith(genesis, interleave(logs, 9));
  assert.deepEqual(one.heads(), two.heads());
  assert.deepEqual(one.heads().heads.map(head => [head.author, head.counter]), [
    ['alice', 7], ['bob', 2], ['carol', 2], ['dana', 2]
  ]);
});

test('a decision is derived only after the proposal closes', () => {
  const genesis = genesisFor();
  const replica = replicaWith(genesis, interleave(logsFor(genesis, standardScript(genesis)), 1));
  assert.equal(replica.view({ asOf: '2026-08-22T00:00:00.000Z' }).package.decisions.length, 0);
  assert.equal(replica.view({ asOf: AFTER_CLOSE }).package.decisions.length, 1);
});

test('updates must be signed by their author, name their author, and belong to this Circle', () => {
  const genesis = genesisFor();
  const replica = new CircleReplica({ genesis, roster });

  const impersonation = createCircleUpdate({
    genesis, author: 'bob', counter: 1, previous: null,
    recordType: 'proposal', record: proposal(genesis, 'alice'), privateKey: keys.bob.privateKey
  });
  assert.equal(replica.receive(impersonation).code, 'authorship');

  const forged = createCircleUpdate({
    genesis, author: 'bob', counter: 1, previous: null,
    recordType: 'membership', record: membership(genesis, 'bob', 'member'), privateKey: keys.carol.privateKey
  });
  assert.equal(replica.receive(forged).code, 'signature');

  const stranger = generateKeyPairSync('ed25519');
  const unknown = createCircleUpdate({
    genesis, author: 'zed', counter: 1, previous: null,
    recordType: 'membership', record: membership(genesis, 'zed', 'member'), privateKey: stranger.privateKey
  });
  assert.equal(replica.receive(unknown).code, 'unknown_author');

  const otherGenesis = genesisFor({ quorum: 7000 });
  const elsewhere = createCircleUpdate({
    genesis: otherGenesis, author: 'bob', counter: 1, previous: null,
    recordType: 'membership', record: membership(genesis, 'bob', 'member'), privateKey: keys.bob.privateKey
  });
  assert.equal(replica.receive(elsewhere).code, 'wrong_genesis');
});

test('an author’s log cannot be skipped, spliced or replayed', () => {
  const genesis = genesisFor();
  const logs = logsFor(genesis, standardScript(genesis));
  const replica = new CircleReplica({ genesis, roster });
  assert.equal(replica.receive(logs.alice[1]).code, 'sequence_gap');
  assert.equal(replica.receive(logs.alice[0]).status, 'accepted');
  assert.equal(replica.receive(logs.alice[0]).status, 'duplicate');

  const spliced = createCircleUpdate({
    genesis, author: 'alice', counter: 2, previous: logs.bob[0],
    recordType: 'membership', record: membership(genesis, 'alice', 'steward', '2026-08-20T12:05:00.000Z'),
    privateKey: keys.alice.privateKey
  });
  assert.equal(replica.receive(spliced).code, 'chain');
});

test('equivocation is detected, kept as evidence, and resolved the same way on every replica', () => {
  const genesis = genesisFor();
  const logs = logsFor(genesis, standardScript(genesis));
  const approveAgain = logs.bob[1];
  const reject = createCircleUpdate({
    genesis, author: 'bob', counter: 2, previous: logs.bob[0],
    recordType: 'ballot', record: ballot(genesis, 'bob', 'reject'), privateKey: keys.bob.privateKey
  });
  const base = interleave({ ...logs, bob: [logs.bob[0]] }, 3);

  const one = replicaWith(genesis, [...base, approveAgain]);
  const two = replicaWith(genesis, [...base, reject]);
  assert.equal(one.receive(reject).status, 'equivocation');
  assert.equal(two.receive(approveAgain).status, 'equivocation');

  const viewOne = one.view({ asOf: AFTER_CLOSE });
  const viewTwo = two.view({ asOf: AFTER_CLOSE });
  assert.equal(viewOne.package_digest, viewTwo.package_digest);
  assert.deepEqual(one.heads().equivocations, two.heads().equivocations);
  // Bob's equivocated ballot is excluded: alice approves, carol rejects.
  assert.equal(viewOne.package.decisions[0].outcome, 'rejected');
});

test('only the creator or an approving role may invite or revoke; members publish their own work', () => {
  const genesis = genesisFor();
  const script = [
    ...standardScript(genesis),
    ['bob', 'invitation', invitation(genesis, 'mallory', 'member', 'bob', '2026-08-20T14:00:00.000Z')],
    ['mallory', 'membership', membership(genesis, 'mallory', 'member', '2026-08-20T14:30:00.000Z')],
    ['mallory', 'proposal', { ...proposal(genesis, 'mallory', 'proposal.mallory'), created_at: '2026-08-20T15:00:00.000Z' }],
    ['carol', 'exit', {
      schema: 'axiom-circle-exit.v0',
      exit_id: 'exit.bob.by-carol',
      circle_id: genesis.circle.circle_id,
      membership_id: 'membership.bob',
      principal_id: 'bob',
      initiated_by: 'carol',
      kind: 'revocation',
      effective_at: '2026-08-21T00:00:00.000Z',
      reason_code: 'unauthorised-attempt',
      future_obligation_effect: 'ends-except-explicit-post-exit-rules',
      history_rewrite: false,
      authority_effect: 'none'
    }]
  ];
  const view = replicaWith(genesis, interleave(logsFor(genesis, script), 6)).view({ asOf: AFTER_CLOSE });
  const reasons = view.excluded.map(item => item.reason).join('\n');
  assert.match(reasons, /bob may not issue invitations/);
  assert.match(reasons, /carol may not revoke memberships/);
  assert.equal(view.package.memberships.some(item => item.principal_id === 'mallory'), false);
  assert.equal(view.package.proposals.some(item => item.proposal_id === 'proposal.mallory'), false);
  assert.equal(view.package.exits.length, 0);

  const revoked = [
    ...standardScript(genesis).filter(([, type, record]) => !(type === 'ballot' && record.body.principal_id === 'bob')),
    ['alice', 'exit', {
      schema: 'axiom-circle-exit.v0',
      exit_id: 'exit.bob.by-alice',
      circle_id: genesis.circle.circle_id,
      membership_id: 'membership.bob',
      principal_id: 'bob',
      initiated_by: 'alice',
      kind: 'revocation',
      effective_at: '2026-08-21T00:00:00.000Z',
      reason_code: 'steward-decision',
      future_obligation_effect: 'ends-except-explicit-post-exit-rules',
      history_rewrite: false,
      authority_effect: 'none'
    }]
  ];
  const revokedView = replicaWith(genesis, interleave(logsFor(genesis, revoked), 2)).view({ asOf: AFTER_CLOSE });
  assert.equal(revokedView.package.exits.length, 1);
  assert.equal(revokedView.excluded.length, 0);
});

test('Circle Exchange v0 schema preserves the inert boundary', async () => {
  const { readFile } = await import('node:fs/promises');
  const schema = JSON.parse(await readFile(new URL('../config/circle-exchange-v0.schema.json', import.meta.url), 'utf8'));
  assert.equal(schema.$schema, 'https://json-schema.org/draft/2020-12/schema');
  assert.equal(schema.additionalProperties, false);
  assert.equal(schema.properties.body.additionalProperties, false);
  assert.equal(schema.properties.body.properties.schema.const, 'axiom-circle-update.v0');
  assert.ok(!schema.properties.body.properties.record_type.enum.includes('decision'), 'decisions are derived, never exchanged');
  assert.equal(schema.properties.attestation.properties.algorithm.const, 'Ed25519');
  assert.equal(schema['x-axiom-semantic-validator'], 'mesh/src/lib/circle-exchange.mjs');
});
