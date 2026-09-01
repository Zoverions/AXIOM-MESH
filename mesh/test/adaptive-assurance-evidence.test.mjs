import assert from 'node:assert/strict';
import test from 'node:test';
import {
  VERIFIER_PROFILE_SCHEMA,
  evaluateVerifierIndependence
} from '../src/lib/verifier-independence.mjs';
import {
  ASSURANCE_CHECK_RECEIPT_SCHEMA,
  evaluateAssuranceCompletion,
  normalizeAssuranceCheckReceipt
} from '../src/lib/assurance-check-receipt.mjs';
import { AssuranceWorkBudget } from '../src/lib/assurance-work-budget.mjs';

const D = char => char.repeat(64);

function profile(overrides = {}) {
  return {
    schema: VERIFIER_PROFILE_SCHEMA,
    verifier_id: 'verifier.alpha',
    context_digest: D('a'),
    evidence_set_digest: D('b'),
    method_id: 'method.adversarial',
    runtime_id: 'runtime.alpha',
    model_family: 'family.alpha',
    operator_domain: 'operator.local',
    ...overrides
  };
}

test('meaningful verifier independence requires more than a second vote', () => {
  const result = evaluateVerifierIndependence(
    profile(),
    profile({
      verifier_id: 'verifier.beta',
      context_digest: D('c'),
      evidence_set_digest: D('d'),
      method_id: 'method.reconstruct',
      runtime_id: 'runtime.beta',
      model_family: 'family.beta'
    })
  );
  assert.equal(result.meaningful_independence, true);
  assert.equal(result.authority_effect, 'none');
  assert.ok(result.differing_dimensions.includes('context_digest'));
  assert.ok(result.differing_dimensions.includes('evidence_set_digest'));
});

test('correlated replicas are not misclassified as independent', () => {
  const result = evaluateVerifierIndependence(
    profile(),
    profile({
      verifier_id: 'verifier.replica',
      runtime_id: 'runtime.replica'
    })
  );
  assert.equal(result.meaningful_independence, false);
  assert.equal(result.independent_context, false);
  assert.equal(result.independent_evidence, false);
});

test('assurance receipts bind task, decision, verifier, artifacts, and result', () => {
  const receipt = normalizeAssuranceCheckReceipt({
    schema: ASSURANCE_CHECK_RECEIPT_SCHEMA,
    check_id: 'independent-context-verification',
    task_id: 'task.example',
    assurance_decision_digest: D('a'),
    verifier_profile_digest: D('b'),
    independence_digest: D('c'),
    result: 'pass',
    started_at: '2026-09-01T12:00:00.000Z',
    completed_at: '2026-09-01T12:00:01.000Z',
    artifact_digests: [D('d')]
  });
  assert.equal(receipt.authority_effect, 'none');
  assert.match(receipt.receipt_digest, /^[a-f0-9]{64}$/);
});

test('assurance completion fails closed on missing, failed, or inconclusive checks', () => {
  const common = {
    schema: ASSURANCE_CHECK_RECEIPT_SCHEMA,
    task_id: 'task.example',
    assurance_decision_digest: D('a'),
    verifier_profile_digest: D('b'),
    independence_digest: null,
    started_at: '2026-09-01T12:00:00.000Z',
    completed_at: '2026-09-01T12:00:01.000Z',
    artifact_digests: []
  };
  const pass = {
    ...common,
    check_id: 'provenance-review',
    result: 'pass'
  };
  const incomplete = evaluateAssuranceCompletion({
    taskId: 'task.example',
    assuranceDecisionDigest: D('a'),
    requiredChecks: ['provenance-review', 'adversarial-review'],
    receipts: [pass]
  });
  assert.equal(incomplete.satisfied, false);
  assert.deepEqual(incomplete.missing_checks, ['adversarial-review']);

  const failed = evaluateAssuranceCompletion({
    taskId: 'task.example',
    assuranceDecisionDigest: D('a'),
    requiredChecks: ['provenance-review', 'adversarial-review'],
    receipts: [
      pass,
      { ...common, check_id: 'adversarial-review', result: 'fail' }
    ]
  });
  assert.equal(failed.satisfied, false);
  assert.deepEqual(failed.failed_checks, ['adversarial-review']);
});

test('assurance work budget prevents recursive verification growth', () => {
  const budget = new AssuranceWorkBudget({
    maxChecks: 2,
    maxComputeUnits: 100,
    maxExternalCostUnits: 20,
    maxElapsedMs: 1_000
  });
  budget.consume({ checks: 1, computeUnits: 40, externalCostUnits: 5, elapsedMs: 200 });
  budget.consume({ checks: 1, computeUnits: 50, externalCostUnits: 5, elapsedMs: 300 });
  assert.throws(
    () => budget.consume({ checks: 1 }),
    error => error.code === 'assurance_work_budget_exceeded'
  );
  assert.equal(budget.snapshot().authority_effect, 'none');
});

test('assurance work budget rejects invalid or negative accounting', () => {
  assert.throws(
    () => new AssuranceWorkBudget({ maxChecks: 0 }),
    /maxChecks/
  );
  const budget = new AssuranceWorkBudget();
  assert.throws(
    () => budget.consume({ computeUnits: -1 }),
    /computeUnits/
  );
});
