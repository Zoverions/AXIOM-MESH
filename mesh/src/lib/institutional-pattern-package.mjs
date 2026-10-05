import {
  ValidationError,
  assertPlainObject,
  assertString
} from './canonical.mjs';

export const INSTITUTIONAL_PATTERN_SCHEMA = 'axiom-institutional-pattern-package.v1';

const ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,191}$/;
const REQUIRED_AUTHORITY = Object.freeze({
  import_grants_authority: false,
  installation_grants_authority: false,
  pattern_role_grants_authority: false,
  credential_grants_authority: false,
  collective_result_grants_authority: false,
  effect_requires_local_admission: true,
  authority_effect: 'none'
});

function exact(raw, keys, label) {
  const value = assertPlainObject(raw, label);
  const allowed = new Set(keys);
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) throw new ValidationError(`${label} contains unsupported field ${key}`);
  }
  for (const key of keys) {
    if (!Object.hasOwn(value, key)) throw new ValidationError(`${label} is missing required field ${key}`);
  }
  return value;
}

function id(value, label) {
  return assertString(value, label, { min: 1, max: 192, pattern: ID });
}

function strings(value, label, { min = 0, max = 128 } = {}) {
  if (!Array.isArray(value) || value.length < min || value.length > max) {
    throw new ValidationError(`${label} must contain ${min}-${max} strings`);
  }
  const result = value.map((entry, index) =>
    assertString(entry, `${label}[${index}]`, { min: 1, max: 512 })
  );
  if (new Set(result).size !== result.length) {
    throw new ValidationError(`${label} must not contain duplicates`);
  }
  return Object.freeze(result);
}

export function validateInstitutionalPatternPackage(raw, { primitiveIds }) {
  const value = exact(raw, [
    'schema','package_id','version','title','provenance','applicability','primitives',
    'workflow','local_adaptation_required','simulation_required_before_live_adoption',
    'authority','limitations'
  ], 'institutional pattern package');

  if (value.schema !== INSTITUTIONAL_PATTERN_SCHEMA) {
    throw new ValidationError('institutional pattern schema is invalid');
  }
  id(value.package_id, 'institutional pattern package_id');
  assertString(value.version, 'institutional pattern version', {
    min: 5, max: 32, pattern: /^[0-9]+\.[0-9]+\.[0-9]+(?:-[A-Za-z0-9.-]+)?$/
  });
  assertString(value.title, 'institutional pattern title', { min: 1, max: 256 });

  const provenance = exact(value.provenance, ['author','source','license'], 'institutional pattern provenance');
  assertString(provenance.author, 'institutional pattern provenance author', { min: 1, max: 256 });
  assertString(provenance.source, 'institutional pattern provenance source', { min: 1, max: 512 });
  assertString(provenance.license, 'institutional pattern provenance license', { min: 1, max: 128 });

  const applicability = exact(value.applicability, ['domains','jurisdiction','assumptions'], 'institutional pattern applicability');
  strings(applicability.domains, 'institutional pattern domains', { min: 1, max: 64 });
  assertString(applicability.jurisdiction, 'institutional pattern jurisdiction', { min: 1, max: 256 });
  strings(applicability.assumptions, 'institutional pattern assumptions', { min: 1, max: 64 });

  if (!(primitiveIds instanceof Set) || primitiveIds.size === 0) {
    throw new ValidationError('institutional primitive registry is required');
  }
  const primitives = strings(value.primitives, 'institutional pattern primitives', { min: 1, max: 128 });
  for (const primitive of primitives) {
    if (!primitiveIds.has(primitive)) {
      throw new ValidationError(`institutional pattern references unknown primitive ${primitive}`);
    }
  }

  if (!Array.isArray(value.workflow) || value.workflow.length < 1 || value.workflow.length > 256) {
    throw new ValidationError('institutional pattern workflow must contain 1-256 steps');
  }
  const seenSteps = new Set();
  for (const [index, rawStep] of value.workflow.entries()) {
    const step = exact(rawStep, ['step','primitive'], `institutional pattern workflow[${index}]`);
    id(step.step, `institutional pattern workflow[${index}].step`);
    if (seenSteps.has(step.step)) throw new ValidationError('institutional pattern workflow step ids must be unique');
    seenSteps.add(step.step);
    if (!primitiveIds.has(step.primitive) || !primitives.includes(step.primitive)) {
      throw new ValidationError(`institutional pattern workflow references unavailable primitive ${step.primitive}`);
    }
  }

  if (value.local_adaptation_required !== true) {
    throw new ValidationError('institutional pattern must require local adaptation');
  }
  if (value.simulation_required_before_live_adoption !== true) {
    throw new ValidationError('institutional pattern must require simulation before live adoption');
  }

  const authority = exact(value.authority, Object.keys(REQUIRED_AUTHORITY), 'institutional pattern authority');
  for (const [key, expected] of Object.entries(REQUIRED_AUTHORITY)) {
    if (authority[key] !== expected) {
      throw new ValidationError(`institutional pattern authority invariant failed for ${key}`);
    }
  }

  strings(value.limitations, 'institutional pattern limitations', { min: 1, max: 64 });

  return Object.freeze({
    valid: true,
    package_id: value.package_id,
    version: value.version,
    primitive_count: primitives.length,
    workflow_step_count: value.workflow.length,
    authority_effect: 'none',
    local_adaptation_required: true,
    simulation_required_before_live_adoption: true
  });
}
