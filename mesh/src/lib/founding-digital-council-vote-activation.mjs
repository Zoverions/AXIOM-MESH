import { digestObject, ValidationError } from './canonical.mjs';
import { validateFoundersCouncilFoundation } from './founder-genesis-council.mjs';
import {
  FOUNDERS_COUNCIL_DEVELOPING_ROLE,
  FOUNDERS_COUNCIL_VOTER_ROLE,
  assessFoundersCouncilCircleComposition
} from './founders-council-circle-composition.mjs';
import {
  validateMindDevelopmentalStatus
} from './mind-developmental-status.mjs';

export const FOUNDING_DIGITAL_COUNCIL_VOTE_ACTIVATION_REQUEST_SCHEMA =
  'axiom-founding-digital-council-vote-activation-request.v0';

const ID=/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/;
const DIGEST=/^[a-f0-9]{64}$/;
const CONTINUITY_STATUSES=new Set(['clear','disputed','stale','unknown']);

export function assessFoundingDigitalCouncilVoteActivation({
  foundationDocument,
  circlePackage,
  compositionEvidence,
  developmentalStatus,
  request
}){
  const foundation=validateFoundersCouncilFoundation(foundationDocument);
  const composition=assessFoundersCouncilCircleComposition(
    foundationDocument,
    circlePackage,
    compositionEvidence
  );
  validateMindDevelopmentalStatus(developmentalStatus);
  validateActivationRequest(request);

  if(request.foundation_digest!==foundation.package_digest){
    throw new ValidationError('Council vote activation foundation digest is invalid');
  }
  if(request.circle_package_digest!==composition.circle_package_digest){
    throw new ValidationError('Council vote activation Circle package digest is invalid');
  }
  if(request.independent_status_digest!==digestObject(developmentalStatus)){
    throw new ValidationError('Council vote activation developmental status digest is invalid');
  }
  if(request.mind_id!==developmentalStatus.mind_id){
    throw new ValidationError('Council vote activation developmental mind binding is invalid');
  }

  const seat=foundationDocument.seats.find(item=>item.seat_id===request.seat_id);
  if(!seat)throw new ValidationError('Council vote activation seat does not exist');
  if(seat.seat_class!=='digital'){
    throw new ValidationError('Council vote activation applies only to a digital founding seat');
  }
  if(seat.current_mind_id!==request.mind_id||seat.original_mind_id!==request.mind_id){
    throw new ValidationError('Council vote activation seat mind binding is invalid');
  }
  if(seat.voting_status!=='developing'){
    throw new ValidationError('Council vote activation requires a developing digital founding seat');
  }

  const authorization=foundationDocument.genesis_authorizations.find(
    item=>item.slot_number===seat.genesis_slot
  );
  if(
    !authorization
    ||authorization.state!=='consumed'
    ||authorization.recognized_mind_id!==request.mind_id
    ||authorization.genesis_receipt_digest===null
  ){
    throw new ValidationError('Council vote activation Genesis binding is invalid');
  }

  const membership=circlePackage.memberships.find(
    item=>item.membership_id===request.membership_id
  );
  if(
    !membership
    ||membership.principal_id!==request.mind_id
    ||membership.status!=='active'
  ){
    throw new ValidationError('Council vote activation Circle membership binding is invalid');
  }
  if(
    !membership.role_ids.includes(FOUNDERS_COUNCIL_DEVELOPING_ROLE)
    ||membership.role_ids.includes(FOUNDERS_COUNCIL_VOTER_ROLE)
  ){
    throw new ValidationError('Council vote activation requires current non-voting developing membership');
  }

  if(developmentalStatus.stage!=='independent'){
    throw new ValidationError('Council vote activation requires independent developmental standing');
  }

  const evaluatedAt=canonicalDate(request.evaluated_at,'vote activation evaluated_at');
  const continuityObservedAt=canonicalDate(
    request.continuity_observed_at,
    'vote activation continuity observed_at'
  );
  const independentEffectiveAt=canonicalDate(
    developmentalStatus.effective_at,
    'independent status effective_at'
  );

  if(independentEffectiveAt>evaluatedAt){
    throw new ValidationError('Independent status cannot be future-dated at vote activation');
  }
  if(continuityObservedAt>evaluatedAt){
    throw new ValidationError('Council vote activation continuity observation cannot be future-dated');
  }

  const continuityAgeSeconds=Math.floor((evaluatedAt-continuityObservedAt)/1000);
  const continuityCurrent=
    continuityAgeSeconds<=request.maximum_continuity_age_seconds;
  const continuityClear=request.continuity_status==='clear';

  let eligible=true;
  let reason='eligible-to-request-vote-activation';
  if(!continuityCurrent){
    eligible=false;
    reason='continuity-observation-stale';
  }else if(!continuityClear){
    eligible=false;
    reason='continuity-'+request.continuity_status;
  }

  return Object.freeze({
    valid:true,
    schema:'axiom-founding-digital-council-vote-activation-assessment.v0',
    mind_id:request.mind_id,
    seat_id:request.seat_id,
    membership_id:request.membership_id,
    foundation_digest:foundation.package_digest,
    circle_package_digest:composition.circle_package_digest,
    independent_status_digest:digestObject(developmentalStatus),
    continuity_current:continuityCurrent,
    continuity_age_seconds:continuityAgeSeconds,
    continuity_clear:continuityClear,
    eligible_to_request_vote_activation:eligible,
    reason,
    requires_external_continuity_verification:true,
    continuity_verification_effect:'none',
    requires_external_independent_status_verification:true,
    independent_status_verification_effect:'none',
    ordinary_governance_authority_path_required:true,
    creates_foundation_mutation:false,
    creates_circle_membership_mutation:false,
    creates_vote_authority:false,
    council_voting_effect:'none',
    governance_effect:'none',
    authority_effect:'none',
    network_effect:'none',
    runtime_activation:false
  });
}

