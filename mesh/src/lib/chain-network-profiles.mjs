import { digestObject, ValidationError } from './canonical.mjs';
import { validateChainIdentity } from './chain-boundary-contracts.mjs';

export const CHAIN_NETWORK_PROFILE_SCHEMA = 'axiom-chain-network-profile.v0';
export const CHAIN_NETWORK_PROFILE_CATALOG = 'axiom-chain-network-profile-catalog.v0';

const PROFILE_FIELDS = Object.freeze([
  'schema',
  'profile_id',
  'profile_version',
  'chain',
  'finality_policy',
  'rpc',
  'authority_boundary',
  'safety_notes'
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

function requireBoolean(value, name, expected) {
  if (typeof value !== 'boolean') throw new ValidationError(`${name} must be boolean`);
  if (value !== expected) throw new ValidationError(`${name} must be ${expected}`);
}

function requireStringArray(value, name, max = 32) {
  if (!Array.isArray(value) || value.length > max) throw new ValidationError(`${name} must be a bounded array`);
  const seen = new Set();
  value.forEach((item, index) => {
    requireString(item, `${name}[${index}]`, 512);
    if (seen.has(item)) throw new ValidationError(`${name} contains duplicate values`);
    seen.add(item);
  });
}

export function chainNetworkProfileDigest(profile) {
  requirePlain(profile, 'chain network profile');
  const chain = { ...profile.chain };
  delete chain.profile_sha256;
  return digestObject({
    schema: profile.schema,
    profile_id: profile.profile_id,
    profile_version: profile.profile_version,
    chain,
    finality_policy: profile.finality_policy,
    rpc: profile.rpc,
    authority_boundary: profile.authority_boundary,
    safety_notes: profile.safety_notes
  });
}

export function validateChainNetworkProfile(profile) {
  requireFields(profile, PROFILE_FIELDS, 'chain network profile');
  rejectUnknown(profile, PROFILE_FIELDS, 'chain network profile');
  if (profile.schema !== CHAIN_NETWORK_PROFILE_SCHEMA) throw new ValidationError('chain network profile schema is invalid');
  requireString(profile.profile_id, 'chain network profile.profile_id', 160);
  requireString(profile.profile_version, 'chain network profile.profile_version', 80);
  validateChainIdentity(profile.chain);
  if (profile.chain.profile_version !== profile.profile_version) throw new ValidationError('chain network profile version mismatch');

  requireFields(profile.finality_policy, ['model', 'minimum_status'], 'chain network profile.finality_policy');
  rejectUnknown(profile.finality_policy, ['model', 'minimum_status'], 'chain network profile.finality_policy');
  requireString(profile.finality_policy.model, 'chain network profile.finality_policy.model', 80);
  requireString(profile.finality_policy.minimum_status, 'chain network profile.finality_policy.minimum_status', 80);

  requireFields(profile.rpc, ['endpoints', 'credentials_required'], 'chain network profile.rpc');
  rejectUnknown(profile.rpc, ['endpoints', 'credentials_required'], 'chain network profile.rpc');
  if (!Array.isArray(profile.rpc.endpoints) || profile.rpc.endpoints.length !== 0) {
    throw new ValidationError('chain network profile.rpc.endpoints must remain empty in v0');
  }
  requireBoolean(profile.rpc.credentials_required, 'chain network profile.rpc.credentials_required', false);

  requireFields(profile.authority_boundary, ['profile_grants_authority', 'live_network_enabled', 'write_enabled'], 'chain network profile.authority_boundary');
  rejectUnknown(profile.authority_boundary, ['profile_grants_authority', 'live_network_enabled', 'write_enabled'], 'chain network profile.authority_boundary');
  requireBoolean(profile.authority_boundary.profile_grants_authority, 'chain network profile.authority_boundary.profile_grants_authority', false);
  requireBoolean(profile.authority_boundary.live_network_enabled, 'chain network profile.authority_boundary.live_network_enabled', false);
  requireBoolean(profile.authority_boundary.write_enabled, 'chain network profile.authority_boundary.write_enabled', false);

  requireStringArray(profile.safety_notes, 'chain network profile.safety_notes');
  if (profile.chain.profile_sha256 !== chainNetworkProfileDigest(profile)) {
    throw new ValidationError('chain network profile.profile_sha256 does not match profile material');
  }
  return true;
}

export function validateChainNetworkProfileCatalog(catalog) {
  requireFields(catalog, ['catalog', 'cataloged_at', 'profiles', 'non_claims'], 'chain network profile catalog');
  rejectUnknown(catalog, ['catalog', 'cataloged_at', 'profiles', 'non_claims'], 'chain network profile catalog');
  if (catalog.catalog !== CHAIN_NETWORK_PROFILE_CATALOG) throw new ValidationError('chain network profile catalog identity is invalid');
  if (!Number.isFinite(Date.parse(catalog.cataloged_at))) throw new ValidationError('chain network profile catalog.cataloged_at is invalid');
  if (!Array.isArray(catalog.profiles) || catalog.profiles.length < 1 || catalog.profiles.length > 64) {
    throw new ValidationError('chain network profile catalog.profiles is invalid');
  }
  const ids = new Set();
  for (const profile of catalog.profiles) {
    validateChainNetworkProfile(profile);
    if (ids.has(profile.profile_id)) throw new ValidationError(`duplicate chain network profile ${profile.profile_id}`);
    ids.add(profile.profile_id);
  }
  requireStringArray(catalog.non_claims, 'chain network profile catalog.non_claims', 32);
  return true;
}
