import {
  AxiomError,
  ValidationError,
  assertPlainObject,
  assertString,
  digestObject,
  newId
} from '../lib/canonical.mjs';
import { GridStore } from './store.mjs';
import { runSovereignInformationMigrations } from './sovereign-information-migrations.mjs';
import {
  assertIsoTimestamp,
  assertNoUnknownKeys,
  assertReference
} from '../domain/sovereign-information-common.mjs';
import { validateInformationRightsEnvelope } from '../domain/information-rights.mjs';
import {
  validateEvidenceAssertion,
  validateEvidenceLink,
  validateEvidenceReviewState
} from '../domain/evidence-graph.mjs';
import { validateDelegatedGateMandate } from '../domain/delegated-gate-mandate.mjs';
import {
  assertInformationAccessDecisionBinds,
  validateInformationAccessDecision
} from '../domain/information-access-decision.mjs';

const OBJECT_KINDS = new Set([
  'information-rights',
  'evidence-assertion',
  'evidence-link',
  'evidence-review',
  'delegated-gate-mandate'
]);

const EVENT_TO_KIND = new Map([
  ['siea.information-rights.recorded', 'information-rights'],
  ['siea.evidence-assertion.recorded', 'evidence-assertion'],
  ['siea.evidence-link.recorded', 'evidence-link'],
  ['siea.evidence-review.recorded', 'evidence-review'],
  ['siea.delegated-mandate.recorded', 'delegated-gate-mandate']
]);
const KIND_TO_EVENT = new Map([...EVENT_TO_KIND.entries()].map(([eventKind, objectKind]) => [objectKind, eventKind]));
const MANDATE_REVOKED_EVENT = 'siea.delegated-mandate.revoked';

const PAYLOAD_KEYS = new Set([
  'storage_id',
  'object_kind',
  'object',
  'object_digest',
  'lifecycle_status',
  'authorization'
]);
const REVOCATION_PAYLOAD_KEYS = new Set([
  'storage_id',
  'mandate_id',
  'revoked_at',
  'reason',
  'authorization'
]);
const AUTHORIZATION_KEYS = new Set(['authority_ref', 'verifier_ref']);
const LIFECYCLE = new Set(['active', 'revoked', 'expired', 'superseded']);
const HEX_64 = /^[a-f0-9]{64}$/;
const STORAGE_ID = /^siea_[A-Za-z0-9-]{8,100}$/;
const READ_RIGHTS = new Set(['inspect-metadata', 'inspect-full-content']);

function validateStorageId(value, name = 'storage_id') {
  return assertString(value, name, { max: 160, pattern: STORAGE_ID });
}

function validateObject(kind, object) {
  switch (kind) {
    case 'information-rights': return validateInformationRightsEnvelope(object);
    case 'evidence-assertion': return validateEvidenceAssertion(object);
    case 'evidence-link': return validateEvidenceLink(object);
    case 'evidence-review': return validateEvidenceReviewState(object);
    case 'delegated-gate-mandate': return validateDelegatedGateMandate(object);
    default: throw new ValidationError('unsupported sovereign information object kind');
  }
}

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

function immutableKind(kind) {
  return kind === 'evidence-assertion'
    || kind === 'evidence-link'
    || kind === 'delegated-gate-mandate';
}

function validateAuthorization(value) {
  assertPlainObject(value, 'SIEA mutation authorization');
  assertNoUnknownKeys(value, 'SIEA mutation authorization', AUTHORIZATION_KEYS);
  assertReference(value.authority_ref, 'SIEA mutation authorization.authority_ref');
  assertReference(value.verifier_ref, 'SIEA mutation authorization.verifier_ref');
  return value;
}

