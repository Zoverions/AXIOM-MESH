import {
  assertPlainObject,
  assertString,
  digestObject,
  ValidationError
} from './canonical.mjs';

export const PERSONAL_AGENT_KERNEL_V0_SCHEMA = 'axiom-personal-agent-kernel.v0';
export const PERSONAL_AGENT_KERNEL_PROPOSAL_V0_SCHEMA =
  'axiom-personal-agent-kernel-proposal.v0';
export const PERSONAL_AGENT_MEMORY_CANDIDATE_V0_SCHEMA =
  'axiom-personal-agent-memory-candidate.v0';
export const PERSONAL_AGENT_AUTONOMY_EVIDENCE_V0_SCHEMA =
  'axiom-personal-agent-autonomy-evidence.v0';
export const PERSONAL_AGENT_KERNEL_CONTINUITY_DESCRIPTOR_V0_SCHEMA =
  'axiom-personal-agent-kernel-continuity-descriptor.v0';

const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/;
const VERSION_PATTERN = /^[0-9]+\.[0-9]+\.[0-9]+(?:-[0-9A-Za-z.-]+)?$/;
const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const UTC_DATE_TIME_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/;
const CURRENCY_PATTERN = /^[A-Z]{3}$/;
const MAX_SAFE = Number.MAX_SAFE_INTEGER;

const AUTONOMY_LEVELS = Object.freeze([
  'observe',
  'draft',
  'prepare',
  'request-effect'
]);
const AUTONOMY_RANK = new Map(
  AUTONOMY_LEVELS.map((level, index) => [level, index])
);

const BUDGET_UNITS = Object.freeze({
  actions: 'count',
  'wall-time-seconds': 'seconds',
  'compute-milliseconds': 'milliseconds',
  'network-bytes': 'bytes',
  'data-items': 'count',
  'attention-seconds': 'seconds',
  'minor-currency-units': 'minor-units',
  'delegation-hops': 'count'
});
const BUDGET_DIMENSIONS = new Set(Object.keys(BUDGET_UNITS));

const MEMORY_SOURCE_KINDS = new Set([
  'owner-direct',
  'signed-local-artifact',
  'verified-remote-artifact',
  'agent-inference',
  'third-party',
  'imported-memory'
]);
const SENSITIVITY_CLASSES = new Set([
  'ordinary-private',
  'sensitive',
  'restricted',
  'critical-secret'
]);
const PERSISTENCE_CLASSES = new Set(['ephemeral', 'durable']);

const KERNEL_KEYS = Object.freeze([
  'schema',
  'kernel_id',
  'kernel_version',
  'owner_subject_ref',
  'identity_binding',
  'constitution',
  'authority_budgets',
  'memory_immune_policy',
  'earned_autonomy',
  'continuity',
  'non_claims',
  'created_at',
  'updated_at'
]);

const IDENTITY_KEYS = Object.freeze([
  'principal_ref',
  'personal_agent_pack_ref',
  'personal_agent_pack_sha256',
  'runtime_identity_is_replaceable',
  'model_identity_is_replaceable',
  'model_is_identity_root',
  'runtime_is_identity_root'
]);

const CONSTITUTION_KEYS = Object.freeze([
  'constitution_id',
  'amendment_policy_ref',
  'owner_stop_right',
  'owner_inspect_right',
  'owner_revoke_right',
  'owner_export_right',
  'self_amendment_allowed',
  'subdelegation_may_expand_authority',
  'authority_may_be_inferred_from_knowledge',
  'memory_may_create_authority',
  'model_output_may_create_authority',
  'earned_autonomy_may_create_authority',
  'effect_requires_mesh_authority'
]);

const BUDGET_KEYS = Object.freeze([
  'budget_id',
  'dimension',
  'unit',
  'currency',
  'ceiling',
  'consumed',
  'applies_to_capability_refs',
  'valid_from',
  'expires_at'
]);

const MEMORY_POLICY_KEYS = Object.freeze([
  'default_disposition',
  'require_provenance',
  'preserve_contradictions',
  'unverified_provenance_must_quarantine',
  'derived_memory_requires_independent_evidence',
  'minimum_independent_evidence_refs_for_derived',
  'direct_admission_source_kinds',
  'derived_source_kinds',
  'quarantine_grants_authority',
  'admission_grants_authority'
]);

const AUTONOMY_KEYS = Object.freeze([
  'capability_ref',
  'level',
  'successful_receipts',
  'failed_receipts',
  'evidence_refs',
  'promotion_policy',
  'promotion_decision_ref',
  'last_reviewed_at'
]);

