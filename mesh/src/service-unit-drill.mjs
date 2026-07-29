import { createPublicKey, randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdir, readFile, readdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { pathToFileURL } from 'node:url';
import {
  canonicalJson,
  ValidationError
} from './lib/canonical.mjs';
import { MESH_ROOT } from './lib/config.mjs';
import { ensureMeshIdentity, verifyObjectSignature } from './lib/identity.mjs';
import {
  findProductionPortBlock,
  operationsReportIsReady
} from './lib/production-host.mjs';
import {
  DEPLOYABLE_SERVICES,
  provisionServiceUnits
} from './lib/service-units.mjs';
import { provisionProduction } from './provision-production.mjs';

const EVIDENCE_SCHEMA = 'axiom-service-unit-drill-evidence.v1';
const REVISION = /^[a-f0-9]{40}$/;
const MODULES = Object.freeze({
  grid: 'src/grid/server.mjs',
  sandbox: 'src/sandbox/server.mjs',
  hypervisor: 'src/hypervisor/server.mjs',
  gateway: 'src/gateway/server.mjs'
});

export async function runServiceUnitDrill({
  workspaceDir,
  sourceRevision = process.env.GITHUB_SHA || null,
  generatedAt = new Date().toISOString()
} = {}) {
  const workspace = await prepareDisposableWorkspace(workspaceDir);
  const revision = normalizeRevision(sourceRevision);
  const generated = normalizeTimestamp(generatedAt);
  const startedAt = performance.now();
  const provisioned = await provisionProduction({
    dataDir: join(workspace, 'source-data'),
    secretDir: join(workspace, 'secrets')
  });
  const projection = await provisionServiceUnits({
    sourceDataDir: provisioned.data_dir,
    sourceTransportDir: provisioned.transport.transport_dir,
    unitsDir: join(workspace, 'units')
  });
  const token = (await readFile(
    provisioned.operator_token_file,
    'utf8'
  )).trim();
  const gridIdentity = await ensureMeshIdentity(
    projection.services.grid.data_dir,
    'grid',
    { create: false }
  );
  const basePort = await findProductionPortBlock('service-unit drill');
  const gateway = `http://127.0.0.1:${basePort}`;
  const children = new Map();
  let restartedSandbox;
  try {
    for (const service of ['grid', 'sandbox', 'hypervisor', 'gateway']) {
      const child = startUnit(service, {
        projection,
        provisioned,
        basePort
      });
      children.set(service, child);
      await waitForListening(child, service);
    }
    const initialOperations = await waitForOperations({
      gateway,
      token,
      expected: 'ready',
      children
    });
    const preFaultIntent = await submitEcho({
      gateway,
      token,
      message: 'state-before-sandbox-loss'
    });
    const survivorIdentity = Object.fromEntries(
      ['gateway', 'grid', 'hypervisor'].map(service => [
        service,
        children.get(service)
      ])
    );

    const failedSandbox = children.get('sandbox');
    const sandboxExit = once(failedSandbox, 'exit');
    failedSandbox.kill('SIGKILL');
    const [sandboxExitCode, sandboxSignal] = await sandboxExit;
    const degradedOperations = await waitForOperations({
      gateway,
      token,
      expected: 'degraded',
      children,
      survivors: survivorIdentity
    });
    const degradedReady = await fetch(`${gateway}/ready`, {
      redirect: 'error',
      signal: AbortSignal.timeout(8_000)
    });
    await degradedReady.arrayBuffer();

    restartedSandbox = startUnit('sandbox', {
      projection,
      provisioned,
      basePort
    });
    children.set('sandbox', restartedSandbox);
    await waitForListening(restartedSandbox, 'sandbox');
    const recoveredOperations = await waitForOperations({
      gateway,
      token,
      expected: 'ready',
      children,
      survivors: survivorIdentity
    });
    const persistedIntent = await requestJson(
      `${gateway}/v1/intents/${encodeURIComponent(
        preFaultIntent.payload.intent_id
      )}`,
      token
    );
    const postRecoveryIntent = await submitEcho({
      gateway,
      token,
      message: 'state-after-sandbox-recovery'
    });

    const checks = {
      exact_four_unit_projection: (
        canonicalJson(Object.keys(projection.services).sort())
        === canonicalJson([...DEPLOYABLE_SERVICES])
      ),
      per_unit_application_private_keys: (
        projection.source.application_identities
        && Object.keys(projection.source.application_identities).length === 4
      ),
      per_unit_transport_private_keys: (
        projection.source.transport_fingerprints
        && Object.keys(projection.source.transport_fingerprints).length === 4
      ),
      initial_stack_ready: operationsReportIsReady(initialOperations.payload),
      pre_fault_intent_succeeded: (
        preFaultIntent.status === 200
        && preFaultIntent.payload?.status === 'completed'
      ),
      only_sandbox_exited: (
        sandboxExitCode !== 0
        || sandboxSignal !== null
      ),
      survivors_remained_running: survivorsUnchanged(survivorIdentity),
      dependency_readiness_degraded: (
        degradedOperations.status === 200
        && degradedOperations.payload?.status !== 'ready'
        && degradedReady.status === 503
      ),
      sandbox_only_restart_recovered: (
        restartedSandbox !== failedSandbox
        && operationsReportIsReady(recoveredOperations.payload)
      ),
      survivor_processes_unchanged_after_recovery: (
        survivorsUnchanged(survivorIdentity)
      ),
      pre_fault_grid_state_preserved: (
        persistedIntent.status === 200
        && persistedIntent.payload?.intent_id === preFaultIntent.payload.intent_id
        && persistedIntent.payload?.status === 'completed'
      ),
      post_recovery_intent_succeeded: (
        postRecoveryIntent.status === 200
        && postRecoveryIntent.payload?.status === 'completed'
      )
    };
    const failed = Object.entries(checks)
      .filter(([, passed]) => passed !== true)
      .map(([name]) => name);
    if (failed.length) {
      throw new ValidationError(
        `Service-unit drill checks failed: ${failed.join(', ')}`
      );
    }
    const packageJson = JSON.parse(
      await readFile(new URL('../package.json', import.meta.url), 'utf8')
    );
    const unsigned = {
      schema: EVIDENCE_SCHEMA,
      status: 'passed',
      generated_at: generated,
      source: {
        kernel_version: packageJson.version,
        revision
      },
      topology: {
        unit_count: 4,
        unit_names: [...DEPLOYABLE_SERVICES],
        process_supervisor: false,
        grid_only_durable_state: true,
        private_application_identity_per_unit: true,
        private_transport_leaf_per_unit: true
      },
      execution: {
        disposable_workspace: true,
        independent_os_processes: true,
        injected_failure: 'sandbox process termination',
        recovery_action: 'sandbox-only process restart',
        total_duration_ms: elapsedMilliseconds(startedAt),
        node: process.version,
        platform: process.platform,
        architecture: process.arch
      },
      signer: {
        service: 'grid',
        key_id: gridIdentity.keyId,
        public_key_pem: String(gridIdentity.publicKey.export({
          type: 'spki',
          format: 'pem'
        }))
      },
      observations: {
        initial_status: initialOperations.payload.status,
        dependency_loss_status: degradedOperations.payload.status,
        dependency_loss_ready_http_status: degradedReady.status,
        recovered_status: recoveredOperations.payload.status,
        persisted_intent_status: persistedIntent.status,
        post_recovery_intent_status: postRecoveryIntent.status
      },
      checks,
      limitations: [
        'host drill proves independent process failure isolation, not a live multi-host deployment',
        'container network and mount isolation are separately exercised by protected CI',
        'orchestrator rolling upgrades and pilot-owned secret custody remain external gates'
      ]
    };
    const evidence = {
      ...unsigned,
      attestation: gridIdentity.signObject(unsigned)
    };
    verifyServiceUnitDrillEvidence(evidence);
    await assertNoSecrets(evidence, provisioned, token);
    return evidence;
  } finally {
    await Promise.all([...children.values()].map(stopUnit));
  }
}

export function verifyServiceUnitDrillEvidence(evidence) {
  if (
    !evidence
    || typeof evidence !== 'object'
    || Array.isArray(evidence)
    || evidence.schema !== EVIDENCE_SCHEMA
    || evidence.status !== 'passed'
    || evidence.topology?.unit_count !== 4
    || canonicalJson(evidence.topology?.unit_names)
      !== canonicalJson([...DEPLOYABLE_SERVICES])
    || evidence.topology?.process_supervisor !== false
    || evidence.execution?.independent_os_processes !== true
    || evidence.execution?.recovery_action !== 'sandbox-only process restart'
    || (
      evidence.source?.revision !== null
      && !REVISION.test(evidence.source?.revision ?? '')
    )
    || !evidence.checks
    || Object.values(evidence.checks).some(value => value !== true)
    || evidence.observations?.initial_status !== 'ready'
    || evidence.observations?.dependency_loss_status === 'ready'
    || evidence.observations?.dependency_loss_ready_http_status !== 503
    || evidence.observations?.recovered_status !== 'ready'
    || evidence.observations?.persisted_intent_status !== 200
    || evidence.observations?.post_recovery_intent_status !== 200
  ) {
    throw new ValidationError(
      'Service-unit drill evidence metadata or checks are invalid'
    );
  }
  if (
    evidence.signer?.service !== 'grid'
    || typeof evidence.signer?.public_key_pem !== 'string'
    || evidence.attestation?.key_id !== evidence.signer?.key_id
  ) {
    throw new ValidationError('Service-unit drill signer metadata is invalid');
  }
  let publicKey;
  try {
    publicKey = createPublicKey(evidence.signer.public_key_pem);
  } catch {
    throw new ValidationError('Service-unit drill signer public key is invalid');
  }
  if (publicKey.asymmetricKeyType !== 'ed25519') {
    throw new ValidationError('Service-unit drill signer is not Ed25519');
  }
  const unsigned = structuredClone(evidence);
  delete unsigned.attestation;
  if (!verifyObjectSignature(unsigned, evidence.attestation, publicKey)) {
    throw new ValidationError('Service-unit drill attestation is invalid');
  }
  return {
    valid: true,
    schema: evidence.schema,
    source_revision: evidence.source.revision,
    unit_count: evidence.topology.unit_count
  };
}

function startUnit(service, { projection, provisioned, basePort }) {
  const unit = projection.services[service];
  const environment = {
    ...process.env,
    NODE_ENV: 'production',
    AXIOM_AUTO_BOOTSTRAP: 'false',
    AXIOM_REQUIRE_DENY_EGRESS: 'false',
    AXIOM_DATA_DIR: unit.data_dir,
    AXIOM_DATA_KEY: '',
    AXIOM_DATA_KEY_FILE: provisioned.data_key_file,
    AXIOM_API_TOKENS: '',
    AXIOM_API_TOKENS_FILE: provisioned.api_tokens_file,
    AXIOM_INTERNAL_TLS: 'true',
    AXIOM_TRANSPORT_DIR: unit.transport_dir,
    AXIOM_GATEWAY_HOST: '127.0.0.1',
    AXIOM_INTERNAL_HOST: '127.0.0.1',
    AXIOM_GATEWAY_PORT: String(basePort),
    AXIOM_HYPERVISOR_PORT: String(basePort + 1),
    AXIOM_SANDBOX_PORT: String(basePort + 2),
    AXIOM_GRID_PORT: String(basePort + 3),
    AXIOM_HYPERVISOR_URL: `https://127.0.0.1:${basePort + 1}`,
    AXIOM_SANDBOX_URL: `https://127.0.0.1:${basePort + 2}`,
    AXIOM_GRID_URL: `https://127.0.0.1:${basePort + 3}`,
    AXIOM_POLICY_PATH: join(MESH_ROOT, 'config', 'policy.json'),
    AXIOM_POLICY_PATHS: '',
    AXIOM_CAPABILITIES_PATH: join(MESH_ROOT, 'config', 'capabilities.json'),
    AXIOM_LOG_REQUESTS: 'false'
  };
  const child = spawn(process.execPath, [MODULES[service]], {
    cwd: MESH_ROOT,
    env: environment,
    stdio: ['ignore', 'pipe', 'pipe', 'ipc']
  });
  child.diagnostics = '';
  const collect = chunk => {
    if (child.diagnostics.length < 32_768) child.diagnostics += chunk;
  };
  child.stdout.on('data', collect);
  child.stderr.on('data', collect);
  return child;
}

async function waitForListening(child, service, timeoutMs = 15_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (child.exitCode !== null || child.signalCode !== null) {
      throw new ValidationError(
        `${service} unit exited during startup: ${diagnostic(child)}`
      );
    }
    if (child.diagnostics.includes(`"service":"${service}","status":"listening"`)) {
      return;
    }
    await delay(50);
  }
  throw new ValidationError(
    `${service} unit startup timed out: ${diagnostic(child)}`
  );
}

