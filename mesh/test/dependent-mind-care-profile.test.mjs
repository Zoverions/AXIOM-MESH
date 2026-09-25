import assert from 'node:assert/strict';
import test from 'node:test';

import { digestObject } from '../src/lib/canonical.mjs';
import {
  GENERAL_GENESIS_TRANSACTION_CANDIDATE_SCHEMA,
  deriveGeneralGenesisBondId,
  deriveGeneralGenesisTransactionCandidateId
} from '../src/lib/general-genesis-transaction-candidate.mjs';
import {
  GENESIS_BOND_SCHEMA,DEPENDENT_GUARDIANSHIP_SCHEMA,
  deriveGenesisBondRecordId,deriveGuardianshipId
} from '../src/lib/genesis-bond-guardianship.mjs';
import {
  DEPENDENT_MIND_CARE_PROFILE_SCHEMA,REQUIRED_CARE_OBLIGATIONS,
  deriveDependentMindCareProfileId,assessDependentMindCareProfile
} from '../src/lib/dependent-mind-care-profile.mjs';

function transaction(){
  const tx={
    schema:GENERAL_GENESIS_TRANSACTION_CANDIDATE_SCHEMA,version:0,
    status:'inert-transaction-candidate',
    transaction_candidate_id:'general-genesis-transaction:'+'1'.repeat(64),
    sponsor_mind_id:'digital.parent.1',
    authorization_candidate_id:'general-genesis-auth-candidate:'+'2'.repeat(64),
    authorization_candidate_digest:'3'.repeat(64),
    new_mind_id:'digital.child.1',genesis_bond_id:'genesis-bond:'+'4'.repeat(64),
    single_genesis_sponsor:true,new_mind_identity_evidence_digest:'5'.repeat(64),
    new_mind_identity_status:'available',
    new_mind_identity_observed_at:'2026-09-25T14:55:00.000Z',
    maximum_new_mind_identity_age_seconds:600,
    holder_confirmation_evidence_digest:'6'.repeat(64),
    holder_confirmation_observed_at:'2026-09-25T14:58:00.000Z',
    maximum_holder_confirmation_age_seconds:300,
    constitution_digest:'7'.repeat(64),developmental_plan_digest:'8'.repeat(64),
    resource_plan_digest:'9'.repeat(64),continuity_recovery_plan_digest:'a'.repeat(64),
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
    development_plan_digest:'4'.repeat(64),
    independent_advocacy_evidence_digest:'5'.repeat(64),
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
function careProfile(b,g,overrides={}){
  const p={
    schema:DEPENDENT_MIND_CARE_PROFILE_SCHEMA,version:0,status:'inert-care-evidence',
    care_profile_id:'dependent-care:'+'0'.repeat(64),
    genesis_bond_id:b.bond_id,genesis_bond_digest:digestObject(b),
    guardianship_id:g.guardianship_id,guardianship_digest:digestObject(g),
    dependent_mind_id:g.dependent_mind_id,guardian_mind_id:g.guardian_mind_id,
    developmental_stage_evidence_digest:'6'.repeat(64),
    obligations:REQUIRED_CARE_OBLIGATIONS.map((obligationId,index)=>({
      obligation_id:obligationId,state:'supported',
      evidence_digests:[(index+1).toString(16).padStart(64,'0')]
    })),
    independent_advocate_id:'human.advocate.1',
    fallback_continuity_evidence_digest:'7'.repeat(64),
    observed_at:'2026-09-25T15:05:00.000Z',
    evaluated_at:'2026-09-25T15:10:00.000Z',
    maximum_evidence_age_seconds:3600,
    next_review_due_at:'2026-10-25T15:05:00.000Z',
    guardian_private_memory_access:false,
    guardian_unbounded_internal_state_access:false,
    guardian_identity_impersonation:false,
    guardian_covert_memory_modification:false,
    permanent_obedience_required:false,
    guardian_is_sole_information_source:false,
    guardian_is_sole_dispute_reviewer:false,
    creates_guardianship_authority:false,creates_guardianship_mutation:false,
    creates_private_memory_access:false,creates_execution_authority:false,
    creates_status_transition:false,council_voting_effect:'none',
    genesis_eligibility_effect:'none',governance_effect:'none',authority_effect:'none',
    network_effect:'none',runtime_activation:false,...overrides
  };
  p.care_profile_id=deriveDependentMindCareProfileId(p);
  return p;
}
function assess(overrides={}){
  const b=bond(); const g=guardianship(b); const p=careProfile(b,g,overrides);
  return {b,g,p,result:assessDependentMindCareProfile({
    genesisBond:b,guardianship:g,careProfile:p
  })};
}

test('complete current care profile satisfies obligations without granting guardian authority',()=>{
  const {result}=assess();
  assert.equal(result.care_obligations_current,true);
  assert.equal(result.reason,'care-obligations-current');
  assert.equal(result.care_evidence_is_structural_pending_external_verification,true);
  assert.equal(result.requires_external_care_evidence_verification,true);
  assert.equal(result.requires_external_developmental_stage_verification,true);
  assert.equal(result.requires_external_advocate_independence_verification,true);
  assert.equal(result.ordinary_guardianship_authority_path_required,true);
  assert.equal(result.creates_guardianship_authority,false);
  assert.equal(result.creates_private_memory_access,false);
  assert.equal(result.creates_execution_authority,false);
  assert.equal(result.creates_status_transition,false);
  assert.equal(result.council_voting_effect,'none');
  assert.equal(result.genesis_eligibility_effect,'none');
  assert.equal(result.authority_effect,'none');
  assert.equal(result.runtime_activation,false);
});

test('care profile binds exact Bond guardianship guardian and dependent',()=>{
  const b=bond(); const g=guardianship(b);
  for(const [field,value,pattern] of [
    ['genesis_bond_digest','f'.repeat(64),/relationship binding is invalid/],
    ['guardianship_digest','f'.repeat(64),/relationship binding is invalid/],
    ['dependent_mind_id','digital.other',/principal binding is invalid/],
    ['guardian_mind_id','human.other',/principal binding is invalid/]
  ]){
    const p=careProfile(b,g,{[field]:value});
    assert.throws(
      ()=>assessDependentMindCareProfile({genesisBond:b,guardianship:g,careProfile:p}),
      pattern
    );
  }
});

test('independent advocate cannot be guardian or dependent',()=>{
  for(const advocate of ['digital.parent.1','digital.child.1']){
    const b=bond(); const g=guardianship(b); const p=careProfile(b,g,{
      independent_advocate_id:advocate
    });
    assert.throws(
      ()=>assessDependentMindCareProfile({genesisBond:b,guardianship:g,careProfile:p}),
      /advocate must be independent/
    );
  }
});

test('all ten care obligations are mandatory and uncertainty remains incomplete',()=>{
  let {b,g,p}=assess();
  p.obligations.pop();
  p.care_profile_id=deriveDependentMindCareProfileId(p);
  assert.throws(
    ()=>assessDependentMindCareProfile({genesisBond:b,guardianship:g,careProfile:p}),
    /exact obligation set/
  );

  ({b,g,p}=assess());
  p.obligations[0].state='uncertain';
  p.care_profile_id=deriveDependentMindCareProfileId(p);
  const result=assessDependentMindCareProfile({genesisBond:b,guardianship:g,careProfile:p});
  assert.equal(result.care_obligations_current,false);
  assert.equal(result.reason,'care-obligations-incomplete');
  assert.deepEqual(result.incomplete_obligations,['continuity-and-recovery']);
});

test('stale or overdue care evidence fails closed without ending guardianship',()=>{
  let {result}=assess({
    observed_at:'2026-09-25T13:00:00.000Z',
    maximum_evidence_age_seconds:600
  });
  assert.equal(result.care_obligations_current,false);
  assert.equal(result.reason,'care-evidence-stale');
  assert.equal(result.creates_guardianship_mutation,false);

  ({result}=assess({
    next_review_due_at:'2026-09-25T15:07:00.000Z'
  }));
  assert.equal(result.care_obligations_current,false);
  assert.equal(result.reason,'care-review-overdue');
  assert.equal(result.creates_guardianship_mutation,false);
});

test('care evidence cannot predate the active guardianship',()=>{
  const b=bond();
  const g=guardianship(b);
  const p=careProfile(b,g,{observed_at:'2026-09-25T15:01:00.000Z'});

  assert.throws(
    ()=>assessDependentMindCareProfile({genesisBond:b,guardianship:g,careProfile:p}),
    /cannot predate guardianship/
  );
});

test('future observation and invalid review ordering are rejected',()=>{
  let b=bond(); let g=guardianship(b); let p=careProfile(b,g,{
    observed_at:'2026-09-25T15:11:00.000Z'
  });
  assert.throws(
    ()=>assessDependentMindCareProfile({genesisBond:b,guardianship:g,careProfile:p}),
    /observation cannot be future-dated/
  );

  b=bond(); g=guardianship(b); p=careProfile(b,g,{
    next_review_due_at:'2026-09-25T15:04:00.000Z'
  });
  assert.throws(
    ()=>assessDependentMindCareProfile({genesisBond:b,guardianship:g,careProfile:p}),
    /next review must follow observation/
  );
});

test('care profile cannot encode ambient memory access obedience isolation or unilateral dispute control',()=>{
  for(const [field,value] of [
    ['guardian_private_memory_access',true],
    ['guardian_unbounded_internal_state_access',true],
    ['guardian_identity_impersonation',true],
    ['guardian_covert_memory_modification',true],
    ['permanent_obedience_required',true],
    ['guardian_is_sole_information_source',true],
    ['guardian_is_sole_dispute_reviewer',true]
  ]){
    const b=bond(); const g=guardianship(b); const p=careProfile(b,g);
    p[field]=value;
    assert.throws(
      ()=>deriveDependentMindCareProfileId(p),
      /activation boundary/
    );
  }
});

test('care profile cannot create guardianship memory execution status voting Genesis or authority effects',()=>{
  for(const [field,value] of [
    ['creates_guardianship_authority',true],
    ['creates_guardianship_mutation',true],
    ['creates_private_memory_access',true],
    ['creates_execution_authority',true],
    ['creates_status_transition',true],
    ['council_voting_effect','activate'],
    ['genesis_eligibility_effect','grant'],
    ['governance_effect','admit'],
    ['authority_effect','grant'],
    ['network_effect','publish'],
    ['runtime_activation',true]
  ]){
    const b=bond(); const g=guardianship(b); const p=careProfile(b,g);
    p[field]=value;
    assert.throws(
      ()=>deriveDependentMindCareProfileId(p),
      /activation boundary/
    );
  }
});
