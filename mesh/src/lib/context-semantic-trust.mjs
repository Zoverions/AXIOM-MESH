import {
  assertPlainObject,
  assertString,
  digestObject,
  ValidationError
} from './canonical.mjs';
import { normalizeLocalContextCandidate } from './context-claim-resolution.mjs';

export const LOCAL_CONTEXT_SEMANTIC_TRUST_SCHEMA = 'axiom-local-context-semantic-trust.v1';
export const LOCAL_CONTEXT_SEMANTIC_PROJECTION_SCHEMA = 'axiom-local-context-semantic-projection.v1';

const ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/;
const DIGEST = /^[a-f0-9]{64}$/;
const ORIGINS = new Set([
  'owner-authored',
  'local-model-generated',
  'retrieved-external',
  'imported',
  'remote-agent',
  'remote-social',
  'tool-output',
  'system-derived'
]);
const SEMANTIC_CLASSES = new Set([
  'knowledge',
  'preference',
  'procedure',
  'instruction-candidate'
]);
const REVIEW_STATES = new Set([
  'unreviewed',
  'owner-reviewed',
  'quarantined',
  'rejected'
]);
const RETENTION_MODES = new Set(['owner-controlled', 'bounded']);

const TRUST_KEYS = Object.freeze([
  'schema',
  'claim_id',
  'owner_subject_ref',
  'candidate_digest',
  'origin_class',
  'semantic_class',
  'source_evidence_digest',
  'review_state',
  'review_evidence_digest',
  'parent_claim_id',
  'parent_candidate_digest',
  'parent_trust_digest',
  'retention_mode',
  'expires_at',
  'context_treatment',
  'source_identity_verified',
  'artifact_authenticity_verified',
  'review_evidence_verified',
  'authority_effect',
  'instruction_semantics',
  'authority_inheritance',
  'instruction_inheritance',
  'may_authorize_tools',
  'may_modify_policy',
  'may_self_persist',
  'may_retransmit',
  'owner_instruction_use_enabled',
  'trust_digest'
]);

const FIXED_NON_AUTHORITY = Object.freeze({
  source_identity_verified: false,
  artifact_authenticity_verified: false,
  review_evidence_verified: false,
  authority_effect: 'none',
  instruction_semantics: false,
  authority_inheritance: 'none',
  instruction_inheritance: 'none',
  may_authorize_tools: false,
  may_modify_policy: false,
  may_self_persist: false,
  may_retransmit: false,
  owner_instruction_use_enabled: false
});

function exactKeys(value, allowed, required, label) {
  assertPlainObject(value, label);
  const allowedSet = new Set(allowed);
  for (const key of Object.keys(value)) {
    if (!allowedSet.has(key)) throw new ValidationError(`${label} contains unsupported field: ${key}`);
  }
  for (const key of required) {
    if (!Object.hasOwn(value, key)) throw new ValidationError(`${label} missing required field: ${key}`);
  }
}

function id(value, label) {
  return assertString(value, label, { min: 1, max: 160, pattern: ID });
}

function digest(value, label) {
  return assertString(value, label, { min: 64, max: 64, pattern: DIGEST });
}

function nullableDigest(value, label) {
  return value === null ? null : digest(value, label);
}

function nullableId(value, label) {
  return value === null ? null : id(value, label);
}

function timestamp(value, label) {
  if (typeof value !== 'string') throw new ValidationError(`${label} must be a UTC timestamp`);
  const parsed = new Date(value);
  if (Number.isNaN(parsed.valueOf()) || parsed.toISOString() !== value) {
    throw new ValidationError(`${label} must be a canonical UTC ISO timestamp`);
  }
  return value;
}

function enumValue(value, allowed, label) {
  if (!allowed.has(value)) throw new ValidationError(`${label} is invalid`);
  return value;
}

function expectedTreatment(originClass, semanticClass) {
  if (originClass === 'owner-authored' && semanticClass !== 'instruction-candidate') {
    return 'owner-memory-data';
  }
  return 'quoted-reference-data';
}

