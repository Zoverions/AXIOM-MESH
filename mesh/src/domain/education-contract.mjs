import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

export const EDUCATION_CONTRACT_SCHEMA = 'axiom-domain-contract.v1';
export const EDUCATION_CONTRACT_ID = 'education.ontarioedai';
export const EDUCATION_CONTRACT_VERSION = '1.0.0';
export const EDUCATION_CONTRACT_SHA256 = '19f3fdb09352bb87694913d760562065a9a84fcd89780d541ee186be4b193254';
export const EDUCATION_CONTRACT_PATH = fileURLToPath(
  new URL('../../config/domain-contracts/education.v1.json', import.meta.url)
);

const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const ACTION_PATTERN = /^education\.[a-z0-9.-]+$/;
const ALLOWED_RISKS = new Set(['low', 'medium', 'high', 'critical']);
const CONTRACT_FIELDS = Object.freeze(['contract_id', 'contract_version', 'contract_sha256']);

function assert(condition, message) {
  if (!condition) throw new Error(`Education contract invalid: ${message}`);
}

function isRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function uniqueStrings(value, field, { min = 0 } = {}) {
  assert(Array.isArray(value), `${field} must be an array`);
  assert(value.length >= min, `${field} must contain at least ${min} item(s)`);
  assert(value.every(item => typeof item === 'string' && item.length > 0), `${field} must contain non-empty strings`);
  assert(new Set(value).size === value.length, `${field} must not contain duplicates`);
  return value;
}

export function sha256(data) {
  return createHash('sha256').update(data).digest('hex');
}

export function validateEducationContract(contract, { rawBytes } = {}) {
  assert(isRecord(contract), 'root must be an object');
  if (rawBytes !== undefined) {
    assert(Buffer.isBuffer(rawBytes) || rawBytes instanceof Uint8Array, 'rawBytes must be bytes');
    assert(sha256(rawBytes) === EDUCATION_CONTRACT_SHA256, 'contract digest does not match the cross-repository pin');
  }
  assert(contract.schema === EDUCATION_CONTRACT_SCHEMA, 'unsupported schema');
  assert(contract.contract_id === EDUCATION_CONTRACT_ID, 'unexpected contract_id');
  assert(contract.contract_version === EDUCATION_CONTRACT_VERSION, 'unexpected contract_version');
  assert(contract.kernel_minimum === '0.12.0-dev.0', 'unexpected kernel minimum');
  assert(contract.domain === 'education', 'domain must be education');
  assert(contract.controller === 'capsule:education.ontarioedai', 'unexpected controller');
  assert(contract.install_grants_authority === false, 'install must not grant authority');

  const gateway = contract.gateway;
  assert(isRecord(gateway), 'gateway must be an object');
  assert(gateway.path === '/v1/intents', 'gateway path must be /v1/intents');
  assert(gateway.method === 'POST', 'gateway method must be POST');
  assert(gateway.idempotency_header === 'idempotency-key', 'unexpected idempotency header');
  assert(JSON.stringify(gateway.body_fields) === JSON.stringify(['action', 'input']), 'unexpected gateway body fields');

  const purposes = new Set(uniqueStrings(contract.purposes, 'purposes', { min: 1 }));
  const dataScopes = new Set(uniqueStrings(contract.data_scopes, 'data_scopes', { min: 1 }));
  const defaults = contract.minor_data_defaults;
  assert(isRecord(defaults), 'minor_data_defaults must be an object');
  for (const field of [
    'data_minimization',
    'local_processing_preferred',
    'human_review_and_appeal'
  ]) {
    assert(defaults[field] === true, `${field} must be true`);
  }
  for (const field of [
    'advertising',
    'behavioural_targeting',
    'covert_attention_or_emotion_monitoring',
    'diagnosis_inference',
    'raw_prompts_in_evidence',
    'raw_student_work_in_logs'
  ]) {
    assert(defaults[field] === false, `${field} must be false`);
  }

  assert(isRecord(contract.actions), 'actions must be an object');
  const actionNames = Object.keys(contract.actions);
  assert(actionNames.length >= 6, 'contract must define the initial education action set');
  for (const actionName of actionNames) {
    assert(ACTION_PATTERN.test(actionName), `invalid action name ${actionName}`);
    const definition = contract.actions[actionName];
    assert(isRecord(definition), `${actionName} definition must be an object`);
    assert(ALLOWED_RISKS.has(definition.risk), `${actionName} has invalid risk`);
    uniqueStrings(definition.required_scopes, `${actionName}.required_scopes`, { min: 1 });
    assert(
      typeof definition.provider_capability === 'string'
        && definition.provider_capability.startsWith('education.'),
      `${actionName} provider capability must be education-scoped`
    );
    assert(typeof definition.mutation === 'boolean', `${actionName}.mutation must be boolean`);

    const required = uniqueStrings(definition.required_input, `${actionName}.required_input`, { min: 3 });
    const optional = uniqueStrings(definition.optional_input, `${actionName}.optional_input`);
    for (const field of CONTRACT_FIELDS) {
      assert(required.includes(field), `${actionName} must require ${field}`);
    }
    assert(required.every(field => !optional.includes(field)), `${actionName} required and optional inputs overlap`);

    assert(isRecord(definition.consent), `${actionName}.consent must be an object`);
    assert(typeof definition.consent.required === 'boolean', `${actionName}.consent.required must be boolean`);
    if (definition.consent.required) {
      assert(required.includes('subject_id'), `${actionName} must require subject_id`);
      assert(required.includes('consent_id'), `${actionName} must require consent_id`);
      assert(required.includes('purpose'), `${actionName} must require purpose`);
      assert(purposes.has(definition.consent.purpose), `${actionName} has unknown consent purpose`);
      for (const scope of uniqueStrings(definition.consent.data_scopes, `${actionName}.consent.data_scopes`, { min: 1 })) {
        assert(dataScopes.has(scope), `${actionName} has unknown consent data scope ${scope}`);
      }
    }

    assert(isRecord(definition.approval), `${actionName}.approval must be an object`);
    assert(typeof definition.approval.confirmation === 'boolean', `${actionName}.approval.confirmation must be boolean`);
    assert(typeof definition.approval.independent === 'boolean', `${actionName}.approval.independent must be boolean`);
    if (definition.risk === 'high' || definition.risk === 'critical') {
      assert(definition.approval.confirmation === true, `${actionName} high-risk action requires confirmation`);
      assert(definition.approval.independent === true, `${actionName} high-risk action requires independent approval`);
      assert(
        definition.approval.confirmation_value === `confirm:${actionName}`,
        `${actionName} has an invalid confirmation value`
      );
    }
  }
  return contract;
}

