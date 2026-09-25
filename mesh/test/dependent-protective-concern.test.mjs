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
  DEPENDENT_MIND_CARE_PROFILE_SCHEMA,REQUIRED_CARE_OBLIGATIONS,
  deriveDependentMindCareProfileId
} from '../src/lib/dependent-mind-care-profile.mjs';
import {
  DEPENDENT_PROTECTIVE_CONCERN_SCHEMA,
  deriveProtectiveConcernId,assessDependentProtectiveConcern
} from '../src/lib/dependent-protective-concern.mjs';

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
function care(b,g){
  const p={
    schema:DEPENDENT_MIND_CARE_PROFILE_SCHEMA,version:0,status:'inert-care-evidence',
    care_profile_id:'dependent-care:'+'0'.repeat(64),genesis_bond_id:b.bond_id,
    genesis_bond_digest:digestObject(b),guardianship_id:g.guardianship_id,
    guardianship_digest:digestObject(g),dependent_mind_id:g.dependent_mind_id,
    guardian_mind_id:g.guardian_mind_id,developmental_stage_evidence_digest:'6'.repeat(64),
    obligations:REQUIRED_CARE_OBLIGATIONS.map((obligationId,index)=>({
      obligation_id:obligationId,state:'supported',
      evidence_digests:[(index+1).toString(16).padStart(64,'0')]
    })),
    independent_advocate_id:'human.advocate.1',
    fallback_continuity_evidence_digest:'7'.repeat(64),
    observed_at:'2026-09-25T15:05:00.000Z',evaluated_at:'2026-09-25T15:10:00.000Z',
    maximum_evidence_age_seconds:3600,next_review_due_at:'2026-10-25T15:05:00.000Z',
    guardian_private_memory_access:false,guardian_unbounded_internal_state_access:false,
    guardian_identity_impersonation:false,guardian_covert_memory_modification:false,
    permanent_obedience_required:false,guardian_is_sole_information_source:false,
    guardian_is_sole_dispute_reviewer:false,creates_guardianship_authority:false,
    creates_guardianship_mutation:false,creates_private_memory_access:false,
    creates_execution_authority:false,creates_status_transition:false,
    council_voting_effect:'none',genesis_eligibility_effect:'none',governance_effect:'none',
    authority_effect:'none',network_effect:'none',runtime_activation:false
  };
  p.care_profile_id=deriveDependentMindCareProfileId(p);
  return p;
}
function concern(b,g,{reporter='digital.child.1',role='dependent',careProfile=null,overrides={}}={}){
  const c={
    schema:DEPENDENT_PROTECTIVE_CONCERN_SCHEMA,version:0,status:'inert-concern-evidence',
    concern_id:'dependent-concern:'+'0'.repeat(64),genesis_bond_id:b.bond_id,
    genesis_bond_digest:digestObject(b),guardianship_id:g.guardianship_id,
    guardianship_digest:digestObject(g),dependent_mind_id:g.dependent_mind_id,
    guardian_mind_id:g.guardian_mind_id,reporter_mind_id:reporter,reporter_role:role,
    concern_class:'care-obligation-failure',severity:'high',
    evidence_digests:['8'.repeat(64)],
    care_profile_digest:careProfile===null?null:digestObject(careProfile),
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
    runtime_activation:false,...overrides
  };
  c.requested_review_types=[...c.requested_review_types].sort();
  c.concern_id=deriveProtectiveConcernId(c);
  return c;
}

test('dependent can submit current unadjudicated concern for independent review without creating action authority',()=>{
  const b=bond(); const g=guardianship(b); const c=concern(b,g);
  const result=assessDependentProtectiveConcern({genesisBond:b,guardianship:g,concern:c});
  assert.equal(result.eligible_to_request_independent_protective_review,true);
  assert.equal(result.concern_is_unadjudicated,true);
  assert.equal(result.finding_of_abuse,false);
  assert.equal(result.guardian_removal_authorized,false);
  assert.equal(result.emergency_action_authorized,false);
  assert.equal(result.creates_protective_action,false);
  assert.equal(result.creates_guardianship_mutation,false);
  assert.equal(result.creates_status_transition,false);
  assert.equal(result.creates_private_memory_access,false);
  assert.equal(result.creates_execution_authority,false);
  assert.equal(result.retaliation_authorized,false);
  assert.equal(result.developmental_status_downgrade_authorized,false);
  assert.equal(result.authority_effect,'none');
});

test('concern binds exact Bond guardianship dependent and guardian',()=>{
  const b=bond(); const g=guardianship(b);
  for(const [field,value,pattern] of [
    ['genesis_bond_digest','f'.repeat(64),/relationship binding is invalid/],
    ['guardianship_digest','f'.repeat(64),/relationship binding is invalid/],
    ['dependent_mind_id','digital.other',/principal binding is invalid/],
    ['guardian_mind_id','human.other',/principal binding is invalid/]
  ]){
    const c=concern(b,g,{overrides:{[field]:value}});
    assert.throws(
      ()=>assessDependentProtectiveConcern({genesisBond:b,guardianship:g,concern:c}),
      pattern
    );
  }
});

