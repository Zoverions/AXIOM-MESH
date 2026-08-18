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
import {
  AuthenticatedSemanticMemoryGridStore
} from './semantic-memory-authenticated-ingestion.mjs';

export const SEMANTIC_MEMORY_SOURCE_EVENT = 'memory.semantic.source.observed';
export const SEMANTIC_MEMORY_SOURCE_STORE_SCHEMA =
  'axiom-semantic-memory-source-evidence-store.v1';

const ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/;
const DIGEST = /^[a-f0-9]{64}$/;

export class SemanticMemorySourceEvidenceGridStore extends AuthenticatedSemanticMemoryGridStore {
  getStatus() {
    return {
      ...super.getStatus(),
      semantic_memory_source_evidence: Object.freeze({
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
      })
    };
  }

  appendEvents({ traceId, actor, events }) {
    if (
      Array.isArray(events)
      && events.some(event => event?.kind === SEMANTIC_MEMORY_SOURCE_EVENT)
    ) {
      throw new ValidationError(
        'Semantic source evidence store rejects bare source-observation append; use recordSemanticMemorySourceEvidence'
      );
    }
    return super.appendEvents({ traceId, actor, events });
  }

  recordSemanticMemorySourceEvidence({ traceId, actor, evidence }) {
    const trace = assertString(traceId, 'semantic source traceId', {
      max: 160,
      pattern: ID
    });
    const observer = assertString(actor, 'semantic source actor', {
      max: 160,
      pattern: ID
    });
    const normalized = normalizeSemanticMemorySourceEvidence(evidence);
    if (normalized.owner !== observer) {
      throw new ValidationError(
        'Semantic source evidence actor must equal the local memory owner observer'
      );
    }
    this.requireIntentEvidenceChain();

    const existing = this.findSemanticSourceEvidenceEvents(normalized.evidence_digest);
    if (existing.length > 1) {
      throw new AxiomError(
        'semantic_source_evidence_duplicate_history',
        'Semantic source evidence digest appears more than once in signed Grid history',
        503
      );
    }
    if (existing.length === 1) {
      const retained = validateSourceEvent(this.decodeEventRow(existing[0]));
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
      return this.semanticSourceEvidenceReceipt(existing[0], retained, true);
    }

    const appended = super.appendEvents({
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

  getSemanticMemorySourceEvidence(owner, evidenceDigest, { verify = true } = {}) {
    const expectedOwner = assertString(owner, 'semantic source owner', {
      max: 160,
      pattern: ID
    });
    const digest = assertString(evidenceDigest, 'semantic source evidence digest', {
      min: 64,
      max: 64,
      pattern: DIGEST
    });
    if (verify) this.requireIntentEvidenceChain();

    const rows = this.findSemanticSourceEvidenceEvents(digest);
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
    const event = this.decodeEventRow(row);
    const retained = validateSourceEvent(event);
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
    return this.semanticSourceEvidenceReceipt(row, retained, false);
  }

  findSemanticSourceEvidenceEvents(evidenceDigest) {
    return this.db.prepare(`
      SELECT * FROM events
      WHERE kind = ? AND subject = ?
      ORDER BY seq
    `).all(SEMANTIC_MEMORY_SOURCE_EVENT, evidenceDigest);
  }

  semanticSourceEvidenceReceipt(row, evidence, exactReplay) {
    return Object.freeze({
      schema: SEMANTIC_MEMORY_SOURCE_STORE_SCHEMA,
      evidence,
      source_event_id: row.event_id,
      source_seq: row.seq,
      exact_replay: exactReplay,
      downstream_effect_authorized: false
    });
  }
}

function validateSourceEvent(eventInput) {
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
