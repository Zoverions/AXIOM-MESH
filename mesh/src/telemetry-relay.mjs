import http from 'node:http';
import { lstat, mkdir, open, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  canonicalJson,
  digestObject,
  sha256,
  ValidationError
} from './lib/canonical.mjs';
import {
  operationsReport,
  serviceSnapshotsFromReport
} from './lib/observability.mjs';
import { MESH_ROOT } from './lib/config.mjs';

const POLICY_SCHEMA = 'axiom-telemetry-routing-policy.v1';
const DESTINATIONS_SCHEMA = 'axiom-telemetry-destinations.v1';
const STATE_SCHEMA = 'axiom-telemetry-relay-state.v1';
const SERVICE_NAMES = Object.freeze(['gateway', 'grid', 'hypervisor', 'sandbox']);
const STATUS_CLASSES = Object.freeze(['2xx', '3xx', '4xx', '5xx']);
const SECURITY_KINDS = Object.freeze([
  'authentication_failures_total',
  'authorization_denials_total',
  'replay_rejections_total',
  'rate_limit_rejections_total'
]);
const RELIABILITY_KINDS = Object.freeze([
  'upstream_unavailable_total',
  'internal_errors_total',
  'integrity_failures_total'
]);
const ALERT_NAMES = Object.freeze({
  'authentication-failures': 'AxiomAuthenticationFailures',
  'integrity-failure': 'AxiomIntegrityFailure',
  'replay-rejected': 'AxiomReplayRejected',
  'server-error-ratio': 'AxiomServerErrorRatio',
  'service-not-ready': 'AxiomServiceNotReady',
  'service-saturated': 'AxiomServiceSaturated',
  'upstream-unavailable': 'AxiomUpstreamUnavailable'
});
const ALERT_SUMMARIES = Object.freeze({
  'authentication-failures': 'Repeated authentication failures reached the bounded threshold.',
  'integrity-failure': 'A runtime integrity verification failed.',
  'replay-rejected': 'One or more replay attempts were rejected.',
  'server-error-ratio': 'The server-error ratio exceeded the static threshold.',
  'service-not-ready': 'A critical service readiness check failed.',
  'service-saturated': 'Observed in-flight work reached the static saturation threshold.',
  'upstream-unavailable': 'A required upstream dependency was unavailable.'
});
const DIGEST = /^[a-f0-9]{64}$/;
const RECEIPT = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/;

export async function loadTelemetryRoutingPolicy(
  path = join(MESH_ROOT, 'config', 'telemetry-routing.json')
) {
  return validateTelemetryRoutingPolicy(JSON.parse(await readFile(path, 'utf8'))).policy;
}

export function validateTelemetryRoutingPolicy(policy) {
  if (
    !plainObject(policy)
    || policy.schema !== POLICY_SCHEMA
    || policy.version !== 1
  ) {
    throw new ValidationError('Telemetry routing policy schema is invalid');
  }
  const scrape = policy.scrape;
  if (
    !plainObject(scrape)
    || scrape.transport !== 'unix-domain-http'
    || scrape.scope !== 'telemetry:collect'
    || scrape.operations_path !== '/v1/operations'
    || scrape.metrics_path !== '/v1/metrics'
  ) {
    throw new ValidationError('Telemetry scrape boundary is invalid');
  }
  requireInteger(scrape.interval_seconds, 15, 300, 'Telemetry scrape interval');
  requireInteger(scrape.timeout_ms, 500, 10_000, 'Telemetry scrape timeout');
  requireInteger(
    scrape.max_response_bytes,
    16_384,
    1_048_576,
    'Telemetry scrape response limit'
  );
  if (
    policy.destinations?.metrics?.protocol !== 'otlp-http-json'
    || policy.destinations.metrics.required_path !== '/v1/metrics'
    || policy.destinations?.alerts?.protocol !== 'alertmanager-v2'
    || policy.destinations.alerts.required_path !== '/api/v2/alerts'
  ) {
    throw new ValidationError('Telemetry destination protocols are invalid');
  }
  const delivery = policy.delivery;
  for (const [key, minimum, maximum] of [
    ['request_timeout_ms', 500, 30_000],
    ['max_queue_items', 8, 1_024],
    ['alert_reserve_items', 1, 256],
    ['max_queue_bytes', 65_536, 16_777_216],
    ['max_item_bytes', 16_384, 1_048_576],
    ['max_attempts', 1, 10],
    ['initial_retry_delay_ms', 100, 60_000],
    ['max_retry_delay_ms', 1_000, 900_000],
    ['audit_history_items', 16, 4_096],
    ['resolution_replay_seconds', 60, 600]
  ]) requireInteger(delivery?.[key], minimum, maximum, `Telemetry ${key}`);
  if (
    delivery.alert_reserve_items >= delivery.max_queue_items
    || delivery.max_item_bytes > delivery.max_queue_bytes
    || delivery.initial_retry_delay_ms > delivery.max_retry_delay_ms
    || !Array.isArray(delivery.retryable_statuses)
    || canonicalJson(delivery.retryable_statuses) !== canonicalJson([
      408, 425, 429, 500, 502, 503, 504
    ])
  ) {
    throw new ValidationError('Telemetry retry or queue policy is invalid');
  }
  const privacy = policy.privacy;
  if (
    canonicalJson(privacy?.services) !== canonicalJson(SERVICE_NAMES)
    || canonicalJson(privacy?.allowed_metric_attribute_keys) !== canonicalJson([
      'kind', 'mode', 'service', 'status_class'
    ])
    || canonicalJson(privacy?.allowed_alert_label_keys) !== canonicalJson([
      'alertname', 'service', 'severity', 'source'
    ])
    || canonicalJson(privacy?.forbidden_terms) !== canonicalJson([
      'approval',
      'intent_id',
      'object_id',
      'payload',
      'principal',
      'prompt',
      'query',
      'token'
    ])
  ) {
    throw new ValidationError('Telemetry privacy vocabulary is invalid');
  }
  requireInteger(privacy.max_metric_points, 64, 256, 'Telemetry metric-point limit');
  requireInteger(privacy.max_alerts, 1, 100, 'Telemetry alert limit');
  return {
    valid: true,
    schema: POLICY_SCHEMA,
    policy: structuredClone(policy),
    digest: digestObject(policy),
    services: privacy.services.length,
    max_queue_items: delivery.max_queue_items
  };
}

