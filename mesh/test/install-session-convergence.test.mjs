import assert from 'node:assert/strict';
import { generateKeyPairSync, sign } from 'node:crypto';
import test from 'node:test';

import * as sessions from '../src/lib/install-session.mjs';
import { buildHostInstallPlan } from '../src/lib/host-install-plan.mjs';
import { canonicalJson, digestObject, sha256, ValidationError } from '../src/lib/canonical.mjs';
import { verifyInstallReleaseArtifact, verifyInstallReleaseManifest } from '../src/lib/install-release-manifest.mjs';
import installTargets from '../config/install-targets.json' with { type: 'json' };
import hostPolicy from '../config/host-install-policy.json' with { type: 'json' };
import capabilities from '../config/capabilities.json' with { type: 'json' };
import applications from '../config/application-catalog.json' with { type: 'json' };
import network from '../config/service-network-policy.json' with { type: 'json' };
import setup from '../config/setup.json' with { type: 'json' };
import { MIGRATIONS } from '../src/grid/migrations.mjs';
import { assertHostileInputContract } from '../test-support/hostile-input-contract.mjs';

// Ported from #1913 (codex/installer-session-convergence-20260928) and adapted
// to main: the observation carries the derived candidate digest (T3) and must
// be live-local (T4); artifact bytes are checked only through the
// manifest-bound verifyInstallReleaseArtifact overload (#1914/#1923).
// Synthetic unit fixtures, including declared-live observations, not host scans.
// Test signing keys are generated in memory and never exported or persisted.
const REQUEST='2026-09-28T18:00:00.000Z';
const OBSERVED='2026-09-28T18:00:30.000Z';
const NOW='2026-09-28T18:01:00.000Z';
const ZERO='0'.repeat(64);
const REV='1'.repeat(40);
function fixture({profile='personal-local',factsSource='live-local-observation',facts={}}={}){
  const {privateKey,publicKey}=generateKeyPairSync('ed25519');
  const hostPlan=buildHostInstallPlan({profileId:profile,hostFacts:{
    facts_source:factsSource,platform:'linux',architecture:'x64',distro_id:'ubuntu',
    distro_version:'24.04',init_system:'systemd',package_manager:'apt-get',
    node_version:null,memory_bytes:8_000_000_000,root_filesystem_free_bytes:32_000_000_000,
    container_runtime:'docker',effective_uid:1000,...facts
  }});
  const artifactBytes={};
  const artifacts=['oci-image','documentation-bundle','sbom','provenance'].map((kind,index)=>{
    const artifact_id=`fixture.artifact.${index}`;
    const bytes=Buffer.from(`synthetic-${kind}-contents`);
    artifactBytes[artifact_id]=bytes;
    return {artifact_id,kind,platform:'any',architecture:'any',media_type:'application/octet-stream',
      locator:`fixture://${artifact_id}`,sha256:sha256(bytes),byte_length:bytes.length,
      required_for_profiles:[profile]};
  });
  const manifest={
    schema:'axiom-install-release-manifest.v1',version:1,release_id:'fixture.release.1',
    kernel_version:hostPolicy.kernel_version,channel:'development',production_promoted:false,
    source_revision:REV,issued_at:REQUEST,valid_until:'2026-09-29T18:00:00.000Z',
    signing_key_id:'fixture.signer',install_profiles:[{id:profile,target_status:'specified'}],
    toolchain:{node_engine:setup.runtime.engine,node_ci_version:setup.runtime.ci_version,
      node_hosted_production_version:setup.runtime.hosted_production_version,
      node_container_version:setup.runtime.production_version,
      npm_minimum_version:setup.package_manager.minimum_version,
      npm_major_exclusive:setup.package_manager.maximum_major_exclusive,
      npm_compatibility_minimum_version:setup.package_manager.compatibility_minimum_version,
      npm_compatibility_major_exclusive:setup.package_manager.compatibility_maximum_major_exclusive},
    data_compatibility:{migration_generation:MIGRATIONS.length,rollback_mode:'in-place-compatible',minimum_compatible_kernel:'0.11.0'},
    control_plane:{install_targets_sha256:digestObject(installTargets),host_install_policy_sha256:digestObject(hostPolicy),
      capability_registry_sha256:digestObject(capabilities),application_catalog_sha256:digestObject(applications),
      service_network_policy_sha256:digestObject(network),source_setup_policy_sha256:digestObject(setup)},
    artifacts,non_claims:['signature-does-not-grant-install-authority','artifact-presence-does-not-prove-runtime-safety',
      'axiom-host-image-does-not-prove-secure-or-measured-boot','manifest-does-not-enroll-node-or-start-services',
      'manifest-does-not-prove-artifact-bytes','manifest-does-not-prove-node-readiness'],
    installation_grants_authority:false,host_mutation_authorized:false,authority_effect:'none',network_effect:'none'
  };
  const input={sessionId:'fixture.session.1',hostPlan,releasePackage:null,expectedReleaseManifestDigest:null,
    trustedSigners:[{key_id:'fixture.signer',public_key:publicKey.export({type:'spki',format:'pem'}),
      roles:['release-installer-authority'],status:'active'}],artifactBytes,
    observedInstall:{schema:sessions.INSTALLED_STATE_OBSERVATION_SCHEMA,version:0,status:'inert-installed-state-observation',
      observation_id:'fixture.observation.1',session_id:'fixture.session.1',candidate_digest:ZERO,observed_at:OBSERVED,
      observation_source:'live-local-observation',legacy_proof_state_detected:false,installed_kernel_version:null,
      install_record_state:'absent',installed_profile_id:null,installed_release_id:null,installed_source_revision:null,
      installed_host_plan_digest:null,installed_release_manifest_digest:null,release_relation_to_desired:'absent',
      relation_evidence_ref:null,secret_state:'absent',data_state:'absent',service_state:'absent',readiness_state:'not-checked',
      evidence_refs:['fixture.local-observation'],observation_digest:ZERO,authority_effect:'none',mutation_effect:'none',runtime_activation:false},
    requestedAt:REQUEST,evaluatedAt:NOW,maxObservationAgeSeconds:300};
  function resign(){
    // The operator's independently pinned digest of the release it expects.
    input.expectedReleaseManifestDigest=digestObject(manifest);
    input.releasePackage={schema:'axiom-install-release-manifest-package.v1',manifest,
      signature:{algorithm:'Ed25519',key_id:manifest.signing_key_id,digest:digestObject(manifest),
        signature:sign(null,Buffer.from(canonicalJson(manifest)),privateKey).toString('base64url')}};
  }
  resign();
  return {input,manifest,resign};
}
// The observer embeds the digest of the candidate derived from the same
// original evidence. If derivation itself rejects, the observation stays
// unbound and createInstallSession must reject on its own.
function bind(input){
  const {observedInstall:_observation,...evidence}=input;
  try{
    input.observedInstall.candidate_digest=sessions.deriveInstallSessionCandidate(evidence).candidate_digest;
  }catch(error){
    if(!(error instanceof ValidationError)) throw error;
  }
}
function seal(state){
  state.observation_digest=digestObject({...state,observation_digest:ZERO});
}
function run(input,{rebind=true}={}){
  assert.equal(typeof sessions.createInstallSession,'function','original-package constructor must exist');
  if(rebind) bind(input);
  seal(input.observedInstall);
  return sessions.createInstallSession(input);
}
function denied(input,pattern,options){
  assert.equal(typeof sessions.createInstallSession,'function','constructor required for negative test');
  assert.throws(()=>run(input,options),error=>error instanceof ValidationError && (!pattern||pattern.test(error.message)));
}
function installed(f,overrides={}){
  const {input,manifest}=f;
  Object.assign(input.observedInstall,{install_record_state:'complete',installed_profile_id:input.hostPlan.profile_id,
    installed_release_id:manifest.release_id,installed_kernel_version:manifest.kernel_version,
    installed_source_revision:manifest.source_revision,installed_host_plan_digest:input.hostPlan.plan_digest,
    installed_release_manifest_digest:digestObject(manifest),release_relation_to_desired:'same',
    secret_state:'complete',data_state:'present',service_state:'running',readiness_state:'ready',...overrides});
}
function older(f,version='0.11.0'){
  installed(f,{installed_release_id:'fixture.old',installed_kernel_version:version,installed_source_revision:'2'.repeat(40),
    installed_host_plan_digest:'a'.repeat(64),installed_release_manifest_digest:'b'.repeat(64),
    release_relation_to_desired:'ancestor',relation_evidence_ref:'fixture.lineage'});
}

