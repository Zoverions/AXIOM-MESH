import { sign } from 'node:crypto';
import { canonicalJson, digestObject, sha256, ValidationError } from './canonical.mjs';
import { verifyObjectSignature } from './identity.mjs';
import {
  CIRCLE_CORE_PACKAGE_SCHEMA,
  CIRCLE_DECISION_SCHEMA,
  circleStanding,
  validateCircleCorePackage
} from './circle-core.mjs';
import { circleBallotReceipt, tallyCircleProposal, verifyCircleDecision } from './circle-ballots.mjs';
import {
  circleCreatorKey,
  circleKeyId,
  validateCircleCreatorKey,
  validateCircleKeyRecord
} from './circle-keys.mjs';

/**
 * Circle exchange between members' own nodes. Inert contract laboratory.
 *
 * Offline and online causal sync move updates between the nodes of one
 * owner. A Circle has many owners: each member's node writes only that
 * member's records. This module defines how those records travel and how
 * every replica derives the same Circle from them, without a coordinator:
 *
 * - Genesis: the creator fixes the Circle descriptor and charter. Every
 *   update binds the genesis digest, so it cannot be replayed into another
 *   Circle or charter.
 * - Per-author logs: each update is signed by its author, carries a
 *   contiguous counter and the digest of the author's previous update. A
 *   relay can reorder authors but cannot drop, insert or reorder updates
 *   within an author's log without being detected; heads() gives each
 *   author's latest (counter, digest) for comparison between replicas.
 * - Authorship: a record may only be published by the principal it names
 *   (the proposer, the voter, the appellant, the invitee accepting, ...).
 * - Equivocation: two different updates at one author's counter are kept as
 *   evidence, and that author's updates from that counter on are excluded
 *   from the view on every replica that has seen both.
 * - View: records are applied in (record time, update digest) order and a
 *   record is kept only if the Circle stays valid, so the result depends on
 *   the set of accepted updates, never on arrival order. Decisions are not
 *   exchanged: each replica derives them from the ballots once a proposal
 *   closes.
 *
 * Authority rules this contract adds, chosen conservatively and open to
 * revision: invitations and revocations may come only from the Circle's
 * creator or a member holding a role that declares 'approve'; tasks and
 * exports only from members in standing.
 *
 * Keys are established by the Circle itself (circle-keys.mjs): the genesis
 * carries the creator's key, administrators endorse members' keys, members
 * rotate their own, and a revocation voids a key's updates beyond a named
 * counter. Each key has its own hash-linked log, so a revoked key's forks
 * never block its holder's replacement key. An update whose key has not yet
 * been seen is held as pending (bounded) until the endorsement or rotation
 * that introduces it arrives, so delivery order does not matter.
 *
 * Whether a key was validly established, rotated or revoked depends on the
 * Circle's standing, and standing depends on which updates are valid. The
 * view resolves this by iterating to a fixed point of the revocations it
 * accepts. If there is none (two administrators revoking each other's keys
 * back to before either revocation), every revocation seen is applied and
 * the view reports key_revocation_conflict for people to resolve.
 *
 * Nothing here grants authority, executes an effect, opens a network
 * connection, or changes the Grid's causal sync.
 */

export const CIRCLE_GENESIS_SCHEMA = 'axiom-circle-genesis.v0';
export const CIRCLE_UPDATE_SCHEMA = 'axiom-circle-update.v0';
export const CIRCLE_HEADS_SCHEMA = 'axiom-circle-heads.v0';
export const CIRCLE_VIEW_SCHEMA = 'axiom-circle-view.v0';

const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/;
const DIGEST = /^[a-f0-9]{64}$/;
const MAX_UPDATES = 4096;
const MAX_PENDING = 1024;
const MAX_REVOCATION_ROUNDS = 16;
const KEY_RECORD_TYPES = new Set(['key_endorsement', 'key_rotation', 'key_revocation']);

