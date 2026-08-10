import contractJson from '../../config/gateway-client-contract.json' with { type: 'json' };
import { canonicalJson, digestObject, ValidationError } from './canonical.mjs';

export const GATEWAY_CLIENT_CONTRACT_SCHEMA =
  'axiom-gateway-client-contract.v1';

const ROUTE_FIELDS = Object.freeze([
  'id',
  'method',
  'path',
  'access',
  'idempotency',
  'path_parameters',
  'query_parameters',
  'request_schema',
  'response_schema',
  'required_response_fields',
  'response_media_type'
]);
const EXPECTED_STABLE_CODES = Object.freeze([
  'authentication_required',
  'invalid_token',
  'forbidden',
  'rate_limited',
  'body_too_large',
  'validation_error',
  'not_found',
  'idempotency_conflict',
  'confirmation_required',
  'independent_approval_required',
  'approval_mismatch',
  'approval_unavailable',
  'policy_denied',
  'capability_unavailable',
  'dependency_unavailable',
  'request_cancelled',
  'request_timeout',
  'response_too_large',
  'invalid_client_request',
  'invalid_gateway_response'
]);
const EXPECTED_RETRYABLE_CODES = Object.freeze([
  'rate_limited',
  'dependency_unavailable',
  'request_timeout'
]);
const ID = /^[a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*)+$/;
const FIELD = /^[a-z][a-z0-9_]{0,63}$/;
const ERROR_CODE = /^[a-z][a-z0-9_]{0,63}$/;
const SCHEMA_ID = /^[a-z][a-z0-9.-]+\.v1$/;
const EXPECTED_CONTRACT_DIGEST =
  '6bc97dec746a44aafb46ba8afe0ad520abafe157d80dd8ef547a5d5871ad601c';
const EXPECTED_JSON_SCHEMA_DIGEST =
  '90a65df24bab3299b4bab58ab15270b02aac67938923746f413285296dfa6ccf';

export const ACTIVE_GATEWAY_CLIENT_CONTRACT = deepFreeze(
  validateGatewayClientContract(contractJson).contract
);

export function validateGatewayClientContract(contract) {
  exactObject(contract, 'Gateway client contract', [
    'schema',
    'version',
    'kernel_version',
    'base_path',
    'boundary',
    'limits',
    'cancellation',
    'error_contract',
    'routes'
  ]);
  if (
    contract.schema !== GATEWAY_CLIENT_CONTRACT_SCHEMA
    || contract.version !== 1
    || contract.kernel_version !== '0.12.0-dev.3'
    || contract.base_path !== '/v1'
    || contract.cancellation !== 'AbortSignal'
  ) throw new ValidationError('Gateway client contract identity is invalid');

  exactObject(contract.boundary, 'Gateway client boundary', [
    'request_target',
    'authenticated_transport',
    'direct_internal_service_access',
    'token_persistence'
  ]);
  if (
    contract.boundary.request_target !== 'same-origin-relative-path'
    || contract.boundary.authenticated_transport
      !== 'permission-restricted-gateway-ingress'
    || contract.boundary.direct_internal_service_access !== false
    || contract.boundary.token_persistence !== 'caller-managed-memory-only'
  ) throw new ValidationError('Gateway client boundary is weakened');

  exactObject(contract.limits, 'Gateway client limits', [
    'default_timeout_ms',
    'maximum_timeout_ms',
    'maximum_request_bytes',
    'maximum_response_bytes',
    'maximum_target_length',
    'maximum_query_values',
    'maximum_query_value_length',
    'idempotency_key_minimum_length',
    'idempotency_key_maximum_length'
  ]);
  if (
    contract.limits.default_timeout_ms !== 10_000
    || contract.limits.maximum_timeout_ms !== 30_000
    || contract.limits.maximum_request_bytes !== 1_048_576
    || contract.limits.maximum_response_bytes !== 2_097_152
    || contract.limits.maximum_target_length !== 8_192
    || contract.limits.maximum_query_values !== 64
    || contract.limits.maximum_query_value_length !== 512
    || contract.limits.idempotency_key_minimum_length !== 16
    || contract.limits.idempotency_key_maximum_length !== 160
  ) throw new ValidationError('Gateway client limits drifted');

  exactObject(contract.error_contract, 'Gateway client error contract', [
    'schema',
    'trace_header',
    'unknown_code_behavior',
    'stable_codes',
    'retryable_codes'
  ]);
  if (
    contract.error_contract.schema !== 'axiom-gateway-error.v1'
    || contract.error_contract.trace_header !== 'x-trace-id'
    || contract.error_contract.unknown_code_behavior
      !== 'preserve-and-present-generic-failure'
    || canonicalJson(contract.error_contract.stable_codes)
      !== canonicalJson(EXPECTED_STABLE_CODES)
    || canonicalJson(contract.error_contract.retryable_codes)
      !== canonicalJson(EXPECTED_RETRYABLE_CODES)
  ) throw new ValidationError('Gateway client error vocabulary drifted');
  if (contract.error_contract.stable_codes.some(code => !ERROR_CODE.test(code))) {
    throw new ValidationError('Gateway client error code is invalid');
  }

  if (!Array.isArray(contract.routes) || contract.routes.length !== 28) {
    throw new ValidationError('Gateway client route inventory is incomplete');
  }
  const ids = new Set();
  const routeKeys = new Set();
  for (const route of contract.routes) {
    exactObject(route, `Gateway client route ${route?.id ?? 'unknown'}`, ROUTE_FIELDS);
    if (
      !ID.test(route.id)
      || !['GET', 'POST'].includes(route.method)
      || typeof route.path !== 'string'
      || !route.path.startsWith('/v1/')
      || route.path.includes('//')
      || route.path.includes('*')
      || typeof route.access !== 'string'
      || !route.access.length
      || !['required', 'not_applicable'].includes(route.idempotency)
      || !Array.isArray(route.path_parameters)
      || !Array.isArray(route.query_parameters)
      || !Array.isArray(route.required_response_fields)
      || !SCHEMA_ID.test(route.response_schema)
      || !['application/json', 'application/openmetrics-text']
        .includes(route.response_media_type)
    ) throw new ValidationError(`Gateway client route is invalid: ${route?.id}`);
    for (const values of [
      route.path_parameters,
      route.query_parameters,
      route.required_response_fields
    ]) validateFieldArray(values, route.id);
    const declaredParameters = [...route.path.matchAll(/:([a-z][a-z0-9_]*)/g)]
      .map(match => match[1]);
    if (canonicalJson(declaredParameters) !== canonicalJson(route.path_parameters)) {
      throw new ValidationError(`Gateway client path parameters drifted: ${route.id}`);
    }
    if (route.method === 'GET' && (
      route.request_schema !== null
      || route.idempotency !== 'not_applicable'
    )) throw new ValidationError(`Gateway client GET contract is invalid: ${route.id}`);
    if (route.method === 'POST' && (
      route.id !== 'intents.submit'
      || route.request_schema !== 'axiom-intent-request.v1'
      || route.idempotency !== 'required'
    )) throw new ValidationError('Gateway client effect route is invalid');
    if (
      route.response_media_type === 'application/openmetrics-text'
      && (
        route.id !== 'metrics.get'
        || route.required_response_fields.length
      )
    ) throw new ValidationError('Gateway metrics response contract is invalid');
    if (ids.has(route.id)) {
      throw new ValidationError(`Gateway client route id is duplicated: ${route.id}`);
    }
    const key = `${route.method} ${route.path}`;
    if (routeKeys.has(key)) {
      throw new ValidationError(`Gateway client route is duplicated: ${key}`);
    }
    ids.add(route.id);
    routeKeys.add(key);
  }

  const contractDigest = digestObject(contract);
  if (contractDigest !== EXPECTED_CONTRACT_DIGEST) {
    throw new ValidationError('Gateway client exact contract drifted');
  }
  return {
    valid: true,
    schema: contract.schema,
    kernel_version: contract.kernel_version,
    routes: contract.routes.length,
    stable_errors: contract.error_contract.stable_codes.length,
    contract_digest: contractDigest,
    contract
  };
}