test('constructor verifies original signed package and every profile artifact, with no effects',()=>{
  for(const profile of ['personal-local','infrastructure-node']){
    const f=fixture({profile});
    const s=run(f.input);
    assert.equal(s.schema,'axiom-install-session.v0');
    assert.equal(s.decision.decision,'INSTALL_REVIEW');
    assert.equal(s.artifact_proofs.length,4);
    assert.equal(s.candidate.release_manifest_digest,digestObject(f.manifest));
    assert.equal(s.candidate.profile_id,profile);
    assert.equal(s.session_digest,digestObject({...s,session_digest:ZERO}));
    for(const name of ['host_mutation_authorized','runtime_activation'])assert.equal(s[name],false);
    for(const name of ['authority_effect','network_effect','credential_effect','service_start_effect'])assert.equal(s[name],'none');
    assert.ok(Object.isFrozen(s)&&Object.isFrozen(s.candidate)&&Object.isFrozen(s.decision));
    assert.doesNotMatch(JSON.stringify(s),/PUBLIC KEY|synthetic-oci-image-contents/);
  }
});

test('reports and self-digests cannot replace original package and byte inputs',()=>{
  const f=fixture();
  const report=verifyInstallReleaseManifest(f.input.releasePackage,{trustedSigners:f.input.trustedSigners,evaluatedAt:NOW});
  const forgedInput={...f.input,releaseVerification:report,artifactProofs:[]};
  denied(forgedInput,/fields|inventory/i);
  const missing={...f.input};delete missing.releasePackage;
  denied(missing,/fields|inventory/i);
  denied({...f.input,verifierOptions:{trustedSigners:f.input.trustedSigners}},/fields|inventory/i);
});

