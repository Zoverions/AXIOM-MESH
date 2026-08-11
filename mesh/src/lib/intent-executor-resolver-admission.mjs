import {
  ValidationError,
  assertPlainObject,
  assertString,
  canonicalJson,
  digestObject
} from './canonical.mjs';
import { verifyObjectSignature } from './identity.mjs';
import {
  requiredIntentExecutorAdmissionEvidenceAssertions as fixedEvidenceAssertions
} from './intent-executor-admission.mjs';
import {
  classifyExecutorMappingInputMode,
  deriveRepositoryDocsResolverAdmissionFacts
} from './intent-resolver-admission-facts.mjs';

export const INTENT_RESOLVER_ADMISSION_DOSSIER_SCHEMA = 'axiom-intent-resolver-admission-dossier.v1';
export const INTENT_RESOLVER_REVIEW_SCHEMA = 'axiom-intent-resolver-review-attestation.v1';
export const INTENT_RESOLVER_PROMOTION_SCHEMA = 'axiom-intent-resolver-promotion-candidate.v1';

const ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/;
const DIGEST = /^[a-f0-9]{64}$/;
const MAX_DOSSIER_LIFETIME_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_REVIEW_LIFETIME_MS = 48 * 60 * 60 * 1000;
const REVIEW_ROLES = new Set(['security_authority', 'implementation_conformance']);
const REQUIRED_REVIEW_ROLES = ['implementation_conformance', 'security_authority'];
const RESOLVER_EVIDENCE = [
  'resolver_constraints_bound',
  'resolver_destination_bound',
  'resolver_plan_signature_enforced',
  'resolver_substitution_denied',
  'resolved_input_gates_preserved',
  'resolved_input_non_execution'
];
const REQUIRED_EVIDENCE = [...fixedEvidenceAssertions(), ...RESOLVER_EVIDENCE].sort();

function assertDigest(value, name) {
  return assertString(value, name, { min: 64, max: 64, pattern: DIGEST });
}

function canonicalObject(value, name) {
  return JSON.parse(canonicalJson(assertPlainObject(value, name)));
}

function isoDate(value, name) {
  const raw = assertString(value, name, { min: 1, max: 64 });
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
    kernel_version: assertString(value.kernel_version, 'build.kernel_version', { min: 1, max: 64 }),
    source_digest: assertDigest(value.source_digest, 'build.source_digest')
  };
  const buildDigest = digestObject(base);
  if (value.build_digest !== undefined && assertDigest(value.build_digest, 'build.build_digest') !== buildDigest) {
    throw new ValidationError('build.build_digest does not match the exact build binding');
  }
  return { ...base, build_digest: buildDigest };
}

function contentAddress(body, prefix, digestField, idField) {
  const digest = digestObject(body);
  return {
    ...body,
    [idField]: `${prefix}:${digest}`,
    [digestField]: digest
  };
}