const RECORD_TYPES = Object.freeze({
  invitation: { collection: 'invitations', author: r => r.issued_by, time: r => r.issued_at },
  membership: { collection: 'memberships', author: r => r.principal_id, time: r => r.accepted_at },
  proposal: { collection: 'proposals', author: r => r.proposer, time: r => r.created_at },
  task: { collection: 'tasks', author: null, time: r => r.created_at },
  appeal: { collection: 'appeals', author: r => r.filed_by, time: r => r.filed_at },
  exit: { collection: 'exits', author: r => r.initiated_by, time: r => r.effective_at },
  export: { collection: 'exports', author: r => r.exported_by, time: r => r.exported_at },
  ballot: { collection: null, author: r => r?.body?.principal_id, time: r => r?.body?.cast_at },
  key_endorsement: { collection: null, author: r => r.endorsed_by, time: r => r.endorsed_at },
  key_rotation: { collection: null, author: r => r.principal_id, time: r => r.rotated_at },
  key_revocation: { collection: null, author: r => r.revoked_by, time: r => r.revoked_at }
});

export function createCircleGenesis({ circle, charter, creatorKey }) {
  const genesis = Object.freeze({
    schema: CIRCLE_GENESIS_SCHEMA,
    circle,
    charter,
    creator_key: circleCreatorKey(creatorKey)
  });
  validateGenesis(genesis);
  return genesis;
}

export function circleGenesisDigest(genesis) {
  return digestObject(genesis);
}

/**
 * Signs one update. `counter` and `previous` belong to the log of the key
 * that signs it: each key an author holds starts its own log at 1.
 */
export function createCircleUpdate({
  genesis,
  author,
  counter,
  previous,
  recordType,
  record,
  privateKey
}) {
  const body = Object.freeze({
    schema: CIRCLE_UPDATE_SCHEMA,
    genesis_digest: circleGenesisDigest(genesis),
    author,
    key_id: circleKeyId(privateKey),
    counter,
    prev_digest: previous ? circleUpdateDigest(previous) : null,
    record_type: recordType,
    record
  });
  validateUpdateBody(body);
  const canonical = canonicalJson(body);
  return Object.freeze({
    body,
    attestation: Object.freeze({
      algorithm: 'Ed25519',
      digest: sha256(canonical),
      signature: sign(null, Buffer.from(canonical), privateKey).toString('base64url')
    })
  });
}

export function circleUpdateDigest(update) {
  return digestObject(update.body);
}

export class CircleReplica {
  constructor({ genesis }) {
    validateGenesis(genesis);
    this.genesis = genesis;
    this.genesisDigest = circleGenesisDigest(genesis);
    // Keys announced for (principal, key id) by accepted updates, and the
    // root. Announcement only lets an update's signature be checked; whether
    // the key was validly established is decided by the view.
    this.announced = new Map([[
      pairKey(genesis.circle.created_by, genesis.creator_key.key_id),
      validateCircleCreatorKey(genesis.creator_key)
    ]]);
    this.logs = new Map();
    this.digests = new Set();
    this.equivocations = new Map();
    this.pending = new Map();
    this.pendingCount = 0;
    this.size = 0;
  }

  /**
   * Accepts one signed update, holds it until its key is known, or explains
   * why not. Updates in one key's log must arrive in counter order; logs may
   * interleave freely.
   */
  receive(update) {
    let body;
    try {
      exactObject(update, 'Circle update', ['body', 'attestation']);
      body = validateUpdateBody(update.body);
    } catch (error) {
      return rejected('malformed', error.message);
    }
    const digest = digestObject(body);
    if (this.digests.has(digest)) return { status: 'duplicate', digest };
    if (body.genesis_digest !== this.genesisDigest) {
      return rejected('wrong_genesis', 'Update belongs to a different Circle or charter');
    }
    const pair = pairKey(body.author, body.key_id);
    const key = this.announced.get(pair);
    if (!key) return this.hold(pair, update, digest, body);
    if (!verifySignature(body, update.attestation, key)) {
      return rejected('signature', `Signature from ${body.author} is invalid`);
    }
    const kind = RECORD_TYPES[body.record_type];
    if (kind.author && kind.author(body.record) !== body.author) {
      return rejected('authorship', `${body.author} cannot publish a ${body.record_type} naming someone else`);
    }
    let introduced = null;
    if (KEY_RECORD_TYPES.has(body.record_type)) {
      try {
        introduced = validateCircleKeyRecord(body.record_type, body.record, {
          genesisDigest: this.genesisDigest,
          circleId: this.genesis.circle.circle_id
        });
      } catch (error) {
        if (!(error instanceof ValidationError)) throw error;
        return rejected('key_record', error.message);
      }
      if (body.record_type === 'key_rotation' && body.record.previous_key_id !== body.key_id) {
        return rejected('key_record', 'A key rotation must be signed by the key it replaces');
      }
    }

    const log = this.logs.get(pair) ?? [];
    const existing = log[body.counter - 1];
    if (existing) {
      const recorded = this.equivocations.get(pair);
      if (!recorded || body.counter < recorded.counter) {
        this.equivocations.set(pair, {
          author: body.author,
          key_id: body.key_id,
          counter: body.counter,
          digests: [existing.digest, digest].sort()
        });
      }
      return { status: 'equivocation', digest, author: body.author, counter: body.counter };
    }
    if (body.counter !== log.length + 1) {
      return rejected('sequence_gap', `Expected update ${log.length + 1} from ${body.author}`);
    }
    const previousDigest = log.length ? log[log.length - 1].digest : null;
    if (body.prev_digest !== previousDigest) {
      return rejected('chain', `Update from ${body.author} does not follow its previous update`);
    }
    if (this.size >= MAX_UPDATES) return rejected('capacity', 'Circle replica is full');

    log.push({ digest, body, update });
    this.logs.set(pair, log);
    this.digests.add(digest);
    this.size += 1;
    if (introduced) this.announce(pairKey(body.record.principal_id, body.record.key_id), introduced);
    return { status: 'accepted', digest };
  }

