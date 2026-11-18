import assert from 'node:assert/strict';
import test from 'node:test';

import { normalizeSemanticMemoryProvenance } from '../src/lib/semantic-memory-provenance.mjs';
import {
  createSemanticMemoryLifecycle,
  evaluateSemanticMemoryLifecycleUse
} from '../src/lib/semantic-memory-lifecycle.mjs';

// Verifier LOW follow-ups on #1945 (#1918): pin the exact prototype-depth
// boundary of the own-time-reader check, and pin that the module uses its
// load-time captures of Reflect.apply/Date.prototype.getTime and Object.hasOwn
// rather than Function.prototype.call or the live Object.hasOwn.

const EXPIRY = '2026-01-01T00:00:00.000Z';
const FUTURE = '2099-01-01T00:00:00.000Z';
const LATE = '2026-06-01T00:00:00.000Z';
const INVALID = { name: 'ValidationError', message: /^Semantic memory lifecycle evaluation now is invalid$/ };
const EXPIRED = 'semantic_memory_expired';
const ALLOWED = 'semantic_memory_retrieval_allowed';

const record = normalizeSemanticMemoryProvenance({
  object_id: 'memory.owner.lifecycle-now-followup', owner: 'owner.alice', content_digest: 'c'.repeat(64),
  origin_class: 'owner-authored', semantic_class: 'knowledge'
});
const lcExpired = createSemanticMemoryLifecycle(record, { retention_mode: 'bounded', expires_at: EXPIRY });
const lcFuture = createSemanticMemoryLifecycle(record, { retention_mode: 'bounded', expires_at: FUTURE });
const evaluate = (lifecycle, now) => evaluateSemanticMemoryLifecycleUse(record, lifecycle, 'ordinary-retrieval', { now });

// A genuine Date whose chain has `count` plain prototypes (no time readers)
// between it and the base Date.prototype.
function dateWithPrototypes(count, iso = LATE) {
  let prototype = Date.prototype;
  for (let index = 0; index < count; index += 1) prototype = Object.create(prototype);
  const value = new Date(iso);
  Object.setPrototypeOf(value, prototype);
  return value;
}

function withPatched(target, key, value, fn) {
  const saved = Object.getOwnPropertyDescriptor(target, key);
  try {
    Object.defineProperty(target, key, { value, configurable: true, writable: true, enumerable: false });
    return fn();
  } finally {
    Object.defineProperty(target, key, saved);
  }
}

test('prototype depth boundary: 63 plain prototypes are walked and accepted, 64 or more are rejected', () => {
  for (const count of [0, 1, 62, 63]) {
    assert.equal(evaluate(lcExpired, dateWithPrototypes(count)).code, EXPIRED, `${count}`);
    assert.equal(evaluate(lcFuture, dateWithPrototypes(count)).code, ALLOWED, `${count}`);
  }
  for (const count of [64, 65, 100]) {
    assert.throws(() => evaluate(lcExpired, dateWithPrototypes(count)), INVALID, `${count}`);
    assert.throws(() => evaluate(lcFuture, dateWithPrototypes(count)), INVALID, `${count}`);
  }
});

test('a post-load Function.prototype.call patch cannot change the time read from a Date', () => {
  const realGetTime = Date.prototype.getTime;
  const realCall = Function.prototype.call;
  // Only calls of Date.prototype.getTime are redirected (to 1 ms after the
  // epoch, which is valid but long before EXPIRY); everything else is forwarded.
  function patchedCall(thisArg, ...args) {
    if (this === realGetTime) return 1;
    return Reflect.apply(this, thisArg, args);
  }
  const results = withPatched(Function.prototype, 'call', patchedCall, () => [
    evaluate(lcExpired, new Date(LATE)).code,
    evaluate(lcFuture, new Date(LATE)).code
  ]);
  assert.equal(Function.prototype.call, realCall);
  assert.deepEqual(results, [EXPIRED, ALLOWED]);
});

test('a post-load Object.hasOwn patch cannot hide an own time reader on a Date', () => {
  const realHasOwn = Object.hasOwn;
  const readers = ['valueOf', 'getTime', 'toISOString', Symbol.toPrimitive];
  const patchedHasOwn = (target, key) => (readers.includes(key) ? false : realHasOwn(target, key));
  const cases = readers.map(key => {
    const now = new Date(LATE);
    Object.defineProperty(now, key, { value: () => 0, configurable: true });
    return [now, String(key)];
  });
  class Overrides extends Date { valueOf() { return 0; } }
  cases.push([new Overrides(LATE), 'subclass valueOf']);
  const outcomes = withPatched(Object, 'hasOwn', patchedHasOwn, () => cases.map(([now, label]) => {
    try {
      return [label, evaluate(lcExpired, now).code];
    } catch (error) {
      return [label, error.message];
    }
  }));
  assert.equal(Object.hasOwn, realHasOwn);
  for (const [label, outcome] of outcomes) {
    assert.equal(outcome, 'Semantic memory lifecycle evaluation now is invalid', label);
  }
});
