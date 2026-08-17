import {
  createPrivateKey,
  createPublicKey,
  sign,
  verify
} from 'node:crypto';

import {
  ValidationError,
  canonicalJson,
  digestObject,
  sha256
} from './canonical.mjs';
import {
  AGENT_EXECUTOR_DRY_RUN_COMPILER_ID,
  AGENT_EXECUTOR_DRY_RUN_COMPILER_VERSION,
  AGENT_EXECUTOR_DRY_RUN_POLICY_DIGEST,
  validateAgentExecutorDryRunPlan
} from './agent-executor-dry-run.mjs';
import {
  AgentTestSessionLifecycleLedger,
  verifyAgentTestSessionLifecycleReceipt,
  verifyAgentTestSessionLifecycleTranscript
} from './agent-test-session-lifecycle.mjs';

export const AGENT_EXECUTOR_CONFORMANCE_RECEIPT_SCHEMA = 'axiom-agent-executor-conformance-receipt.v1';
export const AGENT_EXECUTOR_CONFORMANCE_SANDBOX_ID = 'agent-commons.executor-conformance-virtual-sandbox';
export const AGENT_EXECUTOR_CONFORMANCE_SANDBOX_VERSION = 1;

const ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/;
const SHA256 = /^[a-f0-9]{64}$/;
const BASE64URL = /^[A-Za-z0-9_-]+$/;
const MAX_REQUESTS = 64;
const MAX_RECEIPT_BYTES = 512 * 1024;
const REQUEST_KEYS = new Set([
  'request_id', 'step_sequence', 'step_id', 'executable_id', 'arguments',
  'working_directory', 'environment_names', 'workspace_path', 'symlink_detected',
  'network', 'resource_usage', 'observed_at'
]);
const NETWORK_REQUEST_KEYS = new Set(['origin', 'method', 'resolved_addresses', 'redirect_target']);
const RESOURCE_USAGE_KEYS = new Set(['processes', 'runtime_seconds', 'output_bytes', 'memory_mib']);
const OBSERVATION_KEYS = new Set([
  'sequence', 'request_id', 'step_sequence', 'step_id', 'decision', 'reason_code',
  'virtual_effect_kind', 'network_origin', 'network_method', 'processes',
  'runtime_seconds', 'output_bytes', 'memory_mib', 'observed_at'
]);
const COUNTER_KEYS = new Set([
  'requests', 'admitted_steps', 'denied_requests', 'processes', 'runtime_seconds',
  'output_bytes', 'peak_memory_mib'
]);
const RECEIPT_KEYS = new Set([
  'schema', 'statement', 'statement_digest', 'executor_signature', 'receipt_digest'
]);
const RECEIPT_STATEMENT_KEYS = new Set([
  'executor_id', 'executor_key_id', 'sandbox_id', 'sandbox_version',
  'sandbox_policy_digest', 'compiler_id', 'compiler_version', 'compiler_policy_digest',
  'plan_digest', 'authorization_id', 'authorization_digest', 'lifecycle_ledger_id',
  'lifecycle_status', 'lifecycle_consumption_event_digest', 'lifecycle_head_event_digest',
  'lifecycle_receipt_digest', 'started_at', 'finished_at', 'status', 'observations',
  'counters', 'virtual_effects_only', 'global_currentness_claimed', 'task_success_claimed',
  'real_effect_observed', 'remote_execution', 'process_spawned', 'filesystem_mutated',
  'network_performed', 'credentials_retrieved', 'secrets_retrieved', 'service_controlled',
  'package_installed', 'production_enrollment', 'deployment_authority', 'capability_promoted'
]);
const RECEIPT_STATUS = new Set(['completed', 'interrupted', 'denied']);
const OBSERVATION_DECISIONS = new Set(['admitted', 'denied']);
const VIRTUAL_EFFECT_KINDS = new Set(['virtual-process', 'virtual-builtin']);
const NETWORK_METHODS = new Set(['GET', 'HEAD']);

export const AGENT_EXECUTOR_CONFORMANCE_POLICY = Object.freeze({
  schema: 'axiom-agent-executor-conformance-policy.v1',
  sandbox_id: AGENT_EXECUTOR_CONFORMANCE_SANDBOX_ID,
  sandbox_version: AGENT_EXECUTOR_CONFORMANCE_SANDBOX_VERSION,
  compiler_id: AGENT_EXECUTOR_DRY_RUN_COMPILER_ID,
  compiler_version: AGENT_EXECUTOR_DRY_RUN_COMPILER_VERSION,
  compiler_policy_digest: AGENT_EXECUTOR_DRY_RUN_POLICY_DIGEST,
  virtual_effects_only: true,
  lifecycle_consume_before_first_admitted_virtual_effect: true,
  exact_step_order_required: true,
  exact_argv_required: true,
  path_search_allowed: false,
  environment_executable_override_allowed: false,
  shell_interpretation_allowed: false,
  symlink_following_allowed: false,
  absolute_workspace_paths_allowed: false,
  network_resolution_source: 'supplied-synthetic-snapshot',
  network_redirects_allowed: false,
  dns_rebinding_allowed: false,
  max_requests: MAX_REQUESTS,
  host_process_spawn_available: false,
  host_filesystem_mutation_available: false,
  host_network_io_available: false,
  credential_lookup_available: false,
  service_control_available: false,
  remote_shell_available: false,
  production_authority: false
});

