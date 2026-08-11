import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { sha256 } from '../src/lib/canonical.mjs';
import { MeshIdentity } from '../src/lib/identity.mjs';
import { intentRequestDigest } from '../src/lib/intent-binding.mjs';
import { evaluateIntentExecutionEligibility } from '../src/lib/intent-execution-eligibility.mjs';
import {
  buildIntentExecutorInputResolution,
  buildResolvedIntentExecutionHandoff,
  REPOSITORY_DOCS_INPUT_RESOLVER_ID
} from '../src/lib/intent-executor-input-resolution.mjs';
import {
  buildResolvedIntentPreparedRepositoryDocsEffect,
  buildResolvedIntentTargetAuthorization,
  verifyResolvedIntentPreparedRepositoryDocsEffect,
  verifyResolvedIntentTargetAuthorization
} from '../src/lib/intent-resolver-prepared-effect.mjs';
import { buildIntentRemediationProposal } from '../src/lib/intent-remediation.mjs';
import {
  buildRepositoryDocsEffectPlan,
  REPOSITORY_DOCS_EFFECT_POLICY,
  REPOSITORY_DOCS_EFFECT_POLICY_DIGEST
} from '../src/lib/repository-docs-effect.mjs';

const productionPolicy = JSON.parse(
  await readFile(new URL('../config/policy.json', import.meta.url), 'utf8')
);
const productionCapabilities = JSON.parse(
  await readFile(new URL('../config/capabilities.json', import.meta.url), 'utf8')
);
const productionExecutors = JSON.parse(
  await readFile(new URL('../config/intent-remediation-executors.json', import.meta.url), 'utf8')
);

const NOW = '2026-08-11T02:30:00.000Z';
const PREPARED_AT = '2026-08-11T02:31:00.000Z';
const BASE_SHA = 'a'.repeat(40);
const OLD_BLOB = 'b'.repeat(40);
const OLD_CONTENT = '# old\n';
const NEW_CONTENT = '# current\n';

function identity(service) {
  const pair = generateKeyPairSync('ed25519');
  return new MeshIdentity(
    service,
    pair.privateKey.export({ type: 'pkcs8', format: 'pem' }),
    pair.publicKey.export({ type: 'spki', format: 'pem' })
  );
}

function governanceState() {
  return {
    schema: 'axiom-intent-governance-state.v1',
    contract_id: 'intent-resolver-prepared-effect-test',
    activation_digest: sha256('prepared-activation'),
    contract_digest: sha256('prepared-contract'),
    graph_digest: sha256('prepared-graph'),
    build: { build_digest: sha256('prepared-build') },
    assessment: {
      source_assessment_digest: sha256('prepared-assessment'),
      evaluated_at: '2026-08-11T02:20:00.000Z'
    },
    reconciliation: {
      state: 'attention_required',
      reconciliation_digest: sha256('prepared-reconciliation'),
      violations: ['OBJ-DOCS-CURRENT'],
      unknowns: [],
      proposed_actions: [{
        action: REPOSITORY_DOCS_EFFECT_POLICY.semantic_action,
        decision: 'approval_required',
        reason: 'Current documentation requires a bounded pull request.',
        triggered_by: ['OBJ-DOCS-CURRENT']
      }]
    },
    execution_authorized: false
  };
}

function remediation() {
  return buildIntentRemediationProposal(governanceState(), {
    creator: 'intent-operator',
    created_at: '2026-08-11T02:20:01.000Z',
    expires_at: '2026-08-12T02:20:01.000Z'
  });
}

function remediationState(proposal) {
  return {
    schema: 'axiom-intent-remediation-governance-state.v1',
    remediation_proposal_id: proposal.remediation_proposal_id,
    remediation_proposal_digest: proposal.remediation_proposal_digest,
    basis_digest: proposal.basis_digest,
    contract_id: proposal.contract_id,
    activation_digest: proposal.activation_digest,
    source_assessment_digest: proposal.source_assessment_digest,
    source_reconciliation_digest: proposal.source_reconciliation_digest,
    reconciliation_state: proposal.reconciliation_state,
    action_counts: {
      autonomous: proposal.actions.filter(item => item.decision === 'autonomous').length,
      approval_required: proposal.actions.filter(item => item.decision === 'approval_required').length,
      deny: proposal.actions.filter(item => item.decision === 'deny').length
    },
    governance_status: 'active',
    current: true,
    current_reason: 'matches_current_authenticated_intent_state',
    execution_authorized: false
  };
}

