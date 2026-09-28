import { types as utilTypes } from 'node:util';

import { digestObject, ValidationError } from './canonical.mjs';
import { validateHostInstallPlan } from './host-install-plan.mjs';
import {
  verifyInstallReleaseArtifact,
  verifyInstallReleaseManifest
} from './install-release-manifest.mjs';

export const INSTALL_SESSION_SCHEMA='axiom-install-session.v0';
export const INSTALL_ARTIFACT_PROOF_SCHEMA='axiom-install-artifact-proof.v0';

const ZERO_SHA='0'.repeat(64);
const SHA=/^[a-f0-9]{64}$/;
const REVISION=/^[a-f0-9]{40}$/;
const ID=/^[A-Za-z0-9][A-Za-z0-9._:/-]{1,191}$/;
const VERSION=/^\d+\.\d+\.\d+(?:-[A-Za-z0-9.-]+)?$/;
const OBSERVATION_SOURCES=new Set(['supplied-evidence','synthetic-test']);
const PRESENCE=new Set([
  'absent','current-receipt','partial-current-receipt','legacy-proof-markers','unknown'
]);
const HEALTH=new Set(['not-applicable','healthy','unhealthy','unknown']);
const RECEIPT_STATUS=new Set(['none','complete','partial','conflicting','unknown']);
const CLASSIFICATIONS=new Set([
  'absent','healthy-same','healthy-older','partial-same','conflicting-partial',
  'newer-or-unknown','legacy-proof-state'
]);
const NEXT_PREPARATIONS=new Set([
  'verify-noop','prepare-install','prepare-repair','prepare-upgrade','stop'
]);
const ROLLBACK_MODES=new Set([
  'in-place-compatible','backup-restore-required','migration-specific'
]);
const DIRECT_UPGRADE_POSTURES=new Set(['in-place-compatible','backup-restore-required']);
const INSTALLABLE_ARTIFACT_KINDS=new Set(['source-archive','oci-image','axiom-host-image']);
const PRIVATE_BIRTH_TOKEN=/(^|[._:/-])(birth|genesis|spark)([._:/-]|$)/i;

const RELEASE_VERIFICATION_FIELDS=[
  'valid','schema','manifest_schema','release_id','kernel_version','channel',
  'source_revision','evaluated_at','valid_until','signer_key_id',
  'signature_verified','control_plane_bound','install_profile_binding_complete',
  'artifact_metadata_bound','artifact_bytes_verified','artifact_count','install_profiles',
  'policy_digest','manifest_digest','production_promoted','production_promotion_established',
  'release_input_cryptographically_valid','host_plan_required_separately',
  'data_compatibility','host_mutation_authorized','installation_authority_granted',
  'mesh_authority_granted','network_authority_granted','node_enrolled','services_started',
  'authority_effect','network_effect'
];

export function createInstallArtifactProof(
  packageValue,
  artifactId,
  bytes,
  verifierOptions
){
  if(typeof artifactId!=='string'||!ID.test(artifactId)){
    throw new ValidationError('Install artifact proof artifact_id is invalid');
  }
  const verification=verifyInstallReleaseManifest(packageValue,verifierOptions);
  validateReleaseVerification(verification);
  const artifact=packageValue.manifest.artifacts.find(item=>item.artifact_id===artifactId);
  if(!artifact) throw new ValidationError('Install artifact proof artifact is not present in verified manifest');
  if(isPrivateBirthArtifact(artifact)){
    throw new ValidationError('Standard install artifact inventory cannot contain birth/Genesis/Spark material');
  }
  const byteProof=verifyInstallReleaseArtifact(artifact,bytes);
  const core={
    schema:INSTALL_ARTIFACT_PROOF_SCHEMA,
    version:0,
    status:'verified-local-artifact-bytes-evidence',
    release_id:verification.release_id,
    manifest_digest:verification.manifest_digest,
    profile_ids:[...artifact.required_for_profiles].sort(),
    artifact_id:artifact.artifact_id,
    artifact_kind:artifact.kind,
    artifact_sha256:byteProof.sha256,
    byte_length:byteProof.byte_length,
    verified_at:verification.evaluated_at,
    artifact_bytes_verified:true,
    host_mutation_authorized:false,
    credential_effect:'none',
    service_start_effect:'none',
    authority_effect:'none',
    network_effect:'none',
    runtime_activation:false,
    proof_digest:ZERO_SHA
  };
  core.proof_digest=computeInstallArtifactProofDigest(core);
  validateInstallArtifactProof(core);
  return deepFreeze(core);
}

