import { readFileSync } from 'node:fs';

import { digestObject, ValidationError } from '../../mesh/src/lib/canonical.mjs';
import { resolveCircleCharterAt } from '../axiom-circle-charter-lifecycle/index.mjs';
import { validateCircleHistoricalRuleBindingLedger } from '../axiom-circle-historical-rule-binding/index.mjs';
import { deriveCircleMembershipCredentialState } from '../axiom-circle-membership-credential-lifecycle/index.mjs';

const ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/;
const DIGEST = /^[a-f0-9]{64}$/;
const EVENT_KINDS = new Set([
  'membership-suspend',
  'membership-revoke',
  'membership-exit',
  'role-narrow'
]);
const TERMINAL = new Set(['revoked', 'exited']);

const EXPECTED_REQUIREMENTS = Object.freeze({
  historical_membership_acceptance_required: true,
  exact_circle_membership_principal_binding: true,
  append_only_event_digest_chain: true,
  strict_event_chronology: true,
  future_events_prohibited: true,
  status_changes_are_monotonic_restrictions: true,
  membership_resume_supported: false,
  role_widening_supported: false,
  role_narrowing_only: true,
  role_narrowing_uses_charter_active_at_event: true,
  terminal_exit_binds_core_exit_record: true,
  current_core_snapshot_must_match_derived_head: true,
  historical_state_resolution_required: true,
  credential_lifecycle_bound_to_acceptance_identity: true,
  credential_eligibility_requires_active_membership: true,
  credential_eligibility_requires_active_credential: true,
  required_role_mode_checked_at_use_time: true,
  authenticated_principal_must_match_membership_principal: true,
  caller_authenticated_principal_is_external_assurance: true,
  eligibility_assessment_mints_runtime_authority: false,
  eligibility_assessment_mints_portable_authority: false,
  eligibility_assessment_mints_external_effect_authority: false
});
const EXPECTED_SCHEMAS = Object.freeze({
  lifecycle: 'axiom-circle-member-eligibility-lifecycle.v0',
  event: 'axiom-circle-member-eligibility-event.v0',
  resolved_state: 'axiom-circle-member-resolved-state.v0',
  credential_eligibility: 'axiom-circle-member-credential-eligibility.v0'
});
const EXPECTED_NON_CLAIMS = new Set([
  'human-identity',
  'legal-identity',
  'credential-possession',
  'credential-issuance-authority',
  'role-grant-authority',
  'membership-resume-authority',
  'governance-legitimacy',
  'coercion-free-participation',
  'trusted-wall-clock',
  'runtime-authority',
  'portable-authority',
  'external-effect-authority'
]);

const policyUrl = new URL('../../mesh/config/circle-member-eligibility-lifecycle.v0.json', import.meta.url);
const CIRCLE_MEMBER_ELIGIBILITY_POLICY = deepFreeze(JSON.parse(readFileSync(policyUrl, 'utf8')));
validateCircleMemberEligibilityPolicy(CIRCLE_MEMBER_ELIGIBILITY_POLICY);

export function getCircleMemberEligibilityPolicy() {
  return CIRCLE_MEMBER_ELIGIBILITY_POLICY;
}

