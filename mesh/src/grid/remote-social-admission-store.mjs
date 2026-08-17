import {
  AxiomError,
  ValidationError,
  assertPlainObject,
  assertString,
  canonicalJson,
  digestObject
} from '../lib/canonical.mjs';
import { verifySocialExchangePackage } from '../lib/social-exchange-package.mjs';
import { RemoteSocialGridStore } from './remote-social-store.mjs';
import { runRemoteSocialAdmissionMigrations } from './remote-social-admission-migrations.mjs';

export const REMOTE_SOCIAL_ADMISSION_ACTION = 'social.remote.admit';
export const REMOTE_SOCIAL_ADMISSION_EVENT = 'remote.social.admitted';
export const REMOTE_SOCIAL_ADMISSION_REQUEST_SCHEMA = 'axiom-remote-social-admission-request.v1';
export const REMOTE_SOCIAL_ADMISSION_SCHEMA = 'axiom-remote-social-admission.v1';
export const REMOTE_SOCIAL_OBSERVATION_SCHEMA = 'axiom-remote-social-observation.v1';

const ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,191}$/;
const DIGEST = /^[a-f0-9]{64}$/;
const TRUST_LABEL = /^[a-z][a-z0-9._-]{0,63}$/;
const OBJECT_KINDS = new Set(['persona', 'publication', 'transition']);
const ADMISSION_PROTECTED_COLUMN_MAPPINGS = Object.freeze([
  ['remote_social_admissions', 'admission_id', ['summary_json']],
  ['remote_social_observations', 'observation_id', ['object_json']]
]);

function id(value, label) {
  return assertString(value, label, { min: 1, max: 192, pattern: ID });
}

function digest(value, label) {
  return assertString(value, label, { min: 64, max: 64, pattern: DIGEST });
}

function boundedInteger(value, label, min, max) {
  if (!Number.isSafeInteger(value) || value < min || value > max) {
    throw new ValidationError(`${label} must be an integer between ${min} and ${max}`);
  }
  return value;
}

function tableExists(db, table) {
  return Boolean(db.prepare(`
    SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?
  `).get(table));
}

function migrateAdmissionProtectedMapping(store) {
  for (const [table, keyExpression, columns] of ADMISSION_PROTECTED_COLUMN_MAPPINGS) {
    if (!tableExists(store.db, table)) continue;
    store.transaction(() => {
      const rows = store.db.prepare(
        `SELECT ${keyExpression} AS protection_key, ${columns.join(', ')} FROM ${table}`
      ).all();
      for (const row of rows) {
        for (const column of columns) {
          const serialized = row[column];
          if (serialized === null || serialized === undefined) continue;
          if (store.protector.isProtected(serialized)) {
            store.openJson(table, column, row.protection_key, serialized);
            continue;
          }
          let value;
          try {
            value = JSON.parse(serialized);
          } catch {
            throw new ValidationError(`Legacy ${table}.${column} value is not valid JSON`);
          }
          store.db.prepare(
            `UPDATE ${table} SET ${column} = ? WHERE ${keyExpression} = ?`
          ).run(
            store.protectJson(table, column, row.protection_key, value),
            row.protection_key
          );
        }
      }
    });
  }
}

export function buildRemoteSocialAdmissionRequest(stageInput) {
  const stage = assertPlainObject(stageInput, 'remote social stage');
  const plan = assertPlainObject(stage.import_plan_json, 'remote social import plan');
  const admitted = normalizeAdmittedObjects(plan.admitted_objects);
  const request = Object.freeze({
    schema: REMOTE_SOCIAL_ADMISSION_REQUEST_SCHEMA,
    action: REMOTE_SOCIAL_ADMISSION_ACTION,
    owner: id(stage.owner, 'remote social admission owner'),
    stage_id: id(stage.stage_id, 'remote social admission stage_id'),
    package_digest: digest(stage.package_digest, 'remote social admission package_digest'),
    exporter_grid_id: id(stage.exporter_grid_id, 'remote social admission exporter_grid_id'),
    exporter_key_id: digest(stage.exporter_key_id, 'remote social admission exporter_key_id'),
    import_plan_digest: digest(plan.plan_digest, 'remote social admission import_plan_digest'),
    trust_label: assertString(stage.trust_label, 'remote social admission trust_label', {
      min: 1,
      max: 64,
      pattern: TRUST_LABEL
    }),
    admitted_objects: admitted,
    remote_observation_only: true,
    local_authorship_claimed: false,
    network_effect: 'none',
    authority_effect: 'none'
  });
  return Object.freeze({
    request,
    request_digest: digestObject(request)
  });
}

