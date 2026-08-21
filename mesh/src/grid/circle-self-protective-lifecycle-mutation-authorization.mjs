import { readFileSync } from 'node:fs';

import { AxiomError, ValidationError, digestObject } from '../lib/canonical.mjs';
import { normalizeCircleLifecycleHeadSnapshot } from './circle-admission-lifecycle-guards.mjs';
import { verifyCircleCredentialPossessionAttestation } from './circle-credential-possession-attestation.mjs';
import {
  buildCircleMemberLifecycleGridHeadCandidate,
  getCircleLifecycleGridHeadPolicy
} from '../../../packages/axiom-circle-lifecycle-grid-head/index.mjs';

const ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/;
const DIGEST = /^[a-f0-9]{64}$/;
const MEMBERSHIP_KINDS = new Set(['role-narrow', 'membership-suspend', 'membership-exit']);
const CREDENTIAL_KINDS = new Set(['credential-suspend', 'credential-revoke', 'device-compromise']);
const EXPECTED_REQUIREMENTS = Object.freeze({
  self_service_only: true,
  authenticated_principal_exact_membership_principal: true,
  current_grid_lifecycle_head_required: true,
  proposed_candidate_previous_head_exact_current_head: true,
  proposed_candidate_identity_exact_current_head: true,
  proposed_candidate_must_advance_head: true,
  exactly_one_append_only_mutation: true,
  membership_mutation_appends_one_membership_event_only: true,
  membership_mutation_leaves_credential_lifecycle_unchanged: true,
  credential_mutation_appends_one_credential_event_only: true,
  credential_mutation_leaves_membership_lifecycle_unchanged: true,
  credential_mutation_leaves_device_credential_and_recovery_records_unchanged: true,
  fresh_pre_mutation_credential_possession_attestation_required: true,
  possession_attestation_exact_current_lifecycle_head_required: true,
  possession_attestation_exact_pre_mutation_credential_lifecycle_required: true,
  possession_request_binds_current_and_proposed_heads: true,
  possession_request_binds_exact_mutation: true,
  authorizing_credential_same_membership_principal: true,
  authorizing_credential_may_be_mutation_target: true,
  role_widening_supported: false,
  membership_resume_supported: false,
  membership_revoke_self_service_supported: false,
  credential_resume_supported: false,
  credential_issuance_supported: false,
  credential_rotation_supported: false,
  recovery_admission_supported: false,
  administrative_or_third_party_mutation_supported: false,
  mutation_authorization_is_execution_authority: false,
  grid_commit_performed: false,
  runtime_authority: false,
  portable_authority: false,
  external_effect_authority: false,
  public_route: false
});
const EXPECTED_SCHEMAS = Object.freeze({
  request: 'axiom-circle-self-protective-lifecycle-mutation-request.v0',
  assessment: 'axiom-circle-self-protective-lifecycle-mutation-authorization.v0'
});
const EXPECTED_NON_CLAIMS = new Set([
  'human-identity',
  'legal-identity',
  'authorized-human-custody',
  'credential-issuance-authority',
  'credential-rotation-authority',
  'credential-resume-authority',
  'membership-resume-authority',
  'membership-revocation-authority',
  'role-grant-authority',
  'recovery-admission-authority',
  'administrative-authority',
  'governance-legitimacy',
  'coercion-free-participation',
  'trusted-global-time',
  'grid-commit-authority',
  'runtime-authority',
  'portable-authority',
  'external-effect-authority',
  'distributed-consensus'
]);

const policyUrl = new URL('../../config/circle-self-protective-lifecycle-mutation-authorization.v0.json', import.meta.url);
const POLICY = deepFreeze(JSON.parse(readFileSync(policyUrl, 'utf8')));
validateCircleSelfProtectiveLifecycleMutationAuthorizationPolicy(POLICY);

export function getCircleSelfProtectiveLifecycleMutationAuthorizationPolicy() {
  return POLICY;
}

