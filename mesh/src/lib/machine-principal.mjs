import { ValidationError, digestObject } from './canonical.mjs';

const PRINCIPAL_ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/;
const STABLE_ID = /^[a-z][a-z0-9_.:-]{0,159}$/;
const ACTION_ID = /^[a-z][a-z0-9.-]{1,127}$/;
const HEX_DIGEST = /^[a-f0-9]{64}$/;
const MACHINE_TYPES = new Set(['agent', 'service']);
const MACHINE_LIFETIMES = new Set(['persistent', 'session', 'ephemeral']);
const RUNTIME_KINDS = new Set(['local-process', 'container', 'external-runtime']);
const PROTOTYPE_KEYS = new Set(Object.getOwnPropertyNames(Object.prototype));

const DEFAULT_BUDGETS = Object.freeze({
  max_requests_per_minute: 60,
  max_concurrent_requests: 1,
  max_execution_ms: 10_000,
  max_request_bytes: 262_144,
  max_response_bytes: 1_048_576
});

export function normalizeMachinePrincipalDefinition(value, {
  knownHumanPrincipals = null,
  now = new Date()
} = {}) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new ValidationError('Machine principal definition must be an object');
  }
  if (value.schema !== undefined && value.schema !== 'axiom-machine-principal.v1') {
    throw new ValidationError('Machine principal schema is unsupported');
  }
  const type = value.type;
  if (!MACHINE_TYPES.has(type)) {
    throw new ValidationError('Machine principal type must be agent or service');
  }
  const id = requiredIdentifier(value.id, 'machine principal id', PRINCIPAL_ID);
  const sponsor = requiredIdentifier(value.sponsor, 'machine principal sponsor', PRINCIPAL_ID);
  if (knownHumanPrincipals !== null) {
    if (!(knownHumanPrincipals instanceof Set)) {
      throw new ValidationError('knownHumanPrincipals must be a Set when provided');
    }
    if (!knownHumanPrincipals.has(sponsor)) {
      throw new ValidationError('Machine principal sponsor must resolve to a known human principal');
    }
  }

  const roles = stringSet(value.roles ?? [], 'machine principal roles', {
    maxItems: 32,
    maxLength: 64,
    pattern: STABLE_ID
  });
  if (roles.includes('administrator')) {
    throw new ValidationError('Machine principals cannot hold the administrator role');
  }

  const scopes = stringSet(value.scopes ?? [], 'machine principal scopes', {
    minItems: 1,
    maxItems: 128,
    maxLength: 160,
    pattern: /^[A-Za-z0-9*][A-Za-z0-9*_.:-]{0,159}$/
  });
  if (scopes.some(scope => scope.includes('*'))) {
    throw new ValidationError('Machine principals cannot receive wildcard scope syntax');
  }

  const lifetime = value.lifetime ?? 'persistent';
  if (!MACHINE_LIFETIMES.has(lifetime)) {
    throw new ValidationError('Machine principal lifetime is invalid');
  }
  const expiresAt = normalizeExpiry(value.expires_at, lifetime, now);
  const runtime = normalizeRuntimeBinding(value.runtime);
  const constraints = normalizeMachineConstraints(value.constraints);
  const authorityProfile = {
    id,
    type,
    sponsor,
    roles,
    scopes,
    lifetime,
    ...(expiresAt ? { expires_at: expiresAt } : {}),
    runtime,
    constraints
  };
  const authorityDigest = digestObject(authorityProfile);
  if (value.authority_digest !== undefined) {
    const suppliedDigest = requiredIdentifier(
      value.authority_digest,
      'machine principal authority_digest',
      HEX_DIGEST
    );
    if (suppliedDigest !== authorityDigest) {
      throw new ValidationError('Machine principal authority_digest does not match normalized authority');
    }
  }

  return {
    schema: 'axiom-machine-principal.v1',
    ...authorityProfile,
    authority_digest: authorityDigest
  };
}

export function normalizeMachineConstraints(value = {}) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new ValidationError('Machine principal constraints must be an object');
  }
  const actions = stringSet(value.actions ?? [], 'machine principal actions', {
    minItems: 1,
    maxItems: 128,
    maxLength: 128,
    pattern: ACTION_ID
  });
  if (actions.some(action => PROTOTYPE_KEYS.has(action))) {
    throw new ValidationError('Machine principal actions contain a reserved prototype identifier');
  }
  const purposes = stringSet(value.purposes ?? [], 'machine principal purposes', {
    minItems: 1,
    maxItems: 64,
    maxLength: 160,
    pattern: STABLE_ID
  });
  const destinations = stringSet(value.destinations ?? [], 'machine principal destinations', {
    maxItems: 64,
    maxLength: 256,
    pattern: /^[A-Za-z0-9][A-Za-z0-9_.:/-]{0,255}$/
  });
  const budgets = normalizeBudgets(value.budgets ?? {});
  const delegation = normalizeDelegation(value.delegation ?? {});
  return { actions, purposes, destinations, budgets, delegation };
}