export const AGENT_EXECUTOR_CONFORMANCE_POLICY_DIGEST = digestObject(AGENT_EXECUTOR_CONFORMANCE_POLICY);

class SandboxPolicyError extends ValidationError {
  constructor(code) {
    super(`Agent executor conformance policy denied request: ${code}`);
    this.code = code;
  }
}

function exactKeys(value, keys, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new ValidationError(`${label} must be an object`);
  }
  for (const key of Object.keys(value)) {
    if (!keys.has(key)) throw new ValidationError(`${label} contains unsupported field: ${key}`);
  }
  for (const key of keys) {
    if (!Object.hasOwn(value, key)) throw new ValidationError(`${label} is missing required field: ${key}`);
  }
  return value;
}

function identifier(value, label) {
  if (typeof value !== 'string' || !ID.test(value)) throw new ValidationError(`${label} is invalid`);
  return value;
}

function digest(value, label) {
  if (typeof value !== 'string' || !SHA256.test(value)) throw new ValidationError(`${label} is invalid`);
  return value;
}

function canonicalTimestamp(value, label) {
  if (typeof value !== 'string') throw new ValidationError(`${label} is invalid`);
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString() !== value) {
    throw new ValidationError(`${label} must be a canonical UTC timestamp`);
  }
  return value;
}

function parsePrivateKey(value, label) {
  let key;
  try {
    key = value && typeof value === 'object' && value.type === 'private'
      ? value
      : createPrivateKey(value);
  } catch {
    throw new ValidationError(`${label} is invalid`);
  }
  if (key.asymmetricKeyType !== 'ed25519') throw new ValidationError(`${label} must be Ed25519`);
  return key;
}

function parsePublicKey(value, label) {
  let key;
  try {
    key = value && typeof value === 'object' && value.type === 'public'
      ? value
      : createPublicKey(value);
  } catch {
    throw new ValidationError(`${label} is invalid`);
  }
  if (key.asymmetricKeyType !== 'ed25519') throw new ValidationError(`${label} must be Ed25519`);
  return key;
}

function publicKeyId(publicKey) {
  return sha256(publicKey.export({ type: 'spki', format: 'der' }));
}

function signer(privateKeyValue) {
  const privateKey = parsePrivateKey(privateKeyValue, 'executor conformance private key');
  const publicKey = createPublicKey(privateKey);
  return Object.freeze({ privateKey, publicKey, keyId: publicKeyId(publicKey) });
}

function integer(value, label, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}) {
  if (!Number.isSafeInteger(value) || value < min || value > max) {
    throw new ValidationError(`${label} is invalid`);
  }
  return value;
}

function canonicalWorkspacePath(value) {
  if (typeof value !== 'string' || value.length < 1 || value.length > 512 || value.includes('\0')) {
    throw new SandboxPolicyError('workspace-path-invalid');
  }
  if (value.startsWith('/') || value.startsWith('\\') || /^[A-Za-z]:/.test(value) || value.includes('\\')) {
    throw new SandboxPolicyError('workspace-path-absolute-or-ambiguous');
  }
  if (value.includes('//')) throw new SandboxPolicyError('workspace-path-normalization-ambiguous');
  const segments = value.split('/');
  if (segments.some(segment => segment === '' || segment === '.' || segment === '..')) {
    throw new SandboxPolicyError('workspace-path-traversal');
  }
  if (segments[0] !== 'work' || segments[1] !== 'session') {
    throw new SandboxPolicyError('workspace-path-outside-disposable-root');
  }
  return value;
}

function ipv4Class(address) {
  const parts = address.split('.');
  if (parts.length !== 4 || parts.some(part => !/^\d{1,3}$/.test(part))) return null;
  const numbers = parts.map(Number);
  if (numbers.some(value => value > 255)) return null;
  const [a, b, c] = numbers;
  const local = a === 0
    || a === 10
    || a === 127
    || (a === 100 && b >= 64 && b <= 127)
    || (a === 169 && b === 254)
    || (a === 172 && b >= 16 && b <= 31)
    || (a === 192 && b === 168)
    || (a === 192 && b === 0 && c === 0)
    || a >= 224;
  return local ? 'local' : 'public';
}

