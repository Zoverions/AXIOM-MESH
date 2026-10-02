import assert from 'node:assert/strict';
import {
  generateKeyPairSync,
  sign
} from 'node:crypto';
import test from 'node:test';
import { assertHostileInputContract } from '../test-support/hostile-input-contract.mjs';
import { readFile } from 'node:fs/promises';

import installTargets from '../config/install-targets.json' with { type: 'json' };
import hostInstallPolicy from '../config/host-install-policy.json' with { type: 'json' };
import capabilityRegistry from '../config/capabilities.json' with { type: 'json' };
import applicationCatalog from '../config/application-catalog.json' with { type: 'json' };
import serviceNetworkPolicy from '../config/service-network-policy.json' with { type: 'json' };
import sourceSetupPolicy from '../config/setup.json' with { type: 'json' };
import releasePolicy from '../config/install-release-manifest-policy.json' with { type: 'json' };
import { MIGRATIONS } from '../src/grid/migrations.mjs';
import {
  INSTALL_RELEASE_MANIFEST_PACKAGE_SCHEMA,
  INSTALL_RELEASE_MANIFEST_SCHEMA,
  validateInstallReleaseManifestPolicy,
  verifyInstallReleaseArtifact,
  verifyInstallReleaseManifest
} from '../src/lib/install-release-manifest.mjs';
import {
  canonicalJson,
  digestObject,
  sha256,
  ValidationError
} from '../src/lib/canonical.mjs';

const pair=generateKeyPairSync('ed25519');
const publicPem=pair.publicKey.export({type:'spki',format:'pem'});
const KEY_ID='release:test-key-1';
const EVALUATED_AT='2026-09-28T01:00:00.000Z';

const artifactBytes=Object.freeze({
  'runtime-personal':Buffer.from('oci image personal'),
  'runtime-infrastructure':Buffer.from('oci image infrastructure'),
  documentation:Buffer.from('documentation bundle'),
  sbom:Buffer.from('spdx sbom'),
  provenance:Buffer.from('release provenance')
});

function artifact(artifactId,kind,requiredForProfiles,overrides={}){
  const bytes=artifactBytes[artifactId]??Buffer.from(`artifact:${artifactId}`);
  const evidence=['documentation-bundle','sbom','provenance'].includes(kind);
  return {
    artifact_id:artifactId,
    kind,
    platform:evidence?'any':'linux',
    architecture:evidence?'any':'x64',
    media_type:kind==='oci-image'
      ?'application/vnd.oci.image.manifest.v1+json'
      :'application/octet-stream',
    locator:`release://0.12.0-dev.3/${artifactId}`,
    sha256:sha256(bytes),
    byte_length:bytes.length,
    required_for_profiles:requiredForProfiles,
    ...overrides
  };
}

