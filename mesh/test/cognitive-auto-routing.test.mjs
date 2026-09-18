import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  computeBoundedDecisionQuestionSchemaDigest
} from '../src/lib/bounded-decision-question-schema.mjs';
import {
  normalizeBoundedDecisionProviderResult
} from '../src/lib/bounded-decision-observation.mjs';
import {
  COGNITIVE_ROUTE_PROPOSAL_SCHEMA,
  COGNITIVE_ROUTE_STATE_SCHEMA,
  computeCognitiveRouteStateDigest,
  createCognitiveRouteProposal,
  validateCognitiveRouteProposal,
  verifyCognitiveRouteProposal
} from '../src/lib/cognitive-auto-routing.mjs';

const A = 'a'.repeat(64);
const B = 'b'.repeat(64);
const C = 'c'.repeat(64);
const D = 'd'.repeat(64);
const E = 'e'.repeat(64);
const F = 'f'.repeat(64);
const ZERO = '0'.repeat(64);

function providerProfile(overrides = {}) {
  return {
    schema: 'axiom-bounded-decision-provider-profile.v0',
    version: 0,
    status: 'inert-bounded-decision-metadata',
    profile_id: 'bounded.provider.cognitive-route.v1',
    catalog_entry_id: 'provider:cognitive-route-test',
    catalog_entry_version: '0.1.0',
    catalog_entry_digest: E,
    offering_ref: 'model.cognitive-route-test',
    offering_version_or_revision: 'model.cognitive-route-test-2026-09-18',
    offering_revision_evidence: 'provider-versioned',
    provider_mode: 'provider-remote',
    supported_question_kinds: ['binary-probability'],
    max_questions_per_request: 64,
    max_choice_cardinality: 64,
    max_score_levels: 10,
    type_guarantee: 'provider-native-closed-set',
    probability_support: 'full-distribution',
    latency_class: 'interactive',
    calibration_claim: 'local-experimental',
    retention_posture_ref: 'posture.retention.reviewed.v1',
    training_use_posture_ref: 'posture.training.reviewed.v1',
    created_at: '2026-09-18T19:45:00.000Z',
    review_at: '2026-10-18T19:45:00.000Z',
    authority_effect: 'none',
    network_effect: 'none',
    credential_visibility: 'none',
    runtime_activation: false,
    selection_effect: 'eligibility-only',
    assurance_effect: 'none',
    ...overrides
  };
}

function taskFitQuestion() {
  const question = {
    schema: 'axiom-bounded-decision-question-schema.v0',
    version: 0,
    status: 'inert-bounded-decision-question-schema',
    question_schema_id: 'bounded.question.cognitive-route.task-fit.v1',
    question_kind: 'binary-probability',
    instructions:
      'Estimate whether this already-eligible cognitive profile is a strong semantic fit for the exact task.',
    purpose: 'cognitive-route-task-fit',
    domain: 'agent.cognitive.route.task-fit',
    state_contract_ref: COGNITIVE_ROUTE_STATE_SCHEMA,
    known_limitations: [
      'Task-fit evidence may rank already-eligible cognitive candidates but cannot create eligibility, authority, assurance, disclosure permission, spend permission, or execution permission.'
    ],
    created_at: '2026-09-18T19:46:00.000Z',
    true_meaning:
      'The cognitive profile is a strong semantic fit for the task after deterministic eligibility filtering.',
    false_meaning:
      'The cognitive profile is not a strong enough semantic fit for this task.',
    schema_digest: ZERO
  };
  question.schema_digest = computeBoundedDecisionQuestionSchemaDigest(question);
  return question;
}

function metrics(overrides = {}) {
  return {
    current: true,
    quality: 0.9,
    reliability: 0.95,
    latencyMsP95: 400,
    costMicrocents: 100,
    evidenceDigest: D,
    ...overrides
  };
}

function candidate(
  profileId,
  profileDigest,
  {
    eligible = true,
    eligibilityReason = eligible ? 'eligible' : 'policy-denied',
    routeMetrics = metrics()
  } = {}
) {
  return {
    profileId,
    profileDigest,
    eligible,
    eligibilityReason,
    metrics: routeMetrics
  };
}

