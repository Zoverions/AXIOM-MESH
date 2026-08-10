import {
  ValidationError,
  assertPlainObject,
  assertString,
  canonicalJson,
  digestObject
} from './canonical.mjs';
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
const MAX_PLAN_LIFETIME_MS = 15 * 60 * 1000;

function digest(value, name) {
  return assertString(value, name, { min: 64, max: 64, pattern: DIGEST });
}

function iso(value, name) {
  const text = assertString(value, name, { max: 64 });
  const date = new Date(text);
  if (Number.isNaN(date.valueOf())) throw new ValidationError(`${name} must be an ISO timestamp`);
  return date.toISOString();
}

function requireHypervisorIdentity(identity) {
  if (!identity?.keyId?.startsWith('hypervisor:') || typeof identity.signObject !== 'function') {
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
  const id = assertString(value[`${prefix}_id`], `${prefix}_id`, { max: 256 });
  const suppliedDigest = digest(value[`${prefix}_digest`], `${prefix}_digest`);
  const attestation = assertPlainObject(value.attestation, `${prefix}.attestation`);
  const {
    [`${prefix}_id`]: ignoredId,
    [`${prefix}_digest`]: ignoredDigest,
    attestation: ignoredAttestation,
    ...body
  } = value;
  const expectedDigest = digestObject(body);
  if (suppliedDigest !== expectedDigest || id !== `${prefix}:${expectedDigest}`) {
    throw new ValidationError(`${prefix} is not content-addressed`);
  }
  const signed = {
    ...JSON.parse(canonicalJson(body)),
    [`${prefix}_id`]: id,
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
  const supplied = digest(value.eligibility_digest, 'eligibility_digest');
  const { eligibility_digest: ignoredDigest, ...material } = value;
  if (digestObject(material) !== supplied) {
    throw new ValidationError('execution eligibility digest does not match its content');
  }
  return value;
}

function resolverDeclaration(eligibility) {
  const constraints = assertPlainObject(
    eligibility?.mapped_executor?.registry_constraints ?? {},
    'mapped executor registry constraints'
  );
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
    eligibility.eligible !== false
    || eligibility.decision !== 'unknown'
    || eligibility.reason !== 'executor_input_unresolved'
    || eligibility.execution_authorized !== false
  ) {
    throw new ValidationError('repository-plan resolver requires executor_input_unresolved eligibility');
  }
  if (eligibility.mapped_executor?.fixed_input_digest !== null) {
    throw new ValidationError('repository-plan resolver may not replace fixed executor input');
  }
  if (
    eligibility.mapped_executor?.target_action !== REPOSITORY_DOCS_EFFECT_POLICY.target_action
    || eligibility.mapped_executor?.tool !== REPOSITORY_DOCS_EFFECT_POLICY.tool
    || eligibility.mapped_executor?.capability_id !== REPOSITORY_DOCS_EFFECT_POLICY.capability_id
  ) {
    throw new ValidationError('repository-plan resolver target is outside the repository-docs executor ceiling');
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

function resolutionBody(eligibility, resolver, plan, createdAt) {
  const input = resolvedInput(plan);
  return {
    schema: INTENT_EXECUTOR_INPUT_RESOLUTION_SCHEMA,
    eligibility_digest: eligibility.eligibility_digest,
    remediation_proposal_id: eligibility.remediation_proposal_id,
    remediation_proposal_digest: eligibility.remediation_proposal_digest,
    basis_digest: eligibility.basis_digest,
    source_assessment_digest: eligibility.source_assessment_digest,
    source_reconciliation_digest: eligibility.source_reconciliation_digest,
    semantic_action: eligibility.semantic_action,
    mapping_id: eligibility.mapped_executor.mapping_id,
    mapping_digest: eligibility.mapped_executor.mapping_digest,
    executor_registry_digest: eligibility.executor_registry_digest,
    policy_digest: eligibility.policy_digest,
    capability_registry_digest: eligibility.capability_registry_digest,
    machine_authority_digest: eligibility.machine_authority_digest,
    requester: eligibility.requester,
    resolver,
    resolver_digest: digestObject(resolver),
    repository_plan_id: plan.plan_id,
    repository_plan_digest: plan.plan_digest,
    repository_plan_summary: planSummary(plan),
    target_action: eligibility.mapped_executor.target_action,
    tool: eligibility.mapped_executor.tool,
    capability_id: eligibility.mapped_executor.capability_id,
    target_scope: eligibility.target_scope,
    target_risk: eligibility.target_risk,
    required_confirmation_values: eligibility.required_confirmation_values,
    required_independent_approvals: eligibility.required_independent_approvals,
    resolved_input: input,
    resolved_input_digest: digestObject(input),
    created_at: createdAt,
    expires_at: plan.expires_at,
    execution_authorized: false,
    external_effect_prepared: false,
    external_effect_executed: false,
    non_claim: 'Resolving executor input binds signed repository evidence to a target action; it does not satisfy confirmation, approval, or execution authority.'
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
    throw new ValidationError('executor input resolution does not match the exact eligibility and signed repository plan');
  }
  return resolution;
}

function resolvedHandoffBody(resolution) {
  return {
    schema: INTENT_RESOLVED_HANDOFF_SCHEMA,
    eligibility_digest: resolution.eligibility_digest,
    resolution_id: resolution.resolution_id,
    resolution_digest: resolution.resolution_digest,
    remediation_proposal_id: resolution.remediation_proposal_id,
    remediation_proposal_digest: resolution.remediation_proposal_digest,
    semantic_action: resolution.semantic_action,
    mapping_id: resolution.mapping_id,
    mapping_digest: resolution.mapping_digest,
    executor_registry_digest: resolution.executor_registry_digest,
    policy_digest: resolution.policy_digest,
    capability_registry_digest: resolution.capability_registry_digest,
    machine_authority_digest: resolution.machine_authority_digest,
    requester: resolution.requester,
    target_action: resolution.target_action,
    tool: resolution.tool,
    capability_id: resolution.capability_id,
    target_scope: resolution.target_scope,
    target_risk: resolution.target_risk,
    repository_plan_id: resolution.repository_plan_id,
    repository_plan_digest: resolution.repository_plan_digest,
    resolved_input: resolution.resolved_input,
    resolved_input_digest: resolution.resolved_input_digest,
    required_confirmation_values: resolution.required_confirmation_values,
    required_independent_approvals: resolution.required_independent_approvals,
    execution_authorized: false,
    external_effect_prepared: false,
    external_effect_executed: false,
    non_claim: 'This resolved handoff carries exact executor input but does not grant target-action confirmation, approval, or execution authority.'
  };
}

export function buildResolvedIntentExecutionHandoff({ identity, resolution }) {
  requireHypervisorIdentity(identity);
  const value = assertPlainObject(resolution, 'executor input resolution');
  if (value.schema !== INTENT_EXECUTOR_INPUT_RESOLUTION_SCHEMA) {
    throw new ValidationError('resolved handoff requires an executor input resolution');
  }
  if (value.execution_authorized !== false || value.external_effect_prepared !== false) {
    throw new ValidationError('resolved handoff source resolution must remain non-executing');
  }
  return signContentAddress(resolvedHandoffBody(value), 'handoff', identity);
}

export function verifyResolvedIntentExecutionHandoff(rawHandoff, {
  resolution,
  hypervisorPublicKey
}) {
  const handoff = verifySignedContentAddress(rawHandoff, {
    schema: INTENT_RESOLVED_HANDOFF_SCHEMA,
    prefix: 'handoff',
    publicKey: hypervisorPublicKey
  });
  const value = assertPlainObject(resolution, 'executor input resolution');
  if (
    handoff.resolution_id !== value.resolution_id
    || handoff.resolution_digest !== value.resolution_digest
  ) {
    throw new ValidationError('resolved handoff is not bound to the supplied input resolution');
  }
  const expected = resolvedHandoffBody(value);
  const {
    handoff_id: ignoredId,
    handoff_digest: ignoredDigest,
    attestation: ignoredAttestation,
    ...actualBody
  } = handoff;
  if (canonicalJson(actualBody) !== canonicalJson(expected)) {
    throw new ValidationError('resolved handoff does not match the exact input resolution');
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
