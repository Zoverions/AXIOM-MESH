import {
  ValidationError,
  assertPlainObject,
  assertString,
  digestObject
} from './canonical.mjs';
import {
  amnTrustEvidenceDigest,
  amnTrustStatementDigest,
  verifyAmnTrustStatement
} from './amn-trust-evidence.mjs';

export const AMN_VERIFICATION_RESULT_SCHEMA = 'axiom-amn-verification-result.v1';
export const AMN_TRUST_PROVIDER_RESULT_SCHEMA = 'axiom-amn-trust-provider-result.v1';
export const AMN_SHADOW_RECORD_SCHEMA = 'axiom-amn-shadow-record.v1';
export const AMN_SHADOW_RECEIPT_SCHEMA = 'axiom-amn-shadow-receipt.v1';
export const AMN_SHADOW_QUEUE_SNAPSHOT_SCHEMA = 'axiom-amn-shadow-queue-snapshot.v1';

const ID = /^[A-Za-z0-9][A-Za-z0-9_.:@/-]{0,191}$/;
const DIGEST = /^[a-f0-9]{64}$/;
const REASON = /^[a-z][a-z0-9._-]{0,63}$/;
const PROVIDER_KINDS = new Set(['local', 'axiom-shadow']);
const TRUST_STATES = new Set(['verified', 'rejected']);
const SHADOW_STATES = new Set(['disabled', 'queued', 'duplicate', 'not-queued', 'failed']);
const SINK_KINDS = new Set(['test-shadow-sink', 'axiom-grid-shadow-candidate']);
const PROVIDER_VERIFICATIONS = new WeakSet();

const VERIFICATION_KEYS = new Set([
  'schema',
  'provider_kind',
  'trust_state',
  'reason_code',
  'issuer_id',
  'subject_id',
  'statement_schema',
  'statement_digest',
  'evidence_digest',
  'cryptographic_validity',
  'schema_validity',
  'authority_effect',
  'delegation_effect',
  'truth_claimed',
  'hardware_attestation_claimed',
  'global_currentness_claimed',
  'verification_result_digest'
]);

const PROVIDER_RESULT_KEYS = new Set([
  'schema',
  'provider_kind',
  'verification',
  'shadow'
]);

const SHADOW_RESULT_KEYS = new Set([
  'status',
  'reason_code',
  'record_digest',
  'sequence'
]);

const SHADOW_RECORD_KEYS = new Set([
  'schema',
  'sequence',
  'enqueued_at',
  'provider_kind',
  'verification_result_digest',
  'source_schema',
  'source_statement_digest',
  'source_evidence_digest',
  'issuer_id',
  'subject_id',
  'trust_state',
  'authority_effect',
  'delegation_effect',
  'runtime_authority_changed',
  'grid_persistence_claimed',
  'shadow_record_digest'
]);

const SHADOW_RECEIPT_KEYS = new Set([
  'schema',
  'sink_kind',
  'sink_receipt_id',
  'sequence',
  'accepted_at',
  'shadow_record_digest',
  'source_evidence_digest',
  'authority_effect',
  'delegation_effect',
  'runtime_authority_changed',
  'grid_persistence_claimed',
  'receipt_digest'
]);

function exactKeys(raw, allowed, label) {
  const value = assertPlainObject(raw, label);
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) {
      throw new ValidationError(`${label} contains unsupported field ${key}`);
    }
  }
  return value;
}

function identifier(value, label) {
  return assertString(value, label, { min: 1, max: 192, pattern: ID });
}

function nullableIdentifier(value, label) {
  return value === null ? null : identifier(value, label);
}

function digest(value, label) {
  return assertString(value, label, { min: 64, max: 64, pattern: DIGEST });
}

function nullableDigest(value, label) {
  return value === null ? null : digest(value, label);
}

function canonicalTimestamp(value, label) {
  const text = assertString(value, label, { min: 24, max: 24 });
  const parsed = new Date(text);
  if (Number.isNaN(parsed.valueOf()) || parsed.toISOString() !== text) {
    throw new ValidationError(`${label} must be a canonical UTC ISO timestamp`);
  }
  return text;
}

function positiveInteger(value, label) {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new ValidationError(`${label} must be a positive safe integer`);
  }
  return value;
}

function nonNegativeInteger(value, label) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new ValidationError(`${label} must be a non-negative safe integer`);
  }
  return value;
}

function oneOf(value, label, allowed) {
  const text = assertString(value, label, { min: 1, max: 64 });
  if (!allowed.has(text)) throw new ValidationError(`${label} is unsupported`);
  return text;
}

