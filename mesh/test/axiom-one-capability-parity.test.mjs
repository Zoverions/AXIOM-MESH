import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const policyUrl = new URL('../../apps/axiom-one/app-policy.json', import.meta.url);

test('AXIOM One capability parity policy keeps discovery non-authorizing', async () => {
  const policy = JSON.parse(await readFile(policyUrl, 'utf8'));

  assert.deepEqual(policy.capability_parity, {
    status: 'experimental-read-only-projection',
    capability_route: 'capabilities.list',
    runnable_claim_statuses: ['implemented'],
    principal_authority: 'not-inferred-from-discovery',
    discovery_grants_authority: false,
    browser_mutation: false
  });
});
