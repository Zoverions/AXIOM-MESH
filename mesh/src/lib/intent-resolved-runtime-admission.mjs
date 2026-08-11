import {
  AxiomError,
  ValidationError,
  assertPlainObject,
  assertString,
  canonicalJson,
  digestObject
} from './canonical.mjs';
import { effectDestinationForTool } from './effect-destination.mjs';
import { intentRequestDigest, intentRequestIdentity } from './intent-binding.mjs';
import { evaluateIntentExecutionEligibility, normalizeIntentExecutorRegistry } from './intent-execution-eligibility.mjs';
import {
  verifyIntentExecutorInputResolution,
  verifyResolvedIntentExecutionHandoff
} from './intent-executor-input-resolution.mjs';
import { verifyIntentExecutorApplicationReceipt } from './intent-executor-application-receipt-current.mjs';
import { verifyObjectSignature } from './identity.mjs';
import { evaluateMachineIntent } from './machine-principal.mjs';
import { PolicyEngine } from './policy.mjs';
import { buildPreparedRepositoryDocsEffect } from './repository-docs-effect.mjs';

export const INTENT_RESOLVED_RUNTIME_ADMISSION_SCHEMA = 'axiom-intent-resolved-runtime-admission.v1';
export const INTENT_RESOLVED_TARGET_ENVELOPE_SCHEMA = 'axiom-intent-resolved-target-envelope.v1';

const DIGEST = /^[a-f0-9]{64}$/;
const ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/;
const ACTION = /^[a-z][a-z0-9.-]+$/;
const PURPOSE = /^[a-z][a-z0-9_.:-]{0,159}$/;

function assertDigest(value, name) {
  return assertString(value, name, { min: 64, max: 64, pattern: DIGEST });
}

function iso(value, name) {
  const raw = assertString(value, name, { min: 1, max: 64 });
  const date = new Date(raw);
  if (Number.isNaN(date.valueOf())) throw new ValidationError(`${name} must be an ISO timestamp`);
  return date.toISOString();
}

function canonicalObject(value, name) {
  return JSON.parse(canonicalJson(assertPlainObject(value, name)));
}

function stringSet(raw, name, { maxItems = 64, maxLength = 256 } = {}) {
  if (!Array.isArray(raw) || raw.length > maxItems) {
    throw new ValidationError(`${name} must contain at most ${maxItems} values`);
  }
  const values = raw.map((value, index) => assertString(value, `${name}[${index}]`, {
    min: 1,
    max: maxLength
  }));
  return [...new Set(values)].sort();
}

function normalizeBuild(raw) {
  const value = assertPlainObject(raw, 'current build');
  const base = {
    kernel_version: assertString(value.kernel_version, 'build.kernel_version', { min: 1, max: 64 }),
    source_digest: assertDigest(value.source_digest, 'build.source_digest')
  };
  const buildDigest = digestObject(base);
  if (value.build_digest !== undefined && assertDigest(value.build_digest, 'build.build_digest') !== buildDigest) {
    throw new ValidationError('current build digest is invalid');
  }
  return { ...base, build_digest: buildDigest };
}

function requireHypervisorIdentity(identity) {
  if (
    !identity?.keyId?.startsWith('hypervisor:')
    || typeof identity.signObject !== 'function'
    || !identity.publicKey
  ) {
    throw new ValidationError('resolved runtime admission requires Hypervisor signing identity');
  }
  return identity;
}