export async function loadEducationContract(path = EDUCATION_CONTRACT_PATH) {
  const rawBytes = await readFile(path);
  let contract;
  try {
    contract = JSON.parse(rawBytes.toString('utf8'));
  } catch (error) {
    throw new Error(`Education contract invalid: malformed JSON (${error.message})`);
  }
  return validateEducationContract(contract, { rawBytes });
}

export function validateEducationPolicy(contract, policy) {
  validateEducationContract(contract);
  assert(isRecord(policy), 'policy must be an object');
  assert(isRecord(policy.actions), 'policy actions must be an object');
  for (const [actionName, definition] of Object.entries(contract.actions)) {
    const rule = policy.actions[actionName];
    assert(isRecord(rule), `policy is missing ${actionName}`);
    assert(rule.decision === 'deny', `${actionName} must remain denied without an adapter`);
    assert(rule.risk === definition.risk, `${actionName} policy risk differs from contract`);
    assert(
      JSON.stringify(rule.required_scopes) === JSON.stringify(definition.required_scopes),
      `${actionName} policy scopes differ from contract`
    );
    assert(rule.code === 'capability_unavailable', `${actionName} must use capability_unavailable`);
    assert(rule.http_status === 503, `${actionName} must return HTTP 503`);
    assert(typeof rule.reason === 'string' && rule.reason.length >= 20, `${actionName} must explain unavailability`);
    assert(rule.tool === undefined, `${actionName} denied rule must not name an executable tool`);
  }
  return true;
}

function validateScalarInput(field, value) {
  if (field.endsWith('_sha256') || field === 'payload_digest') {
    assert(typeof value === 'string' && SHA256_PATTERN.test(value), `${field} must be a lowercase SHA-256 digest`);
    return;
  }
  if (field === 'contract_id') {
    assert(value === EDUCATION_CONTRACT_ID, 'input contract_id mismatch');
    return;
  }
  if (field === 'contract_version') {
    assert(value === EDUCATION_CONTRACT_VERSION, 'input contract_version mismatch');
    return;
  }
  if (field === 'contract_sha256') {
    assert(value === EDUCATION_CONTRACT_SHA256, 'input contract_sha256 mismatch');
    return;
  }
  assert(value !== null && value !== undefined, `${field} must not be null`);
}

export function validateEducationIntent(contract, actionName, input) {
  validateEducationContract(contract);
  assert(isRecord(input), 'intent input must be an object');
  const definition = contract.actions[actionName];
  assert(isRecord(definition), `unknown education action ${actionName}`);
  const allowed = new Set([...definition.required_input, ...definition.optional_input]);
  for (const field of Object.keys(input)) {
    assert(allowed.has(field), `${actionName} input contains unknown field ${field}`);
  }
  for (const field of definition.required_input) {
    assert(Object.hasOwn(input, field), `${actionName} input is missing ${field}`);
    validateScalarInput(field, input[field]);
  }
  if (definition.consent.required) {
    assert(input.purpose === definition.consent.purpose, `${actionName} purpose does not match the consent contract`);
    assert(typeof input.subject_id === 'string' && input.subject_id.length > 0, `${actionName} subject_id is invalid`);
    assert(typeof input.consent_id === 'string' && input.consent_id.length > 0, `${actionName} consent_id is invalid`);
  }
  if (Object.hasOwn(input, 'limit')) {
    assert(Number.isInteger(input.limit) && input.limit >= 1 && input.limit <= 50, `${actionName} limit must be 1..50`);
  }
  if (Object.hasOwn(input, 'max_output_tokens')) {
    assert(
      Number.isInteger(input.max_output_tokens)
        && input.max_output_tokens >= 1
        && input.max_output_tokens <= 2048,
      `${actionName} max_output_tokens must be 1..2048`
    );
  }
  if (Object.hasOwn(input, 'deadline_ms')) {
    assert(Number.isInteger(input.deadline_ms) && input.deadline_ms >= 100 && input.deadline_ms <= 120_000, `${actionName} deadline_ms is invalid`);
  }
  return true;
}
