import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { sha256 } from '../src/lib/canonical.mjs';
import { projectExecutionMutationEvent } from '../src/lib/execution-mutation.mjs';
import { ensureMeshIdentity } from '../src/lib/identity.mjs';
import { loadDataProtector } from '../src/lib/protector.mjs';
import { GridStore } from '../src/grid/store.mjs';

async function fixture(t) {
  const dataDir = await mkdtemp(join(tmpdir(), 'axiom-event-projection-'));
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

function acceptedEvent(intentId) {
  return {
    kind: 'intent.accepted',
    subject: intentId,
    payload: {
      intent_id: intentId,
      principal: 'person:event-projection',
      action: 'system.echo',
      risk: 'low',
      input_digest: sha256('projection-input'),
      request_digest: sha256('projection-request')
    }
  };
}

test('Sandbox mutation projection strips every ledger-envelope field', () => {
  const projected = projectExecutionMutationEvent({
    kind: 'memory.put',
    subject: 'memory_projection_0001',
    payload: { owner: 'owner.projection', value: 'safe' },
    event_id: 'evt_attacker_selected',
    actor: 'attacker',
    occurred_at: '1900-01-01T00:00:00.000Z',
    trace_id: 'trace_attacker',
    seq: 999,
    prev_hash: 'f'.repeat(64),
    event_hash: 'e'.repeat(64),
    signature: { attacker: true }
  }, {
    plan_digest: 'a'.repeat(64),
    execution: { statement: { ok: true } }
  });

  assert.deepEqual(Object.keys(projected).sort(), ['kind', 'payload', 'subject']);
  assert.equal(projected.kind, 'memory.put');
  assert.equal(projected.subject, 'memory_projection_0001');
  assert.deepEqual(projected.payload, {
    owner: 'owner.projection',
    value: 'safe',
    evidence: {
      plan_digest: 'a'.repeat(64),
      execution: { statement: { ok: true } }
    }
  });
  assert.equal(Object.hasOwn(projected, 'event_id'), false);
  assert.equal(Object.hasOwn(projected, 'actor'), false);
  assert.equal(Object.hasOwn(projected, 'occurred_at'), false);
});

test('supported Grid boundary projects caller events to supported input fields', async t => {
  const store = await fixture(t);
  const intentId = 'intent_event_projection_0001';
  const raw = {
    ...acceptedEvent(intentId),
    event_id: 'evt_projection_explicit_0001',
    actor: 'attacker',
    occurred_at: '1900-01-01T00:00:00.000Z',
    trace_id: 'trace_attacker',
    seq: 999,
    prev_hash: 'f'.repeat(64),
    event_hash: 'e'.repeat(64),
    signature: { attacker: true },
    arbitrary_top_level_metadata: { attacker: true }
  };

  const [committed] = store.appendEvents({
    traceId: 'trace_event_projection_0001',
    actor: 'person:event-projection',
    events: [raw]
  });

  assert.equal(committed.event_id, 'evt_projection_explicit_0001');
  assert.equal(committed.actor, 'person:event-projection');
  assert.equal(committed.trace_id, 'trace_event_projection_0001');
  assert.notEqual(committed.occurred_at, raw.occurred_at);
  assert.notEqual(committed.prev_hash, raw.prev_hash);
  assert.notEqual(committed.event_hash, raw.event_hash);
  assert.equal(Object.hasOwn(committed, 'arbitrary_top_level_metadata'), false);
  assert.equal(store.verifyFullChain().valid, true);
});
