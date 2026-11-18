import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  CIRCLE_INVITATION_SCHEMA
} from '../src/lib/circle-core.mjs';
import { digestObject } from '../src/lib/canonical.mjs';
import { ensureMeshIdentity } from '../src/lib/identity.mjs';
import { loadDataProtector } from '../src/lib/protector.mjs';
import {
  CircleGridStore,
  getCircleGridHeadCasPolicy
} from '../src/grid/circle-store.mjs';
import {
  CIRCLE_GRID_PERSISTENCE_EVENT_KIND,
  getCircleGridPersistencePolicy,
  validateCircleGridHeadCasPolicy
} from '../src/grid/circle-persistence-state.mjs';

const CIRCLE_ID = 'circle.cas';
const ACTOR = 'human.alpha';
const CHARTER_DIGEST = digestObject({ schema: 'test-charter.v0', circle_id: CIRCLE_ID });
const HISTORICAL_POLICY_DIGEST = digestObject({ schema: 'test-historical-policy.v0' });
const CHARTER_POLICY_DIGEST = digestObject({ schema: 'test-charter-policy.v0' });

function bindingTime(index) {
  return new Date(Date.UTC(2026, 7, 20, 12, index * 2)).toISOString();
}

function boundTime(index) {
  return new Date(Date.UTC(2026, 7, 20, 12, index * 2 + 1)).toISOString();
}

function buildCirclePersistenceEvent({ index, previous = null, circleId = CIRCLE_ID } = {}) {
  const persistencePolicy = getCircleGridPersistencePolicy();
  const invitationId = `invite.cas.${index}`;
  const bindingId = `binding.invitation.cas.${index}`;
  const record = {
    schema: CIRCLE_INVITATION_SCHEMA,
    invitation_id: invitationId,
    circle_id: circleId,
    invited_principal: `human.member.${index}`,
    membership_class: 'member',
    role_ids: ['member'],
    issued_by: ACTOR,
    issued_at: bindingTime(index),
    expires_at: new Date(Date.UTC(2026, 7, 21, 12, index)).toISOString(),
    charter_digest: CHARTER_DIGEST,
    one_use: true,
    authority_effect: 'none'
  };
  const binding = {
    schema: 'axiom-circle-historical-rule-binding.v0',
    binding_id: bindingId,
    circle_id: circleId,
    record_type: 'invitation',
    record_id: invitationId,
    record_digest: digestObject(record),
    record,
    event_time: bindingTime(index),
    bound_at: boundTime(index),
    previous_binding_digest: previous,
    basis_binding_id: null,
    binding_mode: 'resolve-at-event',
    governing_charter_digest: CHARTER_DIGEST,
    authority_effect: 'none',
    network_effect: 'none',
    runtime_activation: false
  };
  const bindingDigest = digestObject(binding);
  const eventIdentityDigest = digestObject({
    schema: 'axiom-circle-grid-persistence-event-identity.v0',
    circle_id: circleId,
    binding_digest: bindingDigest
  });
  const historicalLedgerPrefixDigest = digestObject({
    schema: 'test-circle-historical-prefix.v0',
    circle_id: circleId,
    length: index,
    head_binding_digest: bindingDigest
  });
  const charterLifecyclePrefixDigest = digestObject({
    schema: 'test-circle-charter-prefix.v0',
    circle_id: circleId,
    charter_digest: CHARTER_DIGEST
  });
  const payload = {
    schema: persistencePolicy.schemas.payload,
    circle_id: circleId,
    binding_id: bindingId,
    binding_digest: bindingDigest,
    binding,
    record_type: binding.record_type,
    record_id: binding.record_id,
    record_digest: binding.record_digest,
    governing_charter_digest: CHARTER_DIGEST,
    previous_circle_binding_digest: previous,
    resulting_circle_head_digest: bindingDigest,
    historical_ledger_prefix_digest: historicalLedgerPrefixDigest,
    historical_ledger_prefix_length: index,
    charter_lifecycle_prefix_digest: charterLifecyclePrefixDigest,
    charter_lifecycle_prefix_length: 1,
    persistence_policy_digest: digestObject(persistencePolicy),
    historical_policy_digest: HISTORICAL_POLICY_DIGEST,
    charter_policy_digest: CHARTER_POLICY_DIGEST,
    runtime_authority: false,
    portable_authority: false,
    authority_effect: 'none',
    network_effect: 'none'
  };
  return {
    raw: {
      event_id: `${persistencePolicy.event_id_prefix}${eventIdentityDigest}`,
      kind: CIRCLE_GRID_PERSISTENCE_EVENT_KIND,
      subject: circleId,
      payload
    },
    binding,
    bindingDigest
  };
}

