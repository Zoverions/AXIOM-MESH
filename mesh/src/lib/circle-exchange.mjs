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
import {
  validateCircleDisclosureKeyRecord,
  validateCircleSealedContentRecord
} from './circle-disclosure.mjs';

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
 * Charter amendment: a proposal binds the text of a new charter version
 * (`circle-charter:<digest>` in its evidence_refs). Once its ballot-derived
 * decision is accepted and not under appeal, any member may publish the
 * text; it must supersede the charter in force and take effect no earlier
 * than it is published. From its effective_from the Circle continues as a
 * new Core package under the new charter (an epoch): each membership in
 * standing is carried over with the roles the new charter still defines,
 * as a derived invitation and membership, and proposals still open under
 * the old charter lapse, since their ballots bind the old charter.
 *
 * Sync between replicas is transport-neutral: one replica sends its heads,
 * the other answers with a bounded bundle of what the first lacks
 * (updatesFor), including the second update of any equivocation it has not
 * recorded and, for a log the two hold different forks of, the update that
 * reveals the fork. The first applies it (receiveBundle), checking every
 * update as if received alone, and the exchange repeats until a bundle is
 * complete and nothing new is learned.
 *
 * Per-record disclosure (circle-disclosure.mjs): members publish X25519
 * disclosure keys, and seal content for an audience named by role. Every
 * replica holds the sealed record; the view keeps it only if its recipients
 * are exactly the audience members in standing with a disclosure key when
 * it is published, plus the publisher.
 *
 * Nothing here grants authority, executes an effect, opens a network
 * connection, or changes the Grid's causal sync. circle-transport.mjs
 * carries this protocol between members' nodes over HTTPS (laboratory, off
 * by default; docs/operations/CIRCLE-EXCHANGE-TRANSPORT.md).
 */

export const CIRCLE_GENESIS_SCHEMA = 'axiom-circle-genesis.v0';
export const CIRCLE_UPDATE_SCHEMA = 'axiom-circle-update.v0';
export const CIRCLE_HEADS_SCHEMA = 'axiom-circle-heads.v0';
export const CIRCLE_VIEW_SCHEMA = 'axiom-circle-view.v0';
export const CIRCLE_EXCHANGE_BUNDLE_SCHEMA = 'axiom-circle-exchange-bundle.v0';
export const CIRCLE_BUNDLE_MAX_UPDATES = 512;
export const CIRCLE_BUNDLE_MAX_BYTES = 900_000;

