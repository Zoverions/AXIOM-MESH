import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { digestObject, sha256 } from '../src/lib/canonical.mjs';
import { MeshIdentity } from '../src/lib/identity.mjs';
import {
  evaluateIntentExecutionEligibility,
  loadIntentExecutorRegistry
} from '../src/lib/intent-execution-eligibility.mjs';
import {
  REPOSITORY_DOCS_EFFECT_POLICY,
  REPOSITORY_DOCS_EFFECT_POLICY_DIGEST,
  buildRepositoryDocsEffectPlan
} from '../src/lib/repository-docs-effect.mjs';
import { buildIntentRemediationProposal } from '../src/lib/intent-remediation.mjs';
import * as resolver from '../src/lib/intent-executor-input-resolution.mjs';

const productionPolicy = JSON.parse(
  await readFile(new URL('../config/policy.json', import.meta.url), 'utf8')
);
const productionCapabilities = JSON.parse(
  await readFile(new URL('../config/capabilities.json', import.meta.url), 'utf8')
);
const productionExecutors = await loadIntentExecutorRegistry(
  new URL('../config/intent-remediation-executors.json', import.meta.url)
);

const NOW = '2026-08-10T23:45:00.000Z';
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

function governanceState() {
  return {
    schema: 'axiom-intent-governance-state.v1',
    contract_id: 'intent-resolver-current-schema-test',
    activation_digest: sha256('activation'),
    contract_digest: sha256('contract'),
    graph_digest: sha256('graph'),
    build: { build_digest: sha256('build') },
    assessment: {
      source_assessment_digest: sha256('assessment'),
      evaluated_at: '2026-08-10T23:40:00.000Z'
    },
    reconciliation: {
      state: 'attention_required',
      reconciliation_digest: sha256('reconciliation'),
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

function remediationFixture() {
  return buildIntentRemediationProposal(governanceState(), {
    creator: 'intent-operator',
    created_at: '2026-08-10T23:40:01.000Z',
    expires_at: '2026-08-11T23:40:01.000Z'
  });
}

function remediationState(remediation, overrides = {}) {
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
    execution_authorized: false,
    ...overrides
  };
}

function inputResolver(overrides = {}) {
  return {
    id: resolver.REPOSITORY_DOCS_INPUT_RESOLVER_ID,
    repository: REPOSITORY_DOCS_EFFECT_POLICY.repository,
    base_branch: REPOSITORY_DOCS_EFFECT_POLICY.base_branch,
    path_policy_digest: REPOSITORY_DOCS_EFFECT_POLICY_DIGEST,
    max_plan_lifetime_ms: 5 * 60 * 1000,
    ...overrides
  };
}

function executorRegistry({
  fixedInput = null,
  targetAction = REPOSITORY_DOCS_EFFECT_POLICY.target_action,
  capabilityId = REPOSITORY_DOCS_EFFECT_POLICY.capability_id,
  tool = REPOSITORY_DOCS_EFFECT_POLICY.tool,
  resolverDeclaration = inputResolver(),
  constraints
} = {}) {
  return {
    schema: 'axiom-intent-remediation-executor-registry.v1',
    kernel_version: '0.12.0-dev.3',
    mappings: [{
      semantic_action: REPOSITORY_DOCS_EFFECT_POLICY.semantic_action,
      target_action: targetAction,
      capability_id: capabilityId,
      tool,
      fixed_input: fixedInput,
      constraints: constraints ?? { input_resolver: resolverDeclaration }
    }]
  };
}

function policyForResolver(overrides = {}) {
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
    timeout_ms: 15_000,
    ...overrides
  };
  return policy;
}

function capabilitiesForResolver() {
  const capabilities = structuredClone(productionCapabilities);
  const existing = capabilities.capabilities.find(
    item => item.id === REPOSITORY_DOCS_EFFECT_POLICY.capability_id
  );
  if (existing) {
    existing.status = 'implemented';
  } else {
    capabilities.capabilities.push({
      id: REPOSITORY_DOCS_EFFECT_POLICY.capability_id,
      family: 'repository',
      status: 'implemented',
      summary: 'Test-only repository-docs executor surface.'
    });
  }
  return capabilities;
}

function evaluate({
  remediation = remediationFixture(),
  state,
  registry = executorRegistry(),
  policy = policyForResolver(),
  capabilities = capabilitiesForResolver(),
  principal = { id: 'intent-operator', scopes: ['repository:docs:write'] }
} = {}) {
  return evaluateIntentExecutionEligibility({
    remediation,
    remediation_state: state ?? remediationState(remediation),
    semantic_action: REPOSITORY_DOCS_EFFECT_POLICY.semantic_action,
    executor_registry: registry,
    policy,
    capabilities,
    principal
  });
}

function plan(operator, {
  plannedAt = NOW,
  expiresAt = '2026-08-10T23:50:00.000Z'
} = {}) {
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
    planned_at: plannedAt,
    expires_at: expiresAt
  });
}

