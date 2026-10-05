import {
  assertPlainObject,
  assertString,
  canonicalJson,
  digestObject,
  ValidationError
} from './canonical.mjs';

export const THREAT_OBSERVATION_SCHEMA = 'axiom-threat-observation.v0';
export const THREAT_HYPOTHESIS_SCHEMA = 'axiom-threat-hypothesis.v0';
export const REPRODUCTION_CASE_SCHEMA = 'axiom-threat-reproduction-case.v0';
export const REGRESSION_CANDIDATE_SCHEMA = 'axiom-threat-regression-candidate.v0';
export const THREAT_ADAPTATION_RECEIPT_SCHEMA = 'axiom-threat-adaptation-receipt.v0';

const MAX_OBJECT_BYTES = 65_536;
const DIGEST_PATTERN = /^sha256:[0-9a-f]{64}$/;
const TOKEN_PATTERN = /^[a-z][a-z0-9_:-]*$/;

const SOURCE_CLASSES = new Set([
  'vendor_security_report',
  'vulnerability_advisory',
  'upstream_project_advisory',
  'cert_or_government_advisory',
  'peer_reviewed_security_research',
  'trusted_partner_disclosure',
  'axiom_local_incident',
  'axiom_lab_finding',
  'community_submission',
  'untrusted_open_web_observation'
]);

const LIFECYCLE_STATES = new Set([
  'current',
  'superseded',
  'contradicted',
  'source_withdrawn',
  'fixed_upstream',
  'not_applicable_current_build',
  'historical_regression',
  'expired_pending_reassessment'
]);

const APPLICABILITY_STATES = new Set([
  'unassessed',
  'plausible',
  'not_applicable',
  'lab_confirmed',
  'current_build_blocked',
  'current_build_vulnerable',
  'obsolete'
]);

const CONFIRMED_APPLICABILITY_STATES = new Set([
  'lab_confirmed',
  'current_build_blocked',
  'current_build_vulnerable'
]);

const CONFIRMATION_BASES = new Set([
  'unassessed',
  'model_only',
  'deterministic_build_fact_mapping',
  'reproducible_verifier',
  'authorized_review'
]);

const REPRODUCTION_NETWORK_PROFILES = new Set([
  'none',
  'synthetic_loopback_only'
]);

const REPRODUCTION_SECRET_PROFILES = new Set([
  'synthetic_only'
]);

const OBSERVATION_FIELDS = Object.freeze([
  'schema',
  'observation_id',
  'source_class',
  'source_identity_or_locator',
  'source_version_or_published_at',
  'retrieved_at',
  'content_digest',
  'claim_class',
  'summary',
  'indicators',
  'affected_technology_or_boundary',
  'reported_preconditions',
  'reported_effects',
  'source_confidence',
  'collector_confidence',
  'sensitivity_class',
  'raw_content_reference',
  'provenance_chain',
  'supersedes_observation_ids',
  'contradicts_observation_ids',
  'lifecycle_state',
  'expiry_or_review_at',
  'observation_digest'
]);

const HYPOTHESIS_FIELDS = Object.freeze([
  'schema',
  'hypothesis_id',
  'observation_ids',
  'axiom_boundary_or_component',
  'precondition_mapping',
  'expected_failure_mode',
  'applicability_state',
  'confidence',
  'contradicting_evidence',
  'required_reproduction',
  'confirmation_basis',
  'evidence_bindings',
  'created_by_principal_or_process',
  'created_at',
  'review_at',
  'hypothesis_digest'
]);

const REPRODUCTION_FIELDS = Object.freeze([
  'schema',
  'reproduction_id',
  'hypothesis_id',
  'base_source_revision',
  'lab_profile_digest',
  'fixtures',
  'forbidden_resources',
  'allowed_resources',
  'expected_observations',
  'pass_fail_predicate',
  'max_runtime_ms',
  'max_storage_bytes',
  'max_processes',
  'network_profile',
  'secret_profile',
  'cleanup_contract',
  'reproduction_digest'
]);

