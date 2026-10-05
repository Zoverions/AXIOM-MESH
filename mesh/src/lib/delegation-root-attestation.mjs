import {
  createPrivateKey,
  createPublicKey,
  sign as signBytes,
  verify as verifyBytes
} from 'node:crypto';

import {
  ValidationError,
  assertPlainObject,
  assertString,
  canonicalJson,
  digestObject,
  sha256
} from './canonical.mjs';
import { DELEGATION_ROOT_BINDING_SCHEMA } from './delegation-ledger.mjs';

export const DELEGATION_ROOT_ATTESTATION_SCHEMA = 'axiom-delegation-root-attestation.v1';

const DIGEST_PATTERN = /^[a-f0-9]{64}$/;
const BASE64URL_PATTERN = /^[A-Za-z0-9_-]+$/;
const ATTESTATION_SCOPE = 'delegation-root-binding';
const ROOT_BINDING_KEYS = Object.freeze([
  'schema',
  'root_holder',
  'root_authority_digest',
  'execution_authority_granted',
  'authority_effect',
  'binding_digest'
]);
const STATEMENT_KEYS = Object.freeze([
  'root_binding_digest',
  'root_authority_digest',
  'root_holder',
  'signer_id',
  'signer_key_id',
  'issued_at',
  'attestation_scope',
  'authority_effect',
  'delegation_effect',
  'execution_authority_granted',
  'global_currentness_claimed'
]);
const ATTESTATION_KEYS = Object.freeze([
  'schema',
  'statement',
  'statement_digest',
  'signer_signature',
  'attestation_digest'
]);

export function delegationRootAttestationKeyId(publicKey) {
  return sha256(canonicalPublicKeyPem(publicKey));
}

export function createDelegationRootAttestation({
  root_binding,
  signer_id,
  signer_private_key,
  issued_at
} = {}) {
  const binding = normalizeRootBinding(root_binding);
  const signerId = assertIdentifier(signer_id, 'delegation root attestation signer_id');
  if (signerId !== binding.root_holder) {
    throw new ValidationError(
      'Delegation root attestation signer must equal the bound root holder'
    );
  }
  const issuedAt = canonicalTimestamp(issued_at, 'delegation root attestation issued_at');
  const privateKey = parsePrivateKey(
    signer_private_key,
    'delegation root attestation signer_private_key'
  );
  const publicKey = createPublicKey(privateKey);
  const signerKeyId = delegationRootAttestationKeyId(publicKey);

  const statement = {
    root_binding_digest: binding.binding_digest,
    root_authority_digest: binding.root_authority_digest,
    root_holder: binding.root_holder,
    signer_id: signerId,
    signer_key_id: signerKeyId,
    issued_at: issuedAt,
    attestation_scope: ATTESTATION_SCOPE,
    authority_effect: 'none',
    delegation_effect: 'none',
    execution_authority_granted: false,
    global_currentness_claimed: false
  };
  const statementDigest = digestObject(statement);
  const signedPayload = {
    schema: DELEGATION_ROOT_ATTESTATION_SCHEMA,
    statement,
    statement_digest: statementDigest
  };
  const signerSignature = signBytes(
    null,
    Buffer.from(canonicalJson(signedPayload), 'utf8'),
    privateKey
  ).toString('base64url');
  const core = {
    ...signedPayload,
    signer_signature: signerSignature
  };
  return {
    ...core,
    attestation_digest: digestObject(core)
  };
}

