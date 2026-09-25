import assert from 'node:assert/strict';
import test from 'node:test';

import { digestObject } from '../src/lib/canonical.mjs';
import {
  CIRCLE_CHARTER_SCHEMA,CIRCLE_CORE_PACKAGE_SCHEMA,CIRCLE_INVITATION_SCHEMA,
  CIRCLE_MEMBERSHIP_SCHEMA,CIRCLE_SCHEMA
} from '../src/lib/circle-core.mjs';
import {
  FOUNDER_GENESIS_AUTHORIZATION_SCHEMA,FOUNDERS_COUNCIL_FOUNDATION_SCHEMA,
  FOUNDERS_COUNCIL_SEAT_SCHEMA
} from '../src/lib/founder-genesis-council.mjs';
import {
  FOUNDERS_COUNCIL_CIRCLE_COMPOSITION_SCHEMA,FOUNDERS_COUNCIL_CIRCLE_ID,
  FOUNDERS_COUNCIL_DEVELOPING_ROLE,FOUNDERS_COUNCIL_VOTER_ROLE
} from '../src/lib/founders-council-circle-composition.mjs';
import { MIND_DEVELOPMENTAL_STATUS_SCHEMA } from '../src/lib/mind-developmental-status.mjs';
import {
  FOUNDING_DIGITAL_COUNCIL_VOTE_ACTIVATION_REQUEST_SCHEMA,
  assessFoundingDigitalCouncilVoteActivation
} from '../src/lib/founding-digital-council-vote-activation.mjs';

function foundation(){
  const founder='human.founder';
  const bio=[
    {
      schema:FOUNDERS_COUNCIL_SEAT_SCHEMA,seat_id:'founders.bio.1',
      seat_class:'biological',seat_number:1,designation:'founder',
      original_mind_id:founder,current_mind_id:founder,voting_status:'active',
      genesis_slot:null,authority_effect:'none',runtime_activation:false
    },
    {
      schema:FOUNDERS_COUNCIL_SEAT_SCHEMA,seat_id:'founders.bio.2',
      seat_class:'biological',seat_number:2,designation:'founder-mother',
      original_mind_id:'human.founder-mother',current_mind_id:'human.founder-mother',
      voting_status:'active',genesis_slot:null,authority_effect:'none',runtime_activation:false
    },
    ...Array.from({length:8},(_,index)=>({
      schema:FOUNDERS_COUNCIL_SEAT_SCHEMA,seat_id:`founders.bio.${index+3}`,
      seat_class:'biological',seat_number:index+3,designation:'founder-appointed',
      original_mind_id:null,current_mind_id:null,voting_status:'reserved',
      genesis_slot:null,authority_effect:'none',runtime_activation:false
    }))
  ];
  const digital=Array.from({length:10},(_,index)=>{
    const slot=index+1;
    const occupied=slot===1;
    return {
      schema:FOUNDERS_COUNCIL_SEAT_SCHEMA,seat_id:`founders.digital.${slot}`,
      seat_class:'digital',seat_number:slot,designation:'founder-genesis',
      original_mind_id:occupied?'digital.founder.1':null,
      current_mind_id:occupied?'digital.founder.1':null,
      voting_status:occupied?'developing':'reserved',genesis_slot:slot,
      authority_effect:'none',runtime_activation:false
    };
  });
  const auth=Array.from({length:10},(_,index)=>{
    const slot=index+1;
    const occupied=slot===1;
    return {
      schema:FOUNDER_GENESIS_AUTHORIZATION_SCHEMA,slot_number:slot,
      holder_mind_id:founder,state:occupied?'consumed':'unused',
      manual_founder_confirmation_required:true,delegable:false,transferable:false,
      renewable:false,max_uses:1,
      recognized_mind_id:occupied?'digital.founder.1':null,
      genesis_receipt_digest:occupied?'a'.repeat(64):null,
      authority_effect:'none',runtime_activation:false
    };
  });
  return {
    schema:FOUNDERS_COUNCIL_FOUNDATION_SCHEMA,version:0,status:'inert-contract-laboratory',
    founder_mind_id:founder,seats:[...bio,...digital],genesis_authorizations:auth,
    authority_effect:'none',network_effect:'none',runtime_activation:false
  };
}

