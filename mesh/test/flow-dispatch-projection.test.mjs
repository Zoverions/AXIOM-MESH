import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { sha256 } from '../src/lib/canonical.mjs';
import {
  FLOW_PLAN_SCHEMA,
  FLOW_PROPOSAL_SCHEMA,
  compileFlowProposal
} from '../src/lib/flow-compiler.mjs';
import {
  FLOW_DISPATCH_INPUT_SCHEMA,
  FLOW_DISPATCH_PROJECTION_SCHEMA,
  deriveFlowDispatchProjection,
  validateFlowDispatchInput,
  validateFlowDispatchProjection,
  verifyFlowDispatchProjection
} from '../src/lib/flow-dispatch-projection.mjs';

const A = 'a'.repeat(64);
const B = 'b'.repeat(64);
const C = 'c'.repeat(64);
const D = 'd'.repeat(64);
const E = 'e'.repeat(64);
const F = 'f'.repeat(64);
const EVALUATION_AT = '2026-09-18T17:00:00.000Z';

function proposal(overrides = {}) {
  const base = {
    schema: FLOW_PROPOSAL_SCHEMA,
    version: 0,
    status: 'inert-flow-proposal',
    flow_id: 'flow.orchestration.test.v1',
    task_digest: A,
    purpose_digest: B,
    completion: {
      required_step_ids: ['analyze'],
      on_blocked: 'stop',
      on_authority_missing: 'stop',
      on_budget_exhausted: 'stop',
      on_uncertain_effect: 'stop-and-escalate'
    },
    budget: {
      max_steps: 8,
      max_network_steps: 2,
      max_mutation_steps: 0,
      max_total_attempts: 8
    },
    steps: [
      {
        step_id: 'collect',
        operation_id: 'research.search',
        operation_manifest_digest: C,
        depends_on: [],
        required_capability_ids: ['research.read'],
        input_schema_digest: D,
        output_schema_digest: E,
        semantic_evidence_digests: [],
        effect_class: 'read',
        effect_scope: 'external',
        network: 'required',
        persistence: 'none',
        retry: {
          max_attempts: 1,
          backoff_ms: 0,
          idempotency_mode: 'intrinsic',
          idempotency_scope: 'step'
        },
        failure: {
          on_failure: 'stop',
          on_uncertain_completion: 'not-applicable'
        }
      },
      {
        step_id: 'analyze',
        operation_id: 'research.compare',
        operation_manifest_digest: D,
        depends_on: ['collect'],
        required_capability_ids: [],
        input_schema_digest: E,
        output_schema_digest: F,
        semantic_evidence_digests: [B],
        effect_class: 'pure',
        effect_scope: 'local',
        network: 'none',
        persistence: 'none',
        retry: {
          max_attempts: 1,
          backoff_ms: 0,
          idempotency_mode: 'none',
          idempotency_scope: null
        },
        failure: {
          on_failure: 'stop',
          on_uncertain_completion: 'not-applicable'
        }
      }
    ],
    authority_effect: 'none',
    execution_effect: 'none',
    network_effect: 'none',
    persistence_effect: 'none',
    credential_visibility: 'none',
    runtime_activation: false
  };
  return { ...base, ...overrides };
}

function node({
  node_id,
  kind,
  label = node_id,
  state,
  dependencies = [],
  artifact_digest = null,
  verification_result = 'not-applicable',
  verifier_ref = null,
  verification_evidence_digest = null,
  lineage_ref = null
}) {
  return {
    node_id,
    kind,
    label,
    state,
    dependencies,
    artifact_digest,
    verification_result,
    verifier_ref,
    verification_evidence_digest,
    lineage_ref
  };
}

function graph({
  collectState = 'ready',
  analyzeState = 'proposed',
  analyzeDependencies = ['task.collect'],
  extraNodes = []
} = {}) {
  return {
    schema: 'axiom-verified-work-graph.v0',
    version: '0.1.0',
    status: 'inert-evidence',
    graph_id: 'work.orchestration.test.001',
    subject_ref: 'repo:Zoverions/AXIOM-MESH',
    nodes: [
      node({
        node_id: 'goal',
        kind: 'goal',
        state: 'accepted'
      }),
      node({
        node_id: 'task.collect',
        kind: 'task',
        state: collectState,
        dependencies: ['goal'],
        lineage_ref: 'lineage.search'
      }),
      node({
        node_id: 'task.analyze',
        kind: 'task',
        state: analyzeState,
        dependencies: analyzeDependencies,
        lineage_ref: 'lineage.analyze'
      }),
      ...extraNodes
    ],
    created_at: '2026-09-18T16:30:00.000Z',
    contains_secret_material: false,
    authority_effect: 'none',
    network_effect: 'none',
    execution_authority: false
  };
}

