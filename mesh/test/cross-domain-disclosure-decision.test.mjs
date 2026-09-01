import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { validateCrossDomainDisclosureDecision } from '../src/lib/cross-domain-disclosure-decision.mjs';

const url=new URL('../../agent-commons/examples/cross-domain-disclosure-decision.v1.json',import.meta.url);

test('selective disclosure narrows a full-record request to proof-only',async()=>{
  const v=JSON.parse(await readFile(url,'utf8'));
  const r=validateCrossDomainDisclosureDecision(v);
  assert.equal(r.valid,true);
  assert.equal(r.allowed_disclosure,'proof_only');
  assert.equal(r.transfer_effect,'bounded_disclosure_only');
  assert.equal(r.authority_effect,'none');
});

test('recognition and encryption cannot silently grant disclosure',async()=>{
  for(const field of [
    'recognition_grants_disclosure',
    'encryption_grants_disclosure',
    'proof_verification_grants_underlying_record_access',
    'decision_grants_unrelated_authority'
  ]){
    const v=JSON.parse(await readFile(url,'utf8'));
    v.authority[field]=true;
    assert.throws(()=>validateCrossDomainDisclosureDecision(v),new RegExp(field));
  }
});

test('unsatisfied residency fails closed to no_export',async()=>{
  const v=JSON.parse(await readFile(url,'utf8'));
  v.residency.destination_satisfied=false;
  assert.throws(()=>validateCrossDomainDisclosureDecision(v),/requires no_export/);
  v.allowed_disclosure='no_export';
  const r=validateCrossDomainDisclosureDecision(v);
  assert.equal(r.transfer_effect,'deny_transfer');
});

test('preferred proof substitution blocks unnecessary full disclosure',async()=>{
  const v=JSON.parse(await readFile(url,'utf8'));
  v.allowed_disclosure='full_record';
  assert.throws(()=>validateCrossDomainDisclosureDecision(v),/proof substitute as preferred/);
});
