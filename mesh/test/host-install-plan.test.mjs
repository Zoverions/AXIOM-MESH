import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  buildHostInstallPlan,
  HOST_INSTALL_PLAN_SCHEMA,
  HOST_INSTALL_PLAN_STATUS,
  validateHostInstallPlan,
  validateHostInstallPolicy
} from '../src/lib/host-install-plan.mjs';

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

test('OCI-first clean-host plan does not require preinstalled Node or mutate the host',()=>{
  const plan=buildHostInstallPlan({
    profileId:'personal-local',
    hostFacts:linuxFacts(),
    runtimeStrategy:'oci'
  });
  assert.equal(plan.schema,HOST_INSTALL_PLAN_SCHEMA);
  assert.equal(plan.status,HOST_INSTALL_PLAN_STATUS);
  assert.equal(plan.runtime_strategy,'oci');
  assert.equal(plan.host_candidate_compatible,true);
  assert.deepEqual(plan.blockers,[]);
  assert.deepEqual(plan.prerequisites,['install-reviewed-container-runtime:docker']);
  assert.equal(plan.runtime.node_runtime_required,false);
  assert.equal(plan.runtime.node_runtime_observed,null);
  assert.equal(plan.runtime.container_runtime_verified,false);
  assert.equal(plan.network.public_ingress_enabled,false);
  assert.equal(plan.network.external_egress,'deny');
  assert.equal(plan.network.mesh_enrollment,'not-performed');
  assert.equal(plan.mutation_performed,false);
  assert.equal(plan.credentials_created,false);
  assert.equal(plan.live_services_started,false);
  assert.equal(plan.authority_effect,'none');
  assert.equal(validateHostInstallPlan(plan).valid,true);
});

test('verified Docker observation removes the OCI acquisition prerequisite',()=>{
  const plan=buildHostInstallPlan({
    profileId:'personal-local',
    hostFacts:linuxFacts({container_runtime:'docker'})
  });
  assert.deepEqual(plan.prerequisites,[]);
  assert.equal(plan.runtime.container_runtime_verified,true);
  assert.equal(plan.host_candidate_compatible,true);
});

test('unverified OCI runtime blocks rather than being treated as equivalent',()=>{
  const plan=buildHostInstallPlan({
    profileId:'personal-local',
    hostFacts:linuxFacts({container_runtime:'podman'})
  });
  assert.equal(plan.host_candidate_compatible,false);
  assert.ok(plan.blockers.includes('unverified-container-runtime:podman'));
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

  for (const mutate of [
    x=>{x.authority_effect='grant';},
    x=>{x.network.public_ingress_enabled=true;},
    x=>{x.network.external_egress='allow';},
    x=>{x.eligible_for_mutating_install=true;},
    x=>{x.mutation_performed=true;},
    x=>{x.credentials_created=true;},
    x=>{x.provisioning.signed_release_manifest_verified=true;},
    x=>{x.extra_authority=true;}
  ]) {
    const changed=structuredClone(left);
    mutate(changed);
    assert.throws(()=>validateHostInstallPlan(changed));
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

test('planner source is observation-only and cannot invoke host mutation/process execution',async()=>{
  const source=await readFile(new URL('../src/lib/host-install-plan.mjs',import.meta.url),'utf8');
  assert.doesNotMatch(source,/node:child_process|\bexec\s*\(|\bspawn\s*\(|\bexecFile\s*\(/);
  assert.doesNotMatch(source,/writeFile|mkdir|chmod|chown|rm\s*\(|unlink|rename/);
});
