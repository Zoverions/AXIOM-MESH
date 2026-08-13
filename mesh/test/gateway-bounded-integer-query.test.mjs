import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import test from 'node:test';
import vm from 'node:vm';

const gatewaySource = await readFile(
  join(import.meta.dirname, '..', 'src', 'gateway', 'server.mjs'),
  'utf8'
);

function loadBoundedIntegerQuery() {
  const match = gatewaySource.match(
    /function boundedIntegerQuery\(value, fallback, \{ label, min, max \}\) \{[\s\S]*?\n\}/
  );
  assert.ok(match, 'boundedIntegerQuery source must remain discoverable for regression coverage');
  const context = {
    ValidationError: class ValidationError extends Error {}
  };
  vm.runInNewContext(`${match[0]}; this.boundedIntegerQuery = boundedIntegerQuery;`, context);
  return context.boundedIntegerQuery;
}

const boundedIntegerQuery = loadBoundedIntegerQuery();

function parse(value, fallback = 100, min = 1, max = 500) {
  return boundedIntegerQuery(value, fallback, { label: 'test value', min, max });
}

test('omitted bounded integer query uses the documented fallback', () => {
  assert.equal(parse(null), 100);
});

test('explicitly empty bounded integer query fails closed', () => {
  assert.throws(() => parse(''), /must be an integer between 1 and 500/);
});

test('canonical zero is accepted only when the route minimum allows zero', () => {
  assert.equal(parse('0', 7, 0, 3), 0);
  assert.throws(() => parse('0'), /must be an integer between 1 and 500/);
});

test('non-canonical integer spellings remain rejected', () => {
  for (const value of ['00', '01', '+1', '-1', ' 1', '1 ', '1.0', '1e2']) {
    assert.throws(() => parse(value), /must be an integer between 1 and 500/);
  }
});

test('bounded integer query retains lower and upper limits', () => {
  assert.equal(parse('1'), 1);
  assert.equal(parse('500'), 500);
  assert.throws(() => parse('501'), /must be an integer between 1 and 500/);
});
