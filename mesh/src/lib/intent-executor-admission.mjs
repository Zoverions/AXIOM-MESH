import {
  ValidationError,
  assertPlainObject,
  assertString,
  canonicalJson,
  digestObject
} from './canonical.mjs';
import { effectDestinationForTool } from './effect-destination.mjs';
import { verifyObjectSignature } from './identity.mjs';
import {
  INTENT_EXECUTOR_REGISTRY_SCHEMA,
  normalizeIntentExecutorRegistry
} from './intent-execution-eligibility.mjs';

export const INTENT_EXECUTOR_ADMISSION_DOSSIER_SCHEMA = 'axiom-intent-executor-admission-dossier.v1';
export const INTENT_EXECUTOR_REVIEW_SCHEMA = 'axiom-intent-executor-review-attestation.v1';
export const INTENT_EXECUTOR_PROMOTION_SCHEMA = 'axiom-intent-executor-promotion-candidate.v1';

const ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/;
const DIGEST = /^[a-f0-9]{64}$/;
const SCOPE = /^[A-Za-z0-9*][A-Za-z0-9_.:*-]{0,159}$/;
const MAX_DOSSIER_LIFETIME_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_REVIEW_LIFETIME_MS = 48 * 60 * 60 * 1000;
const REVIEW_ROLES = new Set(['security_authority', 'implementation_conformance']);
const REQUIRED_REVIEW_ROLES = ['implementation_conformance', 'security_authority'];
const REQUIRED_EVIDENCE = [
  'confirmation_gates_preserved',
  'independent_approval_preserved',
  'missing_scope_denied',
  'policy_denial_dominates',
  'privacy_redacted',
  'real_stack_non_execution',
  'replay_detected',
  'stale_state_rejected'
];
const RESERVED_SEMANTIC_PREFIXES = [
  'intent.executor.',
  'intent.registry.',
  'policy.',
  'capability.',
  'registry.'
];
const RESERVED_TARGET_PREFIXES = [
  'approval.',
  'governance.',
  'policy.',
  'capability.',
  'intent.executor.',
  'intent.registry.'
];
const RESERVED_CONSTRAINT_KEYS = new Set([
  'decision',
  'risk',
  'required_scopes',
  'required_confirmations',
  'required_confirmation_values',
  'requires_independent_approval',
  'timeout_ms',
  'tool',
  'target_action',
  'policy_override',
  'capability_override',
  'registry_override'
]);

function assertDigest(value, name) {
  return assertString(value, name, { min: 64, max: 64, pattern: DIGEST });
}

function canonicalObject(value, name) {
  return JSON.parse(canonicalJson(assertPlainObject(value, name)));
}

function sortedStrings(value, name, pattern = ID) {
  if (!Array.isArray(value) || value.length > 256) {
    throw new ValidationError(`${name} must be an array with at most 256 items`);
  }
  return [...new Set(value.map((item, index) => assertString(
    item,
    `${name}[${index}]`,
    { max: 160, pattern }
  )))].sort();
}

function isoDate(value, name) {
  const raw = assertString(value, name, { max: 64 });
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.valueOf())) throw new ValidationError(`${name} must be an ISO timestamp`);
  return parsed.toISOString();
}

function boundedWindow(startRaw, endRaw, maxLifetimeMs, label) {
  const start = isoDate(startRaw, `${label}.start`);
  const end = isoDate(endRaw, `${label}.end`);
  const startMs = new Date(start).valueOf();
  const endMs = new Date(end).valueOf();
  if (endMs <= startMs || endMs - startMs > maxLifetimeMs) {
    throw new ValidationError(`${label} lifetime is invalid or exceeds the allowed maximum`);
  }
  return { start, end };
}

function normalizeBuild(raw) {
  const value = assertPlainObject(raw, 'build');
  const base = {
    kernel_version: assertString(value.kernel_version, 'build.kernel_version', { max: 64 }),
    source_digest: assertDigest(value.source_digest, 'build.source_digest')
  };
  const buildDigest = digestObject(base);
  if (value.build_digest !== undefined && assertDigest(value.build_digest, 'build.build_digest') !== buildDigest) {
    throw new ValidationError('build.build_digest does not match the exact build binding');
  }
  return { ...base, build_digest: buildDigest };
}

