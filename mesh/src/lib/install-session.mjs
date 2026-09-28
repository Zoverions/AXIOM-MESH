import { types as utilTypes } from 'node:util';

import { digestObject, ValidationError } from './canonical.mjs';
import { validateHostInstallPlan } from './host-install-plan.mjs';
import { verifyInstallReleaseManifest, verifyInstallReleaseArtifact } from './install-release-manifest.mjs';

export const INSTALL_SESSION_CANDIDATE_SCHEMA='axiom-install-session-candidate.v0';
export const INSTALLED_STATE_OBSERVATION_SCHEMA='axiom-installed-state-observation.v0';
export const INSTALL_SESSION_DECISION_SCHEMA='axiom-install-session-decision.v0';

const ID=/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,191}$/;
const SHA=/^[a-f0-9]{64}$/;
const REVISION=/^[a-f0-9]{40}$/;
const PROFILE_IDS=new Set(['personal-local','infrastructure-node']);
const RUNTIME_STRATEGIES=new Set(['oci','source']);
const FACT_SOURCES=new Set(['live-local-observation','supplied-evidence','synthetic-test']);
const RECORD_STATES=new Set(['absent','complete','partial','failed','unknown']);
const RELATIONS=new Set(['absent','same','ancestor','descendant','diverged','unknown']);
const SECRET_STATES=new Set(['absent','complete','partial','unknown']);
const DATA_STATES=new Set(['absent','present','unknown']);
const SERVICE_STATES=new Set(['absent','stopped','running','degraded','unknown']);
const READINESS_STATES=new Set(['not-checked','ready','not-ready','unknown']);
const ZERO_SHA='0'.repeat(64);
const ROLLBACK_MODES=new Set(['in-place-compatible','backup-restore-required','migration-specific']);
const PRIVATE_BIRTH_TOKEN=/(^|[._:/-])(birth|genesis|spark)([._:/-]|$)/i;
const DECISIONS=new Set([
  'INSTALL_REVIEW',
  'VERIFY_NOOP',
  'REPAIR_REVIEW',
  'UPGRADE_REVIEW',
  'RECOVERY_REVIEW',
  'STOP_NONLIVE_PLAN',
  'STOP_NONLIVE_OBSERVATION',
  'STOP_HOST_BLOCKED',
  'STOP_LEGACY_PROOF_STATE',
  'STOP_UPGRADE_UNPROVEN',
  'STOP_PARTIAL_SECRET_STATE',
  'STOP_NEWER_PRESENT',
  'STOP_DIVERGED',
  'STOP_CONFLICT',
  'STOP_UNCERTAIN'
]);

export function validateInstallSessionCandidate(d){
  exactObject(d,'Install session candidate',[
    'schema','version','status','session_id','profile_id','runtime_strategy',
    'desired_release_id','desired_source_revision','host_plan_digest',
    'desired_kernel_version','minimum_compatible_kernel','rollback_mode','host_candidate_compatible',
    'host_plan_facts_source','release_manifest_digest','artifact_sha256s',
    'artifact_evidence_refs','requested_at','max_observation_age_seconds',
    'host_mutation_authorized','authority_effect','network_effect',
    'runtime_activation'
  ]);
  if(
    d.schema!==INSTALL_SESSION_CANDIDATE_SCHEMA
    ||d.version!==0
    ||d.status!=='inert-install-session-candidate'
    ||d.host_mutation_authorized!==false
    ||d.authority_effect!=='none'
    ||d.network_effect!=='none'
    ||d.runtime_activation!==false
  ) throw new ValidationError('Install session candidate activation boundary is invalid');
  ident(d.session_id,'session_id');
  en(d.profile_id,PROFILE_IDS,'profile_id');
  en(d.runtime_strategy,RUNTIME_STRATEGIES,'runtime_strategy');
  ident(d.desired_release_id,'desired_release_id');
  version(d.desired_kernel_version,'desired_kernel_version');
  version(d.minimum_compatible_kernel,'minimum_compatible_kernel');
  en(d.rollback_mode,ROLLBACK_MODES,'rollback_mode');
  if(typeof d.host_candidate_compatible!=='boolean')throw new ValidationError('host_candidate_compatible must be boolean');
  revision(d.desired_source_revision,'desired_source_revision');
  sha(d.host_plan_digest,'host_plan_digest');
  en(d.host_plan_facts_source,FACT_SOURCES,'host_plan_facts_source');
  sha(d.release_manifest_digest,'release_manifest_digest');
  stringArray(d.artifact_sha256s,'artifact_sha256s',{min:1,max:128,itemMax:64,validator:sha});
  requireSortedUnique(d.artifact_sha256s,'artifact_sha256s');
  stringArray(d.artifact_evidence_refs,'artifact_evidence_refs',{min:1,max:128,itemMax:512});
  date(d.requested_at,'requested_at');
  integer(d.max_observation_age_seconds,'max_observation_age_seconds',1,3600);
  return Object.freeze({
    valid:true,
    candidate_digest:digestObject(d),
    host_mutation_authorized:false,
    authority_effect:'none',
    network_effect:'none',
    runtime_activation:false
  });
}
export function installSessionCandidateDigest(d){validateInstallSessionCandidate(d);return digestObject(d);}

