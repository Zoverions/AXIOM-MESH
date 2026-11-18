import assert from 'node:assert/strict';
import test from 'node:test';

import {
  BOUNDED_DECISION_ROUTE_PROPOSAL_SCHEMA,
  proposeBoundedDecisionRoute
} from '../src/lib/bounded-decision-routing.mjs';

function profile({
  profileId,
  providerMode,
  latencyClass,
  revisionEvidence,
  calibrationClaim,
  probabilitySupport
}) {
  return {
    schema: 'axiom-bounded-decision-provider-profile.v0',
    version: 0,
    status: 'inert-bounded-decision-metadata',
    profile_id: profileId,
    catalog_entry_id: `provider:${profileId}`,
    catalog_entry_version: '0.1.0',
    catalog_entry_digest: 'b'.repeat(64),
    offering_ref: `offering.${profileId}`,
    offering_version_or_revision: `${profileId}-2026-09-17-unpinned`,
    offering_revision_evidence: revisionEvidence,
    provider_mode: providerMode,
    supported_question_kinds: ['choice', 'score', 'binary-probability'],
    max_questions_per_request: 64,
    max_choice_cardinality: 64,
    max_score_levels: 10,
    type_guarantee: 'provider-native-closed-set',
    probability_support: probabilitySupport,
    latency_class: latencyClass,
    calibration_claim: calibrationClaim,
    retention_posture_ref: null,
    training_use_posture_ref: null,
    created_at: '2026-09-17T23:00:00.000Z',
    review_at: '2026-10-17T23:00:00.000Z',
    authority_effect: 'none',
    network_effect: 'none',
    credential_visibility: 'none',
    runtime_activation: false,
    selection_effect: 'eligibility-only',
    assurance_effect: 'none'
  };
}

function candidate(providerProfile, overrides = {}) {
  return {
    profile: providerProfile,
    available: true,
    policy_eligible: true,
    disclosure_eligible: true,
    calibration_eligible: true,
    currentness: 'current',
    ...overrides
  };
}

function route({
  candidates,
  locality = 'any',
  mode = 'auto',
  preferredProfileId = null,
  intentPreferred = [],
  firstSeat = []
}) {
  return proposeBoundedDecisionRoute({
    candidates,
    request: {
      question_kind: 'choice',
      choice_cardinality: 4,
      score_levels: null,
      deterministic_solution_available: false,
      fallback_route: 'system-two'
    },
    user_policy: {
      mode,
      locality,
      preferred_profile_id: preferredProfileId,
      excluded_profile_ids: []
    },
    intent_policy: { preferred_profile_ids: intentPreferred },
    system_policy: { first_seat_profile_ids: firstSeat }
  });
}

const needle = profile({
  profileId: 'bounded.provider.cactus.needle3.experimental',
  providerMode: 'owner-local',
  latencyClass: 'local-fast',
  revisionEvidence: 'mutable-alias',
  calibrationClaim: 'provider-claimed',
  probabilitySupport: 'confidence-only'
});

const jev = profile({
  profileId: 'bounded.provider.typesafe.jev.v1',
  providerMode: 'provider-remote',
  latencyClass: 'interactive',
  revisionEvidence: 'mutable-alias',
  calibrationClaim: 'local-reviewed',
  probabilitySupport: 'full-distribution'
});

test('Needle remains ineligible until local calibration evidence says otherwise', () => {
  const result = route({
    candidates: [candidate(needle, { calibration_eligible: false })],
    locality: 'local-only',
    intentPreferred: [needle.profile_id]
  });

  assert.equal(result.schema, BOUNDED_DECISION_ROUTE_PROPOSAL_SCHEMA);
  assert.equal(result.status, 'no-route');
  assert.equal(result.selected_profile_id, null);
  assert.deepEqual(result.fallback_profile_ids, []);
  assert.equal(result.escalation, 'system-two');
  assert.equal(result.authority_effect, 'none');
  assert.equal(result.assurance_effect, 'none');
});

test('Needle confidence-only output cannot satisfy probability-preserving choice routing even after local calibration', () => {
  const result = route({
    candidates: [candidate(needle)],
    locality: 'local-only',
    intentPreferred: [needle.profile_id]
  });

  assert.equal(result.status, 'no-route');
  assert.equal(result.selected_profile_id, null);
  assert.deepEqual(result.fallback_profile_ids, []);
  assert.equal(result.escalation, 'system-two');
  assert.equal(result.authority_effect, 'none');
  assert.equal(result.network_effect, 'none');
  assert.equal(result.credential_visibility, 'none');
  assert.equal(result.runtime_activation, false);
  assert.equal(result.selection_effect, 'proposal-only');
  assert.equal(result.assurance_effect, 'none');
});

test('Needle is filtered before Jev ranking when its evidence shape cannot satisfy the bound question', () => {
  const result = route({
    candidates: [candidate(needle), candidate(jev)],
    firstSeat: [jev.profile_id]
  });

  assert.equal(result.status, 'selected');
  assert.equal(result.selected_profile_id, jev.profile_id);
  assert.deepEqual(result.fallback_profile_ids, []);
});

test('explicit user PREFER cannot force Needle into an incompatible bounded-decision evidence contract', () => {
  const result = route({
    candidates: [candidate(jev), candidate(needle)],
    mode: 'prefer',
    preferredProfileId: needle.profile_id,
    firstSeat: [jev.profile_id]
  });

  assert.equal(result.status, 'selected');
  assert.equal(result.selected_profile_id, jev.profile_id);
  assert.deepEqual(result.fallback_profile_ids, []);
});

test('intent preference cannot make an uncalibrated Needle candidate eligible', () => {
  const result = route({
    candidates: [
      candidate(needle, { calibration_eligible: false }),
      candidate(jev)
    ],
    intentPreferred: [needle.profile_id],
    firstSeat: [jev.profile_id]
  });

  assert.equal(result.status, 'selected');
  assert.equal(result.selected_profile_id, jev.profile_id);
  assert.deepEqual(result.fallback_profile_ids, []);
});

test('Needle confidence-only output is also insufficient for binary-probability observations', () => {
  const result = proposeBoundedDecisionRoute({
    candidates: [candidate(needle)],
    request: {
      question_kind: 'binary-probability',
      choice_cardinality: null,
      score_levels: null,
      deterministic_solution_available: false,
      fallback_route: 'system-two'
    },
    user_policy: {
      mode: 'auto',
      locality: 'local-only',
      preferred_profile_id: null,
      excluded_profile_ids: []
    },
    intent_policy: { preferred_profile_ids: [needle.profile_id] },
    system_policy: { first_seat_profile_ids: [] }
  });

  assert.equal(result.status, 'no-route');
  assert.equal(result.selected_profile_id, null);
  assert.equal(result.escalation, 'system-two');
});
