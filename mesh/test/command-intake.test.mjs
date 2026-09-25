import assert from 'node:assert/strict';
import test from 'node:test';
import {assessCommandIntake,commandIntakeDigest,validateCommandIntake} from '../src/lib/command-intake.mjs';

function command(channel_kind='voice',overrides={}){
  return {
    schema:'axiom-command-intake.v0',version:0,status:'inert-intake-laboratory',
    command_id:'command.demo.1',channel_kind,channel_instance_ref:'channel.instance.1',
    channel_binding_ref:'channel.binding.1',claimed_principal_id:'owner.alice',
    content_digest:'a'.repeat(64),content_type:channel_kind==='voice'?'transcript':'text',
    normalized_text:'Summarize the local project notes.',
    data_classes:['owner-private'],received_at:'2026-09-24T12:00:00.000Z',
    expires_at:'2026-09-24T12:05:00.000Z',nonce:'nonce-0123456789abcdef',
    authentication_evidence_refs:['auth:evidence.1'],channel_identity_authority:false,
    grants_authority:false,execution_effect:'none',runtime_activation:false,...overrides
  };
}
function current(overrides={}){
  return {
    resolved_principal_id:'owner.alice',channel_binding_ref:'channel.binding.1',
    channel_binding_current:true,authentication_current:true,replay_seen:false,
    assessed_at:'2026-09-24T12:01:00.000Z',...overrides
  };
}

test('voice and web commands enter the same intent pipeline without authority',()=>{
  for(const kind of ['voice','web']){
    const value=command(kind);
    assert.equal(validateCommandIntake(value).intake_digest,commandIntakeDigest(value));
    const result=assessCommandIntake(value,current());
    assert.equal(result.admitted_to_intent_pipeline,true);
    assert.equal(result.resolved_principal_id,'owner.alice');
    assert.equal(result.identity_effect,'none');
    assert.equal(result.authority_effect,'none');
    assert.equal(result.execution_effect,'none');
  }
});

test('paired channel does not override resolved principal identity',()=>{
  const value=command('messaging');
  const result=assessCommandIntake(value,current({resolved_principal_id:'owner.bob'}));
  assert.equal(result.admitted_to_intent_pipeline,false);
  assert.ok(result.reasons.includes('principal-claim-mismatch'));
});

test('stale binding, stale auth, replay and expiry all fail closed',()=>{
  assert.ok(assessCommandIntake(command(),current({channel_binding_current:false})).reasons.includes('channel-binding-not-current'));
  assert.ok(assessCommandIntake(command(),current({authentication_current:false})).reasons.includes('authentication-not-current'));
  assert.ok(assessCommandIntake(command(),current({replay_seen:true})).reasons.includes('replay-detected'));
  assert.ok(assessCommandIntake(command(),current({assessed_at:'2026-09-24T12:05:00.000Z'})).reasons.includes('command-expired'));
});

test('channel binding substitution is denied',()=>{
  const result=assessCommandIntake(command(),current({channel_binding_ref:'channel.binding.attacker'}));
  assert.equal(result.admitted_to_intent_pipeline,false);
  assert.ok(result.reasons.includes('channel-binding-mismatch'));
});

test('anonymous channel claim may be resolved by current authentication without becoming authority',()=>{
  const value=command('cli',{claimed_principal_id:null});
  const result=assessCommandIntake(value,current());
  assert.equal(result.admitted_to_intent_pipeline,true);
  assert.equal(result.resolved_principal_id,'owner.alice');
  assert.equal(result.authority_effect,'none');
});
