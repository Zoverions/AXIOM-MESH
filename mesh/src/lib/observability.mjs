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
      }
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
    '# TYPE axiom_process_cpu_seconds_total counter'
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
    process: processMetrics
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
    if (service.security.authentication_failures_total >= 5) {
      alerts.push({
        id: `authentication-failures:${service.service}`,
        severity: 'warning',
        service: service.service,
        condition: 'authentication failure count reached the static alert threshold'
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
