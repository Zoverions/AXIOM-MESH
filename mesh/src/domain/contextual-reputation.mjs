import {
  ValidationError,
  assertPlainObject,
  digestObject
} from '../lib/canonical.mjs';
import {
  assertIsoTimestamp,
  assertNoUnknownKeys,
  assertReference,
  assertUniqueStrings
} from './sovereign-information-common.mjs';
import { validateInformationRightsEnvelope } from './information-rights.mjs';
import {
  validateEvidenceAssertion,
  validateEvidenceLink,
  validateEvidenceReviewState
} from './evidence-graph.mjs';
import { validateReputationQuery } from './reputation-query.mjs';
import { validateDerivedReputationClaim } from './derived-reputation-claim.mjs';

const STORED_KEYS = new Set([
  'object_ref', 'object_kind', 'object_digest', 'lifecycle_status',
  'created_at', 'updated_at', 'object'
]);
const CRITERION_KEYS = new Set([
  'result',
  'supporting_assertion_refs',
  'contrary_assertion_refs',
  'neutral_assertion_refs',
  'reason_codes',
  'recommended_ttl_seconds',
  'requires_complete_evidence'
]);
const CRITERION_RESULTS = new Set(['met', 'not-demonstrated', 'not-met', 'unresolved']);
const REVIEW_FIELD = Object.freeze({
  'integrity-verified': 'integrity_verified',
  'machine-reviewed': 'machine_reviewed',
  'human-reviewed': 'human_reviewed',
  adjudicated: 'adjudicated'
});
const REASON_CODE = /^[a-z][a-z0-9]*(?:_[a-z0-9]+)*$/;

