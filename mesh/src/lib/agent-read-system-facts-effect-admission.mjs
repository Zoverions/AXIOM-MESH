import { createPrivateKey, createPublicKey, sign, verify } from 'node:crypto';
import { ValidationError, canonicalJson, digestObject, sha256 } from './canonical.mjs';
import {
  AGENT_EXECUTOR_DRY_RUN_COMPILER_ID,
  AGENT_EXECUTOR_DRY_RUN_COMPILER_VERSION,
  AGENT_EXECUTOR_DRY_RUN_POLICY_DIGEST,
  validateAgentExecutorDryRunPlan
} from './agent-executor-dry-run.mjs';
import { AGENT_EXECUTOR_ISOLATION_POLICY_CATALOG_DIGEST } from './agent-executor-isolation-profile.mjs';
import { AGENT_LINUX_ISOLATION_ADAPTER_ID } from './agent-linux-isolation-conformance.mjs';

export const AGENT_READ_SYSTEM_FACTS_EFFECT_ADMISSION_SCHEMA = 'axiom-agent-read-system-facts-effect-admission.v1';
export const AGENT_READ_SYSTEM_FACTS_EFFECT_OPERATION = 'read-system-facts';
export const AGENT_READ_SYSTEM_FACTS_EFFECT_MAX_ADMISSION_SECONDS = 300;

const ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/;
const SHA1 = /^[a-f0-9]{40}$/;
const SHA256 = /^[a-f0-9]{64}$/;
const BASE64URL = /^[A-Za-z0-9_-]+$/;
const ADMISSION_KEYS = new Set(['schema', 'statement', 'statement_digest', 'issuer_signature', 'admission_digest']);
const STATEMENT_KEYS = new Set([
  'admission_id','issuer_id','issuer_key_id','repository','revision','plan_digest','authorization_id','authorization_digest',
  'sponsor_id','subject_id','lifecycle_ledger_id','lifecycle_key_id','compiler_id','compiler_version','compiler_policy_digest',
  'isolation_catalog_digest','isolation_policy_id','isolation_policy_revision','isolation_adapter_id','operation_id','not_before',
  'expires_at','dry_run_plan_remains_inert','general_executor_authority','repository_code_execution_authority','network_authority',
  'credential_authority','secret_authority','remote_hardware_authority','production_authority','deployment_authority',
  'capability_promotion_authority','axiom_authority_granted'
]);
const EXPECTED_STEPS = Object.freeze([
  ['read-system-facts:node-version', ['--version']],
  ['read-system-facts:platform-arch', ['-p', 'JSON.stringify({platform:process.platform,arch:process.arch})']]
]);

function fail(message) { throw new ValidationError(message); }
function exact(value, keys, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(`${label} must be an object`);
  for (const key of Object.keys(value)) if (!keys.has(key)) fail(`${label} contains unsupported field: ${key}`);
  for (const key of keys) if (!Object.hasOwn(value, key)) fail(`${label} is missing required field: ${key}`);
  return value;
}
function id(value, label) { if (typeof value !== 'string' || !ID.test(value)) fail(`${label} is invalid`); return value; }
function digest(value, label) { if (typeof value !== 'string' || !SHA256.test(value)) fail(`${label} is invalid`); return value; }
function revision(value) { if (typeof value !== 'string' || !SHA1.test(value)) fail('effect admission revision is invalid'); return value; }
function time(value, label) {
  const parsed = new Date(value);
  if (typeof value !== 'string' || Number.isNaN(parsed.getTime()) || parsed.toISOString() !== value) fail(`${label} must be canonical UTC`);
  return value;
}
function privateKey(value) {
  let key;
  try { key = value?.type === 'private' ? value : createPrivateKey(value); } catch { fail('effect admission private key is invalid'); }
  if (key.asymmetricKeyType !== 'ed25519') fail('effect admission private key must be Ed25519');
  return key;
}
function publicKey(value) {
  let key;
  try { key = value?.type === 'public' ? value : createPublicKey(value); } catch { fail('effect admission trusted public key is invalid'); }
  if (key.asymmetricKeyType !== 'ed25519') fail('effect admission trusted public key must be Ed25519');
  return key;
}
function keyId(key) { return sha256(key.export({ type: 'spki', format: 'der' })); }
function sameArray(actual, expected) {
  return Array.isArray(actual) && actual.length === expected.length && actual.every((value, index) => value === expected[index]);
}

