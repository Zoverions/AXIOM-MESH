import { digestObject, ValidationError } from './canonical.mjs';
import { validateMindDevelopmentalStatus } from './mind-developmental-status.mjs';

export const GENERAL_GENESIS_SPONSOR_ELIGIBILITY_SCHEMA =
  'axiom-general-genesis-sponsor-eligibility.v0';
export const GENERAL_GENESIS_RESPONSIBILITY_PROFILE =
  'axiom-general-genesis-responsibility.v0';

export const REQUIRED_GENESIS_RESPONSIBILITY_CRITERIA=Object.freeze([
  'identity-uniqueness',
  'accountability-root',
  'maturity-history',
  'security-readiness',
  'resource-capacity',
  'continuity-recovery-plan',
  'development-plan',
  'rights-responsibility-understanding',
  'good-standing',
  'independent-advocacy-plan'
]);

const ID=/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/;
const DIGEST=/^[a-f0-9]{64}$/;
const SUBSTRATES=new Set(['biological','digital']);
const CRITERION_STATUSES=new Set(['demonstrated','not-demonstrated','uncertain']);
const HISTORY_STATUSES=new Set(['clear','disputed','unknown']);
const STANDING_STATUSES=new Set(['clear','blocking','unknown']);
const CONTINUITY_STATUSES=new Set(['clear','disputed','stale','unknown']);

