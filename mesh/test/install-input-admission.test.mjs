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
import { buildHostInstallPlan } from '../src/lib/host-install-plan.mjs';
import {
  INSTALL_RELEASE_MANIFEST_PACKAGE_SCHEMA,
  INSTALL_RELEASE_MANIFEST_SCHEMA
} from '../src/lib/install-release-manifest.mjs';
import {
  buildInstallInputAdmission,
  INSTALL_INPUT_ADMISSION_SCHEMA,
  INSTALL_INPUT_ADMISSION_STATUS,
  verifyInstallInputAdmission
} from '../src/lib/install-input-admission.mjs';
import { canonicalJson, digestObject, sha256 } from '../src/lib/canonical.mjs';

const pair = generateKeyPairSync('ed25519');
const publicPem = pair.publicKey.export({ type: 'spki', format: 'pem' });
const KEY_ID = 'release:install-admission-test-key';
const EVALUATED_AT = '2026-08-23T18:30:00.000Z';
const bytes = Object.freeze({
  'source-personal': Buffer.from('personal source release bytes'),
  'runtime-infrastructure': Buffer.from('infrastructure runtime image bytes'),
  documentation: Buffer.from('release documentation bytes'),
  sbom: Buffer.from('release sbom bytes'),
  provenance: Buffer.from('release provenance bytes')
});

function hostFacts(overrides = {}) {
  return {
    facts_source: 'test-fixture',
    platform: 'linux',
    architecture: 'x64',
    distro_id: 'ubuntu',
    distro_version: '24.04',
    init_system: 'systemd',
    package_manager: 'apt-get',
    node_version: '24.18.0',
    memory_bytes: 16 * 1024 * 1024 * 1024,
    root_filesystem_free_bytes: 200 * 1024 * 1024 * 1024,
    container_runtime: 'docker',
    effective_uid: 1000,
    ...overrides
  };
}

function artifact(artifactId, kind, requiredForProfiles, overrides = {}) {
  const artifactBytes = bytes[artifactId] ?? Buffer.from(`artifact:${artifactId}`);
  const evidence = ['documentation-bundle', 'sbom', 'provenance'].includes(kind);
  return {
    artifact_id: artifactId,
    kind,
    platform: evidence ? 'any' : 'linux',
    architecture: evidence ? 'any' : 'x64',
    media_type: kind === 'oci-image'
      ? 'application/vnd.oci.image.manifest.v1+json'
      : 'application/octet-stream',
    locator: `release://0.12.0-dev.3/${artifactId}`,
    sha256: sha256(artifactBytes),
    byte_length: artifactBytes.length,
    required_for_profiles: requiredForProfiles,
    ...overrides
  };
}

