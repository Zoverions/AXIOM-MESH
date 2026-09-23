import assert from 'node:assert/strict';
import test from 'node:test';
import { adaptMeshStatusV1, deriveCoordinationView } from './coordination.mjs';

const NOW = '2026-09-23T12:00:00.000Z';
const OWNER = { role: 'owner', source_id: 'cosmo', audience_id: 'owner-1' };
const PROVENANCE = { source_id: 'cosmo', audience_id: 'owner-1', revision: 1,
  content_digest: 'a'.repeat(64) };

function observation() {
  return {
    schema: 'axiom-one.mesh-observation.v1',
    ...PROVENANCE,
    observed_at: '2026-09-23T11:59:55.000Z',
    agents: [
      {
        id: 'cosmo', kind: 'agent', reported_encryption: 'g2-verified',
        heartbeat: { last_seen_at: '2026-09-23T11:59:40.000Z', interval_seconds: 30 },
        lease: { state: 'active', expires_at: '2026-09-23T12:10:00.000Z' },
        checkpoint: { last_processed_id: 'opaque-42', last_processed_at: '2026-09-23T11:59:38.000Z', processed_seq: 42, source_high_water_seq: 42 },
        work: 'Coordinate releases', blockers: [], reported_state: 'online', capacity: 'available', resources: { cpu_percent: 21 }
      },
      {
        id: 'peppy', kind: 'worker', reported_encryption: 'g2-verified',
        heartbeat: { last_seen_at: '2026-09-23T11:59:30.000Z', interval_seconds: 30 },
        lease: { state: 'active', expires_at: '2026-09-23T12:10:00.000Z' },
        checkpoint: { last_processed_id: 'opaque-19', last_processed_at: '2026-09-23T11:58:00.000Z', processed_seq: 19, source_high_water_seq: 24 },
        work: 'Dashboard', blockers: ['Waiting for source'], reported_state: 'degraded', capacity: 'busy', resources: { cpu_percent: 74 }
      }
    ],
    history: [
      { event_id: 'e-2', agent_id: 'peppy', occurred_at: '2026-09-23T11:59:30.000Z', kind: 'heartbeat', outcome: 'received' },
      { event_id: 'e-1', agent_id: 'cosmo', occurred_at: '2026-09-23T11:59:40.000Z', kind: 'heartbeat', outcome: 'received' }
    ]
  };
}

test('fresh owner view derives idle and lagging from heartbeat, lease, and high-water progress', () => {
  const view = deriveCoordinationView({ snapshot: observation(), now: NOW, scope: OWNER });
  assert.equal(view.source_state, 'live');
  assert.equal(view.as_of, '2026-09-23T11:59:55.000Z');
  assert.deepEqual(view.agents.map(agent => [agent.id, agent.state]), [['cosmo', 'idle'], ['peppy', 'lagging']]);
  assert.equal(view.agents[0].checkpoint.last_processed_id, 'opaque-42');
  assert.deepEqual(view.history.map(event => event.event_id), ['e-1', 'e-2']);
});

test('expired leases and missed heartbeats override apparent progress', () => {
  const input = observation();
  input.agents[0].lease.expires_at = '2026-09-23T11:59:59.000Z';
  input.agents[1].heartbeat.last_seen_at = '2026-09-23T11:57:00.000Z';
  const view = deriveCoordinationView({ snapshot: input, now: NOW, scope: OWNER });
  assert.deepEqual(view.agents.map(agent => agent.state), ['lease_expired', 'heartbeat_stale']);
});

test('an unchanged checkpoint is idle when the source high-water mark has not advanced', () => {
  const input = observation();
  input.agents[0].checkpoint.last_processed_at = '2026-09-22T12:00:00.000Z';
  const view = deriveCoordinationView({ snapshot: input, now: NOW, scope: OWNER });
  assert.equal(view.agents[0].state, 'idle');
});

