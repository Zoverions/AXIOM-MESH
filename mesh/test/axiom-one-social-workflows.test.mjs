import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildSocialActorCreateRequest,
  buildSocialPersonaCreateRequest,
  buildSocialPublicationCreateRequest,
  buildSocialPublicationRetractRequest,
  buildSocialPublicationSupersedeRequest
} from '../../apps/axiom-one/social-workflows.mjs';

const ACTOR_ID = 'actor-axiom-one-owner';
const PERSONA_ID = 'persona-axiom-one-owner';
const ACTOR_DIGEST = 'a'.repeat(64);
const PERSONA_DIGEST = 'b'.repeat(64);
const PUBLICATION_DIGEST = 'c'.repeat(64);

const actor = Object.freeze({
  actor_id: ACTOR_ID,
  actor_state_digest: ACTOR_DIGEST,
  status: 'active',
  custody: 'owner-local'
});

const protectedPersona = Object.freeze({
  schema: 'axiom-publication-persona.v1',
  persona_id: PERSONA_ID,
  controller_actor_id: ACTOR_ID,
  represented_actor_id: null,
  attribution_mode: 'pseudonymous',
  public_actor_link: null,
  selective_link_commitment: null,
  delegation_authority_digest: null,
  created_at: '2026-08-31T18:00:00.000Z',
  status: 'active'
});

const persona = Object.freeze({
  persona_id: PERSONA_ID,
  actor_id: ACTOR_ID,
  protected_persona: protectedPersona,
  public_projection: Object.freeze({
    schema: 'axiom-publication-persona-projection.v1',
    persona_id: PERSONA_ID,
    attribution_mode: 'pseudonymous',
    public_actor_link: null,
    created_at: '2026-08-31T18:00:00.000Z',
    status: 'active',
    authority_effect: 'none',
    projection_digest: PERSONA_DIGEST
  }),
  status: 'active'
});

const previousPublication = Object.freeze({
  schema: 'axiom-social-publication-projection.v1',
  publication_id: 'publication-axiom-one-1',
  persona_id: PERSONA_ID,
  persona_projection_digest: PERSONA_DIGEST,
  attribution_mode: 'pseudonymous',
  public_actor_link: null,
  content: Object.freeze({ media_type: 'text/plain', text: 'Original local text.' }),
  attachment_digests: Object.freeze([]),
  audience: Object.freeze({ mode: 'public' }),
  discoverability: 'listed',
  authorship_mode: 'human-authored',
  created_at: '2026-08-31T18:01:00.000Z',
  supersedes_digest: null,
  authority_effect: 'none',
  network_effect: 'none',
  projection_digest: PUBLICATION_DIGEST
});

test('Axiom One builds exact local actor and pseudonymous persona intent requests', () => {
  assert.deepEqual(buildSocialActorCreateRequest(), {
    action: 'social.actor.create',
    input: {},
    purpose: 'local-social-identity',
    data_scopes: ['social:identity']
  });

  assert.deepEqual(buildSocialPersonaCreateRequest({ actor }), {
    action: 'social.persona.create',
    input: {
      actor_id: ACTOR_ID,
      attribution_mode: 'pseudonymous'
    },
    purpose: 'local-social-persona',
    data_scopes: ['social:identity']
  });
});

test('Axiom One builds an exact public listed human-authored text publication request', () => {
  const request = buildSocialPublicationCreateRequest({
    actor,
    persona,
    text: 'A local publication with no federation.'
  });
  assert.deepEqual(request, {
    action: 'social.publication.create',
    input: {
      actor_id: ACTOR_ID,
      actor_state_digest: ACTOR_DIGEST,
      protected_persona: structuredClone(protectedPersona),
      content: {
        media_type: 'text/plain',
        text: 'A local publication with no federation.'
      },
      audience: { mode: 'public' },
      discoverability: 'listed',
      authorship_mode: 'human-authored'
    },
    purpose: 'social-publish',
    data_scopes: ['publication-projection']
  });
  assert.equal(Object.isFrozen(request), true);
  assert.equal(Object.isFrozen(request.input), true);
  assert.equal(Object.isFrozen(request.input.protected_persona), true);
});

test('Axiom One supersession and retraction preserve exact append-only lineage', () => {
  assert.deepEqual(buildSocialPublicationSupersedeRequest({
    actor,
    persona,
    previousPublication,
    text: 'Replacement local text.'
  }), {
    action: 'social.publication.supersede',
    input: {
      actor_id: ACTOR_ID,
      actor_state_digest: ACTOR_DIGEST,
      protected_persona: structuredClone(protectedPersona),
      previous_publication: structuredClone(previousPublication),
      content: {
        media_type: 'text/plain',
        text: 'Replacement local text.'
      },
      audience: { mode: 'public' },
      discoverability: 'listed',
      authorship_mode: 'human-authored'
    },
    purpose: 'social-publish',
    data_scopes: ['publication-projection']
  });

  assert.deepEqual(buildSocialPublicationRetractRequest({
    actor,
    previousPublication
  }), {
    action: 'social.publication.retract',
    input: {
      actor_id: ACTOR_ID,
      previous_publication: structuredClone(previousPublication),
      reason_code: 'author-retracted'
    },
    purpose: 'social-publish',
    data_scopes: ['publication-projection']
  });
});

test('Axiom One Social workflow builders fail closed on identity or product-boundary drift', () => {
  assert.throws(
    () => buildSocialPersonaCreateRequest({ actor: { ...actor, custody: 'remote' } }),
    /owner-local/
  );
  assert.throws(
    () => buildSocialPublicationCreateRequest({
      actor,
      persona: {
        ...persona,
        actor_id: 'actor-other',
        protected_persona: { ...protectedPersona, controller_actor_id: 'actor-other' }
      },
      text: 'Mismatch'
    }),
    /actor binding/
  );
  assert.throws(
    () => buildSocialPublicationCreateRequest({
      actor,
      persona: {
        ...persona,
        protected_persona: { ...protectedPersona, attribution_mode: 'anonymous' }
      },
      text: 'Wrong attribution mode'
    }),
    /pseudonymous/
  );
  assert.throws(
    () => buildSocialPublicationCreateRequest({ actor, persona, text: '' }),
    /publication text/
  );
  assert.throws(
    () => buildSocialPublicationRetractRequest({
      actor,
      previousPublication: { ...previousPublication, network_effect: 'remote' }
    }),
    /network effect/
  );
});
