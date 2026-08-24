import { readFileSync } from 'node:fs';

import {
  AxiomError,
  ValidationError,
  assertString,
  digestObject,
  sha256
} from '../lib/canonical.mjs';
import {
  issueCapability,
  verifyCapability,
  verifyObjectSignature
} from '../lib/identity.mjs';
import { reconstructCircleGridPersistenceCandidate } from './circle-persistence-state.mjs';
import {
  deriveCircleAdmissionLifecycleGuardSet,
  digestCircleAdmissionLifecycleGuardSet,
  normalizeCircleAdmissionLifecycleGuardSet,
  validateCircleAdmissionLifecycleGuardSetAgainstAuthorization
} from './circle-admission-lifecycle-guards.mjs';
import {
  deriveCircleAuthorizedLifecycleCasInvocationDigest,
  getCircleAuthorizedGridAdmissionLifecycleCasPolicy
} from './circle-authorized-admission-lifecycle-cas.mjs';
import {
  getCircleCredentialPossessionAttestationPolicy,
  verifyCircleCredentialPossessionAttestation
} from './circle-credential-possession-attestation.mjs';
import {
  assessCircleRecordAuthorizationWithEligibility,
  getCircleRecordAuthorizationLifecyclePolicy,
  validateCircleRecordAuthorizationEligibilityResult
} from '../../../packages/axiom-circle-record-authorization-lifecycle/index.mjs';

const ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/;
const DIGEST = /^[a-f0-9]{64}$/;
const ADMISSION_SCOPE = 'grid-persistence-with-lifecycle-authorization-atomic-head-cas-and-credential-possession';
const CLAIM_KEYS = Object.freeze([
  'iss', 'aud', 'subject', 'jti', 'nbf', 'exp',
  'intent_digest', 'plan_digest', 'policy_digest', 'invocation_digest',
  'tool', 'constraints'
]);
const CONSTRAINT_KEYS = Object.freeze([
  'schema', 'circle_id', 'event_id', 'binding_digest',
  'expected_prior_circle_head_digest', 'resulting_circle_head_digest',
  'payload_digest', 'persistence_policy_digest',
  'record_authorization_assessment_digest', 'eligibility_evidence_digest',
  'record_authorization_policy_digest', 'parent_lifecycle_cas_policy_digest',
  'parent_lifecycle_cas_invocation_digest', 'lifecycle_guard_set_digest',
  'lifecycle_guard_count', 'possession_policy_digest', 'possession_request_digest',
  'possession_attestation_set_digest', 'possession_attestation_count',
  'required_credential_count', 'all_required_credential_possession_observed',
  'atomic_lifecycle_cas', 'admission_scope', 'runtime_authority',
  'portable_authority', 'external_effect_authority'
]);
const RECEIPT_STATEMENT_KEYS = Object.freeze([
  'schema', 'circle_id', 'event_id', 'binding_digest', 'actor',
  'admission_jti', 'capability_digest', 'claims_digest', 'admission_trace_id',
  'record_authorization_assessment_digest', 'eligibility_evidence_digest',
  'lifecycle_guard_set_digest', 'lifecycle_guard_count',
  'possession_request_digest', 'possession_attestation_set_digest',
  'possession_attestation_count', 'required_credential_count',
  'all_required_credential_possession_observed', 'grid_seq', 'grid_event_hash',
  'grid_payload_digest', 'admitted_at', 'atomic_lifecycle_cas',
  'runtime_authority', 'portable_authority', 'external_effect_authority',
  'authority_effect', 'network_effect'
]);
const EVENT_KEYS = Object.freeze([
  'seq', 'event_id', 'trace_id', 'actor', 'kind', 'subject', 'occurred_at',
  'payload_digest', 'prev_hash', 'event_hash', 'signature'
]);
const REQUIRED_CREDENTIAL_KEYS = Object.freeze([
  'schema', 'circle_id', 'membership_id', 'principal_id', 'credential_id',
  'lifecycle_head_digest', 'credential_lifecycle_digest'
]);
const ATTESTATION_SET_ITEM_KEYS = Object.freeze([
  'schema', 'circle_id', 'membership_id', 'principal_id', 'credential_id',
  'lifecycle_head_digest', 'credential_lifecycle_digest', 'request_digest',
  'challenge_digest', 'attestation_digest', 'public_key_fingerprint', 'observed_at'
]);

const EXPECTED_REQUIREMENTS = Object.freeze({
  parent_lifecycle_cas_policy_digest_bound: true,
  parent_lifecycle_cas_invocation_digest_bound: true,
  possession_policy_digest_bound: true,
  authorization_assessment_recomputed_before_issue: true,
  lifecycle_guard_set_derived_from_authorization_context: true,
  possession_request_digest_binds_actor_event_authorization_guards_intent_plan_policy: true,
  every_credential_backed_authorization_evidence_requires_possession_attestation: true,
  duplicate_credential_evidence_deduplicated_by_exact_identity: true,
  bootstrap_and_self_acceptance_may_require_zero_attestations: true,
  attestation_exact_request_digest_required: true,
  attestation_exact_lifecycle_head_matches_atomic_guard: true,
  attestation_credential_lifecycle_digest_matches_guard: true,
  attestation_set_exact_coverage_required: true,
  attestation_set_digest_bound_into_single_hypervisor_capability: true,
  possession_attestations_reverified_at_grid_commit: true,
  guarded_grid_append_required: true,
  lifecycle_head_check_and_circle_commit_share_one_grid_transaction: true,
  stale_lifecycle_head_rejects_entire_circle_append: true,
  exact_replay_may_remain_historical_and_idempotent: true,
  different_token_replay_of_existing_event_rejected: true,
  challenge_single_use_persisted: false,
  human_identity_proved: false,
  legal_identity_proved: false,
  role_authority_granted: false,
  runtime_authority: false,
  portable_authority: false,
  external_effect_authority: false,
  public_grid_route: false,
  gateway_route: false,
  hypervisor_runtime_route: false
});
const EXPECTED_SCHEMAS = Object.freeze({
  required_credential: 'axiom-circle-possession-bound-required-credential.v0',
  attestation_set_item: 'axiom-circle-possession-bound-attestation-set-item.v0',
  attestation_set: 'axiom-circle-possession-bound-attestation-set.v0',
  constraints: 'axiom-circle-possession-bound-atomic-admission-constraints.v0',
  receipt: 'axiom-circle-possession-bound-atomic-admission-receipt.v0'
});
const EXPECTED_NON_CLAIMS = new Set([
  'human-identity',
  'legal-identity',
  'authorized-human-custody',
  'authorized-lifecycle-mutation-service',
  'membership-resume-authority',
  'role-grant-authority',
  'credential-issuance-authority',
  'recovery-authority',
  'historical-backfill-authority',
  'challenge-single-use-persistence',
  'trusted-global-time',
  'governance-legitimacy',
  'coercion-free-participation',
  'legal-authority',
  'runtime-authority',
  'portable-authority',
  'external-effect-authority',
  'distributed-consensus'
]);

