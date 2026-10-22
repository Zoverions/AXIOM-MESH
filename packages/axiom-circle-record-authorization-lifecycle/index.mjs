import { readFileSync } from 'node:fs';

import { digestObject, ValidationError } from '../../mesh/src/lib/canonical.mjs';
import { resolveCircleCharterAt } from '../axiom-circle-charter-lifecycle/index.mjs';
import { validateCircleHistoricalRuleBindingLedger } from '../axiom-circle-historical-rule-binding/index.mjs';
import {
  assessCircleMemberCredentialEligibility,
  resolveCircleMembershipStateAt
} from '../axiom-circle-member-eligibility/index.mjs';
import {
  getCircleRecordAuthorizationPolicy,
  verifyCircleDecisionParticipationAttestation
} from '../axiom-circle-record-authorization/index.mjs';

const ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/;
const DIGEST = /^[a-f0-9]{64}$/;
const VOTES = new Set(['approve', 'reject', 'abstain']);
const SUPPORTED_DECISION_OUTCOMES = new Set(['accepted', 'rejected', 'no-quorum']);
const ELIGIBILITY_MODES = new Set([
  'creator-bootstrap-no-membership',
  'self-acceptance-pre-membership',
  'single-member-role-use',
  'collective-decision-member-use'
]);
const ELIGIBILITY_PURPOSES = new Set([
  'record-requester-role-use',
  'decision-participant-vote',
  'decision-transport'
]);

const EXPECTED_REQUIREMENTS = Object.freeze({
  parent_record_authorization_policy_digest_bound: true,
  historical_binding_required: true,
  historical_member_state_resolver_required: true,
  role_use_requires_event_time_membership_eligibility: true,
  role_use_requires_event_time_credential_currentness: true,
  participant_eligibility_checked_at_participation_time: true,
  decision_transport_eligibility_checked_at_decision_time: true,
  decision_electorate_frozen_at_proposal_creation: true,
  open_proposal_membership_change_semantics_defined: false,
  open_proposal_membership_change_fails_closed: true,
  creator_bootstrap_has_preexisting_membership_eligibility: false,
  self_acceptance_has_preexisting_membership_eligibility: false,
  credential_possession_proved_by_lifecycle: false,
  caller_authenticated_principal_is_external_assurance: true,
  decision_submitter_has_collective_authority: false,
  record_authorization_mints_runtime_authority: false,
  record_authorization_mints_portable_authority: false,
  record_authorization_mints_external_effect_authority: false
});
const EXPECTED_SCHEMAS = Object.freeze({
  member_context: 'axiom-circle-record-member-context.v0',
  eligibility_evidence_item: 'axiom-circle-record-eligibility-evidence-item.v0',
  eligibility_evidence_bundle: 'axiom-circle-record-eligibility-evidence-bundle.v0',
  authorization_assessment: 'axiom-circle-record-authorization-with-eligibility.v0'
});
const EXPECTED_NON_CLAIMS = new Set([
  'human-identity',
  'legal-identity',
  'credential-possession',
  'credential-issuance-authority',
  'role-grant-authority',
  'membership-resume-authority',
  'open-proposal-electorate-change-legitimacy',
  'governance-legitimacy',
  'coercion-free-participation',
  'independent-human-count',
  'truth-of-evidence',
  'trusted-wall-clock',
  'legal-authority',
  'execution-authority',
  'portable-authority',
  'external-effect-authority',
  'distributed-consensus'
]);

const policyUrl = new URL('../../mesh/config/circle-record-authorization-lifecycle.v0.json', import.meta.url);
const CIRCLE_RECORD_AUTHORIZATION_LIFECYCLE_POLICY = deepFreeze(JSON.parse(readFileSync(policyUrl, 'utf8')));
validateCircleRecordAuthorizationLifecyclePolicy(CIRCLE_RECORD_AUTHORIZATION_LIFECYCLE_POLICY);

export function getCircleRecordAuthorizationLifecyclePolicy() {
  return CIRCLE_RECORD_AUTHORIZATION_LIFECYCLE_POLICY;
}

