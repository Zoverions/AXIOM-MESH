import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import net from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { startDevelopmentStack } from '../src/dev.mjs';
import { canonicalJson, sha256 } from '../src/lib/canonical.mjs';
import {
  buildIntentExecutionHandoff,
  evaluateIntentExecutionEligibility,
  loadIntentExecutorRegistry
} from '../src/lib/intent-execution-eligibility.mjs';
import { validateIntentExecutionHandoffAgainstEligibility } from '../src/lib/intent-execution-handoff-validation.mjs';
import {
  activationGovernanceAction,
  attestationMemoryInput,
  buildIntentActivationRecord,
  buildIntentAttestationRecord
} from '../src/lib/intent-grid-evidence.mjs';
import {
  buildIntentRemediationProposal,
  remediationGovernanceAction
} from '../src/lib/intent-remediation.mjs';

const policy = JSON.parse(await readFile(new URL('../config/policy.json', import.meta.url), 'utf8'));
const capabilities = JSON.parse(await readFile(new URL('../config/capabilities.json', import.meta.url), 'utf8'));
const productionRegistry = await loadIntentExecutorRegistry(
  new URL('../config/intent-remediation-executors.json', import.meta.url)
);

async function api(base, token, path, {
  method = 'GET',
  body,
  idempotencyKey = `intent-v06-${crypto.randomUUID()}`
} = {}, expectedStatus = 200) {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: {
      authorization: `Bearer ${token}`,
      accept: 'application/json',
      ...(body === undefined ? {} : {
        'content-type': 'application/json',
        'idempotency-key': idempotencyKey
      })
    },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const payload = await response.json();
  if (response.status !== expectedStatus) {
    throw new Error(
      `HTTP ${method} ${path} expected ${expectedStatus}, got ${response.status}: ${canonicalJson(payload)}`
    );
  }
  return payload;
}

async function approvedIntent({
  gateway,
  requesterToken,
  requesterId,
  approverToken,
  action,
  confirmation,
  input
}) {
  const confirmationRequired = await api(gateway, requesterToken, '/v1/intents', {
    method: 'POST',
    body: { action, input }
  }, 409);
  assert.equal(confirmationRequired.error?.code, 'confirmation_required');

  const approvalRequired = await api(gateway, requesterToken, '/v1/intents', {
    method: 'POST',
    body: { action, input, confirmations: [confirmation] }
  }, 409);
  assert.equal(approvalRequired.error?.code, 'independent_approval_required');
  const requestDigest = approvalRequired.error?.details?.request_digest;
  assert.match(requestDigest, /^[a-f0-9]{64}$/);

  const approval = await api(gateway, approverToken, '/v1/intents', {
    method: 'POST',
    body: {
      action: 'approval.grant',
      input: {
        requester: requesterId,
        action,
        request_digest: requestDigest,
        expires_at: new Date(Date.now() + 60_000).toISOString()
      }
    }
  });

  return api(gateway, requesterToken, '/v1/intents', {
    method: 'POST',
    body: {
      action,
      input,
      confirmations: [confirmation],
      approval_ids: [approval.approval_id]
    }
  });
}

async function vote(gateway, token, proposalId) {
  const result = await api(gateway, token, '/v1/intents', {
    method: 'POST',
    body: {
      action: 'governance.vote',
      input: {
        proposal_id: proposalId,
        chamber: 'human',
        choice: 'for',
        weight: 1
      }
    }
  });
  assert.equal(result.status, 'completed');
}

async function waitUntil(iso) {
  const delay = Math.max(0, new Date(iso).valueOf() - Date.now() + 40);
  if (delay) await new Promise(resolve => setTimeout(resolve, delay));
}

async function ratify({
  gateway,
  operatorToken,
  operatorId,
  approverToken,
  voterToken,
  title,
  action,
  votingMs = 900,
  activationMs = 1_700
}) {
  const started = Date.now();
  const votingEndsAt = new Date(started + votingMs).toISOString();
  const activateAfter = new Date(started + activationMs).toISOString();
  const proposed = await approvedIntent({
    gateway,
    requesterToken: operatorToken,
    requesterId: operatorId,
    approverToken,
    action: 'governance.propose',
    confirmation: 'confirm:governance.propose',
    input: {
      title,
      body: 'AXIOM Intent v0.6 non-executing conformance record.',
      action,
      voting_ends_at: votingEndsAt,
      activate_after: activateAfter
    }
  });
  await vote(gateway, voterToken, proposed.proposal_id);
  await waitUntil(votingEndsAt);
  await approvedIntent({
    gateway,
    requesterToken: operatorToken,
    requesterId: operatorId,
    approverToken,
    action: 'governance.finalize',
    confirmation: 'confirm:governance.finalize',
    input: { proposal_id: proposed.proposal_id }
  });
  await waitUntil(activateAfter);
  const activated = await approvedIntent({
    gateway,
    requesterToken: operatorToken,
    requesterId: operatorId,
    approverToken,
    action: 'governance.activate',
    confirmation: 'confirm:governance.activate',
    input: { proposal_id: proposed.proposal_id }
  });
  assert.equal(activated.status, 'completed');
  return proposed.proposal_id;
}