export function validateCircleMemberEligibilityPolicy(policy) {
  exactObject(policy, 'Circle member eligibility policy', [
    'schema', 'version', 'status', 'runtime_activation', 'authority_effect', 'network_effect',
    'requirements', 'event_kinds', 'schemas', 'output', 'non_claims'
  ]);
  if (
    policy.schema !== 'axiom-circle-member-eligibility-policy.v0'
    || policy.version !== 0
    || policy.status !== 'inert-member-eligibility-history'
    || policy.runtime_activation !== false
    || policy.authority_effect !== 'none'
    || policy.network_effect !== 'none'
  ) throw new ValidationError('Circle member eligibility activation boundary is invalid');

  exactObject(policy.requirements, 'Circle member eligibility requirements', Object.keys(EXPECTED_REQUIREMENTS));
  for (const [key, expected] of Object.entries(EXPECTED_REQUIREMENTS)) {
    if (policy.requirements[key] !== expected) {
      throw new ValidationError(`Circle member eligibility requirement ${key} was weakened`);
    }
  }
  exactSet(policy.event_kinds, EVENT_KINDS, 'Circle member eligibility event kinds');
  exactObject(policy.schemas, 'Circle member eligibility schemas', Object.keys(EXPECTED_SCHEMAS));
  for (const [key, expected] of Object.entries(EXPECTED_SCHEMAS)) {
    if (policy.schemas[key] !== expected) throw new ValidationError(`Circle member eligibility schema ${key} drifted`);
  }
  exactObject(policy.output, 'Circle member eligibility output', [
    'policy_digest_required',
    'historical_ledger_digest_required',
    'membership_lifecycle_digest_required',
    'credential_lifecycle_digest_required_for_credential_use',
    'current_state_is_local_derivation',
    'runtime_authority',
    'portable_authority',
    'external_effect_authority',
    'authority_effect',
    'network_effect'
  ]);
  if (
    policy.output.policy_digest_required !== true
    || policy.output.historical_ledger_digest_required !== true
    || policy.output.membership_lifecycle_digest_required !== true
    || policy.output.credential_lifecycle_digest_required_for_credential_use !== true
    || policy.output.current_state_is_local_derivation !== true
    || policy.output.runtime_authority !== false
    || policy.output.portable_authority !== false
    || policy.output.external_effect_authority !== false
    || policy.output.authority_effect !== 'none'
    || policy.output.network_effect !== 'none'
  ) throw new ValidationError('Circle member eligibility output boundary is invalid');
  exactSet(policy.non_claims, EXPECTED_NON_CLAIMS, 'Circle member eligibility non-claims');
  return true;
}