test('untrusted, revoked, retired, wrong-role and wrong-key signers reject',()=>{
  for(const change of [
    f=>{f.input.trustedSigners=[];},
    f=>{f.input.trustedSigners[0].status='revoked';},
    f=>{f.input.trustedSigners[0].status='retired';},
    f=>{f.input.trustedSigners[0].roles=['observer'];},
    f=>{f.input.trustedSigners[0].key_id='fixture.other';},
    f=>{f.input.trustedSigners[0].public_key=generateKeyPairSync('ed25519').publicKey.export({type:'spki',format:'pem'});}
  ]){const f=fixture();change(f);denied(f.input);}
});

test('signed content changes, stale control plane and invalid validity windows reject',()=>{
  for(const change of [
    f=>{f.manifest.release_id='fixture.changed';},
    f=>{f.manifest.control_plane.capability_registry_sha256=ZERO;f.resign();},
    f=>{f.manifest.valid_until=NOW;f.resign();},
    f=>{f.manifest.issued_at='2026-09-28T19:00:00.000Z';f.resign();}
  ]){const f=fixture();change(f);denied(f.input);}
});

test('missing required artifact, extra artifact, swapped or modified bytes reject',()=>{
  for(const change of [
    f=>{delete f.input.artifactBytes['fixture.artifact.3'];},
    f=>{f.input.artifactBytes['fixture.unknown']=Buffer.from('not-bound');},
    f=>{f.input.artifactBytes['fixture.artifact.0']=f.input.artifactBytes['fixture.artifact.1'];},
    f=>{f.input.artifactBytes['fixture.artifact.0'][0]^=1;},
    f=>{f.input.artifactBytes['fixture.artifact.0']=Buffer.from('truncated');}
  ]){const f=fixture();change(f);denied(f.input);}
});

test('membership and completeness come from the verified manifest, not caller lists',()=>{
  const f=fixture();
  const bytes=Buffer.from('second mandatory image');
  f.manifest.artifacts.push({...f.manifest.artifacts[0],artifact_id:'fixture.required.extra',sha256:sha256(bytes),byte_length:bytes.length});
  f.resign();denied(f.input,/artifact/i);
  f.input.artifactBytes['fixture.required.extra']=bytes;
  assert.equal(run(f.input).artifact_proofs.length,5);
});

test('standard inventory excludes Birth Genesis and Spark identities and locators',()=>{
  for(const token of ['birth','Genesis','Spark']){
    for(const field of ['artifact_id','locator']){
      const f=fixture();const artifact=f.manifest.artifacts[0];
      if(field==='artifact_id'){
        const old=artifact.artifact_id;artifact.artifact_id=`fixture.${token}.item`;
        f.input.artifactBytes[artifact.artifact_id]=f.input.artifactBytes[old];delete f.input.artifactBytes[old];
      }else artifact.locator=`fixture://${token}/item`;
      f.resign();denied(f.input,/birth|genesis|spark/i);
    }
  }
});

test('supplied and synthetic host plans or observations never produce live review',()=>{
  for(const source of ['supplied-evidence','synthetic-test']){
    assert.equal(run(fixture({factsSource:source}).input).decision.decision,'STOP_NONLIVE_PLAN');
    // T4 (adapted): a non-live observation is rejected, not classified.
    const f=fixture();f.input.observedInstall.observation_source=source;
    denied(f.input,/live-local-observation/);
  }
});

test('host blockers and legacy proof markers stop rather than silently becoming current identity',()=>{
  assert.equal(run(fixture({facts:{distro_id:'unsupported'}}).input).decision.decision,'STOP_HOST_BLOCKED');
  const f=fixture();f.input.observedInstall.legacy_proof_state_detected=true;
  assert.equal(run(f.input).decision.decision,'STOP_LEGACY_PROOF_STATE');
});

test('exact readiness, repair, retained state and partial-secret distinctions survive convergence',()=>{
  const f=fixture();installed(f);
  assert.equal(run(f.input).decision.decision,'VERIFY_NOOP');
  f.input.observedInstall.service_state='stopped';f.input.observedInstall.readiness_state='not-ready';
  assert.equal(run(f.input).decision.decision,'REPAIR_REVIEW');
  f.input.observedInstall.install_record_state='partial';f.input.observedInstall.secret_state='partial';
  assert.equal(run(f.input).decision.decision,'STOP_PARTIAL_SECRET_STATE');
  const retained=fixture();retained.input.observedInstall.data_state='present';
  assert.equal(run(retained.input).decision.decision,'RECOVERY_REVIEW');
});