const PROMOTION_POLICY_KEYS = Object.freeze([
  'next_level',
  'minimum_successful_receipts',
  'maximum_failed_receipts',
  'minimum_evidence_refs'
]);

const CONTINUITY_KEYS = Object.freeze([
  'personal_agent_pack_ref',
  'personal_agent_pack_sha256',
  'restore_policy_ref',
  'portable_across_models',
  'portable_across_providers',
  'portable_across_runtimes',
  'selective_restore_required',
  'raw_secret_material_included',
  'import_grants_authority',
  'restore_grants_authority'
]);

const NON_CLAIM_KEYS = Object.freeze([
  'network_effect',
  'storage_effect',
  'credential_effect',
  'execution_effect',
  'policy_mutation_effect',
  'capability_promotion_effect',
  'opens_vaults',
  'grants_execution_authority'
]);

const PROPOSAL_KEYS = Object.freeze([
  'schema',
  'proposal_id',
  'owner_subject_ref',
  'capability_ref',
  'purpose_ref',
  'requested_autonomy_level',
  'budget_requests',
  'memory_refs',
  'uses_quarantined_memory',
  'effect_requested'
]);

const BUDGET_REQUEST_KEYS = Object.freeze([
  'budget_id',
  'amount',
  'unit',
  'currency'
]);

const MEMORY_CANDIDATE_KEYS = Object.freeze([
  'schema',
  'candidate_id',
  'owner_subject_ref',
  'content_sha256',
  'source_ref',
  'source_kind',
  'provenance_verified',
  'independent_evidence_refs',
  'contradicts_memory_refs',
  'requested_persistence',
  'sensitivity',
  'content_embedded',
  'secret_material_embedded'
]);

const AUTONOMY_EVIDENCE_KEYS = Object.freeze([
  'schema',
  'owner_subject_ref',
  'capability_ref',
  'target_level',
  'successful_receipts',
  'failed_receipts',
  'evidence_refs',
  'at'
]);

export function validatePersonalAgentKernelV0(kernel) {
  assertPlainObject(kernel, 'personal agent kernel');
  exactKeys(kernel, KERNEL_KEYS, KERNEL_KEYS, 'personal agent kernel');

  assertConst(kernel.schema, PERSONAL_AGENT_KERNEL_V0_SCHEMA, 'kernel schema');
  assertId(kernel.kernel_id, 'kernel_id');
  assertVersion(kernel.kernel_version, 'kernel_version');
  assertId(kernel.owner_subject_ref, 'owner_subject_ref');

  validateIdentityBinding(kernel.identity_binding);
  validateConstitution(kernel.constitution);
  validateAuthorityBudgets(kernel.authority_budgets);
  validateMemoryImmunePolicy(kernel.memory_immune_policy);
  validateEarnedAutonomy(kernel.earned_autonomy);
  validateContinuity(kernel.continuity, kernel.identity_binding);
  validateNonClaims(kernel.non_claims);

  const createdAt = assertUtcDateTime(kernel.created_at, 'created_at');
  const updatedAt = assertUtcDateTime(kernel.updated_at, 'updated_at');
  if (updatedAt < createdAt) {
    throw new ValidationError('updated_at cannot predate created_at');
  }

  return Object.freeze({
    valid: true,
    schema: PERSONAL_AGENT_KERNEL_V0_SCHEMA,
    kernel_id: kernel.kernel_id,
    owner_subject_ref: kernel.owner_subject_ref,
    authority_budgets: kernel.authority_budgets.length,
    earned_autonomy_capabilities: kernel.earned_autonomy.length,
    canonical_sha256: digestObject(kernel),
    network_effect: false,
    storage_effect: false,
    credential_effect: false,
    execution_effect: false,
    policy_mutation_effect: false,
    grants_execution_authority: false
  });
}