export function validateInstalledStateObservation(d){
  exactObject(d,'Installed state observation',[
    'schema','version','status','observation_id','session_id','observed_at',
    'observation_source','legacy_proof_state_detected','installed_kernel_version',
    'install_record_state','installed_profile_id','installed_release_id',
    'installed_source_revision','installed_host_plan_digest',
    'installed_release_manifest_digest','release_relation_to_desired',
    'relation_evidence_ref','secret_state','data_state','service_state',
    'readiness_state','evidence_refs','observation_digest',
    'authority_effect','mutation_effect','runtime_activation'
  ]);
  if(
    d.schema!==INSTALLED_STATE_OBSERVATION_SCHEMA
    ||d.version!==0
    ||d.status!=='inert-installed-state-observation'
    ||d.authority_effect!=='none'
    ||d.mutation_effect!=='none'
    ||d.runtime_activation!==false
  ) throw new ValidationError('Installed state observation activation boundary is invalid');
  ident(d.observation_id,'observation_id');
  ident(d.session_id,'session_id');
  date(d.observed_at,'observed_at');
  en(d.observation_source,FACT_SOURCES,'observation_source');
  if(typeof d.legacy_proof_state_detected!=='boolean')throw new ValidationError('legacy_proof_state_detected must be boolean');
  if(d.installed_kernel_version!==null)version(d.installed_kernel_version,'installed_kernel_version');
  en(d.install_record_state,RECORD_STATES,'install_record_state');
  nullableEnum(d.installed_profile_id,PROFILE_IDS,'installed_profile_id');
  nullableId(d.installed_release_id,'installed_release_id');
  nullableRevision(d.installed_source_revision,'installed_source_revision');
  nullableSha(d.installed_host_plan_digest,'installed_host_plan_digest');
  nullableSha(d.installed_release_manifest_digest,'installed_release_manifest_digest');
  en(d.release_relation_to_desired,RELATIONS,'release_relation_to_desired');
  nullableText(d.relation_evidence_ref,'relation_evidence_ref',512);
  en(d.secret_state,SECRET_STATES,'secret_state');
  en(d.data_state,DATA_STATES,'data_state');
  en(d.service_state,SERVICE_STATES,'service_state');
  en(d.readiness_state,READINESS_STATES,'readiness_state');
  stringArray(d.evidence_refs,'evidence_refs',{min:1,max:128,itemMax:512});
  sha(d.observation_digest,'observation_digest');

  if(d.install_record_state==='absent'){
    if(
      d.installed_kernel_version!==null
      ||d.installed_profile_id!==null
      ||d.installed_release_id!==null
      ||d.installed_source_revision!==null
      ||d.installed_host_plan_digest!==null
      ||d.installed_release_manifest_digest!==null
      ||d.release_relation_to_desired!=='absent'
      ||d.relation_evidence_ref!==null
    ) throw new ValidationError('Absent install record cannot carry installed identity');
    if(d.readiness_state==='ready') throw new ValidationError('Absent install record cannot claim readiness');
  }else if(d.install_record_state==='complete'){
    if(
      d.installed_kernel_version===null
      ||d.installed_profile_id===null
      ||d.installed_release_id===null
      ||d.installed_source_revision===null
      ||d.installed_host_plan_digest===null
      ||d.installed_release_manifest_digest===null
      ||d.release_relation_to_desired==='absent'
    ) throw new ValidationError('Complete install record requires installed identity');
    if(d.secret_state!=='complete'||d.data_state!=='present'){
      throw new ValidationError('Complete install record requires complete secrets and present data');
    }
  }
  if(d.readiness_state==='ready'&&d.service_state!=='running'){
    throw new ValidationError('Ready installed state requires running services');
  }
  if(
    ['ancestor','descendant','diverged'].includes(d.release_relation_to_desired)
    &&d.relation_evidence_ref===null
  ) throw new ValidationError('Nontrivial release relation requires evidence');
  if(computeInstalledStateObservationDigest(d)!==d.observation_digest){
    throw new ValidationError('Installed state observation digest mismatch');
  }
  return Object.freeze({
    valid:true,
    observation_digest:d.observation_digest,
    authority_effect:'none',
    mutation_effect:'none',
    runtime_activation:false
  });
}

