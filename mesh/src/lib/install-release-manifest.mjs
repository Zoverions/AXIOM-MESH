import { createPublicKey, verify as verifySignature } from 'node:crypto';
import manifestPolicy from '../../config/install-release-manifest-policy.json' with { type: 'json' };
import installTargets from '../../config/install-targets.json' with { type: 'json' };
import hostInstallPolicy from '../../config/host-install-policy.json' with { type: 'json' };
import capabilityRegistry from '../../config/capabilities.json' with { type: 'json' };
import applicationCatalog from '../../config/application-catalog.json' with { type: 'json' };
import serviceNetworkPolicy from '../../config/service-network-policy.json' with { type: 'json' };
import sourceSetupPolicy from '../../config/setup.json' with { type: 'json' };
import { MIGRATIONS } from '../grid/migrations.mjs';
import {
  canonicalJson,
  digestObject,
  sha256,
  ValidationError
} from './canonical.mjs';

export const INSTALL_RELEASE_MANIFEST_SCHEMA = 'axiom-install-release-manifest.v1';
export const INSTALL_RELEASE_MANIFEST_PACKAGE_SCHEMA = 'axiom-install-release-manifest-package.v1';
export const INSTALL_RELEASE_MANIFEST_POLICY_SCHEMA = 'axiom-install-release-manifest-policy.v1';

const CHANNELS = Object.freeze(['development', 'candidate', 'stable']);
const ARTIFACT_KINDS = Object.freeze([
  'source-archive',
  'oci-image',
  'axiom-host-image',
  'documentation-bundle',
  'sbom',
  'provenance'
]);
const INSTALLABLE_ARTIFACT_KINDS = Object.freeze([
  'source-archive',
  'oci-image',
  'axiom-host-image'
]);
const REQUIRED_EVIDENCE_ARTIFACT_KINDS = Object.freeze([
  'documentation-bundle',
  'sbom',
  'provenance'
]);
const PLATFORMS = Object.freeze(['any', 'linux']);
const ARCHITECTURES = Object.freeze(['any', 'x64', 'arm64']);
const REQUIRED_NON_CLAIMS = Object.freeze([
  'signature-does-not-grant-install-authority',
  'artifact-presence-does-not-prove-runtime-safety',
  'axiom-host-image-does-not-prove-secure-or-measured-boot',
  'manifest-does-not-enroll-node-or-start-services'
]);
const SHA256 = /^[a-f0-9]{64}$/;
const REVISION = /^[a-f0-9]{40}$/;
const ID = /^[a-z0-9][a-z0-9._:/-]{1,159}$/;
const VERSION = /^\d+\.\d+\.\d+(?:-[A-Za-z0-9.-]+)?$/;

export function validateInstallReleaseManifestPolicy(policy = manifestPolicy) {
  exactObject(policy, 'Install release manifest policy', [
    'schema',
    'version',
    'status',
    'signature_algorithm',
    'trusted_signer_role',
    'allowed_channels',
    'max_validity_seconds',
    'install_profiles',
    'allowed_artifact_kinds',
    'installable_artifact_kinds',
    'required_evidence_artifact_kinds',
    'allowed_platforms',
    'allowed_architectures',
    'authority'
  ]);
  if (
    policy.schema !== INSTALL_RELEASE_MANIFEST_POLICY_SCHEMA
    || policy.version !== 1
    || policy.status !== 'verifier-implemented-signer-custody-external'
    || policy.signature_algorithm !== 'Ed25519'
    || policy.trusted_signer_role !== 'release-installer-authority'
    || policy.max_validity_seconds !== 2_678_400
    || canonicalJson(policy.allowed_channels) !== canonicalJson(CHANNELS)
    || canonicalJson(policy.install_profiles) !== canonicalJson(['personal-local', 'infrastructure-node'])
    || canonicalJson(policy.allowed_artifact_kinds) !== canonicalJson(ARTIFACT_KINDS)
    || canonicalJson(policy.installable_artifact_kinds) !== canonicalJson(INSTALLABLE_ARTIFACT_KINDS)
    || canonicalJson(policy.required_evidence_artifact_kinds)
      !== canonicalJson(REQUIRED_EVIDENCE_ARTIFACT_KINDS)
    || canonicalJson(policy.allowed_platforms) !== canonicalJson(PLATFORMS)
    || canonicalJson(policy.allowed_architectures) !== canonicalJson(ARCHITECTURES)
  ) throw new ValidationError('Install release manifest policy weakens the v1 contract');
  exactObject(policy.authority, 'Install release manifest authority policy', [
    'manifest_grants_install_authority',
    'manifest_grants_mesh_authority',
    'manifest_grants_network_authority',
    'manifest_enrolls_node',
    'manifest_starts_services',
    'manifest_mutates_host'
  ]);
  if (Object.values(policy.authority).some(value => value !== false)) {
    throw new ValidationError('Install release manifest policy cannot grant authority or mutate the host');
  }
  return {
    valid: true,
    schema: policy.schema,
    policy_digest: digestObject(policy),
    signer_custody: 'external',
    authority_effect: 'none'
  };
}

