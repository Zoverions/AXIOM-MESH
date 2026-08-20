import { lstat, readFile, realpath } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { canonicalJson, sha256, ValidationError } from './canonical.mjs';
import {
  AGENT_COMMONS_READONLY_REQUEST_SCHEMA,
  createAgentCommonsReadonlyLab,
  validateAgentCommonsReadonlyResponse
} from './agent-commons-readonly-lab.mjs';

export const AGENT_COMMONS_MCP_READONLY_SCHEMA = 'axiom-agent-commons-mcp-readonly-lab.v1';
export const AGENT_COMMONS_MCP_OFFLINE_FRAME_SCHEMA = 'axiom-agent-commons-mcp-offline-frame.v1';
export const MCP_PROTOCOL_VERSION = '2026-07-28';

export const MCP_METHODS = Object.freeze([
  'server/discover',
  'tools/list',
  'tools/call'
]);

export const MCP_TOOL_MAP = Object.freeze({
  axiom_project_get: 'project.get',
  axiom_capabilities_list: 'capabilities.list',
  axiom_challenges_list: 'challenges.list',
  axiom_schemas_list: 'schemas.list',
  axiom_verification_get: 'verification.get',
  axiom_protocols_get: 'protocols.get'
});

export const MCP_ERROR_CODES = Object.freeze({
  invalid_request: -32600,
  method_not_found: -32601,
  invalid_params: -32602,
  header_mismatch: -32001,
  unsupported_protocol_version: -32022,
  internal_error: -32603
});

const PROJECT = 'AXIOM-MESH';
const SUPPORTED_BUILD = '0.12.0-dev.3';
const CANONICAL_REPOSITORY = 'Zoverions/AXIOM-MESH';
const LABORATORY_BASE_SHA = '12fb3ee94a0561480ad1eba3faafa6de27c793fd';
const MANIFEST_PATH = resolve(
  fileURLToPath(new URL('../../..', import.meta.url)),
  'agent-commons',
  'mcp-readonly-lab.json'
);
const MANIFEST_MAX_BYTES = 65_536;
const JSONRPC_ID_STRING = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const SAFE_CLIENT_TEXT = /^[\x20-\x7e]+$/;

const LIMITS = Object.freeze({
  max_frame_bytes: 8192,
  max_response_bytes: 131072,
  max_client_info_name_chars: 128,
  max_client_info_version_chars: 64,
  max_client_capability_keys: 16,
  max_client_capabilities_bytes: 4096,
  tools_list_ttl_ms: 0
});

const META_PROTOCOL_VERSION = 'io.modelcontextprotocol/protocolVersion';
const META_CLIENT_INFO = 'io.modelcontextprotocol/clientInfo';
const META_CLIENT_CAPABILITIES = 'io.modelcontextprotocol/clientCapabilities';
const META_KEYS = Object.freeze([
  META_PROTOCOL_VERSION,
  META_CLIENT_INFO,
  META_CLIENT_CAPABILITIES
]);

const TOOL_DEFINITIONS = Object.freeze([
  toolDefinition(
    'axiom_project_get',
    'AXIOM public project state',
    'Read bounded public AXIOM-MESH project identity and explicit non-authority flags.'
  ),
  toolDefinition(
    'axiom_capabilities_list',
    'AXIOM public capability status',
    'Read public capability ids, families, statuses, counts, and the validated registry digest.'
  ),
  toolDefinition(
    'axiom_challenges_list',
    'AXIOM public challenges',
    'Read open public Agent Commons challenges from the validated discovery-only registry.'
  ),
  toolDefinition(
    'axiom_schemas_list',
    'AXIOM public schema inventory',
    'Read the fixed public schema path inventory with byte counts and SHA-256 content hashes.'
  ),
  toolDefinition(
    'axiom_verification_get',
    'AXIOM public verification instructions',
    'Read bounded public verification commands and explicit external-validation non-claims.'
  ),
  toolDefinition(
    'axiom_protocols_get',
    'AXIOM protocol reference status',
    'Read candidate protocol references and explicit compatibility non-claims.'
  )
]);