async function waitForOperations({
  gateway,
  token,
  expected,
  children,
  survivors,
  timeoutMs = 15_000
}) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    for (const [service, child] of children) {
      if (
        service !== 'sandbox'
        && (child.exitCode !== null || child.signalCode !== null)
      ) {
        throw new ValidationError(
          `${service} unit exited unexpectedly: ${diagnostic(child)}`
        );
      }
    }
    if (survivors && !survivorsUnchanged(survivors)) {
      throw new ValidationError('A survivor process exited during recovery');
    }
    try {
      const result = await requestJson(`${gateway}/v1/operations`, token);
      if (
        result.status === 200
        && (
          (expected === 'ready' && operationsReportIsReady(result.payload))
          || (expected !== 'ready' && result.payload?.status !== 'ready')
        )
      ) return result;
    } catch {
      // The shared deadline remains authoritative.
    }
    await delay(100);
  }
  throw new ValidationError(`Service-unit operations did not become ${expected}`);
}

function survivorsUnchanged(survivors) {
  return Object.values(survivors).every(
    child => child.exitCode === null && child.signalCode === null
  );
}

async function submitEcho({ gateway, token, message }) {
  const response = await fetch(`${gateway}/v1/intents`, {
    method: 'POST',
    redirect: 'error',
    signal: AbortSignal.timeout(10_000),
    headers: {
      authorization: `Bearer ${token}`,
      accept: 'application/json',
      'content-type': 'application/json',
      'idempotency-key': `service-unit-drill-${randomUUID()}`
    },
    body: JSON.stringify({
      action: 'system.echo',
      input: { message }
    })
  });
  return {
    status: response.status,
    payload: await response.json()
  };
}

