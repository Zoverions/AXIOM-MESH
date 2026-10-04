import { createHash, randomUUID } from 'node:crypto';
import { types } from 'node:util';

/**
 * Maximum container nesting accepted by canonicalize. No contract may declare
 * more than CANONICAL_JSON_MAX_CONTRACT_DEPTH (below), and 2,048 leaves 648
 * levels of headroom above that for wrappers that embed a contract document
 * before digesting it. It is below the roughly 3,100 levels at which the
 * default engine stack overflows for this recursion, so the bound normally
 * fires before the stack does. A stack overflow that still happens (small
 * stacks, deep callers) is reported as the same typed error. This is a module
 * constant, not a caller option.
 */
export const CANONICAL_JSON_MAX_DEPTH = 2048;

/**
 * Maximum nesting any contract whose documents reach canonicalize may declare
 * or imply, counted in container levels from the document root (a bare `[]`
 * or `{}` is one level). Validators enforce it with assertContractDepth before
 * canonicalize runs, so in-bounds parsed input never meets the canonical depth
 * guard and over-deep input gets a ValidationError.
 *
 * The value is measured, not chosen: the semantic operation proposal
 * validator's structuredClone argument copy overflows the native stack first,
 * and on Windows CI (Node 24, default stack) the deepest proposal it and the
 * bridge accepted was 1,833 document levels (1,829 argument levels), against
 * 2,000+ on Linux and both macOS runners. 1,400 is about 24% below that
 * minimum. Main's acceptance above this was never a contract either: it ended
 * wherever the stack ran out. No fixture, example or legitimate test nests
 * deeper than 1,004 levels.
 */
export const CANONICAL_JSON_MAX_CONTRACT_DEPTH = 1400;

/**
 * Typed rejection for values canonical JSON cannot encode. It extends
 * TypeError so every existing `instanceof TypeError` branch keeps its outcome,
 * and it is not a ValidationError, so no `instanceof ValidationError` branch
 * changes either. The string code makes it a documented, typed rejection.
 */
export class CanonicalJsonError extends TypeError {
  constructor(message) {
    super(message);
    this.name = 'CanonicalJsonError';
    this.code = 'canonical_json_invalid';
  }
}

// Traversal state lives in the module, not in arguments, so each recursion
// frame is no larger than main's and the reachable depth at a given stack size
// does not regress. canonicalize runs no caller code (see below), so it cannot
// re-enter itself; each call starts from fresh state.
let ancestors = null;
let depth = 0;

const STACK_OVERFLOW = 'Maximum call stack size exceeded';

export function canonicalize(value) {
  ancestors = new Set();
  depth = 0;
  try {
    return canonicalValue(value);
  } catch (error) {
    // canonicalValue throws only CanonicalJsonError itself. A RangeError is an
    // engine limit: the stack (reached before CANONICAL_JSON_MAX_DEPTH on small
    // stacks or under deep callers) or a collection size limit such as an
    // array too long for the index Set. Each is reported for what it is.
    if (error instanceof RangeError) {
      throw new CanonicalJsonError(String(error.message).includes(STACK_OVERFLOW)
        ? 'Canonical JSON input exceeds the engine stack depth'
        : `Canonical JSON input exceeds an engine limit (${error.message})`);
    }
    throw error;
  } finally {
    // Release the caller's objects; the next call starts fresh either way.
    ancestors = null;
  }
}

/**
 * Throws ValidationError when `value` nests more than
 * CANONICAL_JSON_MAX_CONTRACT_DEPTH container levels. It walks iteratively
 * (no recursion, so no stack limit), runs no caller code (Proxies are not
 * entered, and only own data descriptors are read, never getters), and
 * computes each shared object's height once. It does not judge anything else:
 * Proxies, accessors, cycles and non-JSON values are left for canonicalize and
 * the caller's validator to reject exactly as before.
 */
