import { ValidationError, canonicalJson, canonicalize, sha256 } from './canonical.mjs';

export const REPRODUCIBILITY_CLOSURE_SCHEMA = 'axiom-epistemic-reproducibility-closure.v0';
export const REPRODUCIBILITY_CLOSURE_VERSION = '0.1.0';

const CONTENT_DOMAIN = 'axiom-epistemic-reproducibility-closure.v0\n';
const DEPENDENCY_DOMAIN = 'axiom-epistemic-dependency-closure.v0\n';
const DIGEST = /^sha256:[0-9a-f]{64}$/;
const MAX_RECORD_BYTES = 64 * 1024;

export const REPRODUCIBILITY_CLOSURE_LIMITS = Object.freeze({
  serialized_record_bytes: MAX_RECORD_BYTES,
  direct_dependencies: 256,
  limitation_items: 64,
  separation_evidence_refs: 32,
  network_requests: 0,
  external_effects: 0,
  provider_calls: 0,
  production_credentials: 0
});

const TOP_LEVEL_FIELDS = new Set([
  'schema', 'version', 'status', 'closure_id', 'target', 'verifier', 'environment',
  'dependencies', 'dependency_closure_digest', 'coverage_claim', 'replay', 'result',
  'limitations', 'recorded_at', 'contains_secret_material', 'canonical_state',
  'content_digest', 'authority_effect', 'network_effect', 'execution_authority'
]);

const TARGET_KINDS = new Set([
  'epistemic_claim', 'formal_statement', 'software_build', 'experiment',
  'simulation', 'benchmark', 'dataset', 'other'
]);
const RESULTS = new Set(['pass', 'fail', 'indeterminate', 'error']);
const COVERAGE = new Set([
  'target_only', 'partial_closure', 'declared_closure_checked', 'fresh_rebuild'
]);
const DEPENDENCY_KINDS = new Set([
  'formal_library', 'software_package', 'dataset', 'artifact',
  'configuration', 'environment', 'source', 'other'
]);
const DISPOSITIONS = new Set([
  'freshly_checked', 'reused_with_bound_verification',
  'reused_without_recheck', 'unavailable'
]);
const DEP_FIELDS = new Set([
  'dependency_kind', 'dependency_ref', 'dependency_digest', 'disposition',
  'verification_evidence_ref', 'child_closure_ref', 'child_closure_digest'
]);
const REPLAY_FIELDS = new Set([
  'mode', 'actor_ref', 'run_id', 'input_digest', 'output_digest',
  'prior_run_ref', 'prior_actor_ref', 'prior_environment_digest', 'separation_evidence_refs'
]);
const REPLAY_MODES = new Set([
  'original', 'same_context_replay', 'separate_context_replay', 'unknown_context_replay'
]);

function fail(message) {
  throw new ValidationError(message);
}

function record(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    fail(`${label} must be an object`);
  }
  return value;
}

function rejectUnknown(value, allowed, label) {
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) fail(`${label} contains unknown field ${key}`);
  }
}

function text(value, label, max = 256) {
  if (typeof value !== 'string' || value.length < 1 || value.length > max) {
    fail(`${label} must be a non-empty string of at most ${max} characters`);
  }
  return value;
}

function digest(value, label) {
  if (typeof value !== 'string' || !DIGEST.test(value)) {
    fail(`${label} must be a sha256 digest`);
  }
  return value;
}

function canonicalTimestamp(value, label) {
  const raw = text(value, label, 64);
  const parsed = new Date(raw);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString() !== raw) {
    fail(`${label} must be a canonical ISO timestamp`);
  }
  return raw;
}

function domainDigest(domain, value) {
  return `sha256:${sha256(Buffer.concat([
    Buffer.from(domain, 'utf8'),
    Buffer.from(canonicalJson(value), 'utf8')
  ]))}`;
}

function validateTarget(value) {
  const target = record(value, 'target');
  rejectUnknown(target, new Set(['target_ref', 'target_kind', 'target_digest']), 'target');
  for (const key of ['target_ref', 'target_kind', 'target_digest']) {
    if (!Object.hasOwn(target, key)) fail(`target.${key} is required`);
  }
  text(target.target_ref, 'target.target_ref', 512);
  if (!TARGET_KINDS.has(target.target_kind)) fail('target.target_kind has an unsupported value');
  digest(target.target_digest, 'target.target_digest');
}

