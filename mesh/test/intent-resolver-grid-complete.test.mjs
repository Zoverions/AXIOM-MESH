import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import http from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { digestObject, sha256 } from '../src/lib/canonical.mjs';
import { MeshIdentity, ReplayGuard, verifySignedRequest } from '../src/lib/identity.mjs';
import { intentRequestDigest } from '../src/lib/intent-binding.mjs';
import { evaluateIntentExecutionEligibility } from '../src/lib/intent-execution-eligibility.mjs';
import {
  buildIntentExecutorInputResolution,
  buildResolvedIntentExecutionHandoff,
  REPOSITORY_DOCS_INPUT_RESOLVER_ID
} from '../src/lib/intent-executor-input-resolution.mjs';
import {
  buildResolvedIntentPreparedRepositoryDocsEffect,
  buildResolvedIntentTargetAuthorization
} from '../src/lib/intent-resolver-prepared-effect.mjs';
import { buildIntentRemediationProposal } from '../src/lib/intent-remediation.mjs';
import {
  buildRepositoryDocsEffectPlan,
  buildRepositoryDocsEffectReceipt,
  REPOSITORY_DOCS_EFFECT_POLICY,
  REPOSITORY_DOCS_EFFECT_POLICY_DIGEST
} from '../src/lib/repository-docs-effect.mjs';
import { startRepositoryOperatorService } from '../src/repository-operator/service.mjs';
import { executeGridPreparedResolvedRepositoryEffect } from '../src/hypervisor/intent-resolver-grid-complete.mjs';

const productionPolicy = JSON.parse(
  await readFile(new URL('../config/policy.json', import.meta.url), 'utf8')
);
const productionCapabilities = JSON.parse(
  await readFile(new URL('../config/capabilities.json', import.meta.url), 'utf8')
);
const productionExecutors = JSON.parse(
  await readFile(new URL('../config/intent-remediation-executors.json', import.meta.url), 'utf8')
);

const NOW = '2026-08-11T02:50:00.000Z';
const BASE_SHA = 'a'.repeat(40);
const OLD_BLOB = 'b'.repeat(40);
const HEAD_SHA = 'c'.repeat(40);
const NEW_BLOB = 'd'.repeat(40);
const OLD_CONTENT = '# before\n';
const NEW_CONTENT = '# after\n';

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
    contract_id: 'intent-resolver-completion-test',
    activation_digest: sha256('completion-activation'),
    contract_digest: sha256('completion-contract'),
    graph_digest: sha256('completion-graph'),
    build: { build_digest: sha256('completion-build') },
    assessment: {
      source_assessment_digest: sha256('completion-assessment'),
      evaluated_at: '2026-08-11T02:40:00.000Z'
    },
    reconciliation: {
      state: 'attention_required',
      reconciliation_digest: sha256('completion-reconciliation'),
      violations: ['OBJ-DOCS-CURRENT'],
      unknowns: [],
      proposed_actions: [{
        action: REPOSITORY_DOCS_EFFECT_POLICY.semantic_action,
        decision: 'approval_required',
        reason: 'Documentation requires a bounded pull request.',
        triggered_by: ['OBJ-DOCS-CURRENT']
      }]
    },
    execution_authorized: false
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
    constraints: { repository: REPOSITORY_DOCS_EFFECT_POLICY.repository, docs_only: true },
    timeout_ms: 15_000
  };
  return policy;
}

function resolverCapabilities() {
  const capabilities = structuredClone(productionCapabilities);
  const item = capabilities.capabilities.find(x => x.id === REPOSITORY_DOCS_EFFECT_POLICY.capability_id);
  if (item) item.status = 'implemented';
  else capabilities.capabilities.push({
    id: REPOSITORY_DOCS_EFFECT_POLICY.capability_id,
    family: 'repository',
    status: 'implemented',
    summary: 'Test-only resolver completion capability.'
  });
  return capabilities;
}

