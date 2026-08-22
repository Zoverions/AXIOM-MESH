import {
  assertPlainObject,
  assertString,
  digestObject,
  ValidationError
} from './canonical.mjs';
import { validatePersonalAgentPackV2 } from './personal-agent-pack-v2.mjs';

const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const VERSION_PATTERN = /^[0-9]+\.[0-9]+\.[0-9]+(?:-[0-9A-Za-z.-]+)?$/;

const OBSERVATION_KEYS = Object.freeze([
  'content_ref',
  'available',
  'observed_sha256'
]);

const ENVIRONMENT_KEYS = Object.freeze([
  'kernel_version',
  'available_capsule_ids',
  'available_provider_ids',
  'available_model_ids',
  'available_execution_location_refs'
]);

export function buildPersonalAgentPackRestorePlan(
  pack,
  artifactObservations,
  environment = {}
) {
  const packValidation = validatePersonalAgentPackV2(pack);
  const observations = normalizeArtifactObservations(artifactObservations);
  const target = normalizeEnvironment(environment);
  const blockers = [];
  const warnings = [];

  const vaults = [...pack.vaults]
    .sort((left, right) => left.vault_id.localeCompare(right.vault_id))
    .map(vault => planVault(vault, observations, blockers, warnings));

  const components = [...pack.companion_components]
    .sort((left, right) => left.component_id.localeCompare(right.component_id))
    .map(component => planComponent(component, observations, blockers, warnings));

  const compatibility = assessCompatibility(
    pack,
    target,
    blockers,
    warnings
  );

  blockers.sort();
  warnings.sort();

  const unsigned = {
    schema: 'axiom-personal-agent-pack-restore-plan.v1',
    pack_id: pack.pack_id,
    pack_sha256: packValidation.canonical_sha256,
    owner_subject_ref: pack.owner_subject_ref,
    restore_ready: blockers.length === 0,
    continuity_status: blockers.length > 0
      ? 'blocked'
      : warnings.length > 0
        ? 'degraded'
        : 'full',
    blockers,
    warnings,
    vaults,
    components,
    compatibility,
    authority_boundary: {
      opens_or_decrypts_vaults: false,
      writes_files: false,
      performs_network_effects: false,
      substitutes_missing_components: false,
      restores_secret_material_from_pack: false,
      artifact_observation_is_content_authenticity_proof: false,
      fresh_vault_access_leases_required_after_restore: true,
      grants_vault_access: false,
      grants_execution_authority: false
    }
  };

  return deepFreeze({
    ...unsigned,
    plan_sha256: digestObject(unsigned)
  });
}

function normalizeArtifactObservations(value) {
  const entries = assertArray(value, 'artifact observations', { min: 0, max: 1024 });
  const observations = new Map();

  for (const [index, entry] of entries.entries()) {
    assertPlainObject(entry, `artifact observations[${index}]`);
    exactKeys(
      entry,
      OBSERVATION_KEYS,
      ['content_ref', 'available'],
      `artifact observations[${index}]`
    );
    const ref = assertString(
      entry.content_ref,
      `artifact observations[${index}].content_ref`,
      { min: 1, max: 1024 }
    );
    if (observations.has(ref)) {
      throw new ValidationError(`duplicate artifact observation: ${ref}`);
    }
    assertBoolean(entry.available, `artifact observations[${index}].available`);
    if (entry.available) {
      if (entry.observed_sha256 === undefined) {
        throw new ValidationError(
          `available artifact observation ${ref} requires observed_sha256`
        );
      }
      assertSha256(
        entry.observed_sha256,
        `artifact observations[${index}].observed_sha256`
      );
    } else if (entry.observed_sha256 !== undefined) {
      throw new ValidationError(
        `unavailable artifact observation ${ref} cannot assert observed_sha256`
      );
    }
    observations.set(ref, entry);
  }
  return observations;
}

function normalizeEnvironment(environment) {
  assertPlainObject(environment, 'restore environment');
  exactKeys(environment, ENVIRONMENT_KEYS, [], 'restore environment');

  const normalized = {};
  if (environment.kernel_version !== undefined) {
    normalized.kernel_version = assertVersion(
      environment.kernel_version,
      'restore environment.kernel_version'
    );
  }
  for (const key of [
    'available_capsule_ids',
    'available_provider_ids',
    'available_model_ids',
    'available_execution_location_refs'
  ]) {
    if (environment[key] !== undefined) {
      normalized[key] = assertUniqueStringArray(
        environment[key],
        `restore environment.${key}`,
        { max: 512 }
      ).sort();
    }
  }
  return normalized;
}