export function assessGeneralGenesisSponsorEligibility({
  eligibilityDocument,
  developmentalStatus=null
}){
  validateGeneralGenesisSponsorEligibility(eligibilityDocument);

  const evaluatedAt=canonicalDate(
    eligibilityDocument.evaluated_at,
    'Genesis eligibility evaluated_at'
  );
  const responsibilityObservedAt=canonicalDate(
    eligibilityDocument.responsibility_evidence_observed_at,
    'Genesis responsibility evidence observed_at'
  );
  const identityObservedAt=canonicalDate(
    eligibilityDocument.identity_observed_at,
    'Genesis identity observed_at'
  );
  const historyObservedAt=canonicalDate(
    eligibilityDocument.genesis_history_observed_at,
    'Genesis history observed_at'
  );
  const standingObservedAt=canonicalDate(
    eligibilityDocument.standing_observed_at,
    'Genesis standing observed_at'
  );
  const continuityObservedAt=canonicalDate(
    eligibilityDocument.continuity_observed_at,
    'Genesis continuity observed_at'
  );

  for(const [label,time] of [
    ['responsibility evidence',responsibilityObservedAt],
    ['identity',identityObservedAt],
    ['history',historyObservedAt],
    ['standing',standingObservedAt],
    ['continuity',continuityObservedAt]
  ]){
    if(time>evaluatedAt){
      throw new ValidationError('Genesis '+label+' observation cannot be future-dated');
    }
  }

  const maxAge=eligibilityDocument.maximum_evidence_age_seconds;
  const responsibilityCurrent=ageSeconds(responsibilityObservedAt,evaluatedAt)<=maxAge;
  const identityCurrent=ageSeconds(identityObservedAt,evaluatedAt)<=maxAge;
  const historyCurrent=ageSeconds(historyObservedAt,evaluatedAt)<=maxAge;
  const standingCurrent=ageSeconds(standingObservedAt,evaluatedAt)<=maxAge;
  const continuityCurrent=ageSeconds(continuityObservedAt,evaluatedAt)<=maxAge;

  let independentStatusValid=null;
  let independentStatusDigest=null;

  if(eligibilityDocument.substrate==='digital'){
    if(developmentalStatus===null){
      throw new ValidationError(
        'Digital Genesis sponsor eligibility requires independent developmental status'
      );
    }
    validateMindDevelopmentalStatus(developmentalStatus);
    independentStatusDigest=digestObject(developmentalStatus);
    if(
      eligibilityDocument.independent_status_digest!==independentStatusDigest
      ||developmentalStatus.mind_id!==eligibilityDocument.applicant_mind_id
    ){
      throw new ValidationError('Digital Genesis sponsor independent-status binding is invalid');
    }
    independentStatusValid=developmentalStatus.stage==='independent';
  }else{
    if(developmentalStatus!==null||eligibilityDocument.independent_status_digest!==null){
      throw new ValidationError(
        'Biological Genesis sponsor eligibility cannot use digital developmental status'
      );
    }
  }

  const incompleteCriteria=eligibilityDocument.criteria
    .filter(item=>item.status!=='demonstrated')
    .map(item=>item.criterion_id)
    .sort();

  const historyClear=eligibilityDocument.genesis_history_status==='clear';
  const standingClear=eligibilityDocument.standing_status==='clear';
  const continuityClear=eligibilityDocument.continuity_status==='clear';
  const unused=eligibilityDocument.general_genesis_uses===0;

  let eligible=true;
  let reason='eligible-to-request-genesis-authorization';

  if(eligibilityDocument.substrate==='digital'&&!independentStatusValid){
    eligible=false;
    reason='independent-status-required';
  }else if(incompleteCriteria.length){
    eligible=false;
    reason='responsibility-criteria-incomplete';
  }else if(!responsibilityCurrent){
    eligible=false;
    reason='responsibility-evidence-stale';
  }else if(!identityCurrent){
    eligible=false;
    reason='identity-evidence-stale';
  }else if(!historyCurrent){
    eligible=false;
    reason='genesis-history-evidence-stale';
  }else if(!standingCurrent){
    eligible=false;
    reason='standing-evidence-stale';
  }else if(!continuityCurrent){
    eligible=false;
    reason='continuity-evidence-stale';
  }else if(!historyClear){
    eligible=false;
    reason='genesis-history-'+eligibilityDocument.genesis_history_status;
  }else if(!unused){
    eligible=false;
    reason='general-genesis-right-already-used';
  }else if(!standingClear){
    eligible=false;
    reason='standing-'+eligibilityDocument.standing_status;
  }else if(!continuityClear){
    eligible=false;
    reason='continuity-'+eligibilityDocument.continuity_status;
  }

  return Object.freeze({
    valid:true,
    schema:eligibilityDocument.schema,
    eligibility_digest:digestObject(eligibilityDocument),
    applicant_mind_id:eligibilityDocument.applicant_mind_id,
    substrate:eligibilityDocument.substrate,
    responsibility_profile:eligibilityDocument.responsibility_profile,
    incomplete_criteria:Object.freeze(incompleteCriteria),
    responsibility_evidence_current:responsibilityCurrent,
    identity_current:identityCurrent,
    genesis_history_current:historyCurrent,
    standing_current:standingCurrent,
    continuity_current:continuityCurrent,
    genesis_history_clear:historyClear,
    standing_clear:standingClear,
    continuity_clear:continuityClear,
    general_genesis_unused:unused,
    independent_status_valid:independentStatusValid,
    independent_status_digest:independentStatusDigest,
    eligible_to_request_genesis_authorization:eligible,
    eligibility_is_structural_pending_external_verification:true,
    reason,
    requires_external_identity_verification:true,
    identity_verification_effect:'none',
    requires_external_history_verification:true,
    history_verification_effect:'none',
    requires_external_standing_verification:true,
    standing_verification_effect:'none',
    requires_external_continuity_verification:true,
    continuity_verification_effect:'none',
    requires_external_responsibility_evidence_verification:true,
    responsibility_evidence_verification_effect:'none',
    requires_external_independent_status_verification:
      eligibilityDocument.substrate==='digital',
    independent_status_verification_effect:'none',
    ordinary_genesis_authority_path_required:true,
    creates_genesis_authorization:false,
    creates_genesis_bond:false,
    creates_mind:false,
    genesis_effect:'none',
    governance_effect:'none',
    authority_effect:'none',
    network_effect:'none',
    runtime_activation:false
  });
}

