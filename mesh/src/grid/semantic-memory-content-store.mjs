import {
  AxiomError,
  ValidationError,
  assertPlainObject
} from '../lib/canonical.mjs';
import {
  SEMANTIC_MEMORY_CONTENT_KIND,
  assertSemanticMemoryContentResult,
  semanticMemoryContentAddress,
  validateSemanticMemoryContentPayload
} from '../lib/semantic-memory-content.mjs';
import {
  SEMANTIC_MEMORY_STATE_EVENT
} from './semantic-memory-state-store.mjs';
import { SemanticMemoryIngestionGridStore } from './semantic-memory-ingestion-store.mjs';

export const SEMANTIC_MEMORY_CONTENT_STORE_SCHEMA =
  'axiom-semantic-memory-content-store.v1';

export class SemanticMemoryContentGridStore extends SemanticMemoryIngestionGridStore {
  initialize() {
    this.semanticMemoryContentReady = false;
    super.initialize();
    this.semanticMemoryContentReady = true;
    this.verifySemanticMemoryContentHistory();
  }

  getStatus() {
    return {
      ...super.getStatus(),
      semantic_memory_content: Object.freeze({
        schema: SEMANTIC_MEMORY_CONTENT_STORE_SCHEMA,
        activation_state: 'opt-in-local-laboratory',
        atomic_content_provenance_binding: true,
        existing_memory_graph_storage_reused: true,
        signed_memory_put_is_initial_source: true,
        encrypted_memory_object_required: true,
        active_content_required_for_current_use: true,
        historical_replay_preserves_later_tombstones: true,
        provenance_only_initial_state_allowed: false,
        semantic_content_without_provenance_allowed: false,
        preexisting_content_adoption_allowed: false,
        provider_direct_write_authority: false,
        sandbox_tool_wired: false,
        gateway_route_wired: false,
        capability_registry_promoted: false,
        downstream_effect_authority: false,
        propagation_authority: false
      })
    };
  }

  semanticMemorySourceRows() {
    return this.db.prepare(`
      SELECT * FROM events
      WHERE kind IN ('memory.put', ?)
      ORDER BY seq ASC
    `).all(SEMANTIC_MEMORY_STATE_EVENT);
  }

  semanticMemoryRecordFromSourceEvent(eventInput, actor) {
    const event = assertPlainObject(eventInput, 'semantic memory content source event');
    if (event.kind === 'memory.put') {
      const payload = assertPlainObject(event.payload, 'memory.put payload');
      const hasProvenance = Object.prototype.hasOwnProperty.call(
        payload,
        'semantic_provenance'
      );
      if (payload.kind === SEMANTIC_MEMORY_CONTENT_KIND) {
        if (!hasProvenance) {
          throw new ValidationError(
            'semantic.memory content requires semantic_provenance in the same signed memory.put event'
          );
        }
        return validateSemanticMemoryContentPayload(payload, {
          actor: actor ?? event.actor,
          subject: event.subject
        }).record;
      }
      if (hasProvenance) {
        throw new ValidationError(
          'semantic_provenance is allowed only on semantic.memory content'
        );
      }
      return null;
    }
    return super.semanticMemoryRecordFromSourceEvent(event, actor ?? event.actor);
  }

  appendEvents({ traceId, actor, events }) {
    if (this.semanticMemoryContentReady && Array.isArray(events)) {
      for (let index = 0; index < events.length; index += 1) {
        const event = events[index];
        if (event?.kind === SEMANTIC_MEMORY_STATE_EVENT) {
          const record = this.semanticMemoryRecordFromSourceEvent(event, actor);
          const existing = this.db.prepare(`
            SELECT 1 FROM semantic_memory_provenance_state WHERE object_id = ?
          `).get(record.object_id);
          if (!existing) {
            throw new ValidationError(
              'Initial semantic memory provenance must be carried by the same signed semantic memory.put that persists content'
            );
          }
          continue;
        }
        if (event?.kind !== 'memory.put') continue;
        const payload = assertPlainObject(event.payload, 'memory.put payload');
        if (
          payload.kind !== SEMANTIC_MEMORY_CONTENT_KIND
          && !Object.prototype.hasOwnProperty.call(payload, 'semantic_provenance')
        ) {
          continue;
        }

        const { record } = validateSemanticMemoryContentPayload(payload, {
          actor,
          subject: event.subject
        });
        const existingContent = this.db.prepare(`
          SELECT status FROM memory_objects WHERE object_id = ?
        `).get(record.object_id);
        if (existingContent) {
          throw new AxiomError(
            'semantic_memory_content_preexists',
            'Semantic memory content already exists and cannot acquire provenance after the fact',
            409
          );
        }
        const existingProvenance = this.db.prepare(`
          SELECT 1 FROM semantic_memory_provenance_state WHERE object_id = ?
        `).get(record.object_id);
        if (existingProvenance) {
          throw new AxiomError(
            'semantic_memory_provenance_preexists',
            'Semantic memory provenance already exists for this content address',
            409
          );
        }
        this.verifyLiveSemanticMemoryIngestionCommit({
          traceId,
          actor,
          events,
          stateIndex: index,
          record
        });
      }
    }
    return super.appendEvents({ traceId, actor, events });
  }