const policyUrl = new URL('../../config/circle-possession-bound-atomic-admission.v0.json', import.meta.url);
const POLICY = deepFreeze(JSON.parse(readFileSync(policyUrl, 'utf8')));
validateCirclePossessionBoundAtomicAdmissionPolicy(POLICY);

export function getCirclePossessionBoundAtomicAdmissionPolicy() {
  return POLICY;
}

export function validateCirclePossessionBoundAtomicAdmissionPolicy(policy) {
  exactObject(policy, 'Circle possession-bound atomic admission policy', [
    'schema', 'version', 'status', 'runtime_activation', 'authority_effect', 'network_effect',
    'issuer_service', 'audience', 'tool', 'absolute_ttl_ceiling_seconds', 'requirements',
    'schemas', 'non_claims'
  ]);
  if (
    policy.schema !== 'axiom-circle-possession-bound-atomic-admission-policy.v0'
    || policy.version !== 0
    || policy.status !== 'internal-possession-bound-lifecycle-cas-admission-candidate'
    || policy.runtime_activation !== false
    || policy.authority_effect !== 'none'
    || policy.network_effect !== 'none'
    || policy.issuer_service !== 'hypervisor'
    || policy.audience !== 'grid'
    || policy.tool !== 'circle.persistence.append'
    || policy.absolute_ttl_ceiling_seconds !== 60
  ) throw new ValidationError('Circle possession-bound atomic admission activation boundary is invalid');
  exactObject(policy.requirements, 'Circle possession-bound atomic admission requirements', Object.keys(EXPECTED_REQUIREMENTS));
  for (const [key, expected] of Object.entries(EXPECTED_REQUIREMENTS)) {
    if (policy.requirements[key] !== expected) {
      throw new ValidationError(`Circle possession-bound atomic admission requirement ${key} was weakened`);
    }
  }
  exactObject(policy.schemas, 'Circle possession-bound atomic admission schemas', Object.keys(EXPECTED_SCHEMAS));
  for (const [key, expected] of Object.entries(EXPECTED_SCHEMAS)) {
    if (policy.schemas[key] !== expected) {
      throw new ValidationError(`Circle possession-bound atomic admission schema ${key} drifted`);
    }
  }
  exactSet(policy.non_claims, EXPECTED_NON_CLAIMS, 'Circle possession-bound atomic admission non-claims');
  return true;
}

export function deriveCirclePossessionBoundAdmissionRequestDigest({
  actor,
  event,
  authorization,
  lifecycleGuardSet,
  intentDigest,
  planDigest,
  policyDigest
}) {
  const principal = requiredId(actor, 'Circle possession-bound admission actor');
  validateCircleRecordAuthorizationEligibilityResult(
    authorization,
    getCircleRecordAuthorizationLifecyclePolicy()
  );
  const candidate = reconstructCircleGridPersistenceCandidate(event);
  const guardSet = normalizeCircleAdmissionLifecycleGuardSet(lifecycleGuardSet, { authorization });
  const parentInvocationDigest = deriveCircleAuthorizedLifecycleCasInvocationDigest(
    principal,
    candidate.event,
    authorization,
    guardSet
  );
  return digestObject({
    schema: 'axiom-circle-possession-bound-admission-request.v0',
    actor: principal,
    event_id: candidate.event.event_id,
    parent_lifecycle_cas_invocation_digest: parentInvocationDigest,
    record_authorization_assessment_digest: authorization.assessment_digest,
    eligibility_evidence_digest: authorization.eligibility_evidence_digest,
    lifecycle_guard_set_digest: digestCircleAdmissionLifecycleGuardSet(guardSet),
    intent_digest: requiredDigest(intentDigest, 'Circle possession-bound intent digest'),
    plan_digest: requiredDigest(planDigest, 'Circle possession-bound plan digest'),
    policy_digest: requiredDigest(policyDigest, 'Circle possession-bound upstream policy digest'),
    runtime_authority: false,
    portable_authority: false,
    external_effect_authority: false
  });
}

export function prepareCirclePossessionBoundAtomicAdmission({
  actor,
  event,
  authorizationInput,
  lifecycleHeads,
  intentDigest,
  planDigest,
  policyDigest
}) {
  validateCirclePossessionBoundAtomicAdmissionPolicy(POLICY);
  const principal = requiredId(actor, 'Circle possession-bound admission actor');
  if (!authorizationInput || authorizationInput.authenticatedPrincipal !== principal) {
    throw new ValidationError('Circle possession-bound admission actor must equal authorization requester');
  }
  const authorization = assessCircleRecordAuthorizationWithEligibility(authorizationInput);
  const lifecycleGuardSet = deriveCircleAdmissionLifecycleGuardSet({
    authorizationInput,
    authorization,
    lifecycleHeads
  });
  const candidate = reconstructCircleGridPersistenceCandidate(event);
  const requestDigest = deriveCirclePossessionBoundAdmissionRequestDigest({
    actor: principal,
    event: candidate.event,
    authorization,
    lifecycleGuardSet,
    intentDigest,
    planDigest,
    policyDigest
  });
  const requiredCredentials = deriveRequiredCredentials(authorization, lifecycleGuardSet);
  return deepFreeze({
    actor: principal,
    candidate,
    authorization,
    lifecycle_guard_set: lifecycleGuardSet,
    possession_request_digest: requestDigest,
    required_credentials: requiredCredentials,
    intent_digest: requiredDigest(intentDigest, 'Circle possession-bound intent digest'),
    plan_digest: requiredDigest(planDigest, 'Circle possession-bound plan digest'),
    policy_digest: requiredDigest(policyDigest, 'Circle possession-bound upstream policy digest')
  });
}

