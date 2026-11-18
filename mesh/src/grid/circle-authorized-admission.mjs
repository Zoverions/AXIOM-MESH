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
import { getCircleGridAdmissionPolicy } from './circle-admission.mjs';
import {
  assessCircleRecordAuthorizationWithEligibility,
  getCircleRecordAuthorizationLifecyclePolicy,
  validateCircleRecordAuthorizationEligibilityResult
} from '../../../packages/axiom-circle-record-authorization-lifecycle/index.mjs';

const ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/;
const DIGEST = /^[a-f0-9]{64}$/;
const ADMISSION_SCOPE = 'grid-persistence-with-lifecycle-authorization';
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
  'record_authorization_policy_digest', 'parent_grid_admission_policy_digest',
  'authorized_admission_policy_digest', 'admission_scope',
  'runtime_authority', 'portable_authority', 'external_effect_authority'
]);
const RECEIPT_STATEMENT_KEYS = Object.freeze([
  'schema', 'circle_id', 'event_id', 'binding_digest', 'actor',
  'admission_jti', 'capability_digest', 'claims_digest', 'admission_trace_id',
  'record_authorization_assessment_digest', 'eligibility_evidence_digest',
  'record_authorization_policy_digest', 'grid_seq', 'grid_event_hash',
  'grid_payload_digest', 'admitted_at', 'runtime_authority', 'portable_authority',
  'external_effect_authority', 'authority_effect', 'network_effect'
]);
const EVENT_KEYS = Object.freeze([
  'seq', 'event_id', 'trace_id', 'actor', 'kind', 'subject', 'occurred_at',
  'payload_digest', 'prev_hash', 'event_hash', 'signature'
]);

const EXPECTED_REQUIREMENTS = Object.freeze({
  parent_grid_admission_policy_digest_bound: true,
  single_hypervisor_capability_for_authorization_and_admission: true,
  authorization_assessment_recomputed_before_issue: true,
  authorization_assessment_digest_bound: true,
  eligibility_evidence_digest_bound: true,
  actor_matches_authorized_requester: true,
  event_matches_authorized_historical_binding: true,
  record_digest_matches_authorized_record: true,
  persistence_candidate_exactly_bound: true,
  deterministic_jti_binds_authorization_digest: true,
  signed_grid_trace_binds_capability_digest: true,
  same_token_exact_replay_may_be_idempotent: true,
  different_token_replay_of_existing_event_rejected: true,
  same_event_different_authorization_rejected: true,
  standalone_unbound_parent_admission_is_runtime_promotion_eligible: false,
  request_replay_guard_counts_as_durable_admission: false,
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
  'governance-legitimacy',
  'historical-truth',
  'trusted-wall-clock',
  'legal-authority',
  'execution-authority',
  'portable-authority',
  'external-effect-authority',
  'distributed-consensus'
]);

const policyUrl = new URL('../../config/circle-authorized-grid-admission.v0.json', import.meta.url);
const CIRCLE_AUTHORIZED_GRID_ADMISSION_POLICY = deepFreeze(JSON.parse(readFileSync(policyUrl, 'utf8')));
validateCircleAuthorizedGridAdmissionPolicy(CIRCLE_AUTHORIZED_GRID_ADMISSION_POLICY);

export function getCircleAuthorizedGridAdmissionPolicy() {
  return CIRCLE_AUTHORIZED_GRID_ADMISSION_POLICY;
}

export function validateCircleAuthorizedGridAdmissionPolicy(policy) {
  exactObject(policy, 'Circle authorized Grid admission policy', [
    'schema', 'version', 'status', 'runtime_activation', 'authority_effect', 'network_effect',
    'issuer_service', 'audience', 'tool', 'absolute_ttl_ceiling_seconds', 'requirements',
    'constraints_schema', 'receipt_schema', 'non_claims'
  ]);
  if (
    policy.schema !== 'axiom-circle-authorized-grid-admission-policy.v0'
    || policy.version !== 0
    || policy.status !== 'internal-authorized-admission-candidate'
    || policy.runtime_activation !== false
    || policy.authority_effect !== 'none'
    || policy.network_effect !== 'none'
    || policy.issuer_service !== 'hypervisor'
    || policy.audience !== 'grid'
    || policy.tool !== 'circle.persistence.append'
    || policy.absolute_ttl_ceiling_seconds !== 300
    || policy.constraints_schema !== 'axiom-circle-authorized-grid-admission-constraints.v0'
    || policy.receipt_schema !== 'axiom-circle-authorized-grid-admission-receipt.v0'
  ) throw new ValidationError('Circle authorized Grid admission activation boundary is invalid');
  exactObject(policy.requirements, 'Circle authorized Grid admission requirements', Object.keys(EXPECTED_REQUIREMENTS));
  for (const [key, expected] of Object.entries(EXPECTED_REQUIREMENTS)) {
    if (policy.requirements[key] !== expected) {
      throw new ValidationError(`Circle authorized Grid admission requirement ${key} was weakened`);
    }
  }
  exactSet(policy.non_claims, EXPECTED_NON_CLAIMS, 'Circle authorized Grid admission non-claims');
  return true;
}

