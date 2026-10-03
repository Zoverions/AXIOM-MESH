import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { computeInstalledStateObservationDigest, validateInstalledStateObservation } from '../src/lib/install-session.mjs';

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

// ---------------------------------------------------------------------------
// Kernel-version schema/runtime parity. The schema side applies JSON Schema
// semantics (maxLength plus an ECMA-262 `u` pattern); the runtime side is the
// real validator. The same corpus must get the same verdict from both.

const kernelSchema=async name=>{
  const value=await load(name);
  return name==='install-session-v0.schema.json'
    ? value.$defs.kernel_version
    : value.properties.installed_kernel_version.anyOf.find(item=>item.type==='string');
};
const schemaAccepts=(schema,version)=>
  typeof version==='string'&&[...version].length<=schema.maxLength&&new RegExp(schema.pattern,'u').test(version);
const runtimeAccepts=version=>{
  const observation={
    schema:'axiom-installed-state-observation.v0',version:0,status:'inert-installed-state-observation',
    observation_id:'fixture.observation.1',session_id:'fixture.session.1',candidate_digest:'a'.repeat(64),
    observed_at:'2026-09-28T18:00:30.000Z',observation_source:'live-local-observation',
    legacy_proof_state_detected:false,installed_kernel_version:version,install_record_state:'complete',
    installed_profile_id:'personal-local',installed_release_id:'fixture.release.1',
    installed_source_revision:'1'.repeat(40),installed_host_plan_digest:'b'.repeat(64),
    installed_release_manifest_digest:'c'.repeat(64),release_relation_to_desired:'same',
    relation_evidence_ref:null,secret_state:'complete',data_state:'present',service_state:'running',
    readiness_state:'ready',evidence_refs:['fixture.local-observation'],observation_digest:'0'.repeat(64),
    authority_effect:'none',mutation_effect:'none',runtime_activation:false
  };
  try{
    observation.observation_digest=computeInstalledStateObservationDigest(observation);
    return validateInstalledStateObservation(observation).valid===true;
  }catch(error){
    if(error?.name==='ValidationError') return false;
    throw error;
  }
};
const MAX=String(Number.MAX_SAFE_INTEGER);
const OVER=(BigInt(Number.MAX_SAFE_INTEGER)+1n).toString();
const fixedCorpus=[
  ['0.12.0-dev.3',true],['1.0.0',true],['0.0.0',true],['0.0.0-a-1.0',true],['1.2.3-x.7.z.92',true],
  ['1.2.3--',true],['1.2.3-0',true],['1.2.3-0a',true],['1.2.3-00a',true],
  [`${MAX}.0.0`,true],[`0.${MAX}.0`,true],[`0.0.${MAX}`,true],['1000000000000000.0.0',true],
  ['999999999999999.0.0',true],['9007199254740989.0.0',true],['8999999999999999.0.0',true],
  [`${OVER}.0.0`,false],[`0.${OVER}.0`,false],[`0.0.${OVER}`,false],['9007199254740999.0.0',false],
  ['9007199254741000.0.0',false],['9100000000000000.0.0',false],['10000000000000000.0.0',false],
  ['01.0.0',false],['0.01.0',false],['0.0.01',false],['0.12.0-dev.01',false],['1.0.0-',false],
  ['1.0.0+build',false],['v1.0.0',false],['1.0',false],['1.0.0.0',false],['1.2.3-a..b',false],
  ['1.2.3-.a',false],['1.2.3-a.',false],['1.2.3-a_b',false],[' 1.0.0',false],['1.0.0\n',false],
  ['１.0.0',false],['1.0.0-é',false],['',false],
  ['0.0.0-'+'a'.repeat(122),true],['0.0.0-'+'a'.repeat(123),false]
].map(([version,expected])=>[version,expected===true]);

function seededCorpus(count){
  let state=0x1913;
  const next=()=>{state=(state*1103515245+12345)>>>0;return state;};
  const pick=items=>items[next()%items.length];
  const component=()=>pick([
    ()=>'0',()=>String(next()%1000),()=>MAX,()=>OVER,()=>'0'+String(next()%10),
    ()=>MAX.slice(0,1+next()%15)+String(next()%10).repeat(next()%3),
    ()=>String(BigInt(Number.MAX_SAFE_INTEGER)-BigInt(next()%5)),()=>String(BigInt(Number.MAX_SAFE_INTEGER)+BigInt(next()%5))
  ])();
  const identifier=()=>pick([()=>'0',()=>'01',()=>'dev',()=>'-',()=>'1a',()=>String(next()%100),()=>'',()=>'a_b',()=>'Z9-'])();
  const out=[];
  for(let index=0;index<count;index++){
    let version=`${component()}.${component()}.${component()}`;
    if(next()%2){
      const parts=Array.from({length:1+next()%4},identifier);
      version+='-'+parts.join('.');
    }
    if(next()%10===0) version+=pick(['+b','.0','',' ','x']);
    out.push(version);
  }
  const alphabet='0123456789.-+aZ_';
  for(let index=0;index<count;index++){
    out.push(Array.from({length:1+next()%24},()=>alphabet[next()%alphabet.length]).join(''));
  }
  return out;
}

for(const name of ['install-session-v0.schema.json','installed-state-observation-v0.schema.json']){
  test(`${name} kernel_version accepts exactly what the runtime accepts`,async()=>{
    const schema=await kernelSchema(name);
    for(const [version,expected] of fixedCorpus){
      assert.equal(runtimeAccepts(version),expected,`runtime ${JSON.stringify(version)}`);
      assert.equal(schemaAccepts(schema,version),expected,`schema ${JSON.stringify(version)}`);
    }
    let accepted=0;
    for(const version of seededCorpus(4000)){
      const verdict=runtimeAccepts(version);
      accepted+=verdict?1:0;
      assert.equal(schemaAccepts(schema,version),verdict,`parity ${JSON.stringify(version)}`);
    }
    assert.ok(accepted>500,'seeded corpus exercises the accept side');
  });
}

test('both schemas carry one kernel-version contract that matches in linear time',async()=>{
  const candidate=await kernelSchema('install-session-v0.schema.json');
  const observation=await kernelSchema('installed-state-observation-v0.schema.json');
  assert.equal(candidate.pattern,observation.pattern);
  assert.equal(candidate.maxLength,128);
  assert.equal(observation.maxLength,128);
  // Pattern-only timing: JSON Schema validators may evaluate the pattern
  // independently of maxLength, so long inputs must stay linear too.
  const pattern=new RegExp(candidate.pattern,'u');
  const hostile=[
    '0.0.0-0.'+'--.'.repeat(30)+'!',
    '0.0.0-'+'a.'.repeat(50_000)+'!',
    '0.0.0-'+'1a'.repeat(50_000)+'!',
    '0.0.0-'+'-'.repeat(100_000)+'!',
    '0.0.0-'+'9'.repeat(100_000)+'.!',
    '1'.repeat(100_000)+'.0.0',
    `${MAX}.`.repeat(10_000)
  ];
  for(const input of hostile){
    const started=performance.now();
    assert.equal(pattern.test(input),false);
    const elapsed=performance.now()-started;
    assert.ok(elapsed<250,`pattern took ${elapsed.toFixed(1)}ms on a ${input.length}-character input`);
  }
});
