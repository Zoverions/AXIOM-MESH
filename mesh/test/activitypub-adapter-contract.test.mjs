import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  activityPubBlockInterpretation,
  activityPubFlagInterpretation,
  inboundActivityPubMapping,
  outboundActivityPubMapping,
  validateActivityPubAdapterContract
} from '../../packages/axiom-social-activitypub-contract/index.mjs';

const contractUrl = new URL('../config/social-activitypub-adapter.v0.json', import.meta.url);

async function loadContract() {
  return JSON.parse(await readFile(contractUrl, 'utf8'));
}

test('ActivityPub adapter contract is inert and keeps AXIOM Social canonical', async () => {
  const contract = await loadContract();
  assert.equal(validateActivityPubAdapterContract(contract), true);
  assert.equal(contract.runtime_activation, false);
  assert.equal(contract.canonical_model, 'axiom-social');
  assert.equal(contract.network_effect, 'none');
  assert.equal(contract.transport_effect, 'none');
  assert.equal(contract.authority_effect, 'none');
  assert.equal(contract.protocol.webfinger_implemented, false);
  assert.equal(contract.protocol.inbox_implemented, false);
  assert.equal(contract.protocol.outbox_implemented, false);
  assert.equal(contract.protocol.http_signature_transport_implemented, false);
});

test('public AXIOM persona projection is the only ActivityPub identity source', async () => {
  const contract = await loadContract();
  validateActivityPubAdapterContract(contract);
  assert.equal(contract.identity.source_projection_schema, 'axiom-publication-persona-projection.v1');
  assert.equal(contract.identity.target_concept, 'activitypub-actor');
  assert.equal(contract.identity.protected_actor_state_exposed, false);
  assert.equal(contract.identity.legal_identity_proof_claimed, false);
  assert.equal(contract.identity.controller_identity_proof_claimed, false);
});

test('publication lifecycle maps outward without changing AXIOM append-only semantics', async () => {
  const contract = await loadContract();
  assert.deepEqual(
    outboundActivityPubMapping(contract, 'social.publication.create'),
    {
      axiom_semantic: 'social.publication.create',
      activitypub_activity: 'Create',
      activitypub_object: 'Note',
      requires_public_projection: true
    }
  );
  assert.equal(
    outboundActivityPubMapping(contract, 'social.publication.supersede').activitypub_activity,
    'Update'
  );
  assert.equal(
    outboundActivityPubMapping(contract, 'social.publication.retract').activitypub_activity,
    'Delete'
  );
  assert.equal(contract.third_party_deletion_guaranteed, false);
});

test('Circle curator exclusion can never be laundered into ActivityPub Block', async () => {
  const contract = await loadContract();
  assert.throws(
    () => outboundActivityPubMapping(contract, 'circle.curated-lens.exclude'),
    /prohibited from ActivityPub export/
  );
  const block = outboundActivityPubMapping(contract, 'personal.interaction.boundary');
  assert.equal(block.activitypub_activity, 'Block');
  assert.equal(block.activitypub_object, 'Actor');
});

test('ActivityPub Block is actor-pair scoped and cannot suppress third-party perspectives', async () => {
  const contract = await loadContract();
  const block = activityPubBlockInterpretation(contract);
  assert.equal(block.scope, 'actor-pair-only');
  assert.equal(block.personal_interaction_boundary, true);
  assert.equal(block.personal_visibility_effect_allowed, true);
  assert.equal(block.third_party_suppression, false);
  assert.equal(block.circle_wide_suppression, false);
  assert.equal(block.community_wide_suppression, false);
  assert.equal(block.spam_claimed, false);
  assert.equal(block.unsafe_claimed, false);
  assert.equal(block.truth_judgment_claimed, false);

  const inbound = inboundActivityPubMapping(contract, 'Block');
  assert.equal(inbound.axiom_semantic, 'personal.interaction.boundary.remote-observation');
  assert.equal(inbound.remote_observation_only, true);
  assert.equal(inbound.authorship_claimed, false);
  assert.equal(inbound.content_truth_claimed, false);
});

test('ActivityPub Flag remains a report assertion rather than adjudication', async () => {
  const contract = await loadContract();
  const flag = activityPubFlagInterpretation(contract);
  assert.equal(flag.report_assertion_only, true);
  assert.equal(flag.spam_truth_claimed, false);
  assert.equal(flag.content_falsity_claimed, false);
  assert.equal(flag.guilt_claimed, false);
  assert.equal(flag.universal_hiding_effect, false);

  const inbound = inboundActivityPubMapping(contract, 'Flag');
  assert.equal(inbound.axiom_semantic, 'content.report.remote-observation');
  assert.equal(inbound.remote_observation_only, true);
});

test('all inbound ActivityPub mappings remain remote observations with no truth or authorship promotion', async () => {
  const contract = await loadContract();
  validateActivityPubAdapterContract(contract);
  for (const mapping of contract.inbound_mappings) {
    const projected = inboundActivityPubMapping(contract, mapping.activitypub_activity);
    assert.equal(projected.remote_observation_only, true);
    assert.equal(projected.authorship_claimed, false);
    assert.equal(projected.content_truth_claimed, false);
  }
});

test('private Circle state, diversity settings, transformations and safety decisions fail closed at the ActivityPub boundary', async () => {
  const contract = await loadContract();
  for (const semantic of [
    'circle.member-private-publication',
    'circle.membership',
    'circle.charter',
    'circle.governance',
    'feed.diversity.preference',
    'feed.presentation.transform',
    'spam.assessment',
    'safety.quarantine'
  ]) {
    assert.throws(
      () => outboundActivityPubMapping(contract, semantic),
      /prohibited from ActivityPub export/
    );
  }
  assert.equal(contract.private_circle_federation, false);
  assert.equal(contract.recommendation_effect, 'none');
  assert.equal(contract.remote_instance_delivery_completeness_claimed, false);
});

test('unsupported ActivityPub and AXIOM semantics do not receive guessed mappings', async () => {
  const contract = await loadContract();
  assert.throws(
    () => inboundActivityPubMapping(contract, 'Move'),
    /Unsupported ActivityPub activity type/
  );
  assert.throws(
    () => outboundActivityPubMapping(contract, 'social.magic-federate'),
    /No exact ActivityPub mapping exists/
  );
});
