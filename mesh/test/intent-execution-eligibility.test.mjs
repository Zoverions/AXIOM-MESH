import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { sha256 } from '../src/lib/canonical.mjs';
import {
  INTENT_EXECUTION_ELIGIBILITY_SCHEMA,
  INTENT_EXECUTION_HANDOFF_SCHEMA,
  buildIntentExecutionHandoff,
  evaluateIntentExecutionEligibility,
  loadIntentExecutorRegistry,
  normalizeIntentExecutorRegistry,
  normalizeIntentExecutionHandoff
} from '../src/lib/intent-execution-eligibility.mjs';
import { validateIntentExecutionHandoffAgainstEligibility } from '../src/lib/intent-execution-handoff-validation.mjs';
import { buildIntentRemediationProposal } from '../src/lib/intent-remediation.mjs';

const policy = JSON.parse(await readFile(new URL('../config/policy.json', import.meta.url), 'utf8'));
const capabilities = JSON.parse(await readFile(new URL('../config/capabilities.json', import.meta.url), 'utf8'));
const emptyRegistry = await loadIntentExecutorRegistry(
  new URL('../config/intent-remediation-executors.json', import.meta.url)
);

function governanceState() {
  return {
    schema: 'axiom-intent-governance-state.v1',
    contract_id: 'intent-execution-eligibility-test',
    activation_digest: sha256('activation'),
    contract_digest: sha256('contract'),
    graph_digest: sha256('graph'),
    build: {
      build_digest: sha256('build')
    },
    assessment: {
      source_assessment_digest: sha256('assessment'),
      evaluated_at: '2026-08-10T20:00:00.000Z'
    },
    reconciliation: {
      state: 'blocked',
      reconciliation_digest: sha256('reconciliation'),
      violations: ['INV-EXECUTION'],
      unknowns: [],
      proposed_actions: [
        {
          action: 'repo.tests.add',
          decision: 'autonomous',
          reason: 'Tests are required by the fixture.',
          triggered_by: ['INV-EXECUTION']
        },
        {
          action: 'test.high.governance',
          decision: 'approval_required',
          reason: 'High-risk mapping fixture.',
          triggered_by: ['INV-EXECUTION']
        },
        {
          action: 'tests.weaken-for-pass',
          decision: 'deny',
          reason: 'Weakening tests is forbidden.',
          triggered_by: ['INV-EXECUTION']
        }
      ]
    },
    execution_authorized: false
  };
}

function remediationFixture() {
  return buildIntentRemediationProposal(governanceState(), {
    creator: 'intent-operator',
    created_at: '2026-08-10T20:00:01.000Z',
    expires_at: '2026-08-11T20:00:01.000Z'
  });
}

function remediationState(remediation, overrides = {}) {
  return {
    schema: 'axiom-intent-remediation-governance-state.v1',
    remediation_proposal_id: remediation.remediation_proposal_id,
    remediation_proposal_digest: remediation.remediation_proposal_digest,
    basis_digest: remediation.basis_digest,
    contract_id: remediation.contract_id,
    activation_digest: remediation.activation_digest,
    source_assessment_digest: remediation.source_assessment_digest,
    source_reconciliation_digest: remediation.source_reconciliation_digest,
    reconciliation_state: remediation.reconciliation_state,
    action_counts: {
      autonomous: remediation.actions.filter(item => item.decision === 'autonomous').length,
      approval_required: remediation.actions.filter(item => item.decision === 'approval_required').length,
      deny: remediation.actions.filter(item => item.decision === 'deny').length
    },
    governance_status: 'active',
    current: true,
    current_reason: 'matches_current_authenticated_intent_state',
    execution_authorized: false,
    ...overrides
  };
}

function registry(mappings) {
  return {
    schema: 'axiom-intent-remediation-executor-registry.v1',
    kernel_version: '0.12.0-dev.3',
    mappings
  };
}

function safeEchoMapping(overrides = {}) {
  return {
    semantic_action: 'repo.tests.add',
    target_action: 'system.echo',
    capability_id: 'core.intent-loop',
    tool: 'builtin.echo',
    fixed_input: { value: 'intent-v0.6-safe-fixture' },
    constraints: { conformance_only: true },
    ...overrides
  };
}

