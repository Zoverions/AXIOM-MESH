import assert from 'node:assert/strict';
import test from 'node:test';

import {
  ACTIVE_TASK_STEERING_SCHEMA,
  PARTICIPATION_COOLDOWN_EVIDENCE_SCHEMA,
  PARTICIPATION_DECISION_SCHEMA,
  PARTICIPATION_OBSERVATION_SCHEMA,
  SILENT_INVESTIGATION_RESULT_SCHEMA,
  assessParticipationCooldown,
  computeParticipationCooldownEvidenceDigest,
  computeParticipationDecisionDigest,
  createParticipationPreset,
  evaluateParticipation,
  evaluateParticipationWithCooldown,
  fallbackParticipationDecision,
  participationCooldownEvidenceDigest,
  participationDecisionDigest,
  participationObservationDigest,
  participationPolicyDigest,
  silentInvestigationResultDigest,
  validateParticipationCooldownEvidence,
  validateParticipationDecision,
  verifyActiveTaskSteeringBinding,
  verifySilentInvestigationBinding
} from '../src/lib/ambient-participation-policy.mjs';
import {
  taskLifecycleDigest,
  validateTaskLifecycle
} from '../src/lib/agent-os-contracts.mjs';

const A='a'.repeat(64);
const B='b'.repeat(64);
const C='c'.repeat(64);
const D='d'.repeat(64);
const E='e'.repeat(64);

function policy(name='balanced'){
  return createParticipationPreset(name,{
    policyId:'participation.policy.'+name+'.binding.1',
    policySourceRef:'owner.policy.binding',
    issuedAt:'2026-09-27T04:00:00.000Z'
  });
}

function observation(overrides={}){
  return {
    schema:PARTICIPATION_OBSERVATION_SCHEMA,
    version:0,
    status:'inert-participation-observation',
    observation_id:'participation.observation.binding.1',
    event_digest:A,
    state_digest:B,
    task_id:'task.binding.1',
    principal_id:'owner.alice',
    context_id:'channel.engineering',
    context_class:'organization',
    addressing_class:'passive',
    producer_ref:'bounded.provider.demo',
    producer_revision_ref:'demo.1',
    observed_at:'2026-09-27T04:10:00.000Z',
    applicability:'current',
    dimensions:{
      usefulness:90,
      answer_confidence:90,
      urgency:40,
      noise:10,
      interruption_cost:20,
      investigation_value:80,
      acknowledgement_fit:50
    },
    evidence_refs:['bounded.observation.binding.1'],
    score_semantics:'uncalibrated-ordinal-0-100',
    authority_effect:'none',
    assurance_effect:'none',
    execution_effect:'none',
    runtime_activation:false,
    ...overrides
  };
}

function event(overrides={}){
  return {
    event_digest:A,
    event_class:'passive',
    context_id:'channel.engineering',
    context_class:'organization',
    evaluated_at:'2026-09-27T04:10:00.000Z',
    supported:true,
    quiet_context:false,
    cooldown_state:'ready',
    already_answered:false,
    consequence_class:'C1',
    ...overrides
  };
}

function cooldown(p=policy(),overrides={}){
  const d={
    schema:PARTICIPATION_COOLDOWN_EVIDENCE_SCHEMA,
    version:0,
    status:'inert-participation-cooldown-evidence',
    evidence_id:'participation.cooldown.binding.1',
    policy_digest:participationPolicyDigest(p),
    context_id:'channel.engineering',
    window_started_at:'2026-09-27T03:59:59.000Z',
    window_ends_at:'2026-09-27T04:09:59.000Z',
    evaluated_at:'2026-09-27T04:09:59.000Z',
    unsolicited_interventions:1,
    max_unsolicited_interventions:p.cooldown.max_unsolicited_interventions,
    derived_state:'ready',
    history_digest:C,
    evidence_refs:['participation.history.binding.1'],
    evidence_digest:'0'.repeat(64),
    authority_effect:'none',
    communication_effect:'none',
    execution_effect:'none',
    runtime_activation:false,
    ...overrides
  };
  d.evidence_digest=computeParticipationCooldownEvidenceDigest(d);
  return d;
}

