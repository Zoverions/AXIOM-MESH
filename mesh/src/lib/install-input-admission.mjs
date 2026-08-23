import {
  canonicalJson,
  digestObject,
  ValidationError
} from './canonical.mjs';
import {
  verifyInstallReleaseArtifact,
  verifyInstallReleaseManifest
} from './install-release-manifest.mjs';
import { validateHostInstallPlan } from './host-install-plan.mjs';

export const INSTALL_INPUT_ADMISSION_SCHEMA = 'axiom-install-input-admission.v1';
export const INSTALL_INPUT_ADMISSION_STATUS = 'release-host-artifact-binding-non-authorizing';

const INSTALLABLE_KINDS = new Set(['source-archive', 'oci-image', 'axiom-host-image']);
const EVIDENCE_KINDS = new Set(['documentation-bundle', 'sbom', 'provenance']);
const REQUIRED_EVIDENCE_KINDS = Object.freeze(['documentation-bundle', 'sbom', 'provenance']);

/**
 * Build a deterministic, content-addressed binding between one verified release,
 * one verified non-mutating host plan, the exact host facts behind that plan, and
 * the exact local artifact bytes needed for the selected profile.
 *
 * This is deliberately not an authorization object. A future privileged installer
 * may bind a separately authorized request to admission_digest, but this function
 * cannot create that authority or mutate the host.
 */
export function buildInstallInputAdmission({
  releasePackage,
  hostPlan,
  hostFacts,
  artifactBytesById
}, verificationOptions = {}) {
  const release = verifyInstallReleaseManifest(releasePackage, verificationOptions);
  const plan = validateHostInstallPlan(hostPlan);
  validateHostFactsBinding(hostPlan, hostFacts);

  const manifest = releasePackage.manifest;
  if (hostPlan.kernel_version !== manifest.kernel_version) {
    throw new ValidationError('Host plan kernel version does not match the verified release');
  }
  if (hostPlan.profile_id !== plan.profile_id) {
    throw new ValidationError('Host plan profile binding is inconsistent');
  }
  if (!manifest.install_profiles.some(profile => profile.id === hostPlan.profile_id)) {
    throw new ValidationError('Verified release does not support the host install profile');
  }
  if (!plan.host_candidate_compatible || hostPlan.blockers.length !== 0) {
    throw new ValidationError('Blocked host plan cannot become install input admission evidence');
  }

  const requiredArtifacts = selectRequiredArtifacts(manifest.artifacts, hostPlan.profile_id, hostFacts);
  const artifactBytes = normalizeArtifactBytes(artifactBytesById);
  const expectedIds = requiredArtifacts.map(artifact => artifact.artifact_id).sort();
  const suppliedIds = [...artifactBytes.keys()].sort();
  if (canonicalJson(expectedIds) !== canonicalJson(suppliedIds)) {
    throw new ValidationError('Install input artifact byte set is incomplete or contains unbound artifacts');
  }

  const verifiedArtifacts = requiredArtifacts
    .map(artifact => {
      const result = verifyInstallReleaseArtifact(artifact, artifactBytes.get(artifact.artifact_id));
      return {
        artifact_id: artifact.artifact_id,
        kind: artifact.kind,
        platform: artifact.platform,
        architecture: artifact.architecture,
        sha256: result.sha256,
        byte_length: result.byte_length
      };
    })
    .sort((left, right) => left.artifact_id.localeCompare(right.artifact_id));

  const evidenceKinds = new Set(
    requiredArtifacts
      .filter(artifact => EVIDENCE_KINDS.has(artifact.kind))
      .map(artifact => artifact.kind)
  );
  for (const kind of REQUIRED_EVIDENCE_KINDS) {
    if (!evidenceKinds.has(kind)) {
      throw new ValidationError(`Install input admission lacks verified ${kind} bytes`);
    }
  }
  if (!requiredArtifacts.some(artifact => INSTALLABLE_KINDS.has(artifact.kind))) {
    throw new ValidationError('Install input admission lacks a compatible installable artifact');
  }

  const artifactSetDigest = digestObject(verifiedArtifacts);
  const core = {
    schema: INSTALL_INPUT_ADMISSION_SCHEMA,
    version: 1,
    status: INSTALL_INPUT_ADMISSION_STATUS,
    release: {
      release_id: release.release_id,
      kernel_version: release.kernel_version,
      channel: release.channel,
      production_promoted: release.production_promoted,
      source_revision: release.source_revision,
      manifest_digest: release.manifest_digest,
      signer_key_id: release.signer_key_id,
      manifest_policy_digest: release.policy_digest
    },
    host: {
      profile_id: hostPlan.profile_id,
      plan_digest: hostPlan.plan_digest,
      host_facts_digest: hostPlan.host_facts_digest,
      facts_source: hostFacts.facts_source,
      platform: hostFacts.platform,
      architecture: hostFacts.architecture
    },
    artifacts: verifiedArtifacts,
    artifact_set_digest: artifactSetDigest,
    release_manifest_verified: true,
    release_control_plane_bound: true,
    host_plan_verified: true,
    host_candidate_compatible: true,
    artifact_bytes_verified: true,
    release_host_artifact_binding_complete: true,
    may_request_privileged_install_review: true,
    privileged_install_authorized: false,
    host_mutation_authorized: false,
    installation_authority_granted: false,
    mesh_authority_granted: false,
    network_authority_granted: false,
    node_enrolled: false,
    services_started: false,
    mutation_performed: false,
    artifact_transport_trusted: false,
    host_facts_authenticated: false,
    physical_host_attested: false,
    runtime_safety_established: false,
    disposable_host_evidence_verified: false,
    reboot_update_restore_evidence_verified: false,
    authority_effect: 'none',
    network_effect: 'none'
  };
  return {
    ...core,
    admission_digest: digestObject(core)
  };
}

