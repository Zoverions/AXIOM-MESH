import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { sha256 } from '../src/lib/canonical.mjs';
import {
  buildIntentActivationRecord,
  deriveIntentGridAssessment
} from '../src/lib/intent-grid-evidence.mjs';

function zeroVerifierContract() {
  return {
    schema: 'axiom-intent-contract.v1',
    contract_id: 'zero-verifier-fixture',
    title: 'Zero Verifier Fixture',
    mission: 'Prove that Grid-authenticated success can never arise from zero attestations.',
    objectives: [],
    invariants: [{
      id: 'INV-ZERO',
      statement: 'This requirement still needs an authenticated verifier.',
      severity: 'critical',
      verification: {
        classification: 'deterministic',
        method: 'Verify the exact artifact.',
        evidence_required: [],
        minimum_independent_verifiers: 0
      },
      remediation_actions: []
    }],
    authority: {
      autonomous: [],
      approval_required: [],
      forbidden: []
    },
    evidence: {
      default_minimum_independent_verifiers: 0
    },
    optimization: {
      priority: ['correctness']
    }
  };
}

test('Grid-authenticated assessment requires at least one verifier even when local threshold is zero', () => {
  const activation = buildIntentActivationRecord(zeroVerifierContract(), {
    kernel_version: '0.12.0-dev.3',
    source_digest: sha256('zero-verifier-source')
  });
  const derived = deriveIntentGridAssessment(activation, []);
  const result = derived.assessment.requirements[0];
  assert.equal(result.configured_independent_verifiers, 0);
  assert.equal(result.required_independent_verifiers, 1);
  assert.equal(result.status, 'unknown');
  assert.equal(result.reason, 'insufficient_independent_verifiers');
  assert.equal(derived.reconciliation.state, 'blocked');
});

test('equivalent contract ordering produces one activation digest', () => {
  const left = zeroVerifierContract();
  left.invariants.push({
    id: 'INV-SECOND',
    statement: 'Second invariant.',
    severity: 'high',
    verification: {
      classification: 'deterministic',
      method: 'Verify second invariant.',
      evidence_required: [],
      minimum_independent_verifiers: 1
    },
    remediation_actions: []
  });
  left.authority.forbidden = ['policy.safety.weaken', 'authority.self-expand'];
  const right = structuredClone(left);
  right.invariants.reverse();
  right.authority.forbidden.reverse();
  const build = {
    kernel_version: '0.12.0-dev.3',
    source_digest: sha256('ordered-source')
  };
  const first = buildIntentActivationRecord(left, build);
  const second = buildIntentActivationRecord(right, build);
  assert.equal(first.contract_digest, second.contract_digest);
  assert.equal(first.graph_digest, second.graph_digest);
  assert.equal(first.activation_digest, second.activation_digest);
});

test('existing governance policy keeps Intent activation behind confirmation and independent approval', async () => {
  const policy = JSON.parse(await readFile(
    new URL('../config/policy.json', import.meta.url),
    'utf8'
  ));
  for (const actionName of ['governance.propose', 'governance.activate']) {
    const action = policy.actions[actionName];
    assert.equal(action.decision, 'allow');
    assert.equal(action.risk, 'high');
    assert.equal(action.requires_independent_approval, true);
    assert.equal(action.required_confirmations, 1);
    assert.equal(action.tool, 'builtin.validate-mutation');
  }
  assert.equal(policy.actions['memory.put'].tool, 'builtin.validate-mutation');
});