function planVault(vault, observations, blockers, warnings) {
  const manifestState = observedArtifactState(
    vault.vault_manifest_ref,
    vault.vault_manifest_sha256,
    observations
  );

  if (manifestState === 'missing') {
    blockers.push(`vault-manifest-missing:${vault.vault_id}`);
  } else if (manifestState === 'digest-mismatch') {
    blockers.push(`vault-manifest-digest-mismatch:${vault.vault_id}`);
  }

  if (!vault.backup_refs?.length) {
    warnings.push(`vault-backup-source-not-declared:${vault.vault_id}`);
  }

  return {
    vault_id: vault.vault_id,
    domain: vault.domain,
    vault_manifest_ref: vault.vault_manifest_ref,
    expected_manifest_sha256: vault.vault_manifest_sha256,
    manifest_observation_state: manifestState,
    recovery_policy_ref: vault.recovery_policy_ref,
    backup_refs: [...(vault.backup_refs ?? [])].sort(),
    restore_mode: vault.selective_restore_supported
      ? 'selective-or-whole-vault'
      : 'whole-vault-only',
    independently_recoverable: true,
    cross_vault_key_dependency_allowed: false,
    planner_opens_or_decrypts_vault: false,
    fresh_access_lease_required_after_restore: true,
    backup_integrity_verification_deferred_to_vault_recovery: true
  };
}

function planComponent(component, observations, blockers, warnings) {
  const state = observedArtifactState(
    component.content_ref,
    component.sha256,
    observations
  );
  const required = component.required_for_minimum_continuity === true;

  if (state === 'missing') {
    if (required) {
      blockers.push(`required-component-missing:${component.component_id}`);
    } else {
      warnings.push(`optional-component-missing:${component.component_id}`);
    }
  } else if (state === 'digest-mismatch') {
    if (required) {
      blockers.push(`required-component-digest-mismatch:${component.component_id}`);
    } else {
      warnings.push(`optional-component-digest-mismatch:${component.component_id}`);
    }
  }

  return {
    component_id: component.component_id,
    role: component.role,
    content_ref: component.content_ref,
    expected_sha256: component.sha256,
    required_for_minimum_continuity: required,
    artifact_observation_state: state,
    planned_action: state === 'digest-match'
      ? 'restore-content-addressed-component'
      : required
        ? 'block-restore'
        : 'owner-decision-required',
    silent_substitution_allowed: false,
    ...(component.role === 'personalized-model-artifact'
      ? {
          training_authorization_ref: component.training_authorization_ref,
          base_model_ref: component.base_model_ref,
          allowed_execution_location_refs: [
            ...component.allowed_execution_location_refs
          ].sort()
        }
      : {})
  };
}

function observedArtifactState(ref, expectedSha256, observations) {
  const observation = observations.get(ref);
  if (!observation || observation.available !== true) return 'missing';
  return observation.observed_sha256 === expectedSha256
    ? 'digest-match'
    : 'digest-mismatch';
}

function assessCompatibility(pack, environment, blockers, warnings) {
  const kernel = assessKernelCompatibility(
    pack.minimum_kernel_version,
    environment.kernel_version,
    blockers,
    warnings
  );

  const runtimeCapsules = assessAllowlistAvailability({
    label: 'runtime-capsule',
    allowed: pack.runtime_preferences.allowed_capsule_ids,
    available: environment.available_capsule_ids,
    warnings
  });
  const providers = assessAllowlistAvailability({
    label: 'provider',
    allowed: pack.runtime_preferences.allowed_provider_ids,
    available: environment.available_provider_ids,
    warnings
  });
  const models = assessAllowlistAvailability({
    label: 'pinned-model',
    allowed: pack.runtime_preferences.pinned_model_ids ?? [],
    available: environment.available_model_ids,
    warnings
  });

  const personalizedExecution = [...pack.companion_components]
    .filter(component => component.role === 'personalized-model-artifact')
    .sort((left, right) => left.component_id.localeCompare(right.component_id))
    .map(component => assessPersonalizedExecution(
      component,
      environment.available_execution_location_refs,
      blockers,
      warnings
    ));

  return {
    kernel,
    runtime_capsules: runtimeCapsules,
    providers,
    pinned_models: models,
    personalized_execution: personalizedExecution
  };
}

function assessKernelCompatibility(minimumVersion, actualVersion, blockers, warnings) {
  if (!minimumVersion) {
    return {
      state: 'not-constrained-by-pack',
      minimum_version: null,
      observed_version: actualVersion ?? null
    };
  }
  if (!actualVersion) {
    warnings.push('kernel-compatibility-unassessed');
    return {
      state: 'unassessed',
      minimum_version: minimumVersion,
      observed_version: null
    };
  }
  const compatible = compareSemver(actualVersion, minimumVersion) >= 0;
  if (!compatible) blockers.push('kernel-version-below-pack-minimum');
  return {
    state: compatible ? 'compatible' : 'incompatible',
    minimum_version: minimumVersion,
    observed_version: actualVersion
  };
}

