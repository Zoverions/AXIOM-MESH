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
    manifest:value,
    signature:{
      algorithm:'Ed25519',
      key_id:value.signing_key_id,
      digest:sha256(body),
      signature:sign(null,Buffer.from(body),privateKey).toString('base64url')
    }
  };
}

function verifierOptions(){
  return {
    trustedSigners:[{
      key_id:KEY_ID,
      public_key:publicPem,
      roles:['release-installer-authority'],
      status:'active'
    }],
    evaluatedAt:EVALUATED_AT
  };
}

function verification(pkg=signPackage()){
  return verifyInstallReleaseManifest(pkg,verifierOptions());
}

function proof(pkg=signPackage(),artifactId='runtime',bytes=artifactBytes.runtime){
  return createInstallArtifactProof(pkg,artifactId,bytes,verifierOptions());
}

function absent(overrides={}){
  return {
    observation_source:'synthetic-test',
    presence:'absent',
    health:'not-applicable',
    receipt_status:'none',
    existing_receipt_digest:null,
    existing_profile_id:null,
    existing_release_id:null,
    existing_kernel_version:null,
    existing_source_revision:null,
    legacy_proof_state_detected:false,
    observed_at:OBSERVED_AT,
    ...overrides
  };
}

function existing(overrides={}){
  const v=verification();
  return {
    observation_source:'synthetic-test',
    presence:'current-receipt',
    health:'healthy',
    receipt_status:'complete',
    existing_receipt_digest:RECEIPT,
    existing_profile_id:'personal-local',
    existing_release_id:v.release_id,
    existing_kernel_version:v.kernel_version,
    existing_source_revision:v.source_revision,
    legacy_proof_state_detected:false,
    observed_at:OBSERVED_AT,
    ...overrides
  };
}

function sessionInput({pkg=signPackage(),observed=absent(),plan=hostPlan(),proofs=null}={}){
  const releaseVerification=verification(pkg);
  return {
    sessionId:'install.session.test.1',
    hostPlan:plan,
    releaseVerification,
    artifactProofs:proofs??[proof(pkg)],
    observedInstall:observed,
    observedAt:OBSERVED_AT
  };
}

test('artifact proof re-verifies manifest and exact bytes, then binds them to manifest digest',()=>{
  const pkg=signPackage();
  const p=proof(pkg);
  assert.equal(p.schema,INSTALL_ARTIFACT_PROOF_SCHEMA);
  assert.equal(validateInstallArtifactProof(p).valid,true);
  assert.equal(p.manifest_digest,verification(pkg).manifest_digest);
  assert.equal(p.artifact_bytes_verified,true);
  assert.equal(p.host_mutation_authorized,false);
  assert.equal(p.proof_digest,computeInstallArtifactProofDigest(p));
  assert.throws(()=>createInstallArtifactProof(pkg,'runtime',Buffer.from('wrong'),verifierOptions()),/mismatch/);
});

test('absent state derives prepare-install without granting mutation',()=>{
  const s=createInstallSession(sessionInput());
  assert.equal(s.schema,INSTALL_SESSION_SCHEMA);
  assert.equal(s.classification,'absent');
  assert.equal(s.next_preparation,'prepare-install');
  assert.equal(s.host_mutation_authorized,false);
  assert.equal(s.authority_effect,'none');
  assert.equal(validateInstallSession(s).valid,true);
  assert.equal(s.session_digest,computeInstallSessionDigest(s));
});

test('exact healthy same release derives verify-noop',()=>{
  const s=createInstallSession(sessionInput({observed:existing()}));
  assert.equal(s.classification,'healthy-same');
  assert.equal(s.next_preparation,'verify-noop');
});

test('older exact receipt prepares upgrade only with compatible signed release posture',()=>{
  const pkg=signPackage(manifest({
    data_compatibility:{
      migration_generation:MIGRATIONS.length,
      rollback_mode:'backup-restore-required',
      minimum_compatible_kernel:'0.11.0'
    }
  }));
  const observed=existing({
    existing_release_id:'axiom-mesh/0.11.0/prior',
    existing_kernel_version:'0.11.0',
    existing_source_revision:'c'.repeat(40)
  });
  const input=sessionInput({pkg,observed});
  const derived=deriveInstallClassification({
    hostPlan:input.hostPlan,
    releaseVerification:input.releaseVerification,
    observedInstall:observed
  });
  assert.equal(derived.classification,'healthy-older');
  assert.equal(derived.next_preparation,'prepare-upgrade');
});

test('older install stops when minimum compatible kernel is newer than installed state',()=>{
  const pkg=signPackage(manifest({
    data_compatibility:{
      migration_generation:MIGRATIONS.length,
      rollback_mode:'migration-specific',
      minimum_compatible_kernel:'0.11.1'
    }
  }));
  const v=verification(pkg);
  const observed=existing({
    existing_release_id:'axiom-mesh/0.11.0/prior',
    existing_kernel_version:'0.11.0',
    existing_source_revision:'c'.repeat(40)
  });
  const d=deriveInstallClassification({hostPlan:hostPlan(),releaseVerification:v,observedInstall:observed});
  assert.equal(d.classification,'healthy-older');
  assert.equal(d.next_preparation,'stop');
});

test('partial exact target lineage derives prepare-repair',()=>{
  const v=verification();
  const observed=existing({
    presence:'partial-current-receipt',
    health:'unhealthy',
    receipt_status:'partial',
    existing_release_id:v.release_id,
    existing_kernel_version:v.kernel_version,
    existing_source_revision:v.source_revision
  });
  const s=createInstallSession(sessionInput({observed}));
  assert.equal(s.classification,'partial-same');
  assert.equal(s.next_preparation,'prepare-repair');
});

test('partial mismatched target lineage stops as conflicting-partial',()=>{
  const observed=existing({
    presence:'partial-current-receipt',
    health:'unhealthy',
    receipt_status:'partial',
    existing_source_revision:'d'.repeat(40)
  });
  const s=createInstallSession(sessionInput({observed}));
  assert.equal(s.classification,'conflicting-partial');
  assert.equal(s.next_preparation,'stop');
});

test('newer existing install never downgrades automatically',()=>{
  const observed=existing({
    existing_release_id:'axiom-mesh/0.13.0/future',
    existing_kernel_version:'0.13.0',
    existing_source_revision:'e'.repeat(40)
  });
  const s=createInstallSession(sessionInput({observed}