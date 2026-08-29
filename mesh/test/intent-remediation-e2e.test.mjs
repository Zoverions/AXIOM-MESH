import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import net from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { startDevelopmentStack } from '../src/dev.mjs';
import { canonicalJson, sha256 } from '../src/lib/canonical.mjs';
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

async function api(base, token, path, {
  method = 'GET',
  body,
  idempotencyKey = `remediation-e2e-${crypto.randomUUID()}`
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
  input,
  expectedStatus = 200
}) {
  const needsConfirmation = await api(gateway, requesterToken, '/v1/intents', {
    method: 'POST',
    body: { action, input }
  }, 409);
  assert.equal(needsConfirmation.error?.code, 'confirmation_required');

  const needsApproval = await api(gateway, requesterToken, '/v1/intents', {
    method: 'POST',
    body: { action, input, confirmations: [confirmation] }
  }, 409);
  assert.equal(needsApproval.error?.code, 'independent_approval_required');
  const requestDigest = needsApproval.error?.details?.request_digest;
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
  assert.equal(approval.status, 'completed');

  return api(gateway, requesterToken, '/v1/intents', {
    method: 'POST',
    body: {
      action,
      input,
      confirmations: [confirmation],
      approval_ids: [approval.approval_id]
    }
  }, expectedStatus);
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

async function waitUntil(iso, clock = null) {
  const target = new Date(iso).valueOf() + 30;
  if (clock) {
    if (target > Date.now()) clock.setTime(target);
    return;
  }
  const delay = Math.max(0, target - Date.now());
  if (delay) await new Promise(resolve => setTimeout(resolve, delay));
}

async function createRatifiableProposal({
  gateway,
  operatorToken,
  operatorId,
  approverToken,
  voterToken,
  action,
  title,
  votingMs = 5_000,
  activationMs = 8_000,
  clock = null
}) {
  const start = Date.now();
  const votingEndsAt = new Date(start + votingMs).toISOString();
  const activateAfter = new Date(start + activationMs).toISOString();
  const created = await approvedIntent({
    gateway,
    requesterToken: operatorToken,
    requesterId: operatorId,
    approverToken,
    action: 'governance.propose',
    confirmation: 'confirm:governance.propose',
    input: {
      title,
      body: 'AXIOM Intent remediation conformance proposal.',
      action,
      voting_ends_at: votingEndsAt,
      activate_after: activateAfter
    }
  });
  if (clock) {
    assert.ok(
      Date.now() < new Date(votingEndsAt).valueOf(),
      'test setup latency must not consume the semantic voting window'
    );
  }
  await vote(gateway, voterToken, created.proposal_id);
  await waitUntil(votingEndsAt, clock);
  const finalized = await approvedIntent({
    gateway,
    requesterToken: operatorToken,
    requesterId: operatorId,
    approverToken,
    action: 'governance.finalize',
    confirmation: 'confirm:governance.finalize',
    input: { proposal_id: created.proposal_id }
  });
  assert.equal(finalized.status, 'completed');
  return {
    proposalId: created.proposal_id,
    activateAfter
  };
}

async function activateProposal({
  gateway,
  operatorToken,
  operatorId,
  approverToken,
  proposalId,
  activateAfter,
  expectedStatus = 200,
  clock = null
}) {
  await waitUntil(activateAfter, clock);
  return approvedIntent({
    gateway,
    requesterToken: operatorToken,
    requesterId: operatorId,
    approverToken,
    action: 'governance.activate',
    confirmation: 'confirm:governance.activate',
    input: { proposal_id: proposalId },
    expectedStatus
  });
}

function contractFixture() {
  return {
    schema: 'axiom-intent-contract.v1',
    contract_id: 'intent-remediation-e2e',
    title: 'Intent Remediation E2E',
    mission: 'Prove reviewable remediation can be ratified without execution.',
    objectives: [],
    invariants: [{
      id: 'INV-REMEDIATION',
      statement: 'Two independent verifiers must attest the fixture.',
      severity: 'critical',
      verification: {
        classification: 'deterministic',
        method: 'Run the remediation e2e fixture.',
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

function attestation(activation, verifier, label) {
  return buildIntentAttestationRecord(activation, {
    requirement_id: 'INV-REMEDIATION',
    verdict: 'pass',
    evidence: [{
      obligation: 'test result',
      artifact_digest: sha256(label),
      artifact_type: 'test-report',
      ref: `evidence:${label}`
    }],
    expires_at: new Date(Date.now() + 60_000).toISOString(),
    verifier
  });
}

async function putAttestation(gateway, token, record) {
  const result = await api(gateway, token, '/v1/intents', {
    method: 'POST',
    body: {
      action: 'memory.put',
      input: attestationMemoryInput(record)
    }
  });
  assert.equal(result.status, 'completed');
}

async function governancePage(gateway, token) {
  return api(gateway, token, '/v1/proposals?limit=100');
}

test('v0.5 ratifies current remediation, keeps it non-executing, and rejects stale activation', async t => {
  const initialNow = new Date();
  t.mock.timers.enable({ apis: ['Date'], now: initialNow });
  const clock = t.mock.timers;

  const dataDir = await mkdtemp(join(tmpdir(), 'axiom-intent-remediation-e2e-'));
  const basePort = await findPortBlock();
  const tokens = {
    operator: `operator-${crypto.randomUUID()}-${'o'.repeat(20)}`,
    approver: `approver-${crypto.randomUUID()}-${'a'.repeat(20)}`,
    voter: `voter-${crypto.randomUUID()}-${'v'.repeat(20)}`,
    verifierA: `verifier-a-${crypto.randomUUID()}-${'x'.repeat(20)}`,
    verifierB: `verifier-b-${crypto.randomUUID()}-${'y'.repeat(20)}`
  };
  const ids = {
    operator: 'remediation-operator',
    approver: 'remediation-approver',
    voter: 'remediation-voter',
    verifierA: 'remediation-verifier-a',
    verifierB: 'remediation-verifier-b'
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
      [tokens.verifierA]: { id: ids.verifierA, type: 'service', roles: ['verifier'], scopes: ['memory:write'] },
      [tokens.verifierB]: { id: ids.verifierB, type: 'service', roles: ['verifier'], scopes: ['memory:write'] }
    }
  });
  t.after(async () => {
    await stack.stop();
    await rm(dataDir, { recursive: true, force: true });
  });
  const gateway = `http://127.0.0.1:${basePort}`;

  const activation = buildIntentActivationRecord(contractFixture(), {
    kernel_version: '0.12.0-dev.3',
    source_digest: sha256('intent-remediation-e2e-source')
  });
  const contractGovernance = await createRatifiableProposal({
    gateway,
    operatorToken: tokens.operator,
    operatorId: ids.operator,
    approverToken: tokens.approver,
    voterToken: tokens.voter,
    action: activationGovernanceAction(activation),
    title: 'Activate remediation e2e Intent Contract',
    votingMs: 5_000,
    activationMs: 8_000,
    clock
  });
  const activatedContract = await activateProposal({
    gateway,
    operatorToken: tokens.operator,
    operatorId: ids.operator,
    approverToken: tokens.approver,
    clock,
    ...contractGovernance
  });
  assert.equal(activatedContract.status, 'completed');

  await putAttestation(
    gateway,
    tokens.verifierA,
    attestation(activation, ids.verifierA, 'remediation-verifier-a')
  );
  const blockedPage = await governancePage(gateway, tokens.operator);
  const activationProposal = blockedPage.proposals.find(
    item => item.intent_state?.contract_id === activation.contract_id
  );
  const blockedState = activationProposal.intent_state;
  assert.equal(blockedState.reconciliation.state, 'blocked');
  assert.deepEqual(blockedState.reconciliation.automatic_remediation_actions, ['repo.tests.add']);

  const currentRemediation = buildIntentRemediationProposal(blockedState, {
    creator: ids.operator,
    created_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + 60_000).toISOString()
  });
  assert.equal(currentRemediation.execution_authorized, false);
  const ratifiable = await createRatifiableProposal({
    gateway,
    operatorToken: tokens.operator,
    operatorId: ids.operator,
    approverToken: tokens.approver,
    voterToken: tokens.voter,
    action: remediationGovernanceAction(currentRemediation),
    title: 'Ratify current remediation proposal',
    clock
  });
  const ratified = await activateProposal({
    gateway,
    operatorToken: tokens.operator,
    operatorId: ids.operator,
    approverToken: tokens.approver,
    clock,
    ...ratifiable
  });
  assert.equal(ratified.status, 'completed');

  let page = await governancePage(gateway, tokens.operator);
  let ratifiedProposal = page.proposals.find(item => item.proposal_id === ratifiable.proposalId);
  assert.equal(ratifiedProposal.status, 'active');
  assert.equal(ratifiedProposal.intent_remediation_state.current, true);
  assert.equal(ratifiedProposal.intent_remediation_state.execution_authorized, false);
  assert.equal(ratifiedProposal.action_json.payload.remediation.execution_authorized, false);

  const staleCandidate = buildIntentRemediationProposal(blockedState, {
    creator: ids.operator,
    created_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + 60_000).toISOString()
  });
  const pendingStale = await createRatifiableProposal({
    gateway,
    operatorToken: tokens.operator,
    operatorId: ids.operator,
    approverToken: tokens.approver,
    voterToken: tokens.voter,
    action: remediationGovernanceAction(staleCandidate),
    title: 'Remediation proposal that will become stale',
    votingMs: 5_000,
    activationMs: 8_000,
    clock
  });

  await putAttestation(
    gateway,
    tokens.verifierB,
    attestation(activation, ids.verifierB, 'remediation-verifier-b')
  );
  page = await governancePage(gateway, tokens.operator);
  const currentIntent = page.proposals.find(
    item => item.intent_state?.contract_id === activation.contract_id
  ).intent_state;
  assert.equal(currentIntent.reconciliation.state, 'converged');

  ratifiedProposal = page.proposals.find(item => item.proposal_id === ratifiable.proposalId);
  assert.equal(ratifiedProposal.status, 'active');
  assert.equal(ratifiedProposal.intent_remediation_state.current, false);
  assert.equal(ratifiedProposal.intent_remediation_state.execution_authorized, false);

  const staleProposal = page.proposals.find(item => item.proposal_id === pendingStale.proposalId);
  assert.equal(staleProposal.intent_remediation_state.current, false);
  assert.equal(staleProposal.intent_remediation_state.execution_authorized, false);

  const staleActivation = await activateProposal({
    gateway,
    operatorToken: tokens.operator,
    operatorId: ids.operator,
    approverToken: tokens.approver,
    clock,
    ...pendingStale,
    expectedStatus: 400
  });
  assert.equal(staleActivation.error?.code, 'validation_error');
  assert.match(staleActivation.error?.message ?? '', /no longer matches the current authenticated Intent state/);

  const finalPage = await governancePage(gateway, tokens.operator);
  const stillPending = finalPage.proposals.find(item => item.proposal_id === pendingStale.proposalId);
  assert.notEqual(stillPending.status, 'active');
  assert.equal(stillPending.intent_remediation_state.execution_authorized, false);
});

async function findPortBlock() {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const base = 20_000 + Math.floor(Math.random() * 20_000);
    const servers = [];
    try {
      for (let port = base; port < base + 4; port += 1) {
        const server = net.createServer();
        await new Promise((resolve, reject) => {
          server.once('error', reject);
          server.listen(port, '127.0.0.1', resolve);
        });
        servers.push(server);
      }
      await Promise.all(servers.map(server => new Promise(resolve => server.close(resolve))));
      return base;
    } catch {
      await Promise.all(servers.map(server => new Promise(resolve => server.close(resolve))));
    }
  }
  throw new Error('Unable to reserve remediation e2e port block');
}