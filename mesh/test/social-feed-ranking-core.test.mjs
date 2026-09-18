import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  SOCIAL_FEED_SCORE_DIMENSIONS,
  normalizeSocialFeedWeights,
  rankSocialFeedCore
} from '../src/lib/social-feed-ranking-core.mjs';

function dimensions(overrides = {}) {
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

function candidate(id, {
  publishedAt = '2026-09-18T05:00:00.000Z',
  eligibility = 'eligible',
  signals = dimensions({ relevance: 0.5 }),
  evidence = dimensions()
} = {}) {
  return {
    candidate_id: id,
    published_at: publishedAt,
    eligibility: { status: eligibility },
    signals,
    signal_evidence: Object.fromEntries(
      Object.entries(evidence).map(([key, value]) => [key, value || null])
    )
  };
}

test('browser-safe core exports the same exact score dimension vocabulary', () => {
  assert.deepEqual([...SOCIAL_FEED_SCORE_DIMENSIONS], [
    'relevance',
    'relationship',
    'recency',
    'novelty',
    'source_diversity',
    'perspective_expansion',
    'learning_value'
  ]);
});

test('core normalizes weighted objectives and keeps chronological weights zero', () => {
  const weighted = normalizeSocialFeedWeights(
    dimensions({ relevance: 1, learning_value: 1 }),
    'weighted'
  );
  assert.equal(weighted.relevance, 0.5);
  assert.equal(weighted.learning_value, 0.5);
  assert.equal(
    SOCIAL_FEED_SCORE_DIMENSIONS.reduce((sum, key) => sum + weighted[key], 0),
    1
  );

  const chronological = normalizeSocialFeedWeights(dimensions(), 'chronological');
  assert.deepEqual(chronological, dimensions());
  assert.throws(
    () => normalizeSocialFeedWeights(dimensions({ recency: 1 }), 'chronological'),
    /must all be zero/i
  );
});

test('core applies hard eligibility before weighted ordering', () => {
  const profile = {
    mode: 'weighted',
    weights: normalizeSocialFeedWeights(dimensions({ relevance: 1 }), 'weighted')
  };
  const result = rankSocialFeedCore({
    profile,
    candidates: [
      candidate('candidate:excluded', {
        eligibility: 'excluded',
        signals: dimensions({ relevance: 1 })
      }),
      candidate('candidate:allowed', {
        signals: dimensions({ relevance: 0.1 })
      })
    ]
  });

  assert.deepEqual(result.items.map(item => item.candidate.candidate_id), [
    'candidate:allowed'
  ]);
  assert.deepEqual(result.excluded.map(item => item.candidate_id), [
    'candidate:excluded'
  ]);
});

test('core weighted ordering and contributor explanation are deterministic', () => {
  const profile = {
    mode: 'weighted',
    weights: normalizeSocialFeedWeights(
      dimensions({ relevance: 0.75, learning_value: 0.25 }),
      'weighted'
    )
  };
  const candidates = [
    candidate('candidate:b', {
      signals: dimensions({ relevance: 0.5, learning_value: 1 })
    }),
    candidate('candidate:a', {
      signals: dimensions({ relevance: 0.75, learning_value: 0.25 })
    })
  ];

  const first = rankSocialFeedCore({ profile, candidates });
  const second = rankSocialFeedCore({ profile, candidates: [...candidates].reverse() });

  assert.deepEqual(
    first.items.map(item => item.candidate.candidate_id),
    second.items.map(item => item.candidate.candidate_id)
  );
  assert.equal(first.items[0].contributors[0].dimension, 'relevance');
  assert.ok(first.items[0].contributors[0].contribution > 0);
});

test('core chronological ordering ignores semantic scores and uses id tie-break', () => {
  const profile = {
    mode: 'chronological',
    weights: normalizeSocialFeedWeights(dimensions(), 'chronological')
  };
  const result = rankSocialFeedCore({
    profile,
    candidates: [
      candidate('candidate:b', {
        publishedAt: '2026-09-18T06:00:00.000Z',
        signals: dimensions({ relevance: 1 })
      }),
      candidate('candidate:older', {
        publishedAt: '2026-09-18T05:00:00.000Z',
        signals: dimensions({ relevance: 1 })
      }),
      candidate('candidate:a', {
        publishedAt: '2026-09-18T06:00:00.000Z',
        signals: dimensions({ relevance: 0 })
      })
    ]
  });

  assert.deepEqual(result.items.map(item => item.candidate.candidate_id), [
    'candidate:a',
    'candidate:b',
    'candidate:older'
  ]);
  assert.ok(result.items.every(item => item.score === null));
  assert.ok(result.items.every(item => item.contributors.length === 0));
});

test('core fails closed on malformed dimensions and out-of-range values', () => {
  const profile = {
    mode: 'weighted',
    weights: normalizeSocialFeedWeights(dimensions({ relevance: 1 }), 'weighted')
  };
  assert.throws(
    () => rankSocialFeedCore({
      profile,
      candidates: [candidate('candidate:bad', {
        signals: { ...dimensions(), unknown: 1 }
      })]
    }),
    /exact social feed score dimensions/i
  );
  assert.throws(
    () => rankSocialFeedCore({
      profile,
      candidates: [candidate('candidate:bad', {
        signals: dimensions({ relevance: 2 })
      })]
    }),
    /between 0 and 1/i
  );
});

test('core rejects malformed candidate identity and non-canonical timestamps', () => {
  const profile = {
    mode: 'chronological',
    weights: normalizeSocialFeedWeights(dimensions(), 'chronological')
  };

  const badId = candidate('candidate with spaces');
  assert.throws(
    () => rankSocialFeedCore({ profile, candidates: [badId] }),
    /candidate_id is invalid/i
  );

  const badTime = candidate('candidate:bad-time', {
    publishedAt: '2026-09-18T06:00:00Z'
  });
  assert.throws(
    () => rankSocialFeedCore({ profile, candidates: [badTime] }),
    /published_at is invalid/i
  );
});

test('shared ranking core has no Node, canonical, crypto, network, or persistence import', async () => {
  const source = await readFile(
    new URL('../src/lib/social-feed-ranking-core.mjs', import.meta.url),
    'utf8'
  );
  assert.doesNotMatch(source, /^\s*import\s/m);
  assert.doesNotMatch(source, /node:|canonical|crypto|fetch\s*\(|XMLHttpRequest|localStorage|sessionStorage|indexedDB|document\.cookie/);
});
