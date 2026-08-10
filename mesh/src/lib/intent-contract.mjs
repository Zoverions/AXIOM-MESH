import {
  ValidationError,
  assertPlainObject,
  assertString,
  assertStringArray,
  digestObject
} from './canonical.mjs';

export const INTENT_CONTRACT_SCHEMA = 'axiom-intent-contract.v1';
export const INTENT_GRAPH_SCHEMA = 'axiom-intent-graph.v1';
export const INTENT_ASSESSMENT_SCHEMA = 'axiom-intent-assessment.v1';

const REQUIREMENT_ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,79}$/;
const ACTION_PATTERN = /^[a-z][a-z0-9._:-]*(?:\.\*)?$/;
const VERIFICATION_CLASSES = new Set([
  'deterministic',
  'empirical',
  'external',
  'human',
  'unknown'
]);
const SEVERITIES = new Set(['low', 'medium', 'high', 'critical']);
const OBSERVATION_STATES = new Set(['pass', 'fail', 'unknown']);

function assertSafeInteger(value, name, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}) {
  if (!Number.isSafeInteger(value) || value < min || value > max) {
    throw new ValidationError(`${name} must be an integer between ${min} and ${max}`);
  }
  return value;
}

function uniqueSortedStrings(value, name, options = {}) {
  return [...new Set(assertStringArray(value ?? [], name, options))].sort();
}

function normalizeActionPatterns(value, name) {
  return uniqueSortedStrings(value, name, { maxItems: 128, itemMax: 160 })
    .map((pattern, index) => assertString(pattern, `${name}[${index}]`, {
      max: 160,
      pattern: ACTION_PATTERN
    }));
}

function normalizeVerification(raw, name, defaultMinimumIndependentVerifiers) {
  const value = assertPlainObject(raw ?? {}, name);
  const classification = assertString(
    value.classification ?? 'unknown',
    `${name}.classification`,
    { max: 32 }
  );
  if (!VERIFICATION_CLASSES.has(classification)) {
    throw new ValidationError(
      `${name}.classification must be one of ${[...VERIFICATION_CLASSES].join(', ')}`
    );
  }
  return {
    classification,
    method: assertString(value.method ?? 'unspecified', `${name}.method`, { max: 1024 }),
    evidence_required: uniqueSortedStrings(
      value.evidence_required ?? [],
      `${name}.evidence_required`,
      { maxItems: 32, itemMax: 256 }
    ),
    minimum_independent_verifiers: assertSafeInteger(
      value.minimum_independent_verifiers ?? defaultMinimumIndependentVerifiers,
      `${name}.minimum_independent_verifiers`,
      { min: 0, max: 16 }
    )
  };
}

function normalizeRequirement(raw, kind, index, defaultMinimumIndependentVerifiers) {
  const value = assertPlainObject(raw, `${kind}[${index}]`);
  const id = assertString(value.id, `${kind}[${index}].id`, {
    max: 80,
    pattern: REQUIREMENT_ID
  });
  const base = {
    id,
    kind,
    statement: assertString(value.statement, `${kind}[${index}].statement`, { max: 4096 }),
    verification: normalizeVerification(
      value.verification,
      `${kind}[${index}].verification`,
      defaultMinimumIndependentVerifiers
    ),
    remediation_actions: normalizeActionPatterns(
      value.remediation_actions ?? [],
      `${kind}[${index}].remediation_actions`
    )
  };
  if (kind === 'objective') {
    return {
      ...base,
      priority: assertSafeInteger(value.priority ?? 50, `${kind}[${index}].priority`, {
        min: 1,
        max: 100
      })
    };
  }
  const severity = assertString(value.severity ?? 'high', `${kind}[${index}].severity`, {
    max: 16
  });
  if (!SEVERITIES.has(severity)) {
    throw new ValidationError(
      `${kind}[${index}].severity must be one of ${[...SEVERITIES].join(', ')}`
    );
  }
  return { ...base, severity };
}

