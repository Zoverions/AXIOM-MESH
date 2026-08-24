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
import {
  reconstructCircleGridPersistenceCandidate
} from './circle-persistence-state.mjs';

const ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/;
const DIGEST = /^[a-f0-9]{64}$/;
const ADMISSION_SCOPE = 'grid-persistence-only';
const CLAIM_KEYS = Object.freeze([
  'iss', 'aud', 'subject', 'jti', 'nbf', 'exp',
  'intent_digest', 'plan_digest', 'policy_digest', 'invocation_digest',
  'tool', 'constraints'
]);
const CONSTRAINT_KEYS = Object.freeze([
  'schema', 'circle_id', 'event_id', 'binding_digest',
  'expected_prior_circle_head_digest', 'resulting_circle_head_digest',
  'payload_digest', 'persistence_policy_digest', 'admission_scope',
  'runtime_authority', 'portable_authority', 'external_effect_authority'
]);
const RECEIPT_STATEMENT_KEYS = Object.freeze([
  'schema', 'circle_id', 'event_id', 'binding_digest', 'actor',
  'admission_jti', 'capability_digest', 'claims_digest', 'admission_trace_id',
  'grid_seq', 'grid_event_hash', 'grid_payload_digest', 'admitted_at',
  'runtime_authority', 'portable_authority', 'external_effect_authority',
  'authority_effect', 'network_effect'
]);

const EXPECTED_REQUIREMENTS = Object.freeze({
  existing_hypervisor_identity_required: true,
  existing_capability_token_format_reused: true,
  issuer_must_be_hypervisor: true,
  audience_must_be_grid: true,
  subject_must_equal_append_actor: true,
  tool_must_be_exact: true,
  deterministic_jti_bound_to_actor_and_event: true,
  invocation_digest_bound_to_exact_event: true,
  constraints_exact_and_non_extensible: true,
  circle_id_bound: true,
  event_id_bound: true,
  binding_digest_bound: true,
  expected_prior_circle_head_bound: true,
  payload_digest_bound: true,
  persistence_policy_digest_bound: true,
  intent_plan_policy_digests_required: true,
  signed_grid_trace_binds_capability_digest: true,
  same_token_exact_replay_may_be_idempotent: true,
  different_token_replay_of_existing_event_rejected: true,
  same_event_different_actor_replay_rejected: true,
  separate_capability_consumption_event_required: false,
  request_replay_guard_counts_as_durable_admission: false,
  circle_role_proof: false,
  circle_decision_authority: false,
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
  'circle-membership-role',
  'circle-decision-validity',
  'historical-truth',
  'governance-legitimacy',
  'legal-authority',
  'execution-authority',
  'portable-authority',
  'external-effect-authority',
  'distributed-consensus'
]);

const policyUrl = new URL('../../config/circle-grid-admission.v0.json', import.meta.url);
const CIRCLE_GRID_ADMISSION_POLICY = deepFreeze(JSON.parse(readFileSync(policyUrl, 'utf8')));
validateCircleGridAdmissionPolicy(CIRCLE_GRID_ADMISSION_POLICY);

export function getCircleGridAdmissionPolicy() {
  return CIRCLE_GRID_ADMISSION_POLICY;
}

export function validateCircleGridAdmissionPolicy(policy) {
  exactObject(policy, 'Circle Grid admission policy', [
    'schema', 'version', 'status', 'runtime_activation', 'authority_effect',
    'network_effect', 'issuer_service', 'audience', 'tool',
    'absolute_ttl_ceiling_seconds', 'requirements', 'constraints_schema',
    'receipt_schema', 'non_claims'
  ]);
  if (
    policy.schema !== 'axiom-circle-grid-admission-policy.v0'
    || policy.version !== 0
    || policy.status !== 'internal-authenticated-admission-candidate'
    || policy.runtime_activation !== false
    || policy.authority_effect !== 'none'
    || policy.network_effect !== 'none'
    || policy.issuer_service !== 'hypervisor'
    || policy.audience !== 'grid'
    || policy.tool !== 'circle.persistence.append'
    || policy.absolute_ttl_ceiling_seconds !== 300
    || policy.constraints_schema !== 'axiom-circle-grid-admission-constraints.v0'
    || policy.receipt_schema !== 'axiom-circle-grid-admission-receipt.v0'
  ) {
    throw new ValidationError('Circle Grid admission activation boundary is invalid');
  }
  exactObject(
    policy.requirements,
    'Circle Grid admission requirements',
    Object.keys(EXPECTED_REQUIREMENTS)
  );
  for (const [key, expected] of Object.entries(EXPECTED_REQUIREMENTS)) {
    if (policy.requirements[key] !== expected) {
      throw new ValidationError(`Circle Grid admission requirement ${key} was weakened`);
    }
  }
  exactSet(policy.non_claims, EXPECTED_NON_CLAIMS, 'Circle Grid admission non-claims');
  return true;
}

