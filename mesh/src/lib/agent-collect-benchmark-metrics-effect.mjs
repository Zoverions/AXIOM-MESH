import { createPrivateKey, createPublicKey, sign, verify } from 'node:crypto';
import { ValidationError, canonicalJson, digestObject, sha256 } from './canonical.mjs';
import { AgentExecutorDurableStateStore } from './agent-executor-durable-state.mjs';
import { verifyAgentExecutorDurableStateReceipt } from './agent-executor-durable-format.mjs';
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
  AGENT_COLLECT_BENCHMARK_METRICS_EFFECT_OPERATION,
  AGENT_COLLECT_BENCHMARK_METRICS_POLICY_ID,
  validateCollectBenchmarkMetricsEffectPlan,
  verifyAgentCollectBenchmarkMetricsEffectAdmission
} from './agent-collect-benchmark-metrics-effect-admission.mjs';

export const AGENT_COLLECT_BENCHMARK_METRICS_EFFECT_RECEIPT_SCHEMA = 'axiom-agent-collect-benchmark-metrics-effect-receipt.v1';
export const AGENT_COLLECT_BENCHMARK_METRICS_EFFECT_EXECUTOR_ID = 'agent-commons.linux-collect-benchmark-metrics-effect';
export const AGENT_COLLECT_BENCHMARK_METRICS_EFFECT_EXECUTOR_VERSION = 1;
export const AGENT_COLLECT_BENCHMARK_METRICS_WORKLOAD_ID = 'lcg-u32-262144-v1';
export const AGENT_COLLECT_BENCHMARK_METRICS_ITERATIONS = 262144;
export const AGENT_COLLECT_BENCHMARK_METRICS_EXPECTED_CHECKSUM = 1679840888;
export const AGENT_COLLECT_BENCHMARK_METRICS_MAX_ELAPSED_NS = 60_000_000_000;
export const AGENT_COLLECT_BENCHMARK_METRICS_MAX_OUTPUT_BYTES = 2048;

export const AGENT_COLLECT_BENCHMARK_METRICS_ADAPTER_SCRIPT = String.raw`const POLICY='synthetic-lcg-u32-262144-v1';
const WORKLOAD='lcg-u32-262144-v1';
const ITERATIONS=262144;
const EXPECTED=1679840888;
const stable=value=>{if(Array.isArray(value))return value.map(stable);if(value&&typeof value==='object'){const out={};for(const key of Object.keys(value).sort())out[key]=stable(value[key]);return out;}return value;};
let state=0x12345678;
const start=process.hrtime.bigint();
for(let i=0;i<ITERATIONS;i++){state=(Math.imul((state^i)>>>0,1664525)+1013904223)>>>0;}
const elapsed=process.hrtime.bigint()-start;
if(state!==EXPECTED)throw new Error('checksum-mismatch');
if(elapsed<=0n||elapsed>60000000000n)throw new Error('elapsed-bound');
const elapsedNumber=Number(elapsed);
if(!Number.isSafeInteger(elapsedNumber))throw new Error('elapsed-safe-integer');
const result={benchmark_policy_id:POLICY,workload_id:WORKLOAD,iterations:ITERATIONS,checksum_u32:state,timer_source:'process.hrtime.bigint',elapsed_ns:elapsedNumber};
const output=JSON.stringify(stable(result));
if(Buffer.byteLength(output,'utf8')>2048)throw new Error('output-ceiling');
process.stdout.write(output);`;

export const AGENT_COLLECT_BENCHMARK_METRICS_ADAPTER_SCRIPT_SHA256 = sha256(AGENT_COLLECT_BENCHMARK_METRICS_ADAPTER_SCRIPT);

const ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/;
const SHA256 = /^[a-f0-9]{64}$/;
const BASE64URL = /^[A-Za-z0-9_-]+$/;
const IMAGE_ID = /^sha256:[a-f0-9]{64}$/;
const RECEIPT_KEYS = new Set(['schema', 'statement', 'statement_digest', 'executor_signature', 'receipt_digest']);
const STATEMENT_KEYS = new Set([
  'executor_id','executor_key_id','executor_version','policy_digest','repository','revision','admission_digest','plan_digest',
  'authorization_id','authorization_digest','sponsor_id','subject_id','lifecycle_ledger_id','lifecycle_key_id',
  'lifecycle_pre_effect_head_digest','lifecycle_consumption_event_digest','lifecycle_final_head_digest','lifecycle_final_receipt_digest',
  'durable_store_id','durable_consume_generation','durable_consume_record_digest','durable_consume_head_receipt_digest',
  'durable_final_generation','durable_final_record_digest','isolation_receipt_digest','isolation_adapter_id','image_id','operation_id',
  'benchmark_policy_id','workload_id','adapter_script_sha256','started_at','finished_at','observation','cleanup_verified',
  'revocation_state','known_signed_head_only','global_currentness_claimed','dry_run_plan_effect_reachable',
  'laboratory_effect_admission_observed','durable_consumption_before_effect_observed','real_process_effect_observed',
  'synthetic_workload_observed','monotonic_timer_observed','host_telemetry_observed','machine_comparison_score_claimed','production_slo_claimed',
  'arbitrary_benchmark_used','repository_code_executed','repository_workspace_mutated','network_performed','credentials_retrieved',
  'secrets_retrieved','service_controlled','package_installed','remote_execution_enabled','remote_hardware_accessed','production_enrollment',
  'deployment_authority','capability_promoted','task_success_claimed','general_executor_available','axiom_authority_granted'
]);
const OBSERVATION_KEYS = new Set([
  'adapter_script_sha256','benchmark_policy_id','workload_id','iterations','checksum_u32','timer_source','elapsed_ns','metrics_output',
  'output_sha256','output_bytes','exit_status','stderr_empty','network_mode','repository_code_execution','host_telemetry_read',
  'container_absent_after_cleanup'
]);
const METRIC_KEYS = new Set(['benchmark_policy_id','workload_id','iterations','checksum_u32','timer_source','elapsed_ns']);

export const AGENT_COLLECT_BENCHMARK_METRICS_EFFECT_POLICY = Object.freeze({
  schema: 'axiom-agent-collect-benchmark-metrics-effect-policy.v1',
  executor_id: AGENT_COLLECT_BENCHMARK_METRICS_EFFECT_EXECUTOR_ID,
  executor_version: AGENT_COLLECT_BENCHMARK_METRICS_EFFECT_EXECUTOR_VERSION,
  operation_id: AGENT_COLLECT_BENCHMARK_METRICS_EFFECT_OPERATION,
  benchmark_policy_id: AGENT_COLLECT_BENCHMARK_METRICS_POLICY_ID,
  workload_id: AGENT_COLLECT_BENCHMARK_METRICS_WORKLOAD_ID,
  isolation_adapter_id: AGENT_LINUX_ISOLATION_ADAPTER_ID,
  adapter_script_sha256: AGENT_COLLECT_BENCHMARK_METRICS_ADAPTER_SCRIPT_SHA256,
  iterations: AGENT_COLLECT_BENCHMARK_METRICS_ITERATIONS,
  expected_checksum_u32: AGENT_COLLECT_BENCHMARK_METRICS_EXPECTED_CHECKSUM,
  max_elapsed_ns: AGENT_COLLECT_BENCHMARK_METRICS_MAX_ELAPSED_NS,
  max_output_bytes: AGENT_COLLECT_BENCHMARK_METRICS_MAX_OUTPUT_BYTES,
  durable_consume_before_effect: true,
  signed_consumed_head_before_effect: true,
  synthetic_workload_only: true,
  host_telemetry_allowed: false,
  arbitrary_benchmark_allowed: false,
  network_mode: 'none',
  arbitrary_command_allowed: false,
  shell_allowed: false,
  repository_code_execution_allowed: false,
  credentials_allowed: false,
  secrets_allowed: false,
  remote_hardware_allowed: false,
  production_authority: false
});
export const AGENT_COLLECT_BENCHMARK_METRICS_EFFECT_POLICY_DIGEST = digestObject(AGENT_COLLECT_BENCHMARK_METRICS_EFFECT_POLICY);

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