export function validateCircleMembershipStateLifecycle({
  policy = CIRCLE_MEMBER_ELIGIBILITY_POLICY,
  charterPolicy,
  historicalBindingPolicy,
  circlePackage,
  charterLifecycle,
  historicalLedger,
  lifecycle,
  now = new Date()
}) {
  validateCircleMemberEligibilityPolicy(policy);
  const historicalValidation = validateCircleHistoricalRuleBindingLedger(
    historicalBindingPolicy,
    charterPolicy,
    circlePackage,
    charterLifecycle,
    historicalLedger,
    { now }
  );
  const nowMs = validDate(now, 'Circle member eligibility validation time').valueOf();
  exactObject(lifecycle, 'Circle member eligibility lifecycle', [
    'schema', 'circle_id', 'membership_id', 'principal_id', 'acceptance_binding_id', 'events',
    'authority_effect', 'network_effect', 'runtime_activation'
  ]);
  if (
    lifecycle.schema !== policy.schemas.lifecycle
    || lifecycle.circle_id !== circlePackage.circle.circle_id
    || !identifier(lifecycle.membership_id)
    || !identifier(lifecycle.principal_id)
    || !identifier(lifecycle.acceptance_binding_id)
    || lifecycle.authority_effect !== 'none'
    || lifecycle.network_effect !== 'none'
    || lifecycle.runtime_activation !== false
  ) throw new ValidationError('Circle member eligibility lifecycle boundary is invalid');
  if (!Array.isArray(lifecycle.events) || lifecycle.events.length > 4096) {
    throw new ValidationError('Circle member eligibility events are invalid');
  }

  const acceptanceIndex = historicalLedger.bindings.findIndex(
    binding => binding.binding_id === lifecycle.acceptance_binding_id
  );
  if (acceptanceIndex < 0) throw new ValidationError('Circle member eligibility acceptance binding is not retained');
  const acceptanceBinding = historicalLedger.bindings[acceptanceIndex];
  if (acceptanceBinding.record_type !== 'membership') {
    throw new ValidationError('Circle member eligibility acceptance binding is not a membership');
  }
  const acceptance = acceptanceBinding.record;
  if (
    acceptance.circle_id !== lifecycle.circle_id
    || acceptance.membership_id !== lifecycle.membership_id
    || acceptance.principal_id !== lifecycle.principal_id
    || acceptance.status !== 'active'
    || acceptance.status_effective_at !== acceptance.accepted_at
  ) throw new ValidationError('Circle member eligibility identity does not match retained acceptance');

  const current = circlePackage.memberships.find(item => item.membership_id === lifecycle.membership_id);
  if (!current || !sameMembershipIdentity(current, acceptance)) {
    throw new ValidationError('Circle current membership identity does not match retained acceptance');
  }

  let state = {
    status: 'active',
    role_ids: [...acceptance.role_ids],
    status_effective_at: acceptance.accepted_at
  };
  const seenIds = new Set();
  let previous = null;
  let previousMs = Date.parse(acceptance.accepted_at);
  let terminalSeen = false;

  for (const event of lifecycle.events) {
    validateEventEnvelope(policy, event, lifecycle);
    if (seenIds.has(event.event_id)) throw new ValidationError(`Duplicate Circle member eligibility event: ${event.event_id}`);
    seenIds.add(event.event_id);
    const eventMs = Date.parse(event.at);
    if (eventMs <= previousMs) throw new ValidationError('Circle member eligibility event times must strictly increase');
    if (eventMs > nowMs) throw new ValidationError('Circle member eligibility event cannot be in the future');
    const expectedPrevious = previous === null ? null : digestObject(previous);
    if (event.previous_event_digest !== expectedPrevious) {
      throw new ValidationError('Circle member eligibility event digest chain is invalid');
    }
    if (terminalSeen) throw new ValidationError('Circle member eligibility terminal state is irreversible');

    if (event.kind === 'role-narrow') {
      if (event.core_exit_id !== null || !Array.isArray(event.role_ids)) {
        throw new ValidationError('Circle role narrowing event fields are invalid');
      }
      validateRoleNarrow(event.role_ids, state.role_ids);
      const resolved = resolveCircleCharterAt(charterPolicy, circlePackage, charterLifecycle, {
        at: event.at,
        now
      });
      requireRolesExist(event.role_ids, resolved.charter.roles, 'Circle narrowed roles');
      state = { ...state, role_ids: [...event.role_ids] };
    } else if (event.kind === 'membership-suspend') {
      if (event.role_ids !== null || event.core_exit_id !== null || state.status !== 'active') {
        throw new ValidationError('Circle membership suspension transition is invalid');
      }
      state = { ...state, status: 'suspended', status_effective_at: event.at };
    } else if (event.kind === 'membership-revoke') {
      if (event.role_ids !== null || !identifier(event.core_exit_id) || !['active', 'suspended'].includes(state.status)) {
        throw new ValidationError('Circle membership revocation transition is invalid');
      }
      requireCoreExit(circlePackage, lifecycle, event, 'revocation');
      state = { ...state, status: 'revoked', status_effective_at: event.at };
      terminalSeen = true;
    } else if (event.kind === 'membership-exit') {
      if (event.role_ids !== null || !identifier(event.core_exit_id) || !['active', 'suspended'].includes(state.status)) {
        throw new ValidationError('Circle membership exit transition is invalid');
      }
      requireCoreExit(circlePackage, lifecycle, event, 'voluntary-exit');
      state = { ...state, status: 'exited', status_effective_at: event.at };
      terminalSeen = true;
    }

    previous = event;
    previousMs = eventMs;
  }

  reconcileCurrentSnapshot(circlePackage, current, lifecycle, state);

  return Object.freeze({
    valid: true,
    schema: lifecycle.schema,
    circle_id: lifecycle.circle_id,
    membership_id: lifecycle.membership_id,
    principal_id: lifecycle.principal_id,
    acceptance_binding_id: lifecycle.acceptance_binding_id,
    acceptance_binding_digest: digestObject(acceptanceBinding),
    event_count: lifecycle.events.length,
    head_event_digest: previous === null ? null : digestObject(previous),
    derived_status: state.status,
    derived_role_ids: Object.freeze([...state.role_ids]),
    derived_status_effective_at: state.status_effective_at,
    policy_digest: digestObject(policy),
    historical_ledger_digest: historicalValidation.ledger_digest,
    membership_lifecycle_digest: digestObject(lifecycle),
    current_state_is_local_derivation: true,
    runtime_authority: false,
    portable_authority: false,
    external_effect_authority: false,
    authority_effect: 'none',
    network_effect: 'none'
  });
}

