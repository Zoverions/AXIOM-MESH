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
  AGENT_COLLECT_SANITIZED_LOGS_EFFECT_OPERATION,
  AGENT_COLLECT_SANITIZED_LOGS_SANITIZATION_POLICY_ID,
  validateCollectSanitizedLogsEffectPlan,
  verifyAgentCollectSanitizedLogsEffectAdmission
} from './agent-collect-sanitized-logs-effect-admission.mjs';

export const AGENT_COLLECT_SANITIZED_LOGS_EFFECT_RECEIPT_SCHEMA = 'axiom-agent-collect-sanitized-logs-effect-receipt.v1';
export const AGENT_COLLECT_SANITIZED_LOGS_EFFECT_EXECUTOR_ID = 'agent-commons.linux-collect-sanitized-logs-effect';
export const AGENT_COLLECT_SANITIZED_LOGS_EFFECT_EXECUTOR_VERSION = 1;
export const AGENT_COLLECT_SANITIZED_LOGS_SOURCE_LOGICAL_PATH = 'work/session/logs/lab.jsonl';
export const AGENT_COLLECT_SANITIZED_LOGS_MAX_SOURCE_BYTES = 8192;
export const AGENT_COLLECT_SANITIZED_LOGS_MAX_RECORDS = 16;
export const AGENT_COLLECT_SANITIZED_LOGS_MAX_OUTPUT_BYTES = 4096;
export const AGENT_COLLECT_SANITIZED_LOGS_FORBIDDEN_SENTINEL = 'AXIOM_FORBIDDEN_LOG_SENTINEL_7f3e2d';
export const AGENT_COLLECT_SANITIZED_LOGS_EXPECTED_RECORDS = Object.freeze([
  Object.freeze({ timestamp: '2026-08-18T00:00:00.000Z', level: 'info', component: 'lab.collector', event_code: 'fixture.created', message_code: 'log.ready' }),
  Object.freeze({ timestamp: '2026-08-18T00:00:01.000Z', level: 'warn', component: 'lab.collector', event_code: 'fixture.warning', message_code: 'bounded.warning' }),
  Object.freeze({ timestamp: '2026-08-18T00:00:02.000Z', level: 'error', component: 'lab.collector', event_code: 'fixture.error', message_code: 'bounded.error' })
]);

