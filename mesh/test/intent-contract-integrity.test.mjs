import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  INTENT_CONTRACT_SCHEMA,
  assessIntentGraph,
  compileIntentContract,
  reconcileIntentGraph
} from '../src/lib/intent-contract.mjs';

function sharedRemediationContract() {
  return {
    schema: INTENT_CONTRACT_SCHEMA,
    contract_id: 'shared-remediation',
    title: 'Shared remediation fixture',
    mission: 'Preserve provenance when one remediation serves several requirements.',
    objectives: [
      {
        id: 'OBJ-TESTS',
        statement: 'Tests pass.',
        verification: {
          classification: 'deterministic',
          method: 'Run tests.',
          evidence_required: ['test result']
        },
        remediation_actions: ['repo.tests.add']
      }
    ],
    invariants: [
      {
        id: 'INV-SAFETY',
        statement: 'Safety checks pass.',
        severity: 'critical',
        verification: {
          classification: 'deterministic',
          method: 'Run safety checks.',
          evidence_required: ['safety result']
        },
        remediation_actions: ['repo.tests.add']
      }
    ],
    authority: {
      autonomous: ['repo.tests.add'],
      approval_required: [],
      forbidden: []
    },
    evidence: {
      default_minimum_independent_verifiers: 1
    },
    optimization: {
      priority: ['correctness', 'security', 'cost']
    }
  };
}

test('dogfooded AXIOM-MESH intent contract compiles without unknown verification methods', async () => {
  const contract = JSON.parse(await readFile(
    new URL('../intent/axiom-mesh.intent.json', import.meta.url),
    'utf8'
  ));
  const graph = compileIntentContract(contract);
  assert.equal(graph.contract_id, 'axiom-mesh-core');
  assert.deepEqual(graph.unknown_requirements, []);
  assert.deepEqual(graph.optimization.priority, [
    'correctness',
    'security',
    'verifiability',
    'compatibility',
    'maintainability',
    'performance',
    'cost'
  ]);
});

test('assessment rejects a graph whose content no longer matches its digest', () => {
  const graph = compileIntentContract(sharedRemediationContract());
  assert.throws(
    () => assessIntentGraph({ ...graph, mission: 'tampered mission' }, []),
    /graph digest mismatch/
  );
});

test('required evidence references cannot be omitted from a claimed pass', () => {
  const graph = compileIntentContract(sharedRemediationContract());
  const assessment = assessIntentGraph(graph, [
    {
      requirement_id: 'INV-SAFETY',
      status: 'pass',
      evidence_refs: [],
      independent_verifiers: 1
    },
    {
      requirement_id: 'OBJ-TESTS',
      status: 'pass',
      evidence_refs: ['evidence://tests'],
      independent_verifiers: 1
    }
  ]);
  const invariant = assessment.requirements.find(item => item.requirement_id === 'INV-SAFETY');
  assert.equal(invariant.status, 'unknown');
  assert.equal(invariant.reason, 'missing_evidence_refs');
});

test('shared remediation retains every requirement that triggered it', () => {
  const graph = compileIntentContract(sharedRemediationContract());
  const reconciliation = reconcileIntentGraph(graph, [
    {
      requirement_id: 'INV-SAFETY',
      status: 'fail',
      evidence_refs: ['evidence://safety-failure'],
      independent_verifiers: 1
    },
    {
      requirement_id: 'OBJ-TESTS',
      status: 'fail',
      evidence_refs: ['evidence://test-failure'],
      independent_verifiers: 1
    }
  ]);
  const action = reconciliation.proposed_actions.find(item => item.action === 'repo.tests.add');
  assert.equal(reconciliation.state, 'blocked');
  assert.deepEqual(action.triggered_by, ['INV-SAFETY', 'OBJ-TESTS']);
});