function normalizePolicy(raw) {
  const value = assertPlainObject(raw, 'policy');
  if (typeof value.version !== 'string' || !value.actions || typeof value.actions !== 'object') {
    throw new ValidationError('policy must contain version and actions');
  }
  return { value, digest: digestObject(value) };
}

function normalizeCapabilities(raw) {
  const value = assertPlainObject(raw, 'capability registry');
  if (value.schema !== 'axiom-capabilities.v1' || !Array.isArray(value.capabilities)) {
    throw new ValidationError('capability registry must use axiom-capabilities.v1 with capabilities');
  }
  const items = value.capabilities.map((rawCapability, index) => {
    const item = assertPlainObject(rawCapability, `capabilities[${index}]`);
    return {
      id: assertString(item.id, `capabilities[${index}].id`, { max: 160, pattern: ID }),
      status: assertString(item.status, `capabilities[${index}].status`, { max: 64 })
    };
  });
  return { value, digest: digestObject(value), items };
}

function normalizeContext(raw) {
  const value = assertPlainObject(raw, 'executor admission current context');
  return {
    registry: normalizeIntentExecutorRegistry(value.executor_registry),
    policy: normalizePolicy(value.policy),
    capabilities: normalizeCapabilities(value.capabilities),
    build: normalizeBuild(value.build)
  };
}

function normalizeCandidateMapping(raw, kernelVersion) {
  const registry = normalizeIntentExecutorRegistry({
    schema: INTENT_EXECUTOR_REGISTRY_SCHEMA,
    kernel_version: kernelVersion,
    mappings: [raw]
  });
  const mapping = registry.mappings[0];
  if (!mapping || mapping.fixed_input === null) {
    throw new ValidationError('executor admission requires exact fixed input in v0.7');
  }
  if (RESERVED_SEMANTIC_PREFIXES.some(prefix => mapping.semantic_action.startsWith(prefix))) {
    throw new ValidationError('executor admission forbids self-modifying or authority-registry semantic actions');
  }
  if (RESERVED_TARGET_PREFIXES.some(prefix => mapping.target_action.startsWith(prefix))) {
    throw new ValidationError('executor admission forbids authority-control target actions');
  }
  const forbiddenConstraint = Object.keys(mapping.constraints)
    .find(key => RESERVED_CONSTRAINT_KEYS.has(key));
  if (forbiddenConstraint) {
    throw new ValidationError(`executor mapping constraints cannot override authority field ${forbiddenConstraint}`);
  }
  return mapping;
}

function deriveFacts(mapping, context) {
  if (context.registry.mappings.some(item => item.semantic_action === mapping.semantic_action)) {
    throw new ValidationError('executor admission candidate semantic action already exists in the current registry');
  }
  const rule = Object.hasOwn(context.policy.value.actions, mapping.target_action)
    ? context.policy.value.actions[mapping.target_action]
    : null;
  if (!rule) throw new ValidationError('executor admission target action does not exist in current policy');
  if (rule.decision !== 'allow') {
    throw new ValidationError('executor admission target action is denied by current policy');
  }
  if (rule.tool !== mapping.tool) {
    throw new ValidationError('executor admission target action/tool binding does not match current policy');
  }
  const capability = context.capabilities.items.find(item => item.id === mapping.capability_id);
  if (!capability || capability.status !== 'implemented') {
    throw new ValidationError('executor admission capability is not currently implemented');
  }
  const requiredScopes = sortedStrings(rule.required_scopes ?? [], 'policy.required_scopes', SCOPE);
  const confirmationValues = sortedStrings(
    rule.required_confirmation_values ?? [],
    'policy.required_confirmation_values',
    SCOPE
  );
  const policyGates = {
    risk: assertString(rule.risk, 'policy.risk', { max: 32 }),
    required_scopes: requiredScopes,
    required_confirmations: Number(rule.required_confirmations ?? 0),
    required_confirmation_values: confirmationValues,
    requires_independent_approval: rule.requires_independent_approval === true,
    constraints: canonicalObject(rule.constraints ?? {}, 'policy.constraints'),
    timeout_ms: Number(rule.timeout_ms ?? 10_000)
  };
  if (!Number.isSafeInteger(policyGates.required_confirmations) || policyGates.required_confirmations < 0) {
    throw new ValidationError('policy required_confirmations is invalid');
  }
  if (!Number.isSafeInteger(policyGates.timeout_ms) || policyGates.timeout_ms <= 0) {
    throw new ValidationError('policy timeout_ms is invalid');
  }
  return {
    effect_destination: effectDestinationForTool(mapping.tool),
    fixed_input_digest: digestObject(mapping.fixed_input),
    policy_gates: policyGates,
    mapping_constraints_mode: 'additive_only'
  };
}