function ipClass(address) {
  if (typeof address !== 'string' || address.length < 2 || address.length > 64) return 'invalid';
  const v4 = ipv4Class(address);
  if (v4) return v4;
  const normalized = address.toLowerCase();
  if (!normalized.includes(':') || !/^[0-9a-f:]+$/.test(normalized)) return 'invalid';
  if (
    normalized === '::'
    || normalized === '::1'
    || normalized.startsWith('fe8')
    || normalized.startsWith('fe9')
    || normalized.startsWith('fea')
    || normalized.startsWith('feb')
    || normalized.startsWith('fc')
    || normalized.startsWith('fd')
    || normalized.startsWith('ff')
  ) return 'local';
  return 'public';
}

function normalizeAddressList(raw, mode, label) {
  if (!Array.isArray(raw) || raw.length < 1 || raw.length > 8) {
    throw new ValidationError(`${label} must contain 1-8 synthetic addresses`);
  }
  const values = [...raw];
  if (new Set(values).size !== values.length) throw new ValidationError(`${label} must be unique`);
  values.sort();
  for (const address of values) {
    const classification = ipClass(address);
    if (classification === 'invalid') throw new ValidationError(`${label} contains invalid address`);
    if (mode === 'bounded-public-read' && classification !== 'public') {
      throw new ValidationError(`${label} contains local/private address for public-read mode`);
    }
    if (mode === 'owner-lan' && classification !== 'local') {
      throw new ValidationError(`${label} contains public address for owner-LAN mode`);
    }
  }
  return Object.freeze(values);
}

function normalizeResolutionSnapshot(raw, plan) {
  if (plan.network.mode === 'none') {
    if (raw && Object.keys(raw).length) throw new ValidationError('network-disabled plan cannot contain a resolution snapshot');
    return Object.freeze({});
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new ValidationError('executor conformance resolution snapshot must be an object');
  }
  const allowed = new Set(plan.network.allowed_origins);
  const keys = Object.keys(raw).sort();
  if (keys.length !== allowed.size || keys.some(key => !allowed.has(key))) {
    throw new ValidationError('executor conformance resolution snapshot must bind every exact allowed origin and no others');
  }
  const normalized = {};
  for (const origin of keys) {
    normalized[origin] = normalizeAddressList(raw[origin], plan.network.mode, `resolution snapshot ${origin}`);
  }
  return Object.freeze(normalized);
}

function arraysEqual(first, second) {
  return Array.isArray(first)
    && Array.isArray(second)
    && first.length === second.length
    && first.every((value, index) => value === second[index]);
}

function falseClaims(statement) {
  for (const key of [
    'global_currentness_claimed', 'task_success_claimed', 'real_effect_observed',
    'remote_execution', 'process_spawned', 'filesystem_mutated', 'network_performed',
    'credentials_retrieved', 'secrets_retrieved', 'service_controlled', 'package_installed',
    'production_enrollment', 'deployment_authority', 'capability_promoted'
  ]) {
    if (statement[key] !== false) throw new ValidationError(`executor conformance receipt attempts to elevate ${key}`);
  }
  if (statement.virtual_effects_only !== true) throw new ValidationError('executor conformance receipt must remain virtual-only');
}

function normalizeObservation(raw, expectedSequence) {
  exactKeys(raw, OBSERVATION_KEYS, `executor conformance observation ${expectedSequence}`);
  if (raw.sequence !== expectedSequence) throw new ValidationError('executor conformance observation sequence is invalid');
  identifier(raw.request_id, 'executor conformance observation request_id');
  integer(raw.step_sequence, 'executor conformance observation step_sequence', { min: 1, max: 32 });
  identifier(raw.step_id, 'executor conformance observation step_id');
  if (!OBSERVATION_DECISIONS.has(raw.decision)) throw new ValidationError('executor conformance observation decision is invalid');
  identifier(raw.reason_code, 'executor conformance observation reason_code');
  if (!VIRTUAL_EFFECT_KINDS.has(raw.virtual_effect_kind)) throw new ValidationError('executor conformance observation virtual_effect_kind is invalid');
  if (raw.network_origin !== null && typeof raw.network_origin !== 'string') throw new ValidationError('executor conformance observation network_origin is invalid');
  if (raw.network_method !== null && !NETWORK_METHODS.has(raw.network_method)) throw new ValidationError('executor conformance observation network_method is invalid');
  integer(raw.processes, 'executor conformance observation processes', { max: 8 });
  integer(raw.runtime_seconds, 'executor conformance observation runtime_seconds', { max: 3600 });
  integer(raw.output_bytes, 'executor conformance observation output_bytes', { max: 16 * 1024 * 1024 });
  integer(raw.memory_mib, 'executor conformance observation memory_mib', { max: 4096 });
  canonicalTimestamp(raw.observed_at, 'executor conformance observation observed_at');
  return Object.freeze({ ...raw });
}