function manifest(overrides={}){
  return {
    schema:INSTALL_RELEASE_MANIFEST_SCHEMA,
    version:1,
    release_id:'axiom-mesh/0.12.0-dev.3/test-release',
    kernel_version:'0.12.0-dev.3',
    channel:'development',
    production_promoted:false,
    source_revision:'a'.repeat(40),
    issued_at:'2026-09-28T00:30:00.000Z',
    valid_until:'2026-09-28T02:00:00.000Z',
    signing_key_id:KEY_ID,
    install_profiles:[
      {id:'personal-local',target_status:'specified'},
      {id:'infrastructure-node',target_status:'specified'}
    ],
    toolchain:{
      node_engine:sourceSetupPolicy.runtime.engine,
      node_ci_version:sourceSetupPolicy.runtime.ci_version,
      node_hosted_production_version:sourceSetupPolicy.runtime.hosted_production_version,
      node_container_version:sourceSetupPolicy.runtime.production_version,
      npm_minimum_version:sourceSetupPolicy.package_manager.minimum_version,
      npm_major_exclusive:sourceSetupPolicy.package_manager.maximum_major_exclusive,
      npm_compatibility_minimum_version:sourceSetupPolicy.package_manager.compatibility_minimum_version,
      npm_compatibility_major_exclusive:sourceSetupPolicy.package_manager.compatibility_maximum_major_exclusive
    },
    data_compatibility:{
      migration_generation:MIGRATIONS.length,
      rollback_mode:'migration-specific',
      minimum_compatible_kernel:'0.12.0-dev.3'
    },
    control_plane:{
      install_targets_sha256:digestObject(installTargets),
      host_install_policy_sha256:digestObject(hostInstallPolicy),
      capability_registry_sha256:digestObject(capabilityRegistry),
      application_catalog_sha256:digestObject(applicationCatalog),
      service_network_policy_sha256:digestObject(serviceNetworkPolicy),
      source_setup_policy_sha256:digestObject(sourceSetupPolicy)
    },
    artifacts:[
      artifact('runtime-personal','oci-image',['personal-local']),
      artifact('runtime-infrastructure','oci-image',['infrastructure-node']),
      artifact('documentation','documentation-bundle',['personal-local','infrastructure-node']),
      artifact('sbom','sbom',['personal-local','infrastructure-node']),
      artifact('provenance','provenance',['personal-local','infrastructure-node'])
    ],
    non_claims:[
      'signature-does-not-grant-install-authority',
      'artifact-presence-does-not-prove-runtime-safety',
      'axiom-host-image-does-not-prove-secure-or-measured-boot',
      'manifest-does-not-enroll-node-or-start-services',
      'manifest-does-not-prove-artifact-bytes',
      'manifest-does-not-prove-node-readiness'
    ],
    installation_grants_authority:false,
    host_mutation_authorized:false,
    authority_effect:'none',
    network_effect:'none',
    ...overrides
  };
}

function signPackage(value=manifest(),privateKey=pair.privateKey){
  const body=canonicalJson(value);
  return {
    schema:INSTALL_RELEASE_MANIFEST_PACKAGE_SCHEMA,
    manifest:value,
    signature:{
      algorithm:'Ed25519',
      key_id:value.signing_key_id,
      digest:sha256(body),
      signature:sign(null,Buffer.from(body),privateKey).toString('base64url')
    }
  };
}

function trustedSigner(overrides={}){
  return {
    key_id:KEY_ID,
    public_key:publicPem,
    roles:['release-installer-authority'],
    status:'active',
    ...overrides
  };
}

function verify(packageValue,options={}){
  return verifyInstallReleaseManifest(packageValue,{
    trustedSigners:[trustedSigner()],
    evaluatedAt:EVALUATED_AT,
    ...options
  });
}

test('policy retains external trust and zero authority',()=>{
  const result=validateInstallReleaseManifestPolicy();
  assert.equal(result.valid,true);
  assert.equal(result.signer_custody,'external');
  assert.equal(result.host_mutation_authorized,false);
  assert.equal(result.authority_effect,'none');
});

test('valid signed release input binds current control plane without authorizing install',()=>{
  const result=verify(signPackage());
  assert.equal(result.valid,true);
  assert.equal(result.signature_verified,true);
  assert.equal(result.control_plane_bound,true);
  assert.equal(result.install_profile_binding_complete,true);
  assert.equal(result.artifact_metadata_bound,true);
  assert.equal(result.artifact_bytes_verified,false);
  assert.equal(result.host_plan_required_separately,true);
  assert.equal(result.host_mutation_authorized,false);
  assert.equal(result.installation_authority_granted,false);
  assert.equal(result.mesh_authority_granted,false);
  assert.equal(result.network_authority_granted,false);
  assert.equal(result.node_enrolled,false);
  assert.equal(result.services_started,false);
});

