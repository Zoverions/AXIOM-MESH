import assert from 'node:assert/strict';
import test from 'node:test';

import {
  BOUNDED_DECISION_ROUTE_PROPOSAL_SCHEMA,
  proposeBoundedDecisionRoute
} from '../src/lib/bounded-decision-routing.mjs';

function providerProfile({
  profileId,
  providerMode = 'provider-remote',
  latencyClass = 'interactive',
  revisionEvidence = 'provider-versioned',
  maxChoiceCardinality = 64,
  maxScoreLevels = 10
}) {
  return {
    schema: 'axiom-bounded-decision-provider-profile.v0',
    version: 0,
    status: 'inert-bounded-decision-metadata',
    profile_id: profileId,
    catalog_entry_id: `provider:${profileId}`,
    catalog_entry_version: '0.1.0',
    catalog_entry_digest: 'a'.repeat(64),
    offering_ref: `offering.${profileId}`,
    offering_version_or_revision: `${profileId}-2026-09-17`,
    offering_revision_evidence: revisionEvidence,
    provider_mode: providerMode,
    supported_question_kinds: ['choice', 'score', 'binary-probability'],
    max_questions_per_request: 64,
    max_choice_cardinality: maxChoiceCardinality,
    max_score_levels: maxScoreLevels,
    type_guarantee: 'provider-native-closed-set',
    probability_support: 'full-distribution',
    latency_class: latencyClass,
    calibration_claim: 'local-reviewed',
    retention_posture_ref: null,
    training_use_posture_ref: null,
    created_at: '2026-09-17T19:00:00.000Z',
    review_at: '2026-10-17T19:00:00.000Z',
    authority_effect: 'none',
    network_effect: 'none',
    credential_visibility: 'none',
    runtime_activation: false,
    selection_effect: 'eligibility-only',
    assurance_effect: 'none'
  };
}

function candidate(profile, overrides = {}) {
  return {
    profile,
    available: true,
    policy_eligible: true,
    disclosure_eligible: true,
    calibration_eligible: true,
    currentness: 'current',
    ...overrides
  };
}

function request(overrides = {}) {
  return {
    question_kind: 'choice',
    choice_cardinality: 4,
    score_levels: null,
    deterministic_solution_available: false,
    fallback_route: 'system-two',
    ...overrides
  };
}

function userPolicy(overrides = {}) {
  return {
    mode: 'auto',
    locality: 'any',
    preferred_profile_id: null,
    excluded_profile_ids: [],
    ...overrides
  };
}

function route({
  candidates,
  req = request(),
  user = userPolicy(),
  intentPreferred = [],
  firstSeat = []
}) {
  return proposeBoundedDecisionRoute({
    candidates,
    request: req,
    user_policy: user,
    intent_policy: { preferred_profile_ids: intentPreferred },
    system_policy: { first_seat_profile_ids: firstSeat }
  });
}

const jev = providerProfile({
  profileId: 'bounded.provider.typesafe.jev.v1',
  providerMode: 'provider-remote',
  latencyClass: 'interactive',
  revisionEvidence: 'mutable-alias'
});
const local = providerProfile({
  profileId: 'bounded.provider.local.fast.v1',
  providerMode: 'owner-local',
  latencyClass: 'local-fast',
  revisionEvidence: 'exact-artifact'
});
const constrainedGeneral = providerProfile({
  profileId: 'bounded.provider.general.constrained.v1',
  providerMode: 'provider-remote',
  latencyClass: 'slow',
  revisionEvidence: 'provider-versioned'
});

test('AUTO gives the configured first-seat provider priority without creating authority', () => {
  const result = route({
    candidates: [candidate(local), candidate(jev), candidate(constrainedGeneral)],
    firstSeat: [jev.profile_id]
  });

  assert.equal(result.schema, BOUNDED_DECISION_ROUTE_PROPOSAL_SCHEMA);
  assert.equal(result.status, 'selected');
  assert.equal(result.selected_profile_id, jev.profile_id);
  assert.deepEqual(result.fallback_profile_ids, [local.profile_id, constrainedGeneral.profile_id]);
  assert.equal(result.authority_effect, 'none');
  assert.equal(result.network_effect, 'none');
  assert.equal(result.credential_visibility, 'none');
  assert.equal(result.runtime_activation, false);
  assert.equal(result.selection_effect, 'proposal-only');
  assert.equal(result.assurance_effect, 'none');
  assert.equal(Object.isFrozen(result), true);
});

test('explicit user PREFER outranks intent and system defaults', () => {
  const result = route({
    candidates: [candidate(jev), candidate(local), candidate(constrainedGeneral)],
    user: userPolicy({ mode: 'prefer', preferred_profile_id: local.profile_id }),
    intentPreferred: [jev.profile_id],
    firstSeat: [jev.profile_id]
  });

  assert.equal(result.selected_profile_id, local.profile_id);
});

test('intent preference outranks the system first-seat default when the user has not chosen a provider', () => {
  const result = route({
    candidates: [candidate(jev), candidate(local)],
    intentPreferred: [local.profile_id],
    firstSeat: [jev.profile_id]
  });

  assert.equal(result.selected_profile_id, local.profile_id);
});

test('PREFER falls back when the preferred provider is unavailable', () => {
  const result = route({
    candidates: [candidate(jev, { available: false }), candidate(local)],
    user: userPolicy({ mode: 'prefer', preferred_profile_id: jev.profile_id }),
    firstSeat: [jev.profile_id]
  });

  assert.equal(result.status, 'selected');
  assert.equal(result.selected_profile_id, local.profile_id);
});

