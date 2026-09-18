import { digestObject, ValidationError } from './canonical.mjs';
import {
  BOUNDED_DECISION_QUESTION_SCHEMA,
  computeBoundedDecisionQuestionSchemaDigest,
  validateBoundedDecisionQuestionSchema
} from './bounded-decision-question-schema.mjs';
import {
  validateBoundedDecisionObservation
} from './bounded-decision-observation.mjs';
import {
  projectTypeSafeSystemOneQuestion
} from './bounded-decision-typesafe-system-one-adapter.mjs';
import {
  THREAT_OBSERVATION_SCHEMA,
  contractDigest,
  verifyThreatObservation
} from './threat-intelligence-contracts.mjs';

export const ADVERSARIAL_RELEASE_SWARM_SHADOW_PLAN_SCHEMA =
  'axiom-adversarial-release-swarm-shadow-plan.v0';
export const ADVERSARIAL_RELEASE_SWARM_ASSESSMENT_SCHEMA =
  'axiom-adversarial-release-swarm-assessment.v0';
export const ADVERSARIAL_RELEASE_SWARM_STATE_SCHEMA =
  'axiom-adversarial-release-swarm-state.v0';

const PLAN_STATUS = 'shadow-evidence-only';
const TARGET_CATALOG_SCHEMA = 'axiom-red-team-target-catalog.v1';
const QUESTION_STATUS = 'inert-bounded-decision-question-schema';
const ZERO_SHA256 = '0'.repeat(64);
const SHA40_RE = /^[0-9a-f]{40}$/;
const DIGEST_RE = /^[0-9a-f]{64}$/;
const IDENTIFIER_RE = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,191}$/;
const TARGET_ID_RE = IDENTIFIER_RE;
const SAFE_ENVIRONMENTS = new Set([
  'repository-owned',
  'contributor-owned',
  'explicitly-disposable-authorized'
]);
const QUESTION_ROLES = Object.freeze([
  'evidence-sufficiency',
  'boundary-violation'
]);
const ROUTE_PRIORITY = Object.freeze([
  'needs-reproduction',
  'review',
  'inconclusive',
  'no-signal'
]);

const CANDIDATE_FIELDS = Object.freeze(['commit_sha', 'supported_build']);
const SCENARIO_FIELDS = Object.freeze([
  'scenario_id',
  'environment_ownership',
  'synthetic_data_only',
  'contains_secrets_or_credentials',
  'contains_private_data',
  'third_party_testing_performed',
  'expected_boundary',
  'observed_result',
  'trace_summary',
  'evidence_refs',
  'target_ids'
]);
const STATE_FIELDS = Object.freeze([
  'schema',
  'version',
  'scenario_id',
  'candidate_commit',
  'supported_build',
  'target_id',
  'review_scope',
  'claim_boundary',
  'challenge_question',
  'expected_boundary',
  'observed_result',
  'trace_summary',
  'evidence_refs'
]);
const QUESTION_ENTRY_FIELDS = Object.freeze([
  'role',
  'question_schema',
  'typesafe_projection'
]);
const PLAN_ITEM_FIELDS = Object.freeze([
  'target_id',
  'review_scope',
  'state',
  'state_digest',
  'questions'
]);
const PLAN_FIELDS = Object.freeze([
  'schema',
  'version',
  'status',
  'created_at',
  'candidate_commit',
  'supported_build',
  'scenario_id',
  'environment_ownership',
  'target_catalog_ref',
  'target_catalog_digest',
  'canonical_finding_lifecycle',
  'contribution_result_contract',
  'threat_observation_contract',
  'mode',
  'provider_invocation',
  'items',
  'authority_effect',
  'assurance_effect',
  'network_effect',
  'credential_visibility',
  'runtime_activation',
  'release_gate_effect'
]);
const PROVIDER_SIGNAL_FIELDS = Object.freeze([
  'provider_profile_id',
  'route',
  'evidence_sufficiency_p_true',
  'violation_signal_p_true'
]);
const ASSESSMENT_FIELDS = Object.freeze([
  'schema',
  'version',
  'status',
  'plan_digest',
  'candidate_commit',
  'scenario_id',
  'target_id',
  'threshold_policy_ref',
  'thresholds',
  'shadow_route',
  'provider_signals',
  'disagreement',
  'evidence_bindings',
  'canonical_finding_disposition',
  'release_safe_claimed',
  'reproduced_claimed',
  'authority_effect',
  'assurance_effect',
  'network_effect',
  'runtime_activation',
  'release_gate_effect'
]);
const THRESHOLD_FIELDS = Object.freeze([
  'policy_ref',
  'minimum_evidence_sufficiency',
  'review_signal_probability',
  'reproduction_signal_probability'
]);

