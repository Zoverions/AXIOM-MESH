import { digestObject, ValidationError } from './canonical.mjs';
import { entityFoundationDigest, validateEntityFoundation } from './entity-foundation.mjs';
import { entityLayerDigest, validateEntityLayer } from './entity-layer.mjs';

export const ENTITY_LAYER_STACK_SCHEMA = 'axiom-entity-layer-stack.v0';
const IDENTIFIER=/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/;
const DIGEST=/^[a-f0-9]{64}$/;

export function validateEntityLayerStack(document){
  validateShape(document);
  return Object.freeze({valid:true,schema:document.schema,stack_id:document.stack_id,foundation_id:document.foundation_id,stack_digest:digestObject(document),active_layer_count:document.active_layers.length,authority_effect:'none',network_effect:'none',runtime_activation:false});
}

export function entityLayerStackDigest(document){ validateShape(document); return digestObject(document); }

export function resolveEntityLayerStack(stack, foundation, layers){
  validateShape(stack);
  validateEntityFoundation(foundation);
  if(stack.foundation_id!==foundation.foundation_id) throw new ValidationError('Layer stack foundation_id does not match foundation');
  if(stack.foundation_digest!==entityFoundationDigest(foundation)) throw new ValidationError('Layer stack foundation_digest does not match foundation');
  if(!Array.isArray(layers)) throw new ValidationError('layers must be an array');
  const byId=new Map();
  for(const layer of layers){
    validateEntityLayer(layer);
    if(byId.has(layer.layer_id)) throw new ValidationError(`layers contains duplicate layer_id ${layer.layer_id}`);
    byId.set(layer.layer_id,layer);
  }
  const activeIds=new Set(stack.active_layers.map(item=>item.layer_id));
  for(const item of stack.active_layers){
    const layer=byId.get(item.layer_id);
    if(!layer) throw new ValidationError(`Layer stack is missing active layer ${item.layer_id}`);
    if(entityLayerDigest(layer)!==item.layer_digest) throw new ValidationError(`Layer stack digest mismatch for ${item.layer_id}`);
    for(const dep of layer.dependencies) if(!activeIds.has(dep)) throw new ValidationError(`Layer stack dependency ${dep} is missing for ${item.layer_id}`);
    for(const conflict of layer.conflicts) if(activeIds.has(conflict)) throw new ValidationError(`Layer stack conflict ${conflict} is active with ${item.layer_id}`);
  }
  return Object.freeze({
    valid:true,
    stack_id:stack.stack_id,
    foundation_id:stack.foundation_id,
    stack_digest:digestObject(stack),
    active_layer_ids:Object.freeze(stack.active_layers.map(item=>item.layer_id)),
    authority_effect:'none',
    network_effect:'none',
    runtime_activation:false
  });
}

function validateShape(document){
  exactObject(document,'Entity layer stack',['schema','version','status','stack_id','foundation_id','foundation_digest','active_layers','suspended_layer_ids','superseded_layer_ids','created_at','updated_at','authority_effect','network_effect','runtime_activation']);
  if(document.schema!==ENTITY_LAYER_STACK_SCHEMA||document.version!==0||document.status!=='inert-contract-laboratory') throw new ValidationError('Entity layer stack schema/version/status is invalid');
  id(document.stack_id,'stack_id'); id(document.foundation_id,'foundation_id'); digest(document.foundation_digest,'foundation_digest');
  validateActive(document.active_layers);
  uniqueIds(document.suspended_layer_ids,'suspended_layer_ids',0,64);
  uniqueIds(document.superseded_layer_ids,'superseded_layer_ids',0,64);
  const activeIds=new Set(document.active_layers.map(item=>item.layer_id));
  for(const idValue of document.suspended_layer_ids) if(activeIds.has(idValue)) throw new ValidationError(`active layer ${idValue} cannot also be suspended`);
  for(const idValue of document.superseded_layer_ids) if(activeIds.has(idValue)) throw new ValidationError(`active layer ${idValue} cannot also be superseded`);
  for(const idValue of document.suspended_layer_ids) if(document.superseded_layer_ids.includes(idValue)) throw new ValidationError(`layer ${idValue} cannot be both suspended and superseded`);
  const created=date(document.created_at,'created_at'); const updated=date(document.updated_at,'updated_at'); if(updated<created) throw new ValidationError('updated_at cannot precede created_at');
  if(document.authority_effect!=='none'||document.network_effect!=='none'||document.runtime_activation!==false) throw new ValidationError('Entity layer stack activation boundary is invalid');
  return document;
}

function validateActive(value){
  if(!Array.isArray(value)||value.length>64) throw new ValidationError('active_layers must contain at most 64 items');
  const ids=new Set(), precedences=new Set(); let last=-1;
  for(const item of value){
    exactObject(item,'Active layer reference',['layer_id','layer_digest','precedence']);
    id(item.layer_id,'active layer_id'); digest(item.layer_digest,'active layer_digest');
    if(!Number.isInteger(item.precedence)||item.precedence<0) throw new ValidationError('active layer precedence is invalid');
    if(ids.has(item.layer_id)) throw new ValidationError(`active_layers contains duplicate layer_id ${item.layer_id}`);
    if(precedences.has(item.precedence)) throw new ValidationError(`active_layers contains duplicate precedence ${item.precedence}`);
    if(item.precedence<=last) throw new ValidationError('active_layers precedence must be strictly increasing');
    ids.add(item.layer_id); precedences.add(item.precedence); last=item.precedence;
  }
}
function exactObject(v,l,fields){ if(!v||typeof v!=='object'||Array.isArray(v)) throw new ValidationError(`${l} must be an object`); const p=Object.getPrototypeOf(v); if(p!==Object.prototype&&p!==null) throw new ValidationError(`${l} must be a plain object`); const a=new Set(fields); for(const k of Object.keys(v)) if(!a.has(k)) throw new ValidationError(`${l} contains unknown field ${k}`); for(const k of fields) if(!Object.hasOwn(v,k)) throw new ValidationError(`${l} is missing required field ${k}`); }
function id(v,l){ if(typeof v!=='string'||!IDENTIFIER.test(v)) throw new ValidationError(`${l} is invalid`); return v; }
function digest(v,l){ if(typeof v!=='string'||!DIGEST.test(v)) throw new ValidationError(`${l} is invalid`); return v; }
function uniqueIds(v,l,min,max){ if(!Array.isArray(v)||v.length<min||v.length>max) throw new ValidationError(`${l} must contain ${min}-${max} items`); const seen=new Set(); for(const i of v){ id(i,l); if(seen.has(i)) throw new ValidationError(`${l} contains duplicate ${i}`); seen.add(i); } }
function date(v,l){ if(typeof v!=='string'||v.length>64) throw new ValidationError(`${l} must be a canonical ISO timestamp`); const d=new Date(v); if(!Number.isFinite(d.getTime())||d.toISOString()!==v) throw new ValidationError(`${l} must be a canonical ISO timestamp`); return d.getTime(); }
