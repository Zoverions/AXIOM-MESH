import {
  ValidationError,
  assertPlainObject,
  assertString,
  digestObject,
  newId
} from '../lib/canonical.mjs';
import {
  ACTOR_STATE_SCHEMA,
  CREDENTIAL_EPOCH_SCHEMA,
  PUBLICATION_PERSONA_SCHEMA,
  normalizeActorState,
  normalizePublicationPersona
} from '../identity/actor-state.mjs';
import {
  STATE_ACCESS_ENVELOPE_SCHEMA,
  normalizeStateAccessEnvelope,
  verifyStateAccessUse
} from '../identity/actor-state-access.mjs';
import {
  createPublicPersonaProjection,
  createSocialPublicationProjection,
  createSocialPublicationRetraction,
  createSupersedingSocialPublication,
  validateSocialPublicationProjection
} from '../lib/social-publication.mjs';
import { executeBuiltin as executeCoreBuiltin } from './executor.mjs';

const ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,191}$/;
const DIGEST = /^[a-f0-9]{64}$/;
const LOCAL_SOCIAL_ACTIONS = new Set([
  'social.actor.create',
  'social.persona.create',
  'social.publication.create',
  'social.publication.supersede',
  'social.publication.retract'
]);

export function executeBuiltin({ tool, intent, assurance }) {
  const action = intent?.action;
  if (!LOCAL_SOCIAL_ACTIONS.has(action)) {
    return executeCoreBuiltin({ tool, intent });
  }
  if (tool !== 'builtin.validate-mutation') {
    throw new ValidationError('Capability tool does not match local social intent action');
  }
  const principal = assertPlainObject(intent.principal, 'intent.principal');
  const principalId = id(principal.id, 'intent.principal.id');
  const input = assertPlainObject(intent.input ?? {}, 'intent.input');
  switch (action) {
    case 'social.actor.create':
      return createLocalActor(principalId, input);
    case 'social.persona.create':
      return createLocalPersona(principalId, input);
    case 'social.publication.create':
      return createLocalPublication(principalId, input, assurance);
    case 'social.publication.supersede':
      return supersedeLocalPublication(principalId, input, assurance);
    case 'social.publication.retract':
      return retractLocalPublication(principalId, input);
    default:
      throw new ValidationError('Unsupported local social action');
  }
}

function createLocalActor(owner, input) {
  exactKeys(input, [], 'social actor create input');
  const now = new Date().toISOString();
  const actorId = newId('actor');
  const epochId = newId('epoch');
  const actorState = normalizeActorState({
    schema: ACTOR_STATE_SCHEMA,
    actor_id: actorId,
    actor_type: 'human',
    lifecycle_state: 'active',
    credential_epochs: [{
      schema: CREDENTIAL_EPOCH_SCHEMA,
      actor_id: actorId,
      epoch_id: epochId,
      sequence: 1,
      state: 'active',
      crypto_profile_id: 'local-principal-custody-v1',
      activated_at: now,
      ended_at: null,
      predecessor_epoch_id: null
    }],
    active_epoch_id: epochId,
    state_compartments: ['identity', 'publications'],
    continuity_predecessor_actor_id: null,
    succession_directive_digest: null
  });
  const actorStateDigest = digestObject(actorState);
  return {
    output: {
      actor_id: actorId,
      actor_state_digest: actorStateDigest,
      lifecycle_state: actorState.lifecycle_state,
      custody: 'owner-local',
      network_effect: 'none'
    },
    mutation: {
      kind: 'actor.local.created',
      subject: actorId,
      payload: {
        owner,
        actor_state: actorState,
        actor_state_digest: actorStateDigest
      }
    }
  };
}

