import { ValidationError } from './canonical.mjs';

const SERVICE_NAME = /^[a-z][a-z0-9-]{0,63}$/;
const CHECK_NAME = /^[a-z][a-z0-9._-]{0,127}$/;
const DURATION_BUCKETS_MS = Object.freeze([5, 10, 25, 50, 100, 250, 500, 1_000, 2_500, 5_000]);
const AUTHENTICATION_ERRORS = new Set([
  'authentication_required',
  'invalid_token',
  'service_auth_required',
  'invalid_service_identity',
  'invalid_service_key',
  'invalid_service_signature',
  'wrong_audience',
  'stale_request',
  'body_digest_mismatch'
]);
const REPLAY_ERRORS = new Set(['replayed_request', 'capability_replayed']);
// Process-wide internal-transport evidence: replay guards, mTLS connection
// pools and the trusted-key cache (scalability audit S-04 to S-06). The
// modules that own that state register a reader here; a snapshot reads them
// all. A process runs one service, so these belong to that service.
export const TRANSPORT_GAUGES = Object.freeze([
  'replay_entries',
  'replay_capacity',
  'replay_high_water',
  'pool_active_sockets',
  'pool_idle_sockets',
  'pool_queued_requests',
  'pool_queued_high_water'
]);
export const TRANSPORT_COUNTERS = Object.freeze([
  'replay_saturated_total',
  'replay_expired_total',
  'pool_connections_total',
  'pool_reused_total',
  'pool_drained_total',
  'pool_queued_total',
  'trusted_key_reads_total',
  'trusted_key_hits_total'
]);
const TRANSPORT_METRICS = Object.freeze([...TRANSPORT_GAUGES, ...TRANSPORT_COUNTERS]);
const transportReaders = new Map();

/** Registers a reader for some of the TRANSPORT_METRICS, under a source name. */
export function registerTransportMetrics(source, read) {
  if (!CHECK_NAME.test(source) || typeof read !== 'function') {
    throw new ValidationError('Transport metrics source is invalid');
  }
  transportReaders.set(source, read);
}

export function transportMetricsSnapshot() {
  const totals = Object.fromEntries(TRANSPORT_METRICS.map(key => [key, 0]));
  for (const read of transportReaders.values()) {
    for (const [key, value] of Object.entries(read() ?? {})) {
      if (Object.hasOwn(totals, key)) totals[key] += safeMetric(value);
    }
  }
  return totals;
}
// Admission evidence for a service that bounds its own work (scalability
// audit S-15): the Hypervisor's intent queue. Per service, not per process.
export const ADMISSION_GAUGES = Object.freeze([
  'active',
  'queued',
  'max_concurrent',
  'max_queued',
  'high_water'
]);
export const ADMISSION_COUNTERS = Object.freeze([
  'started_total',
  'queued_total',
  'rejected_full_total',
  'rejected_timeout_total'
]);
const ADMISSION_METRICS = Object.freeze([...ADMISSION_GAUGES, ...ADMISSION_COUNTERS]);
const AUTHORIZATION_ERRORS = new Set([
  'caller_not_allowed',
  'forbidden',
  'policy_denied',
  'approval_mismatch',
  'independent_approval_required'
]);

export class ServiceTelemetry {
  constructor(service, {
    now = () => Date.now(),
    memoryUsage = () => process.memoryUsage(),
    cpuUsage = () => process.cpuUsage()
  } = {}) {
    if (!SERVICE_NAME.test(service)) throw new ValidationError('Telemetry service name is invalid');
    this.service = service;
    this.now = now;
    this.memoryUsage = memoryUsage;
    this.cpuUsage = cpuUsage;
    this.startedAtMs = now();
    this.inFlight = 0;
    this.maxInFlight = 0;
    this.requests = 0;
    this.responses = { '2xx': 0, '3xx': 0, '4xx': 0, '5xx': 0 };
    this.durationCount = 0;
    this.durationSumMs = 0;
    this.durationMaxMs = 0;
    this.durationBuckets = new Map(DURATION_BUCKETS_MS.map(bound => [bound, 0]));
    this.authenticationFailures = 0;
    this.authorizationDenials = 0;
    this.replayRejections = 0;
    this.rateLimitRejections = 0;
    this.upstreamUnavailable = 0;
    this.internalErrors = 0;
    this.integrityIncidents = new Set();
    this.admissionSource = null;
  }

