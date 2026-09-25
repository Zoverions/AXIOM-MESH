import { digestObject, ValidationError } from './canonical.mjs';

export const AUTONOMY_ENVELOPE_SCHEMA='axiom-autonomy-envelope.v0';

const ID=/^[A-Za-z0-9][A-Za-z0-9_.:#/-]{0,191}$/;
const DIGEST=/^[a-f0-9]{64}$/;
const CURRENCY=/^[A-Z]{3}$/;
const EFFECTS=new Set(["none","read-external","write-external","publish-external","communication","financial","create-external-resource","delete-external-resource","physical"]);
const CONSEQUENCE=Object.freeze(["C0","C1","C2","C3"]);
const CONFIRMATION=new Set(['inherit-existing','human-before-C2-C3','human-before-any-effect']);
const INDEPENDENT=new Set(['inherit-existing','require-C3','require-C2-C3']);

export function validateAutonomyEnvelope(document){
  exactObject(document,'Autonomy envelope',[
    'schema','version','status','envelope_id','owner_principal_id','subject_principal_id',
    'authority_snapshot_ref','authority_digest','active_from','expires_at',
    'actions','purposes','destinations','capability_ids','data_classes','effect_classes',
    'consequence_ceiling','max_execution_ms','max_cost','confirmation_floor',
    'independent_approval_floor','delegation_allowed','wildcard_authority',
    'grants_authority','execution_effect','runtime_activation'
  ]);
  if(
    document.schema!==AUTONOMY_ENVELOPE_SCHEMA||document.version!==0
    ||document.status!=='inert-owner-ceiling'||document.delegation_allowed!==false
    ||document.wildcard_authority!==false||document.grants_authority!==false
    ||document.execution_effect!=='none'||document.runtime_activation!==false
  )throw new ValidationError('Autonomy envelope authority boundary is invalid');

  id(document.envelope_id,'envelope_id');id(document.owner_principal_id,'owner_principal_id');
  id(document.subject_principal_id,'subject_principal_id');id(document.authority_snapshot_ref,'authority_snapshot_ref');
  digest(document.authority_digest,'authority_digest');
  const active=canonicalDate(document.active_from,'active_from');
  const expires=canonicalDate(document.expires_at,'expires_at');
  if(expires<=active)throw new ValidationError('expires_at must follow active_from');
  finiteIdArray(document.actions,'actions',1,128);
  finiteIdArray(document.purposes,'purposes',1,128);
  finiteTextArray(document.destinations,'destinations',0,128,512);
  finiteIdArray(document.capability_ids,'capability_ids',0,128);
  finiteTextArray(document.data_classes,'data_classes',0,128,512);
  enumArray(document.effect_classes,'effect_classes',EFFECTS,1,9);
  if(!CONSEQUENCE.includes(document.consequence_ceiling))throw new ValidationError('consequence_ceiling is invalid');
  integer(document.max_execution_ms,'max_execution_ms',1,300000);
  validateCost(document.max_cost,'max_cost');
  if(!CONFIRMATION.has(document.confirmation_floor))throw new ValidationError('confirmation_floor is invalid');
  if(!INDEPENDENT.has(document.independent_approval_floor))throw new ValidationError('independent_approval_floor is invalid');
  return Object.freeze({
    valid:true,schema:document.schema,envelope_id:document.envelope_id,
    envelope_digest:digestObject(document),owner_ceiling_effect:'none',
    authority_effect:'none',execution_effect:'none',runtime_activation:false
  });
}

export function autonomyEnvelopeDigest(document){validateAutonomyEnvelope(document);return digestObject(document);}

export function assessAutonomyRequest(envelope,request,current){
  validateAutonomyEnvelope(envelope);
  validateRequest(request);
  validateCurrentAuthority(current);
  const assessed=canonicalDate(current.assessed_at,'assessed_at');
  const reasons=[];

  if(assessed<canonicalDate(envelope.active_from,'active_from'))reasons.push('envelope-not-active-yet');
  if(assessed>=canonicalDate(envelope.expires_at,'expires_at'))reasons.push('envelope-expired');
  if(current.authority_snapshot_ref!==envelope.authority_snapshot_ref)reasons.push('authority-snapshot-mismatch');
  if(current.authority_digest!==envelope.authority_digest)reasons.push('authority-digest-mismatch');
  if(current.authority_current!==true)reasons.push('authority-not-current');

  ceilingCheck(request,envelope,'owner-envelope',reasons);
  ceilingCheck(request,current,'current-authority',reasons);

  if(request.requested_execution_ms>envelope.max_execution_ms)reasons.push('owner-envelope-execution-budget-exceeded');
  if(request.requested_execution_ms>current.max_execution_ms)reasons.push('current-authority-execution-budget-exceeded');

  costCheck(request.estimated_cost,envelope.max_cost,'owner-envelope',reasons);
  costCheck(request.estimated_cost,current.max_cost,'current-authority',reasons);

  const reqConsequence=CONSEQUENCE.indexOf(request.consequence_class);
  if(reqConsequence>CONSEQUENCE.indexOf(envelope.consequence_ceiling))reasons.push('owner-envelope-consequence-ceiling-exceeded');
  if(reqConsequence>CONSEQUENCE.indexOf(current.consequence_ceiling))reasons.push('current-authority-consequence-ceiling-exceeded');

  if(needsHumanConfirmation(envelope,request)&&request.human_confirmation_present!==true){
    reasons.push('owner-envelope-human-confirmation-required');
  }
  if(needsIndependentApproval(envelope,request)&&request.independent_approval_present!==true){
    reasons.push('owner-envelope-independent-approval-required');
  }

  return Object.freeze({
    eligible_to_request:reasons.length===0,
    reasons:Object.freeze(reasons),
    owner_envelope_digest:digestObject(envelope),
    authority_snapshot_ref:current.authority_snapshot_ref,
    authority_digest:current.authority_digest,
    authority_effect:'none',execution_effect:'none',runtime_activation:false
  });
}

function ceilingCheck(request,ceiling,prefix,reasons){
  if(!ceiling.actions.includes(request.action))reasons.push(prefix+'-action-denied');
  if(!ceiling.purposes.includes(request.purpose))reasons.push(prefix+'-purpose-denied');
  if(request.destination!==null&&!ceiling.destinations.includes(request.destination))reasons.push(prefix+'-destination-denied');
  if(request.capability_id!==null&&!ceiling.capability_ids.includes(request.capability_id))reasons.push(prefix+'-capability-denied');
  for(const dataClass of request.data_classes)if(!ceiling.data_classes.includes(dataClass))reasons.push(prefix+'-data-class-denied:'+dataClass);
  if(!ceiling.effect_classes.includes(request.effect_class))reasons.push(prefix+'-effect-denied');
}

function costCheck(cost,limit,prefix,reasons){
  if(cost===null)return;
  if(limit===null){reasons.push(prefix+'-cost-denied');return;}
  if(cost.currency!==limit.currency)reasons.push(prefix+'-cost-currency-mismatch');
  else if(cost.minor_units>limit.max_minor_units)reasons.push(prefix+'-cost-budget-exceeded');
}

function needsHumanConfirmation(envelope,request){
  if(envelope.confirmation_floor==='human-before-any-effect')return request.effect_class!=='none';
  if(envelope.confirmation_floor==='human-before-C2-C3')return ['C2','C3'].includes(request.consequence_class);
  return false;
}
function needsIndependentApproval(envelope,request){
  if(envelope.independent_approval_floor==='require-C2-C3')return ['C2','C3'].includes(request.consequence_class);
  if(envelope.independent_approval_floor==='require-C3')return request.consequence_class==='C3';
  return false;
}

function validateRequest(request){
  exactObject(request,'Autonomy request',[
    'action','purpose','destination','capability_id','data_classes','effect_class',
    'consequence_class','requested_execution_ms','estimated_cost',
    'human_confirmation_present','independent_approval_present'
  ]);
  id(request.action,'request action');id(request.purpose,'request purpose');
  if(request.destination!==null)finiteText(request.destination,'request destination',512);
  if(request.capability_id!==null)id(request.capability_id,'request capability_id');
  finiteTextArray(request.data_classes,'request data_classes',0,128,512);
  if(!EFFECTS.has(request.effect_class))throw new ValidationError('request effect_class is invalid');
  if(!CONSEQUENCE.includes(request.consequence_class))throw new ValidationError('request consequence_class is invalid');
  integer(request.requested_execution_ms,'requested_execution_ms',0,300000);
  validateRequestCost(request.estimated_cost);
  if(typeof request.human_confirmation_present!=='boolean'||typeof request.independent_approval_present!=='boolean'){
    throw new ValidationError('request approval flags must be boolean');
  }
}

function validateCurrentAuthority(current){
  exactObject(current,'Current authority ceiling',[
    'authority_snapshot_ref','authority_digest','authority_current','assessed_at',
    'actions','purposes','destinations','capability_ids','data_classes','effect_classes',
    'consequence_ceiling','max_execution_ms','max_cost'
  ]);
  id(current.authority_snapshot_ref,'current authority_snapshot_ref');digest(current.authority_digest,'current authority_digest');
  if(typeof current.authority_current!=='boolean')throw new ValidationError('authority_current must be boolean');
  canonicalDate(current.assessed_at,'assessed_at');
  finiteIdArray(current.actions,'current actions',1,128);
  finiteIdArray(current.purposes,'current purposes',1,128);
  finiteTextArray(current.destinations,'current destinations',0,128,512);
  finiteIdArray(current.capability_ids,'current capability_ids',0,128);
  finiteTextArray(current.data_classes,'current data_classes',0,128,512);
  enumArray(current.effect_classes,'current effect_classes',EFFECTS,1,9);
  if(!CONSEQUENCE.includes(current.consequence_ceiling))throw new ValidationError('current consequence_ceiling is invalid');
  integer(current.max_execution_ms,'current max_execution_ms',1,300000);
  validateCost(current.max_cost,'current max_cost');
}

function validateCost(value,label){if(value===null)return;exactObject(value,label,['currency','max_minor_units']);if(typeof value.currency!=='string'||!CURRENCY.test(value.currency))throw new ValidationError(label+' currency is invalid');integer(value.max_minor_units,label+' max_minor_units',0,Number.MAX_SAFE_INTEGER);}
function validateRequestCost(value){if(value===null)return;exactObject(value,'estimated_cost',['currency','minor_units']);if(typeof value.currency!=='string'||!CURRENCY.test(value.currency))throw new ValidationError('estimated_cost currency is invalid');integer(value.minor_units,'estimated_cost minor_units',0,Number.MAX_SAFE_INTEGER);}
function exactObject(value,label,fields){if(!value||typeof value!=='object'||Array.isArray(value))throw new ValidationError(label+' must be an object');const a=Object.keys(value).sort().join(',');const e=[...fields].sort().join(',');if(a!==e)throw new ValidationError(label+' fields are invalid');}
function id(value,label){if(typeof value!=='string'||!ID.test(value))throw new ValidationError(label+' is invalid');}
function digest(value,label){if(typeof value!=='string'||!DIGEST.test(value))throw new ValidationError(label+' must be a lowercase sha256 digest');}
function finiteText(value,label,max){if(typeof value!=='string'||value.length<1||value.length>max||value==='*'||value.toLowerCase()==='all')throw new ValidationError(label+' is invalid');}
function finiteIdArray(value,label,min,max){if(!Array.isArray(value)||value.length<min||value.length>max)throw new ValidationError(label+' is invalid');const s=new Set();for(const item of value){id(item,label+' item');if(item.includes('*')||item.toLowerCase()==='all'||item.toLowerCase()==='administrator')throw new ValidationError(label+' contains ambient authority syntax');if(s.has(item))throw new ValidationError(label+' contains duplicate values');s.add(item);}}
function finiteTextArray(value,label,min,max,itemMax){if(!Array.isArray(value)||value.length<min||value.length>max)throw new ValidationError(label+' is invalid');const s=new Set();for(const item of value){finiteText(item,label+' item',itemMax);if(s.has(item))throw new ValidationError(label+' contains duplicate values');s.add(item);}}
function enumArray(value,label,allowed,min,max){if(!Array.isArray(value)||value.length<min||value.length>max)throw new ValidationError(label+' is invalid');const s=new Set();for(const item of value){if(!allowed.has(item))throw new ValidationError(label+' contains invalid value');if(s.has(item))throw new ValidationError(label+' contains duplicate values');s.add(item);}}
function integer(value,label,min,max){if(!Number.isSafeInteger(value)||value<min||value>max)throw new ValidationError(label+' is invalid');}
function canonicalDate(value,label){if(typeof value!=='string'||value.length>64)throw new ValidationError(label+' must be a canonical ISO timestamp');const d=new Date(value);if(!Number.isFinite(d.getTime())||d.toISOString()!==value)throw new ValidationError(label+' must be a canonical ISO timestamp');return d.getTime();}
