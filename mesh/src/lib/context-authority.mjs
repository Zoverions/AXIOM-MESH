import {
  AxiomError,
  ValidationError,
  assertString,
  canonicalJson,
  digestObject
} from './canonical.mjs';

export const CONTEXT_PROJECTION_AUTHORITY_SCHEMA =
  'axiom-context-projection-authority.v1';

const PRINCIPAL_ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/;
const PURPOSE = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/;
const CONTEXT_SCOPE = /^context:[A-Za-z0-9][A-Za-z0-9_.:-]{0,151}$/;
const AUTHORITY_DIGEST = /^[a-f0-9]{64}$/;
const AUTHORITY_ENVELOPE_MAX = 4_096;
const PURPOSE_BINDINGS = new Set([
  'machine-principal-constraint',
  'authenticated-request-selector'
]);
const SCOPE_MODES = new Set([
  'finite-authenticated-scopes',
  'authenticated-wildcard-to-finite-visible-scopes'
]);

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

export function normalizeContextProjectionAuthority(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new ValidationError('Context projection authority must be an object');
  }
  const allowed = new Set([
    'authority_digest',
    'context_scopes',
    'machine_authority_digest',
    'principal_id',
    'principal_type',
    'purpose',
    'purpose_binding',
    'schema',
    'scope_mode'
  ]);
  for (const key of Object.keys(raw)) {
    if (!allowed.has(key)) throw new ValidationError('Context projection authority fields are invalid');
  }
  if (raw.schema !== CONTEXT_PROJECTION_AUTHORITY_SCHEMA) {
    throw new ValidationError('Context projection authority schema is invalid');
  }
  const principalId = assertString(raw.principal_id, 'principal_id', {
    max: 160,
    pattern: PRINCIPAL_ID
  });
  const principalType = assertString(raw.principal_type, 'principal_type', { max: 32 });
  const purpose = assertString(raw.purpose, 'purpose', { max: 160, pattern: PURPOSE });
  if (!PURPOSE_BINDINGS.has(raw.purpose_binding)) {
    throw new ValidationError('Context projection purpose binding is invalid');
  }
  if (!SCOPE_MODES.has(raw.scope_mode)) {
    throw new ValidationError('Context projection scope mode is invalid');
  }
  if (!Array.isArray(raw.context_scopes) || raw.context_scopes.length > 64) {
    throw new ValidationError('Context projection scopes must contain at most 64 items');
  }
  const contextScopes = [];
  for (const scope of raw.context_scopes) {
    if (typeof scope !== 'string' || !CONTEXT_SCOPE.test(scope)) {
      throw new ValidationError('Context projection authority contains an invalid context scope');
    }
    contextScopes.push(scope);
  }
  if (new Set(contextScopes).size !== contextScopes.length) {
    throw new ValidationError('Context projection authority contains duplicate scopes');
  }
  contextScopes.sort();
  if (
    raw.scope_mode === 'finite-authenticated-scopes'
    && contextScopes.length < 1
  ) {
    throw new ValidationError('Finite context projection authority requires at least one scope');
  }
  if (
    raw.scope_mode === 'authenticated-wildcard-to-finite-visible-scopes'
    && contextScopes.length !== 0
  ) {
    throw new ValidationError('Wildcard context projection authority must not predeclare finite scopes');
  }
  let machineAuthorityDigest;
  if (raw.machine_authority_digest !== undefined) {
    machineAuthorityDigest = assertString(
      raw.machine_authority_digest,
      'machine_authority_digest',
      { min: 64, max: 64, pattern: AUTHORITY_DIGEST }
    );
  }
  if (
    raw.purpose_binding === 'machine-principal-constraint'
    && !machineAuthorityDigest
  ) {
    throw new ValidationError('Machine context authority requires its machine authority digest');
  }
  if (
    raw.purpose_binding !== 'machine-principal-constraint'
    && machineAuthorityDigest
  ) {
    throw new ValidationError('Human context authority cannot carry a machine authority digest');
  }

  const material = {
    schema: CONTEXT_PROJECTION_AUTHORITY_SCHEMA,
    principal_id: principalId,
    principal_type: principalType,
    purpose,
    purpose_binding: raw.purpose_binding,
    scope_mode: raw.scope_mode,
    context_scopes: contextScopes,
    ...(machineAuthorityDigest
      ? { machine_authority_digest: machineAuthorityDigest }
      : {})
  };
  const authorityDigest = assertString(raw.authority_digest, 'authority_digest', {
    min: 64,
    max: 64,
    pattern: AUTHORITY_DIGEST
  });
  if (authorityDigest !== digestObject(material)) {
    throw new ValidationError('Context projection authority digest is invalid');
  }
  return { ...material, authority_digest: authorityDigest };
}

export function encodeContextProjectionAuthority(authority) {
  const normalized = normalizeContextProjectionAuthority(authority);
  const encoded = Buffer.from(canonicalJson(normalized), 'utf8').toString('base64url');
  if (encoded.length > AUTHORITY_ENVELOPE_MAX) {
    throw new ValidationError('Context projection authority envelope exceeds 4096 characters');
  }
  return encoded;
}

export function decodeContextProjectionAuthority(encoded) {
  assertString(encoded, 'context authority envelope', {
    max: AUTHORITY_ENVELOPE_MAX,
    pattern: /^[A-Za-z0-9_-]+$/
  });
  let parsed;
  try {
    const serialized = Buffer.from(encoded, 'base64url').toString('utf8');
    if (Buffer.byteLength(serialized, 'utf8') > 3_072) {
      throw new Error('decoded envelope is too large');
    }
    parsed = JSON.parse(serialized);
  } catch {
    throw new ValidationError('Context projection authority envelope is invalid');
  }
  return normalizeContextProjectionAuthority(parsed);
}

export function finiteContextScopesForClaims(authority, claims) {
  const normalized = normalizeContextProjectionAuthority(authority);
  if (!Array.isArray(claims)) throw new ValidationError('Context claims must be an array');
  if (normalized.scope_mode === 'finite-authenticated-scopes') {
    return [...normalized.context_scopes];
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
