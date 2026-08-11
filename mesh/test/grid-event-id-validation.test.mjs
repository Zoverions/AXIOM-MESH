import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { sha256 } from '../src/lib/canonical.mjs';
import { ensureMeshIdentity } from '../src/lib/identity.mjs';
import { loadDataProtector } from '../src/lib/protector.mjs';
import { GridStore } from '../src/grid/store.mjs';

const EVENT_ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/;

function acceptedEvent(index, eventIdMarker) {
  const intentId = `intent_event_id_validation_${index}`;
  return {
    ...(eventIdMarker === undefined ? {} : { event_id: eventIdMarker }),
    kind: 'intent.accepted',
    subject: intentId,
    payload: {
      intent_id: intentId,
      principal: 'person:event-id-validation',
      action: 'system.echo',
      risk: 'low',
      input_digest: sha256(`input-${index}`),
      request_digest: sha256(`request-${index}`)
    }
  };
}

async function fixture(t) {
  const dataDir = await mkdtemp(join(tmpdir(), 'axiom-event-id-'));
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

function eventCount(store) {
  return Number(store.db.prepare('SELECT COUNT(*) AS count FROM events').get().count);
}

test('explicit and generated Grid event ids satisfy the supported identifier grammar', async t => {
  const store = await fixture(t);
  const explicitId = 'evt_explicit_validation_0001';
  const [explicit] = store.appendEvents({
    traceId: 'trace_event_id_explicit_0001',
    actor: 'person:event-id-validation',
    events: [acceptedEvent(1, explicitId)]
  });
  assert.equal(explicit.event_id, explicitId);
  assert.match(explicit.event_id, EVENT_ID);

  const [generated] = store.appendEvents({
    traceId: 'trace_event_id_generated_0001',
    actor: 'person:event-id-validation',
    events: [acceptedEvent(2)]
  });
  assert.match(generated.event_id, EVENT_ID);
  assert.match(generated.event_id, /^evt_/);
  assert.equal(eventCount(store), 2);
  assert.equal(store.verifyFullChain().valid, true);
});

test('malformed caller-supplied event ids fail before any event or materialized state is appended', async t => {
  const store = await fixture(t);
  const invalidIds = [
    '',
    null,
    '../escape',
    'bad/id',
    'bad id',
    `bad\u0000id`,
    '-bad-start',
    'x'.repeat(161)
  ];

  for (const [index, eventId] of invalidIds.entries()) {
    assert.throws(
      () => store.appendEvents({
        traceId: `trace_event_id_invalid_${String(index).padStart(4, '0')}`,
        actor: 'person:event-id-validation',
        events: [acceptedEvent(index + 10, eventId)]
      }),
      /event_id|string|match|characters|pattern|length/i
    );
    assert.equal(eventCount(store), 0);
    assert.equal(store.getStatus().last_seq, 0);
  }
});

test('a malformed id anywhere in a batch prevents every event in that batch from being appended', async t => {
  const store = await fixture(t);
  assert.throws(
    () => store.appendEvents({
      traceId: 'trace_event_id_atomic_batch_0001',
      actor: 'person:event-id-validation',
      events: [
        acceptedEvent(100, 'evt_valid_batch_0001'),
        acceptedEvent(101, 'invalid/path')
      ]
    }),
    /event_id|match|pattern|characters/i
  );
  assert.equal(eventCount(store), 0);
  assert.equal(store.getStatus().last_seq, 0);
});

test('duplicate valid event ids retain the existing state-conflict behavior', async t => {
  const store = await fixture(t);
  const eventId = 'evt_duplicate_validation_0001';
  store.appendEvents({
    traceId: 'trace_event_id_duplicate_first_0001',
    actor: 'person:event-id-validation',
    events: [acceptedEvent(200, eventId)]
  });

  assert.throws(
    () => store.appendEvents({
      traceId: 'trace_event_id_duplicate_second_0001',
      actor: 'person:event-id-validation',
      events: [acceptedEvent(201, eventId)]
    }),
    error => error.code === 'state_conflict' && error.status === 409
  );
  assert.equal(eventCount(store), 1);
  assert.equal(store.getStatus().last_seq, 1);
  assert.equal(store.verifyFullChain().valid, true);
});