function resolverMapping() {
  return {
    semantic_action: REPOSITORY_DOCS_EFFECT_POLICY.semantic_action,
    target_action: REPOSITORY_DOCS_EFFECT_POLICY.target_action,
    capability_id: REPOSITORY_DOCS_EFFECT_POLICY.capability_id,
    tool: REPOSITORY_DOCS_EFFECT_POLICY.tool,
    fixed_input: null,
    constraints: {
      input_resolver: {
        id: REPOSITORY_DOCS_INPUT_RESOLVER_ID,
        repository: REPOSITORY_DOCS_EFFECT_POLICY.repository,
        base_branch: REPOSITORY_DOCS_EFFECT_POLICY.base_branch,
        path_policy_digest: REPOSITORY_DOCS_EFFECT_POLICY_DIGEST,
        max_plan_lifetime_ms: 5 * 60 * 1000
      }
    }
  };
}

function observedRegistry() {
  return {
    schema: 'axiom-intent-remediation-executor-registry.v1',
    kernel_version: '0.12.0-dev.3',
    mappings: [resolverMapping()]
  };
}

function resolverPolicy() {
  const policy = structuredClone(productionPolicy);
  policy.actions[REPOSITORY_DOCS_EFFECT_POLICY.target_action] = {
    decision: 'allow',
    risk: 'high',
    required_scopes: ['repository:docs:write'],
    required_confirmations: 1,
    required_confirmation_values: ['confirm:repository.docs.pull-request.create'],
    requires_independent_approval: true,
    tool: REPOSITORY_DOCS_EFFECT_POLICY.tool,
    constraints: {
      repository: REPOSITORY_DOCS_EFFECT_POLICY.repository,
      docs_only: true
    },
    timeout_ms: 15_000
  };
  return policy;
}

function resolverCapabilities() {
  const capabilities = structuredClone(productionCapabilities);
  const existing = capabilities.capabilities.find(
    item => item.id === REPOSITORY_DOCS_EFFECT_POLICY.capability_id
  );
  if (existing) existing.status = 'implemented';
  else capabilities.capabilities.push({
    id: REPOSITORY_DOCS_EFFECT_POLICY.capability_id,
    family: 'repository',
    status: 'implemented',
    summary: 'Test-only repository docs resolved-effect capability.'
  });
  return capabilities;
}

function principal() {
  return {
    id: 'intent-operator',
    type: 'human',
    roles: ['administrator'],
    scopes: ['repository:docs:write']
  };
}

function fixture() {
  const operator = identity('repository-operator');
  const hypervisor = identity('hypervisor');
  const proposal = remediation();
  const policy = resolverPolicy();
  const capabilities = resolverCapabilities();
  const requester = principal();
  const eligibility = evaluateIntentExecutionEligibility({
    remediation: proposal,
    remediation_state: remediationState(proposal),
    semantic_action: REPOSITORY_DOCS_EFFECT_POLICY.semantic_action,
    executor_registry: observedRegistry(),
    policy,
    capabilities,
    principal: requester
  });
  const repositoryPlan = buildRepositoryDocsEffectPlan({
    identity: operator,
    base_sha: BASE_SHA,
    changes: [{
      path: 'docs/rebuild/STATUS.md',
      operation: 'update',
      old_blob_sha: OLD_BLOB,
      old_content_sha256: sha256(OLD_CONTENT),
      new_content: NEW_CONTENT
    }],
    planned_at: NOW,
    expires_at: '2026-08-11T02:35:00.000Z'
  });
  const resolution = buildIntentExecutorInputResolution({
    identity: hypervisor,
    eligibility,
    repository_plan: repositoryPlan,
    operatorPublicKey: operator.publicKey,
    now: NOW
  });
  const handoff = buildResolvedIntentExecutionHandoff({
    identity: hypervisor,
    resolution,
    eligibility,
    operatorPublicKey: operator.publicKey,
    now: NOW
  });
  return {
    operator,
    hypervisor,
    proposal,
    policy,
    capabilities,
    requester,
    eligibility,
    repositoryPlan,
    resolution,
    handoff
  };
}

function targetRequest(fixture, { confirmation = true } = {}) {
  return {
    principal: fixture.requester,
    action: REPOSITORY_DOCS_EFFECT_POLICY.target_action,
    input: fixture.handoff.resolved_input,
    purpose: 'intent-remediation',
    data_scopes: [],
    confirmations: confirmation
      ? ['confirm:repository.docs.pull-request.create']
      : [],
    approval_ids: ['approval-resolver-target-0001']
  };
}

function approval(request, overrides = {}) {
  return {
    approval_id: 'approval-resolver-target-0001',
    approver: 'independent-reviewer',
    requester: 'intent-operator',
    action: REPOSITORY_DOCS_EFFECT_POLICY.target_action,
    request_digest: intentRequestDigest(request),
    expires_at: '2026-08-11T02:40:00.000Z',
    status: 'active',
    ...overrides
  };
}