const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/;
const DIGEST = /^[a-f0-9]{64}$/;
const MAX_UPDATES = 4096;
const MAX_PENDING = 1024;
const MAX_REVOCATION_ROUNDS = 16;
const KEY_RECORD_TYPES = new Set(['key_endorsement', 'key_rotation', 'key_revocation']);
export const CIRCLE_CHARTER_AMENDMENT_SCHEMA = 'axiom-circle-charter-amendment.v0';

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
  key_revocation: { collection: null, author: r => r.revoked_by, time: r => r.revoked_at },
  charter_amendment: { collection: null, author: r => r.published_by, time: r => r.published_at },
  disclosure_key: { collection: null, author: r => r.principal_id, time: r => r.published_at },
  sealed_content: { collection: null, author: r => r.published_by, time: r => r.published_at }
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
    if (body.record_type === 'charter_amendment') {
      try {
        validateAmendmentShape(body.record, this.genesis.circle.circle_id);
      } catch (error) {
        if (!(error instanceof ValidationError)) throw error;
        return rejected('malformed', error.message);
      }
    }
    if (body.record_type === 'disclosure_key' || body.record_type === 'sealed_content') {
      try {
        if (body.record_type === 'disclosure_key') validateCircleDisclosureKeyRecord(body.record);
        else validateCircleSealedContentRecord(body.record, this.genesisDigest);
      } catch (error) {
        if (!(error instanceof ValidationError)) throw error;
        return rejected('malformed', error.message);
      }
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
      if (recorded?.counter === body.counter && recorded.digests.includes(digest)) {
        return { status: 'duplicate', digest };
      }
      if (!recorded || body.counter < recorded.counter) {
        this.equivocations.set(pair, {
          author: body.author,
          key_id: body.key_id,
          counter: body.counter,
          digests: [existing.digest, digest].sort(),
          // Kept so the evidence can be passed on to other replicas.
          conflicting: update
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

  /**
   * Every update this replica holds (accepted, equivocation evidence and
   * pending), in an order that rebuilds the same replica when received
   * again: each key log in counter order, then the evidence, then what is
   * still pending.
   */
  exportUpdates() {
    const updates = [];
    for (const pair of [...this.logs.keys()].sort()) {
      for (const item of this.logs.get(pair)) updates.push(item.update);
    }
    for (const pair of [...this.equivocations.keys()].sort()) {
      updates.push(this.equivocations.get(pair).conflicting);
    }
    for (const pair of [...this.pending.keys()].sort()) {
      const held = [...this.pending.get(pair).values()]
        .sort((left, right) => left.body.counter - right.body.counter);
      updates.push(...held);
    }
    return updates;
  }

  /**
   * The accepted updates of one key log after `counter`, in order, with the
   * time each record claims. Withholding checks use it to find updates a
   * node authored before a moment at which it claimed not to hold them.
   */
  authoredAfter({ author, keyId, counter }) {
    const log = this.logs.get(pairKey(author, keyId)) ?? [];
    return log.slice(counter).map(item => Object.freeze({
      counter: item.body.counter,
      digest: item.digest,
      recorded_at: RECORD_TYPES[item.body.record_type].time(item.body.record),
      update: item.update
    }));
  }

  /**
   * The public key announced for (principal, key id) by an accepted update
   * or the genesis, or null. Announcement only means a signature can be
   * checked; memberKey decides whether the key counts.
   */
  announcedKey(principalId, keyId) {
    return this.announced.get(pairKey(principalId, keyId)) ?? null;
  }

  /**
   * The public key `keyId` names if, in the view as of `asOf`, it is an
   * active key the Circle established (the creator's, or one endorsed or
   * rotated in) and its principal either holds standing at that moment or
   * has never held a membership (endorsed to join, not yet joined: their
   * acceptance is in their own log, which others can only learn from them).
   * A principal whose membership has ended, in any charter period, gets
   * null, as does a revoked or rotated key. A transport uses this to decide
   * who may sync the Circle.
   */
  memberKey({ keyId, asOf }) {
    const view = this.view({ asOf });
    const key = view.keys.find(item => item.key_id === keyId && item.status === 'active');
    if (!key) return null;
    const principal = key.principal_id;
    const inStanding = circleStanding(view.package).principalAt(principal, new Date(view.as_of));
    const everJoined = view.epochs.some(epoch => epoch.package.memberships.some(item => item.principal_id === principal));
    if (!inStanding && everJoined) return null;
    const publicKey = this.announced.get(pairKey(principal, keyId));
    return publicKey
      ? Object.freeze({ principal_id: principal, key_id: keyId, public_key: publicKey, standing: inStanding ? 'member' : 'endorsed' })
      : null;
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
      equivocations: Object.freeze([...this.equivocations.values()]
        .map(({ author, key_id, counter, digests }) => Object.freeze({ author, key_id, counter, digests }))
        .sort(compareHeads))
    });
  }

  /**
   * The updates a replica reporting `remoteHeads` lacks, in one bounded
   * bundle: for each key log, what follows the remote's head (or, where the
   * remote's head is not in this log, this log's update at that counter, so
   * the remote detects the fork), and the second update of every
   * equivocation the remote has not recorded. A bundle holds at most
   * CIRCLE_BUNDLE_MAX_UPDATES updates and about CIRCLE_BUNDLE_MAX_BYTES;
   * `complete` is false when more remain, so the exchange repeats.
   * Transport-neutral: nothing here opens a connection.
   */
  updatesFor(remoteHeads) {
    const remote = validateRemoteHeads(remoteHeads, this.genesisDigest);
    const remoteLogs = new Map(remote.heads.map(head => [pairKey(head.author, head.key_id), head]));
    const remoteEquivocations = new Set(remote.equivocations.map(item => `${pairKey(item.author, item.key_id)}\u0000${item.counter}`));
    const candidates = [];
    for (const pair of [...this.logs.keys()].sort()) {
      const log = this.logs.get(pair);
      const head = remoteLogs.get(pair);
      let from = 0;
      if (head) {
        const ours = log[head.counter - 1];
        if (ours && ours.digest !== head.digest) {
          // The remote holds another fork of this log: send ours at that
          // counter once, so it records the equivocation.
          if (!remote.equivocations.some(item => pairKey(item.author, item.key_id) === pair)) {
            candidates.push(ours.update);
          }
          continue;
        }
        from = head.counter;
      }
      for (const item of log.slice(from)) candidates.push(item.update);
    }
    for (const [pair, equivocation] of [...this.equivocations.entries()].sort(([a], [b]) => (a < b ? -1 : 1))) {
      if (!remoteEquivocations.has(`${pair}\u0000${equivocation.counter}`)) candidates.push(equivocation.conflicting);
    }

    const updates = [];
    let bytes = 0;
    let complete = true;
    for (const update of candidates) {
      const size = Buffer.byteLength(canonicalJson(update));
      if (updates.length >= CIRCLE_BUNDLE_MAX_UPDATES || (updates.length && bytes + size > CIRCLE_BUNDLE_MAX_BYTES)) {
        complete = false;
        break;
      }
      updates.push(update);
      bytes += size;
    }
    return Object.freeze({
      schema: CIRCLE_EXCHANGE_BUNDLE_SCHEMA,
      genesis_digest: this.genesisDigest,
      updates: Object.freeze(updates),
      complete
    });
  }

  /**
   * The recipients sealed content must name if `publisher` publishes it at
   * `at` for `roleIds`, with their disclosure keys: exactly what every
   * replica will check (circle-disclosure.mjs seals for them).
   */
  disclosureRecipients({ publisher, roleIds, at }) {
    const view = this.view({ asOf: at });
    const keys = new Map(view.disclosure_keys.map(key => [key.principal_id, [key]]));
    return circleDisclosureAudience(view.package, keys, { publisher, roleIds, at });
  }

  /** Applies a bundle from another replica; every update is checked as if received alone. */
  receiveBundle(bundle) {
    exactObject(bundle, 'Circle exchange bundle', ['schema', 'genesis_digest', 'updates', 'complete']);
    if (
      bundle.schema !== CIRCLE_EXCHANGE_BUNDLE_SCHEMA
      || !Array.isArray(bundle.updates)
      || bundle.updates.length > CIRCLE_BUNDLE_MAX_UPDATES
      || typeof bundle.complete !== 'boolean'
    ) throw new ValidationError('Circle exchange bundle is invalid');
    if (bundle.genesis_digest !== this.genesisDigest) {
      throw new ValidationError('Circle exchange bundle belongs to a different Circle or charter');
    }
    const summary = { accepted: 0, duplicate: 0, pending: 0, equivocation: 0, rejected: [] };
    for (const update of bundle.updates) {
      const result = this.receive(update);
      if (result.status === 'rejected') summary.rejected.push({ code: result.code, reason: result.reason });
      else summary[result.status] += 1;
    }
    return Object.freeze({ ...summary, rejected: Object.freeze(summary.rejected), complete: bundle.complete });
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
          rank: KEY_RECORD_TYPES.has(item.body.record_type) || item.body.record_type === 'disclosure_key' ? 0 : 1
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

    const { epochs, excluded, keys, tallies, pending, disclosureKeys, sealed } = derived;
    const current = epochs.at(-1);
    return Object.freeze({
      schema: CIRCLE_VIEW_SCHEMA,
      genesis_digest: this.genesisDigest,
      as_of: cutoff.toISOString(),
      // The Circle under the charter in force at asOf.
      package: current.package,
      package_digest: current.package_digest,
      // Every charter period so far, oldest first.
      epochs: Object.freeze(epochs),
      pending_amendment: pending,
      tallies: Object.freeze(tallies),
      keys: Object.freeze(keys),
      key_revocation_conflict: conflict,
      // Each member's disclosure key in force at asOf, and every sealed
      // record kept, with its recipients (the content stays sealed).
      disclosure_keys: Object.freeze([...disclosureKeys.entries()]
        .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
        .map(([principalId, list]) => Object.freeze({ principal_id: principalId, ...list.at(-1) }))),
      sealed_contents: Object.freeze(sealed),
      excluded: Object.freeze(excluded),
      authority_effect: 'none',
      network_effect: 'none'
    });
  }

  derive(entries, voids, rotationCuts, cutoff) {
    const creator = this.genesis.circle.created_by;
    const keys = new Map([[this.genesis.creator_key.key_id, {
      principal: creator,
      publicKey: this.announced.get(pairKey(creator, this.genesis.creator_key.key_id)),
      since: this.genesis.circle.created_at,
      status: 'active'
    }]]);
    const active = new Map([[creator, this.genesis.creator_key.key_id]]);
    const excluded = [];
    const revocations = [];
    const tallies = [];
    const epochs = [];
    const disclosureKeys = new Map();
    const sealed = [];
    let epoch = newEpoch({ document: emptyPackage(this.genesis) }, this.genesis.circle.created_at);

    // Brings the Circle forward to `at`: decides proposals as they close, and
    // opens the next charter period when an adopted amendment takes effect.
    const advance = at => {
      for (;;) {
        const boundary = epoch.pending && epoch.pending.charter.effective_from <= at
          ? epoch.pending.charter.effective_from
          : null;
        closeDue(epoch, boundary ?? at, tallies);
        if (!boundary) return;
        epochs.push(finishEpoch(epoch, boundary));
        epoch = newEpoch(carryOver(this.genesis.circle, epoch, boundary), boundary);
      }
    };

    for (const entry of entries) {
      advance(entry.time);
      try {
        const key = signingKey(entry, keys, voids, rotationCuts);
        if (entry.type === 'ballot') {
          epoch.ballots.push({
            ballot: entry.record,
            publicKey: key.publicKey,
            order: `${entry.record?.body?.cast_at ?? ''}\u0000${safeReceipt(entry.record)}`
          });
          continue;
        }
        if (KEY_RECORD_TYPES.has(entry.type)) {
          applyKeyRecord(epoch.document, entry, { keys, active, revocations, announced: this.announced });
          continue;
        }
        if (entry.type === 'charter_amendment') {
          adoptAmendment(this.genesis.circle, epoch, entry);
          continue;
        }
        if (entry.type === 'disclosure_key') {
          if (!circleStanding(epoch.document).principalAt(entry.author, new Date(entry.time))) {
            throw new ValidationError(`${entry.author} was not a member when publishing a disclosure key`);
          }
          const list = disclosureKeys.get(entry.author) ?? [];
          list.push(Object.freeze({
            key_id: entry.record.key_id,
            public_key: entry.record.public_key,
            published_at: entry.record.published_at
          }));
          disclosureKeys.set(entry.author, list);
          continue;
        }
        if (entry.type === 'sealed_content') {
          const expected = circleDisclosureAudience(epoch.document, disclosureKeys, {
            publisher: entry.author,
            roleIds: entry.record.audience.role_ids,
            at: entry.time
          });
          const actual = entry.record.envelope.recipients.map(item => [item.principal_id, item.disclosure_key_id]);
          if (canonicalJson(actual) !== canonicalJson(expected.map(item => [item.principal_id, item.key_id]))) {
            throw new ValidationError('Sealed content recipients are not exactly its audience and publisher');
          }
          sealed.push(Object.freeze({
            digest: entry.digest,
            published_by: entry.author,
            published_at: entry.record.published_at,
            role_ids: Object.freeze([...entry.record.audience.role_ids]),
            recipients: Object.freeze(actual.map(([principalId, keyId]) => Object.freeze({
              principal_id: principalId,
              disclosure_key_id: keyId
            })))
          }));
          continue;
        }
        authorize(epoch.document, entry);
        const candidate = structuredClone(epoch.document);
        candidate[RECORD_TYPES[entry.type].collection].push(entry.record);
        validateCircleCorePackage(candidate);
        epoch.document = candidate;
      } catch (error) {
        if (!(error instanceof ValidationError)) throw error;
        excluded.push({ digest: entry.digest, reason: error.message });
      }
    }
    advance(cutoff.toISOString());
    const pending = epoch.pending
      ? Object.freeze({
        proposal_id: epoch.pending.proposalId,
        charter_digest: digestObject(epoch.pending.charter),
        effective_from: epoch.pending.charter.effective_from
      })
      : null;
    epochs.push(finishEpoch(epoch, null));
    return {
      epochs,
      pending,
      excluded,
      tallies,
      revocations,
      disclosureKeys,
      sealed,
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

function newEpoch({ document, origins = { memberships: new Map(), invitations: new Map() } }, startedAt) {
  return { document, origins, startedAt, ballots: [], decided: new Set(), pending: null };
}

// Derives the decision of every proposal in this charter period that has
// closed by `at`, from the ballots cast before it closed.
function closeDue(epoch, at, tallies) {
  const due = epoch.document.proposals
    .filter(proposal => !epoch.decided.has(proposal.proposal_id) && proposal.closes_at <= at)
    .sort((left, right) => (
      left.closes_at < right.closes_at ? -1 : left.closes_at > right.closes_at ? 1
        : left.proposal_id < right.proposal_id ? -1 : 1
    ));
  for (const proposal of due) {
    epoch.decided.add(proposal.proposal_id);
    const document = epoch.document;
    const forProposal = epoch.ballots
      .filter(item => item.ballot?.body?.proposal_id === proposal.proposal_id)
      .sort((left, right) => (left.order < right.order ? -1 : left.order > right.order ? 1 : 0));
    // Each voter's ballot is checked against the key that signed the update
    // carrying it; for duplicates, the one the tally sees first.
    const voterKeys = {};
    for (const item of forProposal) {
      voterKeys[item.ballot.body.principal_id] ??= item.publicKey;
    }
    const ballots = forProposal.map(item => item.ballot);
    const tally = tallyCircleProposal({
      document,
      proposalId: proposal.proposal_id,
      ballots,
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
      ballots: ballots.filter(item => counted.has(digestObject(item.body))),
      voterKeys
    });
    tallies.push(tally);
  }
}

function finishEpoch(epoch, endedAt) {
  const result = validateCircleCorePackage(epoch.document);
  return Object.freeze({
    charter_digest: result.charter_digest,
    charter_version: epoch.document.charter.version,
    effective_from: epoch.startedAt,
    ended_at: endedAt,
    package: epoch.document,
    package_digest: result.package_digest,
    // Proposals still open when the charter changed: their ballots bind the
    // old charter, so they are never decided.
    lapsed_proposals: Object.freeze(endedAt === null ? [] : epoch.document.proposals
      .filter(proposal => !epoch.decided.has(proposal.proposal_id))
      .map(proposal => proposal.proposal_id)
      .sort())
  });
}

// The first package under a new charter: every membership in standing at
// `at` continues, with the roles the new charter still defines, through a
// derived invitation and membership bound to the new charter.
function carryOver(circle, epoch, at) {
  const previous = epoch.document;
  const charter = epoch.pending.charter;
  const document = emptyPackage({ circle, charter });
  const charterDigest = digestObject(charter);
  const roles = new Set(charter.roles.map(role => role.role_id));
  const standing = circleStanding(previous);
  const moment = new Date(at);
  const expires = new Date(moment.valueOf() + 1_000).toISOString();
  const origins = { memberships: new Map(), invitations: new Map() };
  // A carried record keeps its first identifier with the charter version
  // appended. Identifiers are unique within a period, so on any collision or
  // overflow the previous identifier's digest is used instead.
  const carry = (collection, previousId) => {
    const origin = epoch.origins[collection].get(previousId) ?? previousId;
    let id = `${origin}:v${charter.version}`;
    if (id.length > 160 || origins[collection].has(id)) {
      id = `carried:${sha256(previousId).slice(0, 32)}:v${charter.version}`;
    }
    origins[collection].set(id, origin);
    return id;
  };
  const principals = [...new Set(previous.memberships.map(item => item.principal_id))].sort();
  for (const principal of principals) {
    const membership = standing.principalMembershipAt(principal, moment);
    if (!membership) continue;
    const invitation = previous.invitations.find(item => item.invitation_id === membership.invitation_id);
    const membershipId = carry('memberships', membership.membership_id);
    const invitationId = carry('invitations', membership.invitation_id);
    const roleIds = membership.role_ids.filter(role => roles.has(role));
    document.invitations.push({
      schema: invitation.schema,
      invitation_id: invitationId,
      circle_id: circle.circle_id,
      invited_principal: principal,
      membership_class: invitation.membership_class,
      role_ids: roleIds,
      issued_by: circle.created_by,
      issued_at: at,
      expires_at: expires,
      charter_digest: charterDigest,
      one_use: true,
      authority_effect: 'none'
    });
    document.memberships.push({
      ...membership,
      membership_id: membershipId,
      invitation_id: invitationId,
      role_ids: roleIds,
      accepted_at: at,
      status: 'active',
      status_effective_at: at
    });
  }
  validateCircleCorePackage(document);
  return { document, origins };
}

function adoptAmendment(circle, epoch, entry) {
  const record = entry.record;
  const document = epoch.document;
  const current = document.charter;
  if (epoch.pending) {
    throw new ValidationError('A charter amendment is already adopted and waiting to take effect');
  }
  if (entry.author !== circle.created_by && !circleStanding(document).principalAt(entry.author, new Date(entry.time))) {
    throw new ValidationError(`${entry.author} was not a member when publishing this charter amendment`);
  }
  const next = record.charter;
  if (
    next?.circle_id !== current.circle_id
    || next.version !== current.version + 1
    || next.supersedes_digest !== digestObject(current)
  ) throw new ValidationError('A charter amendment must supersede the charter in force');
  if (next.effective_from < entry.time) {
    throw new ValidationError('A charter amendment cannot take effect before it is published');
  }
  validateCircleCorePackage(emptyPackage({ circle, charter: next }));
  const proposal = document.proposals.find(item => item.proposal_id === record.proposal_id);
  if (!proposal) throw new ValidationError('A charter amendment must name a proposal under the charter in force');
  if (!proposal.evidence_refs.includes(`circle-charter:${digestObject(next)}`)) {
    throw new ValidationError(`Proposal ${proposal.proposal_id} did not bind this charter text`);
  }
  const decision = document.decisions.find(item => item.proposal_id === proposal.proposal_id);
  if (!decision || decision.outcome !== 'accepted') {
    throw new ValidationError(`Proposal ${proposal.proposal_id} was not accepted`);
  }
  if (document.appeals.some(appeal => (
    appeal.target_type === 'decision'
    && appeal.target_id === decision.decision_id
    && (appeal.status === 'open' || appeal.status === 'accepted')
  ))) throw new ValidationError(`The decision on ${proposal.proposal_id} is under appeal`);
  epoch.pending = { charter: structuredClone(next), proposalId: proposal.proposal_id };
}

function validateAmendmentShape(record, circleId) {
  exactObject(record, 'Circle charter amendment', [
    'schema', 'circle_id', 'proposal_id', 'charter', 'published_by', 'published_at', 'authority_effect'
  ]);
  if (
    record.schema !== CIRCLE_CHARTER_AMENDMENT_SCHEMA
    || record.circle_id !== circleId
    || !IDENTIFIER.test(record.proposal_id ?? '')
    || !IDENTIFIER.test(record.published_by ?? '')
    || record.authority_effect !== 'none'
    || record.charter === null
    || typeof record.charter !== 'object'
    || Array.isArray(record.charter)
  ) throw new ValidationError('Circle charter amendment is invalid');
  for (const [name, value] of [['published_at', record.published_at], ['effective_from', record.charter.effective_from]]) {
    const parsed = new Date(value);
    if (typeof value !== 'string' || Number.isNaN(parsed.valueOf()) || parsed.toISOString() !== value) {
      throw new ValidationError(`Circle charter amendment ${name} must be a canonical ISO timestamp`);
    }
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

/**
 * Who sealed content must be sealed for: the members in standing at `at`
 * who hold one of `roleIds` and have a disclosure key published by then,
 * plus the publisher, who must be a member with a disclosure key too.
 * Sorted by principal. Used both to seal and, by every replica, to check.
 */
function circleDisclosureAudience(document, disclosureKeys, { publisher, roleIds, at }) {
  const when = new Date(at);
  const standing = circleStanding(document);
  const defined = new Set(document.charter.roles.map(role => role.role_id));
  const unknown = roleIds.filter(role => !defined.has(role));
  if (unknown.length) throw new ValidationError(`Sealed content names roles the charter does not define: ${unknown.join(', ')}`);
  if (!standing.principalAt(publisher, when)) {
    throw new ValidationError(`${publisher} was not a member when publishing sealed content`);
  }
  // Records apply in time order, and the helper passes the view as of
  // `at`, so the last key known is the one in force.
  const keyAt = principalId => (disclosureKeys.get(principalId) ?? []).at(-1);
  if (!keyAt(publisher)) throw new ValidationError(`${publisher} has no disclosure key`);
  const audience = new Set([publisher]);
  const wanted = new Set(roleIds);
  for (const principalId of new Set(document.memberships.map(item => item.principal_id))) {
    const membership = standing.principalMembershipAt(principalId, when);
    if (membership?.role_ids.some(role => wanted.has(role)) && keyAt(principalId)) audience.add(principalId);
  }
  return [...audience].sort().map(principalId => {
    const key = keyAt(principalId);
    return { principal_id: principalId, key_id: key.key_id, public_key: key.public_key };
  });
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

function validateRemoteHeads(value, genesisDigest) {
  exactObject(value, 'Circle heads', ['schema', 'genesis_digest', 'heads', 'equivocations']);
  if (value.schema !== CIRCLE_HEADS_SCHEMA) throw new ValidationError('Circle heads are invalid');
  if (value.genesis_digest !== genesisDigest) {
    throw new ValidationError('Circle heads belong to a different Circle or charter');
  }
  if (!Array.isArray(value.heads) || value.heads.length > MAX_UPDATES
    || !Array.isArray(value.equivocations) || value.equivocations.length > MAX_UPDATES) {
    throw new ValidationError('Circle heads are invalid');
  }
  for (const head of value.heads) {
    exactObject(head, 'Circle head', ['author', 'key_id', 'counter', 'digest']);
    if (
      !IDENTIFIER.test(head.author ?? '') || !DIGEST.test(head.key_id ?? '') || !DIGEST.test(head.digest ?? '')
      || !Number.isSafeInteger(head.counter) || head.counter < 1 || head.counter > MAX_UPDATES
    ) throw new ValidationError('Circle head is invalid');
  }
  for (const item of value.equivocations) {
    exactObject(item, 'Circle equivocation', ['author', 'key_id', 'counter', 'digests']);
    if (
      !IDENTIFIER.test(item.author ?? '') || !DIGEST.test(item.key_id ?? '')
      || !Number.isSafeInteger(item.counter) || item.counter < 1 || item.counter > MAX_UPDATES
    ) throw new ValidationError('Circle equivocation is invalid');
  }
  return value;
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