function normalizeEvidence(raw) {
  if (!Array.isArray(raw) || raw.length !== REQUIRED_EVIDENCE.length) {
    throw new ValidationError(`executor admission evidence must contain exactly ${REQUIRED_EVIDENCE.length} required assertions`);
  }
  const entries = raw.map((rawEntry, index) => {
    const entry = assertPlainObject(rawEntry, `evidence[${index}]`);
    const assertion = assertString(entry.assertion, `evidence[${index}].assertion`, {
      max: 96,
      pattern: /^[a-z][a-z0-9_]{1,95}$/
    });
    if (!REQUIRED_EVIDENCE.includes(assertion)) {
      throw new ValidationError(`unsupported executor admission evidence assertion: ${assertion}`);
    }
    if (entry.result !== 'pass') {
      throw new ValidationError(`executor admission evidence ${assertion} must report pass`);
    }
    const output = {
      assertion,
      result: 'pass',
      artifact_digest: assertDigest(entry.artifact_digest, `evidence[${index}].artifact_digest`)
    };
    if (entry.artifact_type !== undefined) {
      output.artifact_type = assertString(entry.artifact_type, `evidence[${index}].artifact_type`, {
        max: 128,
        pattern: /^[a-z][a-z0-9._:-]*$/
      });
    }
    if (entry.ref !== undefined) {
      output.ref = assertString(entry.ref, `evidence[${index}].ref`, { max: 512 });
    }
    return output;
  });
  const assertions = entries.map(item => item.assertion);
  if (new Set(assertions).size !== REQUIRED_EVIDENCE.length) {
    throw new ValidationError('executor admission evidence assertions must be unique');
  }
  for (const required of REQUIRED_EVIDENCE) {
    if (!assertions.includes(required)) {
      throw new ValidationError(`executor admission evidence is missing ${required}`);
    }
  }
  return entries.sort((left, right) => left.assertion.localeCompare(right.assertion));
}

function contentAddress(body, prefix, digestField, idField) {
  const digest = digestObject(body);
  return {
    ...body,
    [idField]: `${prefix}:${digest}`,
    [digestField]: digest
  };
}

export function buildIntentExecutorAdmissionDossier({
  candidate_mapping,
  current_context,
  evidence,
  producer,
  created_at,
  expires_at
}) {
  const context = normalizeContext(current_context);
  const mapping = normalizeCandidateMapping(candidate_mapping, context.registry.kernel_version);
  const facts = deriveFacts(mapping, context);
  const window = boundedWindow(created_at, expires_at, MAX_DOSSIER_LIFETIME_MS, 'dossier');
  const body = {
    schema: INTENT_EXECUTOR_ADMISSION_DOSSIER_SCHEMA,
    mapping,
    mapping_digest: mapping.mapping_digest,
    base_executor_registry_digest: context.registry.registry_digest,
    policy_digest: context.policy.digest,
    capability_registry_digest: context.capabilities.digest,
    build: context.build,
    effect_destination: facts.effect_destination,
    fixed_input_digest: facts.fixed_input_digest,
    policy_gates: facts.policy_gates,
    mapping_constraints_mode: facts.mapping_constraints_mode,
    evidence: normalizeEvidence(evidence),
    producer: assertString(producer, 'producer', { max: 160, pattern: ID }),
    created_at: window.start,
    expires_at: window.end,
    mapping_installed: false,
    execution_authorized: false,
    non_claim: 'This dossier is admission evidence only. It does not install an executor mapping or authorize an effect.'
  };
  return contentAddress(
    body,
    'intent-executor-dossier',
    'dossier_digest',
    'dossier_id'
  );
}