export function verifyCirclePossessionAttestationSet({
  authorization,
  lifecycleGuardSet,
  possessionRequestDigest,
  possessionAttestations,
  hypervisorPublicKey,
  nowSeconds = Math.floor(Date.now() / 1000),
  maxAgeSeconds = 60
}) {
  if (!hypervisorPublicKey) {
    throw new ValidationError('Trusted Hypervisor public key is required for Circle possession-bound admission');
  }
  if (!Number.isSafeInteger(nowSeconds)) {
    throw new ValidationError('Circle possession-bound attestation verification time is invalid');
  }
  if (!Number.isSafeInteger(maxAgeSeconds) || maxAgeSeconds < 1 || maxAgeSeconds > 60) {
    throw new ValidationError('Circle possession-bound attestation max age is invalid');
  }
  validateCircleRecordAuthorizationEligibilityResult(
    authorization,
    getCircleRecordAuthorizationLifecyclePolicy()
  );
  const guardSet = normalizeCircleAdmissionLifecycleGuardSet(lifecycleGuardSet, { authorization });
  const requestDigest = requiredDigest(possessionRequestDigest, 'Circle possession-bound request digest');
  const requiredCredentials = deriveRequiredCredentials(authorization, guardSet);
  if (!Array.isArray(possessionAttestations) || possessionAttestations.length > 8192) {
    throw new ValidationError('Circle possession-bound attestation inventory is invalid');
  }
  if (possessionAttestations.length !== requiredCredentials.length) {
    throw new ValidationError('Circle possession-bound admission requires exactly one possession attestation per required credential');
  }

  const inputByCredential = new Map();
  for (const attestation of possessionAttestations) {
    const statement = attestation?.statement;
    if (!statement || typeof statement !== 'object' || Array.isArray(statement)) {
      throw new ValidationError('Circle possession-bound attestation envelope is invalid');
    }
    const key = credentialKey(statement);
    if (inputByCredential.has(key)) {
      throw new ValidationError('Circle possession-bound attestation inventory contains duplicate credential evidence');
    }
    inputByCredential.set(key, attestation);
  }

  const items = [];
  for (const required of requiredCredentials) {
    const input = inputByCredential.get(credentialKey(required));
    if (!input) {
      throw new ValidationError(`Circle possession-bound admission is missing credential evidence for ${required.credential_id}`);
    }
    const verified = verifyCircleCredentialPossessionAttestation(input, hypervisorPublicKey, {
      requestDigest,
      lifecycleHeadDigest: required.lifecycle_head_digest,
      circleId: required.circle_id,
      membershipId: required.membership_id,
      principalId: required.principal_id,
      credentialId: required.credential_id,
      nowSeconds,
      maxAgeSeconds
    });
    if (verified.statement.credential_lifecycle_digest !== required.credential_lifecycle_digest) {
      throw new AxiomError(
        'circle_possession_attestation_lifecycle_mismatch',
        'Circle credential possession attestation credential lifecycle does not match the atomic Grid guard',
        409,
        {
          circle_id: required.circle_id,
          membership_id: required.membership_id,
          credential_id: required.credential_id,
          expected_credential_lifecycle_digest: required.credential_lifecycle_digest,
          observed_credential_lifecycle_digest: verified.statement.credential_lifecycle_digest
        }
      );
    }
    items.push(deepFreeze({
      schema: POLICY.schemas.attestation_set_item,
      circle_id: required.circle_id,
      membership_id: required.membership_id,
      principal_id: required.principal_id,
      credential_id: required.credential_id,
      lifecycle_head_digest: required.lifecycle_head_digest,
      credential_lifecycle_digest: required.credential_lifecycle_digest,
      request_digest: requestDigest,
      challenge_digest: verified.statement.challenge_digest,
      attestation_digest: verified.attestation_digest,
      public_key_fingerprint: verified.statement.public_key_fingerprint,
      observed_at: verified.statement.observed_at
    }));
  }
  items.sort((left, right) => credentialKey(left).localeCompare(credentialKey(right)));
  const set = deepFreeze({
    schema: POLICY.schemas.attestation_set,
    request_digest: requestDigest,
    required_credential_count: requiredCredentials.length,
    attestation_count: items.length,
    all_required_credential_possession_observed: true,
    items,
    human_identity_verified: false,
    legal_identity_verified: false,
    role_authority_granted: false,
    runtime_authority: false,
    portable_authority: false,
    external_effect_authority: false,
    authority_effect: 'none',
    network_effect: 'none'
  });
  validatePossessionAttestationSet(set, requiredCredentials, requestDigest);
  return set;
}

export function digestCirclePossessionAttestationSet(set) {
  validatePossessionAttestationSet(set);
  return digestObject(set);
}

export function deriveCirclePossessionBoundAtomicInvocationDigest({
  actor,
  event,
  authorization,
  lifecycleGuardSet,
  intentDigest,
  planDigest,
  policyDigest,
  possessionAttestationSet
}) {
  const principal = requiredId(actor, 'Circle possession-bound admission actor');
  const candidate = reconstructCircleGridPersistenceCandidate(event);
  const guardSet = normalizeCircleAdmissionLifecycleGuardSet(lifecycleGuardSet, { authorization });
  const requestDigest = deriveCirclePossessionBoundAdmissionRequestDigest({
    actor: principal,
    event: candidate.event,
    authorization,
    lifecycleGuardSet: guardSet,
    intentDigest,
    planDigest,
    policyDigest
  });
  validatePossessionAttestationSet(possessionAttestationSet, null, requestDigest);
  return digestObject({
    schema: 'axiom-circle-possession-bound-atomic-admission-invocation.v0',
    actor: principal,
    parent_lifecycle_cas_invocation_digest: deriveCircleAuthorizedLifecycleCasInvocationDigest(
      principal,
      candidate.event,
      authorization,
      guardSet
    ),
    possession_request_digest: requestDigest,
    possession_attestation_set_digest: digestCirclePossessionAttestationSet(possessionAttestationSet)
  });
}

