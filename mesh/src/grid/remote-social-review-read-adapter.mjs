import { ValidationError } from '../lib/canonical.mjs';
import { normalizeRemoteSocialRetentionPolicy } from './remote-social-retention-store.mjs';

const ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/;

export function createRemoteSocialReviewReadAdapter(store) {
  if (!store?.db || typeof store.openJson !== 'function') {
    throw new ValidationError('Remote social review read adapter requires an initialized Grid store');
  }
  const db = store.db;

  return Object.freeze({
    listRemoteSocialStages(owner, { limit = 20 } = {}) {
      const recipient = ownerId(owner);
      const safeLimit = bounded(limit, 1, 50, 'remote review stage limit');
      if (!tableExists(db, 'remote_social_staging')) return { stages: [], truncated: false };
      const rows = db.prepare(`
        SELECT * FROM remote_social_staging
        WHERE owner = ? ORDER BY created_at DESC, stage_id DESC LIMIT ?
      `).all(recipient, safeLimit + 1);
      const truncated = rows.length > safeLimit;
      if (truncated) rows.pop();
      return {
        stages: rows.map(row => decodeProtected(store, 'remote_social_staging', 'stage_id', row, [
          'package_json', 'import_plan_json', 'trusted_exporter_json'
        ])),
        truncated
      };
    },

    listRemoteSocialAdmissions(owner, { limit = 50 } = {}) {
      const recipient = ownerId(owner);
      const safeLimit = bounded(limit, 1, 100, 'remote review admission limit');
      if (!tableExists(db, 'remote_social_admissions')) return { admissions: [], truncated: false };
      const rows = db.prepare(`
        SELECT * FROM remote_social_admissions
        WHERE owner = ? ORDER BY admitted_at DESC, admission_id DESC LIMIT ?
      `).all(recipient, safeLimit + 1);
      const truncated = rows.length > safeLimit;
      if (truncated) rows.pop();
      return {
        admissions: rows.map(row => decodeProtected(
          store,
          'remote_social_admissions',
          'admission_id',
          row,
          ['summary_json']
        )),
        truncated
      };
    },

    listRemoteSocialObservations(owner, { limit = 100 } = {}) {
      const recipient = ownerId(owner);
      const safeLimit = bounded(limit, 1, 200, 'remote review observation limit');
      if (!tableExists(db, 'remote_social_observations')) return { observations: [], truncated: false };
      const rows = db.prepare(`
        SELECT * FROM remote_social_observations
        WHERE owner = ? ORDER BY observed_at DESC, observation_id DESC LIMIT ?
      `).all(recipient, safeLimit + 1);
      const truncated = rows.length > safeLimit;
      if (truncated) rows.pop();
      return {
        observations: rows.map(row => decodeProtected(
          store,
          'remote_social_observations',
          'observation_id',
          row,
          ['object_json']
        )),
        truncated
      };
    },

    listRemoteSocialFollows(owner, { limit = 100 } = {}) {
      const recipient = ownerId(owner);
      const safeLimit = bounded(limit, 1, 200, 'remote review follow limit');
      if (!tableExists(db, 'remote_social_follows')) return { follows: [], truncated: false };
      const rows = db.prepare(`
        SELECT * FROM remote_social_follows
        WHERE owner = ? ORDER BY followed_at DESC, follow_id DESC LIMIT ?
      `).all(recipient, safeLimit + 1);
      const truncated = rows.length > safeLimit;
      if (truncated) rows.pop();
      return {
        follows: rows.map(row => decodeProtected(
          store,
          'remote_social_follows',
          'follow_id',
          row,
          ['trust_json']
        )),
        truncated
      };
    },

    getRemoteSocialRetentionAssessment(owner) {
      const recipient = ownerId(owner);
      const policy = normalizeRemoteSocialRetentionPolicy();
      const stage = aggregate(db, 'remote_social_staging', recipient, [
        'package_json', 'import_plan_json', 'trusted_exporter_json'
      ]);
      const admissions = count(db, 'remote_social_admissions', recipient);
      const observations = aggregate(db, 'remote_social_observations', recipient, ['object_json']);
      const receipts = count(db, 'remote_social_retention_receipts', recipient);
      const expired = expiredUnadmitted(db, recipient);
      const result = {
        owner: recipient,
        policy,
        stage_count: stage.count,
        stage_protected_bytes: stage.bytes,
        admission_count: admissions,
        observation_count: observations.count,
        observation_protected_bytes: observations.bytes,
        retention_receipt_count: receipts,
        expired_unadmitted_stage_count: expired.count,
        expired_unadmitted_protected_bytes: expired.bytes,
        violations: []
      };
      for (const [field, maximum] of [
        ['stage_count', policy.max_stages],
        ['stage_protected_bytes', policy.max_stage_protected_bytes],
        ['admission_count', policy.max_admissions],
        ['observation_count', policy.max_observations],
        ['observation_protected_bytes', policy.max_observation_protected_bytes],
        ['retention_receipt_count', policy.max_retention_receipts]
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
    },

    listRemoteSocialRetentionReceipts(owner, { limit = 50 } = {}) {
      const recipient = ownerId(owner);
      const safeLimit = bounded(limit, 1, 100, 'remote review retention receipt limit');
      if (!tableExists(db, 'remote_social_retention_receipts')) {
        return { receipts: [], truncated: false };
      }
      const rows = db.prepare(`
        SELECT * FROM remote_social_retention_receipts
        WHERE owner = ? ORDER BY occurred_at DESC, receipt_id DESC LIMIT ?
      `).all(recipient, safeLimit + 1);
      const truncated = rows.length > safeLimit;
      if (truncated) rows.pop();
      return { receipts: rows, truncated };
    }
  });
}

function decodeProtected(store, table, keyColumn, row, columns) {
  const output = { ...row };
  for (const column of columns) {
    if (output[column] !== null && output[column] !== undefined) {
      output[column] = store.openJson(table, column, row[keyColumn], output[column]);
    }
  }
  return output;
}

function aggregate(db, table, owner, columns) {
  if (!tableExists(db, table)) return { count: 0, bytes: 0 };
  const sum = columns.map(column => `LENGTH(${column})`).join(' + ');
  const row = db.prepare(`
    SELECT COUNT(*) AS count, COALESCE(SUM(${sum}), 0) AS bytes
    FROM ${table} WHERE owner = ?
  `).get(owner);
  return { count: Number(row.count), bytes: Number(row.bytes) };
}

function count(db, table, owner) {
  if (!tableExists(db, table)) return 0;
  return Number(db.prepare(`SELECT COUNT(*) AS count FROM ${table} WHERE owner = ?`).get(owner).count);
}

function expiredUnadmitted(db, owner) {
  if (!tableExists(db, 'remote_social_staging')) return { count: 0, bytes: 0 };
  const admissionExists = tableExists(db, 'remote_social_admissions');
  const join = admissionExists
    ? 'LEFT JOIN remote_social_admissions a ON a.stage_id = s.stage_id'
    : '';
  const predicate = admissionExists ? 'AND a.admission_id IS NULL' : '';
  const row = db.prepare(`
    SELECT COUNT(*) AS count,
      COALESCE(SUM(LENGTH(s.package_json) + LENGTH(s.import_plan_json) + LENGTH(s.trusted_exporter_json)), 0) AS bytes
    FROM remote_social_staging s
    ${join}
    WHERE s.owner = ? AND s.expires_at <= ? ${predicate}
  `).get(owner, new Date().toISOString());
  return { count: Number(row.count), bytes: Number(row.bytes) };
}

function tableExists(db, table) {
  return Boolean(db.prepare(`
    SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?
  `).get(table));
}

function ownerId(value) {
  if (typeof value !== 'string' || !ID.test(value)) {
    throw new ValidationError('Remote social review owner is invalid');
  }
  return value;
}

function bounded(value, min, max, label) {
  if (!Number.isSafeInteger(value) || value < min || value > max) {
    throw new ValidationError(`${label} must be an integer between ${min} and ${max}`);
  }
  return value;
}
