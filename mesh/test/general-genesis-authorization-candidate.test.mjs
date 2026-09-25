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
  assessGeneralGenesisAuthorizationCandidate,
  deriveGeneralGenesisAuthorizationCandidateId
} from '../src/lib/general-genesis-authorization-candidate.mjs';

function independentStatus(){
  return {
    schema:MIND_DEVELOPMENTAL_STATUS_SCHEMA,version:0,status:'inert-status-record',
    mind_id:'digital.independent.1',stage:'independent',previous_status_digest:'9'.repeat(64),
    effective_at:'2026-09-25T14:00:00.000Z',basis_evidence_digests:['8'.repeat(64)],
    history_rewrite:false,status_effect:'none',council_voting_effect:'none',
    genesis_eligibility_effect:'none',governance_effect:'none',authority_effect:'none',
    network_effect:'none',runtime_activation:false
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

function candidate(e,overrides={}){
  const raw={
    schema:GENERAL_GENESIS_AUTHORIZATION_CANDIDATE_SCHEMA,version:0,
    status:'inert-authorization-candidate',authorization_candidate_id:
      'general-genesis-auth-candidate:'+'0'.repeat(64),
    holder_mind_id:e.applicant_mind_id,eligibility_digest:digestObject(e),
    genesis_history_evidence_digest:e.genesis_history_evidence_digest,
    issuer_authority_id:'genesis.issuer.example',
    issuance_policy_digest:'f'.repeat(64),issued_at:'2026-09-25T14:35:00.000Z',
    expires_at:'2026-09-26T14:35:00.000Z',maximum_eligibility_age_seconds:600,
    use_scope:'one-recognized-mind-genesis',one_use:true,max_uses:1,
    delegable:false,transferable:false,renewable:false,
    explicit_holder_confirmation_required:true,candidate_only:true,
    creates_live_authorization:false,creates_genesis_bond:false,creates_mind:false,
    founder_reserve_effect:'none',founding_status_effect:'none',genesis_effect:'none',
    governance_effect:'none',authority_effect:'none',network_effect:'none',
    runtime_activation:false,...overrides
  };
  raw.authorization_candidate_id=deriveGeneralGenesisAuthorizationCandidateId(raw);
  return raw;
}

function assess(e=eligibility(),s=independentStatus(),overrides={}){
  const c=candidate(e,overrides);
  return {
    e,s,c,
    result:assessGeneralGenesisAuthorizationCandidate({
      eligibilityDocument:e,developmentalStatus:s,candidate:c
    })
  };
}

test('positive eligibility can produce only an inert one-use authorization candidate',()=>{
  const {result}=assess();

  assert.equal(result.eligible_to_request_authorization_issuance,true);
  assert.equal(result.eligibility_structural_pending_external_verification,true);
  assert.equal(result.candidate_only,true);
  assert.equal(result.requires_external_eligibility_verification,true);
  assert.equal(result.requires_external_issuer_authority_verification,true);
  assert.equal(result.requires_external_holder_confirmation,true);
  assert.equal(result.ordinary_genesis_authority_path_required,true);
  assert.equal(result.creates_live_authorization,false);
  assert.equal(result.creates_genesis_bond,false);
  assert.equal(result.creates_mind,false);
  assert.equal(result.founder_reserve_effect,'none');
  assert.equal(result.founding_status_effect,'none');
  assert.equal(result.authority_effect,'none');
  assert.equal(result.runtime_activation,false);
  assert.equal(result.lifetime_seconds,86400);
});

test('candidate id is deterministic and tamper-evident',()=>{
  const e=eligibility();
  const first=candidate(e);
  const second=candidate(e);
  assert.equal(first.authorization_candidate_id,second.authorization_candidate_id);

  const tampered=structuredClone(first);
  tampered.issuance_policy_digest='1'.repeat(64);
  assert.throws(
    ()=>assessGeneralGenesisAuthorizationCandidate({
      eligibilityDocument:e,developmentalStatus:independentStatus(),candidate:tampered
    }),
    /candidate id is invalid/
  );
});

test('holder eligibility and Genesis-history bindings are exact',()=>{
  const e=eligibility();
  const s=independentStatus();

  for(const [field,value,pattern] of [
    ['holder_mind_id','digital.other',/holder binding is invalid/],
    ['eligibility_digest','1'.repeat(64),/eligibility binding is invalid/],
    ['genesis_history_evidence_digest','1'.repeat(64),/history binding is invalid/]
  ]){
    const c=candidate(e,{[field]:value});
    c.authorization_candidate_id=deriveGeneralGenesisAuthorizationCandidateId(c);
    assert.throws(
      ()=>assessGeneralGenesisAuthorizationCandidate({
        eligibilityDocument:e,developmentalStatus:s,candidate:c
      }),
      pattern
    );
  }
});

test('negative sponsor eligibility cannot become authorization issuance requestability',()=>{
  const e=eligibility();
  e.general_genesis_uses=1;
  const c=candidate(e);
  const result=assessGeneralGenesisAuthorizationCandidate({
    eligibilityDocument:e,developmentalStatus:independentStatus(),candidate:c
  });

  assert.equal(result.eligible_to_request_authorization_issuance,false);
  assert.equal(result.reason,'genesis-sponsor-eligibility-not-satisfied');
  assert.equal(result.creates_live_authorization,false);
});

test('eligibility used for a candidate must be recent and candidate cannot predate it',()=>{
  const e=eligibility();
  let c=candidate(e,{issued_at:'2026-09-25T13:00:00.000Z',expires_at:'2026-09-25T14:00:00.000Z'});
  c.authorization_candidate_id=deriveGeneralGenesisAuthorizationCandidateId(c);
  assert.throws(
    ()=>assessGeneralGenesisAuthorizationCandidate({
      eligibilityDocument:e,developmentalStatus:independentStatus(),candidate:c
    }),
    /cannot predate eligibility/
  );

  c=candidate(e,{
    issued_at:'2026-09-25T15:00:01.000Z',
    expires_at:'2026-09-25T16:00:01.000Z',
    maximum_eligibility_age_seconds:1800
  });
  c.authorization_candidate_id=deriveGeneralGenesisAuthorizationCandidateId(c);
  assert.throws(
    ()=>assessGeneralGenesisAuthorizationCandidate({
      eligibilityDocument:e,developmentalStatus:independentStatus(),candidate:c
    }),
    /eligibility evidence is stale/
  );
});

test('candidate lifetime must be positive and no more than 24 hours',()=>{
  const e=eligibility();

  let c=candidate(e,{expires_at:'2026-09-25T14:35:00.000Z'});
  c.authorization_candidate_id=deriveGeneralGenesisAuthorizationCandidateId(c);
  assert.throws(
    ()=>assessGeneralGenesisAuthorizationCandidate({
      eligibilityDocument:e,developmentalStatus:independentStatus(),candidate:c
    }),
    /expiry must follow issuance/
  );

  c=candidate(e,{expires_at:'2026-09-26T14:35:01.000Z'});
  c.authorization_candidate_id=deriveGeneralGenesisAuthorizationCandidateId(c);
  assert.throws(
    ()=>assessGeneralGenesisAuthorizationCandidate({
      eligibilityDocument:e,developmentalStatus:independentStatus(),candidate:c
    }),
    /lifetime exceeds/
  );
});

test('candidate is exactly one-use non-delegable non-transferable and non-renewable',()=>{
  for(const [field,value] of [
    ['one_use',false],['max_uses',2],['delegable',true],['transferable',true],
    ['renewable',true],['explicit_holder_confirmation_required',false],
    ['use_scope','many-minds']
  ]){
    const e=eligibility();
    const c=candidate(e);
    c[field]=value;
    assert.throws(
      ()=>assessGeneralGenesisAuthorizationCandidate({
        eligibilityDocument:e,developmentalStatus:independentStatus(),candidate:c
      }),
      /activation boundary/
    );
  }
});

test('general candidate cannot affect Founder reserve or founding status',()=>{
  for(const [field,value] of [
    ['founder_reserve_effect','consume'],
    ['founding_status_effect','grant']
  ]){
    const e=eligibility();
    const c=candidate(e);
    c[field]=value;
    assert.throws(
      ()=>assessGeneralGenesisAuthorizationCandidate({
        eligibilityDocument:e,developmentalStatus:independentStatus(),candidate:c
      }),
      /activation boundary/
    );
  }
});

test('candidate cannot create live authorization Bond mind governance network or runtime effects',()=>{
  for(const [field,value] of [
    ['candidate_only',false],
    ['creates_live_authorization',true],
    ['creates_genesis_bond',true],
    ['creates_mind',true],
    ['genesis_effect','create'],
    ['governance_effect','admit'],
    ['authority_effect','grant'],
    ['network_effect','publish'],
    ['runtime_activation',true]
  ]){
    const e=eligibility();
    const c=candidate(e);
    c[field]=value;
    assert.throws(
      ()=>assessGeneralGenesisAuthorizationCandidate({
        eligibilityDocument:e,developmentalStatus:independentStatus(),candidate:c
      }),
      /activation boundary/
    );
  }
});
