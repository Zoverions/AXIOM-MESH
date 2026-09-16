import test from 'node:test';
import assert from 'node:assert/strict';
import {
  validateReplayWorldPool,
  digestReplayWorldPool,
  resolveReplayWorldPool,
  validateReplayPoolPartition,
  projectDevelopmentPool
} from '../src/lib/replay-world-pool.mjs';
import { digestReplayWorld } from '../src/lib/replay-world.mjs';
import { makeDiscoveryTrace, makeReplayWorld, H, H2, H3 } from './fixtures/replay-grounded-fixtures.mjs';

function world(id, compilerDigest = H) {
  const trace = makeDiscoveryTrace({ trace_id: `trace.${id}` });
  return makeReplayWorld(trace, {
    world_id: id,
    compiler: { compiler_digest: compilerDigest }
  });
}

function pool({ id = 'pool.training.1', cycle = 'cycle.1', role = 'training', visibility = 'development-visible', worlds, selection = {}, overrides = {} } = {}) {
  const worldInputs = worlds ?? [world('world.a')];
  const entries = worldInputs.map((item) => ({
    world_id: item.world_id,
    world_digest: digestReplayWorld(item),
    compatibility: 'current-compatible'
  }));
  return {
    schema: 'axiom-replay-world-pool.v0',
    status: 'inert-world-pool',
    pool_id: id,
    cycle_id: cycle,
    role,
    visibility,
    worlds: entries,
    selection: {
      method: 'explicit',
      seed: null,
      evidence_ref: 'split.explicit.1',
      evidence_digest: H2,
      ...structuredClone(selection)
    },
    created_at: '2026-09-16T14:00:00.000Z',
    authority_effect: 'none',
    network_effect: 'none',
    runtime_activation: false,
    production_promotion: false,
    ...structuredClone(overrides)
  };
}

test('pool resolves exact supplied world artifacts and rejects missing or extra worlds', () => {
  const w1 = world('world.a');
  const w2 = world('world.b', H3);
  const p = pool({ worlds: [w1, w2] });
  const resolved = resolveReplayWorldPool(p, [w2, w1]);
  assert.deepEqual(resolved.world_ids, ['world.a', 'world.b']);
  assert.deepEqual(resolved.current_acceptance_world_ids, ['world.a', 'world.b']);
  assert.equal(Object.isFrozen(resolved), true);
  assert.throws(() => resolveReplayWorldPool(p, [w1]));
  assert.throws(() => resolveReplayWorldPool(p, [w1, w2, world('world.c')]));
});

test('duplicate world id or digest fails closed', () => {
  const w1 = world('world.a');
  const w2 = world('world.b', H3);
  const duplicateId = pool({ worlds: [w1, w2] });
  duplicateId.worlds[1].world_id = duplicateId.worlds[0].world_id;
  assert.throws(() => validateReplayWorldPool(duplicateId));

  const duplicateDigest = pool({ worlds: [w1, w2] });
  duplicateDigest.worlds[1].world_digest = duplicateDigest.worlds[0].world_digest;
  assert.throws(() => validateReplayWorldPool(duplicateDigest));
});

test('world entries must be strictly ordered by world_id', () => {
  const w1 = world('world.a');
  const w2 = world('world.b', H3);
  const p = pool({ worlds: [w1, w2] });
  p.worlds.reverse();
  assert.throws(() => validateReplayWorldPool(p));
});

test('role and visibility combinations fail closed', () => {
  assert.throws(() => validateReplayWorldPool(pool({ role: 'training', visibility: 'acceptance-sealed' })));
  assert.throws(() => validateReplayWorldPool(pool({ role: 'validation', visibility: 'acceptance-sealed' })));
  assert.throws(() => validateReplayWorldPool(pool({ role: 'sealed-holdout', visibility: 'development-visible' })));
  assert.doesNotThrow(() => validateReplayWorldPool(pool({ role: 'sealed-holdout', visibility: 'acceptance-sealed' })));
});

