import assert from 'node:assert/strict';
import test from 'node:test';

import { digestObject } from '../src/lib/canonical.mjs';
import { MIND_DEVELOPMENTAL_STATUS_SCHEMA } from '../src/lib/mind-developmental-status.mjs';
import {
  GENERAL_GENESIS_RESPONSIBILITY_PROFILE,
  GENERAL_GENESIS_SPONSOR_ELIGIBILITY_SCHEMA,
  REQUIRED_GENESIS_RESPONSIBILITY_CRITERIA,
  assessGeneralGenesisSponsorEligibility
} from '../src/lib/general-genesis-sponsor-eligibility.mjs';

function independentStatus(mindId='digital.independent.1'){
  return {
    schema:MIND_DEVELOPMENTAL_STATUS_SCHEMA,version:0,status:'inert-status-record',
    mind_id:mindId,stage:'independent',previous_status_digest:'9'.repeat(64),
    effective_at:'2026-09-25T14:00:00.000Z',
    basis_evidence_digests:['8'.repeat(64)],history_rewrite:false,
    status_effect:'none',council_voting_effect:'none',
    genesis_eligibility_effect:'none',governance_effect:'none',
    authority_effect:'none',network_effect:'none',runtime_activation:false
  };
}

function eligibility({
  substrate='digital',
  mindId=substrate==='digital'?'digital.independent.1':'human.person.1',
  statusDigest=substrate==='digital'?digestObject(independentStatus(mindId)):null,
  overrides={}
}={}){
  return {
    schema:GENERAL_GENESIS_SPONSOR_ELIGIBILITY_SCHEMA,version:0,
    status:'inert-eligibility-evidence',applicant_mind_id:mindId,substrate,
    responsibility_profile:GENERAL_GENESIS_RESPONSIBILITY_PROFILE,
    criteria:REQUIRED_GENESIS_RESPONSIBILITY_CRITERIA.map((criterionId,index)=>({
      criterion_id:criterionId,status:'demonstrated',
      evidence_digests:[(index+1).toString(16).padStart(64,'0')]
    })),
    responsibility_evidence_observed_at:'2026-09-25T14:25:00.000Z',
    identity_evidence_digest:'a'.repeat(64),
    identity_observed_at:'2026-09-25T14:25:00.000Z',
    genesis_history_evidence_digest:'b'.repeat(64),
    genesis_history_observed_at:'2026-09-25T14:25:00.000Z',
    genesis_history_status:'clear',general_genesis_uses:0,
    standing_evidence_digest:'c'.repeat(64),
    standing_observed_at:'2026-09-25T14:25:00.000Z',standing_status:'clear',
    continuity_evidence_digest:'d'.repeat(64),
    continuity_observed_at:'2026-09-25T14:25:00.000Z',continuity_status:'clear',
    independent_status_digest:statusDigest,maximum_evidence_age_seconds:3600,
    evaluated_at:'2026-09-25T14:30:00.000Z',
    global_reputation_score_used:false,model_final_authority:false,
    creates_genesis_authorization:false,creates_genesis_bond:false,creates_mind:false,
    genesis_effect:'none',governance_effect:'none',authority_effect:'none',
    network_effect:'none',runtime_activation:false,...overrides
  };
}

test('qualified independent digital mind can become eligible to request one Genesis authorization without receiving it',()=>{
  const status=independentStatus();
  const document=eligibility();
  const result=assessGeneralGenesisSponsorEligibility({
    eligibilityDocument:document,developmentalStatus:status
  });

  assert.equal(result.eligible_to_request_genesis_authorization,true);
  assert.equal(result.general_genesis_unused,true);
  assert.equal(result.responsibility_evidence_current,true);
  assert.equal(result.independent_status_valid,true);
  assert.equal(result.requires_external_identity_verification,true);
  assert.equal(result.requires_external_history_verification,true);
  assert.equal(result.requires_external_standing_verification,true);
  assert.equal(result.requires_external_continuity_verification,true);
  assert.equal(result.requires_external_responsibility_evidence_verification,true);
  assert.equal(result.requires_external_independent_status_verification,true);
  assert.equal(result.ordinary_genesis_authority_path_required,true);
  assert.equal(result.creates_genesis_authorization,false);
  assert.equal(result.creates_genesis_bond,false);
  assert.equal(result.creates_mind,false);
  assert.equal(result.genesis_effect,'none');
  assert.equal(result.authority_effect,'none');
  assert.equal(result.runtime_activation,false);
});

