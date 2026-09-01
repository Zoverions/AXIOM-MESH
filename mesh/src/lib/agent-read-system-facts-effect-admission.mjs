import {
  createPrivateKey,
  createPublicKey,
  sign,
  verify
} from 'node:crypto';

import {
  ValidationError,
  assertPlainObject,
  assertString,
  canonicalJson,
  digestObject
} from './canonical.mjs';
import {
  machineIdentityKeyId,
  verifyMachineIdentityCredential
} from './agent-trust-machine-identity.mjs';
import { verifyAgentSignedHandoff } from './agent-trust-signed-handoff.mjs';
import {
  AGENT_EFFECT_CONSUMPTION_ACTION,
  verifyAgentEffectConsumptionRecord
} from './agent-trust-effect-consumption.mjs';

export const AGENT_READ_SYSTEM_FACTS_EFFECT_ADMISSION_SCHEMA =
  'axiom-agent-read-system-facts-effect-admission.v2';
export const AGENT_READ_SYSTEM_FACTS_EFFECT_ADMISSION_MAX_LIFETIME_MS = 60_000;

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}

export const AGENT_READ_SYSTEM_FACTS_ISOLATION_POLICY = deepFreeze({
  schema: 'axiom-agent-read-system-facts-isolation-policy.v1',
  policy_id: 'linux-read-system-facts-fixed-v1',
  revision: 1,
  operation: AGENT_EFFECT_CONSUMPTION_ACTION,
  observation_environment: 'hosted-ci',
  container_runtime: 'docker-local-fixed',
  docker_binary: '/usr/bin/docker',
  image: {
    source: 'repository-built-current-mesh',
    tag: 'axiom-mesh-kernel:0.12.0-dev.3',
    caller_selectable: false
  },
  entrypoint: '/usr/local/bin/node',
  network: {
    mode: 'none',
    caller_origins_allowed: false
  },
  filesystem: {
    read_only_root: true,
    bind_mounts_allowed: false,
    workspace_tmpfs: '/work:rw,noexec,nosuid,nodev,size=16m',
    docker_socket_inside_workload: false
  },
  privilege: {
    capabilities_drop: 'ALL',
    no_new_privileges: true,
    uid_gid: '10001:10001'
  },
  limits: {
    pids: 32,
    memory_bytes: 134217728,
    cpu_quota: 0.5,
    timeout_ms: 5000,
    max_output_bytes: 65536
  },
  templates: [
    {
      template_id: 'node-version',
      argv: ['--version'],
      output_class: 'node-version'
    },
    {
      template_id: 'platform-arch',
      argv: ['-p', 'JSON.stringify({platform:process.platform,arch:process.arch})'],
      output_class: 'platform-arch-json'
    }
  ],
  claims: {
    policy_is_enforcement_proof: false,
    physical_device_proof: false,
    arbitrary_repository_code_isolation: false,
    general_executor_authority: false,
    network_authority: false,
    credential_authority: false,
    secret_authority: false,
    remote_hardware_authority: false,
    production_authority: false,
    deployment_authority: false,
    capability_promotion_authority: false,
    authority_effect: 'none'
  }
});

export const AGENT_READ_SYSTEM_FACTS_ISOLATION_POLICY_DIGEST =
  digestObject(AGENT_READ_SYSTEM_FACTS_ISOLATION_POLICY);

const SHA1 = /^[a-f0-9]{40}$/;
const DIGEST = /^[a-f0-9]{64}$/;
const ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,191}$/;
const BASE64URL = /^[A-Za-z0-9_-]+$/;

