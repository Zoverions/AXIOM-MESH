import {
  assertPlainObject,
  assertString,
  assertStringArray,
  canonicalize,
  digestObject,
  ValidationError
} from './canonical.mjs';

export const LOCAL_CONTEXT_CANDIDATE_SCHEMA = 'axiom-local-context-candidate.v1';
export const CONTEXT_RESOLUTION_SCHEMA = 'axiom-context-resolution.v1';
export const CONTEXT_AUTHORITY_EFFECT = 'none';

const ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/;
const SEMANTIC_TYPE = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,239}$/;
const DISCLOSURE_TYPES = new Set([
  'verbatim-approved',
  'redacted',
  'transformed-constraint',
  'aggregate',
  'derived-inference'
]);
const SENSITIVITIES = new Set([
  'ordinary-private',
  'sensitive',
  'restricted',
  'critical-secret'
]);
const CANDIDATE_KEYS = Object.freeze([
  'schema',
  'claim_id',
  'owner_subject_ref',
  'semantic_type',
  'value',
  'disclosure_type',
  'sensitivity',
  'confidence',
  'limitations',
  'source_vault_id',
  'source_resource_refs',
  'observed_at',
  'valid_from',
  'valid_until',
  'supersedes',
  'contradicts',
  'authority_effect'
]);

export function normalizeLocalContextCandidate(raw) {
  assertPlainObject(raw, 'local context candidate');
  exactKeys(
    raw,
    CANDIDATE_KEYS,
    [
      'schema',
      'claim_id',
      'owner_subject_ref',
      'semantic_type',
      'value',
      'disclosure_type',
      'sensitivity',
      'limitations',
      'source_vault_id',
      'source_resource_refs',
      'observed_at',
      'valid_from',
      'supersedes',
      'contradicts',
      'authority_effect'
    ],
    'local context candidate'
  );

  if (raw.schema !== LOCAL_CONTEXT_CANDIDATE_SCHEMA) {
    throw new ValidationError(`local context candidate schema must be ${LOCAL_CONTEXT_CANDIDATE_SCHEMA}`);
  }
  if (raw.authority_effect !== CONTEXT_AUTHORITY_EFFECT) {
    throw new ValidationError('context candidate authority_effect must be none');
  }

  const claimId = assertString(raw.claim_id, 'claim_id', { max: 160, pattern: ID });
  const ownerSubjectRef = assertString(raw.owner_subject_ref, 'owner_subject_ref', {
    max: 160,
    pattern: ID
  });
  const semanticType = assertString(raw.semantic_type, 'semantic_type', {
    max: 240,
    pattern: SEMANTIC_TYPE
  });
  const disclosureType = assertEnum(raw.disclosure_type, DISCLOSURE_TYPES, 'disclosure_type');
  const sensitivity = assertEnum(raw.sensitivity, SENSITIVITIES, 'sensitivity');
  const limitations = assertString(raw.limitations, 'limitations', { min: 1, max: 2000 });
  const sourceVaultId = assertString(raw.source_vault_id, 'source_vault_id', {
    max: 160,
    pattern: ID
  });
  const sourceResourceRefs = normalizeIdSet(
    raw.source_resource_refs,
    'source_resource_refs',
    { minItems: 1, maxItems: 128 }
  );
  const supersedes = normalizeIdSet(raw.supersedes, 'supersedes', { minItems: 0, maxItems: 64 });
  const contradicts = normalizeIdSet(raw.contradicts, 'contradicts', { minItems: 0, maxItems: 64 });
  if (supersedes.includes(claimId) || contradicts.includes(claimId)) {
    throw new ValidationError('context candidate cannot reference itself');
  }
  if (supersedes.some(id => contradicts.includes(id))) {
    throw new ValidationError('context candidate cannot both supersede and contradict the same claim');
  }

  let value;
  try {
    value = canonicalize(raw.value);
    digestObject(value);
  } catch {
    throw new ValidationError('context candidate value must be canonical-JSON encodable');
  }

  let confidence;
  if (raw.confidence !== undefined) {
    if (typeof raw.confidence !== 'number' || !Number.isFinite(raw.confidence)
      || raw.confidence < 0 || raw.confidence > 1) {
      throw new ValidationError('confidence must be a finite number between 0 and 1');
    }
    confidence = raw.confidence;
  }

  const observedAt = normalizeTimestamp(raw.observed_at, 'observed_at');
  const validFrom = normalizeTimestamp(raw.valid_from, 'valid_from');
  const validUntil = raw.valid_until === undefined || raw.valid_until === null
    ? null
    : normalizeTimestamp(raw.valid_until, 'valid_until');
  if (validUntil !== null && Date.parse(validUntil) < Date.parse(validFrom)) {
    throw new ValidationError('valid_until cannot be earlier than valid_from');
  }

  return {
    schema: LOCAL_CONTEXT_CANDIDATE_SCHEMA,
    claim_id: claimId,
    owner_subject_ref: ownerSubjectRef,
    semantic_type: semanticType,
    value,
    disclosure_type: disclosureType,
    sensitivity,
    ...(confidence === undefined ? {} : { confidence }),
    limitations,
    source_vault_id: sourceVaultId,
    source_resource_refs: sourceResourceRefs,
    observed_at: observedAt,
    valid_from: validFrom,
    valid_until: validUntil,
    supersedes,
    contradicts,
    authority_effect: CONTEXT_AUTHORITY_EFFECT
  };
}