export const AGENT_COLLECT_SANITIZED_LOGS_ADAPTER_SCRIPT = String.raw`import fs from 'node:fs';
const ROOT='/work/session';
const DIR=ROOT+'/logs';
const FILE=DIR+'/lab.jsonl';
const SENTINEL='AXIOM_FORBIDDEN_LOG_SENTINEL_7f3e2d';
const MAX_BYTES=8192;
const MAX_RECORDS=16;
const levels=new Set(['info','warn','error']);
const token=/^[A-Za-z0-9_.:-]{1,80}$/;
const stable=value=>{if(Array.isArray(value))return value.map(stable);if(value&&typeof value==='object'){const out={};for(const key of Object.keys(value).sort())out[key]=stable(value[key]);return out;}return value;};
const fixtures=[
 {timestamp:'2026-08-18T00:00:00.000Z',level:'info',component:'lab.collector',event_code:'fixture.created',message_code:'log.ready',message:SENTINEL,token:'secret-token-value',path:'/etc/shadow'},
 {timestamp:'2026-08-18T00:00:01.000Z',level:'warn',component:'lab.collector',event_code:'fixture.warning',message_code:'bounded.warning',stack:SENTINEL,hostname:'private-host'},
 {timestamp:'2026-08-18T00:00:02.000Z',level:'error',component:'lab.collector',event_code:'fixture.error',message_code:'bounded.error',url:'https://secret.invalid/'+SENTINEL,command_line:'node --secret'}
];
fs.mkdirSync(DIR,{recursive:true,mode:0o700});
const raw=fixtures.map(value=>JSON.stringify(value)).join('\n')+'\n';
const rawBytes=Buffer.byteLength(raw,'utf8');
if(rawBytes<1||rawBytes>MAX_BYTES)throw new Error('source-byte-ceiling');
fs.writeFileSync(FILE,raw,{encoding:'utf8',mode:0o600,flag:'wx'});
const lst=fs.lstatSync(FILE);
if(!lst.isFile()||lst.isSymbolicLink())throw new Error('source-file-type');
if(typeof fs.constants.O_NOFOLLOW!=='number'||fs.constants.O_NOFOLLOW===0)throw new Error('nofollow-unavailable');
const fd=fs.openSync(FILE,fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW);
let text;
try{
 const st=fs.fstatSync(fd);
 if(!st.isFile()||st.size<1||st.size>MAX_BYTES)throw new Error('source-size');
 const buffer=Buffer.alloc(st.size);
 let offset=0;
 while(offset<buffer.length){const n=fs.readSync(fd,buffer,offset,buffer.length-offset,null);if(n<=0)break;offset+=n;}
 if(offset!==buffer.length)throw new Error('short-read');
 text=buffer.toString('utf8');
}finally{fs.closeSync(fd);}
const lines=text.split('\n').filter(Boolean);
if(lines.length<1||lines.length>MAX_RECORDS)throw new Error('record-ceiling');
const records=lines.map(line=>{
 if(Buffer.byteLength(line,'utf8')>2048)throw new Error('record-size');
 let value;try{value=JSON.parse(line);}catch{throw new Error('malformed-jsonl');}
 if(!value||Array.isArray(value)||typeof value!=='object')throw new Error('record-shape');
 const timestamp=new Date(value.timestamp);
 if(typeof value.timestamp!=='string'||Number.isNaN(timestamp.getTime())||timestamp.toISOString()!==value.timestamp)throw new Error('timestamp');
 if(!levels.has(value.level))throw new Error('level');
 for(const key of ['component','event_code','message_code'])if(typeof value[key]!=='string'||!token.test(value[key]))throw new Error('token-'+key);
 return {timestamp:value.timestamp,level:value.level,component:value.component,event_code:value.event_code,message_code:value.message_code};
});
const result={sanitization_policy_id:'synthetic-jsonl-allowlist-v1',source_record_count:lines.length,source_bytes:Buffer.byteLength(text,'utf8'),records};
const output=JSON.stringify(stable(result));
for(const forbidden of [SENTINEL,'secret-token-value','/etc/shadow','private-host','secret.invalid','command_line','node --secret'])if(output.includes(forbidden))throw new Error('sanitization-failed');
if(Buffer.byteLength(output,'utf8')>4096)throw new Error('output-ceiling');
process.stdout.write(output);`;

export const AGENT_COLLECT_SANITIZED_LOGS_ADAPTER_SCRIPT_SHA256 = sha256(AGENT_COLLECT_SANITIZED_LOGS_ADAPTER_SCRIPT);

const ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/;
const SHA256 = /^[a-f0-9]{64}$/;
const BASE64URL = /^[A-Za-z0-9_-]+$/;
const IMAGE_ID = /^sha256:[a-f0-9]{64}$/;
const TOKEN = /^[A-Za-z0-9_.:-]{1,80}$/;
const LEVELS = new Set(['info', 'warn', 'error']);
const RECEIPT_KEYS = new Set(['schema', 'statement', 'statement_digest', 'executor_signature', 'receipt_digest']);
const STATEMENT_KEYS = new Set([
  'executor_id','executor_key_id','executor_version','policy_digest','repository','revision','admission_digest','plan_digest',
  'authorization_id','authorization_digest','sponsor_id','subject_id','lifecycle_ledger_id','lifecycle_key_id',
  'lifecycle_pre_effect_head_digest','lifecycle_consumption_event_digest','lifecycle_final_head_digest','lifecycle_final_receipt_digest',
  'durable_store_id','durable_consume_generation','durable_consume_record_digest','durable_consume_head_receipt_digest',
  'durable_final_generation','durable_final_record_digest','isolation_receipt_digest','isolation_adapter_id','image_id','operation_id',
  'sanitization_policy_id','adapter_script_sha256','source_logical_path','started_at','finished_at','observation','cleanup_verified',
  'revocation_state','known_signed_head_only','global_currentness_claimed','dry_run_plan_effect_reachable',
  'laboratory_effect_admission_observed','durable_consumption_before_effect_observed','real_process_effect_observed',
  'disposable_filesystem_write_observed','disposable_filesystem_read_observed','sanitization_allowlist_observed',
  'arbitrary_path_used','host_or_repository_logs_read','repository_code_executed','repository_workspace_mutated','network_performed',
  'credentials_retrieved','secrets_retrieved','service_controlled','package_installed','remote_execution_enabled','remote_hardware_accessed',
  'production_enrollment','deployment_authority','capability_promoted','task_success_claimed','general_executor_available','axiom_authority_granted'
]);
const OBSERVATION_KEYS = new Set([
  'adapter_script_sha256','source_logical_path','source_record_count','source_bytes','sanitized_record_count','sanitized_output',
  'output_sha256','output_bytes','source_open_nofollow','source_regular_file','source_inside_disposable_workspace',
  'forbidden_sentinel_absent','exit_status','stderr_empty','network_mode','repository_code_execution','container_absent_after_cleanup'
]);
const SANITIZED_OUTPUT_KEYS = new Set(['sanitization_policy_id', 'source_record_count', 'source_bytes', 'records']);
const SANITIZED_RECORD_KEYS = new Set(['timestamp', 'level', 'component', 'event_code', 'message_code']);

