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
  verifyCredentialedPublicJournalAttestation,
  verifyPersonaSigningCredential,
  verifyPersonaSigningRevocation
} from './persona-journal-credential.mjs';

export const PUBLIC_WITNESS_SOURCE_ADMISSION_SCHEMA = 'axiom-public-witness-source-admission.v1';
export const PUBLIC_WITNESS_TRANSFER_PACKAGE_SCHEMA = 'axiom-public-witness-transfer-package.v1';
export const PUBLIC_WITNESS_SOURCE_EQUIVOCATION_SCHEMA = 'axiom-public-witness-source-equivocation.v1';
export const PUBLIC_WITNESS_TRANSFER_RECEIPT_SCHEMA = 'axiom-public-witness-transfer-receipt.v1';

const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,191}$/;
const DIGEST = /^[a-f0-9]{64}$/;
const BASE64URL = /^[A-Za-z0-9_-]+$/;
const MAX_SEQUENCE = Number.MAX_SAFE_INTEGER;
const MAX_CLOCK_SKEW_MS = 5 * 60 * 1000;
const DEFAULT_MAX_TRANSFER_BYTES = 2 * 1024 * 1024;
const HARD_MAX_TRANSFER_BYTES = 8 * 1024 * 1024;
const DEFAULT_MAX_TRANSFER_LIFETIME_SECONDS = 5 * 60;
const HARD_MAX_TRANSFER_LIFETIME_SECONDS = 24 * 60 * 60;
const OPERATIONS = new Set(['observe-credential', 'observe-revocation', 'observe-journal']);

const ADMISSION_KEYS = new Set([
  'schema',
  'domain_id',
  'source_id',
  'source_key_id',
  'source_public_key',
  'source_epoch',
  'allowed_operations',
  'valid_from',
  'expires_at',
  'max_transfer_bytes',
  'max_transfer_lifetime_seconds',
  'local_trust_input',
  'remote_self_admission_allowed',
  'persona_root_trust_effect',
  'authority_effect',
  'network_effect',
  'admission_digest'
]);
const TRANSFER_KEYS = new Set([
  'schema',
  'statement',
  'statement_digest',
  'request',
  'source_signature',
  'transfer_digest'
]);
const TRANSFER_STATEMENT_KEYS = new Set([
  'domain_id',
  'source_id',
  'source_key_id',
  'source_epoch',
  'transfer_id',
  'sequence',
  'previous_transfer_digest',
  'operation',
  'request_digest',
  'created_at',
  'expires_at',
  'source_signature_claimed',
  'delivery_claimed',
  'federation_claimed',
  'persona_root_trust_claimed',
  'content_truth_claimed',
  'legal_identity_claimed',
  'finality_claimed',
  'authority_effect',
  'network_effect'
]);
const RECEIPT_KEYS = new Set([
  'schema',
  'statement',
  'statement_digest',
  'witness_signature',
  'receipt_digest'
]);
const RECEIPT_STATEMENT_KEYS = new Set([
  'domain_id',
  'witness_id',
  'witness_key_id',
  'source_id',
  'source_key_id',
  'source_epoch',
  'source_admission_digest',
  'transfer_digest',
  'transfer_id',
  'source_sequence',
  'operation',
  'artifact_digest',
  'persona_id',
  'persona_projection_digest',
  'persona_root_key_id',
  'received_at',
  'source_signature_verified',
  'persona_artifact_verified',
  'persona_root_trust_source',
  'source_minted_persona_root_trust',
  'observation_committed',
  'end_to_end_delivery_claimed',
  'content_truth_claimed',
  'authorship_claimed',
  'legal_identity_claimed',
  'finality_claimed',
  'authority_effect',
  'network_effect'
]);

function exactKeys(raw, allowed, label) {
  const value = assertPlainObject(raw, label);
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) throw new ValidationError(`${label} contains unsupported field ${key}`);
  }
  return value;
}

function identifier(value, label) {
  return assertString(value, label, { min: 1, max: 192, pattern: IDENTIFIER });
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
  if (!Number.isSafeInteger(value) || value < 1 || value > MAX_SEQUENCE) {
    throw new ValidationError(`${label} must be a positive safe integer`);
  }
  return value;
}

function boundedInteger(value, label, fallback, max) {
  const normalized = value === undefined ? fallback : value;
  if (!Number.isSafeInteger(normalized) || normalized < 1 || normalized > max) {
    throw new ValidationError(`${label} must be a positive safe integer no greater than ${max}`);
  }
  return normalized;
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
  if (key.asymmetricKeyType !== 'ed25519') throw new ValidationError(`${label} must be Ed25519`);
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
  if (key.asymmetricKeyType !== 'ed25519') throw new ValidationError(`${label} must be Ed25519`);
  return key;
}

function publicKeyPem(value, label) {
  return parsePublicKey(value, label).export({ type: 'spki', format: 'pem' }).toString();
}

