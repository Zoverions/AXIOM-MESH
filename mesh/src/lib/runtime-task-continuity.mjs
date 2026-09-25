import { digestObject, ValidationError } from './canonical.mjs';
import { validateTaskArtifactHandoff } from './runtime-connector-fabric-contracts.mjs';

const TERMINAL = new Set(['completed','failed','cancelled','expired']);
const TRANSITIONS = Object.freeze({
  queued: new Set(['queued','running','awaiting-approval','blocked','completed','failed','cancelled','expired','uncertain']),
  running: new Set(['running','awaiting-approval','blocked','completed','failed','cancelled','expired','uncertain']),
  'awaiting-approval': new Set(['awaiting-approval','running','blocked','completed','failed','cancelled','expired','uncertain']),
  blocked: new Set(['blocked','running','awaiting-approval','completed','failed','cancelled','expired','uncertain']),
  uncertain: new Set(['uncertain','completed','failed']),
  completed: new Set(['completed']),
  failed: new Set(['failed']),
  cancelled: new Set(['cancelled']),
  expired: new Set(['expired'])
});
const STATE_EVENT = Object.freeze({
  running:'task.started',
  'awaiting-approval':'task.awaiting-approval',
  blocked:'task.blocked',
  completed:'task.completed',
  failed:'task.failed',
  cancelled:'task.cancelled',
  expired:'task.expired',
  uncertain:'task.uncertain'
});

export function taskArtifactSnapshotDigest(task){
  validateTaskArtifactHandoff(task);
  return digestObject(task);
}

export function verifyTaskSnapshotTransition(previous,current){
  validateTaskArtifactHandoff(previous);
  validateTaskArtifactHandoff(current);

  same(previous.task_id,current.task_id,'task_id');
  same(previous.causal_id,current.causal_id,'causal_id');
  sameOptional(previous.parent_task_id,current.parent_task_id,'parent_task_id');
  sameOptional(previous.handoff_from_task_id,current.handoff_from_task_id,'handoff_from_task_id');
  sameObject(previous.requester,current.requester,'requester');
  sameObject(previous.execution_target,current.execution_target,'execution_target');
  sameObject(previous.request,current.request,'request');
  sameObject(previous.inputs,current.inputs,'inputs');

  verifyAuthorityMonotonic(previous.authority,current.authority);
  verifyBudgetAttenuation(previous.budgets,current.budgets);

  const previousUpdated = timestamp(previous.lifecycle.updated_at,'previous updated_at');
  const currentUpdated = timestamp(current.lifecycle.updated_at,'current updated_at');
  if(current.lifecycle.created_at!==previous.lifecycle.created_at){
    throw new ValidationError('Task lifecycle created_at is immutable');
  }
  if(currentUpdated<previousUpdated){
    throw new ValidationError('Task lifecycle updated_at cannot move backward');
  }

  const allowed=TRANSITIONS[previous.lifecycle.state];
  if(!allowed?.has(current.lifecycle.state)){
    throw new ValidationError(
      `Task lifecycle transition ${previous.lifecycle.state} -> ${current.lifecycle.state} is invalid`
    );
  }

  verifyLifecycleMetadata(previous.lifecycle,current.lifecycle,previousUpdated);
  verifyAppendOnlyArtifacts(previous.outputs,current.outputs);
  const newEvents=verifyAppendOnlyEvents(previous.events??[],current.events??[],previousUpdated);

  if(previous.lifecycle.state!==current.lifecycle.state){
    const expected=STATE_EVENT[current.lifecycle.state];
    if(expected&&!newEvents.some(event=>event.type===expected)){
      throw new ValidationError(`Task lifecycle transition to ${current.lifecycle.state} requires ${expected}`);
    }
  }
  if(
    previous.lifecycle.cancel_requested_at===undefined
    && current.lifecycle.cancel_requested_at!==undefined
    && !newEvents.some(event=>event.type==='task.cancel-requested')
  ){
    throw new ValidationError('New cancellation request requires task.cancel-requested event');
  }

  return Object.freeze({
    valid:true,
    schema:'axiom-task-snapshot-transition.v0',
    task_id:current.task_id,
    causal_id:current.causal_id,
    previous_snapshot_digest:digestObject(previous),
    current_snapshot_digest:digestObject(current),
    previous_state:previous.lifecycle.state,
    current_state:current.lifecycle.state,
    appended_events:newEvents.length,
    appended_outputs:current.outputs.length-previous.outputs.length,
    authority_transfer:false,
    authority_effect:'none',
    execution_effect:'none'
  });
}