export function verifyInstallReleaseManifest(
  packageValue,
  {
    trustedSigners,
    evaluatedAt,
    policy = manifestPolicy,
    currentInstallTargets = installTargets,
    currentHostInstallPolicy = hostInstallPolicy,
    currentCapabilityRegistry = capabilityRegistry,
    currentApplicationCatalog = applicationCatalog,
    currentServiceNetworkPolicy = serviceNetworkPolicy,
    currentSourceSetupPolicy = sourceSetupPolicy,
    migrationGeneration = MIGRATIONS.length
  } = {}
) {
  const policyResult = validateInstallReleaseManifestPolicy(policy);
  exactObject(packageValue, 'Install release manifest package', [
    'schema', 'manifest', 'signature'
  ]);
  if (packageValue.schema !== INSTALL_RELEASE_MANIFEST_PACKAGE_SCHEMA) {
    throw new ValidationError('Install release manifest package schema is invalid');
  }
  const manifest = validateManifest(packageValue.manifest, {
    policy,
    currentInstallTargets,
    currentHostInstallPolicy,
    currentCapabilityRegistry,
    currentApplicationCatalog,
    currentServiceNetworkPolicy,
    currentSourceSetupPolicy,
    migrationGeneration
  });
  const evaluationTime = parseInstant(evaluatedAt, 'evaluatedAt');
  const issuedAt = parseInstant(manifest.issued_at, 'manifest issued_at');
  const validUntil = parseInstant(manifest.valid_until, 'manifest valid_until');
  if (validUntil <= issuedAt) {
    throw new ValidationError('Install release manifest validity window is invalid');
  }
  if ((validUntil - issuedAt) / 1000 > policy.max_validity_seconds) {
    throw new ValidationError('Install release manifest validity exceeds policy');
  }
  if (issuedAt > evaluationTime) {
    throw new ValidationError('Install release manifest is future-issued');
  }
  if (validUntil <= evaluationTime) {
    throw new ValidationError('Install release manifest is expired');
  }

  const signer = trustedSignerFor(manifest.signing_key_id, trustedSigners, policy);
  exactObject(packageValue.signature, 'Install release manifest signature', [
    'algorithm', 'key_id', 'digest', 'signature'
  ]);
  const signature = packageValue.signature;
  const body = canonicalJson(manifest);
  const digest = sha256(body);
  if (
    signature.algorithm !== policy.signature_algorithm
    || signature.key_id !== manifest.signing_key_id
    || signature.digest !== digest
    || !/^[A-Za-z0-9_-]{64,256}$/.test(signature.signature ?? '')
  ) throw new ValidationError('Install release manifest signature metadata is invalid');
  let publicKey;
  try {
    publicKey = createPublicKey(signer.public_key);
  } catch {
    throw new ValidationError('Trusted release signer public key is invalid');
  }
  if (publicKey.asymmetricKeyType !== 'ed25519') {
    throw new ValidationError('Trusted release signer must use Ed25519');
  }
  let verified = false;
  try {
    verified = verifySignature(
      null,
      Buffer.from(body),
      publicKey,
      Buffer.from(signature.signature, 'base64url')
    );
  } catch {
    verified = false;
  }
  if (!verified) throw new ValidationError('Install release manifest signature verification failed');

  return {
    valid: true,
    schema: INSTALL_RELEASE_MANIFEST_PACKAGE_SCHEMA,
    manifest_schema: manifest.schema,
    release_id: manifest.release_id,
    kernel_version: manifest.kernel_version,
    channel: manifest.channel,
    source_revision: manifest.source_revision,
    evaluated_at: new Date(evaluationTime).toISOString(),
    valid_until: manifest.valid_until,
    signer_key_id: manifest.signing_key_id,
    signature_verified: true,
    control_plane_bound: true,
    install_profile_binding_complete: true,
    artifact_metadata_bound: true,
    artifact_bytes_verified: false,
    artifact_count: manifest.artifacts.length,
    install_profiles: manifest.install_profiles.map(item => item.id),
    policy_digest: policyResult.policy_digest,
    manifest_digest: digest,
    production_promoted: manifest.production_promoted,
    release_input_cryptographically_valid: true,
    host_mutation_authorized: false,
    installation_authority_granted: false,
    mesh_authority_granted: false,
    network_authority_granted: false,
    node_enrolled: false,
    services_started: false,
    authority_effect: 'none',
    network_effect: 'none'
  };
}