function validateVerifier(value) {
  const verifier = record(value, 'verifier');
  rejectUnknown(verifier, new Set([
    'verifier_id', 'verifier_version', 'implementation_digest', 'profile_digest'
  ]), 'verifier');
  for (const key of ['verifier_id', 'verifier_version', 'implementation_digest', 'profile_digest']) {
    if (!Object.hasOwn(verifier, key)) fail(`verifier.${key} is required`);
  }
  text(verifier.verifier_id, 'verifier.verifier_id', 160);
  text(verifier.verifier_version, 'verifier.verifier_version', 128);
  digest(verifier.implementation_digest, 'verifier.implementation_digest');
  digest(verifier.profile_digest, 'verifier.profile_digest');
}

function validateEnvironment(value) {
  const environment = record(value, 'environment');
  rejectUnknown(environment, new Set(['environment_digest', 'runtime_ref']), 'environment');
  if (!Object.hasOwn(environment, 'environment_digest')) {
    fail('environment.environment_digest is required');
  }
  digest(environment.environment_digest, 'environment.environment_digest');
  if (Object.hasOwn(environment, 'runtime_ref')) {
    text(environment.runtime_ref, 'environment.runtime_ref', 160);
  }
}

function validateBase(value) {
  rejectUnknown(value, TOP_LEVEL_FIELDS, 'reproducibility closure');
  for (const key of [
    'schema', 'version', 'status', 'closure_id', 'target', 'verifier', 'environment',
    'dependencies', 'dependency_closure_digest', 'coverage_claim', 'replay', 'result',
    'limitations', 'recorded_at', 'contains_secret_material', 'canonical_state',
    'content_digest', 'authority_effect', 'network_effect', 'execution_authority'
  ]) {
    if (!Object.hasOwn(value, key)) fail(`${key} is required`);
  }
  if (value.schema !== REPRODUCIBILITY_CLOSURE_SCHEMA) fail('schema is not E2-RC v0');
  if (value.version !== REPRODUCIBILITY_CLOSURE_VERSION) fail('version is not 0.1.0');
  if (value.status !== 'inert-evidence') fail('status must be inert-evidence');
  text(value.closure_id, 'closure_id', 160);
  validateTarget(value.target);
  validateVerifier(value.verifier);
  validateEnvironment(value.environment);
  if (!COVERAGE.has(value.coverage_claim)) fail('coverage_claim has an unsupported value');
  if (!RESULTS.has(value.result)) fail('result has an unsupported value');
  canonicalTimestamp(value.recorded_at, 'recorded_at');
  if (value.contains_secret_material !== false) fail('contains_secret_material must be false');
  if (value.canonical_state !== 'proposal') fail('canonical_state must be proposal');
  if (value.authority_effect !== 'none') fail('authority_effect must be none');
  if (value.network_effect !== 'none') fail('network_effect must be none');
  if (value.execution_authority !== false) fail('execution_authority must be false');
  digest(value.content_digest, 'content_digest');
}

function dependencyKey(item) {
  return `${item.dependency_kind}\u0000${item.dependency_ref}\u0000${item.dependency_digest}`;
}