export function assessPersonalAgentKernelProposal(
  kernel,
  proposal,
  { at } = {}
) {
  const kernelResult = validatePersonalAgentKernelV0(kernel);
  validateProposal(proposal);

  if (proposal.owner_subject_ref !== kernel.owner_subject_ref) {
    throw new ValidationError('proposal owner does not match kernel owner');
  }

  const referenceTime = assertUtcDateTime(at, 'assessment time');
  const blockers = [];

  const autonomy = kernel.earned_autonomy.find(
    entry => entry.capability_ref === proposal.capability_ref
  );

  if (!autonomy) {
    blockers.push('capability-has-no-earned-autonomy-state');
  } else if (
    AUTONOMY_RANK.get(proposal.requested_autonomy_level) >
    AUTONOMY_RANK.get(autonomy.level)
  ) {
    blockers.push('requested-autonomy-exceeds-earned-ceiling');
  }

  if (
    proposal.effect_requested &&
    proposal.requested_autonomy_level !== 'request-effect'
  ) {
    blockers.push('effect-request-requires-request-effect-level');
  }

  if (proposal.uses_quarantined_memory) {
    blockers.push('quarantined-memory-cannot-support-proposal');
  }

  const requestsById = new Map();
  for (const request of proposal.budget_requests) {
    if (requestsById.has(request.budget_id)) {
      throw new ValidationError(
        'duplicate proposal budget_id: ' + request.budget_id
      );
    }
    requestsById.set(request.budget_id, request);
  }

  const applicableBudgets = kernel.authority_budgets.filter(budget =>
    budget.applies_to_capability_refs.includes(proposal.capability_ref)
  );

  const applicableBudgetIds = new Set(
    applicableBudgets.map(budget => budget.budget_id)
  );

  for (const request of proposal.budget_requests) {
    if (!applicableBudgetIds.has(request.budget_id)) {
      blockers.push('unbound-budget-request:' + request.budget_id);
    }
  }

  for (const budget of applicableBudgets) {
    const request = requestsById.get(budget.budget_id);
    if (!request) {
      blockers.push('missing-applicable-budget:' + budget.budget_id);
      continue;
    }

    const validFrom = assertUtcDateTime(
      budget.valid_from,
      'budget ' + budget.budget_id + ' valid_from'
    );
    const expiresAt = assertUtcDateTime(
      budget.expires_at,
      'budget ' + budget.budget_id + ' expires_at'
    );

    if (referenceTime < validFrom || referenceTime >= expiresAt) {
      blockers.push('budget-not-current:' + budget.budget_id);
    }

    if (request.unit !== budget.unit) {
      blockers.push('budget-unit-mismatch:' + budget.budget_id);
    }

    if ((request.currency ?? null) !== (budget.currency ?? null)) {
      blockers.push('budget-currency-mismatch:' + budget.budget_id);
    }

    const remaining = budget.ceiling - budget.consumed;
    if (request.amount > remaining) {
      blockers.push('budget-exceeded:' + budget.budget_id);
    }
  }

  const uniqueBlockers = Object.freeze([...new Set(blockers)].sort());

  return Object.freeze({
    valid: true,
    kernel_id: kernelResult.kernel_id,
    proposal_id: proposal.proposal_id,
    owner_subject_ref: proposal.owner_subject_ref,
    capability_ref: proposal.capability_ref,
    assessed_at: at,
    eligible_within_personal_policy: uniqueBlockers.length === 0,
    blockers: uniqueBlockers,
    effect_requested: proposal.effect_requested,
    requires_mesh_authority_verification: proposal.effect_requested,
    mesh_authority_verified: false,
    effect_performed: false,
    grants_execution_authority: false,
    proposal_sha256: digestObject(proposal)
  });
}

export function assessPersonalAgentMemoryCandidate(kernel, candidate) {
  validatePersonalAgentKernelV0(kernel);
  validateMemoryCandidate(candidate);

  if (candidate.owner_subject_ref !== kernel.owner_subject_ref) {
    throw new ValidationError('memory candidate owner does not match kernel owner');
  }

  const policy = kernel.memory_immune_policy;
  const reasons = [];

  if (!candidate.provenance_verified) {
    reasons.push('provenance-unverified');
  }

  if (candidate.contradicts_memory_refs.length > 0) {
    reasons.push('contradiction-requires-review');
  }

  const directKinds = new Set(policy.direct_admission_source_kinds);
  const derivedKinds = new Set(policy.derived_source_kinds);

  if (derivedKinds.has(candidate.source_kind)) {
    if (
      candidate.independent_evidence_refs.length <
      policy.minimum_independent_evidence_refs_for_derived
    ) {
      reasons.push('insufficient-independent-evidence');
    }
  } else if (!directKinds.has(candidate.source_kind)) {
    reasons.push('source-kind-not-admissible');
  }

  let disposition = 'quarantine';
  if (reasons.length === 0) {
    disposition =
      candidate.requested_persistence === 'durable'
        ? 'admit-durable'
        : 'retain-ephemeral';
  }

  return Object.freeze({
    valid: true,
    candidate_id: candidate.candidate_id,
    owner_subject_ref: candidate.owner_subject_ref,
    disposition,
    reasons: Object.freeze([...new Set(reasons)].sort()),
    truth_certified: false,
    content_persisted_by_evaluator: false,
    grants_execution_authority: false,
    candidate_sha256: digestObject(candidate)
  });
}