test('artifact bytes require an exact local digest and length check',()=>{
  const value=manifest();
  const target=value.artifacts.find(item=>item.artifact_id==='runtime-personal');
  const ok=verifyInstallReleaseArtifact(target,artifactBytes['runtime-personal']);
  assert.equal(ok.artifact_bytes_verified,true);
  assert.equal(ok.host_mutation_authorized,false);
  assert.equal(ok.manifest_bound,false);
  assert.deepEqual(Object.keys(ok).sort(),[
    'artifact_bytes_verified','artifact_id','artifact_kind','authority_effect','byte_length',
    'host_mutation_authorized','manifest_bound','sha256','valid'
  ]);
  assert.throws(
    ()=>verifyInstallReleaseArtifact(target,Buffer.from('tampered')),
    /byte length mismatch|digest mismatch/
  );
});

test('signed package cannot supply or substitute its own trust root',()=>{
  const selfTrust={...signPackage(),public_key:publicPem};
  assert.throws(()=>verify(selfTrust),/key inventory drifted/);

  const other=generateKeyPairSync('ed25519');
  assert.throws(
    ()=>verify(signPackage(manifest(),other.privateKey)),
    /signature verification failed/
  );
});

test('unknown wrong-role retired and revoked release signers fail closed',()=>{
  assert.throws(
    ()=>verifyInstallReleaseManifest(signPackage(),{
      trustedSigners:[],
      evaluatedAt:EVALUATED_AT
    }),
    /Trusted release signers/
  );
  for(const signer of [
    trustedSigner({roles:['observer']}),
    trustedSigner({status:'retired'}),
    trustedSigner({status:'revoked'})
  ]){
    assert.throws(
      ()=>verifyInstallReleaseManifest(signPackage(),{
        trustedSigners:[signer],
        evaluatedAt:EVALUATED_AT
      }),
      /not actively trusted/
    );
  }
});

test('manifest mutation after signing is rejected',()=>{
  const packageValue=signPackage();
  packageValue.manifest.channel='stable';
  assert.throws(
    ()=>verify(packageValue),
    /signature metadata is invalid|signature verification failed/
  );
});

test('current control-plane digests are exact and stale substitution fails',()=>{
  const fields=[
    'install_targets_sha256',
    'host_install_policy_sha256',
    'capability_registry_sha256',
    'application_catalog_sha256',
    'service_network_policy_sha256',
    'source_setup_policy_sha256'
  ];
  for(const field of fields){
    const base=manifest();
    const value={
      ...base,
      control_plane:{
        ...base.control_plane,
        [field]:'b'.repeat(64)
      }
    };
    assert.throws(()=>verify(signPackage(value)),/control-plane binding is stale/);
  }
});

test('signer cannot promote install profile or turn channel name into production promotion',()=>{
  const promotedProfile=manifest({
    install_profiles:[
      {id:'personal-local',target_status:'implemented'},
      {id:'infrastructure-node',target_status:'specified'}
    ]
  });
  assert.throws(()=>verify(signPackage(promotedProfile)),/profile binding is invalid or stale/);

  const stableButUnpromoted=manifest({channel:'stable',production_promoted:false});
  const verified=verify(signPackage(stableButUnpromoted));
  assert.equal(verified.production_promoted,false);
  assert.equal(verified.production_promotion_established,false);

  const promotionLaundering=manifest({production_promoted:true});
  assert.throws(
    ()=>verify(signPackage(promotionLaundering)),
    /identity or authority boundary is invalid/
  );
});

test('signed authority host mutation and network laundering are rejected',()=>{
  for(const override of [
    {installation_grants_authority:true},
    {host_mutation_authorized:true},
    {authority_effect:'install'},
    {network_effect:'enroll-node'}
  ]){
    assert.throws(
      ()=>verify(signPackage(manifest(override))),
      /identity or authority boundary is invalid/
    );
  }
});

test('future expired and overlong release statements fail closed',()=>{
  assert.throws(
    ()=>verify(signPackage(manifest({issued_at:'2026-09-28T01:30:00.000Z'}))),
    /future-issued/
  );
  assert.throws(
    ()=>verify(signPackage(manifest({valid_until:'2026-09-28T00:59:59.000Z'}))),
    /expired/
  );
  assert.throws(
    ()=>verify(signPackage(manifest({
      issued_at:'2026-09-01T00:00:00.000Z',
      valid_until:'2026-10-15T00:00:00.000Z'
    }))),
    /validity exceeds policy/
  );
});