export class RemoteSocialAdmissionGridStore extends RemoteSocialGridStore {
  initialize() {
    this.remoteSocialAdmissionReady = false;
    super.initialize();
    this.remoteSocialAdmissionMigrations = runRemoteSocialAdmissionMigrations(this.db);
    migrateAdmissionProtectedMapping(this);
    this.remoteSocialAdmissionReady = true;
    this.rebuildRemoteSocialAdmissionState();
  }

  getStatus() {
    return {
      ...super.getStatus(),
      remote_social_admission_schema_version:
        this.remoteSocialAdmissionMigrations?.version ?? 0,
      remote_social_admission_runtime: 'approval-bound-observation-laboratory'
    };
  }

  migrateProtectedColumns() {
    super.migrateProtectedColumns();
    if (this.remoteSocialAdmissionReady) migrateAdmissionProtectedMapping(this);
  }

  appendEvents({ traceId, actor, events }) {
    if (Array.isArray(events)) {
      for (const event of events) {
        if (event?.kind === REMOTE_SOCIAL_ADMISSION_EVENT) {
          validateRemoteSocialAdmissionEvent(event, actor);
        }
      }
    }
    return super.appendEvents({ traceId, actor, events });
  }

  applyMaterializedEvent(event) {
    super.applyMaterializedEvent(event);
    if (
      this.remoteSocialAdmissionReady
      && event.kind === REMOTE_SOCIAL_ADMISSION_EVENT
    ) {
      this.materializeRemoteSocialAdmission(event);
    }
  }

  rebuildRemoteSocialAdmissionState() {
    const rows = this.db.prepare(`
      SELECT * FROM events WHERE kind = ? ORDER BY seq
    `).all(REMOTE_SOCIAL_ADMISSION_EVENT);
    this.transaction(() => {
      this.db.exec('DELETE FROM remote_social_admission_objects');
      this.db.exec('DELETE FROM remote_social_observations');
      this.db.exec('DELETE FROM remote_social_admissions');
      for (const row of rows) {
        const event = this.decodeEventRow(row);
        this.materializeRemoteSocialAdmission(event);
      }
    });
  }

  getRemoteSocialAdmissionRequest(owner, stageId) {
    const stage = this.getRemoteSocialStage(owner, stageId);
    return buildRemoteSocialAdmissionRequest(stage);
  }

