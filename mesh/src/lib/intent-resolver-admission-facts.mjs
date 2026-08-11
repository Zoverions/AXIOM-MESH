import {
  ValidationError,
  assertPlainObject,
  assertString,
  canonicalJson,
  digestObject
} from './canonical.mjs';
import { effectDestinationForTool } from './effect-destination.mjs';
import {
  INTENT_EXECUTOR_REGISTRY_SCHEMA,
  normalizeIntentExecutorRegistry
} from './intent-execution-eligibility.mjs';
import {
  REPOSITORY_DOCS_EFFECT_POLICY,
  REPOSITORY_DOCS_EFFECT_POLICY_DIGEST
} from './repository-docs-effect.mjs';
import { repositoryDocsEffectDestination } from './repository-docs-destination.mjs';
import { REPOSITORY_DOCS_INPUT_RESOLVER_ID } from './intent-executor-input-resolution.mjs';

export const INTENT_RESOLVER_ADMISSION_FACTS_SCHEMA = 'axiom-intent-resolver-admission-facts.v1';

const ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/;
const SCOPE = /^[A-Za-z0-9*][A-Za-z0-9_.:*-]{0,159}$/;
const MAX_PLAN_LIFETIME_MS = 15 * 60 * 1000;
const RESERVED_SEMANTIC_PREFIXES = [
  'intent.executor.',
  'intent.registry.',
  'policy.',
  'capability.',
  'registry.'
];
const RESERVED_TARGET_PREFIXES = [
  'approval.',
  'governance.',
  'policy.',
  'capability.',
  'intent.executor.',
  'intent.registry.'
];

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

export function normalizeRepositoryDocsResolverDeclaration(raw) {
  const value = assertPlainObject(raw, 'executor input_resolver');
  const allowed = new Set([
    'id',
    'repository',
    'base_branch',
    'path_policy_digest',
    'max_plan_lifetime_ms'
  ]);
  const unknown = Object.keys(value).filter(key => !allowed.has(key));
  if (unknown.length) {
    throw new ValidationError(`executor input_resolver contains unsupported fields: ${unknown.join(', ')}`);
  }
  if (value.id !== REPOSITORY_DOCS_INPUT_RESOLVER_ID) {
    throw new ValidationError('executor input_resolver is not implemented');
  }
  if (value.repository !== REPOSITORY_DOCS_EFFECT_POLICY.repository) {
    throw new ValidationError('executor input_resolver repository is outside the repository-docs ceiling');
  }
  if (value.base_branch !== REPOSITORY_DOCS_EFFECT_POLICY.base_branch) {
    throw new ValidationError('executor input_resolver base branch is outside the repository-docs ceiling');
  }
  if (value.path_policy_digest !== REPOSITORY_DOCS_EFFECT_POLICY_DIGEST) {
    throw new ValidationError('executor input_resolver path-policy digest is invalid');
  }
  if (
    !Number.isSafeInteger(value.max_plan_lifetime_ms)
    || value.max_plan_lifetime_ms <= 0
    || value.max_plan_lifetime_ms > MAX_PLAN_LIFETIME_MS
  ) {
    throw new ValidationError('executor input_resolver plan lifetime is invalid');
  }
  return JSON.parse(canonicalJson(value));
}

export function classifyExecutorMappingInputMode(rawMapping, kernelVersion) {
  const registry = normalizeIntentExecutorRegistry({
    schema: INTENT_EXECUTOR_REGISTRY_SCHEMA,
    kernel_version: kernelVersion,
    mappings: [rawMapping]
  });
  const mapping = registry.mappings[0];
  if (!mapping) throw new ValidationError('executor admission mapping is unavailable');

  const resolverRaw = mapping.constraints?.input_resolver;
  if (mapping.fixed_input !== null) {
    if (resolverRaw !== undefined) {
      throw new ValidationError('executor mapping cannot declare both fixed_input and input_resolver');
    }
    return {
      mode: 'fixed_input',
      mapping,
      resolver: null,
      resolver_digest: null
    };
  }

  if (resolverRaw === undefined) {
    throw new ValidationError('executor mapping with null fixed_input requires input_resolver');
  }
  const constraintKeys = Object.keys(mapping.constraints);
  if (constraintKeys.length !== 1 || constraintKeys[0] !== 'input_resolver') {
    throw new ValidationError('resolver-backed mapping constraints must contain exactly input_resolver');
  }
  const resolver = normalizeRepositoryDocsResolverDeclaration(resolverRaw);
  return {
    mode: 'input_resolver',
    mapping,
    resolver,
    resolver_digest: digestObject(resolver)
  };
}

function normalizePolicy(raw) {
  const value = assertPlainObject(raw, 'policy');
  if (typeof value.version !== 'string' || !value.actions || typeof value.actions !== 'object') {
    throw new ValidationError('policy must contain version and actions');
  }
  return { value, digest: digestObject(value) };
}

