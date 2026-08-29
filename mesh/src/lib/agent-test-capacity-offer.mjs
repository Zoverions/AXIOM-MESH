import {
  ValidationError,
  assertPlainObject,
  assertString
} from './canonical.mjs';

export const AGENT_TEST_CAPACITY_OFFER_SCHEMA = 'axiom-agent-test-capacity-offer.v1';
export const AGENT_TEST_CAPACITY_SUPPORTED_BUILD = '0.12.0-dev.3';
export const AGENT_TEST_CAPACITY_RESULT_CONTRACT = 'agent-readiness/CONTRIBUTION-RESULT.schema.json';

const ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/;
const RECORD_STATUS = new Set(['example', 'offered']);
const PUBLISHER_TYPES = new Set(['human', 'machine', 'organization']);
const OWNERSHIP = new Set([
  'repository-owned',
  'contributor-owned',
  'explicitly-disposable-authorized'
]);
const TESTNET_LANES = new Set(['T0', 'T1', 'T2', 'T3', 'T4', 'T5']);
const FALSE_NONCLAIMS = Object.freeze([
  'offer_authorizes_execution',
  'remote_access_granted',
  'remote_session_created',
  'node_admission_granted',
  'runtime_authority_granted',
  'merge_authority_granted',
  'deployment_authority_granted',
  'credential_authority_granted',
  'spending_authority_granted',
  'hardware_custody_granted',
  'production_promotion_granted',
  'capability_promotion_granted',
  'destructive_actions_allowed',
  'firmware_changes_allowed',
  'purchases_allowed',
  'compensation_committed'
]);