function validateDependencies(value, closureId) {
  if (!Array.isArray(value) || value.length > REPRODUCIBILITY_CLOSURE_LIMITS.direct_dependencies) {
    fail('dependencies must be an array with at most 256 items');
  }

  const refs = new Set();
  let priorKey = null;

  value.forEach((raw, index) => {
    const item = record(raw, `dependencies[${index}]`);
    rejectUnknown(item, DEP_FIELDS, `dependencies[${index}]`);
    for (const key of ['dependency_kind', 'dependency_ref', 'dependency_digest', 'disposition']) {
      if (!Object.hasOwn(item, key)) fail(`dependencies[${index}].${key} is required`);
    }
    if (!DEPENDENCY_KINDS.has(item.dependency_kind)) {
      fail(`dependencies[${index}].dependency_kind is unsupported`);
    }
    text(item.dependency_ref, `dependencies[${index}].dependency_ref`, 256);
    digest(item.dependency_digest, `dependencies[${index}].dependency_digest`);
    if (!DISPOSITIONS.has(item.disposition)) {
      fail(`dependencies[${index}].disposition is unsupported`);
    }

    if (refs.has(item.dependency_ref)) fail(`duplicate dependency_ref ${item.dependency_ref}`);
    refs.add(item.dependency_ref);

    const key = dependencyKey(item);
    if (priorKey !== null && key <= priorKey) fail('dependencies must be in canonical order');
    priorKey = key;

    const checked = item.disposition === 'freshly_checked'
      || item.disposition === 'reused_with_bound_verification';
    if (checked) {
      if (!Object.hasOwn(item, 'verification_evidence_ref')) {
        fail(`dependencies[${index}].verification_evidence_ref is required for checked dispositions`);
      }
      text(item.verification_evidence_ref, `dependencies[${index}].verification_evidence_ref`, 256);
    } else if (Object.hasOwn(item, 'verification_evidence_ref')) {
      fail(`dependencies[${index}].verification_evidence_ref is forbidden for ${item.disposition}`);
    }

    const hasChildRef = Object.hasOwn(item, 'child_closure_ref');
    const hasChildDigest = Object.hasOwn(item, 'child_closure_digest');
    if (hasChildRef !== hasChildDigest) {
      fail(`dependencies[${index}] child closure ref/digest must be paired`);
    }
    if (hasChildRef) {
      text(item.child_closure_ref, `dependencies[${index}].child_closure_ref`, 256);
      digest(item.child_closure_digest, `dependencies[${index}].child_closure_digest`);
      if (item.child_closure_ref === closureId) fail('direct child closure self-reference is forbidden');
    }
  });
}

export function computeDependencyClosureDigest(dependencies) {
  const normalized = canonicalize(dependencies);
  if (!Array.isArray(normalized)) fail('dependencies must be an array');
  return domainDigest(DEPENDENCY_DOMAIN, normalized);
}

function validateCoverage(value) {
  const dispositions = value.dependencies.map((item) => item.disposition);

  if (value.coverage_claim === 'partial_closure' && value.dependencies.length === 0) {
    fail('partial_closure requires at least one declared dependency');
  }

  if (value.coverage_claim === 'declared_closure_checked') {
    if (dispositions.some(
      item => item === 'reused_without_recheck' || item === 'unavailable'
    )) {
      fail('declared_closure_checked cannot include unchecked or unavailable dependencies');
    }
  }

  if (value.coverage_claim === 'fresh_rebuild') {
    if (dispositions.some(item => item !== 'freshly_checked')) {
      fail('fresh_rebuild requires every direct dependency to be freshly_checked');
    }
  }
}

function uniqueRefs(value, label, maxItems) {
  if (!Array.isArray(value) || value.length > maxItems) {
    fail(`${label} exceeds ${maxItems} items`);
  }
  const output = value.map((item, index) => text(item, `${label}[${index}]`, 256));
  if (new Set(output).size !== output.length) fail(`${label} must contain unique references`);
  return output;
}