const REGRESSION_FIELDS = Object.freeze([
  'schema',
  'candidate_id',
  'hypothesis_id',
  'reproduction_id',
  'property_to_preserve',
  'negative_fixture_digest',
  'positive_control_digest',
  'expected_failure_semantics',
  'scope',
  'owner_or_reviewer_state',
  'evidence_bindings',
  'expiry_or_reassessment',
  'candidate_digest'
]);

const RECEIPT_FIELDS = Object.freeze([
  'schema',
  'receipt_id',
  'observation_digests',
  'hypothesis_digest',
  'source_revision',
  'lab_profile_digest',
  'reproduction_result_digest',
  'regression_candidate_digest',
  'review_state',
  'policy_or_code_change_ref',
  'timestamps',
  'signer',
  'receipt_digest'
]);

export function contractDigest(value, digestField) {
  assertPlainObject(value, 'contract');
  assertString(digestField, 'digestField', { max: 128 });
  const copy = { ...value };
  delete copy[digestField];
  return `sha256:${digestObject(copy)}`;
}

export function verifyThreatObservation(value) {
  const object = boundedCanonical(value, 'ThreatObservation');
  assertExactFields(object, OBSERVATION_FIELDS, 'ThreatObservation');
  assertSchema(object.schema, THREAT_OBSERVATION_SCHEMA, 'ThreatObservation');
  assertIdentifier(object.observation_id, 'ThreatObservation.observation_id');
  assertEnum(object.source_class, SOURCE_CLASSES, 'ThreatObservation.source_class');
  assertString(object.source_identity_or_locator, 'ThreatObservation.source_identity_or_locator', { max: 2048 });
  assertString(object.source_version_or_published_at, 'ThreatObservation.source_version_or_published_at', { max: 512 });
  assertTimestamp(object.retrieved_at, 'ThreatObservation.retrieved_at');
  assertDigest(object.content_digest, 'ThreatObservation.content_digest');
  assertToken(object.claim_class, 'ThreatObservation.claim_class');
  assertString(object.summary, 'ThreatObservation.summary', { max: 8192 });
  assertUniqueStrings(object.indicators, 'ThreatObservation.indicators', { maxItems: 32, itemMax: 512 });
  assertUniqueStrings(
    object.affected_technology_or_boundary,
    'ThreatObservation.affected_technology_or_boundary',
    { maxItems: 32, itemMax: 512 }
  );
  assertUniqueStrings(
    object.reported_preconditions,
    'ThreatObservation.reported_preconditions',
    { maxItems: 32, itemMax: 2048 }
  );
  assertUniqueStrings(
    object.reported_effects,
    'ThreatObservation.reported_effects',
    { maxItems: 32, itemMax: 2048 }
  );
  assertToken(object.source_confidence, 'ThreatObservation.source_confidence');
  assertToken(object.collector_confidence, 'ThreatObservation.collector_confidence');
  assertToken(object.sensitivity_class, 'ThreatObservation.sensitivity_class');
  assertNullableReference(object.raw_content_reference, 'ThreatObservation.raw_content_reference');
  assertUniqueDigests(object.provenance_chain, 'ThreatObservation.provenance_chain', 32);
  assertUniqueStrings(
    object.supersedes_observation_ids,
    'ThreatObservation.supersedes_observation_ids',
    { maxItems: 16, itemMax: 512 }
  );
  assertUniqueStrings(
    object.contradicts_observation_ids,
    'ThreatObservation.contradicts_observation_ids',
    { maxItems: 16, itemMax: 512 }
  );
  assertEnum(object.lifecycle_state, LIFECYCLE_STATES, 'ThreatObservation.lifecycle_state');
  assertTimestamp(object.expiry_or_review_at, 'ThreatObservation.expiry_or_review_at');
  assertDigest(object.observation_digest, 'ThreatObservation.observation_digest');
  assertSelfDigest(object, 'observation_digest', 'ThreatObservation');
  return object;
}

