import contractJson from '../../mesh/config/gateway-client-contract.json' with { type: 'json' };

export const GATEWAY_CLIENT_CONTRACT = deepFreeze(contractJson);

const IDEMPOTENCY_KEY = /^[A-Za-z0-9_.:-]+$/;
const TRACE_ID = /^[A-Za-z0-9_.:-]{8,160}$/;
const ACTION = /^[a-z][a-z0-9.-]+$/;
const INTENT_FIELDS = new Set([
  'action',
  'input',
  'purpose',
  'data_scopes',
  'confirmations',
  'approval_ids'
]);

export class GatewayClientError extends Error {
  constructor(code, message, {
    status = 0,
    traceId,
    details,
    retryable = false,
    cause
  } = {}) {
    super(message, cause === undefined ? undefined : { cause });
    this.name = 'GatewayClientError';
    this.code = code;
    this.status = status;
    this.traceId = traceId;
    this.details = details;
    this.retryable = retryable;
  }
}

export class GatewayClient {
  constructor(options = {}) {
    if (
      !plainObject(options)
      || Object.keys(options).some(key => ![
        'request',
        'token',
        'defaultTimeoutMs'
      ].includes(key))
    ) throw invalidRequest('Gateway client options are invalid');
    const {
      request = globalThis.fetch,
      token,
      defaultTimeoutMs = GATEWAY_CLIENT_CONTRACT.limits.default_timeout_ms
    } = options;
    if (typeof request !== 'function') {
      throw invalidRequest('Gateway client requires a request function');
    }
    if (typeof token !== 'string' && typeof token !== 'function') {
      throw invalidRequest('Gateway client requires an in-memory token or token provider');
    }
    this.request = request;
    this.tokenProvider = typeof token === 'function' ? token : () => token;
    this.contract = GATEWAY_CLIENT_CONTRACT;
    this.defaultTimeoutMs = boundedTimeout(defaultTimeoutMs, this.contract);
  }