export function computeInstalledStateObservationDigest(d){
  exactObject(d,'Installed state observation digest input',[
    'schema','version','status','observation_id','session_id','observed_at',
    'observation_source','legacy_proof_state_detected','installed_kernel_version',
    'install_record_state','installed_profile_id','installed_release_id',
    'installed_source_revision','installed_host_plan_digest',
    'installed_release_manifest_digest','release_relation_to_desired',
    'relation_evidence_ref','secret_state','data_state','service_state',
    'readiness_state','evidence_refs','observation_digest',
    'authority_effect','mutation_effect','runtime_activation'
  ]);
  return digestObject({...d,observation_digest:'0'.repeat(64)});
}
export function installedStateObservationDigest(d){validateInstalledStateObservation(d);return d.observation_digest;}

// Structural policy evaluation only. This helper does not authenticate supplied
// release/artifact evidence; use createInstallSession for verified input construction.
export function assessInstallSession(candidate,observation,{evaluatedAt}={}){
  validateInstallSessionCandidate(candidate);
  validateInstalledStateObservation(observation);
  const now=date(evaluatedAt,'evaluatedAt');
  const requested=date(candidate.requested_at,'candidate.requested_at');
  const observed=date(observation.observed_at,'observation.observed_at');
  const candidateDigest=installSessionCandidateDigest(candidate);
  const observationDigest=installedStateObservationDigest(observation);

  if(observation.session_id!==candidate.session_id){
    return decision('STOP_CONFLICT',['session-id-mismatch'],candidateDigest,observationDigest);
  }
  if(now<requested){
    return decision('STOP_UNCERTAIN',['evaluation-predates-request'],candidateDigest,observationDigest);
  }
  if(observed>now){
    return decision('STOP_UNCERTAIN',['observation-from-future'],candidateDigest,observationDigest);
  }
  if(observed<requested){
    return decision('STOP_UNCERTAIN',['observation-predates-request'],candidateDigest,observationDigest);
  }
  if((now-observed)/1000>candidate.max_observation_age_seconds){
    return decision('STOP_UNCERTAIN',['observation-stale'],candidateDigest,observationDigest);
  }
  if(candidate.host_plan_facts_source!=='live-local-observation'){
    return decision('STOP_NONLIVE_PLAN',['host-plan-not-live-local'],candidateDigest,observationDigest);
  }
  if(observation.observation_source!=='live-local-observation'){
    return decision('STOP_NONLIVE_OBSERVATION',['install-observation-not-live-local'],candidateDigest,observationDigest);
  }
  if(!candidate.host_candidate_compatible){
    return decision('STOP_HOST_BLOCKED',['host-plan-has-blockers'],candidateDigest,observationDigest);
  }
  if(observation.legacy_proof_state_detected){
    return decision('STOP_LEGACY_PROOF_STATE',['legacy-proof-is-not-current-install-identity'],candidateDigest,observationDigest);
  }
  if(
    observation.install_record_state==='unknown'
    ||observation.secret_state==='unknown'
    ||observation.data_state==='unknown'
    ||observation.service_state==='unknown'
    ||observation.readiness_state==='unknown'
    ||observation.release_relation_to_desired==='unknown'
  ){
    return decision('STOP_UNCERTAIN',['installed-state-unknown'],candidateDigest,observationDigest);
  }
  if(observation.secret_state==='partial'){
    return decision('STOP_PARTIAL_SECRET_STATE',['partial-secret-state'],candidateDigest,observationDigest);
  }

  if(observation.install_record_state==='absent'){
    if(!['absent','stopped'].includes(observation.service_state)){
      return decision('STOP_CONFLICT',['services-present-without-install-record'],candidateDigest,observationDigest);
    }
    if(observation.data_state==='present'||observation.secret_state==='complete'){
      return decision('RECOVERY_REVIEW',['retained-state-without-install-record'],candidateDigest,observationDigest);
    }
    if(observation.data_state==='absent'&&observation.secret_state==='absent'){
      return decision('INSTALL_REVIEW',['clean-absent-state'],candidateDigest,observationDigest);
    }
    return decision('STOP_UNCERTAIN',['absent-state-not-proven-clean'],candidateDigest,observationDigest);
  }

  const identity=installedIdentityReasons(candidate,observation);
  const versionRelation=observation.installed_kernel_version===null?null:
    compareVersions(observation.installed_kernel_version,candidate.desired_kernel_version);
  if(observation.release_relation_to_desired==='descendant'||versionRelation===1){
    return decision('STOP_NEWER_PRESENT',['installed-release-newer-than-desired'],candidateDigest,observationDigest);
  }
  if(observation.release_relation_to_desired==='diverged'){
    return decision('STOP_DIVERGED',['installed-release-diverged'],candidateDigest,observationDigest);
  }

  if(observation.install_record_state==='complete'){
    if(observation.release_relation_to_desired==='same'){
      if(identity.length){
        return decision('STOP_CONFLICT',identity,candidateDigest,observationDigest);
      }
      if(
        observation.readiness_state==='ready'
        &&observation.service_state==='running'
        &&observation.secret_state==='complete'
        &&observation.data_state==='present'
      ){
        return decision('VERIFY_NOOP',['exact-release-already-ready'],candidateDigest,observationDigest);
      }
      return decision('REPAIR_REVIEW',['exact-release-not-ready'],candidateDigest,observationDigest);
    }
    if(observation.release_relation_to_desired==='ancestor'){
      if(observation.installed_profile_id!==candidate.profile_id){
        return decision('STOP_CONFLICT',['installed-profile-mismatch'],candidateDigest,observationDigest);
      }
      const minimum=compareVersions(observation.installed_kernel_version,candidate.minimum_compatible_kernel);
      if(versionRelation!==-1||minimum<0||candidate.rollback_mode==='migration-specific'
        ||observation.readiness_state!=='ready'||observation.service_state!=='running'){
        return decision('STOP_UPGRADE_UNPROVEN',['upgrade-compatibility-or-health-not-established'],candidateDigest,observationDigest);
      }
      return decision('UPGRADE_REVIEW',['installed-release-is-ancestor'],candidateDigest,observationDigest);
    }
    return decision('STOP_CONFLICT',['complete-record-relation-invalid'],candidateDigest,observationDigest);
  }

  if(['partial','failed'].includes(observation.install_record_state)){
    if(observation.release_relation_to_desired==='same'&&identity.length===0){
      return decision('REPAIR_REVIEW',['same-release-incomplete-install'],candidateDigest,observationDigest);
    }
    return decision('RECOVERY_REVIEW',['incomplete-or-failed-install-requires-recovery-review'],candidateDigest,observationDigest);
  }

  return decision('STOP_UNCERTAIN',['unhandled-installed-state'],candidateDigest,observationDigest);
}

