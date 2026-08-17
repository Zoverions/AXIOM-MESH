import { createPublicKey, verify as verifySignature } from 'node:crypto';

import { canonicalJson, sha256, ValidationError } from './canonical.mjs';
import {
  validateAgentInfrastructureChallenge,
  validateAgentInfrastructureOffer
} from './agent-infrastructure-lab.mjs';

export const AGENT_DEVICE_ATTESTATION_SCHEMA = 'axiom-agent-device-attestation.v1';
export const AGENT_TEST_SESSION_AUTHORIZATION_SCHEMA = 'axiom-agent-test-session-authorization.v1';
export const AGENT_DEVICE_ATTESTATION_MAX_SECONDS = 900;
export const AGENT_TEST_SESSION_MAX_SECONDS = 900;

const REPOSITORY = 'Zoverions/AXIOM-MESH';
const ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/;
const SHA256 = /^[a-f0-9]{64}$/;
const NONCE = /^[A-Za-z0-9_-]{22,128}$/;
const BASE64 = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;
const SAFE_OPERATIONS = new Set([
  'read-system-facts',
  'create-disposable-workspace',
  'install-test-dependencies',
  'run-build',
  'run-tests',
  'start-local-test-services',
  'collect-sanitized-logs',
  'collect-benchmark-metrics',
  'reset-disposable-workspace'
]);

export function validateAgentDeviceAttestation(attestation, {
  offer,
  expectedNonce,
  now = new Date()
} = {}) {
  boundedDocument(attestation, 'Agent device attestation');
  exactKeys(attestation, 'Agent device attestation', [
    'schema', 'statement', 'key', 'signature_base64', 'evidence_refs', 'boundaries'
  ]);
  if (attestation.schema !== AGENT_DEVICE_ATTESTATION_SCHEMA) {
    throw new ValidationError('Agent device attestation schema is invalid');
  }

  exactKeys(attestation.statement, 'Agent device attestation statement', [
    'attestation_id', 'repository', 'offer_id', 'node_profile_sha256', 'nonce',
    'issued_at', 'expires_at', 'claims'
  ]);
  const statement = attestation.statement;
  if (
    !ID.test(statement.attestation_id ?? '')
    || statement.repository !== REPOSITORY
    || !ID.test(statement.offer_id ?? '')
    || !SHA256.test(statement.node_profile_sha256 ?? '')
    || !NONCE.test(statement.nonce ?? '')
  ) throw new ValidationError('Agent device attestation statement identity is invalid');
  if (expectedNonce !== undefined && statement.nonce !== expectedNonce) {
    throw new ValidationError('Agent device attestation nonce does not match the challenge nonce');
  }

  assertFalseBoundary(statement.claims, 'Agent device attestation unsupported claims', [
    'physical_ownership_verified',
    'platform_backed_key_verified',
    'secure_element_verified',
    'boot_integrity_verified',
    'external_verifier_confirmed'
  ]);

  const issuedAt = parseDate(statement.issued_at, 'Agent device attestation issued_at');
  const expiresAt = parseDate(statement.expires_at, 'Agent device attestation expires_at');
  const nowDate = normalizeDate(now, 'Agent device attestation now');
  const ttlSeconds = (expiresAt.getTime() - issuedAt.getTime()) / 1000;
  if (
    ttlSeconds <= 0
    || ttlSeconds > AGENT_DEVICE_ATTESTATION_MAX_SECONDS
    || issuedAt.getTime() > nowDate.getTime() + 60_000
    || expiresAt.getTime() <= nowDate.getTime()
  ) throw new ValidationError('Agent device attestation freshness window is invalid');

  if (offer) {
    validateAgentInfrastructureOffer(offer);
    if (
      statement.offer_id !== offer.offer_id
      || statement.node_profile_sha256 !== offer.node_profile.profile_sha256
    ) throw new ValidationError('Agent device attestation does not bind the offered hardware');
    const offerStarts = parseDate(offer.availability.starts_at, 'Agent infrastructure offer starts_at');
    const offerExpires = parseDate(offer.availability.expires_at, 'Agent infrastructure offer expires_at');
    if (issuedAt < offerStarts || expiresAt > offerExpires) {
      throw new ValidationError('Agent device attestation falls outside the hardware offer window');
    }
  }

  exactKeys(attestation.key, 'Agent device attestation key', [
    'algorithm', 'public_key_spki_der_base64', 'fingerprint_sha256'
  ]);
  if (
    attestation.key.algorithm !== 'ed25519'
    || !SHA256.test(attestation.key.fingerprint_sha256 ?? '')
    || !validBase64(attestation.key.public_key_spki_der_base64)
  ) throw new ValidationError('Agent device attestation key metadata is invalid');

  const publicKeyDer = Buffer.from(attestation.key.public_key_spki_der_base64, 'base64');
  if (publicKeyDer.length < 32 || publicKeyDer.length > 512) {
    throw new ValidationError('Agent device attestation public key size is invalid');
  }
  if (sha256(publicKeyDer) !== attestation.key.fingerprint_sha256) {
    throw new ValidationError('Agent device attestation key fingerprint does not match the public key');
  }

  if (!validBase64(attestation.signature_base64)) {
    throw new ValidationError('Agent device attestation signature encoding is invalid');
  }
  const signature = Buffer.from(attestation.signature_base64, 'base64');
  if (signature.length !== 64) {
    throw new ValidationError('Agent device attestation Ed25519 signature size is invalid');
  }

  let publicKey;
  try {
    publicKey = createPublicKey({ key: publicKeyDer, format: 'der', type: 'spki' });
  } catch {
    throw new ValidationError('Agent device attestation public key cannot be parsed');
  }
  let signatureValid = false;
  try {
    signatureValid = verifySignature(
      null,
      Buffer.from(canonicalJson(statement), 'utf8'),
      publicKey,
      signature
    );
  } catch {
    signatureValid = false;
  }
  if (!signatureValid) {
    throw new ValidationError('Agent device attestation key-possession signature is invalid');
  }

  boundedRefs(attestation.evidence_refs, 'Agent device attestation evidence refs', 64, true);
  assertFalseBoundary(attestation.boundaries, 'Agent device attestation boundaries', [
    'production_enrollment_allowed',
    'remote_execution_allowed',
    'credential_issuance_allowed',
    'secret_access_allowed',
    'firmware_changes_allowed',
    'platform_trust_inferred',
    'authority_granted'
  ]);

  return Object.freeze({
    valid: true,
    attestation_id: statement.attestation_id,
    offer_id: statement.offer_id,
    node_profile_sha256: statement.node_profile_sha256,
    key_fingerprint_sha256: attestation.key.fingerprint_sha256,
    proof: 'ed25519-key-possession-only',
    platform_trust_inferred: false,
    authority_granted: false
  });
}

