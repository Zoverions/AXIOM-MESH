import { digestObject, ValidationError } from './canonical.mjs';
import {
  assessGeneralGenesisSponsorEligibility
} from './general-genesis-sponsor-eligibility.mjs';

export const GENERAL_GENESIS_AUTHORIZATION_CANDIDATE_SCHEMA =
  'axiom-general-genesis-authorization-candidate.v0';

const ID=/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/;
const DIGEST=/^[a-f0-9]{64}$/;
const CANDIDATE_ID=/^general-genesis-auth-candidate:[a-f0-9]{64}$/;

export function generalGenesisAuthorizationCandidateIdentityBody(candidate){
  validateCandidateShape(candidate,{checkId:false});
  return {
    schema:candidate.schema,
    version:candidate.version,
    holder_mind_id:candidate.holder_mind_id,
    eligibility_digest:candidate.eligibility_digest,
    genesis_history_evidence_digest:candidate.genesis_history_evidence_digest,
    issuer_authority_id:candidate.issuer_authority_id,
    issuance_policy_digest:candidate.issuance_policy_digest,
    issued_at:candidate.issued_at,
    expires_at:candidate.expires_at,
    maximum_eligibility_age_seconds:candidate.maximum_eligibility_age_seconds,
    use_scope:candidate.use_scope
  };
}

export function deriveGeneralGenesisAuthorizationCandidateId(candidate){
  return 'general-genesis-auth-candidate:'
    +digestObject(generalGenesisAuthorizationCandidateIdentityBody(candidate));
}

export function validateGeneralGenesisAuthorizationCandidate(candidate){
  validateCandidateShape(candidate,{checkId:true});
  return candidate;
}

export function assessGeneralGenesisAuthorizationCandidate({
  eligibilityDocument,
  developmentalStatus=null,
  candidate
}){
  const eligibility=assessGeneralGenesisSponsorEligibility({
    eligibilityDocument,
    developmentalStatus
  });
  validateGeneralGenesisAuthorizationCandidate(candidate);

  if(candidate.holder_mind_id!==eligibility.applicant_mind_id){
    throw new ValidationError('General Genesis authorization candidate holder binding is invalid');
  }
  if(candidate.eligibility_digest!==eligibility.eligibility_digest){
    throw new ValidationError('General Genesis authorization candidate eligibility binding is invalid');
  }
  if(
    candidate.genesis_history_evidence_digest
    !==eligibilityDocument.genesis_history_evidence_digest
  ){
    throw new ValidationError('General Genesis authorization candidate history binding is invalid');
  }

  const eligibilityAt=canonicalDate(
    eligibilityDocument.evaluated_at,
    'Genesis eligibility evaluated_at'
  );
  const issuedAt=canonicalDate(candidate.issued_at,'Genesis authorization candidate issued_at');
  const expiresAt=canonicalDate(candidate.expires_at,'Genesis authorization candidate expires_at');

  if(issuedAt<eligibilityAt){
    throw new ValidationError('Genesis authorization candidate cannot predate eligibility assessment');
  }
  const eligibilityAgeSeconds=Math.floor((issuedAt-eligibilityAt)/1000);
  if(eligibilityAgeSeconds>candidate.maximum_eligibility_age_seconds){
    throw new ValidationError('Genesis authorization candidate eligibility evidence is stale');
  }

  if(expiresAt<=issuedAt){
    throw new ValidationError('Genesis authorization candidate expiry must follow issuance');
  }
  const lifetimeSeconds=Math.floor((expiresAt-issuedAt)/1000);
  if(lifetimeSeconds>86400){
    throw new ValidationError('Genesis authorization candidate lifetime exceeds v0 maximum');
  }

  const requestable=eligibility.eligible_to_request_genesis_authorization===true;

  return Object.freeze({
    valid:true,
    schema:'axiom-general-genesis-authorization-candidate-assessment.v0',
    authorization_candidate_id:candidate.authorization_candidate_id,
    candidate_digest:digestObject(candidate),
    holder_mind_id:candidate.holder_mind_id,
    eligibility_digest:eligibility.eligibility_digest,
    eligibility_structural_pending_external_verification:
      eligibility.eligibility_is_structural_pending_external_verification,
    eligibility_age_seconds:eligibilityAgeSeconds,
    lifetime_seconds:lifetimeSeconds,
    eligible_to_request_authorization_issuance:requestable,
    reason:requestable
      ?'eligible-to-request-authorization-issuance'
      :'genesis-sponsor-eligibility-not-satisfied',
    candidate_only:true,
    requires_external_eligibility_verification:true,
    eligibility_verification_effect:'none',
    requires_external_issuer_authority_verification:true,
    issuer_authority_verification_effect:'none',
    requires_external_holder_confirmation:true,
    holder_confirmation_effect:'none',
    ordinary_genesis_authority_path_required:true,
    creates_live_authorization:false,
    creates_genesis_bond:false,
    creates_mind:false,
    founder_reserve_effect:'none',
    founding_status_effect:'none',
    genesis_effect:'none',
    governance_effect:'none',
    authority_effect:'none',
    network_effect:'none',
    runtime_activation:false
  });
}

