import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { digestObject, sha256 } from '../src/lib/canonical.mjs';
import { MeshIdentity } from '../src/lib/identity.mjs';
import { intentRequestDigest } from '../src/lib/intent-binding.mjs';
import { evaluateIntentExecutionEligibility } from '../src/lib/intent-execution-eligibility.mjs';
import {
  buildIntentExecutorInputResolution,
  buildResolvedIntentExecutionHandoff,
  REPOSITORY_DOCS_INPUT_RESOLVER_ID
} from '../src/lib/intent-executor-input-resolution.mjs';
import { buildIntentRemediationProposal } from '../src/lib/intent-remediation.mjs';
import {
  buildRepositoryDocsEffectPlan,
  REPOSITORY_DOCS_EFFECT_POLICY,
  REPOSITORY_DOCS_EFFECT_POLICY_DIGEST
} from '../src/lib/repository-docs-effect.mjs';
import { prepareResolvedRepositoryEffectWithGridApproval } from '../src/hypervisor/intent-resolver-grid-prepare.mjs';

const productionPolicy = JSON.parse(
  await readFile(new URL('../config/policy.json', import.meta.url), 'utf8')
);
const productionCapabilities = JSON.parse(
  await readFile(new URL('../config/capabilities.json', import.meta.url), 'utf8')
);

const NOW = '2026-08-11T02:40:00.000Z';
const BASE_SHA = 'a'.repeat(40);
const OLD_BLOB = 'b'.repeat(40);
const OLD_CONTENT = '# before\n';
const NEW_CONTENT = '# after\n';
const APPROVAL_ID = 'approval-resolver-consequence-0001';

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
    contract_id: 'intent-resolver-grid-consequence-test',
    activation_digest: sha256('consequence-activation'),
    contract_digest: sha256('consequence-contract'),
    graph_digest: sha256('consequence-graph'),
    build: { build_digest: sha256('consequence-build') },
    assessment: {
      source_assessment_digest: sha256('consequence-assessment'),
      evaluated_at: '2026-08-11T02:30:00.000Z'
    },
    reconciliation: {
      state: 'attention_required',
      reconciliation_digest: sha256('consequence-reconciliation'),
      violations: ['OBJ-DOCS-CURRENT'],
      unknowns: [],
      proposed_actions: [{
        action: REPOSITORY_DOCS_EFFECT_POLICY.semantic_action,
        decision: 'approval_required',
        reason: 'Documentation must be updated through a bounded pull request.',
        triggered_by: ['OBJ-DOCS-CURRENT']
      }]
    },
    execution_authorized: false
  };
}

function remediation() {
  return buildIntentRemediationProposal(governanceState(), {
    creator: 'intent-operator',
    created_at: '2026-08-11T02:30:01.000Z',
    expires_at: '2026-08-12T02:30:01.000Z'
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

function observedRegistry() {
  return {
    schema: 'axiom-intent-remediation-executor-registry.v1',
    kernel_version: '0.12.0-dev.3',
    mappings: [{
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
    }]
  };
}

function resolverPolicy(risk = 'high') {
  const policy = structuredClone(productionPolicy);
  policy.actions[REPOSITORY_DOCS_EFFECT_POLICY.target_action] = {
    decision: 'allow',
    risk,
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
    summary: 'Test-only signed Grid consequence-admission capability.'
  });
  return capabilities;
}

function fixture(risk = 'high') {
  const operator = identity('repository-operator');
  const hypervisor = identity('hypervisor');
  const proposal = remediation();
  const policy = resolverPolicy(risk);
  const requester = {
    id: 'intent-operator',
    type: 'human',
    roles: ['administrator'],
    scopes: ['repository:docs:write']
  };
  const eligibility = evaluateIntentExecutionEligibility({
    remediation: proposal,
    remediation_state: remediationState(proposal),
    semantic_action: REPOSITORY_DOCS_EFFECT_POLICY.semantic_action,
    executor_registry: observedRegistry(),
    policy,
    capabilities: resolverCapabilities(),
    principal: requester
  });
  const plan = buildRepositoryDocsEffectPlan({
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
    expires_at: '2026-08-11T02:45:00.000Z'
  });
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
  const request = {
    principal: requester,
    action: REPOSITORY_DOCS_EFFECT_POLICY.target_action,
    input: handoff.resolved_input,
    purpose: 'intent-remediation',
    data_scopes: [],
    confirmations: ['confirm:repository.docs.pull-request.create'],
    approval_ids: [APPROVAL_ID]
  };
  const approval = {
    approval_id: APPROVAL_ID,
    approver: 'independent-reviewer',
    requester: requester.id,
    action: request.action,
    request_digest: intentRequestDigest(request),
    expires_at: '2026-08-11T02:50:00.000Z',
    status: 'active'
  };
  return {
    operator,
    hypervisor,
    policy,
    requester,
    eligibility,
    resolution,
    handoff,
    request,
    approval
  };
}

function coordinatorArgs(current, suffix = '01') {
  return {
    identity: current.hypervisor,
    gridUrl: 'http://127.0.0.1:43123',
    traceId: `trace:resolver-consequence-${suffix}`,
    approval_id: APPROVAL_ID,
    handoff: current.handoff,
    resolution: current.resolution,
    eligibility: current.eligibility,
    operatorPublicKey: current.operator.publicKey,
    policy: current.policy,
    principal: current.requester,
    request: current.request,
    intent_id: `intent-resolver-consequence-${suffix}`,
    one_use_nonce: `resolver_consequence_nonce_000000${suffix}`,
    prepared_at: NOW,
    expires_at: '2026-08-11T02:44:00.000Z'
  };
}

function jsonResponse(status, value) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'content-type': 'application/json' }
  });
}

