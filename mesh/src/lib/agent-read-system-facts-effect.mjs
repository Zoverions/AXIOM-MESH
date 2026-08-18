import { createPrivateKey, createPublicKey, sign, verify } from 'node:crypto';
import { ValidationError, canonicalJson, digestObject, sha256 } from './canonical.mjs';
import { AgentExecutorDurableStateStore } from './agent-executor-durable-state.mjs';
import {
  AGENT_LINUX_ISOLATION_ADAPTER_ID,
  AGENT_LINUX_ISOLATION_ENTRYPOINT,
  verifyAgentLinuxIsolationConformanceReceipt
} from './agent-linux-isolation-conformance.mjs';
import {
  verifyAgentTestSessionLifecycleReceipt,
  verifyAgentTestSessionLifecycleTranscript
} from './agent-test-session-lifecycle.mjs';
import {
  AGENT_READ_SYSTEM_FACTS_EFFECT_OPERATION,
  validateReadSystemFactsEffectPlan,
  verifyAgentReadSystemFactsEffectAdmission
} from './agent-read-system-facts-effect-admission.mjs';

export const AGENT_READ_SYSTEM_FACTS_EFFECT_RECEIPT_SCHEMA = 'axiom-agent-read-system-facts-effect-receipt.v1';
export const AGENT_READ_SYSTEM_FACTS_EFFECT_EXECUTOR_ID = 'agent-commons.linux-read-system-facts-effect';
export const AGENT_READ_SYSTEM_FACTS_EFFECT_EXECUTOR_VERSION = 1;

const ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/;
const SHA256 = /^[a-f0-9]{64}$/;
const BASE64URL = /^[A-Za-z0-9_-]+$/;
const IMAGE_ID = /^sha256:[a-f0-9]{64}$/;
const MAX_OUTPUT_BYTES = 4096;
const RECEIPT_KEYS = new Set(['schema', 'statement', 'statement_digest', 'executor_signature', 'receipt_digest']);
const STATEMENT_KEYS = new Set([
  'executor_id','executor_key_id','executor_version','policy_digest','repository','revision','admission_digest','plan_digest',
  'authorization_id','authorization_digest','sponsor_id','subject_id','lifecycle_ledger_id','lifecycle_key_id',
  'lifecycle_pre_effect_head_digest','lifecycle_consumption_event_digest','lifecycle_final_head_digest','lifecycle_final_receipt_digest',
  'durable_store_id','durable_consume_generation','durable_consume_record_digest','durable_final_generation','durable_final_record_digest',
  'isolation_receipt_digest','isolation_adapter_id','image_id','operation_id','started_at','finished_at','observations','cleanup_verified',
  'revocation_state','known_signed_head_only','global_currentness_claimed','dry_run_plan_effect_reachable','laboratory_effect_admission_observed',
  'durable_consumption_before_effect_observed','real_process_effect_observed','exact_plan_step_mapping_observed','repository_code_executed',
  'repository_workspace_mutated','network_performed','credentials_retrieved','secrets_retrieved','service_controlled','package_installed',
  'remote_execution_enabled','remote_hardware_accessed','production_enrollment','deployment_authority','capability_promoted','task_success_claimed',
  'general_executor_available','axiom_authority_granted'
]);
const OBSERVATION_KEYS = new Set([
  'sequence','step_id','executable_id','absolute_executable','arguments','logical_working_directory','container_working_directory',
  'exit_status','sanitized_output','output_sha256','output_bytes','stderr_empty','network_mode','repository_code_execution','container_absent_after_cleanup'
]);
const EXPECTED = Object.freeze([
  { sequence: 1, step_id: 'read-system-facts:node-version', args: ['--version'] },
  { sequence: 2, step_id: 'read-system-facts:platform-arch', args: ['-p', 'JSON.stringify({platform:process.platform,arch:process.arch})'] }
]);

