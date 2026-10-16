import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { validatePolicyConflictDecision } from '../src/lib/policy-conflict-decision.mjs';

const url=new URL('../../agent-commons/examples/policy-conflict-decision.v1.json',import.meta.url);

test('lower policy layers may be narrowed but cannot lower stronger assurance floors',async()=>{
  const v=JSON.parse(await readFile(url,'utf8'));
  const r=validatePolicyConflictDecision(v);
  assert.equal(r.valid,true);
  assert.equal(r.outcome,'narrowed');
  assert.equal(r.effective_minimum_assurance_rank,4);
  assert.deepEqual(v.resolution.effective_allowed_values,['proof_only']);
  assert.equal(r.authority_effect,'none');
});

test('assurance downgrade fails closed',async()=>{
  const v=JSON.parse(await readFile(url,'utf8'));
  v.resolution.effective_minimum_assurance_rank=2;
  assert.throws(()=>validatePolicyConflictDecision(v),/cannot be lower than strongest policy floor/);
});

test('allowlist widening fails closed',async()=>{
  const v=JSON.parse(await readFile(url,'utf8'));
  v.resolution.effective_allowed_values=['proof_only','full_record'];
  assert.throws(()=>validatePolicyConflictDecision(v),/cannot widen policy-layer intersection/);
});

test('fallback must independently satisfy same or stricter composed policy',async()=>{
  const v=JSON.parse(await readFile(url,'utf8'));
  v.fallback.same_or_stricter_policy=false;
  assert.throws(()=>validatePolicyConflictDecision(v),/cannot weaken composed policy/);
});

test('non-waivable denial dominates',async()=>{
  const v=JSON.parse(await readFile(url,'utf8'));
  v.policy_layers[0].effect='deny';
  v.resolution.effective_effect='allow';
  assert.throws(()=>validatePolicyConflictDecision(v),/non-waivable deny cannot be weakened/);
});

test('unresolved conflicts cannot silently resolve to success',async()=>{
  const v=JSON.parse(await readFile(url,'utf8'));
  v.conflicts[0].resolved=false;
  v.resolution.outcome='compatible';
  assert.throws(()=>validatePolicyConflictDecision(v),/cannot resolve to success/);
});

test('exception presence does not create success or authority',async()=>{
  const v=JSON.parse(await readFile(url,'utf8'));
  v.exception={
    present:true,
    authority_ref:'authority:exception-board',
    scope:'Only this exact action and policy digest.',
    expires_at:'2026-09-02T18:40:00.000Z',
    review_ref:'review:exception-001'
  };
  const r=validatePolicyConflictDecision(v);
  assert.equal(r.valid,true);
  assert.equal(r.authority_effect,'none');

  v.authority.exception_presence_grants_success=true;
  assert.throws(()=>validatePolicyConflictDecision(v),/exception_presence_grants_success/);
});
