import { digestObject, ValidationError } from './canonical.mjs';

export const INFERENCE_WORKLOAD_PROFILE_SCHEMA = 'axiom-inference-workload-profile.v0';
export const INFERENCE_BENCHMARK_EVIDENCE_SCHEMA = 'axiom-inference-benchmark-evidence.v0';

const IDENTIFIER_RE = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,191}$/;
const VERSION_RE = /^[0-9]+\.[0-9]+\.[0-9]+(?:[-+][A-Za-z0-9.-]+)?$/;
const SHA256_RE = /^[a-f0-9]{64}$/;
const GIT_SHA_RE = /^[a-f0-9]{40}$/;

const PROFILE_FIELDS = Object.freeze([
  'schema','version','profile_id','profile_version','task_family','purpose','fixture_digest',
  'created_at','token_shape','objectives','authority_effect','network_effect',
  'credential_visibility','runtime_activation','selection_effect','capability_promotion'
]);
const TOKEN_FIELDS = Object.freeze([
  'input_min','input_nominal','input_max','output_min','output_nominal','output_max',
  'context_tiers','concurrency_values','arrival_rate_rps','batch_sizes','streaming',
  'repeated_prefix_tokens','expected_request_count'
]);
const OBJECTIVE_FIELDS = Object.freeze([
  'ttft_ms_p95','itl_ms_p95','e2e_ms_p95','throughput_tokens_s','locality',
  'quality_evidence_required','measure_power','measure_cost'
]);

const BENCHMARK_FIELDS = Object.freeze([
  'schema','version','benchmark_id','evidence_class','measured_at','workload','subject',
  'environment','protocol','observations','quality','reproducer_ref','authority_effect',
  'network_effect','credential_visibility','runtime_activation','selection_effect',
  'capability_promotion'
]);
const WORKLOAD_BINDING_FIELDS = Object.freeze([
  'profile_id','profile_version','profile_digest','fixture_digest'
]);
const SUBJECT_FIELDS = Object.freeze([
  'repository_revision','model_or_provider_id','model_revision_or_digest','engine_id',
  'engine_version','engine_implementation_digest','runtime_id','runtime_version',
  'tokenizer_id','tokenizer_revision','numeric_format','sampling_config_digest',
  'prompt_policy_digest','tool_memory_policy_digest','benchmark_harness_id',
  'benchmark_harness_version','benchmark_harness_digest'
]);
const ENVIRONMENT_FIELDS = Object.freeze([
  'os','arch','cpu','host_ram_bytes','accelerator_kind','accelerator_models',
  'accelerator_count','accelerator_memory_bytes','driver_version','firmware_version',
  'accelerator_runtime_version','topology_digest','source_ids'
]);
const PROTOCOL_FIELDS = Object.freeze([
  'warmup_requests','measured_requests','concurrency','batch_size','streaming',
  'cache_mode','failure_policy','percentile_method'
]);
const OBSERVATION_FIELDS = Object.freeze(['latency','throughput','counts','resources','economic']);
const LATENCY_FIELDS = Object.freeze(['ttft_ms','itl_ms','e2e_ms']);
const PERCENTILE_FIELDS = Object.freeze(['p50','p95','p99']);
const THROUGHPUT_FIELDS = Object.freeze([
  'prefill_tokens_s','decode_tokens_s','aggregate_tokens_s','requests_s','queue_wait_ms_p95'
]);
const COUNT_FIELDS = Object.freeze([
  'request_count','success_count','error_count','rejected_count','oom_count'
]);
const RESOURCE_FIELDS = Object.freeze([
  'peak_accelerator_memory_bytes','steady_accelerator_memory_bytes','kv_cache_bytes',
  'host_rss_bytes','cpu_utilization_pct','accelerator_utilization_pct',
  'memory_bandwidth_utilization_pct','network_bytes','power_watts','energy_joules',
  'thermal_throttling'
]);
const ECONOMIC_FIELDS = Object.freeze([
  'direct_cost_microcents','hardware_amortization_microcents','electricity_microcents',
  'retry_failure_microcents','verification_microcents','denominator_kind','denominator_value'
]);
const QUALITY_FIELDS = Object.freeze(['state','artifact_ref','artifact_digest']);