test('every release carries documentation SBOM provenance and an installable artifact per profile',()=>{
  for(const kind of ['documentation-bundle','sbom','provenance']){
    const value=manifest();
    value.artifacts=value.artifacts.filter(item=>item.kind!==kind);
    assert.throws(()=>verify(signPackage(value)),new RegExp(`missing required ${kind}`));
  }

  const noInfrastructure=manifest();
  noInfrastructure.artifacts=noInfrastructure.artifacts.filter(
    item=>item.artifact_id!=='runtime-infrastructure'
  );
  assert.throws(
    ()=>verify(signPackage(noInfrastructure)),
    /lacks an installable artifact: infrastructure-node/
  );
});

test('toolchain and migration inputs bind current source truth',()=>{
  const wrongContainer=manifest();
  wrongContainer.toolchain={
    ...wrongContainer.toolchain,
    node_container_version:'24.18.0'
  };
  assert.throws(()=>verify(signPackage(wrongContainer)),/toolchain binding is stale/);

  const wrongHosted=manifest();
  wrongHosted.toolchain={
    ...wrongHosted.toolchain,
    node_hosted_production_version:'24.21.0'
  };
  assert.throws(()=>verify(signPackage(wrongHosted)),/toolchain binding is stale/);

  const wrongCompatibility=manifest();
  wrongCompatibility.toolchain={
    ...wrongCompatibility.toolchain,
    npm_compatibility_minimum_version:'11.0.0'
  };
  assert.throws(()=>verify(signPackage(wrongCompatibility)),/toolchain binding is stale/);

  const wrongMigration=manifest();
  wrongMigration.data_compatibility={
    ...wrongMigration.data_compatibility,
    migration_generation:MIGRATIONS.length+1
  };
  assert.throws(()=>verify(signPackage(wrongMigration)),/data compatibility binding is invalid/);
});

test('AXIOM Host naming cannot launder Secure Boot or measured-boot evidence',()=>{
  const value=manifest();
  value.artifacts[0]=artifact(
    'runtime-personal',
    'axiom-host-image',
    ['personal-local']
  );
  value.non_claims=value.non_claims.map(
    claim=>claim==='axiom-host-image-does-not-prove-secure-or-measured-boot'?'unrelated-non-claim':claim
  );
  assert.throws(()=>verify(signPackage(value)),/missing non-claim/);
});

test('unsupported artifact metadata duplicate identity and unbound profiles fail closed',()=>{
  const windows=manifest();
  windows.artifacts[0]={...windows.artifacts[0],platform:'windows'};
  assert.throws(()=>verify(signPackage(windows)),/artifact metadata is invalid/);

  const duplicate=manifest();
  duplicate.artifacts[1]={...duplicate.artifacts[1],artifact_id:duplicate.artifacts[0].artifact_id};
  assert.throws(()=>verify(signPackage(duplicate)),/artifact id is duplicated/);

  const unbound=manifest({install_profiles:[{id:'personal-local',target_status:'specified'}]});
  unbound.artifacts=unbound.artifacts.filter(item=>item.artifact_id!=='runtime-infrastructure');
  assert.throws(()=>verify(signPackage(unbound)),/unbound install profile/);
});

test('non-Ed25519 signer keys are rejected even when externally supplied',()=>{
  const rsa=generateKeyPairSync('rsa',{modulusLength:2048});
  const rsaPem=rsa.publicKey.export({type:'spki',format:'pem'});
  assert.throws(
    ()=>verifyInstallReleaseManifest(signPackage(),{
      trustedSigners:[trustedSigner({public_key:rsaPem})],
      evaluatedAt:EVALUATED_AT
    }),
    /must use Ed25519/
  );
});

