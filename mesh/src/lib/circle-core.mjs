import { digestObject, ValidationError } from './canonical.mjs';

export const CIRCLE_CORE_PACKAGE_SCHEMA = 'axiom-circle-core-package.v0';
export const CIRCLE_SCHEMA = 'axiom-circle.v0';
export const CIRCLE_CHARTER_SCHEMA = 'axiom-circle-charter.v0';
export const CIRCLE_INVITATION_SCHEMA = 'axiom-circle-invitation.v0';
export const CIRCLE_MEMBERSHIP_SCHEMA = 'axiom-circle-membership.v0';
export const CIRCLE_PROPOSAL_SCHEMA = 'axiom-circle-proposal.v0';
export const CIRCLE_TASK_SCHEMA = 'axiom-circle-task.v0';
export const CIRCLE_DECISION_SCHEMA = 'axiom-circle-decision.v0';
export const CIRCLE_APPEAL_SCHEMA = 'axiom-circle-appeal.v0';
export const CIRCLE_EXIT_SCHEMA = 'axiom-circle-exit.v0';
export const CIRCLE_EXPORT_SCHEMA = 'axiom-circle-export.v0';

const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/;
const DIGEST = /^[a-f0-9]{64}$/;
const PARTICIPATION_MODELS = new Set(['voluntary', 'contractual']);
const MEMBER_STATUSES = new Set(['active', 'suspended', 'revoked', 'exited']);
const PROPOSAL_STATUSES = new Set(['open', 'withdrawn', 'closed']);
const TASK_STATUSES = new Set(['open', 'accepted', 'completed', 'cancelled']);
const DECISION_OUTCOMES = new Set(['accepted', 'rejected', 'no-quorum', 'withdrawn']);
const FINALITY_STATES = new Set(['circle-local-provisional', 'circle-local-accepted']);
const APPEAL_TARGETS = new Set(['decision', 'membership', 'task']);
const APPEAL_STATUSES = new Set(['open', 'accepted', 'rejected', 'withdrawn']);
const EXIT_KINDS = new Set(['voluntary-exit', 'revocation']);
const DISCLOSURE_CLASSES = new Set(['public-safe', 'member-private']);
const ROLE_MODES = new Set([
  'propose',
  'deliberate',
  'evidence',
  'vote',
  'approve',
  'review',
  'appeal',
  'observe'
]);

export function validateCircleCorePackage(document) {
  exactObject(document, 'Circle core package', [
    'schema',
    'version',
    'status',
    'circle',
    'charter',
    'invitations',
    'memberships',
    'proposals',
    'tasks',
    'decisions',
    'appeals',
    'exits',
    'exports',
    'authority_effect',
    'network_effect',
    'runtime_activation'
  ]);
  if (
    document.schema !== CIRCLE_CORE_PACKAGE_SCHEMA
    || document.version !== 0
    || document.status !== 'inert-contract-laboratory'
    || document.authority_effect !== 'none'
    || document.network_effect !== 'none'
    || document.runtime_activation !== false
  ) throw new ValidationError('Circle core package activation boundary is invalid');

  const circle = validateCircle(document.circle);
  const charter = validateCharter(document.charter, circle);
  const charterDigest = digestObject(charter);
  const roles = new Set(charter.roles.map(role => role.role_id));

  const invitations = validateUniqueArray(
    document.invitations,
    'Circle invitations',
    'invitation_id',
    invitation => validateInvitation(invitation, circle, charterDigest, roles)
  );
  const invitationById = new Map(invitations.map(item => [item.invitation_id, item]));

  const memberships = validateUniqueArray(
    document.memberships,
    'Circle memberships',
    'membership_id',
    membership => validateMembership(membership, circle, roles, invitationById)
  );
  const consumedInvitations = new Set();
  for (const membership of memberships) {
    if (consumedInvitations.has(membership.invitation_id)) {
      throw new ValidationError(
        `Invitation ${membership.invitation_id} is one-use and cannot create multiple memberships`
      );
    }
    consumedInvitations.add(membership.invitation_id);
  }
  const membershipById = new Map(memberships.map(item => [item.membership_id, item]));
  const activePrincipals = new Set(
    memberships.filter(item => item.status === 'active').map(item => item.principal_id)
  );

  const proposals = validateUniqueArray(
    document.proposals,
    'Circle proposals',
    'proposal_id',
    proposal => validateProposal(proposal, circle, charterDigest, activePrincipals)
  );
  const proposalById = new Map(proposals.map(item => [item.proposal_id, item]));

  const tasks = validateUniqueArray(
    document.tasks,
    'Circle tasks',
    'task_id',
    task => validateTask(task, circle, proposalById, membershipById)
  );
  const taskById = new Map(tasks.map(item => [item.task_id, item]));

  const decisions = validateUniqueArray(
    document.decisions,
    'Circle decisions',
    'decision_id',
    decision => validateDecision(decision, circle, charterDigest, proposalById)
  );
  const decisionById = new Map(decisions.map(item => [item.decision_id, item]));

  const appeals = validateUniqueArray(
    document.appeals,
    'Circle appeals',
    'appeal_id',
    appeal => validateAppeal({
      appeal,
      circle,
      membershipById,
      decisionById,
      taskById,
      activePrincipals
    })
  );

  const exits = validateUniqueArray(
    document.exits,
    'Circle exits',
    'exit_id',
    exit => validateExit(exit, circle, membershipById)
  );

  const exports = validateUniqueArray(
    document.exports,
    'Circle exports',
    'export_id',
    record => validateExport(record, circle)
  );

  return Object.freeze({
    valid: true,
    schema: document.schema,
    circle_id: circle.circle_id,
    charter_digest: charterDigest,
    package_digest: digestObject(document),
    counts: Object.freeze({
      invitations: invitations.length,
      memberships: memberships.length,
      proposals: proposals.length,
      tasks: tasks.length,
      decisions: decisions.length,
      appeals: appeals.length,
      exits: exits.length,
      exports: exports.length
    }),
    authority_effect: 'none',
    network_effect: 'none',
    runtime_activation: false
  });
}

