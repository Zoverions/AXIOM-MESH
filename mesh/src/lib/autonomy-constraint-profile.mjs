import { digestObject, ValidationError } from './canonical.mjs';

export const AUTONOMY_CONSTRAINT_PROFILE_SCHEMA='axiom-autonomy-constraint-profile.v0';

const ID=/^[A-Za-z0-9][A-Za-z0-9_.:#/-]{0,191}$/;
const CURRENCY=/^[A-Z]{3}$/;
const CONSEQUENCE=new Map([['C0',0],['C1',1],['C2',2],['C3',3]]);
const REVOCATION=new Set(['active','revoked','unknown']);
const TRIGGERS=new Set(['manual','scheduled','condition-triggered']);
const CONFIRMATION=new Map([['none',0],['user-presence',1],['explicit-confirmation',2],['independent-approval',3]]);

export function validateAutonomyConstraintProfile(document){
  exactObject(document,'Autonomy constraint profile',[
    'schema','version','status','profile_id','principal_id','source_authority_refs',
    'valid_from','expires_at','revocation_state','allowed_purpose_refs','allowed_capabilities',
    'allowed_data_classes','allowed_destinations','max_consequence_class','max_cost',
    'allowed_trigger_modes','confirmation_floor','may_widen_authority',
    'grants_authority','execution_effect','runtime_activation'
  ]);
  if(
    document.schema!==AUTONOMY_CONSTRAINT_PROFILE_SCHEMA||document.version!==0
    ||document.status!=='inert-narrowing-overlay'||document.may_widen_authority!==false
    ||document.grants_authority!==false||document.execution_effect!=='none'
    ||document.runtime_activation!==false
  )throw new ValidationError('Autonomy constraint authority boundary is invalid');
  id(document.profile_id,'profile_id');id(document.principal_id,'principal_id');
  idArray(document.source_authority_refs,'source_authority_refs',1,64);
  const from=canonicalDate(document.valid_from,'valid_from');
  const expires=canonicalDate(document.expires_at,'expires_at');
  if(expires<=from)throw new ValidationError('expires_at must follow valid_from');
  if(!REVOCATION.has(document.revocation_state))throw new ValidationError('revocation_state is invalid');
  idArray(document.allowed_purpose_refs,'allowed_purpose_refs',1,64);
  idArray(document.allowed_capabilities,'allowed_capabilities',1,128);
  textArray(document.allowed_data_classes,'allowed_data_classes',0,128,512);
  textArray(document.allowed_destinations,'allowed_destinations',0,128,1024);
  if(!CONSEQUENCE.has(document.max_consequence_class))throw new ValidationError('max_consequence_class is invalid');
  validateMaxCost(document.max_cost);
  enumArray(document.allowed_trigger_modes,'allowed_trigger_modes',TRIGGERS,1,3);
  if(!CONFIRMATION.has(document.confirmation_floor))throw new ValidationError('confirmation_floor is invalid');
  return Object.freeze({valid:true,schema:document.schema,profile_id:document.profile_id,profile_digest:digestObject(document),authority_effect:'none',execution_effect:'none',runtime_activation:false});
}

export function autonomyConstraintProfileDigest(document){validateAutonomyConstraintProfile(document);return digestObject(document);}

export function evaluateAutonomyConstraint(profile,proposal,current){
  validateAutonomyConstraintProfile(profile);
  validateProposal(proposal);
  exactObject(current,'Autonomy current state',['assessed_at','authority_current','current_authority_refs']);
  const assessed=canonicalDate(current.assessed_at,'assessed_at');
  if(typeof current.authority_current!=='boolean')throw new ValidationError('authority_current must be boolean');
  idArray(current.current_authority_refs,'current_authority_refs',0,128);
  const reasons=[];
  const from=canonicalDate(profile.valid_from,'valid_from');
  const expires=canonicalDate(profile.expires_at,'expires_at');
  if(assessed<from||assessed>=expires)reasons.push('profile-not-current');
  if(profile.revocation_state!=='active')reasons.push('profile-not-active');
  if(current.authority_current!==true)reasons.push('source-authority-not-current');
  const currentRefs=new Set(current.current_authority_refs);
  for(const refValue of profile.source_authority_refs)if(!currentRefs.has(refValue))reasons.push('source-authority-missing:'+refValue);
  if(proposal.principal_id!==profile.principal_id)reasons.push('principal-mismatch');
  if(!profile.allowed_purpose_refs.includes(proposal.purpose_ref))reasons.push('purpose-not-allowed');
  if(!profile.allowed_capabilities.includes(proposal.capability))reasons.push('capability-not-allowed');
  subset(proposal.data_classes,profile.allowed_data_classes,'data-class-not-allowed',reasons);
  if(proposal.destination!==null&&!profile.allowed_destinations.includes(proposal.destination))reasons.push('destination-not-allowed');
  if(CONSEQUENCE.get(proposal.consequence_class)>CONSEQUENCE.get(profile.max_consequence_class))reasons.push('consequence-exceeds-ceiling');
  if(!profile.allowed_trigger_modes.includes(proposal.trigger_mode))reasons.push('trigger-mode-not-allowed');
  if(CONFIRMATION.get(proposal.confirmation_level)<CONFIRMATION.get(profile.confirmation_floor))reasons.push('confirmation-below-floor');
  if(profile.max_cost!==null){
    if(proposal.cost===null)reasons.push('cost-unknown');
    else if(proposal.cost.currency!==profile.max_cost.currency)reasons.push('cost-currency-mismatch');
    else if(proposal.cost.minor_units>profile.max_cost.max_minor_units)reasons.push('cost-exceeds-ceiling');
  }
  return Object.freeze({
    within_envelope:reasons.length===0,
    reasons:Object.freeze(reasons),
    profile_id:profile.profile_id,
    profile_digest:digestObject(profile),
    evaluation_effect:'none',
    may_widen_authority:false,
    grants_authority:false,
    execution_effect:'none',
    runtime_activation:false
  });
}

function validateProposal(p){
  exactObject(p,'Autonomy proposal',[
    'principal_id','purpose_ref','capability','data_classes','destination',
    'consequence_class','cost','trigger_mode','confirmation_level'
  ]);
  id(p.principal_id,'principal_id');id(p.purpose_ref,'purpose_ref');id(p.capability,'capability');
  textArray(p.data_classes,'data_classes',0,128,512);
  if(p.destination!==null)text(p.destination,'destination',1,1024);
  if(!CONSEQUENCE.has(p.consequence_class))throw new ValidationError('consequence_class is invalid');
  validateProposalCost(p.cost);
  if(!TRIGGERS.has(p.trigger_mode))throw new ValidationError('trigger_mode is invalid');
  if(!CONFIRMATION.has(p.confirmation_level))throw new ValidationError('confirmation_level is invalid');
}
function validateMaxCost(v){if(v===null)return;exactObject(v,'max_cost',['currency','max_minor_units']);if(typeof v.currency!=='string'||!CURRENCY.test(v.currency))throw new ValidationError('max_cost currency is invalid');integer(v.max_minor_units,'max_cost max_minor_units',0,Number.MAX_SAFE_INTEGER);}
function validateProposalCost(v){if(v===null)return;exactObject(v,'proposal cost',['currency','minor_units']);if(typeof v.currency!=='string'||!CURRENCY.test(v.currency))throw new ValidationError('proposal cost currency is invalid');integer(v.minor_units,'proposal cost minor_units',0,Number.MAX_SAFE_INTEGER);}
function subset(actual,allowed,prefix,reasons){const s=new Set(allowed);for(const item of actual)if(!s.has(item))reasons.push(prefix+':'+item);}
function exactObject(v,l,f){if(!v||typeof v!=='object'||Array.isArray(v))throw new ValidationError(l+' must be an object');if(Object.keys(v).sort().join(',')!==[...f].sort().join(','))throw new ValidationError(l+' fields are invalid');}
function id(v,l){if(typeof v!=='string'||!ID.test(v))throw new ValidationError(l+' is invalid');}
function idArray(v,l,min,max){if(!Array.isArray(v)||v.length<min||v.length>max)throw new ValidationError(l+' is invalid');const s=new Set();for(const item of v){id(item,l+' item');if(s.has(item))throw new ValidationError(l+' contains duplicate values');s.add(item);}}
function text(v,l,min,max){if(typeof v!=='string'||v.length<min||v.length>max)throw new ValidationError(l+' is invalid');}
function textArray(v,l,min,max,itemMax){if(!Array.isArray(v)||v.length<min||v.length>max)throw new ValidationError(l+' is invalid');const s=new Set();for(const item of v){text(item,l+' item',1,itemMax);if(s.has(item))throw new ValidationError(l+' contains duplicate values');s.add(item);}}
function enumArray(v,l,allowed,min,max){if(!Array.isArray(v)||v.length<min||v.length>max)throw new ValidationError(l+' is invalid');const s=new Set();for(const item of v){if(!allowed.has(item))throw new ValidationError(l+' contains invalid value');if(s.has(item))throw new ValidationError(l+' contains duplicate values');s.add(item);}}
function integer(v,l,min,max){if(!Number.isSafeInteger(v)||v<min||v>max)throw new ValidationError(l+' is invalid');}
function canonicalDate(v,l){if(typeof v!=='string'||v.length>64)throw new ValidationError(l+' must be a canonical ISO timestamp');const d=new Date(v);if(!Number.isFinite(d.getTime())||d.toISOString()!==v)throw new ValidationError(l+' must be a canonical ISO timestamp');return d.getTime();}
