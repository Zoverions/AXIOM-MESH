import { digestObject, ValidationError } from '../../mesh/src/lib/canonical.mjs';
import {
  validateCircleHistoricalRuleBindingLedger
} from '../axiom-circle-historical-rule-binding/index.mjs';

const ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/;
const DIGEST = /^[a-f0-9]{64}$/;
const REPLAY_STATES = new Set(['new', 'exact-replay', 'conflict']);

const EXPECTED_REQUIREMENTS = Object.freeze({
  validated_historical_binding_required: true,
  deterministic_event_id_from_binding_digest: true,
  event_subject_is_exact_circle_id: true,
  expected_prior_circle_head_required: true,
  expected_prior_circle_head_must_equal_binding_predecessor: true,
  new_circle_head_is_binding_digest: true,
  ledger_prefix_digest_through_binding_required: true,
  charter_lifecycle_prefix_digest_through_governing_charter_required: true,
  retry_payload_stable_after_charter_and_ledger_extension: true,
  exact_replay_distinguished_from_conflicting_reuse: true,
  global_grid_chain_is_reused: true,
  separate_circle_database_created: false,
  request_replay_guard_counts_as_durable_persistence: false,
  grid_chain_verification_required_for_receipt: true,
  candidate_may_grant_runtime_authority: false,
  receipt_may_grant_runtime_authority: false
});

const EXPECTED_SCHEMAS = Object.freeze({
  payload: 'axiom-circle-grid-persistence-payload.v0',
  candidate: 'axiom-circle-grid-persistence-candidate.v0',
  receipt: 'axiom-circle-grid-persistence-receipt.v0'
});

const EXPECTED_RUNTIME_INTEGRATION = Object.freeze({
  live_grid_append: false,
  gateway_route: false,
  hypervisor_action: false,
  grid_route: false,
  grid_materialized_projection: false,
  grid_event_lookup_by_id: false,
  uses_existing_signed_grid_chain: true
});

const PAYLOAD_KEYS = Object.freeze([
  'schema',
  'circle_id',
  'binding_id',
  'binding_digest',
  'binding',
  'record_type',
  'record_id',
  'record_digest',
  'governing_charter_digest',
  'previous_circle_binding_digest',
  'resulting_circle_head_digest',
  'historical_ledger_prefix_digest',
  'historical_ledger_prefix_length',
  'charter_lifecycle_prefix_digest',
  'charter_lifecycle_prefix_length',
  'persistence_policy_digest',
  'historical_policy_digest',
  'charter_policy_digest',
  'runtime_authority',
  'portable_authority',
  'authority_effect',
  'network_effect'
]);

export function validateCircleGridPersistencePolicy(policy) {
  exactObject(policy, 'Circle Grid persistence policy', [
    'schema',
    'version',
    'status',
    'runtime_activation',
    'authority_effect',
    'network_effect',
    'grid_event_kind',
    'event_id_prefix',
    'requirements',
    'schemas',
    'replay_states',
    'runtime_integration',
    'output'
  ]);
  if (
    policy.schema !== 'axiom-circle-grid-persistence-policy.v0'
    || policy.version !== 0
    || policy.status !== 'inert-grid-admission-contract'
    || policy.runtime_activation !== false
    || policy.authority_effect !== 'none'
    || policy.network_effect !== 'none'
    || policy.grid_event_kind !== 'circle.historical.binding.persist.requested'
    || policy.event_id_prefix !== 'circle_binding_'
  ) throw new ValidationError('Circle Grid persistence activation boundary is invalid');

  exactObject(
    policy.requirements,
    'Circle Grid persistence requirements',
    Object.keys(EXPECTED_REQUIREMENTS)
  );
  if (JSON.stringify(policy.requirements) !== JSON.stringify(EXPECTED_REQUIREMENTS)) {
    throw new ValidationError('Circle Grid persistence requirement was weakened');
  }

  exactObject(policy.schemas, 'Circle Grid persistence schemas', Object.keys(EXPECTED_SCHEMAS));
  if (JSON.stringify(policy.schemas) !== JSON.stringify(EXPECTED_SCHEMAS)) {
    throw new ValidationError('Circle Grid persistence schema inventory drifted');
  }
  exactSet(policy.replay_states, REPLAY_STATES, 'Circle Grid persistence replay states');

  exactObject(
    policy.runtime_integration,
    'Circle Grid persistence runtime integration',
    Object.keys(EXPECTED_RUNTIME_INTEGRATION)
  );
  if (JSON.stringify(policy.runtime_integration) !== JSON.stringify(EXPECTED_RUNTIME_INTEGRATION)) {
    throw new ValidationError('Circle Grid persistence runtime integration boundary drifted');
  }

  exactObject(policy.output, 'Circle Grid persistence output', [
    'policy_digest_required',
    'historical_policy_digest_required',
    'charter_policy_digest_required',
    'charter_lifecycle_prefix_digest_required',
    'historical_ledger_prefix_digest_required',
    'binding_digest_required',
    'runtime_authority',
    'portable_authority',
    'authority_effect',
    'network_effect'
  ]);
  if (
    policy.output.policy_digest_required !== true
    || policy.output.historical_policy_digest_required !== true
    || policy.output.charter_policy_digest_required !== true
    || policy.output.charter_lifecycle_prefix_digest_required !== true
    || policy.output.historical_ledger_prefix_digest_required !== true
    || policy.output.binding_digest_required !== true
    || policy.output.runtime_authority !== false
    || policy.output.portable_authority !== false
    || policy.output.authority_effect !== 'none'
    || policy.output.network_effect !== 'none'
  ) throw new ValidationError('Circle Grid persistence output boundary is invalid');
  return true;
}

