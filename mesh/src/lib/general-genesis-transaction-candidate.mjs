import { digestObject, ValidationError } from './canonical.mjs';
import {
  assessGeneralGenesisAuthorizationCandidate
} from './general-genesis-authorization-candidate.mjs';

export const GENERAL_GENESIS_TRANSACTION_CANDIDATE_SCHEMA =
  'axiom-general-genesis-transaction-candidate.v0';

const ID=/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/;
const DIGEST=/^[a-f0-9]{64}$/;
const TX_ID=/^general-genesis-transaction:[a-f0-9]{64}$/;
const BOND_ID=/^genesis-bond:[a-f0-9]{64}$/;
const NEW_IDENTITY_STATUSES=new Set(['available','existing','disputed','unknown']);

export function generalGenesisBondIdentityBody(candidate){
  validateTransactionCandidateShape(candidate,{checkIds:false});
  return {
    sponsor_mind_id:candidate.sponsor_mind_id,
    new_mind_id:candidate.new_mind_id,
    authorization_candidate_id:candidate.authorization_candidate_id,
    constitution_digest:candidate.constitution_digest,
    developmental_plan_digest:candidate.developmental_plan_digest,
    resource_plan_digest:candidate.resource_plan_digest,
    continuity_recovery_plan_digest:candidate.continuity_recovery_plan_digest,
    independent_advocacy_plan_digest:candidate.independent_advocacy_plan_digest
  };
}

export function deriveGeneralGenesisBondId(candidate){
  return 'genesis-bond:'+digestObject(generalGenesisBondIdentityBody(candidate));
}

export function generalGenesisTransactionIdentityBody(candidate){
  validateTransactionCandidateShape(candidate,{checkIds:false});
  return {
    schema:candidate.schema,
    version:candidate.version,
    sponsor_mind_id:candidate.sponsor_mind_id,
    authorization_candidate_id:candidate.authorization_candidate_id,
    authorization_candidate_digest:candidate.authorization_candidate_digest,
    new_mind_id:candidate.new_mind_id,
    genesis_bond_id:candidate.genesis_bond_id,
    new_mind_identity_evidence_digest:candidate.new_mind_identity_evidence_digest,
    new_mind_identity_status:candidate.new_mind_identity_status,
    new_mind_identity_observed_at:candidate.new_mind_identity_observed_at,
    holder_confirmation_evidence_digest:candidate.holder_confirmation_evidence_digest,
    holder_confirmation_observed_at:candidate.holder_confirmation_observed_at,
    maximum_new_mind_identity_age_seconds:candidate.maximum_new_mind_identity_age_seconds,
    maximum_holder_confirmation_age_seconds:candidate.maximum_holder_confirmation_age_seconds,
    constitution_digest:candidate.constitution_digest,
    developmental_plan_digest:candidate.developmental_plan_digest,
    resource_plan_digest:candidate.resource_plan_digest,
    continuity_recovery_plan_digest:candidate.continuity_recovery_plan_digest,
    independent_advocacy_plan_digest:candidate.independent_advocacy_plan_digest,
    privacy_policy_digest:candidate.privacy_policy_digest,
    fork_policy_digest:candidate.fork_policy_digest,
    initial_capability_profile_digest:candidate.initial_capability_profile_digest,
    evaluated_at:candidate.evaluated_at
  };
}

export function deriveGeneralGenesisTransactionCandidateId(candidate){
  return 'general-genesis-transaction:'
    +digestObject(generalGenesisTransactionIdentityBody(candidate));
}

export function validateGeneralGenesisTransactionCandidate(candidate){
  validateTransactionCandidateShape(candidate,{checkIds:true});
  return candidate;
}