export function verifyTaskHandoffEdge(source,child){
  validateTaskArtifactHandoff(source);
  validateTaskArtifactHandoff(child);

  if(source.task_id===child.task_id)throw new ValidationError('Task handoff source and child must differ');
  if(child.handoff_from_task_id!==source.task_id){
    throw new ValidationError('Task handoff child does not bind exact source task');
  }
  if(child.causal_id!==source.causal_id){
    throw new ValidationError('Task handoff must preserve causal_id');
  }
  if(child.parent_task_id!==undefined&&child.parent_task_id!==source.task_id){
    throw new ValidationError('Task handoff parent_task_id must match handoff source when present');
  }

  const childCreated=timestamp(child.lifecycle.created_at,'child created_at');
  const handoffEvents=(source.events??[]).filter(event=>event.type==='task.handoff');
  if(!handoffEvents.length){
    throw new ValidationError('Task handoff source requires a task.handoff event');
  }
  if(!handoffEvents.some(event=>timestamp(event.at,'handoff event at')<=childCreated)){
    throw new ValidationError('Task handoff event must not occur after child creation');
  }

  if(child.request.purpose!==source.request.purpose){
    throw new ValidationError('Task handoff cannot widen or replace purpose');
  }
  subset(child.request.destinations,source.request.destinations,'Task handoff destination');
  subset(child.request.data_classes??[],source.request.data_classes??[],'Task handoff data class');
  verifyBudgetAttenuation(source.budgets,child.budgets);

  if(
    source.authority.grant_id!==undefined
    && child.authority.grant_id!==undefined
    && (
      source.authority.grant_id===child.authority.grant_id
      || source.authority.grant_digest===child.authority.grant_digest
    )
  ){
    throw new ValidationError('Task handoff cannot reuse source grant authority');
  }
  if(
    child.requester.principal_id!==source.requester.principal_id
    && child.authority.grant_id!==undefined
    && child.authority.delegation_id===undefined
  ){
    throw new ValidationError('Independent handoff child authority requires delegation_id');
  }

  return Object.freeze({
    valid:true,
    schema:'axiom-task-handoff-edge-verification.v0',
    causal_id:child.causal_id,
    source_task_id:source.task_id,
    child_task_id:child.task_id,
    source_snapshot_digest:digestObject(source),
    child_snapshot_digest:digestObject(child),
    authority_transfer:false,
    coordination_is_authorization:false,
    authority_effect:'none',
    execution_effect:'none'
  });
}

export function verifyClosedTaskCausalGraph(tasks){
  if(!Array.isArray(tasks)||tasks.length<1||tasks.length>4096){
    throw new ValidationError('Task causal graph must contain 1-4096 task snapshots');
  }
  const byId=new Map();
  for(const task of tasks){
    validateTaskArtifactHandoff(task);
    if(byId.has(task.task_id))throw new ValidationError(`Duplicate task_id: ${task.task_id}`);
    byId.set(task.task_id,task);
  }

  const edges=new Map();
  for(const task of tasks){
    const refs=[task.parent_task_id,task.handoff_from_task_id].filter(Boolean);
    const unique=[...new Set(refs)];
    edges.set(task.task_id,unique);
    for(const ref of unique){
      const parent=byId.get(ref);
      if(!parent)throw new ValidationError(`Task causal graph missing referenced task ${ref}`);
      if(parent.causal_id!==task.causal_id){
        throw new ValidationError('Task causal graph edge crosses causal_id');
      }
      if(timestamp(task.lifecycle.created_at,'child created_at')<timestamp(parent.lifecycle.created_at,'parent created_at')){
        throw new ValidationError('Task causal graph child predates referenced task');
      }
    }
    if(task.handoff_from_task_id!==undefined){
      verifyTaskHandoffEdge(byId.get(task.handoff_from_task_id),task);
    }
  }

  detectCycles(edges);

  const causalGroups=new Map();
  for(const task of tasks){
    const list=causalGroups.get(task.causal_id)??[];
    list.push(task);
    causalGroups.set(task.causal_id,list);
  }
  for(const [causalId,group] of causalGroups){
    const roots=group.filter(task=>task.parent_task_id===undefined&&task.handoff_from_task_id===undefined);
    if(roots.length!==1){
      throw new ValidationError(`Closed causal graph ${causalId} must have exactly one root`);
    }
  }

  return Object.freeze({
    valid:true,
    schema:'axiom-task-causal-graph-verification.v0',
    tasks:tasks.length,
    causal_graphs:causalGroups.size,
    graph_digest:digestObject(tasks),
    authority_transfer:false,
    authority_effect:'none',
    execution_effect:'none'
  });
}

function verifyAuthorityMonotonic(previous,current){
  for(const field of [
    'authority_source','grant_required_before_effect','coordination_is_authorization',
    'handoff_transfers_authority','delegation_required_for_independent_child_authority'
  ])same(previous[field],current[field],`authority.${field}`);

  monotonicOptional(previous,current,'grant_id','authority grant_id');
  monotonicOptional(previous,current,'grant_digest','authority grant_digest');
  if((current.grant_id===undefined)!==(current.grant_digest===undefined)){
    throw new ValidationError('Current authority grant id/digest pair is incomplete');
  }
  monotonicOptional(previous,current,'delegation_id','authority delegation_id');
}

