import { ValidationError, assertString } from '../lib/canonical.mjs';
import { buildContextProjectionGridTarget } from '../lib/context-projection-target.mjs';

const PRINCIPAL_ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/;
const PURPOSE = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/;
const ALLOWED_QUERY = new Set(['owner', 'purpose', 'as_of', 'max_claims']);

export function buildGatewayContextProjection({
  gridUrl,
  principal,
  url,
  now = new Date().toISOString()
}) {
  if (!(url instanceof URL)) throw new ValidationError('Context request URL is invalid');
  for (const key of url.searchParams.keys()) {
    if (!ALLOWED_QUERY.has(key)) {
      throw new ValidationError(`Unsupported context query parameter: ${key}`);
    }
  }
  const purpose = assertString(url.searchParams.get('purpose'), 'purpose', {
    max: 160,
    pattern: PURPOSE
  });
  const owner = url.searchParams.get('owner') ?? principal?.id;
  assertString(owner, 'owner', { max: 160, pattern: PRINCIPAL_ID });
  const asOf = url.searchParams.get('as_of') ?? now;
  const maxClaims = integerQuery(url.searchParams.get('max_claims'), 64, {
    label: 'max_claims',
    min: 1,
    max: 256
  });
  return buildContextProjectionGridTarget({
    gridUrl,
    principal,
    owner,
    purpose,
    asOf,
    maxClaims
  });
}

function integerQuery(value, fallback, { label, min, max }) {
  if (value === null || value === '') return fallback;
  if (!/^(0|[1-9][0-9]*)$/.test(value)) {
    throw new ValidationError(`${label} must be an integer between ${min} and ${max}`);
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < min || parsed > max) {
    throw new ValidationError(`${label} must be an integer between ${min} and ${max}`);
  }
  return parsed;
}