export function deriveCircleGridAdmissionInvocationDigest(actor, rawEvent) {
  const principal = requiredId(actor, 'Circle Grid admission actor');
  const candidate = validateAdmissionEvent(rawEvent);
  return digestObject({
    schema: 'axiom-circle-grid-admission-invocation.v0',
    actor: principal,
    event: candidate.event
  });
}

export function deriveCircleGridAdmissionJti(actor, rawEvent) {
  const invocationDigest = deriveCircleGridAdmissionInvocationDigest(actor, rawEvent);
  return `circle_admit_${digestObject({
    schema: 'axiom-circle-grid-admission-jti.v0',
    actor,
    event_id: rawEvent.event_id,
    invocation_digest: invocationDigest
  })}`;
}

export function deriveCircleGridAdmissionTraceId(capability) {
  return `circle_cap_${sha256(String(capability))}`;
}

export function issueCircleGridAdmissionCapability(identity, {
  actor,
  event,
  intentDigest,
  planDigest,
  policyDigest,
  nowSeconds = Math.floor(Date.now() / 1000),
  ttlSeconds = 30
}) {
  validateCircleGridAdmissionPolicy(CIRCLE_GRID_ADMISSION_POLICY);
  if (!identity || identity.service !== CIRCLE_GRID_ADMISSION_POLICY.issuer_service) {
    throw new ValidationError('Circle Grid admission capability must be issued by Hypervisor identity');
  }
  if (
    !Number.isSafeInteger(nowSeconds)
    || !Number.isSafeInteger(ttlSeconds)
    || ttlSeconds < 1
    || ttlSeconds > CIRCLE_GRID_ADMISSION_POLICY.absolute_ttl_ceiling_seconds
  ) {
    throw new ValidationError('Circle Grid admission capability lifetime is invalid');
  }
  const principal = requiredId(actor, 'Circle Grid admission actor');
  const candidate = validateAdmissionEvent(event);
  const claims = deepFreeze({
    iss: CIRCLE_GRID_ADMISSION_POLICY.issuer_service,
    aud: CIRCLE_GRID_ADMISSION_POLICY.audience,
    subject: principal,
    jti: deriveCircleGridAdmissionJti(principal, candidate.event),
    nbf: nowSeconds,
    exp: nowSeconds + ttlSeconds,
    intent_digest: requiredDigest(intentDigest, 'Circle Grid admission intent digest'),
    plan_digest: requiredDigest(planDigest, 'Circle Grid admission plan digest'),
    policy_digest: requiredDigest(policyDigest, 'Circle Grid admission policy digest'),
    invocation_digest: deriveCircleGridAdmissionInvocationDigest(principal, candidate.event),
    tool: CIRCLE_GRID_ADMISSION_POLICY.tool,
    constraints: buildAdmissionConstraints(candidate)
  });
  return Object.freeze({
    capability: issueCapability(identity, claims),
    claims
  });
}

