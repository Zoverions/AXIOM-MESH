import assert from 'node:assert/strict';
import { generateKeyPairSync, sign } from 'node:crypto';
import test from 'node:test';

import * as sessions from '../src/lib/install-session.mjs';
import { buildHostInstallPlan } from '../src/lib/host-install-plan.mjs';
import { canonicalJson, digestObject, sha256, ValidationError } from '../src/lib/canonical.mjs';
import { verifyInstallReleaseManifest } from '../src/lib/install-release-manifest.mjs';
import installTargets from '../config/install-targets.json' with { type: 'json' };
import hostPolicy from '../config/host-install-policy.json' with { type: 'json' };
import capabilities from '../config/capabilities.json' with { type: 'json' };
import applications from '../config/application-catalog.json' with { type: 'json' };
import network from '../config/service-network-policy.json' with { type: 'json' };
import setup from '../config/setup.json' with { type: 'json' };
import { MIGRATIONS } from '../src/grid/migrations.mjs';

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
  const input={sessionId:'fixture.session.1',hostPlan,releasePackage:null,
    trustedSigners:[{key_id:'fixture.signer',public_key:publicKey.export({type:'spki',format:'pem'}),
      roles:['release-installer-authority'],status:'active'}],artifactBytes,
    observedInstall:{schema:sessions.INSTALLED_STATE_OBSERVATION_SCHEMA,version:0,status:'inert-installed-state-observation',
      observation_id:'fixture.observation.1',session_id:'fixture.session.1',observed_at:OBSERVED,
      observation_source:'live-local-observation',legacy_proof_state_detected:false,installed_kernel_version:null,
      install_record_state:'absent',installed_profile_id:null,installed_release_id:null,installed_source_revision:null,
      installed_host_plan_digest:null,installed_release_manifest_digest:null,release_relation_to_desired:'absent',
      relation_evidence_ref:null,secret_state:'absent',data_state:'absent',service_state:'absent',readiness_state:'not-checked',
      evidence_refs:['fixture.local-observation'],observation_digest:ZERO,authority_effect:'none',mutation_effect:'none',runtime_activation:false},
    requestedAt:REQUEST,evaluatedAt:NOW,maxObservationAgeSeconds:300};
  function resign(){
    input.releasePackage={schema:'axiom-install-release-manifest-package.v1',manifest,
      signature:{algorithm:'Ed25519',key_id:manifest.signing_key_id,digest:digestObject(manifest),
        signature:sign(null,Buffer.from(canonicalJson(manifest)),privateKey).toString('base64url')}};
  }
  resign();
  return {input,manifest,resign};
}
function run(input){
  assert.equal(typeof sessions.createInstallSession,'function','original-package constructor must exist');
  const state=input.observedInstall;
  state.observation_digest=digestObject({...state,observation_digest:ZERO});
  return sessions.createInstallSession(input);
}
function denied(input,pattern){
  assert.equal(typeof sessions.createInstallSession,'function','constructor required for negative test');
  assert.throws(()=>run(input),error=>error instanceof ValidationError && (!pattern||pattern.test(error.message)));
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
    const f=fixture();f.input.observedInstall.observation_source=source;
    assert.equal(run(f.input).decision.decision,'STOP_NONLIVE_OBSERVATION');
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
