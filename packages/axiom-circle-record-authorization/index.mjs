import { readFileSync } from 'node:fs';

import { digestObject, ValidationError } from '../../mesh/src/lib/canonical.mjs';
import { verifyObjectSignature } from '../../mesh/src/lib/identity.mjs';
import { resolveCircleCharterAt } from '../axiom-circle-charter-lifecycle/index.mjs';
import { validateCircleHistoricalRuleBindingLedger } from '../axiom-circle-historical-rule-binding/index.mjs';

const ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/;
const DIGEST = /^[a-f0-9]{64}$/;
const VOTES = new Set(['approve', 'reject', 'abstain']);
const SUPPORTED_DECISION_OUTCOMES = new Set(['accepted', 'rejected', 'no-quorum']);

const EXPECTED_REQUIREMENTS = Object.freeze({
  historical_binding_required: true,
  governing_charter_digest_exact: true,
  requester_must_equal_authenticated_principal: true,
  creator_bootstrap_limited_to_first_invitation: true,
  creator_bootstrap_persists_as_founder_authority: false,
  post_bootstrap_invitation_requires_approve_mode: true,
  membership_acceptance_requires_invited_principal_self_acceptance: true,
  proposal_requires_propose_mode: true,
  decision_submitter_has_collective_authority: false,
  decision_transport_requires_participant_or_review_mode: true,
  decision_requires_hypervisor_authenticated_participant_attestations: true,
  decision_requires_complete_electorate_attestation_set: true,
  decision_requires_at_least_two_eligible_principals: true,
  decision_participants_require_vote_mode: true,
  decision_participants_must_be_distinct_principals: true,
  decision_participants_must_use_distinct_memberships: true,
  decision_electorate_snapshot_is_proposal_creation: true,
  decision_quorum_recomputed_from_frozen_charter: true,
  decision_approval_recomputed_from_frozen_charter: true,
  decision_abstention_semantics_follow_frozen_charter: true,
  current_active_unexited_membership_required: true,
  ambiguous_membership_history_fails_closed: true,
  withdrawn_decision_outcome_supported: false,
  record_authorization_mints_runtime_authority: false,
  record_authorization_mints_portable_authority: false,
  record_authorization_mints_external_effect_authority: false
});

const EXPECTED_RECORD_MODES = Object.freeze({
  invitation: 'creator-bootstrap-or-active-approve-member',
  membership: 'invited-principal-self-acceptance',
  proposal: 'active-propose-member',
  decision: 'collective-hypervisor-attested-vote-recomputation'
});

const EXPECTED_SCHEMAS = Object.freeze({
  participant_attestation_statement: 'axiom-circle-decision-participation-statement.v0',
  participant_attestation: 'axiom-circle-decision-participation-attestation.v0',
  authorization_assessment: 'axiom-circle-record-authorization-assessment.v0'
});

const EXPECTED_NON_CLAIMS = new Set([
  'human-identity',
  'legal-identity',
  'governance-legitimacy',
  'historical-membership-lifecycle-completeness',
  'coercion-free-participation',
  'independent-human-count',
  'truth-of-evidence',
  'legal-authority',
  'execution-authority',
  'portable-authority',
  'external-effect-authority',
  'distributed-consensus'
]);

const policyUrl = new URL('../../mesh/config/circle-record-authorization.v0.json', import.meta.url);
const CIRCLE_RECORD_AUTHORIZATION_POLICY = deepFreeze(JSON.parse(readFileSync(policyUrl, 'utf8')));
validateCircleRecordAuthorizationPolicy(CIRCLE_RECORD_AUTHORIZATION_POLICY);

export function getCircleRecordAuthorizationPolicy() {
  return CIRCLE_RECORD_AUTHORIZATION_POLICY;
}

