import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('AXIOM One delegation inspector is owner-scoped, GET-only, and non-authorizing', async () => {
  const [contractText, policyText, app, gateway] = await Promise.all([
    readFile(new URL('../config/gateway-client-contract.json', import.meta.url), 'utf8'),
    readFile(new URL('../../apps/axiom-one/app-policy.json', import.meta.url), 'utf8'),
    readFile(new URL('../../apps/axiom-one/app.mjs', import.meta.url), 'utf8'),
    readFile(new URL('../src/gateway/server.mjs', import.meta.url), 'utf8')
  ]);
  const contract = JSON.parse(contractText);
  const policy = JSON.parse(policyText);

  const route = contract.routes.find(item => item.id === 'delegations.get');
  assert.ok(route, 'delegations.get must exist in the Gateway client contract');
  assert.equal(route.method, 'GET');
  assert.equal(route.path, '/v1/delegations');
  assert.equal(route.access, 'owner');
  assert.equal(route.idempotency, 'not_applicable');
  assert.deepEqual(route.path_parameters, []);
  assert.deepEqual(route.query_parameters, []);
  assert.equal(route.request_schema, null);
  assert.equal(route.response_schema, 'axiom-delegation-inspector.v1');
  assert.deepEqual(route.required_response_fields, [
    'schema',
    'owner',
    'configured',
    'root_authority',
    'ledger',
    'grants',
    'revocations',
    'execution_authority_granted',
    'digest'
  ]);

  assert.ok(
    policy.gateway_routes.includes('delegations.get'),
    'Axiom One must explicitly allow the read-only delegation route'
  );
  assert.match(app, /\['Delegations',\s*'delegations\.get'\]/);
  assert.match(app, /Delegation inspector/);
  assert.match(app, /execution_authority_granted/);
  assert.doesNotMatch(app, /delegations\.(?:grant|revoke|approve|execute)/);
  assert.doesNotMatch(app, /action:\s*'delegation\./);

  assert.match(gateway, /router\.add\('GET',\s*'\/v1\/delegations'/);
  assert.match(gateway, /readDelegationInspector/);
});
