import { randomUUID } from 'node:crypto';
import {
  ValidationError,
  assertPlainObject,
  assertString,
  digestObject
} from '../lib/canonical.mjs';
import { verifyObjectSignature } from '../lib/identity.mjs';
import {
  assertAuthorityNeutral,
  assertEnum,
  assertIsoTimestamp,
  assertNoUnknownKeys,
  assertReference
} from './sovereign-information-common.mjs';
import { validateReputationQuery } from './reputation-query.mjs';
import {
  selectMinimumSufficientProjection,
  validateContextualDisclosureRequest
} from './contextual-disclosure.mjs';
import { verifyDerivedReputationClaimEnvelope } from './derived-reputation-claim.mjs';

export const REPUTATION_PRESENTATION_SCHEMA = 'axiom-reputation-presentation.v1';
export const REPUTATION_PRESENTATION_ENVELOPE_SCHEMA = 'axiom-reputation-presentation-envelope.v1';

const DOMAIN = /^[a-z0-9][a-z0-9-]{0,63}$/;
const HEX_256 = /^[a-f0-9]{64}$/;
const RESULTS = new Set(['met', 'not-demonstrated', 'not-met', 'unresolved']);
const DISCLOSURE_LEVELS = new Set(['criterion-only', 'bounded-summary']);
const SAFE_SUMMARY_FIELDS = new Set([
  'supporting_count',
  'contrary_count',
  'challenge_count',
  'correction_count',
  'considered_count'
]);
const PRESENTATION_KEYS = new Set([
  'schema',
  'presentation_id',
  'query_id',
  'disclosure_request_id',
  'audience_ref',
  'subject_ref',
  'domain',
  'purpose',
  'criterion_ref',
  'result',
  'basis_binding_digest',
  'disclosure_level',
  'summary',
  'issued_at',
  'valid_until',
  'authority_effect',
  'reputation_transfer',
  'truth_status'
]);
const ENVELOPE_KEYS = new Set(['schema', 'presentation', 'presentation_digest', 'attestation']);
const EXPECTED_KEYS = new Set(['audience_ref', 'purpose', 'subject_ref', 'criterion_ref']);

function assertDigest(value, name) {
  assertString(value, name, { min: 64, max: 64, pattern: HEX_256 });
  return value;
}

function earliestTimestamp(...values) {
  return values.reduce((earliest, value) => (
    Date.parse(value) < Date.parse(earliest) ? value : earliest
  ));
}

function assertExactBinding(actual, expected, field, label = 'reputation presentation') {
  if (actual !== expected) {
    throw new ValidationError(`${label} ${field} binding does not match`);
  }
}

function validateSummary(summary, disclosureLevel) {
  if (disclosureLevel === 'criterion-only') {
    if (summary !== null) throw new ValidationError('criterion-only reputation presentation summary must be null');
    return summary;
  }
  assertPlainObject(summary, 'reputation presentation summary');
  const keys = Object.keys(summary);
  if (keys.length < 1) {
    throw new ValidationError('bounded-summary reputation presentation requires at least one count');
  }
  for (const key of keys) {
    if (!SAFE_SUMMARY_FIELDS.has(key)) {
      throw new ValidationError(`reputation presentation summary field ${key} is unsupported`);
    }
    if (!Number.isSafeInteger(summary[key]) || summary[key] < 0) {
      throw new ValidationError(`reputation presentation summary field ${key} must be a non-negative integer`);
    }
  }
  return summary;
}

export function validateReputationPresentation(presentation) {
  assertAuthorityNeutral(presentation, 'reputation presentation');
  assertPlainObject(presentation, 'reputation presentation');
  assertNoUnknownKeys(presentation, 'reputation presentation', PRESENTATION_KEYS);
  if (presentation.schema !== REPUTATION_PRESENTATION_SCHEMA) {
    throw new ValidationError('reputation presentation has unsupported schema');
  }

  assertReference(presentation.presentation_id, 'presentation_id');
  assertReference(presentation.query_id, 'query_id');
  assertReference(presentation.disclosure_request_id, 'disclosure_request_id');
  assertReference(presentation.audience_ref, 'audience_ref');
  assertReference(presentation.subject_ref, 'subject_ref');
  assertString(presentation.domain, 'domain', { min: 1, max: 64, pattern: DOMAIN });
  assertString(presentation.purpose, 'purpose', { min: 1, max: 256 });
  assertReference(presentation.criterion_ref, 'criterion_ref');
  assertEnum(presentation.result, 'result', RESULTS);
  assertDigest(presentation.basis_binding_digest, 'basis_binding_digest');
  assertEnum(presentation.disclosure_level, 'disclosure_level', DISCLOSURE_LEVELS);
  validateSummary(presentation.summary, presentation.disclosure_level);
  assertIsoTimestamp(presentation.issued_at, 'issued_at');
  assertIsoTimestamp(presentation.valid_until, 'valid_until');
  if (Date.parse(presentation.valid_until) <= Date.parse(presentation.issued_at)) {
    throw new ValidationError('reputation presentation valid_until must follow issued_at');
  }
  if (presentation.authority_effect !== 'none') {
    throw new ValidationError('reputation presentation authority_effect must be none');
  }
  if (presentation.reputation_transfer !== 'none') {
    throw new ValidationError('reputation presentation reputation_transfer must be none');
  }
  if (presentation.truth_status !== 'attributed-derived-claim') {
    throw new ValidationError('reputation presentation truth_status must be attributed-derived-claim');
  }
  return presentation;
}

