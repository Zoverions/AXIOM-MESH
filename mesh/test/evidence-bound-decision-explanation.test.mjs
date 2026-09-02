import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { validateDecisionExplanation } from '../src/lib/evidence-bound-decision-explanation.mjs';

const url=new URL('../../agent-commons/examples/evidence-bound-decision-explanation.v1.json',import.meta.url);

test('explanation preserves uncertainty and remains non-authoritative',async()=>{
  const v=JSON.parse(await readFile(url,'utf8'));
  const r=validateDecisionExplanation(v);
  assert.equal(r.valid,true);
  assert.equal(r.outcome,'hold_pending');
  assert.equal(r.authority_effect,'none');
  assert.equal(r.chain_of_thought_included,false);
  assert.deepEqual(v.assurance_summary.unknown_dimensions,['currentness']);
});

test('uncertainty cannot be relabeled as established certainty',async()=>{
  const v=JSON.parse(await readFile(url,'utf8'));
  v.uncertainties[0].certainty='established_for_declared_scope';
  assert.throws(()=>validateDecisionExplanation(v),/uncertainty-compatible/);
});

test('non-success explanation must expose blocking condition or conflict',async()=>{
  const v=JSON.parse(await readFile(url,'utf8'));
  v.required_but_unsatisfied_conditions=[];
  v.conflicts=[];
  assert.throws(()=>validateDecisionExplanation(v),/requires an unsatisfied condition or explicit conflict/);
});

test('presentation cannot include private chain-of-thought or invent reasons',async()=>{
  for(const [field,value] of [
    ['private_chain_of_thought_included',true],
    ['may_hide_uncertainty',true],
    ['may_add_unrecorded_reasons',true]
  ]){
    const v=JSON.parse(await readFile(url,'utf8'));
    v.presentation[field]=value;
    assert.throws(()=>validateDecisionExplanation(v),/must not|may not/);
  }
});

test('explanation and appeal path cannot grant authority or guaranteed success',async()=>{
  for(const field of [
    'explanation_grants_authority','appeal_path_grants_success',
    'human_friendly_wording_changes_decision'
  ]){
    const v=JSON.parse(await readFile(url,'utf8'));
    v.authority[field]=true;
    assert.throws(()=>validateDecisionExplanation(v),new RegExp(field));
  }
});
