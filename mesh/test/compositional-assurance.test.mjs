import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  composeRequiredAssurance,
  evaluateAssuranceVector
} from '../src/lib/compositional-assurance.mjs';

test('required assurance composes deny-dominantly across independent floors',()=>{
  const result=composeRequiredAssurance([
    {source:'kernel',requirements:{identity:'required',authority:'required',evidence:'required'}},
    {source:'institution',requirements:{independent_verification:'required',privacy:'required'}},
    {source:'action-risk',requirements:{currentness:'required'}}
  ]);
  assert.equal(result.required_assurance.identity,'required');
  assert.equal(result.required_assurance.independent_verification,'required');
  assert.equal(result.required_assurance.currentness,'required');
  assert.deepEqual(result.floor_sources.identity,['kernel']);
});

test('unknown required dimension prevents assurance satisfaction',async()=>{
  const v=JSON.parse(await readFile(
    new URL('../../agent-commons/examples/assurance-vector-evaluation.v1.json',import.meta.url),
    'utf8'
  ));
  const r=evaluateAssuranceVector(v);
  assert.equal(r.satisfied,false);
  assert.deepEqual(r.unknown_assurance,['currentness']);
  assert.equal(r.degraded_outcome,'hold_pending');
  assert.equal(r.authority_effect,'none');
});

test('one strong dimension cannot compensate for another missing dimension',async()=>{
  const v=JSON.parse(await readFile(
    new URL('../../agent-commons/examples/assurance-vector-evaluation.v1.json',import.meta.url),
    'utf8'
  ));
  v.observed_assurance.independent_verification='achieved';
  v.observed_assurance.currentness='failed';
  const r=evaluateAssuranceVector(v);
  assert.equal(r.satisfied,false);
  assert.deepEqual(r.failed_assurance,['currentness']);
});

test('assurance cannot widen authority',async()=>{
  for(const field of ['assurance_grants_authority','higher_assurance_widens_scope']){
    const v=JSON.parse(await readFile(
      new URL('../../agent-commons/examples/assurance-vector-evaluation.v1.json',import.meta.url),
      'utf8'
    ));
    v.authority[field]=true;
    assert.throws(()=>evaluateAssuranceVector(v),/cannot/);
  }
});

test('degraded mode cannot authorize effect in experimental profile',async()=>{
  const v=JSON.parse(await readFile(
    new URL('../../agent-commons/examples/assurance-vector-evaluation.v1.json',import.meta.url),
    'utf8'
  ));
  v.degraded_mode.allow_effect=true;
  assert.throws(()=>evaluateAssuranceVector(v),/cannot authorize consequential effect/);
});