export function deriveCircleAuthorizedGridAdmissionInvocationDigest(actor, rawEvent, authorizationResult) {
  const principal = requiredId(actor, 'Circle authorized Grid admission actor');
  const candidate = validateAdmissionEvent(rawEvent);
  validateCircleRecordAuthorizationEligibilityResult(
    authorizationResult,
    getCircleRecordAuthorizationLifecyclePolicy()
  );
  assertAuthorizationMatchesEvent(principal, candidate, authorizationResult);
  return digestObject({
    schema: 'axiom-circle-authorized-grid-admission-invocation.v0',
    actor: principal,
    event: candidate.event,
    record_authorization_assessment_digest: authorizationResult.assessment_digest,
    eligibility_evidence_digest: authorizationResult.eligibility_evidence_digest,
    record_authorization_policy_digest: digestObject(getCircleRecordAuthorizationLifecyclePolicy())
  });
}

export function deriveCircleAuthorizedGridAdmissionJti(actor, rawEvent, authorizationResult) {
  const invocationDigest = deriveCircleAuthorizedGridAdmissionInvocationDigest(
    actor,
    rawEvent,
    authorizationResult
  );
  return `circle_authorized_admit_${digestObject({
    schema: 'axiom-circle-authorized-grid-admission-jti.v0',
    actor,
    event_id: rawEvent.event_id,
    invocation_digest: invocationDigest,
    authorization_assessment_digest: authorizationResult.assessment_digest
  })}`;
}

export function deriveCircleAuthorizedGridAdmissionTraceId(capability) {
  return `circle_authorized_cap_${sha256(String(capability))}`;
}

export function issueCircleAuthorizedGridAdmissionCapability(identity, {
  actor,
  event,
  authorizationInput,
  intentDigest,
  planDigest,
  policyDigest,
  nowSeconds = Math.floor(Date.now() / 1000),
  ttlSeconds = 30
}) {
  validateCircleAuthorizedGridAdmissionPolicy(CIRCLE_AUTHORIZED_GRID_ADMISSION_POLICY);
  if (!identity || identity.service !== CIRCLE_AUTHORIZED_GRID_ADMISSION_POLICY.issuer_service) {
    throw new ValidationError('Circle authorized Grid admission capability must be issued by Hypervisor identity');
  }
  if (
    !Number.isSafeInteger(nowSeconds)
    || !Number.isSafeInteger(ttlSeconds)
    || ttlSeconds < 1
    || ttlSeconds > CIRCLE_AUTHORIZED_GRID_ADMISSION_POLICY.absolute_ttl_ceiling_seconds
  ) throw new ValidationError('Circle authorized Grid admission capability lifetime is invalid');

  const principal = requiredId(actor, 'Circle authorized Grid admission actor');
  if (!authorizationInput || authorizationInput.authenticatedPrincipal !== principal) {
    throw new ValidationError('Circle authorized Grid admission actor must equal authorization requester');
  }
  const authorization = assessCircleRecordAuthorizationWithEligibility(authorizationInput);
  const candidate = validateAdmissionEvent(event);
  assertAuthorizationMatchesEvent(principal, candidate, authorization);

  const claims = deepFreeze({
    iss: CIRCLE_AUTHORIZED_GRID_ADMISSION_POLICY.issuer_service,
    aud: CIRCLE_AUTHORIZED_GRID_ADMISSION_POLICY.audience,
    subject: principal,
    jti: deriveCircleAuthorizedGridAdmissionJti(principal, candidate.event, authorization),
    nbf: nowSeconds,
    exp: nowSeconds + ttlSeconds,
    intent_digest: requiredDigest(intentDigest, 'Circle authorized Grid admission intent digest'),
    plan_digest: requiredDigest(planDigest, 'Circle authorized Grid admission plan digest'),
    policy_digest: requiredDigest(policyDigest, 'Circle authorized Grid admission upstream policy digest'),
    invocation_digest: deriveCircleAuthorizedGridAdmissionInvocationDigest(principal, candidate.event, authorization),
    tool: CIRCLE_AUTHORIZED_GRID_ADMISSION_POLICY.tool,
    constraints: buildAdmissionConstraints(candidate, authorization)
  });
  return Object.freeze({
    capability: issueCapability(identity, claims),
    claims,
    authorization
  });
}