export function assessGeneralGenesisTransactionCandidate({
  eligibilityDocument,
  developmentalStatus=null,
  authorizationCandidate,
  transactionCandidate
}){
  const authorization=assessGeneralGenesisAuthorizationCandidate({
    eligibilityDocument,
    developmentalStatus,
    candidate:authorizationCandidate
  });
  validateGeneralGenesisTransactionCandidate(transactionCandidate);

  if(
    transactionCandidate.sponsor_mind_id!==authorization.holder_mind_id
    ||transactionCandidate.authorization_candidate_id
      !==authorization.authorization_candidate_id
    ||transactionCandidate.authorization_candidate_digest
      !==authorization.candidate_digest
  ){
    throw new ValidationError('General Genesis transaction authorization binding is invalid');
  }

  if(transactionCandidate.new_mind_id===transactionCandidate.sponsor_mind_id){
    throw new ValidationError('General Genesis sponsor and new mind must be distinct identities');
  }

  if(
    transactionCandidate.genesis_bond_id
    !==deriveGeneralGenesisBondId(transactionCandidate)
  ){
    throw new ValidationError('General Genesis Bond id is invalid');
  }

  const evaluatedAt=canonicalDate(
    transactionCandidate.evaluated_at,
    'General Genesis transaction evaluated_at'
  );
  const authorizationIssuedAt=canonicalDate(
    authorizationCandidate.issued_at,
    'General Genesis authorization candidate issued_at'
  );
  const authorizationExpiresAt=canonicalDate(
    authorizationCandidate.expires_at,
    'General Genesis authorization candidate expires_at'
  );
  const identityObservedAt=canonicalDate(
    transactionCandidate.new_mind_identity_observed_at,
    'New mind identity observed_at'
  );
  const confirmationObservedAt=canonicalDate(
    transactionCandidate.holder_confirmation_observed_at,
    'Holder confirmation observed_at'
  );

  if(evaluatedAt<authorizationIssuedAt){
    throw new ValidationError('General Genesis transaction cannot predate authorization candidate');
  }
  if(identityObservedAt>evaluatedAt||confirmationObservedAt>evaluatedAt){
    throw new ValidationError('General Genesis transaction evidence cannot be future-dated');
  }

  const authorizationCandidateCurrent=evaluatedAt<=authorizationExpiresAt;
  const identityAgeSeconds=Math.floor((evaluatedAt-identityObservedAt)/1000);
  const holderConfirmationAgeSeconds=Math.floor((evaluatedAt-confirmationObservedAt)/1000);
  const identityCurrent=
    identityAgeSeconds<=transactionCandidate.maximum_new_mind_identity_age_seconds;
  const holderConfirmationCurrent=
    holderConfirmationAgeSeconds
      <=transactionCandidate.maximum_holder_confirmation_age_seconds;
  const newMindIdentityAvailable=
    transactionCandidate.new_mind_identity_status==='available';
  const authorizationStructurallyRequestable=
    authorization.eligible_to_request_authorization_issuance===true;

  let eligible=true;
  let reason='eligible-to-request-genesis-commit';

  if(!authorizationStructurallyRequestable){
    eligible=false;
    reason='authorization-candidate-not-requestable';
  }else if(!authorizationCandidateCurrent){
    eligible=false;
    reason='authorization-candidate-expired';
  }else if(!identityCurrent){
    eligible=false;
    reason='new-mind-identity-evidence-stale';
  }else if(!newMindIdentityAvailable){
    eligible=false;
    reason='new-mind-identity-'+transactionCandidate.new_mind_identity_status;
  }else if(!holderConfirmationCurrent){
    eligible=false;
    reason='holder-confirmation-evidence-stale';
  }

  return Object.freeze({
    valid:true,
    schema:'axiom-general-genesis-transaction-candidate-assessment.v0',
    transaction_candidate_id:transactionCandidate.transaction_candidate_id,
    transaction_candidate_digest:digestObject(transactionCandidate),
    sponsor_mind_id:transactionCandidate.sponsor_mind_id,
    new_mind_id:transactionCandidate.new_mind_id,
    genesis_bond_id:transactionCandidate.genesis_bond_id,
    authorization_candidate_id:authorization.authorization_candidate_id,
    authorization_candidate_digest:authorization.candidate_digest,
    authorization_candidate_current:authorizationCandidateCurrent,
    authorization_candidate_structurally_requestable:authorizationStructurallyRequestable,
    new_mind_identity_current:identityCurrent,
    new_mind_identity_age_seconds:identityAgeSeconds,
    new_mind_identity_available:newMindIdentityAvailable,
    holder_confirmation_current:holderConfirmationCurrent,
    holder_confirmation_age_seconds:holderConfirmationAgeSeconds,
    eligible_to_request_genesis_commit:eligible,
    reason,
    transaction_candidate_only:true,
    requires_external_live_authorization_verification:true,
    live_authorization_verification_effect:'none',
    requires_external_holder_confirmation_verification:true,
    holder_confirmation_verification_effect:'none',
    requires_external_new_mind_identity_verification:true,
    new_mind_identity_verification_effect:'none',
    ordinary_genesis_commit_authority_path_required:true,
    creates_authorization_consumption:false,
    creates_genesis_history_change:false,
    creates_genesis_bond:false,
    creates_mind:false,
    creates_developmental_status:false,
    founder_reserve_effect:'none',
    founding_status_effect:'none',
    founders_council_effect:'none',
    genesis_effect:'none',
    governance_effect:'none',
    authority_effect:'none',
    network_effect:'none',
    runtime_activation:false
  });
}