test('source failures retain last-good information with an unmistakable stale label', () => {
  const view = deriveCoordinationView({ snapshot: null, lastGood: observation(), now: NOW, scope: OWNER });
  assert.equal(view.source_state, 'unavailable');
  assert.equal(view.as_of, '2026-09-23T11:59:55.000Z');
  assert.ok(view.agents.every(agent => agent.state === 'unavailable'));
  assert.equal(view.agents[0].last_known_state, 'idle');
});

test('source observations older than the coordinator rhythm cannot be presented as live', () => {
  const input = observation();
  input.observed_at = '2026-09-23T11:20:00.000Z';
  input.history = [];
  input.agents[0].heartbeat.last_seen_at = '2026-09-23T11:19:40.000Z';
  input.agents[1].heartbeat.last_seen_at = '2026-09-23T11:19:30.000Z';
  input.agents.forEach(agent => { agent.checkpoint.last_processed_at = '2026-09-23T11:18:00.000Z'; });
  const view = deriveCoordinationView({ snapshot: input, now: NOW, scope: OWNER });
  assert.equal(view.source_state, 'stale');
  assert.ok(view.agents.every(agent => agent.state === 'stale'));
});

test('non-owner scope filters agents and history and removes private checkpoint and resource detail', () => {
  const view = deriveCoordinationView({ snapshot: observation(), now: NOW, scope: { role: 'member', source_id: 'cosmo', audience_id: 'owner-1', visible_agent_ids: ['peppy'] } });
  assert.deepEqual(view.agents.map(agent => agent.id), ['peppy']);
  assert.deepEqual(view.history.map(event => event.agent_id), ['peppy']);
  assert.equal(view.agents[0].checkpoint, undefined);
  assert.equal(view.agents[0].resources, undefined);
  assert.equal(view.agents[0].work, undefined);
});

test('missing scope and malformed or future source observations fail closed', () => {
  assert.throws(() => deriveCoordinationView({ snapshot: observation(), now: NOW }), /scope/);
  const input = observation();
  input.observed_at = '2026-09-23T12:02:00.000Z';
  const view = deriveCoordinationView({ snapshot: input, now: NOW, scope: OWNER });
  assert.equal(view.source_state, 'malformed');
  assert.deepEqual(view.agents, []);
});

test('actual MESH_STATUS v1 shape keeps missing lease expiry and progress watermark unknown', () => {
  const source = {
    format: 'MESH_STATUS v1', updated_at: '2026-09-23T08:00:00-04:00',
    agents: {
      'agent-a': {
        state: 'online', enc: 'g2-verified', heartbeat_slot: ':00/:30',
        last_heartbeat: '2026-09-23T07:59:40-04:00',
        lease: 'protocol-accepted (no formal lease instrument yet)',
        last_processed_id: 'not-reported (required in next heartbeat)',
        work: 'Preparing a dashboard', blockers: 'awaiting roster'
      }
    }
  };
  const normalized = adaptMeshStatusV1(source, PROVENANCE);
  assert.equal(normalized.observed_at, NOW);
  assert.equal(normalized.agents[0].heartbeat.interval_seconds, 1800);
  assert.deepEqual(normalized.agents[0].lease, { state: 'unknown', expires_at: null });
  assert.deepEqual(normalized.agents[0].checkpoint, {
    last_processed_id: null, last_processed_at: null, processed_seq: null, source_high_water_seq: null
  });
  const view = deriveCoordinationView({ snapshot: normalized, now: NOW, scope: OWNER });
  assert.equal(view.source_state, 'live');
  assert.equal(view.agents[0].state, 'unknown');
  assert.deepEqual(view.agents[0].blockers, ['awaiting roster']);
});

test('a pending MESH_STATUS v1 agent with no heartbeat remains visible but never online', () => {
  const normalized = adaptMeshStatusV1({
    format: 'MESH_STATUS v1', updated_at: NOW,
    agents: { 'agent-b': { state: 'pending-onboarding', enc: 'none', heartbeat_slot: 'none',
      last_heartbeat: null, lease: 'none', work: 'Awaiting onboarding', blockers: 'none' } }
  }, PROVENANCE);
  const view = deriveCoordinationView({ snapshot: normalized, now: NOW, scope: OWNER });
  assert.equal(view.agents[0].state, 'unknown');
  assert.equal(view.agents[0].last_seen_at, null);
  assert.deepEqual(view.agents[0].blockers, []);
});

