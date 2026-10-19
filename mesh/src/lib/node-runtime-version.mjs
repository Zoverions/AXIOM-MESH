// Pure Node.js/npm version rule shared by source setup and the host planner.
// No filesystem, process, or network access: keep this module side-effect free.
import { ValidationError } from './canonical.mjs';

// Exact MAJOR.MINOR.PATCH without leading zeros, pre-release, or trailing content.
export const SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

export function classifyRuntimeProfile(value, runtimePolicy) {
  const normalized = normalizeVersion(value, 'Node.js');
  const major = versionTuple(normalized, 'Node.js')[0];

  if (major === 24) {
    validateVersionInRange(
      normalized,
      runtimePolicy.minimum_version,
      runtimePolicy.maximum_major_exclusive,
      'Node.js'
    );
    return 'primary';
  }

  if (major === 22) {
    validateVersionInRange(
      normalized,
      runtimePolicy.compatibility_minimum_version,
      runtimePolicy.compatibility_maximum_major_exclusive,
      'Node.js'
    );
    return 'compatibility';
  }

  throw new ValidationError(
    `Node.js ${normalized} is outside ${runtimePolicy.engine}`
  );
}

export function validateVersionInRange(value, minimum, maximumMajorExclusive, name) {
  const normalized = normalizeVersion(value, name);
  const actual = versionTuple(normalized, name);
  const lower = versionTuple(minimum, `${name} minimum`);
  if (
    compareVersion(actual, lower) < 0
    || actual[0] >= maximumMajorExclusive
  ) throw new ValidationError(
    `${name} ${normalized} is outside ${minimum} <= version < ${maximumMajorExclusive}.0.0`
  );
}

export function normalizeVersion(value, name) {
  const normalized = String(value ?? '').replace(/^v/, '');
  if (!SEMVER.test(normalized)) {
    throw new ValidationError(`${name} version is invalid`);
  }
  return normalized;
}

export function versionTuple(value, name) {
  return normalizeVersion(value, name).split('.').map(Number);
}

export function compareVersion(left, right) {
  for (let index = 0; index < 3; index += 1) {
    if (left[index] !== right[index]) return left[index] - right[index];
  }
  return 0;
}