export function circleCoreDigest(document) {
  validateCircleCorePackage(document);
  return digestObject(document);
}

function validateCircle(circle) {
  exactObject(circle, 'Circle descriptor', [
    'schema',
    'circle_id',
    'name',
    'purpose',
    'created_by',
    'created_at',
    'trust_anchor_id',
    'participation_model',
    'member_state_ownership',
    'policy_floor',
    'authority_effect',
    'network_effect',
    'runtime_activation'
  ]);
  if (
    circle.schema !== CIRCLE_SCHEMA
    || !id(circle.circle_id)
    || !text(circle.name, 1, 160)
    || !text(circle.purpose, 1, 1000)
    || !id(circle.created_by)
    || !id(circle.trust_anchor_id)
    || !PARTICIPATION_MODELS.has(circle.participation_model)
    || circle.member_state_ownership !== 'independent-node'
    || circle.policy_floor !== 'raise-only'
    || circle.authority_effect !== 'none'
    || circle.network_effect !== 'none'
    || circle.runtime_activation !== false
  ) throw new ValidationError('Circle descriptor is invalid');
  validDate(circle.created_at, 'Circle created_at');
  return circle;
}

function validateCharter(charter, circle) {
  exactObject(charter, 'Circle charter', [
    'schema',
    'circle_id',
    'version',
    'effective_from',
    'supersedes_digest',
    'roles',
    'decision_rule',
    'appeal_enabled',
    'member_exit_enabled',
    'execution_authority',
    'authority_effect'
  ]);
  if (
    charter.schema !== CIRCLE_CHARTER_SCHEMA
    || charter.circle_id !== circle.circle_id
    || !Number.isSafeInteger(charter.version)
    || charter.version < 1
    || !(charter.supersedes_digest === null || DIGEST.test(charter.supersedes_digest))
    || charter.appeal_enabled !== true
    || charter.member_exit_enabled !== true
    || charter.execution_authority !== false
    || charter.authority_effect !== 'none'
  ) throw new ValidationError('Circle charter is invalid');
  validDate(charter.effective_from, 'Circle charter effective_from');
  if (!Array.isArray(charter.roles) || !charter.roles.length || charter.roles.length > 64) {
    throw new ValidationError('Circle charter roles are invalid');
  }
  const seen = new Set();
  for (const role of charter.roles) {
    exactObject(role, 'Circle role', ['role_id', 'label', 'declared_modes', 'execution_authority']);
    if (
      !id(role.role_id)
      || seen.has(role.role_id)
      || !text(role.label, 1, 120)
      || !stringArray(role.declared_modes, 0, 16, ROLE_MODES)
      || role.execution_authority !== false
    ) throw new ValidationError('Circle role is invalid');
    seen.add(role.role_id);
  }
  exactObject(charter.decision_rule, 'Circle decision rule', [
    'quorum_basis_points',
    'approval_basis_points',
    'abstention_counts_toward_quorum'
  ]);
  if (
    !basisPoints(charter.decision_rule.quorum_basis_points)
    || !basisPoints(charter.decision_rule.approval_basis_points)
    || typeof charter.decision_rule.abstention_counts_toward_quorum !== 'boolean'
  ) throw new ValidationError('Circle decision rule is invalid');
  return charter;
}

