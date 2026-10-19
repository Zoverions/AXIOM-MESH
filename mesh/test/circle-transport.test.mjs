import assert from 'node:assert/strict';
import { generateKeyPairSync, randomBytes, sign } from 'node:crypto';
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { canonicalJson, digestObject, sha256 } from '../src/lib/canonical.mjs';
import {
  CIRCLE_CHARTER_SCHEMA,
  CIRCLE_EXIT_SCHEMA,
  CIRCLE_INVITATION_SCHEMA,
  CIRCLE_MEMBERSHIP_SCHEMA,
  CIRCLE_PROPOSAL_SCHEMA,
  CIRCLE_SCHEMA
} from '../src/lib/circle-core.mjs';
import { generateCircleDisclosureKey } from '../src/lib/circle-disclosure.mjs';
import { CircleReplica, circleGenesisDigest, createCircleGenesis, createCircleUpdate } from '../src/lib/circle-exchange.mjs';
import {
  circleKeyId,
  createCircleKeyEndorsement,
  createCircleKeyPossession,
  createCircleKeyRevocation
} from '../src/lib/circle-keys.mjs';
import { ReplayGuard } from '../src/lib/identity.mjs';
import {
  CIRCLE_OFFER_PATH,
  CIRCLE_PULL_PATH,
  CIRCLE_SYNC_MAX_REQUEST_BYTES,
  CircleRateLimiter,
  createCircleSyncRequest,
  handleCircleSyncRequest,
  httpCircleSender,
  syncCirclePeer
} from '../src/lib/circle-transport.mjs';
import {
  detectCircleWithholding,
  detectCircleWithholdingAcross,
  verifyCircleNodeEvidence,
  verifyCircleWithholdingFinding
} from '../src/lib/circle-withholding.mjs';
import {
  appendCirclePeerRecord,
  circlePeerFindings,
  circlePeerStatus,
  loadCirclePeerRuntime,
  openCirclePeerReplica,
  publishCirclePeerNodeEvidence,
  runCirclePeerSync,
  serveCirclePeer
} from '../src/lib/circle-peer.mjs';
import { runCirclePeerCommand } from '../src/circle-peer.mjs';
import { provisionTransportCredentials } from '../src/lib/transport-credentials.mjs';

const people = ['alice', 'bob', 'carol', 'mallory'];
const keys = Object.fromEntries(people.map(name => [name, generateKeyPairSync('ed25519')]));
const CREATED = '2026-08-20T12:00:00.000Z';
const NOW = Date.parse('2026-08-21T00:00:00.000Z');

function genesisFor({ quorum = 5000 } = {}) {
  const circle = {
    schema: CIRCLE_SCHEMA,
    circle_id: 'circle.transport',
    name: 'Transport test Circle',
    purpose: 'Carry Circle records between members’ own nodes without authority.',
    created_by: 'alice',
    created_at: CREATED,
    trust_anchor_id: 'anchor.transport',
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
    effective_from: CREATED,
    supersedes_digest: null,
    roles: [
      { role_id: 'steward', label: 'Steward', declared_modes: ['propose', 'vote', 'approve', 'appeal'], execution_authority: false },
      { role_id: 'member', label: 'Member', declared_modes: ['propose', 'vote', 'appeal'], execution_authority: false }
    ],
    decision_rule: { quorum_basis_points: quorum, approval_basis_points: 6000, abstention_counts_toward_quorum: true },
    appeal_enabled: true,
    member_exit_enabled: true,
    execution_authority: false,
    authority_effect: 'none'
  };
  return createCircleGenesis({ circle, charter, creatorKey: keys.alice.publicKey });
}

const genesis = genesisFor();

function endorsement(principal) {
  return createCircleKeyEndorsement({
    circleId: genesis.circle.circle_id,
    principalId: principal,
    publicKey: keys[principal].publicKey,
    possession: createCircleKeyPossession({
      genesisDigest: circleGenesisDigest(genesis),
      principalId: principal,
      privateKey: keys[principal].privateKey
    }),
    endorsedBy: 'alice',
    endorsedAt: '2026-08-20T12:00:30.000Z'
  });
}

function invitation(invitee, role) {
  return {
    schema: CIRCLE_INVITATION_SCHEMA,
    invitation_id: `invite.${invitee}`,
    circle_id: genesis.circle.circle_id,
    invited_principal: invitee,
    membership_class: 'member',
    role_ids: [role],
    issued_by: 'alice',
    issued_at: '2026-08-20T12:01:00.000Z',
    expires_at: '2026-08-30T12:00:00.000Z',
    charter_digest: digestObject(genesis.charter),
    one_use: true,
    authority_effect: 'none'
  };
}