function createLocalPersona(owner, input) {
  exactKeys(input, [
    'actor_id',
    'attribution_mode',
    'selective_link_commitment'
  ], 'social persona create input', { optional: ['selective_link_commitment'] });
  const actorId = id(input.actor_id, 'social persona actor_id');
  const mode = assertString(input.attribution_mode, 'social persona attribution_mode', { max: 64 });
  if (![
    'public-identifiable',
    'pseudonymous',
    'selectively-attributable',
    'anonymous'
  ].includes(mode)) {
    if (mode === 'organization-delegated') {
      throw new ValidationError(
        'organization-delegated persona activation requires separately verified delegation authority'
      );
    }
    throw new ValidationError('social persona attribution_mode is unsupported');
  }
  const commitment = input.selective_link_commitment === undefined
    ? null
    : digest(input.selective_link_commitment, 'social persona selective_link_commitment');
  const persona = normalizePublicationPersona({
    schema: PUBLICATION_PERSONA_SCHEMA,
    persona_id: newId('persona'),
    controller_actor_id: actorId,
    represented_actor_id: null,
    attribution_mode: mode,
    public_actor_link: mode === 'public-identifiable' ? actorId : null,
    selective_link_commitment: commitment,
    delegation_authority_digest: null,
    created_at: new Date().toISOString(),
    status: 'active'
  });
  const publicProjection = createPublicPersonaProjection(persona);
  return {
    output: {
      persona_id: persona.persona_id,
      actor_id: actorId,
      public_projection: publicProjection,
      private_fields_retained_locally: [
        'controller_actor_id',
        ...(mode === 'selectively-attributable' ? ['selective_link_commitment'] : [])
      ],
      network_effect: 'none'
    },
    mutation: {
      kind: 'social.persona.saved',
      subject: persona.persona_id,
      payload: {
        owner,
        actor_id: actorId,
        protected_persona: persona,
        public_projection: publicProjection
      }
    }
  };
}

function createLocalPublication(owner, input, assurance) {
  exactKeys(input, [
    'actor_id',
    'actor_state_digest',
    'protected_persona',
    'content',
    'attachment_digests',
    'audience',
    'discoverability',
    'authorship_mode'
  ], 'social publication create input', { optional: ['attachment_digests'] });
  const actorId = id(input.actor_id, 'social publication actor_id');
  const actorStateDigest = digest(input.actor_state_digest, 'social publication actor_state_digest');
  const persona = normalizePublicationPersona(input.protected_persona);
  if (persona.controller_actor_id !== actorId) {
    throw new ValidationError('social publication persona controller does not match actor');
  }
  const publication = createSocialPublicationProjection({
    publication_id: newId('publication'),
    content: structuredClone(assertPlainObject(input.content, 'social publication content')),
    attachment_digests: structuredClone(input.attachment_digests ?? []),
    audience: structuredClone(assertPlainObject(input.audience, 'social publication audience')),
    discoverability: input.discoverability,
    authorship_mode: input.authorship_mode,
    created_at: new Date().toISOString(),
    supersedes_digest: null
  }, { persona });
  return publicationMutation({ owner, actorId, actorStateDigest, persona, publication, assurance });
}

function supersedeLocalPublication(owner, input, assurance) {
  exactKeys(input, [
    'actor_id',
    'actor_state_digest',
    'protected_persona',
    'previous_publication',
    'content',
    'attachment_digests',
    'audience',
    'discoverability',
    'authorship_mode'
  ], 'social publication supersede input', { optional: ['attachment_digests'] });
  const actorId = id(input.actor_id, 'social publication actor_id');
  const actorStateDigest = digest(input.actor_state_digest, 'social publication actor_state_digest');
  const persona = normalizePublicationPersona(input.protected_persona);
  if (persona.controller_actor_id !== actorId) {
    throw new ValidationError('social publication persona controller does not match actor');
  }
  const previous = validateSocialPublicationProjection(input.previous_publication);
  const publication = createSupersedingSocialPublication(previous, {
    publication_id: newId('publication'),
    content: structuredClone(assertPlainObject(input.content, 'social publication content')),
    attachment_digests: structuredClone(input.attachment_digests ?? []),
    audience: structuredClone(assertPlainObject(input.audience, 'social publication audience')),
    discoverability: input.discoverability,
    authorship_mode: input.authorship_mode,
    created_at: nextTimestampAfter(previous.created_at),
    supersedes_digest: previous.projection_digest
  }, { persona });
  return publicationMutation({ owner, actorId, actorStateDigest, persona, publication, assurance });
}