export const AGENT_READ_SYSTEM_FACTS_EFFECT_POLICY = Object.freeze({
  schema: 'axiom-agent-read-system-facts-effect-policy.v1',
  executor_id: AGENT_READ_SYSTEM_FACTS_EFFECT_EXECUTOR_ID,
  executor_version: AGENT_READ_SYSTEM_FACTS_EFFECT_EXECUTOR_VERSION,
  operation_id: AGENT_READ_SYSTEM_FACTS_EFFECT_OPERATION,
  isolation_adapter_id: AGENT_LINUX_ISOLATION_ADAPTER_ID,
  durable_consume_before_effect: true,
  exact_two_step_mapping: true,
  network_mode: 'none',
  arbitrary_command_allowed: false,
  shell_allowed: false,
  repository_code_execution_allowed: false,
  credentials_allowed: false,
  secrets_allowed: false,
  remote_hardware_allowed: false,
  production_authority: false,
  max_output_bytes: MAX_OUTPUT_BYTES
});
export const AGENT_READ_SYSTEM_FACTS_EFFECT_POLICY_DIGEST = digestObject(AGENT_READ_SYSTEM_FACTS_EFFECT_POLICY);

function fail(message) { throw new ValidationError(message); }
function exact(value, keys, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(`${label} must be an object`);
  for (const key of Object.keys(value)) if (!keys.has(key)) fail(`${label} contains unsupported field: ${key}`);
  for (const key of keys) if (!Object.hasOwn(value, key)) fail(`${label} is missing required field: ${key}`);
  return value;
}
function id(value, label) { if (typeof value !== 'string' || !ID.test(value)) fail(`${label} is invalid`); return value; }
function digest(value, label) { if (typeof value !== 'string' || !SHA256.test(value)) fail(`${label} is invalid`); return value; }
function time(value, label) {
  const d = new Date(value);
  if (typeof value !== 'string' || Number.isNaN(d.getTime()) || d.toISOString() !== value) fail(`${label} must be canonical UTC`);
  return value;
}
function key(value, type, label) {
  try {
    const parsed = value?.type === type ? value : type === 'private' ? createPrivateKey(value) : createPublicKey(value);
    if (parsed.asymmetricKeyType !== 'ed25519') fail(`${label} must be Ed25519`);
    return parsed;
  } catch (error) {
    if (error instanceof ValidationError) throw error;
    fail(`${label} is invalid`);
  }
}
function keyId(publicKey) { return sha256(publicKey.export({ type: 'spki', format: 'der' })); }
function sameArray(a, b) { return Array.isArray(a) && a.length === b.length && a.every((v, i) => v === b[i]); }

function verifyCurrentHead({ plan, store, transcript, receipt, trustedLifecyclePublicKey }) {
  const tx = verifyAgentTestSessionLifecycleTranscript(transcript, { trustedLedgerPublicKey: trustedLifecyclePublicKey });
  const headReceipt = verifyAgentTestSessionLifecycleReceipt(receipt, { trustedLedgerPublicKey: trustedLifecyclePublicKey, transcript });
  if (tx.status !== 'issued' || tx.terminal || headReceipt.statement.status !== 'issued') fail('effect current lifecycle must be issued');
  if (
    tx.authorization_id !== plan.bindings.authorization_id || tx.authorization_digest !== plan.bindings.authorization_digest ||
    tx.ledger_id !== plan.bindings.lifecycle_ledger_id || tx.ledger_key_id !== plan.bindings.lifecycle_key_id ||
    headReceipt.statement.authorization_id !== plan.bindings.authorization_id || headReceipt.statement.authorization_digest !== plan.bindings.authorization_digest
  ) fail('effect current lifecycle does not bind the exact plan');
  const durable = store.currentRecord;
  if (
    store.status !== 'issued' || durable.statement.lifecycle_head_event_digest !== tx.head_event_digest ||
    durable.statement.lifecycle_receipt_digest !== headReceipt.receipt_digest ||
    digestObject(durable.payload.lifecycle_transcript) !== digestObject(transcript) ||
    digestObject(durable.payload.lifecycle_receipt) !== digestObject(receipt)
  ) fail('effect durable state does not match the supplied current signed head');
  return { tx, headReceipt };
}

