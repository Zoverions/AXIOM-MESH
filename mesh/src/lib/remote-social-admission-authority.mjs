import {
  ValidationError,
  assertPlainObject,
  assertString,
  canonicalJson
} from './canonical.mjs';
import { intentRequestBinding, intentRequestDigest } from './intent-binding.mjs';

export const REMOTE_SOCIAL_ADMISSION_ACTION = 'social.remote.admit';
export const REMOTE_SOCIAL_ADMISSION_INTENT_INPUT_SCHEMA =
  'axiom-remote-social-admission-intent-input.v1';
export const REMOTE_SOCIAL_ADMISSION_PURPOSE = 'remote-social-admission';
export const REMOTE_SOCIAL_ADMISSION_DATA_SCOPE = 'social:remote:admit';

const ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,191}$/;
const DIGEST = /^[a-f0-9]{64}$/;
const TRUST_LABEL = /^[a-z][a-z0-9._-]{0,63}$/;
const INPUT_FIELDS = Object.freeze([
  'schema',
  'stage_id',
  'package_digest',
  'exporter_grid_id',
  'exporter_key_id',
  'import_plan_digest',
  'trust_label'
]);

function id(value, label) {
  return assertString(value, label, { min: 1, max: 192, pattern: ID });
}

function digest(value, label) {
  return assertString(value, label, { min: 64, max: 64, pattern: DIGEST });
}

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

export function normalizeRemoteSocialAdmissionIntentInput(input) {
  const value = assertPlainObject(input, 'remote social admission intent input');
  exactFields(value, INPUT_FIELDS, 'remote social admission intent input');
  if (value.schema !== REMOTE_SOCIAL_ADMISSION_INTENT_INPUT_SCHEMA) {
    throw new ValidationError('unsupported remote social admission intent input schema');
  }
  return Object.freeze({
    schema: REMOTE_SOCIAL_ADMISSION_INTENT_INPUT_SCHEMA,
    stage_id: id(value.stage_id, 'remote social admission intent stage_id'),
    package_digest: digest(
      value.package_digest,
      'remote social admission intent package_digest'
    ),
    exporter_grid_id: id(
      value.exporter_grid_id,
      'remote social admission intent exporter_grid_id'
    ),
    exporter_key_id: digest(
      value.exporter_key_id,
      'remote social admission intent exporter_key_id'
    ),
    import_plan_digest: digest(
      value.import_plan_digest,
      'remote social admission intent import_plan_digest'
    ),
    trust_label: assertString(
      value.trust_label,
      'remote social admission intent trust_label',
      { min: 1, max: 64, pattern: TRUST_LABEL }
    )
  });
}

export function remoteSocialAdmissionIntentInputFromStage(stageInput) {
  const stage = assertPlainObject(stageInput, 'remote social admission stage');
  const plan = assertPlainObject(stage.import_plan_json, 'remote social admission import plan');
  return normalizeRemoteSocialAdmissionIntentInput({
    schema: REMOTE_SOCIAL_ADMISSION_INTENT_INPUT_SCHEMA,
    stage_id: stage.stage_id,
    package_digest: stage.package_digest,
    exporter_grid_id: stage.exporter_grid_id,
    exporter_key_id: stage.exporter_key_id,
    import_plan_digest: plan.plan_digest,
    trust_label: stage.trust_label
  });
}

export function assertRemoteSocialAdmissionIntentMatchesStage(intentInput, stageInput) {
  const intent = assertPlainObject(intentInput, 'remote social admission intent');
  if (intent.action !== REMOTE_SOCIAL_ADMISSION_ACTION) {
    throw new ValidationError('remote social admission intent action is invalid');
  }
  if (intent.purpose !== REMOTE_SOCIAL_ADMISSION_PURPOSE) {
    throw new ValidationError('remote social admission intent purpose is invalid');
  }
  if (
    !Array.isArray(intent.data_scopes)
    || intent.data_scopes.length !== 1
    || intent.data_scopes[0] !== REMOTE_SOCIAL_ADMISSION_DATA_SCOPE
  ) {
    throw new ValidationError('remote social admission intent data scope is invalid');
  }

  const actualInput = normalizeRemoteSocialAdmissionIntentInput(intent.input);
  const expectedInput = remoteSocialAdmissionIntentInputFromStage(stageInput);
  if (canonicalJson(actualInput) !== canonicalJson(expectedInput)) {
    throw new ValidationError('remote social admission intent does not match the exact staged review summary');
  }

  return Object.freeze({
    input: actualInput,
    binding: intentRequestBinding(intent),
    intent_request_digest: intentRequestDigest(intent)
  });
}
