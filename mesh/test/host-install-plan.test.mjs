import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { assertHostileInputContract } from '../test-support/hostile-input-contract.mjs';

import installPolicy from '../config/host-install-policy.json' with { type: 'json' };
import installTargetsJson from '../config/install-targets.json' with { type: 'json' };
import { hostInstallMain } from '../src/host-install.mjs';
import { digestObject, ValidationError } from '../src/lib/canonical.mjs';
import { assertProductionRuntime, classifyRuntimeProfile as setupClassify } from '../src/setup.mjs';
import setupPolicy from '../config/setup.json' with { type: 'json' };
import {
  buildHostInstallPlan,
  HOST_INSTALL_PLAN_SCHEMA,
  HOST_INSTALL_PLAN_STATUS,
  validateHostInstallPlan,
  validateHostInstallPolicy
} from '../src/lib/host-install-plan.mjs';

function reseal(plan) {
  const { plan_digest: _ignored, ...core } = plan;
  return { ...core, plan_digest: digestObject(core) };
}

function linuxFacts(overrides={}) {
  return {
    facts_source:'synthetic-test',
    platform:'linux',
    architecture:'x64',
    distro_id:'ubuntu',
    distro_version:'24.04',
    init_system:'systemd',
    package_manager:'apt-get',
    node_version:null,
    memory_bytes:16*1024*1024*1024,
    root_filesystem_free_bytes:100*1024*1024*1024,
    container_runtime:'none-detected',
    effective_uid:1000,
    ...overrides
  };
}

test('host install policy is executable while mutating installation remains absent',()=>{
  const result=validateHostInstallPolicy();
  assert.equal(result.valid,true);
  assert.equal(result.schema,'axiom-host-install-policy.v1');
  assert.deepEqual([...result.profile_ids],['personal-local','infrastructure-node']);
  assert.match(result.policy_digest,/^[a-f0-9]{64}$/);
  assert.equal(result.host_mutation_enabled,false);
  assert.equal(result.authority_effect,'none');
});

test('OCI plan semantics do not classify a missing target-host Node runtime as a blocker',()=>{
  const plan=buildHostInstallPlan({
    profileId:'personal-local',
    hostFacts:linuxFacts(),
    runtimeStrategy:'oci'
  });
  assert.equal(plan.schema,HOST_INSTALL_PLAN_SCHEMA);
  assert.equal(plan.status,HOST_INSTALL_PLAN_STATUS);
  assert.equal(plan.runtime_strategy,'oci');
  assert.equal(plan.host_facts_source,'synthetic-test');
  assert.equal(plan.host_candidate_compatible,true);
  assert.deepEqual(plan.blockers,[]);
  assert.deepEqual(plan.prerequisites,['install-reviewed-container-runtime:docker']);
  assert.equal(plan.runtime.node_runtime_required,false);
  assert.equal(plan.runtime.node_runtime_observed,null);
  assert.equal(plan.runtime.container_runtime_name_recognized,false);
  assert.equal(plan.runtime.container_runtime_version_verified,false);
  assert.equal(plan.runtime.container_runtime_health_verified,false);
  assert.equal(plan.network.public_ingress_enabled,false);
  assert.equal(plan.network.external_egress,'deny');
  assert.equal(plan.network.mesh_enrollment,'not-performed');
  assert.equal(plan.mutation_performed,false);
  assert.equal(plan.credentials_created,false);
  assert.equal(plan.live_services_started,false);
  assert.equal(plan.authority_effect,'none');
  assert.equal(validateHostInstallPlan(plan).valid,true);
});

test('recognized Docker name still requires separate version and health verification',()=>{
  const plan=buildHostInstallPlan({
    profileId:'personal-local',
    hostFacts:linuxFacts({container_runtime:'docker'})
  });
  assert.deepEqual(plan.prerequisites,[
    'verify-reviewed-container-runtime-version-health:docker'
  ]);
  assert.equal(plan.runtime.container_runtime_name_recognized,true);
  assert.equal(plan.runtime.container_runtime_version_verified,false);
  assert.equal(plan.runtime.container_runtime_health_verified,false);
  assert.equal(plan.host_candidate_compatible,true);
});

test('unrecognized OCI runtime blocks rather than being treated as equivalent',()=>{
  const plan=buildHostInstallPlan({
    profileId:'personal-local',
    hostFacts:linuxFacts({container_runtime:'podman'})
  });
  assert.equal(plan.host_candidate_compatible,false);
  assert.ok(plan.blockers.includes('unrecognized-container-runtime:podman'));
});