export function validateCircleRecordAuthorizationLifecyclePolicy(policy) {
  exactObject(policy, 'Circle lifecycle-aware record authorization policy', [
    'schema', 'version', 'status', 'runtime_activation', 'authority_effect', 'network_effect',
    'requirements', 'schemas', 'eligibility_modes', 'output', 'non_claims'
  ]);
  if (
    policy.schema !== 'axiom-circle-record-authorization-lifecycle-policy.v0'
    || policy.version !== 0
    || policy.status !== 'inert-lifecycle-aware-record-authorization'
    || policy.runtime_activation !== false
    || policy.authority_effect !== 'none'
    || policy.network_effect !== 'none'
  ) throw new ValidationError('Circle lifecycle-aware record authorization activation boundary is invalid');

  exactObject(policy.requirements, 'Circle lifecycle-aware authorization requirements', Object.keys(EXPECTED_REQUIREMENTS));
  for (const [key, expected] of Object.entries(EXPECTED_REQUIREMENTS)) {
    if (policy.requirements[key] !== expected) {
      throw new ValidationError(`Circle lifecycle-aware authorization requirement ${key} was weakened`);
    }
  }
  exactObject(policy.schemas, 'Circle lifecycle-aware authorization schemas', Object.keys(EXPECTED_SCHEMAS));
  for (const [key, expected] of Object.entries(EXPECTED_SCHEMAS)) {
    if (policy.schemas[key] !== expected) {
      throw new ValidationError(`Circle lifecycle-aware authorization schema ${key} drifted`);
    }
  }
  exactSet(policy.eligibility_modes, ELIGIBILITY_MODES, 'Circle lifecycle-aware authorization eligibility modes');
  exactObject(policy.output, 'Circle lifecycle-aware authorization output', [
    'parent_policy_digest_required',
    'historical_ledger_digest_required',
    'historical_binding_digest_required',
    'governing_charter_digest_required',
    'eligibility_evidence_digest_required',
    'runtime_authority',
    'portable_authority',
    'external_effect_authority',
    'authority_effect',
    'network_effect'
  ]);
  if (
    policy.output.parent_policy_digest_required !== true
    || policy.output.historical_ledger_digest_required !== true
    || policy.output.historical_binding_digest_required !== true
    || policy.output.governing_charter_digest_required !== true
    || policy.output.eligibility_evidence_digest_required !== true
    || policy.output.runtime_authority !== false
    || policy.output.portable_authority !== false
    || policy.output.external_effect_authority !== false
    || policy.output.authority_effect !== 'none'
    || policy.output.network_effect !== 'none'
  ) throw new ValidationError('Circle lifecycle-aware authorization output boundary is invalid');
  exactSet(policy.non_claims, EXPECTED_NON_CLAIMS, 'Circle lifecycle-aware authorization non-claims');
  return true;
}

export function assessCircleRecordAuthorizationWithEligibility({
  policy = CIRCLE_RECORD_AUTHORIZATION_LIFECYCLE_POLICY,
  eligibilityPolicy,
  charterPolicy,
  historicalBindingPolicy,
  credentialPolicy,
  circlePackage,
  charterLifecycle,
  historicalLedger,
  bindingId,
  authenticatedPrincipal,
  memberContexts = [],
  participantAttestations = [],
  hypervisorPublicKey = null,
  now = new Date()
}) {
  validateCircleRecordAuthorizationLifecyclePolicy(policy);
  const requester = requiredId(authenticatedPrincipal, 'Circle record authenticated principal');
  const historicalValidation = validateCircleHistoricalRuleBindingLedger(
    historicalBindingPolicy,
    charterPolicy,
    circlePackage,
    charterLifecycle,
    historicalLedger,
    { now }
  );
  const contextByMembership = validateMemberContexts(policy, memberContexts, circlePackage.circle.circle_id);
  const index = historicalLedger.bindings.findIndex(binding => binding.binding_id === bindingId);
  if (index < 0) throw new ValidationError('Circle lifecycle-aware record authorization binding is not retained');
  const binding = historicalLedger.bindings[index];

  const common = {
    policy,
    eligibilityPolicy,
    charterPolicy,
    historicalBindingPolicy,
    credentialPolicy,
    circlePackage,
    charterLifecycle,
    historicalLedger,
    binding,
    index,
    requester,
    contextByMembership,
    participantAttestations,
    hypervisorPublicKey,
    now
  };

  let detail;
  if (binding.record_type === 'invitation') detail = assessInvitation(common);
  else if (binding.record_type === 'membership') detail = assessMembership(common);
  else if (binding.record_type === 'proposal') detail = assessProposal(common);
  else if (binding.record_type === 'decision') detail = assessDecision(common);
  else throw new ValidationError('Circle lifecycle-aware record authorization record type is unsupported');

  const eligibilityEvidence = buildEligibilityEvidenceBundle(policy, detail.eligibility_mode, detail.eligibility_items);
  const assessment = deepFreeze({
    schema: policy.schemas.authorization_assessment,
    status: 'inert-lifecycle-aware-authorization-candidate',
    circle_id: circlePackage.circle.circle_id,
    record_type: binding.record_type,
    record_id: binding.record_id,
    record_digest: binding.record_digest,
    historical_binding_id: binding.binding_id,
    historical_binding_digest: digestObject(binding),
    historical_ledger_digest: historicalValidation.ledger_digest,
    governing_charter_digest: binding.governing_charter_digest,
    authenticated_requester: requester,
    authorization_mode: detail.authorization_mode,
    authorizing_membership_id: detail.authorizing_membership_id,
    participant_attestation_digests: detail.participant_attestation_digests,
    decision_tally: detail.decision_tally,
    parent_record_authorization_policy_digest: digestObject(getCircleRecordAuthorizationPolicy()),
    eligibility_evidence_digest: digestObject(eligibilityEvidence),
    eligibility_evidence_count: eligibilityEvidence.items.length,
    eligibility_mode: eligibilityEvidence.mode,
    credential_possession_verified: false,
    submitter_collective_authority: false,
    runtime_authority: false,
    portable_authority: false,
    external_effect_authority: false,
    authority_effect: 'none',
    network_effect: 'none'
  });

  const result = deepFreeze({
    assessment,
    assessment_digest: digestObject(assessment),
    eligibility_evidence: eligibilityEvidence,
    eligibility_evidence_digest: digestObject(eligibilityEvidence)
  });
  validateCircleRecordAuthorizationEligibilityResult(result, policy);
  return result;
}

