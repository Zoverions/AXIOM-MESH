import { readFileSync } from 'node:fs';

import { digestObject, ValidationError } from '../../mesh/src/lib/canonical.mjs';
import {
  validateCircleMembershipStateLifecycle
} from '../axiom-circle-member-eligibility/index.mjs';
import {
  validateCircleMembershipCredentialLifecycle
} from '../axiom-circle-membership-credential-lifecycle/index.mjs';

const ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/;
const DIGEST = /^[a-f0-9]{64}$/;

const EXPECTED_REQUIREMENTS = Object.freeze({
  validated_membership_lifecycle_required: true,
  validated_credential_lifecycle_required: true,
  credential_lifecycle_validated_against_retained_acceptance_identity: true,
  exact_circle_membership_principal_binding: true,
  historical_ledger_digest_bound: true,
  membership_lifecycle_digest_bound: true,
  credential_lifecycle_digest_bound: true,
  membership_event_head_digest_bound: true,
  credential_event_head_digest_bound: true,
  previous_grid_lifecycle_head_required_after_genesis: true,
  grid_lifecycle_head_compare_and_set: true,
  non_genesis_head_must_change_lifecycle_state: true,
  deterministic_event_id_from_lifecycle_head_digest: true,
  exact_replay_may_be_idempotent: true,
  conflicting_reuse_rejected: true,
  signed_grid_chain_reused: true,
  projection_reconstructed_from_signed_grid_events: true,
  generic_malformed_lifecycle_head_append_rejected: true,
  lifecycle_head_record_is_authorization_proof: false,
  credential_possession_proved: false,
  runtime_authority: false,
  portable_authority: false,
  external_effect_authority: false,
  public_grid_route: false,
  gateway_route: false,
  hypervisor_runtime_route: false
});

const EXPECTED_NON_CLAIMS = new Set([
  'human-identity',
  'legal-identity',
  'credential-possession',
  'credential-issuance-authority',
  'membership-resume-authority',
  'role-grant-authority',
  'governance-legitimacy',
  'coercion-free-participation',
  'trusted-wall-clock',
  'runtime-authorization',
  'portable-authority',
  'external-effect-authority',
  'distributed-consensus'
]);

const PAYLOAD_KEYS = Object.freeze([
  'schema', 'circle_id', 'membership_id', 'principal_id', 'acceptance_binding_id',
  'historical_ledger_digest', 'membership_lifecycle_digest', 'credential_lifecycle_digest',
  'membership_event_head_digest', 'credential_event_head_digest',
  'member_eligibility_policy_digest', 'credential_policy_digest',
  'previous_grid_lifecycle_head_digest', 'runtime_authority', 'portable_authority',
  'external_effect_authority', 'authority_effect', 'network_effect'
]);

const policyUrl = new URL('../../mesh/config/circle-lifecycle-grid-head.v0.json', import.meta.url);
const CIRCLE_LIFECYCLE_GRID_HEAD_POLICY = deepFreeze(JSON.parse(readFileSync(policyUrl, 'utf8')));
validateCircleLifecycleGridHeadPolicy(CIRCLE_LIFECYCLE_GRID_HEAD_POLICY);

export function getCircleLifecycleGridHeadPolicy() {
  return CIRCLE_LIFECYCLE_GRID_HEAD_POLICY;
}

export function validateCircleLifecycleGridHeadPolicy(policy) {
  exactObject(policy, 'Circle lifecycle Grid-head policy', [
    'schema', 'version', 'status', 'runtime_activation', 'authority_effect', 'network_effect',
    'grid_event_kind', 'event_id_prefix', 'requirements', 'payload_schema', 'candidate_schema',
    'non_claims'
  ]);
  if (
    policy.schema !== 'axiom-circle-lifecycle-grid-head-policy.v0'
    || policy.version !== 0
    || policy.status !== 'inert-grid-backed-lifecycle-head'
    || policy.runtime_activation !== false
    || policy.authority_effect !== 'none'
    || policy.network_effect !== 'none'
    || policy.grid_event_kind !== 'circle.member.lifecycle.head.recorded'
    || policy.event_id_prefix !== 'circle_lifecycle_head_'
    || policy.payload_schema !== 'axiom-circle-member-lifecycle-grid-head.v0'
    || policy.candidate_schema !== 'axiom-circle-member-lifecycle-grid-head-candidate.v0'
  ) throw new ValidationError('Circle lifecycle Grid-head activation boundary is invalid');
  exactObject(policy.requirements, 'Circle lifecycle Grid-head requirements', Object.keys(EXPECTED_REQUIREMENTS));
  for (const [key, expected] of Object.entries(EXPECTED_REQUIREMENTS)) {
    if (policy.requirements[key] !== expected) {
      throw new ValidationError(`Circle lifecycle Grid-head requirement ${key} was weakened`);
    }
  }
  exactSet(policy.non_claims, EXPECTED_NON_CLAIMS, 'Circle lifecycle Grid-head non-claims');
  return true;
}