function assessAllowlistAvailability({ label, allowed, available, warnings }) {
  const allowedSorted = [...allowed].sort();
  if (allowedSorted.length === 0) {
    return {
      state: 'not-required-by-pack',
      allowed_ids: [],
      available_matches: []
    };
  }
  if (available === undefined) {
    warnings.push(`${label}-availability-unassessed`);
    return {
      state: 'unassessed',
      allowed_ids: allowedSorted,
      available_matches: []
    };
  }
  const availableSet = new Set(available);
  const matches = allowedSorted.filter(value => availableSet.has(value));
  if (matches.length === 0) warnings.push(`${label}-availability-degraded`);
  return {
    state: matches.length > 0 ? 'available' : 'unavailable',
    allowed_ids: allowedSorted,
    available_matches: matches
  };
}

function assessPersonalizedExecution(component, availableLocations, blockers, warnings) {
  const allowed = [...component.allowed_execution_location_refs].sort();
  if (availableLocations === undefined) {
    warnings.push(`personalized-execution-unassessed:${component.component_id}`);
    return {
      component_id: component.component_id,
      state: 'unassessed',
      allowed_execution_location_refs: allowed,
      available_matches: []
    };
  }
  const availableSet = new Set(availableLocations);
  const matches = allowed.filter(value => availableSet.has(value));
  if (matches.length === 0) {
    if (component.required_for_minimum_continuity) {
      blockers.push(`required-personalized-execution-unavailable:${component.component_id}`);
    } else {
      warnings.push(`optional-personalized-execution-unavailable:${component.component_id}`);
    }
  }
  return {
    component_id: component.component_id,
    state: matches.length > 0 ? 'available' : 'unavailable',
    allowed_execution_location_refs: allowed,
    available_matches: matches
  };
}

function compareSemver(left, right) {
  const a = parseSemver(left);
  const b = parseSemver(right);
  for (const key of ['major', 'minor', 'patch']) {
    if (a[key] !== b[key]) return a[key] > b[key] ? 1 : -1;
  }
  if (a.prerelease.length === 0 && b.prerelease.length === 0) return 0;
  if (a.prerelease.length === 0) return 1;
  if (b.prerelease.length === 0) return -1;
  const length = Math.max(a.prerelease.length, b.prerelease.length);
  for (let index = 0; index < length; index += 1) {
    if (a.prerelease[index] === undefined) return -1;
    if (b.prerelease[index] === undefined) return 1;
    const comparison = comparePrereleasePart(a.prerelease[index], b.prerelease[index]);
    if (comparison !== 0) return comparison;
  }
  return 0;
}

function parseSemver(value) {
  assertVersion(value, 'semantic version');
  const [core, prerelease = ''] = value.split('-', 2);
  const [major, minor, patch] = core.split('.').map(Number);
  return {
    major,
    minor,
    patch,
    prerelease: prerelease ? prerelease.split('.') : []
  };
}

function comparePrereleasePart(left, right) {
  if (left === right) return 0;
  const leftNumeric = /^\d+$/.test(left);
  const rightNumeric = /^\d+$/.test(right);
  if (leftNumeric && rightNumeric) return Number(left) > Number(right) ? 1 : -1;
  if (leftNumeric !== rightNumeric) return leftNumeric ? -1 : 1;
  return left > right ? 1 : -1;
}

function exactKeys(value, allowed, required, name) {
  const allowedSet = new Set(allowed);
  for (const key of Object.keys(value)) {
    if (!allowedSet.has(key)) throw new ValidationError(`${name} contains unknown field ${key}`);
  }
  for (const key of required) {
    if (!Object.hasOwn(value, key)) throw new ValidationError(`${name} is missing required field ${key}`);
  }
}

function assertArray(value, name, { min = 0, max = 256 } = {}) {
  if (!Array.isArray(value) || value.length < min || value.length > max) {
    throw new ValidationError(`${name} must contain ${min}-${max} items`);
  }
  return value;
}

function assertBoolean(value, name) {
  if (typeof value !== 'boolean') throw new ValidationError(`${name} must be a boolean`);
  return value;
}

function assertSha256(value, name) {
  return assertString(value, name, { min: 64, max: 64, pattern: SHA256_PATTERN });
}

function assertVersion(value, name) {
  return assertString(value, name, { min: 5, max: 160, pattern: VERSION_PATTERN });
}

function assertUniqueStringArray(value, name, { max = 256 } = {}) {
  const list = assertArray(value, name, { min: 0, max });
  const seen = new Set();
  for (const [index, item] of list.entries()) {
    const normalized = assertString(item, `${name}[${index}]`, { min: 1, max: 1024 });
    if (seen.has(normalized)) {
      throw new ValidationError(`duplicate ${name} entry: ${normalized}`);
    }
    seen.add(normalized);
  }
  return [...list];
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}