export function verifyCircleGridAdmissionCapability(capability, hypervisorPublicKey, {
  actor,
  event,
  nowSeconds = Math.floor(Date.now() / 1000),
  maxTtlSeconds = 30
}) {
  validateCircleGridAdmissionPolicy(CIRCLE_GRID_ADMISSION_POLICY);
  if (!hypervisorPublicKey) {
    throw new ValidationError('Trusted Hypervisor public key is required for Circle Grid admission');
  }
  if (
    !Number.isSafeInteger(maxTtlSeconds)
    || maxTtlSeconds < 1
    || maxTtlSeconds > CIRCLE_GRID_ADMISSION_POLICY.absolute_ttl_ceiling_seconds
  ) {
    throw new ValidationError('Circle Grid admission local TTL limit is invalid');
  }
  const principal = requiredId(actor, 'Circle Grid admission actor');
  const candidate = validateAdmissionEvent(event);
  const claims = verifyCapability(capability, hypervisorPublicKey, {
    audience: CIRCLE_GRID_ADMISSION_POLICY.audience,
    issuer: CIRCLE_GRID_ADMISSION_POLICY.issuer_service,
    nowSeconds,
    maxTtlSeconds
  });
  exactObject(claims, 'Circle Grid admission capability claims', CLAIM_KEYS);
  if (
    claims.subject !== principal
    || claims.tool !== CIRCLE_GRID_ADMISSION_POLICY.tool
    || claims.jti !== deriveCircleGridAdmissionJti(principal, candidate.event)
    || claims.invocation_digest !== deriveCircleGridAdmissionInvocationDigest(principal, candidate.event)
  ) {
    throw new AxiomError(
      'circle_persistence_admission_mismatch',
      'Circle Grid admission capability is not bound to this actor and exact persistence event',
      403
    );
  }
  requiredDigest(claims.intent_digest, 'Circle Grid admission intent digest');
  requiredDigest(claims.plan_digest, 'Circle Grid admission plan digest');
  requiredDigest(claims.policy_digest, 'Circle Grid admission policy digest');
  validateAdmissionConstraints(claims.constraints, candidate);
  return deepFreeze({ claims: structuredClone(claims), candidate });
}

export function commitCirclePersistenceWithAdmission({
  store,
  hypervisorPublicKey,
  capability,
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
  ) {
    throw new ValidationError('CircleGridStore-compatible store with Grid identity is required');
  }
  const verified = verifyCircleGridAdmissionCapability(capability, hypervisorPublicKey, {
    actor,
    event,
    nowSeconds,
    maxTtlSeconds
  });
  const traceId = deriveCircleGridAdmissionTraceId(capability);
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
      'circle_persistence_admission_replay_mismatch',
      'Existing Circle persistence event was admitted under a different actor or capability',
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
    gridEvent
  });
  return Object.freeze({
    event: gridEvent,
    receipt: receipt.receipt,
    receipt_digest: receipt.receipt_digest
  });
}