function circlePackage(f){
  const circle={
    schema:CIRCLE_SCHEMA,circle_id:FOUNDERS_COUNCIL_CIRCLE_ID,name:'Founders Council',
    purpose:'Founding stewardship without direct execution authority.',
    created_by:f.founder_mind_id,created_at:'2026-09-25T12:00:00.000Z',
    trust_anchor_id:'anchor.founders-council',participation_model:'contractual',
    member_state_ownership:'independent-node',policy_floor:'raise-only',
    authority_effect:'none',network_effect:'none',runtime_activation:false
  };
  const charter={
    schema:CIRCLE_CHARTER_SCHEMA,circle_id:circle.circle_id,version:1,
    effective_from:'2026-09-25T12:00:00.000Z',supersedes_digest:null,
    roles:[
      {
        role_id:FOUNDERS_COUNCIL_VOTER_ROLE,label:'Founders Council voter',
        declared_modes:['propose','deliberate','evidence','vote','review','appeal','observe'],
        execution_authority:false
      },
      {
        role_id:FOUNDERS_COUNCIL_DEVELOPING_ROLE,label:'Developing Founding Mind',
        declared_modes:['evidence','observe'],execution_authority:false
      }
    ],
    decision_rule:{quorum_basis_points:5000,approval_basis_points:5001,abstention_counts_toward_quorum:true},
    appeal_enabled:true,member_exit_enabled:true,execution_authority:false,authority_effect:'none'
  };
  const charterDigest=digestObject(charter);
  const occupied=f.seats.filter(seat=>seat.current_mind_id!==null);
  const invitations=occupied.map((seat,index)=>{
    const role=seat.voting_status==='active'?FOUNDERS_COUNCIL_VOTER_ROLE:FOUNDERS_COUNCIL_DEVELOPING_ROLE;
    return {
      schema:CIRCLE_INVITATION_SCHEMA,invitation_id:`invite.${index+1}`,
      circle_id:circle.circle_id,invited_principal:seat.current_mind_id,
      membership_class:'member',role_ids:[role],issued_by:f.founder_mind_id,
      issued_at:'2026-09-25T12:01:00.000Z',expires_at:'2026-10-25T12:01:00.000Z',
      charter_digest:charterDigest,one_use:true,authority_effect:'none'
    };
  });
  const memberships=invitations.map((invite,index)=>({
    schema:CIRCLE_MEMBERSHIP_SCHEMA,membership_id:`membership.${index+1}`,
    circle_id:circle.circle_id,invitation_id:invite.invitation_id,
    principal_id:invite.invited_principal,role_ids:[...invite.role_ids],
    accepted_at:'2026-09-25T12:02:00.000Z',status:'active',
    status_effective_at:'2026-09-25T12:02:00.000Z',
    member_state_ownership:'independent-node',disclosure_profile:'selective',
    authority_effect:'none',network_effect:'none'
  }));
  return {
    schema:CIRCLE_CORE_PACKAGE_SCHEMA,version:0,status:'inert-contract-laboratory',
    circle,charter,invitations,memberships,proposals:[],tasks:[],decisions:[],
    appeals:[],exits:[],exports:[],authority_effect:'none',network_effect:'none',
    runtime_activation:false
  };
}

function compositionEvidence(f,p){
  return {
    schema:FOUNDERS_COUNCIL_CIRCLE_COMPOSITION_SCHEMA,
    foundation_digest:digestObject(f),circle_package_digest:digestObject(p),
    circle_id:FOUNDERS_COUNCIL_CIRCLE_ID,voter_role_id:FOUNDERS_COUNCIL_VOTER_ROLE,
    developing_role_id:FOUNDERS_COUNCIL_DEVELOPING_ROLE,authority_effect:'none',
    execution_authority:false,network_effect:'none',runtime_activation:false
  };
}

