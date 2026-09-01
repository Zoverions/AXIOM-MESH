import assert from 'node:assert/strict';
import test from 'node:test';
import { entityFoundationDigest } from '../src/lib/entity-foundation.mjs';
import { entityLayerDigest } from '../src/lib/entity-layer.mjs';
import { verifyEntityBlankness } from '../src/lib/entity-blankness.mjs';

function foundation(){return {schema:'axiom-entity-foundation.v0',version:0,status:'inert-contract-laboratory',foundation_id:'foundation.blank-egg.primary',entity_id:'entity.blank.primary',lineage_root_id:'lineage.blank.primary',profile:'blank-egg',core_contract_refs:['contract.agency.v0'],recovery_policy_ref:null,privacy_policy_ref:null,personal_grounding_present:false,worldview_layers_present:false,disposition_layers_present:false,provider_binding_present:false,created_at:'2026-09-01T12:00:00.000Z',authority_effect:'none',network_effect:'none',runtime_activation:false};}
function layer(){return {schema:'axiom-entity-layer.v0',version:0,status:'inert-contract-laboratory',layer_id:'layer.judgment.one',layer_version:1,layer_class:'judgment',artifact_ref:'artifact.layer.judgment.one',artifact_digest:'c'.repeat(64),authors:['principal.author'],adopter_principal_id:'principal.entity',endorsement_mode:'entity',provenance_refs:[],influence_scopes:['reasoning-guidance'],privacy_class:'public',mutability:'evolvable',dependencies:[],conflicts:[],predecessor_layer_ref:null,created_at:'2026-09-01T12:00:00.000Z',adopted_at:'2026-09-01T12:01:00.000Z',expires_at:null,contains_raw_private_content:false,authority_effect:'none',network_effect:'none',runtime_activation:false};}
function stack(){const f=foundation();return {schema:'axiom-entity-layer-stack.v0',version:0,status:'inert-contract-laboratory',stack_id:'stack.blank.primary',foundation_id:f.foundation_id,foundation_digest:entityFoundationDigest(f),active_layers:[],suspended_layer_ids:[],superseded_layer_ids:[],created_at:'2026-09-01T12:02:00.000Z',updated_at:'2026-09-01T12:02:00.000Z',authority_effect:'none',network_effect:'none',runtime_activation:false};}

test('proves a genesis-clean Blank Egg only at the AXIOM composition layer',()=>{
  const r=verifyEntityBlankness(foundation(),stack(),[]);
  assert.equal(r.valid,true);
  assert.equal(r.claim,'blank-at-axiom-composition-layer');
  assert.equal(r.blank_mode,'genesis-clean');
  assert.equal(r.layer_history_present,false);
  assert.equal(r.historical_influence_not_erased,false);
  assert.equal(r.optional_active_layer_count,0);
  assert.equal(r.authority_effect,'none');
  assert.equal(r.network_effect,'none');
  assert.equal(r.runtime_activation,false);
  assert.deepEqual(r.non_claims,['does-not-prove-model-weight-neutrality','does-not-prove-consciousness-status','does-not-prove-environmental-neutrality']);
  assert.equal(Object.isFrozen(r),true);
  assert.equal(Object.isFrozen(r.non_claims),true);
});

test('distinguishes current blankness from a never-layered genesis',()=>{
  const s=stack(); s.suspended_layer_ids=['layer.worldview.old']; const r=verifyEntityBlankness(foundation(),s,[]);
  assert.equal(r.blank_mode,'currently-blank-with-layer-history');
  assert.equal(r.layer_history_present,true);
  assert.equal(r.historical_influence_not_erased,true);
});

test('refuses a blankness proof while any optional layer is active',()=>{
  const f=foundation(), l=layer(), s=stack();
  s.active_layers=[{layer_id:l.layer_id,layer_digest:entityLayerDigest(l),precedence:10}];
  assert.throws(()=>verifyEntityBlankness(f,s,[l]),/active layer/i);
});

test('does not erase superseded layer history',()=>{
  const s=stack(); s.superseded_layer_ids=['layer.disposition.old']; const r=verifyEntityBlankness(foundation(),s,[]); assert.equal(r.layer_history_present,true);
});