function worker({
  worker_ref,
  runtime_ref = 'runtime.local',
  lineage_ref,
  operation_ids,
  capability_ids = [],
  max_concurrency = 1,
  can_verify = false
}) {
  return {
    worker_ref,
    runtime_ref,
    lineage_ref,
    operation_ids,
    capability_ids,
    max_concurrency,
    can_verify
  };
}

function defaultWorkers() {
  return [
    worker({
      worker_ref: 'worker.search',
      runtime_ref: 'runtime.search',
      lineage_ref: 'lineage.search',
      operation_ids: ['research.search'],
      capability_ids: ['research.read'],
      can_verify: true
    }),
    worker({
      worker_ref: 'worker.analyze',
      runtime_ref: 'runtime.analyze',
      lineage_ref: 'lineage.analyze',
      operation_ids: ['research.compare'],
      can_verify: false
    })
  ];
}

function binding(step_id, work_node_id, handoff_task_id = null) {
  return { step_id, work_node_id, handoff_task_id };
}

function handoff({
  task_id = 'handoff.collect',
  operation = 'research.search',
  state = 'queued',
  timeout_ms = 1000,
  created_at = '2026-09-18T16:00:00.000Z',
  updated_at = '2026-09-18T16:01:00.000Z'
} = {}) {
  const lifecycle = {
    state,
    created_at,
    updated_at
  };
  if (state === 'uncertain') {
    lifecycle.uncertainty_record_id = `uncertainty.${task_id}`;
  } else if (['completed', 'failed', 'cancelled', 'expired'].includes(state)) {
    lifecycle.terminal_receipt_id = `receipt.${task_id}`;
    if (state !== 'completed') lifecycle.state_reason = `reason.${state}`;
  } else if (state === 'blocked') {
    lifecycle.state_reason = 'blocked.upstream';
  }

  return {
    schema: 'axiom-task-artifact-handoff.v1',
    task_id,
    causal_id: `causal.${task_id}`,
    requester: {
      principal_id: 'principal.requester'
    },
    execution_target: {
      integration_id: 'runtime.search',
      integration_class: 'agent-runtime',
      catalog_entry_id: 'runtime.search',
      catalog_entry_version: '1.0.0',
      adapter_contract: {
        contract_id: 'adapter.search',
        contract_version: '1.0.0',
        contract_sha256: A
      }
    },
    request: {
      runtime_operation: operation,
      axiom_action: 'research.read',
      purpose: 'research',
      destinations: []
    },
    authority: {
      authority_source: 'axiom-gateway',
      grant_required_before_effect: true,
      coordination_is_authorization: false,
      handoff_transfers_authority: false,
      delegation_required_for_independent_child_authority: true
    },
    budgets: {
      timeout_ms
    },
    lifecycle,
    inputs: [],
    outputs: []
  };
}

function input({
  plan = compileFlowProposal(proposal()),
  workGraph = graph(),
  bindings = [
    binding('collect', 'task.collect'),
    binding('analyze', 'task.analyze')
  ],
  workers = defaultWorkers(),
  claims = [],
  handoffs = [],
  maxParallelTasks = 2,
  evaluationAt = EVALUATION_AT
} = {}) {
  return {
    schema: FLOW_DISPATCH_INPUT_SCHEMA,
    version: 0,
    status: 'inert-dispatch-input',
    plan,
    work_graph: workGraph,
    bindings,
    workers,
    claims,
    handoffs,
    policy: {
      max_parallel_tasks: maxParallelTasks,
      require_independent_verification: true
    },
    evaluation_at: evaluationAt,
    authority_effect: 'none',
    execution_effect: 'none',
    network_effect: 'none',
    persistence_effect: 'none',
    credential_visibility: 'none',
    runtime_activation: false
  };
}

function activeClaim({
  claim_id = 'claim.collect.1',
  step_id = 'collect',
  worker_ref = 'worker.search',
  claimed_at = '2026-09-18T16:50:00.000Z',
  expires_at = '2026-09-18T17:10:00.000Z',
  generation = 1
} = {}) {
  return {
    claim_id,
    step_id,
    worker_ref,
    generation,
    claimed_at,
    expires_at
  };
}

function clone(value) {
  return structuredClone(value);
}

