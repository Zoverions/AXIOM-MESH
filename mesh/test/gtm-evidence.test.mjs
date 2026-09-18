import assert from 'node:assert/strict';
import test from 'node:test';
import {
  GtmEvidenceError,
  evaluateGtmAccount
} from '../src/check-gtm-evidence.mjs';

const EVALUATION_TIME = new Date('2026-09-18T23:59:59Z');

function signal(id, dimension, level, overrides = {}) {
  return {
    id,
    dimension,
    level,
    source_url: `https://example.com/${id}`,
    source_kind: 'public_primary',
    observed_at: '2026-09-18',
    valid_until: '2026-10-18',
    independence_group: id,
    summary: 'Direct evidence supporting this account-priority dimension.',
    ...overrides
  };
}

function trustedProvenance(signals) {
  return new Map(signals.map(item => [
    item.id,
    Object.freeze({
      source_url: item.source_url,
      source_kind: item.source_kind
    })
  ]));
}

function evaluateTrusted(input) {
  return evaluateGtmAccount(input, {
    evaluationTime: EVALUATION_TIME,
    trustedProvenance: trustedProvenance(input.signals)
  });
}

function account(signals, declaredLane, overrides = {}) {
  return {
    schema: 'axiom-gtm-account-evidence.v0',
    evaluation_version: 'axiom-gtm-priority.v0',
    account_id: 'acct.example',
    created_at: '2026-09-18',
    declared_lane: declaredLane,
    signals,
    ...overrides
  };
}

test('routes strong fit, recent timing, and observed intent to HIGH_SIGNAL', () => {
  const result = evaluateTrusted(account([
    signal('fit-1', 'fit', 3),
    signal('timing-1', 'timing', 3),
    signal('intent-1', 'intent', 2)
  ], 'HIGH_SIGNAL'));

  assert.equal(result.lane, 'HIGH_SIGNAL');
  assert.deepEqual(result.vector, { fit: 3, timing: 3, intent: 2, confidence: 2 });
  assert.equal(result.active_signals, 3);
  assert.equal(result.expired_signals, 0);
  assert.match(result.evidence_digest, /^[a-f0-9]{64}$/);
});

test('expired timing evidence cannot keep an account HIGH_SIGNAL', () => {
  const result = evaluateTrusted(account([
    signal('fit-1', 'fit', 3),
    signal('timing-old', 'timing', 3, {
      observed_at: '2026-08-18',
      valid_until: '2026-09-17'
    }),
    signal('intent-1', 'intent', 2)
  ], 'WATCH'));

  assert.equal(result.lane, 'WATCH');
  assert.deepEqual(result.vector, { fit: 3, timing: 0, intent: 2, confidence: 0 });
  assert.equal(result.expired_signals, 1);
});

test('secondary evidence caps confidence and routes otherwise strong evidence to RESEARCH', () => {
  const result = evaluateTrusted(account([
    signal('fit-1', 'fit', 3),
    signal('timing-1', 'timing', 3, { source_kind: 'public_secondary' }),
    signal('intent-1', 'intent', 2)
  ], 'RESEARCH'));

  assert.equal(result.lane, 'RESEARCH');
  assert.equal(result.vector.confidence, 1);
});

test('rejects one source URL split across multiple independence groups', () => {
  assert.throws(
    () => evaluateTrusted(account([
      signal('fit-1', 'fit', 3, {
        source_url: 'https://example.com/shared',
        independence_group: 'a'
      }),
      signal('timing-1', 'timing', 3, {
        source_url: 'https://example.com/shared',
        independence_group: 'b'
      })
    ], 'RESEARCH')),
    /maps to multiple independence groups/
  );
});

test('fails closed when declared lane overstates the computed lane', () => {
  assert.throws(
    () => evaluateTrusted(account([
      signal('fit-1', 'fit', 3),
      signal('timing-1', 'timing', 1),
      signal('intent-1', 'intent', 2)
    ], 'HIGH_SIGNAL')),
    error => error instanceof GtmEvidenceError
      && /declared lane HIGH_SIGNAL does not match computed lane WATCH/.test(error.message)
  );
});

test('digest changes when supporting evidence changes', () => {
  const base = account([
    signal('fit-1', 'fit', 3),
    signal('timing-1', 'timing', 3),
    signal('intent-1', 'intent', 2)
  ], 'HIGH_SIGNAL');
  const changed = structuredClone(base);
  changed.signals[2].level = 3;

  const left = evaluateTrusted(base);
  const right = evaluateTrusted(changed);
  assert.notEqual(left.evidence_digest, right.evidence_digest);
});


test('digest is stable when the same evidence is reordered', () => {
  const signals = [
    signal('fit-1', 'fit', 3),
    signal('timing-1', 'timing', 3),
    signal('intent-1', 'intent', 2)
  ];
  const reordered = [signals[2], signals[0], signals[1]];

  const left = evaluateTrusted(account(signals, 'HIGH_SIGNAL'));
  const right = evaluateTrusted(account(reordered, 'HIGH_SIGNAL'));
  assert.equal(left.evidence_digest, right.evidence_digest);
});


test('self-asserted source kinds cannot raise confidence without trusted provenance', () => {
  const input = account([
    signal('fit-1', 'fit', 3, { source_kind: 'owned_first_party' }),
    signal('timing-1', 'timing', 3, { source_kind: 'owned_first_party' }),
    signal('intent-1', 'intent', 2, { source_kind: 'owned_first_party' })
  ], 'RESEARCH');

  const result = evaluateGtmAccount(input, { evaluationTime: EVALUATION_TIME });
  assert.equal(result.lane, 'RESEARCH');
  assert.equal(result.vector.confidence, 0);
});