export function validateCircleRecordAuthorizationPolicy(policy) {
  exactObject(policy, 'Circle record authorization policy', [
    'schema',
    'version',
    'status',
    'runtime_activation',
    'authority_effect',
    'network_effect',
    'requirements',
    'record_modes',
    'participant_vote_values',
    'supported_decision_outcomes',
    'schemas',
    'output',
    'non_claims'
  ]);
  if (
    policy.schema !== 'axiom-circle-record-authorization-policy.v0'
    || policy.version !== 0
    || policy.status !== 'inert-record-authorization'
    || policy.runtime_activation !== false
    || policy.authority_effect !== 'none'
    || policy.network_effect !== 'none'
  ) throw new ValidationError('Circle record authorization activation boundary is invalid');

  exactObject(policy.requirements, 'Circle record authorization requirements', Object.keys(EXPECTED_REQUIREMENTS));
  for (const [key, expected] of Object.entries(EXPECTED_REQUIREMENTS)) {
    if (policy.requirements[key] !== expected) {
      throw new ValidationError(`Circle record authorization requirement ${key} was weakened`);
    }
  }

  exactObject(policy.record_modes, 'Circle record authorization modes', Object.keys(EXPECTED_RECORD_MODES));
  for (const [key, expected] of Object.entries(EXPECTED_RECORD_MODES)) {
    if (policy.record_modes[key] !== expected) {
      throw new ValidationError(`Circle record authorization mode ${key} drifted`);
    }
  }

  exactSet(policy.participant_vote_values, VOTES, 'Circle decision participant vote values');
  exactSet(
    policy.supported_decision_outcomes,
    SUPPORTED_DECISION_OUTCOMES,
    'Circle record authorization decision outcomes'
  );

  exactObject(policy.schemas, 'Circle record authorization schemas', Object.keys(EXPECTED_SCHEMAS));
  for (const [key, expected] of Object.entries(EXPECTED_SCHEMAS)) {
    if (policy.schemas[key] !== expected) {
      throw new ValidationError(`Circle record authorization schema ${key} drifted`);
    }
  }

  exactObject(policy.output, 'Circle record authorization output', [
    'policy_digest_required',
    'historical_ledger_digest_required',
    'historical_binding_digest_required',
    'governing_charter_digest_required',
    'participant_attestation_digests_required_for_decision',
    'runtime_authority',
    'portable_authority',
    'external_effect_authority',
    'authority_effect',
    'network_effect'
  ]);
  if (
    policy.output.policy_digest_required !== true
    || policy.output.historical_ledger_digest_required !== true
    || policy.output.historical_binding_digest_required !== true
    || policy.output.governing_charter_digest_required !== true
    || policy.output.participant_attestation_digests_required_for_decision !== true
    || policy.output.runtime_authority !== false
    || policy.output.portable_authority !== false
    || policy.output.external_effect_authority !== false
    || policy.output.authority_effect !== 'none'
    || policy.output.network_effect !== 'none'
  ) throw new ValidationError('Circle record authorization output boundary is invalid');

  exactSet(policy.non_claims, EXPECTED_NON_CLAIMS, 'Circle record authorization non-claims');
  return true;
}

export function issueCircleDecisionParticipationAttestation(identity, input) {
  if (!identity || identity.service !== 'hypervisor' || typeof identity.signObject !== 'function') {
    throw new ValidationError('Circle decision participation must be attested by Hypervisor identity');
  }
  exactObject(input, 'Circle decision participation attestation input', [
    'authenticated_principal',
    'circle_id',
    'decision_id',
    'proposal_id',
    'proposal_binding_id',
    'proposal_record_digest',
    'governing_charter_digest',
    'membership_id',
    'vote',
    'participated_at'
  ]);

  const statement = deepFreeze({
    schema: CIRCLE_RECORD_AUTHORIZATION_POLICY.schemas.participant_attestation_statement,
    circle_id: requiredId(input.circle_id, 'Circle decision participation circle_id'),
    decision_id: requiredId(input.decision_id, 'Circle decision participation decision_id'),
    proposal_id: requiredId(input.proposal_id, 'Circle decision participation proposal_id'),
    proposal_binding_id: requiredId(
      input.proposal_binding_id,
      'Circle decision participation proposal_binding_id'
    ),
    proposal_record_digest: requiredDigest(
      input.proposal_record_digest,
      'Circle decision participation proposal_record_digest'
    ),
    governing_charter_digest: requiredDigest(
      input.governing_charter_digest,
      'Circle decision participation governing_charter_digest'
    ),
    membership_id: requiredId(input.membership_id, 'Circle decision participation membership_id'),
    principal_id: requiredId(
      input.authenticated_principal,
      'Circle decision participation authenticated principal'
    ),
    vote: requiredVote(input.vote),
    participated_at: canonicalTimestamp(
      input.participated_at,
      'Circle decision participation participated_at'
    ),
    runtime_authority: false,
    portable_authority: false,
    external_effect_authority: false,
    authority_effect: 'none',
    network_effect: 'none'
  });

  const attestation = deepFreeze({
    schema: CIRCLE_RECORD_AUTHORIZATION_POLICY.schemas.participant_attestation,
    statement,
    signature: identity.signObject(statement)
  });
  return Object.freeze({
    attestation,
    attestation_digest: digestObject(attestation)
  });
}