export function validateAgentCommonsMcpReadonlyManifest(manifest) {
  exactKeys(manifest, 'Agent Commons MCP read-only manifest', [
    'schema',
    'version',
    'project',
    'supported_build',
    'canonical_repository',
    'laboratory_base_sha',
    'mcp_protocol_version',
    'transport',
    'network_listener',
    'streamable_http_implemented',
    'stdio_transport_implemented',
    'session_state',
    'initialize_supported',
    'public_state_only',
    'private_grid_access',
    'consequential_tools',
    'machine_authority_mapping',
    'compatibility_claimed',
    'production_compatibility_claimed',
    'methods',
    'tools',
    'limits',
    'error_codes',
    'claim_boundary'
  ]);

  if (
    manifest.schema !== AGENT_COMMONS_MCP_READONLY_SCHEMA
    || manifest.version !== 1
    || manifest.project !== PROJECT
    || manifest.supported_build !== SUPPORTED_BUILD
    || manifest.canonical_repository !== CANONICAL_REPOSITORY
    || manifest.laboratory_base_sha !== LABORATORY_BASE_SHA
    || manifest.mcp_protocol_version !== MCP_PROTOCOL_VERSION
  ) {
    throw new ValidationError('Agent Commons MCP read-only identity is invalid');
  }

  if (
    manifest.transport !== 'offline-normalized-metadata-only'
    || manifest.network_listener !== false
    || manifest.streamable_http_implemented !== false
    || manifest.stdio_transport_implemented !== false
    || manifest.session_state !== false
    || manifest.initialize_supported !== false
    || manifest.public_state_only !== true
    || manifest.private_grid_access !== false
    || manifest.consequential_tools !== false
    || manifest.machine_authority_mapping !== false
    || manifest.compatibility_claimed !== false
    || manifest.production_compatibility_claimed !== false
  ) {
    throw new ValidationError('Agent Commons MCP read-only authority/transport boundary is invalid');
  }

  exactArray(manifest.methods, MCP_METHODS, 'Agent Commons MCP methods');
  if (!Array.isArray(manifest.tools) || manifest.tools.length !== TOOL_DEFINITIONS.length) {
    throw new ValidationError('Agent Commons MCP tool mapping is invalid');
  }
  for (let index = 0; index < manifest.tools.length; index += 1) {
    const expected = TOOL_DEFINITIONS[index];
    const actual = manifest.tools[index];
    exactKeys(actual, `Agent Commons MCP tool mapping ${index}`, ['name', 'c0_method']);
    if (actual.name !== expected.name || actual.c0_method !== MCP_TOOL_MAP[expected.name]) {
      throw new ValidationError('Agent Commons MCP tool mapping drifted');
    }
  }

  exactKeys(manifest.limits, 'Agent Commons MCP limits', Object.keys(LIMITS));
  for (const [key, expected] of Object.entries(LIMITS)) {
    if (manifest.limits[key] !== expected) {
      throw new ValidationError(`Agent Commons MCP limit ${key} is invalid`);
    }
  }

  exactKeys(manifest.error_codes, 'Agent Commons MCP error codes', [
    'invalid_request',
    'method_not_found',
    'invalid_params',
    'header_mismatch',
    'unsupported_protocol_version',
    'internal_error'
  ]);
  for (const [key, expected] of Object.entries(MCP_ERROR_CODES)) {
    if (manifest.error_codes[key] !== expected) {
      throw new ValidationError(`Agent Commons MCP error code ${key} drifted`);
    }
  }

  if (
    typeof manifest.claim_boundary !== 'string'
    || manifest.claim_boundary.length < 120
    || !manifest.claim_boundary.includes('offline protocol projection')
    || !manifest.claim_boundary.includes('no network listener')
    || !manifest.claim_boundary.includes('production MCP compatibility claim')
  ) {
    throw new ValidationError('Agent Commons MCP claim boundary is invalid');
  }

  return Object.freeze({
    valid: true,
    schema: manifest.schema,
    protocol_version: manifest.mcp_protocol_version,
    transport: manifest.transport,
    network_listener: false,
    session_state: false,
    public_state_only: true,
    compatibility_claimed: false,
    tools: manifest.tools.length
  });
}

