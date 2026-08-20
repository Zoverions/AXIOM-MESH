import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const surfaceUrl = new URL('../../apps/axiom-one/social-surface-contract.json', import.meta.url);
const gatewayUrl = new URL('../config/gateway-client-contract.json', import.meta.url);
const appPolicyUrl = new URL('../../apps/axiom-one/app-policy.json', import.meta.url);
const appUrl = new URL('../../apps/axiom-one/app.mjs', import.meta.url);
const indexUrl = new URL('../../apps/axiom-one/index.html', import.meta.url);
const workerUrl = new URL('../../apps/axiom-one/sw.mjs', import.meta.url);
const serverUrl = new URL('../../apps/axiom-one/server.mjs', import.meta.url);

async function load(url) {
  return JSON.parse(await readFile(url, 'utf8'));
}

async function text(url) {
  return readFile(url, 'utf8');
}

test('Axiom One Social surface is wired as a read-only preview', async () => {
  const surface = await load(surfaceUrl);
  assert.equal(surface.schema, 'axiom-one-social-surface.v0');
  assert.equal(surface.version, 0);
  assert.equal(surface.status, 'read-only-wired-preview');
  assert.equal(surface.runtime_activation, true);
  assert.equal(surface.surface_id, 'social');
  assert.equal(surface.authority_effect, 'none');
  assert.equal(surface.network_effect, 'none');
  assert.equal(surface.browser_asset, '/social-presentation.mjs');
  assert.deepEqual(surface.current_shell_wiring, {
    app_policy_route_registered: true,
    router_registered: true,
    navigation_registered: true,
    service_worker_asset_registered: true
  });
});

test('wired Social reads exist in the exact Gateway client contract and app policy', async () => {
  const surface = await load(surfaceUrl);
  const gateway = await load(gatewayUrl);
  const policy = await load(appPolicyUrl);
  const gatewayRoutes = new Set(gateway.routes.map(route => route.id));
  assert.deepEqual(surface.gateway_reads.map(read => read.route_id), [
    'social.get',
    'social_remote_review.get'
  ]);
  assert.equal(policy.surfaces.includes('social'), true);
  for (const read of surface.gateway_reads) {
    assert.equal(read.read_only, true);
    assert.ok(gatewayRoutes.has(read.route_id), `missing Gateway route ${read.route_id}`);
    assert.equal(policy.gateway_routes.includes(read.route_id), true);
  }
});

test('AXIOM One shell and local server expose the Social presenter exactly', async () => {
  const [app, index, worker, server] = await Promise.all([
    text(appUrl),
    text(indexUrl),
    text(workerUrl),
    text(serverUrl)
  ]);
  assert.match(app, /from '\/social-presentation\.mjs'/);
  assert.match(app, /social: renderSocial/);
  assert.match(app, /state\.client\.call\('social\.get'\)/);
  assert.match(app, /state\.client\.call\('social_remote_review\.get'\)/);
  assert.match(index, /data-route="social">Social</);
  assert.match(worker, /'\/social-presentation\.mjs'/);
  assert.match(server, /'\/social-presentation\.mjs'/);
  assert.match(server, /packages', 'axiom-one-social-presentation', 'index\.mjs'/);
});

test('Axiom One Social presentation remains read-only and strips protected social state', async () => {
  const surface = await load(surfaceUrl);
  assert.equal(surface.local_model.distribution_state, 'local-only');
  assert.equal(surface.local_model.private_actor_state_exposed, false);
  assert.equal(surface.local_model.protected_persona_state_exposed, false);
  assert.equal(surface.local_model.network_delivery_claimed, false);
  assert.equal(surface.remote_model.activation_scope, 'local-read-only-review');
  assert.equal(surface.remote_model.remote_observation_is_local_authorship_proof, false);
  assert.equal(surface.remote_model.exporter_attestation_is_identity_proof, false);
  assert.equal(surface.remote_model.exporter_attestation_is_content_truth_proof, false);
  assert.equal(surface.remote_model.ranking_enabled, false);
  assert.equal(surface.remote_model.recommendation_enabled, false);
});

test('Axiom One Social exposes no mutation or federation surface', async () => {
  const surface = await load(surfaceUrl);
  assert.equal(surface.writes.enabled, false);
  for (const [key, value] of Object.entries(surface.writes)) {
    if (key === 'enabled') continue;
    assert.equal(value, false, `${key} unexpectedly enabled`);
  }
  assert.deepEqual(surface.federation, {
    enabled: false,
    activitypub_enabled: false,
    remote_transport_enabled: false
  });
});
