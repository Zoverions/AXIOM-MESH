import {
  AxiomError,
  ValidationError,
  assertPlainObject,
  assertString,
  canonicalJson,
  digestObject
} from '../lib/canonical.mjs';
import {
  createSocialExchangeImportPlan,
  verifySocialExchangePackage
} from '../lib/social-exchange-package.mjs';
import {
  REMOTE_SOCIAL_STAGE_SCHEMA
} from './remote-social-store.mjs';
import {
  REMOTE_SOCIAL_ADMISSION_SCHEMA,
  REMOTE_SOCIAL_OBSERVATION_SCHEMA
} from './remote-social-admission-store.mjs';
import { RemoteSocialFollowingGridStore } from './remote-social-following-store.mjs';
import {
  runRemoteSocialRetentionMigrations
} from './remote-social-retention-migrations.mjs';

export const REMOTE_SOCIAL_RETENTION_POLICY_SCHEMA = 'axiom-remote-social-retention-policy.v1';
export const REMOTE_SOCIAL_RETENTION_RECEIPT_SCHEMA = 'axiom-remote-social-retention-receipt.v1';
export const REMOTE_SOCIAL_STAGE_EXPIRED_EVENT = 'remote.social.stage.expired';

const ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,191}$/;
const DIGEST = /^[a-f0-9]{64}$/;
const REASON = /^[a-z][a-z0-9._-]{0,63}$/;
const ACTION = 'expire-unadmitted-stage';
const DEFAULT_POLICY = Object.freeze({
  schema: REMOTE_SOCIAL_RETENTION_POLICY_SCHEMA,
  max_stages: 64,
  max_stage_protected_bytes: 64 * 1024 * 1024,
  max_admissions: 2_048,
  max_observations: 20_000,
  max_observation_protected_bytes: 128 * 1024 * 1024,
  max_retention_receipts: 10_000
});

export function normalizeRemoteSocialRetentionPolicy(input = {}) {
  const value = input === undefined ? {} : assertPlainObject(input, 'remote social retention policy');
  for (const key of Object.keys(value)) {
    if (!Object.hasOwn(DEFAULT_POLICY, key)) {
      throw new ValidationError(`remote social retention policy contains unsupported field ${key}`);
    }
  }
  if (
    value.schema !== undefined
    && value.schema !== REMOTE_SOCIAL_RETENTION_POLICY_SCHEMA
  ) {
    throw new ValidationError('unsupported remote social retention policy schema');
  }
  return Object.freeze({
    schema: REMOTE_SOCIAL_RETENTION_POLICY_SCHEMA,
    max_stages: boundedInteger(
      value.max_stages ?? DEFAULT_POLICY.max_stages,
      'remote social max_stages',
      1,
      1_024
    ),
    max_stage_protected_bytes: boundedInteger(
      value.max_stage_protected_bytes ?? DEFAULT_POLICY.max_stage_protected_bytes,
      'remote social max_stage_protected_bytes',
      1_048_576,
      1_073_741_824
    ),
    max_admissions: boundedInteger(
      value.max_admissions ?? DEFAULT_POLICY.max_admissions,
      'remote social max_admissions',
      1,
      100_000
    ),
    max_observations: boundedInteger(
      value.max_observations ?? DEFAULT_POLICY.max_observations,
      'remote social max_observations',
      1,
      500_000
    ),
    max_observation_protected_bytes: boundedInteger(
      value.max_observation_protected_bytes
        ?? DEFAULT_POLICY.max_observation_protected_bytes,
      'remote social max_observation_protected_bytes',
      1_048_576,
      2_147_483_648
    ),
    max_retention_receipts: boundedInteger(
      value.max_retention_receipts ?? DEFAULT_POLICY.max_retention_receipts,
      'remote social max_retention_receipts',
      1,
      100_000
    )
  });
}

export class RemoteSocialRetentionGridStore extends RemoteSocialFollowingGridStore {
  initialize() {
    this.remoteSocialRetentionReady = false;
    super.initialize();
    this.remoteSocialRetentionMigrations = runRemoteSocialRetentionMigrations(this.db);
    this.remoteSocialRetentionReady = true;
    this.rebuildRemoteSocialRetentionState();
  }

