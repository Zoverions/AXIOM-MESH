import assert from 'node:assert/strict';
import test from 'node:test';

import {
  computeBoundedDecisionQuestionSchemaDigest
} from '../src/lib/bounded-decision-question-schema.mjs';
import {
  normalizeBoundedDecisionProviderResult
} from '../src/lib/bounded-decision-observation.mjs';
import {
  createSocialFeedSemanticSignal,
  validateSocialFeedSemanticSignal
} from '../src/lib/social-feed-semantic-signal.mjs';

const A = 'a'.repeat(64);
const B = 'b'.repeat(64);
const C = 'c'.repeat(64);
const ZERO = '0'.repeat(64);

function providerProfile(overrides = {}) {
  return {
    schema: 'axiom-bounded-decision-provider-profile.v0',
    version: 0,
    status: 'inert-bounded-decision-metadata',
    profile_id: 'bounded.provider.social-feed.v1',
    catalog_entry_id: 'provider:social-feed-fixture',
    catalog_entry_version: '0.1.0',
    catalog_entry_digest: A,
    offering_ref: 'model.social-feed.fixture',
    offering_version_or_revision: 'model.social-feed.fixture-2026-09-18',
    offering_revision_evidence: 'provider-versioned',
    provider_mode: 'provider-remote',
    supported_question_kinds: ['score'],
    max_questions_per_request: 64,
    max_choice_cardinality: 64,
    max_score_levels: 10,
    type_guarantee: 'provider-native-closed-set',
    probability_support: 'full-distribution',
    latency_class: 'interactive',
    calibration_claim: 'local-experimental',
    retention_posture_ref: 'posture.retention.reviewed.v1',
    training_use_posture_ref: 'posture.training.reviewed.v1',
    created_at: '2026-09-18T04:00:00.000Z',
    review_at: '2026-10-18T04:00:00.000Z',
    authority_effect: 'none',
    network_effect: 'none',
    credential_visibility: 'none',
    runtime_activation: false,
    selection_effect: 'eligibility-only',
    assurance_effect: 'none',
    ...overrides
  };
}

function signQuestion(document) {
  document.schema_digest = computeBoundedDecisionQuestionSchemaDigest(document);
  return document;
}

function scoreQuestion(dimension = 'relevance', overrides = {}) {
  return signQuestion({
    schema: 'axiom-bounded-decision-question-schema.v0',
    version: 0,
    status: 'inert-bounded-decision-question-schema',
    question_schema_id: 'social.feed.question.' + dimension + '.v1',
    question_kind: 'score',
    instructions: 'Score only the named social-feed dimension from the supplied bounded state.',
    purpose: 'social-feed-ranking-signal',
    domain: 'social.feed.' + dimension,
    state_contract_ref: 'axiom-social-feed-semantic-state.v0',
    known_limitations: ['Fixture question; not production calibration evidence.'],
    created_at: '2026-09-18T04:05:00.000Z',
    levels: [
      { level_id: 'low', position: 0, description: 'Little or no support for the dimension.' },
      { level_id: 'medium', position: 1, description: 'Moderate support for the dimension.' },
      { level_id: 'high', position: 2, description: 'Strong support for the dimension.' }
    ],
    schema_digest: ZERO,
    ...overrides
  });
}

function observation({
  question = scoreQuestion(),
  profile = providerProfile(),
  stateDigest = B,
  observationId = 'social.feed.observation.relevance.v1',
  providerConfidence = 0.87
} = {}) {
  return normalizeBoundedDecisionProviderResult({
    observation_id: observationId,
    state_digest: stateDigest,
    state_classification: 'confidential',
    observed_at: '2026-09-18T04:10:00.000Z',
    latency_ms: 18,
    answer: { kind: 'score', score: 1.5 },
    probability_evidence: [
      { level_id: 'high', position: 2, probability: 0.6 },
      { level_id: 'low', position: 0, probability: 0.1 },
      { level_id: 'medium', position: 1, probability: 0.3 }
    ],
    provider_confidence: providerConfidence,
    usage_evidence: {
      input_units: 120,
      output_units: 3,
      compute_class: null,
      provider_report_ref: 'usage.social-feed.fixture.v1'
    },
    calibration_report_ref: null,
    transport_evidence_ref: 'transport.social-feed.fixture.v1'
  }, profile, question);
}

function createFixture(overrides = {}) {
  const profile = overrides.profile ?? providerProfile();
  const question = overrides.question ?? scoreQuestion(overrides.dimension ?? 'relevance');
  const obs = overrides.observation ?? observation({
    profile,
    question,
    stateDigest: overrides.stateDigest ?? B,
    observationId: overrides.observationId,
    providerConfidence: overrides.providerConfidence
  });
  const input = {
    candidateId: overrides.candidateId ?? 'candidate:feed-1',
    publicationId: overrides.publicationId ?? 'publication:feed-1',
    dimension: overrides.dimension ?? 'relevance',
    stateDigest: overrides.stateDigest ?? B,
    observation: obs,
    providerProfile: profile,
    questionSchema: question
  };
  return { profile, question, observation: obs, input };
}