export function validateTelemetryDestinations(
  destinations,
  policy,
  { allowLoopbackHttp = false } = {}
) {
  validateTelemetryRoutingPolicy(policy);
  if (
    !plainObject(destinations)
    || destinations.schema !== DESTINATIONS_SCHEMA
    || destinations.version !== 1
    || !Array.isArray(destinations.allowed_origins)
    || destinations.allowed_origins.length < 1
    || destinations.allowed_origins.length > 8
  ) {
    throw new ValidationError('Telemetry destinations schema is invalid');
  }
  const allowedOrigins = destinations.allowed_origins.map((value, index) => {
    const url = secureUrl(value, {
      allowLoopbackHttp,
      label: `Telemetry allowed origin ${index + 1}`
    });
    if (
      url.origin !== url.toString().replace(/\/$/, '')
      || url.pathname !== '/'
      || url.search
      || url.hash
    ) {
      throw new ValidationError('Telemetry allowed origins must not contain paths or parameters');
    }
    return url.origin;
  });
  if (new Set(allowedOrigins).size !== allowedOrigins.length) {
    throw new ValidationError('Telemetry allowed origins must be unique');
  }
  const normalized = {};
  for (const kind of ['metrics', 'alerts']) {
    const destination = destinations[kind];
    if (!plainObject(destination)) {
      throw new ValidationError(`Telemetry ${kind} destination is invalid`);
    }
    const url = secureUrl(destination.url, {
      allowLoopbackHttp,
      label: `Telemetry ${kind} destination`
    });
    if (
      url.pathname !== policy.destinations[kind].required_path
      || url.search
      || url.hash
      || !allowedOrigins.includes(url.origin)
      || typeof destination.credential_file !== 'string'
      || !isAbsolute(destination.credential_file)
    ) {
      throw new ValidationError(`Telemetry ${kind} destination violates the allowlist`);
    }
    normalized[kind] = {
      kind,
      protocol: policy.destinations[kind].protocol,
      url: url.toString(),
      origin: url.origin,
      credential_file: destination.credential_file
    };
  }
  return {
    schema: DESTINATIONS_SCHEMA,
    version: 1,
    allowed_origins: allowedOrigins,
    ...normalized
  };
}

export async function loadTelemetryDestinations(path, policy) {
  const normalized = validateTelemetryDestinations(
    JSON.parse(await boundedFile(path, 65_536, 'Telemetry destinations')),
    policy
  );
  for (const kind of ['metrics', 'alerts']) {
    normalized[kind].credential = await loadPrivateCredential(
      normalized[kind].credential_file,
      `Telemetry ${kind} credential`
    );
  }
  return normalized;
}

export async function scrapeKernelTelemetry({
  socketPath,
  token,
  policy,
  request = unixSocketRequest
}) {
  validateTelemetryRoutingPolicy(policy);
  if (
    typeof socketPath !== 'string'
    || !isAbsolute(socketPath)
    || Buffer.byteLength(socketPath) > 100
    || typeof token !== 'string'
    || token.length < 32
    || token.length > 512
  ) {
    throw new ValidationError('Telemetry scrape credentials or socket are invalid');
  }
  const headers = {
    authorization: `Bearer ${token}`,
    accept: 'application/json'
  };
  const operationsResponse = await request({
    socketPath,
    path: policy.scrape.operations_path,
    headers,
    timeoutMs: policy.scrape.timeout_ms,
    maxBytes: policy.scrape.max_response_bytes
  });
  if (
    operationsResponse.status !== 200
    || !String(operationsResponse.contentType).startsWith('application/json')
  ) {
    throw new ValidationError('Telemetry operations scrape was rejected');
  }
  let operations;
  try {
    operations = JSON.parse(operationsResponse.body);
  } catch {
    throw new ValidationError('Telemetry operations response is invalid JSON');
  }
  const report = sanitizeOperationsReport(operations, policy);
  const metricsResponse = await request({
    socketPath,
    path: policy.scrape.metrics_path,
    headers: {
      authorization: `Bearer ${token}`,
      accept: 'application/openmetrics-text'
    },
    timeoutMs: policy.scrape.timeout_ms,
    maxBytes: policy.scrape.max_response_bytes
  });
  if (
    metricsResponse.status !== 200
    || !String(metricsResponse.contentType).startsWith('application/openmetrics-text')
    || !metricsResponse.body.endsWith('# EOF\n')
  ) {
    throw new ValidationError('Telemetry OpenMetrics scrape was rejected');
  }
  assertRedacted(metricsResponse.body, policy, 'OpenMetrics scrape');
  return {
    report,
    openmetrics_sha256: sha256(metricsResponse.body),
    openmetrics_bytes: Buffer.byteLength(metricsResponse.body)
  };
}

