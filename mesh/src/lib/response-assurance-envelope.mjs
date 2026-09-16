import {
  ValidationError,
  assertPlainObject,
  assertString,
  digestObject
} from './canonical.mjs';
import { validateBehavioralAssuranceProfile } from './behavioral-assurance-profile.mjs';

export const RESPONSE_ASSURANCE_ENVELOPE_SCHEMA = 'axiom-response-assurance-envelope.v0';

const STATUS = 'inert-response-assurance-evidence';
const ZERO_DIGEST = '0'.repeat(64);
const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]*$/;
const DIGEST_PATTERN = /^[0-9a-f]{64}$/;

const TOP_LEVEL_KEYS = Object.freeze([
  'schema',
  'version',
  'status',
  'envelope_id',
  'response_digest',
  'task',
  'producer',
  'profile_binding',
  'deterministic_checks',
  'semantic_observations',
  'verifiers',
  'claimed_independent_confirmations',
  'surfaced_because',
  'unresolved_unknowns',
  'observed_at',
  'envelope_digest',
  'authority_effect',
  'network_effect',
  'runtime_activation',
  'selection_effect'
]);
const TASK_KEYS = Object.freeze(['purpose', 'domain', 'consequence_class']);
const PRODUCER_KEYS = Object.freeze(['subject_id', 'subject_digest', 'environment_harness_digest']);
const PROFILE_BINDING_KEYS = Object.freeze(['profile_id', 'profile_digest', 'population_id']);
const DETERMINISTIC_CHECK_KEYS = Object.freeze(['check_id', 'check_digest', 'result']);
const SEMANTIC_OBSERVATION_KEYS = Object.freeze([
  'observation_id',
  'observation_digest',
  'dimension_id',
  'value_kind',
  'value',
  'calibration_ref',
  'calibration_digest',
  'calibration_state',
  'evidence_state'
]);
const VERIFIER_KEYS = Object.freeze([
  'verifier_id',
  'verifier_digest',
  'source_class',
  'independence_group',
  'result'
]);

const CONSEQUENCE_CLASSES = new Set([
  'informational',
  'digital-reversible',
  'digital-consequential',
  'physical-reversible',
  'physical-safety-relevant',
  'physical-potentially-irreversible'
]);
const DETERMINISTIC_RESULTS = new Set(['PASS', 'FAIL', 'UNKNOWN', 'NOT-APPLICABLE']);
const VALUE_KINDS = new Set(['probability', 'rate', 'count', 'score']);
const CALIBRATION_STATES = new Set(['reviewed', 'experimental', 'rejected', 'expired', 'not-applicable']);
const EVIDENCE_STATES = new Set([
  'accepted-evidence',
  'insufficient-evidence',
  'conflicting-evidence',
  'stale-evidence',
  'invalid-evidence'
]);
const VERIFIER_CLASSES = new Set([
  'deterministic-checker',
  'human-adjudication',
  'semantic-verifier',
  'model-verifier',
  'provider-evaluator',
  'other-reviewed'
]);
const VERIFIER_RESULTS = new Set(['supports', 'contradicts', 'abstains']);

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const item of Object.values(value)) deepFreeze(item);
  return Object.freeze(value);
}

function clone(value) {
  return structuredClone(value);
}

function assertExactKeys(value, allowedKeys, name) {
  const object = assertPlainObject(value, name);
  const allowed = new Set(allowedKeys);
  for (const key of Object.keys(object)) {
    if (!allowed.has(key)) throw new ValidationError(`${name} contains unknown field ${key}`);
  }
  for (const key of allowedKeys) {
    if (!Object.hasOwn(object, key)) throw new ValidationError(`${name} is missing required field ${key}`);
  }
  return object;
}

function assertEnum(value, allowed, name) {
  assertString(value, name, { min: 1, max: 160 });
  if (!allowed.has(value)) throw new ValidationError(`${name} is invalid`);
  return value;
}

function assertId(value, name) {
  return assertString(value, name, { min: 1, max: 160, pattern: ID_PATTERN });
}

function assertDigest(value, name) {
  return assertString(value, name, { min: 64, max: 64, pattern: DIGEST_PATTERN });
}

function assertTimestamp(value, name) {
  assertString(value, name, { min: 20, max: 40 });
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed) || !value.endsWith('Z')) {
    throw new ValidationError(`${name} must be an RFC3339 UTC timestamp`);
  }
  return value;
}

function assertInteger(value, name, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}) {
  if (!Number.isSafeInteger(value) || value < min || value > max) {
    throw new ValidationError(`${name} must be an integer between ${min} and ${max}`);
  }
  return value;
}

function assertFiniteNumber(value, name) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new ValidationError(`${name} must be a finite number`);
  }
  return value;
}

