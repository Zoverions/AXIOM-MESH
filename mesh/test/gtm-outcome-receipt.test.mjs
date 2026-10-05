import assert from 'node:assert/strict';
import test from 'node:test';
import { evaluateGtmAccount } from '../src/check-gtm-evidence.mjs';
import {
  GtmOutcomeReceiptError,
  evaluateGtmOutcomeReceipt
} from '../src/check-gtm-outcome-receipt.mjs';

const EVALUATION_TIME = new Date('2026-09-18T23:59:59Z');

function signal(id, dimension, level) {
  return {
    id,
    dimension,
    level,
    source_url: `https://example.com/${id}`,
    source_kind: 'public_primary',
    observed_at: '2026-09-18',
    valid_until: '2026-10-18',
    independence_group: id,
    summary: 'Direct evidence supporting this account-priority dimension.'
  };
}

function accountCase() {
  const signals = [
    signal('fit-1', 'fit', 3),
    signal('timing-1', 'timing', 3),
    signal('intent-1', 'intent', 2)
  ];
  const accountEvidence = {
    schema: 'axiom-gtm-account-evidence.v0',
    evaluation_version: 'axiom-gtm-priority.v0',
    account_id: 'acct.example',
    created_at: '2026-09-18',
    declared_lane: 'HIGH_SIGNAL',
    signals
  };
  const trustedProvenance = new Map(signals.map(item => [
    item.id,
    { source_url: item.source_url, source_kind: item.source_kind }
  ]));
  const evaluation = evaluateGtmAccount(accountEvidence, {
    evaluationTime: EVALUATION_TIME,
    trustedProvenance
  });
  return { accountEvidence, trustedProvenance, evaluation };
}

function receipt(overrides = {}) {
  const account = accountCase();
  return {
    input: {
      schema: 'axiom-gtm-outcome-receipt.v0',
      receipt_id: 'outcome-001',
      campaign_id: 'campaign.devtools.001',
      account_id: account.evaluation.account_id,
      evaluated_on: account.evaluation.evaluated_on,
      evidence_digest: account.evaluation.evidence_digest,
      operation_ref: 'human:founder-outreach:001',
      outcome_class: 'qualified_conversation',
      occurred_at: '2026-09-18',
      revenue: null,
      outcome_evidence_digest: 'a'.repeat(64),
      summary: 'Founder conversation confirmed the problem, ownership, and a plausible evaluation path.'
    },
    ...account,
    ...overrides
  };
}

function validate(input, accountEvidence, trustedProvenance) {
  return evaluateGtmOutcomeReceipt(input, { accountEvidence, trustedProvenance });
}

test('binds a qualified conversation to the exact account evidence digest', () => {
  const { input, evaluation, accountEvidence, trustedProvenance } = receipt();
  const result = validate(input, accountEvidence, trustedProvenance);

  assert.equal(result.valid, true);
  assert.equal(result.account_id, evaluation.account_id);
  assert.equal(result.evidence_digest, evaluation.evidence_digest);
  assert.equal(result.outcome_class, 'qualified_conversation');
  assert.match(result.receipt_digest, /^[a-f0-9]{64}$/);
});

test('rejects a receipt bound to a different evidence digest', () => {
  const { input, accountEvidence, trustedProvenance } = receipt();
  input.evidence_digest = 'b'.repeat(64);

  assert.throws(
    () => validate(input, accountEvidence, trustedProvenance),
    error => error instanceof GtmOutcomeReceiptError
      && /evidence_digest does not match account evaluation/.test(error.message)
  );
});

test('rejects outcomes dated before the account evaluation', () => {
  const { input, accountEvidence, trustedProvenance } = receipt();
  input.occurred_at = '2026-09-17';

  assert.throws(
    () => validate(input, accountEvidence, trustedProvenance),
    /occurred_at cannot precede account evaluation/
  );
});

test('requires explicit revenue for paid-pilot outcomes', () => {
  const { input, accountEvidence, trustedProvenance } = receipt();
  input.outcome_class = 'paid_pilot';

  assert.throws(
    () => validate(input, accountEvidence, trustedProvenance),
    /revenue is required for paid_pilot/
  );
});

test('accepts bounded revenue only for paid outcomes', () => {
  const { input, accountEvidence, trustedProvenance } = receipt();
  input.outcome_class = 'paid_pilot';
  input.revenue = { currency: 'CAD', amount_minor: 250000 };

  const result = validate(input, accountEvidence, trustedProvenance);
  assert.deepEqual(result.revenue, { currency: 'CAD', amount_minor: 250000 });

  input.outcome_class = 'qualified_conversation';
  assert.throws(
    () => validate(input, accountEvidence, trustedProvenance),
    /revenue must be null unless outcome_class is paid_pilot or revenue_confirmed/
  );
});
