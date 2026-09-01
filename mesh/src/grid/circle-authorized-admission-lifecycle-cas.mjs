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
  deriveCircleAuthorizedGridAdmissionInvocationDigest,
  getCircleAuthorizedGridAdmissionPolicy
} from './circle-authorized-admission.mjs';
import {
  deriveCircleAdmissionLifecycleGuardSet,
  digestCircleAdmissionLifecycleGuardSet,
  normalizeCircleAdmissionLifecycleGuardSet,
  validateCircleAdmissionLifecycleGuardSetAgainstAuthorization
} from './circle-admission-lifecycle-guards.mjs';
import {
  assessCircleRecordAuthorizationWithEligibility,
  getCircleRecordAuthorizationLifecyclePolicy,
  validateCircleRecordAuthorizationEligibilityResult
} from '../../../packages/axiom-circle-record-authorization-lifecycle/index.mjs';

const ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/;
const DIGEST = /^[a-f0-9]{64}$/;
const ADMISSION_SCOPE = 'grid-persistence-with-lifecycle-authorization-and-atomic-head-cas';
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
  'record_authorization_policy_digest', 'parent_authorized_admission_policy_digest',
  'parent_authorized_invocation_digest', 'lifecycle_guard_set_digest',
  'lifecycle_guard_count', 'atomic_lifecycle_cas', 'admission_scope',
  'runtime_authority', 'portable_authority', 'external_effect_authority'
]);
const RECEIPT_STATEMENT_KEYS = Object.freeze([
  'schema', 'circle_id', 'event_id', 'binding_digest', 'actor',
  'admission_jti', 'capability_digest', 'claims_digest', 'admission_trace_id',
  'record_authorization_assessment_digest', 'eligibility_evidence_digest',
  'lifecycle_guard_set_digest', 'lifecycle_guard_count',
  'grid_seq', 'grid_event_hash', 'grid_payload_digest', 'admitted_at',
  'atomic_lifecycle_cas', 'runtime_authority', 'portable_authority',
  'external_effect_authority', 'authority_effect', 'network_effect'
]);
const EVENT_KEYS = Object.freeze([
  'seq', 'event_id', 'trace_id', 'actor', 'kind', 'subject', 'occurred_at',
  'payload_digest', 'prev_hash', 'event_hash', 'signature'
]);

const EXPECTED_REQUIREMENTS = Object.freeze({
  parent_authorized_admission_policy_digest_bound: true,
  parent_authorized_invocation_digest_bound: true,
  authorization_assessment_recomputed_before_issue: true,
  authorization_evidence_digest_bound: true,
  lifecycle_guard_set_derived_from_authorization_context: true,
  every_authorization_membership_requires_exact_grid_head: true,
  bootstrap_and_self_acceptance_may_have_empty_guard_set: true,
  guard_set_digest_bound_into_single_hypervisor_capability: true,
  guard_set_count_bound: true,
  guarded_grid_append_required: true,
  lifecycle_head_check_and_circle_commit_share_one_grid_transaction: true,
  stale_lifecycle_head_rejects_entire_circle_append: true,
  exact_replay_may_remain_historical_and_idempotent: true,
  different_token_replay_of_existing_event_rejected: true,
  current_head_check_does_not_rewrite_historical_authorization: true,
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
  'authorized-lifecycle-mutation-service',
  'membership-resume-authority',
  'role-grant-authority',
  'credential-issuance-authority',
  'historical-backfill-authority',
  'trusted-wall-clock',
  'governance-legitimacy',
  'coercion-free-participation',
  'legal-authority',
  'runtime-authority',
  'portable-authority',
  'external-effect-authority',
  'distributed-consensus'
]);

const policyUrl = new URL('../../config/circle-authorized-grid-admission-lifecycle-cas.v0.json', import.meta.url);
const POLICY = deepFreeze(JSON.parse(readFileSync(policyUrl, 'utf8')));
validateCircleAuthorizedGridAdmissionLifecycleCasPolicy(POLICY);

export function getCircleAuthorizedGridAdmissionLifecycleCasPolicy() {
  return POLICY;
}

