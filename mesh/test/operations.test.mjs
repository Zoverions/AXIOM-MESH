import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { EventEmitter, once } from 'node:events';
import { chmod, mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import net from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { loadApiPrincipals, meshConfig } from '../src/lib/config.mjs';
import {
  operationsReport,
  readinessState,
  reportHasReadyServices,
  renderOpenMetrics,
  ServiceTelemetry
} from '../src/lib/observability.mjs';
import { loadDataProtector } from '../src/lib/protector.mjs';
import { provisionProduction } from '../src/provision-production.mjs';
import {
  validateSupportedSourceBoundary,
  verifyProductionDeployment
} from '../src/release.mjs';
import { runProductionSupervisor } from '../src/supervisor.mjs';

test('operational telemetry is bounded, alertable, and OpenMetrics compatible', () => {
  let now = Date.parse('2026-07-26T12:00:00.000Z');
  const telemetry = new ServiceTelemetry('gateway', {
    now: () => now,
    memoryUsage: () => ({ rss: 1_024, heapUsed: 512, external: 128 }),
    cpuUsage: () => ({ user: 2_000, system: 1_000 })
  });
  telemetry.beginRequest();
  now += 25;
  telemetry.finishRequest({ status: 200, elapsedMs: 25 });
  for (let index = 0; index < 5; index += 1) {
    telemetry.beginRequest();
    telemetry.finishRequest({
      status: 401,
      elapsedMs: 2,
      errorCode: 'invalid_token'
    });
  }
  telemetry.beginRequest();
  telemetry.finishRequest({
    status: 409,
    elapsedMs: 3,
    errorCode: 'replayed_request'
  });
  telemetry.markIntegrityFailure('evidence-head-mismatch');
  telemetry.markIntegrityFailure('evidence-head-mismatch');
  const snapshot = telemetry.snapshot(readinessState('gateway', [
    { name: 'identity', ok: true },
    { name: 'grid', ok: false, code: 'dependency_unavailable' }
  ]));
  const report = operationsReport([snapshot]);
  assert.equal(report.status, 'not_ready');
  assert.equal(snapshot.http.requests_total, 7);
  assert.equal(snapshot.security.authentication_failures_total, 5);
  assert.equal(snapshot.security.replay_rejections_total, 1);
  assert.equal(snapshot.reliability.integrity_failures_total, 1);
  assert.deepEqual(
    report.alerts.map(item => item.id),
    [
      'authentication-failures:gateway',
      'integrity-failure:gateway',
      'replay-rejected:gateway',
      'service-not-ready:gateway'
    ]
  );
  const metrics = renderOpenMetrics(report);
  assert.match(metrics, /axiom_service_ready\{service="gateway"\} 0/);
  assert.match(metrics, /axiom_http_requests_total\{service="gateway",status_class="4xx"\} 6/);
  assert.match(metrics, /axiom_http_request_duration_seconds_bucket\{service="gateway",le="\+Inf"\} 7/);
  assert.match(metrics, /axiom_process_cpu_seconds_total\{service="gateway",mode="user"\} 0\.002/);
  assert.match(metrics, /# EOF\n$/);
  assert.doesNotMatch(metrics, /principal|intent_id|query|prompt|payload|token/);
  assert.equal(reportHasReadyServices(report, ['gateway']), false);
  const ready = operationsReport([
    telemetry.snapshot(readinessState('gateway', [{ name: 'grid', ok: true }]))
  ]);
  assert.equal(reportHasReadyServices(ready, ['gateway']), true);
  assert.equal(reportHasReadyServices(ready, ['gateway', 'grid']), false);
  const untrusted = structuredClone(ready.services[0]);
  untrusted.secret = 'must-not-propagate';
  untrusted.readiness.checks[0].details = { token: 'must-not-propagate' };
  const sanitized = operationsReport([untrusted]);
  assert.equal('secret' in sanitized.services[0], false);
  assert.equal('details' in sanitized.services[0].readiness.checks[0], false);
});

test('production provisioning is explicit, restrictive, idempotent, and file-backed', async t => {
  const root = await mkdtemp(join(tmpdir(), 'axiom-production-provision-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const dataDir = join(root, 'data');
  const secretDir = join(root, 'secrets');
  const first = await provisionProduction({ dataDir, secretDir });
  const firstToken = await readFile(first.operator_token_file, 'utf8');
  const firstRegistry = await readFile(first.api_tokens_file, 'utf8');
  const second = await provisionProduction({ dataDir, secretDir });
  assert.deepEqual(second.identities, first.identities);
  assert.equal(await readFile(second.operator_token_file, 'utf8'), firstToken);
  assert.equal(await readFile(second.api_tokens_file, 'utf8'), firstRegistry);
  if (process.platform !== 'win32') {
    assert.equal((await stat(first.data_key_file)).mode & 0o077, 0);
    assert.equal((await stat(first.api_tokens_file)).mode & 0o077, 0);
    assert.equal((await stat(first.operator_token_file)).mode & 0o077, 0);
    await chmod(first.api_tokens_file, 0o644);
    await assert.rejects(
      () => provisionProduction({ dataDir, secretDir }),
      /must not be accessible/
    );
    await chmod(first.api_tokens_file, 0o600);
  }

  const previousFile = process.env.AXIOM_API_TOKENS_FILE;
  const previousInline = process.env.AXIOM_API_TOKENS;
  const previousDataFile = process.env.AXIOM_DATA_KEY_FILE;
  const previousDataInline = process.env.AXIOM_DATA_KEY;
  process.env.AXIOM_API_TOKENS_FILE = first.api_tokens_file;
  process.env.AXIOM_DATA_KEY_FILE = first.data_key_file;
  delete process.env.AXIOM_API_TOKENS;
  delete process.env.AXIOM_DATA_KEY;
  try {
    const productionConfig = meshConfig({
      environment: 'production',
      autoBootstrap: false,
      dataDir
    });
    const principals = await loadApiPrincipals(productionConfig);
    assert.equal(principals.size, 1);
    assert.equal([...principals.values()][0].id, 'production-operator');
    const protector = await loadDataProtector(productionConfig);
    const sealed = protector.seal({ value: 'protected' }, 'production-file-secret-test');
    assert.deepEqual(
      protector.open(sealed, 'production-file-secret-test'),
      { value: 'protected' }
    );
  } finally {
    if (previousFile === undefined) delete process.env.AXIOM_API_TOKENS_FILE;
    else process.env.AXIOM_API_TOKENS_FILE = previousFile;
    if (previousInline === undefined) delete process.env.AXIOM_API_TOKENS;
    else process.env.AXIOM_API_TOKENS = previousInline;
    if (previousDataFile === undefined) delete process.env.AXIOM_DATA_KEY_FILE;
    else process.env.AXIOM_DATA_KEY_FILE = previousDataFile;
    if (previousDataInline === undefined) delete process.env.AXIOM_DATA_KEY;
    else process.env.AXIOM_DATA_KEY = previousDataInline;
  }

  const incompleteData = join(root, 'incomplete-data');
  const incompleteSecrets = join(root, 'incomplete-secrets');
  await writeFile(join(root, 'placeholder'), 'unused');
  await mkdir(incompleteSecrets, { recursive: true, mode: 0o700 });
  await writeFile(join(incompleteSecrets, 'operator.token'), 'partial\n', { mode: 0o600 });
  await assert.rejects(
    () => provisionProduction({ dataDir: incompleteData, secretDir: incompleteSecrets }),
    /incomplete/
  );
});

test('production deployment policy is digest-pinned and fail-closed', async () => {
  const root = new URL('../', import.meta.url);
  const [
    dockerfile,
    dockerignore,
    compose,
    productionDocs,
    packageJson,
    backupRetentionPolicy,
    credentialRevocations,
    incidentResponsePolicy,
    workflow,
    repositoryIgnore
  ] = await Promise.all([
    readFile(new URL('Dockerfile', root), 'utf8'),
    readFile(new URL('.dockerignore', root), 'utf8'),
    readFile(new URL('compose.production.yml', root), 'utf8'),
    readFile(new URL('PRODUCTION.md', root), 'utf8'),
    readFile(new URL('package.json', root), 'utf8').then(JSON.parse),
    readFile(new URL('config/backup-retention.json', root), 'utf8').then(JSON.parse),
    readFile(new URL('config/credential-revocations.json', root), 'utf8').then(JSON.parse),
    readFile(new URL('config/incident-response.json', root), 'utf8').then(JSON.parse),
    readFile(new URL('../.github/workflows/kernel.yml', root), 'utf8'),
    readFile(new URL('../.gitignore', root), 'utf8')
  ]);
  const result = verifyProductionDeployment({
    dockerfile,
    dockerignore,
    compose,
    productionDocs,
    packageJson,
    backupRetentionPolicy,
    credentialRevocations,
    incidentResponsePolicy,
    workflow,
    repositoryIgnore
  });
  assert.equal(result.schema, 'axiom-deployment-policy.v1');
  assert.match(result.base_digest, /^sha256:[a-f0-9]{64}$/);
  assert.throws(() => verifyProductionDeployment({
    dockerfile: dockerfile.replace(/@sha256:[a-f0-9]{64}/, ''),
    dockerignore,
    compose,
    productionDocs,
    packageJson,
    backupRetentionPolicy,
    credentialRevocations,
    incidentResponsePolicy,
    workflow,
    repositoryIgnore
  }), /digest-pinned/);
  assert.throws(() => verifyProductionDeployment({
    dockerfile,
    dockerignore,
    compose: compose.replace('read_only: true', 'read_only: false'),
    productionDocs,
    packageJson,
    backupRetentionPolicy,
    credentialRevocations,
    incidentResponsePolicy,
    workflow,
    repositoryIgnore
  }), /read_only/);
  assert.throws(() => verifyProductionDeployment({
    dockerfile,
    dockerignore,
    compose: compose.replace('network_mode: "none"', 'network_mode: "host"'),
    productionDocs,
    packageJson,
    backupRetentionPolicy,
    credentialRevocations,
    incidentResponsePolicy,
    workflow,
    repositoryIgnore
  }), /network_mode: "none"/);
  assert.throws(() => verifyProductionDeployment({
    dockerfile,
    dockerignore,
    compose: compose.replace(
      'network_mode: "none"',
      'network_mode: "none"\n    ports:\n      - "127.0.0.1:8080:8080"'
    ),
    productionDocs,
    packageJson,
    backupRetentionPolicy,
    credentialRevocations,
    incidentResponsePolicy,
    workflow,
    repositoryIgnore
  }), /must not publish ports/);
  assert.throws(() => verifyProductionDeployment({
    dockerfile,
    dockerignore,
    compose,
    productionDocs,
    packageJson,
    backupRetentionPolicy: {
      ...backupRetentionPolicy,
      minimum_verified_backups: 1
    },
    credentialRevocations,
    incidentResponsePolicy,
    workflow,
    repositoryIgnore
  }), /minimum_verified_backups/);
  assert.throws(() => verifyProductionDeployment({
    dockerfile,
    dockerignore,
    compose,
    productionDocs,
    packageJson,
    backupRetentionPolicy,
    credentialRevocations,
    incidentResponsePolicy: {
      ...incidentResponsePolicy,
      severity_order: ['SEV-4', 'SEV-3', 'SEV-2', 'SEV-1']
    },
    workflow,
    repositoryIgnore
  }), /severity order/);
});

test('release source boundary rejects legacy runtimes and dependency manifests', () => {
  const valid = validateSupportedSourceBoundary([
    'README.md',
    'package.json',
    'package-lock.json',
    'mesh/package.json',
    'mesh/package-lock.json',
    'mesh/src/release.mjs'
  ]);
  assert.equal(valid.valid, true);
  assert.throws(
    () => validateSupportedSourceBoundary(['mesh/package.json', 'gateway/package-lock.json']),
    /Unsupported legacy runtime or dependency paths/
  );
  assert.throws(
    () => validateSupportedSourceBoundary(['mesh/package.json', 'docs/historical/requirements.txt']),
    /Unsupported legacy runtime or dependency paths/
  );
});

test('production supervisor rejects unsafe mode and terminates partial startup', async () => {
  await assert.rejects(() => runProductionSupervisor({
    config: {
      environment: 'development',
      autoBootstrap: true
    }
  }), /production supervisor/);
  await assert.rejects(() => runProductionSupervisor({
    config: {
      environment: 'production',
      autoBootstrap: false,
      requireDenyEgress: true
    },
    denyEgressCheck: async () => {
      throw new Error('deny-egress-boundary-rejected');
    }
  }), /deny-egress-boundary-rejected/);

  const children = [];
  const spawnImpl = () => {
    const child = new EventEmitter();
    child.exitCode = null;
    child.signalCode = null;
    child.kill = signal => {
      child.signalCode = signal;
      queueMicrotask(() => child.emit('exit', 0, signal));
      return true;
    };
    children.push(child);
    return child;
  };
  let probes = 0;
  const exitCode = await runProductionSupervisor({
    config: {
      environment: 'production',
      autoBootstrap: false,
      ports: { grid: 8083, sandbox: 8082, hypervisor: 8081, gateway: 8080 }
    },
    spawnImpl,
    fetchImpl: async () => {
      probes += 1;
      if (probes === 1) {
        return {
          ok: true,
          async json() {
            return { service: 'grid', status: 'live' };
          }
        };
      }
      throw new Error('sandbox unavailable');
    },
    startupTimeoutMs: 10,
    stdout: () => {},
    stderr: () => {}
  });
  assert.equal(exitCode, 1);
  assert.equal(children.length, 2);
  assert.ok(children.every(child => child.signalCode === 'SIGTERM'));
});

test('production supervisor boots the real four-process stack from provisioned secrets', async t => {
  const root = await mkdtemp(join(tmpdir(), 'axiom-production-runtime-'));
  const provisioned = await provisionProduction({
    dataDir: join(root, 'data'),
    secretDir: join(root, 'secrets')
  });
  const basePort = await findPortBlock();
  const child = spawn(process.execPath, ['src/supervisor.mjs'], {
    cwd: new URL('../', import.meta.url),
    stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
    env: {
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
      AXIOM_GRID_URL: `http://127.0.0.1:${basePort + 3}`
    }
  });
  let output = '';
  child.stdout.on('data', chunk => {
    if (output.length < 16_384) output += chunk;
  });
  child.stderr.on('data', chunk => {
    if (output.length < 16_384) output += chunk;
  });
  t.after(async () => {
    await stopSupervisor(child);
    await rm(root, {
      recursive: true,
      force: true,
      maxRetries: process.platform === 'win32' ? 5 : 0,
      retryDelay: 100
    });
  });
  const gateway = `http://127.0.0.1:${basePort}`;
  await waitForReady(`${gateway}/ready`, child, () => output);
  const token = (await readFile(provisioned.operator_token_file, 'utf8')).trim();
  const response = await fetch(`${gateway}/v1/operations`, {
    headers: { authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(3_000)
  });
  assert.equal(response.status, 200);
  const report = await response.json();
  assert.equal(report.status, 'ready');
  assert.deepEqual(
    report.services.map(service => service.service),
    ['gateway', 'grid', 'hypervisor', 'sandbox']
  );
  const [code, signal] = await stopSupervisor(child);
  assert.equal(code, 0, output);
  assert.equal(signal, null);
});

async function stopSupervisor(child) {
  if (child.exitCode !== null || child.signalCode !== null) {
    return [child.exitCode, child.signalCode];
  }
  const exited = once(child, 'exit');
  if (child.connected) child.send({ type: 'axiom.supervisor.stop' });
  else child.kill('SIGTERM');
  return exited;
}

async function waitForReady(url, child, diagnostics) {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null || child.signalCode !== null) {
      throw new Error(`Production supervisor exited during startup: ${diagnostics()}`);
    }
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(1_000) });
      if (response.ok && (await response.json()).status === 'ready') return;
    } catch {
      // The bounded polling loop retains the child exit as the authoritative failure.
    }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error(`Production supervisor did not become ready: ${diagnostics()}`);
}

async function findPortBlock() {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const base = 20_000 + Math.floor(Math.random() * 20_000);
    const servers = [];
    try {
      for (let port = base; port < base + 4; port += 1) {
        const server = net.createServer();
        await new Promise((resolve, reject) => {
          server.once('error', reject);
          server.listen(port, '127.0.0.1', resolve);
        });
        servers.push(server);
      }
      await Promise.all(servers.map(server => new Promise(resolve => server.close(resolve))));
      return base;
    } catch {
      await Promise.all(servers.map(server => new Promise(resolve => server.close(resolve))));
    }
  }
  throw new Error('Unable to reserve a production runtime port block');
}