test('derives deterministic inert dispatch for the first ready step', () => {
  const source = input();
  const projection = deriveFlowDispatchProjection(source);

  const validatedInput = validateFlowDispatchInput(source);
  assert.equal(projection.schema, FLOW_DISPATCH_PROJECTION_SCHEMA);
  assert.equal(projection.plan_digest, source.plan.plan_digest);
  assert.equal(validatedInput.valid, true);
  assert.equal(projection.work_graph_digest, validatedInput.work_graph_digest);
  assert.equal(projection.dispatch_input_digest, validatedInput.dispatch_input_digest);
  assert.equal(validateFlowDispatchProjection(projection).valid, true);
  assert.equal(verifyFlowDispatchProjection(source, projection), true);
  assert.deepEqual(projection.completed_step_ids, []);
  assert.deepEqual(projection.ready_step_ids, ['collect']);
  assert.deepEqual(projection.claimed_step_ids, []);
  assert.deepEqual(projection.dispatch_proposals, [
    {
      step_id: 'collect',
      candidate_worker_refs: ['worker.search'],
      selected_worker_ref: 'worker.search',
      selection_reason: 'single-eligible-worker'
    }
  ]);
  assert.deepEqual(
    projection.blocked_steps.find(entry => entry.step_id === 'analyze').reasons,
    ['work-task-not-ready']
  );
  assert.equal(projection.requires_authority_before_effect, true);
  assert.equal(projection.authority_effect, 'none');
  assert.equal(projection.execution_effect, 'none');
  assert.equal(projection.network_effect, 'none');
  assert.equal(projection.persistence_effect, 'none');
  assert.equal(projection.credential_visibility, 'none');
  assert.equal(projection.runtime_activation, false);
  assert.equal(Object.isFrozen(projection), true);
});

test('wakes downstream work only after flow and work-graph predecessors are accepted', () => {
  const blockedGraph = graph({
    collectState: 'ready',
    analyzeState: 'ready'
  });
  const blockedProjection = deriveFlowDispatchProjection(input({ workGraph: blockedGraph }));

  assert.deepEqual(blockedProjection.ready_step_ids, ['collect']);
  assert.deepEqual(
    blockedProjection.blocked_steps.find(entry => entry.step_id === 'analyze').reasons,
    ['dependency-not-accepted:collect', 'work-dependency-not-accepted:task.collect']
  );

  const releasedGraph = graph({
    collectState: 'accepted',
    analyzeState: 'ready'
  });
  const releasedProjection = deriveFlowDispatchProjection(input({ workGraph: releasedGraph }));

  assert.deepEqual(releasedProjection.completed_step_ids, ['collect']);
  assert.deepEqual(releasedProjection.ready_step_ids, ['analyze']);
  assert.equal(
    releasedProjection.dispatch_proposals.find(entry => entry.step_id === 'analyze').selected_worker_ref,
    'worker.analyze'
  );
});

test('active claims prevent duplicate dispatch while expired claims produce reclaim proposals only', () => {
  const active = activeClaim();
  const activeProjection = deriveFlowDispatchProjection(input({ claims: [active] }));

  assert.deepEqual(activeProjection.claimed_step_ids, ['collect']);
  assert.deepEqual(activeProjection.ready_step_ids, []);
  assert.deepEqual(
    activeProjection.blocked_steps.find(entry => entry.step_id === 'collect').reasons,
    ['active-claim:claim.collect.1']
  );
  assert.equal(activeProjection.dispatch_proposals.length, 0);
  assert.equal(activeProjection.reclaim_proposals.length, 0);

  const expired = activeClaim({
    claim_id: 'claim.collect.expired',
    expires_at: '2026-09-18T16:59:59.000Z'
  });
  const expiredProjection = deriveFlowDispatchProjection(input({ claims: [expired] }));

  assert.deepEqual(expiredProjection.ready_step_ids, ['collect']);
  assert.deepEqual(expiredProjection.reclaim_proposals, [
    {
      claim_id: 'claim.collect.expired',
      step_id: 'collect',
      worker_ref: 'worker.search',
      expired_at: '2026-09-18T16:59:59.000Z'
    }
  ]);
  assert.equal(expiredProjection.reclaim_proposals[0].step_id, 'collect');
  assert.equal(Object.hasOwn(expiredProjection.reclaim_proposals[0], 'authorized'), false);
});