  /** Reports a bounded queue's ADMISSION_METRICS with every snapshot. */
  setAdmissionSource(read) {
    if (typeof read !== 'function') throw new ValidationError('Admission metrics source is invalid');
    this.admissionSource = read;
  }

  beginRequest() {
    this.inFlight += 1;
    this.maxInFlight = Math.max(this.maxInFlight, this.inFlight);
  }

  finishRequest({ status, elapsedMs, errorCode } = {}) {
    this.inFlight = Math.max(0, this.inFlight - 1);
    this.requests += 1;
    const normalizedStatus = Number.isInteger(status) ? status : 500;
    const statusClass = `${Math.min(5, Math.max(2, Math.floor(normalizedStatus / 100)))}xx`;
    this.responses[statusClass] = (this.responses[statusClass] ?? 0) + 1;
    const duration = Number.isFinite(elapsedMs) && elapsedMs >= 0 ? elapsedMs : 0;
    this.durationCount += 1;
    this.durationSumMs += duration;
    this.durationMaxMs = Math.max(this.durationMaxMs, duration);
    for (const bound of DURATION_BUCKETS_MS) {
      if (duration <= bound) this.durationBuckets.set(bound, this.durationBuckets.get(bound) + 1);
    }
    if (AUTHENTICATION_ERRORS.has(errorCode)) this.authenticationFailures += 1;
    if (AUTHORIZATION_ERRORS.has(errorCode)) this.authorizationDenials += 1;
    if (REPLAY_ERRORS.has(errorCode)) this.replayRejections += 1;
    if (errorCode === 'rate_limited') this.rateLimitRejections += 1;
    if (errorCode === 'capability_unavailable' || errorCode === 'upstream_error') {
      this.upstreamUnavailable += 1;
    }
    if (normalizedStatus >= 500) this.internalErrors += 1;
  }

  markIntegrityFailure(fingerprint = 'unspecified') {
    const value = typeof fingerprint === 'string' && fingerprint.length <= 160
      ? fingerprint
      : 'unspecified';
    this.integrityIncidents.add(value);
  }

  recordDependencyFailure() {
    this.upstreamUnavailable += 1;
  }

  snapshot(readiness = readinessState(this.service, [])) {
    const memory = this.memoryUsage();
    const cpu = this.cpuUsage();
    return {
      service: this.service,
      started_at: new Date(this.startedAtMs).toISOString(),
      uptime_seconds: round(Math.max(0, this.now() - this.startedAtMs) / 1_000),
      readiness: normalizeReadiness(readiness, this.service),
      http: {
        in_flight: this.inFlight,
        max_in_flight: this.maxInFlight,
        requests_total: this.requests,
        responses_total: { ...this.responses },
        duration_ms: {
          count: this.durationCount,
          sum: round(this.durationSumMs),
          max: round(this.durationMaxMs),
          buckets: DURATION_BUCKETS_MS.map(le => ({
            le,
            count: this.durationBuckets.get(le)
          }))
        }
      },
      security: {
        authentication_failures_total: this.authenticationFailures,
        authorization_denials_total: this.authorizationDenials,
        replay_rejections_total: this.replayRejections,
        rate_limit_rejections_total: this.rateLimitRejections
      },
      reliability: {
        upstream_unavailable_total: this.upstreamUnavailable,
        internal_errors_total: this.internalErrors,
        integrity_failures_total: this.integrityIncidents.size
      },
      process: {
        resident_memory_bytes: safeMetric(memory.rss),
        heap_used_bytes: safeMetric(memory.heapUsed),
        external_memory_bytes: safeMetric(memory.external),
        cpu_user_microseconds: safeMetric(cpu.user),
        cpu_system_microseconds: safeMetric(cpu.system)
      },
      transport: transportMetricsSnapshot(),
      ...(this.admissionSource
        ? {
            admission: Object.fromEntries(ADMISSION_METRICS.map(key => [
              key,
              safeMetric(this.admissionSource()?.[key])
            ]))
          }
        : {})
    };
  }
}

