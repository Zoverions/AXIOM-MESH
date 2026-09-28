import { types as utilTypes } from 'node:util';
import { digestObject, ValidationError } from './canonical.mjs';
import {
  taskLifecycleDigest,
  validateTaskLifecycle
} from './agent-os-contracts.mjs';

export const PARTICIPATION_OBSERVATION_SCHEMA='axiom-participation-observation.v0';
export const PARTICIPATION_POLICY_SCHEMA='axiom-participation-policy.v0';
export const ACTIVE_TASK_STEERING_SCHEMA='axiom-active-task-steering.v0';
export const SILENT_INVESTIGATION_RESULT_SCHEMA='axiom-silent-investigation-result.v0';
export const PARTICIPATION_DECISION_SCHEMA='axiom-participation-decision.v0';
export const PARTICIPATION_COOLDOWN_EVIDENCE_SCHEMA='axiom-participation-cooldown-evidence.v0';
export const PARTICIPATION_ACTIONS=Object.freeze(['ANSWER','INVESTIGATE','ACKNOWLEDGE','PASS']);
export const STEERING_DECISIONS=Object.freeze(['IGNORE','APPEND','REPLACE','STOP']);
export const PARTICIPATION_PRESETS=Object.freeze(['listener','investigator','balanced','teammate']);

