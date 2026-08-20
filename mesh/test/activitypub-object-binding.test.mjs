import assert from 'node:assert/strict';
import test from 'node:test';

import { PUBLICATION_PERSONA_SCHEMA } from '../src/identity/actor-state.mjs';
import {
  createSocialPublicationProjection,
  createSupersedingSocialPublication
} from '../src/lib/social-publication.mjs';
import {
  advanceActivityPubObjectBinding,
  createActivityPubObjectBinding,
  planBoundActivityPubUpdate,
  validateActivityPubObjectBinding
} from '../../packages/axiom-social-activitypub-contract/object-binding.mjs';

const T0 = '2026-08-20T16:00:00.000Z';
const T1 = '2026-08-20T16:01:00.000Z';
const T2 = '2026-08-20T16:02:00.000Z';
const T3 = '2026-08-20T16:03:00.000Z';

function persona(overrides = {}) {
  return {
    schema: PUBLICATION_PERSONA_SCHEMA,
    persona_id: 'persona.owner',
    controller_actor_id: 'actor.owner.private',
    represented_actor_id: null,
    attribution_mode: 'pseudonymous',
    public_actor_link: null,
    selective_link_commitment: null,
    delegation_authority_digest: null,
    created_at: T0,
    status: 'active',
    ...overrides
  };
}

function publication(overrides = {}) {
  return {
    publication_id: 'publication.root',
    content: { media_type: 'text/plain', text: 'Root publication.' },
    attachment_digests: [],
    audience: { mode: 'public' },
    discoverability: 'listed',
    authorship_mode: 'human-authored',
    created_at: T1,
    supersedes_digest: null,
    ...overrides
  };
}

test('stable ActivityPub object binding starts only from an AXIOM lineage root', () => {
  const protectedPersona = persona();
  const root = createSocialPublicationProjection(publication(), { persona: protectedPersona });
  const binding = createActivityPubObjectBinding(root, {
    externalObjectId: 'https://social.example/objects/root-1',
    boundAt: T2
  });
  assert.equal(validateActivityPubObjectBinding(binding).external_object_id, 'https://social.example/objects/root-1');
  assert.equal(binding.lineage_root_projection_digest, root.projection_digest);
  assert.equal(binding.current_projection_digest, root.projection_digest);
  assert.equal(binding.external_identity_is_axiom_identity, false);
  assert.equal(binding.authority_effect, 'none');
  assert.equal(binding.network_effect, 'none');

  const revision = createSupersedingSocialPublication(root, publication({
    publication_id: 'publication.revision-2',
    content: { media_type: 'text/plain', text: 'Revision two.' },
    created_at: T2,
    supersedes_digest: undefined
  }), { persona: protectedPersona });
  assert.throws(
    () => createActivityPubObjectBinding(revision, {
      externalObjectId: 'https://social.example/objects/revision-2',
      boundAt: T3
    }),
    /must begin at a publication lineage root/
  );
});

test('binding advances over exact supersession while external ActivityPub object identity remains stable', () => {
  const protectedPersona = persona();
  const root = createSocialPublicationProjection(publication(), { persona: protectedPersona });
  const revision = createSupersedingSocialPublication(root, publication({
    publication_id: 'publication.revision-2',
    content: { media_type: 'text/plain', text: 'Revision two.' },
    created_at: T2,
    supersedes_digest: undefined
  }), { persona: protectedPersona });
  const binding = createActivityPubObjectBinding(root, {
    externalObjectId: 'https://social.example/objects/stable-object',
    boundAt: T2
  });
  const advanced = advanceActivityPubObjectBinding(binding, root, revision, { advancedAt: T3 });
  assert.equal(advanced.external_object_id, binding.external_object_id);
  assert.equal(advanced.lineage_root_projection_digest, root.projection_digest);
  assert.equal(advanced.current_projection_digest, revision.projection_digest);
  assert.equal(revision.publication_id, 'publication.revision-2');
  assert.notEqual(revision.publication_id, root.publication_id);
});

test('bound update plan represents ActivityPub Update without mutating or executing the AXIOM lineage', () => {
  const protectedPersona = persona();
  const root = createSocialPublicationProjection(publication(), { persona: protectedPersona });
  const revision = createSupersedingSocialPublication(root, publication({
    publication_id: 'publication.revision-2',
    content: { media_type: 'text/plain', text: 'Revision two.' },
    created_at: T2,
    supersedes_digest: undefined
  }), { persona: protectedPersona });
  const binding = createActivityPubObjectBinding(root, {
    externalObjectId: 'https://social.example/objects/stable-object',
    boundAt: T2
  });
  const plan = planBoundActivityPubUpdate(binding, root, revision, { advancedAt: T3 });
  assert.equal(plan.status, 'non-executing-projection-plan');
  assert.equal(plan.activity_type, 'Update');
  assert.equal(plan.object_type, 'Note');
  assert.equal(plan.external_object_id, binding.external_object_id);
  assert.equal(plan.previous_projection_digest, root.projection_digest);
  assert.equal(plan.next_projection_digest, revision.projection_digest);
  assert.equal(plan.requires_live_activitypub_transport, true);
  assert.equal(plan.transport_effect, 'none');
  assert.equal(plan.authority_effect, 'none');
  assert.equal(plan.network_effect, 'none');
});

test('stale binding, broken supersession and persona substitution fail closed', () => {
  const protectedPersona = persona();
  const root = createSocialPublicationProjection(publication(), { persona: protectedPersona });
  const revision = createSupersedingSocialPublication(root, publication({
    publication_id: 'publication.revision-2',
    content: { media_type: 'text/plain', text: 'Revision two.' },
    created_at: T2,
    supersedes_digest: undefined
  }), { persona: protectedPersona });
  const binding = createActivityPubObjectBinding(root, {
    externalObjectId: 'https://social.example/objects/stable-object',
    boundAt: T2
  });

  const stale = { ...binding, current_projection_digest: 'f'.repeat(64) };
  assert.throws(
    () => advanceActivityPubObjectBinding(stale, root, revision, { advancedAt: T3 }),
    /stale for the previous projection/
  );

  const unrelated = createSocialPublicationProjection(publication({
    publication_id: 'publication.unrelated',
    content: { media_type: 'text/plain', text: 'Unrelated.' },
    created_at: T2
  }), { persona: protectedPersona });
  assert.throws(
    () => advanceActivityPubObjectBinding(binding, root, unrelated, { advancedAt: T3 }),
    /requires exact AXIOM supersession/
  );
});

test('external ActivityPub object ids must be canonical credential-free HTTPS URLs', () => {
  const protectedPersona = persona();
  const root = createSocialPublicationProjection(publication(), { persona: protectedPersona });
  for (const badId of [
    'http://social.example/objects/1',
    'https://user:pass@social.example/objects/1',
    'https://social.example/objects/1#fragment'
  ]) {
    assert.throws(
      () => createActivityPubObjectBinding(root, { externalObjectId: badId, boundAt: T2 }),
      /HTTPS URL/
    );
  }
});