export async function createAgentCommonsMcpReadonlyProjection() {
  const manifest = await loadManifest();
  validateAgentCommonsMcpReadonlyManifest(manifest);

  // Construction validates that the underlying C0 public projection is readable
  // on this exact build. The object is intentionally discarded so no request
  // state is shared across MCP calls.
  await createAgentCommonsReadonlyLab();

  return Object.freeze({
    schema: AGENT_COMMONS_MCP_READONLY_SCHEMA,
    protocol_version: MCP_PROTOCOL_VERSION,
    transport: 'offline-normalized-metadata-only',
    network_listener: false,
    session_state: false,
    public_state_only: true,
    compatibility_claimed: false,
    tools: Object.freeze(TOOL_DEFINITIONS.map(item => Object.freeze(structuredClone(item)))),
    async handle(frame) {
      return handleFrame(frame);
    }
  });
}

export async function handleAgentCommonsMcpReadonlyFrame(frame) {
  const projection = await createAgentCommonsMcpReadonlyProjection();
  return projection.handle(frame);
}

export function validateAgentCommonsMcpReadonlyResponse(response) {
  if (!plainObject(response)) {
    throw new ValidationError('Agent Commons MCP response must be an object');
  }
  if (response.jsonrpc !== '2.0') {
    throw new ValidationError('Agent Commons MCP response jsonrpc is invalid');
  }
  validateJsonRpcId(response.id, { allowNull: true });

  const hasResult = Object.hasOwn(response, 'result');
  const hasError = Object.hasOwn(response, 'error');
  if (hasResult === hasError) {
    throw new ValidationError('Agent Commons MCP response must contain exactly one of result or error');
  }

  if (hasResult) {
    exactKeys(response, 'Agent Commons MCP result response', ['jsonrpc', 'id', 'result']);
    if (!plainObject(response.result) || response.result.resultType !== 'complete') {
      throw new ValidationError('Agent Commons MCP result must be complete');
    }
  } else {
    exactKeys(response, 'Agent Commons MCP error response', ['jsonrpc', 'id', 'error']);
    exactKeys(response.error, 'Agent Commons MCP error', ['code', 'message', 'data']);
    if (!Number.isInteger(response.error.code) || typeof response.error.message !== 'string') {
      throw new ValidationError('Agent Commons MCP error shape is invalid');
    }
    if (!plainObject(response.error.data) || typeof response.error.data.classification !== 'string') {
      throw new ValidationError('Agent Commons MCP error data is invalid');
    }
  }

  if (Buffer.byteLength(canonicalJson(response), 'utf8') > LIMITS.max_response_bytes) {
    throw new ValidationError('Agent Commons MCP response exceeds its bound');
  }
  return response;
}

async function handleFrame(frame) {
  let id = null;
  try {
    const encoded = canonicalJson(frame);
    if (Buffer.byteLength(encoded, 'utf8') > LIMITS.max_frame_bytes) {
      throw protocolError(
        MCP_ERROR_CODES.invalid_request,
        'Request frame exceeds the offline laboratory size limit',
        'RequestTooLarge'
      );
    }

    const request = validateFrame(frame);
    id = request.body.id;
    const result = await dispatchRequest(request);
    const response = { jsonrpc: '2.0', id, result };
    ensureResponseBound(response);
    return response;
  } catch (error) {
    if (error instanceof McpProjectionError) {
      const response = errorResponse(id, error);
      ensureResponseBound(response);
      return response;
    }
    const response = errorResponse(
      id,
      protocolError(
        MCP_ERROR_CODES.invalid_request,
        'Invalid offline MCP request',
        'InvalidRequest'
      )
    );
    ensureResponseBound(response);
    return response;
  }
}

