import {
  AxiomError,
  ValidationError,
  assertPlainObject,
  canonicalJson
} from '../lib/canonical.mjs';
import { normalizeSemanticMemoryProvenance } from '../lib/semantic-memory-provenance.mjs';
import { GridStore } from './store.mjs';
import { verifySemanticMemoryReviewFromGrid } from './semantic-memory-review-evidence.mjs';
import { runSemanticMemoryStateMigrations } from './semantic-memory-state-migrations.mjs';

export const SEMANTIC_MEMORY_STATE_EVENT = 'memory.semantic.provenance.recorded';
export const SEMANTIC_MEMORY_STATE_STORE_SCHEMA = 'axiom-semantic-memory-state-store.v1';
export const SEMANTIC_MEMORY_CURRENT_EVIDENCE_SCHEMA =
  'axiom-semantic-memory-current-evidence.v1';

const CURRENT_STATE_EVIDENCE = new WeakSet();
const IMMUTABLE_RECORD_FIELDS = Object.freeze([
  'schema',
  'object_id',
  'owner',
  'content_digest',
  'origin_class',
  'origin_principal',
  'origin_runtime_id',
  'origin_artifact_digest',
  'semantic_class',
  'parent_object_id',
  'parent_content_digest',
  'parent_provenance_digest',
  'ingestion_intent_id',
  'request_digest',
  'may_affect_authority'
]);

export class SemanticMemoryStateGridStore extends GridStore {
  initialize() {
    this.semanticMemoryStateReady = false;
    this.semanticMemoryStateRebuildMode = false;
    this.prevalidatedSemanticReviewDigests = new Set();
    super.initialize();
    this.semanticMemoryStateMigrations = runSemanticMemoryStateMigrations(this.db);
    migrateProtectedState(this);
    this.semanticMemoryStateReady = true;
    this.rebuildSemanticMemoryState();
  }

  getStatus() {
    return {
      ...super.getStatus(),
      semantic_memory_state_store: Object.freeze({
        schema: SEMANTIC_MEMORY_STATE_STORE_SCHEMA,
        activation_state: 'opt-in-local-laboratory',
        schema_version: this.semanticMemoryStateMigrations?.version ?? 0,
        signed_event_authority: true,
        protected_materialized_state: true,
        currentness_verification: true,
        recursive_lineage_currentness: true,
        public_routes: false,
        provider_writes: false,
        prompt_composer_integration: false,
        downstream_effect_authority: false
      })
    };
  }

  migrateProtectedColumns() {
    super.migrateProtectedColumns();
    if (this.semanticMemoryStateReady) migrateProtectedState(this);
  }

  rebuildMaterializedState() {
    if (!this.semanticMemoryStateReady) return super.rebuildMaterializedState();
    this.db.exec('DELETE FROM semantic_memory_provenance_state');
    this.semanticMemoryStateRebuildMode = true;
    try {
      return super.rebuildMaterializedState();
    } finally {
      this.semanticMemoryStateRebuildMode = false;
    }
  }

  semanticMemorySourceRows() {
    return this.db.prepare(`
      SELECT * FROM events WHERE kind = ? ORDER BY seq
    `).all(SEMANTIC_MEMORY_STATE_EVENT);
  }

  semanticMemoryRecordFromSourceEvent(eventInput, actor) {
    const event = assertPlainObject(eventInput, 'semantic memory source event');
    if (event.kind !== SEMANTIC_MEMORY_STATE_EVENT) return null;
    return validateStateEvent(event, actor ?? event.actor);
  }

  rebuildSemanticMemoryState() {
    this.requireIntentEvidenceChain();
    const rows = this.semanticMemorySourceRows();
    this.semanticMemoryStateRebuildMode = true;
    try {
      this.transaction(() => {
        this.db.exec('DELETE FROM semantic_memory_provenance_state');
        for (const row of rows) {
          const event = this.decodeEventRow(row);
          const record = this.semanticMemoryRecordFromSourceEvent(event, event.actor);
          if (!record) continue;
          this.materializeSemanticMemoryRecord(event, record, {
            verifyReviewEvidence: true
          });
        }
      });
    } finally {
      this.semanticMemoryStateRebuildMode = false;
    }
  }

