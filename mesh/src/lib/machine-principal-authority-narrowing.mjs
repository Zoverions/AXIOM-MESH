import { ValidationError } from './canonical.mjs';
import { normalizeMachinePrincipalDefinition } from './machine-principal.mjs';

const BUDGET_KEYS = Object.freeze([
  'max_requests_per_minute',
  'max_concurrent_requests',
  'max_execution_ms',
  'max_request_bytes',
  'max_response_bytes'
]);

function canonicalNow(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.valueOf())) {
    throw new ValidationError('Machine principal narrowing reference time is invalid');
  }
  return date;
}

function sameArray(left, right) {
  return left.length === right.length && left.every((item, index) => item === right[index]);
}

function assertSubset(parent, child, label) {
  const available = new Set(parent);
  for (const item of child) {
    if (!available.has(item)) {
      throw new ValidationError(`Machine principal narrowing widens ${label} with ${item}`);
    }
  }
}

function assertSame(left, right, label) {
  if (left !== right) {
    throw new ValidationError(`Machine principal narrowing cannot change ${label}`);
  }
}

export function evaluateMachinePrincipalAuthorityNarrowing(
  previousRaw,
  successorRaw,
  {
    knownHumanPrincipals = null,
    now = new Date()
  } = {}
) {
  const referenceTime = canonicalNow(now);
  const previous = normalizeMachinePrincipalDefinition(previousRaw, {
    knownHumanPrincipals,
    now: referenceTime
  });
  const successor = normalizeMachinePrincipalDefinition(successorRaw, {
    knownHumanPrincipals,
    now: referenceTime
  });

  assertSame(previous.id, successor.id, 'principal id');
  assertSame(previous.type, successor.type, 'principal type');
  assertSame(previous.sponsor, successor.sponsor, 'sponsor');
  assertSame(previous.lifetime, successor.lifetime, 'lifetime mode');
  assertSame(previous.runtime.id, successor.runtime.id, 'runtime id');
  assertSame(previous.runtime.kind, successor.runtime.kind, 'runtime kind');
  assertSame(
    previous.runtime.software_digest ?? null,
    successor.runtime.software_digest ?? null,
    'runtime software digest'
  );

  if (
    previous.constraints.delegation.allowed !== false
    || previous.constraints.delegation.max_depth !== 0
    || successor.constraints.delegation.allowed !== false
    || successor.constraints.delegation.max_depth !== 0
  ) {
    throw new ValidationError(
      'Machine principal narrowing requires the machine-principal v1 non-delegating boundary'
    );
  }

  assertSubset(previous.roles, successor.roles, 'roles');
  assertSubset(previous.scopes, successor.scopes, 'scopes');
  assertSubset(previous.constraints.actions, successor.constraints.actions, 'actions');
  assertSubset(previous.constraints.purposes, successor.constraints.purposes, 'purposes');
  assertSubset(
    previous.constraints.destinations,
    successor.constraints.destinations,
    'destinations'
  );

  for (const key of BUDGET_KEYS) {
    if (successor.constraints.budgets[key] > previous.constraints.budgets[key]) {
      throw new ValidationError(
        `Machine principal narrowing widens budget ${key}`
      );
    }
  }

  if (
    previous.expires_at !== undefined
    && successor.expires_at !== undefined
    && Date.parse(successor.expires_at) > Date.parse(previous.expires_at)
  ) {
    throw new ValidationError('Machine principal narrowing cannot extend expiry');
  }

  const strict = previous.authority_digest !== successor.authority_digest;
  if (!strict) {
    if (
      !sameArray(previous.roles, successor.roles)
      || !sameArray(previous.scopes, successor.scopes)
    ) {
      throw new ValidationError(
        'Machine principal narrowing produced inconsistent authority digest'
      );
    }
  }

  return Object.freeze({
    valid: true,
    relation: strict ? 'strictly-narrower' : 'equal',
    principal_id: previous.id,
    principal_type: previous.type,
    previous_authority_digest: previous.authority_digest,
    successor_authority_digest: successor.authority_digest,
    authority_changed: strict,
    execution_authority_granted: false,
    delegation_effect: 'none',
    capability_promotion_effect: 'none',
    global_currentness_claimed: false
  });
}