const TOP_KEYS = new Set([
  'schema', 'statement', 'statement_digest', 'issuer_signature', 'admission_digest'
]);
const STATEMENT_KEYS = new Set([
  'admission_id',
  'issuer_id',
  'issuer_key_id',
  'repository',
  'revision',
  'handoff_digest',
  'handoff_id',
  'sender_principal_id',
  'executor_principal_id',
  'executor_credential_digest',
  'action',
  'input_digest',
  'consumption_record_digest',
  'consumption_storage_key',
  'consumption_effect_at',
  'currentness_set_digest',
  'isolation_policy_id',
  'isolation_policy_revision',
  'isolation_policy_digest',
  'not_before',
  'expires_at',
  'admission_kind',
  'fixed_operation_only',
  'consumption_record_required',
  'effect_boundary_currentness_recheck_required',
  'effect_already_executed',
  'general_executor_authority',
  'repository_code_execution_authority',
  'arbitrary_command_authority',
  'arbitrary_path_authority',
  'network_authority',
  'credential_authority',
  'secret_authority',
  'remote_hardware_authority',
  'production_authority',
  'deployment_authority',
  'capability_promotion_authority',
  'global_currentness_claimed',
  'task_success_claimed',
  'truth_claimed',
  'application_correctness_claimed',
  'authority_effect',
  'delegation_effect'
]);

const FIXED_SEMANTICS = Object.freeze({
  admission_kind: 'fixed-consumed-handoff-effect-admission',
  fixed_operation_only: true,
  consumption_record_required: true,
  effect_boundary_currentness_recheck_required: true,
  effect_already_executed: false,
  general_executor_authority: false,
  repository_code_execution_authority: false,
  arbitrary_command_authority: false,
  arbitrary_path_authority: false,
  network_authority: false,
  credential_authority: false,
  secret_authority: false,
  remote_hardware_authority: false,
  production_authority: false,
  deployment_authority: false,
  capability_promotion_authority: false,
  global_currentness_claimed: false,
  task_success_claimed: false,
  truth_claimed: false,
  application_correctness_claimed: false,
  authority_effect: 'none',
  delegation_effect: 'none'
});

function exactObject(raw, allowed, label) {
  const value = assertPlainObject(raw, label);
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) throw new ValidationError(`${label} contains unsupported field ${key}`);
  }
  for (const key of allowed) {
    if (!Object.hasOwn(value, key)) throw new ValidationError(`${label} is missing required field ${key}`);
  }
  return value;
}

function identifier(value, label) {
  return assertString(value, label, { min: 1, max: 192, pattern: ID });
}

function digest(value, label) {
  return assertString(value, label, { min: 64, max: 64, pattern: DIGEST });
}

function revision(value) {
  return assertString(value, 'read-system-facts admission revision', {
    min: 40,
    max: 40,
    pattern: SHA1
  });
}