test('selection seed semantics are strict', () => {
  assert.throws(() => validateReplayWorldPool(pool({ selection: { method: 'explicit', seed: 7 } })));
  assert.doesNotThrow(() => validateReplayWorldPool(pool({ selection: { method: 'seeded', seed: 4294967295 } })));
  assert.throws(() => validateReplayWorldPool(pool({ selection: { method: 'seeded', seed: null } })));
  assert.throws(() => validateReplayWorldPool(pool({ selection: { method: 'seeded', seed: 4294967296 } })));
});

test('partition rejects same-cycle overlap including renamed id with identical digest', () => {
  const w1 = world('world.a');
  const w2 = world('world.b', H3);
  const training = pool({ id: 'pool.training', worlds: [w1] });
  const validation = pool({ id: 'pool.validation', role: 'validation', worlds: [w2] });
  const holdout = pool({ id: 'pool.holdout', role: 'sealed-holdout', visibility: 'acceptance-sealed', worlds: [world('world.c', H2)] });
  assert.doesNotThrow(() => validateReplayPoolPartition({ training, validation, holdout }));

  const overlap = structuredClone(holdout);
  overlap.worlds[0].world_digest = training.worlds[0].world_digest;
  overlap.worlds[0].world_id = 'world.renamed';
  assert.throws(() => validateReplayPoolPartition({ training, validation, holdout: overlap }));
});

test('partition requires one cycle and distinct pool ids and digests', () => {
  const training = pool({ id: 'pool.training', cycle: 'cycle.1', worlds: [world('world.a')] });
  const validation = pool({ id: 'pool.validation', cycle: 'cycle.2', role: 'validation', worlds: [world('world.b', H3)] });
  const holdout = pool({ id: 'pool.holdout', cycle: 'cycle.1', role: 'sealed-holdout', visibility: 'acceptance-sealed', worlds: [world('world.c', H2)] });
  assert.throws(() => validateReplayPoolPartition({ training, validation, holdout }));

  const v2 = pool({ id: 'pool.training', role: 'validation', worlds: [world('world.b', H3)] });
  assert.throws(() => validateReplayPoolPartition({ training, validation: v2, holdout }));
});

test('currentness disposition is retained while only current-compatible counts for acceptance', () => {
  const w1 = world('world.a');
  const w2 = world('world.b', H3);
  const w3 = world('world.c', H2);
  const p = pool({ worlds: [w1, w2, w3] });
  p.worlds[0].compatibility = 'historical-valid';
  p.worlds[1].compatibility = 'incompatible';
  p.worlds[2].compatibility = 'current-compatible';
  const resolved = resolveReplayWorldPool(p, [w1, w2, w3]);
  assert.deepEqual(resolved.world_ids, ['world.a', 'world.b', 'world.c']);
  assert.deepEqual(resolved.current_acceptance_world_ids, ['world.c']);
});

test('development projection refuses sealed holdout rather than redacting it', () => {
  const training = pool();
  assert.equal(projectDevelopmentPool(training).visibility, 'development-visible');
  const holdout = pool({ role: 'sealed-holdout', visibility: 'acceptance-sealed' });
  assert.throws(() => projectDevelopmentPool(holdout));
});

test('pool digest is membership and compatibility sensitive and non-authorizing', () => {
  const w1 = world('world.a');
  const p1 = pool({ worlds: [w1] });
  const p2 = pool({ worlds: [w1] });
  p2.worlds[0].compatibility = 'historical-valid';
  assert.notEqual(digestReplayWorldPool(p1), digestReplayWorldPool(p2));
  const validated = validateReplayWorldPool(p1);
  assert.equal(validated.authority_effect, 'none');
  assert.equal(validated.network_effect, 'none');
  assert.equal(validated.runtime_activation, false);
  assert.equal(validated.production_promotion, false);
  assert.throws(() => validateReplayWorldPool({ ...p1, authority_effect: 'grant' }));
});
