import {
  ValidationError,
  assertPlainObject,
  assertString,
  assertStringArray
} from './canonical.mjs';

export const CROSS_DOMAIN_STATUS_EVENT_SCHEMA='axiom-cross-domain-status-event.v1';
export const RELIANCE_RECEIPT_SCHEMA='axiom-recognition-reliance-receipt.v1';

const ID=/^[A-Za-z0-9][A-Za-z0-9_.:/-]{0,191}$/;
const DIGEST=/^[a-f0-9]{64}$/;
const TYPES=new Set([
  'credential_revoked','credential_suspended','issuer_key_compromised',
  'verifier_compromised','recognition_withdrawn','recognition_narrowed',
  'trust_anchor_rotated','trust_anchor_compromised','policy_superseded',
  'institution_dissolved_or_succeeded'
]);
const STATUSES=new Set(['current','suspended','revoked','compromised','withdrawn','unknown']);

function exact(raw,fields,label){
  const v=assertPlainObject(raw,label), allowed=new Set(fields);
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

export function validateCrossDomainStatusEvent(raw){
  const v=exact(raw,[
    'schema','event_id','event_type','issuer_domain','subject_type','subject_id',
    'status','scope_refs','issued_at','effective_at','expires_at',
    'evidence_digest','authority','limitations'
  ],'cross-domain status event');

  if(v.schema!==CROSS_DOMAIN_STATUS_EVENT_SCHEMA) throw new ValidationError('cross-domain status event schema is invalid');
  id(v.event_id,'event_id');
  const type=id(v.event_type,'event_type');
  if(!TYPES.has(type)) throw new ValidationError('event_type is unsupported');
  id(v.issuer_domain,'issuer_domain');
  id(v.subject_type,'subject_type');
  id(v.subject_id,'subject_id');

  const status=id(v.status,'status');
  if(!STATUSES.has(status)) throw new ValidationError('status is invalid');

  const scopes=assertStringArray(v.scope_refs,'scope_refs',{maxItems:128,itemMax:512});
  if(scopes.length===0) throw new ValidationError('cross-domain status event requires scope_refs');

  const issued=timestamp(v.issued_at,'issued_at');
  const effective=timestamp(v.effective_at,'effective_at');
  const expires=timestamp(v.expires_at,'expires_at');
  if(new Date(effective).valueOf()<new Date(issued).valueOf()) throw new ValidationError('effective_at cannot precede issued_at');
  if(new Date(expires).valueOf()<=new Date(effective).valueOf()) throw new ValidationError('expires_at must be after effective_at');

  digest(v.evidence_digest,'evidence_digest');

  const authority=exact(v.authority,[
    'event_grants_local_authority',
    'event_grants_remedy_authority',
    'event_rewrites_historical_receipts'
  ],'authority');
  if(authority.event_grants_local_authority!==false) throw new ValidationError('status event cannot grant local authority');
  if(authority.event_grants_remedy_authority!==false) throw new ValidationError('status event cannot grant remedy authority');
  if(authority.event_rewrites_historical_receipts!==false) throw new ValidationError('status event cannot rewrite historical receipts');

  const limitations=assertStringArray(v.limitations,'limitations',{maxItems:64,itemMax:1024});
  if(limitations.length===0) throw new ValidationError('status event must declare limitations');

  return Object.freeze({
    valid:true,
    event_id:v.event_id,
    event_type:type,
    status,
    authority_effect:'none',
    historical_rewrite:false
  });
}

export function validateRecognitionRelianceReceipt(raw){
  const v=exact(raw,[
    'schema','receipt_id','local_party','recognition_edge_digest','claim_digest',
    'policy_digest','currentness_status','currentness_evidence_refs',
    'decision_time','decision','later_status_annotations','authority','limitations'
  ],'recognition reliance receipt');

  if(v.schema!==RELIANCE_RECEIPT_SCHEMA) throw new ValidationError('recognition reliance receipt schema is invalid');
  id(v.receipt_id,'receipt_id');
  id(v.local_party,'local_party');
  digest(v.recognition_edge_digest,'recognition_edge_digest');
  digest(v.claim_digest,'claim_digest');
  digest(v.policy_digest,'policy_digest');

  const status=id(v.currentness_status,'currentness_status');
  if(!STATUSES.has(status)) throw new ValidationError('currentness_status is invalid');
  const currentnessRefs=assertStringArray(v.currentness_evidence_refs,'currentness_evidence_refs',{maxItems:128,itemMax:512});
  if(currentnessRefs.length===0) throw new ValidationError('reliance receipt requires currentness evidence refs');

  timestamp(v.decision_time,'decision_time');
  id(v.decision,'decision');

  if(!Array.isArray(v.later_status_annotations)||v.later_status_annotations.length>128){
    throw new ValidationError('later_status_annotations must be an array');
  }
  for(const [i,aRaw] of v.later_status_annotations.entries()){
    const a=exact(aRaw,['status_event_ref','observed_at','future_reliance_effect'],`later_status_annotations[${i}]`);
    assertString(a.status_event_ref,`later_status_annotations[${i}].status_event_ref`,{min:1,max:512});
    timestamp(a.observed_at,`later_status_annotations[${i}].observed_at`);
    id(a.future_reliance_effect,`later_status_annotations[${i}].future_reliance_effect`);
  }

  const authority=exact(v.authority,[
    'receipt_grants_authority','receipt_is_reusable_grant','later_notice_rewrites_decision'
  ],'authority');
  if(authority.receipt_grants_authority!==false) throw new ValidationError('reliance receipt cannot grant authority');
  if(authority.receipt_is_reusable_grant!==false) throw new ValidationError('reliance receipt cannot be a reusable grant');
  if(authority.later_notice_rewrites_decision!==false) throw new ValidationError('later notice cannot rewrite historical decision');

  const limits=assertStringArray(v.limitations,'limitations',{maxItems:64,itemMax:1024});
  if(limits.length===0) throw new ValidationError('reliance receipt must declare limitations');

  return Object.freeze({
    valid:true,
    receipt_id:v.receipt_id,
    currentness_status:status,
    historical_decision:v.decision,
    authority_effect:'none',
    historical_rewrite:false
  });
}