export function normalizeIntentExecutorAdmissionDossier(raw) {
  const value = assertPlainObject(raw, 'Intent executor admission dossier');
  if (value.schema !== INTENT_EXECUTOR_ADMISSION_DOSSIER_SCHEMA) {
    throw new ValidationError(`dossier schema must be ${INTENT_EXECUTOR_ADMISSION_DOSSIER_SCHEMA}`);
  }
  if (value.mapping_installed !== false || value.execution_authorized !== false) {
    throw new ValidationError('executor admission dossier must remain non-installing and non-executing');
  }
  const build = normalizeBuild(value.build);
  const mapping = normalizeCandidateMapping(value.mapping, build.kernel_version);
  const window = boundedWindow(value.created_at, value.expires_at, MAX_DOSSIER_LIFETIME_MS, 'dossier');
  const body = {
    schema: INTENT_EXECUTOR_ADMISSION_DOSSIER_SCHEMA,
    mapping,
    mapping_digest: assertDigest(value.mapping_digest, 'mapping_digest'),
    base_executor_registry_digest: assertDigest(value.base_executor_registry_digest, 'base_executor_registry_digest'),
    policy_digest: assertDigest(value.policy_digest, 'policy_digest'),
    capability_registry_digest: assertDigest(value.capability_registry_digest, 'capability_registry_digest'),
    build,
    effect_destination: assertString(value.effect_destination, 'effect_destination', { max: 160 }),
    fixed_input_digest: assertDigest(value.fixed_input_digest, 'fixed_input_digest'),
    policy_gates: canonicalObject(value.policy_gates, 'policy_gates'),
    mapping_constraints_mode: assertString(value.mapping_constraints_mode, 'mapping_constraints_mode', { max: 64 }),
    evidence: normalizeEvidence(value.evidence),
    producer: assertString(value.producer, 'producer', { max: 160, pattern: ID }),
    created_at: window.start,
    expires_at: window.end,
    mapping_installed: false,
    execution_authorized: false,
    non_claim: assertString(value.non_claim, 'non_claim', { max: 512 })
  };
  if (body.mapping_digest !== mapping.mapping_digest) {
    throw new ValidationError('dossier mapping digest does not match normalized mapping');
  }
  if (body.fixed_input_digest !== digestObject(mapping.fixed_input)) {
    throw new ValidationError('dossier fixed input digest does not match normalized mapping input');
  }
  const expected = contentAddress(body, 'intent-executor-dossier', 'dossier_digest', 'dossier_id');
  if (
    value.dossier_digest !== expected.dossier_digest
    || value.dossier_id !== expected.dossier_id
  ) {
    throw new ValidationError('executor admission dossier is not content-addressed');
  }
  return expected;
}

export function validateIntentExecutorAdmissionDossierCurrent(rawDossier, rawCurrentContext, {
  now = new Date().toISOString()
} = {}) {
  const dossier = normalizeIntentExecutorAdmissionDossier(rawDossier);
  const context = normalizeContext(rawCurrentContext);
  const nowMs = new Date(isoDate(now, 'now')).valueOf();
  if (new Date(dossier.expires_at).valueOf() <= nowMs) {
    throw new ValidationError('executor admission dossier is expired');
  }
  if (
    dossier.base_executor_registry_digest !== context.registry.registry_digest
    || dossier.policy_digest !== context.policy.digest
    || dossier.capability_registry_digest !== context.capabilities.digest
    || dossier.build.build_digest !== context.build.build_digest
  ) {
    throw new ValidationError('executor admission dossier is stale against current registry/policy/capability/build state');
  }
  const mapping = normalizeCandidateMapping(dossier.mapping, context.registry.kernel_version);
  const facts = deriveFacts(mapping, context);
  if (
    dossier.effect_destination !== facts.effect_destination
    || dossier.fixed_input_digest !== facts.fixed_input_digest
    || dossier.mapping_constraints_mode !== facts.mapping_constraints_mode
    || canonicalJson(dossier.policy_gates) !== canonicalJson(facts.policy_gates)
  ) {
    throw new ValidationError('executor admission dossier authority facts do not match current state');
  }
  return dossier;
}

