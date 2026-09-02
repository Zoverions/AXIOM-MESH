import assert from 'node:assert/strict';
import test from 'node:test';
import { CAPABILITY_SURFACES_SCHEMA, capabilitySurfacesDigest, validateCapabilitySurfaceRegistry } from '../src/lib/capability-surfaces.mjs';

function entry(id='entity.foundation', schemas=['axiom-entity-foundation.v0']){
  return {
    capability_id:id,
    lifecycle:'specified',
    human:{product:'Entity',section:'Foundation',label:'Foundation',description:'Clean genesis and continuity foundation.'},
    machine:{schema_ids:schemas,read_surfaces:[],action_surfaces:[]},
    executable_capability_ref:null,
    evidence_refs:['docs.architecture.blank-egg'],
    authority_boundary:'discovery-only-no-authority',
    non_claims:['not-runnable-by-discovery']
  };
}
function registry(){return {schema:'axiom-capability-surfaces.v0',version:0,status:'inert-contract-laboratory',registry_id:'capability-surfaces.blank-egg.v0',executable_registry_ref:'mesh/config/capabilities.json',discovery_grants_authority:false,entries:[entry()],created_at:'2026-09-01T12:00:00.000Z',authority_effect:'none',network_effect:'none',runtime_activation:false};}

test('validates a non-executable dual-surface registry',()=>{
  const d=registry(); const r=validateCapabilitySurfaceRegistry(d);
  assert.equal(CAPABILITY_SURFACES_SCHEMA,d.schema); assert.equal(r.valid,true); assert.equal(r.entry_count,1); assert.equal(r.registry_digest,capabilitySurfacesDigest(d));
  assert.equal(r.discovery_grants_authority,false); assert.equal(r.authority_effect,'none'); assert.equal(Object.isFrozen(r),true);
});
test('rejects authority-granting discovery',()=>{const d=registry();d.discovery_grants_authority=true;assert.throws(()=>validateCapabilitySurfaceRegistry(d),/discovery/i);});
test('rejects duplicate capability ids',()=>{const d=registry();d.entries.push(entry());assert.throws(()=>validateCapabilitySurfaceRegistry(d),/duplicate capability_id/i);});
test('rejects unknown lifecycle values and empty non-claims',()=>{const l=registry();l.entries[0].lifecycle='nearly-ready';assert.throws(()=>validateCapabilitySurfaceRegistry(l),/lifecycle/i);const n=registry();n.entries[0].non_claims=[];assert.throws(()=>validateCapabilitySurfaceRegistry(n),/non_claims/i);});
test('post-specified lifecycle requires executable registry evidence',()=>{const d=registry();d.entries[0].lifecycle='implemented';assert.throws(()=>validateCapabilitySurfaceRegistry(d),/executable capability/i);d.entries[0].executable_capability_ref='some.capability';d.entries[0].evidence_refs=[];assert.throws(()=>validateCapabilitySurfaceRegistry(d),/evidence/i);});
test('specified lifecycle cannot imply executable capability',()=>{const d=registry();d.entries[0].executable_capability_ref='some.capability';assert.throws(()=>validateCapabilitySurfaceRegistry(d),/specified/i);});
test('rejects empty human descriptions and invalid machine schema ids',()=>{const h=registry();h.entries[0].human.description='';assert.throws(()=>validateCapabilitySurfaceRegistry(h),/description/i);const m=registry();m.entries[0].machine.schema_ids=['bad schema'];assert.throws(()=>validateCapabilitySurfaceRegistry(m),/schema_ids/i);});
