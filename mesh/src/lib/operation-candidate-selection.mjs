import {
  ValidationError,
  assertPlainObject,
  assertString,
  digestObject
} from './canonical.mjs';
import {
  validateBoundedDecisionObservation
} from './bounded-decision-observation.mjs';

export const OPERATION_CANDIDATE_SELECTION_SCHEMA =
  'axiom-operation-candidate-selection.v0';
export const OPERATION_CANDIDATE_STATE_SCHEMA =
  'axiom-operation-candidate-state.v0';

const VERSION = 0;
const STATUS = 'inert-operation-candidate-selection';
const PURPOSE = 'operation-candidate-relevance';
const DOMAIN = 'agent.operation.candidate.relevance';
const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,191}$/;
const DIGEST = /^[a-f0-9]{64}$/;
const MAX_CANDIDATES = 64;

const DOCUMENT_FIELDS = Object.freeze([
  'schema',
  'version',
  'status',
  'proposal_id',
  'task_purpose_digest',
  'candidate_set_digest',
  'semantic_evidence_input_digest',
  'policy_digest',
  'selection_mode',
  'recommended_action',
  'selected',
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

const SELECTION_MODES = Object.freeze([
  'deterministic-exact',
  'semantic-single',
  'semantic-top-k',
  'fallback-retain-eligible',
  'fallback-escalate',
  'no-eligible-candidates'
]);

const RECOMMENDED_ACTIONS = Object.freeze([
  'continue-with-bounded-context',
  'deliberate-with-retained-context',
  'escalate'
]);

const FALLBACK_BEHAVIORS = Object.freeze([
  'retain-eligible',
  'escalate'
]);

const UNCERTAINTY_REASONS = Object.freeze([
  'missing-semantic-evidence',
  'invalid-semantic-evidence',
  'low-semantic-support',
  'context-budget-exceeded',
  'no-eligible-candidates'
]);

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

function integer(value, name, min, max) {
  if (!Number.isSafeInteger(value) || value < min || value > max) {
    throw new ValidationError(name + ' must be an integer in [' + min + ', ' + max + ']');
  }
  return value;
}

function unit(value, name) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1) {
    throw new ValidationError(name + ' must be a finite number in [0,1]');
  }
  return Object.is(value, -0) ? 0 : value;
}

