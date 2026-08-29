import {
  ValidationError,
  assertPlainObject,
  canonicalJson,
  digestObject
} from './canonical.mjs';
import { verifyAgentPortableWorkReceipt } from './agent-trust-portable-work-receipt.mjs';
import { evaluateAgentCurrentnessAtEffect } from './agent-trust-currentness-checkpoint.mjs';

export const AGENT_PORTABLE_RECEIPT_CURRENTNESS_BINDING_SCHEMA =
  'axiom-agent-portable-receipt-currentness-binding.v1';

const TOP_KEYS = new Set([
  'schema',
  'binding_kind',
  'binding_scope',
  'portable_work_receipt_digest',
  'handoff_digest',
  'executor_principal_id',
  'executor_credential_digest',
  'grid_intent_id',
  'grid_terminal_status',
  'grid_intent_started_at',
  'currentness_boundary',
  'currentness_checkpoint_digest',
  'currentness_evaluated_at',
  'currentness_rechecked_at',
  'currentness_evidence_age_ms',
  'currentness_max_evidence_age_ms',
  'currentness_active_credential_digest',
  'known_active_under_retained_evidence',
  'portable_receipt_reverified',
  'currentness_checkpoint_reverified',
  'currentness_rechecked',
  'currentness_consulted_by_original_effect_path',
  'binding_signature_present',
  'global_currentness_claimed',
  'effect_admission_authorized',
  'consume_before_effect_observed',
  'task_success_claimed',
  'effect_specific_execution_claimed',
  'authority_effect',
  'delegation_effect',
  'binding_digest'
]);

const FIXED_SEMANTICS = Object.freeze({
  binding_kind: 'portable-receipt-currentness-recheck',
  binding_scope: 'post-hoc-evidence-composition',
  currentness_boundary: 'grid-intent-start',
  known_active_under_retained_evidence: true,
  portable_receipt_reverified: true,
  currentness_checkpoint_reverified: true,
  currentness_rechecked: true,
  currentness_consulted_by_original_effect_path: false,
  binding_signature_present: false,
  global_currentness_claimed: false,
  effect_admission_authorized: false,
  consume_before_effect_observed: false,
  task_success_claimed: false,
  effect_specific_execution_claimed: false,
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

function assertFixedSemantics(value) {
  for (const [key, expected] of Object.entries(FIXED_SEMANTICS)) {
    if (value[key] !== expected) {
      throw new ValidationError(`portable receipt currentness binding ${key} must remain ${String(expected)}`);
    }
  }
}

function buildBindingBody({ portableWorkReceipt, portableReceiptEvidence, currentnessEvidence }) {
  const receipt = verifyAgentPortableWorkReceipt(portableWorkReceipt, portableReceiptEvidence);
  const receiptStatement = assertPlainObject(
    portableWorkReceipt.statement,
    'portable receipt currentness binding receipt statement'
  );

  const currentness = evaluateAgentCurrentnessAtEffect({
    ...currentnessEvidence,
    effectAt: receiptStatement.started_at
  });

  if (currentness.principal_id !== receipt.executor_principal_id) {
    throw new ValidationError(
      'portable receipt currentness binding principal does not match verified executor'
    );
  }
  if (currentness.active_credential_digest !== receiptStatement.executor_credential_digest) {
    throw new ValidationError(
      'portable receipt currentness binding active credential does not match verified executor credential'
    );
  }
  if (currentness.effect_at !== receiptStatement.started_at) {
    throw new ValidationError(
      'portable receipt currentness binding must recheck at the Grid intent start boundary'
    );
  }
  if (
    currentness.effect_admission_authorized !== false
    || currentness.consume_before_effect_observed !== false
    || currentness.global_currentness_claimed !== false
  ) {
    throw new ValidationError('portable receipt currentness binding currentness semantics were elevated');
  }

  return Object.freeze({
    schema: AGENT_PORTABLE_RECEIPT_CURRENTNESS_BINDING_SCHEMA,
    ...FIXED_SEMANTICS,
    portable_work_receipt_digest: receipt.receipt_digest,
    handoff_digest: receipt.handoff_digest,
    executor_principal_id: receipt.executor_principal_id,
    executor_credential_digest: receiptStatement.executor_credential_digest,
    grid_intent_id: receipt.grid_intent_id,
    grid_terminal_status: receipt.terminal_status,
    grid_intent_started_at: receiptStatement.started_at,
    currentness_checkpoint_digest: currentness.checkpoint_digest,
    currentness_evaluated_at: currentness.evaluated_at,
    currentness_rechecked_at: currentness.effect_at,
    currentness_evidence_age_ms: currentness.evidence_age_ms,
    currentness_max_evidence_age_ms: currentness.max_evidence_age_ms,
    currentness_active_credential_digest: currentness.active_credential_digest
  });
}

export function createAgentPortableReceiptCurrentnessBinding({
  portableWorkReceipt,
  portableReceiptEvidence,
  currentnessEvidence
} = {}) {
  const body = buildBindingBody({ portableWorkReceipt, portableReceiptEvidence, currentnessEvidence });
  return Object.freeze({ ...body, binding_digest: digestObject(body) });
}

export function verifyAgentPortableReceiptCurrentnessBinding(raw, evidence = {}) {
  const value = exactObject(
    raw,
    TOP_KEYS,
    'portable receipt currentness binding'
  );
  if (value.schema !== AGENT_PORTABLE_RECEIPT_CURRENTNESS_BINDING_SCHEMA) {
    throw new ValidationError(
      `portable receipt currentness binding schema must be ${AGENT_PORTABLE_RECEIPT_CURRENTNESS_BINDING_SCHEMA}`
    );
  }
  assertFixedSemantics(value);
  const expected = createAgentPortableReceiptCurrentnessBinding(evidence);
  if (canonicalJson(value) !== canonicalJson(expected)) {
    throw new ValidationError('portable receipt currentness binding does not reproduce from bound evidence');
  }
  return Object.freeze({
    valid: true,
    binding_digest: expected.binding_digest,
    portable_work_receipt_digest: expected.portable_work_receipt_digest,
    currentness_checkpoint_digest: expected.currentness_checkpoint_digest,
    executor_principal_id: expected.executor_principal_id,
    currentness_rechecked_at: expected.currentness_rechecked_at,
    known_active_under_retained_evidence: true,
    currentness_consulted_by_original_effect_path: false,
    effect_admission_authorized: false,
    consume_before_effect_observed: false,
    task_success_claimed: false,
    authority_effect: 'none'
  });
}
