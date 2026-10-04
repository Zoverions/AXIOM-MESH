import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import * as canonical from '../src/lib/canonical.mjs';
import { errorResponse } from '../src/lib/http.mjs';
import { canonicalCorpus } from '../test-support/canonical-corpus.mjs';

const { canonicalize, canonicalJson, digestObject, sha256, ValidationError } = canonical;

// Accessed through the namespace so that each test fails on its own (rather
// than the whole file failing to link) on a tree without the typed error.
function isCanonicalError(error, pattern) {
  return error instanceof TypeError
    && !(error instanceof ValidationError)
    && error.name === 'CanonicalJsonError'
    && error.code === 'canonical_json_invalid'
    && typeof canonical.CanonicalJsonError === 'function'
    && error instanceof canonical.CanonicalJsonError
    && (!pattern || pattern.test(error.message));
}
function rejectsTyped(callback, pattern) {
  assert.throws(callback, error => isCanonicalError(error, pattern));
}
function nest(levels, leaf = 1) {
  let value = leaf;
  for (let index = 0; index < levels; index += 1) value = [value];
  return value;
}
function countingHandler(counter, overrides = {}) {
  const handler = {};
  for (const trap of ['get', 'set', 'has', 'deleteProperty', 'ownKeys', 'getOwnPropertyDescriptor',
    'defineProperty', 'getPrototypeOf', 'setPrototypeOf', 'isExtensible', 'preventExtensions', 'apply', 'construct']) {
    handler[trap] = (...args) => {
      counter.count += 1;
      if (overrides[trap]) return overrides[trap](...args);
      return Reflect[trap](...args);
    };
  }
  return handler;
}

// ---------------------------------------------------------------------------
// Output identity: byte-identical to main 74b0399b for valid inputs.
// The pinned digests were produced by main's canonical.mjs over the same
// deterministic corpus (test-support/canonical-corpus.mjs), 3,006 values each.
const MAIN_PINS = [
  [0x1a2b3c4d, 3000, 'b25d1b9cc8a339382c71c001911f61e67224bb5a2799fb9a2329ea7e5de67733', [
    '01271fd4f4dae6355f84b56d82962fbaf6dd5340a82e2787bc97dd3a960c1e20',
    'cbae357ae257c9e016b6ea2f0577395c4261d9b24cf79512504ce78198c82b05',
    '75bc7a83bb89cda557611c70fecad7a3937c5b191079bfd906e1a7239cdbad57',
    'd9434d475faa4409c7a9d8bdef1e79287a45de0500e40927417504303a26ab77',
    '22c9cec246edfc04144e4f5e182560d451371497d5b9edfd13d5028c2cd19111',
    '28544f7d2e26628b27bc1b707a9cc75892f56916767da867b1c3c680c18c79d6',
    '66dc06e517ca437db5ddccca32da7ef444ec7393062c1021875cdaabc1d373f6'
  ]],
  [0x0bad5eed, 3000, '55fddec70c4896fb2641090f6fd7649cb8e9931e774562fd284e5f334a53169f', [
    'ea1dd3a3886962387aee43dcd2f897e5ad28bfb3104978e3942aaeb227a503f9',
    '909edb27a2404253d15c05ae7f326ef3122304cca4ca943e08a61ae6702d04db',
    'c23beda61b60170ff1c8be4d0a2719c3b501da995326a56abc33c5d66af10475',
    '76a550561fe356a0d40de32a18e144f7042dd48bb8fd2a5d0cdf82540f808c21',
    'fe566a1ec3178f3abd76c01919728e4ec5a2f86b40c3183de0c16d5fdb6a6b04',
    '26a8b58c50b4a37fc17d0f0be03f8fb8bce9f0c0c427a80c6d196d9cebcefd03',
    '66dc06e517ca437db5ddccca32da7ef444ec7393062c1021875cdaabc1d373f6'
  ]]
];

