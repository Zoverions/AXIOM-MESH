const HEX_64 = /^[a-f0-9]{64}$/;
const MAX_PUBLICATION_TEXT = 65_536;

function fail(message) {
  throw new TypeError(`AXIOM One Social workflow: ${message}`);
}

function assertPlainObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    fail(`${label} must be a plain object`);
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    fail(`${label} must be a plain object`);
  }
  return value;
}

function assertNonEmptyString(value, label) {
  if (typeof value !== 'string' || value.length === 0) {
    fail(`${label} must be a non-empty string`);
  }
  return value;
}

function assertDigest(value, label) {
  if (typeof value !== 'string' || !HEX_64.test(value)) {
    fail(`${label} must be a 64-character lowercase hex digest`);
  }
  return value;
}

function cloneJson(value) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) fail('workflow input contains a non-finite number');
    return value;
  }
  if (Array.isArray(value)) return value.map(cloneJson);
  assertPlainObject(value, 'workflow input');
  const clone = {};
  for (const [key, entry] of Object.entries(value)) clone[key] = cloneJson(entry);
  return clone;
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const entry of Object.values(value)) deepFreeze(entry);
  return Object.freeze(value);
}

function frozenRequest(value) {
  return deepFreeze(value);
}

function validateActor(actor) {
  assertPlainObject(actor, 'actor');
  const actorId = assertNonEmptyString(actor.actor_id, 'actor id');
  if (actor.status !== 'active') fail('actor must be active');
  if (actor.custody !== 'owner-local') fail('actor custody must be owner-local');
  const actorStateDigest = assertDigest(actor.actor_state_digest, 'actor state digest');
  return { actorId, actorStateDigest };
}

function validatePersona(actorId, persona) {
  assertPlainObject(persona, 'persona');
  if (persona.status !== 'active') fail('persona must be active');
  if (persona.actor_id !== actorId) fail('persona actor binding does not match the active actor');

  const personaId = assertNonEmptyString(persona.persona_id, 'persona id');
  const protectedPersona = assertPlainObject(persona.protected_persona, 'protected persona');
  if (protectedPersona.schema !== 'axiom-publication-persona.v1') {
    fail('protected persona schema is unsupported');
  }
  if (protectedPersona.persona_id !== personaId) fail('protected persona id does not match persona');
  if (protectedPersona.controller_actor_id !== actorId) {
    fail('protected persona actor binding does not match the active actor');
  }
  if (protectedPersona.attribution_mode !== 'pseudonymous') {
    fail('publication persona must remain pseudonymous');
  }
  if (protectedPersona.status !== 'active') fail('protected persona must be active');

  const publicProjection = assertPlainObject(persona.public_projection, 'public persona projection');
  if (publicProjection.persona_id !== personaId) fail('public persona projection id does not match persona');
  if (publicProjection.attribution_mode !== 'pseudonymous') {
    fail('public persona projection must remain pseudonymous');
  }
  if (publicProjection.authority_effect !== 'none') fail('public persona projection cannot carry authority');
  assertDigest(publicProjection.projection_digest, 'persona projection digest');

  return { protectedPersona: cloneJson(protectedPersona), personaId };
}

function validatePublicationText(text) {
  if (typeof text !== 'string' || text.trim().length === 0 || text.length > MAX_PUBLICATION_TEXT) {
    fail(`publication text must contain 1-${MAX_PUBLICATION_TEXT} characters`);
  }
  return text;
}

function validatePreviousPublication(previousPublication, expectedPersonaId = null) {
  assertPlainObject(previousPublication, 'previous publication');
  if (previousPublication.schema !== 'axiom-social-publication-projection.v1') {
    fail('previous publication schema is unsupported');
  }
  if (previousPublication.network_effect !== 'none') {
    fail('previous publication network effect must remain none');
  }
  if (previousPublication.authority_effect !== 'none') {
    fail('previous publication cannot carry authority');
  }
  if (expectedPersonaId !== null && previousPublication.persona_id !== expectedPersonaId) {
    fail('previous publication persona binding does not match the active persona');
  }
  assertDigest(previousPublication.persona_projection_digest, 'previous publication persona projection digest');
  assertDigest(previousPublication.projection_digest, 'previous publication projection digest');
  const content = assertPlainObject(previousPublication.content, 'previous publication content');
  if (content.media_type !== 'text/plain') fail('previous publication media type must remain text/plain');
  validatePublicationText(content.text);
  const audience = assertPlainObject(previousPublication.audience, 'previous publication audience');
  if (audience.mode !== 'public') fail('previous publication audience must remain public');
  if (previousPublication.discoverability !== 'listed') {
    fail('previous publication discoverability must remain listed');
  }
  if (previousPublication.authorship_mode !== 'human-authored') {
    fail('previous publication authorship must remain human-authored');
  }
  return cloneJson(previousPublication);
}

export function buildSocialActorCreateRequest() {
  return frozenRequest({
    action: 'social.actor.create',
    input: {},
    purpose: 'local-social-identity',
    data_scopes: ['social:identity']
  });
}

export function buildSocialPersonaCreateRequest({ actor } = {}) {
  const { actorId } = validateActor(actor);
  return frozenRequest({
    action: 'social.persona.create',
    input: {
      actor_id: actorId,
      attribution_mode: 'pseudonymous'
    },
    purpose: 'local-social-persona',
    data_scopes: ['social:identity']
  });
}

export function buildSocialPublicationCreateRequest({ actor, persona, text } = {}) {
  const { actorId, actorStateDigest } = validateActor(actor);
  const { protectedPersona } = validatePersona(actorId, persona);
  return frozenRequest({
    action: 'social.publication.create',
    input: {
      actor_id: actorId,
      actor_state_digest: actorStateDigest,
      protected_persona: protectedPersona,
      content: {
        media_type: 'text/plain',
        text: validatePublicationText(text)
      },
      audience: { mode: 'public' },
      discoverability: 'listed',
      authorship_mode: 'human-authored'
    },
    purpose: 'social-publish',
    data_scopes: ['publication-projection']
  });
}

export function buildSocialPublicationSupersedeRequest({
  actor,
  persona,
  previousPublication,
  text
} = {}) {
  const { actorId, actorStateDigest } = validateActor(actor);
  const { protectedPersona, personaId } = validatePersona(actorId, persona);
  return frozenRequest({
    action: 'social.publication.supersede',
    input: {
      actor_id: actorId,
      actor_state_digest: actorStateDigest,
      protected_persona: protectedPersona,
      previous_publication: validatePreviousPublication(previousPublication, personaId),
      content: {
        media_type: 'text/plain',
        text: validatePublicationText(text)
      },
      audience: { mode: 'public' },
      discoverability: 'listed',
      authorship_mode: 'human-authored'
    },
    purpose: 'social-publish',
    data_scopes: ['publication-projection']
  });
}

export function buildSocialPublicationRetractRequest({ actor, previousPublication } = {}) {
  const { actorId } = validateActor(actor);
  return frozenRequest({
    action: 'social.publication.retract',
    input: {
      actor_id: actorId,
      previous_publication: validatePreviousPublication(previousPublication),
      reason_code: 'author-retracted'
    },
    purpose: 'social-publish',
    data_scopes: ['publication-projection']
  });
}
