import { ValidationError, digestObject } from './canonical.mjs';
import { validateAgentTestSessionAuthorization } from './agent-device-attestation-session.mjs';
import {
  verifyAgentTestSessionLifecycleReceipt,
  verifyAgentTestSessionLifecycleTranscript
} from './agent-test-session-lifecycle.mjs';

export const AGENT_EXECUTOR_PLATFORM_PROFILE_SCHEMA = 'axiom-agent-executor-platform-profile.v1';
export const AGENT_EXECUTOR_DRY_RUN_PLAN_SCHEMA = 'axiom-agent-executor-dry-run-plan.v1';
export const AGENT_EXECUTOR_DRY_RUN_COMPILER_ID = 'agent-commons.pre-executor-dry-run';
export const AGENT_EXECUTOR_DRY_RUN_COMPILER_VERSION = 1;

const ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/;
const SHA256 = /^[a-f0-9]{64}$/;
const OPERATING_SYSTEMS = new Set(['linux', 'windows', 'macos']);
const ARCHITECTURES = new Set(['x64', 'arm64']);
const FACT_STATUS = new Set(['declared', 'measured', 'reproduced', 'externally-verified']);
const NETWORK_MODES = new Set(['none', 'bounded-public-read', 'owner-lan']);
const OPERATION_ORDER = Object.freeze([
  'read-system-facts',
  'create-disposable-workspace',
  'install-test-dependencies',
  'run-build',
  'run-tests',
  'collect-sanitized-logs',
  'collect-benchmark-metrics',
  'reset-disposable-workspace'
]);
const SUPPORTED_OPERATIONS = new Set(OPERATION_ORDER);
const UNSUPPORTED_OPERATIONS = new Set(['start-local-test-services']);
const ALLOWED_ENVIRONMENT_NAMES = Object.freeze(['CI', 'NO_COLOR']);
const MAX_PLAN_BYTES = 262_144;
const MAX_OUTPUT_BYTES = 16 * 1024 * 1024;
const MAX_MEMORY_MIB = 4096;
const MAX_PROCESSES = 8;
const MAX_STEPS = 32;
const MAX_PROCESS_RUNTIME_SECONDS = 300;

export const AGENT_EXECUTOR_DRY_RUN_POLICY = Object.freeze({
  schema: 'axiom-agent-executor-dry-run-policy.v1',
  compiler_id: AGENT_EXECUTOR_DRY_RUN_COMPILER_ID,
  compiler_version: AGENT_EXECUTOR_DRY_RUN_COMPILER_VERSION,
  supported_operating_systems: Object.freeze(['linux', 'windows', 'macos']),
  supported_architectures: Object.freeze(['x64', 'arm64']),
  supported_operations: OPERATION_ORDER,
  unsupported_operations: Object.freeze(['start-local-test-services']),
  executable_ids: Object.freeze(['node-current-pinned', 'npm-current-pinned']),
  allowed_environment_names: ALLOWED_ENVIRONMENT_NAMES,
  max_steps: MAX_STEPS,
  max_processes: MAX_PROCESSES,
  max_process_runtime_seconds: MAX_PROCESS_RUNTIME_SECONDS,
  max_output_bytes: MAX_OUTPUT_BYTES,
  max_memory_mib: MAX_MEMORY_MIB,
  direct_shell_allowed: false,
  path_search_allowed: false,
  package_lifecycle_scripts_allowed: false,
  elevated_privileges_allowed: false,
  persistent_processes_allowed: false,
  network_redirects_allowed: false,
  network_credentials_allowed: false,
  dynamic_origin_discovery_allowed: false,
  effect_reachable: false
});

export const AGENT_EXECUTOR_DRY_RUN_POLICY_DIGEST = digestObject(AGENT_EXECUTOR_DRY_RUN_POLICY);

