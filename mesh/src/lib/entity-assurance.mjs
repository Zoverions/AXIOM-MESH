import {
  ValidationError,
  assertPlainObject,
  assertString,
  digestObject
} from './canonical.mjs';

export const ENTITY_ASSURANCE_EVIDENCE_SCHEMA = 'axiom-entity-assurance-evidence.v1';
export const ENTITY_ASSURANCE_POLICY_SCHEMA = 'axiom-entity-assurance-policy.v1';
export const ENTITY_ASSURANCE_DECISION_SCHEMA = 'axiom-entity-assurance-decision.v1';

export const ENTITY_ASSURANCE_DIMENSIONS = Object.freeze([
  'continuity',
  'uniqueness',
  'provenance',
  'authority',
  'independence',
  'reputation',
  'attestation',
  'credentialing',
  'human_sponsorship',
  'hardware_binding',
  'organization_binding'
]);

const DIMENSIONS = new Set(ENTITY_ASSURANCE_DIMENSIONS);
const RESULTS = new Set(['pass', 'fail', 'unknown']);
const STRENGTHS = new Set(['weak', 'moderate', 'strong']);
const STRENGTH_RANK = Object.freeze({ weak: 1, moderate: 2, strong: 3 });
const EVIDENCE_CLASSES = new Set([
  'measured',
  'authenticated_assertion',
  'independently_verified',
  'inference',
  'declaration'
]);
const BINDING_SCOPES = new Set(['none', 'pseudonymous', 'legal', 'organization', 'hardware']);
const IDENTITY_REQUIREMENTS = new Set(['none', 'persistent-pseudonymous', 'legal']);
const ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,191}$/;
const DIGEST = /^[a-f0-9]{64}$/;

const EVIDENCE_FIELDS = new Set([
  'schema',
  'evidence_id',
  'subject_id',
  'dimension',
  'result',
  'strength',
  'evidence_class',
  'basis_digest',
  'issuer_id',
  'binding_scope',
  'observed_at',
  'expires_at',
  'non_authorizing',
  'evidence_digest'
]);
const POLICY_FIELDS = new Set([
  'schema',
  'policy_id',
  'identity_requirement',
  'requirements',
  'authority_effect',
  'delegation_effect',
  'policy_digest'
]);
const REQUIREMENT_FIELDS = new Set([
  'dimension',
  'minimum_strength',
  'accepted_evidence_classes'
]);

function rejectUnknown(value, allowed, label) {
  const unknown = Object.keys(value).filter(key => !allowed.has(key));
  if (unknown.length) {
    throw new ValidationError(`${label} contains unsupported fields: ${unknown.join(', ')}`);
  }
}

function identifier(value, label) {
  return assertString(value, label, { min: 1, max: 192, pattern: ID });
}

function digest(value, label) {
  return assertString(value, label, { min: 64, max: 64, pattern: DIGEST });
}

function canonicalTimestamp(value, label) {
  const text = assertString(value, label, { min: 24, max: 24 });
  const parsed = new Date(text);
  if (Number.isNaN(parsed.valueOf()) || parsed.toISOString() !== text) {
    throw new ValidationError(`${label} must be a canonical UTC ISO timestamp`);
  }
  return text;
}

function optionalTimestamp(value, label) {
  return value === null || value === undefined ? null : canonicalTimestamp(value, label);
}

function enumValue(value, allowed, label) {
  const text = assertString(value, label, { min: 1, max: 64 });
  if (!allowed.has(text)) throw new ValidationError(`${label} is unsupported`);
  return text;
}

