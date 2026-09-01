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
  digestObject,
  sha256
} from './canonical.mjs';
import { normalizeAgentAuthorityCeiling } from './agent-trust-attenuation-proof.mjs';
import { verifySubagentDelegationAdmission } from './agent-trust-subagent-delegation-admission.mjs';
import { verifySubagentAggregateBudgetPlan } from './agent-trust-subagent-aggregate-budget.mjs';

export const SUBAGENT_LINEAGE_RECORD_SCHEMA = 'axiom-subagent-lineage-record.v1';

const DIGEST = /^[a-f0-9]{64}$/;
const ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,191}$/;
const BASE64URL = /^[A-Za-z0-9_-]+$/;

const RECORD_KEYS = new Set([
  'schema',
  'statement',
  'statement_digest',
  'lineage_signature',
  'record_digest'
]);

const STATEMENT_KEYS = new Set([
  'lineage_id',
  'root_lineage_id',
  'depth',
  'parent_lineage_record_digest',
  'delegator_id',
  'delegate_id',
  'lineage_authority_id',
  'lineage_authority_key_id',
  'delegation_admission',
  'delegation_admission_digest',
  'attenuation_proof_digest',
  'parent_ceiling_digest',
  'child_ceiling_digest',
  'aggregate_budget_plan_digest',
  'budget_reservation_id',
  'task_id',
  'task_purpose',
  'task_input_digest',
  'runtime_descriptor_digest',
  'created_at',
  'expires_at',
  'authority_effect',
  'delegation_effect',
  'execution_authorized',
  'spawn_execution_claimed',
  'runtime_attestation_claimed',
  'task_success_claimed',
  'output_verified',
  'trust_inherited',
  'global_currentness_claimed',
  'descendant_effect_requires_recheck',
  'budget_runtime_enforcement_claimed'
]);

const TASK_KEYS = new Set(['id', 'purpose', 'input_digest']);

const SEMANTICS = Object.freeze({
  authority_effect: 'none',
  delegation_effect: 'none',
  execution_authorized: false,
  spawn_execution_claimed: false,
  runtime_attestation_claimed: false,
  task_success_claimed: false,
  output_verified: false,
  trust_inherited: false,
  global_currentness_claimed: false,
  descendant_effect_requires_recheck: true,
  budget_runtime_enforcement_claimed: false
});

function exactObject(raw, allowed, label) {
  const value = assertPlainObject(raw, label);
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) {
      throw new ValidationError(`${label} contains unsupported field ${key}`);
    }
  }
  return value;
}

function identifier(value, label) {
  return assertString(value, label, { min: 1, max: 192, pattern: ID });
}

function digest(value, label) {
  return assertString(value, label, { min: 64, max: 64, pattern: DIGEST });
}

function nullableDigest(value, label) {
  return value === null ? null : digest(value, label);
}

function positiveInteger(value, label, max = 32) {
  if (!Number.isSafeInteger(value) || value < 1 || value > max) {
    throw new ValidationError(`${label} must be an integer between 1 and ${max}`);
  }
  return value;
}

function canonicalTimestamp(value, label) {
  const text = assertString(value, label, { min: 24, max: 24 });
  const parsed = new Date(text);
  if (Number.isNaN(parsed.valueOf()) || parsed.toISOString() !== text) {
    throw new ValidationError(`${label} must be a canonical UTC ISO timestamp`);
  }
  return text;
}

function timestampValue(value) {
  return new Date(value).valueOf();
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
  if (key.asymmetricKeyType !== 'ed25519') {
    throw new ValidationError(`${label} must be Ed25519`);
  }
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
  if (key.asymmetricKeyType !== 'ed25519') {
    throw new ValidationError(`${label} must be Ed25519`);
  }
  return key;
}

function canonicalPublicKey(value, label) {
  return parsePublicKey(value, label)
    .export({ type: 'spki', format: 'pem' })
    .toString();
}

