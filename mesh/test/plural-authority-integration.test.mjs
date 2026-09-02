import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { validatePluralAuthorityScenario } from '../src/lib/plural-authority-integration.mjs';

const url=new URL('../../agent-commons/examples/plural-authority-integration-scenario.v1.json',import.meta.url);

test('full plural-authority chain remains lineage-consistent and non-authoritative',async()=>{
  const v=JSON.parse(await readFile(url,'utf8'));
  const r=validatePluralAuthorityScenario(v);
  assert.equal(r.valid,true);
  assert.equal(r.stage_count,8);
  assert.equal(r.production_promoted,false);
  assert.equal(r.consequential_use_promoted,false);
  assert.equal(r.authority_effect,'none');
});

test('stage lineage mismatch fails closed',async()=>{
  const v=JSON.parse(await readFile(url,'utf8'));
  v.stages.disclosure.action_ref='action:other';
  assert.throws(()=>validatePluralAuthorityScenario(v),/action_ref mismatch/);
});

test('unexpected stage key fails closed',async()=>{
  const v=JSON.parse(await readFile(url,'utf8'));
  v.stages.unreviewed_effect={
    record_ref:'effect:unreviewed-001',
    outcome:'allow_candidate',
    authority_effect:'none',
    scenario_ref:v.scenario_id,
    action_ref:v.action_id
  };
  assert.throws(()=>validatePluralAuthorityScenario(v),/unsupported stage/);
});

test('unknown assurance cannot be laundered into allow explanation',async()=>{
  const v=JSON.parse(await readFile(url,'utf8'));
  v.stages.decision_explanation.outcome='allow_candidate';
  assert.throws(()=>validatePluralAuthorityScenario(v),/unknown required assurance|laundered/);
});

test('historical rewrite is forbidden across challenge and reassessment',async()=>{
  const v=JSON.parse(await readFile(url,'utf8'));
  v.lineage.historical_rewrite_allowed=true;
  assert.throws(()=>validatePluralAuthorityScenario(v),/historical rewrite must be forbidden/);
});

test('every stage must remain non-authoritative',async()=>{
  const v=JSON.parse(await readFile(url,'utf8'));
  v.stages.reassessment.authority_effect='bounded';
  assert.throws(()=>validatePluralAuthorityScenario(v),/authority_effect must be none/);
});

test('integration pass cannot promote production or future authority',async()=>{
  const v=JSON.parse(await readFile(url,'utf8'));
  v.promotion.production_promoted=true;
  assert.throws(()=>validatePluralAuthorityScenario(v),/must be false/);

  const w=JSON.parse(await readFile(url,'utf8'));
  w.authority.successful_conformance_grants_authority=true;
  assert.throws(()=>validatePluralAuthorityScenario(w),/cannot grant authority/);
});