  appendEvents({ traceId, actor, events }) {
    const prevalidated = [];
    if (Array.isArray(events)) {
      const objectIds = new Set();
      for (const event of events) {
        const record = this.semanticMemoryRecordFromSourceEvent(event, actor);
        if (!record) continue;
        if (objectIds.has(record.object_id)) {
          throw new ValidationError(
            'A single append may contain at most one semantic memory state event per object'
          );
        }
        objectIds.add(record.object_id);
        this.validateSemanticMemoryTransition(record);
        if (hasExplicitReview(record)) {
          this.verifyRequiredReviewEvidence(record);
          this.prevalidatedSemanticReviewDigests.add(record.provenance_digest);
          prevalidated.push(record.provenance_digest);
        }
      }
    }

    try {
      return super.appendEvents({ traceId, actor, events });
    } finally {
      for (const digest of prevalidated) {
        this.prevalidatedSemanticReviewDigests.delete(digest);
      }
    }
  }

  applyMaterializedEvent(event) {
    super.applyMaterializedEvent(event);
    if (!this.semanticMemoryStateReady) return;
    const record = this.semanticMemoryRecordFromSourceEvent(event, event.actor);
    if (!record) return;
    this.materializeSemanticMemoryRecord(event, record, {
      verifyReviewEvidence: this.semanticMemoryStateRebuildMode
    });
  }

  recordSemanticMemoryProvenance({ traceId, actor, record }) {
    const normalized = normalizeSemanticMemoryProvenance(record);
    if (actor !== normalized.owner) {
      throw new ValidationError('Semantic memory state actor must equal record owner');
    }
    return this.appendEvents({
      traceId,
      actor,
      events: [{
        kind: SEMANTIC_MEMORY_STATE_EVENT,
        subject: normalized.object_id,
        payload: { record: normalized }
      }]
    });
  }

  getCurrentSemanticMemoryProvenance(owner, objectId, { verify = true } = {}) {
    if (verify) this.requireIntentEvidenceChain();
    const row = this.db.prepare(`
      SELECT * FROM semantic_memory_provenance_state
      WHERE owner = ? AND object_id = ?
    `).get(owner, objectId);
    if (!row) {
      throw new AxiomError(
        'semantic_memory_state_not_found',
        'Semantic memory current state was not found',
        404
      );
    }

    const record = normalizeSemanticMemoryProvenance(
      this.openJson(
        'semantic_memory_provenance_state',
        'record_json',
        row.object_id,
        row.record_json
      )
    );
    if (
      record.owner !== row.owner
      || record.object_id !== row.object_id
      || record.content_digest !== row.content_digest
      || record.provenance_digest !== row.provenance_digest
      || record.authority_tier !== row.authority_tier
      || record.review_state !== row.review_state
    ) {
      throw new ValidationError('Semantic memory materialized current state is inconsistent');
    }

    const eventRow = this.db.prepare(`
      SELECT * FROM events WHERE event_id = ? AND seq = ?
    `).get(row.source_event_id, row.source_seq);
    if (!eventRow) {
      throw new ValidationError('Semantic memory materialized state has no signed source event');
    }
    const event = this.decodeEventRow(eventRow);
    const eventRecord = this.semanticMemoryRecordFromSourceEvent(event, row.owner);
    if (
      !eventRecord
      || event.event_id !== row.source_event_id
      || event.seq !== row.source_seq
      || eventRecord.provenance_digest !== record.provenance_digest
      || canonicalJson(eventRecord) !== canonicalJson(record)
    ) {
      throw new ValidationError('Semantic memory signed source event does not match current state');
    }

    return Object.freeze({
      ...record,
      current_state_event_id: row.source_event_id,
      current_state_seq: row.source_seq,
      current_state_updated_at: row.updated_at
    });
  }