export function subagentLineageAuthorityKeyId(
  value,
  label = 'subagent lineage authority public key'
) {
  return sha256(canonicalPublicKey(value, label));
}

function normalizeTask(raw) {
  const value = exactObject(raw, TASK_KEYS, 'subagent lineage task');
  return Object.freeze({
    id: identifier(value.id, 'subagent lineage task id'),
    purpose: identifier(value.purpose, 'subagent lineage task purpose'),
    input_digest: digest(value.input_digest, 'subagent lineage task input_digest')
  });
}

function normalizeStatement(raw) {
  const value = exactObject(raw, STATEMENT_KEYS, 'subagent lineage record statement');
  const semantics = Object.fromEntries(Object.keys(SEMANTICS).map(key => [key, value[key]]));
  if (canonicalJson(semantics) !== canonicalJson(SEMANTICS)) {
    throw new ValidationError('subagent lineage record widens its non-authorizing boundary');
  }

  const depth = positiveInteger(value.depth, 'subagent lineage record depth');
  const parentDigest = nullableDigest(
    value.parent_lineage_record_digest,
    'subagent lineage record parent_lineage_record_digest'
  );
  if (depth === 1 && parentDigest !== null) {
    throw new ValidationError('subagent lineage depth 1 must not bind a parent lineage record');
  }
  if (depth > 1 && parentDigest === null) {
    throw new ValidationError('subagent lineage descendants require a parent lineage record digest');
  }

  const lineageId = identifier(value.lineage_id, 'subagent lineage record lineage_id');
  const rootLineageId = identifier(value.root_lineage_id, 'subagent lineage record root_lineage_id');
  if (depth === 1 && lineageId !== rootLineageId) {
    throw new ValidationError('subagent lineage root record must use its own lineage id as root_lineage_id');
  }

  const createdAt = canonicalTimestamp(value.created_at, 'subagent lineage record created_at');
  const expiresAt = canonicalTimestamp(value.expires_at, 'subagent lineage record expires_at');
  if (timestampValue(expiresAt) <= timestampValue(createdAt)) {
    throw new ValidationError('subagent lineage record expiry must follow creation');
  }

  return Object.freeze({
    lineage_id: lineageId,
    root_lineage_id: rootLineageId,
    depth,
    parent_lineage_record_digest: parentDigest,
    delegator_id: identifier(value.delegator_id, 'subagent lineage record delegator_id'),
    delegate_id: identifier(value.delegate_id, 'subagent lineage record delegate_id'),
    lineage_authority_id: identifier(
      value.lineage_authority_id,
      'subagent lineage record lineage_authority_id'
    ),
    lineage_authority_key_id: digest(
      value.lineage_authority_key_id,
      'subagent lineage record lineage_authority_key_id'
    ),
    delegation_admission: assertPlainObject(
      value.delegation_admission,
      'subagent lineage record delegation_admission'
    ),
    delegation_admission_digest: digest(
      value.delegation_admission_digest,
      'subagent lineage record delegation_admission_digest'
    ),
    attenuation_proof_digest: digest(
      value.attenuation_proof_digest,
      'subagent lineage record attenuation_proof_digest'
    ),
    parent_ceiling_digest: digest(
      value.parent_ceiling_digest,
      'subagent lineage record parent_ceiling_digest'
    ),
    child_ceiling_digest: digest(
      value.child_ceiling_digest,
      'subagent lineage record child_ceiling_digest'
    ),
    aggregate_budget_plan_digest: digest(
      value.aggregate_budget_plan_digest,
      'subagent lineage record aggregate_budget_plan_digest'
    ),
    budget_reservation_id: identifier(
      value.budget_reservation_id,
      'subagent lineage record budget_reservation_id'
    ),
    task_id: identifier(value.task_id, 'subagent lineage record task_id'),
    task_purpose: identifier(value.task_purpose, 'subagent lineage record task_purpose'),
    task_input_digest: digest(value.task_input_digest, 'subagent lineage record task_input_digest'),
    runtime_descriptor_digest: digest(
      value.runtime_descriptor_digest,
      'subagent lineage record runtime_descriptor_digest'
    ),
    created_at: createdAt,
    expires_at: expiresAt,
    ...SEMANTICS
  });
}