test('hostile proxy accessor symbol hidden and custom-array inputs fail before semantic use',()=>{
  const pkg=signPackage();
  assert.throws(
    ()=>verify(new Proxy(pkg,{})),
    /Proxy/i
  );

  let reads=0;
  const accessor=signPackage();
  Object.defineProperty(accessor.manifest,'channel',{
    enumerable:true,
    get(){reads+=1;return 'development';}
  });
  assert.throws(()=>verify(accessor),/data properties/i);
  assert.equal(reads,0);

  const symbol=signPackage();
  symbol.manifest[Symbol('authority')]='grant';
  assert.throws(()=>verify(symbol),/symbol/i);

  const hidden=signPackage();
  Object.defineProperty(hidden.manifest,'install_authority',{
    enumerable:false,
    value:true
  });
  assert.throws(()=>verify(hidden),/data properties|key inventory/i);

  const custom=signPackage();
  custom.manifest.non_claims.extra='hidden';
  assert.throws(()=>verify(custom),/custom array state/i);
});

test('artifact verification rejects hostile metadata containers',()=>{
  const target=manifest().artifacts[0];
  assert.throws(
    ()=>verifyInstallReleaseArtifact(new Proxy(target,{}),artifactBytes['runtime-personal']),
    /Proxy/i
  );
});