export function validateAgentTestSessionAuthorization(authorization, {
  challenge,
  offer,
  attestation,
  expectedNonce,
  now = new Date()
} = {}) {
  boundedDocument(authorization, 'Agent test session authorization');
  exactKeys(authorization, 'Agent test session authorization', [
    'schema', 'authorization_id', 'repository', 'sponsor', 'subject', 'challenge',
    'attestation', 'timing', 'scope', 'revocation', 'effects'
  ]);
  if (
    authorization.schema !== AGENT_TEST_SESSION_AUTHORIZATION_SCHEMA
    || !ID.test(authorization.authorization_id ?? '')
    || authorization.repository !== REPOSITORY
  ) throw new ValidationError('Agent test session authorization identity is invalid');

  exactKeys(authorization.sponsor, 'Agent test session sponsor', ['type', 'id', 'approval_ref']);
  if (
    authorization.sponsor.type !== 'human'
    || !ID.test(authorization.sponsor.id ?? '')
    || !boundedString(authorization.sponsor.approval_ref, 1024)
  ) throw new ValidationError('Agent test session requires a human sponsor');

  exactKeys(authorization.subject, 'Agent test session subject', ['type', 'id']);
  if (authorization.subject.type !== 'machine' || !ID.test(authorization.subject.id ?? '')) {
    throw new ValidationError('Agent test session subject must be a machine principal');
  }

  exactKeys(authorization.challenge, 'Agent test session challenge binding', [
    'challenge_id', 'offer_id', 'node_profile_sha256'
  ]);
  if (
    !ID.test(authorization.challenge.challenge_id ?? '')
    || !ID.test(authorization.challenge.offer_id ?? '')
    || !SHA256.test(authorization.challenge.node_profile_sha256 ?? '')
  ) throw new ValidationError('Agent test session challenge binding is invalid');

  exactKeys(authorization.attestation, 'Agent test session attestation binding', [
    'attestation_id', 'key_fingerprint_sha256'
  ]);
  if (
    !ID.test(authorization.attestation.attestation_id ?? '')
    || !SHA256.test(authorization.attestation.key_fingerprint_sha256 ?? '')
  ) throw new ValidationError('Agent test session attestation binding is invalid');

  exactKeys(authorization.timing, 'Agent test session timing', [
    'issued_at', 'not_before', 'expires_at', 'maximum_duration_seconds'
  ]);
  const issuedAt = parseDate(authorization.timing.issued_at, 'Agent test session issued_at');
  const notBefore = parseDate(authorization.timing.not_before, 'Agent test session not_before');
  const expiresAt = parseDate(authorization.timing.expires_at, 'Agent test session expires_at');
  const nowDate = normalizeDate(now, 'Agent test session now');
  const durationSeconds = (expiresAt.getTime() - notBefore.getTime()) / 1000;
  if (
    !Number.isSafeInteger(authorization.timing.maximum_duration_seconds)
    || authorization.timing.maximum_duration_seconds < 1
    || authorization.timing.maximum_duration_seconds > AGENT_TEST_SESSION_MAX_SECONDS
    || issuedAt > notBefore
    || durationSeconds <= 0
    || durationSeconds > authorization.timing.maximum_duration_seconds
    || issuedAt.getTime() > nowDate.getTime() + 60_000
    || expiresAt.getTime() <= nowDate.getTime()
  ) throw new ValidationError('Agent test session timing is invalid');

  exactKeys(authorization.scope, 'Agent test session scope', [
    'allowed_operations', 'network', 'filesystem_scope', 'credentials_allowed',
    'secret_access_allowed', 'interactive_shell_allowed', 'unbounded_remote_shell_allowed'
  ]);
  setArray(authorization.scope.allowed_operations, 'Agent test session allowed operations', SAFE_OPERATIONS, 1, 16);
  if (
    authorization.scope.filesystem_scope !== 'disposable-workspace-only'
    || authorization.scope.credentials_allowed !== false
    || authorization.scope.secret_access_allowed !== false
    || authorization.scope.interactive_shell_allowed !== false
    || authorization.scope.unbounded_remote_shell_allowed !== false
  ) throw new ValidationError('Agent test session scope attempts to widen authority');

  exactKeys(authorization.scope.network, 'Agent test session network', ['mode', 'allowed_origins']);
  if (!['none', 'bounded-public-read', 'owner-lan'].includes(authorization.scope.network.mode)) {
    throw new ValidationError('Agent test session network mode is invalid');
  }
  boundedRefs(authorization.scope.network.allowed_origins, 'Agent test session network origins', 32, true);
  if (authorization.scope.network.mode === 'none' && authorization.scope.network.allowed_origins.length !== 0) {
    throw new ValidationError('Agent test session none network mode cannot name origins');
  }

  exactKeys(authorization.revocation, 'Agent test session revocation', [
    'revocable', 'one_time', 'fail_closed_on_unknown', 'revocation_ref'
  ]);
  if (
    authorization.revocation.revocable !== true
    || authorization.revocation.one_time !== true
    || authorization.revocation.fail_closed_on_unknown !== true
    || !boundedString(authorization.revocation.revocation_ref, 1024)
  ) throw new ValidationError('Agent test session revocation must remain one-time and fail closed');

  assertFalseBoundary(authorization.effects, 'Agent test session effects', [
    'effect_reachable',
    'production_enrollment',
    'persistent_remote_administration',
    'credentials_issued',
    'secrets_accessed',
    'firmware_changed',
    'boot_chain_changed',
    'purchase_performed',
    'destructive_action_performed',
    'permanent_system_mutation',
    'deployment_authority',
    'capability_promoted'
  ]);

  if (offer) {
    validateAgentInfrastructureOffer(offer);
    if (
      authorization.challenge.offer_id !== offer.offer_id
      || authorization.challenge.node_profile_sha256 !== offer.node_profile.profile_sha256
    ) throw new ValidationError('Agent test session does not bind the offered hardware');
    const offerStarts = parseDate(offer.availability.starts_at, 'Agent infrastructure offer starts_at');
    const offerExpires = parseDate(offer.availability.expires_at, 'Agent infrastructure offer expires_at');
    if (notBefore < offerStarts || expiresAt > offerExpires) {
      throw new ValidationError('Agent test session falls outside the hardware offer window');
    }
  }

  if (challenge) {
    validateAgentInfrastructureChallenge(challenge, { offer });
    if (
      authorization.challenge.challenge_id !== challenge.challenge_id
      || authorization.challenge.offer_id !== challenge.target.offer_id
      || authorization.challenge.node_profile_sha256 !== challenge.target.node_profile_sha256
    ) throw new ValidationError('Agent test session does not bind the exact infrastructure challenge');
    const allowedByChallenge = new Set(challenge.plan.allowed_operations);
    if (authorization.scope.allowed_operations.some(operation => !allowedByChallenge.has(operation))) {
      throw new ValidationError('Agent test session widens the challenge operation set');
    }
    if (authorization.scope.network.mode !== challenge.plan.network.mode) {
      throw new ValidationError('Agent test session widens or changes the challenge network mode');
    }
    const allowedOrigins = new Set(challenge.plan.network.allowed_origins);
    if (authorization.scope.network.allowed_origins.some(origin => !allowedOrigins.has(origin))) {
      throw new ValidationError('Agent test session widens the challenge network origins');
    }
    const challengeExpires = parseDate(challenge.expires_at, 'Agent infrastructure challenge expires_at');
    if (expiresAt > challengeExpires) {
      throw new ValidationError('Agent test session outlives the infrastructure challenge');
    }
  }

  if (attestation) {
    const attested = validateAgentDeviceAttestation(attestation, { offer, expectedNonce, now: nowDate });
    if (
      authorization.attestation.attestation_id !== attested.attestation_id
      || authorization.attestation.key_fingerprint_sha256 !== attested.key_fingerprint_sha256
      || authorization.challenge.offer_id !== attested.offer_id
      || authorization.challenge.node_profile_sha256 !== attested.node_profile_sha256
    ) throw new ValidationError('Agent test session does not bind the exact device attestation');
    const attestationIssued = parseDate(attestation.statement.issued_at, 'Agent device attestation issued_at');
    const attestationExpires = parseDate(attestation.statement.expires_at, 'Agent device attestation expires_at');
    if (notBefore < attestationIssued || expiresAt > attestationExpires) {
      throw new ValidationError('Agent test session falls outside the attestation freshness window');
    }
  }

  return Object.freeze({
    valid: true,
    authorization_id: authorization.authorization_id,
    sponsor_id: authorization.sponsor.id,
    subject_id: authorization.subject.id,
    one_time: true,
    revocable: true,
    effect_reachable: false,
    production_authority: false
  });
}

