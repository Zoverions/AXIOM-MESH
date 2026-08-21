import {
  AxiomError,
  ValidationError,
  assertPlainObject,
  assertString,
  canonicalJson
} from '../lib/canonical.mjs';
import {
  normalizeSemanticMemorySourceEvidence
} from '../lib/semantic-memory-source-evidence.mjs';

export const SEMANTIC_MEMORY_SOURCE_EVENT = 'memory.semantic.source.observed';
export const SEMANTIC_MEMORY_SOURCE_STORE_SCHEMA =
  'axiom-semantic-memory-source-evidence-ledger.v1';

const ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/;
const DIGEST = /^[a-f0-9]{64}$/;

export function semanticMemorySourceEvidenceStatus() {
  return Object.freeze({
    schema: SEMANTIC_MEMORY_SOURCE_STORE_SCHEMA,
    activation_state: 'opt-in-local-laboratory',
    evidence_event: SEMANTIC_MEMORY_SOURCE_EVENT,
    evidence_basis: 'owner-observed-artifact',
    source_identity_verified: false,
    artifact_authenticity_verified: false,
    non_authorizing: true,
    raw_source_bytes_retained: false,
    memory_write_authority: false,
    provider_trust_imported: false,
    public_routes: false,
    production_store_selected: false
  });
}

export function normalizeSemanticMemorySourceEvent(eventInput) {
  const event = assertPlainObject(eventInput, 'semantic source evidence event');
  if (event.kind !== SEMANTIC_MEMORY_SOURCE_EVENT) {
    throw new ValidationError('Semantic source evidence event kind is invalid');
  }
  const payload = assertPlainObject(event.payload, 'semantic source evidence payload');
  const keys = Object.keys(payload);
  if (keys.length !== 1 || keys[0] !== 'evidence') {
    throw new ValidationError('Semantic source evidence payload fields are invalid');
  }
  const evidence = normalizeSemanticMemorySourceEvidence(payload.evidence);
  if (event.actor !== evidence.owner) {
    throw new ValidationError('Semantic source evidence event actor must equal evidence owner');
  }
  if (event.subject !== evidence.evidence_digest) {
    throw new ValidationError('Semantic source evidence event subject must equal evidence digest');
  }
  return evidence;
}

export function findSemanticMemorySourceEvidenceEvents(store, evidenceDigest) {
  requiredStore(store);
  const digest = requiredDigest(evidenceDigest, 'semantic source evidence digest');
  return store.db.prepare(`
    SELECT * FROM events
    WHERE kind = ? AND subject = ?
    ORDER BY seq
  `).all(SEMANTIC_MEMORY_SOURCE_EVENT, digest);
}

export function getSemanticMemorySourceEvidence(
  store,
  owner,
  evidenceDigest,
  { verify = true } = {}
) {
  requiredStore(store);
  const expectedOwner = requiredId(owner, 'semantic source owner');
  const digest = requiredDigest(evidenceDigest, 'semantic source evidence digest');
  if (verify) store.requireIntentEvidenceChain();

  const rows = findSemanticMemorySourceEvidenceEvents(store, digest);
  if (rows.length === 0) {
    throw new AxiomError(
      'semantic_source_evidence_not_found',
      'Semantic source evidence was not found',
      404
    );
  }
  if (rows.length !== 1) {
    throw new AxiomError(
      'semantic_source_evidence_duplicate_history',
      'Semantic source evidence digest appears more than once in signed Grid history',
      503
    );
  }
  const row = rows[0];
  const event = store.decodeEventRow(row);
  const retained = normalizeSemanticMemorySourceEvent(event);
  if (
    event.actor !== expectedOwner
    || retained.owner !== expectedOwner
    || retained.evidence_digest !== digest
    || event.subject !== digest
  ) {
    throw new AxiomError(
      'semantic_source_evidence_owner_mismatch',
      'Semantic source evidence is not owned by the requesting observer',
      403
    );
  }
  return semanticMemorySourceEvidenceReceipt(row, retained, false);
}