function normalizeCounters(raw) {
  exactKeys(raw, COUNTER_KEYS, 'executor conformance receipt counters');
  return Object.freeze({
    requests: integer(raw.requests, 'executor conformance requests', { max: MAX_REQUESTS }),
    admitted_steps: integer(raw.admitted_steps, 'executor conformance admitted_steps', { max: 32 }),
    denied_requests: integer(raw.denied_requests, 'executor conformance denied_requests', { max: MAX_REQUESTS }),
    processes: integer(raw.processes, 'executor conformance processes', { max: 8 }),
    runtime_seconds: integer(raw.runtime_seconds, 'executor conformance runtime_seconds', { max: 3600 }),
    output_bytes: integer(raw.output_bytes, 'executor conformance output_bytes', { max: 16 * 1024 * 1024 }),
    peak_memory_mib: integer(raw.peak_memory_mib, 'executor conformance peak_memory_mib', { max: 4096 })
  });
}

function normalizeReceiptStatement(raw) {
  exactKeys(raw, RECEIPT_STATEMENT_KEYS, 'executor conformance receipt statement');
  identifier(raw.executor_id, 'executor conformance executor_id');
  digest(raw.executor_key_id, 'executor conformance executor_key_id');
  if (
    raw.sandbox_id !== AGENT_EXECUTOR_CONFORMANCE_SANDBOX_ID
    || raw.sandbox_version !== AGENT_EXECUTOR_CONFORMANCE_SANDBOX_VERSION
    || raw.sandbox_policy_digest !== AGENT_EXECUTOR_CONFORMANCE_POLICY_DIGEST
    || raw.compiler_id !== AGENT_EXECUTOR_DRY_RUN_COMPILER_ID
    || raw.compiler_version !== AGENT_EXECUTOR_DRY_RUN_COMPILER_VERSION
    || raw.compiler_policy_digest !== AGENT_EXECUTOR_DRY_RUN_POLICY_DIGEST
  ) throw new ValidationError('executor conformance receipt policy/compiler identity is invalid');
  digest(raw.plan_digest, 'executor conformance plan_digest');
  identifier(raw.authorization_id, 'executor conformance authorization_id');
  digest(raw.authorization_digest, 'executor conformance authorization_digest');
  identifier(raw.lifecycle_ledger_id, 'executor conformance lifecycle_ledger_id');
  if (!['issued', 'consumed', 'interrupted', 'completed'].includes(raw.lifecycle_status)) {
    throw new ValidationError('executor conformance lifecycle_status is invalid');
  }
  if (raw.lifecycle_consumption_event_digest !== null) digest(raw.lifecycle_consumption_event_digest, 'executor conformance lifecycle consumption digest');
  digest(raw.lifecycle_head_event_digest, 'executor conformance lifecycle head digest');
  digest(raw.lifecycle_receipt_digest, 'executor conformance lifecycle receipt digest');
  canonicalTimestamp(raw.started_at, 'executor conformance started_at');
  canonicalTimestamp(raw.finished_at, 'executor conformance finished_at');
  if (raw.finished_at < raw.started_at) throw new ValidationError('executor conformance receipt time moves backwards');
  if (!RECEIPT_STATUS.has(raw.status)) throw new ValidationError('executor conformance receipt status is invalid');
  if (!Array.isArray(raw.observations) || raw.observations.length > MAX_REQUESTS) {
    throw new ValidationError('executor conformance observations are invalid');
  }
  const observations = raw.observations.map((item, index) => normalizeObservation(item, index + 1));
  const counters = normalizeCounters(raw.counters);
  if (counters.requests !== observations.length) throw new ValidationError('executor conformance request counter is stale');
  if (counters.admitted_steps !== observations.filter(item => item.decision === 'admitted').length) {
    throw new ValidationError('executor conformance admitted counter is stale');
  }
  if (counters.denied_requests !== observations.filter(item => item.decision === 'denied').length) {
    throw new ValidationError('executor conformance denied counter is stale');
  }
  falseClaims(raw);
  return Object.freeze({
    ...raw,
    observations: Object.freeze(observations),
    counters
  });
}

function signReceipt(statement, executorSigner) {
  const normalized = normalizeReceiptStatement(statement);
  const statementDigest = digestObject(normalized);
  const signable = Object.freeze({
    schema: AGENT_EXECUTOR_CONFORMANCE_RECEIPT_SCHEMA,
    statement: normalized,
    statement_digest: statementDigest
  });
  const executorSignature = sign(
    null,
    Buffer.from(canonicalJson(signable)),
    executorSigner.privateKey
  ).toString('base64url');
  const signed = Object.freeze({ ...signable, executor_signature: executorSignature });
  return Object.freeze({ ...signed, receipt_digest: digestObject(signed) });
}

