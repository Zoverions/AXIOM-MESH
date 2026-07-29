import { createPublicKey, randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { mkdir, readdir, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { setTimeout as delay } from 'node:timers/promises';
import { pathToFileURL } from 'node:url';
import {
  canonicalJson,
  digestObject,
  ValidationError
} from './lib/canonical.mjs';
import {
  ensureMeshIdentity,
  verifyObjectSignature
} from './lib/identity.mjs';
import {
  reserveProductionPortBlock,
  operationsReportIsReady,
  productionHostEnvironment,
  startProductionHost,
  stopProductionHost
} from './lib/production-host.mjs';
import { MESH_ROOT } from './lib/config.mjs';
import { provisionProduction } from './provision-production.mjs';

const EVIDENCE_SCHEMA = 'axiom-resilience-drill-evidence.v1';
const POLICY_SCHEMA = 'axiom-resilience-drill-policy.v1';
const REVISION = /^[a-f0-9]{40}$/;
const SERVICE_NAMES = Object.freeze(['gateway', 'grid', 'hypervisor', 'sandbox']);
const REQUIRED_POLICY = Object.freeze({
  schema: POLICY_SCHEMA,
  version: 1,
  request_pressure: {
    max_body_bytes: 4_096,
    oversized_body_bytes: 8_192,
    rate_limit_capacity: 10,
    rate_limit_refill_per_second: 1,
    burst_requests: 24,
    recovery_wait_ms: 1_200,
    request_timeout_ms: 8_000
  },
  dependency_loss: {
    service: 'sandbox',
    suspend_signal: 'SIGSTOP',
    terminate_signal: 'SIGKILL',
    degraded_response_timeout_ms: 8_000,
    supervisor_shutdown_ceiling_ms: 10_000,
    restart_ceiling_ms: 20_000
  }
});

export async function loadResilienceDrillPolicy(
  path = join(MESH_ROOT, 'config', 'resilience-drill.json')
) {
  return validateResilienceDrillPolicy(
    JSON.parse(await readFile(path, 'utf8'))
  ).policy;
}

export function validateResilienceDrillPolicy(policy) {
  if (canonicalJson(policy) !== canonicalJson(REQUIRED_POLICY)) {
    throw new ValidationError('Resilience drill policy is invalid or weakened');
  }
  return {
    valid: true,
    schema: POLICY_SCHEMA,
    policy: structuredClone(policy),
    digest: digestObject(policy),
    burst_requests: policy.request_pressure.burst_requests,
    dependency: policy.dependency_loss.service
  };
}

export async function runResilienceDrill({
  workspaceDir,
  sourceRevision = process.env.GITHUB_SHA || null,
  generatedAt = new Date().toISOString(),
  policy
} = {}) {
  if (process.platform === 'win32') {
    throw new ValidationError(
      'Resilience drill requires Linux process suspension and termination signals'
    );
  }
  const activePolicy = policy ?? await loadResilienceDrillPolicy();
  const policyVerification = validateResilienceDrillPolicy(activePolicy);
  const revision = normalizeRevision(sourceRevision);
  const generated = normalizeTimestamp(generatedAt);
  const workspace = await prepareDisposableWorkspace(workspaceDir);
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
  const token = (
    await readFile(provisioned.operator_token_file, 'utf8')
  ).trim();
  const portLease = await reserveProductionPortBlock('resilience drill');
  const basePort = portLease.base_port;
  const gateway = `http://127.0.0.1:${basePort}`;
  const environment = productionHostEnvironment(provisioned, basePort, {
    maxBodyBytes: activePolicy.request_pressure.max_body_bytes,
    rateLimitCapacity: activePolicy.request_pressure.rate_limit_capacity,
    rateLimitRefillPerSecond: (
      activePolicy.request_pressure.rate_limit_refill_per_second
    )
  });
  let runtime;
  let suspendedPid = null;

  try {
    const firstStart = await startProductionHost({
      environment,
      gateway,
      startupTimeoutMs: activePolicy.dependency_loss.restart_ceiling_ms,
      drill: 'resilience drill'
    });
    runtime = firstStart;
    const initialOperations = await requestJson(
      `${gateway}/v1/operations`,
      {
        headers: authenticatedHeaders(token)
      },
      activePolicy.request_pressure.request_timeout_ms
    );

    const idempotencyKey = `resilience-oversize-${randomUUID()}`;
    const oversizedBody = JSON.stringify({
      action: 'system.echo',
      input: {
        message: 'must-not-execute',
        padding: 'x'.repeat(activePolicy.request_pressure.oversized_body_bytes)
      }
    });
    const oversized = await requestJson(
      `${gateway}/v1/intents`,
      {
        method: 'POST',
        headers: {
          ...authenticatedHeaders(token),
          'content-type': 'application/json',
          'idempotency-key': idempotencyKey
        },
        body: oversizedBody
      },
      activePolicy.request_pressure.request_timeout_ms
    );
    const acceptedAfterOversize = await submitEcho({
      gateway,
      token,
      idempotencyKey,
      message: 'accepted-after-oversize',
      timeoutMs: activePolicy.request_pressure.request_timeout_ms
    });

    const burst = await Promise.all(
      Array.from(
        { length: activePolicy.request_pressure.burst_requests },
        (_, index) => requestJson(
          `${gateway}/v1/operations`,
          {
            headers: {
              ...authenticatedHeaders(token),
              'x-trace-id': `trace_resilience_burst_${String(index).padStart(2, '0')}`
            }
          },
          activePolicy.request_pressure.request_timeout_ms
        )
      )
    );
    const burstSummary = statusSummary(burst);
    const recoveryStartedAt = performance.now();
    await delay(activePolicy.request_pressure.recovery_wait_ms);
    const recoveredOperations = await requestJson(
      `${gateway}/v1/operations`,
      {
        headers: authenticatedHeaders(token)
      },
      activePolicy.request_pressure.request_timeout_ms
    );
    const rateRecoveryMs = elapsedMilliseconds(recoveryStartedAt);
    const gatewaySnapshot = serviceByName(
      recoveredOperations.payload,
      'gateway'
    );

    const sandbox = firstStart.processes.find(
      item => item.service === activePolicy.dependency_loss.service
    );
    if (!sandbox) {
      throw new ValidationError('Supervisor process inventory is missing the fault target');
    }
    process.kill(sandbox.pid, activePolicy.dependency_loss.suspend_signal);
    suspendedPid = sandbox.pid;
    // The request-pressure phase deliberately empties the authenticated
    // buckets. Let the fixed profile refill before observing dependency state.
    await delay(activePolicy.request_pressure.recovery_wait_ms);
    const degradedOperations = await requestJson(
      `${gateway}/v1/operations`,
      {
        headers: authenticatedHeaders(token)
      },
      activePolicy.dependency_loss.degraded_response_timeout_ms
    );
    const degradedReadiness = await requestJson(
      `${gateway}/ready`,
      {},
      activePolicy.dependency_loss.degraded_response_timeout_ms
    );
    const degradedServices = Array.isArray(degradedOperations.payload?.services)
      ? degradedOperations.payload.services.map(item => item.service).sort()
      : [];
    const degradedAlerts = Array.isArray(degradedOperations.payload?.alerts)
      ? degradedOperations.payload.alerts.map(item => item.id).sort()
      : [];

    const supervisorExit = waitForSupervisorExit(
      runtime.child,
      activePolicy.dependency_loss.supervisor_shutdown_ceiling_ms
    );
    process.kill(sandbox.pid, activePolicy.dependency_loss.terminate_signal);
    suspendedPid = null;
    const faultShutdown = await supervisorExit;
    runtime = null;
    const gatewayAfterExit = await requestJson(
      `${gateway}/health`,
      {},
      1_000
    );

    const secondStart = await startProductionHost({
      environment,
      gateway,
      startupTimeoutMs: activePolicy.dependency_loss.restart_ceiling_ms,
      drill: 'resilience recovery drill'
    });
    runtime = secondStart;
    const persistedIntent = await requestJson(
      `${gateway}/v1/intents/${encodeURIComponent(acceptedAfterOversize.payload?.intent_id)}`,
      {
        headers: authenticatedHeaders(token)
      },
      activePolicy.request_pressure.request_timeout_ms
    );
    const postRestartIntent = await submitEcho({
      gateway,
      token,
      idempotencyKey: `resilience-restart-${randomUUID()}`,
      message: 'accepted-after-dependency-loss',
      timeoutMs: activePolicy.request_pressure.request_timeout_ms
    });
    const restartedOperations = await requestJson(
      `${gateway}/v1/operations`,
      {
        headers: authenticatedHeaders(token)
      },
      activePolicy.request_pressure.request_timeout_ms
    );
    const finalStop = await stopProductionHost(runtime.child);
    runtime = null;

    const requiredDegradedAlerts = [
      'service-not-ready:gateway',
      'service-not-ready:hypervisor',
      'upstream-unavailable:gateway',
      'upstream-unavailable:hypervisor'
    ];
    const checks = {
      supervisor_process_inventory_exact: (
        canonicalJson(firstStart.processes.map(item => item.service).sort())
        === canonicalJson(SERVICE_NAMES)
      ),
      initial_stack_ready: (
        initialOperations.status === 200
        && operationsReportIsReady(initialOperations.payload)
      ),
      oversized_body_rejected: (
        oversized.status === 413
        && oversized.payload?.error?.code === 'body_too_large'
        && Buffer.byteLength(oversizedBody) > activePolicy.request_pressure.max_body_bytes
      ),
      oversized_body_had_no_effect: (
        acceptedAfterOversize.status === 200
        && acceptedAfterOversize.payload?.status === 'completed'
        && acceptedAfterOversize.payload?.message === 'accepted-after-oversize'
      ),
      bounded_rate_limit_enforced: (
        burstSummary.accepted > 0
        && burstSummary.rate_limited > 0
        && burstSummary.unexpected === 0
        && burstSummary.total === activePolicy.request_pressure.burst_requests
      ),
      rate_limit_rejections_observable: (
        Number.isSafeInteger(
          gatewaySnapshot?.security?.rate_limit_rejections_total
        )
        && gatewaySnapshot.security.rate_limit_rejections_total
          >= burstSummary.rate_limited
      ),
      rate_limit_recovered: (
        recoveredOperations.status === 200
        && operationsReportIsReady(recoveredOperations.payload)
        && rateRecoveryMs <= (
          activePolicy.request_pressure.recovery_wait_ms
          + activePolicy.request_pressure.request_timeout_ms
        )
      ),
      suspended_dependency_reported_not_ready: (
        degradedOperations.status === 200
        && degradedOperations.payload?.status === 'not_ready'
        && canonicalJson(degradedServices) === canonicalJson([
          'gateway',
          'grid',
          'hypervisor'
        ])
      ),
      dependency_alerts_were_bounded: requiredDegradedAlerts.every(
        id => degradedAlerts.includes(id)
      ),
      public_readiness_failed_closed: degradedReadiness.status === 503,
      child_loss_stopped_partial_runtime: (
        faultShutdown.code === 1
        && faultShutdown.signal === null
        && faultShutdown.duration_ms
          <= activePolicy.dependency_loss.supervisor_shutdown_ceiling_ms
      ),
      gateway_unavailable_after_supervisor_exit: gatewayAfterExit.status === 0,
      full_stack_restarted_within_ceiling: (
        secondStart.startup_duration_ms
        <= activePolicy.dependency_loss.restart_ceiling_ms
      ),
      pre_fault_state_persisted: (
        persistedIntent.status === 200
        && persistedIntent.payload?.intent_id
          === acceptedAfterOversize.payload?.intent_id
        && persistedIntent.payload?.status === 'completed'
      ),
      post_restart_intent_succeeded: (
        postRestartIntent.status === 200
        && postRestartIntent.payload?.status === 'completed'
        && postRestartIntent.payload?.message
          === 'accepted-after-dependency-loss'
      ),
      post_restart_stack_ready: (
        restartedOperations.status === 200
        && operationsReportIsReady(restartedOperations.payload)
      ),
      final_shutdown_clean: finalStop.code === 0 && finalStop.signal === null
    };
    const failed = Object.entries(checks)
      .filter(([, passed]) => passed !== true)
      .map(([name]) => name);
    if (failed.length) {
      throw new ValidationError(
        `Resilience drill checks failed: ${failed.join(', ')}`
      );
    }

    const packageJson = JSON.parse(
      await readFile(new URL('../package.json', import.meta.url), 'utf8')
    );
    const publicKeyPem = String(identity.publicKey.export({
      type: 'spki',
      format: 'pem'
    }));
    const unsigned = {
      schema: EVIDENCE_SCHEMA,
      status: 'passed',
      generated_at: generated,
      source: {
        kernel_version: packageJson.version,
        revision
      },
      policy: {
        schema: activePolicy.schema,
        digest: policyVerification.digest
      },
      execution: {
        disposable_workspace: true,
        host_mode: true,
        process_fault_injection: true,
        node: process.version,
        platform: process.platform,
        architecture: process.arch,
        total_duration_ms: elapsedMilliseconds(overallStartedAt)
      },
      signer: {
        service: 'grid',
        key_id: identity.keyId,
        public_key_pem: publicKeyPem
      },
      profile: structuredClone(activePolicy),
      request_pressure: {
        oversized_body_bytes: Buffer.byteLength(oversizedBody),
        oversized_status: oversized.status,
        oversized_error_code: oversized.payload?.error?.code,
        accepted_after_oversize_status: acceptedAfterOversize.status,
        burst: burstSummary,
        rate_limit_rejections_observed: (
          gatewaySnapshot.security.rate_limit_rejections_total
        ),
        recovery_status: recoveredOperations.status,
        recovery_ms: rateRecoveryMs
      },
      dependency_loss: {
        service: activePolicy.dependency_loss.service,
        degraded_operations_status: degradedOperations.status,
        degraded_report_status: degradedOperations.payload.status,
        degraded_services: degradedServices,
        alert_ids: degradedAlerts,
        readiness_status: degradedReadiness.status,
        supervisor_exit_code: faultShutdown.code,
        supervisor_exit_signal: faultShutdown.signal,
        supervisor_shutdown_ms: faultShutdown.duration_ms,
        gateway_after_exit_status: gatewayAfterExit.status
      },
      recovery: {
        restart_ms: secondStart.startup_duration_ms,
        persisted_intent_status: persistedIntent.status,
        post_restart_intent_status: postRestartIntent.status,
        operations_status: restartedOperations.status,
        clean_shutdown: true
      },
      checks,
      limitations: [
        'disposable single-host process fault, not a live pilot outage',
        'request-body and token-bucket pressure, not a cgroup OOM or CPU-throttling claim',
        'host-mode signal injection does not prove an orchestrator restart policy',
        'pilot hardware, sustained load, and external adapters are not exercised'
      ]
    };
    const evidence = {
      ...unsigned,
      attestation: identity.signObject(unsigned)
    };
    verifyResilienceDrillEvidence(evidence);
    await assertEvidenceContainsNoSecrets(evidence, provisioned, token);
    return evidence;
  } finally {
    if (suspendedPid !== null) {
      try {
        process.kill(suspendedPid, activePolicy.dependency_loss.terminate_signal);
      } catch {
        // The target may already have exited; supervisor cleanup remains authoritative.
      }
    }
    if (runtime) await stopProductionHost(runtime.child);
    await portLease.release();
  }
}

export function verifyResilienceDrillEvidence(evidence) {
  const expectedDigest = digestObject(REQUIRED_POLICY);
  if (
    !evidence
    || typeof evidence !== 'object'
    || Array.isArray(evidence)
    || evidence.schema !== EVIDENCE_SCHEMA
    || evidence.status !== 'passed'
    || evidence.policy?.schema !== POLICY_SCHEMA
    || evidence.policy?.digest !== expectedDigest
    || canonicalJson(evidence.profile) !== canonicalJson(REQUIRED_POLICY)
    || (
      evidence.source?.revision !== null
      && !REVISION.test(evidence.source?.revision ?? '')
    )
    || !evidence.checks
    || Object.values(evidence.checks).some(value => value !== true)
  ) {
    throw new ValidationError('Resilience drill evidence metadata or checks are invalid');
  }
  if (
    evidence.request_pressure?.oversized_status !== 413
    || evidence.request_pressure?.oversized_error_code !== 'body_too_large'
    || evidence.request_pressure?.accepted_after_oversize_status !== 200
    || evidence.request_pressure?.burst?.total
      !== REQUIRED_POLICY.request_pressure.burst_requests
    || evidence.request_pressure.burst.accepted < 1
    || evidence.request_pressure.burst.rate_limited < 1
    || evidence.request_pressure.burst.unexpected !== 0
    || evidence.request_pressure?.recovery_status !== 200
  ) {
    throw new ValidationError('Resilience request-pressure evidence is invalid');
  }
  if (
    evidence.dependency_loss?.service
      !== REQUIRED_POLICY.dependency_loss.service
    || evidence.dependency_loss?.degraded_operations_status !== 200
    || evidence.dependency_loss?.degraded_report_status !== 'not_ready'
    || evidence.dependency_loss?.readiness_status !== 503
    || evidence.dependency_loss?.supervisor_exit_code !== 1
    || evidence.dependency_loss?.supervisor_exit_signal !== null
    || evidence.dependency_loss?.gateway_after_exit_status !== 0
    || canonicalJson(evidence.dependency_loss?.degraded_services) !== canonicalJson([
      'gateway',
      'grid',
      'hypervisor'
    ])
  ) {
    throw new ValidationError('Resilience dependency-loss evidence is invalid');
  }
  if (
    evidence.recovery?.persisted_intent_status !== 200
    || evidence.recovery?.post_restart_intent_status !== 200
    || evidence.recovery?.operations_status !== 200
    || evidence.recovery?.clean_shutdown !== true
  ) {
    throw new ValidationError('Resilience recovery evidence is invalid');
  }
  if (
    evidence.signer?.service !== 'grid'
    || typeof evidence.signer?.public_key_pem !== 'string'
    || evidence.attestation?.key_id !== evidence.signer?.key_id
  ) {
    throw new ValidationError('Resilience evidence signer metadata is invalid');
  }
  let publicKey;
  try {
    publicKey = createPublicKey(evidence.signer.public_key_pem);
  } catch {
    throw new ValidationError('Resilience evidence public key is invalid');
  }
  if (publicKey.asymmetricKeyType !== 'ed25519') {
    throw new ValidationError('Resilience evidence signer is not Ed25519');
  }
  const unsigned = structuredClone(evidence);
  delete unsigned.attestation;
  if (!verifyObjectSignature(unsigned, evidence.attestation, publicKey)) {
    throw new ValidationError('Resilience evidence attestation is invalid');
  }
  return {
    valid: true,
    schema: evidence.schema,
    source_revision: evidence.source.revision,
    policy_digest: expectedDigest,
    rate_limited_requests: evidence.request_pressure.burst.rate_limited,
    supervisor_shutdown_ms: evidence.dependency_loss.supervisor_shutdown_ms
  };
}

async function submitEcho({
  gateway,
  token,
  idempotencyKey,
  message,
  timeoutMs
}) {
  return requestJson(
    `${gateway}/v1/intents`,
    {
      method: 'POST',
      headers: {
        ...authenticatedHeaders(token),
        'content-type': 'application/json',
        'idempotency-key': idempotencyKey
      },
      body: JSON.stringify({
        action: 'system.echo',
        input: { message }
      })
    },
    timeoutMs
  );
}

async function requestJson(url, options, timeoutMs) {
  const startedAt = performance.now();
  try {
    const response = await fetch(url, {
      redirect: 'error',
      ...options,
      signal: AbortSignal.timeout(timeoutMs)
    });
    const body = await response.text();
    if (Buffer.byteLength(body) > 262_144) {
      throw new ValidationError('Resilience drill response exceeds the byte limit');
    }
    let payload = null;
    if (body) {
      try {
        payload = JSON.parse(body);
      } catch {
        throw new ValidationError('Resilience drill response is invalid JSON');
      }
    }
    return {
      status: response.status,
      payload,
      duration_ms: elapsedMilliseconds(startedAt)
    };
  } catch (error) {
    if (error instanceof ValidationError) throw error;
    return {
      status: 0,
      payload: null,
      duration_ms: elapsedMilliseconds(startedAt),
      error_code: error?.name === 'TimeoutError'
        ? 'request_timeout'
        : 'request_failed'
    };
  }
}

function authenticatedHeaders(token) {
  return {
    authorization: `Bearer ${token}`,
    accept: 'application/json'
  };
}

function statusSummary(results) {
  const statuses = {};
  for (const result of results) {
    const key = String(result.status);
    statuses[key] = (statuses[key] ?? 0) + 1;
  }
  return {
    total: results.length,
    accepted: statuses['200'] ?? 0,
    rate_limited: statuses['429'] ?? 0,
    unexpected: results.length
      - (statuses['200'] ?? 0)
      - (statuses['429'] ?? 0),
    statuses: Object.fromEntries(
      Object.entries(statuses).sort(([left], [right]) => left.localeCompare(right))
    )
  };
}

function serviceByName(report, name) {
  const service = report?.services?.find(item => item.service === name);
  if (!service) {
    throw new ValidationError(`Resilience operations report is missing ${name}`);
  }
  return service;
}

async function waitForSupervisorExit(child, timeoutMs) {
  const startedAt = performance.now();
  if (child.exitCode !== null || child.signalCode !== null) {
    return {
      code: child.exitCode,
      signal: child.signalCode,
      duration_ms: elapsedMilliseconds(startedAt)
    };
  }
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(
      new ValidationError('Supervisor did not stop after dependency loss')
    ), timeoutMs);
  });
  try {
    const [code, signal] = await Promise.race([
      once(child, 'exit'),
      timeout
    ]);
    return {
      code,
      signal,
      duration_ms: elapsedMilliseconds(startedAt)
    };
  } finally {
    clearTimeout(timer);
  }
}

