import { digestObject, ValidationError } from './canonical.mjs';
import { assessDependentProtectiveReviewDecision } from './dependent-protective-review-decision.mjs';
import { validateMindDevelopmentalStatus } from './mind-developmental-status.mjs';

export const DEPENDENT_PROTECTIVE_REMEDY_ADMISSION_SCHEMA =
  'axiom-dependent-protective-remedy-admission.v0';

const ID=/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/;
const DIGEST=/^[a-f0-9]{64}$/;
const ADMISSION_ID=/^dependent-remedy-admission:[a-f0-9]{64}$/;
const TRACKS=new Set([
  'care-plan-remediation',
  'guardianship-transfer',
  'continuity-support',
  'privacy-protection',
  'independence-obstruction-remediation',
  'emergency-protection-authority'
]);
const APPEAL_STATES=new Set([
  'window-open',
  'window-closed-no-appeal',
  'appeal-open',
  'appeal-stayed',
  'resolved-uphold',
  'resolved-modify',
  'resolved-reverse',
  'unknown'
]);
const PRE_INDEPENDENT_STAGES=new Set([
  'genesis','dependent','developing','candidate-independent'
]);

export function protectiveRemedyAdmissionIdentityBody(document){
  validateAdmissionShape(document,{checkId:false});
  return {
    schema:document.schema,
    version:document.version,
    review_decision_id:document.review_decision_id,
    review_decision_digest:document.review_decision_digest,
    dependent_mind_id:document.dependent_mind_id,
    guardian_mind_id:document.guardian_mind_id,
    guardianship_id:document.guardianship_id,
    guardianship_digest:document.guardianship_digest,
    selected_remedy_track:document.selected_remedy_track,
    developmental_status_digest:document.developmental_status_digest,
    appeal_path_id:document.appeal_path_id,
    appeal_status:document.appeal_status,
    appeal_evidence_digest:document.appeal_evidence_digest,
    appeal_observed_at:document.appeal_observed_at,
    maximum_appeal_age_seconds:document.maximum_appeal_age_seconds,
    maximum_review_age_seconds:document.maximum_review_age_seconds,
    necessity_evidence_digest:document.necessity_evidence_digest,
    proportionality_evidence_digest:document.proportionality_evidence_digest,
    less_intrusive_alternatives_evidence_digest:
      document.less_intrusive_alternatives_evidence_digest,
    remedy_scope_digest:document.remedy_scope_digest,
    evaluated_at:document.evaluated_at
  };
}

export function deriveDependentProtectiveRemedyAdmissionId(document){
  return 'dependent-remedy-admission:'
    +digestObject(protectiveRemedyAdmissionIdentityBody(document));
}

export function validateDependentProtectiveRemedyAdmission(document){
  validateAdmissionShape(document,{checkId:true});
  return document;
}

