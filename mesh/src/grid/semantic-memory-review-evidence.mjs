import { DatabaseSync, StatementSync } from 'node:sqlite';

import {
  AxiomError,
  ValidationError,
  assertPlainObject,
  assertString,
  canonicalJson,
  digestObject
} from '../lib/canonical.mjs';
import { intentRequestDigest } from '../lib/intent-binding.mjs';
import {
  SEMANTIC_MEMORY_REVIEW_ACTION,
  normalizeSemanticMemoryProvenance,
  verifySemanticMemoryReviewedFromProvenance
} from '../lib/semantic-memory-provenance.mjs';
import {
  SEMANTIC_MEMORY_GRID_EVIDENCE_SCHEMA,
  recordedSemanticMemoryReviewIntent
} from '../lib/semantic-memory-grid-evidence.mjs';
import { GridStore } from './store.mjs';

const ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/;
const DIGEST = /^[a-f0-9]{64}$/;

// ---------------------------------------------------------------------------
// Captured at module load (deny-only hardening). Everything the adapter uses
// to read the Grid is taken now and invoked through the captured Reflect.apply,
// so a later swap of an instance method, of a GridStore.prototype method, of
// DatabaseSync/StatementSync methods or of Function.prototype.call/apply
// cannot change what it reads. Built-ins patched BEFORE this module loads are
// out of scope.
const {
  apply,
  getOwnPropertyDescriptor,
  getPrototypeOf,
  ownKeys
} = Reflect;
const freeze = Object.freeze;
const hasOwn = Object.hasOwn;
const SET_HAS = Set.prototype.has;
const OBJECT_PROTOTYPE = Object.prototype;
const SET_ADD = Set.prototype.add;

// The GridStore class chain (GridStore and every base class), the evidence
// brand classes below and the node:sqlite classes are frozen together with
// their prototypes, so after load no method can be replaced and no class can
// be re-parented (Object.setPrototypeOf(GridStore, ...) throws), which closes
// the "super returns an arbitrary object" route to stamping a private brand.
const STORE_CLASSES = [];
for (let current = GridStore; typeof current === 'function' && current !== Function.prototype; current = getPrototypeOf(current)) {
  STORE_CLASSES.push(current);
}
const GRID_STORE_PROTOTYPE = GridStore.prototype;
const STORE_METHOD_NAMES = new Set();
for (let index = 0; index < STORE_CLASSES.length; index += 1) {
  const prototype = STORE_CLASSES[index].prototype;
  const keys = ownKeys(prototype);
  for (let k = 0; k < keys.length; k += 1) {
    const descriptor = getOwnPropertyDescriptor(prototype, keys[k]);
    if (keys[k] !== 'constructor' && (typeof descriptor.value === 'function' || descriptor.get || descriptor.set)) {
      apply(SET_ADD, STORE_METHOD_NAMES, [keys[k]]);
    }
  }
}
const IS_GRID_STORE = GridStore.isGridStore;
const OPENED_DATABASE = GridStore.openedDatabase;
const REQUIRE_INTENT_EVIDENCE_CHAIN = GRID_STORE_PROTOTYPE.requireIntentEvidenceChain;
const GET_INTENT = GRID_STORE_PROTOTYPE.getIntent;
const DECODE_EVENT_ROW = GRID_STORE_PROTOTYPE.decodeEventRow;
const PREPARE = DatabaseSync.prototype.prepare;
const STATEMENT_ALL = StatementSync.prototype.all;

// Evidence brand. SemanticMemoryGridEvidence stamps a private #digest onto a
// plain evidence object (the base constructor returns that object), so the
// evidence keeps its plain-object shape while only objects minted here carry
// the brand. Neither class is exported or reachable from an evidence object
// (whose prototype is Object.prototype); the mint (mintGridEvidence) and the
// checks (#digest in value) are all in this file.
class EvidenceBase {
  constructor(target) {
    return target;
  }
}
class SemanticMemoryGridEvidence extends EvidenceBase {
  #digest;

  constructor(target, digest) {
    super(target);
    this.#digest = digest;
  }

  static has(value) {
    return value !== null && typeof value === 'object' && #digest in value;
  }

  static digest(value) {
    return value.#digest;
  }
}

for (const frozen of [
  ...STORE_CLASSES,
  EvidenceBase,
  SemanticMemoryGridEvidence,
  DatabaseSync,
  StatementSync
]) {
  freeze(frozen);
  freeze(frozen.prototype);
}
freeze(STORE_METHOD_NAMES);

// The only place evidence is created. The fields are stamped before freezing.
function mintGridEvidence(fields) {
  const evidence = new SemanticMemoryGridEvidence(fields, fields.verified_review_request_digest);
  return freeze(evidence);
}

