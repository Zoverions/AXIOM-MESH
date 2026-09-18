import {
  ValidationError,
  assertPlainObject,
  assertString,
  digestObject
} from './canonical.mjs';

export const SOCIAL_FEED_OBJECTIVE_PROFILE_SCHEMA = 'axiom-social-feed-objective-profile.v0';
export const SOCIAL_FEED_CANDIDATE_SCHEMA = 'axiom-social-feed-candidate.v0';
export const SOCIAL_FEED_RESULT_SCHEMA = 'axiom-social-feed-result.v0';

const VERSION = 0;
const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/;
const DIGEST = /^[a-f0-9]{64}$/;
const UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const MODES = new Set(['weighted', 'chronological']);
const SOURCE_KINDS = new Set(['local-publication', 'admitted-remote-observation']);
const SOURCE_REASONS = new Set([
  'followed-source', 'circle-curated', 'topic-match', 'user-requested-discovery',
  'underrepresented-source', 'chronological', 'local-corpus', 'admitted-remote-observation'
]);

export const SOCIAL_FEED_SCORE_DIMENSIONS = Object.freeze([
  'relevance', 'relationship', 'recency', 'novelty', 'source_diversity',
  'perspective_expansion', 'learning_value'
]);

const PROFILE_FIELDS = [
  'schema', 'version', 'status', 'profile_id', 'mode', 'weights',
  'authority_effect', 'network_effect', 'persistence_effect', 'moderation_effect'
];
const CANDIDATE_FIELDS = [
  'schema', 'version', 'status', 'candidate_id', 'publication_id', 'published_at',
  'source_kind', 'source_reasons', 'eligibility', 'signals', 'signal_evidence',
  'authority_effect', 'network_effect', 'persistence_effect', 'moderation_effect'
];
const ELIGIBILITY_FIELDS = ['status', 'policy_digest', 'reason_codes'];

function exact(value, fields, name) {
  const allowed = new Set(fields);
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) throw new ValidationError(name + ' contains unknown field ' + key);
  }
  for (const key of fields) {
    if (!Object.hasOwn(value, key)) throw new ValidationError(name + '.' + key + ' is required');
  }
}

function id(value, name) {
  return assertString(value, name, { min: 1, max: 160, pattern: IDENTIFIER });
}

function digest(value, name) {
  return assertString(value, name, { min: 64, max: 64, pattern: DIGEST });
}

function timestamp(value, name) {
  if (typeof value !== 'string' || !UTC.test(value)) {
    throw new ValidationError(name + ' must be a canonical UTC timestamp');
  }
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString() !== value) {
    throw new ValidationError(name + ' must be a canonical UTC timestamp');
  }
  return value;
}

function unit(value, name) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1) {
    throw new ValidationError(name + ' must be a finite number between 0 and 1');
  }
  return Object.is(value, -0) ? 0 : value;
}

function limit(value) {
  if (!Number.isSafeInteger(value) || value < 1 || value > 200) {
    throw new ValidationError('social feed ranking limit must be an integer between 1 and 200');
  }
  return value;
}

function round(value) {
  return Number(value.toFixed(12));
}

function freeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}

function dimensionRecord(input, name, evidence = false) {
  const value = assertPlainObject(input, name);
  exact(value, SOCIAL_FEED_SCORE_DIMENSIONS, name);
  const out = {};
  for (const dimension of SOCIAL_FEED_SCORE_DIMENSIONS) {
    const item = value[dimension];
    out[dimension] = evidence
      ? (item === null ? null : digest(item, name + '.' + dimension))
      : unit(item, name + '.' + dimension);
  }
  return Object.freeze(out);
}

function normalizeWeights(input, mode) {
  const weights = dimensionRecord(input, 'social feed objective weights');
  const total = SOCIAL_FEED_SCORE_DIMENSIONS.reduce((sum, dimension) => sum + weights[dimension], 0);
  if (mode === 'chronological') {
    if (total !== 0) throw new ValidationError('chronological feed objective weights must all be zero');
    return weights;
  }
  if (total <= 0) throw new ValidationError('weighted feed objective must assign positive weight');
  const out = {};
  for (const dimension of SOCIAL_FEED_SCORE_DIMENSIONS) out[dimension] = round(weights[dimension] / total);
  const normalizedTotal = SOCIAL_FEED_SCORE_DIMENSIONS.reduce((sum, dimension) => sum + out[dimension], 0);
  const first = SOCIAL_FEED_SCORE_DIMENSIONS.find(dimension => out[dimension] > 0);
  out[first] = round(out[first] + round(1 - normalizedTotal));
  return Object.freeze(out);
}

function stringList(input, name, allowed = null) {
  if (!Array.isArray(input) || input.length > 32) {
    throw new ValidationError(name + ' must be an array with at most 32 items');
  }
  const values = input.map((item, index) => id(item, name + '[' + index + ']'));
  if (new Set(values).size !== values.length) throw new ValidationError(name + ' must not contain duplicates');
  if (allowed) {
    for (const item of values) if (!allowed.has(item)) throw new ValidationError(name + ' contains unsupported value ' + item);
  }
  return Object.freeze(values);
}