function task(overrides={}){
  return {
    schema:'axiom-task-lifecycle.v0',
    version:0,
    status:'inert-contract-laboratory',
    task_id:'task.binding.1',
    outcome_id:'outcome.binding.1',
    principal_id:'owner.alice',
    lifecycle_state:'running',
    created_at:'2026-09-27T04:00:00.000Z',
    updated_at:'2026-09-27T04:09:00.000Z',
    worker_ref:'worker.demo',
    provider_ref:null,
    node_ref:null,
    authority_snapshot_ref:'authority.snapshot.1',
    authority_checked_at:'2026-09-27T04:08:00.000Z',
    budget_ref:'budget.demo.1',
    budget_checked_at:'2026-09-27T04:08:00.000Z',
    resume_requested:false,
    resume_from_digest:null,
    effect_state:'none',
    result_refs:[],
    grants_authority:false,
    execution_effect:'none',
    runtime_activation:false,
    ...overrides
  };
}

function steering(previous,next,overrides={}){
  return {
    schema:ACTIVE_TASK_STEERING_SCHEMA,
    version:0,
    status:'inert-steering-evidence',
    steering_id:'steering.binding.1',
    task_id:previous.task_id,
    previous_task_digest:taskLifecycleDigest(previous),
    new_event_digest:D,
    actor_principal_id:previous.principal_id,
    semantic_observation_digest:E,
    authority_snapshot_ref:previous.authority_snapshot_ref,
    decision:'APPEND',
    resulting_task_revision_digest:taskLifecycleDigest(next),
    decided_at:'2026-09-27T04:10:00.000Z',
    grants_authority:false,
    delegation_effect:'none',
    execution_effect:'none',
    runtime_activation:false,
    ...overrides
  };
}

function silentResult(p=policy(),o=observation(),overrides={}){
  return {
    schema:SILENT_INVESTIGATION_RESULT_SCHEMA,
    version:0,
    status:'inert-silent-investigation-evidence',
    result_id:'silent.investigation.binding.1',
    task_id:'task.binding.1',
    policy_digest:participationPolicyDigest(p),
    observation_digest:participationObservationDigest(o),
    started_at:'2026-09-27T04:10:00.000Z',
    completed_at:'2026-09-27T04:10:05.000Z',
    evidence_refs:['evidence.investigation.1'],
    useful_finding:false,
    actionable_finding:false,
    silence_reason:'no-useful-finding',
    steps_used:2,
    tool_calls:0,
    duration_ms:5000,
    unresolved_unknowns:[],
    emitted_message:false,
    authority_effect:'none',
    execution_effect:'none',
    runtime_activation:false,
    ...overrides
  };
}

test('participation decisions are closed self-digested inert evidence',()=>{
  const d=evaluateParticipation(observation(),policy(),event());
  assert.equal(d.schema,PARTICIPATION_DECISION_SCHEMA);
  assert.equal(d.status,'inert-participation-decision');
  assert.equal(d.action,'ANSWER');
  assert.equal(validateParticipationDecision(d).valid,true);
  assert.equal(participationDecisionDigest(d),d.decision_digest);
  assert.equal(d.communication_effect,'none');

  const changed=structuredClone(d);
  changed.action='PASS';
  assert.throws(()=>validateParticipationDecision(changed),/digest mismatch/i);

  for(const field of ['authority_effect','data_scope_effect','communication_effect','execution_effect']){
    const x=structuredClone(d);
    x[field]='widened';
    assert.throws(()=>validateParticipationDecision(x));
  }
});

test('fallback decisions do not pretend unusable semantic evidence was consulted',()=>{
  const d=fallbackParticipationDecision(event({event_class:'explicit'}));
  assert.equal(d.action,'ANSWER');
  assert.equal(d.observation_digest,null);
  assert.equal(d.policy_digest,null);
  assert.equal(validateParticipationDecision(d).valid,true);

  const mixed=structuredClone(d);
  mixed.observation_digest=A;
  mixed.decision_digest='0'.repeat(64);
  assert.throws(()=>validateParticipationDecision(mixed),/both be present or both be null/);
});