export function validateCircleRecordAuthorizationEligibilityResult(
  result,
  policy = CIRCLE_RECORD_AUTHORIZATION_LIFECYCLE_POLICY
) {
  validateCircleRecordAuthorizationLifecyclePolicy(policy);
  exactObject(result, 'Circle lifecycle-aware authorization result', [
    'assessment', 'assessment_digest', 'eligibility_evidence', 'eligibility_evidence_digest'
  ]);
  if (!DIGEST.test(result.assessment_digest ?? '') || !DIGEST.test(result.eligibility_evidence_digest ?? '')) {
    throw new ValidationError('Circle lifecycle-aware authorization result digests are invalid');
  }
  if (digestObject(result.assessment) !== result.assessment_digest) {
    throw new ValidationError('Circle lifecycle-aware authorization assessment digest is invalid');
  }
  if (digestObject(result.eligibility_evidence) !== result.eligibility_evidence_digest) {
    throw new ValidationError('Circle lifecycle-aware eligibility evidence digest is invalid');
  }
  validateEligibilityEvidenceBundle(policy, result.eligibility_evidence);
  validateAuthorizationAssessment(policy, result.assessment, result.eligibility_evidence_digest);
  return true;
}

function assessInvitation(input) {
  const { binding, index, requester, circlePackage, charterPolicy, charterLifecycle, historicalLedger, now } = input;
  const record = binding.record;
  if (record.issued_by !== requester) {
    throw new ValidationError('Circle invitation requester must equal issued_by');
  }
  const resolved = resolveCircleCharterAt(charterPolicy, circlePackage, charterLifecycle, {
    at: record.issued_at,
    now
  });
  if (resolved.charter_digest !== binding.governing_charter_digest) {
    throw new ValidationError('Circle invitation authorization charter binding is invalid');
  }
  const priorInvitations = historicalLedger.bindings.slice(0, index).filter(item => item.record_type === 'invitation');
  if (priorInvitations.length === 0) {
    if (requester !== circlePackage.circle.created_by || resolved.charter.version !== 1) {
      throw new ValidationError('Circle invitation creator bootstrap is limited to the first genesis invitation');
    }
    return {
      authorization_mode: 'creator-bootstrap-first-invitation',
      authorizing_membership_id: null,
      participant_attestation_digests: Object.freeze([]),
      decision_tally: null,
      eligibility_mode: 'creator-bootstrap-no-membership',
      eligibility_items: []
    };
  }
  const member = requireUniqueMemberRoleUse(input, {
    principalId: requester,
    beforeBindingIndex: index,
    at: record.issued_at,
    requiredMode: 'approve',
    label: 'Circle invitation issuer'
  });
  return {
    authorization_mode: 'active-member-approve',
    authorizing_membership_id: member.membership_id,
    participant_attestation_digests: Object.freeze([]),
    decision_tally: null,
    eligibility_mode: 'single-member-role-use',
    eligibility_items: [member.evidence]
  };
}

function assessMembership({ binding, requester }) {
  const record = binding.record;
  if (record.principal_id !== requester) {
    throw new ValidationError('Circle membership acceptance must be submitted by the invited principal');
  }
  return {
    authorization_mode: 'invited-principal-self-acceptance',
    authorizing_membership_id: record.membership_id,
    participant_attestation_digests: Object.freeze([]),
    decision_tally: null,
    eligibility_mode: 'self-acceptance-pre-membership',
    eligibility_items: []
  };
}