export function verifyCircleDecisionParticipationAttestation(attestationInput, hypervisorPublicKey) {
  if (!hypervisorPublicKey) {
    throw new ValidationError('Trusted Hypervisor public key is required for Circle decision participation');
  }
  exactObject(attestationInput, 'Circle decision participation attestation', [
    'schema', 'statement', 'signature'
  ]);
  if (attestationInput.schema !== CIRCLE_RECORD_AUTHORIZATION_POLICY.schemas.participant_attestation) {
    throw new ValidationError('Circle decision participation attestation schema is invalid');
  }
  const statement = validateParticipantStatement(attestationInput.statement);
  if (!verifyObjectSignature(statement, attestationInput.signature, hypervisorPublicKey)) {
    throw new ValidationError('Circle decision participation attestation signature is invalid');
  }
  const attestation = deepFreeze({
    schema: attestationInput.schema,
    statement,
    signature: structuredClone(attestationInput.signature)
  });
  return Object.freeze({
    attestation,
    statement,
    attestation_digest: digestObject(attestation)
  });
}

export function assessCircleRecordAuthorization({
  policy = CIRCLE_RECORD_AUTHORIZATION_POLICY,
  charterPolicy,
  historicalBindingPolicy,
  circlePackage,
  charterLifecycle,
  historicalLedger,
  bindingId,
  authenticatedPrincipal,
  participantAttestations = [],
  hypervisorPublicKey = null,
  now = new Date()
}) {
  validateCircleRecordAuthorizationPolicy(policy);
  const requester = requiredId(authenticatedPrincipal, 'Circle record authenticated principal');
  const historicalValidation = validateCircleHistoricalRuleBindingLedger(
    historicalBindingPolicy,
    charterPolicy,
    circlePackage,
    charterLifecycle,
    historicalLedger,
    { now }
  );
  const index = historicalLedger.bindings.findIndex(binding => binding.binding_id === bindingId);
  if (index < 0) throw new ValidationError('Circle record authorization binding is not retained');
  const binding = historicalLedger.bindings[index];

  let detail;
  if (binding.record_type === 'invitation') {
    detail = assessInvitation({
      binding,
      index,
      requester,
      circlePackage,
      charterPolicy,
      charterLifecycle,
      historicalLedger,
      now
    });
  } else if (binding.record_type === 'membership') {
    detail = assessMembership({ binding, requester });
  } else if (binding.record_type === 'proposal') {
    detail = assessProposal({
      binding,
      requester,
      circlePackage,
      charterPolicy,
      charterLifecycle,
      now
    });
  } else if (binding.record_type === 'decision') {
    detail = assessDecision({
      binding,
      requester,
      circlePackage,
      charterPolicy,
      charterLifecycle,
      historicalLedger,
      participantAttestations,
      hypervisorPublicKey,
      now
    });
  } else {
    throw new ValidationError('Circle record authorization record type is unsupported');
  }

  const assessment = deepFreeze({
    schema: policy.schemas.authorization_assessment,
    status: 'inert-authorization-candidate',
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
    submitter_collective_authority: false,
    runtime_authority: false,
    portable_authority: false,
    external_effect_authority: false,
    authority_effect: 'none',
    network_effect: 'none'
  });

  return Object.freeze({
    assessment,
    assessment_digest: digestObject(assessment)
  });
}

function assessInvitation({
  binding,
  index,
  requester,
  circlePackage,
  charterPolicy,
  charterLifecycle,
  historicalLedger,
  now
}) {
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

  const priorInvitations = historicalLedger.bindings
    .slice(0, index)
    .filter(candidate => candidate.record_type === 'invitation');
  if (priorInvitations.length === 0) {
    if (
      requester !== circlePackage.circle.created_by
      || resolved.charter.version !== 1
    ) {
      throw new ValidationError('Circle invitation creator bootstrap is limited to the first genesis invitation');
    }
    return {
      authorization_mode: 'creator-bootstrap-first-invitation',
      authorizing_membership_id: null,
      participant_attestation_digests: Object.freeze([]),
      decision_tally: null
    };
  }

  const membership = requireUniqueMembershipWithMode({
    circlePackage,
    charter: resolved.charter,
    principalId: requester,
    at: record.issued_at,
    requiredMode: 'approve',
    label: 'Circle invitation issuer'
  });
  return {
    authorization_mode: 'active-member-approve',
    authorizing_membership_id: membership.membership_id,
    participant_attestation_digests: Object.freeze([]),
    decision_tally: null
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
    decision_tally: null
  };
}

