import { createPublicKey } from 'node:crypto';
import {
  ValidationError,
  assertPlainObject,
  assertString,
  canonicalJson,
  digestObject
} from './canonical.mjs';
import { verifyObjectSignature } from './identity.mjs';

export const CONTEXT_AUTHORITY_LIFECYCLE_COMMAND_V1_SCHEMA =
  'axiom-context-authority-lifecycle-command.v1';

export const CONTEXT_AUTHORITY_LIFECYCLE_TRANSITIONS = Object.freeze([
  'revoked',
  'superseded'
]);

const TRANSITION_SET = new Set(CONTEXT_AUTHORITY_LIFECYCLE_TRANSITIONS);
const ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/;
const SHA256 = /^[a-f0-9]{64}$/;
const BASE64URL = /^[A-Za-z0-9_-]+$/;
const DATE_TIME =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;
const DEFAULT_MAX_LIFETIME_SECONDS = 900;

const COMMAND_FIELDS = Object.freeze([
  'schema',
  'command_id',
  'issuer_principal_ref',
  'issued_at',
  'expires_at',
  'nonce',
  'transition',
  'target',
  'replacement',
  'reason_code',
  'authority_effect',
  'grants_vault_access',
  'grants_execution_authority',
  'attestation'
]);

const EVIDENCE_BINDING_FIELDS = Object.freeze([
  'evidence_id',
  'evidence_type',
  'issuer_principal_ref',
  'envelope_sha256'
]);

const ATTESTATION_FIELDS = Object.freeze([
  'algorithm',
  'key_id',
  'digest',
  'signature'
]);

const TRUST_PIN_FIELDS = Object.freeze([
  'issuer_principal_ref',
  'key_id',
  'public_key_pem',
  'allowed_transitions'
]);

export function verifyContextAuthorityLifecycleCommand(command, {
  trustPins,
  now = Date.now(),
  maxCommandLifetimeSeconds = DEFAULT_MAX_LIFETIME_SECONDS
} = {}) {
  assertSafeNow(now);
  assertLifetimeLimit(maxCommandLifetimeSeconds);
  const pins = normalizeTrustPins(trustPins);
  const normalized = normalizeCommand(command);
  const pin = pins.get(normalized.issuer_principal_ref);

  if (!pin) {
    throw new ValidationError(
      `Context authority lifecycle command issuer is not locally trusted: ${normalized.issuer_principal_ref}`
    );
  }
  if (!pin.allowed_transitions.includes(normalized.transition)) {
    throw new ValidationError(
      `Context authority lifecycle command issuer is not trusted for transition ${normalized.transition}`
    );
  }
  if (normalized.attestation.key_id !== pin.key_id) {
    throw new ValidationError(
      'Context authority lifecycle command signing key does not match the local pin'
    );
  }

  const issuedAtMs = parseDateTime(
    normalized.issued_at,
    'lifecycle command issued_at'
  );
  const expiresAtMs = parseDateTime(
    normalized.expires_at,
    'lifecycle command expires_at'
  );
  if (expiresAtMs <= issuedAtMs) {
    throw new ValidationError(
      'Context authority lifecycle command expiry must follow issuance'
    );
  }
  if (issuedAtMs > now || expiresAtMs <= now) {
    throw new ValidationError(
      'Context authority lifecycle command is not currently valid'
    );
  }
  if (
    expiresAtMs - issuedAtMs
    > maxCommandLifetimeSeconds * 1000
  ) {
    throw new ValidationError(
      'Context authority lifecycle command lifetime exceeds the local safety limit'
    );
  }

  let publicKey;
  try {
    publicKey = createPublicKey(pin.public_key_pem);
  } catch {
    throw new ValidationError(
      'Context authority lifecycle command trust pin contains an invalid public key'
    );
  }
  if (publicKey.asymmetricKeyType !== 'ed25519') {
    throw new ValidationError(
      'Context authority lifecycle command trust pin must use an Ed25519 public key'
    );
  }

  let signatureValid = false;
  try {
    signatureValid = verifyObjectSignature(
      unsignedCommand(normalized),
      normalized.attestation,
      publicKey
    );
  } catch {
    signatureValid = false;
  }
  if (!signatureValid) {
    throw new ValidationError(
      'Context authority lifecycle command signature is invalid'
    );
  }

  const commandSha256 = digestObject(normalized);
  return deepFreeze({
    valid: true,
    schema: normalized.schema,
    command_id: normalized.command_id,
    issuer_principal_ref: normalized.issuer_principal_ref,
    key_id: normalized.attestation.key_id,
    issued_at: normalized.issued_at,
    expires_at: normalized.expires_at,
    nonce: normalized.nonce,
    transition: normalized.transition,
    target: normalized.target,
    replacement: normalized.replacement,
    reason_code: normalized.reason_code,
    command_sha256: commandSha256,
    signature_verified: true,
    key_pin_verified: true,
    target_binding_verified: true,
    transition_scope_verified: true,
    verifier_consumes_command: false,
    verifier_applies_lifecycle_transition: false,
    verifier_reads_vaults: false,
    verifier_delivers_capsules: false,
    grants_vault_access: false,
    grants_execution_authority: false
  });
}

