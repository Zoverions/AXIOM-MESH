import {
  ValidationError,
  assertPlainObject,
  assertString,
  assertStringArray
} from './canonical.mjs';

export const BILATERAL_RECOGNITION_SCHEMA = 'axiom-bilateral-recognition-profile.v1';

const ID = /^[A-Za-z0-9][A-Za-z0-9_.:/-]{0,191}$/;
const DIGEST = /^[a-f0-9]{64}$/;

function exact(raw, fields, label) {
  const value = assertPlainObject(raw, label);
  const allowed = new Set(fields);
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) throw new ValidationError(`${label} contains unsupported field ${key}`);
  }
  for (const key of fields) {
    if (!Object.hasOwn(value, key)) throw new ValidationError(`${label} is missing required field ${key}`);
  }
  return value;
}

function id(value, label) {
  return assertString(value, label, { min: 1, max: 192, pattern: ID });
}
function digest(value, label) {
  return assertString(value, label, { min: 64, max: 64, pattern: DIGEST });
}
function timestamp(value, label) {
  const text = assertString(value, label, { min: 24, max: 24 });
  const d = new Date(text);
  if (Number.isNaN(d.valueOf()) || d.toISOString() !== text) {
    throw new ValidationError(`${label} must be canonical UTC ISO`);
  }
  return text;
}