/**
 * Recompute the deterministic admission from its lower-layer inputs and require
 * byte-for-byte canonical equality. This prevents a stored admission object from
 * laundering a different release, plan, host observation, artifact set, or authority flag.
 */
export function verifyInstallInputAdmission(
  admission,
  inputs,
  verificationOptions = {}
) {
  const expected = buildInstallInputAdmission(inputs, verificationOptions);
  if (canonicalJson(admission) !== canonicalJson(expected)) {
    throw new ValidationError('Install input admission does not match its verified lower-layer inputs');
  }
  return {
    valid: true,
    schema: admission.schema,
    admission_digest: admission.admission_digest,
    release_id: admission.release.release_id,
    source_revision: admission.release.source_revision,
    profile_id: admission.host.profile_id,
    manifest_digest: admission.release.manifest_digest,
    host_plan_digest: admission.host.plan_digest,
    host_facts_digest: admission.host.host_facts_digest,
    artifact_set_digest: admission.artifact_set_digest,
    artifact_count: admission.artifacts.length,
    release_host_artifact_binding_complete: true,
    may_request_privileged_install_review: true,
    privileged_install_authorized: false,
    host_mutation_authorized: false,
    authority_effect: 'none',
    network_effect: 'none'
  };
}

function validateHostFactsBinding(hostPlan, hostFacts) {
  if (!hostFacts || typeof hostFacts !== 'object' || Array.isArray(hostFacts)) {
    throw new ValidationError('Install input admission requires host facts');
  }
  for (const key of ['facts_source', 'platform', 'architecture']) {
    if (typeof hostFacts[key] !== 'string' || hostFacts[key].length === 0) {
      throw new ValidationError(`Install input host fact is invalid: ${key}`);
    }
  }
  if (digestObject(hostFacts) !== hostPlan.host_facts_digest) {
    throw new ValidationError('Host facts do not match the verified host plan');
  }
}

function selectRequiredArtifacts(artifacts, profileId, hostFacts) {
  const required = artifacts.filter(artifact => {
    const evidence = EVIDENCE_KINDS.has(artifact.kind);
    const profileRequired = artifact.required_for_profiles.includes(profileId);
    if (!evidence && !profileRequired) return false;
    return platformMatches(artifact.platform, hostFacts.platform)
      && architectureMatches(artifact.architecture, hostFacts.architecture);
  });

  const requiredProfileArtifacts = artifacts.filter(artifact =>
    artifact.required_for_profiles.includes(profileId)
  );
  for (const artifact of requiredProfileArtifacts) {
    if (
      !platformMatches(artifact.platform, hostFacts.platform)
      || !architectureMatches(artifact.architecture, hostFacts.architecture)
    ) {
      if (INSTALLABLE_KINDS.has(artifact.kind)) continue;
      throw new ValidationError(
        `Required release evidence is incompatible with the host: ${artifact.artifact_id}`
      );
    }
  }

  return required;
}

function normalizeArtifactBytes(value) {
  if (value instanceof Map) {
    const output = new Map();
    for (const [key, bytes] of value.entries()) {
      validateArtifactBytesEntry(key, bytes);
      if (output.has(key)) throw new ValidationError('Install input artifact byte id is duplicated');
      output.set(key, bytes);
    }
    return output;
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new ValidationError('Install input artifact bytes must be a Map or object');
  }
  const output = new Map();
  for (const key of Object.keys(value)) {
    const bytes = value[key];
    validateArtifactBytesEntry(key, bytes);
    output.set(key, bytes);
  }
  return output;
}

function validateArtifactBytesEntry(key, bytes) {
  if (typeof key !== 'string' || key.length === 0 || key.length > 160) {
    throw new ValidationError('Install input artifact byte id is invalid');
  }
  if (!Buffer.isBuffer(bytes) && !(bytes instanceof Uint8Array)) {
    throw new ValidationError(`Install input artifact bytes are invalid: ${key}`);
  }
}

function platformMatches(required, observed) {
  return required === 'any' || required === observed;
}

function architectureMatches(required, observed) {
  return required === 'any' || required === observed;
}
