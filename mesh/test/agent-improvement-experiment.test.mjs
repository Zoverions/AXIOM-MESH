import assert from 'node:assert/strict';
import test from 'node:test';

import {
  IMPROVEMENT_EVALUATION_SCHEMA,
  IMPROVEMENT_EXPERIMENT_SCHEMA,
  IMPROVEMENT_PROMOTION_ASSESSMENT_SCHEMA,
  IMPROVEMENT_PROPOSAL_SCHEMA,
  assessImprovementPromotion,
  createImprovementExperiment,
  normalizeImprovementEvaluation,
  normalizeImprovementProposal
} from '../src/lib/agent-improvement-experiment.mjs';

const NOW = new Date('2026-09-01T20:00:00.000Z');
const D = char => char.repeat(64);

function proposal(overrides = {}) {
  return {
    schema: 'axiom-agent-improvement-proposal.v1',
    proposal_id: 'improvement.retrieval.1',
    origin: {
      principal_id: 'agent.researcher.1',
      lineage_record_digest: D('a')
    },
    baseline: { ref: 'artifact.agent.baseline', digest: D('b') },
    candidate: { ref: 'artifact.agent.candidate', digest: D('c') },
    target_surface: 'retrieval-context',
    consequence_class: 'C0',
    mutation_digest: D('d'),
    objective: {
      id: 'objective.retrieval.quality',
      metric_definition_digest: D('e'),
      evaluator_definition_digest: D('f')
    },
    resources: {
      max_evaluation_runs: 8,
      max_child_agents: 2,
      max_cost_units: 100,
      max_wall_clock_ms: 60_000,
      max_storage_bytes: 1_000_000
    },
    rollback: null,
    predecessor_experiment_digests: [],
    validity: {
      created_at: '2026-09-01T20:05:00.000Z',
      expires_at: '2026-09-01T21:05:00.000Z'
    },
    semantics: {
      authority_effect: 'none',
      automatic_application: false,
      promotion_authorized: false,
      runtime_activation: false,
      training_effect: 'none',
      trust_inherited: false,
      truth_claimed: false,
      global_currentness_claimed: false
    },
    ...overrides
  };
}

function normalizedProposal(overrides = {}) {
  return normalizeImprovementProposal(proposal(overrides), { now: NOW });
}

function evaluation(p, overrides = {}) {
  return {
    schema: 'axiom-agent-improvement-evaluation.v1',
    evaluation_id: 'evaluation.independent.1',
    proposal_digest: p.proposal_digest,
    evaluator: {
      principal_id: 'agent.verifier.1',
      lineage_record_digest: D('1'),
      model_family: 'model.family.external',
      runtime_id: 'runtime.verifier.1',
      provider_domain: 'provider.external',
      evaluator_definition_digest: D('2')
    },
    benchmark_digest: D('3'),
    evidence_digest: D('4'),
    deterministic_verifier: {
      enabled: false,
      evidence_digest: null
    },
    independence: {
      same_lineage: false,
      same_model_family: false,
      same_runtime: false,
      same_provider_domain: false,
      same_evaluator_definition: false
    },
    metrics: [
      { id: 'quality.score', value_microunits: 850_000 },
      { id: 'regression.count', value_microunits: 0 }
    ],
    verdict: 'positive',
    regressions: [],
    evaluated_at: '2026-09-01T20:20:00.000Z',
    semantics: {
      authority_effect: 'none',
      promotion_authorized: false,
      task_success_claimed: false,
      truth_claimed: false,
      global_currentness_claimed: false
    },
    ...overrides
  };
}

function normalizedEvaluation(p, overrides = {}, options = {}) {
  return normalizeImprovementEvaluation(evaluation(p, overrides), {
    proposal: p,
    known_same_lineage: options.known_same_lineage ?? false
  });
}