export function evaluateMachineIntent(principal, {
  action,
  purpose,
  destination = null,
  request_bytes = 0,
  requested_execution_ms = 0
} = {}) {
  const normalized = normalizeMachinePrincipalDefinition(principal);
  const constraints = normalized.constraints;

  if (!constraints.actions.includes(action)) {
    return deny('machine_action_denied', 'Machine principal is not constrained for this action');
  }
  if (!constraints.purposes.includes(purpose)) {
    return deny('machine_purpose_denied', 'Machine principal is not constrained for this purpose');
  }
  if (destination !== null && !constraints.destinations.includes(destination)) {
    return deny('machine_destination_denied', 'Machine principal is not constrained for this destination');
  }
  if (!Number.isSafeInteger(request_bytes) || request_bytes < 0) {
    throw new ValidationError('request_bytes must be a non-negative safe integer');
  }
  if (request_bytes > constraints.budgets.max_request_bytes) {
    return deny('machine_request_budget_exceeded', 'Machine principal request-size budget is exceeded');
  }
  if (!Number.isSafeInteger(requested_execution_ms) || requested_execution_ms < 0) {
    throw new ValidationError('requested_execution_ms must be a non-negative safe integer');
  }
  if (
    requested_execution_ms > 0
    && requested_execution_ms > constraints.budgets.max_execution_ms
  ) {
    return deny('machine_execution_budget_exceeded', 'Machine principal execution-time budget is exceeded');
  }
  return {
    allow: true,
    code: 'machine_constraints_satisfied',
    authority_digest: normalized.authority_digest,
    sponsor: normalized.sponsor
  };
}

export function machinePrincipalAuthorityFacts(principal) {
  const normalized = normalizeMachinePrincipalDefinition(principal);
  return {
    principal_id: normalized.id,
    principal_type: normalized.type,
    sponsor: normalized.sponsor,
    lifetime: normalized.lifetime,
    runtime_id: normalized.runtime.id,
    runtime_kind: normalized.runtime.kind,
    authority_digest: normalized.authority_digest,
    delegation_allowed: false,
    max_delegation_depth: 0
  };
}

function normalizeRuntimeBinding(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new ValidationError('Machine principal runtime binding must be an object');
  }
  const id = requiredIdentifier(value.id, 'machine runtime id', PRINCIPAL_ID);
  const kind = value.kind;
  if (!RUNTIME_KINDS.has(kind)) {
    throw new ValidationError('Machine principal runtime kind is invalid');
  }
  let softwareDigest;
  if (value.software_digest !== undefined) {
    softwareDigest = requiredIdentifier(
      value.software_digest,
      'machine runtime software digest',
      HEX_DIGEST
    );
  }
  return {
    id,
    kind,
    ...(softwareDigest ? { software_digest: softwareDigest } : {})
  };
}

function normalizeBudgets(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new ValidationError('Machine principal budgets must be an object');
  }
  const allowed = new Set(Object.keys(DEFAULT_BUDGETS));
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) throw new ValidationError(`Unsupported machine budget: ${key}`);
  }
  return {
    max_requests_per_minute: integerBudget(
      value.max_requests_per_minute,
      DEFAULT_BUDGETS.max_requests_per_minute,
      'max_requests_per_minute',
      1,
      10_000
    ),
    max_concurrent_requests: integerBudget(
      value.max_concurrent_requests,
      DEFAULT_BUDGETS.max_concurrent_requests,
      'max_concurrent_requests',
      1,
      128
    ),
    max_execution_ms: integerBudget(
      value.max_execution_ms,
      DEFAULT_BUDGETS.max_execution_ms,
      'max_execution_ms',
      1,
      300_000
    ),
    max_request_bytes: integerBudget(
      value.max_request_bytes,
      DEFAULT_BUDGETS.max_request_bytes,
      'max_request_bytes',
      1_024,
      10_485_760
    ),
    max_response_bytes: integerBudget(
      value.max_response_bytes,
      DEFAULT_BUDGETS.max_response_bytes,
      'max_response_bytes',
      1_024,
      20_971_520
    )
  };
}

function normalizeDelegation(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new ValidationError('Machine principal delegation must be an object');
  }
  const allowed = value.allowed ?? false;
  const maxDepth = value.max_depth ?? 0;
  if (allowed !== false || maxDepth !== 0) {
    throw new ValidationError('Machine principal v1 does not permit delegation');
  }
  return { allowed: false, max_depth: 0 };
}

function normalizeExpiry(value, lifetime, now) {
  if (lifetime === 'persistent') {
    if (value !== undefined && value !== null) {
      throw new ValidationError('Persistent machine principals must not set expires_at');
    }
    return null;
  }
  if (typeof value !== 'string' || value.length > 64) {
    throw new ValidationError('Non-persistent machine principals require expires_at');
  }
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) {
    throw new ValidationError('Machine principal expires_at must be an ISO timestamp');
  }
  if (date <= now) {
    throw new ValidationError('Machine principal expires_at must be in the future');
  }
  return date.toISOString();
}

function stringSet(value, name, {
  minItems = 0,
  maxItems,
  maxLength,
  pattern
}) {
  if (!Array.isArray(value) || value.length < minItems || value.length > maxItems) {
    throw new ValidationError(`${name} must contain ${minItems}-${maxItems} items`);
  }
  const normalized = [];
  for (const item of value) {
    if (typeof item !== 'string' || !item.length || item.length > maxLength || !pattern.test(item)) {
      throw new ValidationError(`${name} contains an invalid value`);
    }
    normalized.push(item);
  }
  return [...new Set(normalized)].sort();
}

function requiredIdentifier(value, name, pattern) {
  if (typeof value !== 'string' || !pattern.test(value)) {
    throw new ValidationError(`${name} is invalid`);
  }
  return value;
}

function integerBudget(value, fallback, name, min, max) {
  const resolved = value ?? fallback;
  if (!Number.isSafeInteger(resolved) || resolved < min || resolved > max) {
    throw new ValidationError(`${name} must be an integer between ${min} and ${max}`);
  }
  return resolved;
}

function deny(code, reason) {
  return { allow: false, code, reason };
}
