import {
  ValidationError,
  assertPlainObject,
  assertString,
  digestObject
} from './canonical.mjs';
import {
  validateBoundedDecisionObservation
} from './bounded-decision-observation.mjs';

export const COGNITIVE_ROUTE_PROPOSAL_SCHEMA =
  'axiom-cognitive-route-proposal.v0';
export const COGNITIVE_ROUTE_STATE_SCHEMA =
  'axiom-cognitive-route-state.v0';

const VERSION = 0;
const STATUS = 'inert-cognitive-route-proposal';
const PURPOSE = 'cognitive-route-task-fit';
const DOMAIN = 'agent.cognitive.route.task-fit';
const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,191}$/;
const DIGEST = /^[a-f0-9]{64}$/;
const MAX_CANDIDATES = 64;

const PRIORITY_DIMENSIONS = Object.freeze([
  'task-fit',
  'quality',
  'reliability',
  'latency',
  'cost'
]);

const FALLBACK_BEHAVIORS = Object.freeze([
  'retain-eligible',
  'escalate'
]);

const SELECTION_MODES = Object.freeze([
  'deterministic-not-needed',
  'lexicographic',
  'fallback-retain-eligible',
  'fallback-escalate',
  'no-eligible-candidates',
  'no-admissible-candidates'
]);

const RECOMMENDED_ACTIONS = Object.freeze([
  'skip-cognitive-routing',
  'use-route-proposal',
  'deliberate-with-retained-candidates',
  'escalate'
]);

const UNCERTAINTY_REASONS = Object.freeze([
  'missing-semantic-evidence',
  'invalid-semantic-evidence',
  'no-eligible-candidates',
  'no-admissible-candidates',
  'retain-candidate-budget-exceeded'
]);

const WITHHELD_REASONS = Object.freeze([
  'deterministic-ineligible',
  'routing-metrics-stale',
  'task-fit-below-minimum',
  'quality-below-minimum',
  'reliability-below-minimum',
  'latency-above-maximum',
  'cost-above-maximum',
  'fallback-escalation',
  'deterministic-solution-available'
]);

const DOCUMENT_FIELDS = Object.freeze([
  'schema',
  'version',
  'status',
  'proposal_id',
  'task_purpose_digest',
  'metric_definition_digest',
  'candidate_set_digest',
  'semantic_evidence_input_digest',
  'policy_digest',
  'selection_mode',
  'recommended_action',
  'selected_profile_id',
  'fallback_profile_ids',
  'retained_profile_ids',
  'withheld',
  'unresolved',
  'uncertainty_reasons',
  'validated_semantic_evidence',
  'proposal_digest',
  'authority_effect',
  'assurance_effect',
  'network_effect',
  'persistence_effect',
  'credential_visibility',
  'runtime_activation',
  'execution_effect',
  'selection_effect'
]);

const MODE_SEMANTICS = Object.freeze({
  'deterministic-not-needed': Object.freeze({
    action: 'skip-cognitive-routing',
    unresolved: false,
    selected: false,
    fallback: false,
    retained: false
  }),
  lexicographic: Object.freeze({
    action: 'use-route-proposal',
    unresolved: false,
    selected: true,
    fallback: true,
    retained: false
  }),
  'fallback-retain-eligible': Object.freeze({
    action: 'deliberate-with-retained-candidates',
    unresolved: true,
    selected: false,
    fallback: false,
    retained: true
  }),
  'fallback-escalate': Object.freeze({
    action: 'escalate',
    unresolved: true,
    selected: false,
    fallback: false,
    retained: false
  }),
  'no-eligible-candidates': Object.freeze({
    action: 'escalate',
    unresolved: true,
    selected: false,
    fallback: false,
    retained: false
  }),
  'no-admissible-candidates': Object.freeze({
    action: 'escalate',
    unresolved: true,
    selected: false,
    fallback: false,
    retained: false
  })
});

function exact(value, fields, name) {
  const object = assertPlainObject(value, name);
  const allowed = new Set(fields);
  for (const key of Object.keys(object)) {
    if (!allowed.has(key)) {
      throw new ValidationError(name + ' contains unknown field ' + key);
    }
  }
  for (const key of fields) {
    if (!Object.hasOwn(object, key)) {
      throw new ValidationError(name + '.' + key + ' is required');
    }
  }
  return object;
}

function identifier(value, name) {
  return assertString(value, name, { min: 1, max: 192, pattern: IDENTIFIER });
}

function digest(value, name) {
  return assertString(value, name, { min: 64, max: 64, pattern: DIGEST });
}

function boolean(value, name) {
  if (typeof value !== 'boolean') {
    throw new ValidationError(name + ' must be boolean');
  }
  return value;
}

