import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { validateDiscoveryTrace } from '../src/lib/discovery-trace.mjs';
import { digestReplayWorld } from '../src/lib/replay-world.mjs';
import { digestReplayWorldPool } from '../src/lib/replay-world-pool.mjs';
import { digestReplayPolicyEvaluation, validateReplayPolicyEvaluation } from '../src/lib/replay-policy-evaluation.mjs';
import { makeDiscoveryTrace, makeReplayWorld, H, H2, H3, H4 } from './fixtures/replay-grounded-fixtures.mjs';

const productionFiles = [
  'replay-grounded-common.mjs',
  'discovery-trace.mjs',
  'replay-world.mjs',
  'exploration-policy.mjs',
  'replay-objective.mjs',
  'replay-engine.mjs',
  'replay-world-pool.mjs',
  'replay-policy-evaluation.mjs'
];

async function productionSources() {
  return Promise.all(productionFiles.map(async (name) => ({
    name,
    source: await readFile(new URL(`../src/lib/${name}`, import.meta.url), 'utf8')
  })));
}

function staticImportSpecifiers(source) {
  const specs = [];
  const re = /^\s*import(?:[\s\S]*?\sfrom\s*)?['"]([^'"]+)['"];?\s*$/gm;
  let match;
  while ((match = re.exec(source)) !== null) specs.push(match[1]);
  return specs;
}

function evaluationFixture(world) {
  const metrics = {
    best_quality: 730000,
    generation_calls: 1,
    evaluation_calls: 1,
    token_or_cost_units: 100,
    wall_clock_ms: 500,
    storage_bytes: 2048,
    worker_slot_peak: 1,
    rounds: 1,
    out_of_support_requests: 0,
    failed_attempts: 0
  };
  return {
    schema: 'axiom-replay-policy-evaluation.v0',
    status: 'inert-evaluation-evidence',
    evaluation_id: 'evaluation.boundary',
    candidate_policy: { policy_id: 'policy.candidate', policy_digest: H },
    baseline_policy: { policy_id: 'policy.baseline', policy_digest: H2 },
    world_pool: { pool_id: 'pool.holdout', pool_digest: H3, role: 'sealed-holdout' },
    objective: { objective_id: 'objective.example', objective_digest: H4 },
    runner: { runner_id: 'axiom-replay-engine.v0', runner_version: '0', runner_digest: H },
    world_results: [{
      world_id: world.world_id,
      world_digest: digestReplayWorld(world),
      candidate_run_digest: H2,
      baseline_run_digest: H3,
      compatibility: 'current-compatible'
    }],
    aggregate: {
      candidate_metrics: metrics,
      baseline_metrics: { ...metrics },
      relation: 'equivalent',
      no_worse_on_fixed_history: true,
      compared_world_count: 1,
      excluded_world_count: 0,
      out_of_support_requests: 0,
      failure_count: 0,
      regression_world_ids: []
    },
    claim_scope: 'fixed-replay-pool-and-objective-only',
    evaluated_at: '2026-09-16T15:00:00.000Z',
    authority_effect: 'none',
    network_effect: 'none',
    runtime_activation: false,
    production_promotion: false
  };
}

test('replay production modules import no effect-capable host or authority surface', async () => {
  const forbiddenImports = new Set([
    'node:fs', 'node:fs/promises', 'node:child_process', 'node:net', 'node:http',
    'node:https', 'node:dgram', 'node:dns', 'node:dns/promises', 'node:vm'
  ]);
  const forbiddenFragments = [
    'gateway', 'hypervisor', 'sandbox', 'grid', 'provider-supervisor', 'runtime-adapter',
    'credential', 'wallet'
  ];
  for (const { name, source } of await productionSources()) {
    for (const specifier of staticImportSpecifiers(source)) {
      assert.equal(forbiddenImports.has(specifier), false, `${name} imports forbidden host module ${specifier}`);
      const lower = specifier.toLowerCase();
      assert.equal(forbiddenFragments.some((fragment) => lower.includes(fragment)), false, `${name} imports effect/authority surface ${specifier}`);
    }
  }
});