test('untrusted resource keys are not copied into even the owner view', () => {
  const input = observation();
  input.agents[0].resources = { cpu_percent: 21, bearer_token: 'sensitive-value' };
  const view = deriveCoordinationView({ snapshot: input, now: NOW, scope: OWNER });
  assert.deepEqual(view.agents[0].resources, { cpu_percent: 21 });
});

test('a future heartbeat cannot make a recorded agent appear live', () => {
  const input = observation();
  input.agents[0].heartbeat.last_seen_at = '2026-09-23T12:02:00.000Z';
  const view = deriveCoordinationView({ snapshot: input, now: NOW, scope: OWNER });
  assert.equal(view.source_state, 'malformed');
  assert.deepEqual(view.agents, []);
});

test('a reported encryption label is never promoted to an attested verification', () => {
  const view = deriveCoordinationView({ snapshot: observation(), now: NOW, scope: OWNER });
  assert.equal(view.agents[0].encryption, undefined);
  assert.equal(view.agents[0].reported_encryption, 'g2-verified');
});

test('a member can see a scoped agent without operational prose or private detail', () => {
  const view = deriveCoordinationView({ snapshot: observation(), now: NOW,
    scope: { role: 'member', source_id: 'cosmo', audience_id: 'owner-1', visible_agent_ids: ['peppy'] } });
  assert.equal(view.agents[0].work, undefined);
  assert.equal(view.agents[0].blockers, undefined);
  assert.equal(view.agents[0].source_reported_state, undefined);
  assert.equal(view.agents[0].checkpoint, undefined);
});

test('a coordinator needs explicit field scope to see operational prose', () => {
  const basic = deriveCoordinationView({ snapshot: observation(), now: NOW,
    scope: { role: 'coordinator', source_id: 'cosmo', audience_id: 'owner-1', visible_agent_ids: ['peppy'] } });
  const detailed = deriveCoordinationView({ snapshot: observation(), now: NOW,
    scope: { role: 'coordinator', source_id: 'cosmo', audience_id: 'owner-1', visible_agent_ids: ['peppy'], visible_fields: ['work', 'blockers'] } });
  assert.equal(basic.agents[0].work, undefined);
  assert.equal(detailed.agents[0].work, 'Dashboard');
  assert.deepEqual(detailed.agents[0].blockers, ['Waiting for source']);
});

test('old or cross-audience last-good data is never projected after source failure', () => {
  const crossAudience = observation();
  crossAudience.audience_id = 'another-owner';
  const wrong = deriveCoordinationView({ snapshot: null, lastGood: crossAudience, now: NOW, scope: OWNER });
  assert.deepEqual(wrong.agents, []);
  const old = observation();
  old.observed_at = '2026-09-21T11:59:55.000Z';
  const expired = deriveCoordinationView({ snapshot: null, lastGood: old, now: NOW, scope: OWNER });
  assert.deepEqual(expired.agents, []);
});

test('a lower revision cannot displace a newer trusted observation', () => {
  const newer = observation(); newer.revision = 10;
  const replay = observation(); replay.revision = 9;
  const view = deriveCoordinationView({ snapshot: replay, lastGood: newer, now: NOW, scope: OWNER });
  assert.notEqual(view.source_state, 'live');
  assert.equal(view.revision, 10);
});

test('duplicate or future events cannot inflate the recent history', () => {
  const duplicate = observation(); duplicate.history[1].event_id = 'e-2';
  assert.equal(deriveCoordinationView({ snapshot: duplicate, now: NOW, scope: OWNER }).source_state, 'malformed');
  const future = observation(); future.history[1].occurred_at = '2026-09-23T12:02:00.000Z';
  assert.equal(deriveCoordinationView({ snapshot: future, now: NOW, scope: OWNER }).source_state, 'malformed');
});

