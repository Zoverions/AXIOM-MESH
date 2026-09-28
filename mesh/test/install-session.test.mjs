import assert from 'node:assert/strict';
import { generateKeyPairSync, sign } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import installTargets from '../config/install-targets.json' with { type: 'json' };
import hostInstallPolicy from '../config/host-install-policy.json' with { type: 'json' };
import capabilityRegistry from '../config/capabilities.json' with { type: 'json' };
import applicationCatalog from '../config/application-catalog.json' with { type: 'json' };
import serviceNetworkPolicy from '../config/service-network-policy.json' with { type: 'json' };
import sourceSetupPolicy from '../config/setup.json' with { type: 'json' };
import { MIGRATIONS } from '../src/grid/migrations.mjs';
import { buildHostInstallPlan } from '../src/lib/host-install-plan.mjs';
import { verifyInstallReleaseManifest } from '../src/lib/install-release-manifest.mjs';
import { canonicalJson, digestObject, sha256 } from '../src/lib/canonical.mjs';
import {
  INSTALL_ARTIFACT_PROOF_SCHEMA,
  INSTALL_SESSION_SCHEMA,
  computeInstallArtifactProofDigest,
  computeInstallSessionDigest,
  createInstallArtifactProof,
  createInstallSession,
  deriveInstallClassification,
  validateInstallArtifactProof,
  validateInstallSession
} from '../src/lib/install-session.mjs';

const pair=generateKeyPairSync('ed25519');
const publicPem=pair.publicKey.export({type:'spki',format:'pem'});
const KEY_ID='release:test-session-key';
const EVALUATED_AT='2026-09-28T02:00:00.000Z';
const OBSERVED_AT='2026-09-28T02:01:00.000Z';
const TARGET_REVISION='a'.repeat(40);
const RECEIPT='b'.repeat(64);

const artifactBytes=Object.freeze({
  runtime:Buffer.from('oci image personal'),
  documentation:Buffer.from('documentation bundle'),
  sbom:Buffer.from('spdx sbom'),
  provenance:Buffer.from('release provenance')
});

function linuxFacts(overrides={}){
  return {
    facts_source:'synthetic-test',
    platform:'linux',
    architecture:'x64',
    distro_id:'ubuntu',
    distro_version:'24.04',
    init_system:'systemd',
    package_manager:'apt-get',
    node_version:null,
    memory_bytes:16*1024*1024*1024,
    root_filesystem_free_bytes:100*1024*1024*1024,
    container_runtime:'docker',
    effective_uid:1000,
    ...overrides
  };
}

function hostPlan(overrides={}){
  const base=buildHostInstallPlan({
    profileId:'personal-local',
    hostFacts:linuxFacts(),
    runtimeStrategy:'oci'
  });
  return {...structuredClone(base),...overrides};
}

function artifact(artifactId,kind,requiredForProfiles,overrides={}){
  const bytes=artifactBytes[artifactId]??Buffer.from(`artifact:${artifactId}`);
  const evidence=['documentation-bundle','sbom','provenance'].includes(kind);
  return {
    artifact_id:artifactId,
    kind,
    platform:evidence?'any':'linux',
    architecture:evidence?'any':'x64',
    media_type:kind==='oci-image'
      ?'application/vnd.oci.image.manifest.v1+json'
      :'application/octet-stream',
    locator:`release://0.12.0-dev.3/${artifactId}`,
    sha256:sha256(bytes),
    byte_length:bytes.length,
    required_for_profiles:requiredForProfiles,
    ...overrides
  };
}

function manifest(overrides={}){
  return {
    schema:'axiom-install-release-manifest.v1',
    version:1,
    release_id:'axiom-mesh/0.12.0-dev.3/session-test',
    kernel_version:'0.12.0-dev.3',
    channel:'development',
    production_promoted:false,
    source_revision:TARGET_REVISION,
    issued_at:'2026-09-28T01:30:00.000Z',
    valid_until:'2026-09-28T03:00:00.000Z',
    signing_key_id:KEY_ID,
    install_profiles:[
      {id:'personal-local',target_status:'specified'},
      {id:'infrastructure-node',target_status:'specified'}
    ],
    toolchain:{
      node_engine:sourceSetupPolicy.runtime.engine,
      node_ci_version:sourceSetupPolicy.runtime.ci_version,
      node_hosted_production_version:sourceSetupPolicy.runtime.hosted_production_version,
      node_container_version:sourceSetupPolicy.runtime.production_version,
      npm_minimum_version:sourceSetupPolicy.package_manager.minimum_version,
      npm_major_exclusive:sourceSetupPolicy.package_manager.maximum_major_exclusive,
      npm_compatibility_minimum_version:sourceSetupPolicy.package_manager.compatibility_minimum_version,
      npm_compatibility_major_exclusive:sourceSetupPolicy.package_manager.compatibility_maximum_major_exclusive
    },
    data_compatibility:{
      migration_generation:MIGRATIONS.length,
      rollback_mode:'migration-specific',
      minimum_compatible_kernel:'0.11.0'
    },
    control_plane:{
      install_targets_sha256:digestObject(installTargets),
      host_install_policy_sha256:digestObject(hostInstallPolicy),
      capability_registry_sha256:digestObject(capabilityRegistry),
      application_catalog_sha256:digestObject(applicationCatalog),
      service_network_policy_sha256:digestObject(serviceNetworkPolicy),
      source_setup_policy_sha256:digestObject(sourceSetupPolicy)
    },
    artifacts:[
      artifact('runtime','oci-image',['personal-local','infrastructure-node']),
      artifact('documentation','documentation-bundle',['personal-local','infrastructure-node']),
      artifact('sbom','sbom',['personal-local','infrastructure-node']),
      artifact('provenance','provenance',['personal-local','infrastructure-node'])
    ],
    non_claims:[
      'signature-does-not-grant-install-authority',
      'artifact-presence-does-not-prove-runtime-safety',
      'axiom-host-image-does-not-prove-secure-or-measured-boot',
      'manifest-does-not-enroll-node-or-start-services',
      'manifest-does-not-prove-artifact-bytes',
      'manifest-does-not-prove-node-readiness'
    ],
    installation_grants_authority:false,
    host_mutation_authorized:false,
    authority_effect:'none',
    network_effect:'none',
    ...overrides
  };
}

function signPackage(value=manifest(),privateKey=pair.privateKey){
  const body=canonicalJson(value);
  return {
    schema:'axiom-install-release-manifest-package.v1',
    manifest:valu