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

export const AGENT_AUTHORITY_CEILING_SCHEMA = 'axiom-agent-authority-ceiling.v1';
export const AGENT_ATTENUATION_PROOF_SCHEMA = 'axiom-agent-attenuation-proof.v1';

const DIGEST = /^[a-f0-9]{64}$/;
const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,191}$/;
const BASE64URL = /^[A-Za-z0-9_-]+$/;
const ASSURANCE = /^A([0-9]+)$/;
const MAX_ITEMS = 256;

const CEILING_KEYS = new Set([
  'schema', 'capabilities', 'actions', 'scopes', 'purposes', 'destinations',
  'data_classes', 'budgets', 'delegation', 'valid_from', 'expires_at',
  'ceiling_digest'
]);
const ACTION_KEYS = new Set([
  'id', 'effect_destination', 'required_assurance', 'required_confirmations',
  'required_confirmation_values', 'requires_independent_approval', 'timeout_ms'
]);
const BUDGET_KEYS = new Set([
  'max_requests_per_minute', 'max_concurrent_requests', 'max_execution_ms',
  'max_request_bytes', 'max_response_bytes', 'max_cost_units'
]);
const DELEGATION_KEYS = new Set(['may_subdelegate', 'remaining_depth']);
const PROOF_KEYS = new Set([
  'schema', 'statement', 'statement_digest', 'delegator_signature', 'proof_digest'
]);
const PROOF_STATEMENT_KEYS = new Set([
  'proof_id', 'delegator_id', 'delegate_id', 'delegator_key_id',
  'parent_ceiling_digest', 'child_ceiling_digest', 'parent_context_digest',
  'issued_at', 'expires_at', 'proof_kind', 'attenuation_verified',
  'parent_authorization_claimed', 'authority_effect', 'delegation_effect',
  'execution_authorized', 'bearer_token', 'runtime_delegation_enabled',
  'global_currentness_claimed', 'revocation_currentness_checked',
  'protocol_switch_can_expand_authority'
]);

const PROOF_SEMANTICS = Object.freeze({
  proof_kind: 'attenuation-only-proof-laboratory',
  attenuation_verified: true,
  parent_authorization_claimed: false,
  authority_effect: 'none',
  delegation_effect: 'none',
  execution_authorized: false,
  bearer_token: false,
  runtime_delegation_enabled: false,
  global_currentness_claimed: false,
  revocation_currentness_checked: false,
  protocol_switch_can_expand_authority: false
});

function exactObject(raw, allowed, label) {
  const value = assertPlainObject(raw, label);
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) throw new ValidationError(`${label} contains unsupported field ${key}`);
  }
  return value;
}

function digest(value, label) {
  return assertString(value, label, { min: 64, max: 64, pattern: DIGEST });
}

function nullableDigest(value, label) {
  return value === null ? null : digest(value, label);
}

function identifier(value, label) {
  return assertString(value, label, { min: 1, max: 192, pattern: IDENTIFIER });
}

function canonicalTimestamp(value, label) {
  const text = assertString(value, label, { min: 24, max: 24 });
  const parsed = new Date(text);
  if (Number.isNaN(parsed.valueOf()) || parsed.toISOString() !== text) {
    throw new ValidationError(`${label} must be a canonical UTC ISO timestamp`);
  }
  return text;
}

function timestampValue(value) {
  return new Date(value).valueOf();
}

function canonicalStringSet(raw, label, { maxLength = 256 } = {}) {
  if (!Array.isArray(raw) || raw.length > MAX_ITEMS) {
    throw new ValidationError(`${label} must contain at most ${MAX_ITEMS} items`);
  }
  const values = raw.map((item, index) => assertString(item, `${label}[${index}]`, {
    min: 1,
    max: maxLength
  }));
  const normalized = [...new Set(values)].sort();
  if (canonicalJson(values) !== canonicalJson(normalized)) {
    throw new ValidationError(`${label} must be sorted and unique`);
  }
  return Object.freeze(normalized);
}

function nonNegativeInteger(value, label, max = Number.MAX_SAFE_INTEGER) {
  if (!Number.isSafeInteger(value) || value < 0 || value > max) {
    throw new ValidationError(`${label} must be a non-negative safe integer`);
  }
  return value;
}

function normalizeAssurance(value, label) {
  const text = assertString(value, label, { min: 2, max: 16, pattern: ASSURANCE });
  return text;
}

function assuranceRank(value) {
  return Number(ASSURANCE.exec(value)[1]);
}

