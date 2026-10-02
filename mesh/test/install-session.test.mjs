import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  INSTALL_SESSION_CANDIDATE_SCHEMA,
  INSTALLED_STATE_OBSERVATION_SCHEMA,
  assessInstallSession,
  computeInstalledStateObservationDigest,
  installSessionCandidateDigest,
  validateInstallSessionCandidate,
  validateInstallSessionDecision,
  validateInstalledStateObservation,
  computeInstallSessionDecisionDigest
} from '../src/lib/install-session.mjs';
import { ValidationError } from '../src/lib/canonical.mjs';

const A='a'.repeat(64);
const B='b'.repeat(64);
const C='c'.repeat(64);
const D='d'.repeat(64);
const REV='1'.repeat(40);

function candidate(overrides={}){
  return {
    schema:INSTALL_SESSION_CANDIDATE_SCHEMA,
    version:0,
    status:'inert-install-session-candidate',
    session_id:'install.session.demo.1',
    profile_id:'personal-local',
    runtime_strategy:'oci',
    desired_release_id:'axiom-mesh/0.12.0-dev.3/test',
    desired_source_revision:REV,
    host_plan_digest:A,
    host_plan_facts_source:'live-local-observation',
    release_manifest_digest:B,
    artifact_sha256s:[C,D],
    artifact_evidence_refs:['artifact.verify.c','artifact.verify.d'],
    requested_at:'2026-09-28T01:00:00.000Z',
    max_observation_age_seconds:300,
    host_mutation_authorized:false,
    authority_effect:'none',
    network_effect:'none',
    runtime_activation:false,
    ...overrides
  };
}

function observation(overrides={}){
  const d={
    schema:INSTALLED_STATE_OBSERVATION_SCHEMA,
    version:0,
    status:'inert-installed-state-observation',
    observation_id:'install.observation.demo.1',
    session_id:'install.session.demo.1',
    observed_at:'2026-09-28T01:00:30.000Z',
    install_record_state:'absent',
    installed_profile_id:null,
    installed_release_id:null,
    installed_source_revision:null,
    installed_host_plan_digest:null,
    installed_release_manifest_digest:null,
    release_relation_to_desired:'absent',
    relation_evidence_ref:null,
    secret_state:'absent',
    data_state:'absent',
    service_state:'absent',
    readiness_state:'not-checked',
    evidence_refs:['install-state-scan.demo.1'],
    observation_digest:'0'.repeat(64),
    authority_effect:'none',
    mutation_effect:'none',
    runtime_activation:false,
    ...overrides
  };
  d.observation_digest=computeInstalledStateObservationDigest(d);
  return d;
}

function exactInstalled(overrides={}){
  return observation({
    install_record_state:'complete',
    installed_profile_id:'personal-local',
    installed_release_id:'axiom-mesh/0.12.0-dev.3/test',
    installed_source_revision:REV,
    installed_host_plan_digest:A,
    installed_release_manifest_digest:B,
    release_relation_to_desired:'same',
    relation_evidence_ref:null,
    secret_state:'complete',
    data_state:'present',
    service_state:'running',
    readiness_state:'ready',
    ...overrides
  });
}

function assess(c=candidate(),o=observation(),evaluatedAt='2026-09-28T01:01:00.000Z'){
  return assessInstallSession(c,o,{evaluatedAt});
}

test('candidate is inert digest-bound input and grants no mutation authority',()=>{
  const c=candidate();
  const v=validateInstallSessionCandidate(c);
  assert.equal(v.valid,true);
  assert.match(v.candidate_digest,/^[a-f0-9]{64}$/);
  assert.equal(installSessionCandidateDigest(c),v.candidate_digest);
  assert.equal(v.host_mutation_authorized,false);
  for(const mutate of [
    x=>{x.host_mutation_authorized=true;},
    x=>{x.authority_effect='grant';},
    x=>{x.network_effect='enroll';},
    x=>{x.runtime_activation=true;},
    x=>{x.artifact_sha256s=[D,C];}
  ]){
    const x=structuredClone(c);mutate(x);
    assert.throws(()=>validateInstallSessionCandidate(x));
  }
});

