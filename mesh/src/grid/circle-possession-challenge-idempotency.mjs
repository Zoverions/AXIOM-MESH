import { readFileSync } from 'node:fs';

import { AxiomError, ValidationError, digestObject, sha256 } from '../lib/canonical.mjs';
import { verifyCapability } from '../lib/identity.mjs';
import { getCirclePossessionBoundAtomicAdmissionPolicy } from './circle-possession-bound-atomic-admission.mjs';

const ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/;
const DIGEST = /^[a-f0-9]{64}$/;
const COMPARED_CONSTRAINT_KEYS = Object.freeze([
  'circle_id',
  'event_id',
  'binding_digest',
  'expected_prior_circle_head_digest',
  'resulting_circle_head_digest',
  'payload_digest',
  'record_authorization_assessment_digest',
  'eligibility_evidence_digest',
  'parent_lifecycle_cas_invocation_digest',
  'lifecycle_guard_set_digest',
  'lifecycle_guard_count',
  'possession_request_digest',
  'required_credential_count',
  'atomic_lifecycle_cas',
  'admission_scope'
]);

const EXPECTED_REQUIREMENTS = Object.freeze({
  challenge_single_use_required_for_v0_state_safety: false,
  challenge_reuse_scope: 'same-exact-prepared-request-only',
  challenge_and_attestation_freshness_still_required: true,
  possession_request_digest_exact_match_required: true,
  circle_event_id_deterministic_and_content_bound: true,
  circle_event_payload_digest_bound: true,
  lifecycle_guard_set_digest_bound: true,
  possession_attestation_set_digest_bound_per_capability: true,
  same_request_reissue_may_change_capability_bytes: true,
  same_request_reissue_may_not_change_target_event: true,
  first_successful_grid_admission_is_single_state_transition: true,
  later_different_capability_replay_of_retained_event_rejected: true,
  uncommitted_earlier_grant_does_not_block_later_same_request_grant: true,
  cross_request_challenge_reuse_rejected: true,
  cross_lifecycle_head_challenge_reuse_rejected: true,
  cross_credential_challenge_reuse_rejected: true,
  non_deterministic_effects_may_inherit_policy: false,
  external_effects_may_inherit_policy: false,
  generic_capabilities_may_inherit_policy: false,
  durable_challenge_consumption_required: false,
  runtime_authority: false,
  portable_authority: false,
  external_effect_authority: false,
  public_route: false
});
const EXPECTED_NON_CLAIMS = new Set([
  'global-replay-protection',
  'challenge-single-use',
  'cross-request-replay-safety',
  'non-deterministic-effect-idempotency',
  'external-effect-idempotency',
  'human-identity',
  'legal-identity',
  'authorized-human-custody',
  'lifecycle-mutation-authority',
  'governance-legitimacy',
  'trusted-global-time',
  'runtime-authority',
  'portable-authority',
  'external-effect-authority',
  'distributed-consensus'
]);

const policyUrl = new URL('../../config/circle-possession-challenge-idempotency.v0.json', import.meta.url);
const POLICY = deepFreeze(JSON.parse(readFileSync(policyUrl, 'utf8')));
validateCirclePossessionChallengeIdempotencyPolicy(POLICY);

export function getCirclePossessionChallengeIdempotencyPolicy() {
  return POLICY;
}

export function validateCirclePossessionChallengeIdempotencyPolicy(policy) {
  exactObject(policy, 'Circle possession challenge idempotency policy', [
    'schema', 'version', 'status', 'runtime_activation', 'authority_effect', 'network_effect',
    'strategy', 'requirements', 'assessment_schema', 'non_claims'
  ]);
  if (
    policy.schema !== 'axiom-circle-possession-challenge-idempotency-policy.v0'
    || policy.version !== 0
    || policy.status !== 'inert-exact-request-replay-idempotency'
    || policy.runtime_activation !== false
    || policy.authority_effect !== 'none'
    || policy.network_effect !== 'none'
    || policy.strategy !== 'exact-request-effect-idempotency'
    || policy.assessment_schema !== 'axiom-circle-possession-challenge-idempotency-assessment.v0'
  ) throw new ValidationError('Circle possession challenge idempotency activation boundary is invalid');
  exactObject(policy.requirements, 'Circle possession challenge idempotency requirements', Object.keys(EXPECTED_REQUIREMENTS));
  for (const [key, expected] of Object.entries(EXPECTED_REQUIREMENTS)) {
    if (policy.requirements[key] !== expected) {
      throw new ValidationError(`Circle possession challenge idempotency requirement ${key} drifted`);
    }
  }
  exactSet(policy.non_claims, EXPECTED_NON_CLAIMS, 'Circle possession challenge idempotency non-claims');
  return true;
}

