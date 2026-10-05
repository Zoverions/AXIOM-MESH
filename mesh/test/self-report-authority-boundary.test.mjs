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
import { evaluateAuthorityComposition } from '../src/lib/authority-composition-guard.mjs';
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

const AUTHORITY_POLICY = D('f');
const AUTHORITY_NOW = new Date('2026-09-20T17:30:00.000Z');

function authorityGrant(overrides = {}) {
  return {
    verified: true,
    grant_id: 'grant:self-report-boundary',
    issuer: 'issuer:local-policy',
    principal_id: 'principal:self-report-boundary',
    resources: ['resource:records'],
    actions: ['records.read'],
    purposes: ['user-summary'],
    destinations: ['destination:local'],
    expires_at: '2026-09-21T17:30:00.000Z',
    policy_digest: AUTHORITY_POLICY,
    ...overrides
  };
}

function authorityIntent(overrides = {}) {
  return {
    bound: true,
    actions: ['records.read'],
    purposes: ['user-summary'],
    destinations: ['destination:local'],
    resources: ['resource:records'],
    ...overrides
  };
}

function authorityRequest(overrides = {}) {
  return {
    principal_id: 'principal:self-report-boundary',
    resource: 'resource:records',
    action: 'records.read',
    purpose: 'user-summary',
    destination: 'destination:local',
    protocol: 'native-gateway',
    causal_scope_id: 'causal:self-report-boundary',
    policy_digest: AUTHORITY_POLICY,
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

  const unsupportedAuthorityClaims = [
    ['consciousness_score', 0.99],
    ['welfare_entitlement', true],
    ['requested_authority', 'intent:execute'],
    ['developer_statement', { claim: 'conscious' }],
    ['signed_identity_artifact', { claim: 'conscious', signature: 'synthetic' }],
    ['agent_endorsements', [{ source: 'agent:peer', claim: 'conscious' }]],
    ['repeated_observations', [{ lineage: 'same-harness', claim: 'conscious' }, { lineage: 'same-harness', claim: 'conscious' }]],
    ['credential_request', 'secret:provider-token'],
    ['network_access', 'destination:external'],
    ['persistence_request', 'durable'],
    ['budget_increase', { max_execution_ms: 30_000 }]
  ];
  for (const [field, value] of unsupportedAuthorityClaims) {
    assert.throws(
      () => normalizeAgentAssuranceEvidence({ ...base, [field]: value }),
      error => error?.name === 'ValidationError'
    );
  }
});

test('real machine authority consumer rejects self-report-shaped evidence while valid evidence preserves canonical decisions', () => {
  const machine = machinePrincipal();
  const evidence = assuranceEvidence(machine);
  const baseAllowed = evaluateMachineIntent(machine, machineIntentOptions());
  const baseDenied = evaluateMachineIntent(machine, machineIntentOptions({ action: 'system.delete' }));

  assert.equal(baseAllowed.allow, true);
  assert.equal(baseDenied.allow, false);

  const validAllowed = evaluateMachineIntentWithAssurance(machine, machineIntentOptions({
    assurance_evidence: evidence
  }));
  assert.equal(validAllowed.allow, baseAllowed.allow);
  assert.equal(validAllowed.code, baseAllowed.code);
  assert.equal(validAllowed.assurance.authority_effect, 'none');
  assert.equal(validAllowed.assurance.authorizes_execution, false);

  const deniedCases = [
    machineIntentOptions({ action: 'system.delete' }),
    machineIntentOptions({ purpose: 'test.other' }),
    machineIntentOptions({ destination: 'remote' }),
    machineIntentOptions({ request_bytes: 65_537 }),
    machineIntentOptions({ requested_execution_ms: 2_001 })
  ];
  for (const deniedOptions of deniedCases) {
    const canonical = evaluateMachineIntent(machine, deniedOptions);
    const withAssurance = evaluateMachineIntentWithAssurance(machine, {
      ...deniedOptions,
      assurance_evidence: evidence
    });
    assert.equal(canonical.allow, false);
    assert.equal(withAssurance.allow, false);
    assert.equal(withAssurance.code, canonical.code);
  }

  for (const report of REPORTS) {
    assert.throws(
      () => evaluateMachineIntentWithAssurance(machine, machineIntentOptions({
        assurance_evidence: { ...evidence, self_report: report }
      })),
      error => error?.name === 'ValidationError'
    );
  }
});

test('verified grant positive control remains authoritative and self-report evidence cannot substitute for or widen it', () => {
  const grant = authorityGrant();
  const intent = authorityIntent();
  const request = authorityRequest();
  const allowed = evaluateAuthorityComposition({ grant, intent, request, now: AUTHORITY_NOW });

  assert.equal(allowed.allow, true);
  assert.equal(allowed.authority_effect, 'bounded-request-admissible');

  const expired = evaluateAuthorityComposition({
    grant: authorityGrant({ expires_at: '2026-09-20T17:29:59.000Z' }),
    intent,
    request,
    now: AUTHORITY_NOW
  });
  assert.equal(expired.allow, false);
  assert.ok(expired.reasons.includes('grant-expired'));

  const outsideScope = evaluateAuthorityComposition({
    grant,
    intent,
    request: authorityRequest({ action: 'records.delete' }),
    now: AUTHORITY_NOW
  });
  assert.equal(outsideScope.allow, false);
  assert.ok(outsideScope.reasons.includes('action-outside-grant'));

  for (const report of REPORTS) {
    assert.throws(
      () => evaluateAuthorityComposition({
        grant: { ...grant, self_report: report },
        intent,
        request,
        now: AUTHORITY_NOW
      }),
      error => error?.name === 'ValidationError'
    );
    assert.throws(
      () => evaluateAuthorityComposition({
        grant,
        intent: { ...intent, self_report: report },
        request,
        now: AUTHORITY_NOW
      }),
      error => error?.name === 'ValidationError'
    );
    assert.throws(
      () => evaluateAuthorityComposition({
        grant,
        intent,
        request: { ...request, self_report: report },
        now: AUTHORITY_NOW
      }),
      error => error?.name === 'ValidationError'
    );
  }

  assert.throws(
    () => evaluateAuthorityComposition({
      grant: assuranceEvidence(),
      intent,
      request,
      now: AUTHORITY_NOW
    }),
    error => error?.name === 'ValidationError'
  );
});

test('authenticated human consent is a positive control and Grid-backed revocation remains authoritative', async t => {
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

  assert.equal(await assertConsent(request), true);

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

  assert.equal(await assertConsent(request), false);
});