/**
 * True only for an evidence object returned by
 * verifySemanticMemoryReviewFromGrid (it carries this module's private
 * #digest brand). A copy, a spread, a Proxy, Object.create(evidence), a JSON
 * round-trip or a hand-built object with identical fields is false. It reads
 * nothing from `value`, cannot create evidence and grants nothing by itself.
 */
export function isSemanticMemoryGridEvidence(value) {
  return SemanticMemoryGridEvidence.has(value);
}

/**
 * The verified_review_request_digest of genuine Grid evidence, read from the
 * evidence's private brand, never from its fields. Throws ValidationError for
 * anything isSemanticMemoryGridEvidence rejects. Pass the result as
 * `verified_review_request_digest` to evaluateSemanticMemoryUse or
 * evaluateSemanticMemoryLifecycleUse.
 */
export function semanticMemoryGridEvidenceDigest(evidence) {
  if (!SemanticMemoryGridEvidence.has(evidence)) {
    throw new ValidationError('Semantic memory Grid evidence was not issued by verifySemanticMemoryReviewFromGrid');
  }
  return SemanticMemoryGridEvidence.digest(evidence);
}

// Genuineness comes only from GridStore's private brand (#brand in store),
// never from instanceof, the prototype or the object's shape; a Proxy never
// carries it. Every Grid store class in the repository (including the
// server's AcceptedSocialGridStore) extends GridStore, so its instances carry
// the brand. The remaining checks only detect a branded store that was
// modified so that its own reads would no longer be its own: an own property
// shadowing a method or accessor anywhere on its prototype chain (an instance
// method swap), or a public `db` that is no longer the database it opened.
function shadowsInheritedMember(store, key) {
  if (apply(SET_HAS, STORE_METHOD_NAMES, [key])) return true;
  // Object.prototype is not a store class; pollution there is not a swap.
  for (let prototype = getPrototypeOf(store); prototype !== null && prototype !== OBJECT_PROTOTYPE; prototype = getPrototypeOf(prototype)) {
    if (getOwnPropertyDescriptor(prototype, key) !== undefined) return true;
  }
  return false;
}

function openedGridDatabase(store) {
  if (!apply(IS_GRID_STORE, GridStore, [store])) {
    throw new ValidationError('Semantic memory review verification requires a Grid store');
  }
  const db = apply(OPENED_DATABASE, GridStore, [store]);
  const keys = ownKeys(store);
  for (let index = 0; index < keys.length; index += 1) {
    if (shadowsInheritedMember(store, keys[index])) {
      throw new ValidationError('Semantic memory review verification requires an unmodified Grid store');
    }
  }
  const publicDb = getOwnPropertyDescriptor(store, 'db');
  if (!publicDb || publicDb.value !== db) {
    throw new ValidationError('Semantic memory review verification requires an unmodified Grid store');
  }
  return db;
}

function queryAll(db, sql, parameter) {
  return apply(STATEMENT_ALL, apply(PREPARE, db, [sql]), [parameter]);
}

/**
 * The Grid-verified owner review for a semantic memory record, and the only
 * function that creates verified semantic-memory review evidence. It reads
 * the completed 'memory.semantic.review' intent for the record's exact
 * review_request_digest, its accepted/completed events and the verified
 * evidence chain from `store` itself, then checks those rows against the
 * record (including the record's own pre-review provenance, #1937).
 *
 * `store` must be a constructed GridStore, recognised only by its private
 * brand (instances of the repository's GridStore subclasses carry it too). A
 * store-shaped object, Object.create(GridStore.prototype), a Proxy around a
 * real GridStore and a GridStore whose methods or `db` were shadowed on the
 * instance are rejected with a ValidationError.
 * The Grid is read through GridStore and node:sqlite methods captured when
 * this module loaded, so later method swaps do not change the result. The
 * store's database, identity and protector are the trust root: a file the
 * caller chose is trusted as far as the evidence-chain verification goes.
 *
 * The returned evidence is a frozen plain object carrying a private brand.
 * Its verified_review_request_digest is the sanctioned input for
 * evaluateSemanticMemoryUse and evaluateSemanticMemoryLifecycleUse; consumers
 * that receive evidence objects should read it with
 * semanticMemoryGridEvidenceDigest, which rejects any copy or look-alike. A
 * record's claimed review fields and any retrieval result are never a
 * substitute.
 *
 * Throws when no completed review exists (404), when a matching review did
 * not complete (409), or when the rows do not bind the exact review.
 * See docs/architecture/SEMANTIC-MEMORY-RETRIEVAL-BOUNDARY.md.
 */
