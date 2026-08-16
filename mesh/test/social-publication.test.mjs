import assert from 'node:assert/strict';
import test from 'node:test';

import { sha256 } from '../src/lib/canonical.mjs';
import { PUBLICATION_PERSONA_SCHEMA } from '../src/identity/actor-state.mjs';
import {
  createPublicPersonaProjection,
  createSocialPublicationProjection,
  createSocialPublicationRetraction,
  createSupersedingSocialPublication,
  validatePublicPersonaProjection,
  validateSocialPublicationPersonaBinding,
  validateSocialPublicationProjection,
  validateSocialPublicationRetraction
} from '../src/lib/social-publication.mjs';

const T0 = '2026-08-16T17:00:00.000Z';
const T1 = '2026-08-16T17:01:00.000Z';
const T2 = '2026-08-16T17:02:00.000Z';
const ATTACHMENT = 'a'.repeat(64);

function persona(overrides = {}) {
  return {
    schema: PUBLICATION_PERSONA_SCHEMA,
    persona_id: 'persona-zov',
    controller_actor_id: 'actor-private-zov',
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
    publication_id: 'publication-alpha',
    content: {
      media_type: 'text/plain',
      text: 'Portable social state belongs to the actor, not the feed provider.'
    },
    attachment_digests: [ATTACHMENT],
    audience: { mode: 'public' },
    discoverability: 'listed',
    authorship_mode: 'human-authored',
    created_at: T1,
    supersedes_digest: null,
    ...overrides
  };
}

test('pseudonymous public persona projection leaks no protected actor linkage', () => {
  const protectedPersona = persona();
  const projected = createPublicPersonaProjection(protectedPersona);
  assert.equal(projected.persona_id, 'persona-zov');
  assert.equal(projected.attribution_mode, 'pseudonymous');
  assert.equal(projected.public_actor_link, null);
  assert.equal(projected.authority_effect, 'none');
  assert.doesNotThrow(() => validatePublicPersonaProjection(projected));
  const serialized = JSON.stringify(projected);
  assert.equal(serialized.includes(protectedPersona.controller_actor_id), false);
  assert.equal(serialized.includes('selective_link_commitment'), false);
  assert.equal(serialized.includes('delegation_authority_digest'), false);
});

test('selective attribution keeps private linkage commitment out of public bytes', () => {
  const commitment = sha256('private actor/persona linkage');
  const protectedPersona = persona({
    attribution_mode: 'selectively-attributable',
    selective_link_commitment: commitment
  });
  const projected = createPublicPersonaProjection(protectedPersona);
  assert.equal(projected.public_actor_link, null);
  assert.equal(JSON.stringify(projected).includes(commitment), false);
});

test('organization delegation exposes represented actor but not controller or authority proof', () => {
  const authority = sha256('bounded organization publication delegation');
  const protectedPersona = persona({
    persona_id: 'persona-axiom-spokesperson',
    represented_actor_id: 'organization-axiom',
    attribution_mode: 'organization-delegated',
    public_actor_link: 'organization-axiom',
    delegation_authority_digest: authority
  });
  const projected = createPublicPersonaProjection(protectedPersona);
  assert.equal(projected.public_actor_link, 'organization-axiom');
  const serialized = JSON.stringify(projected);
  assert.equal(serialized.includes('actor-private-zov'), false);
  assert.equal(serialized.includes(authority), false);
});

test('publication creation requires a protected actor-owned persona', () => {
  assert.throws(
    () => createSocialPublicationProjection(publication()),
    /requires a protected actor-owned persona/
  );
});

test('actor-bound publication carries only public persona binding and no authority', () => {
  const protectedPersona = persona();
  const personaProjection = createPublicPersonaProjection(protectedPersona);
  const projected = createSocialPublicationProjection(publication(), { persona: protectedPersona });
  assert.equal(projected.persona_id, personaProjection.persona_id);
  assert.equal(projected.persona_projection_digest, personaProjection.projection_digest);
  assert.equal(projected.attribution_mode, 'pseudonymous');
  assert.equal(projected.public_actor_link, null);
  assert.equal(projected.authority_effect, 'none');
  assert.equal(projected.network_effect, 'none');
  assert.doesNotThrow(() => validateSocialPublicationProjection(projected));
  assert.doesNotThrow(() => validateSocialPublicationPersonaBinding(projected, protectedPersona));
  assert.equal(JSON.stringify(projected).includes(protectedPersona.controller_actor_id), false);
});