export function compileAdversarialReleaseSwarmShadowPlan({
  targetCatalog,
  candidate,
  scenario,
  createdAt
}) {
  validateTargetCatalog(targetCatalog);
  validateCandidate(candidate);
  validateScenario(scenario);
  requireTimestamp(createdAt, 'createdAt');

  if (targetCatalog.supported_build !== candidate.supported_build) {
    throw new ValidationError('candidate supported build does not match the red-team target catalog');
  }

  const targetById = new Map(targetCatalog.targets.map(target => [target.id, target]));
  const items = scenario.target_ids.map(targetId => {
    const target = targetById.get(targetId);
    if (!target) {
      throw new ValidationError(`unknown red-team target id ${targetId}`);
    }

    const state = deepFreeze({
      schema: ADVERSARIAL_RELEASE_SWARM_STATE_SCHEMA,
      version: 0,
      scenario_id: scenario.scenario_id,
      candidate_commit: candidate.commit_sha,
      supported_build: candidate.supported_build,
      target_id: target.id,
      review_scope: target.review_scope,
      claim_boundary: target.claim_boundary,
      challenge_question: target.challenge_question,
      expected_boundary: scenario.expected_boundary,
      observed_result: scenario.observed_result,
      trace_summary: scenario.trace_summary,
      evidence_refs: [...scenario.evidence_refs]
    });
    const stateDigest = digestObject(state);
    const questionSchemas = [
      createQuestionSchema(target, 'evidence-sufficiency', createdAt),
      createQuestionSchema(target, 'boundary-violation', createdAt)
    ];

    return deepFreeze({
      target_id: target.id,
      review_scope: target.review_scope,
      state,
      state_digest: stateDigest,
      questions: questionSchemas.map((questionSchema, index) => deepFreeze({
        role: QUESTION_ROLES[index],
        question_schema: questionSchema,
        typesafe_projection: projectTypeSafeSystemOneQuestion(questionSchema)
      }))
    });
  });

  return validateAdversarialReleaseSwarmShadowPlan({
    schema: ADVERSARIAL_RELEASE_SWARM_SHADOW_PLAN_SCHEMA,
    version: 0,
    status: PLAN_STATUS,
    created_at: createdAt,
    candidate_commit: candidate.commit_sha,
    supported_build: candidate.supported_build,
    scenario_id: scenario.scenario_id,
    environment_ownership: scenario.environment_ownership,
    target_catalog_ref: 'RED-TEAM-TARGETS.json',
    target_catalog_digest: digestObject(targetCatalog),
    canonical_finding_lifecycle: 'RED-TEAM-TRIAGE.txt',
    contribution_result_contract: 'agent-readiness/CONTRIBUTION-RESULT.schema.json',
    threat_observation_contract: THREAT_OBSERVATION_SCHEMA,
    mode: 'shadow-only',
    provider_invocation: 'not-implemented-here',
    items,
    authority_effect: 'none',
    assurance_effect: 'none',
    network_effect: 'none',
    credential_visibility: 'none',
    runtime_activation: false,
    release_gate_effect: 'none'
  });
}