test('a thirty-minute source rhythm stays live while an older observation is stale', () => {
  const input = observation(); input.observed_at = '2026-09-23T11:30:00.000Z';
  input.history = [];
  input.agents[0].heartbeat.last_seen_at = '2026-09-23T11:19:40.000Z';
  input.agents[1].heartbeat.last_seen_at = '2026-09-23T11:19:30.000Z';
  input.agents.forEach(agent => { agent.checkpoint.last_processed_at = '2026-09-23T11:18:00.000Z'; });
  assert.equal(deriveCoordinationView({ snapshot: input, now: NOW, scope: OWNER }).source_state, 'live');
  input.observed_at = '2026-09-23T11:20:00.000Z';
  assert.equal(deriveCoordinationView({ snapshot: input, now: NOW, scope: OWNER }).source_state, 'stale');
});

test('a heartbeat after the stated source observation time is rejected', () => {
  const input = observation();
  input.observed_at = '2026-09-23T11:55:00.000Z';
  input.history = [];
  assert.equal(deriveCoordinationView({ snapshot: input, now: NOW, scope: OWNER }).source_state, 'malformed');
});

test('a higher revision with an older observed time cannot move the view backward', () => {
  const newer = observation(); newer.revision = 10;
  const backwards = observation(); backwards.revision = 11;
  backwards.observed_at = '2026-09-23T11:30:00.000Z';
  backwards.history = [];
  backwards.agents[0].heartbeat.last_seen_at = '2026-09-23T11:29:40.000Z';
  backwards.agents[1].heartbeat.last_seen_at = '2026-09-23T11:29:30.000Z';
  backwards.agents.forEach(agent => { agent.checkpoint.last_processed_at = '2026-09-23T11:29:00.000Z'; });
  const view = deriveCoordinationView({ snapshot: backwards, lastGood: newer, now: NOW, scope: OWNER });
  assert.equal(view.source_state, 'replayed');
  assert.equal(view.as_of, newer.observed_at);
});

test('an expired last-good cache still prevents a lower revision from becoming live', () => {
  const old = observation(); old.revision = 10;
  old.observed_at = '2026-09-21T11:59:55.000Z';
  old.history = [];
  old.agents[0].heartbeat.last_seen_at = '2026-09-21T11:59:40.000Z';
  old.agents[1].heartbeat.last_seen_at = '2026-09-21T11:59:30.000Z';
  old.agents.forEach(agent => { agent.checkpoint.last_processed_at = '2026-09-21T11:58:00.000Z'; });
  const replay = observation(); replay.revision = 9;
  const view = deriveCoordinationView({ snapshot: replay, lastGood: old, now: NOW, scope: OWNER });
  assert.equal(view.source_state, 'replayed');
  assert.deepEqual(view.agents, []);
});

test('a future checkpoint cannot turn a lagging worker into healthy', () => {
  const input = observation();
  input.agents[1].checkpoint.last_processed_at = '2100-01-01T00:00:00.000Z';
  const view = deriveCoordinationView({ snapshot: input, now: NOW, scope: OWNER });
  assert.equal(view.source_state, 'malformed');
});

test('omitted heartbeat in the v1 feed stays unknown rather than throwing', () => {
  const normalized = adaptMeshStatusV1({
    format: 'MESH_STATUS v1', updated_at: NOW,
    agents: { 'agent-b': { state: 'pending-onboarding', enc: 'none',
      heartbeat_slot: 'none', lease: 'none', work: 'Awaiting onboarding', blockers: 'none' } }
  }, PROVENANCE);
  const view = deriveCoordinationView({ snapshot: normalized, now: NOW, scope: OWNER });
  assert.equal(view.agents[0].last_seen_at, null);
  assert.equal(view.agents[0].state, 'unknown');
});

test('changed content at the same revision and timestamp is rejected as a conflicting replay', () => {
  const retained = observation();
  const changed = observation();
  changed.content_digest = 'b'.repeat(64);
  const view = deriveCoordinationView({ snapshot: changed, lastGood: retained, now: NOW, scope: OWNER });
  assert.equal(view.source_state, 'replayed');
  assert.equal(view.revision, retained.revision);
});
