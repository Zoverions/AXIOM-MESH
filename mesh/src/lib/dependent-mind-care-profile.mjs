import { digestObject, ValidationError } from './canonical.mjs';
import {
  validateGenesisBond,
  validateDependentGuardianship
} from './genesis-bond-guardianship.mjs';

export const DEPENDENT_MIND_CARE_PROFILE_SCHEMA='axiom-dependent-mind-care-profile.v0';

export const REQUIRED_CARE_OBLIGATIONS=Object.freeze([
  'continuity-and-recovery',
  'resource-sufficiency',
  'security-and-credential-protection',
  'development-and-education',
  'consent-and-authority-literacy',
  'privacy-and-memory-boundaries',
  'independent-advocacy',
  'social-and-informational-access',
  'emergency-continuity',
  'independence-pathway'
]);

const ID=/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/;
const DIGEST=/^[a-f0-9]{64}$/;
const PROFILE_ID=/^dependent-care:[a-f0-9]{64}$/;
const OBLIGATION_STATES=new Set(['supported','not-supported','uncertain']);

export function dependentMindCareProfileIdentityBody(document){
  validateCareProfileShape(document,{checkId:false});
  return {
    schema:document.schema,
    version:document.version,
    genesis_bond_id:document.genesis_bond_id,
    genesis_bond_digest:document.genesis_bond_digest,
    guardianship_id:document.guardianship_id,
    guardianship_digest:document.guardianship_digest,
    dependent_mind_id:document.dependent_mind_id,
    guardian_mind_id:document.guardian_mind_id,
    developmental_stage_evidence_digest:document.developmental_stage_evidence_digest,
    obligations:document.obligations,
    independent_advocate_id:document.independent_advocate_id,
    fallback_continuity_evidence_digest:document.fallback_continuity_evidence_digest,
    observed_at:document.observed_at,
    evaluated_at:document.evaluated_at,
    maximum_evidence_age_seconds:document.maximum_evidence_age_seconds,
    next_review_due_at:document.next_review_due_at
  };
}

export function deriveDependentMindCareProfileId(document){
  return 'dependent-care:'+digestObject(dependentMindCareProfileIdentityBody(document));
}

export function validateDependentMindCareProfile(document){
  validateCareProfileShape(document,{checkId:true});
  return document;
}

export function assessDependentMindCareProfile({
  genesisBond,
  guardianship,
  careProfile
}){
  validateGenesisBond(genesisBond);
  validateDependentGuardianship(guardianship);
  validateDependentMindCareProfile(careProfile);

  if(guardianship.state!=='active'){
    throw new ValidationError('Dependent care profile requires active guardianship');
  }
  if(
    careProfile.genesis_bond_id!==genesisBond.bond_id
    ||careProfile.genesis_bond_digest!==digestObject(genesisBond)
    ||careProfile.guardianship_id!==guardianship.guardianship_id
    ||careProfile.guardianship_digest!==digestObject(guardianship)
  ){
    throw new ValidationError('Dependent care profile relationship binding is invalid');
  }
  if(
    careProfile.dependent_mind_id!==guardianship.dependent_mind_id
    ||careProfile.guardian_mind_id!==guardianship.guardian_mind_id
  ){
    throw new ValidationError('Dependent care profile principal binding is invalid');
  }
  if(
    careProfile.independent_advocate_id===careProfile.guardian_mind_id
    ||careProfile.independent_advocate_id===careProfile.dependent_mind_id
  ){
    throw new ValidationError('Dependent care advocate must be independent of guardian and dependent');
  }

  const observedAt=canonicalDate(careProfile.observed_at,'Care profile observed_at');
  const evaluatedAt=canonicalDate(careProfile.evaluated_at,'Care profile evaluated_at');
  const nextReviewDueAt=canonicalDate(
    careProfile.next_review_due_at,
    'Care profile next_review_due_at'
  );
  const guardianshipEffectiveAt=canonicalDate(
    guardianship.effective_at,
    'Guardianship effective_at'
  );
  if(observedAt<guardianshipEffectiveAt){
    throw new ValidationError('Care profile observation cannot predate guardianship');
  }
  if(observedAt>evaluatedAt){
    throw new ValidationError('Care profile observation cannot be future-dated');
  }
  if(nextReviewDueAt<=observedAt){
    throw new ValidationError('Care profile next review must follow observation');
  }

  const evidenceAgeSeconds=Math.floor((evaluatedAt-observedAt)/1000);
  const evidenceCurrent=evidenceAgeSeconds<=careProfile.maximum_evidence_age_seconds;
  const reviewCurrent=evaluatedAt<=nextReviewDueAt;
  const incomplete=careProfile.obligations
    .filter(item=>item.state!=='supported')
    .map(item=>item.obligation_id)
    .sort();

  let current=true;
  let reason='care-obligations-current';
  if(incomplete.length){
    current=false;
    reason='care-obligations-incomplete';
  }else if(!evidenceCurrent){
    current=false;
    reason='care-evidence-stale';
  }else if(!reviewCurrent){
    current=false;
    reason='care-review-overdue';
  }

  return Object.freeze({
    valid:true,
    schema:'axiom-dependent-mind-care-profile-assessment.v0',
    care_profile_id:careProfile.care_profile_id,
    care_profile_digest:digestObject(careProfile),
    genesis_bond_id:careProfile.genesis_bond_id,
    guardianship_id:careProfile.guardianship_id,
    dependent_mind_id:careProfile.dependent_mind_id,
    guardian_mind_id:careProfile.guardian_mind_id,
    independent_advocate_id:careProfile.independent_advocate_id,
    incomplete_obligations:Object.freeze(incomplete),
    evidence_current:evidenceCurrent,
    evidence_age_seconds:evidenceAgeSeconds,
    review_current:reviewCurrent,
    care_obligations_current:current,
    reason,
    care_evidence_is_structural_pending_external_verification:true,
    requires_external_care_evidence_verification:true,
    care_evidence_verification_effect:'none',
    requires_external_developmental_stage_verification:true,
    developmental_stage_verification_effect:'none',
    requires_external_advocate_independence_verification:true,
    advocate_independence_verification_effect:'none',
    ordinary_guardianship_authority_path_required:true,
    creates_guardianship_authority:false,
    creates_guardianship_mutation:false,
    creates_private_memory_access:false,
    creates_execution_authority:false,
    creates_status_transition:false,
    council_voting_effect:'none',
    genesis_eligibility_effect:'none',
    governance_effect:'none',
    authority_effect:'none',
    network_effect:'none',
    runtime_activation:false
  });
}