test('source strategy requires a compatible Node runtime but OCI strategy does not',()=>{
  const missing=buildHostInstallPlan({
    profileId:'personal-local',
    hostFacts:linuxFacts(),
    runtimeStrategy:'source'
  });
  assert.equal(missing.host_candidate_compatible,false);
  assert.ok(missing.blockers.some(item=>item.includes('source-node-runtime-unavailable-or-unsupported:missing')));

  const compatible=buildHostInstallPlan({
    profileId:'personal-local',
    hostFacts:linuxFacts({node_version:'24.18.0'}),
    runtimeStrategy:'source'
  });
  assert.equal(compatible.host_candidate_compatible,true);
  assert.equal(compatible.runtime.node_runtime_required,true);

  const compatibilityLane=buildHostInstallPlan({
    profileId:'personal-local',
    hostFacts:linuxFacts({node_version:'22.23.2'}),
    runtimeStrategy:'source'
  });
  assert.equal(compatibilityLane.host_candidate_compatible,true);
});

test('unsupported platform distribution architecture or host semantics fail closed',()=>{
  for (const [facts,reason] of [
    [linuxFacts({platform:'win32'}),'unsupported-platform:win32'],
    [linuxFacts({architecture:'riscv64'}),'unsupported-architecture:riscv64'],
    [linuxFacts({distro_id:'debian',distro_version:'13'}),'unsupported-distribution:debian:13'],
    [linuxFacts({init_system:'openrc'}),'unsupported-init-system:openrc'],
    [linuxFacts({package_manager:'dnf'}),'unsupported-package-manager:dnf'],
    [linuxFacts({memory_bytes:0}),'memory-observation-unavailable'],
    [linuxFacts({root_filesystem_free_bytes:0}),'root-filesystem-free-space-observation-unavailable']
  ]) {
    const plan=buildHostInstallPlan({profileId:'personal-local',hostFacts:facts});
    assert.equal(plan.host_candidate_compatible,false);
    assert.ok(plan.blockers.includes(reason),reason);
  }
});



test('supplied facts file is always labelled supplied-evidence',async()=>{
  const root=await mkdtemp(join(tmpdir(),'axiom-host-facts-'));
  const path=join(root,'facts.json');
  await writeFile(path,JSON.stringify(linuxFacts({
    facts_source:'live-local-observation',
    container_runtime:'docker'
  })));
  const plan=await hostInstallMain([
    'plan','personal-local','--runtime','oci','--facts',path
  ]);
  assert.equal(plan.host_facts_source,'supplied-evidence');
});

test('unknown host fact provenance fails closed',()=>{
  assert.throws(()=>buildHostInstallPlan({
    profileId:'personal-local',
    hostFacts:linuxFacts({facts_source:'claimed-live-by-file'})
  }),/facts_source/);
});

test('infrastructure planning reuses the existing service-unit projection without enrollment',()=>{
  const plan=buildHostInstallPlan({
    profileId:'infrastructure-node',
    hostFacts:linuxFacts({container_runtime:'docker'})
  });
  assert.equal(plan.topology,'independent-service-units');
  assert.equal(plan.service_units,'required');
  assert.equal(plan.provisioning.service_unit_projection,'compose-existing-provision-service-units');
  assert.equal(plan.network.mesh_enrollment,'not-performed');
  assert.equal(plan.authority_effect,'none');
});