export function validateInstallSessionDecision(d){
  exactObject(d,'Install session decision',[
    'schema','version','status','decision','reasons','candidate_digest',
    'observation_digest','decision_digest','host_mutation_authorized',
    'authority_effect','network_effect','runtime_activation'
  ]);
  if(
    d.schema!==INSTALL_SESSION_DECISION_SCHEMA
    ||d.version!==0
    ||d.status!=='inert-install-session-decision'
    ||d.host_mutation_authorized!==false
    ||d.authority_effect!=='none'
    ||d.network_effect!=='none'
    ||d.runtime_activation!==false
  ) throw new ValidationError('Install session decision activation boundary is invalid');
  en(d.decision,DECISIONS,'decision');
  stringArray(d.reasons,'reasons',{min:1,max:16,itemMax:128});
  sha(d.candidate_digest,'candidate_digest');
  sha(d.observation_digest,'observation_digest');
  sha(d.decision_digest,'decision_digest');
  if(computeInstallSessionDecisionDigest(d)!==d.decision_digest){
    throw new ValidationError('Install session decision digest mismatch');
  }
  return Object.freeze({
    valid:true,
    decision:d.decision,
    decision_digest:d.decision_digest,
    host_mutation_authorized:false,
    authority_effect:'none',
    network_effect:'none',
    runtime_activation:false
  });
}

