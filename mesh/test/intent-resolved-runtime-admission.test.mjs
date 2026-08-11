import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { digestObject, sha256 } from '../src/lib/canonical.mjs';
import { intentRequestDigest } from '../src/lib/intent-binding.mjs';
import { MeshIdentity } from '../src/lib/identity.mjs';
import * as admission from '../src/lib/intent-executor-admission-current.mjs';
import * as packages from '../src/lib/intent-executor-promotion-package-current.mjs';
import * as receipts from '../src/lib/intent-executor-application-receipt-current.mjs';
import {
  evaluateIntentExecutionEligibility
} from '../src/lib/intent-execution-eligibility.mjs';
import {
  buildIntentExecutorInputResolution,
  buildResolvedIntentExecutionHandoff,
  REPOSITORY_DOCS_INPUT_RESOLVER_ID
} from '../src/lib/intent-executor-input-resolution.mjs';
import {
  buildIntentRemediationProposal
} from '../src/lib/intent-remediation.mjs';
import {
  REPOSITORY_DOCS_EFFECT_POLICY,
  REPOSITORY_DOCS_EFFECT_POLICY_DIGEST,
  buildRepositoryDocsEffectPlan,
  verifyPreparedRepositoryDocsEffect
} from '../src/lib/repository-docs-effect.mjs';
import {
  prepareResolvedRepositoryDocsEffect,
  verifyIntentResolvedRuntimeAdmission
} from '../src/lib/intent-resolved-runtime-admission.mjs';

const productionPolicy = JSON.parse(
  await readFile(new URL('../config/policy.json', import.meta.url), 'utf8')
);
const productionCapabilities = JSON.parse(
  await readFile(new URL('../config/capabilities.json', import.meta.url), 'utf8')
);
const productionRegistryBytes = await readFile(
  new URL('../config/intent-remediation-executors.json', import.meta.url),
  'utf8'
);
const productionRegistry = JSON.parse(productionRegistryBytes);

const NOW = '2026-08-11T03:00:00.000Z';
const PLAN_EXPIRES = '2026-08-11T03:05:00.000Z';
const DOSSIER_EXPIRES = '2026-08-12T03:00:00.000Z';
const REVIEW_EXPIRES = '2026-08-11T15:00:00.000Z';
const APPROVAL_EXPIRES = '2026-08-11T03:10:00.000Z';
const CONFIRMATION = 'confirm:repository.docs.pull-request.create';
const BASE_SHA = 'a'.repeat(40);
const OLD_BLOB = 'b'.repeat(40);
const OLD_CONTENT = '# old\n';
const NEW_CONTENT = '# new\n';

function identity(service) {
  const pair = generateKeyPairSync('ed25519');
  return new MeshIdentity(
    service,
    pair.privateKey.export({ type: 'pkcs8', format: 'pem' }),
    pair.publicKey.export({ type: 'spki', format: 'pem' })
  );
}

