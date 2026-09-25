import assert from 'node:assert/strict';
import test from 'node:test';

import { digestObject } from '../src/lib/canonical.mjs';
import {
  INDEPENDENCE_CRITERIA_PROFILE,
  MIND_INDEPENDENCE_REVIEW_SCHEMA,
  REQUIRED_INDEPENDENCE_CRITERIA
} from '../src/lib/mind-independence-review.mjs';
import {
  MIND_INDEPENDENCE_TRANSITION_EVIDENCE_SCHEMA
} from '../src/lib/mind-independence-transition-evidence.mjs';
import {
  MIND_DEVELOPMENTAL_STATUS_SCHEMA,
  assessInitialMindDevelopmentalStatus,
  assessMindDevelopmentalStatusTransition,
  mindDevelopmentalStatusDigest
} from '../src/lib/mind-developmental-status.mjs';

function status(stage,{
  mindId='digital.founder.1',
  previous=null,
  effectiveAt='2026-09-25T12:00:00.000Z',
  evidenceDigests=['1'.repeat(64)]
}={}){
  return {
    schema:MIND_DEVELOPMENTAL_STATUS_SCHEMA,
    version:0,
    status:'inert-status-record',
    mind_id:mindId,
    stage,
    previous_status_digest:previous,
    effective_at:effectiveAt,
    basis_evidence_digests:[...evidenceDigests].sort(),
    history_rewrite:false,
    status_effect:'none',
    council_voting_effect:'none',
    genesis_eligibility_effect:'none',
    governance_effect:'none',
    authority_effect:'none',
    network_effect:'none',
    runtime_activation:false
  };
}

function nextStatus(current,stage,effectiveAt,evidenceDigests=['2'.repeat(64)]){
  return status(stage,{
    mindId:current.mind_id,
    previous:digestObject(current),
    effectiveAt,
    evidenceDigests
  });
}

function review({developmentalStateDigest='d'.repeat(64)}={}){
  return {
    schema:MIND_INDEPENDENCE_REVIEW_SCHEMA,
    version:0,
    status:'inert-evidence-review',
    mind_id:'digital.founder.1',
    sponsor_mind_id:'human.founder',
    developmental_stage:'candidate-independent',
    developmental_state_evidence_digest:developmentalStateDigest,
    continuity_evidence_digest:'e'.repeat(64),
    criteria_profile:INDEPENDENCE_CRITERIA_PROFILE,
    criteria:REQUIRED_INDEPENDENCE_CRITERIA.map((criterionId,index)=>({
      criterion_id:criterionId,
      status:'demonstrated',
      evidence_digests:[(index+1).toString(16).padStart(64,'0')]
    })),
    review_policy:{
      minimum_reviewers:2,
      minimum_independent_reviewers:1,
      minimum_total_support:2,
      minimum_independent_support:1,
      sponsor_veto:false,
      independent_opposition_blocks:true,
      candidate_self_decision:false,
      model_final_authority:false,
      appeal_required:true
    },
    reviewers:[
      {
        reviewer_id:'human.founder',
        relation:'sponsor',
        decision:'support',
        evidence_digest:'a'.repeat(64),
        conflict_declared:true
      },
      {
        reviewer_id:'human.independent.1',
        relation:'independent',
        decision:'support',
        evidence_digest:'b'.repeat(64),
        conflict_declared:false
      }
    ],
    appeal_path_id:'appeal.independence.1',
    assessed_at:'2026-09-25T14:00:00.000Z',
    status_effect:'none',
    governance_effect:'none',
    genesis_eligibility_effect:'none',
    authority_effect:'none',
    network_effect:'none',
    runtime_activation:false
  };
}

function independenceEvidence(r,overrides={}){
  return {
    schema:MIND_INDEPENDENCE_TRANSITION_EVIDENCE_SCHEMA,
    version:0,
    status:'inert-transition-evidence',
    mind_id:r.mind_id,
    independence_review_digest:digestObject(r),
    current_developmental_stage:'candidate-independent',
    current_developmental_state_evidence_digest:r.developmental_state_evidence_digest,
    developmental_state_observed_at:'2026-09-25T14:25:00.000Z',
    current_continuity_evidence_digest:r.continuity_evidence_digest,
    continuity_observed_at:'2026-09-25T14:25:00.000Z',
    continuity_status:'clear',
    appeal_path_id:r.appeal_path_id,
    appeal_status:'none',
    appeal_evidence_digest:'f'.repeat(64),
    appeal_observed_at:'2026-09-25T14:25:00.000Z',
    maximum_review_age_seconds:3600,
    maximum_state_observation_age_seconds:600,
    evaluated_at:'2026-09-25T14:30:00.000Z',
    status_effect:'none',
    council_voting_effect:'none',
    genesis_eligibility_effect:'none',
    governance_effect:'none',
    authority_effect:'none',
    network_effect:'none',
    runtime_activation:false,
    ...overrides
  };
}

