import {
  AxiomError,
  ValidationError,
  assertPlainObject,
  assertString,
  canonicalJson
} from '../lib/canonical.mjs';
import {
  assertConvergedSemanticMemoryProvenance,
  deriveConvergedSemanticMemoryProvenance
} from '../lib/semantic-memory-converged-provenance.mjs';
import {
  normalizeSemanticMemoryOriginMetadata
} from '../lib/semantic-memory-origin-mode.mjs';
import {
  normalizeSemanticMemoryProvenance
} from '../lib/semantic-memory-provenance.mjs';
import {
  SEMANTIC_MEMORY_CONTENT_KIND,
  semanticMemoryContentAddress
} from '../lib/semantic-memory-content.mjs';
import { SemanticMemoryContentGridStore } from './semantic-memory-content-store.mjs';
import { SemanticMemoryStateGridStore } from './semantic-memory-state-store.mjs';
import {
  SEMANTIC_CLASS_METADATA_KEY,
  isSemanticMemoryPutCandidate,
  normalizeNativeMemoryCompletion,
  normalizeNativeSemanticMemoryPut
} from './semantic-memory-native-ingestion.mjs';
import {
  verifyNativeMemoryIntentEvidence
} from './semantic-memory-native-intent-evidence.mjs';
import {
  SEMANTIC_MEMORY_SOURCE_EVENT,
  getSemanticMemorySourceEvidence,
  normalizeSemanticMemorySourceEvent,
  recordSemanticMemorySourceEvidence,
  semanticMemorySourceEvidenceStatus,
  verifySemanticMemorySourceEvidenceHistory
} from './semantic-memory-source-evidence-ledger.mjs';

export const CONVERGED_SEMANTIC_MEMORY_INGESTION_SCHEMA =
  'axiom-semantic-memory-converged-ingestion.v1';

const ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/;

export class ConvergedSemanticMemoryGridStore extends SemanticMemoryContentGridStore {
  initialize() {
    this.convergedSemanticMemoryReady = false;
    super.initialize();
    this.convergedSemanticMemoryReady = true;
    verifySemanticMemorySourceEvidenceHistory(this);
    this.verifyConvergedSemanticMemoryHistory();
  }

  getStatus() {
    return {
      ...super.getStatus(),
      semantic_memory_source_evidence: semanticMemorySourceEvidenceStatus(),
      converged_semantic_memory_ingestion: Object.freeze({
        schema: CONVERGED_SEMANTIC_MEMORY_INGESTION_SCHEMA,
        activation_state: 'opt-in-local-laboratory',
        accepted_action: 'memory.put',
        accepted_principal_type: 'human',
        explicit_origin_mode_required: true,
        native_invocation_binding: true,
        hypervisor_verified_execution_binding: true,
        retained_source_evidence_binding: true,
        atomic_content_provenance_binding: true,
        grid_enrichment_only_after_execution_verification: true,
        caller_supplied_provenance_allowed: false,
        source_identity_verified: false,
        artifact_authenticity_verified: false,
        provider_direct_write_authority: false,
        public_routes: false,
        production_store_selected: false,
        capability_registry_promoted: false,
        downstream_effect_authority: false,
        propagation_authority: false
      })
    };
  }

