import {
  AxiomError,
  ValidationError,
  assertString,
  canonicalJson,
  digestObject
} from '../lib/canonical.mjs';
import { projectLocalContextSemanticData } from '../lib/context-semantic-trust.mjs';
import {
  LOCAL_CONTEXT_SEMANTIC_STATE_MEMORY_KIND,
  LOCAL_CONTEXT_SEMANTIC_STATE_MEMORY_SCHEMA,
  projectLocalContextSemanticStateMemoryPut,
  verifyLocalContextSemanticStateRecord
} from '../lib/context-semantic-state.mjs';
import {
  createLocalContextSemanticReviewIntent,
  verifyCompletedLocalContextSemanticReview
} from '../lib/context-semantic-review-evidence.mjs';

export const LOCAL_CONTEXT_SEMANTIC_CURRENT_STATE_SCHEMA =
  'axiom-local-context-semantic-current-state.v1';

const ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/;

function id(value, label) {
  return assertString(value, label, { min: 1, max: 160, pattern: ID });
}

function requireStore(store) {
  if (
    !store
    || typeof store.requireIntentEvidenceChain !== 'function'
    || typeof store.decodeProtectedRow !== 'function'
    || typeof store.decodeEventRow !== 'function'
    || typeof store.getIntent !== 'function'
    || !store.db
  ) {
    throw new TypeError('Local context semantic current-state verification requires a Grid store');
  }
}

function verifyMemoryRow(store, row) {
  const decoded = store.decodeProtectedRow(
    'memory_objects',
    'object_id',
    row,
    ['payload_json']
  );
  const payload = decoded.payload_json;
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new ValidationError('semantic state memory payload is invalid');
  }
  const state = verifyLocalContextSemanticStateRecord(payload.content);
  const expectedInput = projectLocalContextSemanticStateMemoryPut(state);
  if (
    decoded.owner !== state.owner_subject_ref
    || decoded.kind !== LOCAL_CONTEXT_SEMANTIC_STATE_MEMORY_KIND
    || canonicalJson(payload.metadata) !== canonicalJson(expectedInput.metadata)
  ) {
    throw new ValidationError('semantic state materialized memory binding is invalid');
  }

  const contentDigest = digestObject({
    owner: decoded.owner,
    kind: decoded.kind,
    content: expectedInput.content,
    metadata: expectedInput.metadata
  });
  const objectId = `memory_${contentDigest}`;
  if (decoded.content_digest !== contentDigest || decoded.object_id !== objectId) {
    throw new ValidationError('semantic state materialized content address is invalid');
  }

  const eventRows = store.db.prepare(`
    SELECT * FROM events
    WHERE kind = 'memory.put' AND subject = ?
    ORDER BY seq
  `).all(decoded.object_id);
  if (!eventRows.length) {
    throw new ValidationError('semantic state requires a signed memory.put source event');
  }
  const events = eventRows.map(eventRow => store.decodeEventRow(eventRow));
  for (const event of events) {
    if (
      event.actor !== decoded.owner
      || event.payload?.object_id !== decoded.object_id
      || event.payload?.owner !== decoded.owner
      || event.payload?.kind !== decoded.kind
      || event.payload?.content_digest !== decoded.content_digest
      || canonicalJson(event.payload?.content) !== canonicalJson(expectedInput.content)
      || canonicalJson(event.payload?.metadata) !== canonicalJson(expectedInput.metadata)
    ) {
      throw new ValidationError(
        'semantic state signed memory.put history conflicts with materialized state'
      );
    }
  }
  const event = events[0];
  return Object.freeze({
    state,
    status: decoded.status,
    object_id: decoded.object_id,
    source_event_id: event.event_id,
    source_event_seq: event.seq,
    source_event_hash: event.event_hash,
    equivalent_source_events: events.length
  });
}

