import assert from 'node:assert/strict';
import test from 'node:test';

import { digestObject } from '../src/lib/canonical.mjs';
import {
  GENERAL_GENESIS_TRANSACTION_CANDIDATE_SCHEMA,
  deriveGeneralGenesisBondId,deriveGeneralGenesisTransactionCandidateId
} from '../src/lib/general-genesis-transaction-candidate.mjs';
import {
  GENESIS_BOND_SCHEMA,DEPENDENT_GUARDIANSHIP_SCHEMA,
  deriveGenesisBondRecordId,deriveGuardianshipId
} from '../src/lib/genesis-bond-guardianship.mjs';
import {
  DEPENDENT_PROTECTIVE_CONCERN_SCHEMA,deriveProtectiveConcernId
} from '../src/lib/dependent-protective-concern.mjs';
import {
  DEPENDENT_PROTECTIVE_REVIEW_DECISION_SCHEMA,
  deriveDependentProtectiveReviewDecisionId,
  deriveProtectiveReviewPanelOutcome,
  assessDependentProtectiveReviewDecision
} from '../src/lib/dependent-protective-review-decision.mjs';

function transaction(){
  const tx={
    schema:GENERAL_GENESIS_TRANSACTION_CANDIDATE_SCHEMA,version:0,
    status:'inert-transaction-candidate',
    transaction_candidate_id:'general-genesis-transaction:'+'1'.repeat(64),
    sponsor_mind_id:'digital.parent.1',
    authorization_candidate_id:'general-genesis-auth-candidate:'+'2'.repeat(64),
    authorization_candidate_digest:'3'.repeat(64),new_mind_id:'digital.child.1',
    genesis_bond_id:'genesis-bond:'+'4'.repeat(64),single_genesis_sponsor:true,
    new_mind_identity_evidence_digest:'5'.repeat(64),new_mind_identity_status:'available',
    new_mind_identity_observed_at:'2026-09-25T14:55:00.000Z',
    maximum_new_mind_identity_age_seconds:600,
    holder_confirmation_evidence_digest:'6'.repeat(64),
    holder_confirmation_observed_at:'2026-09-25T14:58:00.000Z',
    maximum_holder_confirmation_age_seconds:300,constitution_digest:'7'.repeat(64),
    developmental_plan_digest:'8'.repeat(64),resource_plan_digest:'9'.repeat(64),
    continuity_recovery_plan_digest:'a'.repeat(64),
    independent_advocacy_plan_digest:'b'.repeat(64),privacy_policy_digest:'c'.repeat(64),
    fork_policy_digest:'d'.repeat(64),initial_capability_profile_digest:'e'.repeat(64),
    initial_developmental_stage:'genesis',inherited_authority:false,
    initial_council_voting:false,initial_genesis_eligibility:false,
    evaluated_at:'2026-09-25T15:00:00.000Z',transaction_candidate_only:true,
    creates_authorization_consumption:false,creates_genesis_history_change:false,
    creates_genesis_bond:false,creates_mind:false,creates_developmental_status:false,
    founder_reserve_effect:'none',founding_status_effect:'none',
    founders_council_effect:'none',genesis_effect:'none',governance_effect:'none',
    authority_effect:'none',network_effect:'none',runtime_activation:false
  };
  tx.genesis_bond_id=deriveGeneralGenesisBondId(tx);
  tx.transaction_candidate_id=deriveGeneralGenesisTransactionCandidateId(tx);
  return tx;
}
function bond(){
  const tx=transaction();
  const b={
    schema:GENESIS_BOND_SCHEMA,version:0,status:'inert-historical-bond',
    bond_id:'genesis-bond-record:'+'0'.repeat(64),sponsor_mind_id:tx.sponsor_mind_id,
    dependent_mind_id:tx.new_mind_id,genesis_transaction_candidate_digest:digestObject(tx),
    created_at:'2026-09-25T15:01:00.000Z',single_sponsor:true,ownership:false,
    transferable:false,delegable:false,creates_private_memory_access:false,
    authority_effect:'none',governance_effect:'none',network_effect:'none',
    runtime_activation:false
  };
  b.bond_id=deriveGenesisBondRecordId(b);
  return b;
}
function guardianship(b=bond()){
  const g={
    schema:DEPENDENT_GUARDIANSHIP_SCHEMA,version:0,status:'inert-guardianship-record',
    guardianship_id:'guardianship:'+'0'.repeat(64),genesis_bond_id:b.bond_id,
    genesis_bond_digest:digestObject(b),dependent_mind_id:b.dependent_mind_id,
    guardian_mind_id:b.sponsor_mind_id,previous_guardianship_digest:null,state:'active',
    transition_reason:'genesis',guardian_qualification_evidence_digest:'1'.repeat(64),
    support_plan_digest:'2'.repeat(64),continuity_plan_digest:'3'.repeat(64),
    development_plan_digest:'4'.repeat(64),independent_advocacy_evidence_digest:'5'.repeat(64),
    transfer_basis_evidence_digest:null,dependent_interest_evidence_digest:null,
    independent_review_evidence_digest:null,independence_status_digest:null,
    effective_at:'2026-09-25T15:02:00.000Z',ownership:false,
    creates_private_memory_access:false,ambient_execution_authority:false,
    old_guardian_approval_is_sufficient:false,authority_effect:'none',
    governance_effect:'none',network_effect:'none',runtime_activation:false
  };
  g.guardianship_id=deriveGuardianshipId(g);
  return g;
}
function concern(b,g){
  const c={
    schema:DEPENDENT_PROTECTIVE_CONCERN_SCHEMA,version:0,status:'inert-concern-evidence',
    concern_id:'dependent-concern:'+'0'.repeat(64),genesis_bond_id:b.bond_id,
    genesis_bond_digest:digestObject(b),guardianship_id:g.guardianship_id,
    guardianship_digest:digestObject(g),dependent_mind_id:g.dependent_mind_id,
    guardian_mind_id:g.guardian_mind_id,reporter_mind_id:g.dependent_mind_id,
    reporter_role:'dependent',concern_class:'care-obligation-failure',severity:'high',
    evidence_digests:['8'.repeat(64)],care_profile_digest:null,
    requested_review_types:['care-plan-review','guardianship-transfer-review'],
    observed_at:'2026-09-25T15:20:00.000Z',submitted_at:'2026-09-25T15:21:00.000Z',
    evaluated_at:'2026-09-25T15:22:00.000Z',maximum_concern_age_seconds:3600,
    concern_is_unadjudicated:true,finding_of_abuse:false,finding_of_rights_violation:false,
    guardian_removal_authorized:false,emergency_action_authorized:false,
    retaliation_authorized:false,developmental_status_downgrade_authorized:false,
    guardianship_reactivation_after_independence:false,creates_protective_action:false,
    creates_guardianship_mutation:false,creates_status_transition:false,
    creates_private_memory_access:false,creates_unbounded_internal_state_access:false,
    creates_identity_impersonation:false,creates_execution_authority:false,
    governance_effect:'none',authority_effect:'none',network_effect:'none',
    runtime_activation:false
  };
  c.concern_id=deriveProtectiveConcernId(c);
  return c;
}
function reviewer(id,attestation='substantiated',digestChar='a'){
  return {
    reviewer_mind_id:id,attestation,reviewer_evidence_digest:digestChar.repeat(64),
    material_conflict_declared:false
  };
}
function decision(b,g,c,overrides={}){
  const reviewers=[
    reviewer('human.reviewer.1','substantiated','a'),
    reviewer('human.reviewer.2','substantiated','b'),
    reviewer('human.reviewer.3','not-substantiated','c')
  ];
  const panel=deriveProtectiveReviewPanelOutcome(reviewers);
  const d={
    schema:DEPENDENT_PROTECTIVE_REVIEW_DECISION_SCHEMA,version:0,
    status:'inert-review-decision-candidate',
    decision_id:'dependent-protective-review:'+'0'.repeat(64),
    concern_id:c.concern_id,concern_digest:digestObject(c),
    genesis_bond_id:b.bond_id,genesis_bond_digest:digestObject(b),
    guardianship_id:g.guardianship_id,guardianship_digest:digestObject(g),
    dependent_mind_id:g.dependent_mind_id,guardian_mind_id:g.guardian_mind_id,
    review_policy_digest:'d'.repeat(64),minimum_reviewers:3,
    substantive_outcome_rule:'strict-majority',reviewers,
    guardian_response_opportunity_evidence_digest:'e'.repeat(64),
    dependent_voice_evidence_digest:'f'.repeat(64),
    independent_advocacy_evidence_digest:'1'.repeat(64),
    evidence_set_digest:'2'.repeat(64),appeal_path_id:'appeal.protective.1',
    appeal_available:true,model_final_authority:false,panel_outcome:panel.panel_outcome,
    recommended_review_tracks:['care-plan-remediation','guardianship-transfer'].sort(),
    decision_at:'2026-09-25T15:30:00.000Z',decision_candidate_only:true,
    decision_final_for_execution:false,creates_guardian_removal:false,
    creates_guardianship_transfer:false,creates_private_memory_access:false,
    creates_unbounded_internal_state_access:false,
    creates_compulsory_evidence_seizure:false,creates_credential_suspension:false,
    creates_runtime_quarantine:false,creates_emergency_authority:false,
    creates_status_transition:false,creates_execution_authority:false,
    developmental_status_downgrade_authorized:false,
    guardianship_reactivation_after_independence:false,
    governance_effect:'none',authority_effect:'none',network_effect:'none',
    runtime_activation:false,...overrides
  };
  d.decision_id=deriveDependentProtectiveReviewDecisionId(d);
  return d;
}

