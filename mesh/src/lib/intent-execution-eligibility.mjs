import { readFile } from 'node:fs/promises';

import {
  ValidationError,
  assertPlainObject,
  assertString,
  canonicalJson,
  digestObject
} from './canonical.mjs';
import { normalizeIntentRemediationProposal } from './intent-remediation.mjs';

export const INTENT_EXECUTOR_REGISTRY_SCHEMA = 'axiom-intent-remediation-executor-registry.v1';
export const INTENT_EXECUTION_ELIGIBILITY_SCHEMA = 'axiom-intent-execution-eligibility.v1';
export const INTENT_EXECUTION_HANDOFF_SCHEMA = 'axiom-intent-execution-handoff.v1';

const ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/;
const ACTION = /^[a-z][a-z0-9._:-]{1,127}$/;
const TOOL = /^[a-z][a-z0-9._:-]{1,159}$/;
const DIGEST = /^[a-f0-9]{64}$/;
const SCOPE = /^[A-Za-z0-9*][A-Za-z0-9_.:*-]{0,159}$/;
const RATIFIED = new Set(['active', 'verified']);
const MAX_FIXED_INPUT_BYTES = 16 * 1024;

function assertDigest(value, name) {
  return assertString(value, name, { min: 64, max: 64, pattern: DIGEST });
}

function canonicalObject(value, name) {
  return JSON.parse(canonicalJson(assertPlainObject(value, name)));
}

function sortedStrings(value, name, pattern = ID) {
  if (!Array.isArray(value) || value.length > 256) {
    throw new ValidationError(`${name} must be an array with at most 256 items`);
  }
  return [...new Set(value.map((item, index) => assertString(
    item,
    `${name}[${index}]`,
    { max: 160, pattern }
  )))].sort();
}

function rejectUnknown(value, allowed, name) {
  const unknown = Object.keys(value).filter(key => !allowed.has(key));
  if (unknown.length) {
    throw new ValidationError(`${name} contains unsupported fields: ${unknown.join(', ')}`);
  }
}

function fixedInput(value, name) {
  if (value === null) return null;
  const result = canonicalObject(value, name);
  if (Buffer.byteLength(canonicalJson(result), 'utf8') > MAX_FIXED_INPUT_BYTES) {
    throw new ValidationError(`${name} exceeds ${MAX_FIXED_INPUT_BYTES} bytes`);
  }
  return result;
}

function normalizeMapping(raw, index) {
  const value = assertPlainObject(raw, `executor_registry.mappings[${index}]`);
  rejectUnknown(value, new Set([
    'semantic_action', 'target_action', 'capability_id', 'tool',
    'fixed_input', 'constraints', 'mapping_digest'
  ]), `executor_registry.mappings[${index}]`);
  const semanticAction = assertString(value.semantic_action, 'semantic_action', {
    max: 128,
    pattern: ACTION
  });
  const targetAction = assertString(value.target_action, 'target_action', {
    max: 128,
    pattern: ACTION
  });
  if (semanticAction.includes('*') || targetAction.includes('*')) {
    throw new ValidationError('Intent executor registry does not permit wildcard actions');
  }
  const body = {
    semantic_action: semanticAction,
    target_action: targetAction,
    capability_id: assertString(value.capability_id, 'capability_id', { max: 160, pattern: ID }),
    tool: assertString(value.tool, 'tool', { max: 160, pattern: TOOL }),
    fixed_input: fixedInput(value.fixed_input ?? null, 'fixed_input'),
    constraints: canonicalObject(value.constraints ?? {}, 'constraints')
  };
  const mappingDigest = digestObject(body);
  if (value.mapping_digest !== undefined && assertDigest(value.mapping_digest, 'mapping_digest') !== mappingDigest) {
    throw new ValidationError('executor mapping digest is invalid');
  }
  return { ...body, mapping_digest: mappingDigest };
}