const EVIDENCE_CLASSES = Object.freeze([
  'measured','independently-reproduced','simulated','estimated','provider-reported'
]);
const LOCALITIES = Object.freeze(['owner-local','owner-remote','provider-remote']);
const ACCELERATOR_KINDS = Object.freeze(['none','gpu','npu','other']);
const CACHE_MODES = Object.freeze(['disabled','enabled','mixed','not-applicable']);
const QUALITY_STATES = Object.freeze(['not-established','externally-bound']);
const DENOMINATOR_KINDS = Object.freeze(['request','token','useful-output','none']);

function requirePlain(value, name) {
  if (
    value === null || typeof value !== 'object' || Array.isArray(value)
    || (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null)
  ) throw new ValidationError(`${name} must be a plain object`);
  return value;
}

function requireClosedObject(value, fields, name) {
  requirePlain(value, name);
  for (const field of fields) {
    if (!Object.hasOwn(value, field)) throw new ValidationError(`${name} is missing required field ${field}`);
  }
  const allowed = new Set(fields);
  for (const field of Object.keys(value)) {
    if (!allowed.has(field)) throw new ValidationError(`${name} contains unknown field ${field}`);
  }
}

function requireString(value, name, max = 512) {
  if (typeof value !== 'string' || value.length < 1 || value.length > max) {
    throw new ValidationError(`${name} must be a non-empty string with at most ${max} characters`);
  }
  return value;
}
function requireIdentifier(value, name) {
  requireString(value, name, 192);
  if (!IDENTIFIER_RE.test(value)) throw new ValidationError(`${name} is invalid`);
  return value;
}
function requireVersion(value, name) {
  requireString(value, name, 96);
  if (!VERSION_RE.test(value)) throw new ValidationError(`${name} is invalid`);
  return value;
}
function requireDigest(value, name) {
  if (typeof value !== 'string' || !SHA256_RE.test(value)) {
    throw new ValidationError(`${name} must be a lowercase sha256 digest`);
  }
  return value;
}
function requireGitSha(value, name) {
  if (typeof value !== 'string' || !GIT_SHA_RE.test(value)) {
    throw new ValidationError(`${name} must be a lowercase 40-hex git revision`);
  }
  return value;
}
function requireTimestamp(value, name) {
  requireString(value, name, 64);
  const d = new Date(value);
  if (Number.isNaN(d.getTime()) || d.toISOString() !== value) {
    throw new ValidationError(`${name} must be a canonical ISO timestamp`);
  }
}
function requireEnum(value, allowed, name) {
  if (!allowed.includes(value)) throw new ValidationError(`${name} must be one of ${allowed.join(', ')}`);
  return value;
}
function requireInteger(value, name, min = 0, max = Number.MAX_SAFE_INTEGER) {
  if (!Number.isSafeInteger(value) || value < min || value > max) {
    throw new ValidationError(`${name} must be an integer in [${min}, ${max}]`);
  }
  return value;
}
function requireNumber(value, name, min = 0, max = Number.MAX_VALUE) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) {
    throw new ValidationError(`${name} must be a finite number in [${min}, ${max}]`);
  }
  return value;
}
function nullableString(value, name, max = 512) {
  if (value === null) return null;
  return requireString(value, name, max);
}
function nullableDigest(value, name) {
  if (value === null) return null;
  return requireDigest(value, name);
}
function nullableNumber(value, name, min = 0, max = Number.MAX_VALUE) {
  if (value === null) return null;
  return requireNumber(value, name, min, max);
}
function nullableInteger(value, name, min = 0, max = Number.MAX_SAFE_INTEGER) {
  if (value === null) return null;
  return requireInteger(value, name, min, max);
}
function requireUniqueIntegers(value, name, { minItems = 1, maxItems = 32, min = 0, max = 1_000_000 } = {}) {
  if (!Array.isArray(value) || value.length < minItems || value.length > maxItems) {
    throw new ValidationError(`${name} must contain ${minItems}-${maxItems} integers`);
  }
  const seen = new Set();
  for (const item of value) {
    requireInteger(item, name, min, max);
    if (seen.has(item)) throw new ValidationError(`${name} contains duplicate value ${item}`);
    seen.add(item);
  }
  return value;
}
function requireUniqueStrings(value, name, { minItems = 0, maxItems = 32, maxLength = 256 } = {}) {
  if (!Array.isArray(value) || value.length < minItems || value.length > maxItems) {
    throw new ValidationError(`${name} must contain ${minItems}-${maxItems} strings`);
  }
  const seen = new Set();
  for (const item of value) {
    requireString(item, name, maxLength);
    if (seen.has(item)) throw new ValidationError(`${name} contains duplicate value ${item}`);
    seen.add(item);
  }
  return value;
}
function requireOrderedTriplet(min, nominal, max, name) {
  requireInteger(min, `${name}.min`);
  requireInteger(nominal, `${name}.nominal`);
  requireInteger(max, `${name}.max`);
  if (!(min <= nominal && nominal <= max)) {
    throw new ValidationError(`${name} must satisfy min <= nominal <= max`);
  }
}
function requireBoundary(value, expected, name) {
  if (value !== expected) throw new ValidationError(`Inference measurement boundary field ${name} is invalid`);
}
function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

