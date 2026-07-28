import { createPublicKey, randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdir, readdir, readFile } from 'node:fs/promises';
import net from 'node:net';
import { join, resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { ValidationError } from './lib/canonical.mjs';
import { ensureMeshIdentity, verifyObjectSignature } from './lib/identity.mjs';
import { provisionProduction } from './provision-production.mjs';

const EVIDENCE_FORMAT = 'axiom-slo-baseline-evidence.v1';
const REVISION = /^[a-f0-9]{40}$/;
const MESH_ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const CANDIDATE_MEMORY_CEILING_BYTES = 512 * 1024 * 1024;
const CANDIDATE_CPU_CEILING_CORES = 2;
const BASELINE_PROFILE = Object.freeze({
  action: 'system.echo',
  warmup_requests: 4,
  measured_requests: 40,
  concurrency: 4,
  request_timeout_ms: 5_000,
  p95_latency_ceiling_ms: 2_000,
  startup_ceiling_ms: 20_000,
  restart_ceiling_ms: 20_000,
  rate_limit_capacity: 60,
  rate_limit_refill_per_second: 1
});

export async function runSloBaseline({
  workspaceDir,
  sourceRevision = process.env.GITHUB_SHA || null
} = {}) {
  const workspace = await prepareDisposableWorkspace(workspaceDir);
  const revision = normalizeRevision(sourceRevision);
  const generatedAt = new Date().toISOString();
  const overallStartedAt = performance.now();
  const provisioned = await provisionProduction({
    dataDir: join(workspace, 'data'),
    secretDir: join(workspace, 'secrets')
  });
  const identity = await ensureMeshIdentity(
    provisioned.data_dir,
    'grid',
    { create: false }
  );
  const token = (await readFile(provisioned.operator_token_file, 'utf8')).trim();
  const basePort = await findPortBlock();
  const gateway = `http://127.0.0.1:${basePort}`;
  const environment = productionEnvironment(provisioned, basePort);
  let runtime;

  try {
    const firstStart = await startSupervisor({ environment, gateway });
    runtime = firstStart;
    const initialOperations = await fetchOperations(gateway, token);
    const warmup = await runIntentProfile({
      gateway,
      token,
      requests: BASELINE_PROFILE.warmup_requests,
      concurrency: BASELINE_PROFILE.concurrency,
      label: 'warmup'
    });
    const beforeLoad = await fetchOperations(gateway, token);
    const loadStartedAt = performance.now();
    const measured = await runIntentProfile({
      gateway,
      token,
      requests: BASELINE_PROFILE.measured_requests,
      concurrency: BASELINE_PROFILE.concurrency,
      label: 'measured'
    });
    const loadDurationMs = elapsedMilliseconds(loadStartedAt);
    const afterLoad = await fetchOperations(gateway, token);
    const capacity = capacitySummary(beforeLoad, afterLoad, loadDurationMs);
    const latency = latencySummary(
      measured.results.filter(result => result.success).map(result => result.latency_ms)
    );
    const failureCounts = countFailures(measured.results);
    const errorRate = round(
      (BASELINE_PROFILE.measured_requests - measured.successes)
      / BASELINE_PROFILE.measured_requests
    );

    const restartStartedAt = performance.now();
    const firstStop = await stopSupervisor(runtime.child);
    runtime = null;
    const secondStart = await startSupervisor({ environment, gateway });
    runtime = secondStart;
    const restartDurationMs = elapsedMilliseconds(restartStartedAt);
    const restartProbe = await performIntent({
      gateway,
      token,
      sequence: 0,
      label: 'restart'
    });
    const afterRestart = await fetchOperations(gateway, token);
    const finalStop = await stopSupervisor(runtime.child);
    runtime = null;

    const checks = {
      initial_stack_ready: reportIsReady(initialOperations),
      warmup_succeeded: warmup.successes === BASELINE_PROFILE.warmup_requests,
      measured_profile_succeeded: measured.successes === BASELINE_PROFILE.measured_requests,
      zero_measured_error_rate: errorRate === 0,
      p95_latency_within_candidate_target: (
        latency.p95_ms <= BASELINE_PROFILE.p95_latency_ceiling_ms
      ),
      post_load_stack_ready: reportIsReady(afterLoad),
      no_server_errors_during_profile: capacity.server_error_delta === 0,
      no_internal_errors_during_profile: capacity.internal_error_delta === 0,
      concurrent_load_observed: capacity.gateway_max_in_flight >= 2,
      resident_memory_below_candidate_ceiling: (
        capacity.total_resident_memory_bytes <= CANDIDATE_MEMORY_CEILING_BYTES
      ),
      cpu_saturation_recorded: (
        Number.isFinite(capacity.average_cpu_core_equivalents)
        && capacity.average_cpu_core_equivalents >= 0
      ),
      initial_startup_within_ceiling: (
        firstStart.startup_duration_ms <= BASELINE_PROFILE.startup_ceiling_ms
      ),
      graceful_restart_completed: firstStop.code === 0 && firstStop.signal === null,
      restart_within_ceiling: restartDurationMs <= BASELINE_PROFILE.restart_ceiling_ms,
      post_restart_intent_succeeded: restartProbe.success,
      post_restart_stack_ready: reportIsReady(afterRestart),
      final_shutdown_completed: finalStop.code === 0 && finalStop.signal === null
    };
    const failedChecks = Object.entries(checks)
      .filter(([, passed]) => passed !== true)
      .map(([name]) => name);
    if (failedChecks.length > 0) {
      throw new ValidationError(`SLO baseline checks failed: ${failedChecks.join(', ')}`);
    }

    const packageJson = JSON.parse(
      await readFile(new URL('../package.json', import.meta.url), 'utf8')
    );
    const publicKeyPem = String(identity.publicKey.export({
      type: 'spki',
      format: 'pem'
    }));
    const unsigned = {
      schema: EVIDENCE_FORMAT,
      status: 'passed',
      generated_at: generatedAt,
      source: {
        kernel_version: packageJson.version,
        revision
      },
      execution: {
        disposable_workspace: true,
        host_mode: true,
        node: process.version,
        platform: process.platform,
        architecture: process.arch
      },
      signer: {
        key_id: identity.keyId,
        public_key_pem: publicKeyPem
      },
      profile: {
        ...BASELINE_PROFILE,
        candidate_memory_ceiling_bytes: CANDIDATE_MEMORY_CEILING_BYTES,
        candidate_cpu_ceiling_cores: CANDIDATE_CPU_CEILING_CORES
      },
      results: {
        cold_start_ms: firstStart.startup_duration_ms,
        warmup_successes: warmup.successes,
        measured_successes: measured.successes,
        measured_failures: BASELINE_PROFILE.measured_requests - measured.successes,
        failure_codes: failureCounts,
        error_rate: errorRate,
        load_duration_ms: loadDurationMs,
        throughput_requests_per_second: round(
          BASELINE_PROFILE.measured_requests / (loadDurationMs / 1_000)
        ),
        latency,
        restart: {
          total_ms: restartDurationMs,
          second_start_ms: secondStart.startup_duration_ms,
          first_shutdown_ms: firstStop.duration_ms,
          probe_latency_ms: restartProbe.latency_ms,
          grid_uptime_seconds_after_restart: serviceByName(
            afterRestart,
            'grid'
          ).uptime_seconds
        }
      },
      capacity,
      total_duration_ms: elapsedMilliseconds(overallStartedAt),
      checks,
      limitations: [
        'short-duration disposable-host profile',
        'not a 30-day availability measurement',
        'not dedicated pilot hardware',
        'no external adapters or remote network path',
        'candidate container CPU and memory ceilings are comparison values in host mode'
      ]
    };
    const evidence = {
      ...unsigned,
      attestation: identity.signObject(unsigned)
    };
    verifySloBaselineEvidence(evidence);
    return evidence;
  } finally {
    if (runtime) await stopSupervisor(runtime.child);
  }
}

export function verifySloBaselineEvidence(evidence) {
  if (
    !evidence
    || typeof evidence !== 'object'
    || Array.isArray(evidence)
    || evidence.schema !== EVIDENCE_FORMAT
    || evidence.status !== 'passed'
  ) {
    throw new ValidationError('SLO baseline evidence format or status is invalid');
  }
  if (
    !evidence.checks
    || Object.values(evidence.checks).some(value => value !== true)
  ) {
    throw new ValidationError('SLO baseline evidence contains a failed check');
  }
  if (
    evidence.profile?.measured_requests !== BASELINE_PROFILE.measured_requests
    || evidence.profile?.concurrency !== BASELINE_PROFILE.concurrency
    || evidence.results?.measured_successes !== BASELINE_PROFILE.measured_requests
    || evidence.results?.error_rate !== 0
    || !Number.isFinite(evidence.results?.latency?.p95_ms)
  ) {
    throw new ValidationError('SLO baseline profile or results are invalid');
  }
  if (
    typeof evidence.signer?.public_key_pem !== 'string'
    || evidence.attestation?.key_id !== evidence.signer?.key_id
  ) {
    throw new ValidationError('SLO baseline signer metadata is invalid');
  }
  const unsigned = structuredClone(evidence);
  delete unsigned.attestation;
  let publicKey;
  try {
    publicKey = createPublicKey(evidence.signer.public_key_pem);
  } catch {
    throw new ValidationError('SLO baseline public key is invalid');
  }
  if (!verifyObjectSignature(unsigned, evidence.attestation, publicKey)) {
    throw new ValidationError('SLO baseline attestation is invalid');
  }
  return {
    valid: true,
    schema: evidence.schema,
    source_revision: evidence.source?.revision,
    p95_latency_ms: evidence.results.latency.p95_ms,
    error_rate: evidence.results.error_rate,
    restart_ms: evidence.results.restart.total_ms
  };
}

async function startSupervisor({ environment, gateway }) {
  const startedAt = performance.now();
  const child = spawn(process.execPath, ['src/supervisor.mjs'], {
    cwd: MESH_ROOT,
    stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
    env: environment
  });
  let diagnostics = '';
  const collect = chunk => {
    if (diagnostics.length < 32_768) diagnostics += chunk;
  };
  child.stdout.on('data', collect);
  child.stderr.on('data', collect);
  try {
    await waitForReady(`${gateway}/ready`, child);
  } catch (error) {
    await stopSupervisor(child);
    throw new ValidationError(
      'Production supervisor failed the SLO drill startup check: '
      + `${error.code ?? error.name}; ${startupDiagnosticSummary(diagnostics)}`
    );
  }
  return {
    child,
    startup_duration_ms: elapsedMilliseconds(startedAt)
  };
}

async function stopSupervisor(child) {
  const startedAt = performance.now();
  if (child.exitCode !== null || child.signalCode !== null) {
    return {
      code: child.exitCode,
      signal: child.signalCode,
      duration_ms: elapsedMilliseconds(startedAt)
    };
  }
  const exited = once(child, 'exit');
  if (child.connected) child.send({ type: 'axiom.supervisor.stop' });
  else child.kill('SIGTERM');
  const timer = setTimeout(() => {
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
  }, 10_000);
  timer.unref();
  const [code, signal] = await exited;
  clearTimeout(timer);
  return {
    code,
    signal,
    duration_ms: elapsedMilliseconds(startedAt)
  };
}

async function waitForReady(url, child) {
  const deadline = Date.now() + BASELINE_PROFILE.startup_ceiling_ms;
  while (Date.now() < deadline) {
    if (child.exitCode !== null || child.signalCode !== null) {
      const error = new Error('Supervisor exited before readiness');
      error.code = 'supervisor_exited';
      throw error;
    }
    try {
      const response = await fetch(url, {
        redirect: 'error',
        signal: AbortSignal.timeout(1_000)
      });
      if (response.ok && (await response.json()).status === 'ready') return;
    } catch {
      // Bounded polling retains child exit and the shared deadline as authority.
    }
    await new Promise(resolvePromise => setTimeout(resolvePromise, 100));
  }
  const error = new Error('Supervisor readiness timed out');
  error.code = 'startup_timeout';
  throw error;
}

async function runIntentProfile({
  gateway,
  token,
  requests,
  concurrency,
  label
}) {
  const results = new Array(requests);
  let next = 0;
  async function worker() {
    while (next < requests) {
      const sequence = next;
      next += 1;
      results[sequence] = await performIntent({
        gateway,
        token,
        sequence,
        label
      });
    }
  }
  await Promise.all(
    Array.from(
      { length: Math.min(concurrency, requests) },
      () => worker()
    )
  );
  return {
    results,
    successes: results.filter(result => result.success).length
  };
}

async function performIntent({ gateway, token, sequence, label }) {
  const startedAt = performance.now();
  const expectedMessage = `${label}-${sequence}`;
  try {
    const response = await fetch(`${gateway}/v1/intents`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        accept: 'application/json',
        'content-type': 'application/json',
        'idempotency-key': `slo-${label}-${randomUUID()}`
      },
      body: JSON.stringify({
        action: BASELINE_PROFILE.action,
        input: { message: expectedMessage }
      }),
      signal: AbortSignal.timeout(BASELINE_PROFILE.request_timeout_ms)
    });
    const payload = await response.json();
    return {
      success: (
        response.status === 200
        && payload?.status === 'completed'
        && payload?.message === expectedMessage
      ),
      status: response.status,
      error_code: response.ok ? null : boundedErrorCode(payload?.error?.code),
      latency_ms: elapsedMilliseconds(startedAt)
    };
  } catch (error) {
    return {
      success: false,
      status: 0,
      error_code: error?.name === 'TimeoutError' ? 'request_timeout' : 'request_failed',
      latency_ms: elapsedMilliseconds(startedAt)
    };
  }
}