function publicKeyId(value, label) {
  return sha256(publicKeyPem(value, label));
}

function signingKey(privateKeyValue, label) {
  const privateKey = parsePrivateKey(privateKeyValue, `${label} private key`);
  const publicKey = createPublicKey(privateKey);
  return Object.freeze({
    privateKey,
    publicKey,
    keyId: publicKeyId(publicKey, `${label} public key`)
  });
}

function operation(value, label) {
  const text = assertString(value, label);
  if (!OPERATIONS.has(text)) throw new ValidationError(`${label} is unsupported`);
  return text;
}

function normalizeAllowedOperations(raw) {
  if (!Array.isArray(raw) || raw.length < 1 || raw.length > OPERATIONS.size) {
    throw new ValidationError('public witness source admission allowed_operations must be a non-empty bounded array');
  }
  const values = raw.map((value, index) => operation(
    value,
    `public witness source admission allowed_operations[${index}]`
  ));
  if (new Set(values).size !== values.length) {
    throw new ValidationError('public witness source admission allowed_operations must be unique');
  }
  return Object.freeze([...values].sort());
}

function normalizeAdmissionBody(raw) {
  const value = assertPlainObject(raw, 'public witness source admission');
  const sourcePublicKey = publicKeyPem(
    value.source_public_key,
    'public witness source admission source_public_key'
  );
  const sourceKeyId = digest(value.source_key_id, 'public witness source admission source_key_id');
  if (sourceKeyId !== sha256(sourcePublicKey)) {
    throw new ValidationError('public witness source admission source key id does not match the public key');
  }
  const validFrom = canonicalTimestamp(value.valid_from, 'public witness source admission valid_from');
  const expiresAt = canonicalTimestamp(value.expires_at, 'public witness source admission expires_at');
  if (expiresAt <= validFrom) {
    throw new ValidationError('public witness source admission must expire after it becomes valid');
  }
  if (
    value.local_trust_input !== true
    || value.remote_self_admission_allowed !== false
    || value.persona_root_trust_effect !== 'none'
    || value.authority_effect !== 'none'
    || value.network_effect !== 'none'
  ) {
    throw new ValidationError('public witness source admission must remain a local non-authority trust input');
  }
  return Object.freeze({
    schema: PUBLIC_WITNESS_SOURCE_ADMISSION_SCHEMA,
    domain_id: identifier(value.domain_id, 'public witness source admission domain_id'),
    source_id: identifier(value.source_id, 'public witness source admission source_id'),
    source_key_id: sourceKeyId,
    source_public_key: sourcePublicKey,
    source_epoch: positiveInteger(value.source_epoch, 'public witness source admission source_epoch'),
    allowed_operations: normalizeAllowedOperations(value.allowed_operations),
    valid_from: validFrom,
    expires_at: expiresAt,
    max_transfer_bytes: boundedInteger(
      value.max_transfer_bytes,
      'public witness source admission max_transfer_bytes',
      DEFAULT_MAX_TRANSFER_BYTES,
      HARD_MAX_TRANSFER_BYTES
    ),
    max_transfer_lifetime_seconds: boundedInteger(
      value.max_transfer_lifetime_seconds,
      'public witness source admission max_transfer_lifetime_seconds',
      DEFAULT_MAX_TRANSFER_LIFETIME_SECONDS,
      HARD_MAX_TRANSFER_LIFETIME_SECONDS
    ),
    local_trust_input: true,
    remote_self_admission_allowed: false,
    persona_root_trust_effect: 'none',
    authority_effect: 'none',
    network_effect: 'none'
  });
}

export function createPublicWitnessSourceAdmission({
  domainId,
  sourceId,
  sourcePublicKey,
  sourceEpoch = 1,
  allowedOperations = [...OPERATIONS],
  validFrom,
  expiresAt,
  maxTransferBytes = DEFAULT_MAX_TRANSFER_BYTES,
  maxTransferLifetimeSeconds = DEFAULT_MAX_TRANSFER_LIFETIME_SECONDS
} = {}) {
  const body = normalizeAdmissionBody({
    schema: PUBLIC_WITNESS_SOURCE_ADMISSION_SCHEMA,
    domain_id: domainId,
    source_id: sourceId,
    source_key_id: publicKeyId(sourcePublicKey, 'public witness source public key'),
    source_public_key: publicKeyPem(sourcePublicKey, 'public witness source public key'),
    source_epoch: sourceEpoch,
    allowed_operations: allowedOperations,
    valid_from: validFrom,
    expires_at: expiresAt,
    max_transfer_bytes: maxTransferBytes,
    max_transfer_lifetime_seconds: maxTransferLifetimeSeconds,
    local_trust_input: true,
    remote_self_admission_allowed: false,
    persona_root_trust_effect: 'none',
    authority_effect: 'none',
    network_effect: 'none'
  });
  return Object.freeze({ ...body, admission_digest: digestObject(body) });
}