test('upgrade requires healthy older state, minimum version and bounded rollback posture',()=>{
  const good=fixture();older(good);assert.equal(run(good.input).decision.decision,'UPGRADE_REVIEW');
  for(const change of [
    f=>{f.manifest.data_compatibility.minimum_compatible_kernel='0.11.1';f.resign();},
    f=>{f.manifest.data_compatibility.rollback_mode='migration-specific';f.resign();},
    f=>{f.input.observedInstall.readiness_state='not-ready';f.input.observedInstall.service_state='stopped';}
  ]){const f=fixture();older(f);change(f);assert.equal(run(f.input).decision.decision,'STOP_UPGRADE_UNPROVEN');}
});

test('declared ancestor cannot override newer or ambiguous installed version',()=>{
  const newer=fixture();older(newer,'99.0.0');
  assert.equal(run(newer.input).decision.decision,'STOP_NEWER_PRESENT');
  const ambiguous=fixture();older(ambiguous,'0.11.0-01');
  denied(ambiguous.input,/version/i);
});

test('future, stale and cross-session observations remain fail closed',()=>{
  for(const change of [
    f=>{f.input.observedInstall.observed_at='2026-09-28T19:00:00.000Z';},
    f=>{f.input.evaluatedAt='2026-09-28T18:10:00.000Z';},
    f=>{f.input.observedInstall.observed_at='2026-09-28T17:59:59.000Z';}
  ]){const f=fixture();change(f);assert.equal(run(f.input).decision.decision,'STOP_UNCERTAIN');}
  const cross=fixture();cross.input.observedInstall.session_id='fixture.other';
  assert.equal(run(cross.input).decision.decision,'STOP_CONFLICT');
});

test('constructor snapshots plain data without invoking getters or accepting shared byte storage',()=>{
  const f=fixture();let reads=0;
  Object.defineProperty(f.input.releasePackage.manifest,'release_id',{enumerable:true,get(){reads++;return 'fixture.release.1';}});
  denied(f.input,/data|accessor/i);assert.equal(reads,0);
  const p=fixture();p.input.releasePackage=new Proxy(p.input.releasePackage,{});denied(p.input,/Proxy/i);
  const shared=fixture();shared.input.artifactBytes['fixture.artifact.0']=new Uint8Array(new SharedArrayBuffer(28));
  denied(shared.input,/shared/i);
});

test('byte views use their actual bounded window and cannot change an already returned session',()=>{
  const f=fixture();const name='fixture.artifact.0';const bytes=f.input.artifactBytes[name];
  const backing=new Uint8Array(bytes.length+4);backing.set(bytes,2);
  f.input.artifactBytes[name]=new Uint8Array(backing.buffer,2,bytes.length);
  const s=run(f.input);const digest=s.session_digest;backing.fill(0);
  assert.equal(s.session_digest,digest);denied(f.input,/digest/i);
});

// ---------------------------------------------------------------------------
// T3/T4 and verified-evidence gates added in the re-scope.

test('T3: a missing, replayed or mismatched candidate digest is rejected with ValidationError',()=>{
  const missing=fixture();bind(missing.input);delete missing.input.observedInstall.candidate_digest;
  denied(missing.input,/fields are invalid/,{rebind:false});
  const zero=fixture();
  denied(zero.input,/not bound to this install session candidate/,{rebind:false});
  const mismatched=fixture();bind(mismatched.input);mismatched.input.observedInstall.candidate_digest='e'.repeat(64);
  denied(mismatched.input,/not bound to this install session candidate/,{rebind:false});
  for(const field of [null,'E'.repeat(64),7]){
    const bad=fixture();bind(bad.input);bad.input.observedInstall.candidate_digest=field;
    denied(bad.input,/candidate_digest/,{rebind:false});
  }
  // Replay: an observation bound to another request or session does not
  // transfer, even when its session_id and every other field match.
  const original=fixture();bind(original.input);
  const replayed=original.input.observedInstall.candidate_digest;
  for(const change of [
    input=>{input.requestedAt='2026-09-28T18:00:10.000Z';},
    input=>{input.maxObservationAgeSeconds=600;},
    input=>{input.sessionId='fixture.session.2';input.observedInstall.session_id='fixture.session.2';}
  ]){
    const f=fixture();change(f.input);f.input.observedInstall.candidate_digest=replayed;
    denied(f.input,/not bound to this install session candidate/,{rebind:false});
  }
  const fresh=fixture();bind(fresh.input);
  assert.equal(run(fresh.input,{rebind:false}).decision.candidate_digest,fresh.input.observedInstall.candidate_digest);
});

