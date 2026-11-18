import { digestObject, ValidationError } from '../../mesh/src/lib/canonical.mjs';
import {
  CIRCLE_DECISION_SCHEMA,
  CIRCLE_INVITATION_SCHEMA,
  CIRCLE_MEMBERSHIP_SCHEMA,
  CIRCLE_PROPOSAL_SCHEMA
} from '../../mesh/src/lib/circle-core.mjs';
import {
  resolveCircleCharterAt,
  validateCircleCharterLifecycle
} from '../axiom-circle-charter-lifecycle/index.mjs';

const ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/;
const DIGEST = /^[a-f0-9]{64}$/;
const ASCII_CONTROL = /[\u0000-\u001f\u007f]/;
const RECORD_TYPES = new Set(['invitation', 'membership', 'proposal', 'decision']);
const MEMBERSHIP_CLASSES = new Set(['member', 'guardian', 'contractor', 'employee', 'observer']);
const DECISION_OUTCOMES = new Set(['accepted', 'rejected', 'no-quorum', 'withdrawn']);
const DECISION_FINALITY = new Set(['circle-local-provisional', 'circle-local-accepted']);

const EXPECTED_REQUIREMENTS = Object.freeze({
  exact_circle_binding: true,
  canonical_record_digest_required: true,
  append_only_binding_digest_chain: true,
  strict_binding_chronology: true,
  future_binding_prohibited: true,
  record_is_event_snapshot_not_live_mutable_projection: true,
  invitation_uses_charter_active_at_issue: true,
  membership_requires_active_acceptance_snapshot: true,
  membership_requires_invitation_basis: true,
  membership_rejects_stale_invitation_after_amendment: true,
  membership_roles_must_match_invitation: true,
  proposal_requires_open_creation_snapshot: true,
  proposal_freezes_charter_active_at_creation: true,
  decision_requires_proposal_basis: true,
  decision_inherits_proposal_frozen_charter: true,
  mid_proposal_charter_change_cannot_change_decision_rules: true,
  historical_record_may_mint_runtime_authority: false,
  historical_record_rewritten: false
});

const EXPECTED_MODES = Object.freeze({
  invitation: 'resolve-at-event',
  membership: 'invitation-current-at-acceptance',
  proposal: 'resolve-at-event-and-freeze',
  decision: 'inherit-proposal-frozen-charter'
});

const EXPECTED_SCHEMAS = Object.freeze({
  ledger: 'axiom-circle-historical-rule-binding-ledger.v0',
  binding: 'axiom-circle-historical-rule-binding.v0'
});

export function validateCircleHistoricalRuleBindingPolicy(policy) {
  exactObject(policy, 'Circle historical rule binding policy', [
    'schema',
    'version',
    'status',
    'runtime_activation',
    'authority_effect',
    'network_effect',
    'requirements',
    'record_types',
    'binding_modes',
    'schemas',
    'output'
  ]);
  if (
    policy.schema !== 'axiom-circle-historical-rule-binding-policy.v0'
    || policy.version !== 0
    || policy.status !== 'inert-historical-rule-binding'
    || policy.runtime_activation !== false
    || policy.authority_effect !== 'none'
    || policy.network_effect !== 'none'
  ) throw new ValidationError('Circle historical rule binding activation boundary is invalid');

  exactObject(policy.requirements, 'Circle historical rule binding requirements', Object.keys(EXPECTED_REQUIREMENTS));
  if (JSON.stringify(policy.requirements) !== JSON.stringify(EXPECTED_REQUIREMENTS)) {
    throw new ValidationError('Circle historical rule binding requirement was weakened');
  }
  exactSet(policy.record_types, RECORD_TYPES, 'Circle historical record types');
  exactObject(policy.binding_modes, 'Circle historical binding modes', Object.keys(EXPECTED_MODES));
  if (JSON.stringify(policy.binding_modes) !== JSON.stringify(EXPECTED_MODES)) {
    throw new ValidationError('Circle historical binding mode inventory drifted');
  }
  exactObject(policy.schemas, 'Circle historical binding schema inventory', Object.keys(EXPECTED_SCHEMAS));
  if (JSON.stringify(policy.schemas) !== JSON.stringify(EXPECTED_SCHEMAS)) {
    throw new ValidationError('Circle historical binding schema inventory drifted');
  }

  exactObject(policy.output, 'Circle historical rule binding output', [
    'policy_digest_required',
    'charter_policy_digest_required',
    'circle_package_digest_required',
    'charter_lifecycle_digest_required',
    'ledger_digest_required',
    'runtime_authority',
    'portable_authority',
    'authority_effect',
    'network_effect'
  ]);
  if (
    policy.output.policy_digest_required !== true
    || policy.output.charter_policy_digest_required !== true
    || policy.output.circle_package_digest_required !== true
    || policy.output.charter_lifecycle_digest_required !== true
    || policy.output.ledger_digest_required !== true
    || policy.output.runtime_authority !== false
    || policy.output.portable_authority !== false
    || policy.output.authority_effect !== 'none'
    || policy.output.network_effect !== 'none'
  ) throw new ValidationError('Circle historical rule binding output boundary is invalid');
  return true;
}

