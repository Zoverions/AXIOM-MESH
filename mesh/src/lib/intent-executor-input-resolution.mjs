import {
  ValidationError,
  assertPlainObject,
  assertString,
  canonicalJson,
  digestObject
} from './canonical.mjs';
import { INTENT_EXECUTION_ELIGIBILITY_SCHEMA } from './intent-execution-eligibility.mjs';
import { verifyObjectSignature } from './identity.mjs';
import {
  REPOSITORY_DOCS_EFFECT_POLICY,
  REPOSITORY_DOCS_EFFECT_POLICY_DIGEST,
  verifyRepositoryDocsEffectPlan
} from './repository-docs-effect.mjs';

export const INTENT_EXECUTOR_INPUT_RESOLUTION_SCHEMA = 'axiom-intent-executor-input-resolution.v1';
export const INTENT_RESOLVED_HANDOFF_SCHEMA = 'axiom-intent-resolved-execution-handoff.v1';
export const REPOSITORY_DOCS_INPUT_RESOLVER_ID = 'repository-docs-plan.v1';
export const REPOSITORY_DOCS_RESOLVED_INPUT_SCHEMA = 'axiom-repository-docs-resolved-input.v1';

const DIGEST = /^[a-f0-9]{64}$/;
const ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/;
const MAX_PLAN_LIFETIME_MS = 15 * 60 * 1000;

function digest(value, name) {
  return assertString(value, name, { min: 64, max: 64, pattern: DIGEST });
}

function id(value, name, max = 160) {
  return assertString(value, name, { min: 1, max, pattern: ID });
}

function iso(value, name) {
  const text = assertString(value, name, { min: 1, max: 64 });
  const date = new Date(text);
  if (Number.isNaN(date.valueOf())) throw new ValidationError(`${name} must be an ISO timestamp`);
  return date.toISOString();
}

function canonicalObject(value, name) {
  return JSON.parse(canonicalJson(assertPlainObject(value, name)));
}

function requireHypervisorIdentity(identity) {
  if (
    !identity?.keyId?.startsWith('hypervisor:')
    || typeof identity.signObject !== 'function'
    || !identity.publicKey
  ) {
    throw new ValidationError('Intent input resolution requires Hypervisor signing identity');
  }
  return identity;
}

function signContentAddress(body, prefix, identity) {
  const objectDigest = digestObject(body);
  const content = {
    ...body,
    [`${prefix}_id`]: `${prefix}:${objectDigest}`,
    [`${prefix}_digest`]: objectDigest
  };
  return { ...content, attestation: identity.signObject(content) };
}

function verifySignedContentAddress(raw, { schema, prefix, publicKey }) {
  const value = assertPlainObject(raw, prefix);
  if (value.schema !== schema) throw new ValidationError(`${prefix} schema must be ${schema}`);
  const objectId = assertString(value[`${prefix}_id`], `${prefix}_id`, { min: 1, max: 256 });
  const suppliedDigest = digest(value[`${prefix}_digest`], `${prefix}_digest`);
  const attestation = assertPlainObject(value.attestation, `${prefix}.attestation`);
  const {
    [`${prefix}_id`]: ignoredId,
    [`${prefix}_digest`]: ignoredDigest,
    attestation: ignoredAttestation,
    ...body
  } = value;
  const expectedDigest = digestObject(body);
  if (suppliedDigest !== expectedDigest || objectId !== `${prefix}:${expectedDigest}`) {
    throw new ValidationError(`${prefix} is not content-addressed`);
  }
  const signed = {
    ...JSON.parse(canonicalJson(body)),
    [`${prefix}_id`]: objectId,
    [`${prefix}_digest`]: suppliedDigest
  };
  if (
    attestation.algorithm !== 'Ed25519'
    || typeof attestation.key_id !== 'string'
    || !attestation.key_id.startsWith('hypervisor:')
    || !verifyObjectSignature(signed, attestation, publicKey)
  ) {
    throw new ValidationError(`${prefix} signature is invalid`);
  }
  return { ...signed, attestation: JSON.parse(canonicalJson(attestation)) };
}

function verifyEligibilityDigest(raw) {
  const value = assertPlainObject(raw, 'execution eligibility');
  if (value.schema !== INTENT_EXECUTION_ELIGIBILITY_SCHEMA) {
    throw new ValidationError(`execution eligibility schema must be ${INTENT_EXECUTION_ELIGIBILITY_SCHEMA}`);
  }
  const supplied = digest(value.eligibility_digest, 'eligibility_digest');
  const { eligibility_digest: ignoredDigest, ...material } = value;
  if (digestObject(material) !== supplied) {
    throw new ValidationError('execution eligibility digest does not match its content');
  }
  return JSON.parse(canonicalJson(value));
}