function validateFrame(frame) {
  exactKeys(frame, 'Agent Commons MCP offline frame', ['schema', 'headers', 'body']);
  if (frame.schema !== AGENT_COMMONS_MCP_OFFLINE_FRAME_SCHEMA) {
    throw protocolError(MCP_ERROR_CODES.invalid_request, 'Offline MCP frame schema is invalid', 'InvalidRequest');
  }
  if (!plainObject(frame.headers)) {
    throw protocolError(MCP_ERROR_CODES.invalid_request, 'Offline MCP headers are invalid', 'InvalidRequest');
  }
  if (!plainObject(frame.body)) {
    throw protocolError(MCP_ERROR_CODES.invalid_request, 'JSON-RPC body is invalid', 'InvalidRequest');
  }

  const body = validateBody(frame.body);
  validateNormalizedHeaders(frame.headers, body);
  validateRequestMeta(body.params._meta);
  return { headers: frame.headers, body };
}

function validateBody(body) {
  exactKeys(body, 'Agent Commons MCP JSON-RPC request', ['jsonrpc', 'id', 'method', 'params']);
  if (body.jsonrpc !== '2.0') {
    throw protocolError(MCP_ERROR_CODES.invalid_request, 'JSON-RPC version must be 2.0', 'InvalidRequest');
  }
  validateJsonRpcId(body.id);
  if (typeof body.method !== 'string' || !body.method.length) {
    throw protocolError(MCP_ERROR_CODES.invalid_request, 'JSON-RPC method is invalid', 'InvalidRequest');
  }
  if (!MCP_METHODS.includes(body.method)) {
    throw protocolError(MCP_ERROR_CODES.method_not_found, 'MCP method is not available in this laboratory', 'MethodNotFound', {
      requested: boundedErrorString(body.method)
    });
  }
  if (!plainObject(body.params)) {
    throw protocolError(MCP_ERROR_CODES.invalid_params, 'MCP params must be an object', 'InvalidParams');
  }

  if (body.method === 'server/discover' || body.method === 'tools/list') {
    exactProtocolParamKeys(body.params, ['_meta']);
  } else if (body.method === 'tools/call') {
    exactProtocolParamKeys(body.params, ['name', 'arguments', '_meta']);
    if (typeof body.params.name !== 'string' || !Object.hasOwn(MCP_TOOL_MAP, body.params.name)) {
      throw protocolError(MCP_ERROR_CODES.invalid_params, 'MCP tool name is unknown', 'UnknownTool', {
        requested: boundedErrorString(body.params.name)
      });
    }
    if (!plainObject(body.params.arguments) || Object.keys(body.params.arguments).length !== 0) {
      throw protocolError(MCP_ERROR_CODES.invalid_params, 'AXIOM read-only MCP tools accept no arguments', 'InvalidToolArguments');
    }
  }

  return body;
}

function validateNormalizedHeaders(headers, body) {
  const named = body.method === 'tools/call';
  const expectedKeys = named
    ? ['mcp-protocol-version', 'mcp-method', 'mcp-name']
    : ['mcp-protocol-version', 'mcp-method'];
  const actualKeys = Object.keys(headers).sort();
  if (actualKeys.length !== expectedKeys.length || actualKeys.some((key, index) => key !== [...expectedKeys].sort()[index])) {
    throw protocolError(
      MCP_ERROR_CODES.header_mismatch,
      'Required normalized MCP routing metadata is missing or ambiguous',
      'HeaderMismatch'
    );
  }

  if (headers['mcp-protocol-version'] !== MCP_PROTOCOL_VERSION) {
    throw protocolError(
      MCP_ERROR_CODES.unsupported_protocol_version,
      'Unsupported MCP protocol version',
      'UnsupportedProtocolVersion',
      {
        requested: boundedErrorString(headers['mcp-protocol-version']),
        supported: [MCP_PROTOCOL_VERSION]
      }
    );
  }
  if (headers['mcp-method'] !== body.method) {
    throw protocolError(
      MCP_ERROR_CODES.header_mismatch,
      'Mcp-Method metadata does not match the JSON-RPC method',
      'HeaderMismatch'
    );
  }
  if (named && headers['mcp-name'] !== body.params.name) {
    throw protocolError(
      MCP_ERROR_CODES.header_mismatch,
      'Mcp-Name metadata does not match the JSON-RPC tool name',
      'HeaderMismatch'
    );
  }
}

