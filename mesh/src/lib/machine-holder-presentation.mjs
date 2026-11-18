import { createPrivateKey, createPublicKey, sign, verify } from 'node:crypto';

import {
  ValidationError, assertPlainObject, assertString, canonicalJson, digestObject, sha256
} from './canonical.mjs';
import {
  machineIdentityKeyId, verifyMachineIdentityCredential, verifyMachineIdentityRevocation
} from './agent-trust-machine-identity.mjs';

export const MACHINE_HOLDER_PRESENTATION_SCHEMA = 'axiom-machine-holder-presentation.v0';
const MAX_LIFETIME_MS = 5 * 60 * 1000;
const ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,191}$/;
const DIGEST = /^[a-f0-9]{64}$/;
const STATEMENT_KEYS = new Set([
  'credential_digest', 'principal_id', 'issuer_id', 'issuer_key_id', 'holder_key_id',
  'audience_id', 'purpose', 'nonce_digest', 'issued_at', 'expires_at',
  'proof_scope', 'authority_effect', 'delegation_effect', 'legal_identity_claimed',
  'personhood_claimed', 'global_currentness_claimed', 'revocation_currentness_claimed'
]);
const ENVELOPE_KEYS = new Set([
  'schema', 'statement', 'statement_digest', 'holder_signature', 'proof_digest'
]);

function exactKeys(raw, allowed, label) {
  const value = assertPlainObject(raw, label);
  if (Object.keys(value).length !== allowed.size) {
    throw new ValidationError(`${label} requires exactly its defined fields`);
  }
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) throw new ValidationError(`${label} contains unsupported field ${key}`);
  }
  return value;
}

function identifier(value, label) {
  return assertString(value, label, { min: 1, max: 192, pattern: ID });
}

function digest(value, label) {
  return assertString(value, label, { min: 64, max: 64, pattern: DIGEST });
}

function timestamp(value, label) {
  const text = assertString(value, label, { min: 24, max: 24 });
  const when = new Date(text);
  if (Number.isNaN(when.valueOf()) || when.toISOString() !== text) {
    throw new ValidationError(`${label} must be a canonical UTC ISO timestamp`);
  }
  return text;
}

function timeMs(value) {
  return new Date(value).valueOf();
}

function challengeDigest(value) {
  const nonce = assertString(value, 'verifier nonce', { min: 16, max: 256 });
  return sha256(`axiom-machine-holder-presentation.v0:nonce:${nonce}`);
}

function normalizeStatement(raw) {
  const value = exactKeys(raw, STATEMENT_KEYS, 'machine holder presentation statement');
  const issued = timestamp(value.issued_at, 'machine holder presentation issued_at');
  const expiry = timestamp(value.expires_at, 'machine holder presentation expires_at');
  const lifetime = timeMs(expiry) - timeMs(issued);
  if (lifetime <= 0 || lifetime > MAX_LIFETIME_MS) {
    throw new ValidationError('machine holder presentation lifetime must be at most five minutes');
  }
  if (
    value.proof_scope !== 'synthetic-holder-key-possession-only'
    || value.authority_effect !== 'none'
    || value.delegation_effect !== 'none'
    || value.legal_identity_claimed !== false
    || value.personhood_claimed !== false
    || value.global_currentness_claimed !== false
    || value.revocation_currentness_claimed !== false
  ) {
    throw new ValidationError('machine holder presentation widens its evidence or authority boundary');
  }
  return Object.freeze({
    credential_digest: digest(value.credential_digest, 'credential_digest'),
    principal_id: identifier(value.principal_id, 'principal_id'),
    issuer_id: identifier(value.issuer_id, 'issuer_id'),
    issuer_key_id: digest(value.issuer_key_id, 'issuer_key_id'),
    holder_key_id: digest(value.holder_key_id, 'holder_key_id'),
    audience_id: identifier(value.audience_id, 'audience_id'),
    purpose: identifier(value.purpose, 'purpose'),
    nonce_digest: digest(value.nonce_digest, 'nonce_digest'),
    issued_at: issued,
    expires_at: expiry,
    proof_scope: value.proof_scope,
    authority_effect: 'none',
    delegation_effect: 'none',
    legal_identity_claimed: false,
    personhood_claimed: false,
    global_currentness_claimed: false,
    revocation_currentness_claimed: false
  });
}

