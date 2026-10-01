import assert from 'node:assert/strict';
import { generateKeyPairSync, sign } from 'node:crypto';
import test from 'node:test';
import installTargets from '../config/install-targets.json' with { type: 'json' };
import hostInstallPolicy from '../config/host-install-policy.json' with { type: 'json' };
import capabilityRegistry from '../config/capabilities.json' with { type: 'json' };
import applicationCatalog from '../config/application-catalog.json' with { type: 'json' };
import serviceNetworkPolicy from '../config/service-network-policy.json' with { type: 'json' };
import sourceSetupPolicy from '../config/setup.json' with { type: 'json' };
import { MIGRATIONS } from '../src/grid/migrations.mjs';
import {
  INSTALL_RELEASE_MANIFEST_PACKAGE_SCHEMA,
  INSTALL_RELEASE_MANIFEST_SCHEMA,
  validateInstallReleaseManifestPolicy,
  verifyInstallReleaseArtifact,
  verifyInstallReleaseManifest
} from '../src/lib/install-release-manifest.mjs';
import { canonicalJson, digestObject, sha256 } from '../src/lib/canonical.mjs';

const pair = generateKeyPairSync('ed25519');
const publicPem = pair.publicKey.export({ type: 'spki', format: 'pem' });
const KEY_ID = 'release:test-key-1';
const EVALUATED_AT = '2026-08-23T16:30:00.000Z';
const artifactBytes = Object.freeze({
  'source-personal': Buffer.from('source archive personal'),
  'runtime-infrastructure': Buffer.from('oci image infrastructure'),
  documentation: Buffer.from('documentation bundle'),
  sbom: Buffer.from('spdx sbom'),
  provenance: Buffer.from('release provenance')
});

function artifact(artifactId, kind, requiredForProfiles, overrides = {}) {
  const bytes = artifactBytes[artifactId] ?? Buffer.from(`artifact:${artifactId}`);
  return {
    artifact_id: artifactId,
    kind,
    platform: kind === 'documentation-bundle' || kind === 'sbom' || kind === 'provenance'
      ? 'any'
      : 'linux',
    architecture: kind === 'documentation-bundle' || kind === 'sbom' || kind === 'provenance'
      ? 'any'
      : 'x64',
    media_type: kind === 'oci-image'
      ? 'application/vnd.oci.image.manifest.v1+json'
      : 'application/octet-stream',
    locator: `release://0.12.0-dev.3/${artifactId}`,
    sha256: sha256(bytes),
    byte_length: bytes.length,
    required_for_profiles: requiredForProfiles,
    ...overrides
  };
}

function manifest(overrides = {}) {
  return {
    schema: INSTALL_RELEASE_MANIFEST_SCHEMA,
    version: 1,
    release_id: 'axiom-mesh/0.12.0-dev.3/test-release',
    kernel_version: '0.12.0-dev.3',
    channel: 'development',
    production_promoted: false,
    source_revision: 'a'.repeat(40),
    issued_at: '2026-08-23T16:00:00.000Z',
    valid_until: '2026-08-23T17:00:00.000Z',
    signing_key_id: KEY_ID,
    install_profiles: [
      { id: 'personal-local', target_status: 'specified' },
      { id: 'infrastructure-node', target_status: 'specified' }
    ],
    toolchain: {
      node_engine: sourceSetupPolicy.runtime.engine,
      node_ci_version: sourceSetupPolicy.runtime.ci_version,
      node_production_version: sourceSetupPolicy.runtime.production_version,
      npm_minimum_version: sourceSetupPolicy.package_manager.minimum_version,
      npm_major_exclusive: sourceSetupPolicy.package_manager.maximum_major_exclusive
    },
    data_compatibility: {
      migration_generation: MIGRATIONS.length,
      rollback_mode: 'migration-specific',
      minimum_compatible_kernel: '0.12.0-dev.3'
    },
    control_plane: {
      install_targets_sha256: digestObject(installTargets),
      host_install_policy_sha256: digestObject(hostInstallPolicy),
      capability_registry_sha256: digestObject(capabilityRegistry),
      application_catalog_sha256: digestObject(applicationCatalog),
      service_network_policy_sha256: digestObject(serviceNetworkPolicy),
      source_setup_policy_sha256: digestObject(sourceSetupPolicy)
    },
    artifacts: [
      artifact('source-personal', 'source-archive', ['personal-local']),
      artifact('runtime-infrastructure', 'oci-image', ['infrastructure-node']),
      artifact('documentation', 'documentation-bundle', ['personal-local', 'infrastructure-node']),
      artifact('sbom', 'sbom', ['personal-local', 'infrastructure-node']),
      artifact('provenance', 'provenance', ['personal-local', 'infrastructure-node'])
    ],
    non_claims: [
      'signature-does-not-grant-install-authority',
      'artifact-presence-does-not-prove-runtime-safety',
      'axiom-host-image-does-not-prove-secure-or-measured-boot',
      'manifest-does-not-enroll-node-or-start-services'
    ],
    installation_grants_authority: false,
    host_mutation_authorized: false,
    authority_effect: 'none',
    network_effect: 'none',
    ...overrides
  };
}