export function buildCircleGridPersistenceCandidate(
  policy,
  historicalPolicy,
  charterPolicy,
  circlePackage,
  charterLifecycle,
  ledger,
  {
    bindingId,
    expectedPriorCircleHeadDigest = null,
    now = new Date()
  } = {}
) {
  validateCircleGridPersistencePolicy(policy);
  validateCircleHistoricalRuleBindingLedger(
    historicalPolicy,
    charterPolicy,
    circlePackage,
    charterLifecycle,
    ledger,
    { now }
  );
  if (!identifier(bindingId)) {
    throw new ValidationError('Circle Grid persistence binding_id is invalid');
  }
  const bindingIndex = ledger.bindings.findIndex(binding => binding.binding_id === bindingId);
  if (bindingIndex < 0) {
    throw new ValidationError('Circle Grid persistence binding was not found in validated ledger');
  }
  const binding = ledger.bindings[bindingIndex];
  const bindingDigest = digestObject(binding);
  const predecessor = binding.previous_binding_digest;
  if (!(expectedPriorCircleHeadDigest === null || DIGEST.test(expectedPriorCircleHeadDigest))) {
    throw new ValidationError('Circle Grid persistence expected prior Circle head is invalid');
  }
  if (expectedPriorCircleHeadDigest !== predecessor) {
    throw new ValidationError(
      'Circle Grid persistence expected prior Circle head does not match binding predecessor'
    );
  }

  const charterEntryIndex = charterLifecycle.entries.findIndex(
    entry => entry.charter_digest === binding.governing_charter_digest
  );
  if (charterEntryIndex < 0) {
    throw new ValidationError('Circle Grid persistence governing charter is absent from charter lifecycle');
  }

  const historicalLedgerPrefixDigest = digestObject({
    schema: 'axiom-circle-historical-rule-binding-prefix.v0',
    circle_id: ledger.circle_id,
    bindings: ledger.bindings.slice(0, bindingIndex + 1)
  });
  const charterLifecyclePrefixDigest = digestObject({
    schema: 'axiom-circle-charter-lifecycle-prefix.v0',
    circle_id: charterLifecycle.circle_id,
    entries: charterLifecycle.entries.slice(0, charterEntryIndex + 1)
  });
  const policyDigest = digestObject(policy);
  const historicalPolicyDigest = digestObject(historicalPolicy);
  const charterPolicyDigest = digestObject(charterPolicy);
  const eventId = deriveEventId(policy, ledger.circle_id, bindingDigest);

  const payload = deepFreeze({
    schema: policy.schemas.payload,
    circle_id: ledger.circle_id,
    binding_id: binding.binding_id,
    binding_digest: bindingDigest,
    binding: structuredClone(binding),
    record_type: binding.record_type,
    record_id: binding.record_id,
    record_digest: binding.record_digest,
    governing_charter_digest: binding.governing_charter_digest,
    previous_circle_binding_digest: predecessor,
    resulting_circle_head_digest: bindingDigest,
    historical_ledger_prefix_digest: historicalLedgerPrefixDigest,
    historical_ledger_prefix_length: bindingIndex + 1,
    charter_lifecycle_prefix_digest: charterLifecyclePrefixDigest,
    charter_lifecycle_prefix_length: charterEntryIndex + 1,
    persistence_policy_digest: policyDigest,
    historical_policy_digest: historicalPolicyDigest,
    charter_policy_digest: charterPolicyDigest,
    runtime_authority: false,
    portable_authority: false,
    authority_effect: 'none',
    network_effect: 'none'
  });

  const candidate = {
    schema: policy.schemas.candidate,
    circle_id: ledger.circle_id,
    binding_id: binding.binding_id,
    binding_digest: bindingDigest,
    expected_prior_circle_head_digest: predecessor,
    resulting_circle_head_digest: bindingDigest,
    event: {
      event_id: eventId,
      kind: policy.grid_event_kind,
      subject: ledger.circle_id,
      payload
    },
    payload_digest: digestObject(payload),
    policy_digest: policyDigest,
    historical_policy_digest: historicalPolicyDigest,
    charter_policy_digest: charterPolicyDigest,
    historical_ledger_prefix_digest: historicalLedgerPrefixDigest,
    charter_lifecycle_prefix_digest: charterLifecyclePrefixDigest,
    runtime_activation: false,
    runtime_authority: false,
    portable_authority: false,
    authority_effect: 'none',
    network_effect: 'none'
  };
  validateCircleGridPersistenceCandidate(policy, candidate);
  return deepFreeze(candidate);
}

