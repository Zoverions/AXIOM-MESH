import { createPublicKey, randomUUID } from 'node:crypto';

import {
  AxiomError,
  ValidationError,
  assertString,
  digestObject,
  sha256
} from '../lib/canonical.mjs';
import { verifySocialExchangePackage } from '../lib/social-exchange-package.mjs';
import {
  normalizeSocialTransportOrigin,
  socialTransportPublicKeyId,
  verifySocialTransportEnvelope
} from '../lib/social-transport-envelope.mjs';
import { RemoteSocialGridStore } from './remote-social-store.mjs';
import {
  runRemoteSocialTransportMigrations
} from './remote-social-transport-migrations.mjs';

export const REMOTE_SOCIAL_TRANSPORT_JOB_SCHEMA = 'axiom-remote-social-transport-job.v1';
export const REMOTE_SOCIAL_TRANSPORT_RECEIPT_SCHEMA = 'axiom-remote-social-transport-receipt.v1';

const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,191}$/;
const DIGEST = /^[a-f0-9]{64}$/;
const TRUST_LABEL = /^[a-z][a-z0-9._-]{0,63}$/;
const SAFE_ERROR = /^[a-z0-9_]{1,80}$/;
const MAX_RESPONSE_BYTES = 2_359_296;
const MAX_REVIEW_LIFETIME_MS = 24 * 60 * 60 * 1000;
const LEASE_GRACE_MS = 5_000;
const TRANSPORT_PROTECTED_COLUMN_MAPPINGS = Object.freeze([
  ['remote_social_transport_jobs', 'job_id', ['review_json', 'receipt_json']]
]);

export class RemoteSocialTransportGridStore extends RemoteSocialGridStore {
  initialize() {
    this.remoteSocialTransportReady = false;
    super.initialize();
    this.remoteSocialTransportMigrations = runRemoteSocialTransportMigrations(this.db);
    migrateTransportProtectedMapping(this);
    this.remoteSocialTransportReady = true;
  }

  getStatus() {
    return {
      ...super.getStatus(),
      remote_social_transport_schema_version:
        this.remoteSocialTransportMigrations?.version ?? 0,
      remote_social_transport_runtime: 'pinned-package-fetch-laboratory'
    };
  }

  migrateProtectedColumns() {
    super.migrateProtectedColumns();
    if (this.remoteSocialTransportReady) migrateTransportProtectedMapping(this);
  }

