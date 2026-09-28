import assert from 'node:assert/strict';
import test from 'node:test';

import {
  ACTIVE_TASK_STEERING_SCHEMA,
  PARTICIPATION_OBSERVATION_SCHEMA,
  SILENT_INVESTIGATION_RESULT_SCHEMA,
  activeTaskSteeringDigest,
  createParticipationPreset,
  evaluateParticipation,
  fallbackParticipationDecision,
  participationObservationDigest,
  participationPolicyDigest,
  silentInvestigationResultDigest,
  validateActiveTaskSteering,
  validateParticipationObservation,
  validateParticipationPolicy,
  validateSilentInvestigationResult
} from '../src/lib/ambient-participation-policy.mjs';

const A='a'.repeat(64);
const B='b'.repeat(64);
const C='c'.repeat(64);
const D='d'.repeat(64);

function observation(overrides={}) {
  return {
    schema: PARTICIPATION_OBSERVATION_SCHEMA,
    version: 0,
    status: 'inert-participation-observation',
    observation_id: 'participation.observation.demo.1',
    event_digest: A,
    state_digest: B,
    task_id: 'task.demo.1',
    principal_id: 'owner.alice',
    context_id: 'channel.engineering',
    context_class: 'organization',
    addressing_class: 'passive',
    producer_ref: 'bounded.provider.jev',
    producer_revision_ref: 'jev.1.13',
    observed_at: '2026-09-27T04:10:00.000Z',
    applicability: 'current',
    dimensions: {
      usefulness: 85,
      answer_confidence: 82,
      urgency: 50,
      noise: 20,
      interruption_cost: 30,
      investigation_value: 76,
      acknowledgement_fit: 45
    },
    evidence_refs: ['bounded.observation.usefulness.1'],
    score_semantics: 'uncalibrated-ordinal-0-100',
    authority_effect: 'none',
    assurance_effect: 'none',
    execution_effect: 'none',
    runtime_activation: false,
    ...overrides
  };
}

function event(overrides={}) {
  return {
    event_digest: A,
    event_class: 'passive',
    context_id: 'channel.engineering',
    context_class: 'organization',
    evaluated_at: '2026-09-27T04:10:00.000Z',
    supported: true,
    quiet_context: false,
    cooldown_state: 'ready',
    already_answered: false,
    consequence_class: 'C1',
    ...overrides
  };
}

function policy(name='balanced') {
  return createParticipationPreset(name, {
    policyId: 'participation.policy.' + name + '.1',
    policySourceRef: 'owner.policy.demo',
    issuedAt: '2026-09-27T04:00:00.000Z'
  });
}

test('preset policies are inert closed policy packages rather than authority', () => {
  for (const name of ['listener','investigator','balanced','teammate']) {
    const p=policy(name);
    assert.equal(validateParticipationPolicy(p).valid,true);
    assert.equal(p.grants_authority,false);
    assert.equal(p.data_scope_effect,'none');
    assert.equal(p.execution_effect,'none');
    assert.equal(p.runtime_activation,false);
    assert.equal(p.threshold_basis,'illustrative-unvalidated');
    assert.equal(participationPolicyDigest(p),validateParticipationPolicy(p).policy_digest);
  }
});

test('explicit requests enter normal answer handling regardless of passive preset', () => {
  const o=observation({addressing_class:'explicit'});
  const d=evaluateParticipation(o,policy('listener'),event({event_class:'explicit',cooldown_state:'unavailable'}));
  assert.equal(d.action,'ANSWER');
  assert.deepEqual(d.reasons,['explicit-request']);
  assert.equal(d.authority_effect,'none');
  assert.equal(d.execution_effect,'none');
});

test('listener mode stays silent for passive events', () => {
  const d=evaluateParticipation(observation(),policy('listener'),event());
  assert.equal(d.action,'PASS');
  assert.deepEqual(d.reasons,['passive-disabled']);
});