test('production registry and policy remain unable to reach repository resolver execution', () => {
  assert.equal(productionExecutors.mappings.length, 0);
  assert.equal(productionPolicy.actions[REPOSITORY_DOCS_EFFECT_POLICY.target_action], undefined);
});

test('observed resolver mapping recomputes fresh unresolved eligibility before plan resolution', () => {
  const current = fixture();
  assert.equal(current.eligibility.decision, 'unknown');
  assert.equal(current.eligibility.reason, 'executor_input_unresolved');
  assert.equal(current.eligibility.execution_authorized, false);
  assert.equal(current.eligibility.mapped_executor.fixed_input_digest, null);
  assert.equal(
    current.eligibility.mapped_executor.registry_constraints.input_resolver.id,
    REPOSITORY_DOCS_INPUT_RESOLVER_ID
  );
  assert.equal(current.handoff.resolution_digest, current.resolution.resolution_digest);
  assert.equal(current.handoff.repository_plan_digest, current.repositoryPlan.plan_digest);
  assert.equal(current.handoff.execution_authorized, false);
  assert.equal(current.handoff.external_effect_prepared, false);
});

test('missing confirmation or independent approval blocks target authorization before effect preparation', () => {
  const current = fixture();
  const unconfirmed = targetRequest(current, { confirmation: false });
  assert.throws(
    () => buildResolvedIntentTargetAuthorization({
      identity: current.hypervisor,
      handoff: current.handoff,
      resolution: current.resolution,
      eligibility: current.eligibility,
      operatorPublicKey: current.operator.publicKey,
      policy: current.policy,
      principal: current.requester,
      request: unconfirmed,
      approval: approval(unconfirmed),
      now: NOW
    }),
    /confirmation_required/
  );

  const confirmed = targetRequest(current);
  assert.throws(
    () => buildResolvedIntentTargetAuthorization({
      identity: current.hypervisor,
      handoff: current.handoff,
      resolution: current.resolution,
      eligibility: current.eligibility,
      operatorPublicKey: current.operator.publicKey,
      policy: current.policy,
      principal: current.requester,
      request: confirmed,
      approval: null,
      now: NOW
    }),
    /independent approval/
  );

  assert.throws(
    () => buildResolvedIntentTargetAuthorization({
      identity: current.hypervisor,
      handoff: current.handoff,
      resolution: current.resolution,
      eligibility: current.eligibility,
      operatorPublicKey: current.operator.publicKey,
      policy: current.policy,
      principal: current.requester,
      request: confirmed,
      approval: approval(confirmed, { approver: 'intent-operator' }),
      now: NOW
    }),
    /different principal/
  );
});

test('exact confirmations and independent approval produce a signed non-authorizing target attestation', () => {
  const current = fixture();
  const request = targetRequest(current);
  const activeApproval = approval(request);
  const authorization = buildResolvedIntentTargetAuthorization({
    identity: current.hypervisor,
    handoff: current.handoff,
    resolution: current.resolution,
    eligibility: current.eligibility,
    operatorPublicKey: current.operator.publicKey,
    policy: current.policy,
    principal: current.requester,
    request,
    approval: activeApproval,
    now: NOW
  });

  const verified = verifyResolvedIntentTargetAuthorization(authorization, {
    handoff: current.handoff,
    resolution: current.resolution,
    eligibility: current.eligibility,
    hypervisorPublicKey: current.hypervisor.publicKey,
    operatorPublicKey: current.operator.publicKey,
    policy: current.policy,
    principal: current.requester,
    request,
    approval: activeApproval,
    now: NOW
  });
  assert.equal(verified.target_request_digest, intentRequestDigest(request));
  assert.equal(verified.confirmation_gate_satisfied, true);
  assert.equal(verified.independent_approval_gate_satisfied, true);
  assert.equal(verified.independent_approval.approver, 'independent-reviewer');
  assert.equal(verified.execution_authorized, false);
  assert.equal(verified.external_effect_prepared, false);
  assert.equal(verified.external_effect_executed, false);
});