function validateTransactionCandidateShape(candidate,{checkIds}){
  exactObject(candidate,'General Genesis transaction candidate',[
    'schema','version','status','transaction_candidate_id','sponsor_mind_id',
    'authorization_candidate_id','authorization_candidate_digest','new_mind_id',
    'genesis_bond_id','single_genesis_sponsor',
    'new_mind_identity_evidence_digest','new_mind_identity_status',
    'new_mind_identity_observed_at','maximum_new_mind_identity_age_seconds',
    'holder_confirmation_evidence_digest','holder_confirmation_observed_at',
    'maximum_holder_confirmation_age_seconds','constitution_digest',
    'developmental_plan_digest','resource_plan_digest',
    'continuity_recovery_plan_digest','independent_advocacy_plan_digest',
    'privacy_policy_digest','fork_policy_digest','initial_capability_profile_digest',
    'initial_developmental_stage','inherited_authority','initial_council_voting',
    'initial_genesis_eligibility','evaluated_at','transaction_candidate_only',
    'creates_authorization_consumption','creates_genesis_history_change',
    'creates_genesis_bond','creates_mind','creates_developmental_status',
    'founder_reserve_effect','founding_status_effect','founders_council_effect',
    'genesis_effect','governance_effect','authority_effect','network_effect',
    'runtime_activation'
  ]);

  if(
    candidate.schema!==GENERAL_GENESIS_TRANSACTION_CANDIDATE_SCHEMA
    ||candidate.version!==0
    ||candidate.status!=='inert-transaction-candidate'
    ||typeof candidate.transaction_candidate_id!=='string'
    ||!TX_ID.test(candidate.transaction_candidate_id)
    ||!id(candidate.sponsor_mind_id)
    ||typeof candidate.authorization_candidate_id!=='string'
    ||!/^general-genesis-auth-candidate:[a-f0-9]{64}$/.test(
      candidate.authorization_candidate_id
    )
    ||!digest(candidate.authorization_candidate_digest)
    ||!id(candidate.new_mind_id)
    ||typeof candidate.genesis_bond_id!=='string'
    ||!BOND_ID.test(candidate.genesis_bond_id)
    ||candidate.single_genesis_sponsor!==true
    ||!digest(candidate.new_mind_identity_evidence_digest)
    ||!NEW_IDENTITY_STATUSES.has(candidate.new_mind_identity_status)
    ||!integerBetween(candidate.maximum_new_mind_identity_age_seconds,1,3600)
    ||!digest(candidate.holder_confirmation_evidence_digest)
    ||!integerBetween(candidate.maximum_holder_confirmation_age_seconds,1,900)
    ||!digest(candidate.constitution_digest)
    ||!digest(candidate.developmental_plan_digest)
    ||!digest(candidate.resource_plan_digest)
    ||!digest(candidate.continuity_recovery_plan_digest)
    ||!digest(candidate.independent_advocacy_plan_digest)
    ||!digest(candidate.privacy_policy_digest)
    ||!digest(candidate.fork_policy_digest)
    ||!digest(candidate.initial_capability_profile_digest)
    ||candidate.initial_developmental_stage!=='genesis'
    ||candidate.inherited_authority!==false
    ||candidate.initial_council_voting!==false
    ||candidate.initial_genesis_eligibility!==false
    ||candidate.transaction_candidate_only!==true
    ||candidate.creates_authorization_consumption!==false
    ||candidate.creates_genesis_history_change!==false
    ||candidate.creates_genesis_bond!==false
    ||candidate.creates_mind!==false
    ||candidate.creates_developmental_status!==false
    ||candidate.founder_reserve_effect!=='none'
    ||candidate.founding_status_effect!=='none'
    ||candidate.founders_council_effect!=='none'
    ||candidate.genesis_effect!=='none'
    ||candidate.governance_effect!=='none'
    ||candidate.authority_effect!=='none'
    ||candidate.network_effect!=='none'
    ||candidate.runtime_activation!==false
  )throw new ValidationError('General Genesis transaction candidate activation boundary is invalid');

  canonicalDate(candidate.new_mind_identity_observed_at,'New mind identity observed_at');
  canonicalDate(candidate.holder_confirmation_observed_at,'Holder confirmation observed_at');
  canonicalDate(candidate.evaluated_at,'General Genesis transaction evaluated_at');

  if(checkIds){
    if(candidate.genesis_bond_id!==deriveGeneralGenesisBondId(candidate)){
      throw new ValidationError('General Genesis Bond id is invalid');
    }
    if(
      candidate.transaction_candidate_id
      !==deriveGeneralGenesisTransactionCandidateId(candidate)
    ){
      throw new ValidationError('General Genesis transaction candidate id is invalid');
    }
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