export function validatePublicWitnessSourceAdmission(raw) {
  const value = exactKeys(raw, ADMISSION_KEYS, 'public witness source admission');
  if (value.schema !== PUBLIC_WITNESS_SOURCE_ADMISSION_SCHEMA) {
    throw new ValidationError('public witness source admission schema is unsupported');
  }
  const body = normalizeAdmissionBody(value);
  const admissionDigest = digest(value.admission_digest, 'public witness source admission admission_digest');
  if (admissionDigest !== digestObject(body)) {
    throw new ValidationError('public witness source admission digest does not match canonical content');
  }
  return Object.freeze({ ...body, admission_digest: admissionDigest });
}

function normalizeTransferRequest(raw, expectedOperation) {
  const value = assertPlainObject(raw, 'public witness transfer request');
  if (expectedOperation === 'observe-credential') {
    exactKeys(value, new Set(['credential']), 'public witness transfer credential request');
    return Object.freeze({
      credential: assertPlainObject(value.credential, 'public witness transfer credential')
    });
  }
  if (expectedOperation === 'observe-revocation') {
    exactKeys(value, new Set(['revocation', 'credential']), 'public witness transfer revocation request');
    return Object.freeze({
      revocation: assertPlainObject(value.revocation, 'public witness transfer revocation'),
      credential: assertPlainObject(value.credential, 'public witness transfer revocation credential')
    });
  }
  if (expectedOperation === 'observe-journal') {
    exactKeys(value, new Set([
      'attestation',
      'persona_signing_credential',
      'entry',
      'publication'
    ]), 'public witness transfer journal request');
    if (value.publication !== null && (typeof value.publication !== 'object' || Array.isArray(value.publication))) {
      throw new ValidationError('public witness transfer journal publication must be an object or null');
    }
    return Object.freeze({
      attestation: assertPlainObject(value.attestation, 'public witness transfer journal attestation'),
      persona_signing_credential: assertPlainObject(
        value.persona_signing_credential,
        'public witness transfer journal credential'
      ),
      entry: assertPlainObject(value.entry, 'public witness transfer journal entry'),
      publication: value.publication
    });
  }
  throw new ValidationError('public witness transfer request operation is unsupported');
}

function normalizeTransferStatement(raw) {
  const value = exactKeys(raw, TRANSFER_STATEMENT_KEYS, 'public witness transfer statement');
  const sequence = positiveInteger(value.sequence, 'public witness transfer sequence');
  const previous = nullableDigest(
    value.previous_transfer_digest,
    'public witness transfer previous_transfer_digest'
  );
  if ((sequence === 1) !== (previous === null)) {
    throw new ValidationError('public witness transfer sequence 1 requires null predecessor and later transfers require one');
  }
  const createdAt = canonicalTimestamp(value.created_at, 'public witness transfer created_at');
  const expiresAt = canonicalTimestamp(value.expires_at, 'public witness transfer expires_at');
  if (expiresAt <= createdAt) throw new ValidationError('public witness transfer must expire after creation');
  if (
    value.source_signature_claimed !== true
    || value.delivery_claimed !== false
    || value.federation_claimed !== false
    || value.persona_root_trust_claimed !== false
    || value.content_truth_claimed !== false
    || value.legal_identity_claimed !== false
    || value.finality_claimed !== false
  ) {
    throw new ValidationError('public witness transfer claims exceed the transport-package boundary');
  }
  if (value.authority_effect !== 'none' || value.network_effect !== 'none') {
    throw new ValidationError('public witness transfer cannot perform authority or network effects');
  }
  return Object.freeze({
    domain_id: identifier(value.domain_id, 'public witness transfer domain_id'),
    source_id: identifier(value.source_id, 'public witness transfer source_id'),
    source_key_id: digest(value.source_key_id, 'public witness transfer source_key_id'),
    source_epoch: positiveInteger(value.source_epoch, 'public witness transfer source_epoch'),
    transfer_id: identifier(value.transfer_id, 'public witness transfer transfer_id'),
    sequence,
    previous_transfer_digest: previous,
    operation: operation(value.operation, 'public witness transfer operation'),
    request_digest: digest(value.request_digest, 'public witness transfer request_digest'),
    created_at: createdAt,
    expires_at: expiresAt,
    source_signature_claimed: true,
    delivery_claimed: false,
    federation_claimed: false,
    persona_root_trust_claimed: false,
    content_truth_claimed: false,
    legal_identity_claimed: false,
    finality_claimed: false,
    authority_effect: 'none',
    network_effect: 'none'
  });
}