export function readinessState(service, checks) {
  if (!SERVICE_NAME.test(service)) throw new ValidationError('Readiness service name is invalid');
  if (!Array.isArray(checks)) throw new ValidationError('Readiness checks must be an array');
  const normalized = checks.map((check, index) => {
    if (!check || !CHECK_NAME.test(check.name ?? '')) {
      throw new ValidationError(`Readiness check ${index} has an invalid name`);
    }
    return {
      name: check.name,
      status: check.ok === true ? 'pass' : 'fail',
      critical: check.critical !== false,
      ...(typeof check.code === 'string' && CHECK_NAME.test(check.code)
        ? { code: check.code }
        : {})
    };
  });
  const ready = normalized.every(check => check.status === 'pass' || !check.critical);
  return {
    status: ready ? 'ready' : 'not_ready',
    checked_at: new Date().toISOString(),
    checks: normalized
  };
}

export function operationsReport(services) {
  if (!Array.isArray(services) || !services.length) {
    throw new ValidationError('Operations report requires at least one service');
  }
  const normalized = services.map(validateServiceSnapshot)
    .sort((left, right) => left.service.localeCompare(right.service));
  if (new Set(normalized.map(item => item.service)).size !== normalized.length) {
    throw new ValidationError('Operations report contains duplicate services');
  }
  const alerts = evaluateAlerts(normalized);
  return {
    format: 'axiom-operations.v1',
    generated_at: new Date().toISOString(),
    status: normalized.every(item => item.readiness.status === 'ready') ? 'ready' : 'not_ready',
    topology: {
      mode: 'single-node',
      consensus: false,
      effect_path: ['gateway', 'hypervisor', 'sandbox', 'grid']
    },
    services: normalized,
    alerts
  };
}