function boolean(value, label) {
  if (typeof value !== 'boolean') throw new ValidationError(`${label} must be boolean`);
  return value;
}

function normalizeTrustedIssuers(raw) {
  if (raw instanceof Map) {
    if (raw.size < 1 || raw.size > 256) {
      throw new ValidationError('AMN trusted issuer map must contain 1-256 entries');
    }
    const copy = new Map();
    for (const [issuerId, publicKey] of raw) {
      copy.set(identifier(issuerId, 'AMN trusted issuer id'), publicKey);
    }
    return copy;
  }
  const value = assertPlainObject(raw, 'AMN trusted issuers');
  const entries = Object.entries(value);
  if (entries.length < 1 || entries.length > 256) {
    throw new ValidationError('AMN trusted issuers must contain 1-256 entries');
  }
  return new Map(entries.map(([issuerId, publicKey]) => [
    identifier(issuerId, 'AMN trusted issuer id'),
    publicKey
  ]));
}

function reasonFromError(error) {
  const message = String(error?.message ?? '');
  if (message.includes('schema is unsupported')) return 'unsupported_schema';
  if (message.includes('issuer key substitution')) return 'issuer_key_substitution';
  if (message.includes('issuer signature is invalid')) return 'invalid_signature';
  if (message.includes('statement digest mismatch')) return 'statement_digest_mismatch';
  if (message.includes('evidence_digest mismatch')) return 'evidence_digest_mismatch';
  if (message.includes('subject_id does not match claims')) return 'subject_mismatch';
  if (message.includes('non-authority boundary')) return 'authority_boundary_violation';
  return 'invalid_evidence';
}

function safeEnvelopeMetadata(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return {
      issuer_id: null,
      subject_id: null,
      statement_schema: null,
      statement_digest: null,
      evidence_digest: null
    };
  }
  return {
    issuer_id: typeof raw.issuer_id === 'string' && ID.test(raw.issuer_id) ? raw.issuer_id : null,
    subject_id: typeof raw.subject_id === 'string' && ID.test(raw.subject_id) ? raw.subject_id : null,
    statement_schema: typeof raw.schema === 'string' && raw.schema.length <= 96 ? raw.schema : null,
    statement_digest: typeof raw.statement_digest === 'string' && DIGEST.test(raw.statement_digest)
      ? raw.statement_digest
      : null,
    evidence_digest: typeof raw.evidence_digest === 'string' && DIGEST.test(raw.evidence_digest)
      ? raw.evidence_digest
      : null
  };
}

function finalizeVerification(core, { providerProduced = false } = {}) {
  const normalized = Object.freeze({
    schema: AMN_VERIFICATION_RESULT_SCHEMA,
    provider_kind: oneOf(core.provider_kind, 'AMN verification provider_kind', PROVIDER_KINDS),
    trust_state: oneOf(core.trust_state, 'AMN verification trust_state', TRUST_STATES),
    reason_code: assertString(core.reason_code, 'AMN verification reason_code', {
      min: 1,
      max: 64,
      pattern: REASON
    }),
    issuer_id: nullableIdentifier(core.issuer_id, 'AMN verification issuer_id'),
    subject_id: nullableIdentifier(core.subject_id, 'AMN verification subject_id'),
    statement_schema: core.statement_schema === null
      ? null
      : assertString(core.statement_schema, 'AMN verification statement_schema', { min: 1, max: 96 }),
    statement_digest: nullableDigest(core.statement_digest, 'AMN verification statement_digest'),
    evidence_digest: nullableDigest(core.evidence_digest, 'AMN verification evidence_digest'),
    cryptographic_validity: boolean(core.cryptographic_validity, 'AMN verification cryptographic_validity'),
    schema_validity: boolean(core.schema_validity, 'AMN verification schema_validity'),
    authority_effect: core.authority_effect === 'none'
      ? 'none'
      : (() => { throw new ValidationError('AMN verification authority_effect must be none'); })(),
    delegation_effect: core.delegation_effect === 'none'
      ? 'none'
      : (() => { throw new ValidationError('AMN verification delegation_effect must be none'); })(),
    truth_claimed: core.truth_claimed === false
      ? false
      : (() => { throw new ValidationError('AMN verification truth_claimed must be false'); })(),
    hardware_attestation_claimed: core.hardware_attestation_claimed === false
      ? false
      : (() => { throw new ValidationError('AMN verification hardware_attestation_claimed must be false'); })(),
    global_currentness_claimed: core.global_currentness_claimed === false
      ? false
      : (() => { throw new ValidationError('AMN verification global_currentness_claimed must be false'); })()
  });
  const result = Object.freeze({
    ...normalized,
    verification_result_digest: digestObject(normalized)
  });
  if (providerProduced) PROVIDER_VERIFICATIONS.add(result);
  return result;
}