export function validateCircleHistoricalRuleBindingLedger(
  policy,
  charterPolicy,
  circlePackage,
  charterLifecycle,
  ledger,
  { now = new Date() } = {}
) {
  validateCircleHistoricalRuleBindingPolicy(policy);
  const charterValidation = validateCircleCharterLifecycle(
    charterPolicy,
    circlePackage,
    charterLifecycle,
    { now }
  );

  exactObject(ledger, 'Circle historical rule binding ledger', [
    'schema',
    'circle_id',
    'bindings',
    'authority_effect',
    'network_effect',
    'runtime_activation'
  ]);
  if (
    ledger.schema !== policy.schemas.ledger
    || ledger.circle_id !== circlePackage.circle.circle_id
    || ledger.circle_id !== charterLifecycle.circle_id
    || ledger.authority_effect !== 'none'
    || ledger.network_effect !== 'none'
    || ledger.runtime_activation !== false
  ) throw new ValidationError('Circle historical rule binding ledger boundary is invalid');
  if (!Array.isArray(ledger.bindings) || ledger.bindings.length < 1 || ledger.bindings.length > 4096) {
    throw new ValidationError('Circle historical rule bindings are invalid');
  }

  const nowMs = validDate(now, 'Circle historical rule binding validation time').valueOf();
  const bindingById = new Map();
  const seenRecordKeys = new Set();
  const seenRecordDigests = new Set();
  let previousBinding = null;
  let previousBoundAt = null;
  const counts = { invitation: 0, membership: 0, proposal: 0, decision: 0 };

  for (const binding of ledger.bindings) {
    validateBindingEnvelope(policy, ledger, binding);
    if (bindingById.has(binding.binding_id)) {
      throw new ValidationError(`Duplicate Circle historical binding: ${binding.binding_id}`);
    }
    const expectedPrevious = previousBinding === null ? null : digestObject(previousBinding);
    if (binding.previous_binding_digest !== expectedPrevious) {
      throw new ValidationError('Circle historical binding digest chain is invalid');
    }

    const eventMs = timestampMs(binding.event_time, 'Circle historical binding event_time');
    const boundMs = timestampMs(binding.bound_at, 'Circle historical binding bound_at');
    if (boundMs < eventMs) {
      throw new ValidationError('Circle historical binding cannot predate its event');
    }
    if (boundMs > nowMs || eventMs > nowMs) {
      throw new ValidationError('Circle historical binding cannot contain future event or binding time');
    }
    if (previousBoundAt !== null && boundMs <= previousBoundAt) {
      throw new ValidationError('Circle historical binding times must strictly increase');
    }

    const computedRecordDigest = digestObject(binding.record);
    if (computedRecordDigest !== binding.record_digest) {
      throw new ValidationError('Circle historical record digest does not match record');
    }
    if (seenRecordDigests.has(computedRecordDigest)) {
      throw new ValidationError('Circle historical ledger cannot reuse a record digest');
    }
    seenRecordDigests.add(computedRecordDigest);

    const recordKey = `${binding.record_type}:${binding.record_id}`;
    if (seenRecordKeys.has(recordKey)) {
      throw new ValidationError(`Duplicate Circle historical record identity: ${recordKey}`);
    }
    seenRecordKeys.add(recordKey);

    validateHistoricalRecordBinding({
      policy,
      charterPolicy,
      circlePackage,
      charterLifecycle,
      binding,
      bindingById,
      now
    });

    bindingById.set(binding.binding_id, binding);
    counts[binding.record_type] += 1;
    previousBinding = binding;
    previousBoundAt = boundMs;
  }

  return Object.freeze({
    valid: true,
    schema: ledger.schema,
    circle_id: ledger.circle_id,
    binding_count: ledger.bindings.length,
    counts: Object.freeze({ ...counts }),
    head_binding_digest: digestObject(previousBinding),
    policy_digest: digestObject(policy),
    charter_policy_digest: digestObject(charterPolicy),
    circle_package_digest: charterValidation.circle_package_digest,
    charter_lifecycle_digest: charterValidation.lifecycle_digest,
    ledger_digest: digestObject(ledger),
    runtime_activation: false,
    runtime_authority: false,
    portable_authority: false,
    authority_effect: 'none',
    network_effect: 'none'
  });
}

