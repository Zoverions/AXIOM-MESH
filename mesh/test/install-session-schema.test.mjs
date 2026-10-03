import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const cases=[
  ['install-session-v0.schema.json','axiom-install-session-candidate.v0',[
    'host_mutation_authorized','authority_effect','network_effect','runtime_activation'
  ]],
  ['installed-state-observation-v0.schema.json','axiom-installed-state-observation.v0',[
    'authority_effect','mutation_effect','runtime_activation'
  ]],
  ['install-session-decision-v0.schema.json','axiom-install-session-decision.v0',[
    'observation_bound','host_mutation_authorized','authority_effect','network_effect','runtime_activation'
  ]],
  ['verified-install-session-v0.schema.json','axiom-install-session.v0',[
    'host_mutation_authorized','authority_effect','network_effect','runtime_activation',
    'credential_effect','service_start_effect'
  ]]
];
const load=async name=>JSON.parse(await readFile(new URL('../config/'+name,import.meta.url),'utf8'));

for(const [name,schemaConst,boundaries] of cases){
  test(name+' is closed and pins inert boundaries',async()=>{
    const value=JSON.parse(await readFile(new URL('../config/'+name,import.meta.url),'utf8'));
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

test('candidate schema keeps live versus supplied fact provenance explicit',async()=>{
  const value=JSON.parse(await readFile(new URL('../config/install-session-v0.schema.json',import.meta.url),'utf8'));
  assert.deepEqual(value.properties.host_plan_facts_source.enum,[
    'live-local-observation','supplied-evidence','synthetic-test'
  ]);
});

test('decision schema exposes review/no-op/stop states but no execute action',async()=>{
  const value=JSON.parse(await readFile(new URL('../config/install-session-decision-v0.schema.json',import.meta.url),'utf8'));
  const decisions=value.properties.decision.enum;
  assert.ok(decisions.includes('INSTALL_REVIEW'));
  assert.ok(decisions.includes('VERIFY_NOOP'));
  assert.ok(decisions.includes('STOP_UNCERTAIN'));
  assert.equal(decisions.some(item=>/EXECUTE|MUTATE|START/.test(item)),false);
});

test('observation schema keeps live-local provenance explicit and binds the candidate digest',async()=>{
  const value=await load('installed-state-observation-v0.schema.json');
  assert.deepEqual(value.properties.observation_source.enum,[
    'live-local-observation','supplied-evidence','synthetic-test'
  ]);
  for(const field of ['observation_source','candidate_digest','legacy_proof_state_detected','installed_kernel_version']){
    assert.ok(value.required.includes(field),field);
  }
  assert.equal(value.properties.candidate_digest.$ref,'#/$defs/digest');
});

test('converged stop states exist and kernel versions have one unambiguous syntax',async()=>{
  const decisions=(await load('install-session-decision-v0.schema.json')).properties.decision.enum;
  for(const state of ['STOP_HOST_BLOCKED','STOP_LEGACY_PROOF_STATE','STOP_UPGRADE_UNPROVEN','STOP_NEWER_PRESENT']){
    assert.ok(decisions.includes(state),state);
  }
  assert.equal(decisions.includes('STOP_NONLIVE_OBSERVATION'),false,'a non-live observation is rejected, not classified');
  const candidate=await load('install-session-v0.schema.json');
  for(const field of ['desired_kernel_version','minimum_compatible_kernel','rollback_mode','host_candidate_compatible']){
    assert.ok(candidate.required.includes(field),field);
  }
  const version=new RegExp(candidate.$defs.kernel_version.pattern);
  for(const good of ['0.12.0-dev.3','1.0.0','0.0.0-a-1.0']) assert.ok(version.test(good),good);
  for(const bad of ['01.0.0','0.12.0-dev.01','1.0.0-','1.0.0+build','v1.0.0']) assert.equal(version.test(bad),false,bad);
});

test('verified session schema references the single candidate and decision contracts',async()=>{
  const envelope=await load('verified-install-session-v0.schema.json');
  assert.equal(envelope.properties.candidate.$ref,'install-session-v0.schema.json');
  assert.equal(envelope.properties.decision.$ref,'install-session-decision-v0.schema.json');
  assert.equal(envelope.properties.artifact_proofs.items.additionalProperties,false);
  assert.ok(envelope.required.includes('session_digest'));
});