export function normalizeIntentExecutorRegistry(raw) {
  const value = assertPlainObject(raw, 'Intent executor registry');
  rejectUnknown(value, new Set([
    'schema', 'kernel_version', 'mappings', 'registry_digest'
  ]), 'Intent executor registry');
  if (value.schema !== INTENT_EXECUTOR_REGISTRY_SCHEMA) {
    throw new ValidationError(`executor registry schema must be ${INTENT_EXECUTOR_REGISTRY_SCHEMA}`);
  }
  if (!Array.isArray(value.mappings ?? []) || (value.mappings ?? []).length > 256) {
    throw new ValidationError('executor registry mappings must contain at most 256 items');
  }
  const mappings = (value.mappings ?? []).map(normalizeMapping)
    .sort((a, b) => a.semantic_action.localeCompare(b.semantic_action));
  if (new Set(mappings.map(item => item.semantic_action)).size !== mappings.length) {
    throw new ValidationError('executor registry semantic actions must be unique');
  }
  const body = {
    schema: INTENT_EXECUTOR_REGISTRY_SCHEMA,
    kernel_version: assertString(value.kernel_version, 'kernel_version', {
      max: 64,
      pattern: /^[A-Za-z0-9][A-Za-z0-9.+_-]{0,63}$/
    }),
    mappings
  };
  const registryDigest = digestObject(body);
  if (value.registry_digest !== undefined && assertDigest(value.registry_digest, 'registry_digest') !== registryDigest) {
    throw new ValidationError('executor registry digest is invalid');
  }
  return { ...body, registry_digest: registryDigest };
}

export async function loadIntentExecutorRegistry(path) {
  return normalizeIntentExecutorRegistry(JSON.parse(await readFile(path, 'utf8')));
}

function capabilitySurface(raw) {
  const value = assertPlainObject(raw, 'capability registry');
  if (value.schema !== 'axiom-capabilities.v1' || !Array.isArray(value.capabilities)) {
    throw new ValidationError('capability registry must use axiom-capabilities.v1 with capabilities');
  }
  return {
    digest: digestObject(value),
    items: value.capabilities.map((rawCapability, index) => {
      const item = assertPlainObject(rawCapability, `capabilities[${index}]`);
      return {
        id: assertString(item.id, `capabilities[${index}].id`, { max: 160, pattern: ID }),
        status: assertString(item.status, `capabilities[${index}].status`, { max: 64 })
      };
    })
  };
}

function policySurface(raw) {
  const value = assertPlainObject(raw, 'policy');
  if (typeof value.version !== 'string' || !value.actions || typeof value.actions !== 'object') {
    throw new ValidationError('policy must contain version and actions');
  }
  return { value, digest: digestObject(value) };
}

function bindRemediationState(rawState, proposal) {
  const state = assertPlainObject(rawState, 'Intent remediation governance state');
  if (state.schema !== 'axiom-intent-remediation-governance-state.v1') {
    throw new ValidationError('execution eligibility requires axiom-intent-remediation-governance-state.v1');
  }
  if (state.execution_authorized !== false) {
    throw new ValidationError('remediation governance state must remain non-executing');
  }
  const expected = {
    remediation_proposal_id: proposal.remediation_proposal_id,
    remediation_proposal_digest: proposal.remediation_proposal_digest,
    basis_digest: proposal.basis_digest,
    contract_id: proposal.contract_id,
    activation_digest: proposal.activation_digest,
    source_assessment_digest: proposal.source_assessment_digest,
    source_reconciliation_digest: proposal.source_reconciliation_digest
  };
  const actual = Object.fromEntries(Object.keys(expected).map(key => [key, state[key]]));
  if (canonicalJson(actual) !== canonicalJson(expected)) {
    throw new ValidationError('remediation governance state does not match the remediation proposal');
  }
  const body = {
    ...expected,
    governance_status: assertString(state.governance_status, 'governance_status', { max: 32 }),
    current: state.current === true,
    current_reason: typeof state.current_reason === 'string' ? state.current_reason : null
  };
  return { ...body, remediation_state_digest: digestObject(body) };
}

function finish(base, details) {
  const body = { ...base, ...details };
  return { ...body, eligibility_digest: digestObject(body) };
}