  /** Updates held because their key has not been seen yet. */
  pendingUpdates() {
    return this.pendingCount;
  }

  hold(pair, update, digest, body) {
    const held = this.pending.get(pair) ?? new Map();
    if (held.has(digest)) return { status: 'pending', digest };
    if (this.pendingCount >= MAX_PENDING) {
      return rejected('unknown_key', `No key ${body.key_id.slice(0, 12)} is known for ${body.author}`);
    }
    held.set(digest, update);
    this.pending.set(pair, held);
    this.pendingCount += 1;
    return { status: 'pending', digest };
  }

  announce(pair, publicKey) {
    if (!this.announced.has(pair)) this.announced.set(pair, publicKey);
    const held = this.pending.get(pair);
    if (!held) return;
    this.pending.delete(pair);
    this.pendingCount -= held.size;
    const ordered = [...held.values()].sort((left, right) => left.body.counter - right.body.counter);
    for (const update of ordered) this.receive(update);
  }

  /** Each key log's latest accepted update, for comparing replicas. */
  heads() {
    return Object.freeze({
      schema: CIRCLE_HEADS_SCHEMA,
      genesis_digest: this.genesisDigest,
      heads: Object.freeze([...this.logs.values()]
        .map(log => Object.freeze({
          author: log[0].body.author,
          key_id: log[0].body.key_id,
          counter: log.length,
          digest: log[log.length - 1].digest
        }))
        .sort(compareHeads)),
      equivocations: Object.freeze([...this.equivocations.values()].sort(compareHeads))
    });
  }

