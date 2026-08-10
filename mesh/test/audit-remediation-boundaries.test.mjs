import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { createGatewayClient } from '../../packages/axiom-client/index.mjs';
import { shouldCrashAfterRetirementForTest } from '../src/backup-maintenance.mjs';
import { meshConfig } from '../src/lib/config.mjs';
import { startDevelopmentStack } from '../src/dev.mjs';
import { reserveProductionPortBlock } from '../src/lib/production-host.mjs';

const ADMIN_TOKEN = `audit-admin-${'a'.repeat(32)}`;
const MACHINE_TOKEN = `audit-machine-${'m'.repeat(32)}`;

test('backup retention crash injection is inert outside NODE_ENV=test', () => {
  assert.equal(shouldCrashAfterRetirementForTest(1, {
    environment: 'production',
    configured: '1'
  }), false);
  assert.equal(shouldCrashAfterRetirementForTest(1, {
    environment: 'development',
    configured: '1'
  }), false);
  assert.equal(shouldCrashAfterRetirementForTest(1, {
    environment: 'test',
    configured: '1'
  }), true);
  assert.throws(
    () => shouldCrashAfterRetirementForTest(1, {
      environment: 'test',
      configured: 'invalid'
    }),
    /is invalid/
  );
  assert.equal(shouldCrashAfterRetirementForTest(1, {
    environment: 'production',
    configured: 'invalid'
  }), false);
});

test('.env.example satisfies the current production configuration invariants', async () => {
  const serialized = await readFile(new URL('../../.env.example', import.meta.url), 'utf8');
  const parsed = Object.fromEntries(serialized
    .split(/\r?\n/)
    .filter(line => line && !line.startsWith('#'))
    .map(line => {
      const index = line.indexOf('=');
      return [line.slice(0, index), line.slice(index + 1)];
    }));
  const prior = new Map();
  for (const [key, value] of Object.entries(parsed)) {
    prior.set(key, process.env[key]);
    process.env[key] = value;
  }
  try {
    const config = meshConfig();
    assert.equal(config.environment, 'production');
    assert.equal(config.requireDenyEgress, true);
    assert.equal(config.transport.enabled, true);
    assert.match(config.gatewaySocket, /gateway\.sock$/);
    assert.equal(new URL(config.urls.hypervisor).protocol, 'https:');
    assert.equal(new URL(config.urls.sandbox).protocol, 'https:');
    assert.equal(new URL(config.urls.grid).protocol, 'https:');
  } finally {
    for (const [key, value] of prior) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});

test('low-privilege machine cannot enumerate global registries and malformed queries fail closed', async t => {
  const dataDir = await mkdtemp(join(tmpdir(), 'axiom-audit-remediation-'));
  const lease = await reserveProductionPortBlock('audit remediation read scope');
  const basePort = lease.base_port;
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
    apiTokens: {
      [ADMIN_TOKEN]: {
        id: 'audit-admin',
        type: 'human',
        roles: ['administrator'],
        scopes: ['*']
      },
      [MACHINE_TOKEN]: {
        id: 'agent.audit-read',
        type: 'agent',
        sponsor: 'audit-admin',
        roles: ['researcher'],
        scopes: ['intent:execute'],
        lifetime: 'session',
        expires_at: '2099-01-01T00:00:00.000Z',
        runtime: {
          id: 'runtime.audit-read',
          kind: 'local-process',
          software_digest: 'd'.repeat(64)
        },
        constraints: {
          actions: ['system.echo'],
          purposes: ['test.conformance'],
          destinations: ['local'],
          budgets: {
            max_requests_per_minute: 60,
            max_concurrent_requests: 2,
            max_execution_ms: 2_000,
            max_request_bytes: 65_536,
            max_response_bytes: 262_144
          },
          delegation: { allowed: false, max_depth: 0 }
        }
      }
    }
  });
  const gateway = `http://127.0.0.1:${basePort}`;
  const client = token => createGatewayClient({
    token,
    request: (path, options) => fetch(`${gateway}${path}`, options)
  });
  const machine = client(MACHINE_TOKEN);
  const admin = client(ADMIN_TOKEN);

  for (const routeId of ['capsules.list', 'proposals.list', 'nodes.list']) {
    await assert.rejects(
      () => machine.call(routeId),
      error => error.code === 'forbidden' && error.status === 403
    );
    const result = await admin.call(routeId, { query: { limit: 1 } });
    assert.ok(Array.isArray(result[routeId.split('.')[0]]));
  }

  await assert.rejects(
    () => admin.call('events.list', { query: { after: 'abc' } }),
    error => error.code === 'validation_error' && error.status === 400
  );
  await assert.rejects(
    () => admin.call('events.list', { query: { after: '-1' } }),
    error => error.code === 'validation_error' && error.status === 400
  );
  await assert.rejects(
    () => admin.call('capsules.list', { query: { limit: 101 } }),
    error => error.code === 'validation_error' && error.status === 400
  );
});