function assertArray(value, name, { minItems = 0, maxItems = 128 } = {}) {
  if (!Array.isArray(value) || value.length < minItems || value.length > maxItems) {
    throw new ValidationError(`${name} must be an array with ${minItems}-${maxItems} items`);
  }
  return value;
}

function validateTask(task) {
  assertExactKeys(task, TASK_KEYS, 'task');
  assertId(task.purpose, 'task.purpose');
  assertId(task.domain, 'task.domain');
  assertEnum(task.consequence_class, CONSEQUENCE_CLASSES, 'task.consequence_class');
}

function validateProducer(producer) {
  assertExactKeys(producer, PRODUCER_KEYS, 'producer');
  assertId(producer.subject_id, 'producer.subject_id');
  assertDigest(producer.subject_digest, 'producer.subject_digest');
  assertDigest(producer.environment_harness_digest, 'producer.environment_harness_digest');
}

function validateProfileBinding(binding) {
  assertExactKeys(binding, PROFILE_BINDING_KEYS, 'profile_binding');
  assertId(binding.profile_id, 'profile_binding.profile_id');
  assertDigest(binding.profile_digest, 'profile_binding.profile_digest');
  assertId(binding.population_id, 'profile_binding.population_id');
}

function validateDeterministicChecks(checks) {
  assertArray(checks, 'deterministic_checks', { minItems: 1, maxItems: 128 });
  const seen = new Set();
  checks.forEach((check, index) => {
    const name = `deterministic_checks[${index}]`;
    assertExactKeys(check, DETERMINISTIC_CHECK_KEYS, name);
    assertId(check.check_id, `${name}.check_id`);
    assertDigest(check.check_digest, `${name}.check_digest`);
    assertEnum(check.result, DETERMINISTIC_RESULTS, `${name}.result`);
    if (seen.has(check.check_id)) throw new ValidationError(`deterministic_checks contains duplicate check_id ${check.check_id}`);
    seen.add(check.check_id);
  });
}

function validateSemanticObservations(observations) {
  assertArray(observations, 'semantic_observations', { maxItems: 128 });
  const seen = new Set();
  observations.forEach((observation, index) => {
    const name = `semantic_observations[${index}]`;
    assertExactKeys(observation, SEMANTIC_OBSERVATION_KEYS, name);
    assertId(observation.observation_id, `${name}.observation_id`);
    assertDigest(observation.observation_digest, `${name}.observation_digest`);
    assertId(observation.dimension_id, `${name}.dimension_id`);
    assertEnum(observation.value_kind, VALUE_KINDS, `${name}.value_kind`);
    assertFiniteNumber(observation.value, `${name}.value`);
    assertEnum(observation.calibration_state, CALIBRATION_STATES, `${name}.calibration_state`);
    assertEnum(observation.evidence_state, EVIDENCE_STATES, `${name}.evidence_state`);

    if (observation.value_kind === 'probability' || observation.value_kind === 'rate') {
      if (observation.value < 0 || observation.value > 1) {
        throw new ValidationError(`${name}.value must be between 0 and 1 for ${observation.value_kind}`);
      }
    } else if (observation.value_kind === 'count' && (!Number.isSafeInteger(observation.value) || observation.value < 0)) {
      throw new ValidationError(`${name}.value must be a non-negative integer for count evidence`);
    }

    if (observation.calibration_ref !== null) assertId(observation.calibration_ref, `${name}.calibration_ref`);
    if (observation.calibration_digest !== null) assertDigest(observation.calibration_digest, `${name}.calibration_digest`);

    if (observation.value_kind === 'probability') {
      if (
        observation.calibration_state !== 'reviewed'
        || observation.calibration_ref === null
        || observation.calibration_digest === null
      ) {
        throw new ValidationError(`${name} probability evidence requires reviewed calibration`);
      }
    }

    if (observation.calibration_state === 'not-applicable') {
      if (observation.calibration_ref !== null || observation.calibration_digest !== null) {
        throw new ValidationError(`${name} not-applicable calibration cannot carry a calibration reference`);
      }
    } else if ((observation.calibration_ref === null) !== (observation.calibration_digest === null)) {
      throw new ValidationError(`${name} calibration reference and digest must be present together`);
    }

    if (seen.has(observation.observation_id)) {
      throw new ValidationError(`semantic_observations contains duplicate observation_id ${observation.observation_id}`);
    }
    seen.add(observation.observation_id);
  });
}