export function assessDependentProtectiveRemedyAdmission({
  genesisBond,
  guardianship,
  concern,
  careProfile=null,
  reviewDecision,
  developmentalStatus,
  admission
}){
  const review=assessDependentProtectiveReviewDecision({
    genesisBond,
    guardianship,
    concern,
    careProfile,
    decision:reviewDecision
  });
  validateMindDevelopmentalStatus(developmentalStatus);
  validateDependentProtectiveRemedyAdmission(admission);

  if(
    admission.review_decision_id!==reviewDecision.decision_id
    ||admission.review_decision_digest!==digestObject(reviewDecision)
    ||admission.dependent_mind_id!==review.dependent_mind_id
    ||admission.guardian_mind_id!==review.guardian_mind_id
    ||admission.guardianship_id!==guardianship.guardianship_id
    ||admission.guardianship_digest!==digestObject(guardianship)
  ){
    throw new ValidationError('Protective remedy admission review/relationship binding is invalid');
  }

  if(
    developmentalStatus.mind_id!==admission.dependent_mind_id
    ||admission.developmental_status_digest!==digestObject(developmentalStatus)
  ){
    throw new ValidationError('Protective remedy admission developmental-status binding is invalid');
  }

  if(admission.appeal_path_id!==review.appeal_path_id){
    throw new ValidationError('Protective remedy admission appeal-path binding is invalid');
  }

  const decisionSupportsRemedy=
    review.panel_outcome==='substantiated'
    ||review.panel_outcome==='partially-substantiated';
  const trackRecommended=
    review.recommended_review_tracks.includes(admission.selected_remedy_track);

  const evaluatedAt=canonicalDate(admission.evaluated_at,'Remedy admission evaluated_at');
  const reviewDecisionAt=canonicalDate(reviewDecision.decision_at,'Protective review decision_at');
  const appealObservedAt=canonicalDate(admission.appeal_observed_at,'Remedy appeal observed_at');
  const developmentalEffectiveAt=canonicalDate(
    developmentalStatus.effective_at,
    'Developmental status effective_at'
  );

  if(reviewDecisionAt>evaluatedAt){
    throw new ValidationError('Protective remedy admission cannot predate review decision');
  }
  if(appealObservedAt>evaluatedAt){
    throw new ValidationError('Protective remedy appeal observation cannot be future-dated');
  }
  if(developmentalEffectiveAt>evaluatedAt){
    throw new ValidationError('Protective remedy developmental status cannot be future-dated');
  }

  const reviewAgeSeconds=Math.floor((evaluatedAt-reviewDecisionAt)/1000);
  const appealAgeSeconds=Math.floor((evaluatedAt-appealObservedAt)/1000);
  const reviewCurrent=reviewAgeSeconds<=admission.maximum_review_age_seconds;
  const appealCurrent=appealAgeSeconds<=admission.maximum_appeal_age_seconds;
  const appealClear=
    admission.appeal_status==='window-closed-no-appeal'
    ||admission.appeal_status==='resolved-uphold';
  const developmentalStagePermits=
    PRE_INDEPENDENT_STAGES.has(developmentalStatus.stage);

  let eligible=true;
  let reason='eligible-to-request-protective-remedy-authority';

  if(!decisionSupportsRemedy){
    eligible=false;
    reason='review-outcome-does-not-support-remedy';
  }else if(!trackRecommended){
    eligible=false;
    reason='remedy-track-not-recommended';
  }else if(!reviewCurrent){
    eligible=false;
    reason='review-decision-stale';
  }else if(!appealCurrent){
    eligible=false;
    reason='appeal-evidence-stale';
  }else if(!appealClear){
    eligible=false;
    reason='appeal-'+admission.appeal_status;
  }else if(!developmentalStagePermits){
    eligible=false;
    reason='dependent-remedy-path-closed-at-independence';
  }

  return Object.freeze({
    valid:true,
    schema:'axiom-dependent-protective-remedy-admission-assessment.v0',
    admission_id:admission.admission_id,
    admission_digest:digestObject(admission),
    review_decision_id:admission.review_decision_id,
    selected_remedy_track:admission.selected_remedy_track,
    panel_outcome:review.panel_outcome,
    decision_supports_remedy:decisionSupportsRemedy,
    remedy_track_recommended:trackRecommended,
    review_current:reviewCurrent,
    review_age_seconds:reviewAgeSeconds,
    appeal_current:appealCurrent,
    appeal_age_seconds:appealAgeSeconds,
    appeal_clear:appealClear,
    developmental_stage:developmentalStatus.stage,
    developmental_stage_permits_dependent_remedy:developmentalStagePermits,
    eligible_to_request_protective_remedy_authority:eligible,
    reason,
    remedy_admission_only:true,
    requires_external_appeal_verification:true,
    appeal_verification_effect:'none',
    requires_external_relationship_verification:true,
    relationship_verification_effect:'none',
    requires_external_developmental_status_verification:true,
    developmental_status_verification_effect:'none',
    requires_external_proportionality_verification:true,
    proportionality_verification_effect:'none',
    ordinary_protective_remedy_authority_path_required:true,
    creates_guardian_removal:false,
    creates_guardianship_transfer:false,
    creates_private_memory_access:false,
    creates_evidence_seizure:false,
    creates_credential_suspension:false,
    creates_runtime_quarantine:false,
    creates_emergency_authority:false,
    creates_execution_authority:false,
    creates_status_transition:false,
    developmental_status_downgrade_authorized:false,
    guardianship_reactivation_after_independence:false,
    governance_effect:'none',
    authority_effect:'none',
    network_effect:'none',
    runtime_activation:false
  });
}