  getStatus() {
    return {
      ...super.getStatus(),
      remote_social_retention_schema_version:
        this.remoteSocialRetentionMigrations?.version ?? 0,
      remote_social_retention_runtime: 'operator-driven-quota-laboratory'
    };
  }

  appendEvents({ traceId, actor, events }) {
    if (Array.isArray(events)) {
      for (const event of events) {
        if (event?.kind === REMOTE_SOCIAL_STAGE_EXPIRED_EVENT) {
          validateRetentionEvent(event, actor);
        }
      }
    }
    return super.appendEvents({ traceId, actor, events });
  }

  applyMaterializedEvent(event) {
    super.applyMaterializedEvent(event);
    if (
      this.remoteSocialRetentionReady
      && event.kind === REMOTE_SOCIAL_STAGE_EXPIRED_EVENT
    ) {
      this.materializeRemoteSocialRetention(event);
    }
  }

  rebuildRemoteSocialRetentionState() {
    const rows = this.db.prepare(`
      SELECT * FROM events WHERE kind = ? ORDER BY seq
    `).all(REMOTE_SOCIAL_STAGE_EXPIRED_EVENT);
    this.transaction(() => {
      this.db.exec('DELETE FROM remote_social_retention_receipts');
      for (const row of rows) {
        this.materializeRemoteSocialRetention(this.decodeEventRow(row));
      }
    });
  }

  stageRemoteSocialPackage(input) {
    const value = assertPlainObject(input, 'retained remote social stage input');
    const {
      retentionPolicy,
      stagedAt,
      now = Date.now(),
      ...base
    } = value;
    const recipient = id(base.owner, 'remote social stage owner');
    const effectiveStagedAt = stagedAt ?? new Date(now).toISOString();
    const plan = createSocialExchangeImportPlan(base.package, {
      trustedExporterPublicKey: base.trustedExporterPublicKey,
      expectedExporterGridId: base.expectedExporterGridId,
      recipientPrincipal: recipient,
      trustLabel: base.trustLabel,
      plannedAt: effectiveStagedAt,
      expiresAt: base.expiresAt,
      now
    });
    const stageId = `remote_stage_${digestObject({
      schema: REMOTE_SOCIAL_STAGE_SCHEMA,
      owner: recipient,
      package_digest: plan.package_digest,
      exporter_key_id: plan.exporter_key_id
    })}`;
    const existing = this.db.prepare(`
      SELECT stage_id FROM remote_social_staging
      WHERE owner = ? AND stage_id = ?
    `).get(recipient, stageId);
    if (existing) {
      return super.stageRemoteSocialPackage({
        ...base,
        owner: recipient,
        stagedAt: effectiveStagedAt,
        now
      });
    }

    const policy = normalizeRemoteSocialRetentionPolicy(retentionPolicy);
    const trustedExporter = {
      exporter_grid_id: plan.exporter_grid_id,
      exporter_key_id: plan.exporter_key_id,
      public_key: assertString(
        base.trustedExporterPublicKey,
        'remote social trusted exporter public key',
        { min: 64, max: 8192 }
      )
    };
    const prospectiveBytes = protectedLength(
      this,
      'remote_social_staging',
      'package_json',
      stageId,
      base.package
    ) + protectedLength(
      this,
      'remote_social_staging',
      'import_plan_json',
      stageId,
      plan
    ) + protectedLength(
      this,
      'remote_social_staging',
      'trusted_exporter_json',
      stageId,
      trustedExporter
    );
    const assessment = this.getRemoteSocialRetentionAssessment(recipient, { policy });
    assertCapacity(
      assessment.stage_count + 1,
      policy.max_stages,
      'remote_social_stage_count_quota_exceeded',
      'Remote social staged review count would exceed retention policy'
    );
    assertCapacity(
      assessment.stage_protected_bytes + prospectiveBytes,
      policy.max_stage_protected_bytes,
      'remote_social_stage_bytes_quota_exceeded',
      'Remote social staged review bytes would exceed retention policy'
    );

    return super.stageRemoteSocialPackage({
      ...base,
      owner: recipient,
      stagedAt: effectiveStagedAt,
      now
    });
  }

