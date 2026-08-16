import {
  ValidationError,
  assertPlainObject,
  assertString,
  canonicalJson,
  digestObject
} from '../lib/canonical.mjs';
import { normalizeActorState } from '../identity/actor-state.mjs';
import {
  normalizeStateAccessEnvelope,
  verifyStateAccessUse
} from '../identity/actor-state-access.mjs';
import {
  createPublicPersonaProjection,
  validatePublicPersonaProjection,
  validateSocialPublicationProjection,
  validateSocialPublicationRetraction
} from '../lib/social-publication.mjs';
import { normalizePublicationPersona } from '../identity/actor-state.mjs';

export const SOCIAL_GRID_EVENT_KINDS = Object.freeze({
  actorCreated: 'actor.local.created',
  personaSaved: 'social.persona.saved',
  publicationSaved: 'social.publication.saved',
  publicationRetracted: 'social.publication.retracted'
});

const ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,191}$/;
const DIGEST = /^[a-f0-9]{64}$/;

function id(value, label) {
  return assertString(value, label, { min: 1, max: 192, pattern: ID });
}

function digest(value, label) {
  return assertString(value, label, { min: 64, max: 64, pattern: DIGEST });
}

function exactKeys(value, expected, label) {
  const object = assertPlainObject(value, label);
  const actual = Object.keys(object).sort();
  const wanted = [...expected].sort();
  if (actual.join(',') !== wanted.join(',')) {
    throw new ValidationError(`${label} fields are invalid`);
  }
  return object;
}

export function normalizeActorCreatedPayload(raw) {
  const value = exactKeys(raw, ['owner', 'actor_state', 'actor_state_digest'], 'actor-created payload');
  const owner = id(value.owner, 'actor-created owner');
  const actorState = normalizeActorState(value.actor_state);
  const actorStateDigest = digest(value.actor_state_digest, 'actor-created actor_state_digest');
  if (actorStateDigest !== digestObject(actorState)) {
    throw new ValidationError('actor-created state digest does not match canonical actor state');
  }
  if (actorState.lifecycle_state !== 'active') {
    throw new ValidationError('initial local actor custody requires an active actor state');
  }
  return Object.freeze({
    owner,
    actor_state: actorState,
    actor_state_digest: actorStateDigest
  });
}

export function normalizePersonaSavedPayload(raw) {
  const value = exactKeys(
    raw,
    ['owner', 'actor_id', 'protected_persona', 'public_projection'],
    'persona-saved payload'
  );
  const owner = id(value.owner, 'persona-saved owner');
  const actorId = id(value.actor_id, 'persona-saved actor_id');
  const protectedPersona = normalizePublicationPersona(value.protected_persona);
  if (protectedPersona.controller_actor_id !== actorId) {
    throw new ValidationError('publication persona controller must match the locally custodied actor');
  }
  const publicProjection = validatePublicPersonaProjection(value.public_projection);
  const expectedProjection = createPublicPersonaProjection(protectedPersona);
  if (canonicalJson(publicProjection) !== canonicalJson(expectedProjection)) {
    throw new ValidationError('public persona projection does not match protected persona');
  }
  return Object.freeze({
    owner,
    actor_id: actorId,
    protected_persona: protectedPersona,
    public_projection: publicProjection
  });
}

export function normalizePublicationSavedPayload(raw, { now } = {}) {
  const value = exactKeys(
    raw,
    ['owner', 'actor_id', 'publication', 'state_access_envelope', 'state_access_use'],
    'publication-saved payload'
  );
  const owner = id(value.owner, 'publication-saved owner');
  const actorId = id(value.actor_id, 'publication-saved actor_id');
  const publication = validateSocialPublicationProjection(value.publication);
  const envelope = normalizeStateAccessEnvelope(value.state_access_envelope);
  if (
    envelope.subject_actor_id !== actorId
    || envelope.state_class !== 'publications'
    || envelope.action !== 'publish'
    || envelope.raw_state_allowed !== false
  ) {
    throw new ValidationError('publication state-access envelope is not bound to the actor publication projection');
  }
  const use = verifyStateAccessUse(
    envelope,
    value.state_access_use,
    now ?? new Date().toISOString()
  );
  if (use.payload_digest !== publication.projection_digest) {
    throw new ValidationError('publication state-access use is not bound to the publication projection digest');
  }
  return Object.freeze({
    owner,
    actor_id: actorId,
    publication,
    state_access_envelope: envelope,
    state_access_use: use
  });
}

export function normalizePublicationRetractedPayload(raw) {
  const value = exactKeys(
    raw,
    ['owner', 'actor_id', 'transition'],
    'publication-retracted payload'
  );
  return Object.freeze({
    owner: id(value.owner, 'publication-retracted owner'),
    actor_id: id(value.actor_id, 'publication-retracted actor_id'),
    transition: validateSocialPublicationRetraction(value.transition)
  });
}

export function validateSocialGridEvent(event, actor, { now } = {}) {
  const value = assertPlainObject(event, 'social Grid event');
  if (!Object.values(SOCIAL_GRID_EVENT_KINDS).includes(value.kind)) return null;
  if (!value.payload || typeof value.payload !== 'object' || Array.isArray(value.payload)) {
    throw new ValidationError('social Grid event payload is invalid');
  }
  let payload;
  if (value.kind === SOCIAL_GRID_EVENT_KINDS.actorCreated) {
    payload = normalizeActorCreatedPayload(value.payload);
    if (value.subject !== payload.actor_state.actor_id) {
      throw new ValidationError('actor-created event subject must equal actor_id');
    }
  } else if (value.kind === SOCIAL_GRID_EVENT_KINDS.personaSaved) {
    payload = normalizePersonaSavedPayload(value.payload);
    if (value.subject !== payload.protected_persona.persona_id) {
      throw new ValidationError('persona-saved event subject must equal persona_id');
    }
  } else if (value.kind === SOCIAL_GRID_EVENT_KINDS.publicationSaved) {
    payload = normalizePublicationSavedPayload(value.payload, { now });
    if (value.subject !== payload.publication.projection_digest) {
      throw new ValidationError('publication-saved event subject must equal projection digest');
    }
  } else {
    payload = normalizePublicationRetractedPayload(value.payload);
    if (value.subject !== payload.transition.transition_digest) {
      throw new ValidationError('publication-retracted event subject must equal transition digest');
    }
  }
  if (payload.owner !== actor) {
    throw new ValidationError('social Grid owner must match the authenticated custodian principal');
  }
  return payload;
}