async function assertEvidenceContainsNoSecrets(evidence, provisioned, token) {
  const serialized = canonicalJson(evidence);
  const secrets = [
    token,
    (await readFile(provisioned.data_key_file, 'utf8')).trim(),
    await readFile(
      join(provisioned.data_dir, 'identities', 'grid', 'private.pem'),
      'utf8'
    )
  ];
  if (
    secrets.some(secret => serialized.includes(secret))
    || /PRIVATE KEY|authorization:\s*bearer|operator\.token/i.test(serialized)
  ) {
    throw new ValidationError('Resilience drill evidence contains secret material');
  }
}

async function prepareDisposableWorkspace(value) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new ValidationError(
      'Resilience drill requires an explicit disposable workspace'
    );
  }
  const workspace = resolve(value);
  await mkdir(workspace, { recursive: true, mode: 0o700 });
  if ((await readdir(workspace)).length !== 0) {
    throw new ValidationError('Resilience drill workspace must be empty');
  }
  return workspace;
}

function normalizeRevision(value) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value !== 'string' || !REVISION.test(value)) {
    throw new ValidationError(
      'Resilience drill revision must be a 40-character SHA'
    );
  }
  return value;
}

function normalizeTimestamp(value) {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) {
    throw new ValidationError('Resilience drill timestamp is invalid');
  }
  return new Date(timestamp).toISOString();
}

function elapsedMilliseconds(startedAt) {
  return Number((performance.now() - startedAt).toFixed(3));
}

if (
  process.argv[1]
  && import.meta.url === pathToFileURL(process.argv[1]).href
) {
  if (process.argv.length !== 3) {
    throw new ValidationError(
      'Usage: node src/resilience-drill.mjs <empty-disposable-workspace>'
    );
  }
  const evidence = await runResilienceDrill({
    workspaceDir: process.argv[2]
  });
  process.stdout.write(`${JSON.stringify(evidence, null, 2)}\n`);
}

export {
  EVIDENCE_SCHEMA,
  POLICY_SCHEMA,
  REQUIRED_POLICY
};