function normalizeObservation(raw, expected, plan) {
  exact(raw, OBSERVATION_KEYS, 'effect observation');
  if (!expected) fail('effect observation sequence exceeds exact plan mapping');
  if (
    raw.sequence !== expected.sequence || raw.step_id !== expected.step_id || raw.executable_id !== 'node-current-pinned' ||
    raw.absolute_executable !== AGENT_LINUX_ISOLATION_ENTRYPOINT || !sameArray(raw.arguments, expected.args) ||
    raw.logical_working_directory !== 'work/session' || raw.container_working_directory !== '/work' ||
    raw.exit_status !== 0 || raw.stderr_empty !== true || raw.network_mode !== 'none' ||
    raw.repository_code_execution !== false || raw.container_absent_after_cleanup !== true
  ) fail('effect observation widened beyond the exact plan mapping');
  if (typeof raw.sanitized_output !== 'string' || raw.sanitized_output.length < 1 || Buffer.byteLength(raw.sanitized_output, 'utf8') > MAX_OUTPUT_BYTES) fail('effect output is invalid');
  if (raw.output_bytes !== Buffer.byteLength(raw.sanitized_output, 'utf8') || raw.output_sha256 !== sha256(raw.sanitized_output)) fail('effect output digest/size mismatch');
  if (expected.sequence === 1 && !/^v\d+\.\d+\.\d+$/.test(raw.sanitized_output.trim())) fail('effect Node version output is invalid');
  if (expected.sequence === 2) {
    let value;
    try { value = JSON.parse(raw.sanitized_output); } catch { fail('effect platform output is not JSON'); }
    if (!value || Object.keys(value).sort().join(',') !== 'arch,platform' || value.platform !== 'linux' || value.arch !== plan.platform.architecture) fail('effect platform output does not match plan');
  }
  return Object.freeze({ ...raw, arguments: Object.freeze([...raw.arguments]) });
}

