const ALLOWED_READ_SCOPES = new Set(['profile', 'read:statuses']);
const WRITE_SCOPE_PREFIX = 'write:';
const ADMIN_SCOPE_PREFIX = 'admin:';

export function validateMastodonAccountConnectorContract(contract) {
  exactObject(contract, 'Mastodon account connector contract', [
    'schema',
    'version',
    'status',
    'runtime_activation',
    'connector_mode',
    'canonical_social_model',
    'activitypub_identity_hosting',
    'federation_effect',
    'authority_effect',
    'network_effect',
    'instance_binding',
    'oauth',
    'initial_phase',
    'delegation_boundaries',
    'data_boundaries',
    'future_write_phase',
    'disconnect'
  ]);
  if (
    contract.schema !== 'axiom-social-mastodon-account-connector.v0'
    || contract.version !== 0
    || contract.status !== 'inert-existing-account-connector-contract'
    || contract.runtime_activation !== false
    || contract.connector_mode !== 'existing-account-oauth'
    || contract.canonical_social_model !== 'axiom-social'
    || contract.activitypub_identity_hosting !== false
    || contract.federation_effect !== 'none'
    || contract.authority_effect !== 'none'
    || contract.network_effect !== 'none'
  ) throw new Error('Mastodon account connector activation boundary is invalid');

  validateInstanceBinding(contract.instance_binding);
  validateOAuth(contract.oauth);
  validateInitialPhase(contract.initial_phase);
  validateDelegationBoundaries(contract.delegation_boundaries);
  validateDataBoundaries(contract.data_boundaries);
  validateFutureWritePhase(contract.future_write_phase);
  validateDisconnect(contract.disconnect);
  return true;
}

export function normalizeMastodonInstanceOrigin(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error('Mastodon instance origin is invalid');
  }
  if (
    url.protocol !== 'https:'
    || url.username
    || url.password
    || url.pathname !== '/'
    || url.search
    || url.hash
    || !url.hostname
  ) throw new Error('Mastodon instance must be a credential-free HTTPS origin');
  return url.origin;
}

export function validateMastodonRequestedScopes(contract, requestedScopes) {
  validateMastodonAccountConnectorContract(contract);
  if (!Array.isArray(requestedScopes) || requestedScopes.length === 0) {
    throw new Error('Mastodon requested scopes are invalid');
  }
  const requested = new Set(requestedScopes);
  if (requested.size !== requestedScopes.length) {
    throw new Error('Mastodon requested scopes cannot contain duplicates');
  }
  for (const scope of requested) {
    if (typeof scope !== 'string' || !ALLOWED_READ_SCOPES.has(scope)) {
      throw new Error(`Mastodon scope ${scope} is outside the read-only connector phase`);
    }
  }
  const registered = new Set(contract.initial_phase.registered_scopes);
  if ([...requested].some(scope => !registered.has(scope))) {
    throw new Error('Mastodon requested scopes exceed registered scopes');
  }
  return Object.freeze([...requestedScopes]);
}

export function mastodonAccountObservationBoundary(contract) {
  validateMastodonAccountConnectorContract(contract);
  return Object.freeze({
    remote_results_enter_as_observations: true,
    identity_proof: false,
    authorship_proof: false,
    content_truth_proof: false,
    complete_network_view: false,
    authority_effect: 'none'
  });
}

function validateInstanceBinding(value) {
  exactObject(value, 'Mastodon instance binding', [
    'user_selected_instance_required',
    'https_required',
    'wildcard_instance_allowed',
    'origin_substitution_allowed',
    'authorization_server_metadata_discovery'
  ]);
  if (
    value.user_selected_instance_required !== true
    || value.https_required !== true
    || value.wildcard_instance_allowed !== false
    || value.origin_substitution_allowed !== false
    || value.authorization_server_metadata_discovery !== 'preferred-when-supported'
  ) throw new Error('Mastodon instance binding is weakened');
}

function validateOAuth(value) {
  exactObject(value, 'Mastodon OAuth boundary', [
    'flow',
    'pkce_required',
    'pkce_method',
    'state_required',
    'current_mastodon_client_type',
    'client_secret_required_by_current_mastodon',
    'authorization_code_loggable',
    'access_token_loggable',
    'browser_token_persistence',
    'browser_client_secret_persistence',
    'client_secret_custody',
    'access_token_custody',
    'revocation_supported'
  ]);
  if (
    value.flow !== 'authorization-code'
    || value.pkce_required !== true
    || value.pkce_method !== 'S256'
    || value.state_required !== true
    || value.current_mastodon_client_type !== 'confidential'
    || value.client_secret_required_by_current_mastodon !== true
    || value.authorization_code_loggable !== false
    || value.access_token_loggable !== false
    || value.browser_token_persistence !== false
    || value.browser_client_secret_persistence !== false
    || value.client_secret_custody !== 'encrypted-node-secret-store-required-before-runtime'
    || value.access_token_custody !== 'encrypted-node-secret-store-required-before-runtime'
    || value.revocation_supported !== true
  ) throw new Error('Mastodon OAuth boundary is weakened');
}

