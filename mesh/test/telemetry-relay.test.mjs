import assert from 'node:assert/strict';
import { join } from 'node:path';
import test from 'node:test';
import {
  operationsReport,
  readinessState,
  ServiceTelemetry
} from '../src/lib/observability.mjs';
import {
  buildAlertmanagerRequest,
  buildOtlpMetricsRequest,
  createTelemetryRelayState,
  enqueueTelemetryDelivery,
  loadTelemetryRoutingPolicy,
  processTelemetryDeliveries,
  scrapeKernelTelemetry,
  updateAlertState,
  validateTelemetryDestinations,
  validateTelemetryRelayState,
  validateTelemetryRoutingPolicy
} from '../src/telemetry-relay.mjs';

const OBSERVED_AT = '2026-07-28T22:00:00.000Z';

test('telemetry routing policy fixes HTTPS destinations and bounded privacy vocabulary', async () => {
  const policy = await loadTelemetryRoutingPolicy();
  const verification = validateTelemetryRoutingPolicy(policy);
  assert.equal(verification.valid, true);
  assert.equal(verification.services, 4);
  assert.equal(verification.max_queue_items, 64);

  const destinations = destinationConfig();
  const normalized = validateTelemetryDestinations(destinations, policy);
  assert.equal(normalized.metrics.origin, 'https://collector.example.test');
  assert.equal(normalized.alerts.protocol, 'alertmanager-v2');

  assert.throws(
    () => validateTelemetryDestinations({
      ...destinations,
      metrics: {
        ...destinations.metrics,
        url: 'https://unlisted.example.test/v1/metrics'
      }
    }, policy),
    /allowlist/
  );
  assert.throws(
    () => validateTelemetryDestinations({
      ...destinations,
      allowed_origins: ['http://collector.example.test'],
      metrics: {
        ...destinations.metrics,
        url: 'http://collector.example.test/v1/metrics'
      }
    }, policy),
    /HTTPS/
  );
  const weakened = structuredClone(policy);
  weakened.privacy.forbidden_terms = weakened.privacy.forbidden_terms.filter(
    value => value !== 'principal'
  );
  assert.throws(
    () => validateTelemetryRoutingPolicy(weakened),
    /privacy vocabulary/
  );
});

test('OTLP and Alertmanager requests have fixed low-cardinality attributes and no sensitive values', async () => {
  const policy = await loadTelemetryRoutingPolicy();
  const report = reportWithAuthenticationAlert();
  const metrics = buildOtlpMetricsRequest(report, policy, OBSERVED_AT);
  assert.equal(metrics.metric_points, 68);
  assert.equal(metrics.request.resourceMetrics.length, 1);
  assert.match(JSON.stringify(metrics.request), /axiom_http_requests_total/);

  const alertState = updateAlertState({}, report, policy, OBSERVED_AT);
  const alerts = buildAlertmanagerRequest(report, alertState, policy, OBSERVED_AT);
  assert.deepEqual(
    alerts.map(item => item.labels),
    [{
      alertname: 'AxiomAuthenticationFailures',
      service: 'gateway',
      severity: 'warning',
      source: 'axiom-mesh'
    }]
  );
  const serialized = JSON.stringify({ metrics: metrics.request, alerts });
  assert.doesNotMatch(
    serialized,
    /local-operator|intent_id|object_id|payload|principal|prompt|query|token/i
  );

  const tampered = structuredClone(report);
  tampered.services[0].http.duration_ms.buckets[1].count = (
    tampered.services[0].http.duration_ms.buckets[0].count - 1
  );
  assert.throws(
    () => operationsReport(tampered.services),
    /not cumulative/
  );
});

test('resolved alerts preserve their Alertmanager fingerprint during bounded replay', async () => {
  const policy = await loadTelemetryRoutingPolicy();
  const firingReport = reportWithAuthenticationAlert();
  const firingState = updateAlertState({}, firingReport, policy, OBSERVED_AT);
  const [firing] = buildAlertmanagerRequest(
    firingReport,
    firingState,
    policy,
    OBSERVED_AT
  );
  const resolvedAt = '2026-07-28T22:01:00.000Z';
  const resolvedReport = reportWithAuthenticationAlert(0);
  const resolvedState = updateAlertState(
    firingState,
    resolvedReport,
    policy,
    resolvedAt
  );
  const [resolved] = buildAlertmanagerRequest(
    resolvedReport,
    resolvedState,
    policy,
    resolvedAt
  );

  assert.deepEqual(resolved.labels, firing.labels);
  assert.equal(resolved.startsAt, firing.startsAt);
  assert.equal(resolved.endsAt, resolvedAt);
});