function receiptStatement(raw, { plan, admission, trustedAdmissionIssuerPublicKey, isolationReceipt }) {
  exact(raw, STATEMENT_KEYS, 'effect receipt statement');
  validateReadSystemFactsEffectPlan(plan);
  const checkedAdmission = verifyAgentReadSystemFactsEffectAdmission(admission, {
    trustedIssuerPublicKey: trustedAdmissionIssuerPublicKey,
    plan,
    expectedRevision: raw.revision,
    now: raw.started_at
  });
  const isolation = verifyAgentLinuxIsolationConformanceReceipt(isolationReceipt);
  if (isolation.revision !== raw.revision) fail('effect isolation receipt revision mismatch');
  if (!Array.isArray(raw.observations) || raw.observations.length !== 2) fail('effect receipt requires exactly two observations');
  const observations = Object.freeze(raw.observations.map((item, index) => normalizeObservation(item, EXPECTED[index], plan)));
  if (
    raw.executor_id !== AGENT_READ_SYSTEM_FACTS_EFFECT_EXECUTOR_ID || raw.executor_version !== 1 ||
    raw.policy_digest !== AGENT_READ_SYSTEM_FACTS_EFFECT_POLICY_DIGEST || raw.repository !== 'Zoverions/AXIOM-MESH' ||
    raw.admission_digest !== checkedAdmission.admission_digest || raw.plan_digest !== plan.plan_digest ||
    raw.authorization_id !== plan.bindings.authorization_id || raw.authorization_digest !== plan.bindings.authorization_digest ||
    raw.sponsor_id !== plan.bindings.sponsor_id || raw.subject_id !== plan.bindings.subject_id ||
    raw.lifecycle_ledger_id !== plan.bindings.lifecycle_ledger_id || raw.lifecycle_key_id !== plan.bindings.lifecycle_key_id ||
    raw.isolation_receipt_digest !== isolation.receipt_digest || raw.isolation_adapter_id !== AGENT_LINUX_ISOLATION_ADAPTER_ID ||
    raw.image_id !== isolation.adapter.image_id || !IMAGE_ID.test(raw.image_id) || raw.operation_id !== AGENT_READ_SYSTEM_FACTS_EFFECT_OPERATION
  ) fail('effect receipt binding is invalid');
  [
    raw.executor_key_id, raw.lifecycle_pre_effect_head_digest, raw.lifecycle_consumption_event_digest,
    raw.lifecycle_final_head_digest, raw.lifecycle_final_receipt_digest, raw.durable_consume_record_digest,
    raw.durable_final_record_digest
  ].forEach((value, index) => digest(value, `effect receipt digest field ${index}`));
  id(raw.durable_store_id, 'effect durable_store_id');
  if (
    !Number.isSafeInteger(raw.durable_consume_generation) || raw.durable_consume_generation < 2 ||
    !Number.isSafeInteger(raw.durable_final_generation) || raw.durable_final_generation <= raw.durable_consume_generation
  ) fail('effect durable generations are invalid');
  time(raw.started_at, 'effect started_at');
  time(raw.finished_at, 'effect finished_at');
  if (Date.parse(raw.finished_at) < Date.parse(raw.started_at)) fail('effect receipt time order is invalid');
  const exactClaims = {
    cleanup_verified: true,
    revocation_state: 'active',
    known_signed_head_only: true,
    global_currentness_claimed: false,
    dry_run_plan_effect_reachable: false,
    laboratory_effect_admission_observed: true,
    durable_consumption_before_effect_observed: true,
    real_process_effect_observed: true,
    exact_plan_step_mapping_observed: true,
    repository_code_executed: false,
    repository_workspace_mutated: false,
    network_performed: false,
    credentials_retrieved: false,
    secrets_retrieved: false,
    service_controlled: false,
    package_installed: false,
    remote_execution_enabled: false,
    remote_hardware_accessed: false,
    production_enrollment: false,
    deployment_authority: false,
    capability_promoted: false,
    task_success_claimed: false,
    general_executor_available: false,
    axiom_authority_granted: false
  };
  for (const [name, expected] of Object.entries(exactClaims)) {
    if (raw[name] !== expected) fail(`effect receipt attempts to elevate ${name}`);
  }
  return Object.freeze({ ...raw, observations });
}

export function verifyAgentReadSystemFactsEffectReceipt(raw, {
  trustedExecutorPublicKey,
  trustedAdmissionIssuerPublicKey,
  plan,
  admission,
  isolationConformanceReceipt
} = {}) {
  exact(raw, RECEIPT_KEYS, 'effect receipt');
  if (raw.schema !== AGENT_READ_SYSTEM_FACTS_EFFECT_RECEIPT_SCHEMA) fail('effect receipt schema is invalid');
  const pk = key(trustedExecutorPublicKey, 'public', 'effect trusted executor key');
  const statement = receiptStatement(raw.statement, {
    plan,
    admission,
    trustedAdmissionIssuerPublicKey,
    isolationReceipt: isolationConformanceReceipt
  });
  if (statement.executor_key_id !== keyId(pk)) fail('effect receipt executor key mismatch');
  const statementDigest = digestObject(statement);
  if (
    raw.statement_digest !== statementDigest || typeof raw.executor_signature !== 'string' ||
    !BASE64URL.test(raw.executor_signature) || raw.executor_signature.length > 256
  ) fail('effect receipt digest/signature shape is invalid');
  const payload = canonicalJson({ schema: AGENT_READ_SYSTEM_FACTS_EFFECT_RECEIPT_SCHEMA, statement, statement_digest: statementDigest });
  if (!verify(null, Buffer.from(payload, 'utf8'), pk, Buffer.from(raw.executor_signature, 'base64url'))) fail('effect receipt signature verification failed');
  const candidate = { schema: raw.schema, statement, statement_digest: statementDigest, executor_signature: raw.executor_signature };
  const receiptDigest = digestObject(candidate);
  if (raw.receipt_digest !== receiptDigest) fail('effect receipt digest mismatch');
  return Object.freeze({ ...candidate, receipt_digest: receiptDigest });
}