async function requestJson(url, token) {
  const response = await fetch(url, {
    redirect: 'error',
    signal: AbortSignal.timeout(8_000),
    headers: {
      authorization: `Bearer ${token}`,
      accept: 'application/json'
    }
  });
  return {
    status: response.status,
    payload: await response.json()
  };
}

async function stopUnit(child) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  const exited = once(child, 'exit');
  if (child.connected) {
    try {
      child.send({ type: 'axiom.service.stop' });
    } catch {
      child.kill('SIGTERM');
    }
  } else {
    child.kill('SIGTERM');
  }
  const timer = setTimeout(() => {
    if (child.exitCode === null && child.signalCode === null) {
      child.kill('SIGKILL');
    }
  }, 5_000);
  timer.unref();
  await exited;
  clearTimeout(timer);
}

async function assertNoSecrets(evidence, provisioned, token) {
  const serialized = canonicalJson(evidence);
  const secrets = [
    token,
    (await readFile(provisioned.data_key_file, 'utf8')).trim(),
    await readFile(provisioned.transport.ca_private_key_file, 'utf8')
  ];
  if (
    secrets.some(secret => serialized.includes(secret))
    || /PRIVATE KEY|authorization:\s*bearer|operator\.token/i.test(serialized)
  ) {
    throw new ValidationError('Service-unit drill evidence contains secrets');
  }
}

