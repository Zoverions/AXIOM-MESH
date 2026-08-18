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
  digestObject
} from './canonical.mjs';
import {
  machineIdentityKeyId,
  verifyMachineIdentityCredential
} from './agent-trust-machine-identity.mjs';
import { verifyAgentAuthorityManifest } from './agent-trust-authority-manifest.mjs';

export const AGENT_SIGNED_HANDOFF_SCHEMA = 'axiom-agent-signed-handoff.v1';

const DIGEST = /^[a-f0-9]{64}$/;
const ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,191}$/;
const ACTION = /^[a-z][a-z0-9._:-]{1,127}$/;
const BASE64URL = /^[A-Za-z0-9_-]+$/;
const MAX_HANDOFF_LIFETIME_MS = 5 * 60 * 1000;

const TOP_KEYS = new Set([
  'schema', 'statement', 'statement_digest', 'sender_signature', 'handoff_digest'
]);
const STATEMENT_KEYS = new Set([
  'handoff_id', 'parent_task_id', 'sender_principal_id', 'recipient_principal_id',
  'intended_executor_id', 'sender_credential_digest', 'sender_operational_key_id',
  'authority_manifest_digest', 'delegation_chain_head_digest', 'action', 'purpose',
  'destination', 'input_digest', 'context_digests', 'evidence_obligations',
  'expected_output_classes', 'resource_ceiling', 'not_before', 'expires_at',
  'nonce', 'idempotency_key', 'remaining_delegation_depth',
  'handoff_kind', 'handoff_is_authorization', 'execution_authorized',
  'delegation_authorization_claimed', 'recipient_must_revalidate',
  'global_currentness_claimed', 'protocol_switch_can_expand_authority',
  'authority_effect'
]);
const RESOURCE_KEYS = new Set([
  'max_requests_per_minute', 'max_concurrent_requests', 'max_execution_ms',
  'max_request_bytes', 'max_response_bytes'
]);

const SEMANTICS = Object.freeze({
  handoff_kind: 'signed-task-handoff-proposal',
  handoff_is_authorization: false,
  execution_authorized: false,
  delegation_authorization_claimed: false,
  recipient_must_revalidate: true,
  global_currentness_claimed: false,
  protocol_switch_can_expand_authority: false,
  authority_effect: 'none'
});

function exactObject(raw, allowed, label) {
  const value = assertPlainObject(raw, label);
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) throw new ValidationError(`${label} contains unsupported field ${key}`);
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

function canonicalStringSet(raw, label, { maxItems = 128, maxLength = 192 } = {}) {
  if (!Array.isArray(raw) || raw.length > maxItems) {
    throw new ValidationError(`${label} must contain at most ${maxItems} strings`);
  }
  const values = raw.map((item, index) => assertString(item, `${label}[${index}]`, {
    min: 1,
    max: maxLength
  }));
  const canonical = [...new Set(values)].sort();
  if (canonicalJson(values) !== canonicalJson(canonical)) {
    throw new ValidationError(`${label} must be sorted and unique`);
  }
  return Object.freeze(canonical);
}

function canonicalDigestSet(raw, label) {
  if (!Array.isArray(raw) || raw.length > 128) {
    throw new ValidationError(`${label} must contain at most 128 digests`);
  }
  const values = raw.map((item, index) => digest(item, `${label}[${index}]`));
  const canonical = [...new Set(values)].sort();
  if (canonicalJson(values) !== canonicalJson(canonical)) {
    throw new ValidationError(`${label} must be sorted and unique`);
  }
  return Object.freeze(canonical);
}

function positiveInteger(value, label, max = Number.MAX_SAFE_INTEGER) {
  if (!Number.isSafeInteger(value) || value < 1 || value > max) {
    throw new ValidationError(`${label} must be a positive safe integer`);
  }
  return value;
}

