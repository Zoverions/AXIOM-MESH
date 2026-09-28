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
  if(observationTime<canonicalTime(observedInstall.observed_at,'observed install observed_at')){
    throw new ValidationError('Install session observation cannot predate install-state evidence');
  }
  if(!releaseVerification.install_profiles.includes(host.profile_id)){
    throw new ValidationError('Install session profile is not bound by the verified release');
  }
  if(releaseVerification.kernel_version!==hostPlan.kernel_version){
    throw new ValidationError('Install session host plan and release kernel version mismatch');
  }

  plainArray(artifactProofs,'Install session artifact proofs',{min:1,max:128});
  const seenArtifacts=new Set();
  const normalizedProofs=[];
  let profileInstallableProof=false;
  for(const proof of artifactProofs){
    validateInstallArtifactProof(proof);
    if(seenArtifacts.has(proof.artifact_id)){
      throw new ValidationError('Install session contains duplicate artifact proof identity');
    }
    seenArtifacts.add(proof.artifact_id);
    if(
      proof.release_id!==releaseVerification.release_id
      ||proof.manifest_digest!==releaseVerification.manifest_digest
    ) throw new ValidationError('Install session artifact proof is bound to another release');
    if(proof.verified_at!==releaseVerification.evaluated_at){
      throw new ValidationError('Install session artifact proof currentness does not match release verification');
    }
    if(
      proof.profile_ids.includes(host.profile_id)
      &&INSTALLABLE_ARTIFACT_KINDS.has(proof.artifact_kind)
    ) profileInstallableProof=true;
    normalizedProofs.push({
      artifact_id:proof.artifact_id,
      artifact_sha256:proof.artifact_sha256,
      proof_digest:proof.proof_digest
    });
  }
  if(!profileInstallableProof){
    throw new ValidationError('Install session lacks artifact evidence for target profile');
  }
  normalizedProofs.sort((a,b)=>a.artifact_id.localeCompare(b.artifact_id));

  const derived=deriveInstallClassification({
    hostPlan,
    releaseVerification,
    observedInstall
  });

  const core={
    schema:INSTALL_SESSION_SCHEMA,
    version:0,
    status:'inert-pre-mutation-classification',
    session_id:sessionId,
    profile_id:host.profile_id,
    host_plan_digest:host.plan_digest,
    release_id:releaseVerification.release_id,
    kernel_version:releaseVerification.kernel_version,
    source_revision:releaseVerification.source_revision,
    manifest_digest:releaseVerification.manifest_digest,
    artifact_proofs:normalizedProofs,
    observed_install_digest:digestObject(observedInstall),
    observed_at:new Date(observationTime).toISOString(),
    classification:derived.classification,
    next_preparation:derived.next_preparation,
    reasons:derived.reasons,
    blockers:derived.blockers,
    host_mutation_authorized:false,
    credential_effect:'none',
    service_start_effect:'none',
    authority_effect:'none',
    network_effect:'none',
    runtime_activation:false,
    session_digest:ZERO_SHA
  };
  core.session_digest=computeInstallSessionDigest(core);
  validateInstallSession(core);
  return deepFreeze(core);
}

export function computeInstallSessionDigest(session){
  exactObject(session,'Install session digest input',[
    'schema','version','status','session_id','profile_id','host_plan_digest',
    'release_id','kernel_version','source_revision','manifest_digest',
    'artifact_proofs','observed_install_digest','observed_at','classification',
    'next_preparation','reasons','blockers','host_mutation_authorized',
    'credential_effect','service_start_effect','authority_effect','network_effect',
    'runtime_activation','session_digest'
  ]);
  return digestObject({...session,session_digest:ZERO_SHA});
}