function pinnedCredential(credential, trustedIssuerPublicKey, expectedIssuerId, expectedPrincipalId) {
  return verifyMachineIdentityCredential(credential, {
    trustedIssuerPublicKey,
    expectedIssuerId: identifier(expectedIssuerId, 'expected issuer ID'),
    expectedPrincipalId: expectedPrincipalId === undefined
      ? undefined
      : identifier(expectedPrincipalId, 'expected principal ID')
  });
}

function assertCredentialWindow(statement, credential) {
  const from = timeMs(credential.statement.valid_from);
  const until = timeMs(credential.statement.expires_at);
  if (timeMs(statement.issued_at) < from || timeMs(statement.expires_at) > until) {
    throw new ValidationError('machine holder presentation must fit credential validity window');
  }
}

function privateHolderKey(value) {
  let key;
  try {
    key = value && typeof value === 'object' && value.type === 'private'
      ? value : createPrivateKey(value);
  } catch {
    throw new ValidationError('holder private key is invalid');
  }
  if (key.asymmetricKeyType !== 'ed25519') {
    throw new ValidationError('holder private key must be Ed25519');
  }
  return key;
}

function signedBytes(statement, statementDigest) {
  return Buffer.from(canonicalJson({
    schema: MACHINE_HOLDER_PRESENTATION_SCHEMA,
    statement,
    statement_digest: statementDigest
  }));
}

export function createMachineHolderPresentation({
  credential, trustedIssuerPublicKey, expectedIssuerId, holderPrivateKey,
  audienceId, purpose, nonce, issuedAt, expiresAt
} = {}) {
  const verifiedCredential = pinnedCredential(credential, trustedIssuerPublicKey, expectedIssuerId);
  const holder = privateHolderKey(holderPrivateKey);
  const holderKeyId = machineIdentityKeyId(createPublicKey(holder));
  if (holderKeyId !== verifiedCredential.statement.operational_key_id) {
    throw new ValidationError('holder key does not match credential operational key');
  }
  const statement = normalizeStatement({
    credential_digest: verifiedCredential.credential_digest,
    principal_id: verifiedCredential.statement.principal_id,
    issuer_id: verifiedCredential.statement.issuer_id,
    issuer_key_id: verifiedCredential.statement.issuer_key_id,
    holder_key_id: holderKeyId,
    audience_id: audienceId,
    purpose,
    nonce_digest: challengeDigest(nonce),
    issued_at: issuedAt,
    expires_at: expiresAt,
    proof_scope: 'synthetic-holder-key-possession-only',
    authority_effect: 'none',
    delegation_effect: 'none',
    legal_identity_claimed: false,
    personhood_claimed: false,
    global_currentness_claimed: false,
    revocation_currentness_claimed: false
  });
  assertCredentialWindow(statement, verifiedCredential);
  const statementDigest = digestObject(statement);
  const holderSignature = sign(null, signedBytes(statement, statementDigest), holder).toString('base64url');
  const signed = {
    schema: MACHINE_HOLDER_PRESENTATION_SCHEMA,
    statement,
    statement_digest: statementDigest,
    holder_signature: holderSignature
  };
  return Object.freeze({ ...signed, proof_digest: digestObject(signed) });
}

