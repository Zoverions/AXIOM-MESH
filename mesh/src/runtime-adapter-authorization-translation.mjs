import {
  ValidationError,
  assertPlainObject,
  assertString,
  assertStringArray,
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
const EFFECT_PURPOSE_COMMITMENT_SCHEMA = 'axiom-effect-purpose-commitment.v1';
const REFERENCE_INPUT_SCHEMA_REF = 'synthetic://schemas/reference-echo-input.v1';
const DEFAULT_REFERENCE_INPUT_SHA256 = sha256('synthetic reference input');
const DIGEST = /^[a-f0-9]{64}$/;
const PURPOSE_ID = /^[a-z][a-z0-9_.:-]{0,159}$/;
const SUPPORTED_AUTHORIZATION_DETAIL_FIELDS = Object.freeze([
  'axiom_action',
  'credential_handles',
  'destinations',
  'purpose',
  'requested_scopes',
  'runtime_operation',
  'type'
]);
const SUPPORTED_AUTHORIZATION_DETAIL_FIELD_SET = new Set(
  SUPPORTED_AUTHORIZATION_DETAIL_FIELDS
);

const SUPPORTED_MCP_TRANSLATION_FIELDS = Object.freeze([
  'authorization_details',
  'grantId',
  'idempotencyKey',
  'mcpRequest',
  'principalId',
  'requestId'
]);
const SUPPORTED_MCP_TRANSLATION_FIELD_SET = new Set(
  SUPPORTED_MCP_TRANSLATION_FIELDS
);
const SUPPORTED_MCP_REQUEST_FIELDS = Object.freeze([
  'id',
  'jsonrpc',
  'method',
  'params'
]);
const SUPPORTED_MCP_REQUEST_FIELD_SET = new Set(
  SUPPORTED_MCP_REQUEST_FIELDS
);
const SUPPORTED_MCP_TOOL_CALL_PARAM_FIELDS = Object.freeze([
  '_meta',
  'arguments',
  'name'
]);
const SUPPORTED_MCP_TOOL_CALL_PARAM_FIELD_SET = new Set(
  SUPPORTED_MCP_TOOL_CALL_PARAM_FIELDS
);
const REFERENCE_ECHO_ARGUMENT_FIELDS = Object.freeze([
  'message',
  'options'
]);
const REFERENCE_ECHO_ARGUMENT_FIELD_SET = new Set(
  REFERENCE_ECHO_ARGUMENT_FIELDS
);
const REFERENCE_ECHO_OPTION_FIELDS = Object.freeze([
  'mode',
  'targets'
]);
const REFERENCE_ECHO_OPTION_FIELD_SET = new Set(
  REFERENCE_ECHO_OPTION_FIELDS
);
const REFERENCE_ECHO_MODES = new Set(['permissive', 'strict']);

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

  const purpose = assertString(
    detail.purpose,
    'external authorization detail purpose',
    { max: 160, pattern: PURPOSE_ID }
  );
  const {
    authorization_details: ignoredAuthorizationDetails,
    structuredArguments,
    ...requestMechanics
  } = source;
  void ignoredAuthorizationDetails;

  const baseInputSha256 = hasStructuredArguments
    ? createStructuredInputCommitment({
        axiomAction: detail.axiom_action,
        structuredArguments
      })
    : requestMechanics.inputSha256 ?? DEFAULT_REFERENCE_INPUT_SHA256;
  const normalizedBaseInputSha256 = assertString(
    baseInputSha256,
    'external authorization input digest',
    { min: 64, max: 64, pattern: DIGEST }
  );
  const inputSha256 = createPurposeBoundInputCommitment({
    axiomAction: detail.axiom_action,
    purpose,
    inputSha256: normalizedBaseInputSha256
  });

  const nativeRequest = createSyntheticReferenceRequest({
    ...requestMechanics,
    inputSha256
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

export function translateSyntheticMcpToolCallAuthorizationRequest(input) {
  const source = assertPlainObject(
    input,
    'MCP authorization translation input'
  );
  canonicalJson(source);
  rejectUnsupportedFields(
    source,
    SUPPORTED_MCP_TRANSLATION_FIELD_SET,
    'MCP authorization translation'
  );
  if (!Object.hasOwn(source, 'mcpRequest')) {
    throw new ValidationError('MCP authorization translation requires mcpRequest');
  }
  if (!Object.hasOwn(source, 'authorization_details')) {
    throw new ValidationError(
      'MCP authorization translation requires authorization_details'
    );
  }

  const toolCall = validateMcpToolCall(source.mcpRequest);
  const detail = readMcpAuthorizationDetail(source.authorization_details);
  if (detail.runtime_operation !== toolCall.name) {
    throw new ValidationError(
      'MCP tool name must match authorization detail runtime_operation'
    );
  }
  if (toolCall.name !== 'reference.echo') {
    throw new ValidationError(`unsupported MCP tool name: ${toolCall.name}`);
  }

  const structuredArguments = validateReferenceEchoArguments(
    toolCall.arguments
  );
  return translateSyntheticExternalAuthorizationRequest({
    requestId: source.requestId,
    principalId: source.principalId,
    grantId: source.grantId,
    idempotencyKey: source.idempotencyKey,
    authorization_details: source.authorization_details,
    structuredArguments
  });
}

function validateMcpToolCall(value) {
  const request = assertPlainObject(value, 'MCP request');
  canonicalJson(request);
  rejectUnsupportedFields(
    request,
    SUPPORTED_MCP_REQUEST_FIELD_SET,
    'MCP request'
  );
  for (const field of SUPPORTED_MCP_REQUEST_FIELDS) {
    if (!Object.hasOwn(request, field)) {
      throw new ValidationError(`MCP request requires ${field}`);
    }
  }
  if (request.jsonrpc !== '2.0') {
    throw new ValidationError('MCP request jsonrpc must be 2.0');
  }
  if (
    !(
      (typeof request.id === 'string' && request.id.length > 0 && request.id.length <= 256)
      || (typeof request.id === 'number' && Number.isSafeInteger(request.id))
    )
  ) {
    throw new ValidationError('MCP request id must be a non-empty string or safe integer');
  }
  if (request.method !== 'tools/call') {
    throw new ValidationError('MCP request method must be tools/call');
  }

  const params = assertPlainObject(request.params, 'MCP tools/call params');
  rejectUnsupportedFields(
    params,
    SUPPORTED_MCP_TOOL_CALL_PARAM_FIELD_SET,
    'MCP tools/call params'
  );
  if (!Object.hasOwn(params, 'name')) {
    throw new ValidationError('MCP tools/call params require name');
  }
  if (!Object.hasOwn(params, 'arguments')) {
    throw new ValidationError('MCP tools/call params require arguments');
  }
  const name = assertString(params.name, 'MCP tools/call params.name', {
    max: 160
  });
  if (Object.hasOwn(params, '_meta')) {
    const meta = assertPlainObject(params._meta, 'MCP tools/call params._meta');
    canonicalJson(meta);
  }
  return {
    name,
    arguments: params.arguments
  };
}

function readMcpAuthorizationDetail(authorizationDetails) {
  if (!Array.isArray(authorizationDetails) || authorizationDetails.length !== 1) {
    throw new ValidationError(
      'authorization_details must contain exactly one authorization detail'
    );
  }
  const detail = assertPlainObject(
    authorizationDetails[0],
    'external authorization detail'
  );
  if (!Object.hasOwn(detail, 'runtime_operation')) {
    throw new ValidationError('missing authorization detail fields: runtime_operation');
  }
  return detail;
}

function validateReferenceEchoArguments(value) {
  const source = assertPlainObject(value, 'reference.echo arguments');
  canonicalJson(source);
  rejectUnsupportedFields(
    source,
    REFERENCE_ECHO_ARGUMENT_FIELD_SET,
    'reference.echo argument'
  );
  if (!Object.hasOwn(source, 'message')) {
    throw new ValidationError('reference.echo arguments require message');
  }

  const projected = {
    message: assertString(source.message, 'reference.echo arguments.message', {
      max: 1024
    })
  };
  if (!Object.hasOwn(source, 'options')) {
    return projected;
  }

  const options = assertPlainObject(
    source.options,
    'reference.echo arguments.options'
  );
  rejectUnsupportedFields(
    options,
    REFERENCE_ECHO_OPTION_FIELD_SET,
    'reference.echo option'
  );
  const projectedOptions = {};
  if (Object.hasOwn(options, 'mode')) {
    const mode = assertString(options.mode, 'reference.echo arguments.options.mode', {
      max: 32
    });
    if (!REFERENCE_ECHO_MODES.has(mode)) {
      throw new ValidationError(
        'reference.echo arguments.options.mode is unsupported'
      );
    }
    projectedOptions.mode = mode;
  }
  if (Object.hasOwn(options, 'targets')) {
    projectedOptions.targets = assertStringArray(
      options.targets,
      'reference.echo arguments.options.targets',
      { maxItems: 16, itemMax: 128 }
    );
  }
  projected.options = projectedOptions;
  return projected;
}

function rejectUnsupportedFields(source, supportedFields, label) {
  const unsupported = Object.keys(source)
    .filter(field => !supportedFields.has(field))
    .sort();
  if (unsupported.length > 0) {
    throw new ValidationError(
      `unsupported ${label} fields: ${unsupported.join(', ')}`
    );
  }
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

function createPurposeBoundInputCommitment({ axiomAction, purpose, inputSha256 }) {
  return sha256(canonicalJson({
    schema: EFFECT_PURPOSE_COMMITMENT_SCHEMA,
    axiom_action: axiomAction,
    purpose,
    input_sha256: inputSha256
  }));
}
