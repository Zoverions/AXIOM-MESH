import assert from 'node:assert/strict';
import test from 'node:test';

import {
  INDEPENDENCE_CRITERIA_PROFILE,
  MIND_INDEPENDENCE_REVIEW_SCHEMA,
  REQUIRED_INDEPENDENCE_CRITERIA,
  assessMindIndependenceReview
} from '../src/lib/mind-independence-review.mjs';

function review(overrides = {}) {
  const criteria = REQUIRED_INDEPENDENCE_CRITERIA.map((criterionId, index) => ({
    criterion_id: criterionId,
    status: 'demonstrated',
    evidence_digests: [(index + 1).toString(16).padStart(64, '0')]
  }));

  return {
    schema: MIND_INDEPENDENCE_REVIEW_SCHEMA,
    version: 0,
    status: 'inert-evidence-review',
    mind_id: 'digital.founder.1',
    sponsor_mind_id: 'human.founder',
    developmental_stage: 'candidate-independent',
    criteria_profile: INDEPENDENCE_CRITERIA_PROFILE,
    criteria,
    review_policy: {
      minimum_reviewers: 2,
      minimum_independent_reviewers: 1,
      minimum_total_support: 2,
      minimum_independent_support: 1,
      sponsor_veto: false,
      independent_opposition_blocks: true,
      candidate_self_decision: false,
      model_final_authority: false,
      appeal_required: true
    },
    reviewers: [
      {
        reviewer_id: 'human.founder',
        relation: 'sponsor',
        decision: 'support',
        evidence_digest: 'a'.repeat(64),
        conflict_declared: true
      },
      {
        reviewer_id: 'human.independent.1',
        relation: 'independent',
        decision: 'support',
        evidence_digest: 'b'.repeat(64),
        conflict_declared: false
      }
    ],
    appeal_path_id: 'appeal.independence.1',
    assessed_at: '2026-09-25T14:30:00.000Z',
    status_effect: 'none',
    governance_effect: 'none',
    genesis_eligibility_effect: 'none',
    authority_effect: 'none',
    network_effect: 'none',
    runtime_activation: false,
    ...overrides
  };
}

test('complete evidence can satisfy the review threshold without granting independence or authority', () => {
  const result = assessMindIndependenceReview(review());

  assert.equal(result.demonstrated_criteria, 10);
  assert.deepEqual(result.incomplete_criteria, []);
  assert.equal(result.reviewer_threshold_satisfied, true);
  assert.equal(result.support_threshold_satisfied, true);
  assert.equal(result.independent_opposition_clear, true);
  assert.equal(result.appeal_path_present, true);
  assert.equal(result.result_state, 'evidence-threshold-satisfied');
  assert.equal(result.evidence_threshold_satisfied, true);
  assert.equal(result.independence_status_granted, false);
  assert.equal(result.council_voting_effect, 'none');
  assert.equal(result.genesis_eligibility_effect, 'none');
  assert.equal(result.status_effect, 'none');
  assert.equal(result.authority_effect, 'none');
  assert.equal(result.runtime_activation, false);
});

test('sponsor-only review cannot satisfy the independent-review threshold', () => {
  const document = review();
  document.reviewers = [document.reviewers[0]];
  document.review_policy.minimum_reviewers = 2;

  const result = assessMindIndependenceReview(document);

  assert.equal(result.evidence_threshold_satisfied, false);
  assert.equal(result.result_state, 'reviewer-threshold-not-satisfied');
  assert.equal(result.independent_reviewer_count, 0);
});

test('candidate cannot approve itself', () => {
  const document = review();
  document.reviewers[1].reviewer_id = document.mind_id;

  assert.throws(
    () => assessMindIndependenceReview(document),
    /reviewer is invalid/
  );
});

test('Genesis sponsor cannot be laundered into an independent reviewer', () => {
  const document = review();
  document.reviewers[0].relation = 'independent';

  assert.throws(
    () => assessMindIndependenceReview(document),
    /Genesis sponsor cannot be presented as an independent reviewer/
  );
});