export function renderOpenMetrics(report) {
  if (report?.format !== 'axiom-operations.v1' || !Array.isArray(report.services)) {
    throw new ValidationError('Operations report is invalid');
  }
  const services = report.services.map(validateServiceSnapshot)
    .sort((left, right) => left.service.localeCompare(right.service));
  const lines = [
    '# HELP axiom_service_ready Whether the service and its critical dependencies are ready.',
    '# TYPE axiom_service_ready gauge',
    '# HELP axiom_service_uptime_seconds Seconds since the service process initialized.',
    '# TYPE axiom_service_uptime_seconds gauge',
    '# HELP axiom_http_requests_total Completed HTTP requests by status class.',
    '# TYPE axiom_http_requests_total counter',
    '# HELP axiom_http_request_duration_seconds HTTP request duration histogram.',
    '# TYPE axiom_http_request_duration_seconds histogram',
    '# HELP axiom_security_events_total Bounded security event counters.',
    '# TYPE axiom_security_events_total counter',
    '# HELP axiom_reliability_events_total Bounded reliability event counters.',
    '# TYPE axiom_reliability_events_total counter',
    '# HELP axiom_process_resident_memory_bytes Resident process memory.',
    '# TYPE axiom_process_resident_memory_bytes gauge',
    '# HELP axiom_process_cpu_seconds_total Process CPU time by mode.',
    '# TYPE axiom_process_cpu_seconds_total counter',
    '# HELP axiom_transport_state Internal transport state: replay guard occupancy, capacity and high water; pooled sockets in use and idle, and requests waiting for a socket.',
    '# TYPE axiom_transport_state gauge',
    '# HELP axiom_transport_events_total Internal transport events: replay saturation and expiry, connection reuse, requests that waited for a socket, trusted-key reads.',
    '# TYPE axiom_transport_events_total counter',
    '# HELP axiom_admission_state Bounded work admission: running, waiting, bounds and high water.',
    '# TYPE axiom_admission_state gauge',
    '# HELP axiom_admission_events_total Bounded work admission: started, queued and refused work.',
    '# TYPE axiom_admission_events_total counter'
  ];
  for (const service of services) {
    const label = `service="${service.service}"`;
    lines.push(`axiom_service_ready{${label}} ${service.readiness.status === 'ready' ? 1 : 0}`);
    lines.push(`axiom_service_uptime_seconds{${label}} ${metricNumber(service.uptime_seconds)}`);
    for (const statusClass of ['2xx', '3xx', '4xx', '5xx']) {
      lines.push(
        `axiom_http_requests_total{${label},status_class="${statusClass}"} `
        + `${safeMetric(service.http.responses_total[statusClass])}`
      );
    }
    for (const bucket of service.http.duration_ms.buckets) {
      lines.push(
        `axiom_http_request_duration_seconds_bucket{${label},le="${bucket.le / 1_000}"} `
        + `${safeMetric(bucket.count)}`
      );
    }
    lines.push(
      `axiom_http_request_duration_seconds_bucket{${label},le="+Inf"} `
      + `${safeMetric(service.http.duration_ms.count)}`
    );
    lines.push(
      `axiom_http_request_duration_seconds_sum{${label}} `
      + `${metricNumber(service.http.duration_ms.sum / 1_000)}`
    );
    lines.push(
      `axiom_http_request_duration_seconds_count{${label}} `
      + `${safeMetric(service.http.duration_ms.count)}`
    );
    for (const [kind, value] of Object.entries(service.security)) {
      lines.push(`axiom_security_events_total{${label},kind="${kind}"} ${safeMetric(value)}`);
    }
    for (const [kind, value] of Object.entries(service.reliability)) {
      lines.push(`axiom_reliability_events_total{${label},kind="${kind}"} ${safeMetric(value)}`);
    }
    lines.push(
      `axiom_process_resident_memory_bytes{${label}} `
      + `${safeMetric(service.process.resident_memory_bytes)}`
    );
    lines.push(
      `axiom_process_cpu_seconds_total{${label},mode="user"} `
      + `${metricNumber(service.process.cpu_user_microseconds / 1_000_000)}`
    );
    lines.push(
      `axiom_process_cpu_seconds_total{${label},mode="system"} `
      + `${metricNumber(service.process.cpu_system_microseconds / 1_000_000)}`
    );
    if (service.transport) {
      for (const kind of TRANSPORT_GAUGES) {
        lines.push(`axiom_transport_state{${label},kind="${kind}"} ${safeMetric(service.transport[kind])}`);
      }
      for (const kind of TRANSPORT_COUNTERS) {
        lines.push(
          `axiom_transport_events_total{${label},kind="${kind}"} ${safeMetric(service.transport[kind])}`
        );
      }
    }
    if (service.admission) {
      for (const kind of ADMISSION_GAUGES) {
        lines.push(`axiom_admission_state{${label},kind="${kind}"} ${safeMetric(service.admission[kind])}`);
      }
      for (const kind of ADMISSION_COUNTERS) {
        lines.push(
          `axiom_admission_events_total{${label},kind="${kind}"} ${safeMetric(service.admission[kind])}`
        );
      }
    }
  }
  lines.push('# EOF', '');
  return lines.join('\n');
}

export function reportHasReadyServices(report, expectedServices) {
  if (
    report?.format !== 'axiom-operations.v1'
    || report.status !== 'ready'
    || !Array.isArray(report.services)
    || !Array.isArray(expectedServices)
    || !expectedServices.length
  ) return false;
  const normalized = serviceSnapshotsFromReport(report);
  if (!normalized.length) return false;
  const byName = new Map(normalized.map(service => [service.service, service]));
  return expectedServices.every(service => (
    SERVICE_NAME.test(service)
    && byName.get(service)?.readiness?.status === 'ready'
  ));
}

export function serviceSnapshotsFromReport(report) {
  if (report?.format !== 'axiom-operations.v1' || !Array.isArray(report.services)) return [];
  let normalized;
  try {
    normalized = report.services.map(validateServiceSnapshot);
  } catch {
    return [];
  }
  if (new Set(normalized.map(service => service.service)).size !== normalized.length) return [];
  return normalized;
}

export function dependencyFailure(error) {
  const code = typeof error?.code === 'string' && CHECK_NAME.test(error.code)
    ? error.code
    : 'dependency_unavailable';
  return { ok: false, code };
}