export function buildCircleMemberLifecycleGridHeadCandidate({
  policy = CIRCLE_LIFECYCLE_GRID_HEAD_POLICY,
  memberEligibilityPolicy,
  credentialPolicy,
  charterPolicy,
  historicalBindingPolicy,
  circlePackage,
  charterLifecycle,
  historicalLedger,
  membershipLifecycle,
  credentialLifecycle,
  previousGridLifecycleHeadDigest = null,
  now = new Date()
}) {
  validateCircleLifecycleGridHeadPolicy(policy);
  if (!memberEligibilityPolicy || !credentialPolicy || !charterPolicy || !historicalBindingPolicy) {
    throw new ValidationError('Circle lifecycle Grid-head source policies are required');
  }
  const membershipValidation = validateCircleMembershipStateLifecycle({
    policy: memberEligibilityPolicy,
    charterPolicy,
    historicalBindingPolicy,
    circlePackage,
    charterLifecycle,
    historicalLedger,
    lifecycle: membershipLifecycle,
    now
  });

  const acceptancePackage = projectRetainedAcceptancePackage(
    circlePackage,
    historicalLedger,
    membershipLifecycle
  );
  validateCircleMembershipCredentialLifecycle(
    credentialPolicy,
    acceptancePackage,
    credentialLifecycle,
    { now }
  );

  if (
    credentialLifecycle.circle_id !== membershipLifecycle.circle_id
    || credentialLifecycle.membership_id !== membershipLifecycle.membership_id
    || credentialLifecycle.principal_id !== membershipLifecycle.principal_id
  ) throw new ValidationError('Circle membership and credential lifecycle identities do not match');
  if (!(previousGridLifecycleHeadDigest === null || DIGEST.test(previousGridLifecycleHeadDigest))) {
    throw new ValidationError('Circle previous Grid lifecycle head digest is invalid');
  }

  const membershipEventHead = membershipLifecycle.events.length === 0
    ? null
    : digestObject(membershipLifecycle.events.at(-1));
  const credentialEventHead = credentialLifecycle.events.length === 0
    ? null
    : digestObject(credentialLifecycle.events.at(-1));

  const payload = deepFreeze({
    schema: policy.payload_schema,
    circle_id: membershipLifecycle.circle_id,
    membership_id: membershipLifecycle.membership_id,
    principal_id: membershipLifecycle.principal_id,
    acceptance_binding_id: membershipLifecycle.acceptance_binding_id,
    historical_ledger_digest: membershipValidation.historical_ledger_digest,
    membership_lifecycle_digest: digestObject(membershipLifecycle),
    credential_lifecycle_digest: digestObject(credentialLifecycle),
    membership_event_head_digest: membershipEventHead,
    credential_event_head_digest: credentialEventHead,
    member_eligibility_policy_digest: digestObject(memberEligibilityPolicy),
    credential_policy_digest: digestObject(credentialPolicy),
    previous_grid_lifecycle_head_digest: previousGridLifecycleHeadDigest,
    runtime_authority: false,
    portable_authority: false,
    external_effect_authority: false,
    authority_effect: 'none',
    network_effect: 'none'
  });
  return buildCandidateFromPayload(policy, payload);
}

export function reconstructCircleMemberLifecycleGridHeadCandidate(
  rawEvent,
  policy = CIRCLE_LIFECYCLE_GRID_HEAD_POLICY
) {
  validateCircleLifecycleGridHeadPolicy(policy);
  exactObject(rawEvent, 'Circle lifecycle Grid-head event', ['event_id', 'kind', 'subject', 'payload']);
  if (rawEvent.kind !== policy.grid_event_kind) {
    throw new ValidationError('Circle lifecycle Grid-head event kind is invalid');
  }
  const payload = validateLifecycleHeadPayload(rawEvent.payload, policy);
  const candidate = buildCandidateFromPayload(policy, payload);
  if (
    rawEvent.event_id !== candidate.event.event_id
    || rawEvent.subject !== candidate.event.subject
    || digestObject(rawEvent.payload) !== candidate.payload_digest
  ) throw new ValidationError('Circle lifecycle Grid-head event identity is invalid');
  return candidate;
}

