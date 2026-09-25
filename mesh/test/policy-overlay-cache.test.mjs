import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { digestObject } from '../src/lib/canonical.mjs';
import { ensureMeshIdentity } from '../src/lib/identity.mjs';
import {
  PolicyEngine,
  createActivePolicy,
  policyOverlayGenerationDigest
} from '../src/lib/policy.mjs';
import { loadDataProtector } from '../src/lib/protector.mjs';
import { GridStore } from '../src/grid/store.mjs';

// Scalability audit S-15: the Hypervisor rebuilds its merged policy only
// when Grid's overlay generation changes, and still asks Grid every time.

const base = new PolicyEngine({
  version: 'base',
  actions: {
    'system.echo': { decision: 'allow', risk: 'low', required_scopes: ['intent:execute'], tool: 'builtin.echo' },
    'system.hash': { decision: 'allow', risk: 'low', required_scopes: ['intent:execute'], tool: 'builtin.hash' }
  }
});

function overlay(id, action) {
  const policy = { version: `overlay-${id}`, actions: { [action]: { decision: 'deny', risk: 'critical', reason: `${id} denies ${action}` } } };
  return { overlay_id: id, policy_digest: digestObject(policy), policy_json: policy };
}

const generationOf = overlays => policyOverlayGenerationDigest(overlays.map(item => [item.overlay_id, item.policy_digest]));

// A fake Grid: answers like /internal/v1/policy-overlays for its current set.
function fakeGrid() {
  const grid = { overlays: [], calls: [], sent: 0 };
  grid.fetch = async ({ generation }) => {
    grid.calls.push(generation);
    const current = generationOf(grid.overlays);
    if (generation === current) return { generation: current, unchanged: true };
    grid.sent += 1;
    return { generation: current, overlays: structuredClone(grid.overlays) };
  };
  return grid;
}

const decide = (engine, action) => (engine.evaluate({ action, principal: { scopes: ['intent:execute'] }, intent: {} }).allow ? 'allow' : 'deny');

test('the merged policy is rebuilt only when the overlay generation changes, and Grid is asked every time', async () => {
  const grid = fakeGrid();
  const activePolicy = createActivePolicy({ basePolicy: base, fetchOverlays: grid.fetch });

  assert.equal(await activePolicy(), base, 'no overlays: the base policy');
  grid.overlays = [overlay('o1', 'system.echo')];
  const first = await activePolicy();
  assert.equal(decide(first, 'system.echo'), 'deny', 'an activated overlay applies on the next intent');
  // Unchanged: the same engine, and Grid sent no overlays.
  const sentBefore = grid.sent;
  assert.equal(await activePolicy(), first);
  assert.equal(await activePolicy(), first);
  assert.equal(grid.sent, sentBefore);
  assert.equal(grid.calls.at(-1), generationOf(grid.overlays), 'Grid is told the generation held');

  grid.overlays = [...grid.overlays, overlay('o2', 'system.hash')];
  const second = await activePolicy();
  assert.notEqual(second, first);
  assert.equal(decide(second, 'system.hash'), 'deny');
  // Rollback or expiry: the set shrinks, and the next intent sees it.
  grid.overlays = [];
  assert.equal(await activePolicy(), base);
  assert.equal(decide(await activePolicy(), 'system.echo'), 'allow');
  assert.equal(grid.calls.length, 7, 'one question to Grid per call');
});

test('inconsistent answers fail closed and drop the cache', async () => {
  const grid = fakeGrid();
  grid.overlays = [overlay('o1', 'system.echo')];
  let answer = null;
  const activePolicy = createActivePolicy({
    basePolicy: base,
    fetchOverlays: async request => answer ?? grid.fetch(request)
  });
  await activePolicy();

  // "Unchanged" for a generation the Hypervisor does not hold.
  answer = { generation: 'f'.repeat(64), unchanged: true };
  await assert.rejects(activePolicy(), error => error.code === 'policy_unavailable' && error.status === 503);
  // Overlays that are not the generation named.
  answer = { generation: generationOf(grid.overlays), overlays: [overlay('other', 'system.hash')] };
  await assert.rejects(activePolicy(), error => error.code === 'policy_unavailable');
  // After a failure nothing is cached: the next question carries no generation.
  answer = null;
  const calls = grid.calls.length;
  assert.equal(decide(await activePolicy(), 'system.echo'), 'deny');
  assert.equal(grid.calls[calls], null);

  // A Grid that names no generation is served without caching.
  const legacy = createActivePolicy({ basePolicy: base, fetchOverlays: async () => ({ overlays: [overlay('o1', 'system.echo')] }) });
  const one = await legacy();
  assert.notEqual(await legacy(), one);
});

