import { digestObject, ValidationError } from './canonical.mjs';
import { validateCircleCorePackage } from './circle-core.mjs';

export const CIRCLE_MEMBERSHIP_ASSURANCE_SCHEMA='axiom-circle-membership-assurance.v0';

const ID=/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/;
const DIGEST=/^[a-f0-9]{64}$/;
const DEVICE_MODES=new Set(['required','optional']);

export function validateCircleMembershipAssurance(document){
  exactObject(document,'Circle membership assurance',[
    'schema','version','status','assurance_id','circle_id','membership_id','principal_id',
    'membership_digest','charter_digest','role_ids','device_policy',
    'required_consent_receipt_refs','evidence_refs','valid_from','expires_at',
    'contains_secret_material','authority_effect','governance_effect','execution_effect',
    'network_effect','runtime_activation'
  ]);
  if(
    document.schema!==CIRCLE_MEMBERSHIP_ASSURANCE_SCHEMA
    ||document.version!==0
    ||document.status!=='inert-assurance-laboratory'
    ||document.contains_secret_material!==false
    ||document.authority_effect!=='none'
    ||document.governance_effect!=='none'
    ||document.execution_effect!=='none'
    ||document.network_effect!=='none'
    ||document.runtime_activation!==false
  )throw new ValidationError('Circle membership assurance activation boundary is invalid');

  id(document.assurance_id,'assurance_id');
  id(document.circle_id,'circle_id');
  id(document.membership_id,'membership_id');
  id(document.principal_id,'principal_id');
  digest(document.membership_digest,'membership_digest');
  digest(document.charter_digest,'charter_digest');
  idArray(document.role_ids,'role_ids',0,64);
  validateDevicePolicy(document.device_policy);
  idArray(document.required_consent_receipt_refs,'required_consent_receipt_refs',0,64);
  refArray(document.evidence_refs,'evidence_refs',1,128);
  const validFrom=canonicalDate(document.valid_from,'valid_from');
  const expires=canonicalDate(document.expires_at,'expires_at');
  if(expires<=validFrom)throw new ValidationError('expires_at must follow valid_from');

  return Object.freeze({
    valid:true,
    schema:document.schema,
    assurance_id:document.assurance_id,
    assurance_digest:digestObject(document),
    authority_effect:'none',
    governance_effect:'none',
    execution_effect:'none',
    network_effect:'none',
    runtime_activation:false
  });
}

export function circleMembershipAssuranceDigest(document){
  validateCircleMembershipAssurance(document);
  return digestObject(document);
}

export function assessCircleMembership(packageDocument,assurance,current){
  const packageResult=validateCircleCorePackage(packageDocument);
  validateCircleMembershipAssurance(assurance);
  validateCurrent(current);

  const reasons=[];
  const assessedAt=canonicalDate(current.assessed_at,'assessed_at');
  const validFrom=canonicalDate(assurance.valid_from,'assurance valid_from');
  const expires=canonicalDate(assurance.expires_at,'assurance expires_at');

  if(packageDocument.circle.circle_id!==assurance.circle_id)reasons.push('circle-mismatch');
  if(packageResult.charter_digest!==assurance.charter_digest)reasons.push('charter-digest-mismatch');

  const membership=packageDocument.memberships.find(item=>item.membership_id===assurance.membership_id);
  if(!membership){
    reasons.push('membership-not-found');
  }else{
    if(membership.circle_id!==assurance.circle_id)reasons.push('membership-circle-mismatch');
    if(membership.principal_id!==assurance.principal_id)reasons.push('membership-principal-mismatch');
    if(digestObject(membership)!==assurance.membership_digest)reasons.push('membership-digest-mismatch');
    if(!sameSet(membership.role_ids,assurance.role_ids))reasons.push('role-set-mismatch');
    if(membership.status!=='active')reasons.push('membership-not-active:'+membership.status);

    const acceptedAt=canonicalDate(membership.accepted_at,'membership accepted_at');
    const statusEffective=canonicalDate(membership.status_effective_at,'membership status_effective_at');
    if(statusEffective>assessedAt)reasons.push('membership-status-not-current');
    if(validFrom<acceptedAt)reasons.push('assurance-predates-membership');

    const effectiveExit=packageDocument.exits.find(exit=>(
      exit.membership_id===membership.membership_id
      && canonicalDate(exit.effective_at,'exit effective_at')<=assessedAt
    ));
    if(effectiveExit)reasons.push('effective-exit:'+effectiveExit.kind);
  }

  if(current.principal_id!==assurance.principal_id)reasons.push('principal-mismatch');
  if(assessedAt<validFrom)reasons.push('assurance-not-active-yet');
  if(assessedAt>=expires)reasons.push('assurance-expired');

  const assuredDevices=new Set(assurance.device_policy.device_refs);
  const verifiedDevices=new Set(current.verified_current_device_refs);
  if(assurance.device_policy.mode==='required'&&current.presented_device_ref===null){
    reasons.push('device-required');
  }
  if(current.presented_device_ref!==null){
    if(!assuredDevices.has(current.presented_device_ref))reasons.push('device-not-assured');
    if(!verifiedDevices.has(current.presented_device_ref))reasons.push('device-not-current');
  }

  const verifiedConsent=new Set(current.verified_current_consent_receipt_refs);
  for(const receipt of assurance.required_consent_receipt_refs){
    if(!verifiedConsent.has(receipt))reasons.push('consent-not-current:'+receipt);
  }

  return Object.freeze({
    schema:'axiom-circle-membership-assessment.v0',
    eligible_to_participate:reasons.length===0,
    reasons:Object.freeze(reasons),
    circle_id:assurance.circle_id,
    membership_id:assurance.membership_id,
    principal_id:assurance.principal_id,
    assurance_digest:digestObject(assurance),
    package_digest:packageResult.package_digest,
    requires_external_evidence_verification:true,
    evidence_verification_effect:'none',
    authority_effect:'none',
    governance_effect:'none',
    execution_effect:'none',
    network_effect:'none'
  });
}