function evaluate({
  remediation = remediationFixture(),
  state,
  semanticAction = 'repo.tests.add',
  executorRegistry = emptyRegistry,
  policySurface = policy,
  capabilitySurface = capabilities,
  principal = { id: 'intent-operator', scopes: ['*'] }
} = {}) {
  return evaluateIntentExecutionEligibility({
    remediation,
    remediation_state: state ?? remediationState(remediation),
    semantic_action: semanticAction,
    executor_registry: executorRegistry,
    policy: policySurface,
    capabilities: capabilitySurface,
    principal
  });
}

test('production executor registry is empty and repository remediation fails closed', () => {
  assert.equal(emptyRegistry.mappings.length, 0);
  assert.match(emptyRegistry.registry_digest, /^[a-f0-9]{64}$/);

  const result = evaluate();
  assert.equal(result.schema, INTENT_EXECUTION_ELIGIBILITY_SCHEMA);
  assert.equal(result.decision, 'ineligible');
  assert.equal(result.reason, 'executor_unavailable');
  assert.equal(result.execution_authorized, false);
  assert.equal(result.mapped_executor, null);
  assert.throws(() => buildIntentExecutionHandoff(result), /requires an eligible result/);
});

test('wildcard and duplicate executor mappings are rejected', () => {
  assert.throws(() => normalizeIntentExecutorRegistry(registry([
    safeEchoMapping({ semantic_action: 'repo.*' })
  ])));
  assert.throws(() => normalizeIntentExecutorRegistry(registry([
    safeEchoMapping(),
    safeEchoMapping({ fixed_input: { value: 'different' } })
  ])), /must be unique/);
});

test('contract deny dominates even a malicious otherwise-valid executor mapping', () => {
  const result = evaluate({
    semanticAction: 'tests.weaken-for-pass',
    executorRegistry: registry([
      safeEchoMapping({ semantic_action: 'tests.weaken-for-pass' })
    ])
  });
  assert.equal(result.decision, 'ineligible');
  assert.equal(result.reason, 'contract_denied');
  assert.equal(result.mapped_executor, null);
  assert.equal(result.execution_authorized, false);
});

test('explicit safe mapping can become a deterministic non-executing handoff', () => {
  const executorRegistry = registry([safeEchoMapping()]);
  const first = evaluate({ executorRegistry });
  const second = evaluate({ executorRegistry });
  assert.deepEqual(first, second);
  assert.equal(first.decision, 'eligible');
  assert.equal(first.reason, 'eligible_for_bounded_handoff');
  assert.equal(first.required_gates.risk, 'low');
  assert.deepEqual(first.required_gates.required_scopes, ['intent:execute']);
  assert.equal(first.execution_authorized, false);

  const handoffA = buildIntentExecutionHandoff(first);
  const handoffB = buildIntentExecutionHandoff(second);
  assert.deepEqual(handoffA, handoffB);
  assert.equal(handoffA.schema, INTENT_EXECUTION_HANDOFF_SCHEMA);
  assert.equal(handoffA.target.action, 'system.echo');
  assert.equal(handoffA.target.tool, 'builtin.echo');
  assert.equal(handoffA.execution_authorized, false);
  assert.match(handoffA.handoff_id, /^intent-handoff:[a-f0-9]{64}$/);
  assert.deepEqual(normalizeIntentExecutionHandoff(handoffA), handoffA);
  assert.deepEqual(validateIntentExecutionHandoffAgainstEligibility(handoffA, first), handoffA);
});

test('unresolved executor input remains unknown and cannot produce a handoff', () => {
  const result = evaluate({
    executorRegistry: registry([
      safeEchoMapping({ fixed_input: null })
    ])
  });
  assert.equal(result.decision, 'unknown');
  assert.equal(result.reason, 'executor_input_unresolved');
  assert.equal(result.execution_authorized, false);
  assert.throws(() => buildIntentExecutionHandoff(result), /requires an eligible result/);
});

test('policy denial dominates Intent autonomous classification', () => {
  const deniedPolicy = structuredClone(policy);
  deniedPolicy.actions['system.echo'].decision = 'deny';
  deniedPolicy.actions['system.echo'].reason = 'Emergency conformance denial.';
  const result = evaluate({
    executorRegistry: registry([safeEchoMapping()]),
    policySurface: deniedPolicy
  });
  assert.equal(result.decision, 'ineligible');
  assert.equal(result.reason, 'policy_denied');
  assert.equal(result.execution_authorized, false);
});