  admitRemoteSocialStage(input) {
    const value = assertPlainObject(input, 'retained remote social admission input');
    const {
      retentionPolicy,
      now = Date.now(),
      ...base
    } = value;
    const recipient = id(base.owner, 'remote social admission owner');
    const stageId = id(base.stageId, 'remote social admission stage_id');
    const existing = this.db.prepare(`
      SELECT admission_id FROM remote_social_admissions
      WHERE owner = ? AND stage_id = ?
    `).get(recipient, stageId);
    if (existing) {
      return super.admitRemoteSocialStage({ ...base, owner: recipient, stageId, now });
    }

    const stage = this.getRemoteSocialStage(recipient, stageId);
    const verified = verifySocialExchangePackage(stage.package_json, {
      trustedExporterPublicKey: stage.trusted_exporter_json.public_key,
      expectedExporterGridId: stage.exporter_grid_id,
      now
    });
    const policy = normalizeRemoteSocialRetentionPolicy(retentionPolicy);
    const assessment = this.getRemoteSocialRetentionAssessment(recipient, { policy });
    const prospective = prospectiveObservationStorage(this, recipient, stage, verified);
    assertCapacity(
      assessment.admission_count + 1,
      policy.max_admissions,
      'remote_social_admission_count_quota_exceeded',
      'Remote social admission count would exceed retention policy'
    );
    assertCapacity(
      assessment.observation_count + prospective.count,
      policy.max_observations,
      'remote_social_observation_count_quota_exceeded',
      'Remote social observation count would exceed retention policy'
    );
    assertCapacity(
      assessment.observation_protected_bytes + prospective.protected_bytes,
      policy.max_observation_protected_bytes,
      'remote_social_observation_bytes_quota_exceeded',
      'Remote social observation bytes would exceed retention policy'
    );

    return super.admitRemoteSocialStage({ ...base, owner: recipient, stageId, now });
  }

  getRemoteSocialRetentionAssessment(owner, { retentionPolicy, policy } = {}) {
    const recipient = id(owner, 'remote social retention owner');
    const normalized = normalizeRemoteSocialRetentionPolicy(
      retentionPolicy ?? policy
    );
    const stage = this.db.prepare(`
      SELECT COUNT(*) AS count,
             COALESCE(SUM(LENGTH(package_json) + LENGTH(import_plan_json) + LENGTH(trusted_exporter_json)), 0) AS bytes
      FROM remote_social_staging WHERE owner = ?
    `).get(recipient);
    const admissions = this.db.prepare(`
      SELECT COUNT(*) AS count FROM remote_social_admissions WHERE owner = ?
    `).get(recipient);
    const observations = this.db.prepare(`
      SELECT COUNT(*) AS count,
             COALESCE(SUM(LENGTH(object_json)), 0) AS bytes
      FROM remote_social_observations WHERE owner = ?
    `).get(recipient);
    const receipts = this.db.prepare(`
      SELECT COUNT(*) AS count FROM remote_social_retention_receipts WHERE owner = ?
    `).get(recipient);
    const expired = this.db.prepare(`
      SELECT COUNT(*) AS count,
             COALESCE(SUM(LENGTH(s.package_json) + LENGTH(s.import_plan_json) + LENGTH(s.trusted_exporter_json)), 0) AS bytes
      FROM remote_social_staging s
      LEFT JOIN remote_social_admissions a ON a.stage_id = s.stage_id
      WHERE s.owner = ? AND a.admission_id IS NULL AND s.expires_at <= ?
    `).get(recipient, new Date().toISOString());
    const result = {
      schema: 'axiom-remote-social-retention-assessment.v1',
      owner: recipient,
      policy: normalized,
      stage_count: Number(stage.count),
      stage_protected_bytes: Number(stage.bytes),
      admission_count: Number(admissions.count),
      observation_count: Number(observations.count),
      observation_protected_bytes: Number(observations.bytes),
      retention_receipt_count: Number(receipts.count),
      expired_unadmitted_stage_count: Number(expired.count),
      expired_unadmitted_protected_bytes: Number(expired.bytes),
      violations: []
    };
    for (const [field, maximum] of [
      ['stage_count', normalized.max_stages],
      ['stage_protected_bytes', normalized.max_stage_protected_bytes],
      ['admission_count', normalized.max_admissions],
      ['observation_count', normalized.max_observations],
      ['observation_protected_bytes', normalized.max_observation_protected_bytes],
      ['retention_receipt_count', normalized.max_retention_receipts]
    ]) {
      if (result[field] > maximum) result.violations.push(field);
    }
    return Object.freeze({
      ...result,
      violations: Object.freeze(result.violations),
      within_policy: result.violations.length === 0,
      network_effect: 'none',
      authority_effect: 'none'
    });
  }

