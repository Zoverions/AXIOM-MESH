import { ValidationError } from './canonical.mjs';
import { entityFoundationDigest, validateEntityFoundation } from './entity-foundation.mjs';
import { entityLayerDigest, validateEntityLayer } from './entity-layer.mjs';
import { validateEntityLayerStack } from './entity-layer-stack.mjs';

export function installEntityLayer(stack, foundation, layer, { precedence, updated_at }) {
  validateEntityLayerStack(stack);
  validateEntityFoundation(foundation);
  validateEntityLayer(layer);
  validateBinding(stack, foundation);
  canonicalDate(updated_at, 'updated_at');
  if (new Date(updated_at).getTime() < new Date(stack.updated_at).getTime()) throw new ValidationError('updated_at cannot precede current stack updated_at');
  if (!Number.isInteger(precedence) || precedence < 0) throw new ValidationError('precedence is invalid');
  if (stack.active_layers.some(item => item.layer_id === layer.layer_id)) throw new ValidationError(`layer ${layer.layer_id} is already active`);
  if (stack.active_layers.some(item => item.precedence === precedence)) throw new ValidationError(`precedence ${precedence} is already occupied`);
  if (stack.superseded_layer_ids.includes(layer.layer_id)) throw new ValidationError(`superseded layer ${layer.layer_id} cannot be reactivated without a successor layer`);

  const active_layers = [...stack.active_layers,{layer_id:layer.layer_id,layer_digest:entityLayerDigest(layer),precedence}].sort((a,b)=>a.precedence-b.precedence);
  return freezeStack({...stack,active_layers,suspended_layer_ids:stack.suspended_layer_ids.filter(id=>id!==layer.layer_id),updated_at});
}

export function suspendEntityLayer(stack, layer_id, { updated_at }) {
  validateEntityLayerStack(stack);
  canonicalDate(updated_at, 'updated_at');
  if (new Date(updated_at).getTime() < new Date(stack.updated_at).getTime()) throw new ValidationError('updated_at cannot precede current stack updated_at');
  const exists = stack.active_layers.some(item => item.layer_id === layer_id);
  if (!exists) throw new ValidationError(`layer ${layer_id} is not active`);
  return freezeStack({...stack,active_layers:stack.active_layers.filter(item=>item.layer_id!==layer_id),suspended_layer_ids:[...stack.suspended_layer_ids,layer_id].sort(),updated_at});
}

export function supersedeEntityLayer(stack, currentLayer, successorLayer, { updated_at }) {
  validateEntityLayerStack(stack);
  validateEntityLayer(currentLayer);
  validateEntityLayer(successorLayer);
  canonicalDate(updated_at, 'updated_at');
  if (new Date(updated_at).getTime() < new Date(stack.updated_at).getTime()) throw new ValidationError('updated_at cannot precede current stack updated_at');
  const currentRef = stack.active_layers.find(item => item.layer_id === currentLayer.layer_id);
  if (!currentRef) throw new ValidationError(`predecessor layer ${currentLayer.layer_id} is not active`);
  if (currentRef.layer_digest !== entityLayerDigest(currentLayer)) throw new ValidationError('active predecessor digest does not match current layer');
  if (successorLayer.predecessor_layer_ref !== currentLayer.layer_id) throw new ValidationError('successor predecessor_layer_ref must cite current layer');
  if (successorLayer.layer_id === currentLayer.layer_id) throw new ValidationError('successor layer_id must differ from predecessor');
  if (successorLayer.layer_version <= currentLayer.layer_version) throw new ValidationError('successor layer_version must advance predecessor version');
  if (stack.active_layers.some(item => item.layer_id === successorLayer.layer_id)) throw new ValidationError(`successor layer ${successorLayer.layer_id} is already active`);
  if (stack.superseded_layer_ids.includes(successorLayer.layer_id)) throw new ValidationError(`successor layer ${successorLayer.layer_id} is already superseded`);

  const active_layers = stack.active_layers.filter(item=>item.layer_id!==currentLayer.layer_id).concat({layer_id:successorLayer.layer_id,layer_digest:entityLayerDigest(successorLayer),precedence:currentRef.precedence}).sort((a,b)=>a.precedence-b.precedence);
  return freezeStack({...stack,active_layers,suspended_layer_ids:stack.suspended_layer_ids.filter(id=>id!==successorLayer.layer_id),superseded_layer_ids:[...stack.superseded_layer_ids,currentLayer.layer_id].sort(),updated_at});
}

function validateBinding(stack, foundation) {
  if (stack.foundation_id !== foundation.foundation_id) throw new ValidationError('Layer stack foundation_id does not match foundation');
  if (stack.foundation_digest !== entityFoundationDigest(foundation)) throw new ValidationError('Layer stack foundation_digest does not match foundation');
}

function canonicalDate(value, label) {
  if (typeof value !== 'string' || value.length > 64) throw new ValidationError(`${label} must be a canonical ISO timestamp`);
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString() !== value) throw new ValidationError(`${label} must be a canonical ISO timestamp`);
}

function freezeStack(stack) {
  Object.freeze(stack.active_layers);
  Object.freeze(stack.suspended_layer_ids);
  Object.freeze(stack.superseded_layer_ids);
  return Object.freeze(stack);
}
