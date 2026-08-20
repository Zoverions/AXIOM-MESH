import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const surfaceUrl = new URL('../../apps/axiom-one/social-surface-contract.json', import.meta.url);
const gatewayUrl = new URL('../config/gateway-client-contract.json', import.meta.url);
const appPolicyUrl = new URL('../../apps/axiom-one/app-policy.json', import.meta.url);

async function load(url) {
  return JSON.parse(await readFile(url, 'utf8'));
}

test('Axiom One Social surface is prepared but not wired or activated', async () => {
  const surface = await load(surfaceUrl);
  assert.equal(surface.schema, 'axiom-one-social-surface.v0');
  assert.equal(surface.version, 0);
  assert.equal(surface.status, 'prepared-not-wired');
  assert.equal(surface.runtime_activation, false);
  assert.equal(surface.surface_id, 'social');
  assert.equal(surface.authority_effect, 'none');
  assert.equal(surface.network_effect, 'none');
  assert.deepEqual(surface.current_shell_wiring, {
    app_policy_route_registered: false,
    router_registered: false,
    navigation_registered: false,
    service_worker_asset_registered: false
  });
});

test('prepared Social reads already exist in the exact Gateway client contract', async () => {
  const surface = await load(surfaceUrl);
  const gateway = await load(gatewayUrl);
  const gatewayRoutes = new Set(gateway.routes.map(route => route.id));
  assert.deepEqual(surface.gateway_reads.map(read => read.route_id), [
    'social.get',
    'social_remote_review.get'
  ]);
  for (const read of surface.gateway_reads) {
    assert.equal(read.read_only, true);
    assert.ok(gatewayRoutes.has(read.route_id), `missing Gateway route ${read.route_id}`);
  }
});

test('prepared Social surface does not silently claim current Axiom One shell exposure', async () => {
  const surface = await load(surfaceUrl);
  const policy = await load(appPolicyUrl);
  assert.equal(policy.surfaces.includes('social'), false);
  for (const read of surface.gateway_reads) {
    assert.equal(policy.gateway_routes.includes(read.route_id), false);
  }
  assert.equal(surface.current_shell_wiring.app_policy_route_registered, false);
  assert.equal(surface.current_shell_wiring.router_registered, false);
  assert.equal(surface.current_shell_wiring.navigation_registered, false);
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

test('Axiom One Social has no prepared mutation or federation exposure', async () => {
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
