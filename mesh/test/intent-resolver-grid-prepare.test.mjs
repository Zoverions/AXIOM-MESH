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
const productionExecutors = JSON.parse(
  await readFile(new URL('../config/intent-remediation-executors.json', import.meta.url), 'utf8')
);

const NOW = '2026-08-11T02:40:00.000Z';
const BASE_SHA = 'a'.repeat(40);
const OLD_BLOB = 'b'.repeat(40);
const OLD_CONTENT = '# before\n';
const NEW_CONTENT = '# after\n';
const APPROVAL_ID = 'approval-resolver-grid-0001';

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
    contract_id: 'intent-resolver-grid-test',
    activation_digest: sha256('grid-activation'),
    contract_digest: sha256('grid-contract'),
    graph_digest: sha256('grid-graph'),
    build: { build_digest: sha256('grid-build') },
    assessment: {
      source_assessment_digest: sha256('grid-assessment'),
      evaluated_at: '2026-08-11T02:30:00.000Z'
    },
    reconciliation: {
      state: 'attention_required',
      reconciliation_digest: sha256('grid-reconciliation'),
      violations: ['OBJ-DOCS-CURRENT'],
      unknowns: [],
      proposed_actions: [{
        action: REPOSITORY_DOCS_EFFECT_POLICY.semantic_action,
        decision: 'approval_required',
        reason: 'Documentation must be updated through a bounded PR.',
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
    summary: 'Test-only signed Grid resolver preparation capability.'
  });
  return capabilities;
}

function fixture() {
  const operator = identity('repository-operator');
  const hypervisor = identity('hypervisor');
  const proposal = remediation();
  const policy = resolverPolicy();
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
  return { operator, hypervisor, policy, requester, eligibility, resolution, handoff, request, approval };
}

async function readRequestBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return Buffer.concat(chunks);
}

function sendJson(res, status, value) {
  const body = Buffer.from(JSON.stringify(value));
  res.writeHead(status, {
    'content-type': 'application/json',
    'content-length': String(body.length)
  });
  res.end(body);
}