async function fetchOperations(gateway, token) {
  const response = await fetch(`${gateway}/v1/operations`, {
    headers: {
      authorization: `Bearer ${token}`,
      accept: 'application/json'
    },
    signal: AbortSignal.timeout(BASELINE_PROFILE.request_timeout_ms)
  });
  const report = await response.json();
  if (response.status !== 200 || !reportIsReady(report)) {
    throw new ValidationError('Production operations report was not ready during SLO drill');
  }
  return report;
}

function capacitySummary(before, after, loadDurationMs) {
  const beforeByName = new Map(before.services.map(service => [service.service, service]));
  const services = after.services.map(service => {
    const baseline = beforeByName.get(service.service);
    if (!baseline) throw new ValidationError('SLO operations report service set changed');
    return {
      service: service.service,
      request_delta: service.http.requests_total - baseline.http.requests_total,
      server_error_delta: (
        service.http.responses_total['5xx'] - baseline.http.responses_total['5xx']
      ),
      internal_error_delta: (
        service.reliability.internal_errors_total
        - baseline.reliability.internal_errors_total
      ),
      max_in_flight: service.http.max_in_flight,
      resident_memory_bytes: service.process.resident_memory_bytes,
      heap_used_bytes: service.process.heap_used_bytes,
      cpu_user_microseconds_delta: (
        service.process.cpu_user_microseconds
        - baseline.process.cpu_user_microseconds
      ),
      cpu_system_microseconds_delta: (
        service.process.cpu_system_microseconds
        - baseline.process.cpu_system_microseconds
      )
    };
  }).sort((left, right) => left.service.localeCompare(right.service));
  if (
    services.some(service => (
      service.request_delta < 0
      || service.server_error_delta < 0
      || service.internal_error_delta < 0
      || service.cpu_user_microseconds_delta < 0
      || service.cpu_system_microseconds_delta < 0
    ))
  ) {
    throw new ValidationError('SLO operations counters moved backwards');
  }
  const totalResidentMemory = sum(services, 'resident_memory_bytes');
  const totalCpuMicroseconds = (
    sum(services, 'cpu_user_microseconds_delta')
    + sum(services, 'cpu_system_microseconds_delta')
  );
  const cpuCoreEquivalents = round(
    (totalCpuMicroseconds / 1_000) / loadDurationMs
  );
  return {
    observation: 'post-load snapshot with process-lifetime peak in-flight counters',
    total_resident_memory_bytes: totalResidentMemory,
    memory_ceiling_utilization: round(
      totalResidentMemory / CANDIDATE_MEMORY_CEILING_BYTES
    ),
    total_cpu_microseconds: totalCpuMicroseconds,
    average_cpu_core_equivalents: cpuCoreEquivalents,
    cpu_ceiling_utilization: round(
      cpuCoreEquivalents / CANDIDATE_CPU_CEILING_CORES
    ),
    gateway_max_in_flight: services.find(
      service => service.service === 'gateway'
    )?.max_in_flight ?? 0,
    server_error_delta: sum(services, 'server_error_delta'),
    internal_error_delta: sum(services, 'internal_error_delta'),
    services
  };
}