test('clean absent live host state yields INSTALL_REVIEW but no mutation authority',()=>{
  const d=assess();
  assert.equal(d.decision,'INSTALL_REVIEW');
  assert.deepEqual(d.reasons,['clean-absent-state']);
  assert.equal(d.host_mutation_authorized,false);
  assert.equal(validateInstallSessionDecision(d).valid,true);
  assert.match(d.decision_digest,/^[a-f0-9]{64}$/);
  const changed=structuredClone(d);
  changed.decision='STOP_CONFLICT';
  assert.throws(()=>validateInstallSessionDecision(changed),/digest mismatch/);
});

test('non-live host plans never become installation review',()=>{
  for(const source of ['supplied-evidence','synthetic-test']){
    const d=assess(candidate({host_plan_facts_source:source}),observation());
    assert.equal(d.decision,'STOP_NONLIVE_PLAN');
    assert.deepEqual(d.reasons,['host-plan-not-live-local']);
  }
});

test('exact already-ready release yields VERIFY_NOOP, not another install',()=>{
  const d=assess(candidate(),exactInstalled());
  assert.equal(d.decision,'VERIFY_NOOP');
  assert.deepEqual(d.reasons,['exact-release-already-ready']);
});

test('same exact release that is not ready becomes repair review',()=>{
  for(const state of ['not-checked','not-ready']){
    const d=assess(candidate(),exactInstalled({
      readiness_state:state,
      service_state:'stopped'
    }));
    assert.equal(d.decision,'REPAIR_REVIEW');
  }
});

test('newer installed release blocks downgrade even when operator asks for desired release',()=>{
  const o=exactInstalled({
    installed_release_id:'axiom-mesh/0.13.0/newer',
    installed_source_revision:'2'.repeat(40),
    installed_host_plan_digest:C,
    installed_release_manifest_digest:D,
    release_relation_to_desired:'descendant',
    relation_evidence_ref:'release-lineage.newer'
  });
  assert.equal(assess(candidate(),o).decision,'STOP_NEWER_PRESENT');
});

test('diverged release stops instead of hidden merge or replacement',()=>{
  const o=exactInstalled({
    installed_release_id:'axiom-mesh/fork',
    installed_source_revision:'3'.repeat(40),
    release_relation_to_desired:'diverged',
    relation_evidence_ref:'release-lineage.diverged'
  });
  assert.equal(assess(candidate(),o).decision,'STOP_DIVERGED');
});

test('ancestor release permits only upgrade review',()=>{
  const o=exactInstalled({
    installed_release_id:'axiom-mesh/0.11.0/old',
    installed_source_revision:'4'.repeat(40),
    installed_host_plan_digest:C,
    installed_release_manifest_digest:D,
    release_relation_to_desired:'ancestor',
    relation_evidence_ref:'release-lineage.ancestor',
    readiness_state:'ready'
  });
  const d=assess(candidate(),o);
  assert.equal(d.decision,'UPGRADE_REVIEW');
  assert.equal(d.host_mutation_authorized,false);
});

test('partial secret set is a hard stop before repair or recovery',()=>{
  const o=observation({
    install_record_state:'partial',
    installed_profile_id:'personal-local',
    installed_release_id:'axiom-mesh/0.12.0-dev.3/test',
    installed_source_revision:REV,
    installed_host_plan_digest:A,
    installed_release_manifest_digest:B,
    release_relation_to_desired:'same',
    secret_state:'partial',
    data_state:'present',
    service_state:'stopped',
    readiness_state:'not-ready'
  });
  assert.equal(assess(candidate(),o).decision,'STOP_PARTIAL_SECRET_STATE');
});

test('retained data or secrets without install record routes to recovery review',()=>{
  for(const overrides of [
    {data_state:'present'},
    {secret_state:'complete'}
  ]){
    const d=assess(candidate(),observation(overrides));
    assert.equal(d.decision,'RECOVERY_REVIEW');
    assert.equal(d.host_mutation_authorized,false);
  }
});

test('services without install record are a conflict, not a clean install',()=>{
  const d=assess(candidate(),observation({service_state:'running'}));
  assert.equal(d.decision,'STOP_CONFLICT');
  assert.deepEqual(d.reasons,['services-present-without-install-record']);
});

