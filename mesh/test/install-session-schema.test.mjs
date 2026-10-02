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
  ]]
];

for(const [name,schemaConst,boundaries] of cases){
  test(name+' is closed and pins inert boundaries',async()=>{
    const value=JSON.parse(await readFile(new URL('../config/'+name,import.meta.url),'utf8'));
    assert.equal(value.$schema,'https://json-schema.org/draft/2020-12/schema');
    assert.equal(value.additionalProperties,false);
    assert.equal(value.properties.schema.const,schemaConst);
    assert.equal(value.properties.version.const,0);
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
