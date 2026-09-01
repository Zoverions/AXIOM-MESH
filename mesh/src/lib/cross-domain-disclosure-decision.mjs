import {
  ValidationError,
  assertPlainObject,
  assertString,
  assertStringArray
} from './canonical.mjs';

export const CROSS_DOMAIN_DISCLOSURE_SCHEMA =
  'axiom-cross-domain-disclosure-decision.v1';

const ID=/^[A-Za-z0-9][A-Za-z0-9_.:/-]{0,191}$/;
const DIGEST=/^[a-f0-9]{64}$/;
const RESIDENCY=new Set([
  'unrestricted','named_jurisdictions_only','named_institutions_only',
  'local_domain_only','local_device_or_enclave_only','air_gapped_only'
]);
const DISCLOSURE=new Set([
  'full_record','redacted_record','field_subset','predicate_only','proof_only',
  'aggregate_only','metadata_only','no_export'
]);

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

export function validateCrossDomainDisclosureDecision(raw){
  const v=exact(raw,[
    'schema','decision_id','source_domain','recipient_domain','subject_binding',
    'purpose','data_class','requested_disclosure','allowed_disclosure',
    'residency','retention','proof_substitution','policy_digest',
    'evidence_refs','decided_at','authority','limitations'
  ],'cross-domain disclosure decision');

  if(v.schema!==CROSS_DOMAIN_DISCLOSURE_SCHEMA) throw new ValidationError('cross-domain disclosure schema is invalid');

  id(v.decision_id,'decision_id');
  id(v.source_domain,'source_domain');
  id(v.recipient_domain,'recipient_domain');
  id(v.subject_binding,'subject_binding');
  id(v.purpose,'purpose');
  id(v.data_class,'data_class');

  const requested=id(v.requested_disclosure,'requested_disclosure');
  const allowed=id(v.allowed_disclosure,'allowed_disclosure');
  if(!DISCLOSURE.has(requested)||!DISCLOSURE.has(allowed)) throw new ValidationError('disclosure mode is invalid');

  const residency=exact(v.residency,[
    'mode','allowed_jurisdictions','allowed_institutions','destination_satisfied'
  ],'residency');
  const residencyMode=id(residency.mode,'residency.mode');
  if(!RESIDENCY.has(residencyMode)) throw new ValidationError('residency mode is invalid');
  assertStringArray(residency.allowed_jurisdictions,'residency.allowed_jurisdictions',{maxItems:64,itemMax:192});
  assertStringArray(residency.allowed_institutions,'residency.allowed_institutions',{maxItems:64,itemMax:192});
  if(typeof residency.destination_satisfied!=='boolean') throw new ValidationError('residency.destination_satisfied must be boolean');

  const retention=exact(v.retention,['max_seconds','recipient_may_retain','deletion_or_expiry_ref'],'retention');
  if(!Number.isInteger(retention.max_seconds)||retention.max_seconds<0) throw new ValidationError('retention.max_seconds must be a non-negative integer');
  if(typeof retention.recipient_may_retain!=='boolean') throw new ValidationError('retention.recipient_may_retain must be boolean');
  assertString(retention.deletion_or_expiry_ref,'retention.deletion_or_expiry_ref',{min:1,max:512});

  const proof=exact(v.proof_substitution,[
    'available','profile_ref','preferred_over_full_disclosure'
  ],'proof_substitution');
  if(typeof proof.available!=='boolean'||typeof proof.preferred_over_full_disclosure!=='boolean'){
    throw new ValidationError('proof substitution flags must be boolean');
  }
  if(proof.profile_ref!==null) assertString(proof.profile_ref,'proof_substitution.profile_ref',{min:1,max:512});
  if(proof.preferred_over_full_disclosure && !proof.available){
    throw new ValidationError('preferred proof substitution requires an available proof profile');
  }

  digest(v.policy_digest,'policy_digest');
  const evidence=assertStringArray(v.evidence_refs,'evidence_refs',{maxItems:128,itemMax:512});
  if(evidence.length===0) throw new ValidationError('disclosure decision requires evidence refs');
  timestamp(v.decided_at,'decided_at');

  const authority=exact(v.authority,[
    'recognition_grants_disclosure',
    'encryption_grants_disclosure',
    'proof_verification_grants_underlying_record_access',
    'decision_grants_unrelated_authority'
  ],'authority');
  for(const [field,val] of Object.entries(authority)){
    if(val!==false) throw new ValidationError(`authority.${field} must be false`);
  }

  const limits=assertStringArray(v.limitations,'limitations',{maxItems:64,itemMax:1024});
  if(limits.length===0) throw new ValidationError('disclosure decision must declare limitations');

  if(!residency.destination_satisfied && allowed!=='no_export'){
    throw new ValidationError('unsatisfied residency requires no_export');
  }

  if(requested==='full_record' && proof.available && proof.preferred_over_full_disclosure && allowed==='full_record'){
    throw new ValidationError('full disclosure cannot be allowed when policy marks an available proof substitute as preferred');
  }

  return Object.freeze({
    valid:true,
    decision_id:v.decision_id,
    allowed_disclosure:allowed,
    residency_mode:residencyMode,
    transfer_effect:allowed==='no_export'?'deny_transfer':'bounded_disclosure_only',
    authority_effect:'none'
  });
}