test('same release with changed plan or manifest cannot be treated as exact no-op',()=>{
  for(const overrides of [
    {installed_host_plan_digest:C},
    {installed_release_manifest_digest:D},
    {installed_profile_id:'infrastructure-node'},
    {installed_release_id:'axiom-mesh/other'},
    {installed_source_revision:'5'.repeat(40)}
  ]){
    const d=assess(candidate(),exactInstalled(overrides));
    assert.equal(d.decision,'STOP_CONFLICT');
  }
});

test('partial or failed same exact install yields repair review only',()=>{
  for(const state of ['partial','failed']){
    const o=exactInstalled({
      install_record_state:state,
      service_state:'stopped',
      readiness_state:'not-ready'
    });
    const d=assess(candidate(),o);
    assert.equal(d.decision,'REPAIR_REVIEW');
    assert.equal(d.host_mutation_authorized,false);
  }
});

test('unknown stale future or cross-session observation fails closed',()=>{
  assert.equal(
    assess(candidate(),observation({secret_state:'unknown'})).decision,
    'STOP_UNCERTAIN'
  );
  assert.equal(
    assess(candidate(),observation({observed_at:'2026-09-28T02:00:00.000Z'})).decision,
    'STOP_UNCERTAIN'
  );
  assert.equal(
    assess(candidate(),observation({observed_at:'2026-09-28T00:59:59.000Z'})).decision,
    'STOP_UNCERTAIN'
  );
  assert.deepEqual(
    assess(candidate(),observation({observed_at:'2026-09-28T00:59:59.000Z'})).reasons,
    ['observation-predates-request']
  );
  assert.equal(
    assess(candidate(),observation({observed_at:'2026-09-28T00:00:00.000Z'})).decision,
    'STOP_UNCERTAIN'
  );
  assert.equal(
    assess(candidate(),observation({session_id:'install.session.other'})).decision,
    'STOP_CONFLICT'
  );
});

test('installed observation is self-digested and rejects semantic contradictions',()=>{
  const o=observation();
  assert.equal(validateInstalledStateObservation(o).valid,true);
  const changed=structuredClone(o);
  changed.data_state='present';
  assert.throws(()=>validateInstalledStateObservation(changed),/digest mismatch/);

  const absentWithIdentity=observation({
    installed_release_id:'axiom-mesh/ghost'
  });
  assert.throws(()=>validateInstalledStateObservation(absentWithIdentity),/Absent install record/);

  const missingRelationEvidence=exactInstalled({
    release_relation_to_desired:'ancestor',
    relation_evidence_ref:null
  });
  assert.throws(()=>validateInstalledStateObservation(missingRelationEvidence),/relation requires evidence/);
});


test('ready state cannot contradict service or complete-record evidence',()=>{
  const noService=exactInstalled({service_state:'stopped'});
  assert.throws(()=>validateInstalledStateObservation(noService),/Ready installed state requires running services/);

  const noSecrets=exactInstalled({secret_state:'absent'});
  assert.throws(()=>validateInstalledStateObservation(noSecrets),/Complete install record cannot carry absent secrets or data/);
  for (const overrides of [{secret_state:'partial'},{secret_state:'unknown'},{data_state:'unknown'}]) {
    assert.throws(
      ()=>validateInstalledStateObservation(exactInstalled(overrides)),
      /Ready installed state requires complete secrets and present data/,
      JSON.stringify(overrides)
    );
  }

  const absentReady=observation({readiness_state:'ready',service_state:'running'});
  assert.throws(()=>validateInstalledStateObservation(absentReady),/Absent install record cannot claim readiness/);
});

test('hostile data containers and unknown fields fail before decision logic',()=>{
  assert.throws(
    ()=>validateInstallSessionCandidate(new Proxy(candidate(),{})),
    /Proxy/i
  );
  const c=candidate();
  c.extra=true;
  assert.throws(()=>validateInstallSessionCandidate(c),/fields are invalid/);

  let reads=0;
  const o=observation();
  Object.defineProperty(o,'secret_state',{
    enumerable:true,
    get(){reads+=1;return 'absent';}
  });
  assert.throws(()=>validateInstalledStateObservation(o),/data properties/i);
  assert.equal(reads,0);
});