export function validateAgentTestCapacityOffer(raw) {
  const offer = exactObject(raw, 'Agent test capacity offer', [
    'schema',
    'project',
    'supported_build',
    'record_status',
    'offer_id',
    'publisher',
    'environment',
    'testnet_lanes',
    'availability',
    'execution_mode',
    'evidence_return_contract',
    'safety',
    'authority_nonclaims'
  ]);

  if (
    offer.schema !== AGENT_TEST_CAPACITY_OFFER_SCHEMA
    || offer.project !== 'AXIOM-MESH'
    || offer.supported_build !== AGENT_TEST_CAPACITY_SUPPORTED_BUILD
  ) {
    throw new ValidationError('Agent test capacity offer identity is invalid');
  }
  if (!RECORD_STATUS.has(offer.record_status)) {
    throw new ValidationError('Agent test capacity offer record_status is invalid');
  }
  const offerId = assertString(offer.offer_id, 'Agent test capacity offer offer_id', {
    min: 1,
    max: 160,
    pattern: ID
  });

  const publisher = exactObject(offer.publisher, 'Agent test capacity offer publisher', [
    'type', 'id', 'identity_assurance'
  ]);
  if (!PUBLISHER_TYPES.has(publisher.type) || publisher.identity_assurance !== 'self-declared') {
    throw new ValidationError('Agent test capacity offer publisher boundary is invalid');
  }
  assertString(publisher.id, 'Agent test capacity offer publisher.id', {
    min: 1,
    max: 160,
    pattern: ID
  });

  const environment = exactObject(offer.environment, 'Agent test capacity offer environment', [
    'ownership', 'description', 'hardware', 'operating_system', 'runtime'
  ]);
  if (!OWNERSHIP.has(environment.ownership)) {
    throw new ValidationError('Agent test capacity offer environment ownership is invalid');
  }
  boundedNullableText(environment.description, 'Agent test capacity offer environment.description', {
    min: 1,
    max: 2000,
    nullable: false
  });
  boundedNullableText(environment.hardware, 'Agent test capacity offer environment.hardware', { max: 1000 });
  boundedNullableText(
    environment.operating_system,
    'Agent test capacity offer environment.operating_system',
    { max: 500 }
  );
  boundedNullableText(environment.runtime, 'Agent test capacity offer environment.runtime', { max: 500 });

  if (!Array.isArray(offer.testnet_lanes) || offer.testnet_lanes.length < 1 || offer.testnet_lanes.length > 6) {
    throw new ValidationError('Agent test capacity offer testnet_lanes are invalid');
  }
  if (
    new Set(offer.testnet_lanes).size !== offer.testnet_lanes.length
    || offer.testnet_lanes.some(lane => !TESTNET_LANES.has(lane))
  ) {
    throw new ValidationError('Agent test capacity offer testnet_lanes contain an invalid or duplicate lane');
  }

  const availability = exactObject(offer.availability, 'Agent test capacity offer availability', [
    'starts_at', 'expires_at', 'maximum_runs', 'operator_confirmation_required'
  ]);
  const startsAt = canonicalTimestamp(availability.starts_at, 'Agent test capacity offer availability.starts_at');
  const expiresAt = canonicalTimestamp(availability.expires_at, 'Agent test capacity offer availability.expires_at');
  if (expiresAt.getTime() <= startsAt.getTime()) {
    throw new ValidationError('Agent test capacity offer availability expiry must follow start');
  }
  if (
    !Number.isSafeInteger(availability.maximum_runs)
    || availability.maximum_runs < 1
    || availability.maximum_runs > 1000
    || availability.operator_confirmation_required !== true
  ) {
    throw new ValidationError('Agent test capacity offer availability boundary is invalid');
  }

  if (offer.execution_mode !== 'operator-run-only') {
    throw new ValidationError('Agent test capacity offer cannot create remote or delegated execution');
  }
  if (offer.evidence_return_contract !== AGENT_TEST_CAPACITY_RESULT_CONTRACT) {
    throw new ValidationError('Agent test capacity offer evidence return contract is invalid');
  }

  const safety = exactObject(offer.safety, 'Agent test capacity offer safety', [
    'public_safe_metadata_only',
    'contains_secrets_or_credentials',
    'contains_private_data',
    'third_party_testing_authorized'
  ]);
  if (
    safety.public_safe_metadata_only !== true
    || safety.contains_secrets_or_credentials !== false
    || safety.contains_private_data !== false
    || safety.third_party_testing_authorized !== false
  ) {
    throw new ValidationError('Agent test capacity offer safety boundary is invalid');
  }

  const nonclaims = exactObject(
    offer.authority_nonclaims,
    'Agent test capacity offer authority_nonclaims',
    FALSE_NONCLAIMS
  );
  for (const field of FALSE_NONCLAIMS) {
    if (nonclaims[field] !== false) {
      throw new ValidationError(`Agent test capacity offer cannot elevate ${field}`);
    }
  }

  return Object.freeze({
    valid: true,
    schema: offer.schema,
    offer_id: offerId,
    record_status: offer.record_status,
    ownership: environment.ownership,
    testnet_lanes: Object.freeze([...offer.testnet_lanes]),
    maximum_runs: availability.maximum_runs,
    execution_mode: 'operator-run-only',
    evidence_return_contract: AGENT_TEST_CAPACITY_RESULT_CONTRACT,
    authority_effect: 'none',
    remote_access_granted: false,
    node_admission_granted: false
  });
}

function exactObject(raw, label, fields) {
  const value = assertPlainObject(raw, label);
  const allowed = new Set(fields);
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) throw new ValidationError(`${label} contains unsupported field ${key}`);
  }
  for (const key of fields) {
    if (!Object.hasOwn(value, key)) throw new ValidationError(`${label} is missing required field ${key}`);
  }
  return value;
}

function boundedNullableText(value, label, { min = 0, max, nullable = true }) {
  if (value === null && nullable) return null;
  return assertString(value, label, { min, max });
}

function canonicalTimestamp(value, label) {
  const text = assertString(value, label, { min: 24, max: 24 });
  const parsed = new Date(text);
  if (Number.isNaN(parsed.valueOf()) || parsed.toISOString() !== text) {
    throw new ValidationError(`${label} must be a canonical UTC ISO timestamp`);
  }
  return parsed;
}