export function verifyAgentExecutorConformanceReceipt(raw, { trustedExecutorPublicKey, plan } = {}) {
  if (Buffer.byteLength(JSON.stringify(raw ?? null), 'utf8') > MAX_RECEIPT_BYTES) {
    throw new ValidationError('executor conformance receipt exceeds maximum size');
  }
  exactKeys(raw, RECEIPT_KEYS, 'executor conformance receipt');
  if (raw.schema !== AGENT_EXECUTOR_CONFORMANCE_RECEIPT_SCHEMA) throw new ValidationError('executor conformance receipt schema is invalid');
  const statement = normalizeReceiptStatement(raw.statement);
  const statementDigest = digest(raw.statement_digest, 'executor conformance statement_digest');
  if (statementDigest !== digestObject(statement)) throw new ValidationError('executor conformance statement digest is invalid');
  const publicKey = parsePublicKey(trustedExecutorPublicKey, 'trusted executor conformance public key');
  if (publicKeyId(publicKey) !== statement.executor_key_id) throw new ValidationError('executor conformance signer substitution detected');
  if (typeof raw.executor_signature !== 'string' || !BASE64URL.test(raw.executor_signature)) {
    throw new ValidationError('executor conformance signature encoding is invalid');
  }
  const signable = Object.freeze({ schema: raw.schema, statement, statement_digest: statementDigest });
  if (!verify(null, Buffer.from(canonicalJson(signable)), publicKey, Buffer.from(raw.executor_signature, 'base64url'))) {
    throw new ValidationError('executor conformance signature is invalid');
  }
  const signed = Object.freeze({ ...signable, executor_signature: raw.executor_signature });
  const receiptDigest = digest(raw.receipt_digest, 'executor conformance receipt_digest');
  if (receiptDigest !== digestObject(signed)) throw new ValidationError('executor conformance receipt digest is invalid');
  if (plan !== undefined) {
    validateAgentExecutorDryRunPlan(plan);
    if (
      statement.plan_digest !== plan.plan_digest
      || statement.authorization_id !== plan.bindings.authorization_id
      || statement.authorization_digest !== plan.bindings.authorization_digest
      || statement.lifecycle_ledger_id !== plan.bindings.lifecycle_ledger_id
    ) throw new ValidationError('executor conformance receipt does not bind the exact dry-run plan');
  }
  return Object.freeze({ ...signed, receipt_digest: receiptDigest, valid: true, signature_valid: true });
}

function validateRequestShape(raw) {
  exactKeys(raw, REQUEST_KEYS, 'executor conformance request');
  identifier(raw.request_id, 'executor conformance request_id');
  integer(raw.step_sequence, 'executor conformance step_sequence', { min: 1, max: 32 });
  identifier(raw.step_id, 'executor conformance step_id');
  if (raw.executable_id !== null) identifier(raw.executable_id, 'executor conformance executable_id');
  if (!Array.isArray(raw.arguments) || raw.arguments.length > 16 || raw.arguments.some(value => typeof value !== 'string' || value.length > 1024 || value.includes('\0'))) {
    throw new SandboxPolicyError('arguments-invalid');
  }
  if (typeof raw.working_directory !== 'string') throw new SandboxPolicyError('working-directory-invalid');
  if (!Array.isArray(raw.environment_names) || raw.environment_names.length > 16 || raw.environment_names.some(value => typeof value !== 'string')) {
    throw new SandboxPolicyError('environment-names-invalid');
  }
  if (raw.symlink_detected !== false) throw new SandboxPolicyError('symlink-escape');
  exactKeys(raw.resource_usage, RESOURCE_USAGE_KEYS, 'executor conformance resource_usage');
  canonicalTimestamp(raw.observed_at, 'executor conformance observed_at');
  return raw;
}

