import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { ValidationError } from '../src/lib/canonical.mjs';

async function loadBoundedIntegerQuery() {
  const source = await readFile(new URL('../src/gateway/server.mjs', import.meta.url), 'utf8');
  const match = source.match(
    /(function boundedIntegerQuery\([\s\S]*?\n\})\n\nfunction enforceTelemetryCollectionBoundary/
  );
  assert.ok(match, 'boundedIntegerQuery source must remain discoverable for boundary regression tests');
  return new Function(
    'ValidationError',
    `${match[1]}; return boundedIntegerQuery;`
  )(ValidationError);
}

const bounds = Object.freeze({
  label: 'test limit',
  min: 0,
  max: 500
});

test('bounded integer query uses fallback only when the parameter is omitted', async () => {
  const boundedIntegerQuery = await loadBoundedIntegerQuery();
  assert.equal(boundedIntegerQuery(null, 100, bounds), 100);
  assert.throws(
    () => boundedIntegerQuery('', 100, bounds),
    /test limit must be an integer between 0 and 500/
  );
});

test('bounded integer query preserves canonical integer grammar', async () => {
  const boundedIntegerQuery = await loadBoundedIntegerQuery();
  assert.equal(boundedIntegerQuery('0', 100, bounds), 0);
  assert.equal(boundedIntegerQuery('500', 100, bounds), 500);

  for (const value of ['00', '01', '+1', '-1', ' 1', '1 ', '1.0', '1e2']) {
    assert.throws(
      () => boundedIntegerQuery(value, 100, bounds),
      /test limit must be an integer between 0 and 500/,
      `expected ${JSON.stringify(value)} to fail closed`
    );
  }
});

test('bounded integer query preserves lower and upper bounds', async () => {
  const boundedIntegerQuery = await loadBoundedIntegerQuery();
  assert.equal(boundedIntegerQuery('1', 100, {
    label: 'positive limit',
    min: 1,
    max: 100
  }), 1);
  assert.throws(
    () => boundedIntegerQuery('0', 100, {
      label: 'positive limit',
      min: 1,
      max: 100
    }),
    /positive limit must be an integer between 1 and 100/
  );
  assert.throws(
    () => boundedIntegerQuery('501', 100, bounds),
    /test limit must be an integer between 0 and 500/
  );
});