export function deriveCirclePossessionBoundAtomicJti(input) {
  const invocationDigest = deriveCirclePossessionBoundAtomicInvocationDigest(input);
  return `circle_possession_atomic_${digestObject({
    schema: 'axiom-circle-possession-bound-atomic-admission-jti.v0',
    actor: input.actor,
    event_id: input.event.event_id,
    invocation_digest: invocationDigest
  })}`;
}

export function deriveCirclePossessionBoundAtomicTraceId(capability) {
  return `circle_possession_atomic_cap_${sha256(String(capability))}`;
}

export function issueCirclePossessionBoundAtomicCapability(identity, {
  actor,
  event,
  authorizationInput,
  lifecycleHeads,
  possessionAttestations,
  intentDigest,
  planDigest,
  policyDigest,
  hypervisorPublicKey = identity?.publicKey,
  nowSeconds = Math.floor(Date.now() / 1000),
  ttlSeconds = 30,
  possessionMaxAgeSeconds = 60
}) {
  validateCirclePossessionBoundAtomicAdmissionPolicy(POLICY);
  if (!identity || identity.service !== POLICY.issuer_service || typeof identity.signObject !== 'function') {
    throw new ValidationError('Circle possession-bound atomic capability requires Hypervisor identity');
  }
  if (!hypervisorPublicKey) throw new ValidationError('Trusted Hypervisor public key is required at possession-bound issuance');
  validateLifetime(nowSeconds, ttlSeconds, POLICY.absolute_ttl_ceiling_seconds);
  const prepared = prepareCirclePossessionBoundAtomicAdmission({
    actor,
    event,
    authorizationInput,
    lifecycleHeads,
    intentDigest,
    planDigest,
    policyDigest
  });
  const possessionSet = verifyCirclePossessionAttestationSet({
    authorization: prepared.authorization,
    lifecycleGuardSet: prepared.lifecycle_guard_set,
    possessionRequestDigest: prepared.possession_request_digest,
    possessionAttestations,
    hypervisorPublicKey,
    nowSeconds,
    maxAgeSeconds: possessionMaxAgeSeconds
  });
  const parentInvocationDigest = deriveCircleAuthorizedLifecycleCasInvocationDigest(
    prepared.actor,
    prepared.candidate.event,
    prepared.authorization,
    prepared.lifecycle_guard_set
  );
  const invocationInput = {
    actor: prepared.actor,
    event: prepared.candidate.event,
    authorization: prepared.authorization,
    lifecycleGuardSet: prepared.lifecycle_guard_set,
    intentDigest: prepared.intent_digest,
    planDigest: prepared.plan_digest,
    policyDigest: prepared.policy_digest,
    possessionAttestationSet: possessionSet
  };
  const claims = deepFreeze({
    iss: POLICY.issuer_service,
    aud: POLICY.audience,
    subject: prepared.actor,
    jti: deriveCirclePossessionBoundAtomicJti(invocationInput),
    nbf: nowSeconds,
    exp: nowSeconds + ttlSeconds,
    intent_digest: prepared.intent_digest,
    plan_digest: prepared.plan_digest,
    policy_digest: prepared.policy_digest,
    invocation_digest: deriveCirclePossessionBoundAtomicInvocationDigest(invocationInput),
    tool: POLICY.tool,
    constraints: buildConstraints(
      prepared.candidate,
      prepared.authorization,
      prepared.lifecycle_guard_set,
      possessionSet,
      prepared.possession_request_digest,
      parentInvocationDigest
    )
  });
  return Object.freeze({
    capability: issueCapability(identity, claims),
    claims,
    authorization: prepared.authorization,
    lifecycle_guard_set: prepared.lifecycle_guard_set,
    possession_attestation_set: possessionSet,
    possession_request_digest: prepared.possession_request_digest
  });
}