function validateBindingEnvelope(policy, ledger, binding) {
  exactObject(binding, 'Circle historical rule binding', [
    'schema',
    'binding_id',
    'circle_id',
    'record_type',
    'record_id',
    'record_digest',
    'record',
    'event_time',
    'bound_at',
    'previous_binding_digest',
    'basis_binding_id',
    'binding_mode',
    'governing_charter_digest',
    'authority_effect',
    'network_effect',
    'runtime_activation'
  ]);
  if (
    binding.schema !== policy.schemas.binding
    || !identifier(binding.binding_id)
    || binding.circle_id !== ledger.circle_id
    || !RECORD_TYPES.has(binding.record_type)
    || !identifier(binding.record_id)
    || !DIGEST.test(binding.record_digest)
    || !(binding.previous_binding_digest === null || DIGEST.test(binding.previous_binding_digest))
    || !(binding.basis_binding_id === null || identifier(binding.basis_binding_id))
    || binding.binding_mode !== policy.binding_modes[binding.record_type]
    || !DIGEST.test(binding.governing_charter_digest)
    || binding.authority_effect !== 'none'
    || binding.network_effect !== 'none'
    || binding.runtime_activation !== false
  ) throw new ValidationError('Circle historical rule binding envelope is invalid');
}

function validateHistoricalRecordBinding({
  charterPolicy,
  circlePackage,
  charterLifecycle,
  binding,
  bindingById,
  now
}) {
  if (binding.record_type === 'invitation') {
    if (binding.basis_binding_id !== null) {
      throw new ValidationError('Circle historical invitation binding cannot have a basis binding');
    }
    const record = validateInvitationSnapshot(binding.record, binding.circle_id);
    requireRecordIdentity(binding, record.invitation_id);
    requireEventTime(binding, record.issued_at);
    const resolved = resolveCircleCharterAt(charterPolicy, circlePackage, charterLifecycle, {
      at: record.issued_at,
      now
    });
    if (
      record.charter_digest !== resolved.charter_digest
      || binding.governing_charter_digest !== resolved.charter_digest
    ) throw new ValidationError('Circle historical invitation is not bound to the charter active at issue');
    requireRolesExist(record.role_ids, resolved.charter.roles, 'Circle historical invitation roles');
    return;
  }

  if (binding.record_type === 'membership') {
    const record = validateMembershipAcceptanceSnapshot(binding.record, binding.circle_id);
    requireRecordIdentity(binding, record.membership_id);
    requireEventTime(binding, record.accepted_at);
    const basis = requireBasisBinding(binding, bindingById, 'invitation');
    const invitation = validateInvitationSnapshot(basis.record, binding.circle_id);
    if (
      record.invitation_id !== invitation.invitation_id
      || record.principal_id !== invitation.invited_principal
      || !sameSet(record.role_ids, invitation.role_ids)
    ) throw new ValidationError('Circle historical membership does not match its invitation basis');
    const acceptedMs = Date.parse(record.accepted_at);
    if (
      acceptedMs < Date.parse(invitation.issued_at)
      || acceptedMs > Date.parse(invitation.expires_at)
    ) throw new ValidationError('Circle historical membership acceptance is outside invitation validity');
    const resolved = resolveCircleCharterAt(charterPolicy, circlePackage, charterLifecycle, {
      at: record.accepted_at,
      now
    });
    if (
      invitation.charter_digest !== resolved.charter_digest
      || basis.governing_charter_digest !== resolved.charter_digest
      || binding.governing_charter_digest !== resolved.charter_digest
    ) throw new ValidationError('Circle historical membership rejects an invitation made stale by charter amendment');
    requireRolesExist(record.role_ids, resolved.charter.roles, 'Circle historical membership roles');
    return;
  }

  if (binding.record_type === 'proposal') {
    if (binding.basis_binding_id !== null) {
      throw new ValidationError('Circle historical proposal binding cannot have a basis binding');
    }
    const record = validateProposalCreationSnapshot(binding.record, binding.circle_id);
    requireRecordIdentity(binding, record.proposal_id);
    requireEventTime(binding, record.created_at);
    const resolved = resolveCircleCharterAt(charterPolicy, circlePackage, charterLifecycle, {
      at: record.created_at,
      now
    });
    if (
      record.charter_digest !== resolved.charter_digest
      || binding.governing_charter_digest !== resolved.charter_digest
    ) throw new ValidationError('Circle historical proposal is not bound to the charter active at creation');
    return;
  }

  const record = validateDecisionSnapshot(binding.record, binding.circle_id);
  requireRecordIdentity(binding, record.decision_id);
  requireEventTime(binding, record.decided_at);
  const basis = requireBasisBinding(binding, bindingById, 'proposal');
  const proposal = validateProposalCreationSnapshot(basis.record, binding.circle_id);
  if (record.proposal_id !== proposal.proposal_id) {
    throw new ValidationError('Circle historical decision does not match its proposal basis');
  }
  if (Date.parse(record.decided_at) < Date.parse(proposal.created_at)) {
    throw new ValidationError('Circle historical decision predates its proposal');
  }
  if (
    record.charter_digest !== proposal.charter_digest
    || record.charter_digest !== basis.governing_charter_digest
    || binding.governing_charter_digest !== basis.governing_charter_digest
  ) throw new ValidationError('Circle historical decision must inherit the proposal frozen charter');
}