function verifiedResult(providerKind, verified) {
  return finalizeVerification({
    provider_kind: providerKind,
    trust_state: 'verified',
    reason_code: 'verified',
    issuer_id: verified.issuer_id,
    subject_id: verified.subject_id,
    statement_schema: verified.schema,
    statement_digest: amnTrustStatementDigest(verified),
    evidence_digest: amnTrustEvidenceDigest(verified),
    cryptographic_validity: true,
    schema_validity: true,
    authority_effect: 'none',
    delegation_effect: 'none',
    truth_claimed: false,
    hardware_attestation_claimed: false,
    global_currentness_claimed: false
  }, { providerProduced: true });
}

function rejectedResult(providerKind, raw, reasonCode) {
  const metadata = safeEnvelopeMetadata(raw);
  return finalizeVerification({
    provider_kind: providerKind,
    trust_state: 'rejected',
    reason_code: reasonCode,
    ...metadata,
    cryptographic_validity: false,
    schema_validity: false,
    authority_effect: 'none',
    delegation_effect: 'none',
    truth_claimed: false,
    hardware_attestation_claimed: false,
    global_currentness_claimed: false
  }, { providerProduced: true });
}

export function normalizeAmnVerificationResult(raw) {
  const value = exactKeys(raw, VERIFICATION_KEYS, 'AMN verification result');
  const claimedDigest = digest(value.verification_result_digest, 'AMN verification result digest');
  const { verification_result_digest: _ignored, ...core } = value;
  const normalized = finalizeVerification(core);
  if (normalized.verification_result_digest !== claimedDigest) {
    throw new ValidationError('AMN verification result digest mismatch');
  }
  return normalized;
}

function shadowResult({ status, reasonCode, recordDigest = null, sequence = null }) {
  return Object.freeze({
    status: oneOf(status, 'AMN shadow result status', SHADOW_STATES),
    reason_code: assertString(reasonCode, 'AMN shadow result reason_code', {
      min: 1,
      max: 64,
      pattern: REASON
    }),
    record_digest: nullableDigest(recordDigest, 'AMN shadow result record_digest'),
    sequence: sequence === null ? null : positiveInteger(sequence, 'AMN shadow result sequence')
  });
}

function providerResult(providerKind, verification, shadow) {
  return Object.freeze({
    schema: AMN_TRUST_PROVIDER_RESULT_SCHEMA,
    provider_kind: oneOf(providerKind, 'AMN trust provider kind', PROVIDER_KINDS),
    verification: normalizeAmnVerificationResult(verification),
    shadow: exactKeys(shadow, SHADOW_RESULT_KEYS, 'AMN shadow provider result')
  });
}

export function createLocalAmnTrustProvider({ trustedIssuers } = {}) {
  const issuers = normalizeTrustedIssuers(trustedIssuers);

  function verify(raw, { expectedIssuerId, expectedSubjectId } = {}) {
    const metadata = safeEnvelopeMetadata(raw);
    const issuerId = expectedIssuerId ?? metadata.issuer_id;
    if (issuerId === null || !issuers.has(issuerId)) {
      const verification = rejectedResult('local', raw, 'unknown_issuer');
      return providerResult('local', verification, shadowResult({
        status: 'disabled',
        reasonCode: 'local_provider'
      }));
    }
    try {
      const verified = verifyAmnTrustStatement(raw, {
        trustedIssuerPublicKey: issuers.get(issuerId),
        expectedIssuerId: issuerId,
        expectedSubjectId
      });
      const verification = verifiedResult('local', verified);
      return providerResult('local', verification, shadowResult({
        status: 'disabled',
        reasonCode: 'local_provider'
      }));
    } catch (error) {
      const verification = rejectedResult('local', raw, reasonFromError(error));
      return providerResult('local', verification, shadowResult({
        status: 'disabled',
        reasonCode: 'local_provider'
      }));
    }
  }

  return Object.freeze({
    kind: 'local',
    verify
  });
}