export function sanitizeOperationsReport(report, policy) {
  validateTelemetryRoutingPolicy(policy);
  const snapshots = serviceSnapshotsFromReport(report);
  if (
    snapshots.length !== SERVICE_NAMES.length
    || canonicalJson(snapshots.map(item => item.service).sort()) !== canonicalJson(SERVICE_NAMES)
  ) {
    throw new ValidationError('Telemetry report must contain the exact four-service topology');
  }
  const sanitized = operationsReport(snapshots);
  if (sanitized.alerts.length > policy.privacy.max_alerts) {
    throw new ValidationError('Telemetry alert count exceeds the privacy limit');
  }
  assertRedacted(canonicalJson(sanitized), policy, 'Operations report');
  return sanitized;
}

export function buildOtlpMetricsRequest(report, policy, observedAt = new Date().toISOString()) {
  const sanitized = sanitizeOperationsReport(report, policy);
  const timeUnixNano = unixNano(observedAt);
  const services = sanitized.services;
  const metrics = [
    gaugeMetric('axiom_service_ready', services.map(service => point(
      service,
      timeUnixNano,
      service.readiness.status === 'ready' ? 1 : 0
    ))),
    gaugeMetric('axiom_service_uptime_seconds', services.map(service => point(
      service,
      timeUnixNano,
      service.uptime_seconds
    ))),
    sumMetric(
      'axiom_http_requests_total',
      services.flatMap(service => STATUS_CLASSES.map(statusClass => point(
        service,
        timeUnixNano,
        service.http.responses_total[statusClass],
        { status_class: statusClass }
      )))
    ),
    histogramMetric('axiom_http_request_duration_seconds', services.map(service => (
      histogramPoint(service, timeUnixNano)
    ))),
    sumMetric(
      'axiom_security_events_total',
      services.flatMap(service => SECURITY_KINDS.map(kind => point(
        service,
        timeUnixNano,
        service.security[kind],
        { kind }
      )))
    ),
    sumMetric(
      'axiom_reliability_events_total',
      services.flatMap(service => RELIABILITY_KINDS.map(kind => point(
        service,
        timeUnixNano,
        service.reliability[kind],
        { kind }
      )))
    ),
    gaugeMetric('axiom_process_resident_memory_bytes', services.map(service => point(
      service,
      timeUnixNano,
      service.process.resident_memory_bytes
    ))),
    sumMetric(
      'axiom_process_cpu_seconds_total',
      services.flatMap(service => [
        point(service, timeUnixNano, service.process.cpu_user_microseconds / 1_000_000, {
          mode: 'user'
        }),
        point(service, timeUnixNano, service.process.cpu_system_microseconds / 1_000_000, {
          mode: 'system'
        })
      ])
    )
  ];
  const metricPoints = metrics.reduce((count, metric) => (
    count + (metric.gauge?.dataPoints?.length
      ?? metric.sum?.dataPoints?.length
      ?? metric.histogram?.dataPoints?.length
      ?? 0)
  ), 0);
  if (metricPoints > policy.privacy.max_metric_points) {
    throw new ValidationError('OTLP metric point count exceeds the policy limit');
  }
  const request = {
    resourceMetrics: [{
      resource: {
        attributes: [
          attribute('service.namespace', 'axiom-mesh'),
          attribute('deployment.environment.name', 'production-candidate')
        ]
      },
      scopeMetrics: [{
        scope: {
          name: 'axiom-mesh.telemetry-relay',
          version: '0.11.0'
        },
        metrics
      }]
    }]
  };
  assertMetricAttributes(request, policy);
  assertRedacted(canonicalJson(request), policy, 'OTLP metrics request');
  return { request, metric_points: metricPoints };
}

export function updateAlertState(
  previous,
  report,
  policy,
  observedAt = new Date().toISOString()
) {
  const sanitized = sanitizeOperationsReport(report, policy);
  const nowMs = timestamp(observedAt, 'Telemetry observation timestamp');
  const prior = normalizeAlertState(previous);
  const active = new Map();
  const currentIds = new Set(sanitized.alerts.map(alert => alert.id));
  for (const alert of sanitized.alerts) {
    const existing = prior.get(alert.id);
    active.set(alert.id, {
      id: alert.id,
      severity: alert.severity,
      started_at: existing?.started_at ?? observedAt,
      resolved_at: null,
      replay_until: null
    });
  }
  for (const [id, existing] of prior) {
    if (currentIds.has(id)) continue;
    const resolvedAt = existing.resolved_at ?? observedAt;
    const replayUntil = existing.replay_until ?? new Date(
      nowMs + policy.delivery.resolution_replay_seconds * 1_000
    ).toISOString();
    if (timestamp(replayUntil, 'Alert replay deadline') >= nowMs) {
      active.set(id, {
        id,
        severity: existing.severity,
        started_at: existing.started_at,
        resolved_at: resolvedAt,
        replay_until: replayUntil
      });
    }
  }
  return Object.fromEntries([...active].sort(([left], [right]) => left.localeCompare(right)));
}

export function buildAlertmanagerRequest(
  report,
  alertState,
  policy,
  observedAt = new Date().toISOString()
) {
  const sanitized = sanitizeOperationsReport(report, policy);
  const state = normalizeAlertState(alertState);
  const current = new Map(sanitized.alerts.map(alert => [alert.id, alert]));
  const alerts = [];
  for (const [id, lifecycle] of state) {
    const parsed = parseAlertId(id);
    const alert = current.get(id);
    if (!alert && !lifecycle.resolved_at) continue;
    alerts.push({
      labels: {
        alertname: ALERT_NAMES[parsed.kind],
        service: parsed.service,
        severity: lifecycle.severity,
        source: 'axiom-mesh'
      },
      annotations: {
        summary: ALERT_SUMMARIES[parsed.kind]
      },
      startsAt: lifecycle.started_at,
      ...(lifecycle.resolved_at ? { endsAt: lifecycle.resolved_at } : {}),
      generatorURL: 'https://github.com/Zoverions/AXIOM-MESH/blob/main/mesh/PRODUCTION.md'
    });
  }
  if (alerts.length > policy.privacy.max_alerts) {
    throw new ValidationError('Alertmanager request exceeds the alert limit');
  }
  assertAlertLabels(alerts, policy);
  assertRedacted(canonicalJson(alerts), policy, 'Alertmanager request');
  return alerts.sort((left, right) => (
    `${left.labels.alertname}:${left.labels.service}`
      .localeCompare(`${right.labels.alertname}:${right.labels.service}`)
  ));
}

