import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import test from 'node:test';

import { digestObject } from '../src/lib/canonical.mjs';
import {
  CIRCLE_CHARTER_SCHEMA,
  CIRCLE_INVITATION_SCHEMA,
  CIRCLE_MEMBERSHIP_SCHEMA,
  CIRCLE_SCHEMA
} from '../src/lib/circle-core.mjs';
import {
  CIRCLE_SEALED_CONTENT_MAX_BYTES,
  circleDisclosureKeyRecord,
  generateCircleDisclosureKey,
  openCircleSealedContent,
  sealCircleContent,
  validateCircleSealedContentRecord
} from '../src/lib/circle-disclosure.mjs';
import {
  CircleReplica,
  circleGenesisDigest,
  createCircleGenesis,
  createCircleUpdate
} from '../src/lib/circle-exchange.mjs';
import { circleKeyId, createCircleKeyEndorsement, createCircleKeyPossession } from '../src/lib/circle-keys.mjs';

// Per-record disclosure: content sealed for an audience named by role,
// replicated to every member, readable by its recipients only, and kept in
// the view only if the recipients are exactly that audience.

const people = ['alice', 'bob', 'carol', 'dana', 'mallory'];
const signing = Object.fromEntries(people.map(name => [name, generateKeyPairSync('ed25519')]));
const disclosure = Object.fromEntries(people.map(name => [name, generateCircleDisclosureKey()]));
const bobSecondKey = generateCircleDisclosureKey();
const LATER = '2026-08-21T00:00:00.000Z';

function genesisFor(circleId = 'circle.disclosure') {
  const circle = {
    schema: CIRCLE_SCHEMA,
    circle_id: circleId,
    name: 'Disclosure test Circle',
    purpose: 'Seal content for an audience without leaving records out.',
    created_by: 'alice',
    created_at: '2026-08-20T12:00:00.000Z',
    trust_anchor_id: 'anchor.disclosure',
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
    decision_rule: { quorum_basis_points: 5000, approval_basis_points: 6000, abstention_counts_toward_quorum: true },
    appeal_enabled: true,
    member_exit_enabled: true,
    execution_authority: false,
    authority_effect: 'none'
  };
  return createCircleGenesis({ circle, charter, creatorKey: signing.alice.publicKey });
}

function endorsement(genesis, principal) {
  return createCircleKeyEndorsement({
    circleId: genesis.circle.circle_id,
    principalId: principal,
    publicKey: signing[principal].publicKey,
    possession: createCircleKeyPossession({
      genesisDigest: circleGenesisDigest(genesis),
      principalId: principal,
      privateKey: signing[principal].privateKey
    }),
    endorsedBy: 'alice',
    endorsedAt: '2026-08-20T12:00:30.000Z'
  });
}

function invitation(genesis, invitee, role) {
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

const keyRecord = (principal, at = '2026-08-20T12:20:00.000Z', key = disclosure[principal]) => circleDisclosureKeyRecord({
  principalId: principal,
  publicKey: key.publicKey,
  publishedAt: at
});

// alice steward, bob and carol members, dana reviewer. alice, bob and dana
// publish disclosure keys; carol does not; mallory is no member.
function circleScript(genesis) {
  return [
    ['alice', 'key_endorsement', endorsement(genesis, 'bob')],
    ['alice', 'key_endorsement', endorsement(genesis, 'carol')],
    ['alice', 'key_endorsement', endorsement(genesis, 'dana')],
    ['alice', 'key_endorsement', endorsement(genesis, 'mallory')],
    ['alice', 'invitation', invitation(genesis, 'alice', 'steward')],
    ['alice', 'membership', membership(genesis, 'alice', 'steward', '2026-08-20T12:05:00.000Z')],
    ['alice', 'invitation', invitation(genesis, 'bob', 'member')],
    ['alice', 'invitation', invitation(genesis, 'carol', 'member')],
    ['alice', 'invitation', invitation(genesis, 'dana', 'reviewer')],
    ['bob', 'membership', membership(genesis, 'bob', 'member')],
    ['carol', 'membership', membership(genesis, 'carol', 'member')],
    ['dana', 'membership', membership(genesis, 'dana', 'reviewer')],
    ['alice', 'disclosure_key', keyRecord('alice')],
    ['bob', 'disclosure_key', keyRecord('bob')],
    ['dana', 'disclosure_key', keyRecord('dana')],
    ['mallory', 'disclosure_key', keyRecord('mallory')]
  ];
}

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
      privateKey: signing[author].privateKey
    }));
  }
  return logs;
}