test('T4: only live-local-observation is accepted; remote, unknown or missing sources are rejected',()=>{
  for(const source of ['supplied-evidence','synthetic-test','remote-observation','live-remote-observation','Live-local-observation','',null,undefined]){
    const f=fixture();
    if(source===undefined) delete f.input.observedInstall.observation_source;
    else f.input.observedInstall.observation_source=source;
    denied(f.input,null);
  }
  const live=fixture();
  assert.equal(run(live.input).decision.decision,'INSTALL_REVIEW');
});

test('T3/T4 hold in the structural classifier too, not only in the constructor',()=>{
  const f=fixture();
  const derived=sessions.deriveInstallSessionCandidate((({observedInstall,...rest})=>rest)(f.input));
  const observation={...f.input.observedInstall,candidate_digest:derived.candidate_digest};
  seal(observation);
  assert.equal(sessions.assessInstallSession(derived.candidate,observation,{evaluatedAt:NOW}).decision,'INSTALL_REVIEW');
  const remote={...observation,observation_source:'supplied-evidence'};seal(remote);
  assert.throws(()=>sessions.assessInstallSession(derived.candidate,remote,{evaluatedAt:NOW}),ValidationError);
  const unbound={...observation,candidate_digest:'f'.repeat(64)};seal(unbound);
  assert.throws(()=>sessions.assessInstallSession(derived.candidate,unbound,{evaluatedAt:NOW}),/not bound/);
});

test('derived candidate binds the verified manifest digest, release, kernel and every bound artifact proof',()=>{
  const f=fixture();
  const {observedInstall:_o,...evidence}=f.input;
  const derived=sessions.deriveInstallSessionCandidate(evidence);
  assert.equal(derived.candidate.release_manifest_digest,sha256(canonicalJson(f.manifest)));
  assert.equal(derived.candidate.desired_release_id,f.manifest.release_id);
  assert.equal(derived.candidate.desired_kernel_version,f.manifest.kernel_version);
  assert.equal(derived.candidate.minimum_compatible_kernel,'0.11.0');
  assert.equal(derived.candidate.rollback_mode,'in-place-compatible');
  assert.equal(derived.candidate_digest,digestObject(derived.candidate));
  assert.deepEqual(derived.artifact_proofs.map(item=>item.artifact_id),
    f.manifest.artifacts.map(item=>item.artifact_id).sort());
  for(const proof of derived.artifact_proofs){
    const artifact=f.manifest.artifacts.find(item=>item.artifact_id===proof.artifact_id);
    assert.equal(proof.artifact_sha256,artifact.sha256);
    assert.equal(proof.byte_length,artifact.byte_length);
  }
  assert.equal(derived.host_mutation_authorized,false);
  assert.equal(derived.authority_effect,'none');
  assert.ok(Object.isFrozen(derived)&&Object.isFrozen(derived.candidate));
  // Mutating the caller's evidence after derivation changes nothing returned.
  f.manifest.artifacts[0].sha256='0'.repeat(64);
  f.input.artifactBytes['fixture.artifact.0'].fill(0);
  assert.equal(derived.artifact_proofs.find(item=>item.artifact_id==='fixture.artifact.0').artifact_sha256,
    sha256(Buffer.from('synthetic-oci-image-contents')));
});

test('a release from a different manifest or a session for another release does not converge',()=>{
  const first=fixture();const second=fixture();
  second.manifest.release_id='fixture.release.2';second.resign();
  // Bytes are bound to the package actually verified: release one's package
  // with release two's signer inventory is rejected.
  first.input.trustedSigners=second.input.trustedSigners;
  denied(first.input);
  // An observation bound to release two's candidate cannot classify release one.
  const one=fixture();const two=fixture();two.manifest.release_id='fixture.release.2';two.resign();
  two.input.trustedSigners=one.input.trustedSigners;
  bind(one.input);
  const {observedInstall:_o,...evidence}=two.input;
  assert.throws(()=>sessions.deriveInstallSessionCandidate(evidence),ValidationError,'different key');
});

test('verified session envelope validates integrity only and never claims origin or authority',()=>{
  const s=run(fixture().input);
  const v=sessions.validateVerifiedInstallSession(s);
  assert.equal(v.valid,true);
  assert.equal(v.origin_verified,false);
  assert.equal(v.session_digest,s.session_digest);
  assert.equal(v.host_mutation_authorized,false);
  assert.equal(s.decision.observation_bound,false);
  const copy=structuredClone(s);
  copy.decision={...copy.decision};
  for(const change of [
    x=>{x.host_mutation_authorized=true;},
    x=>{x.authority_effect='grant';},
    x=>{x.credential_effect='create';},
    x=>{x.artifact_proofs=[...x.artifact_proofs].reverse();},
    x=>{x.artifact_proofs=x.artifact_proofs.slice(1);},
    x=>{x.release_signer_key_id='bad key';},
    x=>{x.session_digest='0'.repeat(64);},
    x=>{x.extra=true;}
  ]){
    const y=structuredClone(s);change(y);
    assert.throws(()=>sessions.validateVerifiedInstallSession(y),ValidationError);
  }
  const otherFixture=fixture();
  otherFixture.input.sessionId='fixture.session.9';
  otherFixture.input.observedInstall.session_id='fixture.session.9';
  const other=run(otherFixture.input);
  assert.notEqual(other.decision.candidate_digest,s.decision.candidate_digest);
  const spliced=structuredClone(s);spliced.decision=structuredClone(other.decision);
  spliced.session_digest=digestObject({...spliced,session_digest:ZERO});
  assert.throws(()=>sessions.validateVerifiedInstallSession(spliced),/not for its candidate/);
});

