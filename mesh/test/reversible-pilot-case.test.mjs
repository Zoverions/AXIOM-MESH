import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { validateReversiblePilotCase } from '../src/lib/reversible-pilot-case.mjs';

const url=new URL('../../agent-commons/examples/reversible-pilot-case.v1.json',import.meta.url);

test('synthetic low-consequence pilot stays explicitly non-promotional',async()=>{
  const v=JSON.parse(await readFile(url,'utf8'));
  const r=validateReversiblePilotCase(v);
  assert.equal(r.valid,true);
  assert.equal(r.outcome,'passed');
  assert.equal(r.production_promoted,false);
  assert.equal(r.consequential_use_promoted,false);
  assert.equal(r.authority_effect,'none');
});

test('consequential effects are forbidden by this pilot profile',async()=>{
  const v=JSON.parse(await readFile(url,'utf8'));
  v.effect.consequential=true;
  assert.throws(()=>validateReversiblePilotCase(v),/forbids consequential effects/);
});

test('real sensitive data is forbidden in reversible conformance pilot',async()=>{
  const v=JSON.parse(await readFile(url,'utf8'));
  v.synthetic_or_governed_data.real_sensitive_data_used=true;
  assert.throws(()=>validateReversiblePilotCase(v),/forbids real sensitive data/);
});

test('pilot requires pre-effect assurance, downgrade resistance, explanation, and retained challenge evidence',async()=>{
  for(const mutate of [
    v=>{v.assurance.satisfied_before_effect=false;},
    v=>{v.policy.downgrade_checks_passed=false;},
    v=>{v.explanation.uncertainty_preserved=false;},
    v=>{v.challenge.evidence_retained=false;},
    v=>{v.rollback.pretested=false;}
  ]){
    const v=JSON.parse(await readFile(url,'utf8'));
    mutate(v);
    assert.throws(()=>validateReversiblePilotCase(v));
  }
});

test('pilot result cannot promote production, consequential use, public support, or future authority',async()=>{
  for(const path of [
    ['promotion','production_promoted'],
    ['promotion','consequential_use_promoted'],
    ['promotion','public_supported_claim_added'],
    ['authority','pilot_grants_authority'],
    ['authority','pilot_success_grants_future_authority']
  ]){
    const v=JSON.parse(await readFile(url,'utf8'));
    v[path[0]][path[1]]=true;
    assert.throws(()=>validateReversiblePilotCase(v),/must be false|cannot grant/);
  }
});