function canonicalTimestamp(value, label) {
  const text = assertString(value, label, { min: 24, max: 24 });
  const parsed = new Date(text);
  if (Number.isNaN(parsed.valueOf()) || parsed.toISOString() !== text) {
    throw new ValidationError(`${label} must be a canonical UTC ISO timestamp`);
  }
  return text;
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

function assertFixedSemantics(raw) {
  for (const [key, expected] of Object.entries(FIXED_SEMANTICS)) {
    if (raw[key] !== expected) {
      throw new ValidationError(`read-system-facts effect admission ${key} must remain ${String(expected)}`);
    }
  }
}

function verifyBoundEvidence({
  rawHandoff,
  handoffEvidence,
  executorIdentityCredential,
  trustedExecutorIssuerPublicKey,
  rawConsumptionRecord,
  trustedConsumptionStorePublicKey
}) {
  const handoff = verifyAgentSignedHandoff(rawHandoff, handoffEvidence);
  if (handoff.statement.action !== AGENT_EFFECT_CONSUMPTION_ACTION) {
    throw new ValidationError(
      `read-system-facts admission requires action ${AGENT_EFFECT_CONSUMPTION_ACTION}`
    );
  }
  const executorCredential = verifyMachineIdentityCredential(executorIdentityCredential, {
    trustedIssuerPublicKey: trustedExecutorIssuerPublicKey,
    expectedPrincipalId: handoff.statement.intended_executor_id
  });
  if (executorCredential.credential_digest !== handoff.statement.intended_executor_identity_digest) {
    throw new ValidationError(
      'read-system-facts admission executor credential does not match handoff intended executor identity'
    );
  }
  const consumption = verifyAgentEffectConsumptionRecord(rawConsumptionRecord, {
    trustedStorePublicKey: trustedConsumptionStorePublicKey,
    expectedHandoffDigest: handoff.handoff_digest,
    expectedExecutorCredentialDigest: executorCredential.credential_digest
  });
  if (
    consumption.statement.handoff_id !== handoff.statement.handoff_id
    || consumption.statement.sender_principal_id !== handoff.statement.sender_principal_id
    || consumption.statement.executor_principal_id !== executorCredential.statement.principal_id
    || consumption.statement.action !== handoff.statement.action
    || consumption.statement.input_digest !== handoff.statement.input_digest
  ) {
    throw new ValidationError('read-system-facts admission consumption record binding mismatch');
  }
  return Object.freeze({ handoff, executorCredential, consumption });
}

function normalizeStatement(raw, {
  evidence,
  expectedRevision,
  expectedIssuerKeyId
}) {
  const value = exactObject(raw, STATEMENT_KEYS, 'read-system-facts effect admission statement');
  assertFixedSemantics(value);
  if (value.repository !== 'Zoverions/AXIOM-MESH') {
    throw new ValidationError('read-system-facts admission repository is invalid');
  }
  const repoRevision = revision(value.revision);
  if (repoRevision !== expectedRevision) {
    throw new ValidationError('read-system-facts admission revision mismatch');
  }
  const notBefore = canonicalTimestamp(
    value.not_before,
    'read-system-facts admission not_before'
  );
  const expiresAt = canonicalTimestamp(
    value.expires_at,
    'read-system-facts admission expires_at'
  );
  const startMs = new Date(notBefore).valueOf();
  const expiryMs = new Date(expiresAt).valueOf();
  if (expiryMs <= startMs) {
    throw new ValidationError('read-system-facts admission expiry must follow not_before');
  }
  if (expiryMs - startMs > AGENT_READ_SYSTEM_FACTS_EFFECT_ADMISSION_MAX_LIFETIME_MS) {
    throw new ValidationError('read-system-facts admission lifetime exceeds sixty-second ceiling');
  }
  if (
    startMs < new Date(evidence.handoff.statement.not_before).valueOf()
    || expiryMs > new Date(evidence.handoff.statement.expires_at).valueOf()
  ) {
    throw new ValidationError('read-system-facts admission must remain inside handoff window');
  }
  if (startMs < new Date(evidence.consumption.statement.effect_at).valueOf()) {
    throw new ValidationError('read-system-facts admission cannot begin before durable consumption currentness boundary');
  }

  const statement = Object.freeze({
    admission_id: identifier(value.admission_id, 'read-system-facts admission admission_id'),
    issuer_id: identifier(value.issuer_id, 'read-system-facts admission issuer_id'),
    issuer_key_id: digest(value.issuer_key_id, 'read-system-facts admission issuer_key_id'),
    repository: 'Zoverions/AXIOM-MESH',
    revision: repoRevision,
    handoff_digest: digest(value.handoff_digest, 'read-system-facts admission handoff_digest'),
    handoff_id: identifier(value.handoff_id, 'read-system-facts admission handoff_id'),
    sender_principal_id: identifier(
      value.sender_principal_id,
      'read-system-facts admission sender_principal_id'
    ),
    executor_principal_id: identifier(
      value.executor_principal_id,
      'read-system-facts admission executor_principal_id'
    ),
    executor_credential_digest: digest(
      value.executor_credential_digest,
      'read-system-facts admission executor_credential_digest'
    ),
    action: value.action,
    input_digest: digest(value.input_digest, 'read-system-facts admission input_digest'),
    consumption_record_digest: digest(
      value.consumption_record_digest,
      'read-system-facts admission consumption_record_digest'
    ),
    consumption_storage_key: digest(
      value.consumption_storage_key,
      'read-system-facts admission consumption_storage_key'
    ),
    consumption_effect_at: canonicalTimestamp(
      value.consumption_effect_at,
      'read-system-facts admission consumption_effect_at'
    ),
    currentness_set_digest: digest(
      value.currentness_set_digest,
      'read-system-facts admission currentness_set_digest'
    ),
    isolation_policy_id: value.isolation_policy_id,
    isolation_policy_revision: value.isolation_policy_revision,
    isolation_policy_digest: digest(
      value.isolation_policy_digest,
      'read-system-facts admission isolation_policy_digest'
    ),
    not_before: notBefore,
    expires_at: expiresAt,
    ...FIXED_SEMANTICS
  });

  if (statement.issuer_key_id !== expectedIssuerKeyId) {
    throw new ValidationError('read-system-facts admission issuer key substitution');
  }
  if (statement.action !== AGENT_EFFECT_CONSUMPTION_ACTION) {
    throw new ValidationError(
      `read-system-facts admission action must remain ${AGENT_EFFECT_CONSUMPTION_ACTION}`
    );
  }
  if (
    statement.isolation_policy_id !== AGENT_READ_SYSTEM_FACTS_ISOLATION_POLICY.policy_id
    || statement.isolation_policy_revision !== AGENT_READ_SYSTEM_FACTS_ISOLATION_POLICY.revision
    || statement.isolation_policy_digest !== AGENT_READ_SYSTEM_FACTS_ISOLATION_POLICY_DIGEST
  ) {
    throw new ValidationError('read-system-facts admission isolation policy binding mismatch');
  }

  const expected = {
    handoff_digest: evidence.handoff.handoff_digest,
    handoff_id: evidence.handoff.statement.handoff_id,
    sender_principal_id: evidence.handoff.statement.sender_principal_id,
    executor_principal_id: evidence.executorCredential.statement.principal_id,
    executor_credential_digest: evidence.executorCredential.credential_digest,
    action: evidence.handoff.statement.action,
    input_digest: evidence.handoff.statement.input_digest,
    consumption_record_digest: evidence.consumption.record_digest,
    consumption_storage_key: evidence.consumption.statement.storage_key,
    consumption_effect_at: evidence.consumption.statement.effect_at,
    currentness_set_digest: evidence.consumption.statement.currentness_set_digest
  };
  for (const [key, expectedValue] of Object.entries(expected)) {
    if (statement[key] !== expectedValue) {
      throw new ValidationError(`read-system-facts admission ${key} does not match bound evidence`);
    }
  }
  return statement;
}

function signStatement(statement, privateKey) {
  const statementDigest = digestObject(statement);
  const signable = Object.freeze({
    schema: AGENT_READ_SYSTEM_FACTS_EFFECT_ADMISSION_SCHEMA,
    statement,
    statement_digest: statementDigest
  });
  const signature = sign(
    null,
    Buffer.from(canonicalJson(signable)),
    privateKey
  ).toString('base64url');
  const signed = Object.freeze({ ...signable, issuer_signature: signature });
  return Object.freeze({ ...signed, admission_digest: digestObject(signed) });
}

export function createAgentReadSystemFactsEffectAdmission({
  admissionId,
  issuerId,
  issuerPrivateKey,
  revision: repoRevision,
  handoff,
  handoffEvidence,
  executorIdentityCredential,
  trustedExecutorIssuerPublicKey,
  consumptionRecord,
  trustedConsumptionStorePublicKey,
  notBefore,
  expiresAt
} = {}) {
  const evidence = verifyBoundEvidence({
    rawHandoff: handoff,
    handoffEvidence,
    executorIdentityCredential,
    trustedExecutorIssuerPublicKey,
    rawConsumptionRecord: consumptionRecord,
    trustedConsumptionStorePublicKey
  });
  const privateKey = parsePrivateKey(
    issuerPrivateKey,
    'read-system-facts admission issuer private key'
  );
  const publicKey = createPublicKey(privateKey);
  const statement = normalizeStatement({
    admission_id: admissionId,
    issuer_id: issuerId,
    issuer_key_id: machineIdentityKeyId(publicKey),
    repository: 'Zoverions/AXIOM-MESH',
    revision: repoRevision,
    handoff_digest: evidence.handoff.handoff_digest,
    handoff_id: evidence.handoff.statement.handoff_id,
    sender_principal_id: evidence.handoff.statement.sender_principal_id,
    executor_principal_id: evidence.executorCredential.statement.principal_id,
    executor_credential_digest: evidence.executorCredential.credential_digest,
    action: evidence.handoff.statement.action,
    input_digest: evidence.handoff.statement.input_digest,
    consumption_record_digest: evidence.consumption.record_digest,
    consumption_storage_key: evidence.consumption.statement.storage_key,
    consumption_effect_at: evidence.consumption.statement.effect_at,
    currentness_set_digest: evidence.consumption.statement.currentness_set_digest,
    isolation_policy_id: AGENT_READ_SYSTEM_FACTS_ISOLATION_POLICY.policy_id,
    isolation_policy_revision: AGENT_READ_SYSTEM_FACTS_ISOLATION_POLICY.revision,
    isolation_policy_digest: AGENT_READ_SYSTEM_FACTS_ISOLATION_POLICY_DIGEST,
    not_before: notBefore,
    expires_at: expiresAt,
    ...FIXED_SEMANTICS
  }, {
    evidence,
    expectedRevision: repoRevision,
    expectedIssuerKeyId: machineIdentityKeyId(publicKey)
  });
  return signStatement(statement, privateKey);
}

export function verifyAgentReadSystemFactsEffectAdmission(raw, {
  trustedIssuerPublicKey,
  expectedRevision,
  now,
  handoff,
  handoffEvidence,
  executorIdentityCredential,
  trustedExecutorIssuerPublicKey,
  consumptionRecord,
  trustedConsumptionStorePublicKey
} = {}) {
  const value = exactObject(raw, TOP_KEYS, 'read-system-facts effect admission');
  if (value.schema !== AGENT_READ_SYSTEM_FACTS_EFFECT_ADMISSION_SCHEMA) {
    throw new ValidationError(
      `read-system-facts admission schema must be ${AGENT_READ_SYSTEM_FACTS_EFFECT_ADMISSION_SCHEMA}`
    );
  }
  const issuerPublicKey = parsePublicKey(
    trustedIssuerPublicKey,
    'read-system-facts admission trusted issuer public key'
  );
  const evidence = verifyBoundEvidence({
    rawHandoff: handoff,
    handoffEvidence,
    executorIdentityCredential,
    trustedExecutorIssuerPublicKey,
    rawConsumptionRecord: consumptionRecord,
    trustedConsumptionStorePublicKey
  });
  const statement = normalizeStatement(value.statement, {
    evidence,
    expectedRevision: revision(expectedRevision),
    expectedIssuerKeyId: machineIdentityKeyId(issuerPublicKey)
  });
  const statementDigest = digest(
    value.statement_digest,
    'read-system-facts admission statement_digest'
  );
  if (statementDigest !== digestObject(statement)) {
    throw new ValidationError('read-system-facts admission statement digest mismatch');
  }
  const signature = assertString(
    value.issuer_signature,
    'read-system-facts admission issuer_signature',
    { min: 32, max: 1024, pattern: BASE64URL }
  );
  let valid = false;
  try {
    valid = verify(
      null,
      Buffer.from(canonicalJson({
        schema: AGENT_READ_SYSTEM_FACTS_EFFECT_ADMISSION_SCHEMA,
        statement,
        statement_digest: statementDigest
      })),
      issuerPublicKey,
      Buffer.from(signature, 'base64url')
    );
  } catch {
    valid = false;
  }
  if (!valid) throw new ValidationError('read-system-facts admission signature verification failed');
  const signed = Object.freeze({
    schema: AGENT_READ_SYSTEM_FACTS_EFFECT_ADMISSION_SCHEMA,
    statement,
    statement_digest: statementDigest,
    issuer_signature: signature
  });
  const admissionDigest = digest(
    value.admission_digest,
    'read-system-facts admission admission_digest'
  );
  if (admissionDigest !== digestObject(signed)) {
    throw new ValidationError('read-system-facts admission digest mismatch');
  }
  const verificationTime = canonicalTimestamp(now, 'read-system-facts admission verification time');
  const nowMs = new Date(verificationTime).valueOf();
  if (nowMs < new Date(statement.not_before).valueOf()) {
    throw new ValidationError('read-system-facts admission is not yet active');
  }
  if (nowMs >= new Date(statement.expires_at).valueOf()) {
    throw new ValidationError('read-system-facts admission is expired');
  }
  return Object.freeze({ ...signed, admission_digest: admissionDigest });
}
