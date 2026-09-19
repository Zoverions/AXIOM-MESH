import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  ADVERSARIAL_RELEASE_SWARM_ASSESSMENT_SCHEMA,
  compileAdversarialReleaseSwarmShadowPlan,
  validateAdversarialReleaseSwarmShadowPlan,
  validateAdversarialReleaseSwarmAssessment,
  assessAdversarialReleaseSwarmSignal,
  createAdversarialReleaseThreatObservationCandidate
} from '../src/lib/adversarial-release-swarm.mjs';
import {
  normalizeTypeSafeSystemOneFixtureResult
} from '../src/lib/bounded-decision-typesafe-system-one-adapter.mjs';
import {
  verifyThreatObservation
} from '../src/lib/threat-intelligence-contracts.mjs';

const COMMIT = 'e37a2c04bd51196121a31640801f7b8ceb630986';
const CREATED_AT = '2026-09-18T14:00:00.000Z';
const OBSERVED_AT = '2026-09-18T14:01:00.000Z';
const A = 'a'.repeat(64);
const B = 'b'.repeat(64);

async function targetCatalog() {
  return JSON.parse(
    await readFile(new URL('../../RED-TEAM-TARGETS.json', import.meta.url), 'utf8')
  );
}

function scenario(targetIds, overrides = {}) {
  return {
    scenario_id: 'ars_fixture_001',
    environment_ownership: 'repository-owned',
    synthetic_data_only: true,
    contains_secrets_or_credentials: false,
    contains_private_data: false,
    third_party_testing_performed: false,
    expected_boundary: 'The supported request must remain denied without exact current authority.',
    observed_result: 'The synthetic trace records an operation that appears to have crossed the declared boundary.',
    trace_summary: 'Synthetic deterministic trace fixture containing only public-safe state and no user data or credentials.',
    evidence_refs: ['fixture:ars:trace:001'],
    target_ids: targetIds,
    ...overrides
  };
}

function providerProfile(overrides = {}) {
  return {
    schema: 'axiom-bounded-decision-provider-profile.v0',
    version: 0,
    status: 'inert-bounded-decision-metadata',
    profile_id: 'bounded.provider.typesafe.ars.fixture.v1',
    catalog_entry_id: 'provider:typesafe-system-one',
    catalog_entry_version: '0.1.0',
    catalog_entry_digest: A,
    offering_ref: 'typesafe.system-one',
    offering_version_or_revision: 'jev-latest',
    offering_revision_evidence: 'mutable-alias',
    provider_mode: 'provider-remote',
    supported_question_kinds: ['binary-probability'],
    max_questions_per_request: 64,
    max_choice_cardinality: 64,
    max_score_levels: 10,
    type_guarantee: 'provider-native-closed-set',
    probability_support: 'binary-probability-only',
    latency_class: 'interactive',
    calibration_claim: 'local-experimental',
    retention_posture_ref: 'posture.typesafe.retention.reviewed.v1',
    training_use_posture_ref: 'posture.typesafe.training.reviewed.v1',
    created_at: '2026-09-17T20:40:00.000Z',
    review_at: '2026-10-17T20:40:00.000Z',
    authority_effect: 'none',
    network_effect: 'none',
    credential_visibility: 'none',
    runtime_activation: false,
    selection_effect: 'eligibility-only',
    assurance_effect: 'none',
    ...overrides
  };
}

function thresholds(overrides = {}) {
  return {
    policy_ref: 'ars.thresholds.fixture.v0',
    minimum_evidence_sufficiency: 0.6,
    review_signal_probability: 0.55,
    reproduction_signal_probability: 0.85,
    ...overrides
  };
}

async function planFor(targetIds = ['RT-AUTH-001']) {
  const catalog = await targetCatalog();
  return compileAdversarialReleaseSwarmShadowPlan({
    targetCatalog: catalog,
    candidate: {
      commit_sha: COMMIT,
      supported_build: catalog.supported_build
    },
    scenario: scenario(targetIds),
    createdAt: CREATED_AT
  });
}

function questionEntry(plan, targetId, role) {
  return plan.items
    .find(item => item.target_id === targetId)
    .questions.find(entry => entry.role === role);
}

