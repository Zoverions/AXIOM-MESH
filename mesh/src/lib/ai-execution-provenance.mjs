import {
  ValidationError,
  assertPlainObject,
  assertString,
  digestObject
} from './canonical.mjs';
import {
  aiProviderInvokeDigest,
  buildAiProviderReceipt,
  validateAiProviderInvoke
} from './ai-provider-invoke.mjs';

export const AI_EXECUTION_PROVENANCE_SCHEMA = 'axiom-ai-execution-provenance.v0';

const STATUS = 'inert-evidence';
const VERSION = '0.1.0';
const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/;
const DIGEST = /^[a-f0-9]{64}$/;
const ISO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;
const STATE_MODES = new Set(['stateless', 'session', 'persistent', 'opaque-provider-state']);

const TOP_LEVEL_FIELDS = Object.freeze([
  'schema',
  'version',
  'status',
  'provenance_id',
  'provider_id',
  'model',
  'request_digest',
  'receipt_digest',
  'adapter',
  'orchestrator',
  'runtime',
  'context',
  'tools',
  'environment',
  'recorded_at',
  'contains_secret_material',
  'authority_effect',
  'network_effect',
  'runtime_activation'
]);

function assertExactFields(value, fields, name) {
  const allowed = new Set(fields);
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) throw new ValidationError(`${name} contains unknown field ${key}`);
  }
  for (const key of fields) {
    if (!Object.hasOwn(value, key)) throw new ValidationError(`${name}.${key} is required`);
  }
}

function identifier(value, name) {
  return assertString(value, name, { max: 160, pattern: IDENTIFIER });
}

function digest(value, name) {
  return assertString(value, name, { min: 64, max: 64, pattern: DIGEST });
}

function timestamp(value, name) {
  const normalized = assertString(value, name, { max: 32, pattern: ISO_TIMESTAMP });
  if (!Number.isFinite(Date.parse(normalized))) throw new ValidationError(`${name} is not a valid timestamp`);
  return normalized;
}

function validateAdapter(input) {
  const value = assertPlainObject(input, 'ai execution provenance.adapter');
  assertExactFields(value, ['adapter_id', 'adapter_version', 'implementation_digest'], 'ai execution provenance.adapter');
  return Object.freeze({
    adapter_id: identifier(value.adapter_id, 'ai execution provenance.adapter.adapter_id'),
    adapter_version: assertString(value.adapter_version, 'ai execution provenance.adapter.adapter_version', { max: 64 }),
    implementation_digest: digest(value.implementation_digest, 'ai execution provenance.adapter.implementation_digest')
  });
}

function validateOrchestrator(input) {
  const value = assertPlainObject(input, 'ai execution provenance.orchestrator');
  assertExactFields(value, ['orchestrator_id', 'orchestrator_version'], 'ai execution provenance.orchestrator');
  return Object.freeze({
    orchestrator_id: identifier(value.orchestrator_id, 'ai execution provenance.orchestrator.orchestrator_id'),
    orchestrator_version: assertString(value.orchestrator_version, 'ai execution provenance.orchestrator.orchestrator_version', { max: 64 })
  });
}

function validateRuntime(input) {
  const value = assertPlainObject(input, 'ai execution provenance.runtime');
  assertExactFields(value, ['runtime_id', 'runtime_version', 'runtime_descriptor_digest'], 'ai execution provenance.runtime');
  return Object.freeze({
    runtime_id: identifier(value.runtime_id, 'ai execution provenance.runtime.runtime_id'),
    runtime_version: assertString(value.runtime_version, 'ai execution provenance.runtime.runtime_version', { max: 64 }),
    runtime_descriptor_digest: digest(value.runtime_descriptor_digest, 'ai execution provenance.runtime.runtime_descriptor_digest')
  });
}

function validateContext(input) {
  const value = assertPlainObject(input, 'ai execution provenance.context');
  assertExactFields(value, ['state_mode', 'context_policy_digest', 'memory_projection_digest'], 'ai execution provenance.context');
  const stateMode = assertString(value.state_mode, 'ai execution provenance.context.state_mode', { max: 32 });
  if (!STATE_MODES.has(stateMode)) throw new ValidationError('ai execution provenance.context.state_mode is unsupported');
  const memoryProjectionDigest = value.memory_projection_digest === null
    ? null
    : digest(value.memory_projection_digest, 'ai execution provenance.context.memory_projection_digest');
  return Object.freeze({
    state_mode: stateMode,
    context_policy_digest: digest(value.context_policy_digest, 'ai execution provenance.context.context_policy_digest'),
    memory_projection_digest: memoryProjectionDigest
  });
}

function validateTools(input) {
  const value = assertPlainObject(input, 'ai execution provenance.tools');
  assertExactFields(value, ['tool_policy_digest', 'toolset_digest'], 'ai execution provenance.tools');
  return Object.freeze({
    tool_policy_digest: digest(value.tool_policy_digest, 'ai execution provenance.tools.tool_policy_digest'),
    toolset_digest: digest(value.toolset_digest, 'ai execution provenance.tools.toolset_digest')
  });
}