export function assessPersonalAgentAutonomyPromotion(kernel, evidence) {
  validatePersonalAgentKernelV0(kernel);
  validateAutonomyEvidence(evidence);

  if (evidence.owner_subject_ref !== kernel.owner_subject_ref) {
    throw new ValidationError('autonomy evidence owner does not match kernel owner');
  }

  const entry = kernel.earned_autonomy.find(
    candidate => candidate.capability_ref === evidence.capability_ref
  );
  if (!entry) {
    throw new ValidationError('autonomy evidence capability is not registered');
  }

  const policy = entry.promotion_policy;
  const blockers = [];

  if (policy.next_level === 'none') {
    blockers.push('already-at-terminal-personal-policy-level');
  } else if (evidence.target_level !== policy.next_level) {
    blockers.push('target-level-is-not-next-level');
  }

  if (evidence.successful_receipts < policy.minimum_successful_receipts) {
    blockers.push('insufficient-successful-receipts');
  }

  if (evidence.failed_receipts > policy.maximum_failed_receipts) {
    blockers.push('too-many-failed-receipts');
  }

  if (evidence.evidence_refs.length < policy.minimum_evidence_refs) {
    blockers.push('insufficient-evidence-refs');
  }

  const reviewedAt = assertUtcDateTime(entry.last_reviewed_at, 'last_reviewed_at');
  const evidenceAt = assertUtcDateTime(evidence.at, 'autonomy evidence at');
  if (evidenceAt < reviewedAt) {
    blockers.push('evidence-predates-current-review-state');
  }

  const uniqueBlockers = Object.freeze([...new Set(blockers)].sort());

  return Object.freeze({
    valid: true,
    capability_ref: evidence.capability_ref,
    current_level: entry.level,
    target_level: evidence.target_level,
    promotion_eligible_for_authorized_review: uniqueBlockers.length === 0,
    blockers: uniqueBlockers,
    promotion_performed: false,
    requires_authorized_promotion_decision: true,
    policy_mutated: false,
    grants_execution_authority: false,
    evidence_sha256: digestObject(evidence)
  });
}

export function buildPersonalAgentKernelContinuityDescriptor(kernel) {
  const result = validatePersonalAgentKernelV0(kernel);

  return Object.freeze({
    schema: PERSONAL_AGENT_KERNEL_CONTINUITY_DESCRIPTOR_V0_SCHEMA,
    kernel_id: kernel.kernel_id,
    kernel_version: kernel.kernel_version,
    owner_subject_ref: kernel.owner_subject_ref,
    kernel_sha256: result.canonical_sha256,
    personal_agent_pack_ref: kernel.continuity.personal_agent_pack_ref,
    personal_agent_pack_sha256:
      kernel.continuity.personal_agent_pack_sha256,
    restore_policy_ref: kernel.continuity.restore_policy_ref,
    raw_secret_material_included: false,
    restoration_is_authority: false,
    grants_execution_authority: false
  });
}

function validateIdentityBinding(identity) {
  assertPlainObject(identity, 'identity_binding');
  exactKeys(
    identity,
    IDENTITY_KEYS,
    IDENTITY_KEYS,
    'identity_binding'
  );
  assertId(identity.principal_ref, 'identity_binding.principal_ref');
  assertId(
    identity.personal_agent_pack_ref,
    'identity_binding.personal_agent_pack_ref'
  );
  assertSha256(
    identity.personal_agent_pack_sha256,
    'identity_binding.personal_agent_pack_sha256'
  );
  assertConst(
    identity.runtime_identity_is_replaceable,
    true,
    'identity_binding.runtime_identity_is_replaceable'
  );
  assertConst(
    identity.model_identity_is_replaceable,
    true,
    'identity_binding.model_identity_is_replaceable'
  );
  assertConst(
    identity.model_is_identity_root,
    false,
    'identity_binding.model_is_identity_root'
  );
  assertConst(
    identity.runtime_is_identity_root,
    false,
    'identity_binding.runtime_is_identity_root'
  );
}

