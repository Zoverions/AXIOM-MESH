import {
  ValidationError,
  assertPlainObject,
  assertString,
  digestObject
} from './canonical.mjs';

export const SEMANTIC_OPERATION_PROPOSAL_SCHEMA =
  'axiom-semantic-operation-proposal.v0';
export const SEMANTIC_OPERATION_PROPOSAL_SCHEMA_ID =
  'urn:axiom:contract:semantic-operation-proposal:v0';
export const SEMANTIC_OPERATION_MANIFEST_SCHEMA =
  'axiom-semantic-operation-manifest.v0';

const VERSION = 0;
const STATUS = 'inert-semantic-operation-proposal';
const MANIFEST_STATUS = 'inert-semantic-operation-manifest';
const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9_.:#/-]{0,191}$/;
const DIGEST = /^[a-f0-9]{64}$/;
const CANONICAL_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const MAX_PROPOSED = 32;
const MAX_ARGS = 32;
const MAX_EXPLANATION = 512;
const MAX_SERIALIZED_BYTES = 65_536;

const DOCUMENT_FIELDS = Object.freeze([
  'schema',
  'version',
  'status',
  'proposal_id',
  'provider',
  'operation_manifest_digest',
  'candidate_set_digest',
  'request_digest',
  'state_digest',
  'state_classification',
  'candidate_mode',
  'proposed',
  'withheld',
  'suppressed',
  'latency_ms',
  'usage_evidence',
  'calibration_report_ref',
  'explanation',
  'proposal_digest',
  'authority_effect',
  'assurance_effect',
  'currentness_effect',
  'execution_effect',
  'runtime_activation',
  'network_effect',
  'selection_effect'
]);

const PROVIDER_FIELDS = Object.freeze([
  'provider_ref',
  'profile_ref',
  'artifact_ref',
  'runtime_ref',
  'revision_evidence',
  'provider_mode'
]);

const PROPOSED_FIELDS = Object.freeze([
  'operation_id',
  'arguments',
  'confidence',
  'status',
  'order_index'
]);

const WITHHELD_FIELDS = Object.freeze([
  'operation_id',
  'reason',
  'arguments',
  'confidence'
]);

const SUPPRESSED_FIELDS = Object.freeze([
  'operation_id',
  'reason',
  'arguments',
  'confidence'
]);

const USAGE_FIELDS = Object.freeze([
  'input_units',
  'output_units',
  'compute_class',
  'provider_report_ref'
]);

const ARG_TYPES = Object.freeze([
  'string',
  'integer',
  'number',
  'boolean',
  'enum',
  'object'
]);

const STATE_CLASSIFICATIONS = Object.freeze([
  'public',
  'internal',
  'confidential',
  'restricted'
]);

const CANDIDATE_MODES = Object.freeze([
  'eligible-only',
  'descriptive-discovery'
]);

const PROPOSAL_ITEM_STATUSES = Object.freeze([
  'proposed',
  'withheld',
  'rejected',
  'abstained'
]);

const WITHHELD_REASONS = Object.freeze([
  'not-in-manifest',
  'deterministic-ineligible',
  'missing-required-argument',
  'unknown-argument',
  'wrong-argument-type',
  'wrong-enum-value',
  'schema-constraint-failed',
  'provider-suppressed',
  'malformed-call',
  'stale-identity',
  'locality-excluded',
  'prompt-injection-rejected',
  'provider-failure',
  'empty-abstention'
]);

const PROVIDER_MODES = Object.freeze([
  'owner-local',
  'owner-remote',
  'provider-remote',
  'hybrid'
]);

const REVISION_EVIDENCE = Object.freeze([
  'content-addressed',
  'provider-versioned',
  'mutable-alias',
  'unpinned'
]);

const ZERO_AUTHORITY = Object.freeze({
  authority_effect: 'none',
  assurance_effect: 'none',
  currentness_effect: 'none',
  execution_effect: 'none',
  runtime_activation: false,
  network_effect: 'none',
  selection_effect: 'proposal-only'
});

function exact(value, fields, name) {
  const object = assertPlainObject(value, name);
  const allowed = new Set(fields);
  for (const key of Object.keys(object)) {
    if (!allowed.has(key)) {
      throw new ValidationError(`${name} contains unknown field ${key}`);
    }
  }
  for (const key of fields) {
    if (!Object.hasOwn(object, key)) {
      throw new ValidationError(`${name}.${key} is required`);
    }
  }
  return object;
}

function identifier(value, name) {
  return assertString(value, name, { min: 1, max: 192, pattern: IDENTIFIER });
}

function digest(value, name) {
  return assertString(value, name, { min: 64, max: 64, pattern: DIGEST });
}

function boolean(value, name) {
  if (typeof value !== 'boolean') {
    throw new ValidationError(`${name} must be boolean`);
  }
  return value;
}

function integer(value, name, min, max) {
  if (!Number.isSafeInteger(value) || value < min || value > max) {
    throw new ValidationError(`${name} must be an integer in [${min}, ${max}]`);
  }
  return value;
}

function unitOrNull(value, name) {
  if (value === null) return null;
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1) {
    throw new ValidationError(`${name} must be a finite number in [0,1] or null`);
  }
  return Object.is(value, -0) ? 0 : value;
}