function signPackage(value = manifest(), privateKey = pair.privateKey) {
  const body = canonicalJson(value);
  return {
    schema: INSTALL_RELEASE_MANIFEST_PACKAGE_SCHEMA,
    manifest: value,
    signature: {
      algorithm: 'Ed25519',
      key_id: value.signing_key_id,
      digest: sha256(body),
      signature: sign(null, Buffer.from(body), privateKey).toString('base64url')
    }
  };
}

function trustedSigner(overrides = {}) {
  return {
    key_id: KEY_ID,
    public_key: publicPem,
    roles: ['release-installer-authority'],
    status: 'active',
    ...overrides
  };
}

function verify(packageValue, options = {}) {
  return verifyInstallReleaseManifest(packageValue, {
    trustedSigners: [trustedSigner()],
    evaluatedAt: EVALUATED_AT,
    ...options
  });
}

function rejects(fn, pattern) {
  assert.throws(fn, pattern);
}

test('policy remains external-trust and zero-authority', () => {
  const result = validateInstallReleaseManifestPolicy();
  assert.equal(result.valid, true);
  assert.equal(result.signer_custody, 'external');
  assert.equal(result.authority_effect, 'none');
});

test('valid signed release input binds current control plane without authorizing installation', () => {
  const result = verify(signPackage());
  assert.equal(result.valid, true);
  assert.equal(result.signature_verified, true);
  assert.equal(result.control_plane_bound, true);
  assert.equal(result.install_profile_binding_complete, true);
  assert.equal(result.artifact_metadata_bound, true);
  assert.equal(result.artifact_bytes_verified, false);
  assert.equal(result.host_mutation_authorized, false);
  assert.equal(result.installation_authority_granted, false);
  assert.equal(result.mesh_authority_granted, false);
  assert.equal(result.network_authority_granted, false);
  assert.equal(result.node_enrolled, false);
  assert.equal(result.services_started, false);
});

test('artifact bytes are verified separately from signed metadata', () => {
  const value = manifest();
  const target = value.artifacts.find(item => item.artifact_id === 'source-personal');
  const result = verifyInstallReleaseArtifact(target, artifactBytes['source-personal']);
  assert.equal(result.artifact_bytes_verified, true);
  assert.equal(result.authority_effect, 'none');
  rejects(
    () => verifyInstallReleaseArtifact(target, Buffer.from('tampered')),
    /byte length mismatch|digest mismatch/
  );
});

test('package cannot self-supply a trusted signing key', () => {
  const packageValue = { ...signPackage(), public_key: publicPem };
  rejects(() => verify(packageValue), /key inventory drifted/);
});

test('untrusted, wrong-role, retired, and revoked signers fail closed', () => {
  rejects(
    () => verifyInstallReleaseManifest(signPackage(), {
      trustedSigners: [], evaluatedAt: EVALUATED_AT
    }),
    /trusted release signers are required/
  );
  rejects(
    () => verifyInstallReleaseManifest(signPackage(), {
      trustedSigners: [trustedSigner({ roles: ['observer'] })], evaluatedAt: EVALUATED_AT
    }),
    /not actively trusted/
  );
  rejects(
    () => verifyInstallReleaseManifest(signPackage(), {
      trustedSigners: [trustedSigner({ status: 'retired' })], evaluatedAt: EVALUATED_AT
    }),
    /not actively trusted/
  );
  rejects(
    () => verifyInstallReleaseManifest(signPackage(), {
      trustedSigners: [trustedSigner({ status: 'revoked' })], evaluatedAt: EVALUATED_AT
    }),
    /not actively trusted/
  );
});