function reviewBodyFrom(raw) {
  const value = assertPlainObject(raw, 'Intent executor review attestation');
  const role = assertString(value.review_role, 'review_role', { max: 64 });
  if (!REVIEW_ROLES.has(role)) throw new ValidationError('executor review role is invalid');
  const window = boundedWindow(value.reviewed_at, value.expires_at, MAX_REVIEW_LIFETIME_MS, 'review');
  return {
    schema: INTENT_EXECUTOR_REVIEW_SCHEMA,
    dossier_id: assertString(value.dossier_id, 'dossier_id', { max: 192 }),
    dossier_digest: assertDigest(value.dossier_digest, 'dossier_digest'),
    mapping_digest: assertDigest(value.mapping_digest, 'mapping_digest'),
    reviewer: assertString(value.reviewer, 'reviewer', { max: 160, pattern: ID }),
    review_role: role,
    verdict: value.verdict === 'approve'
      ? 'approve'
      : (() => { throw new ValidationError('executor promotion review verdict must be approve'); })(),
    reviewed_at: window.start,
    expires_at: window.end,
    base_executor_registry_digest: assertDigest(value.base_executor_registry_digest, 'base_executor_registry_digest'),
    policy_digest: assertDigest(value.policy_digest, 'policy_digest'),
    capability_registry_digest: assertDigest(value.capability_registry_digest, 'capability_registry_digest'),
    build_digest: assertDigest(value.build_digest, 'build_digest'),
    mapping_installed: false,
    execution_authorized: false
  };
}

export function buildIntentExecutorReviewAttestation(rawDossier, {
  identity,
  reviewer = identity?.service,
  review_role,
  reviewed_at,
  expires_at
}) {
  const dossier = normalizeIntentExecutorAdmissionDossier(rawDossier);
  if (!identity || typeof identity.signObject !== 'function' || typeof identity.service !== 'string') {
    throw new ValidationError('executor review requires an AXIOM signing identity');
  }
  if (reviewer !== identity.service) {
    throw new ValidationError('executor reviewer must match the signing identity service');
  }
  if (reviewer === dossier.producer) {
    throw new ValidationError('executor dossier producer cannot review its own dossier');
  }
  const body = reviewBodyFrom({
    schema: INTENT_EXECUTOR_REVIEW_SCHEMA,
    dossier_id: dossier.dossier_id,
    dossier_digest: dossier.dossier_digest,
    mapping_digest: dossier.mapping_digest,
    reviewer,
    review_role,
    verdict: 'approve',
    reviewed_at,
    expires_at,
    base_executor_registry_digest: dossier.base_executor_registry_digest,
    policy_digest: dossier.policy_digest,
    capability_registry_digest: dossier.capability_registry_digest,
    build_digest: dossier.build.build_digest
  });
  const signature = identity.signObject(body);
  const reviewDigest = digestObject({ body, signature });
  return {
    ...body,
    signature,
    review_id: `intent-executor-review:${reviewDigest}`,
    review_digest: reviewDigest
  };
}