function validateInitialPhase(value) {
  exactObject(value, 'Mastodon initial connector phase', [
    'mode',
    'registered_scopes',
    'requested_scopes',
    'write_scopes_allowed',
    'admin_scopes_allowed',
    'deprecated_follow_scope_allowed',
    'home_timeline_read',
    'current_account_profile_read',
    'notifications_read',
    'relationship_graph_read',
    'posting',
    'deleting',
    'favouriting',
    'boosting',
    'following',
    'blocking',
    'reporting'
  ]);
  if (
    value.mode !== 'read-only'
    || value.write_scopes_allowed !== false
    || value.admin_scopes_allowed !== false
    || value.deprecated_follow_scope_allowed !== false
    || value.home_timeline_read !== true
    || value.current_account_profile_read !== true
    || value.notifications_read !== false
    || value.relationship_graph_read !== false
    || value.posting !== false
    || value.deleting !== false
    || value.favouriting !== false
    || value.boosting !== false
    || value.following !== false
    || value.blocking !== false
    || value.reporting !== false
  ) throw new Error('Mastodon initial connector phase is not read-only');
  validateExactReadScopes(value.registered_scopes, 'registered');
  validateExactReadScopes(value.requested_scopes, 'requested');
}

function validateExactReadScopes(scopes, label) {
  if (!Array.isArray(scopes) || scopes.length !== ALLOWED_READ_SCOPES.size) {
    throw new Error(`Mastodon ${label} scope inventory is invalid`);
  }
  const unique = new Set(scopes);
  if (
    unique.size !== ALLOWED_READ_SCOPES.size
    || [...ALLOWED_READ_SCOPES].some(scope => !unique.has(scope))
    || scopes.some(scope => scope.startsWith(WRITE_SCOPE_PREFIX) || scope.startsWith(ADMIN_SCOPE_PREFIX))
  ) throw new Error(`Mastodon ${label} scope inventory exceeds read-only access`);
}

function validateDelegationBoundaries(value) {
  exactObject(value, 'Mastodon delegation boundaries', [
    'oauth_token_is_axiom_authority',
    'oauth_token_is_circle_authority',
    'mastodon_account_is_legal_identity_proof',
    'mastodon_account_is_axiom_actor_identity_proof',
    'remote_profile_is_content_truth_proof',
    'remote_timeline_is_complete_network_view',
    'remote_instance_policy_becomes_local_policy'
  ]);
  if (Object.values(value).some(flag => flag !== false)) {
    throw new Error('Mastodon OAuth delegation is being laundered into AXIOM authority or truth');
  }
}

function validateDataBoundaries(value) {
  exactObject(value, 'Mastodon data boundaries', [
    'circle_private_data_export_allowed',
    'private_axiom_actor_state_export_allowed',
    'protected_persona_state_export_allowed',
    'feed_diversity_preferences_export_allowed',
    'local_presentation_preferences_export_allowed',
    'remote_results_enter_as_observations'
  ]);
  if (
    value.circle_private_data_export_allowed !== false
    || value.private_axiom_actor_state_export_allowed !== false
    || value.protected_persona_state_export_allowed !== false
    || value.feed_diversity_preferences_export_allowed !== false
    || value.local_presentation_preferences_export_allowed !== false
    || value.remote_results_enter_as_observations !== true
  ) throw new Error('Mastodon connector data boundary is weakened');
}

function validateFutureWritePhase(value) {
  exactObject(value, 'Mastodon future write phase', [
    'enabled',
    'requires_separate_user_authorization',
    'requires_granular_scope_upgrade',
    'requires_per_action_mesh_egress_authorization',
    'requires_append_only_delivery_receipt',
    'write_statuses_scope',
    'write_media_scope',
    'write_follows_scope',
    'write_blocks_scope',
    'write_reports_scope',
    'broad_write_scope_allowed'
  ]);
  if (
    value.enabled !== false
    || value.requires_separate_user_authorization !== true
    || value.requires_granular_scope_upgrade !== true
    || value.requires_per_action_mesh_egress_authorization !== true
    || value.requires_append_only_delivery_receipt !== true
    || value.write_statuses_scope !== 'write:statuses'
    || value.write_media_scope !== 'write:media'
    || value.write_follows_scope !== 'write:follows'
    || value.write_blocks_scope !== 'write:blocks'
    || value.write_reports_scope !== 'write:reports'
    || value.broad_write_scope_allowed !== false
  ) throw new Error('Mastodon future write phase is insufficiently bounded');
}

function validateDisconnect(value) {
  exactObject(value, 'Mastodon disconnect semantics', [
    'oauth_revocation_required_when_available',
    'local_secret_removal_required',
    'historical_receipts_rewritten',
    'remote_deletion_claimed'
  ]);
  if (
    value.oauth_revocation_required_when_available !== true
    || value.local_secret_removal_required !== true
    || value.historical_receipts_rewritten !== false
    || value.remote_deletion_claimed !== false
  ) throw new Error('Mastodon disconnect semantics are invalid');
}

function exactObject(value, label, keys) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    throw new Error(`${label} fields are invalid`);
  }
}