test('canonical output is byte-identical to main for a seeded corpus of valid inputs', () => {
  for (const [seed, count, digest, chunks] of MAIN_PINS) {
    const outputs = canonicalCorpus(seed, count).map(value => canonicalJson(value));
    assert.equal(outputs.length, count + 6);
    const actualChunks = [];
    for (let index = 0; index < outputs.length; index += 500) {
      actualChunks.push(sha256(outputs.slice(index, index + 500).join('\n')));
    }
    assert.deepEqual(actualChunks, chunks, `seed ${seed.toString(16)} chunk digests`);
    assert.equal(sha256(outputs.join('\n')), digest, `seed ${seed.toString(16)}`);
  }
  // Independent cross-check: for plain JSON data the canonical form is
  // JSON.stringify over recursively sorted keys.
  const sortKeys = value => Array.isArray(value)
    ? value.map(sortKeys)
    : value && typeof value === 'object'
      ? Object.fromEntries(Object.keys(value).sort().map(key => [key, sortKeys(value[key])]))
      : value;
  for (const value of canonicalCorpus(7, 300).slice(0, 300)) {
    const json = JSON.parse(JSON.stringify(value));
    assert.equal(canonicalJson(json), JSON.stringify(sortKeys(json)));
  }
});

test('shared acyclic references, null prototypes and own __proto__ keys still canonicalize', () => {
  const shared = { b: 1, a: [1, 2] };
  assert.equal(canonicalJson({ x: shared, y: [shared, shared] }), '{"x":{"a":[1,2],"b":1},"y":[{"a":[1,2],"b":1},{"a":[1,2],"b":1}]}');
  const bare = Object.create(null);
  bare.z = -0;
  bare.a = 'é';
  assert.equal(canonicalJson(bare), '{"a":"é","z":0}');
  assert.equal(canonicalJson(JSON.parse('{"__proto__":{"k":1},"a":2}')), '{"__proto__":{"k":1},"a":2}');
});

// ---------------------------------------------------------------------------
// Typed error: every existing throw keeps its message but becomes a
// CanonicalJsonError (a TypeError that is not a ValidationError).
test('every existing rejection is a CanonicalJsonError with the unchanged message', () => {
  class SubArray extends Array {}
  const symbolArray = [1];
  symbolArray[Symbol('s')] = 1;
  const accessorArray = [1];
  Object.defineProperty(accessorArray, '0', { enumerable: true, get: () => 1 });
  const customArray = [1];
  customArray.extra = true;
  const nonEnumerable = {};
  Object.defineProperty(nonEnumerable, 'hidden', { value: 1, enumerable: false });
  const cases = [
    [Number.NaN, 'Canonical JSON does not allow non-finite numbers'],
    [Number.POSITIVE_INFINITY, 'Canonical JSON does not allow non-finite numbers'],
    [undefined, 'Canonical JSON cannot encode undefined'],
    [1n, 'Canonical JSON cannot encode bigint'],
    [Symbol('x'), 'Canonical JSON cannot encode symbol'],
    [() => 1, 'Canonical JSON cannot encode function'],
    [SubArray.from([1]), 'Canonical JSON arrays must use the ordinary Array prototype'],
    [symbolArray, 'Canonical JSON arrays cannot contain symbol-keyed state'],
    [[, 1], 'Canonical JSON arrays cannot contain a sparse index at 0'],
    [accessorArray, 'Canonical JSON array index 0 must be an enumerable data property'],
    [customArray, 'Canonical JSON arrays cannot contain custom property extra'],
    [new Date(0), 'Canonical JSON objects must be plain records'],
    [{ [Symbol('s')]: 1 }, 'Canonical JSON objects cannot contain symbol-keyed state'],
    [nonEnumerable, 'Canonical JSON objects cannot contain non-enumerable state'],
    [{ get a() { return 1; } }, 'Canonical JSON property a must be an enumerable data property'],
    [{ a: undefined }, 'Canonical JSON cannot encode property a']
  ];
  for (const [value, message] of cases) {
    for (const call of [canonicalize, canonicalJson, digestObject]) {
      assert.throws(() => call(value), error => {
        assert.equal(error.message, message);
        assert.ok(isCanonicalError(error), `${message}: typed CanonicalJsonError`);
        return true;
      });
    }
  }
});

