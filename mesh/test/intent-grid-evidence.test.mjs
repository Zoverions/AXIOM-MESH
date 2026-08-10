import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { sha256 } from '../src/lib/canonical.mjs';
import { ensureMeshIdentity } from '../src/lib/identity.mjs';
import { loadDataProtector } from '../src/lib/protector.mjs';
import { executeBuiltin } from '../src/sandbox/executor.mjs';
import { GridStore } from '../src/grid/store.mjs';
import {
  activationGovernanceAction,
  attestationMemoryInput,
  buildIntentActivationRecord,
  buildIntentAttestationRecord,
  deriveIntentGridAssessment,
  normalizeIntentActivationRecord,
  validateActivationSupersession
} from '../src/lib/intent-grid-evidence.mjs';
import { runIntentCtl } from '../src/intentctl.mjs';

function contractFixture() {
  return {
    schema: 'axiom-intent-contract.v1',
    contract_id: 'intent-grid-fixture',
    title: 'Intent Grid Fixture',
    mission: 'Keep the fixture safe and evidence-bound.',
    objectives: [],
    invariants: [
      {
        id: 'INV-SAFETY',
        statement: 'The exact build passes its safety verification.',
        severity: 'critical',
        verification: {
          classification: 'deterministic',
          method: 'Run the exact-build safety suite.',
          evidence_required: ['test result'],
          minimum_independent_verifiers: 2
        },
        remediation_actions: ['repo.tests.add']
      }
    ],
    authority: {
      autonomous: ['repo.tests.add'],
      approval_required: [],
      forbidden: ['tests.weaken-for-pass']
    },
    evidence: {
      default_minimum_independent_verifiers: 1
    },
    optimization: {
      priority: ['correctness', 'security']
    }
  };
}

function buildFixture(source = 'source-v1', options = {}) {
  return buildIntentActivationRecord(contractFixture(), {
    kernel_version: '0.12.0-dev.3',
    source_digest: sha256(source)
  }, options);
}

async function storeFixture(t) {
  const dataDir = await mkdtemp(join(tmpdir(), 'axiom-intent-grid-'));
  const identity = await ensureMeshIdentity(dataDir, 'grid', { create: true });
  const protector = await loadDataProtector({ dataDir, autoBootstrap: true });
  const path = join(dataDir, 'grid.sqlite');
  let store = new GridStore({ path, dataDir, identity, protector });
  t.after(async () => {
    try {
      store.close();
    } catch {
      // Some tests deliberately close before restart.
    }
    await rm(dataDir, { recursive: true, force: true });
  });
  return {
    dataDir,
    identity,
    protector,
    path,
    get store() {
      return store;
    },
    replaceStore(next) {
      store = next;
    }
  };
}

function sleep(milliseconds) {
  return new Promise(resolve => setTimeout(resolve, milliseconds));
}