function validateProfileShape(profile) {
  requireClosedObject(profile, PROFILE_FIELDS, 'Inference workload profile');
  if (profile.schema !== INFERENCE_WORKLOAD_PROFILE_SCHEMA) throw new ValidationError('Inference workload profile schema is invalid');
  if (profile.version !== 0) throw new ValidationError('Inference workload profile version is invalid');
  requireIdentifier(profile.profile_id, 'profile_id');
  requireVersion(profile.profile_version, 'profile_version');
  requireIdentifier(profile.task_family, 'task_family');
  requireString(profile.purpose, 'purpose', 1024);
  requireDigest(profile.fixture_digest, 'fixture_digest');
  requireTimestamp(profile.created_at, 'created_at');

  requireClosedObject(profile.token_shape, TOKEN_FIELDS, 'token_shape');
  requireOrderedTriplet(profile.token_shape.input_min, profile.token_shape.input_nominal, profile.token_shape.input_max, 'input_tokens');
  requireOrderedTriplet(profile.token_shape.output_min, profile.token_shape.output_nominal, profile.token_shape.output_max, 'output_tokens');
  requireUniqueIntegers(profile.token_shape.context_tiers, 'context_tiers', { minItems: 1, maxItems: 16, min: 1, max: 10_000_000 });
  requireUniqueIntegers(profile.token_shape.concurrency_values, 'concurrency_values', { minItems: 1, maxItems: 16, min: 1, max: 100_000 });
  nullableNumber(profile.token_shape.arrival_rate_rps, 'arrival_rate_rps', 0, 1_000_000);
  requireUniqueIntegers(profile.token_shape.batch_sizes, 'batch_sizes', { minItems: 1, maxItems: 16, min: 1, max: 100_000 });
  if (typeof profile.token_shape.streaming !== 'boolean') throw new ValidationError('streaming must be boolean');
  requireInteger(profile.token_shape.repeated_prefix_tokens, 'repeated_prefix_tokens', 0, 10_000_000);
  nullableInteger(profile.token_shape.expected_request_count, 'expected_request_count', 1, 10_000_000_000);

  requireClosedObject(profile.objectives, OBJECTIVE_FIELDS, 'objectives');
  nullableNumber(profile.objectives.ttft_ms_p95, 'ttft_ms_p95');
  nullableNumber(profile.objectives.itl_ms_p95, 'itl_ms_p95');
  nullableNumber(profile.objectives.e2e_ms_p95, 'e2e_ms_p95');
  nullableNumber(profile.objectives.throughput_tokens_s, 'throughput_tokens_s');
  requireEnum(profile.objectives.locality, LOCALITIES, 'locality');
  for (const field of ['quality_evidence_required','measure_power','measure_cost']) {
    if (typeof profile.objectives[field] !== 'boolean') throw new ValidationError(`${field} must be boolean`);
  }

  requireBoundary(profile.authority_effect, 'none', 'authority_effect');
  requireBoundary(profile.network_effect, 'none', 'network_effect');
  requireBoundary(profile.credential_visibility, 'none', 'credential_visibility');
  requireBoundary(profile.runtime_activation, false, 'runtime_activation');
  requireBoundary(profile.selection_effect, 'none', 'selection_effect');
  requireBoundary(profile.capability_promotion, false, 'capability_promotion');
  return profile;
}