export function normalizeEntityAssuranceEvidence(raw) {
  const value = assertPlainObject(raw, 'entity assurance evidence');
  rejectUnknown(value, EVIDENCE_FIELDS, 'entity assurance evidence');
  if (value.schema !== ENTITY_ASSURANCE_EVIDENCE_SCHEMA) {
    throw new ValidationError(
      `entity assurance evidence schema must be ${ENTITY_ASSURANCE_EVIDENCE_SCHEMA}`
    );
  }
  if (value.non_authorizing !== true) {
    throw new ValidationError('entity assurance evidence must remain non-authorizing');
  }

  const dimension = enumValue(value.dimension, DIMENSIONS, 'entity assurance dimension');
  const result = enumValue(value.result, RESULTS, 'entity assurance result');
  const strength = enumValue(value.strength, STRENGTHS, 'entity assurance strength');
  const evidenceClass = enumValue(
    value.evidence_class,
    EVIDENCE_CLASSES,
    'entity assurance evidence_class'
  );
  const bindingScope = enumValue(
    value.binding_scope,
    BINDING_SCOPES,
    'entity assurance binding_scope'
  );
  const observedAt = canonicalTimestamp(value.observed_at, 'entity assurance observed_at');
  const expiresAt = optionalTimestamp(value.expires_at, 'entity assurance expires_at');
  if (expiresAt !== null && new Date(expiresAt).valueOf() <= new Date(observedAt).valueOf()) {
    throw new ValidationError('entity assurance expires_at must follow observed_at');
  }

  const body = Object.freeze({
    schema: ENTITY_ASSURANCE_EVIDENCE_SCHEMA,
    evidence_id: identifier(value.evidence_id, 'entity assurance evidence_id'),
    subject_id: identifier(value.subject_id, 'entity assurance subject_id'),
    dimension,
    result,
    strength,
    evidence_class: evidenceClass,
    basis_digest: digest(value.basis_digest, 'entity assurance basis_digest'),
    issuer_id: value.issuer_id === null || value.issuer_id === undefined
      ? null
      : identifier(value.issuer_id, 'entity assurance issuer_id'),
    binding_scope: bindingScope,
    observed_at: observedAt,
    expires_at: expiresAt,
    non_authorizing: true
  });
  const evidenceDigest = digestObject(body);
  if (
    value.evidence_digest !== undefined
    && digest(value.evidence_digest, 'entity assurance evidence_digest') !== evidenceDigest
  ) {
    throw new ValidationError('entity assurance evidence_digest mismatch');
  }
  return Object.freeze({
    ...body,
    evidence_digest: evidenceDigest,
    authority_granted: false
  });
}

function normalizeRequirement(raw, index) {
  const value = assertPlainObject(raw, `entity assurance requirements[${index}]`);
  rejectUnknown(value, REQUIREMENT_FIELDS, `entity assurance requirements[${index}]`);
  const dimension = enumValue(
    value.dimension,
    DIMENSIONS,
    `entity assurance requirements[${index}].dimension`
  );
  const minimumStrength = enumValue(
    value.minimum_strength,
    STRENGTHS,
    `entity assurance requirements[${index}].minimum_strength`
  );
  if (!Array.isArray(value.accepted_evidence_classes) || value.accepted_evidence_classes.length < 1
      || value.accepted_evidence_classes.length > EVIDENCE_CLASSES.size) {
    throw new ValidationError(
      `entity assurance requirements[${index}].accepted_evidence_classes must contain 1-${EVIDENCE_CLASSES.size} items`
    );
  }
  const accepted = value.accepted_evidence_classes.map((item, classIndex) => enumValue(
    item,
    EVIDENCE_CLASSES,
    `entity assurance requirements[${index}].accepted_evidence_classes[${classIndex}]`
  ));
  if (new Set(accepted).size !== accepted.length) {
    throw new ValidationError('entity assurance accepted evidence classes must not contain duplicates');
  }
  return Object.freeze({
    dimension,
    minimum_strength: minimumStrength,
    accepted_evidence_classes: Object.freeze([...accepted].sort())
  });
}

export function normalizeEntityAssurancePolicy(raw) {
  const value = assertPlainObject(raw, 'entity assurance policy');
  rejectUnknown(value, POLICY_FIELDS, 'entity assurance policy');
  if (value.schema !== ENTITY_ASSURANCE_POLICY_SCHEMA) {
    throw new ValidationError(
      `entity assurance policy schema must be ${ENTITY_ASSURANCE_POLICY_SCHEMA}`
    );
  }
  if (value.authority_effect !== 'none') {
    throw new ValidationError('entity assurance policy authority_effect must be none');
  }
  if (value.delegation_effect !== 'none') {
    throw new ValidationError('entity assurance policy delegation_effect must be none');
  }
  if (!Array.isArray(value.requirements) || value.requirements.length > DIMENSIONS.size) {
    throw new ValidationError(
      `entity assurance requirements must be an array with at most ${DIMENSIONS.size} items`
    );
  }
  const requirements = value.requirements.map(normalizeRequirement);
  const dimensions = requirements.map(item => item.dimension);
  if (new Set(dimensions).size !== dimensions.length) {
    throw new ValidationError('entity assurance policy contains duplicate dimension requirements');
  }
  const body = Object.freeze({
    schema: ENTITY_ASSURANCE_POLICY_SCHEMA,
    policy_id: identifier(value.policy_id, 'entity assurance policy_id'),
    identity_requirement: enumValue(
      value.identity_requirement,
      IDENTITY_REQUIREMENTS,
      'entity assurance identity_requirement'
    ),
    requirements: Object.freeze([...requirements].sort((left, right) => (
      left.dimension.localeCompare(right.dimension)
    ))),
    authority_effect: 'none',
    delegation_effect: 'none'
  });
  const policyDigest = digestObject(body);
  if (
    value.policy_digest !== undefined
    && digest(value.policy_digest, 'entity assurance policy_digest') !== policyDigest
  ) {
    throw new ValidationError('entity assurance policy_digest mismatch');
  }
  return Object.freeze({ ...body, policy_digest: policyDigest });
}

