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

const SOURCE_REVISION = 'e'.repeat(40);
const HUMAN_TOKEN = `human-${'h'.repeat(40)}`;
const MACHINE_TOKEN = `machine-${'m'.repeat(40)}`;

function machineRoot() {
  return {
    type: 'agent',
    id: 'agent.activation-required',
    sponsor: 'owner.activation-required',
    roles: ['researcher'],
    scopes: ['intent:execute'],
    lifetime: 'persistent',
    runtime: {
      id: 'runtime.activation-required',
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
  };
}

test('current-generation preflight activates enforcement once over the exact Gateway route', async t => {
  const dataDir = await mkdtemp(join(tmpdir(), 'axiom-machine-activation-route-'));
  const lease = await reserveProductionPortBlock('axiom machine activation route');
  const basePort = lease.base_port;
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
  stack = await startDevelopmentStack({
    dataDir,
    environment: 'test',
    autoBootstrap: true,
    machineCurrentnessEnforcement: true,
    machineCurrentnessPreflightRequired: true,
    machineCurrentnessSourceRevision: SOURCE_REVISION,
    gatewayPort: basePort,
    hypervisorPort: basePort + 1,
    sandboxPort: basePort + 2,
    gridPort: basePort + 3,
    hypervisorUrl: `http://127.0.0.1:${basePort + 1}`,
    sandboxUrl: `http://127.0.0.1:${basePort + 2}`,
    gridUrl: `http://127.0.0.1:${basePort + 3}`,
    apiTokens: {
      [HUMAN_TOKEN]: {
        id: 'owner.activation-route',
        type: 'human',
        roles: ['administrator'],
        scopes: ['*']
      }
    }
  });

  const config = stack.config;
  const gateway = await ensureMeshIdentity(dataDir, 'gateway', { create: false });
  const sandbox = await ensureMeshIdentity(dataDir, 'sandbox', { create: false });
  const configuredSource = enumerateConfiguredMachinePrincipalAuthorities(
    await loadApiPrincipals(config)
  );
  const preflightUrl = `${config.urls.hypervisor}/internal/v1/machine-currentness/preflight`;
  const activationUrl = `${config.urls.hypervisor}/internal/v1/machine-currentness/activate`;

  await assert.rejects(
    () => signedFetch(gateway, 'hypervisor', activationUrl, {
      method: 'POST',
      body: { report_digest: 'a'.repeat(64) }
    }),
    error => error?.code === 'machine_currentness_preflight_required'
  );

  const report = await signedFetch(gateway, 'hypervisor', preflightUrl, {
    method: 'POST',
    body: {
      source_revision: SOURCE_REVISION,
      configured_source: configuredSource
    }
  });
  assert.equal(report.ready, true);
  assert.match(report.runtime_generation, /^runtime_generation_/);

  const activation = await signedFetch(gateway, 'hypervisor', activationUrl, {
    method: 'POST',
    body: { report_digest: report.report_digest }
  });
  assert.equal(activation.active, true);
  assert.equal(activation.report_digest, report.report_digest);
  assert.equal(activation.authority_effect, 'none');

  await assert.rejects(
    () => signedFetch(gateway, 'hypervisor', activationUrl, {
      method: 'POST',
      body: { report_digest: report.report_digest }
    }),
    error => error?.code === 'machine_currentness_preflight_replayed'
  );
  await assert.rejects(
    () => signedFetch(sandbox, 'hypervisor', activationUrl, {
      method: 'POST',
      body: { report_digest: report.report_digest }
    }),
    error => error?.code === 'service_network_policy_denied'
  );
});

test('required preflight blocks machine intent instead of falling back to bearer authority', async t => {
  const dataDir = await mkdtemp(join(tmpdir(), 'axiom-machine-activation-block-'));
  const lease = await reserveProductionPortBlock('axiom machine activation block');
  const basePort = lease.base_port;
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
  stack = await startDevelopmentStack({
    dataDir,
    environment: 'test',
    autoBootstrap: true,
    machineCurrentnessEnforcement: true,
    machineCurrentnessPreflightRequired: true,
    machineCurrentnessSourceRevision: SOURCE_REVISION,
    gatewayPort: basePort,
    hypervisorPort: basePort + 1,
    sandboxPort: basePort + 2,
    gridPort: basePort + 3,
    hypervisorUrl: `http://127.0.0.1:${basePort + 1}`,
    sandboxUrl: `http://127.0.0.1:${basePort + 2}`,
    gridUrl: `http://127.0.0.1:${basePort + 3}`,
    apiTokens: {
      [HUMAN_TOKEN]: {
        id: 'owner.activation-required',
        type: 'human',
        roles: ['administrator'],
        scopes: ['*']
      },
      [MACHINE_TOKEN]: machineRoot()
    }
  });

  const response = await fetch(`http://127.0.0.1:${basePort}/v1/intents`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${MACHINE_TOKEN}`,
      accept: 'application/json',
      'content-type': 'application/json',
      'idempotency-key': 'machine-activation-required-0001'
    },
    body: JSON.stringify({
      action: 'system.echo',
      input: { message: 'must-not-run' },
      purpose: 'test.conformance'
    })
  });
  const body = await response.json();
  assert.equal(response.status, 409);
  assert.equal(body.error?.code, 'machine_currentness_preflight_required');
});