function normalizeReadiness(value, service) {
  if (value?.status !== 'ready' && value?.status !== 'not_ready') {
    throw new ValidationError(`Telemetry readiness is invalid for ${service}`);
  }
  if (typeof value.checked_at !== 'string' || Number.isNaN(new Date(value.checked_at).valueOf())) {
    throw new ValidationError(`Telemetry readiness timestamp is invalid for ${service}`);
  }
  if (!Array.isArray(value.checks) || value.checks.length > 32) {
    throw new ValidationError(`Telemetry readiness checks are invalid for ${service}`);
  }
  return {
    status: value.status,
    checked_at: value.checked_at,
    checks: value.checks.map(check => {
      if (
        !check
        || !CHECK_NAME.test(check.name ?? '')
        || !['pass', 'fail'].includes(check.status)
        || typeof check.critical !== 'boolean'
        || (
          check.code !== undefined
          && (typeof check.code !== 'string' || !CHECK_NAME.test(check.code))
        )
      ) throw new ValidationError(`Telemetry readiness check is invalid for ${service}`);
      return {
        name: check.name,
        status: check.status,
        critical: check.critical,
        ...(check.code === undefined ? {} : { code: check.code })
      };
    })
  };
}

function validateServiceSnapshot(value) {
  if (
    !value
    || !SERVICE_NAME.test(value.service ?? '')
    || !value.http
    || !value.security
    || !value.reliability
    || !value.process
  ) throw new ValidationError('Service telemetry snapshot is invalid');
  if (
    typeof value.started_at !== 'string'
    || Number.isNaN(new Date(value.started_at).valueOf())
    || !finiteMetric(value.uptime_seconds)
    || !Array.isArray(value.http.duration_ms?.buckets)
    || value.http.duration_ms.buckets.length !== DURATION_BUCKETS_MS.length
  ) throw new ValidationError(`Service telemetry values are invalid for ${value.service}`);
  const buckets = value.http.duration_ms.buckets.map((bucket, index) => {
    if (bucket?.le !== DURATION_BUCKETS_MS[index]) {
      throw new ValidationError(`Service telemetry duration buckets are invalid for ${value.service}`);
    }
    return { le: bucket.le, count: requireCounter(bucket.count, value.service) };
  });
  if (
    buckets.some((bucket, index) => (
      index > 0 && bucket.count < buckets[index - 1].count
    ))
  ) {
    throw new ValidationError(
      `Service telemetry duration buckets are not cumulative for ${value.service}`
    );
  }
  const responses = Object.fromEntries(['2xx', '3xx', '4xx', '5xx'].map(statusClass => [
    statusClass,
    requireCounter(value.http.responses_total?.[statusClass], value.service)
  ]));
  const security = normalizeCounterGroup(value.security, [
    'authentication_failures_total',
    'authorization_denials_total',
    'replay_rejections_total',
    'rate_limit_rejections_total'
  ], value.service);
  const reliability = normalizeCounterGroup(value.reliability, [
    'upstream_unavailable_total',
    'internal_errors_total',
    'integrity_failures_total'
  ], value.service);
  const processMetrics = normalizeCounterGroup(value.process, [
    'resident_memory_bytes',
    'heap_used_bytes',
    'external_memory_bytes',
    'cpu_user_microseconds',
    'cpu_system_microseconds'
  ], value.service);
  return {
    service: value.service,
    started_at: value.started_at,
    uptime_seconds: value.uptime_seconds,
    readiness: normalizeReadiness(value.readiness, value.service),
    http: {
      in_flight: requireCounter(value.http.in_flight, value.service),
      max_in_flight: requireCounter(value.http.max_in_flight, value.service),
      requests_total: requireCounter(value.http.requests_total, value.service),
      responses_total: responses,
      duration_ms: {
        count: requireCounter(value.http.duration_ms.count, value.service),
        sum: requireFiniteMetric(value.http.duration_ms.sum, value.service),
        max: requireFiniteMetric(value.http.duration_ms.max, value.service),
        buckets
      }
    },
    security,
    reliability,
    process: processMetrics,
    // Optional so that a report from a service without transport evidence
    // (an older build during an upgrade) still validates.
    ...(value.transport === undefined
      ? {}
      : { transport: normalizeCounterGroup(value.transport, TRANSPORT_METRICS, value.service) }),
    // Optional: only a service that bounds its own work reports admission.
    ...(value.admission === undefined
      ? {}
      : { admission: normalizeCounterGroup(value.admission, ADMISSION_METRICS, value.service) })
  };
}