  verifySemanticMemoryCurrentState(record) {
    const normalized = normalizeSemanticMemoryProvenance(record);
    const current = this.getCurrentSemanticMemoryProvenance(
      normalized.owner,
      normalized.object_id,
      { verify: true }
    );
    if (current.provenance_digest !== normalized.provenance_digest) {
      throw new AxiomError(
        'semantic_memory_state_stale',
        'Semantic memory snapshot is not the current Grid provenance state',
        409
      );
    }
    this.assertSemanticMemoryLineageCurrent(normalized);

    const evidence = Object.freeze({
      schema: SEMANTIC_MEMORY_CURRENT_EVIDENCE_SCHEMA,
      owner: normalized.owner,
      object_id: normalized.object_id,
      content_digest: normalized.content_digest,
      provenance_digest: normalized.provenance_digest,
      source_event_id: current.current_state_event_id,
      source_seq: current.current_state_seq,
      downstream_effect_authorized: false
    });
    CURRENT_STATE_EVIDENCE.add(evidence);
    return evidence;
  }

  validateSemanticMemoryTransition(record) {
    const existingRow = this.db.prepare(`
      SELECT record_json, provenance_digest
      FROM semantic_memory_provenance_state
      WHERE object_id = ?
    `).get(record.object_id);

    if (!existingRow) {
      if (hasExplicitReview(record)) {
        throw new ValidationError(
          'A reviewed semantic memory state requires its exact predecessor in Grid state'
        );
      }
      this.assertSemanticMemoryLineageCurrent(record);
      return;
    }

    const current = normalizeSemanticMemoryProvenance(
      this.openJson(
        'semantic_memory_provenance_state',
        'record_json',
        record.object_id,
        existingRow.record_json
      )
    );
    if (current.provenance_digest === record.provenance_digest) {
      throw new AxiomError(
        'semantic_memory_state_noop',
        'Semantic memory state already has this exact provenance digest',
        409
      );
    }
    if (!hasExplicitReview(record)) {
      throw new ValidationError(
        'Existing semantic memory state may change only through an explicit review transition'
      );
    }
    if (record.reviewed_from_provenance_digest !== current.provenance_digest) {
      throw new AxiomError(
        'semantic_memory_state_predecessor_mismatch',
        'Semantic memory review does not extend the current provenance state',
        409
      );
    }
    assertImmutableRecordIdentity(current, record);
    this.assertSemanticMemoryLineageCurrent(record);
  }

  verifyRequiredReviewEvidence(record) {
    if (!hasExplicitReview(record)) return null;
    return verifySemanticMemoryReviewFromGrid(this, record);
  }

  assertSemanticMemoryLineageCurrent(record, seen = new Set()) {
    if (record.origin_class !== 'system-derived') return;
    if (seen.has(record.object_id)) {
      throw new ValidationError('Semantic memory derivation lineage contains a cycle');
    }
    const nextSeen = new Set(seen);
    nextSeen.add(record.object_id);

    const parent = this.getCurrentSemanticMemoryProvenance(
      record.owner,
      record.parent_object_id,
      { verify: false }
    );
    if (
      parent.content_digest !== record.parent_content_digest
      || parent.provenance_digest !== record.parent_provenance_digest
    ) {
      throw new AxiomError(
        'semantic_memory_parent_state_stale',
        'Derived semantic memory does not reference the current parent provenance state',
        409
      );
    }
    this.assertSemanticMemoryLineageCurrent(parent, nextSeen);
  }

  materializeSemanticMemoryState(
    event,
    { verifyReviewEvidence = false } = {}
  ) {
    const record = this.semanticMemoryRecordFromSourceEvent(event, event.actor);
    if (!record) {
      throw new ValidationError('Event is not a semantic memory provenance source');
    }
    return this.materializeSemanticMemoryRecord(event, record, {
      verifyReviewEvidence
    });
  }