export function createTelemetryRelayState(policy) {
  const verification = validateTelemetryRoutingPolicy(policy);
  return {
    schema: STATE_SCHEMA,
    version: 1,
    policy_digest: verification.digest,
    sequence: 0,
    queue: [],
    alerts: {},
    audit: [],
    counters: {
      scrapes_total: 0,
      deliveries_total: 0,
      retries_total: 0,
      dead_letters_total: 0,
      metrics_coalesced_total: 0
    }
  };
}

export function validateTelemetryRelayState(state, policy) {
  const verification = validateTelemetryRoutingPolicy(policy);
  if (
    !plainObject(state)
    || state.schema !== STATE_SCHEMA
    || state.version !== 1
    || state.policy_digest !== verification.digest
    || !Number.isSafeInteger(state.sequence)
    || state.sequence < 0
    || !Array.isArray(state.queue)
    || !Array.isArray(state.audit)
    || !plainObject(state.alerts)
    || !plainObject(state.counters)
  ) {
    throw new ValidationError('Telemetry relay state is invalid');
  }
  if (
    state.queue.length > policy.delivery.max_queue_items
    || state.audit.length > policy.delivery.audit_history_items
    || Buffer.byteLength(canonicalJson(state.queue)) > policy.delivery.max_queue_bytes
  ) {
    throw new ValidationError('Telemetry relay state exceeds policy limits');
  }
  const ids = new Set();
  for (const item of state.queue) {
    validateQueueItem(item, policy);
    if (ids.has(item.delivery_id)) {
      throw new ValidationError('Telemetry relay queue contains duplicate delivery IDs');
    }
    ids.add(item.delivery_id);
  }
  normalizeAlertState(state.alerts);
  for (const key of [
    'scrapes_total',
    'deliveries_total',
    'retries_total',
    'dead_letters_total',
    'metrics_coalesced_total'
  ]) {
    if (!Number.isSafeInteger(state.counters[key]) || state.counters[key] < 0) {
      throw new ValidationError('Telemetry relay counters are invalid');
    }
  }
  assertRedacted(canonicalJson(state), policy, 'Telemetry relay state');
  return structuredClone(state);
}

export function enqueueTelemetryDelivery(
  state,
  {
    kind,
    payload,
    createdAt = new Date().toISOString()
  },
  policy
) {
  const next = validateTelemetryRelayState(state, policy);
  if (!['metrics', 'alerts'].includes(kind)) {
    throw new ValidationError('Telemetry delivery kind is invalid');
  }
  timestamp(createdAt, 'Telemetry delivery timestamp');
  const body = canonicalJson(payload);
  const bodyBytes = Buffer.byteLength(body);
  if (bodyBytes < 2 || bodyBytes > policy.delivery.max_item_bytes) {
    throw new ValidationError('Telemetry delivery payload exceeds the item limit');
  }
  assertRedacted(body, policy, 'Telemetry delivery payload');
  if (kind === 'metrics') {
    const before = next.queue.length;
    next.queue = next.queue.filter(item => item.kind !== 'metrics');
    next.counters.metrics_coalesced_total += before - next.queue.length;
  }
  const contentDigest = sha256(body);
  if (next.queue.some(item => item.kind === kind && item.content_sha256 === contentDigest)) {
    return next;
  }
  const nonAlertLimit = (
    policy.delivery.max_queue_items - policy.delivery.alert_reserve_items
  );
  if (kind === 'metrics' && next.queue.filter(item => item.kind === 'metrics').length >= nonAlertLimit) {
    throw new ValidationError('Telemetry metrics queue reached its reserved-capacity limit');
  }
  if (next.queue.length >= policy.delivery.max_queue_items) {
    if (kind === 'alerts') {
      const metricIndex = next.queue.findIndex(item => item.kind === 'metrics');
      if (metricIndex >= 0) {
        next.queue.splice(metricIndex, 1);
        next.counters.metrics_coalesced_total += 1;
      } else {
        throw new ValidationError('Telemetry alert queue is full; no alert was discarded');
      }
    } else {
      throw new ValidationError('Telemetry delivery queue is full');
    }
  }
  next.sequence += 1;
  const item = {
    schema: 'axiom-telemetry-delivery.v1',
    delivery_id: `delivery_${sha256(`${kind}\n${next.sequence}\n${createdAt}\n${contentDigest}`).slice(0, 32)}`,
    kind,
    created_at: createdAt,
    content_sha256: contentDigest,
    body_bytes: bodyBytes,
    attempt: 0,
    next_attempt_at: createdAt,
    content: payload
  };
  next.queue.push(item);
  validateTelemetryRelayState(next, policy);
  return next;
}