function normalizeShadowRecord(raw) {
  const value = exactKeys(raw, SHADOW_RECORD_KEYS, 'AMN shadow record');
  const recordDigest = digest(value.shadow_record_digest, 'AMN shadow record digest');
  const core = Object.freeze({
    schema: value.schema === AMN_SHADOW_RECORD_SCHEMA
      ? AMN_SHADOW_RECORD_SCHEMA
      : (() => { throw new ValidationError('AMN shadow record schema is unsupported'); })(),
    sequence: positiveInteger(value.sequence, 'AMN shadow record sequence'),
    enqueued_at: canonicalTimestamp(value.enqueued_at, 'AMN shadow record enqueued_at'),
    provider_kind: value.provider_kind === 'axiom-shadow'
      ? 'axiom-shadow'
      : (() => { throw new ValidationError('AMN shadow record provider_kind is unsupported'); })(),
    verification_result_digest: digest(
      value.verification_result_digest,
      'AMN shadow record verification_result_digest'
    ),
    source_schema: assertString(value.source_schema, 'AMN shadow record source_schema', {
      min: 1,
      max: 96
    }),
    source_statement_digest: digest(
      value.source_statement_digest,
      'AMN shadow record source_statement_digest'
    ),
    source_evidence_digest: digest(
      value.source_evidence_digest,
      'AMN shadow record source_evidence_digest'
    ),
    issuer_id: identifier(value.issuer_id, 'AMN shadow record issuer_id'),
    subject_id: identifier(value.subject_id, 'AMN shadow record subject_id'),
    trust_state: value.trust_state === 'verified'
      ? 'verified'
      : (() => { throw new ValidationError('AMN shadow record requires verified trust state'); })(),
    authority_effect: value.authority_effect === 'none'
      ? 'none'
      : (() => { throw new ValidationError('AMN shadow record authority_effect must be none'); })(),
    delegation_effect: value.delegation_effect === 'none'
      ? 'none'
      : (() => { throw new ValidationError('AMN shadow record delegation_effect must be none'); })(),
    runtime_authority_changed: value.runtime_authority_changed === false
      ? false
      : (() => { throw new ValidationError('AMN shadow record cannot change runtime authority'); })(),
    grid_persistence_claimed: value.grid_persistence_claimed === false
      ? false
      : (() => { throw new ValidationError('AMN shadow record cannot claim Grid persistence'); })()
  });
  if (digestObject(core) !== recordDigest) {
    throw new ValidationError('AMN shadow record digest mismatch');
  }
  return Object.freeze({ ...core, shadow_record_digest: recordDigest });
}

export function createAmnShadowRecord(verification, {
  sequence,
  enqueuedAt
} = {}) {
  if (!PROVIDER_VERIFICATIONS.has(verification)) {
    throw new ValidationError('AMN shadow record requires provider-produced verification');
  }
  const verified = normalizeAmnVerificationResult(verification);
  if (verified.trust_state !== 'verified') {
    throw new ValidationError('AMN shadow record requires verified evidence');
  }
  if (
    verified.issuer_id === null
    || verified.subject_id === null
    || verified.statement_schema === null
    || verified.statement_digest === null
    || verified.evidence_digest === null
  ) {
    throw new ValidationError('AMN verified result is missing evidence bindings');
  }
  const core = Object.freeze({
    schema: AMN_SHADOW_RECORD_SCHEMA,
    sequence: positiveInteger(sequence, 'AMN shadow record sequence'),
    enqueued_at: canonicalTimestamp(enqueuedAt, 'AMN shadow record enqueuedAt'),
    provider_kind: 'axiom-shadow',
    verification_result_digest: verified.verification_result_digest,
    source_schema: verified.statement_schema,
    source_statement_digest: verified.statement_digest,
    source_evidence_digest: verified.evidence_digest,
    issuer_id: verified.issuer_id,
    subject_id: verified.subject_id,
    trust_state: 'verified',
    authority_effect: 'none',
    delegation_effect: 'none',
    runtime_authority_changed: false,
    grid_persistence_claimed: false
  });
  return Object.freeze({
    ...core,
    shadow_record_digest: digestObject(core)
  });
}

