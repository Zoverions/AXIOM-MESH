import assert from 'node:assert/strict';
import test from 'node:test';
import {
  assertAuthorityNeutral,
  assertEnum,
  assertIsoTimestamp,
  assertNoUnknownKeys,
  assertReference,
  assertUniqueStrings
} from '../src/domain/sovereign-information-common.mjs';

test('shared SIEA validators accept bounded canonical semantic values', () => {
  assert.equal(assertEnum('subject', 'relationship', new Set(['subject', 'originator'])), 'subject');
  assert.deepEqual(assertUniqueStrings(['a', 'b'], 'refs', { min: 1 }), ['a', 'b']);
  assert.equal(assertIsoTimestamp('2026-09-03T12:00:00.000Z', 'created_at'), '2026-09-03T12:00:00.000Z');
  assert.equal(assertReference('principal:alice', 'principal_ref'), 'principal:alice');
  assert.deepEqual(assertNoUnknownKeys({ a: 1 }, 'value', new Set(['a'])), { a: 1 });
});

test('shared SIEA validators reject ambiguous or authority-bearing semantic state', () => {
  assert.throws(() => assertUniqueStrings(['a', 'a'], 'refs'), /duplicates/);
  assert.throws(() => assertIsoTimestamp('tomorrow', 'created_at'), /ISO timestamp/);
  assert.throws(() => assertReference('', 'principal_ref'), /reference/);
  assert.throws(() => assertNoUnknownKeys({ a: 1, b: 2 }, 'value', new Set(['a'])), /unknown field b/);
  assert.throws(() => assertAuthorityNeutral({ execution_authority: ['effect:x'] }, 'semantic object'), /execution authority/);
  assert.throws(() => assertAuthorityNeutral({ capability_grant: 'grant:x' }, 'semantic object'), /execution authority/);
});