test('PREFER cannot override a hard disclosure constraint', () => {
  const result = route({
    candidates: [candidate(jev, { disclosure_eligible: false }), candidate(local)],
    user: userPolicy({ mode: 'prefer', preferred_profile_id: jev.profile_id }),
    firstSeat: [jev.profile_id]
  });

  assert.equal(result.status, 'selected');
  assert.equal(result.selected_profile_id, local.profile_id);
});

test('REQUIRE never silently substitutes another provider', () => {
  const result = route({
    candidates: [candidate(jev, { available: false }), candidate(local)],
    user: userPolicy({ mode: 'require', preferred_profile_id: jev.profile_id }),
    firstSeat: [jev.profile_id]
  });

  assert.equal(result.status, 'no-route');
  assert.equal(result.selected_profile_id, null);
  assert.deepEqual(result.fallback_profile_ids, []);
  assert.equal(result.escalation, 'system-two');
  assert.ok(result.reasons.includes('required-provider-ineligible'));
});

test('REQUIRE cannot override a hard disclosure constraint', () => {
  const result = route({
    candidates: [candidate(jev, { disclosure_eligible: false }), candidate(local)],
    user: userPolicy({ mode: 'require', preferred_profile_id: jev.profile_id }),
    firstSeat: [jev.profile_id]
  });

  assert.equal(result.status, 'no-route');
  assert.equal(result.selected_profile_id, null);
  assert.deepEqual(result.fallback_profile_ids, []);
  assert.equal(result.escalation, 'system-two');
});

test('LOCAL_ONLY excludes remote providers even when they are first-seat', () => {
  const result = route({
    candidates: [candidate(jev), candidate(local)],
    user: userPolicy({ locality: 'local-only' }),
    firstSeat: [jev.profile_id]
  });

  assert.equal(result.selected_profile_id, local.profile_id);
  assert.deepEqual(result.fallback_profile_ids, []);
});

test('REQUIRE composes with LOCAL_ONLY and fails closed for a required remote provider', () => {
  const result = route({
    candidates: [candidate(jev), candidate(local)],
    user: userPolicy({
      mode: 'require',
      locality: 'local-only',
      preferred_profile_id: jev.profile_id
    }),
    firstSeat: [jev.profile_id]
  });

  assert.equal(result.status, 'no-route');
  assert.equal(result.selected_profile_id, null);
  assert.deepEqual(result.fallback_profile_ids, []);
  assert.equal(result.escalation, 'system-two');
  assert.ok(result.reasons.includes('required-provider-ineligible'));
});

test('explicit provider exclusion cannot be undone by intent or system preference', () => {
  const result = route({
    candidates: [candidate(jev), candidate(local)],
    user: userPolicy({ excluded_profile_ids: [jev.profile_id] }),
    intentPreferred: [jev.profile_id],
    firstSeat: [jev.profile_id]
  });

  assert.equal(result.selected_profile_id, local.profile_id);
});

test('hard disclosure, policy, calibration, and currentness constraints filter candidates before preference', () => {
  for (const ineligibleJev of [
    candidate(jev, { disclosure_eligible: false }),
    candidate(jev, { policy_eligible: false }),
    candidate(jev, { calibration_eligible: false }),
    candidate(jev, { currentness: 'stale' })
  ]) {
    const result = route({
      candidates: [ineligibleJev, candidate(local)],
      intentPreferred: [jev.profile_id],
      firstSeat: [jev.profile_id]
    });
    assert.equal(result.selected_profile_id, local.profile_id);
  }
});

test('question-kind and cardinality compatibility fail closed before provider ranking', () => {
  const tiny = providerProfile({
    profileId: 'bounded.provider.tiny.v1',
    providerMode: 'owner-local',
    maxChoiceCardinality: 2,
    maxScoreLevels: 2
  });

  const result = route({
    candidates: [candidate(tiny), candidate(local)],
    req: request({ choice_cardinality: 4 }),
    intentPreferred: [tiny.profile_id]
  });

  assert.equal(result.selected_profile_id, local.profile_id);
});

test('no eligible bounded provider escalates instead of bypassing the semantic gate', () => {
  const result = route({
    candidates: [candidate(jev, { available: false })],
    req: request({ fallback_route: 'human' }),
    firstSeat: [jev.profile_id]
  });

  assert.equal(result.status, 'no-route');
  assert.equal(result.selected_profile_id, null);
  assert.equal(result.escalation, 'human');
  assert.ok(result.reasons.includes('no-eligible-provider'));
});

test('an exact deterministic solution prevents an unnecessary model route', () => {
  const result = route({
    candidates: [candidate(jev), candidate(local)],
    req: request({ deterministic_solution_available: true }),
    firstSeat: [jev.profile_id]
  });

  assert.equal(result.status, 'not-needed');
  assert.equal(result.selected_profile_id, null);
  assert.deepEqual(result.fallback_profile_ids, []);
  assert.equal(result.escalation, 'none');
  assert.ok(result.reasons.includes('deterministic-solution-available'));
});

test('invalid routing policy fails closed rather than guessing provider intent', () => {
  assert.throws(
    () => route({
      candidates: [candidate(jev)],
      user: userPolicy({ mode: 'whatever-is-fastest' })
    }),
    /mode|routing policy/i
  );
});

test('invalid locality policy fails closed', () => {
  assert.throws(
    () => route({
      candidates: [candidate(jev)],
      user: userPolicy({ locality: 'send-anywhere' })
    }),
    /locality|routing policy/i
  );
});