function verifyComposition({
  delegationAdmission,
  admissionAuthorityPublicKey,
  attenuationProof,
  delegatorPublicKey,
  parentAuthority,
  childAuthority,
  expectedDelegatorId,
  expectedDelegateId,
  expectedParentCurrentnessDigest,
  retainedLatestParentCurrentnessDigest,
  aggregateBudgetPlan,
  aggregateBudgetChildAuthorities,
  reservationId,
  task
}) {
  const admission = verifySubagentDelegationAdmission(delegationAdmission, {
    admissionAuthorityPublicKey,
    attenuationProof,
    delegatorPublicKey,
    parentAuthority,
    childAuthority,
    expectedDelegatorId,
    expectedDelegateId,
    expectedParentCurrentnessDigest,
    retainedLatestParentCurrentnessDigest
  });
  const budgetPlan = verifySubagentAggregateBudgetPlan(aggregateBudgetPlan, {
    parentAuthority,
    childAuthorities: aggregateBudgetChildAuthorities
  });
  const parent = normalizeAgentAuthorityCeiling(parentAuthority);
  const child = normalizeAgentAuthorityCeiling(childAuthority);

  if (admission.statement.parent_ceiling_digest !== parent.ceiling_digest) {
    throw new ValidationError('subagent lineage parent authority binding mismatch');
  }
  if (admission.statement.child_ceiling_digest !== child.ceiling_digest) {
    throw new ValidationError('subagent lineage child authority binding mismatch');
  }
  if (budgetPlan.statement.parent_ceiling_digest !== admission.statement.parent_ceiling_digest) {
    throw new ValidationError('subagent lineage aggregate budget parent binding mismatch');
  }

  const reservation = budgetPlan.statement.reservations.find(
    item => item.reservation_id === reservationId
  );
  if (!reservation) {
    throw new ValidationError('subagent lineage budget reservation is missing');
  }
  if (reservation.child_id !== admission.statement.delegate_id) {
    throw new ValidationError('subagent lineage budget reservation targets another child');
  }
  if (reservation.child_ceiling_digest !== admission.statement.child_ceiling_digest) {
    throw new ValidationError('subagent lineage budget reservation child ceiling mismatch');
  }

  const normalizedTask = normalizeTask(task);
  if (!child.purposes.includes(normalizedTask.purpose)) {
    throw new ValidationError('subagent lineage task purpose is outside child authority');
  }

  return Object.freeze({ admission, budgetPlan, parent, child, reservation, task: normalizedTask });
}

function assertRecordLifetime(statement, composition) {
  if (timestampValue(statement.created_at) < timestampValue(composition.admission.statement.issued_at)) {
    throw new ValidationError('subagent lineage record starts before delegation admission');
  }
  if (timestampValue(statement.created_at) < timestampValue(composition.budgetPlan.statement.valid_from)) {
    throw new ValidationError('subagent lineage record starts before aggregate budget plan');
  }
  if (timestampValue(statement.created_at) < timestampValue(composition.child.valid_from)) {
    throw new ValidationError('subagent lineage record starts before child authority');
  }
  if (timestampValue(statement.expires_at) > timestampValue(composition.admission.statement.expires_at)) {
    throw new ValidationError('subagent lineage record cannot outlive delegation admission');
  }
  if (timestampValue(statement.expires_at) > timestampValue(composition.budgetPlan.statement.expires_at)) {
    throw new ValidationError('subagent lineage record cannot outlive aggregate budget plan');
  }
  if (timestampValue(statement.expires_at) > timestampValue(composition.child.expires_at)) {
    throw new ValidationError('subagent lineage record cannot outlive child authority');
  }
}