export function validateCircleAuthorizedGridAdmissionLifecycleCasPolicy(policy) {
  exactObject(policy, 'Circle lifecycle CAS admission policy', [
    'schema', 'version', 'status', 'runtime_activation', 'authority_effect', 'network_effect',
    'issuer_service', 'audience', 'tool', 'absolute_ttl_ceiling_seconds', 'requirements',
    'constraints_schema', 'receipt_schema', 'non_claims'
  ]);
  if (
    policy.schema !== 'axiom-circle-authorized-grid-admission-lifecycle-cas-policy.v0'
    || policy.version !== 0
    || policy.status !== 'internal-lifecycle-cas-admission-candidate'
    || policy.runtime_activation !== false
    || policy.authority_effect !== 'none'
    || policy.network_effect !== 'none'
    || policy.issuer_service !== 'hypervisor'
    || policy.audience !== 'grid'
    || policy.tool !== 'circle.persistence.append'
    || policy.absolute_ttl_ceiling_seconds !== 300
    || policy.constraints_schema !== 'axiom-circle-authorized-grid-admission-lifecycle-cas-constraints.v0'
    || policy.receipt_schema !== 'axiom-circle-authorized-grid-admission-lifecycle-cas-receipt.v0'
  ) throw new ValidationError('Circle lifecycle CAS admission activation boundary is invalid');
  exactObject(policy.requirements, 'Circle lifecycle CAS admission requirements', Object.keys(EXPECTED_REQUIREMENTS));
  for (const [key, expected] of Object.entries(EXPECTED_REQUIREMENTS)) {
    if (policy.requirements[key] !== expected) {
      throw new ValidationError(`Circle lifecycle CAS admission requirement ${key} was weakened`);
    }
  }
  exactSet(policy.non_claims, EXPECTED_NON_CLAIMS, 'Circle lifecycle CAS admission non-claims');
  return true;
}

export function deriveCircleAuthorizedLifecycleCasInvocationDigest(actor, event, authorization, lifecycleGuardSet) {
  const principal = requiredId(actor, 'Circle lifecycle CAS admission actor');
  validateCircleRecordAuthorizationEligibilityResult(
    authorization,
    getCircleRecordAuthorizationLifecyclePolicy()
  );
  const guardSet = normalizeCircleAdmissionLifecycleGuardSet(lifecycleGuardSet, { authorization });
  const parentInvocationDigest = deriveCircleAuthorizedGridAdmissionInvocationDigest(
    principal,
    event,
    authorization
  );
  return digestObject({
    schema: 'axiom-circle-authorized-grid-admission-lifecycle-cas-invocation.v0',
    actor: principal,
    parent_authorized_invocation_digest: parentInvocationDigest,
    lifecycle_guard_set_digest: digestCircleAdmissionLifecycleGuardSet(guardSet)
  });
}

export function deriveCircleAuthorizedLifecycleCasJti(actor, event, authorization, lifecycleGuardSet) {
  const invocationDigest = deriveCircleAuthorizedLifecycleCasInvocationDigest(
    actor,
    event,
    authorization,
    lifecycleGuardSet
  );
  return `circle_authorized_cas_${digestObject({
    schema: 'axiom-circle-authorized-grid-admission-lifecycle-cas-jti.v0',
    actor,
    event_id: event.event_id,
    invocation_digest: invocationDigest
  })}`;
}

export function deriveCircleAuthorizedLifecycleCasTraceId(capability) {
  return `circle_authorized_cas_cap_${sha256(String(capability))}`;
}