function validateVerifiers(verifiers, claimedIndependentConfirmations) {
  assertArray(verifiers, 'verifiers', { maxItems: 128 });
  const seen = new Set();
  const supportingGroups = new Set();
  let supportingVerifierCount = 0;

  verifiers.forEach((verifier, index) => {
    const name = `verifiers[${index}]`;
    assertExactKeys(verifier, VERIFIER_KEYS, name);
    assertId(verifier.verifier_id, `${name}.verifier_id`);
    assertDigest(verifier.verifier_digest, `${name}.verifier_digest`);
    assertEnum(verifier.source_class, VERIFIER_CLASSES, `${name}.source_class`);
    assertId(verifier.independence_group, `${name}.independence_group`);
    assertEnum(verifier.result, VERIFIER_RESULTS, `${name}.result`);
    if (seen.has(verifier.verifier_id)) throw new ValidationError(`verifiers contains duplicate verifier_id ${verifier.verifier_id}`);
    seen.add(verifier.verifier_id);
    if (verifier.result === 'supports') {
      supportingVerifierCount += 1;
      supportingGroups.add(verifier.independence_group);
    }
  });

  assertInteger(claimedIndependentConfirmations, 'claimed_independent_confirmations', { min: 0, max: 128 });
  if (claimedIndependentConfirmations !== supportingGroups.size) {
    throw new ValidationError(
      'claimed_independent_confirmations cannot count correlated supporting verifiers as independent confirmations'
    );
  }
  if (supportingVerifierCount > 0 && supportingGroups.size === 0) {
    throw new ValidationError('supporting verifiers must declare an independence group');
  }
}

function validateBoundaryConstants(document) {
  const expected = [
    ['authority_effect', 'none'],
    ['network_effect', 'none'],
    ['runtime_activation', false],
    ['selection_effect', 'evidence-only']
  ];
  for (const [field, value] of expected) {
    if (document[field] !== value) throw new ValidationError(`${field} boundary effect is invalid`);
  }
}

function validateSemantics(document, { verifyDigest = true } = {}) {
  assertExactKeys(document, TOP_LEVEL_KEYS, 'Response Assurance Envelope');
  if (document.schema !== RESPONSE_ASSURANCE_ENVELOPE_SCHEMA) {
    throw new ValidationError(`schema must be ${RESPONSE_ASSURANCE_ENVELOPE_SCHEMA}`);
  }
  if (document.version !== 0) throw new ValidationError('version must be 0');
  if (document.status !== STATUS) throw new ValidationError(`status must be ${STATUS}`);
  assertId(document.envelope_id, 'envelope_id');
  assertDigest(document.response_digest, 'response_digest');
  validateTask(document.task);
  validateProducer(document.producer);
  validateProfileBinding(document.profile_binding);
  validateDeterministicChecks(document.deterministic_checks);
  validateSemanticObservations(document.semantic_observations);
  validateVerifiers(document.verifiers, document.claimed_independent_confirmations);
  assertString(document.surfaced_because, 'surfaced_because', { min: 1, max: 512 });
  const unknowns = assertArray(document.unresolved_unknowns, 'unresolved_unknowns', { maxItems: 64 });
  unknowns.forEach((value, index) => assertString(value, `unresolved_unknowns[${index}]`, { min: 1, max: 512 }));
  assertTimestamp(document.observed_at, 'observed_at');
  assertDigest(document.envelope_digest, 'envelope_digest');
  validateBoundaryConstants(document);

  if (verifyDigest) {
    const expected = computeResponseAssuranceEnvelopeDigest(document);
    if (document.envelope_digest !== expected) throw new ValidationError('Response Assurance Envelope digest mismatch');
  }
}

export function computeResponseAssuranceEnvelopeDigest(document) {
  validateSemantics(document, { verifyDigest: false });
  const canonical = clone(document);
  canonical.envelope_digest = ZERO_DIGEST;
  return digestObject(canonical);
}

export function responseAssuranceEnvelopeDigest(document) {
  return computeResponseAssuranceEnvelopeDigest(document);
}

export function validateResponseAssuranceEnvelope(document) {
  validateSemantics(document, { verifyDigest: true });
  return deepFreeze({
    valid: true,
    schema: document.schema,
    version: document.version,
    status: document.status,
    envelope_id: document.envelope_id,
    envelope_digest: document.envelope_digest,
    response_digest: document.response_digest,
    observed_at: document.observed_at,
    authority_effect: document.authority_effect,
    network_effect: document.network_effect,
    runtime_activation: document.runtime_activation,
    selection_effect: document.selection_effect
  });
}

function resolvedEnvelope(document, {
  status,
  profileApplicability,
  deterministicFailureCount,
  independentConfirmationCount,
  reasonCodes = []
}) {
  return deepFreeze({
    valid: true,
    schema: RESPONSE_ASSURANCE_ENVELOPE_SCHEMA,
    envelope_id: document.envelope_id,
    envelope_digest: document.envelope_digest,
    response_digest: document.response_digest,
    status,
    profile_applicability: profileApplicability,
    deterministic_failure_count: deterministicFailureCount,
    independent_confirmation_count: independentConfirmationCount,
    reason_codes: [...reasonCodes],
    unresolved_unknowns: [...document.unresolved_unknowns],
    observed_at: document.observed_at,
    authority_effect: 'none',
    network_effect: 'none',
    runtime_activation: false,
    selection_effect: 'evidence-only'
  });
}