const ID=/^[A-Za-z0-9][A-Za-z0-9_.:#/-]{0,191}$/;
const SHA=/^[a-f0-9]{64}$/;
const ZERO_SHA='0'.repeat(64);
const CONTEXTS=new Set(['owner-private','direct','circle','organization','public']);
const CONTEXT_SCOPE_MODES=new Set(['all-eligible','allowlist']);
const ADDRESSING=new Set(['explicit','passive','context-only']);
const APPLICABILITY=new Set(['current','stale','unknown']);
const CONSEQUENCE=new Set(['C0','C1','C2','C3']);
const CONSEQUENCE_RANK={C0:0,C1:1,C2:2,C3:3};
const COOLDOWN=new Set(['ready','blocked','unavailable']);
const DIMS=['usefulness','answer_confidence','urgency','noise','interruption_cost','investigation_value','acknowledgement_fit'];
const THRESHOLDS=['reply_usefulness_min','reply_confidence_min','investigate_value_min','acknowledge_fit_min','noise_max','interruption_cost_max'];
const TASK_LIFECYCLE_FIELDS=['schema','version','status','task_id','outcome_id','principal_id','lifecycle_state','created_at','updated_at','worker_ref','provider_ref','node_ref','authority_snapshot_ref','authority_checked_at','budget_ref','budget_checked_at','resume_requested','resume_from_digest','effect_state','result_refs','grants_authority','execution_effect','runtime_activation'];

export function validateParticipationObservation(d){
  exact(d,'Participation observation',['schema','version','status','observation_id','event_digest','state_digest','task_id','principal_id','context_id','context_class','addressing_class','producer_ref','producer_revision_ref','observed_at','applicability','dimensions','evidence_refs','score_semantics','authority_effect','assurance_effect','execution_effect','runtime_activation']);
  if(d.schema!==PARTICIPATION_OBSERVATION_SCHEMA||d.version!==0||d.status!=='inert-participation-observation'||d.score_semantics!=='uncalibrated-ordinal-0-100'||d.authority_effect!=='none'||d.assurance_effect!=='none'||d.execution_effect!=='none'||d.runtime_activation!==false) throw new ValidationError('Participation observation activation boundary is invalid');
  ident(d.observation_id,'observation_id'); sha(d.event_digest,'event_digest'); sha(d.state_digest,'state_digest'); nullableId(d.task_id,'task_id');
  ident(d.principal_id,'principal_id'); ident(d.context_id,'context_id'); en(d.context_class,CONTEXTS,'context_class'); en(d.addressing_class,ADDRESSING,'addressing_class');
  ident(d.producer_ref,'producer_ref'); nullableId(d.producer_revision_ref,'producer_revision_ref'); date(d.observed_at,'observed_at'); en(d.applicability,APPLICABILITY,'applicability');
  exact(d.dimensions,'Participation dimensions',DIMS); for(const k of DIMS) nullableScore(d.dimensions[k],k); strings(d.evidence_refs,'evidence_refs',64,512);
  return Object.freeze({valid:true,schema:d.schema,observation_id:d.observation_id,observation_digest:digestObject(d),applicability:d.applicability,authority_effect:'none',assurance_effect:'none',execution_effect:'none',runtime_activation:false});
}
export function participationObservationDigest(d){validateParticipationObservation(d);return digestObject(d);}

export function validateParticipationPolicy(d){
  exact(d,'Participation policy',['schema','version','status','policy_id','preset','policy_source_ref','issued_at','expires_at','passive_participation','reactions_enabled','silent_investigation','explicit_mode','context_scope_mode','allowed_context_ids','allowed_context_classes','quiet_context_ids','consequence_ceiling','threshold_basis','thresholds','cooldown','grants_authority','data_scope_effect','execution_effect','runtime_activation']);
  if(d.schema!==PARTICIPATION_POLICY_SCHEMA||d.version!==0||d.status!=='inert-participation-policy'||d.threshold_basis!=='illustrative-unvalidated'||d.grants_authority!==false||d.data_scope_effect!=='none'||d.execution_effect!=='none'||d.runtime_activation!==false) throw new ValidationError('Participation policy activation boundary is invalid');
  ident(d.policy_id,'policy_id'); en(d.preset,new Set([...PARTICIPATION_PRESETS,'custom']),'preset'); ident(d.policy_source_ref,'policy_source_ref'); const issued=date(d.issued_at,'issued_at');
  if(d.expires_at!==null&&date(d.expires_at,'expires_at')<=issued) throw new ValidationError('expires_at must follow issued_at');
  boolean(d.passive_participation,'passive_participation'); boolean(d.reactions_enabled,'reactions_enabled'); boolean(d.silent_investigation,'silent_investigation'); en(d.explicit_mode,new Set(['answer','investigate-first']),'explicit_mode');
  en(d.context_scope_mode,CONTEXT_SCOPE_MODES,'context_scope_mode'); ids(d.allowed_context_ids,'allowed_context_ids',256); enums(d.allowed_context_classes,'allowed_context_classes',CONTEXTS,5); ids(d.quiet_context_ids,'quiet_context_ids',256); en(d.consequence_ceiling,CONSEQUENCE,'consequence_ceiling');
  if(d.context_scope_mode==='all-eligible'&&d.allowed_context_ids.length!==0) throw new ValidationError('all-eligible context scope cannot carry allowed_context_ids');
  if(d.context_scope_mode==='allowlist'&&d.allowed_context_ids.length===0) throw new ValidationError('allowlist context scope requires allowed_context_ids');
  exact(d.thresholds,'Participation thresholds',THRESHOLDS); for(const k of THRESHOLDS) score(d.thresholds[k],k);
  exact(d.cooldown,'Participation cooldown',['required','window_seconds','max_unsolicited_interventions']); boolean(d.cooldown.required,'cooldown.required'); integer(d.cooldown.window_seconds,'cooldown.window_seconds',1,86400); integer(d.cooldown.max_unsolicited_interventions,'cooldown.max_unsolicited_interventions',0,10000);
  if(!d.cooldown.required&&d.cooldown.max_unsolicited_interventions!==0) throw new ValidationError('Cooldown disabled requires max_unsolicited_interventions=0');
  return Object.freeze({valid:true,schema:d.schema,policy_id:d.policy_id,policy_digest:digestObject(d),grants_authority:false,data_scope_effect:'none',execution_effect:'none',runtime_activation:false});
}
export function participationPolicyDigest(d){validateParticipationPolicy(d);return digestObject(d);}

export function createParticipationPreset(name,{policyId,policySourceRef,issuedAt,expiresAt=null}){
  if(!PARTICIPATION_PRESETS.includes(name)) throw new ValidationError('Unknown participation preset');
  const presets={
    listener:[false,false,100,100,100,100,0,0,3600,0],
    investigator:[true,false,90,90,82,100,25,25,900,2],
    balanced:[true,true,72,72,70,78,55,55,600,4],
    teammate:[true,true,55,55,58,60,70,70,300,8]
  };
  const [passive,reactions,reply,confidence,investigate,ack,noise,interrupt,window,max]=presets[name];
  const d={schema:PARTICIPATION_POLICY_SCHEMA,version:0,status:'inert-participation-policy',policy_id:policyId,preset:name,policy_source_ref:policySourceRef,issued_at:issuedAt,expires_at:expiresAt,passive_participation:passive,reactions_enabled:reactions,silent_investigation:true,explicit_mode:'answer',context_scope_mode:'all-eligible',allowed_context_ids:[],allowed_context_classes:['owner-private','direct','circle','organization','public'],quiet_context_ids:[],consequence_ceiling:'C1',threshold_basis:'illustrative-unvalidated',thresholds:{reply_usefulness_min:reply,reply_confidence_min:confidence,investigate_value_min:investigate,acknowledge_fit_min:ack,noise_max:noise,interruption_cost_max:interrupt},cooldown:{required:true,window_seconds:window,max_unsolicited_interventions:max},grants_authority:false,data_scope_effect:'none',execution_effect:'none',runtime_activation:false};
  validateParticipationPolicy(d); return deepFreeze(d);
}

export function evaluateParticipation(o,p,e){
  validateParticipationObservation(o); validateParticipationPolicy(p); validateEvent(e);
  const mismatch=[]; if(o.event_digest!==e.event_digest)mismatch.push('event-digest-mismatch'); if(o.context_id!==e.context_id||o.context_class!==e.context_class)mismatch.push('context-mismatch'); if(o.addressing_class!==e.event_class)mismatch.push('addressing-class-mismatch');
  if(!e.supported)return decision('PASS',['unsupported-event'],o,p); if(e.event_class==='context-only')return decision('PASS',['context-only'],o,p);
  const evaluationTime=new Date(e.evaluated_at);
  const policyNotYetEffective=new Date(p.issued_at)>evaluationTime;
  const policyExpired=p.expires_at!==null&&new Date(p.expires_at)<=evaluationTime;
  const observationFromFuture=new Date(o.observed_at)>evaluationTime;
  if(e.event_class==='explicit'){
    if(mismatch.length||policyNotYetEffective||policyExpired||observationFromFuture||o.applicability!=='current')return fallbackParticipationDecision(e,'explicit-request-semantic-policy-bypassed');
    if(p.explicit_mode==='investigate-first'&&o.dimensions.investigation_value!==null&&o.dimensions.investigation_value>=p.thresholds.investigate_value_min)return decision('INVESTIGATE',['explicit-investigate-first'],o,p);
    return decision('ANSWER',['explicit-request'],o,p);
  }
  if(mismatch.length)return decision('PASS',mismatch,o,p); if(policyNotYetEffective)return decision('PASS',['policy-not-yet-effective'],o,p); if(policyExpired)return decision('PASS',['policy-expired'],o,p); if(observationFromFuture)return decision('PASS',['observation-from-future'],o,p);
  if(!p.passive_participation)return decision('PASS',['passive-disabled'],o,p); if(e.quiet_context||p.quiet_context_ids.includes(e.context_id))return decision('PASS',['quiet-context'],o,p); if(!p.allowed_context_classes.includes(e.context_class))return decision('PASS',['context-not-allowed'],o,p);
  if(p.context_scope_mode==='allowlist'&&!p.allowed_context_ids.includes(e.context_id))return decision('PASS',['context-not-allowlisted'],o,p);
  if(CONSEQUENCE_RANK[e.consequence_class]>CONSEQUENCE_RANK[p.consequence_ceiling])return decision('PASS',['consequence-above-ceiling'],o,p); if(p.cooldown.required&&e.cooldown_state!=='ready')return decision('PASS',[e.cooldown_state==='unavailable'?'cooldown-unavailable':'cooldown-blocked'],o,p);
  if(o.applicability!=='current')return decision('PASS',['observation-not-current'],o,p); if(e.already_answered)return decision('PASS',['already-answered'],o,p); const d=o.dimensions;
  if(d.noise===null||d.interruption_cost===null)return decision('PASS',['passive-risk-dimension-unknown'],o,p); if(d.noise>p.thresholds.noise_max)return decision('PASS',['noise-too-high'],o,p);
  if(d.usefulness!==null&&d.answer_confidence!==null&&d.usefulness>=p.thresholds.reply_usefulness_min&&d.answer_confidence>=p.thresholds.reply_confidence_min&&d.interruption_cost<=p.thresholds.interruption_cost_max)return decision('ANSWER',['passive-reply-threshold-met'],o,p);
  if(d.investigation_value!==null&&d.investigation_value>=p.thresholds.investigate_value_min)return decision('INVESTIGATE',['passive-investigation-threshold-met'],o,p);
  if(p.reactions_enabled&&d.acknowledgement_fit!==null&&d.acknowledgement_fit>=p.thresholds.acknowledge_fit_min)return decision('ACKNOWLEDGE',['passive-acknowledgement-threshold-met'],o,p);
  return decision('PASS',['no-participation-threshold-met'],o,p);
}

export function fallbackParticipationDecision(e,reason='semantic-evaluator-unavailable'){
  validateEvent(e);
  text(reason,'reason',128);
  return makeDecision(
    e.event_class==='explicit'&&e.supported?'ANSWER':'PASS',
    [reason],
    null,
    null
  );
}

export function computeParticipationDecisionDigest(d){
  exact(d,'Participation decision digest input',['schema','version','status','action','reasons','observation_digest','policy_digest','decision_digest','authority_effect','data_scope_effect','communication_effect','execution_effect','runtime_activation']);
  return digestObject({...d,decision_digest:ZERO_SHA});
}

export function validateParticipationDecision(d){
  exact(d,'Participation decision',['schema','version','status','action','reasons','observation_digest','policy_digest','decision_digest','authority_effect','data_scope_effect','communication_effect','execution_effect','runtime_activation']);
  if(
    d.schema!==PARTICIPATION_DECISION_SCHEMA
    ||d.version!==0
    ||d.status!=='inert-participation-decision'
    ||d.authority_effect!=='none'
    ||d.data_scope_effect!=='none'
    ||d.communication_effect!=='none'
    ||d.execution_effect!=='none'
    ||d.runtime_activation!==false
  ) throw new ValidationError('Participation decision activation boundary is invalid');
  en(d.action,new Set(PARTICIPATION_ACTIONS),'action');
  strings(d.reasons,'reasons',16,128);
  if(d.reasons.length===0) throw new ValidationError('Participation decision requires at least one reason');
  if((d.observation_digest===null)!==(d.policy_digest===null)) {
    throw new ValidationError('Participation decision evidence digests must both be present or both be null');
  }
  if(d.observation_digest!==null) sha(d.observation_digest,'observation_digest');
  if(d.policy_digest!==null) sha(d.policy_digest,'policy_digest');
  sha(d.decision_digest,'decision_digest');
  if(computeParticipationDecisionDigest(d)!==d.decision_digest) {
    throw new ValidationError('Participation decision digest mismatch');
  }
  return Object.freeze({
    valid:true,
    action:d.action,
    decision_digest:d.decision_digest,
    authority_effect:'none',
    data_scope_effect:'none',
    communication_effect:'none',
    execution_effect:'none',
    runtime_activation:false
  });
}

export function participationDecisionDigest(d){
  validateParticipationDecision(d);
  return d.decision_digest;
}

export function computeParticipationCooldownEvidenceDigest(d){
  exact(d,'Participation cooldown evidence digest input',['schema','version','status','evidence_id','policy_digest','context_id','window_started_at','window_ends_at','evaluated_at','unsolicited_interventions','max_unsolicited_interventions','derived_state','history_digest','evidence_refs','evidence_digest','authority_effect','communication_effect','execution_effect','runtime_activation']);
  return digestObject({...d,evidence_digest:ZERO_SHA});
}

export function validateParticipationCooldownEvidence(d){
  exact(d,'Participation cooldown evidence',['schema','version','status','evidence_id','policy_digest','context_id','window_started_at','window_ends_at','evaluated_at','unsolicited_interventions','max_unsolicited_interventions','derived_state','history_digest','evidence_refs','evidence_digest','authority_effect','communication_effect','execution_effect','runtime_activation']);
  if(
    d.schema!==PARTICIPATION_COOLDOWN_EVIDENCE_SCHEMA
    ||d.version!==0
    ||d.status!=='inert-participation-cooldown-evidence'
    ||d.authority_effect!=='none'
    ||d.communication_effect!=='none'
    ||d.execution_effect!=='none'
    ||d.runtime_activation!==false
  ) throw new ValidationError('Participation cooldown evidence activation boundary is invalid');
  ident(d.evidence_id,'evidence_id');
  sha(d.policy_digest,'policy_digest');
  ident(d.context_id,'context_id');
  const start=date(d.window_started_at,'window_started_at');
  const end=date(d.window_ends_at,'window_ends_at');
  const evaluated=date(d.evaluated_at,'evaluated_at');
  if(end<=start) throw new ValidationError('Cooldown window_ends_at must follow window_started_at');
  if(evaluated!==end) throw new ValidationError('Cooldown window_ends_at must equal evaluated_at');
  integer(d.unsolicited_interventions,'unsolicited_interventions',0,1000000);
  integer(d.max_unsolicited_interventions,'max_unsolicited_interventions',0,1000000);
  en(d.derived_state,new Set(['ready','blocked']),'derived_state');
  sha(d.history_digest,'history_digest');
  strings(d.evidence_refs,'evidence_refs',128,512);
  if(d.evidence_refs.length===0) throw new ValidationError('Cooldown evidence requires a history evidence reference');
  sha(d.evidence_digest,'evidence_digest');
  const expected=d.unsolicited_interventions>=d.max_unsolicited_interventions?'blocked':'ready';
  if(d.derived_state!==expected) throw new ValidationError('Cooldown derived_state does not match the intervention count');
  if(computeParticipationCooldownEvidenceDigest(d)!==d.evidence_digest) {
    throw new ValidationError('Participation cooldown evidence digest mismatch');
  }
  return Object.freeze({
    valid:true,
    evidence_digest:d.evidence_digest,
    derived_state:d.derived_state,
    authority_effect:'none',
    communication_effect:'none',
    execution_effect:'none',
    runtime_activation:false
  });
}

export function participationCooldownEvidenceDigest(d){
  validateParticipationCooldownEvidence(d);
  return d.evidence_digest;
}

export function assessParticipationCooldown(p,evidence,event){
  validateParticipationPolicy(p);
  validateEvent(event);
  if(!p.cooldown.required) {
    return Object.freeze({state:'ready',reasons:Object.freeze(['cooldown-not-required']),evidence_digest:null,authority_effect:'none',communication_effect:'none',execution_effect:'none'});
  }
  try {
    validateParticipationCooldownEvidence(evidence);
  } catch {
    return Object.freeze({state:'unavailable',reasons:Object.freeze(['cooldown-evidence-invalid']),evidence_digest:null,authority_effect:'none',communication_effect:'none',execution_effect:'none'});
  }
  const reasons=[];
  const policyDigest=participationPolicyDigest(p);
  if(evidence.policy_digest!==policyDigest) reasons.push('cooldown-policy-mismatch');
  if(evidence.context_id!==event.context_id) reasons.push('cooldown-context-mismatch');
  if(evidence.evaluated_at!==event.evaluated_at) reasons.push('cooldown-evaluation-time-mismatch');
  const expectedWindowMs=p.cooldown.window_seconds*1000;
  if(new Date(evidence.window_ends_at)-new Date(evidence.window_started_at)!==expectedWindowMs) {
    reasons.push('cooldown-window-mismatch');
  }
  if(evidence.max_unsolicited_interventions!==p.cooldown.max_unsolicited_interventions) {
    reasons.push('cooldown-limit-mismatch');
  }
  return Object.freeze({
    state:reasons.length===0?evidence.derived_state:'unavailable',
    reasons:Object.freeze(reasons),
    evidence_digest:reasons.length===0?evidence.evidence_digest:null,
    authority_effect:'none',
    communication_effect:'none',
    execution_effect:'none'
  });
}

export function evaluateParticipationWithCooldown(o,p,e,evidence){
  const cooldown=assessParticipationCooldown(p,evidence,e);
  return evaluateParticipation(o,p,{...e,cooldown_state:cooldown.state});
}

export function validateActiveTaskSteering(d){
  exact(d,'Active task steering',['schema','version','status','steering_id','task_id','previous_task_digest','new_event_digest','actor_principal_id','semantic_observation_digest','authority_snapshot_ref','decision','resulting_task_revision_digest','decided_at','grants_authority','delegation_effect','execution_effect','runtime_activation']);
  if(d.schema!==ACTIVE_TASK_STEERING_SCHEMA||d.version!==0||d.status!=='inert-steering-evidence'||d.grants_authority!==false||d.delegation_effect!=='none'||d.execution_effect!=='none'||d.runtime_activation!==false) throw new ValidationError('Active task steering activation boundary is invalid');
  ident(d.steering_id,'steering_id'); ident(d.task_id,'task_id'); sha(d.previous_task_digest,'previous_task_digest'); sha(d.new_event_digest,'new_event_digest'); ident(d.actor_principal_id,'actor_principal_id'); sha(d.semantic_observation_digest,'semantic_observation_digest'); ident(d.authority_snapshot_ref,'authority_snapshot_ref'); en(d.decision,new Set(STEERING_DECISIONS),'decision'); date(d.decided_at,'decided_at');
  if(d.decision==='APPEND'||d.decision==='REPLACE')sha(d.resulting_task_revision_digest,'resulting_task_revision_digest'); else if(d.resulting_task_revision_digest!==null)throw new ValidationError('IGNORE/STOP steering cannot claim a resulting task revision');
  return Object.freeze({valid:true,steering_digest:digestObject(d),decision:d.decision,authority_effect:'none',delegation_effect:'none',execution_effect:'none',runtime_activation:false});
}
export function activeTaskSteeringDigest(d){validateActiveTaskSteering(d);return digestObject(d);}

export function verifyActiveTaskSteeringBinding(steering,previousTask,nextTask=null){
  validateActiveTaskSteering(steering);
  assertTaskLifecyclePlainInput(previousTask,'Previous task lifecycle');
  validateTaskLifecycle(previousTask);
  const reasons=[];
  const previousDigest=taskLifecycleDigest(previousTask);
  if(steering.task_id!==previousTask.task_id) reasons.push('task-id-mismatch');
  if(steering.previous_task_digest!==previousDigest) reasons.push('previous-task-digest-mismatch');
  if(steering.actor_principal_id!==previousTask.principal_id) reasons.push('actor-principal-mismatch');
  if(steering.authority_snapshot_ref!==previousTask.authority_snapshot_ref) reasons.push('authority-snapshot-mismatch');
  if(new Date(steering.decided_at)<new Date(previousTask.updated_at)) reasons.push('steering-predates-task-state');

  if(steering.decision==='APPEND'||steering.decision==='REPLACE'){
    if(nextTask===null){
      reasons.push('successor-task-required');
    }else{
      try{
        assertTaskLifecyclePlainInput(nextTask,'Successor task lifecycle');
        validateTaskLifecycle(nextTask);
        if(nextTask.task_id!==previousTask.task_id) reasons.push('successor-task-id-mismatch');
        if(nextTask.outcome_id!==previousTask.outcome_id) reasons.push('successor-outcome-mismatch');
        if(nextTask.principal_id!==previousTask.principal_id) reasons.push('successor-principal-mismatch');
        if(nextTask.authority_snapshot_ref!==previousTask.authority_snapshot_ref) reasons.push('successor-authority-snapshot-mismatch');
        if(nextTask.budget_ref!==previousTask.budget_ref) reasons.push('successor-budget-ref-mismatch');
        if(new Date(nextTask.updated_at)<new Date(steering.decided_at)) reasons.push('successor-predates-steering');
        if(taskLifecycleDigest(nextTask)!==steering.resulting_task_revision_digest) reasons.push('successor-digest-mismatch');
      }catch{
        reasons.push('successor-task-invalid');
      }
    }
  }else if(nextTask!==null){
    reasons.push('unexpected-successor-task');
  }

  return Object.freeze({
    bound:reasons.length===0,
    reasons:Object.freeze(reasons),
    steering_digest:activeTaskSteeringDigest(steering),
    previous_task_digest:previousDigest,
    successor_task_digest:nextTask===null?null:(()=>{try{return taskLifecycleDigest(nextTask);}catch{return null;}})(),
    authority_effect:'none',
    delegation_effect:'none',
    execution_effect:'none',
    runtime_activation:false
  });
}

export function validateSilentInvestigationResult(d){
  exact(d,'Silent investigation result',['schema','version','status','result_id','task_id','policy_digest','observation_digest','started_at','completed_at','evidence_refs','useful_finding','actionable_finding','silence_reason','steps_used','tool_calls','duration_ms','unresolved_unknowns','emitted_message','authority_effect','execution_effect','runtime_activation']);
  if(d.schema!==SILENT_INVESTIGATION_RESULT_SCHEMA||d.version!==0||d.status!=='inert-silent-investigation-evidence'||d.emitted_message!==false||d.authority_effect!=='none'||d.execution_effect!=='none'||d.runtime_activation!==false) throw new ValidationError('Silent investigation activation boundary is invalid');
  ident(d.result_id,'result_id'); ident(d.task_id,'task_id'); sha(d.policy_digest,'policy_digest'); sha(d.observation_digest,'observation_digest'); const start=date(d.started_at,'started_at'); const end=date(d.completed_at,'completed_at'); if(end<start)throw new ValidationError('completed_at cannot precede started_at'); strings(d.evidence_refs,'evidence_refs',256,512); boolean(d.useful_finding,'useful_finding'); boolean(d.actionable_finding,'actionable_finding'); en(d.silence_reason,new Set(['no-useful-finding','no-actionable-finding','already-covered','interruption-not-justified','policy-suppressed']),'silence_reason'); integer(d.steps_used,'steps_used',0,1000000); integer(d.tool_calls,'tool_calls',0,1000000); integer(d.duration_ms,'duration_ms',0,86400000); strings(d.unresolved_unknowns,'unresolved_unknowns',128,512);
  if(d.silence_reason==='no-useful-finding'&&d.useful_finding!==false)throw new ValidationError('no-useful-finding requires useful_finding=false'); if(d.silence_reason==='no-actionable-finding'&&d.actionable_finding!==false)throw new ValidationError('no-actionable-finding requires actionable_finding=false');
  return Object.freeze({valid:true,result_digest:digestObject(d),emitted_message:false,authority_effect:'none',execution_effect:'none',runtime_activation:false});
}
export function silentInvestigationResultDigest(d){validateSilentInvestigationResult(d);return digestObject(d);}

function decision(action,reasons,o,p){return makeDecision(action,reasons,digestObject(o),digestObject(p));}
function makeDecision(action,reasons,observationDigest,policyDigest){
  const d={
    schema:PARTICIPATION_DECISION_SCHEMA,
    version:0,
    status:'inert-participation-decision',
    action,
    reasons:[...reasons],
    observation_digest:observationDigest,
    policy_digest:policyDigest,
    decision_digest:ZERO_SHA,
    authority_effect:'none',
    data_scope_effect:'none',
    communication_effect:'none',
    execution_effect:'none',
    runtime_activation:false
  };
  d.decision_digest=computeParticipationDecisionDigest(d);
  validateParticipationDecision(d);
  return deepFreeze(d);
}
function assertTaskLifecyclePlainInput(value,label){
  exact(value,label,TASK_LIFECYCLE_FIELDS);
  if(utilTypes.isProxy(value.result_refs)||!Array.isArray(value.result_refs)) throw new ValidationError(label+' result_refs must be a plain array');
  const keys=Reflect.ownKeys(value.result_refs);
  for(const key of keys){
    if(key==='length') continue;
    if(typeof key!=='string'||!/^(0|[1-9][0-9]*)$/.test(key)) throw new ValidationError(label+' result_refs has an invalid array key');
    const descriptor=Reflect.getOwnPropertyDescriptor(value.result_refs,key);
    if(!descriptor?.enumerable||!Object.hasOwn(descriptor,'value')) throw new ValidationError(label+' result_refs must contain only enumerable data properties');
    if(typeof descriptor.value!=='string') throw new ValidationError(label+' result_refs items must be strings');
  }
  if(keys.filter(key=>key!=='length').length!==value.result_refs.length) throw new ValidationError(label+' result_refs cannot be sparse');
}
function validateEvent(e){exact(e,'Participation event',['event_digest','event_class','context_id','context_class','evaluated_at','supported','quiet_context','cooldown_state','already_answered','consequence_class']); sha(e.event_digest,'event_digest'); en(e.event_class,ADDRESSING,'event_class'); ident(e.context_id,'context_id'); en(e.context_class,CONTEXTS,'context_class'); date(e.evaluated_at,'evaluated_at'); boolean(e.supported,'supported'); boolean(e.quiet_context,'quiet_context'); en(e.cooldown_state,COOLDOWN,'cooldown_state'); boolean(e.already_answered,'already_answered'); en(e.consequence_class,CONSEQUENCE,'consequence_class');}
function exact(v,label,fields){if(utilTypes.isProxy(v))throw new ValidationError(label+' cannot be a Proxy'); if(!v||typeof v!=='object'||Array.isArray(v))throw new ValidationError(label+' must be an object'); const proto=Object.getPrototypeOf(v); if(proto!==Object.prototype&&proto!==null)throw new ValidationError(label+' must be a plain object'); const keys=Reflect.ownKeys(v); if(keys.some(k=>typeof k==='symbol'))throw new ValidationError(label+' cannot contain symbol keys'); for(const k of keys){const d=Object.getOwnPropertyDescriptor(v,k); if(!d?.enumerable||d.get||d.set)throw new ValidationError(label+' must contain only enumerable data properties');} if(keys.map(String).sort().join(',')!==[...fields].sort().join(','))throw new ValidationError(label+' fields are invalid');}
function ident(v,label){if(typeof v!=='string'||!ID.test(v))throw new ValidationError(label+' is invalid');}
function nullableId(v,label){if(v!==null)ident(v,label);}
function sha(v,label){if(typeof v!=='string'||!SHA.test(v))throw new ValidationError(label+' must be a lowercase sha256 digest');}
function boolean(v,label){if(typeof v!=='boolean')throw new ValidationError(label+' must be boolean');}
function score(v,label){if(!Number.isInteger(v)||v<0||v>100)throw new ValidationError(label+' must be an integer from 0 to 100');}
function nullableScore(v,label){if(v!==null)score(v,label);}
function integer(v,label,min,max){if(!Number.isSafeInteger(v)||v<min||v>max)throw new ValidationError(label+' is outside the allowed range');}
function en(v,set,label){if(!set.has(v))throw new ValidationError(label+' is invalid');}
function date(v,label){if(typeof v!=='string')throw new ValidationError(label+' must be a timestamp'); const d=new Date(v); if(!Number.isFinite(d.valueOf())||d.toISOString()!==v)throw new ValidationError(label+' must be canonical ISO-8601 UTC'); return d;}
function text(v,label,max){if(typeof v!=='string'||v.trim().length<1||v.length>max||/[\u0000-\u001f]/.test(v))throw new ValidationError(label+' is invalid');}
function strings(v,label,max,itemMax){if(utilTypes.isProxy(v)||!Array.isArray(v)||v.length>max)throw new ValidationError(label+' has invalid cardinality'); const seen=new Set(); for(const x of v){text(x,label+' item',itemMax); if(seen.has(x))throw new ValidationError(label+' contains duplicate values'); seen.add(x);}}
function ids(v,label,max){if(utilTypes.isProxy(v)||!Array.isArray(v)||v.length>max)throw new ValidationError(label+' has invalid cardinality'); const seen=new Set(); for(const x of v){ident(x,label+' item'); if(seen.has(x))throw new ValidationError(label+' contains duplicate values'); seen.add(x);}}
function enums(v,label,set,max){if(utilTypes.isProxy(v)||!Array.isArray(v)||v.length<1||v.length>max)throw new ValidationError(label+' has invalid cardinality'); const seen=new Set(); for(const x of v){en(x,set,label+' item'); if(seen.has(x))throw new ValidationError(label+' contains duplicate values'); seen.add(x);}}
function deepFreeze(v){if(v&&typeof v==='object'&&!Object.isFrozen(v)){for(const child of Object.values(v))deepFreeze(child);Object.freeze(v);}return v;}
