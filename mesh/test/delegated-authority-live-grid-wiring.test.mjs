import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const resolvePath = '/internal/v1/delegated-authorizations/resolve';

async function text(relative) {
  return readFile(new URL(relative, import.meta.url), 'utf8');
}

test('live Grid maintains delegated projections and registers a dark resolution route', async () => {
  const grid = await text('../src/grid/server.mjs');
  assert.match(
    grid,
    /import \{ DelegatedAuthorityGridStore \} from '\.\/delegated-authority-store\.mjs';/,
  );
  assert.match(grid, /store = new DelegatedAuthorityGridStore\(/);
  assert.match(
    grid,
    /registerDelegatedAuthorizationGridRoute\(router, store\);/,
  );
});

test('delegated resolution remains unreachable because service policy omits the route', async () => {
  const policy = JSON.parse(await text('../config/service-network-policy.json'));
  const flow = policy.flows.find(candidate => candidate.id === 'hypervisor-to-grid');
  assert.ok(flow, 'hypervisor-to-grid flow must exist');
  assert.equal(
    flow.routes.some(route => route.method === 'POST' && route.path === resolvePath),
    false,
    'delegated resolution must remain absent from the default-deny allowlist',
  );

  const hypervisor = await text('../src/hypervisor/server.mjs');
  assert.equal(
    hypervisor.includes(resolvePath),
    false,
    'Hypervisor must not call delegated resolution before the live authority edge is separately reviewed',
  );
});
