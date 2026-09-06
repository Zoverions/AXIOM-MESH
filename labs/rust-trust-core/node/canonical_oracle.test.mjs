import assert from 'node:assert/strict';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { decodeVectorRow, parseFixture, runFixture } from './canonical_oracle.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURE = join(HERE, '..', 'fixtures', 'canonical-value-v0.tsv');

test('Node oracle decodes representative canonical-value-v0 rows', () => {
  assert.deepEqual(decodeVectorRow('bool_true\tbool\ttrue'), {
    caseId: 'bool_true',
    value: true
  });
  assert.equal(Object.is(decodeVectorRow('negative_zero\tnegative_zero\t-0').value, -0), true);
  assert.deepEqual(decodeVectorRow('array\tscalar_array\tn,b:false,i:42,z,s:hello').value, [
    null,
    false,
    42,
    -0,
    'hello'
  ]);
});

test('Node oracle executes the supported canonicalJson implementation for the shared fixture', async () => {
  const output = await runFixture(FIXTURE);
  const lines = output.split('\n');

  assert.equal(lines.includes('negative_zero\t0'), true);
  assert.equal(lines.includes('array_order_preserved\t[2,1]'), true);
  assert.equal(lines.includes('object_key_sort\t{"alpha":1,"zeta":2}'), true);
  assert.equal(lines.includes('object_mixed\t{"a":"hello","b":false,"m":0,"n":null}'), true);
});

test('fixture parser preserves all declared case ids exactly once', async () => {
  const { readFile } = await import('node:fs/promises');
  const cases = parseFixture(await readFile(FIXTURE, 'utf8'));
  assert.equal(cases.length, 17);
  assert.equal(new Set(cases.map(item => item.caseId)).size, cases.length);
});