function membership(principal, role, acceptedAt = '2026-08-20T12:10:00.000Z') {
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

function exitOf(principal, at) {
  return {
    schema: CIRCLE_EXIT_SCHEMA,
    exit_id: `exit.${principal}`,
    circle_id: genesis.circle.circle_id,
    membership_id: `membership.${principal}`,
    principal_id: principal,
    initiated_by: principal,
    kind: 'voluntary-exit',
    effective_at: at,
    reason_code: 'moving-on',
    future_obligation_effect: 'ends-except-explicit-post-exit-rules',
    history_rewrite: false,
    authority_effect: 'none'
  };
}

/** Signs `records` as one author's hash-linked log, continuing `log`. */
function append(log, author, records) {
  for (const [recordType, record] of records) {
    log.push(createCircleUpdate({
      genesis, author, counter: log.length + 1, previous: log.at(-1) ?? null,
      recordType, record, privateKey: keys[author].privateKey
    }));
  }
  return log;
}

function logs() {
  return {
    alice: append([], 'alice', [
      ['key_endorsement', endorsement('bob')],
      ['key_endorsement', endorsement('carol')],
      ['invitation', invitation('alice', 'steward')],
      ['membership', membership('alice', 'steward', '2026-08-20T12:05:00.000Z')],
      ['invitation', invitation('bob', 'member')],
      ['invitation', invitation('carol', 'member')]
    ]),
    bob: append([], 'bob', [['membership', membership('bob', 'member')]]),
    carol: append([], 'carol', [['membership', membership('carol', 'member')]])
  };
}

function replicaWith(...updateLists) {
  const replica = new CircleReplica({ genesis });
  for (const update of updateLists.flat()) replica.receive(update);
  return replica;
}

// An in-process sender: the node's handler, as the HTTP layer would call it.
const signerFor = name => ({ principalId: name, privateKey: keys[name].privateKey });

// Re-signs an answer's node statement after the answer was changed, as an
// honest node would have signed that answer (or a dishonest one, with
// another key).
function resign(answer, name, override = {}) {
  const { statement, ...rest } = answer;
  const body = { ...statement.body, answer_digest: digestObject(rest), ...override };
  const canonical = canonicalJson(body);
  return {
    ...rest,
    statement: {
      body,
      attestation: { algorithm: 'Ed25519', digest: sha256(canonical), signature: sign(null, Buffer.from(canonical), keys[name].privateKey).toString('base64url') }
    }
  };
}

function directSender(node, { as = 'alice', now = NOW, replayGuard = new ReplayGuard({ maxEntries: 1_000 }), onChange, rateLimiter } = {}) {
  return async (path, message) => {
    const operation = path === CIRCLE_PULL_PATH ? 'pull' : path === CIRCLE_OFFER_PATH ? 'offer' : 'none';
    // Round-trip through JSON, as on the wire.
    const result = await handleCircleSyncRequest(node, operation, JSON.parse(JSON.stringify(message)), { now, replayGuard, onChange, rateLimiter, signer: signerFor(as) });
    if (result.status !== 200) throw Object.assign(new Error(result.body.error.code), { status: result.status, code: result.body.error.code });
    return JSON.parse(JSON.stringify(result.body));
  };
}

function request(operation, payload, { as = 'bob', pair = keys[as], now = NOW, genesisDigest = circleGenesisDigest(genesis), nonce } = {}) {
  return JSON.parse(JSON.stringify(createCircleSyncRequest({
    genesisDigest, operation, payload, principalId: as, privateKey: pair.privateKey, now, ...(nonce ? { nonce } : {})
  })));
}

const view = replica => replica.view({ asOf: new Date(NOW).toISOString() });

test('members’ nodes converge over pull and offer, including a member who has not joined anywhere yet', async () => {
  const { alice, bob, carol } = logs();
  const aliceNode = replicaWith(alice);
  // Bob's node holds only his own acceptance, pending: his key's endorsement
  // is in alice's log. Alice's node has never seen his acceptance.
  const bobNode = replicaWith(bob);
  assert.equal(bobNode.pendingUpdates(), 1);
  let saves = 0;
  const result = await syncCirclePeer({
    replica: bobNode, principalId: 'bob', privateKey: keys.bob.privateKey,
    send: directSender(aliceNode, { onChange: async () => { saves += 1; } }), now: () => NOW
  });
  assert.equal(result.pulled.accepted, alice.length);
  assert.equal(result.offered.accepted, 1);
  assert.equal(saves, 1, 'the node persists what an offer added');
  assert.equal(bobNode.pendingUpdates(), 0);
  assert.deepEqual(bobNode.heads(), aliceNode.heads());
  assert.equal(view(bobNode).package_digest, view(aliceNode).package_digest);
  assert.deepEqual(view(aliceNode).package.memberships.map(item => item.principal_id), ['alice', 'bob']);

  // Carol syncs with bob's node, not alice's: any member's node will do.
  const carolNode = replicaWith(carol);
  await syncCirclePeer({ replica: carolNode, principalId: 'carol', privateKey: keys.carol.privateKey, send: directSender(bobNode, { as: 'bob' }), now: () => NOW });
  await syncCirclePeer({ replica: aliceNode, principalId: 'alice', privateKey: keys.alice.privateKey, send: directSender(bobNode, { as: 'bob' }), now: () => NOW });
  assert.deepEqual(aliceNode.heads(), carolNode.heads());
  assert.equal(view(aliceNode).package_digest, view(carolNode).package_digest);
  assert.equal(view(aliceNode).package.memberships.length, 3);

  // Nothing new: one pull, no offer.
  const idle = await syncCirclePeer({ replica: carolNode, principalId: 'carol', privateKey: keys.carol.privateKey, send: directSender(bobNode, { as: 'bob' }), now: () => NOW });
  assert.equal(idle.rounds, 1);
  assert.equal(idle.pulled.accepted + idle.offered.accepted, 0);
});

test('a node answers only established keys of members in standing or endorsed to join', async () => {
  const { alice, bob, carol } = logs();
  const node = replicaWith(alice, bob, carol);
  const guard = new ReplayGuard({ maxEntries: 1_000 });
  const heads = new CircleReplica({ genesis }).heads();
  const call = (operation, message, now = NOW) => handleCircleSyncRequest(node, operation, message, { now, replayGuard: guard, signer: signerFor('alice') });
  const code = async (...args) => {
    const result = await call(...args);
    return [result.status, result.body.error?.code ?? 'ok'];
  };
  const before = node.heads();

  assert.deepEqual(await code('pull', request('pull', heads, { as: 'bob' })), [200, 'ok']);
  // A stranger's key was never established in this Circle.
  assert.deepEqual(await code('pull', request('pull', heads, { as: 'mallory' })), [401, 'unauthenticated']);
  // Mallory signs under bob's name and key id: the signature does not verify.
  const forged = request('pull', heads, { as: 'bob' });
  forged.request.attestation = request('pull', heads, { as: 'bob', pair: keys.mallory }).request.attestation;
  forged.request.attestation.digest = digestObject(forged.request.body);
  assert.deepEqual(await code('pull', forged), [401, 'unauthenticated']);
  // Bob's key cannot speak for carol.
  const asCarol = request('pull', heads, { as: 'bob' });
  asCarol.request.body.principal_id = 'carol';
  assert.deepEqual(await code('pull', asCarol), [401, 'unauthenticated']);
  // The payload is bound to the signature.
  const swapped = request('pull', heads, { as: 'bob' });
  swapped.payload = node.heads();
  assert.deepEqual(await code('pull', swapped), [401, 'payload_mismatch']);
  // A pull cannot be replayed as an offer.
  assert.deepEqual(await code('offer', request('pull', heads, { as: 'bob' })), [400, 'wrong_operation']);
  // Time and nonce.
  assert.deepEqual(await code('pull', request('pull', heads, { as: 'bob', now: NOW - 180_000 })), [401, 'stale']);
  assert.deepEqual(await code('pull', request('pull', heads, { as: 'bob', now: NOW + 180_000 })), [401, 'stale']);
  const once = request('pull', heads, { as: 'bob' });
  assert.deepEqual(await code('pull', once), [200, 'ok']);
  assert.deepEqual(await code('pull', once), [409, 'replayed']);
  // Another Circle.
  const other = genesisFor({ quorum: 7000 });
  assert.deepEqual(await code('pull', request('pull', heads, { as: 'bob', genesisDigest: circleGenesisDigest(other) })), [404, 'unknown_circle']);
  // Malformed.
  assert.deepEqual(await code('pull', { request: once.request }), [400, 'malformed']);
  assert.deepEqual(await code('pull', request('pull', { nonsense: true }, { as: 'bob' })), [400, 'malformed']);
  assert.deepEqual(await code('offer', request('offer', { schema: 'x' }, { as: 'bob' })), [400, 'malformed']);

  // A refused request records no nonce, so it cannot burn a member's.
  const nonce = randomBytes(18).toString('base64url');
  assert.deepEqual(await code('pull', request('pull', heads, { as: 'mallory', nonce })), [401, 'unauthenticated']);
  assert.deepEqual(await code('pull', request('pull', heads, { as: 'bob', nonce })), [200, 'ok']);

  // An offer from a stranger changes nothing.
  const strangerLog = append([], 'mallory', [['membership', membership('mallory', 'member')]]);
  const offer = { schema: 'axiom-circle-exchange-bundle.v0', genesis_digest: node.genesisDigest, updates: strangerLog, complete: true };
  assert.deepEqual(await code('offer', request('offer', offer, { as: 'mallory' })), [401, 'unauthenticated']);
  assert.deepEqual(node.heads(), before);
});

test('every answer is a node statement signed for exactly that request and answer', async () => {
  const { alice, bob } = logs();
  const aliceNode = replicaWith(alice, bob);
  const honest = directSender(aliceNode);
  const sync = (replica, send) => syncCirclePeer({ replica, principalId: 'bob', privateKey: keys.bob.privateKey, send, now: () => NOW });

  const bobNode = replicaWith(bob);
  const result = await sync(bobNode, honest);
  assert.equal(result.statements.unattributed, 0);
  assert.equal(result.statements.verified, result.rounds);
  const statement = result.last_statement.body;
  assert.equal(statement.schema, 'axiom-circle-node-statement.v0');
  assert.equal(statement.principal_id, 'alice');
  assert.equal(statement.key_id, circleKeyId(keys.alice.publicKey));
  assert.equal(statement.genesis_digest, circleGenesisDigest(genesis));

  // Changed in transit (the last update withheld): refused before anything
  // applies, though every remaining update would verify on its own.
  const dropped = replicaWith(bob);
  await assert.rejects(sync(dropped, async (path, message) => {
    const answer = await honest(path, message);
    return { ...answer, bundle: { ...answer.bundle, updates: answer.bundle.updates.slice(0, -1) } };
  }), /does not match this request and answer/);
  assert.equal(dropped.heads().heads.length, 0);

  // A genuine answer to another request (an earlier exchange, replayed).
  const earlier = await honest(CIRCLE_PULL_PATH, createCircleSyncRequest({
    genesisDigest: aliceNode.genesisDigest, operation: 'pull', payload: new CircleReplica({ genesis }).heads(),
    principalId: 'bob', privateKey: keys.bob.privateKey, now: NOW
  }));
  await assert.rejects(sync(replicaWith(bob), async () => earlier), /does not match this request and answer/);

  // Signed by the node, but claiming heads other than the ones it sent.
  await assert.rejects(sync(replicaWith(bob), async (path, message) => resign(await honest(path, message), 'alice', {
    heads_digest: digestObject(new CircleReplica({ genesis }).heads())
  })), /does not match this request and answer/);

  // Signed under alice's name with another member's key.
  await assert.rejects(sync(replicaWith(bob), async (path, message) => resign(await honest(path, message), 'bob')), /signature is invalid/);

  // A node key the member cannot place: unattributed, but the updates,
  // which verify themselves, still apply.
  const unplaced = replicaWith(bob);
  const stranger = await sync(unplaced, directSender(aliceNode, { as: 'mallory' }));
  assert.equal(stranger.statements.verified, 0);
  assert.equal(stranger.statements.unattributed, stranger.rounds);
  assert.equal(stranger.last_statement, null);
  assert.deepEqual(unplaced.heads(), aliceNode.heads());
});

test('each key has a request budget, spent only by authenticated members', async () => {
  const { alice, bob, carol } = logs();
  const node = replicaWith(alice, bob, carol);
  const heads = new CircleReplica({ genesis }).heads();
  const guard = new ReplayGuard({ maxEntries: 1_000 });
  const limiter = new CircleRateLimiter({ capacity: 2, refillPerSecond: 1 });
  const call = async (as, { now = NOW, nonce } = {}) => {
    const result = await handleCircleSyncRequest(node, 'pull', request('pull', heads, { as, now, nonce }), {
      now, replayGuard: guard, rateLimiter: limiter, signer: signerFor('alice')
    });
    return [result.status, result.body.error?.code ?? 'ok'];
  };
  // Strangers are refused before any budget is touched.
  for (let index = 0; index < 5; index += 1) assert.deepEqual(await call('mallory'), [401, 'unauthenticated']);
  assert.deepEqual(await call('bob'), [200, 'ok']);
  assert.deepEqual(await call('bob'), [200, 'ok']);
  const nonce = randomBytes(18).toString('base64url');
  assert.deepEqual(await call('bob', { nonce }), [429, 'rate_limited']);
  // Carol's budget is her own.
  assert.deepEqual(await call('carol'), [200, 'ok']);
  // The refused request recorded no nonce: once the bucket refills, the same
  // request is answered.
  assert.deepEqual(await call('bob', { nonce, now: NOW + 1_000 }), [200, 'ok']);
});

// A node's signed evidence ({ statement, heads }) from one pull by bob.
async function pullEvidence(node, { as = 'alice', now = NOW } = {}) {
  const answer = await directSender(node, { as, now })(CIRCLE_PULL_PATH, createCircleSyncRequest({
    genesisDigest: node.genesisDigest, operation: 'pull', payload: new CircleReplica({ genesis }).heads(),
    principalId: 'bob', privateKey: keys.bob.privateKey, now
  }));
  return { statement: answer.statement, heads: answer.heads };
}

test('a node whose signed heads contradict its own earlier statement or its own updates is found out', async () => {
  const { alice, bob } = logs();
  const member = replicaWith(alice, bob);
  const honest = replicaWith(alice, bob);
  // The same node later serving from a rolled-back replica: alice's log cut
  // to its first three updates.
  const rolledBack = replicaWith(alice.slice(0, 3), bob);

  const first = await pullEvidence(honest);
  assert.equal(verifyCircleNodeEvidence(member, first).principal_id, 'alice');
  assert.deepEqual(detectCircleWithholding({ replica: member, current: first }), [], 'an honest node gives no finding');

  const later = await pullEvidence(rolledBack, { now: NOW + 60_000 });
  const findings = detectCircleWithholding({ replica: member, previous: first, current: later });
  assert.deepEqual(findings.map(item => item.kind).sort(), ['heads_regressed', 'own_update_withheld']);
  const regressed = findings.find(item => item.kind === 'heads_regressed');
  assert.deepEqual([regressed.author, regressed.earlier_counter, regressed.later_counter], ['alice', alice.length, 3]);
  const withheld = findings.find(item => item.kind === 'own_update_withheld');
  assert.deepEqual([withheld.author, withheld.claimed_counter, withheld.withheld_counter], ['alice', 3, 4]);

  // Anyone holding the Circle can check each finding from its own evidence.
  const checker = replicaWith(alice, bob);
  for (const item of findings) assert.equal(verifyCircleWithholdingFinding(checker, JSON.parse(JSON.stringify(item))), true);
  assert.throws(() => verifyCircleWithholdingFinding(checker, { ...regressed, later_counter: 5 }), /does not hold/);
  assert.throws(() => verifyCircleWithholdingFinding(checker, { ...withheld, withheld_counter: 3 }), /does not hold/);
  // Heads other than the ones signed are not evidence.
  assert.throws(() => verifyCircleNodeEvidence(checker, { ...later, heads: first.heads }), /evidence is invalid/);
  assert.throws(() => verifyCircleNodeEvidence(checker, { ...later, statement: resign({ ...later, schema: 'x' }, 'bob').statement }),
    /evidence is invalid|cannot be verified/);

  // Order matters: a statement signed earlier that claims less, even if it
  // arrives later, shows what the node held then, not a regression.
  const older = await pullEvidence(rolledBack, { now: NOW - 60_000 });
  const olderFindings = detectCircleWithholding({ replica: member, previous: first, current: older });
  assert.ok(!olderFindings.some(item => item.kind === 'heads_regressed'));
  assert.deepEqual(detectCircleWithholding({ replica: member, previous: later, current: first }), []);
});

test('an update the node dated after its statement is not withholding', async () => {
  const { alice, bob } = logs();
  const member = replicaWith(alice, bob);
  // Alice's first two updates are endorsements at 12:00:30; her invitations
  // start at 12:01. A statement at 12:00:45 holding only the endorsements
  // withholds nothing she had authored by then.
  const early = replicaWith(alice.slice(0, 2));
  const at = Date.parse('2026-08-20T12:00:45.000Z');
  const evidence = await pullEvidence(early, { now: at });
  assert.deepEqual(detectCircleWithholding({ replica: member, current: evidence }), []);
  // The same heads signed after her invitations were dated do withhold.
  const late = await pullEvidence(early, { now: Date.parse('2026-08-20T12:01:30.000Z') });
  const [finding] = detectCircleWithholding({ replica: member, current: late });
  assert.deepEqual([finding.kind, finding.claimed_counter, finding.withheld_counter], ['own_update_withheld', 2, 3]);
});

// A node's answer to `by` offering `bundle`: its statement and the heads it
// signed after applying the offer.
async function offerEvidence(node, bundle, { as = 'alice', by = 'bob', now = NOW } = {}) {
  const answer = await directSender(node, { as, now })(CIRCLE_OFFER_PATH, createCircleSyncRequest({
    genesisDigest: node.genesisDigest, operation: 'offer', payload: bundle,
    principalId: by, privateKey: keys[by].privateKey, now
  }));
  return { statement: answer.statement, heads: answer.heads };
}

// Signs a node statement body with `name`'s key.
function statementSignedBy(body, name) {
  const canonical = canonicalJson(body);
  return {
    body,
    attestation: { algorithm: 'Ed25519', digest: sha256(canonical), signature: sign(null, Buffer.from(canonical), keys[name].privateKey).toString('base64url') }
  };
}

function evidenceUpdate(log, author, record) {
  return JSON.parse(JSON.stringify(createCircleUpdate({
    genesis, author, counter: log.length + 1, previous: log.at(-1) ?? null,
    recordType: 'node_evidence', record, privateKey: keys[author].privateKey
  })));
}

test('a node that acknowledged a member’s updates and later serves others without them is found out from published evidence', async () => {
  const { alice, bob, carol } = logs();
  // Alice's node lacks bob's membership until bob offers it; its receipt
  // signs heads that include it.
  const node = replicaWith(alice, carol);
  const receipt = await offerEvidence(node, replicaWith(alice, bob, carol).updatesFor(node.heads()));
  assert.equal(receipt.statement.body.operation, 'offer');
  assert.equal(receipt.heads.heads.find(head => head.author === 'bob')?.counter, 1);

  // A minute later the same node serves carol as if it never had it.
  const withholding = replicaWith(alice, carol);
  const served = await pullEvidence(withholding, { now: NOW + 60_000 });
  const member = replicaWith(alice, bob, carol);
  assert.deepEqual(detectCircleWithholding({ replica: member, current: served }), [],
    'on its own, carol cannot tell: the update is not the node’s own');

  // Bob publishes the node's receipt; it reaches carol by any path.
  const published = evidenceUpdate(bob, 'bob', {
    published_by: 'bob', published_at: new Date(NOW + 1_000).toISOString(), evidence: receipt
  });
  assert.equal(member.receive(published).status, 'accepted');
  const asOf = new Date(NOW + 120_000).toISOString();
  const view = member.view({ asOf });
  assert.deepEqual(view.excluded, []);
  assert.equal(view.node_evidence.length, 1);
  assert.deepEqual(
    [view.node_evidence[0].published_by, view.node_evidence[0].node_principal_id, view.node_evidence[0].issued_at],
    ['bob', 'alice', new Date(NOW).toISOString()]
  );
  const evidence = view.node_evidence.map(item => item.evidence);

  const findings = detectCircleWithholdingAcross({ replica: member, evidence: [...evidence, served] });
  assert.equal(findings.length, 1);
  assert.deepEqual(
    [findings[0].kind, findings[0].author, findings[0].earlier_counter, findings[0].later_counter],
    ['heads_regressed', 'bob', 1, 0]
  );
  // Anyone holding the Circle can check it from its own evidence.
  assert.equal(verifyCircleWithholdingFinding(replicaWith(alice, bob, carol), JSON.parse(JSON.stringify(findings[0]))), true);

  // An honest node gives none; nor does an earlier statement that claims
  // less, since the node had not yet received the update.
  const honest = await pullEvidence(replicaWith(alice, bob, carol), { now: NOW + 60_000 });
  assert.deepEqual(detectCircleWithholdingAcross({ replica: member, evidence: [...evidence, honest] }), []);
  const before = await pullEvidence(withholding, { now: NOW - 60_000 });
  assert.deepEqual(detectCircleWithholdingAcross({ replica: member, evidence: [...evidence, before] }), []);
  // Statements from another node are never compared with this one's.
  const carolsNode = await pullEvidence(withholding, { as: 'carol', now: NOW + 60_000 });
  assert.deepEqual(detectCircleWithholdingAcross({ replica: member, evidence: [...evidence, carolsNode] }), []);
  // Evidence that does not verify is not compared.
  const forged = { statement: statementSignedBy(served.statement.body, 'bob'), heads: served.heads };
  assert.deepEqual(detectCircleWithholdingAcross({ replica: member, evidence: [...evidence, forged] }), []);
});

test('node evidence is kept only when well formed, published by a member in standing and signed by the node', async () => {
  const { alice, bob, carol } = logs();
  const node = replicaWith(alice, carol);
  const receipt = await offerEvidence(node, replicaWith(alice, bob, carol).updatesFor(node.heads()));
  const other = await pullEvidence(replicaWith(alice), { now: NOW + 5_000 });
  const record = (overrides = {}) => ({
    published_by: 'bob', published_at: new Date(NOW + 1_000).toISOString(), evidence: receipt, ...overrides
  });
  const refused = (value, code, pattern, author = 'bob', log = bob) => {
    const result = replicaWith(alice, bob, carol).receive(evidenceUpdate(log, author, value));
    assert.equal(result.status, 'rejected');
    assert.equal(result.code, code);
    assert.match(result.reason, pattern);
  };
  refused(record({ evidence: { ...receipt, heads: other.heads } }), 'malformed', /not the heads the node signed/);
  refused(record({ published_at: new Date(NOW - 1_000).toISOString() }), 'malformed', /before the node issued it/);
  refused(record({ published_at: '2026-08-21T00:00:01Z' }), 'malformed', /malformed/);
  refused({ ...record(), note: 'extra' }, 'malformed', /fields are invalid/);
  refused(record({ evidence: { ...receipt, statement: { ...receipt.statement, body: { ...receipt.statement.body, genesis_digest: 'f'.repeat(64) } } } }), 'malformed', /malformed/);
  refused(record({ evidence: { ...receipt, statement: { ...receipt.statement, body: { ...receipt.statement.body, operation: 'push' } } } }), 'malformed', /malformed/);
  refused(record({ published_by: 'carol' }), 'authorship', /naming someone else/);

  const kept = (value, author = 'bob', log = bob, extra = []) => {
    const replica = replicaWith(alice, bob, carol, extra);
    assert.equal(replica.receive(evidenceUpdate(log, author, value)).status, 'accepted');
    return replica.view({ asOf: new Date(NOW + 120_000).toISOString() });
  };
  // Signed by someone other than the node it names.
  const impersonated = kept(record({ evidence: { statement: statementSignedBy(receipt.statement.body, 'bob'), heads: receipt.heads } }));
  assert.equal(impersonated.node_evidence.length, 0);
  assert.match(impersonated.excluded[0].reason, /not signed with a key the Circle established/);
  // Published by a member who had left.
  const exited = [...carol];
  append(exited, 'carol', [['exit', exitOf('carol', '2026-08-20T18:00:00.000Z')]]);
  const former = kept(record({ published_by: 'carol' }), 'carol', exited, exited);
  assert.equal(former.node_evidence.length, 0);
  assert.match(former.excluded.at(-1).reason, /was not a member when publishing node evidence/);
  // And the honest record is kept.
  assert.equal(kept(record()).node_evidence.length, 1);
});

test('a member publishes a node’s receipt from their own node, and another member’s node finds the withholding it proves', async t => {
  const root = await mkdtemp(join(tmpdir(), 'axiom-circle-peer-evidence-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const { alice, bob, carol } = logs();
  const origin = 'http://127.0.0.1:9';

  // Bob syncs with alice's node, which lacks his membership until he offers it.
  const bobFiles = await peerFiles(root, 'bob', { principal: 'bob', peers: [{ origin }] });
  const bobRuntime = await loadCirclePeerRuntime(bobFiles.configFile, { allowInsecureLoopback: true });
  await seed(bobRuntime, [alice, bob, carol].flat());
  const node = replicaWith(alice, carol);
  const synced = await runCirclePeerSync(bobRuntime, { now: () => NOW, senderFor: () => directSender(node, { now: NOW }) });
  assert.equal(synced.peers[0].status, 'synced');
  await assert.rejects(publishCirclePeerNodeEvidence(bobRuntime, 'https://unknown.example'), /No statement from https:\/\/unknown\.example/);
  const published = await publishCirclePeerNodeEvidence(bobRuntime, origin, { now: () => NOW + 1_000 });
  assert.deepEqual([published.record_type, published.excluded], ['node_evidence', null]);
  await assert.rejects(runCirclePeerCommand(['publish-evidence', bobFiles.configFile]), /Usage/);

  // Carol holds bob's updates, including that record, and syncs with the
  // node, which now serves as if it never had bob's membership.
  const carolFiles = await peerFiles(root, 'carol', { principal: 'carol', peers: [{ origin }] });
  const carolRuntime = await loadCirclePeerRuntime(carolFiles.configFile, { allowInsecureLoopback: true });
  const bobReplica = await openCirclePeerReplica(bobRuntime);
  const bobUpdates = bobReplica.authoredAfter({ author: 'bob', keyId: bobRuntime.key_id, counter: 0 }).map(item => item.update);
  assert.equal(bobUpdates.length, 2);
  await seed(carolRuntime, [alice, carol, bobUpdates].flat());
  const withholding = replicaWith(alice, carol);
  const sync = at => runCirclePeerSync(carolRuntime, { now: () => at, senderFor: () => directSender(withholding, { now: at }) });
  const first = await sync(NOW + 60_000);
  assert.equal(first.peers[0].status, 'synced');
  assert.equal(first.peers[0].findings, 0, 'carol’s own statements alone show nothing');

  const status = await circlePeerStatus(carolRuntime);
  const found = status.findings.filter(item => item.origin === 'published-evidence');
  assert.deepEqual(found.map(item => [item.kind, item.author, item.earlier_counter, item.later_counter]), [['heads_regressed', 'bob', 1, 0]]);
  const { replica, findings } = await circlePeerFindings(carolRuntime);
  for (const item of findings) assert.equal(verifyCircleWithholdingFinding(replica, item.finding), true);
  // Seen again, it is not recorded twice.
  await sync(NOW + 90_000);
  assert.equal((await circlePeerStatus(carolRuntime)).findings.filter(item => item.origin === 'published-evidence').length, 1);
});

test('the peer records withholding findings once, with evidence that verifies from its state', async t => {
  const root = await mkdtemp(join(tmpdir(), 'axiom-circle-peer-findings-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const { alice, bob } = logs();
  const files = await peerFiles(root, 'bob', { principal: 'bob', peers: [{ origin: 'http://127.0.0.1:9' }] });
  const runtime = await loadCirclePeerRuntime(files.configFile, { allowInsecureLoopback: true });
  await seed(runtime, bob);
  const honest = replicaWith(alice, bob);
  const sync = (sender, now) => runCirclePeerSync(runtime, { now: () => now, senderFor: () => sender });

  const first = await sync(directSender(honest, { now: NOW }), NOW);
  assert.equal(first.peers[0].status, 'synced');
  assert.equal(first.peers[0].findings, 0);

  // Then the node serves rolled-back heads. Its pull statement withholds;
  // its offer receipt, after bob sends the missing updates, does not.
  const rolledBack = () => replicaWith(alice.slice(0, 3), bob);
  const stale = async (path, message) => directSender(rolledBack(), { now: NOW + 60_000 })(path, message);
  const second = await sync(stale, NOW + 60_000);
  assert.equal(second.peers[0].status, 'synced');
  assert.equal(second.peers[0].findings, 2);
  // Seen again, the same facts are not recorded twice.
  const third = await sync(async (path, message) => directSender(rolledBack(), { now: NOW + 90_000 })(path, message), NOW + 90_000);
  assert.equal(third.peers[0].findings, 0);

  const status = await circlePeerStatus(runtime);
  assert.deepEqual(status.findings.map(item => item.kind).sort(), ['heads_regressed', 'own_update_withheld']);
  const { replica, findings } = await circlePeerFindings(runtime);
  for (const item of findings) assert.equal(verifyCircleWithholdingFinding(replica, item.finding), true);
});

test('former members and revoked keys are refused', async () => {
  const { alice, bob, carol } = logs();
  append(carol, 'carol', [['exit', exitOf('carol', '2026-08-20T18:00:00.000Z')]]);
  append(alice, 'alice', [['key_revocation', createCircleKeyRevocation({
    circleId: genesis.circle.circle_id,
    principalId: 'bob',
    keyId: circleKeyId(keys.bob.publicKey),
    lastValidCounter: 1,
    revokedBy: 'alice',
    revokedAt: '2026-08-20T20:00:00.000Z',
    reasonCode: 'key-compromised'
  })]]);
  const node = replicaWith(alice, bob, carol);
  const guard = new ReplayGuard({ maxEntries: 1_000 });
  const heads = new CircleReplica({ genesis }).heads();
  const status = async (as, now = NOW) => {
    const result = await handleCircleSyncRequest(node, 'pull', request('pull', heads, { as, now }), { now, replayGuard: guard, signer: signerFor('alice') });
    return [result.status, result.body.error?.code ?? 'ok'];
  };
  assert.deepEqual(await status('alice'), [200, 'ok']);
  // Carol exited: she was in standing, so she is not "endorsed to join".
  assert.deepEqual(await status('carol'), [403, 'not_a_member']);
  // Bob's key is revoked.
  assert.deepEqual(await status('bob'), [403, 'not_a_member']);
  // Before either took effect, both were answered.
  const earlier = Date.parse('2026-08-20T17:00:00.000Z');
  assert.deepEqual(await status('carol', earlier), [200, 'ok']);
  assert.deepEqual(await status('bob', earlier), [200, 'ok']);
});

async function peerFiles(root, name, { principal, pair = keys[principal], listen, peers = [], enabled = true, genesisValue = genesis, disclosureKey }) {
  const dir = join(root, name);
  await mkdir(dir, { recursive: true, mode: 0o700 });
  const genesisFile = join(dir, 'genesis.json');
  await writeFile(genesisFile, JSON.stringify(genesisValue));
  const keyFile = join(dir, 'member.pem');
  await writeFile(keyFile, pair.privateKey.export({ type: 'pkcs8', format: 'pem' }), { mode: 0o600 });
  const stateKeyFile = join(dir, 'state.key');
  await writeFile(stateKeyFile, randomBytes(32).toString('base64url'), { mode: 0o600 });
  let disclosureFile;
  if (disclosureKey) {
    disclosureFile = join(dir, 'disclosure.pem');
    await writeFile(disclosureFile, disclosureKey.privateKey.export({ type: 'pkcs8', format: 'pem' }), { mode: 0o600 });
  }
  const config = {
    schema: 'axiom-circle-peer-config.v0',
    enabled,
    genesis_file: genesisFile,
    member: {
      principal_id: principal,
      private_key_file: keyFile,
      ...(disclosureFile ? { disclosure_key_file: disclosureFile } : {})
    },
    state_file: join(dir, 'state', 'circle.sealed'),
    state_key_file: stateKeyFile,
    ...(listen ? { listen } : {}),
    peers
  };
  const configFile = join(dir, 'config.json');
  await writeFile(configFile, JSON.stringify(config), { mode: 0o600 });
  return { dir, configFile, config };
}

async function seed(runtime, updates) {
  const { saveCirclePeerReplica } = await import('../src/lib/circle-peer.mjs');
  await saveCirclePeerReplica(runtime, replicaWith(updates));
}

test('two peer nodes sync over HTTPS with a pinned CA, and keep their state encrypted', async t => {
  const root = await mkdtemp(join(tmpdir(), 'axiom-circle-peer-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  // A private CA and a leaf, as a member might run for their own node.
  const secretDir = join(root, 'secrets');
  await provisionTransportCredentials({ secretDir });
  const transport = join(secretDir, 'transport');
  const { alice, bob } = logs();

  const aliceFiles = await peerFiles(root, 'alice', {
    principal: 'alice',
    listen: {
      host: '127.0.0.1', port: 0,
      tls_key_file: join(transport, 'services', 'grid.key.pem'),
      tls_cert_file: join(transport, 'services', 'grid.cert.pem')
    }
  });
  const aliceRuntime = await loadCirclePeerRuntime(aliceFiles.configFile);
  await seed(aliceRuntime, alice);
  const node = await serveCirclePeer(aliceRuntime);
  t.after(() => node.close());

  const bobFiles = await peerFiles(root, 'bob', {
    principal: 'bob',
    peers: [{
      origin: `https://127.0.0.1:${node.port}`,
      ca_file: join(transport, 'ca-cert.pem'),
      server_name: 'grid.service.axiom-mesh.internal'
    }]
  });
  const bobRuntime = await loadCirclePeerRuntime(bobFiles.configFile);
  await seed(bobRuntime, bob);
  const lines = [];
  const result = await runCirclePeerCommand(['sync', bobFiles.configFile], { output: { write: line => lines.push(line) } });
  assert.equal(result.peers[0].status, 'synced', JSON.stringify(result.peers[0]));
  assert.equal(result.peers[0].offered.accepted, 1);
  assert.equal(JSON.parse(lines[0]).peers[0].status, 'synced');
  assert.deepEqual(node.replica.heads(), (await openCirclePeerReplica(bobRuntime)).heads());

  // Bob keeps alice's node's latest signed statement with his state.
  const status = await circlePeerStatus(bobRuntime);
  assert.equal(status.statements.length, 1);
  assert.equal(status.statements[0].principal_id, 'alice');
  assert.equal(status.statements[0].key_id, circleKeyId(keys.alice.publicKey));

  // Both nodes' state survives a restart, sealed under their own keys.
  const reopened = await openCirclePeerReplica(aliceRuntime);
  assert.deepEqual(reopened.heads(), node.replica.heads());
  const sealed = await readFile(bobRuntime.config.state_file, 'utf8');
  assert.doesNotMatch(sealed, /membership\.bob/);
  await writeFile(bobRuntime.config.state_key_file, randomBytes(32).toString('base64url'), { mode: 0o600 });
  await assert.rejects(openCirclePeerReplica(await loadCirclePeerRuntime(bobFiles.configFile)));

  // A peer whose certificate the pinned CA did not issue fails, and is
  // reported without stopping the command.
  const unpinned = await peerFiles(root, 'bob-unpinned', {
    principal: 'bob',
    peers: [{ origin: `https://127.0.0.1:${node.port}`, server_name: 'grid.service.axiom-mesh.internal' }]
  });
  const refused = await runCirclePeerCommand(['sync', unpinned.configFile], { output: { write() {} } });
  assert.equal(refused.peers[0].status, 'failed');

  // The serving node holds the state: a second process cannot sync it.
  await assert.rejects(runCirclePeerSync(aliceRuntime), /in use by another process/);
});

test('accepted pull updates survive a later peer failure', async t => {
  const root = await mkdtemp(join(tmpdir(), 'axiom-circle-peer-partial-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const { alice } = logs();
  const node = replicaWith(alice);
  const files = await peerFiles(root, 'bob', {
    principal: 'bob',
    peers: [{ origin: 'http://127.0.0.1:9' }]
  });
  const runtime = await loadCirclePeerRuntime(files.configFile, { allowInsecureLoopback: true });
  let pulls = 0;
  const result = await runCirclePeerSync(runtime, {
    now: () => NOW,
    senderFor: () => async (path, message) => {
      if (++pulls === 1) {
        const response = await directSender(node)(path, message);
        // A real large Circle produces a partial bundle. The second read
        // fails after its first batch has already changed the local replica.
        // The node signs the answer it actually served.
        return resign({ ...response, bundle: { ...response.bundle, complete: false } }, 'alice');
      }
      throw Object.assign(new Error('peer disconnected'), { code: 'ECONNRESET' });
    }
  });
  assert.equal(result.peers[0].status, 'failed');
  assert.ok(result.status.updates > 0);
  assert.deepEqual((await openCirclePeerReplica(runtime)).heads(), node.heads());
});

test('the transport is off unless configured on, and never plain HTTP from the command', async t => {
  const root = await mkdtemp(join(tmpdir(), 'axiom-circle-peer-config-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const off = await peerFiles(root, 'off', { principal: 'bob', enabled: false });
  await assert.rejects(runCirclePeerCommand(['status', off.configFile]), /disabled; set "enabled": true/);
  // Only the literal true turns it on.
  for (const [name, enabled] of [['null', null], ['truthy', 1], ['string', 'true']]) {
    const files = await peerFiles(root, name, { principal: 'bob', enabled });
    await assert.rejects(loadCirclePeerRuntime(files.configFile), /disabled/, name);
  }

  const http = await peerFiles(root, 'http', { principal: 'bob', peers: [{ origin: 'http://127.0.0.1:9' }] });
  await assert.rejects(loadCirclePeerRuntime(http.configFile), /must use HTTPS/);
  // Even the library's loopback allowance never admits a remote plain origin.
  const remote = await peerFiles(root, 'remote', { principal: 'bob', peers: [{ origin: 'http://example.org' }] });
  await assert.rejects(loadCirclePeerRuntime(remote.configFile, { allowInsecureLoopback: true }), /must use HTTPS/);
  const noTls = await peerFiles(root, 'notls', { principal: 'bob', listen: { host: '127.0.0.1', port: 0 } });
  await assert.rejects(loadCirclePeerRuntime(noTls.configFile), /requires tls_key_file/);
  const pathy = await peerFiles(root, 'pathy', { principal: 'bob', peers: [{ origin: 'https://node.example/circle' }] });
  await assert.rejects(loadCirclePeerRuntime(pathy.configFile), /exact origin/);

  if (process.platform !== 'win32') {
    const loose = await peerFiles(root, 'loose', { principal: 'bob' });
    await chmod(loose.config.member.private_key_file, 0o644);
    await assert.rejects(loadCirclePeerRuntime(loose.configFile), /group or others/);
  }
  await assert.rejects(runCirclePeerCommand(['serve']), /Usage/);
});

test('the HTTP layer bounds requests and answers only its two routes', async t => {
  const root = await mkdtemp(join(tmpdir(), 'axiom-circle-peer-http-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const { alice } = logs();
  const files = await peerFiles(root, 'alice', { principal: 'alice', listen: { host: '127.0.0.1', port: 0 } });
  const runtime = await loadCirclePeerRuntime(files.configFile, { allowInsecureLoopback: true });
  await seed(runtime, alice);
  const node = await serveCirclePeer(runtime, { now: () => NOW });
  t.after(() => node.close());
  const origin = `http://127.0.0.1:${node.port}`;

  const post = (path, body, type = 'application/json') => fetch(`${origin}${path}`, { method: 'POST', headers: { 'content-type': type }, body });
  assert.equal((await fetch(`${origin}${CIRCLE_PULL_PATH}`)).status, 405);
  assert.equal((await post('/circle/v0/other', '{}')).status, 404);
  assert.equal((await post(CIRCLE_PULL_PATH, '{}', 'text/plain')).status, 415);
  assert.equal((await post(CIRCLE_PULL_PATH, 'not json')).status, 400);
  assert.equal((await post(CIRCLE_OFFER_PATH, 'x'.repeat(CIRCLE_SYNC_MAX_REQUEST_BYTES + 1))).status, 413);

  // A real pull through the sender works, and a refusal carries its code.
  const bobNode = new CircleReplica({ genesis });
  const send = httpCircleSender({ origin, allowInsecureLoopback: true });
  const pulled = await send(CIRCLE_PULL_PATH, createCircleSyncRequest({
    genesisDigest: bobNode.genesisDigest, operation: 'pull', payload: bobNode.heads(), principalId: 'bob', privateKey: keys.bob.privateKey, now: NOW
  }));
  assert.equal(pulled.bundle.updates.length, alice.length);
  await assert.rejects(send(CIRCLE_PULL_PATH, createCircleSyncRequest({
    genesisDigest: bobNode.genesisDigest, operation: 'pull', payload: bobNode.heads(), principalId: 'mallory', privateKey: keys.mallory.privateKey, now: NOW
  })), error => error.code === 'unauthenticated' && error.status === 401);
  assert.throws(() => httpCircleSender({ origin }), /must use HTTPS/);
});

test('a member publishes through their own node: records, a disclosure key, and sealed content only the audience opens', async t => {
  const root = await mkdtemp(join(tmpdir(), 'axiom-circle-peer-author-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const { alice, bob } = logs();
  const lines = [];
  const cli = (...argv) => runCirclePeerCommand(argv, { output: { write: line => lines.push(line) } });
  const input = async (name, value) => {
    const file = join(root, `${name}.json`);
    await writeFile(file, JSON.stringify(value));
    return file;
  };

  const aliceFiles = await peerFiles(root, 'alice', {
    principal: 'alice', listen: { host: '127.0.0.1', port: 0 }, disclosureKey: generateCircleDisclosureKey()
  });
  const aliceRuntime = await loadCirclePeerRuntime(aliceFiles.configFile, { allowInsecureLoopback: true });
  await seed(aliceRuntime, [...alice, ...bob]);
  const aliceKey = await cli('publish-disclosure-key', aliceFiles.configFile).catch(error => error);
  // The command refuses plain HTTP listeners; publishing goes through the library then.
  assert.match(String(aliceKey.message), /requires tls_key_file/);
  const { publishCirclePeerDisclosureKey, sealCirclePeerContent, openCirclePeerContent } = await import('../src/lib/circle-peer.mjs');
  const published = await publishCirclePeerDisclosureKey(aliceRuntime);
  assert.equal(published.record_type, 'disclosure_key');
  assert.equal(published.counter, alice.length + 1, 'the next update in her own log');
  assert.equal(published.excluded, null);

  const node = await serveCirclePeer(aliceRuntime);
  t.after(() => node.close());
  // While her node serves, it owns the state: a second writer is refused.
  await assert.rejects(appendCirclePeerRecord(aliceRuntime, { recordType: 'task', record: {} }), /in use by another process/);

  const bobFiles = await peerFiles(root, 'bob', { principal: 'bob', disclosureKey: generateCircleDisclosureKey() });
  await seed(await loadCirclePeerRuntime(bobFiles.configFile), [...alice, ...bob]);
  const bobKey = await cli('publish-disclosure-key', bobFiles.configFile);
  assert.equal(bobKey.counter, 2);
  const now = new Date();
  const proposal = {
    schema: CIRCLE_PROPOSAL_SCHEMA,
    proposal_id: 'proposal.budget',
    circle_id: genesis.circle.circle_id,
    charter_digest: digestObject(genesis.charter),
    proposer: 'bob',
    title: 'Agree the budget',
    summary: 'The figures are sealed for members and stewards.',
    created_at: now.toISOString(),
    closes_at: new Date(now.getTime() + 2 * 86_400_000).toISOString(),
    status: 'open',
    evidence_refs: [],
    execution_effect: 'none',
    authority_effect: 'none'
  };
  const appended = await cli('append', bobFiles.configFile, 'proposal', await input('proposal', proposal));
  assert.equal(appended.excluded, null, 'a member may propose');
  // A record the view excludes is signed history, and the answer says why.
  const outOfTurn = await cli('append', bobFiles.configFile, 'invitation', await input('invitation', {
    ...invitation('dana', 'member'), issued_by: 'bob', issued_at: now.toISOString()
  }));
  assert.match(outOfTurn.excluded, /bob may not issue invitations/);
  // A record naming someone else is refused outright.
  await assert.rejects(cli('append', bobFiles.configFile, 'proposal', await input('forged', { ...proposal, proposer: 'alice' })), /authorship/);

  // Bob's node syncs with alice's over loopback HTTP, which only tests may
  // select: a second configuration over the same state names her origin.
  const syncConfig = join(root, 'bob', 'sync-config.json');
  await writeFile(syncConfig, JSON.stringify({ ...bobFiles.config, peers: [{ origin: `http://127.0.0.1:${node.port}` }] }), { mode: 0o600 });
  const bobRuntime = await loadCirclePeerRuntime(syncConfig, { allowInsecureLoopback: true });
  const first = await runCirclePeerSync(bobRuntime);
  assert.equal(first.peers[0].status, 'synced', JSON.stringify(first.peers[0]));

  const sealed = await sealCirclePeerContent(bobRuntime, { roleIds: ['member', 'steward'], value: { budget: 1200, currency: 'EUR' } });
  assert.deepEqual(sealed.recipients, ['alice', 'bob'], 'carol has no disclosure key, so she is not a recipient');
  assert.equal(sealed.excluded, null);
  const second = await runCirclePeerSync(bobRuntime);
  assert.equal(second.peers[0].status, 'synced');

  // Alice's node now holds the sealed record; her key opens it.
  const view = node.replica.view({ asOf: new Date(Date.now() + 60_000).toISOString() });
  assert.ok(view.sealed_contents.some(item => item.digest === sealed.digest));
  assert.deepEqual(await openCirclePeerContent(aliceRuntime, sealed.digest), { budget: 1200, currency: 'EUR' });
  assert.deepEqual((await cli('open', bobFiles.configFile, sealed.digest)).value, { budget: 1200, currency: 'EUR' });

  // Only sealed content opens; any other digest is named as such.
  await assert.rejects(openCirclePeerContent(aliceRuntime, appended.digest), /No sealed content with that digest/);

  // Without a disclosure key there is nothing to open with, and a readable key file is refused.
  const plain = await peerFiles(root, 'carol', { principal: 'carol' });
  await assert.rejects(openCirclePeerContent(await loadCirclePeerRuntime(plain.configFile), sealed.digest), /no member.disclosure_key_file/);
  const signingAsDisclosure = await peerFiles(root, 'carol-wrong-key', { principal: 'carol', disclosureKey: { privateKey: keys.carol.privateKey } });
  await assert.rejects(loadCirclePeerRuntime(signingAsDisclosure.configFile), /must use X25519/);
  if (process.platform !== 'win32') {
    await chmod(join(root, 'bob', 'disclosure.pem'), 0o644);
    await assert.rejects(loadCirclePeerRuntime(bobFiles.configFile), /group or others/);
  }
  await assert.rejects(cli('open', bobFiles.configFile), /Usage/);
});