function eligibility(input) {
  const value = assertPlainObject(input, 'social feed candidate.eligibility');
  exact(value, ELIGIBILITY_FIELDS, 'social feed candidate.eligibility');
  if (!['eligible', 'excluded'].includes(value.status)) {
    throw new ValidationError('social feed candidate eligibility status is unsupported');
  }
  const reasons = stringList(value.reason_codes, 'social feed candidate.eligibility.reason_codes');
  if (value.status === 'excluded' && reasons.length === 0) {
    throw new ValidationError('excluded social feed candidate requires at least one reason code');
  }
  return Object.freeze({
    status: value.status,
    policy_digest: digest(value.policy_digest, 'social feed candidate.eligibility.policy_digest'),
    reason_codes: reasons
  });
}

export function validateSocialFeedObjectiveProfile(input) {
  const value = assertPlainObject(input, 'social feed objective profile');
  exact(value, PROFILE_FIELDS, 'social feed objective profile');
  if (value.schema !== SOCIAL_FEED_OBJECTIVE_PROFILE_SCHEMA || value.version !== VERSION || value.status !== 'inert-social-feed-objective-profile') {
    throw new ValidationError('social feed objective profile schema version or status is unsupported');
  }
  id(value.profile_id, 'social feed objective profile.profile_id');
  if (!MODES.has(value.mode)) throw new ValidationError('social feed objective profile mode is unsupported');
  const weights = dimensionRecord(value.weights, 'social feed objective profile.weights');
  const total = SOCIAL_FEED_SCORE_DIMENSIONS.reduce((sum, dimension) => sum + weights[dimension], 0);
  if (value.mode === 'chronological' ? total !== 0 : Math.abs(total - 1) > 1e-9) {
    throw new ValidationError('social feed objective profile weights are invalid for mode');
  }
  if (value.authority_effect !== 'none' || value.network_effect !== 'none' || value.persistence_effect !== 'none' || value.moderation_effect !== 'none') {
    throw new ValidationError('social feed objective profile effect boundary is invalid');
  }
  return true;
}

export function createSocialFeedObjectiveProfile(input) {
  const value = assertPlainObject(input, 'social feed objective profile input');
  exact(value, ['profileId', 'mode', 'weights'], 'social feed objective profile input');
  if (!MODES.has(value.mode)) throw new ValidationError('social feed objective profile mode is unsupported');
  const document = {
    schema: SOCIAL_FEED_OBJECTIVE_PROFILE_SCHEMA,
    version: VERSION,
    status: 'inert-social-feed-objective-profile',
    profile_id: id(value.profileId, 'social feed objective profile.profile_id'),
    mode: value.mode,
    weights: normalizeWeights(value.weights, value.mode),
    authority_effect: 'none',
    network_effect: 'none',
    persistence_effect: 'none',
    moderation_effect: 'none'
  };
  validateSocialFeedObjectiveProfile(document);
  return freeze(document);
}

export function validateSocialFeedCandidate(input) {
  const value = assertPlainObject(input, 'social feed candidate');
  exact(value, CANDIDATE_FIELDS, 'social feed candidate');
  if (value.schema !== SOCIAL_FEED_CANDIDATE_SCHEMA || value.version !== VERSION || value.status !== 'inert-social-feed-candidate') {
    throw new ValidationError('social feed candidate schema version or status is unsupported');
  }
  id(value.candidate_id, 'social feed candidate.candidate_id');
  id(value.publication_id, 'social feed candidate.publication_id');
  timestamp(value.published_at, 'social feed candidate.published_at');
  if (!SOURCE_KINDS.has(value.source_kind)) throw new ValidationError('social feed candidate source kind is unsupported');
  stringList(value.source_reasons, 'social feed candidate.source_reasons', SOURCE_REASONS);
  eligibility(value.eligibility);
  dimensionRecord(value.signals, 'social feed candidate.signals');
  dimensionRecord(value.signal_evidence, 'social feed candidate.signal_evidence', true);
  if (value.authority_effect !== 'none' || value.network_effect !== 'none' || value.persistence_effect !== 'none' || value.moderation_effect !== 'none') {
    throw new ValidationError('social feed candidate effect boundary is invalid');
  }
  return true;
}