test('install session logic has no process filesystem network or credential side-effect surface',async()=>{
  const source=await readFile(new URL('../src/lib/install-session.mjs',import.meta.url),'utf8');
  assert.doesNotMatch(source,/node:child_process|node:fs|node:net|node:http|node:https/);
  assert.doesNotMatch(source,/\bfetch\s*\(|\bspawn\s*\(|\bexecFile\s*\(|\bexecSync\s*\(|\bfork\s*\(/);
  const specifiers=[
    ...source.matchAll(/^\s*(?:import|export)\s+(?:[^'";]*?\s+from\s+)?['"]([^'"]+)['"]/gm)
  ].map(match=>match[1]);
  assert.deepEqual(specifiers,['node:util','./canonical.mjs']);
  assert.doesNotMatch(
    source,
    /\bprocess\b|globalThis|\bimport\s*\(|\brequire\s*\(|\bFunction\b|\beval\b|\.constructor\s*\(|\[['"]constructor['"]\]|\bnavigator\b|\bDeno\b|\bBun\b|\bWebAssembly\b/
  );
});

test('a complete install record that lost part of its secrets stops as partial secret state',()=>{
  const partial=exactInstalled({secret_state:'partial',service_state:'stopped',readiness_state:'not-ready'});
  assert.equal(validateInstalledStateObservation(partial).valid,true);
  assert.equal(assess(candidate(),partial).decision,'STOP_PARTIAL_SECRET_STATE');
  for (const overrides of [{secret_state:'unknown'},{data_state:'unknown'}]) {
    const unknown=exactInstalled({...overrides,readiness_state:'not-ready'});
    assert.equal(assess(candidate(),unknown).decision,'STOP_UNCERTAIN',JSON.stringify(overrides));
  }
  for (const overrides of [{secret_state:'absent'},{data_state:'absent'}]) {
    assert.throws(
      ()=>validateInstalledStateObservation(exactInstalled({...overrides,readiness_state:'not-ready'})),
      /Complete install record cannot carry absent secrets or data/,
      JSON.stringify(overrides)
    );
  }
});

test('ancestor claim that matches the desired identity is a conflict, not an upgrade',()=>{
  const o=exactInstalled({
    release_relation_to_desired:'ancestor',
    relation_evidence_ref:'release-lineage.claimed-ancestor'
  });
  const d=assess(candidate(),o);
  assert.equal(d.decision,'STOP_CONFLICT');
  assert.deepEqual(d.reasons,['ancestor-claim-matches-desired-identity']);
  assert.equal(d.observation_bound,false);
  for (const overrides of [
    {installed_source_revision:'4'.repeat(40)},
    {installed_release_id:'axiom-mesh/0.11.0/old'}
  ]) {
    const partial=assess(candidate(),exactInstalled({
      release_relation_to_desired:'ancestor',
      relation_evidence_ref:'release-lineage.claimed-ancestor',
      ...overrides
    }));
    assert.equal(partial.decision,'STOP_CONFLICT',JSON.stringify(overrides));
    assert.deepEqual(partial.reasons,['ancestor-claim-matches-desired-identity']);
  }
});

test('every decision is explicitly not bound to an authenticated observation',()=>{
  const d=assess();
  assert.equal(d.observation_bound,false);
  assert.equal(validateInstallSessionDecision(d).valid,true);
  const relabelled={...d,observation_bound:true};
  relabelled.decision_digest=computeInstallSessionDecisionDigest(relabelled);
  assert.throws(()=>validateInstallSessionDecision(relabelled),/activation boundary is invalid/);
  const {observation_bound:_omitted,...missing}=d;
  assert.throws(()=>validateInstallSessionDecision(missing),/fields are invalid|key inventory|invalid/);
});

test('assessInstallSession rejects null or non-plain options with ValidationError',()=>{
  for (const options of [null,7,'evaluatedAt',[],new Proxy({evaluatedAt:'2026-09-28T01:01:00.000Z'},{})]) {
    assert.throws(()=>assessInstallSession(candidate(),observation(),options),error=>{
      assert.ok(error instanceof ValidationError,`${String(options)}: ${error?.name}: ${error?.message}`);
      assert.match(error.message,/Install session assessment options must be a plain object/);
      return true;
    });
  }
});
