import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const contractUrl = new URL('../config/social-activitypub-content-audience.v0.json', import.meta.url);

async function loadContract() {
  return JSON.parse(await readFile(contractUrl, 'utf8'));
}

test('ActivityPub content/audience projection contract stays inert', async () => {
  const contract = await loadContract();
  assert.equal(contract.schema, 'axiom-social-activitypub-content-audience.v0');
  assert.equal(contract.version, 0);
  assert.equal(contract.status, 'inert-projection-contract');
  assert.equal(contract.runtime_activation, false);
  assert.equal(contract.authority_effect, 'none');
  assert.equal(contract.network_effect, 'none');
});

test('public listed and unlisted visibility map to distinct ActivityPub Public addressing', async () => {
  const contract = await loadContract();
  assert.deepEqual(contract.audience.public_listed, {
    axiom_audience_mode: 'public',
    axiom_discoverability: 'listed',
    activitypub_public_collection: 'to',
    mapping_status: 'exact-enough-for-projection'
  });
  assert.deepEqual(contract.audience.public_unlisted, {
    axiom_audience_mode: 'public',
    axiom_discoverability: 'unlisted',
    activitypub_public_collection: 'cc',
    mapping_status: 'exact-enough-for-projection'
  });
});

test('followers-only requires live follow state while Circle audience fails closed', async () => {
  const contract = await loadContract();
  assert.equal(contract.audience.followers.activitypub_followers_collection_required, true);
  assert.equal(contract.audience.followers.activitypub_public_collection_present, false);
  assert.equal(contract.audience.followers.mapping_status, 'specified-requires-live-follow-state');
  assert.equal(contract.audience.circle.mapping_status, 'prohibited-v0');
  assert.equal(
    contract.audience.circle.reason,
    'no-exact-activitypub-circle-membership-disclosure-mapping'
  );
  assert.equal(contract.audience.direct_or_limited.mapping_status, 'unsupported-v0');
});

test('outbound content rendering cannot mutate source meaning or invent social addressing', async () => {
  const contract = await loadContract();
  assert.deepEqual(contract.content.axiom_media_types, ['text/plain', 'text/markdown']);
  assert.equal(contract.content.activitypub_status_content_form, 'sanitized-html');
  assert.equal(contract.content.outbound_renderer_required, true);
  assert.equal(contract.content.renderer_must_preserve_source_digest, true);
  assert.equal(contract.content.renderer_output_is_canonical_source, false);
  assert.equal(contract.content.renderer_may_invent_links_mentions_or_hashtags, false);
  assert.equal(contract.content.renderer_may_claim_author_exact_html, false);
});

test('attachments and replies stay blocked until their AXIOM projections are explicit', async () => {
  const contract = await loadContract();
  assert.equal(contract.attachments.axiom_current_publication_representation, 'digest-only');
  assert.equal(contract.attachments.activitypub_requires_public_media_projection, true);
  assert.equal(contract.attachments.digest_alone_may_be_exported_as_attachment_url, false);
  assert.equal(contract.attachments.mapping_status, 'blocked-pending-public-media-contract');
  assert.equal(contract.replies.axiom_current_publication_field_present, false);
  assert.equal(contract.replies.mapping_status, 'unsupported-v0');
});

test('user-local sensitivity transformations cannot masquerade as author-declared Mastodon sensitivity', async () => {
  const contract = await loadContract();
  assert.equal(contract.sensitivity.mastodon_sensitive_property_supported, true);
  assert.equal(contract.sensitivity.user_local_presentation_preference_is_author_sensitive_flag, false);
  assert.equal(contract.sensitivity.user_local_softening_may_be_federated, false);
  assert.equal(contract.sensitivity.author_declared_content_warning_model_present, false);
  assert.equal(
    contract.sensitivity.mapping_status,
    'blocked-pending-author-declared-content-warning-contract'
  );
});

test('remote Mastodon HTML is display material, not reconstructed canonical author source', async () => {
  const contract = await loadContract();
  assert.equal(contract.remote_html.must_be_treated_as_remote_rendered_content, true);
  assert.equal(contract.remote_html.must_not_be_treated_as_canonical_plain_text, true);
  assert.equal(contract.remote_html.sanitization_required_before_local_render, true);
  assert.equal(contract.remote_html.local_reconstruction_of_author_original_markup_claimed, false);
});
