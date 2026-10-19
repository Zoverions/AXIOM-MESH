import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  INSTALL_SESSION_CANDIDATE_SCHEMA,
  INSTALLED_STATE_OBSERVATION_SCHEMA,
  assessInstallSession,
  computeInstalledStateObservationDigest,
  installSessionCandidateDigest
} from '../src/lib/install-session.mjs';
import { ValidationError } from '../src/lib/canonical.mjs';

// Restricted dev.N kernel upgrade ordering (Option 3). The only same-core
// upgrades are X.Y.Z-dev.N -> X.Y.Z-dev.M (M > N) and X.Y.Z-dev.N -> X.Y.Z,
// with N and M canonical decimals in [0, Number.MAX_SAFE_INTEGER].
const A='a'.repeat(64),B='b'.repeat(64),C='c'.repeat(64),D='d'.repeat(64),REV='1'.repeat(40);
const MAX=String(Number.MAX_SAFE_INTEGER);
const MAX_MINUS_1=String(Number.MAX_SAFE_INTEGER-1);
const OVER=(BigInt(Number.MAX_SAFE_INTEGER)+1n).toString();

function candidate(desired,minimum='0.0.0'){
  return {
    schema:INSTALL_SESSION_CANDIDATE_SCHEMA,version:0,status:'inert-install-session-candidate',
    session_id:'install.session.dev.1',profile_id:'personal-local',runtime_strategy:'oci',
    desired_release_id:'axiom-mesh/desired/test',desired_source_revision:REV,
    desired_kernel_version:desired,minimum_compatible_kernel:minimum,rollback_mode:'in-place-compatible',
    host_candidate_compatible:true,host_plan_digest:A,host_plan_facts_source:'live-local-observation',
    release_manifest_digest:B,artifact_sha256s:[C,D],artifact_evidence_refs:['artifact.verify.c','artifact.verify.d'],
    requested_at:'2026-09-28T01:00:00.000Z',max_observation_age_seconds:300,
    host_mutation_authorized:false,authority_effect:'none',network_effect:'none',runtime_activation:false
  };
}
function observation(c,installed,{record='complete',relation='ancestor'}={}){
  const same=relation==='same';
  const d={
    schema:INSTALLED_STATE_OBSERVATION_SCHEMA,version:0,status:'inert-installed-state-observation',
    observation_id:'install.observation.dev.1',session_id:'install.session.dev.1',
    candidate_digest:installSessionCandidateDigest(c),observed_at:'2026-09-28T01:00:30.000Z',
    observation_source:'live-local-observation',legacy_proof_state_detected:false,
    installed_kernel_version:installed,install_record_state:record,installed_profile_id:'personal-local',
    installed_release_id:same?'axiom-mesh/desired/test':'axiom-mesh/old/test',
    installed_source_revision:same?REV:'4'.repeat(40),installed_host_plan_digest:A,
    installed_release_manifest_digest:same?B:D,release_relation_to_desired:relation,
    relation_evidence_ref:same?null:`release-lineage.${relation}`,
    secret_state:'complete',data_state:'present',service_state:'running',readiness_state:'ready',
    evidence_refs:['install-state-scan.dev.1'],observation_digest:'0'.repeat(64),
    authority_effect:'none',mutation_effect:'none',runtime_activation:false
  };
  d.observation_digest=computeInstalledStateObservationDigest(d);
  return d;
}
function decide(installed,desired,minimum='0.0.0',shape={}){
  const c=candidate(desired,minimum);
  return assessInstallSession(c,observation(c,installed,shape),{evaluatedAt:'2026-09-28T01:01:00.000Z'});
}
const UP='UPGRADE_REVIEW',STOP='STOP_UPGRADE_UNPROVEN';
const v=label=>label===''?'1.2.3':`1.2.3-${label}`;