test('constructor reads no caller code: getters, Proxies and accessors on any input fail with zero reads',()=>{
  let reads=0;
  const getter=(object,key)=>{const value=object[key];Object.defineProperty(object,key,{enumerable:true,get(){reads+=1;return value;}});};
  for(const plant of [
    f=>getter(f.input,'trustedSigners'),
    f=>getter(f.input.trustedSigners[0],'status'),
    f=>{f.input.hostPlan=structuredClone(f.input.hostPlan);getter(f.input.hostPlan,'profile_id');},
    f=>getter(f.input.observedInstall,'observation_source'),
    f=>getter(f.input.observedInstall,'candidate_digest'),
    f=>getter(f.input.artifactBytes,'fixture.artifact.0'),
    f=>getter(f.input.releasePackage.manifest.artifacts[0],'sha256')
  ]){
    const f=fixture();bind(f.input);plant(f);
    assert.throws(()=>sessions.createInstallSession(f.input),ValidationError);
  }
  assert.equal(reads,0);
  const f=fixture();
  const {observedInstall:_o,...evidence}=f.input;
  for(const value of [null,7,'x',[],new Proxy(evidence,{}),Object.create(evidence)]){
    assert.throws(()=>sessions.deriveInstallSessionCandidate(value),ValidationError);
    assert.throws(()=>sessions.createInstallSession(value),ValidationError);
  }
  assert.throws(()=>sessions.deriveInstallSessionCandidate({...evidence,observedInstall:f.input.observedInstall}),/fields are invalid/);
});

const contractValidArgs=()=>{
  const f=fixture();bind(f.input);seal(f.input.observedInstall);
  return [f.input];
};
const BYTE_INDEX=/^arg0\.artifactBytes\.[^.]+\./;
// Expando properties on a byte view are never read; only the byte window is copied.
const BYTE_EXPANDO={};
for(const id of ['fixture.artifact.0','fixture.artifact.1','fixture.artifact.2','fixture.artifact.3']){
  BYTE_EXPANDO[`arg0.artifactBytes.${id}`]=['hidden-mind-id','symbol-key','cycle'];
}

// Slots whose valid baseline value is already null: a 'null' variant there is
// the baseline itself, so accepting it is correct.
const NULL_BASELINE=[
  'arg0.hostPlan.runtime.node_runtime_observed',
  ...['installed_kernel_version','installed_profile_id','installed_release_id',
    'installed_source_revision','installed_host_plan_digest',
    'installed_release_manifest_digest','relation_evidence_ref']
    .map(field=>`arg0.observedInstall.${field}`)
];

test('hostile-input contract: createInstallSession',async()=>{
  await assertHostileInputContract({
    name:'createInstallSession',
    fn:sessions.createInstallSession,
    validArgs:contractValidArgs,
    skipPaths:[BYTE_INDEX],
    acceptablePaths:BYTE_EXPANDO,
    nullablePaths:NULL_BASELINE,
    maxPaths:400
  },assert);
});

test('hostile-input contract: deriveInstallSessionCandidate',async()=>{
  await assertHostileInputContract({
    name:'deriveInstallSessionCandidate',
    fn:sessions.deriveInstallSessionCandidate,
    validArgs:()=>{const [input]=contractValidArgs();delete input.observedInstall;return [input];},
    skipPaths:[BYTE_INDEX],
    acceptablePaths:BYTE_EXPANDO,
    nullablePaths:NULL_BASELINE,
    maxPaths:400
  },assert);
});

test('hostile-input contract: validateVerifiedInstallSession',async()=>{
  const session=run(fixture().input);
  await assertHostileInputContract({
    name:'validateVerifiedInstallSession',
    fn:sessions.validateVerifiedInstallSession,
    validArgs:()=>[structuredClone(session)]
  },assert);
});

// ---------------------------------------------------------------------------
// R1 (Verifier, post-merge #1923): caller-supplied trustedSigners do not bind
// the trust root, so the gate pins the manifest digest and verifies itself.

