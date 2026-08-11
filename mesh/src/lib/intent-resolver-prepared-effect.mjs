import {
  ValidationError,
  assertPlainObject,
  assertString,
  canonicalJson,
  digestObject
} from './canonical.mjs';
import { verifyObjectSignature } from './identity.mjs';
import { intentRequestDigest } from './intent-binding.mjs';
import { PolicyEngine } from './policy.mjs';
import {
  verifyIntentExecutorInputResolution,
  verifyResolvedIntentExecutionHandoff
} from './intent-executor-input-resolution.mjs';
import {
  buildPreparedRepositoryDocsEffect,
  verifyPreparedRepositoryDocsEffect
} from './repository-docs-effect.mjs';

export const INTENT_RESOLVED_TARGET_AUTHORIZATION_SCHEMA =
  'axiom-intent-resolved-target-authorization.v1';
export const INTENT_RESOLVER_PREPARED_EFFECT_BINDING_SCHEMA =
  'axiom-intent-resolver-prepared-effect-binding.v1';

const DIGEST = /^[a-f0-9]{64}$/;
const ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,191}$/;

function digest(value, name) {
  return assertString(value, name, { min: 64, max: 64, pattern: DIGEST });
}

function id(value, name, max = 256) {
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

function requireHypervisor(identity) {
  if (
    !identity?.keyId?.startsWith('hypervisor:')
    || typeof identity.signObject !== 'function'
    || !identity.publicKey
  ) {
    throw new ValidationError('resolved target authorization requires Hypervisor signing identity');
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
  const objectId = assertString(value[`${prefix}_id`], `${prefix}_id`, { min: 1, max: 320 });
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

function sortedScopes(principal) {
  const scopes = Array.isArray(principal.scopes) ? principal.scopes : [];
  if (scopes.some(scope => typeof scope !== 'string')) {
    throw new ValidationError('principal scopes must contain strings');
  }
  return [...new Set(scopes)].sort();
}

function verifyIndependentApproval(raw, { request, requester, action, now }) {
  const approval = assertPlainObject(raw, 'independent approval');
  const approvalId = id(approval.approval_id, 'approval_id');
  const approver = id(approval.approver, 'approval.approver', 160);
  const approvalRequester = id(approval.requester, 'approval.requester', 160);
  const approvalAction = assertString(approval.action, 'approval.action', { min: 1, max: 128 });
  const requestDigest = digest(approval.request_digest, 'approval.request_digest');
  const expiresAt = iso(approval.expires_at, 'approval.expires_at');
  if (approval.status !== 'active') throw new ValidationError('independent approval must be active');
  if (approver === requester) throw new ValidationError('independent approval must come from a different principal');
  if (approvalRequester !== requester) throw new ValidationError('independent approval requester does not match resolved requester');
  if (approvalAction !== action) throw new ValidationError('independent approval action does not match resolved target');
  if (requestDigest !== intentRequestDigest(request)) {
    throw new ValidationError('independent approval is not bound to the exact resolved target request');
  }
  if (new Date(expiresAt) <= new Date(now)) throw new ValidationError('independent approval is expired');
  return {
    approval_id: approvalId,
    approver,
    requester: approvalRequester,
    action: approvalAction,
    request_digest: requestDigest,
    status: 'active',
    expires_at: expiresAt
  };
}

function authorizationBody({
  handoff,
  policy,
  principal,
  request,
  approval,
  now
}) {
  const requester = id(principal.id, 'principal.id', 160);
  if (requester !== handoff.requester) {
    throw new ValidationError('resolved target requester does not match the handoff requester');
  }
  if (digestObject(sortedScopes(principal)) !== handoff.requester_scope_digest) {
    throw new ValidationError('resolved target principal scopes do not match current eligibility');
  }
  const targetRequest = canonicalObject(request, 'resolved target request');
  const targetPrincipal = assertPlainObject(targetRequest.principal, 'resolved target request principal');
  if (targetPrincipal.id !== requester) {
    throw new ValidationError('resolved target request principal does not match requester');
  }
  if (targetRequest.action !== handoff.target_action) {
    throw new ValidationError('resolved target request action does not match handoff target');
  }
  if (canonicalJson(targetRequest.input ?? {}) !== canonicalJson(handoff.resolved_input)) {
    throw new ValidationError('resolved target request input does not match signed resolved input');
  }

  const engine = new PolicyEngine(policy);
  if (engine.digest !== handoff.policy_digest) {
    throw new ValidationError('resolved target policy digest is stale against the handoff');
  }
  const decision = engine.evaluate({
    action: handoff.target_action,
    principal,
    intent: targetRequest
  });
  if (!decision.allow) {
    throw new ValidationError(`resolved target policy gates are not satisfied: ${decision.code}`);
  }
  if (
    decision.tool !== handoff.tool
    || decision.risk !== handoff.required_gates.risk
    || canonicalJson(decision.constraints ?? {}) !== canonicalJson(handoff.required_gates.constraints ?? {})
    || Number(decision.timeout_ms) !== Number(handoff.required_gates.timeout_ms)
    || decision.requires_independent_approval !== handoff.required_gates.requires_independent_approval
  ) {
    throw new ValidationError('resolved target policy decision does not match the handoff gates');
  }

  let verifiedApproval = null;
  if (handoff.required_gates.requires_independent_approval) {
    verifiedApproval = verifyIndependentApproval(approval, {
      request: targetRequest,
      requester,
      action: handoff.target_action,
      now
    });
  } else if (approval !== undefined && approval !== null) {
    throw new ValidationError('resolved target authorization does not accept unnecessary approval authority');
  }

  return {
    schema: INTENT_RESOLVED_TARGET_AUTHORIZATION_SCHEMA,
    eligibility_digest: handoff.eligibility_digest,
    resolution_id: handoff.resolution_id,
    resolution_digest: handoff.resolution_digest,
    handoff_id: handoff.handoff_id,
    handoff_digest: handoff.handoff_digest,
    repository_plan_id: handoff.repository_plan_id,
    repository_plan_digest: handoff.repository_plan_digest,
    resolved_input_digest: handoff.resolved_input_digest,
    requester,
    requester_scope_digest: handoff.requester_scope_digest,
    target_action: handoff.target_action,
    tool: handoff.tool,
    capability_id: handoff.capability_id,
    mapping_digest: handoff.mapping_digest,
    executor_registry_digest: handoff.executor_registry_digest,
    policy_digest: handoff.policy_digest,
    capability_registry_digest: handoff.capability_registry_digest,
    build_digest: handoff.build_digest,
    target_request: targetRequest,
    target_request_digest: intentRequestDigest(targetRequest),
    confirmations: [...new Set(targetRequest.confirmations ?? [])].sort(),
    confirmation_gate_satisfied: true,
    independent_approval: verifiedApproval,
    independent_approval_gate_satisfied:
      handoff.required_gates.requires_independent_approval ? true : null,
    authorized_at: iso(now, 'authorized_at'),
    execution_authorized: false,
    external_effect_prepared: false,
    external_effect_executed: false,
    non_claim: 'This artifact proves ordinary target policy/confirmation/approval gates for one exact resolved request. It is not a capability grant and does not itself execute an effect.'
  };
}

export function buildResolvedIntentTargetAuthorization({
  identity,
  handoff,
  resolution,
  eligibility,
  operatorPublicKey,
  policy,
  principal,
  request,
  approval,
  now = new Date().toISOString()
}) {
  const hypervisor = requireHypervisor(identity);
  const verifiedHandoff = verifyResolvedIntentExecutionHandoff(handoff, {
    resolution,
    eligibility,
    hypervisorPublicKey: hypervisor.publicKey,
    operatorPublicKey,
    now
  });
  return signContentAddress(
    authorizationBody({
      handoff: verifiedHandoff,
      policy,
      principal,
      request,
      approval,
      now
    }),
    'authorization',
    hypervisor
  );
}

export function verifyResolvedIntentTargetAuthorization(raw, {
  handoff,
  resolution,
  eligibility,
  hypervisorPublicKey,
  operatorPublicKey,
  policy,
  principal,
  request,
  approval,
  now = new Date().toISOString()
}) {
  const verifiedHandoff = verifyResolvedIntentExecutionHandoff(handoff, {
    resolution,
    eligibility,
    hypervisorPublicKey,
    operatorPublicKey,
    now
  });
  const authorization = verifySignedContentAddress(raw, {
    schema: INTENT_RESOLVED_TARGET_AUTHORIZATION_SCHEMA,
    prefix: 'authorization',
    publicKey: hypervisorPublicKey
  });
  const expected = authorizationBody({
    handoff: verifiedHandoff,
    policy,
    principal,
    request,
    approval,
    now: authorization.authorized_at
  });
  const {
    authorization_id: ignoredId,
    authorization_digest: ignoredDigest,
    attestation: ignoredAttestation,
    ...actualBody
  } = authorization;
  if (canonicalJson(actualBody) !== canonicalJson(expected)) {
    throw new ValidationError('resolved target authorization does not match current gates and request');
  }
  if (new Date(authorization.authorized_at) > new Date(now)) {
    throw new ValidationError('resolved target authorization is from the future');
  }
  return authorization;
}

function preparedBindingBody({ preparedEffect, authorization, handoff }) {
  return {
    schema: INTENT_RESOLVER_PREPARED_EFFECT_BINDING_SCHEMA,
    prepared_effect: preparedEffect,
    prepared_effect_id: preparedEffect.effect_id,
    prepared_effect_digest: preparedEffect.effect_digest,
    eligibility_digest: handoff.eligibility_digest,
    resolution_id: handoff.resolution_id,
    resolution_digest: handoff.resolution_digest,
    handoff_id: handoff.handoff_id,
    handoff_digest: handoff.handoff_digest,
    repository_plan_id: handoff.repository_plan_id,
    repository_plan_digest: handoff.repository_plan_digest,
    resolved_input_digest: handoff.resolved_input_digest,
    target_authorization_id: authorization.authorization_id,
    target_authorization_digest: authorization.authorization_digest,
    target_request_digest: authorization.target_request_digest,
    mapping_digest: handoff.mapping_digest,
    executor_registry_digest: handoff.executor_registry_digest,
    policy_digest: handoff.policy_digest,
    capability_registry_digest: handoff.capability_registry_digest,
    build_digest: handoff.build_digest,
    execution_authorized: false,
    external_effect_prepared: true,
    external_effect_executed: false,
    non_claim: 'This signed package binds a prepared repository effect to resolved Intent input and satisfied ordinary target gates. It does not execute the effect or install a production executor mapping.'
  };
}

export function buildResolvedIntentPreparedRepositoryDocsEffect({
  identity,
  authorization,
  handoff,
  resolution,
  eligibility,
  operatorPublicKey,
  policy,
  principal,
  request,
  approval,
  intent_id,
  machine_authority_digest = null,
  one_use_nonce,
  prepared_at = new Date().toISOString(),
  expires_at
}) {
  const hypervisor = requireHypervisor(identity);
  const verifiedAuthorization = verifyResolvedIntentTargetAuthorization(authorization, {
    handoff,
    resolution,
    eligibility,
    hypervisorPublicKey: hypervisor.publicKey,
    operatorPublicKey,
    policy,
    principal,
    request,
    approval,
    now: prepared_at
  });
  const verifiedHandoff = verifyResolvedIntentExecutionHandoff(handoff, {
    resolution,
    eligibility,
    hypervisorPublicKey: hypervisor.publicKey,
    operatorPublicKey,
    now: prepared_at
  });
  const verifiedResolution = verifyIntentExecutorInputResolution(resolution, {
    eligibility,
    hypervisorPublicKey: hypervisor.publicKey,
    operatorPublicKey,
    now: prepared_at
  });
  if (verifiedAuthorization.resolution_digest !== verifiedResolution.resolution_digest) {
    throw new ValidationError('target authorization does not bind the verified input resolution');
  }

  const preparedEffect = buildPreparedRepositoryDocsEffect({
    identity: hypervisor,
    plan: verifiedHandoff.resolved_input.repository_plan,
    operatorPublicKey,
    source_bindings: {
      intent_id: id(intent_id, 'intent_id', 160),
      intent_digest: digestObject(verifiedAuthorization.target_request),
      handoff_digest: verifiedHandoff.handoff_digest,
      remediation_proposal_id: verifiedHandoff.remediation_proposal_id,
      remediation_proposal_digest: verifiedHandoff.remediation_proposal_digest,
      principal: verifiedHandoff.requester,
      machine_authority_digest
    },
    authority_bindings: {
      policy_digest: verifiedHandoff.policy_digest,
      capability_registry_digest: verifiedHandoff.capability_registry_digest,
      executor_registry_digest: verifiedHandoff.executor_registry_digest,
      mapping_digest: verifiedHandoff.mapping_digest,
      build_digest: verifiedHandoff.build_digest
    },
    one_use_nonce,
    prepared_at,
    expires_at
  });
  return signContentAddress(
    preparedBindingBody({
      preparedEffect,
      authorization: verifiedAuthorization,
      handoff: verifiedHandoff
    }),
    'binding',
    hypervisor
  );
}

export function verifyResolvedIntentPreparedRepositoryDocsEffect(raw, {
  authorization,
  handoff,
  resolution,
  eligibility,
  hypervisorPublicKey,
  operatorPublicKey,
  policy,
  principal,
  request,
  approval,
  now = new Date().toISOString()
}) {
  const binding = verifySignedContentAddress(raw, {
    schema: INTENT_RESOLVER_PREPARED_EFFECT_BINDING_SCHEMA,
    prefix: 'binding',
    publicKey: hypervisorPublicKey
  });
  const verifiedAuthorization = verifyResolvedIntentTargetAuthorization(authorization, {
    handoff,
    resolution,
    eligibility,
    hypervisorPublicKey,
    operatorPublicKey,
    policy,
    principal,
    request,
    approval,
    now
  });
  const verifiedHandoff = verifyResolvedIntentExecutionHandoff(handoff, {
    resolution,
    eligibility,
    hypervisorPublicKey,
    operatorPublicKey,
    now
  });
  const preparedEffect = verifyPreparedRepositoryDocsEffect(binding.prepared_effect, {
    hypervisorPublicKey,
    operatorPublicKey,
    now
  });
  const expected = preparedBindingBody({
    preparedEffect,
    authorization: verifiedAuthorization,
    handoff: verifiedHandoff
  });
  const {
    binding_id: ignoredId,
    binding_digest: ignoredDigest,
    attestation: ignoredAttestation,
    ...actualBody
  } = binding;
  if (canonicalJson(actualBody) !== canonicalJson(expected)) {
    throw new ValidationError('prepared resolver effect binding does not match verified resolution and target authorization');
  }
  if (
    preparedEffect.source_bindings.handoff_digest !== verifiedHandoff.handoff_digest
    || preparedEffect.source_bindings.remediation_proposal_id !== verifiedHandoff.remediation_proposal_id
    || preparedEffect.source_bindings.remediation_proposal_digest !== verifiedHandoff.remediation_proposal_digest
    || preparedEffect.source_bindings.principal !== verifiedHandoff.requester
    || preparedEffect.authority_bindings.policy_digest !== verifiedHandoff.policy_digest
    || preparedEffect.authority_bindings.capability_registry_digest !== verifiedHandoff.capability_registry_digest
    || preparedEffect.authority_bindings.executor_registry_digest !== verifiedHandoff.executor_registry_digest
    || preparedEffect.authority_bindings.mapping_digest !== verifiedHandoff.mapping_digest
    || preparedEffect.authority_bindings.build_digest !== verifiedHandoff.build_digest
    || preparedEffect.plan.plan_id !== verifiedHandoff.repository_plan_id
    || preparedEffect.plan.plan_digest !== verifiedHandoff.repository_plan_digest
  ) {
    throw new ValidationError('prepared repository effect is not exactly bound to resolved Intent authority');
  }
  if (
    binding.execution_authorized !== false
    || binding.external_effect_prepared !== true
    || binding.external_effect_executed !== false
  ) {
    throw new ValidationError('prepared resolver binding authority flags are invalid');
  }
  return binding;
}
