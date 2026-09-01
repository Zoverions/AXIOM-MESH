import assert from 'node:assert/strict';
import test from 'node:test';
import { createAdaptiveAssuranceEvaluator } from '../src/lib/adaptive-assurance.mjs';
import { VERIFIER_PROFILE_SCHEMA } from '../src/lib/verifier-independence.mjs';
import { compileAssuranceWorkOrder } from '../src/lib/assurance-work-order.mjs';

const D = value => value.repeat(64);

function adaptiveDecision() {
  const evaluator = createAdaptiveAssuranceEvaluator({ randomIntFn: () => 9_999 });
  return evaluator({
    schema: 'axiom-adaptive-assurance-input.v1',
    task_id: 'task.work-order',
    risk_class: 'high',
    signals: {
      consequence: 90,
      uncertainty: 80,
      irreversibility: 90,
      authority_exposure: 90,
      anomaly: 60,
      provenance_weakness: 70,
      correlation_risk: 80,
      context_integrity_risk: 70
    },
    reputation_score: 50,
    reputation_confidence: 0
  });
}

function profile(id, variant) {
  return {
    schema: VERIFIER_PROFILE_SCHEMA,
    verifier_id: id,
    context_digest: D(variant),
    evidence_set_digest: D(String.fromCharCode(variant.charCodeAt(0) + 1)),
    method_id: `method.${id}`,
    runtime_id: `runtime.${id}`,
    model_family: `family.${id}`,
    operator_domain: `operator.${id}`
  };
}

function costs() {
  return {
    'independent-context-verification': {
      compute_units: 10,
      external_cost_units: 1,
      elapsed_ms: 100
    },
    'adversarial-review': {
      compute_units: 20,
      external_cost_units: 2,
      elapsed_ms: 150
    },
    'provenance-review': {
      compute_units: 15,
      external_cost_units: 1,
      elapsed_ms: 120
    },
    'correlation-aware-cross-check': {
      compute_units: 10,
      external_cost_units: 1,
      elapsed_ms: 100
    },
    'stochastic-supplemental-audit': {
      compute_units: 25,
      external_cost_units: 2,
      elapsed_ms: 200
    }
  };
}

test('work order assigns required machine checks to meaningfully independent verifiers', () => {
  const result = compileAssuranceWorkOrder({
    decision: adaptiveDecision(),
    originVerifierProfile: profile('verifier.origin', 'a'),
    verifierCandidates: [
      profile('verifier.one', 'c'),
      profile('verifier.two', 'e'),
      profile('verifier.three', 'g'),
      profile('verifier.four', 'i')
    ],
    checkCosts: costs(),
    budgetLimits: {
      maxChecks: 8,
      maxComputeUnits: 100,
      maxExternalCostUnits: 20,
      maxElapsedMs: 2_000
    },
    randomIntFn: () => 0
  });
  assert.equal(result.authority_effect, 'none');
  assert.equal(result.execution_effect, 'none');
  assert.ok(result.assignments.length >= 4);
  assert.ok(result.external_obligations.includes('normal-policy-and-authority-path'));
  assert.match(result.work_order_digest, /^[a-f0-9]{64}$/);
});

test('work order prefers verifier diversity before reusing a verifier', () => {
  const result = compileAssuranceWorkOrder({
    decision: adaptiveDecision(),
    originVerifierProfile: profile('verifier.origin', 'a'),
    verifierCandidates: [
      profile('verifier.one', 'c'),
      profile('verifier.two', 'e'),
      profile('verifier.three', 'g'),
      profile('verifier.four', 'i')
    ],
    checkCosts: costs(),
    budgetLimits: {
      maxChecks: 8,
      maxComputeUnits: 100,
      maxExternalCostUnits: 20,
      maxElapsedMs: 2_000
    },
    randomIntFn: () => 0
  });
  const firstFour = result.assignments.slice(0, 4).map(item => item.verifier_id);
  assert.equal(new Set(firstFour).size, firstFour.length);
});

test('correlated candidate replicas cannot satisfy machine verification', () => {
  const origin = profile('verifier.origin', 'a');
  const correlated = {
    ...origin,
    verifier_id: 'verifier.replica',
    runtime_id: 'runtime.replica'
  };
  assert.throws(
    () => compileAssuranceWorkOrder({
      decision: adaptiveDecision(),
      originVerifierProfile: origin,
      verifierCandidates: [correlated],
      checkCosts: costs(),
      budgetLimits: {
        maxChecks: 8,
        maxComputeUnits: 100,
        maxExternalCostUnits: 20,
        maxElapsedMs: 2_000
      },
      randomIntFn: () => 0
    }),
    /no meaningfully independent verifier/
  );
});

test('work order fails before scheduling when assurance budget is insufficient', () => {
  assert.throws(
    () => compileAssuranceWorkOrder({
      decision: adaptiveDecision(),
      originVerifierProfile: profile('verifier.origin', 'a'),
      verifierCandidates: [
        profile('verifier.one', 'c'),
        profile('verifier.two', 'e'),
        profile('verifier.three', 'g'),
        profile('verifier.four', 'i')
      ],
      checkCosts: costs(),
      budgetLimits: {
        maxChecks: 2,
        maxComputeUnits: 30,
        maxExternalCostUnits: 5,
        maxElapsedMs: 500
      },
      randomIntFn: () => 0
    }),
    error => error.code === 'assurance_work_budget_exceeded'
  );
});

test('work order is stochastic across eligible verifier candidates without exposing a random sample', () => {
  const args = {
    decision: adaptiveDecision(),
    originVerifierProfile: profile('verifier.origin', 'a'),
    verifierCandidates: [
      profile('verifier.one', 'c'),
      profile('verifier.two', 'e')
    ],
    checkCosts: costs(),
    budgetLimits: {
      maxChecks: 8,
      maxComputeUnits: 100,
      maxExternalCostUnits: 20,
      maxElapsedMs: 2_000
    }
  };
  const first = compileAssuranceWorkOrder({ ...args, randomIntFn: () => 0 });
  const second = compileAssuranceWorkOrder({
    ...args,
    randomIntFn: (min, max) => max - 1
  });
  assert.notEqual(first.assignments[0].verifier_id, second.assignments[0].verifier_id);
  assert.equal(JSON.stringify(first).includes('sample'), false);
});