const PROFILE_KEYS = new Set([
  'schema', 'profile_id', 'operating_system', 'architecture', 'fact_status', 'source_ref', 'claims'
]);
const PROFILE_CLAIM_KEYS = new Set([
  'platform_trust_inferred', 'secure_boot_verified', 'platform_backed_key_verified',
  'privileged_executor_available', 'remote_administration_enabled', 'authority_granted'
]);
const PLAN_KEYS = new Set([
  'schema', 'compiler', 'bindings', 'platform', 'workspace', 'network', 'environment',
  'resources', 'steps', 'lifecycle', 'evidence', 'cleanup', 'effects', 'plan_digest'
]);
const COMPILER_KEYS = new Set([
  'id', 'version', 'policy_digest', 'process_spawn_available', 'filesystem_mutation_available',
  'network_io_available', 'secret_lookup_available'
]);
const BINDING_KEYS = new Set([
  'authorization_id', 'authorization_digest', 'sponsor_id', 'subject_id', 'challenge_id',
  'offer_id', 'node_profile_sha256', 'attestation_id', 'key_fingerprint_sha256',
  'lifecycle_ledger_id', 'lifecycle_key_id', 'lifecycle_head_event_digest',
  'lifecycle_receipt_digest', 'platform_profile_digest'
]);
const PLATFORM_KEYS = new Set([
  'profile_id', 'operating_system', 'architecture', 'fact_status', 'platform_trust_inferred'
]);
const WORKSPACE_KEYS = new Set([
  'root', 'relative_only', 'traversal_allowed', 'symlink_following_allowed',
  'host_root_access_allowed', 'disposable_required'
]);
const NETWORK_KEYS = new Set([
  'mode', 'allowed_origins', 'methods', 'redirects_allowed', 'credentials_allowed',
  'dynamic_origin_discovery_allowed', 'dns_rebinding_protection_required', 'resolution_policy'
]);
const ENVIRONMENT_KEYS = new Set([
  'allowed_names', 'values_embedded', 'path_override_allowed', 'secret_values_allowed'
]);
const RESOURCE_KEYS = new Set([
  'max_steps', 'max_processes', 'max_process_runtime_seconds', 'max_total_runtime_seconds',
  'max_output_bytes', 'max_memory_mib'
]);
const STEP_KEYS = new Set([
  'sequence', 'step_id', 'operation_id', 'kind', 'executable_id', 'arguments',
  'working_directory', 'repository_code_execution', 'tool_may_invoke_repository_shell',
  'package_lifecycle_scripts_allowed', 'direct_shell_requested', 'elevated_privileges_requested',
  'persistent_process_requested', 'absolute_executable_resolution_required', 'network_mode'
]);
const LIFECYCLE_KEYS = new Set([
  'known_head_only', 'global_currentness_claimed', 'status_required',
  'consume_before_first_effect', 'completion_requires_executor_receipt', 'terminal_on_uncertainty'
]);
const EVIDENCE_KEYS = new Set([
  'sanitized_logs_required', 'raw_secret_capture_allowed', 'stdout_stderr_max_bytes', 'task_success_claimed'
]);
const CLEANUP_KEYS = new Set([
  'workspace_disposal_required', 'on_success', 'on_failure', 'on_interrupt', 'persistent_artifacts_allowed'
]);
const EFFECT_KEYS = new Set([
  'effect_reachable', 'remote_execution', 'process_spawned', 'filesystem_mutated',
  'network_performed', 'credentials_retrieved', 'secrets_retrieved', 'service_controlled',
  'package_installed', 'production_enrollment', 'firmware_changed', 'boot_chain_changed',
  'purchase_performed', 'destructive_action_performed', 'deployment_authority', 'capability_promoted'
]);

const TEMPLATE_CATALOG = Object.freeze({
  'read-system-facts:node-version': Object.freeze({
    operation_id: 'read-system-facts',
    kind: 'process-template',
    executable_id: 'node-current-pinned',
    arguments: Object.freeze(['--version']),
    repository_code_execution: false,
    tool_may_invoke_repository_shell: false,
    network_mode: 'none'
  }),
  'read-system-facts:platform-arch': Object.freeze({
    operation_id: 'read-system-facts',
    kind: 'process-template',
    executable_id: 'node-current-pinned',
    arguments: Object.freeze(['-p', 'JSON.stringify({platform:process.platform,arch:process.arch})']),
    repository_code_execution: false,
    tool_may_invoke_repository_shell: false,
    network_mode: 'none'
  }),
  'create-disposable-workspace:builtin': Object.freeze({
    operation_id: 'create-disposable-workspace',
    kind: 'builtin',
    executable_id: null,
    arguments: Object.freeze([]),
    repository_code_execution: false,
    tool_may_invoke_repository_shell: false,
    network_mode: 'none'
  }),
  'install-test-dependencies:npm-ci': Object.freeze({
    operation_id: 'install-test-dependencies',
    kind: 'process-template',
    executable_id: 'npm-current-pinned',
    arguments: Object.freeze(['ci', '--ignore-scripts', '--no-audit', '--no-fund']),
    repository_code_execution: false,
    tool_may_invoke_repository_shell: false,
    network_mode: 'session-policy'
  }),
  'run-build:npm-script': Object.freeze({
    operation_id: 'run-build',
    kind: 'process-template',
    executable_id: 'npm-current-pinned',
    arguments: Object.freeze(['run', 'build', '--if-present']),
    repository_code_execution: true,
    tool_may_invoke_repository_shell: true,
    network_mode: 'none'
  }),
  'run-tests:npm-script': Object.freeze({
    operation_id: 'run-tests',
    kind: 'process-template',
    executable_id: 'npm-current-pinned',
    arguments: Object.freeze(['test']),
    repository_code_execution: true,
    tool_may_invoke_repository_shell: true,
    network_mode: 'none'
  }),
  'collect-sanitized-logs:builtin': Object.freeze({
    operation_id: 'collect-sanitized-logs',
    kind: 'builtin',
    executable_id: null,
    arguments: Object.freeze([]),
    repository_code_execution: false,
    tool_may_invoke_repository_shell: false,
    network_mode: 'none'
  }),
  'collect-benchmark-metrics:builtin': Object.freeze({
    operation_id: 'collect-benchmark-metrics',
    kind: 'builtin',
    executable_id: null,
    arguments: Object.freeze([]),
    repository_code_execution: false,
    tool_may_invoke_repository_shell: false,
    network_mode: 'none'
  }),
  'reset-disposable-workspace:builtin': Object.freeze({
    operation_id: 'reset-disposable-workspace',
    kind: 'builtin',
    executable_id: null,
    arguments: Object.freeze([]),
    repository_code_execution: false,
    tool_may_invoke_repository_shell: false,
    network_mode: 'none'
  })
});