test('cooldown evidence is self-digested and count-derived',()=>{
  const p=policy();
  const d=cooldown(p);
  assert.equal(validateParticipationCooldownEvidence(d).valid,true);
  assert.equal(participationCooldownEvidenceDigest(d),d.evidence_digest);
  assert.equal(d.derived_state,'ready');

  const exhausted=cooldown(p,{
    unsolicited_interventions:p.cooldown.max_unsolicited_interventions,
    derived_state:'blocked'
  });
  exhausted.evidence_digest=computeParticipationCooldownEvidenceDigest(exhausted);
  assert.equal(validateParticipationCooldownEvidence(exhausted).derived_state,'blocked');

  const shifted=structuredClone(d);
  shifted.window_ends_at='2026-09-27T04:10:00.000Z';
  shifted.evidence_digest=computeParticipationCooldownEvidenceDigest(shifted);
  assert.throws(()=>validateParticipationCooldownEvidence(shifted),/must equal evaluated_at/);

  const forged=structuredClone(exhausted);
  forged.derived_state='ready';
  forged.evidence_digest=computeParticipationCooldownEvidenceDigest(forged);
  assert.throws(()=>validateParticipationCooldownEvidence(forged),/derived_state/);
});

test('cooldown assessment binds exact policy context time window and configured limit',()=>{
  const p=policy();
  const e=event({evaluated_at:'2026-09-27T04:09:59.000Z'});
  const d=cooldown(p);
  const ok=assessParticipationCooldown(p,d,e);
  assert.equal(ok.state,'ready');
  assert.deepEqual(ok.reasons,[]);

  for(const mutate of [
    x=>{x.policy_digest=A;},
    x=>{x.context_id='channel.other';},
    x=>{x.evaluated_at='2026-09-27T04:09:58.000Z';},
    x=>{x.window_started_at='2026-09-27T04:01:00.000Z';},
    x=>{x.max_unsolicited_interventions+=1;}
  ]){
    const x=structuredClone(d);
    mutate(x);
    x.evidence_digest=computeParticipationCooldownEvidenceDigest(x);
    const result=assessParticipationCooldown(p,x,e);
    assert.equal(result.state,'unavailable');
  }
});

test('future live wrapper ignores caller cooldown assertion and uses bound cooldown evidence',()=>{
  const p=policy();
  const e=event({evaluated_at:'2026-09-27T04:09:59.000Z',cooldown_state:'ready'});
  const blocked=cooldown(p,{
    unsolicited_interventions:p.cooldown.max_unsolicited_interventions,
    derived_state:'blocked'
  });
  blocked.evidence_digest=computeParticipationCooldownEvidenceDigest(blocked);

  const d=evaluateParticipationWithCooldown(
    observation({observed_at:'2026-09-27T04:09:58.000Z'}),
    p,
    e,
    blocked
  );
  assert.equal(d.action,'PASS');
  assert.deepEqual(d.reasons,['cooldown-blocked']);
});

test('invalid cooldown evidence becomes unavailable rather than fail-open',()=>{
  const p=policy();
  const e=event({evaluated_at:'2026-09-27T04:09:59.000Z'});
  const bad=cooldown(p);
  bad.evidence_digest=A;
  const assessed=assessParticipationCooldown(p,bad,e);
  assert.equal(assessed.state,'unavailable');
  assert.deepEqual(assessed.reasons,['cooldown-evidence-invalid']);
});