function validateInvitationSnapshot(record, circleId) {
  exactObject(record, 'Circle historical invitation snapshot', [
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
    record.schema !== CIRCLE_INVITATION_SCHEMA
    || !identifier(record.invitation_id)
    || record.circle_id !== circleId
    || !identifier(record.invited_principal)
    || !MEMBERSHIP_CLASSES.has(record.membership_class)
    || !identifier(record.issued_by)
    || !DIGEST.test(record.charter_digest)
    || record.one_use !== true
    || record.authority_effect !== 'none'
  ) throw new ValidationError('Circle historical invitation snapshot is invalid');
  idArray(record.role_ids, 'Circle historical invitation role_ids', 16);
  const issued = timestampMs(record.issued_at, 'Circle historical invitation issued_at');
  const expires = timestampMs(record.expires_at, 'Circle historical invitation expires_at');
  if (expires <= issued) throw new ValidationError('Circle historical invitation expiry must follow issuance');
  return record;
}

function validateMembershipAcceptanceSnapshot(record, circleId) {
  exactObject(record, 'Circle historical membership acceptance snapshot', [
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
  if (
    record.schema !== CIRCLE_MEMBERSHIP_SCHEMA
    || !identifier(record.membership_id)
    || record.circle_id !== circleId
    || !identifier(record.invitation_id)
    || !identifier(record.principal_id)
    || record.status !== 'active'
    || record.member_state_ownership !== 'independent-node'
    || record.disclosure_profile !== 'selective'
    || record.authority_effect !== 'none'
    || record.network_effect !== 'none'
  ) throw new ValidationError('Circle historical membership acceptance snapshot is invalid');
  idArray(record.role_ids, 'Circle historical membership role_ids', 16);
  canonicalTimestamp(record.accepted_at, 'Circle historical membership accepted_at');
  canonicalTimestamp(record.status_effective_at, 'Circle historical membership status_effective_at');
  if (record.status_effective_at !== record.accepted_at) {
    throw new ValidationError('Circle historical membership acceptance status must become effective at acceptance');
  }
  return record;
}

function validateProposalCreationSnapshot(record, circleId) {
  exactObject(record, 'Circle historical proposal creation snapshot', [
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
    record.schema !== CIRCLE_PROPOSAL_SCHEMA
    || !identifier(record.proposal_id)
    || record.circle_id !== circleId
    || !DIGEST.test(record.charter_digest)
    || !identifier(record.proposer)
    || !boundedText(record.title, 1, 200)
    || !boundedText(record.summary, 1, 4000)
    || record.status !== 'open'
    || record.execution_effect !== 'none'
    || record.authority_effect !== 'none'
  ) throw new ValidationError('Circle historical proposal creation snapshot is invalid');
  referenceArray(record.evidence_refs, 'Circle historical proposal evidence_refs', 512);
  const created = timestampMs(record.created_at, 'Circle historical proposal created_at');
  const closes = timestampMs(record.closes_at, 'Circle historical proposal closes_at');
  if (closes <= created) throw new ValidationError('Circle historical proposal close must follow creation');
  return record;
}

function validateDecisionSnapshot(record, circleId) {
  exactObject(record, 'Circle historical decision snapshot', [
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
    record.schema !== CIRCLE_DECISION_SCHEMA
    || !identifier(record.decision_id)
    || record.circle_id !== circleId
    || !identifier(record.proposal_id)
    || !DIGEST.test(record.charter_digest)
    || !DECISION_OUTCOMES.has(record.outcome)
    || !DECISION_FINALITY.has(record.finality)
    || record.runtime_authority !== false
    || record.authority_effect !== 'none'
  ) throw new ValidationError('Circle historical decision snapshot is invalid');
  canonicalTimestamp(record.decided_at, 'Circle historical decision decided_at');
  referenceArray(record.participant_receipts, 'Circle historical decision participant_receipts', 512);
  return record;
}

function requireBasisBinding(binding, bindingById, expectedType) {
  if (binding.basis_binding_id === null) {
    throw new ValidationError(`Circle historical ${binding.record_type} binding requires a basis binding`);
  }
  const basis = bindingById.get(binding.basis_binding_id);
  if (!basis || basis.record_type !== expectedType) {
    throw new ValidationError(`Circle historical ${binding.record_type} basis binding is invalid`);
  }
  return basis;
}

function requireRecordIdentity(binding, recordId) {
  if (binding.record_id !== recordId) {
    throw new ValidationError('Circle historical binding record identity does not match record');
  }
}

function requireEventTime(binding, expected) {
  canonicalTimestamp(expected, 'Circle historical record event timestamp');
  if (binding.event_time !== expected) {
    throw new ValidationError('Circle historical binding event_time does not match record event');
  }
}

function requireRolesExist(roleIds, roles, label) {
  const allowed = new Set(roles.map(role => role.role_id));
  if (roleIds.some(roleId => !allowed.has(roleId))) {
    throw new ValidationError(`${label} are not present in governing charter`);
  }
}

function idArray(value, label, maxItems) {
  if (!Array.isArray(value) || value.length > maxItems) {
    throw new ValidationError(`${label} are invalid`);
  }
  const seen = new Set();
  for (const item of value) {
    if (!identifier(item) || seen.has(item)) throw new ValidationError(`${label} are invalid`);
    seen.add(item);
  }
}

function referenceArray(value, label, maxItems) {
  if (!Array.isArray(value) || value.length > maxItems) {
    throw new ValidationError(`${label} are invalid`);
  }
  const seen = new Set();
  for (const ref of value) {
    if (
      typeof ref !== 'string'
      || ref.length < 1
      || ref.length > 512
      || ASCII_CONTROL.test(ref)
      || ref !== ref.trim()
      || seen.has(ref)
    ) throw new ValidationError(`${label} are invalid`);
    seen.add(ref);
  }
}

function sameSet(left, right) {
  if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) return false;
  const values = new Set(left);
  return values.size === left.length && right.every(value => values.has(value));
}

function boundedText(value, min, max) {
  return typeof value === 'string' && value.length >= min && value.length <= max && !ASCII_CONTROL.test(value);
}

function identifier(value) {
  return typeof value === 'string' && ID.test(value);
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

function canonicalTimestamp(value, label) {
  if (typeof value !== 'string') throw new ValidationError(`${label} is invalid`);
  const parsed = new Date(value);
  if (Number.isNaN(parsed.valueOf()) || parsed.toISOString() !== value) {
    throw new ValidationError(`${label} must be canonical UTC`);
  }
  return value;
}

function timestampMs(value, label) {
  return Date.parse(canonicalTimestamp(value, label));
}

function validDate(value, label) {
  const date = value instanceof Date ? new Date(value.valueOf()) : new Date(value);
  if (Number.isNaN(date.valueOf())) throw new ValidationError(`${label} is invalid`);
  return date;
}
