import { types } from 'node:util';

import { ValidationError } from './canonical.mjs';

export const DELEGATION_SNAPSHOT_MAX_DEPTH = 64;
// Every visited value counts, so a DAG of shared references is charged once per
// path. This bounds snapshot work (and the copied tree handed to canonicalize)
// linearly instead of letting 23 shared objects expand to 2^22 copies.
export const DELEGATION_SNAPSHOT_MAX_NODES = 50_000;
const ARRAY_INDEX = /^(0|[1-9][0-9]*)$/;
// ECMAScript array indexes stop at 2^32 - 2; larger numeric keys are custom properties.
const MAX_ARRAY_INDEX = 2 ** 32 - 2;

/**
 * Copies caller-supplied delegation evidence into fresh plain data once, at
 * verifier entry, so every later check, digest and signature reads the same
 * values. This follows the strict plain-data walk in
 * operation-proposal-binding.mjs: the Proxy test runs before any other
 * operation touches a value (so no trap runs), properties are read through own
 * data descriptors (so no getter runs), and Proxies, accessors, symbol keys,
 * non-enumerable state, non-plain prototypes, custom or sparse array state,
 * functions, cycles, nesting deeper than 64 and inputs over 50,000 values are
 * rejected with ValidationError. A source object reachable through two parents
 * is copied separately under each one: the snapshot is always a tree and never
 * aliases one copy under two parents. Values JSON cannot carry (bigint,
 * symbol, NaN and +/-Infinity anywhere, and undefined below the root) are
 * rejected with ValidationError too; an undefined root still passes through
 * so callers keep their own "missing argument" errors. Other primitives are
 * copied unchanged; the existing validators still type-check them, and
 * canonical.mjs remains the only canonical encoder.
 */
export function snapshotDelegationPlainData(value, name) {
  return copy(value, name, '<root>', new Set(), 0, { nodes: 0 });
}

function reject(name, path, reason) {
  throw new ValidationError(`${name} must be plain data; ${path} ${reason}`);
}

function copy(value, name, path, ancestors, depth, budget) {
  // The Proxy test is the first operation on every value: nothing else may
  // touch a value before it is known not to be a Proxy.
  if (types.isProxy(value)) reject(name, path, 'is a Proxy');
  budget.nodes += 1;
  if (budget.nodes > DELEGATION_SNAPSHOT_MAX_NODES) reject(name, path, 'exceeds the node budget');
  if (typeof value === 'function') reject(name, path, 'is a function');
  if (typeof value === 'bigint' || typeof value === 'symbol') reject(name, path, `is a ${typeof value}`);
  if (typeof value === 'number' && !Number.isFinite(value)) reject(name, path, 'is not a finite number');
  if (value === undefined && depth > 0) reject(name, path, 'is undefined');
  if (value === null || typeof value !== 'object') return value;
  if (depth > DELEGATION_SNAPSHOT_MAX_DEPTH) reject(name, path, 'exceeds the depth bound');
  if (ancestors.has(value)) reject(name, path, 'is cyclic');
  const isArray = Array.isArray(value);
  const prototype = Object.getPrototypeOf(value);
  if (isArray ? prototype !== Array.prototype : (prototype !== Object.prototype && prototype !== null)) {
    reject(name, path, 'has a non-plain prototype');
  }
  ancestors.add(value);
  const output = isArray ? [] : Object.create(prototype);
  let indexes = 0;
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key === 'symbol') reject(name, path, 'has a symbol key');
    const descriptor = Reflect.getOwnPropertyDescriptor(value, key);
    if (isArray && key === 'length') continue;
    const childPath = path === '<root>' ? key : `${path}.${key}`;
    if (!Object.hasOwn(descriptor, 'value')) reject(name, childPath, 'is an accessor');
    if (!descriptor.enumerable) reject(name, childPath, 'is non-enumerable');
    if (isArray) {
      if (!ARRAY_INDEX.test(key) || Number(key) > MAX_ARRAY_INDEX) {
        reject(name, path, `has a custom array property ${key}`);
      }
      indexes += 1;
    }
    Object.defineProperty(output, key, {
      value: copy(descriptor.value, name, childPath, ancestors, depth + 1, budget),
      enumerable: true,
      writable: true,
      configurable: true
    });
  }
  if (isArray && indexes !== Reflect.getOwnPropertyDescriptor(value, 'length').value) {
    reject(name, path, 'is a sparse array');
  }
  ancestors.delete(value);
  return output;
}