export function verifyCircleAuthorizedGridAdmissionCapability(capability, hypervisorPublicKey, {
  actor,
  event,
  authorization,
  nowSeconds = Math.floor(Date.now() / 1000),
  maxTtlSeconds = 30
}) {
  validateCircleAuthorizedGridAdmissionPolicy(CIRCLE_AUTHORIZED_GRID_ADMISSION_POLICY);
  if (!hypervisorPublicKey) throw new ValidationError('Trusted Hypervisor public key is required for Circle authorized admission');
  if (
    !Number.isSafeInteger(maxTtlSeconds)
    || maxTtlSeconds < 1
    || maxTtlSeconds > CIRCLE_AUTHORIZED_GRID_ADMISSION_POLICY.absolute_ttl_ceiling_seconds
  ) throw new ValidationError('Circle authorized Grid admission local TTL limit is invalid');

  const principal = requiredId(actor, 'Circle authorized Grid admission actor');
  validateCircleRecordAuthorizationEligibilityResult(
    authorization,
    getCircleRecordAuthorizationLifecyclePolicy()
  );
  const candidate = validateAdmissionEvent(event);
  assertAuthorizationMatchesEvent(principal, candidate, authorization);
  const claims = verifyCapability(capability, hypervisorPublicKey, {
    audience: CIRCLE_AUTHORIZED_GRID_ADMISSION_POLICY.audience,
    issuer: CIRCLE_AUTHORIZED_GRID_ADMISSION_POLICY.issuer_service,
    nowSeconds,
    maxTtlSeconds
  });
  exactObject(claims, 'Circle authorized Grid admission capability claims', CLAIM_KEYS);
  if (
    claims.subject !== principal
    || claims.tool !== CIRCLE_AUTHORIZED_GRID_ADMISSION_POLICY.tool
    || claims.jti !== deriveCircleAuthorizedGridAdmissionJti(principal, candidate.event, authorization)
    || claims.invocation_digest !== deriveCircleAuthorizedGridAdmissionInvocationDigest(principal, candidate.event, authorization)
  ) {
    throw new AxiomError(
      'circle_authorized_admission_mismatch',
      'Circle authorized Grid admission capability is not bound to this actor, event, and authorization evidence',
      403
    );
  }
  requiredDigest(claims.intent_digest, 'Circle authorized Grid admission intent digest');
  requiredDigest(claims.plan_digest, 'Circle authorized Grid admission plan digest');
  requiredDigest(claims.policy_digest, 'Circle authorized Grid admission upstream policy digest');
  validateAdmissionConstraints(claims.constraints, candidate, authorization);
  return deepFreeze({ claims: structuredClone(claims), candidate, authorization: structuredClone(authorization) });
}

export function commitCirclePersistenceWithAuthorizedAdmission({
  store,
  hypervisorPublicKey,
  capability,
  authorization,
  actor,
  event,
  nowSeconds = Math.floor(Date.now() / 1000),
  maxTtlSeconds = 30
}) {
  if (
    !store
    || typeof store.appendEvents !== 'function'
    || typeof store.getCirclePersistenceHead !== 'function'
    || !store.identity
    || typeof store.identity.signObject !== 'function'
  ) throw new ValidationError('CircleGridStore-compatible store with Grid identity is required');

  const verified = verifyCircleAuthorizedGridAdmissionCapability(capability, hypervisorPublicKey, {
    actor,
    event,
    authorization,
    nowSeconds,
    maxTtlSeconds
  });
  const traceId = deriveCircleAuthorizedGridAdmissionTraceId(capability);
  const [gridEvent] = store.appendEvents({
    traceId,
    actor,
    events: [verified.candidate.event]
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
      'circle_authorized_admission_replay_mismatch',
      'Existing Circle persistence event was admitted under a different actor, capability, or authorization assessment',
      409,
      {
        event_id: verified.candidate.event.event_id,
        expected_actor: actor,
        observed_actor: gridEvent.actor,
        expected_trace_id: traceId,
        observed_trace_id: gridEvent.trace_id
      }
    );
  }
  const receipt = signAdmissionReceipt(store.identity, {
    capability,
    claims: verified.claims,
    candidate: verified.candidate,
    authorization,
    gridEvent
  });
  return Object.freeze({
    event: gridEvent,
    receipt: receipt.receipt,
    receipt_digest: receipt.receipt_digest,
    authorization_assessment_digest: authorization.assessment_digest,
    eligibility_evidence_digest: authorization.eligibility_evidence_digest
  });
}