function assessProposal(input) {
  const { binding, index, requester, circlePackage, charterPolicy, charterLifecycle, now } = input;
  const record = binding.record;
  if (record.proposer !== requester) throw new ValidationError('Circle proposal requester must equal proposer');
  const resolved = resolveCircleCharterAt(charterPolicy, circlePackage, charterLifecycle, {
    at: record.created_at,
    now
  });
  if (resolved.charter_digest !== binding.governing_charter_digest) {
    throw new ValidationError('Circle proposal authorization charter binding is invalid');
  }
  const member = requireUniqueMemberRoleUse(input, {
    principalId: requester,
    beforeBindingIndex: index,
    at: record.created_at,
    requiredMode: 'propose',
    label: 'Circle proposal proposer'
  });
  return {
    authorization_mode: 'active-member-propose',
    authorizing_membership_id: member.membership_id,
    participant_attestation_digests: Object.freeze([]),
    decision_tally: null,
    eligibility_mode: 'single-member-role-use',
    eligibility_items: [member.evidence]
  };
}

function assessDecision(input) {
  const {
    binding,
    index,
    requester,
    circlePackage,
    charterPolicy,
    charterLifecycle,
    historicalLedger,
    contextByMembership,
    participantAttestations,
    hypervisorPublicKey,
    now
  } = input;
  const record = binding.record;
  if (!SUPPORTED_DECISION_OUTCOMES.has(record.outcome)) {
    throw new ValidationError('Circle decision outcome is not supported by lifecycle-aware authorization v0');
  }
  if (!hypervisorPublicKey) {
    throw new ValidationError('Circle decision authorization requires trusted Hypervisor participant evidence');
  }
  if (!Array.isArray(participantAttestations) || participantAttestations.length > 4096) {
    throw new ValidationError('Circle decision participant attestations are invalid');
  }

  const proposalBindingIndex = historicalLedger.bindings.findIndex(
    candidate => candidate.binding_id === binding.basis_binding_id
  );
  const proposalBinding = proposalBindingIndex < 0 ? null : historicalLedger.bindings[proposalBindingIndex];
  if (!proposalBinding || proposalBinding.record_type !== 'proposal' || proposalBindingIndex >= index) {
    throw new ValidationError('Circle decision authorization requires its earlier historical proposal basis');
  }
  const proposal = proposalBinding.record;
  const resolved = resolveCircleCharterAt(charterPolicy, circlePackage, charterLifecycle, {
    at: proposal.created_at,
    now
  });
  if (
    resolved.charter_digest !== proposalBinding.governing_charter_digest
    || resolved.charter_digest !== binding.governing_charter_digest
  ) throw new ValidationError('Circle decision authorization must use the proposal-frozen charter');

  const electorate = buildDecisionElectorate(input, {
    proposalBindingIndex,
    charter: resolved.charter,
    proposalCreatedAt: proposal.created_at,
    decisionAt: record.decided_at
  });
  if (electorate.length < 2) {
    throw new ValidationError('Circle decision authorization requires at least two eligible principals');
  }

  const electorateByMembership = new Map(electorate.map(item => [item.membership_id, item]));
  const seenPrincipals = new Set();
  const seenMemberships = new Set();
  const verified = [];
  const eligibilityItems = [];

  for (const inputAttestation of participantAttestations) {
    const item = verifyCircleDecisionParticipationAttestation(inputAttestation, hypervisorPublicKey);
    const statement = item.statement;
    if (
      statement.circle_id !== binding.circle_id
      || statement.decision_id !== record.decision_id
      || statement.proposal_id !== proposal.proposal_id
      || statement.proposal_binding_id !== proposalBinding.binding_id
      || statement.proposal_record_digest !== proposalBinding.record_digest
      || statement.governing_charter_digest !== resolved.charter_digest
    ) throw new ValidationError('Circle decision participation attestation is bound to different decision context');

    const eligible = electorateByMembership.get(statement.membership_id);
    if (!eligible || eligible.principal_id !== statement.principal_id) {
      throw new ValidationError('Circle decision participant is outside the frozen lifecycle-aware electorate');
    }
    if (seenPrincipals.has(statement.principal_id) || seenMemberships.has(statement.membership_id)) {
      throw new ValidationError('Circle decision cannot count a principal or membership twice');
    }
    const participatedMs = Date.parse(statement.participated_at);
    if (
      participatedMs < Date.parse(proposal.created_at)
      || participatedMs > Date.parse(proposal.closes_at)
      || participatedMs > Date.parse(record.decided_at)
    ) throw new ValidationError('Circle decision participation is outside the proposal voting window');

    const context = contextByMembership.get(statement.membership_id);
    const credential = requireCredentialAssessment(input, context, {
      principalId: statement.principal_id,
      at: statement.participated_at,
      requiredMode: 'vote',
      purpose: 'decision-participant-vote'
    });
    eligibilityItems.push(credential.evidence);
    seenPrincipals.add(statement.principal_id);
    seenMemberships.add(statement.membership_id);
    verified.push(item);
  }

  if (verified.length !== electorate.length || electorate.some(item => !seenMemberships.has(item.membership_id))) {
    throw new ValidationError('Circle decision requires one authenticated attestation from every lifecycle-aware eligible voter');
  }

  const attestationDigests = verified.map(item => item.attestation_digest).sort();
  const decisionReceiptDigests = [...record.participant_receipts].sort();
  if (
    decisionReceiptDigests.length !== attestationDigests.length
    || decisionReceiptDigests.some((value, receiptIndex) => value !== attestationDigests[receiptIndex])
  ) throw new ValidationError('Circle decision participant_receipts do not match authenticated attestations');

  const participantForRequester = verified.find(item => item.statement.principal_id === requester);
  let authorizingMembershipId = null;
  let transportMode = 'participant-aggregator';
  let transportEvidence;
  if (participantForRequester) {
    const context = contextByMembership.get(participantForRequester.statement.membership_id);
    transportEvidence = requireCredentialAssessment(input, context, {
      principalId: requester,
      at: record.decided_at,
      requiredMode: null,
      purpose: 'decision-transport'
    });
  } else {
    const reviewer = requireUniqueMemberRoleUse(input, {
      principalId: requester,
      beforeBindingIndex: index,
      at: record.decided_at,
      requiredMode: 'review',
      label: 'Circle decision transport reviewer',
      purpose: 'decision-transport'
    });
    authorizingMembershipId = reviewer.membership_id;
    transportMode = 'review-member-aggregator';
    transportEvidence = reviewer;
  }
  eligibilityItems.push(transportEvidence.evidence);

  const counts = { approve: 0, reject: 0, abstain: 0 };
  for (const item of verified) counts[item.statement.vote] += 1;
  const quorumNumerator = resolved.charter.decision_rule.abstention_counts_toward_quorum
    ? counts.approve + counts.reject + counts.abstain
    : counts.approve + counts.reject;
  const quorumMet = quorumNumerator * 10_000
    >= electorate.length * resolved.charter.decision_rule.quorum_basis_points;
  const approvalDenominator = counts.approve + counts.reject;
  const approvalMet = approvalDenominator > 0
    && counts.approve * 10_000
      >= approvalDenominator * resolved.charter.decision_rule.approval_basis_points;
  const computedOutcome = !quorumMet ? 'no-quorum' : approvalMet ? 'accepted' : 'rejected';
  if (record.outcome !== computedOutcome) {
    throw new ValidationError('Circle decision outcome does not match frozen-charter quorum and approval recomputation');
  }

  return {
    authorization_mode: transportMode,
    authorizing_membership_id: authorizingMembershipId,
    participant_attestation_digests: Object.freeze(attestationDigests),
    decision_tally: deepFreeze({
      electorate_size: electorate.length,
      approve: counts.approve,
      reject: counts.reject,
      abstain: counts.abstain,
      quorum_basis_points: resolved.charter.decision_rule.quorum_basis_points,
      approval_basis_points: resolved.charter.decision_rule.approval_basis_points,
      abstention_counts_toward_quorum: resolved.charter.decision_rule.abstention_counts_toward_quorum,
      quorum_met: quorumMet,
      approval_met: approvalMet,
      computed_outcome: computedOutcome
    }),
    eligibility_mode: 'collective-decision-member-use',
    eligibility_items: eligibilityItems
  };
}