test('missing capability, unknown policy target, and missing scope are ineligible', () => {
  const unavailableCapabilities = structuredClone(capabilities);
  unavailableCapabilities.capabilities.find(item => item.id === 'core.intent-loop').status = 'disabled';
  let result = evaluate({
    executorRegistry: registry([safeEchoMapping()]),
    capabilitySurface: unavailableCapabilities
  });
  assert.equal(result.reason, 'capability_unavailable');

  result = evaluate({
    executorRegistry: registry([
      safeEchoMapping({ target_action: 'missing.action' })
    ])
  });
  assert.equal(result.reason, 'executor_policy_action_unavailable');

  result = evaluate({
    executorRegistry: registry([safeEchoMapping()]),
    principal: { id: 'intent-operator', scopes: [] }
  });
  assert.equal(result.reason, 'insufficient_scope');
  assert.deepEqual(result.required_gates.missing_scopes, ['intent:execute']);
});

test('high-risk mappings preserve confirmation and independent approval gates', () => {
  const result = evaluate({
    semanticAction: 'test.high.governance',
    executorRegistry: registry([{
      semantic_action: 'test.high.governance',
      target_action: 'governance.propose',
      capability_id: 'governance.local-records',
      tool: 'builtin.validate-mutation',
      fixed_input: {
        title: 'Conformance-only future proposal',
        body: 'This is never submitted by the v0.6 test.',
        action: { type: 'record.decision', payload: { test: true } },
        voting_ends_at: '2026-08-10T21:00:00.000Z',
        activate_after: '2026-08-10T22:00:00.000Z'
      },
      constraints: { conformance_only: true }
    }],
    principal: { id: 'intent-operator', scopes: ['governance:write'] }
  });
  assert.equal(result.decision, 'eligible');
  assert.equal(result.required_gates.risk, 'high');
  assert.equal(result.required_gates.required_confirmations, 1);
  assert.deepEqual(result.required_gates.required_confirmation_values, ['confirm:governance.propose']);
  assert.equal(result.required_gates.requires_independent_approval, true);

  const handoff = buildIntentExecutionHandoff(result);
  assert.equal(handoff.execution_authorized, false);
  assert.equal(handoff.required_gates.requires_independent_approval, true);
  assert.deepEqual(handoff.required_gates.required_confirmation_values, ['confirm:governance.propose']);
  assert.ok(!('approval_ids' in handoff));
  assert.ok(!('confirmations' in handoff));
});

test('registry mutation and stale remediation invalidate an existing handoff', () => {
  const remediation = remediationFixture();
  const originalRegistry = registry([safeEchoMapping()]);
  const original = evaluate({ remediation, executorRegistry: originalRegistry });
  const handoff = buildIntentExecutionHandoff(original);

  const mutated = evaluate({
    remediation,
    executorRegistry: registry([
      safeEchoMapping({ constraints: { conformance_only: true, generation: 2 } })
    ])
  });
  assert.equal(mutated.decision, 'eligible');
  assert.notEqual(mutated.executor_registry_digest, original.executor_registry_digest);
  assert.notEqual(mutated.eligibility_digest, original.eligibility_digest);
  assert.throws(
    () => validateIntentExecutionHandoffAgainstEligibility(handoff, mutated),
    /different eligibility result/
  );

  const stale = evaluate({
    remediation,
    state: remediationState(remediation, {
      current: false,
      current_reason: 'source_assessment_changed'
    }),
    executorRegistry: originalRegistry
  });
  assert.equal(stale.decision, 'ineligible');
  assert.equal(stale.reason, 'stale_remediation');
  assert.throws(
    () => validateIntentExecutionHandoffAgainstEligibility(handoff, stale),
    /no longer eligible/
  );
});

test('action not present in the ratified remediation cannot be introduced by registry mapping', () => {
  const result = evaluate({
    semanticAction: 'repo.code.modify',
    executorRegistry: registry([{
      semantic_action: 'repo.code.modify',
      target_action: 'system.echo',
      capability_id: 'core.intent-loop',
      tool: 'builtin.echo',
      fixed_input: { value: 'should-never-be-used' },
      constraints: {}
    }])
  });
  assert.equal(result.decision, 'ineligible');
  assert.equal(result.reason, 'action_not_ratified');
  assert.equal(result.execution_authorized, false);
});
