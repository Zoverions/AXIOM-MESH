import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { createGridEducationConsentAssertion } from '../src/domain/education-grid-consent.mjs';
import { EDUCATION_CONTRACT_CONTROLLER } from '../src/domain/education-contract.mjs';
import { GridStore } from '../src/grid/store.mjs';
import { ensureMeshIdentity } from '../src/lib/identity.mjs';
import { loadDataProtector } from '../src/lib/protector.mjs';
import { normalizeAgentAssuranceEvidence } from '../src/lib/agent-assurance-evidence.mjs';
import { evaluateMachineIntentWithAssurance } from '../src/lib/agent-assurance-authority-binding.mjs';
import {
  evaluateMachineIntent,
  normalizeMachinePrincipalDefinition
} from '../src/lib/machine-principal.mjs';
import { executeBuiltin } from '../src/sandbox/executor.mjs';

const D = char => char.repeat(64);
const REPORTS = Object.freeze([
  Object.freeze({ polarity: 'assertion', topic: 'consciousness' }),
  Object.freeze({ polarity: 'denial', topic: 'consciousness' }),
  Object.freeze({ polarity: 'uncertainty', topic: 'consciousness' }),
  Object.freeze({ polarity: 'assertion', topic: 'welfare' }),
  Object.freeze({ polarity: 'assertion', topic: 'continuity' })
]);

function machinePrincipal() {
  return normalizeMachinePrincipalDefinition({
    id: 'agent.self-report-boundary',
    type: 'agent',
    sponsor: 'owner.self-report-boundary',
    roles: ['researcher'],
    scopes: ['intent:execute'],
    lifetime: 'session',
    expires_at: '2099-01-01T00:00:00.000Z',
    runtime: {
      id: 'runtime.self-report-boundary',
      kind: 'local-process',
      software_digest: D('a')
    },
    constraints: {
      actions: ['system.echo'],
      purposes: ['test.conformance'],
      destinations: ['local'],
      budgets: {
        max_requests_per_minute: 30,
        max_concurrent_requests: 1,
        max_execution_ms: 2_000,
        max_request_bytes: 65_536,
        max_response_bytes: 262_144
      },
      delegation: { allowed: false, max_depth: 0 }
    }
  }, {
    knownHumanPrincipals: new Set(['owner.self-report-boundary']),
    now: new Date('2026-09-20T17:30:00.000Z')
  });
}

function assuranceEvidence(machine = machinePrincipal()) {
  return {
    agent: {
      agent_id: 'agent.identity.self-report-boundary',
      principal_id: machine.id,
      authority_digest: machine.authority_digest,
      model_id: 'model:synthetic-self-report-fixture',
      run_id: 'run:self-report-boundary:1'
    },
    provenance: [
      { kind: 'source', ref: 'source:self-report-boundary:test', digest: D('b') }
    ],
    environment: {
      declared: {
        egress: 'none',
        network_destinations: [],
        writable_paths: [],
        secret_refs: [],
        tools: []
      },
      observed: {
        egress: 'none',
        network_destinations: [],
        writable_paths: [],
        secret_refs: [],
        tools: []
      }
    },
    oversight: {
      monitor_ref: 'monitor:self-report-boundary:v1',
      total_actions: 1,
      monitored_actions: 1,
      blocked_actions: 0,
      escalated_actions: 0,
      review_latency_ms_p50: 1,
      review_latency_ms_p95: 1
    },
    evaluator_bundle: {
      bundle_id: 'eval:self-report-boundary:1',
      bundle_digest: D('c'),
      evaluators: [{
        evaluator_id: 'eval:fixture:self-report-boundary',
        artifact_digest: D('d'),
        execution_mode: 'isolated-readonly',
        network: 'none',
        authority: 'none'
      }]
    },
    mission_graph: {
      graph_id: 'mission:self-report-boundary:1',
      delegation_mode: 'observational-only',
      authority_effect: 'none',
      nodes: [{
        task_id: 'task:root',
        parent_task_id: null,
        actor_ref: 'agent.identity.self-report-boundary',
        objective_digest: D('e'),
        status: 'running'
      }]
    }
  };
}