export function validateInstallSession(session){
  exactObject(session,'Install session',[
    'schema','version','status','session_id','profile_id','host_plan_digest',
    'release_id','kernel_version','source_revision','manifest_digest',
    'artifact_proofs','observed_install_digest','observed_at','classification',
    'next_preparation','reasons','blockers','host_mutation_authorized',
    'credential_effect','service_start_effect','authority_effect','network_effect',
    'runtime_activation','session_digest'
  ]);
  if(
    session.schema!==INSTALL_SESSION_SCHEMA
    ||session.version!==0
    ||session.status!=='inert-pre-mutation-classification'
    ||!ID.test(session.session_id)
    ||!ID.test(session.profile_id)
    ||!SHA.test(session.host_plan_digest)
    ||!ID.test(session.release_id)
    ||!VERSION.test(session.kernel_version)
    ||!REVISION.test(session.source_revision)
    ||!SHA.test(session.manifest_digest)
    ||!SHA.test(session.observed_install_digest)
    ||!CLASSIFICATIONS.has(session.classification)
    ||!NEXT_PREPARATIONS.has(session.next_preparation)
    ||session.host_mutation_authorized!==false
    ||session.credential_effect!=='none'
    ||session.service_start_effect!=='none'
    ||session.authority_effect!=='none'
    ||session.network_effect!=='none'
    ||session.runtime_activation!==false
  ) throw new ValidationError('Install session boundary is invalid');
  canonicalTime(session.observed_at,'observed_at');
  stringArray(session.reasons,'Install session reasons',{min:1,max:32,itemMax:160});
  stringArray(session.blockers,'Install session blockers',{min:0,max:64,itemMax:256});
  plainArray(session.artifact_proofs,'Install session artifact_proofs',{min:1,max:128});
  const seen=new Set();
  for(const item of session.artifact_proofs){
    exactObject(item,'Install session artifact proof reference',[
      'artifact_id','artifact_sha256','proof_digest'
    ]);
    if(!ID.test(item.artifact_id)||!SHA.test(item.artifact_sha256)||!SHA.test(item.proof_digest)||seen.has(item.artifact_id)){
      throw new ValidationError('Install session artifact proof reference is invalid');
    }
    if(PRIVATE_BIRTH_TOKEN.test(item.artifact_id)){
      throw new ValidationError('Install session cannot reference birth/Genesis/Spark material');
    }
    seen.add(item.artifact_id);
  }
  const expectedNext=expectedPreparationForClassification(session.classification);
  if(session.classification!=='healthy-older'&&session.next_preparation!==expectedNext){
    throw new ValidationError('Install session next preparation does not match classification');
  }
  if(session.classification==='healthy-older'&&!['prepare-upgrade','stop'].includes(session.next_preparation)){
    throw new ValidationError('Install session healthy-older next preparation is invalid');
  }
  if(!SHA.test(session.session_digest)||computeInstallSessionDigest(session)!==session.session_digest){
    throw new ValidationError('Install session digest mismatch');
  }
  return Object.freeze({
    valid:true,
    session_digest:session.session_digest,
    classification:session.classification,
    next_preparation:session.next_preparation,
    host_mutation_authorized:false,
    authority_effect:'none',
    network_effect:'none'
  });
}

export function deriveInstallClassification({hostPlan,releaseVerification,observedInstall}){
  validateHostInstallPlan(hostPlan);
  validateReleaseVerification(releaseVerification);
  validateObservedInstall(observedInstall);

  const reasons=[];
  const blockers=[];
  if(hostPlan.host_candidate_compatible!==true){
    blockers.push(...hostPlan.blockers.map(item=>`host-plan:${item}`));
  }

  let classification;
  let next;
  if(observedInstall.legacy_proof_state_detected||observedInstall.presence==='legacy-proof-markers'){
    classification='legacy-proof-state';
    next='stop';
    reasons.push('legacy-proof-state-is-not-current-install-state');
  }else if(observedInstall.presence==='absent'){
    classification='absent';
    next='prepare-install';
    reasons.push('no-existing-install-state-observed');
  }else if(observedInstall.presence==='unknown'){
    classification='newer-or-unknown';
    next='stop';
    reasons.push('existing-install-state-unknown');
  }else{
    const exactIdentity=existingIdentityMatchesTarget(observedInstall,hostPlan,releaseVerification);
    const relation=compareVersions(
      observedInstall.existing_kernel_version,
      releaseVerification.kernel_version
    );
    if(observedInstall.presence==='partial-current-receipt'){
      if(exactIdentity&&observedInstall.receipt_status==='partial'){
        classification='partial-same';
        next='prepare-repair';
        reasons.push('partial-install-matches-exact-target-lineage');
      }else{
        classification='conflicting-partial';
        next='stop';
        reasons.push('partial-install-does-not-match-exact-target-lineage');
      }
    }else if(exactIdentity&&observedInstall.receipt_status==='complete'){
      if(observedInstall.health==='healthy'){
        classification='healthy-same';
        next='verify-noop';
        reasons.push('existing-install-matches-exact-target-and-is-healthy');
      }else if(observedInstall.health==='unhealthy'){
        classification='partial-same';
        next='prepare-repair';
        reasons.push('existing-install-matches-target-but-is-unhealthy');
      }else{
        classification='newer-or-unknown';
        next='stop';
        reasons.push('existing-install-health-is-unknown');
      }
    }else if(
      relation===-1
      &&observedInstall.receipt_status==='complete'
      &&observedInstall.health==='healthy'
      &&observedInstall.existing_profile_id===hostPlan.profile_id
    ){
      classification='healthy-older';
      if(upgradePreparationAllowed(observedInstall,releaseVerification)){
        next='prepare-upgrade';
        reasons.push('existing-install-is-older-and-release-declares-compatible-upgrade-posture');
      }else{
        next='stop';
        reasons.push('existing-install-is-older-but-upgrade-compatibility-is-not-established');
      }
    }else if(relation===1||relation===null){
      classification='newer-or-unknown';
      next='stop';
      reasons.push(relation===1?'existing-install-is-newer-than-target':'existing-install-version-is-not-comparable');
    }else{
      classification='conflicting-partial';
      next='stop';
      reasons.push('existing-install-identity-conflicts-with-target-release');
    }
  }

  if(blockers.length>0){
    next='stop';
    reasons.push('host-plan-has-blockers');
  }

  return deepFreeze({
    classification,
    next_preparation:next,
    reasons:[...new Set(reasons)],
    blockers:[...new Set(blockers)],
    host_mutation_authorized:false,
    authority_effect:'none',
    network_effect:'none'
  });
}