function validateTransferAgainstAdmission(statement, admission, { now, allowExpired }) {
  if (
    statement.domain_id !== admission.domain_id
    || statement.source_id !== admission.source_id
    || statement.source_key_id !== admission.source_key_id
    || statement.source_epoch !== admission.source_epoch
  ) {
    throw new ValidationError('public witness transfer does not match the local source admission');
  }
  if (!admission.allowed_operations.includes(statement.operation)) {
    throw new ValidationError('public witness transfer operation is not allowed by the local source admission');
  }
  if (statement.created_at < admission.valid_from || statement.expires_at > admission.expires_at) {
    throw new ValidationError('public witness transfer falls outside the source-admission validity window');
  }
  const createdMs = new Date(statement.created_at).valueOf();
  const expiresMs = new Date(statement.expires_at).valueOf();
  if (expiresMs - createdMs > admission.max_transfer_lifetime_seconds * 1000) {
    throw new ValidationError('public witness transfer lifetime exceeds the local source-admission limit');
  }
  if (createdMs > now + MAX_CLOCK_SKEW_MS) {
    throw new ValidationError('public witness transfer creation time exceeds allowed clock skew');
  }
  if (!allowExpired && now > expiresMs) {
    throw new ValidationError('public witness transfer is expired');
  }
}

function verifySourceSignature(value, statement, request, admission) {
  const statementDigest = digest(value.statement_digest, 'public witness transfer statement_digest');
  if (statementDigest !== digestObject(statement)) {
    throw new ValidationError('public witness transfer statement digest does not match canonical content');
  }
  if (statement.request_digest !== digestObject(request)) {
    throw new ValidationError('public witness transfer request digest does not match canonical request');
  }
  const sourceSignature = assertString(value.source_signature, 'public witness transfer source_signature', {
    min: 32,
    max: 1024,
    pattern: BASE64URL
  });
  const sourcePublicKey = parsePublicKey(
    admission.source_public_key,
    'public witness source admission public key'
  );
  let valid = false;
  try {
    valid = verify(
      null,
      Buffer.from(canonicalJson({
        schema: PUBLIC_WITNESS_TRANSFER_PACKAGE_SCHEMA,
        statement,
        statement_digest: statementDigest,
        request
      })),
      sourcePublicKey,
      Buffer.from(sourceSignature, 'base64url')
    );
  } catch {
    valid = false;
  }
  if (!valid) throw new ValidationError('public witness transfer source signature is invalid');
  const signed = Object.freeze({
    schema: PUBLIC_WITNESS_TRANSFER_PACKAGE_SCHEMA,
    statement,
    statement_digest: statementDigest,
    request,
    source_signature: sourceSignature
  });
  const transferDigest = digest(value.transfer_digest, 'public witness transfer transfer_digest');
  if (transferDigest !== digestObject(signed)) {
    throw new ValidationError('public witness transfer digest does not match signed content');
  }
  return Object.freeze({ ...signed, transfer_digest: transferDigest });
}

export function verifyPublicWitnessTransferEnvelope(raw, {
  sourceAdmission,
  now = Date.now(),
  allowExpired = false
} = {}) {
  const admission = validatePublicWitnessSourceAdmission(sourceAdmission);
  const value = exactKeys(raw, TRANSFER_KEYS, 'public witness transfer package');
  if (value.schema !== PUBLIC_WITNESS_TRANSFER_PACKAGE_SCHEMA) {
    throw new ValidationError('public witness transfer package schema is unsupported');
  }
  if (Buffer.byteLength(canonicalJson(value), 'utf8') > admission.max_transfer_bytes) {
    throw new ValidationError('public witness transfer package exceeds the local source-admission byte limit');
  }
  const statement = normalizeTransferStatement(value.statement);
  const request = normalizeTransferRequest(value.request, statement.operation);
  validateTransferAgainstAdmission(statement, admission, { now, allowExpired });
  const verified = verifySourceSignature(value, statement, request, admission);
  return Object.freeze({
    ...verified,
    valid: true,
    source_signature_verified: true,
    source_admission_digest: admission.admission_digest,
    source_admission_local_trust_input: true,
    source_minted_persona_root_trust: false,
    content_truth_claimed: false,
    legal_identity_claimed: false,
    finality_claimed: false,
    authority_effect: 'none',
    network_effect: 'none'
  });
}

