import assert from 'node:assert/strict';
import test from 'node:test';
import {evaluateTaskContinuity,taskContinuityPolicyDigest,validateTaskContinuityPolicy} from '../src/lib/task-continuity-policy.mjs';

function policy(overrides={}){
  return {
    schema:'axiom-task-continuity-policy.v0',version:0,status:'inert-contract-laboratory',
    continuity_id:'continuity.demo.1',outcome_id:'outcome.demo.1',task_id:'task.demo.1',
    outcome_digest:'a'.repeat(64),task_digest:'b'.repeat(64),
    authority_snapshot_ref:'authority.snapshot.1',budget_ref:'budget.snapshot.1',
    mode:'local-cognition-degraded',max_degraded_duration_ms:3600000,
    allowed_local_capabilities:['model.local','files.read'],
    allowed_data_classes:['owner-private'],expires_at:'2026-09-25T12:00:00.000Z',
    grants_authority:false,execution_effect:'none',runtime_activation:false,...overrides
  };
}
function state(overrides={}){
  return {
    network_state:'provider-unavailable',degraded_since:'2026-09-24T11:30:00.000Z',
    assessed_at:'2026-09-24T12:00:00.000Z',outcome_digest:'a'.repeat(64),task_digest:'b'.repeat(64),
    authority_snapshot_ref:'authority.snapshot.1',
    authority_current:true,budget_ref:'budget.snapshot.1',budget_current:true,
    execution_location:'owner-local',provider_location:'owner-local',
    requested_capabilities:['model.local','files.read'],requested_data_classes:['owner-private'],
    requested_effect:'none',...overrides
  };
}

test('bounded local cognition may continue during provider loss without effect authority',()=>{
  const p=policy();
  assert.equal(validateTaskContinuityPolicy(p).policy_digest,taskContinuityPolicyDigest(p));
  const result=evaluateTaskContinuity(p,state());
  assert.equal(result.continuity_action,'continue-local-cognition');
  assert.equal(result.effect_ceiling,'none');
  assert.equal(result.authority_effect,'none');
});

test('external effects and remote provider substitution fail closed while degraded',()=>{
  const external=evaluateTaskContinuity(policy(),state({requested_effect:'write-external'}));
  assert.equal(external.continuity_action,'stop-denied');
  assert.ok(external.reasons.includes('degraded-external-effect-denied'));

  const remote=evaluateTaskContinuity(policy(),state({provider_location:'remote'}));
  assert.equal(remote.continuity_action,'stop-denied');
  assert.ok(remote.reasons.includes('remote-provider-denied'));
});

test('revocation, budget loss and excessive outage duration stop continuation',()=>{
  const revoked=evaluateTaskContinuity(policy(),state({authority_current:false}));
  assert.equal(revoked.continuity_action,'stop-denied');
  assert.ok(revoked.reasons.includes('authority-not-current'));

  const budget=evaluateTaskContinuity(policy(),state({budget_current:false}));
  assert.equal(budget.continuity_action,'stop-denied');
  assert.ok(budget.reasons.includes('budget-not-current'));

  const expired=evaluateTaskContinuity(policy(),state({degraded_since:'2026-09-24T10:00:00.000Z'}));
  assert.equal(expired.continuity_action,'stop-denied');
  assert.ok(expired.reasons.includes('degraded-duration-exceeded'));
});

test('queue mode preserves work without executing it',()=>{
  const result=evaluateTaskContinuity(policy({mode:'queue-until-reconnect'}),state());
  assert.equal(result.continuity_action,'pause-queue');
  assert.equal(result.execution_effect,'none');
  assert.deepEqual(result.reasons,['await-reconnect']);
});

test('online state returns to the normal authority path rather than inheriting degraded permission',()=>{
  const result=evaluateTaskContinuity(policy(),state({network_state:'online',degraded_since:null}));
  assert.equal(result.continuity_action,'normal-path-required');
  assert.equal(result.execution_effect,'none');
  assert.ok(result.reasons.includes('degraded-continuity-not-required'));
});

test('undeclared local capability or data class stops degraded continuation',()=>{
  const cap=evaluateTaskContinuity(policy(),state({requested_capabilities:['model.local','shell.exec']}));
  assert.equal(cap.continuity_action,'stop-denied');
  assert.ok(cap.reasons.includes('capability-not-allowed:shell.exec'));
  const data=evaluateTaskContinuity(policy(),state({requested_data_classes:['owner-private','health-private']}));
  assert.equal(data.continuity_action,'stop-denied');
  assert.ok(data.reasons.includes('data-class-not-allowed:health-private'));
});

test('stale outcome or task binding cannot continue through a partition',()=>{
  const staleOutcome=evaluateTaskContinuity(policy(),state({outcome_digest:'c'.repeat(64)}));
  assert.equal(staleOutcome.continuity_action,'stop-denied');
  assert.ok(staleOutcome.reasons.includes('outcome-digest-mismatch'));

  const staleTask=evaluateTaskContinuity(policy(),state({task_digest:'d'.repeat(64)}));
  assert.equal(staleTask.continuity_action,'stop-denied');
  assert.ok(staleTask.reasons.includes('task-digest-mismatch'));
});

test('online return still fails closed when current authority is gone',()=>{
  const result=evaluateTaskContinuity(policy(),state({
    network_state:'online',degraded_since:null,authority_current:false
  }));
  assert.equal(result.continuity_action,'stop-denied');
  assert.ok(result.reasons.includes('authority-not-current'));
});
