import {
  AxiomError,
  ValidationError,
  assertPlainObject,
  assertString,
  canonicalJson,
  newId
} from '../lib/canonical.mjs';
import { SovereignInformationGridStore } from './sovereign-information-store.mjs';
import {
  assertInformationAccessDecisionBinds,
  validateInformationAccessDecision
} from '../domain/information-access-decision.mjs';
import {
  assertIsoTimestamp,
  assertNoUnknownKeys,
  assertReference
} from '../domain/sovereign-information-common.mjs';
import {
  buildSovereignInformationBundle,
  validateSovereignInformationBundle
} from '../lib/sovereign-information-portability.mjs';

const IMPORT_EVENT = 'siea.import.staged';
const IMPORT_PAYLOAD_KEYS = new Set(['import_id', 'principal', 'bundle', 'diff', 'authorization']);
const AUTHORIZATION_KEYS = new Set(['authority_ref', 'verifier_ref']);
const STORAGE_ID = /^siea_[A-Za-z0-9-]{8,100}$/;

function logicalReference(kind, object) {
  switch (kind) {
    case 'information-rights': return object.object_ref;
    case 'evidence-assertion': return object.assertion_id;
    case 'evidence-link': return object.link_id;
    case 'evidence-review': return object.object_ref;
    case 'delegated-gate-mandate': return object.mandate_id;
    default: throw new ValidationError('unsupported sovereign information object kind');
  }
}

function validateAuthorization(value) {
  assertPlainObject(value, 'SIEA import authorization');
  assertNoUnknownKeys(value, 'SIEA import authorization', AUTHORIZATION_KEYS);
  assertReference(value.authority_ref, 'SIEA import authorization.authority_ref');
  assertReference(value.verifier_ref, 'SIEA import authorization.verifier_ref');
  return value;
}

function unavailable() {
  throw new AxiomError('siea_object_unavailable', 'Sovereign information object unavailable', 404);
}

export class SovereignInformationPortabilityGridStore extends SovereignInformationGridStore {
  constructor({ importVerifier, ...options }) {
    super(options);
    this.sieaImportVerifier = typeof importVerifier === 'function' ? importVerifier : null;
  }

  appendEvents({ traceId, actor, events }) {
    const prepared = Array.isArray(events)
      ? events.map(event => event?.kind === IMPORT_EVENT ? this.prepareImportEvent(actor, event) : event)
      : events;
    return super.appendEvents({ traceId, actor, events: prepared });
  }

  applyMaterializedEvent(event) {
    if (event.kind === IMPORT_EVENT) return this.applyQuarantinedImport(event);
    return super.applyMaterializedEvent(event);
  }

  exportSovereignInformation({ requester, purpose, decisions, now, createdAt = now }) {
    assertReference(requester, 'requester');
    assertString(purpose, 'purpose', { max: 256 });
    assertIsoTimestamp(now, 'now');
    assertIsoTimestamp(createdAt, 'createdAt');
    if (!this.informationAccessDecisionVerifier) {
      throw new ValidationError('SIEA access-decision verifier is unavailable');
    }
    if (!Array.isArray(decisions) || decisions.length > 100) {
      throw new ValidationError('export decisions must be an array with at most 100 items');
    }
    const rows = this.decodeAllSieaRows();
    const selected = [];
    const seen = new Set();
    for (const rawDecision of decisions) {
      let decision;
      try {
        decision = validateInformationAccessDecision(rawDecision);
        if (decision.right !== 'export') unavailable();
        const verification = this.informationAccessDecisionVerifier(decision, {
          requester,
          object_ref: decision.object_ref,
          purpose,
          right: 'export',
          now
        });
        assertPlainObject(verification, 'SIEA access-decision verification');
        if (verification.valid !== true) unavailable();
      } catch (error) {
        if (error instanceof AxiomError && error.code === 'siea_object_unavailable') throw error;
        unavailable();
      }
      const matches = rows.filter(row => (
        logicalReference(row.object_kind, row.object) === decision.object_ref
        && row.object_digest === decision.object_digest
      ));
      if (matches.length !== 1) unavailable();
      const row = matches[0];
      try {
        assertInformationAccessDecisionBinds(decision, {
          requester,
          object_ref: decision.object_ref,
          purpose,
          right: 'export',
          object_digest: row.object_digest
        }, { now });
      } catch {
        unavailable();
      }
      if (seen.has(row.storage_id)) continue;
      seen.add(row.storage_id);
      const provenance = this.db.prepare(`
        SELECT event_id FROM events
        WHERE subject = ? AND kind LIKE 'siea.%'
        ORDER BY seq
      `).all(row.storage_id).map(item => `evt:${item.event_id}`);
      selected.push({
        storage_id: row.storage_id,
        object_kind: row.object_kind,
        object: row.object,
        object_digest: row.object_digest,
        lifecycle_status: row.lifecycle_status,
        provenance_event_refs: provenance
      });
    }
    return buildSovereignInformationBundle({ exporter: requester, records: selected, created_at: createdAt });
  }

