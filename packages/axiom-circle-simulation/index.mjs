import { digestObject, ValidationError } from '../../mesh/src/lib/canonical.mjs';
import { validateCircleCorePackage } from '../../mesh/src/lib/circle-core.mjs';

const ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/;
const DIGEST = /^[a-f0-9]{64}$/;
const CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/;
const MODES = new Set(['deliberate', 'evidence', 'vote']);
const VOTE_CHOICES = new Set(['approve', 'reject', 'abstain']);

export function validateCircleSimulationPolicy(policy) {
  exactObject(policy, 'Circle simulation policy', [
    'schema',
    'version',
    'status',
    'runtime_activation',
    'authority_effect',
    'network_effect',
    'minimum_distinct_active_principals',
    'supported_modes',
    'vote_choices',
    'requirements',
    'output'
  ]);
  if (
    policy.schema !== 'axiom-circle-multiprincipal-simulation-policy.v0'
    || policy.version !== 0
    || policy.status !== 'inert-multiprincipal-simulation'
    || policy.runtime_activation !== false
    || policy.authority_effect !== 'none'
    || policy.network_effect !== 'none'
    || policy.minimum_distinct_active_principals !== 2
  ) throw new ValidationError('Circle simulation activation boundary is invalid');
  exactSet(policy.supported_modes, MODES, 'Circle simulation modes');
  exactSet(policy.vote_choices, VOTE_CHOICES, 'Circle simulation vote choices');
  exactObject(policy.requirements, 'Circle simulation requirements', [
    'active_membership_required',
    'one_active_membership_per_principal_required',
    'role_declared_mode_required',
    'one_vote_per_membership_per_proposal',
    'exact_charter_digest_required',
    'exact_circle_id_required',
    'chronological_actions_required',
    'open_proposal_required',
    'proposal_window_required',
    'evidence_refs_are_non_authorizing',
    'participant_identity_is_local_principal_id'
  ]);
  if (Object.values(policy.requirements).some(value => value !== true)) {
    throw new ValidationError('Circle simulation requirement was weakened');
  }
  exactObject(policy.output, 'Circle simulation output policy', [
    'schema',
    'policy_digest_required',
    'input_package_digest_required',
    'action_sequence_digest_required',
    'charter_digest_required',
    'participant_principals_required',
    'finality',
    'may_mutate_circle',
    'may_mint_runtime_authority',
    'may_create_grid_event',
    'may_create_gateway_action',
    'authority_effect',
    'network_effect'
  ]);
  if (
    policy.output.schema !== 'axiom-circle-simulation-transcript.v0'
    || policy.output.policy_digest_required !== true
    || policy.output.input_package_digest_required !== true
    || policy.output.action_sequence_digest_required !== true
    || policy.output.charter_digest_required !== true
    || policy.output.participant_principals_required !== true
    || policy.output.finality !== 'simulation-only'
    || policy.output.may_mutate_circle !== false
    || policy.output.may_mint_runtime_authority !== false
    || policy.output.may_create_grid_event !== false
    || policy.output.may_create_gateway_action !== false
    || policy.output.authority_effect !== 'none'
    || policy.output.network_effect !== 'none'
  ) throw new ValidationError('Circle simulation output boundary is invalid');
  return true;
}

export function simulateCircleDeliberation(policy, document, actions, { now = new Date() } = {}) {
  validateCircleSimulationPolicy(policy);
  validateCircleCorePackage(document, { now });
  if (!Array.isArray(actions) || actions.length < 2 || actions.length > 4096) {
    throw new ValidationError('Circle simulation actions are invalid');
  }

  const policyDigest = digestObject(policy);
  const charterDigest = digestObject(document.charter);
  const roleById = new Map(document.charter.roles.map(role => [role.role_id, role]));
  const activeMemberships = document.memberships.filter(item => item.status === 'active');
  const activeById = new Map(activeMemberships.map(item => [item.membership_id, item]));
  const activePrincipals = activeMemberships.map(item => item.principal_id);
  if (new Set(activePrincipals).size !== activePrincipals.length) {
    throw new ValidationError('Circle simulation requires one active membership per principal');
  }
  if (new Set(activePrincipals).size < policy.minimum_distinct_active_principals) {
    throw new ValidationError('Circle simulation requires multiple distinct active principals');
  }

  const proposalById = new Map(document.proposals.map(item => [item.proposal_id, item]));
  const seenActionIds = new Set();
  const seenVotes = new Set();
  const participatingPrincipals = new Set();
  let previousAtMs = null;
  const normalized = [];

  for (const action of actions) {
    exactObject(action, 'Circle simulation action', [
      'schema',
      'action_id',
      'circle_id',
      'charter_digest',
      'proposal_id',
      'membership_id',
      'principal_id',
      'mode',
      'at',
      'payload',
      'authority_effect',
      'network_effect'
    ]);
    if (
      action.schema !== 'axiom-circle-simulation-action.v0'
      || !identifier(action.action_id)
      || seenActionIds.has(action.action_id)
      || action.circle_id !== document.circle.circle_id
      || action.charter_digest !== charterDigest
      || !MODES.has(action.mode)
      || action.authority_effect !== 'none'
      || action.network_effect !== 'none'
    ) throw new ValidationError('Circle simulation action boundary is invalid');
    seenActionIds.add(action.action_id);

    const membership = activeById.get(action.membership_id);
    if (!membership || membership.principal_id !== action.principal_id) {
      throw new ValidationError('Circle simulation action is not bound to an active membership');
    }
    const proposal = proposalById.get(action.proposal_id);
    if (!proposal || proposal.status !== 'open') {
      throw new ValidationError('Circle simulation requires an open proposal');
    }
    const at = canonicalTimestamp(action.at, 'Circle simulation action at');
    const atMs = Date.parse(at);
    if (previousAtMs !== null && atMs < previousAtMs) {
      throw new ValidationError('Circle simulation actions are not chronological');
    }
    previousAtMs = atMs;
    if (atMs < Date.parse(proposal.created_at) || atMs > Date.parse(proposal.closes_at)) {
      throw new ValidationError('Circle simulation action falls outside the proposal window');
    }
    if (!membershipAllowsMode(membership, action.mode, roleById)) {
      throw new ValidationError('Circle simulation membership role does not declare this mode');
    }

    const payload = validatePayload(action.mode, action.payload);
    if (action.mode === 'vote') {
      const voteKey = `${action.membership_id}:${action.proposal_id}`;
      if (seenVotes.has(voteKey)) {
        throw new ValidationError('Circle simulation permits one vote per membership per proposal');
      }
      seenVotes.add(voteKey);
    }
    participatingPrincipals.add(action.principal_id);
    normalized.push(Object.freeze({ ...action, payload: Object.freeze(payload) }));
  }

  if (participatingPrincipals.size < policy.minimum_distinct_active_principals) {
    throw new ValidationError('Circle simulation requires actions from multiple distinct principals');
  }

  const proposalIds = [...new Set(normalized.map(action => action.proposal_id))].sort();
  const proposalResults = proposalIds.map(proposalId => simulationResultForProposal({
    proposalId,
    actions: normalized,
    activeMemberships,
    roleById,
    decisionRule: document.charter.decision_rule
  }));

  return Object.freeze({
    schema: policy.output.schema,
    policy_digest: policyDigest,
    input_package_digest: digestObject(document),
    action_sequence_digest: digestObject(normalized),
    circle_id: document.circle.circle_id,
    charter_digest: charterDigest,
    participant_principals: Object.freeze([...participatingPrincipals].sort()),
    action_count: normalized.length,
    actions: Object.freeze(normalized),
    proposal_results: Object.freeze(proposalResults),
    finality: 'simulation-only',
    may_mutate_circle: false,
    may_mint_runtime_authority: false,
    may_create_grid_event: false,
    may_create_gateway_action: false,
    authority_effect: 'none',
    network_effect: 'none'
  });
}

