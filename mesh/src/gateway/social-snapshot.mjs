import {
  ValidationError,
  assertPlainObject,
  assertString,
  digestObject
} from '../lib/canonical.mjs';
import {
  createPublicPersonaProjection,
  validateSocialPublicationProjection,
  validateSocialPublicationRetraction
} from '../lib/social-publication.mjs';
import {
  normalizeActorState,
  normalizePublicationPersona
} from '../identity/actor-state.mjs';

const SOCIAL_EVENT_KINDS = new Set([
  'actor.local.created',
  'social.persona.saved',
  'social.publication.saved',
  'social.publication.retracted'
]);
const PRINCIPAL_ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/;
const DIGEST = /^[a-f0-9]{64}$/;

export function buildLocalSocialSnapshot(events, owner, {
  maximumEvents = 5_000,
  publicationLimit = 100
} = {}) {
  if (!Array.isArray(events)) throw new ValidationError('Social snapshot events must be an array');
  if (!Number.isSafeInteger(maximumEvents) || maximumEvents < 1 || maximumEvents > 5_000) {
    throw new ValidationError('Social snapshot maximumEvents must be between 1 and 5000');
  }
  if (!Number.isSafeInteger(publicationLimit) || publicationLimit < 1 || publicationLimit > 100) {
    throw new ValidationError('Social snapshot publicationLimit must be between 1 and 100');
  }
  const principal = assertString(owner, 'social snapshot owner', {
    min: 1,
    max: 160,
    pattern: PRINCIPAL_ID
  });
  if (events.length > maximumEvents) {
    throw new ValidationError('Social snapshot event history exceeds the bounded reconstruction limit');
  }

  const actors = new Map();
  const personas = new Map();
  const publications = new Map();
  const transitions = [];
  let lastSeq = 0;

  for (const [index, raw] of events.entries()) {
    const event = assertPlainObject(raw, `social snapshot events[${index}]`);
    if (!Number.isSafeInteger(event.seq) || event.seq <= lastSeq) {
      throw new ValidationError('Social snapshot events must be strictly sequence ordered');
    }
    lastSeq = event.seq;
    if (event.actor !== principal || !SOCIAL_EVENT_KINDS.has(event.kind)) continue;
    const payload = assertPlainObject(event.payload, `social snapshot ${event.kind} payload`);
    if (payload.owner !== principal) {
      throw new ValidationError('Social snapshot event owner does not match authenticated principal');
    }

    if (event.kind === 'actor.local.created') {
      const actorState = normalizeActorState(payload.actor_state);
      const actorStateDigest = assertString(
        payload.actor_state_digest,
        'social snapshot actor_state_digest',
        { min: 64, max: 64, pattern: DIGEST }
      );
      if (actorStateDigest !== digestObject(actorState)) {
        throw new ValidationError('Social snapshot actor state digest is invalid');
      }
      if (event.subject !== actorState.actor_id) {
        throw new ValidationError('Social snapshot actor subject is invalid');
      }
      actors.set(actorState.actor_id, {
        actor_id: actorState.actor_id,
        actor_state_digest: actorStateDigest,
        actor_state: actorState,
        status: actorState.lifecycle_state,
        custody: 'owner-local'
      });
      continue;
    }

    if (event.kind === 'social.persona.saved') {
      const persona = normalizePublicationPersona(payload.protected_persona);
      if (event.subject !== persona.persona_id || persona.controller_actor_id !== payload.actor_id) {
        throw new ValidationError('Social snapshot persona binding is invalid');
      }
      const publicProjection = createPublicPersonaProjection(persona);
      personas.set(persona.persona_id, {
        persona_id: persona.persona_id,
        actor_id: payload.actor_id,
        protected_persona: persona,
        public_projection: publicProjection,
        status: persona.status
      });
      continue;
    }

    if (event.kind === 'social.publication.saved') {
      const publication = validateSocialPublicationProjection(payload.publication);
      if (event.subject !== publication.projection_digest) {
        throw new ValidationError('Social snapshot publication subject is invalid');
      }
      if (publication.supersedes_digest !== null) {
        const prior = publications.get(publication.supersedes_digest);
        if (prior) prior.status = 'superseded';
      }
      publications.set(publication.projection_digest, {
        projection_digest: publication.projection_digest,
        actor_id: payload.actor_id,
        persona_id: publication.persona_id,
        publication,
        status: 'active'
      });
      continue;
    }

    const transition = validateSocialPublicationRetraction(payload.transition);
    if (event.subject !== transition.transition_digest) {
      throw new ValidationError('Social snapshot retraction subject is invalid');
    }
    const target = publications.get(transition.publication_digest);
    if (target) target.status = 'retracted';
    transitions.push({
      transition_digest: transition.transition_digest,
      publication_digest: transition.publication_digest,
      transition
    });
  }

  const orderedPublications = [...publications.values()]
    .sort((left, right) => (
      right.publication.created_at.localeCompare(left.publication.created_at)
      || right.projection_digest.localeCompare(left.projection_digest)
    ));
  const truncated = orderedPublications.length > publicationLimit;
  const selected = orderedPublications.slice(0, publicationLimit);
  const selectedDigests = new Set(selected.map(item => item.projection_digest));

  return Object.freeze({
    schema: 'axiom-local-social-snapshot.v1',
    owner: principal,
    actors: [...actors.values()],
    personas: [...personas.values()],
    corpus: {
      publications: selected,
      transitions: transitions.filter(item => selectedDigests.has(item.publication_digest)),
      truncated
    },
    network_effect: 'none'
  });
}