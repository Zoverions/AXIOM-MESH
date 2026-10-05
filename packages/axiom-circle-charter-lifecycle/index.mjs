import { ValidationError } from '../../mesh/src/lib/canonical.mjs';
import {
  resolveCircleCharterAt as resolveBaseCircleCharterAt,
  validateCircleCharterLifecycle as validateBaseCircleCharterLifecycle,
  validateCircleCharterLifecyclePolicy
} from './implementation.mjs';

export { validateCircleCharterLifecyclePolicy };

const ASCII_CONTROL = /[\u0000-\u001f\u007f]/;

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
  enforceCanonicalEvidenceReferences(lifecycle);
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
    if (Date.parse(entry.charter.effective_from) < circleCreatedAt) {
      throw new ValidationError('Circle charter cannot become effective before Circle creation');
    }
    if (Date.parse(entry.recorded_at) < circleCreatedAt) {
      throw new ValidationError('Circle charter history cannot be recorded before Circle creation');
    }
  }
}

function enforceCanonicalEvidenceReferences(lifecycle) {
  for (const entry of lifecycle.entries) {
    for (const ref of entry.activation.evidence_refs) {
      if (ASCII_CONTROL.test(ref) || ref !== ref.trim()) {
        throw new ValidationError('Circle charter activation evidence reference is not canonical');
      }
    }
  }
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}