function normalizeResources(raw, authorityBudgets) {
  const value = exactObject(raw, RESOURCE_KEYS, 'agent handoff resource_ceiling');
  const result = {};
  for (const key of RESOURCE_KEYS) {
    const normalized = positiveInteger(value[key], `agent handoff resource_ceiling.${key}`);
    if (normalized > authorityBudgets[key]) {
      throw new ValidationError(`agent handoff resource ceiling ${key} exceeds authority manifest`);
    }
    result[key] = normalized;
  }
  return Object.freeze(result);
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

function assertSuppliedSemantics(value) {
  for (const [key, expected] of Object.entries(SEMANTICS)) {
    if (value[key] !== expected) {
      throw new ValidationError(`agent signed handoff ${key} must remain ${String(expected)}`);
    }
  }
  if (value.remaining_delegation_depth !== 0) {
    throw new ValidationError('agent signed handoff v1 remaining_delegation_depth must remain zero');
  }
  if (value.delegation_chain_head_digest !== null) {
    throw new ValidationError('agent signed handoff v1 cannot claim an authority-bearing delegation chain');
  }
}

function validateAgainstManifest(statement, manifest, credential) {
  if (statement.sender_principal_id !== manifest.principal.id) {
    throw new ValidationError('agent signed handoff sender does not match authority manifest principal');
  }
  if (statement.sender_principal_id !== credential.statement.principal_id) {
    throw new ValidationError('agent signed handoff sender does not match identity credential');
  }
  if (statement.sender_credential_digest !== credential.credential_digest) {
    throw new ValidationError('agent signed handoff credential digest mismatch');
  }
  if (statement.sender_operational_key_id !== credential.statement.operational_key_id) {
    throw new ValidationError('agent signed handoff operational key mismatch');
  }
  if (statement.authority_manifest_digest !== manifest.manifest_digest) {
    throw new ValidationError('agent signed handoff authority manifest digest mismatch');
  }
  const action = manifest.authority.requestable_actions.find(item => item.id === statement.action);
  if (!action) throw new ValidationError('agent signed handoff action is not requestable in bound manifest');
  if (!manifest.authority.purposes.includes(statement.purpose)) {
    throw new ValidationError('agent signed handoff purpose exceeds bound manifest');
  }
  if (!manifest.authority.destinations.includes(statement.destination)) {
    throw new ValidationError('agent signed handoff destination exceeds bound manifest');
  }
  if (statement.destination !== action.effect_destination) {
    throw new ValidationError('agent signed handoff destination does not match action effect destination');
  }
  if (statement.resource_ceiling.max_execution_ms > action.timeout_ms) {
    throw new ValidationError('agent signed handoff execution ceiling exceeds action timeout');
  }
  if (statement.not_before < manifest.validity.created_at) {
    throw new ValidationError('agent signed handoff starts before authority manifest');
  }
  if (statement.expires_at > manifest.validity.expires_at) {
    throw new ValidationError('agent signed handoff outlives authority manifest');
  }
  if (statement.not_before < credential.statement.valid_from) {
    throw new ValidationError('agent signed handoff starts before identity credential validity');
  }
  if (statement.expires_at > credential.statement.expires_at) {
    throw new ValidationError('agent signed handoff outlives identity credential');
  }
}

function normalizeStatement(raw, { manifest, credential } = {}) {
  const value = exactObject(raw, STATEMENT_KEYS, 'agent signed handoff statement');
  assertSuppliedSemantics(value);
  const notBefore = canonicalTimestamp(value.not_before, 'agent signed handoff not_before');
  const expiresAt = canonicalTimestamp(value.expires_at, 'agent signed handoff expires_at');
  const notBeforeMs = new Date(notBefore).valueOf();
  const expiresMs = new Date(expiresAt).valueOf();
  if (expiresMs <= notBeforeMs) throw new ValidationError('agent signed handoff expiry must follow not_before');
  if (expiresMs - notBeforeMs > MAX_HANDOFF_LIFETIME_MS) {
    throw new ValidationError('agent signed handoff lifetime exceeds five minute laboratory ceiling');
  }
  const action = assertString(value.action, 'agent signed handoff action', {
    min: 2, max: 128, pattern: ACTION
  });
  const statement = Object.freeze({
    handoff_id: identifier(value.handoff_id, 'agent signed handoff handoff_id'),
    parent_task_id: nullableIdentifier(value.parent_task_id, 'agent signed handoff parent_task_id'),
    sender_principal_id: identifier(value.sender_principal_id, 'agent signed handoff sender_principal_id'),
    recipient_principal_id: identifier(value.recipient_principal_id, 'agent signed handoff recipient_principal_id'),
    intended_executor_id: identifier(value.intended_executor_id, 'agent signed handoff intended_executor_id'),
    sender_credential_digest: digest(value.sender_credential_digest, 'agent signed handoff sender_credential_digest'),
    sender_operational_key_id: digest(value.sender_operational_key_id, 'agent signed handoff sender_operational_key_id'),
    authority_manifest_digest: digest(value.authority_manifest_digest, 'agent signed handoff authority_manifest_digest'),
    delegation_chain_head_digest: nullableDigest(
      value.delegation_chain_head_digest,
      'agent signed handoff delegation_chain_head_digest'
    ),
    action,
    purpose: identifier(value.purpose, 'agent signed handoff purpose'),
    destination: assertString(value.destination, 'agent signed handoff destination', { min: 1, max: 256 }),
    input_digest: digest(value.input_digest, 'agent signed handoff input_digest'),
    context_digests: canonicalDigestSet(value.context_digests, 'agent signed handoff context_digests'),
    evidence_obligations: canonicalStringSet(
      value.evidence_obligations,
      'agent signed handoff evidence_obligations',
      { maxItems: 64, maxLength: 160 }
    ),
    expected_output_classes: canonicalStringSet(
      value.expected_output_classes,
      'agent signed handoff expected_output_classes',
      { maxItems: 64, maxLength: 160 }
    ),
    resource_ceiling: normalizeResources(value.resource_ceiling, manifest.authority.budgets),
    not_before: notBefore,
    expires_at: expiresAt,
    nonce: identifier(value.nonce, 'agent signed handoff nonce'),
    idempotency_key: identifier(value.idempotency_key, 'agent signed handoff idempotency_key'),
    remaining_delegation_depth: 0,
    ...SEMANTICS
  });
  validateAgainstManifest(statement, manifest, credential);
  return statement;
}

export function createAgentSignedHandoff({
  handoffId,
  parentTaskId = null,
  recipientPrincipalId,
  intendedExecutorId,
  identityCredential,
  trustedIssuerPublicKey,
  authorityManifest,
  authorityEvidence,
  operationalPrivateKey,
  action,
  purpose,
  destination,
  inputDigest,
  contextDigests = [],
  evidenceObligations = [],
  expectedOutputClasses = [],
  resourceCeiling,
  notBefore,
  expiresAt,
  nonce,
  idempotencyKey
} = {}) {
  const manifest = verifyAgentAuthorityManifest(authorityManifest, authorityEvidence);
  const credential = verifyMachineIdentityCredential(identityCredential, {
    trustedIssuerPublicKey,
    expectedPrincipalId: manifest.principal.id,
    expectedPrincipalDefinitionDigest: manifest.principal.principal_definition_digest
  });
  if (credential.credential_digest !== manifest.identity.credential_digest) {
    throw new ValidationError('agent signed handoff identity credential does not match authority manifest');
  }
  const privateKey = parsePrivateKey(operationalPrivateKey, 'agent signed handoff operational private key');
  const signerPublicKey = createPublicKey(privateKey);
  if (machineIdentityKeyId(signerPublicKey) !== credential.statement.operational_key_id) {
    throw new ValidationError('agent signed handoff operational private key does not match identity credential');
  }

  const statement = normalizeStatement({
    handoff_id: handoffId,
    parent_task_id: parentTaskId,
    sender_principal_id: manifest.principal.id,
    recipient_principal_id: recipientPrincipalId,
    intended_executor_id: intendedExecutorId,
    sender_credential_digest: credential.credential_digest,
    sender_operational_key_id: credential.statement.operational_key_id,
    authority_manifest_digest: manifest.manifest_digest,
    delegation_chain_head_digest: null,
    action,
    purpose,
    destination,
    input_digest: inputDigest,
    context_digests: [...new Set(contextDigests)].sort(),
    evidence_obligations: [...new Set(evidenceObligations)].sort(),
    expected_output_classes: [...new Set(expectedOutputClasses)].sort(),
    resource_ceiling: resourceCeiling,
    not_before: notBefore,
    expires_at: expiresAt,
    nonce,
    idempotency_key: idempotencyKey,
    remaining_delegation_depth: 0,
    ...SEMANTICS
  }, { manifest, credential });

  const statementDigest = digestObject(statement);
  const signable = Object.freeze({
    schema: AGENT_SIGNED_HANDOFF_SCHEMA,
    statement,
    statement_digest: statementDigest
  });
  const signature = sign(null, Buffer.from(canonicalJson(signable)), privateKey).toString('base64url');
  const signed = Object.freeze({
    schema: AGENT_SIGNED_HANDOFF_SCHEMA,
    statement,
    statement_digest: statementDigest,
    sender_signature: signature
  });
  return Object.freeze({ ...signed, handoff_digest: digestObject(signed) });
}

export function verifyAgentSignedHandoff(raw, {
  identityCredential,
  trustedIssuerPublicKey,
  authorityManifest,
  authorityEvidence,
  expectedRecipientPrincipalId,
  expectedExecutorId,
  expectedInputDigest,
  expectedParentTaskId
} = {}) {
  const value = exactObject(raw, TOP_KEYS, 'agent signed handoff');
  if (value.schema !== AGENT_SIGNED_HANDOFF_SCHEMA) {
    throw new ValidationError(`agent signed handoff schema must be ${AGENT_SIGNED_HANDOFF_SCHEMA}`);
  }
  const manifest = verifyAgentAuthorityManifest(authorityManifest, authorityEvidence);
  const credential = verifyMachineIdentityCredential(identityCredential, {
    trustedIssuerPublicKey,
    expectedPrincipalId: manifest.principal.id,
    expectedPrincipalDefinitionDigest: manifest.principal.principal_definition_digest
  });
  if (credential.credential_digest !== manifest.identity.credential_digest) {
    throw new ValidationError('agent signed handoff identity credential does not match authority manifest');
  }
  const statement = normalizeStatement(value.statement, { manifest, credential });
  const statementDigest = digest(value.statement_digest, 'agent signed handoff statement_digest');
  if (statementDigest !== digestObject(statement)) {
    throw new ValidationError('agent signed handoff statement digest mismatch');
  }
  const signature = assertString(value.sender_signature, 'agent signed handoff sender_signature', {
    min: 32, max: 1024, pattern: BASE64URL
  });
  const operationalPublicKey = parsePublicKey(
    credential.statement.operational_public_key,
    'agent signed handoff operational public key'
  );
  let valid = false;
  try {
    valid = verify(
      null,
      Buffer.from(canonicalJson({
        schema: AGENT_SIGNED_HANDOFF_SCHEMA,
        statement,
        statement_digest: statementDigest
      })),
      operationalPublicKey,
      Buffer.from(signature, 'base64url')
    );
  } catch {
    valid = false;
  }
  if (!valid) throw new ValidationError('agent signed handoff sender signature is invalid');
  const signed = Object.freeze({
    schema: AGENT_SIGNED_HANDOFF_SCHEMA,
    statement,
    statement_digest: statementDigest,
    sender_signature: signature
  });
  const handoffDigest = digest(value.handoff_digest, 'agent signed handoff handoff_digest');
  if (handoffDigest !== digestObject(signed)) {
    throw new ValidationError('agent signed handoff handoff_digest mismatch');
  }

  if (
    expectedRecipientPrincipalId !== undefined
    && statement.recipient_principal_id !== expectedRecipientPrincipalId
  ) throw new ValidationError('agent signed handoff recipient mismatch');
  if (expectedExecutorId !== undefined && statement.intended_executor_id !== expectedExecutorId) {
    throw new ValidationError('agent signed handoff intended executor mismatch');
  }
  if (expectedInputDigest !== undefined && statement.input_digest !== expectedInputDigest) {
    throw new ValidationError('agent signed handoff input digest mismatch');
  }
  if (
    expectedParentTaskId !== undefined
    && statement.parent_task_id !== expectedParentTaskId
  ) throw new ValidationError('agent signed handoff parent task mismatch');

  return Object.freeze({ ...signed, handoff_digest: handoffDigest });
}
