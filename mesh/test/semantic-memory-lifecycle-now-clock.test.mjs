import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';

import {
  deriveSemanticMemoryProvenance,
  normalizeSemanticMemoryProvenance
} from '../src/lib/semantic-memory-provenance.mjs';
import {
  createSemanticMemoryLifecycle,
  deriveSemanticMemoryLifecycle,
  evaluateSemanticMemoryLifecycleUse
} from '../src/lib/semantic-memory-lifecycle.mjs';

// The evaluation clock is read through Date.prototype.getTime, Date.parse and
// Date.now captured at module load, never through valueOf/getTime/
// Symbol.toPrimitive on the value or through globals patched after load, and
// a time that is not finite or not after the epoch is rejected (#1918,
// Verifier residuals on #1944). `now` stays caller-trusted: a valid past time
// is still accepted.

const EXPIRY = '2026-01-01T00:00:00.000Z';
const FUTURE = '2099-01-01T00:00:00.000Z';
// A genuine time after EXPIRY: an expired lifecycle must stay expired.
const LATE = '2026-06-01T00:00:00.000Z';
const INVALID = { name: 'ValidationError', message: /^Semantic memory lifecycle evaluation now is invalid$/ };
const EXPIRED = 'semantic_memory_expired';
const ALLOWED = 'semantic_memory_retrieval_allowed';

const record = normalizeSemanticMemoryProvenance({
  object_id: 'memory.owner.lifecycle-now-clock', owner: 'owner.alice', content_digest: 'c'.repeat(64),
  origin_class: 'owner-authored', semantic_class: 'knowledge'
});
const lcExpired = createSemanticMemoryLifecycle(record, { retention_mode: 'bounded', expires_at: EXPIRY });
const lcFuture = createSemanticMemoryLifecycle(record, { retention_mode: 'bounded', expires_at: FUTURE });
const lcOwner = createSemanticMemoryLifecycle(record);
const evaluate = (lifecycle, options) => evaluateSemanticMemoryLifecycleUse(record, lifecycle, 'ordinary-retrieval', options);

function assertRejectedEverywhere(now, label) {
  for (const lifecycle of [lcExpired, lcFuture, lcOwner]) {
    assert.throws(() => evaluate(lifecycle, { now }), INVALID, label);
  }
}

// Saves and restores global properties around fn, even when it throws.
function withPatched(patches, fn) {
  const saved = patches.map(([target, key]) => [target, key, Object.getOwnPropertyDescriptor(target, key)]);
  try {
    for (const [target, key, value] of patches) {
      Object.defineProperty(target, key, { value, configurable: true, writable: true, enumerable: false });
    }
    return fn();
  } finally {
    for (const [target, key, descriptor] of saved.reverse()) {
      if (descriptor) Object.defineProperty(target, key, descriptor);
      else delete target[key];
    }
  }
}

test('red/green: a real Date with an own valueOf/getTime/toPrimitive cannot revive an expired lifecycle', () => {
  const ownValueOf = new Date(LATE);
  ownValueOf.valueOf = () => 0;
  const ownBoth = new Date(LATE);
  ownBoth.valueOf = () => 0;
  ownBoth.getTime = () => 0;
  const ownToPrimitive = new Date(LATE);
  Object.defineProperty(ownToPrimitive, Symbol.toPrimitive, { value: () => 0 });
  const ownGetTime = new Date(LATE);
  ownGetTime.getTime = () => 0;
  const ownToISOString = new Date(LATE);
  ownToISOString.toISOString = () => '1970-01-01T00:00:00.000Z';
  // On 57ce193f the first two returned semantic_memory_retrieval_allowed.
  for (const [now, label] of [[ownValueOf, 'own valueOf'], [ownBoth, 'own valueOf+getTime'], [ownToPrimitive, 'own toPrimitive'], [ownGetTime, 'own getTime'], [ownToISOString, 'own toISOString']]) {
    assertRejectedEverywhere(now, label);
  }
});