function verifyLinearClaimHistory(store, nodes) {
  if (!nodes.length) return null;
  const byDigest = new Map();
  for (const node of nodes) {
    if (byDigest.has(node.state.state_digest)) {
      throw new ValidationError('duplicate semantic state digest is retained');
    }
    byDigest.set(node.state.state_digest, node);
  }

  const genesis = nodes.filter(node => node.state.previous_state_digest === null);
  if (genesis.length !== 1) {
    throw new ValidationError('semantic state claim requires exactly one observed genesis');
  }

  const childByParent = new Map();
  for (const node of nodes) {
    const parentDigest = node.state.previous_state_digest;
    if (parentDigest === null) continue;
    if (!byDigest.has(parentDigest)) {
      throw new ValidationError('semantic state review predecessor is missing');
    }
    if (childByParent.has(parentDigest)) {
      throw new ValidationError('semantic state history is branched and therefore ambiguous');
    }
    childByParent.set(parentDigest, node);
  }

  const ordered = [];
  let current = genesis[0];
  while (current) {
    ordered.push(current);
    current = childByParent.get(current.state.state_digest) ?? null;
    if (ordered.length > nodes.length) {
      throw new ValidationError('semantic state history contains a cycle');
    }
  }
  if (ordered.length !== nodes.length) {
    throw new ValidationError('semantic state history is disconnected');
  }

  for (let index = 1; index < ordered.length; index += 1) {
    const previous = ordered[index - 1];
    const node = ordered[index];
    verifyLocalContextSemanticStateRecord(node.state, {
      previousState: previous.state
    });
    const evidence = node.state.review_evidence;
    const intent = createLocalContextSemanticReviewIntent(
      node.state.candidate,
      previous.state.trust,
      {
        decision: evidence.decision,
        targetSemanticClass: evidence.target_semantic_class
      }
    );
    const materializedIntent = store.getIntent(evidence.intent_id);
    const events = store.db.prepare(`
      SELECT * FROM events
      WHERE subject = ?
        AND kind IN ('intent.accepted', 'intent.completed', 'intent.denied', 'intent.failed')
      ORDER BY seq
    `).all(evidence.intent_id).map(row => store.decodeEventRow(row));
    const historicalAnchor = store.db.prepare(`
      SELECT event_hash FROM events WHERE seq = ?
    `).get(evidence.grid_chain_last_seq);
    if (!historicalAnchor || historicalAnchor.event_hash !== evidence.grid_chain_last_hash) {
      throw new ValidationError(
        'persisted semantic review evidence historical Grid anchor is not retained'
      );
    }
    const verifiedEvidence = verifyCompletedLocalContextSemanticReview({
      candidate: node.state.candidate,
      trust: previous.state.trust,
      intent,
      materializedIntent,
      events,
      chain: {
        valid: true,
        last_seq: evidence.grid_chain_last_seq,
        last_hash: evidence.grid_chain_last_hash
      }
    });
    if (
      verifiedEvidence.review_evidence_digest !== evidence.review_evidence_digest
      || canonicalJson(verifiedEvidence) !== canonicalJson(evidence)
    ) {
      throw new ValidationError('persisted semantic state review evidence no longer verifies');
    }
  }
  return ordered;
}

function loadOwnerNodes(store, owner) {
  const rows = store.db.prepare(`
    SELECT * FROM memory_objects
    WHERE owner = ? AND kind = ?
    ORDER BY created_at, object_id
  `).all(owner, LOCAL_CONTEXT_SEMANTIC_STATE_MEMORY_KIND);
  return rows.map(row => verifyMemoryRow(store, row));
}