test('plans are deterministic digest-bound and closed against authority laundering',()=>{
  const facts=linuxFacts({container_runtime:'docker'});
  const left=buildHostInstallPlan({profileId:'personal-local',hostFacts:facts});
  const right=buildHostInstallPlan({profileId:'personal-local',hostFacts:facts});
  assert.deepEqual(left,right);
  assert.match(left.plan_digest,/^[a-f0-9]{64}$/);

  const drift=/weakens or drifts from the non-mutating boundary/;
  const cases=[
    [x=>{x.schema='axiom-host-install-plan.v2';},drift],
    [x=>{x.version=2;},drift],
    [x=>{x.kernel_version='0.0.0';},drift],
    [x=>{x.status='install-authorized';},drift],
    [x=>{x.profile_id='other';},drift],
    [x=>{x.profile_id='infrastructure-node';},drift],
    [x=>{x.target_status='draft';},drift],
    [x=>{x.runtime_strategy='bare-metal';},drift],
    [x=>{x.host_facts_source='claimed-live';},drift],
    [x=>{x.policy_digest='a'.repeat(64);},drift],
    [x=>{x.install_targets_digest='a'.repeat(64);},drift],
    [x=>{x.source_setup_policy_digest='a'.repeat(64);},drift],
    [x=>{x.mutating_installer_status='implemented';},drift],
    [x=>{x.eligible_for_mutating_install=true;},drift],
    [x=>{x.mutation_performed=true;},drift],
    [x=>{x.live_services_started=true;},drift],
    [x=>{x.credentials_created=true;},drift],
    [x=>{x.authority_effect='grant';},drift],
    [x=>{x.network_effect='egress';},drift],
    [x=>{x.profile_digest='a'.repeat(64);},drift],
    [x=>{x.topology='other';},drift],
    [x=>{x.runtime_identity='root';},drift],
    [x=>{x.service_units='required';},drift],
    [x=>{x.directories.data_dir='/tmp/other';},drift],
    [x=>{x.provisioning.production_credentials='invent-credentials';},drift],
    [x=>{x.provisioning.service_unit_projection='compose-existing-provision-service-units';},drift],
    [x=>{x.host_candidate_compatible=false;},/compatibility does not match blockers/],
    [x=>{x.blockers=['a','a'];},/plan\.blockers contains invalid or duplicate values/],
    [x=>{x.prerequisites=[''];},/plan\.prerequisites contains invalid or duplicate values/],
    [x=>{x.network.public_ingress_enabled=true;},/network boundary is invalid/],
    [x=>{x.network.external_egress='allow';},/network boundary is invalid/],
    [x=>{x.network.mesh_enrollment='enrolled';},/network boundary is invalid/],
    [x=>{x.network.extra=true;},/network key inventory drifted/],
    [x=>{x.provisioning.signed_release_manifest_verified=true;},/cannot claim release verification/],
    [x=>{x.runtime.node_runtime_required=true;},/overclaims verification/],
    [x=>{x.runtime.container_runtime_version_verified=true;},/overclaims verification/],
    [x=>{x.runtime.container_runtime_health_verified=true;},/overclaims verification/],
    [x=>{x.runtime.node_runtime_observed=null;x.host_candidate_compatible=false;x.blockers=['source-node-runtime-unavailable-or-unsupported:missing'];},/OCI install planning cannot require a Node runtime/],
    [x=>{x.stages.pop();},/stages inventory is invalid/],
    [x=>{x.host_facts_digest='not-a-digest';},drift],
    [x=>{x.stages[1].id='service-deployment';},/stage evidence is invalid/],
    [x=>{x.stages[1].sequence=9;},/stage evidence is invalid/],
    [x=>{x.stages[1].privileged_effect_performed=true;},/stage evidence is invalid/],
    [x=>{x.stages[1].state='observed';},/stage evidence is invalid/],
    [x=>{x.stages[0].state='planned-not-executed';},/stage evidence is invalid/],
    [x=>{x.stages[1].state='executed';},/stage evidence is invalid/],
    [x=>{x.extra_authority=true;},/key inventory drifted/]
  ];
  for (const [mutate,reason] of cases) {
    const changed=structuredClone(left);
    mutate(changed);
    assert.throws(()=>validateHostInstallPlan(reseal(changed)),reason,String(mutate));
  }
  assert.equal(validateHostInstallPlan(reseal(structuredClone(left))).valid,true);

  for (const mutate of [
    x=>{x.host_facts_digest='a'.repeat(64);},
    x=>{x.prerequisites=['install-reviewed-container-runtime:docker'];},
    x=>{x.runtime.node_runtime_observed='24.18.0';},
    x=>{x.plan_digest='a'.repeat(64);}
  ]) {
    const changed=structuredClone(left);
    mutate(changed);
    assert.throws(()=>validateHostInstallPlan(changed),/digest does not match its content/);
  }
});

test('host facts and plan inputs reject proxies accessors hidden fields and sparse arrays',()=>{
  const facts=linuxFacts({container_runtime:'docker'});
  assert.throws(()=>buildHostInstallPlan({
    profileId:'personal-local',
    hostFacts:new Proxy(facts,{})
  }),/Proxy/i);

  let reads=0;
  const accessor=structuredClone(facts);
  Object.defineProperty(accessor,'platform',{
    enumerable:true,
    get(){reads+=1;return 'linux';}
  });
  assert.throws(()=>buildHostInstallPlan({profileId:'personal-local',hostFacts:accessor}),/data properties/i);
  assert.equal(reads,0);

  const plan=structuredClone(buildHostInstallPlan({profileId:'personal-local',hostFacts:facts}));
  plan.blockers=new Array(1);
  assert.throws(()=>validateHostInstallPlan(plan),/sparse|invalid cardinality/i);
});