function normalizeCommand(command) {
  const value = cloneCanonical(
    command,
    'Context authority lifecycle command'
  );
  assertExactKeys(
    value,
    COMMAND_FIELDS,
    'Context authority lifecycle command'
  );

  if (value.schema !== CONTEXT_AUTHORITY_LIFECYCLE_COMMAND_V1_SCHEMA) {
    throw new ValidationError(
      'Context authority lifecycle command schema is invalid'
    );
  }
  assertId(value.command_id, 'lifecycle command command_id');
  assertId(
    value.issuer_principal_ref,
    'lifecycle command issuer_principal_ref'
  );
  assertDateTime(value.issued_at, 'lifecycle command issued_at');
  assertDateTime(value.expires_at, 'lifecycle command expires_at');
  assertId(value.nonce, 'lifecycle command nonce');
  if (!TRANSITION_SET.has(value.transition)) {
    throw new ValidationError(
      'Context authority lifecycle command transition is invalid'
    );
  }
  value.target = normalizeEvidenceBinding(
    value.target,
    'lifecycle command target'
  );
  assertId(value.reason_code, 'lifecycle command reason_code');

  if (
    value.authority_effect !== 'deny-future-context-use-only'
    || value.grants_vault_access !== false
    || value.grants_execution_authority !== false
  ) {
    throw new ValidationError(
      'Context authority lifecycle command cannot grant authority or effects beyond denying future context use'
    );
  }

  if (value.transition === 'revoked') {
    if (value.replacement !== null) {
      throw new ValidationError(
        'Revocation command cannot include replacement evidence'
      );
    }
  } else {
    value.replacement = normalizeEvidenceBinding(
      value.replacement,
      'lifecycle command replacement'
    );
    if (value.replacement.evidence_id === value.target.evidence_id) {
      throw new ValidationError(
        'Supersession command replacement must differ from target evidence'
      );
    }
    if (
      value.replacement.evidence_type !== value.target.evidence_type
      || value.replacement.issuer_principal_ref
        !== value.target.issuer_principal_ref
    ) {
      throw new ValidationError(
        'Supersession command replacement must bind the same evidence type and evidence issuer as the target'
      );
    }
  }

  const attestation = assertPlainObject(
    value.attestation,
    'lifecycle command attestation'
  );
  assertExactKeys(
    attestation,
    ATTESTATION_FIELDS,
    'Context authority lifecycle command attestation'
  );
  if (attestation.algorithm !== 'Ed25519') {
    throw new ValidationError(
      'Context authority lifecycle command attestation algorithm must be Ed25519'
    );
  }
  assertString(attestation.key_id, 'lifecycle command attestation key_id', {
    min: 1,
    max: 160
  });
  assertSha256(
    attestation.digest,
    'lifecycle command attestation digest'
  );
  assertString(
    attestation.signature,
    'lifecycle command attestation signature',
    { min: 1, max: 1024 }
  );
  if (!BASE64URL.test(attestation.signature)) {
    throw new ValidationError(
      'Context authority lifecycle command signature must be base64url'
    );
  }

  return value;
}

function normalizeEvidenceBinding(binding, label) {
  const value = cloneCanonical(binding, label);
  assertExactKeys(value, EVIDENCE_BINDING_FIELDS, label);
  assertId(value.evidence_id, `${label} evidence_id`);
  assertId(value.evidence_type, `${label} evidence_type`);
  assertId(
    value.issuer_principal_ref,
    `${label} issuer_principal_ref`
  );
  assertSha256(value.envelope_sha256, `${label} envelope_sha256`);
  return value;
}

