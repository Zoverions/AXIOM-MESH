import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const HOST_PROFILE_URL = new URL(
  '../../docs/architecture/contracts/axiom-host-profile.v1.schema.json',
  import.meta.url
);
const HOST_ARCHITECTURE_URL = new URL(
  '../../docs/architecture/AXIOM-HOST-OPERATING-ENVIRONMENT.md',
  import.meta.url
);

test('AXIOM Host Profile remains documentation-only and cannot grant authority', async () => {
  const schema = JSON.parse(await readFile(HOST_PROFILE_URL, 'utf8'));

  assert.equal(schema.$id, 'https://axiom.invalid/schemas/axiom-host-profile.v1.schema.json');
  assert.equal(schema.properties.schema.const, 'axiom-host-profile.v1');
  assert.equal(
    schema.properties.image.properties.production_credentials_embedded.const,
    false
  );
  assert.equal(
    schema.properties.storage.properties.hard_capacity_independent_of_dedupe.const,
    true
  );
  assert.equal(
    schema.properties.storage.properties.cross_owner_private_dedupe.const,
    false
  );
  assert.equal(
    schema.properties.isolation.properties.host_root_exposed_to_sandboxes.const,
    false
  );
  assert.equal(
    schema.properties.devices.properties.host_key_devices_exposed_to_sandboxes.const,
    false
  );
  assert.deepEqual(
    schema.properties.authority_non_claims.required.sort(),
    [
      'grants_execution_authority',
      'grants_mesh_capability',
      'grants_node_admission',
      'proves_workload_correctness'
    ].sort()
  );
  for (const property of Object.values(
    schema.properties.authority_non_claims.properties
  )) {
    assert.equal(property.const, false);
  }
});

test('AXIOM Host architecture preserves Mesh portability and current attestation non-claim', async () => {
  const architecture = await readFile(HOST_ARCHITECTURE_URL, 'utf8');

  assert.match(
    architecture,
    /AXIOM-MESH remains the portable authority\/evidence substrate/
  );
  assert.match(
    architecture,
    /AXIOM Host is not a new kernel project/
  );
  assert.match(
    architecture,
    /current machine metadata is not hardware remote-attestation proof/
  );
  assert.match(
    architecture,
    /no host evidence bypasses Gateway -> Hypervisor -> Sandbox -> Grid/
  );
  assert.match(
    architecture,
    /build and verify one reproducible, minimal, immutable Linux appliance/
  );
});