test('conflicted reviewer cannot count as independent', () => {
  const document = review();
  document.reviewers[1].conflict_declared = true;

  assert.throws(
    () => assessMindIndependenceReview(document),
    /Conflicted reviewer cannot count as independent/
  );
});

test('reviewer identities must be unique', () => {
  const document = review();
  document.reviewers.push({
    ...structuredClone(document.reviewers[1]),
    decision: 'uncertain'
  });

  assert.throws(
    () => assessMindIndependenceReview(document),
    /reviewer is invalid/
  );
});

test('every fixed independence criterion must appear exactly once', () => {
  const missing = review();
  missing.criteria.pop();
  assert.throws(
    () => assessMindIndependenceReview(missing),
    /exact criteria profile/
  );

  const duplicate = review();
  duplicate.criteria[9] = structuredClone(duplicate.criteria[0]);
  assert.throws(
    () => assessMindIndependenceReview(duplicate),
    /criterion is invalid/
  );
});

test('uncertain or not-demonstrated criteria preserve incompleteness', () => {
  for (const status of ['uncertain', 'not-demonstrated']) {
    const document = review();
    document.criteria[3].status = status;
    const result = assessMindIndependenceReview(document);

    assert.equal(result.evidence_threshold_satisfied, false);
    assert.equal(result.result_state, 'criteria-incomplete');
    assert.deepEqual(result.incomplete_criteria, ['credential-security']);
  }
});

test('independent opposition blocks a positive review even when support thresholds are met', () => {
  const document = review();
  document.reviewers.push({
    reviewer_id: 'human.independent.2',
    relation: 'independent',
    decision: 'oppose',
    evidence_digest: 'c'.repeat(64),
    conflict_declared: false
  });

  const result = assessMindIndependenceReview(document);

  assert.equal(result.support_threshold_satisfied, true);
  assert.equal(result.independent_opposition_clear, false);
  assert.equal(result.evidence_threshold_satisfied, false);
  assert.equal(result.result_state, 'independent-opposition-unresolved');
});

test('sponsor opposition is evidence but not an absolute veto', () => {
  const document = review();
  document.reviewers[0].decision = 'oppose';
  document.reviewers.push({
    reviewer_id: 'human.independent.2',
    relation: 'independent',
    decision: 'support',
    evidence_digest: 'c'.repeat(64),
    conflict_declared: false
  });

  const result = assessMindIndependenceReview(document);

  assert.equal(result.supporting_independent_reviewer_count, 2);
  assert.equal(result.support_threshold_satisfied, true);
  assert.equal(result.independent_opposition_clear, true);
  assert.equal(result.evidence_threshold_satisfied, true);
  assert.equal(result.independence_status_granted, false);
});

test('missing appeal path keeps the review incomplete', () => {
  const document = review();
  document.appeal_path_id = null;

  const result = assessMindIndependenceReview(document);

  assert.equal(result.appeal_path_present, false);
  assert.equal(result.evidence_threshold_satisfied, false);
  assert.equal(result.result_state, 'appeal-path-missing');
});

test('policy cannot grant sponsor veto, candidate self-decision, or model final authority', () => {
  for (const [field, value] of [
    ['sponsor_veto', true],
    ['candidate_self_decision', true],
    ['model_final_authority', true],
    ['independent_opposition_blocks', false],
    ['appeal_required', false]
  ]) {
    const document = review();
    document.review_policy[field] = value;

    assert.throws(
      () => assessMindIndependenceReview(document),
      /review policy is invalid/
    );
  }
});

test('review cannot directly create status, governance, Genesis eligibility, network, or authority effects', () => {
  for (const [field, value] of [
    ['status_effect', 'independent'],
    ['governance_effect', 'activate-vote'],
    ['genesis_eligibility_effect', 'grant'],
    ['authority_effect', 'grant'],
    ['network_effect', 'publish'],
    ['runtime_activation', true]
  ]) {
    const document = review({ [field]: value });

    assert.throws(
      () => assessMindIndependenceReview(document),
      /activation boundary/
    );
  }
});