function normalizeFacts(raw, kernelVersion) {
  const value = assertPlainObject(raw, 'resolver admission facts');
  if (value.schema !== 'axiom-intent-resolver-admission-facts.v1') {
    throw new ValidationError('resolver admission facts schema is invalid');
  }
  const classified = classifyExecutorMappingInputMode(value.mapping, kernelVersion);
  if (classified.mode !== 'input_resolver') {
    throw new ValidationError('resolver admission dossier requires input_resolver mapping mode');
  }
  const body = {
    schema: 'axiom-intent-resolver-admission-facts.v1',
    mapping: classified.mapping,
    mapping_digest: assertDigest(value.mapping_digest, 'facts.mapping_digest'),
    base_executor_registry_digest: assertDigest(
      value.base_executor_registry_digest,
      'facts.base_executor_registry_digest'
    ),
    policy_digest: assertDigest(value.policy_digest, 'facts.policy_digest'),
    capability_registry_digest: assertDigest(
      value.capability_registry_digest,
      'facts.capability_registry_digest'
    ),
    input_mode: value.input_mode === 'input_resolver'
      ? 'input_resolver'
      : (() => { throw new ValidationError('facts.input_mode must be input_resolver'); })(),
    resolver: classified.resolver,
    resolver_digest: assertDigest(value.resolver_digest, 'facts.resolver_digest'),
    effect_destination: assertString(value.effect_destination, 'facts.effect_destination', {
      min: 1,
      max: 256
    }),
    policy_gates: canonicalObject(value.policy_gates, 'facts.policy_gates'),
    mapping_constraints_mode: value.mapping_constraints_mode === 'resolver_owned_exact'
      ? 'resolver_owned_exact'
      : (() => { throw new ValidationError('facts.mapping_constraints_mode is invalid'); })(),
    mapping_installed: value.mapping_installed === false
      ? false
      : (() => { throw new ValidationError('resolver admission facts must remain non-installing'); })(),
    execution_authorized: value.execution_authorized === false
      ? false
      : (() => { throw new ValidationError('resolver admission facts must remain non-executing'); })(),
    non_claim: assertString(value.non_claim, 'facts.non_claim', { min: 1, max: 512 })
  };
  if (body.mapping_digest !== classified.mapping.mapping_digest) {
    throw new ValidationError('resolver admission facts mapping digest is invalid');
  }
  if (body.resolver_digest !== digestObject(classified.resolver)) {
    throw new ValidationError('resolver admission facts resolver digest is invalid');
  }
  const factsDigest = digestObject(body);
  if (assertDigest(value.facts_digest, 'facts.facts_digest') !== factsDigest) {
    throw new ValidationError('resolver admission facts digest is invalid');
  }
  return { ...body, facts_digest: factsDigest };
}

function normalizeEvidence(raw) {
  if (!Array.isArray(raw) || raw.length !== REQUIRED_EVIDENCE.length) {
    throw new ValidationError(
      `resolver admission evidence must contain exactly ${REQUIRED_EVIDENCE.length} required assertions`
    );
  }
  const entries = raw.map((rawEntry, index) => {
    const entry = assertPlainObject(rawEntry, `evidence[${index}]`);
    const assertion = assertString(entry.assertion, `evidence[${index}].assertion`, {
      min: 2,
      max: 96,
      pattern: /^[a-z][a-z0-9_]{1,95}$/
    });
    if (!REQUIRED_EVIDENCE.includes(assertion)) {
      throw new ValidationError(`unsupported resolver admission evidence assertion: ${assertion}`);
    }
    if (entry.result !== 'pass') {
      throw new ValidationError(`resolver admission evidence ${assertion} must report pass`);
    }
    const result = {
      assertion,
      result: 'pass',
      artifact_digest: assertDigest(entry.artifact_digest, `evidence[${index}].artifact_digest`)
    };
    if (entry.artifact_type !== undefined) {
      result.artifact_type = assertString(entry.artifact_type, `evidence[${index}].artifact_type`, {
        max: 128,
        pattern: /^[a-z][a-z0-9._:-]*$/
      });
    }
    if (entry.ref !== undefined) {
      result.ref = assertString(entry.ref, `evidence[${index}].ref`, { max: 512 });
    }
    return result;
  }).sort((a, b) => a.assertion.localeCompare(b.assertion));
  const assertions = entries.map(item => item.assertion);
  if (new Set(assertions).size !== REQUIRED_EVIDENCE.length) {
    throw new ValidationError('resolver admission evidence assertions must be unique');
  }
  for (const assertion of REQUIRED_EVIDENCE) {
    if (!assertions.includes(assertion)) {
      throw new ValidationError(`resolver admission evidence is missing ${assertion}`);
    }
  }
  return entries;
}

export function requiredIntentResolverAdmissionEvidenceAssertions() {
  return [...REQUIRED_EVIDENCE];
}

