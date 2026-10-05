import {
  ValidationError,
  assertPlainObject,
  assertString,
  digestObject
} from './canonical.mjs';
import { ASSURANCE_TIER_IDS } from './assurance-tiers.mjs';

// This module validates attenuation-only delegation records and provenance.
// It does not grant execution authority, add a Gateway route, or change the
// depth-zero delegation rule enforced by axiom-machine-principal.v1.
export const DELEGATION_AUTHORITY_SCHEMA = 'axiom-delegation-authority.v1';
export const DELEGATION_GRANT_SCHEMA = 'axiom-delegation-grant.v1';
export const DELEGATION_REVOCATION_SCHEMA = 'axiom-delegation-revocation.v1';
export const DELEGATION_CHAIN_SCHEMA = 'axiom-delegation-chain-resolution.v1';

const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/;
const STABLE_ID = /^[a-z][a-z0-9_.:-]{0,159}$/;
const ACTION_ID = /^[a-z][a-z0-9.-]{1,127}$/;
const DESTINATION = /^[A-Za-z0-9][A-Za-z0-9_.:/-]{0,255}$/;
const SCOPE = /^[A-Za-z0-9][A-Za-z0-9_.:/-]{0,255}$/;
const DIGEST = /^[a-f0-9]{64}$/;
const MAX_DELEGATION_DEPTH = 16;
const MAX_REASON_LENGTH = 512;
const BUDGET_KEYS = Object.freeze([
  'max_requests_per_minute',
  'max_concurrent_requests',
  'max_execution_ms',
  'max_request_bytes',
  'max_response_bytes'
]);
const BUDGET_LIMITS = Object.freeze({
  max_requests_per_minute: 10_000,
  max_concurrent_requests: 128,
  max_execution_ms: 300_000,
  max_request_bytes: 10_485_760,
  max_response_bytes: 20_971_520
});

export function normalizeDelegationAuthority(raw) {
  const value = assertPlainObject(raw, 'delegation authority');
  assertExactKeys(value, [
    'schema',
    'holder',
    'actions',
    'purposes',
    'data_scopes',
    'destinations',
    'budgets',
    'required_assurance',
    'independent_approval_required',
    'delegation',
    'expires_at',
    ...(value.authority_digest !== undefined ? ['authority_digest'] : [])
  ], 'delegation authority');
  if (value.schema !== DELEGATION_AUTHORITY_SCHEMA) {
    throw new ValidationError('Delegation authority schema is unsupported');
  }

  const authority = {
    schema: DELEGATION_AUTHORITY_SCHEMA,
    holder: identifier(value.holder, 'delegation authority holder'),
    actions: stringSet(value.actions, 'delegation authority actions', {
      minItems: 1,
      maxItems: 128,
      maxLength: 128,
      pattern: ACTION_ID,
      rejectWildcard: true
    }),
    purposes: stringSet(value.purposes, 'delegation authority purposes', {
      minItems: 1,
      maxItems: 64,
      maxLength: 160,
      pattern: STABLE_ID,
      rejectWildcard: true
    }),
    data_scopes: stringSet(value.data_scopes ?? [], 'delegation authority data_scopes', {
      minItems: 0,
      maxItems: 128,
      maxLength: 256,
      pattern: SCOPE,
      rejectWildcard: true
    }),
    destinations: stringSet(value.destinations, 'delegation authority destinations', {
      minItems: 1,
      maxItems: 64,
      maxLength: 256,
      pattern: DESTINATION,
      rejectWildcard: true
    }),
    budgets: normalizeBudgets(value.budgets),
    required_assurance: normalizeAssurance(value.required_assurance),
    independent_approval_required: normalizeBoolean(
      value.independent_approval_required,
      'delegation authority independent_approval_required'
    ),
    delegation: normalizeDelegationPolicy(value.delegation),
    expires_at: normalizeTimestamp(value.expires_at, 'delegation authority expires_at')
  };
  const authorityDigest = digestObject(authority);
  if (value.authority_digest !== undefined) {
    const supplied = assertString(value.authority_digest, 'delegation authority authority_digest', {
      min: 64,
      max: 64,
      pattern: DIGEST
    });
    if (supplied !== authorityDigest) {
      throw new ValidationError('Delegation authority authority_digest does not match normalized authority');
    }
  }
  return { ...authority, authority_digest: authorityDigest };
}