function buildDecisionElectorate(input, {
  proposalBindingIndex,
  charter,
  proposalCreatedAt,
  decisionAt
}) {
  const { historicalLedger, contextByMembership } = input;
  const proposalMs = Date.parse(proposalCreatedAt);
  const decisionMs = Date.parse(decisionAt);
  const voteRoles = new Set(
    charter.roles.filter(role => role.declared_modes.includes('vote')).map(role => role.role_id)
  );
  const eligible = [];
  const seenPrincipals = new Set();

  for (const binding of historicalLedger.bindings.slice(0, proposalBindingIndex)) {
    if (binding.record_type !== 'membership') continue;
    const acceptance = binding.record;
    if (Date.parse(acceptance.accepted_at) > proposalMs) continue;
    if (!acceptance.role_ids.some(roleId => voteRoles.has(roleId))) continue;
    const context = requireMemberContext(contextByMembership, acceptance.membership_id, 'Circle decision electorate');
    const state = resolveContextState(input, context, proposalCreatedAt);
    if (!state.membership_active || !state.role_ids.some(roleId => voteRoles.has(roleId))) continue;

    for (const event of context.membership_lifecycle.events) {
      const eventMs = Date.parse(event.at);
      if (eventMs > proposalMs && eventMs <= decisionMs) {
        throw new ValidationError(
          'Circle decision fails closed when electorate membership or roles change during an open proposal'
        );
      }
    }
    if (seenPrincipals.has(state.principal_id)) {
      throw new ValidationError('Circle decision electorate cannot contain multiple voting memberships for one principal');
    }
    seenPrincipals.add(state.principal_id);
    eligible.push(Object.freeze({
      membership_id: state.membership_id,
      principal_id: state.principal_id
    }));
  }
  return Object.freeze(eligible);
}

