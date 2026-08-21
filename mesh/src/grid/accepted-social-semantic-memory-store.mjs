import { ValidationError } from '../lib/canonical.mjs';
import { AcceptedSocialGridStore } from './accepted-social-store.mjs';
import { reencryptGridProtectedColumns } from './store.mjs';
import {
  SEMANTIC_MEMORY_STATE_EVENT,
  SemanticMemoryStateGridStore
} from './semantic-memory-state-store.mjs';
import { SemanticMemoryIngestionGridStore } from './semantic-memory-ingestion-store.mjs';
import { SemanticMemoryContentGridStore } from './semantic-memory-content-store.mjs';
import {
  ConvergedSemanticMemoryGridStore
} from './semantic-memory-converged-ingestion-store.mjs';
import {
  SEMANTIC_MEMORY_SOURCE_EVENT,
  verifySemanticMemorySourceEvidenceHistory
} from './semantic-memory-source-evidence-ledger.mjs';
import {
  isSemanticMemoryPutCandidate
} from './semantic-memory-native-ingestion.mjs';
import { runSemanticMemoryStateMigrations } from './semantic-memory-state-migrations.mjs';

export const ACCEPTED_SOCIAL_SEMANTIC_MEMORY_COMPOSITION_SCHEMA =
  'axiom-accepted-social-semantic-memory-composition.v1';

const LIFECYCLE_METHODS = new Set([
  'constructor',
  'initialize',
  'getStatus',
  'migrateProtectedColumns',
  'rebuildMaterializedState',
  'appendEvents',
  'applyMaterializedEvent'
]);

export class AcceptedSocialSemanticMemoryGridStore extends AcceptedSocialGridStore {
  initialize() {
    this.semanticMemoryStateReady = false;
    this.semanticMemoryStateRebuildMode = false;
    this.semanticMemoryIngestionReady = false;
    this.semanticMemoryContentReady = false;
    this.convergedSemanticMemoryReady = false;
    this.prevalidatedSemanticReviewDigests = new Set();

    super.initialize();

    this.semanticMemoryStateMigrations = runSemanticMemoryStateMigrations(this.db);
    this.semanticMemoryStateReady = true;
    // Reuse the already-green semantic protected-state migrator. Its lexical
    // super repeats only the idempotent core protected-column pass; accepted
    // social/remote protected columns were already migrated by super.initialize().
    SemanticMemoryStateGridStore.prototype.migrateProtectedColumns.call(this);
    this.rebuildSemanticMemoryState();

    this.semanticMemoryIngestionReady = true;
    this.verifySemanticMemoryIngestionHistory();

    this.semanticMemoryContentReady = true;
    this.verifySemanticMemoryContentHistory();

    this.convergedSemanticMemoryReady = true;
    verifySemanticMemorySourceEvidenceHistory(this);
    this.verifyConvergedSemanticMemoryHistory();
  }

  getStatus() {
    const social = super.getStatus();
    const semantic = ConvergedSemanticMemoryGridStore.prototype.getStatus.call(this);
    return {
      ...social,
      ...semantic,
      accepted_social_semantic_memory_composition: Object.freeze({
        schema: ACCEPTED_SOCIAL_SEMANTIC_MEMORY_COMPOSITION_SCHEMA,
        activation_state: 'opt-in-local-laboratory',
        one_grid_store: true,
        one_sqlite_database: true,
        one_signed_evidence_chain: true,
        accepted_social_storage_preserved: true,
        converged_semantic_memory_included: true,
        composed_offline_rotation_helper: true,
        production_rotation_cli_wired: false,
        social_network_egress: false,
        social_transport_included: false,
        semantic_public_routes: false,
        public_mutation_routes_added: false,
        production_store_selected: false,
        capability_registry_promoted: false,
        downstream_effect_authority: false,
        propagation_authority: false
      })
    };
  }

  migrateProtectedColumns() {
    super.migrateProtectedColumns();
    if (this.semanticMemoryStateReady) {
      SemanticMemoryStateGridStore.prototype.migrateProtectedColumns.call(this);
    }
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

  appendEvents(args) {
    const events = args?.events;
    if (!Array.isArray(events)) return super.appendEvents(args);

    const hasSourceEvent = events.some(event => event?.kind === SEMANTIC_MEMORY_SOURCE_EVENT);
    const hasStateEvent = events.some(event => event?.kind === SEMANTIC_MEMORY_STATE_EVENT);
    const hasSemanticPut = events.some(event => isSemanticMemoryPutCandidate(event));

    if (hasStateEvent && events.some(event => event?.kind !== SEMANTIC_MEMORY_STATE_EVENT)) {
      throw new ValidationError(
        'Semantic state transitions cannot be batched with another Grid domain'
      );
    }
    if (hasSourceEvent || hasStateEvent || hasSemanticPut) {
      return ConvergedSemanticMemoryGridStore.prototype.appendEvents.call(this, args);
    }
    return super.appendEvents(args);
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
}

export function reencryptAcceptedSocialSemanticMemoryProtectedColumns({
  db,
  sourceProtector,
  targetProtector
}) {
  if (!db || !sourceProtector || !targetProtector) {
    throw new ValidationError('Composed Grid re-encryption dependencies are missing');
  }

  const base = reencryptGridProtectedColumns({
    db,
    sourceProtector,
    targetProtector
  });
  const tableExists = Boolean(db.prepare(`
    SELECT 1 FROM sqlite_master
    WHERE type = 'table' AND name = 'semantic_memory_provenance_state'
  `).get());
  let semanticValues = 0;

  if (tableExists) {
    db.exec('BEGIN IMMEDIATE');
    try {
      const rows = db.prepare(`
        SELECT object_id, record_json FROM semantic_memory_provenance_state
      `).all();
      for (const row of rows) {
        if (row.record_json === null || row.record_json === undefined) continue;
        const context =
          `axiom:semantic_memory_provenance_state.record_json:${row.object_id}`;
        const value = sourceProtector.open(row.record_json, context);
        const reencrypted = targetProtector.seal(value, context);
        targetProtector.open(reencrypted, context);
        db.prepare(`
          UPDATE semantic_memory_provenance_state
          SET record_json = ? WHERE object_id = ?
        `).run(reencrypted, row.object_id);
        semanticValues += 1;
      }
      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  }

  return Object.freeze({
    ...base,
    protected_values: Number(base.protected_values ?? 0) + semanticValues,
    tables: Object.freeze({
      ...(base.tables ?? {}),
      semantic_memory_provenance_state: semanticValues
    })
  });
}

installSemanticMethods(AcceptedSocialSemanticMemoryGridStore, [
  SemanticMemoryStateGridStore,
  SemanticMemoryIngestionGridStore,
  SemanticMemoryContentGridStore,
  ConvergedSemanticMemoryGridStore
]);

function installSemanticMethods(Target, Sources) {
  for (const Source of Sources) {
    for (const name of Reflect.ownKeys(Source.prototype)) {
      if (LIFECYCLE_METHODS.has(name)) continue;
      const descriptor = Object.getOwnPropertyDescriptor(Source.prototype, name);
      if (!descriptor) continue;
      Object.defineProperty(Target.prototype, name, descriptor);
    }
  }
}