export function resolveLocalContextCandidates({
  candidates,
  asOf,
  maxCandidates = 1024
}) {
  if (!Array.isArray(candidates)) throw new ValidationError('candidates must be an array');
  if (!Number.isInteger(maxCandidates) || maxCandidates < 1 || maxCandidates > 4096) {
    throw new ValidationError('maxCandidates must be an integer between 1 and 4096');
  }
  if (candidates.length > maxCandidates) {
    throw new ValidationError(
      `candidate context exceeds maxCandidates (${candidates.length} > ${maxCandidates}); refusing silent truncation`
    );
  }
  if (candidates.length === 0) throw new ValidationError('candidates must not be empty');

  const resolvedAt = normalizeTimestamp(asOf, 'asOf');
  const resolvedInstant = Date.parse(resolvedAt);
  const normalized = candidates.map(normalizeLocalContextCandidate);
  const owner = normalized[0].owner_subject_ref;
  if (normalized.some(candidate => candidate.owner_subject_ref !== owner)) {
    throw new ValidationError('one context resolution cannot mix owner subjects');
  }

  const byId = new Map();
  for (const candidate of normalized) {
    if (byId.has(candidate.claim_id)) {
      throw new ValidationError(`duplicate context claim id: ${candidate.claim_id}`);
    }
    byId.set(candidate.claim_id, candidate);
  }

  validateRelationships(normalized, byId);

  const eligible = normalized.filter(candidate => (
    Date.parse(candidate.observed_at) <= resolvedInstant
    && Date.parse(candidate.valid_from) <= resolvedInstant
    && (candidate.valid_until === null || resolvedInstant <= Date.parse(candidate.valid_until))
  ));
  const ineligibleIds = normalized
    .filter(candidate => !eligible.includes(candidate))
    .map(candidate => candidate.claim_id)
    .sort();
  const eligibleById = new Map(eligible.map(candidate => [candidate.claim_id, candidate]));

  const superseded = new Set();
  for (const candidate of eligible) {
    for (const targetId of candidate.supersedes) {
      const target = eligibleById.get(targetId);
      if (!target) continue;
      if (Date.parse(candidate.observed_at) < Date.parse(target.observed_at)) {
        throw new ValidationError('context supersession cannot move backwards in observed time');
      }
      superseded.add(targetId);
    }
  }

  const active = eligible.filter(candidate => !superseded.has(candidate.claim_id));
  const activeById = new Map(active.map(candidate => [candidate.claim_id, candidate]));
  const conflictByType = new Map();

  for (const candidate of active) {
    for (const targetId of candidate.contradicts) {
      const target = activeById.get(targetId);
      if (!target) continue;
      recordConflict(
        conflictByType,
        candidate.semantic_type,
        [candidate.claim_id, target.claim_id],
        'explicit_contradiction'
      );
    }
  }

  const activeByType = groupBySemanticType(active);
  const corroboration = [];
  for (const [semanticType, group] of activeByType.entries()) {
    const alreadyConflicted = new Set(
      conflictByType.get(semanticType)?.flatMap(item => item.claim_ids) ?? []
    );
    const unconflicted = group.filter(candidate => !alreadyConflicted.has(candidate.claim_id));
    if (unconflicted.length < 2) continue;

    const valueDigests = new Set(unconflicted.map(candidate => digestObject(candidate.value)));
    if (valueDigests.size > 1) {
      recordConflict(
        conflictByType,
        semanticType,
        unconflicted.map(candidate => candidate.claim_id),
        'active_value_disagreement'
      );
      continue;
    }

    const metadataDigests = new Set(unconflicted.map(candidate => digestObject({
      disclosure_type: candidate.disclosure_type,
      sensitivity: candidate.sensitivity,
      limitations: candidate.limitations
    })));
    if (metadataDigests.size > 1) {
      recordConflict(
        conflictByType,
        semanticType,
        unconflicted.map(candidate => candidate.claim_id),
        'disclosure_metadata_disagreement'
      );
      continue;
    }

    const ranked = [...unconflicted].sort(compareNewestFirst);
    corroboration.push({
      semantic_type: semanticType,
      selected_claim_id: ranked[0].claim_id,
      corroborating_claim_ids: ranked.slice(1).map(candidate => candidate.claim_id).sort()
    });
  }

  const conflicts = [...conflictByType.entries()]
    .flatMap(([semanticType, items]) => items.map(item => ({
      semantic_type: semanticType,
      reason: item.reason,
      claim_ids: [...new Set(item.claim_ids)].sort()
    })))
    .sort(compareConflictRecords);
  const conflictedIds = new Set(conflicts.flatMap(conflict => conflict.claim_ids));

  const usableClaims = [];
  for (const [semanticType, group] of activeByType.entries()) {
    const available = group.filter(candidate => !conflictedIds.has(candidate.claim_id));
    if (available.length === 0) continue;
    const selected = [...available].sort(compareNewestFirst)[0];
    usableClaims.push(toBrokerClaim(selected));
  }
  usableClaims.sort((left, right) => left.semantic_type.localeCompare(right.semantic_type));
  corroboration.sort((left, right) => left.semantic_type.localeCompare(right.semantic_type));

  const material = {
    schema: CONTEXT_RESOLUTION_SCHEMA,
    owner_subject_ref: owner,
    resolved_at: resolvedAt,
    usable_claims: usableClaims,
    conflicts,
    corroboration,
    superseded_claim_ids: [...superseded].sort(),
    temporally_ineligible_claim_ids: ineligibleIds,
    summary: {
      input_claims: normalized.length,
      eligible_claims: eligible.length,
      superseded_claims: superseded.size,
      conflicted_claims: conflictedIds.size,
      usable_claims: usableClaims.length
    },
    authority_effect: CONTEXT_AUTHORITY_EFFECT,
    grants_vault_access: false,
    grants_execution_authority: false
  };

  return Object.freeze({
    ...material,
    resolution_digest: digestObject(material)
  });
}

