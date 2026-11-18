import { digestObject, ValidationError } from './canonical.mjs';

export const FLOW_PROPOSAL_SCHEMA = 'axiom-flow-proposal.v0';
export const FLOW_PLAN_SCHEMA = 'axiom-flow-plan.v0';

const PROPOSAL_STATUS = 'inert-flow-proposal';
const PLAN_STATUS = 'inert-compiled-flow-plan';
const IDENTIFIER_RE = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,191}$/;
const SHA256_RE = /^[a-f0-9]{64}$/;
const ZERO_DIGEST = '0'.repeat(64);

const EFFECT_CLASSES = Object.freeze(['pure', 'read', 'mutation']);
const EFFECT_SCOPES = Object.freeze(['local', 'external']);
const NETWORK_POSTURES = Object.freeze(['none', 'required']);
const PERSISTENCE_POSTURES = Object.freeze(['none', 'read', 'write']);
const IDEMPOTENCY_MODES = Object.freeze(['none', 'intrinsic', 'keyed']);
const IDEMPOTENCY_SCOPES = Object.freeze(['step', 'effect']);
const FAILURE_ACTIONS = Object.freeze(['stop', 'continue', 'escalate']);
const UNCERTAIN_ACTIONS = Object.freeze(['not-applicable', 'stop-and-escalate']);

const PROPOSAL_FIELDS = Object.freeze([
  'schema',
  'version',
  'status',
  'flow_id',
  'task_digest',
  'purpose_digest',
  'completion',
  'budget',
  'steps',
  'authority_effect',
  'execution_effect',
  'network_effect',
  'persistence_effect',
  'credential_visibility',
  'runtime_activation'
]);

const PLAN_FIELDS = Object.freeze([
  'schema',
  'version',
  'status',
  'flow_id',
  'task_digest',
  'purpose_digest',
  'source_proposal_digest',
  'steps',
  'required_capability_ids',
  'effect_summary',
  'completion',
  'budget',
  'plan_digest',
  'authority_effect',
  'execution_effect',
  'network_effect',
  'persistence_effect',
  'credential_visibility',
  'runtime_activation'
]);

const STEP_FIELDS = Object.freeze([
  'step_id',
  'operation_id',
  'operation_manifest_digest',
  'depends_on',
  'required_capability_ids',
  'input_schema_digest',
  'output_schema_digest',
  'semantic_evidence_digests',
  'effect_class',
  'effect_scope',
  'network',
  'persistence',
  'retry',
  'failure'
]);

const RETRY_FIELDS = Object.freeze([
  'max_attempts',
  'backoff_ms',
  'idempotency_mode',
  'idempotency_scope'
]);

const FAILURE_FIELDS = Object.freeze([
  'on_failure',
  'on_uncertain_completion'
]);

const COMPLETION_FIELDS = Object.freeze([
  'required_step_ids',
  'on_blocked',
  'on_authority_missing',
  'on_budget_exhausted',
  'on_uncertain_effect'
]);

const BUDGET_FIELDS = Object.freeze([
  'max_steps',
  'max_network_steps',
  'max_mutation_steps',
  'max_total_attempts'
]);

