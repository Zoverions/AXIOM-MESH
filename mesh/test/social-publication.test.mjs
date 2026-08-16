import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createSocialPublicationProjection,
  createSocialPublicationRetraction,
  createSupersedingSocialPublication,
  validateSocialPublicationProjection,
  validateSocialPublicationRetraction
} from '../src/lib/social-publication.mjs';

const ATTACHMENT_A = 'a'.repeat(64);
const ATTACHMENT_B = 'b'.repeat(64);

function publication(overrides = {}) {
  return {
    publication_id: 'publication:alpha',
    persona_id: 'persona:zov',
    content: {
      media_type: 'text/plain',
      text: 'Portable social state belongs to the actor, not the feed provider.'
    },
    attachment_digests: [ATTACHMENT_A, ATTACHMENT_B],
    audience: { mode: 'public' },
    discoverability: 'listed',
    attribution_mode: 'pseudonymous',
    authorship_mode: 'human-authored',
    created_at: '2026-08-16T16:20:00.000Z',
    supersedes_digest: null,
    ...overrides
  };
}

test('social publication projection is content-addressed and non-authorizing', () => {
  const projected = createSocialPublicationProjection(publication());

  assert.equal(projected.schema, 'axiom-social-publication-projection.v1');
  assert.match(projected.projection_digest, /^[a-f0-9]{64}$/);
  assert.equal(projected.authority_effect, 'none');
  assert.equal(projected.network_effect, 'none');
  assert.deepEqual(validateSocialPublicationProjection(projected), projected);
});

test('social publication digest is stable across input key order', () => {
  const first = createSocialPublicationProjection(publication());
  const second = createSocialPublicationProjection({
    supersedes_digest: null,
    created_at: '2026-08-16T16:20:00.000Z',
    authorship_mode: 'human-authored',
    attribution_mode: 'pseudonymous',
    discoverability: 'listed',
    audience: { mode: 'public' },
    attachment_digests: [ATTACHMENT_A, ATTACHMENT_B],
    content: {
      text: 'Portable social state belongs to the actor, not the feed provider.',
      media_type: 'text/plain'
    },
    persona_id: 'persona:zov',
    publication_id: 'publication:alpha'
  });

  assert.equal(second.projection_digest, first.projection_digest);
});

test('social publication fails closed on hidden actor, provider, and authority fields', () => {
  for (const extra of [
    { source_actor_id: 'actor:private' },
    { provider_secret: 'should-never-be-here' },
    { network_destination: 'https://example.invalid' },
    { authority_effect: 'publish' }
  ]) {
    assert.throws(
      () => createSocialPublicationProjection(publication(extra)),
      /unsupported field/i
    );
  }
});

test('circle audience requires one bounded circle id and other audiences cannot carry it', () => {
  const circle = createSocialPublicationProjection(publication({
    audience: { mode: 'circle', circle_id: 'circle:research' }
  }));
  assert.deepEqual(circle.audience, {
    mode: 'circle',
    circle_id: 'circle:research'
  });

  assert.throws(
    () => createSocialPublicationProjection(publication({
      audience: { mode: 'circle' }
    })),
    /circle_id/i
  );
  assert.throws(
    () => createSocialPublicationProjection(publication({
      audience: { mode: 'public', circle_id: 'circle:leak' }
    })),
    /only for circle audience/i
  );
});

test('attachment digests are bounded and cannot be duplicated', () => {
  assert.throws(
    () => createSocialPublicationProjection(publication({
      attachment_digests: [ATTACHMENT_A, ATTACHMENT_A]
    })),
    /duplicate digests/i
  );
  assert.throws(
    () => createSocialPublicationProjection(publication({
      attachment_digests: ['not-a-digest']
    })),
    /invalid format|64-64 characters/i
  );
});

test('edits append a new projection naming the exact prior digest', () => {
  const original = createSocialPublicationProjection(publication());
  const edited = createSupersedingSocialPublication(original, publication({
    publication_id: 'publication:alpha:revision:2',
    content: {
      media_type: 'text/plain',
      text: 'An edited publication is a new signed projection, never a silent rewrite.'
    },
    created_at: '2026-08-16T16:21:00.000Z'
  }));

  assert.equal(edited.supersedes_digest, original.projection_digest);
  assert.notEqual(edited.projection_digest, original.projection_digest);
  assert.equal(original.supersedes_digest, null);
});

test('supersession cannot silently change persona or point at another prior object', () => {
  const original = createSocialPublicationProjection(publication());

  assert.throws(
    () => createSupersedingSocialPublication(original, publication({
      publication_id: 'publication:alpha:revision:2',
      persona_id: 'persona:other',
      created_at: '2026-08-16T16:21:00.000Z'
    })),
    /persona cannot change/i
  );
  assert.throws(
    () => createSupersedingSocialPublication(original, publication({
      publication_id: 'publication:alpha:revision:2',
      created_at: '2026-08-16T16:21:00.000Z',
      supersedes_digest: 'f'.repeat(64)
    })),
    /exact previous projection digest/i
  );
});

test('supersession and retraction must occur after the prior projection', () => {
  const original = createSocialPublicationProjection(publication());

  assert.throws(
    () => createSupersedingSocialPublication(original, publication({
      publication_id: 'publication:alpha:revision:2',
      created_at: original.created_at
    })),
    /created after/i
  );
  assert.throws(
    () => createSocialPublicationRetraction(original, {
      reason_code: 'author-retracted',
      occurred_at: original.created_at
    }),
    /occur after/i
  );
});

test('retraction is append-only and makes no third-party deletion claim', () => {
  const original = createSocialPublicationProjection(publication());
  const retraction = createSocialPublicationRetraction(original, {
    reason_code: 'author-retracted',
    occurred_at: '2026-08-16T16:22:00.000Z'
  });

  assert.equal(retraction.schema, 'axiom-social-publication-transition.v1');
  assert.equal(retraction.action, 'retract');
  assert.equal(retraction.publication_digest, original.projection_digest);
  assert.equal(retraction.persona_id, original.persona_id);
  assert.equal(retraction.stop_serving_requested, true);
  assert.equal(retraction.third_party_deletion_claimed, false);
  assert.equal(retraction.authority_effect, 'none');
  assert.equal(retraction.network_effect, 'none');
  assert.deepEqual(validateSocialPublicationRetraction(retraction), retraction);
});

test('tampering with publication or retraction bytes invalidates the content address', () => {
  const original = createSocialPublicationProjection(publication());
  assert.throws(
    () => validateSocialPublicationProjection({
      ...original,
      content: {
        ...original.content,
        text: 'tampered'
      }
    }),
    /digest does not match/i
  );

  const retraction = createSocialPublicationRetraction(original, {
    reason_code: 'author-retracted',
    occurred_at: '2026-08-16T16:22:00.000Z'
  });
  assert.throws(
    () => validateSocialPublicationRetraction({
      ...retraction,
      reason_code: 'different-reason'
    }),
    /digest does not match/i
  );
});

test('authorship disclosure remains descriptive and never becomes authority', () => {
  for (const authorship_mode of [
    'human-authored',
    'machine-assisted',
    'machine-authored-delegated',
    'continuity-persona'
  ]) {
    const projected = createSocialPublicationProjection(publication({ authorship_mode }));
    assert.equal(projected.authorship_mode, authorship_mode);
    assert.equal(projected.authority_effect, 'none');
  }
});