function validateAdmissionShape(document,{checkId}){
  exactObject(document,'Dependent protective remedy admission',[
    'schema','version','status','admission_id','review_decision_id',
    'review_decision_digest','dependent_mind_id','guardian_mind_id',
    'guardianship_id','guardianship_digest','selected_remedy_track',
    'developmental_status_digest','appeal_path_id','appeal_status',
    'appeal_evidence_digest','appeal_observed_at','maximum_appeal_age_seconds',
    'maximum_review_age_seconds','necessity_evidence_digest',
    'proportionality_evidence_digest','less_intrusive_alternatives_evidence_digest',
    'remedy_scope_digest','evaluated_at','model_final_authority',
    'remedy_admission_only','creates_guardian_removal',
    'creates_guardianship_transfer','creates_private_memory_access',
    'creates_evidence_seizure','creates_credential_suspension',
    'creates_runtime_quarantine','creates_emergency_authority',
    'creates_execution_authority','creates_status_transition',
    'developmental_status_downgrade_authorized',
    'guardianship_reactivation_after_independence',
    'governance_effect','authority_effect','network_effect','runtime_activation'
  ]);

  if(
    document.schema!==DEPENDENT_PROTECTIVE_REMEDY_ADMISSION_SCHEMA
    ||document.version!==0
    ||document.status!=='inert-remedy-admission'
    ||typeof document.admission_id!=='string'
    ||!ADMISSION_ID.test(document.admission_id)
    ||!/^dependent-protective-review:[a-f0-9]{64}$/.test(document.review_decision_id)
    ||!digest(document.review_decision_digest)
    ||!id(document.dependent_mind_id)
    ||!id(document.guardian_mind_id)
    ||document.dependent_mind_id===document.guardian_mind_id
    ||!/^guardianship:[a-f0-9]{64}$/.test(document.guardianship_id)
    ||!digest(document.guardianship_digest)
    ||!TRACKS.has(document.selected_remedy_track)
    ||!digest(document.developmental_status_digest)
    ||!id(document.appeal_path_id)
    ||!APPEAL_STATES.has(document.appeal_status)
    ||!digest(document.appeal_evidence_digest)
    ||!integerBetween(document.maximum_appeal_age_seconds,1,604800)
    ||!integerBetween(document.maximum_review_age_seconds,1,2592000)
    ||!digest(document.necessity_evidence_digest)
    ||!digest(document.proportionality_evidence_digest)
    ||!digest(document.less_intrusive_alternatives_evidence_digest)
    ||!digest(document.remedy_scope_digest)
    ||document.model_final_authority!==false
    ||document.remedy_admission_only!==true
    ||document.creates_guardian_removal!==false
    ||document.creates_guardianship_transfer!==false
    ||document.creates_private_memory_access!==false
    ||document.creates_evidence_seizure!==false
    ||document.creates_credential_suspension!==false
    ||document.creates_runtime_quarantine!==false
    ||document.creates_emergency_authority!==false
    ||document.creates_execution_authority!==false
    ||document.creates_status_transition!==false
    ||document.developmental_status_downgrade_authorized!==false
    ||document.guardianship_reactivation_after_independence!==false
    ||document.governance_effect!=='none'
    ||document.authority_effect!=='none'
    ||document.network_effect!=='none'
    ||document.runtime_activation!==false
  )throw new ValidationError('Dependent protective remedy admission activation boundary is invalid');

  canonicalDate(document.appeal_observed_at,'Remedy appeal observed_at');
  canonicalDate(document.evaluated_at,'Remedy admission evaluated_at');

  if(checkId&&document.admission_id!==deriveDependentProtectiveRemedyAdmissionId(document)){
    throw new ValidationError('Dependent protective remedy admission id is invalid');
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