function verifyObservedResolverInstallation(installationEvidence, currentContext, now) {
  const evidence = assertPlainObject(installationEvidence, 'installation_evidence');
  const receipt = verifyIntentExecutorApplicationReceipt(evidence.receipt, {
    promotion_package: evidence.promotion_package,
    promotion_candidate: evidence.promotion_candidate,
    dossier: evidence.dossier,
    reviews: evidence.reviews,
    current_context: evidence.pre_install_context,
    pre_registry_bytes: evidence.pre_registry_bytes,
    post_registry_bytes: evidence.post_registry_bytes,
    public_key: evidence.application_verifier_public_key,
    now
  });
  if (
    receipt.application_verified !== true
    || receipt.mapping_installed_observed !== true
    || receipt.execution_authorized !== false
    || receipt.resolved_input_observed !== false
    || receipt.external_effect_prepared_observed !== false
  ) {
    throw new ValidationError('resolver installation receipt does not represent a bounded installation observation');
  }

  const currentRegistry = normalizeIntentExecutorRegistry(currentContext.executor_registry);
  if (currentRegistry.registry_digest !== receipt.post_registry.semantic_digest) {
    throw new ValidationError('current executor registry does not match the independently observed installed resolver registry');
  }
  const installed = currentRegistry.mappings.find(
    mapping => mapping.semantic_action === receipt.semantic_action
  );
  if (!installed || canonicalJson(installed) !== canonicalJson(receipt.mapping)) {
    throw new ValidationError('current executor registry does not contain the exact observed resolver mapping');
  }
  if (digestObject(currentContext.policy) !== receipt.authority_bindings.policy_digest) {
    throw new ValidationError('current policy differs from the policy bound to resolver installation review');
  }
  if (digestObject(currentContext.capabilities) !== receipt.authority_bindings.capability_registry_digest) {
    throw new ValidationError('current capability registry differs from resolver installation review');
  }
  const build = normalizeBuild(currentContext.build);
  if (build.build_digest !== receipt.authority_bindings.build_digest) {
    throw new ValidationError('current build differs from resolver installation review');
  }
  return { receipt, currentRegistry, installed, build };
}

function approvalBinding(rawApproval, {
  principalId,
  targetAction,
  requestDigest,
  now
}) {
  const approval = assertPlainObject(rawApproval, 'Grid approval');
  const approvalId = assertString(approval.approval_id, 'approval.approval_id', {
    min: 1,
    max: 160,
    pattern: ID
  });
  const requester = assertString(approval.requester, 'approval.requester', {
    min: 1,
    max: 160,
    pattern: ID
  });
  const approver = assertString(approval.approver, 'approval.approver', {
    min: 1,
    max: 160,
    pattern: ID
  });
  const action = assertString(approval.action, 'approval.action', {
    min: 1,
    max: 128,
    pattern: ACTION
  });
  const boundRequestDigest = assertDigest(approval.request_digest, 'approval.request_digest');
  const expiresAt = iso(approval.expires_at, 'approval.expires_at');
  if (
    approval.status !== 'active'
    || requester !== principalId
    || approver === principalId
    || action !== targetAction
    || boundRequestDigest !== requestDigest
    || new Date(expiresAt).valueOf() <= new Date(now).valueOf()
  ) {
    throw new AxiomError(
      'approval_invalid',
      'Independent approval does not match the exact resolved target request',
      403
    );
  }
  return {
    approval_id: approvalId,
    requester,
    approver,
    action,
    request_digest: boundRequestDigest,
    expires_at: expiresAt
  };
}

