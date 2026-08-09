import {
  ValidationError,
  assertPlainObject,
  assertString,
  assertStringArray,
  digestObject
} from './canonical.mjs';

const ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/;
const DIGEST = /^[a-f0-9]{64}$/;

export function buildPlan(intent, decision, { approval } = {}) {
  const machineAuthorityDigest = intent.principal?.schema === 'axiom-machine-principal.v1'
    ? intent.principal.authority_digest
    : null;
  const executionStep = {
    id: 'execute',
    effect: decision.effect ?? intent.action,
    tool: decision.tool,
    audience: 'sandbox',
    depends_on: [],
    timeout_ms: Number(decision.timeout_ms ?? 10_000),
    constraints: structuredClone(decision.constraints ?? {}),
    evidence_obligations: [
      'input_digest',
      'result_digest',
      'capability_id',
      'started_at',
      'completed_at'
    ]
  };
  const commitStep = {
    id: 'commit',
    effect: 'evidence.commit',
    audience: 'grid',
    depends_on: ['execute'],
    timeout_ms: 10_000,
    constraints: { append_only: true },
    evidence_obligations: ['event_hash', 'previous_hash', 'grid_signature']
  };
  const observableInputs = [
    'principal.id',
    'principal.type',
    'principal.roles',
    'principal.scopes',
    'intent.action',
    'intent.purpose',
    'intent.data_scopes',
    'intent.approval_ids'
  ];
  const rules = [decision.rule_id ?? `policy:${intent.action}`];
  if (machineAuthorityDigest) {
    observableInputs.push(
      'principal.sponsor',
      'principal.runtime',
      'principal.constraints.actions',
      'principal.constraints.purposes',
      'principal.constraints.destinations',
      'principal.constraints.budgets',
      'principal.authority_digest'
    );
    rules.push(`machine-authority:${machineAuthorityDigest}`);
  }
  const plan = {
    version: 'axiom-plan.v1',
    intent_id: intent.intent_id,
    principal: intent.principal.id,
    action: intent.action,
    risk: decision.risk,
    policy: {
      version: decision.policy_version,
      digest: decision.policy_digest,
      layers: structuredClone(decision.policy_layers ?? [])
    },
    decision_provenance: {
      observable_inputs: observableInputs,
      rules,
      decision: 'allow'
    },
    approvals: approval ? [{
      approval_id: approval.approval_id,
      approver: approval.approver,
      request_digest: approval.request_digest,
      expires_at: approval.expires_at
    }] : [],
    capability: {
      issuer: 'hypervisor',
      audience: 'sandbox',
      subject: intent.principal.id,
      single_use: true,
      ...(machineAuthorityDigest ? { authority_digest: machineAuthorityDigest } : {})
    },
    timeout_ms: executionStep.timeout_ms + commitStep.timeout_ms,
    steps: [executionStep, commitStep]
  };
  validatePlan(plan);
  return plan;
}