export function verifyThreatHypothesis(value) {
  const object = boundedCanonical(value, 'ThreatHypothesis');
  assertExactFields(object, HYPOTHESIS_FIELDS, 'ThreatHypothesis');
  assertSchema(object.schema, THREAT_HYPOTHESIS_SCHEMA, 'ThreatHypothesis');
  assertIdentifier(object.hypothesis_id, 'ThreatHypothesis.hypothesis_id');
  assertUniqueStrings(object.observation_ids, 'ThreatHypothesis.observation_ids', {
    minItems: 1,
    maxItems: 32,
    itemMax: 512
  });
  assertUniqueStrings(object.axiom_boundary_or_component, 'ThreatHypothesis.axiom_boundary_or_component', {
    minItems: 1,
    maxItems: 32,
    itemMax: 512
  });
  assertUniqueStrings(object.precondition_mapping, 'ThreatHypothesis.precondition_mapping', {
    maxItems: 32,
    itemMax: 2048
  });
  assertString(object.expected_failure_mode, 'ThreatHypothesis.expected_failure_mode', { max: 8192 });
  assertEnum(object.applicability_state, APPLICABILITY_STATES, 'ThreatHypothesis.applicability_state');
  assertToken(object.confidence, 'ThreatHypothesis.confidence');
  assertUniqueStrings(object.contradicting_evidence, 'ThreatHypothesis.contradicting_evidence', {
    maxItems: 32,
    itemMax: 2048
  });
  assertUniqueStrings(object.required_reproduction, 'ThreatHypothesis.required_reproduction', {
    maxItems: 32,
    itemMax: 2048
  });
  assertEnum(object.confirmation_basis, CONFIRMATION_BASES, 'ThreatHypothesis.confirmation_basis');
  assertUniqueDigests(object.evidence_bindings, 'ThreatHypothesis.evidence_bindings', 32);
  assertString(
    object.created_by_principal_or_process,
    'ThreatHypothesis.created_by_principal_or_process',
    { max: 512 }
  );
  assertTimestamp(object.created_at, 'ThreatHypothesis.created_at');
  assertTimestamp(object.review_at, 'ThreatHypothesis.review_at');
  assertDigest(object.hypothesis_digest, 'ThreatHypothesis.hypothesis_digest');

  if (CONFIRMED_APPLICABILITY_STATES.has(object.applicability_state)) {
    if (object.confirmation_basis === 'model_only') {
      throw new ValidationError('confirmed hypothesis cannot use model_only confirmation');
    }
    if (object.evidence_bindings.length === 0) {
      throw new ValidationError('confirmed hypothesis requires evidence bindings');
    }
  }

  assertSelfDigest(object, 'hypothesis_digest', 'ThreatHypothesis');
  return object;
}

export function verifyReproductionCase(value) {
  const object = boundedCanonical(value, 'ReproductionCase');
  assertExactFields(object, REPRODUCTION_FIELDS, 'ReproductionCase');
  assertSchema(object.schema, REPRODUCTION_CASE_SCHEMA, 'ReproductionCase');
  assertIdentifier(object.reproduction_id, 'ReproductionCase.reproduction_id');
  assertIdentifier(object.hypothesis_id, 'ReproductionCase.hypothesis_id');
  assertString(object.base_source_revision, 'ReproductionCase.base_source_revision', { max: 512 });
  assertDigest(object.lab_profile_digest, 'ReproductionCase.lab_profile_digest');
  assertUniqueDigests(object.fixtures, 'ReproductionCase.fixtures', 32);
  assertUniqueStrings(object.forbidden_resources, 'ReproductionCase.forbidden_resources', {
    maxItems: 32,
    itemMax: 512
  });
  assertUniqueStrings(object.allowed_resources, 'ReproductionCase.allowed_resources', {
    maxItems: 32,
    itemMax: 512
  });
  assertUniqueStrings(object.expected_observations, 'ReproductionCase.expected_observations', {
    maxItems: 32,
    itemMax: 2048
  });
  assertString(object.pass_fail_predicate, 'ReproductionCase.pass_fail_predicate', { max: 8192 });
  assertInteger(object.max_runtime_ms, 'ReproductionCase.max_runtime_ms', { min: 1, max: 300_000 });
  assertInteger(object.max_storage_bytes, 'ReproductionCase.max_storage_bytes', {
    min: 1,
    max: 1_073_741_824
  });
  assertInteger(object.max_processes, 'ReproductionCase.max_processes', { min: 1, max: 32 });
  assertEnum(object.network_profile, REPRODUCTION_NETWORK_PROFILES, 'ReproductionCase.network_profile');
  assertEnum(object.secret_profile, REPRODUCTION_SECRET_PROFILES, 'ReproductionCase.secret_profile');
  assertString(object.cleanup_contract, 'ReproductionCase.cleanup_contract', { max: 8192 });
  assertDigest(object.reproduction_digest, 'ReproductionCase.reproduction_digest');
  assertSelfDigest(object, 'reproduction_digest', 'ReproductionCase');
  return object;
}

