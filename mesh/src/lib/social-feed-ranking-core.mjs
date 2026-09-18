export const SOCIAL_FEED_SCORE_DIMENSIONS = Object.freeze([
  'relevance',
  'relationship',
  'recency',
  'novelty',
  'source_diversity',
  'perspective_expansion',
  'learning_value'
]);

const MODES = new Set(['weighted', 'chronological']);

function fail(message) {
  throw new TypeError(message);
}

function unit(value, name) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1) {
    fail(`${name} must be a finite number between 0 and 1`);
  }
  return Object.is(value, -0) ? 0 : value;
}

function exactDimensions(value, name) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    fail(`${name} must be an object`);
  }
  const keys = Object.keys(value);
  if (
    keys.length !== SOCIAL_FEED_SCORE_DIMENSIONS.length
    || SOCIAL_FEED_SCORE_DIMENSIONS.some(dimension => !Object.hasOwn(value, dimension))
    || keys.some(key => !SOCIAL_FEED_SCORE_DIMENSIONS.includes(key))
  ) {
    fail(`${name} must contain the exact social feed score dimensions`);
  }
}

function round(value) {
  return Number(value.toFixed(12));
}

function validatedWeights(weights, mode) {
  if (!MODES.has(mode)) fail('social feed ranking mode is unsupported');
  exactDimensions(weights, 'social feed ranking weights');
  const normalized = {};
  let total = 0;
  for (const dimension of SOCIAL_FEED_SCORE_DIMENSIONS) {
    normalized[dimension] = unit(weights[dimension], `social feed ranking weights.${dimension}`);
    total += normalized[dimension];
  }
  if (mode === 'chronological') {
    if (total !== 0) fail('chronological feed weights must all be zero');
  } else if (Math.abs(total - 1) > 1e-9) {
    fail('weighted feed weights must sum to one');
  }
  return Object.freeze(normalized);
}

function validatedCandidate(candidate, index) {
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
    fail(`social feed candidate[${index}] must be an object`);
  }
  if (typeof candidate.candidate_id !== 'string' || candidate.candidate_id.length === 0) {
    fail(`social feed candidate[${index}].candidate_id is invalid`);
  }
  if (typeof candidate.published_at !== 'string' || candidate.published_at.length === 0) {
    fail(`social feed candidate[${index}].published_at is invalid`);
  }
  if (
    !candidate.eligibility
    || !['eligible', 'excluded'].includes(candidate.eligibility.status)
  ) {
    fail(`social feed candidate[${index}].eligibility is invalid`);
  }
  exactDimensions(candidate.signals, `social feed candidate[${index}].signals`);
  for (const dimension of SOCIAL_FEED_SCORE_DIMENSIONS) {
    unit(candidate.signals[dimension], `social feed candidate[${index}].signals.${dimension}`);
  }
  return candidate;
}

export function normalizeSocialFeedWeights(weights, mode = 'weighted') {
  if (!MODES.has(mode)) fail('social feed ranking mode is unsupported');
  exactDimensions(weights, 'social feed objective weights');
  const bounded = {};
  let total = 0;
  for (const dimension of SOCIAL_FEED_SCORE_DIMENSIONS) {
    bounded[dimension] = unit(weights[dimension], `social feed objective weights.${dimension}`);
    total += bounded[dimension];
  }
  if (mode === 'chronological') {
    if (total !== 0) fail('chronological feed objective weights must all be zero');
    return Object.freeze(bounded);
  }
  if (total <= 0) fail('weighted feed objective must assign positive weight');

  const normalized = {};
  for (const dimension of SOCIAL_FEED_SCORE_DIMENSIONS) {
    normalized[dimension] = round(bounded[dimension] / total);
  }
  const normalizedTotal = SOCIAL_FEED_SCORE_DIMENSIONS.reduce(
    (sum, dimension) => sum + normalized[dimension],
    0
  );
  const first = SOCIAL_FEED_SCORE_DIMENSIONS.find(dimension => normalized[dimension] > 0);
  normalized[first] = round(normalized[first] + round(1 - normalizedTotal));
  return Object.freeze(normalized);
}

export function scoreSocialFeedCandidate(candidate, profile) {
  const weights = validatedWeights(profile.weights, profile.mode);
  return round(SOCIAL_FEED_SCORE_DIMENSIONS.reduce(
    (sum, dimension) => sum + weights[dimension] * candidate.signals[dimension],
    0
  ));
}

export function socialFeedContributors(candidate, profile) {
  const weights = validatedWeights(profile.weights, profile.mode);
  if (profile.mode === 'chronological') return Object.freeze([]);
  return Object.freeze(SOCIAL_FEED_SCORE_DIMENSIONS.map(dimension => ({
    dimension,
    weight: weights[dimension],
    signal: candidate.signals[dimension],
    contribution: round(weights[dimension] * candidate.signals[dimension]),
    evidence_ref: candidate.signal_evidence?.[dimension] ?? null
  })).filter(item => item.weight > 0 && item.contribution > 0)
    .sort((left, right) => (
      right.contribution - left.contribution
      || left.dimension.localeCompare(right.dimension)
    )));
}

export function rankSocialFeedCore({ profile, candidates }) {
  if (!profile || typeof profile !== 'object' || Array.isArray(profile)) {
    fail('social feed ranking profile must be an object');
  }
  if (!MODES.has(profile.mode)) fail('social feed ranking mode is unsupported');
  validatedWeights(profile.weights, profile.mode);
  if (!Array.isArray(candidates)) fail('social feed ranking candidates must be an array');

  const checked = candidates.map(validatedCandidate);
  const eligible = checked.filter(candidate => candidate.eligibility.status === 'eligible');
  const excluded = checked.filter(candidate => candidate.eligibility.status === 'excluded')
    .slice()
    .sort((left, right) => left.candidate_id.localeCompare(right.candidate_id));

  const ordered = eligible.slice();
  if (profile.mode === 'chronological') {
    ordered.sort((left, right) => (
      right.published_at.localeCompare(left.published_at)
      || left.candidate_id.localeCompare(right.candidate_id)
    ));
  } else {
    ordered.sort((left, right) => (
      scoreSocialFeedCandidate(right, profile) - scoreSocialFeedCandidate(left, profile)
      || left.candidate_id.localeCompare(right.candidate_id)
    ));
  }

  return Object.freeze({
    items: Object.freeze(ordered.map(candidate => Object.freeze({
      candidate,
      score: profile.mode === 'chronological'
        ? null
        : scoreSocialFeedCandidate(candidate, profile),
      contributors: socialFeedContributors(candidate, profile)
    }))),
    excluded: Object.freeze(excluded)
  });
}
