import {
  AxiomError,
  ValidationError,
  assertPlainObject,
  assertString,
  digestObject
} from '../lib/canonical.mjs';
import {
  EDUCATION_CONTRACT_CONTROLLER,
  EDUCATION_CONTRACT_ID,
  EDUCATION_CONTRACT_SHA256,
  EDUCATION_CONTRACT_VERSION,
  validateEducationIntent
} from './education-contract.mjs';

export const EDUCATION_LEARNER_EVENT_ACTION = 'education.learner.event.append';
export const EDUCATION_LEARNER_RECORD_TOOL = 'adapter.education-learner-record';
export const EDUCATION_SELF_AUTHORITY_MODE = 'subject-self-consent-v1';

const ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/;
const DIGEST = /^[a-f0-9]{64}$/;
const EVENT_TYPE = /^[a-z][a-z0-9.-]{0,127}$/;
const REVIEW_STATES = new Set(['unreviewed', 'reviewed', 'challenged', 'superseded']);

function exactSortedStrings(value, label, { maxItems = 128 } = {}) {
  if (!Array.isArray(value) || value.length < 1 || value.length > maxItems) {
    throw new ValidationError(`${label} must contain 1-${maxItems} values`);
  }
  const normalized = value.map((item, index) => assertString(item, `${label}[${index}]`, {
    max: 160,
    pattern: ID
  }));
  if (new Set(normalized).size !== normalized.length) {
    throw new ValidationError(`${label} must not contain duplicates`);
  }
  const sorted = [...normalized].sort();
  if (JSON.stringify(sorted) !== JSON.stringify(normalized)) {
    throw new ValidationError(`${label} must be sorted canonically`);
  }
  return normalized;
}

function canonicalTimestamp(value, label) {
  const text = assertString(value, label, { max: 64 });
  const parsed = new Date(text);
  if (Number.isNaN(parsed.valueOf()) || parsed.toISOString() !== text) {
    throw new ValidationError(`${label} must be a canonical ISO-8601 timestamp`);
  }
  return text;
}

export function evaluateEducationLearnerEventConsent({
  contract,
  intent,
  consents,
  now = new Date().toISOString()
}) {
  if (intent.action !== EDUCATION_LEARNER_EVENT_ACTION) {
    throw new ValidationError(`Unsupported learner-record action: ${intent.action}`);
  }
  validateEducationIntent(contract, intent.action, intent.input);

  const principalId = assertString(intent.principal?.id, 'intent.principal.id', {
    max: 160,
    pattern: ID
  });
  const principalType = assertString(intent.principal?.type, 'intent.principal.type', {
    max: 16,
    pattern: /^(human|agent|service)$/
  });
  const input = assertPlainObject(intent.input, 'intent.input');
  const subjectId = assertString(input.subject_id, 'subject_id', { max: 160, pattern: ID });

  // The current AXIOM consent primitive only permits a principal to grant consent
  // for itself. This initial education adapter additionally limits that authority
  // to a human learner principal; machine/delegated authority remains a separate
  // explicit future contract rather than being inferred from IDs or roles.
  if (principalType !== 'human' || subjectId !== principalId) {
    return {
      allow: false,
      code: 'education_subject_authority_unavailable',
      http_status: 403,
      reason: 'Only direct human subject self-authorization is implemented for education learner events.'
    };
  }

  if (!Array.isArray(consents)) {
    throw new ValidationError('Grid consent response must be an array');
  }
  const consentId = assertString(input.consent_id, 'consent_id', { max: 160, pattern: ID });
  const receipt = consents.find(candidate => candidate?.consent_id === consentId);
  if (!receipt) {
    return {
      allow: false,
      code: 'education_consent_unavailable',
      http_status: 403,
      reason: 'The requested education consent receipt is unavailable.'
    };
  }

  const action = contract.actions[EDUCATION_LEARNER_EVENT_ACTION];
  const expectedScopes = [...action.consent.data_scopes].sort();
  const scopes = Array.isArray(receipt.scopes_json) ? [...receipt.scopes_json] : [];
  scopes.sort();
  const nowMs = new Date(now).valueOf();
  const expiryMs = new Date(receipt.expires_at).valueOf();
  const valid = (
    receipt.status === 'active'
    && receipt.subject === subjectId
    && receipt.controller === EDUCATION_CONTRACT_CONTROLLER
    && receipt.purpose === action.consent.purpose
    && input.purpose === action.consent.purpose
    && JSON.stringify(scopes) === JSON.stringify(expectedScopes)
    && Number.isFinite(expiryMs)
    && Number.isFinite(nowMs)
    && expiryMs > nowMs
  );
  if (!valid) {
    return {
      allow: false,
      code: 'education_consent_mismatch',
      http_status: 403,
      reason: 'The education consent receipt is inactive, expired, or not bound to the exact subject, controller, purpose, and scope.'
    };
  }

  const facts = {
    schema: 'axiom-education-consent-facts.v1',
    authority_mode: EDUCATION_SELF_AUTHORITY_MODE,
    consent_id: receipt.consent_id,
    subject_id: receipt.subject,
    controller: receipt.controller,
    purpose: receipt.purpose,
    data_scopes: scopes,
    expires_at: receipt.expires_at,
    contract_id: EDUCATION_CONTRACT_ID,
    contract_version: EDUCATION_CONTRACT_VERSION,
    contract_sha256: EDUCATION_CONTRACT_SHA256
  };
  return {
    allow: true,
    facts,
    consent_digest: digestObject(facts)
  };
}