export function normalizeDelegationGrant(raw) {
  const value = assertPlainObject(raw, 'delegation grant');
  assertExactKeys(value, [
    'schema',
    'id',
    'delegator',
    'delegate',
    'parent_grant_id',
    'issued_at',
    'authority',
    ...(value.grant_digest !== undefined ? ['grant_digest'] : [])
  ], 'delegation grant');
  if (value.schema !== DELEGATION_GRANT_SCHEMA) {
    throw new ValidationError('Delegation grant schema is unsupported');
  }

  const delegator = identifier(value.delegator, 'delegation grant delegator');
  const delegate = identifier(value.delegate, 'delegation grant delegate');
  if (delegator === delegate) {
    throw new ValidationError('Delegation grant cannot delegate to the delegator');
  }
  const authority = normalizeDelegationAuthority(value.authority);
  if (authority.holder !== delegate) {
    throw new ValidationError('Delegation grant authority holder must equal delegate');
  }
  const parentGrantId = value.parent_grant_id === null
    ? null
    : identifier(value.parent_grant_id, 'delegation grant parent_grant_id');
  const issuedAt = normalizeTimestamp(value.issued_at, 'delegation grant issued_at');
  if (new Date(issuedAt) >= new Date(authority.expires_at)) {
    throw new ValidationError('Delegation grant must be issued before delegated authority expires');
  }

  const grant = {
    schema: DELEGATION_GRANT_SCHEMA,
    id: identifier(value.id, 'delegation grant id'),
    delegator,
    delegate,
    parent_grant_id: parentGrantId,
    issued_at: issuedAt,
    authority
  };
  const grantDigest = digestObject(grant);
  if (value.grant_digest !== undefined) {
    const supplied = assertString(value.grant_digest, 'delegation grant grant_digest', {
      min: 64,
      max: 64,
      pattern: DIGEST
    });
    if (supplied !== grantDigest) {
      throw new ValidationError('Delegation grant grant_digest does not match normalized grant');
    }
  }
  return { ...grant, grant_digest: grantDigest };
}

export function normalizeDelegationRevocation(raw) {
  const value = assertPlainObject(raw, 'delegation revocation');
  assertExactKeys(value, [
    'schema',
    'id',
    'grant_id',
    'revoked_by',
    'revoked_at',
    'reason',
    ...(value.revocation_digest !== undefined ? ['revocation_digest'] : [])
  ], 'delegation revocation');
  if (value.schema !== DELEGATION_REVOCATION_SCHEMA) {
    throw new ValidationError('Delegation revocation schema is unsupported');
  }
  const revocation = {
    schema: DELEGATION_REVOCATION_SCHEMA,
    id: identifier(value.id, 'delegation revocation id'),
    grant_id: identifier(value.grant_id, 'delegation revocation grant_id'),
    revoked_by: identifier(value.revoked_by, 'delegation revocation revoked_by'),
    revoked_at: normalizeTimestamp(value.revoked_at, 'delegation revocation revoked_at'),
    reason: assertString(value.reason, 'delegation revocation reason', {
      max: MAX_REASON_LENGTH
    })
  };
  const revocationDigest = digestObject(revocation);
  if (value.revocation_digest !== undefined) {
    const supplied = assertString(value.revocation_digest, 'delegation revocation revocation_digest', {
      min: 64,
      max: 64,
      pattern: DIGEST
    });
    if (supplied !== revocationDigest) {
      throw new ValidationError('Delegation revocation revocation_digest does not match normalized revocation');
    }
  }
  return { ...revocation, revocation_digest: revocationDigest };
}

export function assertDelegationAttenuates(parentRaw, childRaw) {
  const parent = normalizeDelegationAuthority(parentRaw);
  const child = normalizeDelegationAuthority(childRaw);

  if (!parent.delegation.allowed || parent.delegation.max_depth < 1) {
    throw new ValidationError('Parent authority does not permit subdelegation');
  }
  assertSubset(parent.actions, child.actions, 'actions');
  assertSubset(parent.purposes, child.purposes, 'purposes');
  assertSubset(parent.data_scopes, child.data_scopes, 'data_scopes');
  assertSubset(parent.destinations, child.destinations, 'destinations');
  assertBudgetsAttenuate(parent.budgets, child.budgets);

  const parentAssuranceRank = ASSURANCE_TIER_IDS.indexOf(parent.required_assurance);
  const childAssuranceRank = ASSURANCE_TIER_IDS.indexOf(child.required_assurance);
  if (childAssuranceRank < parentAssuranceRank) {
    throw new ValidationError('Delegated authority cannot lower the required assurance floor');
  }
  if (parent.independent_approval_required && !child.independent_approval_required) {
    throw new ValidationError('Delegated authority cannot remove independent approval requirements');
  }
  if (new Date(child.expires_at) > new Date(parent.expires_at)) {
    throw new ValidationError('Delegated authority cannot outlive parent authority');
  }

  const remainingDepth = parent.delegation.max_depth - 1;
  if (child.delegation.max_depth > remainingDepth) {
    throw new ValidationError('Delegated authority exceeds parent delegation depth');
  }
  if (child.delegation.allowed && remainingDepth < 1) {
    throw new ValidationError('Delegated authority cannot preserve subdelegation beyond parent depth');
  }
  return child;
}