export function resolveCircleMembershipStateAt(input, { at } = {}) {
  const validation = validateCircleMembershipStateLifecycle(input);
  const atIso = canonicalTimestamp(at, 'Circle member eligibility resolution time');
  const atMs = Date.parse(atIso);
  const nowMs = validDate(input.now ?? new Date(), 'Circle member eligibility validation time').valueOf();
  if (atMs > nowMs) throw new ValidationError('Circle member eligibility cannot resolve future state');
  const acceptanceBinding = input.historicalLedger.bindings.find(
    binding => binding.binding_id === input.lifecycle.acceptance_binding_id
  );
  const acceptance = acceptanceBinding.record;
  if (atMs < Date.parse(acceptance.accepted_at)) {
    throw new ValidationError('Circle member eligibility resolution predates membership acceptance');
  }

  let status = 'active';
  let roles = [...acceptance.role_ids];
  let statusEffectiveAt = acceptance.accepted_at;
  for (const event of input.lifecycle.events) {
    if (Date.parse(event.at) > atMs) break;
    if (event.kind === 'role-narrow') roles = [...event.role_ids];
    else if (event.kind === 'membership-suspend') {
      status = 'suspended';
      statusEffectiveAt = event.at;
    } else if (event.kind === 'membership-revoke') {
      status = 'revoked';
      statusEffectiveAt = event.at;
    } else if (event.kind === 'membership-exit') {
      status = 'exited';
      statusEffectiveAt = event.at;
    }
  }
  return Object.freeze({
    schema: input.policy?.schemas?.resolved_state ?? CIRCLE_MEMBER_ELIGIBILITY_POLICY.schemas.resolved_state,
    circle_id: input.lifecycle.circle_id,
    membership_id: input.lifecycle.membership_id,
    principal_id: input.lifecycle.principal_id,
    resolved_at: atIso,
    status,
    role_ids: Object.freeze(roles),
    status_effective_at: statusEffectiveAt,
    membership_active: status === 'active',
    policy_digest: validation.policy_digest,
    historical_ledger_digest: validation.historical_ledger_digest,
    membership_lifecycle_digest: validation.membership_lifecycle_digest,
    current_state_is_local_derivation: true,
    runtime_authority: false,
    portable_authority: false,
    external_effect_authority: false,
    authority_effect: 'none',
    network_effect: 'none'
  });
}