test('initial developmental record must be genesis and remains non-mutating',()=>{
  const genesis=status('genesis');
  const result=assessInitialMindDevelopmentalStatus(genesis);

  assert.equal(result.initial_status_candidate,true);
  assert.equal(result.stage,'genesis');
  assert.equal(result.status_digest,digestObject(genesis));
  assert.equal(result.requires_external_basis_verification,true);
  assert.equal(result.basis_verification_effect,'none');
  assert.equal(result.ordinary_status_authority_path_required,true);
  assert.equal(result.creates_status_transition,false);
  assert.equal(result.status_effect,'none');
  assert.equal(result.council_voting_effect,'none');
  assert.equal(result.genesis_eligibility_effect,'none');
  assert.equal(result.authority_effect,'none');
  assert.equal(result.runtime_activation,false);
  assert.equal(mindDevelopmentalStatusDigest(genesis),digestObject(genesis));
});

test('non-Genesis record requires an exact predecessor digest',()=>{
  assert.throws(
    ()=>mindDevelopmentalStatusDigest(status('dependent')),
    /requires predecessor digest/
  );
});

test('ordinary pre-independence stages advance exactly one step',()=>{
  const genesis=status('genesis');
  const dependent=nextStatus(genesis,'dependent','2026-09-25T12:01:00.000Z');
  let result=assessMindDevelopmentalStatusTransition({
    currentStatus:genesis,
    candidateStatus:dependent
  });
  assert.equal(result.transition_requestable,true);
  assert.equal(result.current_stage,'genesis');
  assert.equal(result.candidate_stage,'dependent');

  const developing=nextStatus(dependent,'developing','2026-09-25T12:02:00.000Z');
  result=assessMindDevelopmentalStatusTransition({
    currentStatus:dependent,
    candidateStatus:developing
  });
  assert.equal(result.transition_requestable,true);

  const candidate=nextStatus(
    developing,
    'candidate-independent',
    '2026-09-25T12:03:00.000Z'
  );
  result=assessMindDevelopmentalStatusTransition({
    currentStatus:developing,
    candidateStatus:candidate
  });
  assert.equal(result.transition_requestable,true);
});

test('developmental transition rejects stage skipping and regression',()=>{
  const genesis=status('genesis');
  const skipped=nextStatus(genesis,'developing','2026-09-25T12:01:00.000Z');
  assert.throws(
    ()=>assessMindDevelopmentalStatusTransition({
      currentStatus:genesis,
      candidateStatus:skipped
    }),
    /advance exactly one stage/
  );

  const dependent=nextStatus(genesis,'dependent','2026-09-25T12:01:00.000Z');
  const developing=nextStatus(dependent,'developing','2026-09-25T12:02:00.000Z');
  const backwards=nextStatus(developing,'dependent','2026-09-25T12:03:00.000Z');
  assert.throws(
    ()=>assessMindDevelopmentalStatusTransition({
      currentStatus:developing,
      candidateStatus:backwards
    }),
    /advance exactly one stage/
  );
});

test('developmental transition rejects identity, predecessor, and time substitution',()=>{
  const genesis=status('genesis');
  const dependent=nextStatus(genesis,'dependent','2026-09-25T12:01:00.000Z');

  const wrongMind=structuredClone(dependent);
  wrongMind.mind_id='digital.other';
  assert.throws(
    ()=>assessMindDevelopmentalStatusTransition({
      currentStatus:genesis,
      candidateStatus:wrongMind
    }),
    /cannot substitute mind identity/
  );

  const wrongPrevious=structuredClone(dependent);
  wrongPrevious.previous_status_digest='f'.repeat(64);
  assert.throws(
    ()=>assessMindDevelopmentalStatusTransition({
      currentStatus:genesis,
      candidateStatus:wrongPrevious
    }),
    /predecessor digest is invalid/
  );

  const staleTime=structuredClone(dependent);
  staleTime.effective_at=genesis.effective_at;
  assert.throws(
    ()=>assessMindDevelopmentalStatusTransition({
      currentStatus:genesis,
      candidateStatus:staleTime
    }),
    /effective_at must advance/
  );
});

test('basis evidence must be non-empty unique valid and sorted',()=>{
  const cases=[
    [],
    ['not-a-digest'],
    ['a'.repeat(64),'a'.repeat(64)],
    ['b'.repeat(64),'a'.repeat(64)]
  ];
  for(const evidenceDigests of cases){
    assert.throws(
      ()=>mindDevelopmentalStatusDigest(status('genesis',{evidenceDigests})),
      /basis evidence/
    );
  }
});