function replicaFrom(genesis, logs) {
  const replica = new CircleReplica({ genesis });
  for (const update of Object.values(logs).flat()) replica.receive(update);
  return replica;
}

function seal(genesis, recipients, { at = '2026-08-20T13:30:00.000Z', roles = ['member'], value = { note: 'budget draft' } } = {}) {
  return sealCircleContent({
    genesisDigest: circleGenesisDigest(genesis),
    publishedBy: 'alice',
    publishedAt: at,
    audienceRoles: roles,
    recipients,
    value
  });
}

const recipientOf = (principal, key = disclosure[principal]) => ({
  principal_id: principal,
  key_id: key.keyId,
  public_key: key.publicKey
});

test('sealed content opens for its recipients only, and refuses any alteration', () => {
  const genesisDigest = 'a'.repeat(64);
  const record = sealCircleContent({
    genesisDigest,
    publishedBy: 'alice',
    publishedAt: '2026-08-20T13:30:00.000Z',
    audienceRoles: ['member'],
    recipients: [recipientOf('bob'), recipientOf('alice')],
    value: { note: 'budget draft', amount: 42 }
  });
  assert.deepEqual(record.envelope.recipients.map(item => item.principal_id), ['alice', 'bob'], 'recipients are sorted');
  for (const principal of ['alice', 'bob']) {
    assert.deepEqual(
      openCircleSealedContent({ record, genesisDigest, principalId: principal, privateKey: disclosure[principal].privateKey }),
      { note: 'budget draft', amount: 42 }
    );
  }
  // No plaintext digest is published.
  assert.doesNotMatch(JSON.stringify(record), new RegExp(digestObject({ note: 'budget draft', amount: 42 })));

  const open = (candidate, principal = 'bob', key = disclosure.bob.privateKey, digest = genesisDigest) => (
    () => openCircleSealedContent({ record: candidate, genesisDigest: digest, principalId: principal, privateKey: key })
  );
  assert.throws(open(record, 'dana', disclosure.dana.privateKey), /not a recipient/);
  assert.throws(open(record, 'bob', disclosure.dana.privateKey), /another disclosure key/);
  assert.throws(open(record, 'bob', disclosure.bob.privateKey, 'b'.repeat(64)), /invalid/, 'bound to its Circle');

  const flipped = structuredClone(record);
  const bytes = Buffer.from(flipped.envelope.ciphertext, 'base64url');
  bytes[0] ^= 1;
  flipped.envelope.ciphertext = bytes.toString('base64url');
  assert.throws(open(flipped), /cannot be opened/);
  const stripped = structuredClone(record);
  stripped.envelope.recipients = stripped.envelope.recipients.filter(item => item.principal_id === 'bob');
  assert.throws(open(stripped), /cannot be opened/, 'the recipient list is bound to the content');
  const swapped = structuredClone(record);
  const [first, second] = swapped.envelope.recipients;
  [first.wrapped_key, second.wrapped_key] = [second.wrapped_key, first.wrapped_key];
  assert.throws(open(swapped), /cannot be opened/, 'each wrap is bound to its recipient');

  assert.throws(() => sealCircleContent({
    genesisDigest,
    publishedBy: 'alice',
    publishedAt: '2026-08-20T13:30:00.000Z',
    audienceRoles: ['member'],
    recipients: [recipientOf('alice')],
    value: 'x'.repeat(CIRCLE_SEALED_CONTENT_MAX_BYTES)
  }), /too large/);
  assert.throws(() => sealCircleContent({
    genesisDigest,
    publishedBy: 'alice',
    publishedAt: '2026-08-20T13:30:00.000Z',
    audienceRoles: ['member'],
    recipients: [{ ...recipientOf('alice'), key_id: disclosure.bob.keyId }],
    value: 1
  }), /Disclosure key for alice is invalid/);
  const unsorted = structuredClone(record);
  unsorted.envelope.recipients.reverse();
  assert.throws(() => validateCircleSealedContentRecord(unsorted, genesisDigest), /recipient is invalid/);
});