  async call(routeId, {
    params = {},
    query = {},
    body,
    idempotencyKey,
    signal,
    timeoutMs = this.defaultTimeoutMs,
    traceId
  } = {}) {
    let route;
    route = this.contract.routes?.find(item => item.id === routeId);
    if (!route) throw invalidRequest('Gateway client route id is unknown');
    const path = routePath(route, params, query, this.contract);
    let token;
    try {
      token = await this.tokenProvider();
    } catch (error) {
      throw invalidRequest('Gateway token provider failed', error);
    }
    validateToken(token);
    const headers = {
      accept: route.response_media_type,
      authorization: `Bearer ${token}`
    };
    if (traceId !== undefined) {
      if (!TRACE_ID.test(traceId)) throw invalidRequest('Gateway trace id is invalid');
      headers['x-trace-id'] = traceId;
    }
    let encodedBody;
    if (route.request_schema) {
      validateIntentRequest(body);
      try {
        encodedBody = JSON.stringify(body);
      } catch (error) {
        throw invalidRequest('Intent request is not serializable', error);
      }
      if (
        new TextEncoder().encode(encodedBody).byteLength
        > this.contract.limits.maximum_request_bytes
      ) throw invalidRequest('Intent request exceeds the contract byte limit');
      headers['content-type'] = 'application/json';
    } else if (body !== undefined) {
      throw invalidRequest('Gateway route does not accept a request body');
    }
    if (route.idempotency === 'required') {
      validateIdempotencyKey(idempotencyKey, this.contract);
      headers['idempotency-key'] = idempotencyKey;
    } else if (idempotencyKey !== undefined) {
      throw invalidRequest('Gateway route does not accept an idempotency key');
    }

    const lifecycle = requestLifecycle(signal, boundedTimeout(timeoutMs, this.contract));
    let response;
    try {
      response = await this.request(path, {
        method: route.method,
        headers,
        body: encodedBody,
        signal: lifecycle.signal,
        credentials: 'same-origin',
        redirect: 'error'
      });
    } catch (error) {
      lifecycle.close();
      if (lifecycle.externalCancelled()) {
        throw new GatewayClientError(
          'request_cancelled',
          'Gateway request was cancelled',
          { cause: error }
        );
      }
      if (lifecycle.timedOut()) {
        throw new GatewayClientError(
          'request_timeout',
          'Gateway request exceeded its bounded timeout',
          { retryable: true, cause: error }
        );
      }
      throw new GatewayClientError(
        'dependency_unavailable',
        'Gateway request could not reach the configured ingress',
        { retryable: true, cause: error }
      );
    }
    let trace;
    let bytes;
    try {
      validateResponseShape(response);
      trace = response.headers.get(this.contract.error_contract.trace_header)
        ?? undefined;
      validateResponseMediaType(route, response, trace);
      bytes = await boundedResponseBytes(
        response,
        this.contract.limits.maximum_response_bytes,
        trace,
        lifecycle.signal
      );
    } catch (error) {
      if (error instanceof GatewayClientError) throw error;
      if (lifecycle.externalCancelled()) {
        throw new GatewayClientError(
          'request_cancelled',
          'Gateway request was cancelled',
          { traceId: trace, cause: error }
        );
      }
      if (lifecycle.timedOut()) {
        throw new GatewayClientError(
          'request_timeout',
          'Gateway request exceeded its bounded timeout',
          { traceId: trace, retryable: true, cause: error }
        );
      }
      throw new GatewayClientError(
        'invalid_gateway_response',
        'Gateway response body could not be read',
        { traceId: trace, cause: error }
      );
    } finally {
      lifecycle.close();
    }
    if (!response.ok) {
      const envelope = parseJson(bytes, trace);
      validateErrorEnvelope(envelope, trace);
      const code = envelope.error.code;
      const stable = this.contract.error_contract.stable_codes.includes(code);
      throw new GatewayClientError(
        code,
        stable ? envelope.error.message : 'Gateway request failed',
        {
        status: response.status,
        traceId: envelope.trace_id ?? trace,
        details: stable ? envelope.error.details : undefined,
        retryable: this.contract.error_contract.retryable_codes.includes(code)
        }
      );
    }
    if (route.response_media_type === 'application/openmetrics-text') {
      return new TextDecoder().decode(bytes);
    }
    const payload = parseJson(bytes, trace);
    validateRouteResponse(route, payload, trace);
    return payload;
  }
}

export function createGatewayClient(options) {
  return new GatewayClient(options);
}

export function validateIntentRequest(value) {
  if (!plainObject(value)) throw invalidRequest('Intent request must be an object');
  const keys = Object.keys(value);
  if (keys.some(key => !INTENT_FIELDS.has(key))) {
    throw invalidRequest('Intent request contains an unknown field');
  }
  if (
    typeof value.action !== 'string'
    || !value.action.length
    || value.action.length > 128
    || !ACTION.test(value.action)
  ) throw invalidRequest('Intent action is invalid');
  if (value.input !== undefined && !plainObject(value.input)) {
    throw invalidRequest('Intent input must be an object');
  }
  if (
    value.purpose !== undefined
    && (
      typeof value.purpose !== 'string'
      || !value.purpose.length
      || value.purpose.length > 512
    )
  ) throw invalidRequest('Intent purpose is invalid');
  for (const [field, maximum] of [
    ['data_scopes', 64],
    ['confirmations', 8],
    ['approval_ids', 8]
  ]) {
    if (
      value[field] !== undefined
      && (
        !Array.isArray(value[field])
        || value[field].length > maximum
        || value[field].some(item => (
          typeof item !== 'string'
          || !item.length
          || item.length > 160
        ))
      )
    ) throw invalidRequest(`Intent ${field} must contain non-empty strings`);
  }
  return value;
}

