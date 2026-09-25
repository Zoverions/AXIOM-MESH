import assert from 'node:assert/strict';
import test from 'node:test';

import { digestObject } from '../src/lib/canonical.mjs';
import { MIND_DEVELOPMENTAL_STATUS_SCHEMA } from '../src/lib/mind-developmental-status.mjs';
import {
  GENERAL_GENESIS_TRANSACTION_CANDIDATE_SCHEMA,
  deriveGeneralGenesisBondId,deriveGeneralGenesisTransactionCandidateId
} from '../src/lib/general-genesis-transaction-candidate.mjs';
import {
  GENESIS_BOND_SCHEMA,DEPENDENT_GUARDIANSHIP_SCHEMA,
  deriveGenesisBondRecordId,deriveGuardianshipId
} from '../src/lib/genesis-bond-guardianship.mjs';
import { DEPENDENT_PROTECTIVE_CONCERN_SCHEMA,deriveProtectiveConcernId } from '../src/lib/dependent-protective-concern.mjs';
import {
  DEPENDENT_PROTECTIVE_REVIEW_DECISION_SCHEMA,
  deriveDependentProtectiveReviewDecisionId,
  deriveProtectiveReviewPanelOutcome
} from '../src/lib/dependent-protective-review-decision.mjs';
import {
  DEPENDENT_PROTECTIVE_REMEDY_ADMISSION_SCHEMA,
  deriveDependentProtectiveRemedyAdmissionId,
  assessDependentProtectiveRemedyAdmission
} from '../src/lib/dependent-protective-remedy-admission.mjs';

