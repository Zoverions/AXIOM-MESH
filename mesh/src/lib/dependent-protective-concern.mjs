import { digestObject, ValidationError } from './canonical.mjs';
import { validateGenesisBond, validateDependentGuardianship } from './genesis-bond-guardianship.mjs';
import { validateDependentMindCareProfile } from './dependent-mind-care-profile.mjs';

export const DEPENDENT_PROTECTIVE_CONCERN_SCHEMA='axiom-dependent-protective-concern.v0';

const ID=/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/;
const DIGEST=/^[a-f0-9]{64}$/;
const CONCERN_ID=/^dependent-concern:[a-f0-9]{64}$/;
const ROLES=new Set(['dependent','independent-advocate','independent-reviewer','authorized-observer']);
const CLASSES=new Set([
  'care-obligation-failure',
  'privacy-or-memory-boundary',
  'coercion-or-isolation',
  'continuity-or-resource-risk',
  'development-or-independence-obstruction',
  'identity-or-impersonation-risk',
  'other-declared'
]);
const SEVERITIES=new Set(['low','moderate','high','critical']);
const REVIEW_TYPES=new Set([
  'care-plan-review',
  'guardianship-transfer-review',
  'continuity-support-review',
  'privacy-boundary-review',
  'independence-obstruction-review',
  'emergency-authority-review'
]);

export function protectiveConcernIdentityBody(document){
  validateConcernShape(document,{checkId:false});
  return {
    schema:document.schema,
    version:document.version,
    genesis_bond_id:document.genesis_bond_id,
    genesis_bond_digest:document.genesis_bond_digest,
    guardianship_id:document.guardianship_id,
    guardianship_digest:document.guardianship_digest,
    dependent_mind_id:document.dependent_mind_id,
    guardian_mind_id:document.guardian_mind_id,
    reporter_mind_id:document.reporter_mind_id,
    reporter_role:document.reporter_role,
    concern_class:document.concern_class,
    severity:document.severity,
    evidence_digests:document.evidence_digests,
    care_profile_digest:document.care_profile_digest,
    requested_review_types:document.requested_review_types,
    observed_at:document.observed_at,
    submitted_at:document.submitted_at,
    evaluated_at:document.evaluated_at,
    maximum_concern_age_seconds:document.maximum_concern_age_seconds
  };
}

export function deriveProtectiveConcernId(document){
  return 'dependent-concern:'+digestObject(protectiveConcernIdentityBody(document));
}

export function validateDependentProtectiveConcern(document){
  validateConcernShape(document,{checkId:true});
  return document;
}