export function verifyRegressionCandidate(value) {
  const object = boundedCanonical(value, 'RegressionCandidate');
  assertExactFields(object, REGRESSION_FIELDS, 'RegressionCandidate');
  assertSchema(object.schema, REGRESSION_CANDIDATE_SCHEMA, 'RegressionCandidate');
  assertIdentifier(object.candidate_id, 'RegressionCandidate.candidate_id');
  assertIdentifier(object.hypothesis_id, 'RegressionCandidate.hypothesis_id');
  assertIdentifier(object.reproduction_id, 'RegressionCandidate.reproduction_id');
  assertString(object.property_to_preserve, 'RegressionCandidate.property_to_preserve', { max: 8192 });
  assertDigest(object.negative_fixture_digest, 'RegressionCandidate.negative_fixture_digest');
  assertDigest(object.positive_control_digest, 'RegressionCandidate.positive_control_digest');
  assertString(
    object.expected_failure_semantics,
    'RegressionCandidate.expected_failure_semantics',
    { max: 8192 }
  );
  assertString(object.scope, 'RegressionCandidate.scope', { max: 1024 });
  assertToken(object.owner_or_reviewer_state, 'RegressionCandidate.owner_or_reviewer_state');
  assertUniqueDigests(object.evidence_bindings, 'RegressionCandidate.evidence_bindings', 32);
  assertTimestamp(object.expiry_or_reassessment, 'RegressionCandidate.expiry_or_reassessment');
  assertDigest(object.candidate_digest, 'RegressionCandidate.candidate_digest');
  assertSelfDigest(object, 'candidate_digest', 'RegressionCandidate');
  return object;
}

export function verifyThreatAdaptationReceipt(value) {
  const object = boundedCanonical(value, 'ThreatAdaptationReceipt');
  assertExactFields(object, RECEIPT_FIELDS, 'ThreatAdaptationReceipt');
  assertSchema(object.schema, THREAT_ADAPTATION_RECEIPT_SCHEMA, 'ThreatAdaptationReceipt');
  assertIdentifier(object.receipt_id, 'ThreatAdaptationReceipt.receipt_id');
  assertUniqueDigests(object.observation_digests, 'ThreatAdaptationReceipt.observation_digests', 32);
  assertDigest(object.hypothesis_digest, 'ThreatAdaptationReceipt.hypothesis_digest');
  assertString(object.source_revision, 'ThreatAdaptationReceipt.source_revision', { max: 512 });
  assertDigest(object.lab_profile_digest, 'ThreatAdaptationReceipt.lab_profile_digest');
  assertDigest(object.reproduction_result_digest, 'ThreatAdaptationReceipt.reproduction_result_digest');
  assertDigest(object.regression_candidate_digest, 'ThreatAdaptationReceipt.regression_candidate_digest');
  assertToken(object.review_state, 'ThreatAdaptationReceipt.review_state');
  if (object.policy_or_code_change_ref !== null) {
    assertString(
      object.policy_or_code_change_ref,
      'ThreatAdaptationReceipt.policy_or_code_change_ref',
      { max: 2048 }
    );
  }
  assertUniqueTimestamps(object.timestamps, 'ThreatAdaptationReceipt.timestamps', 16);
  assertString(object.signer, 'ThreatAdaptationReceipt.signer', { max: 512 });
  assertDigest(object.receipt_digest, 'ThreatAdaptationReceipt.receipt_digest');
  assertSelfDigest(object, 'receipt_digest', 'ThreatAdaptationReceipt');
  return object;
}