export function buildIntentResolverAdmissionDossier({
  candidate_mapping,
  current_context,
  evidence,
  producer,
  created_at,
  expires_at
}) {
  const context = assertPlainObject(current_context, 'resolver admission current context');
  const build = normalizeBuild(context.build);
  const facts = deriveRepositoryDocsResolverAdmissionFacts({
    candidate_mapping,
    executor_registry: context.executor_registry,
    policy: context.policy,
    capabilities: context.capabilities
  });
  if (facts.mapping && build.kernel_version !== context.executor_registry?.kernel_version) {
    throw new ValidationError('resolver admission build kernel version does not match executor registry');
  }
  const window = boundedWindow(created_at, expires_at, MAX_DOSSIER_LIFETIME_MS, 'dossier');
  const body = {
    schema: INTENT_RESOLVER_ADMISSION_DOSSIER_SCHEMA,
    admission_facts: facts,
    facts_digest: facts.facts_digest,
    mapping_digest: facts.mapping_digest,
    base_executor_registry_digest: facts.base_executor_registry_digest,
    policy_digest: facts.policy_digest,
    capability_registry_digest: facts.capability_registry_digest,
    build,
    evidence: normalizeEvidence(evidence),
    producer: assertString(producer, 'producer', { min: 1, max: 160, pattern: ID }),
    created_at: window.start,
    expires_at: window.end,
    mapping_installed: false,
    execution_authorized: false,
    non_claim: 'This resolver admission dossier records reviewed admission evidence only. It does not install a mapping, resolve executor input, grant a capability, or authorize an effect.'
  };
  return contentAddress(
    body,
    'intent-resolver-dossier',
    'dossier_digest',
    'dossier_id'
  );
}

export function normalizeIntentResolverAdmissionDossier(raw) {
  const value = assertPlainObject(raw, 'Intent resolver admission dossier');
  if (value.schema !== INTENT_RESOLVER_ADMISSION_DOSSIER_SCHEMA) {
    throw new ValidationError(`resolver dossier schema must be ${INTENT_RESOLVER_ADMISSION_DOSSIER_SCHEMA}`);
  }
  if (value.mapping_installed !== false || value.execution_authorized !== false) {
    throw new ValidationError('resolver admission dossier must remain non-installing and non-executing');
  }
  const build = normalizeBuild(value.build);
  const facts = normalizeFacts(value.admission_facts, build.kernel_version);
  const window = boundedWindow(value.created_at, value.expires_at, MAX_DOSSIER_LIFETIME_MS, 'dossier');
  const body = {
    schema: INTENT_RESOLVER_ADMISSION_DOSSIER_SCHEMA,
    admission_facts: facts,
    facts_digest: assertDigest(value.facts_digest, 'facts_digest'),
    mapping_digest: assertDigest(value.mapping_digest, 'mapping_digest'),
    base_executor_registry_digest: assertDigest(
      value.base_executor_registry_digest,
      'base_executor_registry_digest'
    ),
    policy_digest: assertDigest(value.policy_digest, 'policy_digest'),
    capability_registry_digest: assertDigest(value.capability_registry_digest, 'capability_registry_digest'),
    build,
    evidence: normalizeEvidence(value.evidence),
    producer: assertString(value.producer, 'producer', { min: 1, max: 160, pattern: ID }),
    created_at: window.start,
    expires_at: window.end,
    mapping_installed: false,
    execution_authorized: false,
    non_claim: assertString(value.non_claim, 'non_claim', { min: 1, max: 512 })
  };
  if (
    body.facts_digest !== facts.facts_digest
    || body.mapping_digest !== facts.mapping_digest
    || body.base_executor_registry_digest !== facts.base_executor_registry_digest
    || body.policy_digest !== facts.policy_digest
    || body.capability_registry_digest !== facts.capability_registry_digest
  ) {
    throw new ValidationError('resolver dossier state digests do not match admission facts');
  }
  const expected = contentAddress(body, 'intent-resolver-dossier', 'dossier_digest', 'dossier_id');
  if (value.dossier_digest !== expected.dossier_digest || value.dossier_id !== expected.dossier_id) {
    throw new ValidationError('resolver admission dossier is not content-addressed');
  }
  return expected;
}

export function validateIntentResolverAdmissionDossierCurrent(rawDossier, rawCurrentContext, {
  now = new Date().toISOString()
} = {}) {
  const dossier = normalizeIntentResolverAdmissionDossier(rawDossier);
  const context = assertPlainObject(rawCurrentContext, 'resolver admission current context');
  const build = normalizeBuild(context.build);
  const nowMs = new Date(isoDate(now, 'now')).valueOf();
  if (new Date(dossier.expires_at).valueOf() <= nowMs) {
    throw new ValidationError('resolver admission dossier is expired');
  }
  const currentFacts = deriveRepositoryDocsResolverAdmissionFacts({
    candidate_mapping: dossier.admission_facts.mapping,
    executor_registry: context.executor_registry,
    policy: context.policy,
    capabilities: context.capabilities
  });
  if (
    dossier.build.build_digest !== build.build_digest
    || canonicalJson(dossier.admission_facts) !== canonicalJson(currentFacts)
  ) {
    throw new ValidationError('resolver admission dossier is stale against current registry/policy/capability/build state');
  }
  return dossier;
}

