import assert from 'node:assert/strict';
import test from 'node:test';
import {commandIntakeEnvelopeDigest,evaluateCommandIntake,validateCommandIntakeEnvelope} from '../src/lib/command-intake-envelope.mjs';

function envelope(overrides={}){
 return {
  schema:'axiom-command-intake-envelope.v0',version:0,status:'inert-proposal-envelope',
  command_id:'command.demo.1',channel_kind:'messaging',channel_binding_ref:'channel.binding.1',
  claimed_principal_ref:'human.owner',authenticated_principal_ref:'human.owner',
  authentication_evidence_ref:'evidence:session.1',payload_ref:'payload:command.1',
  payload_digest:'a'.repeat(64),received_at:'2026-09-24T12:00:00.000Z',
  expires_at:'2026-09-24T12:05:00.000Z',replay_nonce:'nonce.command.1',
  channel_is_authority:false,grants_authority:false,execution_effect:'none',runtime_activation:false,...overrides
 };
}
function current(overrides={}){
 return {
  assessed_at:'2026-09-24T12:01:00.000Z',expected_channel_binding_ref:'channel.binding.1',
  channel_binding_current:true,authenticated_principal_current:true,replay_nonce_seen:false,...overrides
 };
}

test('authenticated command may enter proposal pipeline but never authority',()=>{
 const value=envelope();
 assert.equal(validateCommandIntakeEnvelope(value).envelope_digest,commandIntakeEnvelopeDigest(value));
 const result=evaluateCommandIntake(value,current());
 assert.equal(result.intake_eligible,true);
 assert.equal(result.intake_effect,'proposal-only');
 assert.equal(result.authority_effect,'none');
});

test('channel kind does not change authority semantics',()=>{
 for(const channel_kind of ['web','voice','messaging','email','cli','wearable','device','api']){
  const result=evaluateCommandIntake(envelope({channel_kind,command_id:'command.'+channel_kind}),current());
  assert.equal(result.intake_eligible,true);
  assert.equal(result.intake_effect,'proposal-only');
 }
});

test('stale binding, replay and principal mismatch fail closed',()=>{
 const stale=evaluateCommandIntake(envelope(),current({channel_binding_current:false}));
 assert.equal(stale.intake_eligible,false);assert.ok(stale.reasons.includes('channel-binding-not-current'));
 const replay=evaluateCommandIntake(envelope(),current({replay_nonce_seen:true}));
 assert.equal(replay.intake_eligible,false);assert.ok(replay.reasons.includes('replay-detected'));
 const mismatch=evaluateCommandIntake(envelope({claimed_principal_ref:'human.other'}),current());
 assert.equal(mismatch.intake_eligible,false);assert.ok(mismatch.reasons.includes('claimed-principal-mismatch'));
});

test('channel possession without authenticated principal is not eligible intake',()=>{
 const value=envelope({claimed_principal_ref:'human.owner',authenticated_principal_ref:null,authentication_evidence_ref:null});
 const result=evaluateCommandIntake(value,current({authenticated_principal_current:false}));
 assert.equal(result.intake_eligible,false);
 assert.ok(result.reasons.includes('principal-not-authenticated'));
});

test('expired command is rejected even if the channel remains paired',()=>{
 const result=evaluateCommandIntake(envelope(),current({assessed_at:'2026-09-24T12:05:00.000Z'}));
 assert.equal(result.intake_eligible,false);assert.ok(result.reasons.includes('command-expired'));
});