function normalizedBody(raw, candidate) {
  exactKeys(raw, TRUST_KEYS, TRUST_KEYS.filter(key => key !== 'trust_digest'), 'local context semantic trust');
  if (raw.schema !== LOCAL_CONTEXT_SEMANTIC_TRUST_SCHEMA) {
    throw new ValidationError(`local context semantic trust schema must be ${LOCAL_CONTEXT_SEMANTIC_TRUST_SCHEMA}`);
  }

  const normalizedCandidate = normalizeLocalContextCandidate(candidate);
  const expectedCandidateDigest = digestObject(normalizedCandidate);
  const claimId = id(raw.claim_id, 'semantic trust claim_id');
  const ownerSubjectRef = id(raw.owner_subject_ref, 'semantic trust owner_subject_ref');
  const suppliedCandidateDigest = digest(raw.candidate_digest, 'semantic trust candidate_digest');
  if (
    claimId !== normalizedCandidate.claim_id
    || ownerSubjectRef !== normalizedCandidate.owner_subject_ref
    || suppliedCandidateDigest !== expectedCandidateDigest
  ) {
    throw new ValidationError('semantic trust does not bind the exact context candidate');
  }

  const originClass = enumValue(raw.origin_class, ORIGINS, 'semantic trust origin_class');
  const semanticClass = enumValue(raw.semantic_class, SEMANTIC_CLASSES, 'semantic trust semantic_class');
  const sourceEvidenceDigest = digest(raw.source_evidence_digest, 'semantic trust source_evidence_digest');
  const reviewState = enumValue(raw.review_state, REVIEW_STATES, 'semantic trust review_state');
  const reviewEvidenceDigest = nullableDigest(
    raw.review_evidence_digest,
    'semantic trust review_evidence_digest'
  );

  if (reviewState === 'unreviewed' && reviewEvidenceDigest !== null) {
    throw new ValidationError('unreviewed semantic trust cannot carry review evidence');
  }
  if (reviewState !== 'unreviewed' && reviewEvidenceDigest === null) {
    throw new ValidationError('reviewed/quarantined semantic trust requires an opaque review evidence digest');
  }

  const parentClaimId = nullableId(raw.parent_claim_id, 'semantic trust parent_claim_id');
  const parentCandidateDigest = nullableDigest(
    raw.parent_candidate_digest,
    'semantic trust parent_candidate_digest'
  );
  const parentTrustDigest = nullableDigest(
    raw.parent_trust_digest,
    'semantic trust parent_trust_digest'
  );
  const parentValues = [parentClaimId, parentCandidateDigest, parentTrustDigest];
  const parentCount = parentValues.filter(value => value !== null).length;
  if (parentCount !== 0 && parentCount !== 3) {
    throw new ValidationError('semantic trust parent lineage must be a complete tuple');
  }
  if (originClass === 'system-derived' && parentCount !== 3) {
    throw new ValidationError('system-derived semantic trust requires exact parent lineage');
  }
  if (originClass !== 'system-derived' && parentCount !== 0) {
    throw new ValidationError('only system-derived semantic trust may carry parent lineage');
  }
  if (originClass === 'system-derived' && sourceEvidenceDigest !== parentTrustDigest) {
    throw new ValidationError('system-derived source evidence must be the exact parent trust digest');
  }

  const retentionMode = enumValue(raw.retention_mode, RETENTION_MODES, 'semantic trust retention_mode');
  let expiresAt = null;
  if (retentionMode === 'bounded') {
    expiresAt = timestamp(raw.expires_at, 'semantic trust expires_at');
  } else if (raw.expires_at !== null) {
    throw new ValidationError('owner-controlled semantic trust requires expires_at null');
  }

  const treatment = expectedTreatment(originClass, semanticClass);
  if (raw.context_treatment !== treatment) {
    throw new ValidationError(`semantic trust context_treatment must remain ${treatment}`);
  }
  for (const [key, expected] of Object.entries(FIXED_NON_AUTHORITY)) {
    if (raw[key] !== expected) {
      throw new ValidationError(`semantic trust ${key} must remain ${String(expected)}`);
    }
  }

  return Object.freeze({
    schema: LOCAL_CONTEXT_SEMANTIC_TRUST_SCHEMA,
    claim_id: claimId,
    owner_subject_ref: ownerSubjectRef,
    candidate_digest: suppliedCandidateDigest,
    origin_class: originClass,
    semantic_class: semanticClass,
    source_evidence_digest: sourceEvidenceDigest,
    review_state: reviewState,
    review_evidence_digest: reviewEvidenceDigest,
    parent_claim_id: parentClaimId,
    parent_candidate_digest: parentCandidateDigest,
    parent_trust_digest: parentTrustDigest,
    retention_mode: retentionMode,
    expires_at: expiresAt,
    context_treatment: treatment,
    ...FIXED_NON_AUTHORITY
  });
}