test('CanonicalJsonError keeps every existing instanceof branch outcome', () => {
  assert.equal(typeof canonical.CanonicalJsonError, 'function');
  let error;
  try { canonicalJson({ a: undefined }); } catch (caught) { error = caught; }
  // TypeError-catching sites (cognitive-auto-routing, operation-candidate-
  // selection, operation-proposal-binding) still catch it; ValidationError-only
  // sites still do not; AxiomError-style status is absent.
  assert.equal(error instanceof TypeError, true);
  assert.equal(error instanceof ValidationError, false);
  assert.equal(error instanceof RangeError, false);
  assert.equal(error.status, undefined);
  assert.equal(Object.getPrototypeOf(canonical.CanonicalJsonError.prototype), TypeError.prototype);
});

test('http errorResponse still maps a canonical failure to 500 internal_error', () => {
  let error;
  try { digestObject({ value: Number.NaN }); } catch (caught) { error = caught; }
  assert.ok(error);
  const response = errorResponse(error, 'trace-1');
  assert.equal(response.status, 500);
  assert.equal(response.body.error.code, 'internal_error');
  assert.equal(response.body.error.message, 'The request could not be completed');
  assert.equal(Object.hasOwn(response.body.error, 'details'), false);
});

test('drill and conformance rejects() helpers still report a canonical failure as not-a-rejection', async () => {
  const sources = {
    'independent-security-review-drill.mjs': ['sync'],
    'pilot-dossier-conformance-drill.mjs': ['sync'],
    'runtime-adapter-conformance.mjs': ['sync', 'async'],
    'pilot-evidence-package-drill.mjs': ['async']
  };
  const syncText = 'function rejects(callback) {\n  try {\n    callback();\n    return false;\n  } catch (error) {\n    return error instanceof ValidationError;\n  }\n}';
  const asyncText = /async function (rejects|rejectsAsync)\(callback\) \{\n  try \{\n    await callback\(\);\n    return false;\n  \} catch \(error\) \{\n    return error instanceof ValidationError;\n  \}\n\}/;
  let canonicalError;
  try { canonicalJson([1, , 3]); } catch (caught) { canonicalError = caught; }
  for (const [file, kinds] of Object.entries(sources)) {
    const text = await readFile(new URL(`../src/${file}`, import.meta.url), 'utf8');
    if (kinds.includes('sync')) {
      assert.ok(text.includes(syncText), `${file}: rejects() helper unchanged`);
      // Execute the helper's own text with the real ValidationError.
      const rejects = new Function('ValidationError', `${syncText}\nreturn rejects;`)(ValidationError);
      assert.equal(rejects(() => { throw canonicalError; }), false, file);
      assert.equal(rejects(() => { throw new TypeError('raw'); }), false, file);
      assert.equal(rejects(() => { throw new ValidationError('typed'); }), true, file);
    }
    if (kinds.includes('async')) {
      const match = text.match(asyncText);
      assert.ok(match, `${file}: async rejects helper unchanged`);
      const rejects = new Function('ValidationError', `${match[0]}\nreturn ${match[1]};`)(ValidationError);
      assert.equal(await rejects(async () => { throw canonicalError; }), false, file);
      assert.equal(await rejects(async () => { throw new ValidationError('typed'); }), true, file);
    }
  }
});

// ---------------------------------------------------------------------------
// Proxies: rejected before any trap runs, including revoked Proxies.
test('a lying Proxy record is rejected with zero trap invocations', () => {
  const counter = { count: 0 };
  const target = { audience_id: 'signed-audience' };
  const proxy = new Proxy(target, countingHandler(counter, {
    get: (object, key, receiver) => key === 'audience_id' ? 'pinned-audience' : Reflect.get(object, key, receiver)
  }));
  rejectsTyped(() => canonicalJson(proxy), /Proxy/);
  rejectsTyped(() => canonicalJson({ nested: { deeper: [1, proxy] } }), /Proxy/);
  assert.equal(counter.count, 0);
});

test('a length-lying Proxy array is rejected with zero trap invocations', () => {
  const counter = { count: 0 };
  let reads = 0;
  const proxy = new Proxy([1, 2, 3], countingHandler(counter, {
    get: (object, key, receiver) => {
      if (key === 'length') return [3, 1, 2][reads++ % 3];
      return Reflect.get(object, key, receiver);
    },
    ownKeys: () => ['0', 'length'],
    getOwnPropertyDescriptor: (object, key) => key === '0' || key === 'length'
      ? Reflect.getOwnPropertyDescriptor(object, key)
      : undefined
  }));
  rejectsTyped(() => canonicalJson(proxy), /Proxy/);
  rejectsTyped(() => canonicalJson({ items: proxy }), /Proxy/);
  assert.equal(counter.count, 0);
  assert.equal(reads, 0);
});