// [installed, desired, minimum, expected decision]
const TABLE=[
  // ALLOWED (newly opened): same core, dev.N -> dev.M with M > N, or dev.N -> bare.
  ['dev.0','dev.1','0.0.0',UP],
  ['dev.1','dev.2','0.0.0',UP],
  ['dev.2','dev.10','0.0.0',UP],                        // numeric, not lexical
  ['dev.9','dev.10','0.0.0',UP],
  ['dev.0',`dev.${MAX}`,'0.0.0',UP],                     // MAX_SAFE_INTEGER is in range
  [`dev.${MAX_MINUS_1}`,`dev.${MAX}`,'0.0.0',UP],
  ['dev.0','','0.0.0',UP],                               // dev.0 -> bare
  ['dev.7','','0.0.0',UP],
  [`dev.${MAX}`,'','0.0.0',UP],
  // ... with the signed minimum on the dev line of the same core, or a lower core.
  ['dev.3','dev.5','1.2.3-dev.3',UP],
  ['dev.3','dev.5','1.2.3-dev.0',UP],
  ['dev.3','','1.2.3-dev.3',UP],
  ['dev.3','dev.5','1.2.2',UP],
  ['dev.3','dev.5','1.2.2-rc.1',UP],
  // DENIED: dev.M -> dev.N with M >= N, bare -> dev, and the same dev.
  ['dev.1','dev.1','0.0.0',STOP],
  ['dev.2','dev.1','0.0.0',STOP],
  ['dev.10','dev.9','0.0.0',STOP],
  [`dev.${MAX}`,'dev.0','0.0.0',STOP],
  ['','dev.0','0.0.0',STOP],
  ['','dev.5','0.0.0',STOP],
  ['','','0.0.0',STOP],                                  // equal release (pre-existing)
  // DENIED: N beyond MAX_SAFE_INTEGER is off the line (never ordered, never collapsed).
  [`dev.${MAX}`,`dev.${OVER}`,'0.0.0',STOP],
  ['dev.0',`dev.${OVER}`,'0.0.0',STOP],
  [`dev.${OVER}`,'','0.0.0',STOP],
  [`dev.${OVER}`,`dev.${OVER}1`,'0.0.0',STOP],
  ['dev.0','dev.99999999999999999999','0.0.0',STOP],
  // DENIED: other labels, dev with extra identifiers, case or punctuation variants.
  ['rc.1','','0.0.0',STOP],
  ['rc.1','rc.2','0.0.0',STOP],
  ['alpha','beta','0.0.0',STOP],
  ['dev.1','rc.1','0.0.0',STOP],
  ['rc.1','dev.1','0.0.0',STOP],
  ['dev','dev.1','0.0.0',STOP],
  ['dev','','0.0.0',STOP],
  ['dev.1.1','dev.2','0.0.0',STOP],
  ['dev.1','dev.1.1','0.0.0',STOP],
  ['dev.1','dev.2.0','0.0.0',STOP],
  ['Dev.1','Dev.2','0.0.0',STOP],
  ['DEV.1','','0.0.0',STOP],
  ['dev.1-x','','0.0.0',STOP],
  ['dev-1','dev-2','0.0.0',STOP],
  ['dev.x','dev.y','0.0.0',STOP],
  ['dev.-1','dev.0','0.0.0',STOP],                     // '-1' is a valid alphanumeric identifier, not a number
  ['dev.0','dev.-1','0.0.0',STOP],
  ['dev.-1','','0.0.0',STOP],
  ['alpha.dev.1','alpha.dev.2','0.0.0',STOP],
  ['0.dev.1','0.dev.2','0.0.0',STOP],
  ['dev.0.dev.1','','0.0.0',STOP],
  ['devx.1','devx.2','0.0.0',STOP],
  ['xdev.1','xdev.2','0.0.0',STOP],
  // DENIED: the signed minimum is not met or not ordered.
  ['dev.3','dev.5','1.2.3-dev.4',STOP],
  ['dev.3','','1.2.3',STOP],                             // dev.3 is below the bare minimum
  ['dev.3','dev.5','1.2.3-rc.1',STOP],
  ['dev.3','dev.5',`1.2.3-dev.${OVER}`,STOP],
  ['dev.3','dev.5','1.2.4',STOP]
];

test('dev.N truth table: exactly the same-core dev.N -> dev.M (M > N) and dev.N -> bare upgrades are allowed', () => {
  for(const [installed,desired,minimum,expected] of TABLE){
    const d=decide(v(installed),v(desired),minimum);
    assert.equal(d.decision,expected,`${v(installed)} -> ${v(desired)} (minimum ${minimum})`);
    assert.equal(d.host_mutation_authorized,false);
    if(expected===UP) assert.deepEqual([...d.reasons],['installed-release-is-ancestor']);
    else assert.deepEqual([...d.reasons],['upgrade-compatibility-or-health-not-established']);
  }
});