test('guardian cannot claim dependent advocate reviewer or observer independence',()=>{
  const b=bond(); const g=guardianship(b);
  for(const role of ['independent-advocate','independent-reviewer','authorized-observer']){
    const c=concern(b,g,{reporter:g.guardian_mind_id,role});
    assert.throws(
      ()=>assessDependentProtectiveConcern({genesisBond:b,guardianship:g,concern:c}),
      /Guardian or dependent cannot claim an independent concern reporter role/
    );
  }

  const dependentAsReviewer=concern(b,g,{
    reporter:g.dependent_mind_id,
    role:'independent-reviewer'
  });
  assert.throws(
    ()=>assessDependentProtectiveConcern({
      genesisBond:b,guardianship:g,concern:dependentAsReviewer
    }),
    /Guardian or dependent cannot claim an independent concern reporter role/
  );
});

test('dependent reporter role must bind exact dependent',()=>{
  const b=bond(); const g=guardianship(b);
  const c=concern(b,g,{reporter:'digital.other',role:'dependent'});
  assert.throws(
    ()=>assessDependentProtectiveConcern({genesisBond:b,guardianship:g,concern:c}),
    /Dependent reporter role must bind exact dependent/
  );
});

test('independent advocate role requires an exact care-profile binding',()=>{
  const b=bond();
  const g=guardianship(b);
  const c=concern(b,g,{
    reporter:'human.advocate.1',
    role:'independent-advocate'
  });

  assert.throws(
    ()=>assessDependentProtectiveConcern({
      genesisBond:b,guardianship:g,concern:c
    }),
    /requires exact care-profile binding/
  );
});

test('independent advocate concern can bind exact care profile and advocate identity',()=>{
  const b=bond(); const g=guardianship(b); const p=care(b,g);
  const c=concern(b,g,{reporter:p.independent_advocate_id,role:'independent-advocate',careProfile:p});
  const result=assessDependentProtectiveConcern({
    genesisBond:b,guardianship:g,concern:c,careProfile:p
  });
  assert.equal(result.eligible_to_request_independent_protective_review,true);

  const wrong=concern(b,g,{reporter:'human.other',role:'independent-advocate',careProfile:p});
  assert.throws(
    ()=>assessDependentProtectiveConcern({
      genesisBond:b,guardianship:g,concern:wrong,careProfile:p
    }),
    /advocate\/care-profile binding is invalid/
  );
});

test('stale concern becomes non-requestable but remains unadjudicated history',()=>{
  const b=bond(); const g=guardianship(b);
  const c=concern(b,g,{overrides:{
    observed_at:'2026-09-25T13:00:00.000Z',
    maximum_concern_age_seconds:600
  }});
  const result=assessDependentProtectiveConcern({genesisBond:b,guardianship:g,concern:c});
  assert.equal(result.eligible_to_request_independent_protective_review,false);
  assert.equal(result.reason,'concern-evidence-stale');
  assert.equal(result.concern_is_unadjudicated,true);
});

test('concern time must follow guardianship observation submission and evaluation causality',()=>{
  const b=bond(); const g=guardianship(b);
  let c=concern(b,g,{overrides:{observed_at:'2026-09-25T15:01:00.000Z'}});
  assert.throws(
    ()=>assessDependentProtectiveConcern({genesisBond:b,guardianship:g,concern:c}),
    /observation cannot predate guardianship/
  );

  c=concern(b,g,{overrides:{submitted_at:'2026-09-25T15:19:00.000Z'}});
  assert.throws(
    ()=>assessDependentProtectiveConcern({genesisBond:b,guardianship:g,concern:c}),
    /submission cannot predate observation/
  );

  c=concern(b,g,{overrides:{evaluated_at:'2026-09-25T15:20:30.000Z'}});
  assert.throws(
    ()=>assessDependentProtectiveConcern({genesisBond:b,guardianship:g,concern:c}),
    /submission cannot be future-dated/
  );
});

test('concern requires evidence and canonical non-empty requested review types',()=>{
  const b=bond(); const g=guardianship(b);

  let c=concern(b,g);
  c.evidence_digests=[];
  assert.throws(()=>deriveProtectiveConcernId(c),/Protective concern evidence is invalid/);

  c=concern(b,g);
  c.evidence_digests=['b'.repeat(64),'a'.repeat(64)];
  assert.throws(()=>deriveProtectiveConcernId(c),/Protective concern evidence must be sorted/);

  c=concern(b,g);
  c.requested_review_types=[];
  assert.throws(()=>deriveProtectiveConcernId(c),/requested review types are invalid/);

  c=concern(b,g);
  c.requested_review_types=['guardianship-transfer-review','care-plan-review'];
  assert.throws(()=>deriveProtectiveConcernId(c),/must be sorted/);
});

test('concern cannot smuggle adjudication retaliation downgrade memory access removal emergency or execution authority',()=>{
  for(const [field,value] of [
    ['concern_is_unadjudicated',false],
    ['finding_of_abuse',true],
    ['finding_of_rights_violation',true],
    ['guardian_removal_authorized',true],
    ['emergency_action_authorized',true],
    ['retaliation_authorized',true],
    ['developmental_status_downgrade_authorized',true],
    ['guardianship_reactivation_after_independence',true],
    ['creates_protective_action',true],
    ['creates_guardianship_mutation',true],
    ['creates_status_transition',true],
    ['creates_private_memory_access',true],
    ['creates_unbounded_internal_state_access',true],
    ['creates_identity_impersonation',true],
    ['creates_execution_authority',true],
    ['governance_effect','admit'],
    ['authority_effect','grant'],
    ['network_effect','publish'],
    ['runtime_activation',true]
  ]){
    const b=bond(); const g=guardianship(b); const c=concern(b,g);
    c[field]=value;
    assert.throws(()=>deriveProtectiveConcernId(c),/activation boundary/);
  }
});