  /**
   * Derives the Circle as of `asOf`. The result is a function of the set of
   * accepted updates and equivocation evidence only.
   */
  view({ asOf }) {
    const cutoff = new Date(asOf);
    if (Number.isNaN(cutoff.valueOf())) throw new ValidationError('Circle view asOf is invalid');

    const entries = [];
    const rotationCuts = new Map();
    for (const [pair, log] of this.logs) {
      const equivocation = this.equivocations.get(pair);
      for (const item of log) {
        if (equivocation && item.body.counter >= equivocation.counter) continue;
        const kind = RECORD_TYPES[item.body.record_type];
        const time = kind.time(item.body.record);
        if (new Date(time) > cutoff) continue;
        if (item.body.record_type === 'key_rotation' && !rotationCuts.has(pair)) {
          // A key signs nothing after its own rotation.
          rotationCuts.set(pair, item.body.counter);
        }
        entries.push({
          digest: item.digest,
          pair,
          author: item.body.author,
          keyId: item.body.key_id,
          counter: item.body.counter,
          type: item.body.record_type,
          record: item.body.record,
          time,
          // Key records apply before other records stamped at the same time.
          rank: KEY_RECORD_TYPES.has(item.body.record_type) ? 0 : 1
        });
      }
    }
    entries.sort((left, right) => (
      left.time < right.time ? -1 : left.time > right.time ? 1
        : left.rank - right.rank
          || (left.digest < right.digest ? -1 : left.digest > right.digest ? 1 : 0)
    ));

    // Revocations void updates by counter, retroactively, and whether a
    // revocation is authorized depends on the updates that remain. Iterate
    // to a fixed point; without one, apply every revocation seen.
    let voids = new Map();
    const tried = [voids];
    let derived;
    let conflict = false;
    for (let round = 0; ; round += 1) {
      derived = this.derive(entries, voids, rotationCuts, cutoff);
      const next = voidsFrom(derived.revocations);
      if (sameVoids(next, voids)) break;
      if (tried.some(previous => sameVoids(previous, next)) || round >= MAX_REVOCATION_ROUNDS) {
        conflict = true;
        voids = unionVoids([...tried, next]);
        derived = this.derive(entries, voids, rotationCuts, cutoff);
        break;
      }
      tried.push(next);
      voids = next;
    }

    const { document, excluded, ballots, keys } = derived;
    const tallies = [];
    for (const proposal of [...document.proposals].sort((a, b) => (a.proposal_id < b.proposal_id ? -1 : 1))) {
      if (new Date(proposal.closes_at) > cutoff) continue;
      const forProposal = ballots
        .filter(item => item.ballot.body.proposal_id === proposal.proposal_id)
        .sort((left, right) => (left.order < right.order ? -1 : left.order > right.order ? 1 : 0));
      // Each voter's ballot is checked against the key that signed the
      // update carrying it; for duplicates, the one the tally sees first.
      const voterKeys = {};
      for (const item of forProposal) {
        voterKeys[item.ballot.body.principal_id] ??= item.publicKey;
      }
      const ballotsForProposal = forProposal.map(item => item.ballot);
      const tally = tallyCircleProposal({
        document,
        proposalId: proposal.proposal_id,
        ballots: ballotsForProposal,
        voterKeys,
        decidedAt: proposal.closes_at
      });
      document.decisions.push({
        schema: CIRCLE_DECISION_SCHEMA,
        decision_id: `decision:${proposal.proposal_id}`,
        circle_id: document.circle.circle_id,
        proposal_id: proposal.proposal_id,
        charter_digest: digestObject(document.charter),
        outcome: tally.outcome,
        decided_at: proposal.closes_at,
        participant_receipts: [...tally.receipts],
        finality: 'circle-local-accepted',
        runtime_authority: false,
        authority_effect: 'none'
      });
      // Self-check: the derived decision must verify strictly against the
      // ballots it counted.
      const counted = new Set(tally.receipts);
      verifyCircleDecision({
        document,
        decisionId: `decision:${proposal.proposal_id}`,
        ballots: ballotsForProposal.filter(item => counted.has(digestObject(item.body))),
        voterKeys
      });
      tallies.push(tally);
    }
    const result = validateCircleCorePackage(document);

    return Object.freeze({
      schema: CIRCLE_VIEW_SCHEMA,
      genesis_digest: this.genesisDigest,
      as_of: cutoff.toISOString(),
      package: document,
      package_digest: result.package_digest,
      tallies: Object.freeze(tallies),
      keys: Object.freeze(keys),
      key_revocation_conflict: conflict,
      excluded: Object.freeze(excluded),
      authority_effect: 'none',
      network_effect: 'none'
    });
  }

  derive(entries, voids, rotationCuts) {
    const creator = this.genesis.circle.created_by;
    const keys = new Map([[this.genesis.creator_key.key_id, {
      principal: creator,
      publicKey: this.announced.get(pairKey(creator, this.genesis.creator_key.key_id)),
      since: this.genesis.circle.created_at,
      status: 'active'
    }]]);
    const active = new Map([[creator, this.genesis.creator_key.key_id]]);
    let document = emptyPackage(this.genesis);
    const excluded = [];
    const ballots = [];
    const revocations = [];
    for (const entry of entries) {
      try {
        const key = signingKey(entry, keys, voids, rotationCuts);
        if (entry.type === 'ballot') {
          ballots.push({
            ballot: entry.record,
            publicKey: key.publicKey,
            order: `${entry.record?.body?.cast_at ?? ''}\u0000${safeReceipt(entry.record)}`
          });
          continue;
        }
        if (KEY_RECORD_TYPES.has(entry.type)) {
          applyKeyRecord(document, entry, { keys, active, revocations, announced: this.announced });
          continue;
        }
        authorize(document, entry);
        const candidate = structuredClone(document);
        candidate[RECORD_TYPES[entry.type].collection].push(entry.record);
        validateCircleCorePackage(candidate);
        document = candidate;
      } catch (error) {
        if (!(error instanceof ValidationError)) throw error;
        excluded.push({ digest: entry.digest, reason: error.message });
      }
    }
    return {
      document,
      excluded,
      ballots,
      revocations,
      keys: [...keys.entries()]
        .map(([keyId, key]) => Object.freeze({
          principal_id: key.principal,
          key_id: keyId,
          established_at: key.since,
          status: key.status
        }))
        .sort((left, right) => (
          left.principal_id < right.principal_id ? -1 : left.principal_id > right.principal_id ? 1
            : left.established_at < right.established_at ? -1 : left.established_at > right.established_at ? 1
              : left.key_id < right.key_id ? -1 : 1
        ))
    };
  }
}