function latencySummary(values) {
  if (!values.length || values.some(value => !Number.isFinite(value) || value < 0)) {
    throw new ValidationError('SLO latency sample is invalid');
  }
  const sorted = [...values].sort((left, right) => left - right);
  return {
    samples: sorted.length,
    min_ms: round(sorted[0]),
    p50_ms: percentile(sorted, 0.5),
    p95_ms: percentile(sorted, 0.95),
    p99_ms: percentile(sorted, 0.99),
    max_ms: round(sorted.at(-1)),
    mean_ms: round(sorted.reduce((total, value) => total + value, 0) / sorted.length)
  };
}

function percentile(sorted, quantile) {
  return round(sorted[Math.max(0, Math.ceil(sorted.length * quantile) - 1)]);
}

function countFailures(results) {
  const counts = {};
  for (const result of results) {
    if (!result.success) {
      const code = result.error_code ?? `http_${result.status}`;
      counts[code] = (counts[code] ?? 0) + 1;
    }
  }
  return Object.fromEntries(
    Object.entries(counts).sort(([left], [right]) => left.localeCompare(right))
  );
}

function reportIsReady(report) {
  return (
    report?.format === 'axiom-operations.v1'
    && report.status === 'ready'
    && Array.isArray(report.services)
    && report.services.length === 4
    && report.services.every(service => service.readiness?.status === 'ready')
  );
}