function independentStatus(){
  return {
    schema:MIND_DEVELOPMENTAL_STATUS_SCHEMA,version:0,status:'inert-status-record',
    mind_id:'digital.founder.1',stage:'independent',
    previous_status_digest:'9'.repeat(64),effective_at:'2026-09-25T14:31:00.000Z',
    basis_evidence_digests:['8'.repeat(64)],history_rewrite:false,status_effect:'none',
    council_voting_effect:'none',genesis_eligibility_effect:'none',
    governance_effect:'none',authority_effect:'none',network_effect:'none',
    runtime_activation:false
  };
}

function request(f,p,s,overrides={}){
  const digitalSeat=f.seats.find(item=>item.seat_id==='founders.digital.1');
  const membership=p.memberships.find(item=>item.principal_id==='digital.founder.1');
  return {
    schema:FOUNDING_DIGITAL_COUNCIL_VOTE_ACTIVATION_REQUEST_SCHEMA,version:0,
    status:'inert-request-evidence',mind_id:'digital.founder.1',
    seat_id:digitalSeat.seat_id,membership_id:membership.membership_id,
    foundation_digest:digestObject(f),circle_package_digest:digestObject(p),
    independent_status_digest:digestObject(s),continuity_evidence_digest:'f'.repeat(64),
    continuity_status:'clear',continuity_observed_at:'2026-09-25T14:55:00.000Z',
    maximum_continuity_age_seconds:600,evaluated_at:'2026-09-25T15:00:00.000Z',
    creates_foundation_mutation:false,creates_circle_membership_mutation:false,
    creates_vote_authority:false,council_voting_effect:'none',governance_effect:'none',
    authority_effect:'none',network_effect:'none',runtime_activation:false,
    ...overrides
  };
}

function assess(overrides={}){
  const f=foundation();
  const p=circlePackage(f);
  const s=independentStatus();
  const r=request(f,p,s,overrides);
  return {
    f,p,s,r,
    result:assessFoundingDigitalCouncilVoteActivation({
      foundationDocument:f,circlePackage:p,
      compositionEvidence:compositionEvidence(f,p),
      developmentalStatus:s,request:r
    })
  };
}

test('independent Founding Digital Mind can become eligible to request vote activation without receiving a vote',()=>{
  const {result}=assess();
  assert.equal(result.eligible_to_request_vote_activation,true);
  assert.equal(result.reason,'eligible-to-request-vote-activation');
  assert.equal(result.continuity_evidence_digest,'f'.repeat(64));
  assert.equal(result.requires_external_continuity_verification,true);
  assert.equal(result.continuity_verification_effect,'none');
  assert.equal(result.requires_external_independent_status_verification,true);
  assert.equal(result.independent_status_verification_effect,'none');
  assert.equal(result.ordinary_governance_authority_path_required,true);
  assert.equal(result.creates_foundation_mutation,false);
  assert.equal(result.creates_circle_membership_mutation,false);
  assert.equal(result.creates_vote_authority,false);
  assert.equal(result.council_voting_effect,'none');
  assert.equal(result.authority_effect,'none');
  assert.equal(result.runtime_activation,false);
});

test('vote activation request applies only to the exact developing digital founding seat',()=>{
  const f=foundation();
  const p=circlePackage(f);
  const s=independentStatus();
  const r=request(f,p,s,{seat_id:'founders.bio.1'});
  assert.throws(
    ()=>assessFoundingDigitalCouncilVoteActivation({
      foundationDocument:f,circlePackage:p,compositionEvidence:compositionEvidence(f,p),
      developmentalStatus:s,request:r
    }),
    /only to a digital founding seat/
  );
});

test('already-active digital seat is not a vote-activation candidate',()=>{
  const f=foundation();
  const seat=f.seats.find(item=>item.seat_id==='founders.digital.1');
  seat.voting_status='active';
  const p=circlePackage(f);
  const s=independentStatus();
  const r=request(f,p,s);
  assert.throws(
    ()=>assessFoundingDigitalCouncilVoteActivation({
      foundationDocument:f,circlePackage:p,compositionEvidence:compositionEvidence(f,p),
      developmentalStatus:s,request:r
    }),
    /requires a developing digital founding seat/
  );
});