async function createFixture(t) {
  const dataDir = await mkdtemp(join(tmpdir(), 'axiom-circle-grid-cas-'));
  const path = join(dataDir, 'grid.sqlite');
  const identity = await ensureMeshIdentity(dataDir, 'grid', { create: true });
  const protector = await loadDataProtector({ dataDir, autoBootstrap: true });
  const stores = [];

  function openStore() {
    const store = new CircleGridStore({
      path,
      dataDir,
      identity,
      protector,
      checkpointInterval: 10_000
    });
    stores.push(store);
    return store;
  }

  t.after(async () => {
    for (const store of stores) {
      try { store.close(); } catch {}
    }
    await rm(dataDir, { recursive: true, force: true });
  });

  return { dataDir, path, identity, protector, stores, openStore };
}

function eventCount(store) {
  return Number(store.db.prepare('SELECT COUNT(*) AS count FROM events').get().count);
}

function headCount(store) {
  return Number(
    store.db.prepare('SELECT COUNT(*) AS count FROM circle_persistence_heads').get().count
  );
}

function append(store, raw, suffix) {
  return store.appendEvents({
    traceId: `trace_circle_cas_${suffix}`,
    actor: ACTOR,
    events: [raw]
  })[0];
}

test('head CAS policy is exact, inert, and exposes no public authority surface', async () => {
  const policy = getCircleGridHeadCasPolicy();
  assert.equal(validateCircleGridHeadCasPolicy(policy), true);
  assert.equal(policy.runtime_activation, false);
  assert.equal(policy.requirements.atomic_head_compare_and_set_inside_grid_transaction, true);
  assert.equal(policy.requirements.projection_rebuilt_from_signed_grid_events, true);
  assert.equal(policy.requirements.public_grid_route, false);
  assert.equal(policy.requirements.gateway_route, false);
  assert.equal(policy.requirements.hypervisor_action, false);
  assert.equal(policy.requirements.runtime_authority, false);
  assert.equal(policy.requirements.portable_authority, false);

  const server = await readFile(new URL('../src/grid/server.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(server, /CircleGridStore|circle-store\.mjs|circle\.historical\.binding\.persist\.requested/);
});

test('Circle persistence projection migration is checksum-tracked and strict', async t => {
  const fixture = await createFixture(t);
  const store = fixture.openStore();
  assert.equal(store.getStatus().circle_persistence_schema_version, 1);
  assert.equal(store.getStatus().circle_persistence_internal_projection, true);
  assert.equal(store.getStatus().circle_persistence_public_route, false);

  const migration = store.db.prepare(`
    SELECT version, name, checksum
    FROM circle_persistence_schema_migrations
  `).get();
  assert.equal(migration.version, 1);
  assert.equal(migration.name, 'durable-circle-head-projection');
  assert.match(migration.checksum, /^[a-f0-9]{64}$/);

  const columns = store.db.prepare('PRAGMA table_info(circle_persistence_heads)').all()
    .map(column => column.name);
  assert.deepEqual(columns, [
    'circle_id',
    'head_binding_digest',
    'head_binding_id',
    'head_record_type',
    'head_record_id',
    'event_id',
    'event_seq',
    'updated_at'
  ]);
});

test('first Circle binding appends to the signed Grid and atomically becomes the durable head', async t => {
  const fixture = await createFixture(t);
  const store = fixture.openStore();
  const root = buildCirclePersistenceEvent({ index: 1 });
  const event = append(store, root.raw, 'root');

  assert.equal(event.event_id, root.raw.event_id);
  assert.equal(event.kind, CIRCLE_GRID_PERSISTENCE_EVENT_KIND);
  assert.equal(event.payload_digest, digestObject(root.raw.payload));
  assert.equal(eventCount(store), 1);
  assert.equal(headCount(store), 1);

  const head = store.getCirclePersistenceHead(CIRCLE_ID);
  assert.equal(head.circle_id, CIRCLE_ID);
  assert.equal(head.head_binding_digest, root.bindingDigest);
  assert.equal(head.head_binding_id, root.binding.binding_id);
  assert.equal(head.event_id, event.event_id);
  assert.equal(head.event_seq, event.seq);
  assert.equal(store.verifyFullChain().valid, true);
});

test('exact deterministic replay is idempotent and does not advance Grid or Circle head', async t => {
  const fixture = await createFixture(t);
  const store = fixture.openStore();
  const root = buildCirclePersistenceEvent({ index: 1 });
  const first = append(store, root.raw, 'replay_first');
  const replay = store.appendEvents({
    traceId: 'trace_circle_cas_replay_second',
    actor: 'human.beta',
    events: [structuredClone(root.raw)]
  })[0];

  assert.equal(replay.seq, first.seq);
  assert.equal(replay.event_hash, first.event_hash);
  assert.equal(replay.actor, first.actor);
  assert.equal(eventCount(store), 1);
  assert.equal(store.getCirclePersistenceHead(CIRCLE_ID).head_binding_digest, root.bindingDigest);
});

test('deterministic event id reuse with different content fails closed', async t => {
  const fixture = await createFixture(t);
  const store = fixture.openStore();
  const root = buildCirclePersistenceEvent({ index: 1 });
  append(store, root.raw, 'conflict_first');

  const conflict = structuredClone(root.raw);
  conflict.payload.historical_policy_digest = digestObject({ different: true });
  assert.throws(
    () => append(store, conflict, 'conflict_second'),
    error => error.code === 'circle_persistence_event_conflict' && error.status === 409
  );
  assert.equal(eventCount(store), 1);
  assert.equal(store.getCirclePersistenceHead(CIRCLE_ID).head_binding_digest, root.bindingDigest);
});

test('stale root or skipped predecessor rolls back the entire Grid append', async t => {
  const fixture = await createFixture(t);
  const store = fixture.openStore();
  const root = buildCirclePersistenceEvent({ index: 1 });
  append(store, root.raw, 'stale_root_first');

  const stale = buildCirclePersistenceEvent({ index: 2, previous: null });
  assert.throws(
    () => append(store, stale.raw, 'stale_root_second'),
    error => error.code === 'circle_persistence_head_conflict' && error.status === 409
  );
  assert.equal(eventCount(store), 1);
  assert.equal(store.getStatus().last_seq, 1);
  assert.equal(store.getCirclePersistenceHead(CIRCLE_ID).head_binding_digest, root.bindingDigest);
  assert.equal(store.verifyFullChain().valid, true);
});

test('valid child advances the durable Circle head without granting authority', async t => {
  const fixture = await createFixture(t);
  const store = fixture.openStore();
  const root = buildCirclePersistenceEvent({ index: 1 });
  append(store, root.raw, 'child_root');
  const child = buildCirclePersistenceEvent({ index: 2, previous: root.bindingDigest });
  const childEvent = append(store, child.raw, 'child_next');

  const head = store.getCirclePersistenceHead(CIRCLE_ID);
  assert.equal(head.head_binding_digest, child.bindingDigest);
  assert.equal(head.head_binding_id, child.binding.binding_id);
  assert.equal(head.event_id, childEvent.event_id);
  assert.equal(head.event_seq, 2);
  assert.equal(child.raw.payload.runtime_authority, false);
  assert.equal(child.raw.payload.portable_authority, false);
  assert.equal(eventCount(store), 2);
});

test('two Grid handles serialize competing children and stale writer loses atomically', async t => {
  const fixture = await createFixture(t);
  const firstStore = fixture.openStore();
  const root = buildCirclePersistenceEvent({ index: 1 });
  append(firstStore, root.raw, 'multi_root');

  const secondStore = fixture.openStore();
  const left = buildCirclePersistenceEvent({ index: 2, previous: root.bindingDigest });
  const right = buildCirclePersistenceEvent({ index: 3, previous: root.bindingDigest });
  append(firstStore, left.raw, 'multi_left');

  assert.throws(
    () => append(secondStore, right.raw, 'multi_right'),
    error => error.code === 'circle_persistence_head_conflict' && error.status === 409
  );
  assert.equal(eventCount(firstStore), 2);
  assert.equal(secondStore.getCirclePersistenceHead(CIRCLE_ID).head_binding_digest, left.bindingDigest);
  assert.equal(secondStore.verifyFullChain().valid, true);
});

test('projection is reconstructed from signed Grid events after restart and repairs projection drift', async t => {
  const fixture = await createFixture(t);
  let store = fixture.openStore();
  const root = buildCirclePersistenceEvent({ index: 1 });
  append(store, root.raw, 'restart_root');
  const child = buildCirclePersistenceEvent({ index: 2, previous: root.bindingDigest });
  append(store, child.raw, 'restart_child');

  store.db.prepare(`
    UPDATE circle_persistence_heads
    SET head_binding_digest = ?
    WHERE circle_id = ?
  `).run('f'.repeat(64), CIRCLE_ID);
  assert.equal(
    store.getCirclePersistenceHead(CIRCLE_ID, { verifyChain: false }).head_binding_digest,
    'f'.repeat(64)
  );
  store.close();

  store = fixture.openStore();
  const rebuilt = store.getCirclePersistenceHead(CIRCLE_ID);
  assert.equal(rebuilt.head_binding_digest, child.bindingDigest);
  assert.equal(rebuilt.head_binding_id, child.binding.binding_id);
  assert.equal(eventCount(store), 2);
  assert.equal(store.verifyFullChain().valid, true);
});

test('head reads fail closed when the signed Grid chain is corrupted', async t => {
  const fixture = await createFixture(t);
  const store = fixture.openStore();
  const root = buildCirclePersistenceEvent({ index: 1 });
  append(store, root.raw, 'tamper_root');

  store.db.prepare('UPDATE events SET event_hash = ? WHERE seq = 1').run('f'.repeat(64));
  assert.throws(
    () => store.getCirclePersistenceHead(CIRCLE_ID),
    error => error.code === 'integrity_verification_failed' && error.status === 503
  );
});

test('Circle persistence refuses mixed batches and hidden append fields before Grid mutation', async t => {
  const fixture = await createFixture(t);
  const store = fixture.openStore();
  const root = buildCirclePersistenceEvent({ index: 1 });

  assert.throws(
    () => store.appendEvents({
      traceId: 'trace_circle_cas_mixed',
      actor: ACTOR,
      events: [
        root.raw,
        { kind: 'test.observation', subject: 'test.subject', payload: {} }
      ]
    }),
    /single-event append/
  );

  const hidden = { ...structuredClone(root.raw), hidden: true };
  assert.throws(
    () => append(store, hidden, 'hidden_field'),
    /append event fields are invalid/
  );
  assert.equal(eventCount(store), 0);
  assert.equal(headCount(store), 0);
});
