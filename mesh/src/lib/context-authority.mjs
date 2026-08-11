import {
  AxiomError,
  ValidationError,
  assertString,
  digestObject
} from './canonical.mjs';

export const CONTEXT_PROJECTION_AUTHORITY_SCHEMA =
  'axiom-context-projection-authority.v1';

const PRINCIPAL_ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/;
const PURPOSE = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/;
const CONTEXT_SCOPE = /^context:[A-Za-z0-9][A-Za-z0-9_.:-]{0,151}$/;

export function deriveContextProjectionAuthority(principal, { purpose } = {}) {
  if (!principal || typeof principal !== 'object' || Array.isArray(principal)) {
    throw new ValidationError('Authenticated context principal must be an object');
  }
  const principalId = assertString(principal.id, 'principal.id', {
    max: 160,
    pattern: PRINCIPAL_ID
  });
  const normalizedPurpose = assertString(purpose, 'purpose', {
    max: 160,
    pattern: PURPOSE
  });
  if (!Array.isArray(principal.scopes)) {
    throw new ValidationError('Authenticated context principal scopes must be an array');
  }
  const scopes = [...new Set(principal.scopes)].sort();
  for (const scope of scopes) {
    if (typeof scope !== 'string' || !scope.length || scope.length > 160) {
      throw new ValidationError('Authenticated context principal contains an invalid scope');
    }
  }

  const machine = principal.schema === 'axiom-machine-principal.v1';
  if (machine) {
    if (scopes.some(scope => scope.includes('*'))) {
      throw new ValidationError('Machine context authority cannot contain wildcard scopes');
    }
    if (!Array.isArray(principal.constraints?.purposes)
      || !principal.constraints.purposes.includes(normalizedPurpose)) {
      throw new AxiomError(
        'machine_purpose_denied',
        'Machine principal is not constrained for this context purpose',
        403
      );
    }
  }

  const wildcard = scopes.includes('*');
  const contextScopes = scopes.filter(scope => CONTEXT_SCOPE.test(scope));
  if (!wildcard && !contextScopes.length) {
    throw new AxiomError(
      'forbidden',
      'An authenticated context:* scope is required for context projection',
      403
    );
  }

  const material = {
    schema: CONTEXT_PROJECTION_AUTHORITY_SCHEMA,
    principal_id: principalId,
    principal_type: principal.type ?? 'human',
    purpose: normalizedPurpose,
    purpose_binding: machine ? 'machine-principal-constraint' : 'authenticated-request-selector',
    scope_mode: wildcard ? 'authenticated-wildcard-to-finite-visible-scopes' : 'finite-authenticated-scopes',
    context_scopes: contextScopes,
    ...(machine && typeof principal.authority_digest === 'string'
      ? { machine_authority_digest: principal.authority_digest }
      : {})
  };

  return {
    ...material,
    authority_digest: digestObject(material)
  };
}

export function finiteContextScopesForClaims(authority, claims) {
  if (!authority || authority.schema !== CONTEXT_PROJECTION_AUTHORITY_SCHEMA) {
    throw new ValidationError('Context projection authority is invalid');
  }
  if (!Array.isArray(claims)) throw new ValidationError('Context claims must be an array');
  if (authority.scope_mode === 'finite-authenticated-scopes') {
    return [...authority.context_scopes];
  }
  if (authority.scope_mode !== 'authenticated-wildcard-to-finite-visible-scopes') {
    throw new ValidationError('Context projection scope mode is invalid');
  }
  const visibleScopes = new Set();
  for (const claim of claims) {
    const scopes = claim?.disclosure?.scopes;
    if (!Array.isArray(scopes)) throw new ValidationError('Visible context claim disclosure is invalid');
    for (const scope of scopes) {
      if (!CONTEXT_SCOPE.test(scope)) {
        throw new ValidationError('Visible context claim contains a non-context disclosure scope');
      }
      visibleScopes.add(scope);
    }
  }
  return [...visibleScopes].sort();
}