function validateReleaseVerification(value){
  exactObject(value,'Install release verification',RELEASE_VERIFICATION_FIELDS);
  if(
    value.valid!==true
    ||typeof value.schema!=='string'
    ||typeof value.manifest_schema!=='string'
    ||!ID.test(value.release_id)
    ||!VERSION.test(value.kernel_version)
    ||typeof value.channel!=='string'
    ||!REVISION.test(value.source_revision)
    ||!ID.test(value.signer_key_id)
    ||value.signature_verified!==true
    ||value.control_plane_bound!==true
    ||value.install_profile_binding_complete!==true
    ||value.artifact_metadata_bound!==true
    ||value.artifact_bytes_verified!==false
    ||!Number.isSafeInteger(value.artifact_count)
    ||value.artifact_count<1
    ||!SHA.test(value.policy_digest)
    ||!SHA.test(value.manifest_digest)
    ||value.production_promoted!==false
    ||value.production_promotion_established!==false
    ||value.release_input_cryptographically_valid!==true
    ||value.host_plan_required_separately!==true
    ||value.host_mutation_authorized!==false
    ||value.installation_authority_granted!==false
    ||value.mesh_authority_granted!==false
    ||value.network_authority_granted!==false
    ||value.node_enrolled!==false
    ||value.services_started!==false
    ||value.authority_effect!=='none'
    ||value.network_effect!=='none'
  ) throw new ValidationError('Install release verification is not a current zero-authority verified result');
  canonicalTime(value.evaluated_at,'release evaluated_at');
  canonicalTime(value.valid_until,'release valid_until');
  stringArray(value.install_profiles,'Install release verification profiles',{min:1,max:8,itemMax:64});
  exactObject(value.data_compatibility,'Install release verification data compatibility',[
    'migration_generation','rollback_mode','minimum_compatible_kernel'
  ]);
  if(
    !Number.isSafeInteger(value.data_compatibility.migration_generation)
    ||value.data_compatibility.migration_generation<0
    ||!ROLLBACK_MODES.has(value.data_compatibility.rollback_mode)
    ||!VERSION.test(value.data_compatibility.minimum_compatible_kernel)
  ) throw new ValidationError('Install release verification data compatibility is invalid');
  return value;
}

