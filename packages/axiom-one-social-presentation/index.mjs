const LOCAL_SCHEMA = 'axiom-local-social-snapshot.v1';
const REMOTE_SCHEMA = 'axiom-remote-social-review.v1';
export const AXIOM_ONE_SOCIAL_PRESENTATION_SCHEMA = 'axiom-one-social-presentation.v0';

const ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/;
const DIGEST = /^[a-f0-9]{64}$/;
const LOCAL_PUBLICATION_STATUSES = new Set(['active', 'superseded', 'retracted']);
const FORBIDDEN_OUTPUT_KEYS = new Set([
  'actor_state',
  'protected_persona',
  'controller_actor_id',
  'selective_link_commitment',
  'delegation_authority_digest',
  'trusted_exporter_json',
  'package_json',
  'attestation',
  'signature',
  'authorization',
  'private_key',
  'source_read_token',
  'sourceReadToken',
  'ranking_score',
  'reputation_score'
]);

export function presentAxiomOneSocial({ local, remote = null }) {
  const localModel = presentLocal(local);
  const remoteModel = remote === null ? unavailableRemote() : presentRemote(remote, localModel.owner);

  const model = Object.freeze({
    schema: AXIOM_ONE_SOCIAL_PRESENTATION_SCHEMA,
    status: 'read-only-presentation-laboratory',
    owner: localModel.owner,
    local: localModel,
    remote: remoteModel,
    boundaries: Object.freeze({
      local_saved_is_network_distributed: false,
      local_corpus_is_provider_delivery_proof: false,
      remote_observation_is_local_authorship_proof: false,
      exporter_attestation_is_identity_proof: false,
      exporter_attestation_is_content_truth_proof: false,
      remote_follow_is_public_graph: false,
      ranking_enabled: false,
      recommendation_enabled: false,
      mutation_effect: 'none',
      network_effect: 'none',
      authority_effect: 'none'
    })
  });

  assertNoForbiddenOutput(model);
  return model;
}

