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
const GOVERNANCE_RATIFIED = new Set(['active', 'verified']);
const MAX_FIXED_INPUT_BYTES = 16 * 1024;
const ALLOWED_REGISTRY_FIELDS = new Set(['schema', 'kernel_version', 'mappings']);
const ALLOWED_MAPPING_FIELDS = new Set([
  'semantic_action',
  'target_action',
  'capability_id',
  'tool',
  'fixed_input',
  'constraints'
]);

function assertDigest(value, name) {
  return assertString(value, name, { min: 64, max: 64, pattern: DIGEST });
}

function sortedUniqueStrings(value, name, pattern = ID) {
  if (!Array.isArray(value) || value.length > 256) {
    throw new ValidationError(`${name} must be an array with at most 256 items`);
  }
  return [...new Set(value.map((item, index) => assertString(
    item,
    `${name}[${index}]`,
    { max: 160, pattern }
  )))].sort();
}

function rejectUnknownFields(value, allowed, name) {
  const unknown = Object.keys(value).filter(key => !allowed.has(key));
  if (unknown.length) {
    throw new ValidationError(`${name} contains unsupported fields: ${unknown.join(', ')}`);
  }
}

function normalizeFixedInput(value, name) {
  if (value === null) return null;
  const input = assertPlainObject(value, name);
  const encoded = canonicalJson(input);
  if (Buffer.byteLength(encoded, 'utf8') > MAX_FIXED_INPUT_BYTES) {
    throw new ValidationError(`${name} exceeds ${MAX_FIXED_INPUT_BYTES} bytes`);
  }
  return JSON.parse(encoded);
}

function normalizeMapping(raw, index) {
  const value = assertPlainObject(raw, `executor_registry.mappings[${index}]`);
  rejectUnknownFields(value, ALLOWED_MAPPING_FIELDS, `executor_registry.mappings[${index}]`);
  const semanticAction = assertString(
    value.semantic_action,
    `executor_registry.mappings[${index}].semantic_action`,
    { max: 128, pattern: ACTION }
  );
  if (semanticAction.includes('*')) {
    throw new ValidationError('Intent executor registry does not permit wildcard semantic actions');
  }
  const targetAction = assertString(
    value.target_action,
    `executor_registry.mappings[${index}].target_action`,
    { max: 128, pattern: ACTION }
  );
  if (targetAction.includes('*')) {
    throw new ValidationError('Intent executor registry does not permit wildcard target actions');
  }
  const body = {
    semantic_action: semanticAction,
    target_action: targetAction,
    capability_id: assertString(
      value.capability_id,
      `executor_registry.mappings[${index}].capability_id`,
      { max: 160, pattern: ID }
    ),
    tool: assertString(
      value.tool,
      `executor_registry.mappings[${index}].tool`,
      { max: 160, pattern: TOOL }
    ),
    fixed_input: normalizeFixedInput(
      value.fixed_input ?? null,
      `executor_registry.mappings[${index}].fixed_input`
    ),
    constraints: JSON.parse(canonicalJson(
      assertPlainObject(value.constraints ?? {}, `executor_registry.mappings[${index}].constraints`)
    ))
  };
  return {
    ...body,
    mapping_digest: digestObject(body)
  };
}

export function normalizeIntentExecutorRegistry(raw) {
  const value = assertPlainObject(raw, 'Intent executor registry');
  rejectUnknownFields(value, ALLOWED_REGISTRY_FIELDS, 'Intent executor registry');
  if (value.schema !== INTENT_EXECUTOR_REGISTRY_SCHEMA) {
    throw new ValidationError(`executor registry schema must be ${INTENT_EXECUTOR_REGISTRY_SCHEMA}`);
  }
  const mappingsRaw = value.mappings ?? [];
  if (!Array.isArray(mappingsRaw) || mappingsRaw.length > 256) {
    throw new ValidationError('executor registry mappings must contain at most 256 items');
  }
  const mappings = mappingsRaw.map(normalizeMapping)
    .sort((left, right) => left.semantic_action.localeCompare(right.semantic_action));
  const semanticNames = mappings.map(item => item.semantic_action);
  if (new Set(semanticNames).size !== semanticNames.length) {
    throw new ValidationError('executor registry semantic actions must be unique');
  }
  const body = {
    schema: INTENT_EXECUTOR_REGISTRY_SCHEMA,
    kernel_version: assertString(value.kernel_version, 'executor_registry.kernel_version', {
      max: 64,
      pattern: /^[A-Za-z0-9][A-Za-z0-9.+_-]{0,63}$/
    }),
    mappings
  };
  return {
    ...body,
    registry_digest: digestObject(body)
  };
}

