import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { CIRCLE_INVITATION_SCHEMA } from '../src/lib/circle-core.mjs';
import { digestObject } from '../src/lib/canonical.mjs';
import { ensureMeshIdentity } from '../src/lib/identity.mjs';
import { loadDataProtector } from '../src/lib/protector.mjs';
import { CircleGridStore } from '../src/grid/circle-store.mjs';
import {
  CIRCLE_GRID_PERSISTENCE_EVENT_KIND,
  getCircleGridPersistencePolicy
} from '../src/grid/circle-persistence-state.mjs';

const CIRCLE_ID = 'circle.projection.integrity';
const ACTOR = 'human.projection';
const CHARTER_DIGEST = digestObject({ schema: 'test-charter.v0', circle_id: CIRCLE_ID });
const HISTORICAL_POLICY_DIGEST = digestObject({ schema: 'test-historical-policy.v0' });
const CHARTER_POLICY_DIGEST = digestObject({ schema: 'test-charter-policy.v0' });

function eventFor(index, previous = null) {
  const policy = getCircleGridPersistencePolicy();
  const issuedAt = new Date(Date.UTC(2026, 7, 20, 14, index * 2)).toISOString();
  const boundAt = new Date(Date.UTC(2026, 7, 20, 14, index * 2 + 1)).toISOString();
  const invitationId = `invite.projection.${index}`;
  const bindingId = `binding.projection.${index}`;
  const record = {
    schema: CIRCLE_INVITATION_SCHEMA,
    invitation_id: invitationId,
    circle_id: CIRCLE_ID,
    invited_principal: `human.member.${index}`,
    membership_class: 'member',
    role_ids: ['member'],
    issued_by: ACTOR,
    issued_at: issuedAt,
    expires_at: new Date(Date.UTC(2026, 7, 21, 14, index)).toISOString(),
    charter_digest: CHARTER_DIGEST,
    one_use: true,
    authority_effect: 'none'
  };
  const binding = {
    schema: 'axiom-circle-historical-rule-binding.v0',
    binding_id: bindingId,
    circle_id: CIRCLE_ID,
    record_type: 'invitation',
    record_id: invitationId,
    record_digest: digestObject(record),
    record,
    event_time: issuedAt,
    bound_at: boundAt,
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
    circle_id: CIRCLE_ID,
    binding_digest: bindingDigest
  });
  const payload = {
    schema: policy.schemas.payload,
    circle_id: CIRCLE_ID,
    binding_id: bindingId,
    binding_digest: bindingDigest,
    binding,
    record_type: 'invitation',
    record_id: invitationId,
    record_digest: binding.record_digest,
    governing_charter_digest: CHARTER_DIGEST,
    previous_circle_binding_digest: previous,
    resulting_circle_head_digest: bindingDigest,
    historical_ledger_prefix_digest: digestObject({ index, bindingDigest }),
    historical_ledger_prefix_length: index,
    charter_lifecycle_prefix_digest: digestObject({ charter: CHARTER_DIGEST }),
    charter_lifecycle_prefix_length: 1,
    persistence_policy_digest: digestObject(policy),
    historical_policy_digest: HISTORICAL_POLICY_DIGEST,
    charter_policy_digest: CHARTER_POLICY_DIGEST,
    runtime_authority: false,
    portable_authority: false,
    authority_effect: 'none',
    network_effect: 'none'
  };
  return {
    raw: {
      event_id: `${policy.event_id_prefix}${eventIdentityDigest}`,
      kind: CIRCLE_GRID_PERSISTENCE_EVENT_KIND,
      subject: CIRCLE_ID,
      payload
    },
    bindingDigest
  };
}

async function fixture(t) {
  const dataDir = await mkdtemp(join(tmpdir(), 'axiom-circle-projection-integrity-'));
  const identity = await ensureMeshIdentity(dataDir, 'grid', { create: true });
  const protector = await loadDataProtector({ dataDir, autoBootstrap: true });
  const store = new CircleGridStore({
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

function append(store, raw, suffix) {
  return store.appendEvents({
    traceId: `trace_projection_integrity_${suffix}`,
    actor: ACTOR,
    events: [raw]
  })[0];
}

function eventCount(store) {
  return Number(store.db.prepare('SELECT COUNT(*) AS count FROM events').get().count);
}

test('projection drift cannot authorize replay or a new child and is rebuildable from signed events', async t => {
  const store = await fixture(t);
  const root = eventFor(1);
  append(store, root.raw, 'root');
  assert.equal(eventCount(store), 1);

  store.db.prepare(`
    UPDATE circle_persistence_heads
    SET head_binding_id = ?
    WHERE circle_id = ?
  `).run('binding.projection.tampered', CIRCLE_ID);

  assert.throws(
    () => store.getCirclePersistenceHead(CIRCLE_ID),
    error => error.code === 'circle_persistence_projection_drift' && error.status === 503
  );
  assert.throws(
    () => append(store, structuredClone(root.raw), 'replay_after_drift'),
    error => error.code === 'circle_persistence_projection_drift' && error.status === 503
  );

  const child = eventFor(2, root.bindingDigest);
  assert.throws(
    () => append(store, child.raw, 'child_after_drift'),
    error => error.code === 'circle_persistence_projection_drift' && error.status === 503
  );
  assert.equal(eventCount(store), 1);

  store.rebuildCirclePersistenceMaterializedState();
  const repaired = store.getCirclePersistenceHead(CIRCLE_ID);
  assert.equal(repaired.head_binding_digest, root.bindingDigest);
  assert.equal(repaired.head_binding_id, root.raw.payload.binding_id);
  assert.equal(eventCount(store), 1);
  assert.equal(store.verifyFullChain().valid, true);
});