function isCurrent(item, nowValue) {
  const observed = new Date(item.observed_at).valueOf();
  if (observed > nowValue) return false;
  return item.expires_at === null || new Date(item.expires_at).valueOf() > nowValue;
}

function satisfiesIdentityRequirement(identityRequirement, evidence) {
  if (identityRequirement === 'none') return true;
  if (identityRequirement === 'persistent-pseudonymous') {
    return evidence.some(item => (
      item.dimension === 'continuity'
      && item.result === 'pass'
      && ['pseudonymous', 'legal', 'organization', 'hardware'].includes(item.binding_scope)
    ));
  }
  return evidence.some(item => item.result === 'pass' && item.binding_scope === 'legal');
}

export function evaluateEntityAssurance({ policy, evidence, subjectId, now } = {}) {
  const normalizedPolicy = normalizeEntityAssurancePolicy(policy);
  const subject = identifier(subjectId, 'entity assurance evaluation subjectId');
  const evaluationTime = canonicalTimestamp(now, 'entity assurance evaluation now');
  if (!Array.isArray(evidence) || evidence.length > 4096) {
    throw new ValidationError('entity assurance evidence must be an array with at most 4096 items');
  }
  const normalizedEvidence = evidence.map(normalizeEntityAssuranceEvidence);
  const evidenceIds = normalizedEvidence.map(item => item.evidence_id);
  if (new Set(evidenceIds).size !== evidenceIds.length) {
    throw new ValidationError('entity assurance evidence ids must be unique');
  }
  for (const item of normalizedEvidence) {
    if (item.subject_id !== subject) {
      throw new ValidationError('entity assurance evidence subject does not match evaluation subject');
    }
  }

  const nowValue = new Date(evaluationTime).valueOf();
  const currentEvidence = normalizedEvidence.filter(item => isCurrent(item, nowValue));
  const satisfiedDimensions = [];
  const deniedDimensions = [];
  const missingDimensions = [];

  for (const requirement of normalizedPolicy.requirements) {
    const eligible = currentEvidence.filter(item => (
      item.dimension === requirement.dimension
      && STRENGTH_RANK[item.strength] >= STRENGTH_RANK[requirement.minimum_strength]
      && requirement.accepted_evidence_classes.includes(item.evidence_class)
    ));
    if (eligible.some(item => item.result === 'fail')) {
      deniedDimensions.push(requirement.dimension);
      continue;
    }
    if (eligible.some(item => item.result === 'pass')) {
      satisfiedDimensions.push(requirement.dimension);
      continue;
    }
    missingDimensions.push(requirement.dimension);
  }

  const identitySatisfied = satisfiesIdentityRequirement(
    normalizedPolicy.identity_requirement,
    currentEvidence
  );
  const satisfied = deniedDimensions.length === 0
    && missingDimensions.length === 0
    && identitySatisfied;

  const body = Object.freeze({
    schema: ENTITY_ASSURANCE_DECISION_SCHEMA,
    policy_id: normalizedPolicy.policy_id,
    policy_digest: normalizedPolicy.policy_digest,
    subject_id: subject,
    evaluated_at: evaluationTime,
    decision: satisfied ? 'satisfied' : 'denied',
    satisfied,
    identity_requirement: normalizedPolicy.identity_requirement,
    identity_satisfied: identitySatisfied,
    legal_identity_required: normalizedPolicy.identity_requirement === 'legal',
    satisfied_dimensions: Object.freeze([...satisfiedDimensions].sort()),
    denied_dimensions: Object.freeze([...deniedDimensions].sort()),
    missing_dimensions: Object.freeze([...missingDimensions].sort()),
    considered_evidence_digests: Object.freeze(
      currentEvidence.map(item => item.evidence_digest).sort()
    ),
    authority_granted: false,
    delegation_granted: false
  });
  return Object.freeze({ ...body, decision_digest: digestObject(body) });
}
