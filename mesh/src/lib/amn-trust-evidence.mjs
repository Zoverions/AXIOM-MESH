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

export const AMN_TRUST_SCHEMAS = Object.freeze({
  node_identity: 'axiom-amn-node-identity.v1',
  workload_binding: 'axiom-amn-workload-binding.v1',
  configuration_attestation: 'axiom-amn-configuration-attestation.v1',
  software_model_attestation: 'axiom-amn-software-model-attestation.v1',
  observation_proof: 'axiom-amn-observation-proof.v1',
  status: 'axiom-amn-status.v1',
  conformance_receipt: 'axiom-amn-conformance-receipt.v1'
});

export const AMN_TRUST_SIGNATURE_PROFILE = 'axiom-json-ed25519-v1';

const ID = /^[A-Za-z0-9][A-Za-z0-9_.:@/-]{0,191}$/;
const DIGEST = /^[a-f0-9]{64}$/;
const BASE64URL = /^[A-Za-z0-9_-]+$/;
const REASON = /^[a-z][a-z0-9._-]{0,63}$/;

const ENVELOPE_KEYS = new Set([
  'schema',
  'signature_profile',
  'issuer_id',
  'issuer_key_id',
  'issued_at',
  'subject_id',
  'claims',
  'non_authority',
  'statement_digest',
  'issuer_signature',
  'evidence_digest'
]);

const NON_AUTHORITY_KEYS = new Set([
  'authority_effect',
  'delegation_effect',
  'truth_claimed',
  'hardware_attestation_claimed',
  'global_currentness_claimed'
]);

const NON_AUTHORITY = Object.freeze({
  authority_effect: 'none',
  delegation_effect: 'none',
  truth_claimed: false,
  hardware_attestation_claimed: false,
  global_currentness_claimed: false
});

function exactKeys(raw, allowed, label) {
  const value = assertPlainObject(raw, label);
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) {
      throw new ValidationError(label + ' contains unsupported field ' + key);
    }
  }
  return value;
}

function identifier(value, label) {
  return assertString(value, label, { min: 1, max: 192, pattern: ID });
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
    throw new ValidationError(label + ' must be a canonical UTC ISO timestamp');
  }
  return text;
}

function nullableTimestamp(value, label) {
  return value === null ? null : canonicalTimestamp(value, label);
}

function positiveInteger(value, label) {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new ValidationError(label + ' must be a positive safe integer');
  }
  return value;
}

function nonNegativeInteger(value, label) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new ValidationError(label + ' must be a non-negative safe integer');
  }
  return value;
}

function oneOf(value, label, allowed) {
  const text = assertString(value, label, { min: 1, max: 64 });
  if (!allowed.has(text)) {
    throw new ValidationError(label + ' is unsupported');
  }
  return text;
}

function uniqueStrings(value, label, { maxItems = 64, itemMax = 256 } = {}) {
  if (!Array.isArray(value) || value.length > maxItems) {
    throw new ValidationError(label + ' must be an array with at most ' + maxItems + ' items');
  }
  const normalized = value.map((item, index) => (
    assertString(item, label + '[' + index + ']', { min: 1, max: itemMax })
  ));
  if (new Set(normalized).size !== normalized.length) {
    throw new ValidationError(label + ' must not contain duplicates');
  }
  return Object.freeze(normalized);
}

function digestArray(value, label, { maxItems = 32 } = {}) {
  if (!Array.isArray(value) || value.length > maxItems) {
    throw new ValidationError(label + ' must be an array with at most ' + maxItems + ' items');
  }
  const normalized = value.map((item, index) => digest(item, label + '[' + index + ']'));
  if (new Set(normalized).size !== normalized.length) {
    throw new ValidationError(label + ' must not contain duplicates');
  }
  return Object.freeze(normalized);
}

function parsePrivateKey(value, label) {
  let key;
  try {
    key = value && typeof value === 'object' && value.type === 'private'
      ? value
      : createPrivateKey(value);
  } catch {
    throw new ValidationError(label + ' is invalid');
  }
  if (key.asymmetricKeyType !== 'ed25519') {
    throw new ValidationError(label + ' must be Ed25519');
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
    throw new ValidationError(label + ' is invalid');
  }
  if (key.asymmetricKeyType !== 'ed25519') {
    throw new ValidationError(label + ' must be Ed25519');
  }
  return key;
}

