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
  assertReference,
  assertUniqueStrings
} from './sovereign-information-common.mjs';

export const DERIVED_REPUTATION_CLAIM_SCHEMA = 'axiom-derived-reputation-claim.v1';
export const DERIVED_REPUTATION_CLAIM_ENVELOPE_SCHEMA = 'axiom-derived-reputation-claim-envelope.v1';

const DOMAIN = /^[a-z0-9][a-z0-9-]{0,63}$/;
const HEX_256 = /^[a-f0-9]{64}$/;
const REASON_CODE = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
const RESULTS = new Set(['met', 'not-demonstrated', 'not-met', 'unresolved']);
const COMPLETENESS = new Set(['bounded-selected-evidence', 'verified-complete-for-criterion']);
const ROOT_KEYS = new Set([
  'schema',
  'claim_id',
  'query_id',
  'subject_ref',
  'domain',
  'purpose',
  'criterion_ref',
  'result',
  'reason_codes',
  'evidence_set_digest',
  'considered_evidence_refs',
  'supporting_evidence_refs',
  'contrary_evidence_refs',
  'challenge_refs',
  'correction_refs',
  'access_decision_digests',
  'evaluator_ref',
  'evaluated_at',
  'valid_until',
  'completeness',
  'authority_effect',
  'reputation_transfer',
  'truth_status'
]);
const ENVELOPE_KEYS = new Set(['schema', 'claim', 'claim_digest', 'attestation']);

function assertDigest(value, name) {
  assertString(value, name, { min: 64, max: 64, pattern: HEX_256 });
  return value;
}

function assertReferenceList(value, name, { min = 0, maxItems = 128 } = {}) {
  const refs = assertUniqueStrings(value, name, { min, maxItems, itemMax: 512 });
  for (let index = 0; index < refs.length; index += 1) {
    assertReference(refs[index], `${name}[${index}]`);
  }
  return refs;
}

function assertDigestList(value, name, { min = 0, maxItems = 128 } = {}) {
  const digests = assertUniqueStrings(value, name, { min, maxItems, itemMax: 64 });
  for (let index = 0; index < digests.length; index += 1) {
    assertDigest(digests[index], `${name}[${index}]`);
  }
  return digests;
}

function assertReasonCodes(value) {
  const reasons = assertUniqueStrings(value, 'reason_codes', { maxItems: 32, itemMax: 64 });
  for (let index = 0; index < reasons.length; index += 1) {
    assertString(reasons[index], `reason_codes[${index}]`, { min: 1, max: 64, pattern: REASON_CODE });
  }
  return reasons;
}

export function validateDerivedReputationClaim(claim) {
  assertAuthorityNeutral(claim, 'derived reputation claim');
  assertPlainObject(claim, 'derived reputation claim');
  assertNoUnknownKeys(claim, 'derived reputation claim', ROOT_KEYS);
  if (claim.schema !== DERIVED_REPUTATION_CLAIM_SCHEMA) {
    throw new ValidationError('derived reputation claim has unsupported schema');
  }

  assertReference(claim.claim_id, 'claim_id');
  assertReference(claim.query_id, 'query_id');
  assertReference(claim.subject_ref, 'subject_ref');
  assertString(claim.domain, 'domain', { min: 1, max: 64, pattern: DOMAIN });
  assertString(claim.purpose, 'purpose', { min: 1, max: 256 });
  assertReference(claim.criterion_ref, 'criterion_ref');
  assertEnum(claim.result, 'result', RESULTS);
  assertReasonCodes(claim.reason_codes);
  assertDigest(claim.evidence_set_digest, 'evidence_set_digest');

  const considered = assertReferenceList(claim.considered_evidence_refs, 'considered_evidence_refs', { min: 1 });
  const supporting = assertReferenceList(claim.supporting_evidence_refs, 'supporting_evidence_refs');
  const contrary = assertReferenceList(claim.contrary_evidence_refs, 'contrary_evidence_refs');
  assertReferenceList(claim.challenge_refs, 'challenge_refs');
  assertReferenceList(claim.correction_refs, 'correction_refs');
  assertDigestList(claim.access_decision_digests, 'access_decision_digests', { min: 1 });

  const consideredSet = new Set(considered);
  for (const ref of [...supporting, ...contrary]) {
    if (!consideredSet.has(ref)) {
      throw new ValidationError('supporting and contrary evidence must be included in considered_evidence_refs');
    }
  }

  assertReference(claim.evaluator_ref, 'evaluator_ref');
  assertIsoTimestamp(claim.evaluated_at, 'evaluated_at');
  assertIsoTimestamp(claim.valid_until, 'valid_until');
  if (Date.parse(claim.valid_until) <= Date.parse(claim.evaluated_at)) {
    throw new ValidationError('valid_until must follow evaluated_at');
  }
  assertEnum(claim.completeness, 'completeness', COMPLETENESS);
  if (claim.result === 'not-met' && claim.completeness !== 'verified-complete-for-criterion') {
    throw new ValidationError('not-met requires verified-complete-for-criterion completeness');
  }
  if (claim.authority_effect !== 'none') {
    throw new ValidationError('authority_effect must be none');
  }
  if (claim.reputation_transfer !== 'none') {
    throw new ValidationError('reputation_transfer must be none');
  }
  if (claim.truth_status !== 'attributed-derived-claim') {
    throw new ValidationError('truth_status must be attributed-derived-claim');
  }

  return claim;
}

export function signDerivedReputationClaim({ claim, signer }) {
  const statement = validateDerivedReputationClaim(claim);
  if (!signer || typeof signer.signObject !== 'function' || typeof signer.keyId !== 'string') {
    throw new ValidationError('derived reputation claim signer is invalid');
  }
  return {
    schema: DERIVED_REPUTATION_CLAIM_ENVELOPE_SCHEMA,
    claim: statement,
    claim_digest: digestObject(statement),
    attestation: signer.signObject(statement)
  };
}

export function verifyDerivedReputationClaimEnvelope({ envelope, publicKey, now }) {
  assertPlainObject(envelope, 'derived reputation claim envelope');
  assertNoUnknownKeys(envelope, 'derived reputation claim envelope', ENVELOPE_KEYS);
  if (envelope.schema !== DERIVED_REPUTATION_CLAIM_ENVELOPE_SCHEMA) {
    throw new ValidationError('derived reputation claim envelope has unsupported schema');
  }

  const claim = validateDerivedReputationClaim(envelope.claim);
  assertDigest(envelope.claim_digest, 'claim_digest');
  if (envelope.claim_digest !== digestObject(claim)) {
    throw new ValidationError('derived reputation claim digest is invalid');
  }

  assertIsoTimestamp(now, 'now');
  const nowMs = Date.parse(now);
  if (Date.parse(claim.evaluated_at) > nowMs) {
    throw new ValidationError('derived reputation claim evaluated_at is in the future');
  }
  if (Date.parse(claim.valid_until) <= nowMs) {
    throw new ValidationError('derived reputation claim is expired');
  }

  try {
    if (!verifyObjectSignature(claim, envelope.attestation, publicKey)) {
      throw new ValidationError('derived reputation claim signature is invalid');
    }
  } catch (error) {
    if (error instanceof ValidationError) throw error;
    throw new ValidationError('derived reputation claim signature is invalid');
  }

  return {
    valid: true,
    claim,
    claim_digest: envelope.claim_digest,
    attestation: envelope.attestation
  };
}
