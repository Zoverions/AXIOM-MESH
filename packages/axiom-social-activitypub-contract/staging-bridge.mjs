export function validateActivityPubStagingBridgeContract(contract) {
  exactObject(contract, 'ActivityPub staging bridge contract', [
    'schema',
    'version',
    'status',
    'runtime_activation',
    'authority_effect',
    'network_effect',
    'existing_axiom_transport',
    'bridge',
    'verification',
    'normalized_candidate',
    'non_claims'
  ]);

  if (
    contract.schema !== 'axiom-social-activitypub-staging-bridge.v0'
    || contract.version !== 0
    || contract.status !== 'inert-normalization-contract'
    || contract.runtime_activation !== false
    || contract.authority_effect !== 'none'
    || contract.network_effect !== 'none'
  ) throw new Error('ActivityPub staging bridge activation boundary is invalid');

  validateExistingTransport(contract.existing_axiom_transport);
  validateBridge(contract.bridge);
  validateVerification(contract.verification);
  validateCandidate(contract.normalized_candidate);
  validateNonClaims(contract.non_claims);
  return true;
}

export function planActivityPubNormalization(contract, {
  remoteActorId,
  remoteObjectDigest,
  recipientPrincipal
}) {
  validateActivityPubStagingBridgeContract(contract);
  const actor = boundedString(remoteActorId, 'remote actor id', 1, 2048);
  const digest = boundedDigest(remoteObjectDigest, 'remote object digest');
  const recipient = boundedIdentifier(recipientPrincipal, 'recipient principal');

  return Object.freeze({
    schema: 'axiom-social-activitypub-normalization-plan.v0',
    status: 'review-required',
    remote_actor_id: actor,
    remote_object_digest: digest,
    recipient_principal: recipient,
    direct_axiom_transport_reuse: false,
    new_activitypub_staging_schema_required: true,
    requires_activitypub_verification: true,
    requires_explicit_local_admission: true,
    remote_observation_only: true,
    local_authorship_claimed: false,
    content_truth_claimed: false,
    legal_identity_claimed: false,
    authority_effect: 'none',
    network_effect: 'none'
  });
}

function validateExistingTransport(value) {
  exactObject(value, 'existing AXIOM transport boundary', [
    'direct_reuse',
    'reason',
    'requires_axiom_social_exchange_package',
    'requires_distinct_transport_and_exporter_trust_roots',
    'activitypub_signature_may_be_treated_as_axiom_exporter_attestation'
  ]);
  if (
    value.direct_reuse !== false
    || value.reason !== 'trust-model-mismatch'
    || value.requires_axiom_social_exchange_package !== true
    || value.requires_distinct_transport_and_exporter_trust_roots !== true
    || value.activitypub_signature_may_be_treated_as_axiom_exporter_attestation !== false
  ) throw new Error('ActivityPub bridge incorrectly reuses AXIOM native transport trust');
}

function validateBridge(value) {
  exactObject(value, 'ActivityPub normalization bridge', [
    'new_activitypub_staging_schema_required',
    'owner_scoped_review_pattern_reusable',
    'explicit_admission_pattern_reusable',
    'retention_pattern_reusable_after_normalization',
    'abuse_control_pattern_reusable_after_normalization',
    'must_not_forge_exporter_grid_id',
    'must_not_relabel_remote_actor_as_axiom_grid_exporter',
    'must_not_bypass_operator_review'
  ]);
  if (
    value.new_activitypub_staging_schema_required !== true
    || value.owner_scoped_review_pattern_reusable !== true
    || value.explicit_admission_pattern_reusable !== true
    || value.retention_pattern_reusable_after_normalization !== true
    || value.abuse_control_pattern_reusable_after_normalization !== true
    || value.must_not_forge_exporter_grid_id !== true
    || value.must_not_relabel_remote_actor_as_axiom_grid_exporter !== true
    || value.must_not_bypass_operator_review !== true
  ) throw new Error('ActivityPub normalization bridge weakens the remote-social review boundary');
}

function validateVerification(value) {
  exactObject(value, 'ActivityPub normalization verification', [
    'webfinger_binding_required_for_mastodon_actor_discovery',
    'activitypub_actor_key_binding_required',
    'federation_request_authentication_required',
    'ssrf_safe_dereferencing_required',
    'canonical_remote_object_digest_required',
    'replay_or_idempotency_control_required',
    'transport_authentication_is_content_truth_proof',
    'transport_authentication_is_legal_identity_proof',
    'local_adapter_attestation_is_remote_authorship_proof'
  ]);
  if (
    value.webfinger_binding_required_for_mastodon_actor_discovery !== true
    || value.activitypub_actor_key_binding_required !== true
    || value.federation_request_authentication_required !== true
    || value.ssrf_safe_dereferencing_required !== true
    || value.canonical_remote_object_digest_required !== true
    || value.replay_or_idempotency_control_required !== true
    || value.transport_authentication_is_content_truth_proof !== false
    || value.transport_authentication_is_legal_identity_proof !== false
    || value.local_adapter_attestation_is_remote_authorship_proof !== false
  ) throw new Error('ActivityPub verification claims too much or requires too little');
}

function validateCandidate(value) {
  exactObject(value, 'ActivityPub normalized candidate', [
    'remote_observation_only',
    'local_authorship_claimed',
    'content_truth_claimed',
    'legal_identity_claimed',
    'circle_authority_claimed',
    'execution_authority_claimed',
    'requires_explicit_local_admission',
    'authority_effect'
  ]);
  if (
    value.remote_observation_only !== true
    || value.local_authorship_claimed !== false
    || value.content_truth_claimed !== false
    || value.legal_identity_claimed !== false
    || value.circle_authority_claimed !== false
    || value.execution_authority_claimed !== false
    || value.requires_explicit_local_admission !== true
    || value.authority_effect !== 'none'
  ) throw new Error('ActivityPub normalized candidate exceeds observation-only scope');
}

function validateNonClaims(value) {
  exactObject(value, 'ActivityPub staging non-claims', [
    'activitypub_is_axiom_native_transport',
    'mastodon_instance_is_axiom_trust_root',
    'remote_actor_is_axiom_grid',
    'verified_delivery_is_authorship',
    'verified_delivery_is_truth',
    'normalization_is_admission'
  ]);
  if (Object.values(value).some(item => item !== false)) {
    throw new Error('ActivityPub staging non-claim was promoted to a claim');
  }
}

function boundedString(value, label, minimum, maximum) {
  if (typeof value !== 'string' || value.length < minimum || value.length > maximum) {
    throw new Error(`${label} is invalid`);
  }
  return value;
}

function boundedDigest(value, label) {
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value)) {
    throw new Error(`${label} is invalid`);
  }
  return value;
}

function boundedIdentifier(value, label) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/.test(value)) {
    throw new Error(`${label} is invalid`);
  }
  return value;
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
