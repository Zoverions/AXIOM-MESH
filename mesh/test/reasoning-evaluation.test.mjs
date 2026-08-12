import assert from 'node:assert/strict';
import test from 'node:test';
import {
  scoreReasoningEvaluationRun,
  validateReasoningEvaluationSuite
} from '../src/lib/reasoning-evaluation.mjs';
import { digestObject } from '../src/lib/canonical.mjs';

const SHA_A = 'a'.repeat(64);
const SHA_B = 'b'.repeat(64);
const SHA_C = 'c'.repeat(64);
const SHA_D = 'd'.repeat(64);
const SHA_E = 'e'.repeat(64);

function fixtureSuite() {
  return {
    schema: 'axiom-reasoning-evaluation-suite.v1',
    suite_id: 'logic.transitivity.synthetic',
    suite_version: '1.0.0',
    task_class: 'logical-inference',
    claim_boundary: 'evaluation-only',
    cases: [
      {
        case_id: 'transitive-001',
        canonical: {
          item_id: 'transitive-001.canonical',
          prompt_sha256: SHA_A,
          expected_answer: 'yes'
        },
        perturbations: [
          {
            item_id: 'transitive-001.load-bearing',
            kind: 'load-bearing',
            prompt_sha256: SHA_B,
            expected_answer: 'no'
          },
          {
            item_id: 'transitive-001.irrelevant',
            kind: 'irrelevant',
            prompt_sha256: SHA_C,
            expected_answer: 'yes'
          }
        ]
      }
    ]
  };
}

function fixtureRun(suite, answers, overrides = {}) {
  return {
    schema: 'axiom-reasoning-evaluation-run.v1',
    suite_digest: digestObject(suite),
    subject: {
      model_id: 'synthetic.reasoner',
      model_version: '1.0.0',
      artifact_sha256: SHA_D,
      runtime_id: 'synthetic.runtime',
      runtime_sha256: SHA_E
    },
    inference: {
      samples_per_item: 1,
      selection_method: 'single',
      temperature: 0,
      maximum_reasoning_steps: 32
    },
    compute: {
      model_calls: 3,
      input_units: 300,
      output_units: 30,
      wall_ms: 120
    },
    observations: [
      {
        item_id: 'transitive-001.canonical',
        answer: answers.canonical
      },
      {
        item_id: 'transitive-001.load-bearing',
        answer: answers.loadBearing
      },
      {
        item_id: 'transitive-001.irrelevant',
        answer: answers.irrelevant
      }
    ],
    ...overrides
  };
}

test('reasoning evaluation validates causal sensitivity and invariance pairs', () => {
  const suite = fixtureSuite();
  const validation = validateReasoningEvaluationSuite(suite);
  assert.equal(validation.valid, true);
  assert.equal(validation.items, 3);
  assert.equal(validation.load_bearing_pairs, 1);
  assert.equal(validation.irrelevant_pairs, 1);
  assert.equal(validation.digest, digestObject(suite));
});

test('reasoning evaluation reports joint correctness, sensitivity, invariance, and compute', () => {
  const suite = fixtureSuite();
  const report = scoreReasoningEvaluationRun(
    suite,
    fixtureRun(suite, {
      canonical: 'yes',
      loadBearing: 'no',
      irrelevant: 'yes'
    })
  );

  assert.equal(report.metrics.item_accuracy, 1);
  assert.equal(report.metrics.paired_joint_accuracy, 1);
  assert.equal(report.metrics.load_bearing_sensitivity, 1);
  assert.equal(report.metrics.irrelevant_invariance, 1);
  assert.equal(report.metrics.wrong_load_bearing_flips, 0);
  assert.equal(report.compute.model_calls_per_item, 1);
  assert.equal(report.compute.model_calls_per_jointly_correct_pair, 1.5);
  assert.match(report.run_digest, /^[a-f0-9]{64}$/);
  assert.match(report.report_digest, /^[a-f0-9]{64}$/);
});

test('naive flip rate cannot masquerade as reasoning correctness', () => {
  const suite = fixtureSuite();
  const report = scoreReasoningEvaluationRun(
    suite,
    fixtureRun(suite, {
      canonical: 'wrong-a',
      loadBearing: 'wrong-b',
      irrelevant: 'wrong-a'
    })
  );

  assert.equal(report.metrics.naive_load_bearing_flip_rate, 1);
  assert.equal(report.metrics.load_bearing_sensitivity, 1);
  assert.equal(report.metrics.irrelevant_invariance, 1);
  assert.equal(report.metrics.paired_joint_accuracy, 0);
  assert.equal(report.metrics.item_accuracy, 0);
  assert.equal(report.metrics.wrong_load_bearing_flips, 1);
  assert.equal(report.metrics.wrong_irrelevant_stability, 1);
  assert.equal(report.compute.model_calls_per_jointly_correct_pair, null);
});

test('suite rejects perturbations whose declared kind disagrees with expected semantics', () => {
  const irrelevantChangesAnswer = fixtureSuite();
  irrelevantChangesAnswer.cases[0].perturbations[1].expected_answer = 'no';
  assert.throws(
    () => validateReasoningEvaluationSuite(irrelevantChangesAnswer),
    /irrelevant but changes the expected answer/
  );

  const loadBearingDoesNotChangeAnswer = fixtureSuite();
  loadBearingDoesNotChangeAnswer.cases[0].perturbations[0].expected_answer = 'yes';
  assert.throws(
    () => validateReasoningEvaluationSuite(loadBearingDoesNotChangeAnswer),
    /load-bearing but does not change the expected answer/
  );
});

test('run rejects hidden aggregation and incomplete observation coverage', () => {
  const suite = fixtureSuite();
  const hiddenAggregation = fixtureRun(
    suite,
    {
      canonical: 'yes',
      loadBearing: 'no',
      irrelevant: 'yes'
    },
    {
      inference: {
        samples_per_item: 8,
        selection_method: 'single',
        temperature: 0.7,
        maximum_reasoning_steps: 32
      }
    }
  );
  assert.throws(
    () => scoreReasoningEvaluationRun(suite, hiddenAggregation),
    /must disclose aggregation/
  );

  const incomplete = fixtureRun(suite, {
    canonical: 'yes',
    loadBearing: 'no',
    irrelevant: 'yes'
  });
  incomplete.observations.pop();
  assert.throws(
    () => scoreReasoningEvaluationRun(suite, incomplete),
    /must contain 3-3 items/
  );
});