test('active steering binds exact predecessor and successor task identity without widening authority',()=>{
  const previous=task();
  const next=task({
    updated_at:'2026-09-27T04:10:00.000Z',
    lifecycle_state:'running'
  });
  assert.equal(validateTaskLifecycle(previous).valid,true);
  assert.equal(validateTaskLifecycle(next).valid,true);

  const s=steering(previous,next);
  const bound=verifyActiveTaskSteeringBinding(s,previous,next);
  assert.equal(bound.bound,true);
  assert.deepEqual(bound.reasons,[]);
  assert.equal(bound.successor_task_digest,taskLifecycleDigest(next));
  assert.equal(bound.authority_effect,'none');

  const changedPrincipal={...next,principal_id:'owner.mallory'};
  const principalResult=verifyActiveTaskSteeringBinding(
    {...s,resulting_task_revision_digest:taskLifecycleDigest(changedPrincipal)},
    previous,
    changedPrincipal
  );
  assert.equal(principalResult.bound,false);
  assert.ok(principalResult.reasons.includes('successor-principal-mismatch'));

  const changedBudget={...next,budget_ref:'budget.other'};
  const budgetResult=verifyActiveTaskSteeringBinding(
    {...s,resulting_task_revision_digest:taskLifecycleDigest(changedBudget)},
    previous,
    changedBudget
  );
  assert.equal(budgetResult.bound,false);
  assert.ok(budgetResult.reasons.includes('successor-budget-ref-mismatch'));
});

test('steering rejects stale predecessor substitution and future task identity drift',()=>{
  const previous=task();
  const next=task({updated_at:'2026-09-27T04:10:00.000Z'});
  const s=steering(previous,next);

  const changedPrevious={...previous,updated_at:'2026-09-27T04:09:30.000Z'};
  const stale=verifyActiveTaskSteeringBinding(s,changedPrevious,next);
  assert.equal(stale.bound,false);
  assert.ok(stale.reasons.includes('previous-task-digest-mismatch'));

  const changedAuthority={...next,authority_snapshot_ref:'authority.snapshot.2'};
  const authority=verifyActiveTaskSteeringBinding(
    {...s,resulting_task_revision_digest:taskLifecycleDigest(changedAuthority)},
    previous,
    changedAuthority
  );
  assert.equal(authority.bound,false);
  assert.ok(authority.reasons.includes('successor-authority-snapshot-mismatch'));
});

test('STOP and IGNORE remain evidence requests and cannot smuggle successor state',()=>{
  const previous=task();
  const stop={
    ...steering(previous,task({updated_at:'2026-09-27T04:10:00.000Z'})),
    decision:'STOP',
    resulting_task_revision_digest:null
  };
  const ok=verifyActiveTaskSteeringBinding(stop,previous,null);
  assert.equal(ok.bound,true);
  assert.equal(ok.successor_task_digest,null);

  const illicit=verifyActiveTaskSteeringBinding(
    stop,
    previous,
    task({updated_at:'2026-09-27T04:10:00.000Z'})
  );
  assert.equal(illicit.bound,false);
  assert.ok(illicit.reasons.includes('unexpected-successor-task'));
});


test('exported digest helpers reject proxies accessors and hidden authority fields before reading them',()=>{
  const d=evaluateParticipation(observation(),policy(),event());

  const proxy=new Proxy(structuredClone(d),{});
  assert.throws(()=>computeParticipationDecisionDigest(proxy),/Proxy/i);

  let reads=0;
  const accessor=structuredClone(d);
  Object.defineProperty(accessor,'action',{
    enumerable:true,
    get(){reads+=1; return 'ANSWER';}
  });
  assert.throws(()=>computeParticipationDecisionDigest(accessor),/data properties/i);
  assert.equal(reads,0);

  const hidden=structuredClone(d);
  Object.defineProperty(hidden,'grants_authority',{value:true,enumerable:false});
  assert.throws(()=>computeParticipationDecisionDigest(hidden),/data properties|fields are invalid/i);

  const c=cooldown(policy());
  const cProxy=new Proxy(structuredClone(c),{});
  assert.throws(()=>computeParticipationCooldownEvidenceDigest(cProxy),/Proxy/i);
});


