import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ValidationError } from './lib/canonical.mjs';

export const HOST_LAB_SBOM_NAME = 'axiom-host-h0-sbom.cdx.json';
export const HOST_LAB_PROFILE_NAME = 'axiom-host-profile.h0-draft.json';

export async function generateAxiomHostH0ArtifactMetadata({
  outputDirectory,
  artifactInventory,
  source,
  imageVersion,
  snapshot
}) {
  const raw = requiredArtifact(artifactInventory, name => name.endsWith('.raw'), 'raw image');
  const uki = requiredArtifact(artifactInventory, name => name.endsWith('.efi'), 'UKI');
  const kernel = requiredArtifact(artifactInventory, name => name.endsWith('.vmlinuz'), 'kernel');
  const manifestArtifact = requiredArtifact(
    artifactInventory,
    name => name.endsWith('.manifest'),
    'package manifest'
  );
  const manifest = await readJson(join(outputDirectory, manifestArtifact.name), 'mkosi package manifest');
  const packages = verifyManifest(manifest);
  const kernelPackage = packages.find(item => item.name === 'kernel-core');
  if (!kernelPackage) {
    throw new ValidationError('AXIOM Host H0 package manifest is missing kernel-core');
  }
  if (!Number.isSafeInteger(source?.source_date_epoch) || source.source_date_epoch <= 0) {
    throw new ValidationError('AXIOM Host H0 metadata requires a safe source-date epoch');
  }

  const timestamp = new Date(source.source_date_epoch * 1000).toISOString();
  const bomReference = `urn:axiom-host:h0:${raw.sha256}`;
  const sbom = {
    bomFormat: 'CycloneDX',
    specVersion: '1.6',
    serialNumber: deterministicUuidUrn(`${source.tree}:${raw.sha256}`),
    version: 1,
    metadata: {
      timestamp,
      component: {
        type: 'operating-system',
        'bom-ref': bomReference,
        name: 'axiom-host-lab',
        version: imageVersion,
        description: 'AXIOM Host H0 laboratory VM appliance; not production-promoted',
        hashes: [{ alg: 'SHA-256', content: raw.sha256 }],
        properties: [
          { name: 'axiom:status', value: 'laboratory-only' },
          { name: 'axiom:source-revision', value: source.revision },
          { name: 'axiom:source-tree', value: source.tree },
          { name: 'axiom:fedora-snapshot', value: snapshot }
        ]
      }
    },
    components: packages.map(item => ({
      type: 'library',
      'bom-ref': packageBomReference(item),
      name: item.name,
      version: item.version,
      purl: packagePurl(item),
      properties: [
        { name: 'axiom:package-type', value: item.type },
        { name: 'axiom:package-architecture', value: item.architecture }
      ]
    }))
  };
  await writeFile(join(outputDirectory, HOST_LAB_SBOM_NAME), `${JSON.stringify(sbom, null, 2)}\n`, { mode: 0o600 });

  const expiresAt = new Date((source.source_date_epoch + 30 * 24 * 60 * 60) * 1000).toISOString();
  const profile = {
    schema: 'axiom-host-profile.v1',
    profile_id: 'axiom-host-h0-laboratory-vm',
    profile_version: imageVersion,
    host_class: 'laboratory-vm',
    compute_node_profile_ref: null,
    image: {
      os_family: 'linux',
      distribution: 'fedora-rawhide',
      architecture: 'x86_64',
      image_version: imageVersion,
      image_sha256: raw.sha256,
      kernel_version: `${kernelPackage.version}.${kernelPackage.architecture}`,
      kernel_sha256: kernel.sha256,
      build_manifest_ref: `artifact:${manifestArtifact.name}`,
      sbom_ref: `artifact:${HOST_LAB_SBOM_NAME}`,
      production_credentials_embedded: false
    },
    boot: {
      firmware_mode: 'uefi',
      boot_artifact_type: 'uki',
      boot_artifact_sha256: uki.sha256,
      secure_boot: 'absent',
      boot_counting: false,
      automatic_rollback: false,
      measured_boot: 'absent',
      signing_policy_ref: null
    },
    system_root: {
      runtime_mutability: 'mutable',
      integrity_mode: 'none',
      integrity_state: 'absent',
      root_hash: null,
      in_place_package_updates_allowed: false
    },
    mutable_state: {
      separate_from_system_image: false,
      encryption: 'absent',
      encryption_mode: 'none',
      key_custody: 'none',
      recovery_method_present: false,
      axiom_state_separately_backed_up: false
    },
    updates: {
      mode: 'none',
      authenticated: false,
      atomic_or_image_staged: false,
      known_good_retained: false,
      rollback_supported: false,
      state_compatibility_checked: false,
      update_policy_ref: null
    },
    network: {
      default_ingress: 'platform-default',
      default_service_egress: 'platform-default',
      mesh_service_graph_enforced: false,
      management_plane_separate: false,
      network_policy_ref: null
    },
    isolation: {
      cgroups: 'declared',
      mount_namespace: 'declared',
      network_namespace: 'declared',
      syscall_filtering: 'declared',
      security_module: 'selinux',
      hardware_virtualization: 'none',
      host_root_exposed_to_sandboxes: false
    },
    storage: {
      profile_ref: null,
      hard_capacity_independent_of_dedupe: true,
      cross_owner_private_dedupe: false,
      recovery_reserve_bytes: 0,
      filesystem: 'ext4'
    },
    devices: {
      default_sandbox_device_access: 'none',
      accelerator_mediation: 'none',
      host_key_devices_exposed_to_sandboxes: false
    },
    attestation: {
      tpm2_present: 'absent',
      remote_attestation_supported: false,
      axiom_verifier_status: 'not-implemented',
      freshness_bound: false,
      replay_protected: false,
      trust_policy_ref: null
    },
    observations: [{
      observation_id: 'h0-image-build',
      kind: 'image-build',
      status: 'measured',
      observed_at: timestamp,
      expires_at: expiresAt,
      evidence_ref: 'artifact:axiom-host-h0-build-evidence.json'
    }],
    authority_non_claims: {
      grants_node_admission: false,
      grants_mesh_capability: false,
      grants_execution_authority: false,
      proves_workload_correctness: false
    }
  };
  await writeFile(join(outputDirectory, HOST_LAB_PROFILE_NAME), `${JSON.stringify(profile, null, 2)}\n`, { mode: 0o600 });

  return {
    sbom_name: HOST_LAB_SBOM_NAME,
    profile_name: HOST_LAB_PROFILE_NAME,
    package_count: packages.length,
    kernel_version: profile.image.kernel_version,
    image_sha256: raw.sha256,
    uki_sha256: uki.sha256,
    kernel_sha256: kernel.sha256
  };
}