function assessProposal({
  binding,
  requester,
  circlePackage,
  charterPolicy,
  charterLifecycle,
  now
}) {
  const record = binding.record;
  if (record.proposer !== requester) {
    throw new ValidationError('Circle proposal requester must equal proposer');
  }
  const resolved = resolveCircleCharterAt(charterPolicy, circlePackage, charterLifecycle, {
    at: record.created_at,
    now
  });
  if (resolved.charter_digest !== binding.governing_charter_digest) {
    throw new ValidationError('Circle proposal authorization charter binding is invalid');
  }
  const membership = requireUniqueMembershipWithMode({
    circlePackage,
    charter: resolved.charter,
    principalId: requester,
    at: record.created_at,
    requiredMode: 'propose',
    label: 'Circle proposal proposer'
  });
  return {
    authorization_mode: 'active-member-propose',
    authorizing_membership_id: membership.membership_id,
    participant_attestation_digests: Object.freeze([]),
    decision_tally: null
  };
}

function assessDecision({
  binding,
  requester,
  circlePackage,
  charterPolicy,
  charterLifecycle,
  historicalLedger,
  participantAttestations,
  hypervisorPublicKey,
  now
}) {
  const record = binding.record;
  if (!SUPPORTED_DECISION_OUTCOMES.has(record.outcome)) {
    throw new ValidationError('Circle decision outcome is not supported by record authorization v0');
  }
  if (!hypervisorPublicKey) {
    throw new ValidationError('Circle decision authorization requires trusted Hypervisor participant evidence');
  }
  if (!Array.isArray(participantAttestations) || participantAttestations.length > 4096) {
    throw new ValidationError('Circle decision participant attestations are invalid');
  }

  const proposalBinding = historicalLedger.bindings.find(
    candidate => candidate.binding_id === binding.basis_binding_id
  );
  if (!proposalBinding || proposalBinding.record_type !== 'proposal') {
    throw new ValidationError('Circle decision authorization requires its historical proposal basis');
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

  const electorate = buildCompleteDecisionElectorate({
    circlePackage,
    charter: resolved.charter,
    proposalCreatedAt: proposal.created_at
  });
  if (electorate.length < 2) {
    throw new ValidationError('Circle decision authorization requires at least two eligible principals');
  }

  const electorateByMembership = new Map(electorate.map(item => [item.membership_id, item]));
  const seenPrincipals = new Set();
  const seenMemberships = new Set();
  const verified = [];

  for (const input of participantAttestations) {
    const item = verifyCircleDecisionParticipationAttestation(input, hypervisorPublicKey);
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
      throw new ValidationError('Circle decision participant is outside the frozen electorate');
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

    seenPrincipals.add(statement.principal_id);
    seenMemberships.add(statement.membership_id);
    verified.push(item);
  }

  if (
    verified.length !== electorate.length
    || electorate.some(item => !seenMemberships.has(item.membership_id))
  ) {
    throw new ValidationError('Circle decision requires one authenticated attestation from every eligible voter');
  }

  const attestationDigests = verified.map(item => item.attestation_digest).sort();
  const decisionReceiptDigests = [...record.participant_receipts].sort();
  if (
    decisionReceiptDigests.length !== attestationDigests.length
    || decisionReceiptDigests.some((value, index) => value !== attestationDigests[index])
  ) throw new ValidationError('Circle decision participant_receipts do not match authenticated attestations');

  const submitterIsParticipant = verified.some(item => item.statement.principal_id === requester);
  let authorizingMembershipId = null;
  let transportMode = 'participant-aggregator';
  if (!submitterIsParticipant) {
    const reviewer = requireUniqueMembershipWithMode({
      circlePackage,
      charter: resolved.charter,
      principalId: requester,
      at: record.decided_at,
      requiredMode: 'review',
      label: 'Circle decision transport reviewer'
    });
    authorizingMembershipId = reviewer.membership_id;
    transportMode = 'review-member-aggregator';
  }

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
  const computedOutcome = !quorumMet
    ? 'no-quorum'
    : approvalMet
      ? 'accepted'
      : 'rejected';

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
    })
  };
}

