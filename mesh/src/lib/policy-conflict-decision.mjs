import {
  ValidationError,
  assertPlainObject,
  assertString,
  assertStringArray
} from './canonical.mjs';

export const POLICY_CONFLICT_DECISION_SCHEMA='axiom-policy-conflict-decision.v1';

const ID=/^[A-Za-z0-9][A-Za-z0-9_.:/-]{0,191}$/;
const DIGEST=/^[a-f0-9]{64}$/;
const OUTCOMES=new Set([
  'compatible','narrowed','denied','unresolved_conflict','appeal_or_exception_required'
]);

function exact(raw,fields,label){
  const v=assertPlainObject(raw,label),allowed=new Set(fields);
  for(const k of Object.keys(v)) if(!allowed.has(k)) throw new ValidationError(`${label} contains unsupported field ${k}`);
  for(const k of fields) if(!Object.hasOwn(v,k)) throw new ValidationError(`${label} is missing required field ${k}`);
  return v;
}
function id(v,l){return assertString(v,l,{min:1,max:192,pattern:ID});}
function digest(v,l){return assertString(v,l,{min:64,max:64,pattern:DIGEST});}

export function validatePolicyConflictDecision(raw){
  const v=exact(raw,[
    'schema','decision_id','action_id','policy_layers','conflicts',
    'fallback','resolution','exception','authority','limitations'
  ],'policy conflict decision');

  if(v.schema!==POLICY_CONFLICT_DECISION_SCHEMA){
    throw new ValidationError('policy conflict decision schema is invalid');
  }

  id(v.decision_id,'decision_id');
  id(v.action_id,'action_id');

  if(!Array.isArray(v.policy_layers)||v.policy_layers.length===0||v.policy_layers.length>64){
    throw new ValidationError('policy conflict decision requires 1-64 policy_layers');
  }

  const layerIds=new Set();
  for(const [i,rawLayer] of v.policy_layers.entries()){
    const layer=exact(rawLayer,[
      'layer_id','source_type','policy_digest','non_waivable',
      'effect','minimum_assurance_rank','allowed_values'
    ],`policy_layers[${i}]`);

    const layerId=id(layer.layer_id,`policy_layers[${i}].layer_id`);
    if(layerIds.has(layerId)) throw new ValidationError('policy layer IDs must be unique');
    layerIds.add(layerId);

    id(layer.source_type,`policy_layers[${i}].source_type`);
    digest(layer.policy_digest,`policy_layers[${i}].policy_digest`);

    if(typeof layer.non_waivable!=='boolean'){
      throw new ValidationError(`policy_layers[${i}].non_waivable must be boolean`);
    }

    if(!['allow','deny','unspecified'].includes(layer.effect)){
      throw new ValidationError('policy layer effect is invalid');
    }

    if(layer.minimum_assurance_rank!==null &&
       (!Number.isInteger(layer.minimum_assurance_rank)||layer.minimum_assurance_rank<0)){
      throw new ValidationError('minimum_assurance_rank must be null or a non-negative integer');
    }

    assertStringArray(layer.allowed_values,`policy_layers[${i}].allowed_values`,{
      maxItems:256,itemMax:512
    });
  }

  if(!Array.isArray(v.conflicts)||v.conflicts.length>128){
    throw new ValidationError('conflicts must be an array with at most 128 entries');
  }

  for(const [i,rawConflict] of v.conflicts.entries()){
    const conflict=exact(rawConflict,[
      'conflict_id','conflict_class','layer_refs','description','resolved'
    ],`conflicts[${i}]`);
    id(conflict.conflict_id,`conflicts[${i}].conflict_id`);
    id(conflict.conflict_class,`conflicts[${i}].conflict_class`);
    const refs=assertStringArray(conflict.layer_refs,`conflicts[${i}].layer_refs`,{
      maxItems:64,itemMax:192
    });
    if(refs.length<2) throw new ValidationError('policy conflict requires at least two layer refs');
    for(const ref of refs){
      if(!layerIds.has(ref)) throw new ValidationError('policy conflict references unknown layer');
    }
    assertString(conflict.description,`conflicts[${i}].description`,{min:1,max:2048});
    if(typeof conflict.resolved!=='boolean'){
      throw new ValidationError(`conflicts[${i}].resolved must be boolean`);
    }
  }

  const fallback=exact(v.fallback,[
    'requested','candidate_id','independently_eligible','same_or_stricter_policy'
  ],'fallback');
  if(typeof fallback.requested!=='boolean'||
     typeof fallback.independently_eligible!=='boolean'||
     typeof fallback.same_or_stricter_policy!=='boolean'){
    throw new ValidationError('fallback flags must be boolean');
  }
  if(fallback.candidate_id!==null) id(fallback.candidate_id,'fallback.candidate_id');

  if(fallback.requested && (!fallback.independently_eligible || !fallback.same_or_stricter_policy)){
    throw new ValidationError('fallback candidate cannot weaken composed policy');
  }

  const resolution=exact(v.resolution,[
    'outcome','effective_effect','effective_minimum_assurance_rank',
    'effective_allowed_values','unresolved_reason'
  ],'resolution');
  const outcome=id(resolution.outcome,'resolution.outcome');
  if(!OUTCOMES.has(outcome)) throw new ValidationError('resolution outcome is invalid');

  if(!['allow','deny'].includes(resolution.effective_effect)){
    throw new ValidationError('resolution.effective_effect must be allow or deny');
  }

  if(!Number.isInteger(resolution.effective_minimum_assurance_rank)||
      resolution.effective_minimum_assurance_rank<0){
    throw new ValidationError('effective_minimum_assurance_rank must be a non-negative integer');
  }

  assertStringArray(resolution.effective_allowed_values,'resolution.effective_allowed_values',{
    maxItems:256,itemMax:512
  });

  if(resolution.unresolved_reason!==null){
    assertString(resolution.unresolved_reason,'resolution.unresolved_reason',{min:1,max:2048});
  }

  const nonWaivableDeny=v.policy_layers.some(layer=>layer.non_waivable && layer.effect==='deny');
  if(nonWaivableDeny && resolution.effective_effect!=='deny'){
    throw new ValidationError('non-waivable deny cannot be weakened');
  }

  const requiredAssurance=Math.max(
    0,
    ...v.policy_layers
      .filter(layer=>layer.minimum_assurance_rank!==null)
      .map(layer=>layer.minimum_assurance_rank)
  );
  if(resolution.effective_minimum_assurance_rank<requiredAssurance){
    throw new ValidationError('effective assurance cannot be lower than strongest policy floor');
  }

  const finiteAllowlists=v.policy_layers
    .map(layer=>layer.allowed_values)
    .filter(values=>values.length>0);

  if(finiteAllowlists.length>0){
    let intersection=new Set(finiteAllowlists[0]);
    for(const values of finiteAllowlists.slice(1)){
      intersection=new Set(values.filter(value=>intersection.has(value)));
    }
    for(const value of resolution.effective_allowed_values){
      if(!intersection.has(value)){
        throw new ValidationError('effective allowlist cannot widen policy-layer intersection');
      }
    }
  }

  const unresolved=v.conflicts.some(conflict=>!conflict.resolved);
  if(unresolved && !['unresolved_conflict','appeal_or_exception_required','denied'].includes(outcome)){
    throw new ValidationError('unresolved policy conflict cannot resolve to success');
  }

  const exception=exact(v.exception,[
    'present','authority_ref','scope','expires_at','review_ref'
  ],'exception');
  if(typeof exception.present!=='boolean') throw new ValidationError('exception.present must be boolean');
  for(const field of ['authority_ref','scope','expires_at','review_ref']){
    if(exception[field]!==null){
      assertString(exception[field],`exception.${field}`,{min:1,max:512});
    }
  }
  if(exception.present && [exception.authority_ref,exception.scope,exception.expires_at,exception.review_ref].some(value=>value===null)){
    throw new ValidationError('explicit exception requires authority, scope, expiry, and review');
  }

  const authority=exact(v.authority,[
    'conflict_resolution_grants_authority',
    'exception_presence_grants_success',
    'fallback_grants_authority'
  ],'authority');
  for(const [field,value] of Object.entries(authority)){
    if(value!==false) throw new ValidationError(`authority.${field} must be false`);
  }

  const limitations=assertStringArray(v.limitations,'limitations',{maxItems:64,itemMax:1024});
  if(limitations.length===0) throw new ValidationError('policy conflict decision must declare limitations');

  return Object.freeze({
    valid:true,
    outcome,
    effective_effect:resolution.effective_effect,
    effective_minimum_assurance_rank:resolution.effective_minimum_assurance_rank,
    unresolved_conflict:unresolved,
    authority_effect:'none'
  });
}