export function computeInstallSessionDecisionDigest(d){
  exactObject(d,'Install session decision digest input',[
    'schema','version','status','decision','reasons','candidate_digest',
    'observation_digest','decision_digest','host_mutation_authorized',
    'authority_effect','network_effect','runtime_activation'
  ]);
  return digestObject({...d,decision_digest:ZERO_SHA});
}

function installedIdentityReasons(candidate,observation){
  const reasons=[];
  if(observation.installed_kernel_version!==candidate.desired_kernel_version) reasons.push('installed-kernel-version-mismatch');
  if(observation.installed_profile_id!==candidate.profile_id) reasons.push('installed-profile-mismatch');
  if(observation.installed_release_id!==candidate.desired_release_id) reasons.push('installed-release-id-mismatch');
  if(observation.installed_source_revision!==candidate.desired_source_revision) reasons.push('installed-source-revision-mismatch');
  if(observation.installed_host_plan_digest!==candidate.host_plan_digest) reasons.push('installed-host-plan-digest-mismatch');
  if(observation.installed_release_manifest_digest!==candidate.release_manifest_digest) reasons.push('installed-release-manifest-digest-mismatch');
  return reasons;
}

function decision(value,reasons,candidateDigest,observationDigest){
  const d={
    schema:INSTALL_SESSION_DECISION_SCHEMA,
    version:0,
    status:'inert-install-session-decision',
    decision:value,
    reasons:[...reasons],
    candidate_digest:candidateDigest,
    observation_digest:observationDigest,
    decision_digest:ZERO_SHA,
    host_mutation_authorized:false,
    authority_effect:'none',
    network_effect:'none',
    runtime_activation:false
  };
  d.decision_digest=computeInstallSessionDecisionDigest(d);
  validateInstallSessionDecision(d);
  return deepFreeze(d);
}