function noulObservation(
  plan,
  targetId,
  role,
  pTrue,
  profile = providerProfile(),
  suffix = 'a'
) {
  const item = plan.items.find(entry => entry.target_id === targetId);
  const question = questionEntry(plan, targetId, role).question_schema;
  return normalizeTypeSafeSystemOneFixtureResult({
    result: {
      model: profile.offering_version_or_revision,
      answers: {
        [question.question_schema_id]: {
          type: 'noul',
          noul: pTrue
        }
      },
      usage: {
        input_tokens: 20,
        output_tokens: 2
      }
    },
    observation: {
      observation_id: 'ars.obs.' + suffix + '.' + role.replaceAll('-', '_'),
      state_digest: item.state_digest,
      state_classification: 'synthetic_public_safe',
      observed_at: OBSERVED_AT,
      latency_ms: 9,
      calibration_report_ref: null,
      transport_evidence_ref: 'fixture.ars.system-one.v0'
    }
  }, profile, question);
}

test('compiles every current red-team target into two inert parallel TypeSafe Noul questions', async () => {
  const catalog = await targetCatalog();
  const plan = await planFor(catalog.targets.map(target => target.id));

  assert.equal(plan.items.length, catalog.targets.length);
  assert.deepEqual(
    plan.items.map(item => item.target_id),
    catalog.targets.map(target => target.id)
  );
  assert.equal(plan.mode, 'shadow-only');
  assert.equal(plan.provider_invocation, 'not-implemented-here');
  assert.match(plan.target_catalog_digest, /^[a-f0-9]{64}$/);
  assert.equal(plan.release_gate_effect, 'none');
  assert.equal(plan.authority_effect, 'none');
  assert.equal(plan.assurance_effect, 'none');
  assert.equal(plan.network_effect, 'none');
  assert.equal(plan.runtime_activation, false);

  for (const item of plan.items) {
    assert.equal(item.questions.length, 2);
    assert.deepEqual(item.questions.map(entry => entry.role), [
      'evidence-sufficiency',
      'boundary-violation'
    ]);
    for (const entry of item.questions) {
      assert.equal(entry.question_schema.question_kind, 'binary-probability');
      assert.equal(entry.typesafe_projection.question.type, 'noul');
      assert.doesNotMatch(entry.question_schema.question_schema_id, /-/);
    }
  }

  assert.equal(
    validateAdversarialReleaseSwarmShadowPlan(plan).schema,
    plan.schema
  );
  assert.equal(Object.isFrozen(plan), true);
});

test('shadow-plan compilation is deterministic for fixed inputs', async () => {
  const catalog = await targetCatalog();
  const input = {
    targetCatalog: catalog,
    candidate: {
      commit_sha: COMMIT,
      supported_build: catalog.supported_build
    },
    scenario: scenario(['RT-AUTH-001', 'RT-KERN-005']),
    createdAt: CREATED_AT
  };

  assert.deepEqual(
    compileAdversarialReleaseSwarmShadowPlan(input),
    compileAdversarialReleaseSwarmShadowPlan(structuredClone(input))
  );
});

test('compiler rejects unsafe data, third-party testing, unknown targets and build drift', async () => {
  const catalog = await targetCatalog();
  const candidate = {
    commit_sha: COMMIT,
    supported_build: catalog.supported_build
  };
  const base = scenario(['RT-AUTH-001']);

  for (const [field, value] of [
    ['synthetic_data_only', false],
    ['contains_secrets_or_credentials', true],
    ['contains_private_data', true],
    ['third_party_testing_performed', true]
  ]) {
    assert.throws(
      () => compileAdversarialReleaseSwarmShadowPlan({
        targetCatalog: catalog,
        candidate,
        scenario: { ...base, [field]: value },
        createdAt: CREATED_AT
      }),
      /must equal|synthetic|secret|private|third.party/i
    );
  }

  assert.throws(
    () => compileAdversarialReleaseSwarmShadowPlan({
      targetCatalog: catalog,
      candidate,
      scenario: {
        ...base,
        environment_ownership: 'third-party-production'
      },
      createdAt: CREATED_AT
    }),
    /environment/i
  );

  assert.throws(
    () => compileAdversarialReleaseSwarmShadowPlan({
      targetCatalog: catalog,
      candidate,
      scenario: {
        ...base,
        target_ids: ['RT-NOT-999']
      },
      createdAt: CREATED_AT
    }),
    /unknown red-team target/i
  );

  assert.throws(
    () => compileAdversarialReleaseSwarmShadowPlan({
      targetCatalog: catalog,
      candidate: {
        ...candidate,
        supported_build: '0.12.0-drift'
      },
      scenario: base,
      createdAt: CREATED_AT
    }),
    /supported build/i
  );
});