test('conflicting active claims and worker over-allocation fail closed', () => {
  const first = activeClaim({ claim_id: 'claim.one' });
  const second = activeClaim({ claim_id: 'claim.two' });
  assert.throws(
    () => deriveFlowDispatchProjection(input({ claims: [first, second] })),
    /conflicting active claims/i
  );

  const plan = compileFlowProposal(proposal({
    steps: proposal().steps.map(step => ({ ...step, depends_on: [] }))
  }));
  const readyGraph = graph({
    collectState: 'ready',
    analyzeState: 'ready',
    analyzeDependencies: ['goal']
  });
  const oneWorker = worker({
    worker_ref: 'worker.shared',
    lineage_ref: 'lineage.shared',
    operation_ids: ['research.search', 'research.compare'],
    capability_ids: ['research.read'],
    max_concurrency: 1
  });
  const claims = [
    activeClaim({
      claim_id: 'claim.collect',
      step_id: 'collect',
      worker_ref: 'worker.shared'
    }),
    activeClaim({
      claim_id: 'claim.analyze',
      step_id: 'analyze',
      worker_ref: 'worker.shared'
    })
  ];

  assert.throws(
    () => deriveFlowDispatchProjection(input({
      plan,
      workGraph: readyGraph,
      workers: [oneWorker],
      claims
    })),
    /exceeds max_concurrency/i
  );
});

test('campaign concurrency ceiling selects only work that fits remaining capacity', () => {
  const parallelProposal = proposal();
  parallelProposal.steps.find(step => step.step_id === 'analyze').depends_on = [];
  const plan = compileFlowProposal(parallelProposal);
  const readyGraph = graph({
    collectState: 'ready',
    analyzeState: 'ready',
    analyzeDependencies: ['goal']
  });

  const projection = deriveFlowDispatchProjection(input({
    plan,
    workGraph: readyGraph,
    maxParallelTasks: 1
  }));

  assert.deepEqual(projection.ready_step_ids, ['analyze', 'collect']);
  assert.equal(projection.metrics.dispatches_selected, 1);
  const analyze = projection.dispatch_proposals.find(entry => entry.step_id === 'analyze');
  const collect = projection.dispatch_proposals.find(entry => entry.step_id === 'collect');
  assert.equal(analyze.selected_worker_ref, 'worker.analyze');
  assert.equal(analyze.selection_reason, 'single-eligible-worker');
  assert.equal(collect.selected_worker_ref, null);
  assert.equal(collect.selection_reason, 'campaign-concurrency-exhausted');
});

test('ambiguous worker candidates remain unresolved instead of being hidden behind a tie-break', () => {
  const extraSearch = worker({
    worker_ref: 'worker.search.second',
    runtime_ref: 'runtime.search.second',
    lineage_ref: 'lineage.search.second',
    operation_ids: ['research.search'],
    capability_ids: ['research.read']
  });
  const projection = deriveFlowDispatchProjection(input({
    workers: [...defaultWorkers(), extraSearch]
  }));

  const collect = projection.dispatch_proposals.find(entry => entry.step_id === 'collect');
  assert.deepEqual(collect.candidate_worker_refs, ['worker.search', 'worker.search.second']);
  assert.equal(collect.selected_worker_ref, null);
  assert.equal(collect.selection_reason, 'ambiguous-worker-candidates');
});

test('uncertain handoff blocks optimistic wake-up and operation substitution is rejected', () => {
  const uncertain = handoff({ state: 'uncertain' });
  const source = input({
    bindings: [
      binding('collect', 'task.collect', 'handoff.collect'),
      binding('analyze', 'task.analyze')
    ],
    handoffs: [uncertain]
  });
  const projection = deriveFlowDispatchProjection(source);

  assert.deepEqual(projection.ready_step_ids, []);
  assert.deepEqual(
    projection.blocked_steps.find(entry => entry.step_id === 'collect').reasons,
    ['handoff-uncertain']
  );

  const substituted = clone(source);
  substituted.handoffs[0].request.runtime_operation = 'research.other';
  assert.throws(
    () => deriveFlowDispatchProjection(substituted),
    /handoff operation does not match flow step/i
  );
});

test('dispatch input digest binds the exact validated handoff envelope', () => {
  const first = input({
    bindings: [
      binding('collect', 'task.collect', 'handoff.collect'),
      binding('analyze', 'task.analyze')
    ],
    handoffs: [handoff({ state: 'queued', timeout_ms: 1000 })]
  });
  const second = clone(first);
  second.handoffs[0].budgets.timeout_ms = 2000;

  const firstDigest = validateFlowDispatchInput(first).dispatch_input_digest;
  const secondDigest = validateFlowDispatchInput(second).dispatch_input_digest;
  assert.notEqual(firstDigest, secondDigest);
});

