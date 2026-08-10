import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { runCli } from '../src/cli.mjs';
import { sha256 } from '../src/lib/canonical.mjs';
import { meshConfig } from '../src/lib/config.mjs';
import { ensureMeshIdentity } from '../src/lib/identity.mjs';
import { loadDataProtector } from '../src/lib/protector.mjs';
import {
  activationGovernanceAction,
  attestationMemoryInput,
  buildIntentActivationRecord,
  buildIntentAttestationRecord
} from '../src/lib/intent-grid-evidence.mjs';
import { executeBuiltin } from '../src/sandbox/executor.mjs';
import { GridStore } from '../src/grid/store.mjs';

function contractFixture() {
  return {
    schema: 'axiom-intent-contract.v1',
    contract_id: 'intent-read-fixture',
    title: 'Intent Read Fixture',
    mission: 'Expose only authenticated read-only Intent state.',
    objectives: [],
    invariants: [{
      id: 'INV-READ',
      statement: 'The exact read-state evidence is verified.',
      severity: 'critical',
      verification: {
        classification: 'deterministic',
        method: 'Verify the read-state fixture.',
        evidence_required: ['test result'],
        minimum_independent_verifiers: 1
      },
      remediation_actions: []
    }],
    authority: {
      autonomous: [],
      approval_required: [],
      forbidden: []
    },
    evidence: {
      default_minimum_independent_verifiers: 1
    },
    optimization: {
      priority: ['correctness']
    }
  };
}

async function storeFixture(t) {
  const dataDir = await mkdtemp(join(tmpdir(), 'axiom-intent-read-'));
  const identity = await ensureMeshIdentity(dataDir, 'grid', { create: true });
  const protector = await loadDataProtector({ dataDir, autoBootstrap: true });
  const store = new GridStore({
    path: join(dataDir, 'grid.sqlite'),
    dataDir,
    identity,
    protector
  });
  t.after(async () => {
    store.close();
    await rm(dataDir, { recursive: true, force: true });
  });
  return store;
}

function appendApprovedProposal(store, {
  proposalId,
  proposer,
  action,
  voter = 'human:reviewer',
  activator = 'human:activator'
}) {
  const votingEndsAt = new Date(Date.now() - 2_000).toISOString();
  const activateAfter = new Date(Date.now() - 1_000).toISOString();
  store.appendEvents({
    traceId: `trace:${proposalId}:propose`,
    actor: proposer,
    events: [{
      kind: 'governance.proposed',
      subject: proposalId,
      payload: {
        proposal_id: proposalId,
        proposer,
        title: 'Read-state proposal',
        body: 'Fixture proposal.',
        action,
        voting_ends_at: votingEndsAt,
        activate_after: activateAfter
      }
    }]
  });
  store.appendEvents({
    traceId: `trace:${proposalId}:vote`,
    actor: voter,
    events: [{
      kind: 'governance.voted',
      subject: proposalId,
      payload: {
        proposal_id: proposalId,
        voter,
        chamber: 'human',
        choice: 'for',
        weight: 1
      }
    }]
  });
  store.appendEvents({
    traceId: `trace:${proposalId}:finalize`,
    actor: proposer,
    events: [{
      kind: 'governance.finalized',
      subject: proposalId,
      payload: { proposal_id: proposalId, finalized_by: proposer }
    }]
  });
  store.appendEvents({
    traceId: `trace:${proposalId}:activate`,
    actor: activator,
    events: [{
      kind: 'governance.activated',
      subject: proposalId,
      payload: { proposal_id: proposalId, activated_by: activator }
    }]
  });
}

function appendPassingAttestation(store, activation) {
  const verifier = 'service:read-verifier';
  const attestation = buildIntentAttestationRecord(activation, {
    requirement_id: 'INV-READ',
    verdict: 'pass',
    evidence: [{
      obligation: 'test result',
      artifact_digest: sha256('read-state-pass'),
      artifact_type: 'test-report',
      ref: 'evidence:read-state-pass'
    }],
    expires_at: new Date(Date.now() + 60_000).toISOString(),
    verifier
  });
  const mutation = executeBuiltin({
    tool: 'builtin.validate-mutation',
    intent: {
      action: 'memory.put',
      input: attestationMemoryInput(attestation),
      principal: { id: verifier, type: 'service', roles: [], scopes: ['memory:write'] }
    }
  }).mutation;
  store.appendEvents({
    traceId: 'trace:read-attestation',
    actor: verifier,
    events: [mutation]
  });
}

