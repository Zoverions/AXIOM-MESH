import assert from 'node:assert/strict';
import test from 'node:test';

import {
  FIXED_SEEDS,
  generateInvalidCases
} from './canonical_adversarial_corpus.mjs';
import {
  decodeVectorRow,
  parseFixture
} from './canonical_oracle.mjs';
import {
  STAGE4_LIMITS,
  validateStage4FixtureLimits,
  validateStage4RowLimits
} from './canonical_adversarial_limits.mjs';

const EXPECTED_INVALID_CATEGORIES = [
  'array_over_limit',
  'duplicate_case_id',
  'duplicate_object_key',
  'excluded_string_character',
  'integer_above_max',
  'integer_below_min',
  'invalid_boolean',
  'invalid_negative_zero',
  'invalid_object_key',
  'key_over_limit',
  'malformed_array_token',
  'nested_token',
  'object_over_limit',
  'payload_over_limit',
  'unknown_kind',
  'wrong_tsv_columns'
];

const LIMIT_CATEGORIES = new Set([
  'payload_over_limit',
  'array_over_limit',
  'object_over_limit',
  'key_over_limit'
]);

function fixtureWithRows(count) {
  const rows = Array.from({ length: count }, (_, index) => `case_${index}\tbool\ttrue`);
  return `case_id\tkind\tpayload\n${rows.join('\n')}\n`;
}

test('Stage 4 fixes exact fail-closed resource limits', () => {
  assert.deepEqual(STAGE4_LIMITS, {
    maxTotalCases: 2048,
    maxArrayItems: 32,
    maxObjectMembers: 32,
    maxKeyLength: 64,
    maxPayloadBytes: 4096
  });
});

test('Stage 4 row limits accept the boundary and reject limit plus one', () => {
  assert.doesNotThrow(() => validateStage4RowLimits('ok\tscalar_array\tn,b:true'));
  assert.doesNotThrow(() => validateStage4RowLimits(`payload\tascii_string\t${'a'.repeat(4096)}`));
  assert.throws(
    () => validateStage4RowLimits(`payload\tascii_string\t${'a'.repeat(4097)}`),
    /MAX_PAYLOAD_BYTES/
  );
  assert.throws(
    () => validateStage4RowLimits(`array\tscalar_array\t${Array(33).fill('n').join(',')}`),
    /MAX_ARRAY_ITEMS/
  );
  assert.throws(
    () => validateStage4RowLimits(`object\tascii_key_object\t${Array.from({ length: 33 }, (_, index) => `k${index}=n`).join(';')}`),
    /MAX_OBJECT_MEMBERS/
  );
  assert.throws(
    () => validateStage4RowLimits(`key\tascii_key_object\t${'k'.repeat(65)}=n`),
    /MAX_KEY_LENGTH/
  );
});

test('Stage 4 fixture limit accepts 2048 cases and rejects 2049', () => {
  assert.doesNotThrow(() => validateStage4FixtureLimits(fixtureWithRows(2048)));
  assert.throws(() => validateStage4FixtureLimits(fixtureWithRows(2049)), /MAX_TOTAL_CASES/);
});

test('all 256 generated invalid or over-bound cases fail closed in the Node path', () => {
  const categories = new Set();
  let rejected = 0;

  for (const seed of FIXED_SEEDS) {
    const cases = generateInvalidCases(seed);
    assert.equal(cases.length, 64);

    for (const entry of cases) {
      categories.add(entry.category);

      if (LIMIT_CATEGORIES.has(entry.category)) {
        assert.throws(() => validateStage4RowLimits(entry.row), /MAX_/i, entry.caseId);
      } else if (entry.category === 'duplicate_case_id') {
        assert.throws(
          () => parseFixture(`case_id\tkind\tpayload\n${entry.row}\n`),
          /Duplicate canonical vector case_id/,
          entry.caseId
        );
      } else {
        assert.throws(() => {
          validateStage4RowLimits(entry.row);
          decodeVectorRow(entry.row);
        }, undefined, entry.caseId);
      }
      rejected += 1;
    }
  }

  assert.equal(rejected, 256);
  assert.deepEqual([...categories].sort(), EXPECTED_INVALID_CATEGORIES);
});