function requireUniqueMemberRoleUse(input, {
  principalId,
  beforeBindingIndex,
  at,
  requiredMode,
  label,
  purpose = 'record-requester-role-use'
}) {
  const { historicalLedger, contextByMembership, charterPolicy, circlePackage, charterLifecycle, now } = input;
  const atMs = Date.parse(at);
  const resolved = resolveCircleCharterAt(charterPolicy, circlePackage, charterLifecycle, { at, now });
  const modeRoles = new Set(
    resolved.charter.roles
      .filter(role => role.declared_modes.includes(requiredMode))
      .map(role => role.role_id)
  );
  const matches = [];

  for (const binding of historicalLedger.bindings.slice(0, beforeBindingIndex)) {
    if (binding.record_type !== 'membership') continue;
    const acceptance = binding.record;
    if (acceptance.principal_id !== principalId || Date.parse(acceptance.accepted_at) > atMs) continue;
    const context = requireMemberContext(contextByMembership, acceptance.membership_id, label);
    const state = resolveContextState(input, context, at);
    if (!state.membership_active || !state.role_ids.some(roleId => modeRoles.has(roleId))) continue;
    matches.push(requireCredentialAssessment(input, context, {
      principalId,
      at,
      requiredMode,
      purpose
    }));
  }

  if (matches.length !== 1) {
    throw new ValidationError(`${label} requires exactly one lifecycle-resolved active membership with ${requiredMode} mode and current credential`);
  }
  return matches[0];
}

function requireCredentialAssessment(input, context, {
  principalId,
  at,
  requiredMode,
  purpose
}) {
  if (!context || context.credential_lifecycle === null || context.credential_id === null) {
    throw new ValidationError('Circle role use requires a bound member credential lifecycle and credential id');
  }
  const result = assessCircleMemberCredentialEligibility({
    policy: input.eligibilityPolicy,
    charterPolicy: input.charterPolicy,
    historicalBindingPolicy: input.historicalBindingPolicy,
    credentialPolicy: input.credentialPolicy,
    circlePackage: input.circlePackage,
    charterLifecycle: input.charterLifecycle,
    historicalLedger: input.historicalLedger,
    membershipLifecycle: context.membership_lifecycle,
    credentialLifecycle: context.credential_lifecycle,
    authenticatedPrincipal: principalId,
    credentialId: context.credential_id,
    asOf: at,
    requiredMode,
    now: input.now
  });
  return Object.freeze({
    membership_id: context.membership_id,
    principal_id: context.principal_id,
    evidence: buildEligibilityEvidenceItem(input.policy, {
      purpose,
      context,
      at,
      requiredMode,
      assessmentDigest: result.assessment_digest
    })
  });
}

function resolveContextState(input, context, at) {
  return resolveCircleMembershipStateAt({
    policy: input.eligibilityPolicy,
    charterPolicy: input.charterPolicy,
    historicalBindingPolicy: input.historicalBindingPolicy,
    circlePackage: input.circlePackage,
    charterLifecycle: input.charterLifecycle,
    historicalLedger: input.historicalLedger,
    lifecycle: context.membership_lifecycle,
    now: input.now
  }, { at });
}

function validateMemberContexts(policy, contexts, circleId) {
  if (!Array.isArray(contexts) || contexts.length > 4096) {
    throw new ValidationError('Circle record member contexts are invalid');
  }
  const map = new Map();
  for (const context of contexts) {
    exactObject(context, 'Circle record member context', [
      'schema', 'circle_id', 'membership_id', 'principal_id',
      'membership_lifecycle', 'credential_lifecycle', 'credential_id'
    ]);
    if (
      context.schema !== policy.schemas.member_context
      || context.circle_id !== circleId
      || !ID.test(context.membership_id ?? '')
      || !ID.test(context.principal_id ?? '')
      || !context.membership_lifecycle
      || typeof context.membership_lifecycle !== 'object'
      || Array.isArray(context.membership_lifecycle)
      || context.membership_lifecycle.circle_id !== context.circle_id
      || context.membership_lifecycle.membership_id !== context.membership_id
      || context.membership_lifecycle.principal_id !== context.principal_id
      || !(
        (context.credential_lifecycle === null && context.credential_id === null)
        || (
          context.credential_lifecycle
          && typeof context.credential_lifecycle === 'object'
          && !Array.isArray(context.credential_lifecycle)
          && context.credential_lifecycle.circle_id === context.circle_id
          && context.credential_lifecycle.membership_id === context.membership_id
          && context.credential_lifecycle.principal_id === context.principal_id
          && ID.test(context.credential_id ?? '')
        )
      )
    ) throw new ValidationError('Circle record member context binding is invalid');
    if (map.has(context.membership_id)) {
      throw new ValidationError(`Duplicate Circle record member context: ${context.membership_id}`);
    }
    map.set(context.membership_id, deepFreeze(structuredClone(context)));
  }
  return map;
}

