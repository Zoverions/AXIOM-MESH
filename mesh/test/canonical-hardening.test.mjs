import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

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

test('nesting is bounded by CANONICAL_JSON_MAX_DEPTH (2048), above the deepest real input (1004)', () => {
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
    catch (error) { process.stdout.write(JSON.stringify([error.name, error.code ?? null, error instanceof TypeError])); }
  `;
  const output = execFileSync(process.execPath, ['--stack-size=200', '--input-type=module', '-e', script], { encoding: 'utf8' });
  assert.equal(output, JSON.stringify(['CanonicalJsonError', 'canonical_json_invalid', true]));
});