function verifyCurrentHead({ plan, store, transcript, receipt, trustedLifecyclePublicKey }) {
  const tx = verifyAgentTestSessionLifecycleTranscript(transcript, { trustedLedgerPublicKey: trustedLifecyclePublicKey });
  const headReceipt = verifyAgentTestSessionLifecycleReceipt(receipt, { trustedLedgerPublicKey: trustedLifecyclePublicKey, transcript });
  if (tx.status !== 'issued' || tx.terminal || headReceipt.statement.status !== 'issued') fail('benchmark effect current lifecycle must be issued');
  if (
    tx.authorization_id !== plan.bindings.authorization_id || tx.authorization_digest !== plan.bindings.authorization_digest ||
    tx.ledger_id !== plan.bindings.lifecycle_ledger_id || tx.ledger_key_id !== plan.bindings.lifecycle_key_id ||
    headReceipt.statement.authorization_id !== plan.bindings.authorization_id || headReceipt.statement.authorization_digest !== plan.bindings.authorization_digest
  ) fail('benchmark effect current lifecycle does not bind the exact plan');
  const durable = store.currentRecord;
  if (
    store.status !== 'issued' || durable.statement.lifecycle_head_event_digest !== tx.head_event_digest ||
    durable.statement.lifecycle_receipt_digest !== headReceipt.receipt_digest ||
    digestObject(durable.payload.lifecycle_transcript) !== digestObject(transcript) ||
    digestObject(durable.payload.lifecycle_receipt) !== digestObject(receipt)
  ) fail('benchmark durable state does not match the supplied current signed head');
  return { tx, headReceipt };
}

function normalizeObservation(raw) {
  exact(raw, OBSERVATION_KEYS, 'benchmark effect observation');
  if (
    raw.adapter_script_sha256 !== AGENT_COLLECT_BENCHMARK_METRICS_ADAPTER_SCRIPT_SHA256 ||
    raw.benchmark_policy_id !== AGENT_COLLECT_BENCHMARK_METRICS_POLICY_ID || raw.workload_id !== AGENT_COLLECT_BENCHMARK_METRICS_WORKLOAD_ID ||
    raw.iterations !== AGENT_COLLECT_BENCHMARK_METRICS_ITERATIONS || raw.checksum_u32 !== AGENT_COLLECT_BENCHMARK_METRICS_EXPECTED_CHECKSUM ||
    raw.timer_source !== 'process.hrtime.bigint' || raw.exit_status !== 0 || raw.stderr_empty !== true || raw.network_mode !== 'none' ||
    raw.repository_code_execution !== false || raw.host_telemetry_read !== false || raw.container_absent_after_cleanup !== true
  ) fail('benchmark effect observation widened beyond the reviewed adapter mapping');
  if (!Number.isSafeInteger(raw.elapsed_ns) || raw.elapsed_ns < 1 || raw.elapsed_ns > AGENT_COLLECT_BENCHMARK_METRICS_MAX_ELAPSED_NS) fail('benchmark elapsed_ns is invalid');
  if (typeof raw.metrics_output !== 'string' || Buffer.byteLength(raw.metrics_output, 'utf8') < 1 || Buffer.byteLength(raw.metrics_output, 'utf8') > AGENT_COLLECT_BENCHMARK_METRICS_MAX_OUTPUT_BYTES) fail('benchmark metrics output is invalid');
  if (raw.output_bytes !== Buffer.byteLength(raw.metrics_output, 'utf8') || raw.output_sha256 !== sha256(raw.metrics_output)) fail('benchmark output digest/size mismatch');
  let output;
  try { output = JSON.parse(raw.metrics_output); } catch { fail('benchmark metrics output is not JSON'); }
  exact(output, METRIC_KEYS, 'benchmark metrics output');
  if (
    output.benchmark_policy_id !== AGENT_COLLECT_BENCHMARK_METRICS_POLICY_ID || output.workload_id !== AGENT_COLLECT_BENCHMARK_METRICS_WORKLOAD_ID ||
    output.iterations !== AGENT_COLLECT_BENCHMARK_METRICS_ITERATIONS || output.checksum_u32 !== AGENT_COLLECT_BENCHMARK_METRICS_EXPECTED_CHECKSUM ||
    output.timer_source !== 'process.hrtime.bigint' || output.elapsed_ns !== raw.elapsed_ns
  ) fail('benchmark metrics output metadata is invalid');
  const canonicalOutput = canonicalJson(output);
  if (raw.metrics_output !== canonicalOutput) fail('benchmark metrics output must be canonical');
  return Object.freeze({ ...raw });
}