test('revoked and function Proxies are rejected as CanonicalJsonError, never a raw TypeError', () => {
  for (const target of [{}, [], () => 1]) {
    const { proxy, revoke } = Proxy.revocable(target, {});
    revoke();
    rejectsTyped(() => canonicalJson(proxy), /Proxy/);
    rejectsTyped(() => canonicalJson({ a: [proxy] }), /Proxy/);
  }
  const counter = { count: 0 };
  rejectsTyped(() => canonicalJson(new Proxy(() => 1, countingHandler(counter))), /Proxy/);
  assert.equal(counter.count, 0);
});

// ---------------------------------------------------------------------------
// Cycles and depth.
test('cycles are rejected as CanonicalJsonError instead of overflowing the stack', () => {
  const self = { a: 1 };
  self.self = self;
  const array = [1];
  array.push(array);
  const left = { name: 'left' };
  const right = { name: 'right', left };
  left.right = right;
  const deep = { level: { level: { level: {} } } };
  deep.level.level.level.back = deep.level;
  for (const value of [self, array, left, deep, { wrapper: [deep] }]) {
    rejectsTyped(() => canonicalJson(value), /cyclic/);
  }
});

test('nesting is bounded by CANONICAL_JSON_MAX_DEPTH (2048), above the 1,400-level contract bound', () => {
  assert.equal(canonical.CANONICAL_JSON_MAX_DEPTH, 2048);
  assert.equal(canonicalJson(nest(1004)).length, 1004 * 2 + 1);
  assert.equal(canonicalJson(nest(2048)).length, 2048 * 2 + 1);
  let record = 1;
  for (let index = 0; index < 2048; index += 1) record = { k: record };
  assert.ok(canonicalJson(record).startsWith('{"k":{"k":'));
  rejectsTyped(() => canonicalJson(nest(2049)), /nesting exceeds 2048/);
  rejectsTyped(() => canonicalJson({ wrapper: nest(2048) }), /nesting exceeds 2048/);
  rejectsTyped(() => canonicalJson(nest(200_000)), /nesting exceeds 2048/);
});

test('an engine stack overflow inside canonicalize is reported as CanonicalJsonError', () => {
  // With a small V8 stack the engine overflows below the 2048 bound; the
  // overflow must still surface as the typed error, never as a RangeError.
  const script = `
    import { canonicalJson } from ${JSON.stringify(new URL('../src/lib/canonical.mjs', import.meta.url).href)};
    let value = 1;
    for (let index = 0; index < 2048; index += 1) value = [value];
    try { canonicalJson(value); process.stdout.write('accepted'); }
    catch (error) { process.stdout.write(JSON.stringify([error.name, error.code ?? null, error instanceof TypeError, error.message])); }
  `;
  const output = execFileSync(process.execPath, ['--stack-size=200', '--input-type=module', '-e', script], { encoding: 'utf8' });
  assert.equal(output, JSON.stringify(['CanonicalJsonError', 'canonical_json_invalid', true, 'Canonical JSON input exceeds the engine stack depth']));
});

test('N1: an engine limit that is not a stack overflow is typed with its own message, not reported as stack depth', () => {
  // A real Set-size overflow needs an array of 16,777,216 elements (about 1 GB
  // of index strings), so the child makes Set#add throw V8's exact
  // "Set maximum size exceeded" RangeError for one index key instead.
  const script = `
    const add = Set.prototype.add;
    Set.prototype.add = function (value) {
      if (value === '5') throw new RangeError('Set maximum size exceeded');
      return add.call(this, value);
    };
    const { canonicalJson } = await import(${JSON.stringify(new URL('../src/lib/canonical.mjs', import.meta.url).href)});
    try { canonicalJson([0, 1, 2, 3, 4, 5, 6]); process.stdout.write('accepted'); }
    catch (error) { process.stdout.write(JSON.stringify([error.name, error.code ?? null, error instanceof TypeError, error.message])); }
  `;
  const output = execFileSync(process.execPath, ['--input-type=module', '-e', script], { encoding: 'utf8' });
  assert.equal(output, JSON.stringify([
    'CanonicalJsonError', 'canonical_json_invalid', true,
    'Canonical JSON input exceeds an engine limit (Set maximum size exceeded)'
  ]));
});

