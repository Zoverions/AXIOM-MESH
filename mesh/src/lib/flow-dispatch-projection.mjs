import { digestObject, ValidationError } from './canonical.mjs';
import { validateFlowPlan } from './flow-compiler.mjs';
import {
  validateVerifiedWorkGraph,
  verifiedWorkGraphDigest
} from './verified-work-graph.mjs';
import { validateTaskArtifactHandoff } from './runtime-connector-fabric-contracts.mjs';

export const FLOW_DISPATCH_INPUT_SCHEMA = 'axiom-flow-dispatch-input.v0';
export const FLOW_DISPATCH_PROJECTION_SCHEMA = 'axiom-flow-dispatch-projection.v0';

const VERSION = 0;
const INPUT_STATUS = 'inert-dispatch-input';
const PROJECTION_STATUS = 'inert-dispatch-projection';
const IDENTIFIER_RE = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,191}$/;
const ISO_TIMESTAMP_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;
const ZERO_DIGEST = '0'.repeat(64);

function compareCodeUnits(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

const INPUT_FIELDS = Object.freeze([
  'schema',
  'version',
  'status',
  'plan',
  'work_graph',
  'bindings',
  'workers',
  'claims',
  'handoffs',
  'policy',
  'evaluation_at',
  'authority_effect',
  'execution_effect',
  'network_effect',
  'persistence_effect',
  'credential_visibility',
  'runtime_activation'
]);

const BINDING_FIELDS = Object.freeze([
  'step_id',
  'work_node_id',
  'handoff_task_id'
]);

const WORKER_FIELDS = Object.freeze([
  'worker_ref',
  'runtime_ref',
  'lineage_ref',
  'operation_ids',
  'capability_ids',
  'max_concurrency',
  'can_verify'
]);

const CLAIM_FIELDS = Object.freeze([
  'claim_id',
  'step_id',
  'worker_ref',
  'generation',
  'claimed_at',
  'expires_at'
]);

const POLICY_FIELDS = Object.freeze([
  'max_parallel_tasks',
  'require_independent_verification'
]);

const PROJECTION_FIELDS = Object.freeze([
  'schema',
  'version',
  'status',
  'flow_id',
  'plan_digest',
  'work_graph_digest',
  'dispatch_input_digest',
  'completed_step_ids',
  'claimed_step_ids',
  'ready_step_ids',
  'blocked_steps',
  'dispatch_proposals',
  'reclaim_proposals',
  'verification_proposals',
  'metrics',
  'requires_authority_before_effect',
  'projection_digest',
  'authority_effect',
  'execution_effect',
  'network_effect',
  'persistence_effect',
  'credential_visibility',
  'runtime_activation'
]);

const BLOCKED_FIELDS = Object.freeze(['step_id', 'reasons']);
const DISPATCH_FIELDS = Object.freeze([
  'step_id',
  'candidate_worker_refs',
  'selected_worker_ref',
  'selection_reason'
]);
const RECLAIM_FIELDS = Object.freeze([
  'claim_id',
  'step_id',
  'worker_ref',
  'expired_at'
]);
const VERIFY_FIELDS = Object.freeze([
  'artifact_node_id',
  'producer_lineage_ref',
  'candidate_verifier_refs',
  'selected_verifier_ref',
  'selection_reason'
]);
const METRIC_FIELDS = Object.freeze([
  'flow_steps',
  'completed_steps',
  'claimed_steps',
  'ready_steps',
  'blocked_steps',
  'dispatches_selected',
  'reclaims_proposed',
  'verifications_required',
  'verifiers_selected',
  'active_claims'
]);

function requirePlain(value, name) {
  if (
    value === null
    || typeof value !== 'object'
    || Array.isArray(value)
    || (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null)
  ) {
    throw new ValidationError(`${name} must be a plain object`);
  }
  return value;
}

function requireFields(value, fields, name) {
  requirePlain(value, name);
  for (const field of fields) {
    if (!Object.hasOwn(value, field)) {
      throw new ValidationError(`${name} is missing required field ${field}`);
    }
  }
}

function rejectUnknown(value, fields, name) {
  const allowed = new Set(fields);
  for (const field of Object.keys(value)) {
    if (!allowed.has(field)) {
      throw new ValidationError(`${name} contains unknown field ${field}`);
    }
  }
}

function requireIdentifier(value, name) {
  if (typeof value !== 'string' || !IDENTIFIER_RE.test(value)) {
    throw new ValidationError(`${name} must be a bounded identifier`);
  }
  return value;
}

function requireNullableIdentifier(value, name) {
  if (value === null) return null;
  return requireIdentifier(value, name);
}

function requireBoundedString(value, name, maxLength = 256) {
  if (typeof value !== 'string' || value.length < 1 || value.length > maxLength) {
    throw new ValidationError(`${name} must be a bounded non-empty string`);
  }
  return value;
}

function requireInteger(value, name, min, max) {
  if (!Number.isSafeInteger(value) || value < min || value > max) {
    throw new ValidationError(`${name} must be an integer in [${min}, ${max}]`);
  }
  return value;
}

function requireBoolean(value, name) {
  if (typeof value !== 'boolean') {
    throw new ValidationError(`${name} must be boolean`);
  }
  return value;
}

function requireTimestamp(value, name) {
  if (
    typeof value !== 'string'
    || value.length > 32
    || !ISO_TIMESTAMP_RE.test(value)
    || !Number.isFinite(Date.parse(value))
  ) {
    throw new ValidationError(`${name} must be an ISO-8601 UTC timestamp`);
  }
  return value;
}

function requireUniqueIdentifiers(value, name, maxItems = 256) {
  if (!Array.isArray(value) || value.length > maxItems) {
    throw new ValidationError(`${name} must be an array with at most ${maxItems} items`);
  }
  const seen = new Set();
  for (const [index, item] of value.entries()) {
    requireIdentifier(item, `${name}[${index}]`);
    if (seen.has(item)) throw new ValidationError(`${name} contains duplicate values`);
    seen.add(item);
  }
  return value;
}

function requireBoundary(value, name) {
  if (
    value.authority_effect !== 'none'
    || value.execution_effect !== 'none'
    || value.network_effect !== 'none'
    || value.persistence_effect !== 'none'
    || value.credential_visibility !== 'none'
    || value.runtime_activation !== false
  ) {
    throw new ValidationError(`${name} boundary effect is invalid`);
  }
}

function validateBinding(binding, index) {
  const name = `bindings[${index}]`;
  requireFields(binding, BINDING_FIELDS, name);
  rejectUnknown(binding, BINDING_FIELDS, name);
  requireIdentifier(binding.step_id, `${name}.step_id`);
  requireIdentifier(binding.work_node_id, `${name}.work_node_id`);
  requireNullableIdentifier(binding.handoff_task_id, `${name}.handoff_task_id`);
  return {
    step_id: binding.step_id,
    work_node_id: binding.work_node_id,
    handoff_task_id: binding.handoff_task_id
  };
}

function validateWorker(worker, index) {
  const name = `workers[${index}]`;
  requireFields(worker, WORKER_FIELDS, name);
  rejectUnknown(worker, WORKER_FIELDS, name);
  requireIdentifier(worker.worker_ref, `${name}.worker_ref`);
  requireIdentifier(worker.runtime_ref, `${name}.runtime_ref`);
  requireIdentifier(worker.lineage_ref, `${name}.lineage_ref`);
  requireUniqueIdentifiers(worker.operation_ids, `${name}.operation_ids`, 256);
  requireUniqueIdentifiers(worker.capability_ids, `${name}.capability_ids`, 256);
  requireInteger(worker.max_concurrency, `${name}.max_concurrency`, 1, 256);
  requireBoolean(worker.can_verify, `${name}.can_verify`);
  return {
    worker_ref: worker.worker_ref,
    runtime_ref: worker.runtime_ref,
    lineage_ref: worker.lineage_ref,
    operation_ids: [...worker.operation_ids].sort(),
    capability_ids: [...worker.capability_ids].sort(),
    max_concurrency: worker.max_concurrency,
    can_verify: worker.can_verify
  };
}

function validateClaim(claim, index) {
  const name = `claims[${index}]`;
  requireFields(claim, CLAIM_FIELDS, name);
  rejectUnknown(claim, CLAIM_FIELDS, name);
  requireIdentifier(claim.claim_id, `${name}.claim_id`);
  requireIdentifier(claim.step_id, `${name}.step_id`);
  requireIdentifier(claim.worker_ref, `${name}.worker_ref`);
  requireInteger(claim.generation, `${name}.generation`, 1, Number.MAX_SAFE_INTEGER);
  requireTimestamp(claim.claimed_at, `${name}.claimed_at`);
  requireTimestamp(claim.expires_at, `${name}.expires_at`);
  if (Date.parse(claim.expires_at) <= Date.parse(claim.claimed_at)) {
    throw new ValidationError(`${name}.expires_at must follow claimed_at`);
  }
  return { ...claim };
}

function validatePolicy(policy) {
  requireFields(policy, POLICY_FIELDS, 'policy');
  rejectUnknown(policy, POLICY_FIELDS, 'policy');
  requireInteger(policy.max_parallel_tasks, 'policy.max_parallel_tasks', 1, 4096);
  if (policy.require_independent_verification !== true) {
    throw new ValidationError('policy.require_independent_verification must be true');
  }
  return {
    max_parallel_tasks: policy.max_parallel_tasks,
    require_independent_verification: true
  };
}

function validateHandoffs(handoffs) {
  if (!Array.isArray(handoffs) || handoffs.length > 4096) {
    throw new ValidationError('handoffs must be an array with at most 4096 items');
  }
  const byId = new Map();
  for (const handoff of handoffs) {
    validateTaskArtifactHandoff(handoff);
    if (byId.has(handoff.task_id)) {
      throw new ValidationError(`handoffs contains duplicate task_id ${handoff.task_id}`);
    }
    byId.set(handoff.task_id, handoff);
  }
  return byId;
}

function validateInputShape(input) {
  requireFields(input, INPUT_FIELDS, 'Flow dispatch input');
  rejectUnknown(input, INPUT_FIELDS, 'Flow dispatch input');
  if (input.schema !== FLOW_DISPATCH_INPUT_SCHEMA) {
    throw new ValidationError('Flow dispatch input schema is invalid');
  }
  if (input.version !== VERSION) throw new ValidationError('Flow dispatch input version is invalid');
  if (input.status !== INPUT_STATUS) throw new ValidationError('Flow dispatch input status is invalid');
  requireBoundary(input, 'Flow dispatch input');
  requireTimestamp(input.evaluation_at, 'evaluation_at');
  const evaluationMs = Date.parse(input.evaluation_at);

  validateFlowPlan(input.plan);
  const graph = validateVerifiedWorkGraph(input.work_graph);
  if (Date.parse(graph.created_at) > evaluationMs) {
    throw new ValidationError('work graph was created after evaluation_at');
  }

  if (!Array.isArray(input.bindings) || input.bindings.length < 1 || input.bindings.length > 4096) {
    throw new ValidationError('bindings must contain 1-4096 items');
  }
  const bindings = input.bindings.map(validateBinding);
  const bindingByStep = new Map();
  const boundNodes = new Set();
  const boundHandoffs = new Set();
  for (const binding of bindings) {
    if (bindingByStep.has(binding.step_id)) {
      throw new ValidationError(`bindings contains duplicate step_id ${binding.step_id}`);
    }
    if (boundNodes.has(binding.work_node_id)) {
      throw new ValidationError(`bindings contains duplicate work_node_id ${binding.work_node_id}`);
    }
    if (
      binding.handoff_task_id !== null
      && boundHandoffs.has(binding.handoff_task_id)
    ) {
      throw new ValidationError(
        `bindings contains duplicate handoff_task_id ${binding.handoff_task_id}`
      );
    }
    bindingByStep.set(binding.step_id, binding);
    boundNodes.add(binding.work_node_id);
    if (binding.handoff_task_id !== null) boundHandoffs.add(binding.handoff_task_id);
  }

  const planStepById = new Map(input.plan.steps.map(step => [step.step_id, step]));
  const planStepIds = new Set(planStepById.keys());
  if (bindingByStep.size !== planStepIds.size) {
    throw new ValidationError('bindings must cover every flow step exactly once');
  }
  for (const stepId of planStepIds) {
    if (!bindingByStep.has(stepId)) {
      throw new ValidationError(`bindings missing flow step ${stepId}`);
    }
  }
  for (const stepId of bindingByStep.keys()) {
    if (!planStepIds.has(stepId)) {
      throw new ValidationError(`bindings references unknown flow step ${stepId}`);
    }
  }

  const graphById = new Map(graph.nodes.map(node => [node.node_id, node]));
  for (const binding of bindings) {
    const node = graphById.get(binding.work_node_id);
    if (!node) throw new ValidationError(`binding ${binding.step_id} references missing work node`);
    if (node.kind !== 'task') {
      throw new ValidationError(`binding ${binding.step_id} must reference a task work node`);
    }
  }

  if (!Array.isArray(input.workers) || input.workers.length < 1 || input.workers.length > 4096) {
    throw new ValidationError('workers must contain 1-4096 items');
  }
  const workers = input.workers.map(validateWorker);
  const workerByRef = new Map();
  for (const worker of workers) {
    if (workerByRef.has(worker.worker_ref)) {
      throw new ValidationError(`workers contains duplicate worker_ref ${worker.worker_ref}`);
    }
    workerByRef.set(worker.worker_ref, worker);
  }

  if (!Array.isArray(input.claims) || input.claims.length > 8192) {
    throw new ValidationError('claims must be an array with at most 8192 items');
  }
  const claims = input.claims.map(validateClaim);
  const claimIds = new Set();
  for (const claim of claims) {
    if (claimIds.has(claim.claim_id)) {
      throw new ValidationError(`claims contains duplicate claim_id ${claim.claim_id}`);
    }
    claimIds.add(claim.claim_id);
    if (!planStepIds.has(claim.step_id)) {
      throw new ValidationError(`claim ${claim.claim_id} references unknown flow step`);
    }
    if (!workerByRef.has(claim.worker_ref)) {
      throw new ValidationError(`claim ${claim.claim_id} references unknown worker`);
    }
    if (Date.parse(claim.claimed_at) > Date.parse(input.evaluation_at)) {
      throw new ValidationError(`claim ${claim.claim_id} begins after evaluation_at`);
    }
  }

  const handoffById = validateHandoffs(input.handoffs);
  for (const handoff of handoffById.values()) {
    if (
      Date.parse(handoff.lifecycle.created_at) > evaluationMs
      || Date.parse(handoff.lifecycle.updated_at) > evaluationMs
    ) {
      throw new ValidationError(
        `handoff ${handoff.task_id} contains lifecycle evidence after evaluation_at`
      );
    }
  }
  for (const binding of bindings) {
    if (binding.handoff_task_id !== null && !handoffById.has(binding.handoff_task_id)) {
      throw new ValidationError(`binding ${binding.step_id} references missing handoff task`);
    }
    if (binding.handoff_task_id !== null) {
      const handoff = handoffById.get(binding.handoff_task_id);
      const step = planStepById.get(binding.step_id);
      if (handoff.request.runtime_operation !== step.operation_id) {
        throw new ValidationError(`binding ${binding.step_id} handoff operation does not match flow step`);
      }
    }
  }

  for (const claim of claims) {
    const binding = bindingByStep.get(claim.step_id);
    const step = planStepById.get(claim.step_id);
    const worker = workerByRef.get(claim.worker_ref);
    if (!workerSupportsStep(worker, step, binding, handoffById)) {
      throw new ValidationError(
        `claim ${claim.claim_id} worker is not compatible with claimed step`
      );
    }
  }

  const policy = validatePolicy(input.policy);

  return {
    graph,
    graphById,
    bindings,
    bindingByStep,
    workers,
    workerByRef,
    claims,
    handoffById,
    policy,
    evaluationMs
  };
}

function normalizeInput(input, context) {
  return {
    schema: FLOW_DISPATCH_INPUT_SCHEMA,
    version: VERSION,
    status: INPUT_STATUS,
    flow_id: input.plan.flow_id,
    plan_digest: input.plan.plan_digest,
    work_graph_digest: verifiedWorkGraphDigest(input.work_graph),
    bindings: [...context.bindings]
      .sort((left, right) => compareCodeUnits(left.step_id, right.step_id))
      .map(binding => ({ ...binding })),
    workers: [...context.workers]
      .sort((left, right) => compareCodeUnits(left.worker_ref, right.worker_ref))
      .map(worker => ({
        ...worker,
        operation_ids: [...worker.operation_ids],
        capability_ids: [...worker.capability_ids]
      })),
    claims: [...context.claims]
      .sort((left, right) => compareCodeUnits(left.claim_id, right.claim_id))
      .map(claim => ({ ...claim })),
    handoff_refs: [...context.handoffById.values()]
      .map(handoff => ({
        task_id: handoff.task_id,
        handoff_digest: digestObject(handoff),
        state: handoff.lifecycle.state,
        updated_at: handoff.lifecycle.updated_at,
        terminal_receipt_id: handoff.lifecycle.terminal_receipt_id ?? null,
        uncertainty_record_id: handoff.lifecycle.uncertainty_record_id ?? null
      }))
      .sort((left, right) => compareCodeUnits(left.task_id, right.task_id)),
    policy: { ...context.policy },
    evaluation_at: input.evaluation_at,
    authority_effect: 'none',
    execution_effect: 'none',
    network_effect: 'none',
    persistence_effect: 'none',
    credential_visibility: 'none',
    runtime_activation: false
  };
}

function activeClaimState(context) {
  const activeByStep = new Map();
  const activeCountByWorker = new Map(context.workers.map(worker => [worker.worker_ref, 0]));
  const expired = [];

  for (const claim of context.claims) {
    const expiresMs = Date.parse(claim.expires_at);
    if (expiresMs <= context.evaluationMs) {
      expired.push(claim);
      continue;
    }
    if (activeByStep.has(claim.step_id)) {
      throw new ValidationError(`flow step ${claim.step_id} has conflicting active claims`);
    }
    activeByStep.set(claim.step_id, claim);
    activeCountByWorker.set(
      claim.worker_ref,
      (activeCountByWorker.get(claim.worker_ref) ?? 0) + 1
    );
  }

  for (const worker of context.workers) {
    if ((activeCountByWorker.get(worker.worker_ref) ?? 0) > worker.max_concurrency) {
      throw new ValidationError(`worker ${worker.worker_ref} exceeds max_concurrency in active claims`);
    }
  }
  if (activeByStep.size > context.policy.max_parallel_tasks) {
    throw new ValidationError('active claims exceed policy.max_parallel_tasks');
  }

  return { activeByStep, activeCountByWorker, expired };
}

function workerSupportsStep(worker, step, binding, handoffById) {
  if (!worker.operation_ids.includes(step.operation_id)) return false;
  if (binding.handoff_task_id !== null) {
    const handoff = handoffById.get(binding.handoff_task_id);
    if (worker.runtime_ref !== handoff.execution_target.integration_id) return false;
  }
  const capabilities = new Set(worker.capability_ids);
  return step.required_capability_ids.every(capabilityId => capabilities.has(capabilityId));
}

function hasAcceptedAncestry(context, node, memo = new Map()) {
  if (memo.has(node.node_id)) return memo.get(node.node_id);
  for (const dependency of node.dependencies) {
    const dependencyNode = context.graphById.get(dependency);
    if (
      !dependencyNode
      || dependencyNode.state !== 'accepted'
      || !hasAcceptedAncestry(context, dependencyNode, memo)
    ) {
      memo.set(node.node_id, false);
      return false;
    }
  }
  memo.set(node.node_id, true);
  return true;
}

function workDependencyBlocker(context, dependency) {
  const dependencyNode = context.graphById.get(dependency);
  if (!dependencyNode) return `work-dependency-missing:${dependency}`;
  if (dependencyNode.state === 'rejected') return `work-dependency-rejected:${dependency}`;
  if (dependencyNode.state === 'blocked') return `work-dependency-blocked:${dependency}`;
  if (dependencyNode.state !== 'accepted') {
    return `work-dependency-not-accepted:${dependency}`;
  }
  if (!hasAcceptedAncestry(context, dependencyNode)) {
    return `work-dependency-ancestry-not-accepted:${dependency}`;
  }
  return null;
}

function handoffBlocker(binding, handoffById, workNode) {
  if (binding.handoff_task_id === null) return null;
  const state = handoffById.get(binding.handoff_task_id).lifecycle.state;

  if (state === 'completed') {
    if (workNode.state !== 'accepted') return 'handoff-completed-work-not-accepted';
    return 'handoff-completed';
  }
  if (['queued', 'running', 'awaiting-approval'].includes(state)) {
    return `handoff-active:${state}`;
  }
  if (state === 'blocked') return 'handoff-blocked';
  if (state === 'uncertain') return 'handoff-uncertain';
  return `handoff-terminal:${state}`;
}

function classifySteps(input, context, claimState) {
  const completed = [];
  const claimed = [];
  const ready = [];
  const blocked = [];
  const workNodeByStep = new Map(
    context.bindings.map(binding => [binding.step_id, context.graphById.get(binding.work_node_id)])
  );
  const completedSet = new Set();

  for (const step of input.plan.steps) {
    const binding = context.bindingByStep.get(step.step_id);
    const workNode = workNodeByStep.get(step.step_id);
    const reasons = [];

    if (workNode.state === 'accepted') {
      for (const dependency of step.depends_on) {
        if (!completedSet.has(dependency)) {
          reasons.push(`dependency-not-accepted:${dependency}`);
        }
      }
      for (const dependency of workNode.dependencies) {
        const blocker = workDependencyBlocker(context, dependency);
        if (blocker) reasons.push(blocker);
      }
      const handoffReason = handoffBlocker(binding, context.handoffById, workNode);
      if (handoffReason && handoffReason !== 'handoff-completed') {
        reasons.push(handoffReason);
      }
      if (reasons.length === 0) {
        completed.push(step.step_id);
        completedSet.add(step.step_id);
        continue;
      }
    } else if (workNode.state === 'rejected') {
      reasons.push('work-task-rejected');
    } else if (workNode.state === 'blocked') {
      reasons.push('work-task-blocked');
    } else if (workNode.state === 'proposed') {
      reasons.push('work-task-not-ready');
    } else if (workNode.state !== 'ready') {
      reasons.push(`work-task-state-unsupported:${workNode.state}`);
    }

    if (workNode.state === 'ready') {
      for (const dependency of step.depends_on) {
        if (!completedSet.has(dependency)) {
          reasons.push(`dependency-not-accepted:${dependency}`);
        }
      }
      for (const dependency of workNode.dependencies) {
        const blocker = workDependencyBlocker(context, dependency);
        if (blocker) reasons.push(blocker);
      }

      const handoffReason = handoffBlocker(binding, context.handoffById, workNode);
      if (handoffReason) reasons.push(handoffReason);

      const activeClaim = claimState.activeByStep.get(step.step_id);
      if (activeClaim) {
        claimed.push(step.step_id);
        reasons.push(`active-claim:${activeClaim.claim_id}`);
      }
    }

    if (reasons.length === 0) {
      const candidates = context.workers.filter(worker =>
        workerSupportsStep(worker, step, binding, context.handoffById)
      );
      if (candidates.length === 0) reasons.push('no-worker-candidate');
    }

    if (reasons.length === 0) {
      ready.push(step.step_id);
    } else {
      blocked.push({
        step_id: step.step_id,
        reasons: [...new Set(reasons)].sort(compareCodeUnits)
      });
    }
  }

  return {
    completed: completed.sort(compareCodeUnits),
    claimed: claimed.sort(compareCodeUnits),
    ready: ready.sort(compareCodeUnits),
    blocked: blocked.sort((left, right) => compareCodeUnits(left.step_id, right.step_id))
  };
}

function deriveDispatchProposals(input, context, claimState, classified) {
  const projectedCountByWorker = new Map(claimState.activeCountByWorker);
  let remainingCampaignSlots = context.policy.max_parallel_tasks - claimState.activeByStep.size;
  const stepById = new Map(input.plan.steps.map(step => [step.step_id, step]));
  const proposals = [];

  for (const stepId of classified.ready) {
    const step = stepById.get(stepId);
    const binding = context.bindingByStep.get(stepId);
    const candidates = context.workers
      .filter(worker =>
        workerSupportsStep(worker, step, binding, context.handoffById)
        && (projectedCountByWorker.get(worker.worker_ref) ?? 0) < worker.max_concurrency
      )
      .map(worker => worker.worker_ref)
      .sort(compareCodeUnits);

    let selectedWorkerRef = null;
    let selectionReason;
    if (remainingCampaignSlots <= 0) {
      selectionReason = 'campaign-concurrency-exhausted';
    } else if (candidates.length === 0) {
      selectionReason = 'worker-capacity-exhausted';
    } else if (candidates.length > 1) {
      selectionReason = 'ambiguous-worker-candidates';
    } else {
      selectedWorkerRef = candidates[0];
      selectionReason = 'single-eligible-worker';
      projectedCountByWorker.set(
        selectedWorkerRef,
        (projectedCountByWorker.get(selectedWorkerRef) ?? 0) + 1
      );
      remainingCampaignSlots -= 1;
    }

    proposals.push({
      step_id: stepId,
      candidate_worker_refs: candidates,
      selected_worker_ref: selectedWorkerRef,
      selection_reason: selectionReason
    });
  }

  return {
    proposals,
    capacity: {
      projectedCountByWorker,
      remainingCampaignSlots
    }
  };
}

function deriveReclaimProposals(claimState) {
  return claimState.expired
    .map(claim => ({
      claim_id: claim.claim_id,
      step_id: claim.step_id,
      worker_ref: claim.worker_ref,
      expired_at: claim.expires_at
    }))
    .sort((left, right) => compareCodeUnits(left.claim_id, right.claim_id));
}

function deriveVerificationProposals(context, capacity) {
  const independentlyVerifiedArtifacts = new Set();
  for (const verification of context.graph.nodes) {
    if (
      verification.kind !== 'verification'
      || verification.state !== 'accepted'
      || verification.verification_result !== 'pass'
      || verification.lineage_ref === null
      || !hasAcceptedAncestry(context, verification)
    ) {
      continue;
    }
    for (const dependency of verification.dependencies) {
      const artifact = context.graphById.get(dependency);
      if (
        artifact?.kind === 'artifact'
        && artifact.lineage_ref !== null
        && verification.lineage_ref !== artifact.lineage_ref
      ) {
        independentlyVerifiedArtifacts.add(artifact.node_id);
      }
    }
  }

  const proposals = [];
  for (const artifact of context.graph.nodes) {
    if (
      artifact.kind !== 'artifact'
      || artifact.state !== 'accepted'
      || independentlyVerifiedArtifacts.has(artifact.node_id)
    ) {
      continue;
    }

    let candidateRefs = [];
    let selectedVerifierRef = null;
    let selectionReason;

    if (!hasAcceptedAncestry(context, artifact)) {
      selectionReason = 'artifact-dependency-ancestry-not-accepted';
    } else if (artifact.lineage_ref === null) {
      selectionReason = 'producer-lineage-unknown';
    } else {
      const independentWorkers = context.workers
        .filter(worker => worker.can_verify && worker.lineage_ref !== artifact.lineage_ref);
      candidateRefs = independentWorkers
        .filter(worker =>
          (capacity.projectedCountByWorker.get(worker.worker_ref) ?? 0) < worker.max_concurrency
        )
        .map(worker => worker.worker_ref)
        .sort(compareCodeUnits);

      if (capacity.remainingCampaignSlots <= 0) {
        selectionReason = 'campaign-concurrency-exhausted';
      } else if (independentWorkers.length === 0) {
        selectionReason = 'no-independent-verifier';
      } else if (candidateRefs.length === 0) {
        selectionReason = 'verifier-capacity-exhausted';
      } else if (candidateRefs.length > 1) {
        selectionReason = 'ambiguous-independent-verifiers';
      } else {
        selectedVerifierRef = candidateRefs[0];
        selectionReason = 'single-independent-verifier';
        capacity.projectedCountByWorker.set(
          selectedVerifierRef,
          (capacity.projectedCountByWorker.get(selectedVerifierRef) ?? 0) + 1
        );
        capacity.remainingCampaignSlots -= 1;
      }
    }

    proposals.push({
      artifact_node_id: artifact.node_id,
      producer_lineage_ref: artifact.lineage_ref,
      candidate_verifier_refs: candidateRefs,
      selected_verifier_ref: selectedVerifierRef,
      selection_reason: selectionReason
    });
  }

  return proposals.sort((left, right) =>
    compareCodeUnits(left.artifact_node_id, right.artifact_node_id)
  );
}

function projectionDigestPayload(projection) {
  const payload = structuredClone(projection);
  delete payload.projection_digest;
  return payload;
}

function requireNullableString(value, name) {
  if (value === null) return null;
  return requireIdentifier(value, name);
}

function validateProjectionShape(projection) {
  requireFields(projection, PROJECTION_FIELDS, 'Flow dispatch projection');
  rejectUnknown(projection, PROJECTION_FIELDS, 'Flow dispatch projection');
  if (projection.schema !== FLOW_DISPATCH_PROJECTION_SCHEMA) {
    throw new ValidationError('Flow dispatch projection schema is invalid');
  }
  if (projection.version !== VERSION) throw new ValidationError('Flow dispatch projection version is invalid');
  if (projection.status !== PROJECTION_STATUS) throw new ValidationError('Flow dispatch projection status is invalid');
  requireIdentifier(projection.flow_id, 'projection.flow_id');

  for (const field of ['plan_digest', 'work_graph_digest', 'dispatch_input_digest', 'projection_digest']) {
    if (typeof projection[field] !== 'string' || !/^[a-f0-9]{64}$/.test(projection[field])) {
      throw new ValidationError(`projection.${field} must be a lowercase sha256 digest`);
    }
  }

  requireUniqueIdentifiers(projection.completed_step_ids, 'projection.completed_step_ids', 4096);
  requireUniqueIdentifiers(projection.claimed_step_ids, 'projection.claimed_step_ids', 4096);
  requireUniqueIdentifiers(projection.ready_step_ids, 'projection.ready_step_ids', 4096);

  if (!Array.isArray(projection.blocked_steps) || projection.blocked_steps.length > 4096) {
    throw new ValidationError('projection.blocked_steps is invalid');
  }
  for (const [index, blocked] of projection.blocked_steps.entries()) {
    const name = `projection.blocked_steps[${index}]`;
    requireFields(blocked, BLOCKED_FIELDS, name);
    rejectUnknown(blocked, BLOCKED_FIELDS, name);
    requireIdentifier(blocked.step_id, `${name}.step_id`);
    if (!Array.isArray(blocked.reasons) || blocked.reasons.length < 1 || blocked.reasons.length > 128) {
      throw new ValidationError(`${name}.reasons is invalid`);
    }
    for (const reason of blocked.reasons) {
      if (typeof reason !== 'string' || reason.length < 1 || reason.length > 256) {
        throw new ValidationError(`${name}.reasons contains invalid value`);
      }
    }
  }

  if (!Array.isArray(projection.dispatch_proposals) || projection.dispatch_proposals.length > 4096) {
    throw new ValidationError('projection.dispatch_proposals is invalid');
  }
  for (const [index, proposal] of projection.dispatch_proposals.entries()) {
    const name = `projection.dispatch_proposals[${index}]`;
    requireFields(proposal, DISPATCH_FIELDS, name);
    rejectUnknown(proposal, DISPATCH_FIELDS, name);
    requireIdentifier(proposal.step_id, `${name}.step_id`);
    requireUniqueIdentifiers(proposal.candidate_worker_refs, `${name}.candidate_worker_refs`, 4096);
    requireNullableString(proposal.selected_worker_ref, `${name}.selected_worker_ref`);
    requireBoundedString(proposal.selection_reason, `${name}.selection_reason`);
    if (
      proposal.selected_worker_ref !== null
      && !proposal.candidate_worker_refs.includes(proposal.selected_worker_ref)
    ) {
      throw new ValidationError(`${name}.selected_worker_ref must be a candidate`);
    }
  }

  if (!Array.isArray(projection.reclaim_proposals) || projection.reclaim_proposals.length > 8192) {
    throw new ValidationError('projection.reclaim_proposals is invalid');
  }
  for (const [index, proposal] of projection.reclaim_proposals.entries()) {
    const name = `projection.reclaim_proposals[${index}]`;
    requireFields(proposal, RECLAIM_FIELDS, name);
    rejectUnknown(proposal, RECLAIM_FIELDS, name);
    requireIdentifier(proposal.claim_id, `${name}.claim_id`);
    requireIdentifier(proposal.step_id, `${name}.step_id`);
    requireIdentifier(proposal.worker_ref, `${name}.worker_ref`);
    requireTimestamp(proposal.expired_at, `${name}.expired_at`);
  }

  if (!Array.isArray(projection.verification_proposals) || projection.verification_proposals.length > 4096) {
    throw new ValidationError('projection.verification_proposals is invalid');
  }
  for (const [index, proposal] of projection.verification_proposals.entries()) {
    const name = `projection.verification_proposals[${index}]`;
    requireFields(proposal, VERIFY_FIELDS, name);
    rejectUnknown(proposal, VERIFY_FIELDS, name);
    requireIdentifier(proposal.artifact_node_id, `${name}.artifact_node_id`);
    requireNullableString(proposal.producer_lineage_ref, `${name}.producer_lineage_ref`);
    requireUniqueIdentifiers(proposal.candidate_verifier_refs, `${name}.candidate_verifier_refs`, 4096);
    requireNullableString(proposal.selected_verifier_ref, `${name}.selected_verifier_ref`);
    requireBoundedString(proposal.selection_reason, `${name}.selection_reason`);
    if (
      proposal.selected_verifier_ref !== null
      && !proposal.candidate_verifier_refs.includes(proposal.selected_verifier_ref)
    ) {
      throw new ValidationError(`${name}.selected_verifier_ref must be a candidate`);
    }
  }

  requireFields(projection.metrics, METRIC_FIELDS, 'projection.metrics');
  rejectUnknown(projection.metrics, METRIC_FIELDS, 'projection.metrics');
  for (const field of METRIC_FIELDS) {
    requireInteger(projection.metrics[field], `projection.metrics.${field}`, 0, 1000000);
  }

  if (projection.requires_authority_before_effect !== true) {
    throw new ValidationError('projection.requires_authority_before_effect must be true');
  }
  requireBoundary(projection, 'Flow dispatch projection');
}

export function validateFlowDispatchInput(input) {
  const context = validateInputShape(input);
  return deepFreeze({
    valid: true,
    schema: FLOW_DISPATCH_INPUT_SCHEMA,
    flow_id: input.plan.flow_id,
    plan_digest: input.plan.plan_digest,
    work_graph_digest: verifiedWorkGraphDigest(input.work_graph),
    dispatch_input_digest: digestObject(normalizeInput(input, context)),
    authority_effect: 'none',
    execution_effect: 'none'
  });
}

export function deriveFlowDispatchProjection(input) {
  const context = validateInputShape(input);
  const claimState = activeClaimState(context);
  const classified = classifySteps(input, context, claimState);
  const dispatch = deriveDispatchProposals(input, context, claimState, classified);
  const dispatchProposals = dispatch.proposals;
  const reclaimProposals = deriveReclaimProposals(claimState);
  const verificationProposals = deriveVerificationProposals(context, dispatch.capacity);
  const selectedDispatches = dispatchProposals.filter(proposal => proposal.selected_worker_ref !== null);
  const selectedVerifiers = verificationProposals.filter(
    proposal => proposal.selected_verifier_ref !== null
  );

  const projection = {
    schema: FLOW_DISPATCH_PROJECTION_SCHEMA,
    version: VERSION,
    status: PROJECTION_STATUS,
    flow_id: input.plan.flow_id,
    plan_digest: input.plan.plan_digest,
    work_graph_digest: verifiedWorkGraphDigest(input.work_graph),
    dispatch_input_digest: digestObject(normalizeInput(input, context)),
    completed_step_ids: classified.completed,
    claimed_step_ids: classified.claimed,
    ready_step_ids: classified.ready,
    blocked_steps: classified.blocked,
    dispatch_proposals: dispatchProposals,
    reclaim_proposals: reclaimProposals,
    verification_proposals: verificationProposals,
    metrics: {
      flow_steps: input.plan.steps.length,
      completed_steps: classified.completed.length,
      claimed_steps: classified.claimed.length,
      ready_steps: classified.ready.length,
      blocked_steps: classified.blocked.length,
      dispatches_selected: selectedDispatches.length,
      reclaims_proposed: reclaimProposals.length,
      verifications_required: verificationProposals.length,
      verifiers_selected: selectedVerifiers.length,
      active_claims: claimState.activeByStep.size
    },
    requires_authority_before_effect: true,
    projection_digest: ZERO_DIGEST,
    authority_effect: 'none',
    execution_effect: 'none',
    network_effect: 'none',
    persistence_effect: 'none',
    credential_visibility: 'none',
    runtime_activation: false
  };

  projection.projection_digest = digestObject(projectionDigestPayload(projection));
  validateFlowDispatchProjection(projection);
  return deepFreeze(projection);
}

export function validateFlowDispatchProjection(projection) {
  validateProjectionShape(projection);
  const expected = digestObject(projectionDigestPayload(projection));
  if (projection.projection_digest !== expected) {
    throw new ValidationError('Flow dispatch projection digest mismatch');
  }
  return deepFreeze({
    valid: true,
    schema: FLOW_DISPATCH_PROJECTION_SCHEMA,
    flow_id: projection.flow_id,
    projection_digest: expected,
    authority_effect: 'none',
    execution_effect: 'none'
  });
}

export function verifyFlowDispatchProjection(input, projection) {
  const expected = deriveFlowDispatchProjection(input);
  validateFlowDispatchProjection(projection);
  if (projection.projection_digest !== expected.projection_digest) {
    throw new ValidationError('Flow dispatch projection does not match input');
  }
  return true;
}

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}