function validateEnvironment(input) {
  const value = assertPlainObject(input, 'ai execution provenance.environment');
  assertExactFields(value, ['environment_id', 'environment_version', 'environment_digest'], 'ai execution provenance.environment');
  return Object.freeze({
    environment_id: identifier(value.environment_id, 'ai execution provenance.environment.environment_id'),
    environment_version: assertString(value.environment_version, 'ai execution provenance.environment.environment_version', { max: 64 }),
    environment_digest: digest(value.environment_digest, 'ai execution provenance.environment.environment_digest')
  });
}

export function validateAiExecutionProvenance(input) {
  const value = assertPlainObject(input, 'ai execution provenance');
  assertExactFields(value, TOP_LEVEL_FIELDS, 'ai execution provenance');

  if (value.schema !== AI_EXECUTION_PROVENANCE_SCHEMA) throw new ValidationError('ai execution provenance.schema is unsupported');
  if (value.version !== VERSION) throw new ValidationError(`ai execution provenance.version must be ${VERSION}`);
  if (value.status !== STATUS) throw new ValidationError(`ai execution provenance.status must be ${STATUS}`);
  if (value.contains_secret_material !== false) throw new ValidationError('ai execution provenance.contains_secret_material must be false');
  if (value.authority_effect !== 'none') throw new ValidationError('ai execution provenance.authority_effect must be none');
  if (value.network_effect !== 'none') throw new ValidationError('ai execution provenance.network_effect must be none');
  if (value.runtime_activation !== false) throw new ValidationError('ai execution provenance.runtime_activation must be false');

  return Object.freeze({
    schema: AI_EXECUTION_PROVENANCE_SCHEMA,
    version: VERSION,
    status: STATUS,
    provenance_id: identifier(value.provenance_id, 'ai execution provenance.provenance_id'),
    provider_id: identifier(value.provider_id, 'ai execution provenance.provider_id'),
    model: assertString(value.model, 'ai execution provenance.model', { max: 160 }),
    request_digest: digest(value.request_digest, 'ai execution provenance.request_digest'),
    receipt_digest: digest(value.receipt_digest, 'ai execution provenance.receipt_digest'),
    adapter: validateAdapter(value.adapter),
    orchestrator: validateOrchestrator(value.orchestrator),
    runtime: validateRuntime(value.runtime),
    context: validateContext(value.context),
    tools: validateTools(value.tools),
    environment: validateEnvironment(value.environment),
    recorded_at: timestamp(value.recorded_at, 'ai execution provenance.recorded_at'),
    contains_secret_material: false,
    authority_effect: 'none',
    network_effect: 'none',
    runtime_activation: false
  });
}

export function aiExecutionProvenanceDigest(input) {
  return digestObject(validateAiExecutionProvenance(input));
}

export function bindAiExecutionProvenance({ request, receipt, provenance }) {
  const normalizedRequest = validateAiProviderInvoke(request);
  const normalizedProvenance = validateAiExecutionProvenance(provenance);
  const normalizedReceipt = assertPlainObject(receipt, 'ai provider receipt');

  const expectedRequestDigest = aiProviderInvokeDigest(normalizedRequest);
  if (normalizedProvenance.request_digest !== expectedRequestDigest) {
    throw new ValidationError('ai execution provenance.request_digest does not bind the exact provider request');
  }

  let canonicalReceipt;
  try {
    canonicalReceipt = buildAiProviderReceipt({
      invoke: normalizedRequest,
      suggestion: normalizedReceipt.suggestion,
      terminal_status: normalizedReceipt.terminal_status
    });
  } catch (error) {
    throw new ValidationError(`ai execution provenance receipt is not a valid canonical terminal receipt: ${error.message}`);
  }

  const providedReceiptDigest = digestObject(normalizedReceipt);
  const canonicalReceiptDigest = digestObject(canonicalReceipt);
  if (providedReceiptDigest !== canonicalReceiptDigest) {
    throw new ValidationError('ai execution provenance receipt does not match the canonical terminal receipt for the bound request');
  }
  if (normalizedProvenance.receipt_digest !== canonicalReceiptDigest) {
    throw new ValidationError('ai execution provenance.receipt_digest does not bind the exact canonical provider receipt');
  }

  if (normalizedProvenance.provider_id !== normalizedRequest.provider_id) {
    throw new ValidationError('ai execution provenance provider mismatch');
  }
  if (normalizedProvenance.model !== normalizedRequest.model) {
    throw new ValidationError('ai execution provenance model mismatch');
  }

  return Object.freeze({
    schema: 'axiom-ai-execution-provenance-binding.v0',
    provider_id: normalizedProvenance.provider_id,
    model: normalizedProvenance.model,
    request_digest: normalizedProvenance.request_digest,
    receipt_digest: normalizedProvenance.receipt_digest,
    provenance_digest: digestObject(normalizedProvenance),
    authority_effect: 'none',
    execution_authority: false
  });
}
