import { canonicalJson, ValidationError } from './canonical.mjs';

export const CHAIN_BOUNDARY_SCHEMA = 'axiom-chain-boundary.v1';
export const CHAIN_BOUNDARY_SCHEMA_ID = 'urn:axiom:contract:chain-boundary:v1';

const SHA256_RE = /^[a-f0-9]{64}$/;
const VERSION_RE = /^[0-9]+\.[0-9]+\.[0-9]+(?:[-+][0-9A-Za-z.-]+)?$/;
const FINALITY_MODELS = Object.freeze([
  'probabilistic-depth',
  'finalized-checkpoint',
  'validity-proof-settlement',
  'sequencer-plus-l1',
  'bft-threshold',
  'other'
]);
const VERIFICATION_STATES = Object.freeze([
  'unverified',
  'provider-reported',
  'independently-verified',
  'conflicted',
  'unsupported'
]);
const FINALITY_STATES = Object.freeze(['pending', 'provisional', 'final', 'reverted', 'uncertain']);
const SETTLEMENT_STATES = Object.freeze(['observed', 'verified', 'final', 'disputed', 'reverted', 'failed']);
const ASSET_KINDS = Object.freeze(['native', 'token', 'wrapped', 'bridged', 'other']);
const OBSERVATION_TYPES = Object.freeze(['block', 'transaction', 'receipt', 'event', 'account-state', 'contract-state', 'other']);

function requirePlain(value, name) {
  if (value === null || typeof value !== 'object' || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) {
    throw new ValidationError(`${name} must be a plain object`);
  }
}

function requireFields(value, fields, name) {
  requirePlain(value, name);
  for (const field of fields) {
    if (!Object.hasOwn(value, field)) throw new ValidationError(`${name} is missing required field ${field}`);
  }
}

function rejectUnknown(value, fields, name) {
  const allowed = new Set(fields);
  for (const field of Object.keys(value)) {
    if (!allowed.has(field)) throw new ValidationError(`${name} contains unsupported field ${field}`);
  }
}

function requireString(value, name, { max = 2048, pattern } = {}) {
  if (typeof value !== 'string' || value.length < 1 || value.length > max) {
    throw new ValidationError(`${name} must be a bounded non-empty string`);
  }
  if (pattern && !pattern.test(value)) throw new ValidationError(`${name} is invalid`);
}

function requireEnum(value, allowed, name) {
  if (!allowed.includes(value)) throw new ValidationError(`${name} is invalid`);
}

function requireInteger(value, name) {
  if (!Number.isSafeInteger(value) || value < 0) throw new ValidationError(`${name} must be a non-negative safe integer`);
}

function requireSha256(value, name) {
  requireString(value, name, { max: 64, pattern: SHA256_RE });
}

function requireVersion(value, name) {
  requireString(value, name, { max: 80, pattern: VERSION_RE });
}

function requireDateTime(value, name) {
  requireString(value, name, { max: 80 });
  if (!Number.isFinite(Date.parse(value))) throw new ValidationError(`${name} is invalid`);
}

function validateStrings(value, name, { max = 64 } = {}) {
  if (!Array.isArray(value) || value.length > max) throw new ValidationError(`${name} must be a bounded array`);
  const seen = new Set();
  value.forEach((item, index) => {
    requireString(item, `${name}[${index}]`, { max: 512 });
    if (seen.has(item)) throw new ValidationError(`${name} contains duplicate values`);
    seen.add(item);
  });
}

function exactArray(actual, expected, name) {
  if (!Array.isArray(actual) || canonicalJson([...actual].sort()) !== canonicalJson([...expected].sort())) {
    throw new ValidationError(`${name} are invalid`);
  }
}

export function validateChainBoundarySchema(schema) {
  requirePlain(schema, 'Chain boundary schema');
  if (
    schema.$schema !== 'https://json-schema.org/draft/2020-12/schema'
    || schema.$id !== CHAIN_BOUNDARY_SCHEMA_ID
    || schema.title !== CHAIN_BOUNDARY_SCHEMA
  ) throw new ValidationError('Chain boundary schema identity is invalid');
  for (const name of ['chainIdentity', 'transactionReference', 'assetIdentity', 'finalityEvidence', 'chainObservation', 'settlementEvidence', 'anchorEvidence', 'bridgeRoute']) {
    if (schema.$defs?.[name]?.type !== 'object' || schema.$defs?.[name]?.additionalProperties !== false) {
      throw new ValidationError(`Chain boundary schema definition ${name} is not strict`);
    }
  }
  exactArray(schema.$defs.finalityEvidence.properties.model.enum, FINALITY_MODELS, 'Finality models');
  exactArray(schema.$defs.finalityEvidence.properties.verification_status.enum, VERIFICATION_STATES, 'Verification states');
  exactArray(schema.$defs.settlementEvidence.properties.status.enum, SETTLEMENT_STATES, 'Settlement states');
  return true;
}

