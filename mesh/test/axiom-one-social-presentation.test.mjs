import assert from 'node:assert/strict';
import test from 'node:test';

import {
  AXIOM_ONE_SOCIAL_PRESENTATION_SCHEMA,
  presentAxiomOneSocial
} from '../../packages/axiom-one-social-presentation/index.mjs';

const ACTOR_DIGEST = '1'.repeat(64);
const PERSONA_DIGEST = '2'.repeat(64);
const PUBLICATION_DIGEST = '3'.repeat(64);
const TRANSITION_DIGEST = '4'.repeat(64);

function localFixture() {
  return {
    schema: 'axiom-local-social-snapshot.v1',
    owner: 'human.owner',
    actors: [{
      actor_id: 'actor.owner',
      actor_state_digest: ACTOR_DIGEST,
      actor_state: {
        actor_id: 'actor.owner',
        private_recovery_metadata: 'must-not-leave-owner-view'
      },
      status: 'active',
      custody: 'owner-local'
    }],
    personas: [{
      persona_id: 'persona.owner',
      actor_id: 'actor.owner',
      protected_persona: {
        persona_id: 'persona.owner',
        controller_actor_id: 'actor.owner',
        selective_link_commitment: 'private-link'
      },
      public_projection: {
        schema: 'axiom-publication-persona-projection.v1',
        persona_id: 'persona.owner',
        projection_digest: PERSONA_DIGEST,
        attribution_mode: 'pseudonymous',
        display_name: 'Owner Persona'
      },
      status: 'active'
    }],
    corpus: {
      publications: [{
        projection_digest: PUBLICATION_DIGEST,
        actor_id: 'actor.owner',
        persona_id: 'persona.owner',
        publication: {
          schema: 'axiom-social-publication-projection.v1',
          publication_id: 'publication.one',
          persona_id: 'persona.owner',
          persona_projection_digest: PERSONA_DIGEST,
          content: { media_type: 'text/plain', text: 'Local corpus text' },
          created_at: '2026-08-20T16:00:00.000Z',
          supersedes_digest: null,
          projection_digest: PUBLICATION_DIGEST
        },
        status: 'active'
      }],
      transitions: [{
        transition_digest: TRANSITION_DIGEST,
        publication_digest: PUBLICATION_DIGEST,
        transition: {
          schema: 'axiom-social-publication-retraction.v1',
          transition_digest: TRANSITION_DIGEST,
          publication_digest: PUBLICATION_DIGEST,
          action: 'retract',
          occurred_at: '2026-08-20T17:00:00.000Z'
        }
      }],
      truncated: false
    },
    network_effect: 'none'
  };
}

function remoteFixture() {
  return {
    schema: 'axiom-remote-social-review.v1',
    owner: 'human.owner',
    activation_scope: 'local-read-only-review',
    stages: [],
    stages_truncated: false,
    admissions: [],
    admissions_truncated: false,
    observations: [{
      observation_id: 'observation.one',
      exporter_grid_id: 'grid.remote',
      exporter_key_id: 'key.remote',
      object_kind: 'publication',
      object_digest: '5'.repeat(64),
      first_admission_id: 'admission.one',
      observed_at: '2026-08-20T15:00:00.000Z',
      remote_observation_only: true,
      local_authorship_claimed: false,
      publication_id: 'remote.publication.one',
      persona_id: 'remote.persona.one',
      persona_projection_digest: '6'.repeat(64),
      attribution_mode: 'pseudonymous',
      public_actor_link: null,
      media_type: 'text/plain',
      text_preview: 'Remote observed text',
      discoverability: 'public',
      authorship_mode: 'human-authored',
      created_at: '2026-08-20T14:00:00.000Z',
      supersedes_digest: null,
      authority_effect: 'none'
    }],
    observations_truncated: false,
    follows: [{
      follow_id: 'follow.one',
      exporter_grid_id: 'grid.remote',
      exporter_key_id: 'key.remote',
      persona_projection_digest: '6'.repeat(64),
      persona_observation_id: 'observation.persona.one',
      owner_trust_label: 'reviewed-source',
      trust_scope: 'exporter-attestation-only',
      content_truth_claimed: false,
      legal_identity_claimed: false,
      actor_authorship_claimed: false,
      status: 'active',
      followed_at: '2026-08-20T15:10:00.000Z',
      unfollowed_at: null,
      private_local_preference: true,
      recommendation_effect: 'none',
      authority_effect: 'none'
    }],
    follows_truncated: false,
    retention: {
      policy: 'bounded-owner-local',
      within_policy: true,
      authority_effect: 'none'
    },
    retention_receipts: [],
    retention_receipts_truncated: false,
    exporter_attestation_is_identity_proof: false,
    exporter_attestation_is_content_truth_proof: false,
    local_admission_is_authorship_proof: false,
    transport_state_included: false,
    ranking_state_included: false,
    mutation_effect: 'none',
    network_effect: 'none',
    recommendation_effect: 'none',
    authority_effect: 'none',
    response_bytes: 4096
  };
}