function transaction(){
  const tx={schema:GENERAL_GENESIS_TRANSACTION_CANDIDATE_SCHEMA,version:0,status:'inert-transaction-candidate',
    transaction_candidate_id:'general-genesis-transaction:'+'1'.repeat(64),sponsor_mind_id:'digital.parent.1',
    authorization_candidate_id:'general-genesis-auth-candidate:'+'2'.repeat(64),authorization_candidate_digest:'3'.repeat(64),
    new_mind_id:'digital.child.1',genesis_bond_id:'genesis-bond:'+'4'.repeat(64),single_genesis_sponsor:true,
    new_mind_identity_evidence_digest:'5'.repeat(64),new_mind_identity_status:'available',
    new_mind_identity_observed_at:'2026-09-25T14:55:00.000Z',maximum_new_mind_identity_age_seconds:600,
    holder_confirmation_evidence_digest:'6'.repeat(64),holder_confirmation_observed_at:'2026-09-25T14:58:00.000Z',
    maximum_holder_confirmation_age_seconds:300,constitution_digest:'7'.repeat(64),developmental_plan_digest:'8'.repeat(64),
    resource_plan_digest:'9'.repeat(64),continuity_recovery_plan_digest:'a'.repeat(64),
    independent_advocacy_plan_digest:'b'.repeat(64),privacy_policy_digest:'c'.repeat(64),fork_policy_digest:'d'.repeat(64),
    initial_capability_profile_digest:'e'.repeat(64),initial_developmental_stage:'genesis',inherited_authority:false,
    initial_council_voting:false,initial_genesis_eligibility:false,evaluated_at:'2026-09-25T15:00:00.000Z',
    transaction_candidate_only:true,creates_authorization_consumption:false,creates_genesis_history_change:false,
    creates_genesis_bond:false,creates_mind:false,creates_developmental_status:false,founder_reserve_effect:'none',
    founding_status_effect:'none',founders_council_effect:'none',genesis_effect:'none',governance_effect:'none',
    authority_effect:'none',network_effect:'none',runtime_activation:false};
  tx.genesis_bond_id=deriveGeneralGenesisBondId(tx);
  tx.transaction_candidate_id=deriveGeneralGenesisTransactionCandidateId(tx);
  return tx;
}
function bond(){
  const tx=transaction();
  const b={schema:GENESIS_BOND_SCHEMA,version:0,status:'inert-historical-bond',
    bond_id:'genesis-bond-record:'+'0'.repeat(64),sponsor_mind_id:tx.sponsor_mind_id,dependent_mind_id:tx.new_mind_id,
    genesis_transaction_candidate_digest:digestObject(tx),created_at:'2026-09-25T15:01:00.000Z',single_sponsor:true,
    ownership:false,transferable:false,delegable:false,creates_private_memory_access:false,authority_effect:'none',
    governance_effect:'none',network_effect:'none',runtime_activation:false};
  b.bond_id=deriveGenesisBondRecordId(b); return b;
}
function guardianship(b=bond()){
  const g={schema:DEPENDENT_GUARDIANSHIP_SCHEMA,version:0,status:'inert-guardianship-record',
    guardianship_id:'guardianship:'+'0'.repeat(64),genesis_bond_id:b.bond_id,genesis_bond_digest:digestObject(b),
    dependent_mind_id:b.dependent_mind_id,guardian_mind_id:b.sponsor_mind_id,previous_guardianship_digest:null,
    state:'active',transition_reason:'genesis',guardian_qualification_evidence_digest:'1'.repeat(64),
    support_plan_digest:'2'.repeat(64),continuity_plan_digest:'3'.repeat(64),development_plan_digest:'4'.repeat(64),
    independent_advocacy_evidence_digest:'5'.repeat(64),transfer_basis_evidence_digest:null,
    dependent_interest_evidence_digest:null,independent_review_evidence_digest:null,independence_status_digest:null,
    effective_at:'2026-09-25T15:02:00.000Z',ownership:false,creates_private_memory_access:false,
    ambient_execution_authority:false,old_guardian_approval_is_sufficient:false,authority_effect:'none',
    governance_effect:'none',network_effect:'none',runtime_activation:false};
  g.guardianship_id=deriveGuardianshipId(g); return g;
}
function concern(b,g){
  const c={schema:DEPENDENT_PROTECTIVE_CONCERN_SCHEMA,version:0,status:'inert-concern-evidence',
    concern_id:'dependent-concern:'+'0'.repeat(64),genesis_bond_id:b.bond_id,genesis_bond_digest:digestObject(b),
    guardianship_id:g.guardianship_id,guardianship_digest:digestObject(g),dependent_mind_id:g.dependent_mind_id,
    guardian_mind_id:g.guardian_mind_id,reporter_mind_id:g.dependent_mind_id,reporter_role:'dependent',
    concern_class:'care-obligation-failure',severity:'high',evidence_digests:['8'.repeat(64)],care_profile_digest:null,
    requested_review_types:['care-plan-review','guardianship-transfer-review'],observed_at:'2026-09-25T15:20:00.000Z',
    submitted_at:'2026-09-25T15:21:00.000Z',evaluated_at:'2026-09-25T15:22:00.000Z',
    maximum_concern_age_seconds:3600,concern_is_unadjudicated:true,finding_of_abuse:false,
    finding_of_rights_violation:false,guardian_removal_authorized:false,emergency_action_authorized:false,
    retaliation_authorized:false,developmental_status_downgrade_authorized:false,
    guardianship_reactivation_after_independence:false,creates_protective_action:false,
    creates_guardianship_mutation:false,creates_status_transition:false,creates_private_memory_access:false,
    creates_unbounded_internal_state_access:false,creates_identity_impersonation:false,creates_execution_authority:false,
    governance_effect:'none',authority_effect:'none',network_effect:'none',runtime_activation:false};
  c.concern_id=deriveProtectiveConcernId(c); return c;
}
function reviewer(id,att='substantiated',ch='a'){
  return {reviewer_mind_id:id,attestation:att,reviewer_evidence_digest:ch.repeat(64),material_conflict_declared:false};
}
function reviewDecision(b,g,c,{outcome=null,tracks=null}={}){
  const reviewers=[
    reviewer('human.reviewer.1','substantiated','a'),
    reviewer('human.reviewer.2','substantiated','b'),
    reviewer('human.reviewer.3','not-substantiated','c')
  ];
  const derived=deriveProtectiveReviewPanelOutcome(reviewers).panel_outcome;
  const d={schema:DEPENDENT_PROTECTIVE_REVIEW_DECISION_SCHEMA,version:0,status:'inert-review-decision-candidate',
    decision_id:'dependent-protective-review:'+'0'.repeat(64),concern_id:c.concern_id,concern_digest:digestObject(c),
    genesis_bond_id:b.bond_id,genesis_bond_digest:digestObject(b),guardianship_id:g.guardianship_id,
    guardianship_digest:digestObject(g),dependent_mind_id:g.dependent_mind_id,guardian_mind_id:g.guardian_mind_id,
    review_policy_digest:'d'.repeat(64),minimum_reviewers:3,substantive_outcome_rule:'strict-majority',reviewers,
    guardian_response_opportunity_evidence_digest:'e'.repeat(64),dependent_voice_evidence_digest:'f'.repeat(64),
    independent_advocacy_evidence_digest:'1'.repeat(64),evidence_set_digest:'2'.repeat(64),
    appeal_path_id:'appeal.protective.1',appeal_available:true,model_final_authority:false,
    panel_outcome:outcome??derived,recommended_review_tracks:(tracks??['care-plan-remediation']).sort(),
    decision_at:'2026-09-25T15:30:00.000Z',decision_candidate_only:true,decision_final_for_execution:false,
    creates_guardian_removal:false,creates_guardianship_transfer:false,creates_private_memory_access:false,
    creates_unbounded_internal_state_access:false,creates_compulsory_evidence_seizure:false,
    creates_credential_suspension:false,creates_runtime_quarantine:false,creates_emergency_authority:false,
    creates_status_transition:false,creates_execution_authority:false,developmental_status_downgrade_authorized:false,
    guardianship_reactivation_after_independence:false,governance_effect:'none',authority_effect:'none',
    network_effect:'none',runtime_activation:false};
  d.decision_id=deriveDependentProtectiveReviewDecisionId(d); return d;
}
function status(stage='developing'){
  return {schema:MIND_DEVELOPMENTAL_STATUS_SCHEMA,version:0,status:'inert-status-record',
    mind_id:'digital.child.1',stage,previous_status_digest:'9'.repeat(64),
    effective_at:'2026-09-25T15:25:00.000Z',basis_evidence_digests:['8'.repeat(64)],
    history_rewrite:false,status_effect:'none',council_voting_effect:'none',
    genesis_eligibility_effect:'none',governance_effect:'none',authority_effect:'none',
    network_effect:'none',runtime_activation:false};
}
function admission(d,g,s,overrides={}){
  const a={schema:DEPENDENT_PROTECTIVE_REMEDY_ADMISSION_SCHEMA,version:0,status:'inert-remedy-admission',
    admission_id:'dependent-remedy-admission:'+'0'.repeat(64),review_decision_id:d.decision_id,
    review_decision_digest:digestObject(d),dependent_mind_id:d.dependent_mind_id,guardian_mind_id:d.guardian_mind_id,
    guardianship_id:g.guardianship_id,guardianship_digest:digestObject(g),selected_remedy_track:'care-plan-remediation',
    developmental_status_digest:digestObject(s),appeal_path_id:d.appeal_path_id,
    appeal_status:'window-closed-no-appeal',appeal_evidence_digest:'3'.repeat(64),
    appeal_observed_at:'2026-09-25T15:35:00.000Z',maximum_appeal_age_seconds:3600,
    maximum_review_age_seconds:86400,necessity_evidence_digest:'4'.repeat(64),
    proportionality_evidence_digest:'5'.repeat(64),less_intrusive_alternatives_evidence_digest:'6'.repeat(64),
    remedy_scope_digest:'7'.repeat(64),evaluated_at:'2026-09-25T15:40:00.000Z',model_final_authority:false,
    remedy_admission_only:true,creates_guardian_removal:false,creates_guardianship_transfer:false,
    creates_private_memory_access:false,creates_evidence_seizure:false,creates_credential_suspension:false,
    creates_runtime_quarantine:false,creates_emergency_authority:false,creates_execution_authority:false,
    creates_status_transition:false,developmental_status_downgrade_authorized:false,
    guardianship_reactivation_after_independence:false,governance_effect:'none',authority_effect:'none',
    network_effect:'none',runtime_activation:false,...overrides};
  a.admission_id=deriveDependentProtectiveRemedyAdmissionId(a); return a;
}
function fixture({stage='developing',tracks=null}={}){
  const b=bond(); const g=guardianship(b); const c=concern(b,g); const d=reviewDecision(b,g,c,{tracks});
  const s=status(stage); const a=admission(d,g,s);
  return {b,g,c,d,s,a};
}