function receiptStatement(raw, { plan, admission, trustedAdmissionIssuerPublicKey, isolationReceipt, durableConsumeHeadReceipt, trustedDurableStorePublicKey }) {
  exact(raw, STATEMENT_KEYS, 'benchmark effect receipt statement');
  validateCollectBenchmarkMetricsEffectPlan(plan);
  const checkedAdmission = verifyAgentCollectBenchmarkMetricsEffectAdmission(admission, {
    trustedIssuerPublicKey: trustedAdmissionIssuerPublicKey, plan, expectedRevision: raw.revision, now: raw.started_at
  });
  const isolation = verifyAgentLinuxIsolationConformanceReceipt(isolationReceipt);
  if (isolation.revision !== raw.revision) fail('benchmark isolation receipt revision mismatch');
  const consumedHead = verifyAgentExecutorDurableStateReceipt(durableConsumeHeadReceipt, {
    trustedStorePublicKey: trustedDurableStorePublicKey, plan, expectedStoreId: raw.durable_store_id
  });
  if (
    consumedHead.statement.lifecycle_status !== 'consumed' || consumedHead.statement.generation !== raw.durable_consume_generation ||
    consumedHead.statement.record_digest !== raw.durable_consume_record_digest || consumedHead.receipt_digest !== raw.durable_consume_head_receipt_digest ||
    consumedHead.statement.plan_digest !== raw.plan_digest || consumedHead.statement.authorization_digest !== raw.authorization_digest
  ) fail('benchmark consumed-head receipt does not bind the exact pre-effect durable state');
  const observation = normalizeObservation(raw.observation);
  if (
    raw.executor_id !== AGENT_COLLECT_BENCHMARK_METRICS_EFFECT_EXECUTOR_ID || raw.executor_version !== 1 ||
    raw.policy_digest !== AGENT_COLLECT_BENCHMARK_METRICS_EFFECT_POLICY_DIGEST || raw.repository !== 'Zoverions/AXIOM-MESH' ||
    raw.admission_digest !== checkedAdmission.admission_digest || raw.plan_digest !== plan.plan_digest ||
    raw.authorization_id !== plan.bindings.authorization_id || raw.authorization_digest !== plan.bindings.authorization_digest ||
    raw.sponsor_id !== plan.bindings.sponsor_id || raw.subject_id !== plan.bindings.subject_id ||
    raw.lifecycle_ledger_id !== plan.bindings.lifecycle_ledger_id || raw.lifecycle_key_id !== plan.bindings.lifecycle_key_id ||
    raw.isolation_receipt_digest !== isolation.receipt_digest || raw.isolation_adapter_id !== AGENT_LINUX_ISOLATION_ADAPTER_ID ||
    raw.image_id !== isolation.adapter.image_id || !IMAGE_ID.test(raw.image_id) || raw.operation_id !== AGENT_COLLECT_BENCHMARK_METRICS_EFFECT_OPERATION ||
    raw.benchmark_policy_id !== AGENT_COLLECT_BENCHMARK_METRICS_POLICY_ID || raw.workload_id !== AGENT_COLLECT_BENCHMARK_METRICS_WORKLOAD_ID ||
    raw.adapter_script_sha256 !== AGENT_COLLECT_BENCHMARK_METRICS_ADAPTER_SCRIPT_SHA256
  ) fail('benchmark effect receipt binding is invalid');
  [raw.executor_key_id, raw.lifecycle_pre_effect_head_digest, raw.lifecycle_consumption_event_digest, raw.lifecycle_final_head_digest,
    raw.lifecycle_final_receipt_digest, raw.durable_consume_record_digest, raw.durable_consume_head_receipt_digest, raw.durable_final_record_digest]
    .forEach((value, index) => digest(value, `benchmark receipt digest field ${index}`));
  id(raw.durable_store_id, 'benchmark durable_store_id');
  if (!Number.isSafeInteger(raw.durable_consume_generation) || raw.durable_consume_generation < 2 || !Number.isSafeInteger(raw.durable_final_generation) || raw.durable_final_generation <= raw.durable_consume_generation) fail('benchmark durable generations are invalid');
  time(raw.started_at, 'benchmark started_at');
  time(raw.finished_at, 'benchmark finished_at');
  if (Date.parse(raw.finished_at) < Date.parse(raw.started_at)) fail('benchmark receipt time order is invalid');
  const exactClaims = {
    cleanup_verified: true, revocation_state: 'active', known_signed_head_only: true, global_currentness_claimed: false,
    dry_run_plan_effect_reachable: false, laboratory_effect_admission_observed: true, durable_consumption_before_effect_observed: true,
    real_process_effect_observed: true, synthetic_workload_observed: true, monotonic_timer_observed: true,
    host_telemetry_observed: false, machine_comparison_score_claimed: false, production_slo_claimed: false,
    arbitrary_benchmark_used: false, repository_code_executed: false, repository_workspace_mutated: false, network_performed: false,
    credentials_retrieved: false, secrets_retrieved: false, service_controlled: false, package_installed: false,
    remote_execution_enabled: false, remote_hardware_accessed: false, production_enrollment: false, deployment_authority: false,
    capability_promoted: false, task_success_claimed: false, general_executor_available: false, axiom_authority_granted: false
  };
  for (const [name, expected] of Object.entries(exactClaims)) if (raw[name] !== expected) fail(`benchmark effect receipt attempts to elevate ${name}`);
  return Object.freeze({ ...raw, observation });
}