function validateInvitation(invitation, circle, charterDigest, roles) {
  exactObject(invitation, 'Circle invitation', [
    'schema',
    'invitation_id',
    'circle_id',
    'invited_principal',
    'membership_class',
    'role_ids',
    'issued_by',
    'issued_at',
    'expires_at',
    'charter_digest',
    'one_use',
    'authority_effect'
  ]);
  if (
    invitation.schema !== CIRCLE_INVITATION_SCHEMA
    || !id(invitation.invitation_id)
    || invitation.circle_id !== circle.circle_id
    || !id(invitation.invited_principal)
    || !['member', 'guardian', 'contractor', 'employee', 'observer'].includes(invitation.membership_class)
    || !stringArray(invitation.role_ids, 0, 64)
    || invitation.role_ids.some(role => !roles.has(role))
    || !id(invitation.issued_by)
    || invitation.charter_digest !== charterDigest
    || invitation.one_use !== true
    || invitation.authority_effect !== 'none'
  ) throw new ValidationError('Circle invitation is invalid');
  const issued = validDate(invitation.issued_at, 'Circle invitation issued_at');
  const expires = validDate(invitation.expires_at, 'Circle invitation expires_at');
  if (expires <= issued) {
    throw new ValidationError(`Invitation ${invitation.invitation_id} expiry must follow issuance`);
  }
  return invitation;
}

function validateMembership(membership, circle, roles, invitationById) {
  exactObject(membership, 'Circle membership', [
    'schema',
    'membership_id',
    'circle_id',
    'invitation_id',
    'principal_id',
    'role_ids',
    'accepted_at',
    'status',
    'status_effective_at',
    'member_state_ownership',
    'disclosure_profile',
    'authority_effect',
    'network_effect'
  ]);
  const invitation = invitationById.get(membership.invitation_id);
  if (
    membership.schema !== CIRCLE_MEMBERSHIP_SCHEMA
    || !id(membership.membership_id)
    || membership.circle_id !== circle.circle_id
    || !invitation
    || membership.principal_id !== invitation.invited_principal
    || !stringArray(membership.role_ids, 0, 64)
    || membership.role_ids.some(role => !roles.has(role) || !invitation.role_ids.includes(role))
    || !MEMBER_STATUSES.has(membership.status)
    || membership.member_state_ownership !== 'independent-node'
    || membership.disclosure_profile !== 'selective'
    || membership.authority_effect !== 'none'
    || membership.network_effect !== 'none'
  ) throw new ValidationError('Circle membership is invalid');
  const accepted = validDate(membership.accepted_at, 'Circle membership accepted_at');
  const statusEffective = validDate(
    membership.status_effective_at,
    'Circle membership status_effective_at'
  );
  const issued = new Date(invitation.issued_at);
  const expires = new Date(invitation.expires_at);
  if (accepted < issued) {
    throw new ValidationError(`Membership ${membership.membership_id} accepted before invitation issuance`);
  }
  if (accepted > expires) {
    throw new ValidationError(`Membership ${membership.membership_id} accepted an expired invitation`);
  }
  if (statusEffective < accepted) {
    throw new ValidationError(`Membership ${membership.membership_id} status_effective_at precedes acceptance`);
  }
  return membership;
}

