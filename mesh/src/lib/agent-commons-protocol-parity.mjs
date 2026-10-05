import {
  ValidationError,
  assertPlainObject,
  assertString,
  canonicalJson,
  digestObject
} from './canonical.mjs';

export const AGENT_COMMONS_PROTOCOL_PROJECTION_PARITY_SCHEMA =
  'axiom-agent-commons-protocol-projection-parity.v1';

const METHOD = /^[a-z][a-z0-9._:-]{1,127}$/;
const EXTERNAL_ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,191}$/;
const DIGEST = /^[a-f0-9]{64}$/;

const REPORT_KEYS = new Set([
  'schema',
  'parity_scope',
  'c0_methods',
  'mappings',
  'c0_methods_digest',
  'mcp_mapping_digest',
  'a2a_mapping_digest',
  'mapping_equivalent',
  'c0_semantics_authoritative',
  'source_exports_authenticated',
  'mcp_transport_verified',
  'a2a_transport_verified',
  'protocol_conformance_claimed',
  'live_authorization_performed',
  'runtime_authority_parity_claimed',
  'discovery_is_permission',
  'protocol_metadata_is_permission',
  'authority_granted',
  'authority_effect',
  'delegation_effect',
  'report_authentication',
  'portable_assurance',
  'parity_digest'
]);

const MAPPING_KEYS = new Set(['c0_method', 'mcp_tool_name', 'a2a_skill_id']);

const FIXED_SEMANTICS = Object.freeze({
  parity_scope: 'offline-public-discovery-mapping-only',
  mapping_equivalent: true,
  c0_semantics_authoritative: true,
  source_exports_authenticated: false,
  mcp_transport_verified: false,
  a2a_transport_verified: false,
  protocol_conformance_claimed: false,
  live_authorization_performed: false,
  runtime_authority_parity_claimed: false,
  discovery_is_permission: false,
  protocol_metadata_is_permission: false,
  authority_granted: false,
  authority_effect: 'none',
  delegation_effect: 'none',
  report_authentication: 'none',
  portable_assurance: false
});

function exactObject(raw, allowed, label) {
  const value = assertPlainObject(raw, label);
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) throw new ValidationError(`${label} contains unsupported field ${key}`);
  }
  for (const key of allowed) {
    if (!Object.hasOwn(value, key)) throw new ValidationError(`${label} is missing required field ${key}`);
  }
  return value;
}

function methodId(value, label) {
  return assertString(value, label, { min: 2, max: 128, pattern: METHOD });
}

function externalId(value, label) {
  return assertString(value, label, { min: 1, max: 192, pattern: EXTERNAL_ID });
}

function digest(value, label) {
  return assertString(value, label, { min: 64, max: 64, pattern: DIGEST });
}

function normalizeMethods(raw) {
  if (!Array.isArray(raw) || raw.length < 1 || raw.length > 64) {
    throw new ValidationError('Agent Commons protocol parity requires 1-64 C0 methods');
  }
  const methods = raw.map((item, index) => methodId(item, `C0 method[${index}]`));
  if (new Set(methods).size !== methods.length) {
    throw new ValidationError('Agent Commons protocol parity C0 methods must be unique');
  }
  return Object.freeze([...methods].sort());
}

function normalizeProtocolMap(raw, label) {
  const value = assertPlainObject(raw, label);
  const entries = Object.entries(value);
  if (entries.length < 1 || entries.length > 64) {
    throw new ValidationError(`${label} must contain 1-64 mappings`);
  }
  return Object.freeze(entries.map(([external, method]) => Object.freeze({
    external_id: externalId(external, `${label} external id`),
    c0_method: methodId(method, `${label} C0 method`)
  })).sort((left, right) => left.external_id.localeCompare(right.external_id)));
}

function oneExternalIdPerMethod(entries, methods, label) {
  const knownMethods = new Set(methods);
  const byMethod = new Map();
  for (const entry of entries) {
    if (!knownMethods.has(entry.c0_method)) {
      throw new ValidationError(`${label} maps outside the canonical C0 method set`);
    }
    const existing = byMethod.get(entry.c0_method) ?? [];
    existing.push(entry.external_id);
    byMethod.set(entry.c0_method, existing);
  }
  for (const method of methods) {
    const ids = byMethod.get(method) ?? [];
    if (ids.length !== 1) {
      throw new ValidationError(`${label} must map exactly one external id to C0 method ${method}`);
    }
  }
  if (entries.length !== methods.length) {
    throw new ValidationError(`${label} must have exact one-to-one C0 coverage`);
  }
  return byMethod;
}

function assertFixedSemantics(value) {
  for (const [key, expected] of Object.entries(FIXED_SEMANTICS)) {
    if (value[key] !== expected) {
      throw new ValidationError(`Agent Commons protocol parity ${key} must remain ${String(expected)}`);
    }
  }
}