test('caller cannot substitute persona id, attribution, public link, or persona digest', () => {
  const protectedPersona = persona();
  for (const override of [
    { persona_id: 'persona-other' },
    { attribution_mode: 'anonymous' },
    { public_actor_link: 'actor-other' },
    { persona_projection_digest: 'f'.repeat(64) }
  ]) {
    assert.throws(
      () => createSocialPublicationProjection(publication(override), { persona: protectedPersona }),
      /does not match the protected persona/
    );
  }
});

test('hidden private or provider fields fail closed', () => {
  const protectedPersona = persona();
  for (const override of [
    { controller_actor_id: 'actor-private-zov' },
    { selective_link_commitment: sha256('leak') },
    { delegation_authority_digest: sha256('leak') },
    { provider_secret: 'secret' },
    { network_destination: 'https://example.invalid' },
    { authority_effect: 'publish' }
  ]) {
    assert.throws(
      () => createSocialPublicationProjection(publication(override), { persona: protectedPersona }),
      /unsupported field/i
    );
  }
});

test('publication digest remains stable across input key order', () => {
  const protectedPersona = persona();
  const first = createSocialPublicationProjection(publication(), { persona: protectedPersona });
  const second = createSocialPublicationProjection({
    supersedes_digest: null,
    created_at: T1,
    authorship_mode: 'human-authored',
    discoverability: 'listed',
    audience: { mode: 'public' },
    attachment_digests: [ATTACHMENT],
    content: {
      text: 'Portable social state belongs to the actor, not the feed provider.',
      media_type: 'text/plain'
    },
    publication_id: 'publication-alpha'
  }, { persona: protectedPersona });
  assert.equal(second.projection_digest, first.projection_digest);
});

test('edits bind the exact prior publication and exact same public persona projection', () => {
  const protectedPersona = persona();
  const original = createSocialPublicationProjection(publication(), { persona: protectedPersona });
  const edited = createSupersedingSocialPublication(original, publication({
    publication_id: 'publication-alpha-r2',
    content: { media_type: 'text/plain', text: 'Revision two.' },
    created_at: T2,
    supersedes_digest: undefined
  }), { persona: protectedPersona });
  assert.equal(edited.supersedes_digest, original.projection_digest);
  assert.equal(edited.persona_projection_digest, original.persona_projection_digest);
  assert.notEqual(edited.projection_digest, original.projection_digest);

  const identityRevealed = persona({
    attribution_mode: 'public-identifiable',
    public_actor_link: 'actor-private-zov'
  });
  assert.throws(
    () => createSupersedingSocialPublication(original, publication({
      publication_id: 'publication-alpha-r3',
      created_at: T2
    }), { persona: identityRevealed }),
    /persona projection cannot change/
  );
});

test('retired or revoked persona cannot create or edit a publication', () => {
  const retired = persona({ status: 'retired' });
  assert.throws(
    () => createSocialPublicationProjection(publication(), { persona: retired }),
    /requires an active publication persona/
  );
});

test('retraction remains append-only and makes no third-party deletion claim', () => {
  const protectedPersona = persona();
  const original = createSocialPublicationProjection(publication(), { persona: protectedPersona });
  const retraction = createSocialPublicationRetraction(original, {
    reason_code: 'author-retracted',
    occurred_at: T2
  });
  assert.equal(retraction.publication_digest, original.projection_digest);
  assert.equal(retraction.persona_projection_digest, original.persona_projection_digest);
  assert.equal(retraction.stop_serving_requested, true);
  assert.equal(retraction.third_party_deletion_claimed, false);
  assert.equal(retraction.authority_effect, 'none');
  assert.equal(retraction.network_effect, 'none');
  assert.doesNotThrow(() => validateSocialPublicationRetraction(retraction));
});

test('tampering with public persona or publication bytes invalidates content addresses', () => {
  const protectedPersona = persona();
  const personaProjection = createPublicPersonaProjection(protectedPersona);
  assert.throws(
    () => validatePublicPersonaProjection({ ...personaProjection, status: 'retired' }),
    /digest does not match/
  );
  const projected = createSocialPublicationProjection(publication(), { persona: protectedPersona });
  assert.throws(
    () => validateSocialPublicationProjection({
      ...projected,
      content: { ...projected.content, text: 'tampered' }
    }),
    /digest does not match/
  );
});