function reviewBodyFrom(raw) {
  const value = assertPlainObject(raw, 'Intent resolver review attestation');
  const role = assertString(value.review_role, 'review_role', { min: 1, max: 64 });
  if (!REVIEW_ROLES.has(role)) throw new ValidationError('resolver review role is invalid');
  const window = boundedWindow(value.reviewed_at, value.expires_at, MAX_REVIEW_LIFETIME_MS, 'review');
  return {
    schema: INTENT_RESOLVER_REVIEW_SCHEMA,
    dossier_id: assertString(value.dossier_id, 'dossier_id', { min: 1, max: 192 }),
    dossier_digest: assertDigest(value.dossier_digest, 'dossier_digest'),
    facts_digest: assertDigest(value.facts_digest, 'facts_digest'),
    mapping_digest: assertDigest(value.mapping_digest, 'mapping_digest'),
    reviewer: assertString(value.reviewer, 'reviewer', { min: 1, max: 160, pattern: ID }),
    review_role: role,
    verdict: value.verdict === 'approve'
      ? 'approve'
      : (() => { throw new ValidationError('resolver promotion review verdict must be approve'); })(),
    reviewed_at: window.start,
    expires_at: window.end,
    base_executor_registry_digest: assertDigest(
      value.base_executor_registry_digest,
      'base_executor_registry_digest'
    ),
    policy_digest: assertDigest(value.policy_digest, 'policy_digest'),
    capability_registry_digest: assertDigest(value.capability_registry_digest, 'capability_registry_digest'),
    build_digest: assertDigest(value.build_digest, 'build_digest'),
    mapping_installed: false,
    execution_authorized: false
  };
}