function validateMaterializedPayload(kind, payload) {
  assertPlainObject(payload, 'SIEA event payload');
  assertNoUnknownKeys(payload, 'SIEA event payload', PAYLOAD_KEYS);
  validateStorageId(payload.storage_id, 'SIEA event payload.storage_id');
  if (!OBJECT_KINDS.has(payload.object_kind) || payload.object_kind !== kind) {
    throw new ValidationError('SIEA event object kind does not match event kind');
  }
  const object = validateObject(kind, payload.object);
  const digest = digestObject(object);
  if (typeof payload.object_digest !== 'string' || !HEX_64.test(payload.object_digest) || payload.object_digest !== digest) {
    throw new ValidationError('SIEA event object digest is invalid');
  }
  if (!LIFECYCLE.has(payload.lifecycle_status)) {
    throw new ValidationError('SIEA event lifecycle status is invalid');
  }
  validateAuthorization(payload.authorization);
  return payload;
}

function validateRevocationPayload(payload) {
  assertPlainObject(payload, 'SIEA mandate revocation payload');
  assertNoUnknownKeys(payload, 'SIEA mandate revocation payload', REVOCATION_PAYLOAD_KEYS);
  validateStorageId(payload.storage_id, 'SIEA mandate revocation payload.storage_id');
  assertReference(payload.mandate_id, 'SIEA mandate revocation payload.mandate_id');
  assertIsoTimestamp(payload.revoked_at, 'SIEA mandate revocation payload.revoked_at');
  assertString(payload.reason, 'SIEA mandate revocation payload.reason', { max: 512 });
  validateAuthorization(payload.authorization);
  return payload;
}

function unavailable() {
  throw new AxiomError('siea_object_unavailable', 'Sovereign information object unavailable', 404);
}

export class SovereignInformationGridStore extends GridStore {
  initialize() {
    this.sieaReady = false;
    super.initialize();
    this.sieaMigrations = runSovereignInformationMigrations(this.db);
    this.migrateSovereignInformationProtectedColumns();
    this.sieaReady = true;
    this.rebuildSovereignInformationMaterializedState();
  }

  constructor({ mutationVerifier, informationAccessDecisionVerifier, ...options }) {
    super(options);
    this.sieaMutationVerifier = typeof mutationVerifier === 'function' ? mutationVerifier : null;
    this.informationAccessDecisionVerifier = typeof informationAccessDecisionVerifier === 'function'
      ? informationAccessDecisionVerifier
      : null;
  }

  getStatus() {
    return {
      ...super.getStatus(),
      sovereign_information_schema_version: this.sieaMigrations?.version ?? 0
    };
  }

  migrateProtectedColumns() {
    super.migrateProtectedColumns();
    if (this.sieaReady) this.migrateSovereignInformationProtectedColumns();
  }

  migrateSovereignInformationProtectedColumns() {
    this.transaction(() => {
      const rows = this.db.prepare('SELECT storage_id, object_json FROM siea_objects').all();
      for (const row of rows) {
        if (this.protector.isProtected(row.object_json)) {
          this.openJson('siea_objects', 'object_json', row.storage_id, row.object_json);
          continue;
        }
        let value;
        try {
          value = JSON.parse(row.object_json);
        } catch {
          throw new ValidationError('Legacy siea_objects.object_json value is not valid JSON');
        }
        this.db.prepare('UPDATE siea_objects SET object_json = ? WHERE storage_id = ?').run(
          this.protectJson('siea_objects', 'object_json', row.storage_id, value),
          row.storage_id
        );
      }
    });
  }

  rebuildMaterializedState() {
    if (!this.sieaReady) return super.rebuildMaterializedState();
    this.transaction(() => this.clearSovereignInformationMaterializedState());
    return super.rebuildMaterializedState();
  }

  rebuildSovereignInformationMaterializedState() {
    const rows = this.db.prepare('SELECT * FROM events ORDER BY seq').all();
    this.transaction(() => {
      this.clearSovereignInformationMaterializedState();
      for (const row of rows) {
        const event = this.decodeEventRow(row);
        if (EVENT_TO_KIND.has(event.kind) || event.kind === MANDATE_REVOKED_EVENT) {
          this.applyMaterializedEvent(event);
        }
      }
    });
  }

