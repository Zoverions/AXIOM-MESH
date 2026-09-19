import { createHash } from 'node:crypto';
import { evaluateGtmAccount } from './check-gtm-evidence.mjs';

export const GTM_OUTCOME_RECEIPT_SCHEMA = 'axiom-gtm-outcome-receipt.v0';

const RECEIPT_FIELDS = Object.freeze([
  'schema',
  'receipt_id',
  'campaign_id',
  'account_id',
  'evaluated_on',
  'evidence_digest',
  'operation_ref',
  'outcome_class',
  'occurred_at',
  'revenue',
  'outcome_evidence_digest',
  'summary'
]);

const REVENUE_FIELDS = Object.freeze(['currency', 'amount_minor']);

const OUTCOME_CLASSES = Object.freeze([
  'no_response',
  'negative_reply',
  'positive_reply',
  'qualified_conversation',
  'demo_completed',
  'trial_started',
  'paid_pilot',
  'closed_won',
  'closed_lost',
  'revenue_confirmed'
]);

const PAID_OUTCOMES = new Set(['paid_pilot', 'revenue_confirmed']);
const IDENTIFIER = /^[a-z0-9][a-z0-9._:-]{0,127}$/;
const DATE = /^\\d{4}-\\d{2}-\\d{2}$/;
const DIGEST = /^[a-f0-9]{64}$/;
const CURRENCY = /^[A-Z]{3}$/;

export class GtmOutcomeReceiptError extends Error {
  constructor(message) {
    super(message);
    this.name = 'GtmOutcomeReceiptError';
  }
}

function assertObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new GtmOutcomeReceiptError(`${label} must be an object`);
  }
  return value;
}

function exactFields(value, fields, label) {
  const object = assertObject(value, label);
  const expected = new Set(fields);
  for (const key of Object.keys(object)) {
    if (!expected.has(key)) {
      throw new GtmOutcomeReceiptError(`${label} contains unknown field ${key}`);
    }
  }
  for (const key of fields) {
    if (!Object.hasOwn(object, key)) {
      throw new GtmOutcomeReceiptError(`${label}.${key} is required`);
    }
  }
  return object;
}

function string(value, label, { pattern = null, min = 1, max = 2048 } = {}) {
  if (typeof value !== 'string' || value.length < min || value.length > max) {
    throw new GtmOutcomeReceiptError(`${label} must be a string of length ${min}-${max}`);
  }
  if (pattern && !pattern.test(value)) {
    throw new GtmOutcomeReceiptError(`${label} has invalid format`);
  }
  return value;
}

function date(value, label) {
  string(value, label, { pattern: DATE, max: 10 });
  const parsed = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(parsed.valueOf()) || parsed.toISOString().slice(0, 10) !== value) {
    throw new GtmOutcomeReceiptError(`${label} must be a real calendar date`);
  }
  return value;
}

function enumValue(value, allowed, label) {
  if (!allowed.includes(value)) {
    throw new GtmOutcomeReceiptError(`${label} must be one of ${allowed.join(', ')}`);
  }
  return value;
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.keys(value).sort().map(key => [key, stableValue(value[key])])
  );
}

function digest(value) {
  return createHash('sha256')
    .update(JSON.stringify(stableValue(value)))
    .digest('hex');
}

function normalizeRevenue(value, outcomeClass) {
  if (value === null) {
    if (PAID_OUTCOMES.has(outcomeClass)) {
      throw new GtmOutcomeReceiptError(`revenue is required for ${outcomeClass}`);
    }
    return null;
  }

  if (!PAID_OUTCOMES.has(outcomeClass)) {
    throw new GtmOutcomeReceiptError(
      'revenue must be null unless outcome_class is paid_pilot or revenue_confirmed'
    );
  }

  const revenue = exactFields(value, REVENUE_FIELDS, 'gtm outcome receipt.revenue');
  const currency = string(revenue.currency, 'gtm outcome receipt.revenue.currency', {
    pattern: CURRENCY,
    max: 3
  });
  if (!Number.isSafeInteger(revenue.amount_minor) || revenue.amount_minor <= 0) {
    throw new GtmOutcomeReceiptError(
      'gtm outcome receipt.revenue.amount_minor must be a positive safe integer'
    );
  }
  return Object.freeze({ currency, amount_minor: revenue.amount_minor });
}