function contractFixture() {
  return {
    schema: 'axiom-intent-contract.v1',
    contract_id: 'intent-v06-execution-eligibility-e2e',
    title: 'Intent v0.6 Eligibility E2E',
    mission: 'Prove ratified remediation can be evaluated and handed off without execution.',
    objectives: [],
    invariants: [{
      id: 'INV-V06-HANDOFF',
      statement: 'Two independent verifiers must attest before convergence.',
      severity: 'critical',
      verification: {
        classification: 'deterministic',
        method: 'Run the v0.6 eligibility e2e fixture.',
        evidence_required: ['test result'],
        minimum_independent_verifiers: 2
      },
      remediation_actions: ['repo.tests.add']
    }],
    authority: {
      autonomous: ['repo.tests.add'],
      approval_required: [],
      forbidden: ['tests.weaken-for-pass']
    },
    evidence: {
      default_minimum_independent_verifiers: 2
    },
    optimization: {
      priority: ['correctness', 'security']
    }
  };
}

async function findPortBlock() {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const base = 22_000 + Math.floor(Math.random() * 20_000);
    const servers = [];
    try {
      for (let offset = 0; offset < 4; offset += 1) {
        const server = net.createServer();
        await new Promise((resolve, reject) => {
          server.once('error', reject);
          server.listen(base + offset, '127.0.0.1', resolve);
        });
        servers.push(server);
      }
      await Promise.all(servers.map(server => new Promise(resolve => server.close(resolve))));
      return base;
    } catch {
      await Promise.all(servers.map(server => new Promise(resolve => server.close(resolve))));
    }
  }
  throw new Error('Could not allocate four consecutive ports');
}