function presentLocal(snapshot) {
  exactObject(snapshot, 'local social snapshot', [
    'schema',
    'owner',
    'actors',
    'personas',
    'corpus',
    'network_effect'
  ]);
  if (snapshot.schema !== LOCAL_SCHEMA) fail('local social snapshot schema is invalid');
  const owner = identifier(snapshot.owner, 'local social owner');
  if (snapshot.network_effect !== 'none') fail('local social snapshot must remain network-effect free');
  if (!Array.isArray(snapshot.actors) || snapshot.actors.length > 32) fail('local social actors are invalid');
  if (!Array.isArray(snapshot.personas) || snapshot.personas.length > 128) fail('local social personas are invalid');
  exactObject(snapshot.corpus, 'local social corpus', ['publications', 'transitions', 'truncated']);
  if (!Array.isArray(snapshot.corpus.publications) || snapshot.corpus.publications.length > 100) {
    fail('local social publications are invalid');
  }
  if (!Array.isArray(snapshot.corpus.transitions) || snapshot.corpus.transitions.length > 100) {
    fail('local social transitions are invalid');
  }
  if (typeof snapshot.corpus.truncated !== 'boolean') fail('local social truncation state is invalid');

  const actors = snapshot.actors.map((record, index) => {
    exactObject(record, `local social actor ${index}`, [
      'actor_id',
      'actor_state_digest',
      'actor_state',
      'status',
      'custody'
    ]);
    const actorId = identifier(record.actor_id, `local social actor ${index} id`);
    digest(record.actor_state_digest, `local social actor ${index} state digest`);
    if (record.custody !== 'owner-local') fail('local social actor custody is invalid');
    if (!record.actor_state || typeof record.actor_state !== 'object' || Array.isArray(record.actor_state)) {
      fail('local social actor state is invalid');
    }
    return Object.freeze({
      actor_id: actorId,
      actor_state_digest: record.actor_state_digest,
      status: boundedString(record.status, `local social actor ${index} status`, 80),
      custody: 'owner-local',
      private_state_included: false
    });
  });

  const actorIds = new Set(actors.map(item => item.actor_id));
  const personas = snapshot.personas.map((record, index) => {
    exactObject(record, `local social persona ${index}`, [
      'persona_id',
      'actor_id',
      'protected_persona',
      'public_projection',
      'status'
    ]);
    const personaId = identifier(record.persona_id, `local social persona ${index} id`);
    const actorId = identifier(record.actor_id, `local social persona ${index} actor`);
    if (!actorIds.has(actorId)) fail('local social persona references an unknown actor');
    if (!record.protected_persona || typeof record.protected_persona !== 'object' || Array.isArray(record.protected_persona)) {
      fail('local social protected persona is invalid');
    }
    const publicProjection = publicSafeClone(
      record.public_projection,
      `local social persona ${index} public projection`
    );
    if (publicProjection.persona_id !== personaId) fail('local social persona projection binding is invalid');
    return Object.freeze({
      persona_id: personaId,
      actor_id: actorId,
      status: boundedString(record.status, `local social persona ${index} status`, 80),
      public_projection: publicProjection,
      protected_state_included: false
    });
  });

  const personaIds = new Set(personas.map(item => item.persona_id));
  const publications = snapshot.corpus.publications.map((record, index) => {
    exactObject(record, `local social publication ${index}`, [
      'projection_digest',
      'actor_id',
      'persona_id',
      'publication',
      'status'
    ]);
    digest(record.projection_digest, `local social publication ${index} digest`);
    const actorId = identifier(record.actor_id, `local social publication ${index} actor`);
    const personaId = identifier(record.persona_id, `local social publication ${index} persona`);
    if (!actorIds.has(actorId) || !personaIds.has(personaId)) {
      fail('local social publication references unknown actor or persona');
    }
    if (!LOCAL_PUBLICATION_STATUSES.has(record.status)) fail('local social publication status is invalid');
    const publication = publicSafeClone(record.publication, `local social publication ${index} projection`);
    if (publication.projection_digest !== record.projection_digest || publication.persona_id !== personaId) {
      fail('local social publication projection binding is invalid');
    }
    return Object.freeze({
      projection_digest: record.projection_digest,
      actor_id: actorId,
      persona_id: personaId,
      status: record.status,
      publication
    });
  });

  const publicationDigests = new Set(publications.map(item => item.projection_digest));
  const transitions = snapshot.corpus.transitions.map((record, index) => {
    exactObject(record, `local social transition ${index}`, [
      'transition_digest',
      'publication_digest',
      'transition'
    ]);
    digest(record.transition_digest, `local social transition ${index} digest`);
    digest(record.publication_digest, `local social transition ${index} publication digest`);
    if (!publicationDigests.has(record.publication_digest)) fail('local social transition target is not in the presented corpus');
    const transition = publicSafeClone(record.transition, `local social transition ${index} projection`);
    if (
      transition.transition_digest !== record.transition_digest
      || transition.publication_digest !== record.publication_digest
    ) fail('local social transition binding is invalid');
    return Object.freeze({
      transition_digest: record.transition_digest,
      publication_digest: record.publication_digest,
      transition
    });
  });

  return Object.freeze({
    owner,
    actors: Object.freeze(actors),
    personas: Object.freeze(personas),
    corpus: Object.freeze({
      publications: Object.freeze(publications),
      transitions: Object.freeze(transitions),
      truncated: snapshot.corpus.truncated
    }),
    network_effect: 'none',
    distribution_state: 'local-only'
  });
}