function manifest(overrides = {}) {
  return {
    schema: INSTALL_RELEASE_MANIFEST_SCHEMA,
    version: 1,
    release_id: 'axiom-mesh/0.12.0-dev.3/install-admission-test',
    kernel_version: '0.12.0-dev.3',
    channel: 'development',
    production_promoted: false,
    source_revision: 'c'.repeat(40),
    issued_at: '2026-08-23T18:00:00.000Z',
    valid_until: '2026-08-23T19:00:00.000Z',
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

function signPackage(value = manifest()) {
  const body = canonicalJson(value);
  return {
    schema: INSTALL_RELEASE_MANIFEST_PACKAGE_SCHEMA,
    manifest: value,
    signature: {
      algorithm: 'Ed25519',
      key_id: value.signing_key_id,
      digest: sha256(body),
      signature: sign(null, Buffer.from(body), pair.privateKey).toString('base64url')
    }
  };
}

function trustedSigner() {
  return {
    key_id: KEY_ID,
    public_key: publicPem,
    roles: ['release-installer-authority'],
    status: 'active'
  };
}

function verificationOptions(overrides = {}) {
  return {
    trustedSigners: [trustedSigner()],
    evaluatedAt: EVALUATED_AT,
    ...overrides
  };
}

function personalInputs(overrides = {}) {
  const facts = overrides.hostFacts ?? hostFacts();
  const plan = overrides.hostPlan ?? buildHostInstallPlan({
    profileId: 'personal-local',
    hostFacts: facts
  });
  return {
    releasePackage: overrides.releasePackage ?? signPackage(),
    hostPlan: plan,
    hostFacts: facts,
    artifactBytesById: overrides.artifactBytesById ?? {
      'source-personal': bytes['source-personal'],
      documentation: bytes.documentation,
      sbom: bytes.sbom,
      provenance: bytes.provenance
    }
  };
}

function rejects(fn, pattern) {
  assert.throws(fn, pattern);
}

test('binds exact verified release, host plan, host facts, and local artifact bytes without authority', () => {
  const admission = buildInstallInputAdmission(personalInputs(), verificationOptions());
  assert.equal(admission.schema, INSTALL_INPUT_ADMISSION_SCHEMA);
  assert.equal(admission.status, INSTALL_INPUT_ADMISSION_STATUS);
  assert.equal(admission.release_manifest_verified, true);
  assert.equal(admission.release_control_plane_bound, true);
  assert.equal(admission.host_plan_verified, true);
  assert.equal(admission.host_candidate_compatible, true);
  assert.equal(admission.artifact_bytes_verified, true);
  assert.equal(admission.release_host_artifact_binding_complete, true);
  assert.equal(admission.may_request_privileged_install_review, true);
  assert.equal(admission.privileged_install_authorized, false);
  assert.equal(admission.host_mutation_authorized, false);
  assert.equal(admission.installation_authority_granted, false);
  assert.equal(admission.mesh_authority_granted, false);
  assert.equal(admission.network_authority_granted, false);
  assert.equal(admission.node_enrolled, false);
  assert.equal(admission.services_started, false);
  assert.equal(admission.mutation_performed, false);
  assert.equal(admission.artifact_transport_trusted, false);
  assert.equal(admission.host_facts_authenticated, false);
  assert.equal(admission.physical_host_attested, false);
  assert.equal(admission.runtime_safety_established, false);
  assert.equal(admission.disposable_host_evidence_verified, false);
  assert.equal(admission.reboot_update_restore_evidence_verified, false);
  assert.equal(admission.authority_effect, 'none');
  assert.equal(admission.network_effect, 'none');
  assert.deepEqual(
    admission.artifacts.map(item => item.artifact_id),
    ['documentation', 'provenance', 'sbom', 'source-personal']
  );
  assert.match(admission.admission_digest, /^[a-f0-9]{64}$/);

  const result = verifyInstallInputAdmission(
    admission,
    personalInputs(),
    verificationOptions()
  );
  assert.equal(result.valid, true);
  assert.equal(result.admission_digest, admission.admission_digest);
  assert.equal(result.privileged_install_authorized, false);
});

test('host facts must exactly match the facts digest bound by the plan', () => {
  const facts = hostFacts();
  const plan = buildHostInstallPlan({ profileId: 'personal-local', hostFacts: facts });
  rejects(
    () => buildInstallInputAdmission(personalInputs({
      hostPlan: plan,
      hostFacts: { ...facts, distro_version: '24.10' }
    }), verificationOptions()),
    /Host facts do not match/
  );
});

test('tampered host plan fails its lower-layer digest before admission can be built', () => {
  const inputs = personalInputs();
  const tampered = structuredClone(inputs.hostPlan);
  tampered.network.external_egress = 'allow';
  rejects(
    () => buildInstallInputAdmission({ ...inputs, hostPlan: tampered }, verificationOptions()),
    /non-mutating boundary|digest does not match/
  );
});

test('release signature and control-plane verification are re-run rather than trusted from caller claims', () => {
  const packageValue = signPackage();
  packageValue.manifest.source_revision = 'd'.repeat(40);
  rejects(
    () => buildInstallInputAdmission(
      personalInputs({ releasePackage: packageValue }),
      verificationOptions()
    ),
    /signature metadata is invalid|verification failed/
  );
});

test('artifact byte substitution fails closed', () => {
  rejects(
    () => buildInstallInputAdmission(personalInputs({
      artifactBytesById: {
        'source-personal': Buffer.from('tampered'),
        documentation: bytes.documentation,
        sbom: bytes.sbom,
        provenance: bytes.provenance
      }
    }), verificationOptions()),
    /byte length mismatch|digest mismatch/
  );
});

test('missing evidence bytes and extra unbound bytes are both rejected', () => {
  rejects(
    () => buildInstallInputAdmission(personalInputs({
      artifactBytesById: {
        'source-personal': bytes['source-personal'],
        documentation: bytes.documentation,
        provenance: bytes.provenance
      }
    }), verificationOptions()),
    /artifact byte set is incomplete/
  );
  rejects(
    () => buildInstallInputAdmission(personalInputs({
      artifactBytesById: {
        'source-personal': bytes['source-personal'],
        'runtime-infrastructure': bytes['runtime-infrastructure'],
        documentation: bytes.documentation,
        sbom: bytes.sbom,
        provenance: bytes.provenance
      }
    }), verificationOptions()),
    /contains unbound artifacts/
  );
});

test('release must explicitly support the plan profile', () => {
  const value = manifest({
    install_profiles: [{ id: 'infrastructure-node', target_status: 'specified' }],
    artifacts: [
      artifact('runtime-infrastructure', 'oci-image', ['infrastructure-node']),
      artifact('documentation', 'documentation-bundle', ['infrastructure-node']),
      artifact('sbom', 'sbom', ['infrastructure-node']),
      artifact('provenance', 'provenance', ['infrastructure-node'])
    ]
  });
  rejects(
    () => buildInstallInputAdmission(
      personalInputs({ releasePackage: signPackage(value) }),
      verificationOptions()
    ),
    /does not support the host install profile/
  );
});

test('blocked host plan cannot be laundered into admitted install inputs', () => {
  const facts = hostFacts({ init_system: 'unknown' });
  const plan = buildHostInstallPlan({ profileId: 'personal-local', hostFacts: facts });
  assert.equal(plan.host_candidate_compatible, false);
  rejects(
    () => buildInstallInputAdmission(personalInputs({
      hostFacts: facts,
      hostPlan: plan
    }), verificationOptions()),
    /Blocked host plan/
  );
});

test('host architecture must have a compatible installable artifact', () => {
  const value = manifest({
    artifacts: [
      artifact('source-personal', 'source-archive', ['personal-local'], { architecture: 'arm64' }),
      artifact('runtime-infrastructure', 'oci-image', ['infrastructure-node']),
      artifact('documentation', 'documentation-bundle', ['personal-local', 'infrastructure-node']),
      artifact('sbom', 'sbom', ['personal-local', 'infrastructure-node']),
      artifact('provenance', 'provenance', ['personal-local', 'infrastructure-node'])
    ]
  });
  rejects(
    () => buildInstallInputAdmission(personalInputs({
      releasePackage: signPackage(value),
      artifactBytesById: {
        documentation: bytes.documentation,
        sbom: bytes.sbom,
        provenance: bytes.provenance
      }
    }), verificationOptions()),
    /lacks a compatible installable artifact/
  );
});

test('stored admission cannot gain authority or be rebound after construction', () => {
  const inputs = personalInputs();
  const admission = buildInstallInputAdmission(inputs, verificationOptions());
  for (const tamper of [
    { privileged_install_authorized: true },
    { host_mutation_authorized: true },
    { authority_effect: 'install' },
    { network_effect: 'enroll-node' }
  ]) {
    rejects(
      () => verifyInstallInputAdmission(
        { ...admission, ...tamper },
        inputs,
        verificationOptions()
      ),
      /does not match its verified lower-layer inputs/
    );
  }
});

test('admission digest changes when release, host plan, or artifact identity changes', () => {
  const originalInputs = personalInputs();
  const original = buildInstallInputAdmission(originalInputs, verificationOptions());

  const alternateFacts = hostFacts({ root_filesystem_free_bytes: 201 * 1024 * 1024 * 1024 });
  const alternatePlan = buildHostInstallPlan({ profileId: 'personal-local', hostFacts: alternateFacts });
  const hostChanged = buildInstallInputAdmission(personalInputs({
    hostFacts: alternateFacts,
    hostPlan: alternatePlan
  }), verificationOptions());
  assert.notEqual(hostChanged.admission_digest, original.admission_digest);

  const alternateBytes = Buffer.from('personal source release bytes v2');
  const alternateManifest = manifest({
    source_revision: 'e'.repeat(40),
    artifacts: [
      artifact('source-personal', 'source-archive', ['personal-local'], {
        sha256: sha256(alternateBytes),
        byte_length: alternateBytes.length
      }),
      artifact('runtime-infrastructure', 'oci-image', ['infrastructure-node']),
      artifact('documentation', 'documentation-bundle', ['personal-local', 'infrastructure-node']),
      artifact('sbom', 'sbom', ['personal-local', 'infrastructure-node']),
      artifact('provenance', 'provenance', ['personal-local', 'infrastructure-node'])
    ]
  });
  const releaseChanged = buildInstallInputAdmission(personalInputs({
    releasePackage: signPackage(alternateManifest),
    artifactBytesById: {
      'source-personal': alternateBytes,
      documentation: bytes.documentation,
      sbom: bytes.sbom,
      provenance: bytes.provenance
    }
  }), verificationOptions());
  assert.notEqual(releaseChanged.admission_digest, original.admission_digest);
});
