import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { validateRetrospectiveReassessment } from '../src/lib/retrospective-reassessment.mjs';

const corroboratedUrl=new URL('../../agent-commons/examples/retrospective-reassessment.v1.json',import.meta.url);
const correctionUrl=new URL('../../agent-commons/examples/retrospective-correction.v1.json',import.meta.url);

test('later independent verification cannot rewrite assurance at execution',async()=>{
  const v=JSON.parse(await readFile(corroboratedUrl,'utf8'));
  const r=validateRetrospectiveReassessment(v);
  assert.equal(r.valid,true);
  assert.equal(r.outcome,'corroborated');
  assert.equal(r.historical_rewrite,false);
  assert.equal(r.authority_effect,'none');
  assert.equal(v.assurance_at_execution.independent_verification,'unknown');
  assert.equal(v.review_assurance.independent_verification,'achieved');
});

test('correction supersedes by link rather than deletion',async()=>{
  const v=JSON.parse(await readFile(correctionUrl,'utf8'));
  const r=validateRetrospectiveReassessment(v);
  assert.equal(r.outcome,'superseded_by_correction');
  assert.equal(r.challenge_status,'superseded');
  assert.ok(v.superseding_or_corrective_links.length>0);
  assert.equal(r.historical_rewrite,false);
});

test('superseded correction requires explicit successor link',async()=>{
  const v=JSON.parse(await readFile(correctionUrl,'utf8'));
  v.superseding_or_corrective_links=[];
  assert.throws(()=>validateRetrospectiveReassessment(v),/requires a linked corrective record/);
});

test('review cannot mint runtime authority or erase original evidence',async()=>{
  for(const field of [
    'reassessment_grants_runtime_authority',
    'reassessment_rewrites_original_assurance',
    'reviewer_may_delete_original_event'
  ]){
    const v=JSON.parse(await readFile(corroboratedUrl,'utf8'));
    v.authority[field]=true;
    assert.throws(()=>validateRetrospectiveReassessment(v),/cannot/);
  }
});

test('invalid outcomes and challenge states fail closed',async()=>{
  const v=JSON.parse(await readFile(corroboratedUrl,'utf8'));
  v.outcome='made_up_result';
  assert.throws(()=>validateRetrospectiveReassessment(v),/outcome is invalid/);

  const w=JSON.parse(await readFile(corroboratedUrl,'utf8'));
  w.challenge_status='silent_final';
  assert.throws(()=>validateRetrospectiveReassessment(w),/challenge_status is invalid/);
});
