import { digestObject, ValidationError } from '../../mesh/src/lib/canonical.mjs';
import {
  CIRCLE_CORE_PACKAGE_SCHEMA,
  validateCircleCorePackage
} from '../../mesh/src/lib/circle-core.mjs';

const DIGEST = /^[a-f0-9]{64}$/;
const ASCII_CONTROL = /[\u0000-\u001f\u007f]/;

export function validateCircleCharterLifecyclePolicy(policy) {
  exactObject(policy, 'Circle charter lifecycle policy', [
    'schema',
    'version',
    'status',
    'runtime_activation',
    'authority_effect',
    'network_effect',
    'requirements',
    'schemas',
    'output'
  ]);
  if (
    policy.schema !== 'axiom-circle-charter-lifecycle-policy.v0'
    || policy.version !== 0
    || policy.status !== 'inert-activated-charter-history'
    || policy.runtime_activation !== false
    || policy.authority_effect !== 'none'
    || policy.network_effect !== 'none'
  ) throw new ValidationError('Circle charter lifecycle activation boundary is invalid');

  exactObject(policy.requirements, 'Circle charter lifecycle requirements', [
    'exact_circle_id_binding',
    'activated_entries_only',
    'current_circle_charter_must_equal_active_head',
    'genesis_version_one',
    'contiguous_versions',
    'strict_effective_chronology',
    'exact_supersedes_digest_chain',
    'unique_charter_digests',
    'recorded_before_or_at_activation',
    'activation_not_in_future',
    'historical_resolution_required',
    'activation_evidence_is_non_authorizing',
    'charter_history_may_mint_runtime_authority',
    'historical_rules_rewritten'
  ]);
  const expectedRequirements = {
    exact_circle_id_binding: true,
    activated_entries_only: true,
    current_circle_charter_must_equal_active_head: true,
    genesis_version_one: true,
    contiguous_versions: true,
    strict_effective_chronology: true,
    exact_supersedes_digest_chain: true,
    unique_charter_digests: true,
    recorded_before_or_at_activation: true,
    activation_not_in_future: true,
    historical_resolution_required: true,
    activation_evidence_is_non_authorizing: true,
    charter_history_may_mint_runtime_authority: false,
    historical_rules_rewritten: false
  };
  if (!sameExactValues(policy.requirements, expectedRequirements)) {
    throw new ValidationError('Circle charter lifecycle requirement was weakened');
  }

  exactObject(policy.schemas, 'Circle charter lifecycle schema inventory', [
    'lifecycle', 'entry', 'activation', 'resolved'
  ]);
  const expectedSchemas = {
    lifecycle: 'axiom-circle-charter-lifecycle.v0',
    entry: 'axiom-circle-charter-history-entry.v0',
    activation: 'axiom-circle-charter-activation.v0',
    resolved: 'axiom-circle-charter-resolution.v0'
  };
  if (!sameExactValues(policy.schemas, expectedSchemas)) {
    throw new ValidationError('Circle charter lifecycle schema inventory drifted');
  }

  exactObject(policy.output, 'Circle charter lifecycle output policy', [
    'policy_digest_required',
    'circle_package_digest_required',
    'lifecycle_digest_required',
    'active_charter_digest_required',
    'historical_resolution_is_local_derivation',
    'runtime_authority',
    'portable_authority',
    'authority_effect',
    'network_effect'
  ]);
  if (
    policy.output.policy_digest_required !== true
    || policy.output.circle_package_digest_required !== true
    || policy.output.lifecycle_digest_required !== true
    || policy.output.active_charter_digest_required !== true
    || policy.output.historical_resolution_is_local_derivation !== true
    || policy.output.runtime_authority !== false
    || policy.output.portable_authority !== false
    || policy.output.authority_effect !== 'none'
    || policy.output.network_effect !== 'none'
  ) throw new ValidationError('Circle charter lifecycle output boundary is invalid');
  return true;
}