test('every alert the operations report raises is relayed across cycles, including transport, pool and admission alerts', async () => {
  const policy = await loadTelemetryRoutingPolicy();
  const report = reportWithAuthenticationAlert();
  const byName = new Map(report.services.map(service => [service.service, service]));
  const zero = keys => Object.fromEntries(Object.keys(keys).map(key => [key, 0]));
  const hypervisor = byName.get('hypervisor');
  hypervisor.transport = { ...zero(hypervisor.transport), replay_capacity: 100, replay_saturated_total: 1 };
  hypervisor.admission = {
    active: 1, queued: 0, max_concurrent: 1, max_queued: 0, high_water: 1,
    started_total: 1, queued_total: 0, rejected_full_total: 1, rejected_timeout_total: 0
  };
  const sandbox = byName.get('sandbox');
  sandbox.transport = { ...zero(sandbox.transport), replay_capacity: 100, replay_high_water: 80 };
  const gateway = byName.get('gateway');
  gateway.transport = { ...zero(gateway.transport), pool_queued_total: 3, pool_queued_high_water: 3 };
  const firing = operationsReport([...byName.values()]);
  const ids = firing.alerts.map(alert => alert.id).sort();
  for (const id of ['admission-refused:hypervisor', 'connection-pool-saturated:gateway', 'replay-guard-near-capacity:sandbox', 'replay-guard-saturated:hypervisor']) {
    assert.ok(ids.includes(id), id);
  }

  const first = updateAlertState({}, firing, policy, OBSERVED_AT);
  const second = updateAlertState(first, firing, policy, '2026-07-28T22:00:30.000Z');
  const names = buildAlertmanagerRequest(firing, second, policy, '2026-07-28T22:00:30.000Z')
    .map(alert => alert.labels.alertname);
  for (const name of ['AxiomAdmissionRefused', 'AxiomConnectionPoolSaturated', 'AxiomReplayGuardNearCapacity', 'AxiomReplayGuardSaturated']) {
    assert.ok(names.includes(name), name);
  }
  assert.equal(names.length, ids.length, 'every raised alert is relayed');

  // Resolution replays under the same names.
  const quiet = reportWithAuthenticationAlert(0);
  const resolvedAt = '2026-07-28T22:01:00.000Z';
  const resolved = buildAlertmanagerRequest(quiet, updateAlertState(second, quiet, policy, resolvedAt), policy, resolvedAt);
  assert.ok(resolved.filter(alert => alert.endsAt === resolvedAt).some(alert => alert.labels.alertname === 'AxiomAdmissionRefused'));
});

test('scraping requires both authenticated bounded endpoints and sanitizes the report', async () => {
  const policy = await loadTelemetryRoutingPolicy();
  const report = reportWithAuthenticationAlert();
  const calls = [];
  const result = await scrapeKernelTelemetry({
    socketPath: join(process.cwd(), 'gateway.sock'),
    token: 's'.repeat(43),
    policy,
    request: async input => {
      calls.push(input);
      if (input.path === '/v1/operations') {
        return {
          status: 200,
          contentType: 'application/json; charset=utf-8',
          body: JSON.stringify({
            ...report,
            untrusted: { principal: 'must-not-propagate' }
          })
        };
      }
      return {
        status: 200,
        contentType: 'application/openmetrics-text; version=1.0.0',
        body: 'axiom_service_ready{service="gateway"} 1\n# EOF\n'
      };
    }
  });
  assert.equal(calls.length, 2);
  assert.equal(calls[0].headers.authorization, `Bearer ${'s'.repeat(43)}`);
  assert.equal(result.report.services.length, 4);
  assert.equal('untrusted' in result.report, false);
  assert.match(result.openmetrics_sha256, /^[a-f0-9]{64}$/);

  await assert.rejects(
    () => scrapeKernelTelemetry({
      socketPath: join(process.cwd(), 'gateway.sock'),
      token: 's'.repeat(43),
      policy,
      request: async () => ({
        status: 200,
        contentType: 'application/openmetrics-text',
        body: 'principal="secret"\n# EOF\n'
      })
    }),
    /operations scrape was rejected|invalid JSON|forbidden/
  );
});