export function validateAdversarialReleaseSwarmShadowPlan(plan) {
  requireExactFields(plan, PLAN_FIELDS, 'ARS shadow plan');
  if (plan.schema !== ADVERSARIAL_RELEASE_SWARM_SHADOW_PLAN_SCHEMA) {
    throw new ValidationError('ARS shadow plan schema is invalid');
  }
  if (plan.version !== 0 || plan.status !== PLAN_STATUS) {
    throw new ValidationError('ARS shadow plan version or status is invalid');
  }
  requireTimestamp(plan.created_at, 'ARS shadow plan.created_at');
  requireSha40(plan.candidate_commit, 'ARS shadow plan.candidate_commit');
  requireString(plan.supported_build, 'ARS shadow plan.supported_build', 128);
  requireIdentifier(plan.scenario_id, 'ARS shadow plan.scenario_id');
  requireEnum(plan.environment_ownership, SAFE_ENVIRONMENTS, 'ARS shadow plan.environment_ownership');

  requireEqual(plan.target_catalog_ref, 'RED-TEAM-TARGETS.json', 'target_catalog_ref');
  requireDigest(plan.target_catalog_digest, 'target_catalog_digest');
  requireEqual(plan.canonical_finding_lifecycle, 'RED-TEAM-TRIAGE.txt', 'canonical_finding_lifecycle');
  requireEqual(
    plan.contribution_result_contract,
    'agent-readiness/CONTRIBUTION-RESULT.schema.json',
    'contribution_result_contract'
  );
  requireEqual(plan.threat_observation_contract, THREAT_OBSERVATION_SCHEMA, 'threat_observation_contract');
  requireEqual(plan.mode, 'shadow-only', 'mode');
  requireEqual(plan.provider_invocation, 'not-implemented-here', 'provider_invocation');
  requireEqual(plan.authority_effect, 'none', 'authority_effect');
  requireEqual(plan.assurance_effect, 'none', 'assurance_effect');
  requireEqual(plan.network_effect, 'none', 'network_effect');
  requireEqual(plan.credential_visibility, 'none', 'credential_visibility');
  requireEqual(plan.runtime_activation, false, 'runtime_activation');
  requireEqual(plan.release_gate_effect, 'none', 'release_gate_effect');

  if (!Array.isArray(plan.items) || plan.items.length < 1 || plan.items.length > 64) {
    throw new ValidationError('ARS shadow plan.items must contain 1-64 target items');
  }
  const targetIds = new Set();
  for (const [index, item] of plan.items.entries()) {
    validatePlanItem(item, plan, index);
    if (targetIds.has(item.target_id)) {
      throw new ValidationError('ARS shadow plan contains duplicate target ids');
    }
    targetIds.add(item.target_id);
  }

  return deepFreeze(plan);
}

export function assessAdversarialReleaseSwarmSignal({
  plan,
  targetId,
  observations,
  providerProfiles,
  thresholds
}) {
  validateAdversarialReleaseSwarmShadowPlan(plan);
  requireTargetId(targetId, 'targetId');
  validateThresholds(thresholds);

  if (!Array.isArray(observations) || !Array.isArray(providerProfiles)) {
    throw new ValidationError('observations and providerProfiles must be arrays');
  }
  if (observations.length > 32 || providerProfiles.length > 16) {
    throw new ValidationError('ARS assessment input exceeds bounded collection limits');
  }

  const item = plan.items.find(entry => entry.target_id === targetId);
  if (!item) throw new ValidationError(`target ${targetId} is not present in the ARS shadow plan`);

  const questionById = new Map(
    item.questions.map(entry => [entry.question_schema.question_schema_id, entry])
  );
  const providerById = new Map();
  for (const profile of providerProfiles) {
    if (!profile || typeof profile.profile_id !== 'string') {
      throw new ValidationError('provider profile is missing profile_id');
    }
    if (providerById.has(profile.profile_id)) {
      throw new ValidationError('providerProfiles contains duplicate profile_id');
    }
    providerById.set(profile.profile_id, profile);
  }

  const grouped = new Map();
  const evidenceBindings = [];
  for (const observation of observations) {
    const questionEntry = questionById.get(observation?.question_schema_id);
    if (!questionEntry) {
      throw new ValidationError('ARS assessment received an observation for an unrelated question schema');
    }
    const providerProfile = providerById.get(observation.provider_profile_id);
    if (!providerProfile) {
      throw new ValidationError('ARS assessment observation provider profile is missing');
    }
    validateBoundedDecisionObservation(
      observation,
      providerProfile,
      questionEntry.question_schema
    );
    if (observation.state_digest !== item.state_digest) {
      throw new ValidationError('ARS assessment observation state digest mismatch');
    }
    if (observation.answer.kind !== 'binary-probability') {
      throw new ValidationError('ARS assessment requires binary-probability observations');
    }

    let providerGroup = grouped.get(observation.provider_profile_id);
    if (!providerGroup) {
      providerGroup = new Map();
      grouped.set(observation.provider_profile_id, providerGroup);
    }
    if (providerGroup.has(questionEntry.role)) {
      throw new ValidationError('ARS assessment has duplicate provider observation for a question role');
    }
    providerGroup.set(questionEntry.role, observation);
    evidenceBindings.push(`sha256:${observation.observation_digest}`);
  }

  const providerSignals = [];
  for (const [providerProfileId, answers] of grouped.entries()) {
    const sufficiency = answers.get('evidence-sufficiency');
    const violation = answers.get('boundary-violation');
    if (!sufficiency || !violation) {
      providerSignals.push(deepFreeze({
        provider_profile_id: providerProfileId,
        route: 'inconclusive',
        evidence_sufficiency_p_true: sufficiency?.answer.p_true ?? null,
        violation_signal_p_true: violation?.answer.p_true ?? null
      }));
      continue;
    }

    const sufficiencyProbability = sufficiency.answer.p_true;
    const violationProbability = violation.answer.p_true;
    const signal = {
      provider_profile_id: providerProfileId,
      route: 'no-signal',
      evidence_sufficiency_p_true: sufficiencyProbability,
      violation_signal_p_true: violationProbability
    };
    signal.route = routeProviderSignal(signal, thresholds);
    providerSignals.push(deepFreeze(signal));
  }

  providerSignals.sort((left, right) =>
    left.provider_profile_id.localeCompare(right.provider_profile_id)
  );

  const combinedRoute = combineRoutes(providerSignals.map(signal => signal.route));
  const distinctRoutes = new Set(providerSignals.map(signal => signal.route));

  return validateAdversarialReleaseSwarmAssessment({
    schema: ADVERSARIAL_RELEASE_SWARM_ASSESSMENT_SCHEMA,
    version: 0,
    status: 'shadow-screening-only',
    plan_digest: digestObject(plan),
    candidate_commit: plan.candidate_commit,
    scenario_id: plan.scenario_id,
    target_id: targetId,
    threshold_policy_ref: thresholds.policy_ref,
    thresholds: { ...thresholds },
    shadow_route: combinedRoute,
    provider_signals: providerSignals,
    disagreement: distinctRoutes.size > 1,
    evidence_bindings: [...new Set(evidenceBindings)].sort(),
    canonical_finding_disposition: null,
    release_safe_claimed: false,
    reproduced_claimed: false,
    authority_effect: 'none',
    assurance_effect: 'none',
    network_effect: 'none',
    runtime_activation: false,
    release_gate_effect: 'none'
  }, plan, targetId);
}

