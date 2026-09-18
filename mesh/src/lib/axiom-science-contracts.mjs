import {
  assertPlainObject,
  assertString,
  canonicalJson,
  digestObject,
  ValidationError
} from './canonical.mjs';

export const AXIOM_SCIENCE_STUDY_SCHEMA = 'axiom-science-study.v0';
export const AXIOM_SCIENCE_EXPERIMENT_PROPOSAL_SCHEMA = 'axiom-science-experiment-proposal.v0';

const MAX_OBJECT_BYTES = 65_536;
const DIGEST_PATTERN = /^sha256:[0-9a-f]{64}$/;
const IDENTIFIER_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:/-]*$/;

const NETWORK_REQUIREMENTS = new Set([
  'none',
  'synthetic_loopback_only',
  'external_required',
  'unknown'
]);
const FILESYSTEM_REQUIREMENTS = new Set([
  'none',
  'read_only',
  'isolated_write',
  'host_write_required',
  'unknown'
]);
const CREDENTIAL_REQUIREMENTS = new Set([
  'none',
  'scoped_credential_required',
  'unknown'
]);
const SPEND_REQUIREMENTS = new Set([
  'none',
  'budget_required',
  'unknown'
]);
const EFFECT_CLASSES = new Set([
  'read_only',
  'local_mutation',
  'external_mutation',
  'external_message',
  'publication',
  'physical_effect',
  'data_disclosure',
  'spending',
  'unknown'
]);

const STUDY_FIELDS = Object.freeze([
  'schema',
  'study_id',
  'purpose',
  'question_digest',
  'scope',
  'population_or_domain_constraints',
  'participant_principal_refs',
  'methodology_refs',
  'source_manifest_digests',
  'epistemic_object_refs',
  'disclosure_policy_refs',
  'preregistration_refs',
  'created_at',
  'study_digest',
  'authority_effect'
]);

const EXPERIMENT_PROPOSAL_FIELDS = Object.freeze([
  'schema',
  'experiment_proposal_id',
  'study_digest',
  'question_digest',
  'hypothesis_claim_refs',
  'operation_candidate_refs',
  'protocol_refs',
  'declared_inputs',
  'declared_outputs',
  'data_classes',
  'environment_requirements',
  'instrument_requirements',
  'network_requirement',
  'filesystem_requirement',
  'credential_requirement',
  'spend_requirement',
  'declared_effect_classes',
  'safety_constraint_refs',
  'stopping_conditions',
  'analysis_plan_ref',
  'proposed_execution_principal',
  'created_at',
  'proposal_digest',
  'execution_authority',
  'authority_effect'
]);

export function scienceContractDigest(value, digestField) {
  assertPlainObject(value, 'contract');
  assertString(digestField, 'digestField', { max: 128 });
  const copy = { ...value };
  delete copy[digestField];
  return `sha256:${digestObject(copy)}`;
}

export function verifyScienceStudy(value) {
  const object = boundedCanonical(value, 'ScienceStudy');
  assertExactFields(object, STUDY_FIELDS, 'ScienceStudy');
  if (object.schema !== AXIOM_SCIENCE_STUDY_SCHEMA) {
    throw new ValidationError(`ScienceStudy.schema must equal ${AXIOM_SCIENCE_STUDY_SCHEMA}`);
  }
  assertIdentifier(object.study_id, 'ScienceStudy.study_id');
  assertNonEmptyString(object.purpose, 'ScienceStudy.purpose', 8192);
  assertDigest(object.question_digest, 'ScienceStudy.question_digest');
  assertNonEmptyString(object.scope, 'ScienceStudy.scope', 4096);
  assertUniqueStrings(
    object.population_or_domain_constraints,
    'ScienceStudy.population_or_domain_constraints',
    { maxItems: 32, itemMax: 2048 }
  );
  assertUniqueStrings(
    object.participant_principal_refs,
    'ScienceStudy.participant_principal_refs',
    { minItems: 1, maxItems: 64, itemMax: 512 }
  );
  assertUniqueStrings(object.methodology_refs, 'ScienceStudy.methodology_refs', {
    maxItems: 64,
    itemMax: 2048
  });
  assertUniqueDigests(object.source_manifest_digests, 'ScienceStudy.source_manifest_digests', {
    maxItems: 64
  });
  assertUniqueDigests(object.epistemic_object_refs, 'ScienceStudy.epistemic_object_refs', {
    maxItems: 128
  });
  assertUniqueStrings(object.disclosure_policy_refs, 'ScienceStudy.disclosure_policy_refs', {
    maxItems: 32,
    itemMax: 2048
  });
  assertUniqueStrings(object.preregistration_refs, 'ScienceStudy.preregistration_refs', {
    maxItems: 32,
    itemMax: 2048
  });
  assertTimestamp(object.created_at, 'ScienceStudy.created_at');
  assertDigest(object.study_digest, 'ScienceStudy.study_digest');
  if (object.authority_effect !== 'none') {
    throw new ValidationError('ScienceStudy.authority_effect must equal none');
  }
  assertSelfDigest(object, 'study_digest', 'ScienceStudy');
  return object;
}