function validateExpectedBinding(expected) {
  assertPlainObject(expected, 'expected reputation presentation binding');
  assertNoUnknownKeys(expected, 'expected reputation presentation binding', EXPECTED_KEYS);
  assertReference(expected.audience_ref, 'expected.audience_ref');
  assertString(expected.purpose, 'expected.purpose', { min: 1, max: 256 });
  assertReference(expected.subject_ref, 'expected.subject_ref');
  assertReference(expected.criterion_ref, 'expected.criterion_ref');
  return expected;
}

function safeAvailableFields(claim) {
  return {
    supporting_count: claim.supporting_evidence_refs.length,
    contrary_count: claim.contrary_evidence_refs.length,
    challenge_count: claim.challenge_refs.length,
    correction_count: claim.correction_refs.length,
    considered_count: claim.considered_evidence_refs.length
  };
}

function safeSummary(disclosedFields) {
  const summary = {};
  for (const [key, value] of Object.entries(disclosedFields)) {
    if (!SAFE_SUMMARY_FIELDS.has(key)) continue;
    if (!Number.isSafeInteger(value) || value < 0) {
      throw new ValidationError(`projected reputation summary field ${key} must be a non-negative integer`);
    }
    summary[key] = value;
  }
  return summary;
}

export function buildReputationPresentation({
  query,
  disclosureRequest,
  projectionPolicy,
  derivedClaimEnvelope,
  claimPublicKey,
  signer,
  now
}) {
  const validatedQuery = validateReputationQuery(query);
  const request = validateContextualDisclosureRequest(disclosureRequest);
  assertIsoTimestamp(now, 'now');
  const nowMs = Date.parse(now);
  if (nowMs < Date.parse(validatedQuery.created_at) || nowMs >= Date.parse(validatedQuery.expires_at)) {
    throw new ValidationError('reputation query is not active at presentation time');
  }
  if (Date.parse(request.created_at) > nowMs) {
    throw new ValidationError('contextual disclosure request is future-dated');
  }

  assertExactBinding(request.requester, validatedQuery.requester, 'requester', 'contextual disclosure request');
  assertExactBinding(request.subject_ref, validatedQuery.subject_ref, 'subject', 'contextual disclosure request');
  assertExactBinding(request.purpose, validatedQuery.purpose, 'purpose', 'contextual disclosure request');
  assertExactBinding(request.verifier_policy_ref, validatedQuery.verifier_policy_ref, 'verifier_policy_ref', 'contextual disclosure request');
  if (!request.required_claims.includes(validatedQuery.criterion_ref)) {
    throw new ValidationError('contextual disclosure request criterion binding does not include the reputation criterion');
  }

  const verifiedClaim = verifyDerivedReputationClaimEnvelope({
    envelope: derivedClaimEnvelope,
    publicKey: claimPublicKey,
    now
  });
  const claim = verifiedClaim.claim;
  assertExactBinding(claim.query_id, validatedQuery.query_id, 'query_id', 'derived reputation claim');
  assertExactBinding(claim.subject_ref, validatedQuery.subject_ref, 'subject', 'derived reputation claim');
  assertExactBinding(claim.domain, validatedQuery.domain, 'domain', 'derived reputation claim');
  assertExactBinding(claim.purpose, validatedQuery.purpose, 'purpose', 'derived reputation claim');
  assertExactBinding(claim.criterion_ref, validatedQuery.criterion_ref, 'criterion', 'derived reputation claim');

  const availableClaims = [];
  if (claim.result === 'met' || claim.result === 'not-met') {
    availableClaims.push({
      claim_id: claim.claim_id,
      predicate: claim.criterion_ref,
      value: claim.result === 'met',
      evidence_refs: claim.supporting_evidence_refs.length > 0
        ? claim.supporting_evidence_refs
        : claim.considered_evidence_refs,
      derived_from_fields: []
    });
  }

  const availableFields = validatedQuery.requested_presentation === 'bounded-summary'
    ? safeAvailableFields(claim)
    : {};
  const projectionResult = selectMinimumSufficientProjection({
    request,
    available_claims: availableClaims,
    available_fields: availableFields,
    policy: projectionPolicy
  });

  let disclosureLevel = 'criterion-only';
  let summary = null;
  if (validatedQuery.requested_presentation === 'bounded-summary') {
    const projectedSummary = safeSummary(projectionResult.disclosed_fields);
    if (Object.keys(projectedSummary).length > 0) {
      disclosureLevel = 'bounded-summary';
      summary = projectedSummary;
    }
  }

  const presentationId = `presentation:${randomUUID()}`;
  const basisBindingDigest = digestObject({
    private_claim_digest: verifiedClaim.claim_digest,
    presentation_id: presentationId,
    audience_ref: validatedQuery.requester,
    purpose: validatedQuery.purpose
  });
  const validUntil = earliestTimestamp(claim.valid_until, validatedQuery.expires_at);
  if (Date.parse(validUntil) <= nowMs) {
    throw new ValidationError('reputation presentation would have no positive validity interval');
  }

  const presentation = validateReputationPresentation({
    schema: REPUTATION_PRESENTATION_SCHEMA,
    presentation_id: presentationId,
    query_id: validatedQuery.query_id,
    disclosure_request_id: request.request_id,
    audience_ref: validatedQuery.requester,
    subject_ref: validatedQuery.subject_ref,
    domain: validatedQuery.domain,
    purpose: validatedQuery.purpose,
    criterion_ref: validatedQuery.criterion_ref,
    result: claim.result,
    basis_binding_digest: basisBindingDigest,
    disclosure_level: disclosureLevel,
    summary,
    issued_at: now,
    valid_until: validUntil,
    authority_effect: 'none',
    reputation_transfer: 'none',
    truth_status: 'attributed-derived-claim'
  });

  if (!signer || typeof signer.signObject !== 'function' || typeof signer.keyId !== 'string') {
    throw new ValidationError('reputation presentation signer is invalid');
  }
  const presentationEnvelope = {
    schema: REPUTATION_PRESENTATION_ENVELOPE_SCHEMA,
    presentation,
    presentation_digest: digestObject(presentation),
    attestation: signer.signObject(presentation)
  };

  return {
    projection_result: projectionResult,
    presentation_envelope: presentationEnvelope
  };
}

