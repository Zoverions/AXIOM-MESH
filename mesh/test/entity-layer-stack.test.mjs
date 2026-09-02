import assert from 'node:assert/strict';
import test from 'node:test';
import { entityFoundationDigest } from '../src/lib/entity-foundation.mjs';
import { entityLayerDigest } from '../src/lib/entity-layer.mjs';
import { ENTITY_LAYER_STACK_SCHEMA, entityLayerStackDigest, resolveEntityLayerStack, validateEntityLayerStack } from '../src/lib/entity-layer-stack.mjs';

function foundation(){ return {schema:'axiom-entity-foundation.v0',version:0,status:'inert-contract-laboratory',foundation_id:'foundation.blank-egg.primary',entity_id:'entity.blank.primary',lineage_root_id:'lineage.blank.primary',profile:'blank-egg',core_contract_refs:['contract.agency.v0'],recovery_policy_ref:null,privacy_policy_ref:null,personal_grounding_present:false,worldview_layers_present:false,disposition_layers_present:false,provider_binding_present:false,created_at:'2026-09-01T12:00:00.000Z',authority_effect:'none',network_effect:'none',runtime_activation:false}; }
function layer(id='layer.judgment.one', layerClass='judgment'){ return {schema:'axiom-entity-layer.v0',version:0,status:'inert-contract-laboratory',layer_id:id,layer_version:1,layer_class:layerClass,artifact_ref:`artifact.${id}`,artifact_digest:'c'.repeat(64),authors:['principal.author'],adopter_principal_id:'principal.entity',endorsement_mode:'entity',provenance_refs:[],influence_scopes:['reasoning-guidance'],privacy_class:'public',mutability:'evolvable',dependencies:[],conflicts:[],predecessor_layer_ref:null,created_at:'2026-09-01T12:00:00.000Z',adopted_at:'2026-09-01T12:01:00.000Z',expires_at:null,contains_raw_private_content:false,authority_effect:'none',network_effect:'none',runtime_activation:false}; }
function stack(active=[]){ const f=foundation(); return {schema:'axiom-entity-layer-stack.v0',version:0,status:'inert-contract-laboratory',stack_id:'stack.blank.primary',foundation_id:f.foundation_id,foundation_digest:entityFoundationDigest(f),active_layers:active,suspended_layer_ids:[],superseded_layer_ids:[],created_at:'2026-09-01T12:02:00.000Z',updated_at:'2026-09-01T12:02:00.000Z',authority_effect:'none',network_effect:'none',runtime_activation:false}; }
function activeRef(l,p){ return {layer_id:l.layer_id,layer_digest:entityLayerDigest(l),precedence:p}; }

test('validates and resolves an empty Blank Egg layer stack',()=>{
  const f=foundation(); const s=stack(); const v=validateEntityLayerStack(s); const r=resolveEntityLayerStack(s,f,[]);
  assert.equal(ENTITY_LAYER_STACK_SCHEMA,s.schema); assert.equal(v.stack_digest,entityLayerStackDigest(s)); assert.deepEqual(r.active_layer_ids,[]);
  assert.equal(r.authority_effect,'none'); assert.equal(r.network_effect,'none'); assert.equal(r.runtime_activation,false); assert.equal(Object.isFrozen(r),true);
});

test('requires strictly increasing unique precedence and layer ids',()=>{
  const a=layer('layer.a'), b=layer('layer.b');
  const duplicatePrecedence=stack([activeRef(a,10),activeRef(b,10)]); assert.throws(()=>validateEntityLayerStack(duplicatePrecedence),/precedence/i);
  const order=stack([activeRef(a,20),activeRef(b,10)]); assert.throws(()=>validateEntityLayerStack(order),/increasing/i);
  const duplicateId=stack([activeRef(a,10),activeRef(a,20)]); assert.throws(()=>validateEntityLayerStack(duplicateId),/duplicate layer_id/i);
});

test('active layers cannot also be suspended or superseded',()=>{
  const a=layer('layer.a'); const s=stack([activeRef(a,10)]); s.suspended_layer_ids=[a.layer_id]; assert.throws(()=>validateEntityLayerStack(s),/active.*suspended/i);
});

test('resolver binds exact foundation identity and digest',()=>{
  const f=foundation(); const s=stack(); s.foundation_id='foundation.other'; assert.throws(()=>resolveEntityLayerStack(s,f,[]),/foundation_id/i);
  const s2=stack(); s2.foundation_digest='d'.repeat(64); assert.throws(()=>resolveEntityLayerStack(s2,f,[]),/foundation_digest/i);
});

test('resolver rejects layer digest mismatch',()=>{
  const f=foundation(), a=layer('layer.a'), s=stack([activeRef(a,10)]); s.active_layers[0].layer_digest='e'.repeat(64); assert.throws(()=>resolveEntityLayerStack(s,f,[a]),/digest/i);
});

test('resolver rejects missing dependencies',()=>{
  const f=foundation(), a=layer('layer.a'); a.dependencies=['layer.required']; const s=stack([activeRef(a,10)]); assert.throws(()=>resolveEntityLayerStack(s,f,[a]),/dependency/i);
});

test('resolver rejects active conflicts',()=>{
  const f=foundation(), a=layer('layer.a'), b=layer('layer.b'); a.conflicts=[b.layer_id]; const s=stack([activeRef(a,10),activeRef(b,20)]); assert.throws(()=>resolveEntityLayerStack(s,f,[a,b]),/conflict/i);
});

test('resolver preserves deterministic active order without granting authority',()=>{
  const f=foundation(), a=layer('layer.a'), b=layer('layer.b'); const s=stack([activeRef(a,10),activeRef(b,20)]); const r=resolveEntityLayerStack(s,f,[b,a]);
  assert.deepEqual(r.active_layer_ids,['layer.a','layer.b']); assert.equal(r.authority_effect,'none'); assert.equal(r.runtime_activation,false);
});
