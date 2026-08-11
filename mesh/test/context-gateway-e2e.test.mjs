import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { createGatewayClient } from '../../packages/axiom-client/index.mjs';
import { startDevelopmentStack } from '../src/dev.mjs';
import { compileContextClaimMemoryIntent } from '../src/lib/context-lifecycle.mjs';
import { reserveProductionPortBlock } from '../src/lib/production-host.mjs';

const TOKEN = `context-gateway-${'c'.repeat(40)}`;
const OWNER = 'owner.context-e2e';

function claim() {
  return {
    schema: 'axiom-context-claim.v1',
    claim_id: 'claim:gateway-e2e-priority',
    owner: OWNER,
    subject: 'project.axiom',
    predicate: 'project.priority',
    value: 'security-first',
    claim_type: 'decision',
    cardinality: 'single',
    confidence_ppm: 1_000_000,
    source: {
      type: 'human',
      ref: 'test:context-gateway-e2e',
      digest: '1'.repeat(64),
      observed_at: '2026-08-11T20:00:00.000Z'
    },
    validity: {
      from: '2026-08-11T20:00:00.000Z',
      until: null
    },
    disclosure: {
      principals: [OWNER],
      purposes: ['project.execution'],
      scopes: ['context:project']
    },
    sensitivity: 'internal',
    supersedes: [],
    contradicts: [],
    authority_effect: 'none'
  };
}

test('context claim follows the governed intent path and returns through authenticated Gateway projection', async t => {
  const dataDir = await mkdtemp(join(tmpdir(), 'axiom-context-gateway-e2e-'));
  const lease = await reserveProductionPortBlock('context gateway e2e');
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
      [TOKEN]: {
        id: OWNER,
        type: 'human',
        roles: ['administrator'],
        scopes: ['*']
      }
    }
  });

  const gateway = `http://127.0.0.1:${basePort}`;
  const client = createGatewayClient({
    token: TOKEN,
    request: (path, options) => fetch(`${gateway}${path}`, options)
  });
  const compiled = compileContextClaimMemoryIntent(claim(), {
    principalId: OWNER
  });

  const written = await client.call('intents.submit', {
    body: {
      action: compiled.action,
      input: compiled.input,
      purpose: 'project.execution'
    },
    idempotencyKey: 'context-gateway-e2e-write-0001'
  });
  assert.equal(written.status, 'completed');
  assert.match(written.intent_id, /^intent_[a-f0-9]{64}$/);

  const view = await client.call('context.view', {
    query: {
      purpose: 'project.execution'
    }
  });

  assert.equal(view.schema, 'axiom-context-projection.v1');
  assert.equal(view.principal, OWNER);
  assert.equal(view.purpose, 'project.execution');
  assert.equal(view.authority_effect, 'none');
  assert.equal(view.usable_claims.length, 1);
  assert.equal(view.usable_claims[0].claim_id, 'claim:gateway-e2e-priority');
  assert.equal(view.usable_claims[0].owner, compiled.expected.owner);
  assert.deepEqual(
    view.authorization.projected_context_scopes,
    ['context:project']
  );
  assert.ok(!view.scopes.includes('*'));
  assert.match(view.view_digest, /^[a-f0-9]{64}$/);
  assert.match(view.projection_digest, /^[a-f0-9]{64}$/);
  assert.equal(view.evidence.grid_chain.valid, true);
  assert.equal(view.evidence.grid_chain.verification_mode, 'full');
});