test('the persistent queue retries transient failures, audits receipts, and detects tampering', async () => {
  const policy = await loadTelemetryRoutingPolicy();
  const destinations = destinationConfig({
    credential: 'd'.repeat(43),
    testOnlyHttp: true
  });
  let state = createTelemetryRelayState(policy);
  state = enqueueTelemetryDelivery(state, {
    kind: 'metrics',
    payload: { resourceMetrics: [] },
    createdAt: OBSERVED_AT
  }, policy);
  state = enqueueTelemetryDelivery(state, {
    kind: 'alerts',
    payload: [{
      labels: {
        alertname: 'AxiomServiceNotReady',
        service: 'grid',
        severity: 'critical',
        source: 'axiom-mesh'
      }
    }],
    createdAt: OBSERVED_AT
  }, policy);
  const attempts = [];
  state = await processTelemetryDeliveries(state, {
    policy,
    destinations,
    now: OBSERVED_AT,
    deliver: async ({ item }) => {
      attempts.push(item.kind);
      return item.kind === 'metrics'
        ? { accepted: false, status: 503, error_code: 'receiver_unavailable' }
        : { accepted: true, status: 200, receipt_id: 'receipt:alerts:1' };
    }
  });
  assert.deepEqual(attempts, ['metrics', 'alerts']);
  assert.equal(state.queue.length, 1);
  assert.equal(state.queue[0].attempt, 1);
  assert.equal(state.counters.retries_total, 1);
  assert.equal(state.counters.deliveries_total, 1);
  assert.equal(state.audit.at(-1).receipt_id, 'receipt:alerts:1');

  state = await processTelemetryDeliveries(state, {
    policy,
    destinations,
    now: '2026-07-28T22:00:01.000Z',
    deliver: async () => ({
      accepted: true,
      status: 200,
      receipt_id: 'receipt:metrics:1'
    })
  });
  assert.equal(state.queue.length, 0);
  assert.equal(state.counters.deliveries_total, 2);
  assert.equal(state.counters.dead_letters_total, 0);
  assert.doesNotMatch(
    JSON.stringify(state),
    /Bearer|d{32}|payload|principal|prompt|query|token/i
  );

  let tampered = enqueueTelemetryDelivery(state, {
    kind: 'metrics',
    payload: { resourceMetrics: [] },
    createdAt: '2026-07-28T22:01:00.000Z'
  }, policy);
  tampered = structuredClone(tampered);
  tampered.queue[0].content.resourceMetrics.push({ changed: true });
  assert.throws(
    () => validateTelemetryRelayState(tampered, policy),
    /integrity check failed/
  );
});

test('alert-reserved queue capacity never silently discards an alert', async () => {
  const base = await loadTelemetryRoutingPolicy();
  const policy = structuredClone(base);
  policy.delivery.max_queue_items = 8;
  policy.delivery.alert_reserve_items = 2;
  validateTelemetryRoutingPolicy(policy);
  let state = createTelemetryRelayState(policy);
  for (let index = 0; index < 8; index += 1) {
    state = enqueueTelemetryDelivery(state, {
      kind: 'alerts',
      payload: [{ event: `bounded-alert-${index}` }],
      createdAt: new Date(Date.parse(OBSERVED_AT) + index).toISOString()
    }, policy);
  }
  assert.throws(
    () => enqueueTelemetryDelivery(state, {
      kind: 'alerts',
      payload: [{ event: 'must-not-be-discarded' }],
      createdAt: '2026-07-28T22:01:00.000Z'
    }, policy),
    /no alert was discarded/
  );
  assert.equal(state.queue.length, 8);
});

function reportWithAuthenticationAlert(authenticationFailures = 5) {
  const services = SERVICE_NAMES.map(name => {
    const telemetry = new ServiceTelemetry(name, {
      now: () => Date.parse(OBSERVED_AT),
      memoryUsage: () => ({
        rss: 1_024,
        heapUsed: 512,
        external: 128
      }),
      cpuUsage: () => ({ user: 2_000, system: 1_000 })
    });
    if (name === 'gateway') {
      for (let index = 0; index < authenticationFailures; index += 1) {
        telemetry.beginRequest();
        telemetry.finishRequest({
          status: 401,
          elapsedMs: 1,
          errorCode: 'invalid_token'
        });
      }
    }
    return telemetry.snapshot(readinessState(name, [
      { name: 'identity', ok: true }
    ]));
  });
  return operationsReport(services);
}

function destinationConfig({ credential, testOnlyHttp = false } = {}) {
  const protocol = testOnlyHttp ? 'http' : 'https';
  const host = testOnlyHttp ? '127.0.0.1' : 'collector.example.test';
  const config = {
    schema: 'axiom-telemetry-destinations.v1',
    version: 1,
    allowed_origins: [`${protocol}://${host}`],
    metrics: {
      url: `${protocol}://${host}/v1/metrics`,
      credential_file: join(process.cwd(), 'metrics.token')
    },
    alerts: {
      url: `${protocol}://${host}/api/v2/alerts`,
      credential_file: join(process.cwd(), 'alerts.token')
    }
  };
  if (credential !== undefined) {
    config.metrics.credential = credential;
    config.alerts.credential = credential;
  }
  if (testOnlyHttp) config.test_only_allow_loopback_http = true;
  return config;
}

const SERVICE_NAMES = Object.freeze(['gateway', 'grid', 'hypervisor', 'sandbox']);