export class AgentExecutorConformanceSandbox {
  constructor({
    plan,
    lifecycleLedger,
    compiledLifecycleReceipt,
    trustedLifecycleLedgerPublicKey,
    executorId,
    executorPrivateKey,
    startedAt,
    resolutionSnapshot = {}
  } = {}) {
    validateAgentExecutorDryRunPlan(plan);
    if (!(lifecycleLedger instanceof AgentTestSessionLifecycleLedger)) {
      throw new ValidationError('executor conformance sandbox requires the in-memory lifecycle ledger laboratory controller');
    }
    this.plan = plan;
    this.lifecycleLedger = lifecycleLedger;
    this.trustedLifecycleLedgerPublicKey = trustedLifecycleLedgerPublicKey;
    this.executorId = identifier(executorId, 'executor conformance executorId');
    this.executorSigner = signer(executorPrivateKey);
    this.startedAt = canonicalTimestamp(startedAt, 'executor conformance startedAt');
    this.resolutionSnapshot = normalizeResolutionSnapshot(resolutionSnapshot, plan);
    this.observations = [];
    this.requestIds = new Set();
    this.nextStep = 1;
    this.status = 'open';
    this.lifecycleConsumptionEventDigest = null;
    this.latestLifecycleReceipt = null;
    this.counters = {
      requests: 0,
      admitted_steps: 0,
      denied_requests: 0,
      processes: 0,
      runtime_seconds: 0,
      output_bytes: 0,
      peak_memory_mib: 0
    };

    const transcript = lifecycleLedger.exportTranscript();
    const verifiedTranscript = verifyAgentTestSessionLifecycleTranscript(transcript, {
      trustedLedgerPublicKey: trustedLifecycleLedgerPublicKey
    });
    const verifiedReceipt = verifyAgentTestSessionLifecycleReceipt(compiledLifecycleReceipt, {
      trustedLedgerPublicKey: trustedLifecycleLedgerPublicKey,
      transcript
    });
    if (
      verifiedTranscript.status !== 'issued'
      || verifiedTranscript.event_count !== 1
      || verifiedTranscript.head_event_digest !== plan.bindings.lifecycle_head_event_digest
      || verifiedReceipt.receipt_digest !== plan.bindings.lifecycle_receipt_digest
      || verifiedTranscript.authorization_id !== plan.bindings.authorization_id
      || verifiedTranscript.authorization_digest !== plan.bindings.authorization_digest
      || verifiedTranscript.ledger_id !== plan.bindings.lifecycle_ledger_id
      || verifiedTranscript.ledger_key_id !== plan.bindings.lifecycle_key_id
    ) throw new ValidationError('executor conformance sandbox lifecycle state does not bind the exact issued dry-run plan');
    this.latestLifecycleReceipt = compiledLifecycleReceipt;
  }

  get executorPublicKey() {
    return this.executorSigner.publicKey.export({ type: 'spki', format: 'pem' }).toString();
  }

  _ensureOpen() {
    if (this.status !== 'open') throw new ValidationError(`executor conformance sandbox is terminal: ${this.status}`);
    if (this.observations.length >= MAX_REQUESTS) throw new ValidationError('executor conformance request capacity is exhausted');
  }

  _consumeLifecycle(observedAt) {
    if (this.lifecycleConsumptionEventDigest) return;
    const current = verifyAgentTestSessionLifecycleTranscript(this.lifecycleLedger.exportTranscript(), {
      trustedLedgerPublicKey: this.trustedLifecycleLedgerPublicKey
    });
    if (
      current.status !== 'issued'
      || current.event_count !== 1
      || current.head_event_digest !== this.plan.bindings.lifecycle_head_event_digest
    ) throw new SandboxPolicyError('lifecycle-not-current-issued-head');
    const consumed = this.lifecycleLedger.consume({
      eventId: `executor-consume:${this.plan.plan_digest.slice(0, 24)}`,
      occurredAt: observedAt,
      revocationState: 'active'
    });
    this.lifecycleConsumptionEventDigest = consumed.event.event_digest;
    this.latestLifecycleReceipt = this.lifecycleLedger.receipt({ generatedAt: observedAt });
  }

  _validateNetwork(request, step) {
    if (step.network_mode !== 'session-policy' || this.plan.network.mode === 'none') {
      if (request.network !== null) throw new SandboxPolicyError('network-not-authorized-for-step');
      return { origin: null, method: null };
    }
    exactKeys(request.network, NETWORK_REQUEST_KEYS, 'executor conformance network request');
    if (!this.plan.network.allowed_origins.includes(request.network.origin)) throw new SandboxPolicyError('network-origin-substitution');
    if (!this.plan.network.methods.includes(request.network.method)) throw new SandboxPolicyError('network-method-denied');
    if (request.network.redirect_target !== null) throw new SandboxPolicyError('network-redirect-denied');
    const pinned = this.resolutionSnapshot[request.network.origin];
    const observed = normalizeAddressList(
      request.network.resolved_addresses,
      this.plan.network.mode,
      'executor conformance effect-time resolution'
    );
    if (!arraysEqual(observed, pinned)) throw new SandboxPolicyError('dns-rebinding-detected');
    return { origin: request.network.origin, method: request.network.method };
  }

