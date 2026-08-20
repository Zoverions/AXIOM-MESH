import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  mastodonAccountObservationBoundary,
  normalizeMastodonInstanceOrigin,
  validateMastodonAccountConnectorContract,
  validateMastodonRequestedScopes
} from '../../packages/axiom-social-activitypub-contract/mastodon-account-connector.mjs';

const contractUrl = new URL('../config/social-mastodon-account-connector.v0.json', import.meta.url);

async function contract() {
  return JSON.parse(await readFile(contractUrl, 'utf8'));
}

function clone(value) {
  return structuredClone(value);
}

test('existing-account Mastodon connector is inert, read-only, and distinct from federation identity hosting', async () => {
  const value = await contract();
  assert.equal(validateMastodonAccountConnectorContract(value), true);
  assert.equal(value.runtime_activation, false);
  assert.equal(value.connector_mode, 'existing-account-oauth');
  assert.equal(value.canonical_social_model, 'axiom-social');
  assert.equal(value.activitypub_identity_hosting, false);
  assert.equal(value.federation_effect, 'none');
  assert.equal(value.network_effect, 'none');
  assert.equal(value.authority_effect, 'none');
  assert.equal(value.initial_phase.mode, 'read-only');
});

test('Mastodon OAuth contract requires PKCE S256, state, confidential-secret custody, and no browser token persistence', async () => {
  const value = await contract();
  assert.equal(value.oauth.flow, 'authorization-code');
  assert.equal(value.oauth.pkce_required, true);
  assert.equal(value.oauth.pkce_method, 'S256');
  assert.equal(value.oauth.state_required, true);
  assert.equal(value.oauth.current_mastodon_client_type, 'confidential');
  assert.equal(value.oauth.client_secret_required_by_current_mastodon, true);
  assert.equal(value.oauth.browser_token_persistence, false);
  assert.equal(value.oauth.browser_client_secret_persistence, false);
  assert.equal(value.oauth.authorization_code_loggable, false);
  assert.equal(value.oauth.access_token_loggable, false);
  assert.match(value.oauth.client_secret_custody, /encrypted-node-secret-store/);
  assert.match(value.oauth.access_token_custody, /encrypted-node-secret-store/);
});

test('Mastodon instance binding requires exact credential-free HTTPS origin', () => {
  assert.equal(normalizeMastodonInstanceOrigin('https://social.example'), 'https://social.example');
  assert.throws(() => normalizeMastodonInstanceOrigin('http://social.example'), /HTTPS origin/);
  assert.throws(() => normalizeMastodonInstanceOrigin('https://user:secret@social.example'), /HTTPS origin/);
  assert.throws(() => normalizeMastodonInstanceOrigin('https://social.example/path'), /HTTPS origin/);
  assert.throws(() => normalizeMastodonInstanceOrigin('https://social.example?next=evil'), /HTTPS origin/);
});

test('initial connector phase accepts only exact granular read scopes', async () => {
  const value = await contract();
  assert.deepEqual(
    validateMastodonRequestedScopes(value, ['profile', 'read:statuses']),
    ['profile', 'read:statuses']
  );
  for (const scopes of [
    ['read'],
    ['write'],
    ['follow'],
    ['admin:read'],
    ['write:statuses'],
    ['profile', 'read:statuses', 'read:notifications']
  ]) {
    assert.throws(
      () => validateMastodonRequestedScopes(value, scopes),
      /outside the read-only connector phase|invalid/
    );
  }
});

test('Mastodon OAuth delegation cannot become AXIOM, Circle, identity, truth, or completeness authority', async () => {
  const value = await contract();
  for (const key of Object.keys(value.delegation_boundaries)) {
    const tampered = clone(value);
    tampered.delegation_boundaries[key] = true;
    assert.throws(
      () => validateMastodonAccountConnectorContract(tampered),
      /laundered into AXIOM authority or truth/
    );
  }
  assert.deepEqual(mastodonAccountObservationBoundary(value), {
    remote_results_enter_as_observations: true,
    identity_proof: false,
    authorship_proof: false,
    content_truth_proof: false,
    complete_network_view: false,
    authority_effect: 'none'
  });
});

test('Mastodon connector cannot export Circle-private, protected actor/persona, feed-diversity, or presentation-preference state', async () => {
  const value = await contract();
  for (const key of [
    'circle_private_data_export_allowed',
    'private_axiom_actor_state_export_allowed',
    'protected_persona_state_export_allowed',
    'feed_diversity_preferences_export_allowed',
    'local_presentation_preferences_export_allowed'
  ]) {
    const tampered = clone(value);
    tampered.data_boundaries[key] = true;
    assert.throws(() => validateMastodonAccountConnectorContract(tampered), /data boundary is weakened/);
  }
});

test('write capabilities remain disabled and require a separate granular authorization phase', async () => {
  const value = await contract();
  assert.equal(value.initial_phase.write_scopes_allowed, false);
  assert.equal(value.initial_phase.posting, false);
  assert.equal(value.initial_phase.following, false);
  assert.equal(value.initial_phase.blocking, false);
  assert.equal(value.initial_phase.reporting, false);
  assert.equal(value.future_write_phase.enabled, false);
  assert.equal(value.future_write_phase.requires_separate_user_authorization, true);
  assert.equal(value.future_write_phase.requires_per_action_mesh_egress_authorization, true);
  assert.equal(value.future_write_phase.requires_append_only_delivery_receipt, true);
  assert.equal(value.future_write_phase.broad_write_scope_allowed, false);
});

test('disconnect revokes/removes secrets without rewriting history or claiming remote deletion', async () => {
  const value = await contract();
  assert.deepEqual(value.disconnect, {
    oauth_revocation_required_when_available: true,
    local_secret_removal_required: true,
    historical_receipts_rewritten: false,
    remote_deletion_claimed: false
  });
});