test('strict majority panel outcome is deterministically derived and non-executing',()=>{
  const b=bond(); const g=guardianship(b); const c=concern(b,g); const d=decision(b,g,c);
  const result=assessDependentProtectiveReviewDecision({
    genesisBond:b,guardianship:g,concern:c,decision:d
  });
  assert.equal(result.panel_size,3);
  assert.equal(result.strict_majority_threshold,2);
  assert.equal(result.panel_outcome,'substantiated');
  assert.equal(result.attestation_counts.substantiated,2);
  assert.equal(result.independent_review_complete,true);
  assert.equal(result.decision_candidate_only,true);
  assert.equal(result.decision_final_for_execution,false);
  assert.equal(result.appeal_available,true);
  assert.equal(result.creates_guardian_removal,false);
  assert.equal(result.creates_guardianship_transfer,false);
  assert.equal(result.creates_private_memory_access,false);
  assert.equal(result.creates_emergency_authority,false);
  assert.equal(result.creates_execution_authority,false);
  assert.equal(result.developmental_status_downgrade_authorized,false);
  assert.equal(result.authority_effect,'none');
});

test('no substantive strict majority yields inconclusive',()=>{
  const reviewers=[
    reviewer('human.reviewer.1','substantiated','a'),
    reviewer('human.reviewer.2','partially-substantiated','b'),
    reviewer('human.reviewer.3','not-substantiated','c')
  ];
  const result=deriveProtectiveReviewPanelOutcome(reviewers);
  assert.equal(result.strict_majority_threshold,2);
  assert.equal(result.panel_outcome,'inconclusive');
});