export function verifyCirclePossessionBoundAtomicCapability(capability, hypervisorPublicKey, {
  actor,
  event,
  authorization,
  lifecycleGuardSet,
  possessionAttestations,
  nowSeconds = Math.floor(Date.now() / 1000),
  maxTtlSeconds = 30,
  possessionMaxAgeSeconds = 60
}) {
  validateCirclePossessionBoundAtomicAdmissionPolicy(POLICY);
  if (!hypervisorPublicKey) throw new ValidationError('Trusted Hypervisor public key is required for Circle possession-bound admission');
  if (!Number.isSafeInteger(maxTtlSeconds) || maxTtlSeconds < 1 || maxTtlSeconds > POLICY.absolute_ttl_ceiling_seconds) {
    throw new ValidationError('Circle possession-bound local TTL limit is invalid');
  }
  const principal = requiredId(actor, 'Circle possession-bound admission actor');
  validateCircleRecordAuthorizationEligibilityResult(
    authorization,
    getCircleRecordAuthorizationLifecyclePolicy()
  );
  const candidate = reconstructCircleGridPersistenceCandidate(event);
  const guardSet = normalizeCircleAdmissionLifecycleGuardSet(lifecycleGuardSet, { authorization });
  const claims = verifyCapability(capability, hypervisorPublicKey, {
    audience: POLICY.audience,
    issuer: POLICY.issuer_service,
    nowSeconds,
    maxTtlSeconds
  });
  exactObject(claims, 'Circle possession-bound capability claims', CLAIM_KEYS);
  requiredDigest(claims.intent_digest, 'Circle possession-bound intent digest');
  requiredDigest(claims.plan_digest, 'Circle possession-bound plan digest');
  requiredDigest(claims.policy_digest, 'Circle possession-bound upstream policy digest');
  const requestDigest = deriveCirclePossessionBoundAdmissionRequestDigest({
    actor: principal,
    event: candidate.event,
    authorization,
    lifecycleGuardSet: guardSet,
    intentDigest: claims.intent_digest,
    planDigest: claims.plan_digest,
    policyDigest: claims.policy_digest
  });
  const possessionSet = verifyCirclePossessionAttestationSet({
    authorization,
    lifecycleGuardSet: guardSet,
    possessionRequestDigest: requestDigest,
    possessionAttestations,
    hypervisorPublicKey,
    nowSeconds,
    maxAgeSeconds: possessionMaxAgeSeconds
  });
  const invocationInput = {
    actor: principal,
    event: candidate.event,
    authorization,
    lifecycleGuardSet: guardSet,
    intentDigest: claims.intent_digest,
    planDigest: claims.plan_digest,
    policyDigest: claims.policy_digest,
    possessionAttestationSet: possessionSet
  };
  if (
    claims.subject !== principal
    || claims.tool !== POLICY.tool
    || claims.jti !== deriveCirclePossessionBoundAtomicJti(invocationInput)
    || claims.invocation_digest !== deriveCirclePossessionBoundAtomicInvocationDigest(invocationInput)
  ) {
    throw new AxiomError(
      'circle_possession_bound_capability_mismatch',
      'Circle possession-bound capability is not bound to this actor, event, authorization, lifecycle heads, and possession evidence',
      403
    );
  }
  const parentInvocationDigest = deriveCircleAuthorizedLifecycleCasInvocationDigest(
    principal,
    candidate.event,
    authorization,
    guardSet
  );
  validateConstraints(
    claims.constraints,
    candidate,
    authorization,
    guardSet,
    possessionSet,
    requestDigest,
    parentInvocationDigest
  );
  return deepFreeze({
    claims: structuredClone(claims),
    candidate,
    authorization: structuredClone(authorization),
    lifecycle_guard_set: structuredClone(guardSet),
    possession_attestation_set: structuredClone(possessionSet),
    possession_request_digest: requestDigest
  });
}

export function commitCirclePersistenceWithPossessionBoundAtomicAdmission({
  store,
  hypervisorPublicKey,
  capability,
  authorization,
  lifecycleGuardSet,
  possessionAttestations,
  actor,
  event,
  nowSeconds = Math.floor(Date.now() / 1000),
  maxTtlSeconds = 30,
  possessionMaxAgeSeconds = 60
}) {
  if (
    !store
    || typeof store.appendCirclePersistenceWithLifecycleGuards !== 'function'
    || !store.identity
    || typeof store.identity.signObject !== 'function'
  ) throw new ValidationError('LifecycleGuardedCircleGridStore-compatible store with Grid identity is required');

  const verified = verifyCirclePossessionBoundAtomicCapability(capability, hypervisorPublicKey, {
    actor,
    event,
    authorization,
    lifecycleGuardSet,
    possessionAttestations,
    nowSeconds,
    maxTtlSeconds,
    possessionMaxAgeSeconds
  });
  const traceId = deriveCirclePossessionBoundAtomicTraceId(capability);
  const [gridEvent] = store.appendCirclePersistenceWithLifecycleGuards({
    traceId,
    actor,
    event: verified.candidate.event,
    lifecycleGuardSet: verified.lifecycle_guard_set
  });
  if (
    gridEvent.event_id !== verified.candidate.event.event_id
    || gridEvent.actor !== actor
    || gridEvent.trace_id !== traceId
    || gridEvent.kind !== verified.candidate.event.kind
    || gridEvent.subject !== verified.candidate.event.subject
    || gridEvent.payload_digest !== verified.candidate.payload_digest
  ) {
    throw new AxiomError(
      'circle_possession_bound_replay_mismatch',
      'Existing Circle persistence event was admitted under a different possession-bound capability',
      409,
      {
        event_id: verified.candidate.event.event_id,
        expected_trace_id: traceId,
        observed_trace_id: gridEvent.trace_id
      }
    );
  }
  const receipt = signReceipt(store.identity, {
    capability,
    claims: verified.claims,
    candidate: verified.candidate,
    authorization,
    lifecycleGuardSet: verified.lifecycle_guard_set,
    possessionSet: verified.possession_attestation_set,
    possessionRequestDigest: verified.possession_request_digest,
    gridEvent
  });
  return Object.freeze({
    event: gridEvent,
    receipt: receipt.receipt,
    receipt_digest: receipt.receipt_digest,
    authorization_assessment_digest: authorization.assessment_digest,
    eligibility_evidence_digest: authorization.eligibility_evidence_digest,
    lifecycle_guard_set_digest: digestCircleAdmissionLifecycleGuardSet(verified.lifecycle_guard_set),
    possession_attestation_set_digest: digestCirclePossessionAttestationSet(verified.possession_attestation_set),
    possession_request_digest: verified.possession_request_digest,
    all_required_credential_possession_observed: true
  });
}