function normalizeShadowReceipt(raw) {
  const value = exactKeys(raw, SHADOW_RECEIPT_KEYS, 'AMN shadow receipt');
  const receiptDigest = digest(value.receipt_digest, 'AMN shadow receipt digest');
  const core = Object.freeze({
    schema: value.schema === AMN_SHADOW_RECEIPT_SCHEMA
      ? AMN_SHADOW_RECEIPT_SCHEMA
      : (() => { throw new ValidationError('AMN shadow receipt schema is unsupported'); })(),
    sink_kind: oneOf(value.sink_kind, 'AMN shadow receipt sink_kind', SINK_KINDS),
    sink_receipt_id: identifier(value.sink_receipt_id, 'AMN shadow receipt sink_receipt_id'),
    sequence: positiveInteger(value.sequence, 'AMN shadow receipt sequence'),
    accepted_at: canonicalTimestamp(value.accepted_at, 'AMN shadow receipt accepted_at'),
    shadow_record_digest: digest(value.shadow_record_digest, 'AMN shadow receipt shadow_record_digest'),
    source_evidence_digest: digest(value.source_evidence_digest, 'AMN shadow receipt source_evidence_digest'),
    authority_effect: value.authority_effect === 'none'
      ? 'none'
      : (() => { throw new ValidationError('AMN shadow receipt authority_effect must be none'); })(),
    delegation_effect: value.delegation_effect === 'none'
      ? 'none'
      : (() => { throw new ValidationError('AMN shadow receipt delegation_effect must be none'); })(),
    runtime_authority_changed: value.runtime_authority_changed === false
      ? false
      : (() => { throw new ValidationError('AMN shadow receipt cannot change runtime authority'); })(),
    grid_persistence_claimed: value.grid_persistence_claimed === false
      ? false
      : (() => { throw new ValidationError('AMN shadow receipt cannot claim Grid persistence'); })()
  });
  if (digestObject(core) !== receiptDigest) {
    throw new ValidationError('AMN shadow receipt digest mismatch');
  }
  return Object.freeze({ ...core, receipt_digest: receiptDigest });
}

export function createAmnShadowReceipt(record, {
  sinkKind = 'test-shadow-sink',
  sinkReceiptId,
  acceptedAt
} = {}) {
  const normalizedRecord = normalizeShadowRecord(record);
  const core = Object.freeze({
    schema: AMN_SHADOW_RECEIPT_SCHEMA,
    sink_kind: oneOf(sinkKind, 'AMN shadow receipt sinkKind', SINK_KINDS),
    sink_receipt_id: identifier(sinkReceiptId, 'AMN shadow receipt sinkReceiptId'),
    sequence: normalizedRecord.sequence,
    accepted_at: canonicalTimestamp(acceptedAt, 'AMN shadow receipt acceptedAt'),
    shadow_record_digest: normalizedRecord.shadow_record_digest,
    source_evidence_digest: normalizedRecord.source_evidence_digest,
    authority_effect: 'none',
    delegation_effect: 'none',
    runtime_authority_changed: false,
    grid_persistence_claimed: false
  });
  return Object.freeze({
    ...core,
    receipt_digest: digestObject(core)
  });
}

export class AmnShadowEvidenceQueue {
  #maxEntries;
  #records;
  #receipts;
  #sequenceByEvidenceDigest;
  #acknowledgedSequence;

  constructor({ maxEntries = 1024 } = {}) {
    if (!Number.isSafeInteger(maxEntries) || maxEntries < 1 || maxEntries > 100_000) {
      throw new ValidationError('AMN shadow queue maxEntries must be 1-100000');
    }
    this.#maxEntries = maxEntries;
    this.#records = [];
    this.#receipts = [];
    this.#sequenceByEvidenceDigest = new Map();
    this.#acknowledgedSequence = 0;
  }

  enqueue(verification, { at } = {}) {
    if (!PROVIDER_VERIFICATIONS.has(verification)) {
      throw new ValidationError('AMN shadow queue requires provider-produced verification');
    }
    const verified = normalizeAmnVerificationResult(verification);
    if (verified.trust_state !== 'verified') {
      return shadowResult({
        status: 'not-queued',
        reasonCode: 'verification_rejected'
      });
    }
    const existing = this.#sequenceByEvidenceDigest.get(verified.evidence_digest);
    if (existing !== undefined) {
      const record = this.#records[existing - 1];
      return shadowResult({
        status: 'duplicate',
        reasonCode: 'evidence_already_queued',
        recordDigest: record.shadow_record_digest,
        sequence: record.sequence
      });
    }
    if (this.#records.length >= this.#maxEntries) {
      throw new ValidationError('AMN shadow queue is full');
    }
    const record = createAmnShadowRecord(verified, {
      sequence: this.#records.length + 1,
      enqueuedAt: at
    });
    this.#records.push(record);
    this.#sequenceByEvidenceDigest.set(record.source_evidence_digest, record.sequence);
    return shadowResult({
      status: 'queued',
      reasonCode: 'shadow_record_queued',
      recordDigest: record.shadow_record_digest,
      sequence: record.sequence
    });
  }