export function verifyScienceExperimentProposal(value) {
  const object = boundedCanonical(value, 'ScienceExperimentProposal');
  assertExactFields(object, EXPERIMENT_PROPOSAL_FIELDS, 'ScienceExperimentProposal');
  if (object.schema !== AXIOM_SCIENCE_EXPERIMENT_PROPOSAL_SCHEMA) {
    throw new ValidationError(
      `ScienceExperimentProposal.schema must equal ${AXIOM_SCIENCE_EXPERIMENT_PROPOSAL_SCHEMA}`
    );
  }
  assertIdentifier(
    object.experiment_proposal_id,
    'ScienceExperimentProposal.experiment_proposal_id'
  );
  assertDigest(object.study_digest, 'ScienceExperimentProposal.study_digest');
  assertDigest(object.question_digest, 'ScienceExperimentProposal.question_digest');
  assertUniqueDigests(
    object.hypothesis_claim_refs,
    'ScienceExperimentProposal.hypothesis_claim_refs',
    { maxItems: 32 }
  );
  assertUniqueDigests(
    object.operation_candidate_refs,
    'ScienceExperimentProposal.operation_candidate_refs',
    { maxItems: 32 }
  );
  assertUniqueDigests(object.protocol_refs, 'ScienceExperimentProposal.protocol_refs', {
    minItems: 1,
    maxItems: 32
  });
  assertUniqueStrings(object.declared_inputs, 'ScienceExperimentProposal.declared_inputs', {
    maxItems: 64,
    itemMax: 2048
  });
  assertUniqueStrings(object.declared_outputs, 'ScienceExperimentProposal.declared_outputs', {
    minItems: 1,
    maxItems: 64,
    itemMax: 2048
  });
  assertUniqueStrings(object.data_classes, 'ScienceExperimentProposal.data_classes', {
    maxItems: 32,
    itemMax: 256
  });
  assertUniqueStrings(
    object.environment_requirements,
    'ScienceExperimentProposal.environment_requirements',
    { maxItems: 32, itemMax: 2048 }
  );
  assertUniqueStrings(
    object.instrument_requirements,
    'ScienceExperimentProposal.instrument_requirements',
    { maxItems: 32, itemMax: 2048 }
  );
  assertEnum(
    object.network_requirement,
    NETWORK_REQUIREMENTS,
    'ScienceExperimentProposal.network_requirement'
  );
  assertEnum(
    object.filesystem_requirement,
    FILESYSTEM_REQUIREMENTS,
    'ScienceExperimentProposal.filesystem_requirement'
  );
  assertEnum(
    object.credential_requirement,
    CREDENTIAL_REQUIREMENTS,
    'ScienceExperimentProposal.credential_requirement'
  );
  assertEnum(
    object.spend_requirement,
    SPEND_REQUIREMENTS,
    'ScienceExperimentProposal.spend_requirement'
  );
  assertUniqueStrings(
    object.declared_effect_classes,
    'ScienceExperimentProposal.declared_effect_classes',
    { minItems: 1, maxItems: 9, itemMax: 128 }
  );
  object.declared_effect_classes.forEach((item, index) =>
    assertEnum(
      item,
      EFFECT_CLASSES,
      `ScienceExperimentProposal.declared_effect_classes[${index}]`
    )
  );
  assertUniqueStrings(
    object.safety_constraint_refs,
    'ScienceExperimentProposal.safety_constraint_refs',
    { maxItems: 32, itemMax: 2048 }
  );
  assertUniqueStrings(
    object.stopping_conditions,
    'ScienceExperimentProposal.stopping_conditions',
    { minItems: 1, maxItems: 32, itemMax: 2048 }
  );
  assertDigest(object.analysis_plan_ref, 'ScienceExperimentProposal.analysis_plan_ref');
  assertNonEmptyString(
    object.proposed_execution_principal,
    'ScienceExperimentProposal.proposed_execution_principal',
    512
  );
  assertTimestamp(object.created_at, 'ScienceExperimentProposal.created_at');
  if (object.execution_authority !== 'none') {
    throw new ValidationError('ScienceExperimentProposal.execution_authority must equal none');
  }
  if (object.authority_effect !== 'none') {
    throw new ValidationError('ScienceExperimentProposal.authority_effect must equal none');
  }

  const hasUnknownRequirement = [
    object.network_requirement,
    object.filesystem_requirement,
    object.credential_requirement,
    object.spend_requirement
  ].includes('unknown') ||
    object.data_classes.includes('unknown') ||
    object.environment_requirements.includes('unknown') ||
    object.instrument_requirements.includes('unknown');

  if (hasUnknownRequirement && !object.declared_effect_classes.includes('unknown')) {
    throw new ValidationError(
      'ScienceExperimentProposal unknown requirements must preserve unknown effect classification'
    );
  }

  assertDigest(object.proposal_digest, 'ScienceExperimentProposal.proposal_digest');
  assertSelfDigest(object, 'proposal_digest', 'ScienceExperimentProposal');
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

function assertIdentifier(value, name) {
  assertString(value, name, { max: 512 });
  if (!IDENTIFIER_PATTERN.test(value)) {
    throw new ValidationError(`${name} has invalid identifier syntax`);
  }
}

function assertNonEmptyString(value, name, max) {
  assertString(value, name, { max });
  if (value.length === 0) {
    throw new ValidationError(`${name} must not be empty`);
  }
}

function assertDigest(value, name) {
  assertString(value, name, { max: 71 });
  if (!DIGEST_PATTERN.test(value)) {
    throw new ValidationError(`${name} must be a sha256 digest`);
  }
}

function assertTimestamp(value, name) {
  assertString(value, name, { max: 64 });
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString() !== value) {
    throw new ValidationError(`${name} must be a canonical UTC ISO-8601 timestamp`);
  }
}