  queueRemoteSocialTransportJob({
    owner,
    sourceOrigin,
    packageDigest,
    trustedTransportPublicKey,
    trustedExporterPublicKey,
    expectedExporterGridId,
    trustLabel,
    plannedAt,
    expiresAt,
    maximumAttempts = 5,
    retryBaseMs = 1_000,
    retryMaximumMs = 60_000,
    now = Date.now()
  }) {
    const recipient = identifier(owner, 'remote social transport owner');
    const origin = normalizeSocialTransportOrigin(sourceOrigin);
    const digest = digestValue(packageDigest, 'remote social transport package_digest');
    const transportKeyId = socialTransportPublicKeyId(trustedTransportPublicKey);
    const exporterKeyId = ed25519PublicKeyId(
      trustedExporterPublicKey,
      'remote social exporter public key'
    );
    if (transportKeyId === exporterKeyId) {
      throw new ValidationError(
        'remote social transport and exporter trust roots must use different keys'
      );
    }
    const exporterGridId = identifier(
      expectedExporterGridId,
      'remote social exporter Grid id'
    );
    const planned = canonicalTimestamp(
      plannedAt ?? new Date(now).toISOString(),
      'remote social transport planned_at'
    );
    const expires = canonicalTimestamp(expiresAt, 'remote social transport expires_at');
    const plannedMs = Date.parse(planned);
    const expiresMs = Date.parse(expires);
    if (plannedMs > now + 300_000) {
      throw new ValidationError('remote social transport planned_at is too far in the future');
    }
    if (expiresMs <= now || expiresMs <= plannedMs) {
      throw new ValidationError('remote social transport review must expire in the future');
    }
    if (expiresMs - plannedMs > MAX_REVIEW_LIFETIME_MS) {
      throw new ValidationError('remote social transport review lifetime exceeds 24 hours');
    }
    const attempts = boundedInteger(
      maximumAttempts,
      'remote social transport maximum_attempts',
      1,
      20
    );
    const baseMs = boundedInteger(
      retryBaseMs,
      'remote social transport retry_base_ms',
      100,
      60_000
    );
    const maximumMs = boundedInteger(
      retryMaximumMs,
      'remote social transport retry_maximum_ms',
      baseMs,
      3_600_000
    );
    const review = Object.freeze({
      schema: 'axiom-remote-social-transport-review.v1',
      trust_label: assertString(trustLabel, 'remote social transport trust_label', {
        min: 1,
        max: 64,
        pattern: TRUST_LABEL
      }),
      planned_at: planned,
      expires_at: expires
    });
    const jobId = `remote_transport_${digestObject({
      schema: REMOTE_SOCIAL_TRANSPORT_JOB_SCHEMA,
      owner: recipient,
      source_origin: origin,
      package_digest: digest,
      transport_key_id: transportKeyId,
      exporter_grid_id: exporterGridId,
      exporter_key_id: exporterKeyId
    })}`;

    const existing = this.db.prepare(`
      SELECT * FROM remote_social_transport_jobs WHERE job_id = ?
    `).get(jobId);
    if (existing) {
      const decoded = this.decodeRemoteSocialTransportJob(existing);
      if (
        digestObject(decoded.review_json) !== digestObject(review)
        || decoded.maximum_attempts !== attempts
        || decoded.retry_base_ms !== baseMs
        || decoded.retry_maximum_ms !== maximumMs
      ) {
        throw new AxiomError(
          'remote_social_transport_job_conflict',
          'The same pinned package transfer is already queued under different review or retry metadata',
          409
        );
      }
      return decoded;
    }

    this.transaction(() => {
      this.db.prepare(`
        INSERT INTO remote_social_transport_jobs(
          job_id, owner, source_origin, package_digest, transport_key_id,
          exporter_grid_id, exporter_key_id, review_json, status, attempts,
          maximum_attempts, retry_base_ms, retry_maximum_ms, next_attempt_at,
          lease_expires_at, last_error_code, stage_id, receipt_json,
          created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', 0, ?, ?, ?, ?, NULL, NULL, NULL, NULL, ?, ?)
      `).run(
        jobId,
        recipient,
        origin,
        digest,
        transportKeyId,
        exporterGridId,
        exporterKeyId,
        this.protectJson(
          'remote_social_transport_jobs',
          'review_json',
          jobId,
          review
        ),
        attempts,
        baseMs,
        maximumMs,
        planned,
        planned,
        planned
      );
    });
    return this.getRemoteSocialTransportJob(recipient, jobId);
  }

