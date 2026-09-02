import assert from 'node:assert/strict';
import test from 'node:test';
import { entityFoundationDigest } from '../src/lib/entity-foundation.mjs';
import { entityLayerDigest } from '../src/lib/entity-layer.mjs';
import { entityLayerStackDigest } from '../src/lib/entity-layer-stack.mjs';
import { forkEntityLineage, validateEntityLineageEvent } from '../src/lib/entity-lineage.mjs';

function foundation(){return {schema:'axiom-entity-foundation.v0',version:0,status:'inert-contract-laboratory',foundation_id:'foundation.parent',entity_id:'entity.parent',lineage_root_id:'lineage.root.one',profile:'blank-egg',core_contract_refs:['contract.agency.v0'],recovery_policy_ref:'policy.recovery.v1',privacy_policy_ref:'policy.privacy.v1',personal_grounding_present:false,worldview_layers_present:false,disposition_layers_present:false,provider_binding_present:false,created_at:'2026-09-01T12:00:00.000Z',authority_effect:'none',network_effect:'none',runtime_activation:false};}
function layer(){return {schema:'axiom-entity-layer.v0',version:0,status:'inert-contract-laboratory',layer_id:'layer.judgment.one',layer_version:1,layer_class:'judgment',artifact_ref:'artifact.layer.judgment.one',artifact_digest:'c'.repeat(64),authors:['principal.author'],adopter_principal_id:'entity.parent',endorsement_mode:'entity',provenance_refs:['provenance.layer.one'],influence_scopes:['judgment-heuristic'],privacy_class:'public',mutability:'evolvable',dependencies:[],conflicts:[],predecessor_layer_ref:null,created_at:'2026-09-01T12:00:00.000Z',adopted_at:'2026-09-01T12:01:00.000Z',expires_at:null,contains_raw_private_content:false,authority_effect:'none',network_effect:'none',runtime_activation:false};}
function stack(f,l){return {schema:'axiom-entity-layer-stack.v0',version:0,status:'inert-contract-laboratory',stack_id:'stack.parent',foundation_id:f.foundation_id,foundation_digest:entityFoundationDigest(f),active_layers:[{layer_id:l.layer_id,layer_digest:entityLayerDigest(l),precedence:10}],suspended_layer_ids:['layer.old.suspended'],superseded_layer_ids:['layer.old.superseded'],created_at:'2026-09-01T12:02:00.000Z',updated_at:'2026-09-01T12:02:00.000Z',authority_effect:'none',network_effect:'none',runtime_activation:false};}

test('fork creates a new entity/foundation/stack with exact ancestry and copied composition',()=>{
  const f=foundation(), l=layer(), s=stack(f,l);
  const result=forkEntityLineage(f,s,{event_id:'lineage-event.fork.one',child_entity_id:'entity.child',child_foundation_id:'foundation.child',child_stack_id:'stack.child',forked_at:'2026-09-01T12:10:00.000Z'});
  assert.equal(result.child_foundation.entity_id,'entity.child');
  assert.equal(result.child_foundation.foundation_id,'foundation.child');
  assert.equal(result.child_foundation.lineage_root_id,f.lineage_root_id);
  assert.equal(result.child_stack.foundation_id,'foundation.child');
  assert.deepEqual(result.child_stack.active_layers,s.active_layers);
  assert.deepEqual(result.child_stack.suspended_layer_ids,s.suspended_layer_ids);
  assert.deepEqual(result.child_stack.superseded_layer_ids,s.superseded_layer_ids);
  assert.equal(result.event.parent_foundation_digest,entityFoundationDigest(f));
  assert.equal(result.event.parent_stack_digest,entityLayerStackDigest(s));
  assert.equal(result.event.child_foundation_digest,entityFoundationDigest(result.child_foundation));
  assert.equal(result.event.child_stack_digest,entityLayerStackDigest(result.child_stack));
  assert.equal(result.event.subjective_identity_claim,'unspecified');
  assert.equal(result.event.authority_effect,'none');
  assert.equal(result.event.network_effect,'none');
  assert.equal(result.event.runtime_activation,false);
  assert.equal(validateEntityLineageEvent(result.event).valid,true);
});

test('fork never mutates parent objects',()=>{const f=foundation(), l=layer(), s=stack(f,l);const beforeF=structuredClone(f),beforeS=structuredClone(s);forkEntityLineage(f,s,{event_id:'lineage-event.fork.two',child_entity_id:'entity.child.two',child_foundation_id:'foundation.child.two',child_stack_id:'stack.child.two',forked_at:'2026-09-01T12:10:00.000Z'});assert.deepEqual(f,beforeF);assert.deepEqual(s,beforeS);});

test('fork rejects reused parent ids and time before parent state',()=>{const f=foundation(), l=layer(), s=stack(f,l);assert.throws(()=>forkEntityLineage(f,s,{event_id:'lineage-event.bad',child_entity_id:f.entity_id,child_foundation_id:'foundation.child',child_stack_id:'stack.child',forked_at:'2026-09-01T12:10:00.000Z'}),/child_entity_id/i);assert.throws(()=>forkEntityLineage(f,s,{event_id:'lineage-event.bad2',child_entity_id:'entity.child',child_foundation_id:'foundation.child',child_stack_id:'stack.child',forked_at:'2026-09-01T11:59:00.000Z'}),/forked_at/i);});

test('lineage event refuses identity equivalence or authority claims',()=>{const f=foundation(), l=layer(), s=stack(f,l);const {event}=forkEntityLineage(f,s,{event_id:'lineage-event.fork.three',child_entity_id:'entity.child.three',child_foundation_id:'foundation.child.three',child_stack_id:'stack.child.three',forked_at:'2026-09-01T12:10:00.000Z'});assert.throws(()=>validateEntityLineageEvent({...event,subjective_identity_claim:'same-entity'}),/subjective_identity_claim/i);assert.throws(()=>validateEntityLineageEvent({...event,authority_effect:'granted'}),/activation boundary/i);});