export function createLocalContextSemanticTrust(candidate, {
  origin_class,
  semantic_class,
  source_evidence_digest,
  review_state = 'unreviewed',
  review_evidence_digest = null,
  retention_mode = 'owner-controlled',
  expires_at = null
} = {}) {
  const normalizedCandidate = normalizeLocalContextCandidate(candidate);
  const body = normalizedBody({
    schema: LOCAL_CONTEXT_SEMANTIC_TRUST_SCHEMA,
    claim_id: normalizedCandidate.claim_id,
    owner_subject_ref: normalizedCandidate.owner_subject_ref,
    candidate_digest: digestObject(normalizedCandidate),
    origin_class,
    semantic_class,
    source_evidence_digest,
    review_state,
    review_evidence_digest,
    parent_claim_id: null,
    parent_candidate_digest: null,
    parent_trust_digest: null,
    retention_mode,
    expires_at,
    context_treatment: expectedTreatment(origin_class, semantic_class),
    ...FIXED_NON_AUTHORITY
  }, normalizedCandidate);
  return Object.freeze({ ...body, trust_digest: digestObject(body) });
}

export function deriveLocalContextSemanticTrust(parentCandidate, parentTrust, childCandidate, {
  semantic_class = 'knowledge',
  review_state = 'unreviewed',
  review_evidence_digest = null,
  retention_mode,
  expires_at
} = {}) {
  const parent = verifyLocalContextSemanticTrust(parentTrust, parentCandidate);
  const normalizedChild = normalizeLocalContextCandidate(childCandidate);
  if (normalizedChild.owner_subject_ref !== parent.owner_subject_ref) {
    throw new ValidationError('derived semantic trust cannot cross owner subjects');
  }

  let childRetentionMode = retention_mode ?? parent.retention_mode;
  let childExpiresAt = expires_at ?? (childRetentionMode === 'bounded' ? parent.expires_at : null);
  if (parent.retention_mode === 'bounded') {
    if (childRetentionMode !== 'bounded') {
      throw new ValidationError('derived semantic trust cannot escape bounded parent retention');
    }
    const normalizedExpiry = timestamp(childExpiresAt, 'derived semantic trust expires_at');
    if (new Date(normalizedExpiry).valueOf() > new Date(parent.expires_at).valueOf()) {
      throw new ValidationError('derived semantic trust cannot outlive bounded parent retention');
    }
    childExpiresAt = normalizedExpiry;
  }

  const body = normalizedBody({
    schema: LOCAL_CONTEXT_SEMANTIC_TRUST_SCHEMA,
    claim_id: normalizedChild.claim_id,
    owner_subject_ref: normalizedChild.owner_subject_ref,
    candidate_digest: digestObject(normalizedChild),
    origin_class: 'system-derived',
    semantic_class,
    source_evidence_digest: parent.trust_digest,
    review_state,
    review_evidence_digest,
    parent_claim_id: parent.claim_id,
    parent_candidate_digest: parent.candidate_digest,
    parent_trust_digest: parent.trust_digest,
    retention_mode: childRetentionMode,
    expires_at: childRetentionMode === 'bounded' ? childExpiresAt : null,
    context_treatment: 'quoted-reference-data',
    ...FIXED_NON_AUTHORITY
  }, normalizedChild);
  return Object.freeze({ ...body, trust_digest: digestObject(body) });
}

export function verifyLocalContextSemanticTrust(raw, candidate) {
  const body = normalizedBody(raw, candidate);
  const supplied = digest(raw.trust_digest, 'semantic trust trust_digest');
  const expected = digestObject(body);
  if (supplied !== expected) throw new ValidationError('semantic trust digest mismatch');
  return Object.freeze({ ...body, trust_digest: supplied });
}

