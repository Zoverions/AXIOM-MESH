import assert from 'node:assert/strict';
import { generateKeyPairSync, sign } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { canonicalJson, sha256 } from '../src/lib/canonical.mjs';
import { ensureMeshIdentity } from '../src/lib/identity.mjs';
import {
  effectiveScheduleStatus,
  normalizeNodeScheduleRequest
} from '../src/lib/node-scheduling.mjs';
import { verifyNodeAdmission } from '../src/lib/nodes.mjs';
import { loadDataProtector } from '../src/lib/protector.mjs';
import { GridStore } from '../src/grid/store.mjs';

// Scalability audit S-11: schedule status is judged against node load, which
// other requesters' schedules contribute to. Reading only the page and the
// schedules that can carry load must give exactly the status the whole-table
// read gave, and its cost must not grow with expired history.

test('node schedule status reads only load-bearing schedules and matches the whole-table result', async t => {
  const dataDir = await mkdtemp(join(tmpdir(), 'axiom-schedule-scope-'));
  const identity = await ensureMeshIdentity(dataDir, 'grid', { create: true });
  const protector = await loadDataProtector({ dataDir, autoBootstrap: true });
  const store = new GridStore({ path: join(dataDir, 'grid.sqlite'), dataDir, identity, protector });
  // Close before removing: Windows cannot unlink an open database.
  t.after(async () => {
    try { store.close(); } catch {}
    await rm(dataDir, { recursive: true, force: true });
  });

  const nodeExpiry = new Date(Date.now() + 3_600_000).toISOString();
  for (const [suffix, zone] of [['a', 'zone:a'], ['b', 'zone:b'], ['c', 'zone:c']]) {
    appendAdmission(store, signedAdmission({
      nodeId: `node:scope-${suffix}`,
      owner: 'owner:scope',
      expiresAt: nodeExpiry,
      endpoint: `https://scope-${suffix}.mesh.example`,
      failureDomain: zone
    }));
  }
  const REQUESTER = 'owner:scope';
  const ids = [];
  for (let index = 0; index < 3; index += 1) {
    const normalized = normalizeNodeScheduleRequest({
      request_id: `request:scope-${index}`,
      required_capabilities: ['compute.batch'],
      required_roles: ['compute'],
      minimum_security_level: 2,
      resources: { cpu_millis: 100, memory_bytes: 64, storage_bytes: 0 },
      replicas: 1,
      lease_seconds: 600,
      distinct_failure_domains: true,
      max_per_owner: 1
    }, REQUESTER);
    store.appendEvents({
      traceId: `trace_scope_${index}`,
      actor: REQUESTER,
      events: [{
        kind: 'node.schedule.requested',
        subject: normalized.schedule_id,
        payload: {
          requester: normalized.requester,
          request: normalized.request,
          request_digest: normalized.request_digest,
          schedule_id: normalized.schedule_id
        }
      }]
    });
    ids.push(normalized.schedule_id);
  }
  const placed = store.getNodeSchedule(ids[0], REQUESTER);
  assert.equal(placed.status, 'active');
  const target = placed.placements[0];

  const asOf = new Date(Date.now() + 1_000).toISOString();
  // Another requester's live schedule overloads the first schedule's node:
  // only a read that includes other requesters' load sees the degradation.
  insertSchedule(store, {
    id: 'sched:other-live',
    requester: 'owner:other',
    status: 'active',
    createdAt: new Date(Date.now() - 60_000).toISOString(),
    expiresAt: new Date(Date.now() + 600_000).toISOString(),
    placement: { ...target, allocated_resources: { cpu_millis: 5_000, memory_bytes: 0, storage_bytes: 0 } }
  });
  // An overloading schedule that expires exactly at `asOf` carries no load.
  const neighbour = otherPlacement(store, ids, target);
  assert.notEqual(neighbour.node_id, target.node_id);
  insertSchedule(store, {
    id: 'sched:boundary',
    requester: 'owner:other',
    status: 'active',
    createdAt: new Date(Date.now() - 60_000).toISOString(),
    expiresAt: asOf,
    placement: { ...neighbour, allocated_resources: { cpu_millis: 5_000, memory_bytes: 0, storage_bytes: 0 } }
  });
  // A degraded schedule still holds its placement, so it still carries load.
  const third = ids
    .map(id => store.getNodeSchedule(id, 'owner:scope').placements[0])
    .find(placement => ![target.node_id, neighbour.node_id].includes(placement.node_id));
  assert.ok(third);
  insertSchedule(store, {
    id: 'sched:other-degraded',
    requester: 'owner:other',
    status: 'degraded',
    createdAt: new Date(Date.now() - 60_000).toISOString(),
    expiresAt: new Date(Date.now() + 600_000).toISOString(),
    placement: { ...third, allocated_resources: { cpu_millis: 5_000, memory_bytes: 0, storage_bytes: 0 } }
  });
  // Expired and revoked history, which must never be decoded for status.
  const HISTORY = 300;
  for (let index = 0; index < HISTORY; index += 1) {
    insertSchedule(store, {
      id: `sched:history-${String(index).padStart(4, '0')}`,
      requester: index % 2 ? REQUESTER : 'owner:other',
      status: index % 3 ? 'active' : 'revoked',
      createdAt: new Date(Date.now() - 86_400_000 + index).toISOString(),
      expiresAt: new Date(Date.now() - 3_600_000).toISOString(),
      placement: { ...target, allocated_resources: { cpu_millis: 5_000, memory_bytes: 0, storage_bytes: 0 } }
    });
  }

  const everyNode = store.listNodes({ asOf });
  const everySchedule = store.decodedSchedules();
  const reference = new Map(everySchedule.map(schedule => [
    schedule.schedule_id,
    effectiveScheduleStatus(schedule, everyNode, { asOf, schedules: everySchedule })
  ]));
  assert.equal(reference.get(ids[0]), 'degraded');
  assert.deepEqual(ids.map(id => reference.get(id)).sort(), ['active', 'degraded', 'degraded']);

  const decoded = countScheduleDecodes(store);
  const pages = [];
  let after;
  do {
    decoded.count = 0;
    const page = store.listNodeSchedules(REQUESTER, { asOf, limit: 7, after });
    // One page plus the look-ahead, and the five load-bearing schedules
    // (three of the requester's, two of another's); never the history.
    assert.ok(decoded.count <= 8 + 5, `decoded ${decoded.count} schedules for one page`);
    pages.push(...page.schedules.slice(0, 7));
    const last = page.schedules.at(-1);
    after = page.truncated ? { sort: last.created_at, id: last.schedule_id } : null;
  } while (after);
  decoded.restore();

  const owned = everySchedule.filter(schedule => schedule.requester === REQUESTER);
  assert.equal(pages.length, owned.length);
  assert.deepEqual(
    pages.map(schedule => schedule.schedule_id),
    [...owned]
      .sort((left, right) => (
        right.created_at.localeCompare(left.created_at)
        || right.schedule_id.localeCompare(left.schedule_id)
      ))
      .map(schedule => schedule.schedule_id)
  );
  for (const schedule of pages) {
    assert.equal(schedule.status, reference.get(schedule.schedule_id), schedule.schedule_id);
  }
  for (const id of ids) {
    assert.equal(store.getNodeSchedule(id, REQUESTER, { asOf }).status, reference.get(id), id);
  }
  assert.throws(
    () => store.getNodeSchedule('sched:other-live', REQUESTER),
    error => error.code === 'node_schedule_not_found'
  );
});

