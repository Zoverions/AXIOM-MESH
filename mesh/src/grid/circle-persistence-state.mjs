import { readFileSync } from 'node:fs';

import {
  ValidationError,
  digestObject
} from '../lib/canonical.mjs';
import {
  assessCircleGridPersistenceReplay,
  validateCircleGridPersistenceCandidate,
  validateCircleGridPersistencePolicy
} from '../../../packages/axiom-circle-grid-persistence/index.mjs';

const EXPECTED_REQUIREMENTS = Object.freeze({
  parent_persistence_candidate_validation_required: true,
  existing_grid_database_only: true,
  existing_signed_grid_chain_only: true,
  full_grid_chain_preflight_required: true,
  single_circle_persistence_event_per_append: true,
  atomic_head_compare_and_set_inside_grid_transaction: true,
  durable_event_id_lookup_required: true,
  exact_replay_returns_existing_event: true,
  conflicting_event_id_reuse_rejected: true,
  stale_or_skipped_circle_head_rejected: true,
  projection_rebuilt_from_signed_grid_events: true,
  restart_reconstruction_required: true,
  multi_handle_serialization_required: true,
  request_replay_guard_counts_as_durable_persistence: false,
  separate_circle_database_created: false,
  public_grid_route: false,
  gateway_route: false,
  hypervisor_action: false,
  runtime_authority: false,
  portable_authority: false
});

const EXPECTED_PROJECTION = Object.freeze({
  table: 'circle_persistence_heads',
  primary_key: 'circle_id',
  head_value: 'binding_digest',
  source_of_truth: 'signed_grid_events',
  rebuildable: true
});

const EXPECTED_NON_CLAIMS = new Set([
  'actor-authorization',
  'governance-legitimacy',
  'historical-truth',
  'complete-history',
  'legal-authority',
  'execution-authority',
  'portable-authority',
  'distributed-consensus'
]);

const parentPolicyUrl = new URL('../../config/circle-grid-persistence.v0.json', import.meta.url);
const CIRCLE_GRID_PERSISTENCE_POLICY = deepFreeze(
  JSON.parse(readFileSync(parentPolicyUrl, 'utf8'))
);
validateCircleGridPersistencePolicy(CIRCLE_GRID_PERSISTENCE_POLICY);

export const CIRCLE_GRID_PERSISTENCE_EVENT_KIND =
  CIRCLE_GRID_PERSISTENCE_POLICY.grid_event_kind;

export function getCircleGridPersistencePolicy() {
  return CIRCLE_GRID_PERSISTENCE_POLICY;
}

export function getCircleGridPersistencePolicyDigest() {
  return digestObject(CIRCLE_GRID_PERSISTENCE_POLICY);
}

export function validateCircleGridHeadCasPolicy(policy) {
  exactObject(policy, 'Circle Grid head CAS policy', [
    'schema',
    'version',
    'status',
    'runtime_activation',
    'authority_effect',
    'network_effect',
    'requirements',
    'projection',
    'non_claims'
  ]);

  if (
    policy.schema !== 'axiom-circle-grid-head-cas-policy.v0'
    || policy.version !== 0
    || policy.status !== 'internal-grid-projection-candidate'
    || policy.runtime_activation !== false
    || policy.authority_effect !== 'none'
    || policy.network_effect !== 'none'
  ) {
    throw new ValidationError('Circle Grid head CAS activation boundary is invalid');
  }

  exactObject(
    policy.requirements,
    'Circle Grid head CAS requirements',
    Object.keys(EXPECTED_REQUIREMENTS)
  );
  if (JSON.stringify(policy.requirements) !== JSON.stringify(EXPECTED_REQUIREMENTS)) {
    throw new ValidationError('Circle Grid head CAS requirement was weakened');
  }

  exactObject(
    policy.projection,
    'Circle Grid head CAS projection',
    Object.keys(EXPECTED_PROJECTION)
  );
  if (JSON.stringify(policy.projection) !== JSON.stringify(EXPECTED_PROJECTION)) {
    throw new ValidationError('Circle Grid head CAS projection boundary drifted');
  }

  exactSet(policy.non_claims, EXPECTED_NON_CLAIMS, 'Circle Grid head CAS non-claims');
  return true;
}

export function validateCirclePersistenceAppendInput(rawEvent) {
  exactObject(rawEvent, 'Circle Grid persistence append event', [
    'event_id', 'kind', 'subject', 'payload'
  ]);
  return reconstructCircleGridPersistenceCandidate(rawEvent);
}

export function reconstructCircleGridPersistenceCandidate(rawEvent) {
  if (!rawEvent || typeof rawEvent !== 'object' || Array.isArray(rawEvent)) {
    throw new ValidationError('Circle Grid persistence event is invalid');
  }
  if (!rawEvent.payload || typeof rawEvent.payload !== 'object' || Array.isArray(rawEvent.payload)) {
    throw new ValidationError('Circle Grid persistence payload is invalid');
  }

  const payload = rawEvent.payload;
  const event = {
    event_id: rawEvent.event_id,
    kind: rawEvent.kind,
    subject: rawEvent.subject,
    payload
  };
  const candidate = {
    schema: CIRCLE_GRID_PERSISTENCE_POLICY.schemas.candidate,
    circle_id: payload.circle_id,
    binding_id: payload.binding_id,
    binding_digest: payload.binding_digest,
    expected_prior_circle_head_digest: payload.previous_circle_binding_digest,
    resulting_circle_head_digest: payload.resulting_circle_head_digest,
    event,
    payload_digest: digestObject(payload),
    policy_digest: payload.persistence_policy_digest,
    historical_policy_digest: payload.historical_policy_digest,
    charter_policy_digest: payload.charter_policy_digest,
    historical_ledger_prefix_digest: payload.historical_ledger_prefix_digest,
    charter_lifecycle_prefix_digest: payload.charter_lifecycle_prefix_digest,
    runtime_activation: false,
    runtime_authority: false,
    portable_authority: false,
    authority_effect: 'none',
    network_effect: 'none'
  };
  validateCircleGridPersistenceCandidate(CIRCLE_GRID_PERSISTENCE_POLICY, candidate);
  return deepFreeze(candidate);
}

export function assessCirclePersistenceGridReplay(rawEvent, existingGridEvent = null) {
  const candidate = reconstructCircleGridPersistenceCandidate(rawEvent);
  return assessCircleGridPersistenceReplay(
    CIRCLE_GRID_PERSISTENCE_POLICY,
    candidate,
    existingGridEvent
  );
}

function exactSet(values, expected, label) {
  if (!Array.isArray(values)) throw new ValidationError(`${label} must be an array`);
  const actual = new Set(values);
  if (
    actual.size !== expected.size
    || values.length !== expected.size
    || [...expected].some(value => !actual.has(value))
  ) throw new ValidationError(`${label} inventory drifted`);
}

function exactObject(value, label, keys) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new ValidationError(`${label} must be an object`);
  }
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (
    actual.length !== expected.length
    || actual.some((key, index) => key !== expected[index])
  ) {
    throw new ValidationError(`${label} fields are invalid`);
  }
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}