test('red/green: a Date subclass overriding valueOf/getTime is rejected', () => {
  class ZeroValueOf extends Date { valueOf() { return 0; } }
  class ZeroGetTime extends Date { getTime() { return 0; } }
  class ZeroBoth extends Date { valueOf() { return 0; } getTime() { return 0; } }
  class Deeper extends ZeroBoth {}
  class ZeroToISOString extends Date { toISOString() { return '1970-01-01T00:00:00.000Z'; } }
  class ZeroToPrimitive extends Date { [Symbol.toPrimitive]() { return 0; } }
  for (const Kind of [ZeroValueOf, ZeroGetTime, ZeroBoth, Deeper, ZeroToISOString, ZeroToPrimitive]) {
    assertRejectedEverywhere(new Kind(LATE), Kind.name);
  }
  // A pathologically deep chain (more than 64 prototypes above the base
  // Date.prototype) is not walked to the end: it is rejected, not trusted.
  let deepPrototype = Date.prototype;
  for (let index = 0; index < 70; index += 1) deepPrototype = Object.create(deepPrototype);
  const deep = new Date(LATE);
  Object.setPrototypeOf(deep, deepPrototype);
  assertRejectedEverywhere(deep, 'deep prototype chain');
  // A shallow chain of plain prototypes with no time readers is still a genuine Date.
  let shallowPrototype = Date.prototype;
  for (let index = 0; index < 8; index += 1) shallowPrototype = Object.create(shallowPrototype);
  const shallow = new Date(LATE);
  Object.setPrototypeOf(shallow, shallowPrototype);
  assert.equal(evaluate(lcExpired, { now: shallow }).code, EXPIRED);
  // A plain subclass and a Date from another realm are still genuine Dates.
  class Plain extends Date {}
  for (const now of [new Plain(LATE), vm.runInNewContext(`new Date('${LATE}')`)]) {
    assert.equal(evaluate(lcExpired, { now }).code, EXPIRED);
    assert.equal(evaluate(lcFuture, { now }).code, ALLOWED);
  }
});

test('Date look-alikes without a [[DateValue]] slot are rejected (Proxy, Object.create(Date.prototype))', () => {
  assertRejectedEverywhere(new Proxy(new Date(LATE), {}), 'Proxy(Date)');
  assertRejectedEverywhere(Object.create(Date.prototype), 'Object.create(Date.prototype)');
  const revoked = Proxy.revocable(new Date(LATE), {});
  revoked.revoke();
  assertRejectedEverywhere(revoked.proxy, 'revoked Proxy');
});

test('red/green: epoch, pre-epoch and NaN times are rejected', () => {
  // new Date(0), '1970-01-01T00:00:00Z' and negative times revived an expired lifecycle on 57ce193f.
  const rejected = [
    new Date(0), new Date(-1), new Date(-86_400_000), new Date(-8.64e15), new Date(Number.NaN), new Date('nope'),
    '1970-01-01T00:00:00Z', '1970-01-01T00:00:00.000Z', '1970', '1970-01', '1970-01-01',
    '1969-12-31T23:59:59.999Z', '1970-01-01T01:00:00+01:00', '1900-01-01', '0001-01-01T00:00:00Z',
    '-000001-01-01T00:00:00Z', '-271821-04-20T00:00:00Z'
  ];
  for (const now of rejected) assertRejectedEverywhere(now, String(now instanceof Date ? `Date(${Date.prototype.getTime.call(now)})` : now));
  // The first millisecond after the epoch is a valid (caller-trusted, past) time.
  for (const now of [new Date(1), '1970-01-01T00:00:00.001Z']) {
    assert.equal(evaluate(lcExpired, { now }).code, ALLOWED, String(now));
  }
});