function validateObservedInstall(value){
  exactObject(value,'Observed install state',[
    'observation_source','presence','health','receipt_status','existing_receipt_digest',
    'existing_profile_id','existing_release_id','existing_kernel_version',
    'existing_source_revision','legacy_proof_state_detected','observed_at'
  ]);
  if(
    !OBSERVATION_SOURCES.has(value.observation_source)
    ||!PRESENCE.has(value.presence)
    ||!HEALTH.has(value.health)
    ||!RECEIPT_STATUS.has(value.receipt_status)
    ||typeof value.legacy_proof_state_detected!=='boolean'
  ) throw new ValidationError('Observed install state vocabulary is invalid');
  canonicalTime(value.observed_at,'observed install observed_at');
  nullableSha(value.existing_receipt_digest,'existing_receipt_digest');
  nullableId(value.existing_profile_id,'existing_profile_id');
  nullableId(value.existing_release_id,'existing_release_id');
  nullableVersion(value.existing_kernel_version,'existing_kernel_version');
  nullableRevision(value.existing_source_revision,'existing_source_revision');

  const allExistingNull=[
    value.existing_receipt_digest,value.existing_profile_id,value.existing_release_id,
    value.existing_kernel_version,value.existing_source_revision
  ].every(item=>item===null);

  if(value.presence==='absent'){
    if(
      value.health!=='not-applicable'
      ||value.receipt_status!=='none'
      ||!allExistingNull
      ||value.legacy_proof_state_detected
    ) throw new ValidationError('Absent install state cannot carry existing-install evidence');
  }
  if(value.presence==='current-receipt'){
    if(
      value.receipt_status!=='complete'
      ||value.health==='not-applicable'
      ||[
        value.existing_receipt_digest,value.existing_profile_id,value.existing_release_id,
        value.existing_kernel_version,value.existing_source_revision
      ].some(item=>item===null)
      ||value.legacy_proof_state_detected
    ) throw new ValidationError('Current install receipt state is incomplete or inconsistent');
  }
  if(value.presence==='partial-current-receipt'){
    if(
      !['partial','conflicting'].includes(value.receipt_status)
      ||[
        value.existing_receipt_digest,value.existing_profile_id,value.existing_release_id,
        value.existing_kernel_version,value.existing_source_revision
      ].some(item=>item===null)
      ||value.legacy_proof_state_detected
    ) throw new ValidationError('Partial install receipt state is incomplete or inconsistent');
  }
  if(value.presence==='legacy-proof-markers'){
    if(!value.legacy_proof_state_detected){
      throw new ValidationError('Legacy proof marker state must be explicit');
    }
    if(value.receipt_status==='complete'){
      throw new ValidationError('Legacy proof markers cannot claim a current complete receipt');
    }
  }
  if(value.presence==='unknown'){
    if(
      value.receipt_status!=='unknown'
      ||value.health!=='unknown'
      ||value.legacy_proof_state_detected
      ||!allExistingNull
    ){
      throw new ValidationError('Unknown install state must remain unknown');
    }
  }
  return value;
}

function existingIdentityMatchesTarget(observed,hostPlan,releaseVerification){
  return observed.existing_profile_id===hostPlan.profile_id
    &&observed.existing_release_id===releaseVerification.release_id
    &&observed.existing_kernel_version===releaseVerification.kernel_version
    &&observed.existing_source_revision===releaseVerification.source_revision;
}

function upgradePreparationAllowed(observed,releaseVerification){
  const minimum=compareVersions(
    observed.existing_kernel_version,
    releaseVerification.data_compatibility.minimum_compatible_kernel
  );
  return minimum!==null
    &&minimum>=0
    &&DIRECT_UPGRADE_POSTURES.has(releaseVerification.data_compatibility.rollback_mode);
}

function expectedPreparationForClassification(classification){
  return {
    absent:'prepare-install',
    'healthy-same':'verify-noop',
    'partial-same':'prepare-repair',
    'conflicting-partial':'stop',
    'newer-or-unknown':'stop',
    'legacy-proof-state':'stop'
  }[classification]??null;
}

function compareVersions(left,right){
  const a=parseSemver(left);
  const b=parseSemver(right);
  if(!a||!b) return null;
  for(const key of ['major','minor','patch']){
    if(a[key]<b[key]) return -1;
    if(a[key]>b[key]) return 1;
  }
  return comparePrerelease(a.prerelease,b.prerelease);
}

function parseSemver(value){
  if(typeof value!=='string') return null;
  const match=/^(\d+)\.(\d+)\.(\d+)(?:-([A-Za-z0-9.-]+))?$/.exec(value);
  if(!match) return null;
  return {
    major:Number(match[1]),minor:Number(match[2]),patch:Number(match[3]),
    prerelease:match[4]?match[4].split('.'):[]
  };
}