function semanticEvidence(
  cognitiveCandidate,
  support,
  {
    providerConfidence = null,
    taskPurposeDigest = F,
    metricDefinitionDigest = C,
    profile = providerProfile(),
    question = taskFitQuestion()
  } = {}
) {
  const stateDigest = computeCognitiveRouteStateDigest({
    taskPurposeDigest,
    profileId: cognitiveCandidate.profileId,
    profileDigest: cognitiveCandidate.profileDigest,
    metricDefinitionDigest
  });
  const observation = normalizeBoundedDecisionProviderResult({
    observation_id: 'observation.' + cognitiveCandidate.profileId,
    state_digest: stateDigest,
    state_classification: 'confidential',
    observed_at: '2026-09-18T19:47:00.000Z',
    latency_ms: 12,
    answer: {
      kind: 'binary-probability',
      p_true: support
    },
    probability_evidence: null,
    provider_confidence: providerConfidence,
    usage_evidence: {
      input_units: 64,
      output_units: 1,
      compute_class: null,
      provider_report_ref: 'usage.cognitive-route-test.v1'
    },
    calibration_report_ref: null,
    transport_evidence_ref: 'transport.cognitive-route-test.v1'
  }, profile, question);

  return {
    profileId: cognitiveCandidate.profileId,
    profileDigest: cognitiveCandidate.profileDigest,
    observation,
    providerProfile: profile,
    questionSchema: question
  };
}

function policy(overrides = {}) {
  return {
    minimumTaskFit: 0.6,
    minimumQuality: 0.8,
    minimumReliability: 0.9,
    maximumLatencyMsP95: 1_000,
    maximumCostMicrocents: 1_000,
    priorityOrder: ['task-fit', 'quality', 'reliability', 'latency', 'cost'],
    fallbackBehavior: 'retain-eligible',
    retainCandidateBudget: 8,
    ...overrides
  };
}

function proposal({
  candidates,
  semanticEvidence: evidence,
  selectedPolicy = policy(),
  deterministicSolutionAvailable = false,
  taskPurposeDigest = F,
  metricDefinitionDigest = C
}) {
  return createCognitiveRouteProposal({
    taskPurposeDigest,
    metricDefinitionDigest,
    deterministicSolutionAvailable,
    candidates,
    semanticEvidence: evidence,
    policy: selectedPolicy
  });
}

test('lexicographic routing selects only among already-eligible candidates and creates no authority', () => {
  const primary = candidate('cognitive.primary', A, {
    routeMetrics: metrics({ costMicrocents: 400 })
  });
  const cheaper = candidate('cognitive.cheaper', B, {
    routeMetrics: metrics({ costMicrocents: 100 })
  });
  const denied = candidate('cognitive.denied', D, {
    eligible: false,
    eligibilityReason: 'locality-not-allowed',
    routeMetrics: metrics({ quality: 1, reliability: 1, latencyMsP95: 1, costMicrocents: 1 })
  });

  const result = proposal({
    candidates: [primary, cheaper, denied],
    semanticEvidence: [
      semanticEvidence(primary, 0.9),
      semanticEvidence(cheaper, 0.9),
      semanticEvidence(denied, 0.999)
    ],
    selectedPolicy: policy({
      priorityOrder: ['cost', 'task-fit', 'quality', 'reliability', 'latency']
    })
  });

  assert.equal(result.schema, COGNITIVE_ROUTE_PROPOSAL_SCHEMA);
  assert.equal(result.selection_mode, 'lexicographic');
  assert.equal(result.selected_profile_id, cheaper.profileId);
  assert.deepEqual(result.fallback_profile_ids, [primary.profileId]);
  assert.equal(
    result.withheld.find(item => item.profile_id === denied.profileId).reasons.includes(
      'deterministic-ineligible'
    ),
    true
  );
  assert.equal(
    result.validated_semantic_evidence.some(item => item.profile_id === denied.profileId),
    false
  );
  assert.equal(result.authority_effect, 'none');
  assert.equal(result.assurance_effect, 'none');
  assert.equal(result.network_effect, 'none');
  assert.equal(result.credential_visibility, 'none');
  assert.equal(result.runtime_activation, false);
  assert.equal(result.execution_effect, 'none');
  assert.equal(result.selection_effect, 'proposal-only');
  assert.equal(Object.isFrozen(result), true);
});

test('quality is a hard floor and cannot be compensated for by lower latency or cost', () => {
  const good = candidate('cognitive.good', A, {
    routeMetrics: metrics({
      quality: 0.9,
      reliability: 0.95,
      latencyMsP95: 500,
      costMicrocents: 500
    })
  });
  const cheapLowQuality = candidate('cognitive.cheap-low-quality', B, {
    routeMetrics: metrics({
      quality: 0.79,
      reliability: 0.99,
      latencyMsP95: 1,
      costMicrocents: 1
    })
  });

  const result = proposal({
    candidates: [cheapLowQuality, good],
    semanticEvidence: [
      semanticEvidence(cheapLowQuality, 0.99),
      semanticEvidence(good, 0.8)
    ],
    selectedPolicy: policy({
      priorityOrder: ['cost', 'latency', 'task-fit', 'quality', 'reliability']
    })
  });

  assert.equal(result.selected_profile_id, good.profileId);
  assert.deepEqual(
    result.withheld.find(item => item.profile_id === cheapLowQuality.profileId).reasons,
    ['quality-below-minimum']
  );
});

