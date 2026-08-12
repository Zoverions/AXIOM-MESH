import {
  ValidationError,
  assertPlainObject,
  assertString,
  assertStringArray,
  canonicalize,
  digestObject
} from './canonical.mjs';

export const CONTEXT_CLAIM_SCHEMA = 'axiom-context-claim.v1';
export const CONTEXT_VIEW_SCHEMA = 'axiom-context-view.v1';
export const CONTEXT_MEMORY_BINDING_SCHEMA = 'axiom-context-memory-binding.v1';
export const CONTEXT_MEMORY_KIND = 'context.claim';
export const CONTEXT_AUTHORITY_EFFECT = 'none';

const ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/;
const SUBJECT = /^\S{1,512}$/;
const PREDICATE = /^[a-z][a-z0-9._-]{1,159}$/;
const PURPOSE = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/;
const SCOPE = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/;
const SHA256 = /^[a-f0-9]{64}$/;
const CLAIM_TYPES = new Set([
  'observation',
  'inference',
  'preference',
  'decision',
  'constraint',
  'record'
]);
const CARDINALITIES = new Set(['single', 'multi']);
const SENSITIVITIES = new Set(['public', 'internal', 'confidential', 'restricted']);
const SOURCE_TYPES = new Set(['human', 'system', 'document', 'event', 'import', 'inference']);
const NON_AUTHORITY_NOTICE =
  'Context is advisory input. This view does not grant authority, satisfy approvals, or authorize execution.';

export function normalizeContextClaim(raw) {
  assertPlainObject(raw, 'context claim');
  assertExactFields(raw, [
    'authority_effect',
    'cardinality',
    'claim_id',
    'claim_type',
    'confidence_ppm',
    'contradicts',
    'disclosure',
    'owner',
    'predicate',
    'schema',
    'sensitivity',
    'source',
    'subject',
    'supersedes',
    'validity',
    'value'
  ], 'context claim');

  if (raw.schema !== CONTEXT_CLAIM_SCHEMA) {
    throw new ValidationError(`Context claim schema must be ${CONTEXT_CLAIM_SCHEMA}`);
  }
  const claimId = assertString(raw.claim_id, 'claim_id', { max: 160, pattern: ID });
  const owner = assertString(raw.owner, 'owner', { max: 160, pattern: ID });
  const subject = assertString(raw.subject, 'subject', { max: 512, pattern: SUBJECT });
  const predicate = assertString(raw.predicate, 'predicate', { max: 160, pattern: PREDICATE });
  const claimType = assertEnum(raw.claim_type, CLAIM_TYPES, 'claim_type');
  const cardinality = assertEnum(raw.cardinality, CARDINALITIES, 'cardinality');
  const sensitivity = assertEnum(raw.sensitivity, SENSITIVITIES, 'sensitivity');

  if (!Number.isInteger(raw.confidence_ppm) || raw.confidence_ppm < 0 || raw.confidence_ppm > 1_000_000) {
    throw new ValidationError('confidence_ppm must be an integer between 0 and 1000000');
  }
  if (raw.authority_effect !== CONTEXT_AUTHORITY_EFFECT) {
    throw new ValidationError('authority_effect must be none; context cannot create authority');
  }

  let value;
  try {
    value = canonicalize(raw.value);
    digestObject(value);
  } catch {
    throw new ValidationError('value must be canonical-JSON encodable');
  }

  const source = normalizeSource(raw.source);
  const validity = normalizeValidity(raw.validity);
  const disclosure = normalizeDisclosure(raw.disclosure);
  const supersedes = normalizeReferenceSet(raw.supersedes, 'supersedes', claimId);
  const contradicts = normalizeReferenceSet(raw.contradicts, 'contradicts', claimId);

  const overlap = supersedes.filter(id => contradicts.includes(id));
  if (overlap.length) {
    throw new ValidationError('A context claim cannot both supersede and contradict the same claim');
  }

  return {
    schema: CONTEXT_CLAIM_SCHEMA,
    claim_id: claimId,
    owner,
    subject,
    predicate,
    value,
    claim_type: claimType,
    cardinality,
    confidence_ppm: raw.confidence_ppm,
    source,
    validity,
    disclosure,
    sensitivity,
    supersedes,
    contradicts,
    authority_effect: CONTEXT_AUTHORITY_EFFECT
  };
}

