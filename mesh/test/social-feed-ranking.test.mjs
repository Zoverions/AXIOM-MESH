import assert from 'node:assert/strict';
import test from 'node:test';
import { digestObject } from '../src/lib/canonical.mjs';
import {
  SOCIAL_FEED_SCORE_DIMENSIONS,
  createSocialFeedCandidate,
  createSocialFeedObjectiveProfile,
  rankSocialFeed,
  validateSocialFeedCandidate
} from '../src/lib/social-feed-ranking.mjs';

const POLICY_DIGEST = digestObject({ policy: 'social-feed-test-policy-v0' });
const RELEVANCE_EVIDENCE = digestObject({ observation: 'relevance-fixture' });

function scores(overrides = {}) {
  return {
    relevance: 0,
    relationship: 0,
    recency: 0,
    novelty: 0,
    source_diversity: 0,
    perspective_expansion: 0,
    learning_value: 0,
    ...overrides
  };
}

function evidence(overrides = {}) {
  return {
    relevance: null,
    relationship: null,
    recency: null,
    novelty: null,
    source_diversity: null,
    perspective_expansion: null,
    learning_value: null,
    ...overrides
  };
}

function profile(weights = scores({ relevance: 1 }), mode = 'weighted', profileId = 'feed:profile') {
  return createSocialFeedObjectiveProfile({
    profileId,
    mode,
    weights
  });
}

function candidate(suffix, overrides = {}) {
  const base = {
    candidateId: 'candidate:' + suffix,
    publicationId: 'publication:' + suffix,
    publishedAt: '2026-09-18T04:30:00.000Z',
    sourceKind: 'local-publication',
    sourceReasons: ['local-corpus'],
    eligibility: {
      status: 'eligible',
      policy_digest: POLICY_DIGEST,
      reason_codes: []
    },
    signals: scores({ relevance: 0.5 }),
    signalEvidence: evidence()
  };
  return createSocialFeedCandidate({ ...base, ...overrides });
}

test('hard-ineligible candidate cannot rank regardless of semantic score', () => {
  const allowed = candidate('allowed', {
    signals: scores({ relevance: 0.1 })
  });
  const excluded = candidate('excluded', {
    eligibility: {
      status: 'excluded',
      policy_digest: POLICY_DIGEST,
      reason_codes: ['visibility-policy-excluded']
    },
    signals: scores({ relevance: 1, relationship: 1, learning_value: 1 })
  });

  const result = rankSocialFeed({
    profile: profile(),
    candidates: [excluded, allowed],
    limit: 10
  });

  assert.deepEqual(result.items.map(item => item.candidate_id), ['candidate:allowed']);
  assert.deepEqual(result.excluded.map(item => item.candidate_id), ['candidate:excluded']);
  assert.equal(result.excluded[0].reason_codes[0], 'visibility-policy-excluded');
});

test('zero-weight dimensions cannot change weighted ordering', () => {
  const first = candidate('a', {
    signals: scores({ relevance: 0.8, learning_value: 0 })
  });
  const second = candidate('b', {
    signals: scores({ relevance: 0.7, learning_value: 1 })
  });

  const result = rankSocialFeed({
    profile: profile(scores({ relevance: 1, learning_value: 0 })),
    candidates: [second, first],
    limit: 10
  });

  assert.deepEqual(result.items.map(item => item.candidate_id), ['candidate:a', 'candidate:b']);
});

test('user-owned objective weights can reorder the same eligible candidates', () => {
  const topical = candidate('topical', {
    signals: scores({ relevance: 1, learning_value: 0.1 })
  });
  const educational = candidate('educational', {
    signals: scores({ relevance: 0.1, learning_value: 1 })
  });

  const relevanceResult = rankSocialFeed({
    profile: profile(scores({ relevance: 1 }), 'weighted', 'feed:relevance'),
    candidates: [topical, educational],
    limit: 10
  });
  const learningResult = rankSocialFeed({
    profile: profile(scores({ learning_value: 1 }), 'weighted', 'feed:learning'),
    candidates: [topical, educational],
    limit: 10
  });

  assert.equal(relevanceResult.items[0].candidate_id, 'candidate:topical');
  assert.equal(learningResult.items[0].candidate_id, 'candidate:educational');
});

test('weighted tie-breaking is deterministic and independent of candidate input order', () => {
  const a = candidate('a', { signals: scores({ relevance: 0.5 }) });
  const b = candidate('b', { signals: scores({ relevance: 0.5 }) });
  const objective = profile();

  const left = rankSocialFeed({ profile: objective, candidates: [b, a], limit: 10 });
  const right = rankSocialFeed({ profile: objective, candidates: [a, b], limit: 10 });

  assert.deepEqual(left.items.map(item => item.candidate_id), ['candidate:a', 'candidate:b']);
  assert.deepEqual(right.items.map(item => item.candidate_id), ['candidate:a', 'candidate:b']);
  assert.equal(left.candidate_set_digest, right.candidate_set_digest);
});