export function validateInferenceWorkloadProfile(profile) {
  validateProfileShape(profile);
  return deepFreeze({
    valid: true,
    schema: profile.schema,
    profile_id: profile.profile_id,
    profile_version: profile.profile_version,
    profile_digest: digestObject(profile),
    fixture_digest: profile.fixture_digest,
    task_family: profile.task_family,
    authority_effect: 'none',
    network_effect: 'none',
    credential_visibility: 'none',
    runtime_activation: false,
    selection_effect: 'none',
    capability_promotion: false
  });
}

export function inferenceWorkloadProfileDigest(profile) {
  validateProfileShape(profile);
  return digestObject(profile);
}

function validatePercentiles(value, name) {
  requireClosedObject(value, PERCENTILE_FIELDS, name);
  for (const field of PERCENTILE_FIELDS) nullableNumber(value[field], `${name}.${field}`);
  const values = PERCENTILE_FIELDS.map(field => value[field]);
  if (values.every(item => item === null)) return;
  if (values.some(item => item === null)) throw new ValidationError(`${name} percentiles must be all null or all measured`);
  if (!(value.p50 <= value.p95 && value.p95 <= value.p99)) {
    throw new ValidationError(`${name} must satisfy p50 <= p95 <= p99`);
  }
}

function validateBenchmarkShape(evidence) {
  requireClosedObject(evidence, BENCHMARK_FIELDS, 'Inference benchmark evidence');
  if (evidence.schema !== INFERENCE_BENCHMARK_EVIDENCE_SCHEMA) throw new ValidationError('Inference benchmark evidence schema is invalid');
  if (evidence.version !== 0) throw new ValidationError('Inference benchmark evidence version is invalid');
  requireIdentifier(evidence.benchmark_id, 'benchmark_id');
  requireEnum(evidence.evidence_class, EVIDENCE_CLASSES, 'evidence_class');
  requireTimestamp(evidence.measured_at, 'measured_at');

  requireClosedObject(evidence.workload, WORKLOAD_BINDING_FIELDS, 'workload');
  requireIdentifier(evidence.workload.profile_id, 'workload.profile_id');
  requireVersion(evidence.workload.profile_version, 'workload.profile_version');
  requireDigest(evidence.workload.profile_digest, 'workload.profile_digest');
  requireDigest(evidence.workload.fixture_digest, 'workload.fixture_digest');

  requireClosedObject(evidence.subject, SUBJECT_FIELDS, 'subject');
  requireGitSha(evidence.subject.repository_revision, 'subject.repository_revision');
  requireIdentifier(evidence.subject.model_or_provider_id, 'subject.model_or_provider_id');
  requireString(evidence.subject.model_revision_or_digest, 'subject.model_revision_or_digest', 256);
  requireIdentifier(evidence.subject.engine_id, 'subject.engine_id');
  requireVersion(evidence.subject.engine_version, 'subject.engine_version');
  nullableDigest(evidence.subject.engine_implementation_digest, 'subject.engine_implementation_digest');
  requireIdentifier(evidence.subject.runtime_id, 'subject.runtime_id');
  requireVersion(evidence.subject.runtime_version, 'subject.runtime_version');
  nullableString(evidence.subject.tokenizer_id, 'subject.tokenizer_id', 192);
  nullableString(evidence.subject.tokenizer_revision, 'subject.tokenizer_revision', 256);
  requireString(evidence.subject.numeric_format, 'subject.numeric_format', 64);
  nullableDigest(evidence.subject.sampling_config_digest, 'subject.sampling_config_digest');
  nullableDigest(evidence.subject.prompt_policy_digest, 'subject.prompt_policy_digest');
  nullableDigest(evidence.subject.tool_memory_policy_digest, 'subject.tool_memory_policy_digest');
  requireIdentifier(evidence.subject.benchmark_harness_id, 'subject.benchmark_harness_id');
  requireVersion(evidence.subject.benchmark_harness_version, 'subject.benchmark_harness_version');
  requireDigest(evidence.subject.benchmark_harness_digest, 'subject.benchmark_harness_digest');

  requireClosedObject(evidence.environment, ENVIRONMENT_FIELDS, 'environment');
  requireString(evidence.environment.os, 'environment.os', 128);
  requireString(evidence.environment.arch, 'environment.arch', 64);
  requireString(evidence.environment.cpu, 'environment.cpu', 256);
  requireInteger(evidence.environment.host_ram_bytes, 'environment.host_ram_bytes', 1);
  requireEnum(evidence.environment.accelerator_kind, ACCELERATOR_KINDS, 'environment.accelerator_kind');
  requireUniqueStrings(evidence.environment.accelerator_models, 'environment.accelerator_models', { minItems: 0, maxItems: 16 });
  requireInteger(evidence.environment.accelerator_count, 'environment.accelerator_count', 0, 1024);
  nullableInteger(evidence.environment.accelerator_memory_bytes, 'environment.accelerator_memory_bytes', 1);
  nullableString(evidence.environment.driver_version, 'environment.driver_version', 128);
  nullableString(evidence.environment.firmware_version, 'environment.firmware_version', 128);
  nullableString(evidence.environment.accelerator_runtime_version, 'environment.accelerator_runtime_version', 128);
  nullableDigest(evidence.environment.topology_digest, 'environment.topology_digest');
  requireUniqueStrings(evidence.environment.source_ids, 'environment.source_ids', { minItems: 1, maxItems: 32 });
  if (evidence.environment.accelerator_kind === 'none') {
    if (evidence.environment.accelerator_count !== 0 || evidence.environment.accelerator_models.length !== 0 || evidence.environment.accelerator_memory_bytes !== null) {
      throw new ValidationError('environment accelerator_kind none is inconsistent with accelerator observations');
    }
  } else if (evidence.environment.accelerator_count < 1 || evidence.environment.accelerator_models.length < 1) {
    throw new ValidationError('environment accelerator observations are incomplete');
  }

  requireClosedObject(evidence.protocol, PROTOCOL_FIELDS, 'protocol');
  requireInteger(evidence.protocol.warmup_requests, 'protocol.warmup_requests', 0, 10_000_000);
  requireInteger(evidence.protocol.measured_requests, 'protocol.measured_requests', 1, 10_000_000_000);
  requireInteger(evidence.protocol.concurrency, 'protocol.concurrency', 1, 100_000);
  requireInteger(evidence.protocol.batch_size, 'protocol.batch_size', 1, 100_000);
  if (typeof evidence.protocol.streaming !== 'boolean') throw new ValidationError('protocol.streaming must be boolean');
  requireEnum(evidence.protocol.cache_mode, CACHE_MODES, 'protocol.cache_mode');
  requireString(evidence.protocol.failure_policy, 'protocol.failure_policy', 256);
  requireString(evidence.protocol.percentile_method, 'protocol.percentile_method', 256);

  requireClosedObject(evidence.observations, OBSERVATION_FIELDS, 'observations');
  requireClosedObject(evidence.observations.latency, LATENCY_FIELDS, 'observations.latency');
  for (const field of LATENCY_FIELDS) validatePercentiles(evidence.observations.latency[field], `observations.latency.${field}`);

  requireClosedObject(evidence.observations.throughput, THROUGHPUT_FIELDS, 'observations.throughput');
  for (const field of THROUGHPUT_FIELDS) nullableNumber(evidence.observations.throughput[field], `observations.throughput.${field}`);

  requireClosedObject(evidence.observations.counts, COUNT_FIELDS, 'observations.counts');
  for (const field of COUNT_FIELDS) requireInteger(evidence.observations.counts[field], `observations.counts.${field}`, 0, 10_000_000_000);
  const c = evidence.observations.counts;
  if (c.request_count !== c.success_count + c.error_count + c.rejected_count + c.oom_count) {
    throw new ValidationError('observations.counts request_count must equal success + error + rejected + oom');
  }
  if (c.request_count !== evidence.protocol.measured_requests) {
    throw new ValidationError('observations.counts request_count must equal protocol.measured_requests');
  }

  requireClosedObject(evidence.observations.resources, RESOURCE_FIELDS, 'observations.resources');
  for (const field of RESOURCE_FIELDS) {
    if (field === 'thermal_throttling') {
      if (evidence.observations.resources[field] !== null && typeof evidence.observations.resources[field] !== 'boolean') {
        throw new ValidationError('observations.resources.thermal_throttling must be boolean or null');
      }
    } else nullableNumber(evidence.observations.resources[field], `observations.resources.${field}`);
  }

  requireClosedObject(evidence.observations.economic, ECONOMIC_FIELDS, 'observations.economic');
  for (const field of ECONOMIC_FIELDS.slice(0, 5)) nullableNumber(evidence.observations.economic[field], `observations.economic.${field}`);
  requireEnum(evidence.observations.economic.denominator_kind, DENOMINATOR_KINDS, 'observations.economic.denominator_kind');
  nullableNumber(evidence.observations.economic.denominator_value, 'observations.economic.denominator_value');
  if (evidence.observations.economic.denominator_kind === 'none' && evidence.observations.economic.denominator_value !== null) {
    throw new ValidationError('economic denominator_value must be null when denominator_kind is none');
  }
  if (evidence.observations.economic.denominator_kind !== 'none' && evidence.observations.economic.denominator_value === null) {
    throw new ValidationError('economic denominator_value is required when denominator_kind is measured');
  }

  requireClosedObject(evidence.quality, QUALITY_FIELDS, 'quality');
  requireEnum(evidence.quality.state, QUALITY_STATES, 'quality.state');
  nullableString(evidence.quality.artifact_ref, 'quality.artifact_ref', 512);
  nullableDigest(evidence.quality.artifact_digest, 'quality.artifact_digest');
  if (evidence.quality.state === 'externally-bound') {
    if (evidence.quality.artifact_ref === null || evidence.quality.artifact_digest === null) {
      throw new ValidationError('externally-bound quality requires artifact_ref and artifact_digest');
    }
  } else if (evidence.quality.artifact_ref !== null || evidence.quality.artifact_digest !== null) {
    throw new ValidationError('not-established quality cannot carry an artifact binding');
  }

  nullableString(evidence.reproducer_ref, 'reproducer_ref', 512);
  if (evidence.evidence_class === 'independently-reproduced' && evidence.reproducer_ref === null) {
    throw new ValidationError('independently-reproduced evidence requires reproducer_ref');
  }

  requireBoundary(evidence.authority_effect, 'none', 'authority_effect');
  requireBoundary(evidence.network_effect, 'none', 'network_effect');
  requireBoundary(evidence.credential_visibility, 'none', 'credential_visibility');
  requireBoundary(evidence.runtime_activation, false, 'runtime_activation');
  requireBoundary(evidence.selection_effect, 'none', 'selection_effect');
  requireBoundary(evidence.capability_promotion, false, 'capability_promotion');
  return evidence;
}

