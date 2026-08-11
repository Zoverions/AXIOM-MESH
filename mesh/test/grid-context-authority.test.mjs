import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { GridStore } from '../src/grid/store.mjs';
import { compileAuthorizedGridContextView } from '../src/grid/context.mjs';
import { ensureMeshIdentity } from '../src/lib/identity.mjs';
import { loadDataProtector } from '../src/lib/protector.mjs';
import { contextClaimMemoryPutPayload } from '../src/lib/sovereign-context.mjs';

const AS_OF = '2026-08-11T20:00:00.000Z';

async function fixture(t) {
  const dataDir = await mkdtemp(join(tmpdir(), 'axiom-grid-context-authority-'));
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

function claim({
  id = 'claim:authority-priority',
  owner = 'person:context-owner',
  principals = [owner],
  scopes = ['context:project']
} = {}) {
  return {
    schema: 'axiom-context-claim.v1',
    claim_id: id,
    owner,
    subject: 'project.axiom',
    predicate: 'project.priority',
    value: 'security-first',
    claim_type: 'decision',
    cardinality: 'single',
    confidence_ppm: 1_000_000,
    source: {
      type: 'human',
      ref: `conversation:${id}`,
      digest: '1'.repeat(64),
      observed_at: '2026-08-11T18:00:00.000Z'
    },
    validity: {
      from: '2026-08-11T18:00:00.000Z',
      until: null
    },
    disclosure: {
      principals,
      purposes: ['project.execution'],
      scopes
    },
    sensitivity: 'internal',
    supersedes: [],
    contradicts: [],
    authority_effect: 'none'
  };
}

function appendClaim(store, contextClaim) {
  const payload = contextClaimMemoryPutPayload(contextClaim);
  store.appendEvents({
    traceId: `trace_${contextClaim.claim_id.replace(/[^A-Za-z0-9_.:-]/g, '_')}`,
    actor: contextClaim.owner,
    events: [{
      kind: 'memory.put',
      subject: payload.object_id,
      payload
    }]
  });
}

test('Grid context projection uses authenticated finite context scopes and binds authorization', async t => {
  const store = await fixture(t);
  appendClaim(store, claim());
  const principal = {
    id: 'person:context-owner',
    type: 'human',
    roles: ['operator'],
    scopes: ['audit:read', 'context:project']
  };

  const first = compileAuthorizedGridContextView(store, {
    principal,
    purpose: 'project.execution',
    asOf: AS_OF
  });
  const second = compileAuthorizedGridContextView(store, {
    principal,
    purpose: 'project.execution',
    asOf: AS_OF
  });

  assert.equal(first.usable_claims.length, 1);
  assert.equal(first.authorization.scope_mode, 'finite-authenticated-scopes');
  assert.deepEqual(first.authorization.context_scopes, ['context:project']);
  assert.deepEqual(first.authorization.projected_context_scopes, ['context:project']);
  assert.ok(!first.scopes.includes('audit:read'));
  assert.equal(first.projection_digest, second.projection_digest);
  assert.match(first.projection_digest, /^[a-f0-9]{64}$/);
  assert.equal(first.authority_effect, 'none');
});

test('authenticated wildcard scope is projected as the finite visible context-scope universe', async t => {
  const store = await fixture(t);
  appendClaim(store, claim({ scopes: ['context:project', 'context:profile'] }));

  const view = compileAuthorizedGridContextView(store, {
    principal: {
      id: 'person:context-owner',
      type: 'human',
      roles: ['administrator'],
      scopes: ['*']
    },
    purpose: 'project.execution',
    asOf: AS_OF
  });

  assert.deepEqual(
    view.authorization.projected_context_scopes,
    ['context:profile', 'context:project']
  );
  assert.ok(!view.scopes.includes('*'));
  assert.equal(view.usable_claims.length, 1);
});

test('machine purpose constraints are enforced before Grid context is disclosed', async t => {
  const store = await fixture(t);
  appendClaim(store, claim({ principals: ['agent:planner'] }));

  assert.throws(
    () => compileAuthorizedGridContextView(store, {
      principal: {
        schema: 'axiom-machine-principal.v1',
        id: 'agent:planner',
        type: 'agent',
        scopes: ['context:project'],
        authority_digest: 'a'.repeat(64),
        constraints: { purposes: ['project.execution'] }
      },
      owner: 'person:context-owner',
      purpose: 'personal.profile',
      asOf: AS_OF
    }),
    error => error.code === 'machine_purpose_denied' && error.status === 403
  );
});

test('memory consent remains a ceiling even when claim disclosure and context scope permit a reader', async t => {
  const store = await fixture(t);
  appendClaim(store, claim({ principals: ['person:reader'] }));

  const view = compileAuthorizedGridContextView(store, {
    principal: {
      id: 'person:reader',
      type: 'human',
      roles: [],
      scopes: ['context:project']
    },
    owner: 'person:context-owner',
    purpose: 'project.execution',
    asOf: AS_OF
  });

  assert.equal(view.evidence.visible_context_objects, 0);
  assert.equal(view.usable_claims.length, 0);
  assert.equal(view.summary.eligible_claims, 0);
});