export function assessCirclePossessionBoundGrantReissue({
  firstCapability,
  secondCapability,
  hypervisorPublicKey,
  nowSeconds = Math.floor(Date.now() / 1000),
  maxTtlSeconds = 60
}) {
  validateCirclePossessionChallengeIdempotencyPolicy(POLICY);
  if (!hypervisorPublicKey) throw new ValidationError('Trusted Hypervisor public key is required for Circle challenge reissue assessment');
  if (!Number.isSafeInteger(nowSeconds)) throw new ValidationError('Circle challenge reissue assessment time is invalid');
  if (!Number.isSafeInteger(maxTtlSeconds) || maxTtlSeconds < 1 || maxTtlSeconds > 60) {
    throw new ValidationError('Circle challenge reissue assessment TTL bound is invalid');
  }
  const parent = getCirclePossessionBoundAtomicAdmissionPolicy();
  const first = verifyCapability(firstCapability, hypervisorPublicKey, {
    audience: parent.audience,
    issuer: parent.issuer_service,
    nowSeconds,
    maxTtlSeconds
  });
  const second = verifyCapability(secondCapability, hypervisorPublicKey, {
    audience: parent.audience,
    issuer: parent.issuer_service,
    nowSeconds,
    maxTtlSeconds
  });
  validateGrantClaims(first, parent, 'first');
  validateGrantClaims(second, parent, 'second');

  for (const key of COMPARED_CONSTRAINT_KEYS) {
    if (first.constraints[key] !== second.constraints[key]) {
      throw new AxiomError(
        'circle_challenge_reuse_scope_mismatch',
        `Circle possession challenge reuse changed exact prepared admission constraint ${key}`,
        409,
        {
          constraint: key,
          first: first.constraints[key],
          second: second.constraints[key]
        }
      );
    }
  }
  if (
    first.subject !== second.subject
    || first.tool !== second.tool
    || first.intent_digest !== second.intent_digest
    || first.plan_digest !== second.plan_digest
    || first.policy_digest !== second.policy_digest
  ) {
    throw new AxiomError(
      'circle_challenge_reuse_scope_mismatch',
      'Circle possession challenge reuse crossed an admission requester or upstream request boundary',
      409
    );
  }

  const sameCapabilityBytes = String(firstCapability) === String(secondCapability);
  const assessment = deepFreeze({
    schema: POLICY.assessment_schema,
    strategy: POLICY.strategy,
    circle_id: first.constraints.circle_id,
    actor: first.subject,
    event_id: first.constraints.event_id,
    payload_digest: first.constraints.payload_digest,
    possession_request_digest: first.constraints.possession_request_digest,
    lifecycle_guard_set_digest: first.constraints.lifecycle_guard_set_digest,
    required_credential_count: first.constraints.required_credential_count,
    first_capability_digest: sha256(String(firstCapability)),
    second_capability_digest: sha256(String(secondCapability)),
    same_capability_bytes: sameCapabilityBytes,
    same_exact_prepared_request: true,
    deterministic_target_event: true,
    first_successful_commit_is_single_state_transition: true,
    retained_event_same_capability_replay: 'idempotent-historical-replay',
    retained_event_different_capability_replay: 'reject-trace-mismatch',
    uncommitted_first_grant_blocks_second_same_request_grant: false,
    durable_challenge_consumption_required_for_v0_state_safety: false,
    policy_digest: digestObject(POLICY),
    parent_admission_policy_digest: digestObject(parent),
    runtime_authority: false,
    portable_authority: false,
    external_effect_authority: false,
    authority_effect: 'none',
    network_effect: 'none'
  });
  validateCirclePossessionChallengeIdempotencyAssessment(assessment);
  return assessment;
}