export function validateInferenceBenchmarkEvidence(evidence) {
  validateBenchmarkShape(evidence);
  return deepFreeze({
    valid: true,
    schema: evidence.schema,
    benchmark_id: evidence.benchmark_id,
    evidence_class: evidence.evidence_class,
    evidence_digest: digestObject(evidence),
    profile_id: evidence.workload.profile_id,
    profile_digest: evidence.workload.profile_digest,
    accelerator_kind: evidence.environment.accelerator_kind,
    accelerator_count: evidence.environment.accelerator_count,
    quality_state: evidence.quality.state,
    authority_effect: 'none',
    network_effect: 'none',
    credential_visibility: 'none',
    runtime_activation: false,
    selection_effect: 'none',
    capability_promotion: false
  });
}

export function inferenceBenchmarkEvidenceDigest(evidence) {
  validateBenchmarkShape(evidence);
  return digestObject(evidence);
}

export function resolveInferenceBenchmarkEvidence(evidence, profile) {
  const profileResult = validateInferenceWorkloadProfile(profile);
  const evidenceResult = validateInferenceBenchmarkEvidence(evidence);
  if (evidence.workload.profile_id !== profile.profile_id) throw new ValidationError('Benchmark workload profile_id mismatch');
  if (evidence.workload.profile_version !== profile.profile_version) throw new ValidationError('Benchmark workload profile_version mismatch');
  if (evidence.workload.profile_digest !== profileResult.profile_digest) throw new ValidationError('Benchmark workload profile_digest mismatch');
  if (evidence.workload.fixture_digest !== profile.fixture_digest) throw new ValidationError('Benchmark workload fixture_digest mismatch');
  return deepFreeze({
    valid: true,
    benchmark_id: evidence.benchmark_id,
    evidence_digest: evidenceResult.evidence_digest,
    profile_id: profile.profile_id,
    profile_digest: profileResult.profile_digest,
    fixture_digest: profile.fixture_digest,
    evidence_class: evidence.evidence_class,
    quality_state: evidence.quality.state,
    authority_effect: 'none',
    network_effect: 'none',
    credential_visibility: 'none',
    runtime_activation: false,
    selection_effect: 'none',
    capability_promotion: false
  });
}