export function verifySemanticMemoryReviewFromGrid(store, record) {
  const db = openedGridDatabase(store);
  const normalized = normalizeSemanticMemoryProvenance(record);
  // Own-only (#1918 F-1): unreviewed records omit review_request_digest, so an
  // inherited (polluted) value must not select review evidence.
  const reviewRequestDigest = hasOwn(normalized, 'review_request_digest')
    ? normalized.review_request_digest
    : undefined;
  if (typeof reviewRequestDigest !== 'string') {
    throw new ValidationError('Semantic memory record has no explicit review request');
  }

  const chain = apply(REQUIRE_INTENT_EVIDENCE_CHAIN, store, []);
  const acceptedRows = queryAll(db, `
    SELECT * FROM events
    WHERE kind = 'intent.accepted' AND actor = ?
    ORDER BY seq DESC
  `, normalized.owner);

  let matchingRequestSeen = false;
  for (let index = 0; index < acceptedRows.length; index += 1) {
    const accepted = apply(DECODE_EVENT_ROW, store, [acceptedRows[index]]);
    if (accepted.payload?.request_digest !== reviewRequestDigest) continue;
    matchingRequestSeen = true;
    if (
      accepted.payload?.principal !== normalized.owner
      || accepted.payload?.action !== SEMANTIC_MEMORY_REVIEW_ACTION
    ) {
      throw new ValidationError('Semantic memory review acceptance has invalid principal or action');
    }

    let intent;
    try {
      intent = apply(GET_INTENT, store, [accepted.payload.intent_id]);
    } catch (error) {
      if (error?.code === 'intent_not_found') {
        throw new ValidationError('Semantic memory review acceptance has no materialized intent');
      }
      throw error;
    }
    if (intent.status !== 'completed') continue;

    const eventRows = queryAll(db, `
      SELECT * FROM events
      WHERE subject = ?
        AND kind IN ('intent.accepted', 'intent.completed', 'intent.denied', 'intent.failed')
      ORDER BY seq
    `, intent.intent_id);
    const events = [];
    for (let eventIndex = 0; eventIndex < eventRows.length; eventIndex += 1) {
      events[eventIndex] = apply(DECODE_EVENT_ROW, store, [eventRows[eventIndex]]);
    }

    return verifySemanticMemoryGridEvidence(normalized, intent, events, chain);
  }

  if (matchingRequestSeen) {
    throw new AxiomError(
      'semantic_memory_review_not_completed',
      'A matching semantic memory review request exists but did not complete successfully',
      409
    );
  }
  throw new AxiomError(
    'semantic_memory_review_evidence_not_found',
    'No completed Grid evidence exists for this semantic memory review',
    404
  );
}

// Own data only (#1918): a field that is not an own property of its object,
// such as one inherited from a polluted Object.prototype, reads as absent.
function own(value, key) {
  return value !== null
    && (typeof value === 'object' || typeof value === 'function')
    && hasOwn(value, key)
    ? value[key]
    : undefined;
}

function ownEntry(array, item) {
  return array.some((entry, index) => entry === item && hasOwn(array, index));
}