test('N3: canonicalize uses no more stack per level than main at --stack-size=400', () => {
  // The reference is main's (74b0399b) recursion, embedded here only to compare
  // stack use in the same process and stack size. canonical.mjs stays the only
  // canonical encoder. --jitless keeps every frame an interpreter frame, so the
  // comparison is deterministic: optimizing-tier timing (which varies with
  // machine load) cannot make either side look deeper. 291d9d9a reached about
  // 12-15% fewer levels than the reference here; this head reaches more.
  const script = `
    const { canonicalize } = await import(${JSON.stringify(new URL('../src/lib/canonical.mjs', import.meta.url).href)});
    function refValue(value) {
      if (value === null || typeof value === 'boolean' || typeof value === 'string') return value;
      if (typeof value === 'number') { if (!Number.isFinite(value)) throw new TypeError('n'); return Object.is(value, -0) ? 0 : value; }
      if (Array.isArray(value)) return refArray(value);
      if (typeof value === 'object') return refRecord(value);
      throw new TypeError('t');
    }
    function refArray(value) {
      if (Object.getPrototypeOf(value) !== Array.prototype) throw new TypeError('p');
      if (Object.getOwnPropertySymbols(value).length) throw new TypeError('s');
      const allowedNames = new Set(['length']);
      const output = [];
      for (let index = 0; index < value.length; index += 1) {
        const key = String(index);
        allowedNames.add(key);
        if (!Object.hasOwn(value, key)) throw new TypeError(\`sparse \${index}\`);
        const descriptor = Object.getOwnPropertyDescriptor(value, key);
        if (!descriptor?.enumerable || !Object.hasOwn(descriptor, 'value')) throw new TypeError(\`index \${index}\`);
        output.push(refValue(descriptor.value));
      }
      for (const name of Object.getOwnPropertyNames(value)) {
        if (!allowedNames.has(name)) throw new TypeError(\`custom \${name}\`);
      }
      return output;
    }
    function refRecord(value) {
      const prototype = Object.getPrototypeOf(value);
      if (prototype !== Object.prototype && prototype !== null) throw new TypeError('p');
      if (Object.getOwnPropertySymbols(value).length) throw new TypeError('s');
      const ownNames = Object.getOwnPropertyNames(value);
      const enumerableKeys = Object.keys(value);
      if (ownNames.length !== enumerableKeys.length) throw new TypeError('e');
      const output = {};
      for (const key of enumerableKeys.sort()) {
        const descriptor = Object.getOwnPropertyDescriptor(value, key);
        if (!descriptor?.enumerable || !Object.hasOwn(descriptor, 'value')) throw new TypeError(\`property \${key}\`);
        const item = descriptor.value;
        if (item === undefined || typeof item === 'function' || typeof item === 'symbol') throw new TypeError(\`encode \${key}\`);
        Object.defineProperty(output, key, { value: refValue(item), enumerable: true, configurable: true, writable: true });
      }
      return output;
    }
    const chain = (levels, record) => { let value = 1; for (let index = 0; index < levels; index += 1) value = record ? { k: value } : [value]; return value; };
    const deepest = (encode, record) => {
      const ok = levels => { try { encode(chain(levels, record)); return true; } catch { return false; } };
      let low = 1, high = 2047;
      while (low < high) { const middle = Math.ceil((low + high) / 2); if (ok(middle)) low = middle; else high = middle - 1; }
      return low;
    };
    const result = {};
    for (const record of [false, true]) result[record ? 'records' : 'arrays'] = [deepest(refValue, record), deepest(canonicalize, record)];
    process.stdout.write(JSON.stringify(result));
  `;
  const result = JSON.parse(execFileSync(process.execPath, ['--jitless', '--stack-size=400', '--input-type=module', '-e', script], { encoding: 'utf8' }));
  for (const [shape, [reference, head]] of Object.entries(result)) {
    assert.ok(reference < 2047, `${shape}: the reference must overflow below the probe ceiling (${reference})`);
    assert.ok(head >= reference, `${shape}: head reaches ${head} levels, main's recursion ${reference}`);
  }
});