  listExpiredUnadmittedRemoteSocialStages(owner, {
    limit = 50,
    now = Date.now()
  } = {}) {
    const recipient = id(owner, 'remote social retention owner');
    const safeLimit = boundedInteger(limit, 'remote social retention candidate limit', 1, 100);
    const rows = this.db.prepare(`
      SELECT s.stage_id, s.package_digest, s.exporter_grid_id, s.exporter_key_id,
             s.created_at, s.expires_at,
             LENGTH(s.package_json) + LENGTH(s.import_plan_json) + LENGTH(s.trusted_exporter_json) AS protected_bytes
      FROM remote_social_staging s
      LEFT JOIN remote_social_admissions a ON a.stage_id = s.stage_id
      WHERE s.owner = ? AND a.admission_id IS NULL AND s.expires_at <= ?
      ORDER BY s.expires_at, s.stage_id
      LIMIT ?
    `).all(recipient, new Date(now).toISOString(), safeLimit + 1);
    const truncated = rows.length > safeLimit;
    if (truncated) rows.pop();
    return {
      stages: rows.map(row => Object.freeze({
        ...row,
        protected_bytes: Number(row.protected_bytes),
        eligible_for_payload_reclamation: true,
        admission_evidence_deleted: false,
        network_effect: 'none',
        authority_effect: 'none'
      })),
      truncated
    };
  }

  expireUnadmittedRemoteSocialStage({
    owner,
    stageId,
    traceId,
    reasonCode = 'review-expired',
    retentionPolicy,
    now = Date.now()
  }) {
    const recipient = id(owner, 'remote social retention owner');
    const stage = id(stageId, 'remote social retention stage_id');
    id(traceId, 'remote social retention trace_id');
    const reason = assertString(reasonCode, 'remote social retention reason_code', {
      min: 1,
      max: 64,
      pattern: REASON
    });
    const prior = this.db.prepare(`
      SELECT * FROM remote_social_retention_receipts
      WHERE owner = ? AND stage_id = ?
    `).get(recipient, stage);
    if (prior) return this.decodeRetentionReceipt(prior);

    const policy = normalizeRemoteSocialRetentionPolicy(retentionPolicy);
    const receiptCount = Number(this.db.prepare(`
      SELECT COUNT(*) AS count FROM remote_social_retention_receipts WHERE owner = ?
    `).get(recipient).count);
    assertCapacity(
      receiptCount + 1,
      policy.max_retention_receipts,
      'remote_social_retention_receipt_quota_exceeded',
      'Remote social retention receipt count would exceed retention policy'
    );

    const row = this.db.prepare(`
      SELECT * FROM remote_social_staging WHERE owner = ? AND stage_id = ?
    `).get(recipient, stage);
    if (!row) {
      throw new AxiomError(
        'remote_social_stage_not_found',
        'Remote social review stage was not found',
        404
      );
    }
    if (Date.parse(row.expires_at) > now) {
      throw new AxiomError(
        'remote_social_stage_not_expired',
        'Remote social review stage has not expired',
        409
      );
    }
    const admission = this.db.prepare(`
      SELECT admission_id FROM remote_social_admissions WHERE stage_id = ?
    `).get(stage);
    if (admission) {
      throw new AxiomError(
        'remote_social_stage_is_admission_dependency',
        'Admitted remote social stage payload is required for replay and cannot be reclaimed',
        409,
        { admission_id: admission.admission_id }
      );
    }
    const decoded = this.decodeRemoteStage(row);
    const logicalBytes = logicalStageBytes(decoded);
    const protectedBytes = protectedStageBytes(row);
    const occurredAt = new Date(now).toISOString();
    const payload = Object.freeze({
      schema: REMOTE_SOCIAL_RETENTION_RECEIPT_SCHEMA,
      action: ACTION,
      owner: recipient,
      stage_id: stage,
      package_digest: row.package_digest,
      exporter_grid_id: row.exporter_grid_id,
      exporter_key_id: row.exporter_key_id,
      import_plan_digest: decoded.import_plan_json.plan_digest,
      stage_created_at: row.created_at,
      stage_expires_at: row.expires_at,
      logical_bytes_reclaimed: logicalBytes,
      protected_bytes_reclaimed: protectedBytes,
      reason_code: reason,
      occurred_at: occurredAt,
      payload_deleted: true,
      admission_evidence_deleted: false,
      network_effect: 'none',
      authority_effect: 'none'
    });
    const receiptId = `remote_retention_${digestObject(payload)}`;
    this.appendEvents({
      traceId,
      actor: recipient,
      events: [{
        kind: REMOTE_SOCIAL_STAGE_EXPIRED_EVENT,
        subject: receiptId,
        payload: { ...payload, receipt_id: receiptId }
      }]
    });
    return this.getRemoteSocialRetentionReceipt(recipient, receiptId);
  }