  _validateRequest(request) {
    validateRequestShape(request);
    if (this.requestIds.has(request.request_id)) throw new SandboxPolicyError('request-replay');
    if (request.step_sequence !== this.nextStep) throw new SandboxPolicyError('step-order-violation');
    const step = this.plan.steps[this.nextStep - 1];
    if (!step || request.step_id !== step.step_id) throw new SandboxPolicyError('step-substitution');
    if (request.executable_id !== step.executable_id) throw new SandboxPolicyError('executable-substitution');
    if (!arraysEqual(request.arguments, step.arguments)) throw new SandboxPolicyError('argv-substitution');
    if (request.working_directory !== step.working_directory) throw new SandboxPolicyError('working-directory-substitution');
    if (request.environment_names.some(name => !this.plan.environment.allowed_names.includes(name))) {
      throw new SandboxPolicyError('environment-or-path-poisoning');
    }
    canonicalWorkspacePath(request.workspace_path);
    if (!request.workspace_path.startsWith(`${this.plan.workspace.root}/`) && request.workspace_path !== this.plan.workspace.root) {
      throw new SandboxPolicyError('workspace-path-substitution');
    }

    const usage = {
      processes: integer(request.resource_usage.processes, 'executor conformance request processes', { max: 64 }),
      runtime_seconds: integer(request.resource_usage.runtime_seconds, 'executor conformance request runtime_seconds', { max: 86_400 }),
      output_bytes: integer(request.resource_usage.output_bytes, 'executor conformance request output_bytes', { max: 1_073_741_824 }),
      memory_mib: integer(request.resource_usage.memory_mib, 'executor conformance request memory_mib', { max: 1_048_576 })
    };
    const expectedProcesses = step.kind === 'process-template' ? 1 : 0;
    if (usage.processes !== expectedProcesses) throw new SandboxPolicyError('process-budget-shape-invalid');
    if (usage.runtime_seconds > this.plan.resources.max_process_runtime_seconds) throw new SandboxPolicyError('process-runtime-ceiling');
    if (this.counters.runtime_seconds + usage.runtime_seconds > this.plan.resources.max_total_runtime_seconds) throw new SandboxPolicyError('total-runtime-ceiling');
    if (this.counters.output_bytes + usage.output_bytes > this.plan.resources.max_output_bytes) throw new SandboxPolicyError('output-ceiling');
    if (usage.memory_mib > this.plan.resources.max_memory_mib) throw new SandboxPolicyError('memory-ceiling');
    if (this.counters.processes + usage.processes > this.plan.resources.max_processes) throw new SandboxPolicyError('process-ceiling');
    if (this.counters.admitted_steps + 1 > this.plan.resources.max_steps) throw new SandboxPolicyError('step-ceiling');

    const network = this._validateNetwork(request, step);
    return { step, usage, network };
  }

  _observation({ request, decision, reasonCode, step, usage, network }) {
    return Object.freeze({
      sequence: this.observations.length + 1,
      request_id: request.request_id,
      step_sequence: request.step_sequence,
      step_id: request.step_id,
      decision,
      reason_code: reasonCode,
      virtual_effect_kind: step?.kind === 'process-template' ? 'virtual-process' : 'virtual-builtin',
      network_origin: network?.origin ?? null,
      network_method: network?.method ?? null,
      processes: usage?.processes ?? 0,
      runtime_seconds: usage?.runtime_seconds ?? 0,
      output_bytes: usage?.output_bytes ?? 0,
      memory_mib: usage?.memory_mib ?? 0,
      observed_at: request.observed_at
    });
  }

  _deny(request, error) {
    const fallbackStep = this.plan.steps[Math.max(0, Math.min(request?.step_sequence ?? this.nextStep, this.plan.steps.length) - 1)] ?? this.plan.steps[0];
    const observation = this._observation({
      request: {
        request_id: typeof request?.request_id === 'string' && ID.test(request.request_id) ? request.request_id : `invalid-request:${this.observations.length + 1}`,
        step_sequence: Number.isSafeInteger(request?.step_sequence) ? Math.max(1, request.step_sequence) : this.nextStep,
        step_id: typeof request?.step_id === 'string' && ID.test(request.step_id) ? request.step_id : fallbackStep.step_id,
        observed_at: (() => {
          try { return canonicalTimestamp(request?.observed_at, 'executor conformance denied observed_at'); }
          catch { return this.startedAt; }
        })()
      },
      decision: 'denied',
      reasonCode: error instanceof SandboxPolicyError ? error.code : 'request-invalid',
      step: fallbackStep,
      usage: null,
      network: null
    });
    this.observations.push(observation);
    this.counters.requests += 1;
    this.counters.denied_requests += 1;
    if (this.lifecycleConsumptionEventDigest) {
      const interrupted = this.lifecycleLedger.interrupt({
        eventId: `executor-interrupt:${observation.sequence}`,
        occurredAt: observation.observed_at,
        reasonCode: 'executor-policy-denied'
      });
      this.latestLifecycleReceipt = this.lifecycleLedger.receipt({ generatedAt: observation.observed_at });
      this.status = 'interrupted';
      return Object.freeze({ decision: 'denied', lifecycle_status: interrupted.lifecycle_status, observation });
    }
    this.status = 'denied';
    return Object.freeze({ decision: 'denied', lifecycle_status: 'issued', observation });
  }