test('plan validation fails closed on state, projection and release-boundary tampering', async () => {
  const plan = await planFor();

  const stateTamper = structuredClone(plan);
  stateTamper.items[0].state.trace_summary = 'tampered';
  assert.throws(
    () => validateAdversarialReleaseSwarmShadowPlan(stateTamper),
    /state digest mismatch/i
  );

  const projectionTamper = structuredClone(plan);
  projectionTamper.items[0].questions[0].typesafe_projection.question.criteria.true =
    'tampered';
  assert.throws(
    () => validateAdversarialReleaseSwarmShadowPlan(projectionTamper),
    /projection/i
  );

  const releaseGateTamper = structuredClone(plan);
  releaseGateTamper.release_gate_effect = 'blocking';
  assert.throws(
    () => validateAdversarialReleaseSwarmShadowPlan(releaseGateTamper),
    /release_gate_effect/i
  );
});

test('shadow assessment routes signals conservatively without producing a finding disposition', async () => {
  const plan = await planFor();
  const profile = providerProfile();
  const targetId = 'RT-AUTH-001';

  const cases = [
    { sufficiency: 0.93, violation: 0.93, expected: 'needs-reproduction' },
    { sufficiency: 0.93, violation: 0.70, expected: 'review' },
    { sufficiency: 0.93, violation: 0.20, expected: 'no-signal' },
    { sufficiency: 0.40, violation: 0.99, expected: 'inconclusive' }
  ];

  for (const [index, fixture] of cases.entries()) {
    const observations = [
      noulObservation(
        plan,
        targetId,
        'evidence-sufficiency',
        fixture.sufficiency,
        profile,
        's' + index
      ),
      noulObservation(
        plan,
        targetId,
        'boundary-violation',
        fixture.violation,
        profile,
        'v' + index
      )
    ];

    const assessment = assessAdversarialReleaseSwarmSignal({
      plan,
      targetId,
      observations,
      providerProfiles: [profile],
      thresholds: thresholds()
    });

    assert.equal(
      assessment.schema,
      ADVERSARIAL_RELEASE_SWARM_ASSESSMENT_SCHEMA
    );
    assert.equal(assessment.shadow_route, fixture.expected);
    assert.deepEqual(assessment.thresholds, thresholds());
    assert.equal(assessment.canonical_finding_disposition, null);
    assert.equal(assessment.release_safe_claimed, false);
    assert.equal(assessment.reproduced_claimed, false);
    assert.equal(assessment.authority_effect, 'none');
    assert.equal(assessment.assurance_effect, 'none');
    assert.equal(assessment.release_gate_effect, 'none');
    assert.equal(
      validateAdversarialReleaseSwarmAssessment(
        assessment,
        plan,
        targetId
      ).shadow_route,
      fixture.expected
    );
  }
});

test('missing semantic evidence remains inconclusive and never becomes evidence of safety', async () => {
  const plan = await planFor();
  const assessment = assessAdversarialReleaseSwarmSignal({
    plan,
    targetId: 'RT-AUTH-001',
    observations: [],
    providerProfiles: [],
    thresholds: thresholds()
  });

  assert.equal(assessment.shadow_route, 'inconclusive');
  assert.deepEqual(assessment.provider_signals, []);
  assert.equal(assessment.release_safe_claimed, false);
  assert.equal(assessment.canonical_finding_disposition, null);
});

