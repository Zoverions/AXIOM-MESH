import { KeyObject, createPublicKey, sign } from 'node:crypto';
import { canonicalJson, digestObject, sha256, ValidationError } from './canonical.mjs';
import { verifyObjectSignature } from './identity.mjs';
import {
  CIRCLE_CORE_PACKAGE_SCHEMA,
  CIRCLE_DECISION_SCHEMA,
  circleStanding,
  validateCircleCorePackage
} from './circle-core.mjs';
import { tallyCircleProposal, verifyCircleDecision } from './circle-ballots.mjs';

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
 * Member keys come from a caller-supplied roster; the contract verifies
 * signatures but does not establish who holds a key. Nothing here grants
 * authority, executes an effect, opens a network connection, or changes
 * the Grid's causal sync.
 */

export const CIRCLE_GENESIS_SCHEMA = 'axiom-circle-genesis.v0';
export const CIRCLE_UPDATE_SCHEMA = 'axiom-circle-update.v0';
export const CIRCLE_HEADS_SCHEMA = 'axiom-circle-heads.v0';
export const CIRCLE_VIEW_SCHEMA = 'axiom-circle-view.v0';

const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/;
const DIGEST = /^[a-f0-9]{64}$/;
const MAX_UPDATES = 4096;

const RECORD_TYPES = Object.freeze({
  invitation: { collection: 'invitations', author: r => r.issued_by, time: r => r.issued_at },
  membership: { collection: 'memberships', author: r => r.principal_id, time: r => r.accepted_at },
  proposal: { collection: 'proposals', author: r => r.proposer, time: r => r.created_at },
  task: { collection: 'tasks', author: null, time: r => r.created_at },
  appeal: { collection: 'appeals', author: r => r.filed_by, time: r => r.filed_at },
  exit: { collection: 'exits', author: r => r.initiated_by, time: r => r.effective_at },
  export: { collection: 'exports', author: r => r.exported_by, time: r => r.exported_at },
  ballot: { collection: null, author: r => r?.body?.principal_id, time: r => r?.body?.cast_at }
});

export function createCircleGenesis({ circle, charter }) {
  const genesis = Object.freeze({ schema: CIRCLE_GENESIS_SCHEMA, circle, charter });
  validateCircleCorePackage(emptyPackage(genesis));
  return genesis;
}