function fixtures() {
  const operator = identity('repository-operator');
  const hypervisor = identity('hypervisor');
  const eligibility = evaluate();
  const repositoryPlan = plan(operator);
  const resolution = resolver.buildIntentExecutorInputResolution({
    identity: hypervisor,
    eligibility,
    repository_plan: repositoryPlan,
    operatorPublicKey: operator.publicKey,
    now: NOW
  });
  const handoff = resolver.buildResolvedIntentExecutionHandoff({
    identity: hypervisor,
    resolution,
    eligibility,
    operatorPublicKey: operator.publicKey,
    now: '2026-08-10T23:46:00.000Z'
  });
  return { operator, hypervisor, eligibility, repositoryPlan, resolution, handoff };
}

test('production policy and executor registry still cannot reach repository-docs resolution', () => {
  assert.equal(productionExecutors.mappings.length, 0);
  assert.equal(productionPolicy.actions[REPOSITORY_DOCS_EFFECT_POLICY.target_action], undefined);

  const noMapping = evaluate({
    registry: productionExecutors,
    policy: productionPolicy,
    capabilities: productionCapabilities,
    principal: { id: 'intent-operator', scopes: ['*'] }
  });
  assert.equal(noMapping.decision, 'ineligible');
  assert.equal(noMapping.reason, 'executor_unavailable');

  const noPolicyAction = evaluate({
    policy: productionPolicy,
    capabilities: capabilitiesForResolver(),
    principal: { id: 'intent-operator', scopes: ['*'] }
  });
  assert.equal(noPolicyAction.decision, 'ineligible');
  assert.equal(noPolicyAction.reason, 'executor_policy_action_unavailable');
});

test('real current eligibility becomes unresolved only on explicit test-only repository executor surfaces', () => {
  const eligibility = evaluate();
  assert.equal(eligibility.schema, 'axiom-intent-execution-eligibility.v1');
  assert.equal(eligibility.decision, 'unknown');
  assert.equal(eligibility.reason, 'executor_input_unresolved');
  assert.equal(eligibility.execution_authorized, false);
  assert.equal(eligibility.mapped_executor.fixed_input_digest, null);
  assert.equal(eligibility.mapped_executor.capability_status, 'implemented');
  assert.deepEqual(eligibility.mapped_executor.registry_constraints, {
    input_resolver: inputResolver()
  });
  assert.equal(eligibility.required_gates.risk, 'high');
  assert.equal(eligibility.required_gates.required_confirmations, 1);
  assert.equal(eligibility.required_gates.requires_independent_approval, true);
  assert.deepEqual(
    eligibility.required_gates.required_confirmation_values,
    ['confirm:repository.docs.pull-request.create']
  );
});