export function validateGatewayClientRouteImplementation({ contract, source }) {
  const validation = validateGatewayClientContract(contract);
  if (typeof source !== 'string' || !source.length) {
    throw new ValidationError('Gateway route source is missing');
  }
  const declarations = [...source.matchAll(/router\.add\(/g)].length;
  const matches = [...source.matchAll(
    /router\.add\(\s*(['"])([A-Z]+)\1\s*,\s*(['"])([^'"]+)\3/g
  )];
  if (matches.length !== declarations) {
    throw new ValidationError('Gateway contains a non-literal router.add declaration');
  }
  const implemented = matches
    .map(match => `${match[2]} ${match[4]}`)
    .filter(route => route.includes(' /v1/'));
  const declared = contract.routes.map(route => `${route.method} ${route.path}`);
  if (canonicalJson(implemented) !== canonicalJson(declared)) {
    throw new ValidationError('Gateway client contract and route implementation disagree');
  }
  return {
    valid: true,
    schema: validation.schema,
    implemented_routes: implemented.length,
    contract_digest: validation.contract_digest
  };
}

export function validateGatewayClientContractSchema(schema) {
  if (
    !schema
    || typeof schema !== 'object'
    || Array.isArray(schema)
    || schema.$schema !== 'https://json-schema.org/draft/2020-12/schema'
    || schema.$id
      !== 'https://axiom.invalid/schemas/axiom-gateway-client-contract.v1.json'
    || schema.type !== 'object'
    || schema.additionalProperties !== false
    || canonicalJson(Object.keys(schema.$defs ?? {}).sort())
      !== canonicalJson(['errorCode', 'errorEnvelope', 'intentRequest', 'route'])
  ) throw new ValidationError('Gateway client JSON Schema is invalid');
  const schemaDigest = digestObject(schema);
  if (schemaDigest !== EXPECTED_JSON_SCHEMA_DIGEST) {
    throw new ValidationError('Gateway client exact JSON Schema drifted');
  }
  return {
    valid: true,
    schema_id: schema.$id,
    schema_digest: schemaDigest,
    definitions: Object.keys(schema.$defs).length
  };
}

export function gatewayClientRoute(routeId, contract = ACTIVE_GATEWAY_CLIENT_CONTRACT) {
  validateGatewayClientContract(contract);
  const route = contract.routes.find(item => item.id === routeId);
  if (!route) throw new ValidationError('Gateway client route id is unknown');
  return route;
}

function validateFieldArray(values, routeId) {
  if (
    values.some(value => typeof value !== 'string' || !FIELD.test(value))
    || new Set(values).size !== values.length
  ) throw new ValidationError(`Gateway client field inventory is invalid: ${routeId}`);
}

function exactObject(value, name, keys) {
  if (
    !value
    || typeof value !== 'object'
    || Array.isArray(value)
    || canonicalJson(Object.keys(value).sort()) !== canonicalJson([...keys].sort())
  ) throw new ValidationError(`${name} fields are invalid`);
}

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}