  clearSovereignInformationMaterializedState() {
    this.db.exec('DELETE FROM siea_objects');
  }

  appendEvents({ traceId, actor, events }) {
    if (!Array.isArray(events)) return super.appendEvents({ traceId, actor, events });
    const prepared = events.map(event => {
      if (event?.kind === MANDATE_REVOKED_EVENT) return this.prepareMandateRevocationEvent(actor, event);
      const kind = EVENT_TO_KIND.get(event?.kind);
      if (!kind) return event;
      return this.prepareSieaEvent(actor, kind, event);
    });
    return super.appendEvents({ traceId, actor, events: prepared });
  }

  mutationAuthorization(actor, { operation, object_kind, object_ref, object_digest }) {
    if (!this.sieaMutationVerifier) {
      throw new ValidationError('SIEA mutation verifier is unavailable');
    }
    const verification = this.sieaMutationVerifier({
      actor,
      operation,
      object_kind,
      object_ref,
      object_digest
    });
    assertPlainObject(verification, 'SIEA mutation verification');
    if (verification.allowed !== true) {
      throw new AxiomError('siea_mutation_denied', 'Sovereign information mutation was denied', 403);
    }
    return validateAuthorization({
      authority_ref: verification.authority_ref,
      verifier_ref: verification.verifier_ref
    });
  }

  prepareSieaEvent(actor, kind, event) {
    assertPlainObject(event, 'SIEA event');
    const payload = assertPlainObject(event.payload, 'SIEA event payload');
    validateStorageId(payload.storage_id, 'SIEA event payload.storage_id');
    const object = validateObject(kind, payload.object);
    const objectDigest = digestObject(object);
    const ref = logicalReference(kind, object);
    const existing = this.#findSieaByLogicalRef(kind, ref);
    const storageCollision = this.db.prepare('SELECT object_kind FROM siea_objects WHERE storage_id = ?').get(payload.storage_id);
    if (storageCollision && (!existing || existing.storage_id !== payload.storage_id)) {
      throw new AxiomError('state_conflict', 'Sovereign information storage identifier is already in use', 409);
    }
    if (existing && immutableKind(kind)) {
      throw new AxiomError('state_conflict', 'Sovereign information object already exists', 409, { object_kind: kind });
    }
    if (existing && existing.storage_id !== payload.storage_id) {
      throw new AxiomError('state_conflict', 'Sovereign information logical object changed storage identity', 409);
    }
    if (!existing && payload.lifecycle_status !== 'active') {
      throw new ValidationError('Recorded sovereign information object must begin active');
    }
    const authorization = this.mutationAuthorization(actor, {
      operation: event.kind,
      object_kind: kind,
      object_ref: ref,
      object_digest: objectDigest
    });
    const preparedPayload = {
      storage_id: payload.storage_id,
      object_kind: kind,
      object,
      object_digest: objectDigest,
      lifecycle_status: payload.lifecycle_status,
      authorization
    };
    validateMaterializedPayload(kind, preparedPayload);
    return {
      kind: event.kind,
      subject: payload.storage_id,
      payload: preparedPayload,
      ...(event.event_id ? { event_id: event.event_id } : {})
    };
  }

  prepareMandateRevocationEvent(actor, event) {
    assertPlainObject(event, 'SIEA mandate revocation event');
    const raw = assertPlainObject(event.payload, 'SIEA mandate revocation event payload');
    const current = this.#findSieaByLogicalRef('delegated-gate-mandate', raw.mandate_id);
    if (!current || current.storage_id !== raw.storage_id) {
      throw new AxiomError('siea_mandate_not_found', 'Delegated gate mandate was not found', 404);
    }
    if (current.object.revocation.revoked) {
      throw new AxiomError('state_conflict', 'Delegated gate mandate is already revoked', 409);
    }
    const authorization = this.mutationAuthorization(actor, {
      operation: MANDATE_REVOKED_EVENT,
      object_kind: 'delegated-gate-mandate',
      object_ref: current.object.mandate_id,
      object_digest: current.object_digest
    });
    const prepared = {
      storage_id: raw.storage_id,
      mandate_id: raw.mandate_id,
      revoked_at: raw.revoked_at,
      reason: raw.reason,
      authorization
    };
    validateRevocationPayload(prepared);
    return {
      kind: MANDATE_REVOKED_EVENT,
      subject: raw.storage_id,
      payload: prepared,
      ...(event.event_id ? { event_id: event.event_id } : {})
    };
  }