export function assertContractDepth(value, name) {
  if (contractHeight(value) > CANONICAL_JSON_MAX_CONTRACT_DEPTH) {
    throw new ValidationError(`${name} nesting exceeds ${CANONICAL_JSON_MAX_CONTRACT_DEPTH} levels`);
  }
}

function contractChildren(value) {
  const children = [];
  for (const key of Reflect.ownKeys(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    const item = descriptor && Object.hasOwn(descriptor, 'value') ? descriptor.value : undefined;
    if (item !== null && typeof item === 'object' && !types.isProxy(item)) children.push(item);
  }
  return children;
}

function contractHeight(root) {
  if (root === null || typeof root !== 'object' || types.isProxy(root)) return 0;
  const heights = new Map();
  const onPath = new Set();
  const stack = [{ node: root, children: contractChildren(root), next: 0, height: 1 }];
  onPath.add(root);
  while (stack.length) {
    const frame = stack[stack.length - 1];
    if (stack.length > CANONICAL_JSON_MAX_CONTRACT_DEPTH) return stack.length;
    if (frame.next < frame.children.length) {
      const child = frame.children[frame.next];
      frame.next += 1;
      // A cycle is not a depth question; canonicalize rejects it as before.
      if (onPath.has(child)) continue;
      const known = heights.get(child);
      if (known !== undefined) {
        frame.height = Math.max(frame.height, known + 1);
        continue;
      }
      onPath.add(child);
      stack.push({ node: child, children: contractChildren(child), next: 0, height: 1 });
      continue;
    }
    stack.pop();
    onPath.delete(frame.node);
    heights.set(frame.node, frame.height);
    if (stack.length) {
      const parent = stack[stack.length - 1];
      parent.height = Math.max(parent.height, frame.height + 1);
    }
  }
  return heights.get(root);
}

// After the Proxy test below, canonicalization runs no caller code: ordinary
// objects and arrays expose no traps, accessors are rejected from their
// descriptors before any read, and prototypes must be the intrinsic ones. So
// every value read here is read from a stable object.
function canonicalValue(value) {
  // The Proxy test is the first operation on every value, so no trap of a
  // Proxy (including a revoked one) ever runs.
  if (types.isProxy(value)) throw new CanonicalJsonError('Canonical JSON cannot encode a Proxy');
  if (value === null || typeof value === 'boolean' || typeof value === 'string') {
    return value;
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new CanonicalJsonError('Canonical JSON does not allow non-finite numbers');
    return Object.is(value, -0) ? 0 : value;
  }
  if (typeof value !== 'object') throw new CanonicalJsonError(`Canonical JSON cannot encode ${typeof value}`);
  if (depth >= CANONICAL_JSON_MAX_DEPTH) {
    throw new CanonicalJsonError(`Canonical JSON nesting exceeds ${CANONICAL_JSON_MAX_DEPTH} levels`);
  }
  if (ancestors.has(value)) throw new CanonicalJsonError('Canonical JSON cannot encode a cyclic structure');
  // The container functions enter and leave `value` on the current path, so
  // this frame holds no locals and stays as small as main's.
  return Array.isArray(value) ? canonicalizeArray(value) : canonicalizeRecord(value);
}

// Shared (acyclic) references are allowed: only the current path is tracked.
// A throw abandons the whole call, and canonicalize resets the state.
function enter(value) {
  ancestors.add(value);
  depth += 1;
}

function leave(value) {
  depth -= 1;
  ancestors.delete(value);
}

function canonicalizeArray(value) {
  enter(value);
  if (Object.getPrototypeOf(value) !== Array.prototype) {
    throw new CanonicalJsonError('Canonical JSON arrays must use the ordinary Array prototype');
  }
  if (Object.getOwnPropertySymbols(value).length) {
    throw new CanonicalJsonError('Canonical JSON arrays cannot contain symbol-keyed state');
  }
  const length = value.length;
  const allowedNames = new Set(['length']);
  const output = [];
  for (let index = 0; index < length; index += 1) {
    const key = String(index);
    allowedNames.add(key);
    if (!Object.hasOwn(value, key)) {
      throw new CanonicalJsonError(`Canonical JSON arrays cannot contain a sparse index at ${index}`);
    }
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor?.enumerable || !Object.hasOwn(descriptor, 'value')) {
      throw new CanonicalJsonError(`Canonical JSON array index ${index} must be an enumerable data property`);
    }
    output.push(canonicalValue(descriptor.value));
  }
  // An indexed loop (not for...of) keeps this frame no larger than main's.
  const names = Object.getOwnPropertyNames(value);
  for (let index = 0; index < names.length; index += 1) {
    if (!allowedNames.has(names[index])) {
      throw new CanonicalJsonError(`Canonical JSON arrays cannot contain custom property ${names[index]}`);
    }
  }
  leave(value);
  return output;
}