export async function processTelemetryDeliveries(
  state,
  {
    policy,
    destinations,
    now = new Date().toISOString(),
    deliver = deliverTelemetryItem
  }
) {
  let next = validateTelemetryRelayState(state, policy);
  const normalizedDestinations = destinationsWithCredentials(destinations, policy);
  const nowMs = timestamp(now, 'Telemetry delivery processing timestamp');
  const remaining = [];
  for (const item of next.queue) {
    if (timestamp(item.next_attempt_at, 'Telemetry retry timestamp') > nowMs) {
      remaining.push(item);
      continue;
    }
    let result;
    try {
      result = await deliver({
        item: structuredClone(item),
        destination: normalizedDestinations[item.kind],
        timeoutMs: policy.delivery.request_timeout_ms
      });
    } catch (error) {
      result = {
        accepted: false,
        status: 0,
        error_code: boundedCode(error?.code ?? error?.name ?? 'delivery_failed')
      };
    }
    const status = Number.isInteger(result?.status) ? result.status : 0;
    const accepted = result?.accepted === true && status >= 200 && status < 300;
    if (accepted) {
      next.counters.deliveries_total += 1;
      next.audit.push(auditRecord(item, {
        outcome: 'delivered',
        recordedAt: now,
        status,
        receiptId: normalizedReceipt(result.receipt_id)
      }));
      continue;
    }
    const attempt = item.attempt + 1;
    const retryable = (
      status === 0
      || policy.delivery.retryable_statuses.includes(status)
    );
    if (retryable && attempt < policy.delivery.max_attempts) {
      const delay = Math.min(
        policy.delivery.max_retry_delay_ms,
        policy.delivery.initial_retry_delay_ms * (2 ** (attempt - 1))
      );
      remaining.push({
        ...item,
        attempt,
        next_attempt_at: new Date(nowMs + delay).toISOString()
      });
      next.counters.retries_total += 1;
      next.audit.push(auditRecord(item, {
        outcome: 'retry_scheduled',
        recordedAt: now,
        status,
        errorCode: boundedCode(result?.error_code ?? 'delivery_rejected')
      }));
      continue;
    }
    next.counters.dead_letters_total += 1;
    next.audit.push(auditRecord(item, {
      outcome: 'dead_letter',
      recordedAt: now,
      status,
      errorCode: boundedCode(result?.error_code ?? 'delivery_rejected')
    }));
  }
  next.queue = remaining;
  next.audit = next.audit.slice(-policy.delivery.audit_history_items);
  return validateTelemetryRelayState(next, policy);
}

export async function runTelemetryRelayCycle({
  state,
  policy,
  destinations,
  socketPath,
  scrapeToken,
  observedAt = new Date().toISOString(),
  scrape = scrapeKernelTelemetry,
  deliver = deliverTelemetryItem
}) {
  let next = validateTelemetryRelayState(state, policy);
  const scraped = await scrape({
    socketPath,
    token: scrapeToken,
    policy
  });
  next.counters.scrapes_total += 1;
  next.alerts = updateAlertState(next.alerts, scraped.report, policy, observedAt);
  const metrics = buildOtlpMetricsRequest(scraped.report, policy, observedAt);
  next = enqueueTelemetryDelivery(next, {
    kind: 'metrics',
    payload: metrics.request,
    createdAt: observedAt
  }, policy);
  const alerts = buildAlertmanagerRequest(scraped.report, next.alerts, policy, observedAt);
  if (alerts.length) {
    next = enqueueTelemetryDelivery(next, {
      kind: 'alerts',
      payload: alerts,
      createdAt: observedAt
    }, policy);
  }
  next = await processTelemetryDeliveries(next, {
    policy,
    destinations,
    now: observedAt,
    deliver
  });
  return {
    state: next,
    result: {
      observed_at: observedAt,
      openmetrics_sha256: scraped.openmetrics_sha256,
      openmetrics_bytes: scraped.openmetrics_bytes,
      metric_points: metrics.metric_points,
      alerts: alerts.length,
      queued: next.queue.length,
      delivered_total: next.counters.deliveries_total,
      retries_total: next.counters.retries_total,
      dead_letters_total: next.counters.dead_letters_total
    }
  };
}

export async function deliverTelemetryItem({ item, destination, timeoutMs }) {
  const response = await fetch(destination.url, {
    method: 'POST',
    redirect: 'error',
    headers: {
      authorization: `Bearer ${destination.credential}`,
      'content-type': 'application/json',
      'idempotency-key': item.delivery_id,
      'x-axiom-payload-sha256': item.content_sha256
    },
    body: canonicalJson(item.content),
    signal: AbortSignal.timeout(timeoutMs)
  });
  let accepted = response.status >= 200 && response.status < 300;
  let errorCode = accepted ? null : `http_${response.status}`;
  const body = await boundedResponseText(response, 65_536);
  if (accepted && item.kind === 'metrics') {
    if (body) {
      let result;
      try {
        result = JSON.parse(body);
      } catch {
        accepted = false;
        errorCode = 'invalid_otlp_response';
      }
      const rejected = Number(result?.partialSuccess?.rejectedDataPoints ?? 0);
      if (Number.isFinite(rejected) && rejected > 0) {
        accepted = false;
        errorCode = 'otlp_partial_rejection';
      }
    }
  }
  return {
    accepted,
    status: response.status,
    receipt_id: normalizedReceipt(response.headers.get('x-axiom-receipt-id')),
    error_code: errorCode
  };
}

export async function loadTelemetryRelayState(path, policy) {
  try {
    return validateTelemetryRelayState(
      JSON.parse(await boundedFile(path, policy.delivery.max_queue_bytes * 2, 'Telemetry relay state')),
      policy
    );
  } catch (error) {
    if (error?.code === 'ENOENT') return createTelemetryRelayState(policy);
    throw error;
  }
}

export async function saveTelemetryRelayState(path, state, policy) {
  const normalized = validateTelemetryRelayState(state, policy);
  await atomicReplace(path, `${canonicalJson(normalized)}\n`, 0o600);
}