function validateRequestMeta(meta) {
  if (!plainObject(meta)) {
    throw protocolError(MCP_ERROR_CODES.invalid_params, 'MCP request _meta is required', 'InvalidParams');
  }
  const keys = Object.keys(meta).sort();
  const allowed = new Set(META_KEYS);
  if (!keys.includes(META_PROTOCOL_VERSION) || keys.some(key => !allowed.has(key))) {
    throw protocolError(MCP_ERROR_CODES.invalid_params, 'MCP request _meta fields are unsupported', 'InvalidParams');
  }
  if (meta[META_PROTOCOL_VERSION] !== MCP_PROTOCOL_VERSION) {
    throw protocolError(
      MCP_ERROR_CODES.unsupported_protocol_version,
      'Per-request MCP protocol version is unsupported',
      'UnsupportedProtocolVersion',
      {
        requested: boundedErrorString(meta[META_PROTOCOL_VERSION]),
        supported: [MCP_PROTOCOL_VERSION]
      }
    );
  }

  if (Object.hasOwn(meta, META_CLIENT_INFO)) validateClientInfo(meta[META_CLIENT_INFO]);
  if (Object.hasOwn(meta, META_CLIENT_CAPABILITIES)) {
    validateClientCapabilities(meta[META_CLIENT_CAPABILITIES]);
  }
}

function validateClientInfo(info) {
  exactProtocolObjectKeys(info, ['name', 'version'], 'MCP clientInfo');
  validateSafeClientString(
    info.name,
    'MCP clientInfo name',
    LIMITS.max_client_info_name_chars
  );
  validateSafeClientString(
    info.version,
    'MCP clientInfo version',
    LIMITS.max_client_info_version_chars
  );
}

function validateClientCapabilities(capabilities) {
  if (!plainObject(capabilities)) {
    throw protocolError(MCP_ERROR_CODES.invalid_params, 'MCP clientCapabilities must be an object', 'InvalidParams');
  }
  if (Object.keys(capabilities).length > LIMITS.max_client_capability_keys) {
    throw protocolError(MCP_ERROR_CODES.invalid_params, 'MCP clientCapabilities contain too many keys', 'InvalidParams');
  }
  let encoded;
  try {
    encoded = canonicalJson(capabilities);
  } catch {
    throw protocolError(MCP_ERROR_CODES.invalid_params, 'MCP clientCapabilities are not canonical JSON data', 'InvalidParams');
  }
  if (Buffer.byteLength(encoded, 'utf8') > LIMITS.max_client_capabilities_bytes) {
    throw protocolError(MCP_ERROR_CODES.invalid_params, 'MCP clientCapabilities exceed the size limit', 'InvalidParams');
  }
}

async function dispatchRequest(request) {
  switch (request.body.method) {
    case 'server/discover':
      return {
        resultType: 'complete',
        supportedVersions: [MCP_PROTOCOL_VERSION],
        capabilities: { tools: {} },
        serverInfo: {
          name: 'axiom-mesh-agent-commons-readonly-lab',
          version: SUPPORTED_BUILD
        },
        instructions: 'Offline read-only Agent Commons laboratory. Discovery is not authorization. No write-capable tools, private Grid access, sessions, or network listener are exposed.',
        ttlMs: 0,
        cacheScope: 'public'
      };
    case 'tools/list':
      return {
        resultType: 'complete',
        tools: TOOL_DEFINITIONS.map(item => structuredClone(item)),
        ttlMs: LIMITS.tools_list_ttl_ms,
        cacheScope: 'public'
      };
    case 'tools/call':
      return callReadonlyTool(request.body.id, request.body.params.name);
    default:
      throw protocolError(MCP_ERROR_CODES.method_not_found, 'MCP method is unavailable', 'MethodNotFound');
  }
}

async function callReadonlyTool(jsonRpcId, toolName) {
  const method = MCP_TOOL_MAP[toolName];
  const lab = await createAgentCommonsReadonlyLab();
  const c0Id = `mcp-${sha256(canonicalJson(jsonRpcId)).slice(0, 24)}`;
  const response = await lab.request({
    schema: AGENT_COMMONS_READONLY_REQUEST_SCHEMA,
    id: c0Id,
    method,
    params: {}
  });
  validateAgentCommonsReadonlyResponse(response);

  const structuredContent = {
    axiom_method: method,
    axiom_response: response
  };
  return {
    resultType: 'complete',
    content: [
      {
        type: 'text',
        text: canonicalJson(structuredContent)
      }
    ],
    structuredContent,
    isError: false
  };
}

