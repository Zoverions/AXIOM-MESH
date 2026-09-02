import assert from 'node:assert/strict';
import test from 'node:test';
import { entityFoundationDigest } from '../src/lib/entity-foundation.mjs';
import { entityLayerDigest } from '../src/lib/entity-layer.mjs';
import { resolveEntityLayerStack } from '../src/lib/entity-layer-stack.mjs';
import { verifyEntityBlankness } from '../src/lib/entity-blankness.mjs';
import { installEntityLayer, suspendEntityLayer } from '../src/lib/entity-layer-transitions.mjs';

function foundation(){return {schema:'axiom-entity-foundation.v0',version:0,status:'inert-contract-laboratory',foundation_id:'foundation.blank-egg.primary',entity_id:'entity.blank.primary',lineage_root_id:'lineage.blank.primary',profile:'blank-egg',core_contract_refs:['contract.agency.v0'],recovery_policy_ref:null,privacy_policy_ref:null,personal_grounding_present:false,worldview_layers_present:false,disposition_layers_present:false,provider_binding_present:false,created_at:'2026-09-01T12:00:00.000Z',authority_effect:'none',network_effect:'none',runtime_activation:false};}
function layer(){return {schema:'axiom-entity-layer.v0',version:0,status:'inert-contract-laboratory',layer_id:'layer.judgment.public-grounded',layer_version:1,layer_class:'judgment',artifact_ref:'artifact.layer.judgment.public-grounded',artifact_digest:'c'.repeat(64),authors:['principal.public-author'],adopter_principal_id:'principal.entity',endorsement_mode:'entity',provenance_refs:['provenance.public-pack.v1'],influence_scopes:['judgment-heuristic'],privacy_class:'public',mutability:'evolvable',dependencies:[],conflicts:[],predecessor_layer_ref:null,created_at:'2026-09-01T12:00:00.000Z',adopted_at:'2026-09-01T12:01:00.000Z',expires_at:null,contains_raw_private_content:false,authority_effect:'none',network_effect:'none',runtime_activation:false};}
function stack(f){return {schema:'axiom-entity-layer-stack.v0',version:0,status:'inert-contract-laboratory',stack_id:'stack.blank.primary',foundation_id:f.foundation_id,foundation_digest:entityFoundationDigest(f),active_layers:[],suspended_layer_ids:[],superseded_layer_ids:[],created_at:'2026-09-01T12:02:00.000Z',updated_at:'2026-09-01T12:02:00.000Z',authority_effect:'none',network_effect:'none',runtime_activation:false};}

test('Blank Egg genesis stays the same entity/authority across optional layer install and suspend',()=>{
  const f=foundation();
  const foundationDigest=entityFoundationDigest(f);
  let s=stack(f);
  const initial=verifyEntityBlankness(f,s,[]);
  assert.equal(initial.blank_mode,'genesis-clean');

  const l=layer();
  s=installEntityLayer(s,f,l,{precedence:10,updated_at:'2026-09-01T12:03:00.000Z'});
  const resolved=resolveEntityLayerStack(s,f,[l]);
  assert.deepEqual(resolved.active_layer_ids,[l.layer_id]);
  assert.equal(s.foundation_id,f.foundation_id);
  assert.equal(s.foundation_digest,foundationDigest);
  assert.equal(s.authority_effect,'none');
  assert.equal(s.network_effect,'none');
  assert.equal(s.runtime_activation,false);
  assert.equal(s.active_layers[0].layer_digest,entityLayerDigest(l));

  s=suspendEntityLayer(s,l.layer_id,{updated_at:'2026-09-01T12:04:00.000Z'});
  const restored=verifyEntityBlankness(f,s,[]);
  assert.equal(restored.blank_mode,'currently-blank-with-layer-history');
  assert.equal(restored.layer_history_present,true);
  assert.equal(restored.historical_influence_not_erased,true);
  assert.equal(restored.foundation_digest,foundationDigest);
  assert.equal(restored.authority_effect,'none');
  assert.equal(restored.network_effect,'none');
  assert.equal(restored.runtime_activation,false);
});

test('install fails if layer is already active or precedence is already occupied',()=>{
  const f=foundation(); const l=layer(); let s=stack(f);
  s=installEntityLayer(s,f,l,{precedence:10,updated_at:'2026-09-01T12:03:00.000Z'});
  assert.throws(()=>installEntityLayer(s,f,l,{precedence:20,updated_at:'2026-09-01T12:04:00.000Z'}),/already active/i);
  const l2={...l,layer_id:'layer.judgment.second',artifact_ref:'artifact.layer.judgment.second',artifact_digest:'d'.repeat(64)};
  assert.throws(()=>installEntityLayer(s,f,l2,{precedence:10,updated_at:'2026-09-01T12:04:00.000Z'}),/precedence/i);
});

test('suspend fails for inactive layer and preserves input immutability',()=>{
  const f=foundation(); const s=stack(f); const snapshot=structuredClone(s);
  assert.throws(()=>suspendEntityLayer(s,'layer.missing',{updated_at:'2026-09-01T12:03:00.000Z'}),/not active/i);
  assert.deepEqual(s,snapshot);
});