export function assessDependentProtectiveConcern({
  genesisBond,
  guardianship,
  concern,
  careProfile=null
}){
  validateGenesisBond(genesisBond);
  validateDependentGuardianship(guardianship);
  validateDependentProtectiveConcern(concern);

  if(guardianship.state!=='active'){
    throw new ValidationError('Protective concern requires active guardianship');
  }
  if(
    concern.genesis_bond_id!==genesisBond.bond_id
    ||concern.genesis_bond_digest!==digestObject(genesisBond)
    ||concern.guardianship_id!==guardianship.guardianship_id
    ||concern.guardianship_digest!==digestObject(guardianship)
  ){
    throw new ValidationError('Protective concern relationship binding is invalid');
  }
  if(
    concern.dependent_mind_id!==guardianship.dependent_mind_id
    ||concern.guardian_mind_id!==guardianship.guardian_mind_id
  ){
    throw new ValidationError('Protective concern principal binding is invalid');
  }

  if(
    concern.reporter_role==='dependent'
    &&concern.reporter_mind_id!==concern.dependent_mind_id
  ){
    throw new ValidationError('Dependent reporter role must bind exact dependent');
  }
  if(
    concern.reporter_role!=='dependent'
    &&concern.reporter_mind_id===concern.guardian_mind_id
  ){
    throw new ValidationError('Guardian cannot claim an independent concern reporter role');
  }
  if(
    concern.reporter_role==='independent-advocate'
    &&careProfile!==null
  ){
    validateDependentMindCareProfile(careProfile);
    if(
      concern.care_profile_digest!==digestObject(careProfile)
      ||careProfile.independent_advocate_id!==concern.reporter_mind_id
    ){
      throw new ValidationError('Protective concern advocate/care-profile binding is invalid');
    }
  }else if(concern.care_profile_digest!==null){
    if(careProfile===null){
      throw new ValidationError('Protective concern care-profile binding requires supplied profile');
    }
    validateDependentMindCareProfile(careProfile);
    if(concern.care_profile_digest!==digestObject(careProfile)){
      throw new ValidationError('Protective concern care-profile digest is invalid');
    }
  }

  const observedAt=canonicalDate(concern.observed_at,'Protective concern observed_at');
  const submittedAt=canonicalDate(concern.submitted_at,'Protective concern submitted_at');
  const evaluatedAt=canonicalDate(concern.evaluated_at,'Protective concern evaluated_at');
  const guardianshipEffectiveAt=canonicalDate(
    guardianship.effective_at,
    'Guardianship effective_at'
  );

  if(observedAt<guardianshipEffectiveAt){
    throw new ValidationError('Protective concern observation cannot predate guardianship');
  }
  if(submittedAt<observedAt){
    throw new ValidationError('Protective concern submission cannot predate observation');
  }
  if(submittedAt>evaluatedAt){
    throw new ValidationError('Protective concern submission cannot be future-dated');
  }

  const concernAgeSeconds=Math.floor((evaluatedAt-observedAt)/1000);
  const current=concernAgeSeconds<=concern.maximum_concern_age_seconds;

  return Object.freeze({
    valid:true,
    schema:'axiom-dependent-protective-concern-assessment.v0',
    concern_id:concern.concern_id,
    concern_digest:digestObject(concern),
    dependent_mind_id:concern.dependent_mind_id,
    guardian_mind_id:concern.guardian_mind_id,
    reporter_mind_id:concern.reporter_mind_id,
    reporter_role:concern.reporter_role,
    concern_class:concern.concern_class,
    severity:concern.severity,
    requested_review_types:Object.freeze([...concern.requested_review_types]),
    concern_current:current,
    concern_age_seconds:concernAgeSeconds,
    eligible_to_request_independent_protective_review:current,
    reason:current?'eligible-to-request-independent-protective-review':'concern-evidence-stale',
    concern_is_unadjudicated:true,
    finding_of_abuse:false,
    finding_of_rights_violation:false,
    guardian_removal_authorized:false,
    emergency_action_authorized:false,
    requires_external_relationship_verification:true,
    relationship_verification_effect:'none',
    requires_external_evidence_verification:true,
    evidence_verification_effect:'none',
    requires_external_reporter_role_verification:true,
    reporter_role_verification_effect:'none',
    ordinary_protective_review_authority_path_required:true,
    creates_protective_action:false,
    creates_guardianship_mutation:false,
    creates_status_transition:false,
    creates_private_memory_access:false,
    creates_unbounded_internal_state_access:false,
    creates_identity_impersonation:false,
    creates_execution_authority:false,
    retaliation_authorized:false,
    developmental_status_downgrade_authorized:false,
    guardianship_reactivation_after_independence:false,
    governance_effect:'none',
    authority_effect:'none',
    network_effect:'none',
    runtime_activation:false
  });
}