function resolverDeclaration(eligibility) {
  const constraints = assertPlainObject(
    eligibility?.mapped_executor?.registry_constraints ?? {},
    'mapped executor registry constraints'
  );
  const constraintKeys = Object.keys(constraints);
  if (constraintKeys.length !== 1 || constraintKeys[0] !== 'input_resolver') {
    throw new ValidationError('repository-plan resolver requires exactly one input_resolver registry constraint');
  }
  const resolver = assertPlainObject(constraints.input_resolver, 'executor input_resolver');
  const allowed = new Set([
    'id',
    'repository',
    'base_branch',
    'path_policy_digest',
    'max_plan_lifetime_ms'
  ]);
  const unknown = Object.keys(resolver).filter(key => !allowed.has(key));
  if (unknown.length) {
    throw new ValidationError(`executor input_resolver contains unsupported fields: ${unknown.join(', ')}`);
  }
  if (resolver.id !== REPOSITORY_DOCS_INPUT_RESOLVER_ID) {
    throw new ValidationError('executor input_resolver is not implemented');
  }
  if (resolver.repository !== REPOSITORY_DOCS_EFFECT_POLICY.repository) {
    throw new ValidationError('executor input_resolver repository is outside the repository-docs ceiling');
  }
  if (resolver.base_branch !== REPOSITORY_DOCS_EFFECT_POLICY.base_branch) {
    throw new ValidationError('executor input_resolver base branch is outside the repository-docs ceiling');
  }
  if (resolver.path_policy_digest !== REPOSITORY_DOCS_EFFECT_POLICY_DIGEST) {
    throw new ValidationError('executor input_resolver path-policy digest is invalid');
  }
  if (
    !Number.isSafeInteger(resolver.max_plan_lifetime_ms)
    || resolver.max_plan_lifetime_ms <= 0
    || resolver.max_plan_lifetime_ms > MAX_PLAN_LIFETIME_MS
  ) {
    throw new ValidationError('executor input_resolver plan lifetime is invalid');
  }
  return JSON.parse(canonicalJson(resolver));
}

export function verifyResolverEligibleInputState(rawEligibility) {
  const eligibility = verifyEligibilityDigest(rawEligibility);
  if (
    eligibility.decision !== 'unknown'
    || eligibility.reason !== 'executor_input_unresolved'
    || eligibility.execution_authorized !== false
  ) {
    throw new ValidationError('repository-plan resolver requires executor_input_unresolved eligibility');
  }
  if (Object.hasOwn(eligibility, 'bound_input')) {
    throw new ValidationError('repository-plan resolver may not replace an existing bound input');
  }
  const mapped = assertPlainObject(eligibility.mapped_executor, 'mapped_executor');
  if (mapped.fixed_input_digest !== null) {
    throw new ValidationError('repository-plan resolver may not replace fixed executor input');
  }
  if (
    eligibility.semantic_action !== REPOSITORY_DOCS_EFFECT_POLICY.semantic_action
    || mapped.target_action !== REPOSITORY_DOCS_EFFECT_POLICY.target_action
    || mapped.tool !== REPOSITORY_DOCS_EFFECT_POLICY.tool
    || mapped.capability_id !== REPOSITORY_DOCS_EFFECT_POLICY.capability_id
  ) {
    throw new ValidationError('repository-plan resolver target is outside the repository-docs executor ceiling');
  }
  if (mapped.capability_status !== 'implemented') {
    throw new ValidationError('repository-plan resolver requires an implemented target capability');
  }
  const gates = canonicalObject(eligibility.required_gates, 'required_gates');
  if (!Array.isArray(gates.missing_scopes) || gates.missing_scopes.length !== 0) {
    throw new ValidationError('repository-plan resolver requires all target scopes to be satisfied');
  }
  resolverDeclaration(eligibility);
  return eligibility;
}

function verifyPlanForResolver(rawPlan, {
  operatorPublicKey,
  resolver,
  now
}) {
  const plan = verifyRepositoryDocsEffectPlan(rawPlan, { operatorPublicKey, now });
  if (
    plan.repository !== resolver.repository
    || plan.base_branch !== resolver.base_branch
    || plan.path_policy_digest !== resolver.path_policy_digest
  ) {
    throw new ValidationError('repository plan does not satisfy the executor resolver constraints');
  }
  const plannedAt = new Date(plan.planned_at).valueOf();
  const expiresAt = new Date(plan.expires_at).valueOf();
  if (expiresAt - plannedAt > resolver.max_plan_lifetime_ms) {
    throw new ValidationError('repository plan lifetime exceeds the executor resolver ceiling');
  }
  return plan;
}