test('replay production code uses no ambient credentials, live network, wall clock, or dynamic code execution', async () => {
  const forbiddenPatterns = [
    [/\bprocess\.env\b/, 'process.env'],
    [/\bfetch\s*\(/, 'fetch('],
    [/\bDate\.now\s*\(/, 'Date.now('],
    [/\bnew\s+Function\s*\(/, 'new Function('],
    [/(^|[^.\w])eval\s*\(/m, 'eval('],
    [/\bimport\s*\(/, 'dynamic import(']
  ];
  for (const { name, source } of await productionSources()) {
    for (const [pattern, label] of forbiddenPatterns) {
      assert.equal(pattern.test(source), false, `${name} contains forbidden ${label}`);
    }
  }
});

test('replay core exports no capability authorization activation deployment merge or promotion operation', async () => {
  const forbiddenExport = /export\s+(?:async\s+)?function\s+(?:authorize|activate|deploy|merge|promote|grant|issueCapability)/i;
  for (const { name, source } of await productionSources()) {
    assert.equal(forbiddenExport.test(source), false, `${name} exposes an authority/effect operation`);
  }
});

test('raw chain-of-thought credential and token fields fail closed as unknown discovery fields', () => {
  for (const [field, value] of [
    ['chain_of_thought', 'private reasoning'],
    ['credential', 'opaque'],
    ['provider_token', 'opaque']
  ]) {
    assert.throws(() => validateDiscoveryTrace({ ...makeDiscoveryTrace(), [field]: value }));
  }
});

test('candidate artifacts are never dynamically imported or evaluated by replay engine and Node vm is absent', async () => {
  const source = await readFile(new URL('../src/lib/replay-engine.mjs', import.meta.url), 'utf8');
  assert.equal(/\bimport\s*\(/.test(source), false);
  assert.equal(/\bnew\s+Function\s*\(/.test(source), false);
  assert.equal(/(^|[^.\w])eval\s*\(/m.test(source), false);
  assert.equal(staticImportSpecifiers(source).includes('node:vm'), false);
});

test('changing objective or evaluator binding changes the replay world digest', () => {
  const trace = makeDiscoveryTrace();
  const original = makeReplayWorld(trace);
  const changedObjective = makeReplayWorld(trace, { objective_digest: H2 });
  const changedEvaluator = makeReplayWorld(trace, { evaluator_digest: H3 });
  assert.notEqual(digestReplayWorld(original), digestReplayWorld(changedObjective));
  assert.notEqual(digestReplayWorld(original), digestReplayWorld(changedEvaluator));
});

test('negative or stale world evidence cannot be removed without changing pool digest', () => {
  const traceA = makeDiscoveryTrace({ trace_id: 'trace.a' });
  const traceB = makeDiscoveryTrace({ trace_id: 'trace.b' });
  const worldA = makeReplayWorld(traceA, { world_id: 'world.a' });
  const worldB = makeReplayWorld(traceB, { world_id: 'world.b', compiler: { compiler_digest: H2 } });
  const pool = {
    schema: 'axiom-replay-world-pool.v0',
    status: 'inert-world-pool',
    pool_id: 'pool.validation',
    cycle_id: 'cycle.1',
    role: 'validation',
    visibility: 'development-visible',
    worlds: [
      { world_id: 'world.a', world_digest: digestReplayWorld(worldA), compatibility: 'current-compatible' },
      { world_id: 'world.b', world_digest: digestReplayWorld(worldB), compatibility: 'historical-valid' }
    ],
    selection: { method: 'explicit', seed: null, evidence_ref: 'split.evidence', evidence_digest: H3 },
    created_at: '2026-09-16T15:00:00.000Z',
    authority_effect: 'none',
    network_effect: 'none',
    runtime_activation: false,
    production_promotion: false
  };
  const removed = { ...structuredClone(pool), worlds: [pool.worlds[0]] };
  assert.notEqual(digestReplayWorldPool(pool), digestReplayWorldPool(removed));
});

test('negative evaluation evidence is digest-bound and cannot disappear silently', () => {
  const world = makeReplayWorld(makeDiscoveryTrace());
  const evaluation = validateReplayPolicyEvaluation(evaluationFixture(world));
  const degraded = structuredClone(evaluation);
  degraded.aggregate.no_worse_on_fixed_history = false;
  degraded.aggregate.regression_world_ids = [world.world_id];
  degraded.aggregate.relation = 'worse';
  assert.doesNotThrow(() => validateReplayPolicyEvaluation(degraded));
  assert.notEqual(digestReplayPolicyEvaluation(evaluation), digestReplayPolicyEvaluation(degraded));
});
