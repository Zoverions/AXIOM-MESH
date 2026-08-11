import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { GridStore } from '../src/grid/store.mjs';
import { readMemoryOrContext } from '../src/grid/context-memory-route.mjs';
import { ensureMeshIdentity } from '../src/lib/identity.mjs';
import { loadDataProtector } from '../src/lib/protector.mjs';
import { contextClaimMemoryPutPayload } from '../src/lib/sovereign-context.mjs';
import { buildContextProjectionGridTarget } from '../src/lib/context-projection-target.mjs';

const AS_OF = '2026-08-11T20:00:00.000Z';

async function fixture(t) {
  const dataDir = await mkdtemp(join(tmpdir(), 'axiom-context-memory-route-'));
  const identity = await ensureMeshIdentity(dataDir, 'grid', { create: true });
  const protector = await loadDataProtector({ dataDir, autoBootstrap: true });
  const store = new GridStore({
    path: join(dataDir, 'grid.sqlite'),
    dataDir,
    identity,
    protector,
    checkpointInterval: 10_000
  });
  t.after(async () => {
    try { store.close(); } catch {}
    await rm(dataDir, { recursive: true, force: true });
  });
  return store;
}

function claim() {
  return {
    schema: 'axiom-context-claim.v1',
    claim_id: 'claim:memory-route-priority',
    owner: 'person:context-owner',
    subject: 'project.axiom',
    predicate: 'project.priority',
    value: 'security-first',
    claim_type: 'decision',
    cardinality: 'single',
    confidence_ppm: 1_000_000,
    source: {
      type: 'human',
      ref: 'conversation:memory-route-1',
      digest: '1'.repeat(64),
      observed_at: '2026-08-11T18:00:00.000Z'
    },
    validity: { from: '2026-08-11T18:00:00.000Z', until: null },
    disclosure: {
      principals: ['person:context-owner'],
      purposes: ['project.execution'],
      scopes: ['context:project']
    },
    sensitivity: 'internal',
    supersedes: [],
    contradicts: [],
    authority_effect: 'none'
  };
}

function appendClaim(store) {
  const payload = contextClaimMemoryPutPayload(claim());
  store.appendEvents({
    traceId: 'trace_context_memory_route_0001',
    actor: payload.owner,
    events: [{ kind: 'memory.put', subject: payload.object_id, payload }]
  });
}

function projectionUrl() {
  return new URL(buildContextProjectionGridTarget({
    gridUrl: 'http://127.0.0.1:8083',
    principal: {
      id: 'person:context-owner',
      type: 'human',
      roles: ['operator'],
      scopes: ['context:project']
    },
    purpose: 'project.execution',
    asOf: AS_OF,
    maxClaims: 64
  }).target);
}

test('ordinary Grid memory reads retain their existing behavior', async t => {
  const store = await fixture(t);
  appendClaim(store);
  const url = new URL(
    'http://grid.invalid/internal/v1/memory/person%3Acontext-owner'
      + '?requester=person%3Acontext-owner'
  );
  const graph = readMemoryOrContext(store, {
    owner: 'person:context-owner',
    url,
    callerService: 'gateway'
  });
  assert.equal(graph.owner, 'person:context-owner');
  assert.equal(graph.objects.length, 1);
  assert.equal(graph.objects[0].kind, 'context.claim');
});

test('context projection mode returns verified non-authorizing context for Gateway', async t => {
  const store = await fixture(t);
  appendClaim(store);
  const view = readMemoryOrContext(store, {
    owner: 'person:context-owner',
    url: projectionUrl(),
    callerService: 'gateway'
  });
  assert.equal(view.schema, 'axiom-context-projection.v1');
  assert.equal(view.usable_claims.length, 1);
  assert.equal(view.usable_claims[0].claim_id, 'claim:memory-route-priority');
  assert.equal(view.authority_effect, 'none');
  assert.equal(view.request.purpose, 'project.execution');
  assert.match(view.projection_digest, /^[a-f0-9]{64}$/);
});

test('context projection mode refuses non-Gateway service callers', async t => {
  const store = await fixture(t);
  appendClaim(store);
  assert.throws(
    () => readMemoryOrContext(store, {
      owner: 'person:context-owner',
      url: projectionUrl(),
      callerService: 'hypervisor'
    }),
    error => error.code === 'forbidden' && error.status === 403
  );
});

test('context projection mode rejects authority-envelope tampering', async t => {
  const store = await fixture(t);
  appendClaim(store);
  const url = projectionUrl();
  const encoded = url.searchParams.get('authority');
  const decoded = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
  decoded.purpose = 'personal.profile';
  url.searchParams.set(
    'authority',
    Buffer.from(JSON.stringify(decoded), 'utf8').toString('base64url')
  );
  assert.throws(
    () => readMemoryOrContext(store, {
      owner: 'person:context-owner',
      url,
      callerService: 'gateway'
    }),
    /authority digest is invalid/
  );
});