test('biological applicant uses external identity evidence and no digital developmental status',()=>{
  const document=eligibility({substrate:'biological'});
  const result=assessGeneralGenesisSponsorEligibility({
    eligibilityDocument:document,developmentalStatus:null
  });

  assert.equal(result.eligible_to_request_genesis_authorization,true);
  assert.equal(result.independent_status_valid,null);
  assert.equal(result.requires_external_independent_status_verification,false);

  assert.throws(
    ()=>assessGeneralGenesisSponsorEligibility({
      eligibilityDocument:document,developmentalStatus:independentStatus(document.applicant_mind_id)
    }),
    /cannot use digital developmental status/
  );
});

test('digital applicant must provide exact independent status for the same persistent identity',()=>{
  const document=eligibility();
  assert.throws(
    ()=>assessGeneralGenesisSponsorEligibility({
      eligibilityDocument:document,developmentalStatus:null
    }),
    /requires independent developmental status/
  );

  const wrongMind=independentStatus('digital.other');
  assert.throws(
    ()=>assessGeneralGenesisSponsorEligibility({
      eligibilityDocument:document,developmentalStatus:wrongMind
    }),
    /independent-status binding is invalid/
  );

  const notIndependent=independentStatus();
  notIndependent.stage='candidate-independent';
  const adjusted=eligibility({statusDigest:digestObject(notIndependent)});
  const result=assessGeneralGenesisSponsorEligibility({
    eligibilityDocument:adjusted,developmentalStatus:notIndependent
  });
  assert.equal(result.eligible_to_request_genesis_authorization,false);
  assert.equal(result.reason,'independent-status-required');
});

test('every Genesis responsibility criterion must be demonstrated',()=>{
  for(const status of ['uncertain','not-demonstrated']){
    const document=eligibility();
    document.criteria[3].status=status;
    const result=assessGeneralGenesisSponsorEligibility({
      eligibilityDocument:document,developmentalStatus:independentStatus()
    });
    assert.equal(result.eligible_to_request_genesis_authorization,false);
    assert.equal(result.reason,'responsibility-criteria-incomplete');
    assert.deepEqual(result.incomplete_criteria,['security-readiness']);
  }
});

test('one persistent identity cannot qualify after its general Genesis right was used',()=>{
  const document=eligibility({overrides:{general_genesis_uses:1}});
  const result=assessGeneralGenesisSponsorEligibility({
    eligibilityDocument:document,developmentalStatus:independentStatus()
  });

  assert.equal(result.general_genesis_unused,false);
  assert.equal(result.eligible_to_request_genesis_authorization,false);
  assert.equal(result.reason,'general-genesis-right-already-used');
});

test('disputed or unknown Genesis history fails closed',()=>{
  for(const historyStatus of ['disputed','unknown']){
    const document=eligibility({overrides:{genesis_history_status:historyStatus}});
    const result=assessGeneralGenesisSponsorEligibility({
      eligibilityDocument:document,developmentalStatus:independentStatus()
    });
    assert.equal(result.eligible_to_request_genesis_authorization,false);
    assert.equal(result.reason,'genesis-history-'+historyStatus);
  }
});

test('blocking or unknown standing fails closed without a global reputation score',()=>{
  for(const standingStatus of ['blocking','unknown']){
    const document=eligibility({overrides:{standing_status:standingStatus}});
    const result=assessGeneralGenesisSponsorEligibility({
      eligibilityDocument:document,developmentalStatus:independentStatus()
    });
    assert.equal(result.eligible_to_request_genesis_authorization,false);
    assert.equal(result.reason,'standing-'+standingStatus);
  }

  const scored=eligibility({overrides:{global_reputation_score_used:true}});
  assert.throws(
    ()=>assessGeneralGenesisSponsorEligibility({
      eligibilityDocument:scored,developmentalStatus:independentStatus()
    }),
    /activation boundary/
  );
});