test('reliability latency and cost ceilings are hard filters before preference ordering', () => {
  const good = candidate('cognitive.good', A);
  const unreliable = candidate('cognitive.unreliable', B, {
    routeMetrics: metrics({ reliability: 0.89 })
  });
  const slow = candidate('cognitive.slow', D, {
    routeMetrics: metrics({ latencyMsP95: 1_001 })
  });
  const expensive = candidate('cognitive.expensive', E, {
    routeMetrics: metrics({ costMicrocents: 1_001 })
  });

  const result = proposal({
    candidates: [unreliable, slow, expensive, good],
    semanticEvidence: [
      semanticEvidence(unreliable, 0.99),
      semanticEvidence(slow, 0.99),
      semanticEvidence(expensive, 0.99),
      semanticEvidence(good, 0.7)
    ]
  });

  assert.equal(result.selected_profile_id, good.profileId);
  assert.deepEqual(
    result.withheld.find(item => item.profile_id === unreliable.profileId).reasons,
    ['reliability-below-minimum']
  );
  assert.deepEqual(
    result.withheld.find(item => item.profile_id === slow.profileId).reasons,
    ['latency-above-maximum']
  );
  assert.deepEqual(
    result.withheld.find(item => item.profile_id === expensive.profileId).reasons,
    ['cost-above-maximum']
  );
});

test('stale routing metrics cannot satisfy hard thresholds', () => {
  const stale = candidate('cognitive.stale', A, {
    routeMetrics: metrics({ current: false, quality: 1, reliability: 1, latencyMsP95: 1, costMicrocents: 1 })
  });
  const current = candidate('cognitive.current', B);

  const result = proposal({
    candidates: [stale, current],
    semanticEvidence: [
      semanticEvidence(stale, 0.999),
      semanticEvidence(current, 0.7)
    ]
  });

  assert.equal(result.selected_profile_id, current.profileId);
  assert.deepEqual(
    result.withheld.find(item => item.profile_id === stale.profileId).reasons,
    ['routing-metrics-stale']
  );
});

test('priority order changes ranking only among candidates that pass every hard gate', () => {
  const fast = candidate('cognitive.fast', A, {
    routeMetrics: metrics({ quality: 0.82, latencyMsP95: 100, costMicrocents: 500 })
  });
  const strong = candidate('cognitive.strong', B, {
    routeMetrics: metrics({ quality: 0.98, latencyMsP95: 700, costMicrocents: 100 })
  });
  const evidence = [
    semanticEvidence(fast, 0.8),
    semanticEvidence(strong, 0.8)
  ];

  const fastest = proposal({
    candidates: [fast, strong],
    semanticEvidence: evidence,
    selectedPolicy: policy({
      priorityOrder: ['latency', 'quality', 'task-fit', 'reliability', 'cost']
    })
  });
  const strongest = proposal({
    candidates: [fast, strong],
    semanticEvidence: evidence,
    selectedPolicy: policy({
      priorityOrder: ['quality', 'latency', 'task-fit', 'reliability', 'cost']
    })
  });

  assert.equal(fastest.selected_profile_id, fast.profileId);
  assert.equal(strongest.selected_profile_id, strong.profileId);
  assert.equal(fastest.authority_effect, 'none');
  assert.equal(strongest.authority_effect, 'none');
});

test('missing semantic evidence fails conservatively by retaining eligible candidates within budget', () => {
  const one = candidate('cognitive.one', A);
  const two = candidate('cognitive.two', B);

  const result = proposal({
    candidates: [one, two],
    semanticEvidence: [semanticEvidence(one, 0.8)]
  });

  assert.equal(result.selection_mode, 'fallback-retain-eligible');
  assert.equal(result.unresolved, true);
  assert.equal(result.selected_profile_id, null);
  assert.deepEqual(result.retained_profile_ids, [one.profileId, two.profileId]);
  assert.deepEqual(result.uncertainty_reasons, ['missing-semantic-evidence']);
  assert.equal(result.authority_effect, 'none');
  assert.equal(result.execution_effect, 'none');
});