export function issueCircleAuthorizedLifecycleCasCapability(identity, {
  actor,
  event,
  authorizationInput,
  lifecycleHeads,
  intentDigest,
  planDigest,
  policyDigest,
  nowSeconds = Math.floor(Date.now() / 1000),
  ttlSeconds = 30
}) {
  validateCircleAuthorizedGridAdmissionLifecycleCasPolicy(POLICY);
  if (!identity || identity.service !== POLICY.issuer_service) {
    throw new ValidationError('Circle lifecycle CAS capability must be issued by Hypervisor identity');
  }
  validateLifetime(nowSeconds, ttlSeconds, POLICY.absolute_ttl_ceiling_seconds);
  const principal = requiredId(actor, 'Circle lifecycle CAS admission actor');
  if (!authorizationInput || authorizationInput.authenticatedPrincipal !== principal) {
    throw new ValidationError('Circle lifecycle CAS actor must equal authorization requester');
  }

  const authorization = assessCircleRecordAuthorizationWithEligibility(authorizationInput);
  const lifecycleGuardSet = deriveCircleAdmissionLifecycleGuardSet({
    authorizationInput,
    authorization,
    lifecycleHeads
  });
  const candidate = reconstructCircleGridPersistenceCandidate(event);
  const parentInvocationDigest = deriveCircleAuthorizedGridAdmissionInvocationDigest(
    principal,
    candidate.event,
    authorization
  );
  const claims = deepFreeze({
    iss: POLICY.issuer_service,
    aud: POLICY.audience,
    subject: principal,
    jti: deriveCircleAuthorizedLifecycleCasJti(principal, candidate.event, authorization, lifecycleGuardSet),
    nbf: nowSeconds,
    exp: nowSeconds + ttlSeconds,
    intent_digest: requiredDigest(intentDigest, 'Circle lifecycle CAS intent digest'),
    plan_digest: requiredDigest(planDigest, 'Circle lifecycle CAS plan digest'),
    policy_digest: requiredDigest(policyDigest, 'Circle lifecycle CAS upstream policy digest'),
    invocation_digest: deriveCircleAuthorizedLifecycleCasInvocationDigest(
      principal,
      candidate.event,
      authorization,
      lifecycleGuardSet
    ),
    tool: POLICY.tool,
    constraints: buildConstraints(candidate, authorization, lifecycleGuardSet, parentInvocationDigest)
  });
  return Object.freeze({
    capability: issueCapability(identity, claims),
    claims,
    authorization,
    lifecycle_guard_set: lifecycleGuardSet
  });
}

export function verifyCircleAuthorizedLifecycleCasCapability(capability, hypervisorPublicKey, {
  actor,
  event,
  authorization,
  lifecycleGuardSet,
  nowSeconds = Math.floor(Date.now() / 1000),
  maxTtlSeconds = 30
}) {
  validateCircleAuthorizedGridAdmissionLifecycleCasPolicy(POLICY);
  if (!hypervisorPublicKey) throw new ValidationError('Trusted Hypervisor public key is required for Circle lifecycle CAS admission');
  if (!Number.isSafeInteger(maxTtlSeconds) || maxTtlSeconds < 1 || maxTtlSeconds > POLICY.absolute_ttl_ceiling_seconds) {
    throw new ValidationError('Circle lifecycle CAS local TTL limit is invalid');
  }
  const principal = requiredId(actor, 'Circle lifecycle CAS admission actor');
  validateCircleRecordAuthorizationEligibilityResult(
    authorization,
    getCircleRecordAuthorizationLifecyclePolicy()
  );
  const guardSet = normalizeCircleAdmissionLifecycleGuardSet(lifecycleGuardSet, { authorization });
  const candidate = reconstructCircleGridPersistenceCandidate(event);
  const parentInvocationDigest = deriveCircleAuthorizedGridAdmissionInvocationDigest(
    principal,
    candidate.event,
    authorization
  );
  const claims = verifyCapability(capability, hypervisorPublicKey, {
    audience: POLICY.audience,
    issuer: POLICY.issuer_service,
    nowSeconds,
    maxTtlSeconds
  });
  exactObject(claims, 'Circle lifecycle CAS capability claims', CLAIM_KEYS);
  if (
    claims.subject !== principal
    || claims.tool !== POLICY.tool
    || claims.jti !== deriveCircleAuthorizedLifecycleCasJti(principal, candidate.event, authorization, guardSet)
    || claims.invocation_digest !== deriveCircleAuthorizedLifecycleCasInvocationDigest(principal, candidate.event, authorization, guardSet)
  ) {
    throw new AxiomError(
      'circle_authorized_lifecycle_cas_mismatch',
      'Circle lifecycle CAS capability is not bound to this actor, event, authorization, and lifecycle head set',
      403
    );
  }
  requiredDigest(claims.intent_digest, 'Circle lifecycle CAS intent digest');
  requiredDigest(claims.plan_digest, 'Circle lifecycle CAS plan digest');
  requiredDigest(claims.policy_digest, 'Circle lifecycle CAS upstream policy digest');
  validateConstraints(claims.constraints, candidate, authorization, guardSet, parentInvocationDigest);
  return deepFreeze({
    claims: structuredClone(claims),
    candidate,
    authorization: structuredClone(authorization),
    lifecycle_guard_set: structuredClone(guardSet)
  });
}