  materializeSemanticMemoryRecord(
    event,
    recordInput,
    { verifyReviewEvidence = false } = {}
  ) {
    const record = normalizeSemanticMemoryProvenance(recordInput);
    this.validateSemanticMemoryTransition(record);
    if (hasExplicitReview(record)) {
      if (verifyReviewEvidence) {
        this.verifyRequiredReviewEvidence(record);
      } else if (!this.prevalidatedSemanticReviewDigests.has(record.provenance_digest)) {
        throw new ValidationError(
          'Reviewed semantic memory state was not prevalidated before live materialization'
        );
      }
    }

    const existing = this.db.prepare(`
      SELECT created_at FROM semantic_memory_provenance_state
      WHERE object_id = ?
    `).get(record.object_id);
    const createdAt = existing?.created_at ?? event.occurred_at;
    const protectedRecord = this.protectJson(
      'semantic_memory_provenance_state',
      'record_json',
      record.object_id,
      record
    );

    this.db.prepare(`
      INSERT INTO semantic_memory_provenance_state(
        object_id, owner, content_digest, provenance_digest,
        authority_tier, review_state, record_json,
        source_event_id, source_seq, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(object_id) DO UPDATE SET
        owner = excluded.owner,
        content_digest = excluded.content_digest,
        provenance_digest = excluded.provenance_digest,
        authority_tier = excluded.authority_tier,
        review_state = excluded.review_state,
        record_json = excluded.record_json,
        source_event_id = excluded.source_event_id,
        source_seq = excluded.source_seq,
        updated_at = excluded.updated_at
    `).run(
      record.object_id,
      record.owner,
      record.content_digest,
      record.provenance_digest,
      record.authority_tier,
      record.review_state,
      protectedRecord,
      event.event_id,
      event.seq,
      createdAt,
      event.occurred_at
    );
    return record;
  }
}

export function isVerifiedSemanticMemoryCurrentEvidence(value) {
  return Boolean(value && typeof value === 'object' && CURRENT_STATE_EVIDENCE.has(value));
}

function validateStateEvent(eventInput, actor) {
  const event = assertPlainObject(eventInput, 'semantic memory state event');
  if (event.kind !== SEMANTIC_MEMORY_STATE_EVENT) {
    throw new ValidationError('Semantic memory state event kind is invalid');
  }
  const payload = assertPlainObject(event.payload, 'semantic memory state payload');
  if (Object.keys(payload).length !== 1 || !('record' in payload)) {
    throw new ValidationError('Semantic memory state payload fields are invalid');
  }
  const record = normalizeSemanticMemoryProvenance(payload.record);
  if (actor !== record.owner) {
    throw new ValidationError('Semantic memory state event actor must equal record owner');
  }
  if (event.subject !== record.object_id) {
    throw new ValidationError('Semantic memory state event subject must equal record object_id');
  }
  return record;
}

function hasExplicitReview(record) {
  return typeof record.review_request_digest === 'string';
}

function assertImmutableRecordIdentity(current, next) {
  const currentIdentity = {};
  const nextIdentity = {};
  for (const field of IMMUTABLE_RECORD_FIELDS) {
    if (current[field] !== undefined) currentIdentity[field] = current[field];
    if (next[field] !== undefined) nextIdentity[field] = next[field];
  }
  if (canonicalJson(currentIdentity) !== canonicalJson(nextIdentity)) {
    throw new ValidationError(
      'Semantic memory review transition cannot rewrite content, origin, class, or lineage'
    );
  }
}

function migrateProtectedState(store) {
  const rows = store.db.prepare(`
    SELECT object_id, record_json FROM semantic_memory_provenance_state
  `).all();
  store.transaction(() => {
    for (const row of rows) {
      if (store.protector.isProtected(row.record_json)) {
        store.openJson(
          'semantic_memory_provenance_state',
          'record_json',
          row.object_id,
          row.record_json
        );
        continue;
      }
      let parsed;
      try {
        parsed = JSON.parse(row.record_json);
      } catch {
        throw new ValidationError(
          'Legacy semantic_memory_provenance_state.record_json is not valid JSON'
        );
      }
      store.db.prepare(`
        UPDATE semantic_memory_provenance_state
        SET record_json = ? WHERE object_id = ?
      `).run(
        store.protectJson(
          'semantic_memory_provenance_state',
          'record_json',
          row.object_id,
          parsed
        ),
        row.object_id
      );
    }
  });
}