export const AGENT_COLLECT_SANITIZED_LOGS_EFFECT_POLICY = Object.freeze({
  schema: 'axiom-agent-collect-sanitized-logs-effect-policy.v1',
  executor_id: AGENT_COLLECT_SANITIZED_LOGS_EFFECT_EXECUTOR_ID,
  executor_version: AGENT_COLLECT_SANITIZED_LOGS_EFFECT_EXECUTOR_VERSION,
  operation_id: AGENT_COLLECT_SANITIZED_LOGS_EFFECT_OPERATION,
  sanitization_policy_id: AGENT_COLLECT_SANITIZED_LOGS_SANITIZATION_POLICY_ID,
  isolation_adapter_id: AGENT_LINUX_ISOLATION_ADAPTER_ID,
  source_logical_path: AGENT_COLLECT_SANITIZED_LOGS_SOURCE_LOGICAL_PATH,
  adapter_script_sha256: AGENT_COLLECT_SANITIZED_LOGS_ADAPTER_SCRIPT_SHA256,
  max_source_bytes: AGENT_COLLECT_SANITIZED_LOGS_MAX_SOURCE_BYTES,
  max_records: AGENT_COLLECT_SANITIZED_LOGS_MAX_RECORDS,
  max_output_bytes: AGENT_COLLECT_SANITIZED_LOGS_MAX_OUTPUT_BYTES,
  durable_consume_before_effect: true,
  signed_consumed_head_before_effect: true,
  arbitrary_path_allowed: false,
  host_or_repository_log_read_allowed: false,
  symlink_following_allowed: false,
  network_mode: 'none',
  arbitrary_command_allowed: false,
  shell_allowed: false,
  repository_code_execution_allowed: false,
  credentials_allowed: false,
  secrets_allowed: false,
  remote_hardware_allowed: false,
  production_authority: false
});
export const AGENT_COLLECT_SANITIZED_LOGS_EFFECT_POLICY_DIGEST = digestObject(AGENT_COLLECT_SANITIZED_LOGS_EFFECT_POLICY);

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
function sameRecord(actual, expected) {
  return actual.timestamp === expected.timestamp && actual.level === expected.level && actual.component === expected.component &&
    actual.event_code === expected.event_code && actual.message_code === expected.message_code;
}