function validateConstitution(constitution) {
  assertPlainObject(constitution, 'constitution');
  exactKeys(
    constitution,
    CONSTITUTION_KEYS,
    CONSTITUTION_KEYS,
    'constitution'
  );
  assertId(constitution.constitution_id, 'constitution.constitution_id');
  assertId(
    constitution.amendment_policy_ref,
    'constitution.amendment_policy_ref'
  );

  for (const field of [
    'owner_stop_right',
    'owner_inspect_right',
    'owner_revoke_right',
    'owner_export_right',
    'effect_requires_mesh_authority'
  ]) {
    assertConst(constitution[field], true, 'constitution.' + field);
  }

  for (const field of [
    'self_amendment_allowed',
    'subdelegation_may_expand_authority',
    'authority_may_be_inferred_from_knowledge',
    'memory_may_create_authority',
    'model_output_may_create_authority',
    'earned_autonomy_may_create_authority'
  ]) {
    assertConst(constitution[field], false, 'constitution.' + field);
  }
}

function validateAuthorityBudgets(budgets) {
  const list = assertArray(budgets, 'authority_budgets', { min: 0, max: 256 });
  const ids = new Set();

  for (const [index, budget] of list.entries()) {
    const name = 'authority_budgets[' + index + ']';
    assertPlainObject(budget, name);
    exactKeys(
      budget,
      BUDGET_KEYS,
      BUDGET_KEYS.filter(key => key !== 'currency'),
      name
    );

    const budgetId = assertId(budget.budget_id, name + '.budget_id');
    assertUnique(ids, budgetId, 'budget_id');
    assertEnum(budget.dimension, BUDGET_DIMENSIONS, name + '.dimension');

    const expectedUnit = BUDGET_UNITS[budget.dimension];
    assertConst(budget.unit, expectedUnit, name + '.unit');

    if (budget.dimension === 'minor-currency-units') {
      assertString(budget.currency, name + '.currency', {
        min: 3,
        max: 3,
        pattern: CURRENCY_PATTERN
      });
    } else if (budget.currency !== undefined) {
      throw new ValidationError(
        name + '.currency is only valid for minor-currency-units'
      );
    }

    assertInteger(budget.ceiling, name + '.ceiling', {
      min: 1,
      max: MAX_SAFE
    });
    assertInteger(budget.consumed, name + '.consumed', {
      min: 0,
      max: budget.ceiling
    });

    assertRefList(
      budget.applies_to_capability_refs,
      name + '.applies_to_capability_refs',
      { min: 1, max: 256 }
    );

    const validFrom = assertUtcDateTime(
      budget.valid_from,
      name + '.valid_from'
    );
    const expiresAt = assertUtcDateTime(
      budget.expires_at,
      name + '.expires_at'
    );
    if (validFrom >= expiresAt) {
      throw new ValidationError(name + '.expires_at must follow valid_from');
    }
  }
}

function validateMemoryImmunePolicy(policy) {
  assertPlainObject(policy, 'memory_immune_policy');
  exactKeys(
    policy,
    MEMORY_POLICY_KEYS,
    MEMORY_POLICY_KEYS,
    'memory_immune_policy'
  );

  assertConst(
    policy.default_disposition,
    'quarantine',
    'memory_immune_policy.default_disposition'
  );

  for (const field of [
    'require_provenance',
    'preserve_contradictions',
    'unverified_provenance_must_quarantine',
    'derived_memory_requires_independent_evidence'
  ]) {
    assertConst(policy[field], true, 'memory_immune_policy.' + field);
  }

  assertInteger(
    policy.minimum_independent_evidence_refs_for_derived,
    'memory_immune_policy.minimum_independent_evidence_refs_for_derived',
    { min: 1, max: 16 }
  );

  const direct = assertEnumList(
    policy.direct_admission_source_kinds,
    MEMORY_SOURCE_KINDS,
    'memory_immune_policy.direct_admission_source_kinds',
    { min: 1, max: MEMORY_SOURCE_KINDS.size }
  );
  const derived = assertEnumList(
    policy.derived_source_kinds,
    MEMORY_SOURCE_KINDS,
    'memory_immune_policy.derived_source_kinds',
    { min: 1, max: MEMORY_SOURCE_KINDS.size }
  );

  assertNoOverlap(direct, derived, 'memory source-kind policy');

  const covered = new Set([...direct, ...derived]);
  if (covered.size !== MEMORY_SOURCE_KINDS.size) {
    throw new ValidationError(
      'memory source-kind policy must classify every supported source kind'
    );
  }

  assertConst(
    policy.quarantine_grants_authority,
    false,
    'memory_immune_policy.quarantine_grants_authority'
  );
  assertConst(
    policy.admission_grants_authority,
    false,
    'memory_immune_policy.admission_grants_authority'
  );
}