function buildRuntimeAdmissionBody({
  installationReceipt,
  eligibility,
  resolution,
  handoff,
  requestIdentity,
  effectDestination,
  policyResult,
  confirmations,
  approval,
  principal,
  now
}) {
  return {
    schema: INTENT_RESOLVED_RUNTIME_ADMISSION_SCHEMA,
    installation_receipt_id: installationReceipt.receipt_id,
    installation_receipt_digest: installationReceipt.receipt_digest,
    eligibility_digest: eligibility.eligibility_digest,
    remediation_proposal_id: eligibility.remediation_proposal_id,
    remediation_proposal_digest: eligibility.remediation_proposal_digest,
    remediation_state_digest: eligibility.remediation_state_digest,
    resolution_id: resolution.resolution_id,
    resolution_digest: resolution.resolution_digest,
    handoff_id: handoff.handoff_id,
    handoff_digest: handoff.handoff_digest,
    repository_plan_id: resolution.repository_plan_id,
    repository_plan_digest: resolution.repository_plan_digest,
    resolved_input_digest: resolution.resolved_input_digest,
    target_request: requestIdentity,
    target_request_digest: requestIdentity.digest,
    effect_destination: effectDestination,
    policy: {
      decision: policyResult.decision,
      risk: policyResult.risk,
      required_confirmations: policyResult.required_confirmations,
      required_confirmation_values: policyResult.required_confirmation_values,
      requires_independent_approval: policyResult.requires_independent_approval,
      timeout_ms: policyResult.timeout_ms,
      policy_digest: eligibility.policy_digest
    },
    confirmations,
    confirmations_digest: digestObject(confirmations),
    approval,
    principal: {
      id: principal.id,
      type: principal.type,
      ...(principal.schema === 'axiom-machine-principal.v1'
        ? { machine_authority_digest: principal.authority_digest }
        : {})
    },
    executor_registry_digest: eligibility.executor_registry_digest,
    capability_registry_digest: eligibility.capability_registry_digest,
    mapping_digest: eligibility.mapped_executor.mapping_digest,
    build_digest: eligibility.build_digest,
    target_gates_satisfied: true,
    prepared_effect_construction_authorized: true,
    operator_execution_authorized: false,
    grid_prepared_event_observed: false,
    external_effect_executed_observed: false,
    admitted_at: now,
    non_claim: 'This Hypervisor admission proves the current resolved target passed ordinary policy, confirmation, independent-approval, and machine ceilings where applicable. It authorizes construction of a prepared effect only; Grid preparation and operator execution remain separate required boundaries.'
  };
}

function signRuntimeAdmission(body, identity) {
  const digest = digestObject(body);
  const content = {
    ...body,
    admission_id: `intent-runtime-admission:${digest}`,
    admission_digest: digest
  };
  return { ...content, attestation: identity.signObject(content) };
}

export function verifyIntentResolvedRuntimeAdmission(raw, { hypervisorPublicKey }) {
  const value = assertPlainObject(raw, 'resolved runtime admission');
  if (value.schema !== INTENT_RESOLVED_RUNTIME_ADMISSION_SCHEMA) {
    throw new ValidationError(`runtime admission schema must be ${INTENT_RESOLVED_RUNTIME_ADMISSION_SCHEMA}`);
  }
  if (
    value.target_gates_satisfied !== true
    || value.prepared_effect_construction_authorized !== true
    || value.operator_execution_authorized !== false
    || value.grid_prepared_event_observed !== false
    || value.external_effect_executed_observed !== false
  ) {
    throw new ValidationError('resolved runtime admission authority flags are invalid');
  }
  const attestation = canonicalObject(value.attestation, 'runtime admission attestation');
  const {
    admission_id: ignoredId,
    admission_digest: ignoredDigest,
    attestation: ignoredAttestation,
    ...body
  } = value;
  const digest = digestObject(body);
  if (
    value.admission_digest !== digest
    || value.admission_id !== `intent-runtime-admission:${digest}`
  ) {
    throw new ValidationError('resolved runtime admission is not content-addressed');
  }
  const signed = {
    ...JSON.parse(canonicalJson(body)),
    admission_id: value.admission_id,
    admission_digest: value.admission_digest
  };
  if (
    !attestation.key_id?.startsWith('hypervisor:')
    || !hypervisorPublicKey
    || !verifyObjectSignature(signed, attestation, hypervisorPublicKey)
  ) {
    throw new ValidationError('resolved runtime admission signature is invalid');
  }
  return { ...signed, attestation };
}

function buildTargetEnvelope({ targetIntent, runtimeAdmission, confirmations, approval }) {
  const requestIdentity = intentRequestIdentity(targetIntent);
  const body = {
    schema: INTENT_RESOLVED_TARGET_ENVELOPE_SCHEMA,
    request: requestIdentity,
    runtime_admission_id: runtimeAdmission.admission_id,
    runtime_admission_digest: runtimeAdmission.admission_digest,
    confirmations,
    confirmations_digest: digestObject(confirmations),
    approval,
    execution_authorized: false,
    external_effect_prepared: false
  };
  const intentDigest = digestObject(body);
  return {
    ...body,
    intent_id: `intent_resolved_${requestIdentity.digest}`,
    intent_digest: intentDigest
  };
}

