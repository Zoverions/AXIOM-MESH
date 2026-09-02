import assert from 'node:assert/strict';
import test from 'node:test';
import { ENTITY_LAYER_SCHEMA, entityLayerDigest, validateEntityLayer } from '../src/lib/entity-layer.mjs';

const DIGEST='b'.repeat(64);
function validLayer(){
  return {
    schema:'axiom-entity-layer.v0', version:0, status:'inert-contract-laboratory',
    layer_id:'layer.judgment.grounded.v1', layer_version:1, layer_class:'judgment',
    artifact_ref:'artifact.judgment.grounded.v1', artifact_digest:DIGEST,
    authors:['principal.author.one'], adopter_principal_id:'principal.entity.one', endorsement_mode:'entity',
    provenance_refs:['evidence.origin.one'], influence_scopes:['judgment-heuristic','reasoning-guidance'],
    privacy_class:'public', mutability:'evolvable', dependencies:[], conflicts:[], predecessor_layer_ref:null,
    created_at:'2026-09-01T12:00:00.000Z', adopted_at:'2026-09-01T12:05:00.000Z', expires_at:null,
    contains_raw_private_content:false, authority_effect:'none', network_effect:'none', runtime_activation:false
  };
}

test('validates an attributable zero-authority entity layer',()=>{
  const d=validLayer(); const r=validateEntityLayer(d);
  assert.equal(ENTITY_LAYER_SCHEMA,d.schema); assert.equal(r.valid,true); assert.equal(r.layer_class,'judgment');
  assert.equal(r.layer_digest,entityLayerDigest(d)); assert.match(r.layer_digest,/^[a-f0-9]{64}$/); assert.equal(Object.isFrozen(r),true);
  assert.equal(r.authority_effect,'none'); assert.equal(r.network_effect,'none'); assert.equal(r.runtime_activation,false);
});

test('digest is deterministic across key order',()=>{
  const a=validLayer(); const b=Object.fromEntries(Object.entries(a).reverse()); assert.equal(entityLayerDigest(a),entityLayerDigest(b));
});

test('rejects invalid layer classes, endorsement, privacy, mutability, and influence scopes',()=>{
  for (const [key,value] of [['layer_class','mystery'],['endorsement_mode','automatic'],['privacy_class','ambient'],['mutability','silent'],['influence_scopes',['authority']]]) {
    const d=validLayer(); d[key]=value; assert.throws(()=>validateEntityLayer(d),/invalid/i);
  }
});

test('requires unique authors and influence scopes',()=>{
  const a=validLayer(); a.authors.push(a.authors[0]); assert.throws(()=>validateEntityLayer(a),/duplicate/i);
  const s=validLayer(); s.influence_scopes.push(s.influence_scopes[0]); assert.throws(()=>validateEntityLayer(s),/duplicate/i);
});

test('rejects dependency/conflict overlap and self references',()=>{
  const overlap=validLayer(); overlap.dependencies=['layer.other']; overlap.conflicts=['layer.other']; assert.throws(()=>validateEntityLayer(overlap),/overlap/i);
  const self=validLayer(); self.dependencies=[self.layer_id]; assert.throws(()=>validateEntityLayer(self),/self/i);
});

test('personal-grounding layers must remain private or sealed',()=>{
  const d=validLayer(); d.layer_class='personal-grounding'; d.privacy_class='public'; assert.throws(()=>validateEntityLayer(d),/personal-grounding/i);
  d.privacy_class='sealed'; assert.doesNotThrow(()=>validateEntityLayer(d));
});

test('ephemeral layers require a future expiry; durable layers have null expiry',()=>{
  const e=validLayer(); e.mutability='ephemeral'; e.expires_at=null; assert.throws(()=>validateEntityLayer(e),/expires_at/i);
  e.expires_at='2026-09-01T13:00:00.000Z'; assert.doesNotThrow(()=>validateEntityLayer(e));
  const d=validLayer(); d.expires_at='2026-09-01T13:00:00.000Z'; assert.throws(()=>validateEntityLayer(d),/durable/i);
});

test('timestamps are ordered and canonical',()=>{
  const a=validLayer(); a.adopted_at='2026-09-01T11:00:00.000Z'; assert.throws(()=>validateEntityLayer(a),/adopted_at/i);
  const e=validLayer(); e.mutability='ephemeral'; e.expires_at='2026-09-01T12:04:00.000Z'; assert.throws(()=>validateEntityLayer(e),/expires_at/i);
});

test('rejects raw private content, unknown credential fields, and activation effects',()=>{
  const p=validLayer(); p.contains_raw_private_content=true; assert.throws(()=>validateEntityLayer(p),/private content/i);
  const u=validLayer(); u.password='x'; assert.throws(()=>validateEntityLayer(u),/unknown field/i);
  const a=validLayer(); a.authority_effect='grant'; assert.throws(()=>validateEntityLayer(a),/activation boundary/i);
});
