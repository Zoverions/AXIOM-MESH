import { ValidationError, canonicalJson, digestObject } from './canonical.mjs';
import { normalizeMachinePrincipalDefinition } from './machine-principal.mjs';

export const MACHINE_DELEGATION_POLICY_CANDIDATE_SCHEMA =
  'axiom-machine-delegation-policy-candidate.v1';

const POLICY_KEYS = new Set([
  'schema', 'principal_id', 'principal_authority_digest', 'sponsor',
  'delegable_actions', 'delegable_scopes', 'delegable_purposes',
  'delegable_destinations', 'budgets', 'max_delegation_depth',
  'expires_at', 'subdelegation_allowed', 'runtime_accepted',
  'owner_approval_bound', 'revocation_currentness_bound',
  'authority_effect', 'delegation_effect', 'policy_digest'
]);
const BUDGET_KEYS = new Set([
  'max_requests_per_minute', 'max_concurrent_requests', 'max_execution_ms',
  'max_request_bytes', 'max_response_bytes'
]);
const FIXED = Object.freeze({
  runtime_accepted: false,
  owner_approval_bound: false,
  revocation_currentness_bound: false,
  authority_effect: 'none',
  delegation_effect: 'none'
});

function object(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new ValidationError(`${label} must be an object`);
  }
  return value;
}

function rejectUnknown(value, allowed, label) {
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) throw new ValidationError(`${label} contains unsupported field ${key}`);
  }
}

function canonicalSet(value, label) {
  if (!Array.isArray(value) || value.length > 128) {
    throw new ValidationError(`${label} must contain at most 128 strings`);
  }
  const normalized = [...new Set(value.map((item) => {
    if (typeof item !== 'string' || !item.length || item.length > 256) {
      throw new ValidationError(`${label} contains an invalid value`);
    }
    return item;
  }))].sort();
  if (canonicalJson(value) !== canonicalJson(normalized)) {
    throw new ValidationError(`${label} must be sorted and unique`);
  }
  return Object.freeze(normalized);
}

function subset(parent, child, label) {
  const allowed = new Set(parent);
  for (const item of child) {
    if (!allowed.has(item)) throw new ValidationError(`${label} widens machine principal authority with ${item}`);
  }
}

function integer(value, label, min, max) {
  if (!Number.isSafeInteger(value) || value < min || value > max) {
    throw new ValidationError(`${label} must be an integer between ${min} and ${max}`);
  }
  return value;
}

function timestamp(value, label) {
  if (typeof value !== 'string') throw new ValidationError(`${label} must be a canonical UTC ISO timestamp`);
  const parsed = new Date(value);
  if (Number.isNaN(parsed.valueOf()) || parsed.toISOString() !== value) {
    throw new ValidationError(`${label} must be a canonical UTC ISO timestamp`);
  }
  return value;
}

function normalizeBudgets(raw, parent) {
  const value = object(raw, 'machine delegation candidate budgets');
  rejectUnknown(value, BUDGET_KEYS, 'machine delegation candidate budgets');
  const result = {};
  for (const key of BUDGET_KEYS) {
    const ceiling = integer(value[key], `machine delegation candidate budgets.${key}`, 1, parent[key]);
    if (ceiling > parent[key]) {
      throw new ValidationError(`machine delegation candidate budget ${key} exceeds principal ceiling`);
    }
    result[key] = ceiling;
  }
  return Object.freeze(result);
}

export function createMachineDelegationPolicyCandidate(principalRaw, candidateRaw, {
  knownHumanPrincipals = null,
  now = new Date()
} = {}) {
  const principal = normalizeMachinePrincipalDefinition(principalRaw, { knownHumanPrincipals, now });
  if (principal.constraints.delegation.allowed !== false || principal.constraints.delegation.max_depth !== 0) {
    throw new ValidationError('delegation candidate requires the current v1 no-delegation principal boundary');
  }
  const raw = object(candidateRaw, 'machine delegation policy candidate');
  rejectUnknown(raw, POLICY_KEYS, 'machine delegation policy candidate');
  if (raw.schema !== undefined && raw.schema !== MACHINE_DELEGATION_POLICY_CANDIDATE_SCHEMA) {
    throw new ValidationError('machine delegation policy candidate schema is unsupported');
  }
  for (const [key, expected] of Object.entries(FIXED)) {
    if (raw[key] !== undefined && raw[key] !== expected) {
      throw new ValidationError(`machine delegation policy candidate ${key} must remain ${String(expected)}`);
    }
  }

  const actions = canonicalSet(raw.delegable_actions, 'machine delegation candidate actions');
  const scopes = canonicalSet(raw.delegable_scopes, 'machine delegation candidate scopes');
  const purposes = canonicalSet(raw.delegable_purposes, 'machine delegation candidate purposes');
  const destinations = canonicalSet(raw.delegable_destinations, 'machine delegation candidate destinations');
  subset(principal.constraints.actions, actions, 'machine delegation candidate actions');
  subset(principal.scopes, scopes, 'machine delegation candidate scopes');
  subset(principal.constraints.purposes, purposes, 'machine delegation candidate purposes');
  subset(principal.constraints.destinations, destinations, 'machine delegation candidate destinations');

  const depth = integer(raw.max_delegation_depth, 'machine delegation candidate max_delegation_depth', 1, 8);
  if (typeof raw.subdelegation_allowed !== 'boolean') {
    throw new ValidationError('machine delegation candidate subdelegation_allowed must be boolean');
  }
  if (!raw.subdelegation_allowed && depth !== 1) {
    throw new ValidationError('non-subdelegating candidate must have max_delegation_depth 1');
  }

  const expiresAt = timestamp(raw.expires_at, 'machine delegation candidate expires_at');
  if (new Date(expiresAt).valueOf() <= now.valueOf()) {
    throw new ValidationError('machine delegation candidate expires_at must be in the future');
  }
  if (principal.expires_at && new Date(expiresAt).valueOf() > new Date(principal.expires_at).valueOf()) {
    throw new ValidationError('machine delegation candidate cannot outlive machine principal');
  }

  const body = Object.freeze({
    schema: MACHINE_DELEGATION_POLICY_CANDIDATE_SCHEMA,
    principal_id: principal.id,
    principal_authority_digest: principal.authority_digest,
    sponsor: principal.sponsor,
    delegable_actions: actions,
    delegable_scopes: scopes,
    delegable_purposes: purposes,
    delegable_destinations: destinations,
    budgets: normalizeBudgets(raw.budgets, principal.constraints.budgets),
    max_delegation_depth: depth,
    expires_at: expiresAt,
    subdelegation_allowed: raw.subdelegation_allowed,
    ...FIXED
  });
  const policyDigest = digestObject(body);
  if (raw.policy_digest !== undefined && raw.policy_digest !== policyDigest) {
    throw new ValidationError('machine delegation policy candidate digest mismatch');
  }
  return Object.freeze({ ...body, policy_digest: policyDigest });
}

export function verifyMachineDelegationPolicyCandidate(candidate, principal, options = {}) {
  const raw = object(candidate, 'machine delegation policy candidate');
  if (typeof raw.policy_digest !== 'string') {
    throw new ValidationError('machine delegation policy candidate requires policy_digest');
  }
  return createMachineDelegationPolicyCandidate(principal, raw, options);
}