function createSignedRecord(statement, lineageAuthorityPrivateKey) {
  const privateKey = parsePrivateKey(
    lineageAuthorityPrivateKey,
    'subagent lineage authority private key'
  );
  const expectedKeyId = subagentLineageAuthorityKeyId(createPublicKey(privateKey));
  if (statement.lineage_authority_key_id !== expectedKeyId) {
    throw new ValidationError('subagent lineage authority private key does not match statement key id');
  }
  const statementDigest = digestObject(statement);
  const signable = Object.freeze({
    schema: SUBAGENT_LINEAGE_RECORD_SCHEMA,
    statement,
    statement_digest: statementDigest
  });
  const lineageSignature = sign(
    null,
    Buffer.from(canonicalJson(signable)),
    privateKey
  ).toString('base64url');
  const signed = Object.freeze({
    ...signable,
    lineage_signature: lineageSignature
  });
  return Object.freeze({
    ...signed,
    record_digest: digestObject(signed)
  });
}

export function createSubagentLineageRecord({
  lineageId,
  rootLineageId,
  depth,
  parentLineageRecordDigest,
  delegationAdmission,
  admissionAuthorityPublicKey,
  attenuationProof,
  delegatorPublicKey,
  parentAuthority,
  childAuthority,
  expectedDelegatorId,
  expectedDelegateId,
  expectedParentCurrentnessDigest,
  retainedLatestParentCurrentnessDigest,
  aggregateBudgetPlan,
  aggregateBudgetChildAuthorities,
  reservationId,
  task,
  runtimeDescriptorDigest,
  lineageAuthorityId,
  lineageAuthorityPrivateKey,
  createdAt,
  expiresAt
} = {}) {
  const composition = verifyComposition({
    delegationAdmission,
    admissionAuthorityPublicKey,
    attenuationProof,
    delegatorPublicKey,
    parentAuthority,
    childAuthority,
    expectedDelegatorId,
    expectedDelegateId,
    expectedParentCurrentnessDigest,
    retainedLatestParentCurrentnessDigest,
    aggregateBudgetPlan,
    aggregateBudgetChildAuthorities,
    reservationId,
    task
  });

  const privateKey = parsePrivateKey(
    lineageAuthorityPrivateKey,
    'subagent lineage authority private key'
  );
  const authorityPublicKey = createPublicKey(privateKey);
  const statement = normalizeStatement({
    lineage_id: lineageId,
    root_lineage_id: rootLineageId,
    depth,
    parent_lineage_record_digest: parentLineageRecordDigest,
    delegator_id: composition.admission.statement.delegator_id,
    delegate_id: composition.admission.statement.delegate_id,
    lineage_authority_id: lineageAuthorityId,
    lineage_authority_key_id: subagentLineageAuthorityKeyId(authorityPublicKey),
    delegation_admission: delegationAdmission,
    delegation_admission_digest: composition.admission.admission_digest,
    attenuation_proof_digest: composition.admission.statement.attenuation_proof_digest,
    parent_ceiling_digest: composition.admission.statement.parent_ceiling_digest,
    child_ceiling_digest: composition.admission.statement.child_ceiling_digest,
    aggregate_budget_plan_digest: composition.budgetPlan.plan_digest,
    budget_reservation_id: reservationId,
    task_id: composition.task.id,
    task_purpose: composition.task.purpose,
    task_input_digest: composition.task.input_digest,
    runtime_descriptor_digest: runtimeDescriptorDigest,
    created_at: createdAt,
    expires_at: expiresAt,
    ...SEMANTICS
  });
  assertRecordLifetime(statement, composition);
  return createSignedRecord(statement, privateKey);
}