const OPERATION_TEMPLATES = Object.freeze({
  'read-system-facts': Object.freeze(['read-system-facts:node-version', 'read-system-facts:platform-arch']),
  'create-disposable-workspace': Object.freeze(['create-disposable-workspace:builtin']),
  'install-test-dependencies': Object.freeze(['install-test-dependencies:npm-ci']),
  'run-build': Object.freeze(['run-build:npm-script']),
  'run-tests': Object.freeze(['run-tests:npm-script']),
  'collect-sanitized-logs': Object.freeze(['collect-sanitized-logs:builtin']),
  'collect-benchmark-metrics': Object.freeze(['collect-benchmark-metrics:builtin']),
  'reset-disposable-workspace': Object.freeze(['reset-disposable-workspace:builtin'])
});

function boundedDocument(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new ValidationError(`${label} must be an object`);
  }
  if (Buffer.byteLength(JSON.stringify(value), 'utf8') > MAX_PLAN_BYTES) {
    throw new ValidationError(`${label} exceeds the maximum encoded size`);
  }
}

function exactKeys(value, keys, label) {
  boundedDocument(value, label);
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

function boundedString(value, label, max = 1024) {
  if (typeof value !== 'string' || value.length < 1 || value.length > max || value.includes('\0')) {
    throw new ValidationError(`${label} is invalid`);
  }
  return value;
}

function falseBoundary(value, keys, label) {
  exactKeys(value, keys, label);
  for (const key of keys) {
    if (value[key] !== false) throw new ValidationError(`${label} attempts to elevate ${key}`);
  }
}

export function validateAgentExecutorPlatformProfile(raw) {
  boundedDocument(raw, 'Agent executor platform profile');
  exactKeys(raw, PROFILE_KEYS, 'Agent executor platform profile');
  if (raw.schema !== AGENT_EXECUTOR_PLATFORM_PROFILE_SCHEMA) {
    throw new ValidationError('Agent executor platform profile schema is invalid');
  }
  if (!OPERATING_SYSTEMS.has(raw.operating_system)) {
    throw new ValidationError('Agent executor platform operating_system is unsupported');
  }
  if (!ARCHITECTURES.has(raw.architecture)) {
    throw new ValidationError('Agent executor platform architecture is unsupported');
  }
  if (!FACT_STATUS.has(raw.fact_status)) {
    throw new ValidationError('Agent executor platform fact_status is invalid');
  }
  falseBoundary(raw.claims, PROFILE_CLAIM_KEYS, 'Agent executor platform claims');
  return Object.freeze({
    schema: AGENT_EXECUTOR_PLATFORM_PROFILE_SCHEMA,
    profile_id: identifier(raw.profile_id, 'Agent executor platform profile_id'),
    operating_system: raw.operating_system,
    architecture: raw.architecture,
    fact_status: raw.fact_status,
    source_ref: boundedString(raw.source_ref, 'Agent executor platform source_ref'),
    claims: Object.freeze({
      platform_trust_inferred: false,
      secure_boot_verified: false,
      platform_backed_key_verified: false,
      privileged_executor_available: false,
      remote_administration_enabled: false,
      authority_granted: false
    })
  });
}

function privateIpv4(hostname) {
  const parts = hostname.split('.');
  if (parts.length !== 4 || parts.some(part => !/^\d{1,3}$/.test(part))) return false;
  const numbers = parts.map(Number);
  if (numbers.some(value => value < 0 || value > 255)) return false;
  const [a, b] = numbers;
  return a === 0
    || a === 10
    || a === 127
    || (a === 100 && b >= 64 && b <= 127)
    || (a === 169 && b === 254)
    || (a === 172 && b >= 16 && b <= 31)
    || (a === 192 && b === 168);
}

function normalizeOrigin(origin, mode) {
  boundedString(origin, 'Agent executor network origin', 512);
  let url;
  try {
    url = new URL(origin);
  } catch {
    throw new ValidationError('Agent executor network origin must be an absolute URL origin');
  }
  if (url.username || url.password) throw new ValidationError('Agent executor network origin cannot contain credentials');
  if (url.pathname !== '/' || url.search || url.hash || origin !== url.origin) {
    throw new ValidationError('Agent executor network origin must be a canonical origin without path, query, fragment, or normalization ambiguity');
  }
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new ValidationError('Agent executor network origin protocol is unsupported');
  }
  const host = url.hostname.toLowerCase();
  if (mode === 'bounded-public-read') {
    if (url.protocol !== 'https:') throw new ValidationError('Agent executor bounded-public-read origin must use HTTPS');
    if (
      host === 'localhost'
      || host.endsWith('.localhost')
      || host.endsWith('.local')
      || privateIpv4(host)
      || host.includes(':')
    ) throw new ValidationError('Agent executor bounded-public-read origin cannot target local/private address space');
  }
  return url.origin;
}

