import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';

import { normalizeSemanticMemoryProvenance } from '../src/lib/semantic-memory-provenance.mjs';
import {
  createSemanticMemoryLifecycle,
  evaluateSemanticMemoryLifecycleUse
} from '../src/lib/semantic-memory-lifecycle.mjs';

// An explicit own `now` must be a Date or an ISO-8601 string. Before this
// change null (and numbers, booleans, arrays ...) were coerced through
// new Date(now), so now: null read as the epoch and revived an expired
// bounded lifecycle. An absent `now` keeps the real clock.

const PAST = '2026-01-01T00:00:00.000Z';
const FUTURE = '2099-01-01T00:00:00.000Z';
const INVALID = /^Semantic memory lifecycle evaluation now is invalid$/;

const record = normalizeSemanticMemoryProvenance({
  object_id: 'memory.owner.lifecycle-now', owner: 'owner.alice', content_digest: 'c'.repeat(64),
  origin_class: 'owner-authored', semantic_class: 'knowledge'
});
const lcExpired = createSemanticMemoryLifecycle(record, { retention_mode: 'bounded', expires_at: PAST });
const lcFuture = createSemanticMemoryLifecycle(record, { retention_mode: 'bounded', expires_at: FUTURE });
const lcOwner = createSemanticMemoryLifecycle(record);
const evaluate = (lifecycle, options) => evaluateSemanticMemoryLifecycleUse(record, lifecycle, 'ordinary-retrieval', options);

test('red/green: own now: null cannot revive an expired bounded lifecycle', () => {
  // On main (through cda91160) this returned semantic_memory_retrieval_allowed.
  assert.throws(() => evaluate(lcExpired, { now: null }), { name: 'ValidationError', message: INVALID });
  assert.throws(() => evaluate(lcFuture, { now: null }), { name: 'ValidationError', message: INVALID });
  assert.throws(() => evaluate(lcOwner, { now: null }), { name: 'ValidationError', message: INVALID });
});

test('red/green: an own now that is neither a Date nor an ISO-8601 string is rejected', () => {
  const rejected = [
    0, 1, -1, Date.now(), Number.NaN, 0n, true, false, Symbol('now'),
    {}, [], [2026], { valueOf: () => 0 }, { toString: () => FUTURE }, Object(FUTURE), () => 0,
    '', ' ', '0', 'Jan 1 2026', '1 January 2026', 'Thu, 01 Jan 2026 00:00:00 GMT',
    '2026-01-01 00:00:00Z', ' 2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z ',
    '2026-02-30', '2025-02-29', '2026-13-01', '2026-00-10', '2026-01-00', '2026-01-32',
    '2026-01-01T24:00:00Z', '2026-01-01T23:60:00Z', '2026-01-01T23:59:60Z', '2026-01-01T00:00:00+0100',
    '2026-01-01T00:00:00+24:00', '-000000-01-01T00:00:00Z', '20260101'
  ];
  for (const now of rejected) {
    for (const lifecycle of [lcExpired, lcFuture, lcOwner]) {
      assert.throws(() => evaluate(lifecycle, { now }), { name: 'ValidationError', message: INVALID }, String(typeof now === 'symbol' ? 'symbol' : now));
    }
  }
  // Date look-alikes without a [[DateValue]] slot are not Dates (before: TypeError from valueOf).
  for (const now of [new Proxy(new Date(), {}), Object.create(Date.prototype)]) {
    assert.throws(() => evaluate(lcFuture, { now }), { name: 'ValidationError', message: INVALID });
  }
});

test('valid Date and ISO-8601 now values behave exactly as before', () => {
  const before = '2025-06-01T00:00:00.000Z';
  const allowed = 'semantic_memory_retrieval_allowed';
  const expired = 'semantic_memory_expired';
  for (const [now, expectExpiredLc] of [
    [new Date(before), allowed],
    [before, allowed],
    ['2025-06-01T00:00:00Z', allowed],
    ['2025-06-01T02:00:00+02:00', allowed],
    ['2025-06-01', allowed],
    ['2025-06', allowed],
    ['2025', allowed],
    ['2024-02-29T12:00:00.123456Z', allowed],
    ['+002025-06-01T00:00:00Z', allowed],
    [vm.runInNewContext(`new Date('${before}')`), allowed],
    [new (class extends Date {})(before), allowed],
    [new Date(PAST), expired],
    [PAST, expired],
    ['2026-01-01T00:00:00Z', expired],
    ['2100-01-01', expired]
  ]) {
    assert.equal(evaluate(lcExpired, { now }).code, expectExpiredLc, String(now));
    assert.equal(evaluate(lcOwner, { now }).code, allowed, String(now));
  }
  // Invalid Date objects and out-of-range ISO strings still fail as before.
  assert.throws(() => evaluate(lcFuture, { now: new Date('nope') }), { name: 'ValidationError', message: INVALID });
  assert.throws(() => evaluate(lcFuture, { now: '+275761-01-01T00:00:00Z' }), { name: 'ValidationError', message: INVALID });
  assert.throws(() => evaluate(lcFuture, { now: 'not-a-date' }), { name: 'ValidationError', message: INVALID });
});

test('absent now keeps the real clock', () => {
  for (const options of [undefined, {}, { now: undefined }]) {
    assert.equal(evaluate(lcExpired, options).code, 'semantic_memory_expired');
    assert.equal(evaluate(lcFuture, options).code, 'semantic_memory_retrieval_allowed');
    assert.equal(evaluate(lcOwner, options).code, 'semantic_memory_retrieval_allowed');
  }
});

test('an inherited invalid now only adds a deny (pollution restored in finally)', () => {
  assert.equal(Object.hasOwn(Object.prototype, 'now'), false);
  try {
    Object.defineProperty(Object.prototype, 'now', { value: null, configurable: true, writable: true, enumerable: false });
    // Main's ordinary reads see now: null, which is now invalid: the deny dominates.
    assert.throws(() => evaluate(lcFuture, {}), { name: 'ValidationError', message: INVALID });
    assert.throws(() => evaluate(lcExpired), { name: 'ValidationError', message: INVALID });
  } finally {
    delete Object.prototype.now;
  }
  assert.equal(Object.hasOwn(Object.prototype, 'now'), false);
  assert.equal(evaluate(lcFuture, {}).code, 'semantic_memory_retrieval_allowed');
});