// The key an entry was signed with, if it was valid for that entry. Entries
// apply in time order, so a record dated before its key's endorsement or
// rotation finds no established key.
function signingKey(entry, keys, voids, rotationCuts) {
  const key = keys.get(entry.keyId);
  if (!key || key.principal !== entry.author) {
    throw new ValidationError(`${entry.author} has no established key ${entry.keyId.slice(0, 12)}`);
  }
  const cut = rotationCuts.get(entry.pair);
  if (cut !== undefined && entry.counter > cut) {
    throw new ValidationError(`${entry.author} signed with a key it had already rotated`);
  }
  const lastValid = voids.get(entry.keyId);
  if (lastValid !== undefined && entry.counter > lastValid) {
    throw new ValidationError(`${entry.author} signed with a key revoked after update ${lastValid}`);
  }
  return key;
}

function applyKeyRecord(document, entry, { keys, active, revocations, announced }) {
  const record = entry.record;
  const at = new Date(entry.time);
  if (entry.type === 'key_endorsement') {
    if (!administers(document, record.endorsed_by, at)) {
      throw new ValidationError(`${record.endorsed_by} may not endorse keys`);
    }
    if (active.has(record.principal_id)) {
      throw new ValidationError(`${record.principal_id} already has a key; it must rotate or be revoked first`);
    }
    if (keys.has(record.key_id)) throw new ValidationError('That key is already bound in this Circle');
    keys.set(record.key_id, {
      principal: record.principal_id,
      publicKey: announced.get(pairKey(record.principal_id, record.key_id)),
      since: entry.time,
      status: 'active'
    });
    active.set(record.principal_id, record.key_id);
    return;
  }
  if (entry.type === 'key_rotation') {
    if (active.get(entry.author) !== entry.keyId) {
      throw new ValidationError(`${entry.author} can rotate only its current key`);
    }
    if (keys.has(record.key_id)) throw new ValidationError('That key is already bound in this Circle');
    keys.get(entry.keyId).status = 'rotated';
    keys.set(record.key_id, {
      principal: entry.author,
      publicKey: announced.get(pairKey(entry.author, record.key_id)),
      since: entry.time,
      status: 'active'
    });
    active.set(entry.author, record.key_id);
    return;
  }
  // key_revocation
  const target = keys.get(record.key_id);
  if (!target || target.principal !== record.principal_id) {
    throw new ValidationError(`${record.principal_id} holds no key ${record.key_id.slice(0, 12)} to revoke`);
  }
  if (record.revoked_by !== record.principal_id && !administers(document, record.revoked_by, at)) {
    throw new ValidationError(`${record.revoked_by} may not revoke ${record.principal_id}'s key`);
  }
  revocations.push({ keyId: record.key_id, lastValidCounter: record.last_valid_counter });
  target.status = 'revoked';
  if (active.get(record.principal_id) === record.key_id) active.delete(record.principal_id);
}

function voidsFrom(revocations) {
  const voids = new Map();
  for (const { keyId, lastValidCounter } of revocations) {
    voids.set(keyId, Math.min(voids.get(keyId) ?? Infinity, lastValidCounter));
  }
  return voids;
}

function unionVoids(all) {
  const voids = new Map();
  for (const map of all) {
    for (const [keyId, lastValid] of map) voids.set(keyId, Math.min(voids.get(keyId) ?? Infinity, lastValid));
  }
  return voids;
}

