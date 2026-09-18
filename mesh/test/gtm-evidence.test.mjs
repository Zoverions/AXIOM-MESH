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
  const result = evaluateGtmAccount(account([
    signal('fit-1', 'fit', 3),
    signal('timing-1', 'timing', 3),
    signal('intent-1', 'intent', 2)
  ], 'HIGH_SIGNAL'), { evaluationTime: EVALUATION_TIME });

  assert.equal(result.lane, 'HIGH_SIGNAL');
  assert.deepEqual(result.vector, { fit: 3, timing: 3, intent: 2, confidence: 2 });
  assert.equal(result.active_signals, 3);
  assert.equal(result.expired_signals, 0);
  assert.match(result.evidence_digest, /^[a-f0-9]{64}$/);
});

test('expired timing evidence cannot keep an account HIGH_SIGNAL', () => {
  const result = evaluateGtmAccount(account([
    signal('fit-1', 'fit', 3),
    signal('timing-old', 'timing', 3, {
      observed_at: '2026-08-18',
      valid_until: '2026-09-17'
    }),
    signal('intent-1', 'intent', 2)
  ], 'WATCH'), { evaluationTime: EVALUATION_TIME });

  assert.equal(result.lane, 'WATCH');
  assert.deepEqual(result.vector, { fit: 3, timing: 0, intent: 2, confidence: 0 });
  assert.equal(result.expired_signals, 1);
});

test('secondary evidence caps confidence and routes otherwise strong evidence to RESEARCH', () => {
  const result = evaluateGtmAccount(account([
    signal('fit-1', 'fit', 3),
    signal('timing-1', 'timing', 3, { source_kind: 'public_secondary' }),
    signal('intent-1', 'intent', 2)
  ], 'RESEARCH'), { evaluationTime: EVALUATION_TIME });

  assert.equal(result.lane, 'RESEARCH');
  assert.equal(result.vector.confidence, 1);
});

test('rejects one source URL split across multiple independence groups', () => {
  assert.throws(
    () => evaluateGtmAccount(account([
      signal('fit-1', 'fit', 3, {
        source_url: 'https://example.com/shared',
        independence_group: 'a'
      }),
      signal('timing-1', 'timing', 3, {
        source_url: 'https://example.com/shared',
        independence_group: 'b'
      })
    ], 'RESEARCH'), { evaluationTime: EVALUATION_TIME }),
    /maps to multiple independence groups/
  );
});

test('fails closed when declared lane overstates the computed lane', () => {
  assert.throws(
    () => evaluateGtmAccount(account([
      signal('fit-1', 'fit', 3),
      signal('timing-1', 'timing', 1),
      signal('intent-1', 'intent', 2)
    ], 'HIGH_SIGNAL'), { evaluationTime: EVALUATION_TIME }),
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

  const left = evaluateGtmAccount(base, { evaluationTime: EVALUATION_TIME });
  const right = evaluateGtmAccount(changed, { evaluationTime: EVALUATION_TIME });
  assert.notEqual(left.evidence_digest, right.evidence_digest);
});
