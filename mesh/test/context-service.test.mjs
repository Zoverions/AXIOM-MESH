import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { GridStore } from '../src/grid/store.mjs';
import { projectAuthenticatedContext } from '../src/grid/context-service.mjs';
import { ensureMeshIdentity } from '../src/lib/identity.mjs';
import { loadDataProtector } from '../src/lib/protector.mjs';
import { contextClaimMemoryPutPayload } from '../src/lib/sovereign-context.mjs';
import { buildContextProjectionRequest } from '../src/lib/context-projection-request.mjs';

const AS_OF = '2026-08-11T20:00:00.000Z';

async function fixture(t) {
  const dataDir = await mkdtemp(join(tmpdir(), 'axiom-context-service-'));
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

function contextClaim() {
  return {
    schema: 'axiom-context-claim.v1',
    claim_id: 'claim:service-priority',
    owner: 'person:context-owner',
    subject: 'project.axiom',
    predicate: 'project.priority',
    value: 'security-first',
    claim_type: 'decision',
    cardinality: 'single',
    confidence_ppm: 1_000_000,
    source: {
      type: 'human',
      ref: 'conversation:context-service-1',
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
  const payload = contextClaimMemoryPutPayload(contextClaim());
  store.appendEvents({
    traceId: 'trace_context_service_0001',
    actor: payload.owner,
    events: [{ kind: 'memory.put', subject: payload.object_id, payload }]
  });
}

function request() {
  return buildContextProjectionRequest({
    principal: {
      id: 'person:context-owner',
      type: 'human',
      roles: ['operator'],
      scopes: ['context:project']
    },
    purpose: 'project.execution',
    asOf: AS_OF
  }).request;
}

test('Grid projection service accepts only Gateway-authenticated requests', async t => {
  const store = await fixture(t);
  appendClaim(store);

  assert.throws(
    () => projectAuthenticatedContext(store, request(), { callerService: 'hypervisor' }),
    error => error.code === 'forbidden' && error.status === 403
  );

  const view = projectAuthenticatedContext(store, request(), { callerService: 'gateway' });
  assert.equal(view.schema, 'axiom-context-projection.v1');
  assert.equal(view.usable_claims.length, 1);
  assert.equal(view.request.purpose, 'project.execution');
  assert.equal(view.authority_effect, 'none');
});

test('Grid projection service rejects scope injection before context compilation', async t => {
  const store = await fixture(t);
  appendClaim(store);

  assert.throws(
    () => projectAuthenticatedContext(store, {
      ...request(),
      scopes: ['context:restricted']
    }, { callerService: 'gateway' }),
    /fields are invalid/
  );
});
