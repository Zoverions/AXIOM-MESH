import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  taskArtifactSnapshotDigest,
  taskHandoffDetailDigest,
  verifyClosedTaskCausalGraph,
  verifyTaskHandoffEdge,
  verifyTaskSnapshotTransition
} from '../src/lib/runtime-task-continuity.mjs';

const minimalUrl=new URL('./fixtures/runtime-connector-fabric/handoff-minimal.json',import.meta.url);
const uncertainUrl=new URL('./fixtures/runtime-connector-fabric/handoff-uncertain.json',import.meta.url);

async function load(url){return JSON.parse(await readFile(url,'utf8'));}

function event(event_id,type,at,actor='principal:owner'){
  return {event_id,type,at,actor_principal_id:actor};
}

async function running(){
  const value=await load(minimalUrl);
  value.lifecycle.state='running';
  value.lifecycle.updated_at='2026-08-21T23:31:05Z';
  value.events=[
    event('event:created-001','task.created','2026-08-21T23:31:00Z'),
    event('event:started-001','task.started','2026-08-21T23:31:05Z')
  ];
  return value;
}

async function completed(){
  const value=await running();
  value.lifecycle.state='completed';
  value.lifecycle.updated_at='2026-08-21T23:31:10Z';
  value.lifecycle.terminal_receipt_id='receipt:minimal-001';
  value.outputs.push({
    artifact_id:'artifact:output-001',
    sha256:'2'.repeat(64),
    size_bytes:64,
    mime_type:'application/json',
    source_principal_id:'principal:owner',
    source_task_id:value.task_id,
    data_class:'derived-owner-data',
    retention_class:'session'
  });
  value.events.push(event('event:completed-001','task.completed','2026-08-21T23:31:10Z'));
  return value;
}

test('task snapshot transition binds exact task identity and append-only lifecycle',async()=>{
  const queued=await load(minimalUrl);
  const active=await running();
  const first=verifyTaskSnapshotTransition(queued,active);
  assert.equal(first.valid,true);
  assert.equal(first.previous_state,'queued');
  assert.equal(first.current_state,'running');
  assert.equal(first.appended_events,2);
  assert.equal(first.authority_effect,'none');

  const done=await completed();
  const second=verifyTaskSnapshotTransition(active,done);
  assert.equal(second.current_state,'completed');
  assert.equal(second.appended_outputs,1);
  assert.equal(taskArtifactSnapshotDigest(done),second.current_snapshot_digest);
});

test('task transition rejects request/target mutation and budget widening',async()=>{
  const active=await running();

  const purpose=structuredClone(active);
  purpose.lifecycle.updated_at='2026-08-21T23:31:06Z';
  purpose.request.purpose='different-purpose';
  assert.throws(()=>verifyTaskSnapshotTransition(active,purpose),/request is immutable/);

  const target=structuredClone(active);
  target.lifecycle.updated_at='2026-08-21T23:31:06Z';
  target.execution_target.catalog_entry_version='0.2.0';
  assert.throws(()=>verifyTaskSnapshotTransition(active,target),/execution_target is immutable/);

  const budget=structuredClone(active);
  budget.lifecycle.updated_at='2026-08-21T23:31:06Z';
  budget.budgets.timeout_ms=6000;
  assert.throws(()=>verifyTaskSnapshotTransition(active,budget),/timeout_ms cannot widen/);
});

test('outputs and events remain append-only and chronological',async()=>{
  const done=await completed();

  const outputMutation=structuredClone(done);
  outputMutation.lifecycle.updated_at='2026-08-21T23:31:11Z';
  outputMutation.outputs[0].sha256='3'.repeat(64);
  assert.throws(()=>verifyTaskSnapshotTransition(done,outputMutation),/output at index 0 cannot be mutated/);

  const eventMutation=structuredClone(done);
  eventMutation.lifecycle.updated_at='2026-08-21T23:31:11Z';
  eventMutation.events[0].actor_principal_id='principal:attacker';
  assert.throws(()=>verifyTaskSnapshotTransition(done,eventMutation),/event at index 0 cannot be mutated/);

  const backdated=structuredClone(done);
  backdated.lifecycle.updated_at='2026-08-21T23:31:12Z';
  backdated.events.push(event('event:late-001','artifact.observed','2026-08-21T23:31:09Z'));
  assert.throws(()=>verifyTaskSnapshotTransition(done,backdated),/chronological|backdated/);
});

test('terminal snapshots are immutable and uncertainty resolves only to completed or failed',async()=>{
  const done=await completed();
  assert.equal(verifyTaskSnapshotTransition(done,structuredClone(done)).valid,true);

  const reopened=structuredClone(done);
  reopened.lifecycle.state='running';
  reopened.lifecycle.updated_at='2026-08-21T23:31:11Z';
  delete reopened.lifecycle.terminal_receipt_id;
  assert.throws(()=>verifyTaskSnapshotTransition(done,reopened),/Terminal task snapshot is immutable/);

  const appended=structuredClone(done);
  appended.lifecycle.updated_at='2026-08-21T23:31:11Z';
  appended.events.push(event('event:post-terminal','artifact.observed','2026-08-21T23:31:11Z'));
  assert.throws(()=>verifyTaskSnapshotTransition(done,appended),/Terminal task snapshot is immutable/);

  const uncertain=await load(uncertainUrl);
  const resolved=structuredClone(uncertain);
  resolved.lifecycle.state='completed';
  resolved.lifecycle.updated_at='2026-08-21T23:31:10Z';
  delete resolved.lifecycle.uncertainty_record_id;
  resolved.lifecycle.terminal_receipt_id='receipt:uncertain-resolved';
  resolved.events=[event('event:uncertain-resolved','task.completed','2026-08-21T23:31:10Z')];
  assert.equal(verifyTaskSnapshotTransition(uncertain,resolved).current_state,'completed');

  const cancelled=structuredClone(uncertain);
  cancelled.lifecycle.state='cancelled';
  cancelled.lifecycle.updated_at='2026-08-21T23:31:10Z';
  delete cancelled.lifecycle.uncertainty_record_id;
  cancelled.lifecycle.terminal_receipt_id='receipt:uncertain-cancelled';
  cancelled.lifecycle.state_reason='Cancellation cannot erase an uncertain effect.';
  cancelled.events=[event('event:uncertain-cancel','task.cancelled','2026-08-21T23:31:10Z')];
  assert.throws(()=>verifyTaskSnapshotTransition(uncertain,cancelled),/uncertain -> cancelled is invalid/);
});