function verifyEnvelope(raw, lineageAuthorityPublicKey, expectedLineageAuthorityId) {
  const value = exactObject(raw, RECORD_KEYS, 'subagent lineage record');
  if (value.schema !== SUBAGENT_LINEAGE_RECORD_SCHEMA) {
    throw new ValidationError(
      `subagent lineage record schema must be ${SUBAGENT_LINEAGE_RECORD_SCHEMA}`
    );
  }
  const suppliedStatementDigest = digest(
    value.statement_digest,
    'subagent lineage record statement_digest'
  );
  if (suppliedStatementDigest !== digestObject(value.statement)) {
    throw new ValidationError('subagent lineage record statement digest mismatch');
  }
  const statement = normalizeStatement(value.statement);
  if (
    expectedLineageAuthorityId !== undefined
    && statement.lineage_authority_id !== expectedLineageAuthorityId
  ) {
    throw new ValidationError('subagent lineage authority id mismatch');
  }

  const publicKey = parsePublicKey(
    lineageAuthorityPublicKey,
    'subagent lineage authority public key'
  );
  if (subagentLineageAuthorityKeyId(publicKey) !== statement.lineage_authority_key_id) {
    throw new ValidationError('subagent lineage authority key substitution');
  }
  const signature = assertString(
    value.lineage_signature,
    'subagent lineage record lineage_signature',
    { min: 32, max: 1024, pattern: BASE64URL }
  );
  let valid = false;
  try {
    valid = verify(
      null,
      Buffer.from(canonicalJson({
        schema: SUBAGENT_LINEAGE_RECORD_SCHEMA,
        statement,
        statement_digest: suppliedStatementDigest
      })),
      publicKey,
      Buffer.from(signature, 'base64url')
    );
  } catch {
    valid = false;
  }
  if (!valid) {
    throw new ValidationError('subagent lineage record signature is invalid');
  }

  const signed = Object.freeze({
    schema: SUBAGENT_LINEAGE_RECORD_SCHEMA,
    statement,
    statement_digest: suppliedStatementDigest,
    lineage_signature: signature
  });
  const recordDigest = digest(value.record_digest, 'subagent lineage record record_digest');
  if (recordDigest !== digestObject(signed)) {
    throw new ValidationError('subagent lineage record digest mismatch');
  }
  return Object.freeze({ ...signed, record_digest: recordDigest });
}

export function verifySubagentLineageRecord(raw, {
  lineageAuthorityPublicKey,
  expectedLineageAuthorityId,
  admissionAuthorityPublicKey,
  attenuationProof,
  delegatorPublicKey,
  parentAuthority,
  childAuthority,
  expectedDelegatorId,
  expectedDelegateId,
  expectedParentCurrentnessDigest,
  retainedLatestParentCurrentnessDigest,
  aggregateBudgetPlan,
  aggregateBudgetChildAuthorities
} = {}) {
  const verified = verifyEnvelope(
    raw,
    lineageAuthorityPublicKey,
    expectedLineageAuthorityId
  );
  const composition = verifyComposition({
    delegationAdmission: verified.statement.delegation_admission,
    admissionAuthorityPublicKey,
    attenuationProof,
    delegatorPublicKey,
    parentAuthority,
    childAuthority,
    expectedDelegatorId,
    expectedDelegateId,
    expectedParentCurrentnessDigest,
    retainedLatestParentCurrentnessDigest,
    aggregateBudgetPlan,
    aggregateBudgetChildAuthorities,
    reservationId: verified.statement.budget_reservation_id,
    task: {
      id: verified.statement.task_id,
      purpose: verified.statement.task_purpose,
      input_digest: verified.statement.task_input_digest
    }
  });

  if (verified.statement.delegation_admission_digest !== composition.admission.admission_digest) {
    throw new ValidationError('subagent lineage delegation admission digest mismatch');
  }
  if (verified.statement.attenuation_proof_digest !== composition.admission.statement.attenuation_proof_digest) {
    throw new ValidationError('subagent lineage attenuation proof digest mismatch');
  }
  if (verified.statement.parent_ceiling_digest !== composition.admission.statement.parent_ceiling_digest) {
    throw new ValidationError('subagent lineage parent ceiling digest mismatch');
  }
  if (verified.statement.child_ceiling_digest !== composition.admission.statement.child_ceiling_digest) {
    throw new ValidationError('subagent lineage child ceiling digest mismatch');
  }
  if (verified.statement.aggregate_budget_plan_digest !== composition.budgetPlan.plan_digest) {
    throw new ValidationError('subagent lineage aggregate budget plan digest mismatch');
  }
  if (verified.statement.delegator_id !== composition.admission.statement.delegator_id) {
    throw new ValidationError('subagent lineage delegator id mismatch');
  }
  if (verified.statement.delegate_id !== composition.admission.statement.delegate_id) {
    throw new ValidationError('subagent lineage delegate id mismatch');
  }
  assertRecordLifetime(verified.statement, composition);
  return verified;
}