function serviceByName(report, name) {
  const service = report.services.find(item => item.service === name);
  if (!service) throw new ValidationError(`SLO operations report is missing ${name}`);
  return service;
}

function productionEnvironment(provisioned, basePort) {
  return {
    ...process.env,
    NODE_ENV: 'production',
    AXIOM_AUTO_BOOTSTRAP: 'false',
    AXIOM_DATA_DIR: provisioned.data_dir,
    AXIOM_DATA_KEY: '',
    AXIOM_DATA_KEY_FILE: provisioned.data_key_file,
    AXIOM_API_TOKENS: '',
    AXIOM_API_TOKENS_FILE: provisioned.api_tokens_file,
    AXIOM_GATEWAY_HOST: '127.0.0.1',
    AXIOM_INTERNAL_HOST: '127.0.0.1',
    AXIOM_GATEWAY_PORT: String(basePort),
    AXIOM_HYPERVISOR_PORT: String(basePort + 1),
    AXIOM_SANDBOX_PORT: String(basePort + 2),
    AXIOM_GRID_PORT: String(basePort + 3),
    AXIOM_HYPERVISOR_URL: `http://127.0.0.1:${basePort + 1}`,
    AXIOM_SANDBOX_URL: `http://127.0.0.1:${basePort + 2}`,
    AXIOM_GRID_URL: `http://127.0.0.1:${basePort + 3}`,
    AXIOM_POLICY_PATH: join(MESH_ROOT, 'config', 'policy.json'),
    AXIOM_POLICY_PATHS: '',
    AXIOM_CAPABILITIES_PATH: join(MESH_ROOT, 'config', 'capabilities.json'),
    AXIOM_RATE_LIMIT_CAPACITY: String(BASELINE_PROFILE.rate_limit_capacity),
    AXIOM_RATE_LIMIT_REFILL_PER_SECOND: String(
      BASELINE_PROFILE.rate_limit_refill_per_second
    ),
    AXIOM_LOG_REQUESTS: 'false'
  };
}

