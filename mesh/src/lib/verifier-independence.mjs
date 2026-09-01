import {
  ValidationError,
  assertPlainObject,
  assertString,
  digestObject
} from './canonical.mjs';

export const VERIFIER_PROFILE_SCHEMA = 'axiom-verifier-profile.v1';
export const VERIFIER_INDEPENDENCE_SCHEMA = 'axiom-verifier-independence.v1';

const ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,191}$/;
const DIGEST = /^[a-f0-9]{64}$/;
const PROFILE_FIELDS = new Set([
  'schema',
  'verifier_id',
  'context_digest',
  'evidence_set_digest',
  'method_id',
  'runtime_id',
  'model_family',
  'operator_domain'
]);

function rejectUnknown(value, allowed, label) {
  const unknown = Object.keys(value).filter(key => !allowed.has(key));
  if (unknown.length) {
    throw new ValidationError(`${label} contains unsupported fields: ${unknown.join(', ')}`);
  }
}

function id(value, label) {
  return assertString(value, label, { min: 1, max: 192, pattern: ID });
}

function digest(value, label) {
  return assertString(value, label, { min: 64, max: 64, pattern: DIGEST });
}

export function normalizeVerifierProfile(raw) {
  const value = assertPlainObject(raw, 'verifier profile');
  rejectUnknown(value, PROFILE_FIELDS, 'verifier profile');
  if (value.schema !== VERIFIER_PROFILE_SCHEMA) {
    throw new ValidationError(`verifier profile schema must be ${VERIFIER_PROFILE_SCHEMA}`);
  }
  const body = Object.freeze({
    schema: VERIFIER_PROFILE_SCHEMA,
    verifier_id: id(value.verifier_id, 'verifier profile verifier_id'),
    context_digest: digest(value.context_digest, 'verifier profile context_digest'),
    evidence_set_digest: digest(value.evidence_set_digest, 'verifier profile evidence_set_digest'),
    method_id: id(value.method_id, 'verifier profile method_id'),
    runtime_id: id(value.runtime_id, 'verifier profile runtime_id'),
    model_family: id(value.model_family, 'verifier profile model_family'),
    operator_domain: id(value.operator_domain, 'verifier profile operator_domain')
  });
  return Object.freeze({ ...body, profile_digest: digestObject(body) });
}

export function evaluateVerifierIndependence(leftRaw, rightRaw) {
  const left = normalizeVerifierProfile(leftRaw);
  const right = normalizeVerifierProfile(rightRaw);

  if (left.verifier_id === right.verifier_id) {
    throw new ValidationError('verifier independence requires distinct verifier identities');
  }

  const differing = [];
  const shared = [];
  for (const field of [
    'context_digest',
    'evidence_set_digest',
    'method_id',
    'runtime_id',
    'model_family',
    'operator_domain'
  ]) {
    if (left[field] === right[field]) shared.push(field);
    else differing.push(field);
  }

  const independentEvidence = left.evidence_set_digest !== right.evidence_set_digest;
  const independentContext = left.context_digest !== right.context_digest;
  const independentMethodOrRuntime = (
    left.method_id !== right.method_id
    || left.runtime_id !== right.runtime_id
    || left.model_family !== right.model_family
  );
  const separateOperatorDomain = left.operator_domain !== right.operator_domain;

  const meaningful = (
    (independentEvidence || independentContext)
    && independentMethodOrRuntime
    && differing.length >= 2
  );

  const body = Object.freeze({
    schema: VERIFIER_INDEPENDENCE_SCHEMA,
    left_profile_digest: left.profile_digest,
    right_profile_digest: right.profile_digest,
    meaningful_independence: meaningful,
    independent_evidence: independentEvidence,
    independent_context: independentContext,
    independent_method_or_runtime: independentMethodOrRuntime,
    separate_operator_domain: separateOperatorDomain,
    differing_dimensions: Object.freeze([...differing].sort()),
    shared_dimensions: Object.freeze([...shared].sort()),
    authority_effect: 'none'
  });

  return Object.freeze({ ...body, independence_digest: digestObject(body) });
}