test('R1: an attacker key registered under the real key_id is rejected by the gate',()=>{
  const f=fixture();
  const genuineDigest=f.input.expectedReleaseManifestDigest;
  const attacker=generateKeyPairSync('ed25519');
  const evil=Buffer.from('attacker image');
  const manifest={...f.manifest,artifacts:f.manifest.artifacts.map((item,index)=>index===0
    ?{...item,sha256:sha256(evil),byte_length:evil.length}:item)};
  f.input.releasePackage={schema:'axiom-install-release-manifest-package.v1',manifest,
    signature:{algorithm:'Ed25519',key_id:'fixture.signer',digest:digestObject(manifest),
      signature:sign(null,Buffer.from(canonicalJson(manifest)),attacker.privateKey).toString('base64url')}};
  f.input.trustedSigners=[{key_id:'fixture.signer',public_key:attacker.publicKey.export({type:'spki',format:'pem'}),
    roles:['release-installer-authority'],status:'active'}];
  f.input.artifactBytes['fixture.artifact.0']=evil;
  // The attacker package really does verify against the attacker inventory and
  // yields manifest_bound:true with the genuine release_id and signer_key_id.
  const elsewhere=verifyInstallReleaseManifest(f.input.releasePackage,{trustedSigners:f.input.trustedSigners,evaluatedAt:NOW});
  assert.equal(elsewhere.release_id,f.manifest.release_id);
  assert.equal(elsewhere.signer_key_id,'fixture.signer');
  assert.equal(verifyInstallReleaseArtifact(elsewhere,'fixture.artifact.0',evil).manifest_bound,true);
  // The gate still rejects it: the digest is not the independently pinned one.
  assert.equal(f.input.expectedReleaseManifestDigest,genuineDigest);
  denied(f.input,/independently trusted expected digest/);
  const {observedInstall:_o,...evidence}=f.input;
  assert.throws(()=>sessions.deriveInstallSessionCandidate(evidence),/independently trusted expected digest/);
});

test('R1: a genuine verified result produced elsewhere is never accepted as the gate evidence',()=>{
  const f=fixture();
  const elsewhere=verifyInstallReleaseManifest(f.input.releasePackage,{trustedSigners:f.input.trustedSigners,evaluatedAt:NOW});
  const proof=verifyInstallReleaseArtifact(elsewhere,'fixture.artifact.0',f.input.artifactBytes['fixture.artifact.0']);
  for(const extra of [
    {releaseVerification:elsewhere},
    {verifiedResult:elsewhere},
    {artifactProofs:[proof]},
    {verifiedRelease:elsewhere}
  ]){
    denied({...f.input,...extra},/fields are invalid/);
  }
  // In place of the original package, a genuine result is not a package.
  denied({...f.input,releasePackage:elsewhere});
  // A bound proof in place of bytes is not bytes.
  denied({...f.input,artifactBytes:{...f.input.artifactBytes,'fixture.artifact.0':proof}},/Buffer or Uint8Array/);
});

test('R1: a missing, malformed or mismatched expected manifest digest is rejected',()=>{
  const other=fixture();other.manifest.release_id='fixture.release.2';other.resign();
  for(const [name,value] of [
    ['other release digest',other.input.expectedReleaseManifestDigest],
    ['random digest','e'.repeat(64)],
    ['package signature digest of another manifest',sha256('x')],
    ['uppercase',fixture().input.expectedReleaseManifestDigest.toUpperCase()],
    ['null',null],
    ['number',7]
  ]){
    const f=fixture();f.input.expectedReleaseManifestDigest=value;
    denied(f.input,/expected|expectedReleaseManifestDigest/,undefined);
    assert.ok(name);
  }
  const missing=fixture();delete missing.input.expectedReleaseManifestDigest;
  denied(missing.input,/fields are invalid/);
  // The genuine package with its pinned digest converges.
  assert.equal(run(fixture().input).decision.decision,'INSTALL_REVIEW');
});

// ---------------------------------------------------------------------------
// Mutation-driven guards: each case below isolates one guard so that removing
// it changes the observable outcome.
test('ancestor upgrade needs a strictly older kernel and an established minimum order',()=>{
  const desired=hostPolicy.kernel_version;
  const equal=fixture();older(equal,desired);
  assert.equal(run(equal.input).decision.decision,'STOP_UPGRADE_UNPROVEN');
  // Pre-release minimum versus release with the same core has no established
  // order here, so the minimum is not proven even though 0.11.0 is older.
  const preMinimum=fixture();
  preMinimum.manifest.data_compatibility.minimum_compatible_kernel='0.11.0-rc.1';preMinimum.resign();
  older(preMinimum,'0.11.0');
  assert.equal(run(preMinimum.input).decision.decision,'STOP_UPGRADE_UNPROVEN');
});

test('a same-release record with a different installed kernel is a conflict, not a no-op',()=>{
  const f=fixture();installed(f,{installed_kernel_version:'0.11.0'});
  const s=run(f.input);
  assert.equal(s.decision.decision,'STOP_CONFLICT');
  assert.ok(s.decision.reasons.includes('installed-kernel-version-mismatch'));
});

test('installed kernel presence follows the install record state',()=>{
  const complete=fixture();installed(complete,{installed_kernel_version:null});
  denied(complete.input);
  const absent=fixture();absent.input.observedInstall.installed_kernel_version='0.11.0';
  denied(absent.input);
});

