import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { AxiomError, ValidationError } from '../src/lib/canonical.mjs';

async function loadBoundedIntegerQuery() {
  const source = await readFile(new URL('../src/gateway/server.mjs', import.meta.url), 'utf8');
  const match = source.match(/function boundedIntegerQuery\(value, fallback, \{ label, min, max \}\) \{[\s\S]*?\n\}\n/);
  assert.ok(match, 'boundedIntegerQuery helper must remain discoverable for contract verification');
  const factory = new Function(
    'AxiomError',
    'ValidationError',
    `'use strict';\n${match[0]}\nreturn boundedIntegerQuery;`
  );
  return { boundedIntegerQuery: factory(AxiomError, ValidationError), source };
}

const ROUTE_INTEGER_BINDINGS = [
  ['/v1/approvals', 'approvals limit'],
  ['/v1/memory', 'memory limit'],
  ['/v1/backups', 'backups limit'],
  ['/v1/node-schedules', 'node schedules limit'],
  ['/v1/node-discovery', 'node discovery minimum_security_level'],
  ['/v1/node-discovery', 'node discovery minimum_lease_seconds'],
  ['/v1/node-discovery', 'node discovery limit']
];

test('Security Residue v0 binds every existing collection/discovery integer to boundedIntegerQuery', async () => {
  const { source } = await loadBoundedIntegerQuery();
  for (const [route, label] of ROUTE_INTEGER_BINDINGS) {
    const routeStart = source.indexOf(`router.add('GET', '${route}'`);
    assert.notEqual(routeStart, -1, `missing Gateway route ${route}`);
    const nextRoute = source.indexOf("\n  router.add(", routeStart + 1);
    const routeSource = source.slice(routeStart, nextRoute === -1 ? source.length : nextRoute);
    assert.equal(
      routeSource.includes(`label: '${label}'`),
      true,
      `${route} must validate ${label} with boundedIntegerQuery`
    );
  }
});

test('Security Residue v0 does not add an offset query surface', async () => {
  const { source } = await loadBoundedIntegerQuery();
  assert.doesNotMatch(source, /searchParams\.get\(['"]offset['"]\)/);
});

test('Security Residue v0 accepts fallback only for an absent integer query parameter', async () => {
  const { boundedIntegerQuery } = await loadBoundedIntegerQuery();
  const options = { label: 'test integer', min: 1, max: 100 };

  assert.equal(boundedIntegerQuery(null, 17, options), 17);
  assert.equal(boundedIntegerQuery('1', 17, options), 1);
  assert.equal(boundedIntegerQuery('100', 17, options), 100);
});

test('Security Residue v0 fails malformed and non-canonical integer queries as invalid_parameter', async () => {
  const { boundedIntegerQuery } = await loadBoundedIntegerQuery();
  const options = { label: 'test integer', min: 1, max: 100 };
  const invalidValues = [
    '',
    ' ',
    '\t',
    '00',
    '01',
    '+1',
    '-1',
    '1.0',
    '1x',
    '0',
    '101'
  ];

  for (const value of invalidValues) {
    assert.throws(
      () => boundedIntegerQuery(value, 17, options),
      error => (
        error instanceof AxiomError
        && error.code === 'invalid_parameter'
        && error.status === 400
        && /test integer must be an integer between 1 and 100/.test(error.message)
      ),
      `expected ${JSON.stringify(value)} to fail with invalid_parameter`
    );
  }
});