function enumValue(value, allowed, name) {
  if (!allowed.includes(value)) {
    throw new ValidationError(`${name} must be one of ${allowed.join(', ')}`);
  }
  return value;
}

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

function everyObjectAdditionalPropertiesFalse(node) {
  if (!node || typeof node !== 'object' || Array.isArray(node)) return true;
  if (node.type === 'object' || Object.hasOwn(node, 'properties') || Object.hasOwn(node, 'required')) {
    if (node.additionalProperties !== false) return false;
  }
  for (const value of Object.values(node)) {
    if (value && typeof value === 'object') {
      if (Array.isArray(value)) {
        for (const item of value) {
          if (!everyObjectAdditionalPropertiesFalse(item)) return false;
        }
      } else if (!everyObjectAdditionalPropertiesFalse(value)) {
        return false;
      }
    }
  }
  return true;
}

function compareCodeUnits(left, right) {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

function sortByOperationId(left, right) {
  return compareCodeUnits(left.operation_id, right.operation_id);
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function normalizeArgumentsObject(value, name) {
  if (!isPlainObject(value)) {
    throw new ValidationError(`${name} must be an object`);
  }
  const keys = Object.keys(value);
  if (keys.length > MAX_ARGS) {
    throw new ValidationError(`${name} exceeds argument bound`);
  }
  for (const key of keys) {
    identifier(key, `${name}.${key} name`);
    const item = value[key];
    const kind = typeof item;
    if (
      item !== null
      && kind !== 'string'
      && kind !== 'number'
      && kind !== 'boolean'
    ) {
      if (Array.isArray(item) || (item && kind === 'object')) {
        // nested objects allowed only as plain JSON primitives tree via digest
        digestObject(item);
      } else {
        throw new ValidationError(`${name}.${key} has unsupported type`);
      }
    }
    if (kind === 'number' && !Number.isFinite(item)) {
      throw new ValidationError(`${name}.${key} must be finite`);
    }
  }
  return structuredClone(value);
}

function validateArgSchema(schema, name) {
  const value = exact(
    schema,
    ['type', 'required', 'enum_values', 'properties'],
    name
  );
  enumValue(value.type, ARG_TYPES, `${name}.type`);
  boolean(value.required, `${name}.required`);
  if (value.type === 'enum') {
    if (!Array.isArray(value.enum_values) || value.enum_values.length < 1) {
      throw new ValidationError(`${name}.enum_values must be a non-empty array`);
    }
    for (const entry of value.enum_values) {
      assertString(entry, `${name}.enum_values item`, { min: 1, max: 128 });
    }
  } else if (value.enum_values !== null) {
    throw new ValidationError(`${name}.enum_values must be null unless type=enum`);
  }
  if (value.type === 'object') {
    if (!isPlainObject(value.properties)) {
      throw new ValidationError(`${name}.properties must be an object`);
    }
  } else if (value.properties !== null) {
    throw new ValidationError(`${name}.properties must be null unless type=object`);
  }
  return value;
}

function validateArgumentValue(schema, value, name) {
  if (value === undefined) {
    if (schema.required) {
      return { ok: false, reason: 'missing-required-argument' };
    }
    return { ok: true };
  }
  switch (schema.type) {
    case 'string':
      if (typeof value !== 'string' || value.length < 1 || value.length > 512) {
        return { ok: false, reason: 'wrong-argument-type' };
      }
      return { ok: true };
    case 'integer':
      if (!Number.isSafeInteger(value)) {
        return { ok: false, reason: 'wrong-argument-type' };
      }
      return { ok: true };
    case 'number':
      if (typeof value !== 'number' || !Number.isFinite(value)) {
        return { ok: false, reason: 'wrong-argument-type' };
      }
      return { ok: true };
    case 'boolean':
      if (typeof value !== 'boolean') {
        return { ok: false, reason: 'wrong-argument-type' };
      }
      return { ok: true };
    case 'enum':
      if (typeof value !== 'string' || !schema.enum_values.includes(value)) {
        return { ok: false, reason: 'wrong-enum-value' };
      }
      return { ok: true };
    case 'object':
      if (!isPlainObject(value)) {
        return { ok: false, reason: 'wrong-argument-type' };
      }
      return { ok: true };
    default:
      return { ok: false, reason: 'schema-constraint-failed' };
  }
}

/**
 * Deterministic inert operation-candidate fixture (3–6 ops).
 * Network-free; no capability/spend/eligibility ranking.
 */
export function createInertOperationManifestFixture(overrides = {}) {
  const operations = overrides.operations || [
    {
      operation_id: 'op.inert.read_status',
      description: 'Read inert status label',
      arguments: {
        target: {
          type: 'string',
          required: true,
          enum_values: null,
          properties: null
        }
      }
    },
    {
      operation_id: 'op.inert.list_tags',
      description: 'List inert tags',
      arguments: {
        limit: {
          type: 'integer',
          required: false,
          enum_values: null,
          properties: null
        }
      }
    },
    {
      operation_id: 'op.inert.set_mode',
      description: 'Set inert mode enum',
      arguments: {
        mode: {
          type: 'enum',
          required: true,
          enum_values: ['observe', 'annotate', 'idle'],
          properties: null
        }
      }
    },
    {
      operation_id: 'op.inert.echo_flag',
      description: 'Echo boolean flag',
      arguments: {
        enabled: {
          type: 'boolean',
          required: true,
          enum_values: null,
          properties: null
        }
      }
    },
    {
      operation_id: 'op.inert.score_hint',
      description: 'Record numeric hint',
      arguments: {
        score: {
          type: 'number',
          required: true,
          enum_values: null,
          properties: null
        }
      }
    }
  ];

  if (operations.length < 3 || operations.length > 6) {
    throw new ValidationError('inert operation manifest must contain 3-6 operations');
  }

  const normalized = [];
  const seen = new Set();
  for (const [index, entry] of operations.entries()) {
    const value = exact(
      entry,
      ['operation_id', 'description', 'arguments'],
      `manifest.operations[${index}]`
    );
    const operationId = identifier(value.operation_id, `manifest.operations[${index}].operation_id`);
    if (seen.has(operationId)) {
      throw new ValidationError(`duplicate operation_id ${operationId}`);
    }
    seen.add(operationId);
    assertString(value.description, `manifest.operations[${index}].description`, {
      min: 1,
      max: 256
    });
    const args = assertPlainObject(value.arguments, `manifest.operations[${index}].arguments`);
    const argKeys = Object.keys(args).sort();
    if (argKeys.length > MAX_ARGS) {
      throw new ValidationError(`manifest.operations[${index}].arguments exceeds bound`);
    }
    const normalizedArgs = {};
    for (const key of argKeys) {
      identifier(key, `manifest.operations[${index}].arguments.${key}`);
      normalizedArgs[key] = validateArgSchema(
        args[key],
        `manifest.operations[${index}].arguments.${key}`
      );
    }
    normalized.push({
      operation_id: operationId,
      description: value.description,
      arguments: normalizedArgs
    });
  }

  normalized.sort(sortByOperationId);
  const document = {
    schema: SEMANTIC_OPERATION_MANIFEST_SCHEMA,
    version: VERSION,
    status: MANIFEST_STATUS,
    operations: normalized,
    ...ZERO_AUTHORITY
  };
  return deepFreeze({
    ...document,
    manifest_digest: digestObject({
      schema: document.schema,
      version: document.version,
      status: document.status,
      operations: document.operations
    })
  });
}

export function computeCandidateSetDigest(candidates) {
  if (!Array.isArray(candidates) || candidates.length < 1 || candidates.length > MAX_PROPOSED) {
    throw new ValidationError('candidates must be a bounded non-empty array');
  }
  const normalized = candidates.map((entry, index) => {
    const value = exact(
      entry,
      ['operation_id', 'eligible', 'eligibility_reason'],
      `candidates[${index}]`
    );
    const operationId = identifier(value.operation_id, `candidates[${index}].operation_id`);
    const eligible = boolean(value.eligible, `candidates[${index}].eligible`);
    const eligibilityReason = identifier(
      value.eligibility_reason,
      `candidates[${index}].eligibility_reason`
    );
    if (eligible && eligibilityReason !== 'eligible') {
      throw new ValidationError('eligible candidates must use eligibility_reason eligible');
    }
    if (!eligible && eligibilityReason === 'eligible') {
      throw new ValidationError('ineligible candidates must state a non-eligible reason');
    }
    return {
      operation_id: operationId,
      eligible,
      eligibility_reason: eligibilityReason
    };
  }).sort(sortByOperationId);

  const seen = new Set();
  for (const entry of normalized) {
    if (seen.has(entry.operation_id)) {
      throw new ValidationError(`duplicate candidate ${entry.operation_id}`);
    }
    seen.add(entry.operation_id);
  }
  return digestObject(normalized);
}

function normalizeProviderIdentity(input) {
  const value = exact(input, PROVIDER_FIELDS, 'semantic operation provider');
  return Object.freeze({
    provider_ref: identifier(value.provider_ref, 'provider.provider_ref'),
    profile_ref: identifier(value.profile_ref, 'provider.profile_ref'),
    artifact_ref: value.artifact_ref === null
      ? null
      : identifier(value.artifact_ref, 'provider.artifact_ref'),
    runtime_ref: identifier(value.runtime_ref, 'provider.runtime_ref'),
    revision_evidence: enumValue(
      value.revision_evidence,
      REVISION_EVIDENCE,
      'provider.revision_evidence'
    ),
    provider_mode: enumValue(value.provider_mode, PROVIDER_MODES, 'provider.provider_mode')
  });
}

function normalizeUsageEvidence(value) {
  if (value === null) return null;
  const usage = exact(value, USAGE_FIELDS, 'usage_evidence');
  return Object.freeze({
    input_units: usage.input_units === null
      ? null
      : integer(usage.input_units, 'usage_evidence.input_units', 0, 1_000_000_000),
    output_units: usage.output_units === null
      ? null
      : integer(usage.output_units, 'usage_evidence.output_units', 0, 1_000_000_000),
    compute_class: usage.compute_class === null
      ? null
      : assertString(usage.compute_class, 'usage_evidence.compute_class', { min: 1, max: 64 }),
    provider_report_ref: usage.provider_report_ref === null
      ? null
      : identifier(usage.provider_report_ref, 'usage_evidence.provider_report_ref')
  });
}

function proposalDigestPayload(document) {
  return {
    schema: document.schema,
    version: document.version,
    status: document.status,
    proposal_id: document.proposal_id,
    provider: document.provider,
    operation_manifest_digest: document.operation_manifest_digest,
    candidate_set_digest: document.candidate_set_digest,
    request_digest: document.request_digest,
    state_digest: document.state_digest,
    state_classification: document.state_classification,
    candidate_mode: document.candidate_mode,
    proposed: document.proposed,
    withheld: document.withheld,
    suppressed: document.suppressed,
    latency_ms: document.latency_ms,
    usage_evidence: document.usage_evidence,
    calibration_report_ref: document.calibration_report_ref,
    explanation: document.explanation,
    authority_effect: document.authority_effect,
    assurance_effect: document.assurance_effect,
    currentness_effect: document.currentness_effect,
    execution_effect: document.execution_effect,
    runtime_activation: document.runtime_activation,
    network_effect: document.network_effect,
    selection_effect: document.selection_effect
  };
}

function validateCallAgainstManifest(operationId, args, manifestById, candidateById, candidateMode) {
  const manifestEntry = manifestById.get(operationId);
  if (!manifestEntry) {
    return {
      kind: 'withheld',
      reason: 'not-in-manifest',
      operation_id: operationId,
      arguments: args,
      confidence: null
    };
  }

  const candidate = candidateById.get(operationId);
  if (candidateMode === 'eligible-only') {
    if (!candidate) {
      return {
        kind: 'withheld',
        reason: 'not-in-manifest',
        operation_id: operationId,
        arguments: args,
        confidence: null
      };
    }
    if (!candidate.eligible) {
      return {
        kind: 'withheld',
        reason: 'deterministic-ineligible',
        operation_id: operationId,
        arguments: args,
        confidence: null
      };
    }
  }

  const schemaArgs = manifestEntry.arguments;
  const providedKeys = Object.keys(args);
  for (const key of providedKeys) {
    if (!Object.hasOwn(schemaArgs, key)) {
      return {
        kind: 'withheld',
        reason: 'unknown-argument',
        operation_id: operationId,
        arguments: args,
        confidence: null
      };
    }
  }
  for (const [key, schema] of Object.entries(schemaArgs)) {
    const result = validateArgumentValue(schema, args[key], key);
    if (!result.ok) {
      return {
        kind: 'withheld',
        reason: result.reason,
        operation_id: operationId,
        arguments: args,
        confidence: null
      };
    }
  }

  return {
    kind: 'proposed',
    operation_id: operationId,
    arguments: args,
    confidence: null,
    status: 'proposed'
  };
}

/**
 * Generic provider-result normalization.
 * Accepts ordered calls with optional confidence; never invents args or ops.
 */
export function normalizeGenericProviderResult(raw, context = {}) {
  const value = assertPlainObject(raw, 'generic provider result');
  const calls = Array.isArray(value.calls) ? value.calls : null;
  if (calls === null) {
    return Object.freeze({
      ok: false,
      failure_reason: 'provider-failure',
      calls: [],
      suppressed: [],
      confidence: null,
      latency_ms: null,
      usage_evidence: null,
      explanation: null,
      trigger: value.trigger === undefined ? null : value.trigger
    });
  }

  const normalizedCalls = [];
  for (const [index, entry] of calls.entries()) {
    if (!isPlainObject(entry)) {
      return Object.freeze({
        ok: false,
        failure_reason: 'malformed-call',
        calls: [],
        suppressed: [],
        confidence: null,
        latency_ms: null,
        usage_evidence: null,
        explanation: null,
        trigger: null
      });
    }
    if (!Object.hasOwn(entry, 'operation_id') || !Object.hasOwn(entry, 'arguments')) {
      return Object.freeze({
        ok: false,
        failure_reason: 'malformed-call',
        calls: [],
        suppressed: [],
        confidence: null,
        latency_ms: null,
        usage_evidence: null,
        explanation: null,
        trigger: null
      });
    }
    let operationId;
    let args;
    try {
      operationId = identifier(entry.operation_id, `calls[${index}].operation_id`);
      args = normalizeArgumentsObject(entry.arguments, `calls[${index}].arguments`);
    } catch {
      return Object.freeze({
        ok: false,
        failure_reason: 'malformed-call',
        calls: [],
        suppressed: [],
        confidence: null,
        latency_ms: null,
        usage_evidence: null,
        explanation: null,
        trigger: null
      });
    }
    const confidence = Object.hasOwn(entry, 'confidence')
      ? unitOrNull(entry.confidence, `calls[${index}].confidence`)
      : (value.confidence === undefined ? null : unitOrNull(value.confidence, 'confidence'));
    normalizedCalls.push({
      operation_id: operationId,
      arguments: args,
      confidence,
      order_index: index
    });
  }

  const suppressed = [];
  if (Array.isArray(value.suppressed)) {
    for (const [index, entry] of value.suppressed.entries()) {
      if (!isPlainObject(entry) || typeof entry.operation_id !== 'string') {
        continue;
      }
      try {
        suppressed.push({
          operation_id: identifier(entry.operation_id, `suppressed[${index}].operation_id`),
          reason: 'provider-suppressed',
          arguments: isPlainObject(entry.arguments)
            ? normalizeArgumentsObject(entry.arguments, `suppressed[${index}].arguments`)
            : {},
          confidence: Object.hasOwn(entry, 'confidence')
            ? unitOrNull(entry.confidence, `suppressed[${index}].confidence`)
            : null
        });
      } catch {
        // ignore malformed suppressed entries; they cannot be promoted
      }
    }
  }

  return Object.freeze({
    ok: true,
    failure_reason: null,
    calls: normalizedCalls,
    suppressed,
    confidence: value.confidence === undefined
      ? null
      : unitOrNull(value.confidence, 'confidence'),
    latency_ms: value.latency_ms === undefined || value.latency_ms === null
      ? null
      : integer(value.latency_ms, 'latency_ms', 0, 3_600_000),
    usage_evidence: value.usage_evidence === undefined
      ? null
      : normalizeUsageEvidence(value.usage_evidence),
    explanation: value.explanation === undefined || value.explanation === null
      ? null
      : assertString(value.explanation, 'explanation', { min: 1, max: MAX_EXPLANATION }),
    trigger: value.trigger === undefined ? null : value.trigger,
    locality_policy: context.locality_policy || 'any'
  });
}

/**
 * Needle-shaped payload normalization.
 * Preserves function_calls / suppressed_calls / confidence as proposal evidence.
 * Does NOT fabricate a #1588 probability distribution from confidence.
 */
export function normalizeNeedleShapedPayload(raw, context = {}) {
  const value = assertPlainObject(raw, 'Needle-shaped payload');
  const functionCalls = Array.isArray(value.function_calls) ? value.function_calls : null;
  if (functionCalls === null) {
    return normalizeGenericProviderResult({ calls: null }, context);
  }

  const calls = [];
  for (const [index, entry] of functionCalls.entries()) {
    if (!isPlainObject(entry)) {
      return normalizeGenericProviderResult({ calls: [{ malformed: true }] }, context);
    }
    const name = entry.name ?? entry.operation_id;
    const args = entry.arguments ?? entry.parameters ?? {};
    const call = {
      operation_id: name,
      arguments: args
    };
    if (Object.hasOwn(entry, 'confidence')) {
      call.confidence = entry.confidence;
    }
    calls.push(call);
  }

  const suppressed = [];
  if (Array.isArray(value.suppressed_calls)) {
    for (const entry of value.suppressed_calls) {
      if (!isPlainObject(entry)) continue;
      const item = {
        operation_id: entry.name ?? entry.operation_id,
        arguments: entry.arguments ?? entry.parameters ?? {}
      };
      if (Object.hasOwn(entry, 'confidence')) {
        item.confidence = entry.confidence;
      }
      suppressed.push(item);
    }
  }

  return normalizeGenericProviderResult({
    calls,
    suppressed,
    confidence: value.confidence,
    latency_ms: value.latency_ms ?? value.latencyMs ?? null,
    usage_evidence: value.usage_evidence ?? (
      value.ram_mb === undefined && value.tokens === undefined
        ? null
        : {
          input_units: value.tokens?.input ?? null,
          output_units: value.tokens?.output ?? null,
          compute_class: value.ram_mb === undefined ? null : `ram-mb:${value.ram_mb}`,
          provider_report_ref: value.provider_report_ref ?? null
        }
    ),
    explanation: value.explanation ?? null,
    trigger: value.trigger ?? null
  }, context);
}

/**
 * Confidence remains a scalar proposal signal. Never a #1588 observation.
 */
export function confidenceIsNotBoundedDecisionObservation(confidence) {
  return Object.freeze({
    confidence: unitOrNull(confidence, 'confidence'),
    is_bounded_decision_observation: false,
    fabricated_distribution: null,
    answer_kind: null,
    probability_support: 'confidence-only-not-1588'
  });
}

export function createSemanticOperationProposal(input) {
  const value = exact(
    input,
    [
      'provider',
      'manifest',
      'candidates',
      'request_digest',
      'state_digest',
      'state_classification',
      'candidate_mode',
      'provider_result',
      'expected_provider_identity',
      'locality_policy',
      'calibration_report_ref'
    ],
    'semantic operation proposal input'
  );

  const provider = normalizeProviderIdentity(value.provider);
  const expected = value.expected_provider_identity === null
    ? null
    : normalizeProviderIdentity(value.expected_provider_identity);

  if (expected) {
    const stale =
      expected.provider_ref !== provider.provider_ref
      || expected.profile_ref !== provider.profile_ref
      || expected.runtime_ref !== provider.runtime_ref
      || expected.artifact_ref !== provider.artifact_ref
      || expected.revision_evidence !== provider.revision_evidence;
    if (stale) {
      throw new ValidationError('stale provider/model/runtime identity fails closed');
    }
  }

  const localityPolicy = enumValue(
    value.locality_policy,
    ['any', 'local-only'],
    'locality_policy'
  );
  if (
    localityPolicy === 'local-only'
    && provider.provider_mode !== 'owner-local'
  ) {
    throw new ValidationError('LOCAL_ONLY excludes remote proposal providers');
  }

  const manifest = value.manifest;
  if (!manifest || typeof manifest !== 'object' || !Array.isArray(manifest.operations)) {
    throw new ValidationError('manifest.operations is required');
  }
  const manifestById = new Map();
  for (const entry of manifest.operations) {
    manifestById.set(entry.operation_id, entry);
  }
  const operationManifestDigest = digest(
    manifest.manifest_digest,
    'manifest.manifest_digest'
  );

  const candidates = value.candidates;
  if (!Array.isArray(candidates)) {
    throw new ValidationError('candidates must be an array');
  }
  const candidateById = new Map();
  for (const [index, entry] of candidates.entries()) {
    const normalized = exact(
      entry,
      ['operation_id', 'eligible', 'eligibility_reason'],
      `candidates[${index}]`
    );
    const operationId = identifier(normalized.operation_id, `candidates[${index}].operation_id`);
    if (!manifestById.has(operationId)) {
      throw new ValidationError(`candidate ${operationId} is not present in the operation manifest`);
    }
    candidateById.set(operationId, {
      operation_id: operationId,
      eligible: boolean(normalized.eligible, `candidates[${index}].eligible`),
      eligibility_reason: identifier(
        normalized.eligibility_reason,
        `candidates[${index}].eligibility_reason`
      )
    });
  }
  const candidateSetDigest = computeCandidateSetDigest(candidates);
  const candidateMode = enumValue(value.candidate_mode, CANDIDATE_MODES, 'candidate_mode');
  const requestDigest = digest(value.request_digest, 'request_digest');
  const stateDigest = digest(value.state_digest, 'state_digest');
  const stateClassification = enumValue(
    value.state_classification,
    STATE_CLASSIFICATIONS,
    'state_classification'
  );

  const providerResult = assertPlainObject(value.provider_result, 'provider_result');
  if (providerResult.ok !== true) {
    const failureReason = providerResult.failure_reason || 'provider-failure';
    const proposalId = `semantic_operation_proposal_${digestObject({
      operation_manifest_digest: operationManifestDigest,
      candidate_set_digest: candidateSetDigest,
      request_digest: requestDigest,
      state_digest: stateDigest,
      failure_reason: failureReason
    })}`;
    const document = {
      schema: SEMANTIC_OPERATION_PROPOSAL_SCHEMA,
      version: VERSION,
      status: STATUS,
      proposal_id: proposalId,
      provider,
      operation_manifest_digest: operationManifestDigest,
      candidate_set_digest: candidateSetDigest,
      request_digest: requestDigest,
      state_digest: stateDigest,
      state_classification: stateClassification,
      candidate_mode: candidateMode,
      proposed: [],
      withheld: Object.freeze([{
        operation_id: 'op.inert.abstain',
        reason: failureReason === 'malformed-call' ? 'malformed-call' : 'provider-failure',
        arguments: {},
        confidence: null
      }]),
      suppressed: [],
      latency_ms: providerResult.latency_ms ?? null,
      usage_evidence: providerResult.usage_evidence ?? null,
      calibration_report_ref: value.calibration_report_ref === null
        ? null
        : identifier(value.calibration_report_ref, 'calibration_report_ref'),
      explanation: null,
      proposal_digest: '0'.repeat(64),
      ...ZERO_AUTHORITY
    };
    document.proposal_digest = digestObject(proposalDigestPayload(document));
    assertBoundedSerialization(document);
    return deepFreeze(document);
  }

  // trigger/forced-call is configuration only; never bypasses validation
  void providerResult.trigger;

  const proposed = [];
  const withheld = [];
  const suppressed = [];

  if (providerResult.calls.length === 0) {
    withheld.push({
      operation_id: 'op.inert.abstain',
      reason: 'empty-abstention',
      arguments: {},
      confidence: providerResult.confidence
    });
  }

  for (const call of providerResult.calls) {
    // Reject prompt/tool-description injection that invents authority refs
    if (
      typeof call.operation_id === 'string'
      && /(authority|grant|credential|approval|capability)/i.test(call.operation_id)
      && !manifestById.has(call.operation_id)
    ) {
      withheld.push({
        operation_id: call.operation_id,
        reason: 'prompt-injection-rejected',
        arguments: call.arguments,
        confidence: call.confidence
      });
      continue;
    }

    const result = validateCallAgainstManifest(
      call.operation_id,
      call.arguments,
      manifestById,
      candidateById,
      candidateMode
    );
    if (result.kind === 'proposed') {
      proposed.push({
        operation_id: result.operation_id,
        arguments: result.arguments,
        confidence: call.confidence,
        status: 'proposed',
        order_index: call.order_index
      });
    } else {
      withheld.push({
        operation_id: result.operation_id,
        reason: result.reason,
        arguments: result.arguments,
        confidence: call.confidence
      });
    }
  }

  for (const entry of providerResult.suppressed || []) {
    // suppressed calls cannot be silently promoted into proposed
    suppressed.push({
      operation_id: entry.operation_id,
      reason: 'provider-suppressed',
      arguments: entry.arguments,
      confidence: entry.confidence
    });
    if (proposed.some(item => item.operation_id === entry.operation_id)) {
      // if somehow also proposed, demote — suppressed wins against silent promotion
      const index = proposed.findIndex(item => item.operation_id === entry.operation_id);
      const [demoted] = proposed.splice(index, 1);
      withheld.push({
        operation_id: demoted.operation_id,
        reason: 'provider-suppressed',
        arguments: demoted.arguments,
        confidence: demoted.confidence
      });
    }
  }

  const proposalId = `semantic_operation_proposal_${digestObject({
    provider,
    operation_manifest_digest: operationManifestDigest,
    candidate_set_digest: candidateSetDigest,
    request_digest: requestDigest,
    state_digest: stateDigest,
    proposed,
    withheld,
    suppressed
  })}`;

  const document = {
    schema: SEMANTIC_OPERATION_PROPOSAL_SCHEMA,
    version: VERSION,
    status: STATUS,
    proposal_id: proposalId,
    provider,
    operation_manifest_digest: operationManifestDigest,
    candidate_set_digest: candidateSetDigest,
    request_digest: requestDigest,
    state_digest: stateDigest,
    state_classification: stateClassification,
    candidate_mode: candidateMode,
    proposed,
    withheld,
    suppressed,
    latency_ms: providerResult.latency_ms ?? null,
    usage_evidence: providerResult.usage_evidence ?? null,
    calibration_report_ref: value.calibration_report_ref === null
      ? null
      : identifier(value.calibration_report_ref, 'calibration_report_ref'),
    explanation: providerResult.explanation ?? null,
    proposal_digest: '0'.repeat(64),
    ...ZERO_AUTHORITY
  };
  document.proposal_digest = digestObject(proposalDigestPayload(document));
  assertBoundedSerialization(document);
  validateSemanticOperationProposalShape(document);
  return deepFreeze(document);
}

function assertBoundedSerialization(document) {
  const serialized = JSON.stringify(document);
  if (Buffer.byteLength(serialized, 'utf8') > MAX_SERIALIZED_BYTES) {
    throw new ValidationError('semantic operation proposal serialization exceeds bound');
  }
}

function validateProposedEntry(entry, index) {
  const value = exact(entry, PROPOSED_FIELDS, `proposed[${index}]`);
  return {
    operation_id: identifier(value.operation_id, `proposed[${index}].operation_id`),
    arguments: normalizeArgumentsObject(value.arguments, `proposed[${index}].arguments`),
    confidence: unitOrNull(value.confidence, `proposed[${index}].confidence`),
    status: enumValue(value.status, PROPOSAL_ITEM_STATUSES, `proposed[${index}].status`),
    order_index: integer(value.order_index, `proposed[${index}].order_index`, 0, MAX_PROPOSED)
  };
}

function validateWithheldEntry(entry, index) {
  const value = exact(entry, WITHHELD_FIELDS, `withheld[${index}]`);
  return {
    operation_id: identifier(value.operation_id, `withheld[${index}].operation_id`),
    reason: enumValue(value.reason, WITHHELD_REASONS, `withheld[${index}].reason`),
    arguments: normalizeArgumentsObject(value.arguments, `withheld[${index}].arguments`),
    confidence: unitOrNull(value.confidence, `withheld[${index}].confidence`)
  };
}

function validateSuppressedEntry(entry, index) {
  const value = exact(entry, SUPPRESSED_FIELDS, `suppressed[${index}]`);
  return {
    operation_id: identifier(value.operation_id, `suppressed[${index}].operation_id`),
    reason: enumValue(value.reason, WITHHELD_REASONS, `suppressed[${index}].reason`),
    arguments: normalizeArgumentsObject(value.arguments, `suppressed[${index}].arguments`),
    confidence: unitOrNull(value.confidence, `suppressed[${index}].confidence`)
  };
}

export function validateSemanticOperationProposalShape(document) {
  const value = exact(document, DOCUMENT_FIELDS, 'semantic operation proposal');
  if (value.schema !== SEMANTIC_OPERATION_PROPOSAL_SCHEMA) {
    throw new ValidationError('semantic operation proposal schema is invalid');
  }
  if (value.version !== VERSION) {
    throw new ValidationError('semantic operation proposal version is invalid');
  }
  if (value.status !== STATUS) {
    throw new ValidationError('semantic operation proposal status is invalid');
  }
  identifier(value.proposal_id, 'proposal_id');
  normalizeProviderIdentity(value.provider);
  digest(value.operation_manifest_digest, 'operation_manifest_digest');
  digest(value.candidate_set_digest, 'candidate_set_digest');
  digest(value.request_digest, 'request_digest');
  digest(value.state_digest, 'state_digest');
  enumValue(value.state_classification, STATE_CLASSIFICATIONS, 'state_classification');
  enumValue(value.candidate_mode, CANDIDATE_MODES, 'candidate_mode');

  if (!Array.isArray(value.proposed) || value.proposed.length > MAX_PROPOSED) {
    throw new ValidationError('proposed must be a bounded array');
  }
  if (!Array.isArray(value.withheld) || value.withheld.length > MAX_PROPOSED) {
    throw new ValidationError('withheld must be a bounded array');
  }
  if (!Array.isArray(value.suppressed) || value.suppressed.length > MAX_PROPOSED) {
    throw new ValidationError('suppressed must be a bounded array');
  }
  value.proposed.forEach(validateProposedEntry);
  value.withheld.forEach(validateWithheldEntry);
  value.suppressed.forEach(validateSuppressedEntry);

  if (value.latency_ms !== null) {
    integer(value.latency_ms, 'latency_ms', 0, 3_600_000);
  }
  normalizeUsageEvidence(value.usage_evidence);
  if (value.calibration_report_ref !== null) {
    identifier(value.calibration_report_ref, 'calibration_report_ref');
  }
  if (value.explanation !== null) {
    assertString(value.explanation, 'explanation', { min: 1, max: MAX_EXPLANATION });
  }
  digest(value.proposal_digest, 'proposal_digest');

  if (value.authority_effect !== 'none') {
    throw new ValidationError('authority_effect must be none');
  }
  if (value.assurance_effect !== 'none') {
    throw new ValidationError('assurance_effect must be none');
  }
  if (value.currentness_effect !== 'none') {
    throw new ValidationError('currentness_effect must be none');
  }
  if (value.execution_effect !== 'none') {
    throw new ValidationError('execution_effect must be none');
  }
  if (value.runtime_activation !== false) {
    throw new ValidationError('runtime_activation must be false');
  }
  if (value.network_effect !== 'none') {
    throw new ValidationError('network_effect must be none');
  }
  if (value.selection_effect !== 'proposal-only') {
    throw new ValidationError('selection_effect must be proposal-only');
  }

  const expectedDigest = digestObject(proposalDigestPayload(value));
  if (value.proposal_digest !== expectedDigest) {
    throw new ValidationError('semantic operation proposal digest is invalid');
  }
  assertBoundedSerialization(value);
  return value;
}

export function validateSemanticOperationProposal(document) {
  const validated = validateSemanticOperationProposalShape(document);
  return Object.freeze({
    valid: true,
    proposal_digest: validated.proposal_digest,
    authority_effect: 'none',
    assurance_effect: 'none',
    currentness_effect: 'none',
    execution_effect: 'none',
    runtime_activation: false
  });
}

/**
 * Downstream authority composition hook: proposals never satisfy authority
 * predicates regardless of confidence or provider identity.
 */
export function proposalSatisfiesAuthorityPredicates(_proposal, _predicates = {}) {
  return Object.freeze({
    authority: false,
    assurance: false,
    consent: false,
    approval: false,
    currentness: false,
    revocation: false
  });
}

export function composeProposalWithOfferDigest(proposal, offerDigest) {
  digest(offerDigest, 'offerDigest');
  const validated = validateSemanticOperationProposalShape(proposal);
  return Object.freeze({
    schema: 'axiom-semantic-operation-proposal-offer-binding.v0',
    proposal_digest: validated.proposal_digest,
    offer_digest: offerDigest,
    authority_effect: 'none',
    execution_effect: 'none',
    // composition by digest only — no spend/eligibility/ranking merge
    merged_spend: null,
    merged_eligibility: null,
    merged_ranking: null
  });
}

export function composeProposalWithSelectionDigest(proposal, selectionDigest) {
  digest(selectionDigest, 'selectionDigest');
  const validated = validateSemanticOperationProposalShape(proposal);
  return Object.freeze({
    schema: 'axiom-semantic-operation-proposal-selection-binding.v0',
    proposal_digest: validated.proposal_digest,
    selection_digest: selectionDigest,
    authority_effect: 'none',
    execution_effect: 'none',
    merged_spend: null,
    merged_eligibility: null,
    merged_ranking: null
  });
}

export function validateSemanticOperationProposalSchema(schema) {
  assertPlainObject(schema, 'Semantic operation proposal schema');
  if (
    schema.$schema !== 'https://json-schema.org/draft/2020-12/schema'
    || schema.$id !== SEMANTIC_OPERATION_PROPOSAL_SCHEMA_ID
  ) {
    throw new ValidationError('Semantic operation proposal schema identity is invalid');
  }
  if (schema.additionalProperties !== false) {
    throw new ValidationError('Semantic operation proposal schema must close additionalProperties');
  }
  if (!everyObjectAdditionalPropertiesFalse(schema)) {
    throw new ValidationError('Semantic operation proposal schema objects must set additionalProperties false');
  }
  if (schema.properties?.schema?.const !== SEMANTIC_OPERATION_PROPOSAL_SCHEMA) {
    throw new ValidationError('Semantic operation proposal schema const is invalid');
  }
  for (const field of [
    'authority_effect',
    'assurance_effect',
    'currentness_effect',
    'execution_effect'
  ]) {
    if (schema.properties?.[field]?.const !== 'none') {
      throw new ValidationError(`${field} must be const none`);
    }
  }
  if (schema.properties?.runtime_activation?.const !== false) {
    throw new ValidationError('runtime_activation must be const false');
  }
  return true;
}

export const SEMANTIC_OPERATION_PROPOSAL_BOUNDARIES = ZERO_AUTHORITY;
