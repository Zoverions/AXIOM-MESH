import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { closeTransportPools, signedFetch } from '../src/lib/client.mjs';
import { loadApiPrincipals } from '../src/lib/config.mjs';
import { ensureMeshIdentity } from '../src/lib/identity.mjs';
import {
  enumerateConfiguredMachinePrincipalAuthorities
} from '../src/lib/machine-principal-currentness.mjs';
import { reserveProductionPortBlock } from '../src/lib/production-host.mjs';
import { startDevelopmentStack } from '../src/dev.mjs';

const AGENT_TOKEN = `agent-${'a'.repeat(40)}`;
const HUMAN_TOKEN = `human-${'h'.repeat(40)}`;

function apiTokens() {
  return {
    [HUMAN_TOKEN]: {
      id: 'owner.preflight-route',
      type: 'human',
      roles: ['administrator'],
      scopes: ['*']
    },
    [AGENT_TOKEN]: {
      id: 'agent.preflight.route',
      type: 'agent',
      sponsor: 'owner.preflight-route',
      roles: ['researcher'],
      scopes: ['intent:execute'],
      lifetime: 'persistent',
      runtime: {
        id: 'runtime.preflight.route',
        kind: 'local-process',
        software_digest: 'a'.repeat(64)
      },
      constraints: {
        actions: ['system.echo'],
        purposes: ['test.conformance'],
        destinations: ['local'],
        budgets: {
          max_requests_per_minute: 10,
          max_concurrent_requests: 1,
          max_execution_ms: 2_000,
          max_request_bytes: 65_536,
          max_response_bytes: 262_144
        },
        delegation: { allowed: false, max_depth: 0 }
      }
    }
  };
}

test('Gateway-only preflight route aggregates without exposing bearer material or authorizing activation', async t => {
  const dataDir = await mkdtemp(join(tmpdir(), 'axiom-machine-preflight-route-'));
  const lease = await reserveProductionPortBlock('axiom machine preflight route');
  const basePort = lease.base_port;
  const overrides = {
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
    apiTokens: apiTokens()
  };
  let stack;
  t.after(async () => {
    closeTransportPools();
    try {
      await stack?.stop();
    } finally {
      await lease.release();
      await rm(dataDir, { recursive: true, force: true });
    }
  });
  stack = await startDevelopmentStack(overrides);
  const config = stack.config;

  const gateway = await ensureMeshIdentity(dataDir, 'gateway', { create: false });
  const sandbox = await ensureMeshIdentity(dataDir, 'sandbox', { create: false });
  const configuredSource = enumerateConfiguredMachinePrincipalAuthorities(
    await loadApiPrincipals(config)
  );
  const url = `${config.urls.hypervisor}/internal/v1/machine-currentness/preflight`;
  const report = await signedFetch(gateway, 'hypervisor', url, {
    method: 'POST',
    traceId: 'trace_machine_currentness_operator_preflight',
    body: {
      source_revision: 'e'.repeat(40),
      configured_source: configuredSource
    }
  });

  assert.equal(report.schema, 'axiom-machine-currentness-production-preflight-report.v1');
  assert.equal(report.ready, false);
  assert.equal(report.blockers.includes('configured-principal-missing-from-grid'), true);
  assert.equal(report.semantics.production_activation_authorized, false);
  assert.equal(report.semantics.authority_effect, 'none');
  assert.equal(JSON.stringify(report).includes(AGENT_TOKEN), false);

  await assert.rejects(
    () => signedFetch(sandbox, 'hypervisor', url, {
      method: 'POST',
      traceId: 'trace_machine_currentness_preflight_wrong_caller',
      body: {
        source_revision: 'e'.repeat(40),
        configured_source: configuredSource
      }
    }),
    error => error?.code === 'service_network_policy_denied'
  );
});