export function verifyMachineHolderPresentation(raw, {
  credential, trustedIssuerPublicKey, expectedIssuerId, expectedPrincipalId,
  expectedAudienceId, expectedPurpose, expectedNonce, at,
  consumedProofDigests = [], consumedNonceDigests = [], revocations = []
} = {}) {
  const verifiedCredential = pinnedCredential(
    credential, trustedIssuerPublicKey, expectedIssuerId,
    identifier(expectedPrincipalId, 'expected principal ID')
  );
  const envelope = exactKeys(raw, ENVELOPE_KEYS, 'machine holder presentation');
  if (envelope.schema !== MACHINE_HOLDER_PRESENTATION_SCHEMA) {
    throw new ValidationError('machine holder presentation schema is unsupported');
  }
  const statement = normalizeStatement(envelope.statement);
  const statementDigest = digest(envelope.statement_digest, 'statement_digest');
  if (statementDigest !== digestObject(statement)) {
    throw new ValidationError('machine holder presentation statement digest mismatch');
  }
  const bound = verifiedCredential.statement;
  if (
    statement.credential_digest !== verifiedCredential.credential_digest
    || statement.principal_id !== bound.principal_id
    || statement.issuer_id !== bound.issuer_id
    || statement.issuer_key_id !== bound.issuer_key_id
    || statement.holder_key_id !== bound.operational_key_id
  ) {
    throw new ValidationError('machine holder presentation credential binding mismatch');
  }
  if (statement.audience_id !== identifier(expectedAudienceId, 'expected audience ID')) {
    throw new ValidationError('machine holder presentation audience mismatch');
  }
  if (statement.purpose !== identifier(expectedPurpose, 'expected purpose')) {
    throw new ValidationError('machine holder presentation purpose mismatch');
  }
  if (statement.nonce_digest !== challengeDigest(expectedNonce)) {
    throw new ValidationError('machine holder presentation nonce mismatch');
  }
  assertCredentialWindow(statement, verifiedCredential);
  const when = timestamp(at, 'machine holder presentation evaluation time');
  if (timeMs(when) < timeMs(statement.issued_at) || timeMs(when) < timeMs(bound.valid_from)) {
    throw new ValidationError('machine holder presentation is from the future or credential is not yet valid');
  }
  if (timeMs(when) >= timeMs(statement.expires_at) || timeMs(when) >= timeMs(bound.expires_at)) {
    throw new ValidationError('machine holder presentation or credential is expired');
  }
  const signature = assertString(envelope.holder_signature, 'holder signature', {
    min: 86, max: 86, pattern: /^[A-Za-z0-9_-]{86}$/
  });
  const signatureBytes = Buffer.from(signature, 'base64url');
  if (signatureBytes.length !== 64 || signatureBytes.toString('base64url') !== signature) {
    throw new ValidationError('machine holder presentation signature encoding is invalid');
  }
  if (!verify(null, signedBytes(statement, statementDigest), bound.operational_public_key, signatureBytes)) {
    throw new ValidationError('machine holder presentation holder signature is invalid');
  }
  const proofDigest = digest(envelope.proof_digest, 'proof_digest');
  if (proofDigest !== digestObject({
    schema: MACHINE_HOLDER_PRESENTATION_SCHEMA, statement,
    statement_digest: statementDigest, holder_signature: signature
  })) {
    throw new ValidationError('machine holder presentation proof digest mismatch');
  }
  if (!Array.isArray(consumedProofDigests) || consumedProofDigests.length > 1024) {
    throw new ValidationError('consumed proof digests must be an array of at most 1024 items');
  }
  if (consumedProofDigests.map((item) => digest(item, 'consumed proof digest')).includes(proofDigest)) {
    throw new ValidationError('machine holder presentation proof was already consumed; possible replay');
  }
  if (!Array.isArray(consumedNonceDigests) || consumedNonceDigests.length > 1024) {
    throw new ValidationError('consumed nonce digests must be an array of at most 1024 items');
  }
  if (consumedNonceDigests.map((item) => digest(item, 'consumed nonce digest')).includes(statement.nonce_digest)) {
    throw new ValidationError('machine holder presentation nonce was already consumed; possible replay');
  }
  if (!Array.isArray(revocations) || revocations.length > 256) {
    throw new ValidationError('supplied revocations must be an array of at most 256 items');
  }
  for (const item of revocations) {
    const revocation = verifyMachineIdentityRevocation(item, {
      trustedIssuerPublicKey, expectedIssuerId, expectedPrincipalId
    });
    if (
      revocation.statement.credential_digest !== verifiedCredential.credential_digest
      || revocation.statement.operational_key_id !== bound.operational_key_id
      || revocation.statement.key_epoch !== bound.key_epoch
    ) {
      throw new ValidationError('supplied revocation credential binding mismatch');
    }
    if (timeMs(revocation.statement.effective_at) <= timeMs(when)) {
      throw new ValidationError('machine holder presentation credential is revoked');
    }
  }
  return Object.freeze({
    schema: MACHINE_HOLDER_PRESENTATION_SCHEMA,
    valid: true,
    proof_digest: proofDigest,
    credential_digest: verifiedCredential.credential_digest,
    principal_id: bound.principal_id,
    issuer_id: bound.issuer_id,
    holder_key_id: bound.operational_key_id,
    audience_id: statement.audience_id,
    purpose: statement.purpose,
    nonce_digest: statement.nonce_digest,
    evaluated_at: when,
    proof_scope: 'synthetic-holder-key-possession-only',
    evidence_scope: 'caller-supplied-issuer-evidence-only',
    authority_effect: 'none',
    delegation_effect: 'none',
    legal_identity_claimed: false,
    personhood_claimed: false,
    global_currentness_claimed: false,
    revocation_currentness_claimed: false
  });
}