export function validatePlan(value) {
  const plan = assertPlainObject(value, 'plan');
  if (plan.version !== 'axiom-plan.v1') throw new ValidationError('Unsupported plan version');
  assertString(plan.intent_id, 'plan.intent_id', { max: 160, pattern: ID });
  assertString(plan.principal, 'plan.principal', { max: 160, pattern: ID });
  assertString(plan.action, 'plan.action', { max: 128, pattern: /^[a-z][a-z0-9.-]+$/ });
  assertString(plan.risk, 'plan.risk', { max: 16, pattern: /^(low|medium|high|critical)$/ });
  const policy = assertPlainObject(plan.policy, 'plan.policy');
  assertString(policy.version, 'plan.policy.version', { max: 512 });
  assertString(policy.digest, 'plan.policy.digest', { min: 64, max: 64, pattern: DIGEST });
  if (!Array.isArray(policy.layers)) throw new ValidationError('plan.policy.layers must be an array');
  for (const [index, layer] of policy.layers.entries()) {
    const item = assertPlainObject(layer, `plan.policy.layers[${index}]`);
    assertString(item.version, `plan.policy.layers[${index}].version`, { max: 160 });
    assertString(item.digest, `plan.policy.layers[${index}].digest`, {
      min: 64,
      max: 64,
      pattern: DIGEST
    });
  }
  const provenance = assertPlainObject(plan.decision_provenance, 'plan.decision_provenance');
  const observableInputs = assertStringArray(
    provenance.observable_inputs,
    'plan.decision_provenance.observable_inputs',
    {
    maxItems: 64,
    itemMax: 160
    }
  );
  if (!observableInputs.length) throw new ValidationError('Plan provenance inputs are required');
  const rules = assertStringArray(provenance.rules, 'plan.decision_provenance.rules', {
    maxItems: 32,
    itemMax: 200
  });
  if (!rules.length) throw new ValidationError('Plan provenance rules are required');
  if (provenance.decision !== 'allow') throw new ValidationError('Executable plan decision must be allow');
  if ('reasoning' in provenance || 'chain_of_thought' in provenance) {
    throw new ValidationError('Plans must record observable decision provenance, not private reasoning');
  }
  if (!Array.isArray(plan.approvals) || plan.approvals.length > 8) {
    throw new ValidationError('plan.approvals must contain at most eight approvals');
  }
  for (const [index, approval] of plan.approvals.entries()) {
    const item = assertPlainObject(approval, `plan.approvals[${index}]`);
    for (const field of ['approval_id', 'approver']) {
      assertString(item[field], `plan.approvals[${index}].${field}`, { max: 160, pattern: ID });
    }
    assertString(item.request_digest, `plan.approvals[${index}].request_digest`, {
      min: 64,
      max: 64,
      pattern: DIGEST
    });
    if (!validDate(item.expires_at)) throw new ValidationError('Plan approval expiry is invalid');
  }
  const capability = assertPlainObject(plan.capability, 'plan.capability');
  if (
    capability.issuer !== 'hypervisor'
    || capability.audience !== 'sandbox'
    || capability.subject !== plan.principal
    || capability.single_use !== true
  ) {
    throw new ValidationError('Plan capability declaration is invalid');
  }
  if (capability.authority_digest !== undefined) {
    assertString(capability.authority_digest, 'plan.capability.authority_digest', {
      min: 64,
      max: 64,
      pattern: DIGEST
    });
    if (!rules.includes(`machine-authority:${capability.authority_digest}`)) {
      throw new ValidationError('Machine plan authority digest is missing from decision provenance');
    }
  }
  if (!Number.isSafeInteger(plan.timeout_ms) || plan.timeout_ms < 1 || plan.timeout_ms > 300_000) {
    throw new ValidationError('plan.timeout_ms is invalid');
  }
  if (!Array.isArray(plan.steps) || plan.steps.length < 2 || plan.steps.length > 64) {
    throw new ValidationError('Plan must contain 2-64 steps');
  }
  const ids = new Set();
  for (const [index, rawStep] of plan.steps.entries()) {
    const step = assertPlainObject(rawStep, `plan.steps[${index}]`);
    const id = assertString(step.id, `plan.steps[${index}].id`, { max: 64, pattern: ID });
    if (ids.has(id)) throw new ValidationError(`Duplicate plan step: ${id}`);
    ids.add(id);
    assertString(step.effect, `plan.steps[${index}].effect`, {
      max: 128,
      pattern: /^[a-z][a-z0-9.-]+$/
    });
    assertString(step.audience, `plan.steps[${index}].audience`, { max: 64, pattern: ID });
    if (step.tool !== undefined) {
      assertString(step.tool, `plan.steps[${index}].tool`, {
        max: 128,
        pattern: /^[a-z][a-z0-9.-]+$/
      });
    }
    assertStringArray(step.depends_on, `plan.steps[${index}].depends_on`, {
      maxItems: 32,
      itemMax: 64
    });
    if (!Number.isSafeInteger(step.timeout_ms) || step.timeout_ms < 1 || step.timeout_ms > 300_000) {
      throw new ValidationError(`plan.steps[${index}].timeout_ms is invalid`);
    }
    assertPlainObject(step.constraints, `plan.steps[${index}].constraints`);
    const evidence = assertStringArray(
      step.evidence_obligations,
      `plan.steps[${index}].evidence_obligations`,
      {
      maxItems: 32,
      itemMax: 160
      }
    );
    if (!evidence.length) throw new ValidationError(`plan.steps[${index}] requires evidence obligations`);
  }
  for (const step of plan.steps) {
    for (const dependency of step.depends_on) {
      if (!ids.has(dependency)) throw new ValidationError(`Unknown plan dependency: ${dependency}`);
      if (dependency === step.id) throw new ValidationError('A plan step cannot depend on itself');
    }
  }
  detectCycles(plan.steps);
  return plan;
}

export function planDigest(plan) {
  validatePlan(plan);
  return digestObject(plan);
}

function detectCycles(steps) {
  const dependencies = new Map(steps.map(step => [step.id, step.depends_on]));
  const visiting = new Set();
  const visited = new Set();
  function visit(id) {
    if (visiting.has(id)) throw new ValidationError('Plan dependency graph contains a cycle');
    if (visited.has(id)) return;
    visiting.add(id);
    for (const dependency of dependencies.get(id) ?? []) visit(dependency);
    visiting.delete(id);
    visited.add(id);
  }
  for (const step of steps) visit(step.id);
}

function validDate(value) {
  if (typeof value !== 'string') return false;
  const date = new Date(value);
  return !Number.isNaN(date.valueOf()) && date.toISOString() === value;
}