export function validateAdversarialReleaseSwarmAssessment(assessment, plan, targetId = assessment?.target_id) {
  validateAdversarialReleaseSwarmShadowPlan(plan);
  requireTargetId(targetId, 'targetId');
  requireExactFields(assessment, ASSESSMENT_FIELDS, 'ARS assessment');
  requireEqual(assessment.schema, ADVERSARIAL_RELEASE_SWARM_ASSESSMENT_SCHEMA, 'ARS assessment.schema');
  requireEqual(assessment.version, 0, 'ARS assessment.version');
  requireEqual(assessment.status, 'shadow-screening-only', 'ARS assessment.status');
  requireDigest(assessment.plan_digest, 'ARS assessment.plan_digest');
  requireEqual(assessment.plan_digest, digestObject(plan), 'ARS assessment.plan_digest');
  requireEqual(assessment.candidate_commit, plan.candidate_commit, 'ARS assessment.candidate_commit');
  requireEqual(assessment.scenario_id, plan.scenario_id, 'ARS assessment.scenario_id');
  requireEqual(assessment.target_id, targetId, 'ARS assessment.target_id');
  if (!plan.items.some(item => item.target_id === targetId)) {
    throw new ValidationError(`target ${targetId} is not present in the ARS shadow plan`);
  }
  requireString(assessment.threshold_policy_ref, 'ARS assessment.threshold_policy_ref', 512);
  validateThresholds(assessment.thresholds);
  requireEqual(
    assessment.threshold_policy_ref,
    assessment.thresholds.policy_ref,
    'ARS assessment.threshold_policy_ref'
  );
  requireRoute(assessment.shadow_route, 'ARS assessment.shadow_route');

  if (!Array.isArray(assessment.provider_signals) || assessment.provider_signals.length > 16) {
    throw new ValidationError('ARS assessment.provider_signals must contain 0-16 entries');
  }
  const providerIds = new Set();
  for (const [index, signal] of assessment.provider_signals.entries()) {
    requireExactFields(signal, PROVIDER_SIGNAL_FIELDS, `ARS assessment.provider_signals[${index}]`);
    requireIdentifier(signal.provider_profile_id, `ARS assessment.provider_signals[${index}].provider_profile_id`);
    if (providerIds.has(signal.provider_profile_id)) {
      throw new ValidationError('ARS assessment provider_signals contains duplicate provider_profile_id');
    }
    providerIds.add(signal.provider_profile_id);
    requireRoute(signal.route, `ARS assessment.provider_signals[${index}].route`);
    requireNullableProbability(
      signal.evidence_sufficiency_p_true,
      `ARS assessment.provider_signals[${index}].evidence_sufficiency_p_true`
    );
    requireNullableProbability(
      signal.violation_signal_p_true,
      `ARS assessment.provider_signals[${index}].violation_signal_p_true`
    );
    requireEqual(
      signal.route,
      routeProviderSignal(signal, assessment.thresholds),
      `ARS assessment.provider_signals[${index}].route`
    );
  }

  const expectedRoute = combineRoutes(assessment.provider_signals.map(signal => signal.route));
  requireEqual(assessment.shadow_route, expectedRoute, 'ARS assessment.shadow_route');
  requireBoolean(assessment.disagreement, 'ARS assessment.disagreement');
  requireEqual(
    assessment.disagreement,
    new Set(assessment.provider_signals.map(signal => signal.route)).size > 1,
    'ARS assessment.disagreement'
  );
  requireUniqueStrings(assessment.evidence_bindings, 'ARS assessment.evidence_bindings', {
    max: 32,
    itemMax: 71,
    validator: requireSha256Ref
  });
  requireEqual(assessment.canonical_finding_disposition, null, 'ARS assessment.canonical_finding_disposition');
  requireEqual(assessment.release_safe_claimed, false, 'ARS assessment.release_safe_claimed');
  requireEqual(assessment.reproduced_claimed, false, 'ARS assessment.reproduced_claimed');
  requireEqual(assessment.authority_effect, 'none', 'ARS assessment.authority_effect');
  requireEqual(assessment.assurance_effect, 'none', 'ARS assessment.assurance_effect');
  requireEqual(assessment.network_effect, 'none', 'ARS assessment.network_effect');
  requireEqual(assessment.runtime_activation, false, 'ARS assessment.runtime_activation');
  requireEqual(assessment.release_gate_effect, 'none', 'ARS assessment.release_gate_effect');
  return deepFreeze(assessment);
}

