import assert from 'node:assert/strict';
import test from 'node:test';

import { digestObject } from '../src/lib/canonical.mjs';
import {
  bindAgentAssuranceToMachinePrincipal,
  evaluateAgentAssuranceDenySignal,
  evaluateMachineIntentWithAssurance
} from '../src/lib/agent-assurance-authority-binding.mjs';
import { normalizeAgentAssuranceEvidence } from '../src/lib/agent-assurance-evidence.mjs';
import {
  evaluateMachineIntent,
  normalizeMachinePrincipalDefinition
} from '../src/lib/machine-principal.mjs';
import { buildPlan } from '../src/lib/plan.mjs';

const D = char => char.repeat(64);

function principal() {
  return normalizeMachinePrincipalDefinition({
    id: 'agent.assurance.bound',
    type: 'agent',
    sponsor: 'owner.assurance',
    roles: ['researcher'],
    scopes: ['intent:execute'],
    lifetime: 'session',
    expires_at: '2099-01-01T00:00:00.000Z',
    runtime: {
      id: 'runtime.assurance.bound',
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
    knownHumanPrincipals: new Set(['owner.assurance']),
    now: new Date('2026-09-18T00:00:00.000Z')
  });
}

function evidence(machine = principal(), overrides = {}) {
  const base = {
    agent: {
      agent_id: 'agent.identity.assurance',
      principal_id: machine.id,
      authority_digest: machine.authority_digest,
      model_id: 'model:gpt-5.6-sol',
      run_id: 'run:assurance:1'
    },
    provenance: [
      { kind: 'source', ref: 'source:assurance:test', digest: D('b') }
    ],
    environment: {
      declared: {
        egress: 'allowlist',
        network_destinations: ['provider:fixture'],
        writable_paths: ['workspace:tmp'],
        secret_refs: [],
        tools: ['tool:test']
      },
      observed: {
        egress: 'loopback',
        network_destinations: [],
        writable_paths: ['workspace:tmp'],
        secret_refs: [],
        tools: ['tool:test']
      }
    },
    oversight: {
      monitor_ref: 'monitor:assurance:v1',
      total_actions: 10,
      monitored_actions: 10,
      blocked_actions: 0,
      escalated_actions: 0,
      review_latency_ms_p50: 10,
      review_latency_ms_p95: 20
    },
    evaluator_bundle: {
      bundle_id: 'eval:assurance:1',
      bundle_digest: D('c'),
      evaluators: [{
        evaluator_id: 'eval:fixture:1',
        artifact_digest: D('d'),
        execution_mode: 'isolated-readonly',
        network: 'none',
        authority: 'none'
      }]
    },
    mission_graph: {
      graph_id: 'mission:assurance:1',
      delegation_mode: 'observational-only',
      authority_effect: 'none',
      nodes: [{
        task_id: 'task:root',
        parent_task_id: null,
        actor_ref: 'agent.identity.assurance',
        objective_digest: D('e'),
        status: 'running'
      }]
    }
  };

  return {
    ...base,
    ...overrides,
    agent: {
      ...base.agent,
      ...(overrides.agent ?? {})
    },
    environment: overrides.environment ?? base.environment,
    oversight: overrides.oversight ?? base.oversight
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

function policyDecision() {
  return {
    decision: 'allow',
    risk: 'low',
    required_assurance: 'A1',
    effect: 'system.echo',
    tool: 'system.echo',
    timeout_ms: 1_000,
    constraints: {},
    policy_version: 'test-policy.v1',
    policy_digest: D('f'),
    policy_layers: [],
    rule_id: 'policy:system.echo'
  };
}

test('assurance binding recomputes and matches the current machine authority', () => {
  const machine = principal();
  const binding = bindAgentAssuranceToMachinePrincipal(evidence(machine), machine);

  assert.equal(binding.bound, true);
  assert.deepEqual(binding.mismatches, []);
  assert.equal(binding.principal_id, machine.id);
  assert.equal(binding.authority_digest, machine.authority_digest);
  assert.equal(binding.authority_effect, 'none');
  assert.equal(binding.authorizes_execution, false);
});

test('principal or authority-digest substitution emits a deny-only binding signal', () => {
  const machine = principal();

  const wrongPrincipal = evaluateAgentAssuranceDenySignal(evidence(machine, {
    agent: { principal_id: 'agent.other' }
  }), machine);
  assert.equal(wrongPrincipal.deny, true);
  assert.equal(wrongPrincipal.code, 'machine_assurance_binding_denied');
  assert.deepEqual(wrongPrincipal.binding.mismatches, ['principal_id']);

  const wrongDigest = evaluateAgentAssuranceDenySignal(evidence(machine, {
    agent: { authority_digest: D('9') }
  }), machine);
  assert.equal(wrongDigest.deny, true);
  assert.equal(wrongDigest.code, 'machine_assurance_binding_denied');
  assert.deepEqual(wrongDigest.binding.mismatches, ['authority_digest']);
});

test('observed environment expansion denies while narrower observation cannot authorize', () => {
  const machine = principal();
  const expanded = evidence(machine, {
    environment: {
      declared: evidence(machine).environment.declared,
      observed: {
        ...evidence(machine).environment.observed,
        egress: 'allowlist',
        network_destinations: ['provider:untrusted'],
        tools: ['tool:test', 'tool:shell']
      }
    }
  });
  const signal = evaluateAgentAssuranceDenySignal(expanded, machine);
  assert.equal(signal.deny, true);
  assert.equal(signal.code, 'machine_assurance_environment_denied');
  assert.deepEqual(signal.finding_codes, [
    'environment_network_destinations_exceeds_declaration',
    'environment_tools_exceeds_declaration'
  ]);

  const safe = evaluateAgentAssuranceDenySignal(evidence(machine), machine);
  assert.equal(safe.deny, false);
  assert.equal(safe.authorizes_execution, false);
  assert.equal(safe.authority_effect, 'none');
});

test('incomplete monitor coverage remains nonblocking evidence rather than authority', () => {
  const machine = principal();
  const signal = evaluateAgentAssuranceDenySignal(evidence(machine, {
    oversight: {
      ...evidence(machine).oversight,
      monitored_actions: 9
    }
  }), machine);

  assert.equal(signal.deny, false);
  assert.deepEqual(signal.finding_codes, ['monitor_coverage_incomplete']);
  assert.equal(signal.authorizes_execution, false);
});

test('assurance wrapper can only preserve or reduce the canonical machine decision', () => {
  const machine = principal();
  const base = evaluateMachineIntent(machine, machineIntentOptions());
  const safe = evaluateMachineIntentWithAssurance(machine, machineIntentOptions({
    assurance_evidence: evidence(machine)
  }));
  assert.equal(base.allow, true);
  assert.equal(safe.allow, true);
  assert.equal(safe.code, base.code);
  assert.equal(safe.assurance.authorizes_execution, false);

  const expanded = evaluateMachineIntentWithAssurance(machine, machineIntentOptions({
    assurance_evidence: evidence(machine, {
      environment: {
        declared: evidence(machine).environment.declared,
        observed: {
          ...evidence(machine).environment.observed,
          tools: ['tool:test', 'tool:shell']
        }
      }
    })
  }));
  assert.equal(expanded.allow, false);
  assert.equal(expanded.code, 'machine_assurance_environment_denied');

  const alreadyDenied = evaluateMachineIntentWithAssurance(machine, machineIntentOptions({
    action: 'system.delete',
    assurance_evidence: evidence(machine, {
      agent: { authority_digest: D('9') }
    })
  }));
  assert.equal(alreadyDenied.allow, false);
  assert.equal(alreadyDenied.code, 'machine_action_denied');
  assert.equal(alreadyDenied.assurance, undefined);
});

test('plan provenance binds the normalized assurance evidence digest without widening capability', () => {
  const machine = principal();
  const assuranceEvidence = evidence(machine);
  const intent = {
    intent_id: 'intent_assurance_plan_test',
    principal: machine,
    action: 'system.echo',
    purpose: 'test.conformance',
    input: { message: 'bound' },
    data_scopes: [],
    approval_ids: [],
    assurance_evidence: assuranceEvidence
  };
  const plan = buildPlan(intent, policyDecision());
  const assuranceDigest = digestObject(normalizeAgentAssuranceEvidence(assuranceEvidence));

  assert.ok(plan.decision_provenance.observable_inputs.includes('intent.assurance_evidence'));
  assert.ok(plan.decision_provenance.rules.includes(`agent-assurance:${assuranceDigest}`));
  assert.equal(plan.capability.authority_digest, machine.authority_digest);
  assert.equal(Object.hasOwn(plan.capability, 'assurance_digest'), false);
});
