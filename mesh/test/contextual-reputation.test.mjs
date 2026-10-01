import test from 'node:test';
import assert from 'node:assert/strict';
import { digestObject } from '../src/lib/canonical.mjs';
import { REPUTATION_QUERY_SCHEMA } from '../src/domain/reputation-query.mjs';
import { INFORMATION_RIGHTS_SCHEMA } from '../src/domain/information-rights.mjs';
import {
  EVIDENCE_ASSERTION_SCHEMA,
  EVIDENCE_REVIEW_SCHEMA
} from '../src/domain/evidence-graph.mjs';
import { evaluateContextualReputation } from '../src/domain/contextual-reputation.mjs';

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

function stored(object_kind, object) {
  const object_ref = object_kind === 'evidence-assertion' ? object.assertion_id : object.object_ref;
  return {
    object_ref,
    object_kind,
    object_digest: digestObject(object),
    lifecycle_status: 'active',
    created_at: '2026-09-03T12:00:00.000Z',
    updated_at: '2026-09-03T12:06:00.000Z',
    object
  };
}

function objects({ assertionOverrides = {}, rightsOverrides = {}, reviewOverrides = {}, includeRights = true, includeReview = true } = {}) {
  const items = [stored('evidence-assertion', assertion(assertionOverrides))];
  if (includeRights) items.push(stored('information-rights', rights(rightsOverrides)));
  if (includeReview) items.push(stored('evidence-review', review(reviewOverrides)));
  return items;
}

function criterion(result = 'met', overrides = {}) {
  return () => ({
    result,
    supporting_assertion_refs: result === 'met' ? ['assertion:finding-1'] : [],
    contrary_assertion_refs: [],
    neutral_assertion_refs: [],
    reason_codes: [],
    recommended_ttl_seconds: 600,
    requires_complete_evidence: result === 'not-met',
    ...overrides
  });
}

function evaluate(overrides = {}) {
  return evaluateContextualReputation({
    query: query(),
    objects: objects(),
    accessDecisionDigests: [ACCESS_DIGEST],
    criterionEvaluator: criterion(),
    completenessVerifier: () => ({ complete: false }),
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
  assert.equal(first.evaluator_ref, 'criterion:verified-findings-v1');
  assert.equal(first.valid_until, '2026-09-03T12:30:00.000Z');
  assert.equal(first.evidence_set_digest, second.evidence_set_digest);
  assert.equal(first.claim_id, second.claim_id);
});

test('wrong-subject evidence and forbidden purpose fail closed', () => {
  const wrongSubject = objects();
  wrongSubject.find(item => item.object_kind === 'information-rights').object.relationships.subjects = ['principal:other'];
  assert.throws(() => evaluate({ objects: wrongSubject }), /subject binding/);

  const forbidden = objects();
  const envelope = forbidden.find(item => item.object_kind === 'information-rights').object;
  envelope.forbidden_purposes = ['vendor-security-review'];
  envelope.allowed_purposes = [];
  assert.throws(() => evaluate({ objects: forbidden }), /purpose/);
});

test('missing rights or review state becomes explicit unresolved rather than ambient trust', () => {
  const noRights = evaluate({ objects: objects({ includeRights: false }) });
  assert.equal(noRights.result, 'unresolved');
  assert.ok(noRights.reason_codes.includes('rights_missing'));

  const noReview = evaluate({ objects: objects({ includeReview: false }) });
  assert.equal(noReview.result, 'unresolved');
  assert.ok(noReview.reason_codes.includes('review_missing'));
});

test('disputed or unadjudicated challenged supporting evidence forces unresolved', () => {
  const disputed = evaluate({ objects: objects({ assertionOverrides: { epistemic_state: 'disputed' } }) });
  assert.equal(disputed.result, 'unresolved');
  assert.ok(disputed.reason_codes.includes('evidence_disputed'));

  const challenged = evaluate({ objects: objects({ reviewOverrides: { challenged: true } }) });
  assert.equal(challenged.result, 'unresolved');
  assert.ok(challenged.reason_codes.includes('evidence_challenged'));
});

test('insufficient, stale, or future review state cannot silently satisfy currentness', () => {
  const insufficient = evaluate({ objects: objects({ reviewOverrides: { machine_reviewed: false } }) });
  assert.equal(insufficient.result, 'unresolved');
  assert.ok(insufficient.reason_codes.includes('review_floor_unsatisfied'));

  const stale = evaluate({ objects: objects({ reviewOverrides: { updated_at: '2026-09-03T09:59:59.000Z' } }) });
  assert.equal(stale.result, 'unresolved');
  assert.ok(stale.reason_codes.includes('review_outside_window'));

  const future = evaluate({ objects: objects({ reviewOverrides: { updated_at: '2026-09-03T12:21:00.000Z' } }) });
  assert.equal(future.result, 'unresolved');
  assert.ok(future.reason_codes.includes('review_future_dated'));
});

test('evidence outside the query domain or evidence window cannot satisfy the criterion', () => {
  const wrongDomain = evaluate({ objects: objects({ assertionOverrides: { purpose_scope: ['reputation:clinical-review'] } }) });
  assert.equal(wrongDomain.result, 'unresolved');
  assert.ok(wrongDomain.reason_codes.includes('evidence_domain_mismatch'));

  const stale = evaluate({ objects: objects({ assertionOverrides: { created_at: '2026-09-03T09:59:59.000Z' } }) });
  assert.equal(stale.result, 'unresolved');
  assert.ok(stale.reason_codes.includes('evidence_outside_window'));

  const future = evaluate({ objects: objects({ assertionOverrides: { created_at: '2026-09-03T12:21:00.000Z' } }) });
  assert.equal(future.result, 'unresolved');
  assert.ok(future.reason_codes.includes('evidence_future_dated'));
});

test('criterion output is closed-world and cannot smuggle scores, ranks, or authority', () => {
  for (const [field, value] of [['score', 1], ['rank', 1], ['percentile', 99], ['authority_granted', true], ['other', true]]) {
    assert.throws(
      () => evaluate({ criterionEvaluator: criterion('met', { [field]: value }) }),
      new RegExp(field)
    );
  }
});

test('not-met requires independently verified criterion completeness', () => {
  const unresolved = evaluate({ criterionEvaluator: criterion('not-met') });
  assert.equal(unresolved.result, 'unresolved');
  assert.equal(unresolved.completeness, 'bounded-selected-evidence');
  assert.ok(unresolved.reason_codes.includes('criterion_completeness_unverified'));

  const complete = evaluate({
    criterionEvaluator: criterion('not-met'),
    completenessVerifier: ({ query: suppliedQuery, objects: suppliedObjects, now }) => {
      assert.equal(suppliedQuery.query_id, 'repq:security-review-1');
      assert.equal(suppliedObjects.length, 3);
      assert.equal(now, NOW);
      return { complete: true };
    }
  });
  assert.equal(complete.result, 'not-met');
  assert.equal(complete.completeness, 'verified-complete-for-criterion');
});

test('criterion semantics, not proposition text, determine negative or absence results', () => {
  const value = evaluate({
    objects: objects({ assertionOverrides: { proposition: 'false' } }),
    criterionEvaluator: criterion('not-demonstrated', {
      supporting_assertion_refs: [],
      neutral_assertion_refs: ['assertion:finding-1'],
      reason_codes: ['criterion_not_demonstrated'],
      requires_complete_evidence: false
    })
  });
  assert.equal(value.result, 'not-demonstrated');
  assert.notEqual(value.result, 'not-met');
});
