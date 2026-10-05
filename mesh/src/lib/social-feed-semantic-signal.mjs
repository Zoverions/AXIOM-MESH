import {
  ValidationError,
  assertPlainObject,
  assertString,
  digestObject
} from './canonical.mjs';
import {
  SOCIAL_FEED_SCORE_DIMENSIONS
} from './social-feed-ranking.mjs';
import {
  validateBoundedDecisionObservation
} from './bounded-decision-observation.mjs';

export const SOCIAL_FEED_SEMANTIC_SIGNAL_SCHEMA =
  'axiom-social-feed-semantic-signal.v0';

const VERSION = 0;
const STATUS = 'inert-social-feed-semantic-signal';
const PURPOSE = 'social-feed-ranking-signal';
const STATE_CONTRACT = 'axiom-social-feed-semantic-state.v0';
const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,191}$/;
const DIGEST = /^[a-f0-9]{64}$/;

const DOCUMENT_FIELDS = Object.freeze([
  'schema',
  'version',
  'status',
  'signal_id',
  'candidate_id',
  'publication_id',
  'dimension',
  'signal',
  'state_digest',
  'question_schema_id',
  'question_schema_digest',
  'observation_id',
  'observation_digest',
  'provider_profile_id',
  'provider_profile_digest',
  'observed_at',
  'semantic_evidence_kind',
  'signal_digest',
  'authority_effect',
  'assurance_effect',
  'network_effect',
  'persistence_effect',
  'selection_effect'
]);

function exact(value, fields, name) {
  const allowed = new Set(fields);
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) throw new ValidationError(`${name} contains unknown field ${key}`);
  }
  for (const key of fields) {
    if (!Object.hasOwn(value, key)) throw new ValidationError(`${name}.${key} is required`);
  }
}

function identifier(value, name) {
  return assertString(value, name, { min: 1, max: 192, pattern: IDENTIFIER });
}

function digest(value, name) {
  return assertString(value, name, { min: 64, max: 64, pattern: DIGEST });
}

function dimension(value) {
  if (!SOCIAL_FEED_SCORE_DIMENSIONS.includes(value)) {
    throw new ValidationError('social feed semantic signal dimension is unsupported');
  }
  return value;
}

function unit(value, name) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1) {
    throw new ValidationError(`${name} must be a finite number between 0 and 1`);
  }
  return Object.is(value, -0) ? 0 : value;
}

function round(value) {
  return Number(value.toFixed(12));
}

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

function expectedDomain(signalDimension) {
  return `social.feed.${signalDimension}`;
}

function validateTrustedBinding({
  candidateId,
  publicationId,
  signalDimension,
  stateDigest,
  observation,
  providerProfile,
  questionSchema
}) {
  identifier(candidateId, 'social feed semantic signal.candidate_id');
  identifier(publicationId, 'social feed semantic signal.publication_id');
  const selectedDimension = dimension(signalDimension);
  const trustedStateDigest = digest(
    stateDigest,
    'social feed semantic signal.state_digest'
  );

  validateBoundedDecisionObservation(observation, providerProfile, questionSchema);

  if (questionSchema.question_kind !== 'score' || observation.answer.kind !== 'score') {
    throw new ValidationError('social feed semantic signal requires a bounded score observation');
  }
  if (questionSchema.domain !== expectedDomain(selectedDimension)) {
    throw new ValidationError(
      `social feed semantic signal question domain must be ${expectedDomain(selectedDimension)}`
    );
  }
  if (questionSchema.purpose !== PURPOSE) {
    throw new ValidationError(
      `social feed semantic signal question purpose must be ${PURPOSE}`
    );
  }
  if (questionSchema.state_contract_ref !== STATE_CONTRACT) {
    throw new ValidationError(
      `social feed semantic signal state contract must be ${STATE_CONTRACT}`
    );
  }
  if (observation.state_digest !== trustedStateDigest) {
    throw new ValidationError('social feed semantic signal state digest does not match observation');
  }

  const maximumPosition = questionSchema.levels.length - 1;
  if (maximumPosition < 1) {
    throw new ValidationError('social feed semantic signal score schema requires at least two levels');
  }
  const normalizedSignal = round(observation.answer.score / maximumPosition);
  unit(normalizedSignal, 'social feed semantic signal.signal');

  return Object.freeze({
    candidateId,
    publicationId,
    signalDimension: selectedDimension,
    stateDigest: trustedStateDigest,
    normalizedSignal
  });
}

function digestPayload(document) {
  const copy = structuredClone(document);
  delete copy.signal_digest;
  return copy;
}