export function validateBilateralRecognitionProfile(raw, { now = new Date() } = {}) {
  const value = exact(raw, [
    'schema','recognition_id','party_a','party_b','recognized_claims',
    'assurance','privacy','currentness','reservations','amendment',
    'valid_from','expires_at','withdrawal','dispute','authority','limitations'
  ], 'bilateral recognition profile');

  if (value.schema !== BILATERAL_RECOGNITION_SCHEMA) {
    throw new ValidationError('bilateral recognition schema is invalid');
  }

  id(value.recognition_id,'recognition_id');
  const partyA=id(value.party_a,'party_a');
  const partyB=id(value.party_b,'party_b');
  if(partyA===partyB) throw new ValidationError('bilateral recognition requires distinct parties');

  if(!Array.isArray(value.recognized_claims)||value.recognized_claims.length===0||value.recognized_claims.length>256){
    throw new ValidationError('recognized_claims must contain 1-256 entries');
  }
  const claimIds=new Set();
  for(const [i,rawClaim] of value.recognized_claims.entries()){
    const claim=exact(rawClaim,[
      'claim_class','issuer_party','relying_party','purposes',
      'evidence_profile_refs','verifier_profile_refs','local_effect_authority'
    ],`recognized_claims[${i}]`);
    const claimClass=id(claim.claim_class,`recognized_claims[${i}].claim_class`);
    if(claimIds.has(claimClass)) throw new ValidationError('recognized claim classes must be unique');
    claimIds.add(claimClass);
    const issuer=id(claim.issuer_party,`recognized_claims[${i}].issuer_party`);
    const relying=id(claim.relying_party,`recognized_claims[${i}].relying_party`);
    if(![partyA,partyB].includes(issuer)||![partyA,partyB].includes(relying)||issuer===relying){
      throw new ValidationError('recognized claim must flow between declared distinct parties');
    }
    const purposes=assertStringArray(claim.purposes,`recognized_claims[${i}].purposes`,{maxItems:64,itemMax:192});
    if(purposes.length===0) throw new ValidationError('recognized claim requires purposes');
    assertStringArray(claim.evidence_profile_refs,`recognized_claims[${i}].evidence_profile_refs`,{maxItems:64,itemMax:512});
    assertStringArray(claim.verifier_profile_refs,`recognized_claims[${i}].verifier_profile_refs`,{maxItems:64,itemMax:512});
    if(claim.local_effect_authority!==false){
      throw new ValidationError('recognition cannot grant local effect authority');
    }
  }

  const assurance=exact(value.assurance,['minimum_profile_refs','may_narrow_locally'],'assurance');
  const floors=assertStringArray(assurance.minimum_profile_refs,'assurance.minimum_profile_refs',{maxItems:64,itemMax:512});
  if(floors.length===0) throw new ValidationError('recognition requires assurance floors');
  if(assurance.may_narrow_locally!==true) throw new ValidationError('local policy must be allowed to narrow recognition');

  const privacy=exact(value.privacy,['allowed_disclosures','prohibited_disclosures','data_minimization_required'],'privacy');
  assertStringArray(privacy.allowed_disclosures,'privacy.allowed_disclosures',{maxItems:128,itemMax:512});
  assertStringArray(privacy.prohibited_disclosures,'privacy.prohibited_disclosures',{maxItems:128,itemMax:512});
  if(privacy.data_minimization_required!==true) throw new ValidationError('data minimization is required');

  const currentness=exact(value.currentness,[
    'revocation_required','freshness_profile_refs','offline_stale_behavior'
  ],'currentness');
  if(typeof currentness.revocation_required!=='boolean') throw new ValidationError('currentness.revocation_required must be boolean');
  assertStringArray(currentness.freshness_profile_refs,'currentness.freshness_profile_refs',{maxItems:64,itemMax:512});
  id(currentness.offline_stale_behavior,'currentness.offline_stale_behavior');

  assertStringArray(value.reservations,'reservations',{maxItems:128,itemMax:2048});

  const amendment=exact(value.amendment,[
    'process_ref','material_widening_requires_renewed_acceptance'
  ],'amendment');
  assertString(amendment.process_ref,'amendment.process_ref',{min:1,max:512});
  if(amendment.material_widening_requires_renewed_acceptance!==true){
    throw new ValidationError('material widening requires renewed acceptance');
  }

  const validFrom=timestamp(value.valid_from,'valid_from');
  const expiresAt=timestamp(value.expires_at,'expires_at');
  if(new Date(expiresAt).valueOf()<=new Date(validFrom).valueOf()){
    throw new ValidationError('expires_at must be after valid_from');
  }

  const withdrawal=exact(value.withdrawal,[
    'party_a_may_withdraw','party_b_may_withdraw','notice_policy_ref','historical_evidence_preserved'
  ],'withdrawal');
  if(withdrawal.party_a_may_withdraw!==true||withdrawal.party_b_may_withdraw!==true){
    throw new ValidationError('both parties must retain withdrawal ability');
  }
  assertString(withdrawal.notice_policy_ref,'withdrawal.notice_policy_ref',{min:1,max:512});
  if(withdrawal.historical_evidence_preserved!==true){
    throw new ValidationError('withdrawal must preserve historical evidence');
  }

  const dispute=exact(value.dispute,['review_profile_ref','remedy_requires_separate_authority'],'dispute');
  assertString(dispute.review_profile_ref,'dispute.review_profile_ref',{min:1,max:512});
  if(dispute.remedy_requires_separate_authority!==true){
    throw new ValidationError('dispute remedy requires separate authority');
  }

  const authority=exact(value.authority,[
    'recognition_grants_runtime_authority',
    'recognition_grants_membership',
    'recognition_grants_eligibility',
    'automatic_transitive_trust'
  ],'authority');
  if(authority.recognition_grants_runtime_authority!==false) throw new ValidationError('recognition cannot grant runtime authority');
  if(authority.recognition_grants_membership!==false) throw new ValidationError('recognition cannot grant membership');
  if(authority.recognition_grants_eligibility!==false) throw new ValidationError('recognition cannot grant eligibility');
  if(authority.automatic_transitive_trust!==false) throw new ValidationError('automatic transitive trust must be false');

  const limitations=assertStringArray(value.limitations,'limitations',{maxItems:128,itemMax:1024});
  if(limitations.length===0) throw new ValidationError('recognition profile must declare limitations');

  const nowMs=now instanceof Date?now.valueOf():new Date(now).valueOf();
  if(!Number.isFinite(nowMs)) throw new ValidationError('now is invalid');

  return Object.freeze({
    valid:new Date(validFrom).valueOf()<=nowMs && new Date(expiresAt).valueOf()>nowMs,
    recognition_id:value.recognition_id,
    claim_class_count:value.recognized_claims.length,
    authority_effect:'none',
    transitive_trust:false
  });
}