export function circleGenesisDigest(genesis) {
  return digestObject(genesis);
}

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
  constructor({ genesis, roster }) {
    if (genesis?.schema !== CIRCLE_GENESIS_SCHEMA) {
      throw new ValidationError('Circle replica requires an axiom-circle-genesis.v0 record');
    }
    validateCircleCorePackage(emptyPackage(genesis));
    this.genesis = genesis;
    this.genesisDigest = circleGenesisDigest(genesis);
    this.roster = normalizeRoster(roster);
    this.logs = new Map();
    this.digests = new Set();
    this.equivocations = new Map();
    this.size = 0;
  }

  /**
   * Accepts one signed update or explains why not. Updates from one author
   * must arrive in counter order; updates from different authors may
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
    const key = this.roster.get(body.author);
    if (!key) return rejected('unknown_author', `No key is known for ${body.author}`);
    if (!verifyObjectSignature(body, update.attestation, key)) {
      return rejected('signature', `Signature from ${body.author} is invalid`);
    }
    const kind = RECORD_TYPES[body.record_type];
    if (kind.author && kind.author(body.record) !== body.author) {
      return rejected('authorship', `${body.author} cannot publish a ${body.record_type} naming someone else`);
    }

    const log = this.logs.get(body.author) ?? [];
    const existing = log[body.counter - 1];
    if (existing) {
      const recorded = this.equivocations.get(body.author);
      if (!recorded || body.counter < recorded.counter) {
        this.equivocations.set(body.author, {
          author: body.author,
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
    this.logs.set(body.author, log);
    this.digests.add(digest);
    this.size += 1;
    return { status: 'accepted', digest };
  }

  /** Each author's latest accepted update, for comparing replicas. */
  heads() {
    return Object.freeze({
      schema: CIRCLE_HEADS_SCHEMA,
      genesis_digest: this.genesisDigest,
      heads: Object.freeze([...this.logs.entries()]
        .map(([author, log]) => Object.freeze({
          author,
          counter: log.length,
          digest: log[log.length - 1].digest
        }))
        .sort((left, right) => (left.author < right.author ? -1 : 1))),
      equivocations: Object.freeze([...this.equivocations.values()]
        .sort((left, right) => (left.author < right.author ? -1 : 1)))
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
    for (const [author, log] of this.logs) {
      const equivocation = this.equivocations.get(author);
      for (const item of log) {
        if (equivocation && item.body.counter >= equivocation.counter) continue;
        const kind = RECORD_TYPES[item.body.record_type];
        const time = kind.time(item.body.record);
        if (new Date(time) > cutoff) continue;
        entries.push({ digest: item.digest, author, type: item.body.record_type, record: item.body.record, time });
      }
    }
    entries.sort((left, right) => (
      left.time < right.time ? -1 : left.time > right.time ? 1
        : left.digest < right.digest ? -1 : left.digest > right.digest ? 1 : 0
    ));

    let document = emptyPackage(this.genesis);
    const excluded = [];
    const ballots = [];
    for (const entry of entries) {
      if (entry.type === 'ballot') {
        ballots.push(entry.record);
        continue;
      }
      try {
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

    const voterKeys = Object.fromEntries(this.roster);
    const tallies = [];
    for (const proposal of [...document.proposals].sort((a, b) => (a.proposal_id < b.proposal_id ? -1 : 1))) {
      if (new Date(proposal.closes_at) > cutoff) continue;
      const ballotsForProposal = ballots.filter(item => item.body.proposal_id === proposal.proposal_id);
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
      excluded: Object.freeze(excluded),
      authority_effect: 'none',
      network_effect: 'none'
    });
  }
}

function authorize(document, entry) {
  const standing = circleStanding(document);
  const at = new Date(entry.time);
  const record = entry.record;
  const administers = principal => {
    if (principal === document.circle.created_by) return true;
    const membership = standing.principalMembershipAt(principal, at);
    if (!membership) return false;
    const approveRoles = new Set(
      document.charter.roles.filter(role => role.declared_modes.includes('approve')).map(role => role.role_id)
    );
    return membership.role_ids.some(role => approveRoles.has(role));
  };
  if (entry.type === 'invitation' && !administers(record.issued_by)) {
    throw new ValidationError(`${record.issued_by} may not issue invitations`);
  }
  if (entry.type === 'exit' && record.kind === 'revocation' && !administers(record.initiated_by)) {
    throw new ValidationError(`${record.initiated_by} may not revoke memberships`);
  }
  if ((entry.type === 'task' || entry.type === 'export') && !standing.principalAt(entry.author, at)) {
    throw new ValidationError(`${entry.author} was not a member when publishing this ${entry.type}`);
  }
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
    'counter',
    'prev_digest',
    'record_type',
    'record'
  ]);
  if (
    body.schema !== CIRCLE_UPDATE_SCHEMA
    || !DIGEST.test(body.genesis_digest ?? '')
    || !IDENTIFIER.test(body.author ?? '')
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

function normalizeRoster(roster) {
  if (roster === null || typeof roster !== 'object' || Array.isArray(roster)) {
    throw new ValidationError('Circle roster must map principals to Ed25519 public keys');
  }
  const keys = new Map();
  for (const [principal, value] of Object.entries(roster)) {
    if (!IDENTIFIER.test(principal)) throw new ValidationError('Circle roster principal is invalid');
    let publicKey;
    try {
      publicKey = value instanceof KeyObject && value.type === 'public' ? value : createPublicKey(value);
    } catch {
      throw new ValidationError(`Roster key for ${principal} is invalid`);
    }
    if (publicKey.asymmetricKeyType !== 'ed25519') {
      throw new ValidationError(`Roster key for ${principal} must be Ed25519`);
    }
    keys.set(principal, publicKey);
  }
  return keys;
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