  verifyCompletionEvent(args) {
    super.verifyCompletionEvent(args);
    const result = assertPlainObject(
      args.completion.payload?.result,
      'semantic memory content completion result'
    );
    assertSemanticMemoryContentResult(
      result.semantic_memory_content,
      args.record
    );
  }

  getCurrentSemanticMemoryProvenance(owner, objectId, options = {}) {
    const {
      requireActiveContent = !this.semanticMemoryStateRebuildMode,
      ...provenanceOptions
    } = options;
    const current = super.getCurrentSemanticMemoryProvenance(
      owner,
      objectId,
      provenanceOptions
    );
    this.assertMaterializedSemanticMemoryContent(current, {
      requireActive: requireActiveContent
    });
    return current;
  }

  assertMaterializedSemanticMemoryContent(record, { requireActive = true } = {}) {
    const row = this.db.prepare(`
      SELECT object_id, owner, kind, content_digest, payload_json, status
      FROM memory_objects WHERE object_id = ?
    `).get(record.object_id);
    if (!row) {
      throw new AxiomError(
        'semantic_memory_content_missing',
        'Semantic provenance has no matching durable memory object',
        409
      );
    }
    if (
      row.owner !== record.owner
      || row.kind !== SEMANTIC_MEMORY_CONTENT_KIND
      || row.content_digest !== record.content_digest
    ) {
      throw new ValidationError(
        'Semantic memory materialized content identity does not match provenance'
      );
    }
    const payload = this.openJson(
      'memory_objects',
      'payload_json',
      row.object_id,
      row.payload_json
    );
    const address = semanticMemoryContentAddress({
      owner: row.owner,
      content: payload.content,
      metadata: payload.metadata
    });
    if (
      address.object_id !== row.object_id
      || address.content_digest !== row.content_digest
      || address.object_id !== record.object_id
      || address.content_digest !== record.content_digest
    ) {
      throw new ValidationError(
        'Semantic memory encrypted content no longer matches its content address or provenance'
      );
    }
    if (requireActive && row.status !== 'active') {
      throw new AxiomError(
        'semantic_memory_content_inactive',
        'Semantic memory content is not active and cannot be used as current context',
        409
      );
    }
    return Object.freeze({
      object_id: row.object_id,
      content_digest: row.content_digest,
      status: row.status
    });
  }

  verifySemanticMemoryContentHistory() {
    this.requireIntentEvidenceChain();
    const rows = this.semanticMemorySourceRows();
    const firstSource = new Map();
    for (const row of rows) {
      const event = this.decodeEventRow(row);
      const record = this.semanticMemoryRecordFromSourceEvent(event, event.actor);
      if (!record || firstSource.has(record.object_id)) continue;
      firstSource.set(record.object_id, event.kind);
      if (event.kind !== 'memory.put') {
        throw new ValidationError(
          'Semantic memory history must begin with an atomic semantic memory.put content/provenance source'
        );
      }
      this.assertMaterializedSemanticMemoryContent(record, { requireActive: false });
    }

    const materialized = this.db.prepare(`
      SELECT object_id FROM memory_objects WHERE kind = ?
    `).all(SEMANTIC_MEMORY_CONTENT_KIND);
    for (const row of materialized) {
      if (!firstSource.has(row.object_id)) {
        throw new ValidationError(
          'Materialized semantic.memory content has no signed semantic provenance source'
        );
      }
    }

    return Object.freeze({
      valid: true,
      schema: SEMANTIC_MEMORY_CONTENT_STORE_SCHEMA,
      semantic_objects: firstSource.size
    });
  }
}