export function validateCircleCharterLifecycle(
  policy,
  circlePackage,
  lifecycle,
  { now = new Date() } = {}
) {
  validateCircleCharterLifecyclePolicy(policy);
  const coreValidation = validateCircleCorePackage(circlePackage, { now });
  exactObject(lifecycle, 'Circle charter lifecycle', [
    'schema',
    'circle_id',
    'entries',
    'authority_effect',
    'network_effect',
    'runtime_activation'
  ]);
  if (
    lifecycle.schema !== policy.schemas.lifecycle
    || lifecycle.circle_id !== circlePackage.circle.circle_id
    || lifecycle.authority_effect !== 'none'
    || lifecycle.network_effect !== 'none'
    || lifecycle.runtime_activation !== false
  ) throw new ValidationError('Circle charter lifecycle boundary is invalid');
  if (!Array.isArray(lifecycle.entries) || lifecycle.entries.length < 1 || lifecycle.entries.length > 256) {
    throw new ValidationError('Circle charter lifecycle entries are invalid');
  }

  const nowMs = validDate(now, 'Circle charter lifecycle validation time').valueOf();
  const circleCreatedMs = validDate(
    circlePackage.circle.created_at,
    'Circle creation time'
  ).valueOf();
  const digests = new Set();
  const normalized = [];
  let previousDigest = null;
  let previousEffectiveMs = null;

  for (let index = 0; index < lifecycle.entries.length; index += 1) {
    const entry = lifecycle.entries[index];
    exactObject(entry, 'Circle charter history entry', [
      'schema',
      'circle_id',
      'charter',
      'charter_digest',
      'recorded_at',
      'activation',
      'authority_effect',
      'network_effect'
    ]);
    if (
      entry.schema !== policy.schemas.entry
      || entry.circle_id !== lifecycle.circle_id
      || !DIGEST.test(entry.charter_digest)
      || entry.authority_effect !== 'none'
      || entry.network_effect !== 'none'
    ) throw new ValidationError('Circle charter history entry is invalid');

    validateHistoricalCharter(circlePackage, entry.charter, { now });
    const computedDigest = digestObject(entry.charter);
    if (computedDigest !== entry.charter_digest) {
      throw new ValidationError('Circle charter history entry digest does not match charter');
    }
    if (digests.has(computedDigest)) {
      throw new ValidationError('Circle charter lifecycle cannot reuse a charter digest');
    }
    digests.add(computedDigest);

    const expectedVersion = index + 1;
    if (entry.charter.version !== expectedVersion) {
      throw new ValidationError('Circle charter lifecycle versions must be contiguous from one');
    }
    if (entry.charter.supersedes_digest !== previousDigest) {
      throw new ValidationError('Circle charter lifecycle supersedes chain is invalid');
    }

    const effectiveMs = timestampMs(entry.charter.effective_from, 'Circle charter effective_from');
    if (effectiveMs < circleCreatedMs) {
      throw new ValidationError('Circle charter cannot become effective before Circle creation');
    }
    if (previousEffectiveMs !== null && effectiveMs <= previousEffectiveMs) {
      throw new ValidationError('Circle charter lifecycle effective times must strictly increase');
    }
    if (effectiveMs > nowMs) {
      throw new ValidationError('Circle charter lifecycle contains a future activation');
    }

    const recordedMs = timestampMs(entry.recorded_at, 'Circle charter history recorded_at');
    if (recordedMs < circleCreatedMs) {
      throw new ValidationError('Circle charter history cannot be recorded before Circle creation');
    }
    if (recordedMs > effectiveMs) {
      throw new ValidationError('Circle charter activation cannot be recorded retroactively');
    }

    const activation = validateActivation(
      policy,
      entry.activation,
      lifecycle,
      entry,
      previousDigest
    );
    if (Date.parse(activation.activated_at) !== effectiveMs) {
      throw new ValidationError('Circle charter activation time must equal charter effective_from');
    }

    normalized.push(Object.freeze({
      ...entry,
      activation: Object.freeze({ ...activation })
    }));
    previousDigest = computedDigest;
    previousEffectiveMs = effectiveMs;
  }

  const activeCharterDigest = digestObject(circlePackage.charter);
  if (activeCharterDigest !== previousDigest) {
    throw new ValidationError('Current Circle charter does not equal the activated lifecycle head');
  }

  return Object.freeze({
    valid: true,
    schema: lifecycle.schema,
    circle_id: lifecycle.circle_id,
    charter_count: normalized.length,
    active_charter_version: circlePackage.charter.version,
    active_charter_digest: activeCharterDigest,
    policy_digest: digestObject(policy),
    circle_package_digest: coreValidation.package_digest,
    lifecycle_digest: digestObject(lifecycle),
    runtime_activation: false,
    runtime_authority: false,
    portable_authority: false,
    authority_effect: 'none',
    network_effect: 'none'
  });
}