test('steering binding rejects hostile task lifecycle containers before imported validators read them',()=>{
  const previous=task();
  const next=task({updated_at:'2026-09-27T04:10:00.000Z'});
  const s=steering(previous,next);

  const proxy=new Proxy(structuredClone(previous),{});
  assert.throws(()=>verifyActiveTaskSteeringBinding(s,proxy,next),/Proxy/i);

  let reads=0;
  const accessor=structuredClone(previous);
  Object.defineProperty(accessor,'principal_id',{
    enumerable:true,
    get(){reads+=1; return 'owner.alice';}
  });
  assert.throws(()=>verifyActiveTaskSteeringBinding(s,accessor,next),/data properties/i);
  assert.equal(reads,0);

  const arrayProxy=new Proxy([...previous.result_refs],{});
  const arrayWrapped={...previous,result_refs:arrayProxy};
  assert.throws(()=>verifyActiveTaskSteeringBinding(s,arrayWrapped,next),/plain array/i);

  const sparse=structuredClone(previous);
  sparse.result_refs=new Array(1);
  assert.throws(()=>verifyActiveTaskSteeringBinding(s,sparse,next),/sparse|plain array/i);

  const customArray=structuredClone(previous);
  customArray.result_refs=[];
  Object.setPrototypeOf(customArray.result_refs,{custom:true});
  assert.throws(()=>verifyActiveTaskSteeringBinding(s,customArray,next),/plain array/i);
});


test('silent investigation binds exact policy and observation and is never valid for explicit requests',()=>{
  const p=policy();
  const o=observation();
  const result=silentResult(p,o);
  const bound=verifySilentInvestigationBinding(result,p,o);
  assert.equal(bound.bound,true);
  assert.deepEqual(bound.reasons,[]);
  assert.equal(bound.result_digest,silentInvestigationResultDigest(result));
  assert.equal(bound.communication_effect,'none');

  const wrongObservation=observation({context_id:'channel.other'});
  const mismatch=verifySilentInvestigationBinding(result,p,wrongObservation);
  assert.equal(mismatch.bound,false);
  assert.ok(mismatch.reasons.includes('silent-observation-digest-mismatch'));

  const explicit=observation({addressing_class:'explicit'});
  const explicitResult=silentResult(p,explicit);
  const explicitBinding=verifySilentInvestigationBinding(explicitResult,p,explicit);
  assert.equal(explicitBinding.bound,false);
  assert.ok(explicitBinding.reasons.includes('explicit-request-requires-response'));
});

test('silent interruption and policy-suppressed reasons require matching bounded evidence',()=>{
  const p=policy();
  const lowInterruption=observation({
    dimensions:{
      ...observation().dimensions,
      noise:10,
      interruption_cost:10
    }
  });
  const unsupported=silentResult(p,lowInterruption,{
    useful_finding:true,
    actionable_finding:true,
    silence_reason:'interruption-not-justified'
  });
  const unsupportedBinding=verifySilentInvestigationBinding(unsupported,p,lowInterruption);
  assert.equal(unsupportedBinding.bound,false);
  assert.ok(unsupportedBinding.reasons.includes('silence-reason-not-supported'));

  const highInterruption=observation({
    dimensions:{
      ...observation().dimensions,
      noise:10,
      interruption_cost:90
    }
  });
  const justified=silentResult(p,highInterruption,{
    useful_finding:true,
    actionable_finding:true,
    silence_reason:'interruption-not-justified'
  });
  assert.equal(verifySilentInvestigationBinding(justified,p,highInterruption).bound,true);

  const ordinary=silentResult(p,observation(),{
    useful_finding:true,
    actionable_finding:true,
    silence_reason:'policy-suppressed'
  });
  const ordinaryBinding=verifySilentInvestigationBinding(ordinary,p,observation());
  assert.equal(ordinaryBinding.bound,false);
  assert.ok(ordinaryBinding.reasons.includes('policy-does-not-suppress-context'));

  const quiet=structuredClone(p);
  quiet.preset='custom';
  quiet.quiet_context_ids=['channel.engineering'];
  const quietResult=silentResult(quiet,observation(),{
    useful_finding:true,
    actionable_finding:true,
    silence_reason:'policy-suppressed'
  });
  assert.equal(verifySilentInvestigationBinding(quietResult,quiet,observation()).bound,true);
});

test('silent investigation cannot be used when policy disables silent conclusions',()=>{
  const p=structuredClone(policy());
  p.preset='custom';
  p.silent_investigation=false;
  const o=observation();
  const result=silentResult(p,o);
  const binding=verifySilentInvestigationBinding(result,p,o);
  assert.equal(binding.bound,false);
  assert.ok(binding.reasons.includes('silent-investigation-disabled'));
});
