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
import { buildResolvedIntentTargetAuthorization } from '../src/lib/intent-resolver-prepared-effect.mjs';
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

const NOW = '2026-08-11T02:30:00.000Z';
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
    contract_id: 'intent-resolver-independent-approval-expiry-test',
    activation_digest: sha256('expiry-activation'),
    contract_digest: sha256('expiry-contract'),
    graph_digest: sha256('expiry-graph'),
    build: { build_digest: sha256('expiry-build') },
    assessment: {
      source_assessment_digest: sha256('expiry-assessment'),
      evaluated_at: '2026-08-11T02:20:00.000Z'
    },
    reconciliation: {
      state: 'attention_required',
      reconciliation_digest: sha256('expiry-reconciliation'),
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
    policy,
    requester,
    eligibility,
    resolution,
    handoff
  };
}

function targetRequest(current) {
  return {
    principal: current.requester,
    action: REPOSITORY_DOCS_EFFECT_POLICY.target_action,
    input: current.handoff.resolved_input,
    purpose: 'intent-remediation',
    data_scopes: [],
    confirmations: ['confirm:repository.docs.pull-request.create'],
    approval_ids: ['approval-resolver-expiry-0001']
  };
}

function approval(request, expiresAt) {
  return {
    approval_id: 'approval-resolver-expiry-0001',
    approver: 'independent-reviewer',
    requester: 'intent-operator',
    action: REPOSITORY_DOCS_EFFECT_POLICY.target_action,
    request_digest: intentRequestDigest(request),
    expires_at: expiresAt,
    status: 'active'
  };
}

function authorize(current, request, independentApproval) {
  return buildResolvedIntentTargetAuthorization({
    identity: current.hypervisor,
    handoff: current.handoff,
    resolution: current.resolution,
    eligibility: current.eligibility,
    operatorPublicKey: current.operator.publicKey,
    policy: current.policy,
    principal: current.requester,
    request,
    approval: independentApproval,
    now: NOW
  });
}

test('expired independent approval fails closed at resolved target authorization time', () => {
  const current = fixture();
  const request = targetRequest(current);

  const active = authorize(
    current,
    request,
    approval(request, '2026-08-11T02:40:00.000Z')
  );
  assert.equal(active.independent_approval_gate_satisfied, true);
  assert.equal(active.execution_authorized, false);
  assert.equal(active.external_effect_prepared, false);

  assert.throws(
    () => authorize(
      current,
      request,
      approval(request, '2026-08-11T02:30:00.000Z')
    ),
    /independent approval is expired/
  );
});