export function resolveDelegationChain({
  root_authority,
  grants,
  revocations = [],
  target_grant_id,
  now = new Date()
} = {}) {
  const root = normalizeDelegationAuthority(root_authority);
  const evaluationTime = normalizeDate(now, 'delegation evaluation time');
  if (new Date(root.expires_at) <= evaluationTime) {
    throw new ValidationError('Root delegation authority is expired');
  }
  if (!Array.isArray(grants) || grants.length < 1 || grants.length > 256) {
    throw new ValidationError('Delegation grants must contain 1-256 items');
  }
  if (!Array.isArray(revocations) || revocations.length > 256) {
    throw new ValidationError('Delegation revocations must contain at most 256 items');
  }

  const grantMap = new Map();
  for (const rawGrant of grants) {
    const grant = normalizeDelegationGrant(rawGrant);
    if (grantMap.has(grant.id)) {
      throw new ValidationError(`Duplicate delegation grant id: ${grant.id}`);
    }
    grantMap.set(grant.id, grant);
  }
  const targetGrantId = identifier(target_grant_id, 'delegation target_grant_id');
  if (!grantMap.has(targetGrantId)) {
    throw new ValidationError('Delegation target grant does not exist');
  }

  const revocationMap = new Map();
  const revocationIds = new Set();
  for (const rawRevocation of revocations) {
    const revocation = normalizeDelegationRevocation(rawRevocation);
    if (revocationIds.has(revocation.id)) {
      throw new ValidationError(`Duplicate delegation revocation id: ${revocation.id}`);
    }
    revocationIds.add(revocation.id);
    const target = grantMap.get(revocation.grant_id);
    if (!target) {
      throw new ValidationError('Delegation revocation references an unknown grant');
    }
    if (target.delegator !== revocation.revoked_by) {
      throw new ValidationError('Delegation revocation must be issued by the grant delegator');
    }
    if (new Date(revocation.revoked_at) < new Date(target.issued_at)) {
      throw new ValidationError('Delegation revocation cannot predate the grant');
    }
    const existing = revocationMap.get(revocation.grant_id);
    if (!existing || new Date(revocation.revoked_at) < new Date(existing.revoked_at)) {
      revocationMap.set(revocation.grant_id, revocation);
    }
  }

  const visiting = new Set();
  const resolved = new Map();

  function resolve(grantId) {
    if (resolved.has(grantId)) return resolved.get(grantId);
    if (visiting.has(grantId)) {
      throw new ValidationError('Delegation graph contains a cycle');
    }
    visiting.add(grantId);
    const grant = grantMap.get(grantId);
    let parentAuthority;
    let parentIssuedAt = null;
    let parentChain = [];

    if (grant.parent_grant_id === null) {
      if (grant.delegator !== root.holder) {
        throw new ValidationError('Root delegation grant delegator must equal root authority holder');
      }
      parentAuthority = root;
    } else {
      const parentGrant = grantMap.get(grant.parent_grant_id);
      if (!parentGrant) {
        throw new ValidationError('Delegation grant references an unknown parent grant');
      }
      const parentResolution = resolve(parentGrant.id);
      if (grant.delegator !== parentGrant.delegate) {
        throw new ValidationError('Delegation grant delegator must equal parent delegate');
      }
      parentAuthority = parentResolution.effective_authority;
      parentIssuedAt = parentGrant.issued_at;
      parentChain = parentResolution.chain;
    }

    if (parentIssuedAt !== null && new Date(grant.issued_at) < new Date(parentIssuedAt)) {
      throw new ValidationError('Delegation grant cannot predate its parent grant');
    }
    if (new Date(grant.issued_at) > evaluationTime) {
      throw new ValidationError('Delegation grant is not active yet');
    }
    if (new Date(grant.authority.expires_at) <= evaluationTime) {
      throw new ValidationError('Delegation grant authority is expired');
    }
    const activeRevocation = revocationMap.get(grant.id);
    if (activeRevocation && new Date(activeRevocation.revoked_at) <= evaluationTime) {
      throw new ValidationError('Delegation grant is revoked');
    }

    const effectiveAuthority = assertDelegationAttenuates(parentAuthority, grant.authority);
    const chainEntry = {
      grant_id: grant.id,
      delegator: grant.delegator,
      delegate: grant.delegate,
      grant_digest: grant.grant_digest,
      authority_digest: effectiveAuthority.authority_digest
    };
    const resolution = {
      effective_authority: effectiveAuthority,
      chain: [...parentChain, chainEntry]
    };
    visiting.delete(grantId);
    resolved.set(grantId, resolution);
    return resolution;
  }

  const target = resolve(targetGrantId);
  const resolutionCore = {
    schema: DELEGATION_CHAIN_SCHEMA,
    target_grant_id: targetGrantId,
    root_holder: root.holder,
    root_authority_digest: root.authority_digest,
    evaluated_at: evaluationTime.toISOString(),
    chain: target.chain,
    effective_authority: target.effective_authority,
    execution_authority_granted: false
  };
  return {
    ...resolutionCore,
    chain_digest: digestObject(resolutionCore)
  };
}

