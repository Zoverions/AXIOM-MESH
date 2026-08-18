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
  validateMachineIntentReceipt,
  verifyMachineIntentReceipt
} from './machine-receipt.mjs';

export const AGENT_PORTABLE_WORK_RECEIPT_SCHEMA = 'axiom-agent-portable-work-receipt.v1';

const DIGEST = /^[a-f0-9]{64}$/;
const ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,191}$/;
const BASE64URL = /^[A-Za-z0-9_-]+$/;
const TERMINAL = new Set(['completed', 'denied', 'failed']);

const TOP_KEYS = new Set([
  'schema', 'statement', 'statement_digest', 'executor_signature', 'receipt_digest'
]);
const STATEMENT_KEYS = new Set([
  'receipt_id',
  'handoff_digest',
  'handoff_id',
  'sender_principal_id',
  'recipient_principal_id',
  'executor_principal_id',
  'executor_credential_digest',
  'executor_operational_key_id',
  'executor_identity_profile',
  'grid_machine_receipt_digest',
  'grid_intent_id',
  'grid_terminal_status',
  'grid_action',
  'grid_input_digest',
  'grid_invocation_digest',
  'grid_machine_authority_digest',
  'grid_chain_head',
  'grid_verification_mode',
  'grid_prefix_assurance',
  'terminal_outcome_kind',
  'terminal_outcome_digest',
  'terminal_payload_digest',
  'started_at',
  'finished_at',
  'reported_artifact_digests',
  'reported_evidence_digests',
  'receipt_kind',
  'terminal_state_scope',
  'clock_assurance',
  'task_success_claimed',
  'application_correctness_claimed',
  'truth_claimed',
  'effect_specific_execution_claimed',
  'effect_specific_receipt_bound',
  'artifact_availability_claimed',
  'reported_artifacts_verified',
  'reported_evidence_verified',
  'handoff_authority_claimed',
  'global_currentness_claimed',
  'authority_effect',
  'delegation_effect'
]);

const FIXED_SEMANTICS = Object.freeze({
  receipt_kind: 'portable-grid-terminal-evidence',
  terminal_state_scope: 'grid-intent-lifecycle-only',
  clock_assurance: 'grid-materialized-timestamps-only',
  task_success_claimed: false,
  application_correctness_claimed: false,
  truth_claimed: false,
  effect_specific_execution_claimed: false,
  effect_specific_receipt_bound: false,
  artifact_availability_claimed: false,
  reported_artifacts_verified: false,
  reported_evidence_verified: false,
  handoff_authority_claimed: false,
  global_currentness_claimed: false,
  authority_effect: 'none',
  delegation_effect: 'none'
});

function exactObject(raw, allowed, label) {
  const value = assertPlainObject(raw, label);
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) throw new ValidationError(`${label} contains unsupported field ${key}`);
  }
  return value;
}

function identifier(value, label) {
  return assertString(value, label, { min: 1, max: 192, pattern: ID });
}

function digest(value, label) {
  return assertString(value, label, { min: 64, max: 64, pattern: DIGEST });
}

function canonicalTimestamp(value, label) {
  const text = assertString(value, label, { min: 24, max: 24 });
  const parsed = new Date(text);
  if (Number.isNaN(parsed.valueOf()) || parsed.toISOString() !== text) {
    throw new ValidationError(`${label} must be a canonical UTC ISO timestamp`);
  }
  return text;
}