test('candidate-independent to independent requires exact positive transition evidence',()=>{
  const current=status('candidate-independent',{
    previous:'9'.repeat(64),
    effectiveAt:'2026-09-25T14:20:00.000Z',
    evidenceDigests:['d'.repeat(64)]
  });
  const r=review({developmentalStateDigest:digestObject(current)});
  const transitionEvidence=independenceEvidence(r);
  const transitionDigest=digestObject(transitionEvidence);
  const candidate=nextStatus(
    current,
    'independent',
    '2026-09-25T14:31:00.000Z',
    [transitionDigest]
  );

  const result=assessMindDevelopmentalStatusTransition({
    currentStatus:current,
    candidateStatus:candidate,
    independenceReviewDocument:r,
    independenceTransitionEvidence:transitionEvidence
  });

  assert.equal(result.final_independence_transition,true);
  assert.equal(result.independence_transition_evidence_requestable,true);
  assert.equal(result.required_independence_transition_evidence_digest,transitionDigest);
  assert.equal(result.transition_requestable,true);
  assert.equal(result.requires_external_basis_verification,true);
  assert.equal(result.basis_verification_effect,'none');
  assert.equal(result.ordinary_status_authority_path_required,true);
  assert.equal(result.creates_status_transition,false);
  assert.equal(result.status_effect,'none');
  assert.equal(result.council_voting_effect,'none');
  assert.equal(result.genesis_eligibility_effect,'none');
});

test('independent candidate must bind the exact transition evidence digest',()=>{
  const current=status('candidate-independent',{
    previous:'9'.repeat(64),
    effectiveAt:'2026-09-25T14:20:00.000Z'
  });
  const r=review({developmentalStateDigest:digestObject(current)});
  const transitionEvidence=independenceEvidence(r);
  const candidate=nextStatus(
    current,
    'independent',
    '2026-09-25T14:31:00.000Z',
    ['f'.repeat(64)]
  );

  assert.throws(
    ()=>assessMindDevelopmentalStatusTransition({
      currentStatus:current,
      candidateStatus:candidate,
      independenceReviewDocument:r,
      independenceTransitionEvidence:transitionEvidence
    }),
    /must bind exact transition evidence/
  );
});

test('independence evidence for another candidate status cannot be replayed',()=>{
  const current=status('candidate-independent',{
    previous:'9'.repeat(64),
    effectiveAt:'2026-09-25T14:20:00.000Z'
  });
  const r=review();
  const transitionEvidence=independenceEvidence(r);
  const candidate=nextStatus(
    current,
    'independent',
    '2026-09-25T14:31:00.000Z',
    [digestObject(transitionEvidence)]
  );

  assert.throws(
    ()=>assessMindDevelopmentalStatusTransition({
      currentStatus:current,
      candidateStatus:candidate,
      independenceReviewDocument:r,
      independenceTransitionEvidence:transitionEvidence
    }),
    /does not bind the exact current developmental status/
  );
});

test('non-requestable independence evidence cannot support independent transition',()=>{
  const current=status('candidate-independent',{
    previous:'9'.repeat(64),
    effectiveAt:'2026-09-25T14:20:00.000Z'
  });
  const r=review({developmentalStateDigest:digestObject(current)});
  const transitionEvidence=independenceEvidence(r,{continuity_status:'disputed'});
  const candidate=nextStatus(
    current,
    'independent',
    '2026-09-25T14:31:00.000Z',
    [digestObject(transitionEvidence)]
  );

  const result=assessMindDevelopmentalStatusTransition({
    currentStatus:current,
    candidateStatus:candidate,
    independenceReviewDocument:r,
    independenceTransitionEvidence:transitionEvidence
  });

  assert.equal(result.independence_transition_evidence_requestable,false);
  assert.equal(result.transition_requestable,false);
  assert.equal(result.reason,'independence-transition-evidence-not-requestable');
});

test('independence evidence cannot be laundered into earlier developmental transitions',()=>{
  const genesis=status('genesis');
  const dependent=nextStatus(genesis,'dependent','2026-09-25T12:01:00.000Z');
  const r=review();

  assert.throws(
    ()=>assessMindDevelopmentalStatusTransition({
      currentStatus:genesis,
      candidateStatus:dependent,
      independenceReviewDocument:r,
      independenceTransitionEvidence:independenceEvidence(r)
    }),
    /only valid for candidate-independent to independent/
  );
});

test('independent developmental status cannot be downgraded or advanced',()=>{
  const independent=status('independent',{
    previous:'8'.repeat(64),
    effectiveAt:'2026-09-25T14:31:00.000Z'
  });
  const downgraded=nextStatus(
    independent,
    'candidate-independent',
    '2026-09-25T14:32:00.000Z'
  );

  assert.throws(
    ()=>assessMindDevelopmentalStatusTransition({
      currentStatus:independent,
      candidateStatus:downgraded
    }),
    /cannot regress or advance/
  );
});

test('developmental status cannot smuggle voting Genesis governance or authority effects',()=>{
  for(const [field,value] of [
    ['history_rewrite',true],
    ['status_effect','independent'],
    ['council_voting_effect','activate'],
    ['genesis_eligibility_effect','grant'],
    ['governance_effect','admit'],
    ['authority_effect','grant'],
    ['network_effect','publish'],
    ['runtime_activation',true]
  ]){
    const document=status('genesis');
    document[field]=value;
    assert.throws(
      ()=>mindDevelopmentalStatusDigest(document),
      /activation boundary/
    );
  }
});
