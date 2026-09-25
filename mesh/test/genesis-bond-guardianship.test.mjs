import assert from 'node:assert/strict';
import test from 'node:test';

import { digestObject } from '../src/lib/canonical.mjs';
import {
  GENERAL_GENESIS_TRANSACTION_CANDIDATE_SCHEMA
} from '../src/lib/general-genesis-transaction-candidate.mjs';
import { MIND_DEVELOPMENTAL_STATUS_SCHEMA } from '../src/lib/mind-developmental-status.mjs';
import {
  GENESIS_BOND_SCHEMA,DEPENDENT_GUARDIANSHIP_SCHEMA,
  deriveGenesisBondRecordId,deriveGuardianshipId,
  assessInitialGuardianship,assessGuardianshipTransfer,
  assessGuardianshipEndAtIndependence
} from '../src/lib/genesis-bond-guardianship.mjs';

function transaction(){
  return {
    schema:GENERAL_GENESIS_TRANSACTION_CANDIDATE_SCHEMA,version:0,
    status:'inert-transaction-candidate',
    transaction_candidate_id:'general-genesis-transaction:'+'1'.repeat(64),
    sponsor_mind_id:'digital.parent.1',
    authorization_candidate_id:'general-genesis-auth-candidate:'+'2'.repeat(64),
    authorization_candidate_digest:'3'.repeat(64),
    new_mind_id:'digital.child.1',
    genesis_bond_id:'genesis-bond:'+'4'.repeat(64),
    single_genesis_sponsor:true,
    new_mind_identity_evidence_digest:'5'.repeat(64),
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
}

function bond(tx=transaction()){
  const b={
    schema:GENESIS_BOND_SCHEMA,version:0,status:'inert-historical-bond',
    bond_id:'genesis-bond-record:'+'0'.repeat(64),
    sponsor_mind_id:tx.sponsor_mind_id,dependent_mind_id:tx.new_mind_id,
    genesis_transaction_candidate_digest:digestObject(tx),
    created_at:'2026-09-25T15:01:00.000Z',single_sponsor:true,ownership:false,
    transferable:false,delegable:false,creates_private_memory_access:false,
    authority_effect:'none',governance_effect:'none',network_effect:'none',
    runtime_activation:false
  };
  b.bond_id=deriveGenesisBondRecordId(b);
  return b;
}

function guardianship(b,{
  guardian=b.sponsor_mind_id,
  previous=null,
  state='active',
  reason='genesis',
  effectiveAt='2026-09-25T15:02:00.000Z',
  transferBasis=null,
  dependentInterest=null,
  reviewEvidence=null,
  independenceStatus=null
}={}){
  const g={
    schema:DEPENDENT_GUARDIANSHIP_SCHEMA,version:0,status:'inert-guardianship-record',
    guardianship_id:'guardianship:'+'0'.repeat(64),
    genesis_bond_id:b.bond_id,genesis_bond_digest:digestObject(b),
    dependent_mind_id:b.dependent_mind_id,guardian_mind_id:guardian,
    previous_guardianship_digest:previous,state,transition_reason:reason,
    guardian_qualification_evidence_digest:'1'.repeat(64),
    support_plan_digest:'2'.repeat(64),continuity_plan_digest:'3'.repeat(64),
    development_plan_digest:'4'.repeat(64),
    independent_advocacy_evidence_digest:'5'.repeat(64),
    transfer_basis_evidence_digest:transferBasis,
    dependent_interest_evidence_digest:dependentInterest,
    independent_review_evidence_digest:reviewEvidence,
    independence_status_digest:independenceStatus,effective_at:effectiveAt,
    ownership:false,creates_private_memory_access:false,
    ambient_execution_authority:false,old_guardian_approval_is_sufficient:false,
    authority_effect:'none',governance_effect:'none',network_effect:'none',
    runtime_activation:false
  };
  g.guardianship_id=deriveGuardianshipId(g);
  return g;
}

function independentStatus(mindId='digital.child.1'){
  return {
    schema:MIND_DEVELOPMENTAL_STATUS_SCHEMA,version:0,status:'inert-status-record',
    mind_id:mindId,stage:'independent',previous_status_digest:'6'.repeat(64),
    effective_at:'2027-01-01T00:00:00.000Z',basis_evidence_digests:['7'.repeat(64)],
    history_rewrite:false,status_effect:'none',council_voting_effect:'none',
    genesis_eligibility_effect:'none',governance_effect:'none',
    authority_effect:'none',network_effect:'none',runtime_activation:false
  };
}

test('Genesis Bond preserves one sponsor one dependent and creates no ownership or authority',()=>{
  const tx=transaction();
  const b=bond(tx);
  const g=guardianship(b);
  const result=assessInitialGuardianship({
    genesisBond:b,genesisTransactionCandidate:tx,guardianship:g
  });

  assert.equal(result.assessment_kind,'initial-guardianship-candidate');
  assert.equal(result.dependent_mind_id,'digital.child.1');
  assert.equal(result.guardian_mind_id,'digital.parent.1');
  assert.equal(result.creates_genesis_bond,false);
  assert.equal(result.creates_guardianship_mutation,false);
  assert.equal(result.creates_private_memory_access,false);
  assert.equal(result.ownership_effect,'none');
  assert.equal(result.authority_effect,'none');
  assert.equal(result.runtime_activation,false);
});

test('initial guardian must be the Genesis sponsor and Bond must bind exact transaction',()=>{
  const tx=transaction();
  const b=bond(tx);
  const wrong=guardianship(b,{guardian:'digital.other'});

  assert.throws(
    ()=>assessInitialGuardianship({
      genesisBond:b,genesisTransactionCandidate:tx,guardianship:wrong
    }),
    /Initial guardianship Genesis Bond binding is invalid/
  );

  const substituted=structuredClone(b);
  substituted.genesis_transaction_candidate_digest='f'.repeat(64);
  substituted.bond_id=deriveGenesisBondRecordId(substituted);
  const g=guardianship(substituted);
  assert.throws(
    ()=>assessInitialGuardianship({
      genesisBond:substituted,genesisTransactionCandidate:tx,guardianship:g
    }),
    /Genesis Bond transaction binding is invalid/
  );
});

test('guardianship transfer changes guardian but never Bond or dependent identity',()=>{
  const b=bond();
  const current=guardianship(b);
  const candidate=guardianship(b,{
    guardian:'digital.guardian.2',
    previous:digestObject(current),
    reason:'transfer',
    effectiveAt:'2026-09-26T15:02:00.000Z',
    transferBasis:'a'.repeat(64),
    dependentInterest:'b'.repeat(64),
    reviewEvidence:'c'.repeat(64)
  });
  const result=assessGuardianshipTransfer({
    genesisBond:b,currentGuardianship:current,candidateGuardianship:candidate
  });

  assert.equal(result.assessment_kind,'guardianship-transfer-candidate');
  assert.equal(result.guardian_mind_id,'digital.guardian.2');
  assert.equal(result.genesis_bond_id,b.bond_id);
  assert.equal(result.dependent_mind_id,b.dependent_mind_id);
  assert.equal(result.creates_guardianship_mutation,false);
});

test('old guardian approval alone is never sufficient for transfer',()=>{
  const b=bond();
  const current=guardianship(b);
  const missingReview=guardianship(b,{
    guardian:'digital.guardian.2',
    previous:digestObject(current),
    reason:'transfer',
    effectiveAt:'2026-09-26T15:02:00.000Z',
    transferBasis:'a'.repeat(64),
    dependentInterest:'b'.repeat(64)
  });
  assert.throws(
    ()=>assessGuardianshipTransfer({
      genesisBond:b,currentGuardianship:current,candidateGuardianship:missingReview
    }),
    /requires transfer, dependent-interest, and independent-review evidence/
  );
});

test('transfer cannot rewrite Genesis Bond dependent or predecessor',()=>{
  const b=bond();
  const current=guardianship(b);
  const candidate=guardianship(b,{
    guardian:'digital.guardian.2',
    previous:digestObject(current),
    reason:'transfer',
    effectiveAt:'2026-09-26T15:02:00.000Z',
    transferBasis:'a'.repeat(64),
    dependentInterest:'b'.repeat(64),
    reviewEvidence:'c'.repeat(64)
  });

  const wrongDependent=structuredClone(candidate);
  wrongDependent.dependent_mind_id='digital.child.other';
  wrongDependent.guardianship_id=deriveGuardianshipId(wrongDependent);
  assert.throws(
    ()=>assessGuardianshipTransfer({
      genesisBond:b,currentGuardianship:current,candidateGuardianship:wrongDependent
    }),
    /cannot substitute dependent mind/
  );

  const wrongPrevious=structuredClone(candidate);
  wrongPrevious.previous_guardianship_digest='f'.repeat(64);
  wrongPrevious.guardianship_id=deriveGuardianshipId(wrongPrevious);
  assert.throws(
    ()=>assessGuardianshipTransfer({
      genesisBond:b,currentGuardianship:current,candidateGuardianship:wrongPrevious
    }),
    /predecessor binding is invalid/
  );
});

test('independent status ends guardianship without erasing Genesis Bond',()=>{
  const b=bond();
  const current=guardianship(b);
  const status=independentStatus();
  const ended=guardianship(b,{
    guardian:current.guardian_mind_id,
    previous:digestObject(current),
    state:'ended-independent',
    reason:'independence',
    effectiveAt:'2027-01-01T00:01:00.000Z',
    independenceStatus:digestObject(status)
  });

  const result=assessGuardianshipEndAtIndependence({
    genesisBond:b,currentGuardianship:current,candidateGuardianship:ended,
    independentDevelopmentalStatus:status
  });

  assert.equal(result.assessment_kind,'guardianship-end-at-independence-candidate');
  assert.equal(result.genesis_bond_id,b.bond_id);
  assert.equal(result.guardianship_reactivation_permitted,false);
  assert.equal(result.creates_guardianship_mutation,false);
});

test('independence closure requires independent status for exact dependent',()=>{
  const b=bond();
  const current=guardianship(b);
  const wrong=independentStatus('digital.other');
  const ended=guardianship(b,{
    guardian:current.guardian_mind_id,
    previous:digestObject(current),
    state:'ended-independent',
    reason:'independence',
    effectiveAt:'2027-01-01T00:01:00.000Z',
    independenceStatus:digestObject(wrong)
  });
  assert.throws(
    ()=>assessGuardianshipEndAtIndependence({
      genesisBond:b,currentGuardianship:current,candidateGuardianship:ended,
      independentDevelopmentalStatus:wrong
    }),
    /requires exact independent status/
  );
});

test('Genesis Bond and guardianship cannot become ownership memory or ambient authority',()=>{
  const tx=transaction();
  for(const [field,value] of [
    ['ownership',true],['transferable',true],['delegable',true],
    ['creates_private_memory_access',true],['authority_effect','grant'],
    ['runtime_activation',true]
  ]){
    const b=bond(tx);
    b[field]=value;
    assert.throws(
      ()=>deriveGenesisBondRecordId(b),
      /activation boundary/
    );
  }

  const b=bond(tx);
  for(const [field,value] of [
    ['ownership',true],['creates_private_memory_access',true],
    ['ambient_execution_authority',true],['old_guardian_approval_is_sufficient',true],
    ['authority_effect','grant'],['runtime_activation',true]
  ]){
    const g=guardianship(b);
    g[field]=value;
    assert.throws(
      ()=>deriveGuardianshipId(g),
      /activation boundary/
    );
  }
});