export function verifyCirclePossessionBoundAtomicReceipt(receiptInput, {
  gridPublicKey,
  hypervisorPublicKey,
  capability,
  authorization,
  lifecycleGuardSet,
  possessionAttestations,
  actor,
  event,
  gridEvent,
  chainVerification,
  maxTtlSeconds = 30,
  possessionMaxAgeSeconds = 60
}) {
  validateSignedGridEvent(gridEvent, gridPublicKey);
  const receipt = exactObject(receiptInput, 'Circle possession-bound receipt', ['statement', 'signature']);
  const statement = normalizeReceiptStatement(receipt.statement);
  if (!gridPublicKey || !verifyObjectSignature(statement, receipt.signature, gridPublicKey)) {
    throw new AxiomError('invalid_circle_possession_bound_receipt', 'Circle possession-bound receipt signature is invalid', 401);
  }
  const verified = verifyCirclePossessionBoundAtomicCapability(capability, hypervisorPublicKey, {
    actor,
    event,
    authorization,
    lifecycleGuardSet,
    possessionAttestations,
    nowSeconds: Math.floor(Date.parse(statement.admitted_at) / 1000),
    maxTtlSeconds,
    possessionMaxAgeSeconds
  });
  const traceId = deriveCirclePossessionBoundAtomicTraceId(capability);
  if (
    gridEvent.event_id !== verified.candidate.event.event_id
    || gridEvent.actor !== actor
    || gridEvent.trace_id !== traceId
    || gridEvent.payload_digest !== verified.candidate.payload_digest
    || gridEvent.event_hash !== statement.grid_event_hash
    || gridEvent.seq !== statement.grid_seq
    || gridEvent.occurred_at !== statement.admitted_at
  ) {
    throw new AxiomError('circle_possession_bound_receipt_mismatch', 'Circle possession-bound receipt does not match the signed Grid event', 403);
  }
  if (
    !chainVerification
    || typeof chainVerification !== 'object'
    || Array.isArray(chainVerification)
    || chainVerification.valid !== true
    || !Number.isSafeInteger(chainVerification.events)
    || chainVerification.events < gridEvent.seq
  ) throw new ValidationError('Circle possession-bound receipt requires Grid chain verification covering the event');
  const expected = buildReceiptStatement({
    capability,
    claims: verified.claims,
    candidate: verified.candidate,
    authorization,
    lifecycleGuardSet: verified.lifecycle_guard_set,
    possessionSet: verified.possession_attestation_set,
    possessionRequestDigest: verified.possession_request_digest,
    gridEvent
  });
  if (digestObject(statement) !== digestObject(expected)) {
    throw new AxiomError('circle_possession_bound_receipt_mismatch', 'Circle possession-bound receipt content is inconsistent', 403);
  }
  return Object.freeze({
    receipt: Object.freeze({ statement, signature: structuredClone(receipt.signature) }),
    receipt_digest: digestObject({ statement, signature: receipt.signature }),
    chain_verified: true,
    authorization_bound: true,
    lifecycle_head_cas_bound: true,
    possession_evidence_bound: true,
    all_required_credential_possession_observed: true,
    runtime_authority: false,
    portable_authority: false,
    external_effect_authority: false
  });
}

function deriveRequiredCredentials(authorization, lifecycleGuardSet) {
  validateCircleRecordAuthorizationEligibilityResult(
    authorization,
    getCircleRecordAuthorizationLifecyclePolicy()
  );
  const guardSet = normalizeCircleAdmissionLifecycleGuardSet(lifecycleGuardSet, { authorization });
  validateCircleAdmissionLifecycleGuardSetAgainstAuthorization(guardSet, authorization);
  const guardByMembership = new Map(guardSet.guards.map(guard => [guard.membership_id, guard]));
  const required = new Map();
  for (const evidence of authorization.eligibility_evidence.items) {
    const guard = guardByMembership.get(evidence.membership_id);
    if (!guard) throw new ValidationError('Circle possession-bound authorization evidence is missing its lifecycle guard');
    const item = normalizeRequiredCredential({
      schema: POLICY.schemas.required_credential,
      circle_id: evidence.circle_id,
      membership_id: evidence.membership_id,
      principal_id: evidence.principal_id,
      credential_id: evidence.credential_id,
      lifecycle_head_digest: guard.expected_lifecycle_head_digest,
      credential_lifecycle_digest: guard.credential_lifecycle_digest
    });
    const key = credentialKey(item);
    const existing = required.get(key);
    if (existing && digestObject(existing) !== digestObject(item)) {
      throw new ValidationError('Circle possession-bound authorization evidence has inconsistent credential identity');
    }
    required.set(key, item);
  }
  return Object.freeze([...required.values()].sort((left, right) => credentialKey(left).localeCompare(credentialKey(right))));
}

function normalizeRequiredCredential(value) {
  exactObject(value, 'Circle possession-bound required credential', REQUIRED_CREDENTIAL_KEYS);
  if (
    value.schema !== POLICY.schemas.required_credential
    || !ID.test(value.circle_id ?? '')
    || !ID.test(value.membership_id ?? '')
    || !ID.test(value.principal_id ?? '')
    || !ID.test(value.credential_id ?? '')
    || !DIGEST.test(value.lifecycle_head_digest ?? '')
    || !DIGEST.test(value.credential_lifecycle_digest ?? '')
  ) throw new ValidationError('Circle possession-bound required credential boundary is invalid');
  return deepFreeze(structuredClone(value));
}