test('balanced mode answers a useful confident low-interruption passive event', () => {
  const d=evaluateParticipation(observation(),policy('balanced'),event());
  assert.equal(d.action,'ANSWER');
  assert.deepEqual(d.reasons,['passive-reply-threshold-met']);
});

test('investigates when reply threshold is not met but investigation value is', () => {
  const o=observation({dimensions:{
    usefulness:60,answer_confidence:50,urgency:50,noise:10,interruption_cost:20,
    investigation_value:90,acknowledgement_fit:20
  }});
  assert.equal(evaluateParticipation(o,policy('balanced'),event()).action,'INVESTIGATE');
});

test('acknowledges when response and investigation are weak but reaction fit is high', () => {
  const o=observation({dimensions:{
    usefulness:20,answer_confidence:40,urgency:10,noise:10,interruption_cost:20,
    investigation_value:20,acknowledgement_fit:95
  }});
  assert.equal(evaluateParticipation(o,policy('balanced'),event()).action,'ACKNOWLEDGE');
});

test('duplicate human answer, quiet context, stale observation and cooldown failure all pass', () => {
  const p=policy('teammate');
  const cases=[
    [observation(),event({already_answered:true}),'already-answered'],
    [observation(),event({quiet_context:true}),'quiet-context'],
    [observation({applicability:'stale'}),event(),'observation-not-current'],
    [observation(),event({cooldown_state:'blocked'}),'cooldown-blocked'],
    [observation(),event({cooldown_state:'unavailable'}),'cooldown-unavailable']
  ];
  for (const [o,e,reason] of cases) {
    const d=evaluateParticipation(o,p,e);
    assert.equal(d.action,'PASS');
    assert.equal(d.reasons[0],reason);
  }
});

test('unknown passive risk dimensions fail closed rather than interpolate', () => {
  const o=observation({dimensions:{
    usefulness:90,answer_confidence:90,urgency:null,noise:null,interruption_cost:20,
    investigation_value:90,acknowledgement_fit:90
  }});
  const d=evaluateParticipation(o,policy('teammate'),event());
  assert.equal(d.action,'PASS');
  assert.deepEqual(d.reasons,['passive-risk-dimension-unknown']);
});

test('context/event binding drift passes silently instead of using observations from another room', () => {
  const d=evaluateParticipation(observation(),policy('teammate'),event({context_id:'channel.public'}));
  assert.equal(d.action,'PASS');
  assert.ok(d.reasons.includes('context-mismatch'));
});



test('expired policy fails closed for passive participation but does not suppress an explicit request', () => {
  const p=createParticipationPreset('balanced', {
    policyId:'participation.policy.expiring.1',
    policySourceRef:'owner.policy.demo',
    issuedAt:'2026-09-27T04:00:00.000Z',
    expiresAt:'2026-09-27T04:05:00.000Z'
  });
  const passive=evaluateParticipation(observation(),p,event());
  assert.equal(passive.action,'PASS');
  assert.deepEqual(passive.reasons,['policy-expired']);

  const explicit=evaluateParticipation(
    observation({addressing_class:'explicit'}),
    p,
    event({event_class:'explicit'})
  );
  assert.equal(explicit.action,'ANSWER');
  assert.deepEqual(explicit.reasons,['explicit-request-semantic-policy-bypassed']);
  assert.equal(explicit.observation_digest,null);
  assert.equal(explicit.policy_digest,null);
});

test('future-issued policy and future semantic observation fail closed for passive input', () => {
  const futurePolicy=createParticipationPreset('balanced', {
    policyId:'participation.policy.future.1',
    policySourceRef:'owner.policy.demo',
    issuedAt:'2026-09-27T04:20:00.000Z'
  });
  const notYetEffective=evaluateParticipation(observation(),futurePolicy,event());
  assert.equal(notYetEffective.action,'PASS');
  assert.deepEqual(notYetEffective.reasons,['policy-not-yet-effective']);

  const futureObservation=evaluateParticipation(
    observation({observed_at:'2026-09-27T04:20:00.000Z'}),
    policy('balanced'),
    event()
  );
  assert.equal(futureObservation.action,'PASS');
  assert.deepEqual(futureObservation.reasons,['observation-from-future']);
});