export function verifyDelegationRootAttestation(attestation, {
  trusted_signer_public_key,
  expected_root_binding_digest,
  expected_root_authority_digest,
  expected_signer_id
} = {}) {
  const normalized = normalizeAttestation(attestation);
  const trustedPublicKey = parsePublicKey(
    trusted_signer_public_key,
    'delegation root attestation trusted_signer_public_key'
  );
  const trustedKeyId = delegationRootAttestationKeyId(trustedPublicKey);
  if (trustedKeyId !== normalized.statement.signer_key_id) {
    throw new ValidationError('Delegation root attestation signer key substitution detected');
  }

  const signedPayload = {
    schema: normalized.schema,
    statement: normalized.statement,
    statement_digest: normalized.statement_digest
  };
  const signature = decodeCanonicalSignature(normalized.signer_signature);
  if (!verifyBytes(
    null,
    Buffer.from(canonicalJson(signedPayload), 'utf8'),
    trustedPublicKey,
    signature
  )) {
    throw new ValidationError('Delegation root attestation signature is invalid');
  }

  if (expected_root_binding_digest !== undefined) {
    const expected = assertDigest(
      expected_root_binding_digest,
      'delegation root attestation expected_root_binding_digest'
    );
    if (normalized.statement.root_binding_digest !== expected) {
      throw new ValidationError('Delegation root attestation root binding digest mismatch');
    }
  }
  if (expected_root_authority_digest !== undefined) {
    const expected = assertDigest(
      expected_root_authority_digest,
      'delegation root attestation expected_root_authority_digest'
    );
    if (normalized.statement.root_authority_digest !== expected) {
      throw new ValidationError('Delegation root attestation root authority digest mismatch');
    }
  }
  if (expected_signer_id !== undefined) {
    const expected = assertIdentifier(
      expected_signer_id,
      'delegation root attestation expected_signer_id'
    );
    if (normalized.statement.signer_id !== expected) {
      throw new ValidationError('Delegation root attestation signer identity mismatch');
    }
  }

  const core = {
    schema: normalized.schema,
    statement: normalized.statement,
    statement_digest: normalized.statement_digest,
    signer_signature: normalized.signer_signature
  };
  const expectedAttestationDigest = digestObject(core);
  if (normalized.attestation_digest !== expectedAttestationDigest) {
    throw new ValidationError('Delegation root attestation digest mismatch');
  }
  return normalized;
}

function normalizeAttestation(raw) {
  assertPlainObject(raw, 'delegation root attestation');
  assertExactKeys(raw, 'delegation root attestation', ATTESTATION_KEYS);
  if (raw.schema !== DELEGATION_ROOT_ATTESTATION_SCHEMA) {
    throw new ValidationError('Delegation root attestation schema is invalid');
  }
  const statement = normalizeStatement(raw.statement);
  const statementDigest = assertDigest(
    raw.statement_digest,
    'delegation root attestation statement_digest'
  );
  const expectedStatementDigest = digestObject(statement);
  if (statementDigest !== expectedStatementDigest) {
    throw new ValidationError('Delegation root attestation statement digest mismatch');
  }
  const signerSignature = assertString(
    raw.signer_signature,
    'delegation root attestation signer_signature',
    { max: 512, pattern: BASE64URL_PATTERN }
  );
  decodeCanonicalSignature(signerSignature);
  const attestationDigest = assertDigest(
    raw.attestation_digest,
    'delegation root attestation attestation_digest'
  );
  return {
    schema: DELEGATION_ROOT_ATTESTATION_SCHEMA,
    statement,
    statement_digest: statementDigest,
    signer_signature: signerSignature,
    attestation_digest: attestationDigest
  };
}

function normalizeStatement(raw) {
  assertPlainObject(raw, 'delegation root attestation statement');
  assertExactKeys(raw, 'delegation root attestation statement', STATEMENT_KEYS);
  const rootBindingDigest = assertDigest(
    raw.root_binding_digest,
    'delegation root attestation root_binding_digest'
  );
  const rootAuthorityDigest = assertDigest(
    raw.root_authority_digest,
    'delegation root attestation root_authority_digest'
  );
  const rootHolder = assertIdentifier(
    raw.root_holder,
    'delegation root attestation root_holder'
  );
  const signerId = assertIdentifier(
    raw.signer_id,
    'delegation root attestation signer_id'
  );
  if (signerId !== rootHolder) {
    throw new ValidationError(
      'Delegation root attestation signer must equal the bound root holder'
    );
  }
  const signerKeyId = assertDigest(
    raw.signer_key_id,
    'delegation root attestation signer_key_id'
  );
  const issuedAt = canonicalTimestamp(
    raw.issued_at,
    'delegation root attestation issued_at'
  );
  if (raw.attestation_scope !== ATTESTATION_SCOPE) {
    throw new ValidationError('Delegation root attestation scope is invalid');
  }
  if (
    raw.authority_effect !== 'none'
    || raw.delegation_effect !== 'none'
    || raw.execution_authority_granted !== false
    || raw.global_currentness_claimed !== false
  ) {
    throw new ValidationError(
      'Delegation root attestation widens its evidence-only non-authority boundary'
    );
  }
  return {
    root_binding_digest: rootBindingDigest,
    root_authority_digest: rootAuthorityDigest,
    root_holder: rootHolder,
    signer_id: signerId,
    signer_key_id: signerKeyId,
    issued_at: issuedAt,
    attestation_scope: ATTESTATION_SCOPE,
    authority_effect: 'none',
    delegation_effect: 'none',
    execution_authority_granted: false,
    global_currentness_claimed: false
  };
}