function normalizeAction(raw, index) {
  const value = exactObject(raw, ACTION_KEYS, `authority ceiling actions[${index}]`);
  const requiredConfirmations = nonNegativeInteger(
    value.required_confirmations,
    `authority ceiling actions[${index}].required_confirmations`,
    32
  );
  if (typeof value.requires_independent_approval !== 'boolean') {
    throw new ValidationError(`authority ceiling actions[${index}].requires_independent_approval must be boolean`);
  }
  const timeout = nonNegativeInteger(value.timeout_ms, `authority ceiling actions[${index}].timeout_ms`, 300_000);
  return Object.freeze({
    id: assertString(value.id, `authority ceiling actions[${index}].id`, {
      min: 2, max: 128, pattern: /^[a-z][a-z0-9._:-]{1,127}$/
    }),
    effect_destination: assertString(
      value.effect_destination,
      `authority ceiling actions[${index}].effect_destination`,
      { min: 1, max: 256 }
    ),
    required_assurance: normalizeAssurance(
      value.required_assurance,
      `authority ceiling actions[${index}].required_assurance`
    ),
    required_confirmations: requiredConfirmations,
    required_confirmation_values: canonicalStringSet(
      value.required_confirmation_values,
      `authority ceiling actions[${index}].required_confirmation_values`,
      { maxLength: 160 }
    ),
    requires_independent_approval: value.requires_independent_approval,
    timeout_ms: timeout
  });
}

function normalizeBudgets(raw) {
  const value = exactObject(raw, BUDGET_KEYS, 'authority ceiling budgets');
  const result = {};
  for (const key of BUDGET_KEYS) {
    result[key] = nonNegativeInteger(value[key], `authority ceiling budgets.${key}`);
  }
  return Object.freeze(result);
}

function normalizeDelegation(raw) {
  const value = exactObject(raw, DELEGATION_KEYS, 'authority ceiling delegation');
  if (typeof value.may_subdelegate !== 'boolean') {
    throw new ValidationError('authority ceiling delegation.may_subdelegate must be boolean');
  }
  const remainingDepth = nonNegativeInteger(
    value.remaining_depth,
    'authority ceiling delegation.remaining_depth',
    32
  );
  if (value.may_subdelegate && remainingDepth === 0) {
    throw new ValidationError('authority ceiling cannot allow subdelegation with zero remaining depth');
  }
  return Object.freeze({ may_subdelegate: value.may_subdelegate, remaining_depth: remainingDepth });
}

export function normalizeAgentAuthorityCeiling(raw) {
  const value = exactObject(raw, CEILING_KEYS, 'agent authority ceiling');
  if (value.schema !== AGENT_AUTHORITY_CEILING_SCHEMA) {
    throw new ValidationError(`agent authority ceiling schema must be ${AGENT_AUTHORITY_CEILING_SCHEMA}`);
  }
  if (!Array.isArray(value.actions) || value.actions.length > MAX_ITEMS) {
    throw new ValidationError(`authority ceiling actions must contain at most ${MAX_ITEMS} items`);
  }
  const actions = value.actions.map(normalizeAction);
  const ids = actions.map(item => item.id);
  if (canonicalJson(ids) !== canonicalJson([...ids].sort()) || new Set(ids).size !== ids.length) {
    throw new ValidationError('authority ceiling actions must be sorted and unique by id');
  }
  const validFrom = canonicalTimestamp(value.valid_from, 'authority ceiling valid_from');
  const expiresAt = canonicalTimestamp(value.expires_at, 'authority ceiling expires_at');
  if (timestampValue(expiresAt) <= timestampValue(validFrom)) {
    throw new ValidationError('authority ceiling expiry must follow valid_from');
  }
  const body = Object.freeze({
    schema: AGENT_AUTHORITY_CEILING_SCHEMA,
    capabilities: canonicalStringSet(value.capabilities, 'authority ceiling capabilities', { maxLength: 160 }),
    actions: Object.freeze(actions),
    scopes: canonicalStringSet(value.scopes, 'authority ceiling scopes', { maxLength: 160 }),
    purposes: canonicalStringSet(value.purposes, 'authority ceiling purposes', { maxLength: 160 }),
    destinations: canonicalStringSet(value.destinations, 'authority ceiling destinations'),
    data_classes: canonicalStringSet(value.data_classes, 'authority ceiling data_classes', { maxLength: 160 }),
    budgets: normalizeBudgets(value.budgets),
    delegation: normalizeDelegation(value.delegation),
    valid_from: validFrom,
    expires_at: expiresAt
  });
  const ceilingDigest = digestObject(body);
  if (value.ceiling_digest !== undefined && digest(value.ceiling_digest, 'authority ceiling ceiling_digest') !== ceilingDigest) {
    throw new ValidationError('authority ceiling digest mismatch');
  }
  return Object.freeze({ ...body, ceiling_digest: ceilingDigest });
}