function simulationResultForProposal({ proposalId, actions, activeMemberships, roleById, decisionRule }) {
  const votes = actions.filter(action => action.proposal_id === proposalId && action.mode === 'vote');
  const eligibleVoters = activeMemberships.filter(membership => membershipAllowsMode(
    membership,
    'vote',
    roleById
  ));
  const counts = { approve: 0, reject: 0, abstain: 0 };
  for (const vote of votes) counts[vote.payload.choice] += 1;
  const quorumParticipants = counts.approve
    + counts.reject
    + (decisionRule.abstention_counts_toward_quorum ? counts.abstain : 0);
  const quorumBasisPoints = eligibleVoters.length
    ? Math.floor((quorumParticipants * 10_000) / eligibleVoters.length)
    : 0;
  const decisiveVotes = counts.approve + counts.reject;
  const approvalBasisPoints = decisiveVotes
    ? Math.floor((counts.approve * 10_000) / decisiveVotes)
    : 0;
  const quorumMet = quorumBasisPoints >= decisionRule.quorum_basis_points;
  const simulatedOutcome = !quorumMet
    ? 'no-quorum'
    : approvalBasisPoints >= decisionRule.approval_basis_points
      ? 'accepted'
      : 'rejected';
  return Object.freeze({
    proposal_id: proposalId,
    eligible_voters: eligibleVoters.length,
    votes: Object.freeze({ ...counts }),
    quorum_basis_points_observed: quorumBasisPoints,
    quorum_basis_points_required: decisionRule.quorum_basis_points,
    approval_basis_points_observed: approvalBasisPoints,
    approval_basis_points_required: decisionRule.approval_basis_points,
    simulated_outcome: simulatedOutcome,
    finality: 'simulation-only',
    creates_circle_decision: false,
    runtime_authority: false,
    authority_effect: 'none'
  });
}

function membershipAllowsMode(membership, mode, roleById) {
  return membership.role_ids.some(roleId => roleById.get(roleId)?.declared_modes.includes(mode));
}

function validatePayload(mode, payload) {
  if (mode === 'deliberate') {
    exactObject(payload, 'Circle simulation deliberation payload', ['statement_digest']);
    if (!DIGEST.test(payload.statement_digest)) {
      throw new ValidationError('Circle simulation deliberation digest is invalid');
    }
    return { statement_digest: payload.statement_digest };
  }
  if (mode === 'evidence') {
    exactObject(payload, 'Circle simulation evidence payload', ['evidence_ref']);
    if (
      typeof payload.evidence_ref !== 'string'
      || payload.evidence_ref.length < 1
      || payload.evidence_ref.length > 512
      || CONTROL.test(payload.evidence_ref)
    ) throw new ValidationError('Circle simulation evidence reference is invalid');
    return { evidence_ref: payload.evidence_ref };
  }
  exactObject(payload, 'Circle simulation vote payload', ['choice']);
  if (!VOTE_CHOICES.has(payload.choice)) {
    throw new ValidationError('Circle simulation vote choice is invalid');
  }
  return { choice: payload.choice };
}

function identifier(value) {
  return typeof value === 'string' && ID.test(value);
}

function canonicalTimestamp(value, label) {
  if (typeof value !== 'string') throw new ValidationError(`${label} is invalid`);
  const parsed = new Date(value);
  if (Number.isNaN(parsed.valueOf()) || parsed.toISOString() !== value) {
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
}