export function verifyCircleGridAdmissionReceipt(receiptInput, {
  gridPublicKey,
  hypervisorPublicKey,
  capability,
  actor,
  event,
  gridEvent,
  chainVerification,
  maxTtlSeconds = 30
}) {
  const receipt = exactObject(
    receiptInput,
    'Circle Grid admission receipt',
    ['statement', 'signature']
  );
  const statement = normalizeReceiptStatement(receipt.statement);
  if (!gridPublicKey || !verifyObjectSignature(statement, receipt.signature, gridPublicKey)) {
    throw new AxiomError(
      'invalid_circle_persistence_admission_receipt',
      'Circle Grid admission receipt signature is invalid',
      401
    );
  }
  const admittedAtMs = Date.parse(statement.admitted_at);
  if (!Number.isFinite(admittedAtMs)) {
    throw new ValidationError('Circle Grid admission receipt time is invalid');
  }
  const verified = verifyCircleGridAdmissionCapability(capability, hypervisorPublicKey, {
    actor,
    event,
    nowSeconds: Math.floor(admittedAtMs / 1000),
    maxTtlSeconds
  });
  const traceId = deriveCircleGridAdmissionTraceId(capability);
  if (
    !gridEvent
    || typeof gridEvent !== 'object'
    || gridEvent.event_id !== verified.candidate.event.event_id
    || gridEvent.actor !== actor
    || gridEvent.trace_id !== traceId
    || gridEvent.payload_digest !== verified.candidate.payload_digest
    || gridEvent.event_hash !== statement.grid_event_hash
    || gridEvent.seq !== statement.grid_seq
    || gridEvent.occurred_at !== statement.admitted_at
  ) {
    throw new AxiomError(
      'circle_persistence_admission_receipt_mismatch',
      'Circle Grid admission receipt does not match the signed Grid event',
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
  ) {
    throw new ValidationError(
      'Circle Grid admission receipt verification requires Grid chain verification covering the event'
    );
  }
  const expectedStatement = buildReceiptStatement({
    capability,
    claims: verified.claims,
    candidate: verified.candidate,
    gridEvent
  });
  if (digestObject(statement) !== digestObject(expectedStatement)) {
    throw new AxiomError(
      'circle_persistence_admission_receipt_mismatch',
      'Circle Grid admission receipt does not match this capability and event',
      403
    );
  }
  return Object.freeze({
    receipt: Object.freeze({
      statement,
      signature: structuredClone(receipt.signature)
    }),
    receipt_digest: digestObject({ statement, signature: receipt.signature }),
    chain_verified: true,
    runtime_authority: false,
    portable_authority: false,
    external_effect_authority: false
  });
}

function buildAdmissionConstraints(candidate) {
  return deepFreeze({
    schema: CIRCLE_GRID_ADMISSION_POLICY.constraints_schema,
    circle_id: candidate.circle_id,
    event_id: candidate.event.event_id,
    binding_digest: candidate.binding_digest,
    expected_prior_circle_head_digest: candidate.expected_prior_circle_head_digest,
    resulting_circle_head_digest: candidate.resulting_circle_head_digest,
    payload_digest: candidate.payload_digest,
    persistence_policy_digest: candidate.policy_digest,
    admission_scope: ADMISSION_SCOPE,
    runtime_authority: false,
    portable_authority: false,
    external_effect_authority: false
  });
}

function validateAdmissionConstraints(constraints, candidate) {
  exactObject(constraints, 'Circle Grid admission constraints', CONSTRAINT_KEYS);
  const expected = buildAdmissionConstraints(candidate);
  for (const key of CONSTRAINT_KEYS) {
    if (constraints[key] !== expected[key]) {
      throw new AxiomError(
        'circle_persistence_admission_constraint_mismatch',
        `Circle Grid admission constraint ${key} does not match the exact persistence event`,
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
  return Object.freeze({
    receipt,
    receipt_digest: digestObject(receipt)
  });
}

function buildReceiptStatement({ capability, claims, candidate, gridEvent }) {
  return deepFreeze({
    schema: CIRCLE_GRID_ADMISSION_POLICY.receipt_schema,
    circle_id: candidate.circle_id,
    event_id: candidate.event.event_id,
    binding_digest: candidate.binding_digest,
    actor: claims.subject,
    admission_jti: claims.jti,
    capability_digest: sha256(String(capability)),
    claims_digest: digestObject(claims),
    admission_trace_id: deriveCircleGridAdmissionTraceId(capability),
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
  exactObject(value, 'Circle Grid admission receipt statement', RECEIPT_STATEMENT_KEYS);
  if (
    value.schema !== CIRCLE_GRID_ADMISSION_POLICY.receipt_schema
    || !ID.test(value.circle_id ?? '')
    || !ID.test(value.event_id ?? '')
    || !DIGEST.test(value.binding_digest ?? '')
    || !ID.test(value.actor ?? '')
    || !ID.test(value.admission_jti ?? '')
    || !DIGEST.test(value.capability_digest ?? '')
    || !DIGEST.test(value.claims_digest ?? '')
    || !ID.test(value.admission_trace_id ?? '')
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
  ) {
    throw new ValidationError('Circle Grid admission receipt statement is invalid');
  }
  return deepFreeze(structuredClone(value));
}

function validateAdmissionEvent(rawEvent) {
  exactObject(rawEvent, 'Circle Grid admission persistence event', [
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
  if (
    actual.length !== expected.length
    || actual.some((key, index) => key !== expected[index])
  ) {
    throw new ValidationError(`${label} fields are invalid`);
  }
  return value;
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}