async function signedGridServer(t, hypervisor, initialApproval, { synchronizeReads = false } = {}) {
  const dataDir = await mkdtemp(join(tmpdir(), 'axiom-resolver-grid-auth-'));
  await mkdir(join(dataDir, 'trust'), { recursive: true });
  await writeFile(
    join(dataDir, 'trust', 'hypervisor.pub.pem'),
    hypervisor.publicKey.export({ type: 'spki', format: 'pem' })
  );
  t.after(() => rm(dataDir, { recursive: true, force: true }));

  const replayGuard = new ReplayGuard();
  const state = {
    approval: structuredClone(initialApproval),
    successful_commits: 0,
    prepared_effects: 0,
    signed_gets: 0,
    signed_commits: 0,
    read_waiters: []
  };
  let seq = 0;
  let previous = '0'.repeat(64);

  const server = http.createServer(async (req, res) => {
    try {
      const body = await readRequestBody(req);
      await verifySignedRequest({
        req,
        body,
        audience: 'grid',
        dataDir,
        allowedCallers: ['hypervisor'],
        replayGuard,
        clockSkewSeconds: 30
      });

      if (req.method === 'GET' && req.url === `/internal/v1/approval/${APPROVAL_ID}`) {
        state.signed_gets += 1;
        if (synchronizeReads && state.signed_gets <= 2) {
          await new Promise(resolve => {
            state.read_waiters.push(resolve);
            if (state.read_waiters.length === 2) {
              for (const waiter of state.read_waiters.splice(0)) waiter();
            }
          });
        }
        sendJson(res, 200, structuredClone(state.approval));
        return;
      }

      if (req.method === 'POST' && req.url === '/internal/v1/commit') {
        state.signed_commits += 1;
        const input = JSON.parse(body.toString('utf8'));
        assert.equal(input.actor, initialApproval.requester);
        assert.equal(input.principal, initialApproval.requester);
        assert.equal(input.events.length, 2);
        const [consumed, prepared] = input.events;
        assert.equal(consumed.kind, 'approval.consumed');
        assert.equal(consumed.payload.approval_id, APPROVAL_ID);
        assert.equal(prepared.kind, 'external.effect.prepared');

        if (state.approval.status !== 'active') {
          sendJson(res, 409, {
            error: {
              code: 'approval_unavailable',
              message: 'Approval is expired, consumed, or unavailable'
            }
          });
          return;
        }

        // Model the Grid transaction: both state transitions become visible
        // together, only after both requested transitions have been validated.
        state.approval.status = 'consumed';
        state.successful_commits += 1;
        state.prepared_effects += 1;
        const events = input.events.map(event => {
          seq += 1;
          const envelope = {
            seq,
            event_id: `evt_grid_resolver_${seq}`,
            kind: event.kind,
            subject: event.subject,
            payload_digest: digestObject(event.payload),
            prev_hash: previous
          };
          const eventHash = digestObject(envelope);
          previous = eventHash;
          return { ...envelope, event_hash: eventHash };
        });
        sendJson(res, 201, { events });
        return;
      }

      sendJson(res, 404, { error: { code: 'not_found', message: 'not found' } });
    } catch (error) {
      sendJson(res, error.status ?? 500, {
        error: { code: error.code ?? 'test_grid_error', message: error.message }
      });
    }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const address = server.address();
  return { state, url: `http://127.0.0.1:${address.port}` };
}

function coordinatorArgs(current, gridUrl, suffix = '01') {
  return {
    identity: current.hypervisor,
    gridUrl,
    traceId: `trace:resolver-grid-${suffix}`,
    approval_id: APPROVAL_ID,
    handoff: current.handoff,
    resolution: current.resolution,
    eligibility: current.eligibility,
    operatorPublicKey: current.operator.publicKey,
    policy: current.policy,
    principal: current.requester,
    request: current.request,
    intent_id: `intent-resolver-grid-${suffix}`,
    one_use_nonce: `resolver_grid_nonce_000000${suffix}`,
    prepared_at: NOW,
    expires_at: '2026-08-11T02:44:00.000Z'
  };
}

test('production registry and policy remain closed while Grid coordinator exists', () => {
  assert.equal(productionExecutors.mappings.length, 0);
  assert.equal(productionPolicy.actions[REPOSITORY_DOCS_EFFECT_POLICY.target_action], undefined);
});

test('Hypervisor fetches approval over signed Grid channel and atomically records consumption plus preparation', async t => {
  const current = fixture();
  const grid = await signedGridServer(t, current.hypervisor, current.approval);
  const result = await prepareResolvedRepositoryEffectWithGridApproval(
    coordinatorArgs(current, grid.url)
  );

  assert.equal(grid.state.signed_gets, 1);
  assert.equal(grid.state.signed_commits, 1);
  assert.equal(grid.state.successful_commits, 1);
  assert.equal(grid.state.prepared_effects, 1);
  assert.equal(grid.state.approval.status, 'consumed');
  assert.equal(result.schema, 'axiom-intent-resolver-grid-preparation.v1');
  assert.equal(result.approval_consumed_observed, true);
  assert.equal(result.durable_preparation_observed, true);
  assert.equal(result.external_effect_executed, false);
  assert.equal(result.merge_performed, false);
  assert.equal(result.approval_consumed_event.kind, 'approval.consumed');
  assert.equal(result.prepared_event.kind, 'external.effect.prepared');
  assert.equal(result.prepared_event.seq, result.approval_consumed_event.seq + 1);
  assert.equal(result.prepared_event.prev_hash, result.approval_consumed_event.event_hash);
  assert.equal(result.binding.prepared_effect.effect_id, result.effect_id);
});

test('two concurrent preparations reading the same active approval can durably prepare exactly one effect', async t => {
  const current = fixture();
  const grid = await signedGridServer(t, current.hypervisor, current.approval, {
    synchronizeReads: true
  });

  const settled = await Promise.allSettled([
    prepareResolvedRepositoryEffectWithGridApproval(coordinatorArgs(current, grid.url, '11')),
    prepareResolvedRepositoryEffectWithGridApproval(coordinatorArgs(current, grid.url, '12'))
  ]);
  const fulfilled = settled.filter(item => item.status === 'fulfilled');
  const rejected = settled.filter(item => item.status === 'rejected');
  assert.equal(fulfilled.length, 1);
  assert.equal(rejected.length, 1);
  assert.equal(rejected[0].reason.code, 'resolver_approval_unavailable');
  assert.equal(rejected[0].reason.status, 409);
  assert.equal(grid.state.signed_gets, 2);
  assert.equal(grid.state.signed_commits, 2);
  assert.equal(grid.state.successful_commits, 1);
  assert.equal(grid.state.prepared_effects, 1);
  assert.equal(grid.state.approval.status, 'consumed');
});

test('consumed Grid approval cannot be replayed into another preparation', async t => {
  const current = fixture();
  const consumed = { ...current.approval, status: 'consumed' };
  const grid = await signedGridServer(t, current.hypervisor, consumed);

  await assert.rejects(
    () => prepareResolvedRepositoryEffectWithGridApproval(
      coordinatorArgs(current, grid.url, '21')
    ),
    /independent approval must be active/
  );
  assert.equal(grid.state.signed_gets, 1);
  assert.equal(grid.state.signed_commits, 0);
  assert.equal(grid.state.prepared_effects, 0);
});

test('caller cannot substitute an approval id not named by the resolved target request', async t => {
  const current = fixture();
  const grid = await signedGridServer(t, current.hypervisor, current.approval);
  await assert.rejects(
    () => prepareResolvedRepositoryEffectWithGridApproval({
      ...coordinatorArgs(current, grid.url, '31'),
      approval_id: 'approval-other-0001'
    }),
    /exactly the Grid approval being consumed/
  );
  assert.equal(grid.state.signed_gets, 0);
  assert.equal(grid.state.signed_commits, 0);
});
