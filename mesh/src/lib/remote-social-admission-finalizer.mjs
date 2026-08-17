import {
  ValidationError,
  assertPlainObject,
  assertString
} from './canonical.mjs';
import {
  REMOTE_SOCIAL_ADMISSION_ACTION,
  REMOTE_SOCIAL_ADMISSION_DATA_SCOPE,
  REMOTE_SOCIAL_ADMISSION_PURPOSE,
  normalizeRemoteSocialAdmissionIntentInput
} from './remote-social-admission-authority.mjs';

export const REMOTE_SOCIAL_ADMISSION_FINALIZER_SCHEMA =
  'axiom-remote-social-admission-finalizer.v1';
export const REMOTE_SOCIAL_ADMISSION_FINALIZER_RESULT_SCHEMA =
  'axiom-remote-social-admission-finalizer-result.v1';

const ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,191}$/;
const DIGEST = /^[a-f0-9]{64}$/;

function exactFields(value, fields, label) {
  const keys = Object.keys(value).sort();
  const expected = [...fields].sort();
  if (
    keys.length !== expected.length
    || keys.some((key, index) => key !== expected[index])
  ) {
    throw new ValidationError(`${label} fields are invalid`);
  }
}

function id(value, label) {
  return assertString(value, label, { min: 1, max: 192, pattern: ID });
}

function digest(value, label) {
  return assertString(value, label, { min: 64, max: 64, pattern: DIGEST });
}

export function normalizeRemoteSocialAdmissionFinalizerRequest(input) {
  const value = assertPlainObject(input, 'remote social admission finalizer request');
  exactFields(
    value,
    ['schema', 'intent_id', 'approval_id', 'intent'],
    'remote social admission finalizer request'
  );
  if (value.schema !== REMOTE_SOCIAL_ADMISSION_FINALIZER_SCHEMA) {
    throw new ValidationError('unsupported remote social admission finalizer schema');
  }

  const intent = assertPlainObject(value.intent, 'remote social admission finalizer intent');
  exactFields(
    intent,
    ['action', 'input', 'purpose', 'data_scopes', 'principal'],
    'remote social admission finalizer intent'
  );
  if (intent.action !== REMOTE_SOCIAL_ADMISSION_ACTION) {
    throw new ValidationError('remote social admission finalizer action is invalid');
  }
  if (intent.purpose !== REMOTE_SOCIAL_ADMISSION_PURPOSE) {
    throw new ValidationError('remote social admission finalizer purpose is invalid');
  }
  if (
    !Array.isArray(intent.data_scopes)
    || intent.data_scopes.length !== 1
    || intent.data_scopes[0] !== REMOTE_SOCIAL_ADMISSION_DATA_SCOPE
  ) {
    throw new ValidationError('remote social admission finalizer data scope is invalid');
  }

  const principal = assertPlainObject(
    intent.principal,
    'remote social admission finalizer principal'
  );
  exactFields(principal, ['id', 'type'], 'remote social admission finalizer principal');
  if (principal.type !== 'human') {
    throw new ValidationError('remote social admission finalizer requires a human principal');
  }

  return Object.freeze({
    schema: REMOTE_SOCIAL_ADMISSION_FINALIZER_SCHEMA,
    intent_id: id(value.intent_id, 'remote social admission finalizer intent_id'),
    approval_id: id(value.approval_id, 'remote social admission finalizer approval_id'),
    intent: Object.freeze({
      action: REMOTE_SOCIAL_ADMISSION_ACTION,
      input: normalizeRemoteSocialAdmissionIntentInput(intent.input),
      purpose: REMOTE_SOCIAL_ADMISSION_PURPOSE,
      data_scopes: Object.freeze([REMOTE_SOCIAL_ADMISSION_DATA_SCOPE]),
      principal: Object.freeze({
        id: id(principal.id, 'remote social admission finalizer principal id'),
        type: 'human'
      })
    })
  });
}

export function buildRemoteSocialAdmissionFinalizerResult(admissionInput) {
  const admission = assertPlainObject(
    admissionInput,
    'remote social admission finalizer admission'
  );
  const summary = assertPlainObject(
    admission.summary_json,
    'remote social admission finalizer summary'
  );
  return Object.freeze({
    schema: REMOTE_SOCIAL_ADMISSION_FINALIZER_RESULT_SCHEMA,
    admission_id: id(admission.admission_id, 'remote social admission finalizer admission_id'),
    stage_id: id(admission.stage_id, 'remote social admission finalizer stage_id'),
    package_digest: digest(
      admission.package_digest,
      'remote social admission finalizer package_digest'
    ),
    intent_request_digest: digest(
      summary.intent_request_digest,
      'remote social admission finalizer intent_request_digest'
    ),
    resolved_request_digest: digest(
      summary.resolved_request_digest,
      'remote social admission finalizer resolved_request_digest'
    ),
    status: admission.status === 'admitted' ? 'admitted' : (() => {
      throw new ValidationError('remote social admission finalizer result is not admitted');
    })(),
    remote_observation_only: admission.remote_observation_only === true,
    local_authorship_claimed: admission.local_authorship_claimed === true,
    network_effect: admission.network_effect,
    authority_effect: admission.authority_effect
  });
}