export function assessCircleMemberCredentialEligibility({
  policy = CIRCLE_MEMBER_ELIGIBILITY_POLICY,
  charterPolicy,
  historicalBindingPolicy,
  credentialPolicy,
  circlePackage,
  charterLifecycle,
  historicalLedger,
  membershipLifecycle,
  credentialLifecycle,
  authenticatedPrincipal,
  credentialId,
  asOf,
  requiredMode = null,
  now = new Date()
}) {
  const principal = requiredId(authenticatedPrincipal, 'Circle member authenticated principal');
  const credential = requiredId(credentialId, 'Circle member credential id');
  const asOfIso = canonicalTimestamp(asOf, 'Circle member credential eligibility as_of');
  if (Date.parse(asOfIso) > validDate(now, 'Circle member credential eligibility validation time').valueOf()) {
    throw new ValidationError('Circle member credential eligibility cannot project into the future');
  }
  if (!(requiredMode === null || typeof requiredMode === 'string')) {
    throw new ValidationError('Circle member required role mode is invalid');
  }

  const state = resolveCircleMembershipStateAt({
    policy,
    charterPolicy,
    historicalBindingPolicy,
    circlePackage,
    charterLifecycle,
    historicalLedger,
    lifecycle: membershipLifecycle,
    now
  }, { at: asOfIso });
  if (principal !== state.principal_id) {
    throw new ValidationError('Circle authenticated principal does not match membership principal');
  }
  if (!state.membership_active) {
    throw new ValidationError('Circle membership is not active at credential use time');
  }

  const resolvedCharter = resolveCircleCharterAt(charterPolicy, circlePackage, charterLifecycle, {
    at: asOfIso,
    now
  });
  if (requiredMode !== null) {
    const modeRoles = new Set(
      resolvedCharter.charter.roles
        .filter(role => role.declared_modes.includes(requiredMode))
        .map(role => role.role_id)
    );
    if (!state.role_ids.some(roleId => modeRoles.has(roleId))) {
      throw new ValidationError(`Circle membership lacks required ${requiredMode} mode at credential use time`);
    }
  }

  if (
    credentialLifecycle.circle_id !== state.circle_id
    || credentialLifecycle.membership_id !== state.membership_id
    || credentialLifecycle.principal_id !== state.principal_id
  ) throw new ValidationError('Circle credential lifecycle does not match member eligibility identity');

  const acceptanceBinding = historicalLedger.bindings.find(
    binding => binding.binding_id === membershipLifecycle.acceptance_binding_id
  );
  const compatibilityPackage = projectAcceptancePackage(circlePackage, acceptanceBinding.record);
  const credentialState = deriveCircleMembershipCredentialState(
    credentialPolicy,
    compatibilityPackage,
    credentialLifecycle,
    { asOf: asOfIso, now }
  );
  const selected = credentialState.credentials.find(item => item.credential_id === credential);
  if (!selected || selected.authentication_eligible !== true || selected.status !== 'active') {
    throw new ValidationError('Circle member credential is not authentication-eligible at use time');
  }

  const assessment = deepFreeze({
    schema: policy.schemas.credential_eligibility,
    status: 'inert-credential-eligibility-candidate',
    circle_id: state.circle_id,
    membership_id: state.membership_id,
    principal_id: state.principal_id,
    credential_id: credential,
    device_id: selected.device_id,
    as_of: asOfIso,
    required_mode: requiredMode,
    membership_status: state.status,
    role_ids: [...state.role_ids],
    credential_status: selected.status,
    credential_eligible: true,
    authenticated_principal_binding_checked: true,
    credential_possession_verified: false,
    caller_authentication_assurance_external: true,
    policy_digest: digestObject(policy),
    membership_lifecycle_digest: digestObject(membershipLifecycle),
    credential_lifecycle_digest: credentialState.lifecycle_digest,
    historical_ledger_digest: state.historical_ledger_digest,
    governing_charter_digest: resolvedCharter.charter_digest,
    current_state_is_local_derivation: true,
    runtime_authority: false,
    portable_authority: false,
    external_effect_authority: false,
    authority_effect: 'none',
    network_effect: 'none'
  });
  return Object.freeze({ assessment, assessment_digest: digestObject(assessment) });
}

function validateEventEnvelope(policy, event, lifecycle) {
  exactObject(event, 'Circle member eligibility event', [
    'schema', 'event_id', 'circle_id', 'membership_id', 'principal_id', 'kind', 'at',
    'previous_event_digest', 'role_ids', 'core_exit_id', 'authority_effect', 'network_effect'
  ]);
  if (
    event.schema !== policy.schemas.event
    || !identifier(event.event_id)
    || event.circle_id !== lifecycle.circle_id
    || event.membership_id !== lifecycle.membership_id
    || event.principal_id !== lifecycle.principal_id
    || !EVENT_KINDS.has(event.kind)
    || !(event.previous_event_digest === null || DIGEST.test(event.previous_event_digest))
    || event.authority_effect !== 'none'
    || event.network_effect !== 'none'
  ) throw new ValidationError('Circle member eligibility event envelope is invalid');
  canonicalTimestamp(event.at, 'Circle member eligibility event time');
}