export function createAgentAuthorityCeiling(value) {
  return normalizeAgentAuthorityCeiling({
    ...value,
    schema: AGENT_AUTHORITY_CEILING_SCHEMA
  });
}

function assertSubset(parent, child, label) {
  const parentSet = new Set(parent);
  for (const item of child) {
    if (!parentSet.has(item)) throw new ValidationError(`${label} widens parent authority with ${item}`);
  }
}

function assertConfirmationFloor(parent, child, actionId) {
  if (child.required_confirmations < parent.required_confirmations) {
    throw new ValidationError(`child action ${actionId} lowers required confirmation count`);
  }
  const childValues = new Set(child.required_confirmation_values);
  for (const value of parent.required_confirmation_values) {
    if (!childValues.has(value)) {
      throw new ValidationError(`child action ${actionId} removes required confirmation value ${value}`);
    }
  }
  if (parent.requires_independent_approval && !child.requires_independent_approval) {
    throw new ValidationError(`child action ${actionId} removes independent approval requirement`);
  }
  if (assuranceRank(child.required_assurance) < assuranceRank(parent.required_assurance)) {
    throw new ValidationError(`child action ${actionId} lowers required assurance`);
  }
  if (child.timeout_ms > parent.timeout_ms) {
    throw new ValidationError(`child action ${actionId} widens execution timeout`);
  }
  if (child.effect_destination !== parent.effect_destination) {
    throw new ValidationError(`child action ${actionId} changes effect destination`);
  }
}