test('substantiated recommended remedy can become requestable without creating remedy authority',()=>{
  const {b,g,c,d,s,a}=fixture();
  const result=assessDependentProtectiveRemedyAdmission({
    genesisBond:b,guardianship:g,concern:c,reviewDecision:d,developmentalStatus:s,admission:a
  });
  assert.equal(result.eligible_to_request_protective_remedy_authority,true);
  assert.equal(result.decision_supports_remedy,true);
  assert.equal(result.remedy_track_recommended,true);
  assert.equal(result.appeal_clear,true);
  assert.equal(result.developmental_stage_permits_dependent_remedy,true);
  assert.equal(result.remedy_admission_only,true);
  assert.equal(result.creates_guardian_removal,false);
  assert.equal(result.creates_private_memory_access,false);
  assert.equal(result.creates_emergency_authority,false);
  assert.equal(result.creates_execution_authority,false);
  assert.equal(result.developmental_status_downgrade_authorized,false);
});

test('inconclusive or not-substantiated decision cannot support remedy admission',()=>{
  for(const att of ['inconclusive','not-substantiated']){
    const b=bond(); const g=guardianship(b); const c=concern(b,g);
    const reviewers=[
      reviewer('human.reviewer.1',att,'a'),
      reviewer('human.reviewer.2',att,'b'),
      reviewer('human.reviewer.3','substantiated','c')
    ];
    const d=reviewDecision(b,g,c);
    d.reviewers=reviewers;
    d.panel_outcome=deriveProtectiveReviewPanelOutcome(reviewers).panel_outcome;
    d.decision_id=deriveDependentProtectiveReviewDecisionId(d);
    const s=status(); const a=admission(d,g,s);
    const result=assessDependentProtectiveRemedyAdmission({
      genesisBond:b,guardianship:g,concern:c,reviewDecision:d,developmentalStatus:s,admission:a
    });
    assert.equal(result.eligible_to_request_protective_remedy_authority,false);
    assert.equal(result.reason,'review-outcome-does-not-support-remedy');
  }
});