function boundedDocument(value, label) {
  if (!plainObject(value)) throw new ValidationError(`${label} must be an object`);
  if (Buffer.byteLength(JSON.stringify(value), 'utf8') > 262_144) {
    throw new ValidationError(`${label} exceeds the maximum encoded size`);
  }
}

function assertFalseBoundary(value, label, keys) {
  exactKeys(value, label, keys);
  for (const key of keys) if (value[key] !== false) throw new ValidationError(`${label} cannot elevate ${key}`);
}

function setArray(value, label, allowed, min, max) {
  if (!Array.isArray(value) || value.length < min || value.length > max || new Set(value).size !== value.length) {
    throw new ValidationError(`${label} are invalid`);
  }
  for (const item of value) if (!allowed.has(item)) throw new ValidationError(`${label} contains unsupported value: ${item}`);
}

function boundedRefs(value, label, max, allowEmpty) {
  if (!Array.isArray(value) || (!allowEmpty && value.length < 1) || value.length > max || new Set(value).size !== value.length) {
    throw new ValidationError(`${label} are invalid`);
  }
  for (const item of value) if (!boundedString(item, 1024) || item.includes('\0')) throw new ValidationError(`${label} contains an invalid reference`);
}

function parseDate(value, label) {
  if (typeof value !== 'string') throw new ValidationError(`${label} is invalid`);
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) throw new ValidationError(`${label} is invalid`);
  return parsed;
}

function normalizeDate(value, label) {
  const parsed = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  if (Number.isNaN(parsed.getTime())) throw new ValidationError(`${label} is invalid`);
  return parsed;
}

function validBase64(value) {
  return typeof value === 'string' && value.length >= 1 && value.length <= 2048 && BASE64.test(value);
}

function exactKeys(value, label, keys) {
  if (!plainObject(value)) throw new ValidationError(`${label} must be an object`);
  const expected = new Set(keys);
  for (const key of Object.keys(value)) if (!expected.has(key)) throw new ValidationError(`${label} contains unsupported field: ${key}`);
  for (const key of keys) if (!Object.hasOwn(value, key)) throw new ValidationError(`${label} is missing required field: ${key}`);
}

function boundedString(value, max) {
  return typeof value === 'string' && value.length >= 1 && value.length <= max;
}

function plainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