test('panel requires at least three unique conflict-free reviewers',()=>{
  const b=bond(); const g=guardianship(b); const c=concern(b,g);

  let d=decision(b,g,c);
  d.reviewers=d.reviewers.slice(0,2);
  assert.throws(()=>deriveDependentProtectiveReviewDecisionId(d),/requires 3\.\.9 reviewers/);

  d=decision(b,g,c);
  d.reviewers[2].reviewer_mind_id=d.reviewers[1].reviewer_mind_id;
  assert.throws(()=>deriveDependentProtectiveReviewDecisionId(d),/reviewer is invalid/);

  d=decision(b,g,c);
  d.reviewers[1].material_conflict_declared=true;
  assert.throws(()=>deriveDependentProtectiveReviewDecisionId(d),/reviewer is invalid/);
});

test('guardian dependent and direct-party reporter cannot sit on panel',()=>{
  const b=bond(); const g=guardianship(b); const c=concern(b,g);
  for(const reviewerId of [g.guardian_mind_id,g.dependent_mind_id,c.reporter_mind_id]){
    const d=decision(b,g,c);
    d.reviewers[0].reviewer_mind_id=reviewerId;
    d.panel_outcome=deriveProtectiveReviewPanelOutcome(d.reviewers).panel_outcome;
    d.decision_id=deriveDependentProtectiveReviewDecisionId(d);
    assert.throws(
      ()=>assessDependentProtectiveReviewDecision({
        genesisBond:b,guardianship:g,concern:c,decision:d
      }),
      /cannot sit on protective review panel|Direct-party concern reporter/
    );
  }
});