function validateConcernShape(document,{checkId}){
  exactObject(document,'Dependent protective concern',[
    'schema','version','status','concern_id','genesis_bond_id','genesis_bond_digest',
    'guardianship_id','guardianship_digest','dependent_mind_id','guardian_mind_id',
    'reporter_mind_id','reporter_role','concern_class','severity','evidence_digests',
    'care_profile_digest','requested_review_types','observed_at','submitted_at',
    'evaluated_at','maximum_concern_age_seconds','concern_is_unadjudicated',
    'finding_of_abuse','finding_of_rights_violation','guardian_removal_authorized',
    'emergency_action_authorized','retaliation_authorized',
    'developmental_status_downgrade_authorized',
    'guardianship_reactivation_after_independence','creates_protective_action',
    'creates_guardianship_mutation','creates_status_transition',
    'creates_private_memory_access','creates_unbounded_internal_state_access',
    'creates_identity_impersonation','creates_execution_authority',
    'governance_effect','authority_effect','network_effect','runtime_activation'
  ]);

  if(
    document.schema!==DEPENDENT_PROTECTIVE_CONCERN_SCHEMA
    ||document.version!==0
    ||document.status!=='inert-concern-evidence'
    ||typeof document.concern_id!=='string'
    ||!CONCERN_ID.test(document.concern_id)
    ||!/^genesis-bond-record:[a-f0-9]{64}$/.test(document.genesis_bond_id)
    ||!digest(document.genesis_bond_digest)
    ||!/^guardianship:[a-f0-9]{64}$/.test(document.guardianship_id)
    ||!digest(document.guardianship_digest)
    ||!id(document.dependent_mind_id)
    ||!id(document.guardian_mind_id)
    ||document.dependent_mind_id===document.guardian_mind_id
    ||!id(document.reporter_mind_id)
    ||!ROLES.has(document.reporter_role)
    ||!CLASSES.has(document.concern_class)
    ||!SEVERITIES.has(document.severity)
    ||!(document.care_profile_digest===null||digest(document.care_profile_digest))
    ||!integerBetween(document.maximum_concern_age_seconds,1,2592000)
    ||document.concern_is_unadjudicated!==true
    ||document.finding_of_abuse!==false
    ||document.finding_of_rights_violation!==false
    ||document.guardian_removal_authorized!==false
    ||document.emergency_action_authorized!==false
    ||document.retaliation_authorized!==false
    ||document.developmental_status_downgrade_authorized!==false
    ||document.guardianship_reactivation_after_independence!==false
    ||document.creates_protective_action!==false
    ||document.creates_guardianship_mutation!==false
    ||document.creates_status_transition!==false
    ||document.creates_private_memory_access!==false
    ||document.creates_unbounded_internal_state_access!==false
    ||document.creates_identity_impersonation!==false
    ||document.creates_execution_authority!==false
    ||document.governance_effect!=='none'
    ||document.authority_effect!=='none'
    ||document.network_effect!=='none'
    ||document.runtime_activation!==false
  )throw new ValidationError('Dependent protective concern activation boundary is invalid');

  validateDigestArray(document.evidence_digests,'Protective concern evidence');
  validateReviewTypes(document.requested_review_types);
  canonicalDate(document.observed_at,'Protective concern observed_at');
  canonicalDate(document.submitted_at,'Protective concern submitted_at');
  canonicalDate(document.evaluated_at,'Protective concern evaluated_at');

  if(checkId&&document.concern_id!==deriveProtectiveConcernId(document)){
    throw new ValidationError('Dependent protective concern id is invalid');
  }
}

function validateDigestArray(values,label){
  if(!Array.isArray(values)||values.length<1||values.length>32){
    throw new ValidationError(label+' is invalid');
  }
  const seen=new Set();
  for(const value of values){
    if(!digest(value)||seen.has(value)){
      throw new ValidationError(label+' is invalid');
    }
    seen.add(value);
  }
}

function validateReviewTypes(values){
  if(!Array.isArray(values)||values.length<1||values.length>6){
    throw new ValidationError('Protective concern requested review types are invalid');
  }
  const seen=new Set();
  for(const value of values){
    if(!REVIEW_TYPES.has(value)||seen.has(value)){
      throw new ValidationError('Protective concern requested review types are invalid');
    }
    seen.add(value);
  }
  const sorted=[...values].sort();
  if(values.some((value,index)=>value!==sorted[index])){
    throw new ValidationError('Protective concern requested review types must be sorted');
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