test('malformed overlays or policy bytes cannot replace an active deny with base policy', async () => {
  const denied = overlay('deny-echo', 'system.echo');
  let answer = { generation: generationOf([denied]), overlays: [denied] };
  const asked = [];
  const activePolicy = createActivePolicy({
    basePolicy: base,
    fetchOverlays: async ({ generation }) => {
      asked.push(generation);
      return answer;
    }
  });
  assert.equal(decide(await activePolicy(), 'system.echo'), 'deny');

  // An invalid collection must not look like an empty active overlay set.
  answer = { generation: generationOf([]), overlays: { invalid: true } };
  await assert.rejects(activePolicy(), error => error.code === 'policy_unavailable');

  // A generation binds declared digests, so check that the policy bodies
  // actually have those digests before using them for authorization.
  answer = {
    generation: generationOf([denied]),
    overlays: [{ ...denied, policy_json: { version: 'substituted', actions: {} } }]
  };
  await assert.rejects(activePolicy(), error => error.code === 'policy_unavailable');
  answer = { generation: generationOf([denied]), overlays: [denied] };
  assert.equal(decide(await activePolicy(), 'system.echo'), 'deny');
  assert.equal(asked.at(-1), null, 'a bad response drops the cached generation');
});

test('Grid names a generation that follows activation, rollback and expiry, without decrypting policies', async t => {
  const dataDir = await mkdtemp(join(tmpdir(), 'axiom-policy-generation-'));
  const identity = await ensureMeshIdentity(dataDir, 'grid', { create: true });
  const protector = await loadDataProtector({ dataDir, autoBootstrap: true });
  const store = new GridStore({ path: join(dataDir, 'grid.sqlite'), dataDir, identity, protector });
  // One hook, in order: Windows cannot remove an open database file.
  t.after(async () => {
    try { store.close(); } catch {}
    await rm(dataDir, { recursive: true, force: true });
  });
  const insert = (item, { activatedAt, expiresAt = null }) => store.db.prepare(`
    INSERT INTO policy_overlays(overlay_id, proposal_id, source_type, policy_digest, policy_json, status, activated_at, expires_at)
    VALUES (?, NULL, 'governance', ?, ?, 'active', ?, ?)
  `).run(item.overlay_id, item.policy_digest, store.protectJson('policy_overlays', 'policy_json', item.overlay_id, item.policy_json), activatedAt, expiresAt);
  const now = '2026-09-25T12:00:00.000Z';
  const matches = at => {
    const listed = store.listActivePolicyOverlays(at);
    assert.equal(store.policyOverlayGeneration(at), generationOf(listed), 'the generation names exactly the overlays served');
    return store.policyOverlayGeneration(at);
  };

  const empty = matches(now);
  insert(overlay('o1', 'system.echo'), { activatedAt: '2026-09-25T11:00:00.000Z' });
  const one = matches(now);
  assert.notEqual(one, empty);
  insert(overlay('o2', 'system.hash'), { activatedAt: '2026-09-25T11:30:00.000Z', expiresAt: '2026-09-25T13:00:00.000Z' });
  const two = matches(now);
  assert.notEqual(two, one);
  // Expiry alone changes it.
  assert.equal(matches('2026-09-25T13:00:00.000Z'), one);
  // Rollback changes it.
  store.db.prepare("UPDATE policy_overlays SET status = 'rolled_back' WHERE overlay_id = 'o1'").run();
  assert.notEqual(matches(now), two);

  // Naming the generation decrypts no policy.
  let decoded = 0;
  const decode = store.decodeProtectedRow.bind(store);
  store.decodeProtectedRow = (...args) => { decoded += 1; return decode(...args); };
  store.policyOverlayGeneration(now);
  assert.equal(decoded, 0);
});