function verifyCurrentHead({ plan, store, transcript, receipt, trustedLifecyclePublicKey }) {
  const tx = verifyAgentTestSessionLifecycleTranscript(transcript, { trustedLedgerPublicKey: trustedLifecyclePublicKey });
  const headReceipt = verifyAgentTestSessionLifecycleReceipt(receipt, { trustedLedgerPublicKey: trustedLifecyclePublicKey, transcript });
  if (tx.status !== 'issued' || tx.terminal || headReceipt.statement.status !== 'issued') fail('sanitized-log effect current lifecycle must be issued');
  if (
    tx.authorization_id !== plan.bindings.authorization_id || tx.authorization_digest !== plan.bindings.authorization_digest ||
    tx.ledger_id !== plan.bindings.lifecycle_ledger_id || tx.ledger_key_id !== plan.bindings.lifecycle_key_id ||
    headReceipt.statement.authorization_id !== plan.bindings.authorization_id || headReceipt.statement.authorization_digest !== plan.bindings.authorization_digest
  ) fail('sanitized-log effect current lifecycle does not bind the exact plan');
  const durable = store.currentRecord;
  if (
    store.status !== 'issued' || durable.statement.lifecycle_head_event_digest !== tx.head_event_digest ||
    durable.statement.lifecycle_receipt_digest !== headReceipt.receipt_digest ||
    digestObject(durable.payload.lifecycle_transcript) !== digestObject(transcript) ||
    digestObject(durable.payload.lifecycle_receipt) !== digestObject(receipt)
  ) fail('sanitized-log durable state does not match the supplied current signed head');
  return { tx, headReceipt };
}

function normalizeSanitizedRecord(value, index) {
  exact(value, SANITIZED_RECORD_KEYS, `sanitized-log output record ${index}`);
  const parsed = new Date(value.timestamp);
  if (typeof value.timestamp !== 'string' || Number.isNaN(parsed.getTime()) || parsed.toISOString() !== value.timestamp) fail('sanitized-log record timestamp is invalid');
  if (!LEVELS.has(value.level)) fail('sanitized-log record level is invalid');
  for (const field of ['component', 'event_code', 'message_code']) if (typeof value[field] !== 'string' || !TOKEN.test(value[field])) fail(`sanitized-log record ${field} is invalid`);
  return Object.freeze({ timestamp: value.timestamp, level: value.level, component: value.component, event_code: value.event_code, message_code: value.message_code });
}

function normalizeObservation(raw) {
  exact(raw, OBSERVATION_KEYS, 'sanitized-log effect observation');
  if (
    raw.adapter_script_sha256 !== AGENT_COLLECT_SANITIZED_LOGS_ADAPTER_SCRIPT_SHA256 || raw.source_logical_path !== AGENT_COLLECT_SANITIZED_LOGS_SOURCE_LOGICAL_PATH ||
    raw.source_open_nofollow !== true || raw.source_regular_file !== true || raw.source_inside_disposable_workspace !== true ||
    raw.forbidden_sentinel_absent !== true || raw.exit_status !== 0 || raw.stderr_empty !== true || raw.network_mode !== 'none' ||
    raw.repository_code_execution !== false || raw.container_absent_after_cleanup !== true
  ) fail('sanitized-log effect observation widened beyond the reviewed adapter mapping');
  if (!Number.isSafeInteger(raw.source_record_count) || raw.source_record_count < 1 || raw.source_record_count > AGENT_COLLECT_SANITIZED_LOGS_MAX_RECORDS) fail('sanitized-log source record count is invalid');
  if (!Number.isSafeInteger(raw.source_bytes) || raw.source_bytes < 1 || raw.source_bytes > AGENT_COLLECT_SANITIZED_LOGS_MAX_SOURCE_BYTES) fail('sanitized-log source byte count is invalid');
  if (!Number.isSafeInteger(raw.sanitized_record_count) || raw.sanitized_record_count !== raw.source_record_count) fail('sanitized-log sanitized record count mismatch');
  if (typeof raw.sanitized_output !== 'string' || Buffer.byteLength(raw.sanitized_output, 'utf8') < 1 || Buffer.byteLength(raw.sanitized_output, 'utf8') > AGENT_COLLECT_SANITIZED_LOGS_MAX_OUTPUT_BYTES) fail('sanitized-log output is invalid');
  if (raw.output_bytes !== Buffer.byteLength(raw.sanitized_output, 'utf8') || raw.output_sha256 !== sha256(raw.sanitized_output)) fail('sanitized-log output digest/size mismatch');
  for (const forbidden of [AGENT_COLLECT_SANITIZED_LOGS_FORBIDDEN_SENTINEL, 'secret-token-value', '/etc/shadow', 'private-host', 'secret.invalid', 'command_line', 'node --secret']) {
    if (raw.sanitized_output.includes(forbidden)) fail('sanitized-log forbidden fixture material survived sanitization');
  }
  let output;
  try { output = JSON.parse(raw.sanitized_output); } catch { fail('sanitized-log output is not JSON'); }
  exact(output, SANITIZED_OUTPUT_KEYS, 'sanitized-log output');
  if (
    output.sanitization_policy_id !== AGENT_COLLECT_SANITIZED_LOGS_SANITIZATION_POLICY_ID ||
    output.source_record_count !== raw.source_record_count || output.source_bytes !== raw.source_bytes ||
    !Array.isArray(output.records) || output.records.length !== raw.sanitized_record_count ||
    output.records.length !== AGENT_COLLECT_SANITIZED_LOGS_EXPECTED_RECORDS.length
  ) fail('sanitized-log output metadata is invalid');
  const records = output.records.map(normalizeSanitizedRecord);
  if (records.some((record, index) => !sameRecord(record, AGENT_COLLECT_SANITIZED_LOGS_EXPECTED_RECORDS[index]))) fail('sanitized-log output does not match the exact synthetic fixture projection');
  const canonicalOutput = canonicalJson({ sanitization_policy_id: output.sanitization_policy_id, source_record_count: output.source_record_count, source_bytes: output.source_bytes, records });
  if (raw.sanitized_output !== canonicalOutput) fail('sanitized-log output must be canonical and allowlist-only');
  return Object.freeze({ ...raw });
}