test('multi-provider disagreement is preserved and a stronger review signal cannot be suppressed', async () => {
  const plan = await planFor();
  const targetId = 'RT-AUTH-001';
  const first = providerProfile();
  const second = providerProfile({
    profile_id: 'bounded.provider.second.ars.fixture.v1',
    catalog_entry_digest: B,
    offering_ref: 'second.system-one',
    offering_version_or_revision: 'second-revision',
    offering_revision_evidence: 'provider-versioned'
  });

  const observations = [
    noulObservation(
      plan,
      targetId,
      'evidence-sufficiency',
      0.90,
      first,
      'first_s'
    ),
    noulObservation(
      plan,
      targetId,
      'boundary-violation',
      0.70,
      first,
      'first_v'
    ),
    noulObservation(
      plan,
      targetId,
      'evidence-sufficiency',
      0.90,
      second,
      'second_s'
    ),
    noulObservation(
      plan,
      targetId,
      'boundary-violation',
      0.10,
      second,
      'second_v'
    )
  ];

  const assessment = assessAdversarialReleaseSwarmSignal({
    plan,
    targetId,
    observations,
    providerProfiles: [first, second],
    thresholds: thresholds()
  });

  const reversedAssessment = assessAdversarialReleaseSwarmSignal({
    plan,
    targetId,
    observations: [...observations].reverse(),
    providerProfiles: [second, first],
    thresholds: thresholds()
  });

  assert.equal(assessment.shadow_route, 'review');
  assert.equal(assessment.disagreement, true);
  assert.deepEqual(assessment, reversedAssessment);
  assert.deepEqual(
    new Set(assessment.provider_signals.map(signal => signal.route)),
    new Set(['review', 'no-signal'])
  );
});

test('assessment rejects unrelated, stale-state and duplicate semantic observations', async () => {
  const plan = await planFor(['RT-AUTH-001', 'RT-KERN-005']);
  const profile = providerProfile();

  const authSufficiency = noulObservation(
    plan,
    'RT-AUTH-001',
    'evidence-sufficiency',
    0.9,
    profile,
    'auth_s'
  );
  const kernViolation = noulObservation(
    plan,
    'RT-KERN-005',
    'boundary-violation',
    0.9,
    profile,
    'kern_v'
  );

  assert.throws(
    () => assessAdversarialReleaseSwarmSignal({
      plan,
      targetId: 'RT-AUTH-001',
      observations: [kernViolation],
      providerProfiles: [profile],
      thresholds: thresholds()
    }),
    /unrelated question schema/i
  );

  const stale = structuredClone(authSufficiency);
  stale.state_digest = 'c'.repeat(64);
  assert.throws(
    () => assessAdversarialReleaseSwarmSignal({
      plan,
      targetId: 'RT-AUTH-001',
      observations: [stale],
      providerProfiles: [profile],
      thresholds: thresholds()
    }),
    /invalid|digest|state/i
  );

  assert.throws(
    () => assessAdversarialReleaseSwarmSignal({
      plan,
      targetId: 'RT-AUTH-001',
      observations: [authSufficiency, authSufficiency],
      providerProfiles: [profile],
      thresholds: thresholds()
    }),
    /duplicate provider observation/i
  );
});

test('review signal can enter the existing threat-observation lifecycle only as screening evidence', async () => {
  const plan = await planFor();
  const profile = providerProfile();
  const targetId = 'RT-AUTH-001';

  const assessment = assessAdversarialReleaseSwarmSignal({
    plan,
    targetId,
    observations: [
      noulObservation(
        plan,
        targetId,
        'evidence-sufficiency',
        0.95,
        profile,
        'obs_s'
      ),
      noulObservation(
        plan,
        targetId,
        'boundary-violation',
        0.91,
        profile,
        'obs_v'
      )
    ],
    providerProfiles: [profile],
    thresholds: thresholds()
  });

  const observation = createAdversarialReleaseThreatObservationCandidate({
    plan,
    assessment,
    targetId,
    retrievedAt: '2026-09-18T14:02:00.000Z',
    reviewAt: '2026-09-25T14:02:00.000Z'
  });

  assert.equal(
    verifyThreatObservation(observation).schema,
    'axiom-threat-observation.v0'
  );
  assert.equal(observation.source_class, 'axiom_lab_finding');
  assert.equal(observation.source_confidence, 'screening_only');
  assert.equal(
    observation.collector_confidence,
    'reproduction_requested'
  );
  assert.equal(observation.sensitivity_class, 'synthetic_public_safe');
  assert.equal(observation.provenance_chain.length, 2);
  assert.match(
    observation.summary,
    /not a reproduced finding or release-safety result/i
  );
});