test('C0 improvement proposal is canonical evidence and cannot authorize application', () => {
  const p = normalizedProposal();
  assert.equal(IMPROVEMENT_PROPOSAL_SCHEMA, 'axiom-agent-improvement-proposal.v1');
  assert.equal(p.schema, IMPROVEMENT_PROPOSAL_SCHEMA);
  assert.equal(p.target_surface, 'retrieval-context');
  assert.equal(p.consequence_class, 'C0');
  assert.equal(p.semantics.authority_effect, 'none');
  assert.equal(p.semantics.automatic_application, false);
  assert.equal(p.semantics.promotion_authorized, false);
  assert.match(p.proposal_digest, /^[a-f0-9]{64}$/);
});

test('proposal fails closed on fake mutation, consequence downgrade, missing rollback and semantic widening', () => {
  assert.throws(
    () => normalizedProposal({
      candidate: { ref: 'artifact.same', digest: D('b') }
    }),
    /candidate.*baseline|mutation.*distinct/i
  );

  assert.throws(
    () => normalizedProposal({
      target_surface: 'runtime-scaffolding-code',
      consequence_class: 'C1',
      rollback: { ref: 'artifact.rollback', digest: D('9') }
    }),
    /minimum consequence|consequence.*C2/i
  );

  assert.throws(
    () => normalizedProposal({
      target_surface: 'memory-policy',
      consequence_class: 'C1'
    }),
    /rollback/i
  );

  assert.throws(
    () => normalizedProposal({
      semantics: { ...proposal().semantics, automatic_application: true }
    }),
    /non-authorizing|automatic_application/i
  );

  assert.throws(
    () => normalizedProposal({ unexpected: true }),
    /unsupported field unexpected|unknown field unexpected/i
  );
});

test('evaluation binds exact proposal and explicit independence facts', () => {
  const p = normalizedProposal();
  const e = normalizedEvaluation(p);

  assert.equal(IMPROVEMENT_EVALUATION_SCHEMA, 'axiom-agent-improvement-evaluation.v1');
  assert.equal(e.schema, IMPROVEMENT_EVALUATION_SCHEMA);
  assert.equal(e.proposal_digest, p.proposal_digest);
  assert.equal(e.independence.same_lineage, false);
  assert.equal(e.verdict, 'positive');
  assert.deepEqual(e.metrics.map(item => item.id), ['quality.score', 'regression.count']);
  assert.match(e.evaluation_digest, /^[a-f0-9]{64}$/);
});

test('evaluation rejects lineage laundering, proposal substitution and unsupported deterministic claims', () => {
  const p = normalizedProposal();

  assert.throws(
    () => normalizedEvaluation(p, {}, { known_same_lineage: true }),
    /same lineage|lineage.*contradict/i
  );

  assert.throws(
    () => normalizedEvaluation(p, { proposal_digest: D('8') }),
    /proposal digest mismatch/i
  );

  assert.throws(
    () => normalizedEvaluation(p, {
      deterministic_verifier: { enabled: true, evidence_digest: null }
    }),
    /deterministic.*evidence/i
  );
});

test('experiment preserves negative and regression evidence instead of selecting only favorable evaluations', () => {
  const p = normalizedProposal();
  const positive = normalizedEvaluation(p);
  const negative = normalizedEvaluation(p, {
    evaluation_id: 'evaluation.independent.2',
    evaluator: {
      ...evaluation(p).evaluator,
      principal_id: 'agent.verifier.2',
      lineage_record_digest: D('5'),
      model_family: 'model.family.second',
      runtime_id: 'runtime.verifier.2',
      provider_domain: 'provider.second',
      evaluator_definition_digest: D('6')
    },
    evidence_digest: D('7'),
    verdict: 'negative',
    regressions: [
      { ref: 'regression.latency.1', digest: D('8'), severity: 'major' }
    ]
  });

  const experiment = createImprovementExperiment({
    proposal: p,
    evaluations: [positive, negative],
    predecessor_experiment_digests: [],
    status: 'evaluated'
  });

  assert.equal(IMPROVEMENT_EXPERIMENT_SCHEMA, 'axiom-agent-improvement-experiment.v1');
  assert.equal(experiment.summary.positive_evaluations, 1);
  assert.equal(experiment.summary.negative_evaluations, 1);
  assert.equal(experiment.summary.regressions, 1);
  assert.equal(experiment.summary.distinct_evaluator_principals, 2);
  assert.equal(experiment.summary.lineage_independent_evaluations, 2);
  assert.match(experiment.experiment_digest, /^[a-f0-9]{64}$/);
});