export function commitCirclePersistenceWithAuthorizedLifecycleCas({
  store,
  hypervisorPublicKey,
  capability,
  authorization,
  lifecycleGuardSet,
  actor,
  event,
  nowSeconds = Math.floor(Date.now() / 1000),
  maxTtlSeconds = 30
}) {
  if (
    !store
    || typeof store.appendCirclePersistenceWithLifecycleGuards !== 'function'
    || !store.identity
    || typeof store.identity.signObject !== 'function'
  ) throw new ValidationError('LifecycleGuardedCircleGridStore-compatible store with Grid identity is required');

  const verified = verifyCircleAuthorizedLifecycleCasCapability(capability, hypervisorPublicKey, {
    actor,
    event,
    authorization,
    lifecycleGuardSet,
    nowSeconds,
    maxTtlSeconds
  });
  const traceId = deriveCircleAuthorizedLifecycleCasTraceId(capability);
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
      'circle_authorized_lifecycle_cas_replay_mismatch',
      'Existing Circle persistence event was admitted under a different lifecycle-CAS capability',
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
    gridEvent
  });
  return Object.freeze({
    event: gridEvent,
    receipt: receipt.receipt,
    receipt_digest: receipt.receipt_digest,
    authorization_assessment_digest: authorization.assessment_digest,
    eligibility_evidence_digest: authorization.eligibility_evidence_digest,
    lifecycle_guard_set_digest: digestCircleAdmissionLifecycleGuardSet(verified.lifecycle_guard_set)
  });
}

export function verifyCircleAuthorizedLifecycleCasReceipt(receiptInput, {
  gridPublicKey,
  hypervisorPublicKey,
  capability,
  authorization,
  lifecycleGuardSet,
  actor,
  event,
  gridEvent,
  chainVerification,
  maxTtlSeconds = 30
}) {
  validateSignedGridEvent(gridEvent, gridPublicKey);
  const receipt = exactObject(receiptInput, 'Circle lifecycle CAS receipt', ['statement', 'signature']);
  const statement = normalizeReceiptStatement(receipt.statement);
  if (!gridPublicKey || !verifyObjectSignature(statement, receipt.signature, gridPublicKey)) {
    throw new AxiomError('invalid_circle_lifecycle_cas_receipt', 'Circle lifecycle CAS receipt signature is invalid', 401);
  }
  const verified = verifyCircleAuthorizedLifecycleCasCapability(capability, hypervisorPublicKey, {
    actor,
    event,
    authorization,
    lifecycleGuardSet,
    nowSeconds: Math.floor(Date.parse(statement.admitted_at) / 1000),
    maxTtlSeconds
  });
  const traceId = deriveCircleAuthorizedLifecycleCasTraceId(capability);
  if (
    gridEvent.event_id !== verified.candidate.event.event_id
    || gridEvent.actor !== actor
    || gridEvent.trace_id !== traceId
    || gridEvent.payload_digest !== verified.candidate.payload_digest
    || gridEvent.event_hash !== statement.grid_event_hash
    || gridEvent.seq !== statement.grid_seq
    || gridEvent.occurred_at !== statement.admitted_at
  ) {
    throw new AxiomError(
      'circle_lifecycle_cas_receipt_mismatch',
      'Circle lifecycle CAS receipt does not match the signed Grid event',
      403
    );
  }
  if (
    !chainVerification
    || typeof chainVerification !== 'object'
    || Array.isArray(chainVerification)
    || chainVerification.valid !== true
    || !Number.isSafeInteger(chainVerification.events)
    || chainVerification.events < gridEvent.seq
  ) throw new ValidationError('Circle lifecycle CAS receipt requires Grid chain verification covering the event');

  const expected = buildReceiptStatement({
    capability,
    claims: verified.claims,
    candidate: verified.candidate,
    authorization,
    lifecycleGuardSet: verified.lifecycle_guard_set,
    gridEvent
  });
  if (digestObject(statement) !== digestObject(expected)) {
    throw new AxiomError('circle_lifecycle_cas_receipt_mismatch', 'Circle lifecycle CAS receipt content is inconsistent', 403);
  }
  return Object.freeze({
    receipt: Object.freeze({ statement, signature: structuredClone(receipt.signature) }),
    receipt_digest: digestObject({ statement, signature: receipt.signature }),
    chain_verified: true,
    authorization_bound: true,
    lifecycle_head_cas_bound: true,
    runtime_authority: false,
    portable_authority: false,
    external_effect_authority: false
  });
}