function canonicalPublicKey(value, label) {
  return parsePublicKey(value, label).export({ type: 'spki', format: 'pem' }).toString();
}

export function amnTrustKeyId(value, label = 'AMN trust public key') {
  return sha256(canonicalPublicKey(value, label));
}

function normalizeNonAuthority(raw) {
  const value = exactKeys(raw, NON_AUTHORITY_KEYS, 'AMN trust non_authority');
  if (
    value.authority_effect !== 'none'
    || value.delegation_effect !== 'none'
    || value.truth_claimed !== false
    || value.hardware_attestation_claimed !== false
    || value.global_currentness_claimed !== false
  ) {
    throw new ValidationError('AMN trust evidence widens its non-authority boundary');
  }
  return NON_AUTHORITY;
}

const NODE_IDENTITY_KEYS = new Set([
  'node_id',
  'trust_domain',
  'platform_vendor',
  'platform_family',
  'identity_method',
  'subject_key_id',
  'subject_public_key'
]);

function normalizeNodeIdentity(raw) {
  const value = exactKeys(raw, NODE_IDENTITY_KEYS, 'AMN node identity claims');
  const publicKey = canonicalPublicKey(value.subject_public_key, 'AMN node identity subject_public_key');
  const keyId = digest(value.subject_key_id, 'AMN node identity subject_key_id');
  if (keyId !== sha256(publicKey)) {
    throw new ValidationError('AMN node identity subject_key_id does not match public key');
  }
  return Object.freeze({
    node_id: identifier(value.node_id, 'AMN node identity node_id'),
    trust_domain: identifier(value.trust_domain, 'AMN node identity trust_domain'),
    platform_vendor: identifier(value.platform_vendor, 'AMN node identity platform_vendor'),
    platform_family: identifier(value.platform_family, 'AMN node identity platform_family'),
    identity_method: oneOf(value.identity_method, 'AMN node identity identity_method', new Set([
      'software-key',
      'hardware-backed-key',
      'external-credential'
    ])),
    subject_key_id: keyId,
    subject_public_key: publicKey
  });
}

const WORKLOAD_KEYS = new Set([
  'workload_id',
  'node_id',
  'runtime_instance_id',
  'software_digest',
  'configuration_digest',
  'model_digests',
  'identity_method'
]);

function normalizeWorkloadBinding(raw) {
  const value = exactKeys(raw, WORKLOAD_KEYS, 'AMN workload binding claims');
  return Object.freeze({
    workload_id: identifier(value.workload_id, 'AMN workload binding workload_id'),
    node_id: identifier(value.node_id, 'AMN workload binding node_id'),
    runtime_instance_id: identifier(value.runtime_instance_id, 'AMN workload binding runtime_instance_id'),
    software_digest: digest(value.software_digest, 'AMN workload binding software_digest'),
    configuration_digest: digest(value.configuration_digest, 'AMN workload binding configuration_digest'),
    model_digests: digestArray(value.model_digests, 'AMN workload binding model_digests'),
    identity_method: oneOf(value.identity_method, 'AMN workload binding identity_method', new Set([
      'software-runtime',
      'workload-svid'
    ]))
  });
}

const CONFIG_KEYS = new Set([
  'node_id',
  'configuration_id',
  'configuration_digest',
  'approved_by',
  'approval_policy',
  'valid_from',
  'valid_until',
  'calibration_reference_digest',
  'interface_profiles'
]);

function normalizeConfigurationAttestation(raw) {
  const value = exactKeys(raw, CONFIG_KEYS, 'AMN configuration attestation claims');
  const validFrom = canonicalTimestamp(value.valid_from, 'AMN configuration attestation valid_from');
  const validUntil = nullableTimestamp(value.valid_until, 'AMN configuration attestation valid_until');
  if (validUntil !== null && new Date(validUntil).valueOf() <= new Date(validFrom).valueOf()) {
    throw new ValidationError('AMN configuration attestation valid_until must follow valid_from');
  }
  return Object.freeze({
    node_id: identifier(value.node_id, 'AMN configuration attestation node_id'),
    configuration_id: identifier(value.configuration_id, 'AMN configuration attestation configuration_id'),
    configuration_digest: digest(value.configuration_digest, 'AMN configuration attestation configuration_digest'),
    approved_by: identifier(value.approved_by, 'AMN configuration attestation approved_by'),
    approval_policy: identifier(value.approval_policy, 'AMN configuration attestation approval_policy'),
    valid_from: validFrom,
    valid_until: validUntil,
    calibration_reference_digest: nullableDigest(
      value.calibration_reference_digest,
      'AMN configuration attestation calibration_reference_digest'
    ),
    interface_profiles: uniqueStrings(value.interface_profiles, 'AMN configuration attestation interface_profiles')
  });
}