test('the view keeps sealed content only when its recipients are exactly the audience in standing with a disclosure key', () => {
  const genesis = genesisFor();
  const base = circleScript(genesis);
  const replica = replicaFrom(genesis, logsFor(genesis, base));
  const at = '2026-08-20T13:30:00.000Z';

  // The audience: members holding 'member' with a disclosure key (bob;
  // carol has none), plus the publisher. dana is a reviewer.
  const expected = replica.disclosureRecipients({ publisher: 'alice', roleIds: ['member'], at });
  assert.deepEqual(expected.map(item => item.principal_id), ['alice', 'bob']);
  const view = replica.view({ asOf: LATER });
  assert.deepEqual(view.disclosure_keys.map(item => item.principal_id), ['alice', 'bob', 'dana'], 'mallory is no member');
  assert.ok(view.excluded.some(item => /mallory was not a member/.test(item.reason)));

  const cases = {
    complete: seal(genesis, expected),
    missing: seal(genesis, [recipientOf('alice')]),
    extra: seal(genesis, [...expected, recipientOf('dana')]),
    stale: seal(genesis, [recipientOf('alice'), recipientOf('bob', bobSecondKey)]),
    reviewers: seal(genesis, replica.disclosureRecipients({ publisher: 'alice', roleIds: ['reviewer'], at }), { roles: ['reviewer'] })
  };
  const script = [...base, ...Object.values(cases).map(record => ['alice', 'sealed_content', record])];
  const logs = logsFor(genesis, script);
  const sealedView = replicaFrom(genesis, logs).view({ asOf: LATER });

  assert.deepEqual(
    sealedView.sealed_contents.map(item => item.recipients.map(recipient => recipient.principal_id).join(',')).sort(),
    ['alice,bob', 'alice,dana'],
    'only the complete envelopes are kept'
  );
  const excludedSealed = sealedView.excluded.filter(item => /Sealed content recipients/.test(item.reason));
  assert.equal(excludedSealed.length, 3, 'missing, extra and stale-key envelopes are excluded');
  assert.equal(sealedView.package_digest, view.package_digest, 'sealed content changes no Core record');

  // bob reads the member content; dana cannot; dana reads the reviewer content.
  const genesisDigest = circleGenesisDigest(genesis);
  assert.deepEqual(openCircleSealedContent({
    record: cases.complete, genesisDigest, principalId: 'bob', privateKey: disclosure.bob.privateKey
  }), { note: 'budget draft' });
  assert.throws(() => openCircleSealedContent({
    record: cases.complete, genesisDigest, principalId: 'dana', privateKey: disclosure.dana.privateKey
  }), /not a recipient/);
  assert.deepEqual(openCircleSealedContent({
    record: cases.reviewers, genesisDigest, principalId: 'dana', privateKey: disclosure.dana.privateKey
  }), { note: 'budget draft' });

  // Every delivery order gives the same view.
  const updates = Object.values(logs).flat();
  const reversed = new CircleReplica({ genesis });
  for (const update of [...updates].reverse()) reversed.receive(update);
  for (const update of updates) reversed.receive(update);
  assert.equal(digestObject(reversed.view({ asOf: LATER })), digestObject(sealedView));
});