async function prepareDisposableWorkspace(value) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new ValidationError(
      'Service-unit drill requires an explicit disposable workspace'
    );
  }
  const workspace = resolve(value);
  await mkdir(workspace, { recursive: true, mode: 0o700 });
  if ((await readdir(workspace)).length !== 0) {
    throw new ValidationError('Service-unit drill workspace must be empty');
  }
  return workspace;
}

function normalizeRevision(value) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value !== 'string' || !REVISION.test(value)) {
    throw new ValidationError(
      'Service-unit drill revision must be a 40-character SHA'
    );
  }
  return value;
}

function normalizeTimestamp(value) {
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value))) {
    throw new ValidationError('Service-unit drill timestamp is invalid');
  }
  return new Date(value).toISOString();
}

function diagnostic(child) {
  return child.diagnostics.split(/\r?\n/).filter(Boolean).slice(-4).join(';');
}

function elapsedMilliseconds(startedAt) {
  return Number((performance.now() - startedAt).toFixed(3));
}

function delay(milliseconds) {
  return new Promise(resolvePromise => setTimeout(resolvePromise, milliseconds));
}

if (
  process.argv[1]
  && import.meta.url === pathToFileURL(process.argv[1]).href
) {
  if (process.argv.length !== 3) {
    throw new ValidationError(
      'Usage: node src/service-unit-drill.mjs <empty-disposable-workspace>'
    );
  }
  const evidence = await runServiceUnitDrill({
    workspaceDir: process.argv[2]
  });
  process.stdout.write(`${JSON.stringify(evidence, null, 2)}\n`);
}

export { EVIDENCE_SCHEMA };