async function prepareDisposableWorkspace(value) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new ValidationError('SLO drill requires an explicit disposable workspace');
  }
  const workspace = resolve(value);
  await mkdir(workspace, { recursive: true, mode: 0o700 });
  if ((await readdir(workspace)).length !== 0) {
    throw new ValidationError('SLO drill workspace must be empty');
  }
  return workspace;
}

async function findPortBlock() {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const base = 20_000 + Math.floor(Math.random() * 20_000);
    const servers = [];
    try {
      for (let port = base; port < base + 4; port += 1) {
        const server = net.createServer();
        await new Promise((resolvePromise, reject) => {
          server.once('error', reject);
          server.listen(port, '127.0.0.1', resolvePromise);
        });
        servers.push(server);
      }
      await Promise.all(
        servers.map(server => new Promise(resolvePromise => server.close(resolvePromise)))
      );
      return base;
    } catch {
      await Promise.all(
        servers.map(server => new Promise(resolvePromise => server.close(resolvePromise)))
      );
    }
  }
  throw new ValidationError('Unable to reserve a local port block for SLO drill');
}

function boundedErrorCode(value) {
  return (
    typeof value === 'string'
    && /^[a-z][a-z0-9_]{0,63}$/.test(value)
  ) ? value : 'request_rejected';
}