function validateCandidateShape(candidate,{checkId}){
  exactObject(candidate,'General Genesis authorization candidate',[
    'schema','version','status','authorization_candidate_id','holder_mind_id',
    'eligibility_digest','genesis_history_evidence_digest','issuer_authority_id',
    'issuance_policy_digest','issued_at','expires_at','maximum_eligibility_age_seconds',
    'use_scope','one_use','max_uses','delegable','transferable','renewable',
    'explicit_holder_confirmation_required','candidate_only',
    'creates_live_authorization','creates_genesis_bond','creates_mind',
    'founder_reserve_effect','founding_status_effect','genesis_effect',
    'governance_effect','authority_effect','network_effect','runtime_activation'
  ]);

  if(
    candidate.schema!==GENERAL_GENESIS_AUTHORIZATION_CANDIDATE_SCHEMA
    ||candidate.version!==0
    ||candidate.status!=='inert-authorization-candidate'
    ||typeof candidate.authorization_candidate_id!=='string'
    ||!CANDIDATE_ID.test(candidate.authorization_candidate_id)
    ||!id(candidate.holder_mind_id)
    ||!digest(candidate.eligibility_digest)
    ||!digest(candidate.genesis_history_evidence_digest)
    ||!id(candidate.issuer_authority_id)
    ||!digest(candidate.issuance_policy_digest)
    ||!integerBetween(candidate.maximum_eligibility_age_seconds,1,3600)
    ||candidate.use_scope!=='one-recognized-mind-genesis'
    ||candidate.one_use!==true
    ||candidate.max_uses!==1
    ||candidate.delegable!==false
    ||candidate.transferable!==false
    ||candidate.renewable!==false
    ||candidate.explicit_holder_confirmation_required!==true
    ||candidate.candidate_only!==true
    ||candidate.creates_live_authorization!==false
    ||candidate.creates_genesis_bond!==false
    ||candidate.creates_mind!==false
    ||candidate.founder_reserve_effect!=='none'
    ||candidate.founding_status_effect!=='none'
    ||candidate.genesis_effect!=='none'
    ||candidate.governance_effect!=='none'
    ||candidate.authority_effect!=='none'
    ||candidate.network_effect!=='none'
    ||candidate.runtime_activation!==false
  )throw new ValidationError('General Genesis authorization candidate activation boundary is invalid');

  canonicalDate(candidate.issued_at,'Genesis authorization candidate issued_at');
  canonicalDate(candidate.expires_at,'Genesis authorization candidate expires_at');

  if(
    checkId
    &&candidate.authorization_candidate_id!==deriveGeneralGenesisAuthorizationCandidateId(candidate)
  ){
    throw new ValidationError('General Genesis authorization candidate id is invalid');
  }
}

function canonicalDate(value,label){
  if(typeof value!=='string'||value.length!==24){
    throw new ValidationError(label+' must be a canonical UTC timestamp');
  }
  const date=new Date(value);
  if(!Number.isFinite(date.getTime())||date.toISOString()!==value){
    throw new ValidationError(label+' must be a canonical UTC timestamp');
  }
  return date.getTime();
}

function exactObject(value,label,fields){
  if(!value||typeof value!=='object'||Array.isArray(value)){
    throw new ValidationError(label+' must be an object');
  }
  const actual=Object.keys(value).sort().join(',');
  const expected=[...fields].sort().join(',');
  if(actual!==expected)throw new ValidationError(label+' fields are invalid');
}
function id(value){return typeof value==='string'&&ID.test(value);}
function digest(value){return typeof value==='string'&&DIGEST.test(value);}
function integerBetween(value,min,max){
  return Number.isSafeInteger(value)&&value>=min&&value<=max;
}
