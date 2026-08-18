import {
  AxiomError,
  ValidationError,
  assertPlainObject,
  assertString
} from '../lib/canonical.mjs';
import { normalizeSemanticMemoryProvenance } from '../lib/semantic-memory-provenance.mjs';
import {
  SEMANTIC_MEMORY_INGESTION_ACTION,
  assertSemanticMemoryIngestionResult,
  semanticMemoryIngestionInputDigest,
  semanticMemoryIngestionRequestDigest
} from '../lib/semantic-memory-ingestion.mjs';
import {
  SEMANTIC_MEMORY_STATE_EVENT,
  SemanticMemoryStateGridStore
} from './semantic-memory-state-store.mjs';

export const SEMANTIC_MEMORY_INGESTION_STORE_SCHEMA =
  'axiom-semantic-memory-ingestion-store.v1';

const DIGEST = /^[a-f0-9]{64}$/;

export class SemanticMemoryIngestionGridStore extends SemanticMemoryStateGridStore {
  initialize() {
    this.semanticMemoryIngestionReady = false;
    super.initialize();
    this.semanticMemoryIngestionReady = true;
    this.verifySemanticMemoryIngestionHistory();
  }

  getStatus() {
    return {
      ...super.getStatus(),
      semantic_memory_ingestion: Object.freeze({
        schema: SEMANTIC_MEMORY_INGESTION_STORE_SCHEMA,
        activation_state: 'opt-in-local-laboratory',
        exact_intent_binding: true,
        same_commit_completion_required: true,
        human_owner_commit_required: true,
        provider_output_may_be_source_data: true,
        provider_direct_write_authority: false,
        direct_unbound_state_recording: false,
        sandbox_tool_wired: false,
        gateway_route_wired: false,
        capability_registry_promoted: false,
        downstream_effect_authority: false,
        propagation_authority: false
      })
    };
  }

  recordSemanticMemoryProvenance() {
    throw new ValidationError(
      'Direct semantic memory provenance recording is disabled by the ingestion-bound store'
    );
  }

  appendEvents({ traceId, actor, events }) {
    if (this.semanticMemoryIngestionReady && Array.isArray(events)) {
      for (let index = 0; index < events.length; index += 1) {
        const event = events[index];
        if (event?.kind !== SEMANTIC_MEMORY_STATE_EVENT) continue;
        const record = normalizeSemanticMemoryProvenance(
          assertPlainObject(event.payload, 'semantic memory state payload').record
        );
        const existing = this.db.prepare(`
          SELECT 1 FROM semantic_memory_provenance_state WHERE object_id = ?
        `).get(record.object_id);
        if (!existing) {
          this.verifyLiveSemanticMemoryIngestionCommit({
            traceId,
            actor,
            events,
            stateIndex: index,
            record
          });
        }
      }
    }
    return super.appendEvents({ traceId, actor, events });
  }

  verifyLiveSemanticMemoryIngestionCommit({
    traceId,
    actor,
    events,
    stateIndex,
    record
  }) {
    if (actor !== record.owner) {
      throw new ValidationError(
        'Semantic memory ingestion commit actor must equal the human memory owner'
      );
    }
    const intentId = requiredBinding(record.ingestion_intent_id, 'ingestion_intent_id');
    const requestDigest = requiredDigest(record.request_digest, 'request_digest');
    const expectedRequestDigest = semanticMemoryIngestionRequestDigest(record);
    if (requestDigest !== expectedRequestDigest) {
      throw new ValidationError('Semantic memory ingestion record request binding is invalid');
    }

    this.requireIntentEvidenceChain();
    const accepted = this.verifyAcceptedIngestionIntent({
      intentId,
      owner: record.owner,
      traceId,
      record,
      allowedStatuses: new Set(['accepted'])
    });

    const matching = [];
    for (let index = 0; index < events.length; index += 1) {
      const event = events[index];
      if (
        event?.kind === 'intent.completed'
        && event.subject === intentId
        && event.payload?.intent_id === intentId
      ) {
        matching.push({ event, index });
      }
    }
    if (matching.length !== 1 || matching[0].index !== stateIndex + 1) {
      throw new ValidationError(
        'Fresh semantic memory state must be followed immediately by one matching intent.completed event in the same commit'
      );
    }
    this.verifyCompletionEvent({
      completion: matching[0].event,
      intentId,
      traceId,
      record,
      accepted
    });
  }