function comparePrerelease(a,b){
  if(a.length===0&&b.length===0) return 0;
  if(a.length===0) return 1;
  if(b.length===0) return -1;
  const length=Math.max(a.length,b.length);
  for(let index=0;index<length;index+=1){
    if(index>=a.length) return -1;
    if(index>=b.length) return 1;
    const left=a[index];
    const right=b[index];
    if(left===right) continue;
    const leftNumeric=/^\d+$/.test(left);
    const rightNumeric=/^\d+$/.test(right);
    if(leftNumeric&&rightNumeric) return Number(left)<Number(right)?-1:1;
    if(leftNumeric!==rightNumeric) return leftNumeric?-1:1;
    return left<right?-1:1;
  }
  return 0;
}

function isPrivateBirthArtifact(artifact){
  return PRIVATE_BIRTH_TOKEN.test(artifact.artifact_id)
    ||PRIVATE_BIRTH_TOKEN.test(artifact.locator??'');
}

function canonicalTime(value,label){
  if(typeof value!=='string') throw new ValidationError(`${label} must be a canonical UTC timestamp`);
  const parsed=Date.parse(value);
  if(!Number.isFinite(parsed)||new Date(parsed).toISOString()!==value){
    throw new ValidationError(`${label} must be a canonical UTC timestamp`);
  }
  return parsed;
}

function nullableSha(value,label){if(value!==null&&(!SHA.test(value)))throw new ValidationError(`${label} is invalid`);}
function nullableId(value,label){if(value!==null&&(!ID.test(value)))throw new ValidationError(`${label} is invalid`);}
function nullableVersion(value,label){if(value!==null&&(!VERSION.test(value)))throw new ValidationError(`${label} is invalid`);}
function nullableRevision(value,label){if(value!==null&&(!REVISION.test(value)))throw new ValidationError(`${label} is invalid`);}

function stringArray(value,label,{min=0,max=64,itemMax=512}={}){
  plainArray(value,label,{min,max});
  const seen=new Set();
  for(const item of value){
    if(typeof item!=='string'||item.length<1||item.length>itemMax||seen.has(item)){
      throw new ValidationError(`${label} contains invalid or duplicate values`);
    }
    seen.add(item);
  }
  return value;
}

function plainArray(value,label,{min=0,max=64}={}){
  if(utilTypes.isProxy(value)) throw new ValidationError(`${label} cannot be a Proxy`);
  if(
    !Array.isArray(value)
    ||Object.getPrototypeOf(value)!==Array.prototype
    ||value.length<min
    ||value.length>max
  ) throw new ValidationError(`${label} has invalid cardinality or prototype`);
  const allowed=new Set(['length']);
  for(let index=0;index<value.length;index+=1){
    const key=String(index);
    allowed.add(key);
    const descriptor=Object.getOwnPropertyDescriptor(value,key);
    if(!descriptor?.enumerable||!Object.hasOwn(descriptor,'value')){
      throw new ValidationError(`${label} must be dense enumerable data`);
    }
  }
  for(const key of Reflect.ownKeys(value)){
    if(typeof key==='symbol'||!allowed.has(key)){
      throw new ValidationError(`${label} contains custom array state`);
    }
  }
  return value;
}

function exactObject(value,label,keys){
  if(utilTypes.isProxy(value)) throw new ValidationError(`${label} cannot be a Proxy`);
  if(!value||typeof value!=='object'||Array.isArray(value)){
    throw new ValidationError(`${label} must be an object`);
  }
  const prototype=Object.getPrototypeOf(value);
  if(prototype!==Object.prototype&&prototype!==null){
    throw new ValidationError `${label} must be a plain object`);
  }
  const actual=Reflect.ownKeys(value);
  if(actual.some(key=>typeof key==='symbol')){
    throw new ValidationError `${label} cannot contain symbol keys`);
  }
  for(const key of actual){
    const descriptor=Object.getOwnPropertyDescriptor(value,key);
    if(!descriptor?.enumerable||!Object.hasOwn(descriptor,'value')){
      throw new ValidationError(`${label} must contain only enumerable data properties`);
    }
  }
  if(actual.map(String).sort().join(',')!==[...keys].sort().join(',')){
    throw new ValidationError `${label} key inventory drifted`);
  }
  return value;
}

function deepFreeze(value){
  if(value&&typeof value==='object'&&!Object.isFrozen(value)){
    for(const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}