function validateEarnedAutonomy(entries) {
  const list = assertArray(entries, 'earned_autonomy', { min: 0, max: 512 });
  const capabilities = new Set();

  for (const [index, entry] of list.entries()) {
    const name = 'earned_autonomy[' + index + ']';
    assertPlainObject(entry, name);
    exactKeys(entry, AUTONOMY_KEYS, AUTONOMY_KEYS, name);

    const capabilityRef = assertId(
      entry.capability_ref,
      name + '.capability_ref'
    );
    assertUnique(capabilities, capabilityRef, 'earned autonomy capability_ref');
    assertAutonomyLevel(entry.level, name + '.level');

    assertInteger(
      entry.successful_receipts,
      name + '.successful_receipts',
      { min: 0, max: MAX_SAFE }
    );
    assertInteger(
      entry.failed_receipts,
      name + '.failed_receipts',
      { min: 0, max: MAX_SAFE }
    );
    assertRefList(entry.evidence_refs, name + '.evidence_refs', {
      min: 0,
      max: 4096
    });
    assertId(
      entry.promotion_decision_ref,
      name + '.promotion_decision_ref'
    );
    assertUtcDateTime(entry.last_reviewed_at, name + '.last_reviewed_at');

    validatePromotionPolicy(entry.level, entry.promotion_policy, name);
  }
}

function validatePromotionPolicy(currentLevel, policy, parentName) {
  const name = parentName + '.promotion_policy';
  assertPlainObject(policy, name);
  exactKeys(
    policy,
    PROMOTION_POLICY_KEYS,
    PROMOTION_POLICY_KEYS,
    name
  );

  const currentRank = AUTONOMY_RANK.get(currentLevel);
  const expectedNext =
    currentRank === AUTONOMY_LEVELS.length - 1
      ? 'none'
      : AUTONOMY_LEVELS[currentRank + 1];

  assertConst(policy.next_level, expectedNext, name + '.next_level');

  assertInteger(
    policy.minimum_successful_receipts,
    name + '.minimum_successful_receipts',
    { min: expectedNext === 'none' ? 0 : 1, max: MAX_SAFE }
  );
  assertInteger(
    policy.maximum_failed_receipts,
    name + '.maximum_failed_receipts',
    { min: 0, max: MAX_SAFE }
  );
  assertInteger(
    policy.minimum_evidence_refs,
    name + '.minimum_evidence_refs',
    { min: expectedNext === 'none' ? 0 : 1, max: 4096 }
  );

  if (expectedNext === 'none') {
    assertConst(
      policy.minimum_successful_receipts,
      0,
      name + '.minimum_successful_receipts'
    );
    assertConst(
      policy.maximum_failed_receipts,
      0,
      name + '.maximum_failed_receipts'
    );
    assertConst(
      policy.minimum_evidence_refs,
      0,
      name + '.minimum_evidence_refs'
    );
  }
}

function validateContinuity(continuity, identity) {
  assertPlainObject(continuity, 'continuity');
  exactKeys(
    continuity,
    CONTINUITY_KEYS,
    CONTINUITY_KEYS,
    'continuity'
  );

  assertId(
    continuity.personal_agent_pack_ref,
    'continuity.personal_agent_pack_ref'
  );
  assertSha256(
    continuity.personal_agent_pack_sha256,
    'continuity.personal_agent_pack_sha256'
  );
  assertId(continuity.restore_policy_ref, 'continuity.restore_policy_ref');

  if (
    continuity.personal_agent_pack_ref !== identity.personal_agent_pack_ref ||
    continuity.personal_agent_pack_sha256 !==
      identity.personal_agent_pack_sha256
  ) {
    throw new ValidationError(
      'continuity Personal Agent Pack binding must match identity binding'
    );
  }

  for (const field of [
    'portable_across_models',
    'portable_across_providers',
    'portable_across_runtimes',
    'selective_restore_required'
  ]) {
    assertConst(continuity[field], true, 'continuity.' + field);
  }

  for (const field of [
    'raw_secret_material_included',
    'import_grants_authority',
    'restore_grants_authority'
  ]) {
    assertConst(continuity[field], false, 'continuity.' + field);
  }
}