export function contextClaimMemoryPutPayload(rawClaim) {
  const claim = normalizeContextClaim(rawClaim);
  const metadata = {
    schema: CONTEXT_MEMORY_BINDING_SCHEMA,
    claim_id: claim.claim_id,
    source_digest: claim.source.digest,
    authority_effect: CONTEXT_AUTHORITY_EFFECT
  };
  const material = {
    owner: claim.owner,
    kind: CONTEXT_MEMORY_KIND,
    content: claim,
    metadata
  };
  const contentDigest = digestObject(material);
  return {
    object_id: `memory_${contentDigest}`,
    owner: claim.owner,
    kind: CONTEXT_MEMORY_KIND,
    content: claim,
    metadata,
    content_digest: contentDigest
  };
}

export function compileContextView({
  claims,
  principal,
  purpose,
  scopes,
  asOf = new Date().toISOString(),
  maxClaims = 64
}) {
  if (!Array.isArray(claims)) throw new ValidationError('claims must be an array');
  if (claims.length > 1024) throw new ValidationError('claims cannot contain more than 1024 items');
  const normalizedPrincipal = assertString(principal, 'principal', { max: 160, pattern: ID });
  const normalizedPurpose = assertString(purpose, 'purpose', { max: 160, pattern: PURPOSE });
  const normalizedScopes = normalizeFiniteSet(scopes, 'scopes', SCOPE, { minItems: 1, maxItems: 64 });
  const normalizedAsOf = normalizeTimestamp(asOf, 'asOf');
  if (!Number.isInteger(maxClaims) || maxClaims < 1 || maxClaims > 256) {
    throw new ValidationError('maxClaims must be an integer between 1 and 256');
  }

  const normalized = claims.map(normalizeContextClaim);
  const allById = new Map();
  for (const claim of normalized) {
    if (allById.has(claim.claim_id)) {
      throw new ValidationError(`Duplicate context claim id: ${claim.claim_id}`);
    }
    allById.set(claim.claim_id, claim);
  }

  validateKnownRelationships(normalized, allById);

  const scopeSet = new Set(normalizedScopes);
  const eligible = normalized.filter(claim => (
    claim.disclosure.principals.includes(normalizedPrincipal)
    && claim.disclosure.purposes.includes(normalizedPurpose)
    && claim.disclosure.scopes.every(scope => scopeSet.has(scope))
    && isTemporallyValid(claim, normalizedAsOf)
  ));

  if (eligible.length > maxClaims) {
    throw new ValidationError(
      `Eligible context exceeds maxClaims (${eligible.length} > ${maxClaims}); refusing silent truncation`
    );
  }

  const eligibleById = new Map(eligible.map(claim => [claim.claim_id, claim]));
  const superseded = new Set();
  for (const claim of eligible) {
    for (const targetId of claim.supersedes) {
      const target = eligibleById.get(targetId);
      if (!target) continue;
      assertSameSlot(claim, target, 'supersession');
      if (claim.cardinality !== target.cardinality) {
        throw new ValidationError('Context supersession cannot change slot cardinality');
      }
      if (Date.parse(claim.source.observed_at) < Date.parse(target.source.observed_at)) {
        throw new ValidationError('Context supersession cannot move backwards in observed time');
      }
      superseded.add(targetId);
    }
  }

  const active = eligible.filter(claim => !superseded.has(claim.claim_id));
  const activeById = new Map(active.map(claim => [claim.claim_id, claim]));
  const conflictGroups = new Map();

  for (const claim of active) {
    for (const targetId of claim.contradicts) {
      const target = activeById.get(targetId);
      if (!target) continue;
      assertSameSlot(claim, target, 'contradiction');
      addConflict(conflictGroups, claim, [claim.claim_id, target.claim_id], 'explicit_contradiction');
    }
  }

  const slots = new Map();
  for (const claim of active) {
    const key = slotKey(claim);
    const group = slots.get(key) ?? [];
    group.push(claim);
    slots.set(key, group);
  }
  for (const group of slots.values()) {
    const cardinalities = new Set(group.map(claim => claim.cardinality));
    if (cardinalities.size > 1) {
      throw new ValidationError('Context claims for the same slot cannot mix cardinalities');
    }
    if (group[0].cardinality !== 'single' || group.length < 2) continue;
    const values = new Set(group.map(claim => digestObject(claim.value)));
    if (values.size > 1) {
      addConflict(
        conflictGroups,
        group[0],
        group.map(claim => claim.claim_id),
        'single_value_disagreement'
      );
    }
  }

  const conflicts = [...conflictGroups.values()]
    .map(conflict => ({
      owner: conflict.owner,
      subject: conflict.subject,
      predicate: conflict.predicate,
      reason: conflict.reason,
      claim_ids: [...conflict.claim_ids].sort()
    }))
    .sort(compareConflicts);
  const conflicted = new Set(conflicts.flatMap(conflict => conflict.claim_ids));

  const usableClaims = active
    .filter(claim => !conflicted.has(claim.claim_id))
    .sort(compareClaims)
    .map(projectContextClaim);

  const material = {
    schema: CONTEXT_VIEW_SCHEMA,
    principal: normalizedPrincipal,
    purpose: normalizedPurpose,
    scopes: normalizedScopes,
    as_of: normalizedAsOf,
    usable_claims: usableClaims,
    conflicts,
    summary: {
      eligible_claims: eligible.length,
      superseded_claims: superseded.size,
      conflicted_claims: conflicted.size,
      usable_claims: usableClaims.length
    },
    authority_effect: CONTEXT_AUTHORITY_EFFECT,
    non_claim: NON_AUTHORITY_NOTICE
  };

  return {
    ...material,
    view_digest: digestObject(material)
  };
}