  dryRunSovereignInformationImport({ principal, bundle }) {
    assertReference(principal, 'principal');
    const validated = validateSovereignInformationBundle(bundle);
    const localRows = this.decodeAllSieaRows();
    const summary = { new: 0, duplicates: 0, conflicts: 0, records: [] };
    for (const record of validated.records) {
      const ref = logicalReference(record.object_kind, record.object);
      const byLogicalRef = localRows.filter(row => (
        row.object_kind === record.object_kind
        && logicalReference(row.object_kind, row.object) === ref
      ));
      const byStorageId = localRows.find(row => row.storage_id === record.storage_id);
      let disposition = 'non-authoritative-import';
      if (byLogicalRef.length > 1) disposition = 'conflict';
      else if (byLogicalRef.length === 1) {
        disposition = byLogicalRef[0].object_digest === record.object_digest ? 'duplicate' : 'conflict';
      } else if (byStorageId) disposition = 'conflict';
      if (disposition === 'conflict') summary.conflicts += 1;
      else if (disposition === 'duplicate') summary.duplicates += 1;
      else summary.new += 1;
      summary.records.push({
        storage_id: record.storage_id,
        object_kind: record.object_kind,
        object_ref: ref,
        object_digest: record.object_digest,
        disposition
      });
    }
    return summary;
  }

  stageSovereignInformationImport({ actor, traceId, bundle }) {
    assertReference(actor, 'actor');
    if (!this.sieaImportVerifier) {
      throw new ValidationError('SIEA import verifier is unavailable');
    }
    const validated = validateSovereignInformationBundle(bundle);
    const diff = this.dryRunSovereignInformationImport({ principal: actor, bundle: validated });
    if (diff.conflicts > 0) {
      throw new AxiomError('siea_import_conflict', 'Sovereign information import contains conflicts', 409, { conflicts: diff.conflicts });
    }
    const verification = this.sieaImportVerifier({
      actor,
      operation: IMPORT_EVENT,
      exporter: validated.exporter,
      bundle_digest: validated.bundle_digest,
      record_count: validated.records.length
    });
    assertPlainObject(verification, 'SIEA import verification');
    if (verification.allowed !== true) {
      throw new AxiomError('siea_import_denied', 'Sovereign information import staging was denied', 403);
    }
    const authorization = validateAuthorization({
      authority_ref: verification.authority_ref,
      verifier_ref: verification.verifier_ref
    });
    const importId = newId('sieaimport');
    const appended = this.appendEvents({
      traceId,
      actor,
      events: [{
        kind: IMPORT_EVENT,
        subject: importId,
        payload: { import_id: importId, principal: actor, bundle: validated, diff, authorization }
      }]
    });
    return appended[0];
  }

  prepareImportEvent(actor, event) {
    assertPlainObject(event, 'SIEA import event');
    const payload = assertPlainObject(event.payload, 'SIEA import event payload');
    assertNoUnknownKeys(payload, 'SIEA import event payload', IMPORT_PAYLOAD_KEYS);
    assertString(payload.import_id, 'import_id', { max: 160, pattern: /^sieaimport_[A-Za-z0-9-]{8,100}$/ });
    if (payload.principal !== actor) throw new ValidationError('SIEA import principal must match actor');
    assertReference(payload.principal, 'SIEA import principal');
    const bundle = validateSovereignInformationBundle(payload.bundle);
    const expectedDiff = this.dryRunSovereignInformationImport({ principal: actor, bundle });
    if (canonicalJson(payload.diff) !== canonicalJson(expectedDiff)) {
      throw new ValidationError('SIEA import dry-run summary changed before staging');
    }
    validateAuthorization(payload.authorization);
    return {
      kind: IMPORT_EVENT,
      subject: payload.import_id,
      payload: { ...payload, bundle, diff: expectedDiff },
      ...(event.event_id ? { event_id: event.event_id } : {})
    };
  }