function requiredArtifact(inventory, predicate, description) {
  const matches = inventory.filter(item => item.link_target === undefined && predicate(item.name));
  if (matches.length !== 1) {
    throw new ValidationError(`AXIOM Host H0 requires exactly one ${description} artifact`);
  }
  return matches[0];
}

function verifyManifest(manifest) {
  if (
    manifest?.manifest_version !== 1
    || manifest.config?.name !== 'axiom-host-lab'
    || manifest.config?.distribution !== 'fedora'
    || manifest.config?.architecture !== 'x86-64'
    || !Array.isArray(manifest.packages)
    || manifest.packages.length < 1
  ) {
    throw new ValidationError('AXIOM Host H0 mkosi package manifest is invalid');
  }
  const packages = manifest.packages.map(item => {
    if (
      item?.type !== 'rpm'
      || !safePackagePart(item.name)
      || !safePackagePart(item.version)
      || typeof item.architecture !== 'string'
      || item.architecture.length > 512
      || /[\r\n\0]/.test(item.architecture)
    ) {
      throw new ValidationError('AXIOM Host H0 mkosi package manifest contains an invalid package');
    }
    return {
      type: item.type,
      name: item.name,
      version: item.version,
      architecture: item.architecture || 'none'
    };
  });
  return packages.sort((left, right) => (
    left.name.localeCompare(right.name)
    || left.version.localeCompare(right.version)
    || left.architecture.localeCompare(right.architecture)
  ));
}

function safePackagePart(value) {
  return typeof value === 'string' && value.length >= 1 && value.length <= 512 && !/[\r\n\0]/.test(value);
}

function packageBomReference(item) {
  return `pkg:rpm/${encodeURIComponent(item.name)}@${encodeURIComponent(item.version)}?arch=${encodeURIComponent(item.architecture)}`;
}

function packagePurl(item) {
  return `${packageBomReference(item)}&distro=fedora-rawhide`;
}

function deterministicUuidUrn(input) {
  const bytes = createHash('sha256').update(input).digest().subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  return `urn:uuid:${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

async function readJson(path, description) {
  try {
    return JSON.parse(await readFile(path, 'utf8'));
  } catch {
    throw new ValidationError(`AXIOM Host H0 ${description} is not valid JSON`);
  }
}