test('structural classifier snapshots the observation before validating it',()=>{
  const f=fixture();const s=run(f.input);
  let reads=0;
  const observation={...f.input.observedInstall};
  Object.defineProperty(observation,'observation_source',{enumerable:true,get(){reads++;return 'live-local-observation';}});
  assert.throws(()=>sessions.assessInstallSession(s.candidate,observation,{evaluatedAt:NOW}),ValidationError);
  assert.equal(reads,0);
});

test('byte views are copied through intrinsic accessors, not spoofable own properties',()=>{
  const f=fixture();const name='fixture.artifact.0';
  const view=new Uint8Array(f.input.artifactBytes[name]);
  Object.defineProperty(view,'length',{value:1});
  f.input.artifactBytes[name]=view;
  assert.equal(run(f.input).artifact_proofs.length,4);
});

test('re-digested envelopes still reject activation, ordering and proof-candidate tampering',()=>{
  const s=run(fixture().input);
  for(const [change,pattern] of [
    [x=>{x.host_mutation_authorized=true;},/activation boundary/],
    [x=>{x.authority_effect='grant';},/activation boundary/],
    [x=>{x.network_effect='egress';},/activation boundary/],
    [x=>{x.runtime_activation=true;},/activation boundary/],
    [x=>{x.artifact_proofs=[...x.artifact_proofs].reverse();},/strictly sorted/],
    [x=>{x.artifact_proofs[0].artifact_sha256='c'.repeat(64);},/do not match its candidate/],
    [x=>{x.artifact_proofs=x.artifact_proofs.slice(1);},/do not match its candidate/]
  ]){
    const y=structuredClone(s);change(y);
    y.session_digest=digestObject({...y,session_digest:ZERO});
    assert.throws(()=>sessions.validateVerifiedInstallSession(y),error=>error instanceof ValidationError&&pattern.test(error.message));
  }
});

test('kernel version validation rejects backtracking-shaped and non-canonical pre-releases',()=>{
  for(const version of ['0.0.0-0.'+'--.'.repeat(38)+'!','0.11.0-a..b','0.11.0-01','0.11.0-','0.11.0+build']){
    const f=fixture();older(f,version);denied(f.input,/version/i);
  }
  const ok=fixture();older(ok,'0.11.0-x.7.z.92');
  assert.equal(run(ok.input).decision.decision,'STOP_UPGRADE_UNPROVEN');
});

test('kernel core components beyond the safe-integer range are rejected, not collapsed',()=>{
  const installed=fixture();older(installed,'9007199254740992.0.0');denied(installed.input,/version/i);
  const minimum=fixture();
  minimum.manifest.data_compatibility.minimum_compatible_kernel='9007199254740993.0.0';minimum.resign();
  older(minimum,'0.11.0');
  denied(minimum.input);
  const safe=fixture();older(safe,'0.11.0');assert.equal(run(safe.input).decision.decision,'UPGRADE_REVIEW');
});

test('byte windows come from intrinsic TypedArray getters, never from own or inherited lying accessors',()=>{
  const name='fixture.artifact.0';
  const windowed=f=>{
    const bytes=f.input.artifactBytes[name];
    const backing=new Uint8Array(bytes.length+8);backing.fill(0x41);backing.set(bytes,3);
    return {bytes,backing};
  };
  let reads=0;
  const lie={
    buffer:{enumerable:false,configurable:true,get(){reads++;return new ArrayBuffer(64);}},
    byteOffset:{enumerable:false,configurable:true,get(){reads++;return 0;}},
    byteLength:{enumerable:false,configurable:true,get(){reads++;return 4;}},
    length:{enumerable:false,configurable:true,get(){reads++;return 4;}}
  };
  // Own-property accessors on the view.
  const own=fixture();
  {
    const {bytes,backing}=windowed(own);
    const view=new Uint8Array(backing.buffer,3,bytes.length);
    Object.defineProperties(view,lie);
    own.input.artifactBytes[name]=view;
  }
  const ownSession=run(own.input);
  assert.equal(ownSession.artifact_proofs.find(proof=>proof.artifact_id===name).artifact_sha256,sha256(Buffer.from('synthetic-oci-image-contents')));
  assert.equal(reads,0);
  // Inherited accessors from a Uint8Array subclass prototype.
  class LyingView extends Uint8Array{}
  Object.defineProperties(LyingView.prototype,lie);
  const inherited=fixture();
  {
    const {bytes,backing}=windowed(inherited);
    inherited.input.artifactBytes[name]=new LyingView(backing.buffer,3,bytes.length);
  }
  const inheritedSession=run(inherited.input);
  assert.equal(inheritedSession.artifact_proofs.find(proof=>proof.artifact_id===name).byte_length,'synthetic-oci-image-contents'.length);
  assert.equal(reads,0);
});