export function createPublicWitnessTransferPackage(requestRaw, {
  sourceAdmission,
  sourcePrivateKey,
  previousTransfer = null,
  transferId,
  createdAt,
  expiresAt,
  now = Date.now()
} = {}) {
  const admission = validatePublicWitnessSourceAdmission(sourceAdmission);
  const source = signingKey(sourcePrivateKey, 'public witness transfer source');
  if (source.keyId !== admission.source_key_id) {
    throw new ValidationError('public witness transfer source private key does not match the local source admission');
  }
  const requestValue = exactKeys(
    requestRaw,
    new Set(['operation', 'request']),
    'public witness transfer creation request'
  );
  const requestOperation = operation(
    requestValue.operation,
    'public witness transfer request operation'
  );
  if (!admission.allowed_operations.includes(requestOperation)) {
    throw new ValidationError('public witness transfer operation is not allowed by the local source admission');
  }
  const request = normalizeTransferRequest(requestValue.request, requestOperation);
  let previous = null;
  if (previousTransfer !== null && previousTransfer !== undefined) {
    previous = verifyPublicWitnessTransferEnvelope(previousTransfer, {
      sourceAdmission: admission,
      now,
      allowExpired: true
    });
  }
  const statement = normalizeTransferStatement({
    domain_id: admission.domain_id,
    source_id: admission.source_id,
    source_key_id: admission.source_key_id,
    source_epoch: admission.source_epoch,
    transfer_id: transferId,
    sequence: previous ? previous.statement.sequence + 1 : 1,
    previous_transfer_digest: previous ? previous.transfer_digest : null,
    operation: requestOperation,
    request_digest: digestObject(request),
    created_at: createdAt,
    expires_at: expiresAt,
    source_signature_claimed: true,
    delivery_claimed: false,
    federation_claimed: false,
    persona_root_trust_claimed: false,
    content_truth_claimed: false,
    legal_identity_claimed: false,
    finality_claimed: false,
    authority_effect: 'none',
    network_effect: 'none'
  });
  if (previous) {
    if (statement.created_at < previous.statement.created_at) {
      throw new ValidationError('public witness transfer creation time cannot move backward');
    }
    if (statement.transfer_id === previous.statement.transfer_id) {
      throw new ValidationError('public witness transfer_id cannot be reused for the next transfer');
    }
  }
  validateTransferAgainstAdmission(statement, admission, { now, allowExpired: false });
  const statementDigest = digestObject(statement);
  const signable = Object.freeze({
    schema: PUBLIC_WITNESS_TRANSFER_PACKAGE_SCHEMA,
    statement,
    statement_digest: statementDigest,
    request
  });
  const sourceSignature = sign(
    null,
    Buffer.from(canonicalJson(signable)),
    source.privateKey
  ).toString('base64url');
  const signed = Object.freeze({ ...signable, source_signature: sourceSignature });
  const transfer = Object.freeze({ ...signed, transfer_digest: digestObject(signed) });
  if (Buffer.byteLength(canonicalJson(transfer), 'utf8') > admission.max_transfer_bytes) {
    throw new ValidationError('public witness transfer package exceeds the local source-admission byte limit');
  }
  return transfer;
}

function trustedRootKeyId(trustedPersonaRootPublicKey) {
  return publicKeyId(trustedPersonaRootPublicKey, 'trusted persona root public key');
}

function verifyTransferredArtifact(envelope, trustedPersonaRootPublicKey) {
  const expectedRootKeyId = trustedRootKeyId(trustedPersonaRootPublicKey);
  const request = envelope.request;
  if (envelope.statement.operation === 'observe-credential') {
    const verified = verifyPersonaSigningCredential(request.credential, {
      trustedPersonaRootPublicKey
    });
    if (verified.statement.root_key_id !== expectedRootKeyId) {
      throw new ValidationError('public witness transferred credential does not match the locally trusted persona root key');
    }
    return Object.freeze({
      artifact_digest: verified.credential_digest,
      persona_id: verified.statement.persona_id,
      persona_projection_digest: verified.statement.persona_projection_digest,
      persona_root_key_id: verified.statement.root_key_id,
      artifact_time: verified.statement.activated_at
    });
  }
  if (envelope.statement.operation === 'observe-revocation') {
    const verified = verifyPersonaSigningRevocation(request.revocation, {
      trustedPersonaRootPublicKey,
      credential: request.credential
    });
    if (verified.statement.root_key_id !== expectedRootKeyId) {
      throw new ValidationError('public witness transferred revocation does not match the locally trusted persona root key');
    }
    return Object.freeze({
      artifact_digest: verified.revocation_digest,
      persona_id: verified.statement.persona_id,
      persona_projection_digest: verified.statement.persona_projection_digest,
      persona_root_key_id: verified.statement.root_key_id,
      artifact_time: verified.statement.effective_at
    });
  }
  const verified = verifyCredentialedPublicJournalAttestation(request.attestation, {
    personaSigningCredential: request.persona_signing_credential,
    trustedPersonaRootPublicKey,
    entry: request.entry,
    publication: request.publication === null ? undefined : request.publication
  });
  if (verified.statement.persona_root_key_id !== expectedRootKeyId) {
    throw new ValidationError('public witness transferred journal does not match the locally trusted persona root key');
  }
  return Object.freeze({
    artifact_digest: verified.attestation_digest,
    persona_id: verified.statement.persona_id,
    persona_projection_digest: verified.statement.persona_projection_digest,
    persona_root_key_id: verified.statement.persona_root_key_id,
    artifact_time: verified.statement.issued_at
  });
}