export function validateReadSystemFactsEffectPlan(plan) {
  validateAgentExecutorDryRunPlan(plan);
  if (plan.platform.operating_system !== 'linux') fail('read-system-facts effect requires Linux');
  if (plan.network.mode !== 'none' || plan.network.allowed_origins.length !== 0) fail('read-system-facts effect requires network none');
  if (plan.effects.effect_reachable !== false) fail('dry-run plan must remain effect-unreachable');
  if (plan.steps.length !== 2) fail('read-system-facts effect requires exactly two compiled steps');
  plan.steps.forEach((step, index) => {
    const [stepId, args] = EXPECTED_STEPS[index];
    if (
      step.sequence !== index + 1 || step.step_id !== stepId || step.operation_id !== AGENT_READ_SYSTEM_FACTS_EFFECT_OPERATION ||
      step.kind !== 'process-template' || step.executable_id !== 'node-current-pinned' || step.working_directory !== 'work/session' ||
      step.repository_code_execution !== false || step.tool_may_invoke_repository_shell !== false ||
      step.package_lifecycle_scripts_allowed !== false || step.direct_shell_requested !== false || step.elevated_privileges_requested !== false ||
      step.persistent_process_requested !== false || step.absolute_executable_resolution_required !== true ||
      step.network_mode !== 'none' || !sameArray(step.arguments, args)
    ) fail('read-system-facts effect plan widened beyond the reviewed fixed mapping');
  });
  return plan;
}

function statementFrom(raw, { plan, expectedRevision, expectedIssuerKeyId }) {
  exact(raw, STATEMENT_KEYS, 'effect admission statement');
  const statement = Object.freeze({
    admission_id: id(raw.admission_id, 'effect admission_id'), issuer_id: id(raw.issuer_id, 'effect issuer_id'),
    issuer_key_id: digest(raw.issuer_key_id, 'effect issuer_key_id'), repository: raw.repository, revision: revision(raw.revision),
    plan_digest: digest(raw.plan_digest, 'effect plan_digest'), authorization_id: id(raw.authorization_id, 'effect authorization_id'),
    authorization_digest: digest(raw.authorization_digest, 'effect authorization_digest'), sponsor_id: id(raw.sponsor_id, 'effect sponsor_id'),
    subject_id: id(raw.subject_id, 'effect subject_id'), lifecycle_ledger_id: id(raw.lifecycle_ledger_id, 'effect lifecycle_ledger_id'),
    lifecycle_key_id: digest(raw.lifecycle_key_id, 'effect lifecycle_key_id'), compiler_id: raw.compiler_id, compiler_version: raw.compiler_version,
    compiler_policy_digest: digest(raw.compiler_policy_digest, 'effect compiler_policy_digest'),
    isolation_catalog_digest: digest(raw.isolation_catalog_digest, 'effect isolation_catalog_digest'), isolation_policy_id: raw.isolation_policy_id,
    isolation_policy_revision: raw.isolation_policy_revision, isolation_adapter_id: raw.isolation_adapter_id, operation_id: raw.operation_id,
    not_before: time(raw.not_before, 'effect admission not_before'), expires_at: time(raw.expires_at, 'effect admission expires_at'),
    dry_run_plan_remains_inert: raw.dry_run_plan_remains_inert, general_executor_authority: raw.general_executor_authority,
    repository_code_execution_authority: raw.repository_code_execution_authority, network_authority: raw.network_authority,
    credential_authority: raw.credential_authority, secret_authority: raw.secret_authority, remote_hardware_authority: raw.remote_hardware_authority,
    production_authority: raw.production_authority, deployment_authority: raw.deployment_authority,
    capability_promotion_authority: raw.capability_promotion_authority, axiom_authority_granted: raw.axiom_authority_granted
  });
  if (statement.repository !== 'Zoverions/AXIOM-MESH' || statement.revision !== expectedRevision || statement.issuer_key_id !== expectedIssuerKeyId) fail('effect admission repository/revision/issuer binding is invalid');
  if (
    statement.compiler_id !== AGENT_EXECUTOR_DRY_RUN_COMPILER_ID || statement.compiler_version !== AGENT_EXECUTOR_DRY_RUN_COMPILER_VERSION ||
    statement.compiler_policy_digest !== AGENT_EXECUTOR_DRY_RUN_POLICY_DIGEST || statement.isolation_catalog_digest !== AGENT_EXECUTOR_ISOLATION_POLICY_CATALOG_DIGEST ||
    statement.isolation_policy_id !== 'linux-kernel-isolation-v1' || statement.isolation_policy_revision !== 1 ||
    statement.isolation_adapter_id !== AGENT_LINUX_ISOLATION_ADAPTER_ID || statement.operation_id !== AGENT_READ_SYSTEM_FACTS_EFFECT_OPERATION
  ) fail('effect admission policy binding is invalid');
  if (
    statement.dry_run_plan_remains_inert !== true || statement.general_executor_authority !== false ||
    statement.repository_code_execution_authority !== false || statement.network_authority !== false || statement.credential_authority !== false ||
    statement.secret_authority !== false || statement.remote_hardware_authority !== false || statement.production_authority !== false ||
    statement.deployment_authority !== false || statement.capability_promotion_authority !== false || statement.axiom_authority_granted !== false
  ) fail('effect admission attempts to widen authority');
  validateReadSystemFactsEffectPlan(plan);
  const durationMs = Date.parse(statement.expires_at) - Date.parse(statement.not_before);
  const planCeilingMs = plan.resources.max_total_runtime_seconds * 1000;
  if (durationMs <= 0 || durationMs > Math.min(AGENT_READ_SYSTEM_FACTS_EFFECT_MAX_ADMISSION_SECONDS * 1000, planCeilingMs)) {
    fail('effect admission lifetime exceeds reviewed or compiled-plan ceiling');
  }
  if (
    statement.plan_digest !== plan.plan_digest || statement.authorization_id !== plan.bindings.authorization_id ||
    statement.authorization_digest !== plan.bindings.authorization_digest || statement.sponsor_id !== plan.bindings.sponsor_id ||
    statement.subject_id !== plan.bindings.subject_id || statement.lifecycle_ledger_id !== plan.bindings.lifecycle_ledger_id ||
    statement.lifecycle_key_id !== plan.bindings.lifecycle_key_id
  ) fail('effect admission does not bind the exact plan');
  return statement;
}