test('the contract depth bound is 1,400 levels, enforced iteratively as a ValidationError', () => {
  const { CANONICAL_JSON_MAX_CONTRACT_DEPTH, assertContractDepth } = canonical;
  assert.equal(CANONICAL_JSON_MAX_CONTRACT_DEPTH, 1400);
  const record = levels => { let value = 1; for (let index = 0; index < levels; index += 1) value = { k: value }; return value; };
  for (const make of [nest, record]) {
    assert.doesNotThrow(() => assertContractDepth(make(1399), 'x'));
    assert.doesNotThrow(() => assertContractDepth(make(1400), 'x'));
    for (const levels of [1401, 2048, 200_000]) {
      assert.throws(() => assertContractDepth(make(levels), 'doc'),
        error => error instanceof canonical.ValidationError && error.message === 'doc nesting exceeds 1400 levels', String(levels));
    }
  }
  // The deepest branch counts, wherever it is.
  assert.throws(() => assertContractDepth({ a: 1, b: [nest(1399)] }, 'doc'), canonical.ValidationError);
  assert.doesNotThrow(() => assertContractDepth({ a: nest(1399), b: [1] }, 'doc'));
  for (const primitive of [null, undefined, 1, 'x', true, 1n, Symbol('s')]) {
    assert.doesNotThrow(() => assertContractDepth(primitive, 'x'));
  }
});

test('the contract depth walk runs no caller code and rejects Proxies and accessors at once', () => {
  const { assertContractDepth } = canonical;
  let calls = 0;
  const traps = new Proxy({}, Object.fromEntries(
    ['get', 'has', 'ownKeys', 'getOwnPropertyDescriptor', 'getPrototypeOf'].map(name => [name, () => { calls += 1; throw new Error('trap'); }])
  ));
  const getter = Object.defineProperty({}, 'deep', { enumerable: true, get() { calls += 1; return nest(5000); } });
  const { proxy: revoked, revoke } = Proxy.revocable({}, {});
  revoke();
  // Fail closed: a Proxy (live or revoked) or an accessor anywhere, root
  // included, is a ValidationError, and no trap or getter ever runs.
  const notPlain = (pattern) => error => error instanceof canonical.ValidationError && pattern.test(error.message);
  for (const input of [{ traps }, { list: [traps] }, { revoked }, traps, revoked, [[revoked]]]) {
    assert.throws(() => assertContractDepth(input, 'x'), notPlain(/^x must be plain JSON data \(found a Proxy\)$/));
  }
  for (const input of [getter, { a: [getter] }]) {
    assert.throws(() => assertContractDepth(input, 'x'), notPlain(/^x must be plain JSON data \(found an accessor property\)$/));
  }
  const setterOnly = Object.defineProperty([], 0, { enumerable: true, set() { calls += 1; } });
  assert.throws(() => assertContractDepth({ setterOnly }, 'x'), notPlain(/accessor property/));
  assert.equal(calls, 0);
  // Non-enumerable and symbol-keyed data stay canonicalize's to reject, as before.
  assert.doesNotThrow(() => assertContractDepth(Object.defineProperty({}, 'hidden', { value: 1 }), 'x'));
  assert.doesNotThrow(() => assertContractDepth({ [Symbol('s')]: [1] }, 'x'));
  // Cycles terminate and are not a depth question; canonicalize still rejects them.
  const cyclic = { a: {} };
  cyclic.a.back = cyclic;
  assert.doesNotThrow(() => assertContractDepth(cyclic, 'x'));
  rejectsTyped(() => canonicalJson(cyclic), /cyclic/);
  // A rejected call leaves no traversal state behind for the next one.
  rejectsTyped(() => canonicalJson(nest(2049)), /nesting exceeds 2048/);
  assert.equal(canonicalJson(nest(2048)).length, 2048 * 2 + 1);
  rejectsTyped(() => canonicalJson([cyclic.a]), /cyclic/);
  assert.equal(canonicalJson([{ a: 1 }]), '[{"a":1}]');
  // A DAG of 26 shared levels has 2^26 paths but is measured once per object.
  let shared = [1];
  for (let index = 0; index < 26; index += 1) shared = [shared, shared];
  const started = process.hrtime.bigint();
  assert.doesNotThrow(() => assertContractDepth(shared, 'x'));
  assert.ok(process.hrtime.bigint() - started < 1_000_000_000n);
  let wide = [1];
  for (let index = 0; index < 1401; index += 1) wide = [wide, wide];
  assert.throws(() => assertContractDepth(wide, 'x'), canonical.ValidationError);
});