function planSummary(plan) {
  return {
    repository: plan.repository,
    base_branch: plan.base_branch,
    base_sha: plan.base_sha,
    path_policy_digest: plan.path_policy_digest,
    changes: plan.changes.map(change => ({
      path: change.path,
      operation: change.operation,
      old_blob_sha: change.old_blob_sha,
      old_content_sha256: change.old_content_sha256,
      new_content_sha256: change.new_content_sha256,
      new_bytes: change.new_bytes
    }))
  };
}

function resolvedInput(plan) {
  return {
    schema: REPOSITORY_DOCS_RESOLVED_INPUT_SCHEMA,
    repository_plan: plan
  };
}

function eligibilityBindings(eligibility) {
  const mapped = assertPlainObject(eligibility.mapped_executor, 'mapped_executor');
  return {
    remediation_proposal_id: id(eligibility.remediation_proposal_id, 'remediation_proposal_id'),
    remediation_proposal_digest: digest(eligibility.remediation_proposal_digest, 'remediation_proposal_digest'),
    remediation_state_digest: digest(eligibility.remediation_state_digest, 'remediation_state_digest'),
    contract_id: id(eligibility.contract_id, 'contract_id'),
    activation_digest: digest(eligibility.activation_digest, 'activation_digest'),
    contract_digest: digest(eligibility.contract_digest, 'contract_digest'),
    graph_digest: digest(eligibility.graph_digest, 'graph_digest'),
    build_digest: digest(eligibility.build_digest, 'build_digest'),
    source_assessment_digest: digest(eligibility.source_assessment_digest, 'source_assessment_digest'),
    source_reconciliation_digest: digest(
      eligibility.source_reconciliation_digest,
      'source_reconciliation_digest'
    ),
    semantic_action: assertString(eligibility.semantic_action, 'semantic_action', { min: 1, max: 128 }),
    requester: id(eligibility.requester, 'requester'),
    requester_scope_digest: digest(eligibility.requester_scope_digest, 'requester_scope_digest'),
    executor_registry_digest: digest(eligibility.executor_registry_digest, 'executor_registry_digest'),
    policy_digest: digest(eligibility.policy_digest, 'policy_digest'),
    capability_registry_digest: digest(
      eligibility.capability_registry_digest,
      'capability_registry_digest'
    ),
    mapping_digest: digest(mapped.mapping_digest, 'mapping_digest'),
    target_action: assertString(mapped.target_action, 'target_action', { min: 1, max: 128 }),
    tool: assertString(mapped.tool, 'tool', { min: 1, max: 160 }),
    capability_id: id(mapped.capability_id, 'capability_id'),
    required_gates: canonicalObject(eligibility.required_gates, 'required_gates')
  };
}

function resolutionBody(eligibility, resolver, plan, createdAt) {
  const input = resolvedInput(plan);
  return {
    schema: INTENT_EXECUTOR_INPUT_RESOLUTION_SCHEMA,
    eligibility_digest: eligibility.eligibility_digest,
    ...eligibilityBindings(eligibility),
    resolver,
    resolver_digest: digestObject(resolver),
    repository_plan_id: plan.plan_id,
    repository_plan_digest: plan.plan_digest,
    repository_plan_summary: planSummary(plan),
    resolved_input: input,
    resolved_input_digest: digestObject(input),
    created_at: createdAt,
    expires_at: plan.expires_at,
    execution_authorized: false,
    external_effect_prepared: false,
    external_effect_executed: false,
    future_consumer: 'Intent resolved-input admission only',
    non_claim: 'Resolving executor input binds a signed repository plan to current eligibility; it does not satisfy confirmations, independent approval, or execution authority.'
  };
}

export function buildIntentExecutorInputResolution({
  identity,
  eligibility,
  repository_plan,
  operatorPublicKey,
  now = new Date().toISOString()
}) {
  requireHypervisorIdentity(identity);
  const createdAt = iso(now, 'resolution time');
  const currentEligibility = verifyResolverEligibleInputState(eligibility);
  const resolver = resolverDeclaration(currentEligibility);
  const plan = verifyPlanForResolver(repository_plan, {
    operatorPublicKey,
    resolver,
    now: createdAt
  });
  return signContentAddress(
    resolutionBody(currentEligibility, resolver, plan, createdAt),
    'resolution',
    identity
  );
}