  admitRemoteSocialStage({
    owner,
    stageId,
    intentId,
    approvalId,
    traceId,
    now = Date.now()
  }) {
    const recipient = id(owner, 'remote social admission owner');
    const stage = this.getRemoteSocialStage(recipient, stageId);
    const intent = id(intentId, 'remote social admission intent_id');
    const approval = id(approvalId, 'remote social admission approval_id');
    id(traceId, 'remote social admission trace_id');

    const { request, request_digest: requestDigest } =
      buildRemoteSocialAdmissionRequest(stage);
    const admissionId = `remote_admission_${digestObject({
      schema: REMOTE_SOCIAL_ADMISSION_SCHEMA,
      owner: recipient,
      stage_id: stage.stage_id,
      request_digest: requestDigest
    })}`;

    const existing = this.db.prepare(`
      SELECT * FROM remote_social_admissions WHERE stage_id = ?
    `).get(stage.stage_id);
    if (existing) {
      const decoded = this.decodeAdmission(existing);
      if (
        decoded.admission_id !== admissionId
        || decoded.intent_id !== intent
        || decoded.approval_id !== approval
        || decoded.request_digest !== requestDigest
      ) {
        throw new AxiomError(
          'remote_social_admission_conflict',
          'The staged remote package was already admitted under different authority',
          409
        );
      }
      return decoded;
    }

    const expiresAt = new Date(stage.import_plan_json.expires_at).valueOf();
    if (!Number.isFinite(expiresAt) || expiresAt <= now) {
      throw new AxiomError(
        'remote_social_import_plan_expired',
        'The remote social review plan has expired',
        409
      );
    }

    const intentRow = this.db.prepare(`
      SELECT intent_id, principal, action, status, request_digest
      FROM intents WHERE intent_id = ?
    `).get(intent);
    if (
      !intentRow
      || intentRow.principal !== recipient
      || intentRow.action !== REMOTE_SOCIAL_ADMISSION_ACTION
      || intentRow.request_digest !== requestDigest
      || intentRow.status !== 'accepted'
    ) {
      throw new AxiomError(
        'remote_social_admission_intent_unavailable',
        'An accepted intent bound to the exact remote social admission request is required',
        409
      );
    }

    const approvalRow = this.db.prepare(`
      SELECT * FROM approvals WHERE approval_id = ?
    `).get(approval);
    if (
      !approvalRow
      || approvalRow.status !== 'active'
      || approvalRow.requester !== recipient
      || approvalRow.approver === recipient
      || approvalRow.action !== REMOTE_SOCIAL_ADMISSION_ACTION
      || approvalRow.request_digest !== requestDigest
      || new Date(approvalRow.expires_at).valueOf() <= now
    ) {
      throw new AxiomError(
        'remote_social_admission_approval_unavailable',
        'An active independent approval bound to the exact remote social admission request is required',
        409
      );
    }

    const payload = Object.freeze({
      schema: REMOTE_SOCIAL_ADMISSION_SCHEMA,
      admission_id: admissionId,
      owner: recipient,
      stage_id: stage.stage_id,
      package_digest: stage.package_digest,
      exporter_grid_id: stage.exporter_grid_id,
      exporter_key_id: stage.exporter_key_id,
      intent_id: intent,
      approval_id: approval,
      request_digest: requestDigest,
      import_plan_digest: stage.import_plan_json.plan_digest,
      trust_label: stage.trust_label,
      admitted_objects: request.admitted_objects,
      remote_observation_only: true,
      local_authorship_claimed: false,
      network_effect: 'none',
      authority_effect: 'none'
    });

    this.appendEvents({
      traceId,
      actor: recipient,
      events: [
        {
          kind: 'approval.consumed',
          subject: approval,
          payload: {
            approval_id: approval,
            intent_id: intent
          }
        },
        {
          kind: REMOTE_SOCIAL_ADMISSION_EVENT,
          subject: admissionId,
          payload
        }
      ]
    });

    return this.getRemoteSocialAdmission(recipient, admissionId);
  }