export function verifyPublicWitnessTransferPackage(raw, {
  sourceAdmission,
  trustedPersonaRootPublicKey,
  now = Date.now()
} = {}) {
  if (trustedPersonaRootPublicKey === undefined || trustedPersonaRootPublicKey === null) {
    throw new ValidationError('public witness transfer verification requires a locally trusted persona root public key');
  }
  const envelope = verifyPublicWitnessTransferEnvelope(raw, {
    sourceAdmission,
    now,
    allowExpired: false
  });
  const artifact = verifyTransferredArtifact(envelope, trustedPersonaRootPublicKey);
  if (envelope.statement.created_at < artifact.artifact_time) {
    throw new ValidationError('public witness transfer cannot predate the transferred artifact');
  }
  return Object.freeze({
    ...envelope,
    persona_artifact_verified: true,
    persona_root_trust_source: 'local-verifier-input',
    source_minted_persona_root_trust: false,
    artifact,
    observation_input: Object.freeze({
      operation: envelope.statement.operation,
      request: envelope.request,
      observed_at_source: 'receiver-local-time-required'
    })
  });
}

export function validatePublicWitnessTransferContinuity(previousRaw, currentRaw, {
  sourceAdmission,
  now = Date.now()
} = {}) {
  const previous = verifyPublicWitnessTransferEnvelope(previousRaw, {
    sourceAdmission,
    now,
    allowExpired: true
  });
  const current = verifyPublicWitnessTransferEnvelope(currentRaw, {
    sourceAdmission,
    now,
    allowExpired: false
  });
  if (
    current.statement.domain_id !== previous.statement.domain_id
    || current.statement.source_id !== previous.statement.source_id
    || current.statement.source_key_id !== previous.statement.source_key_id
    || current.statement.source_epoch !== previous.statement.source_epoch
  ) {
    throw new ValidationError('public witness transfer continuity cannot cross source admission identity or epoch');
  }
  if (current.statement.sequence !== previous.statement.sequence + 1) {
    throw new ValidationError('public witness transfer continuity requires the next source sequence');
  }
  if (current.statement.previous_transfer_digest !== previous.transfer_digest) {
    throw new ValidationError('public witness transfer continuity predecessor digest is invalid');
  }
  if (current.statement.created_at < previous.statement.created_at) {
    throw new ValidationError('public witness transfer continuity cannot move backward in creation time');
  }
  if (current.statement.transfer_id === previous.statement.transfer_id) {
    throw new ValidationError('public witness transfer continuity cannot reuse transfer_id');
  }
  return Object.freeze({
    valid: true,
    domain_id: current.statement.domain_id,
    source_id: current.statement.source_id,
    source_key_id: current.statement.source_key_id,
    source_epoch: current.statement.source_epoch,
    previous_sequence: previous.statement.sequence,
    current_sequence: current.statement.sequence,
    previous_transfer_digest: previous.transfer_digest,
    current_transfer_digest: current.transfer_digest,
    authority_effect: 'none',
    network_effect: 'none'
  });
}

export function detectPublicWitnessSourceEquivocation(firstRaw, secondRaw, {
  sourceAdmission,
  now = Date.now()
} = {}) {
  const first = verifyPublicWitnessTransferEnvelope(firstRaw, {
    sourceAdmission,
    now,
    allowExpired: true
  });
  const second = verifyPublicWitnessTransferEnvelope(secondRaw, {
    sourceAdmission,
    now,
    allowExpired: true
  });
  if (first.transfer_digest === second.transfer_digest) return null;
  if (
    first.statement.domain_id !== second.statement.domain_id
    || first.statement.source_id !== second.statement.source_id
    || first.statement.source_key_id !== second.statement.source_key_id
    || first.statement.source_epoch !== second.statement.source_epoch
    || first.statement.sequence !== second.statement.sequence
  ) {
    throw new ValidationError('public witness source equivocation requires competing transfers at the same source position');
  }
  const body = Object.freeze({
    schema: PUBLIC_WITNESS_SOURCE_EQUIVOCATION_SCHEMA,
    domain_id: first.statement.domain_id,
    source_id: first.statement.source_id,
    source_key_id: first.statement.source_key_id,
    source_epoch: first.statement.source_epoch,
    source_sequence: first.statement.sequence,
    transfer_digests: Object.freeze([first.transfer_digest, second.transfer_digest].sort()),
    source_signatures_verified: true,
    preferred_transfer_digest: null,
    truth_resolution_claimed: false,
    persona_root_trust_effect: 'none',
    finality_claimed: false,
    authority_effect: 'none',
    network_effect: 'none'
  });
  return Object.freeze({ ...body, evidence_digest: digestObject(body) });
}