  applyQuarantinedImport(event) {
    const payload = assertPlainObject(event.payload, 'SIEA import event payload');
    assertNoUnknownKeys(payload, 'SIEA import event payload', IMPORT_PAYLOAD_KEYS);
    const bundle = validateSovereignInformationBundle(payload.bundle);
    validateAuthorization(payload.authorization);
    if (this.db.prepare('SELECT 1 FROM imports WHERE import_id = ?').get(payload.import_id)) {
      throw new ValidationError('SIEA import identifier already exists');
    }
    const manifest = {
      schema: bundle.schema,
      exporter: bundle.exporter,
      created_at: bundle.created_at,
      bundle_digest: bundle.bundle_digest,
      non_claims: bundle.non_claims,
      authority_effect: 'none',
      trust_state: 'unverified-source-quarantine'
    };
    this.db.prepare(`
      INSERT INTO imports(
        import_id, principal, source_principal, source_signer, bundle_digest,
        manifest_json, diff_json, status, staged_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 'siea-quarantined', ?)
    `).run(
      payload.import_id,
      payload.principal,
      bundle.exporter,
      'unverified:siea-bundle',
      bundle.bundle_digest,
      this.protectJson('imports', 'manifest_json', payload.import_id, manifest),
      this.protectJson('imports', 'diff_json', payload.import_id, payload.diff),
      event.occurred_at
    );
    for (const record of bundle.records) {
      const summary = payload.diff.records.find(item => item.storage_id === record.storage_id && item.object_kind === record.object_kind);
      if (!summary) throw new ValidationError('SIEA import record lacks dry-run disposition');
      const key = `${payload.import_id}:siea:${record.object_kind}:${record.storage_id}`;
      this.db.prepare(`
        INSERT INTO import_records(
          import_id, record_key, record_type, record_digest, record_json, disposition
        ) VALUES (?, ?, ?, ?, ?, ?)
      `).run(
        payload.import_id,
        record.storage_id,
        `siea:${record.object_kind}`,
        record.object_digest,
        this.protectJson('import_records', 'record_json', key, record),
        summary.disposition === 'duplicate' ? 'duplicate' : 'non-authoritative-import'
      );
    }
  }

  listQuarantinedSovereignInformationImports(principal) {
    assertReference(principal, 'principal');
    return this.db.prepare(`
      SELECT * FROM imports
      WHERE principal = ? AND status = 'siea-quarantined'
      ORDER BY staged_at DESC
    `).all(principal).map(row => {
      const manifest = this.openJson('imports', 'manifest_json', row.import_id, row.manifest_json);
      const diff = this.openJson('imports', 'diff_json', row.import_id, row.diff_json);
      const records = this.db.prepare(`
        SELECT * FROM import_records WHERE import_id = ? ORDER BY record_type, record_key
      `).all(row.import_id).map(record => {
        const key = `${record.import_id}:${record.record_type}:${record.record_key}`;
        return {
          record_type: record.record_type,
          record_key: record.record_key,
          record_digest: record.record_digest,
          disposition: record.disposition,
          record: this.openJson('import_records', 'record_json', key, record.record_json)
        };
      });
      return {
        import_id: row.import_id,
        principal: row.principal,
        source_principal: row.source_principal,
        bundle_digest: row.bundle_digest,
        status: row.status,
        staged_at: row.staged_at,
        manifest,
        diff,
        records
      };
    });
  }

  decodeAllSieaRows() {
    return this.db.prepare('SELECT * FROM siea_objects ORDER BY created_at, storage_id').all().map(row => ({
      ...row,
      object: this.openJson('siea_objects', 'object_json', row.storage_id, row.object_json)
    }));
  }
}