function finite(value, name, min = 0, max = Number.MAX_VALUE) {
  if (
    typeof value !== 'number'
    || !Number.isFinite(value)
    || value < min
    || value > max
  ) {
    throw new ValidationError(
      name + ' must be a finite number in [' + min + ', ' + max + ']'
    );
  }
  return Object.is(value, -0) ? 0 : value;
}

function unit(value, name) {
  return finite(value, name, 0, 1);
}

function integer(value, name, min, max) {
  if (!Number.isSafeInteger(value) || value < min || value > max) {
    throw new ValidationError(
      name + ' must be an integer in [' + min + ', ' + max + ']'
    );
  }
  return value;
}

function enumValue(value, allowed, name) {
  if (!allowed.includes(value)) {
    throw new ValidationError(name + ' must be one of ' + allowed.join(', '));
  }
  return value;
}

function nullableIdentifier(value, name) {
  if (value === null) return null;
  return identifier(value, name);
}

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

function compareCodeUnits(left, right) {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

function normalizeMetrics(value, index) {
  const metrics = exact(
    value,
    [
      'current',
      'quality',
      'reliability',
      'latencyMsP95',
      'costMicrocents',
      'evidenceDigest'
    ],
    'cognitive candidate[' + index + '].metrics'
  );

  return {
    current: boolean(
      metrics.current,
      'cognitive candidate[' + index + '].metrics.current'
    ),
    quality: unit(
      metrics.quality,
      'cognitive candidate[' + index + '].metrics.quality'
    ),
    reliability: unit(
      metrics.reliability,
      'cognitive candidate[' + index + '].metrics.reliability'
    ),
    latency_ms_p95: finite(
      metrics.latencyMsP95,
      'cognitive candidate[' + index + '].metrics.latencyMsP95'
    ),
    cost_microcents: finite(
      metrics.costMicrocents,
      'cognitive candidate[' + index + '].metrics.costMicrocents'
    ),
    evidence_digest: digest(
      metrics.evidenceDigest,
      'cognitive candidate[' + index + '].metrics.evidenceDigest'
    )
  };
}

function normalizeCandidate(value, index) {
  const candidate = exact(
    value,
    [
      'profileId',
      'profileDigest',
      'eligible',
      'eligibilityReason',
      'metrics'
    ],
    'cognitive candidate[' + index + ']'
  );

  const eligible = boolean(
    candidate.eligible,
    'cognitive candidate[' + index + '].eligible'
  );
  const eligibilityReason = identifier(
    candidate.eligibilityReason,
    'cognitive candidate[' + index + '].eligibilityReason'
  );

  if (eligible && eligibilityReason !== 'eligible') {
    throw new ValidationError(
      'eligible cognitive candidates must use eligibilityReason eligible'
    );
  }
  if (!eligible && eligibilityReason === 'eligible') {
    throw new ValidationError(
      'ineligible cognitive candidates must state a non-eligible reason'
    );
  }

  return {
    profile_id: identifier(
      candidate.profileId,
      'cognitive candidate[' + index + '].profileId'
    ),
    profile_digest: digest(
      candidate.profileDigest,
      'cognitive candidate[' + index + '].profileDigest'
    ),
    eligible,
    eligibility_reason: eligibilityReason,
    metrics: normalizeMetrics(candidate.metrics, index)
  };
}

function normalizePriorityOrder(value) {
  if (!Array.isArray(value) || value.length !== PRIORITY_DIMENSIONS.length) {
    throw new ValidationError(
      'cognitive route priorityOrder must contain every routing dimension exactly once'
    );
  }
  const seen = new Set();
  for (const [index, dimension] of value.entries()) {
    enumValue(
      dimension,
      PRIORITY_DIMENSIONS,
      'cognitive route priorityOrder[' + index + ']'
    );
    if (seen.has(dimension)) {
      throw new ValidationError(
        'cognitive route priorityOrder cannot contain duplicate dimensions'
      );
    }
    seen.add(dimension);
  }
  return [...value];
}

function normalizePolicy(value) {
  const policy = exact(
    value,
    [
      'minimumTaskFit',
      'minimumQuality',
      'minimumReliability',
      'maximumLatencyMsP95',
      'maximumCostMicrocents',
      'priorityOrder',
      'fallbackBehavior',
      'retainCandidateBudget'
    ],
    'cognitive route policy'
  );

  return {
    minimum_task_fit: unit(
      policy.minimumTaskFit,
      'cognitive route policy.minimumTaskFit'
    ),
    minimum_quality: unit(
      policy.minimumQuality,
      'cognitive route policy.minimumQuality'
    ),
    minimum_reliability: unit(
      policy.minimumReliability,
      'cognitive route policy.minimumReliability'
    ),
    maximum_latency_ms_p95: finite(
      policy.maximumLatencyMsP95,
      'cognitive route policy.maximumLatencyMsP95'
    ),
    maximum_cost_microcents: finite(
      policy.maximumCostMicrocents,
      'cognitive route policy.maximumCostMicrocents'
    ),
    priority_order: normalizePriorityOrder(policy.priorityOrder),
    fallback_behavior: enumValue(
      policy.fallbackBehavior,
      FALLBACK_BEHAVIORS,
      'cognitive route policy.fallbackBehavior'
    ),
    retain_candidate_budget: integer(
      policy.retainCandidateBudget,
      'cognitive route policy.retainCandidateBudget',
      1,
      MAX_CANDIDATES
    )
  };
}

export function computeCognitiveRouteStateDigest(input) {
  const value = exact(
    input,
    [
      'taskPurposeDigest',
      'profileId',
      'profileDigest',
      'metricDefinitionDigest'
    ],
    'cognitive route state digest input'
  );

  return digestObject({
    schema: COGNITIVE_ROUTE_STATE_SCHEMA,
    task_purpose_digest: digest(
      value.taskPurposeDigest,
      'cognitive route state digest input.taskPurposeDigest'
    ),
    profile_id: identifier(
      value.profileId,
      'cognitive route state digest input.profileId'
    ),
    profile_digest: digest(
      value.profileDigest,
      'cognitive route state digest input.profileDigest'
    ),
    metric_definition_digest: digest(
      value.metricDefinitionDigest,
      'cognitive route state digest input.metricDefinitionDigest'
    )
  });
}

function normalizeSemanticEnvelope(entry, index, candidateById) {
  const value = exact(
    entry,
    [
      'profileId',
      'profileDigest',
      'observation',
      'providerProfile',
      'questionSchema'
    ],
    'cognitive route semantic evidence[' + index + ']'
  );
  const profileId = identifier(
    value.profileId,
    'cognitive route semantic evidence[' + index + '].profileId'
  );
  const profileDigest = digest(
    value.profileDigest,
    'cognitive route semantic evidence[' + index + '].profileDigest'
  );
  const candidate = candidateById.get(profileId);
  if (!candidate) {
    throw new ValidationError(
      'cognitive route semantic evidence references unknown profile ' + profileId
    );
  }
  if (candidate.profile_digest !== profileDigest) {
    throw new ValidationError(
      'cognitive route semantic evidence profile digest does not match candidate'
    );
  }

  return {
    profileId,
    profileDigest,
    observation: value.observation,
    providerProfile: value.providerProfile,
    questionSchema: value.questionSchema
  };
}

function validateSemanticEvidence(
  entry,
  candidate,
  taskPurposeDigest,
  metricDefinitionDigest
) {
  try {
    validateBoundedDecisionObservation(
      entry.observation,
      entry.providerProfile,
      entry.questionSchema
    );

    if (
      entry.questionSchema.question_kind !== 'binary-probability'
      || entry.observation.answer.kind !== 'binary-probability'
    ) {
      throw new ValidationError(
        'cognitive route task fit requires binary-probability evidence'
      );
    }
    if (entry.questionSchema.purpose !== PURPOSE) {
      throw new ValidationError('cognitive route task-fit purpose is invalid');
    }
    if (entry.questionSchema.domain !== DOMAIN) {
      throw new ValidationError('cognitive route task-fit domain is invalid');
    }
    if (
      entry.questionSchema.state_contract_ref !== COGNITIVE_ROUTE_STATE_SCHEMA
    ) {
      throw new ValidationError(
        'cognitive route task-fit state contract is invalid'
      );
    }

    const expectedStateDigest = computeCognitiveRouteStateDigest({
      taskPurposeDigest,
      profileId: candidate.profile_id,
      profileDigest: candidate.profile_digest,
      metricDefinitionDigest
    });
    if (entry.observation.state_digest !== expectedStateDigest) {
      throw new ValidationError(
        'cognitive route task-fit state digest is stale or mismatched'
      );
    }

    return {
      valid: true,
      evidence: {
        profile_id: candidate.profile_id,
        profile_digest: candidate.profile_digest,
        observation_digest: entry.observation.observation_digest,
        provider_profile_digest: entry.observation.provider_profile_digest,
        question_schema_digest: entry.observation.question_schema_digest,
        state_digest: entry.observation.state_digest,
        support: unit(
          entry.observation.answer.p_true,
          'cognitive route task-fit p_true'
        )
      }
    };
  } catch (error) {
    if (error instanceof ValidationError || error instanceof TypeError) {
      return { valid: false, evidence: null };
    }
    throw error;
  }
}

function withheldEntry(candidate, reasons) {
  const uniqueReasons = [...new Set(reasons)].sort();
  return {
    profile_id: candidate.profile_id,
    profile_digest: candidate.profile_digest,
    reasons: uniqueReasons
  };
}

function candidateHardReasons(candidate, evidence, policy) {
  const reasons = [];
  if (!candidate.metrics.current) reasons.push('routing-metrics-stale');
  if (evidence.support < policy.minimum_task_fit) {
    reasons.push('task-fit-below-minimum');
  }
  if (candidate.metrics.quality < policy.minimum_quality) {
    reasons.push('quality-below-minimum');
  }
  if (candidate.metrics.reliability < policy.minimum_reliability) {
    reasons.push('reliability-below-minimum');
  }
  if (candidate.metrics.latency_ms_p95 > policy.maximum_latency_ms_p95) {
    reasons.push('latency-above-maximum');
  }
  if (candidate.metrics.cost_microcents > policy.maximum_cost_microcents) {
    reasons.push('cost-above-maximum');
  }
  return reasons.sort();
}

function compareDimension(left, right, dimension) {
  if (dimension === 'task-fit') {
    return right.evidence.support - left.evidence.support;
  }
  if (dimension === 'quality') {
    return right.candidate.metrics.quality - left.candidate.metrics.quality;
  }
  if (dimension === 'reliability') {
    return right.candidate.metrics.reliability - left.candidate.metrics.reliability;
  }
  if (dimension === 'latency') {
    return left.candidate.metrics.latency_ms_p95 - right.candidate.metrics.latency_ms_p95;
  }
  if (dimension === 'cost') {
    return left.candidate.metrics.cost_microcents - right.candidate.metrics.cost_microcents;
  }
  return 0;
}

function compareRanked(left, right, priorityOrder) {
  for (const dimension of priorityOrder) {
    const comparison = compareDimension(left, right, dimension);
    if (comparison !== 0) return comparison;
  }
  return compareCodeUnits(left.candidate.profile_id, right.candidate.profile_id)
    || compareCodeUnits(left.candidate.profile_digest, right.candidate.profile_digest);
}

function fallbackSelection({
  candidates,
  eligible,
  ineligible,
  evidenceById,
  policy,
  uncertaintyReasons
}) {
  const reasons = [...new Set(uncertaintyReasons)].sort();

  if (
    policy.fallback_behavior === 'retain-eligible'
    && eligible.length <= policy.retain_candidate_budget
  ) {
    return {
      selectionMode: 'fallback-retain-eligible',
      recommendedAction: 'deliberate-with-retained-candidates',
      selectedProfileId: null,
      fallbackProfileIds: [],
      retainedProfileIds: eligible.map(candidate => candidate.profile_id).sort(compareCodeUnits),
      withheld: ineligible
        .map(candidate => withheldEntry(candidate, ['deterministic-ineligible']))
        .sort((left, right) => compareCodeUnits(left.profile_id, right.profile_id)),
      unresolved: true,
      uncertaintyReasons: reasons
    };
  }

  if (
    eligible.length > policy.retain_candidate_budget
    && !reasons.includes('retain-candidate-budget-exceeded')
  ) {
    reasons.push('retain-candidate-budget-exceeded');
    reasons.sort();
  }

  return {
    selectionMode: 'fallback-escalate',
    recommendedAction: 'escalate',
    selectedProfileId: null,
    fallbackProfileIds: [],
    retainedProfileIds: [],
    withheld: candidates.map(candidate =>
      withheldEntry(
        candidate,
        candidate.eligible
          ? ['fallback-escalation']
          : ['deterministic-ineligible']
      )
    ).sort((left, right) => compareCodeUnits(left.profile_id, right.profile_id)),
    unresolved: true,
    uncertaintyReasons: reasons
  };
}

function selectRoute({
  candidates,
  evidenceById,
  invalidEvidenceIds,
  policy,
  deterministicSolutionAvailable
}) {
  const eligible = candidates.filter(candidate => candidate.eligible);
  const ineligible = candidates.filter(candidate => !candidate.eligible);

  if (deterministicSolutionAvailable) {
    return {
      selectionMode: 'deterministic-not-needed',
      recommendedAction: 'skip-cognitive-routing',
      selectedProfileId: null,
      fallbackProfileIds: [],
      retainedProfileIds: [],
      withheld: candidates.map(candidate =>
        withheldEntry(candidate, ['deterministic-solution-available'])
      ).sort((left, right) => compareCodeUnits(left.profile_id, right.profile_id)),
      unresolved: false,
      uncertaintyReasons: []
    };
  }

  if (eligible.length === 0) {
    return {
      selectionMode: 'no-eligible-candidates',
      recommendedAction: 'escalate',
      selectedProfileId: null,
      fallbackProfileIds: [],
      retainedProfileIds: [],
      withheld: ineligible.map(candidate =>
        withheldEntry(candidate, ['deterministic-ineligible'])
      ).sort((left, right) => compareCodeUnits(left.profile_id, right.profile_id)),
      unresolved: true,
      uncertaintyReasons: ['no-eligible-candidates']
    };
  }

  const missingEvidence = eligible.filter(
    candidate =>
      !evidenceById.has(candidate.profile_id)
      && !invalidEvidenceIds.has(candidate.profile_id)
  );
  const invalidEvidence = eligible.filter(
    candidate => invalidEvidenceIds.has(candidate.profile_id)
  );

  if (missingEvidence.length > 0 || invalidEvidence.length > 0) {
    return fallbackSelection({
      candidates,
      eligible,
      ineligible,
      evidenceById,
      policy,
      uncertaintyReasons: [
        ...(missingEvidence.length > 0 ? ['missing-semantic-evidence'] : []),
        ...(invalidEvidence.length > 0 ? ['invalid-semantic-evidence'] : [])
      ]
    });
  }

  const withheld = ineligible.map(candidate =>
    withheldEntry(candidate, ['deterministic-ineligible'])
  );
  const admissible = [];

  for (const candidate of eligible) {
    const evidence = evidenceById.get(candidate.profile_id);
    const reasons = candidateHardReasons(candidate, evidence, policy);
    if (reasons.length > 0) {
      withheld.push(withheldEntry(candidate, reasons));
    } else {
      admissible.push({ candidate, evidence });
    }
  }

  withheld.sort((left, right) => compareCodeUnits(left.profile_id, right.profile_id));

  if (admissible.length === 0) {
    return {
      selectionMode: 'no-admissible-candidates',
      recommendedAction: 'escalate',
      selectedProfileId: null,
      fallbackProfileIds: [],
      retainedProfileIds: [],
      withheld,
      unresolved: true,
      uncertaintyReasons: ['no-admissible-candidates']
    };
  }

  admissible.sort((left, right) =>
    compareRanked(left, right, policy.priority_order)
  );

  return {
    selectionMode: 'lexicographic',
    recommendedAction: 'use-route-proposal',
    selectedProfileId: admissible[0].candidate.profile_id,
    fallbackProfileIds: admissible.slice(1).map(item => item.candidate.profile_id),
    retainedProfileIds: [],
    withheld,
    unresolved: false,
    uncertaintyReasons: []
  };
}

function proposalDigestPayload(document) {
  const copy = structuredClone(document);
  delete copy.proposal_digest;
  return copy;
}

function validateIdentifierArray(value, name) {
  if (!Array.isArray(value) || value.length > MAX_CANDIDATES) {
    throw new ValidationError(name + ' must be a bounded array');
  }
  const seen = new Set();
  for (const [index, item] of value.entries()) {
    identifier(item, name + '[' + index + ']');
    if (seen.has(item)) {
      throw new ValidationError(name + ' cannot contain duplicate profile ids');
    }
    seen.add(item);
  }
}

function validateWithheldEntry(value, index) {
  const item = exact(
    value,
    ['profile_id', 'profile_digest', 'reasons'],
    'cognitive route proposal.withheld[' + index + ']'
  );
  identifier(
    item.profile_id,
    'cognitive route proposal.withheld[' + index + '].profile_id'
  );
  digest(
    item.profile_digest,
    'cognitive route proposal.withheld[' + index + '].profile_digest'
  );
  if (
    !Array.isArray(item.reasons)
    || item.reasons.length < 1
    || item.reasons.length > WITHHELD_REASONS.length
  ) {
    throw new ValidationError(
      'cognitive route proposal.withheld[' + index + '].reasons is invalid'
    );
  }
  const seen = new Set();
  for (const [reasonIndex, reason] of item.reasons.entries()) {
    enumValue(
      reason,
      WITHHELD_REASONS,
      'cognitive route proposal.withheld[' + index + '].reasons[' + reasonIndex + ']'
    );
    if (seen.has(reason)) {
      throw new ValidationError(
        'cognitive route proposal withheld reasons cannot contain duplicates'
      );
    }
    seen.add(reason);
  }
}

function validateSemanticSummary(value, index) {
  const item = exact(
    value,
    [
      'profile_id',
      'profile_digest',
      'observation_digest',
      'provider_profile_digest',
      'question_schema_digest',
      'state_digest',
      'support'
    ],
    'cognitive route proposal.validated_semantic_evidence[' + index + ']'
  );
  identifier(
    item.profile_id,
    'cognitive route proposal.validated_semantic_evidence[' + index + '].profile_id'
  );
  for (const field of [
    'profile_digest',
    'observation_digest',
    'provider_profile_digest',
    'question_schema_digest',
    'state_digest'
  ]) {
    digest(
      item[field],
      'cognitive route proposal.validated_semantic_evidence[' + index + '].' + field
    );
  }
  unit(
    item.support,
    'cognitive route proposal.validated_semantic_evidence[' + index + '].support'
  );
}

function validateCognitiveRouteProposalShape(document) {
  const value = exact(
    document,
    DOCUMENT_FIELDS,
    'cognitive route proposal'
  );

  if (
    value.schema !== COGNITIVE_ROUTE_PROPOSAL_SCHEMA
    || value.version !== VERSION
    || value.status !== STATUS
  ) {
    throw new ValidationError(
      'cognitive route proposal schema version or status is unsupported'
    );
  }

  identifier(value.proposal_id, 'cognitive route proposal.proposal_id');
  digest(value.task_purpose_digest, 'cognitive route proposal.task_purpose_digest');
  digest(
    value.metric_definition_digest,
    'cognitive route proposal.metric_definition_digest'
  );
  digest(value.candidate_set_digest, 'cognitive route proposal.candidate_set_digest');
  digest(
    value.semantic_evidence_input_digest,
    'cognitive route proposal.semantic_evidence_input_digest'
  );
  digest(value.policy_digest, 'cognitive route proposal.policy_digest');
  enumValue(value.selection_mode, SELECTION_MODES, 'cognitive route proposal.selection_mode');
  enumValue(
    value.recommended_action,
    RECOMMENDED_ACTIONS,
    'cognitive route proposal.recommended_action'
  );
  nullableIdentifier(
    value.selected_profile_id,
    'cognitive route proposal.selected_profile_id'
  );
  validateIdentifierArray(
    value.fallback_profile_ids,
    'cognitive route proposal.fallback_profile_ids'
  );
  validateIdentifierArray(
    value.retained_profile_ids,
    'cognitive route proposal.retained_profile_ids'
  );
  boolean(value.unresolved, 'cognitive route proposal.unresolved');

  if (!Array.isArray(value.withheld) || value.withheld.length > MAX_CANDIDATES) {
    throw new ValidationError('cognitive route proposal.withheld must be a bounded array');
  }
  value.withheld.forEach(validateWithheldEntry);

  if (
    !Array.isArray(value.uncertainty_reasons)
    || value.uncertainty_reasons.length > UNCERTAINTY_REASONS.length
  ) {
    throw new ValidationError(
      'cognitive route proposal.uncertainty_reasons must be a bounded array'
    );
  }
  const uncertaintySet = new Set();
  for (const [index, reason] of value.uncertainty_reasons.entries()) {
    enumValue(
      reason,
      UNCERTAINTY_REASONS,
      'cognitive route proposal.uncertainty_reasons[' + index + ']'
    );
    if (uncertaintySet.has(reason)) {
      throw new ValidationError(
        'cognitive route proposal uncertainty reasons cannot contain duplicates'
      );
    }
    uncertaintySet.add(reason);
  }

  if (
    !Array.isArray(value.validated_semantic_evidence)
    || value.validated_semantic_evidence.length > MAX_CANDIDATES
  ) {
    throw new ValidationError(
      'cognitive route proposal.validated_semantic_evidence must be a bounded array'
    );
  }
  value.validated_semantic_evidence.forEach(validateSemanticSummary);

  const semantics = MODE_SEMANTICS[value.selection_mode];
  if (
    value.recommended_action !== semantics.action
    || value.unresolved !== semantics.unresolved
  ) {
    throw new ValidationError('cognitive route proposal mode semantics are inconsistent');
  }
  if (semantics.selected !== (value.selected_profile_id !== null)) {
    throw new ValidationError(
      'cognitive route proposal selected profile is inconsistent with mode'
    );
  }
  if (!semantics.fallback && value.fallback_profile_ids.length !== 0) {
    throw new ValidationError(
      'cognitive route proposal fallback profiles are inconsistent with mode'
    );
  }
  if (!semantics.retained && value.retained_profile_ids.length !== 0) {
    throw new ValidationError(
      'cognitive route proposal retained profiles are inconsistent with mode'
    );
  }
  if (
    semantics.retained
    && value.retained_profile_ids.length < 1
  ) {
    throw new ValidationError(
      'cognitive route proposal retained mode requires at least one profile'
    );
  }
  if (!value.unresolved && value.uncertainty_reasons.length !== 0) {
    throw new ValidationError(
      'resolved cognitive route proposal cannot contain uncertainty reasons'
    );
  }
  if (value.unresolved && value.uncertainty_reasons.length === 0) {
    throw new ValidationError(
      'unresolved cognitive route proposal requires uncertainty reasons'
    );
  }

  const routed = new Set();
  if (value.selected_profile_id !== null) routed.add(value.selected_profile_id);
  for (const profileId of value.fallback_profile_ids) {
    if (routed.has(profileId)) {
      throw new ValidationError(
        'cognitive route proposal selected and fallback profiles must be unique'
      );
    }
    routed.add(profileId);
  }
  for (const profileId of value.retained_profile_ids) {
    if (routed.has(profileId)) {
      throw new ValidationError(
        'cognitive route proposal routed and retained profiles must be disjoint'
      );
    }
    routed.add(profileId);
  }

  const withheldIds = new Set();
  for (const item of value.withheld) {
    if (withheldIds.has(item.profile_id)) {
      throw new ValidationError(
        'cognitive route proposal.withheld contains duplicate profile_id'
      );
    }
    if (routed.has(item.profile_id)) {
      throw new ValidationError(
        'cognitive route proposal profile cannot be both routed/retained and withheld'
      );
    }
    withheldIds.add(item.profile_id);
  }

  const semanticIds = new Set();
  for (const item of value.validated_semantic_evidence) {
    if (semanticIds.has(item.profile_id)) {
      throw new ValidationError(
        'cognitive route proposal.validated_semantic_evidence contains duplicate profile_id'
      );
    }
    semanticIds.add(item.profile_id);
  }

  if (
    value.authority_effect !== 'none'
    || value.assurance_effect !== 'none'
    || value.network_effect !== 'none'
    || value.persistence_effect !== 'none'
    || value.credential_visibility !== 'none'
    || value.runtime_activation !== false
    || value.execution_effect !== 'none'
    || value.selection_effect !== 'proposal-only'
  ) {
    throw new ValidationError('cognitive route proposal effect boundary is invalid');
  }

  const expectedProposalId = 'cognitive_route_' + digestObject({
    task_purpose_digest: value.task_purpose_digest,
    metric_definition_digest: value.metric_definition_digest,
    candidate_set_digest: value.candidate_set_digest,
    semantic_evidence_input_digest: value.semantic_evidence_input_digest,
    policy_digest: value.policy_digest
  });
  if (value.proposal_id !== expectedProposalId) {
    throw new ValidationError('cognitive route proposal_id does not match inputs');
  }

  const expectedDigest = digestObject(proposalDigestPayload(value));
  if (value.proposal_digest !== expectedDigest) {
    throw new ValidationError('cognitive route proposal digest is invalid');
  }

  return Object.freeze({
    valid: true,
    proposal_digest: expectedDigest
  });
}

export function createCognitiveRouteProposal(input) {
  const value = exact(
    input,
    [
      'taskPurposeDigest',
      'metricDefinitionDigest',
      'deterministicSolutionAvailable',
      'candidates',
      'semanticEvidence',
      'policy'
    ],
    'cognitive route input'
  );

  const taskPurposeDigest = digest(
    value.taskPurposeDigest,
    'cognitive route input.taskPurposeDigest'
  );
  const metricDefinitionDigest = digest(
    value.metricDefinitionDigest,
    'cognitive route input.metricDefinitionDigest'
  );
  const deterministicSolutionAvailable = boolean(
    value.deterministicSolutionAvailable,
    'cognitive route input.deterministicSolutionAvailable'
  );

  if (
    !Array.isArray(value.candidates)
    || value.candidates.length < 1
    || value.candidates.length > MAX_CANDIDATES
  ) {
    throw new ValidationError(
      'cognitive route input.candidates must contain 1-' + MAX_CANDIDATES + ' entries'
    );
  }
  if (
    !Array.isArray(value.semanticEvidence)
    || value.semanticEvidence.length > MAX_CANDIDATES
  ) {
    throw new ValidationError(
      'cognitive route input.semanticEvidence must be a bounded array'
    );
  }

  const candidates = value.candidates
    .map(normalizeCandidate)
    .sort((left, right) =>
      compareCodeUnits(left.profile_id, right.profile_id)
      || compareCodeUnits(left.profile_digest, right.profile_digest)
    );

  const candidateById = new Map();
  for (const candidate of candidates) {
    if (candidateById.has(candidate.profile_id)) {
      throw new ValidationError(
        'cognitive route contains duplicate profileId ' + candidate.profile_id
      );
    }
    candidateById.set(candidate.profile_id, candidate);
  }

  const policy = normalizePolicy(value.policy);
  const candidateSetDigest = digestObject(candidates);
  const policyDigest = digestObject(policy);
  const evidenceById = new Map();
  const invalidEvidenceIds = new Set();
  const semanticEvidenceDigestEntries = [];

  if (!deterministicSolutionAvailable) {
    const envelopes = value.semanticEvidence.map((entry, index) =>
      normalizeSemanticEnvelope(entry, index, candidateById)
    );
    const seenEvidenceIds = new Set();

    for (const entry of envelopes) {
      if (seenEvidenceIds.has(entry.profileId)) {
        throw new ValidationError(
          'cognitive route contains duplicate semantic evidence for ' + entry.profileId
        );
      }
      seenEvidenceIds.add(entry.profileId);

      const candidate = candidateById.get(entry.profileId);
      if (!candidate.eligible) {
        semanticEvidenceDigestEntries.push({
          profile_id: entry.profileId,
          profile_digest: entry.profileDigest,
          evidence_status: 'deterministically-ineligible'
        });
        continue;
      }

      const result = validateSemanticEvidence(
        entry,
        candidate,
        taskPurposeDigest,
        metricDefinitionDigest
      );
      if (!result.valid) {
        invalidEvidenceIds.add(candidate.profile_id);
        semanticEvidenceDigestEntries.push({
          profile_id: entry.profileId,
          profile_digest: entry.profileDigest,
          evidence_status: 'invalid'
        });
        continue;
      }

      evidenceById.set(candidate.profile_id, result.evidence);
      semanticEvidenceDigestEntries.push({
        profile_id: entry.profileId,
        profile_digest: entry.profileDigest,
        evidence_status: 'valid',
        observation_digest: result.evidence.observation_digest,
        provider_profile_digest: result.evidence.provider_profile_digest,
        question_schema_digest: result.evidence.question_schema_digest,
        state_digest: result.evidence.state_digest
      });
    }
  }

  const semanticEvidenceInputDigest = digestObject(
    semanticEvidenceDigestEntries.sort((left, right) =>
      compareCodeUnits(left.profile_id, right.profile_id)
      || compareCodeUnits(left.profile_digest, right.profile_digest)
    )
  );

  const selection = selectRoute({
    candidates,
    evidenceById,
    invalidEvidenceIds,
    policy,
    deterministicSolutionAvailable
  });

  const validatedSemanticEvidence = [...evidenceById.values()].sort(
    (left, right) =>
      right.support - left.support
      || compareCodeUnits(left.profile_id, right.profile_id)
  );

  const proposalId = 'cognitive_route_' + digestObject({
    task_purpose_digest: taskPurposeDigest,
    metric_definition_digest: metricDefinitionDigest,
    candidate_set_digest: candidateSetDigest,
    semantic_evidence_input_digest: semanticEvidenceInputDigest,
    policy_digest: policyDigest
  });

  const document = {
    schema: COGNITIVE_ROUTE_PROPOSAL_SCHEMA,
    version: VERSION,
    status: STATUS,
    proposal_id: proposalId,
    task_purpose_digest: taskPurposeDigest,
    metric_definition_digest: metricDefinitionDigest,
    candidate_set_digest: candidateSetDigest,
    semantic_evidence_input_digest: semanticEvidenceInputDigest,
    policy_digest: policyDigest,
    selection_mode: selection.selectionMode,
    recommended_action: selection.recommendedAction,
    selected_profile_id: selection.selectedProfileId,
    fallback_profile_ids: selection.fallbackProfileIds,
    retained_profile_ids: selection.retainedProfileIds,
    withheld: selection.withheld,
    unresolved: selection.unresolved,
    uncertainty_reasons: selection.uncertaintyReasons,
    validated_semantic_evidence: validatedSemanticEvidence,
    proposal_digest: '0'.repeat(64),
    authority_effect: 'none',
    assurance_effect: 'none',
    network_effect: 'none',
    persistence_effect: 'none',
    credential_visibility: 'none',
    runtime_activation: false,
    execution_effect: 'none',
    selection_effect: 'proposal-only'
  };

  document.proposal_digest = digestObject(proposalDigestPayload(document));
  validateCognitiveRouteProposalShape(document);
  return deepFreeze(document);
}

export function validateCognitiveRouteProposal(document, trustedInput) {
  if (trustedInput === undefined) {
    throw new ValidationError(
      'trusted inputs are required to validate a cognitive route proposal'
    );
  }

  const validated = validateCognitiveRouteProposalShape(document);
  const expected = createCognitiveRouteProposal(trustedInput);
  if (validated.proposal_digest !== expected.proposal_digest) {
    throw new ValidationError(
      'cognitive route proposal does not match trusted inputs'
    );
  }

  return Object.freeze({
    valid: true,
    proposal_digest: validated.proposal_digest,
    trusted_input_match: true
  });
}

export function verifyCognitiveRouteProposal(document, trustedInput) {
  return validateCognitiveRouteProposal(document, trustedInput);
}