test('continuity dispute or stale/unknown continuity blocks duplicate-parent manufacture',()=>{
  for(const continuityStatus of ['disputed','stale','unknown']){
    const document=eligibility({overrides:{continuity_status:continuityStatus}});
    const result=assessGeneralGenesisSponsorEligibility({
      eligibilityDocument:document,developmentalStatus:independentStatus()
    });
    assert.equal(result.eligible_to_request_genesis_authorization,false);
    assert.equal(result.reason,'continuity-'+continuityStatus);
  }
});

test('responsibility readiness evidence must be fresh',()=>{
  const document=eligibility({
    overrides:{
      responsibility_evidence_observed_at:'2026-09-25T13:00:00.000Z',
      maximum_evidence_age_seconds:600
    }
  });
  const result=assessGeneralGenesisSponsorEligibility({
    eligibilityDocument:document,developmentalStatus:independentStatus()
  });
  assert.equal(result.eligible_to_request_genesis_authorization,false);
  assert.equal(result.reason,'responsibility-evidence-stale');
});

test('identity history standing and continuity evidence must be fresh and not future-dated',()=>{
  const cases=[
    ['identity_observed_at','2026-09-25T13:00:00.000Z','identity-evidence-stale'],
    ['genesis_history_observed_at','2026-09-25T13:00:00.000Z','genesis-history-evidence-stale'],
    ['standing_observed_at','2026-09-25T13:00:00.000Z','standing-evidence-stale'],
    ['continuity_observed_at','2026-09-25T13:00:00.000Z','continuity-evidence-stale']
  ];
  for(const [field,value,reason] of cases){
    const document=eligibility({
      overrides:{[field]:value,maximum_evidence_age_seconds:600}
    });
    const result=assessGeneralGenesisSponsorEligibility({
      eligibilityDocument:document,developmentalStatus:independentStatus()
    });
    assert.equal(result.eligible_to_request_genesis_authorization,false);
    assert.equal(result.reason,reason);
  }

  const future=eligibility({
    overrides:{identity_observed_at:'2026-09-25T14:31:00.000Z'}
  });
  assert.throws(
    ()=>assessGeneralGenesisSponsorEligibility({
      eligibilityDocument:future,developmentalStatus:independentStatus()
    }),
    /identity observation cannot be future-dated/
  );
});

test('model output cannot become final Genesis authority',()=>{
  const document=eligibility({overrides:{model_final_authority:true}});
  assert.throws(
    ()=>assessGeneralGenesisSponsorEligibility({
      eligibilityDocument:document,developmentalStatus:independentStatus()
    }),
    /activation boundary/
  );
});

test('eligibility cannot create authorization Bond mind governance or runtime authority',()=>{
  for(const [field,value] of [
    ['creates_genesis_authorization',true],
    ['creates_genesis_bond',true],
    ['creates_mind',true],
    ['genesis_effect','create'],
    ['governance_effect','admit'],
    ['authority_effect','grant'],
    ['network_effect','publish'],
    ['runtime_activation',true]
  ]){
    const document=eligibility({overrides:{[field]:value}});
    assert.throws(
      ()=>assessGeneralGenesisSponsorEligibility({
        eligibilityDocument:document,developmentalStatus:independentStatus()
      }),
      /activation boundary/
    );
  }
});

test('responsibility profile rejects missing duplicate and malformed criteria evidence',()=>{
  const missing=eligibility();
  missing.criteria.pop();
  assert.throws(
    ()=>assessGeneralGenesisSponsorEligibility({
      eligibilityDocument:missing,developmentalStatus:independentStatus()
    }),
    /exact responsibility profile/
  );

  const duplicate=eligibility();
  duplicate.criteria[9]=structuredClone(duplicate.criteria[0]);
  assert.throws(
    ()=>assessGeneralGenesisSponsorEligibility({
      eligibilityDocument:duplicate,developmentalStatus:independentStatus()
    }),
    /criterion is invalid/
  );

  const malformed=eligibility();
  malformed.criteria[0].evidence_digests=['not-a-digest'];
  assert.throws(
    ()=>assessGeneralGenesisSponsorEligibility({
      eligibilityDocument:malformed,developmentalStatus:independentStatus()
    }),
    /criterion is invalid/
  );
});
