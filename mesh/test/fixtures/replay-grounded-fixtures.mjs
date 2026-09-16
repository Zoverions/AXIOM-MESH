import { digestDiscoveryTrace } from '../../src/lib/discovery-trace.mjs';

export const H = 'a'.repeat(64);
export const H2 = 'b'.repeat(64);
export const H3 = 'c'.repeat(64);
export const H4 = 'd'.repeat(64);
export const H5 = 'e'.repeat(64);
export const H6 = 'f'.repeat(64);

function clone(value) {
  return structuredClone(value);
}

export function makeTraceNode(overrides = {}) {
  const base = {
    node_id: 'n1',
    primary_parent_id: 'root',
    creation_ordinal: 1,
    prefix_state_digest: H,
    attempt_digest: H2,
    state_snapshot: { ref: 'snapshot.n1', digest: H3 },
    candidate_artifact: { ref: 'candidate.n1', digest: H4 },
    evaluator_result: {
      ref: 'evaluation.n1',
      digest: H5,
      quality: { value: 730000, scale: 1000000 }
    },
    diagnostics: { ref: 'diagnostics.n1', digest: H6 },
    resources: {
      generation_calls: 1,
      evaluation_calls: 1,
      token_or_cost_units: 100,
      wall_clock_ms: 500,
      storage_bytes: 2048,
      worker_slots: 1,
      external_effects: 0
    },
    runtime: {
      runtime_ref: 'runtime.node24',
      model_ref: 'model.fixture',
      provider_ref: 'provider.fixture'
    },
    tool_capability_ids: ['tool.test'],
    receipt_refs: [],
    started_at: '2026-09-16T12:00:10.000Z',
    ended_at: '2026-09-16T12:00:20.000Z',
    termination: 'completed'
  };

  return {
    ...clone(base),
    ...clone(overrides),
    state_snapshot: { ...base.state_snapshot, ...(overrides.state_snapshot ?? {}) },
    candidate_artifact: { ...base.candidate_artifact, ...(overrides.candidate_artifact ?? {}) },
    evaluator_result: {
      ...base.evaluator_result,
      ...(overrides.evaluator_result ?? {}),
      quality: {
        ...base.evaluator_result.quality,
        ...(overrides.evaluator_result?.quality ?? {})
      }
    },
    diagnostics: { ...base.diagnostics, ...(overrides.diagnostics ?? {}) },
    resources: { ...base.resources, ...(overrides.resources ?? {}) },
    runtime: { ...base.runtime, ...(overrides.runtime ?? {}) },
    tool_capability_ids: clone(overrides.tool_capability_ids ?? base.tool_capability_ids),
    receipt_refs: clone(overrides.receipt_refs ?? base.receipt_refs)
  };
}

export function makeDiscoveryTrace(overrides = {}) {
  const nodes = overrides.nodes ?? [
    makeTraceNode(),
    makeTraceNode({
      node_id: 'n2',
      creation_ordinal: 2,
      prefix_state_digest: H2,
      attempt_digest: H3,
      state_snapshot: { ref: 'snapshot.n2', digest: H4 },
      candidate_artifact: { ref: 'candidate.n2', digest: H5 },
      evaluator_result: {
        ref: 'evaluation.n2',
        digest: H6,
        quality: { value: 650000, scale: 1000000 }
      },
      diagnostics: { ref: 'diagnostics.n2', digest: H },
      started_at: '2026-09-16T12:00:30.000Z',
      ended_at: '2026-09-16T12:00:40.000Z'
    }),
    makeTraceNode({
      node_id: 'n3',
      primary_parent_id: 'n1',
      creation_ordinal: 3,
      prefix_state_digest: H3,
      attempt_digest: H4,
      state_snapshot: { ref: 'snapshot.n3', digest: H5 },
      candidate_artifact: { ref: 'candidate.n3', digest: H6 },
      evaluator_result: {
        ref: 'evaluation.n3',
        digest: H,
        quality: { value: 800000, scale: 1000000 }
      },
      diagnostics: { ref: 'diagnostics.n3', digest: H2 },
      started_at: '2026-09-16T12:00:50.000Z',
      ended_at: '2026-09-16T12:01:00.000Z'
    })
  ];

  const base = {
    schema: 'axiom-discovery-trace.v0',
    status: 'inert-evidence',
    trace_id: 'trace.example',
    domain: 'coding',
    task_definition: { ref: 'task.example', digest: H },
    root_state: { node_id: 'root', state_ref: 'state.root', state_digest: H2 },
    online_policy: { policy_id: 'policy.baseline', artifact_digest: H3 },
    evaluator: { evaluator_id: 'eval.example', evaluator_digest: H4 },
    objective: { objective_id: 'objective.example', objective_digest: H5 },
    environment: { runtime_ref: 'runtime.node24', runtime_digest: H6 },
    resource_envelope: null,
    started_at: '2026-09-16T12:00:00.000Z',
    ended_at: '2026-09-16T12:05:00.000Z',
    privacy_class: 'owner-private',
    nodes,
    contains_secret_material: false,
    authority_effect: 'none',
    network_effect: 'none',
    runtime_activation: false,
    production_promotion: false
  };

  return {
    ...clone(base),
    ...clone(overrides),
    task_definition: { ...base.task_definition, ...(overrides.task_definition ?? {}) },
    root_state: { ...base.root_state, ...(overrides.root_state ?? {}) },
    online_policy: { ...base.online_policy, ...(overrides.online_policy ?? {}) },
    evaluator: { ...base.evaluator, ...(overrides.evaluator ?? {}) },
    objective: { ...base.objective, ...(overrides.objective ?? {}) },
    environment: { ...base.environment, ...(overrides.environment ?? {}) },
    nodes: clone(nodes)
  };
}

export function makeReplayWorld(trace = makeDiscoveryTrace(), overrides = {}) {
  const base = {
    schema: 'axiom-replay-world.v0',
    status: 'inert-replay-world',
    world_id: 'world.example',
    trace_id: trace.trace_id,
    trace_digest: digestDiscoveryTrace(trace),
    compiler: {
      compiler_id: 'axiom-replay-world-compiler.v0',
      compiler_version: '0',
      compiler_digest: H
    },
    evaluator_digest: trace.evaluator.evaluator_digest,
    objective_digest: trace.objective.objective_digest,
    semantics: {
      opening: 'root-children',
      child_reveal: 'after-parent-revealed',
      sibling_order: 'creation-ordinal',
      out_of_support: 'record-and-stop',
      terminal: 'stop-or-no-eligible-or-round-limit'
    },
    ceilings: {
      max_worker_slots: 2,
      max_rounds: 16
    },
    created_at: '2026-09-16T13:00:00.000Z',
    authority_effect: 'none',
    network_effect: 'none',
    runtime_activation: false,
    production_promotion: false
  };

  return {
    ...clone(base),
    ...clone(overrides),
    compiler: { ...base.compiler, ...(overrides.compiler ?? {}) },
    semantics: { ...base.semantics, ...(overrides.semantics ?? {}) },
    ceilings: { ...base.ceilings, ...(overrides.ceilings ?? {}) }
  };
}