function validateNonClaims(nonClaims) {
  assertPlainObject(nonClaims, 'non_claims');
  exactKeys(
    nonClaims,
    NON_CLAIM_KEYS,
    NON_CLAIM_KEYS,
    'non_claims'
  );

  for (const field of NON_CLAIM_KEYS) {
    assertConst(nonClaims[field], false, 'non_claims.' + field);
  }
}

function validateProposal(proposal) {
  assertPlainObject(proposal, 'personal agent kernel proposal');
  exactKeys(
    proposal,
    PROPOSAL_KEYS,
    PROPOSAL_KEYS,
    'personal agent kernel proposal'
  );

  assertConst(
    proposal.schema,
    PERSONAL_AGENT_KERNEL_PROPOSAL_V0_SCHEMA,
    'proposal schema'
  );
  assertId(proposal.proposal_id, 'proposal_id');
  assertId(proposal.owner_subject_ref, 'proposal.owner_subject_ref');
  assertId(proposal.capability_ref, 'proposal.capability_ref');
  assertId(proposal.purpose_ref, 'proposal.purpose_ref');
  assertAutonomyLevel(
    proposal.requested_autonomy_level,
    'proposal.requested_autonomy_level'
  );

  const requests = assertArray(
    proposal.budget_requests,
    'proposal.budget_requests',
    { min: 0, max: 256 }
  );

  const seen = new Set();
  for (const [index, request] of requests.entries()) {
    const name = 'proposal.budget_requests[' + index + ']';
    assertPlainObject(request, name);
    exactKeys(
      request,
      BUDGET_REQUEST_KEYS,
      BUDGET_REQUEST_KEYS.filter(key => key !== 'currency'),
      name
    );
    const budgetId = assertId(request.budget_id, name + '.budget_id');
    assertUnique(seen, budgetId, 'proposal budget_id');
    assertInteger(request.amount, name + '.amount', {
      min: 1,
      max: MAX_SAFE
    });
    assertString(request.unit, name + '.unit', {
      min: 1,
      max: 64,
      pattern: ID_PATTERN
    });
    if (request.currency !== undefined) {
      assertString(request.currency, name + '.currency', {
        min: 3,
        max: 3,
        pattern: CURRENCY_PATTERN
      });
    }
  }

  assertRefList(proposal.memory_refs, 'proposal.memory_refs', {
    min: 0,
    max: 4096
  });
  assertBoolean(
    proposal.uses_quarantined_memory,
    'proposal.uses_quarantined_memory'
  );
  assertBoolean(proposal.effect_requested, 'proposal.effect_requested');
}

function validateMemoryCandidate(candidate) {
  assertPlainObject(candidate, 'memory candidate');
  exactKeys(
    candidate,
    MEMORY_CANDIDATE_KEYS,
    MEMORY_CANDIDATE_KEYS,
    'memory candidate'
  );

  assertConst(
    candidate.schema,
    PERSONAL_AGENT_MEMORY_CANDIDATE_V0_SCHEMA,
    'memory candidate schema'
  );
  assertId(candidate.candidate_id, 'memory candidate candidate_id');
  assertId(
    candidate.owner_subject_ref,
    'memory candidate owner_subject_ref'
  );
  assertSha256(candidate.content_sha256, 'memory candidate content_sha256');
  assertId(candidate.source_ref, 'memory candidate source_ref');
  assertEnum(
    candidate.source_kind,
    MEMORY_SOURCE_KINDS,
    'memory candidate source_kind'
  );
  assertBoolean(
    candidate.provenance_verified,
    'memory candidate provenance_verified'
  );
  assertRefList(
    candidate.independent_evidence_refs,
    'memory candidate independent_evidence_refs',
    { min: 0, max: 4096 }
  );
  assertRefList(
    candidate.contradicts_memory_refs,
    'memory candidate contradicts_memory_refs',
    { min: 0, max: 4096 }
  );
  assertEnum(
    candidate.requested_persistence,
    PERSISTENCE_CLASSES,
    'memory candidate requested_persistence'
  );
  assertEnum(
    candidate.sensitivity,
    SENSITIVITY_CLASSES,
    'memory candidate sensitivity'
  );
  assertConst(
    candidate.content_embedded,
    false,
    'memory candidate content_embedded'
  );
  assertConst(
    candidate.secret_material_embedded,
    false,
    'memory candidate secret_material_embedded'
  );
}