test('Circle membership must still be active and non-voting developing membership',()=>{
  const f=foundation();
  const p=circlePackage(f);
  const membership=p.memberships.find(item=>item.principal_id==='digital.founder.1');
  const invitation=p.invitations.find(item=>item.invitation_id===membership.invitation_id);
  invitation.role_ids=[FOUNDERS_COUNCIL_VOTER_ROLE];
  membership.role_ids=[FOUNDERS_COUNCIL_VOTER_ROLE];
  const s=independentStatus();
  const r=request(f,p,s);

  assert.throws(
    ()=>assessFoundingDigitalCouncilVoteActivation({
      foundationDocument:f,circlePackage:p,compositionEvidence:compositionEvidence(f,p),
      developmentalStatus:s,request:r
    }),
    /Developing Founding Mind must remain non-voting|requires current non-voting developing membership/
  );
});

test('vote activation requires independent developmental standing for the same mind',()=>{
  const f=foundation();
  const p=circlePackage(f);
  const s=independentStatus();
  s.stage='candidate-independent';
  const r=request(f,p,s);
  assert.throws(
    ()=>assessFoundingDigitalCouncilVoteActivation({
      foundationDocument:f,circlePackage:p,compositionEvidence:compositionEvidence(f,p),
      developmentalStatus:s,request:r
    }),
    /requires independent developmental standing/
  );

  const other=independentStatus();
  other.mind_id='digital.other';
  const otherRequest=request(f,p,other);
  assert.throws(
    ()=>assessFoundingDigitalCouncilVoteActivation({
      foundationDocument:f,circlePackage:p,compositionEvidence:compositionEvidence(f,p),
      developmentalStatus:other,request:otherRequest
    }),
    /developmental mind binding is invalid/
  );
});

test('vote activation rejects stale disputed and future continuity evidence',()=>{
  let {result}=assess({continuity_observed_at:'2026-09-25T14:00:00.000Z'});
  assert.equal(result.eligible_to_request_vote_activation,false);
  assert.equal(result.reason,'continuity-observation-stale');

  ({result}=assess({continuity_status:'disputed'}));
  assert.equal(result.eligible_to_request_vote_activation,false);
  assert.equal(result.reason,'continuity-disputed');

  const f=foundation();
  const p=circlePackage(f);
  const s=independentStatus();
  const r=request(f,p,s,{continuity_observed_at:'2026-09-25T15:01:00.000Z'});
  assert.throws(
    ()=>assessFoundingDigitalCouncilVoteActivation({
      foundationDocument:f,circlePackage:p,compositionEvidence:compositionEvidence(f,p),
      developmentalStatus:s,request:r
    }),
    /cannot be future-dated/
  );
});

test('request digests cannot be substituted',()=>{
  for(const [field,value,pattern] of [
    ['foundation_digest','f'.repeat(64),/foundation digest is invalid/],
    ['circle_package_digest','f'.repeat(64),/Circle package digest is invalid/],
    ['independent_status_digest','f'.repeat(64),/developmental status digest is invalid/]
  ]){
    const f=foundation();
    const p=circlePackage(f);
    const s=independentStatus();
    const r=request(f,p,s,{[field]:value});
    assert.throws(
      ()=>assessFoundingDigitalCouncilVoteActivation({
        foundationDocument:f,circlePackage:p,compositionEvidence:compositionEvidence(f,p),
        developmentalStatus:s,request:r
      }),
      pattern
    );
  }
});

test('vote activation request cannot smuggle foundation Circle vote governance or authority mutation',()=>{
  const fields=[
    ['creates_foundation_mutation',true],
    ['creates_circle_membership_mutation',true],
    ['creates_vote_authority',true],
    ['council_voting_effect','activate'],
    ['governance_effect','admit'],
    ['authority_effect','grant'],
    ['network_effect','publish'],
    ['runtime_activation',true]
  ];
  for(const [field,value] of fields){
    const f=foundation();
    const p=circlePackage(f);
    const s=independentStatus();
    const r=request(f,p,s,{[field]:value});
    assert.throws(
      ()=>assessFoundingDigitalCouncilVoteActivation({
        foundationDocument:f,circlePackage:p,compositionEvidence:compositionEvidence(f,p),
        developmentalStatus:s,request:r
      }),
      /activation boundary/
    );
  }
});