function exactObject(value,label,keys){
  if(utilTypes.isProxy(value)) throw new ValidationError(`${label} cannot be a Proxy`);
  if(!value||typeof value!=='object'||Array.isArray(value)) throw new ValidationError(`${label} must be an object`);
  const proto=Object.getPrototypeOf(value);
  if(proto!==Object.prototype&&proto!==null) throw new ValidationError(`${label} must be a plain object`);
  const actual=Reflect.ownKeys(value);
  if(actual.some(key=>typeof key==='symbol')) throw new ValidationError(`${label} cannot contain symbol keys`);
  for(const key of actual){
    const desc=Object.getOwnPropertyDescriptor(value,key);
    if(!desc?.enumerable||!Object.hasOwn(desc,'value')) throw new ValidationError(`${label} must contain only enumerable data properties`);
  }
  if(actual.map(String).sort().join(',')!==[...keys].sort().join(',')) throw new ValidationError(`${label} fields are invalid`);
}
function ident(v,label){if(typeof v!=='string'||!ID.test(v))throw new ValidationError(`${label} is invalid`);}
function nullableId(v,label){if(v!==null)ident(v,label);}
function sha(v,label){if(typeof v!=='string'||!SHA.test(v))throw new ValidationError(`${label} must be a lowercase sha256 digest`);}
function nullableSha(v,label){if(v!==null)sha(v,label);}
function revision(v,label){if(typeof v!=='string'||!REVISION.test(v))throw new ValidationError(`${label} must be a 40-hex revision`);}
function nullableRevision(v,label){if(v!==null)revision(v,label);}
function en(v,set,label){if(!set.has(v))throw new ValidationError(`${label} is invalid`);}
function nullableEnum(v,set,label){if(v!==null)en(v,set,label);}
function integer(v,label,min,max){if(!Number.isSafeInteger(v)||v<min||v>max)throw new ValidationError(`${label} is outside the allowed range`);}
function date(v,label){if(typeof v!=='string')throw new ValidationError(`${label} must be a timestamp`);const t=new Date(v);if(!Number.isFinite(t.valueOf())||t.toISOString()!==v)throw new ValidationError(`${label} must be canonical UTC ISO-8601`);return t;}
function nullableText(v,label,max){if(v===null)return null;if(typeof v!=='string'||v.trim().length<1||v.length>max)throw new ValidationError(`${label} is invalid`);return v;}
function stringArray(v,label,{min,max,itemMax,validator=null}){
  if(utilTypes.isProxy(v)||!Array.isArray(v)||Object.getPrototypeOf(v)!==Array.prototype||v.length<min||v.length>max)throw new ValidationError(`${label} has invalid cardinality or prototype`);
  const allowed=new Set(['length']);
  const seen=new Set();
  for(let i=0;i<v.length;i+=1){
    const key=String(i);allowed.add(key);
    const desc=Object.getOwnPropertyDescriptor(v,key);
    if(!desc?.enumerable||!Object.hasOwn(desc,'value'))throw new ValidationError(`${label} must be dense enumerable data`);
    const item=desc.value;
    if(typeof item!=='string'||item.length<1||item.length>itemMax||seen.has(item))throw new ValidationError(`${label} contains invalid or duplicate values`);
    if(validator)validator(item,`${label} item`);
    seen.add(item);
  }
  for(const key of Reflect.ownKeys(v))if(typeof key==='symbol'||!allowed.has(key))throw new ValidationError(`${label} contains custom array state`);
}
function requireSortedUnique(v,label){for(let i=1;i<v.length;i+=1)if(v[i-1]>=v[i])throw new ValidationError(`${label} must be strictly sorted`);}
function deepFreeze(v){if(v&&typeof v==='object'&&!Object.isFrozen(v)){for(const child of Object.values(v))deepFreeze(child);Object.freeze(v);}return v;}