function validateAutonomyEvidence(evidence) {
  assertPlainObject(evidence, 'autonomy evidence');
  exactKeys(
    evidence,
    AUTONOMY_EVIDENCE_KEYS,
    AUTONOMY_EVIDENCE_KEYS,
    'autonomy evidence'
  );

  assertConst(
    evidence.schema,
    PERSONAL_AGENT_AUTONOMY_EVIDENCE_V0_SCHEMA,
    'autonomy evidence schema'
  );
  assertId(evidence.owner_subject_ref, 'autonomy evidence owner_subject_ref');
  assertId(evidence.capability_ref, 'autonomy evidence capability_ref');
  assertAutonomyLevel(evidence.target_level, 'autonomy evidence target_level');
  assertInteger(
    evidence.successful_receipts,
    'autonomy evidence successful_receipts',
    { min: 0, max: MAX_SAFE }
  );
  assertInteger(
    evidence.failed_receipts,
    'autonomy evidence failed_receipts',
    { min: 0, max: MAX_SAFE }
  );
  assertRefList(evidence.evidence_refs, 'autonomy evidence evidence_refs', {
    min: 0,
    max: 4096
  });
  assertUtcDateTime(evidence.at, 'autonomy evidence at');
}

function exactKeys(value, allowed, required, name) {
  const allowedSet = new Set(allowed);
  for (const key of Object.keys(value)) {
    if (!allowedSet.has(key)) {
      throw new ValidationError(name + ' contains unknown field ' + key);
    }
  }
  for (const key of required) {
    if (!Object.hasOwn(value, key)) {
      throw new ValidationError(name + ' is missing required field ' + key);
    }
  }
}

function assertArray(value, name, { min = 0, max = 256 } = {}) {
  if (!Array.isArray(value) || value.length < min || value.length > max) {
    throw new ValidationError(
      name + ' must contain ' + min + '-' + max + ' items'
    );
  }
  return value;
}

function assertId(value, name) {
  return assertString(value, name, {
    min: 1,
    max: 160,
    pattern: ID_PATTERN
  });
}

function assertVersion(value, name) {
  return assertString(value, name, {
    min: 5,
    max: 160,
    pattern: VERSION_PATTERN
  });
}

function assertSha256(value, name) {
  return assertString(value, name, {
    min: 64,
    max: 64,
    pattern: SHA256_PATTERN
  });
}

function assertUtcDateTime(value, name) {
  assertString(value, name, {
    min: 20,
    max: 64,
    pattern: UTC_DATE_TIME_PATTERN
  });
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) {
    throw new ValidationError(name + ' is not a valid UTC date-time');
  }
  return timestamp;
}

function assertRefList(value, name, { min = 0, max = 256 } = {}) {
  const list = assertArray(value, name, { min, max });
  const seen = new Set();
  for (const [index, ref] of list.entries()) {
    const normalized = assertId(ref, name + '[' + index + ']');
    assertUnique(seen, normalized, name + ' reference');
  }
  return list;
}

function assertEnumList(
  value,
  allowed,
  name,
  { min = 0, max = 256 } = {}
) {
  const list = assertArray(value, name, { min, max });
  const seen = new Set();
  for (const [index, item] of list.entries()) {
    assertEnum(item, allowed, name + '[' + index + ']');
    assertUnique(seen, item, name + ' item');
  }
  return list;
}

function assertAutonomyLevel(value, name) {
  if (!AUTONOMY_RANK.has(value)) {
    throw new ValidationError(name + ' has an unsupported value');
  }
  return value;
}

function assertBoolean(value, name) {
  if (typeof value !== 'boolean') {
    throw new ValidationError(name + ' must be a boolean');
  }
  return value;
}

function assertInteger(value, name, { min, max }) {
  if (
    !Number.isSafeInteger(value) ||
    value < min ||
    value > max
  ) {
    throw new ValidationError(
      name + ' must be a safe integer between ' + min + ' and ' + max
    );
  }
  return value;
}

function assertConst(value, expected, name) {
  if (value !== expected) {
    throw new ValidationError(
      name + ' must equal ' + JSON.stringify(expected)
    );
  }
  return value;
}

function assertEnum(value, allowed, name) {
  if (!allowed.has(value)) {
    throw new ValidationError(name + ' has an unsupported value');
  }
  return value;
}

function assertUnique(seen, value, name) {
  if (seen.has(value)) {
    throw new ValidationError('duplicate ' + name + ': ' + value);
  }
  seen.add(value);
}

function assertNoOverlap(left, right, name) {
  const rightSet = new Set(right);
  for (const value of left) {
    if (rightSet.has(value)) {
      throw new ValidationError(name + ' overlap on ' + value);
    }
  }
}