function normalizeNetwork(scopeNetwork) {
  exactKeys(scopeNetwork, new Set(['mode', 'allowed_origins']), 'Agent executor source network scope');
  if (!NETWORK_MODES.has(scopeNetwork.mode)) throw new ValidationError('Agent executor network mode is unsupported');
  if (!Array.isArray(scopeNetwork.allowed_origins) || scopeNetwork.allowed_origins.length > 32) {
    throw new ValidationError('Agent executor network origins are invalid');
  }
  const origins = scopeNetwork.allowed_origins.map(origin => normalizeOrigin(origin, scopeNetwork.mode));
  if (new Set(origins).size !== origins.length) throw new ValidationError('Agent executor network origins must be unique');
  origins.sort();
  if (scopeNetwork.mode === 'none' && origins.length !== 0) {
    throw new ValidationError('Agent executor none network mode cannot contain origins');
  }
  return Object.freeze({
    mode: scopeNetwork.mode,
    allowed_origins: Object.freeze(origins),
    methods: Object.freeze(scopeNetwork.mode === 'none' ? [] : ['GET', 'HEAD']),
    redirects_allowed: false,
    credentials_allowed: false,
    dynamic_origin_discovery_allowed: false,
    dns_rebinding_protection_required: scopeNetwork.mode !== 'none',
    resolution_policy: scopeNetwork.mode === 'none'
      ? 'none'
      : scopeNetwork.mode === 'bounded-public-read'
        ? 'resolve-and-pin-public'
        : 'resolve-and-pin-owner-lan'
  });
}

function instantiateTemplate(stepId, sequence) {
  const template = TEMPLATE_CATALOG[stepId];
  if (!template) throw new ValidationError(`Agent executor template is unsupported: ${stepId}`);
  return Object.freeze({
    sequence,
    step_id: stepId,
    operation_id: template.operation_id,
    kind: template.kind,
    executable_id: template.executable_id,
    arguments: Object.freeze([...template.arguments]),
    working_directory: 'work/session',
    repository_code_execution: template.repository_code_execution,
    tool_may_invoke_repository_shell: template.tool_may_invoke_repository_shell,
    package_lifecycle_scripts_allowed: false,
    direct_shell_requested: false,
    elevated_privileges_requested: false,
    persistent_process_requested: false,
    absolute_executable_resolution_required: true,
    network_mode: template.network_mode
  });
}

function compileSteps(operations) {
  if (!Array.isArray(operations) || operations.length < 1 || new Set(operations).size !== operations.length) {
    throw new ValidationError('Agent executor allowed operations are invalid');
  }
  for (const operation of operations) {
    if (UNSUPPORTED_OPERATIONS.has(operation)) {
      throw new ValidationError(`Agent executor dry-run compiler v1 rejects ${operation}: long-lived service execution requires a separate sandbox/service profile`);
    }
    if (!SUPPORTED_OPERATIONS.has(operation)) {
      throw new ValidationError(`Agent executor dry-run compiler does not support operation: ${operation}`);
    }
  }
  const selected = [...operations].sort((a, b) => OPERATION_ORDER.indexOf(a) - OPERATION_ORDER.indexOf(b));
  const steps = [];
  for (const operation of selected) {
    for (const stepId of OPERATION_TEMPLATES[operation]) {
      steps.push(instantiateTemplate(stepId, steps.length + 1));
    }
  }
  if (steps.length > MAX_STEPS) throw new ValidationError('Agent executor dry-run plan exceeds the step ceiling');
  return Object.freeze(steps);
}