export function verifyIntentExecutorReviewAttestation(rawReview, rawDossier, {
  public_key,
  now = new Date().toISOString()
}) {
  const dossier = normalizeIntentExecutorAdmissionDossier(rawDossier);
  const value = assertPlainObject(rawReview, 'Intent executor review attestation');
  if (value.schema !== INTENT_EXECUTOR_REVIEW_SCHEMA) {
    throw new ValidationError(`executor review schema must be ${INTENT_EXECUTOR_REVIEW_SCHEMA}`);
  }
  if (value.mapping_installed !== false || value.execution_authorized !== false) {
    throw new ValidationError('executor review must remain non-installing and non-executing');
  }
  const body = reviewBodyFrom(value);
  const signature = canonicalObject(value.signature, 'signature');
  const expectedDigest = digestObject({ body, signature });
  if (
    value.review_digest !== expectedDigest
    || value.review_id !== `intent-executor-review:${expectedDigest}`
  ) {
    throw new ValidationError('executor review attestation is not content-addressed');
  }
  if (
    body.dossier_id !== dossier.dossier_id
    || body.dossier_digest !== dossier.dossier_digest
    || body.mapping_digest !== dossier.mapping_digest
    || body.base_executor_registry_digest !== dossier.base_executor_registry_digest
    || body.policy_digest !== dossier.policy_digest
    || body.capability_registry_digest !== dossier.capability_registry_digest
    || body.build_digest !== dossier.build.build_digest
  ) {
    throw new ValidationError('executor review attestation is not bound to the exact dossier state');
  }
  if (body.reviewer === dossier.producer) {
    throw new ValidationError('executor dossier producer cannot review its own dossier');
  }
  const nowMs = new Date(isoDate(now, 'now')).valueOf();
  if (new Date(body.expires_at).valueOf() <= nowMs) {
    throw new ValidationError('executor review attestation is expired');
  }
  if (new Date(body.reviewed_at).valueOf() > nowMs + 5 * 60 * 1000) {
    throw new ValidationError('executor review attestation is from the future');
  }
  if (!signature.key_id?.startsWith(`${body.reviewer}:`)) {
    throw new ValidationError('executor review key id does not match reviewer identity');
  }
  if (!public_key || !verifyObjectSignature(body, signature, public_key)) {
    throw new ValidationError('executor review signature is invalid');
  }
  return {
    ...body,
    signature,
    review_id: value.review_id,
    review_digest: value.review_digest
  };
}

export function buildIntentExecutorPromotionCandidate({
  dossier: rawDossier,
  reviews,
  current_context,
  now = new Date().toISOString()
}) {
  const dossier = validateIntentExecutorAdmissionDossierCurrent(
    rawDossier,
    current_context,
    { now }
  );
  if (!Array.isArray(reviews) || reviews.length !== 2) {
    throw new ValidationError('executor promotion candidate requires exactly two independent reviews');
  }
  const verified = reviews.map((entry, index) => {
    const item = assertPlainObject(entry, `reviews[${index}]`);
    return verifyIntentExecutorReviewAttestation(item.review, dossier, {
      public_key: item.public_key,
      now
    });
  });
  const reviewers = verified.map(item => item.reviewer);
  if (new Set(reviewers).size !== verified.length) {
    throw new ValidationError('executor promotion reviewers must be distinct identities');
  }
  if (reviewers.includes(dossier.producer)) {
    throw new ValidationError('executor dossier producer cannot satisfy a promotion review role');
  }
  const roles = [...new Set(verified.map(item => item.review_role))].sort();
  if (canonicalJson(roles) !== canonicalJson(REQUIRED_REVIEW_ROLES)) {
    throw new ValidationError('executor promotion requires security_authority and implementation_conformance reviews');
  }
  const reviewBindings = verified
    .map(item => ({
      review_id: item.review_id,
      review_digest: item.review_digest,
      reviewer: item.reviewer,
      review_role: item.review_role,
      expires_at: item.expires_at
    }))
    .sort((left, right) => left.review_role.localeCompare(right.review_role));
  const body = {
    schema: INTENT_EXECUTOR_PROMOTION_SCHEMA,
    dossier_id: dossier.dossier_id,
    dossier_digest: dossier.dossier_digest,
    mapping: dossier.mapping,
    mapping_digest: dossier.mapping_digest,
    expected_executor_registry_digest: dossier.base_executor_registry_digest,
    policy_digest: dossier.policy_digest,
    capability_registry_digest: dossier.capability_registry_digest,
    build_digest: dossier.build.build_digest,
    reviews: reviewBindings,
    mapping_installed: false,
    execution_authorized: false,
    installation_authority: null,
    non_claim: 'This reviewed promotion candidate does not install a mapping, grant a capability, or authorize an effect.'
  };
  return contentAddress(
    body,
    'intent-executor-promotion',
    'promotion_digest',
    'promotion_id'
  );
}