export function validateCircleGridPersistenceCandidate(policy, candidate) {
  validateCircleGridPersistencePolicy(policy);
  exactObject(candidate, 'Circle Grid persistence candidate', [
    'schema',
    'circle_id',
    'binding_id',
    'binding_digest',
    'expected_prior_circle_head_digest',
    'resulting_circle_head_digest',
    'event',
    'payload_digest',
    'policy_digest',
    'historical_policy_digest',
    'charter_policy_digest',
    'historical_ledger_prefix_digest',
    'charter_lifecycle_prefix_digest',
    'runtime_activation',
    'runtime_authority',
    'portable_authority',
    'authority_effect',
    'network_effect'
  ]);
  if (
    candidate.schema !== policy.schemas.candidate
    || !identifier(candidate.circle_id)
    || !identifier(candidate.binding_id)
    || !DIGEST.test(candidate.binding_digest)
    || !nullableDigest(candidate.expected_prior_circle_head_digest)
    || candidate.resulting_circle_head_digest !== candidate.binding_digest
    || !DIGEST.test(candidate.payload_digest)
    || !DIGEST.test(candidate.policy_digest)
    || !DIGEST.test(candidate.historical_policy_digest)
    || !DIGEST.test(candidate.charter_policy_digest)
    || !DIGEST.test(candidate.historical_ledger_prefix_digest)
    || !DIGEST.test(candidate.charter_lifecycle_prefix_digest)
    || candidate.runtime_activation !== false
    || candidate.runtime_authority !== false
    || candidate.portable_authority !== false
    || candidate.authority_effect !== 'none'
    || candidate.network_effect !== 'none'
  ) throw new ValidationError('Circle Grid persistence candidate boundary is invalid');

  exactObject(candidate.event, 'Circle Grid persistence event candidate', [
    'event_id', 'kind', 'subject', 'payload'
  ]);
  const expectedEventId = deriveEventId(policy, candidate.circle_id, candidate.binding_digest);
  if (
    candidate.event.event_id !== expectedEventId
    || candidate.event.kind !== policy.grid_event_kind
    || candidate.event.subject !== candidate.circle_id
    || digestObject(candidate.event.payload) !== candidate.payload_digest
  ) throw new ValidationError('Circle Grid persistence event candidate is invalid');

  const payload = candidate.event.payload;
  exactObject(payload, 'Circle Grid persistence payload', PAYLOAD_KEYS);
  const binding = payload.binding;
  if (!binding || typeof binding !== 'object' || Array.isArray(binding)) {
    throw new ValidationError('Circle Grid persistence payload binding snapshot is invalid');
  }
  if (
    payload.schema !== policy.schemas.payload
    || payload.circle_id !== candidate.circle_id
    || payload.binding_id !== candidate.binding_id
    || payload.binding_digest !== candidate.binding_digest
    || digestObject(binding) !== candidate.binding_digest
    || binding.circle_id !== candidate.circle_id
    || binding.binding_id !== candidate.binding_id
    || binding.previous_binding_digest !== candidate.expected_prior_circle_head_digest
    || binding.record_type !== payload.record_type
    || binding.record_id !== payload.record_id
    || binding.record_digest !== payload.record_digest
    || binding.governing_charter_digest !== payload.governing_charter_digest
    || payload.previous_circle_binding_digest !== candidate.expected_prior_circle_head_digest
    || payload.resulting_circle_head_digest !== candidate.resulting_circle_head_digest
    || payload.historical_ledger_prefix_digest !== candidate.historical_ledger_prefix_digest
    || payload.charter_lifecycle_prefix_digest !== candidate.charter_lifecycle_prefix_digest
    || !positiveInteger(payload.historical_ledger_prefix_length)
    || !positiveInteger(payload.charter_lifecycle_prefix_length)
    || payload.persistence_policy_digest !== candidate.policy_digest
    || payload.historical_policy_digest !== candidate.historical_policy_digest
    || payload.charter_policy_digest !== candidate.charter_policy_digest
    || payload.runtime_authority !== false
    || payload.portable_authority !== false
    || payload.authority_effect !== 'none'
    || payload.network_effect !== 'none'
  ) throw new ValidationError('Circle Grid persistence payload binding is invalid');
  return true;
}