function requireLifecycleBinding({ authorization, authorizationDigest, transcript, receipt, trustedLedgerPublicKey }) {
  const checkedTranscript = verifyAgentTestSessionLifecycleTranscript(transcript, { trustedLedgerPublicKey });
  const checkedReceipt = verifyAgentTestSessionLifecycleReceipt(receipt, {
    trustedLedgerPublicKey,
    transcript
  });
  if (checkedTranscript.status !== 'issued' || checkedTranscript.terminal || checkedTranscript.event_count !== 1) {
    throw new ValidationError('Agent executor compilation requires an unconsumed issued lifecycle head');
  }
  if (checkedReceipt.statement.status !== 'issued' || checkedReceipt.statement.event_count !== 1) {
    throw new ValidationError('Agent executor lifecycle receipt must bind the issued head');
  }
  if (
    checkedTranscript.authorization_id !== authorization.authorization_id
    || checkedTranscript.authorization_digest !== authorizationDigest
    || checkedReceipt.statement.authorization_id !== authorization.authorization_id
    || checkedReceipt.statement.authorization_digest !== authorizationDigest
    || checkedReceipt.statement.sponsor_id !== authorization.sponsor.id
    || checkedReceipt.statement.subject_id !== authorization.subject.id
    || checkedReceipt.statement.challenge_id !== authorization.challenge.challenge_id
    || checkedReceipt.statement.offer_id !== authorization.challenge.offer_id
    || checkedReceipt.statement.node_profile_sha256 !== authorization.challenge.node_profile_sha256
    || checkedReceipt.statement.attestation_id !== authorization.attestation.attestation_id
    || checkedReceipt.statement.key_fingerprint_sha256 !== authorization.attestation.key_fingerprint_sha256
  ) throw new ValidationError('Agent executor lifecycle evidence does not bind the exact authorization');
  return Object.freeze({ transcript: checkedTranscript, receipt: checkedReceipt });
}

function buildPlanBody({ authorization, authorizationDigest, lifecycle, platform, network, steps }) {
  const profileDigest = digestObject(platform);
  const maxTotalRuntime = authorization.timing.maximum_duration_seconds;
  return Object.freeze({
    schema: AGENT_EXECUTOR_DRY_RUN_PLAN_SCHEMA,
    compiler: Object.freeze({
      id: AGENT_EXECUTOR_DRY_RUN_COMPILER_ID,
      version: AGENT_EXECUTOR_DRY_RUN_COMPILER_VERSION,
      policy_digest: AGENT_EXECUTOR_DRY_RUN_POLICY_DIGEST,
      process_spawn_available: false,
      filesystem_mutation_available: false,
      network_io_available: false,
      secret_lookup_available: false
    }),
    bindings: Object.freeze({
      authorization_id: authorization.authorization_id,
      authorization_digest: authorizationDigest,
      sponsor_id: authorization.sponsor.id,
      subject_id: authorization.subject.id,
      challenge_id: authorization.challenge.challenge_id,
      offer_id: authorization.challenge.offer_id,
      node_profile_sha256: authorization.challenge.node_profile_sha256,
      attestation_id: authorization.attestation.attestation_id,
      key_fingerprint_sha256: authorization.attestation.key_fingerprint_sha256,
      lifecycle_ledger_id: lifecycle.transcript.ledger_id,
      lifecycle_key_id: lifecycle.transcript.ledger_key_id,
      lifecycle_head_event_digest: lifecycle.transcript.head_event_digest,
      lifecycle_receipt_digest: lifecycle.receipt.receipt_digest,
      platform_profile_digest: profileDigest
    }),
    platform: Object.freeze({
      profile_id: platform.profile_id,
      operating_system: platform.operating_system,
      architecture: platform.architecture,
      fact_status: platform.fact_status,
      platform_trust_inferred: false
    }),
    workspace: Object.freeze({
      root: 'work/session',
      relative_only: true,
      traversal_allowed: false,
      symlink_following_allowed: false,
      host_root_access_allowed: false,
      disposable_required: true
    }),
    network,
    environment: Object.freeze({
      allowed_names: ALLOWED_ENVIRONMENT_NAMES,
      values_embedded: false,
      path_override_allowed: false,
      secret_values_allowed: false
    }),
    resources: Object.freeze({
      max_steps: MAX_STEPS,
      max_processes: MAX_PROCESSES,
      max_process_runtime_seconds: Math.min(MAX_PROCESS_RUNTIME_SECONDS, maxTotalRuntime),
      max_total_runtime_seconds: maxTotalRuntime,
      max_output_bytes: MAX_OUTPUT_BYTES,
      max_memory_mib: MAX_MEMORY_MIB
    }),
    steps,
    lifecycle: Object.freeze({
      known_head_only: true,
      global_currentness_claimed: false,
      status_required: 'issued',
      consume_before_first_effect: true,
      completion_requires_executor_receipt: true,
      terminal_on_uncertainty: 'interrupted'
    }),
    evidence: Object.freeze({
      sanitized_logs_required: true,
      raw_secret_capture_allowed: false,
      stdout_stderr_max_bytes: MAX_OUTPUT_BYTES,
      task_success_claimed: false
    }),
    cleanup: Object.freeze({
      workspace_disposal_required: true,
      on_success: true,
      on_failure: true,
      on_interrupt: true,
      persistent_artifacts_allowed: false
    }),
    effects: Object.freeze({
      effect_reachable: false,
      remote_execution: false,
      process_spawned: false,
      filesystem_mutated: false,
      network_performed: false,
      credentials_retrieved: false,
      secrets_retrieved: false,
      service_controlled: false,
      package_installed: false,
      production_enrollment: false,
      firmware_changed: false,
      boot_chain_changed: false,
      purchase_performed: false,
      destructive_action_performed: false,
      deployment_authority: false,
      capability_promoted: false
    })
  });
}