export function validateCircleSelfProtectiveLifecycleMutationAuthorizationPolicy(policy) {
  exactObject(policy, 'Circle self-protective lifecycle mutation policy', [
    'schema', 'version', 'status', 'runtime_activation', 'authority_effect', 'network_effect',
    'mutation_kinds', 'requirements', 'schemas', 'non_claims'
  ]);
  if (
    policy.schema !== 'axiom-circle-self-protective-lifecycle-mutation-authorization-policy.v0'
    || policy.version !== 0
    || policy.status !== 'inert-self-protective-lifecycle-mutation-authorization'
    || policy.runtime_activation !== false
    || policy.authority_effect !== 'none'
    || policy.network_effect !== 'none'
  ) throw new ValidationError('Circle self-protective lifecycle mutation activation boundary is invalid');
  exactObject(policy.mutation_kinds, 'Circle self-protective mutation kinds', ['membership', 'credential']);
  exactSet(policy.mutation_kinds.membership, MEMBERSHIP_KINDS, 'Circle self-protective membership mutation kinds');
  exactSet(policy.mutation_kinds.credential, CREDENTIAL_KINDS, 'Circle self-protective credential mutation kinds');
  exactObject(policy.requirements, 'Circle self-protective mutation requirements', Object.keys(EXPECTED_REQUIREMENTS));
  for (const [key, expected] of Object.entries(EXPECTED_REQUIREMENTS)) {
    if (policy.requirements[key] !== expected) {
      throw new ValidationError(`Circle self-protective lifecycle mutation requirement ${key} drifted`);
    }
  }
  exactObject(policy.schemas, 'Circle self-protective mutation schemas', Object.keys(EXPECTED_SCHEMAS));
  for (const [key, expected] of Object.entries(EXPECTED_SCHEMAS)) {
    if (policy.schemas[key] !== expected) throw new ValidationError(`Circle self-protective mutation schema ${key} drifted`);
  }
  exactSet(policy.non_claims, EXPECTED_NON_CLAIMS, 'Circle self-protective mutation non-claims');
  return true;
}

export function prepareCircleSelfProtectiveLifecycleMutation(input) {
  validateCircleSelfProtectiveLifecycleMutationAuthorizationPolicy(POLICY);
  const prepared = prepareMutation(input);
  return deepFreeze({
    schema: 'axiom-circle-self-protective-lifecycle-mutation-preparation.v0',
    request: prepared.request,
    request_digest: prepared.request_digest,
    mutation: prepared.mutation,
    current_lifecycle_head: prepared.current_head,
    proposed_candidate: prepared.proposed_candidate,
    grid_commit_performed: false,
    runtime_authority: false,
    portable_authority: false,
    external_effect_authority: false,
    authority_effect: 'none',
    network_effect: 'none'
  });
}

export function authorizeCircleSelfProtectiveLifecycleMutation({
  possessionAttestation,
  hypervisorPublicKey,
  possessionMaxAgeSeconds = 60,
  ...input
}) {
  const prepared = prepareMutation(input);
  if (!hypervisorPublicKey) throw new ValidationError('Trusted Hypervisor public key is required for Circle self-protective mutation authorization');
  const verified = verifyCircleCredentialPossessionAttestation(
    possessionAttestation,
    hypervisorPublicKey,
    {
      requestDigest: prepared.request_digest,
      lifecycleHeadDigest: prepared.current_head.lifecycle_head_digest,
      circleId: prepared.current_head.circle_id,
      membershipId: prepared.current_head.membership_id,
      principalId: prepared.current_head.principal_id,
      credentialId: prepared.authorizing_credential_id,
      nowSeconds: prepared.now_seconds,
      maxAgeSeconds: possessionMaxAgeSeconds
    }
  );
  if (verified.statement.credential_lifecycle_digest !== prepared.current_head.credential_lifecycle_digest) {
    throw new AxiomError(
      'circle_self_protective_pre_mutation_credential_lifecycle_mismatch',
      'Circle self-protective possession evidence is not bound to the exact pre-mutation credential lifecycle',
      409
    );
  }
  const assessment = deepFreeze({
    schema: POLICY.schemas.assessment,
    policy_digest: digestObject(POLICY),
    parent_lifecycle_grid_head_policy_digest: digestObject(getCircleLifecycleGridHeadPolicy()),
    request_digest: prepared.request_digest,
    circle_id: prepared.current_head.circle_id,
    membership_id: prepared.current_head.membership_id,
    principal_id: prepared.current_head.principal_id,
    authorizing_credential_id: prepared.authorizing_credential_id,
    mutation_domain: prepared.mutation.domain,
    mutation_kind: prepared.mutation.kind,
    mutation_target_type: prepared.mutation.target_type,
    mutation_target_id: prepared.mutation.target_id,
    mutation_event_digest: prepared.mutation.event_digest,
    current_lifecycle_head_digest: prepared.current_head.lifecycle_head_digest,
    proposed_lifecycle_head_digest: prepared.proposed_candidate.resulting_grid_lifecycle_head_digest,
    pre_membership_lifecycle_digest: digestObject(input.preMembershipLifecycle),
    pre_credential_lifecycle_digest: digestObject(input.preCredentialLifecycle),
    post_membership_lifecycle_digest: digestObject(input.postMembershipLifecycle),
    post_credential_lifecycle_digest: digestObject(input.postCredentialLifecycle),
    proposed_grid_event_id: prepared.proposed_candidate.event.event_id,
    proposed_grid_payload_digest: prepared.proposed_candidate.payload_digest,
    possession_attestation_digest: verified.attestation_digest,
    credential_possession_verified: true,
    self_service_principal_bound: true,
    self_protective_contraction_only: true,
    exactly_one_append_only_mutation: true,
    proposed_candidate_parent_validated: true,
    grid_current_head_read_during_authorization: true,
    grid_commit_performed: false,
    runtime_authority: false,
    portable_authority: false,
    external_effect_authority: false,
    authority_effect: 'none',
    network_effect: 'none'
  });
  validateCircleSelfProtectiveLifecycleMutationAuthorization(assessment);
  return assessment;
}