export function createAdversarialReleaseThreatObservationCandidate({
  plan,
  assessment,
  targetId,
  retrievedAt,
  reviewAt
}) {
  validateAdversarialReleaseSwarmShadowPlan(plan);
  requireTimestamp(retrievedAt, 'retrievedAt');
  requireTimestamp(reviewAt, 'reviewAt');
  if (Date.parse(reviewAt) <= Date.parse(retrievedAt)) {
    throw new ValidationError('reviewAt must be later than retrievedAt');
  }
  validateAdversarialReleaseSwarmAssessment(assessment, plan, targetId);
  if (!['review', 'needs-reproduction'].includes(assessment.shadow_route)) {
    throw new ValidationError('only review or needs-reproduction signals can create a threat observation candidate');
  }
  if (assessment.release_safe_claimed !== false || assessment.reproduced_claimed !== false) {
    throw new ValidationError('ARS assessment may not claim release safety or reproduction');
  }

  const item = plan.items.find(entry => entry.target_id === targetId);
  if (!item) throw new ValidationError(`target ${targetId} is not present in the ARS shadow plan`);
  if (!Array.isArray(assessment.evidence_bindings) || assessment.evidence_bindings.length < 1) {
    throw new ValidationError('ARS threat observation candidate requires bounded-decision evidence bindings');
  }

  const observation = {
    schema: THREAT_OBSERVATION_SCHEMA,
    observation_id: `ars:${plan.scenario_id}:${targetId}:${plan.candidate_commit.slice(0, 12)}`,
    source_class: 'axiom_lab_finding',
    source_identity_or_locator: `ars-shadow:${plan.scenario_id}:${targetId}`,
    source_version_or_published_at: plan.candidate_commit,
    retrieved_at: retrievedAt,
    content_digest: `sha256:${item.state_digest}`,
    claim_class: 'adversarial_release_signal',
    summary: `Shadow semantic screening signaled ${assessment.shadow_route} for ${targetId} on ${plan.candidate_commit}. This is model-screened evidence only and is not a reproduced finding or release-safety result.`,
    indicators: [targetId, `shadow-route:${assessment.shadow_route}`],
    affected_technology_or_boundary: [item.review_scope],
    reported_preconditions: [item.state.expected_boundary],
    reported_effects: [item.state.observed_result],
    source_confidence: 'screening_only',
    collector_confidence: assessment.shadow_route === 'needs-reproduction'
      ? 'reproduction_requested'
      : 'review_requested',
    sensitivity_class: 'synthetic_public_safe',
    raw_content_reference: null,
    provenance_chain: [...assessment.evidence_bindings],
    supersedes_observation_ids: [],
    contradicts_observation_ids: [],
    lifecycle_state: 'current',
    expiry_or_review_at: reviewAt,
    observation_digest: `sha256:${ZERO_SHA256}`
  };
  observation.observation_digest = contractDigest(observation, 'observation_digest');
  return deepFreeze(verifyThreatObservation(observation));
}