export function buildIntentResolverReviewAttestation(rawDossier, {
  identity,
  reviewer = identity?.service,
  review_role,
  reviewed_at,
  expires_at
}) {
  const dossier = normalizeIntentResolverAdmissionDossier(rawDossier);
  if (!identity || typeof identity.signObject !== 'function' || typeof identity.service !== 'string') {
    throw new ValidationError('resolver review requires an AXIOM signing identity');
  }
  if (reviewer !== identity.service) {
    throw new ValidationError('resolver reviewer must match the signing identity service');
  }
  if (reviewer === dossier.producer) {
    throw new ValidationError('resolver dossier producer cannot review its own dossier');
  }
  const body = reviewBodyFrom({
    schema: INTENT_RESOLVER_REVIEW_SCHEMA,
    dossier_id: dossier.dossier_id,
    dossier_digest: dossier.dossier_digest,
    facts_digest: dossier.facts_digest,
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
    review_id: `intent-resolver-review:${reviewDigest}`,
    review_digest: reviewDigest
  };
}

export function verifyIntentResolverReviewAttestation(rawReview, rawDossier, {
  public_key,
  now = new Date().toISOString()
}) {
  const dossier = normalizeIntentResolverAdmissionDossier(rawDossier);
  const value = assertPlainObject(rawReview, 'Intent resolver review attestation');
  if (value.schema !== INTENT_RESOLVER_REVIEW_SCHEMA) {
    throw new ValidationError(`resolver review schema must be ${INTENT_RESOLVER_REVIEW_SCHEMA}`);
  }
  if (value.mapping_installed !== false || value.execution_authorized !== false) {
    throw new ValidationError('resolver review must remain non-installing and non-executing');
  }
  const body = reviewBodyFrom(value);
  const signature = canonicalObject(value.signature, 'signature');
  const expectedDigest = digestObject({ body, signature });
  if (
    value.review_digest !== expectedDigest
    || value.review_id !== `intent-resolver-review:${expectedDigest}`
  ) {
    throw new ValidationError('resolver review attestation is not content-addressed');
  }
  if (
    body.dossier_id !== dossier.dossier_id
    || body.dossier_digest !== dossier.dossier_digest
    || body.facts_digest !== dossier.facts_digest
    || body.mapping_digest !== dossier.mapping_digest
    || body.base_executor_registry_digest !== dossier.base_executor_registry_digest
    || body.policy_digest !== dossier.policy_digest
    || body.capability_registry_digest !== dossier.capability_registry_digest
    || body.build_digest !== dossier.build.build_digest
  ) {
    throw new ValidationError('resolver review attestation is not bound to the exact dossier state');
  }
  if (body.reviewer === dossier.producer) {
    throw new ValidationError('resolver dossier producer cannot review its own dossier');
  }
  const nowMs = new Date(isoDate(now, 'now')).valueOf();
  if (new Date(body.expires_at).valueOf() <= nowMs) {
    throw new ValidationError('resolver review attestation is expired');
  }
  if (new Date(body.reviewed_at).valueOf() > nowMs + 5 * 60 * 1000) {
    throw new ValidationError('resolver review attestation is from the future');
  }
  if (!signature.key_id?.startsWith(`${body.reviewer}:`)) {
    throw new ValidationError('resolver review key id does not match reviewer identity');
  }
  if (!public_key || !verifyObjectSignature(body, signature, public_key)) {
    throw new ValidationError('resolver review signature is invalid');
  }
  return {
    ...body,
    signature,
    review_id: value.review_id,
    review_digest: value.review_digest
  };
}

export function buildIntentResolverPromotionCandidate({
  dossier: rawDossier,
  reviews,
  current_context,
  now = new Date().toISOString()
}) {
  const dossier = validateIntentResolverAdmissionDossierCurrent(
    rawDossier,
    current_context,
    { now }
  );
  if (!Array.isArray(reviews) || reviews.length !== 2) {
    throw new ValidationError('resolver promotion candidate requires exactly two independent reviews');
  }
  const verified = reviews.map((entry, index) => {
    const item = assertPlainObject(entry, `reviews[${index}]`);
    return verifyIntentResolverReviewAttestation(item.review, dossier, {
      public_key: item.public_key,
      now
    });
  });
  const reviewers = verified.map(item => item.reviewer);
  if (new Set(reviewers).size !== verified.length) {
    throw new ValidationError('resolver promotion reviewers must be distinct identities');
  }
  if (reviewers.includes(dossier.producer)) {
    throw new ValidationError('resolver dossier producer cannot satisfy a promotion review role');
  }
  const roles = [...new Set(verified.map(item => item.review_role))].sort();
  if (canonicalJson(roles) !== canonicalJson(REQUIRED_REVIEW_ROLES)) {
    throw new ValidationError(
      'resolver promotion requires security_authority and implementation_conformance reviews'
    );
  }
  const reviewBindings = verified.map(item => ({
    review_id: item.review_id,
    review_digest: item.review_digest,
    reviewer: item.reviewer,
    review_role: item.review_role,
    expires_at: item.expires_at
  })).sort((a, b) => a.review_role.localeCompare(b.review_role));
  const body = {
    schema: INTENT_RESOLVER_PROMOTION_SCHEMA,
    dossier_id: dossier.dossier_id,
    dossier_digest: dossier.dossier_digest,
    facts_digest: dossier.facts_digest,
    mapping: dossier.admission_facts.mapping,
    mapping_digest: dossier.mapping_digest,
    resolver: dossier.admission_facts.resolver,
    resolver_digest: dossier.admission_facts.resolver_digest,
    effect_destination: dossier.admission_facts.effect_destination,
    policy_gates: dossier.admission_facts.policy_gates,
    expected_executor_registry_digest: dossier.base_executor_registry_digest,
    policy_digest: dossier.policy_digest,
    capability_registry_digest: dossier.capability_registry_digest,
    build_digest: dossier.build.build_digest,
    reviews: reviewBindings,
    mapping_installed: false,
    execution_authorized: false,
    installation_authority: null,
    non_claim: 'This independently reviewed resolver promotion candidate does not install a mapping, resolve input, grant a capability, or authorize an effect.'
  };
  return contentAddress(
    body,
    'intent-resolver-promotion',
    'promotion_digest',
    'promotion_id'
  );
}

export function normalizeIntentResolverPromotionCandidate(raw) {
  const value = assertPlainObject(raw, 'Intent resolver promotion candidate');
  if (value.schema !== INTENT_RESOLVER_PROMOTION_SCHEMA) {
    throw new ValidationError(`resolver promotion schema must be ${INTENT_RESOLVER_PROMOTION_SCHEMA}`);
  }
  if (
    value.mapping_installed !== false
    || value.execution_authorized !== false
    || value.installation_authority !== null
  ) {
    throw new ValidationError('resolver promotion candidate must remain non-installing and non-executing');
  }
  const classified = classifyExecutorMappingInputMode(value.mapping, '0.12.0-dev.3');
  if (classified.mode !== 'input_resolver') {
    throw new ValidationError('resolver promotion candidate requires input_resolver mapping');
  }
  if (!Array.isArray(value.reviews) || value.reviews.length !== 2) {
    throw new ValidationError('resolver promotion candidate must bind exactly two reviews');
  }
  const reviews = value.reviews.map((rawReview, index) => {
    const review = assertPlainObject(rawReview, `promotion.reviews[${index}]`);
    return {
      review_id: assertString(review.review_id, `promotion.reviews[${index}].review_id`, { max: 192 }),
      review_digest: assertDigest(review.review_digest, `promotion.reviews[${index}].review_digest`),
      reviewer: assertString(review.reviewer, `promotion.reviews[${index}].reviewer`, {
        max: 160,
        pattern: ID
      }),
      review_role: assertString(review.review_role, `promotion.reviews[${index}].review_role`, { max: 64 }),
      expires_at: isoDate(review.expires_at, `promotion.reviews[${index}].expires_at`)
    };
  }).sort((a, b) => a.review_role.localeCompare(b.review_role));
  const body = {
    schema: INTENT_RESOLVER_PROMOTION_SCHEMA,
    dossier_id: assertString(value.dossier_id, 'dossier_id', { max: 192 }),
    dossier_digest: assertDigest(value.dossier_digest, 'dossier_digest'),
    facts_digest: assertDigest(value.facts_digest, 'facts_digest'),
    mapping: classified.mapping,
    mapping_digest: assertDigest(value.mapping_digest, 'mapping_digest'),
    resolver: classified.resolver,
    resolver_digest: assertDigest(value.resolver_digest, 'resolver_digest'),
    effect_destination: assertString(value.effect_destination, 'effect_destination', { min: 1, max: 256 }),
    policy_gates: canonicalObject(value.policy_gates, 'policy_gates'),
    expected_executor_registry_digest: assertDigest(
      value.expected_executor_registry_digest,
      'expected_executor_registry_digest'
    ),
    policy_digest: assertDigest(value.policy_digest, 'policy_digest'),
    capability_registry_digest: assertDigest(value.capability_registry_digest, 'capability_registry_digest'),
    build_digest: assertDigest(value.build_digest, 'build_digest'),
    reviews,
    mapping_installed: false,
    execution_authorized: false,
    installation_authority: null,
    non_claim: assertString(value.non_claim, 'non_claim', { min: 1, max: 512 })
  };
  if (
    body.mapping_digest !== classified.mapping.mapping_digest
    || body.resolver_digest !== digestObject(classified.resolver)
  ) {
    throw new ValidationError('resolver promotion mapping or resolver digest is invalid');
  }
  const expected = contentAddress(
    body,
    'intent-resolver-promotion',
    'promotion_digest',
    'promotion_id'
  );
  if (value.promotion_digest !== expected.promotion_digest || value.promotion_id !== expected.promotion_id) {
    throw new ValidationError('resolver promotion candidate is not content-addressed');
  }
  return expected;
}

export function verifyIntentResolverPromotionCandidate(rawCandidate, {
  dossier,
  reviews,
  current_context,
  now = new Date().toISOString()
}) {
  const candidate = normalizeIntentResolverPromotionCandidate(rawCandidate);
  const expected = buildIntentResolverPromotionCandidate({
    dossier,
    reviews,
    current_context,
    now
  });
  if (canonicalJson(candidate) !== canonicalJson(expected)) {
    throw new ValidationError(
      'resolver promotion candidate does not match current independently reviewed admission state'
    );
  }
  return candidate;
}
