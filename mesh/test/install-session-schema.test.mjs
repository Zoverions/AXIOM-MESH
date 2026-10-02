import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const load=async name=>JSON.parse(await readFile(new URL('../config/'+name,import.meta.url),'utf8'));
const cases=[
  ['install-session-v0.schema.json','axiom-install-session-candidate.v0',['host_mutation_authorized','authority_effect','network_effect','runtime_activation']],
  ['installed-state-observation-v0.schema.json','axiom-installed-state-observation.v0',['authority_effect','mutation_effect','runtime_activation']],
  ['install-session-decision-v0.schema.json','axiom-install-session-decision.v0',['host_mutation_authorized','authority_effect','network_effect','runtime_activation']],
  ['verified-install-session-v0.schema.json','axiom-install-session.v0',['host_mutation_authorized','authority_effect','network_effect','runtime_activation','credential_effect','service_start_effect']]
];
for(const [name,schemaConst,boundaries] of cases){
  test(name+' is closed and pins inert boundaries',async()=>{
    const value=await load(name);
    assert.equal(value.$schema,'https://json-schema.org/draft/2020-12/schema');
    assert.equal(value.additionalProperties,false);
    assert.equal(value.properties.schema.const,schemaConst);
    assert.equal(value.properties.version.const,0);
    assert.deepEqual([...value.required].sort(),Object.keys(value.properties).sort());
    for(const field of boundaries){
      assert.ok(value.required.includes(field),field+' is required');
      assert.ok(Object.hasOwn(value.properties[field],'const'),field+' is pinned');
    }
  });
}
test('candidate and observation schemas keep live versus supplied provenance explicit',async()=>{
  for(const [name,field] of [['install-session-v0.schema.json','host_plan_facts_source'],['installed-state-observation-v0.schema.json','observation_source']]){
    const value=await load(name);
    assert.deepEqual(value.properties[field].enum,['live-local-observation','supplied-evidence','synthetic-test']);
    assert.ok(value.required.includes(field));
  }
});
test('decision schema exposes converged review/no-op/stop states but no execute action',async()=>{
  const value=await load('install-session-decision-v0.schema.json');
  const decisions=value.properties.decision.enum;
  for(const state of ['INSTALL_REVIEW','VERIFY_NOOP','STOP_UNCERTAIN','STOP_NEWER_PRESENT','STOP_NONLIVE_OBSERVATION','STOP_LEGACY_PROOF_STATE','STOP_HOST_BLOCKED','STOP_UPGRADE_UNPROVEN'])assert.ok(decisions.includes(state));
  assert.equal(decisions.some(item=>/EXECUTE|MUTATE|START/.test(item)),false);
});
test('compatibility and legacy proof fields are mandatory, with unambiguous version syntax',async()=>{
  const candidate=await load('install-session-v0.schema.json');
  for(const field of ['desired_kernel_version','minimum_compatible_kernel','rollback_mode','host_candidate_compatible'])assert.ok(candidate.required.includes(field));
  const observation=await load('installed-state-observation-v0.schema.json');
  assert.ok(observation.required.includes('legacy_proof_state_detected'));
  assert.ok(observation.required.includes('installed_kernel_version'));
  const version=new RegExp(candidate.properties.desired_kernel_version.pattern);
  for(const good of ['0.12.0-dev.3','1.0.0','0.0.0-a-1.0'])assert.ok(version.test(good));
  for(const bad of ['01.0.0','0.12.0-dev.01','1.0.0-','1.0.0+unbound'])assert.equal(version.test(bad),false);
});
test('verified session schema references the single candidate and decision contracts',async()=>{
  const envelope=await load('verified-install-session-v0.schema.json');
  assert.equal(envelope.properties.candidate.$ref,'install-session-v0.schema.json');
  assert.equal(envelope.properties.decision.$ref,'install-session-decision-v0.schema.json');
  assert.equal(envelope.properties.artifact_proofs.items.additionalProperties,false);
  assert.ok(envelope.required.includes('session_digest'));
});
