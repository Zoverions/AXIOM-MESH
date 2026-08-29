import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import test from 'node:test';

const moduleUrl = new URL('../src/lib/entity-assurance.mjs', import.meta.url);

test('entity assurance exists as a first-class trust primitive', () => {
  assert.equal(existsSync(moduleUrl), true);
});
