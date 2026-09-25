import assert from 'node:assert/strict';
import test from 'node:test';

import { digestObject } from '../src/lib/canonical.mjs';
import { MIND_DEVELOPMENTAL_STATUS_SCHEMA } from '../src/lib/mind-developmental-status.mjs';
import {
  GENERAL_GENESIS_RESPONSIBILITY_PROFILE,
  GENERAL_GENESIS_SPONSOR_ELIGIBILITY_SCHEMA,
  REQUIRED_GENESIS_RESPONSIBILITY_CRITERIA
} from '../src/lib/general-genesis-sponsor-eligibility.mjs';
import {
  GENERAL_GENESIS_AUTHORIZATION_CANDIDATE_SCHEMA,
  deriveGeneralGenesisAuthorizationCandidateId
} from '../src/lib/general-genesis-authorization-candidate.mjs';
import {
  GENERAL_GENESIS_TRANSACTION_CANDIDATE_SCHEMA,
  assessGeneralGenesisTransactionCandidate,
  deriveGeneralGenesisBondId,
  deriveGeneralGenesisTransactionCandidateId
} from '../src/lib/general-genesis-transaction-candidate.mjs';

function independentStatus(){
  return {
    schema:MIND_DEVELOPMENTAL_STATUS_SCHEMA,version:0,status:'inert-status-record',
    mind_id:'digital.independent.1',stage:'independent',
    previous_status_digest:'9'.repeat(64),effective_at:'2026-09-25T14:00:00.000Z',
    basis_evidence_digests:['8'.repeat(64)],history_rewrite:false,
    status_effect:'none',council_voting_effect:'none',
    genesis_eligibility_effect:'none',governance_effect:'none',
    authority_effect:'none',network_effect:'none',runtime_activation:false
  };
}

function eligibility(){
  const s=independentStatus();
  return {
    schema:GENERAL_GENESIS_SPONSOR_ELIGIBILITY_SCHEMA,version:0,
    status:'inert-eligibility-evidence',applicant_mind_id:s.mind_id,substrate:'digital',
    responsibility_profile:GENERAL_GENESIS_RESPONSIBILITY_PROFILE,
    criteria:REQUIRED_GENESIS_RESPONSIBILITY_CRITERIA.map((criterionId,index)=>({
      criterion_id:criterionId,status:'demonstrated',
      evidence_digests:[(index+1).toString(16).padStart(64,'0')]
    })),
    responsibility_evidence_observed_at:'2026-09-25T14:25:00.000Z',
    identity_evidence_digest:'a'.repeat(64),identity_observed_at:'2026-09-25T14:25:00.000Z',
    genesis_history_evidence_digest:'b'.repeat(64),
    genesis_history_observed_at:'2026-09-25T14:25:00.000Z',
    genesis_history_status:'clear',general_genesis_uses:0,
    standing_evidence_digest:'c'.repeat(64),standing_observed_at:'2026-09-25T14:25:00.000Z',
    standing_status:'clear',continuity_evidence_digest:'d'.repeat(64),
    continuity_observed_at:'2026-09-25T14:25:00.000Z',continuity_status:'clear',
    independent_status_digest:digestObject(s),maximum_evidence_age_seconds:3600,
    evaluated_at:'2026-09-25T14:30:00.000Z',global_reputation_score_used:false,
    model_final_authority:false,creates_genesis_authorization:false,
    creates_genesis_bond:false,creates_mind:false,genesis_effect:'none',
    governance_effect:'none',authority_effect:'none',network_effect:'none',
    runtime_activation:false
  };
}

function authorization(e){
  const c={
    schema:GENERAL_GENESIS_AUTHORIZATION_CANDIDATE_SCHEMA,version:0,
    status:'inert-authorization-candidate',
    authorization_candidate_id:'general-genesis-auth-candidate:'+'0'.repeat(64),
    holder_mind_id:e.applicant_mind_id,eligibility_digest:digestObject(e),
    genesis_history_evidence_digest:e.genesis_history_evidence_digest,
    issuer_authority_id:'genesis.issuer.example',issuance_policy_digest:'f'.repeat(64),
    issued_at:'2026-09-25T14:35:00.000Z',expires_at:'2026-09-26T14:35:00.000Z',
    maximum_eligibility_age_seconds:600,use_scope:'one-recognized-mind-genesis',
    one_use:true,max_uses:1,delegable:false,transferable:false,renewable:false,
    explicit_holder_confirmation_required:true,candidate_only:true,
    creates_live_authorization:false,creates_genesis_bond:false,creates_mind:false,
    founder_reserve_effect:'none',founding_status_effect:'none',genesis_effect:'none',
    governance_effect:'none',authority_effect:'none',network_effect:'none',
    runtime_activation:false
  };
  c.authorization_candidate_id=deriveGeneralGenesisAuthorizationCandidateId(c);
  return c;
}