  applyMaterializedEvent(event) {
    if (!this.sieaReady) return super.applyMaterializedEvent(event);
    if (event.kind === MANDATE_REVOKED_EVENT) return this.applyMandateRevocation(event);
    const kind = EVENT_TO_KIND.get(event.kind);
    if (!kind) return super.applyMaterializedEvent(event);
    const payload = validateMaterializedPayload(kind, event.payload);
    const existing = this.db.prepare('SELECT created_at FROM siea_objects WHERE storage_id = ?').get(payload.storage_id);
    this.db.prepare(`
      INSERT INTO siea_objects(
        storage_id, object_kind, object_json, object_digest,
        lifecycle_status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(storage_id) DO UPDATE SET
        object_kind = excluded.object_kind,
        object_json = excluded.object_json,
        object_digest = excluded.object_digest,
        lifecycle_status = excluded.lifecycle_status,
        updated_at = excluded.updated_at
    `).run(
      payload.storage_id,
      kind,
      this.protectJson('siea_objects', 'object_json', payload.storage_id, payload.object),
      payload.object_digest,
      payload.lifecycle_status,
      existing?.created_at ?? event.occurred_at,
      event.occurred_at
    );
  }

  applyMandateRevocation(event) {
    const payload = validateRevocationPayload(event.payload);
    if (Date.parse(payload.revoked_at) > Date.parse(event.occurred_at)) {
      throw new ValidationError('Delegated gate mandate revocation timestamp cannot be in the future');
    }
    const row = this.db.prepare('SELECT * FROM siea_objects WHERE storage_id = ?').get(payload.storage_id);
    if (!row || row.object_kind !== 'delegated-gate-mandate') {
      throw new ValidationError('Delegated gate mandate materialized state is missing');
    }
    const mandate = this.openJson('siea_objects', 'object_json', row.storage_id, row.object_json);
    if (mandate.mandate_id !== payload.mandate_id) {
      throw new ValidationError('Delegated gate mandate revocation target does not match materialized state');
    }
    if (mandate.revocation.revoked) {
      if (mandate.revocation.revoked_at === payload.revoked_at && mandate.revocation.reason === payload.reason) return;
      throw new ValidationError('Delegated gate mandate has conflicting revocation history');
    }
    const updated = {
      ...mandate,
      revocation: { revoked: true, revoked_at: payload.revoked_at, reason: payload.reason }
    };
    validateDelegatedGateMandate(updated);
    this.db.prepare(`
      UPDATE siea_objects
      SET object_json = ?, object_digest = ?, lifecycle_status = 'revoked', updated_at = ?
      WHERE storage_id = ?
    `).run(
      this.protectJson('siea_objects', 'object_json', row.storage_id, updated),
      digestObject(updated),
      event.occurred_at,
      row.storage_id
    );
  }