test('red/green: post-load patches of Date.prototype.valueOf/getTime do not change the time read', () => {
  const genuine = new Date(LATE);
  const realValueOf = Date.prototype.valueOf;
  const realGetTime = Date.prototype.getTime;
  // Targeted patches: only the caller's Date reads as the epoch+1ms, so the
  // stored expiry is still read genuinely by anything using the prototype.
  const forged = real => function () { return this === genuine ? 1 : Reflect.apply(real, this, []); };
  withPatched([[Date.prototype, 'valueOf', forged(realValueOf)], [Date.prototype, 'getTime', forged(realGetTime)]], () => {
    // On 57ce193f this returned semantic_memory_retrieval_allowed.
    assert.equal(evaluate(lcExpired, { now: genuine }).code, EXPIRED);
    assert.equal(evaluate(lcExpired, { now: LATE }).code, EXPIRED);
    assert.equal(evaluate(lcExpired, {}).code, EXPIRED);
    assert.equal(evaluate(lcFuture, { now: genuine }).code, ALLOWED);
  });
  withPatched([[Date.prototype, 'valueOf', () => 0], [Date.prototype, 'getTime', () => 0]], () => {
    assert.equal(evaluate(lcExpired, { now: genuine }).code, EXPIRED);
    assert.equal(evaluate(lcFuture, { now: genuine }).code, ALLOWED);
  });
  withPatched([[Date.prototype, Symbol.toPrimitive, () => 0], [Date.prototype, 'toISOString', () => EXPIRY]], () => {
    assert.equal(evaluate(lcExpired, { now: genuine }).code, EXPIRED);
    assert.equal(evaluate(lcFuture, { now: genuine }).code, ALLOWED);
  });
  assert.equal(Date.prototype.valueOf.call(genuine), Date.parse(LATE));
});

test('red/green: post-load patches of Date.parse, Date.now and the global Date do not change the time read', () => {
  const RealDate = Date;
  // Reads as the epoch+1ms for the attacker's chosen inputs, otherwise genuine.
  class FakeDate extends RealDate {
    constructor(...args) {
      super(...(args.length === 0 || args[0] === LATE ? [1] : args));
    }
    static parse() { return 1; }
    static now() { return 1; }
  }
  withPatched([[RealDate, 'parse', () => 1], [RealDate, 'now', () => 1], [globalThis, 'Date', FakeDate]], () => {
    // On 57ce193f the ISO-string now and the absent now were both read as 1 ms: allowed.
    assert.equal(evaluate(lcExpired, { now: LATE }).code, EXPIRED);
    assert.equal(evaluate(lcExpired, {}).code, EXPIRED);
    assert.equal(evaluate(lcExpired).code, EXPIRED);
    assert.equal(evaluate(lcFuture, { now: LATE }).code, ALLOWED);
    assert.equal(evaluate(lcFuture, {}).code, ALLOWED);
  });
  // Stored expires_at values are also read through the captures: a global Date
  // that misreads the expiry changes neither create, verify nor the decision.
  class ExpiryDate extends RealDate {
    constructor(...args) {
      super(...(args[0] === EXPIRY ? [1] : args));
    }
  }
  const outcomes = withPatched([[globalThis, 'Date', ExpiryDate]], () => {
    try {
      const created = createSemanticMemoryLifecycle(record, { retention_mode: 'bounded', expires_at: EXPIRY });
      return { created, code: evaluate(lcExpired, { now: LATE }).code };
    } catch (error) {
      return { error: `${error.name}: ${error.message}` };
    }
  });
  assert.deepEqual(outcomes, { created: lcExpired, code: EXPIRED });
  assert.equal(globalThis.Date, RealDate);
  assert.notEqual(Date.parse(LATE), 1);
});

test('red/green: post-load patches of RegExp.prototype.exec and Number do not widen the ISO-8601 check', () => {
  const RealNumber = Number;
  // A forged, always-in-range match and a Number that reads every field as 1.
  const forgedExec = function () { return ['2026-01-01', '2026', '01', '01']; };
  const outcomes = withPatched([[RegExp.prototype, 'exec', forgedExec], [globalThis, 'Number', () => 1]], () => (
    ['Jan 1 2026', 'Thu, 01 Jan 2026 00:00:00 GMT', '2026-02-30', '2026-01-01T24:00:00Z'].map(now => {
      try {
        return [now, evaluate(lcFuture, { now }).code];
      } catch (error) {
        return [now, `${error.name}: ${error.message}`];
      }
    })
  ));
  assert.equal(globalThis.Number, RealNumber);
  // On 57ce193f, 'Jan 1 2026' and 'Thu, 01 Jan 2026 ...' were accepted under the patch.
  for (const [now, result] of outcomes) {
    assert.equal(result, 'ValidationError: Semantic memory lifecycle evaluation now is invalid', now);
  }
});