function presentRemote(review, expectedOwner) {
  if (!review || typeof review !== 'object' || Array.isArray(review)) fail('remote social review is invalid');
  if (review.schema !== REMOTE_SCHEMA) fail('remote social review schema is invalid');
  if (identifier(review.owner, 'remote social owner') !== expectedOwner) fail('remote social owner does not match local owner');
  if (review.activation_scope !== 'local-read-only-review') fail('remote social activation scope is invalid');
  for (const [key, expected] of [
    ['exporter_attestation_is_identity_proof', false],
    ['exporter_attestation_is_content_truth_proof', false],
    ['local_admission_is_authorship_proof', false],
    ['transport_state_included', false],
    ['ranking_state_included', false],
    ['mutation_effect', 'none'],
    ['network_effect', 'none'],
    ['recommendation_effect', 'none'],
    ['authority_effect', 'none']
  ]) {
    if (review[key] !== expected) fail(`remote social review weakened ${key}`);
  }

  const stages = safeArray(review.stages, 'remote social stages', 50);
  const admissions = safeArray(review.admissions, 'remote social admissions', 100);
  const observations = safeArray(review.observations, 'remote social observations', 200);
  const follows = safeArray(review.follows, 'remote social follows', 200);
  const retentionReceipts = safeArray(review.retention_receipts, 'remote social retention receipts', 100);
  const retention = publicSafeClone(review.retention, 'remote social retention');

  for (const follow of follows) {
    if (
      follow.private_local_preference !== true
      || follow.trust_scope !== 'exporter-attestation-only'
      || follow.content_truth_claimed !== false
      || follow.legal_identity_claimed !== false
      || follow.actor_authorship_claimed !== false
      || follow.recommendation_effect !== 'none'
      || follow.authority_effect !== 'none'
    ) fail('remote social follow trust boundary is invalid');
  }
  for (const observation of observations) {
    if (observation.remote_observation_only !== true || observation.local_authorship_claimed !== false) {
      fail('remote social observation authorship boundary is invalid');
    }
  }

  return Object.freeze({
    available: true,
    activation_scope: 'local-read-only-review',
    stages: Object.freeze(stages.map(item => publicSafeClone(item, 'remote social stage'))),
    stages_truncated: boolean(review.stages_truncated, 'remote social stages_truncated'),
    admissions: Object.freeze(admissions.map(item => publicSafeClone(item, 'remote social admission'))),
    admissions_truncated: boolean(review.admissions_truncated, 'remote social admissions_truncated'),
    observations: Object.freeze(observations.map(item => publicSafeClone(item, 'remote social observation'))),
    observations_truncated: boolean(review.observations_truncated, 'remote social observations_truncated'),
    follows: Object.freeze(follows.map(item => publicSafeClone(item, 'remote social follow'))),
    follows_truncated: boolean(review.follows_truncated, 'remote social follows_truncated'),
    retention,
    retention_receipts: Object.freeze(retentionReceipts.map(item => publicSafeClone(item, 'remote social retention receipt'))),
    retention_receipts_truncated: boolean(
      review.retention_receipts_truncated,
      'remote social retention_receipts_truncated'
    ),
    response_bytes: boundedInteger(review.response_bytes, 'remote social response bytes', 0, 524_288),
    mutation_effect: 'none',
    network_effect: 'none',
    recommendation_effect: 'none',
    authority_effect: 'none'
  });
}

function unavailableRemote() {
  return Object.freeze({
    available: false,
    reason: 'No remote-review result was supplied to this local presenter.',
    activation_scope: 'unavailable',
    mutation_effect: 'none',
    network_effect: 'none',
    recommendation_effect: 'none',
    authority_effect: 'none'
  });
}

function safeArray(value, label, maximum) {
  if (!Array.isArray(value) || value.length > maximum) fail(`${label} are invalid`);
  return value;
}

function publicSafeClone(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(`${label} must be an object`);
  const clone = structuredClone(value);
  assertNoForbiddenOutput(clone);
  return deepFreeze(clone);
}

function assertNoForbiddenOutput(value, path = '$') {
  if (value === null || typeof value !== 'object') return;
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertNoForbiddenOutput(item, `${path}[${index}]`));
    return;
  }
  for (const [key, nested] of Object.entries(value)) {
    if (FORBIDDEN_OUTPUT_KEYS.has(key)) fail(`social presentation contains forbidden field ${path}.${key}`);
    assertNoForbiddenOutput(nested, `${path}.${key}`);
  }
}

function exactObject(value, label, keys) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(`${label} must be an object`);
  const actual = Object.keys(value).sort().join(',');
  const expected = [...keys].sort().join(',');
  if (actual !== expected) fail(`${label} fields are invalid`);
}

function identifier(value, label) {
  if (typeof value !== 'string' || !ID.test(value)) fail(`${label} is invalid`);
  return value;
}

function digest(value, label) {
  if (typeof value !== 'string' || !DIGEST.test(value)) fail(`${label} is invalid`);
  return value;
}

function boundedString(value, label, maximum) {
  if (typeof value !== 'string' || value.length < 1 || value.length > maximum) fail(`${label} is invalid`);
  return value;
}

function boundedInteger(value, label, minimum, maximum) {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) fail(`${label} is invalid`);
  return value;
}

function boolean(value, label) {
  if (typeof value !== 'boolean') fail(`${label} is invalid`);
  return value;
}

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const nested of Object.values(value)) deepFreeze(nested);
  }
  return value;
}

function fail(message) {
  throw new TypeError(message);
}