function startupDiagnosticSummary(value) {
  const summaries = [];
  for (const line of value.split(/\r?\n/).filter(Boolean).slice(-20)) {
    try {
      const parsed = JSON.parse(line);
      summaries.push([
        parsed.service,
        parsed.event,
        parsed.error?.code,
        parsed.status
      ].filter(Boolean).join(':'));
    } catch {
      for (const code of [
        'EADDRINUSE',
        'grid_already_running',
        'SQLITE_BUSY',
        'authentication failed'
      ]) {
        if (line.includes(code)) summaries.push(code);
      }
    }
  }
  return summaries.filter(Boolean).slice(-6).join(',') || 'no-structured-diagnostic';
}

function normalizeRevision(value) {
  if (value === null || value === undefined || value === '') return null;
  if (!REVISION.test(value)) {
    throw new ValidationError('SLO baseline source revision must be a 40-character SHA');
  }
  return value;
}

function sum(items, field) {
  return items.reduce((total, item) => total + item[field], 0);
}

function elapsedMilliseconds(startedAt) {
  return Number((performance.now() - startedAt).toFixed(3));
}

function round(value) {
  return Math.round(value * 1_000) / 1_000;
}

export { BASELINE_PROFILE, EVIDENCE_FORMAT };

if (
  process.argv[1]
  && import.meta.url === pathToFileURL(process.argv[1]).href
) {
  if (process.argv.length !== 3) {
    throw new ValidationError(
      'Usage: node src/slo-drill.mjs <empty-disposable-workspace>'
    );
  }
  const evidence = await runSloBaseline({ workspaceDir: process.argv[2] });
  process.stdout.write(`${JSON.stringify(evidence, null, 2)}\n`);
}