test('current active Intent proposal exposes full-chain verified read-only state', async t => {
  const store = await storeFixture(t);
  const activation = buildIntentActivationRecord(contractFixture(), {
    kernel_version: '0.12.0-dev.3',
    source_digest: sha256('intent-read-source')
  });
  appendApprovedProposal(store, {
    proposalId: 'proposal:intent-read',
    proposer: 'human:proposer',
    action: activationGovernanceAction(activation)
  });
  appendPassingAttestation(store, activation);

  const page = store.listProposals({ limit: 100 });
  const proposal = page.find(item => item.proposal_id === 'proposal:intent-read');
  assert.ok(proposal.intent_state);
  assert.equal(proposal.intent_state.activation.contract_id, 'intent-read-fixture');
  assert.equal(proposal.intent_state.chain.verification_mode, 'full');
  assert.equal(proposal.intent_state.assessment.requirements[0].status, 'pass');
  assert.equal(proposal.intent_state.reconciliation.state, 'converged');
  assert.equal(proposal.intent_state.execution_authorized, false);
});

test('ordinary governance proposals remain unextended', async t => {
  const store = await storeFixture(t);
  appendApprovedProposal(store, {
    proposalId: 'proposal:ordinary',
    proposer: 'human:ordinary',
    action: {
      type: 'record.decision',
      payload: { decision: 'ordinary-governance-record' },
      rollback: { description: 'No executable rollback.' }
    }
  });
  const proposal = store.listProposals({ limit: 100 })
    .find(item => item.proposal_id === 'proposal:ordinary');
  assert.ok(proposal);
  assert.equal('intent_state' in proposal, false);
});

test('superseded Intent proposal does not expose current state as its own', async t => {
  const store = await storeFixture(t);
  const first = buildIntentActivationRecord(contractFixture(), {
    kernel_version: '0.12.0-dev.3',
    source_digest: sha256('intent-read-v1')
  });
  appendApprovedProposal(store, {
    proposalId: 'proposal:intent-v1',
    proposer: 'human:proposer',
    action: activationGovernanceAction(first)
  });
  const second = buildIntentActivationRecord(contractFixture(), {
    kernel_version: '0.12.0-dev.3',
    source_digest: sha256('intent-read-v2')
  }, {
    supersedesActivationDigest: first.activation_digest
  });
  appendApprovedProposal(store, {
    proposalId: 'proposal:intent-v2',
    proposer: 'human:proposer',
    action: activationGovernanceAction(second)
  });

  const page = store.listProposals({ limit: 100 });
  const oldProposal = page.find(item => item.proposal_id === 'proposal:intent-v1');
  const currentProposal = page.find(item => item.proposal_id === 'proposal:intent-v2');
  assert.equal('intent_state' in oldProposal, false);
  assert.equal(currentProposal.intent_state.activation.activation_digest, second.activation_digest);
  assert.equal(currentProposal.intent_state.execution_authorized, false);
});

test('intent-state CLI reads existing governance route and preserves authorization failures', async () => {
  const state = {
    schema: 'axiom-intent-grid-state.v1',
    activation: { contract_id: 'intent-read-fixture' },
    execution_authorized: false
  };
  const options = {
    config: meshConfig({ dataDir: '/unused', gatewayPort: 23456 }),
    env: { AXIOM_API_TOKEN: 'test-token' },
    fetchImpl: async url => {
      assert.match(String(url), /\/v1\/proposals\?limit=100$/);
      return {
        ok: true,
        status: 200,
        async json() {
          return { proposals: [{ proposal_id: 'proposal:current', intent_state: state }] };
        }
      };
    }
  };
  assert.deepEqual(
    await runCli(['intent-state', 'intent-read-fixture'], options),
    state
  );

  await assert.rejects(
    () => runCli(['intent-state', 'intent-read-fixture'], {
      ...options,
      fetchImpl: async () => ({
        ok: false,
        status: 403,
        async json() {
          return { error: { code: 'forbidden', message: 'governance:read scope is required' } };
        }
      })
    }),
    error => error.code === 'forbidden' && error.status === 403
  );
});