function currentTrustState(entry, byClaimId, at, visiting) {
  const { trust } = entry;
  if (visiting.has(trust.claim_id)) {
    throw new ValidationError('semantic trust lineage cycle detected');
  }

  if (trust.review_state === 'quarantined') {
    return { current: false, code: 'semantic_trust_quarantined' };
  }
  if (trust.review_state === 'rejected') {
    return { current: false, code: 'semantic_trust_rejected' };
  }
  if (
    trust.retention_mode === 'bounded'
    && at >= new Date(trust.expires_at).valueOf()
  ) {
    return { current: false, code: 'semantic_trust_expired' };
  }

  if (trust.origin_class !== 'system-derived') {
    return { current: true, code: 'semantic_trust_current' };
  }

  const parentEntry = byClaimId.get(trust.parent_claim_id);
  if (!parentEntry) {
    return { current: false, code: 'semantic_trust_parent_missing' };
  }
  if (
    parentEntry.trust.candidate_digest !== trust.parent_candidate_digest
    || parentEntry.trust.trust_digest !== trust.parent_trust_digest
    || parentEntry.trust.owner_subject_ref !== trust.owner_subject_ref
  ) {
    return { current: false, code: 'semantic_trust_parent_stale' };
  }

  const nextVisiting = new Set(visiting);
  nextVisiting.add(trust.claim_id);
  const parentState = currentTrustState(parentEntry, byClaimId, at, nextVisiting);
  if (!parentState.current) {
    return {
      current: false,
      code: 'semantic_trust_ancestor_not_current',
      ancestor_code: parentState.code
    };
  }
  return { current: true, code: 'semantic_trust_current' };
}

export function projectLocalContextSemanticData({
  entries,
  asOf,
  maxEntries = 1024
}) {
  if (!Array.isArray(entries)) throw new ValidationError('semantic trust entries must be an array');
  if (!Number.isInteger(maxEntries) || maxEntries < 1 || maxEntries > 4096) {
    throw new ValidationError('maxEntries must be an integer between 1 and 4096');
  }
  if (entries.length > maxEntries) {
    throw new ValidationError(
      `semantic trust entries exceed maxEntries (${entries.length} > ${maxEntries}); refusing silent truncation`
    );
  }
  const atText = timestamp(asOf, 'semantic trust asOf');
  const at = new Date(atText).valueOf();

  const normalizedEntries = entries.map((entry, index) => {
    assertPlainObject(entry, `semantic trust entries[${index}]`);
    const keys = Object.keys(entry);
    if (keys.length !== 2 || !keys.includes('candidate') || !keys.includes('trust')) {
      throw new ValidationError(`semantic trust entries[${index}] must contain only candidate and trust`);
    }
    const candidate = normalizeLocalContextCandidate(entry.candidate);
    const trust = verifyLocalContextSemanticTrust(entry.trust, candidate);
    return Object.freeze({ candidate, trust });
  });

  const byClaimId = new Map();
  for (const entry of normalizedEntries) {
    if (byClaimId.has(entry.trust.claim_id)) {
      throw new ValidationError(`duplicate semantic trust claim id: ${entry.trust.claim_id}`);
    }
    byClaimId.set(entry.trust.claim_id, entry);
  }

  const admitted = [];
  const excluded = [];
  for (const entry of normalizedEntries) {
    const state = currentTrustState(entry, byClaimId, at, new Set());
    if (state.current) {
      admitted.push(entry.candidate);
    } else {
      excluded.push({
        claim_id: entry.trust.claim_id,
        code: state.code,
        ...(state.ancestor_code ? { ancestor_code: state.ancestor_code } : {})
      });
    }
  }
  admitted.sort((left, right) => left.claim_id.localeCompare(right.claim_id));
  excluded.sort((left, right) => left.claim_id.localeCompare(right.claim_id));

  const material = {
    schema: LOCAL_CONTEXT_SEMANTIC_PROJECTION_SCHEMA,
    projected_at: atText,
    admitted_candidates: admitted,
    excluded,
    summary: {
      input_entries: normalizedEntries.length,
      admitted_candidates: admitted.length,
      excluded_candidates: excluded.length
    },
    authority_effect: 'none',
    instruction_semantics: false,
    owner_instruction_use_enabled: false,
    may_authorize_tools: false,
    may_modify_policy: false,
    may_self_persist: false,
    may_retransmit: false
  };
  return Object.freeze({ ...material, projection_digest: digestObject(material) });
}

export function evaluateLocalContextInstructionUse(candidate, trust) {
  const verified = verifyLocalContextSemanticTrust(trust, candidate);
  return Object.freeze({
    allow: false,
    code: 'owner_instruction_evidence_contract_not_integrated',
    claim_id: verified.claim_id,
    candidate_digest: verified.candidate_digest,
    trust_digest: verified.trust_digest,
    instruction_semantics: false,
    authority_effect: 'none'
  });
}