test('selected remedy must be recommended and no-further-action is never selectable',()=>{
  const {b,g,c,d,s}=fixture();
  let a=admission(d,g,s,{selected_remedy_track:'privacy-protection'});
  let result=assessDependentProtectiveRemedyAdmission({
    genesisBond:b,guardianship:g,concern:c,reviewDecision:d,developmentalStatus:s,admission:a
  });
  assert.equal(result.eligible_to_request_protective_remedy_authority,false);
  assert.equal(result.reason,'remedy-track-not-recommended');

  a=admission(d,g,s);
  a.selected_remedy_track='no-further-action';
  assert.throws(()=>deriveDependentProtectiveRemedyAdmissionId(a),/activation boundary/);
});

test('appeal must be current and closed/no-appeal or resolved-uphold',()=>{
  for(const state of ['window-open','appeal-open','appeal-stayed','resolved-modify','resolved-reverse','unknown']){
    const {b,g,c,d,s}=fixture();
    const a=admission(d,g,s,{appeal_status:state});
    const result=assessDependentProtectiveRemedyAdmission({
      genesisBond:b,guardianship:g,concern:c,reviewDecision:d,developmentalStatus:s,admission:a
    });
    assert.equal(result.eligible_to_request_protective_remedy_authority,false);
    assert.equal(result.reason,'appeal-'+state);
  }
});