test('independent verifier assignment excludes the producer lineage', () => {
  const artifact = node({
    node_id: 'artifact.collect',
    kind: 'artifact',
    state: 'accepted',
    dependencies: ['task.collect'],
    artifact_digest: sha256('artifact.collect'),
    lineage_ref: 'lineage.search'
  });
  const workGraph = graph({
    collectState: 'accepted',
    analyzeState: 'ready',
    extraNodes: [artifact]
  });
  const verifier = worker({
    worker_ref: 'worker.verify',
    runtime_ref: 'runtime.verify',
    lineage_ref: 'lineage.verify',
    operation_ids: [],
    capability_ids: [],
    can_verify: true
  });

  const projection = deriveFlowDispatchProjection(input({
    workGraph,
    workers: [...defaultWorkers(), verifier]
  }));
  const verification = projection.verification_proposals.find(
    entry => entry.artifact_node_id === 'artifact.collect'
  );

  assert.deepEqual(verification.candidate_verifier_refs, ['worker.verify']);
  assert.equal(verification.selected_verifier_ref, 'worker.verify');
  assert.equal(verification.selection_reason, 'single-independent-verifier');

  const noIndependent = deriveFlowDispatchProjection(input({
    workGraph,
    workers: defaultWorkers()
  })).verification_proposals.find(
    entry => entry.artifact_node_id === 'artifact.collect'
  );
  assert.deepEqual(noIndependent.candidate_verifier_refs, []);
  assert.equal(noIndependent.selected_verifier_ref, null);
  assert.equal(noIndependent.selection_reason, 'no-independent-verifier');
});

test('semantically equivalent input ordering has the same input and projection digests', () => {
  const first = input({
    claims: [
      activeClaim({
        claim_id: 'claim.collect.old',
        step_id: 'collect',
        worker_ref: 'worker.search',
        claimed_at: '2026-09-18T16:40:00.000Z',
        expires_at: '2026-09-18T16:45:00.000Z'
      }),
      activeClaim({
        claim_id: 'claim.analyze.old',
        step_id: 'analyze',
        worker_ref: 'worker.analyze',
        claimed_at: '2026-09-18T16:42:00.000Z',
        expires_at: '2026-09-18T16:46:00.000Z'
      })
    ]
  });
  const second = clone(first);
  second.bindings.reverse();
  second.workers.reverse();
  second.claims.reverse();
  second.work_graph.nodes.reverse();

  const firstValidated = validateFlowDispatchInput(first);
  const secondValidated = validateFlowDispatchInput(second);
  assert.equal(firstValidated.dispatch_input_digest, secondValidated.dispatch_input_digest);
  assert.equal(
    deriveFlowDispatchProjection(first).projection_digest,
    deriveFlowDispatchProjection(second).projection_digest
  );
});

test('unknown authority credential and promotion-shaped fields fail closed', () => {
  const topLevel = input();
  topLevel.authorized = true;
  assert.throws(
    () => deriveFlowDispatchProjection(topLevel),
    /unknown field authorized/i
  );

  const credential = input();
  credential.workers[0].credential = 'secret';
  assert.throws(
    () => deriveFlowDispatchProjection(credential),
    /unknown field credential/i
  );

  for (const field of ['grant', 'merge', 'deployment', 'execute']) {
    const injected = input();
    injected[field] = true;
    assert.throws(
      () => deriveFlowDispatchProjection(injected),
      new RegExp(`unknown field ${field}`, 'i')
    );
  }
});

test('projection tampering is detected by its content digest', () => {
  const projection = clone(deriveFlowDispatchProjection(input()));
  projection.metrics.dispatches_selected = 0;
  assert.throws(
    () => validateFlowDispatchProjection(projection),
    /digest mismatch/i
  );
});

