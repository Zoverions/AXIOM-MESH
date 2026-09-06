import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import {
  decodeVectorRow,
  parseFixture,
  runFixture,
  runFixtureText
} from './canonical_oracle.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURE = join(HERE, '..', 'fixtures', 'canonical-value-v0.tsv');
const INVALID_FIXTURE = join(HERE, '..', 'fixtures', 'canonical-value-v0-invalid.tsv');
const ORACLE = join(HERE, 'canonical_oracle.mjs');

function decodeEscapedRow(encoded) {
  return encoded.replaceAll('\\t', '\t').replaceAll('\\n', '\n');
}

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

test('fixture-text execution is identical to file execution', async () => {
  const text = await readFile(FIXTURE, 'utf8');
  assert.equal(runFixtureText(text), await runFixture(FIXTURE));
});

test('Node oracle CLI accepts fixture text over stdin', async () => {
  const text = await readFile(FIXTURE, 'utf8');
  const expected = await runFixture(FIXTURE);
  const result = spawnSync(process.execPath, [ORACLE, '-'], {
    input: text,
    encoding: 'utf8'
  });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, `${expected}\n`);
});

test('fixture parser preserves all declared case ids exactly once', async () => {
  const cases = parseFixture(await readFile(FIXTURE, 'utf8'));
  assert.equal(cases.length, 17);
  assert.equal(new Set(cases.map(item => item.caseId)).size, cases.length);
});

test('Node oracle fails closed on every malformed canonical-value-v0 case', async () => {
  const lines = (await readFile(INVALID_FIXTURE, 'utf8')).trimEnd().split('\n');
  assert.equal(lines.shift(), 'case_id\tencoded_row');
  assert.equal(lines.length, 12);

  for (const line of lines) {
    const separator = line.indexOf('\t');
    assert.notEqual(separator, -1, `invalid corpus row missing separator: ${line}`);
    const caseId = line.slice(0, separator);
    const encoded = line.slice(separator + 1);
    const decoded = decodeEscapedRow(encoded);

    if (caseId === 'duplicate_case_id_fixture') {
      assert.throws(
        () => parseFixture(`case_id\tkind\tpayload\n${decoded}`),
        /Duplicate canonical vector case_id/
      );
    } else {
      assert.throws(() => decodeVectorRow(decoded), undefined, caseId);
    }
  }
});