export function verifyReputationPresentationEnvelope({ envelope, publicKey, now, expected }) {
  assertPlainObject(envelope, 'reputation presentation envelope');
  assertNoUnknownKeys(envelope, 'reputation presentation envelope', ENVELOPE_KEYS);
  if (envelope.schema !== REPUTATION_PRESENTATION_ENVELOPE_SCHEMA) {
    throw new ValidationError('reputation presentation envelope has unsupported schema');
  }
  const presentation = validateReputationPresentation(envelope.presentation);
  assertDigest(envelope.presentation_digest, 'presentation_digest');
  if (envelope.presentation_digest !== digestObject(presentation)) {
    throw new ValidationError('reputation presentation digest is invalid');
  }

  assertIsoTimestamp(now, 'now');
  const nowMs = Date.parse(now);
  if (Date.parse(presentation.issued_at) > nowMs) {
    throw new ValidationError('reputation presentation issued_at is in the future');
  }
  if (Date.parse(presentation.valid_until) <= nowMs) {
    throw new ValidationError('reputation presentation is expired');
  }

  const binding = validateExpectedBinding(expected);
  assertExactBinding(presentation.audience_ref, binding.audience_ref, 'audience_ref');
  assertExactBinding(presentation.purpose, binding.purpose, 'purpose');
  assertExactBinding(presentation.subject_ref, binding.subject_ref, 'subject_ref');
  assertExactBinding(presentation.criterion_ref, binding.criterion_ref, 'criterion_ref');

  try {
    if (!verifyObjectSignature(presentation, envelope.attestation, publicKey)) {
      throw new ValidationError('reputation presentation signature is invalid');
    }
  } catch (error) {
    if (error instanceof ValidationError) throw error;
    throw new ValidationError('reputation presentation signature is invalid');
  }

  return {
    valid: true,
    presentation,
    presentation_digest: envelope.presentation_digest,
    attestation: envelope.attestation
  };
}