function normalizeCapabilities(raw) {
  const value = assertPlainObject(raw, 'capability registry');
  if (value.schema !== 'axiom-capabilities.v1' || !Array.isArray(value.capabilities)) {
    throw new ValidationError('capability registry must use axiom-capabilities.v1 with capabilities');
  }
  return {
    value,
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

export function deriveRepositoryDocsResolverAdmissionFacts({
  candidate_mapping,
  executor_registry,
  policy,
  capabilities
}) {
  const currentRegistry = normalizeIntentExecutorRegistry(executor_registry);
  const classified = classifyExecutorMappingInputMode(
    candidate_mapping,
    currentRegistry.kernel_version
  );
  if (classified.mode !== 'input_resolver') {
    throw new ValidationError('repository-docs resolver admission requires input_resolver mode');
  }
  const mapping = classified.mapping;
  if (RESERVED_SEMANTIC_PREFIXES.some(prefix => mapping.semantic_action.startsWith(prefix))) {
    throw new ValidationError('resolver admission forbids self-modifying or authority-registry semantic actions');
  }
  if (RESERVED_TARGET_PREFIXES.some(prefix => mapping.target_action.startsWith(prefix))) {
    throw new ValidationError('resolver admission forbids authority-control target actions');
  }
  if (
    mapping.semantic_action !== REPOSITORY_DOCS_EFFECT_POLICY.semantic_action
    || mapping.target_action !== REPOSITORY_DOCS_EFFECT_POLICY.target_action
    || mapping.tool !== REPOSITORY_DOCS_EFFECT_POLICY.tool
    || mapping.capability_id !== REPOSITORY_DOCS_EFFECT_POLICY.capability_id
  ) {
    throw new ValidationError('resolver admission target is outside the repository-docs executor ceiling');
  }
  if (currentRegistry.mappings.some(item => item.semantic_action === mapping.semantic_action)) {
    throw new ValidationError('resolver admission semantic action already exists in the current registry');
  }

  const activePolicy = normalizePolicy(policy);
  const rule = Object.hasOwn(activePolicy.value.actions, mapping.target_action)
    ? activePolicy.value.actions[mapping.target_action]
    : null;
  if (!rule) throw new ValidationError('resolver admission target action does not exist in current policy');
  if (rule.decision !== 'allow') {
    throw new ValidationError('resolver admission target action is denied by current policy');
  }
  if (rule.tool !== mapping.tool) {
    throw new ValidationError('resolver admission target action/tool binding does not match current policy');
  }

  const capabilitySurface = normalizeCapabilities(capabilities);
  const capability = capabilitySurface.items.find(item => item.id === mapping.capability_id);
  if (!capability || capability.status !== 'implemented') {
    throw new ValidationError('resolver admission capability is not currently implemented');
  }

  const effectDestination = effectDestinationForTool(mapping.tool);
  if (effectDestination !== repositoryDocsEffectDestination()) {
    throw new ValidationError('resolver admission effect destination does not match the exact repository target');
  }
  const requiredScopes = sortedStrings(rule.required_scopes ?? [], 'policy.required_scopes', SCOPE);
  const confirmationValues = sortedStrings(
    rule.required_confirmation_values ?? [],
    'policy.required_confirmation_values',
    SCOPE
  );
  const policyGates = {
    risk: assertString(rule.risk, 'policy.risk', { max: 32 }),
    required_scopes: requiredScopes,
    required_confirmations: Number(rule.required_confirmations ?? 0),
    required_confirmation_values: confirmationValues,
    requires_independent_approval: rule.requires_independent_approval === true,
    constraints: canonicalObject(rule.constraints ?? {}, 'policy.constraints'),
    timeout_ms: Number(rule.timeout_ms ?? 10_000)
  };
  if (!Number.isSafeInteger(policyGates.required_confirmations) || policyGates.required_confirmations < 0) {
    throw new ValidationError('policy required_confirmations is invalid');
  }
  if (!Number.isSafeInteger(policyGates.timeout_ms) || policyGates.timeout_ms <= 0) {
    throw new ValidationError('policy timeout_ms is invalid');
  }

  const body = {
    schema: INTENT_RESOLVER_ADMISSION_FACTS_SCHEMA,
    mapping,
    mapping_digest: mapping.mapping_digest,
    base_executor_registry_digest: currentRegistry.registry_digest,
    policy_digest: activePolicy.digest,
    capability_registry_digest: capabilitySurface.digest,
    input_mode: 'input_resolver',
    resolver: classified.resolver,
    resolver_digest: classified.resolver_digest,
    effect_destination: effectDestination,
    policy_gates: policyGates,
    mapping_constraints_mode: 'resolver_owned_exact',
    mapping_installed: false,
    execution_authorized: false,
    non_claim: 'These are current resolver-admission facts only. They do not install a mapping, resolve executor input, grant a capability, or authorize an effect.'
  };
  return { ...body, facts_digest: digestObject(body) };
}
