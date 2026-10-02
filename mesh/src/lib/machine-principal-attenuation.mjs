import { ValidationError } from './canonical.mjs';
import {
  normalizeMachinePrincipalAuthoritySnapshot
} from './machine-principal.mjs';

const BUDGET_KEYS = Object.freeze([
  'max_requests_per_minute',
  'max_concurrent_requests',
  'max_execution_ms',
  'max_request_bytes',
  'max_response_bytes'
]);

export function machineAuthoritySnapshot(principal) {
  return Object.freeze(
    structuredClone(normalizeMachinePrincipalAuthoritySnapshot(principal))
  );
}

export function machineAuthoritySnapshotDigest(snapshot) {
  return normalizeMachinePrincipalAuthoritySnapshot(snapshot).authority_digest;
}

export function assertMachineAuthorityTimeActive(snapshotInput, now = new Date()) {
  const snapshot = normalizeMachinePrincipalAuthoritySnapshot(snapshotInput);
  if (!(now instanceof Date) || Number.isNaN(now.valueOf())) {
    throw new ValidationError('Machine authority observation time must be a valid Date');
  }
  if (
    snapshot.expires_at
    && new Date(snapshot.expires_at).valueOf() <= now.valueOf()
  ) {
    throw new ValidationError('Machine principal authority is expired');
  }
  return Object.freeze(snapshot);
}

export function assertMachineAuthorityAttenuation(
  predecessorInput,
  successorInput,
  { now = new Date() } = {}
) {
  const predecessor = assertMachineAuthorityTimeActive(predecessorInput, now);
  const successorCandidate = structuredClone(successorInput);
  if (
    !successorCandidate
    || typeof successorCandidate !== 'object'
    || Array.isArray(successorCandidate)
  ) {
    throw new ValidationError('Machine authority successor must be an object');
  }
  delete successorCandidate.authority_digest;
  const successor = assertMachineAuthorityTimeActive(successorCandidate, now);

  assertSame(predecessor.id, successor.id, 'principal id');
  assertSame(predecessor.type, successor.type, 'principal type');
  assertSame(predecessor.sponsor, successor.sponsor, 'sponsor');
  assertSame(predecessor.runtime.id, successor.runtime.id, 'runtime id');
  assertSame(predecessor.runtime.kind, successor.runtime.kind, 'runtime kind');
  assertSame(
    predecessor.runtime.software_digest ?? null,
    successor.runtime.software_digest ?? null,
    'runtime software digest'
  );
  assertSubset(successor.roles, predecessor.roles, 'roles');
  assertSubset(successor.scopes, predecessor.scopes, 'scopes');
  assertSubset(
    successor.constraints.actions,
    predecessor.constraints.actions,
    'actions'
  );
  assertSubset(
    successor.constraints.purposes,
    predecessor.constraints.purposes,
    'purposes'
  );
  assertSubset(
    successor.constraints.destinations,
    predecessor.constraints.destinations,
    'destinations'
  );
  assertBudgetsNotIncreased(
    predecessor.constraints.budgets,
    successor.constraints.budgets
  );
  assertLifetimeClassUnchanged(predecessor, successor);
  assertExpiryNotExtended(predecessor, successor);

  if (
    successor.constraints.delegation.allowed !== false
    || successor.constraints.delegation.max_depth !== 0
  ) {
    throw new ValidationError(
      'Machine authority attenuation cannot enable delegation'
    );
  }

  if (predecessor.authority_digest === successor.authority_digest) {
    throw new ValidationError(
      'Machine authority narrow transition must strictly reduce authority'
    );
  }

  return Object.freeze(successor);
}

function assertSame(left, right, label) {
  if (left !== right) {
    throw new ValidationError(
      `Machine authority attenuation cannot change ${label}`
    );
  }
}

function assertSubset(successor, predecessor, label) {
  const allowed = new Set(predecessor);
  const widening = successor.find(value => !allowed.has(value));
  if (widening !== undefined) {
    throw new ValidationError(
      `Machine authority attenuation widens ${label}: ${widening}`
    );
  }
}

function assertBudgetsNotIncreased(predecessor, successor) {
  for (const key of BUDGET_KEYS) {
    if (successor[key] > predecessor[key]) {
      throw new ValidationError(
        `Machine authority attenuation cannot increase budget ${key}`
      );
    }
  }
}

function assertLifetimeClassUnchanged(predecessor, successor) {
  if (successor.lifetime !== predecessor.lifetime) {
    throw new ValidationError(
      'Machine authority attenuation cannot change lifetime class'
    );
  }
}

function assertExpiryNotExtended(predecessor, successor) {
  if (predecessor.lifetime === 'persistent') return;
  const predecessorExpiry = new Date(predecessor.expires_at).valueOf();
  const successorExpiry = new Date(successor.expires_at).valueOf();
  if (successorExpiry > predecessorExpiry) {
    throw new ValidationError(
      'Machine authority attenuation cannot extend expires_at'
    );
  }
}