test('manifest mutation without a new signature is rejected', () => {
  const packageValue = signPackage();
  packageValue.manifest.channel = 'stable';
  rejects(() => verify(packageValue), /signature metadata is invalid|verification failed/);
});

test('re-signed control-plane substitution is rejected', () => {
  const value = manifest({
    control_plane: {
      ...manifest().control_plane,
      host_install_policy_sha256: 'b'.repeat(64)
    }
  });
  rejects(() => verify(signPackage(value)), /control-plane binding is stale/);
});

test('profile status cannot be promoted by a signed manifest', () => {
  const value = manifest({
    install_profiles: [
      { id: 'personal-local', target_status: 'implemented' },
      { id: 'infrastructure-node', target_status: 'specified' }
    ]
  });
  rejects(() => verify(signPackage(value)), /profile binding is invalid or stale/);
});

test('authority, host mutation, and network effects cannot be laundered through a signature', () => {
  for (const override of [
    { installation_grants_authority: true },
    { host_mutation_authorized: true },
    { authority_effect: 'install' },
    { network_effect: 'enroll-node' }
  ]) {
    rejects(
      () => verify(signPackage(manifest(override))),
      /identity or authority boundary is invalid/
    );
  }
});

test('future, expired, and overlong validity windows fail closed', () => {
  rejects(
    () => verify(signPackage(manifest({ issued_at: '2026-08-23T16:45:00.000Z' }))),
    /future-issued/
  );
  rejects(
    () => verify(signPackage(manifest({ valid_until: '2026-08-23T16:15:00.000Z' }))),
    /expired/
  );
  rejects(
    () => verify(signPackage(manifest({ valid_until: '2026-09-30T16:00:00.000Z' }))),
    /validity exceeds policy/
  );
});

test('required evidence artifacts cannot be omitted', () => {
  const value = manifest();
  value.artifacts = value.artifacts.filter(item => item.kind !== 'provenance');
  rejects(() => verify(signPackage(value)), /missing required provenance evidence/);
});

test('every bound profile needs an installable artifact', () => {
  const value = manifest();
  value.artifacts = value.artifacts.filter(item => item.artifact_id !== 'runtime-infrastructure');
  rejects(() => verify(signPackage(value)), /lacks an installable artifact/);
});

test('toolchain and migration generation cannot drift from current release inputs', () => {
  const wrongToolchain = manifest();
  wrongToolchain.toolchain = { ...wrongToolchain.toolchain, node_production_version: '24.18.0' };
  rejects(() => verify(signPackage(wrongToolchain)), /toolchain binding is stale/);

  const wrongMigration = manifest();
  wrongMigration.data_compatibility = {
    ...wrongMigration.data_compatibility,
    migration_generation: MIGRATIONS.length + 1
  };
  rejects(() => verify(signPackage(wrongMigration)), /data compatibility binding is invalid/);
});

test('AXIOM Host artifact does not permit secure-boot or measured-boot claim laundering', () => {
  const value = manifest();
  value.artifacts[0] = artifact(
    'source-personal',
    'axiom-host-image',
    ['personal-local']
  );
  value.non_claims = value.non_claims.filter(
    claim => claim !== 'axiom-host-image-does-not-prove-secure-or-measured-boot'
  );
  rejects(() => verify(signPackage(value)), /missing non-claim/);
});

test('invalid artifact platform and duplicate artifact identity fail closed', () => {
  const invalidPlatform = manifest();
  invalidPlatform.artifacts[0] = {
    ...invalidPlatform.artifacts[0],
    platform: 'windows'
  };
  rejects(() => verify(signPackage(invalidPlatform)), /artifact metadata is invalid/);

  const duplicate = manifest();
  duplicate.artifacts[1] = {
    ...duplicate.artifacts[1],
    artifact_id: duplicate.artifacts[0].artifact_id
  };
  rejects(() => verify(signPackage(duplicate)), /artifact id is duplicated/);
});

test('signature substitution and non-Ed25519 trust keys fail closed', () => {
  const other = generateKeyPairSync('ed25519');
  rejects(
    () => verify(signPackage(manifest(), other.privateKey)),
    /signature verification failed/
  );

  const rsa = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const rsaPem = rsa.publicKey.export({ type: 'spki', format: 'pem' });
  rejects(
    () => verifyInstallReleaseManifest(signPackage(), {
      trustedSigners: [trustedSigner({ public_key: rsaPem })],
      evaluatedAt: EVALUATED_AT
    }),
    /must use Ed25519/
  );
});
