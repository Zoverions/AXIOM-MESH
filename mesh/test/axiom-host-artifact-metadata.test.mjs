import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import {
  generateAxiomHostH0ArtifactMetadata,
  HOST_LAB_PROFILE_NAME,
  HOST_LAB_SBOM_NAME
} from '../src/axiom-host-artifact-metadata.mjs';

test('H0 metadata derives a deterministic SBOM and non-authorizing draft profile', async () => {
  const root = await mkdtemp(join(tmpdir(), 'axiom-host-metadata-'));
  try {
    const manifestName = 'axiom-host-lab_0.1.0-h0.manifest';
    await writeFile(join(root, manifestName), `${JSON.stringify({
      manifest_version: 1,
      config: {
        name: 'axiom-host-lab',
        distribution: 'fedora',
        architecture: 'x86-64',
        output_format: 'disk',
        version: '0.1.0-h0',
        release: 'rawhide'
      },
      packages: [
        { type: 'rpm', name: 'kernel-core', version: '6.17.0-0.rc1', architecture: 'x86_64' },
        { type: 'rpm', name: 'systemd', version: '258.10-1', architecture: 'x86_64' }
      ],
      extension: {}
    }, null, 2)}\n`);
    const inventory = [
      artifact('axiom-host-lab_0.1.0-h0.efi', 'b'),
      artifact(manifestName, 'c'),
      artifact('axiom-host-lab_0.1.0-h0.raw', 'a'),
      artifact('axiom-host-lab_0.1.0-h0.vmlinuz', 'd')
    ];
    const source = {
      revision: '1'.repeat(40),
      tree: '2'.repeat(40),
      source_date_epoch: 1_786_500_000
    };
    const result = await generateAxiomHostH0ArtifactMetadata({
      outputDirectory: root,
      artifactInventory: inventory,
      source,
      imageVersion: '0.1.0-h0',
      snapshot: '20260813.n.0'
    });
    assert.equal(result.package_count, 2);

    const sbom = JSON.parse(await readFile(join(root, HOST_LAB_SBOM_NAME), 'utf8'));
    assert.equal(sbom.bomFormat, 'CycloneDX');
    assert.equal(sbom.specVersion, '1.6');
    assert.equal(sbom.components.length, 2);
    assert.match(sbom.serialNumber, /^urn:uuid:/);

    const profile = JSON.parse(await readFile(join(root, HOST_LAB_PROFILE_NAME), 'utf8'));
    assert.equal(profile.schema, 'axiom-host-profile.v1');
    assert.equal(profile.host_class, 'laboratory-vm');
    assert.equal(profile.image.image_sha256, 'a'.repeat(64));
    assert.equal(profile.system_root.integrity_state, 'absent');
    assert.equal(profile.authority_non_claims.grants_node_admission, false);
    assert.equal(profile.authority_non_claims.grants_mesh_capability, false);
    assert.equal(profile.authority_non_claims.grants_execution_authority, false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

function artifact(name, prefix) {
  return { name, bytes: 1, sha256: prefix.repeat(64) };
}