test('C2 self-certification remains insufficient even with many same-lineage evaluations', () => {
  const p = normalizedProposal({
    proposal_id: 'improvement.workflow.1',
    target_surface: 'workflow-topology',
    consequence_class: 'C2',
    rollback: { ref: 'artifact.workflow.rollback', digest: D('9') }
  });

  const sameLineage = [];
  for (let index = 0; index < 10; index += 1) {
    sameLineage.push(normalizeImprovementEvaluation(evaluation(p, {
      evaluation_id: `evaluation.self.${index}`,
      evaluator: {
        ...evaluation(p).evaluator,
        principal_id: `agent.descendant.${index}`,
        lineage_record_digest: D(String(index % 10)),
        model_family: 'model.family.origin',
        runtime_id: 'runtime.origin',
        provider_domain: 'provider.origin',
        evaluator_definition_digest: D('2')
      },
      evidence_digest: D(String((index + 1) % 10)),
      independence: {
        same_lineage: true,
        same_model_family: true,
        same_runtime: true,
        same_provider_domain: true,
        same_evaluator_definition: false
      }
    }), { proposal: p, known_same_lineage: true }));
  }

  const experiment = createImprovementExperiment({
    proposal: p,
    evaluations: sameLineage,
    predecessor_experiment_digests: [],
    status: 'evaluated'
  });
  const assessment = assessImprovementPromotion({ experiment });

  assert.equal(IMPROVEMENT_PROMOTION_ASSESSMENT_SCHEMA, 'axiom-agent-improvement-promotion-assessment.v1');
  assert.equal(assessment.recommendation, 'insufficient-evidence');
  assert.equal(assessment.achieved.lineage_independent_evaluations, 0);
  assert.equal(assessment.semantics.authority_effect, 'none');
  assert.equal(assessment.semantics.automatic_application, false);
  assert.equal(assessment.semantics.promotion_authorized, false);
});

test('evaluator mutation cannot use the candidate evaluator as its sole judge', () => {
  const candidateEvaluatorDigest = D('c');
  const p = normalizedProposal({
    proposal_id: 'improvement.evaluator.1',
    candidate: { ref: 'evaluator.candidate', digest: candidateEvaluatorDigest },
    target_surface: 'evaluator-reward',
    consequence_class: 'C3',
    rollback: { ref: 'evaluator.previous', digest: D('b') }
  });
  const selfJudge = normalizedEvaluation(p, {
    evaluator: {
      ...evaluation(p).evaluator,
      evaluator_definition_digest: candidateEvaluatorDigest
    }
  });
  const experiment = createImprovementExperiment({
    proposal: p,
    evaluations: [selfJudge],
    predecessor_experiment_digests: [],
    status: 'evaluated'
  });
  const assessment = assessImprovementPromotion({ experiment });
  assert.notEqual(assessment.recommendation, 'eligible');
  assert.ok(assessment.reason_codes.some(code => code.includes('candidate-evaluator')));
});

test('C4 and C5 experiments can be studied but are never promotion-eligible in v0', () => {
  const cases = [
    ['adapter-parameters', 'C4'],
    ['model-weights', 'C5'],
    ['improvement-mechanism', 'C5']
  ];

  for (const [surface, consequence] of cases) {
    const p = normalizedProposal({
      proposal_id: `improvement.${surface}.1`,
      target_surface: surface,
      consequence_class: consequence,
      rollback: { ref: `rollback.${surface}`, digest: D('9') }
    });
    const e = normalizedEvaluation(p);
    const experiment = createImprovementExperiment({
      proposal: p,
      evaluations: [e],
      predecessor_experiment_digests: [],
      status: 'evaluated'
    });
    const assessment = assessImprovementPromotion({ experiment });
    assert.equal(assessment.recommendation, 'ineligible');
    assert.ok(assessment.reason_codes.includes('surface-not-promotable-in-v0'));
  }
});