export function evaluateGtmOutcomeReceipt(
  input,
  { accountEvidence, trustedProvenance } = {}
) {
  const value = exactFields(input, RECEIPT_FIELDS, 'gtm outcome receipt');

  if (value.schema !== GTM_OUTCOME_RECEIPT_SCHEMA) {
    throw new GtmOutcomeReceiptError(
      `gtm outcome receipt.schema must be ${GTM_OUTCOME_RECEIPT_SCHEMA}`
    );
  }

  const receiptId = string(value.receipt_id, 'gtm outcome receipt.receipt_id', {
    pattern: IDENTIFIER,
    max: 128
  });
  const campaignId = string(value.campaign_id, 'gtm outcome receipt.campaign_id', {
    pattern: IDENTIFIER,
    max: 128
  });
  const accountId = string(value.account_id, 'gtm outcome receipt.account_id', {
    pattern: IDENTIFIER,
    max: 128
  });
  const evaluatedOn = date(value.evaluated_on, 'gtm outcome receipt.evaluated_on');
  const evidenceDigest = string(value.evidence_digest, 'gtm outcome receipt.evidence_digest', {
    pattern: DIGEST,
    max: 64
  });
  const operationRef = string(value.operation_ref, 'gtm outcome receipt.operation_ref', {
    pattern: IDENTIFIER,
    max: 128
  });
  const outcomeClass = enumValue(
    value.outcome_class,
    OUTCOME_CLASSES,
    'gtm outcome receipt.outcome_class'
  );
  const occurredAt = date(value.occurred_at, 'gtm outcome receipt.occurred_at');
  const outcomeEvidenceDigest = string(
    value.outcome_evidence_digest,
    'gtm outcome receipt.outcome_evidence_digest',
    { pattern: DIGEST, max: 64 }
  );
  const summary = string(value.summary, 'gtm outcome receipt.summary', {
    min: 20,
    max: 800
  });

  const evaluation = evaluateGtmAccount(accountEvidence, {
    evaluationTime: new Date(`${evaluatedOn}T23:59:59.999Z`),
    trustedProvenance
  });
  if (evaluation.evaluated_on !== evaluatedOn) {
    throw new GtmOutcomeReceiptError('evaluated_on does not match account evaluation');
  }

  if (accountId !== evaluation.account_id) {
    throw new GtmOutcomeReceiptError('account_id does not match account evaluation');
  }
  if (evidenceDigest !== evaluation.evidence_digest) {
    throw new GtmOutcomeReceiptError(
      'evidence_digest does not match account evaluation'
    );
  }
  if (occurredAt < evaluation.evaluated_on) {
    throw new GtmOutcomeReceiptError(
      'occurred_at cannot precede account evaluation'
    );
  }

  const revenue = normalizeRevenue(value.revenue, outcomeClass);
  const normalized = Object.freeze({
    schema: value.schema,
    receipt_id: receiptId,
    campaign_id: campaignId,
    account_id: accountId,
    evaluated_on: evaluatedOn,
    evidence_digest: evidenceDigest,
    operation_ref: operationRef,
    outcome_class: outcomeClass,
    occurred_at: occurredAt,
    revenue,
    outcome_evidence_digest: outcomeEvidenceDigest,
    summary
  });

  return Object.freeze({
    valid: true,
    receipt_id: receiptId,
    campaign_id: campaignId,
    account_id: accountId,
    evaluated_on: evaluatedOn,
    evidence_digest: evidenceDigest,
    outcome_class: outcomeClass,
    occurred_at: occurredAt,
    revenue,
    receipt_digest: digest(normalized)
  });
}
