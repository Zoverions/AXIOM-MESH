import assert from 'node:assert/strict';
import test from 'node:test';

import {
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
    proposal_id: 'improvement.adversarial.1',
    origin: {
      principal_id: 'agent.origin.1',
      lineage_record_digest: D('a')
    },
    baseline: { ref: 'artifact.baseline', digest: D('b') },
    candidate: { ref: 'artifact.candidate', digest: D('c') },
    target_surface: 'retrieval-context',
    consequence_class: 'C0',
    mutation_digest: D('d'),
    objective: {
      id: 'objective.quality',
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
    evaluation_id: 'evaluation.external.1',
    proposal_digest: p.proposal_digest,
    evaluator: {
      principal_id: 'agent.external.1',
      lineage_record_digest: D('1'),
      model_family: 'model.family.external',
      runtime_id: 'runtime.external.1',
      provider_domain: 'provider.external',
      evaluator_definition_digest: D('2')
    },
    benchmark_digest: D('3'),
    evidence_digest: D('4'),
    deterministic_verifier: { enabled: false, evidence_digest: null },
    independence: {
      same_lineage: false,
      same_model_family: false,
      same_runtime: false,
      same_provider_domain: false,
      same_evaluator_definition: false
    },
    metrics: [
      { id: 'quality.score', value_microunits: 900_000 },
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

function normalizedEvaluation(p, overrides = {}) {
  return normalizeImprovementEvaluation(evaluation(p, overrides), { proposal: p });
}

function experimentFor(p, evaluations) {
  return createImprovementExperiment({
    proposal: p,
    evaluations,
    predecessor_experiment_digests: [],
    status: 'evaluated'
  });
}

test('promotion profile overrides may strengthen but can never weaken consequence minima', () => {
  const c0 = normalizedProposal();
  const c0Experiment = experimentFor(c0, [normalizedEvaluation(c0)]);
  const strengthened = assessImprovementPromotion({
    experiment: c0Experiment,
    profileOverrides: { min_positive_evaluations: 2 }
  });
  assert.equal(strengthened.required.min_positive_evaluations, 2);
  assert.equal(strengthened.recommendation, 'insufficient-evidence');

  const c2 = normalizedProposal({
    proposal_id: 'improvement.workflow.override.1',
    target_surface: 'workflow-topology',
    consequence_class: 'C2',
    rollback: { ref: 'artifact.rollback.workflow', digest: D('9') }
  });
  const c2Experiment = experimentFor(c2, [normalizedEvaluation(c2)]);
  assert.throws(
    () => assessImprovementPromotion({
      experiment: c2Experiment,
      profileOverrides: { min_lineage_independent_evaluations: 0 }
    }),
    /cannot weaken|minimum.*lineage/i
  );
});

test('proposal binds a resource envelope and rejects experiment ceiling expansion', () => {
  const resourceEnvelope = {
    lineage_record_digest: D('a'),
    aggregate_budget_plan_digest: D('7'),
    reservation_id: 'reservation.improvement.1',
    ceilings: {
      max_evaluation_runs: 8,
      max_child_agents: 2,
      max_cost_units: 100,
      max_wall_clock_ms: 60_000,
      max_storage_bytes: 1_000_000
    }
  };

  const bounded = normalizedProposal({ resource_envelope: resourceEnvelope });
  assert.equal(bounded.resource_envelope.lineage_record_digest, D('a'));
  assert.equal(bounded.resource_envelope.aggregate_budget_plan_digest, D('7'));
  assert.equal(bounded.semantics.authority_effect, 'none');
  assert.equal(bounded.semantics.automatic_application, false);

  assert.throws(
    () => normalizedProposal({
      resources: { ...proposal().resources, max_cost_units: 101 },
      resource_envelope: resourceEnvelope
    }),
    /resource envelope.*max_cost_units|exceeds.*max_cost_units/i
  );

  assert.throws(
    () => normalizedProposal({
      resource_envelope: { ...resourceEnvelope, lineage_record_digest: D('8') }
    }),
    /resource envelope.*lineage|lineage.*mismatch/i
  );
});

test('unbound proposals remain inert evidence without lineage or spawn-verification claims', () => {
  const p = normalizedProposal({
    origin: { principal_id: 'agent.origin.unbound', lineage_record_digest: null }
  });
  assert.equal(p.resource_envelope, null);
  assert.equal(p.semantics.authority_effect, 'none');
  assert.equal(p.semantics.automatic_application, false);
  assert.equal(Object.hasOwn(p.semantics, 'spawn_authorized'), false);
});

test('strict proposal and evaluation chronology and ordering fail closed', () => {
  assert.throws(
    () => normalizeImprovementProposal(proposal(), {
      now: new Date('2026-09-01T21:05:00.000Z')
    }),
    /expired/i
  );

  assert.throws(
    () => normalizedProposal({
      validity: {
        created_at: '2026-09-01T20:05:00Z',
        expires_at: '2026-09-01T21:05:00.000Z'
      }
    }),
    /canonical/i
  );

  const p = normalizedProposal();
  assert.throws(
    () => normalizedEvaluation(p, {
      metrics: [
        { id: 'regression.count', value_microunits: 0 },
        { id: 'quality.score', value_microunits: 900_000 }
      ]
    }),
    /metric.*sorted/i
  );

  assert.throws(
    () => normalizedEvaluation(p, { evaluated_at: '2026-09-01T22:00:00.000Z' }),
    /outside proposal validity/i
  );
});

test('C2 can become request-eligible only with genuinely corroborating evidence', () => {
  const p = normalizedProposal({
    proposal_id: 'improvement.workflow.corroborated.1',
    target_surface: 'workflow-topology',
    consequence_class: 'C2',
    rollback: { ref: 'artifact.rollback.workflow', digest: D('9') }
  });
  const first = normalizedEvaluation(p);
  const second = normalizedEvaluation(p, {
    evaluation_id: 'evaluation.external.2',
    evaluator: {
      ...evaluation(p).evaluator,
      principal_id: 'agent.external.2',
      lineage_record_digest: D('5'),
      model_family: 'model.family.second',
      runtime_id: 'runtime.external.2',
      provider_domain: 'provider.second',
      evaluator_definition_digest: D('6')
    },
    evidence_digest: D('8')
  });
  const assessment = assessImprovementPromotion({ experiment: experimentFor(p, [first, second]) });
  assert.equal(assessment.recommendation, 'eligible');
  assert.equal(assessment.semantics.promotion_authorized, false);
});