  async processRemoteSocialTransportJob({
    owner,
    jobId,
    sourceReadToken,
    trustedTransportPublicKey,
    trustedExporterPublicKey,
    fetchImpl = fetch,
    requestTimeoutMs = 10_000,
    now = Date.now()
  }) {
    const recipient = identifier(owner, 'remote social transport owner');
    const id = identifier(jobId, 'remote social transport job_id');
    const token = assertString(sourceReadToken, 'remote social source read token', {
      min: 32,
      max: 512,
      pattern: /^\S+$/
    });
    const timeoutMs = boundedInteger(
      requestTimeoutMs,
      'remote social transport request_timeout_ms',
      1_000,
      30_000
    );
    const transportKeyId = socialTransportPublicKeyId(trustedTransportPublicKey);
    const exporterKeyId = ed25519PublicKeyId(
      trustedExporterPublicKey,
      'remote social exporter public key'
    );
    if (transportKeyId === exporterKeyId) {
      throw new ValidationError(
        'remote social transport and exporter trust roots must use different keys'
      );
    }

    let row = this.requireTransportJob(recipient, id);
    if (row.transport_key_id !== transportKeyId || row.exporter_key_id !== exporterKeyId) {
      throw new ValidationError('remote social transport supplied trust keys do not match the queued job');
    }
    if (row.status === 'staged') return this.decodeRemoteSocialTransportJob(row);
    if (row.status === 'blocked') {
      throw new AxiomError(
        'remote_social_transport_blocked',
        'Remote social transport job is blocked and requires operator review',
        409,
        { last_error_code: row.last_error_code }
      );
    }

    const review = this.openJson(
      'remote_social_transport_jobs',
      'review_json',
      row.job_id,
      row.review_json
    );
    if (Date.parse(review.expires_at) <= now) {
      this.blockTransportJob(row, 'remote_social_transport_review_expired', now);
      throw new AxiomError(
        'remote_social_transport_review_expired',
        'Remote social transport review window has expired',
        409
      );
    }

    const leased = this.claimTransportJob(row, timeoutMs, now);
    row = leased.row;
    if (row.status === 'staged') {
      return this.decodeRemoteSocialTransportJob(row);
    }
    const requestNonce = randomUUID();
    try {
      const envelope = await fetchSocialTransportEnvelope({
        fetchImpl,
        origin: row.source_origin,
        packageDigest: row.package_digest,
        token,
        requestNonce,
        timeoutMs
      });
      const verifiedTransport = verifySocialTransportEnvelope(envelope, {
        trustedTransportPublicKey,
        expectedSourceOrigin: row.source_origin,
        expectedPackageDigest: row.package_digest,
        expectedExporterGridId: row.exporter_grid_id,
        expectedExporterKeyId: row.exporter_key_id,
        expectedRequestNonce: requestNonce,
        now
      });
      const verifiedPackage = verifySocialExchangePackage(
        verifiedTransport.package,
        {
          trustedExporterPublicKey,
          expectedExporterGridId: row.exporter_grid_id,
          now
        }
      );
      if (
        verifiedPackage.package_digest !== row.package_digest
        || verifiedPackage.exporter.key_id !== row.exporter_key_id
      ) {
        throw new ValidationError('remote social transport verified package does not match the queued job');
      }

      const stage = this.stageRemoteSocialPackage({
        owner: recipient,
        package: verifiedTransport.package,
        trustedExporterPublicKey,
        expectedExporterGridId: row.exporter_grid_id,
        trustLabel: review.trust_label,
        stagedAt: review.planned_at,
        expiresAt: review.expires_at,
        now
      });
      const receipt = Object.freeze({
        schema: REMOTE_SOCIAL_TRANSPORT_RECEIPT_SCHEMA,
        job_id: row.job_id,
        owner: recipient,
        source_origin: row.source_origin,
        package_digest: row.package_digest,
        transport_key_id: row.transport_key_id,
        exporter_grid_id: row.exporter_grid_id,
        exporter_key_id: row.exporter_key_id,
        request_nonce_digest: sha256(requestNonce),
        transport_sent_at: verifiedTransport.statement.sent_at,
        staged_stage_id: stage.stage_id,
        completed_at: new Date(now).toISOString(),
        transport_effect: 'verified-source-fetch',
        staging_effect: 'review-stage-created-or-confirmed',
        admission_effect: 'none',
        follow_effect: 'none',
        federation_effect: 'none',
        authority_effect: 'none'
      });
      this.transaction(() => {
        const current = this.requireTransportJob(recipient, id);
        if (
          current.status !== 'in_flight'
          || current.lease_expires_at !== leased.leaseExpiresAt
        ) {
          throw new AxiomError(
            'remote_social_transport_lease_lost',
            'Remote social transport lease changed before the staged receipt was committed',
            409
          );
        }
        this.db.prepare(`
          UPDATE remote_social_transport_jobs
          SET status = 'staged', stage_id = ?, receipt_json = ?,
              next_attempt_at = NULL, lease_expires_at = NULL,
              last_error_code = NULL, updated_at = ?
          WHERE job_id = ?
        `).run(
          stage.stage_id,
          this.protectJson(
            'remote_social_transport_jobs',
            'receipt_json',
            row.job_id,
            receipt
          ),
          new Date(now).toISOString(),
          row.job_id
        );
      });
      return this.getRemoteSocialTransportJob(recipient, id);
    } catch (error) {
      this.recordTransportFailure(recipient, id, leased.leaseExpiresAt, error, now);
      throw error;
    }
  }

  getRemoteSocialTransportJob(owner, jobId) {
    const row = this.requireTransportJob(
      identifier(owner, 'remote social transport owner'),
      identifier(jobId, 'remote social transport job_id')
    );
    return this.decodeRemoteSocialTransportJob(row);
  }

  listRemoteSocialTransportJobs(owner, { limit = 50 } = {}) {
    const recipient = identifier(owner, 'remote social transport owner');
    const safeLimit = boundedInteger(limit, 'remote social transport job limit', 1, 100);
    const rows = this.db.prepare(`
      SELECT * FROM remote_social_transport_jobs
      WHERE owner = ?
      ORDER BY created_at DESC, job_id DESC
      LIMIT ?
    `).all(recipient, safeLimit + 1);
    const truncated = rows.length > safeLimit;
    if (truncated) rows.pop();
    return {
      jobs: rows.map(row => this.decodeRemoteSocialTransportJob(row)),
      truncated,
      network_effect: 'none'
    };
  }