test('valid bounded score becomes one candidate-bound feed signal', () => {
  const fixture = createFixture();
  const signal = createSocialFeedSemanticSignal(fixture.input);

  assert.equal(signal.signal, 0.75);
  assert.equal(signal.dimension, 'relevance');
  assert.equal(signal.candidate_id, 'candidate:feed-1');
  assert.equal(signal.publication_id, 'publication:feed-1');
  assert.equal(signal.state_digest, B);
  assert.equal(signal.observation_digest, fixture.observation.observation_digest);
  assert.equal(signal.question_schema_digest, fixture.question.schema_digest);
  assert.match(signal.signal_digest, /^[a-f0-9]{64}$/);
  assert.equal(signal.authority_effect, 'none');
  assert.equal(signal.assurance_effect, 'none');
  assert.equal(signal.network_effect, 'none');
  assert.equal(signal.persistence_effect, 'none');
  assert.equal(signal.selection_effect, 'evidence-only');

  const validated = validateSocialFeedSemanticSignal(signal, {
    stateDigest: B,
    observation: fixture.observation,
    providerProfile: fixture.profile,
    questionSchema: fixture.question
  });
  assert.equal(validated.valid, true);
  assert.equal(validated.signal, 0.75);
});

test('free-floating observations cannot cross the candidate state-digest boundary', () => {
  const fixture = createFixture();
  assert.throws(
    () => createSocialFeedSemanticSignal({
      ...fixture.input,
      stateDigest: C
    }),
    /state digest does not match observation/i
  );
});

test('feed semantic questions require exact dimension domain purpose and state contract', () => {
  for (const [overrides, pattern] of [
    [{ domain: 'social.feed.novelty' }, /question domain/i],
    [{ purpose: 'generic-ranking' }, /question purpose/i],
    [{ state_contract_ref: 'state.generic.v1' }, /state contract/i]
  ]) {
    const question = scoreQuestion('relevance', overrides);
    const profile = providerProfile();
    const obs = observation({ question, profile });
    assert.throws(
      () => createSocialFeedSemanticSignal({
        candidateId: 'candidate:feed-1',
        publicationId: 'publication:feed-1',
        dimension: 'relevance',
        stateDigest: B,
        observation: obs,
        providerProfile: profile,
        questionSchema: question
      }),
      pattern
    );
  }
});

test('unsupported feed dimensions fail before they can enter ranking evidence', () => {
  const fixture = createFixture();
  assert.throws(
    () => createSocialFeedSemanticSignal({
      ...fixture.input,
      dimension: 'engagement_magic'
    }),
    /dimension is unsupported/i
  );
});

test('tampered bounded observations fail their original digest binding', () => {
  const fixture = createFixture();
  const changed = structuredClone(fixture.observation);
  changed.answer.score = 0.5;

  assert.throws(
    () => createSocialFeedSemanticSignal({
      ...fixture.input,
      observation: changed
    }),
    /digest|score/i
  );
});

test('provider confidence does not change the normalized feed score', () => {
  const low = createFixture({
    observationId: 'social.feed.observation.confidence-low.v1',
    providerConfidence: 0.1
  });
  const high = createFixture({
    observationId: 'social.feed.observation.confidence-high.v1',
    providerConfidence: 0.99
  });

  const lowSignal = createSocialFeedSemanticSignal(low.input);
  const highSignal = createSocialFeedSemanticSignal(high.input);

  assert.equal(lowSignal.signal, 0.75);
  assert.equal(highSignal.signal, 0.75);
  assert.notEqual(lowSignal.observation_digest, highSignal.observation_digest);
  assert.notEqual(lowSignal.signal_digest, highSignal.signal_digest);
  assert.equal(Object.hasOwn(lowSignal, 'provider_confidence'), false);
  assert.equal(Object.hasOwn(lowSignal, 'required_assurance'), false);
  assert.equal(Object.hasOwn(lowSignal, 'achieved_assurance'), false);
});

test('semantic signal validation fails when trusted candidate state changes', () => {
  const fixture = createFixture();
  const signal = createSocialFeedSemanticSignal(fixture.input);

  assert.throws(
    () => validateSocialFeedSemanticSignal(signal, {
      stateDigest: C,
      observation: fixture.observation,
      providerProfile: fixture.profile,
      questionSchema: fixture.question
    }),
    /state digest does not match observation/i
  );
});

test('candidate and publication binding are part of semantic signal identity', () => {
  const fixture = createFixture();
  const first = createSocialFeedSemanticSignal(fixture.input);
  const second = createSocialFeedSemanticSignal({
    ...fixture.input,
    candidateId: 'candidate:feed-2',
    publicationId: 'publication:feed-2'
  });

  assert.notEqual(first.signal_id, second.signal_id);
  assert.notEqual(first.signal_digest, second.signal_digest);
  assert.equal(first.signal, second.signal);
});

test('semantic signal tampering cannot widen authority or rewrite score/provenance', () => {
  const fixture = createFixture();
  const signal = createSocialFeedSemanticSignal(fixture.input);
  const context = {
    stateDigest: B,
    observation: fixture.observation,
    providerProfile: fixture.profile,
    questionSchema: fixture.question
  };

  const authority = structuredClone(signal);
  authority.authority_effect = 'grant';
  assert.throws(
    () => validateSocialFeedSemanticSignal(authority, context),
    /effect boundary/i
  );

  const score = structuredClone(signal);
  score.signal = 1;
  assert.throws(
    () => validateSocialFeedSemanticSignal(score, context),
    /does not match bounded observation/i
  );

  const provenance = structuredClone(signal);
  provenance.observation_digest = C;
  assert.throws(
    () => validateSocialFeedSemanticSignal(provenance, context),
    /provenance does not match trusted observation/i
  );
});

test('unknown semantic-signal fields fail closed', () => {
  const fixture = createFixture();
  const signal = structuredClone(createSocialFeedSemanticSignal(fixture.input));
  signal.visibility_override = 'allow';

  assert.throws(
    () => validateSocialFeedSemanticSignal(signal, {
      stateDigest: B,
      observation: fixture.observation,
      providerProfile: fixture.profile,
      questionSchema: fixture.question
    }),
    /unknown field visibility_override/i
  );
});