function compareCodeUnits(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function logicalReference(kind, object) {
  switch (kind) {
    case 'information-rights': return object.object_ref;
    case 'evidence-assertion': return object.assertion_id;
    case 'evidence-link': return object.link_id;
    case 'evidence-review': return object.object_ref;
    default: throw new ValidationError(`contextual reputation contains unsupported object_kind ${kind}`);
  }
}

function validateStoredObjects(objects) {
  if (!Array.isArray(objects) || objects.length < 1 || objects.length > 100) {
    throw new ValidationError('objects must be an array with 1-100 items');
  }

  const normalized = [];
  const seen = new Set();
  for (let index = 0; index < objects.length; index += 1) {
    const stored = assertPlainObject(objects[index], `objects[${index}]`);
    assertNoUnknownKeys(stored, `objects[${index}]`, STORED_KEYS);
    if (typeof stored.object_kind !== 'string') {
      throw new ValidationError(`objects[${index}].object_kind must be a string`);
    }
    const object = stored.object;
    switch (stored.object_kind) {
      case 'information-rights': validateInformationRightsEnvelope(object); break;
      case 'evidence-assertion': validateEvidenceAssertion(object); break;
      case 'evidence-link': validateEvidenceLink(object); break;
      case 'evidence-review': validateEvidenceReviewState(object); break;
      default: throw new ValidationError(`contextual reputation contains unsupported object_kind ${stored.object_kind}`);
    }
    const ref = logicalReference(stored.object_kind, object);
    const identity = `${stored.object_kind}\u0000${ref}`;
    if (seen.has(identity)) {
      throw new ValidationError(`contextual reputation contains duplicate ${stored.object_kind} reference ${ref}`);
    }
    seen.add(identity);
    normalized.push({ object_kind: stored.object_kind, object });
  }

  normalized.sort((left, right) => {
    const kindOrder = compareCodeUnits(left.object_kind, right.object_kind);
    if (kindOrder !== 0) return kindOrder;
    return compareCodeUnits(logicalReference(left.object_kind, left.object), logicalReference(right.object_kind, right.object));
  });
  return normalized;
}

function validateReferenceList(value, name, assertionIds) {
  const refs = assertUniqueStrings(value, name, { maxItems: 128, itemMax: 512 });
  for (let index = 0; index < refs.length; index += 1) {
    assertReference(refs[index], `${name}[${index}]`);
    if (!assertionIds.has(refs[index])) {
      throw new ValidationError(`${name}[${index}] references evidence outside the evaluated assertion set`);
    }
  }
  return [...refs].sort(compareCodeUnits);
}

function normalizeCriterionResult(value, assertionIds) {
  const result = assertPlainObject(value, 'criterion evaluator result');
  assertNoUnknownKeys(result, 'criterion evaluator result', CRITERION_KEYS);
  if (!CRITERION_RESULTS.has(result.result)) {
    throw new ValidationError('criterion evaluator result.result is not an allowed value');
  }

  const supporting = validateReferenceList(result.supporting_assertion_refs, 'supporting_assertion_refs', assertionIds);
  const contrary = validateReferenceList(result.contrary_assertion_refs, 'contrary_assertion_refs', assertionIds);
  const neutral = validateReferenceList(result.neutral_assertion_refs, 'neutral_assertion_refs', assertionIds);
  const classified = new Set();
  for (const [name, refs] of [['supporting_assertion_refs', supporting], ['contrary_assertion_refs', contrary], ['neutral_assertion_refs', neutral]]) {
    for (const ref of refs) {
      if (classified.has(ref)) {
        throw new ValidationError(`${name} overlaps another criterion evidence classification`);
      }
      classified.add(ref);
    }
  }

  const reasonCodes = assertUniqueStrings(result.reason_codes, 'reason_codes', { maxItems: 32, itemMax: 64 });
  for (let index = 0; index < reasonCodes.length; index += 1) {
    if (!REASON_CODE.test(reasonCodes[index])) {
      throw new ValidationError(`reason_codes[${index}] has an invalid format`);
    }
  }
  if (!Number.isInteger(result.recommended_ttl_seconds)
      || result.recommended_ttl_seconds < 1
      || result.recommended_ttl_seconds > 2_592_000) {
    throw new ValidationError('recommended_ttl_seconds must be an integer from 1 to 2592000');
  }
  if (typeof result.requires_complete_evidence !== 'boolean') {
    throw new ValidationError('requires_complete_evidence must be boolean');
  }

  return {
    result: result.result,
    supporting_assertion_refs: supporting,
    contrary_assertion_refs: contrary,
    neutral_assertion_refs: neutral,
    reason_codes: [...reasonCodes].sort(compareCodeUnits),
    recommended_ttl_seconds: result.recommended_ttl_seconds,
    requires_complete_evidence: result.requires_complete_evidence
  };
}

function earliestTimestamp(...values) {
  return values.reduce((earliest, value) => (
    Date.parse(value) < Date.parse(earliest) ? value : earliest
  ));
}

function linkRefs(links, relation, consideredIds) {
  return links
    .filter(link => link.relation === relation
      && (consideredIds.has(link.from_ref) || consideredIds.has(link.to_ref)))
    .map(link => link.link_id)
    .sort(compareCodeUnits);
}

export function evaluateContextualReputation({
  query,
  objects,
  criterionEvaluator,
  completenessVerifier = null,
  accessDecisionDigests,
  now
}) {
  const validatedQuery = validateReputationQuery(query);
  assertIsoTimestamp(now, 'now');
  const nowMs = Date.parse(now);
  if (nowMs < Date.parse(validatedQuery.created_at) || nowMs >= Date.parse(validatedQuery.expires_at)) {
    throw new ValidationError('reputation query is not active at evaluation time');
  }
  if (typeof criterionEvaluator !== 'function') {
    throw new ValidationError('criterionEvaluator must be a function');
  }
  if (completenessVerifier !== null && typeof completenessVerifier !== 'function') {
    throw new ValidationError('completenessVerifier must be a function when supplied');
  }
  if (!Array.isArray(accessDecisionDigests)) {
    throw new ValidationError('accessDecisionDigests must be an array');
  }

  const normalizedObjects = validateStoredObjects(objects);
  const assertions = normalizedObjects
    .filter(item => item.object_kind === 'evidence-assertion')
    .map(item => item.object);
  if (assertions.length < 1) {
    throw new ValidationError('contextual reputation requires at least one evidence assertion');
  }
  const links = normalizedObjects
    .filter(item => item.object_kind === 'evidence-link')
    .map(item => item.object);
  const rightsByRef = new Map(normalizedObjects
    .filter(item => item.object_kind === 'information-rights')
    .map(item => [item.object.object_ref, item.object]));
  const reviewByRef = new Map(normalizedObjects
    .filter(item => item.object_kind === 'evidence-review')
    .map(item => [item.object.object_ref, item.object]));

  const assertionIds = new Set(assertions.map(item => item.assertion_id));
  const entries = [];
  const structuralReasons = new Set();
  const supportReasons = new Map();
  const domainPurpose = `reputation:${validatedQuery.domain}`;
  const windowStartMs = Date.parse(validatedQuery.evidence_window.starts_at);
  const windowEndMs = Date.parse(validatedQuery.evidence_window.ends_at);
  const reviewField = REVIEW_FIELD[validatedQuery.minimum_review_state];

  for (const assertion of assertions) {
    const rights = rightsByRef.get(assertion.assertion_id) ?? null;
    const review = reviewByRef.get(assertion.assertion_id) ?? null;
    const perSupport = new Set();

    if (!rights) {
      structuralReasons.add('rights_missing');
    } else {
      if (!rights.relationships.subjects.includes(validatedQuery.subject_ref)) {
        throw new ValidationError(`evidence subject binding does not include ${validatedQuery.subject_ref}`);
      }
      if (!rights.allowed_purposes.includes(validatedQuery.purpose)
          || rights.forbidden_purposes.includes(validatedQuery.purpose)) {
        throw new ValidationError(`evidence purpose ${validatedQuery.purpose} is not authorized`);
      }
      if (rights.state.retention !== 'active' || rights.state.supersession !== 'current') {
        structuralReasons.add('rights_not_current');
      }
      if (rights.state.challenge === 'open') perSupport.add('evidence_challenged');
    }

    const assertionMs = Date.parse(assertion.created_at);
    if (assertionMs > nowMs) structuralReasons.add('evidence_future_dated');
    else if (assertionMs < windowStartMs || assertionMs > windowEndMs) structuralReasons.add('evidence_outside_window');
    if (!assertion.purpose_scope.includes(domainPurpose)) structuralReasons.add('evidence_domain_mismatch');
    if (assertion.epistemic_state === 'disputed') perSupport.add('evidence_disputed');
    if (assertion.epistemic_state === 'superseded'
        || assertion.epistemic_state === 'indeterminate'
        || assertion.epistemic_state === 'withdrawn') {
      perSupport.add('evidence_unresolved_state');
    }

    if (!review) {
      structuralReasons.add('review_missing');
    } else {
      const reviewMs = Date.parse(review.updated_at);
      if (reviewMs > nowMs) structuralReasons.add('review_future_dated');
      else if (reviewMs < windowStartMs || reviewMs > windowEndMs) structuralReasons.add('review_outside_window');
      if (!review.available) structuralReasons.add('evidence_unavailable');
      if (!review.integrity_verified) structuralReasons.add('evidence_integrity_unverified');
      if (review[reviewField] !== true) structuralReasons.add('review_floor_unsatisfied');
      if (review.challenged && !review.adjudicated) perSupport.add('evidence_challenged');
    }

    supportReasons.set(assertion.assertion_id, perSupport);
    entries.push({ assertion, rights, review });
  }

  const criterion = normalizeCriterionResult(
    criterionEvaluator({ query: validatedQuery, entries, links, now }),
    assertionIds
  );

  const reasons = new Set([...criterion.reason_codes, ...structuralReasons]);
  for (const ref of criterion.supporting_assertion_refs) {
    for (const reason of supportReasons.get(ref) ?? []) reasons.add(reason);
  }

  let completeness = 'bounded-selected-evidence';
  let finalResult = criterion.result;
  const needsCompleteEvidence = criterion.requires_complete_evidence || criterion.result === 'not-met';
  if (needsCompleteEvidence) {
    const verification = completenessVerifier?.({ query: validatedQuery, objects, now });
    if (!verification || verification.complete !== true) {
      reasons.add('criterion_completeness_unverified');
      finalResult = 'unresolved';
    } else {
      completeness = 'verified-complete-for-criterion';
    }
  }

  if (structuralReasons.size > 0) finalResult = 'unresolved';
  for (const ref of criterion.supporting_assertion_refs) {
    if ((supportReasons.get(ref)?.size ?? 0) > 0) finalResult = 'unresolved';
  }

  const consideredEvidenceRefs = [...assertionIds].sort(compareCodeUnits);
  const consideredIds = new Set(consideredEvidenceRefs);
  const evidenceSetDigest = digestObject({
    query_binding: {
      subject_ref: validatedQuery.subject_ref,
      domain: validatedQuery.domain,
      purpose: validatedQuery.purpose,
      criterion_ref: validatedQuery.criterion_ref,
      evidence_window: validatedQuery.evidence_window,
      minimum_review_state: validatedQuery.minimum_review_state
    },
    objects: normalizedObjects
  });

  const ttlSeconds = Math.min(
    criterion.recommended_ttl_seconds,
    validatedQuery.max_claim_ttl_seconds
  );
  const ttlUntil = new Date(nowMs + ttlSeconds * 1000).toISOString();
  const validUntil = earliestTimestamp(
    ttlUntil,
    validatedQuery.expires_at,
    validatedQuery.evidence_window.ends_at
  );
  if (Date.parse(validUntil) <= nowMs) {
    throw new ValidationError('contextual reputation claim would have no positive validity interval');
  }

  const sortedReasons = [...reasons].sort(compareCodeUnits);
  const claimIdDigest = digestObject({
    query_id: validatedQuery.query_id,
    subject_ref: validatedQuery.subject_ref,
    domain: validatedQuery.domain,
    purpose: validatedQuery.purpose,
    criterion_ref: validatedQuery.criterion_ref,
    result: finalResult,
    reason_codes: sortedReasons,
    evidence_set_digest: evidenceSetDigest,
    evaluated_at: now,
    completeness
  });

  return validateDerivedReputationClaim({
    schema: 'axiom-derived-reputation-claim.v1',
    claim_id: `repclaim:${claimIdDigest.slice(0, 32)}`,
    query_id: validatedQuery.query_id,
    subject_ref: validatedQuery.subject_ref,
    domain: validatedQuery.domain,
    purpose: validatedQuery.purpose,
    criterion_ref: validatedQuery.criterion_ref,
    result: finalResult,
    reason_codes: sortedReasons,
    evidence_set_digest: evidenceSetDigest,
    considered_evidence_refs: consideredEvidenceRefs,
    supporting_evidence_refs: criterion.supporting_assertion_refs,
    contrary_evidence_refs: criterion.contrary_assertion_refs,
    challenge_refs: linkRefs(links, 'challenged-by', consideredIds),
    correction_refs: linkRefs(links, 'corrected-by', consideredIds),
    access_decision_digests: accessDecisionDigests,
    evaluator_ref: validatedQuery.criterion_ref,
    evaluated_at: now,
    valid_until: validUntil,
    completeness,
    authority_effect: 'none',
    reputation_transfer: 'none',
    truth_status: 'attributed-derived-claim'
  });
}
