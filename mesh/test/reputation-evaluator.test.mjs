import test from 'node:test';
import assert from 'node:assert/strict';
import { REPUTATION_QUERY_SCHEMA } from '../src/domain/reputation-query.mjs';
import { INFORMATION_RIGHTS_SCHEMA } from '../src/domain/information-rights.mjs';
import {
  EVIDENCE_ASSERTION_SCHEMA,
  EVIDENCE_REVIEW_SCHEMA
} from '../src/domain/evidence-graph.mjs';
import { evaluateContextualReputation } from '../src/domain/reputation-evaluator.mjs';

const NOW = '2026-09-03T12:20:00.000Z';
const ACCESS_DIGEST = 'a'.repeat(64);

function query(overrides = {}) {
  return {
    schema: REPUTATION_QUERY_SCHEMA,
    query_id: 'repq:security-review-1',
    requester: 'principal:verifier',
    subject_ref: 'principal:subject',
    domain: 'software-security',
    purpose: 'vendor-security-review',
    criterion_ref: 'criterion:verified-findings-v1',
    evidence_window: {
      starts_at: '2026-09-03T10:00:00.000Z',
      ends_at: '2026-09-03T12:30:00.000Z'
    },
    minimum_review_state: 'machine-reviewed',
    requested_presentation: 'criterion-only',
    max_claim_ttl_seconds: 600,
    verifier_policy_ref: 'policy:vendor-security-v1',
    created_at: '2026-09-03T12:10:00.000Z',
    expires_at: '2026-09-03T13:00:00.000Z',
    ...overrides
  };
}

function assertion(overrides = {}) {
  return {
    schema: EVIDENCE_ASSERTION_SCHEMA,
    assertion_id: 'assertion:finding-1',
    type: 'evidence-item',
    proposition: 'Independent review recorded a verified security finding.',
    source_ref: 'principal:reviewer',
    epistemic_state: 'corroborated',
    purpose_scope: ['reputation:software-security'],
    provenance_refs: ['artifact:review-1'],
    created_at: '2026-09-03T12:00:00.000Z',
    ...overrides
  };
}

function rights(overrides = {}) {
  const base = {
    schema: INFORMATION_RIGHTS_SCHEMA,
    object_ref: 'assertion:finding-1',
    information_class: 'reputation-evidence',
    sensitivity_class: 'restricted',
    relationships: {
      subjects: ['principal:subject'],
      originators: ['principal:reviewer'],
      custodians: ['institution:review-registry'],
      controllers: ['institution:review-registry'],
      affected_parties: [],
      beneficiaries: ['principal:subject'],
      permitted_recipients: ['principal:verifier'],
      reviewers: ['principal:reviewer'],
      auditors: [],
      decision_users: ['principal:verifier'],
      challengers: ['principal:subject'],
      disclosure_authorities: ['policy:vendor-security-v1'],
      retention_authorities: ['policy:review-retention-v1']
    },
    authority_basis: ['policy:vendor-security-v1'],
    allowed_purposes: ['vendor-security-review'],
    forbidden_purposes: [],
    policy_refs: {
      access: ['policy:vendor-security-v1'],
      disclosure: ['policy:vendor-security-v1'],
      retention: ['policy:review-retention-v1'],
      challenge: ['policy:review-challenge-v1'],
      correction: ['policy:review-correction-v1'],
      export: [],
      deletion: []
    },
    projection_profiles: ['projection:criterion-only-v1'],
    jurisdiction_context: ['jurisdiction:example'],
    provenance_refs: ['artifact:review-1'],
    evidence_refs: ['assertion:finding-1'],
    state: { retention: 'active', challenge: 'none', supersession: 'current' },
    created_at: '2026-09-03T12:00:00.000Z',
    reviewed_at: '2026-09-03T12:05:00.000Z'
  };
  return { ...base, ...overrides };
}

function review(overrides = {}) {
  return {
    schema: EVIDENCE_REVIEW_SCHEMA,
    object_ref: 'assertion:finding-1',
    known: true,
    available: true,
    acquired: true,
    integrity_verified: true,
    indexed: true,
    machine_reviewed: true,
    human_reviewed: false,
    relied_upon: false,
    disclosed: false,
    challenged: false,
    adjudicated: false,
    updated_at: '2026-09-03T12:06:00.000Z',
    ...overrides
  };
}

function objects({ assertionOverrides = {}, rightsOverrides = {}, reviewOverrides = {} } = {}) {
  return [{
    assertion: assertion(assertionOverrides),
    rights: rights(rightsOverrides),
    review: review(reviewOverrides)
  }];
}

function criterion(result = 'met', overrides = {}) {
  return () => ({
    result,
    supporting_assertion_refs: result === 'met' ? ['assertion:finding-1'] : [],
    contrary_assertion_refs: [],
    reason_codes: [],
    ttl_seconds: 600,
    requires_complete_evidence: result === 'not-met',
    ...overrides
  });
}

function evaluate(overrides = {}) {
  return evaluateContextualReputation({
    query: query(),
    objects: objects(),
    links: [],
    accessDecisionDigests: [ACCESS_DIGEST],
    criterionEvaluator: criterion(),
    completenessVerifier: () => false,
    evaluatorRef: 'evaluator:criterion-v1',
    now: NOW,
    ...overrides
  });
}