// Only this constructor derives session evidence from the original signed release
// and exact bytes. Returned JSON is a report, not a portable trust credential.
// The caller supplies trusted signer custody and observation provenance separately.
export function createInstallSession(input){
  exactObject(input,'Install session constructor',[
    'sessionId','hostPlan','releasePackage','trustedSigners','artifactBytes',
    'observedInstall','requestedAt','evaluatedAt','maxObservationAgeSeconds'
  ]);
  const sessionId=snapshotData(input.sessionId);
  const hostPlan=snapshotData(input.hostPlan);
  const releasePackage=snapshotData(input.releasePackage);
  const trustedSigners=snapshotData(input.trustedSigners);
  const observation=snapshotData(input.observedInstall);
  const requestedAt=snapshotData(input.requestedAt);
  const evaluatedAt=snapshotData(input.evaluatedAt);
  const maxObservationAgeSeconds=snapshotData(input.maxObservationAgeSeconds);
  ident(sessionId,'sessionId');
  date(requestedAt,'requestedAt');
  date(evaluatedAt,'evaluatedAt');
  integer(maxObservationAgeSeconds,'maxObservationAgeSeconds',1,3600);

  const byteEntries=plainRecordEntries(input.artifactBytes,'artifactBytes');
  if(byteEntries.length<1||byteEntries.length>128)throw new ValidationError('artifactBytes cardinality is invalid');
  const bytesById=new Map(byteEntries.map(([id,bytes])=>{
    ident(id,'artifact id');
    return [id,snapshotBytes(bytes)];
  }));
  const host=validateHostInstallPlan(hostPlan);
  // Do not accept callbacks, reported verification flags, self-trust, or caller
  // overrides of the repository's current control-plane defaults here.
  const verified=verifyInstallReleaseManifest(releasePackage,{trustedSigners,evaluatedAt});
  const manifest=releasePackage.manifest;
  if(!verified.install_profiles.includes(host.profile_id)||manifest.kernel_version!==hostPlan.kernel_version){
    throw new ValidationError('Verified release does not match the host profile and kernel');
  }
  for(const artifact of manifest.artifacts){
    if(PRIVATE_BIRTH_TOKEN.test(artifact.artifact_id)||PRIVATE_BIRTH_TOKEN.test(artifact.locator)){
      throw new ValidationError('Standard install inventory cannot contain Birth/Genesis/Spark material');
    }
  }
  const required=manifest.artifacts.filter(item=>item.required_for_profiles.includes(host.profile_id));
  const requiredIds=new Set(required.map(item=>item.artifact_id));
  if(bytesById.size!==requiredIds.size||[...bytesById.keys()].some(id=>!requiredIds.has(id))){
    throw new ValidationError('Artifact bytes must match every required target-profile artifact exactly');
  }
  const artifactProofs=required.map(artifact=>{
    const proof=verifyInstallReleaseArtifact(artifact,bytesById.get(artifact.artifact_id));
    return {artifact_id:proof.artifact_id,artifact_sha256:proof.sha256,byte_length:proof.byte_length};
  }).sort((a,b)=>a.artifact_id<b.artifact_id?-1:a.artifact_id>b.artifact_id?1:0);
  const candidate={
    schema:INSTALL_SESSION_CANDIDATE_SCHEMA,version:0,status:'inert-install-session-candidate',
    session_id:sessionId,profile_id:host.profile_id,runtime_strategy:host.runtime_strategy,
    desired_release_id:verified.release_id,desired_source_revision:verified.source_revision,
    desired_kernel_version:verified.kernel_version,
    minimum_compatible_kernel:manifest.data_compatibility.minimum_compatible_kernel,
    rollback_mode:manifest.data_compatibility.rollback_mode,
    host_candidate_compatible:host.host_candidate_compatible,
    host_plan_digest:host.plan_digest,host_plan_facts_source:hostPlan.host_facts_source,
    release_manifest_digest:verified.manifest_digest,
    artifact_sha256s:[...new Set(artifactProofs.map(item=>item.artifact_sha256))].sort(),
    artifact_evidence_refs:artifactProofs.map(item=>`verified-bytes:${item.artifact_id}:${item.artifact_sha256}`),
    requested_at:requestedAt,max_observation_age_seconds:maxObservationAgeSeconds,
    host_mutation_authorized:false,authority_effect:'none',network_effect:'none',runtime_activation:false
  };
  const evaluated=assessInstallSession(candidate,observation,{evaluatedAt});
  const result={
    schema:'axiom-install-session.v0',version:0,status:'inert-verified-input-session',
    candidate,decision:evaluated,artifact_proofs:artifactProofs,
    release_signer_key_id:verified.signer_key_id,evaluated_at:evaluatedAt,
    host_mutation_authorized:false,credential_effect:'none',service_start_effect:'none',
    authority_effect:'none',network_effect:'none',runtime_activation:false,session_digest:ZERO_SHA
  };
  result.session_digest=digestObject(result);
  return deepFreeze(result);
}

function plainRecordEntries(value,label){
  if(utilTypes.isProxy(value))throw new ValidationError(`${label} cannot be a Proxy`);
  if(!value||typeof value!=='object'||Array.isArray(value)
    ||![Object.prototype,null].includes(Object.getPrototypeOf(value))){
    throw new ValidationError(`${label} must be a plain data record`);
  }
  return Reflect.ownKeys(value).map(key=>{
    const property=Object.getOwnPropertyDescriptor(value,key);
    if(typeof key!=='string'||!property?.enumerable||!Object.hasOwn(property,'value')){
      throw new ValidationError(`${label} requires enumerable data properties`);
    }
    return [key,property.value];
  });
}