export function evaluateIntentExecutionEligibility({
  remediation,
  remediation_state,
  semantic_action,
  executor_registry,
  policy,
  capabilities,
  principal
}) {
  const proposal = normalizeIntentRemediationProposal(remediation);
  const state = bindRemediationState(remediation_state, proposal);
  const registry = normalizeIntentExecutorRegistry(executor_registry);
  const activePolicy = policySurface(policy);
  const activeCapabilities = capabilitySurface(capabilities);
  const requester = assertPlainObject(principal, 'principal');
  const semanticAction = assertString(semantic_action, 'semantic_action', { max: 128, pattern: ACTION });
  const principalScopes = sortedStrings(requester.scopes ?? [], 'principal.scopes', SCOPE);
  const base = {
    schema: INTENT_EXECUTION_ELIGIBILITY_SCHEMA,
    remediation_proposal_id: proposal.remediation_proposal_id,
    remediation_proposal_digest: proposal.remediation_proposal_digest,
    remediation_state_digest: state.remediation_state_digest,
    contract_id: proposal.contract_id,
    activation_digest: proposal.activation_digest,
    contract_digest: proposal.contract_digest,
    graph_digest: proposal.graph_digest,
    build_digest: proposal.build_digest,
    source_assessment_digest: proposal.source_assessment_digest,
    source_reconciliation_digest: proposal.source_reconciliation_digest,
    semantic_action: semanticAction,
    requester: assertString(requester.id, 'principal.id', { max: 160, pattern: ID }),
    requester_scope_digest: digestObject(principalScopes),
    executor_registry_digest: registry.registry_digest,
    policy_digest: activePolicy.digest,
    capability_registry_digest: activeCapabilities.digest,
    execution_authorized: false,
    future_consumer: 'Gateway /v1/intents only',
    non_claim: 'AXIOM Intent v0.6 may establish execution eligibility and prepare a handoff, but it does not authorize or perform an effect.'
  };

  const requested = proposal.actions.find(item => item.action === semanticAction);
  if (!requested) return finish(base, {
    decision: 'ineligible', reason: 'action_not_ratified', mapped_executor: null, required_gates: null
  });
  if (!RATIFIED.has(state.governance_status)) return finish(base, {
    decision: 'ineligible', reason: 'remediation_not_ratified', mapped_executor: null, required_gates: null
  });
  if (!state.current) return finish(base, {
    decision: 'ineligible', reason: 'stale_remediation', mapped_executor: null, required_gates: null
  });
  if (requested.decision === 'deny') return finish(base, {
    decision: 'ineligible', reason: 'contract_denied', mapped_executor: null, required_gates: null
  });

  const mapping = registry.mappings.find(item => item.semantic_action === semanticAction);
  if (!mapping) return finish(base, {
    decision: 'ineligible', reason: 'executor_unavailable', mapped_executor: null, required_gates: null
  });
  const mapped = {
    mapping_digest: mapping.mapping_digest,
    target_action: mapping.target_action,
    capability_id: mapping.capability_id,
    tool: mapping.tool
  };
  const capability = activeCapabilities.items.find(item => item.id === mapping.capability_id);
  if (!capability || capability.status !== 'implemented') return finish(base, {
    decision: 'ineligible', reason: 'capability_unavailable', mapped_executor: mapped, required_gates: null
  });
  const rule = Object.hasOwn(activePolicy.value.actions, mapping.target_action)
    ? activePolicy.value.actions[mapping.target_action]
    : null;
  if (!rule) return finish(base, {
    decision: 'ineligible', reason: 'executor_policy_action_unavailable', mapped_executor: mapped, required_gates: null
  });
  if (rule.tool !== mapping.tool) return finish(base, {
    decision: 'ineligible', reason: 'executor_policy_tool_mismatch', mapped_executor: mapped, required_gates: null
  });
  if (rule.decision !== 'allow') return finish(base, {
    decision: 'ineligible', reason: 'policy_denied', mapped_executor: mapped, required_gates: null
  });

  const requiredScopes = sortedStrings(rule.required_scopes ?? [], 'policy.required_scopes', SCOPE);
  const missingScopes = requiredScopes.filter(scope => !principalScopes.includes('*') && !principalScopes.includes(scope));
  const gates = {
    risk: assertString(rule.risk, 'policy.risk', { max: 32 }),
    required_scopes: requiredScopes,
    missing_scopes: missingScopes,
    required_confirmations: Number(rule.required_confirmations ?? 0),
    required_confirmation_values: sortedStrings(
      rule.required_confirmation_values ?? [],
      'policy.required_confirmation_values',
      SCOPE
    ),
    requires_independent_approval: rule.requires_independent_approval === true,
    constraints: canonicalObject(rule.constraints ?? {}, 'policy.constraints'),
    timeout_ms: Number(rule.timeout_ms ?? 10_000)
  };
  const executor = {
    ...mapped,
    capability_status: capability.status,
    fixed_input_digest: mapping.fixed_input === null ? null : digestObject(mapping.fixed_input),
    registry_constraints: mapping.constraints
  };
  if (missingScopes.length) return finish(base, {
    decision: 'ineligible', reason: 'insufficient_scope', mapped_executor: executor, required_gates: gates
  });
  if (mapping.fixed_input === null) return finish(base, {
    decision: 'unknown', reason: 'executor_input_unresolved', mapped_executor: executor, required_gates: gates
  });
  return finish(base, {
    decision: 'eligible',
    reason: 'eligible_for_bounded_handoff',
    mapped_executor: executor,
    required_gates: gates,
    bound_input: mapping.fixed_input
  });
}

