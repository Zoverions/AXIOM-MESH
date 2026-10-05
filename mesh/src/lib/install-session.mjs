import { types as utilTypes } from 'node:util';

import { digestObject, ValidationError } from './canonical.mjs';
import { snapshotDelegationPlainData } from './delegation-plain-snapshot.mjs';
import { validateHostInstallPlan } from './host-install-plan.mjs';
import {
  verifyInstallReleaseArtifact,
  verifyInstallReleaseManifest
} from './install-release-manifest.mjs';
import { compareVersion, versionTuple } from './node-runtime-version.mjs';

export const INSTALL_SESSION_CANDIDATE_SCHEMA='axiom-install-session-candidate.v0';
export const INSTALLED_STATE_OBSERVATION_SCHEMA='axiom-installed-state-observation.v0';
export const INSTALL_SESSION_DECISION_SCHEMA='axiom-install-session-decision.v0';
export const VERIFIED_INSTALL_SESSION_SCHEMA='axiom-install-session.v0';

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
const ROLLBACK_MODES=new Set(['in-place-compatible','backup-restore-required','migration-specific']);
const LIVE_LOCAL='live-local-observation';
// Kernel versions: exact semver 2.0 core and pre-release, no build metadata and
// no leading zeros in numeric identifiers, so one string has one meaning. The
// shape is matched linearly and each pre-release identifier is checked on its
// own, so no pattern can backtrack.
const KERNEL_VERSION_SHAPE=/^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?$/;
const PRERELEASE_IDENTIFIER=/^[0-9A-Za-z-]+$/;
const NUMERIC_IDENTIFIER=/^\d+$/;
const CANONICAL_NUMERIC_IDENTIFIER=/^(?:0|[1-9]\d*)$/;
// The one ordered pre-release: exactly `dev.<N>`, N a canonical decimal in
// [0, Number.MAX_SAFE_INTEGER]. N is spelled out digit by digit exactly as each
// core component is in the kernel_version schema pattern (#1925): disjoint
// alternatives, no nested or overlapping quantifier, so matching is linear and
// Number(N) is exact.
const SAFE_INTEGER_SOURCE='(?:0|[1-9]\\d{0,14}|[1-8]\\d{15}|900[0-6]\\d{12}|90070\\d{11}|90071[0-8]\\d{10}|900719[0-8]\\d{9}|9007199[0-1]\\d{8}|90071992[0-4]\\d{7}|900719925[0-3]\\d{6}|9007199254[0-6]\\d{5}|90071992547[0-3]\\d{4}|9007199254740[0-8]\\d{2}|90071992547409[0-8]\\d{1}|900719925474099[0-1])';
const DEV_PRERELEASE=new RegExp(`^dev\\.(${SAFE_INTEGER_SOURCE})$`);
// The standard install inventory never carries Birth/Genesis/Spark material.
const PRIVATE_BIRTH_TOKEN=/(^|[._:/-])(birth|genesis|spark)([._:/-]|$)/i;
const ZERO_SHA='0'.repeat(64);
const DECISIONS=new Set([
  'INSTALL_REVIEW',
  'VERIFY_NOOP',
  'REPAIR_REVIEW',
  'UPGRADE_REVIEW',
  'RECOVERY_REVIEW',
  'STOP_NONLIVE_PLAN',
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
    'desired_release_id','desired_source_revision','desired_kernel_version',
    'minimum_compatible_kernel','rollback_mode','host_candidate_compatible',
    'host_plan_digest',
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
  revision(d.desired_source_revision,'desired_source_revision');
  kernelVersion(d.desired_kernel_version,'desired_kernel_version');
  kernelVersion(d.minimum_compatible_kernel,'minimum_compatible_kernel');
  en(d.rollback_mode,ROLLBACK_MODES,'rollback_mode');
  bool(d.host_candidate_compatible,'host_candidate_compatible');
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
    'schema','version','status','observation_id','session_id','candidate_digest',
    'observed_at','observation_source','legacy_proof_state_detected',
    'installed_kernel_version',
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
  sha(d.candidate_digest,'candidate_digest');
  date(d.observed_at,'observed_at');
  en(d.observation_source,FACT_SOURCES,'observation_source');
  bool(d.legacy_proof_state_detected,'legacy_proof_state_detected');
  if(d.installed_kernel_version!==null) kernelVersion(d.installed_kernel_version,'installed_kernel_version');
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
    // The record is historical; current secret/data state may have degraded.
    // Partial or unknown current state is classified (hard stop); absent is invalid.
    if(d.secret_state==='absent'||d.data_state==='absent'){
      throw new ValidationError('Complete install record cannot carry absent secrets or data');
    }
  }
  if(d.readiness_state==='ready'&&d.service_state!=='running'){
    throw new ValidationError('Ready installed state requires running services');
  }
  if(d.readiness_state==='ready'&&(d.secret_state!=='complete'||d.data_state!=='present')){
    throw new ValidationError('Ready installed state requires complete secrets and present data');
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
    'schema','version','status','observation_id','session_id','candidate_digest',
    'observed_at','observation_source','legacy_proof_state_detected',
    'installed_kernel_version',
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

/**
 * Single inert classifier for a candidate and an installed-state observation.
 * Inputs are snapshotted once (snapshotDelegationPlainData) and only the
 * snapshots are read. The observation must carry this candidate's digest and
 * come from `live-local-observation`; a missing, replayed (bound to another
 * candidate), mismatched, supplied, synthetic or unknown-source observation is
 * a ValidationError, never a decision. Structural evaluation only: it does not
 * authenticate release or artifact evidence (use createInstallSession).
 */
export function assessInstallSession(candidateInput,observationInput,options={}){
  if(
    options===null||typeof options!=='object'||utilTypes.isProxy(options)||Array.isArray(options)
    ||![Object.prototype,null].includes(Object.getPrototypeOf(options))
  ) throw new ValidationError('Install session assessment options must be a plain object');
  const {evaluatedAt}=snapshotDelegationPlainData(options,'Install session assessment options');
  const candidate=snapshotDelegationPlainData(candidateInput,'Install session candidate');
  const observation=snapshotDelegationPlainData(observationInput,'Installed state observation');
  validateInstallSessionCandidate(candidate);
  validateInstalledStateObservation(observation);
  const now=date(evaluatedAt,'evaluatedAt');
  const requested=date(candidate.requested_at,'candidate.requested_at');
  const observed=date(observation.observed_at,'observation.observed_at');
  const candidateDigest=installSessionCandidateDigest(candidate);
  const observationDigest=installedStateObservationDigest(observation);

  // T3: the observation is bound to this exact candidate. T4: it is live-local.
  if(observation.candidate_digest!==candidateDigest){
    throw new ValidationError('Installed state observation is not bound to this install session candidate');
  }
  if(observation.observation_source!==LIVE_LOCAL){
    throw new ValidationError('Installed state observation must come from live-local-observation');
  }

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
  if(candidate.host_candidate_compatible!==true){
    return decision('STOP_HOST_BLOCKED',['host-plan-has-blockers'],candidateDigest,observationDigest);
  }
  if(observation.legacy_proof_state_detected!==false){
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
  // -1 older, 0 equal, 1 newer, null when the order is not established.
  const kernelOrder=observation.installed_kernel_version===null
    ?null
    :compareKernelVersions(observation.installed_kernel_version,candidate.desired_kernel_version);
  if(observation.release_relation_to_desired==='descendant'||kernelOrder===1){
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
      if(
        observation.installed_release_id===candidate.desired_release_id
        ||observation.installed_source_revision===candidate.desired_source_revision
      ){
        return decision('STOP_CONFLICT',['ancestor-claim-matches-desired-identity'],candidateDigest,observationDigest);
      }
      if(observation.installed_profile_id!==candidate.profile_id){
        return decision('STOP_CONFLICT',['installed-profile-mismatch'],candidateDigest,observationDigest);
      }
      // A declared ancestor is only an upgrade candidate when the installed
      // kernel is provably older, meets the signed minimum, the rollback posture
      // is bounded and the installed release is healthy.
      // The one same-core upgrade: X.Y.Z-dev.N to X.Y.Z-dev.M (M > N) or to the
      // bare X.Y.Z. kernelOrder is null only for equal cores with different
      // pre-releases; there, and only there, the dev line orders the upgrade and
      // the signed minimum. Every other path keeps the default order.
      const devUpgrade=kernelOrder===null&&compareKernelVersions(
        observation.installed_kernel_version,candidate.desired_kernel_version,true
      )===-1;
      const upgradeOrder=devUpgrade?-1:kernelOrder;
      const minimumOrder=compareKernelVersions(
        observation.installed_kernel_version,candidate.minimum_compatible_kernel,devUpgrade
      );
      if(
        upgradeOrder!==-1
        ||minimumOrder===null
        ||minimumOrder<0
        ||candidate.rollback_mode==='migration-specific'
        ||observation.readiness_state!=='ready'
        ||observation.service_state!=='running'
      ){
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
    'observation_digest','decision_digest','observation_bound','host_mutation_authorized',
    'authority_effect','network_effect','runtime_activation'
  ]);
  if(
    d.schema!==INSTALL_SESSION_DECISION_SCHEMA
    ||d.version!==0
    ||d.status!=='inert-install-session-decision'
    ||d.observation_bound!==false
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
    'observation_digest','decision_digest','observation_bound','host_mutation_authorized',
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
    observation_bound:false,
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
function bool(v,label){if(typeof v!=='boolean')throw new ValidationError(`${label} must be boolean`);}
function kernelVersion(v,label){
  if(typeof v!=='string'||v.length>128||!KERNEL_VERSION_SHAPE.test(v)){
    throw new ValidationError(`${label} version is invalid or ambiguous`);
  }
  const dash=v.indexOf('-');
  // Core components are ordered as Numbers, so each must be a safe integer;
  // larger values could collapse to the same Number and compare equal.
  for(const component of (dash===-1?v:v.slice(0,dash)).split('.')){
    if(!Number.isSafeInteger(Number(component))){
      throw new ValidationError(`${label} version is invalid or ambiguous`);
    }
  }
  if(dash===-1) return;
  for(const identifier of v.slice(dash+1).split('.')){
    if(
      !PRERELEASE_IDENTIFIER.test(identifier)
      ||(NUMERIC_IDENTIFIER.test(identifier)&&!CANONICAL_NUMERIC_IDENTIFIER.test(identifier))
    ) throw new ValidationError(`${label} version is invalid or ambiguous`);
  }
}
// Core MAJOR.MINOR.PATCH ordering reuses node-runtime-version.mjs; different
// cores are ordered by the core alone. With equal cores, identical
// pre-releases are equal. By default nothing else is ordered: equal cores with
// different pre-releases return null, which every caller treats as "not
// proven". Only with `devLine` (used solely for a same-core dev upgrade, see
// assessInstallSession) is the restricted dev line also ordered:
// X.Y.Z-dev.N < X.Y.Z-dev.M exactly when N < M, and every X.Y.Z-dev.N < the
// bare X.Y.Z. Any other equal-core pair (another label, dev with extra
// identifiers, a non-canonical or unsafe N, a release versus a non-dev
// pre-release) still returns null.
function compareKernelVersions(left,right,devLine=false){
  kernelVersion(left,'installed kernel');
  kernelVersion(right,'compared kernel');
  const [leftCore,...leftPre]=left.split('-');
  const [rightCore,...rightPre]=right.split('-');
  const order=compareVersion(versionTuple(leftCore,'Kernel'),versionTuple(rightCore,'Kernel'));
  if(order!==0) return order<0?-1:1;
  const leftLabel=leftPre.join('-');
  const rightLabel=rightPre.join('-');
  if(leftLabel===rightLabel) return 0;
  if(!devLine) return null;
  const leftRank=devLineRank(leftLabel);
  const rightRank=devLineRank(rightLabel);
  if(leftRank===null||rightRank===null) return null;
  return leftRank<rightRank?-1:1;
}
// Position on the dev line of one core: dev.N ranks N, the bare release ranks
// above every dev.N, anything else is off the line (null).
function devLineRank(label){
  if(label==='') return Infinity;
  const match=DEV_PRERELEASE.exec(label);
  return match===null?null:Number(match[1]);
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

// ---------------------------------------------------------------------------
// Verified-input construction (#1913 re-scope).

const DERIVE_FIELDS=Object.freeze([
  'sessionId','hostPlan','releasePackage','expectedReleaseManifestDigest',
  'trustedSigners','artifactBytes','requestedAt','evaluatedAt','maxObservationAgeSeconds'
]);
const CREATE_FIELDS=Object.freeze([...DERIVE_FIELDS,'observedInstall']);
const SESSION_KEYS=Object.freeze([
  'schema','version','status','candidate','decision','artifact_proofs',
  'release_signer_key_id','evaluated_at','credential_effect','service_start_effect',
  'host_mutation_authorized','authority_effect','network_effect','runtime_activation',
  'session_digest'
]);

/**
 * Derive the inert install-session candidate from original evidence only:
 * `{sessionId, hostPlan, releasePackage, expectedReleaseManifestDigest,
 * trustedSigners, artifactBytes, requestedAt, evaluatedAt,
 * maxObservationAgeSeconds}`. Plain data is snapshotted once and byte views
 * are copied from their actual byte range, then:
 * - the host plan is checked by main's validateHostInstallPlan;
 * - this function itself verifies the original signed package with
 *   verifyInstallReleaseManifest (repository policy defaults, no caller
 *   overrides or callbacks) and uses only that result object; a verification
 *   result produced by other code is never accepted;
 * - trust root: `trustedSigners` is caller-supplied, so a signature check alone
 *   does not bind the trust root (a caller can register its own key under the
 *   real key_id, making `release_id` and `signer_key_id` mere labels). The gate
 *   therefore requires the verified `manifest_digest` to equal
 *   `expectedReleaseManifestDigest`, which must come from an independently
 *   trusted source (an operator-pinned release digest), never from the package;
 * - every artifact the verified manifest requires for the plan's profile must
 *   have bytes and no other bytes may be supplied; each is checked only through
 *   the manifest-bound overload verifyInstallReleaseArtifact(verified,
 *   artifact_id, bytes), whose result must carry manifest_bound:true and the
 *   expected manifest_digest.
 * Returns the candidate and its digest, which an installed-state observer must
 * embed as `candidate_digest`. Zero authority.
 */
export function deriveInstallSessionCandidate(input){
  return deriveVerified(input,DERIVE_FIELDS);
}

/**
 * Build the verified-input install session: deriveInstallSessionCandidate on
 * the same inputs plus `observedInstall`, classified by assessInstallSession.
 * The observation must carry the derived candidate digest and come from
 * live-local-observation, or this throws ValidationError. The returned
 * envelope is a report, not a portable credential: its decision keeps
 * observation_bound:false because the observation's origin is still
 * caller-asserted.
 */
export function createInstallSession(input){
  const derived=deriveVerified(input,CREATE_FIELDS);
  const observation=snapshotDelegationPlainData(input.observedInstall,'Installed state observation');
  const evaluated=assessInstallSession(derived.candidate,observation,{evaluatedAt:derived.evaluated_at});
  const result={
    schema:VERIFIED_INSTALL_SESSION_SCHEMA,
    version:0,
    status:'inert-verified-input-session',
    candidate:snapshotDelegationPlainData(derived.candidate,'Install session candidate'),
    decision:snapshotDelegationPlainData(evaluated,'Install session decision'),
    artifact_proofs:snapshotDelegationPlainData(derived.artifact_proofs,'Artifact proofs'),
    release_signer_key_id:derived.release_signer_key_id,
    evaluated_at:derived.evaluated_at,
    credential_effect:'none',
    service_start_effect:'none',
    host_mutation_authorized:false,
    authority_effect:'none',
    network_effect:'none',
    runtime_activation:false,
    session_digest:ZERO_SHA
  };
  result.session_digest=digestObject(result);
  return deepFreeze(result);
}

/**
 * Structural and digest validation of a serialized verified-input session.
 * This proves integrity, not origin: it never re-verifies the release, bytes
 * or observation, so a gate must re-run createInstallSession on original
 * evidence instead of trusting a supplied session.
 */
export function validateVerifiedInstallSession(value){
  const d=snapshotDelegationPlainData(value,'Verified install session');
  exactObject(d,'Verified install session',SESSION_KEYS);
  if(
    d.schema!==VERIFIED_INSTALL_SESSION_SCHEMA
    ||d.version!==0
    ||d.status!=='inert-verified-input-session'
    ||d.credential_effect!=='none'
    ||d.service_start_effect!=='none'
    ||d.host_mutation_authorized!==false
    ||d.authority_effect!=='none'
    ||d.network_effect!=='none'
    ||d.runtime_activation!==false
  ) throw new ValidationError('Verified install session activation boundary is invalid');
  const candidate=validateInstallSessionCandidate(d.candidate);
  validateInstallSessionDecision(d.decision);
  if(d.decision.candidate_digest!==candidate.candidate_digest){
    throw new ValidationError('Verified install session decision is not for its candidate');
  }
  ident(d.release_signer_key_id,'release_signer_key_id');
  date(d.evaluated_at,'evaluated_at');
  plainArray(d.artifact_proofs,'artifact_proofs',1,128);
  let previous=null;
  for(const proof of d.artifact_proofs){
    exactObject(proof,'Artifact proof',['artifact_id','artifact_sha256','byte_length']);
    ident(proof.artifact_id,'artifact proof id');
    sha(proof.artifact_sha256,'artifact proof sha256');
    integer(proof.byte_length,'artifact proof byte_length',1,1_000_000_000_000);
    if(previous!==null&&previous>=proof.artifact_id){
      throw new ValidationError('artifact_proofs must be strictly sorted by artifact_id');
    }
    previous=proof.artifact_id;
  }
  const expected=proofEvidence(d.artifact_proofs);
  if(
    expected.sha256s.join(',')!==d.candidate.artifact_sha256s.join(',')
    ||expected.refs.join(',')!==d.candidate.artifact_evidence_refs.join(',')
  ) throw new ValidationError('Verified install session artifact proofs do not match its candidate');
  sha(d.session_digest,'session_digest');
  if(digestObject({...d,session_digest:ZERO_SHA})!==d.session_digest){
    throw new ValidationError('Verified install session digest mismatch');
  }
  return Object.freeze({
    valid:true,
    session_digest:d.session_digest,
    candidate_digest:candidate.candidate_digest,
    decision:d.decision.decision,
    origin_verified:false,
    host_mutation_authorized:false,
    authority_effect:'none',
    network_effect:'none',
    runtime_activation:false
  });
}

function deriveVerified(input,fields){
  exactObject(input,'Install session constructor input',fields);
  const sessionId=snapshotDelegationPlainData(input.sessionId,'sessionId');
  const hostPlan=snapshotDelegationPlainData(input.hostPlan,'hostPlan');
  const releasePackage=snapshotDelegationPlainData(input.releasePackage,'releasePackage');
  const expectedManifestDigest=snapshotDelegationPlainData(
    input.expectedReleaseManifestDigest,'expectedReleaseManifestDigest'
  );
  const trustedSigners=snapshotDelegationPlainData(input.trustedSigners,'trustedSigners');
  const requestedAt=snapshotDelegationPlainData(input.requestedAt,'requestedAt');
  const evaluatedAt=snapshotDelegationPlainData(input.evaluatedAt,'evaluatedAt');
  const maxObservationAgeSeconds=snapshotDelegationPlainData(input.maxObservationAgeSeconds,'maxObservationAgeSeconds');
  const bytesById=snapshotArtifactBytes(input.artifactBytes);
  ident(sessionId,'sessionId');
  date(requestedAt,'requestedAt');
  date(evaluatedAt,'evaluatedAt');
  integer(maxObservationAgeSeconds,'maxObservationAgeSeconds',1,3600);
  sha(expectedManifestDigest,'expectedReleaseManifestDigest');

  const host=validateHostInstallPlan(hostPlan);
  // Repository policy defaults only: no caller policy, control-plane override,
  // callback or reported verification flag is accepted here.
  const verified=verifyInstallReleaseManifest(releasePackage,{trustedSigners,evaluatedAt});
  const manifest=releasePackage.manifest;
  // Trust-root gate: only the independently trusted digest binds the release.
  if(verified.manifest_digest!==expectedManifestDigest){
    throw new ValidationError('Verified release manifest digest does not match the independently trusted expected digest');
  }
  if(
    verified.manifest_digest!==digestObject(manifest)
    ||!verified.install_profiles.includes(host.profile_id)
    ||verified.kernel_version!==hostPlan.kernel_version
  ) throw new ValidationError('Verified release does not match the host plan profile and kernel');
  for(const artifact of manifest.artifacts){
    if(PRIVATE_BIRTH_TOKEN.test(artifact.artifact_id)||PRIVATE_BIRTH_TOKEN.test(artifact.locator)){
      throw new ValidationError('Standard install inventory cannot contain Birth/Genesis/Spark material');
    }
  }
  const requiredIds=manifest.artifacts
    .filter(artifact=>artifact.required_for_profiles.includes(host.profile_id))
    .map(artifact=>artifact.artifact_id)
    .sort();
  if(
    bytesById.size!==requiredIds.length
    ||requiredIds.some(id=>!bytesById.has(id))
  ) throw new ValidationError('Artifact bytes must match every required target-profile artifact exactly');

  const artifactProofs=requiredIds.map(id=>{
    const proof=verifyInstallReleaseArtifact(verified,id,bytesById.get(id));
    // Gate: only a manifest-bound proof of this function's own verification of
    // the expected manifest counts. release_id is a consistency check only; it
    // is a label and does not bind the trust root.
    if(
      proof.manifest_bound!==true
      ||proof.manifest_digest!==expectedManifestDigest
      ||proof.manifest_digest!==verified.manifest_digest
      ||proof.release_id!==verified.release_id
      ||proof.artifact_id!==id
      ||proof.artifact_bytes_verified!==true
    ) throw new ValidationError(`Artifact proof is not bound to the verified release manifest: ${id}`);
    return {artifact_id:proof.artifact_id,artifact_sha256:proof.sha256,byte_length:proof.byte_length};
  });
  const evidence=proofEvidence(artifactProofs);
  const candidate={
    schema:INSTALL_SESSION_CANDIDATE_SCHEMA,
    version:0,
    status:'inert-install-session-candidate',
    session_id:sessionId,
    profile_id:host.profile_id,
    runtime_strategy:host.runtime_strategy,
    desired_release_id:verified.release_id,
    desired_source_revision:verified.source_revision,
    desired_kernel_version:verified.kernel_version,
    minimum_compatible_kernel:manifest.data_compatibility.minimum_compatible_kernel,
    rollback_mode:manifest.data_compatibility.rollback_mode,
    host_candidate_compatible:host.host_candidate_compatible,
    host_plan_digest:host.plan_digest,
    host_plan_facts_source:hostPlan.host_facts_source,
    release_manifest_digest:verified.manifest_digest,
    artifact_sha256s:evidence.sha256s,
    artifact_evidence_refs:evidence.refs,
    requested_at:requestedAt,
    max_observation_age_seconds:maxObservationAgeSeconds,
    host_mutation_authorized:false,
    authority_effect:'none',
    network_effect:'none',
    runtime_activation:false
  };
  const validated=validateInstallSessionCandidate(candidate);
  return deepFreeze({
    candidate,
    candidate_digest:validated.candidate_digest,
    artifact_proofs:artifactProofs,
    release_signer_key_id:verified.signer_key_id,
    evaluated_at:evaluatedAt,
    host_mutation_authorized:false,
    authority_effect:'none',
    network_effect:'none',
    runtime_activation:false
  });
}

function proofEvidence(proofs){
  return {
    sha256s:[...new Set(proofs.map(item=>item.artifact_sha256))].sort(),
    refs:proofs.map(item=>`verified-bytes:${item.artifact_id}:${item.artifact_sha256}`)
  };
}

// A plain record of own enumerable data properties mapping artifact ids to
// byte views. Each view is copied from its actual byte range through the
// intrinsic %TypedArray% getters (caller-defined accessors on the view are
// ignored); shared or detached storage is rejected.
function snapshotArtifactBytes(value){
  if(utilTypes.isProxy(value)) throw new ValidationError('artifactBytes cannot be a Proxy');
  if(
    !value||typeof value!=='object'||Array.isArray(value)
    ||![Object.prototype,null].includes(Object.getPrototypeOf(value))
  ) throw new ValidationError('artifactBytes must be a plain data record');
  const keys=Reflect.ownKeys(value);
  if(keys.length<1||keys.length>128) throw new ValidationError('artifactBytes cardinality is invalid');
  const out=new Map();
  for(const key of keys){
    const descriptor=Object.getOwnPropertyDescriptor(value,key);
    if(typeof key!=='string'||!descriptor.enumerable||!Object.hasOwn(descriptor,'value')){
      throw new ValidationError('artifactBytes requires enumerable data properties');
    }
    ident(key,'artifactBytes id');
    out.set(key,snapshotBytes(descriptor.value));
  }
  return out;
}

const TYPED_ARRAY_PROTOTYPE=Object.getPrototypeOf(Uint8Array.prototype);
const intrinsic=name=>Object.getOwnPropertyDescriptor(TYPED_ARRAY_PROTOTYPE,name).get;
const TYPED_ARRAY_BUFFER=intrinsic('buffer');
const TYPED_ARRAY_OFFSET=intrinsic('byteOffset');
const TYPED_ARRAY_LENGTH=intrinsic('byteLength');

function snapshotBytes(value){
  if(utilTypes.isProxy(value)||!utilTypes.isUint8Array(value)){
    throw new ValidationError('Artifact bytes must be a Buffer or Uint8Array');
  }
  const buffer=Reflect.apply(TYPED_ARRAY_BUFFER,value,[]);
  if(utilTypes.isSharedArrayBuffer(buffer)){
    throw new ValidationError('Shared artifact byte storage is not accepted');
  }
  try{
    return Buffer.from(new Uint8Array(
      buffer,
      Reflect.apply(TYPED_ARRAY_OFFSET,value,[]),
      Reflect.apply(TYPED_ARRAY_LENGTH,value,[])
    ));
  }catch{
    throw new ValidationError('Artifact bytes are unreadable');
  }
}

function plainArray(v,label,min,max){
  if(!Array.isArray(v)||Object.getPrototypeOf(v)!==Array.prototype||v.length<min||v.length>max){
    throw new ValidationError(`${label} has invalid cardinality or prototype`);
  }
}