function boundedCanonical(value, name) {
  assertPlainObject(value, name);
  const encoded = canonicalJson(value);
  if (Buffer.byteLength(encoded, 'utf8') > MAX_OBJECT_BYTES) {
    throw new ValidationError(`${name} exceeds 65536 bytes`);
  }
  return JSON.parse(encoded);
}

function assertExactFields(object, fields, name) {
  const allowed = new Set(fields);
  for (const key of Object.keys(object)) {
    if (!allowed.has(key)) {
      throw new ValidationError(`${name} contains unsupported field: ${key}`);
    }
  }
  for (const key of fields) {
    if (!Object.hasOwn(object, key)) {
      throw new ValidationError(`${name} is missing field: ${key}`);
    }
  }
}

function assertSchema(value, expected, name) {
  if (value !== expected) {
    throw new ValidationError(`${name}.schema must equal ${expected}`);
  }
}

function assertIdentifier(value, name) {
  assertString(value, name, { max: 512 });
  if (!/^[A-Za-z0-9][A-Za-z0-9._:/-]*$/.test(value)) {
    throw new ValidationError(`${name} has invalid identifier syntax`);
  }
}

function assertToken(value, name) {
  assertString(value, name, { max: 128 });
  if (!TOKEN_PATTERN.test(value)) {
    throw new ValidationError(`${name} must be a lowercase token`);
  }
}

function assertEnum(value, allowed, name) {
  assertString(value, name, { max: 128 });
  if (!allowed.has(value)) {
    throw new ValidationError(`${name} is not an allowed value`);
  }
}

function assertTimestamp(value, name) {
  assertString(value, name, { max: 64 });
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString() !== value) {
    throw new ValidationError(`${name} must be a canonical UTC ISO-8601 timestamp`);
  }
}

function assertDigest(value, name) {
  assertString(value, name, { max: 71 });
  if (!DIGEST_PATTERN.test(value)) {
    throw new ValidationError(`${name} must be a sha256 digest`);
  }
}

function assertNullableReference(value, name) {
  if (value === null) return;
  if (typeof value !== 'string') {
    throw new ValidationError(`${name} must be null or an inert string reference`);
  }
  assertString(value, name, { max: 2048 });
}

function assertUniqueStrings(value, name, {
  minItems = 0,
  maxItems = 32,
  itemMax = 2048
} = {}) {
  if (!Array.isArray(value)) {
    throw new ValidationError(`${name} must be an array`);
  }
  if (value.length < minItems) {
    throw new ValidationError(`${name} must contain at least ${minItems} items`);
  }
  if (value.length > maxItems) {
    throw new ValidationError(`${name} must contain at most ${maxItems} items`);
  }
  const seen = new Set();
  for (let index = 0; index < value.length; index += 1) {
    const item = value[index];
    assertString(item, `${name}[${index}]`, { max: itemMax });
    if (seen.has(item)) {
      throw new ValidationError(`${name} items must be unique`);
    }
    seen.add(item);
  }
}

function assertUniqueDigests(value, name, maxItems) {
  assertUniqueStrings(value, name, { maxItems, itemMax: 71 });
  for (let index = 0; index < value.length; index += 1) {
    assertDigest(value[index], `${name}[${index}]`);
  }
}

function assertUniqueTimestamps(value, name, maxItems) {
  assertUniqueStrings(value, name, { minItems: 1, maxItems, itemMax: 64 });
  for (let index = 0; index < value.length; index += 1) {
    assertTimestamp(value[index], `${name}[${index}]`);
  }
}

function assertInteger(value, name, { min, max }) {
  if (!Number.isSafeInteger(value) || value < min || value > max) {
    throw new ValidationError(`${name} must be an integer between ${min} and ${max}`);
  }
}

function assertSelfDigest(object, digestField, name) {
  const expected = contractDigest(object, digestField);
  if (object[digestField] !== expected) {
    throw new ValidationError(`${name} digest mismatch`);
  }
}