async function activateThroughGovernance(store, activation, {
  proposalId = `proposal:${activation.activation_digest.slice(0, 16)}`,
  proposer = 'human:proposer',
  voter = 'human:reviewer',
  activator = 'human:activator'
} = {}) {
  const now = Date.now();
  const votingEndsAt = new Date(now + 250).toISOString();
  const activateAfter = new Date(now + 500).toISOString();
  store.appendEvents({
    traceId: `trace:${proposalId}:propose`,
    actor: proposer,
    events: [{
      kind: 'governance.proposed',
      subject: proposalId,
      payload: {
        proposal_id: proposalId,
        proposer,
        title: 'Activate Intent Contract',
        body: 'Ratify a digest-bound AXIOM Intent Contract.',
        action: activationGovernanceAction(activation),
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
  await sleep(Math.max(0, new Date(votingEndsAt).valueOf() - Date.now() + 20));
  store.appendEvents({
    traceId: `trace:${proposalId}:finalize`,
    actor: proposer,
    events: [{
      kind: 'governance.finalized',
      subject: proposalId,
      payload: { proposal_id: proposalId, finalized_by: proposer }
    }]
  });
  await sleep(Math.max(0, new Date(activateAfter).valueOf() - Date.now() + 20));
  store.appendEvents({
    traceId: `trace:${proposalId}:activate`,
    actor: activator,
    events: [{
      kind: 'governance.activated',
      subject: proposalId,
      payload: { proposal_id: proposalId, activated_by: activator }
    }]
  });
  return proposalId;
}

function appendAttestation(store, activation, verifier, {
  verdict = 'pass',
  artifact = verifier,
  expiresAt = new Date(Date.now() + 60_000).toISOString()
} = {}) {
  const attestation = buildIntentAttestationRecord(activation, {
    requirement_id: 'INV-SAFETY',
    verdict,
    evidence: [{
      obligation: 'test result',
      artifact_digest: sha256(artifact),
      artifact_type: 'test-report',
      ref: `evidence:${artifact}`
    }],
    expires_at: expiresAt,
    verifier
  });
  const executed = executeBuiltin({
    tool: 'builtin.validate-mutation',
    intent: {
      action: 'memory.put',
      input: attestationMemoryInput(attestation),
      principal: { id: verifier, type: 'service', roles: [], scopes: ['memory:write'] }
    }
  });
  store.appendEvents({
    traceId: `trace:${verifier}:${attestation.attestation_digest.slice(0, 12)}`,
    actor: verifier,
    events: [executed.mutation]
  });
  return { attestation, executed };
}

test('activation and attestation records are digest-bound and CLI-preparable', async () => {
  const activation = buildFixture();
  assert.equal(normalizeIntentActivationRecord(activation).activation_digest, activation.activation_digest);
  assert.throws(
    () => normalizeIntentActivationRecord({
      ...activation,
      build: { ...activation.build, source_digest: 'f'.repeat(64) }
    }),
    /build_digest|binding|digest/
  );
  const files = new Map([
    ['contract.json', JSON.stringify(contractFixture())],
    ['build.json', JSON.stringify({
      kernel_version: '0.12.0-dev.3',
      source_digest: sha256('source-v1')
    })],
    ['activation.json', JSON.stringify(activation)],
    ['attestation.json', JSON.stringify({
      requirement_id: 'INV-SAFETY',
      verdict: 'pass',
      evidence: [{ obligation: 'test result', artifact_digest: sha256('report') }],
      expires_at: new Date(Date.now() + 60_000).toISOString(),
      verifier: 'service:verifier'
    })]
  ]);
  const readFileImpl = async path => files.get(path);
  const preparedActivation = await runIntentCtl(
    ['prepare-activation', 'contract.json', 'build.json'],
    { readFileImpl }
  );
  assert.equal(preparedActivation.submit_with, 'governance.propose');
  assert.equal(
    preparedActivation.governance_action.payload.record_kind,
    'intent.contract.activated'
  );
  const preparedAttestation = await runIntentCtl(
    ['prepare-attestation', 'activation.json', 'attestation.json'],
    { readFileImpl }
  );
  assert.equal(preparedAttestation.submit_with, 'memory.put');
  assert.equal(preparedAttestation.memory_input.kind, 'intent.evidence.attested');
});

test('Grid assessment requires governance activation and distinct authenticated verifiers', async t => {
  const fixture = await storeFixture(t);
  const { store } = fixture;
  const activation = buildFixture();
  await activateThroughGovernance(store, activation);

  const initial = store.getIntentContractAssessment(activation.contract_id);
  assert.equal(initial.chain.verification_mode, 'full');
  assert.equal(initial.assessment.summary.unknown, 1);
  assert.equal(initial.reconciliation.state, 'blocked');
  assert.equal(initial.execution_authorized, false);

  appendAttestation(store, activation, 'service:verifier-a');
  const oneVerifier = store.getIntentContractAssessment(activation.contract_id);
  assert.equal(oneVerifier.assessment.requirements[0].status, 'unknown');
  assert.equal(oneVerifier.assessment.requirements[0].reason, 'insufficient_independent_verifiers');

  appendAttestation(store, activation, 'service:verifier-b');
  const satisfied = store.getIntentContractAssessment(activation.contract_id);
  assert.equal(satisfied.assessment.requirements[0].status, 'pass');
  assert.deepEqual(
    satisfied.assessment.requirements[0].independent_verifiers,
    ['service:verifier-a', 'service:verifier-b']
  );
  assert.equal(satisfied.reconciliation.state, 'converged');
  assert.equal(satisfied.execution_authorized, false);
});

test('wrong-build, actor-mismatch, duplicate, conflict, stale, and revocation paths fail closed', async t => {
  const { store } = await storeFixture(t);
  const activation = buildFixture();
  await activateThroughGovernance(store, activation);
  const first = appendAttestation(store, activation, 'service:verifier-a');
  appendAttestation(store, activation, 'service:verifier-b');

  const fakeActivation = buildFixture('source-v2');
  const wrongBuild = buildIntentAttestationRecord(fakeActivation, {
    requirement_id: 'INV-SAFETY',
    verdict: 'pass',
    evidence: [{ obligation: 'test result', artifact_digest: sha256('wrong-build') }],
    expires_at: new Date(Date.now() + 60_000).toISOString(),
    verifier: 'service:wrong-build'
  });
  const wrongMutation = executeBuiltin({
    tool: 'builtin.validate-mutation',
    intent: {
      action: 'memory.put',
      input: attestationMemoryInput(wrongBuild),
      principal: { id: 'service:wrong-build', type: 'service', roles: [], scopes: [] }
    }
  }).mutation;
  assert.throws(
    () => store.appendEvents({
      traceId: 'trace:wrong-build',
      actor: 'service:wrong-build',
      events: [wrongMutation]
    }),
    /wrong active contract or build/
  );

  assert.throws(
    () => store.appendEvents({
      traceId: 'trace:actor-mismatch',
      actor: 'service:not-verifier-a',
      events: [first.executed.mutation]
    }),
    /owner must match|verifier must match/
  );
  assert.throws(
    () => store.appendEvents({
      traceId: 'trace:duplicate',
      actor: 'service:verifier-a',
      events: [first.executed.mutation]
    }),
    error => error.code === 'intent_attestation_replayed'
  );

  const failure = appendAttestation(store, activation, 'service:verifier-c', {
    verdict: 'fail',
    artifact: 'failure-report'
  });
  const conflicted = store.getIntentContractAssessment(activation.contract_id);
  assert.equal(conflicted.assessment.requirements[0].status, 'unknown');
  assert.equal(conflicted.assessment.requirements[0].reason, 'conflicting_attestations');
  assert.equal(conflicted.reconciliation.state, 'blocked');

  const revoke = executeBuiltin({
    tool: 'builtin.validate-mutation',
    intent: {
      action: 'memory.tombstone',
      input: { object_id: failure.executed.output.object_id, reason: 'Verifier withdrew conflicting result' },
      principal: { id: 'service:verifier-c', type: 'service', roles: [], scopes: ['memory:write'] }
    }
  });
  assert.throws(
    () => store.appendEvents({
      traceId: 'trace:unauthorized-revoke',
      actor: 'service:other',
      events: [revoke.mutation]
    }),
    /Only the authenticated Intent verifier/
  );
  store.appendEvents({
    traceId: 'trace:authorized-revoke',
    actor: 'service:verifier-c',
    events: [revoke.mutation]
  });
  assert.equal(
    store.getIntentContractAssessment(activation.contract_id).assessment.requirements[0].status,
    'pass'
  );

  const staleAt = new Date(Date.now() + 120_000).toISOString();
  const stale = store.getIntentContractAssessment(activation.contract_id, { now: staleAt });
  assert.equal(stale.assessment.requirements[0].status, 'unknown');
  assert.equal(stale.assessment.requirements[0].reason, 'stale_attestations');
  assert.equal(stale.reconciliation.state, 'blocked');
});

test('activation supersession is linear and stale governance activation is rejected', async t => {
  const { store } = await storeFixture(t);
  const first = buildFixture('source-v1');
  await activateThroughGovernance(store, first, { proposalId: 'proposal:intent:first' });
  assert.throws(
    () => validateActivationSupersession(
      buildFixture('source-v2', { supersedesActivationDigest: 'f'.repeat(64) }),
      first
    ),
    /does not supersede/
  );

  const second = buildFixture('source-v2', {
    supersedesActivationDigest: first.activation_digest
  });
  await activateThroughGovernance(store, second, { proposalId: 'proposal:intent:second' });
  const current = store.getIntentContractAssessment(second.contract_id);
  assert.equal(current.activation.activation_digest, second.activation_digest);
  assert.equal(current.activation.supersedes_activation_digest, first.activation_digest);
});

test('Grid-authenticated Intent state survives restart and full-chain tamper fails assessment', async t => {
  const fixture = await storeFixture(t);
  const activation = buildFixture();
  await activateThroughGovernance(fixture.store, activation, { proposalId: 'proposal:intent:restart' });
  appendAttestation(fixture.store, activation, 'service:verifier-a');
  appendAttestation(fixture.store, activation, 'service:verifier-b');
  assert.equal(
    fixture.store.getIntentContractAssessment(activation.contract_id).reconciliation.state,
    'converged'
  );

  fixture.store.close();
  const restarted = new GridStore({
    path: fixture.path,
    dataDir: fixture.dataDir,
    identity: fixture.identity,
    protector: fixture.protector
  });
  fixture.replaceStore(restarted);
  assert.equal(
    restarted.getIntentContractAssessment(activation.contract_id).reconciliation.state,
    'converged'
  );

  const attestationEvent = restarted.db.prepare(`
    SELECT event_id FROM events
    WHERE kind = 'memory.put' AND actor = 'service:verifier-a'
    ORDER BY seq DESC LIMIT 1
  `).get();
  restarted.db.prepare('UPDATE events SET payload_json = ? WHERE event_id = ?').run(
    '{"tampered":true}',
    attestationEvent.event_id
  );
  assert.throws(
    () => restarted.getIntentContractAssessment(activation.contract_id),
    error => error.code === 'integrity_verification_failed'
  );
});

test('pure authenticated assessment keeps conflicting and rejected records visible', () => {
  const activation = buildFixture();
  const expires = new Date(Date.now() + 60_000).toISOString();
  const pass = buildIntentAttestationRecord(activation, {
    requirement_id: 'INV-SAFETY',
    verdict: 'pass',
    evidence: [{ obligation: 'test result', artifact_digest: sha256('pass') }],
    expires_at: expires,
    verifier: 'service:a'
  });
  const fail = buildIntentAttestationRecord(activation, {
    requirement_id: 'INV-SAFETY',
    verdict: 'fail',
    evidence: [{ obligation: 'test result', artifact_digest: sha256('fail') }],
    expires_at: expires,
    verifier: 'service:b'
  });
  const result = deriveIntentGridAssessment(activation, [
    { record: pass, actor: 'service:a', occurred_at: new Date().toISOString(), seq: 1 },
    { record: fail, actor: 'service:b', occurred_at: new Date().toISOString(), seq: 2 },
    { record: { ...pass, verifier: 'service:forged' }, actor: 'service:a', occurred_at: new Date().toISOString(), seq: 3 }
  ]);
  assert.equal(result.assessment.requirements[0].reason, 'conflicting_attestations');
  assert.equal(result.assessment.rejected_attestations.length, 1);
  assert.equal(result.reconciliation.state, 'blocked');
});