function otherPlacement(store, ids, target) {
  for (const id of ids) {
    const placement = store.getNodeSchedule(id, 'owner:scope').placements[0];
    if (placement.node_id !== target.node_id) return placement;
  }
  return target;
}

function insertSchedule(store, { id, requester, status, createdAt, expiresAt, placement }) {
  store.db.prepare(`
    INSERT INTO node_schedules(
      schedule_id, requester, request_digest, requirements_json,
      placements_json, status, created_at, expires_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    requester,
    sha256(id),
    store.protectJson('node_schedules', 'requirements_json', id, {
      required_capabilities: [],
      required_roles: [],
      minimum_security_level: 0
    }),
    store.protectJson('node_schedules', 'placements_json', id, [{ rank: 1, ...placement }]),
    status,
    createdAt,
    expiresAt
  );
}

function countScheduleDecodes(store) {
  const original = store.decodeProtectedRow.bind(store);
  const counter = {
    count: 0,
    restore() { store.decodeProtectedRow = original; }
  };
  store.decodeProtectedRow = (table, ...rest) => {
    if (table === 'node_schedules') counter.count += 1;
    return original(table, ...rest);
  };
  return counter;
}

function signedAdmission({ nodeId, owner, expiresAt, endpoint, failureDomain }) {
  const keys = generateKeyPairSync('ed25519');
  const statement = {
    format: 'axiom-node-admission.v2',
    node_id: nodeId,
    public_key: String(keys.publicKey.export({ type: 'spki', format: 'pem' })),
    security_profile: 'S2_HARDENED',
    capabilities: ['compute.batch', 'storage.offer'],
    software_digest: sha256(`software:${nodeId}`),
    expires_at: expiresAt,
    nonce: `nonce:${nodeId}`,
    discovery: {
      endpoint,
      failure_domain: failureDomain,
      roles: ['compute', 'storage'],
      resources: {
        cpu_millis: 1_000,
        memory_bytes: 1_024,
        storage_bytes: 4_096,
        max_concurrent_assignments: 4
      }
    }
  };
  return {
    owner,
    input: {
      ...statement,
      signature: sign(null, Buffer.from(canonicalJson(statement)), keys.privateKey).toString('base64url')
    }
  };
}

function appendAdmission(store, record) {
  const admission = verifyNodeAdmission(record.input);
  return store.appendEvents({
    traceId: `trace_${admission.statement.node_id.replaceAll(':', '_').replaceAll('-', '_')}`,
    actor: record.owner,
    events: [{
      kind: 'node.registered',
      subject: admission.statement.node_id,
      payload: { owner: record.owner, admission }
    }]
  });
}