test('evaluates exact-purpose subject-bound reviewed evidence into an authority-neutral derived claim', () => {
  const first = evaluate();
  const second = evaluate();
  assert.equal(first.result, 'met');
  assert.equal(first.subject_ref, 'principal:subject');
  assert.equal(first.domain, 'software-security');
  assert.equal(first.purpose, 'vendor-security-review');
  assert.deepEqual(first.considered_evidence_refs, ['assertion:finding-1']);
  assert.deepEqual(first.supporting_evidence_refs, ['assertion:finding-1']);
  assert.equal(first.authority_effect, 'none');
  assert.equal(first.reputation_transfer, 'none');
  assert.equal(first.truth_status, 'attributed-derived-claim');
  assert.equal(first.valid_until, '2026-09-03T12:30:00.000Z');
  assert.equal(first.evidence_set_digest, second.evidence_set_digest);
  assert.equal(first.claim_id, second.claim_id);
});

test('wrong-subject evidence and forbidden or absent purpose authority fail closed', () => {
  const wrongSubject = objects();
  wrongSubject[0].rights.relationships.subjects = ['principal:other'];
  assert.throws(() => evaluate({ objects: wrongSubject }), /subject/);

  const forbidden = objects();
  forbidden[0].rights.forbidden_purposes = ['vendor-security-review'];
  forbidden[0].rights.allowed_purposes = [];
  assert.throws(() => evaluate({ objects: forbidden }), /purpose/);

  const absent = objects();
  absent[0].rights.allowed_purposes = ['different-purpose'];
  assert.throws(() => evaluate({ objects: absent }), /purpose/);
});

test('missing rights or review state fails closed rather than becoming ambient trust', () => {
  const noRights = objects();
  delete noRights[0].rights;
  assert.throws(() => evaluate({ objects: noRights }), /rights/);

  const noReview = objects();
  delete noReview[0].review;
  assert.throws(() => evaluate({ objects: noReview }), /review/);
});

test('disputed evidence and current challenges force unresolved even when the criterion says met', () => {
  const disputed = evaluate({
    objects: objects({ assertionOverrides: { epistemic_state: 'disputed' } })
  });
  assert.equal(disputed.result, 'unresolved');
  assert.ok(disputed.reason_codes.includes('evidence_disputed'));

  const challenged = evaluate({
    objects: objects({ reviewOverrides: { challenged: true } })
  });
  assert.equal(challenged.result, 'unresolved');
  assert.ok(challenged.reason_codes.includes('evidence_challenged'));
});

test('insufficient review floor and future review state cannot satisfy current evaluation', () => {
  const insufficient = evaluate({
    objects: objects({ reviewOverrides: { machine_reviewed: false } })
  });
  assert.equal(insufficient.result, 'unresolved');
  assert.ok(insufficient.reason_codes.includes('review_floor_unsatisfied'));

  const future = evaluate({
    objects: objects({ reviewOverrides: { updated_at: '2026-09-03T12:21:00.000Z' } })
  });
  assert.equal(future.result, 'unresolved');
  assert.ok(future.reason_codes.includes('review_state_future_dated'));
});

test('evidence outside the query window or future-dated evidence cannot make met', () => {
  const stale = evaluate({
    objects: objects({ assertionOverrides: { created_at: '2026-09-03T09:59:59.000Z' } })
  });
  assert.notEqual(stale.result, 'met');
  assert.ok(stale.reason_codes.includes('evidence_outside_window'));

  const future = evaluate({
    objects: objects({ assertionOverrides: { created_at: '2026-09-03T12:21:00.000Z' } })
  });
  assert.notEqual(future.result, 'met');
  assert.ok(future.reason_codes.includes('evidence_future_dated'));
});

test('a proposition containing false does not become a negative fact without criterion semantics', () => {
  const value = evaluate({
    objects: objects({ assertionOverrides: { proposition: 'false' } }),
    criterionEvaluator: criterion('not-demonstrated', {
      supporting_assertion_refs: [],
      reason_codes: ['criterion_not_demonstrated'],
      requires_complete_evidence: false
    })
  });
  assert.equal(value.result, 'not-demonstrated');
  assert.notEqual(value.result, 'not-met');
});

test('not-met requires independently verified criterion completeness', () => {
  const unresolved = evaluate({ criterionEvaluator: criterion('not-met') });
  assert.equal(unresolved.result, 'unresolved');
  assert.equal(unresolved.completeness, 'bounded-selected-evidence');
  assert.ok(unresolved.reason_codes.includes('criterion_completeness_unverified'));

  const complete = evaluate({
    criterionEvaluator: criterion('not-met'),
    completenessVerifier: ({ query: suppliedQuery, entries }) => {
      assert.equal(suppliedQuery.query_id, 'repq:security-review-1');
      assert.equal(entries.length, 1);
      return true;
    }
  });
  assert.equal(complete.result, 'not-met');
  assert.equal(complete.completeness, 'verified-complete-for-criterion');
});

test('criterion callbacks cannot smuggle score rank percentile or unknown fields', () => {
  for (const [field, value] of [['score', 1], ['rank', 1], ['percentile', 99], ['authority_granted', true]]) {
    assert.throws(
      () => evaluate({ criterionEvaluator: criterion('met', { [field]: value }) }),
      new RegExp(field)
    );
  }
});

test('domain purpose scope must explicitly bind reputation evidence to the query domain', () => {
  const wrongDomain = objects({ assertionOverrides: { purpose_scope: ['reputation:clinical-review'] } });
  assert.throws(() => evaluate({ objects: wrongDomain }), /domain|purpose_scope/);
});