function normalizeRootBinding(raw) {
  assertPlainObject(raw, 'delegation root binding');
  assertExactKeys(raw, 'delegation root binding', ROOT_BINDING_KEYS);
  if (raw.schema !== DELEGATION_ROOT_BINDING_SCHEMA) {
    throw new ValidationError('Delegation root binding schema is invalid');
  }
  const rootHolder = assertIdentifier(raw.root_holder, 'delegation root binding root_holder');
  const rootAuthorityDigest = assertDigest(
    raw.root_authority_digest,
    'delegation root binding root_authority_digest'
  );
  if (raw.execution_authority_granted !== false || raw.authority_effect !== 'none') {
    throw new ValidationError('Delegation root binding widens its non-authority boundary');
  }
  const bindingDigest = assertDigest(
    raw.binding_digest,
    'delegation root binding binding_digest'
  );
  const core = {
    schema: DELEGATION_ROOT_BINDING_SCHEMA,
    root_holder: rootHolder,
    root_authority_digest: rootAuthorityDigest,
    execution_authority_granted: false,
    authority_effect: 'none'
  };
  const expectedBindingDigest = digestObject(core);
  if (bindingDigest !== expectedBindingDigest) {
    throw new ValidationError('Delegation root binding digest mismatch');
  }
  return {
    ...core,
    binding_digest: bindingDigest
  };
}

function parsePrivateKey(value, name) {
  try {
    const key = value?.type === 'private' ? value : createPrivateKey(value);
    if (key.type !== 'private' || key.asymmetricKeyType !== 'ed25519') {
      throw new ValidationError(`${name} must be an Ed25519 private key`);
    }
    return key;
  } catch (error) {
    if (error instanceof ValidationError) throw error;
    throw new ValidationError(`${name} is invalid`);
  }
}

function parsePublicKey(value, name) {
  try {
    const key = value?.type === 'public' ? value : createPublicKey(value);
    if (key.type !== 'public' || key.asymmetricKeyType !== 'ed25519') {
      throw new ValidationError(`${name} must be an Ed25519 public key`);
    }
    return key;
  } catch (error) {
    if (error instanceof ValidationError) throw error;
    throw new ValidationError(`${name} is invalid`);
  }
}

function canonicalPublicKeyPem(value) {
  const key = parsePublicKey(value, 'delegation root attestation public key');
  return key.export({ type: 'spki', format: 'pem' }).toString().trim();
}

function decodeCanonicalSignature(value) {
  if (typeof value !== 'string' || !BASE64URL_PATTERN.test(value)) {
    throw new ValidationError('Delegation root attestation signature is invalid');
  }
  let decoded;
  try {
    decoded = Buffer.from(value, 'base64url');
  } catch {
    throw new ValidationError('Delegation root attestation signature is invalid');
  }
  if (decoded.length !== 64 || decoded.toString('base64url') !== value) {
    throw new ValidationError('Delegation root attestation signature is invalid');
  }
  return decoded;
}

function assertIdentifier(value, name) {
  return assertString(value, name, { max: 160 });
}

function assertDigest(value, name) {
  return assertString(value, name, { min: 64, max: 64, pattern: DIGEST_PATTERN });
}

function canonicalTimestamp(value, name) {
  const text = assertString(value, name, { max: 64 });
  const time = Date.parse(text);
  if (!Number.isFinite(time) || new Date(time).toISOString() !== text) {
    throw new ValidationError(`${name} must be a canonical ISO-8601 timestamp`);
  }
  return text;
}

function assertExactKeys(value, name, keys) {
  const expected = [...keys].sort();
  const actual = Object.keys(value).sort();
  if (
    expected.length !== actual.length
    || expected.some((key, index) => key !== actual[index])
  ) {
    throw new ValidationError(`${name} contains unsupported or missing fields`);
  }
}