test('prepared repository effect can be constructed only behind the exact resolved target authorization', () => {
  const current = fixture();
  const request = targetRequest(current);
  const activeApproval = approval(request);
  const authorization = buildResolvedIntentTargetAuthorization({
    identity: current.hypervisor,
    handoff: current.handoff,
    resolution: current.resolution,
    eligibility: current.eligibility,
    operatorPublicKey: current.operator.publicKey,
    policy: current.policy,
    principal: current.requester,
    request,
    approval: activeApproval,
    now: NOW
  });
  const binding = buildResolvedIntentPreparedRepositoryDocsEffect({
    identity: current.hypervisor,
    authorization,
    handoff: current.handoff,
    resolution: current.resolution,
    eligibility: current.eligibility,
    operatorPublicKey: current.operator.publicKey,
    policy: current.policy,
    principal: current.requester,
    request,
    approval: activeApproval,
    intent_id: 'intent-resolver-target-0001',
    one_use_nonce: 'resolver_target_nonce_00000001',
    prepared_at: PREPARED_AT,
    expires_at: '2026-08-11T02:34:00.000Z'
  });

  const verified = verifyResolvedIntentPreparedRepositoryDocsEffect(binding, {
    authorization,
    handoff: current.handoff,
    resolution: current.resolution,
    eligibility: current.eligibility,
    hypervisorPublicKey: current.hypervisor.publicKey,
    operatorPublicKey: current.operator.publicKey,
    policy: current.policy,
    principal: current.requester,
    request,
    approval: activeApproval,
    now: PREPARED_AT
  });

  assert.equal(verified.prepared_effect.plan.plan_digest, current.repositoryPlan.plan_digest);
  assert.equal(verified.resolution_digest, current.resolution.resolution_digest);
  assert.equal(verified.handoff_digest, current.handoff.handoff_digest);
  assert.equal(verified.target_authorization_digest, authorization.authorization_digest);
  assert.equal(verified.resolved_input_digest, current.handoff.resolved_input_digest);
  assert.equal(
    verified.prepared_effect.source_bindings.handoff_digest,
    current.handoff.handoff_digest
  );
  assert.equal(
    verified.prepared_effect.authority_bindings.mapping_digest,
    current.handoff.mapping_digest
  );
  assert.equal(verified.execution_authorized, false);
  assert.equal(verified.external_effect_prepared, true);
  assert.equal(verified.external_effect_executed, false);
});

test('approval, request, handoff, or resolution substitution cannot reuse a prepared binding', () => {
  const current = fixture();
  const request = targetRequest(current);
  const activeApproval = approval(request);
  const authorization = buildResolvedIntentTargetAuthorization({
    identity: current.hypervisor,
    handoff: current.handoff,
    resolution: current.resolution,
    eligibility: current.eligibility,
    operatorPublicKey: current.operator.publicKey,
    policy: current.policy,
    principal: current.requester,
    request,
    approval: activeApproval,
    now: NOW
  });
  const binding = buildResolvedIntentPreparedRepositoryDocsEffect({
    identity: current.hypervisor,
    authorization,
    handoff: current.handoff,
    resolution: current.resolution,
    eligibility: current.eligibility,
    operatorPublicKey: current.operator.publicKey,
    policy: current.policy,
    principal: current.requester,
    request,
    approval: activeApproval,
    intent_id: 'intent-resolver-target-0002',
    one_use_nonce: 'resolver_target_nonce_00000002',
    prepared_at: PREPARED_AT,
    expires_at: '2026-08-11T02:34:00.000Z'
  });

  const changedRequest = structuredClone(request);
  changedRequest.purpose = 'different-purpose';
  assert.throws(
    () => verifyResolvedIntentPreparedRepositoryDocsEffect(binding, {
      authorization,
      handoff: current.handoff,
      resolution: current.resolution,
      eligibility: current.eligibility,
      hypervisorPublicKey: current.hypervisor.publicKey,
      operatorPublicKey: current.operator.publicKey,
      policy: current.policy,
      principal: current.requester,
      request: changedRequest,
      approval: activeApproval,
      now: PREPARED_AT
    }),
    /approval|authorization|request/
  );

  const changedApproval = approval(request, { request_digest: sha256('wrong-request') });
  assert.throws(
    () => verifyResolvedIntentPreparedRepositoryDocsEffect(binding, {
      authorization,
      handoff: current.handoff,
      resolution: current.resolution,
      eligibility: current.eligibility,
      hypervisorPublicKey: current.hypervisor.publicKey,
      operatorPublicKey: current.operator.publicKey,
      policy: current.policy,
      principal: current.requester,
      request,
      approval: changedApproval,
      now: PREPARED_AT
    }),
    /approval|authorization|request/
  );

  const forged = structuredClone(binding);
  forged.resolution_digest = sha256('different-resolution');
  assert.throws(
    () => verifyResolvedIntentPreparedRepositoryDocsEffect(forged, {
      authorization,
      handoff: current.handoff,
      resolution: current.resolution,
      eligibility: current.eligibility,
      hypervisorPublicKey: current.hypervisor.publicKey,
      operatorPublicKey: current.operator.publicKey,
      policy: current.policy,
      principal: current.requester,
      request,
      approval: activeApproval,
      now: PREPARED_AT
    }),
    /content-addressed|signature|does not match/
  );
});