  #decodedSieaRows(kind) {
    if (kind !== undefined && !OBJECT_KINDS.has(kind)) {
      throw new ValidationError('unsupported sovereign information object kind');
    }
    const rows = kind === undefined
      ? this.db.prepare('SELECT * FROM siea_objects ORDER BY created_at, storage_id').all()
      : this.db.prepare('SELECT * FROM siea_objects WHERE object_kind = ? ORDER BY created_at, storage_id').all(kind);
    return rows.map(row => ({
      ...row,
      object: this.openJson('siea_objects', 'object_json', row.storage_id, row.object_json)
    }));
  }

  #findSieaByLogicalRef(kind, ref) {
    return this.#decodedSieaRows(kind).find(row => logicalReference(kind, row.object) === ref) ?? null;
  }

  recordInformationRightsEnvelope({ actor, traceId, envelope }) {
    return this.recordObject({ actor, traceId, kind: 'information-rights', object: envelope });
  }

  recordEvidenceAssertion({ actor, traceId, assertion }) {
    return this.recordObject({ actor, traceId, kind: 'evidence-assertion', object: assertion });
  }

  recordEvidenceLink({ actor, traceId, link }) {
    validateEvidenceLink(link);
    for (const ref of [link.from_ref, link.to_ref]) {
      if (!this.#findSieaByLogicalRef('evidence-assertion', ref)) {
        throw new ValidationError('Evidence link endpoint is not durably present');
      }
    }
    return this.recordObject({ actor, traceId, kind: 'evidence-link', object: link });
  }

  recordEvidenceReview({ actor, traceId, review }) {
    return this.recordObject({ actor, traceId, kind: 'evidence-review', object: review });
  }

  recordDelegatedGateMandate({ actor, traceId, mandate }) {
    validateDelegatedGateMandate(mandate);
    if (mandate.revocation.revoked) {
      throw new ValidationError('New delegated gate mandate must not begin revoked');
    }
    return this.recordObject({ actor, traceId, kind: 'delegated-gate-mandate', object: mandate });
  }

  revokeDelegatedGateMandate({ actor, traceId, mandateId, revokedAt, reason }) {
    assertReference(mandateId, 'mandateId');
    assertIsoTimestamp(revokedAt, 'revokedAt');
    assertString(reason, 'reason', { max: 512 });
    const current = this.#findSieaByLogicalRef('delegated-gate-mandate', mandateId);
    if (!current) {
      throw new AxiomError('siea_mandate_not_found', 'Delegated gate mandate was not found', 404);
    }
    if (current.object.revocation.revoked) {
      if (current.object.revocation.revoked_at === revokedAt && current.object.revocation.reason === reason) {
        const row = this.db.prepare(`
          SELECT * FROM events
          WHERE kind = ? AND subject = ?
          ORDER BY seq DESC LIMIT 1
        `).get(MANDATE_REVOKED_EVENT, current.storage_id);
        if (row) {
          const existingEvent = this.decodeEventRow(row);
          if (existingEvent.payload.revoked_at === revokedAt && existingEvent.payload.reason === reason) return existingEvent;
        }
      }
      throw new AxiomError('state_conflict', 'Delegated gate mandate is already revoked with different state', 409);
    }
    const appended = this.appendEvents({
      traceId,
      actor,
      events: [{
        kind: MANDATE_REVOKED_EVENT,
        subject: current.storage_id,
        payload: {
          storage_id: current.storage_id,
          mandate_id: mandateId,
          revoked_at: revokedAt,
          reason
        }
      }]
    });
    return appended[0];
  }

  getDelegatedGateMandateEffectiveState(mandateId, { now }) {
    assertReference(mandateId, 'mandateId');
    assertIsoTimestamp(now, 'now');
    const row = this.#findSieaByLogicalRef('delegated-gate-mandate', mandateId);
    if (!row) {
      throw new AxiomError('siea_mandate_not_found', 'Delegated gate mandate was not found', 404);
    }
    let status = 'active';
    if (row.object.revocation.revoked || row.lifecycle_status === 'revoked') status = 'revoked';
    else if (Date.parse(now) < Date.parse(row.object.starts_at)) status = 'not-started';
    else if (Date.parse(now) >= Date.parse(row.object.expires_at)) status = 'expired';
    return { status, mandate: row.object, object_digest: row.object_digest, storage_id: row.storage_id };
  }

  readSovereignInformationObject({ requester, objectRef, purpose, right, decision, now }) {
    if (!READ_RIGHTS.has(right)) throw new ValidationError('Sovereign information read right is unsupported');
    const row = this.#authorizeRead({ requester, objectRef, purpose, right, decision, now });
    return this.#projectAuthorizedRow(row, right);
  }

  listAuthorizedSovereignInformation({ requester, purpose, right, decisions, now, limit = 100 }) {
    if (!READ_RIGHTS.has(right)) throw new ValidationError('Sovereign information read right is unsupported');
    if (!Array.isArray(decisions) || decisions.length > 100) {
      throw new ValidationError('decisions must be an array with at most 100 items');
    }
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
      throw new ValidationError('limit must be an integer from 1 to 100');
    }
    const authorized = [];
    const seen = new Set();
    for (const decision of decisions) {
      let objectRef;
      try {
        objectRef = validateInformationAccessDecision(decision).object_ref;
      } catch {
        unavailable();
      }
      const row = this.#authorizeRead({ requester, objectRef, purpose, right, decision, now });
      if (seen.has(row.storage_id)) continue;
      seen.add(row.storage_id);
      authorized.push(row);
    }
    authorized.sort((left, rightRow) => {
      const leftRef = logicalReference(left.object_kind, left.object);
      const rightRef = logicalReference(rightRow.object_kind, rightRow.object);
      return leftRef.localeCompare(rightRef);
    });
    const truncated = authorized.length > limit;
    return {
      items: authorized.slice(0, limit).map(row => this.#projectAuthorizedRow(row, right)),
      truncated
    };
  }

  #authorizeRead({ requester, objectRef, purpose, right, decision, now }) {
    if (!this.informationAccessDecisionVerifier) {
      throw new ValidationError('SIEA access-decision verifier is unavailable');
    }
    let validated;
    try {
      validated = validateInformationAccessDecision(decision);
      const verification = this.informationAccessDecisionVerifier(validated, {
        requester,
        object_ref: objectRef,
        purpose,
        right,
        now
      });
      assertPlainObject(verification, 'SIEA access-decision verification');
      if (verification.valid !== true) unavailable();
    } catch (error) {
      if (error instanceof AxiomError && error.code === 'siea_object_unavailable') throw error;
      unavailable();
    }

    const candidates = this.#decodedSieaRows().filter(row => (
      logicalReference(row.object_kind, row.object) === objectRef
      && row.object_digest === validated.object_digest
    ));
    if (candidates.length !== 1) unavailable();
    const row = candidates[0];
    try {
      assertInformationAccessDecisionBinds(validated, {
        requester,
        object_ref: objectRef,
        purpose,
        right,
        object_digest: row.object_digest
      }, { now });
    } catch {
      unavailable();
    }
    return row;
  }

  #projectAuthorizedRow(row, right) {
    const metadata = {
      object_ref: logicalReference(row.object_kind, row.object),
      object_kind: row.object_kind,
      object_digest: row.object_digest,
      lifecycle_status: row.lifecycle_status,
      created_at: row.created_at,
      updated_at: row.updated_at
    };
    if (right === 'inspect-full-content') return { ...metadata, object: row.object };
    return metadata;
  }

  recordObject({ actor, traceId, kind, object }) {
    validateObject(kind, object);
    const ref = logicalReference(kind, object);
    const existing = this.#findSieaByLogicalRef(kind, ref);
    const objectDigest = digestObject(object);
    if (existing && immutableKind(kind)) {
      throw new AxiomError('state_conflict', 'Sovereign information object already exists', 409, { object_kind: kind });
    }
    if (existing && existing.object_digest === objectDigest) {
      throw new AxiomError('state_conflict', 'Sovereign information object already exists unchanged', 409, { object_kind: kind });
    }
    const storageId = existing?.storage_id ?? newId('siea');
    const eventKind = KIND_TO_EVENT.get(kind);
    if (!eventKind) throw new ValidationError('Sovereign information event mapping is unavailable');
    const appended = this.appendEvents({
      traceId,
      actor,
      events: [{
        kind: eventKind,
        subject: storageId,
        payload: {
          storage_id: storageId,
          object_kind: kind,
          object,
          object_digest: objectDigest,
          lifecycle_status: 'active'
        }
      }]
    });
    return appended[0];
  }
}