function resolverRegistry() {
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

function fixture() {
  const operator = identity('repository-operator');
  const hypervisor = identity('hypervisor');
  const grid = identity('grid');
  const proposal = buildIntentRemediationProposal(governanceState(), {
    creator: 'intent-operator',
    created_at: '2026-08-11T02:40:01.000Z',
    expires_at: '2026-08-12T02:40:01.000Z'
  });
  const state = {
    schema: 'axiom-intent-remediation-governance-state.v1',
    remediation_proposal_id: proposal.remediation_proposal_id,
    remediation_proposal_digest: proposal.remediation_proposal_digest,
    basis_digest: proposal.basis_digest,
    contract_id: proposal.contract_id,
    activation_digest: proposal.activation_digest,
    source_assessment_digest: proposal.source_assessment_digest,
    source_reconciliation_digest: proposal.source_reconciliation_digest,
    reconciliation_state: proposal.reconciliation_state,
    action_counts: { autonomous: 0, approval_required: 1, deny: 0 },
    governance_status: 'active',
    current: true,
    current_reason: 'matches_current_authenticated_intent_state',
    execution_authorized: false
  };
  const policy = resolverPolicy();
  const principal = {
    id: 'intent-operator',
    type: 'human',
    roles: ['administrator'],
    scopes: ['repository:docs:write']
  };
  const eligibility = evaluateIntentExecutionEligibility({
    remediation: proposal,
    remediation_state: state,
    semantic_action: REPOSITORY_DOCS_EFFECT_POLICY.semantic_action,
    executor_registry: resolverRegistry(),
    policy,
    capabilities: resolverCapabilities(),
    principal
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
    expires_at: '2026-08-11T02:55:00.000Z'
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
  const approvalId = 'approval-resolver-completion-0001';
  const request = {
    principal,
    action: REPOSITORY_DOCS_EFFECT_POLICY.target_action,
    input: handoff.resolved_input,
    purpose: 'intent-remediation',
    data_scopes: [],
    confirmations: ['confirm:repository.docs.pull-request.create'],
    approval_ids: [approvalId]
  };
  const approval = {
    approval_id: approvalId,
    approver: 'independent-reviewer',
    requester: principal.id,
    action: request.action,
    request_digest: intentRequestDigest(request),
    expires_at: '2026-08-11T03:00:00.000Z',
    status: 'active'
  };
  const authorization = buildResolvedIntentTargetAuthorization({
    identity: hypervisor,
    handoff,
    resolution,
    eligibility,
    operatorPublicKey: operator.publicKey,
    policy,
    principal,
    request,
    approval,
    now: NOW
  });
  const binding = buildResolvedIntentPreparedRepositoryDocsEffect({
    identity: hypervisor,
    authorization,
    handoff,
    resolution,
    eligibility,
    operatorPublicKey: operator.publicKey,
    policy,
    principal,
    request,
    approval,
    intent_id: 'intent-resolver-completion-0001',
    one_use_nonce: 'resolver_completion_nonce_0001',
    prepared_at: NOW,
    expires_at: '2026-08-11T02:54:00.000Z'
  });
  const payload = { prepared_effect: binding.prepared_effect };
  const envelope = {
    seq: 42,
    event_id: 'evt_resolver_completion_prepared',
    trace_id: 'trace:resolver-completion-prepared',
    actor: principal.id,
    kind: 'external.effect.prepared',
    subject: binding.prepared_effect.effect_id,
    occurred_at: NOW,
    payload_digest: digestObject(payload),
    prev_hash: '9'.repeat(64)
  };
  const eventHash = digestObject(envelope);
  const preparedEvent = {
    ...envelope,
    event_hash: eventHash,
    signature: grid.signObject({ event_hash: eventHash })
  };
  const preparation = {
    schema: 'axiom-intent-resolver-grid-preparation.v1',
    approval_id: approvalId,
    approval_consumed_event: {
      seq: 41,
      event_id: 'evt_resolver_completion_approval',
      event_hash: '9'.repeat(64),
      kind: 'approval.consumed'
    },
    prepared_event: preparedEvent,
    authorization,
    binding,
    effect_id: binding.prepared_effect.effect_id,
    effect_digest: binding.prepared_effect.effect_digest,
    durable_preparation_observed: true,
    approval_consumed_observed: true,
    external_effect_executed: false,
    merge_performed: false
  };
  return {
    operator, hypervisor, grid, policy, principal, eligibility, resolution,
    handoff, request, approval, authorization, binding, preparation
  };
}

async function socketPath(t) {
  const dir = await mkdtemp(join(tmpdir(), 'axiom-resolver-completion-socket-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  return join(dir, 'operator.sock');
}

async function signedGridCompletionServer(t, hypervisor) {
  const dataDir = await mkdtemp(join(tmpdir(), 'axiom-resolver-completion-grid-'));
  await mkdir(join(dataDir, 'trust'), { recursive: true });
  await writeFile(
    join(dataDir, 'trust', 'hypervisor.pub.pem'),
    hypervisor.publicKey.export({ type: 'spki', format: 'pem' })
  );
  t.after(() => rm(dataDir, { recursive: true, force: true }));
  const replayGuard = new ReplayGuard();
  const state = { commits: 0, completed: 0 };
  const server = http.createServer(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const body = Buffer.concat(chunks);
    try {
      await verifySignedRequest({
        req,
        body,
        audience: 'grid',
        dataDir,
        allowedCallers: ['hypervisor'],
        replayGuard
      });
      if (req.method !== 'POST' || req.url !== '/internal/v1/commit') {
        res.writeHead(404, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ error: { code: 'not_found', message: 'not found' } }));
        return;
      }
      const input = JSON.parse(body.toString('utf8'));
      assert.equal(input.events.length, 1);
      const event = input.events[0];
      assert.equal(event.kind, 'external.effect.completed');
      state.commits += 1;
      state.completed += 1;
      const envelope = {
        seq: 43,
        event_id: 'evt_resolver_completion_completed',
        kind: event.kind,
        subject: event.subject,
        payload_digest: digestObject(event.payload),
        prev_hash: '8'.repeat(64)
      };
      const eventHash = digestObject(envelope);
      res.writeHead(201, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ events: [{ ...envelope, event_hash: eventHash }] }));
    } catch (error) {
      res.writeHead(error.status ?? 500, { 'content-type': 'application/json' });
      res.end(JSON.stringify({
        error: { code: error.code ?? 'test_grid_error', message: error.message }
      }));
    }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const address = server.address();
  return { state, url: `http://127.0.0.1:${address.port}` };
}

function receiptFor(current, prepared, overrides = {}) {
  return buildRepositoryDocsEffectReceipt({
    identity: current.operator,
    prepared_effect: prepared,
    hypervisorPublicKey: current.hypervisor.publicKey,
    operatorPublicKey: current.operator.publicKey,
    head_sha: HEAD_SHA,
    pull_request_number: 91,
    pull_request_id: 'github-pr:91',
    applied_files: prepared.plan.changes.map(change => ({
      path: change.path,
      new_content_sha256: change.new_content_sha256,
      observed_blob_sha: NEW_BLOB
    })),
    observed_at: NOW,
    ...overrides
  });
}

function completionArgs(current, gridUrl, operatorSocket) {
  return {
    identity: current.hypervisor,
    gridUrl,
    traceId: 'trace:resolver-completion',
    socketPath: operatorSocket,
    preparation: current.preparation,
    authorization: current.authorization,
    handoff: current.handoff,
    resolution: current.resolution,
    eligibility: current.eligibility,
    operatorPublicKey: current.operator.publicKey,
    gridPublicKey: current.grid.publicKey,
    policy: current.policy,
    principal: current.principal,
    request: current.request,
    approval: current.approval,
    now: NOW,
    timeoutMs: 5_000
  };
}

test('production mapping and target policy remain closed after completion coordinator is added', () => {
  assert.equal(productionExecutors.mappings.length, 0);
  assert.equal(productionPolicy.actions[REPOSITORY_DOCS_EFFECT_POLICY.target_action], undefined);
});

test('exact Grid-durable preparation reaches operator once and signed receipt becomes durable completion', async t => {
  const current = fixture();
  const grid = await signedGridCompletionServer(t, current.hypervisor);
  const path = await socketPath(t);
  let operatorCalls = 0;
  const service = await startRepositoryOperatorService({
    socketPath: path,
    runOperator: async ({ prepared_effect }) => {
      operatorCalls += 1;
      return { receipt: receiptFor(current, prepared_effect) };
    }
  });
  t.after(() => service.close());

  const result = await executeGridPreparedResolvedRepositoryEffect(
    completionArgs(current, grid.url, path)
  );
  assert.equal(operatorCalls, 1);
  assert.equal(grid.state.commits, 1);
  assert.equal(grid.state.completed, 1);
  assert.equal(result.schema, 'axiom-intent-resolver-grid-completion.v1');
  assert.equal(result.effect_id, current.binding.prepared_effect.effect_id);
  assert.equal(result.resolver_binding_digest, current.binding.binding_digest);
  assert.equal(result.receipt.effect_id, result.effect_id);
  assert.equal(result.durable_completion_observed, true);
  assert.equal(result.external_effect_executed_observed, true);
  assert.equal(result.pull_request_created_observed, true);
  assert.equal(result.merge_performed, false);
  assert.equal(result.remediation_converged, false);
  assert.equal(result.execution_authorized, false);
});

test('forged Grid preparation signature is rejected before the operator socket is used', async t => {
  const current = fixture();
  const grid = await signedGridCompletionServer(t, current.hypervisor);
  const path = await socketPath(t);
  let operatorCalls = 0;
  const service = await startRepositoryOperatorService({
    socketPath: path,
    runOperator: async ({ prepared_effect }) => {
      operatorCalls += 1;
      return { receipt: receiptFor(current, prepared_effect) };
    }
  });
  t.after(() => service.close());

  const forged = structuredClone(current.preparation);
  forged.prepared_event.signature.signature = 'forged';
  await assert.rejects(
    () => executeGridPreparedResolvedRepositoryEffect({
      ...completionArgs(current, grid.url, path),
      preparation: forged
    }),
    /signature/
  );
  assert.equal(operatorCalls, 0);
  assert.equal(grid.state.commits, 0);
});

test('invalid operator receipt cannot produce a Grid completion event', async t => {
  const current = fixture();
  const grid = await signedGridCompletionServer(t, current.hypervisor);
  const path = await socketPath(t);
  let operatorCalls = 0;
  const service = await startRepositoryOperatorService({
    socketPath: path,
    runOperator: async ({ prepared_effect }) => {
      operatorCalls += 1;
      const receipt = receiptFor(current, prepared_effect);
      receipt.attestation.signature = 'forged';
      return { receipt };
    }
  });
  t.after(() => service.close());

  await assert.rejects(
    () => executeGridPreparedResolvedRepositoryEffect(
      completionArgs(current, grid.url, path)
    ),
    /signature/
  );
  assert.equal(operatorCalls, 1);
  assert.equal(grid.state.commits, 0);
});

test('resolver preparation substitution fails before operator invocation', async t => {
  const current = fixture();
  const grid = await signedGridCompletionServer(t, current.hypervisor);
  const path = await socketPath(t);
  let operatorCalls = 0;
  const service = await startRepositoryOperatorService({
    socketPath: path,
    runOperator: async ({ prepared_effect }) => {
      operatorCalls += 1;
      return { receipt: receiptFor(current, prepared_effect) };
    }
  });
  t.after(() => service.close());

  const substituted = structuredClone(current.preparation);
  substituted.binding.binding_digest = sha256('substituted-binding');
  await assert.rejects(
    () => executeGridPreparedResolvedRepositoryEffect({
      ...completionArgs(current, grid.url, path),
      preparation: substituted
    }),
    /content-addressed|binding|signature/
  );
  assert.equal(operatorCalls, 0);
  assert.equal(grid.state.commits, 0);
});
