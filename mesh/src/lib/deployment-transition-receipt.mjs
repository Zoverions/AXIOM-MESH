import {
  ValidationError,
  assertPlainObject,
  assertString,
  assertStringArray
} from './canonical.mjs';

export const DEPLOYMENT_TRANSITION_RECEIPT_SCHEMA =
  'axiom-deployment-transition-receipt.v1';

const ID = /^[A-Za-z0-9][A-Za-z0-9_.:/-]{0,191}$/;
const DIGEST = /^[a-f0-9]{64}$/;

const ALLOWED_TRANSITIONS = new Set([
  'admitted_inert->staging',
  'staging->active',
  'active->suspended',
  'active->rolled_back',
  'suspended->active',
  'suspended->rolled_back',
  'rolled_back->staging',
  'active->retired',
  'suspended->retired',
  'rolled_back->retired'
]);

function exact(raw, fields, label) {
  const value = assertPlainObject(raw, label);
  const allowed = new Set(fields);
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) throw new ValidationError(`${label} contains unsupported field ${key}`);
  }
  for (const key of fields) {
    if (!Object.hasOwn(value, key)) throw new ValidationError(`${label} is missing required field ${key}`);
  }
  return value;
}

function id(value, label) {
  return assertString(value, label, { min: 1, max: 192, pattern: ID });
}

function digest(value, label) {
  return assertString(value, label, { min: 64, max: 64, pattern: DIGEST });
}

function timestamp(value, label) {
  const text = assertString(value, label, { min: 24, max: 24 });
  const parsed = new Date(text);
  if (Number.isNaN(parsed.valueOf()) || parsed.toISOString() !== text) {
    throw new ValidationError(`${label} must be canonical UTC ISO`);
  }
  return text;
}

export function validateDeploymentTransitionReceipt(raw) {
  const value = exact(raw, [
    'schema',
    'receipt_id',
    'target_instance_id',
    'admission_id',
    'from_state',
    'to_state',
    'artifact_digests',
    'policy_digest',
    'transition_authority',
    'health',
    'rollback',
    'occurred_at',
    'offline_context',
    'limitations'
  ], 'deployment transition receipt');

  if (value.schema !== DEPLOYMENT_TRANSITION_RECEIPT_SCHEMA) {
    throw new ValidationError('deployment transition receipt schema is invalid');
  }

  id(value.receipt_id, 'receipt_id');
  id(value.target_instance_id, 'target_instance_id');
  id(value.admission_id, 'admission_id');
  id(value.from_state, 'from_state');
  id(value.to_state, 'to_state');

  const transition = `${value.from_state}->${value.to_state}`;
  if (!ALLOWED_TRANSITIONS.has(transition)) {
    throw new ValidationError(`deployment transition is not allowed: ${transition}`);
  }

  const artifacts = assertStringArray(value.artifact_digests, 'artifact_digests', {
    maxItems: 512,
    itemMax: 64
  });
  if (artifacts.length === 0) {
    throw new ValidationError('deployment transition receipt requires artifact_digests');
  }
  for (const [index, item] of artifacts.entries()) digest(item, `artifact_digests[${index}]`);

  digest(value.policy_digest, 'policy_digest');

  const authority = exact(value.transition_authority, [
    'mode',
    'grant_or_policy_evidence_digest',
    'fresh_at_transition'
  ], 'transition_authority');
  id(authority.mode, 'transition_authority.mode');
  digest(authority.grant_or_policy_evidence_digest, 'transition_authority.grant_or_policy_evidence_digest');
  if (typeof authority.fresh_at_transition !== 'boolean') {
    throw new ValidationError('transition_authority.fresh_at_transition must be boolean');
  }

  const reducingRisk =
    value.to_state === 'suspended' ||
    value.to_state === 'rolled_back' ||
    value.to_state === 'retired';

  if (!authority.fresh_at_transition && !reducingRisk) {
    throw new ValidationError('non-reducing transition requires fresh authority at transition');
  }

  if (
    authority.mode === 'preauthorized_fail_safe' &&
    !reducingRisk
  ) {
    throw new ValidationError('preauthorized_fail_safe may only reduce or terminate runtime effects');
  }

  const health = exact(value.health, [
    'pre_transition_check_passed',
    'post_transition_check_passed',
    'evidence_digests'
  ], 'health');
  if (typeof health.pre_transition_check_passed !== 'boolean') {
    throw new ValidationError('health.pre_transition_check_passed must be boolean');
  }
  if (typeof health.post_transition_check_passed !== 'boolean') {
    throw new ValidationError('health.post_transition_check_passed must be boolean');
  }
  const healthEvidence = assertStringArray(health.evidence_digests, 'health.evidence_digests', {
    maxItems: 128,
    itemMax: 64
  });
  if (healthEvidence.length === 0) {
    throw new ValidationError('deployment transition receipt requires health evidence');
  }
  for (const [index, item] of healthEvidence.entries()) digest(item, `health.evidence_digests[${index}]`);

  const rollback = exact(value.rollback, [
    'target_state_digest',
    'rollback_plan_digest',
    'available'
  ], 'rollback');
  digest(rollback.target_state_digest, 'rollback.target_state_digest');
  digest(rollback.rollback_plan_digest, 'rollback.rollback_plan_digest');
  if (rollback.available !== true && !reducingRisk) {
    throw new ValidationError('rollback must be available for effect-increasing transitions');
  }

  timestamp(value.occurred_at, 'occurred_at');

  const offline = exact(value.offline_context, [
    'offline',
    'external_currentness_satisfied',
    'reconciliation_required'
  ], 'offline_context');
  for (const field of ['offline','external_currentness_satisfied','reconciliation_required']) {
    if (typeof offline[field] !== 'boolean') {
      throw new ValidationError(`offline_context.${field} must be boolean`);
    }
  }

  if (
    offline.offline &&
    !offline.external_currentness_satisfied &&
    !reducingRisk
  ) {
    throw new ValidationError(
      'offline effect-increasing transition cannot proceed with unsatisfied external currentness'
    );
  }

  const limitations = assertStringArray(value.limitations, 'limitations', {
    maxItems: 64,
    itemMax: 512
  });
  if (limitations.length === 0) {
    throw new ValidationError('deployment transition receipt must declare limitations');
  }

  return Object.freeze({
    valid: true,
    transition,
    target_instance_id: value.target_instance_id,
    runtime_state: value.to_state,
    receipt_effect: 'evidence_only',
    authority_effect: 'none',
    risk_reducing_transition: reducingRisk
  });
}
