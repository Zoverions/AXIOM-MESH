import { createPublicKey } from 'node:crypto';

import {
  ValidationError, assertPlainObject, assertString, canonicalJson, digestObject, sha256
} from './canonical.mjs';
import { MeshIdentity, verifyObjectSignature } from './identity.mjs';
import {
  aiProviderInvokeDigest, buildAiProviderReceipt, validateAiProviderInvoke
} from './ai-provider-invoke.mjs';

export const AI_PROVIDER_DRAFT_ATTESTATION_SCHEMA = 'axiom-ai-provider-draft-attestation.v0';
const MAX_LIFETIME_MS = 5 * 60 * 1000;
const ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/;
const ATTESTOR_ID = /^[a-z][a-z0-9-]{0,63}$/;
const DIGEST = /^[a-f0-9]{64}$/;
const STATEMENT_KEYS = new Set([
  'invoke_digest', 'receipt_digest', 'provider_id', 'model', 'principal_id',
  'attestor_id', 'attestor_key_id', 'audience_id', 'nonce_digest',
  'issued_at', 'expires_at', 'signer_role', 'authority_effect',
  'truth_claimed', 'live_provider_claimed', 'budget_enforcement_claimed'
]);
const ENVELOPE_KEYS = new Set(['schema', 'statement', 'attestation', 'proof_digest']);
const SIGNATURE_KEYS = new Set(['algorithm', 'key_id', 'digest', 'signature']);

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
  return assertString(value, label, { min: 1, max: 160, pattern: ID });
}