export function verifyCircleAuthorizedGridAdmissionReceipt(receiptInput, {
  gridPublicKey,
  hypervisorPublicKey,
  capability,
  authorization,
  actor,
  event,
  gridEvent,
  chainVerification,
  maxTtlSeconds = 30
}) {
  validateSignedGridAdmissionEvent(gridEvent, gridPublicKey);
  const receipt = exactObject(receiptInput, 'Circle authorized Grid admission receipt', ['statement', 'signature']);
  const statement = normalizeReceiptStatement(receipt.statement);
  if (!gridPublicKey || !verifyObjectSignature(statement, receipt.signature, gridPublicKey)) {
    throw new AxiomError(
      'invalid_circle_authorized_admission_receipt',
      'Circle authorized Grid admission receipt signature is invalid',
      401
    );
  }
  const admittedAtMs = Date.parse(statement.admitted_at);
  const verified = verifyCircleAuthorizedGridAdmissionCapability(capability, hypervisorPublicKey, {
    actor,
    event,
    authorization,
    nowSeconds: Math.floor(admittedAtMs / 1000),
    maxTtlSeconds
  });
  const traceId = deriveCircleAuthorizedGridAdmissionTraceId(capability);
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
      'circle_authorized_admission_receipt_mismatch',
      'Circle authorized Grid admission receipt does not match the signed Grid event',
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
  ) throw new ValidationError('Circle authorized admission receipt verification requires Grid chain verification covering the event');

  const expectedStatement = buildReceiptStatement({
    capability,
    claims: verified.claims,
    candidate: verified.candidate,
    authorization,
    gridEvent
  });
  if (digestObject(statement) !== digestObject(expectedStatement)) {
    throw new AxiomError(
      'circle_authorized_admission_receipt_mismatch',
      'Circle authorized Grid admission receipt does not match this capability, authorization, and event',
      403
    );
  }
  return Object.freeze({
    receipt: Object.freeze({ statement, signature: structuredClone(receipt.signature) }),
    receipt_digest: digestObject({ statement, signature: receipt.signature }),
    chain_verified: true,
    authorization_bound: true,
    runtime_authority: false,
    portable_authority: false,
    external_effect_authority: false
  });
}

function assertAuthorizationMatchesEvent(actor, candidate, authorization) {
  const assessment = authorization.assessment;
  const payload = candidate.event.payload;
  if (
    assessment.authenticated_requester !== actor
    || assessment.circle_id !== candidate.circle_id
    || assessment.historical_binding_digest !== candidate.binding_digest
    || assessment.historical_binding_id !== payload.binding_id
    || assessment.record_type !== payload.record_type
    || assessment.record_id !== payload.record_id
    || assessment.record_digest !== payload.record_digest
    || assessment.governing_charter_digest !== payload.governing_charter_digest
  ) {
    throw new AxiomError(
      'circle_authorization_event_mismatch',
      'Circle lifecycle-aware authorization assessment does not match the exact persistence event',
      403
    );
  }
  return true;
}

function buildAdmissionConstraints(candidate, authorization) {
  return deepFreeze({
    schema: CIRCLE_AUTHORIZED_GRID_ADMISSION_POLICY.constraints_schema,
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
    parent_grid_admission_policy_digest: digestObject(getCircleGridAdmissionPolicy()),
    authorized_admission_policy_digest: digestObject(CIRCLE_AUTHORIZED_GRID_ADMISSION_POLICY),
    admission_scope: ADMISSION_SCOPE,
    runtime_authority: false,
    portable_authority: false,
    external_effect_authority: false
  });
}

function validateAdmissionConstraints(constraints, candidate, authorization) {
  exactObject(constraints, 'Circle authorized Grid admission constraints', CONSTRAINT_KEYS);
  const expected = buildAdmissionConstraints(candidate, authorization);
  for (const key of CONSTRAINT_KEYS) {
    if (constraints[key] !== expected[key]) {
      throw new AxiomError(
        'circle_authorized_admission_constraint_mismatch',
        `Circle authorized Grid admission constraint ${key} does not match exact event and authorization evidence`,
        403
      );
    }
  }
  return true;
}

function signAdmissionReceipt(identity, input) {
  const statement = buildReceiptStatement(input);
  const signature = identity.signObject(statement);
  const receipt = Object.freeze({ statement, signature });
  return Object.freeze({ receipt, receipt_digest: digestObject(receipt) });
}