const SUMMARY_FIELDS = Object.freeze([
  'step_count',
  'pure_steps',
  'read_steps',
  'mutation_steps',
  'local_steps',
  'external_steps',
  'network_steps',
  'persistence_read_steps',
  'persistence_write_steps',
  'total_attempt_ceiling'
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

function requireDigest(value, name) {
  if (typeof value !== 'string' || !SHA256_RE.test(value)) {
    throw new ValidationError(`${name} must be a lowercase sha256 digest`);
  }
  return value;
}

function requireInteger(value, name, min, max) {
  if (!Number.isSafeInteger(value) || value < min || value > max) {
    throw new ValidationError(`${name} must be an integer in [${min}, ${max}]`);
  }
  return value;
}

function requireEnum(value, allowed, name) {
  if (!allowed.includes(value)) {
    throw new ValidationError(`${name} must be one of ${allowed.join(', ')}`);
  }
  return value;
}

function requireNullableEnum(value, allowed, name) {
  if (value === null) return null;
  return requireEnum(value, allowed, name);
}

function requireUniqueArray(value, name, validator, maxItems = 64) {
  if (!Array.isArray(value) || value.length > maxItems) {
    throw new ValidationError(`${name} must be an array with at most ${maxItems} items`);
  }
  const seen = new Set();
  for (const [index, item] of value.entries()) {
    validator(item, `${name}[${index}]`);
    if (seen.has(item)) throw new ValidationError(`${name} contains duplicate values`);
    seen.add(item);
  }
  return value;
}

function requireBoundary(document, name) {
  if (
    document.authority_effect !== 'none'
    || document.execution_effect !== 'none'
    || document.network_effect !== 'none'
    || document.persistence_effect !== 'none'
    || document.credential_visibility !== 'none'
    || document.runtime_activation !== false
  ) {
    throw new ValidationError(`${name} boundary effect is invalid`);
  }
}

function validateRetry(retry, stepName) {
  requireFields(retry, RETRY_FIELDS, `${stepName}.retry`);
  rejectUnknown(retry, RETRY_FIELDS, `${stepName}.retry`);
  requireInteger(retry.max_attempts, `${stepName}.retry.max_attempts`, 1, 8);
  requireInteger(retry.backoff_ms, `${stepName}.retry.backoff_ms`, 0, 60_000);
  requireEnum(retry.idempotency_mode, IDEMPOTENCY_MODES, `${stepName}.retry.idempotency_mode`);
  requireNullableEnum(
    retry.idempotency_scope,
    IDEMPOTENCY_SCOPES,
    `${stepName}.retry.idempotency_scope`
  );

  if (retry.idempotency_mode === 'none' && retry.idempotency_scope !== null) {
    throw new ValidationError(`${stepName}.retry idempotency scope requires an idempotency mode`);
  }
  if (retry.idempotency_mode !== 'none' && retry.idempotency_scope === null) {
    throw new ValidationError(`${stepName}.retry idempotency mode requires a scope`);
  }
}

function validateFailure(failure, stepName) {
  requireFields(failure, FAILURE_FIELDS, `${stepName}.failure`);
  rejectUnknown(failure, FAILURE_FIELDS, `${stepName}.failure`);
  requireEnum(failure.on_failure, FAILURE_ACTIONS, `${stepName}.failure.on_failure`);
  requireEnum(
    failure.on_uncertain_completion,
    UNCERTAIN_ACTIONS,
    `${stepName}.failure.on_uncertain_completion`
  );
}

function validateStep(step, index) {
  const name = `steps[${index}]`;
  requireFields(step, STEP_FIELDS, name);
  rejectUnknown(step, STEP_FIELDS, name);

  requireIdentifier(step.step_id, `${name}.step_id`);
  requireIdentifier(step.operation_id, `${name}.operation_id`);
  requireDigest(step.operation_manifest_digest, `${name}.operation_manifest_digest`);
  requireUniqueArray(step.depends_on, `${name}.depends_on`, requireIdentifier, 64);
  requireUniqueArray(
    step.required_capability_ids,
    `${name}.required_capability_ids`,
    requireIdentifier,
    64
  );
  requireDigest(step.input_schema_digest, `${name}.input_schema_digest`);
  requireDigest(step.output_schema_digest, `${name}.output_schema_digest`);
  requireUniqueArray(
    step.semantic_evidence_digests,
    `${name}.semantic_evidence_digests`,
    requireDigest,
    32
  );
  requireEnum(step.effect_class, EFFECT_CLASSES, `${name}.effect_class`);
  requireEnum(step.effect_scope, EFFECT_SCOPES, `${name}.effect_scope`);
  requireEnum(step.network, NETWORK_POSTURES, `${name}.network`);
  requireEnum(step.persistence, PERSISTENCE_POSTURES, `${name}.persistence`);
  validateRetry(step.retry, name);
  validateFailure(step.failure, name);

  if ((step.effect_scope === 'external') !== (step.network === 'required')) {
    throw new ValidationError(`${name} external scope and network requirement must agree in v0`);
  }
  if (
    step.effect_class === 'pure'
    && (
      step.effect_scope !== 'local'
      || step.network !== 'none'
      || step.persistence !== 'none'
    )
  ) {
    throw new ValidationError(`${name} pure steps cannot request external, network, or persistence effects`);
  }
  if (step.effect_class !== 'mutation' && step.persistence === 'write') {
    throw new ValidationError(`${name} persistence writes require mutation effect_class`);
  }
  if (
    step.effect_class === 'mutation'
    && step.retry.max_attempts > 1
    && step.retry.idempotency_mode === 'none'
  ) {
    throw new ValidationError(`${name} mutation retries require explicit idempotency semantics`);
  }
  if (
    step.effect_class === 'mutation'
    && step.effect_scope === 'external'
    && step.failure.on_uncertain_completion !== 'stop-and-escalate'
  ) {
    throw new ValidationError(`${name} external mutation uncertainty must stop and escalate`);
  }
  if (
    !(step.effect_class === 'mutation' && step.effect_scope === 'external')
    && step.failure.on_uncertain_completion !== 'not-applicable'
  ) {
    throw new ValidationError(`${name} uncertain-completion handling is only applicable to external mutation in v0`);
  }
}

function validateCompletion(completion) {
  requireFields(completion, COMPLETION_FIELDS, 'completion');
  rejectUnknown(completion, COMPLETION_FIELDS, 'completion');
  requireUniqueArray(
    completion.required_step_ids,
    'completion.required_step_ids',
    requireIdentifier,
    64
  );
  if (completion.required_step_ids.length < 1) {
    throw new ValidationError('completion.required_step_ids must not be empty');
  }
  if (
    completion.on_blocked !== 'stop'
    || completion.on_authority_missing !== 'stop'
    || completion.on_budget_exhausted !== 'stop'
    || completion.on_uncertain_effect !== 'stop-and-escalate'
  ) {
    throw new ValidationError('completion policy must preserve fail-closed v0 stopping semantics');
  }
}

function validateBudget(budget) {
  requireFields(budget, BUDGET_FIELDS, 'budget');
  rejectUnknown(budget, BUDGET_FIELDS, 'budget');
  requireInteger(budget.max_steps, 'budget.max_steps', 1, 64);
  requireInteger(budget.max_network_steps, 'budget.max_network_steps', 0, 64);
  requireInteger(budget.max_mutation_steps, 'budget.max_mutation_steps', 0, 32);
  requireInteger(budget.max_total_attempts, 'budget.max_total_attempts', 1, 256);
}

function summarizeSteps(steps) {
  return {
    step_count: steps.length,
    pure_steps: steps.filter(step => step.effect_class === 'pure').length,
    read_steps: steps.filter(step => step.effect_class === 'read').length,
    mutation_steps: steps.filter(step => step.effect_class === 'mutation').length,
    local_steps: steps.filter(step => step.effect_scope === 'local').length,
    external_steps: steps.filter(step => step.effect_scope === 'external').length,
    network_steps: steps.filter(step => step.network === 'required').length,
    persistence_read_steps: steps.filter(step => step.persistence === 'read').length,
    persistence_write_steps: steps.filter(step => step.persistence === 'write').length,
    total_attempt_ceiling: steps.reduce((sum, step) => sum + step.retry.max_attempts, 0)
  };
}

function requestedCapabilities(steps) {
  return [...new Set(steps.flatMap(step => step.required_capability_ids))].sort();
}

function topologicalOrder(steps) {
  const byId = new Map();
  for (const step of steps) {
    if (byId.has(step.step_id)) throw new ValidationError('steps contains duplicate step_id');
    byId.set(step.step_id, step);
  }

  const indegree = new Map([...byId.keys()].map(id => [id, 0]));
  const outgoing = new Map([...byId.keys()].map(id => [id, []]));

  for (const step of steps) {
    for (const dependency of step.depends_on) {
      if (!byId.has(dependency)) {
        throw new ValidationError(`step ${step.step_id} depends on missing step ${dependency}`);
      }
      if (dependency === step.step_id) {
        throw new ValidationError(`step ${step.step_id} cannot depend on itself`);
      }
      indegree.set(step.step_id, indegree.get(step.step_id) + 1);
      outgoing.get(dependency).push(step.step_id);
    }
  }

  for (const children of outgoing.values()) children.sort();

  const ready = [...indegree.entries()]
    .filter(([, count]) => count === 0)
    .map(([id]) => id)
    .sort();
  const order = [];

  while (ready.length) {
    const id = ready.shift();
    order.push(id);
    for (const child of outgoing.get(id)) {
      const next = indegree.get(child) - 1;
      indegree.set(child, next);
      if (next === 0) {
        ready.push(child);
        ready.sort();
      }
    }
  }

  if (order.length !== steps.length) {
    throw new ValidationError('flow dependency graph contains a cycle');
  }
  return order;
}

function analyzeFlow(steps, completion, budget) {
  if (!Array.isArray(steps) || steps.length < 1 || steps.length > 64) {
    throw new ValidationError('steps must contain 1-64 entries');
  }
  for (const [index, step] of steps.entries()) validateStep(step, index);
  validateCompletion(completion);
  validateBudget(budget);

  const order = topologicalOrder(steps);
  const ids = new Set(order);
  for (const required of completion.required_step_ids) {
    if (!ids.has(required)) {
      throw new ValidationError(`completion requires missing step ${required}`);
    }
  }

  const summary = summarizeSteps(steps);
  if (summary.step_count > budget.max_steps) {
    throw new ValidationError('flow exceeds max_steps budget');
  }
  if (summary.network_steps > budget.max_network_steps) {
    throw new ValidationError('flow exceeds max_network_steps budget');
  }
  if (summary.mutation_steps > budget.max_mutation_steps) {
    throw new ValidationError('flow exceeds max_mutation_steps budget');
  }
  if (summary.total_attempt_ceiling > budget.max_total_attempts) {
    throw new ValidationError('flow exceeds max_total_attempts budget');
  }

  return {
    order,
    summary,
    requiredCapabilityIds: requestedCapabilities(steps)
  };
}

function validateProposalShape(proposal) {
  requireFields(proposal, PROPOSAL_FIELDS, 'Flow proposal');
  rejectUnknown(proposal, PROPOSAL_FIELDS, 'Flow proposal');
  if (proposal.schema !== FLOW_PROPOSAL_SCHEMA) {
    throw new ValidationError('Flow proposal schema is invalid');
  }
  if (proposal.version !== 0) throw new ValidationError('Flow proposal version is invalid');
  if (proposal.status !== PROPOSAL_STATUS) throw new ValidationError('Flow proposal status is invalid');
  requireIdentifier(proposal.flow_id, 'flow_id');
  requireDigest(proposal.task_digest, 'task_digest');
  requireDigest(proposal.purpose_digest, 'purpose_digest');
  requireBoundary(proposal, 'Flow proposal');
  return analyzeFlow(proposal.steps, proposal.completion, proposal.budget);
}

function normalizeStep(step) {
  return {
    step_id: step.step_id,
    operation_id: step.operation_id,
    operation_manifest_digest: step.operation_manifest_digest,
    depends_on: [...step.depends_on].sort(),
    required_capability_ids: [...step.required_capability_ids].sort(),
    input_schema_digest: step.input_schema_digest,
    output_schema_digest: step.output_schema_digest,
    semantic_evidence_digests: [...step.semantic_evidence_digests].sort(),
    effect_class: step.effect_class,
    effect_scope: step.effect_scope,
    network: step.network,
    persistence: step.persistence,
    retry: {
      max_attempts: step.retry.max_attempts,
      backoff_ms: step.retry.backoff_ms,
      idempotency_mode: step.retry.idempotency_mode,
      idempotency_scope: step.retry.idempotency_scope
    },
    failure: {
      on_failure: step.failure.on_failure,
      on_uncertain_completion: step.failure.on_uncertain_completion
    }
  };
}

function normalizedProposal(proposal, analysis) {
  const byId = new Map(proposal.steps.map(step => [step.step_id, step]));
  return {
    schema: FLOW_PROPOSAL_SCHEMA,
    version: 0,
    status: PROPOSAL_STATUS,
    flow_id: proposal.flow_id,
    task_digest: proposal.task_digest,
    purpose_digest: proposal.purpose_digest,
    completion: {
      required_step_ids: [...proposal.completion.required_step_ids].sort(),
      on_blocked: proposal.completion.on_blocked,
      on_authority_missing: proposal.completion.on_authority_missing,
      on_budget_exhausted: proposal.completion.on_budget_exhausted,
      on_uncertain_effect: proposal.completion.on_uncertain_effect
    },
    budget: {
      max_steps: proposal.budget.max_steps,
      max_network_steps: proposal.budget.max_network_steps,
      max_mutation_steps: proposal.budget.max_mutation_steps,
      max_total_attempts: proposal.budget.max_total_attempts
    },
    steps: analysis.order.map(id => normalizeStep(byId.get(id))),
    authority_effect: 'none',
    execution_effect: 'none',
    network_effect: 'none',
    persistence_effect: 'none',
    credential_visibility: 'none',
    runtime_activation: false
  };
}

export function computeFlowProposalDigest(proposal) {
  const analysis = validateProposalShape(proposal);
  return digestObject(normalizedProposal(proposal, analysis));
}

export function validateFlowProposal(proposal) {
  const analysis = validateProposalShape(proposal);
  return deepFreeze({
    valid: true,
    schema: FLOW_PROPOSAL_SCHEMA,
    flow_id: proposal.flow_id,
    proposal_digest: digestObject(normalizedProposal(proposal, analysis)),
    step_count: analysis.summary.step_count,
    required_capability_ids: [...analysis.requiredCapabilityIds],
    authority_effect: 'none',
    execution_effect: 'none'
  });
}

function validateSummary(summary, expected) {
  requireFields(summary, SUMMARY_FIELDS, 'effect_summary');
  rejectUnknown(summary, SUMMARY_FIELDS, 'effect_summary');
  for (const field of SUMMARY_FIELDS) {
    requireInteger(summary[field], `effect_summary.${field}`, 0, 512);
  }
  if (digestObject(summary) !== digestObject(expected)) {
    throw new ValidationError('effect_summary does not match compiled steps');
  }
}

function validatePlanShape(plan) {
  requireFields(plan, PLAN_FIELDS, 'Flow plan');
  rejectUnknown(plan, PLAN_FIELDS, 'Flow plan');
  if (plan.schema !== FLOW_PLAN_SCHEMA) throw new ValidationError('Flow plan schema is invalid');
  if (plan.version !== 0) throw new ValidationError('Flow plan version is invalid');
  if (plan.status !== PLAN_STATUS) throw new ValidationError('Flow plan status is invalid');
  requireIdentifier(plan.flow_id, 'flow_id');
  requireDigest(plan.task_digest, 'task_digest');
  requireDigest(plan.purpose_digest, 'purpose_digest');
  requireDigest(plan.source_proposal_digest, 'source_proposal_digest');
  requireDigest(plan.plan_digest, 'plan_digest');
  requireBoundary(plan, 'Flow plan');

  const analysis = analyzeFlow(plan.steps, plan.completion, plan.budget);
  const byId = new Map(plan.steps.map(step => [step.step_id, step]));
  const normalizedSteps = analysis.order.map(id => normalizeStep(byId.get(id)));
  if (digestObject(plan.steps) !== digestObject(normalizedSteps)) {
    throw new ValidationError('Flow plan steps are not in deterministic compiled form');
  }

  requireUniqueArray(
    plan.required_capability_ids,
    'required_capability_ids',
    requireIdentifier,
    256
  );
  if (
    plan.required_capability_ids.length !== analysis.requiredCapabilityIds.length
    || plan.required_capability_ids.some(
      (id, index) => id !== analysis.requiredCapabilityIds[index]
    )
  ) {
    throw new ValidationError('required_capability_ids do not match compiled steps');
  }
  validateSummary(plan.effect_summary, analysis.summary);

  const normalizedRequired = [...plan.completion.required_step_ids].sort();
  if (
    normalizedRequired.length !== plan.completion.required_step_ids.length
    || normalizedRequired.some((id, index) => id !== plan.completion.required_step_ids[index])
  ) {
    throw new ValidationError('Flow plan completion step ids are not in deterministic order');
  }

  return analysis;
}

function planDigestPayload(plan) {
  const copy = structuredClone(plan);
  delete copy.plan_digest;
  return copy;
}

export function computeFlowPlanDigest(plan) {
  validatePlanShape(plan);
  return digestObject(planDigestPayload(plan));
}

export function validateFlowPlan(plan) {
  const analysis = validatePlanShape(plan);
  const expected = digestObject(planDigestPayload(plan));
  if (plan.plan_digest !== expected) {
    throw new ValidationError('Flow plan digest mismatch');
  }
  return deepFreeze({
    valid: true,
    schema: FLOW_PLAN_SCHEMA,
    flow_id: plan.flow_id,
    plan_digest: expected,
    step_count: analysis.summary.step_count,
    required_capability_ids: [...analysis.requiredCapabilityIds],
    authority_effect: 'none',
    execution_effect: 'none'
  });
}

export function compileFlowProposal(proposal) {
  const analysis = validateProposalShape(proposal);
  const normalized = normalizedProposal(proposal, analysis);
  const plan = {
    schema: FLOW_PLAN_SCHEMA,
    version: 0,
    status: PLAN_STATUS,
    flow_id: normalized.flow_id,
    task_digest: normalized.task_digest,
    purpose_digest: normalized.purpose_digest,
    source_proposal_digest: digestObject(normalized),
    steps: normalized.steps,
    required_capability_ids: [...analysis.requiredCapabilityIds],
    effect_summary: structuredClone(analysis.summary),
    completion: structuredClone(normalized.completion),
    budget: structuredClone(normalized.budget),
    plan_digest: ZERO_DIGEST,
    authority_effect: 'none',
    execution_effect: 'none',
    network_effect: 'none',
    persistence_effect: 'none',
    credential_visibility: 'none',
    runtime_activation: false
  };
  plan.plan_digest = computeFlowPlanDigest(plan);
  validateFlowPlan(plan);
  return deepFreeze(plan);
}

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}