export async function runTelemetryRelay({
  socketPath,
  scrapeTokenFile,
  destinationsPath,
  stateDir,
  once = false,
  policy
}) {
  policy ??= await loadTelemetryRoutingPolicy();
  if (process.platform === 'win32') {
    throw new ValidationError(
      'Production telemetry relay requires a Unix-domain Gateway socket'
    );
  }
  const resolvedStateDir = resolve(stateDir);
  await mkdir(resolvedStateDir, { recursive: true, mode: 0o700 });
  await assertPrivateRegularOrDirectory(resolvedStateDir, 'Telemetry relay state directory', true);
  const lockPath = join(resolvedStateDir, 'relay.lock');
  const lock = await acquireTelemetryRelayLock(lockPath);
  const statePath = join(resolvedStateDir, 'state.json');
  let stopping = false;
  let resolveStop;
  const stop = new Promise(resolvePromise => {
    resolveStop = resolvePromise;
  });
  const onSignal = () => {
    stopping = true;
    resolveStop();
  };
  process.once('SIGINT', onSignal);
  process.once('SIGTERM', onSignal);
  try {
    const scrapeToken = await loadPrivateCredential(
      scrapeTokenFile,
      'Telemetry scrape credential'
    );
    const destinations = await loadTelemetryDestinations(destinationsPath, policy);
    let state = await loadTelemetryRelayState(statePath, policy);
    do {
      const cycle = await runTelemetryRelayCycle({
        state,
        policy,
        destinations,
        socketPath,
        scrapeToken
      });
      state = cycle.state;
      await saveTelemetryRelayState(statePath, state, policy);
      process.stdout.write(`${canonicalJson({
        timestamp: cycle.result.observed_at,
        level: 'info',
        service: 'telemetry-relay',
        event: 'relay.cycle',
        ...cycle.result
      })}\n`);
      if (once || stopping) return cycle.result;
      let timer;
      await Promise.race([
        new Promise(resolveDelay => {
          timer = setTimeout(
            resolveDelay,
            policy.scrape.interval_seconds * 1_000
          );
        }),
        stop
      ]);
      clearTimeout(timer);
    } while (!stopping);
    return null;
  } finally {
    process.removeListener('SIGINT', onSignal);
    process.removeListener('SIGTERM', onSignal);
    await lock.close();
    await rm(lockPath, { force: true });
  }
}

async function unixSocketRequest({ socketPath, path, headers, timeoutMs, maxBytes }) {
  return new Promise((resolveRequest, rejectRequest) => {
    const request = http.request({
      socketPath,
      path,
      method: 'GET',
      headers,
      timeout: timeoutMs
    }, response => {
      const chunks = [];
      let bytes = 0;
      response.on('data', chunk => {
        bytes += chunk.length;
        if (bytes > maxBytes) {
          response.destroy(new ValidationError('Telemetry scrape response exceeds the byte limit'));
          return;
        }
        chunks.push(chunk);
      });
      response.once('end', () => resolveRequest({
        status: response.statusCode,
        contentType: response.headers['content-type'],
        body: Buffer.concat(chunks).toString('utf8')
      }));
    });
    request.once('timeout', () => request.destroy(new Error('Telemetry scrape timed out')));
    request.once('error', rejectRequest);
    request.end();
  });
}

function histogramPoint(service, timeUnixNano) {
  const cumulative = service.http.duration_ms.buckets.map(item => item.count);
  const bucketCounts = cumulative.map((count, index) => String(
    count - (index === 0 ? 0 : cumulative[index - 1])
  ));
  bucketCounts.push(String(service.http.duration_ms.count - cumulative.at(-1)));
  if (bucketCounts.some(value => BigInt(value) < 0n)) {
    throw new ValidationError('Telemetry histogram buckets are not cumulative');
  }
  const startTimeUnixNano = unixNano(service.started_at);
  if (BigInt(startTimeUnixNano) > BigInt(timeUnixNano)) {
    throw new ValidationError('Telemetry histogram start is after its observation');
  }
  return {
    attributes: [attribute('service', service.service)],
    startTimeUnixNano,
    timeUnixNano,
    count: String(service.http.duration_ms.count),
    sum: service.http.duration_ms.sum / 1_000,
    bucketCounts,
    explicitBounds: service.http.duration_ms.buckets.map(item => item.le / 1_000)
  };
}

function point(service, timeUnixNano, value, extra = {}) {
  if (!Number.isFinite(value) || value < 0) {
    throw new ValidationError('Telemetry metric value is invalid');
  }
  const attributes = {
    service: service.service,
    ...extra
  };
  const startTimeUnixNano = unixNano(service.started_at);
  if (BigInt(startTimeUnixNano) > BigInt(timeUnixNano)) {
    throw new ValidationError('Telemetry metric start is after its observation');
  }
  return {
    attributes: Object.entries(attributes)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => attribute(key, item)),
    startTimeUnixNano,
    timeUnixNano,
    ...(Number.isSafeInteger(value)
      ? { asInt: String(value) }
      : { asDouble: value })
  };
}

function gaugeMetric(name, dataPoints) {
  return { name, gauge: { dataPoints } };
}

function sumMetric(name, dataPoints) {
  return {
    name,
    sum: {
      aggregationTemporality: 2,
      isMonotonic: true,
      dataPoints
    }
  };
}

function histogramMetric(name, dataPoints) {
  return {
    name,
    histogram: {
      aggregationTemporality: 2,
      dataPoints
    }
  };
}

function attribute(key, value) {
  return { key, value: { stringValue: String(value) } };
}