export function createAgentReadSystemFactsEffectAdmission({ admissionId, issuerId, issuerPrivateKey, plan, revision: repoRevision, notBefore, expiresAt } = {}) {
  validateReadSystemFactsEffectPlan(plan);
  const sk = privateKey(issuerPrivateKey);
  const pk = createPublicKey(sk);
  const statement = statementFrom({
    admission_id: admissionId, issuer_id: issuerId, issuer_key_id: keyId(pk), repository: 'Zoverions/AXIOM-MESH', revision: repoRevision,
    plan_digest: plan.plan_digest, authorization_id: plan.bindings.authorization_id, authorization_digest: plan.bindings.authorization_digest,
    sponsor_id: plan.bindings.sponsor_id, subject_id: plan.bindings.subject_id, lifecycle_ledger_id: plan.bindings.lifecycle_ledger_id,
    lifecycle_key_id: plan.bindings.lifecycle_key_id, compiler_id: AGENT_EXECUTOR_DRY_RUN_COMPILER_ID, compiler_version: AGENT_EXECUTOR_DRY_RUN_COMPILER_VERSION,
    compiler_policy_digest: AGENT_EXECUTOR_DRY_RUN_POLICY_DIGEST, isolation_catalog_digest: AGENT_EXECUTOR_ISOLATION_POLICY_CATALOG_DIGEST,
    isolation_policy_id: 'linux-kernel-isolation-v1', isolation_policy_revision: 1, isolation_adapter_id: AGENT_LINUX_ISOLATION_ADAPTER_ID,
    operation_id: AGENT_READ_SYSTEM_FACTS_EFFECT_OPERATION, not_before: notBefore, expires_at: expiresAt, dry_run_plan_remains_inert: true,
    general_executor_authority: false, repository_code_execution_authority: false, network_authority: false, credential_authority: false,
    secret_authority: false, remote_hardware_authority: false, production_authority: false, deployment_authority: false,
    capability_promotion_authority: false, axiom_authority_granted: false
  }, { plan, expectedRevision: repoRevision, expectedIssuerKeyId: keyId(pk) });
  const statementDigest = digestObject(statement);
  const payload = canonicalJson({ schema: AGENT_READ_SYSTEM_FACTS_EFFECT_ADMISSION_SCHEMA, statement, statement_digest: statementDigest });
  const candidate = Object.freeze({
    schema: AGENT_READ_SYSTEM_FACTS_EFFECT_ADMISSION_SCHEMA, statement, statement_digest: statementDigest,
    issuer_signature: sign(null, Buffer.from(payload, 'utf8'), sk).toString('base64url')
  });
  return Object.freeze({ ...candidate, admission_digest: digestObject(candidate) });
}

export function verifyAgentReadSystemFactsEffectAdmission(raw, { trustedIssuerPublicKey, plan, expectedRevision, now } = {}) {
  exact(raw, ADMISSION_KEYS, 'effect admission');
  if (raw.schema !== AGENT_READ_SYSTEM_FACTS_EFFECT_ADMISSION_SCHEMA) fail('effect admission schema is invalid');
  const pk = publicKey(trustedIssuerPublicKey);
  const statement = statementFrom(raw.statement, { plan, expectedRevision, expectedIssuerKeyId: keyId(pk) });
  const statementDigest = digestObject(statement);
  if (
    raw.statement_digest !== statementDigest || typeof raw.issuer_signature !== 'string' ||
    !BASE64URL.test(raw.issuer_signature) || raw.issuer_signature.length > 256
  ) fail('effect admission digest/signature shape is invalid');
  const payload = canonicalJson({ schema: AGENT_READ_SYSTEM_FACTS_EFFECT_ADMISSION_SCHEMA, statement, statement_digest: statementDigest });
  if (!verify(null, Buffer.from(payload, 'utf8'), pk, Buffer.from(raw.issuer_signature, 'base64url'))) fail('effect admission signature verification failed');
  const candidate = { schema: raw.schema, statement, statement_digest: statementDigest, issuer_signature: raw.issuer_signature };
  const admissionDigest = digestObject(candidate);
  if (raw.admission_digest !== admissionDigest) fail('effect admission digest mismatch');
  const nowMs = Date.parse(time(now, 'effect admission verification time'));
  if (nowMs < Date.parse(statement.not_before)) fail('effect admission is not yet active');
  if (nowMs >= Date.parse(statement.expires_at)) fail('effect admission is expired');
  return Object.freeze({ ...candidate, admission_digest: admissionDigest });
}