function buildReceiptStatement({ capability, claims, candidate, authorization, gridEvent }) {
  return deepFreeze({
    schema: CIRCLE_AUTHORIZED_GRID_ADMISSION_POLICY.receipt_schema,
    circle_id: candidate.circle_id,
    event_id: candidate.event.event_id,
    binding_digest: candidate.binding_digest,
    actor: claims.subject,
    admission_jti: claims.jti,
    capability_digest: sha256(String(capability)),
    claims_digest: digestObject(claims),
    admission_trace_id: deriveCircleAuthorizedGridAdmissionTraceId(capability),
    record_authorization_assessment_digest: authorization.assessment_digest,
    eligibility_evidence_digest: authorization.eligibility_evidence_digest,
    record_authorization_policy_digest: digestObject(getCircleRecordAuthorizationLifecyclePolicy()),
    grid_seq: gridEvent.seq,
    grid_event_hash: gridEvent.event_hash,
    grid_payload_digest: gridEvent.payload_digest,
    admitted_at: gridEvent.occurred_at,
    runtime_authority: false,
    portable_authority: false,
    external_effect_authority: false,
    authority_effect: 'none',
    network_effect: 'none'
  });
}

function normalizeReceiptStatement(value) {
  exactObject(value, 'Circle authorized Grid admission receipt statement', RECEIPT_STATEMENT_KEYS);
  if (
    value.schema !== CIRCLE_AUTHORIZED_GRID_ADMISSION_POLICY.receipt_schema
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
    || !DIGEST.test(value.record_authorization_policy_digest ?? '')
    || !Number.isSafeInteger(value.grid_seq)
    || value.grid_seq < 1
    || !DIGEST.test(value.grid_event_hash ?? '')
    || !DIGEST.test(value.grid_payload_digest ?? '')
    || !canonicalTimestamp(value.admitted_at)
    || value.runtime_authority !== false
    || value.portable_authority !== false
    || value.external_effect_authority !== false
    || value.authority_effect !== 'none'
    || value.network_effect !== 'none'
  ) throw new ValidationError('Circle authorized Grid admission receipt statement is invalid');
  return deepFreeze(structuredClone(value));
}

function validateSignedGridAdmissionEvent(gridEvent, gridPublicKey) {
  if (!gridEvent || typeof gridEvent !== 'object' || Array.isArray(gridEvent)) {
    throw new ValidationError('Circle authorized admission Grid event is invalid');
  }
  const actualKeys = Object.keys(gridEvent).filter(key => key !== 'payload').sort();
  const expectedKeys = [...EVENT_KEYS].sort();
  if (actualKeys.length !== expectedKeys.length || actualKeys.some((key, index) => key !== expectedKeys[index])) {
    throw new ValidationError('Circle authorized admission Grid event fields are invalid');
  }
  if (
    !Number.isSafeInteger(gridEvent.seq)
    || gridEvent.seq < 1
    || typeof gridEvent.event_id !== 'string'
    || typeof gridEvent.trace_id !== 'string'
    || typeof gridEvent.actor !== 'string'
    || typeof gridEvent.kind !== 'string'
    || typeof gridEvent.subject !== 'string'
    || !canonicalTimestamp(gridEvent.occurred_at)
    || !DIGEST.test(gridEvent.payload_digest ?? '')
    || !DIGEST.test(gridEvent.prev_hash ?? '')
    || !DIGEST.test(gridEvent.event_hash ?? '')
  ) throw new ValidationError('Circle authorized admission Grid event envelope is invalid');
  if (Object.hasOwn(gridEvent, 'payload') && digestObject(gridEvent.payload) !== gridEvent.payload_digest) {
    throw new AxiomError(
      'circle_authorized_admission_grid_event_invalid',
      'Circle authorized admission Grid event payload digest is invalid',
      503
    );
  }
  const expectedEventHash = digestObject({
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
  if (gridEvent.event_hash !== expectedEventHash) {
    throw new AxiomError(
      'circle_authorized_admission_grid_event_invalid',
      'Circle authorized admission Grid event hash does not match its envelope',
      503
    );
  }
  if (!gridPublicKey || !verifyObjectSignature({ event_hash: gridEvent.event_hash }, gridEvent.signature, gridPublicKey)) {
    throw new AxiomError(
      'circle_authorized_admission_grid_event_invalid',
      'Circle authorized admission Grid event signature is invalid',
      503
    );
  }
  return true;
}

function validateAdmissionEvent(rawEvent) {
  exactObject(rawEvent, 'Circle authorized Grid admission persistence event', [
    'event_id', 'kind', 'subject', 'payload'
  ]);
  return reconstructCircleGridPersistenceCandidate(rawEvent);
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