test('a later disclosure key governs later content, and earlier content stays sealed for the earlier key', () => {
  const genesis = genesisFor();
  const base = circleScript(genesis);
  const rotatedAt = '2026-08-20T14:00:00.000Z';
  const before = seal(genesis, [recipientOf('alice'), recipientOf('bob')], { at: '2026-08-20T13:30:00.000Z' });
  const after = seal(genesis, [recipientOf('alice'), recipientOf('bob', bobSecondKey)], { at: '2026-08-20T14:30:00.000Z' });
  const staleAfter = seal(genesis, [recipientOf('alice'), recipientOf('bob')], { at: '2026-08-20T14:30:00.000Z' });
  const view = replicaFrom(genesis, logsFor(genesis, [
    ...base,
    ['alice', 'sealed_content', before],
    ['bob', 'disclosure_key', keyRecord('bob', rotatedAt, bobSecondKey)],
    ['alice', 'sealed_content', after],
    ['alice', 'sealed_content', staleAfter]
  ])).view({ asOf: LATER });

  assert.equal(view.sealed_contents.length, 2);
  assert.equal(view.excluded.filter(item => /Sealed content recipients/.test(item.reason)).length, 1);
  assert.equal(view.disclosure_keys.find(item => item.principal_id === 'bob').key_id, bobSecondKey.keyId);
  const genesisDigest = circleGenesisDigest(genesis);
  assert.deepEqual(openCircleSealedContent({ record: before, genesisDigest, principalId: 'bob', privateKey: disclosure.bob.privateKey }), { note: 'budget draft' });
  assert.deepEqual(openCircleSealedContent({ record: after, genesisDigest, principalId: 'bob', privateKey: bobSecondKey.privateKey }), { note: 'budget draft' });
});

test('publishers, roles and records outside the rules are refused', () => {
  const genesis = genesisFor();
  const base = circleScript(genesis);
  const at = '2026-08-20T13:30:00.000Z';
  const replica = replicaFrom(genesis, logsFor(genesis, base));

  // carol is a member without a disclosure key: she cannot publish.
  assert.throws(() => replica.disclosureRecipients({ publisher: 'carol', roleIds: ['member'], at }), /carol has no disclosure key/);
  // mallory is no member.
  assert.throws(() => replica.disclosureRecipients({ publisher: 'mallory', roleIds: ['member'], at }), /mallory was not a member/);
  assert.throws(() => replica.disclosureRecipients({ publisher: 'alice', roleIds: ['treasurer'], at }), /does not define: treasurer/);
  // Before her key, alice cannot publish either.
  assert.throws(() => replica.disclosureRecipients({ publisher: 'alice', roleIds: ['member'], at: '2026-08-20T12:15:00.000Z' }), /alice has no disclosure key/);

  // A record naming someone else, or sealed for another Circle, is refused on receipt.
  const other = genesisFor('circle.other');
  const foreign = sealCircleContent({
    genesisDigest: circleGenesisDigest(other),
    publishedBy: 'alice',
    publishedAt: at,
    audienceRoles: ['member'],
    recipients: [recipientOf('alice'), recipientOf('bob')],
    value: 1
  });
  const logs = logsFor(genesis, [...base, ['alice', 'sealed_content', foreign]]);
  const fresh = new CircleReplica({ genesis });
  for (const update of Object.values(logs).flat()) {
    if (update !== logs.alice.at(-1)) fresh.receive(update);
  }
  const result = fresh.receive(logs.alice.at(-1));
  assert.equal(result.status, 'rejected');
  assert.equal(result.code, 'malformed');
  const impostor = logsFor(genesis, [['bob', 'disclosure_key', keyRecord('alice')]]).bob[0];
  const withBob = replicaFrom(genesis, logsFor(genesis, base));
  assert.equal(withBob.receive(impostor).code, 'authorship');
  const badKey = logsFor(genesis, [['bob', 'disclosure_key', { ...keyRecord('bob'), key_id: 'f'.repeat(64) }]]).bob[0];
  assert.equal(replicaFrom(genesis, logsFor(genesis, base)).receive(badKey).code, 'malformed');
});