  materializeRemoteSocialAdmission(event) {
    const payload = validateRemoteSocialAdmissionEvent(event, event.actor);
    const stage = this.getRemoteSocialStage(payload.owner, payload.stage_id);
    const verified = verifySocialExchangePackage(stage.package_json, {
      trustedExporterPublicKey: stage.trusted_exporter_json.public_key,
      expectedExporterGridId: stage.exporter_grid_id,
      now: new Date(event.occurred_at).valueOf()
    });
    const { request, request_digest: requestDigest } =
      buildRemoteSocialAdmissionRequest(stage);

    if (
      verified.package_digest !== payload.package_digest
      || stage.package_digest !== payload.package_digest
      || stage.exporter_grid_id !== payload.exporter_grid_id
      || stage.exporter_key_id !== payload.exporter_key_id
      || stage.import_plan_json.plan_digest !== payload.import_plan_digest
      || stage.trust_label !== payload.trust_label
      || requestDigest !== payload.request_digest
      || canonicalJson(request.admitted_objects) !== canonicalJson(payload.admitted_objects)
    ) {
      throw new ValidationError('remote social admission event does not match the staged review package');
    }

    const intentRow = this.db.prepare(`
      SELECT intent_id, principal, action, status, request_digest
      FROM intents WHERE intent_id = ?
    `).get(payload.intent_id);
    if (
      !intentRow
      || intentRow.principal !== payload.owner
      || intentRow.action !== REMOTE_SOCIAL_ADMISSION_ACTION
      || intentRow.request_digest !== payload.request_digest
      || !['accepted', 'completed'].includes(intentRow.status)
    ) {
      throw new ValidationError('remote social admission intent evidence is unavailable or mismatched');
    }

    const approval = this.db.prepare(`
      SELECT * FROM approvals WHERE approval_id = ?
    `).get(payload.approval_id);
    if (
      !approval
      || approval.requester !== payload.owner
      || approval.approver === payload.owner
      || approval.action !== REMOTE_SOCIAL_ADMISSION_ACTION
      || approval.request_digest !== payload.request_digest
      || approval.status !== 'consumed'
      || approval.consumed_by_intent !== payload.intent_id
    ) {
      throw new ValidationError('remote social admission requires consumed matching independent approval evidence');
    }

    const existing = this.db.prepare(`
      SELECT admission_id FROM remote_social_admissions WHERE stage_id = ?
    `).get(payload.stage_id);
    if (existing) {
      if (existing.admission_id !== payload.admission_id) {
        throw new ValidationError('remote social stage has conflicting admission history');
      }
      return;
    }

    const observationEntries = [
      ...verified.personas.map(object => ({
        kind: 'persona',
        digest: object.projection_digest,
        object
      })),
      ...verified.publications.map(object => ({
        kind: 'publication',
        digest: object.projection_digest,
        object
      })),
      ...verified.transitions.map(object => ({
        kind: 'transition',
        digest: object.transition_digest,
        object
      }))
    ];
    const summary = Object.freeze({
      package_digest: payload.package_digest,
      exporter_grid_id: payload.exporter_grid_id,
      exporter_key_id: payload.exporter_key_id,
      observation_counts: {
        personas: verified.personas.length,
        publications: verified.publications.length,
        transitions: verified.transitions.length
      },
      remote_observation_only: true,
      local_authorship_claimed: false,
      network_effect: 'none',
      authority_effect: 'none'
    });

    this.db.prepare(`
      INSERT INTO remote_social_admissions(
        admission_id, owner, stage_id, package_digest, exporter_grid_id,
        exporter_key_id, intent_id, approval_id, request_digest,
        import_plan_digest, trust_label, summary_json, status, admitted_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'admitted', ?)
    `).run(
      payload.admission_id,
      payload.owner,
      payload.stage_id,
      payload.package_digest,
      payload.exporter_grid_id,
      payload.exporter_key_id,
      payload.intent_id,
      payload.approval_id,
      payload.request_digest,
      payload.import_plan_digest,
      payload.trust_label,
      this.protectJson(
        'remote_social_admissions',
        'summary_json',
        payload.admission_id,
        summary
      ),
      event.occurred_at
    );

    for (const entry of observationEntries) {
      const observationId = `remote_observation_${digestObject({
        schema: REMOTE_SOCIAL_OBSERVATION_SCHEMA,
        owner: payload.owner,
        exporter_key_id: payload.exporter_key_id,
        object_kind: entry.kind,
        object_digest: entry.digest
      })}`;
      const existingObservation = this.db.prepare(`
        SELECT * FROM remote_social_observations WHERE observation_id = ?
      `).get(observationId);
      if (!existingObservation) {
        this.db.prepare(`
          INSERT INTO remote_social_observations(
            observation_id, owner, exporter_grid_id, exporter_key_id,
            object_kind, object_digest, object_json, first_admission_id, observed_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          observationId,
          payload.owner,
          payload.exporter_grid_id,
          payload.exporter_key_id,
          entry.kind,
          entry.digest,
          this.protectJson(
            'remote_social_observations',
            'object_json',
            observationId,
            entry.object
          ),
          payload.admission_id,
          event.occurred_at
        );
      } else {
        const decoded = this.openJson(
          'remote_social_observations',
          'object_json',
          observationId,
          existingObservation.object_json
        );
        if (canonicalJson(decoded) !== canonicalJson(entry.object)) {
          throw new ValidationError('remote social observation digest aliases different content');
        }
      }
      this.db.prepare(`
        INSERT INTO remote_social_admission_objects(admission_id, observation_id)
        VALUES (?, ?)
      `).run(payload.admission_id, observationId);
    }
  }

  getRemoteSocialAdmission(owner, admissionId) {
    const recipient = id(owner, 'remote social admission owner');
    const admission = id(admissionId, 'remote social admission_id');
    const row = this.db.prepare(`
      SELECT * FROM remote_social_admissions
      WHERE owner = ? AND admission_id = ?
    `).get(recipient, admission);
    if (!row) {
      throw new AxiomError(
        'remote_social_admission_not_found',
        'Remote social admission was not found',
        404
      );
    }
    return this.decodeAdmission(row);
  }

  listRemoteSocialAdmissions(owner, { limit = 50 } = {}) {
    const recipient = id(owner, 'remote social admission owner');
    const safeLimit = boundedInteger(limit, 'remote social admission limit', 1, 100);
    const rows = this.db.prepare(`
      SELECT * FROM remote_social_admissions
      WHERE owner = ? ORDER BY admitted_at DESC, admission_id DESC LIMIT ?
    `).all(recipient, safeLimit + 1);
    const truncated = rows.length > safeLimit;
    if (truncated) rows.pop();
    return {
      admissions: rows.map(row => this.decodeAdmission(row)),
      truncated
    };
  }

  listRemoteSocialObservations(owner, { kind, limit = 100 } = {}) {
    const recipient = id(owner, 'remote social observation owner');
    const safeLimit = boundedInteger(limit, 'remote social observation limit', 1, 200);
    if (kind !== undefined && !OBJECT_KINDS.has(kind)) {
      throw new ValidationError('remote social observation kind is invalid');
    }
    const rows = kind === undefined
      ? this.db.prepare(`
          SELECT * FROM remote_social_observations
          WHERE owner = ? ORDER BY observed_at DESC, observation_id DESC LIMIT ?
        `).all(recipient, safeLimit + 1)
      : this.db.prepare(`
          SELECT * FROM remote_social_observations
          WHERE owner = ? AND object_kind = ?
          ORDER BY observed_at DESC, observation_id DESC LIMIT ?
        `).all(recipient, kind, safeLimit + 1);
    const truncated = rows.length > safeLimit;
    if (truncated) rows.pop();
    return {
      observations: rows.map(row => this.decodeObservation(row)),
      truncated
    };
  }

  decodeAdmission(row) {
    return Object.freeze({
      schema: REMOTE_SOCIAL_ADMISSION_SCHEMA,
      admission_id: row.admission_id,
      owner: row.owner,
      stage_id: row.stage_id,
      package_digest: row.package_digest,
      exporter_grid_id: row.exporter_grid_id,
      exporter_key_id: row.exporter_key_id,
      intent_id: row.intent_id,
      approval_id: row.approval_id,
      request_digest: row.request_digest,
      import_plan_digest: row.import_plan_digest,
      trust_label: row.trust_label,
      summary_json: this.openJson(
        'remote_social_admissions',
        'summary_json',
        row.admission_id,
        row.summary_json
      ),
      status: row.status,
      admitted_at: row.admitted_at,
      remote_observation_only: true,
      local_authorship_claimed: false,
      network_effect: 'none',
      authority_effect: 'none'
    });
  }

  decodeObservation(row) {
    return Object.freeze({
      schema: REMOTE_SOCIAL_OBSERVATION_SCHEMA,
      observation_id: row.observation_id,
      owner: row.owner,
      exporter_grid_id: row.exporter_grid_id,
      exporter_key_id: row.exporter_key_id,
      object_kind: row.object_kind,
      object_digest: row.object_digest,
      object_json: this.openJson(
        'remote_social_observations',
        'object_json',
        row.observation_id,
        row.object_json
      ),
      first_admission_id: row.first_admission_id,
      observed_at: row.observed_at,
      remote_observation_only: true,
      local_authorship_claimed: false,
      network_effect: 'none',
      authority_effect: 'none'
    });
  }
}

function validateRemoteSocialAdmissionEvent(eventInput, actor) {
  const event = assertPlainObject(eventInput, 'remote social admission event');
  const payload = assertPlainObject(event.payload, 'remote social admission payload');
  const required = [
    'schema', 'admission_id', 'owner', 'stage_id', 'package_digest',
    'exporter_grid_id', 'exporter_key_id', 'intent_id', 'approval_id',
    'request_digest', 'import_plan_digest', 'trust_label', 'admitted_objects',
    'remote_observation_only', 'local_authorship_claimed', 'network_effect',
    'authority_effect'
  ];
  if (Object.keys(payload).length !== required.length || required.some(key => !(key in payload))) {
    throw new ValidationError('remote social admission payload fields are invalid');
  }
  if (payload.schema !== REMOTE_SOCIAL_ADMISSION_SCHEMA) {
    throw new ValidationError('unsupported remote social admission schema');
  }
  const normalized = Object.freeze({
    schema: REMOTE_SOCIAL_ADMISSION_SCHEMA,
    admission_id: id(payload.admission_id, 'remote social admission admission_id'),
    owner: id(payload.owner, 'remote social admission owner'),
    stage_id: id(payload.stage_id, 'remote social admission stage_id'),
    package_digest: digest(payload.package_digest, 'remote social admission package_digest'),
    exporter_grid_id: id(payload.exporter_grid_id, 'remote social admission exporter_grid_id'),
    exporter_key_id: digest(payload.exporter_key_id, 'remote social admission exporter_key_id'),
    intent_id: id(payload.intent_id, 'remote social admission intent_id'),
    approval_id: id(payload.approval_id, 'remote social admission approval_id'),
    request_digest: digest(payload.request_digest, 'remote social admission request_digest'),
    import_plan_digest: digest(payload.import_plan_digest, 'remote social admission import_plan_digest'),
    trust_label: assertString(payload.trust_label, 'remote social admission trust_label', {
      min: 1,
      max: 64,
      pattern: TRUST_LABEL
    }),
    admitted_objects: normalizeAdmittedObjects(payload.admitted_objects),
    remote_observation_only: payload.remote_observation_only,
    local_authorship_claimed: payload.local_authorship_claimed,
    network_effect: payload.network_effect,
    authority_effect: payload.authority_effect
  });
  if (
    normalized.remote_observation_only !== true
    || normalized.local_authorship_claimed !== false
    || normalized.network_effect !== 'none'
    || normalized.authority_effect !== 'none'
  ) {
    throw new ValidationError('remote social admission must remain observation-only and non-authorizing');
  }
  if (normalized.owner !== actor) {
    throw new ValidationError('remote social admission owner must match the event actor');
  }
  if (event.subject !== normalized.admission_id) {
    throw new ValidationError('remote social admission event subject must equal admission_id');
  }
  return normalized;
}

function normalizeAdmittedObjects(input) {
  const value = assertPlainObject(input, 'remote social admitted objects');
  const keys = ['persona_projection_digests', 'publication_digests', 'transition_digests'];
  if (Object.keys(value).length !== keys.length || keys.some(key => !(key in value))) {
    throw new ValidationError('remote social admitted object fields are invalid');
  }
  return Object.freeze({
    persona_projection_digests: normalizeDigestArray(
      value.persona_projection_digests,
      'remote social persona projection digests'
    ),
    publication_digests: normalizeDigestArray(
      value.publication_digests,
      'remote social publication digests'
    ),
    transition_digests: normalizeDigestArray(
      value.transition_digests,
      'remote social transition digests'
    )
  });
}

function normalizeDigestArray(input, label) {
  if (!Array.isArray(input) || input.length > 512) {
    throw new ValidationError(`${label} must contain at most 512 items`);
  }
  const values = input.map((value, index) => digest(value, `${label}[${index}]`));
  if (new Set(values).size !== values.length) {
    throw new ValidationError(`${label} contains duplicate digests`);
  }
  return Object.freeze(values);
}