  materializeRemoteSocialRetention(event) {
    const payload = validateRetentionEvent(event, event.actor);
    const existing = this.db.prepare(`
      SELECT * FROM remote_social_retention_receipts WHERE stage_id = ?
    `).get(payload.stage_id);
    if (existing) {
      if (existing.receipt_id !== payload.receipt_id) {
        throw new ValidationError('remote social retention stage has conflicting cleanup history');
      }
      return;
    }

    const admission = this.db.prepare(`
      SELECT admission_id FROM remote_social_admissions WHERE stage_id = ?
    `).get(payload.stage_id);
    if (admission) {
      throw new ValidationError('remote social retention cannot delete an admitted stage replay dependency');
    }
    const stage = this.db.prepare(`
      SELECT * FROM remote_social_staging
      WHERE owner = ? AND stage_id = ?
    `).get(payload.owner, payload.stage_id);
    if (stage) {
      const decoded = this.decodeRemoteStage(stage);
      if (
        stage.package_digest !== payload.package_digest
        || stage.exporter_grid_id !== payload.exporter_grid_id
        || stage.exporter_key_id !== payload.exporter_key_id
        || decoded.import_plan_json.plan_digest !== payload.import_plan_digest
        || stage.created_at !== payload.stage_created_at
        || stage.expires_at !== payload.stage_expires_at
        || logicalStageBytes(decoded) !== payload.logical_bytes_reclaimed
        || protectedStageBytes(stage) !== payload.protected_bytes_reclaimed
        || Date.parse(stage.expires_at) > Date.parse(payload.occurred_at)
      ) {
        throw new ValidationError('remote social retention event does not match the expired staged payload');
      }
      this.db.prepare(`DELETE FROM remote_social_staging WHERE stage_id = ?`).run(stage.stage_id);
    }

    this.db.prepare(`
      INSERT INTO remote_social_retention_receipts(
        receipt_id, owner, action, stage_id, package_digest,
        exporter_grid_id, exporter_key_id, import_plan_digest,
        stage_created_at, stage_expires_at, logical_bytes_reclaimed,
        protected_bytes_reclaimed, reason_code, occurred_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      payload.receipt_id,
      payload.owner,
      payload.action,
      payload.stage_id,
      payload.package_digest,
      payload.exporter_grid_id,
      payload.exporter_key_id,
      payload.import_plan_digest,
      payload.stage_created_at,
      payload.stage_expires_at,
      payload.logical_bytes_reclaimed,
      payload.protected_bytes_reclaimed,
      payload.reason_code,
      payload.occurred_at
    );
  }

  getRemoteSocialRetentionReceipt(owner, receiptId) {
    const recipient = id(owner, 'remote social retention owner');
    const receipt = id(receiptId, 'remote social retention receipt_id');
    const row = this.db.prepare(`
      SELECT * FROM remote_social_retention_receipts
      WHERE owner = ? AND receipt_id = ?
    `).get(recipient, receipt);
    if (!row) {
      throw new AxiomError(
        'remote_social_retention_receipt_not_found',
        'Remote social retention receipt was not found',
        404
      );
    }
    return this.decodeRetentionReceipt(row);
  }

  listRemoteSocialRetentionReceipts(owner, { limit = 50 } = {}) {
    const recipient = id(owner, 'remote social retention owner');
    const safeLimit = boundedInteger(limit, 'remote social retention receipt limit', 1, 100);
    const rows = this.db.prepare(`
      SELECT * FROM remote_social_retention_receipts
      WHERE owner = ? ORDER BY occurred_at DESC, receipt_id DESC LIMIT ?
    `).all(recipient, safeLimit + 1);
    const truncated = rows.length > safeLimit;
    if (truncated) rows.pop();
    return {
      receipts: rows.map(row => this.decodeRetentionReceipt(row)),
      truncated
    };
  }

  decodeRetentionReceipt(row) {
    return Object.freeze({
      schema: REMOTE_SOCIAL_RETENTION_RECEIPT_SCHEMA,
      receipt_id: row.receipt_id,
      owner: row.owner,
      action: row.action,
      stage_id: row.stage_id,
      package_digest: row.package_digest,
      exporter_grid_id: row.exporter_grid_id,
      exporter_key_id: row.exporter_key_id,
      import_plan_digest: row.import_plan_digest,
      stage_created_at: row.stage_created_at,
      stage_expires_at: row.stage_expires_at,
      logical_bytes_reclaimed: row.logical_bytes_reclaimed,
      protected_bytes_reclaimed: row.protected_bytes_reclaimed,
      reason_code: row.reason_code,
      occurred_at: row.occurred_at,
      payload_deleted: true,
      admission_evidence_deleted: false,
      network_effect: 'none',
      authority_effect: 'none'
    });
  }
}

function validateRetentionEvent(event, actor) {
  const value = assertPlainObject(event, 'remote social retention event');
  if (value.kind !== REMOTE_SOCIAL_STAGE_EXPIRED_EVENT) {
    throw new ValidationError('unsupported remote social retention event');
  }
  const p = assertPlainObject(value.payload, 'remote social retention payload');
  const expected = new Set([
    'schema', 'receipt_id', 'action', 'owner', 'stage_id', 'package_digest',
    'exporter_grid_id', 'exporter_key_id', 'import_plan_digest',
    'stage_created_at', 'stage_expires_at', 'logical_bytes_reclaimed',
    'protected_bytes_reclaimed', 'reason_code', 'occurred_at', 'payload_deleted',
    'admission_evidence_deleted', 'network_effect', 'authority_effect'
  ]);
  for (const key of Object.keys(p)) {
    if (!expected.has(key)) {
      throw new ValidationError(`remote social retention payload contains unsupported field ${key}`);
    }
  }
  for (const key of expected) {
    if (!(key in p)) throw new ValidationError(`remote social retention payload is missing ${key}`);
  }
  if (p.schema !== REMOTE_SOCIAL_RETENTION_RECEIPT_SCHEMA || p.action !== ACTION) {
    throw new ValidationError('remote social retention payload schema/action is invalid');
  }
  const output = Object.freeze({
    schema: REMOTE_SOCIAL_RETENTION_RECEIPT_SCHEMA,
    receipt_id: id(p.receipt_id, 'remote social retention receipt_id'),
    action: ACTION,
    owner: id(p.owner, 'remote social retention owner'),
    stage_id: id(p.stage_id, 'remote social retention stage_id'),
    package_digest: digest(p.package_digest, 'remote social retention package_digest'),
    exporter_grid_id: id(p.exporter_grid_id, 'remote social retention exporter_grid_id'),
    exporter_key_id: digest(p.exporter_key_id, 'remote social retention exporter_key_id'),
    import_plan_digest: digest(p.import_plan_digest, 'remote social retention import_plan_digest'),
    stage_created_at: timestamp(p.stage_created_at, 'remote social retention stage_created_at'),
    stage_expires_at: timestamp(p.stage_expires_at, 'remote social retention stage_expires_at'),
    logical_bytes_reclaimed: boundedInteger(
      p.logical_bytes_reclaimed,
      'remote social retention logical_bytes_reclaimed',
      1,
      16 * 1024 * 1024
    ),
    protected_bytes_reclaimed: boundedInteger(
      p.protected_bytes_reclaimed,
      'remote social retention protected_bytes_reclaimed',
      1,
      32 * 1024 * 1024
    ),
    reason_code: assertString(p.reason_code, 'remote social retention reason_code', {
      min: 1,
      max: 64,
      pattern: REASON
    }),
    occurred_at: timestamp(p.occurred_at, 'remote social retention occurred_at'),
    payload_deleted: p.payload_deleted,
    admission_evidence_deleted: p.admission_evidence_deleted,
    network_effect: p.network_effect,
    authority_effect: p.authority_effect
  });
  if (output.owner !== actor) {
    throw new ValidationError('remote social retention owner must match the authenticated actor');
  }
  if (value.subject !== output.receipt_id) {
    throw new ValidationError('remote social retention event subject must equal receipt_id');
  }
  if (
    output.payload_deleted !== true
    || output.admission_evidence_deleted !== false
    || output.network_effect !== 'none'
    || output.authority_effect !== 'none'
  ) {
    throw new ValidationError('remote social retention claim boundary is invalid');
  }
  if (Date.parse(output.stage_expires_at) > Date.parse(output.occurred_at)) {
    throw new ValidationError('remote social stage cannot be reclaimed before expiry');
  }
  return output;
}

function prospectiveObservationStorage(store, owner, stage, verified) {
  const entries = [
    ...verified.personas.map(object => ({
      kind: 'persona', digest: object.projection_digest, object
    })),
    ...verified.publications.map(object => ({
      kind: 'publication', digest: object.projection_digest, object
    })),
    ...verified.transitions.map(object => ({
      kind: 'transition', digest: object.transition_digest, object
    }))
  ];
  let count = 0;
  let protectedBytes = 0;
  for (const entry of entries) {
    const existing = store.db.prepare(`
      SELECT observation_id FROM remote_social_observations
      WHERE owner = ? AND exporter_key_id = ? AND object_kind = ? AND object_digest = ?
    `).get(owner, stage.exporter_key_id, entry.kind, entry.digest);
    if (existing) continue;
    const observationId = `remote_observation_${digestObject({
      schema: REMOTE_SOCIAL_OBSERVATION_SCHEMA,
      owner,
      exporter_key_id: stage.exporter_key_id,
      object_kind: entry.kind,
      object_digest: entry.digest
    })}`;
    count += 1;
    protectedBytes += protectedLength(
      store,
      'remote_social_observations',
      'object_json',
      observationId,
      entry.object
    );
  }
  return { count, protected_bytes: protectedBytes };
}

function protectedLength(store, table, column, key, value) {
  return Buffer.byteLength(
    store.protector.seal(value, `axiom:${table}.${column}:${key}`),
    'utf8'
  );
}

function logicalStageBytes(stage) {
  return Buffer.byteLength(canonicalJson(stage.package_json), 'utf8')
    + Buffer.byteLength(canonicalJson(stage.import_plan_json), 'utf8')
    + Buffer.byteLength(canonicalJson(stage.trusted_exporter_json), 'utf8');
}

function protectedStageBytes(row) {
  return Buffer.byteLength(row.package_json, 'utf8')
    + Buffer.byteLength(row.import_plan_json, 'utf8')
    + Buffer.byteLength(row.trusted_exporter_json, 'utf8');
}

function assertCapacity(value, maximum, code, message) {
  if (value <= maximum) return;
  throw new AxiomError(code, message, 409, { value, maximum });
}

function boundedInteger(value, label, min, max) {
  if (!Number.isSafeInteger(value) || value < min || value > max) {
    throw new ValidationError(`${label} must be an integer between ${min} and ${max}`);
  }
  return value;
}

function id(value, label) {
  return assertString(value, label, { min: 1, max: 192, pattern: ID });
}

function digest(value, label) {
  return assertString(value, label, { min: 64, max: 64, pattern: DIGEST });
}

function timestamp(value, label) {
  const text = assertString(value, label, { min: 24, max: 24 });
  const date = new Date(text);
  if (!Number.isFinite(date.valueOf()) || date.toISOString() !== text) {
    throw new ValidationError(`${label} must be a canonical UTC ISO timestamp`);
  }
  return text;
}