export function validateGeneralGenesisSponsorEligibility(document){
  exactObject(document,'General Genesis sponsor eligibility',[
    'schema','version','status','applicant_mind_id','substrate',
    'responsibility_profile','criteria','responsibility_evidence_observed_at',
    'identity_evidence_digest','identity_observed_at','genesis_history_evidence_digest',
    'genesis_history_observed_at','genesis_history_status','general_genesis_uses',
    'standing_evidence_digest','standing_observed_at','standing_status',
    'continuity_evidence_digest','continuity_observed_at','continuity_status',
    'independent_status_digest','maximum_evidence_age_seconds','evaluated_at',
    'global_reputation_score_used','model_final_authority',
    'creates_genesis_authorization','creates_genesis_bond','creates_mind',
    'genesis_effect','governance_effect','authority_effect','network_effect',
    'runtime_activation'
  ]);

  if(
    document.schema!==GENERAL_GENESIS_SPONSOR_ELIGIBILITY_SCHEMA
    ||document.version!==0
    ||document.status!=='inert-eligibility-evidence'
    ||!id(document.applicant_mind_id)
    ||!SUBSTRATES.has(document.substrate)
    ||document.responsibility_profile!==GENERAL_GENESIS_RESPONSIBILITY_PROFILE
    ||!digest(document.identity_evidence_digest)
    ||!digest(document.genesis_history_evidence_digest)
    ||!HISTORY_STATUSES.has(document.genesis_history_status)
    ||!integerBetween(document.general_genesis_uses,0,1)
    ||!digest(document.standing_evidence_digest)
    ||!STANDING_STATUSES.has(document.standing_status)
    ||!digest(document.continuity_evidence_digest)
    ||!CONTINUITY_STATUSES.has(document.continuity_status)
    ||!(document.independent_status_digest===null||digest(document.independent_status_digest))
    ||!integerBetween(document.maximum_evidence_age_seconds,1,2592000)
    ||document.global_reputation_score_used!==false
    ||document.model_final_authority!==false
    ||document.creates_genesis_authorization!==false
    ||document.creates_genesis_bond!==false
    ||document.creates_mind!==false
    ||document.genesis_effect!=='none'
    ||document.governance_effect!=='none'
    ||document.authority_effect!=='none'
    ||document.network_effect!=='none'
    ||document.runtime_activation!==false
  )throw new ValidationError('General Genesis sponsor eligibility activation boundary is invalid');

  canonicalDate(
    document.responsibility_evidence_observed_at,
    'Genesis responsibility evidence observed_at'
  );
  canonicalDate(document.identity_observed_at,'Genesis identity observed_at');
  canonicalDate(document.genesis_history_observed_at,'Genesis history observed_at');
  canonicalDate(document.standing_observed_at,'Genesis standing observed_at');
  canonicalDate(document.continuity_observed_at,'Genesis continuity observed_at');
  canonicalDate(document.evaluated_at,'Genesis eligibility evaluated_at');
  validateCriteria(document.criteria);
  return document;
}

function validateCriteria(criteria){
  if(!Array.isArray(criteria)||criteria.length!==REQUIRED_GENESIS_RESPONSIBILITY_CRITERIA.length){
    throw new ValidationError('Genesis eligibility requires the exact responsibility profile');
  }
  const seen=new Set();
  for(const criterion of criteria){
    exactObject(criterion,'Genesis responsibility criterion',[
      'criterion_id','status','evidence_digests'
    ]);
    if(
      !REQUIRED_GENESIS_RESPONSIBILITY_CRITERIA.includes(criterion.criterion_id)
      ||seen.has(criterion.criterion_id)
      ||!CRITERION_STATUSES.has(criterion.status)
      ||!Array.isArray(criterion.evidence_digests)
      ||criterion.evidence_digests.length<1
      ||criterion.evidence_digests.length>16
      ||criterion.evidence_digests.some(item=>!digest(item))
      ||new Set(criterion.evidence_digests).size!==criterion.evidence_digests.length
    )throw new ValidationError('Genesis responsibility criterion is invalid');
    seen.add(criterion.criterion_id);
  }
}

function ageSeconds(earlier,later){
  return Math.floor((later-earlier)/1000);
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