export function validateCircleSelfProtectiveLifecycleMutationAuthorization(value) {
  exactObject(value, 'Circle self-protective lifecycle mutation authorization', [
    'schema', 'policy_digest', 'parent_lifecycle_grid_head_policy_digest', 'request_digest',
    'circle_id', 'membership_id', 'principal_id', 'authorizing_credential_id',
    'mutation_domain', 'mutation_kind', 'mutation_target_type', 'mutation_target_id',
    'mutation_event_digest', 'current_lifecycle_head_digest', 'proposed_lifecycle_head_digest',
    'pre_membership_lifecycle_digest', 'pre_credential_lifecycle_digest',
    'post_membership_lifecycle_digest', 'post_credential_lifecycle_digest',
    'proposed_grid_event_id', 'proposed_grid_payload_digest', 'possession_attestation_digest',
    'credential_possession_verified', 'self_service_principal_bound', 'self_protective_contraction_only',
    'exactly_one_append_only_mutation', 'proposed_candidate_parent_validated',
    'grid_current_head_read_during_authorization', 'grid_commit_performed',
    'runtime_authority', 'portable_authority', 'external_effect_authority',
    'authority_effect', 'network_effect'
  ]);
  if (
    value.schema !== POLICY.schemas.assessment
    || value.policy_digest !== digestObject(POLICY)
    || value.parent_lifecycle_grid_head_policy_digest !== digestObject(getCircleLifecycleGridHeadPolicy())
    || !DIGEST.test(value.request_digest ?? '')
    || !ID.test(value.circle_id ?? '')
    || !ID.test(value.membership_id ?? '')
    || !ID.test(value.principal_id ?? '')
    || !ID.test(value.authorizing_credential_id ?? '')
    || !['membership', 'credential'].includes(value.mutation_domain)
    || !(value.mutation_domain === 'membership' ? MEMBERSHIP_KINDS : CREDENTIAL_KINDS).has(value.mutation_kind)
    || !['membership', 'credential', 'device'].includes(value.mutation_target_type)
    || !ID.test(value.mutation_target_id ?? '')
    || !DIGEST.test(value.mutation_event_digest ?? '')
    || !DIGEST.test(value.current_lifecycle_head_digest ?? '')
    || !DIGEST.test(value.proposed_lifecycle_head_digest ?? '')
    || value.current_lifecycle_head_digest === value.proposed_lifecycle_head_digest
    || !DIGEST.test(value.pre_membership_lifecycle_digest ?? '')
    || !DIGEST.test(value.pre_credential_lifecycle_digest ?? '')
    || !DIGEST.test(value.post_membership_lifecycle_digest ?? '')
    || !DIGEST.test(value.post_credential_lifecycle_digest ?? '')
    || !ID.test(value.proposed_grid_event_id ?? '')
    || !DIGEST.test(value.proposed_grid_payload_digest ?? '')
    || !DIGEST.test(value.possession_attestation_digest ?? '')
    || value.credential_possession_verified !== true
    || value.self_service_principal_bound !== true
    || value.self_protective_contraction_only !== true
    || value.exactly_one_append_only_mutation !== true
    || value.proposed_candidate_parent_validated !== true
    || value.grid_current_head_read_during_authorization !== true
    || value.grid_commit_performed !== false
    || value.runtime_authority !== false
    || value.portable_authority !== false
    || value.external_effect_authority !== false
    || value.authority_effect !== 'none'
    || value.network_effect !== 'none'
  ) throw new ValidationError('Circle self-protective lifecycle mutation authorization boundary is invalid');
  if (value.mutation_domain === 'membership' && value.mutation_target_type !== 'membership') {
    throw new ValidationError('Circle self-protective membership mutation target must be the membership');
  }
  return true;
}