function normalizeTrustPins(trustPins) {
  if (!Array.isArray(trustPins) || trustPins.length < 1 || trustPins.length > 32) {
    throw new ValidationError(
      'Context authority lifecycle command requires 1-32 local trust pins'
    );
  }
  const pins = new Map();
  for (let index = 0; index < trustPins.length; index += 1) {
    const pin = cloneCanonical(
      trustPins[index],
      `lifecycleCommandTrustPins[${index}]`
    );
    assertExactKeys(
      pin,
      TRUST_PIN_FIELDS,
      `lifecycleCommandTrustPins[${index}]`
    );
    assertId(
      pin.issuer_principal_ref,
      `lifecycleCommandTrustPins[${index}].issuer_principal_ref`
    );
    assertString(
      pin.key_id,
      `lifecycleCommandTrustPins[${index}].key_id`,
      { min: 1, max: 160 }
    );
    assertString(
      pin.public_key_pem,
      `lifecycleCommandTrustPins[${index}].public_key_pem`,
      { min: 64, max: 8192 }
    );
    if (
      !Array.isArray(pin.allowed_transitions)
      || pin.allowed_transitions.length < 1
      || pin.allowed_transitions.length > CONTEXT_AUTHORITY_LIFECYCLE_TRANSITIONS.length
    ) {
      throw new ValidationError(
        `lifecycleCommandTrustPins[${index}].allowed_transitions must be a non-empty bounded array`
      );
    }
    const transitions = new Set();
    for (const transition of pin.allowed_transitions) {
      if (!TRANSITION_SET.has(transition)) {
        throw new ValidationError(
          `lifecycleCommandTrustPins[${index}] contains an unknown transition`
        );
      }
      if (transitions.has(transition)) {
        throw new ValidationError(
          `lifecycleCommandTrustPins[${index}] contains a duplicate transition`
        );
      }
      transitions.add(transition);
    }
    pin.allowed_transitions.sort();
    if (pins.has(pin.issuer_principal_ref)) {
      throw new ValidationError(
        'Context authority lifecycle command trust pins contain a duplicate issuer'
      );
    }
    pins.set(pin.issuer_principal_ref, pin);
  }
  return pins;
}

function unsignedCommand(command) {
  return {
    schema: command.schema,
    command_id: command.command_id,
    issuer_principal_ref: command.issuer_principal_ref,
    issued_at: command.issued_at,
    expires_at: command.expires_at,
    nonce: command.nonce,
    transition: command.transition,
    target: command.target,
    replacement: command.replacement,
    reason_code: command.reason_code,
    authority_effect: command.authority_effect,
    grants_vault_access: command.grants_vault_access,
    grants_execution_authority: command.grants_execution_authority
  };
}

function cloneCanonical(value, label) {
  try {
    return JSON.parse(canonicalJson(value));
  } catch {
    throw new ValidationError(`${label} must be canonical JSON`);
  }
}

function assertExactKeys(value, fields, label) {
  assertPlainObject(value, label);
  const allowed = new Set(fields);
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) {
      throw new ValidationError(`${label} contains unknown field ${key}`);
    }
  }
  for (const key of fields) {
    if (!Object.hasOwn(value, key)) {
      throw new ValidationError(`${label} is missing required field ${key}`);
    }
  }
}

function assertId(value, label) {
  assertString(value, label, { min: 1, max: 160 });
  if (!ID.test(value)) {
    throw new ValidationError(`${label} has an invalid identifier`);
  }
}

function assertSha256(value, label) {
  assertString(value, label, { min: 64, max: 64 });
  if (!SHA256.test(value)) {
    throw new ValidationError(`${label} must be a lowercase sha256`);
  }
}

function assertDateTime(value, label) {
  assertString(value, label, { min: 20, max: 40 });
  if (!DATE_TIME.test(value) || !Number.isFinite(Date.parse(value))) {
    throw new ValidationError(`${label} must be an RFC3339 date-time`);
  }
}

function parseDateTime(value, label) {
  assertDateTime(value, label);
  return Date.parse(value);
}

function assertSafeNow(now) {
  if (!Number.isSafeInteger(now) || now < 0) {
    throw new ValidationError(
      'Context authority lifecycle command verification time is invalid'
    );
  }
}

function assertLifetimeLimit(value) {
  if (!Number.isSafeInteger(value) || value < 1 || value > 86400) {
    throw new ValidationError(
      'Context authority lifecycle command lifetime limit must be 1-86400 seconds'
    );
  }
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) {
    return value;
  }
  Object.freeze(value);
  for (const item of Object.values(value)) deepFreeze(item);
  return value;
}