export function normalizeIntentContract(raw) {
  const value = assertPlainObject(raw, 'intent contract');
  const schema = assertString(value.schema, 'intent contract.schema', { max: 64 });
  if (schema !== INTENT_CONTRACT_SCHEMA) {
    throw new ValidationError(`intent contract.schema must be ${INTENT_CONTRACT_SCHEMA}`);
  }
  const evidence = assertPlainObject(value.evidence ?? {}, 'intent contract.evidence');
  const defaultMinimumIndependentVerifiers = assertSafeInteger(
    evidence.default_minimum_independent_verifiers ?? 0,
    'intent contract.evidence.default_minimum_independent_verifiers',
    { min: 0, max: 16 }
  );
  const authority = assertPlainObject(value.authority ?? {}, 'intent contract.authority');
  const optimization = assertPlainObject(value.optimization ?? {}, 'intent contract.optimization');
  const objectives = (value.objectives ?? []).map((item, index) => normalizeRequirement(
    item,
    'objective',
    index,
    defaultMinimumIndependentVerifiers
  ));
  const invariants = (value.invariants ?? []).map((item, index) => normalizeRequirement(
    item,
    'invariant',
    index,
    defaultMinimumIndependentVerifiers
  ));
  if (!objectives.length && !invariants.length) {
    throw new ValidationError('intent contract must define at least one objective or invariant');
  }
  const ids = [...objectives, ...invariants].map(item => item.id);
  if (new Set(ids).size !== ids.length) {
    throw new ValidationError('intent contract requirement IDs must be unique');
  }
  return {
    schema,
    contract_id: assertString(value.contract_id, 'intent contract.contract_id', {
      max: 160,
      pattern: REQUIREMENT_ID
    }),
    title: assertString(value.title, 'intent contract.title', { max: 256 }),
    mission: assertString(value.mission, 'intent contract.mission', { max: 8192 }),
    objectives: objectives.sort((left, right) => left.id.localeCompare(right.id)),
    invariants: invariants.sort((left, right) => left.id.localeCompare(right.id)),
    authority: {
      autonomous: normalizeActionPatterns(
        authority.autonomous ?? [],
        'intent contract.authority.autonomous'
      ),
      approval_required: normalizeActionPatterns(
        authority.approval_required ?? [],
        'intent contract.authority.approval_required'
      ),
      forbidden: normalizeActionPatterns(
        authority.forbidden ?? [],
        'intent contract.authority.forbidden'
      )
    },
    evidence: {
      default_minimum_independent_verifiers: defaultMinimumIndependentVerifiers
    },
    optimization: {
      priority: uniqueSortedStrings(
        optimization.priority ?? [],
        'intent contract.optimization.priority',
        { maxItems: 32, itemMax: 160 }
      )
    }
  };
}

export function compileIntentContract(raw) {
  const contract = normalizeIntentContract(raw);
  const requirements = [...contract.invariants, ...contract.objectives]
    .sort((left, right) => left.id.localeCompare(right.id));
  const graph = {
    schema: INTENT_GRAPH_SCHEMA,
    contract_id: contract.contract_id,
    contract_digest: digestObject(contract),
    title: contract.title,
    mission: contract.mission,
    requirements,
    authority: contract.authority,
    evidence: contract.evidence,
    optimization: contract.optimization,
    unknown_requirements: requirements
      .filter(item => item.verification.classification === 'unknown')
      .map(item => item.id)
  };
  return {
    ...graph,
    graph_digest: digestObject(graph)
  };
}

function actionMatches(action, pattern) {
  if (pattern.endsWith('.*')) {
    const prefix = pattern.slice(0, -1);
    return action.startsWith(prefix) && action.length > prefix.length;
  }
  return action === pattern;
}

export function classifyIntentAuthority(contractOrGraph, rawAction) {
  const value = assertPlainObject(contractOrGraph, 'intent authority source');
  const authority = assertPlainObject(value.authority, 'intent authority source.authority');
  const action = assertString(rawAction, 'action', { max: 160, pattern: ACTION_PATTERN });
  const forbidden = normalizeActionPatterns(authority.forbidden ?? [], 'authority.forbidden');
  const approvalRequired = normalizeActionPatterns(
    authority.approval_required ?? [],
    'authority.approval_required'
  );
  const autonomous = normalizeActionPatterns(authority.autonomous ?? [], 'authority.autonomous');
  if (forbidden.some(pattern => actionMatches(action, pattern))) {
    return { action, decision: 'deny', reason: 'forbidden' };
  }
  if (approvalRequired.some(pattern => actionMatches(action, pattern))) {
    return { action, decision: 'approval_required', reason: 'approval_required' };
  }
  if (autonomous.some(pattern => actionMatches(action, pattern))) {
    return { action, decision: 'autonomous', reason: 'autonomous' };
  }
  return { action, decision: 'deny', reason: 'unclassified_action' };
}

function normalizeObservations(raw, requirementIds) {
  const value = Array.isArray(raw)
    ? raw
    : assertPlainObject(raw ?? {}, 'intent observations').observations ?? [];
  if (!Array.isArray(value)) throw new ValidationError('intent observations must be an array');
  const normalized = value.map((item, index) => {
    const observation = assertPlainObject(item, `intent observations[${index}]`);
    const requirementId = assertString(
      observation.requirement_id,
      `intent observations[${index}].requirement_id`,
      { max: 80, pattern: REQUIREMENT_ID }
    );
    if (!requirementIds.has(requirementId)) {
      throw new ValidationError(`Unknown requirement_id: ${requirementId}`);
    }
    const status = assertString(observation.status, `intent observations[${index}].status`, {
      max: 16
    });
    if (!OBSERVATION_STATES.has(status)) {
      throw new ValidationError(
        `intent observations[${index}].status must be one of ${[...OBSERVATION_STATES].join(', ')}`
      );
    }
    return {
      requirement_id: requirementId,
      status,
      evidence_refs: uniqueSortedStrings(
        observation.evidence_refs ?? [],
        `intent observations[${index}].evidence_refs`,
        { maxItems: 64, itemMax: 512 }
      ),
      independent_verifiers: assertSafeInteger(
        observation.independent_verifiers ?? 0,
        `intent observations[${index}].independent_verifiers`,
        { min: 0, max: 64 }
      ),
      note: observation.note === undefined
        ? undefined
        : assertString(observation.note, `intent observations[${index}].note`, { max: 2048 })
    };
  });
  const ids = normalized.map(item => item.requirement_id);
  if (new Set(ids).size !== ids.length) {
    throw new ValidationError('intent observations may contain at most one observation per requirement');
  }
  return normalized;
}

