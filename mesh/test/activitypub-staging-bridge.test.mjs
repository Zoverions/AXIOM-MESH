import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  planActivityPubNormalization,
  validateActivityPubStagingBridgeContract
} from '../../packages/axiom-social-activitypub-contract/staging-bridge.mjs';

const contractUrl = new URL('../config/social-activitypub-staging-bridge.v0.json', import.meta.url);

async function loadContract() {
  return JSON.parse(await readFile(contractUrl, 'utf8'));
}

test('ActivityPub staging bridge is inert and refuses direct AXIOM native transport reuse', async () => {
  const contract = await loadContract();
  assert.equal(validateActivityPubStagingBridgeContract(contract), true);
  assert.equal(contract.runtime_activation, false);
  assert.equal(contract.network_effect, 'none');
  assert.equal(contract.authority_effect, 'none');
  assert.equal(contract.existing_axiom_transport.direct_reuse, false);
  assert.equal(contract.existing_axiom_transport.reason, 'trust-model-mismatch');
  assert.equal(contract.existing_axiom_transport.requires_axiom_social_exchange_package, true);
  assert.equal(
    contract.existing_axiom_transport.requires_distinct_transport_and_exporter_trust_roots,
    true
  );
  assert.equal(
    contract.existing_axiom_transport.activitypub_signature_may_be_treated_as_axiom_exporter_attestation,
    false
  );
});

test('ActivityPub normalization can reuse review patterns but must use a distinct staging schema', async () => {
  const contract = await loadContract();
  validateActivityPubStagingBridgeContract(contract);
  assert.equal(contract.bridge.new_activitypub_staging_schema_required, true);
  assert.equal(contract.bridge.owner_scoped_review_pattern_reusable, true);
  assert.equal(contract.bridge.explicit_admission_pattern_reusable, true);
  assert.equal(contract.bridge.retention_pattern_reusable_after_normalization, true);
  assert.equal(contract.bridge.abuse_control_pattern_reusable_after_normalization, true);
  assert.equal(contract.bridge.must_not_forge_exporter_grid_id, true);
  assert.equal(contract.bridge.must_not_relabel_remote_actor_as_axiom_grid_exporter, true);
  assert.equal(contract.bridge.must_not_bypass_operator_review, true);
});

test('ActivityPub verification requirements are explicit before a normalized candidate can exist', async () => {
  const contract = await loadContract();
  validateActivityPubStagingBridgeContract(contract);
  assert.equal(contract.verification.webfinger_binding_required_for_mastodon_actor_discovery, true);
  assert.equal(contract.verification.activitypub_actor_key_binding_required, true);
  assert.equal(contract.verification.federation_request_authentication_required, true);
  assert.equal(contract.verification.ssrf_safe_dereferencing_required, true);
  assert.equal(contract.verification.canonical_remote_object_digest_required, true);
  assert.equal(contract.verification.replay_or_idempotency_control_required, true);
  assert.equal(contract.verification.transport_authentication_is_content_truth_proof, false);
  assert.equal(contract.verification.transport_authentication_is_legal_identity_proof, false);
  assert.equal(contract.verification.local_adapter_attestation_is_remote_authorship_proof, false);
});

test('normalization plan is observation-only and still requires explicit local admission', async () => {
  const contract = await loadContract();
  const plan = planActivityPubNormalization(contract, {
    remoteActorId: 'https://mastodon.example/users/alice',
    remoteObjectDigest: 'a'.repeat(64),
    recipientPrincipal: 'human.owner'
  });
  assert.equal(plan.schema, 'axiom-social-activitypub-normalization-plan.v0');
  assert.equal(plan.status, 'review-required');
  assert.equal(plan.direct_axiom_transport_reuse, false);
  assert.equal(plan.new_activitypub_staging_schema_required, true);
  assert.equal(plan.requires_activitypub_verification, true);
  assert.equal(plan.requires_explicit_local_admission, true);
  assert.equal(plan.remote_observation_only, true);
  assert.equal(plan.local_authorship_claimed, false);
  assert.equal(plan.content_truth_claimed, false);
  assert.equal(plan.legal_identity_claimed, false);
  assert.equal(plan.authority_effect, 'none');
  assert.equal(plan.network_effect, 'none');
});

test('normalization cannot fabricate remote Grid identity, truth, authorship, or admission', async () => {
  const contract = await loadContract();
  validateActivityPubStagingBridgeContract(contract);
  assert.deepEqual(contract.non_claims, {
    activitypub_is_axiom_native_transport: false,
    mastodon_instance_is_axiom_trust_root: false,
    remote_actor_is_axiom_grid: false,
    verified_delivery_is_authorship: false,
    verified_delivery_is_truth: false,
    normalization_is_admission: false
  });
  assert.equal(contract.normalized_candidate.remote_observation_only, true);
  assert.equal(contract.normalized_candidate.local_authorship_claimed, false);
  assert.equal(contract.normalized_candidate.content_truth_claimed, false);
  assert.equal(contract.normalized_candidate.legal_identity_claimed, false);
  assert.equal(contract.normalized_candidate.circle_authority_claimed, false);
  assert.equal(contract.normalized_candidate.execution_authority_claimed, false);
  assert.equal(contract.normalized_candidate.requires_explicit_local_admission, true);
});

test('normalization planner fails closed on malformed actor, digest, or recipient identifiers', async () => {
  const contract = await loadContract();
  assert.throws(
    () => planActivityPubNormalization(contract, {
      remoteActorId: '',
      remoteObjectDigest: 'a'.repeat(64),
      recipientPrincipal: 'human.owner'
    }),
    /remote actor id is invalid/
  );
  assert.throws(
    () => planActivityPubNormalization(contract, {
      remoteActorId: 'https://mastodon.example/users/alice',
      remoteObjectDigest: 'not-a-digest',
      recipientPrincipal: 'human.owner'
    }),
    /remote object digest is invalid/
  );
  assert.throws(
    () => planActivityPubNormalization(contract, {
      remoteActorId: 'https://mastodon.example/users/alice',
      remoteObjectDigest: 'a'.repeat(64),
      recipientPrincipal: 'bad principal with spaces'
    }),
    /recipient principal is invalid/
  );
});