export function createSocialFeedCandidate(input) {
  const value = assertPlainObject(input, 'social feed candidate input');
  exact(value, [
    'candidateId', 'publicationId', 'publishedAt', 'sourceKind', 'sourceReasons',
    'eligibility', 'signals', 'signalEvidence'
  ], 'social feed candidate input');
  if (!SOURCE_KINDS.has(value.sourceKind)) throw new ValidationError('social feed candidate source kind is unsupported');
  const document = {
    schema: SOCIAL_FEED_CANDIDATE_SCHEMA,
    version: VERSION,
    status: 'inert-social-feed-candidate',
    candidate_id: id(value.candidateId, 'social feed candidate.candidate_id'),
    publication_id: id(value.publicationId, 'social feed candidate.publication_id'),
    published_at: timestamp(value.publishedAt, 'social feed candidate.published_at'),
    source_kind: value.sourceKind,
    source_reasons: stringList(value.sourceReasons, 'social feed candidate.source_reasons', SOURCE_REASONS),
    eligibility: eligibility(value.eligibility),
    signals: dimensionRecord(value.signals, 'social feed candidate.signals'),
    signal_evidence: dimensionRecord(value.signalEvidence, 'social feed candidate.signal_evidence', true),
    authority_effect: 'none',
    network_effect: 'none',
    persistence_effect: 'none',
    moderation_effect: 'none'
  };
  validateSocialFeedCandidate(document);
  return freeze(document);
}

function score(candidate, profile) {
  return round(SOCIAL_FEED_SCORE_DIMENSIONS.reduce(
    (sum, dimension) => sum + profile.weights[dimension] * candidate.signals[dimension], 0
  ));
}

function contributors(candidate, profile) {
  return SOCIAL_FEED_SCORE_DIMENSIONS.map(dimension => ({
    dimension,
    weight: profile.weights[dimension],
    signal: candidate.signals[dimension],
    contribution: round(profile.weights[dimension] * candidate.signals[dimension]),
    evidence_ref: candidate.signal_evidence[dimension]
  })).filter(item => item.weight > 0 && item.contribution > 0)
    .sort((left, right) => right.contribution - left.contribution || left.dimension.localeCompare(right.dimension));
}

function candidateSetDigest(candidates) {
  return digestObject([...candidates].sort((left, right) => left.candidate_id.localeCompare(right.candidate_id)));
}

export function rankSocialFeed(input) {
  const value = assertPlainObject(input, 'social feed ranking input');
  exact(value, ['profile', 'candidates', 'limit'], 'social feed ranking input');
  validateSocialFeedObjectiveProfile(value.profile);
  if (!Array.isArray(value.candidates)) throw new ValidationError('social feed candidates must be an array');
  const max = limit(value.limit);
  const candidates = value.candidates.map(candidate => {
    validateSocialFeedCandidate(candidate);
    return structuredClone(candidate);
  });
  const candidateIds = candidates.map(candidate => candidate.candidate_id);
  const publicationIds = candidates.map(candidate => candidate.publication_id);
  if (new Set(candidateIds).size !== candidateIds.length) throw new ValidationError('social feed candidates contain duplicate candidate_id');
  if (new Set(publicationIds).size !== publicationIds.length) throw new ValidationError('social feed candidates contain duplicate publication_id');

  const eligible = candidates.filter(candidate => candidate.eligibility.status === 'eligible');
  const excluded = candidates.filter(candidate => candidate.eligibility.status === 'excluded')
    .sort((left, right) => left.candidate_id.localeCompare(right.candidate_id))
    .map(candidate => ({
      candidate_id: candidate.candidate_id,
      publication_id: candidate.publication_id,
      reason_codes: candidate.eligibility.reason_codes,
      policy_digest: candidate.eligibility.policy_digest
    }));

  if (value.profile.mode === 'chronological') {
    eligible.sort((left, right) => right.published_at.localeCompare(left.published_at) || left.candidate_id.localeCompare(right.candidate_id));
  } else {
    eligible.sort((left, right) => score(right, value.profile) - score(left, value.profile) || left.candidate_id.localeCompare(right.candidate_id));
  }

  const items = eligible.slice(0, max).map((candidate, index) => {
    const reasons = [...candidate.source_reasons];
    if (value.profile.mode === 'chronological' && !reasons.includes('chronological')) reasons.push('chronological');
    return {
      candidate_id: candidate.candidate_id,
      publication_id: candidate.publication_id,
      published_at: candidate.published_at,
      rank: index + 1,
      score: value.profile.mode === 'chronological' ? null : score(candidate, value.profile),
      why: {
        source_reasons: reasons,
        contributors: value.profile.mode === 'chronological' ? [] : contributors(candidate, value.profile)
      }
    };
  });

  return freeze({
    schema: SOCIAL_FEED_RESULT_SCHEMA,
    version: VERSION,
    status: 'inert-social-feed-ranking',
    profile_id: value.profile.profile_id,
    profile_digest: digestObject(value.profile),
    candidate_set_digest: candidateSetDigest(candidates),
    ordering_mode: value.profile.mode,
    items,
    excluded,
    truncated: eligible.length > max,
    recommendation_effect: 'local-display-order-only',
    authority_effect: 'none',
    network_effect: 'none',
    persistence_effect: 'none',
    moderation_effect: 'none',
    visibility_policy_effect: 'none'
  });
}