export function createSocialFeedSemanticSignal(input) {
  const value = assertPlainObject(input, 'social feed semantic signal input');
  exact(value, [
    'candidateId',
    'publicationId',
    'dimension',
    'stateDigest',
    'observation',
    'providerProfile',
    'questionSchema'
  ], 'social feed semantic signal input');

  const binding = validateTrustedBinding({
    candidateId: value.candidateId,
    publicationId: value.publicationId,
    signalDimension: value.dimension,
    stateDigest: value.stateDigest,
    observation: value.observation,
    providerProfile: value.providerProfile,
    questionSchema: value.questionSchema
  });

  const identityDigest = digestObject({
    candidate_id: binding.candidateId,
    publication_id: binding.publicationId,
    dimension: binding.signalDimension,
    state_digest: binding.stateDigest,
    question_schema_digest: value.observation.question_schema_digest,
    observation_digest: value.observation.observation_digest
  });

  const document = {
    schema: SOCIAL_FEED_SEMANTIC_SIGNAL_SCHEMA,
    version: VERSION,
    status: STATUS,
    signal_id: `social_feed_signal_${identityDigest}`,
    candidate_id: binding.candidateId,
    publication_id: binding.publicationId,
    dimension: binding.signalDimension,
    signal: binding.normalizedSignal,
    state_digest: binding.stateDigest,
    question_schema_id: value.observation.question_schema_id,
    question_schema_digest: value.observation.question_schema_digest,
    observation_id: value.observation.observation_id,
    observation_digest: value.observation.observation_digest,
    provider_profile_id: value.observation.provider_profile_id,
    provider_profile_digest: value.observation.provider_profile_digest,
    observed_at: value.observation.observed_at,
    semantic_evidence_kind: 'bounded-decision-score',
    signal_digest: '0'.repeat(64),
    authority_effect: 'none',
    assurance_effect: 'none',
    network_effect: 'none',
    persistence_effect: 'none',
    selection_effect: 'evidence-only'
  };
  document.signal_digest = digestObject(digestPayload(document));

  validateSocialFeedSemanticSignal(document, {
    stateDigest: binding.stateDigest,
    observation: value.observation,
    providerProfile: value.providerProfile,
    questionSchema: value.questionSchema
  });
  return deepFreeze(document);
}

export function validateSocialFeedSemanticSignal(document, context) {
  const value = assertPlainObject(document, 'social feed semantic signal');
  exact(value, DOCUMENT_FIELDS, 'social feed semantic signal');

  if (
    value.schema !== SOCIAL_FEED_SEMANTIC_SIGNAL_SCHEMA
    || value.version !== VERSION
    || value.status !== STATUS
  ) {
    throw new ValidationError('social feed semantic signal schema version or status is unsupported');
  }
  identifier(value.signal_id, 'social feed semantic signal.signal_id');
  identifier(value.candidate_id, 'social feed semantic signal.candidate_id');
  identifier(value.publication_id, 'social feed semantic signal.publication_id');
  dimension(value.dimension);
  unit(value.signal, 'social feed semantic signal.signal');
  digest(value.state_digest, 'social feed semantic signal.state_digest');
  identifier(value.question_schema_id, 'social feed semantic signal.question_schema_id');
  digest(value.question_schema_digest, 'social feed semantic signal.question_schema_digest');
  identifier(value.observation_id, 'social feed semantic signal.observation_id');
  digest(value.observation_digest, 'social feed semantic signal.observation_digest');
  identifier(value.provider_profile_id, 'social feed semantic signal.provider_profile_id');
  digest(value.provider_profile_digest, 'social feed semantic signal.provider_profile_digest');
  assertString(value.observed_at, 'social feed semantic signal.observed_at', { min: 1, max: 64 });
  if (value.semantic_evidence_kind !== 'bounded-decision-score') {
    throw new ValidationError('social feed semantic signal evidence kind is unsupported');
  }
  digest(value.signal_digest, 'social feed semantic signal.signal_digest');

  if (
    value.authority_effect !== 'none'
    || value.assurance_effect !== 'none'
    || value.network_effect !== 'none'
    || value.persistence_effect !== 'none'
    || value.selection_effect !== 'evidence-only'
  ) {
    throw new ValidationError('social feed semantic signal effect boundary is invalid');
  }

  const trusted = assertPlainObject(context, 'social feed semantic signal validation context');
  exact(trusted, [
    'stateDigest',
    'observation',
    'providerProfile',
    'questionSchema'
  ], 'social feed semantic signal validation context');

  const binding = validateTrustedBinding({
    candidateId: value.candidate_id,
    publicationId: value.publication_id,
    signalDimension: value.dimension,
    stateDigest: trusted.stateDigest,
    observation: trusted.observation,
    providerProfile: trusted.providerProfile,
    questionSchema: trusted.questionSchema
  });

  const expectedIdentity = `social_feed_signal_${digestObject({
    candidate_id: value.candidate_id,
    publication_id: value.publication_id,
    dimension: value.dimension,
    state_digest: binding.stateDigest,
    question_schema_digest: trusted.observation.question_schema_digest,
    observation_digest: trusted.observation.observation_digest
  })}`;

  if (value.signal_id !== expectedIdentity) {
    throw new ValidationError('social feed semantic signal id does not match trusted binding');
  }
  if (value.signal !== binding.normalizedSignal) {
    throw new ValidationError('social feed semantic signal value does not match bounded observation');
  }
  if (
    value.question_schema_id !== trusted.observation.question_schema_id
    || value.question_schema_digest !== trusted.observation.question_schema_digest
    || value.observation_id !== trusted.observation.observation_id
    || value.observation_digest !== trusted.observation.observation_digest
    || value.provider_profile_id !== trusted.observation.provider_profile_id
    || value.provider_profile_digest !== trusted.observation.provider_profile_digest
    || value.observed_at !== trusted.observation.observed_at
  ) {
    throw new ValidationError('social feed semantic signal provenance does not match trusted observation');
  }

  const expectedDigest = digestObject(digestPayload(value));
  if (value.signal_digest !== expectedDigest) {
    throw new ValidationError('social feed semantic signal digest mismatch');
  }

  return deepFreeze({
    valid: true,
    schema: SOCIAL_FEED_SEMANTIC_SIGNAL_SCHEMA,
    signal_id: value.signal_id,
    candidate_id: value.candidate_id,
    publication_id: value.publication_id,
    dimension: value.dimension,
    signal: value.signal,
    signal_digest: value.signal_digest,
    observation_digest: value.observation_digest,
    authority_effect: 'none',
    assurance_effect: 'none',
    network_effect: 'none',
    persistence_effect: 'none',
    selection_effect: 'evidence-only'
  });
}