export function getCurrentLocalContextSemanticState(store, {
  owner,
  claimId
} = {}) {
  requireStore(store);
  const chain = store.requireIntentEvidenceChain();
  const ownerId = id(owner, 'semantic current-state owner');
  const targetClaimId = id(claimId, 'semantic current-state claimId');
  const nodes = loadOwnerNodes(store, ownerId).filter(node => node.state.claim_id === targetClaimId);
  if (!nodes.length) {
    throw new AxiomError(
      'context_semantic_state_not_found',
      'Local context semantic state was not found',
      404
    );
  }
  const ordered = verifyLinearClaimHistory(store, nodes);
  const tombstonedIndex = ordered.findIndex(node => node.status !== 'active');
  if (tombstonedIndex >= 0) {
    const code = tombstonedIndex === ordered.length - 1
      ? 'context_semantic_state_tombstoned'
      : 'context_semantic_state_ancestor_tombstoned';
    throw new AxiomError(
      code,
      'Local context semantic state is not current because retained state was tombstoned',
      409
    );
  }
  const current = ordered.at(-1);
  const status = store.getStatus();
  return Object.freeze({
    schema: LOCAL_CONTEXT_SEMANTIC_CURRENT_STATE_SCHEMA,
    owner_subject_ref: current.state.owner_subject_ref,
    claim_id: current.state.claim_id,
    candidate: current.state.candidate,
    trust: current.state.trust,
    state_digest: current.state.state_digest,
    object_id: current.object_id,
    source_event_id: current.source_event_id,
    source_event_seq: current.source_event_seq,
    source_event_hash: current.source_event_hash,
    grid_chain_last_seq: status.last_seq,
    grid_chain_last_hash: status.last_hash,
    full_grid_chain_verified: chain.valid === true,
    review_evidence_reverified: current.state.transition === 'review',
    current_state_verified: true,
    downstream_effect_authorized: false
  });
}

export function loadCurrentLocalContextSemanticEntries(store, { owner } = {}) {
  requireStore(store);
  store.requireIntentEvidenceChain();
  const ownerId = id(owner, 'semantic current-entry owner');
  const nodes = loadOwnerNodes(store, ownerId);
  const byClaim = new Map();
  for (const node of nodes) {
    const list = byClaim.get(node.state.claim_id) ?? [];
    list.push(node);
    byClaim.set(node.state.claim_id, list);
  }

  const entries = [];
  const excluded = [];
  for (const [claimId, claimNodes] of [...byClaim.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const ordered = verifyLinearClaimHistory(store, claimNodes);
    const tombstonedIndex = ordered.findIndex(node => node.status !== 'active');
    if (tombstonedIndex >= 0) {
      excluded.push(Object.freeze({
        claim_id: claimId,
        code: tombstonedIndex === ordered.length - 1
          ? 'context_semantic_state_tombstoned'
          : 'context_semantic_state_ancestor_tombstoned'
      }));
      continue;
    }
    const current = ordered.at(-1).state;
    entries.push(Object.freeze({
      candidate: current.candidate,
      trust: current.trust
    }));
  }
  return Object.freeze({
    schema: 'axiom-local-context-semantic-current-entry-set.v1',
    owner_subject_ref: ownerId,
    entries: Object.freeze(entries),
    excluded: Object.freeze(excluded),
    downstream_effect_authorized: false
  });
}

export function projectCurrentLocalContextSemanticDataFromGrid(store, {
  owner,
  asOf,
  maxEntries = 1024
} = {}) {
  const current = loadCurrentLocalContextSemanticEntries(store, { owner });
  const projection = projectLocalContextSemanticData({
    entries: current.entries,
    asOf,
    maxEntries
  });
  return Object.freeze({
    ...projection,
    persisted_current_state_verified: true,
    persisted_state_excluded: current.excluded,
    downstream_effect_authorized: false
  });
}

export function assertLocalContextSemanticStateMemoryKind(value) {
  if (value !== LOCAL_CONTEXT_SEMANTIC_STATE_MEMORY_KIND) {
    throw new ValidationError(
      `semantic state memory kind must be ${LOCAL_CONTEXT_SEMANTIC_STATE_MEMORY_KIND}`
    );
  }
  return LOCAL_CONTEXT_SEMANTIC_STATE_MEMORY_SCHEMA;
}
