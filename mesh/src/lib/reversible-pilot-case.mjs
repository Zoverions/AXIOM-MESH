import {
  ValidationError,
  assertPlainObject,
  assertString,
  assertStringArray
} from './canonical.mjs';

export const REVERSIBLE_PILOT_CASE_SCHEMA='axiom-reversible-pilot-case.v1';

const ID=/^[A-Za-z0-9][A-Za-z0-9_.:/-]{0,191}$/;
const DIGEST=/^[a-f0-9]{64}$/;
const RISK=new Set(['synthetic','low_consequence']);
const OUTCOMES=new Set(['passed','failed','inconclusive','stopped']);

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

export function validateReversiblePilotCase(raw){
  const v=exact(raw,[
    'schema','pilot_case_id','workflow_class','risk_class','synthetic_or_governed_data',
    'effect','assurance','policy','explanation','challenge','rollback',
    'observations','result','promotion','authority','limitations'
  ],'reversible pilot case');

  if(v.schema!==REVERSIBLE_PILOT_CASE_SCHEMA) throw new ValidationError('reversible pilot case schema is invalid');

  id(v.pilot_case_id,'pilot_case_id');
  id(v.workflow_class,'workflow_class');
  const risk=id(v.risk_class,'risk_class');
  if(!RISK.has(risk)) throw new ValidationError('risk_class must be synthetic or low_consequence');

  const data=exact(v.synthetic_or_governed_data,['mode','evidence_ref','real_sensitive_data_used'],'synthetic_or_governed_data');
  id(data.mode,'synthetic_or_governed_data.mode');
  assertString(data.evidence_ref,'synthetic_or_governed_data.evidence_ref',{min:1,max:512});
  if(data.real_sensitive_data_used!==false){
    throw new ValidationError('reversible pilot profile forbids real sensitive data');
  }

  const effect=exact(v.effect,[
    'performed','reversible','consequential','external_effect',
    'rollback_or_compensation_ref'
  ],'effect');
  for(const field of ['performed','reversible','consequential','external_effect']){
    if(typeof effect[field]!=='boolean') throw new ValidationError(`effect.${field} must be boolean`);
  }
  if(effect.consequential===true) throw new ValidationError('reversible pilot profile forbids consequential effects');
  if(effect.external_effect===true && !effect.reversible){
    throw new ValidationError('external pilot effect must be reversible');
  }
  if(effect.performed && effect.rollback_or_compensation_ref===null){
    throw new ValidationError('performed pilot effect requires rollback or compensation reference');
  }
  if(effect.rollback_or_compensation_ref!==null){
    assertString(effect.rollback_or_compensation_ref,'effect.rollback_or_compensation_ref',{min:1,max:512});
  }

  const assurance=exact(v.assurance,[
    'required_vector_ref','evaluation_ref','satisfied_before_effect'
  ],'assurance');
  assertString(assurance.required_vector_ref,'assurance.required_vector_ref',{min:1,max:512});
  assertString(assurance.evaluation_ref,'assurance.evaluation_ref',{min:1,max:512});
  if(assurance.satisfied_before_effect!==true){
    throw new ValidationError('pilot assurance must be satisfied before effect');
  }

  const policy=exact(v.policy,[
    'conflict_decision_ref','downgrade_checks_passed','fallback_checks_passed'
  ],'policy');
  assertString(policy.conflict_decision_ref,'policy.conflict_decision_ref',{min:1,max:512});
  if(policy.downgrade_checks_passed!==true) throw new ValidationError('downgrade checks must pass');
  if(policy.fallback_checks_passed!==true) throw new ValidationError('fallback checks must pass');

  const explanation=exact(v.explanation,[
    'explanation_ref','available_before_effect','uncertainty_preserved'
  ],'explanation');
  assertString(explanation.explanation_ref,'explanation.explanation_ref',{min:1,max:512});
  if(explanation.available_before_effect!==true) throw new ValidationError('explanation must be available before effect');
  if(explanation.uncertainty_preserved!==true) throw new ValidationError('explanation must preserve uncertainty');

  const challenge=exact(v.challenge,[
    'window_ref','evidence_retained','review_path_available'
  ],'challenge');
  assertString(challenge.window_ref,'challenge.window_ref',{min:1,max:512});
  if(challenge.evidence_retained!==true) throw new ValidationError('challenge evidence must be retained');
  if(typeof challenge.review_path_available!=='boolean') throw new ValidationError('challenge.review_path_available must be boolean');

  const rollback=exact(v.rollback,[
    'pretested','attempted','succeeded','evidence_ref'
  ],'rollback');
  if(rollback.pretested!==true) throw new ValidationError('rollback must be pretested');
  if(typeof rollback.attempted!=='boolean'||typeof rollback.succeeded!=='boolean'){
    throw new ValidationError('rollback attempted/succeeded flags must be boolean');
  }
  assertString(rollback.evidence_ref,'rollback.evidence_ref',{min:1,max:512});
  if(rollback.attempted && !rollback.succeeded){
    throw new ValidationError('attempted rollback must succeed for pilot pass eligibility');
  }

  if(!Array.isArray(v.observations)||v.observations.length===0||v.observations.length>128){
    throw new ValidationError('pilot requires 1-128 observations');
  }
  for(const [i,oRaw] of v.observations.entries()){
    const o=exact(oRaw,['metric','result','evidence_ref'],`observations[${i}]`);
    id(o.metric,`observations[${i}].metric`);
    id(o.result,`observations[${i}].result`);
    assertString(o.evidence_ref,`observations[${i}].evidence_ref`,{min:1,max:512});
  }

  const result=exact(v.result,['outcome','completed_at','evidence_digest'],'result');
  const outcome=id(result.outcome,'result.outcome');
  if(!OUTCOMES.has(outcome)) throw new ValidationError('pilot result outcome is invalid');
  timestamp(result.completed_at,'result.completed_at');
  digest(result.evidence_digest,'result.evidence_digest');

  const promotion=exact(v.promotion,[
    'production_promoted','consequential_use_promoted','public_supported_claim_added'
  ],'promotion');
  for(const [field,val] of Object.entries(promotion)){
    if(val!==false) throw new ValidationError(`promotion.${field} must be false`);
  }

  const authority=exact(v.authority,[
    'pilot_grants_authority','pilot_success_grants_future_authority'
  ],'authority');
  if(authority.pilot_grants_authority!==false) throw new ValidationError('pilot cannot grant authority');
  if(authority.pilot_success_grants_future_authority!==false) throw new ValidationError('pilot success cannot grant future authority');

  const limits=assertStringArray(v.limitations,'limitations',{maxItems:64,itemMax:1024});
  if(limits.length===0) throw new ValidationError('reversible pilot case must declare limitations');

  return Object.freeze({
    valid:true,
    pilot_case_id:v.pilot_case_id,
    outcome,
    risk_class:risk,
    production_promoted:false,
    consequential_use_promoted:false,
    authority_effect:'none'
  });
}