export function verifyAgentCollectBenchmarkMetricsEffectReceipt(raw, {
  trustedExecutorPublicKey, trustedAdmissionIssuerPublicKey, trustedDurableStorePublicKey, durableConsumeHeadReceipt,
  plan, admission, isolationConformanceReceipt
} = {}) {
  exact(raw, RECEIPT_KEYS, 'benchmark effect receipt');
  if (raw.schema !== AGENT_COLLECT_BENCHMARK_METRICS_EFFECT_RECEIPT_SCHEMA) fail('benchmark effect receipt schema is invalid');
  const pk = key(trustedExecutorPublicKey, 'public', 'benchmark trusted executor key');
  const statement = receiptStatement(raw.statement, {
    plan, admission, trustedAdmissionIssuerPublicKey, isolationReceipt: isolationConformanceReceipt,
    durableConsumeHeadReceipt, trustedDurableStorePublicKey
  });
  if (statement.executor_key_id !== keyId(pk)) fail('benchmark effect receipt executor key mismatch');
  const statementDigest = digestObject(statement);
  if (raw.statement_digest !== statementDigest || typeof raw.executor_signature !== 'string' || !BASE64URL.test(raw.executor_signature) || raw.executor_signature.length > 256) fail('benchmark effect receipt digest/signature shape is invalid');
  const payload = canonicalJson({ schema: AGENT_COLLECT_BENCHMARK_METRICS_EFFECT_RECEIPT_SCHEMA, statement, statement_digest: statementDigest });
  if (!verify(null, Buffer.from(payload, 'utf8'), pk, Buffer.from(raw.executor_signature, 'base64url'))) fail('benchmark effect receipt signature verification failed');
  const candidate = { schema: raw.schema, statement, statement_digest: statementDigest, executor_signature: raw.executor_signature };
  const receiptDigest = digestObject(candidate);
  if (raw.receipt_digest !== receiptDigest) fail('benchmark effect receipt digest mismatch');
  return Object.freeze({ ...candidate, receipt_digest: receiptDigest });
}

export class AgentCollectBenchmarkMetricsEffectController {
  constructor({ durableStore, executorPrivateKey, admission, trustedAdmissionIssuerPublicKey, isolationConformanceReceipt, revision }) {
    if (!(durableStore instanceof AgentExecutorDurableStateStore)) fail('benchmark effect controller requires durable state store');
    validateCollectBenchmarkMetricsEffectPlan(durableStore.plan);
    if (!durableStore.canResume) fail(`benchmark effect controller cannot resume ${durableStore.recoveryClassification}`);
    const isolation = verifyAgentLinuxIsolationConformanceReceipt(isolationConformanceReceipt);
    if (isolation.revision !== revision) fail('benchmark effect controller isolation revision mismatch');
    this.store = durableStore;
    this.plan = durableStore.plan;
    this.revision = revision;
    this.isolation = isolation;
    this.admission = verifyAgentCollectBenchmarkMetricsEffectAdmission(admission, {
      trustedIssuerPublicKey: trustedAdmissionIssuerPublicKey, plan: this.plan, expectedRevision: revision, now: admission.statement.not_before
    });
    this.sk = key(executorPrivateKey, 'private', 'benchmark executor key');
    this.pk = createPublicKey(this.sk);
    this.startedAt = null;
    this.preHead = null;
    this.consumeDigest = null;
    this.consumeGeneration = null;
    this.consumeRecordDigest = null;
    this.consumeHeadReceipt = null;
  }