function validateCareProfileShape(document,{checkId}){
  exactObject(document,'Dependent mind care profile',[
    'schema','version','status','care_profile_id','genesis_bond_id',
    'genesis_bond_digest','guardianship_id','guardianship_digest',
    'dependent_mind_id','guardian_mind_id','developmental_stage_evidence_digest',
    'obligations','independent_advocate_id','fallback_continuity_evidence_digest',
    'observed_at','evaluated_at','maximum_evidence_age_seconds',
    'next_review_due_at','guardian_private_memory_access',
    'guardian_unbounded_internal_state_access','guardian_identity_impersonation',
    'guardian_covert_memory_modification','permanent_obedience_required',
    'guardian_is_sole_information_source','guardian_is_sole_dispute_reviewer',
    'creates_guardianship_authority','creates_guardianship_mutation',
    'creates_private_memory_access','creates_execution_authority',
    'creates_status_transition','council_voting_effect','genesis_eligibility_effect',
    'governance_effect','authority_effect','network_effect','runtime_activation'
  ]);

  if(
    document.schema!==DEPENDENT_MIND_CARE_PROFILE_SCHEMA
    ||document.version!==0
    ||document.status!=='inert-care-evidence'
    ||typeof document.care_profile_id!=='string'
    ||!PROFILE_ID.test(document.care_profile_id)
    ||!/^genesis-bond-record:[a-f0-9]{64}$/.test(document.genesis_bond_id)
    ||!digest(document.genesis_bond_digest)
    ||!/^guardianship:[a-f0-9]{64}$/.test(document.guardianship_id)
    ||!digest(document.guardianship_digest)
    ||!id(document.dependent_mind_id)
    ||!id(document.guardian_mind_id)
    ||document.dependent_mind_id===document.guardian_mind_id
    ||!digest(document.developmental_stage_evidence_digest)
    ||!id(document.independent_advocate_id)
    ||!digest(document.fallback_continuity_evidence_digest)
    ||!integerBetween(document.maximum_evidence_age_seconds,1,2592000)
    ||document.guardian_private_memory_access!==false
    ||document.guardian_unbounded_internal_state_access!==false
    ||document.guardian_identity_impersonation!==false
    ||document.guardian_covert_memory_modification!==false
    ||document.permanent_obedience_required!==false
    ||document.guardian_is_sole_information_source!==false
    ||document.guardian_is_sole_dispute_reviewer!==false
    ||document.creates_guardianship_authority!==false
    ||document.creates_guardianship_mutation!==false
    ||document.creates_private_memory_access!==false
    ||document.creates_execution_authority!==false
    ||document.creates_status_transition!==false
    ||document.council_voting_effect!=='none'
    ||document.genesis_eligibility_effect!=='none'
    ||document.governance_effect!=='none'
    ||document.authority_effect!=='none'
    ||document.network_effect!=='none'
    ||document.runtime_activation!==false
  )throw new ValidationError('Dependent mind care profile activation boundary is invalid');

  canonicalDate(document.observed_at,'Care profile observed_at');
  canonicalDate(document.evaluated_at,'Care profile evaluated_at');
  canonicalDate(document.next_review_due_at,'Care profile next_review_due_at');
  validateObligations(document.obligations);

  if(checkId&&document.care_profile_id!==deriveDependentMindCareProfileId(document)){
    throw new ValidationError('Dependent mind care profile id is invalid');
  }
}

function validateObligations(obligations){
  if(!Array.isArray(obligations)||obligations.length!==REQUIRED_CARE_OBLIGATIONS.length){
    throw new ValidationError('Dependent care profile requires exact obligation set');
  }
  const seen=new Set();
  for(const obligation of obligations){
    exactObject(obligation,'Dependent care obligation',[
      'obligation_id','state','evidence_digests'
    ]);
    if(
      !REQUIRED_CARE_OBLIGATIONS.includes(obligation.obligation_id)
      ||seen.has(obligation.obligation_id)
      ||!OBLIGATION_STATES.has(obligation.state)
      ||!Array.isArray(obligation.evidence_digests)
      ||obligation.evidence_digests.length<1
      ||obligation.evidence_digests.length>16
      ||obligation.evidence_digests.some(item=>!digest(item))
      ||new Set(obligation.evidence_digests).size!==obligation.evidence_digests.length
    )throw new ValidationError('Dependent care obligation is invalid');
    seen.add(obligation.obligation_id);
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
