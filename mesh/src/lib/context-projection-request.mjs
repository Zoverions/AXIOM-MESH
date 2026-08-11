import {
  ValidationError,
  assertPlainObject,
  assertString,
  canonicalJson,
  digestObject
} from './canonical.mjs';
import { deriveContextProjectionAuthority } from './context-authority.mjs';

export const CONTEXT_PROJECTION_REQUEST_SCHEMA =
  'axiom-context-projection-request.v1';

const PRINCIPAL_ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/;
const PURPOSE = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/;
const EXACT_FIELDS = Object.freeze([
  'as_of',
  'max_claims',
  'owner',
  'principal',
  'purpose',
  'schema'
]);

export function buildContextProjectionRequest({
  principal,
  owner = principal?.id,
  purpose,
  asOf = new Date().toISOString(),
  maxClaims = 64
}) {
  const authority = deriveContextProjectionAuthority(principal, { purpose });
  const request = normalizeContextProjectionRequest({
    schema: CONTEXT_PROJECTION_REQUEST_SCHEMA,
    principal,
    owner,
    purpose: authority.purpose,
    as_of: asOf,
    max_claims: maxClaims
  });
  if (request.principal.id !== authority.principal_id) {
    throw new ValidationError('Context projection principal binding failed');
  }
  return {
    request,
    request_digest: digestObject(request),
    authority_digest: authority.authority_digest
  };
}

export function normalizeContextProjectionRequest(raw) {
  assertPlainObject(raw, 'context projection request');
  if (canonicalJson(Object.keys(raw).sort()) !== canonicalJson([...EXACT_FIELDS].sort())) {
    throw new ValidationError('Context projection request fields are invalid');
  }
  if (raw.schema !== CONTEXT_PROJECTION_REQUEST_SCHEMA) {
    throw new ValidationError(
      `Context projection request schema must be ${CONTEXT_PROJECTION_REQUEST_SCHEMA}`
    );
  }
  const principal = structuredClone(assertPlainObject(raw.principal, 'principal'));
  const principalId = assertString(principal.id, 'principal.id', {
    max: 160,
    pattern: PRINCIPAL_ID
  });
  const owner = assertString(raw.owner, 'owner', {
    max: 160,
    pattern: PRINCIPAL_ID
  });
  const purpose = assertString(raw.purpose, 'purpose', {
    max: 160,
    pattern: PURPOSE
  });
  const asOf = normalizeTimestamp(raw.as_of, 'as_of');
  if (!Number.isSafeInteger(raw.max_claims) || raw.max_claims < 1 || raw.max_claims > 256) {
    throw new ValidationError('max_claims must be an integer between 1 and 256');
  }

  // Re-derive authority at the receiving boundary. This validates machine
  // purpose constraints and ensures the request cannot introduce scope fields.
  const authority = deriveContextProjectionAuthority(principal, { purpose });
  if (authority.principal_id !== principalId) {
    throw new ValidationError('Context projection principal authority is inconsistent');
  }

  return {
    schema: CONTEXT_PROJECTION_REQUEST_SCHEMA,
    principal,
    owner,
    purpose,
    as_of: asOf,
    max_claims: raw.max_claims
  };
}

function normalizeTimestamp(value, name) {
  assertString(value, name, { max: 64 });
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) throw new ValidationError(`${name} must be an ISO timestamp`);
  return new Date(timestamp).toISOString();
}