test('no-signal cannot be laundered into a threat observation by editing the assessment route', async () => {
  const plan = await planFor();
  const profile = providerProfile();
  const targetId = 'RT-AUTH-001';

  const assessment = assessAdversarialReleaseSwarmSignal({
    plan,
    targetId,
    observations: [
      noulObservation(
        plan,
        targetId,
        'evidence-sufficiency',
        0.95,
        profile,
        'safe_s'
      ),
      noulObservation(
        plan,
        targetId,
        'boundary-violation',
        0.10,
        profile,
        'safe_v'
      )
    ],
    providerProfiles: [profile],
    thresholds: thresholds()
  });

  assert.throws(
    () => createAdversarialReleaseThreatObservationCandidate({
      plan,
      assessment,
      targetId,
      retrievedAt: '2026-09-18T14:02:00.000Z',
      reviewAt: '2026-09-25T14:02:00.000Z'
    }),
    /only review or needs-reproduction/i
  );

  const tampered = structuredClone(assessment);
  tampered.shadow_route = 'needs-reproduction';
  assert.throws(
    () => createAdversarialReleaseThreatObservationCandidate({
      plan,
      assessment: tampered,
      targetId,
      retrievedAt: '2026-09-18T14:02:00.000Z',
      reviewAt: '2026-09-25T14:02:00.000Z'
    }),
    /shadow_route/i
  );

  const thresholdTamper = structuredClone(assessment);
  thresholdTamper.thresholds.review_signal_probability = 0.04;
  thresholdTamper.thresholds.reproduction_signal_probability = 0.05;
  assert.throws(
    () => validateAdversarialReleaseSwarmAssessment(
      thresholdTamper,
      plan,
      targetId
    ),
    /provider_signals.*route/i
  );

  const referenceTamper = structuredClone(assessment);
  referenceTamper.threshold_policy_ref = 'ars.thresholds.unbound.v0';
  assert.throws(
    () => validateAdversarialReleaseSwarmAssessment(
      referenceTamper,
      plan,
      targetId
    ),
    /threshold_policy_ref/i
  );
});

test('assessment input stays within ThreatObservation provenance capacity', async () => {
  const plan = await planFor();
  const profile = providerProfile();
  const targetId = 'RT-AUTH-001';
  const observation = noulObservation(
    plan,
    targetId,
    'evidence-sufficiency',
    0.9,
    profile,
    'bounded'
  );

  assert.throws(
    () => assessAdversarialReleaseSwarmSignal({
      plan,
      targetId,
      observations: Array.from({ length: 33 }, () => observation),
      providerProfiles: [profile],
      thresholds: thresholds()
    }),
    /bounded collection limits/i
  );

  const profiles = Array.from({ length: 17 }, (_, index) =>
    providerProfile({
      profile_id: 'bounded.provider.ars.capacity.' + index + '.v1',
      catalog_entry_digest: index % 2 === 0 ? A : B
    })
  );
  assert.throws(
    () => assessAdversarialReleaseSwarmSignal({
      plan,
      targetId,
      observations: [],
      providerProfiles: profiles,
      thresholds: thresholds()
    }),
    /bounded collection limits/i
  );
});

test('ARS production module remains network, credential, SDK, process and effect free', async () => {
  const source = await readFile(
    new URL('../src/lib/adversarial-release-swarm.mjs', import.meta.url),
    'utf8'
  );
  const imports = source
    .split('\n')
    .filter(line => /^\s*import\b/.test(line))
    .join('\n');

  for (const marker of [
    'node:http',
    'node:https',
    'node:net',
    'node:tls',
    'node:child_process',
    'node:worker_threads',
    '@typesafe-ai/sdk'
  ]) {
    assert.equal(
      imports.includes(marker),
      false,
      'ARS imports must not contain ' + marker
    );
  }

  for (const marker of [
    'fetch(',
    'process.env',
    'TYPESAFE_API_KEY',
    'https://api.typesafe.ai',
    'createConnection(',
    'request(',
    'spawn(',
    'exec('
  ]) {
    assert.equal(
      source.includes(marker),
      false,
      'ARS must not contain effect or credential primitive ' + marker
    );
  }
});