const SOFTWARE_MODEL_KEYS = new Set([
  'artifact_type',
  'artifact_id',
  'artifact_digest',
  'version',
  'publisher',
  'build_provenance_digest',
  'sbom_digest',
  'approved_profiles'
]);

function normalizeSoftwareModelAttestation(raw) {
  const value = exactKeys(raw, SOFTWARE_MODEL_KEYS, 'AMN software/model attestation claims');
  return Object.freeze({
    artifact_type: oneOf(value.artifact_type, 'AMN software/model attestation artifact_type', new Set([
      'software',
      'firmware',
      'model'
    ])),
    artifact_id: identifier(value.artifact_id, 'AMN software/model attestation artifact_id'),
    artifact_digest: digest(value.artifact_digest, 'AMN software/model attestation artifact_digest'),
    version: assertString(value.version, 'AMN software/model attestation version', { min: 1, max: 128 }),
    publisher: identifier(value.publisher, 'AMN software/model attestation publisher'),
    build_provenance_digest: nullableDigest(
      value.build_provenance_digest,
      'AMN software/model attestation build_provenance_digest'
    ),
    sbom_digest: nullableDigest(value.sbom_digest, 'AMN software/model attestation sbom_digest'),
    approved_profiles: uniqueStrings(value.approved_profiles, 'AMN software/model attestation approved_profiles')
  });
}

const OBSERVATION_KEYS = new Set([
  'observation_id',
  'node_id',
  'workload_id',
  'sensor_id',
  'capture_time',
  'observation_digest',
  'configuration_digest',
  'software_digest',
  'model_digests',
  'coordinate_frame',
  'status_snapshot_digest',
  'time_uncertainty_ms'
]);

function normalizeObservationProof(raw) {
  const value = exactKeys(raw, OBSERVATION_KEYS, 'AMN observation proof claims');
  return Object.freeze({
    observation_id: identifier(value.observation_id, 'AMN observation proof observation_id'),
    node_id: identifier(value.node_id, 'AMN observation proof node_id'),
    workload_id: identifier(value.workload_id, 'AMN observation proof workload_id'),
    sensor_id: identifier(value.sensor_id, 'AMN observation proof sensor_id'),
    capture_time: canonicalTimestamp(value.capture_time, 'AMN observation proof capture_time'),
    observation_digest: digest(value.observation_digest, 'AMN observation proof observation_digest'),
    configuration_digest: digest(value.configuration_digest, 'AMN observation proof configuration_digest'),
    software_digest: digest(value.software_digest, 'AMN observation proof software_digest'),
    model_digests: digestArray(value.model_digests, 'AMN observation proof model_digests'),
    coordinate_frame: assertString(value.coordinate_frame, 'AMN observation proof coordinate_frame', {
      min: 1,
      max: 128
    }),
    status_snapshot_digest: digest(value.status_snapshot_digest, 'AMN observation proof status_snapshot_digest'),
    time_uncertainty_ms: nonNegativeInteger(value.time_uncertainty_ms, 'AMN observation proof time_uncertainty_ms')
  });
}

const STATUS_KEYS = new Set([
  'subject_id',
  'subject_type',
  'status',
  'reason_code',
  'effective_at',
  'sequence'
]);

function normalizeStatus(raw) {
  const value = exactKeys(raw, STATUS_KEYS, 'AMN status claims');
  return Object.freeze({
    subject_id: identifier(value.subject_id, 'AMN status subject_id'),
    subject_type: oneOf(value.subject_type, 'AMN status subject_type', new Set([
      'organization',
      'node',
      'workload',
      'artifact',
      'operator'
    ])),
    status: oneOf(value.status, 'AMN status status', new Set([
      'active',
      'suspended',
      'revoked',
      'expired',
      'unknown',
      'stale',
      'quarantined'
    ])),
    reason_code: assertString(value.reason_code, 'AMN status reason_code', {
      min: 1,
      max: 64,
      pattern: REASON
    }),
    effective_at: canonicalTimestamp(value.effective_at, 'AMN status effective_at'),
    sequence: positiveInteger(value.sequence, 'AMN status sequence')
  });
}