test('the contract depth walk counts a shared subtree at its deepest position, exactly', () => {
  const { assertContractDepth } = canonical;
  const depth = value => {
    // Independent of the walk under test: every path, iteratively.
    let deepest = 0;
    const pending = [[value, 1]];
    while (pending.length) {
      const [node, level] = pending.pop();
      if (node === null || typeof node !== 'object') continue;
      deepest = Math.max(deepest, level);
      for (const item of Object.values(node)) pending.push([item, level + 1]);
    }
    return deepest;
  };
  // A 1,390-level shared subtree is reached first directly under the root
  // record (measured shallow), then again under `wrappers` more arrays.
  const shared = nest(1390);
  const document = wrappers => {
    let deeper = shared;
    for (let index = 0; index < wrappers; index += 1) deeper = [deeper];
    return { a: shared, b: deeper };
  };
  // Root + 9 wrappers + 1,390 = 1,400: at the bound, accepted.
  assert.equal(depth(document(9)), 1400);
  assert.doesNotThrow(() => assertContractDepth(document(9), 'doc'));
  // Root + 10 wrappers + 1,390 = 1,401: one over, rejected.
  assert.equal(depth(document(10)), 1401);
  assert.throws(() => assertContractDepth(document(10), 'doc'),
    error => error instanceof canonical.ValidationError && error.message === 'doc nesting exceeds 1400 levels');
  // Same when the deep path is visited first.
  const { a, b } = document(10);
  assert.throws(() => assertContractDepth({ b, a }, 'doc'), canonical.ValidationError);
  assert.doesNotThrow(() => assertContractDepth({ b: document(9).b, a }, 'doc'));
});

test('the opt-in depth probe is skipped unless AXIOM_DEPTH_PROBE=1', () => {
  // Runs only the probe test (by name) in a child, so this test cannot recurse.
  const probe = new URL('./contract-depth-probe.test.mjs', import.meta.url);
  for (const setting of [undefined, '', '0', 'true', 'yes', ' 1']) {
    const env = { ...process.env };
    delete env.AXIOM_DEPTH_PROBE;
    delete env.NODE_TEST_CONTEXT;
    if (setting !== undefined) env.AXIOM_DEPTH_PROBE = setting;
    const started = process.hrtime.bigint();
    const output = execFileSync(process.execPath, [
      '--test', '--test-reporter=tap', '--test-name-pattern=^AXIOM_DEPTH_PROBE', fileURLToPath(probe)
    ], { encoding: 'utf8', env });
    const label = JSON.stringify(setting);
    assert.match(output, /# SKIP opt-in diagnostic: set AXIOM_DEPTH_PROBE=1/, label);
    assert.match(output, /^# skipped 1$/m, label);
    assert.match(output, /^# pass 0$/m, label);
    assert.doesNotMatch(output, /AXIOM_DEPTH_PROBE os=/, label);
    // A skipped probe spawns no binary-search children.
    assert.ok(process.hrtime.bigint() - started < 30_000_000_000n, label);
  }
});

test('canonicalize does not retain a rejected input', () => {
  // The traversal state is module-level; a rejected call must not keep the
  // caller's objects alive until the next call.
  const script = `
    const { canonicalJson } = await import(${JSON.stringify(new URL('../src/lib/canonical.mjs', import.meta.url).href)});
    let input = { a: {} };
    input.a.back = input;
    const ref = new WeakRef(input);
    try { canonicalJson(input); } catch {}
    input = null;
    for (let round = 0; round < 3; round += 1) { await new Promise(resolve => setTimeout(resolve, 0)); globalThis.gc(); }
    process.stdout.write(String(ref.deref() === undefined));
  `;
  const output = execFileSync(process.execPath, ['--expose-gc', '--input-type=module', '-e', script], { encoding: 'utf8' });
  assert.equal(output, 'true');
});