export function recordSemanticMemorySourceEvidence(
  store,
  { traceId, actor, evidence },
  { append } = {}
) {
  requiredStore(store);
  const trace = requiredId(traceId, 'semantic source traceId');
  const observer = requiredId(actor, 'semantic source actor');
  const normalized = normalizeSemanticMemorySourceEvidence(evidence);
  if (normalized.owner !== observer) {
    throw new ValidationError(
      'Semantic source evidence actor must equal the local memory owner observer'
    );
  }
  store.requireIntentEvidenceChain();

  const existing = findSemanticMemorySourceEvidenceEvents(
    store,
    normalized.evidence_digest
  );
  if (existing.length > 1) {
    throw new AxiomError(
      'semantic_source_evidence_duplicate_history',
      'Semantic source evidence digest appears more than once in signed Grid history',
      503
    );
  }
  if (existing.length === 1) {
    const retained = normalizeSemanticMemorySourceEvent(
      store.decodeEventRow(existing[0])
    );
    if (
      retained.owner !== observer
      || canonicalJson(retained) !== canonicalJson(normalized)
    ) {
      throw new AxiomError(
        'semantic_source_evidence_conflict',
        'Existing semantic source evidence conflicts with the supplied observation',
        409
      );
    }
    return semanticMemorySourceEvidenceReceipt(existing[0], retained, true);
  }

  if (typeof append !== 'function') {
    throw new ValidationError(
      'Semantic source evidence recording requires an internal signed-event append function'
    );
  }
  const appended = append({
    traceId: trace,
    actor: observer,
    events: [{
      kind: SEMANTIC_MEMORY_SOURCE_EVENT,
      subject: normalized.evidence_digest,
      payload: { evidence: normalized }
    }]
  });
  const event = appended[0];
  return Object.freeze({
    schema: SEMANTIC_MEMORY_SOURCE_STORE_SCHEMA,
    evidence: normalized,
    source_event_id: event.event_id,
    source_seq: event.seq,
    exact_replay: false,
    downstream_effect_authorized: false
  });
}

export function verifySemanticMemorySourceEvidenceHistory(store) {
  requiredStore(store);
  store.requireIntentEvidenceChain();
  const rows = store.db.prepare(`
    SELECT * FROM events
    WHERE kind = ?
    ORDER BY seq
  `).all(SEMANTIC_MEMORY_SOURCE_EVENT);
  const seen = new Set();
  for (const row of rows) {
    const event = store.decodeEventRow(row);
    const evidence = normalizeSemanticMemorySourceEvent(event);
    if (seen.has(evidence.evidence_digest)) {
      throw new AxiomError(
        'semantic_source_evidence_duplicate_history',
        'Semantic source evidence digest appears more than once in signed Grid history',
        503
      );
    }
    seen.add(evidence.evidence_digest);
  }
  return Object.freeze({
    valid: true,
    schema: SEMANTIC_MEMORY_SOURCE_STORE_SCHEMA,
    observations: seen.size
  });
}

export function semanticMemorySourceEvidenceReceipt(row, evidence, exactReplay) {
  return Object.freeze({
    schema: SEMANTIC_MEMORY_SOURCE_STORE_SCHEMA,
    evidence,
    source_event_id: row.event_id,
    source_seq: row.seq,
    exact_replay: exactReplay,
    downstream_effect_authorized: false
  });
}

function requiredStore(store) {
  if (
    !store
    || !store.db
    || typeof store.requireIntentEvidenceChain !== 'function'
    || typeof store.decodeEventRow !== 'function'
  ) {
    throw new ValidationError('Semantic source evidence ledger requires a Grid store');
  }
}

function requiredId(value, label) {
  return assertString(value, label, { min: 1, max: 160, pattern: ID });
}

function requiredDigest(value, label) {
  return assertString(value, label, { min: 64, max: 64, pattern: DIGEST });
}
