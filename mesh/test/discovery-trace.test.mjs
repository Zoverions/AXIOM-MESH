import test from 'node:test';
import assert from 'node:assert/strict';
import {
  validateDiscoveryTrace,
  digestDiscoveryTrace,
  summarizeDiscoveryTrace
} from '../src/lib/discovery-trace.mjs';
import {
  H,
  H2,
  makeDiscoveryTrace,
  makeTraceNode
} from './fixtures/replay-grounded-fixtures.mjs';

function withNodes(trace, nodes) {
  return { ...structuredClone(trace), nodes: structuredClone(nodes) };
}

test('valid discovery trace is deterministic and non-authorizing', () => {
  const trace = makeDiscoveryTrace();
  const validated = validateDiscoveryTrace(trace);
  const digestA = digestDiscoveryTrace(trace);
  const digestB = digestDiscoveryTrace(structuredClone(trace));
  const summary = summarizeDiscoveryTrace(trace);

  assert.match(digestA, /^[a-f0-9]{64}$/);
  assert.equal(digestA, digestB);
  assert.equal(validated.authority_effect, 'none');
  assert.equal(validated.network_effect, 'none');
  assert.equal(validated.runtime_activation, false);
  assert.equal(validated.production_promotion, false);
  assert.equal(summary.trace_id, 'trace.example');
  assert.equal(summary.node_count, 3);
  assert.equal(summary.authority_effect, 'none');
  assert.equal(summary.network_effect, 'none');
});

test('unknown trace and node fields fail closed', () => {
  const traceUnknown = makeDiscoveryTrace({ unexpected: true });
  assert.throws(() => validateDiscoveryTrace(traceUnknown));

  const trace = makeDiscoveryTrace();
  const nodeUnknown = { ...trace.nodes[0], surprise: 'nope' };
  assert.throws(() => validateDiscoveryTrace(withNodes(trace, [nodeUnknown, ...trace.nodes.slice(1)])));
});

test('duplicate node ids and ordinals fail closed', () => {
  const trace = makeDiscoveryTrace();
  const duplicateId = makeTraceNode({
    node_id: 'n1',
    creation_ordinal: 2,
    started_at: '2026-09-16T12:00:30.000Z',
    ended_at: '2026-09-16T12:00:40.000Z'
  });
  assert.throws(() => validateDiscoveryTrace(withNodes(trace, [trace.nodes[0], duplicateId, trace.nodes[2]])));

  const duplicateOrdinal = makeTraceNode({
    node_id: 'n2x',
    creation_ordinal: 1,
    started_at: '2026-09-16T12:00:30.000Z',
    ended_at: '2026-09-16T12:00:40.000Z'
  });
  assert.throws(() => validateDiscoveryTrace(withNodes(trace, [trace.nodes[0], duplicateOrdinal, trace.nodes[2]])));
});

test('forward parent and replay-causal cycle fail closed', () => {
  const trace = makeDiscoveryTrace();
  const forward = structuredClone(trace.nodes);
  forward[0].primary_parent_id = 'n3';
  assert.throws(() => validateDiscoveryTrace(withNodes(trace, forward)));

  const cycle = structuredClone(trace.nodes);
  cycle[0].primary_parent_id = 'n3';
  cycle[2].primary_parent_id = 'n1';
  assert.throws(() => validateDiscoveryTrace(withNodes(trace, cycle)));
});

test('non-contiguous or reordered creation ordinals fail closed', () => {
  const trace = makeDiscoveryTrace();
  const skipped = structuredClone(trace.nodes);
  skipped[1].creation_ordinal = 4;
  assert.throws(() => validateDiscoveryTrace(withNodes(trace, skipped)));

  assert.throws(() => validateDiscoveryTrace(withNodes(trace, [...trace.nodes].reverse())));
});