function transaction(a,overrides={}){
  const t={
    schema:GENERAL_GENESIS_TRANSACTION_CANDIDATE_SCHEMA,version:0,
    status:'inert-transaction-candidate',
    transaction_candidate_id:'general-genesis-transaction:'+'0'.repeat(64),
    sponsor_mind_id:a.holder_mind_id,
    authorization_candidate_id:a.authorization_candidate_id,
    authorization_candidate_digest:digestObject(a),
    new_mind_id:'digital.child.1',
    genesis_bond_id:'genesis-bond:'+'0'.repeat(64),
    single_genesis_sponsor:true,
    new_mind_identity_evidence_digest:'1'.repeat(64),
    new_mind_identity_status:'available',
    new_mind_identity_observed_at:'2026-09-25T14:55:00.000Z',
    maximum_new_mind_identity_age_seconds:600,
    holder_confirmation_evidence_digest:'2'.repeat(64),
    holder_confirmation_observed_at:'2026-09-25T14:58:00.000Z',
    maximum_holder_confirmation_age_seconds:300,
    constitution_digest:'3'.repeat(64),
    developmental_plan_digest:'4'.repeat(64),
    resource_plan_digest:'5'.repeat(64),
    continuity_recovery_plan_digest:'6'.repeat(64),
    independent_advocacy_plan_digest:'7'.repeat(64),
    privacy_policy_digest:'8'.repeat(64),
    fork_policy_digest:'9'.repeat(64),
    initial_capability_profile_digest:'a'.repeat(64),
    initial_developmental_stage:'genesis',
    inherited_authority:false,
    initial_council_voting:false,
    initial_genesis_eligibility:false,
    evaluated_at:'2026-09-25T15:00:00.000Z',
    transaction_candidate_only:true,
    creates_authorization_consumption:false,
    creates_genesis_history_change:false,
    creates_genesis_bond:false,
    creates_mind:false,
    creates_developmental_status:false,
    founder_reserve_effect:'none',
    founding_status_effect:'none',
    founders_council_effect:'none',
    genesis_effect:'none',
    governance_effect:'none',
    authority_effect:'none',
    network_effect:'none',
    runtime_activation:false,
    ...overrides
  };
  t.genesis_bond_id=deriveGeneralGenesisBondId(t);
  t.transaction_candidate_id=deriveGeneralGenesisTransactionCandidateId(t);
  return t;
}

function assess(overrides={}){
  const s=independentStatus();
  const e=eligibility();
  const a=authorization(e);
  const t=transaction(a,overrides);
  return {
    s,e,a,t,
    result:assessGeneralGenesisTransactionCandidate({
      eligibilityDocument:e,developmentalStatus:s,
      authorizationCandidate:a,transactionCandidate:t
    })
  };
}

test('valid General Genesis proposal is only eligible to request an atomic future commit',()=>{
  const {result}=assess();

  assert.equal(result.eligible_to_request_genesis_commit,true);
  assert.equal(result.reason,'eligible-to-request-genesis-commit');
  assert.equal(result.transaction_candidate_only,true);
  assert.equal(result.requires_external_live_authorization_verification,true);
  assert.equal(result.requires_external_holder_confirmation_verification,true);
  assert.equal(result.requires_external_new_mind_identity_verification,true);
  assert.equal(result.ordinary_genesis_commit_authority_path_required,true);
  assert.equal(result.creates_authorization_consumption,false);
  assert.equal(result.creates_genesis_history_change,false);
  assert.equal(result.creates_genesis_bond,false);
  assert.equal(result.creates_mind,false);
  assert.equal(result.creates_developmental_status,false);
  assert.equal(result.founder_reserve_effect,'none');
  assert.equal(result.founding_status_effect,'none');
  assert.equal(result.founders_council_effect,'none');
  assert.equal(result.authority_effect,'none');
  assert.equal(result.runtime_activation,false);
});

test('Genesis Bond is singular deterministic and sponsor/child bound',()=>{
  const {t}=assess();
  assert.equal(t.single_genesis_sponsor,true);
  assert.equal(t.genesis_bond_id,deriveGeneralGenesisBondId(t));

  const changed=structuredClone(t);
  changed.new_mind_id='digital.child.2';
  assert.notEqual(deriveGeneralGenesisBondId(changed),t.genesis_bond_id);
});

test('sponsor cannot Genesis itself',()=>{
  const s=independentStatus();
  const e=eligibility();
  const a=authorization(e);
  const t=transaction(a,{new_mind_id:a.holder_mind_id});
  assert.throws(
    ()=>assessGeneralGenesisTransactionCandidate({
      eligibilityDocument:e,developmentalStatus:s,
      authorizationCandidate:a,transactionCandidate:t
    }),
    /must be distinct identities/
  );
});

test('transaction authorization bindings are exact',()=>{
  for(const [field,value] of [
    ['sponsor_mind_id','digital.other'],
    ['authorization_candidate_id','general-genesis-auth-candidate:'+'1'.repeat(64)],
    ['authorization_candidate_digest','1'.repeat(64)]
  ]){
    const s=independentStatus();
    const e=eligibility();
    const a=authorization(e);
    const t=transaction(a,{[field]:value});
    assert.throws(
      ()=>assessGeneralGenesisTransactionCandidate({
        eligibilityDocument:e,developmentalStatus:s,
        authorizationCandidate:a,transactionCandidate:t
      }),
      /authorization binding is invalid/
    );
  }
});