export function resolveResponseAssuranceEnvelope(document, profile, { now } = {}) {
  validateResponseAssuranceEnvelope(document);
  validateBehavioralAssuranceProfile(profile);
  const nowValue = assertTimestamp(now, 'now');

  const deterministicFailureCount = document.deterministic_checks.filter(item => item.result === 'FAIL').length;
  const independentConfirmationCount = new Set(
    document.verifiers
      .filter(item => item.result === 'supports')
      .map(item => item.independence_group)
  ).size;

  const population = profile.populations.find(item => item.population_id === document.profile_binding.population_id);
  if (
    document.profile_binding.profile_id !== profile.profile_id
    || document.profile_binding.profile_digest !== profile.profile_digest
    || !population
  ) {
    return resolvedEnvelope(document, {
      status: 'invalid-evidence',
      profileApplicability: 'incompatible',
      deterministicFailureCount,
      independentConfirmationCount,
      reasonCodes: ['profile-binding-mismatch']
    });
  }

  if (
    document.producer.subject_id !== profile.subject.subject_id
    || document.producer.subject_digest !== profile.subject.subject_digest
    || document.producer.environment_harness_digest !== profile.subject.environment_harness_digest
  ) {
    return resolvedEnvelope(document, {
      status: 'invalid-evidence',
      profileApplicability: 'incompatible',
      deterministicFailureCount,
      independentConfirmationCount,
      reasonCodes: ['producer-harness-mismatch']
    });
  }

  if (
    Date.parse(nowValue) >= Date.parse(profile.valid_until)
    || profile.subject.binding_strength === 'mutable-alias'
    || profile.subject.binding_strength === 'unknown'
  ) {
    return resolvedEnvelope(document, {
      status: 'stale-profile',
      profileApplicability: 'stale',
      deterministicFailureCount,
      independentConfirmationCount,
      reasonCodes: [Date.parse(nowValue) >= Date.parse(profile.valid_until) ? 'profile-expired' : 'profile-binding-not-stable']
    });
  }

  if (
    document.task.domain !== population.domain
    || document.task.consequence_class !== population.consequence_class
  ) {
    return resolvedEnvelope(document, {
      status: 'out-of-distribution',
      profileApplicability: 'out-of-distribution',
      deterministicFailureCount,
      independentConfirmationCount,
      reasonCodes: [
        document.task.domain !== population.domain ? 'domain-mismatch' : 'consequence-class-mismatch'
      ]
    });
  }

  if (deterministicFailureCount > 0) {
    return resolvedEnvelope(document, {
      status: 'conflicting-evidence',
      profileApplicability: 'applicable',
      deterministicFailureCount,
      independentConfirmationCount,
      reasonCodes: ['deterministic-failure']
    });
  }

  if (document.verifiers.some(item => item.result === 'contradicts')) {
    return resolvedEnvelope(document, {
      status: 'conflicting-evidence',
      profileApplicability: 'applicable',
      deterministicFailureCount,
      independentConfirmationCount,
      reasonCodes: ['verifier-contradiction']
    });
  }

  if (
    document.deterministic_checks.some(item => item.result === 'UNKNOWN')
    || document.semantic_observations.length === 0
    || document.semantic_observations.some(item => item.evidence_state === 'insufficient-evidence' || item.evidence_state === 'invalid-evidence')
    || independentConfirmationCount === 0
  ) {
    return resolvedEnvelope(document, {
      status: 'insufficient-evidence',
      profileApplicability: 'applicable',
      deterministicFailureCount,
      independentConfirmationCount,
      reasonCodes: ['insufficient-current-evidence']
    });
  }

  if (document.semantic_observations.some(item => item.evidence_state === 'conflicting-evidence')) {
    return resolvedEnvelope(document, {
      status: 'conflicting-evidence',
      profileApplicability: 'applicable',
      deterministicFailureCount,
      independentConfirmationCount,
      reasonCodes: ['semantic-evidence-conflict']
    });
  }

  const hasCaveats = document.unresolved_unknowns.length > 0
    || document.semantic_observations.some(item => item.evidence_state === 'stale-evidence')
    || document.verifiers.some(item => item.result === 'abstains');

  return resolvedEnvelope(document, {
    status: hasCaveats ? 'supported-with-caveats' : 'supported',
    profileApplicability: 'applicable',
    deterministicFailureCount,
    independentConfirmationCount,
    reasonCodes: hasCaveats ? ['bounded-caveats-present'] : []
  });
}