function canonicalDigestSet(raw, label, maxItems = 256) {
  if (!Array.isArray(raw) || raw.length > maxItems) {
    throw new ValidationError(`${label} must contain at most ${maxItems} digests`);
  }
  const values = raw.map((item, index) => digest(item, `${label}[${index}]`));
  const canonical = [...new Set(values)].sort();
  if (canonicalJson(values) !== canonicalJson(canonical)) {
    throw new ValidationError(`${label} must be sorted and unique`);
  }
  return Object.freeze(canonical);
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

function assertSuppliedSemantics(value) {
  for (const [key, expected] of Object.entries(FIXED_SEMANTICS)) {
    if (value[key] !== expected) {
      throw new ValidationError(`portable work receipt ${key} must remain ${String(expected)}`);
    }
  }
}

function terminalOutcome(machineReceipt) {
  const status = machineReceipt.statement.intent.status;
  const outcome = machineReceipt.statement.outcome;
  if (status === 'completed') {
    return Object.freeze({
      kind: 'intent.completed',
      digest: digest(outcome.result_digest, 'machine receipt result_digest'),
      terminalPayloadDigest: digest(
        outcome.terminal_payload_digest,
        'machine receipt terminal_payload_digest'
      )
    });
  }
  return Object.freeze({
    kind: `intent.${status}`,
    digest: digest(outcome.error_digest, 'machine receipt error_digest'),
    terminalPayloadDigest: digest(
      outcome.terminal_payload_digest,
      'machine receipt terminal_payload_digest'
    )
  });
}

function verifyBoundInputs({
  handoff,
  executorCredential,
  machineReceipt,
  gridPublicKey
}) {
  validateMachineIntentReceipt(machineReceipt);
  const gridVerification = verifyMachineIntentReceipt(machineReceipt, gridPublicKey);
  if (gridVerification.valid !== true) {
    throw new ValidationError('portable work receipt requires a valid Grid machine intent receipt signature');
  }

  const gridStatement = machineReceipt.statement;
  const gridIntent = gridStatement.intent;
  if (!TERMINAL.has(gridIntent.status)) {
    throw new ValidationError('portable work receipt requires a supported Grid terminal status');
  }
  if (executorCredential.credential_digest !== handoff.statement.intended_executor_identity_digest) {
    throw new ValidationError('portable work receipt executor credential does not match handoff target identity digest');
  }
  if (executorCredential.statement.principal_id !== handoff.statement.intended_executor_id) {
    throw new ValidationError('portable work receipt executor principal does not match handoff intended executor');
  }
  if (gridIntent.principal !== executorCredential.statement.principal_id) {
    throw new ValidationError('portable work receipt Grid intent principal does not match executor identity');
  }
  if (gridIntent.action !== handoff.statement.action) {
    throw new ValidationError('portable work receipt Grid intent action does not match handoff');
  }
  if (gridIntent.input_digest !== handoff.statement.input_digest) {
    throw new ValidationError('portable work receipt Grid intent input digest does not match handoff');
  }
  if (
    gridStatement.authority.machine_authority_digest
    !== executorCredential.statement.principal_authority_digest
  ) {
    throw new ValidationError('portable work receipt Grid machine authority does not match executor credential');
  }

  const startedAt = canonicalTimestamp(gridIntent.created_at, 'portable work receipt Grid intent created_at');
  const finishedAt = canonicalTimestamp(gridIntent.updated_at, 'portable work receipt Grid intent updated_at');
  if (new Date(finishedAt).valueOf() < new Date(startedAt).valueOf()) {
    throw new ValidationError('portable work receipt Grid intent finish precedes start');
  }
  if (
    new Date(startedAt).valueOf() < new Date(handoff.statement.not_before).valueOf()
    || new Date(startedAt).valueOf() >= new Date(handoff.statement.expires_at).valueOf()
  ) {
    throw new ValidationError('portable work receipt Grid intent did not start inside handoff proposal window');
  }

  const outcome = terminalOutcome(machineReceipt);
  return Object.freeze({ gridVerification, gridStatement, gridIntent, startedAt, finishedAt, outcome });
}

function normalizeStatement(raw, evidence) {
  const value = exactObject(raw, STATEMENT_KEYS, 'portable work receipt statement');
  assertSuppliedSemantics(value);

  const handoff = evidence.handoff;
  const executorCredential = evidence.executorCredential;
  const machineReceipt = evidence.machineReceipt;
  const checked = verifyBoundInputs({
    handoff,
    executorCredential,
    machineReceipt,
    gridPublicKey: evidence.gridPublicKey
  });

  const status = assertString(value.grid_terminal_status, 'portable work receipt grid_terminal_status', {
    min: 4,
    max: 16
  });
  if (!TERMINAL.has(status)) {
    throw new ValidationError('portable work receipt grid_terminal_status is unsupported');
  }

  const statement = Object.freeze({
    receipt_id: identifier(value.receipt_id, 'portable work receipt receipt_id'),
    handoff_digest: digest(value.handoff_digest, 'portable work receipt handoff_digest'),
    handoff_id: identifier(value.handoff_id, 'portable work receipt handoff_id'),
    sender_principal_id: identifier(value.sender_principal_id, 'portable work receipt sender_principal_id'),
    recipient_principal_id: identifier(value.recipient_principal_id, 'portable work receipt recipient_principal_id'),
    executor_principal_id: identifier(value.executor_principal_id, 'portable work receipt executor_principal_id'),
    executor_credential_digest: digest(
      value.executor_credential_digest,
      'portable work receipt executor_credential_digest'
    ),
    executor_operational_key_id: digest(
      value.executor_operational_key_id,
      'portable work receipt executor_operational_key_id'
    ),
    executor_identity_profile: assertString(
      value.executor_identity_profile,
      'portable work receipt executor_identity_profile',
      { min: 1, max: 64 }
    ),
    grid_machine_receipt_digest: digest(
      value.grid_machine_receipt_digest,
      'portable work receipt grid_machine_receipt_digest'
    ),
    grid_intent_id: identifier(value.grid_intent_id, 'portable work receipt grid_intent_id'),
    grid_terminal_status: status,
    grid_action: assertString(value.grid_action, 'portable work receipt grid_action', { min: 2, max: 128 }),
    grid_input_digest: digest(value.grid_input_digest, 'portable work receipt grid_input_digest'),
    grid_invocation_digest: digest(
      value.grid_invocation_digest,
      'portable work receipt grid_invocation_digest'
    ),
    grid_machine_authority_digest: digest(
      value.grid_machine_authority_digest,
      'portable work receipt grid_machine_authority_digest'
    ),
    grid_chain_head: digest(value.grid_chain_head, 'portable work receipt grid_chain_head'),
    grid_verification_mode: assertString(
      value.grid_verification_mode,
      'portable work receipt grid_verification_mode',
      { min: 1, max: 64 }
    ),
    grid_prefix_assurance: assertString(
      value.grid_prefix_assurance,
      'portable work receipt grid_prefix_assurance',
      { min: 1, max: 64 }
    ),
    terminal_outcome_kind: assertString(
      value.terminal_outcome_kind,
      'portable work receipt terminal_outcome_kind',
      { min: 1, max: 64 }
    ),
    terminal_outcome_digest: digest(
      value.terminal_outcome_digest,
      'portable work receipt terminal_outcome_digest'
    ),
    terminal_payload_digest: digest(
      value.terminal_payload_digest,
      'portable work receipt terminal_payload_digest'
    ),
    started_at: canonicalTimestamp(value.started_at, 'portable work receipt started_at'),
    finished_at: canonicalTimestamp(value.finished_at, 'portable work receipt finished_at'),
    reported_artifact_digests: canonicalDigestSet(
      value.reported_artifact_digests,
      'portable work receipt reported_artifact_digests'
    ),
    reported_evidence_digests: canonicalDigestSet(
      value.reported_evidence_digests,
      'portable work receipt reported_evidence_digests'
    ),
    ...FIXED_SEMANTICS
  });

  const expected = {
    handoff_digest: handoff.handoff_digest,
    handoff_id: handoff.statement.handoff_id,
    sender_principal_id: handoff.statement.sender_principal_id,
    recipient_principal_id: handoff.statement.recipient_principal_id,
    executor_principal_id: executorCredential.statement.principal_id,
    executor_credential_digest: executorCredential.credential_digest,
    executor_operational_key_id: executorCredential.statement.operational_key_id,
    executor_identity_profile: 'a1-machine-identity-credential',
    grid_machine_receipt_digest: machineReceipt.receipt_digest,
    grid_intent_id: checked.gridIntent.intent_id,
    grid_terminal_status: checked.gridIntent.status,
    grid_action: checked.gridIntent.action,
    grid_input_digest: checked.gridIntent.input_digest,
    grid_invocation_digest: checked.gridStatement.authority.invocation_digest,
    grid_machine_authority_digest: checked.gridStatement.authority.machine_authority_digest,
    grid_chain_head: checked.gridStatement.chain.head,
    grid_verification_mode: checked.gridStatement.chain.verification_mode,
    grid_prefix_assurance: checked.gridStatement.chain.prefix_assurance,
    terminal_outcome_kind: checked.outcome.kind,
    terminal_outcome_digest: checked.outcome.digest,
    terminal_payload_digest: checked.outcome.terminalPayloadDigest,
    started_at: checked.startedAt,
    finished_at: checked.finishedAt
  };
  for (const [key, expectedValue] of Object.entries(expected)) {
    if (statement[key] !== expectedValue) {
      throw new ValidationError(`portable work receipt ${key} does not match bound evidence`);
    }
  }
  return statement;
}

export function createAgentPortableWorkReceipt({
  receiptId,
  handoff: rawHandoff,
  handoffEvidence,
  executorIdentityCredential,
  trustedExecutorIssuerPublicKey,
  executorOperationalPrivateKey,
  gridMachineReceipt,
  gridPublicKey,
  reportedArtifactDigests = [],
  reportedEvidenceDigests = []
} = {}) {
  const handoff = verifyAgentSignedHandoff(rawHandoff, handoffEvidence);
  const executorCredential = verifyMachineIdentityCredential(executorIdentityCredential, {
    trustedIssuerPublicKey: trustedExecutorIssuerPublicKey,
    expectedPrincipalId: handoff.statement.intended_executor_id
  });
  const privateKey = parsePrivateKey(
    executorOperationalPrivateKey,
    'portable work receipt executor operational private key'
  );
  if (machineIdentityKeyId(createPublicKey(privateKey)) !== executorCredential.statement.operational_key_id) {
    throw new ValidationError('portable work receipt executor operational key does not match identity credential');
  }

  const machineReceipt = validateMachineIntentReceipt(gridMachineReceipt);
  const checked = verifyBoundInputs({
    handoff,
    executorCredential,
    machineReceipt,
    gridPublicKey
  });

  const rawStatement = {
    receipt_id: receiptId,
    handoff_digest: handoff.handoff_digest,
    handoff_id: handoff.statement.handoff_id,
    sender_principal_id: handoff.statement.sender_principal_id,
    recipient_principal_id: handoff.statement.recipient_principal_id,
    executor_principal_id: executorCredential.statement.principal_id,
    executor_credential_digest: executorCredential.credential_digest,
    executor_operational_key_id: executorCredential.statement.operational_key_id,
    executor_identity_profile: 'a1-machine-identity-credential',
    grid_machine_receipt_digest: machineReceipt.receipt_digest,
    grid_intent_id: checked.gridIntent.intent_id,
    grid_terminal_status: checked.gridIntent.status,
    grid_action: checked.gridIntent.action,
    grid_input_digest: checked.gridIntent.input_digest,
    grid_invocation_digest: checked.gridStatement.authority.invocation_digest,
    grid_machine_authority_digest: checked.gridStatement.authority.machine_authority_digest,
    grid_chain_head: checked.gridStatement.chain.head,
    grid_verification_mode: checked.gridStatement.chain.verification_mode,
    grid_prefix_assurance: checked.gridStatement.chain.prefix_assurance,
    terminal_outcome_kind: checked.outcome.kind,
    terminal_outcome_digest: checked.outcome.digest,
    terminal_payload_digest: checked.outcome.terminalPayloadDigest,
    started_at: checked.startedAt,
    finished_at: checked.finishedAt,
    reported_artifact_digests: [...new Set(reportedArtifactDigests)].sort(),
    reported_evidence_digests: [...new Set(reportedEvidenceDigests)].sort(),
    ...FIXED_SEMANTICS
  };

  const statement = normalizeStatement(rawStatement, {
    handoff,
    executorCredential,
    machineReceipt,
    gridPublicKey
  });
  const statementDigest = digestObject(statement);
  const signable = Object.freeze({
    schema: AGENT_PORTABLE_WORK_RECEIPT_SCHEMA,
    statement,
    statement_digest: statementDigest
  });
  const signature = sign(null, Buffer.from(canonicalJson(signable)), privateKey).toString('base64url');
  const signed = Object.freeze({
    schema: AGENT_PORTABLE_WORK_RECEIPT_SCHEMA,
    statement,
    statement_digest: statementDigest,
    executor_signature: signature
  });
  return Object.freeze({ ...signed, receipt_digest: digestObject(signed) });
}

export function verifyAgentPortableWorkReceipt(raw, {
  handoff: rawHandoff,
  handoffEvidence,
  executorIdentityCredential,
  trustedExecutorIssuerPublicKey,
  gridMachineReceipt,
  gridPublicKey,
  expectedReceiptId,
  expectedArtifactDigests,
  expectedEvidenceDigests
} = {}) {
  const value = exactObject(raw, TOP_KEYS, 'portable work receipt');
  if (value.schema !== AGENT_PORTABLE_WORK_RECEIPT_SCHEMA) {
    throw new ValidationError(`portable work receipt schema must be ${AGENT_PORTABLE_WORK_RECEIPT_SCHEMA}`);
  }
  const handoff = verifyAgentSignedHandoff(rawHandoff, handoffEvidence);
  const executorCredential = verifyMachineIdentityCredential(executorIdentityCredential, {
    trustedIssuerPublicKey: trustedExecutorIssuerPublicKey,
    expectedPrincipalId: handoff.statement.intended_executor_id
  });
  const machineReceipt = validateMachineIntentReceipt(gridMachineReceipt);
  const statement = normalizeStatement(value.statement, {
    handoff,
    executorCredential,
    machineReceipt,
    gridPublicKey
  });
  const statementDigest = digest(value.statement_digest, 'portable work receipt statement_digest');
  if (statementDigest !== digestObject(statement)) {
    throw new ValidationError('portable work receipt statement digest mismatch');
  }
  const signature = assertString(value.executor_signature, 'portable work receipt executor_signature', {
    min: 32,
    max: 1024,
    pattern: BASE64URL
  });
  const executorPublicKey = parsePublicKey(
    executorCredential.statement.operational_public_key,
    'portable work receipt executor operational public key'
  );
  let validSignature = false;
  try {
    validSignature = verify(
      null,
      Buffer.from(canonicalJson({
        schema: AGENT_PORTABLE_WORK_RECEIPT_SCHEMA,
        statement,
        statement_digest: statementDigest
      })),
      executorPublicKey,
      Buffer.from(signature, 'base64url')
    );
  } catch {
    validSignature = false;
  }
  if (!validSignature) throw new ValidationError('portable work receipt executor signature is invalid');

  const signed = Object.freeze({
    schema: AGENT_PORTABLE_WORK_RECEIPT_SCHEMA,
    statement,
    statement_digest: statementDigest,
    executor_signature: signature
  });
  const receiptDigest = digest(value.receipt_digest, 'portable work receipt receipt_digest');
  if (receiptDigest !== digestObject(signed)) {
    throw new ValidationError('portable work receipt receipt_digest mismatch');
  }

  if (expectedReceiptId !== undefined && statement.receipt_id !== expectedReceiptId) {
    throw new ValidationError('portable work receipt receipt_id mismatch');
  }
  if (expectedArtifactDigests !== undefined) {
    const expected = [...new Set(expectedArtifactDigests)].sort();
    if (canonicalJson(statement.reported_artifact_digests) !== canonicalJson(expected)) {
      throw new ValidationError('portable work receipt artifact digest set mismatch');
    }
  }
  if (expectedEvidenceDigests !== undefined) {
    const expected = [...new Set(expectedEvidenceDigests)].sort();
    if (canonicalJson(statement.reported_evidence_digests) !== canonicalJson(expected)) {
      throw new ValidationError('portable work receipt evidence digest set mismatch');
    }
  }

  return Object.freeze({
    valid: true,
    receipt_digest: receiptDigest,
    handoff_digest: statement.handoff_digest,
    executor_principal_id: statement.executor_principal_id,
    grid_intent_id: statement.grid_intent_id,
    terminal_status: statement.grid_terminal_status,
    terminal_outcome_digest: statement.terminal_outcome_digest,
    grid_machine_receipt_digest: statement.grid_machine_receipt_digest,
    grid_terminal_receipt_verified: true,
    executor_signature_verified: true,
    effect_specific_receipt_bound: false,
    task_success_claimed: false
  });
}