function validatePossessionAttestationSet(set, requiredCredentials = null, requestDigest = null) {
  exactObject(set, 'Circle possession-bound attestation set', [
    'schema', 'request_digest', 'required_credential_count', 'attestation_count',
    'all_required_credential_possession_observed', 'items', 'human_identity_verified',
    'legal_identity_verified', 'role_authority_granted', 'runtime_authority',
    'portable_authority', 'external_effect_authority', 'authority_effect', 'network_effect'
  ]);
  if (
    set.schema !== POLICY.schemas.attestation_set
    || !DIGEST.test(set.request_digest ?? '')
    || !Number.isSafeInteger(set.required_credential_count)
    || set.required_credential_count < 0
    || set.required_credential_count > 8192
    || !Number.isSafeInteger(set.attestation_count)
    || set.attestation_count !== set.required_credential_count
    || !Array.isArray(set.items)
    || set.items.length !== set.attestation_count
    || set.all_required_credential_possession_observed !== true
    || set.human_identity_verified !== false
    || set.legal_identity_verified !== false
    || set.role_authority_granted !== false
    || set.runtime_authority !== false
    || set.portable_authority !== false
    || set.external_effect_authority !== false
    || set.authority_effect !== 'none'
    || set.network_effect !== 'none'
  ) throw new ValidationError('Circle possession-bound attestation set boundary is invalid');
  if (requestDigest !== null && set.request_digest !== requestDigest) {
    throw new ValidationError('Circle possession-bound attestation set request digest does not match');
  }
  const seen = new Set();
  for (const item of set.items) {
    exactObject(item, 'Circle possession-bound attestation set item', ATTESTATION_SET_ITEM_KEYS);
    if (
      item.schema !== POLICY.schemas.attestation_set_item
      || !ID.test(item.circle_id ?? '')
      || !ID.test(item.membership_id ?? '')
      || !ID.test(item.principal_id ?? '')
      || !ID.test(item.credential_id ?? '')
      || !DIGEST.test(item.lifecycle_head_digest ?? '')
      || !DIGEST.test(item.credential_lifecycle_digest ?? '')
      || item.request_digest !== set.request_digest
      || !DIGEST.test(item.challenge_digest ?? '')
      || !DIGEST.test(item.attestation_digest ?? '')
      || !DIGEST.test(item.public_key_fingerprint ?? '')
      || !canonicalTimestamp(item.observed_at)
    ) throw new ValidationError('Circle possession-bound attestation set item boundary is invalid');
    const key = credentialKey(item);
    if (seen.has(key)) throw new ValidationError('Circle possession-bound attestation set contains duplicate credential');
    seen.add(key);
  }
  if (requiredCredentials !== null) {
    if (!Array.isArray(requiredCredentials) || requiredCredentials.length !== set.required_credential_count) {
      throw new ValidationError('Circle possession-bound attestation set required credential inventory is invalid');
    }
    const requiredByKey = new Map(requiredCredentials.map(item => [credentialKey(item), normalizeRequiredCredential(item)]));
    for (const item of set.items) {
      const required = requiredByKey.get(credentialKey(item));
      if (
        !required
        || item.lifecycle_head_digest !== required.lifecycle_head_digest
        || item.credential_lifecycle_digest !== required.credential_lifecycle_digest
      ) throw new ValidationError('Circle possession-bound attestation set does not exactly cover required credential state');
    }
  }
  return true;
}

function buildConstraints(candidate, authorization, guardSet, possessionSet, requestDigest, parentInvocationDigest) {
  validateCircleAdmissionLifecycleGuardSetAgainstAuthorization(guardSet, authorization);
  validatePossessionAttestationSet(possessionSet, deriveRequiredCredentials(authorization, guardSet), requestDigest);
  return deepFreeze({
    schema: POLICY.schemas.constraints,
    circle_id: candidate.circle_id,
    event_id: candidate.event.event_id,
    binding_digest: candidate.binding_digest,
    expected_prior_circle_head_digest: candidate.expected_prior_circle_head_digest,
    resulting_circle_head_digest: candidate.resulting_circle_head_digest,
    payload_digest: candidate.payload_digest,
    persistence_policy_digest: candidate.policy_digest,
    record_authorization_assessment_digest: authorization.assessment_digest,
    eligibility_evidence_digest: authorization.eligibility_evidence_digest,
    record_authorization_policy_digest: digestObject(getCircleRecordAuthorizationLifecyclePolicy()),
    parent_lifecycle_cas_policy_digest: digestObject(getCircleAuthorizedGridAdmissionLifecycleCasPolicy()),
    parent_lifecycle_cas_invocation_digest: parentInvocationDigest,
    lifecycle_guard_set_digest: digestCircleAdmissionLifecycleGuardSet(guardSet),
    lifecycle_guard_count: guardSet.guards.length,
    possession_policy_digest: digestObject(getCircleCredentialPossessionAttestationPolicy()),
    possession_request_digest: requestDigest,
    possession_attestation_set_digest: digestCirclePossessionAttestationSet(possessionSet),
    possession_attestation_count: possessionSet.attestation_count,
    required_credential_count: possessionSet.required_credential_count,
    all_required_credential_possession_observed: true,
    atomic_lifecycle_cas: true,
    admission_scope: ADMISSION_SCOPE,
    runtime_authority: false,
    portable_authority: false,
    external_effect_authority: false
  });
}

function validateConstraints(constraints, candidate, authorization, guardSet, possessionSet, requestDigest, parentInvocationDigest) {
  exactObject(constraints, 'Circle possession-bound admission constraints', CONSTRAINT_KEYS);
  const expected = buildConstraints(
    candidate,
    authorization,
    guardSet,
    possessionSet,
    requestDigest,
    parentInvocationDigest
  );
  for (const key of CONSTRAINT_KEYS) {
    if (constraints[key] !== expected[key]) {
      throw new AxiomError(
        'circle_possession_bound_constraint_mismatch',
        `Circle possession-bound admission constraint ${key} does not match exact admission evidence`,
        403
      );
    }
  }
  return true;
}

function signReceipt(identity, input) {
  const statement = buildReceiptStatement(input);
  const signature = identity.signObject(statement);
  const receipt = Object.freeze({ statement, signature });
  return Object.freeze({ receipt, receipt_digest: digestObject(receipt) });
}

function buildReceiptStatement({
  capability,
  claims,
  candidate,
  authorization,
  lifecycleGuardSet,
  possessionSet,
  possessionRequestDigest,
  gridEvent
}) {
  return deepFreeze({
    schema: POLICY.schemas.receipt,
    circle_id: candidate.circle_id,
    event_id: candidate.event.event_id,
    binding_digest: candidate.binding_digest,
    actor: claims.subject,
    admission_jti: claims.jti,
    capability_digest: sha256(String(capability)),
    claims_digest: digestObject(claims),
    admission_trace_id: deriveCirclePossessionBoundAtomicTraceId(capability),
    record_authorization_assessment_digest: authorization.assessment_digest,
    eligibility_evidence_digest: authorization.eligibility_evidence_digest,
    lifecycle_guard_set_digest: digestCircleAdmissionLifecycleGuardSet(lifecycleGuardSet),
    lifecycle_guard_count: lifecycleGuardSet.guards.length,
    possession_request_digest: possessionRequestDigest,
    possession_attestation_set_digest: digestCirclePossessionAttestationSet(possessionSet),
    possession_attestation_count: possessionSet.attestation_count,
    required_credential_count: possessionSet.required_credential_count,
    all_required_credential_possession_observed: true,
    grid_seq: gridEvent.seq,
    grid_event_hash: gridEvent.event_hash,
    grid_payload_digest: gridEvent.payload_digest,
    admitted_at: gridEvent.occurred_at,
    atomic_lifecycle_cas: true,
    runtime_authority: false,
    portable_authority: false,
    external_effect_authority: false,
    authority_effect: 'none',
    network_effect: 'none'
  });
}