export function computeInstallArtifactProofDigest(proof){
  exactObject(proof,'Install artifact proof digest input',[
    'schema','version','status','release_id','manifest_digest','profile_ids',
    'artifact_id','artifact_kind','artifact_sha256','byte_length','verified_at',
    'artifact_bytes_verified','host_mutation_authorized','credential_effect',
    'service_start_effect','authority_effect','network_effect','runtime_activation',
    'proof_digest'
  ]);
  return digestObject({...proof,proof_digest:ZERO_SHA});
}

export function validateInstallArtifactProof(proof){
  exactObject(proof,'Install artifact proof',[
    'schema','version','status','release_id','manifest_digest','profile_ids',
    'artifact_id','artifact_kind','artifact_sha256','byte_length','verified_at',
    'artifact_bytes_verified','host_mutation_authorized','credential_effect',
    'service_start_effect','authority_effect','network_effect','runtime_activation',
    'proof_digest'
  ]);
  if(
    proof.schema!==INSTALL_ARTIFACT_PROOF_SCHEMA
    ||proof.version!==0
    ||proof.status!=='verified-local-artifact-bytes-evidence'
    ||!ID.test(proof.release_id)
    ||!SHA.test(proof.manifest_digest)
    ||!ID.test(proof.artifact_id)
    ||typeof proof.artifact_kind!=='string'
    ||proof.artifact_kind.length<1
    ||proof.artifact_kind.length>128
    ||!SHA.test(proof.artifact_sha256)
    ||!Number.isSafeInteger(proof.byte_length)
    ||proof.byte_length<1
    ||proof.artifact_bytes_verified!==true
    ||proof.host_mutation_authorized!==false
    ||proof.credential_effect!=='none'
    ||proof.service_start_effect!=='none'
    ||proof.authority_effect!=='none'
    ||proof.network_effect!=='none'
    ||proof.runtime_activation!==false
  ) throw new ValidationError('Install artifact proof boundary is invalid');
  stringArray(proof.profile_ids,'Install artifact proof profile_ids',{min:1,max:8,itemMax:64});
  canonicalTime(proof.verified_at,'verified_at');
  if(PRIVATE_BIRTH_TOKEN.test(proof.artifact_id)){
    throw new ValidationError('Install artifact proof cannot reference birth/Genesis/Spark material');
  }
  if(!SHA.test(proof.proof_digest)||computeInstallArtifactProofDigest(proof)!==proof.proof_digest){
    throw new ValidationError('Install artifact proof digest mismatch');
  }
  return Object.freeze({
    valid:true,
    proof_digest:proof.proof_digest,
    release_id:proof.release_id,
    artifact_id:proof.artifact_id,
    artifact_sha256:proof.artifact_sha256,
    host_mutation_authorized:false,
    authority_effect:'none',
    network_effect:'none'
  });
}

export function createInstallSession({
  sessionId,
  hostPlan,
  releaseVerification,
  artifactProofs,
  observedInstall,
  observedAt
}){
  if(typeof sessionId!=='string'||!ID.test(sessionId)){
    throw new ValidationError('Install session_id is invalid');
  }
  const host=validateHostInstallPlan(hostPlan);
  validateReleaseVerification(releaseVerification);
  validateObservedInstall(observedInstall);
  const observationTime=canonicalTime(observedAt,'observedAt');
  if(observationTime<canonicalTime(releaseVerification.evaluated_at,'release evaluated_at')){
    throw new ValidationError('Install session observation cannot predate release verification');
  }
  if(observationTime>=canonicalTime(releaseVerification.valid_until,'release valid_until')){
    throw new ValidationError('Install session cannot use an expired release verification');
  }
  if(observationTime<canonicalTime(observedInstall.observed_at,