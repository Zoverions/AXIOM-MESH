import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { validateRuntimeConnectorCatalogEntry } from '../src/lib/runtime-connector-fabric-contracts.mjs';

const CATALOG_URL = new URL('../config/runtime-provider-catalog.v0.json', import.meta.url);

function loadCatalog() {
  return JSON.parse(readFileSync(CATALOG_URL, 'utf8'));
}

test('runtime/provider catalog rejects authority widening if a seed entry is mutated', () => {
  const catalog = loadCatalog();
  const runtime = structuredClone(catalog.entries.find((entry) => entry.integration_class === 'agent-runtime'));
  const provider = structuredClone(catalog.entries.find((entry) => entry.integration_class === 'model-provider'));

  runtime.requested_access.install_grants_authority = true;
  assert.throws(
    () => validateRuntimeConnectorCatalogEntry(runtime),
    /install authority is forbidden/
  );

  provider.requested_access.network_required = false;
  assert.throws(
    () => validateRuntimeConnectorCatalogEntry(provider),
    /no-network integration cannot declare network destinations/
  );

  provider.requested_access.install_grants_authority = true;
  assert.throws(
    () => validateRuntimeConnectorCatalogEntry(provider),
    /install authority is forbidden/
  );
});

test('local compute profiles reject network bootstrap, installation authority, and mutable source pins', () => {
  const catalog = loadCatalog();
  const compute = catalog.entries.find((entry) => entry.integration_class === 'compute-backend');
  assert.ok(compute, 'expected a local compute-backend research profile');

  const loopbackBootstrap = structuredClone(compute);
  loopbackBootstrap.requested_access.network_destinations = ['http://127.0.0.1:11434'];
  assert.throws(
    () => validateRuntimeConnectorCatalogEntry(loopbackBootstrap),
    /no-network integration cannot declare network destinations/
  );

  const automaticNetwork = structuredClone(compute);
  automaticNetwork.requested_access.network_required = true;
  assert.throws(
    () => validateRuntimeConnectorCatalogEntry(automaticNetwork),
    /network-required integration needs explicit destinations/
  );

  const installAuthority = structuredClone(compute);
  installAuthority.requested_access.install_grants_authority = true;
  assert.throws(
    () => validateRuntimeConnectorCatalogEntry(installAuthority),
    /install authority is forbidden/
  );

  const mutableSource = structuredClone(compute);
  mutableSource.provenance.mutable_ref_allowed = true;
  assert.throws(
    () => validateRuntimeConnectorCatalogEntry(mutableSource),
    /mutable source references are forbidden/
  );

  const missingSourcePin = structuredClone(compute);
  delete missingSourcePin.provenance.source_commit;
  assert.throws(
    () => validateRuntimeConnectorCatalogEntry(missingSourcePin),
    /source-repository requires repository and immutable commit/
  );
});