function sameVoids(left, right) {
  if (left.size !== right.size) return false;
  for (const [keyId, lastValid] of left) if (right.get(keyId) !== lastValid) return false;
  return true;
}

function safeReceipt(ballot) {
  try {
    return circleBallotReceipt(ballot);
  } catch {
    return '';
  }
}

function verifySignature(body, attestation, publicKey) {
  try {
    return verifyObjectSignature(body, attestation, publicKey);
  } catch {
    return false;
  }
}

function pairKey(principal, keyId) {
  return `${principal}\u0000${keyId}`;
}

function compareHeads(left, right) {
  return left.author < right.author ? -1 : left.author > right.author ? 1
    : left.key_id < right.key_id ? -1 : left.key_id > right.key_id ? 1 : 0;
}

function administers(document, principal, at) {
  if (principal === document.circle.created_by) return true;
  const membership = circleStanding(document).principalMembershipAt(principal, at);
  if (!membership) return false;
  const approveRoles = new Set(
    document.charter.roles.filter(role => role.declared_modes.includes('approve')).map(role => role.role_id)
  );
  return membership.role_ids.some(role => approveRoles.has(role));
}

function authorize(document, entry) {
  const standing = circleStanding(document);
  const at = new Date(entry.time);
  const record = entry.record;
  if (entry.type === 'invitation' && !administers(document, record.issued_by, at)) {
    throw new ValidationError(`${record.issued_by} may not issue invitations`);
  }
  if (entry.type === 'exit' && record.kind === 'revocation' && !administers(document, record.initiated_by, at)) {
    throw new ValidationError(`${record.initiated_by} may not revoke memberships`);
  }
  if ((entry.type === 'task' || entry.type === 'export') && !standing.principalAt(entry.author, at)) {
    throw new ValidationError(`${entry.author} was not a member when publishing this ${entry.type}`);
  }
}

function validateGenesis(genesis) {
  exactObject(genesis, 'Circle genesis', ['schema', 'circle', 'charter', 'creator_key']);
  if (genesis.schema !== CIRCLE_GENESIS_SCHEMA) {
    throw new ValidationError('Circle replica requires an axiom-circle-genesis.v0 record');
  }
  validateCircleCorePackage(emptyPackage(genesis));
  validateCircleCreatorKey(genesis.creator_key);
}

function emptyPackage(genesis) {
  return {
    schema: CIRCLE_CORE_PACKAGE_SCHEMA,
    version: 0,
    status: 'inert-contract-laboratory',
    circle: structuredClone(genesis.circle),
    charter: structuredClone(genesis.charter),
    invitations: [],
    memberships: [],
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

function validateUpdateBody(body) {
  exactObject(body, 'Circle update body', [
    'schema',
    'genesis_digest',
    'author',
    'key_id',
    'counter',
    'prev_digest',
    'record_type',
    'record'
  ]);
  if (
    body.schema !== CIRCLE_UPDATE_SCHEMA
    || !DIGEST.test(body.genesis_digest ?? '')
    || !IDENTIFIER.test(body.author ?? '')
    || !DIGEST.test(body.key_id ?? '')
    || !Number.isSafeInteger(body.counter)
    || body.counter < 1
    || body.counter > MAX_UPDATES
    || !(body.prev_digest === null ? body.counter === 1 : DIGEST.test(body.prev_digest) && body.counter > 1)
    || !Object.hasOwn(RECORD_TYPES, body.record_type)
    || body.record === null
    || typeof body.record !== 'object'
    || Array.isArray(body.record)
  ) throw new ValidationError('Circle update is invalid');
  const time = RECORD_TYPES[body.record_type].time(body.record);
  if (typeof time !== 'string' || Number.isNaN(Date.parse(time))) {
    throw new ValidationError('Circle update record has no valid time');
  }
  return body;
}

function rejected(code, reason) {
  return { status: 'rejected', code, reason };
}

function exactObject(value, name, fields) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new ValidationError(`${name} must be an object`);
  }
  const keys = Object.keys(value).sort();
  const expected = [...fields].sort();
  if (keys.length !== expected.length || keys.some((key, index) => key !== expected[index])) {
    throw new ValidationError(`${name} fields are invalid`);
  }
}