export function deriveCircleSelfProtectiveLifecycleMutationRequestDigest(input) {
  return prepareMutation(input).request_digest;
}

function prepareMutation({
  store,
  authenticatedPrincipal,
  authorizingCredentialId,
  memberEligibilityPolicy,
  credentialPolicy,
  charterPolicy,
  historicalBindingPolicy,
  circlePackage,
  charterLifecycle,
  historicalLedger,
  preMembershipLifecycle,
  preCredentialLifecycle,
  postMembershipLifecycle,
  postCredentialLifecycle,
  nowSeconds = Math.floor(Date.now() / 1000)
}) {
  validateCircleSelfProtectiveLifecycleMutationAuthorizationPolicy(POLICY);
  if (!store || typeof store.getCircleMemberLifecycleHead !== 'function') {
    throw new ValidationError('Circle self-protective mutation requires a Grid lifecycle-head reader');
  }
  if (!Number.isSafeInteger(nowSeconds)) throw new ValidationError('Circle self-protective mutation authorization time is invalid');
  const principal = requiredId(authenticatedPrincipal, 'Circle self-protective authenticated principal');
  const credential = requiredId(authorizingCredentialId, 'Circle self-protective authorizing credential');
  requireLifecycleObject(preMembershipLifecycle, 'pre-membership lifecycle');
  requireLifecycleObject(preCredentialLifecycle, 'pre-credential lifecycle');
  requireLifecycleObject(postMembershipLifecycle, 'post-membership lifecycle');
  requireLifecycleObject(postCredentialLifecycle, 'post-credential lifecycle');
  const circleId = requiredId(preMembershipLifecycle.circle_id, 'Circle self-protective circle_id');
  const membershipId = requiredId(preMembershipLifecycle.membership_id, 'Circle self-protective membership_id');
  const lifecyclePrincipal = requiredId(preMembershipLifecycle.principal_id, 'Circle self-protective lifecycle principal');
  if (principal !== lifecyclePrincipal) throw new ValidationError('Circle self-protective mutation is self-service only');
  requireSameLifecycleIdentity(preMembershipLifecycle, preCredentialLifecycle);
  requireSameLifecycleIdentity(preMembershipLifecycle, postMembershipLifecycle);
  requireSameLifecycleIdentity(preMembershipLifecycle, postCredentialLifecycle);

  const rawHead = store.getCircleMemberLifecycleHead(circleId, membershipId);
  if (!rawHead) throw new AxiomError('circle_self_protective_lifecycle_head_missing', 'Circle self-protective mutation requires a retained lifecycle head', 409);
  const currentHead = normalizeCircleLifecycleHeadSnapshot(rawHead);
  if (
    currentHead.circle_id !== circleId
    || currentHead.membership_id !== membershipId
    || currentHead.principal_id !== principal
  ) throw new ValidationError('Circle self-protective current Grid lifecycle head identity is invalid');
  if (
    currentHead.membership_lifecycle_digest !== digestObject(preMembershipLifecycle)
    || currentHead.credential_lifecycle_digest !== digestObject(preCredentialLifecycle)
  ) {
    throw new AxiomError(
      'circle_self_protective_pre_mutation_head_mismatch',
      'Circle self-protective pre-mutation lifecycle does not match the current Grid head',
      409
    );
  }

  const authorizingRecord = preCredentialLifecycle.credentials?.find(item => item.credential_id === credential);
  if (
    !authorizingRecord
    || authorizingRecord.circle_id !== circleId
    || authorizingRecord.membership_id !== membershipId
    || authorizingRecord.principal_id !== principal
  ) throw new ValidationError('Circle self-protective authorizing credential is not bound to this membership principal');

  const mutation = classifySingleMutation({
    membershipId,
    preMembershipLifecycle,
    preCredentialLifecycle,
    postMembershipLifecycle,
    postCredentialLifecycle
  });

  if (!memberEligibilityPolicy || !credentialPolicy || !charterPolicy || !historicalBindingPolicy) {
    throw new ValidationError('Circle self-protective mutation source policies are required');
  }
  const proposedCandidate = buildCircleMemberLifecycleGridHeadCandidate({
    memberEligibilityPolicy,
    credentialPolicy,
    charterPolicy,
    historicalBindingPolicy,
    circlePackage,
    charterLifecycle,
    historicalLedger,
    membershipLifecycle: postMembershipLifecycle,
    credentialLifecycle: postCredentialLifecycle,
    previousGridLifecycleHeadDigest: currentHead.lifecycle_head_digest,
    now: new Date(nowSeconds * 1000)
  });
  if (
    proposedCandidate.circle_id !== circleId
    || proposedCandidate.membership_id !== membershipId
    || proposedCandidate.principal_id !== principal
    || proposedCandidate.previous_grid_lifecycle_head_digest !== currentHead.lifecycle_head_digest
    || proposedCandidate.resulting_grid_lifecycle_head_digest === currentHead.lifecycle_head_digest
    || proposedCandidate.membership_lifecycle_digest !== digestObject(postMembershipLifecycle)
    || proposedCandidate.credential_lifecycle_digest !== digestObject(postCredentialLifecycle)
  ) throw new ValidationError('Circle self-protective proposed lifecycle candidate is not exact');

  const request = deepFreeze({
    schema: POLICY.schemas.request,
    policy_digest: digestObject(POLICY),
    parent_lifecycle_grid_head_policy_digest: digestObject(getCircleLifecycleGridHeadPolicy()),
    circle_id: circleId,
    membership_id: membershipId,
    principal_id: principal,
    authorizing_credential_id: credential,
    mutation_domain: mutation.domain,
    mutation_kind: mutation.kind,
    mutation_target_type: mutation.target_type,
    mutation_target_id: mutation.target_id,
    mutation_event_digest: mutation.event_digest,
    current_lifecycle_head_digest: currentHead.lifecycle_head_digest,
    pre_membership_lifecycle_digest: digestObject(preMembershipLifecycle),
    pre_credential_lifecycle_digest: digestObject(preCredentialLifecycle),
    proposed_lifecycle_head_digest: proposedCandidate.resulting_grid_lifecycle_head_digest,
    post_membership_lifecycle_digest: digestObject(postMembershipLifecycle),
    post_credential_lifecycle_digest: digestObject(postCredentialLifecycle),
    proposed_grid_event_id: proposedCandidate.event.event_id,
    proposed_grid_payload_digest: proposedCandidate.payload_digest,
    authority_effect: 'none',
    network_effect: 'none'
  });
  validateRequest(request);
  return {
    request,
    request_digest: digestObject(request),
    mutation,
    current_head: currentHead,
    proposed_candidate: proposedCandidate,
    authorizing_credential_id: credential,
    now_seconds: nowSeconds
  };
}

