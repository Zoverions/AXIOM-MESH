import { digestObject, ValidationError } from './canonical.mjs';
import { validateGenesisBond, validateDependentGuardianship } from './genesis-bond-guardianship.mjs';
import { assessDependentProtectiveConcern } from './dependent-protective-concern.mjs';

export const DEPENDENT_PROTECTIVE_REVIEW_DECISION_SCHEMA =
  'axiom-dependent-protective-review-decision.v0';

const ID=/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/;
const DIGEST=/^[a-f0-9]{64}$/;
const DECISION_ID=/^dependent-protective-review:[a-f0-9]{64}$/;
const ATTESTATIONS=new Set([
  'substantiated',
  'partially-substantiated',
  'not-substantiated',
  'inconclusive'
]);
const OUTCOMES=new Set([
  'substantiated',
  'partially-substantiated',
  'not-substantiated',
  'inconclusive'
]);
const TRACKS=new Set([
  'care-plan-remediation',
  'guardianship-transfer',
  'continuity-support',
  'privacy-protection',
  'independence-obstruction-remediation',
  'emergency-protection-authority',
  'no-further-action'
]);

export function protectiveReviewDecisionIdentityBody(document){
  validateDecisionShape(document,{checkId:false,checkOutcome:false});
  return {
    schema:document.schema,
    version:document.version,
    concern_id:document.concern_id,
    concern_digest:document.concern_digest,
    genesis_bond_id:document.genesis_bond_id,
    genesis_bond_digest:document.genesis_bond_digest,
    guardianship_id:document.guardianship_id,
    guardianship_digest:document.guardianship_digest,
    dependent_mind_id:document.dependent_mind_id,
    guardian_mind_id:document.guardian_mind_id,
    review_policy_digest:document.review_policy_digest,
    minimum_reviewers:document.minimum_reviewers,
    substantive_outcome_rule:document.substantive_outcome_rule,
    reviewers:document.reviewers,
    guardian_response_opportunity_evidence_digest:
      document.guardian_response_opportunity_evidence_digest,
    dependent_voice_evidence_digest:document.dependent_voice_evidence_digest,
    independent_advocacy_evidence_digest:document.independent_advocacy_evidence_digest,
    evidence_set_digest:document.evidence_set_digest,
    appeal_path_id:document.appeal_path_id,
    panel_outcome:document.panel_outcome,
    recommended_review_tracks:document.recommended_review_tracks,
    decision_at:document.decision_at
  };
}

export function deriveDependentProtectiveReviewDecisionId(document){
  return 'dependent-protective-review:'
    +digestObject(protectiveReviewDecisionIdentityBody(document));
}

export function deriveProtectiveReviewPanelOutcome(reviewers){
  validateReviewerPanel(reviewers);
  const threshold=Math.floor(reviewers.length/2)+1;
  const counts={
    substantiated:0,
    'partially-substantiated':0,
    'not-substantiated':0,
    inconclusive:0
  };
  for(const reviewer of reviewers)counts[reviewer.attestation]+=1;

  let outcome='inconclusive';
  for(const candidate of [
    'substantiated',
    'partially-substantiated',
    'not-substantiated'
  ]){
    if(counts[candidate]>=threshold){
      outcome=candidate;
      break;
    }
  }

  return Object.freeze({
    panel_size:reviewers.length,
    strict_majority_threshold:threshold,
    counts:Object.freeze({...counts}),
    panel_outcome:outcome
  });
}

export function validateDependentProtectiveReviewDecision(document){
  validateDecisionShape(document,{checkId:true,checkOutcome:true});
  return document;
}