function attestorId(value) {
  return assertString(value, 'attestor ID', { min: 1, max: 64, pattern: ATTESTOR_ID });
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

function nonceDigest(value) {
  const nonce = assertString(value, 'verifier nonce', { min: 16, max: 256 });
  return sha256(`${AI_PROVIDER_DRAFT_ATTESTATION_SCHEMA}:nonce:${nonce}`);
}

function normalizedInvoke(value) {
  const encoded = canonicalJson(value);
  if (Buffer.byteLength(encoded, 'utf8') > 256 * 1024) {
    throw new ValidationError('draft invoke exceeds the byte limit');
  }
  return validateAiProviderInvoke(JSON.parse(encoded));
}

function normalizedReceipt(value, invoke) {
  const encoded = canonicalJson(value);
  if (Buffer.byteLength(encoded, 'utf8') > 256 * 1024) {
    throw new ValidationError('draft receipt exceeds the byte limit');
  }
  const supplied = JSON.parse(encoded);
  const rebuilt = buildAiProviderReceipt({
    invoke,
    suggestion: supplied.suggestion,
    terminal_status: supplied.terminal_status
  });
  if (canonicalJson(supplied) !== canonicalJson(rebuilt)) {
    throw new ValidationError('draft receipt does not match the exact invoke or recomputed receipt');
  }
  return rebuilt;
}

function normalizeStatement(raw) {
  const value = exactKeys(raw, STATEMENT_KEYS, 'draft attestation statement');
  const issued = timestamp(value.issued_at, 'draft attestation issued_at');
  const expiry = timestamp(value.expires_at, 'draft attestation expires_at');
  const lifetime = timeMs(expiry) - timeMs(issued);
  if (lifetime <= 0 || lifetime > MAX_LIFETIME_MS) {
    throw new ValidationError('draft attestation lifetime must be at most five minutes');
  }
  if (
    value.signer_role !== 'synthetic-draft-receipt-attestor'
    || value.authority_effect !== 'none'
    || value.truth_claimed !== false
    || value.live_provider_claimed !== false
    || value.budget_enforcement_claimed !== false
  ) {
    throw new ValidationError('draft attestation widens its signer or authority claim');
  }
  return Object.freeze({
    invoke_digest: digest(value.invoke_digest, 'invoke_digest'),
    receipt_digest: digest(value.receipt_digest, 'receipt_digest'),
    provider_id: identifier(value.provider_id, 'provider_id'),
    model: identifier(value.model, 'model'),
    principal_id: identifier(value.principal_id, 'principal_id'),
    attestor_id: attestorId(value.attestor_id),
    attestor_key_id: assertString(value.attestor_key_id, 'attestor_key_id', {
      min: 18, max: 81, pattern: /^[a-z][a-z0-9-]{0,63}:[a-f0-9]{16}$/
    }),
    audience_id: identifier(value.audience_id, 'audience_id'),
    nonce_digest: digest(value.nonce_digest, 'nonce_digest'),
    issued_at: issued,
    expires_at: expiry,
    signer_role: 'synthetic-draft-receipt-attestor',
    authority_effect: 'none',
    truth_claimed: false,
    live_provider_claimed: false,
    budget_enforcement_claimed: false
  });
}

function trustedKey(value) {
  let key;
  try {
    key = value && typeof value === 'object' && value.type === 'public'
      ? value : createPublicKey(value);
  } catch {
    throw new ValidationError('trusted attestor public key is invalid');
  }
  if (key.asymmetricKeyType !== 'ed25519') {
    throw new ValidationError('trusted attestor public key must be Ed25519');
  }
  return key;
}

function expectedKeyId(id, key) {
  return `${id}:${sha256(key.export({ type: 'spki', format: 'pem' })).slice(0, 16)}`;
}

function normalizedAttestation(raw) {
  const value = exactKeys(raw, SIGNATURE_KEYS, 'draft attestation signature');
  if (value.algorithm !== 'Ed25519') {
    throw new ValidationError('draft attestation signature algorithm must be Ed25519');
  }
  const signature = assertString(value.signature, 'draft attestation signature', {
    min: 86, max: 86, pattern: /^[A-Za-z0-9_-]{86}$/
  });
  const bytes = Buffer.from(signature, 'base64url');
  if (bytes.length !== 64 || bytes.toString('base64url') !== signature) {
    throw new ValidationError('draft attestation signature encoding is invalid');
  }
  return Object.freeze({
    algorithm: 'Ed25519',
    key_id: assertString(value.key_id, 'attestation key_id', { min: 18, max: 81 }),
    digest: digest(value.digest, 'attestation digest'),
    signature
  });
}

export function createAiProviderDraftAttestation({
  invoke, receipt, attestorIdentity, audienceId, nonce, issuedAt, expiresAt
} = {}) {
  const request = normalizedInvoke(invoke);
  const normalizedDraft = normalizedReceipt(receipt, request);
  if (!(attestorIdentity instanceof MeshIdentity)) {
    throw new ValidationError('synthetic draft attestor must be a MeshIdentity signer');
  }
  const id = attestorId(attestorIdentity.service);
  if (attestorIdentity.keyId !== expectedKeyId(id, attestorIdentity.publicKey)) {
    throw new ValidationError('synthetic draft attestor key ID does not match public key');
  }
  const statement = normalizeStatement({
    invoke_digest: aiProviderInvokeDigest(request),
    receipt_digest: normalizedDraft.terminal_outcome_digest,
    provider_id: request.provider_id,
    model: request.model,
    principal_id: request.principal_id,
    attestor_id: id,
    attestor_key_id: attestorIdentity.keyId,
    audience_id: audienceId,
    nonce_digest: nonceDigest(nonce),
    issued_at: issuedAt,
    expires_at: expiresAt,
    signer_role: 'synthetic-draft-receipt-attestor',
    authority_effect: 'none',
    truth_claimed: false,
    live_provider_claimed: false,
    budget_enforcement_claimed: false
  });
  const attestation = normalizedAttestation(attestorIdentity.signObject(statement));
  if (!verifyObjectSignature(statement, attestation, attestorIdentity.publicKey)) {
    throw new ValidationError('synthetic draft attestor private key does not match public key');
  }
  const signed = { schema: AI_PROVIDER_DRAFT_ATTESTATION_SCHEMA, statement, attestation };
  return Object.freeze({ ...signed, proof_digest: digestObject(signed) });
}

export function verifyAiProviderDraftAttestation(raw, {
  invoke, receipt, trustedAttestorPublicKey, expectedAttestorId,
  expectedAudienceId, expectedNonce, at, consumedNonceDigests = []
} = {}) {
  const request = normalizedInvoke(invoke);
  const normalizedDraft = normalizedReceipt(receipt, request);
  const value = exactKeys(raw, ENVELOPE_KEYS, 'draft attestation');
  if (value.schema !== AI_PROVIDER_DRAFT_ATTESTATION_SCHEMA) {
    throw new ValidationError('draft attestation schema is unsupported');
  }
  const statement = normalizeStatement(value.statement);
  const attestation = normalizedAttestation(value.attestation);
  const pinnedId = attestorId(expectedAttestorId);
  const key = trustedKey(trustedAttestorPublicKey);
  const keyId = expectedKeyId(pinnedId, key);
  if (
    statement.attestor_id !== pinnedId
    || statement.attestor_key_id !== keyId
    || attestation.key_id !== keyId
  ) {
    throw new ValidationError('draft attestation attestor key binding mismatch');
  }
  if (
    statement.invoke_digest !== aiProviderInvokeDigest(request)
    || statement.receipt_digest !== normalizedDraft.terminal_outcome_digest
    || statement.provider_id !== request.provider_id
    || statement.model !== request.model
    || statement.principal_id !== request.principal_id
  ) {
    throw new ValidationError('draft attestation invoke or receipt binding mismatch');
  }
  if (statement.audience_id !== identifier(expectedAudienceId, 'expected audience ID')) {
    throw new ValidationError('draft attestation audience mismatch');
  }
  if (statement.nonce_digest !== nonceDigest(expectedNonce)) {
    throw new ValidationError('draft attestation nonce mismatch');
  }
  const when = timestamp(at, 'draft attestation evaluation time');
  if (timeMs(when) < timeMs(statement.issued_at)) {
    throw new ValidationError('draft attestation is from the future');
  }
  if (timeMs(when) >= timeMs(statement.expires_at)) {
    throw new ValidationError('draft attestation is expired');
  }
  if (!verifyObjectSignature(statement, attestation, key)) {
    throw new ValidationError('draft attestation signature is invalid');
  }
  const proofDigest = digest(value.proof_digest, 'proof_digest');
  if (proofDigest !== digestObject({
    schema: AI_PROVIDER_DRAFT_ATTESTATION_SCHEMA, statement, attestation
  })) {
    throw new ValidationError('draft attestation proof digest mismatch');
  }
  if (!Array.isArray(consumedNonceDigests) || consumedNonceDigests.length > 1024) {
    throw new ValidationError('consumed nonce digests must be an array of at most 1024 items');
  }
  if (consumedNonceDigests.map(item => digest(item, 'consumed nonce digest')).includes(statement.nonce_digest)) {
    throw new ValidationError('draft attestation nonce was already consumed; possible replay');
  }
  return Object.freeze({
    schema: AI_PROVIDER_DRAFT_ATTESTATION_SCHEMA,
    valid: true,
    proof_digest: proofDigest,
    invoke_digest: statement.invoke_digest,
    receipt_digest: statement.receipt_digest,
    provider_id: statement.provider_id,
    model: statement.model,
    principal_id: statement.principal_id,
    attestor_id: pinnedId,
    attestor_key_id: keyId,
    audience_id: statement.audience_id,
    nonce_digest: statement.nonce_digest,
    evaluated_at: when,
    signer_role: 'synthetic-draft-receipt-attestor',
    authority_effect: 'none',
    truth_claimed: false,
    live_provider_claimed: false,
    budget_enforcement_claimed: false
  });
}