function buildCompleteDecisionElectorate({ circlePackage, charter, proposalCreatedAt }) {
  const proposalMs = Date.parse(proposalCreatedAt);
  const voteRoles = new Set(
    charter.roles.filter(role => role.declared_modes.includes('vote')).map(role => role.role_id)
  );
  const eligible = [];
  const seenPrincipals = new Set();

  for (const membership of circlePackage.memberships) {
    if (!membership.role_ids.some(roleId => voteRoles.has(roleId))) continue;
    if (Date.parse(membership.accepted_at) > proposalMs) continue;

    if (
      membership.status !== 'active'
      || Date.parse(membership.status_effective_at) > proposalMs
      || circlePackage.exits.some(exit => exit.membership_id === membership.membership_id)
    ) {
      throw new ValidationError(
        'Circle decision electorate is ambiguous without complete membership lifecycle history'
      );
    }
    if (seenPrincipals.has(membership.principal_id)) {
      throw new ValidationError('Circle decision electorate cannot contain multiple voting memberships for one principal');
    }
    seenPrincipals.add(membership.principal_id);
    eligible.push(membership);
  }

  return eligible;
}

function requireUniqueMembershipWithMode({
  circlePackage,
  charter,
  principalId,
  at,
  requiredMode,
  label
}) {
  const atMs = Date.parse(at);
  const roleIdsWithMode = new Set(
    charter.roles.filter(role => role.declared_modes.includes(requiredMode)).map(role => role.role_id)
  );
  const memberships = circlePackage.memberships.filter(membership => {
    if (membership.principal_id !== principalId) return false;
    if (!membership.role_ids.some(roleId => roleIdsWithMode.has(roleId))) return false;
    if (Date.parse(membership.accepted_at) > atMs) return false;
    if (membership.status !== 'active') return false;
    if (Date.parse(membership.status_effective_at) > atMs) return false;
    if (circlePackage.exits.some(exit => exit.membership_id === membership.membership_id)) return false;
    return true;
  });
  if (memberships.length !== 1) {
    throw new ValidationError(`${label} requires exactly one active unexited membership with ${requiredMode} mode`);
  }
  return memberships[0];
}

function validateParticipantStatement(statement) {
  exactObject(statement, 'Circle decision participation statement', [
    'schema',
    'circle_id',
    'decision_id',
    'proposal_id',
    'proposal_binding_id',
    'proposal_record_digest',
    'governing_charter_digest',
    'membership_id',
    'principal_id',
    'vote',
    'participated_at',
    'runtime_authority',
    'portable_authority',
    'external_effect_authority',
    'authority_effect',
    'network_effect'
  ]);
  if (
    statement.schema !== CIRCLE_RECORD_AUTHORIZATION_POLICY.schemas.participant_attestation_statement
    || !ID.test(statement.circle_id ?? '')
    || !ID.test(statement.decision_id ?? '')
    || !ID.test(statement.proposal_id ?? '')
    || !ID.test(statement.proposal_binding_id ?? '')
    || !DIGEST.test(statement.proposal_record_digest ?? '')
    || !DIGEST.test(statement.governing_charter_digest ?? '')
    || !ID.test(statement.membership_id ?? '')
    || !ID.test(statement.principal_id ?? '')
    || !VOTES.has(statement.vote)
    || statement.runtime_authority !== false
    || statement.portable_authority !== false
    || statement.external_effect_authority !== false
    || statement.authority_effect !== 'none'
    || statement.network_effect !== 'none'
  ) throw new ValidationError('Circle decision participation statement is invalid');
  canonicalTimestamp(statement.participated_at, 'Circle decision participation participated_at');
  return deepFreeze(structuredClone(statement));
}

function requiredId(value, label) {
  if (typeof value !== 'string' || !ID.test(value)) throw new ValidationError(`${label} is invalid`);
  return value;
}

function requiredDigest(value, label) {
  if (typeof value !== 'string' || !DIGEST.test(value)) throw new ValidationError(`${label} is invalid`);
  return value;
}

function requiredVote(value) {
  if (!VOTES.has(value)) throw new ValidationError('Circle decision participation vote is invalid');
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
  if (
    actual.size !== expected.size
    || values.length !== expected.size
    || [...expected].some(value => !actual.has(value))
  ) throw new ValidationError(`${label} inventory drifted`);
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