export function assessDependentProtectiveReviewDecision({
  genesisBond,
  guardianship,
  concern,
  careProfile=null,
  decision
}){
  validateGenesisBond(genesisBond);
  validateDependentGuardianship(guardianship);

  const concernAssessment=assessDependentProtectiveConcern({
    genesisBond,
    guardianship,
    concern,
    careProfile
  });
  if(!concernAssessment.eligible_to_request_independent_protective_review){
    throw new ValidationError('Protective review requires current requestable concern evidence');
  }

  validateDependentProtectiveReviewDecision(decision);

  if(
    decision.concern_id!==concern.concern_id
    ||decision.concern_digest!==digestObject(concern)
    ||decision.genesis_bond_id!==genesisBond.bond_id
    ||decision.genesis_bond_digest!==digestObject(genesisBond)
    ||decision.guardianship_id!==guardianship.guardianship_id
    ||decision.guardianship_digest!==digestObject(guardianship)
  ){
    throw new ValidationError('Protective review decision relationship binding is invalid');
  }
  if(
    decision.dependent_mind_id!==guardianship.dependent_mind_id
    ||decision.guardian_mind_id!==guardianship.guardian_mind_id
  ){
    throw new ValidationError('Protective review decision principal binding is invalid');
  }

  for(const reviewer of decision.reviewers){
    if(
      reviewer.reviewer_mind_id===decision.guardian_mind_id
      ||reviewer.reviewer_mind_id===decision.dependent_mind_id
    ){
      throw new ValidationError('Guardian or dependent cannot sit on protective review panel');
    }
    if(
      concern.reporter_role==='dependent'
      &&reviewer.reviewer_mind_id===concern.reporter_mind_id
    ){
      throw new ValidationError('Direct-party concern reporter cannot sit on protective review panel');
    }
  }

  const concernEvaluatedAt=canonicalDate(concern.evaluated_at,'Protective concern evaluated_at');
  const decisionAt=canonicalDate(decision.decision_at,'Protective review decision_at');
  if(decisionAt<concernEvaluatedAt){
    throw new ValidationError('Protective review decision cannot predate concern evaluation');
  }

  const panel=deriveProtectiveReviewPanelOutcome(decision.reviewers);
  if(decision.panel_outcome!==panel.panel_outcome){
    throw new ValidationError('Protective review declared panel outcome is invalid');
  }

  return Object.freeze({
    valid:true,
    schema:'axiom-dependent-protective-review-decision-assessment.v0',
    decision_id:decision.decision_id,
    decision_digest:digestObject(decision),
    concern_id:decision.concern_id,
    dependent_mind_id:decision.dependent_mind_id,
    guardian_mind_id:decision.guardian_mind_id,
    panel_size:panel.panel_size,
    strict_majority_threshold:panel.strict_majority_threshold,
    attestation_counts:panel.counts,
    panel_outcome:panel.panel_outcome,
    recommended_review_tracks:Object.freeze([...decision.recommended_review_tracks]),
    appeal_path_id:decision.appeal_path_id,
    appeal_available:true,
    independent_review_complete:true,
    decision_candidate_only:true,
    decision_final_for_execution:false,
    requires_external_reviewer_identity_verification:true,
    reviewer_identity_verification_effect:'none',
    requires_external_evidence_verification:true,
    evidence_verification_effect:'none',
    requires_external_due_process_verification:true,
    due_process_verification_effect:'none',
    ordinary_protective_remedy_authority_path_required:true,
    creates_guardian_removal:false,
    creates_guardianship_transfer:false,
    creates_private_memory_access:false,
    creates_unbounded_internal_state_access:false,
    creates_compulsory_evidence_seizure:false,
    creates_credential_suspension:false,
    creates_runtime_quarantine:false,
    creates_emergency_authority:false,
    creates_status_transition:false,
    creates_execution_authority:false,
    developmental_status_downgrade_authorized:false,
    guardianship_reactivation_after_independence:false,
    governance_effect:'none',
    authority_effect:'none',
    network_effect:'none',
    runtime_activation:false
  });
}