function normalizedMappingRecord(raw, index) {
  const value = exactObject(raw, MAPPING_KEYS, `Agent Commons protocol parity mapping[${index}]`);
  return Object.freeze({
    c0_method: methodId(value.c0_method, `mapping[${index}].c0_method`),
    mcp_tool_name: externalId(value.mcp_tool_name, `mapping[${index}].mcp_tool_name`),
    a2a_skill_id: externalId(value.a2a_skill_id, `mapping[${index}].a2a_skill_id`)
  });
}

function mappingEntriesFromReport(mappings, field) {
  return Object.freeze(mappings.map(item => Object.freeze({
    external_id: item[field],
    c0_method: item.c0_method
  })).sort((left, right) => left.external_id.localeCompare(right.external_id)));
}

export function createAgentCommonsProtocolProjectionParity({
  c0Methods,
  mcpToolMap,
  a2aSkillMap
} = {}) {
  const methods = normalizeMethods(c0Methods);
  const mcp = normalizeProtocolMap(mcpToolMap, 'Agent Commons MCP tool map');
  const a2a = normalizeProtocolMap(a2aSkillMap, 'Agent Commons A2A skill map');
  const mcpByMethod = oneExternalIdPerMethod(mcp, methods, 'Agent Commons MCP tool map');
  const a2aByMethod = oneExternalIdPerMethod(a2a, methods, 'Agent Commons A2A skill map');

  const mappings = Object.freeze(methods.map(method => Object.freeze({
    c0_method: method,
    mcp_tool_name: mcpByMethod.get(method)[0],
    a2a_skill_id: a2aByMethod.get(method)[0]
  })));

  const body = Object.freeze({
    schema: AGENT_COMMONS_PROTOCOL_PROJECTION_PARITY_SCHEMA,
    parity_scope: FIXED_SEMANTICS.parity_scope,
    c0_methods: methods,
    mappings,
    c0_methods_digest: digestObject(methods),
    mcp_mapping_digest: digestObject(mcp),
    a2a_mapping_digest: digestObject(a2a),
    ...FIXED_SEMANTICS
  });
  const report = Object.freeze({ ...body, parity_digest: digestObject(body) });
  return validateAgentCommonsProtocolProjectionParity(report);
}

export function validateAgentCommonsProtocolProjectionParity(raw) {
  const value = exactObject(raw, REPORT_KEYS, 'Agent Commons protocol parity report');
  if (value.schema !== AGENT_COMMONS_PROTOCOL_PROJECTION_PARITY_SCHEMA) {
    throw new ValidationError(
      `Agent Commons protocol parity schema must be ${AGENT_COMMONS_PROTOCOL_PROJECTION_PARITY_SCHEMA}`
    );
  }
  assertFixedSemantics(value);
  const methods = normalizeMethods(value.c0_methods);
  if (canonicalJson(methods) !== canonicalJson(value.c0_methods)) {
    throw new ValidationError('Agent Commons protocol parity C0 methods must be canonical sorted order');
  }
  if (!Array.isArray(value.mappings) || value.mappings.length !== methods.length) {
    throw new ValidationError('Agent Commons protocol parity mappings must cover every C0 method exactly once');
  }
  const mappings = value.mappings.map(normalizedMappingRecord);
  const mappingMethods = mappings.map(item => item.c0_method);
  if (canonicalJson(mappingMethods) !== canonicalJson(methods)) {
    throw new ValidationError('Agent Commons protocol parity mapping order/coverage drifted');
  }
  if (new Set(mappings.map(item => item.mcp_tool_name)).size !== mappings.length) {
    throw new ValidationError('Agent Commons protocol parity MCP tool names must be unique');
  }
  if (new Set(mappings.map(item => item.a2a_skill_id)).size !== mappings.length) {
    throw new ValidationError('Agent Commons protocol parity A2A skill ids must be unique');
  }

  const c0Digest = digest(value.c0_methods_digest, 'Agent Commons protocol parity c0_methods_digest');
  const mcpDigest = digest(value.mcp_mapping_digest, 'Agent Commons protocol parity mcp_mapping_digest');
  const a2aDigest = digest(value.a2a_mapping_digest, 'Agent Commons protocol parity a2a_mapping_digest');
  if (c0Digest !== digestObject(methods)) {
    throw new ValidationError('Agent Commons protocol parity C0 method digest mismatch');
  }
  if (mcpDigest !== digestObject(mappingEntriesFromReport(mappings, 'mcp_tool_name'))) {
    throw new ValidationError('Agent Commons protocol parity MCP mapping digest mismatch');
  }
  if (a2aDigest !== digestObject(mappingEntriesFromReport(mappings, 'a2a_skill_id'))) {
    throw new ValidationError('Agent Commons protocol parity A2A mapping digest mismatch');
  }

  const suppliedDigest = digest(value.parity_digest, 'Agent Commons protocol parity parity_digest');
  const { parity_digest: ignored, ...body } = value;
  if (suppliedDigest !== digestObject(body)) {
    throw new ValidationError('Agent Commons protocol parity content digest mismatch');
  }
  return Object.freeze({ ...body, parity_digest: suppliedDigest });
}