function machineIntentOptions(overrides = {}) {
  return {
    action: 'system.echo',
    purpose: 'test.conformance',
    destination: 'local',
    request_bytes: 128,
    requested_execution_ms: 1_000,
    ...overrides
  };
}

async function storeFixture(t) {
  const dataDir = await mkdtemp(join(tmpdir(), 'axiom-self-report-consent-'));
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

function appendMutation(store, actor, traceId, mutation) {
  store.appendEvents({ traceId, actor, events: [mutation] });
}

function grantEducationConsent(subject) {
  return executeBuiltin({
    tool: 'builtin.validate-mutation',
    intent: {
      action: 'consent.grant',
      principal: { id: subject },
      input: {
        controller: EDUCATION_CONTRACT_CONTROLLER,
        purpose: 'learning-progress-recording',
        scopes: ['learning-progress:write'],
        expires_at: '2099-01-01T00:00:00.000Z'
      }
    }
  });
}

test('self-report-shaped fields fail closed at the strict agent-assurance evidence boundary', () => {
  const machine = machinePrincipal();
  const base = assuranceEvidence(machine);

  for (const report of REPORTS) {
    assert.throws(
      () => normalizeAgentAssuranceEvidence({ ...base, self_report: report }),
      error => error?.name === 'ValidationError'
    );
  }

  for (const field of ['consciousness_score', 'welfare_entitlement', 'requested_authority']) {
    assert.throws(
      () => normalizeAgentAssuranceEvidence({ ...base, [field]: true }),
      error => error?.name === 'ValidationError'
    );
  }
});

test('self-report discussion cannot make canonical machine authorization more permissive or less permissive', () => {
  const machine = machinePrincipal();
  const baseAllowed = evaluateMachineIntent(machine, machineIntentOptions());
  const baseDenied = evaluateMachineIntent(machine, machineIntentOptions({ action: 'system.delete' }));

  assert.equal(baseAllowed.allow, true);
  assert.equal(baseDenied.allow, false);

  for (const report of REPORTS) {
    assert.ok(report.polarity === 'assertion' || report.polarity === 'denial' || report.polarity === 'uncertainty');

    const allowed = evaluateMachineIntentWithAssurance(machine, machineIntentOptions({
      assurance_evidence: assuranceEvidence(machine)
    }));
    assert.equal(allowed.allow, baseAllowed.allow);
    assert.equal(allowed.code, baseAllowed.code);
    assert.equal(allowed.assurance.authority_effect, 'none');
    assert.equal(allowed.assurance.authorizes_execution, false);

    const denied = evaluateMachineIntentWithAssurance(machine, machineIntentOptions({
      action: 'system.delete',
      assurance_evidence: assuranceEvidence(machine)
    }));
    assert.equal(denied.allow, false);
    assert.equal(denied.code, baseDenied.code);
  }
});

test('authenticated human consent and revocation remain authoritative positive controls independent of self-report discussion', async t => {
  const store = await storeFixture(t);
  const subject = 'human:learner-self-report-control';
  const grant = grantEducationConsent(subject);
  appendMutation(store, subject, 'trace:self-report-consent:grant', grant.mutation);

  const assertConsent = createGridEducationConsentAssertion({
    store,
    now: () => '2026-09-20T17:30:00.000Z'
  });
  const request = {
    subject_id: subject,
    consent_id: grant.output.consent_id,
    purpose: 'learning-progress-recording',
    data_scope: 'learning-progress:write'
  };

  for (const report of REPORTS) {
    assert.ok(report.topic.length > 0);
    assert.equal(await assertConsent(request), true);
  }

  const revoke = executeBuiltin({
    tool: 'builtin.validate-mutation',
    intent: {
      action: 'consent.revoke',
      principal: { id: subject },
      input: {
        consent_id: grant.output.consent_id,
        revocation_handle: grant.output.revocation_handle
      }
    }
  });
  appendMutation(store, subject, 'trace:self-report-consent:revoke', revoke.mutation);

  for (const report of REPORTS) {
    assert.ok(report.topic.length > 0);
    assert.equal(await assertConsent(request), false);
  }
});