  appendEvents({ traceId, actor, events }) {
    if (!Array.isArray(events)) {
      return super.appendEvents({ traceId, actor, events });
    }
    if (events.some(event => event?.kind === SEMANTIC_MEMORY_SOURCE_EVENT)) {
      throw new ValidationError(
        'Bare semantic source evidence append is denied; use recordSemanticMemorySourceEvidence'
      );
    }

    const semanticIndexes = [];
    for (let index = 0; index < events.length; index += 1) {
      if (isSemanticMemoryPutCandidate(events[index])) semanticIndexes.push(index);
    }
    if (semanticIndexes.length === 0) {
      return super.appendEvents({ traceId, actor, events });
    }
    if (
      semanticIndexes.length !== 1
      || semanticIndexes[0] !== 0
      || events.length !== 2
      || events[1]?.kind !== 'intent.completed'
    ) {
      throw new ValidationError(
        'Native semantic memory ingestion requires exactly one memory.put followed by one intent.completed event'
      );
    }

    const rawMemory = assertPlainObject(events[0], 'native semantic memory.put event');
    const rawPayload = assertPlainObject(rawMemory.payload, 'native semantic memory.put payload');
    if (Object.prototype.hasOwnProperty.call(rawPayload, 'semantic_provenance')) {
      throw new ValidationError(
        'Caller-supplied semantic_provenance is forbidden; Grid derives provenance after native execution verification'
      );
    }
    const completionPayload = assertPlainObject(
      events[1].payload,
      'native semantic memory completion payload'
    );
    const intentId = requiredId(
      completionPayload.intent_id,
      'native semantic memory completion intent_id'
    );
    const trace = requiredId(traceId, 'native semantic memory traceId');
    const owner = requiredId(actor, 'native semantic memory actor');

    const { accepted } = verifyNativeMemoryIntentEvidence(this, {
      traceId: trace,
      actor: owner,
      intentId,
      allowedStatuses: ['accepted']
    });
    const memory = normalizeNativeSemanticMemoryPut(rawMemory, {
      traceId: trace,
      actor: owner,
      intentId,
      accepted
    });
    const completion = normalizeNativeMemoryCompletion(events[1], {
      traceId: trace,
      intentId,
      accepted,
      memory
    });
    const sourceReceipt = this.sourceReceiptForMemory(owner, memory, {
      requireEarlierThanSeq: undefined
    });
    const semanticRecord = deriveConvergedSemanticMemoryProvenance({
      owner,
      intent_id: intentId,
      request_digest: accepted.payload.request_digest,
      memory,
      ...(sourceReceipt ? { source_evidence: sourceReceipt.evidence } : {})
    });

    this.assertNoPriorSemanticBirth(semanticRecord.object_id);
    const enrichedMemory = {
      kind: 'memory.put',
      subject: memory.payload.object_id,
      payload: {
        ...structuredClone(memory.payload),
        semantic_provenance: semanticRecord
      }
    };

    const appended = SemanticMemoryStateGridStore.prototype.appendEvents.call(this, {
      traceId: trace,
      actor: owner,
      events: [enrichedMemory, completion.event]
    });
    return Object.freeze({
      schema: CONVERGED_SEMANTIC_MEMORY_INGESTION_SCHEMA,
      object_id: semanticRecord.object_id,
      content_digest: semanticRecord.content_digest,
      semantic_record: semanticRecord,
      source_evidence_digest: sourceReceipt?.evidence.evidence_digest ?? null,
      event_ids: Object.freeze(appended.map(event => event.event_id)),
      downstream_effect_authorized: false,
      propagation_authorized: false
    });
  }

  recordSemanticMemorySourceEvidence(input) {
    return recordSemanticMemorySourceEvidence(this, input, {
      append: args => SemanticMemoryStateGridStore.prototype.appendEvents.call(this, args)
    });
  }

  getSemanticMemorySourceEvidence(owner, evidenceDigest, options = {}) {
    return getSemanticMemorySourceEvidence(this, owner, evidenceDigest, options);
  }

  semanticMemoryRecordFromSourceEvent(eventInput, actor) {
    const event = assertPlainObject(eventInput, 'converged semantic memory source event');
    if (event.kind !== 'memory.put') {
      return super.semanticMemoryRecordFromSourceEvent(event, actor ?? event.actor);
    }
    const payload = assertPlainObject(event.payload, 'converged memory.put payload');
    if (payload.kind !== SEMANTIC_MEMORY_CONTENT_KIND) {
      if (Object.prototype.hasOwnProperty.call(payload, 'semantic_provenance')) {
        throw new ValidationError(
          'semantic_provenance is allowed only on semantic.memory content'
        );
      }
      return null;
    }
    assertExactKeys(payload, [
      'object_id',
      'owner',
      'kind',
      'content',
      'metadata',
      'content_digest',
      'evidence',
      'semantic_provenance'
    ], 'converged semantic memory.put payload');

    const address = semanticMemoryContentAddress({
      owner: payload.owner,
      content: payload.content,
      metadata: payload.metadata
    });
    if (
      address.object_id !== payload.object_id
      || address.content_digest !== payload.content_digest
      || event.subject !== address.object_id
    ) {
      throw new ValidationError('Converged semantic memory content address is invalid');
    }
    const eventActor = actor ?? event.actor;
    if (eventActor !== address.owner) {
      throw new ValidationError('Converged semantic memory actor must equal content owner');
    }

    const record = normalizeSemanticMemoryProvenance(payload.semantic_provenance);
    if (
      record.owner !== address.owner
      || record.object_id !== address.object_id
      || record.content_digest !== address.content_digest
      || record.semantic_class !== payload.metadata?.[SEMANTIC_CLASS_METADATA_KEY]
      || record.may_affect_authority !== false
      || !record.ingestion_intent_id
      || !record.request_digest
    ) {
      throw new ValidationError(
        'Converged semantic provenance does not match its content or ingestion identity'
      );
    }

    const memory = Object.freeze({
      payload: Object.freeze({
        object_id: address.object_id,
        owner: address.owner,
        kind: address.kind,
        content: structuredClone(payload.content),
        metadata: structuredClone(payload.metadata),
        content_digest: address.content_digest,
        evidence: structuredClone(
          assertPlainObject(payload.evidence, 'converged semantic execution evidence')
        )
      }),
      semantic_class: record.semantic_class
    });
    const sourceReceipt = this.sourceReceiptForMemory(address.owner, memory, {
      requireEarlierThanSeq: Number.isInteger(event.seq) ? event.seq : undefined
    });
    const expected = deriveConvergedSemanticMemoryProvenance({
      owner: address.owner,
      intent_id: record.ingestion_intent_id,
      request_digest: record.request_digest,
      memory,
      ...(sourceReceipt ? { source_evidence: sourceReceipt.evidence } : {})
    });
    return assertConvergedSemanticMemoryProvenance(expected, record);
  }

