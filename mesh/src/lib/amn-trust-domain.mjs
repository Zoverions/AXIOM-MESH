import {
  createPrivateKey,
  createPublicKey,
  sign,
  verify
} from 'node:crypto';

import {
  ValidationError,
  assertPlainObject,
  assertString,
  canonicalJson,
  digestObject,
  sha256
} from './canonical.mjs';
import {
  AMN_TRUST_SCHEMAS,
  amnTrustEvidenceDigest,
  amnTrustKeyId,
  amnTrustStatementDigest,
  verifyAmnTrustStatement
} from './amn-trust-evidence.mjs';

export const AMN_TRUST_DOMAIN_BUNDLE_SCHEMA = 'axiom-amn-trust-domain-bundle.v1';
export const AMN_DOMAIN_ADMISSION_SCHEMA = 'axiom-amn-domain-admission.v1';
export const AMN_DOMAIN_SNAPSHOT_SCHEMA = 'axiom-amn-domain-snapshot.v1';

const ID = /^[A-Za-z0-9][A-Za-z0-9_.:@/-]{0,191}$/;
const PREFIX = /^[A-Za-z0-9][A-Za-z0-9_.:@/-]{0,126}$/;
const DIGEST = /^[a-f0-9]{64}$/;
const BASE64URL = /^[A-Za-z0-9_-]+$/;
const REASON = /^[a-z][a-z0-9._-]{0,63}$/;
const ADMISSION_RESULTS = new Set(['admitted', 'rejected', 'quarantined']);
const STATUS_STATES = new Set([
  'active',
  'suspended',
  'revoked',
  'expired',
  'unknown',
  'stale',
  'quarantined'
]);

const BUNDLE_KEYS = new Set([
  'schema',
  'statement',
  'statement_digest',
  'customer_signature',
  'bundle_digest'
]);

const BUNDLE_STATEMENT_KEYS = new Set([
  'bundle_id',
  'customer_domain',
  'customer_key_id',
  'version',
  'issued_at',
  'valid_from',
  'valid_until',
  'issuers',
  'authority_effect',
  'delegation_effect',
  'federation_authority_claimed',
  'pooled_authority_claimed',
  'global_currentness_claimed'
]);

const ISSUER_KEYS = new Set([
  'issuer_id',
  'trust_domain',
  'issuer_key_id',
  'issuer_public_key',
  'allowed_subject_prefixes',
  'status_max_age_seconds'
]);