test('flow-dispatch module has no direct live IO execution credential or persistence path', async () => {
  const source = await readFile(
    new URL('../src/lib/flow-dispatch-projection.mjs', import.meta.url),
    'utf8'
  );
  const imports = [...source.matchAll(/from\s+['"]([^'"]+)['"]/g)].map(match => match[1]);

  assert.deepEqual(imports.sort(), [
    './canonical.mjs',
    './flow-compiler.mjs',
    './runtime-connector-fabric-contracts.mjs',
    './verified-work-graph.mjs'
  ].sort());
  assert.equal(/node:(?:fs|http|https|net|tls|child_process)/.test(source), false);
  assert.equal(/\bfetch\s*\(/.test(source), false);
  assert.equal(/\bprocess\./.test(source), false);
  assert.equal(/\bwriteFile(?:Sync)?\s*\(/.test(source), false);
  assert.equal(/\bspawn(?:Sync)?\s*\(/.test(source), false);
  assert.equal(/\bexec(?:File|FileSync|Sync)?\s*\(/.test(source), false);
});

test('supports the Flow Compiler v0 maximum step count without widening authority', () => {
  const steps = [];
  const nodes = [
    node({ node_id: 'goal', kind: 'goal', state: 'accepted' })
  ];
  const bindings = [];
  const operationIds = [];

  for (let index = 0; index < 64; index += 1) {
    const stepId = `step.${String(index).padStart(2, '0')}`;
    const operationId = `operation.${String(index).padStart(2, '0')}`;
    operationIds.push(operationId);
    steps.push({
      step_id: stepId,
      operation_id: operationId,
      operation_manifest_digest: sha256(`manifest.${index}`),
      depends_on: index === 0 ? [] : [`step.${String(index - 1).padStart(2, '0')}`],
      required_capability_ids: [],
      input_schema_digest: sha256(`input.${index}`),
      output_schema_digest: sha256(`output.${index}`),
      semantic_evidence_digests: [],
      effect_class: 'pure',
      effect_scope: 'local',
      network: 'none',
      persistence: 'none',
      retry: {
        max_attempts: 1,
        backoff_ms: 0,
        idempotency_mode: 'none',
        idempotency_scope: null
      },
      failure: {
        on_failure: 'stop',
        on_uncertain_completion: 'not-applicable'
      }
    });
    nodes.push(node({
      node_id: `task.${String(index).padStart(2, '0')}`,
      kind: 'task',
      state: index === 0 ? 'ready' : 'proposed',
      dependencies: index === 0
        ? ['goal']
        : [`task.${String(index - 1).padStart(2, '0')}`],
      lineage_ref: 'lineage.scale'
    }));
    bindings.push(binding(
      stepId,
      `task.${String(index).padStart(2, '0')}`
    ));
  }

  const scaleProposal = proposal({
    flow_id: 'flow.orchestration.scale.v1',
    completion: {
      ...proposal().completion,
      required_step_ids: ['step.63']
    },
    budget: {
      max_steps: 64,
      max_network_steps: 0,
      max_mutation_steps: 0,
      max_total_attempts: 64
    },
    steps
  });
  const plan = compileFlowProposal(scaleProposal);
  assert.equal(plan.schema, FLOW_PLAN_SCHEMA);

  const workGraph = {
    ...graph(),
    graph_id: 'work.orchestration.scale.001',
    nodes
  };
  const scaleWorker = worker({
    worker_ref: 'worker.scale',
    runtime_ref: 'runtime.scale',
    lineage_ref: 'lineage.scale',
    operation_ids: operationIds,
    capability_ids: [],
    max_concurrency: 64
  });

  const projection = deriveFlowDispatchProjection(input({
    plan,
    workGraph,
    bindings,
    workers: [scaleWorker],
    maxParallelTasks: 64
  }));

  assert.equal(projection.metrics.flow_steps, 64);
  assert.deepEqual(projection.ready_step_ids, ['step.00']);
  assert.equal(projection.dispatch_proposals[0].selected_worker_ref, 'worker.scale');
  assert.equal(projection.authority_effect, 'none');
  assert.equal(projection.execution_effect, 'none');
});


test('rejects duplicate non-null handoff bindings across flow steps', () => {
  const shared = handoff();
  const source = input({
    bindings: [
      binding('collect', 'task.collect', 'handoff.collect'),
      binding('analyze', 'task.analyze', 'handoff.collect')
    ],
    handoffs: [shared]
  });

  assert.throws(
    () => deriveFlowDispatchProjection(source),
    /duplicate handoff_task_id/i
  );
});

test('accepted task cannot launder unmet flow or work-graph dependencies into completion', () => {
  const inconsistent = graph({
    collectState: 'ready',
    analyzeState: 'accepted'
  });
  const projection = deriveFlowDispatchProjection(input({ workGraph: inconsistent }));

  assert.equal(projection.completed_step_ids.includes('analyze'), false);
  assert.deepEqual(
    projection.blocked_steps.find(entry => entry.step_id === 'analyze').reasons,
    ['dependency-not-accepted:collect', 'work-dependency-not-accepted:task.collect']
  );
});

test('rejected and blocked work dependencies preserve their terminal blocker state', () => {
  for (const state of ['rejected', 'blocked']) {
    const workGraph = graph({
      collectState: state,
      analyzeState: 'ready'
    });
    const projection = deriveFlowDispatchProjection(input({ workGraph }));
    const analyze = projection.blocked_steps.find(entry => entry.step_id === 'analyze');

    assert.ok(analyze.reasons.includes(`work-dependency-${state}:task.collect`));
    assert.ok(analyze.reasons.includes('dependency-not-accepted:collect'));
  }
});

test('handoff-bound dispatch requires a compatible worker for the exact runtime target', () => {
  const queued = handoff({ state: 'queued' });
  const wrongRuntime = worker({
    worker_ref: 'worker.search.wrong-runtime',
    runtime_ref: 'runtime.other',
    lineage_ref: 'lineage.search.other',
    operation_ids: ['research.search'],
    capability_ids: ['research.read']
  });
  const incompatible = input({
    bindings: [
      binding('collect', 'task.collect', 'handoff.collect'),
      binding('analyze', 'task.analyze')
    ],
    workers: [
      wrongRuntime,
      defaultWorkers().find(entry => entry.worker_ref === 'worker.analyze')
    ],
    handoffs: [queued]
  });

  assert.throws(
    () => deriveFlowDispatchProjection(incompatible),
    /handoff target has no compatible worker runtime/i
  );

  const compatible = input({
    bindings: [
      binding('collect', 'task.collect', 'handoff.collect'),
      binding('analyze', 'task.analyze')
    ],
    handoffs: [queued]
  });
  const projection = deriveFlowDispatchProjection(compatible);
  assert.deepEqual(projection.ready_step_ids, []);
  assert.ok(
    projection.blocked_steps.find(entry => entry.step_id === 'collect').reasons.includes(
      'handoff-active:queued'
    )
  );
});

test('completed handoff cannot make a not-yet-accepted work task redispatchable', () => {
  const completed = handoff({ state: 'completed' });
  const source = input({
    workGraph: graph({ collectState: 'ready' }),
    bindings: [
      binding('collect', 'task.collect', 'handoff.collect'),
      binding('analyze', 'task.analyze')
    ],
    handoffs: [completed]
  });
  const projection = deriveFlowDispatchProjection(source);

  assert.deepEqual(projection.ready_step_ids, []);
  assert.ok(
    projection.blocked_steps.find(entry => entry.step_id === 'collect').reasons.includes(
      'handoff-completed-work-not-accepted'
    )
  );
});

test('future-dated graph and handoff evidence is rejected at the evaluation boundary', () => {
  const futureGraph = graph();
  futureGraph.created_at = '2026-09-18T17:00:01.000Z';
  assert.throws(
    () => deriveFlowDispatchProjection(input({ workGraph: futureGraph })),
    /work graph was created after evaluation_at/i
  );

  const futureHandoff = handoff({
    state: 'queued',
    updated_at: '2026-09-18T17:00:01.000Z'
  });
  assert.throws(
    () => deriveFlowDispatchProjection(input({
      bindings: [
        binding('collect', 'task.collect', 'handoff.collect'),
        binding('analyze', 'task.analyze')
      ],
      handoffs: [futureHandoff]
    })),
    /lifecycle evidence after evaluation_at/i
  );
});

test('accepted pass only suppresses review when verifier lineage is known and independent', () => {
  const artifact = node({
    node_id: 'artifact.collect',
    kind: 'artifact',
    state: 'accepted',
    dependencies: ['task.collect'],
    artifact_digest: sha256('artifact.collect.independence'),
    lineage_ref: 'lineage.search'
  });
  const sameLineagePass = node({
    node_id: 'verification.same',
    kind: 'verification',
    state: 'accepted',
    dependencies: ['artifact.collect'],
    verification_result: 'pass',
    verifier_ref: 'worker.search',
    verification_evidence_digest: sha256('verification.same'),
    lineage_ref: 'lineage.search'
  });
  const independentPass = node({
    node_id: 'verification.independent',
    kind: 'verification',
    state: 'accepted',
    dependencies: ['artifact.collect'],
    verification_result: 'pass',
    verifier_ref: 'worker.verify',
    verification_evidence_digest: sha256('verification.independent'),
    lineage_ref: 'lineage.verify'
  });
  const verifier = worker({
    worker_ref: 'worker.verify',
    runtime_ref: 'runtime.verify',
    lineage_ref: 'lineage.verify',
    operation_ids: [],
    can_verify: true
  });

  const sameLineageGraph = graph({
    collectState: 'accepted',
    analyzeState: 'proposed',
    extraNodes: [artifact, sameLineagePass]
  });
  const sameLineageProjection = deriveFlowDispatchProjection(input({
    workGraph: sameLineageGraph,
    workers: [...defaultWorkers(), verifier]
  }));
  assert.equal(sameLineageProjection.verification_proposals.length, 1);
  assert.equal(
    sameLineageProjection.verification_proposals[0].selected_verifier_ref,
    'worker.verify'
  );

  const independentGraph = graph({
    collectState: 'accepted',
    analyzeState: 'proposed',
    extraNodes: [artifact, independentPass]
  });
  const independentProjection = deriveFlowDispatchProjection(input({
    workGraph: independentGraph,
    workers: [...defaultWorkers(), verifier]
  }));
  assert.deepEqual(independentProjection.verification_proposals, []);
});

test('verifier selection respects worker and campaign capacity', () => {
  const artifact = node({
    node_id: 'artifact.collect',
    kind: 'artifact',
    state: 'accepted',
    dependencies: ['task.collect'],
    artifact_digest: sha256('artifact.collect.capacity'),
    lineage_ref: 'lineage.search'
  });
  const workGraph = graph({
    collectState: 'accepted',
    analyzeState: 'ready',
    extraNodes: [artifact]
  });
  const verifier = worker({
    worker_ref: 'worker.verify',
    runtime_ref: 'runtime.verify',
    lineage_ref: 'lineage.verify',
    operation_ids: ['research.compare'],
    max_concurrency: 1,
    can_verify: true
  });
  const workers = [
    defaultWorkers().find(entry => entry.worker_ref === 'worker.search'),
    worker({
      worker_ref: 'worker.analyze',
      runtime_ref: 'runtime.analyze',
      lineage_ref: 'lineage.analyze',
      operation_ids: ['research.compare'],
      can_verify: false
    }),
    verifier
  ];
  const claim = activeClaim({
    claim_id: 'claim.verify.busy',
    step_id: 'analyze',
    worker_ref: 'worker.verify'
  });

  const workerLimited = deriveFlowDispatchProjection(input({
    workGraph,
    workers,
    claims: [claim],
    maxParallelTasks: 2
  }));
  const workerProposal = workerLimited.verification_proposals[0];
  assert.deepEqual(workerProposal.candidate_verifier_refs, []);
  assert.equal(workerProposal.selected_verifier_ref, null);
  assert.equal(workerProposal.selection_reason, 'verifier-capacity-exhausted');

  const campaignVerifier = {
    ...verifier,
    operation_ids: []
  };
  const campaignLimited = deriveFlowDispatchProjection(input({
    workGraph,
    workers: [...defaultWorkers(), campaignVerifier],
    maxParallelTasks: 1
  }));
  const campaignProposal = campaignLimited.verification_proposals[0];
  assert.equal(
    campaignLimited.dispatch_proposals.find(entry => entry.step_id === 'analyze').selected_worker_ref,
    'worker.analyze'
  );
  assert.equal(campaignProposal.selected_verifier_ref, null);
  assert.equal(campaignProposal.selection_reason, 'campaign-concurrency-exhausted');
});

test('canonical dispatch ordering uses code-unit order for punctuation-bearing identifiers', () => {
  const first = worker({
    worker_ref: 'worker:search',
    runtime_ref: 'runtime.search',
    lineage_ref: 'lineage:a',
    operation_ids: ['research.search'],
    capability_ids: ['research.read']
  });
  const second = worker({
    worker_ref: 'worker.search',
    runtime_ref: 'runtime.search',
    lineage_ref: 'lineage.b',
    operation_ids: ['research.search'],
    capability_ids: ['research.read']
  });
  const projection = deriveFlowDispatchProjection(input({
    workers: [
      defaultWorkers().find(entry => entry.worker_ref === 'worker.analyze'),
      first,
      second
    ]
  }));
  const collect = projection.dispatch_proposals.find(entry => entry.step_id === 'collect');

  assert.deepEqual(collect.candidate_worker_refs, ['worker.search', 'worker:search']);
  assert.equal(collect.selection_reason, 'ambiguous-worker-candidates');
});


test('claim worker runtime must match a bound handoff target', () => {
  const source = input({
    bindings: [
      binding('collect', 'task.collect', 'handoff.collect'),
      binding('analyze', 'task.analyze')
    ],
    workers: [
      ...defaultWorkers(),
      worker({
        worker_ref: 'worker.search.other',
        runtime_ref: 'runtime.other',
        lineage_ref: 'lineage.other',
        operation_ids: ['research.search'],
        capability_ids: ['research.read']
      })
    ],
    claims: [
      activeClaim({
        claim_id: 'claim.collect.wrong-runtime',
        worker_ref: 'worker.search.other'
      })
    ],
    handoffs: [handoff({ state: 'running' })]
  });

  assert.throws(
    () => deriveFlowDispatchProjection(source),
    /worker is not compatible with claimed step/i
  );
});