function snapshotData(value,depth=0,seen=new Set()){
  if(depth>32)throw new ValidationError('Install input data nesting exceeds limit');
  if(value===null||typeof value==='boolean'||typeof value==='string')return value;
  if(typeof value==='number'&&Number.isFinite(value))return value;
  if(typeof value!=='object')throw new ValidationError('Install input must contain plain data');
  if(utilTypes.isProxy(value))throw new ValidationError('Install input cannot be a Proxy');
  if(seen.has(value))throw new ValidationError('Install input cannot contain cyclic data');
  seen.add(value);
  let result;
  if(Array.isArray(value)){
    if(Object.getPrototypeOf(value)!==Array.prototype||value.length>4096){
      throw new ValidationError('Install input array prototype or cardinality is invalid');
    }
    const keys=Reflect.ownKeys(value);
    if(keys.length!==value.length+1)throw new ValidationError('Install input array must be dense plain data');
    result=[];
    for(let i=0;i<value.length;i++){
      const property=Object.getOwnPropertyDescriptor(value,String(i));
      if(!property?.enumerable||!Object.hasOwn(property,'value'))throw new ValidationError('Install input array requires data properties');
      result.push(snapshotData(property.value,depth+1,seen));
    }
  }else{
    result=Object.create(null);
    for(const [key,child] of plainRecordEntries(value,'Install input')){
      result[key]=snapshotData(child,depth+1,seen);
    }
  }
  seen.delete(value);
  return result;
}

function snapshotBytes(value){
  if(utilTypes.isProxy(value)||!utilTypes.isUint8Array(value)){
    throw new ValidationError('Artifact bytes must be a Buffer or Uint8Array');
  }
  // Intrinsic getters ignore caller-defined accessors on the view. Copy the
  // actual window, not an iterable supplied by the caller. Shared storage is
  // rejected because another agent/thread could change it during verification.
  const prototype=Object.getPrototypeOf(Uint8Array.prototype);
  const get=name=>Object.getOwnPropertyDescriptor(prototype,name).get.call(value);
  const buffer=get('buffer');
  if(utilTypes.isSharedArrayBuffer(buffer))throw new ValidationError('Shared artifact byte storage is not accepted');
  return Buffer.from(new Uint8Array(buffer,get('byteOffset'),get('byteLength')));
}

function version(value,label){
  if(typeof value!=='string'||value.length>128||!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/.test(value)){
    throw new ValidationError(`${label} version is invalid or ambiguous`);
  }
  const prerelease=value.split('-').slice(1).join('-');
  if(prerelease.split('.').some(part=>/^0\d+$/.test(part)))throw new ValidationError(`${label} version has an ambiguous numeric prerelease`);
}

function compareVersions(left,right){
  version(left,'left');version(right,'right');
  const split=value=>{const i=value.indexOf('-');return i<0?[value,[]]:[value.slice(0,i),value.slice(i+1).split('.')];};
  const [ac,ap]=split(left),[bc,bp]=split(right);
  const a=ac.split('.').map(BigInt),b=bc.split('.').map(BigInt);
  for(let i=0;i<3;i++){if(a[i]!==b[i])return a[i]<b[i]?-1:1;}
  if(!ap.length||!bp.length)return ap.length===bp.length?0:ap.length?-1:1;
  for(let i=0;i<Math.max(ap.length,bp.length);i++){
    if(i>=ap.length)return -1;if(i>=bp.length)return 1;
    if(ap[i]===bp[i])continue;
    const an=/^\d+$/.test(ap[i]),bn=/^\d+$/.test(bp[i]);
    if(an&&bn)return BigInt(ap[i])<BigInt(bp[i])?-1:1;
    if(an!==bn)return an?-1:1;
    return ap[i]<bp[i]?-1:1;
  }
  return 0;
}