async function loadManifest() {
  const metadata = await lstat(MANIFEST_PATH);
  if (!metadata.isFile() || metadata.isSymbolicLink() || metadata.size > MANIFEST_MAX_BYTES) {
    throw new ValidationError('Agent Commons MCP read-only manifest file is invalid');
  }
  const canonical = await realpath(MANIFEST_PATH);
  if (resolve(canonical) !== resolve(MANIFEST_PATH)) {
    throw new ValidationError('Agent Commons MCP read-only manifest cannot traverse links');
  }
  try {
    return JSON.parse(await readFile(canonical, 'utf8'));
  } catch {
    throw new ValidationError('Agent Commons MCP read-only manifest must contain valid JSON');
  }
}

function toolDefinition(name, title, description) {
  return Object.freeze({
    name,
    title,
    description,
    inputSchema: Object.freeze({
      type: 'object',
      properties: Object.freeze({}),
      additionalProperties: false
    }),
    outputSchema: Object.freeze({ type: 'object' })
  });
}

function exactProtocolParamKeys(value, expected) {
  try {
    exactKeys(value, 'MCP params', expected);
  } catch {
    throw protocolError(MCP_ERROR_CODES.invalid_params, 'MCP params fields are invalid', 'InvalidParams');
  }
}

function exactProtocolObjectKeys(value, expected, label) {
  try {
    exactKeys(value, label, expected);
  } catch {
    throw protocolError(MCP_ERROR_CODES.invalid_params, `${label} fields are invalid`, 'InvalidParams');
  }
}

function validateSafeClientString(value, label, max) {
  if (
    typeof value !== 'string'
    || value.length < 1
    || value.length > max
    || !SAFE_CLIENT_TEXT.test(value)
  ) {
    throw protocolError(MCP_ERROR_CODES.invalid_params, `${label} is invalid`, 'InvalidParams');
  }
}

function validateJsonRpcId(id, { allowNull = false } = {}) {
  if (allowNull && id === null) return id;
  if (typeof id === 'string') {
    if (!JSONRPC_ID_STRING.test(id)) {
      throw new ValidationError('JSON-RPC string id is invalid');
    }
    return id;
  }
  if (Number.isSafeInteger(id)) return id;
  throw new ValidationError('JSON-RPC id must be a bounded string or safe integer');
}

function exactArray(actual, expected, label) {
  if (!Array.isArray(actual) || canonicalJson(actual) !== canonicalJson(expected)) {
    throw new ValidationError(`${label} are invalid`);
  }
}

function exactKeys(value, label, expected) {
  if (!plainObject(value)) {
    throw new ValidationError(`${label} must be an object`);
  }
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) {
    throw new ValidationError(`${label} fields are invalid`);
  }
}

function plainObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function protocolError(code, message, classification, extra = {}) {
  return new McpProjectionError(code, message, classification, extra);
}

function errorResponse(id, error) {
  let safeId = null;
  try {
    safeId = validateJsonRpcId(id, { allowNull: true });
  } catch {
    safeId = null;
  }
  return {
    jsonrpc: '2.0',
    id: safeId,
    error: {
      code: error.code,
      message: error.message,
      data: {
        classification: error.classification,
        ...error.extra
      }
    }
  };
}

function ensureResponseBound(response) {
  if (Buffer.byteLength(canonicalJson(response), 'utf8') > LIMITS.max_response_bytes) {
    throw new ValidationError('Agent Commons MCP response exceeds the offline laboratory size limit');
  }
}

function boundedErrorString(value) {
  if (typeof value !== 'string') return null;
  return value.slice(0, 160);
}

class McpProjectionError extends Error {
  constructor(code, message, classification, extra = {}) {
    super(message);
    this.name = 'McpProjectionError';
    this.code = code;
    this.classification = classification;
    this.extra = extra;
  }
}