// Checks that the intent row, events and chain summary read from the store
// bind the record's exact owner review. NOT exported (deny-only hardening):
// rows a caller assembles from the record alone pass these checks, so they are
// Grid evidence only because verifySemanticMemoryReviewFromGrid read them from
// a GridStore. Moved here from mesh/src/lib/semantic-memory-grid-evidence.mjs,
// where it was exported as verifySemanticMemoryGridEvidence(record, { intent,
// events, chain }); the checks are unchanged, the rows are now positional.
// Row fields stay own-only reads (#1918) as defence in depth against a
// corrupted store.
function verifySemanticMemoryGridEvidence(record, intent, events, chain) {
  const normalized = normalizeSemanticMemoryProvenance(record);
  // Throws first for a record without explicit owner review evidence, as
  // before; the record is already normalized, so this is the same check.
  const reviewIntent = recordedSemanticMemoryReviewIntent(normalized);
  // The claimed pre-review digest must be the record's own (#1937).
  verifySemanticMemoryReviewedFromProvenance(normalized);
  const expectedRequestDigest = intentRequestDigest(reviewIntent);
  if (expectedRequestDigest !== own(normalized, 'review_request_digest')) {
    throw new ValidationError('Semantic memory recorded review request digest is invalid');
  }
  if (!chain || own(chain, 'valid') !== true) {
    throw new ValidationError('Semantic memory review requires a valid Grid evidence chain');
  }

  const intentRow = assertPlainObject(intent, 'semantic review intent');
  const intentId = assertString(own(intentRow, 'intent_id'), 'semantic review intent_id', {
    max: 160,
    pattern: ID
  });
  const traceId = assertString(own(intentRow, 'trace_id'), 'semantic review trace_id', {
    max: 160,
    pattern: ID
  });
  if (
    own(intentRow, 'principal') !== normalized.owner
    || own(intentRow, 'action') !== SEMANTIC_MEMORY_REVIEW_ACTION
    || own(intentRow, 'status') !== 'completed'
    || own(intentRow, 'request_digest') !== expectedRequestDigest
    || own(intentRow, 'input_digest') !== digestObject(reviewIntent.input)
  ) {
    throw new ValidationError('Semantic memory materialized intent does not match the exact review');
  }

  if (!Array.isArray(events)) {
    throw new ValidationError('Semantic memory review events must be an array');
  }
  const acceptedEvents = events.filter(event => event?.kind === 'intent.accepted');
  const completedEvents = events.filter(event => event?.kind === 'intent.completed');
  const adverseEvents = events.filter(event =>
    event?.kind === 'intent.denied' || event?.kind === 'intent.failed'
  );
  if (acceptedEvents.length !== 1 || completedEvents.length !== 1) {
    throw new ValidationError('Semantic memory review requires one accepted and one completed event');
  }
  if (adverseEvents.length) {
    throw new ValidationError('Semantic memory review contains a denied or failed terminal event');
  }

  const accepted = acceptedEvents[0];
  const completed = completedEvents[0];
  // The counts above keep the original reads, so an inherited entry or kind
  // can only add a deny. The one accepted and one completed event must also
  // be own array entries with an own kind (#1918).
  if (
    !ownEntry(events, accepted)
    || !ownEntry(events, completed)
    || own(accepted, 'kind') !== 'intent.accepted'
    || own(completed, 'kind') !== 'intent.completed'
  ) {
    throw new ValidationError('Semantic memory review requires one accepted and one completed event');
  }
  const acceptedSeq = own(accepted, 'seq');
  const completedSeq = own(completed, 'seq');
  if (
    !Number.isSafeInteger(acceptedSeq)
    || !Number.isSafeInteger(completedSeq)
    || acceptedSeq >= completedSeq
    || own(accepted, 'actor') !== normalized.owner
    || own(completed, 'actor') !== normalized.owner
    || own(accepted, 'trace_id') !== traceId
    || own(completed, 'trace_id') !== traceId
    || own(accepted, 'subject') !== intentId
    || own(completed, 'subject') !== intentId
  ) {
    throw new ValidationError('Semantic memory review event ordering or actor/trace binding is invalid');
  }
  const acceptedPayload = own(accepted, 'payload');
  if (
    own(acceptedPayload, 'intent_id') !== intentId
    || own(acceptedPayload, 'principal') !== normalized.owner
    || own(acceptedPayload, 'principal_type') !== 'human'
    || own(acceptedPayload, 'action') !== SEMANTIC_MEMORY_REVIEW_ACTION
    || own(acceptedPayload, 'request_digest') !== expectedRequestDigest
    || own(acceptedPayload, 'input_digest') !== digestObject(reviewIntent.input)
  ) {
    throw new ValidationError('Semantic memory accepted event does not match the exact review request');
  }

  const completedPayload = own(completed, 'payload');
  const result = assertPlainObject(own(completedPayload, 'result'), 'semantic review result');
  if (
    own(completedPayload, 'intent_id') !== intentId
    || own(result, 'intent_id') !== intentId
    || own(result, 'trace_id') !== traceId
    || own(result, 'status') !== 'completed'
  ) {
    throw new ValidationError('Semantic memory completed event does not match the exact review request');
  }
  if (canonicalJson(own(intentRow, 'result_json')) !== canonicalJson(result)) {
    throw new ValidationError('Semantic memory materialized completion does not match signed evidence');
  }

  const chainHead = assertString(own(chain, 'head'), 'semantic review chain head', {
    min: 64,
    max: 64,
    pattern: DIGEST
  });
  return mintGridEvidence({
    schema: SEMANTIC_MEMORY_GRID_EVIDENCE_SCHEMA,
    owner: normalized.owner,
    object_id: normalized.object_id,
    review_decision: own(normalized, 'review_decision'),
    verified_review_request_digest: expectedRequestDigest,
    intent_id: intentId,
    trace_id: traceId,
    accepted: freeze({
      seq: acceptedSeq,
      event_id: own(accepted, 'event_id'),
      event_hash: own(accepted, 'event_hash')
    }),
    completed: freeze({
      seq: completedSeq,
      event_id: own(completed, 'event_id'),
      event_hash: own(completed, 'event_hash')
    }),
    chain: freeze({
      valid: true,
      head: chainHead,
      events: own(chain, 'events')
    }),
    downstream_effect_authorized: false
  });
}