export function resolveCircleCharterAt(
  policy,
  circlePackage,
  lifecycle,
  { at, now = new Date() } = {}
) {
  const validation = validateCircleCharterLifecycle(policy, circlePackage, lifecycle, { now });
  const atIso = canonicalTimestamp(at, 'Circle charter resolution at');
  const atMs = Date.parse(atIso);
  const nowMs = validDate(now, 'Circle charter resolution validation time').valueOf();
  if (atMs > nowMs) {
    throw new ValidationError('Circle charter historical resolution cannot project into the future');
  }

  let resolved = null;
  for (const entry of lifecycle.entries) {
    if (Date.parse(entry.charter.effective_from) <= atMs) resolved = entry;
    else break;
  }
  if (!resolved) {
    throw new ValidationError('No Circle charter was active at the requested time');
  }

  return Object.freeze({
    schema: policy.schemas.resolved,
    circle_id: lifecycle.circle_id,
    resolved_at: atIso,
    charter_version: resolved.charter.version,
    charter_digest: resolved.charter_digest,
    charter: deepFreeze(structuredClone(resolved.charter)),
    policy_digest: validation.policy_digest,
    circle_package_digest: validation.circle_package_digest,
    lifecycle_digest: validation.lifecycle_digest,
    historical_resolution_is_local_derivation: true,
    runtime_authority: false,
    portable_authority: false,
    authority_effect: 'none',
    network_effect: 'none'
  });
}

function validateHistoricalCharter(circlePackage, charter, { now }) {
  validateCircleCorePackage({
    schema: CIRCLE_CORE_PACKAGE_SCHEMA,
    version: 0,
    status: 'inert-contract-laboratory',
    circle: circlePackage.circle,
    charter,
    invitations: [],
    memberships: [],
    proposals: [],
    tasks: [],
    decisions: [],
    appeals: [],
    exits: [],
    exports: [],
    authority_effect: 'none',
    network_effect: 'none',
    runtime_activation: false
  }, { now });
}

function validateActivation(policy, activation, lifecycle, entry, previousDigest) {
  exactObject(activation, 'Circle charter activation record', [
    'schema',
    'circle_id',
    'charter_digest',
    'basis_charter_digest',
    'activated_at',
    'evidence_refs',
    'creates_runtime_authority',
    'authority_effect',
    'network_effect'
  ]);
  if (
    activation.schema !== policy.schemas.activation
    || activation.circle_id !== lifecycle.circle_id
    || activation.charter_digest !== entry.charter_digest
    || activation.basis_charter_digest !== previousDigest
    || activation.activated_at !== entry.charter.effective_from
    || activation.creates_runtime_authority !== false
    || activation.authority_effect !== 'none'
    || activation.network_effect !== 'none'
  ) throw new ValidationError('Circle charter activation record is invalid');
  referenceArray(activation.evidence_refs, 'Circle charter activation evidence_refs');
  return activation;
}

function referenceArray(value, label) {
  if (!Array.isArray(value) || value.length < 1 || value.length > 128) {
    throw new ValidationError(`${label} are invalid`);
  }
  const seen = new Set();
  for (const ref of value) {
    if (
      typeof ref !== 'string'
      || ref.length < 1
      || ref.length > 512
      || seen.has(ref)
    ) throw new ValidationError(`${label} are invalid`);
    if (ASCII_CONTROL.test(ref) || ref !== ref.trim()) {
      throw new ValidationError('Circle charter activation evidence reference is not canonical');
    }
    seen.add(ref);
  }
}

function exactObject(value, label, keys) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new ValidationError(`${label} must be an object`);
  }
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    throw new ValidationError(`${label} fields are invalid`);
  }
}

function sameExactValues(value, expected) {
  return Object.entries(expected).every(([key, expectedValue]) => value[key] === expectedValue);
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function canonicalTimestamp(value, label) {
  if (typeof value !== 'string') throw new ValidationError(`${label} is invalid`);
  const parsed = new Date(value);
  if (Number.isNaN(parsed.valueOf()) || parsed.toISOString() !== value) {
    throw new ValidationError(`${label} must be canonical UTC`);
  }
  return value;
}

function timestampMs(value, label) {
  return Date.parse(canonicalTimestamp(value, label));
}

function validDate(value, label) {
  const date = value instanceof Date ? new Date(value.valueOf()) : new Date(value);
  if (Number.isNaN(date.valueOf())) throw new ValidationError(`${label} is invalid`);
  return date;
}
