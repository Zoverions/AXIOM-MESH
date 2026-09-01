import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { validateChallengeWindowRecord } from '../src/lib/challenge-window-record.mjs';

const url=new URL('../../agent-commons/examples/challenge-window-record.v1.json',import.meta.url);

test('challenge window preserves evidence and remains non-authoritative',async()=>{
  const v=JSON.parse(await readFile(url,'utf8'));
  const r=validateChallengeWindowRecord(v,{now:new Date('2026-09-02T00:00:00.000Z')});
  assert.equal(r.valid,true);
  assert.equal(r.challenge_open,true);
  assert.equal(r.procedural_retention_active,true);
  assert.equal(r.authority_effect,'none');
  assert.equal(r.truth_effect,'none');
});

test('deletion cannot occur during open challenge or hold',async()=>{
  const v=JSON.parse(await readFile(url,'utf8'));
  v.retention.deletion_allowed=true;
  assert.throws(
    ()=>validateChallengeWindowRecord(v,{now:new Date('2026-09-02T00:00:00.000Z')}),
    /deletion cannot be allowed/
  );
});

test('optimistic effect requires reversible rollback or compensation path',async()=>{
  const v=JSON.parse(await readFile(url,'utf8'));
  v.optimistic_effect.performed=true;
  v.optimistic_effect.reversible=false;
  assert.throws(()=>validateChallengeWindowRecord(v),/requires reversibility/);
});

test('finality, challenge, retention and hold never create authority or truth',async()=>{
  for(const field of [
    'challenge_grants_runtime_authority',
    'finality_grants_truth',
    'retention_grants_disclosure',
    'hold_grants_unrelated_authority'
  ]){
    const v=JSON.parse(await readFile(url,'utf8'));
    v.authority[field]=true;
    assert.throws(()=>validateChallengeWindowRecord(v),new RegExp(field));
  }
});
