import assert from 'node:assert/strict';
import test from 'node:test';

import {
  ACTOR_STATE_SCHEMA,
  CREDENTIAL_EPOCH_SCHEMA,
  PUBLICATION_PERSONA_SCHEMA
} from '../src/identity/actor-state.mjs';
import {
  createPublicPersonaProjection,
  createSocialPublicationProjection,
  createSocialPublicationRetraction,
  createSupersedingSocialPublication
} from '../src/lib/social-publication.mjs';
import { digestObject } from '../src/lib/canonical.mjs';
import { buildLocalSocialSnapshot } from '../src/gateway/social-snapshot.mjs';

const OWNER = 'principal-social-owner';
const OTHER = 'principal-other-owner';

function fixture() {
  const actorState = {
    schema: ACTOR_STATE_SCHEMA,
    actor_id: 'actor-social-owner',
    actor_type: 'human',
    lifecycle_state: 'active',
    credential_epochs: [{
      schema: CREDENTIAL_EPOCH_SCHEMA,
      actor_id: 'actor-social-owner',
      epoch_id: 'epoch-social-owner-1',
      sequence: 1,
      state: 'active',
      crypto_profile_id: 'local-principal-custody-v1',
      activated_at: '2026-08-16T18:00:00.000Z',
      ended_at: null,
      predecessor_epoch_id: null
    }],
    active_epoch_id: 'epoch-social-owner-1',
    state_compartments: ['identity', 'publications'],
    continuity_predecessor_actor_id: null,
    succession_directive_digest: null
  };
  const persona = {
    schema: PUBLICATION_PERSONA_SCHEMA,
    persona_id: 'persona-social-owner',
    controller_actor_id: actorState.actor_id,
    represented_actor_id: null,
    attribution_mode: 'pseudonymous',
    public_actor_link: null,
    selective_link_commitment: null,
    delegation_authority_digest: null,
    created_at: '2026-08-16T18:01:00.000Z',
    status: 'active'
  };
  const first = createSocialPublicationProjection({
    publication_id: 'publication-social-1',
    content: { media_type: 'text/plain', text: 'first' },
    attachment_digests: [],
    audience: { mode: 'public' },
    discoverability: 'listed',
    authorship_mode: 'human-authored',
    created_at: '2026-08-16T18:02:00.000Z',
    supersedes_digest: null
  }, { persona });
  const second = createSupersedingSocialPublication(first, {
    publication_id: 'publication-social-2',
    content: { media_type: 'text/plain', text: 'second' },
    attachment_digests: [],
    audience: { mode: 'public' },
    discoverability: 'listed',
    authorship_mode: 'human-authored',
    created_at: '2026-08-16T18:03:00.000Z',
    supersedes_digest: first.projection_digest
  }, { persona });
  const retraction = createSocialPublicationRetraction(second, {
    reason_code: 'author-retracted',
    occurred_at: '2026-08-16T18:04:00.000Z'
  });
  return { actorState, persona, first, second, retraction };
}

function socialEvents() {
  const { actorState, persona, first, second, retraction } = fixture();
  return [
    {
      seq: 1,
      actor: OWNER,
      kind: 'intent.accepted',
      subject: 'intent-unrelated',
      payload: { private: 'unrelated' }
    },
    {
      seq: 2,
      actor: OTHER,
      kind: 'actor.local.created',
      subject: 'actor-other',
      payload: {
        owner: OTHER,
        actor_state: { ...actorState, actor_id: 'actor-other', credential_epochs: [{
          ...actorState.credential_epochs[0],
          actor_id: 'actor-other',
          epoch_id: 'epoch-other-1'
        }], active_epoch_id: 'epoch-other-1' },
        actor_state_digest: '0'.repeat(64)
      }
    },
    {
      seq: 3,
      actor: OWNER,
      kind: 'actor.local.created',
      subject: actorState.actor_id,
      payload: {
        owner: OWNER,
        actor_state: actorState,
        actor_state_digest: digestObject(actorState),
        evidence: { intentionally: 'not projected' }
      }
    },
    {
      seq: 4,
      actor: OWNER,
      kind: 'social.persona.saved',
      subject: persona.persona_id,
      payload: {
        owner: OWNER,
        actor_id: actorState.actor_id,
        protected_persona: persona,
        public_projection: createPublicPersonaProjection(persona),
        evidence: { intentionally: 'not projected' }
      }
    },
    {
      seq: 5,
      actor: OWNER,
      kind: 'social.publication.saved',
      subject: first.projection_digest,
      payload: {
        owner: OWNER,
        actor_id: actorState.actor_id,
        publication: first,
        state_access_envelope: { private: 'not projected' },
        state_access_use: { private: 'not projected' },
        evidence: { intentionally: 'not projected' }
      }
    },
    {
      seq: 6,
      actor: OWNER,
      kind: 'social.publication.saved',
      subject: second.projection_digest,
      payload: {
        owner: OWNER,
        actor_id: actorState.actor_id,
        publication: second,
        state_access_envelope: { private: 'not projected' },
        state_access_use: { private: 'not projected' }
      }
    },
    {
      seq: 7,
      actor: OWNER,
      kind: 'social.publication.retracted',
      subject: retraction.transition_digest,
      payload: {
        owner: OWNER,
        actor_id: actorState.actor_id,
        transition: retraction
      }
    }
  ];
}

test('owner social snapshot exposes only bounded social state and strips mutation evidence', () => {
  const snapshot = buildLocalSocialSnapshot(socialEvents(), OWNER);
  assert.equal(snapshot.schema, 'axiom-local-social-snapshot.v1');
  assert.equal(snapshot.owner, OWNER);
  assert.equal(snapshot.network_effect, 'none');
  assert.equal(snapshot.actors.length, 1);
  assert.equal(snapshot.personas.length, 1);
  assert.equal(snapshot.personas[0].public_projection.public_actor_link, null);
  assert.equal(snapshot.corpus.publications.length, 2);
  const byDigest = new Map(snapshot.corpus.publications.map(item => [item.projection_digest, item]));
  const { first, second } = fixture();
  assert.equal(byDigest.get(first.projection_digest).status, 'superseded');
  assert.equal(byDigest.get(second.projection_digest).status, 'retracted');
  assert.equal(snapshot.corpus.transitions.length, 1);
  const serialized = JSON.stringify(snapshot);
  assert.doesNotMatch(serialized, /intentionally|state_access_envelope|state_access_use/);
  assert.doesNotMatch(serialized, /principal-other-owner|unrelated/);
});

test('publication limit is explicit and reports truncation', () => {
  const snapshot = buildLocalSocialSnapshot(socialEvents(), OWNER, { publicationLimit: 1 });
  assert.equal(snapshot.corpus.publications.length, 1);
  assert.equal(snapshot.corpus.truncated, true);
});

test('snapshot rejects wrong-owner social payload and unordered history', () => {
  const wrongOwner = socialEvents();
  wrongOwner[2] = {
    ...wrongOwner[2],
    payload: { ...wrongOwner[2].payload, owner: OTHER }
  };
  assert.throws(() => buildLocalSocialSnapshot(wrongOwner, OWNER), /owner does not match/);

  const unordered = socialEvents();
  unordered[4] = { ...unordered[4], seq: 3 };
  assert.throws(() => buildLocalSocialSnapshot(unordered, OWNER), /strictly sequence ordered/);
});

test('snapshot fails closed when bounded reconstruction history is exceeded', () => {
  assert.throws(
    () => buildLocalSocialSnapshot(socialEvents(), OWNER, { maximumEvents: 5 }),
    /event history exceeds/
  );
});