export function normalizeIntentExecutorPromotionCandidate(raw) {
  const value = assertPlainObject(raw, 'Intent executor promotion candidate');
  if (value.schema !== INTENT_EXECUTOR_PROMOTION_SCHEMA) {
    throw new ValidationError(`promotion candidate schema must be ${INTENT_EXECUTOR_PROMOTION_SCHEMA}`);
  }
  if (
    value.mapping_installed !== false
    || value.execution_authorized !== false
    || value.installation_authority !== null
  ) {
    throw new ValidationError('executor promotion candidate must remain non-installing and non-executing');
  }
  if (!Array.isArray(value.reviews) || value.reviews.length !== 2) {
    throw new ValidationError('executor promotion candidate must bind exactly two reviews');
  }
  const mapping = normalizeCandidateMapping(
    value.mapping,
    assertString(value.mapping?.kernel_version ?? '0.12.0-dev.3', 'mapping kernel compatibility', { max: 64 })
  );
  const reviews = value.reviews.map((rawReview, index) => {
    const review = assertPlainObject(rawReview, `promotion.reviews[${index}]`);
    return {
      review_id: assertString(review.review_id, `promotion.reviews[${index}].review_id`, { max: 192 }),
      review_digest: assertDigest(review.review_digest, `promotion.reviews[${index}].review_digest`),
      reviewer: assertString(review.reviewer, `promotion.reviews[${index}].reviewer`, { max: 160, pattern: ID }),
      review_role: assertString(review.review_role, `promotion.reviews[${index}].review_role`, { max: 64 }),
      expires_at: isoDate(review.expires_at, `promotion.reviews[${index}].expires_at`)
    };
  }).sort((left, right) => left.review_role.localeCompare(right.review_role));
  const body = {
    schema: INTENT_EXECUTOR_PROMOTION_SCHEMA,
    dossier_id: assertString(value.dossier_id, 'dossier_id', { max: 192 }),
    dossier_digest: assertDigest(value.dossier_digest, 'dossier_digest'),
    mapping,
    mapping_digest: assertDigest(value.mapping_digest, 'mapping_digest'),
    expected_executor_registry_digest: assertDigest(value.expected_executor_registry_digest, 'expected_executor_registry_digest'),
    policy_digest: assertDigest(value.policy_digest, 'policy_digest'),
    capability_registry_digest: assertDigest(value.capability_registry_digest, 'capability_registry_digest'),
    build_digest: assertDigest(value.build_digest, 'build_digest'),
    reviews,
    mapping_installed: false,
    execution_authorized: false,
    installation_authority: null,
    non_claim: assertString(value.non_claim, 'non_claim', { max: 512 })
  };
  if (body.mapping_digest !== mapping.mapping_digest) {
    throw new ValidationError('promotion mapping digest does not match normalized mapping');
  }
  const expected = contentAddress(body, 'intent-executor-promotion', 'promotion_digest', 'promotion_id');
  if (
    value.promotion_digest !== expected.promotion_digest
    || value.promotion_id !== expected.promotion_id
  ) {
    throw new ValidationError('executor promotion candidate is not content-addressed');
  }
  return expected;
}

export function verifyIntentExecutorPromotionCandidate(rawCandidate, {
  dossier,
  reviews,
  current_context,
  now = new Date().toISOString()
}) {
  const candidate = normalizeIntentExecutorPromotionCandidate(rawCandidate);
  const expected = buildIntentExecutorPromotionCandidate({
    dossier,
    reviews,
    current_context,
    now
  });
  if (canonicalJson(candidate) !== canonicalJson(expected)) {
    throw new ValidationError('executor promotion candidate does not match current independently reviewed admission state');
  }
  return candidate;
}

export function requiredIntentExecutorAdmissionEvidenceAssertions() {
  return [...REQUIRED_EVIDENCE];
}
