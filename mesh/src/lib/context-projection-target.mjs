import {
  ValidationError,
  assertString
} from './canonical.mjs';
import {
  decodeContextProjectionAuthority,
  deriveContextProjectionAuthority,
  encodeContextProjectionAuthority
} from './context-authority.mjs';

const PRINCIPAL_ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/;

export function buildContextProjectionGridTarget({
  gridUrl,
  principal,
  owner = principal?.id,
  purpose,
  asOf = new Date().toISOString(),
  maxClaims = 64
}) {
  const authority = deriveContextProjectionAuthority(principal, { purpose });
  const normalizedOwner = assertString(owner, 'owner', {
    max: 160,
    pattern: PRINCIPAL_ID
  });
  const normalizedAsOf = normalizeTimestamp(asOf, 'asOf');
  if (!Number.isSafeInteger(maxClaims) || maxClaims < 1 || maxClaims > 256) {
    throw new ValidationError('maxClaims must be an integer between 1 and 256');
  }
  const query = new URLSearchParams({
    requester: authority.principal_id,
    projection: 'context',
    authority: encodeContextProjectionAuthority(authority),
    as_of: normalizedAsOf,
    max_claims: String(maxClaims)
  });
  const target = `${String(gridUrl).replace(/\/$/, '')}`
    + `/internal/v1/memory/${encodeURIComponent(normalizedOwner)}?${query}`;
  if (target.length > 8_192) {
    throw new ValidationError('Context projection Grid target exceeds 8192 characters');
  }
  return {
    target,
    authority,
    owner: normalizedOwner,
    as_of: normalizedAsOf,
    max_claims: maxClaims
  };
}

export function parseContextProjectionMemoryQuery(url, { owner } = {}) {
  if (!(url instanceof URL)) throw new ValidationError('Context projection URL is invalid');
  if (url.searchParams.get('projection') !== 'context') {
    throw new ValidationError('Context projection mode is invalid');
  }
  const normalizedOwner = assertString(owner, 'owner', {
    max: 160,
    pattern: PRINCIPAL_ID
  });
  const requester = assertString(url.searchParams.get('requester'), 'requester', {
    max: 160,
    pattern: PRINCIPAL_ID
  });
  const authority = decodeContextProjectionAuthority(
    url.searchParams.get('authority')
  );
  if (authority.principal_id !== requester) {
    throw new ValidationError('Context projection requester does not match signed authority');
  }
  const asOf = normalizeTimestamp(url.searchParams.get('as_of'), 'as_of');
  const maxClaims = integerQuery(url.searchParams.get('max_claims'), {
    label: 'max_claims',
    min: 1,
    max: 256
  });
  const allowed = new Set([
    'requester',
    'projection',
    'authority',
    'as_of',
    'max_claims'
  ]);
  for (const key of url.searchParams.keys()) {
    if (!allowed.has(key)) {
      throw new ValidationError(`Unsupported context projection query parameter: ${key}`);
    }
  }
  return {
    owner: normalizedOwner,
    requester,
    authority,
    as_of: asOf,
    max_claims: maxClaims
  };
}

function normalizeTimestamp(value, name) {
  assertString(value, name, { max: 64 });
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) throw new ValidationError(`${name} must be an ISO timestamp`);
  return new Date(timestamp).toISOString();
}

function integerQuery(value, { label, min, max }) {
  if (typeof value !== 'string' || !/^(0|[1-9][0-9]*)$/.test(value)) {
    throw new ValidationError(`${label} must be an integer between ${min} and ${max}`);
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < min || parsed > max) {
    throw new ValidationError(`${label} must be an integer between ${min} and ${max}`);
  }
  return parsed;
}