export function verifyInstallReleaseArtifact(artifact, bytes) {
  validateArtifact(artifact, new Set(['personal-local', 'infrastructure-node']));
  if (!Buffer.isBuffer(bytes) && !(bytes instanceof Uint8Array)) {
    throw new ValidationError('Release artifact bytes must be a Buffer or Uint8Array');
  }
  const buffer = Buffer.from(bytes);
  if (buffer.length !== artifact.byte_length) {
    throw new ValidationError(`Release artifact byte length mismatch: ${artifact.artifact_id}`);
  }
  if (sha256(buffer) !== artifact.sha256) {
    throw new ValidationError(`Release artifact digest mismatch: ${artifact.artifact_id}`);
  }
  return {
    valid: true,
    artifact_id: artifact.artifact_id,
    artifact_kind: artifact.kind,
    artifact_bytes_verified: true,
    sha256: artifact.sha256,
    byte_length: artifact.byte_length,
    host_mutation_authorized: false,
    authority_effect: 'none'
  };
}

function validateManifest(manifest, context) {
  exactObject(manifest, 'Install release manifest', [
    'schema',
    'version',
    'release_id',
    'kernel_version',
    'channel',
    'production_promoted',
    'source_revision',
    'issued_at',
    'valid_until',
    'signing_key_id',
    'install_profiles',
    'toolchain',
    'data_compatibility',
    'control_plane',
    'artifacts',
    'non_claims',
    'installation_grants_authority',
    'host_mutation_authorized',
    'authority_effect',
    'network_effect'
  ]);
  if (
    manifest.schema !== INSTALL_RELEASE_MANIFEST_SCHEMA
    || manifest.version !== 1
    || !ID.test(manifest.release_id ?? '')
    || !VERSION.test(manifest.kernel_version ?? '')
    || !context.policy.allowed_channels.includes(manifest.channel)
    || typeof manifest.production_promoted !== 'boolean'
    || !REVISION.test(manifest.source_revision ?? '')
    || !ID.test(manifest.signing_key_id ?? '')
    || manifest.installation_grants_authority !== false
    || manifest.host_mutation_authorized !== false
    || manifest.authority_effect !== 'none'
    || manifest.network_effect !== 'none'
  ) throw new ValidationError('Install release manifest identity or authority boundary is invalid');

  for (const current of [
    context.currentInstallTargets,
    context.currentHostInstallPolicy,
    context.currentCapabilityRegistry,
    context.currentSourceSetupPolicy
  ]) {
    if (current?.kernel_version !== manifest.kernel_version) {
      throw new ValidationError('Install release manifest kernel version does not match current control plane');
    }
  }

  const allowedProfiles = new Set(context.policy.install_profiles);
  if (!Array.isArray(manifest.install_profiles) || manifest.install_profiles.length === 0) {
    throw new ValidationError('Install release manifest must name at least one install profile');
  }
  const profileIds = new Set();
  const currentTargets = new Map(
    (context.currentInstallTargets?.targets ?? []).map(target => [target.id, target])
  );
  for (const profile of manifest.install_profiles) {
    exactObject(profile, 'Install release profile binding', ['id', 'target_status']);
    if (
      !allowedProfiles.has(profile.id)
      || profileIds.has(profile.id)
      || currentTargets.get(profile.id)?.status !== profile.target_status
    ) throw new ValidationError('Install release profile binding is invalid or stale');
    profileIds.add(profile.id);
  }

  validateToolchain(manifest.toolchain, context.currentSourceSetupPolicy);
  validateDataCompatibility(manifest.data_compatibility, context.migrationGeneration);
  validateControlPlane(manifest.control_plane, context);

  if (!Array.isArray(manifest.artifacts) || manifest.artifacts.length < 4 || manifest.artifacts.length > 128) {
    throw new ValidationError('Install release manifest artifact inventory is invalid');
  }
  const artifactIds = new Set();
  for (const artifact of manifest.artifacts) {
    validateArtifact(artifact, profileIds, context.policy);
    if (artifactIds.has(artifact.artifact_id)) {
      throw new ValidationError('Install release artifact id is duplicated');
    }
    artifactIds.add(artifact.artifact_id);
  }
  for (const kind of context.policy.required_evidence_artifact_kinds) {
    if (!manifest.artifacts.some(artifact => artifact.kind === kind)) {
      throw new ValidationError(`Install release manifest is missing required ${kind} evidence`);
    }
  }
  for (const profileId of profileIds) {
    const installable = manifest.artifacts.some(artifact =>
      context.policy.installable_artifact_kinds.includes(artifact.kind)
      && artifact.required_for_profiles.includes(profileId)
    );
    if (!installable) {
      throw new ValidationError(`Install release profile lacks an installable artifact: ${profileId}`);
    }
  }

  if (
    !Array.isArray(manifest.non_claims)
    || canonicalJson([...new Set(manifest.non_claims)].sort())
      !== canonicalJson([...manifest.non_claims].sort())
    || manifest.non_claims.some(value => typeof value !== 'string' || value.length > 160)
  ) throw new ValidationError('Install release manifest non-claims are invalid');
  for (const required of REQUIRED_NON_CLAIMS) {
    if (!manifest.non_claims.includes(required)) {
      throw new ValidationError(`Install release manifest is missing non-claim: ${required}`);
    }
  }
  return manifest;
}