function verifyBudgetAttenuation(previous,current){
  if(current.timeout_ms>previous.timeout_ms){
    throw new ValidationError('Task budget timeout_ms cannot widen');
  }
  for(const field of ['max_steps','max_tool_calls','max_child_tasks']){
    attenuationNumber(previous,current,field);
  }
  if(previous.deadline_at!==undefined){
    if(current.deadline_at===undefined)throw new ValidationError('Task budget deadline cannot be removed');
    if(timestamp(current.deadline_at,'current deadline')>timestamp(previous.deadline_at,'previous deadline')){
      throw new ValidationError('Task budget deadline cannot widen');
    }
  }
  if(previous.cost_ceiling!==undefined){
    if(current.cost_ceiling===undefined)throw new ValidationError('Task cost ceiling cannot be removed');
    if(current.cost_ceiling.currency!==previous.cost_ceiling.currency){
      throw new ValidationError('Task cost ceiling currency cannot change');
    }
    if(current.cost_ceiling.amount_minor_units>previous.cost_ceiling.amount_minor_units){
      throw new ValidationError('Task cost ceiling cannot widen');
    }
  }
}

function attenuationNumber(previous,current,field){
  if(previous[field]===undefined)return;
  if(current[field]===undefined)throw new ValidationError(`Task budget ${field} cannot be removed`);
  if(current[field]>previous[field])throw new ValidationError(`Task budget ${field} cannot widen`);
}

function verifyLifecycleMetadata(previous,current,previousUpdated){
  if(previous.cancel_requested_at!==undefined){
    if(current.cancel_requested_at!==previous.cancel_requested_at){
      throw new ValidationError('Task cancel_requested_at cannot be removed or changed');
    }
  }else if(current.cancel_requested_at!==undefined){
    if(timestamp(current.cancel_requested_at,'cancel_requested_at')<previousUpdated){
      throw new ValidationError('New cancellation request cannot be backdated before previous snapshot');
    }
  }
  if(previous.terminal_receipt_id!==undefined&&current.terminal_receipt_id!==previous.terminal_receipt_id){
    throw new ValidationError('Task terminal_receipt_id is immutable once present');
  }
  if(
    previous.state==='uncertain'
    && current.state==='uncertain'
    && previous.uncertainty_record_id!==current.uncertainty_record_id
  ){
    throw new ValidationError('Task uncertainty_record_id is immutable while unresolved');
  }
  if(TERMINAL.has(previous.state)&&previous.state===current.state){
    if(previous.terminal_receipt_id!==current.terminal_receipt_id){
      throw new ValidationError('Terminal task receipt cannot change');
    }
  }
}

function verifyAppendOnlyArtifacts(previous,current){
  if(current.length<previous.length)throw new ValidationError('Task outputs cannot be removed');
  for(let index=0;index<previous.length;index+=1){
    if(digestObject(previous[index])!==digestObject(current[index])){
      throw new ValidationError(`Task output at index ${index} cannot be mutated or reordered`);
    }
  }
}

function verifyAppendOnlyEvents(previous,current,previousUpdated){
  if(current.length<previous.length)throw new ValidationError('Task events cannot be removed');
  let priorTime=null;
  for(let index=0;index<current.length;index+=1){
    const eventTime=timestamp(current[index].at,`event[${index}].at`);
    if(priorTime!==null&&eventTime<priorTime){
      throw new ValidationError('Task events must be chronological');
    }
    priorTime=eventTime;
    if(index<previous.length&&digestObject(previous[index])!==digestObject(current[index])){
      throw new ValidationError(`Task event at index ${index} cannot be mutated or reordered`);
    }
    if(index>=previous.length&&eventTime<previousUpdated){
      throw new ValidationError('New task event cannot be backdated before previous snapshot');
    }
  }
  return current.slice(previous.length);
}

function monotonicOptional(previous,current,field,label){
  if(previous[field]!==undefined&&current[field]!==previous[field]){
    throw new ValidationError(`${label} cannot be removed or changed`);
  }
}

function subset(actual,allowed,label){
  const set=new Set(allowed);
  for(const item of actual)if(!set.has(item))throw new ValidationError(`${label} widens source scope: ${item}`);
}

function detectCycles(edges){
  const visiting=new Set();
  const visited=new Set();
  function visit(id){
    if(visiting.has(id))throw new ValidationError('Task causal graph contains a cycle');
    if(visited.has(id))return;
    visiting.add(id);
    for(const parent of edges.get(id)??[])visit(parent);
    visiting.delete(id);
    visited.add(id);
  }
  for(const id of edges.keys())visit(id);
}

function same(left,right,label){if(left!==right)throw new ValidationError(`Task ${label} is immutable`);}
function sameOptional(left,right,label){if(left!==right)throw new ValidationError(`Task ${label} is immutable`);}
function sameObject(left,right,label){if(digestObject(left)!==digestObject(right))throw new ValidationError(`Task ${label} is immutable`);}
function timestamp(value,label){const parsed=new Date(value);if(!Number.isFinite(parsed.getTime()))throw new ValidationError(`${label} is invalid`);return parsed.getTime();}