function routePath(route, params, query, contract) {
  if (!plainObject(params) || !plainObject(query)) {
    throw invalidRequest('Gateway route parameters must be objects');
  }
  const providedParams = Object.keys(params);
  if (
    providedParams.length !== route.path_parameters.length
    || providedParams.some(name => !route.path_parameters.includes(name))
  ) throw invalidRequest('Gateway path parameter inventory is invalid');
  let path = route.path;
  for (const name of route.path_parameters) {
    const value = params[name];
    if (typeof value !== 'string' || !value.length || value.length > 512) {
      throw invalidRequest(`Gateway path parameter is invalid: ${name}`);
    }
    path = path.replace(`:${name}`, encodeURIComponent(value));
  }
  const search = new URLSearchParams();
  let queryValues = 0;
  for (const [name, value] of Object.entries(query)) {
    if (!route.query_parameters.includes(name)) {
      throw invalidRequest(`Gateway query parameter is not allowed: ${name}`);
    }
    const values = Array.isArray(value) ? value : [value];
    if (!values.length) throw invalidRequest(`Gateway query parameter is empty: ${name}`);
    for (const item of values) {
      if (
        !['string', 'number', 'boolean'].includes(typeof item)
        || (typeof item === 'number' && !Number.isFinite(item))
        || String(item).length > contract.limits.maximum_query_value_length
      ) {
        throw invalidRequest(`Gateway query parameter is invalid: ${name}`);
      }
      queryValues += 1;
      if (queryValues > contract.limits.maximum_query_values) {
        throw invalidRequest('Gateway query contains too many values');
      }
      search.append(name, String(item));
    }
  }
  const suffix = search.size ? `?${search}` : '';
  const target = `${path}${suffix}`;
  if (!target.startsWith('/v1/') || target.includes('://')) {
    throw invalidRequest('Gateway client target escaped the same-origin boundary');
  }
  if (target.length > contract.limits.maximum_target_length) {
    throw invalidRequest('Gateway client target exceeds the contract length limit');
  }
  return target;
}

function validateIdempotencyKey(value, contract) {
  if (
    typeof value !== 'string'
    || value.length < contract.limits.idempotency_key_minimum_length
    || value.length > contract.limits.idempotency_key_maximum_length
    || !IDEMPOTENCY_KEY.test(value)
  ) throw invalidRequest('Gateway idempotency key is invalid');
}

function validateToken(token) {
  if (
    typeof token !== 'string'
    || !token.length
    || token.length > 4096
    || /[\r\n]/.test(token)
  ) throw invalidRequest('Gateway bearer token is invalid');
}

function boundedTimeout(value, contract) {
  if (
    !Number.isSafeInteger(value)
    || value < 1
    || value > contract.limits.maximum_timeout_ms
  ) throw invalidRequest('Gateway request timeout is outside the contract');
  return value;
}

function requestLifecycle(externalSignal, timeoutMs) {
  if (
    externalSignal !== undefined
    && (
      !externalSignal
      || typeof externalSignal.addEventListener !== 'function'
      || typeof externalSignal.aborted !== 'boolean'
    )
  ) throw invalidRequest('Gateway cancellation signal is invalid');
  const controller = new AbortController();
  let timeout = false;
  let external = Boolean(externalSignal?.aborted);
  const cancel = () => {
    external = true;
    controller.abort(externalSignal?.reason);
  };
  if (external) controller.abort(externalSignal.reason);
  else externalSignal?.addEventListener('abort', cancel, { once: true });
  const timer = setTimeout(() => {
    timeout = true;
    controller.abort();
  }, timeoutMs);
  return {
    signal: controller.signal,
    timedOut: () => timeout,
    externalCancelled: () => external,
    close: () => {
      clearTimeout(timer);
      externalSignal?.removeEventListener?.('abort', cancel);
    }
  };
}