function build() {
  return {
    kernel_version: '0.12.0-dev.3',
    source_digest: sha256('resolved-runtime-admission-source')
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

function resolverPolicy() {
  const policy = structuredClone(productionPolicy);
  policy.actions[REPOSITORY_DOCS_EFFECT_POLICY.target_action] = {
    decision: 'allow',
    risk: 'high',
    required_scopes: ['repository:docs:write'],
    required_confirmations: 1,
    required_confirmation_values: [CONFIRMATION],
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
  const item = capabilities.capabilities.find(
    capability => capability.id === REPOSITORY_DOCS_EFFECT_POLICY.capability_id
  );
  if (item) item.status = 'implemented';
  else capabilities.capabilities.push({
    id: REPOSITORY_DOCS_EFFECT_POLICY.capability_id,
    family: 'repository',
    status: 'implemented',
    summary: 'Test-only resolved runtime repository-docs capability.'
  });
  return capabilities;
}

function preContext() {
  return {
    executor_registry: productionRegistry,
    policy: resolverPolicy(),
    capabilities: resolverCapabilities(),
    build: build()
  };
}

function evidence() {
  return admission.requiredIntentExecutorAdmissionEvidenceAssertions({ mode: 'input_resolver' }).map(assertion => ({
    assertion,
    result: 'pass',
    artifact_digest: sha256(`runtime-admission-evidence:${assertion}`),
    artifact_type: 'test-evidence'
  }));
}

function governanceState() {
  return {
    schema: 'axiom-intent-governance-state.v1',
    contract_id: 'intent-runtime-repository-docs',
    activation_digest: sha256('activation'),
    contract_digest: sha256('contract'),
    graph_digest: sha256('graph'),
    build: { build_digest: sha256('intent-contract-build') },
    assessment: {
      source_assessment_digest: sha256('assessment'),
      evaluated_at: '2026-08-11T02:50:00.000Z'
    },
    reconciliation: {
      state: 'attention_required',
      reconciliation_digest: sha256('reconciliation'),
      violations: ['OBJ-DOCS-CURRENT'],
      unknowns: [],
      proposed_actions: [{
        action: REPOSITORY_DOCS_EFFECT_POLICY.semantic_action,
        decision: 'approval_required',
        reason: 'Documentation requires a bounded reviewed pull request.',
        triggered_by: ['OBJ-DOCS-CURRENT']
      }]
    },
    execution_authorized: false
  };
}

function remediationFixture() {
  return buildIntentRemediationProposal(governanceState(), {
    creator: 'intent-operator',
    created_at: '2026-08-11T02:50:01.000Z',
    expires_at: '2026-08-12T02:50:01.000Z'
  });
}

function remediationState(remediation) {
  return {
    schema: 'axiom-intent-remediation-governance-state.v1',
    remediation_proposal_id: remediation.remediation_proposal_id,
    remediation_proposal_digest: remediation.remediation_proposal_digest,
    basis_digest: remediation.basis_digest,
    contract_id: remediation.contract_id,
    activation_digest: remediation.activation_digest,
    source_assessment_digest: remediation.source_assessment_digest,
    source_reconciliation_digest: remediation.source_reconciliation_digest,
    reconciliation_state: remediation.reconciliation_state,
    action_counts: {
      autonomous: remediation.actions.filter(item => item.decision === 'autonomous').length,
      approval_required: remediation.actions.filter(item => item.decision === 'approval_required').length,
      deny: remediation.actions.filter(item => item.decision === 'deny').length
    },
    governance_status: 'active',
    current: true,
    current_reason: 'matches_current_authenticated_intent_state',
    execution_authorized: false
  };
}

function repositoryPlan(operator) {
  return buildRepositoryDocsEffectPlan({
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
    expires_at: PLAN_EXPIRES
  });
}

function humanPrincipal() {
  return {
    id: 'intent-operator',
    type: 'human',
    roles: ['operator'],
    scopes: ['repository:docs:write']
  };
}

function machinePrincipal(destinations = ['github:Zoverions/AXIOM-MESH']) {
  const principal = {
    schema: 'axiom-machine-principal.v1',
    id: 'agent.runtime-docs',
    type: 'agent',
    sponsor: 'human-sponsor',
    roles: ['operator'],
    scopes: ['repository:docs:write'],
    lifetime: 'session',
    expires_at: '2026-08-11T04:00:00.000Z',
    runtime: {
      id: 'runtime.docs-agent',
      kind: 'local-process',
      software_digest: 'c'.repeat(64)
    },
    constraints: {
      actions: [REPOSITORY_DOCS_EFFECT_POLICY.target_action],
      purposes: ['intent.remediation'],
      destinations,
      budgets: {
        max_requests_per_minute: 60,
        max_concurrent_requests: 1,
        max_execution_ms: 30_000,
        max_request_bytes: 262_144,
        max_response_bytes: 262_144
      },
      delegation: { allowed: false, max_depth: 0 }
    }
  };
  const material = {
    sponsor: principal.sponsor,
    roles: principal.roles,
    scopes: principal.scopes,
    lifetime: principal.lifetime,
    expires_at: principal.expires_at,
    runtime: principal.runtime,
    constraints: principal.constraints
  };
  principal.authority_digest = digestObject(material);
  return principal;
}

function reviewSet(dossier) {
  const implementation = identity('runtime-implementation-review');
  const security = identity('runtime-security-review');
  return {
    implementation,
    security,
    reviews: [
      {
        review: admission.buildIntentExecutorReviewAttestation(dossier, {
          identity: implementation,
          review_role: 'implementation_conformance',
          reviewed_at: '2026-08-11T02:55:00.000Z',
          expires_at: REVIEW_EXPIRES
        }),
        public_key: implementation.publicKey
      },
      {
        review: admission.buildIntentExecutorReviewAttestation(dossier, {
          identity: security,
          review_role: 'security_authority',
          reviewed_at: '2026-08-11T02:55:00.000Z',
          expires_at: REVIEW_EXPIRES
        }),
        public_key: security.publicKey
      }
    ]
  };
}

function installationFixture() {
  const context = preContext();
  const dossier = admission.buildIntentExecutorAdmissionDossier({
    candidate_mapping: resolverMapping(),
    current_context: context,
    evidence: evidence(),
    producer: 'runtime-dossier-producer',
    created_at: '2026-08-11T02:54:00.000Z',
    expires_at: DOSSIER_EXPIRES
  });
  const reviewData = reviewSet(dossier);
  const promotion = admission.buildIntentExecutorPromotionCandidate({
    dossier,
    reviews: reviewData.reviews,
    current_context: context,
    now: '2026-08-11T02:56:00.000Z'
  });
  const pkg = packages.buildIntentExecutorPromotionPackage({
    promotion_candidate: promotion,
    dossier,
    reviews: reviewData.reviews,
    current_context: context,
    current_registry_bytes: productionRegistryBytes,
    now: '2026-08-11T02:56:00.000Z'
  });
  const applicationVerifier = identity('runtime-application-verifier');
  const receipt = receipts.buildIntentExecutorApplicationReceipt({
    promotion_package: pkg,
    promotion_candidate: promotion,
    dossier,
    reviews: reviewData.reviews,
    current_context: context,
    pre_registry_bytes: productionRegistryBytes,
    post_registry_bytes: pkg.proposed_registry.utf8,
    identity: applicationVerifier,
    verified_at: '2026-08-11T02:57:00.000Z',
    source_revision: 'test-resolved-runtime-admission',
    release_context: { channel: 'test' },
    now: '2026-08-11T02:57:00.000Z'
  });
  const postContext = {
    executor_registry: JSON.parse(pkg.proposed_registry.utf8),
    policy: context.policy,
    capabilities: context.capabilities,
    build: context.build
  };
  return {
    preContext: context,
    postContext,
    dossier,
    reviews: reviewData.reviews,
    promotion,
    pkg,
    applicationVerifier,
    receipt,
    installationEvidence: {
      receipt,
      promotion_package: pkg,
      promotion_candidate: promotion,
      dossier,
      reviews: reviewData.reviews,
      pre_install_context: context,
      pre_registry_bytes: productionRegistryBytes,
      post_registry_bytes: pkg.proposed_registry.utf8,
      application_verifier_public_key: applicationVerifier.publicKey
    }
  };
}

function resolutionFixture({ principal = humanPrincipal() } = {}) {
  const installation = installationFixture();
  const remediation = remediationFixture();
  const state = remediationState(remediation);
  const operator = identity('repository-operator');
  const hypervisor = identity('hypervisor');
  const eligibility = evaluateIntentExecutionEligibility({
    remediation,
    remediation_state: state,
    semantic_action: REPOSITORY_DOCS_EFFECT_POLICY.semantic_action,
    executor_registry: installation.postContext.executor_registry,
    policy: installation.postContext.policy,
    capabilities: installation.postContext.capabilities,
    principal
  });
  assert.equal(eligibility.decision, 'unknown');
  assert.equal(eligibility.reason, 'executor_input_unresolved');
  const plan = repositoryPlan(operator);
  const resolution = buildIntentExecutorInputResolution({
    identity: hypervisor,
    eligibility,
    repository_plan: plan,
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
    ...installation,
    remediation,
    state,
    operator,
    hypervisor,
    eligibility,
    plan,
    resolution,
    handoff,
    principal
  };
}

function approvalFor(fixture, overrides = {}) {
  const target = {
    principal: fixture.principal,
    action: fixture.handoff.target_action,
    input: fixture.handoff.resolved_input,
    purpose: 'intent.remediation',
    data_scopes: [],
    confirmations: [CONFIRMATION],
    approval_ids: ['approval_runtime_docs_0001']
  };
  return {
    approval_id: 'approval_runtime_docs_0001',
    requester: fixture.principal.id,
    approver: 'independent-approver',
    action: fixture.handoff.target_action,
    request_digest: intentRequestDigest(target),
    status: 'active',
    expires_at: APPROVAL_EXPIRES,
    ...overrides
  };
}

async function prepare(fixture, {
  confirmations = [CONFIRMATION],
  approval = approvalFor(fixture),
  approvalId = 'approval_runtime_docs_0001',
  currentContext = fixture.postContext,
  consume = async () => {}
} = {}) {
  return prepareResolvedRepositoryDocsEffect({
    identity: fixture.hypervisor,
    installation_evidence: fixture.installationEvidence,
    current_context: currentContext,
    remediation: fixture.remediation,
    remediation_state: fixture.state,
    semantic_action: REPOSITORY_DOCS_EFFECT_POLICY.semantic_action,
    principal: fixture.principal,
    resolution: fixture.resolution,
    handoff: fixture.handoff,
    operatorPublicKey: fixture.operator.publicKey,
    confirmations,
    approval_id: approvalId,
    loadApproval: async id => {
      assert.equal(id, approvalId);
      return approval;
    },
    consumeApproval: consume,
    purpose: 'intent.remediation',
    data_scopes: [],
    one_use_nonce: 'resolved_runtime_nonce_0123456789',
    now: NOW
  });
}

test('fresh resolved target passes ordinary confirmation and independent approval before preparation', async () => {
  const fixture = resolutionFixture();
  const consumed = [];
  const result = await prepare(fixture, {
    consume: async (approvalId, intentId) => consumed.push({ approvalId, intentId })
  });

  const admission = verifyIntentResolvedRuntimeAdmission(result.runtime_admission, {
    hypervisorPublicKey: fixture.hypervisor.publicKey
  });
  assert.equal(admission.target_gates_satisfied, true);
  assert.equal(admission.prepared_effect_construction_authorized, true);
  assert.equal(admission.operator_execution_authorized, false);
  assert.equal(admission.grid_prepared_event_observed, false);
  assert.equal(admission.effect_destination, 'github:Zoverions/AXIOM-MESH');
  assert.equal(admission.eligibility_digest, fixture.eligibility.eligibility_digest);
  assert.equal(admission.resolution_id, fixture.resolution.resolution_id);
  assert.equal(admission.resolution_digest, fixture.resolution.resolution_digest);
  assert.equal(admission.handoff_id, fixture.handoff.handoff_id);
  assert.equal(admission.handoff_digest, fixture.handoff.handoff_digest);
  assert.equal(admission.repository_plan_digest, fixture.plan.plan_digest);
  assert.equal(admission.resolved_input_digest, fixture.resolution.resolved_input_digest);
  assert.equal(admission.policy.requires_independent_approval, true);
  assert.deepEqual(admission.confirmations, [CONFIRMATION]);

  assert.equal(result.target_envelope.runtime_admission_digest, admission.admission_digest);
  assert.equal(result.target_envelope.execution_authorized, false);
  assert.equal(result.target_envelope.external_effect_prepared, false);

  const prepared = verifyPreparedRepositoryDocsEffect(result.prepared_effect, {
    hypervisorPublicKey: fixture.hypervisor.publicKey,
    operatorPublicKey: fixture.operator.publicKey,
    now: NOW
  });
  assert.equal(prepared.plan.plan_digest, fixture.plan.plan_digest);
  assert.equal(prepared.source_bindings.intent_id, result.target_envelope.intent_id);
  assert.equal(prepared.source_bindings.intent_digest, result.target_envelope.intent_digest);
  assert.equal(prepared.source_bindings.handoff_digest, fixture.handoff.handoff_digest);
  assert.equal(prepared.source_bindings.remediation_proposal_digest, fixture.remediation.remediation_proposal_digest);
  assert.equal(prepared.authority_bindings.policy_digest, fixture.eligibility.policy_digest);
  assert.equal(prepared.authority_bindings.executor_registry_digest, fixture.eligibility.executor_registry_digest);
  assert.equal(prepared.authority_bindings.mapping_digest, fixture.eligibility.mapped_executor.mapping_digest);
  assert.equal(prepared.execution_authorized, false);
  assert.equal(prepared.merge_authorized, false);

  assert.equal(result.approval_consumed, true);
  assert.deepEqual(consumed, [{
    approvalId: 'approval_runtime_docs_0001',
    intentId: result.target_envelope.intent_id
  }]);
  assert.equal(result.operator_execution_authorized, false);
  assert.equal(result.grid_prepared_event_observed, false);
});

test('missing required confirmation fails before approval lookup or prepared effect return', async () => {
  const fixture = resolutionFixture();
  let loaded = 0;
  await assert.rejects(
    () => prepareResolvedRepositoryDocsEffect({
      identity: fixture.hypervisor,
      installation_evidence: fixture.installationEvidence,
      current_context: fixture.postContext,
      remediation: fixture.remediation,
      remediation_state: fixture.state,
      semantic_action: REPOSITORY_DOCS_EFFECT_POLICY.semantic_action,
      principal: fixture.principal,
      resolution: fixture.resolution,
      handoff: fixture.handoff,
      operatorPublicKey: fixture.operator.publicKey,
      confirmations: [],
      approval_id: 'approval_runtime_docs_0001',
      loadApproval: async () => { loaded += 1; return approvalFor(fixture); },
      consumeApproval: async () => {},
      one_use_nonce: 'resolved_runtime_nonce_0123456789',
      now: NOW
    }),
    error => error.code === 'confirmation_required' && error.status === 409
  );
  assert.equal(loaded, 0);
});

test('missing or mismatched independent approval fails closed and is never consumed', async () => {
  const fixture = resolutionFixture();
  await assert.rejects(
    () => prepareResolvedRepositoryDocsEffect({
      identity: fixture.hypervisor,
      installation_evidence: fixture.installationEvidence,
      current_context: fixture.postContext,
      remediation: fixture.remediation,
      remediation_state: fixture.state,
      semantic_action: REPOSITORY_DOCS_EFFECT_POLICY.semantic_action,
      principal: fixture.principal,
      resolution: fixture.resolution,
      handoff: fixture.handoff,
      operatorPublicKey: fixture.operator.publicKey,
      confirmations: [CONFIRMATION],
      one_use_nonce: 'resolved_runtime_nonce_0123456789',
      now: NOW
    }),
    error => error.code === 'independent_approval_required'
  );

  for (const badApproval of [
    approvalFor(fixture, { request_digest: '0'.repeat(64) }),
    approvalFor(fixture, { approver: fixture.principal.id }),
    approvalFor(fixture, { expires_at: '2026-08-11T02:59:59.000Z' }),
    approvalFor(fixture, { status: 'consumed' })
  ]) {
    let consumed = 0;
    await assert.rejects(
      () => prepare(fixture, {
        approval: badApproval,
        consume: async () => { consumed += 1; }
      }),
      error => error.code === 'approval_invalid' && error.status === 403
    );
    assert.equal(consumed, 0);
  }
});

test('current policy or registry drift after observed installation invalidates runtime preparation', async () => {
  const fixture = resolutionFixture();
  const changedPolicy = structuredClone(fixture.postContext.policy);
  changedPolicy.actions[REPOSITORY_DOCS_EFFECT_POLICY.target_action].constraints.generation = 2;
  await assert.rejects(
    () => prepare(fixture, {
      currentContext: { ...fixture.postContext, policy: changedPolicy }
    }),
    /current policy differs/
  );

  const changedRegistry = structuredClone(fixture.postContext.executor_registry);
  changedRegistry.mappings.push({
    semantic_action: 'repo.tests.add',
    target_action: 'system.echo',
    capability_id: 'core.intent-loop',
    tool: 'builtin.echo',
    fixed_input: { message: 'drift' },
    constraints: {}
  });
  await assert.rejects(
    () => prepare(fixture, {
      currentContext: { ...fixture.postContext, executor_registry: changedRegistry }
    }),
    /current executor registry does not match/
  );
});

test('stale or forged resolution/handoff cannot reach policy approval consumption', async () => {
  const fixture = resolutionFixture();
  const forgedResolution = structuredClone(fixture.resolution);
  forgedResolution.resolved_input.repository_plan.changes[0].new_content = '# forged\n';
  let consumed = 0;
  await assert.rejects(
    () => prepareResolvedRepositoryDocsEffect({
      identity: fixture.hypervisor,
      installation_evidence: fixture.installationEvidence,
      current_context: fixture.postContext,
      remediation: fixture.remediation,
      remediation_state: fixture.state,
      semantic_action: REPOSITORY_DOCS_EFFECT_POLICY.semantic_action,
      principal: fixture.principal,
      resolution: forgedResolution,
      handoff: fixture.handoff,
      operatorPublicKey: fixture.operator.publicKey,
      confirmations: [CONFIRMATION],
      approval_id: 'approval_runtime_docs_0001',
      loadApproval: async () => approvalFor(fixture),
      consumeApproval: async () => { consumed += 1; },
      one_use_nonce: 'resolved_runtime_nonce_0123456789',
      now: NOW
    }),
    /content-addressed|signature|resolution|plan/
  );
  assert.equal(consumed, 0);
});

test('machine principal must independently allow the exact GitHub destination', async () => {
  const denied = resolutionFixture({ principal: machinePrincipal(['local']) });
  await assert.rejects(
    () => prepare(denied, { approval: approvalFor(denied) }),
    error => error.code === 'machine_destination_denied' && error.status === 403
  );

  const allowed = resolutionFixture({ principal: machinePrincipal() });
  const result = await prepare(allowed, { approval: approvalFor(allowed) });
  assert.equal(
    result.runtime_admission.principal.machine_authority_digest,
    allowed.principal.authority_digest
  );
  assert.equal(
    result.prepared_effect.source_bindings.machine_authority_digest,
    allowed.principal.authority_digest
  );
});

test('approval consumption failure prevents a prepared result from being returned', async () => {
  const fixture = resolutionFixture();
  await assert.rejects(
    () => prepare(fixture, {
      consume: async () => {
        throw new Error('simulated atomic consume failure');
      }
    }),
    /simulated atomic consume failure/
  );
});

test('production authority remains closed despite runtime primitive existence', () => {
  assert.equal(productionRegistry.mappings.length, 0);
  assert.equal(productionPolicy.actions[REPOSITORY_DOCS_EFFECT_POLICY.target_action], undefined);
});