export async function prepareResolvedRepositoryDocsEffect({
  identity,
  installation_evidence,
  current_context,
  remediation,
  remediation_state,
  semantic_action,
  principal,
  resolution,
  handoff,
  operatorPublicKey,
  confirmations = [],
  approval_id,
  loadApproval,
  consumeApproval,
  purpose = 'intent.remediation',
  data_scopes = [],
  one_use_nonce,
  now = new Date().toISOString()
}) {
  const hypervisor = requireHypervisorIdentity(identity);
  const admittedAt = iso(now, 'now');
  const context = assertPlainObject(current_context, 'current_context');
  const normalizedPrincipal = canonicalObject(principal, 'principal');
  const installation = verifyObservedResolverInstallation(
    installation_evidence,
    context,
    admittedAt
  );
  const eligibility = evaluateIntentExecutionEligibility({
    remediation,
    remediation_state,
    semantic_action,
    executor_registry: context.executor_registry,
    policy: context.policy,
    capabilities: context.capabilities,
    principal: normalizedPrincipal
  });
  if (
    eligibility.decision !== 'unknown'
    || eligibility.reason !== 'executor_input_unresolved'
    || eligibility.execution_authorized !== false
  ) {
    throw new AxiomError(
      'resolver_eligibility_invalid',
      'Current resolver mapping is not in the expected unresolved-input eligibility state',
      409
    );
  }
  if (canonicalJson(eligibility.mapped_executor) !== canonicalJson(installation.installed)) {
    throw new ValidationError('current eligibility mapping does not match the independently observed installed mapping');
  }

  const verifiedResolution = verifyIntentExecutorInputResolution(resolution, {
    eligibility,
    hypervisorPublicKey: hypervisor.publicKey,
    operatorPublicKey,
    now: admittedAt
  });
  const verifiedHandoff = verifyResolvedIntentExecutionHandoff(handoff, {
    resolution: verifiedResolution,
    eligibility,
    hypervisorPublicKey: hypervisor.publicKey,
    operatorPublicKey,
    now: admittedAt
  });

  const normalizedConfirmations = stringSet(confirmations, 'confirmations', {
    maxItems: 64,
    maxLength: 256
  });
  const normalizedScopes = stringSet(data_scopes, 'data_scopes', {
    maxItems: 64,
    maxLength: 160
  });
  const normalizedPurpose = assertString(purpose, 'purpose', {
    min: 1,
    max: 160,
    pattern: PURPOSE
  });
  const targetAction = verifiedHandoff.target_action;
  const targetIntent = {
    principal: normalizedPrincipal,
    action: targetAction,
    input: verifiedHandoff.resolved_input,
    purpose: normalizedPurpose,
    data_scopes: normalizedScopes,
    confirmations: normalizedConfirmations,
    approval_ids: approval_id ? [approval_id] : []
  };
  const policyResult = new PolicyEngine(context.policy).evaluate(targetIntent, normalizedPrincipal);
  if (policyResult.decision === 'pending') {
    throw new AxiomError(
      'confirmation_required',
      'Resolved target action requires explicit confirmation',
      409,
      {
        required_confirmations: policyResult.required_confirmations,
        required_confirmation_values: policyResult.required_confirmation_values
      }
    );
  }
  if (policyResult.decision !== 'allow') {
    throw new AxiomError('policy_denied', `Resolved target denied by policy: ${policyResult.reason}`, 403);
  }
  if (
    policyResult.tool !== verifiedHandoff.tool
    || policyResult.tool !== installation.installed.tool
  ) {
    throw new ValidationError('resolved target policy tool differs from the reviewed installed mapping');
  }
  const effectDestination = effectDestinationForTool(policyResult.tool);
  if (effectDestination !== installation.receipt.effect_destination) {
    throw new ValidationError('resolved target effect destination differs from reviewed installation evidence');
  }

  if (normalizedPrincipal.schema === 'axiom-machine-principal.v1') {
    const machine = evaluateMachineIntent(normalizedPrincipal, {
      action: targetAction,
      purpose: normalizedPurpose,
      destination: effectDestination,
      request_bytes: Buffer.byteLength(canonicalJson(verifiedHandoff.resolved_input), 'utf8'),
      requested_execution_ms: policyResult.timeout_ms
    });
    if (!machine.allow) {
      throw new AxiomError(machine.code, machine.reason, 403);
    }
  }

  const requestIdentity = intentRequestIdentity(targetIntent);
  let approval = null;
  if (policyResult.requires_independent_approval) {
    if (!approval_id || typeof loadApproval !== 'function' || typeof consumeApproval !== 'function') {
      throw new AxiomError(
        'independent_approval_required',
        'Resolved target action requires one authenticated independent Grid approval',
        409
      );
    }
    const loaded = await loadApproval(approval_id);
    approval = approvalBinding(loaded, {
      principalId: normalizedPrincipal.id,
      targetAction,
      requestDigest: requestIdentity.digest,
      now: admittedAt
    });
  } else if (approval_id !== undefined && approval_id !== null) {
    throw new ValidationError('approval_id was supplied for a target policy that does not require independent approval');
  }

  const admissionBody = buildRuntimeAdmissionBody({
    installationReceipt: installation.receipt,
    eligibility,
    resolution: verifiedResolution,
    handoff: verifiedHandoff,
    requestIdentity,
    effectDestination,
    policyResult,
    confirmations: normalizedConfirmations,
    approval,
    principal: normalizedPrincipal,
    now: admittedAt
  });
  const runtimeAdmission = signRuntimeAdmission(admissionBody, hypervisor);
  const targetEnvelope = buildTargetEnvelope({
    targetIntent,
    runtimeAdmission,
    confirmations: normalizedConfirmations,
    approval
  });
  const prepared = buildPreparedRepositoryDocsEffect({
    identity: hypervisor,
    plan: verifiedHandoff.resolved_input.repository_plan,
    operatorPublicKey,
    source_bindings: {
      intent_id: targetEnvelope.intent_id,
      intent_digest: targetEnvelope.intent_digest,
      handoff_digest: verifiedHandoff.handoff_digest,
      remediation_proposal_id: eligibility.remediation_proposal_id,
      remediation_proposal_digest: eligibility.remediation_proposal_digest,
      principal: normalizedPrincipal.id,
      machine_authority_digest: normalizedPrincipal.schema === 'axiom-machine-principal.v1'
        ? normalizedPrincipal.authority_digest
        : null
    },
    authority_bindings: {
      policy_digest: eligibility.policy_digest,
      capability_registry_digest: eligibility.capability_registry_digest,
      executor_registry_digest: eligibility.executor_registry_digest,
      mapping_digest: eligibility.mapped_executor.mapping_digest,
      build_digest: eligibility.build_digest
    },
    one_use_nonce,
    prepared_at: admittedAt,
    expires_at: verifiedHandoff.expires_at
  });

  if (approval) {
    await consumeApproval(approval.approval_id, targetEnvelope.intent_id);
  }

  return {
    schema: 'axiom-intent-resolved-preparation-result.v1',
    runtime_admission: runtimeAdmission,
    target_envelope: targetEnvelope,
    prepared_effect: prepared,
    approval_consumed: Boolean(approval),
    operator_execution_authorized: false,
    grid_prepared_event_observed: false,
    external_effect_executed_observed: false,
    non_claim: 'The resolved target has passed preparation-time authority gates and produced a Hypervisor-signed prepared effect. Operator execution still requires the ordinary Grid prepared-event and private operator verification path.'
  };
}