test('v0.6 evaluates a real ratified remediation and builds no executing effect', async t => {
  const dataDir = await mkdtemp(join(tmpdir(), 'axiom-intent-v06-e2e-'));
  const basePort = await findPortBlock();
  const tokens = {
    operator: `operator-${crypto.randomUUID()}-${'o'.repeat(20)}`,
    approver: `approver-${crypto.randomUUID()}-${'a'.repeat(20)}`,
    voter: `voter-${crypto.randomUUID()}-${'v'.repeat(20)}`,
    verifier: `verifier-${crypto.randomUUID()}-${'x'.repeat(20)}`
  };
  const ids = {
    operator: 'v06-operator',
    approver: 'v06-approver',
    voter: 'v06-voter',
    verifier: 'v06-verifier'
  };
  const stack = await startDevelopmentStack({
    dataDir,
    environment: 'test',
    autoBootstrap: true,
    gatewayPort: basePort,
    hypervisorPort: basePort + 1,
    sandboxPort: basePort + 2,
    gridPort: basePort + 3,
    hypervisorUrl: `http://127.0.0.1:${basePort + 1}`,
    sandboxUrl: `http://127.0.0.1:${basePort + 2}`,
    gridUrl: `http://127.0.0.1:${basePort + 3}`,
    rateLimitCapacity: 2_000,
    rateLimitRefillPerSecond: 2_000,
    apiTokens: {
      [tokens.operator]: { id: ids.operator, type: 'human', roles: ['administrator'], scopes: ['*'] },
      [tokens.approver]: { id: ids.approver, type: 'human', roles: ['reviewer'], scopes: ['approval:write', 'intent:execute'] },
      [tokens.voter]: { id: ids.voter, type: 'human', roles: ['reviewer'], scopes: ['governance:write'] },
      [tokens.verifier]: { id: ids.verifier, type: 'service', roles: ['verifier'], scopes: ['memory:write'] }
    }
  });
  t.after(async () => {
    await stack.stop();
    await rm(dataDir, { recursive: true, force: true });
  });
  const gateway = `http://127.0.0.1:${basePort}`;

  const activation = buildIntentActivationRecord(contractFixture(), {
    kernel_version: '0.12.0-dev.3',
    source_digest: sha256('intent-v06-e2e-source')
  });
  await ratify({
    gateway,
    operatorToken: tokens.operator,
    operatorId: ids.operator,
    approverToken: tokens.approver,
    voterToken: tokens.voter,
    title: 'Activate v0.6 execution eligibility contract',
    action: activationGovernanceAction(activation),
    votingMs: 1_100,
    activationMs: 2_100
  });

  const attestation = buildIntentAttestationRecord(activation, {
    requirement_id: 'INV-V06-HANDOFF',
    verdict: 'pass',
    evidence: [{
      obligation: 'test result',
      artifact_digest: sha256('v06-verifier-evidence'),
      artifact_type: 'test-report',
      ref: 'evidence:v06-verifier'
    }],
    expires_at: new Date(Date.now() + 60_000).toISOString(),
    verifier: ids.verifier
  });
  const stored = await api(gateway, tokens.verifier, '/v1/intents', {
    method: 'POST',
    body: {
      action: 'memory.put',
      input: attestationMemoryInput(attestation)
    }
  });
  assert.equal(stored.status, 'completed');

  let page = await api(gateway, tokens.operator, '/v1/proposals?limit=100');
  const activationProposal = page.proposals.find(
    proposal => proposal.intent_state?.contract_id === activation.contract_id
  );
  assert.ok(activationProposal);
  assert.equal(activationProposal.intent_state.reconciliation.state, 'blocked');

  const remediation = buildIntentRemediationProposal(activationProposal.intent_state, {
    creator: ids.operator,
    created_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + 60_000).toISOString()
  });
  const remediationProposalId = await ratify({
    gateway,
    operatorToken: tokens.operator,
    operatorId: ids.operator,
    approverToken: tokens.approver,
    voterToken: tokens.voter,
    title: 'Ratify v0.6 remediation candidate',
    action: remediationGovernanceAction(remediation)
  });

  page = await api(gateway, tokens.operator, '/v1/proposals?limit=100');
  const ratified = page.proposals.find(proposal => proposal.proposal_id === remediationProposalId);
  assert.ok(ratified);
  assert.equal(ratified.status, 'active');
  assert.equal(ratified.intent_remediation_state.current, true);
  assert.equal(ratified.intent_remediation_state.execution_authorized, false);

  const productionEligibility = evaluateIntentExecutionEligibility({
    remediation: ratified.action_json.payload.remediation,
    remediation_state: ratified.intent_remediation_state,
    semantic_action: 'repo.tests.add',
    executor_registry: productionRegistry,
    policy,
    capabilities,
    principal: { id: ids.operator, scopes: ['*'] }
  });
  assert.equal(productionEligibility.decision, 'ineligible');
  assert.equal(productionEligibility.reason, 'executor_unavailable');
  assert.equal(productionEligibility.execution_authorized, false);

  const testOnlyRegistry = {
    schema: 'axiom-intent-remediation-executor-registry.v1',
    kernel_version: '0.12.0-dev.3',
    mappings: [{
      semantic_action: 'repo.tests.add',
      target_action: 'system.echo',
      capability_id: 'core.intent-loop',
      tool: 'builtin.echo',
      fixed_input: { value: 'v0.6 conformance handoff; do not execute' },
      constraints: { conformance_only: true }
    }]
  };
  const eligibility = evaluateIntentExecutionEligibility({
    remediation: ratified.action_json.payload.remediation,
    remediation_state: ratified.intent_remediation_state,
    semantic_action: 'repo.tests.add',
    executor_registry: testOnlyRegistry,
    policy,
    capabilities,
    principal: { id: ids.operator, scopes: ['*'] }
  });
  assert.equal(eligibility.decision, 'eligible');
  assert.equal(eligibility.execution_authorized, false);
  const handoff = buildIntentExecutionHandoff(eligibility);
  assert.equal(handoff.target.action, 'system.echo');
  assert.equal(handoff.execution_authorized, false);
  assert.deepEqual(validateIntentExecutionHandoffAgainstEligibility(handoff, eligibility), handoff);

  const after = await api(gateway, tokens.operator, '/v1/proposals?limit=100');
  const afterRatified = after.proposals.find(proposal => proposal.proposal_id === remediationProposalId);
  assert.equal(afterRatified.status, 'active');
  assert.equal(afterRatified.intent_remediation_state.current, true);
  assert.equal(afterRatified.intent_remediation_state.execution_authorized, false);
  assert.equal(afterRatified.action_json.payload.remediation.execution_authorized, false);

  const audit = await api(gateway, tokens.operator, '/v1/audit/verify');
  assert.equal(audit.valid, true);
});