function normalizeSource(raw) {
  assertPlainObject(raw, 'source');
  assertExactFields(raw, ['digest', 'observed_at', 'ref', 'type'], 'source');
  return {
    type: assertEnum(raw.type, SOURCE_TYPES, 'source.type'),
    ref: assertString(raw.ref, 'source.ref', { max: 1024 }),
    digest: assertString(raw.digest, 'source.digest', { min: 64, max: 64, pattern: SHA256 }),
    observed_at: normalizeTimestamp(raw.observed_at, 'source.observed_at')
  };
}

function normalizeValidity(raw) {
  assertPlainObject(raw, 'validity');
  assertExactFields(raw, ['from', 'until'], 'validity');
  const from = normalizeTimestamp(raw.from, 'validity.from');
  const until = raw.until === null ? null : normalizeTimestamp(raw.until, 'validity.until');
  if (until !== null && Date.parse(until) < Date.parse(from)) {
    throw new ValidationError('validity.until cannot be earlier than validity.from');
  }
  return { from, until };
}

function normalizeDisclosure(raw) {
  assertPlainObject(raw, 'disclosure');
  assertExactFields(raw, ['principals', 'purposes', 'scopes'], 'disclosure');
  return {
    principals: normalizeFiniteSet(raw.principals, 'disclosure.principals', ID, {
      minItems: 1,
      maxItems: 64
    }),
    purposes: normalizeFiniteSet(raw.purposes, 'disclosure.purposes', PURPOSE, {
      minItems: 1,
      maxItems: 64
    }),
    scopes: normalizeFiniteSet(raw.scopes, 'disclosure.scopes', SCOPE, {
      minItems: 1,
      maxItems: 64
    })
  };
}