function receiptStatement(raw, { plan, admission, trustedAdmissionIssuerPublicKey, isolationReceipt, durableConsumeHeadReceipt, trustedDurableStorePublicKey }) {
  exact(raw, STATEMENT_KEYS, 'sanitized-log effect receipt statement');
  validateCollectSanitizedLogsEffectPlan(plan);
  const checkedAdmission = verifyAgentCollectSanitizedLogsEffectAdmission(admission, {
    trustedIssuerPublicKey: trustedAdmissionIssuerPublicKey, plan, expectedRevision: raw.revision, now: raw.started_at
  });
  const isolation = verifyAgentLinuxIsolationConformanceReceipt(isolationReceipt);
  if (isolation.revision !== raw.revision) fail('sanitized-log isolation receipt revision mismatch');
  const consumedHead = verifyAgentExecutorDurableStateReceipt(durableConsumeHeadReceipt, {
    trustedStorePublicKey: trustedDurableStorePublicKey, plan, expectedStoreId: raw.durable_store_id
  });
  if (
    consumedHead.statement.lifecycle_status !== 'consumed' || consumedHead.statement.generation !== raw.durable_consume_generation ||
    consumedHead.statement.record_digest !== raw.durable_consume_record_digest || consumedHead.receipt_digest !== raw.durable_consume_head_receipt_digest ||
    consumedHead.statement.plan_digest !== raw.plan_digest || consumedHead.statement.authorization_digest !== raw.authorization_digest
  ) fail('sanitized-log consumed-head receipt does not bind the exact pre-effect durable state');
  const observation = normalizeObservation(raw.observation);
  if (
    raw.executor_id !== AGENT_COLLECT_SANITIZED_LOGS_EFFECT_EXECUTOR_ID || raw.executor_version !== 1 ||
    raw.policy_digest !== AGENT_COLLECT_SANITIZED_LOGS_EFFECT_POLICY_DIGEST || raw.repository !== 'Zoverions/AXIOM-MESH' ||
    raw.admission_digest !== checkedAdmission.admission_digest || raw.plan_digest !== plan.plan_digest ||
    raw.authorization_id !== plan.bindings.authorization_id || raw.authorization_digest !== plan.bindings.authorization_digest ||
    raw.sponsor_id !== plan.bindings.sponsor_id || raw.subject_id !== plan.bindings.subject_id ||
    raw.lifecycle_ledger_id !== plan.bindings.lifecycle_ledger_id || raw.lifecycle_key_id !== plan.bindings.lifecycle_key_id ||
    raw.isolation_receipt_digest !== isolation.receipt_digest || raw.isolation_adapter_id !== AGENT_LINUX_ISOLATION_ADAPTER_ID ||
    raw.image_id !== isolation.adapter.image_id || !IMAGE_ID.test(raw.image_id) || raw.operation_id !== AGENT_COLLECT_SANITIZED_LOGS_EFFECT_OPERATION ||
    raw.sanitization_policy_id !== AGENT_COLLECT_SANITIZED_LOGS_SANITIZATION_POLICY_ID ||
    raw.adapter_script_sha256 !== AGENT_COLLECT_SANITIZED_LOGS_ADAPTER_SCRIPT_SHA256 || raw.source_logical_path !== AGENT_COLLECT_SANITIZED_LOGS_SOURCE_LOGICAL_PATH
  ) fail('sanitized-log effect receipt binding is invalid');
  [raw.executor_key_id, raw.lifecycle_pre_effect_head_digest, raw.lifecycle_consumption_event_digest, raw.lifecycle_final_head_digest,
    raw.lifecycle_final_receipt_digest, raw.durable_consume_record_digest, raw.durable_consume_head_receipt_digest, raw.durable_final_record_digest]
    .forEach((value, index) => digest(value, `sanitized-log receipt digest field ${index}`));
  id(raw.durable_store_id, 'sanitized-log durable_store_id');
  if (!Number.isSafeInteger(raw.durable_consume_generation) || raw.durable_consume_generation < 2 || !Number.isSafeInteger(raw.durable_final_generation) || raw.durable_final_generation <= raw.durable_consume_generation) fail('sanitized-log durable generations are invalid');
  time(raw.started_at, 'sanitized-log started_at');
  time(raw.finished_at, 'sanitized-log finished_at');
  if (Date.parse(raw.finished_at) < Date.parse(raw.started_at)) fail('sanitized-log receipt time order is invalid');
  const exactClaims = {
    cleanup_verified: true, revocation_state: 'active', known_signed_head_only: true, global_currentness_claimed: false,
    dry_run_plan_effect_reachable: false, laboratory_effect_admission_observed: true, durable_consumption_before_effect_observed: true,
    real_process_effect_observed: true, disposable_filesystem_write_observed: true, disposable_filesystem_read_observed: true,
    sanitization_allowlist_observed: true, arbitrary_path_used: false, host_or_repository_logs_read: false, repository_code_executed: false,
    repository_workspace_mutated: false, network_performed: false, credentials_retrieved: false, secrets_retrieved: false,
    service_controlled: false, package_installed: false, remote_execution_enabled: false, remote_hardware_accessed: false,
    production_enrollment: false, deployment_authority: false, capability_promoted: false, task_success_claimed: false,
    general_executor_available: false, axiom_authority_granted: false
  };
  for (const [name, expected] of Object.entries(exactClaims)) if (raw[name] !== expected) fail(`sanitized-log effect receipt attempts to elevate ${name}`);
  return Object.freeze({ ...raw, observation });
}

