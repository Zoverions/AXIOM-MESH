import { digestObject, ValidationError } from './canonical.mjs';
import { entityFoundationDigest, validateEntityFoundation } from './entity-foundation.mjs';
import { entityLayerStackDigest, validateEntityLayerStack } from './entity-layer-stack.mjs';

export const ENTITY_LINEAGE_EVENT_SCHEMA = 'axiom-entity-lineage-event.v0';
const IDENTIFIER=/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/;
const DIGEST=/^[a-f0-9]{64}$/;

export function validateEntityLineageEvent(document) {
  validateEventShape(document);
  return Object.freeze({valid:true,schema:document.schema,event_id:document.event_id,event_type:document.event_type,lineage_root_id:document.lineage_root_id,event_digest:digestObject(document),subjective_identity_claim:'unspecified',authority_effect:'none',network_effect:'none',runtime_activation:false});
}

export function entityLineageEventDigest(document) { validateEventShape(document); return digestObject(document); }

export function forkEntityLineage(parentFoundation, parentStack, { event_id, child_entity_id, child_foundation_id, child_stack_id, forked_at }) {
  validateEntityFoundation(parentFoundation);
  validateEntityLayerStack(parentStack);
  id(event_id,'event_id'); id(child_entity_id,'child_entity_id'); id(child_foundation_id,'child_foundation_id'); id(child_stack_id,'child_stack_id');
  const forkedAt = date(forked_at,'forked_at');
  if (parentStack.foundation_id !== parentFoundation.foundation_id) throw new ValidationError('Parent stack foundation_id does not match parent foundation');
  if (parentStack.foundation_digest !== entityFoundationDigest(parentFoundation)) throw new ValidationError('Parent stack foundation_digest does not match parent foundation');
  if (child_entity_id === parentFoundation.entity_id) throw new ValidationError('child_entity_id must differ from parent entity_id');
  if (child_foundation_id === parentFoundation.foundation_id) throw new ValidationError('child_foundation_id must differ from parent foundation_id');
  if (child_stack_id === parentStack.stack_id) throw new ValidationError('child_stack_id must differ from parent stack_id');
  if (forkedAt < new Date(parentStack.updated_at).getTime() || forkedAt < new Date(parentFoundation.created_at).getTime()) throw new ValidationError('forked_at cannot precede parent state');

  const child_foundation = Object.freeze({...parentFoundation,foundation_id:child_foundation_id,entity_id:child_entity_id,core_contract_refs:Object.freeze([...parentFoundation.core_contract_refs]),created_at:forked_at});
  validateEntityFoundation(child_foundation);

  const child_stack = Object.freeze({...parentStack,stack_id:child_stack_id,foundation_id:child_foundation_id,foundation_digest:entityFoundationDigest(child_foundation),active_layers:Object.freeze(parentStack.active_layers.map(item=>Object.freeze({...item}))),suspended_layer_ids:Object.freeze([...parentStack.suspended_layer_ids]),superseded_layer_ids:Object.freeze([...parentStack.superseded_layer_ids]),created_at:forked_at,updated_at:forked_at});
  validateEntityLayerStack(child_stack);

  const event = Object.freeze({schema:ENTITY_LINEAGE_EVENT_SCHEMA,version:0,status:'inert-contract-laboratory',event_id,event_type:'fork',lineage_root_id:parentFoundation.lineage_root_id,parent_entity_id:parentFoundation.entity_id,parent_foundation_id:parentFoundation.foundation_id,parent_foundation_digest:entityFoundationDigest(parentFoundation),parent_stack_id:parentStack.stack_id,parent_stack_digest:entityLayerStackDigest(parentStack),child_entity_id,child_foundation_id,child_foundation_digest:entityFoundationDigest(child_foundation),child_stack_id,child_stack_digest:entityLayerStackDigest(child_stack),copied_active_layer_ids:Object.freeze(parentStack.active_layers.map(item=>item.layer_id)),forked_at,subjective_identity_claim:'unspecified',authority_effect:'none',network_effect:'none',runtime_activation:false});
  validateEventShape(event);
  return Object.freeze({child_foundation, child_stack, event});
}