const CONFORMANCE_KEYS = new Set([
  'test_suite_id',
  'test_suite_version',
  'subject_platform',
  'software_digest',
  'configuration_digest',
  'adapter_version',
  'environment_digest',
  'executed_at',
  'result',
  'result_set_digest',
  'exceptions',
  'evidence_bundle_digest',
  'tester_identity'
]);

function normalizeConformanceReceipt(raw) {
  const value = exactKeys(raw, CONFORMANCE_KEYS, 'AMN conformance receipt claims');
  return Object.freeze({
    test_suite_id: identifier(value.test_suite_id, 'AMN conformance receipt test_suite_id'),
    test_suite_version: assertString(value.test_suite_version, 'AMN conformance receipt test_suite_version', {
      min: 1,
      max: 128
    }),
    subject_platform: identifier(value.subject_platform, 'AMN conformance receipt subject_platform'),
    software_digest: digest(value.software_digest, 'AMN conformance receipt software_digest'),
    configuration_digest: digest(value.configuration_digest, 'AMN conformance receipt configuration_digest'),
    adapter_version: assertString(value.adapter_version, 'AMN conformance receipt adapter_version', {
      min: 1,
      max: 128
    }),
    environment_digest: digest(value.environment_digest, 'AMN conformance receipt environment_digest'),
    executed_at: canonicalTimestamp(value.executed_at, 'AMN conformance receipt executed_at'),
    result: oneOf(value.result, 'AMN conformance receipt result', new Set(['pass', 'fail', 'partial'])),
    result_set_digest: digest(value.result_set_digest, 'AMN conformance receipt result_set_digest'),
    exceptions: uniqueStrings(value.exceptions, 'AMN conformance receipt exceptions', {
      maxItems: 64,
      itemMax: 512
    }),
    evidence_bundle_digest: digest(value.evidence_bundle_digest, 'AMN conformance receipt evidence_bundle_digest'),
    tester_identity: identifier(value.tester_identity, 'AMN conformance receipt tester_identity')
  });
}

const SCHEMA_DEFS = new Map([
  [AMN_TRUST_SCHEMAS.node_identity, {
    normalize: normalizeNodeIdentity,
    subject: claims => claims.node_id
  }],
  [AMN_TRUST_SCHEMAS.workload_binding, {
    normalize: normalizeWorkloadBinding,
    subject: claims => claims.workload_id
  }],
  [AMN_TRUST_SCHEMAS.configuration_attestation, {
    normalize: normalizeConfigurationAttestation,
    subject: claims => claims.configuration_id
  }],
  [AMN_TRUST_SCHEMAS.software_model_attestation, {
    normalize: normalizeSoftwareModelAttestation,
    subject: claims => claims.artifact_id
  }],
  [AMN_TRUST_SCHEMAS.observation_proof, {
    normalize: normalizeObservationProof,
    subject: claims => claims.observation_id
  }],
  [AMN_TRUST_SCHEMAS.status, {
    normalize: normalizeStatus,
    subject: claims => claims.subject_id
  }],
  [AMN_TRUST_SCHEMAS.conformance_receipt, {
    normalize: normalizeConformanceReceipt,
    subject: claims => claims.subject_platform
  }]
]);

function schemaDef(schema) {
  const normalized = assertString(schema, 'AMN trust schema', { min: 1, max: 96 });
  const definition = SCHEMA_DEFS.get(normalized);
  if (!definition) throw new ValidationError('AMN trust schema is unsupported');
  return definition;
}

function normalizeStatementCore({ schema, issuerId, issuerKeyId, issuedAt, subjectId, claims, nonAuthority }) {
  const definition = schemaDef(schema);
  const normalizedClaims = definition.normalize(claims);
  const derivedSubject = definition.subject(normalizedClaims);
  const subject = identifier(subjectId, 'AMN trust subject_id');
  if (subject !== derivedSubject) {
    throw new ValidationError('AMN trust subject_id does not match claims');
  }
  return Object.freeze({
    schema,
    signature_profile: AMN_TRUST_SIGNATURE_PROFILE,
    issuer_id: identifier(issuerId, 'AMN trust issuer_id'),
    issuer_key_id: digest(issuerKeyId, 'AMN trust issuer_key_id'),
    issued_at: canonicalTimestamp(issuedAt, 'AMN trust issued_at'),
    subject_id: subject,
    claims: normalizedClaims,
    non_authority: normalizeNonAuthority(nonAuthority)
  });
}