  requireTransportJob(owner, jobId) {
    const row = this.db.prepare(`
      SELECT * FROM remote_social_transport_jobs
      WHERE owner = ? AND job_id = ?
    `).get(owner, jobId);
    if (!row) {
      throw new AxiomError(
        'remote_social_transport_job_not_found',
        'Remote social transport job was not found',
        404
      );
    }
    return row;
  }

  claimTransportJob(row, timeoutMs, now) {
    return this.transaction(() => {
      const current = this.requireTransportJob(row.owner, row.job_id);
      if (current.status === 'staged') {
        return { row: current, leaseExpiresAt: null };
      }
      if (current.status === 'blocked') {
        throw new AxiomError(
          'remote_social_transport_blocked',
          'Remote social transport job is blocked and requires operator review',
          409
        );
      }
      if (
        current.status === 'in_flight'
        && current.lease_expires_at
        && Date.parse(current.lease_expires_at) > now
      ) {
        throw new AxiomError(
          'remote_social_transport_locked',
          'Another process holds the remote social transport job lease',
          409
        );
      }
      if (
        current.next_attempt_at
        && Date.parse(current.next_attempt_at) > now
      ) {
        throw new AxiomError(
          'remote_social_transport_backing_off',
          'Remote social transport job is backing off before retry',
          409,
          { next_attempt_at: current.next_attempt_at }
        );
      }
      const leaseExpiresAt = new Date(now + timeoutMs + LEASE_GRACE_MS).toISOString();
      this.db.prepare(`
        UPDATE remote_social_transport_jobs
        SET status = 'in_flight', lease_expires_at = ?, updated_at = ?
        WHERE job_id = ?
      `).run(leaseExpiresAt, new Date(now).toISOString(), current.job_id);
      return {
        row: this.requireTransportJob(current.owner, current.job_id),
        leaseExpiresAt
      };
    });
  }

  recordTransportFailure(owner, jobId, leaseExpiresAt, error, now) {
    this.transaction(() => {
      const current = this.requireTransportJob(owner, jobId);
      if (current.status === 'staged') return;
      if (
        current.status !== 'in_flight'
        || current.lease_expires_at !== leaseExpiresAt
      ) {
        throw new AxiomError(
          'remote_social_transport_lease_lost',
          'Remote social transport lease changed while recording failure',
          409
        );
      }
      const attempts = Math.min(current.attempts + 1, current.maximum_attempts);
      const terminal = transportFailureIsTerminal(error)
        || attempts >= current.maximum_attempts;
      const delay = Math.min(
        current.retry_maximum_ms,
        current.retry_base_ms * (2 ** Math.max(0, attempts - 1))
      );
      const code = safeTransportFailureCode(error);
      this.db.prepare(`
        UPDATE remote_social_transport_jobs
        SET status = ?, attempts = ?, next_attempt_at = ?,
            lease_expires_at = NULL, last_error_code = ?, updated_at = ?
        WHERE job_id = ?
      `).run(
        terminal ? 'blocked' : 'pending',
        attempts,
        terminal ? null : new Date(now + delay).toISOString(),
        code,
        new Date(now).toISOString(),
        current.job_id
      );
    });
  }

  blockTransportJob(row, code, now) {
    this.transaction(() => {
      this.db.prepare(`
        UPDATE remote_social_transport_jobs
        SET status = 'blocked', next_attempt_at = NULL,
            lease_expires_at = NULL, last_error_code = ?, updated_at = ?
        WHERE job_id = ?
      `).run(code, new Date(now).toISOString(), row.job_id);
    });
  }

  decodeRemoteSocialTransportJob(row) {
    const review = this.openJson(
      'remote_social_transport_jobs',
      'review_json',
      row.job_id,
      row.review_json
    );
    const receipt = row.receipt_json === null
      ? null
      : this.openJson(
          'remote_social_transport_jobs',
          'receipt_json',
          row.job_id,
          row.receipt_json
        );
    return Object.freeze({
      schema: REMOTE_SOCIAL_TRANSPORT_JOB_SCHEMA,
      job_id: row.job_id,
      owner: row.owner,
      source_origin: row.source_origin,
      package_digest: row.package_digest,
      transport_key_id: row.transport_key_id,
      exporter_grid_id: row.exporter_grid_id,
      exporter_key_id: row.exporter_key_id,
      review_json: review,
      status: row.status,
      attempts: row.attempts,
      maximum_attempts: row.maximum_attempts,
      retry_base_ms: row.retry_base_ms,
      retry_maximum_ms: row.retry_maximum_ms,
      next_attempt_at: row.next_attempt_at,
      lease_expires_at: row.lease_expires_at,
      last_error_code: row.last_error_code,
      stage_id: row.stage_id,
      receipt_json: receipt,
      created_at: row.created_at,
      updated_at: row.updated_at,
      automatic_admission: false,
      automatic_follow: false,
      authority_effect: 'none'
    });
  }
}