function installMockGrid(t, current) {
  const originalFetch = globalThis.fetch;
  const state = {
    gets: 0,
    commits: 0,
    last_commit: null
  };
  globalThis.fetch = async (_url, options = {}) => {
    const method = options.method ?? 'GET';
    if (method === 'GET') {
      state.gets += 1;
      return jsonResponse(200, current.approval);
    }
    if (method === 'POST') {
      state.commits += 1;
      const body = JSON.parse(options.body);
      state.last_commit = body;
      let previous = '0'.repeat(64);
      const events = body.events.map((event, index) => {
        const envelope = {
          seq: index + 1,
          event_id: `evt_consequence_${index + 1}`,
          kind: event.kind,
          subject: event.subject,
          payload_digest: digestObject(event.payload),
          prev_hash: previous
        };
        const eventHash = digestObject(envelope);
        previous = eventHash;
        return { ...envelope, event_hash: eventHash };
      });
      return jsonResponse(201, { events });
    }
    return jsonResponse(405, { error: { code: 'method_not_allowed', message: 'method not allowed' } });
  };
  t.after(() => {
    globalThis.fetch = originalFetch;
  });
  return state;
}

test('Grid preparation atomically carries exact repository-docs consequence evidence', async t => {
  const current = fixture('high');
  const grid = installMockGrid(t, current);

  const result = await prepareResolvedRepositoryEffectWithGridApproval(
    coordinatorArgs(current)
  );

  assert.equal(grid.gets, 1);
  assert.equal(grid.commits, 1);
  const preparedPayload = grid.last_commit.events[1].payload;
  const admission = result.consequence_admission;
  assert.ok(admission);
  assert.deepEqual(preparedPayload.consequence_admission, admission);
  assert.equal(admission.effect_id, result.effect_id);
  assert.equal(admission.effect_digest, result.effect_digest);
  assert.equal(admission.classification.effect_ref, result.effect_id);
  assert.equal(admission.classification.effect_digest, result.effect_digest);
  assert.equal(admission.classification.consequence_class, 'digital-consequential');
  assert.equal(admission.classification.classified_at, result.binding.prepared_effect.prepared_at);
  assert.equal(admission.policy_floor.minimum_policy_risk, 'medium');
  assert.equal(admission.policy_floor.policy_risk, 'high');
  assert.equal(admission.policy_floor.policy_floor_satisfied, true);
  assert.equal(admission.authority_effect, 'none');
  assert.equal(admission.execution_effect, 'none');
  for (const forbidden of ['allow', 'deny', 'authorized', 'execution_authority', 'capability_grant']) {
    assert.equal(Object.hasOwn(admission, forbidden), false);
  }
});

test('repository-docs consequence floor rejects insufficient policy risk before Grid commit', async t => {
  const current = fixture('low');
  const grid = installMockGrid(t, current);

  await assert.rejects(
    () => prepareResolvedRepositoryEffectWithGridApproval(
      coordinatorArgs(current, '02')
    ),
    /policy risk.*below.*consequence minimum/i
  );

  assert.equal(grid.gets, 1);
  assert.equal(grid.commits, 0);
});
