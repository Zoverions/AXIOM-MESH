import assert from 'node:assert/strict';
import test from 'node:test';

import { ValidationError, canonicalJson } from '../src/lib/canonical.mjs';
// Namespace import, so this file still loads against a helper without the limits.
import * as snapshot from '../src/lib/delegation-plain-snapshot.mjs';

const { snapshotDelegationPlainData } = snapshot;
const MAX_NODES = 50_000;
const MAX_DEPTH = 64;

function isPlainDataRejection(reason) {
  return error => error instanceof ValidationError
    && error.code === 'validation_error'
    && /must be plain data/.test(error.message)
    && reason.test(error.message);
}

function nested(levels) {
  const root = {};
  let node = root;
  for (let index = 0; index < levels; index += 1) {
    node.x = {};
    node = node.x;
  }
  return root;
}

function sharedReferenceDag(levels) {
  let node = { leaf: true };
  for (let index = 0; index < levels; index += 1) node = { a: node, b: node };
  return node;
}

test('snapshot limits are the documented fixed bounds', () => {
  assert.equal(snapshot.DELEGATION_SNAPSHOT_MAX_DEPTH, MAX_DEPTH);
  assert.equal(snapshot.DELEGATION_SNAPSHOT_MAX_NODES, MAX_NODES);
});

test('nesting 64 deep is copied; 65 deep is a ValidationError, never a raw RangeError', () => {
  assert.equal(canonicalJson(snapshotDelegationPlainData(nested(MAX_DEPTH), 'deep')), canonicalJson(nested(MAX_DEPTH)));
  assert.throws(() => snapshotDelegationPlainData(nested(MAX_DEPTH + 1), 'deep'), isPlainDataRejection(/exceeds the depth bound/));
  assert.throws(() => snapshotDelegationPlainData(nested(100_000), 'deep'), isPlainDataRejection(/exceeds the depth bound/));
});

test('a shared source object under two parents is accepted as two separate, equal copies (no aliasing)', () => {
  const shared = { scope: ['local'], limits: { max: 1 } };
  const input = { left: shared, right: { inner: shared }, list: [shared, shared] };
  const copy = snapshotDelegationPlainData(input, 'dag');
  assert.equal(canonicalJson(copy), canonicalJson(input));
  assert.deepEqual(copy, input);
  const copies = [copy.left, copy.right.inner, copy.list[0], copy.list[1]];
  for (const item of copies) assert.notEqual(item, shared, 'snapshot must not hand back caller objects');
  assert.equal(new Set(copies).size, copies.length, 'each parent gets its own copy');
  assert.equal(new Set(copies.map(item => item.scope)).size, copies.length);
  copy.left.limits.max = 2;
  copy.left.scope.push('other');
  assert.deepEqual(copy.right.inner, { scope: ['local'], limits: { max: 1 } }, 'one branch cannot change another');
  assert.deepEqual(shared, { scope: ['local'], limits: { max: 1 } }, 'the caller object is untouched');
});

test('self-cycles and multi-hop cycles are still rejected as cyclic', () => {
  const self = { name: 'self' };
  self.self = self;
  const first = { name: 'first' };
  const second = { name: 'second', next: first };
  const third = { name: 'third', next: second };
  first.next = third;
  const array = [];
  array.push(array);
  for (const [name, value] of Object.entries({ self, multiHop: { root: first }, array })) {
    assert.throws(() => snapshotDelegationPlainData(value, name), isPlainDataRejection(/is cyclic/), name);
  }
});

test('a 22-level shared-reference DAG (23 objects, 2^23 - 1 expanded objects) is rejected by the node budget', () => {
  // Deterministic: without a budget the copy would contain 2^23 - 1 objects.
  assert.throws(
    () => snapshotDelegationPlainData(sharedReferenceDag(22), 'dag'),
    isPlainDataRejection(/exceeds the node budget/)
  );
});

test('the node budget counts every value on every path, exactly at the bound', () => {
  // An array root plus N primitives visits N + 1 values.
  assert.equal(snapshotDelegationPlainData(new Array(MAX_NODES - 1).fill(0), 'flat').length, MAX_NODES - 1);
  assert.throws(
    () => snapshotDelegationPlainData(new Array(MAX_NODES).fill(0), 'flat'),
    isPlainDataRejection(/exceeds the node budget/)
  );
  // A shared-reference DAG is charged per path: L levels expand to
  // 3 * 2^L - 1 values, so 14 levels (49,151) fit and 15 (98,303) do not.
  assert.doesNotThrow(() => snapshotDelegationPlainData(sharedReferenceDag(14), 'dag'));
  assert.throws(
    () => snapshotDelegationPlainData(sharedReferenceDag(15), 'dag'),
    isPlainDataRejection(/exceeds the node budget/)
  );
});

test('bigint, symbol, NaN and +/-Infinity anywhere, and undefined below the root, are plain-data ValidationErrors', () => {
  for (const [label, value, reason] of [
    ['bigint', 1n, /is a bigint/],
    ['symbol', Symbol('x'), /is a symbol/],
    ['NaN', Number.NaN, /not a finite number/],
    ['Infinity', Number.POSITIVE_INFINITY, /not a finite number/],
    ['-Infinity', Number.NEGATIVE_INFINITY, /not a finite number/],
    ['undefined', undefined, /is undefined/]
  ]) {
    assert.throws(() => snapshotDelegationPlainData({ ok: 1, value }, 'evidence'), isPlainDataRejection(reason), `${label} in a record`);
    assert.throws(() => snapshotDelegationPlainData([1, value], 'evidence'), isPlainDataRejection(reason), `${label} in an array`);
    if (value !== undefined) {
      assert.throws(() => snapshotDelegationPlainData(value, 'evidence'), isPlainDataRejection(reason), `${label} at the root`);
    }
  }
  // An absent argument still reaches the caller's own validator.
  assert.equal(snapshotDelegationPlainData(undefined, 'evidence'), undefined);
  // JSON values are unchanged, including -0 and null.
  const json = { a: [0, -0, 1.5, 'x', true, false, null], b: { c: null } };
  assert.equal(canonicalJson(snapshotDelegationPlainData(json, 'evidence')), canonicalJson(json));
});

test('an own __proto__ key from JSON.parse is copied as an own data key, never as the prototype', () => {
  const source = JSON.parse('{"__proto__":{"injected":true},"kept":1}');
  const copy = snapshotDelegationPlainData(source, 'evidence');
  assert.equal(Object.getPrototypeOf(copy), Object.prototype);
  assert.deepEqual(Object.keys(copy), ['__proto__', 'kept']);
  assert.equal(copy.injected, undefined);
  assert.deepEqual(Object.getOwnPropertyDescriptor(copy, '__proto__').value, { injected: true });
});
