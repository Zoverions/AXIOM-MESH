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