export function verifyIntentExecutorInputResolution(rawResolution, {
  eligibility,
  hypervisorPublicKey,
  operatorPublicKey,
  now = new Date().toISOString()
}) {
  const resolution = verifySignedContentAddress(rawResolution, {
    schema: INTENT_EXECUTOR_INPUT_RESOLUTION_SCHEMA,
    prefix: 'resolution',
    publicKey: hypervisorPublicKey
  });
  const currentEligibility = verifyResolverEligibleInputState(eligibility);
  if (resolution.eligibility_digest !== currentEligibility.eligibility_digest) {
    throw new ValidationError('executor input resolution is stale against supplied current eligibility');
  }
  if (
    resolution.execution_authorized !== false
    || resolution.external_effect_prepared !== false
    || resolution.external_effect_executed !== false
  ) {
    throw new ValidationError('executor input resolution must remain non-executing');
  }
  const resolver = resolverDeclaration(currentEligibility);
  const plan = verifyPlanForResolver(resolution.resolved_input?.repository_plan, {
    operatorPublicKey,
    resolver,
    now
  });
  const expected = resolutionBody(currentEligibility, resolver, plan, resolution.created_at);
  const {
    resolution_id: ignoredId,
    resolution_digest: ignoredDigest,
    attestation: ignoredAttestation,
    ...actualBody
  } = resolution;
  if (canonicalJson(actualBody) !== canonicalJson(expected)) {
    throw new ValidationError('executor input resolution does not match the exact current eligibility and signed repository plan');
  }
  return resolution;
}

function resolvedHandoffBody(resolution) {
  return {
    schema: INTENT_RESOLVED_HANDOFF_SCHEMA,
    eligibility_digest: resolution.eligibility_digest,
    remediation_proposal_id: resolution.remediation_proposal_id,
    remediation_proposal_digest: resolution.remediation_proposal_digest,
    remediation_state_digest: resolution.remediation_state_digest,
    contract_id: resolution.contract_id,
    activation_digest: resolution.activation_digest,
    contract_digest: resolution.contract_digest,
    graph_digest: resolution.graph_digest,
    build_digest: resolution.build_digest,
    source_assessment_digest: resolution.source_assessment_digest,
    source_reconciliation_digest: resolution.source_reconciliation_digest,
    semantic_action: resolution.semantic_action,
    requester: resolution.requester,
    requester_scope_digest: resolution.requester_scope_digest,
    executor_registry_digest: resolution.executor_registry_digest,
    policy_digest: resolution.policy_digest,
    capability_registry_digest: resolution.capability_registry_digest,
    mapping_digest: resolution.mapping_digest,
    target_action: resolution.target_action,
    tool: resolution.tool,
    capability_id: resolution.capability_id,
    required_gates: resolution.required_gates,
    resolution_id: resolution.resolution_id,
    resolution_digest: resolution.resolution_digest,
    repository_plan_id: resolution.repository_plan_id,
    repository_plan_digest: resolution.repository_plan_digest,
    resolved_input: resolution.resolved_input,
    resolved_input_digest: resolution.resolved_input_digest,
    expires_at: resolution.expires_at,
    execution_authorized: false,
    external_effect_prepared: false,
    external_effect_executed: false,
    future_consumer: 'Intent resolved-input admission only',
    non_claim: 'This resolved handoff carries exact executor input and current gates; it is not a capability grant, confirmation, approval, or effect request.'
  };
}

export function buildResolvedIntentExecutionHandoff({
  identity,
  resolution,
  eligibility,
  operatorPublicKey,
  now = new Date().toISOString()
}) {
  const hypervisor = requireHypervisorIdentity(identity);
  const verifiedResolution = verifyIntentExecutorInputResolution(resolution, {
    eligibility,
    hypervisorPublicKey: hypervisor.publicKey,
    operatorPublicKey,
    now
  });
  return signContentAddress(
    resolvedHandoffBody(verifiedResolution),
    'handoff',
    hypervisor
  );
}

export function verifyResolvedIntentExecutionHandoff(rawHandoff, {
  resolution,
  eligibility,
  hypervisorPublicKey,
  operatorPublicKey,
  now = new Date().toISOString()
}) {
  const verifiedResolution = verifyIntentExecutorInputResolution(resolution, {
    eligibility,
    hypervisorPublicKey,
    operatorPublicKey,
    now
  });
  const handoff = verifySignedContentAddress(rawHandoff, {
    schema: INTENT_RESOLVED_HANDOFF_SCHEMA,
    prefix: 'handoff',
    publicKey: hypervisorPublicKey
  });
  const expected = resolvedHandoffBody(verifiedResolution);
  const {
    handoff_id: ignoredId,
    handoff_digest: ignoredDigest,
    attestation: ignoredAttestation,
    ...actualBody
  } = handoff;
  if (canonicalJson(actualBody) !== canonicalJson(expected)) {
    throw new ValidationError('resolved handoff does not match the verified current input resolution');
  }
  if (
    handoff.execution_authorized !== false
    || handoff.external_effect_prepared !== false
    || handoff.external_effect_executed !== false
  ) {
    throw new ValidationError('resolved handoff must remain non-executing');
  }
  return handoff;
}
