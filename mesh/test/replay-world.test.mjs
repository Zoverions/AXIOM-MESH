import test from 'node:test';
import assert from 'node:assert/strict';
import {
  validateReplayWorld,
  digestReplayWorld,
  resolveReplayWorld,
  projectReplayPrefix
} from '../src/lib/replay-world.mjs';
import { digestDiscoveryTrace } from '../src/lib/discovery-trace.mjs';
import {
  H2,
  makeDiscoveryTrace,
  makeReplayWorld
} from './fixtures/replay-grounded-fixtures.mjs';

test('world resolves only against exact trace/evaluator/objective digests', () => {
  const trace = makeDiscoveryTrace();
  const world = makeReplayWorld(trace);
  const resolved = resolveReplayWorld(world, trace);

  assert.equal(resolved.world.world_id, 'world.example');
  assert.equal(resolved.trace.trace_id, trace.trace_id);
  assert.equal(resolved.world.trace_digest, digestDiscoveryTrace(trace));
  assert.equal(resolved.world.evaluator_digest, trace.evaluator.evaluator_digest);
  assert.equal(resolved.world.objective_digest, trace.objective.objective_digest);
  assert.match(digestReplayWorld(world), /^[a-f0-9]{64}$/);
  assert.equal(Object.isFrozen(resolved), true);
});

test('children are indexed by creation ordinal independent of object construction order', () => {
  const trace = makeDiscoveryTrace();
  const world = makeReplayWorld(trace);
  const resolved = resolveReplayWorld(world, trace);

  assert.deepEqual(resolved.children_by_parent.root, ['n1', 'n2']);
  assert.deepEqual(resolved.children_by_parent.n1, ['n3']);
  assert.equal(resolved.node_by_id.n1.creation_ordinal, 1);
  assert.equal(resolved.node_by_id.n3.creation_ordinal, 3);
});

test('world semantics and ceilings are closed-world', () => {
  const trace = makeDiscoveryTrace();
  assert.throws(() => validateReplayWorld(makeReplayWorld(trace, { surprise: true })));
  assert.throws(() => validateReplayWorld(makeReplayWorld(trace, {
    semantics: { opening: 'all-nodes' }
  })));
  assert.throws(() => validateReplayWorld(makeReplayWorld(trace, {
    ceilings: { max_worker_slots: 0 }
  })));
  assert.throws(() => validateReplayWorld(makeReplayWorld(trace, {
    ceilings: { unexpected: 1 }
  })));
});

test('world cannot claim network runtime or promotion authority', () => {
  const trace = makeDiscoveryTrace();
  assert.throws(() => validateReplayWorld(makeReplayWorld(trace, { authority_effect: 'allow' })));
  assert.throws(() => validateReplayWorld(makeReplayWorld(trace, { network_effect: 'egress' })));
  assert.throws(() => validateReplayWorld(makeReplayWorld(trace, { runtime_activation: true })));
  assert.throws(() => validateReplayWorld(makeReplayWorld(trace, { production_promotion: true })));
});

test('trace substitution and compiler digest substitution fail closed', () => {
  const trace = makeDiscoveryTrace();
  const world = makeReplayWorld(trace);
  const changedTrace = makeDiscoveryTrace({ trace_id: 'trace.changed' });

  assert.throws(() => resolveReplayWorld(world, changedTrace));
  assert.throws(() => resolveReplayWorld(makeReplayWorld(trace, {
    trace_digest: H2
  }), trace));
  assert.notEqual(digestReplayWorld(world), digestReplayWorld(makeReplayWorld(trace, {
    compiler: { compiler_digest: H2 }
  })));
});

test('resolved world does not expose future node outcomes through its public prefix projector', () => {
  const trace = makeDiscoveryTrace();
  const resolved = resolveReplayWorld(makeReplayWorld(trace), trace);
  const initial = projectReplayPrefix(resolved, []);

  assert.deepEqual(initial.revealed, []);
  assert.deepEqual(initial.eligible_node_ids, ['n1', 'n2']);
  assert.deepEqual(initial.exhausted_node_ids, []);
  const serialized = JSON.stringify(initial);
  assert.equal(serialized.includes('800000'), false);
  assert.equal(serialized.includes('candidate.n3'), false);
  assert.equal(serialized.includes('diagnostics.n3'), false);
  assert.equal(serialized.includes('n3'), false);

  const afterN1 = projectReplayPrefix(resolved, ['n1']);
  assert.deepEqual(afterN1.eligible_node_ids, ['n2', 'n3']);
  assert.equal(afterN1.revealed.length, 1);
  assert.equal(afterN1.revealed[0].node_id, 'n1');
  assert.equal(afterN1.revealed[0].quality.value, 730000);
  assert.equal(JSON.stringify(afterN1).includes('800000'), false);
});

test('prefix projector rejects hidden descendants and unknown node ids', () => {
  const trace = makeDiscoveryTrace();
  const resolved = resolveReplayWorld(makeReplayWorld(trace), trace);

  assert.throws(() => projectReplayPrefix(resolved, ['n3']));
  assert.throws(() => projectReplayPrefix(resolved, ['unknown-node']));
});

test('validated world is deeply frozen and input remains unmodified', () => {
  const trace = makeDiscoveryTrace();
  const input = makeReplayWorld(trace);
  const before = structuredClone(input);
  const validated = validateReplayWorld(input);

  assert.deepEqual(input, before);
  assert.equal(Object.isFrozen(validated), true);
  assert.equal(Object.isFrozen(validated.semantics), true);
  assert.equal(Object.isFrozen(validated.ceilings), true);
  assert.throws(() => {
    validated.ceilings.max_rounds = 1;
  }, TypeError);
});
