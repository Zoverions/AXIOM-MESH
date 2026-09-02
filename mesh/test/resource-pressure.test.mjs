import assert from 'node:assert/strict';
import test from 'node:test';
import { evaluateResourcePressure } from '../src/lib/resource-pressure.mjs';

const profile = () => ({
  host_ref: 'host.personal.1',
  observation_max_age_ms: 30000,
  sovereignty_reserve: {
    memory_free_bytes: 1073741824,
    storage_free_bytes: 10737418240,
    cpu_available_millis: 200
  },
  thresholds: {
    memory_free_bytes: {
      constrained_below: 4294967296,
      critical_below: 2147483648,
      recover_constrained_at: 5368709120,
      recover_critical_at: 3221225472
    },
    storage_free_bytes: {
      constrained_below: 53687091200,
      critical_below: 21474836480,
      recover_constrained_at: 64424509440,
      recover_critical_at: 32212254720
    },
    cpu_available_millis: {
      constrained_below: 800,
      critical_below: 400,
      recover_constrained_at: 1000,
      recover_critical_at: 600
    }
  }
});

const observation = (kind, values, overrides = {}) => ({
  schema: 'axiom-resource-observation.v0',
  version: 0,
  status: 'inert-contract-laboratory',
  observation_id: `obs.${kind}.pressure`,
  observer_principal_id: 'observer.host.1',
  host_ref: 'host.personal.1',
  kind,
  observation_status: 'measured',
  observed_at: '2026-09-01T12:00:10.000Z',
  expires_at: '2026-09-01T12:00:40.000Z',
  measurement_method: 'host-native.v1',
  evidence_ref: `evidence.${kind}.pressure`,
  values,
  limitations: [],
  contains_secret_material: false,
  authority_effect: 'none',
  network_effect: 'none',
  runtime_activation: false,
  ...overrides
});

const observations = ({ memory = 8000000000, storage = 100000000000, cpu = 1600 } = {}) => [
  observation('cpu', { cpu_load_millis: 400, cpu_available_millis: cpu }),
  observation('memory', { memory_used_bytes: 4000000000, memory_free_bytes: memory }),
  observation('storage', { storage_total_bytes: 1000000000000, storage_free_bytes: storage })
];

test('normal admits all priority classes', () => {
  const result = evaluateResourcePressure(profile(), observations(), '2026-09-01T12:00:20.000Z');
  assert.equal(result.state, 'normal');
  assert.deepEqual(result.allowed_priority_classes, ['P0','P1','P2','P3','P4']);
});

test('constrained sheds P4 and critical sheds P3/P4', () => {
  const constrained = evaluateResourcePressure(profile(), observations({ memory: 3500000000 }), '2026-09-01T12:00:20.000Z');
  assert.equal(constrained.state, 'constrained');
  assert.deepEqual(constrained.allowed_priority_classes, ['P0','P1','P2','P3']);

  const critical = evaluateResourcePressure(profile(), observations({ memory: 1500000000 }), '2026-09-01T12:00:20.000Z');
  assert.equal(critical.state, 'critical');
  assert.deepEqual(critical.allowed_priority_classes, ['P0','P1','P2']);
});

test('sovereignty reserve breach forces emergency and preserves only P0', () => {
  const memoryBreach = evaluateResourcePressure(profile(), observations({ memory: 900000000 }), '2026-09-01T12:00:20.000Z');
  assert.equal(memoryBreach.state, 'emergency');
  assert.deepEqual(memoryBreach.allowed_priority_classes, ['P0']);
  assert.ok(memoryBreach.reasons.some(reason => reason.includes('memory_free_bytes')));

  const storageBreach = evaluateResourcePressure(profile(), observations({ storage: 9000000000 }), '2026-09-01T12:00:20.000Z');
  assert.equal(storageBreach.state, 'emergency');
  assert.ok(storageBreach.reasons.some(reason => reason.includes('storage_free_bytes')));
});

test('hysteresis prevents immediate recovery from critical', () => {
  const held = evaluateResourcePressure(profile(), observations({ memory: 2500000000 }), '2026-09-01T12:00:20.000Z', 'critical');
  assert.equal(held.state, 'critical');

  const recovered = evaluateResourcePressure(profile(), observations({ memory: 4000000000 }), '2026-09-01T12:00:20.000Z', 'critical');
  assert.equal(recovered.state, 'constrained');
});

test('missing, stale, failed, or wrong-host core observations fail closed', () => {
  const missing = observations().filter(item => item.kind !== 'memory');
  assert.throws(() => evaluateResourcePressure(profile(), missing, '2026-09-01T12:00:20.000Z'), /memory/i);

  const stale = observations();
  stale.find(item => item.kind === 'cpu').observed_at = '2026-09-01T11:59:00.000Z';
  assert.throws(() => evaluateResourcePressure(profile(), stale, '2026-09-01T12:00:20.000Z'), /cpu/i);

  const failed = observations();
  const memory = failed.find(item => item.kind === 'memory');
  memory.observation_status = 'failed';
  memory.values = {};
  assert.throws(() => evaluateResourcePressure(profile(), failed, '2026-09-01T12:00:20.000Z'), /memory/i);

  const wrongHost = observations();
  wrongHost.find(item => item.kind === 'storage').host_ref = 'host.other.1';
  assert.throws(() => evaluateResourcePressure(profile(), wrongHost, '2026-09-01T12:00:20.000Z'), /storage/i);
});

test('pressure evaluation never returns authority or privacy relaxation', () => {
  const result = evaluateResourcePressure(profile(), observations({ cpu: 500 }), '2026-09-01T12:00:20.000Z');
  assert.equal(result.state, 'constrained');
  assert.equal(result.authority_effect, 'none');
  assert.equal(result.privacy_relaxation, false);
  assert.equal(result.egress_relaxation, false);
  assert.equal(result.runtime_activation, false);
});