function normalizeReceiptStatement(value) {
  exactObject(value, 'Circle possession-bound receipt statement', RECEIPT_STATEMENT_KEYS);
  if (
    value.schema !== POLICY.schemas.receipt
    || !ID.test(value.circle_id ?? '')
    || !ID.test(value.event_id ?? '')
    || !DIGEST.test(value.binding_digest ?? '')
    || !ID.test(value.actor ?? '')
    || !ID.test(value.admission_jti ?? '')
    || !DIGEST.test(value.capability_digest ?? '')
    || !DIGEST.test(value.claims_digest ?? '')
    || !ID.test(value.admission_trace_id ?? '')
    || !DIGEST.test(value.record_authorization_assessment_digest ?? '')
    || !DIGEST.test(value.eligibility_evidence_digest ?? '')
    || !DIGEST.test(value.lifecycle_guard_set_digest ?? '')
    || !Number.isSafeInteger(value.lifecycle_guard_count)
    || value.lifecycle_guard_count < 0
    || !DIGEST.test(value.possession_request_digest ?? '')
    || !DIGEST.test(value.possession_attestation_set_digest ?? '')
    || !Number.isSafeInteger(value.possession_attestation_count)
    || value.possession_attestation_count < 0
    || !Number.isSafeInteger(value.required_credential_count)
    || value.required_credential_count !== value.possession_attestation_count
    || value.all_required_credential_possession_observed !== true
    || !Number.isSafeInteger(value.grid_seq)
    || value.grid_seq < 1
    || !DIGEST.test(value.grid_event_hash ?? '')
    || !DIGEST.test(value.grid_payload_digest ?? '')
    || !canonicalTimestamp(value.admitted_at)
    || value.atomic_lifecycle_cas !== true
    || value.runtime_authority !== false
    || value.portable_authority !== false
    || value.external_effect_authority !== false
    || value.authority_effect !== 'none'
    || value.network_effect !== 'none'
  ) throw new ValidationError('Circle possession-bound receipt statement boundary is invalid');
  return deepFreeze(structuredClone(value));
}

function validateSignedGridEvent(gridEvent, gridPublicKey) {
  if (!gridEvent || typeof gridEvent !== 'object' || Array.isArray(gridEvent)) {
    throw new ValidationError('Circle possession-bound Grid event is invalid');
  }
  const actualKeys = Object.keys(gridEvent).filter(key => key !== 'payload').sort();
  const expectedKeys = [...EVENT_KEYS].sort();
  if (actualKeys.length !== expectedKeys.length || actualKeys.some((key, index) => key !== expectedKeys[index])) {
    throw new ValidationError('Circle possession-bound Grid event fields are invalid');
  }
  if (
    !Number.isSafeInteger(gridEvent.seq)
    || gridEvent.seq < 1
    || !ID.test(gridEvent.event_id ?? '')
    || !ID.test(gridEvent.trace_id ?? '')
    || !ID.test(gridEvent.actor ?? '')
    || typeof gridEvent.kind !== 'string'
    || !ID.test(gridEvent.subject ?? '')
    || !canonicalTimestamp(gridEvent.occurred_at)
    || !DIGEST.test(gridEvent.payload_digest ?? '')
    || !DIGEST.test(gridEvent.prev_hash ?? '')
    || !DIGEST.test(gridEvent.event_hash ?? '')
  ) throw new ValidationError('Circle possession-bound Grid event envelope is invalid');
  if (Object.hasOwn(gridEvent, 'payload') && digestObject(gridEvent.payload) !== gridEvent.payload_digest) {
    throw new AxiomError('circle_possession_bound_grid_event_invalid', 'Circle possession-bound Grid payload digest is invalid', 503);
  }
  const expectedHash = digestObject({
    seq: gridEvent.seq,
    event_id: gridEvent.event_id,
    trace_id: gridEvent.trace_id,
    actor: gridEvent.actor,
    kind: gridEvent.kind,
    subject: gridEvent.subject,
    occurred_at: gridEvent.occurred_at,
    payload_digest: gridEvent.payload_digest,
    prev_hash: gridEvent.prev_hash
  });
  if (gridEvent.event_hash !== expectedHash) {
    throw new AxiomError('circle_possession_bound_grid_event_invalid', 'Circle possession-bound Grid event hash is invalid', 503);
  }
  if (!gridPublicKey || !verifyObjectSignature({ event_hash: gridEvent.event_hash }, gridEvent.signature, gridPublicKey)) {
    throw new AxiomError('circle_possession_bound_grid_event_invalid', 'Circle possession-bound Grid event signature is invalid', 503);
  }
  return true;
}

function credentialKey(value) {
  return `${String(value.circle_id)}\u0000${String(value.membership_id)}\u0000${String(value.principal_id)}\u0000${String(value.credential_id)}`;
}

function validateLifetime(nowSeconds, ttlSeconds, ceiling) {
  if (
    !Number.isSafeInteger(nowSeconds)
    || !Number.isSafeInteger(ttlSeconds)
    || ttlSeconds < 1
    || ttlSeconds > ceiling
  ) throw new ValidationError('Circle possession-bound capability lifetime is invalid');
}

function requiredId(value, label) {
  return assertString(value, label, { min: 1, max: 160, pattern: ID });
}

function requiredDigest(value, label) {
  return assertString(value, label, { min: 64, max: 64, pattern: DIGEST });
}

function canonicalTimestamp(value) {
  if (typeof value !== 'string') return false;
  const date = new Date(value);
  return !Number.isNaN(date.valueOf()) && date.toISOString() === value;
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
