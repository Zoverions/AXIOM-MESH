import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { createGatewayClient } from '../../packages/axiom-client/index.mjs';
import { ExecutionGate } from '../src/lib/execution-gate.mjs';
import {
  ADMISSION_COUNTERS,
  ADMISSION_GAUGES,
  ServiceTelemetry,
  operationsReport,
  readinessState,
  renderOpenMetrics
} from '../src/lib/observability.mjs';
import { startDevelopmentStack } from '../src/dev.mjs';
import { reserveProductionPortBlock } from '../src/lib/production-host.mjs';

// Scalability audit S-15: a bounded execution queue. Saturation is an
// explicit, retryable answer, and a refused task never starts.

function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}

const overloaded = reason => error => error.code === 'overloaded'
  && error.status === 503
  && error.details.reason === reason
  && error.details.retry_after_seconds === 1;

test('waiting tasks start first come, first served as slots free', async () => {
  const gate = new ExecutionGate({ maxConcurrent: 2, maxQueued: 8, queueTimeoutMs: 5_000 });
  const started = [];
  const release = new Map();
  const runs = [];
  for (const id of ['a', 'b', 'c', 'd', 'e']) {
    const hold = deferred();
    release.set(id, hold.resolve);
    runs.push(gate.run(async () => {
      started.push(id);
      await hold.promise;
      return id;
    }));
  }
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(started, ['a', 'b'], 'only maxConcurrent tasks run');
  assert.equal(gate.snapshot().queued, 3);

  release.get('b')();
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(started, ['a', 'b', 'c'], 'the longest waiting task takes the freed slot');
  release.get('a')();
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(started, ['a', 'b', 'c', 'd']);
  for (const id of ['c', 'd', 'e']) release.get(id)();
  assert.deepEqual(await Promise.all(runs), ['a', 'b', 'c', 'd', 'e']);
  assert.deepEqual(gate.snapshot(), {
    active: 0,
    queued: 0,
    max_concurrent: 2,
    max_queued: 8,
    started_total: 5,
    queued_total: 3,
    rejected_full_total: 0,
    rejected_timeout_total: 0,
    high_water: 2
  });
});

test('a full queue refuses at once, and the refused task never runs', async () => {
  const gate = new ExecutionGate({ maxConcurrent: 1, maxQueued: 1, queueTimeoutMs: 5_000 });
  const hold = deferred();
  const first = gate.run(() => hold.promise);
  const second = gate.run(async () => 'second');
  let ran = false;
  await assert.rejects(gate.run(async () => { ran = true; }), overloaded('queue_full'));
  assert.equal(ran, false);
  hold.resolve('first');
  assert.equal(await first, 'first');
  assert.equal(await second, 'second');
  assert.equal(gate.snapshot().rejected_full_total, 1);

  // With no queue at all, a busy gate refuses every extra task.
  const strict = new ExecutionGate({ maxConcurrent: 1, maxQueued: 0 });
  const busy = deferred();
  const running = strict.run(() => busy.promise);
  await assert.rejects(strict.run(async () => 'no'), overloaded('queue_full'));
  busy.resolve();
  await running;
  assert.equal(await strict.run(async () => 'free again'), 'free again');
});

test('a task that waits too long is refused, never runs, and leaves the queue', async () => {
  const gate = new ExecutionGate({ maxConcurrent: 1, maxQueued: 4, queueTimeoutMs: 20 });
  const hold = deferred();
  const first = gate.run(() => hold.promise);
  let ran = false;
  await assert.rejects(gate.run(async () => { ran = true; }), overloaded('queue_timeout'));
  assert.equal(gate.snapshot().queued, 0, 'a timed-out task gives up its place');
  hold.resolve();
  await first;
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(ran, false);
  assert.equal(gate.snapshot().rejected_timeout_total, 1);
  assert.equal(gate.snapshot().started_total, 1);
});