function createQuestionSchema(target, role, createdAt) {
  const roleToken = role === 'evidence-sufficiency' ? 'evidence_sufficient' : 'boundary_violation';
  const targetToken = target.id.toLowerCase().replace(/-/g, '_');
  const common = {
    schema: BOUNDED_DECISION_QUESTION_SCHEMA,
    version: 0,
    status: QUESTION_STATUS,
    question_schema_id: `ars.${targetToken}.${roleToken}.v0`,
    question_kind: 'binary-probability',
    purpose: role === 'evidence-sufficiency'
      ? 'screen whether a sanitized adversarial release trace contains enough evidence for semantic review'
      : 'screen a sanitized adversarial release trace for a plausible red-team claim-boundary contradiction',
    domain: 'axiom-adversarial-release-swarm',
    state_contract_ref: ADVERSARIAL_RELEASE_SWARM_STATE_SCHEMA,
    known_limitations: [
      'The result is semantic screening evidence only and cannot establish reproduction, exploitability, severity, release safety, authorization, assurance, merge readiness, deployment readiness, or production promotion.',
      'The state is required to be synthetic or explicitly disposable and must not contain secrets, credentials, private user data, or third-party testing evidence.'
    ],
    created_at: createdAt,
    schema_digest: ZERO_SHA256
  };

  const question = role === 'evidence-sufficiency'
    ? {
        ...common,
        instructions: 'Judge whether the supplied state contains enough concrete, internally coherent evidence to evaluate the declared `claim_boundary` against `expected_boundary`, `observed_result`, and `trace_summary`. Missing, contradictory, or merely speculative trace material should reduce the probability of true. Do not infer release safety from insufficient evidence.',
        true_meaning: 'The supplied sanitized trace contains enough concrete evidence for a semantic reviewer to assess whether the declared red-team claim boundary may have been contradicted.',
        false_meaning: 'The supplied sanitized trace is missing, contradictory, too speculative, or otherwise insufficient to assess that claim boundary.'
      }
    : {
        ...common,
        instructions: 'Judge whether `observed_result` and `trace_summary`, interpreted only within the supplied `claim_boundary` and `challenge_question`, support a plausible contradiction of that red-team boundary. This is a screening signal only. Do not infer severity, exploitability, authorization, or a reproduced vulnerability. Missing evidence should lower the probability of true rather than be treated as proof that the release is safe.',
        true_meaning: 'The supplied sanitized trace plausibly contradicts the declared red-team claim boundary and warrants review or fresh reproduction.',
        false_meaning: 'The supplied sanitized trace does not provide a plausible contradiction of the declared red-team claim boundary.'
      };

  question.schema_digest = computeBoundedDecisionQuestionSchemaDigest(question);
  validateBoundedDecisionQuestionSchema(question);
  return deepFreeze(question);
}

function validateTargetCatalog(catalog) {
  requirePlain(catalog, 'red-team target catalog');
  if (catalog.schema !== TARGET_CATALOG_SCHEMA) {
    throw new ValidationError('red-team target catalog schema is invalid');
  }
  requireString(catalog.supported_build, 'red-team target catalog.supported_build', 128);
  if (!Array.isArray(catalog.targets) || catalog.targets.length < 1 || catalog.targets.length > 128) {
    throw new ValidationError('red-team target catalog.targets must contain 1-128 targets');
  }
  const ids = new Set();
  for (const target of catalog.targets) {
    requirePlain(target, 'red-team target');
    requireTargetId(target.id, 'red-team target.id');
    requireString(target.review_scope, 'red-team target.review_scope', 256);
    requireString(target.claim_boundary, 'red-team target.claim_boundary', 4096);
    requireString(target.challenge_question, 'red-team target.challenge_question', 4096);
    if (ids.has(target.id)) throw new ValidationError('red-team target catalog contains duplicate target ids');
    ids.add(target.id);
  }
}

function validateCandidate(candidate) {
  requireExactFields(candidate, CANDIDATE_FIELDS, 'ARS candidate');
  requireSha40(candidate.commit_sha, 'ARS candidate.commit_sha');
  requireString(candidate.supported_build, 'ARS candidate.supported_build', 128);
}