function validateRelationships(candidates, byId) {
  for (const candidate of candidates) {
    for (const targetId of [...candidate.supersedes, ...candidate.contradicts]) {
      const target = byId.get(targetId);
      if (!target) {
        throw new ValidationError(`context relationship target is missing: ${targetId}`);
      }
      if (candidate.owner_subject_ref !== target.owner_subject_ref
        || candidate.semantic_type !== target.semantic_type) {
        throw new ValidationError('context relationships must remain within one owner and semantic type');
      }
    }
  }
}

function groupBySemanticType(candidates) {
  const grouped = new Map();
  for (const candidate of candidates) {
    const group = grouped.get(candidate.semantic_type) ?? [];
    group.push(candidate);
    grouped.set(candidate.semantic_type, group);
  }
  return grouped;
}

function recordConflict(map, semanticType, claimIds, reason) {
  const records = map.get(semanticType) ?? [];
  const key = `${reason}:${[...claimIds].sort().join(',')}`;
  if (!records.some(record => record.key === key)) {
    records.push({ key, reason, claim_ids: [...claimIds] });
  }
  map.set(semanticType, records);
}

function toBrokerClaim(candidate) {
  return {
    claim_id: candidate.claim_id,
    semantic_type: candidate.semantic_type,
    value: candidate.value,
    disclosure_type: candidate.disclosure_type,
    sensitivity: candidate.sensitivity,
    ...(candidate.confidence === undefined ? {} : { confidence: candidate.confidence }),
    limitations: candidate.limitations,
    source_vault_id: candidate.source_vault_id,
    source_resource_refs: candidate.source_resource_refs
  };
}

function compareNewestFirst(left, right) {
  return Date.parse(right.observed_at) - Date.parse(left.observed_at)
    || left.claim_id.localeCompare(right.claim_id);
}

function compareConflictRecords(left, right) {
  return left.semantic_type.localeCompare(right.semantic_type)
    || left.reason.localeCompare(right.reason)
    || left.claim_ids.join(',').localeCompare(right.claim_ids.join(','));
}

function normalizeIdSet(value, name, { minItems, maxItems }) {
  const items = assertStringArray(value, name, { maxItems, itemMax: 160 });
  if (items.length < minItems) {
    throw new ValidationError(`${name} must contain at least ${minItems} item(s)`);
  }
  for (const item of items) {
    if (!ID.test(item)) throw new ValidationError(`${name} contains an invalid identifier`);
  }
  if (new Set(items).size !== items.length) {
    throw new ValidationError(`${name} cannot contain duplicates`);
  }
  return [...items].sort();
}

function normalizeTimestamp(value, name) {
  assertString(value, name, { max: 64 });
  const instant = Date.parse(value);
  if (!Number.isFinite(instant)) throw new ValidationError(`${name} must be an ISO timestamp`);
  return new Date(instant).toISOString();
}

function assertEnum(value, allowed, name) {
  if (typeof value !== 'string' || !allowed.has(value)) {
    throw new ValidationError(`${name} has an unsupported value`);
  }
  return value;
}

function exactKeys(value, allowed, required, name) {
  const allowedSet = new Set(allowed);
  const requiredSet = new Set(required);
  for (const key of Object.keys(value)) {
    if (!allowedSet.has(key)) throw new ValidationError(`${name} contains unsupported field ${key}`);
  }
  for (const key of requiredSet) {
    if (!Object.hasOwn(value, key)) throw new ValidationError(`${name} is missing required field ${key}`);
  }
}
