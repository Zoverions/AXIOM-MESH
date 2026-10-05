import { digestObject, ValidationError } from './canonical.mjs';

export const TASK_CONTINUITY_POLICY_SCHEMA = 'axiom-task-continuity-policy.v0';

const ID=/^[A-Za-z0-9][A-Za-z0-9_.:#/-]{0,191}$/;
const DIGEST=/^[a-f0-9]{64}$/;
const MODES=new Set(['stop-on-loss','local-cognition-degraded','queue-until-reconnect']);
const NETWORK_STATES=new Set(['online','provider-unavailable','mesh-partitioned','offline']);
const LOCATIONS=new Set(['owner-local','remote']);
const PROVIDERS=new Set(['owner-local','remote','none']);
const EFFECTS=new Set(["none","read-external","write-external","publish-external","communication","financial","create-external-resource","delete-external-resource","physical","unknown"]);

export function validateTaskContinuityPolicy(document){
  exactObject(document,'Task continuity policy',[
    'schema','version','status','continuity_id','outcome_id','task_id','outcome_digest','task_digest',
    'authority_snapshot_ref','budget_ref','mode','max_degraded_duration_ms',
    'allowed_local_capabilities','allowed_data_classes','expires_at',
    'grants_authority','execution_effect','runtime_activation'
  ]);
  if(
    document.schema!==TASK_CONTINUITY_POLICY_SCHEMA||document.version!==0
    ||document.status!=='inert-contract-laboratory'||document.grants_authority!==false
    ||document.execution_effect!=='none'||document.runtime_activation!==false
  )throw new ValidationError('Task continuity policy activation boundary is invalid');
  id(document.continuity_id,'continuity_id');id(document.outcome_id,'outcome_id');id(document.task_id,'task_id');
  digest(document.outcome_digest,'outcome_digest');digest(document.task_digest,'task_digest');
  id(document.authority_snapshot_ref,'authority_snapshot_ref');id(document.budget_ref,'budget_ref');
  if(!MODES.has(document.mode))throw new ValidationError('continuity mode is invalid');
  integer(document.max_degraded_duration_ms,'max_degraded_duration_ms',0,604800000);
  idArray(document.allowed_local_capabilities,'allowed_local_capabilities',128);
  textArray(document.allowed_data_classes,'allowed_data_classes',128,512);
  canonicalDate(document.expires_at,'expires_at');
  return Object.freeze({valid:true,schema:document.schema,continuity_id:document.continuity_id,policy_digest:digestObject(document),authority_effect:'none',execution_effect:'none',runtime_activation:false});
}

export function taskContinuityPolicyDigest(document){validateTaskContinuityPolicy(document);return digestObject(document);}

export function evaluateTaskContinuity(policy,state){
  validateTaskContinuityPolicy(policy);
  validateState(state);
  const assessed=canonicalDate(state.assessed_at,'assessed_at');
  const reasons=[];
  if(assessed>=canonicalDate(policy.expires_at,'policy expires_at'))reasons.push('continuity-policy-expired');
  if(state.outcome_digest!==policy.outcome_digest)reasons.push('outcome-digest-mismatch');
  if(state.task_digest!==policy.task_digest)reasons.push('task-digest-mismatch');
  if(state.authority_snapshot_ref!==policy.authority_snapshot_ref)reasons.push('authority-snapshot-mismatch');
  if(state.authority_current!==true)reasons.push('authority-not-current');
  if(state.budget_ref!==policy.budget_ref)reasons.push('budget-ref-mismatch');
  if(state.budget_current!==true)reasons.push('budget-not-current');

  if(state.network_state==='online'){
    if(reasons.length)return decision('stop-denied',reasons);
    return decision('normal-path-required',['degraded-continuity-not-required']);
  }

  if(state.degraded_since===null){
    reasons.push('degraded-since-missing');
  }else{
    const since=canonicalDate(state.degraded_since,'degraded_since');
    if(since>assessed)reasons.push('degraded-since-in-future');
    else if(assessed-since>policy.max_degraded_duration_ms)reasons.push('degraded-duration-exceeded');
  }

  if(reasons.length)return decision('stop-denied',reasons);
  if(policy.mode==='stop-on-loss')return decision('stop-denied',['policy-stop-on-loss']);
  if(policy.mode==='queue-until-reconnect')return decision('queue-eligible',['await-reconnect']);

  if(state.execution_location!=='owner-local')reasons.push('remote-execution-denied');
  if(!['owner-local','none'].includes(state.provider_location))reasons.push('remote-provider-denied');
  if(state.requested_effect!=='none')reasons.push('degraded-external-effect-denied');
  subset(state.requested_capabilities,policy.allowed_local_capabilities,'capability-not-allowed',reasons);
  subset(state.requested_data_classes,policy.allowed_data_classes,'data-class-not-allowed',reasons);
  if(reasons.length)return decision('stop-denied',reasons);
  return decision('local-cognition-eligible',['effect-ceiling:none']);
}

function decision(action,reasons){
  return Object.freeze({
    schema:'axiom-task-continuity-evaluation.v0',
    continuity_action:action,
    reasons:Object.freeze([...reasons]),
    effect_ceiling:'none',
    continuity_effect:'none',
    authority_effect:'none',
    execution_effect:'none',
    runtime_activation:false
  });
}

function validateState(state){
  exactObject(state,'Task continuity state',[
    'network_state','degraded_since','assessed_at','outcome_digest','task_digest','authority_snapshot_ref','authority_current',
    'budget_ref','budget_current','execution_location','provider_location',
    'requested_capabilities','requested_data_classes','requested_effect'
  ]);
  if(!NETWORK_STATES.has(state.network_state))throw new ValidationError('network_state is invalid');
  if(state.degraded_since!==null)canonicalDate(state.degraded_since,'degraded_since');
  canonicalDate(state.assessed_at,'assessed_at');
  digest(state.outcome_digest,'outcome_digest');digest(state.task_digest,'task_digest');
  id(state.authority_snapshot_ref,'authority_snapshot_ref');
  if(typeof state.authority_current!=='boolean')throw new ValidationError('authority_current must be boolean');
  id(state.budget_ref,'budget_ref');
  if(typeof state.budget_current!=='boolean')throw new ValidationError('budget_current must be boolean');
  if(!LOCATIONS.has(state.execution_location))throw new ValidationError('execution_location is invalid');
  if(!PROVIDERS.has(state.provider_location))throw new ValidationError('provider_location is invalid');
  idArray(state.requested_capabilities,'requested_capabilities',128);
  textArray(state.requested_data_classes,'requested_data_classes',128,512);
  if(!EFFECTS.has(state.requested_effect))throw new ValidationError('requested_effect is invalid');
}
function subset(actual,allowed,prefix,reasons){const set=new Set(allowed);for(const item of actual)if(!set.has(item))reasons.push(prefix+':'+item);}
function exactObject(value,label,fields){if(!value||typeof value!=='object'||Array.isArray(value))throw new ValidationError(label+' must be an object');const a=Object.keys(value).sort().join(',');const e=[...fields].sort().join(',');if(a!==e)throw new ValidationError(label+' fields are invalid');}
function id(value,label){if(typeof value!=='string'||!ID.test(value))throw new ValidationError(label+' is invalid');}
function digest(value,label){if(typeof value!=='string'||!DIGEST.test(value))throw new ValidationError(label+' must be a lowercase sha256 digest');}
function idArray(value,label,max){if(!Array.isArray(value)||value.length>max)throw new ValidationError(label+' is invalid');const s=new Set();for(const item of value){id(item,label+' item');if(s.has(item))throw new ValidationError(label+' contains duplicate values');s.add(item);}}
function textArray(value,label,max,itemMax){if(!Array.isArray(value)||value.length>max)throw new ValidationError(label+' is invalid');const s=new Set();for(const item of value){if(typeof item!=='string'||item.length<1||item.length>itemMax)throw new ValidationError(label+' item is invalid');if(s.has(item))throw new ValidationError(label+' contains duplicate values');s.add(item);}}
function integer(value,label,min,max){if(!Number.isSafeInteger(value)||value<min||value>max)throw new ValidationError(label+' is invalid');}
function canonicalDate(value,label){if(typeof value!=='string'||value.length>64)throw new ValidationError(label+' must be a canonical ISO timestamp');const d=new Date(value);if(!Number.isFinite(d.getTime())||d.toISOString()!==value)throw new ValidationError(label+' must be a canonical ISO timestamp');return d.getTime();}