function evaluateAlerts(services) {
  const alerts = [];
  for (const service of services) {
    if (service.readiness.status !== 'ready') {
      alerts.push({
        id: `service-not-ready:${service.service}`,
        severity: 'critical',
        service: service.service,
        condition: 'critical readiness check failed'
      });
    }
    if (service.reliability.integrity_failures_total > 0) {
      alerts.push({
        id: `integrity-failure:${service.service}`,
        severity: 'critical',
        service: service.service,
        condition: 'integrity verification failed during this process lifetime'
      });
    }
    if (service.security.replay_rejections_total > 0) {
      alerts.push({
        id: `replay-rejected:${service.service}`,
        severity: 'warning',
        service: service.service,
        condition: 'one or more replay attempts were rejected'
      });
    }
    if (service.transport?.replay_saturated_total > 0) {
      alerts.push({
        id: `replay-guard-saturated:${service.service}`,
        severity: 'critical',
        service: service.service,
        condition: 'replay protection refused requests because it was full'
      });
    } else if (
      service.transport?.replay_capacity > 0
      && service.transport.replay_high_water * 10 >= service.transport.replay_capacity * 8
    ) {
      alerts.push({
        id: `replay-guard-near-capacity:${service.service}`,
        severity: 'warning',
        service: service.service,
        condition: 'replay protection reached 80% of its capacity'
      });
    }
    if (service.transport?.pool_queued_total > 0) {
      alerts.push({
        id: `connection-pool-saturated:${service.service}`,
        severity: 'warning',
        service: service.service,
        condition: 'internal requests waited for a socket because a connection pool was at its limit'
      });
    }
    const refused = (service.admission?.rejected_full_total ?? 0)
      + (service.admission?.rejected_timeout_total ?? 0);
    if (refused > 0) {
      alerts.push({
        id: `admission-refused:${service.service}`,
        severity: 'warning',
        service: service.service,
        condition: 'work was refused because the admission queue was full or its wait bound passed'
      });
    }
    if (service.security.authentication_failures_total >= 5) {
      alerts.push({
        id: `authentication-failures:${service.service}`,
        severity: 'warning',
        service: service.service,
        condition: 'authentication failure count reached the static alert threshold'
      });
    }
    if (service.reliability.upstream_unavailable_total > 0) {
      alerts.push({
        id: `upstream-unavailable:${service.service}`,
        severity: 'warning',
        service: service.service,
        condition: 'one or more required upstream requests were unavailable'
      });
    }
    if (service.http.max_in_flight >= 48) {
      alerts.push({
        id: `service-saturated:${service.service}`,
        severity: 'warning',
        service: service.service,
        condition: 'maximum in-flight requests reached the static saturation threshold'
      });
    }
    const requests = service.http.requests_total;
    const errors = service.http.responses_total['5xx'];
    if (requests >= 20 && errors / requests >= 0.05) {
      alerts.push({
        id: `server-error-ratio:${service.service}`,
        severity: 'warning',
        service: service.service,
        condition: '5xx response ratio is at least 5% over the process lifetime'
      });
    }
  }
  return alerts.sort((left, right) => left.id.localeCompare(right.id));
}

function safeMetric(value) {
  return Number.isSafeInteger(value) && value >= 0 ? value : 0;
}

function requireCounter(value, service) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new ValidationError(`Service telemetry counter is invalid for ${service}`);
  }
  return value;
}

function requireFiniteMetric(value, service) {
  if (!finiteMetric(value)) {
    throw new ValidationError(`Service telemetry measurement is invalid for ${service}`);
  }
  return value;
}

function finiteMetric(value) {
  return Number.isFinite(value) && value >= 0;
}

function normalizeCounterGroup(group, keys, service) {
  return Object.fromEntries(keys.map(key => [key, requireCounter(group?.[key], service)]));
}

function metricNumber(value) {
  return Number.isFinite(value) && value >= 0 ? String(round(value)) : '0';
}

function round(value) {
  return Math.round(value * 1_000) / 1_000;
}
