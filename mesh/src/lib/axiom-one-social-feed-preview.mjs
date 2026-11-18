import {
  SOCIAL_FEED_SCORE_DIMENSIONS,
  normalizeSocialFeedWeights,
  rankSocialFeedCore
} from './social-feed-ranking-core.mjs';

const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,191}$/;
const DIGEST = /^[a-f0-9]{64}$/;
const UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const PUBLICATION_STATUSES = new Set(['active', 'superseded', 'retracted']);

export const AXIOM_ONE_FEED_DIMENSION_SUPPORT = Object.freeze({
  relevance: 'unavailable',
  relationship: 'owner-local',
  recency: 'snapshot-relative',
  novelty: 'original-vs-revision',
  source_diversity: 'persona-frequency',
  perspective_expansion: 'unavailable',
  learning_value: 'unavailable'
});

export const DEFAULT_AXIOM_ONE_FEED_WEIGHTS = Object.freeze({
  relevance: 0,
  relationship: 0.2,
  recency: 0.5,
  novelty: 0.15,
  source_diversity: 0.15,
  perspective_expansion: 0,
  learning_value: 0
});

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function validTimestamp(value) {
  if (typeof value !== 'string' || !UTC.test(value)) return false;
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString() === value;
}

function validLocalPublication(value) {
  if (!isPlainObject(value) || !isPlainObject(value.publication)) return false;
  const projection = value.publication;
  if (typeof value.projection_digest !== 'string' || !DIGEST.test(value.projection_digest)) return false;
  if (projection.projection_digest !== value.projection_digest) return false;
  if (typeof value.actor_id !== 'string' || !IDENTIFIER.test(value.actor_id)) return false;
  if (typeof value.persona_id !== 'string' || !IDENTIFIER.test(value.persona_id)) return false;
  if (projection.persona_id !== undefined && projection.persona_id !== value.persona_id) return false;
  if (!PUBLICATION_STATUSES.has(value.status)) return false;
  if (!validTimestamp(projection.created_at)) return false;
  if (projection.supersedes_digest !== null && !DIGEST.test(projection.supersedes_digest ?? '')) return false;
  return true;
}

function chronologicalLocal(publications) {
  const valid = publications.filter(validLocalPublication);
  const active = valid
    .filter(item => item.status === 'active')
    .slice()
    .sort((left, right) => (
      right.publication.created_at.localeCompare(left.publication.created_at)
      || left.projection_digest.localeCompare(right.projection_digest)
    ));
  const excluded = valid
    .filter(item => item.status !== 'active')
    .slice()
    .sort((left, right) => left.projection_digest.localeCompare(right.projection_digest));
  return { active, excluded };
}

function buildCandidates(publications) {
  if (!Array.isArray(publications)) throw new TypeError('owner-local social publications must be an array');
  if (publications.some(item => !validLocalPublication(item))) {
    throw new TypeError('owner-local social publication wrapper is invalid');
  }

  const chronological = publications
    .slice()
    .sort((left, right) => (
      right.publication.created_at.localeCompare(left.publication.created_at)
      || left.projection_digest.localeCompare(right.projection_digest)
    ));
  const active = chronological.filter(item => item.status === 'active');
  const activePosition = new Map(active.map((item, index) => [item.projection_digest, index]));
  const personaCounts = new Map();
  for (const item of active) {
    personaCounts.set(item.persona_id, (personaCounts.get(item.persona_id) ?? 0) + 1);
  }

  return publications.map(item => {
    const position = activePosition.get(item.projection_digest);
    const recency = item.status !== 'active'
      ? 0
      : active.length <= 1
        ? 1
        : 1 - (position / (active.length - 1));
    const sourceDiversity = item.status === 'active'
      ? 1 / (personaCounts.get(item.persona_id) ?? 1)
      : 0;
    return {
      candidate_id: item.projection_digest,
      published_at: item.publication.created_at,
      eligibility: { status: item.status === 'active' ? 'eligible' : 'excluded' },
      signals: {
        relevance: 0,
        relationship: item.status === 'active' ? 1 : 0,
        recency,
        novelty: item.status === 'active' && item.publication.supersedes_digest === null ? 1 : 0,
        source_diversity: sourceDiversity,
        perspective_expansion: 0,
        learning_value: 0
      },
      source_reasons: ['local-corpus']
    };
  });
}

function profileFor(mode, weights) {
  if (mode === 'chronological') {
    return {
      mode,
      weights: Object.freeze(Object.fromEntries(
        SOCIAL_FEED_SCORE_DIMENSIONS.map(dimension => [dimension, 0])
      ))
    };
  }
  if (mode !== 'weighted') throw new TypeError('owner-local feed mode is unsupported');
  return {
    mode,
    weights: normalizeSocialFeedWeights(weights, mode)
  };
}

function fallback(publications, requestedMode, reason) {
  const source = Array.isArray(publications) ? publications : [];
  const { active, excluded } = chronologicalLocal(source);
  return Object.freeze({
    requested_mode: requestedMode,
    effective_mode: 'chronological-fallback',
    fallback_reason: reason,
    dimension_support: AXIOM_ONE_FEED_DIMENSION_SUPPORT,
    items: Object.freeze(active.map(publication => Object.freeze({
      publication,
      score: null,
      why: Object.freeze({
        source_reasons: Object.freeze(['local-corpus', 'chronological']),
        contributors: Object.freeze([])
      })
    }))),
    excluded: Object.freeze(excluded)
  });
}

export function buildAxiomOneSocialFeedPreview({
  publications,
  mode = 'chronological',
  weights = DEFAULT_AXIOM_ONE_FEED_WEIGHTS
} = {}) {
  try {
    const candidates = buildCandidates(publications);
    const profile = profileFor(mode, weights);
    const ranked = rankSocialFeedCore({ profile, candidates });
    const byDigest = new Map(publications.map(item => [item.projection_digest, item]));
    const items = ranked.items.map(item => Object.freeze({
      publication: byDigest.get(item.candidate.candidate_id),
      score: item.score,
      why: Object.freeze({
        source_reasons: Object.freeze([
          ...item.candidate.source_reasons,
          ...(mode === 'chronological' ? ['chronological'] : [])
        ]),
        contributors: item.contributors
      })
    }));
    const excluded = ranked.excluded.map(candidate => byDigest.get(candidate.candidate_id));
    return Object.freeze({
      requested_mode: mode,
      effective_mode: mode,
      fallback_reason: null,
      dimension_support: AXIOM_ONE_FEED_DIMENSION_SUPPORT,
      items: Object.freeze(items),
      excluded: Object.freeze(excluded)
    });
  } catch {
    return fallback(publications, mode, 'invalid-ranking-evidence');
  }
}