function classifySingleMutation({
  membershipId,
  preMembershipLifecycle,
  preCredentialLifecycle,
  postMembershipLifecycle,
  postCredentialLifecycle
}) {
  const membershipChanged = digestObject(preMembershipLifecycle) !== digestObject(postMembershipLifecycle);
  const credentialChanged = digestObject(preCredentialLifecycle) !== digestObject(postCredentialLifecycle);
  if (membershipChanged === credentialChanged) {
    throw new ValidationError('Circle self-protective request must change exactly one lifecycle domain');
  }
  if (membershipChanged) {
    requireOnlyEventAppend(preMembershipLifecycle, postMembershipLifecycle, 'Circle membership lifecycle');
    if (digestObject(preCredentialLifecycle) !== digestObject(postCredentialLifecycle)) {
      throw new ValidationError('Circle self-protective membership mutation cannot change credential lifecycle');
    }
    const event = postMembershipLifecycle.events.at(-1);
    if (!MEMBERSHIP_KINDS.has(event?.kind)) {
      throw new ValidationError('Circle self-protective membership mutation kind is not allowed');
    }
    return deepFreeze({
      domain: 'membership',
      kind: event.kind,
      target_type: 'membership',
      target_id: membershipId,
      event_digest: digestObject(event)
    });
  }

  requireOnlyEventAppend(preCredentialLifecycle, postCredentialLifecycle, 'Circle credential lifecycle');
  if (digestObject(preMembershipLifecycle) !== digestObject(postMembershipLifecycle)) {
    throw new ValidationError('Circle self-protective credential mutation cannot change membership lifecycle');
  }
  const event = postCredentialLifecycle.events.at(-1);
  if (!CREDENTIAL_KINDS.has(event?.kind)) {
    throw new ValidationError('Circle self-protective credential mutation kind is not allowed');
  }
  if (!['credential', 'device'].includes(event.target_type) || !ID.test(event.target_id ?? '')) {
    throw new ValidationError('Circle self-protective credential mutation target is invalid');
  }
  if (event.kind === 'device-compromise' && event.target_type !== 'device') {
    throw new ValidationError('Circle self-protective device compromise must target a device');
  }
  if (event.kind !== 'device-compromise' && event.target_type !== 'credential') {
    throw new ValidationError('Circle self-protective credential mutation must target a credential');
  }
  return deepFreeze({
    domain: 'credential',
    kind: event.kind,
    target_type: event.target_type,
    target_id: event.target_id,
    event_digest: digestObject(event)
  });
}