function enumValue(value, allowed, name) {
  if (!allowed.includes(value)) {
    throw new ValidationError(name + ' must be one of ' + allowed.join(', '));
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

function sortCandidates(left, right) {
  return left.operation_id.localeCompare(right.operation_id)
    || left.manifest_digest.localeCompare(right.manifest_digest);
}

function sortSemantic(left, right) {
  return right.support - left.support
    || left.operation_id.localeCompare(right.operation_id)
    || left.manifest_digest.localeCompare(right.manifest_digest);
}

function normalizeCandidate(candidate, index) {
  const value = exact(
    candidate,
    ['operationId', 'manifestDigest', 'eligible', 'eligibilityReason', 'deterministicMatch'],
    'operation candidate[' + index + ']'
  );
  const operationId = identifier(value.operationId, 'operation candidate[' + index + '].operationId');
  const manifestDigest = digest(
    value.manifestDigest,
    'operation candidate[' + index + '].manifestDigest'
  );
  const eligible = boolean(value.eligible, 'operation candidate[' + index + '].eligible');
  const eligibilityReason = identifier(
    value.eligibilityReason,
    'operation candidate[' + index + '].eligibilityReason'
  );
  const deterministicMatch = boolean(
    value.deterministicMatch,
    'operation candidate[' + index + '].deterministicMatch'
  );

  if (eligible && eligibilityReason !== 'eligible') {
    throw new ValidationError('eligible operation candidates must use eligibilityReason eligible');
  }
  if (!eligible && eligibilityReason === 'eligible') {
    throw new ValidationError('ineligible operation candidates must state a non-eligible reason');
  }

  return {
    operation_id: operationId,
    manifest_digest: manifestDigest,
    eligible,
    eligibility_reason: eligibilityReason,
    deterministic_match: deterministicMatch
  };
}

function normalizePolicy(policy) {
  const value = exact(
    policy,
    ['minimumSupport', 'singleSelectSupport', 'topK', 'contextBudget', 'fallbackBehavior'],
    'operation candidate policy'
  );
  const minimumSupport = unit(value.minimumSupport, 'operation candidate policy.minimumSupport');
  const singleSelectSupport = unit(
    value.singleSelectSupport,
    'operation candidate policy.singleSelectSupport'
  );
  const topK = integer(value.topK, 'operation candidate policy.topK', 1, MAX_CANDIDATES);
  const contextBudget = integer(
    value.contextBudget,
    'operation candidate policy.contextBudget',
    1,
    MAX_CANDIDATES
  );
  const fallbackBehavior = enumValue(
    value.fallbackBehavior,
    FALLBACK_BEHAVIORS,
    'operation candidate policy.fallbackBehavior'
  );

  if (singleSelectSupport < minimumSupport) {
    throw new ValidationError('singleSelectSupport must be greater than or equal to minimumSupport');
  }
  if (topK > contextBudget) {
    throw new ValidationError('topK cannot exceed contextBudget');
  }

  return {
    minimum_support: minimumSupport,
    single_select_support: singleSelectSupport,
    top_k: topK,
    context_budget: contextBudget,
    fallback_behavior: fallbackBehavior
  };
}

export function computeOperationCandidateStateDigest(input) {
  const value = exact(
    input,
    ['taskPurposeDigest', 'operationId', 'manifestDigest'],
    'operation candidate state digest input'
  );
  const taskPurposeDigest = digest(
    value.taskPurposeDigest,
    'operation candidate state digest input.taskPurposeDigest'
  );
  const operationId = identifier(
    value.operationId,
    'operation candidate state digest input.operationId'
  );
  const manifestDigest = digest(
    value.manifestDigest,
    'operation candidate state digest input.manifestDigest'
  );

  return digestObject({
    schema: OPERATION_CANDIDATE_STATE_SCHEMA,
    task_purpose_digest: taskPurposeDigest,
    operation_id: operationId,
    manifest_digest: manifestDigest
  });
}

function normalizeSemanticEnvelope(entry, index, candidateById) {
  const value = exact(
    entry,
    ['operationId', 'manifestDigest', 'observation', 'providerProfile', 'questionSchema'],
    'semantic evidence[' + index + ']'
  );
  const operationId = identifier(
    value.operationId,
    'semantic evidence[' + index + '].operationId'
  );
  const manifestDigest = digest(
    value.manifestDigest,
    'semantic evidence[' + index + '].manifestDigest'
  );
  const candidate = candidateById.get(operationId);
  if (!candidate) {
    throw new ValidationError('semantic evidence references unknown operation ' + operationId);
  }
  if (candidate.manifest_digest !== manifestDigest) {
    throw new ValidationError('semantic evidence manifest digest does not match candidate');
  }
  return {
    operationId,
    manifestDigest,
    observation: value.observation,
    providerProfile: value.providerProfile,
    questionSchema: value.questionSchema
  };
}

function validateSemanticEvidence(entry, candidate, taskPurposeDigest) {
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
      throw new ValidationError('operation candidate relevance requires binary-probability evidence');
    }
    if (entry.questionSchema.purpose !== PURPOSE) {
      throw new ValidationError('operation candidate relevance purpose is invalid');
    }
    if (entry.questionSchema.domain !== DOMAIN) {
      throw new ValidationError('operation candidate relevance domain is invalid');
    }
    if (entry.questionSchema.state_contract_ref !== OPERATION_CANDIDATE_STATE_SCHEMA) {
      throw new ValidationError('operation candidate relevance state contract is invalid');
    }

    const expectedStateDigest = computeOperationCandidateStateDigest({
      taskPurposeDigest,
      operationId: candidate.operation_id,
      manifestDigest: candidate.manifest_digest
    });
    if (entry.observation.state_digest !== expectedStateDigest) {
      throw new ValidationError('operation candidate relevance state digest is stale or mismatched');
    }

    const support = unit(
      entry.observation.answer.p_true,
      'operation candidate relevance p_true'
    );

    return {
      valid: true,
      evidence: {
        operation_id: candidate.operation_id,
        manifest_digest: candidate.manifest_digest,
        observation_digest: entry.observation.observation_digest,
        provider_profile_digest: entry.observation.provider_profile_digest,
        question_schema_digest: entry.observation.question_schema_digest,
        state_digest: entry.observation.state_digest,
        support
      }
    };
  } catch (error) {
    if (error instanceof ValidationError || error instanceof TypeError) {
      return { valid: false, evidence: null };
    }
    throw error;
  }
}