function retractLocalPublication(owner, input) {
  exactKeys(input, ['actor_id', 'previous_publication', 'reason_code'], 'social publication retract input');
  const actorId = id(input.actor_id, 'social publication actor_id');
  const previous = validateSocialPublicationProjection(input.previous_publication);
  const transition = createSocialPublicationRetraction(previous, {
    reason_code: assertString(input.reason_code, 'social publication reason_code', {
      min: 1,
      max: 64,
      pattern: /^[a-z][a-z0-9._-]{0,63}$/
    }),
    occurred_at: nextTimestampAfter(previous.created_at)
  });
  return {
    output: {
      publication_digest: previous.projection_digest,
      transition_digest: transition.transition_digest,
      status: 'retracted',
      stop_serving_requested: true,
      third_party_deletion_claimed: false,
      network_effect: 'none'
    },
    mutation: {
      kind: 'social.publication.retracted',
      subject: transition.transition_digest,
      payload: { owner, actor_id: actorId, transition }
    }
  };
}

function publicationMutation({ owner, actorId, actorStateDigest, persona, publication, assurance }) {
  const assuranceState = assertPlainObject(assurance, 'plan assurance');
  const requiredAssurance = assertString(assuranceState.required, 'plan assurance required', {
    min: 2,
    max: 2,
    pattern: /^A[0-4]$/
  });
  const observedAssurance = assertString(assuranceState.achieved, 'plan assurance achieved', {
    min: 2,
    max: 2,
    pattern: /^A[0-4]$/
  });
  const now = new Date().toISOString();
  const expiresAt = new Date(Date.parse(now) + 5 * 60_000).toISOString();
  const disclosure = persona.attribution_mode === 'public-identifiable' ? 'public' : 'pseudonymous';
  const envelope = normalizeStateAccessEnvelope({
    schema: STATE_ACCESS_ENVELOPE_SCHEMA,
    envelope_id: newId('state_access'),
    subject_actor_id: actorId,
    requester_actor_id: actorId,
    state_class: 'publications',
    purpose: 'social-publish',
    action: 'publish',
    data_scopes: ['publication-projection'],
    recipient_actor_ids: [],
    disclosure_profile: disclosure,
    authority_basis: {
      type: 'self_authority',
      source_id: actorId,
      basis_digest: actorStateDigest
    },
    consent: { required: false, receipt_digest: null },
    required_assurance: requiredAssurance,
    observed_assurance: observedAssurance,
    effective_at: now,
    expires_at: expiresAt,
    raw_state_allowed: false,
    grants_ordinary_authority: false
  });
  const useRequest = {
    subject_actor_id: actorId,
    requester_actor_id: actorId,
    state_class: 'publications',
    purpose: 'social-publish',
    action: 'publish',
    data_scopes: ['publication-projection'],
    recipient_actor_ids: [],
    disclosure_profile: disclosure,
    payload_digest: publication.projection_digest
  };
  verifyStateAccessUse(envelope, useRequest, now);
  return {
    output: {
      publication,
      public_persona: createPublicPersonaProjection(persona),
      state_access_envelope_digest: digestObject(envelope),
      local_corpus_effect: 'append',
      network_effect: 'none'
    },
    mutation: {
      kind: 'social.publication.saved',
      subject: publication.projection_digest,
      payload: {
        owner,
        actor_id: actorId,
        publication,
        state_access_envelope: envelope,
        state_access_use: useRequest
      }
    }
  };
}

function nextTimestampAfter(previous) {
  const now = Date.now();
  const minimum = Date.parse(previous) + 1;
  return new Date(Math.max(now, minimum)).toISOString();
}

function id(value, label) {
  return assertString(value, label, { min: 1, max: 192, pattern: ID });
}

function digest(value, label) {
  return assertString(value, label, { min: 64, max: 64, pattern: DIGEST });
}

function exactKeys(value, required, label, { optional = [] } = {}) {
  const expected = new Set([...required, ...optional]);
  for (const key of Object.keys(value)) {
    if (!expected.has(key)) throw new ValidationError(`${label} contains unsupported field ${key}`);
  }
  for (const key of required) {
    if (!(key in value)) throw new ValidationError(`${label} is missing ${key}`);
  }
}