function buildConstraints(candidate, authorization, lifecycleGuardSet, parentInvocationDigest) {
  validateCircleAdmissionLifecycleGuardSetAgainstAuthorization(lifecycleGuardSet, authorization);
  return deepFreeze({
    schema: POLICY.constraints_schema,
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
    parent_authorized_admission_policy_digest: digestObject(getCircleAuthorizedGridAdmissionPolicy()),
    parent_authorized_invocation_digest: parentInvocationDigest,
    lifecycle_guard_set_digest: digestCircleAdmissionLifecycleGuardSet(lifecycleGuardSet),
    lifecycle_guard_count: lifecycleGuardSet.guards.length,
    atomic_lifecycle_cas: true,
    admission_scope: ADMISSION_SCOPE,
    runtime_authority: false,
    portable_authority: false,
    external_effect_authority: false
  });
}

function validateConstraints(constraints, candidate, authorization, lifecycleGuardSet, parentInvocationDigest) {
  exactObject(constraints, 'Circle lifecycle CAS admission constraints', CONSTRAINT_KEYS);
  const expected = buildConstraints(candidate, authorization, lifecycleGuardSet, parentInvocationDigest);
  for (const key of CONSTRAINT_KEYS) {
    if (constraints[key] !== expected[key]) {
      throw new AxiomError(
        'circle_authorized_lifecycle_cas_constraint_mismatch',
        `Circle lifecycle CAS constraint ${key} does not match exact admission evidence`,
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

function buildReceiptStatement({ capability, claims, candidate, authorization, lifecycleGuardSet, gridEvent }) {
  return deepFreeze({
    schema: POLICY.receipt_schema,
    circle_id: candidate.circle_id,
    event_id: candidate.event.event_id,
    binding_digest: candidate.binding_digest,
    actor: claims.subject,
    admission_jti: claims.jti,
    capability_digest: sha256(String(capability)),
    claims_digest: digestObject(claims),
    admission_trace_id: deriveCircleAuthorizedLifecycleCasTraceId(capability),
    record_authorization_assessment_digest: authorization.assessment_digest,
    eligibility_evidence_digest: authorization.eligibility_evidence_digest,
    lifecycle_guard_set_digest: digestCircleAdmissionLifecycleGuardSet(lifecycleGuardSet),
    lifecycle_guard_count: lifecycleGuardSet.guards.length,
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
  exactObject(value, 'Circle lifecycle CAS receipt statement', RECEIPT_STATEMENT_KEYS);
  if (
    value.schema !== POLICY.receipt_schema
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
    || value.lifecycle_guard_count > 4096
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
  ) throw new ValidationError('Circle lifecycle CAS receipt statement boundary is invalid');
  return deepFreeze(structuredClone(value));
}

function validateSignedGridEvent(gridEvent, gridPublicKey) {
  if (!gridEvent || typeof gridEvent !== 'object' || Array.isArray(gridEvent)) {
    throw new ValidationError('Circle lifecycle CAS Grid event is invalid');
  }
  const actualKeys = Object.keys(gridEvent).filter(key => key !== 'payload').sort();
  const expectedKeys = [...EVENT_KEYS].sort();
  if (actualKeys.length !== expectedKeys.length || actualKeys.some((key, index) => key !== expectedKeys[index])) {
    throw new ValidationError('Circle lifecycle CAS Grid event fields are invalid');
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
  ) throw new ValidationError('Circle lifecycle CAS Grid event envelope is invalid');
  if (Object.hasOwn(gridEvent, 'payload') && digestObject(gridEvent.payload) !== gridEvent.payload_digest) {
    throw new AxiomError('circle_lifecycle_cas_grid_event_invalid', 'Circle lifecycle CAS Grid payload digest is invalid', 503);
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
    throw new AxiomError('circle_lifecycle_cas_grid_event_invalid', 'Circle lifecycle CAS Grid event hash is invalid', 503);
  }
  if (!gridPublicKey || !verifyObjectSignature({ event_hash: gridEvent.event_hash }, gridEvent.signature, gridPublicKey)) {
    throw new AxiomError('circle_lifecycle_cas_grid_event_invalid', 'Circle lifecycle CAS Grid event signature is invalid', 503);
  }
  return true;
}

function validateLifetime(nowSeconds, ttlSeconds, ceiling) {
  if (
    !Number.isSafeInteger(nowSeconds)
    || !Number.isSafeInteger(ttlSeconds)
    || ttlSeconds < 1
    || ttlSeconds > ceiling
  ) throw new ValidationError('Circle lifecycle CAS capability lifetime is invalid');
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
