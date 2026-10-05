import assert from 'node:assert/strict';
import { chmod, mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  assertHostedProductionFilesystem,
  buildHostedNamespaceLaunch,
  createHostedIngress,
  validateHostedProductionConfig
} from '../src/hosted-plesk.mjs';
import { initializeHostedNamespace } from '../src/hosted-namespace.mjs';

const LINUX_HOST = { skip: process.platform !== 'linux' };

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'axiom-hosted-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const documentRoot = join(root, 'public');
  const privateRoot = join(root, 'private');
  const dataDir = join(privateRoot, 'data');
  const secretDir = join(privateRoot, 'secrets');
  const transportDir = join(secretDir, 'transport');
  const runDir = join(privateRoot, 'run');
  await mkdir(documentRoot, { mode: 0o755 });
  await mkdir(privateRoot, { mode: 0o700 });
  await mkdir(dataDir, { mode: 0o700 });
  await mkdir(secretDir, { mode: 0o700 });
  await mkdir(transportDir, { mode: 0o700 });
  await mkdir(runDir, { mode: 0o700 });
  await writeFile(join(documentRoot, 'index.html'), '<h1>AXIOM discovery</h1>', { mode: 0o644 });
  await writeFile(join(secretDir, 'data-protection.key'), 'test-key', { mode: 0o600 });
  await writeFile(join(secretDir, 'api-tokens.json'), '{}', { mode: 0o600 });
  const environment = {
    NODE_ENV: 'production',
    PORT: '32123',
    AXIOM_APPLICATION_ROOT: root,
    AXIOM_DOCUMENT_ROOT: documentRoot,
    AXIOM_DATA_DIR: dataDir,
    AXIOM_DATA_KEY_FILE: join(secretDir, 'data-protection.key'),
    AXIOM_API_TOKENS_FILE: join(secretDir, 'api-tokens.json'),
    AXIOM_TRANSPORT_DIR: transportDir,
    AXIOM_GATEWAY_SOCKET: join(runDir, 'gateway.sock'),
    AXIOM_AUTO_BOOTSTRAP: 'false',
    AXIOM_REQUIRE_DENY_EGRESS: 'true',
    AXIOM_INTERNAL_TLS: 'true',
    AXIOM_GATEWAY_HOST: '127.0.0.1',
    AXIOM_INTERNAL_HOST: '127.0.0.1',
    PATH: process.env.PATH
  };
  return { root, documentRoot, privateRoot, dataDir, secretDir, transportDir, runDir, environment };
}

test('hosted production accepts only the reviewed Node/runtime and private-root topology', LINUX_HOST, async t => {
  const input = await fixture(t);
  const config = validateHostedProductionConfig({
    environment: input.environment,
    runtimeVersion: '22.23.2'
  });

  assert.equal(config.applicationRoot, input.root);
  assert.equal(config.documentRoot, input.documentRoot);
  assert.equal(config.gatewaySocket, join(input.runDir, 'gateway.sock'));
  assert.equal(config.port, 32123);
  await assertHostedProductionFilesystem(config);
});

test('Passenger reverse binding starts without PORT and never selects a non-loopback ingress', LINUX_HOST, async t => {
  const { environment } = await fixture(t);
  const { PORT: _passengerPort, ...passengerEnvironment } = environment;
  const managed = validateHostedProductionConfig({
    environment: passengerEnvironment,
    runtimeVersion: '22.23.2'
  });

  assert.equal(managed.port, 0);
  assert.equal(managed.ingressHost, '127.0.0.1');

  const explicit = validateHostedProductionConfig({
    environment,
    runtimeVersion: '22.23.2'
  });
  assert.equal(explicit.port, 32123);
  assert.equal(explicit.ingressHost, '127.0.0.1');

  for (const invalid of ['', '0', '-1', '65536', '/tmp/passenger.sock']) {
    assert.throws(
      () => validateHostedProductionConfig({
        environment: { ...passengerEnvironment, PORT: invalid },
        runtimeVersion: '22.23.2'
      }),
      /Passenger PORT/i,
      `unsafe explicit Passenger PORT ${JSON.stringify(invalid)} was accepted`
    );
  }
});

test('hosted production rejects public secrets, disabled security controls, and unreviewed runtimes', LINUX_HOST, async t => {
  const { documentRoot, environment } = await fixture(t);
  for (const [field, unsafeValue] of [
    ['NODE_ENV', 'development'],
    ['AXIOM_AUTO_BOOTSTRAP', 'true'],
    ['AXIOM_REQUIRE_DENY_EGRESS', 'false'],
    ['AXIOM_INTERNAL_TLS', 'false'],
    ['AXIOM_GATEWAY_HOST', '0.0.0.0'],
    ['AXIOM_INTERNAL_HOST', '0.0.0.0'],
    ['AXIOM_DATA_KEY', 'plaintext-secret'],
    ['AXIOM_API_TOKENS', 'plaintext-token']
  ]) {
    assert.throws(
      () => validateHostedProductionConfig({
        environment: { ...environment, [field]: unsafeValue },
        runtimeVersion: '22.23.2'
      }),
      /hosted production|production runtime/i,
      `unsafe hosted setting ${field} was accepted`
    );
  }
  assert.throws(
    () => validateHostedProductionConfig({
      environment: { ...environment, AXIOM_DATA_DIR: join(documentRoot, 'data') },
      runtimeVersion: '22.23.2'
    }),
    /outside the public document root/i
  );
  assert.throws(
    () => validateHostedProductionConfig({ environment, runtimeVersion: '22.23.3' }),
    /production requires Node\.js 22\.23\.2 exactly/i
  );
});