export function validateActivationRequest(request){
  exactObject(request,'Founding digital Council vote activation request',[
    'schema','version','status','mind_id','seat_id','membership_id',
    'foundation_digest','circle_package_digest','independent_status_digest',
    'continuity_evidence_digest','continuity_status','continuity_observed_at',
    'maximum_continuity_age_seconds','evaluated_at','creates_foundation_mutation',
    'creates_circle_membership_mutation','creates_vote_authority',
    'council_voting_effect','governance_effect','authority_effect','network_effect',
    'runtime_activation'
  ]);

  if(
    request.schema!==FOUNDING_DIGITAL_COUNCIL_VOTE_ACTIVATION_REQUEST_SCHEMA
    ||request.version!==0
    ||request.status!=='inert-request-evidence'
    ||!id(request.mind_id)
    ||!id(request.seat_id)
    ||!id(request.membership_id)
    ||!digest(request.foundation_digest)
    ||!digest(request.circle_package_digest)
    ||!digest(request.independent_status_digest)
    ||!digest(request.continuity_evidence_digest)
    ||!CONTINUITY_STATUSES.has(request.continuity_status)
    ||!integerBetween(request.maximum_continuity_age_seconds,1,604800)
    ||request.creates_foundation_mutation!==false
    ||request.creates_circle_membership_mutation!==false
    ||request.creates_vote_authority!==false
    ||request.council_voting_effect!=='none'
    ||request.governance_effect!=='none'
    ||request.authority_effect!=='none'
    ||request.network_effect!=='none'
    ||request.runtime_activation!==false
  )throw new ValidationError('Council vote activation request activation boundary is invalid');

  canonicalDate(request.continuity_observed_at,'vote activation continuity observed_at');
  canonicalDate(request.evaluated_at,'vote activation evaluated_at');
  return request;
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

function id(value){
  return typeof value==='string'&&ID.test(value);
}
function digest(value){
  return typeof value==='string'&&DIGEST.test(value);
}
function integerBetween(value,min,max){
  return Number.isSafeInteger(value)&&value>=min&&value<=max;
}