export function compileAgentExecutorDryRunPlan({
  authorization,
  challenge,
  offer,
  attestation,
  expectedNonce,
  now,
  lifecycleTranscript,
  lifecycleReceipt,
  trustedLifecycleLedgerPublicKey,
  platformProfile
} = {}) {
  boundedDocument(authorization, 'Agent executor authorization input');
  validateAgentTestSessionAuthorization(authorization, {
    challenge,
    offer,
    attestation,
    expectedNonce,
    now
  });
  const authorizationDigest = digestObject(authorization);
  const lifecycle = requireLifecycleBinding({
    authorization,
    authorizationDigest,
    transcript: lifecycleTranscript,
    receipt: lifecycleReceipt,
    trustedLedgerPublicKey: trustedLifecycleLedgerPublicKey
  });
  const platform = validateAgentExecutorPlatformProfile(platformProfile);
  const network = normalizeNetwork(authorization.scope.network);
  const steps = compileSteps(authorization.scope.allowed_operations);
  const body = buildPlanBody({ authorization, authorizationDigest, lifecycle, platform, network, steps });
  const plan = Object.freeze({ ...body, plan_digest: digestObject(body) });
  validateAgentExecutorDryRunPlan(plan);
  return plan;
}

function assertStaticFalseObject(value, keys, label) {
  falseBoundary(value, keys, label);
}

function assertArrayExact(actual, expected, label) {
  if (!Array.isArray(actual) || actual.length !== expected.length) {
    throw new ValidationError(`${label} is invalid`);
  }
  for (let index = 0; index < expected.length; index += 1) {
    if (actual[index] !== expected[index]) throw new ValidationError(`${label} is invalid`);
  }
}

function validateStep(raw, expectedSequence) {
  exactKeys(raw, STEP_KEYS, `Agent executor dry-run step ${expectedSequence}`);
  if (raw.sequence !== expectedSequence) throw new ValidationError('Agent executor dry-run step sequence is not contiguous');
  const stepId = identifier(raw.step_id, 'Agent executor dry-run step_id');
  const template = TEMPLATE_CATALOG[stepId];
  if (!template) throw new ValidationError('Agent executor dry-run step template is unsupported');
  if (
    raw.operation_id !== template.operation_id
    || raw.kind !== template.kind
    || raw.executable_id !== template.executable_id
    || raw.working_directory !== 'work/session'
    || raw.repository_code_execution !== template.repository_code_execution
    || raw.tool_may_invoke_repository_shell !== template.tool_may_invoke_repository_shell
    || raw.network_mode !== template.network_mode
  ) throw new ValidationError('Agent executor dry-run step does not match the fixed template');
  assertArrayExact(raw.arguments, template.arguments, 'Agent executor dry-run step arguments');
  if (
    raw.package_lifecycle_scripts_allowed !== false
    || raw.direct_shell_requested !== false
    || raw.elevated_privileges_requested !== false
    || raw.persistent_process_requested !== false
    || raw.absolute_executable_resolution_required !== true
  ) throw new ValidationError('Agent executor dry-run step attempts to widen execution semantics');
  return stepId;
}