export function assessCircleGridPersistenceReplay(policy, candidate, existingGridEvent = null) {
  validateCircleGridPersistenceCandidate(policy, candidate);
  if (existingGridEvent === null || existingGridEvent === undefined) {
    return Object.freeze({
      state: 'new',
      event_id: candidate.event.event_id,
      binding_digest: candidate.binding_digest
    });
  }
  if (!existingGridEvent || typeof existingGridEvent !== 'object' || Array.isArray(existingGridEvent)) {
    throw new ValidationError('Circle Grid persistence existing event is invalid');
  }
  if (existingGridEvent.event_id !== candidate.event.event_id) {
    throw new ValidationError('Circle Grid persistence replay assessment received the wrong Grid event');
  }
  if (!DIGEST.test(existingGridEvent.payload_digest ?? '')) {
    throw new ValidationError('Circle Grid persistence replay payload digest is invalid');
  }
  const exact = (
    existingGridEvent.kind === candidate.event.kind
    && existingGridEvent.subject === candidate.event.subject
    && existingGridEvent.payload_digest === candidate.payload_digest
  );
  return Object.freeze({
    state: exact ? 'exact-replay' : 'conflict',
    event_id: candidate.event.event_id,
    binding_digest: candidate.binding_digest,
    expected_payload_digest: candidate.payload_digest,
    observed_payload_digest: existingGridEvent.payload_digest
  });
}