  history() {
    return Object.freeze(this.#records.map(record => normalizeShadowRecord(record)));
  }

  pending({ limit = 64 } = {}) {
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 1024) {
      throw new ValidationError('AMN shadow pending limit must be 1-1024');
    }
    return Object.freeze(
      this.#records
        .filter(record => record.sequence > this.#acknowledgedSequence)
        .slice(0, limit)
        .map(record => normalizeShadowRecord(record))
    );
  }

  acknowledge(rawReceipt) {
    const receipt = normalizeShadowReceipt(rawReceipt);
    const expectedSequence = this.#acknowledgedSequence + 1;

    if (receipt.sequence <= this.#acknowledgedSequence) {
      const existing = this.#receipts[receipt.sequence - 1];
      if (existing?.receipt_digest === receipt.receipt_digest) {
        return Object.freeze({
          status: 'duplicate',
          acknowledged_sequence: this.#acknowledgedSequence,
          receipt_digest: receipt.receipt_digest
        });
      }
      throw new ValidationError('AMN shadow receipt conflicts with acknowledged history');
    }

    if (receipt.sequence !== expectedSequence) {
      throw new ValidationError('AMN shadow receipt is out of order');
    }

    const record = this.#records[receipt.sequence - 1];
    if (!record) throw new ValidationError('AMN shadow receipt references unknown sequence');
    if (receipt.shadow_record_digest !== record.shadow_record_digest) {
      throw new ValidationError('AMN shadow receipt record digest mismatch');
    }
    if (receipt.source_evidence_digest !== record.source_evidence_digest) {
      throw new ValidationError('AMN shadow receipt source evidence digest mismatch');
    }

    this.#receipts.push(receipt);
    this.#acknowledgedSequence = receipt.sequence;

    return Object.freeze({
      status: 'acknowledged',
      acknowledged_sequence: this.#acknowledgedSequence,
      receipt_digest: receipt.receipt_digest
    });
  }

  snapshot() {
    const core = Object.freeze({
      schema: AMN_SHADOW_QUEUE_SNAPSHOT_SCHEMA,
      max_entries: this.#maxEntries,
      next_sequence: this.#records.length + 1,
      acknowledged_sequence: this.#acknowledgedSequence,
      history_record_digests: Object.freeze(
        this.#records.map(record => record.shadow_record_digest)
      ),
      receipt_digests: Object.freeze(
        this.#receipts.map(receipt => receipt.receipt_digest)
      ),
      pending_record_digests: Object.freeze(
        this.#records
          .filter(record => record.sequence > this.#acknowledgedSequence)
          .map(record => record.shadow_record_digest)
      ),
      authority_effect: 'none',
      delegation_effect: 'none',
      grid_persistence_claimed: false
    });
    return Object.freeze({
      ...core,
      snapshot_digest: digestObject(core)
    });
  }
}

export function createAxiomShadowAmnTrustProvider({
  trustedIssuers,
  queue = new AmnShadowEvidenceQueue()
} = {}) {
  const local = createLocalAmnTrustProvider({ trustedIssuers });
  if (!queue || typeof queue.enqueue !== 'function') {
    throw new ValidationError('AMN AXIOM shadow provider requires a queue-like enqueue surface');
  }

  function verify(raw, options = {}) {
    const localResult = local.verify(raw, options);
    const localVerification = normalizeAmnVerificationResult(localResult.verification);
    const shadowVerification = finalizeVerification({
      ...localVerification,
      provider_kind: 'axiom-shadow',
      verification_result_digest: undefined
    }, { providerProduced: true });

    if (shadowVerification.trust_state !== 'verified') {
      return providerResult('axiom-shadow', shadowVerification, shadowResult({
        status: 'not-queued',
        reasonCode: 'verification_rejected'
      }));
    }

    try {
      const shadow = queue.enqueue(shadowVerification, {
        at: options.shadowAt ?? options.at
      });
      return providerResult('axiom-shadow', shadowVerification, shadow);
    } catch {
      return providerResult('axiom-shadow', shadowVerification, shadowResult({
        status: 'failed',
        reasonCode: 'shadow_path_unavailable'
      }));
    }
  }

  return Object.freeze({
    kind: 'axiom-shadow',
    verify,
    queue
  });
}
