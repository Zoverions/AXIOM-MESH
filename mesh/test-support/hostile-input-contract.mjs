// Test-only hostile-input contract for pure mesh validators (verify* or validate*).
//
// Contract: a hostile, non-JSON input must be rejected with ValidationError (or
// the module's documented typed error, or a closed rejected document for
// returns-style validators). It must never surface a raw TypeError/RangeError,
// never let caller code (a trap, getter or toString) throw through, and never
// be accepted. This module only checks; it never normalizes, and it does not
// contain a canonical encoder.

import { readdirSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { isDeepStrictEqual, types } from 'node:util';

export const MESH_ROOT = fileURLToPath(new URL('..', import.meta.url));
export const BASELINE_PATH = join(MESH_ROOT, 'test', 'fixtures', 'hostile-input-baseline.json');
export const SCANNED_DIRECTORIES = Object.freeze(['src/lib', 'src/domain']);
export const BASELINE_SCHEMA = 'axiom-hostile-input-baseline.v1';

/** Thrown by hostile traps, getters and toString; escaping means caller code ran through. */
export class HostileSentinel extends Error {
  constructor(where) {
    super(`HOSTILE_SENTINEL:${where}`);
    this.name = 'HostileSentinel';
  }
}

/**
 * Classifies a thrown value: typed (documented rejection), sentinel or raw.
 * Typed means ValidationError, or a module error carrying a module-defined
 * string code (AxiomError, AssertionLadderError, McpProjectionError). Every
 * other error is raw, including built-in errors, Node ERR_* errors and
 * platform exceptions such as DOMException/DataCloneError.
 */
export function classifyThrown(error) {
  if (error instanceof HostileSentinel) return 'sentinel';
  if (error === null || typeof error !== 'object') return 'raw';
  let name;
  let code;
  try {
    name = error.name;
    code = error.code;
  } catch {
    return 'raw';
  }
  if (name === 'ValidationError' || code === 'validation_error') return 'typed';
  if (typeof code === 'string' && code.length > 0 && !code.startsWith('ERR_')) return 'typed';
  return 'raw';
}

const REJECTION_FLAGS = ['valid', 'ok', 'accepted', 'verified', 'admitted'];

/** True when a returned value is a recognizable rejection rather than an accept. */
export function looksRejected(value) {
  if (value === false) return true;
  if (value === null || typeof value !== 'object' || types.isProxy(value)) return false;
  for (const flag of REJECTION_FLAGS) {
    const descriptor = Object.getOwnPropertyDescriptor(value, flag);
    if (descriptor && Object.hasOwn(descriptor, 'value') && descriptor.value === false) return true;
  }
  for (const flag of ['binding_status', 'status', 'decision', 'verdict']) {
    const descriptor = Object.getOwnPropertyDescriptor(value, flag);
    if (descriptor && Object.hasOwn(descriptor, 'value') && descriptor.value === 'rejected') return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Hostile value builders. Every builder returns a fresh value and reports trap,
// getter and toString invocations to the shared counter.

export function createCounter() {
  return { traps: 0, getters: 0, coercions: 0 };
}

const TRAPS = [
  'apply', 'construct', 'defineProperty', 'deleteProperty', 'get', 'getOwnPropertyDescriptor',
  'getPrototypeOf', 'has', 'isExtensible', 'ownKeys', 'preventExtensions', 'set', 'setPrototypeOf'
];

export function throwingProxy(target, counter) {
  const handler = {};
  for (const trap of TRAPS) {
    handler[trap] = () => {
      counter.traps += 1;
      throw new HostileSentinel(`trap:${trap}`);
    };
  }
  return new Proxy(target, handler);
}

export function recordingProxy(target, counter) {
  const handler = {};
  for (const trap of TRAPS) {
    handler[trap] = (...args) => {
      counter.traps += 1;
      return Reflect[trap](...args);
    };
  }
  return new Proxy(target, handler);
}

export function revokedProxy(target) {
  const { proxy, revoke } = Proxy.revocable(target, {});
  revoke();
  return proxy;
}

function shell(value) {
  return Array.isArray(value) ? [] : {};
}

// Deep copy of plain containers (writable, unfrozen); any other object (a
// KeyObject, Date, Buffer) is shared rather than cloned.
function cloneData(value) {
  if (value === null || typeof value !== 'object' || types.isProxy(value)) return value;
  if (Array.isArray(value)) return value.map(cloneData);
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return value;
  const copy = Object.create(prototype);
  for (const key of Object.keys(value)) copy[key] = cloneData(value[key]);
  return copy;
}

function isContainer(value) {
  return value !== null && typeof value === 'object';
}

const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9_.:/-]*$/;

/**
 * Hostile replacements for one slot holding `value`. Each entry is
 * { name, make(counter) }; `make` returns a fresh hostile value.
 */
export function hostileVariants(value, { maxDepth = 70 } = {}) {
  const variants = [
    { name: 'null', make: () => null },
    { name: 'undefined', make: () => undefined },
    { name: 'wrong-primitive', make: () => (typeof value === 'number' ? 'not-a-number' : 7) },
    { name: 'bigint', make: () => 1n },
    { name: 'symbol', make: () => Symbol('hostile') },
    { name: 'non-finite', make: () => Number.NaN },
    { name: 'throwing-proxy', make: counter => throwingProxy(isContainer(value) ? shell(value) : {}, counter) },
    { name: 'revoked-proxy', make: () => revokedProxy(isContainer(value) ? shell(value) : {}) },
    {
      name: 'to-string-throws',
      make: counter => ({
        toString() { counter.coercions += 1; throw new HostileSentinel('toString'); },
        valueOf() { counter.coercions += 1; throw new HostileSentinel('valueOf'); }
      })
    }
  ];
  if (isContainer(value) && !types.isProxy(value)) {
    variants.push(
      { name: 'recording-proxy', make: counter => recordingProxy(cloneData(value), counter), recording: true },
      {
        name: 'hidden-mind-id',
        make: () => Object.defineProperty(cloneData(value), 'mind_id', { value: 'hidden', enumerable: false })
      },
      { name: 'symbol-key', make: () => Object.assign(cloneData(value), { [Symbol('hostile')]: 'x' }) },
      { name: 'cycle', make: () => { const copy = cloneData(value); copy[Array.isArray(copy) ? copy.length : 'self'] = copy; return copy; } },
      { name: 'too-deep', make: () => { let node = cloneData(value); for (let i = 0; i < maxDepth; i += 1) node = Array.isArray(value) ? [node] : { nested: node }; return node; } }
    );
    if (Array.isArray(value)) {
      variants.push(
        { name: 'sparse-array', make: () => { const copy = cloneData(value); copy.length += 1; return copy; } },
        { name: 'array-extra-property', make: () => Object.assign(cloneData(value), { extra: 'x' }) }
      );
    } else {
      variants.push(
        { name: 'own-proto-key', make: () => Object.assign(JSON.parse('{"__proto__":{"valid":true}}'), cloneData(value)) },
        { name: 'non-plain-prototype', make: () => Object.assign(Object.create({ valid: true }), cloneData(value)) }
      );
    }
  }
  if (typeof value === 'string') {
    variants.push({ name: 'oversized-string', make: () => 'a'.repeat(5_000_000) });
    if (IDENTIFIER.test(value)) {
      variants.push(
        { name: 'identifier-trailing-newline', make: () => `${value}\n` },
        { name: 'identifier-wrapped', make: () => `junk ${value} junk` }
      );
    }
  }
  return variants;
}

/** Slot-level variants that replace the property descriptor itself. */
export function descriptorVariants() {
  return [
    {
      name: 'throwing-getter',
      define: (parent, key, original, counter) => Object.defineProperty(parent, key, {
        enumerable: true,
        configurable: true,
        get() { counter.getters += 1; throw new HostileSentinel('getter'); }
      })
    },
    {
      name: 'counting-getter',
      recording: true,
      define: (parent, key, original, counter) => Object.defineProperty(parent, key, {
        enumerable: true,
        configurable: true,
        get() { counter.getters += 1; return original; }
      })
    },
    {
      name: 'non-enumerable-replacement',
      define: (parent, key, original) => Object.defineProperty(parent, key, {
        value: original, enumerable: false, configurable: true, writable: true
      })
    }
  ];
}

/** Every own enumerable path (object keys and array indexes) under `root`, breadth first. */
export function walkPaths(root, { maxPaths = 400 } = {}) {
  const paths = [];
  const queue = [[root, []]];
  while (queue.length && paths.length < maxPaths) {
    const [node, path] = queue.shift();
    if (!isContainer(node) || types.isProxy(node)) continue;
    for (const key of Object.keys(node)) {
      const child = node[key];
      paths.push([...path, key]);
      if (paths.length >= maxPaths) break;
      if (isContainer(child)) queue.push([child, [...path, key]]);
    }
  }
  return paths;
}

export function label(path) {
  return path.length === 0 ? '<root>' : path.join('.');
}

function parentOf(root, path) {
  let parent = root;
  for (const key of path.slice(0, -1)) parent = parent[key];
  return parent;
}

function thaw(value) {
  if (Object.isExtensible(value) && !Object.isFrozen(value) && !Object.isSealed(value)) return value;
  const copy = Array.isArray(value) ? [] : Object.create(Object.getPrototypeOf(value));
  for (const key of Reflect.ownKeys(value)) {
    const descriptor = Reflect.getOwnPropertyDescriptor(value, key);
    if (Array.isArray(value) && key === 'length') continue;
    Object.defineProperty(copy, key, { ...descriptor, configurable: true, ...(Object.hasOwn(descriptor, 'value') ? { writable: true } : {}) });
  }
  return copy;
}

/**
 * Returns `root` (or a copy of it) with the slot at `path` changed by
 * `mutate(parent, key)`. Frozen containers on the path are replaced by
 * writable shallow copies so fixtures built from frozen results can be used.
 */
function withSlot(root, path, mutate) {
  const top = thaw(root);
  let parent = top;
  for (const key of path.slice(0, -1)) {
    const child = thaw(parent[key]);
    if (child !== parent[key]) parent[key] = child;
    parent = child;
  }
  mutate(parent, path.at(-1));
  return top;
}

/**
 * Descriptor-level dump that never runs caller code: Proxies are recorded as
 * opaque, accessors as accessor markers. Used to show the validator did not
 * change its input.
 */
export function descriptorDump(value, seen = new Set()) {
  if (types.isProxy(value)) return { proxy: true };
  if (!isContainer(value)) return typeof value === 'symbol' ? { symbol: String(value.description) } : { value };
  if (seen.has(value)) return { cycle: true };
  seen.add(value);
  const out = { prototype: Object.getPrototypeOf(value) === null ? 'null' : 'object', keys: {} };
  for (const key of Reflect.ownKeys(value)) {
    const descriptor = Reflect.getOwnPropertyDescriptor(value, key);
    const name = typeof key === 'symbol' ? `@@${String(key.description)}` : key;
    out.keys[name] = Object.hasOwn(descriptor, 'value')
      ? { enumerable: descriptor.enumerable, writable: descriptor.writable, value: descriptorDump(descriptor.value, seen) }
      : { accessor: true, enumerable: descriptor.enumerable };
  }
  seen.delete(value);
  return out;
}

async function invoke(fn, args, timeoutMs) {
  try {
    let result = fn(...args);
    if (result && typeof result === 'object' && !types.isProxy(result) && typeof result.then === 'function') {
      let timer;
      result = await Promise.race([
        result,
        new Promise((_, reject) => { timer = setTimeout(() => reject(new HostileTimeout()), timeoutMs); })
      ]).finally(() => clearTimeout(timer));
    }
    return { threw: false, result };
  } catch (error) {
    if (error instanceof HostileTimeout) return { timeout: true };
    return { threw: true, error };
  }
}

class HostileTimeout extends Error {}

function outcome(call, style, isRejected) {
  if (call.timeout) return 'timeout';
  if (call.threw) {
    const cls = classifyThrown(call.error);
    if (style === 'returns') return cls === 'typed' ? 'threw-typed' : cls;
    return cls;
  }
  if (style === 'returns') return isRejected(call.result) ? 'typed' : 'accept';
  return isRejected(call.result) ? 'typed' : 'accept';
}

function matches(path, list) {
  const text = label(path);
  return list.some(item => (item instanceof RegExp ? item.test(text) : item === text));
}

function underAny(path, list) {
  for (let length = path.length; length > 0; length -= 1) {
    if (matches(path.slice(0, length), list)) return true;
  }
  return false;
}

// Semantic (JSON-valid but wrong) replacements. Everything else is non-JSON
// hostility that every path must reject.
const SEMANTIC_VARIANTS = new Set([
  'null', 'wrong-primitive', 'oversized-string', 'identifier-trailing-newline', 'identifier-wrapped'
]);

/**
 * Full nested contract for one validator. `validArgs()` returns fresh valid
 * arguments; every argument index and every nested path (up to maxPaths) gets
 * every applicable hostile variant. Returns { checked, violations }; use
 * assertHostileInputContract to fail a test.
 *
 * - style 'throws': rejection is a typed throw; 'returns': a closed rejected
 *   document (isRejected) and never a throw.
 * - nullablePaths: paths where null/undefined/wrong-primitive may be accepted.
 * - openPaths: open records where an extra hidden key, symbol key or own
 *   __proto__ key may be accepted (never a raw error).
 * - documentedReads: paths where a recording Proxy or counting getter may be
 *   read (the contract still requires a typed rejection or a correct accept).
 * - acceptablePaths: map of label -> variant names accepted by design.
 * - structuralOnlyPaths: subtrees this validator digests or reads without
 *   validating their JSON content (for example a trusted catalogue it only
 *   hashes). Only non-JSON hostility is checked there; semantic variants
 *   (null, wrong primitive, oversized or wrapped strings) are skipped.
 * - skipPaths: subtrees not checked at all (each must be justified where used).
 */
export async function checkHostileInputContract({
  name,
  fn,
  style = 'throws',
  validArgs,
  isRejected = looksRejected,
  argIndexes,
  nullablePaths = [],
  openPaths = [],
  documentedReads = [],
  acceptablePaths = {},
  skipPaths = [],
  structuralOnlyPaths = [],
  maxPaths = 400,
  timeoutMs = 3000
}) {
  const violations = [];
  let checked = 0;
  const baseline = validArgs();
  const before = descriptorDump(baseline);
  const valid = await invoke(fn, baseline, timeoutMs);
  if (valid.timeout || valid.threw || isRejected(valid.result) || (style === 'returns' && valid.result === undefined)) {
    violations.push(`${name}: valid baseline did not pass (${valid.threw ? valid.error?.message : 'rejected'})`);
    return { checked, violations };
  }
  if (!isDeepStrictEqual(descriptorDump(baseline), before)) violations.push(`${name}: valid baseline input was mutated`);

  const indexes = argIndexes ?? baseline.map((_, index) => index);
  const record = (where, variant, got, counter, recording) => {
    checked += 1;
    const pathText = where.label;
    const allowedAccept = (acceptablePaths[pathText] ?? []).includes(variant)
      || (['null', 'undefined', 'wrong-primitive'].includes(variant) && matches(where.path, nullablePaths))
      || (['hidden-mind-id', 'symbol-key', 'own-proto-key'].includes(variant) && matches(where.path, openPaths))
      || (recording && matches(where.path, documentedReads));
    if (got === 'accept' && !allowedAccept) violations.push(`${name} ${pathText} ${variant}: accepted`);
    else if (got !== 'typed' && got !== 'accept') violations.push(`${name} ${pathText} ${variant}: ${got}`);
    const reads = counter.traps + counter.getters + counter.coercions;
    if (reads > 0 && !matches(where.path, documentedReads)) {
      violations.push(`${name} ${pathText} ${variant}: caller code ran ${reads}x (traps ${counter.traps}, getters ${counter.getters}, coercions ${counter.coercions})`);
    }
  };

  for (const index of indexes) {
    const rootPaths = [[], ...walkPaths(baseline[index], { maxPaths })];
    for (const path of rootPaths) {
      const full = [`arg${index}`, ...path];
      const where = { path: full, label: label(full) };
      if (underAny(full, skipPaths)) continue;
      const structuralOnly = underAny(full, structuralOnlyPaths);
      const original = path.length === 0 ? baseline[index] : parentOf(baseline[index], path)[path.at(-1)];
      for (const variant of hostileVariants(original)) {
        if (structuralOnly && SEMANTIC_VARIANTS.has(variant.name)) continue;
        const args = validArgs();
        const counter = createCounter();
        const hostile = variant.make(counter);
        if (path.length === 0) args[index] = hostile;
        else args[index] = withSlot(args[index], path, (parent, key) => { parent[key] = hostile; });
        const call = await invoke(fn, args, timeoutMs);
        record(where, variant.name, outcome(call, style, isRejected), counter, variant.recording);
      }
      if (path.length === 0) continue;
      for (const variant of descriptorVariants()) {
        const args = validArgs();
        const counter = createCounter();
        args[index] = withSlot(args[index], path, (parent, key) => variant.define(parent, key, parent[key], counter));
        const snapshot = descriptorDump(args[index]);
        const call = await invoke(fn, args, timeoutMs);
        record(where, variant.name, outcome(call, style, isRejected), counter, variant.recording);
        if (!isDeepStrictEqual(descriptorDump(args[index]), snapshot)) {
          violations.push(`${name} ${where.label} ${variant.name}: input was mutated`);
        }
      }
    }
  }
  return { checked, violations };
}

export async function assertHostileInputContract(descriptor, assert) {
  const { checked, violations } = await checkHostileInputContract(descriptor);
  assert.ok(checked > 0, `${descriptor.name}: no hostile cases were checked`);
  assert.deepEqual(violations, [], `${descriptor.name}: ${violations.length} contract violations`);
  return checked;
}

// ---------------------------------------------------------------------------
// Generic top-level probe and ratchet baseline.

function deepObject(depth) {
  const root = {};
  let node = root;
  for (let i = 0; i < depth; i += 1) { node.a = {}; node = node.a; }
  return root;
}

/**
 * First-argument cases for every exported verify* or validate*. Deliberately
 * excludes stack-depth and wall-clock-sized cases (60k-deep nesting, 1M-item
 * arrays, 8 MB strings), whose outcome differs across platforms and stack
 * sizes; those belong to per-validator contracts with explicit bounds.
 */
export function topLevelCases(counter) {
  return {
    undefined: () => undefined,
    null: () => null,
    number: () => 0,
    nan: () => Number.NaN,
    string: () => 'x',
    boolean: () => true,
    bigint: () => 1n,
    symbol: () => Symbol('hostile'),
    function: () => function hostile() {},
    'empty-array': () => [],
    'empty-object': () => ({}),
    'frozen-object': () => Object.freeze({}),
    'null-prototype': () => Object.create(null),
    'class-instance': () => new (class Hostile {})(),
    date: () => new Date(0),
    map: () => new Map(),
    'typed-array': () => new Uint8Array(4),
    'throwing-proxy': () => throwingProxy({}, counter),
    'recording-proxy': () => recordingProxy({}, counter),
    'revoked-proxy': () => revokedProxy({}),
    'nested-throwing-proxy': () => ({ x: throwingProxy({}, counter) }),
    'nested-proxy-in-array': () => [throwingProxy({}, counter)],
    'hidden-mind-id': () => Object.defineProperty({}, 'mind_id', { value: 'hidden', enumerable: false }),
    'symbol-key': () => ({ [Symbol('hostile')]: 1 }),
    'throwing-getter': () => ({ get x() { counter.getters += 1; throw new HostileSentinel('getter'); } }),
    'counting-getter': () => ({ get x() { counter.getters += 1; return 'v'; } }),
    'own-proto-key': () => JSON.parse('{"__proto__":{"valid":true,"ok":true}}'),
    'inherited-valid': () => Object.create({ valid: true, ok: true, schema_version: 'x' }),
    cycle: () => { const o = {}; o.self = o; return o; },
    'array-cycle': () => { const a = []; a.push(a); return a; },
    'depth-100': () => deepObject(100),
    'sparse-array': () => [, 1], // eslint-disable-line no-sparse-arrays
    'to-string-throws': () => ({ toString() { counter.coercions += 1; throw new HostileSentinel('toString'); } })
  };
}

export function optionCases(counter) {
  return {
    'options-null': () => null,
    'options-string': () => 'x',
    'options-throwing-proxy': () => throwingProxy({}, counter),
    'options-throwing-getter': () => ({ get x() { counter.getters += 1; throw new HostileSentinel('getter'); } })
  };
}

const READ_THROUGH_CASES = new Set(['recording-proxy', 'counting-getter']);

/** Outcome of one top-level case: 'ok' or a failure class. */
async function topLevelOutcome(fn, args, counter, caseName) {
  const call = await invoke(fn, args, 3000);
  if (call.timeout) return 'timeout';
  if (call.threw) {
    const cls = classifyThrown(call.error);
    if (cls !== 'typed') return cls;
  } else if (!looksRejected(call.result)) {
    // A normal return for garbage input. Zero-argument and default-argument
    // validators legitimately do this; the baseline records them as data.
    return 'accept';
  }
  if (READ_THROUGH_CASES.has(caseName) && counter.traps + counter.getters > 0) return 'read-through';
  if (counter.coercions > 0) return 'coerced';
  return 'ok';
}

export function isValidatorExport(name, value) {
  return typeof value === 'function'
    && /^(verify|validate)/.test(name)
    && !/^class[\s{]/.test(Function.prototype.toString.call(value));
}

export function listScannedModules(root = MESH_ROOT) {
  const files = [];
  for (const directory of SCANNED_DIRECTORIES) {
    for (const entry of readdirSync(join(root, directory)).sort()) {
      if (entry.endsWith('.mjs')) files.push(join(root, directory, entry));
    }
  }
  return files;
}

function posix(file, root) {
  return relative(root, file).split(sep).join('/');
}

/**
 * Runs the generic probe over every exported verify* or validate* in the scanned
 * directories. Returns { functions: { "<file>#<name>": { case: class } } },
 * listing every export (an empty object means every case passed).
 *
 * Scope: this is a top-level probe, not per-slot isolation. Every export gets
 * each hostile value as its first argument; exports whose declared arity
 * (Function.length) is at least 2 also get each hostile options value as the
 * second argument, with {} as the first. Defaulted parameters, third and
 * later parameters, and slots an invalid {} first argument never reaches are
 * not isolated here. Those are covered by the full nested contract
 * (checkHostileInputContract) in each registered module's own test file.
 */
export async function probeAllExports(root = MESH_ROOT) {
  const functions = {};
  for (const file of listScannedModules(root)) {
    const mod = await import(pathToFileURL(file).href);
    for (const name of Object.keys(mod).sort()) {
      const fn = mod[name];
      if (!isValidatorExport(name, fn)) continue;
      const failures = {};
      const counter = createCounter();
      for (const [caseName, make] of Object.entries(topLevelCases(counter))) {
        counter.traps = 0; counter.getters = 0; counter.coercions = 0;
        const result = await topLevelOutcome(fn, [make()], counter, caseName);
        if (result !== 'ok') failures[caseName] = result;
      }
      if (fn.length >= 2) {
        for (const [caseName, make] of Object.entries(optionCases(counter))) {
          counter.traps = 0; counter.getters = 0; counter.coercions = 0;
          const result = await topLevelOutcome(fn, [{}, make()], counter, caseName);
          if (result !== 'ok') failures[caseName] = result;
        }
      }
      functions[`${posix(file, root)}#${name}`] = failures;
    }
  }
  return { functions };
}

export function summarizeBaseline(baseline) {
  const entries = Object.values(baseline.functions);
  const pairs = entries.reduce((sum, failures) => sum + Object.keys(failures).length, 0);
  const failing = entries.filter(failures => Object.keys(failures).length > 0).length;
  const byClass = {};
  for (const failures of entries) {
    for (const cls of Object.values(failures)) byClass[cls] = (byClass[cls] ?? 0) + 1;
  }
  return { exports: entries.length, failing_exports: failing, failing_pairs: pairs, by_class: byClass };
}

/**
 * Differences between an observed probe result and the checked-in baseline.
 * The baseline must match exactly: a new failing pair, a changed class, a new
 * or removed export, or a fixed pair that is still listed are all reported.
 */
export function compareWithBaseline(observed, baseline) {
  const problems = [];
  const names = new Set([...Object.keys(observed.functions), ...Object.keys(baseline.functions)]);
  for (const name of [...names].sort()) {
    const now = observed.functions[name];
    const listed = baseline.functions[name];
    if (!listed) { problems.push({ kind: 'unregistered-export', name, failures: now }); continue; }
    if (!now) { problems.push({ kind: 'removed-export', name }); continue; }
    for (const [caseName, cls] of Object.entries(now)) {
      if (!Object.hasOwn(listed, caseName)) problems.push({ kind: 'new-failure', name, case: caseName, class: cls });
      else if (listed[caseName] !== cls) problems.push({ kind: 'changed-class', name, case: caseName, from: listed[caseName], to: cls });
    }
    for (const caseName of Object.keys(listed)) {
      if (!Object.hasOwn(now, caseName)) problems.push({ kind: 'fixed-but-listed', name, case: caseName, class: listed[caseName] });
    }
  }
  return problems;
}