export function validateCirclePossessionChallengeIdempotencyAssessment(value) {
  exactObject(value, 'Circle possession challenge idempotency assessment', [
    'schema', 'strategy', 'circle_id', 'actor', 'event_id', 'payload_digest',
    'possession_request_digest', 'lifecycle_guard_set_digest', 'required_credential_count',
    'first_capability_digest', 'second_capability_digest', 'same_capability_bytes',
    'same_exact_prepared_request', 'deterministic_target_event',
    'first_successful_commit_is_single_state_transition',
    'retained_event_same_capability_replay', 'retained_event_different_capability_replay',
    'uncommitted_first_grant_blocks_second_same_request_grant',
    'durable_challenge_consumption_required_for_v0_state_safety',
    'policy_digest', 'parent_admission_policy_digest', 'runtime_authority',
    'portable_authority', 'external_effect_authority', 'authority_effect', 'network_effect'
  ]);
  if (
    value.schema !== POLICY.assessment_schema
    || value.strategy !== POLICY.strategy
    || !ID.test(value.circle_id ?? '')
    || !ID.test(value.actor ?? '')
    || !ID.test(value.event_id ?? '')
    || !DIGEST.test(value.payload_digest ?? '')
    || !DIGEST.test(value.possession_request_digest ?? '')
    || !DIGEST.test(value.lifecycle_guard_set_digest ?? '')
    || !Number.isSafeInteger(value.required_credential_count)
    || value.required_credential_count < 0
    || !DIGEST.test(value.first_capability_digest ?? '')
    || !DIGEST.test(value.second_capability_digest ?? '')
    || typeof value.same_capability_bytes !== 'boolean'
    || value.same_exact_prepared_request !== true
    || value.deterministic_target_event !== true
    || value.first_successful_commit_is_single_state_transition !== true
    || value.retained_event_same_capability_replay !== 'idempotent-historical-replay'
    || value.retained_event_different_capability_replay !== 'reject-trace-mismatch'
    || value.uncommitted_first_grant_blocks_second_same_request_grant !== false
    || value.durable_challenge_consumption_required_for_v0_state_safety !== false
    || value.policy_digest !== digestObject(POLICY)
    || value.parent_admission_policy_digest !== digestObject(getCirclePossessionBoundAtomicAdmissionPolicy())
    || value.runtime_authority !== false
    || value.portable_authority !== false
    || value.external_effect_authority !== false
    || value.authority_effect !== 'none'
    || value.network_effect !== 'none'
  ) throw new ValidationError('Circle possession challenge idempotency assessment boundary is invalid');
  return true;
}

function validateGrantClaims(claims, parent, label) {
  if (!claims || typeof claims !== 'object' || Array.isArray(claims)) {
    throw new ValidationError(`Circle challenge reissue ${label} grant claims are invalid`);
  }
  if (
    claims.tool !== parent.tool
    || !ID.test(claims.subject ?? '')
    || !DIGEST.test(claims.intent_digest ?? '')
    || !DIGEST.test(claims.plan_digest ?? '')
    || !DIGEST.test(claims.policy_digest ?? '')
    || !claims.constraints
    || typeof claims.constraints !== 'object'
    || Array.isArray(claims.constraints)
    || claims.constraints.schema !== parent.schemas.constraints
    || !ID.test(claims.constraints.circle_id ?? '')
    || !ID.test(claims.constraints.event_id ?? '')
    || !DIGEST.test(claims.constraints.payload_digest ?? '')
    || !DIGEST.test(claims.constraints.possession_request_digest ?? '')
    || !DIGEST.test(claims.constraints.lifecycle_guard_set_digest ?? '')
    || !Number.isSafeInteger(claims.constraints.required_credential_count)
    || claims.constraints.required_credential_count < 0
    || claims.constraints.atomic_lifecycle_cas !== true
    || claims.constraints.runtime_authority !== false
    || claims.constraints.portable_authority !== false
    || claims.constraints.external_effect_authority !== false
  ) throw new ValidationError(`Circle challenge reissue ${label} grant boundary is invalid`);
  return true;
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