export function validateChainIdentity(value) {
  const fields = ['schema', 'adapter_family', 'namespace', 'network_id', 'display_name', 'profile_version', 'profile_sha256'];
  requireFields(value, fields, 'chain identity');
  rejectUnknown(value, fields, 'chain identity');
  if (value.schema !== 'axiom-chain-identity.v1') throw new ValidationError('chain identity schema is invalid');
  requireString(value.adapter_family, 'chain identity.adapter_family', { max: 64, pattern: /^[a-z0-9][a-z0-9._-]*$/ });
  requireString(value.namespace, 'chain identity.namespace', { max: 64, pattern: /^[a-z0-9][a-z0-9._-]*$/ });
  requireString(value.network_id, 'chain identity.network_id', { max: 128 });
  requireString(value.display_name, 'chain identity.display_name', { max: 160 });
  requireVersion(value.profile_version, 'chain identity.profile_version');
  requireSha256(value.profile_sha256, 'chain identity.profile_sha256');
  return true;
}

export function validateTransactionReference(value) {
  const fields = ['schema', 'chain', 'transaction_id'];
  requireFields(value, fields, 'transaction reference');
  rejectUnknown(value, fields, 'transaction reference');
  if (value.schema !== 'axiom-chain-transaction-reference.v1') throw new ValidationError('transaction reference schema is invalid');
  validateChainIdentity(value.chain);
  requireString(value.transaction_id, 'transaction reference.transaction_id', { max: 256 });
  return true;
}

export function validateAssetIdentity(value) {
  const required = ['schema', 'chain', 'asset_kind', 'local_identifier', 'representation_lineage'];
  const fields = [...required, 'decimals', 'symbol', 'name'];
  requireFields(value, required, 'asset identity');
  rejectUnknown(value, fields, 'asset identity');
  if (value.schema !== 'axiom-chain-asset.v1') throw new ValidationError('asset identity schema is invalid');
  validateChainIdentity(value.chain);
  requireEnum(value.asset_kind, ASSET_KINDS, 'asset identity.asset_kind');
  requireString(value.local_identifier, 'asset identity.local_identifier', { max: 512 });
  if (value.asset_kind !== 'native' && /^[A-Z0-9._-]{1,12}$/.test(value.local_identifier)) {
    throw new ValidationError('asset identity.local_identifier cannot be a ticker-like identifier');
  }
  if (value.decimals !== undefined) {
    requireInteger(value.decimals, 'asset identity.decimals');
    if (value.decimals > 255) throw new ValidationError('asset identity.decimals is invalid');
  }
  if (value.symbol !== undefined) requireString(value.symbol, 'asset identity.symbol', { max: 32 });
  if (value.name !== undefined) requireString(value.name, 'asset identity.name', { max: 160 });
  validateStrings(value.representation_lineage, 'asset identity.representation_lineage', { max: 32 });
  return true;
}

export function validateFinalityEvidence(value) {
  const fields = ['schema', 'chain', 'model', 'status', 'reference', 'verification_status', 'evidence_sha256', 'observed_at'];
  requireFields(value, fields, 'finality evidence');
  rejectUnknown(value, fields, 'finality evidence');
  if (value.schema !== 'axiom-chain-finality-evidence.v1') throw new ValidationError('finality evidence schema is invalid');
  validateChainIdentity(value.chain);
  requireEnum(value.model, FINALITY_MODELS, 'finality evidence.model');
  requireEnum(value.status, FINALITY_STATES, 'finality evidence.status');
  requireString(value.reference, 'finality evidence.reference', { max: 512 });
  requireEnum(value.verification_status, VERIFICATION_STATES, 'finality evidence.verification_status');
  requireSha256(value.evidence_sha256, 'finality evidence.evidence_sha256');
  requireDateTime(value.observed_at, 'finality evidence.observed_at');
  return true;
}

export function validateChainObservation(value) {
  const fields = ['schema', 'chain', 'observation_type', 'state_reference', 'object_reference', 'payload_sha256', 'provider_id', 'adapter_id', 'adapter_version', 'observed_at', 'finality_status', 'verification_status'];
  requireFields(value, fields, 'chain observation');
  rejectUnknown(value, fields, 'chain observation');
  if (value.schema !== 'axiom-chain-observation.v1') throw new ValidationError('chain observation schema is invalid');
  validateChainIdentity(value.chain);
  requireEnum(value.observation_type, OBSERVATION_TYPES, 'chain observation.observation_type');
  requireString(value.state_reference, 'chain observation.state_reference', { max: 512 });
  requireString(value.object_reference, 'chain observation.object_reference', { max: 512 });
  requireSha256(value.payload_sha256, 'chain observation.payload_sha256');
  requireString(value.provider_id, 'chain observation.provider_id', { max: 160 });
  requireString(value.adapter_id, 'chain observation.adapter_id', { max: 160 });
  requireVersion(value.adapter_version, 'chain observation.adapter_version');
  requireDateTime(value.observed_at, 'chain observation.observed_at');
  requireEnum(value.finality_status, FINALITY_STATES, 'chain observation.finality_status');
  requireEnum(value.verification_status, VERIFICATION_STATES, 'chain observation.verification_status');
  return true;
}