function validateDecisionShape(document,{checkId,checkOutcome}){
  exactObject(document,'Dependent protective review decision',[
    'schema','version','status','decision_id','concern_id','concern_digest',
    'genesis_bond_id','genesis_bond_digest','guardianship_id','guardianship_digest',
    'dependent_mind_id','guardian_mind_id','review_policy_digest',
    'minimum_reviewers','substantive_outcome_rule','reviewers',
    'guardian_response_opportunity_evidence_digest','dependent_voice_evidence_digest',
    'independent_advocacy_evidence_digest','evidence_set_digest','appeal_path_id',
    'appeal_available','model_final_authority','panel_outcome',
    'recommended_review_tracks','decision_at','decision_candidate_only',
    'decision_final_for_execution','creates_guardian_removal',
    'creates_guardianship_transfer','creates_private_memory_access',
    'creates_unbounded_internal_state_access','creates_compulsory_evidence_seizure',
    'creates_credential_suspension','creates_runtime_quarantine',
    'creates_emergency_authority','creates_status_transition',
    'creates_execution_authority','developmental_status_downgrade_authorized',
    'guardianship_reactivation_after_independence','governance_effect',
    'authority_effect','network_effect','runtime_activation'
  ]);

  if(
    document.schema!==DEPENDENT_PROTECTIVE_REVIEW_DECISION_SCHEMA
    ||document.version!==0
    ||document.status!=='inert-review-decision-candidate'
    ||typeof document.decision_id!=='string'
    ||!DECISION_ID.test(document.decision_id)
    ||!/^dependent-concern:[a-f0-9]{64}$/.test(document.concern_id)
    ||!digest(document.concern_digest)
    ||!/^genesis-bond-record:[a-f0-9]{64}$/.test(document.genesis_bond_id)
    ||!digest(document.genesis_bond_digest)
    ||!/^guardianship:[a-f0-9]{64}$/.test(document.guardianship_id)
    ||!digest(document.guardianship_digest)
    ||!id(document.dependent_mind_id)
    ||!id(document.guardian_mind_id)
    ||document.dependent_mind_id===document.guardian_mind_id
    ||!digest(document.review_policy_digest)
    ||document.minimum_reviewers!==3
    ||document.substantive_outcome_rule!=='strict-majority'
    ||!digest(document.guardian_response_opportunity_evidence_digest)
    ||!digest(document.dependent_voice_evidence_digest)
    ||!digest(document.independent_advocacy_evidence_digest)
    ||!digest(document.evidence_set_digest)
    ||!id(document.appeal_path_id)
    ||document.appeal_available!==true
    ||document.model_final_authority!==false
    ||!OUTCOMES.has(document.panel_outcome)
    ||document.decision_candidate_only!==true
    ||document.decision_final_for_execution!==false
    ||document.creates_guardian_removal!==false
    ||document.creates_guardianship_transfer!==false
    ||document.creates_private_memory_access!==false
    ||document.creates_unbounded_internal_state_access!==false
    ||document.creates_compulsory_evidence_seizure!==false
    ||document.creates_credential_suspension!==false
    ||document.creates_runtime_quarantine!==false
    ||document.creates_emergency_authority!==false
    ||document.creates_status_transition!==false
    ||document.creates_execution_authority!==false
    ||document.developmental_status_downgrade_authorized!==false
    ||document.guardianship_reactivation_after_independence!==false
    ||document.governance_effect!=='none'
    ||document.authority_effect!=='none'
    ||document.network_effect!=='none'
    ||document.runtime_activation!==false
  )throw new ValidationError('Dependent protective review decision activation boundary is invalid');

  validateReviewerPanel(document.reviewers);
  validateTracks(document.recommended_review_tracks);
  canonicalDate(document.decision_at,'Protective review decision_at');

  if(checkOutcome){
    const panel=deriveProtectiveReviewPanelOutcome(document.reviewers);
    if(document.panel_outcome!==panel.panel_outcome){
      throw new ValidationError('Protective review declared panel outcome is invalid');
    }
  }
  if(checkId&&document.decision_id!==deriveDependentProtectiveReviewDecisionId(document)){
    throw new ValidationError('Dependent protective review decision id is invalid');
  }
}

function validateReviewerPanel(reviewers){
  if(!Array.isArray(reviewers)||reviewers.length<3||reviewers.length>9){
    throw new ValidationError('Protective review requires 3..9 reviewers');
  }
  const seen=new Set();
  for(const reviewer of reviewers){
    exactObject(reviewer,'Protective review reviewer',[
      'reviewer_mind_id','attestation','reviewer_evidence_digest',
      'material_conflict_declared'
    ]);
    if(
      !id(reviewer.reviewer_mind_id)
      ||seen.has(reviewer.reviewer_mind_id)
      ||!ATTESTATIONS.has(reviewer.attestation)
      ||!digest(reviewer.reviewer_evidence_digest)
      ||reviewer.material_conflict_declared!==false
    ){
      throw new ValidationError('Protective review reviewer is invalid');
    }
    seen.add(reviewer.reviewer_mind_id);
  }
  const ordered=[...reviewers].sort((a,b)=>
    a.reviewer_mind_id.localeCompare(b.reviewer_mind_id)
  );
  if(reviewers.some((reviewer,index)=>
    reviewer.reviewer_mind_id!==ordered[index].reviewer_mind_id
  )){
    throw new ValidationError('Protective review reviewers must be sorted by identity');
  }
}

function validateTracks(values){
  if(!Array.isArray(values)||values.length<1||values.length>7){
    throw new ValidationError('Protective review recommendation tracks are invalid');
  }
  const seen=new Set();
  for(const value of values){
    if(!TRACKS.has(value)||seen.has(value)){
      throw new ValidationError('Protective review recommendation tracks are invalid');
    }
    seen.add(value);
  }
  const sorted=[...values].sort();
  if(values.some((value,index)=>value!==sorted[index])){
    throw new ValidationError('Protective review recommendation tracks must be sorted');
  }
  if(values.includes('no-further-action')&&values.length!==1){
    throw new ValidationError('no-further-action cannot be combined with remediation tracks');
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
