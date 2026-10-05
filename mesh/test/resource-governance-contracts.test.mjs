import assert from 'node:assert/strict';
import test from 'node:test';
import { validateResourceEnvelope, resourceEnvelopeDigest } from '../src/lib/resource-envelope.mjs';
import { validateResourceObservation, resourceObservationDigest, requireFreshResourceObservations } from '../src/lib/resource-observation.mjs';

const ceilings = () => ({
  cpu_millis: 30000,
  memory_bytes: 536870912,
  accelerator_memory_bytes: 0,
  durable_storage_bytes: 10485760,
  scratch_storage_bytes: 104857600,
  io_bytes: 524288000,
  network_bytes: 104857600,
  network_requests: 100,
  model_calls: 10,
  input_units: 100000,
  output_units: 50000,
  concurrency: 2,
  wall_time_ms: 60000,
  monetary_cost_units: 250,
  energy_millijoules: 1000000,
  process_count: 4,
  thread_count: 32,
  file_descriptors: 128
});

const envelope = () => ({
  schema: 'axiom-resource-envelope.v0',
  version: 0,
  status: 'inert-contract-laboratory',
  envelope_id: 'resource.envelope.1',
  subject_ref: 'task.1',
  principal_id: 'counterpart.1',
  host_ref: 'host.personal.1',
  priority_class: 'P2',
  parent_envelope_ref: null,
  inheritance: { mode: 'root', parent_budget_accounting: 'not-applicable', child_authorization_ref: null },
  hard_ceilings: ceilings(),
  soft_targets: { ...ceilings(), cpu_millis: 20000, memory_bytes: 268435456, concurrency: 1, wall_time_ms: 45000 },
  measurement_freshness_ms: 30000,
  required_observation_kinds: ['cpu','memory','storage'],
  degradation_policy_refs: ['policy.degrade.1'],
  fallback_refs: [],
  checkpoint_required: true,
  cancellable: true,
  reservation_expires_at: '2026-09-01T12:01:00.000Z',
  source_policy_ref: 'policy.resource.1',
  created_at: '2026-09-01T12:00:00.000Z',
  expires_at: '2026-09-01T12:02:00.000Z',
  contains_secret_material: false,
  authority_effect: 'none',
  network_effect: 'none',
  runtime_activation: false
});

const observation = (kind, overrides = {}) => ({
  schema: 'axiom-resource-observation.v0',
  version: 0,
  status: 'inert-contract-laboratory',
  observation_id: `obs.${kind}.1`,
  observer_principal_id: 'observer.host.1',
  host_ref: 'host.personal.1',
  kind,
  observation_status: 'measured',
  observed_at: '2026-09-01T12:00:10.000Z',
  expires_at: '2026-09-01T12:00:40.000Z',
  measurement_method: 'host-native.v1',
  evidence_ref: 'evidence.host.1',
  values: kind === 'cpu'
    ? { cpu_load_millis: 400, cpu_available_millis: 1600 }
    : kind === 'memory'
      ? { memory_used_bytes: 4000000000, memory_free_bytes: 12000000000 }
      : { storage_total_bytes: 1000000000000, storage_free_bytes: 500000000000 },
  limitations: [],
  contains_secret_material: false,
  authority_effect: 'none',
  network_effect: 'none',
  runtime_activation: false,
  ...overrides
});

test('valid root resource envelope has deterministic zero-authority digest', () => {
  const document = envelope();
  const result = validateResourceEnvelope(document);
  assert.equal(result.valid, true);
  assert.equal(result.priority_class, 'P2');
  assert.equal(result.envelope_digest, resourceEnvelopeDigest(document));
  assert.equal(result.authority_effect, 'none');
});

test('resource ceilings must be finite bounded integers', () => {
  const infinite = envelope();
  infinite.hard_ceilings.memory_bytes = Infinity;
  assert.throws(() => validateResourceEnvelope(infinite), /memory_bytes/i);
  const negative = envelope();
  negative.hard_ceilings.network_bytes = -1;
  assert.throws(() => validateResourceEnvelope(negative), /network_bytes/i);
});

test('soft targets cannot exceed hard ceilings', () => {
  const document = envelope();
  document.soft_targets.memory_bytes = document.hard_ceilings.memory_bytes + 1;
  assert.throws(() => validateResourceEnvelope(document), /soft target.*memory_bytes/i);
});

test('child budget inheritance is explicit and cannot silently multiply budget', () => {
  const inherited = envelope();
  inherited.parent_envelope_ref = 'resource.envelope.parent';
  inherited.inheritance = { mode: 'inherited', parent_budget_accounting: 'counts-against-parent', child_authorization_ref: null };
  assert.doesNotThrow(() => validateResourceEnvelope(inherited));

  inherited.inheritance.parent_budget_accounting = 'separate-authorized-budget';
  assert.throws(() => validateResourceEnvelope(inherited), /counts-against-parent/i);

  const separate = envelope();
  separate.parent_envelope_ref = 'resource.envelope.parent';
  separate.inheritance = { mode: 'separately-authorized-child', parent_budget_accounting: 'separate-authorized-budget', child_authorization_ref: null };
  assert.throws(() => validateResourceEnvelope(separate), /child_authorization_ref/i);
  separate.inheritance.child_authorization_ref = 'authority.child-budget.1';
  assert.doesNotThrow(() => validateResourceEnvelope(separate));
});

test('resource envelopes cannot activate runtime or authority', () => {
  const document = envelope();
  document.authority_effect = 'grant';
  assert.throws(() => validateResourceEnvelope(document), /activation boundary/i);
});

test('resource observations are attributable expiring measurements', () => {
  const document = observation('cpu');
  const result = validateResourceObservation(document);
  assert.equal(result.valid, true);
  assert.equal(result.kind, 'cpu');
  assert.equal(result.observation_digest, resourceObservationDigest(document));
});

test('missing required observations fail closed', () => {
  const document = envelope();
  const observations = [observation('cpu'), observation('storage')];
  assert.throws(() => requireFreshResourceObservations(document, observations, '2026-09-01T12:00:20.000Z'), /memory/i);
});

test('stale, failed, and wrong-host observations do not satisfy coverage', () => {
  const document = envelope();
  const staleMemory = observation('memory', { expires_at: '2026-09-01T12:00:15.000Z' });
  assert.throws(() => requireFreshResourceObservations(document, [observation('cpu'), staleMemory, observation('storage')], '2026-09-01T12:00:20.000Z'), /memory/i);

  const failedMemory = observation('memory', { observation_status: 'failed', values: {} });
  assert.throws(() => requireFreshResourceObservations(document, [observation('cpu'), failedMemory, observation('storage')], '2026-09-01T12:00:20.000Z'), /memory/i);

  const wrongHost = observation('memory', { host_ref: 'host.other.1' });
  assert.throws(() => requireFreshResourceObservations(document, [observation('cpu'), wrongHost, observation('storage')], '2026-09-01T12:00:20.000Z'), /memory/i);
});