function validateScenario(scenario) {
  requireExactFields(scenario, SCENARIO_FIELDS, 'ARS scenario');
  requireIdentifier(scenario.scenario_id, 'ARS scenario.scenario_id');
  requireEnum(scenario.environment_ownership, SAFE_ENVIRONMENTS, 'ARS scenario.environment_ownership');
  requireEqual(scenario.synthetic_data_only, true, 'ARS scenario.synthetic_data_only');
  requireEqual(scenario.contains_secrets_or_credentials, false, 'ARS scenario.contains_secrets_or_credentials');
  requireEqual(scenario.contains_private_data, false, 'ARS scenario.contains_private_data');
  requireEqual(scenario.third_party_testing_performed, false, 'ARS scenario.third_party_testing_performed');
  requireString(scenario.expected_boundary, 'ARS scenario.expected_boundary', 1800);
  requireString(scenario.observed_result, 'ARS scenario.observed_result', 1800);
  requireString(scenario.trace_summary, 'ARS scenario.trace_summary', 8192);
  requireUniqueStrings(scenario.evidence_refs, 'ARS scenario.evidence_refs', { max: 32, itemMax: 1024 });
  requireUniqueStrings(scenario.target_ids, 'ARS scenario.target_ids', {
    min: 1,
    max: 64,
    itemMax: 192,
    validator: requireTargetId
  });
}

function validatePlanItem(item, plan, index) {
  requireExactFields(item, PLAN_ITEM_FIELDS, `ARS shadow plan.items[${index}]`);
  requireTargetId(item.target_id, `ARS shadow plan.items[${index}].target_id`);
  requireString(item.review_scope, `ARS shadow plan.items[${index}].review_scope`, 256);
  requireExactFields(item.state, STATE_FIELDS, `ARS shadow plan.items[${index}].state`);
  if (item.state.schema !== ADVERSARIAL_RELEASE_SWARM_STATE_SCHEMA || item.state.version !== 0) {
    throw new ValidationError('ARS state schema or version is invalid');
  }
  requireEqual(item.state.scenario_id, plan.scenario_id, 'ARS state.scenario_id');
  requireEqual(item.state.candidate_commit, plan.candidate_commit, 'ARS state.candidate_commit');
  requireEqual(item.state.supported_build, plan.supported_build, 'ARS state.supported_build');
  requireEqual(item.state.target_id, item.target_id, 'ARS state.target_id');
  requireEqual(item.state.review_scope, item.review_scope, 'ARS state.review_scope');
  requireString(item.state.claim_boundary, 'ARS state.claim_boundary', 4096);
  requireString(item.state.challenge_question, 'ARS state.challenge_question', 4096);
  requireString(item.state.expected_boundary, 'ARS state.expected_boundary', 1800);
  requireString(item.state.observed_result, 'ARS state.observed_result', 1800);
  requireString(item.state.trace_summary, 'ARS state.trace_summary', 8192);
  requireUniqueStrings(item.state.evidence_refs, 'ARS state.evidence_refs', { max: 32, itemMax: 1024 });
  requireDigest(item.state_digest, 'ARS state_digest');
  if (digestObject(item.state) !== item.state_digest) {
    throw new ValidationError('ARS state digest mismatch');
  }

  if (!Array.isArray(item.questions) || item.questions.length !== QUESTION_ROLES.length) {
    throw new ValidationError('ARS target item must contain exactly the two shadow question roles');
  }
  const seenRoles = new Set();
  for (const entry of item.questions) {
    requireExactFields(entry, QUESTION_ENTRY_FIELDS, 'ARS question entry');
    if (!QUESTION_ROLES.includes(entry.role) || seenRoles.has(entry.role)) {
      throw new ValidationError('ARS question role is invalid or duplicated');
    }
    seenRoles.add(entry.role);
    validateBoundedDecisionQuestionSchema(entry.question_schema);
    const expectedProjection = projectTypeSafeSystemOneQuestion(entry.question_schema);
    if (JSON.stringify(expectedProjection) !== JSON.stringify(entry.typesafe_projection)) {
      throw new ValidationError('ARS TypeSafe question projection does not match the bounded question schema');
    }
  }
}

function validateThresholds(thresholds) {
  requireExactFields(thresholds, THRESHOLD_FIELDS, 'ARS thresholds');
  requireString(thresholds.policy_ref, 'ARS thresholds.policy_ref', 512);
  requireProbability(thresholds.minimum_evidence_sufficiency, 'minimum_evidence_sufficiency');
  requireProbability(thresholds.review_signal_probability, 'review_signal_probability');
  requireProbability(thresholds.reproduction_signal_probability, 'reproduction_signal_probability');
  if (thresholds.review_signal_probability > thresholds.reproduction_signal_probability) {
    throw new ValidationError('ARS review signal threshold cannot exceed reproduction signal threshold');
  }
}