export function buildCircleGridPersistenceReceipt(
  policy,
  candidate,
  gridEvent,
  chainVerification
) {
  validateCircleGridPersistenceCandidate(policy, candidate);
  validateGridEventEnvelope(candidate, gridEvent);
  if (
    !chainVerification
    || typeof chainVerification !== 'object'
    || Array.isArray(chainVerification)
    || chainVerification.valid !== true
    || !Number.isSafeInteger(chainVerification.events)
    || chainVerification.events < gridEvent.seq
  ) {
    throw new ValidationError(
      'Circle Grid persistence receipt requires Grid chain verification covering the event'
    );
  }

  return deepFreeze({
    schema: policy.schemas.receipt,
    circle_id: candidate.circle_id,
    binding_id: candidate.binding_id,
    binding_digest: candidate.binding_digest,
    event_id: candidate.event.event_id,
    grid_seq: gridEvent.seq,
    grid_event_hash: gridEvent.event_hash,
    grid_prev_hash: gridEvent.prev_hash,
    grid_payload_digest: gridEvent.payload_digest,
    resulting_circle_head_digest: candidate.resulting_circle_head_digest,
    historical_ledger_prefix_digest: candidate.historical_ledger_prefix_digest,
    charter_lifecycle_prefix_digest: candidate.charter_lifecycle_prefix_digest,
    grid_chain_verification_digest: digestObject(chainVerification),
    grid_chain_verified: true,
    grid_signature_present: true,
    policy_digest: candidate.policy_digest,
    historical_policy_digest: candidate.historical_policy_digest,
    charter_policy_digest: candidate.charter_policy_digest,
    runtime_authority: false,
    portable_authority: false,
    authority_effect: 'none',
    network_effect: 'none'
  });
}

function validateGridEventEnvelope(candidate, gridEvent) {
  if (!gridEvent || typeof gridEvent !== 'object' || Array.isArray(gridEvent)) {
    throw new ValidationError('Circle Grid persistence Grid event is invalid');
  }
  if (
    !Number.isSafeInteger(gridEvent.seq)
    || gridEvent.seq < 1
    || gridEvent.event_id !== candidate.event.event_id
    || typeof gridEvent.trace_id !== 'string'
    || typeof gridEvent.actor !== 'string'
    || gridEvent.kind !== candidate.event.kind
    || gridEvent.subject !== candidate.event.subject
    || typeof gridEvent.occurred_at !== 'string'
    || gridEvent.payload_digest !== candidate.payload_digest
    || !DIGEST.test(gridEvent.prev_hash ?? '')
    || !DIGEST.test(gridEvent.event_hash ?? '')
  ) throw new ValidationError('Circle Grid persistence Grid event envelope is invalid');

  const occurred = new Date(gridEvent.occurred_at);
  if (Number.isNaN(occurred.valueOf()) || occurred.toISOString() !== gridEvent.occurred_at) {
    throw new ValidationError('Circle Grid persistence Grid event occurred_at must be canonical UTC');
  }
  const expectedEventHash = digestObject({
    seq: gridEvent.seq,
    event_id: gridEvent.event_id,
    trace_id: gridEvent.trace_id,
    actor: gridEvent.actor,
    kind: gridEvent.kind,
    subject: gridEvent.subject,
    occurred_at: gridEvent.occurred_at,
    payload_digest: gridEvent.payload_digest,
    prev_hash: gridEvent.prev_hash
  });
  if (expectedEventHash !== gridEvent.event_hash) {
    throw new ValidationError('Circle Grid persistence Grid event hash does not match envelope');
  }
  exactObject(gridEvent.signature, 'Circle Grid persistence Grid signature', [
    'algorithm', 'key_id', 'digest', 'signature'
  ]);
  if (
    gridEvent.signature.algorithm !== 'Ed25519'
    || typeof gridEvent.signature.key_id !== 'string'
    || gridEvent.signature.key_id.length < 1
    || !DIGEST.test(gridEvent.signature.digest ?? '')
    || typeof gridEvent.signature.signature !== 'string'
    || gridEvent.signature.signature.length < 1
  ) throw new ValidationError('Circle Grid persistence Grid signature metadata is invalid');
  return true;
}

function deriveEventId(policy, circleId, bindingDigest) {
  const eventIdentityDigest = digestObject({
    schema: 'axiom-circle-grid-persistence-event-identity.v0',
    circle_id: circleId,
    binding_digest: bindingDigest
  });
  const eventId = `${policy.event_id_prefix}${eventIdentityDigest}`;
  if (!ID.test(eventId)) {
    throw new ValidationError('Circle Grid persistence deterministic event_id is invalid');
  }
  return eventId;
}

function nullableDigest(value) {
  return value === null || (typeof value === 'string' && DIGEST.test(value));
}

function positiveInteger(value) {
  return Number.isSafeInteger(value) && value >= 1;
}

function identifier(value) {
  return typeof value === 'string' && ID.test(value);
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
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    throw new ValidationError(`${label} fields are invalid`);
  }
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}