function validateEventShape(document) {
  exactObject(document,'Entity lineage event',['schema','version','status','event_id','event_type','lineage_root_id','parent_entity_id','parent_foundation_id','parent_foundation_digest','parent_stack_id','parent_stack_digest','child_entity_id','child_foundation_id','child_foundation_digest','child_stack_id','child_stack_digest','copied_active_layer_ids','forked_at','subjective_identity_claim','authority_effect','network_effect','runtime_activation']);
  if (document.schema!==ENTITY_LINEAGE_EVENT_SCHEMA||document.version!==0||document.status!=='inert-contract-laboratory'||document.event_type!=='fork') throw new ValidationError('Entity lineage event schema/version/status/type is invalid');
  for (const [value,label] of [[document.event_id,'event_id'],[document.lineage_root_id,'lineage_root_id'],[document.parent_entity_id,'parent_entity_id'],[document.parent_foundation_id,'parent_foundation_id'],[document.parent_stack_id,'parent_stack_id'],[document.child_entity_id,'child_entity_id'],[document.child_foundation_id,'child_foundation_id'],[document.child_stack_id,'child_stack_id']]) id(value,label);
  for (const [value,label] of [[document.parent_foundation_digest,'parent_foundation_digest'],[document.parent_stack_digest,'parent_stack_digest'],[document.child_foundation_digest,'child_foundation_digest'],[document.child_stack_digest,'child_stack_digest']]) digest(value,label);
  uniqueIds(document.copied_active_layer_ids,'copied_active_layer_ids',0,64);
  date(document.forked_at,'forked_at');
  if (document.subjective_identity_claim!=='unspecified') throw new ValidationError('subjective_identity_claim must remain unspecified');
  if (document.parent_entity_id===document.child_entity_id) throw new ValidationError('parent and child entity ids must differ');
  if (document.parent_foundation_id===document.child_foundation_id) throw new ValidationError('parent and child foundation ids must differ');
  if (document.parent_stack_id===document.child_stack_id) throw new ValidationError('parent and child stack ids must differ');
  if (document.authority_effect!=='none'||document.network_effect!=='none'||document.runtime_activation!==false) throw new ValidationError('Entity lineage event activation boundary is invalid');
  return document;
}

function exactObject(v,l,fields){if(!v||typeof v!=='object'||Array.isArray(v))throw new ValidationError(`${l} must be an object`);const p=Object.getPrototypeOf(v);if(p!==Object.prototype&&p!==null)throw new ValidationError(`${l} must be a plain object`);const a=new Set(fields);for(const k of Object.keys(v))if(!a.has(k))throw new ValidationError(`${l} contains unknown field ${k}`);for(const k of fields)if(!Object.hasOwn(v,k))throw new ValidationError(`${l} is missing required field ${k}`);}
function id(v,l){if(typeof v!=='string'||!IDENTIFIER.test(v))throw new ValidationError(`${l} is invalid`);return v;}
function digest(v,l){if(typeof v!=='string'||!DIGEST.test(v))throw new ValidationError(`${l} is invalid`);return v;}
function uniqueIds(v,l,min,max){if(!Array.isArray(v)||v.length<min||v.length>max)throw new ValidationError(`${l} must contain ${min}-${max} items`);const seen=new Set();for(const i of v){id(i,l);if(seen.has(i))throw new ValidationError(`${l} contains duplicate ${i}`);seen.add(i);}}
function date(v,l){if(typeof v!=='string'||v.length>64)throw new ValidationError(`${l} must be a canonical ISO timestamp`);const d=new Date(v);if(!Number.isFinite(d.getTime())||d.toISOString()!==v)throw new ValidationError(`${l} must be a canonical ISO timestamp`);return d.getTime();}
