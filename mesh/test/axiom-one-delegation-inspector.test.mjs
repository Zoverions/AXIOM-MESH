import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const appUrl = new URL('../../apps/axiom-one/app.mjs', import.meta.url);
const policyUrl = new URL('../../apps/axiom-one/app-policy.json', import.meta.url);

test('AXIOM One exposes delegation evidence only through a read-only Explore inspector', async () => {
  const [app, policy] = await Promise.all([
    readFile(appUrl, 'utf8'),
    readFile(policyUrl, 'utf8').then(JSON.parse)
  ]);

  assert.ok(policy.gateway_routes.includes('delegations.get'));
  assert.equal(policy.surfaces.includes('delegations'), false);
  assert.match(app, /\['Delegations', 'delegations\.get'\]/);
  assert.match(app, /Delegation inspector/);
  assert.match(app, /Current effective authority/);
  assert.match(app, /Attenuation from parent authority/);
  assert.match(app, /execution_authority_granted/);
  assert.doesNotMatch(app, /delegations\.(grant|revoke|approve|execute)/);
  assert.doesNotMatch(app, /action:\s*'delegation\./);
});