test('future currentness anomalies cannot suppress an explicit supported request', () => {
  const futurePolicy=createParticipationPreset('balanced', {
    policyId:'participation.policy.future.explicit.1',
    policySourceRef:'owner.policy.demo',
    issuedAt:'2026-09-27T04:20:00.000Z'
  });
  const policyBypass=evaluateParticipation(
    observation({addressing_class:'explicit'}),
    futurePolicy,
    event({event_class:'explicit'})
  );
  assert.equal(policyBypass.action,'ANSWER');
  assert.deepEqual(policyBypass.reasons,['explicit-request-semantic-policy-bypassed']);
  assert.equal(policyBypass.observation_digest,null);
  assert.equal(policyBypass.policy_digest,null);

  const observationBypass=evaluateParticipation(
    observation({
      addressing_class:'explicit',
      observed_at:'2026-09-27T04:20:00.000Z'
    }),
    policy('balanced'),
    event({event_class:'explicit'})
  );
  assert.equal(observationBypass.action,'ANSWER');
  assert.deepEqual(observationBypass.reasons,['explicit-request-semantic-policy-bypassed']);
  assert.equal(observationBypass.observation_digest,null);
  assert.equal(observationBypass.policy_digest,null);
});

test('context allowlist permits only named contexts and is fail-closed when empty or inconsistent', () => {
  const p=structuredClone(policy('balanced'));
  p.preset='custom';
  p.context_scope_mode='allowlist';
  p.allowed_context_ids=['channel.allowed'];
  assert.equal(validateParticipationPolicy(p).valid,true);

  const denied=evaluateParticipation(observation(),p,event());
  assert.equal(denied.action,'PASS');
  assert.deepEqual(denied.reasons,['context-not-allowlisted']);

  const allowed=evaluateParticipation(
    observation({context_id:'channel.allowed'}),
    p,
    event({context_id:'channel.allowed'})
  );
  assert.equal(allowed.action,'ANSWER');

  const empty=structuredClone(p);
  empty.allowed_context_ids=[];
  assert.throws(()=>validateParticipationPolicy(empty),/requires allowed_context_ids/);

  const inconsistent=structuredClone(policy('balanced'));
  inconsistent.allowed_context_ids=['channel.unexpected'];
  assert.throws(()=>validateParticipationPolicy(inconsistent),/cannot carry allowed_context_ids/);
});

test('explicit request ignores unusable semantic binding instead of silently dropping the user request', () => {
  const d=evaluateParticipation(
    observation({addressing_class:'passive',context_id:'channel.other'}),
    policy('balanced'),
    event({event_class:'explicit'})
  );
  assert.equal(d.action,'ANSWER');
  assert.deepEqual(d.reasons,['explicit-request-semantic-policy-bypassed']);
  assert.equal(d.observation_digest,null);
  assert.equal(d.policy_digest,null);
});

test('fallback is conservative for passive input and still permits explicit task handling', () => {
  assert.equal(fallbackParticipationDecision(event()).action,'PASS');
  assert.equal(fallbackParticipationDecision(event({event_class:'explicit'})).action,'ANSWER');
  assert.equal(fallbackParticipationDecision(event({event_class:'explicit',supported:false})).action,'PASS');
});

test('policy threshold/calibration boundaries reject authority flips and invalid values', () => {
  const base=structuredClone(policy('balanced'));
  for (const mutate of [
    x=>{x.grants_authority=true;},
    x=>{x.data_scope_effect='expand';},
    x=>{x.runtime_activation=true;},
    x=>{x.thresholds.reply_usefulness_min=101;},
    x=>{x.threshold_basis='calibrated';},
    x=>{x.allowed_context_classes.push('secret');},
    x=>{x.context_scope_mode='other';}
  ]) {
    const x=structuredClone(base); mutate(x);
    assert.throws(()=>validateParticipationPolicy(x));
  }
});

