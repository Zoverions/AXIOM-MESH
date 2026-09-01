import {
  ValidationError,
  assertString,
  digestObject
} from './canonical.mjs';
import {
  evaluateEntityAssurance
} from './entity-assurance.mjs';
import {
  validateMeasurementSourceEnvelopes
} from './measurement-source-envelope.mjs';

export const ASSURANCE_SOURCE_ADMISSION_SCHEMA = 'axiom-assurance-source-admission.v1';

const ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]*(?:-[A-Za-z0-9_.:-]+)*$/;
const DIGEST = /^[a-f0-9]{64}$/;
const LIVE_ADMISSIONS = new WeakSet();

function id(value, label) {
  return assertString(value, label, { min: 1, max: 192, pattern: ID });
}

function digest(value, label) {
  return assertString(value, label, { min: 64, max: 64, pattern: DIGEST });
}

function makeAdmission(body) {
  const admission = Object.freeze({
    ...body,
    admission_digest: digestObject(body)
  });
  LIVE_ADMISSIONS.add(admission);
  return admission;
}

export function admitEntityAssuranceSource({
  sourceId,
  policy,
  evidence,
  subjectId,
  now
} = {}) {
  const source = id(sourceId, 'assurance source broker sourceId');
  const decision = evaluateEntityAssurance({
    policy,
    evidence,
    subjectId,
    now
  });
  if (decision.satisfied !== true || decision.decision !== 'satisfied') {
    throw new ValidationError(
      'assurance source broker cannot admit an unsatisfied entity-assurance decision'
    );
  }
  const body = Object.freeze({
    schema: ASSURANCE_SOURCE_ADMISSION_SCHEMA,
    source_id: source,
    source_class: 'entity-assurance',
    source_verification_digest: digest(
      decision.decision_digest,
      'assurance source broker entity decision digest'
    ),
    upstream_schema: decision.schema,
    upstream_subject_id: decision.subject_id,
    upstream_policy_digest: decision.policy_digest,
    truth_established: false,
    authority_effect: 'none'
  });
  return makeAdmission(body);
}

export function admitMeasurementSourcePackage({
  sourceId,
  pathFabricDocument,
  evidencePackage,
  sourcePackage,
  verificationOptions
} = {}) {
  const source = id(sourceId, 'assurance source broker sourceId');
  const verification = validateMeasurementSourceEnvelopes(
    pathFabricDocument,
    evidencePackage,
    sourcePackage,
    verificationOptions
  );
  if (
    verification.valid !== true
    || verification.source_signatures_verified !== true
    || verification.source_coverage_complete !== true
    || verification.authority_effect !== 'none'
    || verification.runtime_activation !== false
  ) {
    throw new ValidationError(
      'assurance source broker measurement verification did not satisfy admission requirements'
    );
  }
  const body = Object.freeze({
    schema: ASSURANCE_SOURCE_ADMISSION_SCHEMA,
    source_id: source,
    source_class: 'measurement',
    source_verification_digest: digest(
      verification.source_verification_digest,
      'assurance source broker measurement verification digest'
    ),
    upstream_schema: verification.schema,
    upstream_policy_digest: verification.source_verification_policy_digest,
    truth_established: verification.truth_established === true,
    authority_effect: 'none'
  });
  return makeAdmission(body);
}

export function collectBrokerVerifiedSourceDigests(admissions) {
  if (!Array.isArray(admissions) || admissions.length < 1 || admissions.length > 4096) {
    throw new ValidationError(
      'assurance source broker admissions must contain 1-4096 items'
    );
  }
  const result = new Set();
  for (const admission of admissions) {
    if (!admission || typeof admission !== 'object' || !LIVE_ADMISSIONS.has(admission)) {
      throw new ValidationError(
        'assurance source broker accepts only live admissions produced by this broker'
      );
    }
    if (admission.schema !== ASSURANCE_SOURCE_ADMISSION_SCHEMA) {
      throw new ValidationError('assurance source broker admission schema is invalid');
    }
    result.add(digest(
      admission.source_verification_digest,
      'assurance source broker admission verification digest'
    ));
  }
  return result;
}
