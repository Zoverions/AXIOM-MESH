import assert from 'node:assert/strict';
import test from 'node:test';

import { ReplayGuard } from '../src/lib/identity.mjs';
import {
  ServiceTelemetry,
  TRANSPORT_COUNTERS,
  TRANSPORT_GAUGES,
  operationsReport,
  readinessState,
  renderOpenMetrics,
  transportMetricsSnapshot
} from '../src/lib/observability.mjs';
import '../src/lib/client.mjs';

function snapshot(service = 'grid') {
  return new ServiceTelemetry(service).snapshot(readinessState(service, [{ name: 'identity', ok: true }]));
}

test('service snapshots carry live replay guard evidence (S-06)', () => {
  const before = transportMetricsSnapshot();
  const guard = new ReplayGuard({ maxEntries: 3 });
  guard.admit('hypervisor', 'a', 2_000, 0);
  guard.admit('hypervisor', 'b', 2_000, 0);
  guard.admit('hypervisor', 'c', 9_000, 0);
  guard.admit('hypervisor', 'd', 9_000, 0);
  guard.admit('hypervisor', 'e', 9_000, 3_000);

  const transport = snapshot().transport;
  assert.equal(transport.replay_capacity - before.replay_capacity, 3);
  assert.equal(transport.replay_entries - before.replay_entries, 2);
  assert.equal(transport.replay_high_water - before.replay_high_water, 3);
  assert.equal(transport.replay_saturated_total - before.replay_saturated_total, 1);
  assert.equal(transport.replay_expired_total - before.replay_expired_total, 2);
  for (const key of [...TRANSPORT_GAUGES, ...TRANSPORT_COUNTERS]) {
    assert.ok(Number.isSafeInteger(transport[key]) && transport[key] >= 0, key);
  }
});

test('the operations report exports transport metrics and alerts on replay saturation', () => {
  const saturated = snapshot('hypervisor');
  saturated.transport = { ...saturated.transport, replay_saturated_total: 2 };
  const nearlyFull = snapshot('sandbox');
  nearlyFull.transport = {
    ...nearlyFull.transport,
    replay_capacity: 1_000,
    replay_high_water: 800,
    replay_saturated_total: 0
  };
  const quiet = snapshot('grid');
  quiet.transport = Object.fromEntries(Object.keys(quiet.transport).map(key => [key, 0]));
  const report = operationsReport([saturated, nearlyFull, quiet]);
  const alerts = new Map(report.alerts.map(alert => [alert.id, alert]));
  assert.equal(alerts.get('replay-guard-saturated:hypervisor')?.severity, 'critical');
  assert.equal(alerts.get('replay-guard-near-capacity:sandbox')?.severity, 'warning');
  assert.equal(alerts.has('replay-guard-saturated:grid'), false);

  const metrics = renderOpenMetrics(report);
  assert.match(metrics, /^# TYPE axiom_transport_state gauge$/m);
  assert.match(metrics, /^axiom_transport_events_total\{service="hypervisor",kind="replay_saturated_total"\} 2$/m);
  assert.match(metrics, /^axiom_transport_state\{service="sandbox",kind="replay_high_water"\} 800$/m);
  assert.match(metrics, /^axiom_transport_events_total\{service="grid",kind="pool_reused_total"\} 0$/m);
});

test('a snapshot without transport evidence still validates, and invalid evidence does not', () => {
  const legacy = snapshot('sandbox');
  delete legacy.transport;
  const report = operationsReport([legacy]);
  assert.equal(report.services[0].transport, undefined);
  assert.doesNotMatch(renderOpenMetrics(report), /^axiom_transport_/m);

  const forged = snapshot('sandbox');
  forged.transport = { ...forged.transport, replay_entries: -1 };
  assert.throws(() => operationsReport([forged]), /telemetry/i);
});
