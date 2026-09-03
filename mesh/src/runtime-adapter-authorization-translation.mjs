import {
  ValidationError,
  assertPlainObject,
  canonicalJson,
  sha256
} from './lib/canonical.mjs';
import {
  createSyntheticReferenceRequest
} from './runtime-adapter-conformance.mjs';

const SUPPORTED_EXTERNAL_TRANSLATION_FIELDS = Object.freeze([
  'authorization_details',
  'grantId',
  'idempotencyKey',
  'inputSha256',
  'principalId',
  'requestId',
  'structuredArguments'
]);
const SUPPORTED_EXTERNAL_TRANSLATION_FIELD_SET = new Set(
  SUPPORTED_EXTERNAL_TRANSLATION_FIELDS
);

const AUTHORIZATION_DETAIL_TYPE = 'axiom-runtime-effect.v1';
const EFFECT_INPUT_COMMITMENT_SCHEMA = 'axiom-effect-input-commitment.v1';
const REFERENCE_INPUT_SCHEMA_REF = 'synthetic://schemas/reference-echo-input.v1';
const SUPPORTED_AUTHORIZATION_DETAIL_FIELDS = Object.freeze([
  'axiom_action',
  'credential_handles',
  'destinations',
  'requested_scopes',
  'runtime_operation',
  'type'
]);
const SUPPORTED_AUTHORIZATION_DETAIL_FIELD_SET = new Set(
  SUPPORTED_AUTHORIZATION_DETAIL_FIELDS
);

export function translateSyntheticExternalAuthorizationRequest(input) {
  const source = assertPlainObject(
    input,
    'external authorization translation input'
  );
  const unsupported = Object.keys(source)
    .filter(field => !SUPPORTED_EXTERNAL_TRANSLATION_FIELD_SET.has(field))
    .sort();
  if (unsupported.length > 0) {
    throw new ValidationError(
      `unsupported authorization translation fields: ${unsupported.join(', ')}`
    );
  }

  const hasStructuredArguments = Object.hasOwn(source, 'structuredArguments');
  if (hasStructuredArguments && Object.hasOwn(source, 'inputSha256')) {
    throw new ValidationError(
      'structuredArguments and inputSha256 cannot both be supplied'
    );
  }
  if (hasStructuredArguments && !Object.hasOwn(source, 'authorization_details')) {
    throw new ValidationError(
      'structuredArguments require recognized authorization_details'
    );
  }

  if (!Object.hasOwn(source, 'authorization_details')) {
    return createSyntheticReferenceRequest(source);
  }

  if (
    !Array.isArray(source.authorization_details)
    || source.authorization_details.length !== 1
  ) {
    throw new ValidationError(
      'authorization_details must contain exactly one authorization detail'
    );
  }

  const detail = assertPlainObject(
    source.authorization_details[0],
    'external authorization detail'
  );
  if (detail.type !== AUTHORIZATION_DETAIL_TYPE) {
    throw new ValidationError(
      `unsupported authorization detail type: ${String(detail.type)}`
    );
  }

  const unsupportedDetailFields = Object.keys(detail)
    .filter(field => !SUPPORTED_AUTHORIZATION_DETAIL_FIELD_SET.has(field))
    .sort();
  if (unsupportedDetailFields.length > 0) {
    throw new ValidationError(
      `unsupported authorization detail fields: ${unsupportedDetailFields.join(', ')}`
    );
  }

  const missingDetailFields = SUPPORTED_AUTHORIZATION_DETAIL_FIELDS
    .filter(field => !Object.hasOwn(detail, field))
    .sort();
  if (missingDetailFields.length > 0) {
    throw new ValidationError(
      `missing authorization detail fields: ${missingDetailFields.join(', ')}`
    );
  }

  const {
    authorization_details: ignoredAuthorizationDetails,
    structuredArguments,
    ...requestMechanics
  } = source;
  void ignoredAuthorizationDetails;

  const inputSha256 = hasStructuredArguments
    ? createStructuredInputCommitment({
        axiomAction: detail.axiom_action,
        structuredArguments
      })
    : requestMechanics.inputSha256;

  const nativeRequest = createSyntheticReferenceRequest({
    ...requestMechanics,
    ...(inputSha256 === undefined ? {} : { inputSha256 })
  });
  return {
    ...nativeRequest,
    runtime_operation: detail.runtime_operation,
    axiom_action: detail.axiom_action,
    requested_scopes: detail.requested_scopes,
    destinations: detail.destinations,
    credential_handles: detail.credential_handles
  };
}

function createStructuredInputCommitment({ axiomAction, structuredArguments }) {
  const argumentsObject = assertPlainObject(
    structuredArguments,
    'structured arguments'
  );
  return sha256(canonicalJson({
    schema: EFFECT_INPUT_COMMITMENT_SCHEMA,
    axiom_action: axiomAction,
    input_schema_ref: REFERENCE_INPUT_SCHEMA_REF,
    arguments: argumentsObject
  }));
}