function assertEnum(value, allowed, name) {
  assertString(value, name, { max: 128 });
  if (!allowed.has(value)) {
    throw new ValidationError(`${name} is not an allowed value`);
  }
}

function assertUniqueStrings(
  value,
  name,
  { minItems = 0, maxItems, itemMax } = {}
) {
  if (!Array.isArray(value)) {
    throw new ValidationError(`${name} must be an array`);
  }
  if (value.length < minItems || value.length > maxItems) {
    throw new ValidationError(
      `${name} must contain between ${minItems} and ${maxItems} items`
    );
  }
  const seen = new Set();
  for (let index = 0; index < value.length; index += 1) {
    assertNonEmptyString(value[index], `${name}[${index}]`, itemMax);
    if (seen.has(value[index])) {
      throw new ValidationError(`${name} items must be unique`);
    }
    seen.add(value[index]);
  }
}

function assertUniqueDigests(value, name, { minItems = 0, maxItems } = {}) {
  assertUniqueStrings(value, name, { minItems, maxItems, itemMax: 71 });
  value.forEach((item, index) => assertDigest(item, `${name}[${index}]`));
}

function assertSelfDigest(object, digestField, name) {
  const expected = scienceContractDigest(object, digestField);
  if (object[digestField] !== expected) {
    throw new ValidationError(`${name} digest mismatch`);
  }
}