function assertMetricAttributes(request, policy) {
  const allowed = new Set(policy.privacy.allowed_metric_attribute_keys);
  const metrics = request.resourceMetrics[0].scopeMetrics[0].metrics;
  for (const metric of metrics) {
    const points = (
      metric.gauge?.dataPoints
      ?? metric.sum?.dataPoints
      ?? metric.histogram?.dataPoints
      ?? []
    );
    for (const metricPoint of points) {
      for (const item of metricPoint.attributes ?? []) {
        if (!allowed.has(item.key)) {
          throw new ValidationError(`Telemetry metric attribute is not allowed: ${item.key}`);
        }
      }
    }
  }
}

function assertAlertLabels(alerts, policy) {
  const allowed = new Set(policy.privacy.allowed_alert_label_keys);
  for (const alert of alerts) {
    if (
      Object.keys(alert.labels).some(key => !allowed.has(key))
      || Object.keys(alert.labels).length !== allowed.size
      || !SERVICE_NAMES.includes(alert.labels.service)
      || !['critical', 'warning', 'resolved'].includes(alert.labels.severity)
      || alert.labels.source !== 'axiom-mesh'
    ) {
      throw new ValidationError('Alertmanager labels violate the privacy policy');
    }
  }
}

function parseAlertId(id) {
  if (typeof id !== 'string') throw new ValidationError('Telemetry alert ID is invalid');
  const separator = id.lastIndexOf(':');
  const kind = id.slice(0, separator);
  const service = id.slice(separator + 1);
  if (!Object.hasOwn(ALERT_NAMES, kind) || !SERVICE_NAMES.includes(service)) {
    throw new ValidationError('Telemetry alert ID is outside the bounded vocabulary');
  }
  return { kind, service };
}

function normalizeAlertState(value) {
  if (!plainObject(value)) throw new ValidationError('Telemetry alert lifecycle state is invalid');
  const entries = Object.entries(value);
  if (entries.length > 100) throw new ValidationError('Telemetry alert lifecycle state is too large');
  const normalized = new Map();
  for (const [id, item] of entries) {
    parseAlertId(id);
    if (
      !plainObject(item)
      || item.id !== id
      || !['critical', 'warning'].includes(item.severity)
      || typeof item.started_at !== 'string'
      || (item.resolved_at !== null && typeof item.resolved_at !== 'string')
      || (item.replay_until !== null && typeof item.replay_until !== 'string')
    ) {
      throw new ValidationError('Telemetry alert lifecycle record is invalid');
    }
    timestamp(item.started_at, 'Alert start timestamp');
    if (item.resolved_at) timestamp(item.resolved_at, 'Alert resolution timestamp');
    if (item.replay_until) timestamp(item.replay_until, 'Alert replay timestamp');
    normalized.set(id, structuredClone(item));
  }
  return normalized;
}

function validateQueueItem(item, policy) {
  if (
    !plainObject(item)
    || item.schema !== 'axiom-telemetry-delivery.v1'
    || !/^delivery_[a-f0-9]{32}$/.test(item.delivery_id ?? '')
    || !['metrics', 'alerts'].includes(item.kind)
    || !DIGEST.test(item.content_sha256 ?? '')
    || !Number.isSafeInteger(item.body_bytes)
    || item.body_bytes < 2
    || item.body_bytes > policy.delivery.max_item_bytes
    || !Number.isSafeInteger(item.attempt)
    || item.attempt < 0
    || item.attempt >= policy.delivery.max_attempts
  ) {
    throw new ValidationError('Telemetry delivery queue item is invalid');
  }
  timestamp(item.created_at, 'Telemetry delivery creation timestamp');
  timestamp(item.next_attempt_at, 'Telemetry delivery retry timestamp');
  const body = canonicalJson(item.content);
  if (
    Buffer.byteLength(body) !== item.body_bytes
    || sha256(body) !== item.content_sha256
  ) {
    throw new ValidationError('Telemetry delivery queue payload integrity check failed');
  }
}

function destinationsWithCredentials(destinations, policy) {
  const normalized = validateTelemetryDestinations(destinations, policy, {
    allowLoopbackHttp: destinations?.test_only_allow_loopback_http === true
  });
  for (const kind of ['metrics', 'alerts']) {
    const credential = destinations[kind]?.credential;
    if (
      typeof credential !== 'string'
      || credential.length < 32
      || credential.length > 2_048
      || /[\r\n]/.test(credential)
    ) {
      throw new ValidationError(`Telemetry ${kind} delivery credential is invalid`);
    }
    normalized[kind].credential = credential;
  }
  return normalized;
}

function auditRecord(item, {
  outcome,
  recordedAt,
  status,
  receiptId = null,
  errorCode = null
}) {
  return {
    delivery_id: item.delivery_id,
    kind: item.kind,
    content_sha256: item.content_sha256,
    recorded_at: recordedAt,
    outcome,
    status,
    receipt_id: receiptId,
    error_code: errorCode
  };
}

function secureUrl(value, { allowLoopbackHttp, label }) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new ValidationError(`${label} is not a valid URL`);
  }
  const loopback = ['127.0.0.1', '::1', 'localhost'].includes(url.hostname);
  if (
    url.username
    || url.password
    || (url.protocol !== 'https:' && !(allowLoopbackHttp && loopback && url.protocol === 'http:'))
  ) {
    throw new ValidationError(`${label} must use credential-free HTTPS`);
  }
  return url;
}

function assertRedacted(serialized, policy, label) {
  const normalized = String(serialized).toLowerCase();
  for (const forbidden of policy.privacy.forbidden_terms) {
    if (normalized.includes(forbidden)) {
      throw new ValidationError(`${label} contains forbidden telemetry term: ${forbidden}`);
    }
  }
}