export function evaluateAgentAuthorityAttenuation(parentRaw, childRaw) {
  const parent = normalizeAgentAuthorityCeiling(parentRaw);
  const child = normalizeAgentAuthorityCeiling(childRaw);

  if (!parent.delegation.may_subdelegate || parent.delegation.remaining_depth < 1) {
    throw new ValidationError('parent authority ceiling does not permit delegation');
  }
  if (child.delegation.remaining_depth > parent.delegation.remaining_depth - 1) {
    throw new ValidationError('child delegation depth is not attenuated from parent');
  }
  if (child.delegation.may_subdelegate && child.delegation.remaining_depth < 1) {
    throw new ValidationError('child cannot subdelegate with zero remaining depth');
  }

  assertSubset(parent.capabilities, child.capabilities, 'child capabilities');
  assertSubset(parent.scopes, child.scopes, 'child scopes');
  assertSubset(parent.purposes, child.purposes, 'child purposes');
  assertSubset(parent.destinations, child.destinations, 'child destinations');
  assertSubset(parent.data_classes, child.data_classes, 'child data classes');

  for (const key of BUDGET_KEYS) {
    if (child.budgets[key] > parent.budgets[key]) {
      throw new ValidationError(`child budget ${key} exceeds parent ceiling`);
    }
  }

  if (timestampValue(child.valid_from) < timestampValue(parent.valid_from)) {
    throw new ValidationError('child authority starts before parent authority');
  }
  if (timestampValue(child.expires_at) > timestampValue(parent.expires_at)) {
    throw new ValidationError('child authority expires after parent authority');
  }

  const parentActions = new Map(parent.actions.map(item => [item.id, item]));
  for (const childAction of child.actions) {
    const parentAction = parentActions.get(childAction.id);
    if (!parentAction) throw new ValidationError(`child actions widen parent authority with ${childAction.id}`);
    assertConfirmationFloor(parentAction, childAction, childAction.id);
  }

  return Object.freeze({
    valid: true,
    parent_ceiling_digest: parent.ceiling_digest,
    child_ceiling_digest: child.ceiling_digest,
    authority_relation: 'strictly-equal-or-narrower',
    delegation_depth_consumed: 1,
    parent_remaining_depth: parent.delegation.remaining_depth,
    child_remaining_depth: child.delegation.remaining_depth,
    non_authorizing_proof_only: true
  });
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

function canonicalPublicKey(value, label) {
  return parsePublicKey(value, label).export({ type: 'spki', format: 'pem' }).toString();
}

export function agentAttenuationKeyId(value, label = 'agent attenuation public key') {
  return sha256(canonicalPublicKey(value, label));
}

function normalizeProofStatement(raw) {
  const value = exactObject(raw, PROOF_STATEMENT_KEYS, 'agent attenuation proof statement');
  const semantics = Object.fromEntries(Object.keys(PROOF_SEMANTICS).map(key => [key, value[key]]));
  if (canonicalJson(semantics) !== canonicalJson(PROOF_SEMANTICS)) {
    throw new ValidationError('agent attenuation proof widens its proof-only boundary');
  }
  const issuedAt = canonicalTimestamp(value.issued_at, 'agent attenuation proof issued_at');
  const expiresAt = canonicalTimestamp(value.expires_at, 'agent attenuation proof expires_at');
  if (timestampValue(expiresAt) <= timestampValue(issuedAt)) {
    throw new ValidationError('agent attenuation proof expiry must follow issuance');
  }
  return Object.freeze({
    proof_id: identifier(value.proof_id, 'agent attenuation proof proof_id'),
    delegator_id: identifier(value.delegator_id, 'agent attenuation proof delegator_id'),
    delegate_id: identifier(value.delegate_id, 'agent attenuation proof delegate_id'),
    delegator_key_id: digest(value.delegator_key_id, 'agent attenuation proof delegator_key_id'),
    parent_ceiling_digest: digest(value.parent_ceiling_digest, 'agent attenuation proof parent_ceiling_digest'),
    child_ceiling_digest: digest(value.child_ceiling_digest, 'agent attenuation proof child_ceiling_digest'),
    parent_context_digest: nullableDigest(value.parent_context_digest, 'agent attenuation proof parent_context_digest'),
    issued_at: issuedAt,
    expires_at: expiresAt,
    ...PROOF_SEMANTICS
  });
}

export function createAgentAttenuationProof({
  proofId,
  delegatorId,
  delegateId,
  delegatorPrivateKey,
  parentAuthority,
  childAuthority,
  parentContextDigest = null,
  issuedAt,
  expiresAt
} = {}) {
  const attenuation = evaluateAgentAuthorityAttenuation(parentAuthority, childAuthority);
  const privateKey = parsePrivateKey(delegatorPrivateKey, 'agent attenuation delegator private key');
  const publicKey = createPublicKey(privateKey);
  const statement = normalizeProofStatement({
    proof_id: proofId,
    delegator_id: delegatorId,
    delegate_id: delegateId,
    delegator_key_id: agentAttenuationKeyId(publicKey),
    parent_ceiling_digest: attenuation.parent_ceiling_digest,
    child_ceiling_digest: attenuation.child_ceiling_digest,
    parent_context_digest: parentContextDigest,
    issued_at: issuedAt,
    expires_at: expiresAt,
    ...PROOF_SEMANTICS
  });
  const child = normalizeAgentAuthorityCeiling(childAuthority);
  if (timestampValue(statement.expires_at) > timestampValue(child.expires_at)) {
    throw new ValidationError('agent attenuation proof cannot outlive child authority');
  }
  const statementDigest = digestObject(statement);
  const signable = Object.freeze({
    schema: AGENT_ATTENUATION_PROOF_SCHEMA,
    statement,
    statement_digest: statementDigest
  });
  const signature = sign(null, Buffer.from(canonicalJson(signable)), privateKey).toString('base64url');
  const signed = Object.freeze({
    schema: AGENT_ATTENUATION_PROOF_SCHEMA,
    statement,
    statement_digest: statementDigest,
    delegator_signature: signature
  });
  return Object.freeze({ ...signed, proof_digest: digestObject(signed) });
}

export function verifyAgentAttenuationProof(raw, {
  delegatorPublicKey,
  parentAuthority,
  childAuthority,
  expectedDelegatorId,
  expectedDelegateId,
  expectedParentContextDigest
} = {}) {
  const value = exactObject(raw, PROOF_KEYS, 'agent attenuation proof');
  if (value.schema !== AGENT_ATTENUATION_PROOF_SCHEMA) {
    throw new ValidationError(`agent attenuation proof schema must be ${AGENT_ATTENUATION_PROOF_SCHEMA}`);
  }
  const statement = normalizeProofStatement(value.statement);
  const statementDigest = digest(value.statement_digest, 'agent attenuation proof statement_digest');
  if (statementDigest !== digestObject(statement)) {
    throw new ValidationError('agent attenuation proof statement digest mismatch');
  }
  const publicKey = parsePublicKey(delegatorPublicKey, 'agent attenuation delegator public key');
  if (agentAttenuationKeyId(publicKey) !== statement.delegator_key_id) {
    throw new ValidationError('agent attenuation proof delegator key substitution');
  }
  const signature = assertString(value.delegator_signature, 'agent attenuation proof delegator_signature', {
    min: 32, max: 1024, pattern: BASE64URL
  });
  let valid = false;
  try {
    valid = verify(
      null,
      Buffer.from(canonicalJson({
        schema: AGENT_ATTENUATION_PROOF_SCHEMA,
        statement,
        statement_digest: statementDigest
      })),
      publicKey,
      Buffer.from(signature, 'base64url')
    );
  } catch {
    valid = false;
  }
  if (!valid) throw new ValidationError('agent attenuation proof delegator signature is invalid');
  const signed = Object.freeze({
    schema: AGENT_ATTENUATION_PROOF_SCHEMA,
    statement,
    statement_digest: statementDigest,
    delegator_signature: signature
  });
  const proofDigest = digest(value.proof_digest, 'agent attenuation proof proof_digest');
  if (proofDigest !== digestObject(signed)) throw new ValidationError('agent attenuation proof proof_digest mismatch');

  if (expectedDelegatorId !== undefined && statement.delegator_id !== expectedDelegatorId) {
    throw new ValidationError('agent attenuation proof delegator_id mismatch');
  }
  if (expectedDelegateId !== undefined && statement.delegate_id !== expectedDelegateId) {
    throw new ValidationError('agent attenuation proof delegate_id mismatch');
  }
  if (
    expectedParentContextDigest !== undefined
    && statement.parent_context_digest !== expectedParentContextDigest
  ) throw new ValidationError('agent attenuation proof parent context mismatch');

  const attenuation = evaluateAgentAuthorityAttenuation(parentAuthority, childAuthority);
  if (
    attenuation.parent_ceiling_digest !== statement.parent_ceiling_digest
    || attenuation.child_ceiling_digest !== statement.child_ceiling_digest
  ) throw new ValidationError('agent attenuation proof authority binding mismatch');

  return Object.freeze({ ...signed, proof_digest: proofDigest, attenuation });
}

export function authorityCeilingFromAgentPassport(rawManifest) {
  const manifest = exactObject(rawManifest, new Set([
    'schema', 'notice', 'principal', 'identity', 'authority', 'evaluation',
    'validity', 'semantics', 'manifest_digest'
  ]), 'agent passport');
  if (manifest.schema !== 'axiom-agent-authority-manifest.v1') {
    throw new ValidationError('agent passport schema is unsupported for attenuation projection');
  }
  const suppliedDigest = digest(manifest.manifest_digest, 'agent passport manifest_digest');
  const { manifest_digest: ignored, ...body } = manifest;
  if (digestObject(body) !== suppliedDigest) throw new ValidationError('agent passport digest mismatch');
  const authority = assertPlainObject(manifest.authority, 'agent passport authority');
  const principal = assertPlainObject(manifest.principal, 'agent passport principal');
  const validity = assertPlainObject(manifest.validity, 'agent passport validity');
  if (
    authority.delegation?.allowed !== false
    || authority.delegation?.max_depth !== 0
  ) throw new ValidationError('current agent passport delegation boundary is unsupported');
  if (!Array.isArray(authority.requestable_actions)) {
    throw new ValidationError('agent passport requestable_actions are invalid');
  }
  return createAgentAuthorityCeiling({
    capabilities: [],
    actions: authority.requestable_actions.map(item => ({
      id: item.id,
      effect_destination: item.effect_destination,
      required_assurance: item.required_assurance,
      required_confirmations: item.required_confirmations,
      required_confirmation_values: item.required_confirmation_values,
      requires_independent_approval: item.requires_independent_approval,
      timeout_ms: item.timeout_ms
    })).sort((a, b) => a.id.localeCompare(b.id)),
    scopes: [...principal.scopes].sort(),
    purposes: [...authority.purposes].sort(),
    destinations: [...authority.destinations].sort(),
    data_classes: [],
    budgets: {
      ...authority.budgets,
      max_cost_units: 0
    },
    delegation: { may_subdelegate: false, remaining_depth: 0 },
    valid_from: validity.created_at,
    expires_at: validity.expires_at
  });
}