function selectedEntry(candidate, reason, evidence = null) {
  return {
    operation_id: candidate.operation_id,
    manifest_digest: candidate.manifest_digest,
    reason,
    support: evidence ? evidence.support : null,
    observation_digest: evidence ? evidence.observation_digest : null
  };
}

function withheldEntry(candidate, reason) {
  return {
    operation_id: candidate.operation_id,
    manifest_digest: candidate.manifest_digest,
    reason
  };
}

function fallbackSelection({
  eligible,
  ineligible,
  evidenceById,
  policy,
  uncertaintyReasons
}) {
  const reasons = [...new Set(uncertaintyReasons)].sort();

  if (
    policy.fallback_behavior === 'retain-eligible'
    && eligible.length <= policy.context_budget
  ) {
    return {
      selectionMode: 'fallback-retain-eligible',
      recommendedAction: 'deliberate-with-retained-context',
      unresolved: true,
      uncertaintyReasons: reasons,
      selected: eligible.map(candidate => selectedEntry(
        candidate,
        'fallback-visible',
        evidenceById.get(candidate.operation_id) || null
      )),
      withheld: ineligible.map(candidate => withheldEntry(candidate, 'deterministic-ineligible'))
    };
  }

  if (eligible.length > policy.context_budget && !reasons.includes('context-budget-exceeded')) {
    reasons.push('context-budget-exceeded');
    reasons.sort();
  }

  return {
    selectionMode: 'fallback-escalate',
    recommendedAction: 'escalate',
    unresolved: true,
    uncertaintyReasons: reasons,
    selected: [],
    withheld: [
      ...ineligible.map(candidate => withheldEntry(candidate, 'deterministic-ineligible')),
      ...eligible.map(candidate => withheldEntry(candidate, 'fallback-escalation'))
    ].sort(sortCandidates)
  };
}

