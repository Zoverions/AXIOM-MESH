import assert from 'node:assert/strict';
import test from 'node:test';
import {
  INTENT_CONTRACT_SCHEMA,
  INTENT_GRAPH_SCHEMA,
  assessIntentGraph,
  classifyIntentAuthority,
  compileIntentContract,
  reconcileIntentGraph
} from '../src/lib/intent-contract.mjs';
import { runIntentCtl } from '../src/intentctl.mjs';

function contractFixture({ unknownInvariant = false } = {}) {
  return {
    schema: INTENT_CONTRACT_SCHEMA,
    contract_id: 'fixture-core',
    title: 'Fixture Intent',
    mission: 'Keep the fixture correct, safe, and evidence-bound.',
    objectives: [
      {
        id: 'OBJ-HEALTHY',
        statement: 'The supported verification suite passes.',
        priority: 100,
        verification: {
          classification: 'deterministic',
          method: 'Run the supported verification suite.',
          evidence_required: ['test result']
        },
        remediation_actions: ['repo.tests.add']
      }
    ],
    invariants: [
      {
        id: 'INV-SAFETY',
        statement: 'Safety authority may never be weakened.',
        severity: 'critical',
        verification: {
          classification: unknownInvariant ? 'unknown' : 'deterministic',
          method: unknownInvariant ? 'unspecified' : 'Run authority denial tests.',
          evidence_required: unknownInvariant ? [] : ['denial test result']
        },
        remediation_actions: ['repo.code.modify']
      }
    ],
    authority: {
      autonomous: ['repo.*'],
      approval_required: ['repo.release.publish'],
      forbidden: ['repo.safety.weaken']
    },
    evidence: {
      default_minimum_independent_verifiers: 1
    },
    optimization: {
      priority: ['correctness', 'security', 'maintainability']
    }
  };
}

function passingObservations() {
  return [
    {
      requirement_id: 'INV-SAFETY',
      status: 'pass',
      evidence_refs: ['evidence://safety'],
      independent_verifiers: 1
    },
    {
      requirement_id: 'OBJ-HEALTHY',
      status: 'pass',
      evidence_refs: ['evidence://tests'],
      independent_verifiers: 1
    }
  ];
}

test('Intent Contract compiles deterministically into a digest-bound graph', () => {
  const first = compileIntentContract(contractFixture());
  const reordered = contractFixture();
  reordered.objectives = [...reordered.objectives].reverse();
  reordered.invariants = [...reordered.invariants].reverse();
  reordered.authority.autonomous = [...reordered.authority.autonomous].reverse();
  const second = compileIntentContract(reordered);
  assert.equal(first.schema, INTENT_GRAPH_SCHEMA);
  assert.equal(first.contract_digest, second.contract_digest);
  assert.equal(first.graph_digest, second.graph_digest);
  assert.deepEqual(first.unknown_requirements, []);
});

test('unknown verification remains unknown and blocks a critical invariant', () => {
  const graph = compileIntentContract(contractFixture({ unknownInvariant: true }));
  const observations = passingObservations();
  const assessment = assessIntentGraph(graph, observations);
  const invariant = assessment.requirements.find(item => item.requirement_id === 'INV-SAFETY');
  assert.equal(invariant.status, 'unknown');
  assert.equal(invariant.reason, 'verification_method_unknown');
  const reconciliation = reconcileIntentGraph(graph, observations);
  assert.equal(reconciliation.state, 'blocked');
  assert.deepEqual(reconciliation.unknowns, ['INV-SAFETY']);
});

test('insufficient independent verification cannot be converted into a pass', () => {
  const graph = compileIntentContract(contractFixture());
  const observations = passingObservations();
  observations[0].independent_verifiers = 0;
  const assessment = assessIntentGraph(graph, observations);
  const invariant = assessment.requirements.find(item => item.requirement_id === 'INV-SAFETY');
  assert.equal(invariant.status, 'unknown');
  assert.equal(invariant.reason, 'insufficient_independent_verification');
});

test('authority classification is deny-dominant and fails closed for unclassified actions', () => {
  const graph = compileIntentContract(contractFixture());
  assert.deepEqual(classifyIntentAuthority(graph, 'repo.code.modify'), {
    action: 'repo.code.modify',
    decision: 'autonomous',
    reason: 'autonomous'
  });
  assert.deepEqual(classifyIntentAuthority(graph, 'repo.release.publish'), {
    action: 'repo.release.publish',
    decision: 'approval_required',
    reason: 'approval_required'
  });
  assert.deepEqual(classifyIntentAuthority(graph, 'repo.safety.weaken'), {
    action: 'repo.safety.weaken',
    decision: 'deny',
    reason: 'forbidden'
  });
  assert.deepEqual(classifyIntentAuthority(graph, 'system.unclassified'), {
    action: 'system.unclassified',
    decision: 'deny',
    reason: 'unclassified_action'
  });
});

test('fully evidenced requirements converge and expose no remediation work', () => {
  const graph = compileIntentContract(contractFixture());
  const reconciliation = reconcileIntentGraph(graph, passingObservations());
  assert.equal(reconciliation.state, 'converged');
  assert.deepEqual(reconciliation.violations, []);
  assert.deepEqual(reconciliation.unknowns, []);
  assert.deepEqual(reconciliation.proposed_actions, []);
});

test('failed requirements produce authority-classified remediation without execution', () => {
  const graph = compileIntentContract(contractFixture());
  const observations = passingObservations();
  observations[1].status = 'fail';
  const reconciliation = reconcileIntentGraph(graph, observations);
  assert.equal(reconciliation.state, 'attention_required');
  assert.deepEqual(reconciliation.violations, ['OBJ-HEALTHY']);
  assert.deepEqual(reconciliation.automatic_remediation_actions, ['repo.tests.add']);
  assert.deepEqual(reconciliation.approval_required_actions, []);
  assert.deepEqual(reconciliation.denied_actions, []);
});

test('local AXIOM Intent CLI compiles without Gateway credentials or network access', async () => {
  const files = new Map([
    ['contract.json', JSON.stringify(contractFixture())]
  ]);
  const result = await runIntentCtl(['compile', 'contract.json'], {
    readFileImpl: async path => {
      if (!files.has(path)) throw new Error('not found');
      return files.get(path);
    }
  });
  assert.equal(result.schema, INTENT_GRAPH_SCHEMA);
  assert.equal(result.contract_id, 'fixture-core');
});
