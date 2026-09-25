import assert from 'node:assert/strict';
import test from 'node:test';

import { digestObject } from '../src/lib/canonical.mjs';
import {
  INDEPENDENCE_CRITERIA_PROFILE,
  MIND_INDEPENDENCE_REVIEW_SCHEMA,
  REQUIRED_INDEPENDENCE_CRITERIA
} from '../src/lib/mind-independence-review.mjs';
import {
  MIND_INDEPENDENCE_TRANSITION_EVIDENCE_SCHEMA,
  assessMindIndependenceTransitionEvidence
} from '../src/lib/mind-independence-transition-evidence.mjs';

function review() {
  return {
    schema: MIND_INDEPENDENCE_REVIEW_SCHEMA,
    version: 0,
    status: 'inert-evidence-review',
    mind_id: 'digital.founder.1',
    sponsor_mind_id: 'human.founder',
    developmental_stage: 'candidate-independent',
    developmental_state_evidence_digest: 'd'.repeat(64),
    continuity_evidence_digest: 'e'.repeat(64),
    criteria_profile: INDEPENDENCE_CRITERIA_PROFILE,
    criteria: REQUIRED_INDEPENDENCE_CRITERIA.map((criterionId, index) => ({
      criterion_id: criterionId,
      status: 'demonstrated',
      evidence_digests: [(index + 1).toString(16).padStart(64, '0')]
    })),
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
    assessed_at: '2026-09-25T14:00:00.000Z',
    status_effect: 'none',
    governance_effect: 'none',
    genesis_eligibility_effect: 'none',
    authority_effect: 'none',
    network_effect: 'none',
    runtime_activation: false
  };
}

function evidence(reviewDocument, overrides = {}) {
  return {
    schema: MIND_INDEPENDENCE_TRANSITION_EVIDENCE_SCHEMA,
    version: 0,
    status: 'inert-transition-evidence',
    mind_id: reviewDocument.mind_id,
    independence_review_digest: digestObject(reviewDocument),
    current_developmental_stage: 'candidate-independent',
    current_developmental_state_evidence_digest:
      reviewDocument.developmental_state_evidence_digest,
    developmental_state_observed_at: '2026-09-25T14:25:00.000Z',
    current_continuity_evidence_digest: reviewDocument.continuity_evidence_digest,
    continuity_observed_at: '2026-09-25T14:25:00.000Z',
    continuity_status: 'clear',
    appeal_path_id: reviewDocument.appeal_path_id,
    appeal_status: 'none',
    appeal_evidence_digest: 'f'.repeat(64),
    appeal_observed_at: '2026-09-25T14:25:00.000Z',
    maximum_review_age_seconds: 3600,
    maximum_state_observation_age_seconds: 600,
    evaluated_at: '2026-09-25T14:30:00.000Z',
    status_effect: 'none',
    council_voting_effect: 'none',
    genesis_eligibility_effect: 'none',
    governance_effect: 'none',
    authority_effect: 'none',
    network_effect: 'none',
    runtime_activation: false,
    ...overrides
  };
}

test('fresh successful review can make an independence transition requestable without mutating status', () => {
  const r = review();
  const result = assessMindIndependenceTransitionEvidence(r, evidence(r));

  assert.equal(result.review_threshold_satisfied, true);
  assert.equal(result.review_current, true);
  assert.equal(result.developmental_stage_matches, true);
  assert.equal(result.developmental_state_evidence_matches, true);
  assert.equal(result.continuity_evidence_matches, true);
  assert.equal(result.continuity_clear, true);
  assert.equal(result.appeal_current, true);
  assert.equal(result.appeal_clear, true);
  assert.equal(result.transition_requestable, true);
  assert.equal(result.reason, 'transition-requestable');
  assert.equal(result.status_effect, 'none');
  assert.equal(result.council_voting_effect, 'none');
  assert.equal(result.genesis_eligibility_effect, 'none');
  assert.equal(result.authority_effect, 'none');
  assert.equal(result.runtime_activation, false);
});

test('review threshold failure blocks transition requestability', () => {
  const r = review();
  r.criteria[0].status = 'uncertain';
  const e = evidence(r);

  const result = assessMindIndependenceTransitionEvidence(r, e);
  assert.equal(result.review_threshold_satisfied, false);
  assert.equal(result.transition_requestable, false);
  assert.equal(result.reason, 'review-threshold-not-satisfied');
});

test('transition evidence rejects identity and review-digest substitution', () => {
  const r = review();

  assert.throws(
    () => assessMindIndependenceTransitionEvidence(
      r,
      evidence(r, { mind_id: 'digital.other' })
    ),
    /mind binding is invalid/
  );

  assert.throws(
    () => assessMindIndependenceTransitionEvidence(
      r,
      evidence(r, { independence_review_digest: 'f'.repeat(64) })
    ),
    /review digest is invalid/
  );
});