function validateConsentBinding(binding, intent) {
  const value = assertPlainObject(binding, 'education consent binding');
  if (value.schema !== 'axiom-education-consent-binding.v1') {
    throw new ValidationError('Education consent binding schema is unsupported');
  }
  const facts = assertPlainObject(value.facts, 'education consent facts');
  if (facts.schema !== 'axiom-education-consent-facts.v1') {
    throw new ValidationError('Education consent facts schema is unsupported');
  }
  if (facts.authority_mode !== EDUCATION_SELF_AUTHORITY_MODE) {
    throw new ValidationError('Education consent authority mode is unsupported');
  }
  if (!DIGEST.test(value.consent_digest) || value.consent_digest !== digestObject(facts)) {
    throw new ValidationError('Education consent binding digest is invalid');
  }
  if (
    intent.principal.type !== 'human'
    || facts.contract_id !== EDUCATION_CONTRACT_ID
    || facts.contract_version !== EDUCATION_CONTRACT_VERSION
    || facts.contract_sha256 !== EDUCATION_CONTRACT_SHA256
    || facts.controller !== EDUCATION_CONTRACT_CONTROLLER
    || facts.subject_id !== intent.principal.id
    || facts.subject_id !== intent.input.subject_id
    || facts.consent_id !== intent.input.consent_id
    || facts.purpose !== intent.input.purpose
    || JSON.stringify(facts.data_scopes) !== JSON.stringify(['learning-progress:write'])
  ) {
    throw new ValidationError('Education consent binding does not match the learner event');
  }
  if (new Date(facts.expires_at) <= new Date()) {
    throw new AxiomError('education_consent_expired', 'Education consent expired before execution.', 403);
  }
  return {
    facts: structuredClone(facts),
    consent_digest: value.consent_digest
  };
}

function normalizeStandards(input) {
  const present = [
    input.active_pack_manifest_sha256 !== undefined,
    input.course_code !== undefined,
    input.expectation_ids !== undefined
  ];
  if (present.some(Boolean) && !present.every(Boolean)) {
    throw new ValidationError('Official standards binding must include pack digest, course code, and expectation IDs together');
  }
  if (!present.every(Boolean)) return null;
  const pack = assertString(input.active_pack_manifest_sha256, 'active_pack_manifest_sha256', {
    min: 64,
    max: 64,
    pattern: DIGEST
  });
  const courseCode = assertString(input.course_code, 'course_code', { max: 160, pattern: ID });
  const expectationIds = exactSortedStrings(input.expectation_ids, 'expectation_ids');
  return {
    active_pack_manifest_sha256: pack,
    course_code: courseCode,
    expectation_ids: expectationIds
  };
}

export function executeEducationLearnerEvent({ contract, intent, capability, plan }) {
  if (intent.action !== EDUCATION_LEARNER_EVENT_ACTION) {
    throw new ValidationError(`Unsupported education learner-record action: ${intent.action}`);
  }
  validateEducationIntent(contract, intent.action, intent.input);
  const input = assertPlainObject(intent.input, 'intent.input');
  const capabilityConstraints = assertPlainObject(capability?.constraints ?? {}, 'capability constraints');
  const executionStep = Array.isArray(plan?.steps)
    ? plan.steps.find(step => step?.id === 'execute')
    : null;
  const planConstraints = assertPlainObject(executionStep?.constraints ?? {}, 'plan execution constraints');
  const capabilityBinding = assertPlainObject(
    capabilityConstraints.education_consent,
    'capability education consent'
  );
  const planBinding = assertPlainObject(
    planConstraints.education_consent,
    'plan education consent'
  );
  if (digestObject(capabilityBinding) !== digestObject(planBinding)) {
    throw new ValidationError('Capability and plan education consent bindings differ');
  }
  const authorization = validateConsentBinding(capabilityBinding, intent);

  const subjectId = assertString(input.subject_id, 'subject_id', { max: 160, pattern: ID });
  const eventId = assertString(input.event_id, 'event_id', { max: 160, pattern: ID });
  const eventType = assertString(input.event_type, 'event_type', { max: 128, pattern: EVENT_TYPE });
  const occurredAt = canonicalTimestamp(input.occurred_at, 'occurred_at');
  const payloadDigest = assertString(input.payload_digest, 'payload_digest', {
    min: 64,
    max: 64,
    pattern: DIGEST
  });
  const memoryObjectId = assertString(input.memory_object_id, 'memory_object_id', {
    max: 160,
    pattern: ID
  });
  const standards = normalizeStandards(input);
  const reviewState = input.review_state === undefined
    ? 'unreviewed'
    : assertString(input.review_state, 'review_state', { max: 32 });
  if (!REVIEW_STATES.has(reviewState)) {
    throw new ValidationError('review_state is unsupported');
  }

  const record = {
    schema: 'axiom-education-learner-event.v1',
    contract_id: EDUCATION_CONTRACT_ID,
    contract_version: EDUCATION_CONTRACT_VERSION,
    contract_sha256: EDUCATION_CONTRACT_SHA256,
    subject_id: subjectId,
    event_id: eventId,
    event_type: eventType,
    occurred_at: occurredAt,
    payload_digest: payloadDigest,
    memory_object_id: memoryObjectId,
    review_state: reviewState,
    consent: {
      consent_id: authorization.facts.consent_id,
      consent_digest: authorization.consent_digest,
      authority_mode: authorization.facts.authority_mode,
      purpose: authorization.facts.purpose,
      data_scopes: authorization.facts.data_scopes,
      expires_at: authorization.facts.expires_at
    },
    ...(standards ? { standards } : {})
  };
  const recordDigest = digestObject(record);
  return {
    output: {
      event_id: eventId,
      subject_id: subjectId,
      status: 'recorded',
      record_digest: recordDigest,
      review_state: reviewState,
      standards_bound: Boolean(standards)
    },
    mutation: {
      kind: 'education.learner.event.appended',
      subject: eventId,
      payload: {
        ...record,
        record_digest: recordDigest
      }
    }
  };
}