test('a failing task frees its slot and its error reaches the caller', async () => {
  const gate = new ExecutionGate({ maxConcurrent: 1, maxQueued: 1, queueTimeoutMs: 30 });
  const hold = deferred();
  const failing = gate.run(async () => {
    await hold.promise;
    throw new Error('task failed');
  });
  const waiting = gate.run(async () => 'next');
  hold.resolve();
  await assert.rejects(failing, /task failed/);
  assert.equal(await waiting, 'next');
  assert.equal(gate.snapshot().active, 0);
  // A task that left the queue for a slot is never also counted as timed out.
  await new Promise(resolve => setTimeout(resolve, 60));
  assert.equal(gate.snapshot().rejected_timeout_total, 0);
});

test('the gate refuses invalid bounds and carries its code and details', async () => {
  for (const options of [
    { maxConcurrent: 0 },
    { maxConcurrent: 1.5 },
    { maxQueued: -1 },
    { queueTimeoutMs: 0 },
    { retryAfterSeconds: 0 }
  ]) assert.throws(() => new ExecutionGate(options), RangeError);

  const gate = new ExecutionGate({
    maxConcurrent: 1,
    maxQueued: 0,
    retryAfterSeconds: 3,
    code: 'dependency_unavailable',
    details: { service: 'example', reason: 'overridden' }
  });
  const hold = deferred();
  const running = gate.run(() => hold.promise);
  await assert.rejects(gate.run(async () => {}), error => {
    assert.equal(error.code, 'dependency_unavailable');
    assert.deepEqual(error.details, { service: 'example', reason: 'queue_full', retry_after_seconds: 3 });
    return true;
  });
  hold.resolve();
  await running;
});

