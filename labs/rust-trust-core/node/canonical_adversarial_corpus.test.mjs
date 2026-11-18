import assert from 'node:assert/strict';
import test from 'node:test';

import {
  FIXED_SEEDS,
  VALID_CASES_PER_SEED,
  INVALID_CASES_PER_SEED,
  generateInvalidCases,
  generateValidCases,
  renderInvalidFixture,
  renderValidFixture,
  xorshift32
} from './canonical_adversarial_corpus.mjs';

const REQUIRED_VALID_CATEGORIES = new Set([
  'null_or_bool',
  'zero_or_near',
  'safe_min',
  'safe_max',
  'near_safe_min',
  'near_safe_max',
  'negative_zero',
  'ascii_string',
  'empty_array',
  'mixed_array',
  'negative_zero_array',
  'empty_object',
  'single_object',
  'unordered_object',
  'adjacent_prefix_keys',
  'object_permutation'
]);

const INVALID_CATEGORIES = [
  'unknown_kind',
  'duplicate_case_id',
  'invalid_boolean',
  'integer_above_max',
  'integer_below_min',
  'invalid_negative_zero',
  'excluded_string_character',
  'malformed_array_token',
  'nested_token',
  'invalid_object_key',
  'duplicate_object_key',
  'wrong_tsv_columns',
  'payload_over_limit',
  'array_over_limit',
  'object_over_limit',
  'key_over_limit'
];

function sequence(seed, count) {
  const values = [];
  let state = seed >>> 0;
  for (let index = 0; index < count; index += 1) {
    state = xorshift32(state);
    values.push(state);
  }
  return values;
}

function countByCategory(cases) {
  const counts = new Map();
  for (const entry of cases) {
    counts.set(entry.category, (counts.get(entry.category) ?? 0) + 1);
  }
  return counts;
}

test('Stage 4 fixes exact deterministic seeds and corpus counts', () => {
  assert.deepEqual(FIXED_SEEDS, [
    0x4158494F,
    0x4D455348,
    0xC0DEF00D,
    0x5EED0004
  ]);
  assert.equal(VALID_CASES_PER_SEED, 256);
  assert.equal(INVALID_CASES_PER_SEED, 64);
});

test('xorshift32 matches independently frozen known sequences', () => {
  assert.deepEqual(sequence(0x4158494F, 4), [
    0x46402397, 0x046EB34E, 0x92E453ED, 0x0BA60B81
  ]);
  assert.deepEqual(sequence(0x4D455348, 4), [
    0x02A83B1E, 0xBCB4C69B, 0xA89121A8, 0x182898BA
  ]);
  assert.deepEqual(sequence(0xC0DEF00D, 4), [
    0xC534B322, 0x394B8BCA, 0x4E6F15B3, 0x37FD583F
  ]);
  assert.deepEqual(sequence(0x5EED0004, 4), [
    0x23521132, 0x4FF85088, 0xF8C73DFC, 0xF06EFA40
  ]);
});

test('valid corpus replays exactly, is unique, and covers every required category', () => {
  for (const seed of FIXED_SEEDS) {
    const first = generateValidCases(seed);
    const second = generateValidCases(seed);
    assert.deepEqual(first, second, `seed ${seed.toString(16)} must replay exactly`);
    assert.equal(first.length, VALID_CASES_PER_SEED);
    assert.equal(new Set(first.map(entry => entry.caseId)).size, first.length);

    const categories = new Set(first.map(entry => entry.category));
    assert.deepEqual(categories, REQUIRED_VALID_CATEGORIES);

    const counts = countByCategory(first);
    assert.equal(counts.get('object_permutation'), 32);
    assert.equal(counts.get('mixed_array'), 21);
    assert.equal(counts.get('unordered_object'), 21);
    for (const category of REQUIRED_VALID_CATEGORIES) {
      if (!['object_permutation', 'mixed_array', 'unordered_object'].includes(category)) {
        assert.equal(counts.get(category), 14, category);
      }
    }

    const permutationCases = first.filter(entry => entry.category === 'object_permutation');
    assert.equal(new Set(permutationCases.map(entry => entry.permutationGroup)).size, 16);
    for (const group of new Set(permutationCases.map(entry => entry.permutationGroup))) {
      const pair = permutationCases.filter(entry => entry.permutationGroup === group);
      assert.equal(pair.length, 2, group);
      assert.notEqual(pair[0].payload, pair[1].payload, group);
    }
  }
});

test('invalid corpus has exactly four cases per declared category for every seed', () => {
  for (const seed of FIXED_SEEDS) {
    const first = generateInvalidCases(seed);
    const second = generateInvalidCases(seed);
    assert.deepEqual(first, second, `seed ${seed.toString(16)} invalid corpus must replay exactly`);
    assert.equal(first.length, INVALID_CASES_PER_SEED);
    assert.equal(new Set(first.map(entry => entry.caseId)).size, first.length);

    const counts = countByCategory(first);
    assert.deepEqual(new Set(counts.keys()), new Set(INVALID_CATEGORIES));
    for (const category of INVALID_CATEGORIES) {
      assert.equal(counts.get(category), 4, category);
    }
  }
});

test('renderers preserve only frozen fixture grammar columns', () => {
  const valid = FIXED_SEEDS.flatMap(generateValidCases);
  const validFixture = renderValidFixture(valid);
  const validLines = validFixture.trimEnd().split('\n');
  assert.equal(validLines.shift(), 'case_id\tkind\tpayload');
  assert.equal(validLines.length, 1024);
  for (const line of validLines) {
    assert.equal(line.split('\t').length, 3, line);
  }

  const invalid = FIXED_SEEDS.flatMap(generateInvalidCases);
  const invalidFixture = renderInvalidFixture(invalid);
  const invalidLines = invalidFixture.trimEnd().split('\n');
  assert.equal(invalidLines.shift(), 'case_id\tencoded_row');
  assert.equal(invalidLines.length, 256);
  for (const line of invalidLines) {
    assert.notEqual(line.indexOf('\t'), -1, line);
  }
});