function validateRoleNarrow(nextRoles, currentRoles) {
  if (!Array.isArray(nextRoles) || nextRoles.length > 64 || new Set(nextRoles).size !== nextRoles.length) {
    throw new ValidationError('Circle narrowed role set is invalid');
  }
  for (const roleId of nextRoles) {
    if (!identifier(roleId) || !currentRoles.includes(roleId)) {
      throw new ValidationError('Circle role narrowing cannot add or substitute roles');
    }
  }
  if (sameSet(nextRoles, currentRoles)) throw new ValidationError('Circle role narrowing must remove at least one role');
}

function requireRolesExist(roleIds, charterRoles, label) {
  const known = new Set(charterRoles.map(role => role.role_id));
  if (roleIds.some(roleId => !known.has(roleId))) throw new ValidationError(`${label} are not declared by active charter`);
}

function requireCoreExit(circlePackage, lifecycle, event, kind) {
  const exits = circlePackage.exits.filter(exit => exit.membership_id === lifecycle.membership_id);
  const match = exits.find(exit => exit.exit_id === event.core_exit_id);
  if (
    exits.length !== 1
    || !match
    || match.circle_id !== lifecycle.circle_id
    || match.principal_id !== lifecycle.principal_id
    || match.kind !== kind
    || match.effective_at !== event.at
  ) throw new ValidationError('Circle terminal eligibility event does not exactly bind Core exit record');
}

function reconcileCurrentSnapshot(circlePackage, current, lifecycle, state) {
  const exits = circlePackage.exits.filter(exit => exit.membership_id === lifecycle.membership_id);
  if (
    current.status !== state.status
    || current.status_effective_at !== state.status_effective_at
    || !sameSet(current.role_ids, state.role_ids)
  ) throw new ValidationError('Circle current membership snapshot does not match derived eligibility head');
  if (TERMINAL.has(state.status)) {
    if (exits.length !== 1) throw new ValidationError('Circle terminal membership requires exactly one Core exit record');
  } else if (exits.length !== 0) {
    throw new ValidationError('Circle non-terminal membership cannot carry Core exit history');
  }
}

function projectAcceptancePackage(circlePackage, acceptance) {
  const projected = structuredClone(circlePackage);
  projected.memberships = projected.memberships.map(item => item.membership_id === acceptance.membership_id
    ? structuredClone(acceptance)
    : item);
  projected.exits = projected.exits.filter(exit => exit.membership_id !== acceptance.membership_id);
  return projected;
}

function sameMembershipIdentity(current, acceptance) {
  return current.membership_id === acceptance.membership_id
    && current.circle_id === acceptance.circle_id
    && current.invitation_id === acceptance.invitation_id
    && current.principal_id === acceptance.principal_id
    && current.accepted_at === acceptance.accepted_at;
}

function sameSet(left, right) {
  return Array.isArray(left)
    && Array.isArray(right)
    && left.length === right.length
    && new Set(left).size === left.length
    && new Set(right).size === right.length
    && left.every(value => right.includes(value));
}

function exactSet(values, expected, label) {
  if (!Array.isArray(values)) throw new ValidationError(`${label} must be an array`);
  const actual = new Set(values);
  if (actual.size !== expected.size || values.length !== expected.size || [...expected].some(value => !actual.has(value))) {
    throw new ValidationError(`${label} inventory drifted`);
  }
}

function exactObject(value, label, keys) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new ValidationError(`${label} must be an object`);
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    throw new ValidationError(`${label} fields are invalid`);
  }
}

function identifier(value) {
  return typeof value === 'string' && ID.test(value);
}

function requiredId(value, label) {
  if (!identifier(value)) throw new ValidationError(`${label} is invalid`);
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

function validDate(value, label) {
  const date = value instanceof Date ? new Date(value.valueOf()) : new Date(value);
  if (Number.isNaN(date.valueOf())) throw new ValidationError(`${label} is invalid`);
  return date;
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}
