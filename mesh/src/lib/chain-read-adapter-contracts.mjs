import { canonicalJson, ValidationError } from './canonical.mjs';

export const CHAIN_READ_ADAPTER_SCHEMA = 'axiom-chain-read-adapter.v1';
export const CHAIN_READ_ADAPTER_SCHEMA_ID = 'urn:axiom:contract:chain-read-adapter:v1';
export const CHAIN_READ_ADAPTER_CATALOG = 'axiom-chain-read-adapter-catalog.v0';

export const CHAIN_READ_OPERATIONS = Object.freeze([
  'describeNetwork',
  'getHead',
  'getBlockReference',
  'getTransaction',
  'getReceiptOrOutcome',
  'getContractOrAccountState',
  'getLogsOrEvents',
  'verifyObservation',
  'classifyFinality'
]);

const FORBIDDEN_OPERATION_RE = /(sign|send|broadcast|write|execute|bridge)/i;
const MANIFEST_FIELDS = Object.freeze([
  'schema',
  'adapter_id',
  'adapter_version',
  'adapter_family',
  'supported_profile_ids',
  'normalized_operations',
  'family_rpc_methods',
  'network_access',
  'write_surface',
  'signing_surface',
  'bridge_execution',
  'installation_grants_authority',
  'non_claims'
]);

function requirePlain(value, name) {
  if (value === null || typeof value !== 'object' || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) {
    throw new ValidationError(`${name} must be a plain object`);
  }
}
function requireFields(value, fields, name) {
  requirePlain(value, name);
  for (const field of fields) if (!Object.hasOwn(value, field)) throw new ValidationError(`${name} is missing required field ${field}`);
}
function rejectUnknown(value, fields, name) {
  const allowed = new Set(fields);
  for (const field of Object.keys(value)) if (!allowed.has(field)) throw new ValidationError(`${name} contains unsupported field ${field}`);
}
function requireString(value, name, max = 512) {
  if (typeof value !== 'string' || value.length < 1 || value.length > max) throw new ValidationError(`${name} is invalid`);
}
function requireFalse(value, name) {
  if (value !== false) throw new ValidationError(`${name} must remain false`);
}
function requireStringArray(value, name, { min = 0, max = 64 } = {}) {
  if (!Array.isArray(value) || value.length < min || value.length > max) throw new ValidationError(`${name} must be a bounded array`);
  const seen = new Set();
  value.forEach((item, index) => {
    requireString(item, `${name}[${index}]`);
    if (seen.has(item)) throw new ValidationError(`${name} contains duplicate values`);
    seen.add(item);
  });
}
function validateDisabledSurface(value, name) {
  requireFields(value, ['enabled'], name);
  rejectUnknown(value, ['enabled'], name);
  requireFalse(value.enabled, `${name}.enabled`);
}

export function validateChainReadAdapterSchema(schema) {
  requirePlain(schema, 'chain read adapter schema');
  if (
    schema.$schema !== 'https://json-schema.org/draft/2020-12/schema'
    || schema.$id !== CHAIN_READ_ADAPTER_SCHEMA_ID
    || schema.title !== CHAIN_READ_ADAPTER_SCHEMA
    || schema.type !== 'object'
    || schema.additionalProperties !== false
    || schema.properties?.schema?.const !== CHAIN_READ_ADAPTER_SCHEMA
    || schema.properties?.installation_grants_authority?.const !== false
    || schema.properties?.network_access?.properties?.enabled?.const !== false
    || schema.properties?.write_surface?.properties?.enabled?.const !== false
    || schema.properties?.signing_surface?.properties?.enabled?.const !== false
    || schema.properties?.bridge_execution?.properties?.enabled?.const !== false
  ) throw new ValidationError('chain read adapter schema invariants are invalid');
  return true;
}

export function validateChainReadAdapterManifest(manifest) {
  requireFields(manifest, MANIFEST_FIELDS, 'chain read adapter manifest');
  rejectUnknown(manifest, MANIFEST_FIELDS, 'chain read adapter manifest');
  if (manifest.schema !== CHAIN_READ_ADAPTER_SCHEMA) throw new ValidationError('chain read adapter manifest schema is invalid');
  requireString(manifest.adapter_id, 'chain read adapter manifest.adapter_id', 160);
  requireString(manifest.adapter_version, 'chain read adapter manifest.adapter_version', 80);
  requireString(manifest.adapter_family, 'chain read adapter manifest.adapter_family', 64);
  requireStringArray(manifest.supported_profile_ids, 'chain read adapter manifest.supported_profile_ids', { min: 1, max: 32 });
  requireStringArray(manifest.normalized_operations, 'chain read adapter manifest.normalized_operations', { min: CHAIN_READ_OPERATIONS.length, max: CHAIN_READ_OPERATIONS.length });
  if (canonicalJson(manifest.normalized_operations) !== canonicalJson(CHAIN_READ_OPERATIONS)) {
    throw new ValidationError('chain read adapter manifest.normalized_operations must match the read-only contract');
  }
  for (const operation of manifest.normalized_operations) {
    if (FORBIDDEN_OPERATION_RE.test(operation)) throw new ValidationError('chain read adapter manifest.normalized_operations contains an effect-like operation');
  }
  requireStringArray(manifest.family_rpc_methods, 'chain read adapter manifest.family_rpc_methods', { min: 1, max: 64 });
  for (const method of manifest.family_rpc_methods) {
    if (FORBIDDEN_OPERATION_RE.test(method)) throw new ValidationError(`chain read adapter manifest.family_rpc_methods contains effect-like method ${method}`);
  }
  validateDisabledSurface(manifest.network_access, 'chain read adapter manifest.network_access');
  validateDisabledSurface(manifest.write_surface, 'chain read adapter manifest.write_surface');
  validateDisabledSurface(manifest.signing_surface, 'chain read adapter manifest.signing_surface');
  validateDisabledSurface(manifest.bridge_execution, 'chain read adapter manifest.bridge_execution');
  requireFalse(manifest.installation_grants_authority, 'chain read adapter manifest.installation_grants_authority');
  requireStringArray(manifest.non_claims, 'chain read adapter manifest.non_claims', { min: 1, max: 32 });
  return true;
}

export function validateChainReadAdapterCatalog(catalog) {
  requireFields(catalog, ['catalog', 'cataloged_at', 'adapters', 'non_claims'], 'chain read adapter catalog');
  rejectUnknown(catalog, ['catalog', 'cataloged_at', 'adapters', 'non_claims'], 'chain read adapter catalog');
  if (catalog.catalog !== CHAIN_READ_ADAPTER_CATALOG) throw new ValidationError('chain read adapter catalog identity is invalid');
  if (!Number.isFinite(Date.parse(catalog.cataloged_at))) throw new ValidationError('chain read adapter catalog.cataloged_at is invalid');
  if (!Array.isArray(catalog.adapters) || catalog.adapters.length !== 2) throw new ValidationError('chain read adapter catalog.adapters is invalid');
  const ids = new Set();
  for (const adapter of catalog.adapters) {
    validateChainReadAdapterManifest(adapter);
    if (ids.has(adapter.adapter_id)) throw new ValidationError(`duplicate chain read adapter ${adapter.adapter_id}`);
    ids.add(adapter.adapter_id);
  }
  requireStringArray(catalog.non_claims, 'chain read adapter catalog.non_claims', { min: 1, max: 32 });
  return true;
}