export class AgentReadSystemFactsEffectController {
  constructor({ durableStore, executorPrivateKey, admission, trustedAdmissionIssuerPublicKey, isolationConformanceReceipt, revision }) {
    if (!(durableStore instanceof AgentExecutorDurableStateStore)) fail('effect controller requires durable state store');
    validateReadSystemFactsEffectPlan(durableStore.plan);
    if (!durableStore.canResume) fail(`effect controller cannot resume ${durableStore.recoveryClassification}`);
    const isolation = verifyAgentLinuxIsolationConformanceReceipt(isolationConformanceReceipt);
    if (isolation.revision !== revision) fail('effect controller isolation revision mismatch');
    this.store = durableStore;
    this.plan = durableStore.plan;
    this.revision = revision;
    this.isolation = isolation;
    this.admission = verifyAgentReadSystemFactsEffectAdmission(admission, {
      trustedIssuerPublicKey: trustedAdmissionIssuerPublicKey,
      plan: this.plan,
      expectedRevision: revision,
      now: admission.statement.not_before
    });
    this.trustedAdmissionIssuerPublicKey = trustedAdmissionIssuerPublicKey;
    this.sk = key(executorPrivateKey, 'private', 'effect executor key');
    this.pk = createPublicKey(this.sk);
    this.startedAt = null;
    this.preHead = null;
    this.consumeDigest = null;
    this.consumeGeneration = null;
    this.consumeRecordDigest = null;
  }

  get executorPublicKey() {
    return this.pk.export({ type: 'spki', format: 'pem' }).toString();
  }

  descriptor() {
    return Object.freeze({
      operation_id: AGENT_READ_SYSTEM_FACTS_EFFECT_OPERATION,
      network_mode: 'none',
      repository_mount_allowed: false,
      steps: Object.freeze(EXPECTED.map(step => Object.freeze({
        sequence: step.sequence,
        step_id: step.step_id,
        executable_id: 'node-current-pinned',
        absolute_executable: AGENT_LINUX_ISOLATION_ENTRYPOINT,
        arguments: Object.freeze([...step.args])
      })))
    });
  }

  begin({ currentLifecycleTranscript, currentLifecycleReceipt, trustedLifecyclePublicKey, revocationState, occurredAt }) {
    if (this.startedAt) fail('effect controller already consumed authorization');
    if (revocationState !== 'active') fail('effect requires known-active revocation state');
    const at = time(occurredAt, 'effect begin time');
    if (Date.parse(at) < Date.parse(this.admission.statement.not_before) || Date.parse(at) >= Date.parse(this.admission.statement.expires_at)) {
      fail('effect admission is not active at consume time');
    }
    const current = verifyCurrentHead({
      plan: this.plan,
      store: this.store,
      transcript: currentLifecycleTranscript,
      receipt: currentLifecycleReceipt,
      trustedLifecyclePublicKey
    });
    this.preHead = current.tx.head_event_digest;
    const transition = this.store.consume({
      eventId: `read-system-facts-consume:${this.plan.plan_digest.slice(0, 24)}`,
      occurredAt: at,
      revocationState: 'active'
    });
    this.startedAt = at;
    this.consumeDigest = transition.result.event.event_digest;
    this.consumeGeneration = transition.record.statement.generation;
    this.consumeRecordDigest = transition.record.record_digest;
    return this.descriptor();
  }

  interrupt({ occurredAt, reasonCode = 'read-system-facts-effect-interrupted' }) {
    if (!this.startedAt) fail('effect cannot interrupt before durable consumption');
    if (this.store.status !== 'consumed') return this.store.currentRecord;
    return this.store.interrupt({
      eventId: `read-system-facts-interrupt:${this.plan.plan_digest.slice(0, 24)}`,
      occurredAt,
      reasonCode
    }).record;
  }