function assertInternalRecordDigest(record, label) {
  const value = exactObject(record, RECORD_KEYS, label);
  if (value.schema !== SUBAGENT_LINEAGE_RECORD_SCHEMA) {
    throw new ValidationError(`${label} schema is unsupported`);
  }
  const expectedStatementDigest = digestObject(value.statement);
  if (value.statement_digest !== expectedStatementDigest) {
    throw new ValidationError(`${label} statement digest mismatch`);
  }
  const signed = {
    schema: value.schema,
    statement: value.statement,
    statement_digest: value.statement_digest,
    lineage_signature: value.lineage_signature
  };
  if (value.record_digest !== digestObject(signed)) {
    throw new ValidationError(`${label} record digest mismatch`);
  }
}

export function verifySubagentLineageLink({ parentRecord, childRecord } = {}) {
  const parent = exactObject(parentRecord, RECORD_KEYS, 'parent subagent lineage record');
  const child = exactObject(childRecord, RECORD_KEYS, 'child subagent lineage record');
  if (parent.schema !== SUBAGENT_LINEAGE_RECORD_SCHEMA || child.schema !== SUBAGENT_LINEAGE_RECORD_SCHEMA) {
    throw new ValidationError('subagent lineage link requires v1 lineage records');
  }
  if (child.statement.parent_lineage_record_digest !== parent.record_digest) {
    throw new ValidationError('subagent lineage parent lineage record digest mismatch');
  }
  if (child.statement.depth !== parent.statement.depth + 1) {
    throw new ValidationError('subagent lineage depth must increment exactly once');
  }
  if (child.statement.root_lineage_id !== parent.statement.root_lineage_id) {
    throw new ValidationError('subagent lineage root lineage id mismatch');
  }
  if (child.statement.delegator_id !== parent.statement.delegate_id) {
    throw new ValidationError('subagent lineage previous child must be next delegator');
  }
  if (child.statement.parent_ceiling_digest !== parent.statement.child_ceiling_digest) {
    throw new ValidationError('subagent lineage previous child ceiling must be next parent ceiling');
  }
  if (timestampValue(child.statement.created_at) < timestampValue(parent.statement.created_at)) {
    throw new ValidationError('subagent lineage child record predates parent lineage record');
  }
  if (timestampValue(child.statement.created_at) > timestampValue(parent.statement.expires_at)) {
    throw new ValidationError('subagent lineage child record begins after parent lineage expires');
  }

  assertInternalRecordDigest(parent, 'parent subagent lineage record');
  assertInternalRecordDigest(child, 'child subagent lineage record');

  return Object.freeze({
    linked: true,
    root_lineage_id: parent.statement.root_lineage_id,
    parent_record_digest: parent.record_digest,
    child_record_digest: child.record_digest,
    depth: child.statement.depth,
    delegator_id: child.statement.delegator_id,
    delegate_id: child.statement.delegate_id
  });
}