  verifySemanticMemoryIngestionHistory() {
    return this.verifyConvergedSemanticMemoryHistory();
  }

  verifyConvergedSemanticMemoryHistory() {
    this.requireIntentEvidenceChain();
    const rows = this.semanticMemorySourceRows();
    const seen = new Set();
    for (const row of rows) {
      const event = this.decodeEventRow(row);
      const record = this.semanticMemoryRecordFromSourceEvent(event, event.actor);
      if (!record || seen.has(record.object_id)) continue;
      seen.add(record.object_id);
      if (event.kind !== 'memory.put') {
        throw new ValidationError(
          'Converged semantic memory history must begin with one enriched memory.put event'
        );
      }
      this.verifyPersistedConvergedBirth(event, record);
    }
    return Object.freeze({
      valid: true,
      schema: CONVERGED_SEMANTIC_MEMORY_INGESTION_SCHEMA,
      semantic_objects: seen.size
    });
  }

  verifyPersistedConvergedBirth(event, record) {
    const intentId = record.ingestion_intent_id;
    const { accepted } = verifyNativeMemoryIntentEvidence(this, {
      traceId: event.trace_id,
      actor: record.owner,
      intentId,
      allowedStatuses: ['completed']
    });
    const baseEvent = {
      kind: 'memory.put',
      subject: event.subject,
      payload: { ...structuredClone(event.payload) }
    };
    delete baseEvent.payload.semantic_provenance;
    const memory = normalizeNativeSemanticMemoryPut(baseEvent, {
      traceId: event.trace_id,
      actor: record.owner,
      intentId,
      accepted
    });

    const completionRow = this.db.prepare(`
      SELECT * FROM events WHERE seq = ?
    `).get(event.seq + 1);
    if (!completionRow) {
      throw new ValidationError('Converged semantic memory has no adjacent completion');
    }
    const completionEvent = this.decodeEventRow(completionRow);
    normalizeNativeMemoryCompletion(completionEvent, {
      traceId: event.trace_id,
      intentId,
      accepted,
      memory
    });
    const sourceReceipt = this.sourceReceiptForMemory(record.owner, memory, {
      requireEarlierThanSeq: event.seq
    });
    const expected = deriveConvergedSemanticMemoryProvenance({
      owner: record.owner,
      intent_id: intentId,
      request_digest: accepted.payload.request_digest,
      memory,
      ...(sourceReceipt ? { source_evidence: sourceReceipt.evidence } : {})
    });
    assertConvergedSemanticMemoryProvenance(expected, record);
    return true;
  }

  sourceReceiptForMemory(owner, memory, { requireEarlierThanSeq } = {}) {
    const origin = normalizeSemanticMemoryOriginMetadata(memory.payload.metadata);
    if (origin.origin_mode === 'owner-authored') return null;
    const receipt = getSemanticMemorySourceEvidence(
      this,
      owner,
      origin.source_evidence_digest,
      { verify: false }
    );
    if (
      requireEarlierThanSeq !== undefined
      && receipt.source_seq >= requireEarlierThanSeq
    ) {
      throw new ValidationError(
        'Semantic source evidence must be retained before the semantic memory birth event'
      );
    }
    return receipt;
  }

  assertNoPriorSemanticBirth(objectId) {
    const content = this.db.prepare(`
      SELECT 1 FROM memory_objects WHERE object_id = ?
    `).get(objectId);
    if (content) {
      throw new AxiomError(
        'semantic_memory_content_preexists',
        'Semantic memory content already exists and cannot acquire converged provenance after the fact',
        409
      );
    }
    const provenance = this.db.prepare(`
      SELECT 1 FROM semantic_memory_provenance_state WHERE object_id = ?
    `).get(objectId);
    if (provenance) {
      throw new AxiomError(
        'semantic_memory_provenance_preexists',
        'Semantic memory provenance already exists for this content address',
        409
      );
    }
  }
}

function requiredId(value, label) {
  return assertString(value, label, { min: 1, max: 160, pattern: ID });
}

function assertExactKeys(value, allowed, label) {
  const actual = Object.keys(value).sort();
  const expected = [...allowed].sort();
  if (
    actual.length !== expected.length
    || actual.some((key, index) => key !== expected[index])
  ) {
    throw new ValidationError(`${label} contains unsupported or missing fields`);
  }
}