function requireMemberContext(contextByMembership, membershipId, label) {
  const context = contextByMembership.get(membershipId);
  if (!context) throw new ValidationError(`${label} requires complete member lifecycle context for ${membershipId}`);
  return context;
}

function buildEligibilityEvidenceItem(policy, {
  purpose,
  context,
  at,
  requiredMode,
  assessmentDigest
}) {
  if (!ELIGIBILITY_PURPOSES.has(purpose)) throw new ValidationError('Circle eligibility evidence purpose is invalid');
  return deepFreeze({
    schema: policy.schemas.eligibility_evidence_item,
    purpose,
    circle_id: context.circle_id,
    membership_id: context.membership_id,
    principal_id: context.principal_id,
    credential_id: context.credential_id,
    at: canonicalTimestamp(at, 'Circle eligibility evidence time'),
    required_mode: requiredMode,
    assessment_digest: requiredDigest(assessmentDigest, 'Circle member eligibility assessment digest'),
    credential_possession_verified: false,
    authority_effect: 'none',
    network_effect: 'none'
  });
}

function buildEligibilityEvidenceBundle(policy, mode, items) {
  if (!ELIGIBILITY_MODES.has(mode) || !Array.isArray(items) || items.length > 8192) {
    throw new ValidationError('Circle eligibility evidence bundle is invalid');
  }
  const sorted = [...items].map(item => structuredClone(item)).sort((left, right) =>
    `${left.purpose}:${left.principal_id}:${left.membership_id}:${left.at}:${left.assessment_digest}`
      .localeCompare(`${right.purpose}:${right.principal_id}:${right.membership_id}:${right.at}:${right.assessment_digest}`)
  );
  const bundle = deepFreeze({
    schema: policy.schemas.eligibility_evidence_bundle,
    mode,
    items: sorted,
    credential_possession_verified: false,
    current_state_is_local_derivation: true,
    runtime_authority: false,
    portable_authority: false,
    external_effect_authority: false,
    authority_effect: 'none',
    network_effect: 'none'
  });
  validateEligibilityEvidenceBundle(policy, bundle);
  return bundle;
}

function validateEligibilityEvidenceBundle(policy, bundle) {
  exactObject(bundle, 'Circle eligibility evidence bundle', [
    'schema', 'mode', 'items', 'credential_possession_verified', 'current_state_is_local_derivation',
    'runtime_authority', 'portable_authority', 'external_effect_authority', 'authority_effect', 'network_effect'
  ]);
  if (
    bundle.schema !== policy.schemas.eligibility_evidence_bundle
    || !ELIGIBILITY_MODES.has(bundle.mode)
    || !Array.isArray(bundle.items)
    || bundle.items.length > 8192
    || bundle.credential_possession_verified !== false
    || bundle.current_state_is_local_derivation !== true
    || bundle.runtime_authority !== false
    || bundle.portable_authority !== false
    || bundle.external_effect_authority !== false
    || bundle.authority_effect !== 'none'
    || bundle.network_effect !== 'none'
  ) throw new ValidationError('Circle eligibility evidence bundle boundary is invalid');
  if (
    ['creator-bootstrap-no-membership', 'self-acceptance-pre-membership'].includes(bundle.mode)
    && bundle.items.length !== 0
  ) throw new ValidationError('Circle pre-membership authorization cannot fabricate member eligibility evidence');
  if (bundle.mode === 'single-member-role-use' && bundle.items.length !== 1) {
    throw new ValidationError('Circle single-member role use requires exactly one eligibility evidence item');
  }
  if (bundle.mode === 'collective-decision-member-use' && bundle.items.length < 3) {
    throw new ValidationError('Circle collective decision requires participant and transport eligibility evidence');
  }
  for (const item of bundle.items) validateEligibilityEvidenceItem(policy, item);
  return true;
}