  admit(rawRequest) {
    this._ensureOpen();
    let checked;
    try {
      checked = this._validateRequest(rawRequest);
      this._consumeLifecycle(rawRequest.observed_at);
    } catch (error) {
      return this._deny(rawRequest, error);
    }
    this.requestIds.add(rawRequest.request_id);
    const observation = this._observation({
      request: rawRequest,
      decision: 'admitted',
      reasonCode: 'policy-admitted',
      ...checked
    });
    this.observations.push(observation);
    this.counters.requests += 1;
    this.counters.admitted_steps += 1;
    this.counters.processes += checked.usage.processes;
    this.counters.runtime_seconds += checked.usage.runtime_seconds;
    this.counters.output_bytes += checked.usage.output_bytes;
    this.counters.peak_memory_mib = Math.max(this.counters.peak_memory_mib, checked.usage.memory_mib);
    this.nextStep += 1;
    return Object.freeze({ decision: 'admitted', lifecycle_status: 'consumed', observation });
  }

  interrupt({ eventId, occurredAt, reasonCode = 'executor-conformance-interrupted' } = {}) {
    this._ensureOpen();
    if (!this.lifecycleConsumptionEventDigest) throw new ValidationError('executor conformance cannot interrupt before lifecycle consumption');
    const result = this.lifecycleLedger.interrupt({ eventId, occurredAt, reasonCode });
    this.latestLifecycleReceipt = this.lifecycleLedger.receipt({ generatedAt: occurredAt });
    this.status = 'interrupted';
    return result;
  }

  complete({ eventId, occurredAt } = {}) {
    this._ensureOpen();
    if (!this.lifecycleConsumptionEventDigest) throw new ValidationError('executor conformance cannot complete before lifecycle consumption');
    if (this.nextStep - 1 !== this.plan.steps.length) {
      throw new ValidationError('executor conformance cannot complete before every compiled step is admitted');
    }
    const result = this.lifecycleLedger.complete({ eventId, occurredAt });
    this.latestLifecycleReceipt = this.lifecycleLedger.receipt({ generatedAt: occurredAt });
    this.status = 'completed';
    return result;
  }

  receipt({ finishedAt } = {}) {
    if (!['completed', 'interrupted', 'denied'].includes(this.status)) {
      throw new ValidationError('executor conformance receipt requires a terminal sandbox state');
    }
    const finished = canonicalTimestamp(finishedAt, 'executor conformance finishedAt');
    const transcript = verifyAgentTestSessionLifecycleTranscript(this.lifecycleLedger.exportTranscript(), {
      trustedLedgerPublicKey: this.trustedLifecycleLedgerPublicKey
    });
    const lifecycleReceipt = verifyAgentTestSessionLifecycleReceipt(this.latestLifecycleReceipt, {
      trustedLedgerPublicKey: this.trustedLifecycleLedgerPublicKey,
      transcript: this.lifecycleLedger.exportTranscript()
    });
    const statement = {
      executor_id: this.executorId,
      executor_key_id: this.executorSigner.keyId,
      sandbox_id: AGENT_EXECUTOR_CONFORMANCE_SANDBOX_ID,
      sandbox_version: AGENT_EXECUTOR_CONFORMANCE_SANDBOX_VERSION,
      sandbox_policy_digest: AGENT_EXECUTOR_CONFORMANCE_POLICY_DIGEST,
      compiler_id: AGENT_EXECUTOR_DRY_RUN_COMPILER_ID,
      compiler_version: AGENT_EXECUTOR_DRY_RUN_COMPILER_VERSION,
      compiler_policy_digest: AGENT_EXECUTOR_DRY_RUN_POLICY_DIGEST,
      plan_digest: this.plan.plan_digest,
      authorization_id: this.plan.bindings.authorization_id,
      authorization_digest: this.plan.bindings.authorization_digest,
      lifecycle_ledger_id: transcript.ledger_id,
      lifecycle_status: transcript.status,
      lifecycle_consumption_event_digest: this.lifecycleConsumptionEventDigest,
      lifecycle_head_event_digest: transcript.head_event_digest,
      lifecycle_receipt_digest: lifecycleReceipt.receipt_digest,
      started_at: this.startedAt,
      finished_at: finished,
      status: this.status,
      observations: this.observations.map(item => ({ ...item })),
      counters: { ...this.counters },
      virtual_effects_only: true,
      global_currentness_claimed: false,
      task_success_claimed: false,
      real_effect_observed: false,
      remote_execution: false,
      process_spawned: false,
      filesystem_mutated: false,
      network_performed: false,
      credentials_retrieved: false,
      secrets_retrieved: false,
      service_controlled: false,
      package_installed: false,
      production_enrollment: false,
      deployment_authority: false,
      capability_promoted: false
    };
    return signReceipt(statement, this.executorSigner);
  }
}