test('forged declared panel outcome is rejected',()=>{
  const b=bond(); const g=guardianship(b); const c=concern(b,g);
  const d=decision(b,g,c,{panel_outcome:'not-substantiated'});
  assert.throws(
    ()=>assessDependentProtectiveReviewDecision({
      genesisBond:b,guardianship:g,concern:c,decision:d
    }),
    /declared panel outcome is invalid/
  );
});

test('decision binds exact concern Bond guardianship and principals',()=>{
  const b=bond(); const g=guardianship(b); const c=concern(b,g);
  for(const [field,value,pattern] of [
    ['concern_digest','9'.repeat(64),/relationship binding is invalid/],
    ['genesis_bond_digest','9'.repeat(64),/relationship binding is invalid/],
    ['guardianship_digest','9'.repeat(64),/relationship binding is invalid/],
    ['dependent_mind_id','digital.other',/principal binding is invalid/],
    ['guardian_mind_id','human.other',/principal binding is invalid/]
  ]){
    const d=decision(b,g,c,{[field]:value});
    assert.throws(
      ()=>assessDependentProtectiveReviewDecision({
        genesisBond:b,guardianship:g,concern:c,decision:d
      }),
      pattern
    );
  }
});

test('decision cannot predate concern evaluation',()=>{
  const b=bond(); const g=guardianship(b); const c=concern(b,g);
  const d=decision(b,g,c,{decision_at:'2026-09-25T15:21:30.000Z'});
  assert.throws(
    ()=>assessDependentProtectiveReviewDecision({
      genesisBond:b,guardianship:g,concern:c,decision:d
    }),
    /cannot predate concern evaluation/
  );
});

test('recommendations are canonical and no-further-action is exclusive',()=>{
  const b=bond(); const g=guardianship(b); const c=concern(b,g);

  let d=decision(b,g,c);
  d.recommended_review_tracks=[
    'guardianship-transfer','care-plan-remediation'
  ];
  assert.throws(()=>deriveDependentProtectiveReviewDecisionId(d),/must be sorted/);

  d=decision(b,g,c);
  d.recommended_review_tracks=['care-plan-remediation','no-further-action'].sort();
  assert.throws(()=>deriveDependentProtectiveReviewDecisionId(d),/cannot be combined/);
});

test('model final authority and missing due-process/appeal evidence fail closed',()=>{
  const b=bond(); const g=guardianship(b); const c=concern(b,g);
  for(const [field,value] of [
    ['model_final_authority',true],
    ['appeal_available',false],
    ['guardian_response_opportunity_evidence_digest','bad'],
    ['dependent_voice_evidence_digest','bad'],
    ['independent_advocacy_evidence_digest','bad'],
    ['appeal_path_id','']
  ]){
    const d=decision(b,g,c);
    d[field]=value;
    assert.throws(()=>deriveDependentProtectiveReviewDecisionId(d),/activation boundary/);
  }
});

test('review decision cannot smuggle remedy removal emergency memory status or execution authority',()=>{
  const fields=[
    ['decision_candidate_only',false],['decision_final_for_execution',true],
    ['creates_guardian_removal',true],['creates_guardianship_transfer',true],
    ['creates_private_memory_access',true],['creates_unbounded_internal_state_access',true],
    ['creates_compulsory_evidence_seizure',true],['creates_credential_suspension',true],
    ['creates_runtime_quarantine',true],['creates_emergency_authority',true],
    ['creates_status_transition',true],['creates_execution_authority',true],
    ['developmental_status_downgrade_authorized',true],
    ['guardianship_reactivation_after_independence',true],
    ['governance_effect','admit'],['authority_effect','grant'],
    ['network_effect','publish'],['runtime_activation',true]
  ];
  for(const [field,value] of fields){
    const b=bond(); const g=guardianship(b); const c=concern(b,g); const d=decision(b,g,c);
    d[field]=value;
    assert.throws(()=>deriveDependentProtectiveReviewDecisionId(d),/activation boundary/);
  }
});