  get executorPublicKey() { return this.pk.export({ type: 'spki', format: 'pem' }).toString(); }

  descriptor() {
    return Object.freeze({
      operation_id: AGENT_COLLECT_BENCHMARK_METRICS_EFFECT_OPERATION,
      benchmark_policy_id: AGENT_COLLECT_BENCHMARK_METRICS_POLICY_ID,
      workload_id: AGENT_COLLECT_BENCHMARK_METRICS_WORKLOAD_ID,
      network_mode: 'none', repository_mount_allowed: false, host_telemetry_allowed: false,
      adapter_script_sha256: AGENT_COLLECT_BENCHMARK_METRICS_ADAPTER_SCRIPT_SHA256,
      absolute_executable: AGENT_LINUX_ISOLATION_ENTRYPOINT,
      iterations: AGENT_COLLECT_BENCHMARK_METRICS_ITERATIONS,
      expected_checksum_u32: AGENT_COLLECT_BENCHMARK_METRICS_EXPECTED_CHECKSUM,
      max_elapsed_ns: AGENT_COLLECT_BENCHMARK_METRICS_MAX_ELAPSED_NS,
      max_output_bytes: AGENT_COLLECT_BENCHMARK_METRICS_MAX_OUTPUT_BYTES
    });
  }

  begin({ currentLifecycleTranscript, currentLifecycleReceipt, trustedLifecyclePublicKey, revocationState, occurredAt }) {
    if (this.startedAt) fail('benchmark effect controller already consumed authorization');
    if (revocationState !== 'active') fail('benchmark effect requires known-active revocation state');
    const at = time(occurredAt, 'benchmark effect begin time');
    if (Date.parse(at) < Date.parse(this.admission.statement.not_before) || Date.parse(at) >= Date.parse(this.admission.statement.expires_at)) fail('benchmark effect admission is not active at consume time');
    const current = verifyCurrentHead({ plan: this.plan, store: this.store, transcript: currentLifecycleTranscript, receipt: currentLifecycleReceipt, trustedLifecyclePublicKey });
    this.preHead = current.tx.head_event_digest;
    const transition = this.store.consume({ eventId: `collect-benchmark-metrics-consume:${this.plan.plan_digest.slice(0, 24)}`, occurredAt: at, revocationState: 'active' });
    this.startedAt = at;
    this.consumeDigest = transition.result.event.event_digest;
    this.consumeGeneration = transition.record.statement.generation;
    this.consumeRecordDigest = transition.record.record_digest;
    this.consumeHeadReceipt = this.store.headReceipt({ generatedAt: at });
    const checkedConsumedHead = verifyAgentExecutorDurableStateReceipt(this.consumeHeadReceipt, {
      trustedStorePublicKey: this.store.storePublicKey, plan: this.plan, expectedStoreId: this.store.storeId
    });
    if (checkedConsumedHead.statement.lifecycle_status !== 'consumed' || checkedConsumedHead.statement.generation !== this.consumeGeneration || checkedConsumedHead.statement.record_digest !== this.consumeRecordDigest) fail('benchmark consumed-head receipt does not match the committed consume generation');
    return Object.freeze({ ...this.descriptor(), durable_consume_head_receipt: this.consumeHeadReceipt });
  }

  interrupt({ occurredAt, reasonCode = 'collect-benchmark-metrics-effect-interrupted' }) {
    if (!this.startedAt) fail('benchmark effect cannot interrupt before durable consumption');
    if (this.store.status !== 'consumed') return this.store.currentRecord;
    return this.store.interrupt({ eventId: `collect-benchmark-metrics-interrupt:${this.plan.plan_digest.slice(0, 24)}`, occurredAt, reasonCode }).record;
  }