test('signed repository plan resolves only input and preserves every current eligibility binding and gate', () => {
  const { operator, hypervisor, eligibility, resolution, handoff } = fixtures();
  const verified = resolver.verifyIntentExecutorInputResolution(resolution, {
    eligibility,
    hypervisorPublicKey: hypervisor.publicKey,
    operatorPublicKey: operator.publicKey,
    now: '2026-08-10T23:46:00.000Z'
  });

  for (const key of [
    'eligibility_digest',
    'remediation_proposal_id',
    'remediation_proposal_digest',
    'remediation_state_digest',
    'contract_id',
    'activation_digest',
    'contract_digest',
    'graph_digest',
    'build_digest',
    'source_assessment_digest',
    'source_reconciliation_digest',
    'semantic_action',
    'requester',
    'requester_scope_digest',
    'executor_registry_digest',
    'policy_digest',
    'capability_registry_digest'
  ]) {
    assert.equal(verified[key], eligibility[key]);
  }
  assert.equal(verified.mapping_digest, eligibility.mapped_executor.mapping_digest);
  assert.deepEqual(verified.required_gates, eligibility.required_gates);
  assert.equal(verified.resolved_input.repository_plan.plan_digest, verified.repository_plan_digest);
  assert.equal(verified.execution_authorized, false);
  assert.equal(verified.external_effect_prepared, false);
  assert.equal(verified.external_effect_executed, false);

  const verifiedHandoff = resolver.verifyResolvedIntentExecutionHandoff(handoff, {
    resolution: verified,
    eligibility,
    hypervisorPublicKey: hypervisor.publicKey,
    operatorPublicKey: operator.publicKey,
    now: '2026-08-10T23:46:00.000Z'
  });
  assert.equal(verifiedHandoff.resolved_input_digest, verified.resolved_input_digest);
  assert.deepEqual(verifiedHandoff.required_gates, eligibility.required_gates);
  assert.equal(verifiedHandoff.execution_authorized, false);
  assert.equal(verifiedHandoff.external_effect_prepared, false);
  assert.equal(verifiedHandoff.external_effect_executed, false);
});

test('fixed input and satisfied eligibility cannot be replaced by the dynamic resolver', () => {
  const fixed = evaluate({ registry: executorRegistry({ fixedInput: { value: 'fixed' } }) });
  assert.equal(fixed.decision, 'eligible');
  assert.throws(
    () => resolver.verifyResolverEligibleInputState(fixed),
    /executor_input_unresolved|bound input|fixed executor input/
  );
});

test('resolver declaration cannot add authority fields or widen repository, base, path policy, or lifetime', () => {
  for (const changed of [
    { execution_authorized: true },
    { repository: 'other/repository' },
    { base_branch: 'feature/unsafe' },
    { path_policy_digest: '0'.repeat(64) },
    { max_plan_lifetime_ms: 60 * 60 * 1000 }
  ]) {
    const eligibility = evaluate({
      registry: executorRegistry({ resolverDeclaration: inputResolver(changed) })
    });
    assert.equal(eligibility.decision, 'unknown');
    assert.throws(
      () => resolver.verifyResolverEligibleInputState(eligibility),
      /unsupported fields|ceiling|digest|lifetime/
    );
  }

  const siblingConstraint = evaluate({
    registry: executorRegistry({
      constraints: {
        input_resolver: inputResolver(),
        authority_override: true
      }
    })
  });
  assert.throws(
    () => resolver.verifyResolverEligibleInputState(siblingConstraint),
    /exactly one input_resolver/
  );
});

test('a real evaluator result mapped to a different target cannot be laundered through the repository resolver', () => {
  const eligibility = evaluate({
    registry: executorRegistry({
      targetAction: 'system.echo',
      capabilityId: 'core.intent-loop',
      tool: 'builtin.echo'
    }),
    policy: productionPolicy,
    capabilities: productionCapabilities,
    principal: { id: 'intent-operator', scopes: ['intent:execute'] }
  });
  assert.equal(eligibility.decision, 'unknown');
  assert.equal(eligibility.reason, 'executor_input_unresolved');
  assert.throws(
    () => resolver.verifyResolverEligibleInputState(eligibility),
    /outside the repository-docs executor ceiling/
  );
});