export function buildIntentExecutionHandoff(rawEligibility) {
  const eligibility = assertPlainObject(rawEligibility, 'Intent execution eligibility');
  if (eligibility.schema !== INTENT_EXECUTION_ELIGIBILITY_SCHEMA) {
    throw new ValidationError(`eligibility schema must be ${INTENT_EXECUTION_ELIGIBILITY_SCHEMA}`);
  }
  const suppliedDigest = assertDigest(eligibility.eligibility_digest, 'eligibility_digest');
  const { eligibility_digest: ignored, ...eligibilityBody } = eligibility;
  if (digestObject(eligibilityBody) !== suppliedDigest) {
    throw new ValidationError('eligibility digest is invalid');
  }
  if (eligibility.decision !== 'eligible') {
    throw new ValidationError('execution handoff requires an eligible result');
  }
  if (eligibility.execution_authorized !== false) {
    throw new ValidationError('eligibility must remain non-executing');
  }
  const mapped = assertPlainObject(eligibility.mapped_executor, 'mapped_executor');
  const input = fixedInput(eligibility.bound_input, 'bound_input');
  if (input === null) throw new ValidationError('execution handoff requires fixed bound input');
  const body = {
    schema: INTENT_EXECUTION_HANDOFF_SCHEMA,
    eligibility_digest: suppliedDigest,
    remediation_proposal_id: assertString(eligibility.remediation_proposal_id, 'remediation_proposal_id', { max: 160 }),
    remediation_proposal_digest: assertDigest(eligibility.remediation_proposal_digest, 'remediation_proposal_digest'),
    remediation_state_digest: assertDigest(eligibility.remediation_state_digest, 'remediation_state_digest'),
    executor_registry_digest: assertDigest(eligibility.executor_registry_digest, 'executor_registry_digest'),
    policy_digest: assertDigest(eligibility.policy_digest, 'policy_digest'),
    capability_registry_digest: assertDigest(eligibility.capability_registry_digest, 'capability_registry_digest'),
    semantic_action: assertString(eligibility.semantic_action, 'semantic_action', { max: 128, pattern: ACTION }),
    requester: assertString(eligibility.requester, 'requester', { max: 160, pattern: ID }),
    target: {
      action: assertString(mapped.target_action, 'target_action', { max: 128, pattern: ACTION }),
      tool: assertString(mapped.tool, 'tool', { max: 160, pattern: TOOL }),
      capability_id: assertString(mapped.capability_id, 'capability_id', { max: 160, pattern: ID }),
      mapping_digest: assertDigest(mapped.mapping_digest, 'mapping_digest'),
      input
    },
    required_gates: canonicalObject(eligibility.required_gates, 'required_gates'),
    execution_authorized: false,
    future_consumer: 'Gateway /v1/intents only',
    replay_semantics: 'content-addressed; future consumer must apply ordinary Gateway idempotency and approval controls',
    non_claim: 'This handoff is a non-executing candidate. It is not a capability grant, approval, confirmation, or effect request.'
  };
  const handoffDigest = digestObject(body);
  return {
    ...body,
    handoff_id: `intent-handoff:${handoffDigest}`,
    handoff_digest: handoffDigest
  };
}

export function normalizeIntentExecutionHandoff(raw) {
  const value = assertPlainObject(raw, 'Intent execution handoff');
  if (value.schema !== INTENT_EXECUTION_HANDOFF_SCHEMA || value.execution_authorized !== false) {
    throw new ValidationError('execution handoff schema or execution boundary is invalid');
  }
  const handoffDigest = assertDigest(value.handoff_digest, 'handoff_digest');
  const handoffId = assertString(value.handoff_id, 'handoff_id', { max: 160 });
  const { handoff_id: ignoredId, handoff_digest: ignoredDigest, ...body } = value;
  const expected = digestObject(body);
  if (handoffDigest !== expected || handoffId !== `intent-handoff:${expected}`) {
    throw new ValidationError('execution handoff is not content-addressed');
  }
  return { ...JSON.parse(canonicalJson(body)), handoff_id: handoffId, handoff_digest: handoffDigest };
}