async function fetchSocialTransportEnvelope({
  fetchImpl,
  origin,
  packageDigest,
  token,
  requestNonce,
  timeoutMs
}) {
  let response;
  try {
    response = await fetchImpl(
      `${origin}/v1/social/exchange/packages/${packageDigest}`,
      {
        method: 'GET',
        redirect: 'error',
        signal: AbortSignal.timeout(timeoutMs),
        headers: {
          authorization: `Bearer ${token}`,
          accept: 'application/json',
          'x-axiom-social-request-nonce': requestNonce
        }
      }
    );
  } catch {
    throw new AxiomError(
      'remote_social_transport_source_unavailable',
      'Remote social transport source is unavailable',
      503
    );
  }
  const payload = await boundedJson(response, MAX_RESPONSE_BYTES);
  if (response.status !== 200) {
    const remoteCode = payload?.error?.code;
    throw new AxiomError(
      'remote_social_transport_source_rejected',
      'Remote social transport source rejected the package request',
      response.status,
      {
        remote_code: typeof remoteCode === 'string' ? remoteCode : 'unknown'
      }
    );
  }
  return payload;
}

async function boundedJson(response, maximumBytes) {
  const contentType = response.headers.get('content-type') ?? '';
  if (!contentType.includes('application/json')) {
    throw new ValidationError('remote social transport source did not return JSON');
  }
  const reader = response.body?.getReader();
  if (!reader) throw new ValidationError('remote social transport response body is missing');
  const chunks = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maximumBytes) {
      await reader.cancel();
      throw new ValidationError('remote social transport response exceeds the byte limit');
    }
    chunks.push(Buffer.from(value));
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new ValidationError('remote social transport source returned invalid JSON');
  }
}

function migrateTransportProtectedMapping(store) {
  for (const [table, keyExpression, columns] of TRANSPORT_PROTECTED_COLUMN_MAPPINGS) {
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

function transportFailureIsTerminal(error) {
  if (error instanceof ValidationError) return true;
  if (
    error?.code === 'remote_social_transport_source_rejected'
    && Number.isInteger(error?.status)
    && error.status >= 400
    && error.status < 500
  ) return true;
  return false;
}

function safeTransportFailureCode(error) {
  if (error instanceof ValidationError) return 'remote_social_transport_evidence_invalid';
  if (typeof error?.code === 'string' && SAFE_ERROR.test(error.code)) return error.code;
  return 'remote_social_transport_failed';
}

function ed25519PublicKeyId(value, label) {
  const raw = assertString(value, label, { min: 64, max: 8192 });
  let key;
  try {
    key = createPublicKey(raw);
  } catch {
    throw new ValidationError(`${label} is invalid`);
  }
  if (key.asymmetricKeyType !== 'ed25519') {
    throw new ValidationError(`${label} must use Ed25519`);
  }
  return sha256(key.export({ type: 'spki', format: 'pem' }).toString());
}

function tableExists(db, table) {
  return Boolean(db.prepare(`
    SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?
  `).get(table));
}

function boundedInteger(value, label, min, max) {
  if (!Number.isSafeInteger(value) || value < min || value > max) {
    throw new ValidationError(`${label} must be an integer between ${min} and ${max}`);
  }
  return value;
}

function identifier(value, label) {
  return assertString(value, label, { min: 1, max: 192, pattern: IDENTIFIER });
}

function digestValue(value, label) {
  return assertString(value, label, { min: 64, max: 64, pattern: DIGEST });
}

function canonicalTimestamp(value, label) {
  const text = assertString(value, label, { min: 24, max: 24 });
  const date = new Date(text);
  if (!Number.isFinite(date.valueOf()) || date.toISOString() !== text) {
    throw new ValidationError(`${label} must be a canonical UTC ISO timestamp`);
  }
  return text;
}