function clone(value) {
  return structuredClone(value);
}

test('AXIOM One social presenter separates protected local state from public-safe corpus state', () => {
  const model = presentAxiomOneSocial({ local: localFixture() });
  assert.equal(model.schema, AXIOM_ONE_SOCIAL_PRESENTATION_SCHEMA);
  assert.equal(model.status, 'read-only-presentation-laboratory');
  assert.equal(model.local.actors[0].private_state_included, false);
  assert.equal(model.local.personas[0].protected_state_included, false);
  assert.equal('actor_state' in model.local.actors[0], false);
  assert.equal('protected_persona' in model.local.personas[0], false);
  assert.equal(model.local.corpus.publications[0].publication.content.text, 'Local corpus text');
  assert.equal(model.local.distribution_state, 'local-only');
  assert.equal(model.boundaries.local_saved_is_network_distributed, false);
  assert.equal(model.boundaries.network_effect, 'none');
});

test('AXIOM One social presenter keeps remote review observational and non-authorizing', () => {
  const model = presentAxiomOneSocial({
    local: localFixture(),
    remote: remoteFixture()
  });
  assert.equal(model.remote.available, true);
  assert.equal(model.remote.activation_scope, 'local-read-only-review');
  assert.equal(model.remote.observations[0].remote_observation_only, true);
  assert.equal(model.remote.observations[0].local_authorship_claimed, false);
  assert.equal(model.remote.follows[0].private_local_preference, true);
  assert.equal(model.remote.follows[0].trust_scope, 'exporter-attestation-only');
  assert.equal(model.remote.network_effect, 'none');
  assert.equal(model.remote.recommendation_effect, 'none');
  assert.equal(model.remote.authority_effect, 'none');
  assert.equal(model.boundaries.exporter_attestation_is_content_truth_proof, false);
  assert.equal(model.boundaries.remote_follow_is_public_graph, false);
});

test('AXIOM One social presenter fails closed on local network-effect or owner drift', () => {
  const localNetwork = localFixture();
  localNetwork.network_effect = 'publish';
  assert.throws(() => presentAxiomOneSocial({ local: localNetwork }), /network-effect free/);

  const remoteOwner = remoteFixture();
  remoteOwner.owner = 'human.other';
  assert.throws(
    () => presentAxiomOneSocial({ local: localFixture(), remote: remoteOwner }),
    /does not match local owner/
  );
});

test('AXIOM One social presenter rejects remote truth, authorship, ranking, and authority laundering', () => {
  for (const [field, value] of [
    ['exporter_attestation_is_identity_proof', true],
    ['exporter_attestation_is_content_truth_proof', true],
    ['local_admission_is_authorship_proof', true],
    ['transport_state_included', true],
    ['ranking_state_included', true],
    ['mutation_effect', 'admit'],
    ['network_effect', 'fetch'],
    ['recommendation_effect', 'rank'],
    ['authority_effect', 'grant']
  ]) {
    const remote = remoteFixture();
    remote[field] = value;
    assert.throws(
      () => presentAxiomOneSocial({ local: localFixture(), remote }),
      new RegExp(`weakened ${field}`)
    );
  }
});

test('AXIOM One social presenter rejects forbidden protected fields in public projections', () => {
  const local = localFixture();
  local.personas[0].public_projection.controller_actor_id = 'actor.owner';
  assert.throws(
    () => presentAxiomOneSocial({ local }),
    /forbidden field/
  );

  const remote = remoteFixture();
  remote.observations[0].ranking_score = 0.99;
  assert.throws(
    () => presentAxiomOneSocial({ local: localFixture(), remote }),
    /forbidden field/
  );
});

test('AXIOM One social presenter does not invent remote availability', () => {
  const model = presentAxiomOneSocial({ local: localFixture() });
  assert.equal(model.remote.available, false);
  assert.equal(model.remote.activation_scope, 'unavailable');
  assert.equal(model.remote.network_effect, 'none');
  assert.equal(model.remote.authority_effect, 'none');
});
