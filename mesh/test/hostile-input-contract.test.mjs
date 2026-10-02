import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { ValidationError } from '../src/lib/canonical.mjs';
import {
  BASELINE_PATH,
  BASELINE_SCHEMA,
  checkHostileInputContract,
  classifyThrown,
  compareWithBaseline,
  descriptorVariants,
  HostileSentinel,
  hostileVariants,
  probeAllExports,
  walkPaths
} from '../test-support/hostile-input-contract.mjs';

const REGEN = 'node test-support/hostile-input-baseline.mjs --write';

// A deliberately naive validator: Object.keys-style reads, unanchored regex,
// no Proxy, descriptor, prototype, cycle or depth discipline.
function naiveValidator(doc) {
  if (doc === null || typeof doc !== 'object') throw new ValidationError('doc must be an object');
  if (!/[a-z]+/.test(doc.id)) throw new ValidationError('id is invalid');
  JSON.stringify(doc);
  return { valid: true, items: doc.items.length, count: doc.count, note: doc.note };
}

const naiveArgs = () => [{ id: 'abc', items: ['one', 'two'], count: 3, note: 'free text' }];

test('AT-8: the contract helper detects a naive validator in every hostile category', async () => {
  const { violations } = await checkHostileInputContract({ name: 'naive', fn: naiveValidator, validArgs: naiveArgs });
  const variants = [
    ...hostileVariants({}).map(item => item.name),
    ...hostileVariants([]).map(item => item.name),
    ...hostileVariants('abc').map(item => item.name),
    ...descriptorVariants().map(item => item.name)
  ];
  const missed = [...new Set(variants)].filter(name => !violations.some(line => line.includes(` ${name}:`)));
  assert.deepEqual(missed, [], 'every hostile category must produce at least one violation');
  for (const kind of [': accepted', ': raw', ': sentinel', 'caller code ran']) {
    assert.ok(violations.some(line => line.includes(kind)), `expected a "${kind}" violation`);
  }
});

test('AT-8: the contract helper detects input mutation, a failing baseline and returns-style throws', async () => {
  const mutating = await checkHostileInputContract({
    name: 'mutating',
    fn: doc => { if (!doc || typeof doc !== 'object') throw new ValidationError('x'); doc.touched = true; return { valid: true }; },
    validArgs: () => [{ id: 'abc' }]
  });
  assert.ok(mutating.violations.some(line => line.includes('valid baseline input was mutated')));

  const broken = await checkHostileInputContract({ name: 'broken', fn: () => { throw new ValidationError('no'); }, validArgs: () => [{}] });
  assert.ok(broken.violations.some(line => line.includes('valid baseline did not pass')));

  const returnsStyle = await checkHostileInputContract({
    name: 'returns',
    style: 'returns',
    fn: doc => {
      if (doc?.id !== 'abc') throw new ValidationError('should have returned a rejected document');
      return { binding_status: 'bound' };
    },
    validArgs: () => [{ id: 'abc' }]
  });
  assert.ok(returnsStyle.violations.some(line => line.includes('threw-typed')));
});

test('AT-8: classification separates typed rejections, raw errors and caller exceptions', () => {
  assert.equal(classifyThrown(new ValidationError('x')), 'typed');
  assert.equal(classifyThrown(Object.assign(new Error('x'), { code: 'receipt_not_ready' })), 'typed');
  assert.equal(classifyThrown(new TypeError('x')), 'raw');
  assert.equal(classifyThrown(new RangeError('x')), 'raw');
  assert.equal(classifyThrown(Object.assign(new Error('x'), { code: 'ERR_INVALID_ARG_TYPE' })), 'raw');
  assert.equal(classifyThrown('string'), 'raw');
  assert.equal(classifyThrown(new HostileSentinel('x')), 'sentinel');
  assert.deepEqual(walkPaths({ a: { b: [1, { c: 2 }] } }).map(path => path.join('.')), ['a', 'a.b', 'a.b.0', 'a.b.1', 'a.b.1.c']);
});

test('AT-9: the ratchet reports unregistered exports, new failures, changed classes and fixed pairs left listed', () => {
  const baseline = { functions: { 'src/lib/a.mjs#validateA': { null: 'raw', cycle: 'raw' }, 'src/lib/gone.mjs#verifyGone': {} } };
  const observed = {
    functions: {
      'src/lib/a.mjs#validateA': { null: 'sentinel', symbol: 'raw' },
      'src/lib/new.mjs#verifyNew': {}
    }
  };
  const kinds = compareWithBaseline(observed, baseline).map(problem => `${problem.kind}:${problem.name}:${problem.case ?? ''}`);
  assert.deepEqual(kinds.sort(), [
    'changed-class:src/lib/a.mjs#validateA:null',
    'fixed-but-listed:src/lib/a.mjs#validateA:cycle',
    'new-failure:src/lib/a.mjs#validateA:symbol',
    'removed-export:src/lib/gone.mjs#verifyGone:',
    'unregistered-export:src/lib/new.mjs#verifyNew:'
  ]);
  assert.deepEqual(compareWithBaseline(observed, observed), []);
});

test('AT-9: every exported verify*/validate* matches the checked-in hostile-input baseline exactly', async () => {
  const baseline = JSON.parse(readFileSync(BASELINE_PATH, 'utf8'));
  assert.equal(baseline.schema, BASELINE_SCHEMA);
  const observed = await probeAllExports();
  const problems = compareWithBaseline(observed, baseline);
  assert.deepEqual(
    problems,
    [],
    `hostile-input baseline drifted (${problems.length} differences). Fix new failures; when a failure is fixed, `
      + `shrink the baseline with \`${REGEN}\` (run in mesh/). Never edit the JSON by hand.`
  );
});
