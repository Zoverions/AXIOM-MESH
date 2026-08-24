import {
  AxiomError,
  ValidationError,
  assertString,
  canonicalJson
} from '../lib/canonical.mjs';
import { normalizeLocalContextCandidate } from '../lib/context-claim-resolution.mjs';
import {
  LOCAL_CONTEXT_SEMANTIC_SOURCE_EVIDENCE_MEMORY_KIND,
  localContextSemanticSourceEvidenceMemoryDigest,
  projectLocalContextSemanticSourceEvidenceMemoryPut,
  verifyLocalContextSemanticSourceEvidence
} from '../lib/context-semantic-source-evidence.mjs';

export const LOCAL_CONTEXT_SEMANTIC_SOURCE_CURRENT_SCHEMA =
  'axiom-local-context-semantic-source-current.v1';

const ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/;
const DIGEST = /^[a-f0-9]{64}$/;

function id(value, label) {
  return assertString(value, label, { min: 1, max: 160, pattern: ID });
}

function digest(value, label) {
  return assertString(value, label, { min: 64, max: 64, pattern: DIGEST });
}

function requireStore(store) {
  if (
    !store
    || !store.db
    || typeof store.requireIntentEvidenceChain !== 'function'
    || typeof store.decodeProtectedRow !== 'function'
    || typeof store.decodeEventRow !== 'function'
  ) {
    throw new TypeError('Local context semantic source-evidence verification requires a Grid store');
  }
}

function optionalBeforeSeq(value) {
  if (value === undefined || value === null) return null;
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new ValidationError('semantic source evidence beforeSeq must be a positive safe integer');
  }
  return value;
}

export function getCurrentLocalContextSemanticSourceEvidence(store, {
  owner,
  candidate,
  sourceEvidenceDigest,
  beforeSeq
} = {}) {
  requireStore(store);
  const chain = store.requireIntentEvidenceChain();
  const ownerId = id(owner, 'semantic source evidence owner');
  const normalizedCandidate = normalizeLocalContextCandidate(candidate);
  if (normalizedCandidate.owner_subject_ref !== ownerId) {
    throw new ValidationError('semantic source evidence owner does not match context candidate owner');
  }
  const memoryDigest = digest(
    sourceEvidenceDigest,
    'semantic source evidence memory digest'
  );
  const requiredBeforeSeq = optionalBeforeSeq(beforeSeq);
  const objectId = `memory_${memoryDigest}`;
  const row = store.db.prepare(`
    SELECT * FROM memory_objects WHERE object_id = ?
  `).get(objectId);
  if (!row) {
    throw new AxiomError(
      'context_semantic_source_evidence_not_found',
      'Retained local context semantic source evidence was not found',
      404
    );
  }

  const decoded = store.decodeProtectedRow(
    'memory_objects',
    'object_id',
    row,
    ['payload_json']
  );
  const payload = decoded.payload_json;
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new ValidationError('semantic source evidence memory payload is invalid');
  }
  const evidence = verifyLocalContextSemanticSourceEvidence(
    payload.content,
    normalizedCandidate
  );
  const expectedInput = projectLocalContextSemanticSourceEvidenceMemoryPut(evidence);
  if (
    decoded.owner !== ownerId
    || decoded.owner !== evidence.owner_subject_ref
    || decoded.kind !== LOCAL_CONTEXT_SEMANTIC_SOURCE_EVIDENCE_MEMORY_KIND
    || canonicalJson(payload.metadata) !== canonicalJson(expectedInput.metadata)
  ) {
    throw new ValidationError('semantic source evidence materialized memory binding is invalid');
  }

  const expectedMemoryDigest = localContextSemanticSourceEvidenceMemoryDigest(evidence);
  if (
    expectedMemoryDigest !== memoryDigest
    || decoded.content_digest !== memoryDigest
    || decoded.object_id !== objectId
  ) {
    throw new ValidationError('semantic source evidence materialized content address is invalid');
  }

  const eventRows = store.db.prepare(`
    SELECT * FROM events
    WHERE kind = 'memory.put' AND subject = ?
    ORDER BY seq
  `).all(objectId);
  if (!eventRows.length) {
    throw new ValidationError('semantic source evidence requires a signed memory.put source event');
  }
  const events = eventRows.map(eventRow => store.decodeEventRow(eventRow));
  for (const event of events) {
    if (
      event.actor !== ownerId
      || event.payload?.object_id !== objectId
      || event.payload?.owner !== ownerId
      || event.payload?.kind !== LOCAL_CONTEXT_SEMANTIC_SOURCE_EVIDENCE_MEMORY_KIND
      || event.payload?.content_digest !== memoryDigest
      || canonicalJson(event.payload?.content) !== canonicalJson(expectedInput.content)
      || canonicalJson(event.payload?.metadata) !== canonicalJson(expectedInput.metadata)
    ) {
      throw new ValidationError(
        'semantic source evidence signed memory.put history conflicts with materialized evidence'
      );
    }
  }

  const firstEvent = events[0];
  if (requiredBeforeSeq !== null && firstEvent.seq >= requiredBeforeSeq) {
    throw new AxiomError(
      'context_semantic_source_evidence_postdates_state',
      'Semantic source evidence must be retained before the semantic state that cites it',
      409
    );
  }
  if (decoded.status !== 'active') {
    throw new AxiomError(
      'context_semantic_source_evidence_tombstoned',
      'Retained semantic source evidence is tombstoned and cannot support current context',
      409
    );
  }

  return Object.freeze({
    schema: LOCAL_CONTEXT_SEMANTIC_SOURCE_CURRENT_SCHEMA,
    owner_subject_ref: ownerId,
    candidate_digest: evidence.candidate_digest,
    source_class: evidence.source_class,
    evidence,
    evidence_digest: evidence.evidence_digest,
    memory_digest: memoryDigest,
    object_id: objectId,
    source_event_id: firstEvent.event_id,
    source_event_seq: firstEvent.seq,
    source_event_hash: firstEvent.event_hash,
    equivalent_source_events: events.length,
    current_source_evidence_verified: true,
    full_grid_chain_verified: chain.valid === true,
    downstream_effect_authorized: false
  });
}