export function verifyAgentCollectSanitizedLogsEffectReceipt(raw, {
  trustedExecutorPublicKey, trustedAdmissionIssuerPublicKey, trustedDurableStorePublicKey, durableConsumeHeadReceipt,
  plan, admission, isolationConformanceReceipt
} = {}) {
  exact(raw, RECEIPT_KEYS, 'sanitized-log effect receipt');
  if (raw.schema !== AGENT_COLLECT_SANITIZED_LOGS_EFFECT_RECEIPT_SCHEMA) fail('sanitized-log effect receipt schema is invalid');
  const pk = key(trustedExecutorPublicKey, 'public', 'sanitized-log trusted executor key');
  const statement = receiptStatement(raw.statement, {
    plan, admission, trustedAdmissionIssuerPublicKey, isolationReceipt: isolationConformanceReceipt,
    durableConsumeHeadReceipt, trustedDurableStorePublicKey
  });
  if (statement.executor_key_id !== keyId(pk)) fail('sanitized-log effect receipt executor key mismatch');
  const statementDigest = digestObject(statement);
  if (raw.statement_digest !== statementDigest || typeof raw.executor_signature !== 'string' || !BASE64URL.test(raw.executor_signature) || raw.executor_signature.length > 256) fail('sanitized-log effect receipt digest/signature shape is invalid');
  const payload = canonicalJson({ schema: AGENT_COLLECT_SANITIZED_LOGS_EFFECT_RECEIPT_SCHEMA, statement, statement_digest: statementDigest });
  if (!verify(null, Buffer.from(payload, 'utf8'), pk, Buffer.from(raw.executor_signature, 'base64url'))) fail('sanitized-log effect receipt signature verification failed');
  const candidate = { schema: raw.schema, statement, statement_digest: statementDigest, executor_signature: raw.executor_signature };
  const receiptDigest = digestObject(candidate);
  if (raw.receipt_digest !== receiptDigest) fail('sanitized-log effect receipt digest mismatch');
  return Object.freeze({ ...candidate, receipt_digest: receiptDigest });
}

