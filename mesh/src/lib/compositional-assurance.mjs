import { ValidationError, assertPlainObject, assertString } from './canonical.mjs';

export const ASSURANCE_VECTOR_SCHEMA='axiom-assurance-vector-evaluation.v1';

const DIMENSIONS=new Set([
  'identity','authority','execution','evidence',
  'independent_verification','currentness','privacy','recovery'
]);

const REQUIREMENT_RANK=Object.freeze({
  not_required:0,
  required:1
});

const OBSERVATION_STATES=new Set([
  'not_required','attempted','achieved','failed','unknown'
]);

function exact(raw,fields,label){
  const v=assertPlainObject(raw,label), allowed=new Set(fields);
  for(const k of Object.keys(v)) if(!allowed.has(k)) throw new ValidationError(`${label} contains unsupported field ${k}`);
  for(const k of fields) if(!Object.hasOwn(v,k)) throw new ValidationError(`${label} is missing required field ${k}`);
  return v;
}

function normalizeRequirements(raw,label){
  const v=assertPlainObject(raw,label);
  const out={};
  for(const [dimension,state] of Object.entries(v)){
    if(!DIMENSIONS.has(dimension)) throw new ValidationError(`${label} contains unknown dimension ${dimension}`);
    if(!Object.hasOwn(REQUIREMENT_RANK,state)) throw new ValidationError(`${label}.${dimension} requirement is invalid`);
    out[dimension]=state;
  }
  return out;
}

function normalizeObserved(raw,label){
  const v=assertPlainObject(raw,label);
  const out={};
  for(const [dimension,state] of Object.entries(v)){
    if(!DIMENSIONS.has(dimension)) throw new ValidationError(`${label} contains unknown dimension ${dimension}`);
    if(!OBSERVATION_STATES.has(state)) throw new ValidationError(`${label}.${dimension} state is invalid`);
    out[dimension]=state;
  }
  return out;
}

export function composeRequiredAssurance(floors){
  if(!Array.isArray(floors)||floors.length===0) throw new ValidationError('assurance floors must be a non-empty array');

  const composed=Object.fromEntries([...DIMENSIONS].map(d=>[d,'not_required']));
  const sources={};

  for(const [index,rawFloor] of floors.entries()){
    const floor=exact(rawFloor,['source','requirements'],`floors[${index}]`);
    const source=assertString(floor.source,`floors[${index}].source`,{min:1,max:192});
    const requirements=normalizeRequirements(floor.requirements,`floors[${index}].requirements`);

    for(const [dimension,state] of Object.entries(requirements)){
      if(REQUIREMENT_RANK[state]>REQUIREMENT_RANK[composed[dimension]]){
        composed[dimension]=state;
        sources[dimension]=[source];
      }else if(state===composed[dimension] && state==='required'){
        sources[dimension]=[...(sources[dimension]??[]),source];
      }
    }
  }

  return Object.freeze({
    required_assurance:Object.freeze({...composed}),
    floor_sources:Object.freeze(Object.fromEntries(
      Object.entries(sources).map(([k,v])=>[k,Object.freeze([...new Set(v)])])
    ))
  });
}

export function evaluateAssuranceVector(raw){
  const v=exact(raw,[
    'schema','required_assurance','attempted_assurance','observed_assurance',
    'degraded_mode','authority'
  ],'assurance vector evaluation');

  if(v.schema!==ASSURANCE_VECTOR_SCHEMA) throw new ValidationError('assurance vector schema is invalid');

  const required=normalizeRequirements(v.required_assurance,'required_assurance');
  const attempted=normalizeObserved(v.attempted_assurance,'attempted_assurance');
  const observed=normalizeObserved(v.observed_assurance,'observed_assurance');

  const degraded=exact(v.degraded_mode,['mode','allow_effect'],'degraded_mode');
  const mode=assertString(degraded.mode,'degraded_mode.mode',{min:1,max:64});
  if(!['deny','hold_pending','advisory_only'].includes(mode)) throw new ValidationError('degraded_mode.mode is invalid');
  if(degraded.allow_effect!==false) throw new ValidationError('degraded mode cannot authorize consequential effect in this profile');

  const authority=exact(v.authority,['assurance_grants_authority','higher_assurance_widens_scope'],'authority');
  if(authority.assurance_grants_authority!==false) throw new ValidationError('assurance cannot grant authority');
  if(authority.higher_assurance_widens_scope!==false) throw new ValidationError('higher assurance cannot widen scope');

  const achieved=[], failed=[], unknown=[], missingAttempt=[];
  for(const dimension of DIMENSIONS){
    if(required[dimension]!=='required') continue;
    const obs=observed[dimension]??'unknown';
    const att=attempted[dimension]??'unknown';

    if(obs==='achieved') achieved.push(dimension);
    else if(obs==='failed') failed.push(dimension);
    else unknown.push(dimension);

    if(att!=='attempted' && att!=='achieved') missingAttempt.push(dimension);
  }

  const satisfied=failed.length===0 && unknown.length===0;

  return Object.freeze({
    valid:true,
    satisfied,
    required_dimensions:Object.freeze([...achieved,...failed,...unknown].sort()),
    achieved_assurance:Object.freeze([...achieved].sort()),
    failed_assurance:Object.freeze([...failed].sort()),
    unknown_assurance:Object.freeze([...unknown].sort()),
    attempted_assurance:Object.freeze(
      Object.entries(attempted).filter(([,s])=>s==='attempted'||s==='achieved').map(([d])=>d).sort()
    ),
    missing_attempt:Object.freeze([...missingAttempt].sort()),
    degraded_outcome:satisfied?'not_needed':mode,
    authority_effect:'none'
  });
}
