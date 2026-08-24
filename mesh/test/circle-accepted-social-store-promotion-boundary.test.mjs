import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const compositionUrl = new URL('../src/grid/accepted-social-circle-store.mjs', import.meta.url);
const gridServerUrl = new URL('../src/grid/server.mjs', import.meta.url);
const hypervisorServerUrl = new URL('../src/hypervisor/server.mjs', import.meta.url);
const gatewayServerUrl = new URL('../src/gateway/server.mjs', import.meta.url);

test('accepted Social + Circle composition remains unselected by production Grid', async () => {
  const [composition, gridServer] = await Promise.all([
    readFile(compositionUrl, 'utf8'),
    readFile(gridServerUrl, 'utf8')
  ]);

  assert.match(gridServer, /import \{ AcceptedSocialGridStore \} from '\.\/accepted-social-store\.mjs';/);
  assert.match(gridServer, /new AcceptedSocialGridStore\s*\(/);
  assert.doesNotMatch(gridServer, /accepted-social-circle-store\.mjs/);
  assert.doesNotMatch(gridServer, /AcceptedSocialCircleGridStore/);
  assert.doesNotMatch(gridServer, /LifecycleGuardedAcceptedSocialCircleGridStore/);

  assert.match(composition, /production_store_selected:\s*false|production_store_selected/);
  assert.doesNotMatch(composition, /runtime_activation:\s*true/);
  assert.doesNotMatch(composition, /authority_effect:\s*['"](?:grant|allow|execute)['"]/);
});

test('composition adds no Gateway or Hypervisor Circle route', async () => {
  const [gatewayServer, hypervisorServer] = await Promise.all([
    readFile(gatewayServerUrl, 'utf8'),
    readFile(hypervisorServerUrl, 'utf8')
  ]);

  for (const source of [gatewayServer, hypervisorServer]) {
    assert.doesNotMatch(source, /accepted-social-circle-store\.mjs/);
    assert.doesNotMatch(source, /appendCirclePersistenceWithLifecycleGuards/);
    assert.doesNotMatch(source, /issueCirclePossessionBoundAtomicCapability/);
    assert.doesNotMatch(source, /authorizeCircleSelfProtectiveLifecycleMutation/);
  }
});

test('composition policy keeps existing network and Social mutation boundaries unchanged', async () => {
  const policy = JSON.parse(await readFile(
    new URL('../config/circle-accepted-social-store-composition.v0.json', import.meta.url),
    'utf8'
  ));

  assert.equal(policy.runtime_activation, false);
  assert.equal(policy.production_store_selected, false);
  assert.equal(policy.authority_effect, 'none');
  assert.equal(policy.network_effect, 'none');
  assert.equal(policy.requirements.social_mutation_surface_changed, false);
  assert.equal(policy.requirements.network_egress_changed, false);
  assert.equal(policy.requirements.public_circle_route, false);
  assert.equal(policy.requirements.gateway_circle_route, false);
  assert.equal(policy.requirements.hypervisor_circle_action, false);
});