test('digest or identifier substitution changes the trace digest', () => {
  const original = makeDiscoveryTrace();
  const taskChanged = makeDiscoveryTrace({ task_definition: { digest: H2 } });
  const idChanged = makeDiscoveryTrace({ trace_id: 'trace.changed' });

  assert.notEqual(digestDiscoveryTrace(original), digestDiscoveryTrace(taskChanged));
  assert.notEqual(digestDiscoveryTrace(original), digestDiscoveryTrace(idChanged));
});

test('non-canonical timestamps and inverted chronology fail closed', () => {
  assert.throws(() => validateDiscoveryTrace(makeDiscoveryTrace({
    started_at: '2026-09-16T12:00:00Z'
  })));

  assert.throws(() => validateDiscoveryTrace(makeDiscoveryTrace({
    started_at: '2026-09-16T12:05:00.000Z',
    ended_at: '2026-09-16T12:00:00.000Z'
  })));

  const trace = makeDiscoveryTrace();
  const nodes = structuredClone(trace.nodes);
  nodes[0].ended_at = '2026-09-16T11:59:59.000Z';
  assert.throws(() => validateDiscoveryTrace(withNodes(trace, nodes)));
});

test('nonzero external effects fail Replay Core v0', () => {
  const trace = makeDiscoveryTrace();
  const nodes = structuredClone(trace.nodes);
  nodes[0].resources.external_effects = 1;
  assert.throws(() => validateDiscoveryTrace(withNodes(trace, nodes)));
});

test('credential-like durable payload fields cannot be added through unknown fields', () => {
  assert.throws(() => validateDiscoveryTrace(makeDiscoveryTrace({
    api_key: 'not-a-real-secret'
  })));

  const trace = makeDiscoveryTrace();
  const nodes = structuredClone(trace.nodes);
  nodes[0].provider_token = 'not-a-real-token';
  assert.throws(() => validateDiscoveryTrace(withNodes(trace, nodes)));
});

test('quality uses an explicit positive scale and bounded value', () => {
  const trace = makeDiscoveryTrace();
  const zeroScale = structuredClone(trace.nodes);
  zeroScale[0].evaluator_result.quality.scale = 0;
  assert.throws(() => validateDiscoveryTrace(withNodes(trace, zeroScale)));

  const aboveScale = structuredClone(trace.nodes);
  aboveScale[0].evaluator_result.quality.value = 1000001;
  assert.throws(() => validateDiscoveryTrace(withNodes(trace, aboveScale)));
});

test('root id cannot collide with an attempt node id', () => {
  const trace = makeDiscoveryTrace();
  const nodes = structuredClone(trace.nodes);
  nodes[0].node_id = 'root';
  assert.throws(() => validateDiscoveryTrace(withNodes(trace, nodes)));
});

test('inputs remain unmodified and validated output is deeply frozen', () => {
  const input = makeDiscoveryTrace();
  const before = structuredClone(input);
  const validated = validateDiscoveryTrace(input);

  assert.deepEqual(input, before);
  assert.equal(Object.isFrozen(validated), true);
  assert.equal(Object.isFrozen(validated.nodes), true);
  assert.equal(Object.isFrozen(validated.nodes[0]), true);
  assert.equal(Object.isFrozen(validated.nodes[0].resources), true);
  assert.throws(() => {
    validated.nodes[0].node_id = 'mutated';
  }, TypeError);
});

test('trace digest is sensitive to recorded quality and resource evidence', () => {
  const original = makeDiscoveryTrace();
  const qualityChanged = makeDiscoveryTrace();
  qualityChanged.nodes[0].evaluator_result.quality.value += 1;
  const resourceChanged = makeDiscoveryTrace();
  resourceChanged.nodes[0].resources.token_or_cost_units += 1;

  assert.notEqual(digestDiscoveryTrace(original), digestDiscoveryTrace(qualityChanged));
  assert.notEqual(digestDiscoveryTrace(original), digestDiscoveryTrace(resourceChanged));
  assert.equal(original.task_definition.digest, H);
});
