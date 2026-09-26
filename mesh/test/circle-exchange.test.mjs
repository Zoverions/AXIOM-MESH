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
  CIRCLE_BUNDLE_MAX_UPDATES,
  CIRCLE_CHARTER_AMENDMENT_SCHEMA,
  CircleReplica,
  circleGenesisDigest,
  createCircleGenesis,
  createCircleUpdate
} from '../src/lib/circle-exchange.mjs';
import {
  circleKeyId,
  createCircleKeyEndorsement,
  createCircleKeyPossession,
  createCircleKeyRevocation,
  createCircleKeyRotation
} from '../src/lib/circle-keys.mjs';

const people = ['alice', 'bob', 'carol', 'dana', 'mallory'];
// Each person's first key, and a second key for rotation and recovery.
const keys = Object.fromEntries(people.map(name => [name, generateKeyPairSync('ed25519')]));
const nextKeys = Object.fromEntries(people.map(name => [name, generateKeyPairSync('ed25519')]));
const AFTER_CLOSE = '2026-08-23T00:00:00.000Z';
const ENDORSED_AT = '2026-08-20T12:00:30.000Z';

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
  return createCircleGenesis({ circle, charter, creatorKey: keys.alice.publicKey });
}

/**
 * Builds each key's signed, hash-linked log. A script step may name the key
 * pair that signs it; by default the author's first key.
 */
function logsFor(genesis, script) {
  const logs = {};
  for (const [author, recordType, record, pair = keys[author]] of script) {
    const name = `${author}:${circleKeyId(pair.publicKey).slice(0, 8)}`;
    const log = logs[name] ?? (logs[name] = []);
    log.push(createCircleUpdate({
      genesis,
      author,
      counter: log.length + 1,
      previous: log.at(-1) ?? null,
      recordType,
      record,
      privateKey: pair.privateKey
    }));
  }
  return logs;
}

function endorsement(genesis, principal, { pair = keys[principal], by = 'alice', at = ENDORSED_AT, possessor = pair } = {}) {
  return createCircleKeyEndorsement({
    circleId: genesis.circle.circle_id,
    principalId: principal,
    publicKey: pair.publicKey,
    possession: createCircleKeyPossession({
      genesisDigest: circleGenesisDigest(genesis),
      principalId: principal,
      privateKey: possessor.privateKey
    }),
    endorsedBy: by,
    endorsedAt: at
  });
}

function rotation(genesis, principal, at, pair = nextKeys[principal]) {
  return createCircleKeyRotation({
    circleId: genesis.circle.circle_id,
    principalId: principal,
    previousKeyId: circleKeyId(keys[principal].publicKey),
    publicKey: pair.publicKey,
    possession: createCircleKeyPossession({
      genesisDigest: circleGenesisDigest(genesis),
      principalId: principal,
      privateKey: pair.privateKey
    }),
    rotatedAt: at
  });
}