async function handoffPair(){
  const source=await running();
  source.task_id='task:parent-001';
  source.causal_id='causal:workflow-001';
  source.lifecycle.updated_at='2026-08-21T23:31:06Z';
  source.request.data_classes=['owner-private'];
  // The exact child-bound handoff event is appended after the child identity is fixed below.

  const child=await load(minimalUrl);
  child.task_id='task:child-001';
  child.causal_id=source.causal_id;
  child.parent_task_id=source.task_id;
  child.handoff_from_task_id=source.task_id;
  child.requester={principal_id:'principal:worker',sponsor_principal_id:'principal:owner'};
  child.request={...child.request,purpose:source.request.purpose,destinations:['local'],data_classes:['owner-private']};
  child.budgets.timeout_ms=4000;
  child.lifecycle.created_at='2026-08-21T23:31:06Z';
  child.lifecycle.updated_at='2026-08-21T23:31:06Z';
  child.events=[event('event:child-created','task.created','2026-08-21T23:31:06Z','principal:worker')];
  source.events.push({
    ...event('event:handoff-001','task.handoff','2026-08-21T23:31:06Z'),
    detail_digest:taskHandoffDetailDigest(source.task_id,child.task_id,child.causal_id)
  });
  return {source,child};
}

test('handoff preserves causal/scope/budget boundaries without transferring authority',async()=>{
  const {source,child}=await handoffPair();
  const result=verifyTaskHandoffEdge(source,child);
  assert.equal(result.valid,true);
  assert.equal(result.authority_transfer,false);
  assert.equal(result.coordination_is_authorization,false);

  const widened=structuredClone(child);
  widened.request.destinations.push('https://outside.example');
  assert.throws(()=>verifyTaskHandoffEdge(source,widened),/destination widens source scope/);

  const budget=structuredClone(child);
  budget.budgets.timeout_ms=6000;
  assert.throws(()=>verifyTaskHandoffEdge(source,budget),/timeout_ms cannot widen/);

  const action=structuredClone(child);
  action.request.axiom_action='memory.delete';
  assert.throws(()=>verifyTaskHandoffEdge(source,action),/cannot change AXIOM action/);

  const capability=structuredClone(child);
  capability.request.capability_id='different.capability';
  assert.throws(()=>verifyTaskHandoffEdge(source,capability),/cannot change capability_id/);

  const unbound=structuredClone(source);
  unbound.events.find(item=>item.type==='task.handoff').detail_digest='0'.repeat(64);
  assert.throws(()=>verifyTaskHandoffEdge(unbound,child),/exact child-bound task.handoff event/);
});

test('handoff cannot reuse source grant and independent child grant requires delegation',async()=>{
  const {source,child}=await handoffPair();
  source.authority.grant_id='grant:parent';
  source.authority.grant_digest='f'.repeat(64);

  const reused=structuredClone(child);
  reused.authority.grant_id=source.authority.grant_id;
  reused.authority.grant_digest=source.authority.grant_digest;
  reused.authority.delegation_id='delegation:child';
  assert.throws(()=>verifyTaskHandoffEdge(source,reused),/cannot reuse source grant authority/);

  const independent=structuredClone(child);
  independent.authority.grant_id='grant:child';
  independent.authority.grant_digest='e'.repeat(64);
  assert.throws(()=>verifyTaskHandoffEdge(source,independent),/requires delegation_id/);

  independent.authority.delegation_id='delegation:child';
  assert.equal(verifyTaskHandoffEdge(source,independent).valid,true);
});

test('closed causal graph requires exact references, one root, and no cycles',async()=>{
  const {source,child}=await handoffPair();
  const valid=verifyClosedTaskCausalGraph([child,source]);
  const reordered=verifyClosedTaskCausalGraph([source,child]);
  assert.equal(valid.valid,true);
  assert.equal(valid.tasks,2);
  assert.equal(valid.causal_graphs,1);
  assert.equal(valid.authority_transfer,false);
  assert.equal(valid.graph_digest,reordered.graph_digest);

  const missing=structuredClone(child);
  missing.parent_task_id='task:missing';
  assert.throws(()=>verifyClosedTaskCausalGraph([source,missing]),/missing referenced task/);

  const a=await load(minimalUrl);
  const b=await load(minimalUrl);
  a.task_id='task:cycle-a';b.task_id='task:cycle-b';
  a.causal_id='causal:cycle';b.causal_id='causal:cycle';
  a.parent_task_id=b.task_id;b.parent_task_id=a.task_id;
  assert.throws(()=>verifyClosedTaskCausalGraph([a,b]),/contains a cycle/);
});