export async function loadIntentExecutorRegistry(path) {
  const raw = JSON.parse(await readFile(path, 'utf8'));
  return normalizeIntentExecutorRegistry(raw);
}

function normalizeCapabilitySurface(raw) {
  const value = assertPlainObject(raw, 'capability registry');
  if (value.schema !== 'axiom-capabilities.v1') {
    throw new ValidationError('capability registry must use axiom-capabilities.v1');
  }
  if (!Array.isArray(value.capabilities)) {
    throw new ValidationError('capability registry capabilities must be an array');
  }
  const capabilities = value.capabilities.map((item, index) => {
    const capability = assertPlainObject(item, `capabilities[${index}]`);
    return {
      id: assertString(capability.id, `capabilities[${index}].id`, { max: 160, pattern: ID }),
      status: assertString(capability.status, `capabilities[${index}].status`, { max: 64 })
    };
  });
  return {
    capabilities,
    capability_registry_digest: digestObject(value)
  };
}

function normalizePolicySurface(raw) {
  const value = assertPlainObject(raw, 'policy');
  if (typeof value.version !== 'string' || !value.actions || typeof value.actions !== 'object') {
    throw new ValidationError('policy must contain version and actions');
  }
  return {
    value,
    policy_digest: digestObject(value)
  };
}

function remediationStateBinding(rawState, proposal) {
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
  const actual = {
    remediation_proposal_id: state.remediation_proposal_id,
    remediation_proposal_digest: state.remediation_proposal_digest,
    basis_digest: state.basis_digest,
    contract_id: state.contract_id,
    activation_digest: state.activation_digest,
    source_assessment_digest: state.source_assessment_digest,
    source_reconciliation_digest: state.source_reconciliation_digest
  };
  if (canonicalJson(actual) !== canonicalJson(expected)) {
    throw new ValidationError('remediation governance state does not match the remediation proposal');
  }
  const body = {
    ...expected,
    governance_status: assertString(state.governance_status, 'governance_status', { max: 32 }),
    current: state.current === true,
    current_reason: typeof state.current_reason === 'string' ? state.current_reason : null
  };
  return {
    ...body,
    remediation_state_digest: digestObject(body)
  };
}

function baseEligibility({ proposal, state, semanticAction, registry, principal, policyDigest, capabilityDigest }) {
  const body = {
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
    requester: assertString(principal.id, 'principal.id', { max: 160, pattern: ID }),
    requester_scope_digest: digestObject(sortedUniqueStrings(principal.scopes ?? [], 'principal.scopes', /^[A-Za-z0-9*][A-Za-z0-9_.:*-]{0,159}$/)),
    executor_registry_digest: registry.registry_digest,
    policy_digest: policyDigest,
    capability_registry_digest: capabilityDigest,
    execution_authorized: false,
    future_consumer: 'Gateway /v1/intents only',
    non_claim: 'AXIOM Intent v0.6 may establish execution eligibility and prepare a handoff, but it does not authorize or perform an effect.'
  };
  return body;
}

