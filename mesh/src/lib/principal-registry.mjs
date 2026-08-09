import { ValidationError, sha256 } from './canonical.mjs';
import { normalizeMachinePrincipalDefinition } from './machine-principal.mjs';

const PRINCIPAL_ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/;
const BASIC_TYPES = new Set(['human', 'service']);
const MACHINE_FIELDS = new Set([
  'sponsor',
  'lifetime',
  'expires_at',
  'runtime',
  'constraints'
]);

/**
 * Normalize the bearer-token principal registry.
 *
 * Compatibility rule:
 * - humans retain the existing id/type/roles/scopes contract;
 * - infrastructure services retain the existing contract when they do not
 *   declare machine-authority fields;
 * - agents MUST use axiom-machine-principal.v1;
 * - services MAY opt into axiom-machine-principal.v1 by declaring any
 *   machine-authority field.
 */
export function normalizeApiPrincipalRegistry(entries, { now = new Date() } = {}) {
  if (!entries || typeof entries !== 'object' || Array.isArray(entries)) {
    throw new ValidationError('API token registry must be an object');
  }

  const rawEntries = Object.entries(entries);
  const humanIds = new Set();
  for (const [, raw] of rawEntries) {
    if (raw?.type === 'human' || raw?.type === undefined) {
      if (typeof raw?.id === 'string' && PRINCIPAL_ID.test(raw.id)) humanIds.add(raw.id);
    }
  }

  const principals = new Map();
  const principalIds = new Set();
  for (const [token, rawPrincipal] of rawEntries) {
    validateToken(token);
    if (!rawPrincipal || typeof rawPrincipal !== 'object' || Array.isArray(rawPrincipal)) {
      throw new ValidationError('Each API token must map to a principal object');
    }

    const type = rawPrincipal.type ?? 'human';
    let principal;
    if (type === 'agent' || (type === 'service' && declaresMachineAuthority(rawPrincipal))) {
      principal = normalizeMachinePrincipalDefinition({
        ...rawPrincipal,
        type
      }, {
        knownHumanPrincipals: humanIds,
        now
      });
    } else {
      if (!BASIC_TYPES.has(type)) {
        throw new ValidationError(
          'API principal type must be human, agent, or service'
        );
      }
      principal = normalizeBasicPrincipal(rawPrincipal, type);
    }

    if (principalIds.has(principal.id)) {
      throw new ValidationError(`Duplicate API principal id: ${principal.id}`);
    }
    principalIds.add(principal.id);
    principals.set(sha256(token), principal);
  }

  if (!principals.size) throw new ValidationError('At least one API principal is required');
  return principals;
}

export function declaresMachineAuthority(principal) {
  return [...MACHINE_FIELDS].some(field => Object.hasOwn(principal, field));
}

function normalizeBasicPrincipal(principal, type) {
  if (
    typeof principal.id !== 'string'
    || !PRINCIPAL_ID.test(principal.id)
    || !Array.isArray(principal.roles ?? [])
    || !Array.isArray(principal.scopes)
    || (principal.roles ?? []).some(value => typeof value !== 'string' || value.length > 64)
    || principal.scopes.some(value => typeof value !== 'string' || value.length > 160)
  ) {
    throw new ValidationError(
      'Each API token must map to a valid principal, type, roles, and scopes'
    );
  }
  if (type === 'human' && declaresMachineAuthority(principal)) {
    throw new ValidationError('Human API principals cannot declare machine-authority fields');
  }
  return {
    id: principal.id,
    type,
    roles: [...new Set(principal.roles ?? [])].sort(),
    scopes: [...new Set(principal.scopes)].sort()
  };
}

function validateToken(token) {
  if (typeof token !== 'string' || token.length < 32 || token.length > 512) {
    throw new ValidationError('API tokens must contain 32-512 characters');
  }
}
