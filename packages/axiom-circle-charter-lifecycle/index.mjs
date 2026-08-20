import { ValidationError } from '../../mesh/src/lib/canonical.mjs';
import {
  resolveCircleCharterAt as resolveBaseCircleCharterAt,
  validateCircleCharterLifecycle as validateBaseCircleCharterLifecycle,
  validateCircleCharterLifecyclePolicy
} from './implementation.mjs';

export { validateCircleCharterLifecyclePolicy };

export function validateCircleCharterLifecycle(
  policy,
  circlePackage,
  lifecycle,
  options = {}
) {
  const validation = validateBaseCircleCharterLifecycle(
    policy,
    circlePackage,
    lifecycle,
    options
  );
  enforceCircleCreationChronology(circlePackage, lifecycle);
  return validation;
}

export function resolveCircleCharterAt(
  policy,
  circlePackage,
  lifecycle,
  options = {}
) {
  validateCircleCharterLifecycle(policy, circlePackage, lifecycle, options);
  const resolved = resolveBaseCircleCharterAt(policy, circlePackage, lifecycle, options);
  return Object.freeze({
    ...resolved,
    charter: deepFreeze(structuredClone(resolved.charter))
  });
}

function enforceCircleCreationChronology(circlePackage, lifecycle) {
  const circleCreatedAt = Date.parse(circlePackage.circle.created_at);
  for (const entry of lifecycle.entries) {
    if (Date.parse(entry.recorded_at) < circleCreatedAt) {
      throw new ValidationError('Circle charter history cannot be recorded before Circle creation');
    }
    if (Date.parse(entry.charter.effective_from) < circleCreatedAt) {
      throw new ValidationError('Circle charter cannot become effective before Circle creation');
    }
  }
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}