test('hosted production refuses group/world-readable secrets and public symlink aliases', LINUX_HOST, async t => {
  const input = await fixture(t);
  const config = validateHostedProductionConfig({ environment: input.environment });
  await chmod(input.environment.AXIOM_DATA_KEY_FILE, 0o644);
  await assert.rejects(
    () => assertHostedProductionFilesystem(config),
    /private permissions/i
  );
  await chmod(input.environment.AXIOM_DATA_KEY_FILE, 0o600);
  const alias = join(input.documentRoot, 'private-alias');
  await symlink(input.privateRoot, alias);
  await assert.rejects(
    () => assertHostedProductionFilesystem({
      ...config,
      dataDir: join(alias, 'data')
    }),
    /outside the public document root|private path resolves/i
  );
});

test('hosted namespace launch cannot inherit Passenger ports or unrelated credentials', LINUX_HOST, async t => {
  const input = await fixture(t);
  const config = validateHostedProductionConfig({
    environment: {
      ...input.environment,
      UNRELATED_PROVIDER_TOKEN: 'must-not-cross-boundary'
    },
    runtimeVersion: '22.23.2'
  });
  const launch = buildHostedNamespaceLaunch(config);

  assert.equal(launch.command, 'unshare');
  assert.deepEqual(launch.arguments.slice(0, 4), ['--user', '--map-root-user', '--net', '--']);
  assert.match(launch.arguments.at(-1), /hosted-namespace\.mjs$/);
  assert.equal(launch.environment.AXIOM_REQUIRE_DENY_EGRESS, 'true');
  assert.equal(launch.environment.AXIOM_INTERNAL_TLS, 'true');
  assert.equal(launch.environment.AXIOM_GATEWAY_HOST, '127.0.0.1');
  assert.equal(launch.environment.PORT, undefined);
  assert.equal(launch.environment.UNRELATED_PROVIDER_TOKEN, undefined);
});

test('namespace bootstrap enables loopback, verifies zero egress, then starts the unchanged supervisor', LINUX_HOST, async () => {
  const calls = [];
  const result = await initializeHostedNamespace({
    environment: {
      NODE_ENV: 'production',
      AXIOM_AUTO_BOOTSTRAP: 'false',
      AXIOM_REQUIRE_DENY_EGRESS: 'true',
      AXIOM_INTERNAL_TLS: 'true'
    },
    enableLoopback: () => calls.push('loopback'),
    inspectBoundary: async () => calls.push('deny-egress'),
    startSupervisor: async () => {
      calls.push('supervisor');
      return 0;
    }
  });

  assert.equal(result, 0);
  assert.deepEqual(calls, ['loopback', 'deny-egress', 'supervisor']);
});

test('namespace bootstrap fails before startup when loopback or deny-egress enforcement fails', LINUX_HOST, async () => {
  let started = false;
  await assert.rejects(
    () => initializeHostedNamespace({
      environment: {
        NODE_ENV: 'production',
        AXIOM_AUTO_BOOTSTRAP: 'false',
        AXIOM_REQUIRE_DENY_EGRESS: 'true',
        AXIOM_INTERNAL_TLS: 'true'
      },
      enableLoopback: () => {},
      inspectBoundary: async () => { throw new Error('external route detected'); },
      startSupervisor: async () => { started = true; }
    }),
    /external route detected/i
  );
  assert.equal(started, false);
});

test('Passenger ingress serves public discovery and proxies only bounded requests to the fixed Unix socket', LINUX_HOST, async t => {
  const input = await fixture(t);
  const config = validateHostedProductionConfig({ environment: input.environment });
  const gateway = createServer((request, response) => {
    if (request.url === '/ready') {
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ service: 'gateway', status: 'ready' }));
      return;
    }
    if (request.headers.authorization !== 'Bearer allowed') {
      response.writeHead(401);
      response.end('unauthorized');
      return;
    }
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ path: request.url }));
  });
  try {
    await new Promise((resolve, reject) => {
      gateway.once('error', reject);
      gateway.listen(config.gatewaySocket, resolve);
    });
  } catch (error) {
    if (!process.env.GITHUB_ACTIONS && ['EPERM', 'EACCES'].includes(error.code)) {
      t.skip('Unix-domain socket creation is unavailable in the local execution sandbox');
      return;
    }
    throw error;
  }
  t.after(() => new Promise(resolve => gateway.close(resolve)));

  const ingress = createHostedIngress(config);
  await new Promise((resolve, reject) => {
    ingress.once('error', reject);
    ingress.listen(0, config.ingressHost, resolve);
  });
  t.after(() => new Promise(resolve => ingress.close(resolve)));
  const origin = `http://127.0.0.1:${ingress.address().port}`;

  const discovery = await fetch(`${origin}/`);
  assert.equal(discovery.status, 200);
  assert.match(await discovery.text(), /AXIOM discovery/);

  const ready = await fetch(`${origin}/ready`);
  assert.equal(ready.status, 200);
  assert.equal((await ready.json()).status, 'ready');

  const denied = await fetch(`${origin}/v1/machine-discovery`);
  assert.equal(denied.status, 401);

  const allowed = await fetch(`${origin}/v1/machine-discovery`, {
    headers: { authorization: 'Bearer allowed' }
  });
  assert.equal(allowed.status, 200);
  assert.equal((await allowed.json()).path, '/v1/machine-discovery');

  const traversal = await fetch(`${origin}/%2e%2e/private/secrets/api-tokens.json`);
  assert.notEqual(traversal.status, 200);

  const oversized = await fetch(`${origin}/v1/machine-discovery`, {
    method: 'POST',
    body: 'x'.repeat(1_048_577)
  });
  assert.equal(oversized.status, 413);
});