function finishEligibility(base, details) {
  const body = {
    ...base,
    ...details
  };
  return {
    ...body,
    eligibility_digest: digestObject(body)
  };
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
  const semanticAction = assertString(semantic_action, 'semantic_action', {
    max: 128,
    pattern: ACTION
  });
  const registry = normalizeIntentExecutorRegistry(executor_registry);
  const policySurface = normalizePolicySurface(policy);
  const capabilitySurface = normalizeCapabilitySurface(capabilities);
  const state = remediationStateBinding(remediation_state, proposal);
  const principalValue = assertPlainObject(principal, 'principal');
  const base = baseEligibility({
    proposal,
    state,
    semanticAction,
    registry,
    principal: principalValue,
    policyDigest: policySurface.policy_digest,
    capabilityDigest: capabilitySurface.capability_registry_digest
  });
  const proposedAction = proposal.actions.find(item => item.action === semanticAction);
  if (!proposedAction) {
    return finishEligibility(base, {
      decision: 'ineligible',
      reason: 'action_not_ratified',
      mapped_executor: null,
      required_gates: null
    });
  }
  if (!GOVERNANCE_RATIFIED.has(state.governance_status)) {
    return finishEligibility(base, {
      decision: 'ineligible',
      reason: 'remediation_not_ratified',
      mapped_executor: null,
      required_gates: null
    });
  }
  if (!state.current) {
    return finishEligibility(base, {
      decision: 'ineligible',
      reason: 'stale_remediation',
      mapped_executor: null,
      required_gates: null
    });
  }
  if (proposedAction.decision === 'deny') {
    return finishEligibility(base, {
      decision: 'ineligible',
      reason: 'contract_denied',
      mapped_executor: null,
      required_gates: null
    });
  }

  const mapping = registry.mappings.find(item => item.semantic_action === semanticAction);
  if (!mapping) {
    return finishEligibility(base, {
      decision: 'ineligible',
      reason: 'executor_unavailable',
      mapped_executor: null,
      required_gates: null
    });
  }

  const capability = capabilitySurface.capabilities.find(item => item.id === mapping.capability_id);
  if (!capability || capability.status !== 'implemented') {
    return finishEligibility(base, {
      decision: 'ineligible',
      reason: 'capability_unavailable',
      mapped_executor: {
        mapping_digest: mapping.mapping_digest,
        target_action: mapping.target_action,
        capability_id: mapping.capability_id,
        tool: mapping.tool
      },
      required_gates: null
    });
  }

  const rule = Object.hasOwn(policySurface.value.actions, mapping.target_action)
    ? policySurface.value.actions[mapping.target_action]
    : null;
  if (!rule) {
    return finishEligibility(base, {
      decision: 'ineligible',
      reason: 'executor_policy_action_unavailable',
      mapped_executor: {
        mapping_digest: mapping.mapping_digest,
        target_action: mapping.target_action,
        capability_id: mapping.capability_id,
        tool: mapping.tool
      },
      required_gates: null
    });
  }
  if (rule.tool !== mapping.tool) {
    return finishEligibility(base, {
      decision: 'ineligible',
      reason: 'executor_policy_tool_mismatch',
      mapped_executor: {
        mapping_digest: mapping.mapping_digest,
        target_action: mapping.target_action,
        capability_id: mapping.capability_id,
        tool: mapping.tool
      },
      required_gates: null
    });
  }
  if (rule.decision !== 'allow') {
    return finishEligibility(base, {
      decision: 'ineligible',
      reason: 'policy_denied',
      mapped_executor: {
        mapping_digest: mapping.mapping_digest,
        target_action: mapping.target_action,
        capability_id: mapping.capability_id,
        tool: mapping.tool
      },
      required_gates: null
    });
  }

  const principalScopes = sortedUniqueStrings(
    principalValue.scopes ?? [],
    'principal.scopes',
    /^[A-Za-z0-9*][A-Za-z0-9_.:*-]{0,159}$/
  );
  const requiredScopes = sortedUniqueStrings(
    rule.required_scopes ?? [],
    'policy.required_scopes',
    /^[A-Za-z0-9*][A-Za-z0-9_.:*-]{0,159}$/
  );
  const missingScopes = requiredScopes.filter(scope => (
    !principalScopes.includes('*') && !principalScopes.includes(scope)
  ));
  const requiredGates = {
    risk: assertString(rule.risk, 'policy.risk', { max: 32 }),
    required_scopes: requiredScopes,
    missing_scopes: missingScopes,
    required_confirmations: Number(rule.required_confirmations ?? 0),
    required_confirmation_values: sortedUniqueStrings(
      rule.required_confirmation_values ?? [],
      'policy.required_confirmation_values',
      /^[A-Za-z0-9*][A-Za-z0-9_.:*-]{0,159}$/
    ),
    requires_independent_approval: rule.requires_independent_approval === true,
    constraints: JSON.parse(canonicalJson(rule.constraints ?? {})),
    timeout_ms: Number(rule.timeout_ms ?? 10_000)
  };
  const mappedExecutor = {
    mapping_digest: mapping.mapping_digest,
    target_action: mapping.target_action,
    capability_id: mapping.capability_id,
    capability_status: capability.status,
    tool: mapping.tool,
    fixed_input_digest: mapping.fixed_input === null ? null : digestObject(mapping.fixed_input),
    registry_constraints: mapping.constraints
  };
  if (missingScopes.length) {
    return finishEligibility(base, {
      decision: 'ineligible',
      reason: 'insufficient_scope',
      mapped_executor: mappedExecutor,
      required_gates: requiredGates
    });
  }
  if (mapping.fixed_input === null) {
    return finishEligibility(base, {
      decision: 'unknown',
      reason: 'executor_input_unresolved',
      mapped_executor: mappedExecutor,
      required_gates: requiredGates
    });
  }
  return finishEligibility(base, {
    decision: 'eligible',
    reason: 'eligible_for_bounded_handoff',
    mapped_executor: mappedExecutor,
    required_gates: requiredGates,
    bound_input: mapping.fixed_input
  });
}