test('planner lib and CLI are observation-only and cannot mutate execute or reach the network',async()=>{
  for (const file of ['../src/lib/host-install-plan.mjs','../src/lib/node-runtime-version.mjs','../src/host-install.mjs']) {
    const source=await readFile(new URL(file,import.meta.url),'utf8');
    assert.doesNotMatch(source,/child_process|\bspawn(Sync)?\s*\(|\bexec(File|Sync)?\s*\(|\bfork\s*\(/,file);
    assert.doesNotMatch(source,/writeFile|appendFile|createWriteStream|copyFile|symlink|mkdir|chmod|chown|\brm\s*\(|rmdir|unlink|rename|truncate/,file);
    assert.doesNotMatch(source,/['"]node:(http|https|http2|net|dgram|tls|dns)['"]|['"](http|https|http2|net|dgram|tls|dns)['"]|\bfetch\s*\(|\bimport\s*\(/,file);
  }
  const lib=await readFile(new URL('../src/lib/host-install-plan.mjs',import.meta.url),'utf8');
  const imports=[...lib.matchAll(/^import .* from '([^']+)'/gm)].map(match=>match[1]).sort();
  assert.deepEqual(imports,[
    '../../config/host-install-policy.json',
    '../../config/install-targets.json',
    '../../config/setup.json',
    './canonical.mjs',
    './node-runtime-version.mjs',
    'node:fs',
    'node:fs/promises',
    'node:os',
    'node:path',
    'node:util'
  ]);
  const cli=await readFile(new URL('../src/host-install.mjs',import.meta.url),'utf8');
  assert.match(cli,/\n  validateHostInstallPlan\(plan\);\n  return plan;\n/);
});

test('source Node runtime boundary reuses the canonical setup rule and rejects malformed versions',()=>{
  const rejected=[
    '22.23.1','23.0.0','23.11.0','24.13.9','25.0.0','21.7.3',
    '22.23.2;rm -rf /','22.23.2garbage','22.23.2\n','22.23.2-rc.1','24.14.0-pre',
    'vv22.23.2',' 22.23.2','22.23','24'
  ];
  for (const node_version of rejected) {
    const plan=buildHostInstallPlan({
      profileId:'personal-local',
      hostFacts:linuxFacts({node_version}),
      runtimeStrategy:'source'
    });
    assert.equal(plan.host_candidate_compatible,false,JSON.stringify(node_version));
    assert.deepEqual(plan.blockers,[`source-node-runtime-unavailable-or-unsupported:${node_version}`]);
    assert.equal(validateHostInstallPlan(plan).valid,true);
  }
  for (const node_version of ['22.23.2','22.24.0','24.14.0','v22.23.2','v24.14.0','24.99.0']) {
    const plan=buildHostInstallPlan({
      profileId:'personal-local',
      hostFacts:linuxFacts({node_version}),
      runtimeStrategy:'source'
    });
    assert.equal(plan.host_candidate_compatible,true,node_version);
    assert.deepEqual(plan.blockers,[]);
  }
});

test('distribution id and version are both required to match',()=>{
  for (const [facts,reason] of [
    [linuxFacts({distro_version:'22.04'}),'unsupported-distribution:ubuntu:22.04'],
    [linuxFacts({distro_id:'debian'}),'unsupported-distribution:debian:24.04']
  ]) {
    const plan=buildHostInstallPlan({profileId:'personal-local',hostFacts:facts});
    assert.deepEqual(plan.blockers,[reason]);
    assert.equal(plan.blockers.some(item=>item.startsWith('unsupported-package-manager')),false);
  }
  const mismatch=buildHostInstallPlan({
    profileId:'personal-local',
    hostFacts:linuxFacts({init_system:'openrc',package_manager:'dnf'})
  });
  assert.deepEqual(mismatch.blockers,['unsupported-init-system:openrc','unsupported-package-manager:dnf']);
});

test('hostile or malformed host facts fail closed with the specific guard',()=>{
  for (const [overrides,reason] of [
    [{platform:''},/Host fact is invalid: platform/],
    [{architecture:7},/Host fact is invalid: architecture/],
    [{distro_id:'x'.repeat(201)},/Host fact is invalid: distro_id/],
    [{distro_version:null},/Host fact is invalid: distro_version/],
    [{init_system:''},/Host fact is invalid: init_system/],
    [{package_manager:['apt-get']},/Host fact is invalid: package_manager/],
    [{container_runtime:'x'.repeat(201)},/Host fact is invalid: container_runtime/],
    [{facts_source:''},/Host fact is invalid: facts_source/],
    [{node_version:24},/Host fact is invalid: node_version/],
    [{node_version:'2'.repeat(65)},/Host fact is invalid: node_version/],
    [{memory_bytes:-1},/Host numeric fact is invalid: memory_bytes/],
    [{memory_bytes:1.5},/Host numeric fact is invalid: memory_bytes/],
    [{root_filesystem_free_bytes:Number.MAX_SAFE_INTEGER+1},/Host numeric fact is invalid: root_filesystem_free_bytes/],
    [{effective_uid:-1},/Host fact is invalid: effective_uid/],
    [{effective_uid:'0'},/Host fact is invalid: effective_uid/],
    [{extra:true},/Host facts key inventory drifted/]
  ]) {
    assert.throws(()=>buildHostInstallPlan({
      profileId:'personal-local',
      hostFacts:linuxFacts(overrides)
    }),reason,JSON.stringify(Object.keys(overrides)));
  }
  const missing=linuxFacts();
  delete missing.effective_uid;
  assert.throws(()=>buildHostInstallPlan({profileId:'personal-local',hostFacts:missing}),/Host facts key inventory drifted/);
  const symbolic=linuxFacts();
  symbolic[Symbol('authority')]=true;
  assert.throws(()=>buildHostInstallPlan({profileId:'personal-local',hostFacts:symbolic}),/symbol keys/);
  assert.throws(()=>buildHostInstallPlan({
    profileId:'personal-local',
    hostFacts:Object.assign(Object.create({inherited:true}),linuxFacts())
  }),/plain object/);
  const hidden=linuxFacts();
  Object.defineProperty(hidden,'platform',{value:'linux',enumerable:false});
  assert.throws(()=>buildHostInstallPlan({profileId:'personal-local',hostFacts:hidden}),/data properties/);
  assert.throws(()=>buildHostInstallPlan({profileId:'root',hostFacts:linuxFacts()}),/Unknown host install profile/);
  assert.throws(()=>buildHostInstallPlan({
    profileId:'personal-local',hostFacts:linuxFacts(),runtimeStrategy:'bare-metal'
  }),/Unknown host install runtime strategy/);

  const plan=structuredClone(buildHostInstallPlan({profileId:'personal-local',hostFacts:linuxFacts()}));
  const custom=[];
  custom.authority='grant';
  plan.blockers=custom;
  assert.throws(()=>validateHostInstallPlan(plan),/custom array state/);
});

test('maximum-length host facts build a plan that validates in the lib and CLI',async()=>{
  const long=character=>character.repeat(200);
  const facts=linuxFacts({
    platform:long('p'),
    architecture:long('a'),
    distro_id:long('d'),
    distro_version:long('v'),
    init_system:long('i'),
    package_manager:long('m'),
    container_runtime:long('c'),
    node_version:'9'.repeat(64)
  });
  for (const runtimeStrategy of ['oci','source']) {
    const plan=buildHostInstallPlan({profileId:'infrastructure-node',hostFacts:facts,runtimeStrategy});
    assert.equal(plan.host_candidate_compatible,false);
    assert.ok(plan.blockers.every(item=>item.length<=512));
    assert.equal(validateHostInstallPlan(plan).valid,true);
  }
  const root=await mkdtemp(join(tmpdir(),'axiom-host-facts-'));
  const path=join(root,'facts.json');
  await writeFile(path,JSON.stringify(facts));
  const cliPlan=await hostInstallMain(['plan','infrastructure-node','--runtime','source','--facts',path]);
  assert.equal(validateHostInstallPlan(cliPlan).valid,true);
});

test('host facts file errors never echo file content',async()=>{
  const root=await mkdtemp(join(tmpdir(),'axiom-host-facts-'));
  const path=join(root,'facts.json');
  await writeFile(path,'SECRETTOKEN-0123456789abcdef not json');
  await assert.rejects(
    hostInstallMain(['plan','personal-local','--facts',path]),
    error=>{
      assert.match(error.message,/^Host facts file is not valid JSON$/);
      assert.doesNotMatch(error.message,/SECRET|TOKEN|0123/);
      return true;
    }
  );
  await assert.rejects(
    hostInstallMain(['plan','personal-local','--facts',join(root,'absent.json')]),
    /^ValidationError: Unable to read host facts file \(ENOENT\)$|Unable to read host facts file \(ENOENT\)/
  );
});

test('host install policy pins the supported distribution facts and directories',()=>{
  const drifted=[
    [x=>{x.planner.supported_distributions[0].id='debian';},/supported_distributions drifted/],
    [x=>{x.planner.supported_distributions[0].versions=['24.04','22.04'];},/supported_distributions drifted/],
    [x=>{x.planner.supported_distributions[0].package_manager='dnf';},/supported_distributions drifted/],
    [x=>{x.planner.supported_distributions[0].init_system='openrc';},/supported_distributions drifted/],
    [x=>{x.planner.supported_distributions.push({id:'debian',versions:['13'],package_manager:'apt-get',init_system:'systemd'});},/supported_distributions drifted/],
    [x=>{x.planner.required_facts=x.planner.required_facts.filter(item=>item!=='effective_uid');},/required_facts drifted/],
    [x=>{x.planner.required_facts=x.planner.required_facts.filter(item=>item!=='node_version');},/required_facts drifted/],
    [x=>{x.profiles['personal-local'].data_dir='/tmp/axiom';},/directories drifted: personal-local/],
    [x=>{x.profiles['infrastructure-node'].units_dir='/etc/systemd/system';},/directories drifted: infrastructure-node/],
    [x=>{x.profiles['personal-local'].secret_dir='/';},/directories drifted: personal-local/]
  ];
  for (const [mutate,reason] of drifted) {
    const policy=structuredClone(installPolicy);
    mutate(policy);
    assert.throws(()=>validateHostInstallPolicy(policy),reason,String(mutate));
  }
  assert.equal(validateHostInstallPolicy(structuredClone(installPolicy)).valid,true);
});

test('planner library stays importable without a script argv entry',()=>{
  const result=spawnSync(process.execPath,[
    '--input-type=module','-e',
    `const m=await import(${JSON.stringify(new URL('../src/lib/host-install-plan.mjs',import.meta.url).href)});process.stdout.write(String(typeof m.buildHostInstallPlan));`
  ],{encoding:'utf8'});
  assert.equal(result.status,0,result.stderr);
  assert.equal(result.stdout,'function');
});

function countingProxy(target) {
  const counter={traps:0};
  const handler=new Proxy({},{
    get(_unused,trap){
      return (...args)=>{counter.traps+=1;return Reflect[trap](...args);};
    }
  });
  return {proxy:new Proxy(target,handler),counter};
}

function basePlan() {
  return structuredClone(buildHostInstallPlan({
    profileId:'infrastructure-node',
    hostFacts:linuxFacts({container_runtime:'docker'})
  }));
}

test('nested plan proxies are rejected before any trap runs',()=>{
  for (const place of [
    'provisioning','runtime','network','directories','stages','blockers','prerequisites','stage'
  ]) {
    const plan=basePlan();
    const holder=place==='stage'?plan.stages:plan;
    const key=place==='stage'?1:place;
    const {proxy,counter}=countingProxy(holder[key]);
    holder[key]=proxy;
    assert.throws(()=>validateHostInstallPlan(plan),error=>{
      assert.ok(error instanceof ValidationError,`${place}: ${error}`);
      return true;
    },place);
    assert.equal(counter.traps,0,place);
  }
  // Verifier demo: a validated plan must not later read secret_dir '/' or an executed stage.
  const demo=basePlan();
  let reads=0;
  demo.directories=new Proxy(demo.directories,{get(target,key){reads+=1;return key==='secret_dir'&&reads>4?'/':Reflect.get(target,key);}});
  assert.throws(()=>validateHostInstallPlan(demo),/directories cannot be a Proxy/);
  assert.equal(reads,0);
});

test('nested plan getters are rejected without being invoked',()=>{
  for (const [place,key] of [
    ['provisioning','production_credentials'],
    ['runtime','container_runtime_observed'],
    ['network','external_egress'],
    ['directories','secret_dir'],
    ['stage','privileged_effect_performed'],
    ['stages','1']
  ]) {
    const plan=basePlan();
    const holder=place==='stage'?plan.stages[1]:plan[place];
    const original=holder[key];
    let reads=0;
    Object.defineProperty(holder,key,{enumerable:true,configurable:true,get(){reads+=1;return original;}});
    assert.throws(()=>validateHostInstallPlan(plan),/data properties/,`${place}.${key}`);
    assert.equal(reads,0,`${place}.${key}`);
  }
});

test('null undefined non-finite and non-JSON plan leaves fail closed with ValidationError',()=>{
  const cases=[
    x=>{x.provisioning=null;},
    x=>{x.provisioning=undefined;},
    x=>{x.runtime=null;},
    x=>{x.network=[];},
    x=>{x.directories=undefined;},
    x=>{x.directories=null;},
    x=>{x.stages=null;},
    x=>{x.stages[1]=null;},
    x=>{x.blockers=undefined;},
    x=>{x.version=Number.NaN;},
    x=>{x.version=Number.POSITIVE_INFINITY;},
    x=>{x.status=undefined;},
    x=>{x.status=Symbol('install');},
    x=>{x.version=1n;},
    x=>{x.authority_effect=()=>'none';},
    x=>{x.runtime.node_runtime_observed=Symbol('24.18.0');},
    x=>{x.runtime.node_runtime_observed=undefined;},
    x=>{x.provisioning.signed_release_manifest_verified={};},
    x=>{x.network.public_ingress_enabled=Number.NaN;},
    x=>{x.directories.secret_dir={path:'/'};},
    x=>{x.directories.secret_dir=undefined;},
    x=>{x.directories[Symbol('dir')]='/';},
    x=>{x.stages[1].sequence=Number.NaN;},
    x=>{x.stages[1].state=undefined;},
    x=>{x.stages.extra=true;},
    x=>{x.stages[Symbol('stage')]=true;},
    x=>{Object.setPrototypeOf(x.stages,Object.create(Array.prototype));}
  ];
  for (const mutate of cases) {
    const plan=basePlan();
    mutate(plan);
    assert.throws(()=>validateHostInstallPlan(plan),error=>{
      assert.ok(error instanceof ValidationError,`${String(mutate)} -> ${error?.name}: ${error?.message}`);
      return true;
    });
  }
});

test('a validated plan changed afterwards no longer validates',()=>{
  for (const mutate of [
    x=>{x.directories.secret_dir='/';},
    x=>{x.stages[1].state='observed';},
    x=>{x.stages[1].privileged_effect_performed=true;},
    x=>{x.blockers.push('ignored');}
  ]) {
    const plan=basePlan();
    assert.equal(validateHostInstallPlan(plan).valid,true);
    mutate(plan);
    assert.throws(()=>validateHostInstallPlan(plan),ValidationError,String(mutate));
  }
});

test('container runtime recognition is re-derived by the validator',()=>{
  const podman=structuredClone(buildHostInstallPlan({
    profileId:'personal-local',hostFacts:linuxFacts({container_runtime:'podman'})
  }));
  assert.equal(podman.runtime.container_runtime_name_recognized,false);
  podman.runtime.container_runtime_name_recognized=true;
  assert.throws(()=>validateHostInstallPlan(reseal(podman)),/overclaims verification/);

  const docker=basePlan();
  docker.runtime.container_runtime_name_recognized=false;
  assert.throws(()=>validateHostInstallPlan(reseal(docker)),/overclaims verification/);

  const source=structuredClone(buildHostInstallPlan({
    profileId:'personal-local',
    hostFacts:linuxFacts({container_runtime:'docker',node_version:'24.18.0'}),
    runtimeStrategy:'source'
  }));
  assert.equal(source.runtime.container_runtime_name_recognized,false);
  source.runtime.container_runtime_name_recognized=true;
  assert.throws(()=>validateHostInstallPlan(reseal(source)),/overclaims verification/);
});

test('leading-zero versions are rejected by the shared setup and planner rule',()=>{
  for (const version of ['024.14.0','22.023.2','24.14.00','v024.18.0','00.0.0']) {
    assert.throws(()=>assertProductionRuntime(version),ValidationError,version);
    assert.throws(()=>setupClassify(version,setupPolicy.runtime),/version is invalid/,version);
    const plan=buildHostInstallPlan({
      profileId:'personal-local',hostFacts:linuxFacts({node_version:version}),runtimeStrategy:'source'
    });
    assert.deepEqual(plan.blockers,[`source-node-runtime-unavailable-or-unsupported:${version}`]);
  }
  assert.equal(setupClassify('24.20.0',setupPolicy.runtime),'primary');
  assert.equal(setupClassify('v22.30.10',setupPolicy.runtime),'compatibility');
});

test('host install policy pins profile applications, enrollment, and every identity boundary',()=>{
  const cases=[
    [x=>{x.profiles['personal-local'].applications.push('axiom-birth');},/applications drifted: personal-local/],
    [x=>{x.profiles['personal-local'].applications=[];},/applications drifted: personal-local/],
    [x=>{x.profiles['personal-local'].applications=['axiom-education','axiom-one'];},/applications drifted: personal-local/],
    [x=>{x.profiles['personal-local'].applications=['axiom-one','axiom-one'];},/invalid or duplicate/],
    [x=>{x.profiles['infrastructure-node'].network_participation='auto-enrolled';},/network participation drifted: infrastructure-node/],
    [x=>{x.version=2;},/identity or authority boundary is invalid/],
    [x=>{x.host_mutation_enabled=true;},/identity or authority boundary is invalid/],
    [x=>{x.authority_effect='grant';},/identity or authority boundary is invalid/],
    [x=>{x.status='installer-implemented';},/identity or authority boundary is invalid/],
    [x=>{x.planner.platforms=['linux','win32'];},/planner policy drifted/],
    [x=>{x.planner.architectures=['x64'];},/planner policy drifted/],
    [x=>{x.planner.recognized_oci_runtime_names=['docker','podman'];},/planner policy drifted/],
    [x=>{x.planner.planner_execution_requires_node=false;},/planner policy drifted/],
    [x=>{x.planner.mutation_performed=true;},/planner policy drifted/],
    [x=>{x.mutating_installer.status='implemented';},/non-claims drifted/],
    [x=>{x.mutating_installer.requires_signed_release_manifest=false;},/non-claims drifted/],
    [x=>{x.mutating_installer.installation_grants_authority=true;},/non-claims drifted/],
    [x=>{x.mutating_installer.public_ingress_default=true;},/non-claims drifted/],
    [x=>{x.stages=[...x.stages].reverse();},/profile or stage inventory drifted/],
    [x=>{x.profiles={'personal-local':x.profiles['personal-local']};},/profile or stage inventory drifted/],
    [x=>{x.profiles['infrastructure-node'].runtime_identity='root';},/authority or topology boundary drifted: infrastructure-node/]
  ];
  for (const [mutate,reason] of cases) {
    const policy=structuredClone(installPolicy);
    mutate(policy);
    assert.throws(()=>validateHostInstallPolicy(policy),reason,String(mutate));
  }
  const targets=structuredClone(installTargetsJson);
  targets.targets.find(item=>item.id==='personal-local').installation_grants_authority=true;
  assert.throws(()=>validateHostInstallPolicy(structuredClone(installPolicy),targets),/authority or topology boundary drifted: personal-local/);
  const catalogue=structuredClone(installTargetsJson);
  catalogue.targets.find(item=>item.id==='personal-local').application_catalog=['axiom-one'];
  assert.throws(()=>validateHostInstallPolicy(structuredClone(installPolicy),catalogue),/applications drifted: personal-local/);
});

test('proxy objects in leaf positions are rejected before any trap runs',()=>{
  for (const [place,key] of [
    ['plan','status'],
    ['provisioning','production_credentials'],
    ['runtime','node_runtime_observed'],
    ['network','external_egress'],
    ['stage','state']
  ]) {
    const plan=basePlan();
    const holder=place==='plan'?plan:place==='stage'?plan.stages[1]:plan[place];
    const {proxy,counter}=countingProxy({});
    holder[key]=proxy;
    assert.throws(()=>validateHostInstallPlan(plan),/must be a JSON scalar/,`${place}.${key}`);
    assert.equal(counter.traps,0,`${place}.${key}`);
  }
  const plan=basePlan();
  const {proxy,counter}=countingProxy({});
  plan.directories.secret_dir=proxy;
  assert.throws(()=>validateHostInstallPlan(plan),/directories must contain only strings/);
  assert.equal(counter.traps,0);
});

test('structural plan guards report the specific failed guard',()=>{
  for (const [mutate,reason] of [
    [x=>{x.version=Number.NaN;},/field version must be a JSON scalar/],
    [x=>{x.status=undefined;},/field status must be a JSON scalar/],
    [x=>{x.provisioning.signed_release_manifest_verified=Number.POSITIVE_INFINITY;},/provisioning field signed_release_manifest_verified must be a JSON scalar/],
    [x=>{x.runtime.node_runtime_observed=undefined;},/runtime field node_runtime_observed must be a JSON scalar/],
    [x=>{x.network.public_ingress_enabled=Number.NaN;},/network field public_ingress_enabled must be a JSON scalar/],
    [x=>{x.stages[1].sequence=Number.NaN;},/stage field sequence must be a JSON scalar/],
    [x=>{x.directories.secret_dir=undefined;},/directories must contain only strings/],
    [x=>{Object.setPrototypeOf(x.stages,Object.create(Array.prototype));},/stages inventory is invalid/],
    [x=>{x.stages.extra=true;},/stages must contain only indexed data properties/],
    [x=>{x.stages[Symbol('stage')]=true;},/stages must contain only indexed data properties/],
    [x=>{x.provisioning=null;},/provisioning must be an object/],
    [x=>{x.directories=undefined;},/directories must be an object/]
  ]) {
    const plan=basePlan();
    mutate(plan);
    assert.throws(()=>validateHostInstallPlan(plan),reason,String(mutate));
  }
});

test('personal-local applications are pinned even when the target catalogue drifts with them',()=>{
  const policy=structuredClone(installPolicy);
  const targets=structuredClone(installTargetsJson);
  policy.profiles['personal-local'].applications=['axiom-one','axiom-birth'];
  targets.targets.find(item=>item.id==='personal-local').application_catalog=['axiom-one','axiom-birth'];
  assert.throws(()=>validateHostInstallPolicy(policy,targets),/applications drifted: personal-local/);
});

// AT-7 anchor: the plan validator already meets the hostile-input contract.
test('AT-7: validateHostInstallPlan meets the hostile-input contract', async () => {
  await assertHostileInputContract({
    name: 'validateHostInstallPlan',
    fn: validateHostInstallPlan,
    validArgs: () => [basePlan()],
    nullablePaths: ['arg0.runtime.node_runtime_observed']
  }, assert);
});

// AT-4: the policy and targets are plain JSON data throughout before any
// canonicalJson comparison or digest, so no trap or getter runs.
test('AT-4: validateHostInstallPolicy rejects Proxy or accessor planner.platforms with ValidationError and runs no trap or getter',()=>{
  let calls=0;
  const variants={
    'transparent Proxy':(platforms)=>new Proxy(platforms,{get(target,key,receiver){ calls+=1; return Reflect.get(target,key,receiver); }}),
    'throwing Proxy':(platforms)=>new Proxy(platforms,new Proxy({},{get(){ return ()=>{ calls+=1; throw new Error('trap ran'); }; }})),
    'getter at [0]':(platforms)=>Object.defineProperty([...platforms],0,{get(){ calls+=1; return platforms[0]; },enumerable:true})
  };
  for (const [name,make] of Object.entries(variants)) {
    const policy=structuredClone(installPolicy);
    policy.planner.platforms=make(policy.planner.platforms);
    assert.throws(()=>validateHostInstallPolicy(policy,structuredClone(installTargetsJson)),ValidationError,name);
  }
  assert.equal(calls,0);
  assert.equal(validateHostInstallPolicy(structuredClone(installPolicy),structuredClone(installTargetsJson)).valid,true);
});

test('hostile-input contract: validateHostInstallPolicy rejects every hostile variant with ValidationError',async()=>{
  await assertHostileInputContract({
    name:'validateHostInstallPolicy',
    fn:validateHostInstallPolicy,
    validArgs:()=>[structuredClone(installPolicy),structuredClone(installTargetsJson)],
    // Both arguments default to the shipped configuration.
    acceptablePaths:{arg0:['undefined'],arg1:['undefined']},
    // The targets catalogue is open here: this validator cross-checks only the
    // fields it binds (kernel version, per-target catalogues) and digests the
    // rest, so only non-JSON hostility is checked under it.
    structuralOnlyPaths:['arg1'],
    openPaths:[/^arg1(\..*)?$/],
    maxPaths:2000
  },assert);
});