export function createAmnTrustStatement({
  schema,
  issuerId,
  issuerPrivateKey,
  issuedAt,
  claims
} = {}) {
  const privateKey = parsePrivateKey(issuerPrivateKey, 'AMN trust issuer private key');
  const publicKey = createPublicKey(privateKey);
  const issuerKeyId = amnTrustKeyId(publicKey, 'AMN trust issuer public key');
  const definition = schemaDef(schema);
  const normalizedClaims = definition.normalize(claims);
  const subjectId = definition.subject(normalizedClaims);
  const core = normalizeStatementCore({
    schema,
    issuerId,
    issuerKeyId,
    issuedAt,
    subjectId,
    claims: normalizedClaims,
    nonAuthority: NON_AUTHORITY
  });
  const statementDigest = digestObject(core);
  const signable = Object.freeze({ ...core, statement_digest: statementDigest });
  const issuerSignature = sign(
    null,
    Buffer.from(canonicalJson(signable)),
    privateKey
  ).toString('base64url');
  const signed = Object.freeze({
    ...signable,
    issuer_signature: issuerSignature
  });
  return Object.freeze({
    ...signed,
    evidence_digest: digestObject(signed)
  });
}

export function verifyAmnTrustStatement(raw, {
  trustedIssuerPublicKey,
  expectedIssuerId,
  expectedSubjectId
} = {}) {
  const value = exactKeys(raw, ENVELOPE_KEYS, 'AMN trust statement');
  if (value.signature_profile !== AMN_TRUST_SIGNATURE_PROFILE) {
    throw new ValidationError('AMN trust signature_profile is unsupported');
  }
  const trustedKey = parsePublicKey(trustedIssuerPublicKey, 'trusted AMN issuer public key');
  const trustedKeyId = amnTrustKeyId(trustedKey);
  const core = normalizeStatementCore({
    schema: value.schema,
    issuerId: value.issuer_id,
    issuerKeyId: value.issuer_key_id,
    issuedAt: value.issued_at,
    subjectId: value.subject_id,
    claims: value.claims,
    nonAuthority: value.non_authority
  });
  if (core.issuer_key_id !== trustedKeyId) {
    throw new ValidationError('AMN trust issuer key substitution');
  }
  if (expectedIssuerId !== undefined && core.issuer_id !== expectedIssuerId) {
    throw new ValidationError('AMN trust issuer_id mismatch');
  }
  if (expectedSubjectId !== undefined && core.subject_id !== expectedSubjectId) {
    throw new ValidationError('AMN trust subject_id mismatch');
  }
  const statementDigest = digest(value.statement_digest, 'AMN trust statement_digest');
  if (statementDigest !== digestObject(core)) {
    throw new ValidationError('AMN trust statement digest mismatch');
  }
  const signature = assertString(value.issuer_signature, 'AMN trust issuer_signature', {
    min: 32,
    max: 1024,
    pattern: BASE64URL
  });
  let signatureValid = false;
  try {
    signatureValid = verify(
      null,
      Buffer.from(canonicalJson({ ...core, statement_digest: statementDigest })),
      trustedKey,
      Buffer.from(signature, 'base64url')
    );
  } catch {
    signatureValid = false;
  }
  if (!signatureValid) {
    throw new ValidationError('AMN trust issuer signature is invalid');
  }
  const signed = Object.freeze({
    ...core,
    statement_digest: statementDigest,
    issuer_signature: signature
  });
  const evidenceDigest = digest(value.evidence_digest, 'AMN trust evidence_digest');
  if (evidenceDigest !== digestObject(signed)) {
    throw new ValidationError('AMN trust evidence_digest mismatch');
  }
  return Object.freeze({
    ...signed,
    evidence_digest: evidenceDigest,
    verification: Object.freeze({
      cryptographic_validity: true,
      schema_validity: true,
      authority_effect: 'none',
      truth_claimed: false,
      hardware_attestation_claimed: false,
      global_currentness_claimed: false
    })
  });
}

export function amnTrustStatementDigest(value) {
  const statement = assertPlainObject(value, 'AMN trust statement');
  return digest(statement.statement_digest, 'AMN trust statement_digest');
}

export function amnTrustEvidenceDigest(value) {
  const statement = assertPlainObject(value, 'AMN trust statement');
  return digest(statement.evidence_digest, 'AMN trust evidence_digest');
}