function validateProposal(proposal, circle, charterDigest, activePrincipals) {
  exactObject(proposal, 'Circle proposal', [
    'schema',
    'proposal_id',
    'circle_id',
    'charter_digest',
    'proposer',
    'title',
    'summary',
    'created_at',
    'closes_at',
    'status',
    'evidence_refs',
    'execution_effect',
    'authority_effect'
  ]);
  if (
    proposal.schema !== CIRCLE_PROPOSAL_SCHEMA
    || !id(proposal.proposal_id)
    || proposal.circle_id !== circle.circle_id
    || proposal.charter_digest !== charterDigest
    || !activePrincipals.has(proposal.proposer)
    || !text(proposal.title, 1, 200)
    || !text(proposal.summary, 1, 4000)
    || !PROPOSAL_STATUSES.has(proposal.status)
    || !stringArray(proposal.evidence_refs, 0, 512)
    || proposal.execution_effect !== 'none'
    || proposal.authority_effect !== 'none'
  ) throw new ValidationError('Circle proposal is invalid');
  const created = validDate(proposal.created_at, 'Circle proposal created_at');
  const closes = validDate(proposal.closes_at, 'Circle proposal closes_at');
  if (closes <= created) throw new ValidationError('Circle proposal closes_at must follow created_at');
  return proposal;
}

function validateTask(task, circle, proposalById, membershipById) {
  exactObject(task, 'Circle task', [
    'schema',
    'task_id',
    'circle_id',
    'proposal_id',
    'assigned_membership_id',
    'description',
    'created_at',
    'due_at',
    'status',
    'evidence_refs',
    'execution_authority',
    'authority_effect'
  ]);
  if (
    task.schema !== CIRCLE_TASK_SCHEMA
    || !id(task.task_id)
    || task.circle_id !== circle.circle_id
    || !(task.proposal_id === null || proposalById.has(task.proposal_id))
    || !membershipById.has(task.assigned_membership_id)
    || !text(task.description, 1, 2000)
    || !TASK_STATUSES.has(task.status)
    || !stringArray(task.evidence_refs, 0, 512)
    || task.execution_authority !== false
    || task.authority_effect !== 'none'
  ) throw new ValidationError('Circle task is invalid');
  const created = validDate(task.created_at, 'Circle task created_at');
  if (task.due_at !== null) {
    const due = validDate(task.due_at, 'Circle task due_at');
    if (due <= created) throw new ValidationError('Circle task due_at must follow created_at');
  }
  return task;
}

function validateDecision(decision, circle, charterDigest, proposalById) {
  exactObject(decision, 'Circle decision', [
    'schema',
    'decision_id',
    'circle_id',
    'proposal_id',
    'charter_digest',
    'outcome',
    'decided_at',
    'participant_receipts',
    'finality',
    'runtime_authority',
    'authority_effect'
  ]);
  if (
    decision.schema !== CIRCLE_DECISION_SCHEMA
    || !id(decision.decision_id)
    || decision.circle_id !== circle.circle_id
    || !proposalById.has(decision.proposal_id)
    || decision.charter_digest !== charterDigest
    || !DECISION_OUTCOMES.has(decision.outcome)
    || !stringArray(decision.participant_receipts, 0, 512)
    || !FINALITY_STATES.has(decision.finality)
    || decision.runtime_authority !== false
    || decision.authority_effect !== 'none'
  ) throw new ValidationError('Circle decision is invalid');
  validDate(decision.decided_at, 'Circle decision decided_at');
  return decision;
}

function validateAppeal({
  appeal,
  circle,
  membershipById,
  decisionById,
  taskById,
  activePrincipals
}) {
  exactObject(appeal, 'Circle appeal', [
    'schema',
    'appeal_id',
    'circle_id',
    'target_type',
    'target_id',
    'filed_by',
    'reason',
    'filed_at',
    'status',
    'resolved_at',
    'authority_effect'
  ]);
  const targetExists = appeal.target_type === 'decision'
    ? decisionById.has(appeal.target_id)
    : appeal.target_type === 'membership'
      ? membershipById.has(appeal.target_id)
      : taskById.has(appeal.target_id);
  if (
    appeal.schema !== CIRCLE_APPEAL_SCHEMA
    || !id(appeal.appeal_id)
    || appeal.circle_id !== circle.circle_id
    || !APPEAL_TARGETS.has(appeal.target_type)
    || !targetExists
    || !activePrincipals.has(appeal.filed_by)
    || !text(appeal.reason, 1, 4000)
    || !APPEAL_STATUSES.has(appeal.status)
    || appeal.authority_effect !== 'none'
  ) throw new ValidationError('Circle appeal is invalid');
  const filed = validDate(appeal.filed_at, 'Circle appeal filed_at');
  if (appeal.resolved_at !== null) {
    const resolved = validDate(appeal.resolved_at, 'Circle appeal resolved_at');
    if (resolved < filed) throw new ValidationError('Circle appeal resolved_at precedes filed_at');
  }
  return appeal;
}

