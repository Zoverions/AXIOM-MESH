import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import {
  AXIOM_ONE_FEED_DIMENSION_SUPPORT,
  DEFAULT_AXIOM_ONE_FEED_WEIGHTS,
  buildAxiomOneSocialFeedPreview
} from '../src/lib/axiom-one-social-feed-preview.mjs';

const digest = character => character.repeat(64);

function publication({
  id,
  createdAt,
  status = 'active',
  supersedesDigest = null,
  personaId = 'persona.local'
}) {
  return {
    projection_digest: digest(id),
    actor_id: 'actor.local',
    persona_id: personaId,
    status,
    publication: {
      projection_digest: digest(id),
      created_at: createdAt,
      supersedes_digest: supersedesDigest,
      content: { text: `Publication ${id}` }
    }
  };
}

const olderOriginal = publication({
  id: 'a',
  createdAt: '2026-09-18T01:00:00.000Z'
});
const newerRevision = publication({
  id: 'b',
  createdAt: '2026-09-18T02:00:00.000Z',
  supersedesDigest: digest('c')
});
const retractedNewest = publication({
  id: 'd',
  createdAt: '2026-09-18T03:00:00.000Z',
  status: 'retracted'
});

test('S2A chronological feed is always available and hard-ineligible history stays out of feed items', () => {
  const result = buildAxiomOneSocialFeedPreview({
    publications: [retractedNewest, newerRevision, olderOriginal],
    mode: 'chronological',
    weights: DEFAULT_AXIOM_ONE_FEED_WEIGHTS
  });

  assert.equal(result.requested_mode, 'chronological');
  assert.equal(result.effective_mode, 'chronological');
  assert.equal(result.fallback_reason, null);
  assert.deepEqual(result.items.map(item => item.publication.projection_digest), [
    newerRevision.projection_digest,
    olderOriginal.projection_digest
  ]);
  assert.deepEqual(result.excluded.map(item => item.projection_digest), [
    retractedNewest.projection_digest
  ]);
  assert.equal(result.items.every(item => item.why.source_reasons.includes('local-corpus')), true);
});

test('S2A user-owned weights change ordering only and why contributors match the actual core result', () => {
  const recency = buildAxiomOneSocialFeedPreview({
    publications: [newerRevision, olderOriginal],
    mode: 'weighted',
    weights: {
      relevance: 0,
      relationship: 0,
      recency: 1,
      novelty: 0,
      source_diversity: 0,
      perspective_expansion: 0,
      learning_value: 0
    }
  });
  const novelty = buildAxiomOneSocialFeedPreview({
    publications: [newerRevision, olderOriginal],
    mode: 'weighted',
    weights: {
      relevance: 0,
      relationship: 0,
      recency: 0,
      novelty: 1,
      source_diversity: 0,
      perspective_expansion: 0,
      learning_value: 0
    }
  });

  assert.deepEqual(recency.items.map(item => item.publication.projection_digest), [
    newerRevision.projection_digest,
    olderOriginal.projection_digest
  ]);
  assert.deepEqual(novelty.items.map(item => item.publication.projection_digest), [
    olderOriginal.projection_digest,
    newerRevision.projection_digest
  ]);
  assert.deepEqual(
    new Set(recency.items.map(item => item.publication.projection_digest)),
    new Set(novelty.items.map(item => item.publication.projection_digest))
  );
  assert.equal(recency.items[0].why.contributors[0].dimension, 'recency');
  assert.equal(novelty.items[0].why.contributors[0].dimension, 'novelty');
});

test('S2A fails deterministically to owner-local chronological display when ranking evidence is malformed', () => {
  const malformed = structuredClone(newerRevision);
  malformed.publication.created_at = 'not-a-time';
  const result = buildAxiomOneSocialFeedPreview({
    publications: [malformed, olderOriginal],
    mode: 'weighted',
    weights: DEFAULT_AXIOM_ONE_FEED_WEIGHTS
  });

  assert.equal(result.requested_mode, 'weighted');
  assert.equal(result.effective_mode, 'chronological-fallback');
  assert.equal(result.fallback_reason, 'invalid-ranking-evidence');
  assert.deepEqual(result.items.map(item => item.publication.projection_digest), [
    olderOriginal.projection_digest
  ]);
});

test('S2A accepts only the owner-local snapshot wrapper shape; remote-review-like objects cannot enter the feed', () => {
  const remoteReviewLike = {
    projection_digest: digest('e'),
    status: 'active',
    created_at: '2026-09-18T04:00:00.000Z',
    content: { text: 'Remote review object' }
  };
  const result = buildAxiomOneSocialFeedPreview({
    publications: [remoteReviewLike, olderOriginal],
    mode: 'weighted',
    weights: DEFAULT_AXIOM_ONE_FEED_WEIGHTS
  });

  assert.equal(result.effective_mode, 'chronological-fallback');
  assert.deepEqual(result.items.map(item => item.publication.projection_digest), [
    olderOriginal.projection_digest
  ]);
});

test('S2A advertises only bounded metadata-derived signals and keeps semantic dimensions unsupported', () => {
  assert.deepEqual(AXIOM_ONE_FEED_DIMENSION_SUPPORT, Object.freeze({
    relevance: 'unavailable',
    relationship: 'owner-local',
    recency: 'snapshot-relative',
    novelty: 'original-vs-revision',
    source_diversity: 'persona-frequency',
    perspective_expansion: 'unavailable',
    learning_value: 'unavailable'
  }));
  assert.equal(DEFAULT_AXIOM_ONE_FEED_WEIGHTS.relevance, 0);
  assert.equal(DEFAULT_AXIOM_ONE_FEED_WEIGHTS.perspective_expansion, 0);
  assert.equal(DEFAULT_AXIOM_ONE_FEED_WEIGHTS.learning_value, 0);
});

test('S2A browser helper remains effect-inert and free of network, browser storage, credentials, and mutation authority', async () => {
  const source = await readFile(new URL('../src/lib/axiom-one-social-feed-preview.mjs', import.meta.url), 'utf8');
  for (const forbidden of [
    'fetch(',
    'localStorage',
    'sessionStorage',
    'indexedDB',
    'document.cookie',
    'authorization',
    'credential',
    'intents.submit',
    'social_remote_review',
    'social.publication.create',
    'social.publication.supersede',
    'social.publication.retract'
  ]) {
    assert.equal(source.includes(forbidden), false, `helper must not contain ${forbidden}`);
  }
});
