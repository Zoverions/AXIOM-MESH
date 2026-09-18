import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const CONTRACT_URL = new URL(
  '../../../mesh/config/gateway-client-contract.json',
  import.meta.url
);
const FIXTURE_URL = new URL(
  '../fixtures/gateway-effect-anchor.v0.tsv',
  import.meta.url
);

function parseSingleRow(text) {
  const [headerLine, valueLine] = text.trim().split(/\r?\n/);
  const header = headerLine.split('\t');
  const values = valueLine.split('\t');
  return Object.fromEntries(header.map((key, index) => [key, values[index]]));
}

test('Rust personal-kernel effect adapter anchor matches the current Gateway contract', () => {
  const expected = parseSingleRow(readFileSync(FIXTURE_URL, 'utf8'));
  const contract = JSON.parse(readFileSync(CONTRACT_URL, 'utf8'));

  const effectRoutes = contract.routes.filter(route => route.method === 'POST');
  assert.equal(effectRoutes.length, 1);

  const route = effectRoutes[0];
  assert.equal(route.id, expected.route_id);
  assert.equal(route.method, expected.method);
  assert.equal(route.path, expected.path);
  assert.equal(route.request_schema, expected.request_schema);
  assert.equal(route.idempotency, expected.idempotency);
  assert.equal(
    String(contract.boundary.direct_internal_service_access),
    expected.direct_internal_service_access
  );
  assert.equal(contract.boundary.request_target, 'same-origin-relative-path');
  assert.equal(
    contract.boundary.authenticated_transport,
    'permission-restricted-gateway-ingress'
  );
});