  verifyAcceptedIngestionIntent({
    intentId,
    owner,
    traceId,
    record,
    allowedStatuses
  }) {
    const intentRow = this.db.prepare(`
      SELECT intent_id, trace_id, principal, action, status, input_digest, request_digest
      FROM intents WHERE intent_id = ?
    `).get(intentId);
    if (
      !intentRow
      || intentRow.trace_id !== traceId
      || intentRow.principal !== owner
      || intentRow.action !== SEMANTIC_MEMORY_INGESTION_ACTION
      || intentRow.request_digest !== record.request_digest
      || intentRow.input_digest !== semanticMemoryIngestionInputDigest(record)
      || !allowedStatuses.has(intentRow.status)
    ) {
      throw new AxiomError(
        'semantic_memory_ingestion_intent_unavailable',
        'A matching owner intent in the required lifecycle state is required for semantic memory ingestion',
        409
      );
    }

    const acceptedRow = this.db.prepare(`
      SELECT * FROM events
      WHERE kind = 'intent.accepted' AND subject = ?
      ORDER BY seq ASC LIMIT 1
    `).get(intentId);
    if (!acceptedRow) {
      throw new ValidationError('Semantic memory ingestion intent has no signed accepted event');
    }
    const accepted = this.decodeEventRow(acceptedRow);
    if (
      accepted.actor !== owner
      || accepted.trace_id !== traceId
      || accepted.payload?.intent_id !== intentId
      || accepted.payload?.principal !== owner
      || accepted.payload?.principal_type !== 'human'
      || accepted.payload?.action !== SEMANTIC_MEMORY_INGESTION_ACTION
      || accepted.payload?.input_digest !== semanticMemoryIngestionInputDigest(record)
      || accepted.payload?.request_digest !== record.request_digest
    ) {
      throw new ValidationError(
        'Semantic memory ingestion accepted intent evidence is mismatched'
      );
    }
    requiredDigest(accepted.payload?.policy_digest, 'accepted policy_digest');
    requiredDigest(accepted.payload?.invocation_digest, 'accepted invocation_digest');
    return accepted;
  }

  verifyCompletionEvent({ completion, intentId, traceId, record, accepted }) {
    const payload = assertPlainObject(
      completion.payload,
      'semantic memory ingestion completion payload'
    );
    const result = assertPlainObject(
      payload.result,
      'semantic memory ingestion completion result'
    );
    if (
      completion.subject !== intentId
      || payload.intent_id !== intentId
      || result.intent_id !== intentId
      || result.trace_id !== traceId
      || result.status !== 'completed'
    ) {
      throw new ValidationError('Semantic memory ingestion completion identity is mismatched');
    }
    assertSemanticMemoryIngestionResult(result.semantic_memory, record);
    const evidence = assertPlainObject(
      result.evidence,
      'semantic memory ingestion completion evidence'
    );
    if (
      evidence.invocation_digest !== accepted.payload.invocation_digest
      || evidence.policy_digest !== accepted.payload.policy_digest
    ) {
      throw new ValidationError(
        'Semantic memory ingestion completion evidence does not match the accepted intent'
      );
    }
    requiredDigest(evidence.plan_digest, 'semantic memory ingestion plan_digest');
    requiredDigest(evidence.execution_digest, 'semantic memory ingestion execution_digest');
  }

  verifySemanticMemoryIngestionHistory() {
    this.requireIntentEvidenceChain();
    const rows = this.db.prepare(`
      SELECT * FROM events
      WHERE kind = ?
      ORDER BY seq ASC
    `).all(SEMANTIC_MEMORY_STATE_EVENT);
    const seen = new Set();
    for (const row of rows) {
      const event = this.decodeEventRow(row);
      const record = normalizeSemanticMemoryProvenance(
        assertPlainObject(event.payload, 'semantic memory state payload').record
      );
      if (seen.has(record.object_id)) continue;
      seen.add(record.object_id);
      this.verifyPersistedInitialIngestion(event, record);
    }
    return Object.freeze({
      valid: true,
      schema: SEMANTIC_MEMORY_INGESTION_STORE_SCHEMA,
      initial_objects: seen.size
    });
  }

  verifyPersistedInitialIngestion(event, record) {
    if (event.actor !== record.owner) {
      throw new ValidationError('Persisted semantic memory ingestion actor is not the owner');
    }
    const intentId = requiredBinding(record.ingestion_intent_id, 'ingestion_intent_id');
    const expectedRequestDigest = semanticMemoryIngestionRequestDigest(record);
    if (record.request_digest !== expectedRequestDigest) {
      throw new ValidationError('Persisted semantic memory ingestion request binding is invalid');
    }
    const accepted = this.verifyAcceptedIngestionIntent({
      intentId,
      owner: record.owner,
      traceId: event.trace_id,
      record,
      allowedStatuses: new Set(['completed'])
    });
    const completionRow = this.db.prepare(`
      SELECT * FROM events WHERE seq = ?
    `).get(event.seq + 1);
    if (!completionRow) {
      throw new ValidationError(
        'Persisted semantic memory ingestion has no adjacent completion evidence'
      );
    }
    const completion = this.decodeEventRow(completionRow);
    if (
      completion.kind !== 'intent.completed'
      || completion.actor !== record.owner
      || completion.trace_id !== event.trace_id
    ) {
      throw new ValidationError(
        'Persisted semantic memory ingestion completion is not adjacent and owner-bound'
      );
    }
    this.verifyCompletionEvent({
      completion,
      intentId,
      traceId: event.trace_id,
      record,
      accepted
    });
  }
}

function requiredBinding(value, label) {
  return assertString(value, label, {
    min: 1,
    max: 160,
    pattern: /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/
  });
}

function requiredDigest(value, label) {
  return assertString(value, label, { min: 64, max: 64, pattern: DIGEST });
}