function validateEligibilityEvidenceItem(policy, item) {
  exactObject(item, 'Circle eligibility evidence item', [
    'schema', 'purpose', 'circle_id', 'membership_id', 'principal_id', 'credential_id',
    'at', 'required_mode', 'assessment_digest', 'credential_possession_verified', 'authority_effect', 'network_effect'
  ]);
  if (
    item.schema !== policy.schemas.eligibility_evidence_item
    || !ELIGIBILITY_PURPOSES.has(item.purpose)
    || !ID.test(item.circle_id ?? '')
    || !ID.test(item.membership_id ?? '')
    || !ID.test(item.principal_id ?? '')
    || !ID.test(item.credential_id ?? '')
    || !(item.required_mode === null || typeof item.required_mode === 'string')
    || !DIGEST.test(item.assessment_digest ?? '')
    || item.credential_possession_verified !== false
    || item.authority_effect !== 'none'
    || item.network_effect !== 'none'
  ) throw new ValidationError('Circle eligibility evidence item is invalid');
  canonicalTimestamp(item.at, 'Circle eligibility evidence time');
  return true;
}

function validateAuthorizationAssessment(policy, assessment, eligibilityEvidenceDigest) {
  exactObject(assessment, 'Circle lifecycle-aware authorization assessment', [
    'schema', 'status', 'circle_id', 'record_type', 'record_id', 'record_digest',
    'historical_binding_id', 'historical_binding_digest', 'historical_ledger_digest',
    'governing_charter_digest', 'authenticated_requester', 'authorization_mode',
    'authorizing_membership_id', 'participant_attestation_digests', 'decision_tally',
    'parent_record_authorization_policy_digest', 'eligibility_evidence_digest',
    'eligibility_evidence_count', 'eligibility_mode', 'credential_possession_verified',
    'submitter_collective_authority', 'runtime_authority', 'portable_authority',
    'external_effect_authority', 'authority_effect', 'network_effect'
  ]);
  if (
    assessment.schema !== policy.schemas.authorization_assessment
    || assessment.status !== 'inert-lifecycle-aware-authorization-candidate'
    || !ID.test(assessment.circle_id ?? '')
    || !['invitation', 'membership', 'proposal', 'decision'].includes(assessment.record_type)
    || !ID.test(assessment.record_id ?? '')
    || !DIGEST.test(assessment.record_digest ?? '')
    || !ID.test(assessment.historical_binding_id ?? '')
    || !DIGEST.test(assessment.historical_binding_digest ?? '')
    || !DIGEST.test(assessment.historical_ledger_digest ?? '')
    || !DIGEST.test(assessment.governing_charter_digest ?? '')
    || !ID.test(assessment.authenticated_requester ?? '')
    || typeof assessment.authorization_mode !== 'string'
    || !(assessment.authorizing_membership_id === null || ID.test(assessment.authorizing_membership_id ?? ''))
    || !Array.isArray(assessment.participant_attestation_digests)
    || assessment.participant_attestation_digests.some(value => !DIGEST.test(value))
    || !DIGEST.test(assessment.parent_record_authorization_policy_digest ?? '')
    || assessment.parent_record_authorization_policy_digest !== digestObject(getCircleRecordAuthorizationPolicy())
    || assessment.eligibility_evidence_digest !== eligibilityEvidenceDigest
    || !Number.isSafeInteger(assessment.eligibility_evidence_count)
    || assessment.eligibility_evidence_count < 0
    || !ELIGIBILITY_MODES.has(assessment.eligibility_mode)
    || assessment.credential_possession_verified !== false
    || assessment.submitter_collective_authority !== false
    || assessment.runtime_authority !== false
    || assessment.portable_authority !== false
    || assessment.external_effect_authority !== false
    || assessment.authority_effect !== 'none'
    || assessment.network_effect !== 'none'
  ) throw new ValidationError('Circle lifecycle-aware authorization assessment boundary is invalid');
  return true;
}

function requiredId(value, label) {
  if (typeof value !== 'string' || !ID.test(value)) throw new ValidationError(`${label} is invalid`);
  return value;
}

function requiredDigest(value, label) {
  if (typeof value !== 'string' || !DIGEST.test(value)) throw new ValidationError(`${label} is invalid`);
  return value;
}

function canonicalTimestamp(value, label) {
  if (typeof value !== 'string') throw new ValidationError(`${label} is invalid`);
  const date = new Date(value);
  if (Number.isNaN(date.valueOf()) || date.toISOString() !== value) {
    throw new ValidationError(`${label} must be canonical UTC`);
  }
  return value;
}

function exactSet(values, expected, label) {
  if (!Array.isArray(values)) throw new ValidationError(`${label} must be an array`);
  const actual = new Set(values);
  if (actual.size !== expected.size || values.length !== expected.size || [...expected].some(value => !actual.has(value))) {
    throw new ValidationError(`${label} inventory drifted`);
  }
}

function exactObject(value, label, keys) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new ValidationError(`${label} must be an object`);
  }
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    throw new ValidationError(`${label} fields are invalid`);
  }
  return value;
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}