async function loadPrivateCredential(path, label) {
  if (typeof path !== 'string' || !isAbsolute(path)) {
    throw new ValidationError(`${label} path must be absolute`);
  }
  await assertPrivateRegularOrDirectory(path, label, false);
  const value = (await boundedFile(path, 4_096, label)).trim();
  if (value.length < 32 || value.length > 2_048 || /[\r\n]/.test(value)) {
    throw new ValidationError(`${label} is invalid`);
  }
  return value;
}

async function assertPrivateRegularOrDirectory(path, label, directory) {
  const metadata = await lstat(path);
  if (metadata.isSymbolicLink() || (directory ? !metadata.isDirectory() : !metadata.isFile())) {
    throw new ValidationError(`${label} must be a ${directory ? 'directory' : 'regular file'}`);
  }
  if (process.platform !== 'win32' && (metadata.mode & 0o077) !== 0) {
    throw new ValidationError(`${label} must not be accessible by group or other users`);
  }
}

async function boundedFile(path, maxBytes, label) {
  const metadata = await stat(path);
  if (metadata.size < 1 || metadata.size > maxBytes) {
    throw new ValidationError(`${label} exceeds its file-size limit`);
  }
  return readFile(path, 'utf8');
}

async function boundedResponseText(response, maxBytes) {
  if (!response.body) return '';
  const reader = response.body.getReader();
  const chunks = [];
  let bytes = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    bytes += value.length;
    if (bytes > maxBytes) {
      await reader.cancel();
      throw new ValidationError('Telemetry receiver response exceeds the byte limit');
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString('utf8');
}

async function atomicReplace(path, content, mode) {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  const temporary = `${path}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(temporary, content, { mode, flag: 'wx' });
  try {
    await rename(temporary, path);
  } catch (error) {
    await rm(temporary, { force: true });
    throw error;
  }
}

function unixNano(value) {
  return String(BigInt(timestamp(value, 'Telemetry timestamp')) * 1_000_000n);
}

function timestamp(value, label) {
  const result = Date.parse(value);
  if (!Number.isFinite(result)) throw new ValidationError(`${label} is invalid`);
  return result;
}

function normalizedReceipt(value) {
  if (value === null || value === undefined || value === '') return null;
  const normalized = String(value);
  return (
    RECEIPT.test(normalized)
    && !['approval', 'intent_id', 'object_id', 'payload', 'principal', 'prompt', 'query', 'token']
      .some(term => normalized.toLowerCase().includes(term))
  ) ? normalized : null;
}

function boundedCode(value) {
  const normalized = String(value).toLowerCase().replaceAll(/[^a-z0-9_]/g, '_');
  if (
    !/^[a-z][a-z0-9_]{0,63}$/.test(normalized)
    || ['approval', 'intent_id', 'object_id', 'payload', 'principal', 'prompt', 'query', 'token']
      .some(term => normalized.includes(term))
  ) return 'delivery_failed';
  return normalized;
}

async function acquireTelemetryRelayLock(path) {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const handle = await open(path, 'wx', 0o600);
      await handle.writeFile(`${canonicalJson({
        pid: process.pid,
        started_at: new Date().toISOString()
      })}\n`);
      return handle;
    } catch (error) {
      if (error?.code !== 'EEXIST') throw error;
      const metadata = await lstat(path).catch(candidate => {
        if (candidate?.code === 'ENOENT') return null;
        throw candidate;
      });
      if (metadata === null) continue;
      if (metadata.isSymbolicLink() || !metadata.isFile() || metadata.size > 1_024) {
        throw new ValidationError('Telemetry relay lock is not a bounded regular file');
      }
      let record;
      try {
        record = JSON.parse(await readFile(path, 'utf8'));
      } catch {
        throw new ValidationError('Telemetry relay lock record is invalid');
      }
      if (
        !Number.isSafeInteger(record?.pid)
        || record.pid < 1
        || !Number.isFinite(Date.parse(record?.started_at))
      ) {
        throw new ValidationError('Telemetry relay lock record is invalid');
      }
      if (processIsAlive(record.pid)) {
        throw new ValidationError('Telemetry relay state is locked by another process');
      }
      const stale = `${path}.stale.${sha256(canonicalJson(record)).slice(0, 12)}`;
      try {
        await rename(path, stale);
        await rm(stale, { force: true });
      } catch (candidate) {
        if (candidate?.code !== 'ENOENT') throw candidate;
      }
    }
  }
  throw new ValidationError('Telemetry relay lock could not be acquired safely');
}

function processIsAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    if (error?.code === 'ESRCH') return false;
    return true;
  }
}

function requireInteger(value, minimum, maximum, label) {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new ValidationError(`${label} must be an integer between ${minimum} and ${maximum}`);
  }
}

function plainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

if (
  process.argv[1]
  && import.meta.url === pathToFileURL(process.argv[1]).href
) {
  if (
    process.argv.length < 7
    || process.argv.length > 8
    || process.argv[2] !== 'run'
    || (process.argv[7] !== undefined && process.argv[7] !== '--once')
  ) {
    throw new ValidationError(
      'Usage: node src/telemetry-relay.mjs run <gateway-socket> '
      + '<scrape-token-file> <destinations.json> <state-directory> [--once]'
    );
  }
  await runTelemetryRelay({
    socketPath: process.argv[3],
    scrapeTokenFile: process.argv[4],
    destinationsPath: process.argv[5],
    stateDir: process.argv[6],
    once: process.argv[7] === '--once'
  });
}

export {
  DESTINATIONS_SCHEMA,
  POLICY_SCHEMA,
  STATE_SCHEMA
};