export function validateAgentExecutorDryRunPlan(raw) {
  boundedDocument(raw, 'Agent executor dry-run plan');
  exactKeys(raw, PLAN_KEYS, 'Agent executor dry-run plan');
  if (raw.schema !== AGENT_EXECUTOR_DRY_RUN_PLAN_SCHEMA) throw new ValidationError('Agent executor dry-run plan schema is invalid');

  exactKeys(raw.compiler, COMPILER_KEYS, 'Agent executor dry-run compiler');
  if (
    raw.compiler.id !== AGENT_EXECUTOR_DRY_RUN_COMPILER_ID
    || raw.compiler.version !== AGENT_EXECUTOR_DRY_RUN_COMPILER_VERSION
    || raw.compiler.policy_digest !== AGENT_EXECUTOR_DRY_RUN_POLICY_DIGEST
    || raw.compiler.process_spawn_available !== false
    || raw.compiler.filesystem_mutation_available !== false
    || raw.compiler.network_io_available !== false
    || raw.compiler.secret_lookup_available !== false
  ) throw new ValidationError('Agent executor dry-run compiler identity or no-effect boundary is invalid');

  exactKeys(raw.bindings, BINDING_KEYS, 'Agent executor dry-run bindings');
  identifier(raw.bindings.authorization_id, 'Agent executor authorization_id');
  digest(raw.bindings.authorization_digest, 'Agent executor authorization_digest');
  identifier(raw.bindings.sponsor_id, 'Agent executor sponsor_id');
  identifier(raw.bindings.subject_id, 'Agent executor subject_id');
  identifier(raw.bindings.challenge_id, 'Agent executor challenge_id');
  identifier(raw.bindings.offer_id, 'Agent executor offer_id');
  digest(raw.bindings.node_profile_sha256, 'Agent executor node_profile_sha256');
  identifier(raw.bindings.attestation_id, 'Agent executor attestation_id');
  digest(raw.bindings.key_fingerprint_sha256, 'Agent executor key_fingerprint_sha256');
  identifier(raw.bindings.lifecycle_ledger_id, 'Agent executor lifecycle_ledger_id');
  digest(raw.bindings.lifecycle_key_id, 'Agent executor lifecycle_key_id');
  digest(raw.bindings.lifecycle_head_event_digest, 'Agent executor lifecycle_head_event_digest');
  digest(raw.bindings.lifecycle_receipt_digest, 'Agent executor lifecycle_receipt_digest');
  digest(raw.bindings.platform_profile_digest, 'Agent executor platform_profile_digest');

  exactKeys(raw.platform, PLATFORM_KEYS, 'Agent executor dry-run platform');
  identifier(raw.platform.profile_id, 'Agent executor platform profile_id');
  if (!OPERATING_SYSTEMS.has(raw.platform.operating_system) || !ARCHITECTURES.has(raw.platform.architecture)) {
    throw new ValidationError('Agent executor dry-run platform is unsupported');
  }
  if (!FACT_STATUS.has(raw.platform.fact_status) || raw.platform.platform_trust_inferred !== false) {
    throw new ValidationError('Agent executor dry-run platform trust boundary is invalid');
  }

  exactKeys(raw.workspace, WORKSPACE_KEYS, 'Agent executor dry-run workspace');
  if (
    raw.workspace.root !== 'work/session'
    || raw.workspace.relative_only !== true
    || raw.workspace.traversal_allowed !== false
    || raw.workspace.symlink_following_allowed !== false
    || raw.workspace.host_root_access_allowed !== false
    || raw.workspace.disposable_required !== true
  ) throw new ValidationError('Agent executor dry-run workspace boundary is invalid');

  exactKeys(raw.network, NETWORK_KEYS, 'Agent executor dry-run network');
  if (!NETWORK_MODES.has(raw.network.mode)) throw new ValidationError('Agent executor dry-run network mode is invalid');
  const normalizedNetwork = normalizeNetwork({ mode: raw.network.mode, allowed_origins: raw.network.allowed_origins });
  assertArrayExact(raw.network.allowed_origins, normalizedNetwork.allowed_origins, 'Agent executor dry-run network origins');
  assertArrayExact(raw.network.methods, normalizedNetwork.methods, 'Agent executor dry-run network methods');
  if (
    raw.network.redirects_allowed !== false
    || raw.network.credentials_allowed !== false
    || raw.network.dynamic_origin_discovery_allowed !== false
    || raw.network.dns_rebinding_protection_required !== normalizedNetwork.dns_rebinding_protection_required
    || raw.network.resolution_policy !== normalizedNetwork.resolution_policy
  ) throw new ValidationError('Agent executor dry-run network safety boundary is invalid');

  exactKeys(raw.environment, ENVIRONMENT_KEYS, 'Agent executor dry-run environment');
  assertArrayExact(raw.environment.allowed_names, ALLOWED_ENVIRONMENT_NAMES, 'Agent executor dry-run environment names');
  if (
    raw.environment.values_embedded !== false
    || raw.environment.path_override_allowed !== false
    || raw.environment.secret_values_allowed !== false
  ) throw new ValidationError('Agent executor dry-run environment attempts to widen authority');

  exactKeys(raw.resources, RESOURCE_KEYS, 'Agent executor dry-run resources');
  if (
    !Number.isSafeInteger(raw.resources.max_steps) || raw.resources.max_steps !== MAX_STEPS
    || !Number.isSafeInteger(raw.resources.max_processes) || raw.resources.max_processes !== MAX_PROCESSES
    || !Number.isSafeInteger(raw.resources.max_process_runtime_seconds)
    || raw.resources.max_process_runtime_seconds < 1
    || raw.resources.max_process_runtime_seconds > MAX_PROCESS_RUNTIME_SECONDS
    || !Number.isSafeInteger(raw.resources.max_total_runtime_seconds)
    || raw.resources.max_total_runtime_seconds < 1
    || raw.resources.max_total_runtime_seconds > 900
    || raw.resources.max_process_runtime_seconds > raw.resources.max_total_runtime_seconds
    || raw.resources.max_output_bytes !== MAX_OUTPUT_BYTES
    || raw.resources.max_memory_mib !== MAX_MEMORY_MIB
  ) throw new ValidationError('Agent executor dry-run resource ceilings are invalid');

  if (!Array.isArray(raw.steps) || raw.steps.length > MAX_STEPS) throw new ValidationError('Agent executor dry-run steps are invalid');
  const stepIds = new Set();
  for (let index = 0; index < raw.steps.length; index += 1) {
    const stepId = validateStep(raw.steps[index], index + 1);
    if (stepIds.has(stepId)) throw new ValidationError('Agent executor dry-run plan contains duplicate or ambiguous steps');
    stepIds.add(stepId);
  }

  exactKeys(raw.lifecycle, LIFECYCLE_KEYS, 'Agent executor dry-run lifecycle');
  if (
    raw.lifecycle.known_head_only !== true
    || raw.lifecycle.global_currentness_claimed !== false
    || raw.lifecycle.status_required !== 'issued'
    || raw.lifecycle.consume_before_first_effect !== true
    || raw.lifecycle.completion_requires_executor_receipt !== true
    || raw.lifecycle.terminal_on_uncertainty !== 'interrupted'
  ) throw new ValidationError('Agent executor dry-run lifecycle boundary is invalid');

  exactKeys(raw.evidence, EVIDENCE_KEYS, 'Agent executor dry-run evidence');
  if (
    raw.evidence.sanitized_logs_required !== true
    || raw.evidence.raw_secret_capture_allowed !== false
    || raw.evidence.stdout_stderr_max_bytes !== MAX_OUTPUT_BYTES
    || raw.evidence.task_success_claimed !== false
  ) throw new ValidationError('Agent executor dry-run evidence boundary is invalid');

  exactKeys(raw.cleanup, CLEANUP_KEYS, 'Agent executor dry-run cleanup');
  if (
    raw.cleanup.workspace_disposal_required !== true
    || raw.cleanup.on_success !== true
    || raw.cleanup.on_failure !== true
    || raw.cleanup.on_interrupt !== true
    || raw.cleanup.persistent_artifacts_allowed !== false
  ) throw new ValidationError('Agent executor dry-run cleanup boundary is invalid');

  assertStaticFalseObject(raw.effects, EFFECT_KEYS, 'Agent executor dry-run effects');

  const planDigest = digest(raw.plan_digest, 'Agent executor dry-run plan_digest');
  const body = Object.freeze({
    schema: raw.schema,
    compiler: raw.compiler,
    bindings: raw.bindings,
    platform: raw.platform,
    workspace: raw.workspace,
    network: raw.network,
    environment: raw.environment,
    resources: raw.resources,
    steps: raw.steps,
    lifecycle: raw.lifecycle,
    evidence: raw.evidence,
    cleanup: raw.cleanup,
    effects: raw.effects
  });
  if (planDigest !== digestObject(body)) throw new ValidationError('Agent executor dry-run plan digest is invalid');
  return Object.freeze({ valid: true, plan_digest: planDigest, step_count: raw.steps.length, effect_reachable: false });
}

export function verifyAgentExecutorDryRunPlan(raw, inputs) {
  const checked = validateAgentExecutorDryRunPlan(raw);
  const expected = compileAgentExecutorDryRunPlan(inputs);
  if (checked.plan_digest !== expected.plan_digest) {
    throw new ValidationError('Agent executor dry-run plan does not match the exact validated inputs');
  }
  return Object.freeze({ ...checked, exact_input_binding: true });
}