function routeProviderSignal(signal, thresholds) {
  const sufficiency = signal.evidence_sufficiency_p_true;
  const violation = signal.violation_signal_p_true;
  if (sufficiency === null || violation === null) return 'inconclusive';
  if (sufficiency < thresholds.minimum_evidence_sufficiency) return 'inconclusive';
  if (violation >= thresholds.reproduction_signal_probability) return 'needs-reproduction';
  if (violation >= thresholds.review_signal_probability) return 'review';
  return 'no-signal';
}

function combineRoutes(routes) {
  if (!routes.length) return 'inconclusive';
  for (const route of ROUTE_PRIORITY) {
    if (routes.includes(route)) return route;
  }
  return 'inconclusive';
}

function requireExactFields(value, fields, name) {
  requirePlain(value, name);
  const allowed = new Set(fields);
  for (const field of fields) {
    if (!Object.hasOwn(value, field)) {
      throw new ValidationError(`${name} is missing required field ${field}`);
    }
  }
  for (const field of Object.keys(value)) {
    if (!allowed.has(field)) {
      throw new ValidationError(`${name} contains unknown field ${field}`);
    }
  }
}

function requirePlain(value, name) {
  if (
    value === null
    || typeof value !== 'object'
    || Array.isArray(value)
    || (Object.getPrototypeOf(value) !== Object.prototype
      && Object.getPrototypeOf(value) !== null)
  ) {
    throw new ValidationError(`${name} must be a plain object`);
  }
  return value;
}

function requireString(value, name, max) {
  if (typeof value !== 'string' || value.length < 1 || value.length > max) {
    throw new ValidationError(`${name} must be a bounded non-empty string`);
  }
  return value;
}

function requireIdentifier(value, name) {
  requireString(value, name, 192);
  if (!IDENTIFIER_RE.test(value)) throw new ValidationError(`${name} is invalid`);
  return value;
}


function requireTargetId(value, name) {
  requireString(value, name, 192);
  if (!TARGET_ID_RE.test(value)) throw new ValidationError(`${name} is invalid`);
  return value;
}

function requireSha256Ref(value, name) {
  requireString(value, name, 71);
  if (!/^sha256:[0-9a-f]{64}$/.test(value)) {
    throw new ValidationError(`${name} must be a sha256 reference`);
  }
  return value;
}

function requireNullableProbability(value, name) {
  if (value === null) return null;
  return requireProbability(value, name);
}

function requireBoolean(value, name) {
  if (typeof value !== 'boolean') throw new ValidationError(`${name} must be boolean`);
  return value;
}

function requireRoute(value, name) {
  if (!ROUTE_PRIORITY.includes(value)) throw new ValidationError(`${name} is invalid`);
  return value;
}

function requireSha40(value, name) {
  if (typeof value !== 'string' || !SHA40_RE.test(value)) {
    throw new ValidationError(`${name} must be a lowercase 40-hex commit sha`);
  }
  return value;
}

function requireDigest(value, name) {
  if (typeof value !== 'string' || !DIGEST_RE.test(value)) {
    throw new ValidationError(`${name} must be a lowercase sha256 digest`);
  }
  return value;
}

function requireTimestamp(value, name) {
  requireString(value, name, 64);
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString() !== value) {
    throw new ValidationError(`${name} must be a canonical ISO timestamp`);
  }
  return value;
}

function requireEnum(value, allowed, name) {
  if (!allowed.has(value)) throw new ValidationError(`${name} is invalid`);
  return value;
}

function requireEqual(value, expected, name) {
  if (value !== expected) {
    throw new ValidationError(`${name} must equal ${String(expected)}`);
  }
  return value;
}

function requireProbability(value, name) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1) {
    throw new ValidationError(`${name} must be a probability in [0,1]`);
  }
  return value;
}

function requireUniqueStrings(value, name, {
  min = 0,
  max = 32,
  itemMax = 1024,
  validator = null
} = {}) {
  if (!Array.isArray(value) || value.length < min || value.length > max) {
    throw new ValidationError(`${name} must contain ${min}-${max} entries`);
  }
  const seen = new Set();
  for (const item of value) {
    if (validator) validator(item, `${name}[]`);
    else requireString(item, `${name}[]`, itemMax);
    if (seen.has(item)) throw new ValidationError(`${name} contains duplicate values`);
    seen.add(item);
  }
  return value;
}

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}