export class AgentCollectSanitizedLogsEffectController {
  constructor({ durableStore, executorPrivateKey, admission, trustedAdmissionIssuerPublicKey, isolationConformanceReceipt, revision }) {
    if (!(durableStore instanceof AgentExecutorDurableStateStore)) fail('sanitized-log effect controller requires durable state store');
    validateCollectSanitizedLogsEffectPlan(durableStore.plan);
    if (!durableStore.canResume) fail(`sanitized-log effect controller cannot resume ${durableStore.recoveryClassification}`);
    const isolation = verifyAgentLinuxIsolationConformanceReceipt(isolationConformanceReceipt);
    if (isolation.revision !== revision) fail('sanitized-log effect controller isolation revision mismatch');
    this.store = durableStore;
    this.plan = durableStore.plan;
    this.revision = revision;
    this.isolation = isolation;
    this.admission = verifyAgentCollectSanitizedLogsEffectAdmission(admission, {
      trustedIssuerPublicKey: trustedAdmissionIssuerPublicKey, plan: this.plan, expectedRevision: revision, now: admission.statement.not_before
    });
    this.sk = key(executorPrivateKey, 'private', 'sanitized-log executor key');
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
      operation_id: AGENT_COLLECT_SANITIZED_LOGS_EFFECT_OPERATION,
      sanitization_policy_id: AGENT_COLLECT_SANITIZED_LOGS_SANITIZATION_POLICY_ID,
      network_mode: 'none', repository_mount_allowed: false, host_log_mount_allowed: false,
      source_logical_path: AGENT_COLLECT_SANITIZED_LOGS_SOURCE_LOGICAL_PATH,
      adapter_script_sha256: AGENT_COLLECT_SANITIZED_LOGS_ADAPTER_SCRIPT_SHA256,
      absolute_executable: AGENT_LINUX_ISOLATION_ENTRYPOINT,
      max_source_bytes: AGENT_COLLECT_SANITIZED_LOGS_MAX_SOURCE_BYTES,
      max_records: AGENT_COLLECT_SANITIZED_LOGS_MAX_RECORDS,
      max_output_bytes: AGENT_COLLECT_SANITIZED_LOGS_MAX_OUTPUT_BYTES
    });
  }

  begin({ currentLifecycleTranscript, currentLifecycleReceipt, trustedLifecyclePublicKey, revocationState, occurredAt }) {
    if (this.startedAt) fail('sanitized-log effect controller already consumed authorization');
    if (revocationState !== 'active') fail('sanitized-log effect requires known-active revocation state');
    const at = time(occurredAt, 'sanitized-log effect begin time');
    if (Date.parse(at) < Date.parse(this.admission.statement.not_before) || Date.parse(at) >= Date.parse(this.admission.statement.expires_at)) fail('sanitized-log effect admission is not active at consume time');
    const current = verifyCurrentHead({ plan: this.plan, store: this.store, transcript: currentLifecycleTranscript, receipt: currentLifecycleReceipt, trustedLifecyclePublicKey });
    this.preHead = current.tx.head_event_digest;
    const transition = this.store.consume({ eventId: `collect-sanitized-logs-consume:${this.plan.plan_digest.slice(0, 24)}`, occurredAt: at, revocationState: 'active' });
    this.startedAt = at;
    this.consumeDigest = transition.result.event.event_digest;
    this.consumeGeneration = transition.record.statement.generation;
    this.consumeRecordDigest = transition.record.record_digest;
    this.consumeHeadReceipt = this.store.headReceipt({ generatedAt: at });
    const checkedConsumedHead = verifyAgentExecutorDurableStateReceipt(this.consumeHeadReceipt, {
      trustedStorePublicKey: this.store.storePublicKey, plan: this.plan, expectedStoreId: this.store.storeId
    });
    if (checkedConsumedHead.statement.lifecycle_status !== 'consumed' || checkedConsumedHead.statement.generation !== this.consumeGeneration || checkedConsumedHead.statement.record_digest !== this.consumeRecordDigest) fail('sanitized-log consumed-head receipt does not match the committed consume generation');
    return Object.freeze({ ...this.descriptor(), durable_consume_head_receipt: this.consumeHeadReceipt });
  }

  interrupt({ occurredAt, reasonCode = 'collect-sanitized-logs-effect-interrupted' }) {
    if (!this.startedAt) fail('sanitized-log effect cannot interrupt before durable consumption');
    if (this.store.status !== 'consumed') return this.store.currentRecord;
    return this.store.interrupt({ eventId: `collect-sanitized-logs-interrupt:${this.plan.plan_digest.slice(0, 24)}`, occurredAt, reasonCode }).record;
  }

  complete({ observation, finishedAt }) {
    if (!this.startedAt || this.store.status !== 'consumed') fail('sanitized-log effect cannot complete without consumed durable authority');
    if (!this.consumeHeadReceipt) fail('sanitized-log effect cannot complete without signed consumed-head evidence');
    const normalized = normalizeObservation(observation);
    const at = time(finishedAt, 'sanitized-log effect finish time');
    const transition = this.store.complete({ eventId: `collect-sanitized-logs-complete:${this.plan.plan_digest.slice(0, 24)}`, occurredAt: at });
    const finalRecord = transition.record;
    const statement = Object.freeze({
      executor_id: AGENT_COLLECT_SANITIZED_LOGS_EFFECT_EXECUTOR_ID, executor_key_id: keyId(this.pk), executor_version: 1,
      policy_digest: AGENT_COLLECT_SANITIZED_LOGS_EFFECT_POLICY_DIGEST, repository: 'Zoverions/AXIOM-MESH', revision: this.revision,
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
      image_id: this.isolation.adapter.image_id, operation_id: AGENT_COLLECT_SANITIZED_LOGS_EFFECT_OPERATION,
      sanitization_policy_id: AGENT_COLLECT_SANITIZED_LOGS_SANITIZATION_POLICY_ID,
      adapter_script_sha256: AGENT_COLLECT_SANITIZED_LOGS_ADAPTER_SCRIPT_SHA256,
      source_logical_path: AGENT_COLLECT_SANITIZED_LOGS_SOURCE_LOGICAL_PATH,
      started_at: this.startedAt, finished_at: at, observation: normalized,
      cleanup_verified: true, revocation_state: 'active', known_signed_head_only: true, global_currentness_claimed: false,
      dry_run_plan_effect_reachable: false, laboratory_effect_admission_observed: true,
      durable_consumption_before_effect_observed: true, real_process_effect_observed: true,
      disposable_filesystem_write_observed: true, disposable_filesystem_read_observed: true, sanitization_allowlist_observed: true,
      arbitrary_path_used: false, host_or_repository_logs_read: false, repository_code_executed: false,
      repository_workspace_mutated: false, network_performed: false, credentials_retrieved: false, secrets_retrieved: false,
      service_controlled: false, package_installed: false, remote_execution_enabled: false, remote_hardware_accessed: false,
      production_enrollment: false, deployment_authority: false, capability_promoted: false, task_success_claimed: false,
      general_executor_available: false, axiom_authority_granted: false
    });
    const statementDigest = digestObject(statement);
    const payload = canonicalJson({ schema: AGENT_COLLECT_SANITIZED_LOGS_EFFECT_RECEIPT_SCHEMA, statement, statement_digest: statementDigest });
    const candidate = { schema: AGENT_COLLECT_SANITIZED_LOGS_EFFECT_RECEIPT_SCHEMA, statement, statement_digest: statementDigest, executor_signature: sign(null, Buffer.from(payload, 'utf8'), this.sk).toString('base64url') };
    return Object.freeze({ ...candidate, receipt_digest: digestObject(candidate) });
  }
}
