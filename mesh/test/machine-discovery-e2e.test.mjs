// Final verification anchor for the promoted bounded machine-discovery claim.
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { createGatewayClient } from '../../packages/axiom-client/index.mjs';
import { startDevelopmentStack } from '../src/dev.mjs';
import { reserveProductionPortBlock } from '../src/lib/production-host.mjs';

const HUMAN_TOKEN = `human-discovery-${'h'.repeat(32)}`;
const AGENT_TOKEN = `agent-discovery-${'a'.repeat(32)}`;

function apiTokens() {
  return {
    [HUMAN_TOKEN]: {
      id: 'owner.discovery-e2e',
      type: 'human',
      roles: ['administrator'],
      scopes: ['*']
    },
    [AGENT_TOKEN]: {
      id: 'agent.discovery-e2e',
      type: 'agent',
      sponsor: 'owner.discovery-e2e',
      roles: ['researcher'],
      scopes: ['intent:execute'],
      lifetime: 'session',
      expires_at: '2099-01-01T00:00:00.000Z',
      runtime: {
        id: 'runtime.discovery-e2e',
        kind: 'local-process',
        software_digest: 'd'.repeat(64)
      },
      constraints: {
        actions: ['system.echo'],
        purposes: ['test.conformance'],
        destinations: ['local'],
        budgets: {
          max_requests_per_minute: 30,
          max_concurrent_requests: 2,
          max_execution_ms: 1_500,
          max_request_bytes: 65_536,
          max_response_bytes: 262_144
        },
        delegation: { allowed: false, max_depth: 0 }
      }
    }
  };
}

async function stackFixture(t) {
  const dataDir = await mkdtemp(join(tmpdir(), 'axiom-machine-discovery-e2e-'));
  const lease = await reserveProductionPortBlock('machine discovery e2e');
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
    apiTokens: apiTokens()
  });
  const gateway = `http://127.0.0.1:${basePort}`;
  return {
    machine: createGatewayClient({
      token: AGENT_TOKEN,
      request: (path, options) => fetch(`${gateway}${path}`, options)
    }),
    human: createGatewayClient({
      token: HUMAN_TOKEN,
      request: (path, options) => fetch(`${gateway}${path}`, options)
    })
  };
}

test('real Gateway exposes only bounded machine requestability and leaves registry discovery unchanged', async t => {
  const { machine, human } = await stackFixture(t);

  const discovery = await machine.call('machine_discovery.get');
  assert.equal(discovery.schema, 'axiom-machine-discovery.v1');
  assert.equal(discovery.notice, 'discovery_is_not_authorization');
  assert.equal(discovery.principal.id, 'agent.discovery-e2e');
  assert.equal(discovery.principal.sponsor, 'owner.discovery-e2e');
  assert.deepEqual(discovery.purposes, ['test.conformance']);
  assert.deepEqual(discovery.destinations, ['local']);
  assert.deepEqual(discovery.actions.map(action => action.id), ['system.echo']);
  assert.equal(discovery.actions[0].effect_destination, 'local');
  assert.equal(discovery.actions[0].timeout_ms, 1_500);
  assert.equal(discovery.limits.max_concurrent_requests, 2);
  assert.equal(discovery.limits.delegation_allowed, false);
  assert.match(discovery.digest, /^[a-f0-9]{64}$/);
  assert.deepEqual(Object.keys(discovery.policy).sort(), ['digest', 'version']);
  assert.equal(JSON.stringify(discovery).includes('memory.put'), false);
  assert.equal(JSON.stringify(discovery).includes('system.hash'), false);
  assert.equal(JSON.stringify(discovery).includes(AGENT_TOKEN), false);

  await assert.rejects(
    () => human.call('machine_discovery.get'),
    error => error.code === 'forbidden' && error.status === 403
  );

  const registry = await machine.call('capabilities.list');
  assert.equal(registry.schema, 'axiom-capabilities.v1');
  assert.ok(registry.capabilities.length > discovery.actions.length);
  assert.ok(registry.capabilities.some(capability => capability.id === 'memory.graph'));
});