function normalizeReceiptStatement(raw) {
  const value = exactKeys(raw, RECEIPT_STATEMENT_KEYS, 'public witness transfer receipt statement');
  if (
    value.source_signature_verified !== true
    || value.persona_artifact_verified !== true
    || value.persona_root_trust_source !== 'local-verifier-input'
    || value.source_minted_persona_root_trust !== false
    || value.observation_committed !== false
    || value.end_to_end_delivery_claimed !== false
    || value.content_truth_claimed !== false
    || value.authorship_claimed !== false
    || value.legal_identity_claimed !== false
    || value.finality_claimed !== false
  ) {
    throw new ValidationError('public witness transfer receipt claims exceed verified package receipt');
  }
  if (value.authority_effect !== 'none' || value.network_effect !== 'none') {
    throw new ValidationError('public witness transfer receipt cannot perform authority or network effects');
  }
  return Object.freeze({
    domain_id: identifier(value.domain_id, 'public witness transfer receipt domain_id'),
    witness_id: identifier(value.witness_id, 'public witness transfer receipt witness_id'),
    witness_key_id: digest(value.witness_key_id, 'public witness transfer receipt witness_key_id'),
    source_id: identifier(value.source_id, 'public witness transfer receipt source_id'),
    source_key_id: digest(value.source_key_id, 'public witness transfer receipt source_key_id'),
    source_epoch: positiveInteger(value.source_epoch, 'public witness transfer receipt source_epoch'),
    source_admission_digest: digest(
      value.source_admission_digest,
      'public witness transfer receipt source_admission_digest'
    ),
    transfer_digest: digest(value.transfer_digest, 'public witness transfer receipt transfer_digest'),
    transfer_id: identifier(value.transfer_id, 'public witness transfer receipt transfer_id'),
    source_sequence: positiveInteger(value.source_sequence, 'public witness transfer receipt source_sequence'),
    operation: operation(value.operation, 'public witness transfer receipt operation'),
    artifact_digest: digest(value.artifact_digest, 'public witness transfer receipt artifact_digest'),
    persona_id: identifier(value.persona_id, 'public witness transfer receipt persona_id'),
    persona_projection_digest: digest(
      value.persona_projection_digest,
      'public witness transfer receipt persona_projection_digest'
    ),
    persona_root_key_id: digest(value.persona_root_key_id, 'public witness transfer receipt persona_root_key_id'),
    received_at: canonicalTimestamp(value.received_at, 'public witness transfer receipt received_at'),
    source_signature_verified: true,
    persona_artifact_verified: true,
    persona_root_trust_source: 'local-verifier-input',
    source_minted_persona_root_trust: false,
    observation_committed: false,
    end_to_end_delivery_claimed: false,
    content_truth_claimed: false,
    authorship_claimed: false,
    legal_identity_claimed: false,
    finality_claimed: false,
    authority_effect: 'none',
    network_effect: 'none'
  });
}

function signReceipt(statement, witnessPrivateKey) {
  const normalized = normalizeReceiptStatement(statement);
  const statementDigest = digestObject(normalized);
  const signable = Object.freeze({
    schema: PUBLIC_WITNESS_TRANSFER_RECEIPT_SCHEMA,
    statement: normalized,
    statement_digest: statementDigest
  });
  const witnessSignature = sign(
    null,
    Buffer.from(canonicalJson(signable)),
    witnessPrivateKey
  ).toString('base64url');
  const signed = Object.freeze({ ...signable, witness_signature: witnessSignature });
  return Object.freeze({ ...signed, receipt_digest: digestObject(signed) });
}

export function createPublicWitnessTransferReceipt(transferRaw, {
  sourceAdmission,
  trustedPersonaRootPublicKey,
  witnessId,
  witnessPrivateKey,
  receivedAt,
  now = Date.now()
} = {}) {
  const verified = verifyPublicWitnessTransferPackage(transferRaw, {
    sourceAdmission,
    trustedPersonaRootPublicKey,
    now
  });
  const admission = validatePublicWitnessSourceAdmission(sourceAdmission);
  const witness = signingKey(witnessPrivateKey, 'public witness transfer receipt');
  const received = canonicalTimestamp(receivedAt, 'public witness transfer receivedAt');
  if (received < verified.statement.created_at || received < verified.artifact.artifact_time) {
    throw new ValidationError('public witness transfer receipt cannot predate the package or transferred artifact');
  }
  if (new Date(received).valueOf() > now + MAX_CLOCK_SKEW_MS) {
    throw new ValidationError('public witness transfer receipt time exceeds allowed clock skew');
  }
  return signReceipt({
    domain_id: verified.statement.domain_id,
    witness_id: witnessId,
    witness_key_id: witness.keyId,
    source_id: verified.statement.source_id,
    source_key_id: verified.statement.source_key_id,
    source_epoch: verified.statement.source_epoch,
    source_admission_digest: admission.admission_digest,
    transfer_digest: verified.transfer_digest,
    transfer_id: verified.statement.transfer_id,
    source_sequence: verified.statement.sequence,
    operation: verified.statement.operation,
    artifact_digest: verified.artifact.artifact_digest,
    persona_id: verified.artifact.persona_id,
    persona_projection_digest: verified.artifact.persona_projection_digest,
    persona_root_key_id: verified.artifact.persona_root_key_id,
    received_at: received,
    source_signature_verified: true,
    persona_artifact_verified: true,
    persona_root_trust_source: 'local-verifier-input',
    source_minted_persona_root_trust: false,
    observation_committed: false,
    end_to_end_delivery_claimed: false,
    content_truth_claimed: false,
    authorship_claimed: false,
    legal_identity_claimed: false,
    finality_claimed: false,
    authority_effect: 'none',
    network_effect: 'none'
  }, witness.privateKey);
}