const ADMISSION_KEYS = new Set([
  'schema',
  'result',
  'reason_code',
  'evaluated_at',
  'bundle_id',
  'bundle_version',
  'bundle_digest',
  'customer_domain',
  'issuer_id',
  'issuer_trust_domain',
  'subject_id',
  'statement_schema',
  'statement_digest',
  'evidence_digest',
  'status_evidence_digest',
  'status_state',
  'status_age_seconds',
  'status_evidence_scope',
  'global_currentness_claimed',
  'authority_effect',
  'delegation_effect',
  'pooled_authority_effect',
  'federation_authority_effect',
  'admission_digest'
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

function timestampMs(value) {
  return new Date(value).valueOf();
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

function parsePrivateKey(value, label) {
  let key;
  try {
    key = value && typeof value === 'object' && value.type === 'private'
      ? value
      : createPrivateKey(value);
  } catch {
    throw new ValidationError(`${label} is invalid`);
  }
  if (key.asymmetricKeyType !== 'ed25519') {
    throw new ValidationError(`${label} must be Ed25519`);
  }
  return key;
}

function parsePublicKey(value, label) {
  let key;
  try {
    key = value && typeof value === 'object' && value.type === 'public'
      ? value
      : createPublicKey(value);
  } catch {
    throw new ValidationError(`${label} is invalid`);
  }
  if (key.asymmetricKeyType !== 'ed25519') {
    throw new ValidationError(`${label} must be Ed25519`);
  }
  return key;
}

function canonicalPublicKey(value, label) {
  return parsePublicKey(value, label)
    .export({ type: 'spki', format: 'pem' })
    .toString();
}

function normalizePrefixes(raw, label) {
  if (!Array.isArray(raw) || raw.length < 1 || raw.length > 32) {
    throw new ValidationError(`${label} must contain 1-32 prefixes`);
  }
  const prefixes = raw.map((value, index) => (
    assertString(value, `${label}[${index}]`, {
      min: 2,
      max: 127,
      pattern: PREFIX
    })
  )).sort();
  if (new Set(prefixes).size !== prefixes.length) {
    throw new ValidationError(`${label} contains duplicate prefixes`);
  }
  return Object.freeze(prefixes);
}

function normalizeIssuer(raw) {
  const value = exactKeys(raw, ISSUER_KEYS, 'AMN trust-domain issuer');
  const publicKey = canonicalPublicKey(
    value.issuer_public_key,
    'AMN trust-domain issuer public key'
  );
  const keyId = digest(value.issuer_key_id, 'AMN trust-domain issuer key id');
  if (keyId !== amnTrustKeyId(publicKey)) {
    throw new ValidationError('AMN trust-domain issuer key id does not match public key');
  }
  return Object.freeze({
    issuer_id: identifier(value.issuer_id, 'AMN trust-domain issuer id'),
    trust_domain: identifier(value.trust_domain, 'AMN trust-domain issuer trust_domain'),
    issuer_key_id: keyId,
    issuer_public_key: publicKey,
    allowed_subject_prefixes: normalizePrefixes(
      value.allowed_subject_prefixes,
      'AMN trust-domain issuer allowed_subject_prefixes'
    ),
    status_max_age_seconds: positiveInteger(
      value.status_max_age_seconds,
      'AMN trust-domain issuer status_max_age_seconds'
    )
  });
}

function assertIssuerIsolation(issuers) {
  const ids = new Set();
  const domains = new Set();
  const keys = new Set();

  for (const issuer of issuers) {
    if (ids.has(issuer.issuer_id)) {
      throw new ValidationError('AMN trust-domain issuer ids must be unique');
    }
    if (domains.has(issuer.trust_domain)) {
      throw new ValidationError('AMN trust-domain issuer trust domains must be unique');
    }
    if (keys.has(issuer.issuer_key_id)) {
      throw new ValidationError('AMN trust-domain issuer roots must be unique');
    }
    ids.add(issuer.issuer_id);
    domains.add(issuer.trust_domain);
    keys.add(issuer.issuer_key_id);
  }

  for (let leftIndex = 0; leftIndex < issuers.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < issuers.length; rightIndex += 1) {
      const left = issuers[leftIndex];
      const right = issuers[rightIndex];
      for (const leftPrefix of left.allowed_subject_prefixes) {
        for (const rightPrefix of right.allowed_subject_prefixes) {
          if (
            leftPrefix.startsWith(rightPrefix)
            || rightPrefix.startsWith(leftPrefix)
          ) {
            throw new ValidationError(
              `AMN trust-domain subject namespaces overlap: ${left.issuer_id} / ${right.issuer_id}`
            );
          }
        }
      }
    }
  }
}

function normalizeIssuers(raw) {
  if (!Array.isArray(raw) || raw.length < 1 || raw.length > 64) {
    throw new ValidationError('AMN trust-domain bundle must contain 1-64 issuers');
  }
  const issuers = raw.map(normalizeIssuer)
    .sort((left, right) => left.issuer_id.localeCompare(right.issuer_id));
  assertIssuerIsolation(issuers);
  return Object.freeze(issuers);
}

function normalizeBundleStatement(raw) {
  const value = exactKeys(
    raw,
    BUNDLE_STATEMENT_KEYS,
    'AMN trust-domain bundle statement'
  );
  const issuedAt = canonicalTimestamp(
    value.issued_at,
    'AMN trust-domain bundle issued_at'
  );
  const validFrom = canonicalTimestamp(
    value.valid_from,
    'AMN trust-domain bundle valid_from'
  );
  const validUntil = canonicalTimestamp(
    value.valid_until,
    'AMN trust-domain bundle valid_until'
  );
  if (timestampMs(issuedAt) > timestampMs(validFrom)) {
    throw new ValidationError('AMN trust-domain bundle cannot become valid before issuance');
  }
  if (timestampMs(validUntil) <= timestampMs(validFrom)) {
    throw new ValidationError('AMN trust-domain bundle valid_until must follow valid_from');
  }
  if (
    value.authority_effect !== 'none'
    || value.delegation_effect !== 'none'
    || value.federation_authority_claimed !== false
    || value.pooled_authority_claimed !== false
    || value.global_currentness_claimed !== false
  ) {
    throw new ValidationError('AMN trust-domain bundle widens its non-authority boundary');
  }

  const customerDomain = identifier(
    value.customer_domain,
    'AMN trust-domain customer_domain'
  );
  const issuers = normalizeIssuers(value.issuers);
  if (issuers.some(issuer => issuer.trust_domain === customerDomain)) {
    throw new ValidationError('AMN trust-domain customer and vendor trust domains must be distinct');
  }

  return Object.freeze({
    bundle_id: identifier(value.bundle_id, 'AMN trust-domain bundle_id'),
    customer_domain: customerDomain,
    customer_key_id: digest(
      value.customer_key_id,
      'AMN trust-domain customer_key_id'
    ),
    version: positiveInteger(value.version, 'AMN trust-domain version'),
    issued_at: issuedAt,
    valid_from: validFrom,
    valid_until: validUntil,
    issuers,
    authority_effect: 'none',
    delegation_effect: 'none',
    federation_authority_claimed: false,
    pooled_authority_claimed: false,
    global_currentness_claimed: false
  });
}

export function createAmnTrustDomainBundle({
  bundleId,
  customerDomain,
  customerPrivateKey,
  version,
  issuedAt,
  validFrom,
  validUntil,
  issuers
} = {}) {
  const privateKey = parsePrivateKey(
    customerPrivateKey,
    'AMN trust-domain customer private key'
  );
  const publicKey = createPublicKey(privateKey);
  const statement = normalizeBundleStatement({
    bundle_id: bundleId,
    customer_domain: customerDomain,
    customer_key_id: sha256(
      publicKey.export({ type: 'spki', format: 'pem' }).toString()
    ),
    version,
    issued_at: issuedAt,
    valid_from: validFrom,
    valid_until: validUntil,
    issuers,
    authority_effect: 'none',
    delegation_effect: 'none',
    federation_authority_claimed: false,
    pooled_authority_claimed: false,
    global_currentness_claimed: false
  });
  const statementDigest = digestObject(statement);
  const signable = Object.freeze({
    schema: AMN_TRUST_DOMAIN_BUNDLE_SCHEMA,
    statement,
    statement_digest: statementDigest
  });
  const customerSignature = sign(
    null,
    Buffer.from(canonicalJson(signable)),
    privateKey
  ).toString('base64url');
  const signed = Object.freeze({
    ...signable,
    customer_signature: customerSignature
  });
  return Object.freeze({
    ...signed,
    bundle_digest: digestObject(signed)
  });
}

export function verifyAmnTrustDomainBundle(raw, {
  trustedCustomerPublicKey,
  expectedCustomerDomain,
  at
} = {}) {
  const value = exactKeys(raw, BUNDLE_KEYS, 'AMN trust-domain bundle');
  if (value.schema !== AMN_TRUST_DOMAIN_BUNDLE_SCHEMA) {
    throw new ValidationError('AMN trust-domain bundle schema is unsupported');
  }
  const statement = normalizeBundleStatement(value.statement);
  const trustedKey = parsePublicKey(
    trustedCustomerPublicKey,
    'trusted AMN customer public key'
  );
  const trustedKeyId = sha256(
    trustedKey.export({ type: 'spki', format: 'pem' }).toString()
  );
  if (statement.customer_key_id !== trustedKeyId) {
    throw new ValidationError('AMN trust-domain customer key substitution');
  }
  if (
    expectedCustomerDomain !== undefined
    && statement.customer_domain !== expectedCustomerDomain
  ) {
    throw new ValidationError('AMN trust-domain customer_domain mismatch');
  }

  const statementDigest = digest(
    value.statement_digest,
    'AMN trust-domain statement_digest'
  );
  if (statementDigest !== digestObject(statement)) {
    throw new ValidationError('AMN trust-domain statement digest mismatch');
  }

  const signature = assertString(
    value.customer_signature,
    'AMN trust-domain customer signature',
    { min: 32, max: 1024, pattern: BASE64URL }
  );
  let valid = false;
  try {
    valid = verify(
      null,
      Buffer.from(canonicalJson({
        schema: AMN_TRUST_DOMAIN_BUNDLE_SCHEMA,
        statement,
        statement_digest: statementDigest
      })),
      trustedKey,
      Buffer.from(signature, 'base64url')
    );
  } catch {
    valid = false;
  }
  if (!valid) {
    throw new ValidationError('AMN trust-domain customer signature is invalid');
  }

  const signed = Object.freeze({
    schema: AMN_TRUST_DOMAIN_BUNDLE_SCHEMA,
    statement,
    statement_digest: statementDigest,
    customer_signature: signature
  });
  const bundleDigest = digest(value.bundle_digest, 'AMN trust-domain bundle_digest');
  if (bundleDigest !== digestObject(signed)) {
    throw new ValidationError('AMN trust-domain bundle digest mismatch');
  }

  const evaluatedAt = canonicalTimestamp(at, 'AMN trust-domain evaluated at');
  const atMs = timestampMs(evaluatedAt);
  let currentness = 'current';
  if (atMs < timestampMs(statement.valid_from)) currentness = 'not-yet-valid';
  if (atMs >= timestampMs(statement.valid_until)) currentness = 'expired';

  return Object.freeze({
    ...signed,
    bundle_digest: bundleDigest,
    evaluated_at: evaluatedAt,
    currentness,
    authority_effect: 'none',
    federation_authority_claimed: false,
    pooled_authority_claimed: false,
    global_currentness_claimed: false
  });
}

function safeStatementMetadata(raw) {
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
    issuer_id: typeof raw.issuer_id === 'string' && ID.test(raw.issuer_id)
      ? raw.issuer_id
      : null,
    subject_id: typeof raw.subject_id === 'string' && ID.test(raw.subject_id)
      ? raw.subject_id
      : null,
    statement_schema: typeof raw.schema === 'string' && raw.schema.length <= 96
      ? raw.schema
      : null,
    statement_digest: typeof raw.statement_digest === 'string' && DIGEST.test(raw.statement_digest)
      ? raw.statement_digest
      : null,
    evidence_digest: typeof raw.evidence_digest === 'string' && DIGEST.test(raw.evidence_digest)
      ? raw.evidence_digest
      : null
  };
}

function reasonFromVerificationError(error) {
  const message = String(error?.message ?? '');
  if (message.includes('issuer key substitution')) return 'issuer_key_substitution';
  if (message.includes('issuer signature is invalid')) return 'invalid_signature';
  if (message.includes('schema is unsupported')) return 'unsupported_schema';
  if (message.includes('statement digest mismatch')) return 'statement_digest_mismatch';
  if (message.includes('evidence_digest mismatch')) return 'evidence_digest_mismatch';
  if (message.includes('non-authority boundary')) return 'authority_boundary_violation';
  return 'invalid_evidence';
}

function finalizeAdmission(core) {
  const normalized = Object.freeze({
    schema: AMN_DOMAIN_ADMISSION_SCHEMA,
    result: oneOf(core.result, 'AMN domain admission result', ADMISSION_RESULTS),
    reason_code: assertString(core.reason_code, 'AMN domain admission reason_code', {
      min: 1,
      max: 64,
      pattern: REASON
    }),
    evaluated_at: canonicalTimestamp(core.evaluated_at, 'AMN domain admission evaluated_at'),
    bundle_id: identifier(core.bundle_id, 'AMN domain admission bundle_id'),
    bundle_version: positiveInteger(core.bundle_version, 'AMN domain admission bundle_version'),
    bundle_digest: digest(core.bundle_digest, 'AMN domain admission bundle_digest'),
    customer_domain: identifier(core.customer_domain, 'AMN domain admission customer_domain'),
    issuer_id: nullableIdentifier(core.issuer_id, 'AMN domain admission issuer_id'),
    issuer_trust_domain: nullableIdentifier(
      core.issuer_trust_domain,
      'AMN domain admission issuer_trust_domain'
    ),
    subject_id: nullableIdentifier(core.subject_id, 'AMN domain admission subject_id'),
    statement_schema: core.statement_schema === null
      ? null
      : assertString(core.statement_schema, 'AMN domain admission statement_schema', {
        min: 1,
        max: 96
      }),
    statement_digest: nullableDigest(
      core.statement_digest,
      'AMN domain admission statement_digest'
    ),
    evidence_digest: nullableDigest(
      core.evidence_digest,
      'AMN domain admission evidence_digest'
    ),
    status_evidence_digest: nullableDigest(
      core.status_evidence_digest,
      'AMN domain admission status_evidence_digest'
    ),
    status_state: core.status_state === null
      ? null
      : oneOf(core.status_state, 'AMN domain admission status_state', STATUS_STATES),
    status_age_seconds: core.status_age_seconds === null
      ? null
      : nonNegativeInteger(core.status_age_seconds, 'AMN domain admission status_age_seconds'),
    status_evidence_scope: core.status_evidence_scope === 'supplied-issuer-evidence-only'
      ? 'supplied-issuer-evidence-only'
      : (() => { throw new ValidationError('AMN domain admission status_evidence_scope is unsupported'); })(),
    global_currentness_claimed: core.global_currentness_claimed === false
      ? false
      : (() => { throw new ValidationError('AMN domain admission global_currentness_claimed must be false'); })(),
    authority_effect: core.authority_effect === 'none'
      ? 'none'
      : (() => { throw new ValidationError('AMN domain admission authority_effect must be none'); })(),
    delegation_effect: core.delegation_effect === 'none'
      ? 'none'
      : (() => { throw new ValidationError('AMN domain admission delegation_effect must be none'); })(),
    pooled_authority_effect: core.pooled_authority_effect === 'none'
      ? 'none'
      : (() => { throw new ValidationError('AMN domain admission pooled_authority_effect must be none'); })(),
    federation_authority_effect: core.federation_authority_effect === 'none'
      ? 'none'
      : (() => { throw new ValidationError('AMN domain admission federation_authority_effect must be none'); })()
  });
  return Object.freeze({
    ...normalized,
    admission_digest: digestObject(normalized)
  });
}

function admissionFrom(bundle, metadata, overrides = {}) {
  return finalizeAdmission({
    result: 'rejected',
    reason_code: 'invalid_evidence',
    evaluated_at: bundle.evaluated_at,
    bundle_id: bundle.statement.bundle_id,
    bundle_version: bundle.statement.version,
    bundle_digest: bundle.bundle_digest,
    customer_domain: bundle.statement.customer_domain,
    issuer_id: metadata.issuer_id,
    issuer_trust_domain: null,
    subject_id: metadata.subject_id,
    statement_schema: metadata.statement_schema,
    statement_digest: metadata.statement_digest,
    evidence_digest: metadata.evidence_digest,
    status_evidence_digest: null,
    status_state: null,
    status_age_seconds: null,
    status_evidence_scope: 'supplied-issuer-evidence-only',
    global_currentness_claimed: false,
    authority_effect: 'none',
    delegation_effect: 'none',
    pooled_authority_effect: 'none',
    federation_authority_effect: 'none',
    ...overrides
  });
}

function relevantStatusCandidates(statusStatements, issuerId, subjectId) {
  if (!Array.isArray(statusStatements) || statusStatements.length > 256) {
    throw new ValidationError('AMN domain status statements must contain at most 256 items');
  }
  return statusStatements.filter(item => (
    item
    && typeof item === 'object'
    && !Array.isArray(item)
    && item.schema === AMN_TRUST_SCHEMAS.status
    && item.issuer_id === issuerId
    && item.claims?.subject_id === subjectId
  ));
}

function evaluateStatus({
  statusStatements,
  issuer,
  subjectId,
  at
}) {
  const candidates = relevantStatusCandidates(
    statusStatements,
    issuer.issuer_id,
    subjectId
  );

  if (!candidates.length) {
    return Object.freeze({
      result: 'quarantined',
      reason_code: 'status_unknown',
      status_evidence_digest: null,
      status_state: 'unknown',
      status_age_seconds: null
    });
  }

  const verified = [];
  for (const candidate of candidates) {
    let status;
    try {
      status = verifyAmnTrustStatement(candidate, {
        trustedIssuerPublicKey: issuer.issuer_public_key,
        expectedIssuerId: issuer.issuer_id,
        expectedSubjectId: subjectId
      });
    } catch {
      return Object.freeze({
        result: 'quarantined',
        reason_code: 'invalid_status_evidence',
        status_evidence_digest: null,
        status_state: 'unknown',
        status_age_seconds: null
      });
    }
    if (status.schema !== AMN_TRUST_SCHEMAS.status) {
      return Object.freeze({
        result: 'quarantined',
        reason_code: 'invalid_status_schema',
        status_evidence_digest: null,
        status_state: 'unknown',
        status_age_seconds: null
      });
    }
    verified.push(status);
  }

  const bySequence = new Map();
  for (const status of verified) {
    const sequence = status.claims.sequence;
    const prior = bySequence.get(sequence);
    if (
      prior
      && amnTrustEvidenceDigest(prior) !== amnTrustEvidenceDigest(status)
    ) {
      return Object.freeze({
        result: 'quarantined',
        reason_code: 'ambiguous_status',
        status_evidence_digest: null,
        status_state: 'unknown',
        status_age_seconds: null
      });
    }
    bySequence.set(sequence, status);
  }

  const atMs = timestampMs(at);
  const effective = [...bySequence.values()]
    .filter(status => timestampMs(status.claims.effective_at) <= atMs)
    .sort((left, right) => left.claims.sequence - right.claims.sequence);

  if (!effective.length) {
    return Object.freeze({
      result: 'quarantined',
      reason_code: 'status_unknown',
      status_evidence_digest: null,
      status_state: 'unknown',
      status_age_seconds: null
    });
  }

  const current = effective.at(-1);
  const ageSeconds = Math.floor(
    (atMs - timestampMs(current.claims.effective_at)) / 1000
  );
  if (ageSeconds > issuer.status_max_age_seconds) {
    return Object.freeze({
      result: 'quarantined',
      reason_code: 'status_stale',
      status_evidence_digest: amnTrustEvidenceDigest(current),
      status_state: 'stale',
      status_age_seconds: ageSeconds
    });
  }

  const state = current.claims.status;
  if (state === 'active') {
    return Object.freeze({
      result: 'admitted',
      reason_code: 'verified_supplied_current',
      status_evidence_digest: amnTrustEvidenceDigest(current),
      status_state: 'active',
      status_age_seconds: ageSeconds
    });
  }
  if (state === 'unknown' || state === 'stale') {
    return Object.freeze({
      result: 'quarantined',
      reason_code: `status_${state}`,
      status_evidence_digest: amnTrustEvidenceDigest(current),
      status_state: state,
      status_age_seconds: ageSeconds
    });
  }

  return Object.freeze({
    result: 'rejected',
    reason_code: `status_${state}`,
    status_evidence_digest: amnTrustEvidenceDigest(current),
    status_state: state,
    status_age_seconds: ageSeconds
  });
}

export function evaluateAmnTrustDomainAdmission({
  bundle,
  trustedCustomerPublicKey,
  expectedCustomerDomain,
  statement,
  statusStatements = [],
  at
} = {}) {
  const verifiedBundle = verifyAmnTrustDomainBundle(bundle, {
    trustedCustomerPublicKey,
    expectedCustomerDomain,
    at
  });
  const metadata = safeStatementMetadata(statement);

  if (verifiedBundle.currentness !== 'current') {
    return admissionFrom(verifiedBundle, metadata, {
      result: 'quarantined',
      reason_code: `bundle_${verifiedBundle.currentness.replaceAll('-', '_')}`
    });
  }

  const issuer = verifiedBundle.statement.issuers.find(
    item => item.issuer_id === metadata.issuer_id
  );
  if (!issuer) {
    return admissionFrom(verifiedBundle, metadata, {
      result: 'rejected',
      reason_code: 'unknown_issuer'
    });
  }

  let verified;
  try {
    verified = verifyAmnTrustStatement(statement, {
      trustedIssuerPublicKey: issuer.issuer_public_key,
      expectedIssuerId: issuer.issuer_id
    });
  } catch (error) {
    return admissionFrom(verifiedBundle, metadata, {
      issuer_trust_domain: issuer.trust_domain,
      result: 'rejected',
      reason_code: reasonFromVerificationError(error)
    });
  }

  const subjectId = verified.subject_id;
  if (
    verified.schema === AMN_TRUST_SCHEMAS.node_identity
    && verified.claims.trust_domain !== issuer.trust_domain
  ) {
    return admissionFrom(verifiedBundle, metadata, {
      issuer_id: issuer.issuer_id,
      issuer_trust_domain: issuer.trust_domain,
      subject_id: subjectId,
      statement_schema: verified.schema,
      statement_digest: amnTrustStatementDigest(verified),
      evidence_digest: amnTrustEvidenceDigest(verified),
      result: 'rejected',
      reason_code: 'trust_domain_mismatch'
    });
  }

  if (!issuer.allowed_subject_prefixes.some(prefix => subjectId.startsWith(prefix))) {
    return admissionFrom(verifiedBundle, metadata, {
      issuer_id: issuer.issuer_id,
      issuer_trust_domain: issuer.trust_domain,
      subject_id: subjectId,
      statement_schema: verified.schema,
      statement_digest: amnTrustStatementDigest(verified),
      evidence_digest: amnTrustEvidenceDigest(verified),
      result: 'rejected',
      reason_code: 'subject_namespace_mismatch'
    });
  }

  const status = evaluateStatus({
    statusStatements,
    issuer,
    subjectId,
    at: verifiedBundle.evaluated_at
  });

  return admissionFrom(verifiedBundle, metadata, {
    issuer_id: issuer.issuer_id,
    issuer_trust_domain: issuer.trust_domain,
    subject_id: subjectId,
    statement_schema: verified.schema,
    statement_digest: amnTrustStatementDigest(verified),
    evidence_digest: amnTrustEvidenceDigest(verified),
    status_evidence_digest: status.status_evidence_digest,
    status_state: status.status_state,
    status_age_seconds: status.status_age_seconds,
    result: status.result,
    reason_code: status.reason_code
  });
}

export function normalizeAmnDomainAdmission(raw) {
  const value = exactKeys(raw, ADMISSION_KEYS, 'AMN domain admission');
  const admissionDigest = digest(value.admission_digest, 'AMN domain admission digest');
  const { admission_digest: _ignored, ...core } = value;
  const normalized = finalizeAdmission(core);
  if (normalized.admission_digest !== admissionDigest) {
    throw new ValidationError('AMN domain admission digest mismatch');
  }
  return normalized;
}

export function createAmnDomainSnapshot(admissions) {
  if (!Array.isArray(admissions) || admissions.length < 1 || admissions.length > 256) {
    throw new ValidationError('AMN domain snapshot requires 1-256 admissions');
  }
  const normalized = admissions.map(normalizeAmnDomainAdmission)
    .sort((left, right) => {
      const leftKey = `${left.issuer_id ?? ''}:${left.subject_id ?? ''}:${left.admission_digest}`;
      const rightKey = `${right.issuer_id ?? ''}:${right.subject_id ?? ''}:${right.admission_digest}`;
      return leftKey.localeCompare(rightKey);
    });

  if (new Set(normalized.map(item => item.admission_digest)).size !== normalized.length) {
    throw new ValidationError('AMN domain snapshot cannot count duplicate admissions');
  }

  const bundleDigests = new Set(normalized.map(item => item.bundle_digest));
  if (bundleDigests.size !== 1) {
    throw new ValidationError('AMN domain snapshot cannot pool admissions from different trust bundles');
  }

  const counts = {
    admitted: normalized.filter(item => item.result === 'admitted').length,
    rejected: normalized.filter(item => item.result === 'rejected').length,
    quarantined: normalized.filter(item => item.result === 'quarantined').length
  };
  const core = Object.freeze({
    schema: AMN_DOMAIN_SNAPSHOT_SCHEMA,
    bundle_digest: normalized[0].bundle_digest,
    admission_digests: Object.freeze(normalized.map(item => item.admission_digest)),
    admitted_evidence_digests: Object.freeze(
      normalized
        .filter(item => item.result === 'admitted')
        .map(item => item.evidence_digest)
        .filter(Boolean)
        .sort()
    ),
    counts: Object.freeze(counts),
    authority_effect: 'none',
    delegation_effect: 'none',
    pooled_authority_effect: 'none',
    federation_authority_effect: 'none',
    global_currentness_claimed: false
  });
  return Object.freeze({
    ...core,
    snapshot_digest: digestObject(core)
  });
}