test('observation dimensions are evidence only and support explicit unknowns', () => {
  const o=observation({dimensions:{
    usefulness:null,answer_confidence:null,urgency:null,noise:null,interruption_cost:null,
    investigation_value:null,acknowledgement_fit:null
  }});
  const v=validateParticipationObservation(o);
  assert.equal(v.valid,true);
  assert.equal(v.authority_effect,'none');
  assert.equal(participationObservationDigest(o),v.observation_digest);
  const flipped=structuredClone(o); flipped.assurance_effect='A3';
  assert.throws(()=>validateParticipationObservation(flipped));
});

test('steering is evidence-only and APPEND/REPLACE require a resulting revision', () => {
  const base={
    schema: ACTIVE_TASK_STEERING_SCHEMA,
    version:0,
    status:'inert-steering-evidence',
    steering_id:'steering.demo.1',
    task_id:'task.demo.1',
    previous_task_digest:A,
    new_event_digest:B,
    actor_principal_id:'owner.alice',
    semantic_observation_digest:C,
    authority_snapshot_ref:'authority.snapshot.1',
    decision:'APPEND',
    resulting_task_revision_digest:D,
    decided_at:'2026-09-27T04:11:00.000Z',
    grants_authority:false,
    delegation_effect:'none',
    execution_effect:'none',
    runtime_activation:false
  };
  assert.equal(validateActiveTaskSteering(base).valid,true);
  assert.equal(activeTaskSteeringDigest(base),validateActiveTaskSteering(base).steering_digest);
  for (const decision of ['IGNORE','STOP']) {
    const x={...base,decision,resulting_task_revision_digest:null};
    assert.equal(validateActiveTaskSteering(x).decision,decision);
  }
  assert.throws(()=>validateActiveTaskSteering({...base,decision:'REPLACE',resulting_task_revision_digest:null}));
  assert.throws(()=>validateActiveTaskSteering({...base,grants_authority:true}));
});

test('silent investigation is a valid terminal evidence result without a message', () => {
  const r={
    schema:SILENT_INVESTIGATION_RESULT_SCHEMA,
    version:0,
    status:'inert-silent-investigation-evidence',
    result_id:'investigation.result.demo.1',
    task_id:'task.demo.1',
    policy_digest:A,
    observation_digest:B,
    started_at:'2026-09-27T04:10:00.000Z',
    completed_at:'2026-09-27T04:12:00.000Z',
    evidence_refs:['evidence.search.1'],
    useful_finding:false,
    actionable_finding:false,
    silence_reason:'no-useful-finding',
    steps_used:4,
    tool_calls:2,
    duration_ms:120000,
    unresolved_unknowns:[],
    emitted_message:false,
    authority_effect:'none',
    execution_effect:'none',
    runtime_activation:false
  };
  const v=validateSilentInvestigationResult(r);
  assert.equal(v.valid,true);
  assert.equal(v.emitted_message,false);
  assert.equal(silentInvestigationResultDigest(r),v.result_digest);
  assert.throws(()=>validateSilentInvestigationResult({...r,emitted_message:true}));
  assert.throws(()=>validateSilentInvestigationResult({...r,useful_finding:true}));
});

test('closed documents reject unknown fields, symbols, accessors and inherited prototypes', () => {
  const base=structuredClone(observation());
  assert.throws(()=>validateParticipationObservation({...base,authority:true}));
  const symbol=structuredClone(base); symbol[Symbol('authority')]='grant';
  assert.throws(()=>validateParticipationObservation(symbol),/symbol/i);
  const accessor=structuredClone(base);
  Object.defineProperty(accessor,'producer_ref',{enumerable:true,get(){throw new Error('getter ran');}});
  assert.throws(()=>validateParticipationObservation(accessor),/data properties/i);
  const inherited=Object.assign(Object.create({grant:true}),base);
  assert.throws(()=>validateParticipationObservation(inherited),/plain object/i);
  const proxy=new Proxy(structuredClone(base),{});
  assert.throws(()=>validateParticipationObservation(proxy),/Proxy/i);
});