function validateToolchain(toolchain, setupPolicy) {
  exactObject(toolchain, 'Install release toolchain', [
    'node_engine',
    'node_ci_version',
    'node_production_version',
    'npm_minimum_version',
    'npm_major_exclusive'
  ]);
  if (
    toolchain.node_engine !== setupPolicy?.runtime?.engine
    || toolchain.node_ci_version !== setupPolicy?.runtime?.ci_version
    || toolchain.node_production_version !== setupPolicy?.runtime?.production_version
    || toolchain.npm_minimum_version !== setupPolicy?.package_manager?.minimum_version
    || toolchain.npm_major_exclusive !== setupPolicy?.package_manager?.maximum_major_exclusive
  ) throw new ValidationError('Install release toolchain binding is stale');
}

function validateDataCompatibility(dataCompatibility, migrationGeneration) {
  exactObject(dataCompatibility, 'Install release data compatibility', [
    'migration_generation',
    'rollback_mode',
    'minimum_compatible_kernel'
  ]);
  if (
    !Number.isSafeInteger(dataCompatibility.migration_generation)
    || dataCompatibility.migration_generation < 0
    || dataCompatibility.migration_generation !== migrationGeneration
    || !['in-place-compatible', 'backup-restore-required', 'migration-specific']
      .includes(dataCompatibility.rollback_mode)
    || !VERSION.test(dataCompatibility.minimum_compatible_kernel ?? '')
  ) throw new ValidationError('Install release data compatibility binding is invalid');
}

