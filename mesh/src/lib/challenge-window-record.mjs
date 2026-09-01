import {
  ValidationError,
  assertPlainObject,
  assertString,
  assertStringArray
} from './canonical.mjs';

export const CHALLENGE_WINDOW_RECORD_SCHEMA='axiom-challenge-window-record.v1';

const ID=/^[A-Za-z0-9][A-Za-z0-9_.:/-]{0,191}$/;
const DIGEST=/^[a-f0-9]{64}$/;
const STATES=new Set([
  'provisional','accepted_local','challengeable','stayed','appealed',
  'reversed','superseded','expired','finalized'
]);
const RETENTION=new Set([
  'ephemeral','minimum_receipt','reviewable','appeal_preserved',
  'legal_or_policy_hold','archival'
]);

function exact(raw,fields,label){
  const v=assertPlainObject(raw,label),allowed=new Set(fields);
  for(const k of Object.keys(v)) if(!allowed.has(k)) throw new ValidationError(`${label} contains unsupported field ${k}`);
  for(const k of fields) if(!Object.hasOwn(v,k)) throw new ValidationError(`${label} is missing required field ${k}`);
  return v;
}
function id(v,l){return assertString(v,l,{min:1,max:192,pattern:ID});}
function digest(v,l){return assertString(v,l,{min:64,max:64,pattern:DIGEST});}
function timestamp(v,l){
  const t=assertString(v,l,{min:24,max:24});
  const d=new Date(t);
  if(Number.isNaN(d.valueOf())||d.toISOString()!==t) throw new ValidationError(`${l} must be canonical UTC ISO`);
  return t;
}

export function validateChallengeWindowRecord(raw,{now=new Date()}={}){
  const v=exact(raw,[
    'schema','record_id','subject_event_id','subject_event_digest',
    'finality_state','challenge','retention','optimistic_effect',
    'authority','limitations'
  ],'challenge window record');

  if(v.schema!==CHALLENGE_WINDOW_RECORD_SCHEMA) throw new ValidationError('challenge window schema is invalid');

  id(v.record_id,'record_id');
  id(v.subject_event_id,'subject_event_id');
  digest(v.subject_event_digest,'subject_event_digest');

  const state=id(v.finality_state,'finality_state');
  if(!STATES.has(state)) throw new ValidationError('finality_state is invalid');

  const challenge=exact(v.challenge,[
    'opens_at','closes_at','eligible_challenger_refs',
    'active_challenge_refs','escalation_target_ref'
  ],'challenge');
  const opens=timestamp(challenge.opens_at,'challenge.opens_at');
  const closes=timestamp(challenge.closes_at,'challenge.closes_at');
  if(new Date(closes).valueOf()<=new Date(opens).valueOf()) throw new ValidationError('challenge closes_at must be after opens_at');

  const eligible=assertStringArray(challenge.eligible_challenger_refs,'challenge.eligible_challenger_refs',{maxItems:128,itemMax:512});
  if(eligible.length===0) throw new ValidationError('challenge window requires eligible challengers');
  const active=assertStringArray(challenge.active_challenge_refs,'challenge.active_challenge_refs',{maxItems:128,itemMax:512});
  if(challenge.escalation_target_ref!==null) assertString(challenge.escalation_target_ref,'challenge.escalation_target_ref',{min:1,max:512});

  const retention=exact(v.retention,[
    'class','minimum_until','evidence_refs','hold_refs',
    'raw_material_may_be_minimized','deletion_allowed'
  ],'retention');
  const retentionClass=id(retention.class,'retention.class');
  if(!RETENTION.has(retentionClass)) throw new ValidationError('retention class is invalid');
  const minimumUntil=timestamp(retention.minimum_until,'retention.minimum_until');
  const evidence=assertStringArray(retention.evidence_refs,'retention.evidence_refs',{maxItems:256,itemMax:512});
  if(evidence.length===0) throw new ValidationError('retention requires evidence refs');
  const holds=assertStringArray(retention.hold_refs,'retention.hold_refs',{maxItems:64,itemMax:512});
  if(typeof retention.raw_material_may_be_minimized!=='boolean'||typeof retention.deletion_allowed!=='boolean'){
    throw new ValidationError('retention flags must be boolean');
  }

  const nowMs=now instanceof Date?now.valueOf():new Date(now).valueOf();
  if(!Number.isFinite(nowMs)) throw new ValidationError('now is invalid');

  const challengeOpen=nowMs>=new Date(opens).valueOf() && nowMs<new Date(closes).valueOf();
  const protectedByProcedure=challengeOpen || active.length>0 || holds.length>0 || nowMs<new Date(minimumUntil).valueOf();

  if(protectedByProcedure && retention.deletion_allowed){
    throw new ValidationError('deletion cannot be allowed while challenge/appeal/hold retention remains active');
  }

  const optimistic=exact(v.optimistic_effect,[
    'performed','reversible','rollback_or_compensation_ref','preexecution_assurance_satisfied'
  ],'optimistic_effect');
  for(const field of ['performed','reversible','preexecution_assurance_satisfied']){
    if(typeof optimistic[field]!=='boolean') throw new ValidationError(`optimistic_effect.${field} must be boolean`);
  }
  if(optimistic.rollback_or_compensation_ref!==null){
    assertString(optimistic.rollback_or_compensation_ref,'optimistic_effect.rollback_or_compensation_ref',{min:1,max:512});
  }
  if(optimistic.performed && (!optimistic.reversible || optimistic.rollback_or_compensation_ref===null)){
    throw new ValidationError('optimistic effect requires reversibility and rollback/compensation reference');
  }

  const authority=exact(v.authority,[
    'challenge_grants_runtime_authority',
    'finality_grants_truth',
    'retention_grants_disclosure',
    'hold_grants_unrelated_authority'
  ],'authority');
  for(const [field,val] of Object.entries(authority)){
    if(val!==false) throw new ValidationError(`authority.${field} must be false`);
  }

  const limitations=assertStringArray(v.limitations,'limitations',{maxItems:64,itemMax:1024});
  if(limitations.length===0) throw new ValidationError('challenge window record must declare limitations');

  return Object.freeze({
    valid:true,
    finality_state:state,
    challenge_open:challengeOpen,
    procedural_retention_active:protectedByProcedure,
    authority_effect:'none',
    truth_effect:'none'
  });
}
