import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { GridStore } from '../src/grid/store.mjs';
import { compileGridContextView } from '../src/grid/context.mjs';
import { ensureMeshIdentity } from '../src/lib/identity.mjs';
import { loadDataProtector } from '../src/lib/protector.mjs';
import { contextClaimMemoryPutPayload } from '../src/lib/sovereign-context.mjs';

const AS_OF = '2026-08-11T20:00:00.000Z';

async function fixture(t) {
  const dataDir = await mkdtemp(join(tmpdir(), 'axiom-grid-context-'));
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

function contextClaim(overrides = {}) {
  const base = {
    schema: 'axiom-context-claim.v1',
    claim_id: 'claim:grid-priority',
    owner: 'person:context-owner',
    subject: 'project.axiom',
    predicate: 'project.priority',
    value: 'security-first',
    claim_type: 'decision',
    cardinality: 'single',
    confidence_ppm: 1_000_000,
    source: {
      type: 'human',
      ref: 'conversation:grid-context-1',
      digest: '1'.repeat(64),
      observed_at: '2026-08-11T18:00:00.000Z'
    },
    validity: {
      from: '2026-08-11T18:00:00.000Z',
      until: null
    },
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
  return {
    ...base,
    ...overrides,
    source: { ...base.source, ...(overrides.source ?? {}) },
    validity: { ...base.validity, ...(overrides.validity ?? {}) },
    disclosure: { ...base.disclosure, ...(overrides.disclosure ?? {}) }
  };
}

function appendContextMemory(store, claim, {
  actor = claim.owner,
  traceId = `trace_${claim.claim_id.replace(/[^A-Za-z0-9_.:-]/g, '_')}`
} = {}) {
  const payload = contextClaimMemoryPutPayload(claim);
  store.appendEvents({
    traceId,
    actor,
    events: [{
      kind: 'memory.put',
      subject: payload.object_id,
      payload
    }]
  });
  return payload;
}

test('Grid-backed context compilation verifies the full evidence chain and memory content address', async t => {
  const store = await fixture(t);
  const payload = appendContextMemory(store, contextClaim());

  const view = compileGridContextView(store, {
    requester: 'person:context-owner',
    purpose: 'project.execution',
    authorizedScopes: ['context:project'],
    asOf: AS_OF
  });

  assert.equal(view.evidence.grid_chain.valid, true);
  assert.equal(view.evidence.grid_chain.verification_mode, 'full');
  assert.equal(view.evidence.visible_context_objects, 1);
  assert.equal(view.usable_claims[0].claim_id, 'claim:grid-priority');
  assert.equal(payload.object_id, `memory_${payload.content_digest}`);
  assert.equal(view.authority_effect, 'none');
});

test('Grid context compilation requires the evidence actor to match the context owner', async t => {
  const store = await fixture(t);
  appendContextMemory(store, contextClaim(), { actor: 'person:other' });

  assert.throws(
    () => compileGridContextView(store, {
      requester: 'person:context-owner',
      purpose: 'project.execution',
      authorizedScopes: ['context:project'],
      asOf: AS_OF
    }),
    /owner-authenticated Grid evidence/
  );
});

test('Grid context compilation rejects replayed memory.put evidence for one context object', async t => {
  const store = await fixture(t);
  const claim = contextClaim();
  appendContextMemory(store, claim, { traceId: 'trace_context_first' });
  appendContextMemory(store, claim, { traceId: 'trace_context_replay' });

  assert.throws(
    () => compileGridContextView(store, {
      requester: 'person:context-owner',
      purpose: 'project.execution',
      authorizedScopes: ['context:project'],
      asOf: AS_OF
    }),
    /exactly one memory.put evidence event/
  );
});

test('Grid context compilation fails closed when the Grid evidence chain is corrupted', async t => {
  const store = await fixture(t);
  appendContextMemory(store, contextClaim());
  store.db.prepare('UPDATE events SET event_hash = ? WHERE seq = 1').run('f'.repeat(64));

  assert.throws(
    () => compileGridContextView(store, {
      requester: 'person:context-owner',
      purpose: 'project.execution',
      authorizedScopes: ['context:project'],
      asOf: AS_OF
    }),
    error => error.code === 'integrity_verification_failed' && error.status === 503
  );
});

test('existing memory consent remains a hard ceiling on cross-owner context visibility', async t => {
  const store = await fixture(t);
  appendContextMemory(store, contextClaim({
    disclosure: { principals: ['person:context-reader'] }
  }));

  const view = compileGridContextView(store, {
    requester: 'person:context-reader',
    owner: 'person:context-owner',
    purpose: 'project.execution',
    authorizedScopes: ['context:project'],
    asOf: AS_OF
  });

  assert.equal(view.evidence.memory_owner, 'person:context-owner');
  assert.equal(view.evidence.visible_context_objects, 0);
  assert.equal(view.summary.eligible_claims, 0);
  assert.equal(view.usable_claims.length, 0);
});