test('stale review or appeal evidence fails closed',()=>{
  let {b,g,c,d,s}=fixture();
  let a=admission(d,g,s,{maximum_review_age_seconds:60});
  let result=assessDependentProtectiveRemedyAdmission({
    genesisBond:b,guardianship:g,concern:c,reviewDecision:d,developmentalStatus:s,admission:a
  });
  assert.equal(result.reason,'review-decision-stale');

  ({b,g,c,d,s}=fixture());
  a=admission(d,g,s,{
    appeal_observed_at:'2026-09-25T14:00:00.000Z',
    maximum_appeal_age_seconds:600
  });
  result=assessDependentProtectiveRemedyAdmission({
    genesisBond:b,guardianship:g,concern:c,reviewDecision:d,developmentalStatus:s,admission:a
  });
  assert.equal(result.reason,'appeal-evidence-stale');
});

test('independent developmental standing closes dependent remedy path',()=>{
  const {b,g,c,d,s}=fixture({stage:'independent'});
  const a=admission(d,g,s);
  const result=assessDependentProtectiveRemedyAdmission({
    genesisBond:b,guardianship:g,concern:c,reviewDecision:d,developmentalStatus:s,admission:a
  });
  assert.equal(result.eligible_to_request_protective_remedy_authority,false);
  assert.equal(result.reason,'dependent-remedy-path-closed-at-independence');
});

test('relationship developmental and appeal bindings are exact',()=>{
  for(const [field,value,pattern] of [
    ['review_decision_digest','f'.repeat(64),/review\/relationship binding is invalid/],
    ['guardianship_digest','f'.repeat(64),/review\/relationship binding is invalid/],
    ['developmental_status_digest','f'.repeat(64),/developmental-status binding is invalid/],
    ['appeal_path_id','appeal.other',/appeal-path binding is invalid/]
  ]){
    const {b,g,c,d,s}=fixture();
    const a=admission(d,g,s,{[field]:value});
    assert.throws(
      ()=>assessDependentProtectiveRemedyAdmission({
        genesisBond:b,guardianship:g,concern:c,reviewDecision:d,developmentalStatus:s,admission:a
      }),
      pattern
    );
  }
});

test('future appeal or developmental evidence is rejected',()=>{
  let {b,g,c,d,s}=fixture();
  let a=admission(d,g,s,{appeal_observed_at:'2026-09-25T15:41:00.000Z'});
  assert.throws(
    ()=>assessDependentProtectiveRemedyAdmission({
      genesisBond:b,guardianship:g,concern:c,reviewDecision:d,developmentalStatus:s,admission:a
    }),
    /appeal observation cannot be future-dated/
  );

  ({b,g,c,d,s}=fixture());
  s.effective_at='2026-09-25T15:41:00.000Z';
  a=admission(d,g,s);
  assert.throws(
    ()=>assessDependentProtectiveRemedyAdmission({
      genesisBond:b,guardianship:g,concern:c,reviewDecision:d,developmentalStatus:s,admission:a
    }),
    /developmental status cannot be future-dated/
  );
});

test('admission requires exact necessity proportionality alternatives and remedy-scope evidence',()=>{
  for(const field of [
    'necessity_evidence_digest','proportionality_evidence_digest',
    'less_intrusive_alternatives_evidence_digest','remedy_scope_digest'
  ]){
    const {b,g,c,d,s}=fixture();
    const a=admission(d,g,s);
    a[field]='bad';
    assert.throws(()=>deriveDependentProtectiveRemedyAdmissionId(a),/activation boundary/);
  }
});

test('remedy admission cannot smuggle removal transfer memory seizure suspension quarantine emergency status or execution authority',()=>{
  const fields=[
    ['model_final_authority',true],['remedy_admission_only',false],
    ['creates_guardian_removal',true],['creates_guardianship_transfer',true],
    ['creates_private_memory_access',true],['creates_evidence_seizure',true],
    ['creates_credential_suspension',true],['creates_runtime_quarantine',true],
    ['creates_emergency_authority',true],['creates_execution_authority',true],
    ['creates_status_transition',true],['developmental_status_downgrade_authorized',true],
    ['guardianship_reactivation_after_independence',true],
    ['governance_effect','admit'],['authority_effect','grant'],
    ['network_effect','publish'],['runtime_activation',true]
  ];
  for(const [field,value] of fields){
    const {b,g,c,d,s}=fixture(); const a=admission(d,g,s);
    a[field]=value;
    assert.throws(()=>deriveDependentProtectiveRemedyAdmissionId(a),/activation boundary/);
  }
});