function validateControlPlane(controlPlane, context) {
  exactObject(controlPlane, 'Install release control plane', [
    'install_targets_sha256',
    'host_install_policy_sha256',
    'capability_registry_sha256',
    'application_catalog_sha256',
    'service_network_policy_sha256',
    'source_setup_policy_sha256'
  ]);
  const expected = {
    install_targets_sha256: digestObject(context.currentInstallTargets),
    host_install_policy_sha256: digestObject(context.currentHostInstallPolicy),
    capability_registry_sha256: digestObject(context.currentCapabilityRegistry),
    application_catalog_sha256: digestObject(context.currentApplicationCatalog),
    service_network_policy_sha256: digestObject(context.currentServiceNetworkPolicy),
    source_setup_policy_sha256: digestObject(context.currentSourceSetupPolicy)
  };
  for (const [key, value] of Object.entries(expected)) {
    if (!SHA256.test(controlPlane[key] ?? '') || controlPlane[key] !== value) {
      throw new ValidationError(`Install release control-plane binding is stale: ${key}`);
    }
  }
}

function validateArtifact(artifact, profileIds, policy = manifestPolicy) {
  exactObject(artifact, 'Install release artifact', [
    'artifact_id',
    'kind',
    'platform',
    'architecture',
    'media_type',
    'locator',
    'sha256',
    'byte_length',
    'required_for_profiles'
  ]);
  if (
    !ID.test(artifact.artifact_id ?? '')
    || !policy.allowed_artifact_kinds.includes(artifact.kind)
    || !policy.allowed_platforms.includes(artifact.platform)
    || !policy.allowed_architectures.includes(artifact.architecture)
    || typeof artifact.media_type !== 'string'
    || artifact.media_type.length < 3
    || artifact.media_type.length > 160
    || typeof artifact.locator !== 'string'
    || artifact.locator.length < 1
    || artifact.locator.length > 2048
    || !SHA256.test(artifact.sha256 ?? '')
    || !Number.isSafeInteger(artifact.byte_length)
    || artifact.byte_length < 1
    || artifact.byte_length > 1_000_000_000_000
    || !Array.isArray(artifact.required_for_profiles)
    || artifact.required_for_profiles.length === 0
  ) throw new ValidationError('Install release artifact metadata is invalid');
  const uniqueProfiles = new Set(artifact.required_for_profiles);
  if (uniqueProfiles.size !== artifact.required_for_profiles.length) {
    throw new ValidationError('Install release artifact profile binding is duplicated');
  }
  for (const profileId of uniqueProfiles) {
    if (!profileIds.has(profileId)) {
      throw new ValidationError('Install release artifact references an unbound install profile');
    }
  }
}

function trustedSignerFor(keyId, trustedSigners, policy) {
  if (!Array.isArray(trustedSigners) || trustedSigners.length === 0) {
    throw new ValidationError('Externally supplied trusted release signers are required');
  }
  let found;
  const ids = new Set();
  for (const signer of trustedSigners) {
    exactObject(signer, 'Trusted release signer', [
      'key_id', 'public_key', 'roles', 'status'
    ]);
    if (
      !ID.test(signer.key_id ?? '')
      || ids.has(signer.key_id)
      || typeof signer.public_key !== 'string'
      || !Array.isArray(signer.roles)
      || signer.roles.some(role => typeof role !== 'string')
      || !['active', 'retired', 'revoked'].includes(signer.status)
    ) throw new ValidationError('Trusted release signer inventory is invalid');
    ids.add(signer.key_id);
    if (signer.key_id === keyId) found = signer;
  }
  if (!found || found.status !== 'active' || !found.roles.includes(policy.trusted_signer_role)) {
    throw new ValidationError('Release signer is not actively trusted for install manifests');
  }
  return found;
}

function parseInstant(value, label) {
  if (typeof value !== 'string') throw new ValidationError(`${label} must be an ISO timestamp`);
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed) || new Date(parsed).toISOString() !== value) {
    throw new ValidationError(`${label} must be a canonical UTC ISO timestamp`);
  }
  return parsed;
}

function exactObject(value, label, keys) {
  if (
    !value
    || typeof value !== 'object'
    || Array.isArray(value)
    || Object.getPrototypeOf(value) !== Object.prototype
    || canonicalJson(Object.keys(value).sort()) !== canonicalJson([...keys].sort())
  ) throw new ValidationError(`${label} key inventory drifted`);
}