export function validateCircleMemberLifecycleGridHeadPayload(
  payload,
  policy = CIRCLE_LIFECYCLE_GRID_HEAD_POLICY
) {
  return validateLifecycleHeadPayload(payload, policy);
}

function projectRetainedAcceptancePackage(circlePackage, historicalLedger, membershipLifecycle) {
  const binding = historicalLedger?.bindings?.find(
    item => item.binding_id === membershipLifecycle.acceptance_binding_id
  );
  if (!binding || binding.record_type !== 'membership') {
    throw new ValidationError('Circle lifecycle Grid-head retained acceptance binding is unavailable');
  }
  const acceptance = binding.record;
  if (
    acceptance.circle_id !== membershipLifecycle.circle_id
    || acceptance.membership_id !== membershipLifecycle.membership_id
    || acceptance.principal_id !== membershipLifecycle.principal_id
    || acceptance.status !== 'active'
    || acceptance.status_effective_at !== acceptance.accepted_at
  ) throw new ValidationError('Circle lifecycle Grid-head retained acceptance identity is invalid');

  const projected = structuredClone(circlePackage);
  projected.memberships = projected.memberships.map(item =>
    item.membership_id === acceptance.membership_id ? structuredClone(acceptance) : item
  );
  projected.exits = projected.exits.filter(exit => exit.membership_id !== acceptance.membership_id);
  return projected;
}

function buildCandidateFromPayload(policy, rawPayload) {
  const payload = validateLifecycleHeadPayload(rawPayload, policy);
  const payloadDigest = digestObject(payload);
  const lifecycleHeadDigest = payloadDigest;
  const eventId = `${policy.event_id_prefix}${digestObject({
    schema: 'axiom-circle-member-lifecycle-grid-head-event-id.v0',
    circle_id: payload.circle_id,
    membership_id: payload.membership_id,
    lifecycle_head_digest: lifecycleHeadDigest
  })}`;
  const candidate = {
    schema: policy.candidate_schema,
    circle_id: payload.circle_id,
    membership_id: payload.membership_id,
    principal_id: payload.principal_id,
    previous_grid_lifecycle_head_digest: payload.previous_grid_lifecycle_head_digest,
    resulting_grid_lifecycle_head_digest: lifecycleHeadDigest,
    membership_lifecycle_digest: payload.membership_lifecycle_digest,
    credential_lifecycle_digest: payload.credential_lifecycle_digest,
    event: {
      event_id: eventId,
      kind: policy.grid_event_kind,
      subject: payload.circle_id,
      payload
    },
    payload_digest: payloadDigest,
    policy_digest: digestObject(policy),
    runtime_authority: false,
    portable_authority: false,
    external_effect_authority: false,
    authority_effect: 'none',
    network_effect: 'none'
  };
  return deepFreeze(candidate);
}

function validateLifecycleHeadPayload(rawPayload, policy) {
  validateCircleLifecycleGridHeadPolicy(policy);
  exactObject(rawPayload, 'Circle lifecycle Grid-head payload', PAYLOAD_KEYS);
  const payload = structuredClone(rawPayload);
  if (
    payload.schema !== policy.payload_schema
    || !identifier(payload.circle_id)
    || !identifier(payload.membership_id)
    || !identifier(payload.principal_id)
    || !identifier(payload.acceptance_binding_id)
    || !DIGEST.test(payload.historical_ledger_digest ?? '')
    || !DIGEST.test(payload.membership_lifecycle_digest ?? '')
    || !DIGEST.test(payload.credential_lifecycle_digest ?? '')
    || !nullableDigest(payload.membership_event_head_digest)
    || !nullableDigest(payload.credential_event_head_digest)
    || !DIGEST.test(payload.member_eligibility_policy_digest ?? '')
    || !DIGEST.test(payload.credential_policy_digest ?? '')
    || !nullableDigest(payload.previous_grid_lifecycle_head_digest)
    || payload.runtime_authority !== false
    || payload.portable_authority !== false
    || payload.external_effect_authority !== false
    || payload.authority_effect !== 'none'
    || payload.network_effect !== 'none'
  ) throw new ValidationError('Circle lifecycle Grid-head payload boundary is invalid');
  return deepFreeze(payload);
}

function nullableDigest(value) {
  return value === null || (typeof value === 'string' && DIGEST.test(value));
}

function identifier(value) {
  return typeof value === 'string' && ID.test(value);
}

function exactSet(values, expected, label) {
  if (!Array.isArray(values)) throw new ValidationError(`${label} must be an array`);
  const actual = new Set(values);
  if (values.length !== expected.size || actual.size !== expected.size || [...expected].some(value => !actual.has(value))) {
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