  complete({ observation, finishedAt }) {
    if (!this.startedAt || this.store.status !== 'consumed') fail('benchmark effect cannot complete without consumed durable authority');
    if (!this.consumeHeadReceipt) fail('benchmark effect cannot complete without signed consumed-head evidence');
    const normalized = normalizeObservation(observation);
    const at = time(finishedAt, 'benchmark effect finish time');
    const transition = this.store.complete({ eventId: `collect-benchmark-metrics-complete:${this.plan.plan_digest.slice(0, 24)}`, occurredAt: at });
    const finalRecord = transition.record;
    const statement = Object.freeze({
      executor_id: AGENT_COLLECT_BENCHMARK_METRICS_EFFECT_EXECUTOR_ID, executor_key_id: keyId(this.pk), executor_version: 1,
      policy_digest: AGENT_COLLECT_BENCHMARK_METRICS_EFFECT_POLICY_DIGEST, repository: 'Zoverions/AXIOM-MESH', revision: this.revision,
      admission_digest: this.admission.admission_digest, plan_digest: this.plan.plan_digest,
      authorization_id: this.plan.bindings.authorization_id, authorization_digest: this.plan.bindings.authorization_digest,
      sponsor_id: this.plan.bindings.sponsor_id, subject_id: this.plan.bindings.subject_id,
      lifecycle_ledger_id: this.plan.bindings.lifecycle_ledger_id, lifecycle_key_id: this.plan.bindings.lifecycle_key_id,
      lifecycle_pre_effect_head_digest: this.preHead, lifecycle_consumption_event_digest: this.consumeDigest,
      lifecycle_final_head_digest: finalRecord.statement.lifecycle_head_event_digest,
      lifecycle_final_receipt_digest: finalRecord.payload.lifecycle_receipt.receipt_digest,
      durable_store_id: this.store.storeId, durable_consume_generation: this.consumeGeneration,
      durable_consume_record_digest: this.consumeRecordDigest, durable_consume_head_receipt_digest: this.consumeHeadReceipt.receipt_digest,
      durable_final_generation: finalRecord.statement.generation, durable_final_record_digest: finalRecord.record_digest,
      isolation_receipt_digest: this.isolation.receipt_digest, isolation_adapter_id: AGENT_LINUX_ISOLATION_ADAPTER_ID,
      image_id: this.isolation.adapter.image_id, operation_id: AGENT_COLLECT_BENCHMARK_METRICS_EFFECT_OPERATION,
      benchmark_policy_id: AGENT_COLLECT_BENCHMARK_METRICS_POLICY_ID, workload_id: AGENT_COLLECT_BENCHMARK_METRICS_WORKLOAD_ID,
      adapter_script_sha256: AGENT_COLLECT_BENCHMARK_METRICS_ADAPTER_SCRIPT_SHA256,
      started_at: this.startedAt, finished_at: at, observation: normalized,
      cleanup_verified: true, revocation_state: 'active', known_signed_head_only: true, global_currentness_claimed: false,
      dry_run_plan_effect_reachable: false, laboratory_effect_admission_observed: true,
      durable_consumption_before_effect_observed: true, real_process_effect_observed: true,
      synthetic_workload_observed: true, monotonic_timer_observed: true, host_telemetry_observed: false,
      machine_comparison_score_claimed: false, production_slo_claimed: false, arbitrary_benchmark_used: false,
      repository_code_executed: false, repository_workspace_mutated: false, network_performed: false,
      credentials_retrieved: false, secrets_retrieved: false, service_controlled: false, package_installed: false,
      remote_execution_enabled: false, remote_hardware_accessed: false, production_enrollment: false,
      deployment_authority: false, capability_promoted: false, task_success_claimed: false,
      general_executor_available: false, axiom_authority_granted: false
    });
    const statementDigest = digestObject(statement);
    const payload = canonicalJson({ schema: AGENT_COLLECT_BENCHMARK_METRICS_EFFECT_RECEIPT_SCHEMA, statement, statement_digest: statementDigest });
    const candidate = { schema: AGENT_COLLECT_BENCHMARK_METRICS_EFFECT_RECEIPT_SCHEMA, statement, statement_digest: statementDigest, executor_signature: sign(null, Buffer.from(payload, 'utf8'), this.sk).toString('base64url') };
    return Object.freeze({ ...candidate, receipt_digest: digestObject(candidate) });
  }
}