function validateDevicePolicy(value){
  exactObject(value,'Circle membership device_policy',['mode','device_refs']);
  if(!DEVICE_MODES.has(value.mode))throw new ValidationError('device_policy.mode is invalid');
  idArray(value.device_refs,'device_policy.device_refs',0,64);
  if(value.mode==='required'&&value.device_refs.length<1){
    throw new ValidationError('required device policy needs at least one device_ref');
  }
}

function validateCurrent(value){
  exactObject(value,'Circle membership current context',[
    'assessed_at','principal_id','presented_device_ref',
    'verified_current_device_refs','verified_current_consent_receipt_refs'
  ]);
  canonicalDate(value.assessed_at,'assessed_at');
  id(value.principal_id,'current principal_id');
  if(value.presented_device_ref!==null)id(value.presented_device_ref,'presented_device_ref');
  idArray(value.verified_current_device_refs,'verified_current_device_refs',0,64);
  idArray(value.verified_current_consent_receipt_refs,'verified_current_consent_receipt_refs',0,128);
}

function exactObject(value,label,fields){
  if(!value||typeof value!=='object'||Array.isArray(value))throw new ValidationError(label+' must be an object');
  const actual=Object.keys(value).sort().join(',');
  const expected=[...fields].sort().join(',');
  if(actual!==expected)throw new ValidationError(label+' fields are invalid');
}
function id(value,label){if(typeof value!=='string'||!ID.test(value))throw new ValidationError(label+' is invalid');}
function digest(value,label){if(typeof value!=='string'||!DIGEST.test(value))throw new ValidationError(label+' must be a lowercase sha256 digest');}
function idArray(value,label,min,max){
  if(!Array.isArray(value)||value.length<min||value.length>max)throw new ValidationError(label+' has invalid cardinality');
  const seen=new Set();
  for(const item of value){
    id(item,label+' item');
    if(seen.has(item))throw new ValidationError(label+' contains duplicate values');
    seen.add(item);
  }
}
function refArray(value,label,min,max){
  if(!Array.isArray(value)||value.length<min||value.length>max)throw new ValidationError(label+' has invalid cardinality');
  const seen=new Set();
  for(const item of value){
    if(typeof item!=='string'||item.length<1||item.length>512)throw new ValidationError(label+' item is invalid');
    if(seen.has(item))throw new ValidationError(label+' contains duplicate values');
    seen.add(item);
  }
}
function canonicalDate(value,label){
  if(typeof value!=='string'||value.length>64)throw new ValidationError(label+' must be a canonical ISO timestamp');
  const parsed=new Date(value);
  if(!Number.isFinite(parsed.getTime())||parsed.toISOString()!==value)throw new ValidationError(label+' must be a canonical ISO timestamp');
  return parsed.getTime();
}
function sameSet(left,right){
  if(left.length!==right.length)return false;
  const set=new Set(left);
  return right.every(item=>set.has(item));
}