async function boundedResponseBytes(response, maximum, traceId, signal) {
  const declared = Number(response.headers.get('content-length') ?? 0);
  if (Number.isFinite(declared) && declared > maximum) {
    throw new GatewayClientError(
      'response_too_large',
      'Gateway response exceeds the client contract limit',
      { status: response.status, traceId }
    );
  }
  const reader = response.body.getReader();
  const chunks = [];
  let size = 0;
  while (true) {
    const { done, value } = await abortableRead(reader, signal);
    if (done) break;
    size += value.byteLength;
    if (size > maximum) {
      await reader.cancel().catch(() => {});
      throw new GatewayClientError(
        'response_too_large',
        'Gateway response exceeds the client contract limit',
        { status: response.status, traceId }
      );
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

function abortableRead(reader, signal) {
  if (signal.aborted) return Promise.reject(signal.reason ?? new Error('aborted'));
  return new Promise((resolve, reject) => {
    const aborted = () => {
      reader.cancel(signal.reason).catch(() => {});
      reject(signal.reason ?? new Error('aborted'));
    };
    signal.addEventListener('abort', aborted, { once: true });
    reader.read().then(resolve, reject).finally(() => {
      signal.removeEventListener('abort', aborted);
    });
  });
}

function validateResponseShape(response) {
  if (
    !response
    || typeof response !== 'object'
    || typeof response.ok !== 'boolean'
    || !Number.isInteger(response.status)
    || typeof response.body?.getReader !== 'function'
    || typeof response.headers?.get !== 'function'
  ) throw new GatewayClientError(
    'invalid_gateway_response',
    'Gateway returned an invalid response object'
  );
}

function validateResponseMediaType(route, response, traceId) {
  const contentType = response.headers.get('content-type') ?? '';
  const mediaType = contentType.split(';', 1)[0].trim().toLowerCase();
  const expected = response.ok
    ? route.response_media_type
    : 'application/json';
  if (mediaType !== expected) {
    throw new GatewayClientError(
      'invalid_gateway_response',
      'Gateway response media type is invalid',
      { status: response.status, traceId }
    );
  }
}

function parseJson(bytes, traceId) {
  try {
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch (error) {
    throw new GatewayClientError(
      'invalid_gateway_response',
      'Gateway returned invalid JSON',
      { traceId, cause: error }
    );
  }
}

function validateErrorEnvelope(value, traceId) {
  if (
    !plainObject(value)
    || !exactKeys(value, ['error', 'trace_id'])
    || !plainObject(value.error)
    || !subsetKeys(value.error, ['code', 'message', 'details'])
    || typeof value.error.code !== 'string'
    || !/^[a-z][a-z0-9_]{0,63}$/.test(value.error.code)
    || typeof value.error.message !== 'string'
    || !value.error.message.length
    || typeof value.trace_id !== 'string'
    || !value.trace_id.length
    || value.trace_id.length > 160
  ) throw new GatewayClientError(
    'invalid_gateway_response',
    'Gateway error envelope is invalid',
    { traceId }
  );
}

function validateRouteResponse(route, value, traceId) {
  if (!plainObject(value)) {
    throw new GatewayClientError(
      'invalid_gateway_response',
      `Gateway response does not match ${route.response_schema}`,
      { traceId }
    );
  }
  for (const field of route.required_response_fields) {
    if (!Object.hasOwn(value, field)) {
      throw new GatewayClientError(
        'invalid_gateway_response',
        `Gateway response does not match ${route.response_schema}`,
        { traceId }
      );
    }
  }
}

function invalidRequest(message, cause) {
  return new GatewayClientError(
    'invalid_client_request',
    message,
    cause === undefined ? undefined : { cause }
  );
}

function plainObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function exactKeys(value, keys) {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length
    && actual.every((key, index) => key === expected[index]);
}

function subsetKeys(value, keys) {
  return Object.keys(value).every(key => keys.includes(key));
}

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}
