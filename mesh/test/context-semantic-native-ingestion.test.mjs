import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import net from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { startDevelopmentStack } from '../src/dev.mjs';
import { LOCAL_CONTEXT_CANDIDATE_SCHEMA } from '../src/lib/context-claim-resolution.mjs';
import { createLocalContextSemanticTrust } from '../src/lib/context-semantic-trust.mjs';
import {
  createLocalContextSemanticStateRecord,
  projectLocalContextSemanticStateMemoryPut
} from '../src/lib/context-semantic-state.mjs';
import {
  verifyLocalContextSemanticNativeIngestionFromGrid
} from '../src/grid/context-semantic-native-ingestion.mjs';
import { executeBuiltin } from '../src/sandbox/executor.mjs';

const OWNER = 'local-operator';

function candidate(claimId) {
  return {
    schema: LOCAL_CONTEXT_CANDIDATE_SCHEMA,
    claim_id: claimId,
    owner_subject_ref: OWNER,
    semantic_type: 'preference.communication-style',
    value: { preference: 'concise' },
    disclosure_type: 'verbatim-approved',
    sensitivity: 'ordinary-private',
    confidence: 0.9,
    limitations: 'Fixture data for native semantic ingestion evidence.',
    source_vault_id: 'vault.personal',
    source_resource_refs: ['resource.note.1'],
    observed_at: '2026-08-24T12:00:00.000Z',
    valid_from: '2026-08-24T12:00:00.000Z',
    valid_until: null,
    supersedes: [],
    contradicts: [],
    authority_effect: 'none'
  };
}

function state(claimId) {
  const value = candidate(claimId);
  const trust = createLocalContextSemanticTrust(value, {
    origin_class: 'owner-authored',
    semantic_class: 'preference',
    source_evidence_digest: 'a'.repeat(64),
    review_state: 'unreviewed',
    retention_mode: 'owner-controlled'
  });
  return createLocalContextSemanticStateRecord(value, trust);
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
  throw new Error('Unable to reserve four adjacent local test ports');
}

async function api(base, token, path, {
  method = 'GET',
  body,
  idempotencyKey = `semantic-native-${randomUUID()}`
} = {}, expectedStatus = 200) {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: {
      authorization: `Bearer ${token}`,
      accept: 'application/json',
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      ...(method === 'GET' ? {} : { 'idempotency-key': idempotencyKey })
    },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const payload = await response.json();
  assert.equal(response.status, expectedStatus, JSON.stringify(payload));
  return payload;
}

async function fixture(t) {
  const dataDir = await mkdtemp(join(tmpdir(), 'axiom-context-semantic-native-'));
  const basePort = await findPortBlock();
  const token = `operator-${'o'.repeat(40)}`;
  const overrides = {
    dataDir,
    environment: 'test',
    autoBootstrap: true,
    gatewayPort: basePort,
    hypervisorPort: basePort + 1,
    sandboxPort: basePort + 2,
    gridPort: basePort + 3,
    gatewayUrl: `http://127.0.0.1:${basePort}`,
    hypervisorUrl: `http://127.0.0.1:${basePort + 1}`,
    sandboxUrl: `http://127.0.0.1:${basePort + 2}`,
    gridUrl: `http://127.0.0.1:${basePort + 3}`,
    rateLimitCapacity: 1_000,
    rateLimitRefillPerSecond: 1_000,
    apiTokens: {
      [token]: {
        id: OWNER,
        type: 'human',
        roles: ['administrator'],
        scopes: ['*']
      }
    }
  };
  const stack = await startDevelopmentStack(overrides);
  t.after(async () => {
    try {
      await stack.stop();
    } finally {
      await rm(dataDir, { recursive: true, force: true });
    }
  });
  return {
    stack,
    token,
    gateway: `http://127.0.0.1:${basePort}`,
    store: stack.services.find(service => service.name === 'grid').store
  };
}

async function persistNative(fx, semanticState) {
  return api(fx.gateway, fx.token, '/v1/intents', {
    method: 'POST',
    body: {
      action: 'memory.put',
      input: projectLocalContextSemanticStateMemoryPut(semanticState)
    }
  });
}

function persistDirect(store, semanticState, traceId) {
  const input = projectLocalContextSemanticStateMemoryPut(semanticState);
  const execution = executeBuiltin({
    tool: 'builtin.validate-mutation',
    intent: {
      action: 'memory.put',
      principal: { id: OWNER, type: 'human' },
      input
    }
  });
  return store.appendEvents({
    traceId,
    actor: OWNER,
    events: [execution.mutation]
  })[0];
}

test('real four-service memory.put proves exact semantic native ingestion without granting new authority', async t => {
  const fx = await fixture(t);
  const semanticState = state('claim.semantic.native.real');
  await persistNative(fx, semanticState);

  const evidence = verifyLocalContextSemanticNativeIngestionFromGrid(fx.store, {
    state: semanticState
  });
  assert.equal(evidence.owner_subject_ref, OWNER);
  assert.equal(evidence.state_digest, semanticState.state_digest);
  assert.equal(evidence.native_ingestion_verified, true);
  assert.equal(evidence.full_grid_chain_verified, true);
  assert.equal(evidence.downstream_effect_authorized, false);
});

test('direct Grid append is storage evidence but not native semantic ingestion evidence', async t => {
  const fx = await fixture(t);
  const semanticState = state('claim.semantic.native.direct');
  persistDirect(fx.store, semanticState, 'trace.semantic.native.direct');

  assert.throws(
    () => verifyLocalContextSemanticNativeIngestionFromGrid(fx.store, {
      state: semanticState
    }),
    error => error?.code === 'context_semantic_native_ingestion_missing'
  );
});

test('later native write cannot post-hoc certify a semantic state whose first birth was direct', async t => {
  const fx = await fixture(t);
  const semanticState = state('claim.semantic.native.posthoc');
  persistDirect(fx.store, semanticState, 'trace.semantic.native.posthoc.direct');
  await persistNative(fx, semanticState);

  assert.throws(
    () => verifyLocalContextSemanticNativeIngestionFromGrid(fx.store, {
      state: semanticState
    }),
    error => error?.code === 'context_semantic_native_ingestion_missing'
  );
});
