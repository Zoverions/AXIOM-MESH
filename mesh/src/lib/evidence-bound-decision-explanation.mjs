import {
  ValidationError,
  assertPlainObject,
  assertString,
  assertStringArray
} from './canonical.mjs';

export const DECISION_EXPLANATION_SCHEMA='axiom-evidence-bound-decision-explanation.v1';

const ID=/^[A-Za-z0-9][A-Za-z0-9_.:/-]{0,191}$/;
const OUTCOMES=new Set([
  'allow_candidate','denied','hold_pending','advisory_only',
  'unresolved_conflict','appeal_or_exception_required'
]);
const CERTAINTY=new Set([
  'established_for_declared_scope','supported_but_incomplete','unknown',
  'conflicted','stale','failed_check','not_evaluated'
]);

function exact(raw,fields,label){
  const v=assertPlainObject(raw,label),allowed=new Set(fields);
  for(const k of Object.keys(v)) if(!allowed.has(k)) throw new ValidationError(`${label} contains unsupported field ${k}`);
  for(const k of fields) if(!Object.hasOwn(v,k)) throw new ValidationError(`${label} is missing required field ${k}`);
  return v;
}
function id(v,l){return assertString(v,l,{min:1,max:192,pattern:ID});}

function validateReason(raw,label){
  const r=exact(raw,['code','category','certainty','summary','evidence_refs','policy_refs','sensitive'],label);
  id(r.code,`${label}.code`);
  id(r.category,`${label}.category`);
  const certainty=id(r.certainty,`${label}.certainty`);
  if(!CERTAINTY.has(certainty)) throw new ValidationError(`${label}.certainty is invalid`);
  assertString(r.summary,`${label}.summary`,{min:1,max:1024});
  assertStringArray(r.evidence_refs,`${label}.evidence_refs`,{maxItems:64,itemMax:512});
  assertStringArray(r.policy_refs,`${label}.policy_refs`,{maxItems:64,itemMax:512});
  if(typeof r.sensitive!=='boolean') throw new ValidationError(`${label}.sensitive must be boolean`);
  return certainty;
}

export function validateDecisionExplanation(raw){
  const v=exact(raw,[
    'schema','explanation_id','decision_ref','outcome','headline',
    'primary_reasons','required_but_unsatisfied_conditions','satisfied_conditions',
    'uncertainties','conflicts','assurance_summary','currentness_summary',
    'next_safe_actions','appeal_or_review_path','presentation','authority','limitations'
  ],'decision explanation');

  if(v.schema!==DECISION_EXPLANATION_SCHEMA) throw new ValidationError('decision explanation schema is invalid');

  id(v.explanation_id,'explanation_id');
  assertString(v.decision_ref,'decision_ref',{min:1,max:512});
  const outcome=id(v.outcome,'outcome');
  if(!OUTCOMES.has(outcome)) throw new ValidationError('decision explanation outcome is invalid');
  assertString(v.headline,'headline',{min:1,max:512});

  const reasonArrays=[
    ['primary_reasons',v.primary_reasons],
    ['required_but_unsatisfied_conditions',v.required_but_unsatisfied_conditions],
    ['satisfied_conditions',v.satisfied_conditions],
    ['uncertainties',v.uncertainties],
    ['conflicts',v.conflicts]
  ];

  const seen=new Set();
  for(const [name,items] of reasonArrays){
    if(!Array.isArray(items)||items.length>128) throw new ValidationError(`${name} must be an array with at most 128 entries`);
    for(const [i,item] of items.entries()){
      const certainty=validateReason(item,`${name}[${i}]`);
      if(seen.has(item.code)) throw new ValidationError('decision explanation reason codes must be unique');
      seen.add(item.code);
      if(name==='uncertainties' && !['unknown','stale','conflicted','supported_but_incomplete','not_evaluated'].includes(certainty)){
        throw new ValidationError('uncertainty reason must preserve an uncertainty-compatible certainty state');
      }
      if(name==='conflicts' && certainty!=='conflicted'){
        throw new ValidationError('conflict reason certainty must be conflicted');
      }
    }
  }

  if(v.primary_reasons.length===0) throw new ValidationError('decision explanation requires at least one primary reason');

  if(['denied','hold_pending','unresolved_conflict','appeal_or_exception_required'].includes(outcome)
     && v.required_but_unsatisfied_conditions.length===0
     && v.conflicts.length===0){
    throw new ValidationError('non-success explanation requires an unsatisfied condition or explicit conflict');
  }

  const assurance=exact(v.assurance_summary,[
    'required_dimensions','achieved_dimensions','failed_dimensions','unknown_dimensions'
  ],'assurance_summary');
  for(const field of Object.keys(assurance)){
    assertStringArray(assurance[field],`assurance_summary.${field}`,{maxItems:64,itemMax:192});
  }

  const currentness=exact(v.currentness_summary,['state','checked_refs'],'currentness_summary');
  const currentState=id(currentness.state,'currentness_summary.state');
  if(!CERTAINTY.has(currentState)) throw new ValidationError('currentness_summary.state is invalid');
  assertStringArray(currentness.checked_refs,'currentness_summary.checked_refs',{maxItems:64,itemMax:512});

  if(!Array.isArray(v.next_safe_actions)||v.next_safe_actions.length>32){
    throw new ValidationError('next_safe_actions must be an array with at most 32 entries');
  }
  for(const [i,aRaw] of v.next_safe_actions.entries()){
    const a=exact(aRaw,['action_code','summary','authority_effect'],`next_safe_actions[${i}]`);
    id(a.action_code,`next_safe_actions[${i}].action_code`);
    assertString(a.summary,`next_safe_actions[${i}].summary`,{min:1,max:1024});
    if(a.authority_effect!=='none') throw new ValidationError('explanation next action cannot grant authority');
  }

  const appeal=exact(v.appeal_or_review_path,['available','summary','reference'],'appeal_or_review_path');
  if(typeof appeal.available!=='boolean') throw new ValidationError('appeal_or_review_path.available must be boolean');
  if(appeal.summary!==null) assertString(appeal.summary,'appeal_or_review_path.summary',{min:1,max:1024});
  if(appeal.reference!==null) assertString(appeal.reference,'appeal_or_review_path.reference',{min:1,max:512});

  const presentation=exact(v.presentation,[
    'generated_from_recorded_fields_only','private_chain_of_thought_included',
    'may_hide_uncertainty','may_add_unrecorded_reasons'
  ],'presentation');
  if(presentation.generated_from_recorded_fields_only!==true){
    throw new ValidationError('explanation must be generated from recorded fields only');
  }
  if(presentation.private_chain_of_thought_included!==false){
    throw new ValidationError('private chain-of-thought must not be included');
  }
  if(presentation.may_hide_uncertainty!==false){
    throw new ValidationError('explanation may not hide uncertainty');
  }
  if(presentation.may_add_unrecorded_reasons!==false){
    throw new ValidationError('explanation may not add unrecorded reasons');
  }

  const authority=exact(v.authority,[
    'explanation_grants_authority','appeal_path_grants_success',
    'human_friendly_wording_changes_decision'
  ],'authority');
  for(const [field,val] of Object.entries(authority)){
    if(val!==false) throw new ValidationError(`authority.${field} must be false`);
  }

  const limits=assertStringArray(v.limitations,'limitations',{maxItems:64,itemMax:1024});
  if(limits.length===0) throw new ValidationError('decision explanation must declare limitations');

  return Object.freeze({
    valid:true,
    explanation_id:v.explanation_id,
    outcome,
    reason_count:seen.size,
    authority_effect:'none',
    chain_of_thought_included:false
  });
}