test('dev.N truth table: malformed, non-canonical and build-metadata versions are rejected before any ordering', () => {
  for(const bad of ['dev.01','dev.00','dev.+1','dev.1+build','dev.','dev..1','dev.1.','dev. 1','dev.１']){
    for(const [installed,desired] of [[v(bad),'1.2.3'],['1.2.3-dev.0',v(bad)]]){
      assert.throws(()=>decide(installed,desired),ValidationError,`${installed} -> ${desired}`);
    }
    assert.throws(()=>decide('1.2.3-dev.0','1.2.3',v(bad)),ValidationError,`minimum ${v(bad)}`);
  }
  assert.throws(()=>decide('1.2.3+build','1.2.3'),ValidationError);
  assert.throws(()=>decide('1.2.3-dev.0','1.2.3+build'),ValidationError);
});

test('dev.N ordering is the same-core upgrade path only: other relations, records and cores are unchanged', () => {
  // Different cores keep the core order (pre-existing, byte-identical).
  assert.equal(decide('1.2.2-dev.5','1.2.3-dev.1').decision,UP);
  assert.equal(decide('1.2.2','1.2.3-dev.0').decision,UP);
  assert.equal(decide('0.11.0','0.12.0-dev.3','0.11.0').decision,UP);
  assert.equal(decide('1.2.4-dev.0','1.2.3').decision,'STOP_NEWER_PRESENT');
  assert.equal(decide('1.2.3-rc.1','1.2.4').decision,UP);
  // A same-core dev pair never counts as "newer present" or changes a non-ancestor outcome.
  for(const [installed,desired] of [['dev.5','dev.3'],['','dev.3'],['dev.3','dev.5'],['dev.3','']]){
    for(const [shape,expected] of [
      [{record:'complete',relation:'same'},'STOP_CONFLICT'],
      [{record:'complete',relation:'diverged'},'STOP_DIVERGED'],
      [{record:'partial',relation:'ancestor'},'RECOVERY_REVIEW'],
      [{record:'failed',relation:'same'},'RECOVERY_REVIEW']
    ]){
      assert.equal(decide(v(installed),v(desired),'0.0.0',shape).decision,expected,`${installed} -> ${desired} ${JSON.stringify(shape)}`);
    }
  }
  // A descendant claim stops as before, whatever the dev order.
  assert.equal(decide('1.2.3-dev.3','1.2.3-dev.5','0.0.0',{relation:'descendant'}).decision,'STOP_NEWER_PRESENT');
  // A dev minimum on the same core is ordered only for a dev upgrade of that core.
  assert.equal(decide('1.2.3','1.2.4','1.2.3-dev.0').decision,STOP);
  assert.equal(decide('1.2.3-dev.5','1.2.4','1.2.3-dev.0').decision,STOP);
});

test('the dev.N bound is the exact safe-integer pattern of the kernel_version schema core (#1925)', () => {
  const source=readFileSync(new URL('../src/lib/install-session.mjs',import.meta.url),'utf8');
  const literal=source.match(/const SAFE_INTEGER_SOURCE='([^']+)';/);
  assert.ok(literal,'SAFE_INTEGER_SOURCE literal');
  const pattern=literal[1].replaceAll('\\\\','\\');
  const schema=JSON.parse(readFileSync(new URL('../config/install-session-v0.schema.json',import.meta.url),'utf8'));
  const core=schema.$defs.kernel_version.pattern;
  assert.ok(core.startsWith(`^${pattern}\\.`),'same alternation as each schema core component');
  const exact=new RegExp(`^${pattern}$`);
  for(const ok of ['0','1','10',MAX,MAX_MINUS_1,'9007199254740989','8999999999999999','999999999999999']) assert.ok(exact.test(ok),ok);
  for(const bad of [OVER,'9007199254740993','9007199254741000','9999999999999999','10000000000000000','01','00','-1','+1','',' 1','1e3']) assert.equal(exact.test(bad),false,bad);
  // Linear: long hostile digit runs are rejected quickly.
  const started=process.hrtime.bigint();
  for(let i=0;i<200;i+=1) exact.test('9'.repeat(10_000)+'x');
  assert.ok(process.hrtime.bigint()-started<1_000_000_000n);
});