test('chronological mode ignores semantic scores and uses canonical time plus id tie-break', () => {
  const olderHigh = candidate('older-high', {
    publishedAt: '2026-09-18T04:00:00.000Z',
    signals: scores({ relevance: 1, learning_value: 1 })
  });
  const newerLowB = candidate('newer-b', {
    publishedAt: '2026-09-18T05:00:00.000Z',
    signals: scores({ relevance: 0 })
  });
  const newerLowA = candidate('newer-a', {
    publishedAt: '2026-09-18T05:00:00.000Z',
    signals: scores({ relevance: 0 })
  });
  const chronological = profile(scores(), 'chronological', 'feed:chronological');

  const result = rankSocialFeed({
    profile: chronological,
    candidates: [newerLowB, olderHigh, newerLowA],
    limit: 10
  });

  assert.deepEqual(
    result.items.map(item => item.candidate_id),
    ['candidate:newer-a', 'candidate:newer-b', 'candidate:older-high']
  );
  assert.ok(result.items.every(item => item.score === null));
  assert.ok(result.items.every(item => item.why.contributors.length === 0));
  assert.ok(result.items.every(item => item.why.source_reasons.includes('chronological')));
});

test('weights are normalized by code and why output exposes actual signal contributions', () => {
  const objective = profile(scores({ relevance: 2 / 3, learning_value: 1 / 3 }), 'weighted', 'feed:explainable');
  const item = candidate('explainable', {
    sourceReasons: ['topic-match', 'user-requested-discovery'],
    signals: scores({ relevance: 0.9, learning_value: 0.6 }),
    signalEvidence: evidence({ relevance: RELEVANCE_EVIDENCE })
  });

  const total = SOCIAL_FEED_SCORE_DIMENSIONS.reduce(
    (sum, dimension) => sum + objective.weights[dimension],
    0
  );
  const result = rankSocialFeed({ profile: objective, candidates: [item], limit: 1 });

  assert.ok(Math.abs(total - 1) < 1e-9);
  assert.deepEqual(result.items[0].why.source_reasons, ['topic-match', 'user-requested-discovery']);
  assert.equal(result.items[0].why.contributors[0].dimension, 'relevance');
  assert.equal(result.items[0].why.contributors[0].evidence_ref, RELEVANCE_EVIDENCE);
  assert.equal(result.items[0].why.contributors[1].dimension, 'learning_value');
});

test('ranking result remains display-order-only and cannot acquire authority or side effects', () => {
  const result = rankSocialFeed({
    profile: profile(),
    candidates: [candidate('safe')],
    limit: 1
  });

  assert.equal(result.recommendation_effect, 'local-display-order-only');
  assert.equal(result.authority_effect, 'none');
  assert.equal(result.network_effect, 'none');
  assert.equal(result.persistence_effect, 'none');
  assert.equal(result.moderation_effect, 'none');
  assert.equal(result.visibility_policy_effect, 'none');
});

test('invalid score values missing dimensions and unknown score fields fail closed', () => {
  assert.throws(
    () => candidate('too-high', { signals: scores({ relevance: 1.01 }) }),
    /between 0 and 1/i
  );
  assert.throws(
    () => candidate('nan', { signals: scores({ relevance: Number.NaN }) }),
    /between 0 and 1/i
  );

  const missing = scores({ relevance: 0.5 });
  delete missing.learning_value;
  assert.throws(
    () => candidate('missing', { signals: missing }),
    /learning_value is required/i
  );

  assert.throws(
    () => candidate('unknown-signal', { signals: { ...scores(), engagement_magic: 1 } }),
    /unknown field engagement_magic/i
  );
});

test('unknown candidate fields and effect-boundary tampering fail closed', () => {
  const valid = candidate('tamper');

  const unknown = structuredClone(valid);
  unknown.visibility_override = 'allow';
  assert.throws(() => validateSocialFeedCandidate(unknown), /unknown field visibility_override/i);

  const authority = structuredClone(valid);
  authority.authority_effect = 'granted';
  assert.throws(() => validateSocialFeedCandidate(authority), /effect boundary is invalid/i);

  const evidenceSmuggling = structuredClone(valid);
  evidenceSmuggling.signal_evidence.relevance = 'not-a-digest';
  assert.throws(() => validateSocialFeedCandidate(evidenceSmuggling), /must contain 64-64 characters|invalid format/i);
});

test('duplicate candidate ids and duplicate publication ids fail closed', () => {
  const first = candidate('first');

  const duplicateCandidate = structuredClone(candidate('second'));
  duplicateCandidate.candidate_id = first.candidate_id;
  assert.throws(
    () => rankSocialFeed({ profile: profile(), candidates: [first, duplicateCandidate], limit: 10 }),
    /duplicate candidate_id/i
  );

  const duplicatePublication = structuredClone(candidate('third'));
  duplicatePublication.publication_id = first.publication_id;
  assert.throws(
    () => rankSocialFeed({ profile: profile(), candidates: [first, duplicatePublication], limit: 10 }),
    /duplicate publication_id/i
  );
});

test('ranking does not mutate caller profile or candidate documents', () => {
  const objective = profile(scores({ relevance: 0.75, novelty: 0.25 }));
  const items = [
    candidate('one', { signals: scores({ relevance: 0.9, novelty: 0.2 }) }),
    candidate('two', { signals: scores({ relevance: 0.7, novelty: 0.9 }) })
  ];
  const beforeProfile = structuredClone(objective);
  const beforeCandidates = structuredClone(items);

  rankSocialFeed({ profile: objective, candidates: items, limit: 10 });

  assert.deepEqual(objective, beforeProfile);
  assert.deepEqual(items, beforeCandidates);
});