export function buildIntentExecutionHandoff(rawEligibility) {
  const eligibility = assertPlainObject(rawEligibility, 'Intent execution eligibility');
  if (eligibility.schema !== INTENT_EXECUTION_ELIGIBILITY_SCHEMA) {
    throw new ValidationError(`eligibility schema must be ${INTENT_EXECUTION_ELIGIBILITY_SCHEMA}`);
  }
  const suppliedDigest = assertDigest(eligibility.eligibility_digest, 'eligibility_digest');
  const { eligibility_digest: ignoredDigest, ...eligibilityBody } = eligibility;
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
  const input = normalizeFixedInput(eligibility.bound_input, 'bound_input');
  if (input === null) throw new ValidationError('execution handoff requires fixed bound input');
  const body = {
    schema: INTENT_EXECUTION_HANDOFF_SCHEMA,
    eligibility_digest: suppliedDigest,
    remediation_proposal_id: assertString(
      eligibility.remediation_proposal_id,
      'remediation_proposal_id',
      { max: 160 }
    ),
    remediation_proposal_digest: assertDigest(
      eligibility.remediation_proposal_digest,
      'remediation_proposal_digest'
    ),
    remediation_state_digest: assertDigest(
      eligibility.remediation_state_digest,
      'remediation_state_digest'
    ),
    executor_registry_digest: assertDigest(
      eligibility.executor_registry_digest,
      'executor_registry_digest'
    ),
    policy_digest: assertDigest(eligibility.policy_digest, 'policy_digest'),
    capability_registry_digest: assertDigest(
      eligibility.capability_registry_digest,
      'capability_registry_digest'
    ),
    semantic_action: assertString(eligibility.semantic_action, 'semantic_action', {
      max: 128,
      pattern: ACTION
    }),
    requester: assertString(eligibility.requester, 'requester', { max: 160, pattern: ID }),
    target: {
      action: assertString(mapped.target_action, 'mapped_executor.target_action', {
        max: 128,
        pattern: ACTION
      }),
      tool: assertString(mapped.tool, 'mapped_executor.tool', { max: 160, pattern: TOOL }),
      capability_id: assertString(mapped.capability_id, 'mapped_executor.capability_id', {
        max: 160,
        pattern: ID
      }),
      mapping_digest: assertDigest(mapped.mapping_digest, 'mapped_executor.mapping_digest'),
      input
    },
    required_gates: JSON.parse(canonicalJson(assertPlainObject(
      eligibility.required_gates,
      'required_gates'
    ))),
    execution_authorized: false,
    future_consumer: 'Gateway /v1/intents only',
    replay_semantics: 'content-addressed; future consumer must apply ordinary Gateway idempotency and approval controls',
    non_claim: 'This handoff is a non-executing candidate. It is not a capability grant, approval, confirmation, or effect request.'
  };
  const digest = digestObject(body);
  return {
    ...body,
    handoff_id: `intent-handoff:${digest}`,
    handoff_digest: digest
  };
}

export function normalizeIntentExecutionHandoff(raw) {
  const value = assertPlainObject(raw, 'Intent execution handoff');
  if (value.schema !== INTENT_EXECUTION_HANDOFF_SCHEMA) {
    throw new ValidationError(`handoff schema must be ${INTENT_EXECUTION_HANDOFF_SCHEMA}`);
  }
  if (value.execution_authorized !== false) {
    throw new ValidationError('execution handoff must have execution_authorized=false');
  }
  const suppliedDigest = assertDigest(value.handoff_digest, 'handoff_digest');
  const suppliedId = assertString(value.handoff_id, 'handoff_id', { max: 160 });
  const { handoff_id: ignoredId, handoff_digest: ignoredDigest, ...body } = value;
  const expectedDigest = digestObject(body);
  if (suppliedDigest !== expectedDigest || suppliedId !== `intent-handoff:${expectedDigest}`) {
    throw new ValidationError('execution handoff is not content-addressed');
  }
  return {
    ...JSON.parse(canonicalJson(body)),
    handoff_id: suppliedId,
    handoff_digest: suppliedDigest
  };
}