function normalizeBudgets(raw) {
  const value = assertPlainObject(raw, 'delegation authority budgets');
  assertExactKeys(value, BUDGET_KEYS, 'delegation authority budgets');
  const budgets = {};
  for (const key of BUDGET_KEYS) {
    const amount = value[key];
    if (!Number.isSafeInteger(amount) || amount < 1 || amount > BUDGET_LIMITS[key]) {
      throw new ValidationError(
        `Delegation authority ${key} must be an integer between 1 and ${BUDGET_LIMITS[key]}`
      );
    }
    budgets[key] = amount;
  }
  return budgets;
}

function normalizeDelegationPolicy(raw) {
  const value = assertPlainObject(raw, 'delegation authority delegation');
  assertExactKeys(value, ['allowed', 'max_depth'], 'delegation authority delegation');
  const allowed = normalizeBoolean(value.allowed, 'delegation authority delegation allowed');
  const maxDepth = value.max_depth;
  if (!Number.isSafeInteger(maxDepth) || maxDepth < 0 || maxDepth > MAX_DELEGATION_DEPTH) {
    throw new ValidationError(`Delegation max_depth must be an integer between 0 and ${MAX_DELEGATION_DEPTH}`);
  }
  if (allowed !== (maxDepth > 0)) {
    throw new ValidationError('Delegation allowed must be true exactly when max_depth is greater than zero');
  }
  return { allowed, max_depth: maxDepth };
}

function normalizeAssurance(value) {
  if (!ASSURANCE_TIER_IDS.includes(value)) {
    throw new ValidationError(`Delegation authority required_assurance must be one of ${ASSURANCE_TIER_IDS.join(', ')}`);
  }
  return value;
}

function normalizeBoolean(value, label) {
  if (typeof value !== 'boolean') throw new ValidationError(`${label} must be a boolean`);
  return value;
}

function normalizeTimestamp(value, label) {
  const text = assertString(value, label, { max: 64 });
  const date = new Date(text);
  if (Number.isNaN(date.valueOf())) throw new ValidationError(`${label} must be an ISO timestamp`);
  return date.toISOString();
}

function normalizeDate(value, label) {
  const date = value instanceof Date ? new Date(value.valueOf()) : new Date(value);
  if (Number.isNaN(date.valueOf())) throw new ValidationError(`${label} must be a valid date`);
  return date;
}

function identifier(value, label) {
  return assertString(value, label, { max: 160, pattern: IDENTIFIER });
}

function stringSet(value, label, {
  minItems,
  maxItems,
  maxLength,
  pattern,
  rejectWildcard = false
}) {
  if (!Array.isArray(value) || value.length < minItems || value.length > maxItems) {
    throw new ValidationError(`${label} must contain ${minItems}-${maxItems} items`);
  }
  const normalized = [];
  for (const item of value) {
    if (typeof item !== 'string' || !item.length || item.length > maxLength || !pattern.test(item)) {
      throw new ValidationError(`${label} contains an invalid value`);
    }
    if (rejectWildcard && item.includes('*')) {
      throw new ValidationError(`${label} cannot contain wildcard authority`);
    }
    normalized.push(item);
  }
  return [...new Set(normalized)].sort();
}

function assertSubset(parent, child, label) {
  const allowed = new Set(parent);
  for (const value of child) {
    if (!allowed.has(value)) {
      throw new ValidationError(`Delegated authority expands ${label}: ${value}`);
    }
  }
}

function assertBudgetsAttenuate(parent, child) {
  for (const key of BUDGET_KEYS) {
    if (child[key] > parent[key]) {
      throw new ValidationError(`Delegated authority expands budget ${key}`);
    }
  }
}

function assertExactKeys(value, expected, label) {
  const allowed = new Set(expected);
  const actual = Object.keys(value);
  for (const key of actual) {
    if (!allowed.has(key)) throw new ValidationError(`${label} contains unsupported field: ${key}`);
  }
  for (const key of expected) {
    if (!Object.hasOwn(value, key)) throw new ValidationError(`${label} is missing required field: ${key}`);
  }
}
