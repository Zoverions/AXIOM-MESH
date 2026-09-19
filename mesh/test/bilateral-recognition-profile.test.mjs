import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { validateBilateralRecognitionProfile } from '../src/lib/bilateral-recognition-profile.mjs';

const exampleUrl = new URL('../../agent-commons/examples/bilateral-recognition-profile.v1.json', import.meta.url);

test('bilateral recognition remains purpose-bound and non-authoritative', async () => {
  const profile=JSON.parse(await readFile(exampleUrl,'utf8'));
  const result=validateBilateralRecognitionProfile(profile,{
    now:new Date('2026-09-02T00:00:00.000Z')
  });
  assert.equal(result.valid,true);
  assert.equal(result.authority_effect,'none');
  assert.equal(result.transitive_trust,false);
});

test('automatic transitive trust is forbidden', async () => {
  const profile=JSON.parse(await readFile(exampleUrl,'utf8'));
  profile.authority.automatic_transitive_trust=true;
  assert.throws(()=>validateBilateralRecognitionProfile(profile),/automatic transitive trust/);
});

test('recognition cannot grant membership, eligibility, or runtime authority', async () => {
  for(const field of [
    'recognition_grants_runtime_authority',
    'recognition_grants_membership',
    'recognition_grants_eligibility'
  ]){
    const profile=JSON.parse(await readFile(exampleUrl,'utf8'));
    profile.authority[field]=true;
    assert.throws(()=>validateBilateralRecognitionProfile(profile),new RegExp(field.replaceAll('_',' ') + '|recognition cannot'));
  }
});

test('both parties retain withdrawal rights', async () => {
  const profile=JSON.parse(await readFile(exampleUrl,'utf8'));
  profile.withdrawal.party_b_may_withdraw=false;
  assert.throws(()=>validateBilateralRecognitionProfile(profile),/both parties must retain withdrawal ability/);
});

test('material widening requires renewed acceptance', async () => {
  const profile=JSON.parse(await readFile(exampleUrl,'utf8'));
  profile.amendment.material_widening_requires_renewed_acceptance=false;
  assert.throws(()=>validateBilateralRecognitionProfile(profile),/material widening requires renewed acceptance/);
});
