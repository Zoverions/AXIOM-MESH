import {
  ValidationError,
  assertPlainObject,
  assertString,
  digestObject
} from './canonical.mjs';

export const ASSURANCE_CHECK_RECEIPT_SCHEMA = 'axiom-assurance-check-receipt.v1';
export const ASSURANCE_COMPLETION_SCHEMA = 'axiom-assurance-completion.v1';

const ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]*(?:-[A-Za-z0-9_.:-]+)*$/;
const DIGEST = /^[a-f0-9]{64}$/;
const CHECK_RESULTS = new Set(['pass', 'fail', 'inconclusive']);

function id(value, label) {
  return assertString(value, label, { min: 1, max: 192, pattern: ID });
}

function digest(value, label) {
  return assertString(value, label, { min: 64, max: 64, pattern: DIGEST });
}

function timestamp(value, label) {
  const text = assertString(value, label, { min: 24, max: 24 });
  const date = new Date(text);
  if (Number.isNaN(date.valueOf()) || date.toISOString() !== text) {
    throw new ValidationError(`${label} must be a canonical UTC ISO timestamp`);
  }
  return text;
}

export function normalizeAssuranceCheckReceipt(raw) {
  const value = assertPlainObject(raw, 'assurance check receipt');
  if (value.schema !== ASSURANCE_CHECK_RECEIPT_SCHEMA) {
    throw new ValidationError(
      `assurance check receipt schema must be ${ASSURANCE_CHECK_RECEIPT_SCHEMA}`
    );
  }
  if (!CHECK_RESULTS.has(value.result)) {
    throw new ValidationError('assurance check receipt result is unsupported');
  }
  if (!Array.isArray(value.artifact_digests) || value.artifact_digests.length > 32) {
    throw new ValidationError('assurance check receipt artifact_digests must contain at most 32 items');
  }
  const startedAt = timestamp(value.started_at, 'assurance check receipt started_at');
  const completedAt = timestamp(value.completed_at, 'assurance check receipt completed_at');
  if (new Date(completedAt).valueOf() < new Date(startedAt).valueOf()) {
    throw new ValidationError('assurance check receipt completed_at cannot precede started_at');
  }
  const artifacts = [...new Set(value.artifact_digests.map((item, index) => (
    digest(item, `assurance check receipt artifact_digests[${index}]`)
  )))].sort();

  const body = Object.freeze({
    schema: ASSURANCE_CHECK_RECEIPT_SCHEMA,
    check_id: id(value.check_id, 'assurance check receipt check_id'),
    task_id: id(value.task_id, 'assurance check receipt task_id'),
    assurance_decision_digest: digest(
      value.assurance_decision_digest,
      'assurance check receipt assurance_decision_digest'
    ),
    verifier_profile_digest: digest(
      value.verifier_profile_digest,
      'assurance check receipt verifier_profile_digest'
    ),
    independence_digest: value.independence_digest === null || value.independence_digest === undefined
      ? null
      : digest(value.independence_digest, 'assurance check receipt independence_digest'),
    result: value.result,
    started_at: startedAt,
    completed_at: completedAt,
    artifact_digests: Object.freeze(artifacts),
    authority_effect: 'none'
  });
  return Object.freeze({ ...body, receipt_digest: digestObject(body) });
}

export function evaluateAssuranceCompletion({
  taskId,
  assuranceDecisionDigest,
  requiredChecks,
  receipts
} = {}) {
  const task = id(taskId, 'assurance completion taskId');
  const decisionDigest = digest(
    assuranceDecisionDigest,
    'assurance completion assuranceDecisionDigest'
  );
  if (!Array.isArray(requiredChecks) || requiredChecks.length < 1 || requiredChecks.length > 32) {
    throw new ValidationError('assurance completion requiredChecks must contain 1-32 items');
  }
  const required = requiredChecks.map((item, index) => (
    id(item, `assurance completion requiredChecks[${index}]`)
  ));
  if (new Set(required).size !== required.length) {
    throw new ValidationError('assurance completion requiredChecks must be unique');
  }
  if (!Array.isArray(receipts) || receipts.length > 64) {
    throw new ValidationError('assurance completion receipts must contain at most 64 items');
  }

  const normalized = receipts.map(normalizeAssuranceCheckReceipt);
  const seen = new Set();
  for (const receipt of normalized) {
    if (receipt.task_id !== task) {
      throw new ValidationError('assurance check receipt task_id does not match completion task');
    }
    if (receipt.assurance_decision_digest !== decisionDigest) {
      throw new ValidationError('assurance check receipt decision digest does not match');
    }
    if (seen.has(receipt.check_id)) {
      throw new ValidationError(`duplicate assurance check receipt: ${receipt.check_id}`);
    }
    seen.add(receipt.check_id);
  }

  const receiptByCheck = new Map(normalized.map(item => [item.check_id, item]));
  const missing = required.filter(check => !receiptByCheck.has(check));
  const failed = required.filter(check => receiptByCheck.get(check)?.result === 'fail');
  const inconclusive = required.filter(
    check => receiptByCheck.get(check)?.result === 'inconclusive'
  );
  const satisfied = missing.length === 0 && failed.length === 0 && inconclusive.length === 0;

  const body = Object.freeze({
    schema: ASSURANCE_COMPLETION_SCHEMA,
    task_id: task,
    assurance_decision_digest: decisionDigest,
    required_checks: Object.freeze([...required].sort()),
    receipt_digests: Object.freeze(normalized.map(item => item.receipt_digest).sort()),
    missing_checks: Object.freeze([...missing].sort()),
    failed_checks: Object.freeze([...failed].sort()),
    inconclusive_checks: Object.freeze([...inconclusive].sort()),
    satisfied,
    authority_effect: 'none'
  });
  return Object.freeze({ ...body, completion_digest: digestObject(body) });
}