test('mismatched task/profile semantic evidence is invalid and cannot silently route', () => {
  const one = candidate('cognitive.one', A);
  const two = candidate('cognitive.two', B);

  const wrong = semanticEvidence(two, 0.99, {
    taskPurposeDigest: A
  });

  const result = proposal({
    candidates: [one, two],
    semanticEvidence: [
      semanticEvidence(one, 0.8),
      wrong
    ]
  });

  assert.equal(result.selection_mode, 'fallback-retain-eligible');
  assert.equal(result.unresolved, true);
  assert.deepEqual(result.uncertainty_reasons, ['invalid-semantic-evidence']);
});

test('provider confidence cannot change routing support or create assurance', () => {
  const primary = candidate('cognitive.primary', A);
  const secondary = candidate('cognitive.secondary', B);

  const lowConfidence = proposal({
    candidates: [primary, secondary],
    semanticEvidence: [
      semanticEvidence(primary, 0.9, { providerConfidence: 0.01 }),
      semanticEvidence(secondary, 0.8, { providerConfidence: 0.99 })
    ]
  });
  const flippedConfidence = proposal({
    candidates: [primary, secondary],
    semanticEvidence: [
      semanticEvidence(primary, 0.9, { providerConfidence: 0.99 }),
      semanticEvidence(secondary, 0.8, { providerConfidence: 0.01 })
    ]
  });

  assert.equal(lowConfidence.selected_profile_id, primary.profileId);
  assert.equal(flippedConfidence.selected_profile_id, primary.profileId);
  assert.equal(lowConfidence.assurance_effect, 'none');
  assert.equal(flippedConfidence.assurance_effect, 'none');
});

test('no deterministically eligible candidate returns an explicit no-route state', () => {
  const denied = candidate('cognitive.denied', A, {
    eligible: false,
    eligibilityReason: 'disclosure-ineligible'
  });

  const result = proposal({
    candidates: [denied],
    semanticEvidence: [semanticEvidence(denied, 1)]
  });

  assert.equal(result.selection_mode, 'no-eligible-candidates');
  assert.equal(result.recommended_action, 'escalate');
  assert.equal(result.selected_profile_id, null);
  assert.deepEqual(result.fallback_profile_ids, []);
  assert.equal(result.unresolved, true);
});

test('deterministic solution bypasses semantic cognitive routing', () => {
  const one = candidate('cognitive.one', A);

  const result = proposal({
    candidates: [one],
    semanticEvidence: [semanticEvidence(one, 1)],
    deterministicSolutionAvailable: true
  });

  assert.equal(result.selection_mode, 'deterministic-not-needed');
  assert.equal(result.recommended_action, 'skip-cognitive-routing');
  assert.equal(result.selected_profile_id, null);
  assert.equal(result.validated_semantic_evidence.length, 0);
  assert.equal(result.authority_effect, 'none');
});

test('route proposal validation is bound to trusted inputs and rejects tampering', () => {
  const one = candidate('cognitive.one', A);
  const two = candidate('cognitive.two', B);
  const input = {
    taskPurposeDigest: F,
    metricDefinitionDigest: C,
    deterministicSolutionAvailable: false,
    candidates: [one, two],
    semanticEvidence: [
      semanticEvidence(one, 0.9),
      semanticEvidence(two, 0.8)
    ],
    policy: policy()
  };

  const created = createCognitiveRouteProposal(input);
  assert.equal(validateCognitiveRouteProposal(created, input).trusted_input_match, true);
  assert.equal(verifyCognitiveRouteProposal(created, input).valid, true);

  const tampered = structuredClone(created);
  tampered.selected_profile_id = two.profileId;
  assert.throws(
    () => validateCognitiveRouteProposal(tampered, input),
    /digest|trusted|inconsistent/i
  );
});

test('router source remains a pure offline proposal layer', () => {
  const source = readFileSync(
    new URL('../src/lib/cognitive-auto-routing.mjs', import.meta.url),
    'utf8'
  );

  for (const forbidden of [
    "from 'node:http",
    "from 'node:https",
    "from 'node:net",
    "from 'node:tls",
    "from 'node:child_process",
    'fetch(',
    'process.env',
    'TYPESAFE_API_KEY',
    'api.typesafe.ai',
    'capabilities.json',
    'Gateway',
    'Hypervisor',
    'Sandbox',
    'Grid'
  ]) {
    assert.equal(source.includes(forbidden), false, 'source must not contain ' + forbidden);
  }
});