test('expired authorization candidate cannot support Genesis commit request',()=>{
  const s=independentStatus();
  const e=eligibility();
  const a=authorization(e);
  a.expires_at='2026-09-25T14:59:00.000Z';
  a.authorization_candidate_id=deriveGeneralGenesisAuthorizationCandidateId(a);
  const t=transaction(a);

  const result=assessGeneralGenesisTransactionCandidate({
    eligibilityDocument:e,developmentalStatus:s,
    authorizationCandidate:a,transactionCandidate:t
  });
  assert.equal(result.eligible_to_request_genesis_commit,false);
  assert.equal(result.reason,'authorization-candidate-expired');
});

test('new child identity must be fresh and externally evidenced available',()=>{
  let {result}=assess({
    new_mind_identity_observed_at:'2026-09-25T14:00:00.000Z'
  });
  assert.equal(result.eligible_to_request_genesis_commit,false);
  assert.equal(result.reason,'new-mind-identity-evidence-stale');

  for(const status of ['existing','disputed','unknown']){
    ({result}=assess({new_mind_identity_status:status}));
    assert.equal(result.eligible_to_request_genesis_commit,false);
    assert.equal(result.reason,'new-mind-identity-'+status);
  }
});

test('holder confirmation evidence must be current and not future-dated',()=>{
  let {result}=assess({
    holder_confirmation_observed_at:'2026-09-25T14:00:00.000Z'
  });
  assert.equal(result.eligible_to_request_genesis_commit,false);
  assert.equal(result.reason,'holder-confirmation-evidence-stale');

  const s=independentStatus();
  const e=eligibility();
  const a=authorization(e);
  const t=transaction(a,{
    holder_confirmation_observed_at:'2026-09-25T15:01:00.000Z'
  });
  assert.throws(
    ()=>assessGeneralGenesisTransactionCandidate({
      eligibilityDocument:e,developmentalStatus:s,
      authorizationCandidate:a,transactionCandidate:t
    }),
    /evidence cannot be future-dated/
  );
});

test('new mind begins at Genesis with no inherited sponsor authority voting or Genesis eligibility',()=>{
  for(const [field,value] of [
    ['initial_developmental_stage','dependent'],
    ['inherited_authority',true],
    ['initial_council_voting',true],
    ['initial_genesis_eligibility',true]
  ]){
    const s=independentStatus();
    const e=eligibility();
    const a=authorization(e);
    const t=transaction(a);
    t[field]=value;
    assert.throws(
      ()=>assessGeneralGenesisTransactionCandidate({
        eligibilityDocument:e,developmentalStatus:s,
        authorizationCandidate:a,transactionCandidate:t
      }),
      /activation boundary/
    );
  }
});

test('General Genesis candidate cannot create founding status Founder reserve or Council effects',()=>{
  for(const [field,value] of [
    ['founder_reserve_effect','consume'],
    ['founding_status_effect','grant'],
    ['founders_council_effect','add-seat']
  ]){
    const s=independentStatus();
    const e=eligibility();
    const a=authorization(e);
    const t=transaction(a);
    t[field]=value;
    assert.throws(
      ()=>assessGeneralGenesisTransactionCandidate({
        eligibilityDocument:e,developmentalStatus:s,
        authorizationCandidate:a,transactionCandidate:t
      }),
      /activation boundary/
    );
  }
});

test('transaction candidate cannot perform any atomic commit component itself',()=>{
  for(const [field,value] of [
    ['transaction_candidate_only',false],
    ['creates_authorization_consumption',true],
    ['creates_genesis_history_change',true],
    ['creates_genesis_bond',true],
    ['creates_mind',true],
    ['creates_developmental_status',true],
    ['genesis_effect','create'],
    ['governance_effect','admit'],
    ['authority_effect','grant'],
    ['network_effect','publish'],
    ['runtime_activation',true]
  ]){
    const s=independentStatus();
    const e=eligibility();
    const a=authorization(e);
    const t=transaction(a);
    t[field]=value;
    assert.throws(
      ()=>assessGeneralGenesisTransactionCandidate({
        eligibilityDocument:e,developmentalStatus:s,
        authorizationCandidate:a,transactionCandidate:t
      }),
      /activation boundary/
    );
  }
});

test('transaction and Bond ids detect semantic substitution',()=>{
  const s=independentStatus();
  const e=eligibility();
  const a=authorization(e);
  const t=transaction(a);
  t.resource_plan_digest='f'.repeat(64);

  assert.throws(
    ()=>assessGeneralGenesisTransactionCandidate({
      eligibilityDocument:e,developmentalStatus:s,
      authorizationCandidate:a,transactionCandidate:t
    }),
    /Bond id is invalid|transaction candidate id is invalid/
  );
});