function validateReplay(value, environmentDigest) {
  const replay = record(value, 'replay');
  rejectUnknown(replay, REPLAY_FIELDS, 'replay');
  for (const key of ['mode', 'actor_ref', 'run_id', 'input_digest', 'output_digest']) {
    if (!Object.hasOwn(replay, key)) fail(`replay.${key} is required`);
  }
  if (!REPLAY_MODES.has(replay.mode)) fail('replay.mode has an unsupported value');
  text(replay.actor_ref, 'replay.actor_ref', 256);
  text(replay.run_id, 'replay.run_id', 256);
  digest(replay.input_digest, 'replay.input_digest');
  digest(replay.output_digest, 'replay.output_digest');

  const has = key => Object.hasOwn(replay, key);

  if (replay.mode === 'original') {
    for (const key of [
      'prior_run_ref', 'prior_actor_ref', 'prior_environment_digest', 'separation_evidence_refs'
    ]) {
      if (has(key)) fail(`replay.${key} must be absent for original`);
    }
    return;
  }

  if (!has('prior_run_ref')) fail('replay.prior_run_ref is required for replay modes');
  text(replay.prior_run_ref, 'replay.prior_run_ref', 256);

  if (replay.mode === 'unknown_context_replay') {
    if (has('prior_actor_ref')) text(replay.prior_actor_ref, 'replay.prior_actor_ref', 256);
    if (has('prior_environment_digest')) {
      digest(replay.prior_environment_digest, 'replay.prior_environment_digest');
    }
    if (has('separation_evidence_refs')) {
      fail('unknown_context_replay cannot claim separation evidence');
    }
    return;
  }

  if (!has('prior_actor_ref') || !has('prior_environment_digest')) {
    fail(`${replay.mode} requires prior_actor_ref and prior_environment_digest`);
  }
  text(replay.prior_actor_ref, 'replay.prior_actor_ref', 256);
  digest(replay.prior_environment_digest, 'replay.prior_environment_digest');

  const sameActor = replay.actor_ref === replay.prior_actor_ref;
  const sameEnvironment = environmentDigest === replay.prior_environment_digest;

  if (replay.mode === 'same_context_replay') {
    if (!sameActor || !sameEnvironment) {
      fail('same_context_replay requires same actor and environment');
    }
    if (has('separation_evidence_refs')) {
      fail('same_context_replay cannot claim separation evidence');
    }
    return;
  }

  if (sameActor && sameEnvironment) {
    fail('separate_context_replay requires a changed actor or environment');
  }
  if (!has('separation_evidence_refs')) {
    fail('separate_context_replay requires separation_evidence_refs');
  }
  const refs = uniqueRefs(
    replay.separation_evidence_refs,
    'replay.separation_evidence_refs',
    REPRODUCIBILITY_CLOSURE_LIMITS.separation_evidence_refs
  );
  if (refs.length < 1) {
    fail('separate_context_replay requires at least one separation evidence reference');
  }
}

function validateLimitations(value) {
  if (!Array.isArray(value) || value.length > REPRODUCIBILITY_CLOSURE_LIMITS.limitation_items) {
    fail('limitations must contain at most 64 items');
  }
  value.forEach((item, index) => text(item, `limitations[${index}]`, 2048));
}

export function computeReproducibilityClosureDigest(value) {
  const normalized = canonicalize(value);
  record(normalized, 'reproducibility closure');
  if (Object.hasOwn(normalized, 'content_digest')) delete normalized.content_digest;
  return domainDigest(CONTENT_DOMAIN, normalized);
}

export function validateReproducibilityClosure(value) {
  const normalized = canonicalize(value);
  record(normalized, 'reproducibility closure');
  validateBase(normalized);
  validateDependencies(normalized.dependencies, normalized.closure_id);

  const expectedDependencyDigest = computeDependencyClosureDigest(normalized.dependencies);
  if (normalized.dependency_closure_digest !== expectedDependencyDigest) {
    fail('dependency_closure_digest does not match exact dependencies');
  }

  validateCoverage(normalized);
  validateReplay(normalized.replay, normalized.environment.environment_digest);
  validateLimitations(normalized.limitations);

  const expected = computeReproducibilityClosureDigest(normalized);
  if (normalized.content_digest !== expected) {
    fail('content_digest does not match reproducibility closure content');
  }

  const bytes = Buffer.byteLength(canonicalJson(normalized), 'utf8');
  if (bytes > MAX_RECORD_BYTES) fail('reproducibility closure exceeds 64 KiB');
  return normalized;
}

export function finalizeReproducibilityClosure(value) {
  const normalized = canonicalize(value);
  record(normalized, 'reproducibility closure');
  const expected = computeReproducibilityClosureDigest(normalized);
  if (Object.hasOwn(normalized, 'content_digest') && normalized.content_digest !== expected) {
    fail('content_digest does not match reproducibility closure content');
  }
  normalized.content_digest = expected;
  return validateReproducibilityClosure(normalized);
}

export function summarizeReproducibilityClosure(value) {
  const normalized = validateReproducibilityClosure(value);
  const counts = {
    freshly_checked: 0,
    reused_with_bound_verification: 0,
    reused_without_recheck: 0,
    unavailable: 0
  };
  for (const item of normalized.dependencies) counts[item.disposition] += 1;
  return Object.freeze({
    dependency_count: normalized.dependencies.length,
    freshly_checked_count: counts.freshly_checked,
    reused_with_bound_verification_count: counts.reused_with_bound_verification,
    reused_without_recheck_count: counts.reused_without_recheck,
    unavailable_count: counts.unavailable,
    coverage_claim: normalized.coverage_claim,
    replay_mode: normalized.replay.mode,
    result: normalized.result
  });
}