export function assessIntentGraph(rawGraph, rawObservations = []) {
  const graph = assertPlainObject(rawGraph, 'intent graph');
  if (graph.schema !== INTENT_GRAPH_SCHEMA) {
    throw new ValidationError(`intent graph.schema must be ${INTENT_GRAPH_SCHEMA}`);
  }
  const requirements = Array.isArray(graph.requirements) ? graph.requirements : [];
  const requirementIds = new Set(requirements.map(item => item.id));
  const observations = normalizeObservations(rawObservations, requirementIds);
  const byRequirement = new Map(observations.map(item => [item.requirement_id, item]));
  const results = requirements.map(requirement => {
    const observation = byRequirement.get(requirement.id);
    const verification = assertPlainObject(requirement.verification, `${requirement.id}.verification`);
    let status = observation?.status ?? 'unknown';
    let reason = observation ? 'observed' : 'missing_observation';
    if (verification.classification === 'unknown') {
      status = 'unknown';
      reason = 'verification_method_unknown';
    } else if (
      status === 'pass'
      && observation.independent_verifiers < verification.minimum_independent_verifiers
    ) {
      status = 'unknown';
      reason = 'insufficient_independent_verification';
    }
    return {
      requirement_id: requirement.id,
      kind: requirement.kind,
      ...(requirement.severity ? { severity: requirement.severity } : {}),
      ...(requirement.priority ? { priority: requirement.priority } : {}),
      verification_class: verification.classification,
      status,
      reason,
      evidence_refs: observation?.evidence_refs ?? [],
      independent_verifiers: observation?.independent_verifiers ?? 0
    };
  });
  const summary = {
    pass: results.filter(item => item.status === 'pass').length,
    fail: results.filter(item => item.status === 'fail').length,
    unknown: results.filter(item => item.status === 'unknown').length
  };
  const assessment = {
    schema: INTENT_ASSESSMENT_SCHEMA,
    contract_id: graph.contract_id,
    contract_digest: graph.contract_digest,
    graph_digest: graph.graph_digest,
    summary,
    requirements: results
  };
  return {
    ...assessment,
    assessment_digest: digestObject(assessment)
  };
}

export function reconcileIntentGraph(rawGraph, rawObservations = []) {
  const graph = assertPlainObject(rawGraph, 'intent graph');
  const assessment = assessIntentGraph(graph, rawObservations);
  const requirementById = new Map(graph.requirements.map(item => [item.id, item]));
  const blocked = assessment.requirements.some(item => {
    if (item.kind !== 'invariant') return false;
    if (item.status === 'fail') return true;
    return item.status === 'unknown' && ['high', 'critical'].includes(item.severity);
  });
  const attentionRequired = assessment.summary.fail > 0 || assessment.summary.unknown > 0;
  const state = blocked
    ? 'blocked'
    : attentionRequired
      ? 'attention_required'
      : 'converged';
  const actions = [];
  const seenActions = new Set();
  for (const result of assessment.requirements) {
    if (result.status === 'pass') continue;
    const requirement = requirementById.get(result.requirement_id);
    for (const action of requirement.remediation_actions ?? []) {
      if (seenActions.has(action)) continue;
      seenActions.add(action);
      actions.push({
        ...classifyIntentAuthority(graph, action),
        triggered_by: [result.requirement_id]
      });
    }
  }
  const reconciliation = {
    schema: 'axiom-intent-reconciliation.v1',
    contract_id: graph.contract_id,
    graph_digest: graph.graph_digest,
    assessment_digest: assessment.assessment_digest,
    state,
    violations: assessment.requirements
      .filter(item => item.status === 'fail')
      .map(item => item.requirement_id),
    unknowns: assessment.requirements
      .filter(item => item.status === 'unknown')
      .map(item => item.requirement_id),
    proposed_actions: actions,
    automatic_remediation_actions: actions
      .filter(item => item.decision === 'autonomous')
      .map(item => item.action),
    approval_required_actions: actions
      .filter(item => item.decision === 'approval_required')
      .map(item => item.action),
    denied_actions: actions
      .filter(item => item.decision === 'deny')
      .map(item => item.action)
  };
  return {
    ...reconciliation,
    reconciliation_digest: digestObject(reconciliation)
  };
}
