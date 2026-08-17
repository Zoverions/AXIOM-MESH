import {
  AxiomError,
  ValidationError,
  assertString,
  digestObject
} from '../lib/canonical.mjs';
import { createSocialExchangeImportPlan } from '../lib/social-exchange-package.mjs';
import { SocialGridStore } from './social-store.mjs';
import { runRemoteSocialMigrations } from './remote-social-migrations.mjs';

export const REMOTE_SOCIAL_STAGE_SCHEMA = 'axiom-remote-social-stage.v1';

const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,191}$/;
const REMOTE_PROTECTED_COLUMN_MAPPINGS = Object.freeze([
  ['remote_social_staging', 'stage_id', [
    'package_json',
    'import_plan_json',
    'trusted_exporter_json'
  ]]
]);

function boundedInteger(value, label, min, max) {
  if (!Number.isSafeInteger(value) || value < min || value > max) {
    throw new ValidationError(`${label} must be an integer between ${min} and ${max}`);
  }
  return value;
}

function identifier(value, label) {
  return assertString(value, label, { min: 1, max: 192, pattern: IDENTIFIER });
}

function tableExists(db, table) {
  return Boolean(db.prepare(`
    SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?
  `).get(table));
}

function migrateRemoteProtectedMapping(store) {
  for (const [table, keyExpression, columns] of REMOTE_PROTECTED_COLUMN_MAPPINGS) {
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

export class RemoteSocialGridStore extends SocialGridStore {
  initialize() {
    this.remoteSocialReady = false;
    super.initialize();
    this.remoteSocialMigrations = runRemoteSocialMigrations(this.db);
    migrateRemoteProtectedMapping(this);
    this.remoteSocialReady = true;
  }

  getStatus() {
    return {
      ...super.getStatus(),
      remote_social_schema_version: this.remoteSocialMigrations?.version ?? 0,
      remote_social_runtime: 'review-staging-laboratory'
    };
  }

  migrateProtectedColumns() {
    super.migrateProtectedColumns();
    if (this.remoteSocialReady) migrateRemoteProtectedMapping(this);
  }

  stageRemoteSocialPackage({
    owner,
    package: packageValue,
    trustedExporterPublicKey,
    expectedExporterGridId,
    trustLabel,
    stagedAt = new Date().toISOString(),
    expiresAt,
    now = Date.now()
  }) {
    const recipient = identifier(owner, 'remote social stage owner');
    const plan = createSocialExchangeImportPlan(packageValue, {
      trustedExporterPublicKey,
      expectedExporterGridId,
      recipientPrincipal: recipient,
      trustLabel,
      plannedAt: stagedAt,
      expiresAt,
      now
    });
    const stageId = `remote_stage_${digestObject({
      schema: REMOTE_SOCIAL_STAGE_SCHEMA,
      owner: recipient,
      package_digest: plan.package_digest,
      exporter_key_id: plan.exporter_key_id
    })}`;
    const trustedExporter = Object.freeze({
      exporter_grid_id: plan.exporter_grid_id,
      exporter_key_id: plan.exporter_key_id,
      public_key: assertString(
        trustedExporterPublicKey,
        'remote social trusted exporter public key',
        { min: 64, max: 8192 }
      )
    });

    const existing = this.db.prepare(`
      SELECT * FROM remote_social_staging WHERE stage_id = ?
    `).get(stageId);
    if (existing) {
      const decoded = this.decodeRemoteStage(existing);
      if (decoded.import_plan_json.plan_digest !== plan.plan_digest) {
        throw new AxiomError(
          'remote_social_stage_conflict',
          'The verified package is already staged under a different review plan',
          409
        );
      }
      return decoded;
    }

    this.transaction(() => {
      this.db.prepare(`
        INSERT INTO remote_social_staging(
          stage_id, owner, package_digest, exporter_grid_id, exporter_key_id,
          trust_label, package_json, import_plan_json, trusted_exporter_json,
          status, created_at, expires_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'staged', ?, ?)
      `).run(
        stageId,
        recipient,
        plan.package_digest,
        plan.exporter_grid_id,
        plan.exporter_key_id,
        plan.trust_label,
        this.protectJson(
          'remote_social_staging',
          'package_json',
          stageId,
          packageValue
        ),
        this.protectJson(
          'remote_social_staging',
          'import_plan_json',
          stageId,
          plan
        ),
        this.protectJson(
          'remote_social_staging',
          'trusted_exporter_json',
          stageId,
          trustedExporter
        ),
        plan.planned_at,
        plan.expires_at
      );
    });

    return this.getRemoteSocialStage(recipient, stageId);
  }

  getRemoteSocialStage(owner, stageId) {
    const recipient = identifier(owner, 'remote social stage owner');
    const id = identifier(stageId, 'remote social stage_id');
    const row = this.db.prepare(`
      SELECT * FROM remote_social_staging
      WHERE owner = ? AND stage_id = ?
    `).get(recipient, id);
    if (!row) {
      throw new AxiomError(
        'remote_social_stage_not_found',
        'Remote social review stage was not found',
        404
      );
    }
    return this.decodeRemoteStage(row);
  }

  listRemoteSocialStages(owner, { limit = 50 } = {}) {
    const recipient = identifier(owner, 'remote social stage owner');
    const safeLimit = boundedInteger(limit, 'remote social stage limit', 1, 100);
    const rows = this.db.prepare(`
      SELECT * FROM remote_social_staging
      WHERE owner = ?
      ORDER BY created_at DESC, stage_id DESC
      LIMIT ?
    `).all(recipient, safeLimit + 1);
    const truncated = rows.length > safeLimit;
    if (truncated) rows.pop();
    return {
      stages: rows.map(row => this.decodeRemoteStage(row)),
      truncated
    };
  }

  decodeRemoteStage(row) {
    return Object.freeze({
      schema: REMOTE_SOCIAL_STAGE_SCHEMA,
      stage_id: row.stage_id,
      owner: row.owner,
      package_digest: row.package_digest,
      exporter_grid_id: row.exporter_grid_id,
      exporter_key_id: row.exporter_key_id,
      trust_label: row.trust_label,
      package_json: this.openJson(
        'remote_social_staging',
        'package_json',
        row.stage_id,
        row.package_json
      ),
      import_plan_json: this.openJson(
        'remote_social_staging',
        'import_plan_json',
        row.stage_id,
        row.import_plan_json
      ),
      trusted_exporter_json: this.openJson(
        'remote_social_staging',
        'trusted_exporter_json',
        row.stage_id,
        row.trusted_exporter_json
      ),
      status: row.status,
      created_at: row.created_at,
      expires_at: row.expires_at,
      materialization_effect: 'none',
      network_effect: 'none',
      authority_effect: 'none'
    });
  }
}