test('state and continuity digest changes block requestability', () => {
  const r = review();

  let result = assessMindIndependenceTransitionEvidence(
    r,
    evidence(r, { current_developmental_state_evidence_digest: 'f'.repeat(64) })
  );
  assert.equal(result.transition_requestable, false);
  assert.equal(result.reason, 'developmental-state-evidence-mismatch');

  result = assessMindIndependenceTransitionEvidence(
    r,
    evidence(r, { current_continuity_evidence_digest: 'f'.repeat(64) })
  );
  assert.equal(result.transition_requestable, false);
  assert.equal(result.reason, 'continuity-evidence-mismatch');
});

test('stale review and stale current-state observations fail closed', () => {
  const r = review();

  let result = assessMindIndependenceTransitionEvidence(
    r,
    evidence(r, { maximum_review_age_seconds: 1200 })
  );
  assert.equal(result.transition_requestable, false);
  assert.equal(result.reason, 'review-stale');

  result = assessMindIndependenceTransitionEvidence(
    r,
    evidence(r, {
      developmental_state_observed_at: '2026-09-25T14:00:00.000Z'
    })
  );
  assert.equal(result.transition_requestable, false);
  assert.equal(result.reason, 'developmental-state-observation-stale');

  result = assessMindIndependenceTransitionEvidence(
    r,
    evidence(r, {
      continuity_observed_at: '2026-09-25T14:00:00.000Z'
    })
  );
  assert.equal(result.transition_requestable, false);
  assert.equal(result.reason, 'continuity-observation-stale');
});

test('future-dated review or state observations are rejected', () => {
  const futureReview = review();
  futureReview.assessed_at = '2026-09-25T14:31:00.000Z';

  assert.throws(
    () => assessMindIndependenceTransitionEvidence(
      futureReview,
      evidence(futureReview)
    ),
    /review cannot be future-dated/
  );

  const r = review();
  assert.throws(
    () => assessMindIndependenceTransitionEvidence(
      r,
      evidence(r, {
        continuity_observed_at: '2026-09-25T14:31:00.000Z'
      })
    ),
    /observation cannot be future-dated/
  );
});

test('continuity dispute, stale state, or unknown state blocks transition requestability', () => {
  const r = review();
  for (const status of ['disputed', 'stale', 'unknown']) {
    const result = assessMindIndependenceTransitionEvidence(
      r,
      evidence(r, { continuity_status: status })
    );
    assert.equal(result.transition_requestable, false);
    assert.equal(result.reason, `continuity-${status}`);
  }
});

test('appeal observation freshness is required', () => {
  const r = review();
  const result = assessMindIndependenceTransitionEvidence(
    r,
    evidence(r, { appeal_observed_at: '2026-09-25T14:00:00.000Z' })
  );

  assert.equal(result.appeal_current, false);
  assert.equal(result.transition_requestable, false);
  assert.equal(result.reason, 'appeal-observation-stale');
});

test('appeal currentness controls transition requestability', () => {
  const r = review();

  for (const status of ['open', 'stayed', 'resolved-reverse', 'unknown']) {
    const result = assessMindIndependenceTransitionEvidence(
      r,
      evidence(r, {
        appeal_status: status,
        appeal_evidence_digest: 'f'.repeat(64)
      })
    );
    assert.equal(result.transition_requestable, false);
    assert.equal(result.reason, `appeal-${status}`);
  }

  const upheld = assessMindIndependenceTransitionEvidence(
    r,
    evidence(r, {
      appeal_status: 'resolved-uphold',
      appeal_evidence_digest: 'f'.repeat(64)
    })
  );
  assert.equal(upheld.transition_requestable, true);
});

test('every appeal state requires exact evidence, including no-open-appeal', () => {
  const r = review();

  assert.throws(
    () => assessMindIndependenceTransitionEvidence(
      r,
      evidence(r, { appeal_evidence_digest: null })
    ),
    /activation boundary/
  );

  assert.throws(
    () => assessMindIndependenceTransitionEvidence(
      r,
      evidence(r, { appeal_evidence_digest: 'not-a-digest' })
    ),
    /activation boundary/
  );
});

test('developmental stage must still be candidate-independent', () => {
  const r = review();
  const result = assessMindIndependenceTransitionEvidence(
    r,
    evidence(r, { current_developmental_stage: 'developing' })
  );

  assert.equal(result.transition_requestable, false);
  assert.equal(result.reason, 'developmental-stage-mismatch');
});

test('transition evidence cannot directly mutate status, voting, Genesis eligibility, governance, or authority', () => {
  const r = review();
  for (const [field, value] of [
    ['status_effect', 'independent'],
    ['council_voting_effect', 'activate'],
    ['genesis_eligibility_effect', 'grant'],
    ['governance_effect', 'admit'],
    ['authority_effect', 'grant'],
    ['network_effect', 'publish'],
    ['runtime_activation', true]
  ]) {
    assert.throws(
      () => assessMindIndependenceTransitionEvidence(r, evidence(r, { [field]: value })),
      /activation boundary/
    );
  }
});