function requireOnlyEventAppend(before, after, label) {
  if (!Array.isArray(before.events) || !Array.isArray(after.events) || after.events.length !== before.events.length + 1) {
    throw new ValidationError(`${label} must append exactly one event`);
  }
  const beforeWithoutEvents = structuredClone(before);
  const afterWithoutEvents = structuredClone(after);
  delete beforeWithoutEvents.events;
  delete afterWithoutEvents.events;
  if (digestObject(beforeWithoutEvents) !== digestObject(afterWithoutEvents)) {
    throw new ValidationError(`${label} cannot change non-event lifecycle records`);
  }
  for (let index = 0; index < before.events.length; index += 1) {
    if (digestObject(before.events[index]) !== digestObject(after.events[index])) {
      throw new ValidationError(`${label} cannot rewrite prior events`);
    }
  }
}

function validateRequest(value) {
  exactObject(value, 'Circle self-protective lifecycle mutation request', [
    'schema', 'policy_digest', 'parent_lifecycle_grid_head_policy_digest', 'circle_id',
    'membership_id', 'principal_id', 'authorizing_credential_id', 'mutation_domain',
    'mutation_kind', 'mutation_target_type', 'mutation_target_id', 'mutation_event_digest',
    'current_lifecycle_head_digest', 'pre_membership_lifecycle_digest',
    'pre_credential_lifecycle_digest', 'proposed_lifecycle_head_digest',
    'post_membership_lifecycle_digest', 'post_credential_lifecycle_digest',
    'proposed_grid_event_id', 'proposed_grid_payload_digest', 'authority_effect', 'network_effect'
  ]);
  if (
    value.schema !== POLICY.schemas.request
    || value.policy_digest !== digestObject(POLICY)
    || value.parent_lifecycle_grid_head_policy_digest !== digestObject(getCircleLifecycleGridHeadPolicy())
    || !ID.test(value.circle_id ?? '')
    || !ID.test(value.membership_id ?? '')
    || !ID.test(value.principal_id ?? '')
    || !ID.test(value.authorizing_credential_id ?? '')
    || !['membership', 'credential'].includes(value.mutation_domain)
    || !(value.mutation_domain === 'membership' ? MEMBERSHIP_KINDS : CREDENTIAL_KINDS).has(value.mutation_kind)
    || !['membership', 'credential', 'device'].includes(value.mutation_target_type)
    || !ID.test(value.mutation_target_id ?? '')
    || !DIGEST.test(value.mutation_event_digest ?? '')
    || !DIGEST.test(value.current_lifecycle_head_digest ?? '')
    || !DIGEST.test(value.pre_membership_lifecycle_digest ?? '')
    || !DIGEST.test(value.pre_credential_lifecycle_digest ?? '')
    || !DIGEST.test(value.proposed_lifecycle_head_digest ?? '')
    || value.current_lifecycle_head_digest === value.proposed_lifecycle_head_digest
    || !DIGEST.test(value.post_membership_lifecycle_digest ?? '')
    || !DIGEST.test(value.post_credential_lifecycle_digest ?? '')
    || !ID.test(value.proposed_grid_event_id ?? '')
    || !DIGEST.test(value.proposed_grid_payload_digest ?? '')
    || value.authority_effect !== 'none'
    || value.network_effect !== 'none'
  ) throw new ValidationError('Circle self-protective lifecycle mutation request boundary is invalid');
  return true;
}

function requireSameLifecycleIdentity(left, right) {
  if (
    left.circle_id !== right.circle_id
    || left.membership_id !== right.membership_id
    || left.principal_id !== right.principal_id
  ) throw new ValidationError('Circle self-protective lifecycle identities do not match');
}

function requireLifecycleObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new ValidationError(`Circle self-protective ${label} is invalid`);
}

function requiredId(value, label) {
  if (typeof value !== 'string' || !ID.test(value)) throw new ValidationError(`${label} is invalid`);
  return value;
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