test('wrong operator key, expired plan, and resolver lifetime drift fail closed', () => {
  const operator = identity('repository-operator');
  const attacker = identity('repository-operator');
  const hypervisor = identity('hypervisor');
  const eligibility = evaluate();
  const repositoryPlan = plan(operator);

  assert.throws(() => resolver.buildIntentExecutorInputResolution({
    identity: hypervisor,
    eligibility,
    repository_plan: repositoryPlan,
    operatorPublicKey: attacker.publicKey,
    now: NOW
  }), /signature/);

  assert.throws(() => resolver.buildIntentExecutorInputResolution({
    identity: hypervisor,
    eligibility,
    repository_plan: repositoryPlan,
    operatorPublicKey: operator.publicKey,
    now: '2026-08-10T23:51:00.000Z'
  }), /expired/);

  const longPlan = plan(operator, { expiresAt: '2026-08-10T23:55:00.000Z' });
  assert.throws(() => resolver.buildIntentExecutorInputResolution({
    identity: hypervisor,
    eligibility,
    repository_plan: longPlan,
    operatorPublicKey: operator.publicKey,
    now: NOW
  }), /lifetime/);
});

test('policy or registry drift produces fresh eligibility and makes an old resolution stale', () => {
  const { operator, hypervisor, resolution } = fixtures();
  const changedPolicy = policyForResolver({
    constraints: {
      repository: REPOSITORY_DOCS_EFFECT_POLICY.repository,
      docs_only: true,
      generation: 2
    }
  });
  const changedEligibility = evaluate({ policy: changedPolicy });
  assert.equal(changedEligibility.decision, 'unknown');
  assert.notEqual(changedEligibility.eligibility_digest, resolution.eligibility_digest);

  assert.throws(() => resolver.verifyIntentExecutorInputResolution(resolution, {
    eligibility: changedEligibility,
    hypervisorPublicKey: hypervisor.publicKey,
    operatorPublicKey: operator.publicKey,
    now: '2026-08-10T23:46:00.000Z'
  }), /stale/);
});

test('re-addressed resolution or resolved-input tampering cannot preserve Hypervisor signature', () => {
  const { operator, hypervisor, eligibility, resolution } = fixtures();
  const forged = structuredClone(resolution);
  forged.resolved_input.repository_plan.changes[0].new_content = '# attacker\n';
  const {
    resolution_id: ignoredId,
    resolution_digest: ignoredDigest,
    attestation,
    ...body
  } = forged;
  const nextDigest = digestObject(body);
  forged.resolution_id = `resolution:${nextDigest}`;
  forged.resolution_digest = nextDigest;
  forged.attestation = attestation;

  assert.throws(() => resolver.verifyIntentExecutorInputResolution(forged, {
    eligibility,
    hypervisorPublicKey: hypervisor.publicKey,
    operatorPublicKey: operator.publicKey,
    now: '2026-08-10T23:46:00.000Z'
  }), /signature/);
});

test('resolved handoff tampering cannot claim execution or drop current confirmation/approval gates', () => {
  const { operator, hypervisor, eligibility, resolution, handoff } = fixtures();
  for (const mutate of [
    value => { value.execution_authorized = true; },
    value => { value.required_gates.requires_independent_approval = false; },
    value => { value.required_gates.required_confirmations = 0; },
    value => { value.required_gates.required_confirmation_values = []; }
  ]) {
    const forged = structuredClone(handoff);
    mutate(forged);
    const {
      handoff_id: ignoredId,
      handoff_digest: ignoredDigest,
      attestation,
      ...body
    } = forged;
    const nextDigest = digestObject(body);
    forged.handoff_id = `handoff:${nextDigest}`;
    forged.handoff_digest = nextDigest;
    forged.attestation = attestation;

    assert.throws(() => resolver.verifyResolvedIntentExecutionHandoff(forged, {
      resolution,
      eligibility,
      hypervisorPublicKey: hypervisor.publicKey,
      operatorPublicKey: operator.publicKey,
      now: '2026-08-10T23:46:00.000Z'
    }), /signature|does not match|non-executing/);
  }
});