export function validateSettlementEvidence(value) {
  const required = ['schema', 'obligation_ref', 'transaction', 'asset', 'amount_minor_units', 'unit', 'payee_binding', 'finality', 'adapter_evidence_sha256', 'observed_at', 'status'];
  const fields = [...required, 'remainder_minor_units'];
  requireFields(value, required, 'settlement evidence');
  rejectUnknown(value, fields, 'settlement evidence');
  if (value.schema !== 'axiom-chain-settlement-evidence.v1') throw new ValidationError('settlement evidence schema is invalid');
  requireString(value.obligation_ref, 'settlement evidence.obligation_ref', { max: 256 });
  validateTransactionReference(value.transaction);
  validateAssetIdentity(value.asset);
  if (canonicalJson(value.transaction.chain) !== canonicalJson(value.asset.chain)) throw new ValidationError('settlement evidence chain mismatch');
  requireInteger(value.amount_minor_units, 'settlement evidence.amount_minor_units');
  requireString(value.unit, 'settlement evidence.unit', { max: 128 });
  requireString(value.payee_binding, 'settlement evidence.payee_binding', { max: 256 });
  validateFinalityEvidence(value.finality);
  if (canonicalJson(value.transaction.chain) !== canonicalJson(value.finality.chain)) throw new ValidationError('settlement evidence finality chain mismatch');
  requireSha256(value.adapter_evidence_sha256, 'settlement evidence.adapter_evidence_sha256');
  requireDateTime(value.observed_at, 'settlement evidence.observed_at');
  requireEnum(value.status, SETTLEMENT_STATES, 'settlement evidence.status');
  if (value.remainder_minor_units !== undefined) requireInteger(value.remainder_minor_units, 'settlement evidence.remainder_minor_units');
  return true;
}

export function validateAnchorEvidence(value) {
  const fields = ['schema', 'local_sha256', 'transaction', 'finality', 'adapter_evidence_sha256', 'observed_at'];
  requireFields(value, fields, 'anchor evidence');
  rejectUnknown(value, fields, 'anchor evidence');
  if (value.schema !== 'axiom-chain-anchor-evidence.v1') throw new ValidationError('anchor evidence schema is invalid');
  requireSha256(value.local_sha256, 'anchor evidence.local_sha256');
  validateTransactionReference(value.transaction);
  validateFinalityEvidence(value.finality);
  if (canonicalJson(value.transaction.chain) !== canonicalJson(value.finality.chain)) throw new ValidationError('anchor evidence chain mismatch');
  requireSha256(value.adapter_evidence_sha256, 'anchor evidence.adapter_evidence_sha256');
  requireDateTime(value.observed_at, 'anchor evidence.observed_at');
  return true;
}

export function validateBridgeRouteDescription(value) {
  const fields = [
    'schema', 'source_chain', 'destination_chain', 'source_asset', 'destination_asset',
    'provider_id', 'provider_version', 'mechanism', 'custody_model', 'trust_model',
    'assumptions', 'contract_dependencies', 'representation_change',
    'estimated_fee_minor_units', 'fee_unit', 'estimated_latency_seconds',
    'source_finality_requirement', 'destination_finality_requirement',
    'operational_dependencies', 'evidence_timestamp', 'local_risk_classification',
    'required_execution_capability'
  ];
  requireFields(value, fields, 'bridge route');
  rejectUnknown(value, fields, 'bridge route');
  if (value.schema !== 'axiom-chain-bridge-route.v1') throw new ValidationError('bridge route schema is invalid');
  validateChainIdentity(value.source_chain);
  validateChainIdentity(value.destination_chain);
  validateAssetIdentity(value.source_asset);
  validateAssetIdentity(value.destination_asset);
  if (canonicalJson(value.source_chain) !== canonicalJson(value.source_asset.chain)) throw new ValidationError('bridge route source asset chain mismatch');
  if (canonicalJson(value.destination_chain) !== canonicalJson(value.destination_asset.chain)) throw new ValidationError('bridge route destination asset chain mismatch');
  requireString(value.provider_id, 'bridge route.provider_id', { max: 160 });
  requireVersion(value.provider_version, 'bridge route.provider_version');
  for (const key of ['mechanism', 'custody_model', 'trust_model', 'representation_change', 'fee_unit', 'source_finality_requirement', 'destination_finality_requirement', 'local_risk_classification']) {
    requireString(value[key], `bridge route.${key}`, { max: 256 });
  }
  validateStrings(value.assumptions, 'bridge route.assumptions', { max: 32 });
  validateStrings(value.contract_dependencies, 'bridge route.contract_dependencies', { max: 64 });
  requireInteger(value.estimated_fee_minor_units, 'bridge route.estimated_fee_minor_units');
  requireInteger(value.estimated_latency_seconds, 'bridge route.estimated_latency_seconds');
  validateStrings(value.operational_dependencies, 'bridge route.operational_dependencies', { max: 64 });
  requireDateTime(value.evidence_timestamp, 'bridge route.evidence_timestamp');
  if (value.required_execution_capability !== 'chain.bridge.execute') {
    throw new ValidationError('bridge route.required_execution_capability must be chain.bridge.execute');
  }
  return true;
}