test('the operations report carries admission evidence and alerts on refused work', async () => {
  const gate = new ExecutionGate({ maxConcurrent: 1, maxQueued: 0 });
  const telemetry = new ServiceTelemetry('hypervisor');
  telemetry.setAdmissionSource(() => gate.snapshot());
  const hold = deferred();
  const running = gate.run(() => hold.promise);
  await assert.rejects(gate.run(async () => {}), overloaded('queue_full'));

  const busy = telemetry.snapshot(readinessState('hypervisor', [{ name: 'identity', ok: true }]));
  assert.deepEqual(busy.admission, {
    active: 1,
    queued: 0,
    max_concurrent: 1,
    max_queued: 0,
    high_water: 1,
    started_total: 1,
    queued_total: 0,
    rejected_full_total: 1,
    rejected_timeout_total: 0
  });
  const quiet = new ServiceTelemetry('grid').snapshot(readinessState('grid', [{ name: 'identity', ok: true }]));
  assert.equal(quiet.admission, undefined, 'a service without a queue reports none');
  const report = operationsReport([busy, quiet]);
  const named = name => report.services.find(service => service.service === name);
  assert.deepEqual(named('hypervisor').admission, busy.admission, 'the group survives normalization');
  assert.equal(named('grid').admission, undefined);
  const alert = report.alerts.find(item => item.id === 'admission-refused:hypervisor');
  assert.equal(alert?.severity, 'warning');
  assert.equal(report.alerts.some(item => item.id === 'admission-refused:grid'), false);

  const metrics = renderOpenMetrics(report);
  assert.match(metrics, /^# TYPE axiom_admission_state gauge$/m);
  assert.match(metrics, /^axiom_admission_state\{service="hypervisor",kind="active"\} 1$/m);
  assert.match(metrics, /^axiom_admission_events_total\{service="hypervisor",kind="rejected_full_total"\} 1$/m);
  assert.doesNotMatch(metrics, /^axiom_admission_\w+\{service="grid"/m);
  for (const kind of [...ADMISSION_GAUGES, ...ADMISSION_COUNTERS]) {
    assert.match(metrics, new RegExp(`^axiom_admission_\\w+\\{service="hypervisor",kind="${kind}"\\} \\d+$`, 'm'));
  }

  // No refusal, no alert; invalid evidence does not validate.
  hold.resolve();
  await running;
  const calm = new ServiceTelemetry('hypervisor');
  calm.setAdmissionSource(() => new ExecutionGate().snapshot());
  const calmReport = operationsReport([calm.snapshot(readinessState('hypervisor', []))]);
  assert.equal(calmReport.alerts.some(item => item.id.startsWith('admission-refused')), false);
  const forged = { ...busy, admission: { ...busy.admission, queued: -1 } };
  assert.throws(() => operationsReport([forged]), /telemetry/i);
  assert.throws(() => telemetry.setAdmissionSource(null), /Admission metrics source/);
});

test('a saturated Hypervisor refuses intents with a retryable 503 before recording anything', async t => {
  const dataDir = await mkdtemp(join(tmpdir(), 'axiom-intent-gate-'));
  const lease = await reserveProductionPortBlock('hypervisor intent gate');
  const basePort = lease.base_port;
  const token = `intent-gate-${'g'.repeat(32)}`;
  let stack;
  t.after(async () => {
    try {
      await stack?.stop();
    } finally {
      await lease.release();
      await rm(dataDir, { recursive: true, force: true });
    }
  });
  stack = await startDevelopmentStack({
    dataDir,
    environment: 'test',
    autoBootstrap: true,
    gatewayPort: basePort,
    hypervisorPort: basePort + 1,
    sandboxPort: basePort + 2,
    gridPort: basePort + 3,
    hypervisorUrl: `http://127.0.0.1:${basePort + 1}`,
    sandboxUrl: `http://127.0.0.1:${basePort + 2}`,
    gridUrl: `http://127.0.0.1:${basePort + 3}`,
    rateLimitCapacity: 1_000,
    rateLimitRefillPerSecond: 1_000,
    intentGate: { maxConcurrent: 1, maxQueued: 0 },
    apiTokens: {
      [token]: { id: 'intent-gate-operator', type: 'human', roles: ['administrator'], scopes: ['*'] }
    }
  });
  const hypervisor = stack.services.find(service => service.name === 'hypervisor');
  assert.equal(hypervisor.intentGate.maxConcurrent, 1, 'the configured bounds reach the Hypervisor');
  const client = createGatewayClient({
    token,
    request: (path, options) => fetch(`http://127.0.0.1:${basePort}${path}`, options)
  });
  const submit = () => client.call('intents.submit', {
    body: { action: 'system.echo', input: { message: 'bounded' }, purpose: 'intent-gate-test' },
    idempotencyKey: 'intent-gate-test-0001'
  });

  // Occupy the only slot.
  const hold = deferred();
  const occupied = hypervisor.intentGate.run(() => hold.promise);
  await assert.rejects(submit(), error => {
    assert.equal(error.code, 'dependency_unavailable');
    assert.equal(error.status, 503);
    assert.equal(error.retryable, true, 'clients already retry this stable code');
    assert.equal(error.details?.service, 'hypervisor');
    assert.equal(error.details?.reason, 'queue_full');
    assert.equal(error.details?.retry_after_seconds, 1);
    return true;
  });
  // Nothing was recorded for the refused intent.
  const { events } = await client.call('events.list', { query: { limit: 500 } });
  assert.equal(events.some(event => JSON.stringify(event).includes('intent-gate-test')), false);

  // Once the slot frees, the same request with the same key succeeds.
  hold.resolve();
  await occupied;
  const intent = await submit();
  assert.equal(intent.status, 'completed');
  assert.equal(intent.message, 'bounded');
  assert.equal(intent.idempotent_replay, undefined, 'the refused attempt left no intent behind');
  assert.equal(hypervisor.intentGate.snapshot().rejected_full_total, 1);
  // The refusal reaches the Gateway's operations report and metrics.
  const operations = await client.call('operations.get');
  const reported = operations.services.find(service => service.service === 'hypervisor');
  assert.equal(reported.admission.rejected_full_total, 1);
  assert.equal(reported.admission.max_concurrent, 1);
  assert.ok(operations.alerts.some(alert => alert.id === 'admission-refused:hypervisor'));
  const metrics = await fetch(`http://127.0.0.1:${basePort}/v1/metrics`, {
    headers: { authorization: `Bearer ${token}` }
  }).then(response => response.text());
  assert.match(metrics, /^axiom_admission_events_total\{service="hypervisor",kind="rejected_full_total"\} 1$/m);
  const after = await client.call('events.list', { query: { limit: 500 } });
  assert.equal(after.events.some(event => JSON.stringify(event).includes('intent-gate-test')), true, 'the check above can see an intent');
});