function selectCandidates({
  candidates,
  evidenceById,
  invalidEvidenceIds,
  policy
}) {
  const eligible = candidates.filter(candidate => candidate.eligible);
  const ineligible = candidates.filter(candidate => !candidate.eligible);

  if (eligible.length === 0) {
    return {
      selectionMode: 'no-eligible-candidates',
      recommendedAction: 'escalate',
      unresolved: true,
      uncertaintyReasons: ['no-eligible-candidates'],
      selected: [],
      withheld: ineligible.map(candidate => withheldEntry(candidate, 'deterministic-ineligible'))
    };
  }

  const exactMatches = eligible.filter(candidate => candidate.deterministic_match);
  if (exactMatches.length > 1) {
    throw new ValidationError('deterministic exact match must identify at most one eligible operation');
  }
  if (exactMatches.length === 1) {
    const exactMatch = exactMatches[0];
    return {
      selectionMode: 'deterministic-exact',
      recommendedAction: 'continue-with-bounded-context',
      unresolved: false,
      uncertaintyReasons: [],
      selected: [selectedEntry(exactMatch, 'deterministic-exact-match')],
      withheld: candidates
        .filter(candidate => candidate.operation_id !== exactMatch.operation_id)
        .map(candidate => withheldEntry(
          candidate,
          candidate.eligible ? 'not-exact-match' : 'deterministic-ineligible'
        ))
        .sort(sortCandidates)
    };
  }

  const missingEvidence = eligible.filter(
    candidate => !evidenceById.has(candidate.operation_id)
      && !invalidEvidenceIds.has(candidate.operation_id)
  );
  const invalidEvidence = eligible.filter(
    candidate => invalidEvidenceIds.has(candidate.operation_id)
  );

  if (missingEvidence.length > 0 || invalidEvidence.length > 0) {
    return fallbackSelection({
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

  const ranked = eligible
    .map(candidate => ({
      candidate,
      evidence: evidenceById.get(candidate.operation_id)
    }))
    .sort((left, right) => sortSemantic(left.evidence, right.evidence));

  const top = ranked[0];
  if (top.evidence.support < policy.minimum_support) {
    return fallbackSelection({
      eligible,
      ineligible,
      evidenceById,
      policy,
      uncertaintyReasons: ['low-semantic-support']
    });
  }

  const secondSupport = ranked.length > 1 ? ranked[1].evidence.support : -1;
  if (
    top.evidence.support >= policy.single_select_support
    && top.evidence.support > secondSupport
  ) {
    return {
      selectionMode: 'semantic-single',
      recommendedAction: 'continue-with-bounded-context',
      unresolved: false,
      uncertaintyReasons: [],
      selected: [selectedEntry(top.candidate, 'semantic-high-support', top.evidence)],
      withheld: [
        ...ineligible.map(candidate => withheldEntry(candidate, 'deterministic-ineligible')),
        ...ranked.slice(1).map(item => withheldEntry(
          item.candidate,
          item.evidence.support < policy.minimum_support
            ? 'below-minimum-support'
            : 'outside-single-selection'
        ))
      ].sort(sortCandidates)
    };
  }

  const aboveMinimum = ranked.filter(
    item => item.evidence.support >= policy.minimum_support
  );
  if (aboveMinimum.length === 0) {
    return fallbackSelection({
      eligible,
      ineligible,
      evidenceById,
      policy,
      uncertaintyReasons: ['low-semantic-support']
    });
  }

  const selectedItems = aboveMinimum.slice(0, policy.top_k);
  const selectedIds = new Set(selectedItems.map(item => item.candidate.operation_id));

  return {
    selectionMode: 'semantic-top-k',
    recommendedAction: 'continue-with-bounded-context',
    unresolved: false,
    uncertaintyReasons: [],
    selected: selectedItems.map(item => selectedEntry(
      item.candidate,
      'semantic-top-k',
      item.evidence
    )),
    withheld: [
      ...ineligible.map(candidate => withheldEntry(candidate, 'deterministic-ineligible')),
      ...ranked
        .filter(item => !selectedIds.has(item.candidate.operation_id))
        .map(item => withheldEntry(
          item.candidate,
          item.evidence.support < policy.minimum_support
            ? 'below-minimum-support'
            : 'outside-top-k'
        ))
    ].sort(sortCandidates)
  };
}

function proposalDigestPayload(document) {
  const copy = structuredClone(document);
  delete copy.proposal_digest;
  return copy;
}

function validateSelectedEntry(item, index) {
  const value = exact(
    item,
    ['operation_id', 'manifest_digest', 'reason', 'support', 'observation_digest'],
    'operation candidate selection.selected[' + index + ']'
  );
  identifier(value.operation_id, 'operation candidate selection.selected[' + index + '].operation_id');
  digest(value.manifest_digest, 'operation candidate selection.selected[' + index + '].manifest_digest');
  identifier(value.reason, 'operation candidate selection.selected[' + index + '].reason');
  if (value.support !== null) unit(value.support, 'operation candidate selection.selected[' + index + '].support');
  if (value.observation_digest !== null) {
    digest(
      value.observation_digest,
      'operation candidate selection.selected[' + index + '].observation_digest'
    );
  }
}

function validateWithheldEntry(item, index) {
  const value = exact(
    item,
    ['operation_id', 'manifest_digest', 'reason'],
    'operation candidate selection.withheld[' + index + ']'
  );
  identifier(value.operation_id, 'operation candidate selection.withheld[' + index + '].operation_id');
  digest(value.manifest_digest, 'operation candidate selection.withheld[' + index + '].manifest_digest');
  identifier(value.reason, 'operation candidate selection.withheld[' + index + '].reason');
}

function validateSemanticSummary(item, index) {
  const value = exact(
    item,
    [
      'operation_id',
      'manifest_digest',
      'observation_digest',
      'provider_profile_digest',
      'question_schema_digest',
      'state_digest',
      'support'
    ],
    'operation candidate selection.validated_semantic_evidence[' + index + ']'
  );
  identifier(
    value.operation_id,
    'operation candidate selection.validated_semantic_evidence[' + index + '].operation_id'
  );
  for (const field of [
    'manifest_digest',
    'observation_digest',
    'provider_profile_digest',
    'question_schema_digest',
    'state_digest'
  ]) {
    digest(
      value[field],
      'operation candidate selection.validated_semantic_evidence[' + index + '].' + field
    );
  }
  unit(
    value.support,
    'operation candidate selection.validated_semantic_evidence[' + index + '].support'
  );
}

export function validateOperationCandidateSelectionProposal(document) {
  const value = exact(
    document,
    DOCUMENT_FIELDS,
    'operation candidate selection proposal'
  );

  if (
    value.schema !== OPERATION_CANDIDATE_SELECTION_SCHEMA
    || value.version !== VERSION
    || value.status !== STATUS
  ) {
    throw new ValidationError('operation candidate selection schema version or status is unsupported');
  }

  identifier(value.proposal_id, 'operation candidate selection.proposal_id');
  digest(value.task_purpose_digest, 'operation candidate selection.task_purpose_digest');
  digest(value.candidate_set_digest, 'operation candidate selection.candidate_set_digest');
  digest(
    value.semantic_evidence_input_digest,
    'operation candidate selection.semantic_evidence_input_digest'
  );
  digest(value.policy_digest, 'operation candidate selection.policy_digest');
  enumValue(value.selection_mode, SELECTION_MODES, 'operation candidate selection.selection_mode');
  enumValue(
    value.recommended_action,
    RECOMMENDED_ACTIONS,
    'operation candidate selection.recommended_action'
  );
  boolean(value.unresolved, 'operation candidate selection.unresolved');

  if (!Array.isArray(value.selected) || value.selected.length > MAX_CANDIDATES) {
    throw new ValidationError('operation candidate selection.selected must be a bounded array');
  }
  if (!Array.isArray(value.withheld) || value.withheld.length > MAX_CANDIDATES) {
    throw new ValidationError('operation candidate selection.withheld must be a bounded array');
  }
  if (
    !Array.isArray(value.validated_semantic_evidence)
    || value.validated_semantic_evidence.length > MAX_CANDIDATES
  ) {
    throw new ValidationError(
      'operation candidate selection.validated_semantic_evidence must be a bounded array'
    );
  }
  if (!Array.isArray(value.uncertainty_reasons) || value.uncertainty_reasons.length > 8) {
    throw new ValidationError(
      'operation candidate selection.uncertainty_reasons must be a bounded array'
    );
  }

  value.selected.forEach(validateSelectedEntry);
  value.withheld.forEach(validateWithheldEntry);
  value.validated_semantic_evidence.forEach(validateSemanticSummary);
  for (const [index, reason] of value.uncertainty_reasons.entries()) {
    enumValue(
      reason,
      UNCERTAINTY_REASONS,
      'operation candidate selection.uncertainty_reasons[' + index + ']'
    );
  }

  const selectedIds = new Set();
  for (const item of value.selected) {
    if (selectedIds.has(item.operation_id)) {
      throw new ValidationError('operation candidate selection.selected contains duplicate operation_id');
    }
    selectedIds.add(item.operation_id);
  }
  const withheldIds = new Set();
  for (const item of value.withheld) {
    if (withheldIds.has(item.operation_id)) {
      throw new ValidationError('operation candidate selection.withheld contains duplicate operation_id');
    }
    if (selectedIds.has(item.operation_id)) {
      throw new ValidationError('operation candidate cannot be both selected and withheld');
    }
    withheldIds.add(item.operation_id);
  }

  if (
    value.authority_effect !== 'none'
    || value.assurance_effect !== 'none'
    || value.network_effect !== 'none'
    || value.persistence_effect !== 'none'
    || value.credential_visibility !== 'none'
    || value.runtime_activation !== false
    || value.execution_effect !== 'none'
    || value.selection_effect !== 'context-selection-only'
  ) {
    throw new ValidationError('operation candidate selection effect boundary is invalid');
  }

  const expectedProposalId = 'operation_candidate_selection_' + digestObject({
    task_purpose_digest: value.task_purpose_digest,
    candidate_set_digest: value.candidate_set_digest,
    semantic_evidence_input_digest: value.semantic_evidence_input_digest,
    policy_digest: value.policy_digest
  });
  if (value.proposal_id !== expectedProposalId) {
    throw new ValidationError('operation candidate selection proposal_id does not match inputs');
  }

  const expectedDigest = digestObject(proposalDigestPayload(value));
  if (value.proposal_digest !== expectedDigest) {
    throw new ValidationError('operation candidate selection proposal digest is invalid');
  }

  return Object.freeze({ valid: true, proposal_digest: expectedDigest });
}

export function createOperationCandidateSelectionProposal(input) {
  const value = exact(
    input,
    ['taskPurposeDigest', 'candidates', 'semanticEvidence', 'policy'],
    'operation candidate selection input'
  );

  const taskPurposeDigest = digest(
    value.taskPurposeDigest,
    'operation candidate selection input.taskPurposeDigest'
  );
  if (
    !Array.isArray(value.candidates)
    || value.candidates.length < 1
    || value.candidates.length > MAX_CANDIDATES
  ) {
    throw new ValidationError(
      'operation candidate selection input.candidates must contain 1-' + MAX_CANDIDATES + ' entries'
    );
  }
  if (!Array.isArray(value.semanticEvidence) || value.semanticEvidence.length > MAX_CANDIDATES) {
    throw new ValidationError(
      'operation candidate selection input.semanticEvidence must be a bounded array'
    );
  }

  const candidates = value.candidates
    .map(normalizeCandidate)
    .sort(sortCandidates);
  const candidateById = new Map();
  for (const candidate of candidates) {
    if (candidateById.has(candidate.operation_id)) {
      throw new ValidationError('operation candidate selection contains duplicate operation_id');
    }
    candidateById.set(candidate.operation_id, candidate);
  }

  const policy = normalizePolicy(value.policy);
  const candidateSetDigest = digestObject(candidates);
  const semanticEvidenceInputDigest = digestObject(value.semanticEvidence);
  const policyDigest = digestObject(policy);

  const semanticEnvelopes = value.semanticEvidence.map((entry, index) =>
    normalizeSemanticEnvelope(entry, index, candidateById)
  );
  const seenEvidenceIds = new Set();
  const evidenceById = new Map();
  const invalidEvidenceIds = new Set();

  for (const entry of semanticEnvelopes) {
    if (seenEvidenceIds.has(entry.operationId)) {
      throw new ValidationError(
        'operation candidate selection contains duplicate semantic evidence for ' + entry.operationId
      );
    }
    seenEvidenceIds.add(entry.operationId);

    const candidate = candidateById.get(entry.operationId);
    if (!candidate.eligible) continue;

    const result = validateSemanticEvidence(entry, candidate, taskPurposeDigest);
    if (!result.valid) {
      invalidEvidenceIds.add(candidate.operation_id);
      continue;
    }
    evidenceById.set(candidate.operation_id, result.evidence);
  }

  const selection = selectCandidates({
    candidates,
    evidenceById,
    invalidEvidenceIds,
    policy
  });

  const validatedSemanticEvidence = [...evidenceById.values()].sort(sortSemantic);
  const proposalId = 'operation_candidate_selection_' + digestObject({
    task_purpose_digest: taskPurposeDigest,
    candidate_set_digest: candidateSetDigest,
    semantic_evidence_input_digest: semanticEvidenceInputDigest,
    policy_digest: policyDigest
  });

  const document = {
    schema: OPERATION_CANDIDATE_SELECTION_SCHEMA,
    version: VERSION,
    status: STATUS,
    proposal_id: proposalId,
    task_purpose_digest: taskPurposeDigest,
    candidate_set_digest: candidateSetDigest,
    semantic_evidence_input_digest: semanticEvidenceInputDigest,
    policy_digest: policyDigest,
    selection_mode: selection.selectionMode,
    recommended_action: selection.recommendedAction,
    selected: selection.selected,
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
    selection_effect: 'context-selection-only'
  };

  document.proposal_digest = digestObject(proposalDigestPayload(document));
  validateOperationCandidateSelectionProposal(document);
  return deepFreeze(document);
}