test('release verifier has no host mutation process network or credential side-effect imports',async()=>{
  const source=await readFile(new URL('../src/lib/install-release-manifest.mjs',import.meta.url),'utf8');
  const imports=[...source.matchAll(/from\s+['"]([^'"]+)['"]/g)].map(match=>match[1]);
  assert.deepEqual(imports,[
    'node:crypto',
    'node:util',
    '../../config/install-release-manifest-policy.json',
    '../../config/install-targets.json',
    '../../config/host-install-policy.json',
    '../../config/capabilities.json',
    '../../config/application-catalog.json',
    '../../config/service-network-policy.json',
    '../../config/setup.json',
    '../grid/migrations.mjs',
    './canonical.mjs'
  ]);
  const specifiers=text=>[
    ...text.matchAll(/^\s*(?:import|export)\s+(?:[^'";]*?\s+from\s+)?['"]([^'"]+)['"]/gm)
  ].map(match=>match[1]);
  assert.deepEqual(specifiers(source),imports);
  assert.deepEqual(specifiers("import 'node:child_process';\nexport * from './x.mjs';"),['node:child_process','./x.mjs']);
  const migrations=await readFile(new URL('../src/grid/migrations.mjs',import.meta.url),'utf8');
  assert.deepEqual(specifiers(migrations),['../lib/canonical.mjs']);
  const canonical=await readFile(new URL('../src/lib/canonical.mjs',import.meta.url),'utf8');
  assert.deepEqual(specifiers(canonical),['node:crypto']);
  for (const [name,text] of [['install-release-manifest',source],['migrations',migrations],['canonical',canonical]]) {
    assert.doesNotMatch(text,/\bprocess\b|globalThis|\bimport\s*\(|\brequire\s*\(/,name);
  }
  assert.doesNotMatch(source,/\bimport\s*\(|node:fs|node:dgram|node:tls|node:dns|process\.env/);
  assert.doesNotMatch(source,/node:child_process|node:net|node:http|node:https/);
  assert.doesNotMatch(source,/\bfetch\s*\(|\bexec\s*\(|\bspawn\s*\(|\bexecFile\s*\(/);
  assert.doesNotMatch(source,/writeFile|mkdir|chmod|chown|unlink|rename/);
});

test('trusted signer inventory rejects private-key material before key conversion',()=>{
  const privatePem=pair.privateKey.export({type:'pkcs8',format:'pem'});
  for (const public_key of [
    privatePem,
    privatePem.replace('PRIVATE KEY','PUBLIC KEY').replace('PRIVATE KEY','PUBLIC KEY')+'\n'+publicPem,
    `${publicPem}${privatePem}`,
    pair.privateKey.export({type:'pkcs8',format:'der'}).toString('base64'),
    JSON.stringify(pair.privateKey.export({format:'jwk'}))
  ]) {
    assert.throws(
      ()=>verify(signPackage(),{trustedSigners:[trustedSigner({public_key})]}),
      /Trusted release signer inventory is invalid/
    );
  }
  assert.equal(verify(signPackage(),{trustedSigners:[trustedSigner({public_key:publicPem})]}).valid,true);
});

function countingProxy(target){
  const counter={traps:0};
  const handler=new Proxy({},{
    get(_unused,trap){
      return (...args)=>{counter.traps+=1;return Reflect[trap](...args);};
    }
  });
  return {proxy:new Proxy(target,handler),counter};
}

function assertValidationError(fn,label){
  assert.throws(fn,error=>{
    assert.ok(error instanceof ValidationError,`${label}: ${error?.name}: ${error?.message}`);
    return true;
  },label);
}

test('artifact verifier rejects proxied or lying byte containers and bad options',()=>{
  const target=manifest().artifacts.find(item=>item.artifact_id==='runtime-personal');
  const good=artifactBytes['runtime-personal'];

  const {proxy,counter}=countingProxy(Buffer.from(good));
  assertValidationError(()=>verifyInstallReleaseArtifact(target,proxy),'Buffer Proxy');
  assert.equal(counter.traps,0);

  class LyingBytes extends Uint8Array {
    get length(){return good.length;}
  }
  const lying=new LyingBytes(good.length+7);
  lying.set(good,0);
  lying.set(Buffer.from('garbage'),good.length);
  assertValidationError(()=>verifyInstallReleaseArtifact(target,lying),'Uint8Array subclass with overridden length');
  assert.throws(()=>verifyInstallReleaseArtifact(target,lying),/byte length mismatch/);
  const detached=new Uint8Array(good);
  detached.buffer.transfer();
  assert.throws(()=>verifyInstallReleaseArtifact(target,detached),/Release artifact bytes are unreadable/);

  assertValidationError(()=>verifyInstallReleaseArtifact(target,good,null),'artifact options:null');
  assertValidationError(()=>verifyInstallReleaseArtifact(target,good,'policy'),'artifact options:string');
  const options=countingProxy({});
  assertValidationError(()=>verifyInstallReleaseArtifact(target,good,options.proxy),'artifact options Proxy');
  assert.equal(options.counter.traps,0);
  assertValidationError(()=>verifyInstallReleaseArtifact(target,[...good]),'plain array bytes');

  assert.equal(verifyInstallReleaseArtifact(target,new Uint8Array(good)).artifact_bytes_verified,true);
});

test('manifest verifier rejects null or proxied options with ValidationError',()=>{
  assertValidationError(()=>verifyInstallReleaseManifest(signPackage(),null),'manifest options:null');
  assertValidationError(()=>verifyInstallReleaseManifest(signPackage(),7),'manifest options:number');
  const options=countingProxy({trustedSigners:[trustedSigner()],evaluatedAt:EVALUATED_AT});
  assertValidationError(()=>verifyInstallReleaseManifest(signPackage(),options.proxy),'manifest options Proxy');
  assert.equal(options.counter.traps,0);
});

test('trusted signer PEM must be canonical SPKI that re-exports identically',()=>{
  const lines=publicPem.trimEnd().split('\n');
  for (const public_key of [
    [...lines.slice(0,-1),'AAAA',lines.at(-1)].join('\n')+'\n',
    [lines[0],lines.slice(1,-1).join('').slice(0,20),lines.slice(1,-1).join('').slice(20),lines.at(-1)].join('\n')+'\n'
  ]) {
    assert.throws(
      ()=>verify(signPackage(),{trustedSigners:[trustedSigner({public_key})]}),
      /Trusted release signer public key is (invalid|not canonical SPKI PEM)/
    );
  }
  assert.equal(verify(signPackage(),{trustedSigners:[trustedSigner({public_key:publicPem.replace(/\n/g,'\r\n')})]}).valid,true);
  assert.equal(verify(signPackage(),{trustedSigners:[trustedSigner({public_key:publicPem.trimEnd()})]}).valid,true);
});

// AT-7 anchor: the policy validator already meets the hostile-input contract.
// Its argument defaults to the shipped policy, so an undefined argument is valid.
test('AT-7: validateInstallReleaseManifestPolicy meets the hostile-input contract', async () => {
  await assertHostileInputContract({
    name: 'validateInstallReleaseManifestPolicy',
    fn: validateInstallReleaseManifestPolicy,
    validArgs: () => [structuredClone(releasePolicy)],
    acceptablePaths: { arg0: ['undefined'] }
  }, assert);
});

// Hostile-input contract (AT-1/2/3). Pattern checks run only on strings and the
// options record must be own enumerable data, so no caller code runs and no raw
// TypeError escapes.
class Sentinel extends Error {}

function signedWith(field,value){
  const pkg=signPackage();
  Object.defineProperty(pkg.manifest,field,{value,enumerable:true,writable:true,configurable:true});
  return pkg;
}

function assertTypedRejection(run,label){
  let thrown;
  try{ run(); }catch(error){ thrown=error; }
  assert.ok(thrown instanceof ValidationError,`${label}: ${thrown?.name}: ${thrown?.message}`);
}

test('AT-1: a release_id whose toString throws is rejected with ValidationError and never runs',()=>{
  let calls=0;
  const hostile={toString(){ calls+=1; throw new Sentinel('release_id toString ran'); }};
  assertTypedRejection(()=>verify(signedWith('release_id',hostile)),'release_id toString');
  assert.equal(calls,0);
});

test('AT-2: a throwing Proxy, revoked Proxy or undefined at release_id or kernel_version is rejected with ValidationError',()=>{
  for(const field of ['release_id','kernel_version']){
    let traps=0;
    const throwing=new Proxy({},new Proxy({},{get(){ return ()=>{ traps+=1; throw new Sentinel('trap ran'); }; }}));
    const revocable=Proxy.revocable({},{});
    revocable.revoke();
    for(const [name,value] of [['throwing Proxy',throwing],['revoked Proxy',revocable.proxy],['undefined',undefined]]){
      assertTypedRejection(()=>verify(signedWith(field,value)),`${field} ${name}`);
    }
    assert.equal(traps,0,`${field}: no trap runs`);
  }
});

test('AT-3: options.trustedSigners as an accessor or non-enumerable property is rejected with ValidationError',()=>{
  const base={trustedSigners:[trustedSigner()],evaluatedAt:EVALUATED_AT};
  let reads=0;
  const accessor=Object.defineProperty({evaluatedAt:EVALUATED_AT},'trustedSigners',{
    get(){ reads+=1; return [trustedSigner()]; },enumerable:true
  });
  const hidden=Object.defineProperty({evaluatedAt:EVALUATED_AT},'trustedSigners',{
    value:[trustedSigner()],enumerable:false
  });
  assert.equal(verifyInstallReleaseManifest(signPackage(),base).valid,true);
  assertTypedRejection(()=>verifyInstallReleaseManifest(signPackage(),accessor),'accessor trustedSigners');
  assertTypedRejection(()=>verifyInstallReleaseManifest(signPackage(),hidden),'non-enumerable trustedSigners');
  assert.equal(reads,0,'the trustedSigners getter never runs');
  for(const [name,options] of [
    ['symbol key',{...base,[Symbol('extra')]:true}],
    ['unknown field',{...base,trustedSigner:[trustedSigner()]}],
    ['own __proto__ key',Object.assign(JSON.parse('{"__proto__":{"valid":true}}'),base)],
    ['non-plain prototype',Object.assign(Object.create({valid:true}),base)]
  ]){
    assertTypedRejection(()=>verifyInstallReleaseManifest(signPackage(),options),name);
  }
});

test('hostile-input contract: verifyInstallReleaseManifest rejects every hostile variant with ValidationError',async()=>{
  await assertHostileInputContract({
    name:'verifyInstallReleaseManifest',
    fn:verifyInstallReleaseManifest,
    validArgs:()=>[signPackage(),{trustedSigners:[trustedSigner()],evaluatedAt:EVALUATED_AT}]
  },assert);
});