function canonicalizeRecord(value) {
  enter(value);
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new CanonicalJsonError('Canonical JSON objects must be plain records');
  }
  if (Object.getOwnPropertySymbols(value).length) {
    throw new CanonicalJsonError('Canonical JSON objects cannot contain symbol-keyed state');
  }
  const ownNames = Object.getOwnPropertyNames(value);
  const enumerableKeys = Object.keys(value);
  if (ownNames.length !== enumerableKeys.length) {
    throw new CanonicalJsonError('Canonical JSON objects cannot contain non-enumerable state');
  }
  const output = {};
  enumerableKeys.sort();
  // An indexed loop (not for...of) keeps this frame smaller than main's.
  for (let index = 0; index < enumerableKeys.length; index += 1) {
    const key = enumerableKeys[index];
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor?.enumerable || !Object.hasOwn(descriptor, 'value')) {
      throw new CanonicalJsonError(`Canonical JSON property ${key} must be an enumerable data property`);
    }
    const item = descriptor.value;
    if (item === undefined || typeof item === 'function' || typeof item === 'symbol') {
      throw new CanonicalJsonError(`Canonical JSON cannot encode property ${key}`);
    }
    Object.defineProperty(output, key, {
      value: canonicalValue(item),
      enumerable: true,
      configurable: true,
      writable: true
    });
  }
  leave(value);
  return output;
}

export function canonicalJson(value) {
  return JSON.stringify(canonicalize(value));
}

export function sha256(value) {
  const input = Buffer.isBuffer(value) ? value : Buffer.from(String(value), 'utf8');
  return createHash('sha256').update(input).digest('hex');
}

export function digestObject(value) {
  return sha256(canonicalJson(value));
}

export function newId(prefix) {
  return `${prefix}_${randomUUID()}`;
}

export function assertPlainObject(value, name = 'value') {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new ValidationError(`${name} must be an object`);
  }
  return value;
}

export function assertString(value, name, { min = 1, max = 4096, pattern } = {}) {
  if (typeof value !== 'string') throw new ValidationError(`${name} must be a string`);
  if (value.length < min || value.length > max) {
    throw new ValidationError(`${name} must contain ${min}-${max} characters`);
  }
  if (pattern && !pattern.test(value)) throw new ValidationError(`${name} has an invalid format`);
  return value;
}

export function assertStringArray(value, name, { maxItems = 64, itemMax = 256 } = {}) {
  if (!Array.isArray(value) || value.length > maxItems) {
    throw new ValidationError(`${name} must be an array with at most ${maxItems} items`);
  }
  return value.map((item, index) => assertString(item, `${name}[${index}]`, { max: itemMax }));
}

export class ValidationError extends Error {
  constructor(message, details = undefined) {
    super(message);
    this.name = 'ValidationError';
    this.code = 'validation_error';
    this.status = 400;
    this.details = details;
  }
}

export class AxiomError extends Error {
  constructor(code, message, status = 500, details = undefined) {
    super(message);
    this.name = 'AxiomError';
    this.code = code;
    this.status = status;
    this.details = details;
  }
}