function revocation(genesis, principal, lastValidCounter, { by = 'alice', at, pair = keys[principal] }) {
  return createCircleKeyRevocation({
    circleId: genesis.circle.circle_id,
    principalId: principal,
    keyId: circleKeyId(pair.publicKey),
    lastValidCounter,
    revokedBy: by,
    revokedAt: at,
    reasonCode: 'key-compromised'
  });
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

function ballot(genesis, principal, choice, castAt = '2026-08-21T12:00:00.000Z', id = 'proposal.calendar', pair = keys[principal]) {
  return createCircleBallot({
    circleId: genesis.circle.circle_id,
    proposalId: id,
    charterDigest: digestObject(genesis.charter),
    principalId: principal,
    choice,
    castAt,
    privateKey: pair.privateKey
  });
}

function logName(author, pair = keys[author]) {
  return `${author}:${circleKeyId(pair.publicKey).slice(0, 8)}`;
}

function standardScript(genesis) {
  return [
    ['alice', 'key_endorsement', endorsement(genesis, 'bob')],
    ['alice', 'key_endorsement', endorsement(genesis, 'carol')],
    ['alice', 'key_endorsement', endorsement(genesis, 'dana')],
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
  const replica = new CircleReplica({ genesis });
  for (const update of updates) replica.receive(update);
  return replica;
}

test('every delivery order yields the same Circle and the same ballot-derived decision', () => {
  const genesis = genesisFor();
  const logs = logsFor(genesis, standardScript(genesis));
  const views = [1, 2, 3, 5, 8, 13, 21, 34].map(seed => {
    const replica = new CircleReplica({ genesis });
    // An update whose key is not yet endorsed waits, then applies.
    for (const update of interleave(logs, seed)) {
      assert.ok(['accepted', 'pending'].includes(replica.receive(update).status));
    }
    assert.equal(replica.pendingUpdates(), 0);
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
  assert.equal(view.key_revocation_conflict, false);
  assert.deepEqual(view.keys.map(key => [key.principal_id, key.status]), [
    ['alice', 'active'], ['bob', 'active'], ['carol', 'active'], ['dana', 'active']
  ]);
  assert.deepEqual(view.excluded, []);
});

test('replicas agree on heads once they hold the same updates', () => {
  const genesis = genesisFor();
  const logs = logsFor(genesis, standardScript(genesis));
  const one = replicaWith(genesis, interleave(logs, 4));
  const two = replicaWith(genesis, interleave(logs, 9));
  assert.deepEqual(one.heads(), two.heads());
  assert.deepEqual(one.heads().heads.map(head => [head.author, head.counter]), [
    ['alice', 10], ['bob', 2], ['carol', 2], ['dana', 2]
  ]);
  assert.equal(one.heads().heads[1].key_id, circleKeyId(keys.bob.publicKey));
});

test('a decision is derived only after the proposal closes', () => {
  const genesis = genesisFor();
  const replica = replicaWith(genesis, interleave(logsFor(genesis, standardScript(genesis)), 1));
  assert.equal(replica.view({ asOf: '2026-08-22T00:00:00.000Z' }).package.decisions.length, 0);
  assert.equal(replica.view({ asOf: AFTER_CLOSE }).package.decisions.length, 1);
});

test('updates must be signed by their author, name their author, and belong to this Circle', () => {
  const genesis = genesisFor();
  const replica = new CircleReplica({ genesis });
  const endorsements = logsFor(genesis, standardScript(genesis).slice(0, 3))['alice:' + circleKeyId(keys.alice.publicKey).slice(0, 8)];
  for (const update of endorsements) assert.equal(replica.receive(update).status, 'accepted');

  const impersonation = createCircleUpdate({
    genesis, author: 'bob', counter: 1, previous: null,
    recordType: 'proposal', record: proposal(genesis, 'alice'), privateKey: keys.bob.privateKey
  });
  assert.equal(replica.receive(impersonation).code, 'authorship');

  // Carol signs as bob under bob's key id: the signature does not verify.
  const forgedBody = createCircleUpdate({
    genesis, author: 'bob', counter: 1, previous: null,
    recordType: 'membership', record: membership(genesis, 'bob', 'member'), privateKey: keys.bob.privateKey
  });
  const forged = createCircleUpdate({
    genesis, author: 'bob', counter: 1, previous: null,
    recordType: 'membership', record: membership(genesis, 'bob', 'member'), privateKey: keys.carol.privateKey
  });
  assert.equal(replica.receive({ body: forgedBody.body, attestation: forged.attestation }).code, 'signature');
  // Carol's own key is not bob's: it is held until someone endorses it for bob.
  assert.equal(replica.receive(forged).status, 'pending');

  const stranger = generateKeyPairSync('ed25519');
  const unknown = createCircleUpdate({
    genesis, author: 'zed', counter: 1, previous: null,
    recordType: 'membership', record: membership(genesis, 'zed', 'member'), privateKey: stranger.privateKey
  });
  assert.equal(replica.receive(unknown).status, 'pending');
  assert.equal(replica.pendingUpdates(), 2);
  assert.equal(replica.view({ asOf: AFTER_CLOSE }).package.memberships.length, 0);

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
  const alice = logs[logName('alice')];
  const replica = new CircleReplica({ genesis });
  assert.equal(replica.receive(alice[1]).code, 'sequence_gap');
  assert.equal(replica.receive(alice[0]).status, 'accepted');
  assert.equal(replica.receive(alice[0]).status, 'duplicate');

  const spliced = createCircleUpdate({
    genesis, author: 'alice', counter: 2, previous: logs[logName('bob')][0],
    recordType: 'membership', record: membership(genesis, 'alice', 'steward', '2026-08-20T12:05:00.000Z'),
    privateKey: keys.alice.privateKey
  });
  assert.equal(replica.receive(spliced).code, 'chain');
});

test('equivocation is detected, kept as evidence, and resolved the same way on every replica', () => {
  const genesis = genesisFor();
  const logs = logsFor(genesis, standardScript(genesis));
  const bob = logs[logName('bob')];
  const approveAgain = bob[1];
  const reject = createCircleUpdate({
    genesis, author: 'bob', counter: 2, previous: bob[0],
    recordType: 'ballot', record: ballot(genesis, 'bob', 'reject'), privateKey: keys.bob.privateKey
  });
  const base = interleave({ ...logs, [logName('bob')]: [bob[0]] }, 3);

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
    ['alice', 'key_endorsement', endorsement(genesis, 'mallory')],
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

test('only an administrator endorses keys, and every key proves possession for its principal', () => {
  const genesis = genesisFor();
  const replica = new CircleReplica({ genesis });

  // Bob's possession proof reused for mallory, or signed by another key, is refused.
  const borrowed = { ...endorsement(genesis, 'mallory'), possession: endorsement(genesis, 'bob').possession };
  const wrongSigner = endorsement(genesis, 'mallory', { possessor: keys.carol });
  for (const record of [borrowed, wrongSigner]) {
    const update = createCircleUpdate({
      genesis, author: 'alice', counter: 1, previous: null,
      recordType: 'key_endorsement', record, privateKey: keys.alice.privateKey
    });
    const result = replica.receive(update);
    assert.equal(result.code, 'key_record');
    assert.match(result.reason, /did not prove possession for mallory/);
  }

  // A member without an approving role cannot endorse; the key signs nothing.
  const script = [
    ...standardScript(genesis),
    ['bob', 'key_endorsement', endorsement(genesis, 'mallory', { by: 'bob', at: '2026-08-20T14:00:00.000Z' })],
    ['mallory', 'proposal', { ...proposal(genesis, 'mallory', 'proposal.mallory'), created_at: '2026-08-20T15:00:00.000Z' }]
  ];
  const view = replicaWith(genesis, interleave(logsFor(genesis, script), 5)).view({ asOf: AFTER_CLOSE });
  const reasons = view.excluded.map(item => item.reason).join('\n');
  assert.match(reasons, /bob may not endorse keys/);
  assert.match(reasons, /mallory has no established key/);
  assert.equal(view.keys.some(key => key.principal_id === 'mallory'), false);

  // A record dated before its key was endorsed does not count.
  const late = standardScript(genesis).map(step => (
    step[1] === 'key_endorsement' && step[2].principal_id === 'dana'
      ? ['alice', 'key_endorsement', endorsement(genesis, 'dana', { at: '2026-08-20T12:20:00.000Z' })]
      : step
  ));
  const lateView = replicaWith(genesis, interleave(logsFor(genesis, late), 5)).view({ asOf: AFTER_CLOSE });
  assert.match(lateView.excluded[0].reason, /dana has no established key/);
  assert.equal(lateView.package.memberships.some(item => item.principal_id === 'dana'), false);

  // One key per principal at a time, and one principal per key.
  const twice = [
    ...standardScript(genesis),
    ['alice', 'key_endorsement', endorsement(genesis, 'bob', { pair: nextKeys.bob, at: '2026-08-20T14:00:00.000Z' })]
  ];
  assert.match(
    replicaWith(genesis, interleave(logsFor(genesis, twice), 7)).view({ asOf: AFTER_CLOSE }).excluded[0].reason,
    /bob already has a key/
  );
  const shared = [
    ...standardScript(genesis),
    ['alice', 'key_endorsement', endorsement(genesis, 'mallory', { pair: keys.bob, possessor: keys.bob, at: '2026-08-20T14:00:00.000Z' })]
  ];
  assert.match(
    replicaWith(genesis, interleave(logsFor(genesis, shared), 7)).view({ asOf: AFTER_CLOSE }).excluded[0].reason,
    /already bound in this Circle/
  );
});

test('a rotated key signs nothing more; its successor carries the author on', () => {
  const genesis = genesisFor();
  const script = [
    ...standardScript(genesis).filter(([, type, record]) => !(type === 'ballot' && record.body.principal_id === 'bob')),
    ['bob', 'key_rotation', rotation(genesis, 'bob', '2026-08-20T20:00:00.000Z')],
    // The old key keeps signing after its rotation: void.
    ['bob', 'ballot', ballot(genesis, 'bob', 'reject')],
    ['bob', 'ballot', ballot(genesis, 'bob', 'approve', '2026-08-21T12:00:00.000Z', 'proposal.calendar', nextKeys.bob), nextKeys.bob]
  ];
  const logs = logsFor(genesis, script);
  const views = [2, 11].map(seed => replicaWith(genesis, interleave(logs, seed)).view({ asOf: AFTER_CLOSE }));
  assert.equal(views[0].package_digest, views[1].package_digest);
  const [view] = views;
  assert.match(view.excluded.map(item => item.reason).join('\n'), /bob signed with a key it had already rotated/);
  assert.deepEqual({ approve: view.tallies[0].approve, reject: view.tallies[0].reject }, { approve: 2, reject: 1 });
  assert.deepEqual(
    view.keys.filter(key => key.principal_id === 'bob').map(key => [key.key_id, key.status]),
    [[circleKeyId(keys.bob.publicKey), 'rotated'], [circleKeyId(nextKeys.bob.publicKey), 'active']]
  );

  // A rotation must be signed by the key it names as replaced.
  const replica = replicaWith(genesis, interleave(logsFor(genesis, standardScript(genesis)), 2));
  const misnamed = createCircleUpdate({
    genesis, author: 'bob', counter: 3, previous: logs[logName('bob')][1],
    recordType: 'key_rotation',
    record: { ...rotation(genesis, 'bob', '2026-08-20T20:00:00.000Z'), previous_key_id: circleKeyId(keys.carol.publicKey) },
    privateKey: keys.bob.privateKey
  });
  assert.equal(replica.receive(misnamed).code, 'key_record');

  // A revoked key cannot rotate itself back into use.
  const afterRevocation = [
    ...standardScript(genesis),
    ['alice', 'key_revocation', revocation(genesis, 'bob', 5, { at: '2026-08-21T10:00:00.000Z' })],
    ['bob', 'key_rotation', rotation(genesis, 'bob', '2026-08-21T10:30:00.000Z')]
  ];
  const revokedView = replicaWith(genesis, interleave(logsFor(genesis, afterRevocation), 2)).view({ asOf: AFTER_CLOSE });
  assert.match(revokedView.excluded.map(item => item.reason).join('\n'), /bob can rotate only its current key/);
  assert.equal(revokedView.keys.some(key => key.key_id === circleKeyId(nextKeys.bob.publicKey)), false);
});

test('a revoked key is void beyond its last valid update, however its records are dated', () => {
  const genesis = genesisFor();
  const bobLog = [
    ['bob', 'membership', membership(genesis, 'bob', 'member')],
    // Written with the stolen key, and dated before the revocation.
    ['bob', 'ballot', ballot(genesis, 'bob', 'reject', '2026-08-21T09:00:00.000Z')],
    ['bob', 'appeal', {
      schema: 'axiom-circle-appeal.v0',
      appeal_id: 'appeal.forged',
      circle_id: genesis.circle.circle_id,
      target_type: 'membership',
      target_id: 'membership.carol',
      filed_by: 'bob',
      reason: 'Forged with a stolen key.',
      filed_at: '2026-08-21T09:30:00.000Z',
      status: 'open',
      resolved_at: null,
      authority_effect: 'none'
    }]
  ];
  const script = [
    ...standardScript(genesis).filter(([author]) => author !== 'bob'),
    ...bobLog,
    ['alice', 'key_revocation', revocation(genesis, 'bob', 1, { at: '2026-08-21T10:00:00.000Z' })],
    ['alice', 'key_endorsement', endorsement(genesis, 'bob', { pair: nextKeys.bob, at: '2026-08-21T10:05:00.000Z' })],
    ['bob', 'ballot', ballot(genesis, 'bob', 'approve', '2026-08-21T12:00:00.000Z', 'proposal.calendar', nextKeys.bob), nextKeys.bob]
  ];
  const logs = logsFor(genesis, script);
  const views = [3, 17, 29].map(seed => replicaWith(genesis, interleave(logs, seed)).view({ asOf: AFTER_CLOSE }));
  assert.equal(new Set(views.map(view => view.package_digest)).size, 1);
  const [view] = views;
  const reasons = view.excluded.map(item => item.reason).join('\n');
  assert.equal((reasons.match(/bob signed with a key revoked after update 1/g) ?? []).length, 2);
  // The membership signed before the compromise stands; the forged ballot
  // and appeal are gone; the replacement key's ballot counts.
  assert.equal(view.package.memberships.some(item => item.principal_id === 'bob'), true);
  assert.equal(view.package.appeals.length, 0);
  assert.deepEqual({ approve: view.tallies[0].approve, reject: view.tallies[0].reject }, { approve: 2, reject: 1 });
  assert.equal(view.package.decisions[0].outcome, 'accepted');
  assert.equal(view.key_revocation_conflict, false);

  // A replacement cannot be endorsed while the old key is still current.
  const early = script.map(step => (
    step[1] === 'key_endorsement' && step[2].key_id === circleKeyId(nextKeys.bob.publicKey)
      ? ['alice', 'key_endorsement', endorsement(genesis, 'bob', { pair: nextKeys.bob, at: '2026-08-21T09:55:00.000Z' })]
      : step
  ));
  const earlyView = replicaWith(genesis, interleave(logsFor(genesis, early), 3)).view({ asOf: AFTER_CLOSE });
  assert.match(earlyView.excluded.map(item => item.reason).join('\n'), /bob already has a key/);

  // Only the key's holder or an administrator may revoke it.
  const byCarol = [
    ...standardScript(genesis),
    ['carol', 'key_revocation', revocation(genesis, 'bob', 0, { by: 'carol', at: '2026-08-21T10:00:00.000Z' })]
  ];
  const carolView = replicaWith(genesis, interleave(logsFor(genesis, byCarol), 3)).view({ asOf: AFTER_CLOSE });
  assert.match(carolView.excluded.map(item => item.reason).join('\n'), /carol may not revoke bob's key/);
  assert.equal(carolView.tallies[0].approve, 2);
});

test('administrators revoking each other back to the start is reported, and both revocations apply', () => {
  const genesis = genesisFor();
  const script = [
    ...standardScript(genesis),
    ['alice', 'invitation', { ...invitation(genesis, 'mallory', 'steward'), issued_at: '2026-08-20T12:02:00.000Z' }],
    ['alice', 'key_endorsement', endorsement(genesis, 'mallory')],
    ['mallory', 'membership', membership(genesis, 'mallory', 'steward')],
    ['alice', 'key_revocation', revocation(genesis, 'mallory', 0, { at: '2026-08-21T10:00:00.000Z' })],
    ['mallory', 'key_revocation', revocation(genesis, 'alice', 0, { by: 'mallory', at: '2026-08-21T10:00:00.000Z' })]
  ];
  const logs = logsFor(genesis, script);
  const views = [1, 4].map(seed => replicaWith(genesis, interleave(logs, seed)).view({ asOf: AFTER_CLOSE }));
  assert.equal(views[0].package_digest, views[1].package_digest);
  const [view] = views;
  assert.equal(view.key_revocation_conflict, true);
  // Every revocation seen is applied: neither key signs anything.
  assert.equal(view.package.memberships.length, 0);
  assert.equal(view.package.proposals.length, 0);
});

const AMENDED_AT = '2026-08-23T00:00:00.000Z';

function charterV2(genesis, overrides = {}) {
  return {
    ...structuredClone(genesis.charter),
    version: 2,
    supersedes_digest: digestObject(genesis.charter),
    effective_from: AMENDED_AT,
    // The reviewer role is dropped; approval now needs 70%.
    roles: genesis.charter.roles.filter(role => role.role_id !== 'reviewer'),
    decision_rule: { ...genesis.charter.decision_rule, approval_basis_points: 7000 },
    ...overrides
  };
}

function amendmentProposal(genesis, charter, id = 'proposal.charter-v2') {
  return {
    ...proposal(genesis, 'alice', id),
    title: 'Adopt charter version 2',
    summary: 'Drop the reviewer role and raise the approval threshold. Nothing is executed.',
    created_at: '2026-08-20T13:30:00.000Z',
    evidence_refs: [`circle-charter:${digestObject(charter)}`]
  };
}

function amendment(genesis, charter, { by = 'bob', at = '2026-08-22T18:00:00.000Z', proposalId = 'proposal.charter-v2' } = {}) {
  return {
    schema: CIRCLE_CHARTER_AMENDMENT_SCHEMA,
    circle_id: genesis.circle.circle_id,
    proposal_id: proposalId,
    charter,
    published_by: by,
    published_at: at,
    authority_effect: 'none'
  };
}

function charterBallot(principal, choice, charter, id, castAt, genesis) {
  return createCircleBallot({
    circleId: genesis.circle.circle_id,
    proposalId: id,
    charterDigest: digestObject(charter),
    principalId: principal,
    choice,
    castAt,
    privateKey: keys[principal].privateKey
  });
}

function amendedScript(genesis, v2 = charterV2(genesis), { votes = ['approve', 'approve', 'reject'], extra = [] } = {}) {
  const [alice, bob, carol] = votes;
  return [
    ...standardScript(genesis),
    ['alice', 'proposal', amendmentProposal(genesis, v2)],
    ['alice', 'ballot', charterBallot('alice', alice, genesis.charter, 'proposal.charter-v2', '2026-08-21T12:30:00.000Z', genesis)],
    ['bob', 'ballot', charterBallot('bob', bob, genesis.charter, 'proposal.charter-v2', '2026-08-21T12:30:00.000Z', genesis)],
    ['carol', 'ballot', charterBallot('carol', carol, genesis.charter, 'proposal.charter-v2', '2026-08-21T12:30:00.000Z', genesis)],
    ...extra
  ];
}

test('an accepted amendment opens a new charter period; members carry over and open proposals lapse', () => {
  const genesis = genesisFor();
  const v2 = charterV2(genesis);
  const later = {
    ...proposal(genesis, 'bob', 'proposal.under-v2'),
    charter_digest: digestObject(v2),
    created_at: '2026-08-24T10:00:00.000Z',
    closes_at: '2026-08-26T10:00:00.000Z'
  };
  const script = amendedScript(genesis, v2, {
    extra: [
      ['bob', 'key_endorsement', null],
      // Still open under charter 1 when charter 2 takes effect: lapses.
      ['carol', 'proposal', { ...proposal(genesis, 'carol', 'proposal.late'), created_at: '2026-08-22T20:00:00.000Z', closes_at: '2026-08-23T12:00:00.000Z' }],
      ['bob', 'amendment', null],
      ['bob', 'proposal', later],
      ['alice', 'ballot', charterBallot('alice', 'approve', v2, 'proposal.under-v2', '2026-08-25T10:00:00.000Z', genesis)],
      ['bob', 'ballot', charterBallot('bob', 'approve', v2, 'proposal.under-v2', '2026-08-25T10:00:00.000Z', genesis)],
      // Bound to the superseded charter after the change: excluded.
      ['carol', 'proposal', { ...proposal(genesis, 'carol', 'proposal.stale'), created_at: '2026-08-24T12:00:00.000Z', closes_at: '2026-08-26T12:00:00.000Z' }],
      // Bob leaves under charter 2, naming his carried membership.
      ['bob', 'exit', {
        schema: 'axiom-circle-exit.v0',
        exit_id: 'exit.bob.v2',
        circle_id: genesis.circle.circle_id,
        membership_id: 'membership.bob:v2',
        principal_id: 'bob',
        initiated_by: 'bob',
        kind: 'voluntary-exit',
        effective_at: '2026-08-26T12:00:00.000Z',
        reason_code: 'moving-on',
        future_obligation_effect: 'ends-except-explicit-post-exit-rules',
        history_rewrite: false,
        authority_effect: 'none'
      }]
    ].filter(([, type]) => type !== 'key_endorsement')
      .map(step => (step[1] === 'amendment' ? ['bob', 'charter_amendment', amendment(genesis, v2)] : step))
  });
  const logs = logsFor(genesis, script);
  const asOf = '2026-08-27T00:00:00.000Z';
  const views = [1, 6, 19].map(seed => replicaWith(genesis, interleave(logs, seed)).view({ asOf }));
  assert.equal(new Set(views.map(view => view.epochs.map(epoch => epoch.package_digest).join())).size, 1);
  const [view] = views;
  assert.deepEqual(view.excluded.map(item => item.reason), ['Circle proposal is invalid']);

  assert.deepEqual(
    view.epochs.map(epoch => [epoch.charter_version, epoch.effective_from, epoch.ended_at]),
    [[1, genesis.circle.created_at, AMENDED_AT], [2, AMENDED_AT, null]]
  );
  assert.deepEqual(view.epochs[0].lapsed_proposals, ['proposal.late']);
  assert.equal(view.epochs[0].package.decisions.find(item => item.proposal_id === 'proposal.charter-v2').outcome, 'accepted');

  assert.equal(view.package.charter.version, 2);
  assert.deepEqual(
    view.package.memberships.map(item => [item.membership_id, item.role_ids]),
    [['membership.alice:v2', ['steward']], ['membership.bob:v2', ['member']], ['membership.carol:v2', ['member']], ['membership.dana:v2', []]]
  );
  // Decided under charter 2's rule, by the carried members.
  const decided = view.package.decisions.find(item => item.proposal_id === 'proposal.under-v2');
  assert.equal(decided.outcome, 'accepted');
  assert.equal(decided.charter_digest, digestObject(v2));
  assert.equal(view.package.exits[0].membership_id, 'membership.bob:v2');
  assert.equal(view.pending_amendment, null);

  // A member-chosen identifier that looks carried cannot collide with one.
  const lookalike = [
    ...script,
    ['alice', 'invitation', { ...invitation(genesis, 'mallory', 'member'), invitation_id: 'invite.bob:v2' }],
    ['alice', 'key_endorsement', endorsement(genesis, 'mallory')],
    ['mallory', 'membership', { ...membership(genesis, 'mallory', 'member'), membership_id: 'membership.bob:v2', invitation_id: 'invite.bob:v2' }]
  ];
  const lookalikeView = replicaWith(genesis, interleave(logsFor(genesis, lookalike), 2)).view({ asOf });
  const carriedIds = lookalikeView.package.memberships.map(item => item.membership_id);
  assert.equal(new Set(carriedIds).size, 5);
  assert.ok(carriedIds.includes('membership.bob:v2:v2'));

  const before = replicaWith(genesis, interleave(logs, 1)).view({ asOf: '2026-08-22T20:00:00.000Z' });
  assert.equal(before.epochs.length, 1);
  assert.deepEqual(before.pending_amendment, {
    proposal_id: 'proposal.charter-v2',
    charter_digest: digestObject(v2),
    effective_from: AMENDED_AT
  });
});

test('a charter amendment takes effect only through an accepted, unappealed decision on its exact text', () => {
  const genesis = genesisFor();
  const v2 = charterV2(genesis);
  const reasonsFor = (script, asOf = '2026-08-24T00:00:00.000Z') => {
    const view = replicaWith(genesis, interleave(logsFor(genesis, script), 4)).view({ asOf });
    return { view, reasons: view.excluded.map(item => item.reason).join('\n') };
  };
  const cases = [
    ['a different text', amendedScript(genesis, v2, { extra: [['bob', 'charter_amendment', amendment(genesis, charterV2(genesis, { decision_rule: { ...genesis.charter.decision_rule, approval_basis_points: 8000 } }))]] }), /did not bind this charter text/],
    ['a rejected proposal', amendedScript(genesis, v2, { votes: ['approve', 'reject', 'reject'], extra: [['bob', 'charter_amendment', amendment(genesis, v2)]] }), /was not accepted/],
    ['before the vote closes', amendedScript(genesis, v2, { extra: [['bob', 'charter_amendment', amendment(genesis, v2, { at: '2026-08-22T12:00:00.000Z' })]] }), /was not accepted/],
    ['a skipped version', amendedScript(genesis, charterV2(genesis, { version: 3 }), { extra: [['bob', 'charter_amendment', amendment(genesis, charterV2(genesis, { version: 3 }))]] }), /must supersede the charter in force/],
    ['a backdated start', amendedScript(genesis, charterV2(genesis, { effective_from: '2026-08-22T17:00:00.000Z' }), { extra: [['bob', 'charter_amendment', amendment(genesis, charterV2(genesis, { effective_from: '2026-08-22T17:00:00.000Z' }))]] }), /cannot take effect before it is published/],
    ['execution authority', amendedScript(genesis, charterV2(genesis, { execution_authority: true }), { extra: [['bob', 'charter_amendment', amendment(genesis, charterV2(genesis, { execution_authority: true }))]] }), /Circle charter/],
    ['a second amendment', amendedScript(genesis, v2, { extra: [
      ['bob', 'charter_amendment', amendment(genesis, v2)],
      ['carol', 'charter_amendment', amendment(genesis, v2, { by: 'carol', at: '2026-08-22T19:00:00.000Z' })]
    ] }), /already adopted and waiting/],
    ['an open appeal', amendedScript(genesis, v2, { extra: [
      ['carol', 'appeal', {
        schema: 'axiom-circle-appeal.v0',
        appeal_id: 'appeal.charter',
        circle_id: genesis.circle.circle_id,
        target_type: 'decision',
        target_id: 'decision:proposal.charter-v2',
        filed_by: 'carol',
        reason: 'The amendment removes the reviewer role without consulting reviewers.',
        filed_at: '2026-08-22T14:00:00.000Z',
        status: 'open',
        resolved_at: null,
        authority_effect: 'none'
      }],
      ['bob', 'charter_amendment', amendment(genesis, v2)]
    ] }), /is under appeal/]
  ];
  for (const [name, script, reason] of cases) {
    const { view, reasons } = reasonsFor(script);
    assert.match(reasons, reason, name);
    if (name !== 'a second amendment') assert.equal(view.epochs.length, 1, name);
  }
});

/** Runs the heads-for-bundle exchange both ways until neither side learns anything. */
function syncPair(left, right) {
  let rounds = 0;
  for (;;) {
    rounds += 1;
    assert.ok(rounds < 20, 'sync did not converge');
    const toRight = right.receiveBundle(left.updatesFor(right.heads()));
    const toLeft = left.receiveBundle(right.updatesFor(left.heads()));
    const learned = toRight.accepted + toRight.equivocation + toLeft.accepted + toLeft.equivocation;
    if (!learned && toRight.complete && toLeft.complete) return rounds;
  }
}

test('two replicas holding different updates converge by exchanging heads and bundles', () => {
  const genesis = genesisFor();
  const all = interleave(logsFor(genesis, standardScript(genesis)), 8);
  // Each side holds whole logs. The right side holds carol's and dana's
  // updates before any endorsement of their keys, so they wait as pending
  // until the left side's bundle brings alice's endorsements.
  const authors = side => update => side.includes(update.body.author);
  const left = replicaWith(genesis, all.filter(authors(['alice', 'bob'])));
  const right = replicaWith(genesis, all.filter(authors(['bob', 'carol', 'dana'])));
  assert.equal(right.pendingUpdates(), 6);
  assert.notDeepEqual(left.heads(), right.heads());
  syncPair(left, right);
  assert.deepEqual(left.heads(), right.heads());
  assert.equal(left.pendingUpdates(), 0);
  assert.equal(right.pendingUpdates(), 0);
  const whole = replicaWith(genesis, all).view({ asOf: AFTER_CLOSE });
  assert.equal(left.view({ asOf: AFTER_CLOSE }).package_digest, whole.package_digest);
  assert.equal(right.view({ asOf: AFTER_CLOSE }).package_digest, whole.package_digest);
  // Nothing left to send once heads agree.
  assert.equal(left.updatesFor(right.heads()).updates.length, 0);
});

test('bundles are bounded and the exchange repeats until complete', () => {
  const genesis = genesisFor();
  const script = standardScript(genesis);
  for (let index = 0; index < CIRCLE_BUNDLE_MAX_UPDATES + 40; index += 1) {
    script.push(['alice', 'invitation', {
      ...invitation(genesis, `guest${index}`, 'member'),
      invitation_id: `invite.guest.${index}`,
      issued_at: '2026-08-20T12:02:00.000Z'
    }]);
  }
  const source = replicaWith(genesis, interleave(logsFor(genesis, script), 1));
  const empty = new CircleReplica({ genesis });
  const first = source.updatesFor(empty.heads());
  assert.equal(first.updates.length, CIRCLE_BUNDLE_MAX_UPDATES);
  assert.equal(first.complete, false);
  assert.equal(syncPair(source, empty) >= 2, true);
  assert.deepEqual(empty.heads(), source.heads());
});

test('equivocation evidence and forks spread to replicas that have not seen them', () => {
  const genesis = genesisFor();
  const logs = logsFor(genesis, standardScript(genesis));
  const bob = logs[logName('bob')];
  const reject = createCircleUpdate({
    genesis, author: 'bob', counter: 2, previous: bob[0],
    recordType: 'ballot', record: ballot(genesis, 'bob', 'reject'), privateKey: keys.bob.privateKey
  });
  const base = interleave({ ...logs, [logName('bob')]: [bob[0]] }, 3);
  const witness = replicaWith(genesis, [...base, bob[1], reject]);
  assert.equal(witness.heads().equivocations.length, 1);

  // A replica with neither of bob's second updates learns both.
  const fresh = replicaWith(genesis, base);
  syncPair(witness, fresh);
  assert.deepEqual(fresh.heads().equivocations, witness.heads().equivocations);

  // A replica that holds only the other fork learns of the conflict too.
  const forked = replicaWith(genesis, [...base, reject]);
  const honest = replicaWith(genesis, [...base, bob[1]]);
  syncPair(honest, forked);
  assert.deepEqual(honest.heads().equivocations, forked.heads().equivocations);
  // Evidence already recorded is neither re-sent nor counted again.
  assert.equal(honest.updatesFor(forked.heads()).updates.length, 0);
  assert.equal(forked.receive(bob[1]).status, 'duplicate');
  assert.equal(honest.view({ asOf: AFTER_CLOSE }).package_digest, witness.view({ asOf: AFTER_CLOSE }).package_digest);
});

test('a bundle is checked update by update, and foreign or malformed input is refused', () => {
  const genesis = genesisFor();
  const all = interleave(logsFor(genesis, standardScript(genesis)), 8);
  const source = replicaWith(genesis, all);
  const bundle = source.updatesFor(new CircleReplica({ genesis }).heads());
  const tampered = structuredClone(bundle);
  tampered.updates[0].body.record.issued_at = '2026-08-20T12:00:45.000Z';
  const target = new CircleReplica({ genesis });
  const summary = target.receiveBundle(tampered);
  assert.equal(summary.rejected[0].code, 'signature');
  assert.ok(summary.accepted + summary.pending > 0);

  const other = genesisFor({ quorum: 7000 });
  assert.throws(() => new CircleReplica({ genesis: other }).receiveBundle(bundle), /different Circle/);
  assert.throws(() => source.updatesFor({ ...target.heads(), genesis_digest: 'f'.repeat(64) }), /different Circle/);
  assert.throws(
    () => source.updatesFor({ ...target.heads(), heads: [{ author: 'bob', key_id: 'x', counter: 1, digest: 'y' }] }),
    /Circle head is invalid/
  );
  assert.throws(
    () => target.receiveBundle({ ...bundle, updates: Array(CIRCLE_BUNDLE_MAX_UPDATES + 1).fill(bundle.updates[0]) }),
    /bundle is invalid/
  );
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
  // The machine schema describes exactly the body the contract signs.
  const genesis = genesisFor();
  const [update] = logsFor(genesis, standardScript(genesis).slice(0, 1))[logName('alice')];
  assert.deepEqual(Object.keys(update.body).sort(), [...schema.properties.body.required].sort());
  assert.deepEqual(Object.keys(schema.properties.body.properties).sort(), [...schema.properties.body.required].sort());
  for (const type of ['key_endorsement', 'key_rotation', 'key_revocation', 'charter_amendment']) {
    assert.ok(schema.properties.body.properties.record_type.enum.includes(type), type);
  }
});