test('post-load Date.prototype patches cannot let derived memory outlive a bounded parent', () => {
  const child = deriveSemanticMemoryProvenance(record, { object_id: 'memory.derived.now-clock', content_digest: 'd'.repeat(64) });
  const outcome = withPatched([[Date.prototype, 'valueOf', () => 0], [Date.prototype, 'getTime', () => 0]], () => {
    try {
      deriveSemanticMemoryLifecycle(record, lcExpired, child, { retention_mode: 'bounded', expires_at: FUTURE });
      return 'derived';
    } catch (error) {
      return `${error.name}: ${error.message}`;
    }
  });
  assert.equal(outcome, 'ValidationError: Derived memory cannot outlive bounded parent retention');
});

test('a post-load Array iterator patch cannot forge ISO-8601 fields (no rollover dates)', () => {
  const realIterator = Array.prototype[Symbol.iterator];
  // Forges the year of RegExp match arrays only; every other array iterates normally.
  const forged = function () {
    if (Object.hasOwn(this, 'index') && Object.hasOwn(this, 'input')) {
      return Reflect.apply(realIterator, [this[0], '2024', ...Reflect.apply(Array.prototype.slice, this, [2])], []);
    }
    return Reflect.apply(realIterator, this, []);
  };
  const outcome = withPatched([[Array.prototype, Symbol.iterator, forged]], () => {
    try {
      return evaluate(lcFuture, { now: '2025-02-29' }).code;
    } catch (error) {
      return `${error.name}: ${error.message}`;
    }
  });
  assert.equal(outcome, 'ValidationError: Semantic memory lifecycle evaluation now is invalid');
});

test('red/green: Object.prototype.now pollution never supplies the clock; invalid or expiring values deny', () => {
  const zeroValueOf = new Date(LATE);
  zeroValueOf.valueOf = () => 0;
  const cases = [
    // [inherited now, lcExpired outcome, lcFuture outcome]
    [new Date(0), INVALID, INVALID],
    ['1970-01-01T00:00:00Z', INVALID, INVALID],
    [new Date(-1), INVALID, INVALID],
    [zeroValueOf, INVALID, INVALID],
    [new Date(Number.NaN), INVALID, INVALID],
    [null, INVALID, INVALID],
    // A valid past time never revives; the real clock is used.
    [new Date('2025-01-01T00:00:00.000Z'), EXPIRED, ALLOWED],
    ['2025-01-01', EXPIRED, ALLOWED],
    // A valid time at or after expiry: the returned deny dominates.
    [new Date('2100-01-01T00:00:00.000Z'), EXPIRED, EXPIRED]
  ];
  assert.equal(Object.hasOwn(Object.prototype, 'now'), false);
  for (const [now, expired, future] of cases) {
    withPatched([[Object.prototype, 'now', now]], () => {
      for (const [lifecycle, expected] of [[lcExpired, expired], [lcFuture, future]]) {
        for (const options of [undefined, {}]) {
          if (expected === INVALID) assert.throws(() => evaluate(lifecycle, options), INVALID, String(now));
          else assert.equal(evaluate(lifecycle, options).code, expected, String(now));
        }
      }
    });
  }
  assert.equal(Object.hasOwn(Object.prototype, 'now'), false);
  assert.equal(evaluate(lcFuture, {}).code, ALLOWED);
});

test('valid Dates and ISO strings around expiry behave as before (caller-trusted)', () => {
  const expiry = Date.parse(EXPIRY);
  for (const [time, code] of [[expiry - 1, ALLOWED], [expiry, EXPIRED], [expiry + 1, EXPIRED]]) {
    assert.equal(evaluate(lcExpired, { now: new Date(time) }).code, code);
    assert.equal(evaluate(lcExpired, { now: new Date(time).toISOString() }).code, code);
  }
  assert.equal(evaluate(lcExpired, { now: '2025-12-31T23:59:59.999Z' }).code, ALLOWED);
  assert.equal(evaluate(lcExpired, { now: '2025-12-31T19:00:00-05:00' }).code, EXPIRED);
});