  complete({ observations, finishedAt }) {
    if (!this.startedAt || this.store.status !== 'consumed') fail('effect cannot complete without consumed durable authority');
    if (!Array.isArray(observations) || observations.length !== 2) fail('effect requires exactly two observations');
    const normalized = observations.map((item, index) => normalizeObservation(item, EXPECTED[index], this.plan));
    const at = time(finishedAt, 'effect finish time');
    const transition = this.store.complete({
      eventId: `read-system-facts-complete:${this.plan.plan_digest.slice(0, 24)}`,
      occurredAt: at
    });
    const finalRecord = transition.record;
    const statement = Object.freeze({
      executor_id: AGENT_READ_SYSTEM_FACTS_EFFECT_EXECUTOR_ID,
      executor_key_id: keyId(this.pk),
      executor_version: 1,
      policy_digest: AGENT_READ_SYSTEM_FACTS_EFFECT_POLICY_DIGEST,
      repository: 'Zoverions/AXIOM-MESH',
      revision: this.revision,
      admission_digest: this.admission.admission_digest,
      plan_digest: this.plan.plan_digest,
      authorization_id: this.plan.bindings.authorization_id,
      authorization_digest: this.plan.bindings.authorization_digest,
      sponsor_id: this.plan.bindings.sponsor_id,
      subject_id: this.plan.bindings.subject_id,
      lifecycle_ledger_id: this.plan.bindings.lifecycle_ledger_id,
      lifecycle_key_id: this.plan.bindings.lifecycle_key_id,
      lifecycle_pre_effect_head_digest: this.preHead,
      lifecycle_consumption_event_digest: this.consumeDigest,
      lifecycle_final_head_digest: finalRecord.statement.lifecycle_head_event_digest,
      lifecycle_final_receipt_digest: finalRecord.payload.lifecycle_receipt.receipt_digest,
      durable_store_id: this.store.storeId,
      durable_consume_generation: this.consumeGeneration,
      durable_consume_record_digest: this.consumeRecordDigest,
      durable_final_generation: finalRecord.statement.generation,
      durable_final_record_digest: finalRecord.record_digest,
      isolation_receipt_digest: this.isolation.receipt_digest,
      isolation_adapter_id: AGENT_LINUX_ISOLATION_ADAPTER_ID,
      image_id: this.isolation.adapter.image_id,
      operation_id: AGENT_READ_SYSTEM_FACTS_EFFECT_OPERATION,
      started_at: this.startedAt,
      finished_at: at,
      observations: Object.freeze(normalized),
      cleanup_verified: true,
      revocation_state: 'active',
      known_signed_head_only: true,
      global_currentness_claimed: false,
      dry_run_plan_effect_reachable: false,
      laboratory_effect_admission_observed: true,
      durable_consumption_before_effect_observed: true,
      real_process_effect_observed: true,
      exact_plan_step_mapping_observed: true,
      repository_code_executed: false,
      repository_workspace_mutated: false,
      network_performed: false,
      credentials_retrieved: false,
      secrets_retrieved: false,
      service_controlled: false,
      package_installed: false,
      remote_execution_enabled: false,
      remote_hardware_accessed: false,
      production_enrollment: false,
      deployment_authority: false,
      capability_promoted: false,
      task_success_claimed: false,
      general_executor_available: false,
      axiom_authority_granted: false
    });
    const statementDigest = digestObject(statement);
    const payload = canonicalJson({ schema: AGENT_READ_SYSTEM_FACTS_EFFECT_RECEIPT_SCHEMA, statement, statement_digest: statementDigest });
    const candidate = {
      schema: AGENT_READ_SYSTEM_FACTS_EFFECT_RECEIPT_SCHEMA,
      statement,
      statement_digest: statementDigest,
      executor_signature: sign(null, Buffer.from(payload, 'utf8'), this.sk).toString('base64url')
    };
    return Object.freeze({ ...candidate, receipt_digest: digestObject(candidate) });
  }
}