export function verifyPublicWitnessTransferReceipt(raw, {
  trustedWitnessPublicKey,
  transfer,
  sourceAdmission,
  trustedPersonaRootPublicKey,
  now = Date.now()
} = {}) {
  const value = exactKeys(raw, RECEIPT_KEYS, 'public witness transfer receipt');
  if (value.schema !== PUBLIC_WITNESS_TRANSFER_RECEIPT_SCHEMA) {
    throw new ValidationError('public witness transfer receipt schema is unsupported');
  }
  const statement = normalizeReceiptStatement(value.statement);
  const statementDigest = digest(value.statement_digest, 'public witness transfer receipt statement_digest');
  if (statementDigest !== digestObject(statement)) {
    throw new ValidationError('public witness transfer receipt statement digest does not match canonical content');
  }
  const signature = assertString(value.witness_signature, 'public witness transfer receipt witness_signature', {
    min: 32,
    max: 1024,
    pattern: BASE64URL
  });
  const witnessKey = parsePublicKey(trustedWitnessPublicKey, 'trusted public witness transfer receipt key');
  if (publicKeyId(witnessKey, 'trusted public witness transfer receipt key') !== statement.witness_key_id) {
    throw new ValidationError('public witness transfer receipt witness key does not match trusted public key');
  }
  let valid = false;
  try {
    valid = verify(
      null,
      Buffer.from(canonicalJson({
        schema: PUBLIC_WITNESS_TRANSFER_RECEIPT_SCHEMA,
        statement,
        statement_digest: statementDigest
      })),
      witnessKey,
      Buffer.from(signature, 'base64url')
    );
  } catch {
    valid = false;
  }
  if (!valid) throw new ValidationError('public witness transfer receipt witness signature is invalid');
  const signed = Object.freeze({
    schema: PUBLIC_WITNESS_TRANSFER_RECEIPT_SCHEMA,
    statement,
    statement_digest: statementDigest,
    witness_signature: signature
  });
  const receiptDigest = digest(value.receipt_digest, 'public witness transfer receipt receipt_digest');
  if (receiptDigest !== digestObject(signed)) {
    throw new ValidationError('public witness transfer receipt digest does not match signed content');
  }
  if (transfer !== undefined) {
    const verifiedTransfer = verifyPublicWitnessTransferPackage(transfer, {
      sourceAdmission,
      trustedPersonaRootPublicKey,
      now
    });
    const admission = validatePublicWitnessSourceAdmission(sourceAdmission);
    if (
      statement.domain_id !== verifiedTransfer.statement.domain_id
      || statement.source_id !== verifiedTransfer.statement.source_id
      || statement.source_key_id !== verifiedTransfer.statement.source_key_id
      || statement.source_epoch !== verifiedTransfer.statement.source_epoch
      || statement.source_admission_digest !== admission.admission_digest
      || statement.transfer_digest !== verifiedTransfer.transfer_digest
      || statement.transfer_id !== verifiedTransfer.statement.transfer_id
      || statement.source_sequence !== verifiedTransfer.statement.sequence
      || statement.operation !== verifiedTransfer.statement.operation
      || statement.artifact_digest !== verifiedTransfer.artifact.artifact_digest
      || statement.persona_id !== verifiedTransfer.artifact.persona_id
      || statement.persona_projection_digest !== verifiedTransfer.artifact.persona_projection_digest
      || statement.persona_root_key_id !== verifiedTransfer.artifact.persona_root_key_id
    ) {
      throw new ValidationError('public witness transfer receipt binding does not match the verified transfer');
    }
  }
  return Object.freeze({
    ...signed,
    receipt_digest: receiptDigest,
    valid: true,
    witness_signature_verified: true,
    source_signature_verified: true,
    persona_artifact_verified: true,
    source_minted_persona_root_trust: false,
    observation_committed: false,
    finality_claimed: false,
    authority_effect: 'none',
    network_effect: 'none'
  });
}
