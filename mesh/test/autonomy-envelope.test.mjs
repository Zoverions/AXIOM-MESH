import assert from 'node:assert/strict';
import test from 'node:test';
import {assessAutonomyRequest,autonomyEnvelopeDigest,validateAutonomyEnvelope} from '../src/lib/autonomy-envelope.mjs';

const AUTH='a'.repeat(64);

function envelope(overrides={}){
  return {
    schema:'axiom-autonomy-envelope.v0',version:0,status:'inert-owner-ceiling',
    envelope_id:'autonomy.demo.1',owner_principal_id:'owner.alice',subject_principal_id:'agent.helper.1',
    authority_snapshot_ref:'authority.snapshot.1',authority_digest:AUTH,
    active_from:'2026-09-24T12:00:00.000Z',expires_at:'2026-09-25T12:00:00.000Z',
    actions:['memory.read','message.send'],purposes:['assist.personal'],
    destinations:['local','contact:bob'],capability_ids:['files.read','messages.send'],
    data_classes:['owner-private','contact-message'],
    effect_classes:['none','communication'],consequence_ceiling:'C2',max_execution_ms:5000,
    max_cost:{currency:'CAD',max_minor_units:100},
    confirmation_floor:'human-before-C2-C3',independent_approval_floor:'inherit-existing',
    delegation_allowed:false,wildcard_authority:false,grants_authority:false,
    execution_effect:'none',runtime_activation:false,...overrides
  };
}
function current(overrides={}){
  return {
    owner_principal_id:'owner.alice',subject_principal_id:'agent.helper.1',
    authority_snapshot_ref:'authority.snapshot.1',authority_digest:AUTH,authority_current:true,
    assessed_at:'2026-09-24T12:30:00.000Z',actions:['memory.read','message.send'],
    purposes:['assist.personal'],destinations:['local','contact:bob'],
    capability_ids:['files.read','messages.send'],data_classes:['owner-private','contact-message'],
    effect_classes:['none','communication'],consequence_ceiling:'C2',max_execution_ms:10000,
    max_cost:{currency:'CAD',max_minor_units:500},...overrides
  };
}
function request(overrides={}){
  return {
    action:'message.send',purpose:'assist.personal',destination:'contact:bob',
    capability_id:'messages.send',data_classes:['contact-message'],effect_class:'communication',
    consequence_class:'C2',requested_execution_ms:1000,estimated_cost:{currency:'CAD',minor_units:10},
    human_confirmation_present:true,independent_approval_present:false,...overrides
  };
}

test('owner autonomy envelope can only tighten current authority',()=>{
  const e=envelope();
  assert.equal(validateAutonomyEnvelope(e).envelope_digest,autonomyEnvelopeDigest(e));
  const result=assessAutonomyRequest(e,request(),current());
  assert.equal(result.eligible_to_request,true);
  assert.equal(result.authority_effect,'none');
  assert.equal(result.execution_effect,'none');
});

test('request must fit both owner ceiling and current authority',()=>{
  const ownerDenied=assessAutonomyRequest(envelope(),request({destination:'contact:carol'}),current({
    destinations:['local','contact:bob','contact:carol']
  }));
  assert.equal(ownerDenied.eligible_to_request,false);
  assert.ok(ownerDenied.reasons.includes('owner-envelope-destination-denied'));

  const authorityDenied=assessAutonomyRequest(envelope({destinations:['local','contact:bob','contact:carol']}),request({
    destination:'contact:carol'
  }),current());
  assert.equal(authorityDenied.eligible_to_request,false);
  assert.ok(authorityDenied.reasons.includes('current-authority-destination-denied'));
});

test('revocation/currentness and authority substitution fail closed',()=>{
  assert.ok(assessAutonomyRequest(envelope(),request(),current({authority_current:false})).reasons.includes('authority-not-current'));
  assert.ok(assessAutonomyRequest(envelope(),request(),current({authority_snapshot_ref:'authority.snapshot.2'})).reasons.includes('authority-snapshot-mismatch'));
  assert.ok(assessAutonomyRequest(envelope(),request(),current({authority_digest:'b'.repeat(64)})).reasons.includes('authority-digest-mismatch'));
});

test('consequence, execution and monetary ceilings are non-compensating',()=>{
  assert.ok(assessAutonomyRequest(envelope(),request({consequence_class:'C3'}),current({
    consequence_ceiling:'C3'
  })).reasons.includes('owner-envelope-consequence-ceiling-exceeded'));
  assert.ok(assessAutonomyRequest(envelope(),request({requested_execution_ms:6000}),current()).reasons.includes('owner-envelope-execution-budget-exceeded'));
  assert.ok(assessAutonomyRequest(envelope(),request({estimated_cost:{currency:'CAD',minor_units:101}}),current()).reasons.includes('owner-envelope-cost-budget-exceeded'));
});

test('owner confirmation floor cannot be bypassed by otherwise valid authority',()=>{
  const result=assessAutonomyRequest(envelope(),request({human_confirmation_present:false}),current());
  assert.equal(result.eligible_to_request,false);
  assert.ok(result.reasons.includes('owner-envelope-human-confirmation-required'));
});

test('wildcard and administrator-style autonomy are rejected structurally',()=>{
  assert.throws(()=>validateAutonomyEnvelope(envelope({actions:['*']})),/ambient authority syntax|invalid/);
  assert.throws(()=>validateAutonomyEnvelope(envelope({actions:['administrator']})),/ambient authority syntax/);
  const all=envelope({destinations:['all']});
  assert.throws(()=>validateAutonomyEnvelope(all),/invalid/);
});

test('expired envelope cannot be used even when underlying authority remains current',()=>{
  const result=assessAutonomyRequest(envelope({expires_at:'2026-09-24T12:15:00.000Z'}),request(),current());
  assert.equal(result.eligible_to_request,false);
  assert.ok(result.reasons.includes('envelope-expired'));
});

test('autonomy envelope cannot be applied to a different owner or subject',()=>{
  const owner=assessAutonomyRequest(envelope(),request(),current({owner_principal_id:'owner.mallory'}));
  assert.equal(owner.eligible_to_request,false);
  assert.ok(owner.reasons.includes('owner-principal-mismatch'));

  const subject=assessAutonomyRequest(envelope(),request(),current({subject_principal_id:'agent.other'}));
  assert.equal(subject.eligible_to_request,false);
  assert.ok(subject.reasons.includes('subject-principal-mismatch'));
});