function validateExit(exit, circle, membershipById) {
  exactObject(exit, 'Circle exit', [
    'schema',
    'exit_id',
    'circle_id',
    'membership_id',
    'principal_id',
    'initiated_by',
    'kind',
    'effective_at',
    'reason_code',
    'future_obligation_effect',
    'history_rewrite',
    'authority_effect'
  ]);
  const membership = membershipById.get(exit.membership_id);
  if (
    exit.schema !== CIRCLE_EXIT_SCHEMA
    || !id(exit.exit_id)
    || exit.circle_id !== circle.circle_id
    || !membership
    || exit.principal_id !== membership.principal_id
    || !id(exit.initiated_by)
    || !EXIT_KINDS.has(exit.kind)
    || !id(exit.reason_code)
    || exit.future_obligation_effect !== 'ends-except-explicit-post-exit-rules'
    || exit.history_rewrite !== false
    || exit.authority_effect !== 'none'
  ) throw new ValidationError('Circle exit is invalid');
  const effective = validDate(exit.effective_at, 'Circle exit effective_at');
  if (effective < new Date(membership.accepted_at)) {
    throw new ValidationError('Circle exit predates membership acceptance');
  }
  return exit;
}

function validateExport(record, circle) {
  exactObject(record, 'Circle export', [
    'schema',
    'export_id',
    'circle_id',
    'exported_by',
    'exported_at',
    'disclosure_class',
    'included_record_digests',
    'portable_authority',
    'authority_effect',
    'network_effect'
  ]);
  if (
    record.schema !== CIRCLE_EXPORT_SCHEMA
    || !id(record.export_id)
    || record.circle_id !== circle.circle_id
    || !id(record.exported_by)
    || !DISCLOSURE_CLASSES.has(record.disclosure_class)
    || !Array.isArray(record.included_record_digests)
    || record.included_record_digests.length > 4096
    || record.included_record_digests.some(value => !DIGEST.test(value))
    || new Set(record.included_record_digests).size !== record.included_record_digests.length
    || record.portable_authority !== false
    || record.authority_effect !== 'none'
    || record.network_effect !== 'none'
  ) throw new ValidationError('Circle export is invalid');
  validDate(record.exported_at, 'Circle export exported_at');
  return record;
}

function validateUniqueArray(value, name, key, validator) {
  if (!Array.isArray(value) || value.length > 4096) {
    throw new ValidationError(`${name} are invalid`);
  }
  const seen = new Set();
  const validated = [];
  for (const item of value) {
    const valid = validator(item);
    if (seen.has(valid[key])) throw new ValidationError(`Duplicate ${key}: ${valid[key]}`);
    seen.add(valid[key]);
    validated.push(valid);
  }
  return validated;
}

function exactObject(value, name, keys) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new ValidationError(`${name} must be an object`);
  }
  const actual = Object.keys(value).sort().join(',');
  const expected = [...keys].sort().join(',');
  if (actual !== expected) throw new ValidationError(`${name} fields are invalid`);
}

function id(value) {
  return typeof value === 'string' && IDENTIFIER.test(value);
}

function text(value, minimum, maximum) {
  return typeof value === 'string'
    && value.trim().length >= minimum
    && value.length <= maximum
    && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value);
}

function stringArray(value, minimum, maximum, allowed) {
  return Array.isArray(value)
    && value.length >= minimum
    && value.length <= maximum
    && value.every(item => typeof item === 'string' && item.length > 0 && (!allowed || allowed.has(item)))
    && new Set(value).size === value.length;
}

function basisPoints(value) {
  return Number.isSafeInteger(value) && value >= 0 && value <= 10_000;
}

function validDate(value, label) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.valueOf())) throw new ValidationError(`${label} is invalid`);
  return date;
}