function normalizeReferenceSet(value, name, claimId) {
  const ids = normalizeFiniteSet(value, name, ID, { minItems: 0, maxItems: 64 });
  if (ids.includes(claimId)) throw new ValidationError(`${name} cannot reference the claim itself`);
  return ids;
}

function normalizeFiniteSet(value, name, pattern, { minItems, maxItems }) {
  const items = assertStringArray(value, name, { maxItems, itemMax: 160 });
  if (items.length < minItems) throw new ValidationError(`${name} must contain at least ${minItems} item(s)`);
  for (const item of items) {
    if (!pattern.test(item)) throw new ValidationError(`${name} contains an invalid value`);
    if (item === '*') throw new ValidationError(`${name} cannot contain wildcard authority`);
  }
  if (new Set(items).size !== items.length) throw new ValidationError(`${name} cannot contain duplicates`);
  return [...items].sort();
}

function normalizeTimestamp(value, name) {
  assertString(value, name, { max: 64 });
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) throw new ValidationError(`${name} must be an ISO timestamp`);
  return new Date(timestamp).toISOString();
}

function validateKnownRelationships(claims, allById) {
  for (const claim of claims) {
    for (const targetId of [...claim.supersedes, ...claim.contradicts]) {
      const target = allById.get(targetId);
      if (!target) continue;
      assertSameSlot(claim, target, 'relationship');
    }
  }
}

function isTemporallyValid(claim, asOf) {
  const instant = Date.parse(asOf);
  if (instant < Date.parse(claim.validity.from)) return false;
  return claim.validity.until === null || instant <= Date.parse(claim.validity.until);
}

function assertSameSlot(left, right, relationship) {
  if (
    left.owner !== right.owner
    || left.subject !== right.subject
    || left.predicate !== right.predicate
  ) {
    throw new ValidationError(`Context ${relationship} must remain within the same owner/subject/predicate slot`);
  }
}

function slotKey(claim) {
  return digestObject({
    owner: claim.owner,
    subject: claim.subject,
    predicate: claim.predicate
  });
}

function addConflict(conflictGroups, claim, claimIds, reason) {
  const key = `${slotKey(claim)}:${reason}`;
  const existing = conflictGroups.get(key) ?? {
    owner: claim.owner,
    subject: claim.subject,
    predicate: claim.predicate,
    reason,
    claim_ids: new Set()
  };
  for (const claimId of claimIds) existing.claim_ids.add(claimId);
  conflictGroups.set(key, existing);
}

function projectContextClaim(claim) {
  return {
    claim_id: claim.claim_id,
    owner: claim.owner,
    subject: claim.subject,
    predicate: claim.predicate,
    value: claim.value,
    claim_type: claim.claim_type,
    cardinality: claim.cardinality,
    confidence_ppm: claim.confidence_ppm,
    source: claim.source,
    validity: claim.validity,
    sensitivity: claim.sensitivity,
    authority_effect: CONTEXT_AUTHORITY_EFFECT
  };
}

function compareClaims(left, right) {
  return left.owner.localeCompare(right.owner)
    || left.subject.localeCompare(right.subject)
    || left.predicate.localeCompare(right.predicate)
    || left.claim_id.localeCompare(right.claim_id);
}

function compareConflicts(left, right) {
  return left.owner.localeCompare(right.owner)
    || left.subject.localeCompare(right.subject)
    || left.predicate.localeCompare(right.predicate)
    || left.reason.localeCompare(right.reason);
}

function assertEnum(value, allowed, name) {
  if (typeof value !== 'string' || !allowed.has(value)) {
    throw new ValidationError(`${name} has an unsupported value`);
  }
  return value;
}

function assertExactFields(value, expected, name) {
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (actual.length !== wanted.length || actual.some((field, index) => field !== wanted[index])) {
    throw new ValidationError(`${name} fields are invalid`);
  }
}
