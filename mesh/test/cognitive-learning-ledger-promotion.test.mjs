// TDD red gate: validator intentionally unchanged in this commit.
import assert from 'node:assert/strict';
import test from 'node:test';
import { validateCognitiveLearningRecord } from '../src/lib/cognitive-learning-ledger.mjs';

const DIGEST_A = 'a'.repeat(64);
const DIGEST_B = 'b'.repeat(64);

function record() {
  return {
    schema: 'axiom-cognitive-learning-ledger.v0',
    version: 0,
    status: 'inert-contract-laboratory',
    learning_record_id: 'learning.promotion.test.v1',
    principal_id: 'agent.personal.primary',
    composition_id: null,
    composition_digest: null,
    source_evidence: [
      { ref: 'evidence.source.v1', digest: DIGEST_A, evidence_class: 'captured' }
    ],
    derived_artifact: { ref: 'artifact.semantic.v1', digest: DIGEST_B },
    learning_class: 'semantic',
    representation_class: 'lossy',
    current_tier: 'retrievable-memory',
    proposed_target_tier: 'semantic-consolidation',
    proposal_reason: 'Promotion semantics test fixture.',
    expected_reuse: { class: 'recurring', estimated_uses: 10 },
    resource_costs: [],
    policy_utility: {
      privacy: 'neutral',
      sovereignty: 'positive',
      latency: 'neutral',
      quality: 'positive',
      resilience: 'neutral'
    },
    evaluation_evidence: [],
    promotion_state: 'candidate',
    predecessor_records: [],
    successor_records: [],
    created_at: '2026-08-31T03:00:00.000Z',
    updated_at: '2026-08-31T03:00:00.000Z',
    contains_secret_material: false,
    authority_effect: 'none',
    network_effect: 'none',
    training_effect: 'none',
    spend_effect: 'none',
    runtime_activation: false
  };
}

test('evaluated and accepted states require explicit evaluation evidence', () => {
  for (const promotionState of ['evaluated', 'accepted']) {
    const withoutEvidence = record();
    withoutEvidence.promotion_state = promotionState;
    assert.throws(
      () => validateCognitiveLearningRecord(withoutEvidence),
      /evaluation evidence/i
    );

    const withEvidence = record();
    withEvidence.promotion_state = promotionState;
    withEvidence.evaluation_evidence = [
      { ref: 'evaluation.promotion.v1', digest: DIGEST_A }
    ];
    assert.doesNotThrow(() => validateCognitiveLearningRecord(withEvidence));
  }
});

test('foundation-training cannot be accepted by personal-agent ledger v0', () => {
  const candidate = record();
  candidate.proposed_target_tier = 'foundation-training';
  candidate.promotion_state = 'candidate';
  assert.doesNotThrow(() => validateCognitiveLearningRecord(candidate));

  const accepted = record();
  accepted.proposed_target_tier = 'foundation-training';
  accepted.promotion_state = 'accepted';
  accepted.evaluation_evidence = [
    { ref: 'evaluation.foundation.v1', digest: DIGEST_A }
  ];
  assert.throws(
    () => validateCognitiveLearningRecord(accepted),
    /foundation-training.*accepted/i
  );
});
