import assert from 'node:assert/strict';
import {
  generateKeyPairSync,
  sign
} from 'node:crypto';
import test from 'node:test';
import { assertHostileInputContract } from '../test-support/hostile-input-contract.mjs';
import { assertNoAmbientOrDynamicCode, codeOnly, HOST_GLOBAL, HOST_GLOBALS, RAW_HOST_GLOBAL } from '../test-support/ambient-code-scan.mjs';
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
  TRUST_ROOT_SIGNER_SET_SCHEMA,
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
    './canonical.mjs',
    './delegation-plain-snapshot.mjs'
  ]);
  const specifiers=text=>[
    ...text.matchAll(/^\s*(?:import|export)\s+(?:[^'";]*?\s+from\s+)?['"]([^'"]+)['"]/gm)
  ].map(match=>match[1]);
  assert.deepEqual(specifiers(source),imports);
  assert.deepEqual(specifiers("import 'node:child_process';\nexport * from './x.mjs';"),['node:child_process','./x.mjs']);
  const migrations=await readFile(new URL('../src/grid/migrations.mjs',import.meta.url),'utf8');
  assert.deepEqual(specifiers(migrations),['../lib/canonical.mjs']);
  const canonical=await readFile(new URL('../src/lib/canonical.mjs',import.meta.url),'utf8');
  assert.deepEqual(specifiers(canonical),['node:crypto','node:util']);
  const snapshot=await readFile(new URL('../src/lib/delegation-plain-snapshot.mjs',import.meta.url),'utf8');
  assert.deepEqual(specifiers(snapshot),['node:util','./canonical.mjs']);
  for (const [name,text,options] of [
    ['install-release-manifest',source,{rawHostGlobals:false}],
    ['migrations',migrations],
    ['canonical',canonical],
    ['delegation-plain-snapshot',snapshot]
  ]) {
    // The raw-text host-global layer is on for every module except the
    // manifest verifier, whose error text says 'validity window'; main had no
    // raw host-global check there. Its code-only scan still runs.
    assertNoAmbientOrDynamicCode(text,name,options);
  }
  assert.doesNotMatch(source,/\bimport\s*\(|node:fs|node:dgram|node:tls|node:dns|process\.env/);
  assert.doesNotMatch(source,/node:child_process|node:net|node:http|node:https/);
  assert.doesNotMatch(source,/\bfetch\s*\(|\bexec\s*\(|\bspawn\s*\(|\bexecFile\s*\(/);
  assert.doesNotMatch(source,/writeFile|mkdir|chmod|chown|unlink|rename/);
});

// Boundary scan (AMBIENT_OR_DYNAMIC_CODE plus the #1916 bare host globals)
// lives in test-support/ambient-code-scan.mjs, shared with install-session.

test('boundary scan catches planted Function, eval and member constructor calls',()=>{
  for(const planted of [
    "const g=Function('return this')();",
    'const g=new Function("return this")();',
    "const f=(()=>{}).constructor('return this');",
    "const f=(()=>{}) . constructor ('return this');",
    "const f=(()=>{})['constructor']('return this');",
    "const v=eval('1+1');",
    "const v=(0,eval)('this');",
    "const p=globalThis.process;",
    "const r=require('node:fs');",
    "const m=await import('node:fs');"
  ]){
    assert.throws(()=>assertNoAmbientOrDynamicCode(`export const ok=1;\n${planted}\n`,'planted'),{code:'ERR_ASSERTION'},planted);
  }
  for(const allowed of [
    'class E extends Error { constructor(message){ super(message); } }',
    'const evaluatedAt=1; const evaluationTime=2; function verify(){}'
  ]){
    assert.doesNotThrow(()=>assertNoAmbientOrDynamicCode(allowed,'allowed'),allowed);
  }
});

// #1916: bare host globals are forbidden in the scanned modules, but property
// access and prose in strings, templates, regular expressions and comments are not.
test('boundary scan catches bare host globals and ignores property access, strings and comments',()=>{
  assert.deepEqual(HOST_GLOBALS,['navigator','self','window','Deno','Bun','WebAssembly']);
  for(const planted of [
    'const agent=navigator.userAgent;',
    'self.postMessage(1);',
    "const w=window['location'];",
    'const w=window;',
    "if(typeof Deno!=='undefined'){}",
    "const f=Bun.file('x');",
    'const m=WebAssembly.compile(bytes);',
    'call(self);',
    'const copy={...window};',
    'const t=`${window.location}`;',
    'const t=`a${`b${Deno.pid}`}c`;',
    "const ok=/a/.test(s)&&navigator;",
    "const s='\\\\'+window;",
    '/* c */ Bun',
    "'s'+Deno",
    'return self',
    'x = a / b / window',
    '({window:1})',
    // Copilot on #1929: ambiguous '/' after a postfix ++/--, a contextual word,
    // a property named like a keyword or a closing brace stays code.
    'let x=4; x++ / window / 2',
    'let x=4; x-- / self / 2',
    'let of=4; of / window / 2',
    'let yield_=0; const y=obj.return / Deno / 2',
    'const f=function(){} / window / 2',
    // Identifier escapes resolve to the same bare global, so any escape in code fails.
    'const x=\\u0077indow.location',
    'const x=\\u{77}indow',
    'const x=wind\\u006fw',
    'const p=\\u0070rocess',
    // #1929 B-1 (Verifier): a numeric literal's trailing dot is not property access.
    'const q=1.\nwindow.postMessage(1)',
    'let n=2.\nself',
    'const q=10.\n  Deno.exit()',
    'const q=[0.\n,Bun]',
    // #1929 B-1: a regular expression after ')', '}', await, of or yield whose
    // quote or backtick would open a fake string under the division reading.
    "if(x) /'/.test(s)&&window&&/'/.test(t)",
    'if(x) /`/.test(s);Deno.exit();/`/.test(t)',
    "{}\n/'/.test(a)&&navigator&&/'/.test(b)",
    'async function f(){await /"/.exec(s);Bun.spawn(1);/"/.exec(t)}',
    "for(const m of /'/.exec(s)||[]){};self;/'/.exec(t)",
    "function*g(){yield /'/;window;/'/}",
    // Variants: a fake comment or a fake regex start under the division reading,
    // a closing brace of a function body, and a while/for header.
    'if(x) /a*/.test(s);WebAssembly;/b/.test(t)',
    'if(x) /[//]/.test(s);navigator',
    'function g(){}\n/"/.test(a);self;/"/.test(b)',
    "while(x) /'/.exec(s)&&window&&/'/.exec(t)",
    'async function h(){await /`/;Deno;/`/}'
  ]){
    // Both layers must catch every planted case on its own.
    const text=`export const ok=1;\n${planted}\n`;
    assert.throws(()=>assertNoAmbientOrDynamicCode(text,'planted'),{code:'ERR_ASSERTION'},planted);
    assert.throws(()=>assertNoAmbientOrDynamicCode(text,'planted',{rawHostGlobals:false}),
      error=>error.code==='ERR_ASSERTION'||error instanceof SyntaxError,`code-only: ${planted}`);
  }
  for(const allowed of [
    'obj.window=1;',
    'obj?.navigator;',
    'a . self;',
    'obj\n  .WebAssembly;',
    "const m='validity window';",
    'const m="self";',
    "const m='it\\'s Deno';",
    'const t=`Bun ${1} WebAssembly`;',
    'const t=`${obj.window}`;',
    '// navigator',
    '/* Deno\n window */',
    'const r=/window|self/.test(s);',
    'const r=[/Bun/g];',
    'windowSize+selfTest+myDeno+$window+_self+Bunny+WebAssemblyX;',
    'class A{#window=1;m(){return this.#window;}}',
    // Unambiguous division keeps the rest of its line as code.
    'const r=a[0] / b / c;',
    "const r=n / 2 + 'px';",
    'const r=x++ / 2 / y;'
  ]){
    assert.doesNotThrow(()=>assertNoAmbientOrDynamicCode(allowed,'allowed',{rawHostGlobals:false}),allowed);
    // The raw-text layer (on by default) still reports any of these that names a host global.
    if(RAW_HOST_GLOBAL.test(allowed)) assert.throws(()=>assertNoAmbientOrDynamicCode(allowed,'allowed'),{code:'ERR_ASSERTION'},allowed);
  }
  // The code-only view keeps offsets, and untokenizable input fails closed.
  const sample="const a='window'; // self\nconst b=1;";
  assert.equal(codeOnly(sample).length,sample.length);
  assert.equal(codeOnly(sample).split('\n').length,2);
  for(const broken of ["const a='window;",'const a=`${window','/* window','const r=/window',
    "if(x) /'/",'f() / 2 // half','{}/`/',
    // An ambiguous '/' followed by a quote or backtick fails closed even when
    // no later '/' is on the line (division here, but not proven lexically).
    "f(a) / n + 'px'",'g() / `${n}`']){
    assert.throws(()=>codeOnly(broken),SyntaxError,broken);
  }
  assert.match('window',HOST_GLOBAL);
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

// ---------------------------------------------------------------------------
// #1914: manifest-bound artifact verification overload.

const BOUND_RESULT_KEYS=[
  'artifact_bytes_verified','artifact_id','artifact_kind','authority_effect',
  'byte_length','host_mutation_authorized','manifest_bound','manifest_digest',
  'release_id','sha256','signer_key_id','trust_root_digest','trust_root_pinned','valid'
];

function boundFixture(value=manifest()){
  const packageValue=signPackage(value);
  return {packageValue,verified:verify(packageValue)};
}

test('#1914 bound form verifies bytes against the signed manifest and carries its identity',()=>{
  const {packageValue,verified}=boundFixture();
  for(const item of packageValue.manifest.artifacts){
    const bytes=artifactBytes[item.artifact_id];
    const ok=verifyInstallReleaseArtifact(verified,item.artifact_id,bytes);
    assert.deepEqual(Object.keys(ok).sort(),BOUND_RESULT_KEYS);
    assert.equal(Object.isFrozen(ok),true);
    assert.equal(ok.valid,true);
    assert.equal(ok.manifest_bound,true);
    assert.equal(ok.artifact_bytes_verified,true);
    assert.equal(ok.artifact_id,item.artifact_id);
    assert.equal(ok.artifact_kind,item.kind);
    assert.equal(ok.sha256,sha256(bytes));
    assert.equal(ok.byte_length,bytes.length);
    assert.equal(ok.manifest_digest,verified.manifest_digest);
    assert.equal(ok.manifest_digest,sha256(canonicalJson(packageValue.manifest)));
    assert.equal(ok.release_id,verified.release_id);
    assert.equal(ok.signer_key_id,KEY_ID);
    assert.equal(ok.trust_root_digest,verified.trust_root_digest);
    assert.equal(ok.trust_root_pinned,false);
    assert.equal(ok.host_mutation_authorized,false);
    assert.equal(ok.authority_effect,'none');
  }
  // The verified result itself keeps its existing fields and semantics.
  assert.equal(verified.artifact_bytes_verified,false);
  assert.equal(Object.hasOwn(verified,'manifest_bound'),false);
  assert.equal(Object.hasOwn(verified,'artifacts'),false);
});

test('#1914 unbound form never carries manifest_bound:true and cannot be fed a verified result',()=>{
  const {packageValue,verified}=boundFixture();
  for(const item of packageValue.manifest.artifacts){
    const unbound=verifyInstallReleaseArtifact(item,artifactBytes[item.artifact_id]);
    assert.equal(unbound.manifest_bound,false);
    assert.equal(Object.hasOwn(unbound,'manifest_digest'),false);
    assert.equal(Object.hasOwn(unbound,'release_id'),false);
  }
  const good=artifactBytes['runtime-personal'];
  const target=packageValue.manifest.artifacts[0];
  assertValidationError(()=>verifyInstallReleaseArtifact(verified,good),'verified result as unbound artifact');
  assertValidationError(()=>verifyInstallReleaseArtifact({...target,manifest_bound:true},good),'artifact claiming manifest_bound');
  assertValidationError(()=>verifyInstallReleaseArtifact(target,good,{manifest_bound:true}),'options claiming manifest_bound');
  assertValidationError(()=>verifyInstallReleaseArtifact(target,good,{},{}),'unbound extra argument');
});

test('#1914 unverified, forged, lookalike and modified verified results are rejected',()=>{
  const {packageValue,verified}=boundFixture();
  const good=artifactBytes['runtime-personal'];
  const id='runtime-personal';
  const frozenCopy=value=>Object.freeze(value);
  const cases=[
    ['package instead of verified result',packageValue],
    ['manifest instead of verified result',packageValue.manifest],
    ['artifact record',packageValue.manifest.artifacts[0]],
    ['policy result',validateInstallReleaseManifestPolicy()],
    ['unbound artifact result',verifyInstallReleaseArtifact(packageValue.manifest.artifacts[0],good)],
    ['spread lookalike',{...verified}],
    ['frozen spread lookalike',frozenCopy({...verified})],
    ['structuredClone lookalike',frozenCopy(structuredClone(verified))],
    ['null-prototype lookalike',frozenCopy(Object.assign(Object.create(null),verified))],
    ['forged flags',frozenCopy({...verified,manifest_digest:'f'.repeat(64)})],
    ['modified release_id',frozenCopy({...verified,release_id:'axiom-mesh/other'})],
    ['modified signer_key_id',frozenCopy({...verified,signer_key_id:'release:other'})],
    ['modified trust_root_digest',frozenCopy({...verified,trust_root_digest:'e'.repeat(64)})],
    ['trust_root_pinned:true',frozenCopy({...verified,trust_root_pinned:true})],
    ['valid:false',frozenCopy({...verified,valid:false})],
    ['signature_verified:false',frozenCopy({...verified,signature_verified:false})],
    ['control_plane_bound:false',frozenCopy({...verified,control_plane_bound:false})],
    ['artifact_metadata_bound:false',frozenCopy({...verified,artifact_metadata_bound:false})],
    ['extra key',frozenCopy({...verified,artifacts:packageValue.manifest.artifacts})],
    ['missing key',frozenCopy(Object.fromEntries(Object.entries(verified).filter(([key])=>key!=='policy_digest')))],
    ['symbol key',frozenCopy({...verified,[Symbol('bound')]:true})],
    ['inheriting from genuine result',Object.freeze(Object.create(verified))],
    ['empty object',{}],
    ['null',null],
    ['undefined',undefined],
    ['number',7]
  ];
  for(const [name,value] of cases){
    assertValidationError(()=>verifyInstallReleaseArtifact(value,id,good),name);
  }
  // The genuine result is frozen: in-place modification is impossible and the
  // binding is unchanged.
  assert.throws(()=>{ verified.manifest_digest='f'.repeat(64); },TypeError);
  assert.throws(()=>{ verified.install_profiles.push('x'); },TypeError);
  assert.equal(verifyInstallReleaseArtifact(verified,id,good).manifest_bound,true);
});

test('#1914 Proxy and accessor verified results are rejected without running caller code',()=>{
  const {verified}=boundFixture();
  const good=artifactBytes['runtime-personal'];
  const proxied=countingProxy(verified);
  assertValidationError(()=>verifyInstallReleaseArtifact(proxied.proxy,'runtime-personal',good),'Proxy over genuine result');
  assert.equal(proxied.counter.traps,0);
  const revocable=Proxy.revocable(verified,{});
  revocable.revoke();
  assertValidationError(()=>verifyInstallReleaseArtifact(revocable.proxy,'runtime-personal',good),'revoked Proxy');

  let reads=0;
  const accessor={...verified};
  Object.defineProperty(accessor,'valid',{enumerable:true,get(){ reads+=1; return true; }});
  Object.freeze(accessor);
  assertValidationError(()=>verifyInstallReleaseArtifact(accessor,'runtime-personal',good),'accessor lookalike');
  const throwing={...verified};
  Object.defineProperty(throwing,'manifest_digest',{enumerable:true,get(){ reads+=1; throw new Sentinel('getter ran'); }});
  Object.freeze(throwing);
  assertValidationError(()=>verifyInstallReleaseArtifact(throwing,'runtime-personal',good),'throwing accessor lookalike');
  const hidden={...verified};
  Object.defineProperty(hidden,'valid',{enumerable:false,value:true});
  assertValidationError(()=>verifyInstallReleaseArtifact(Object.freeze(hidden),'runtime-personal',good),'non-enumerable lookalike');
  assert.equal(reads,0,'no getter on a lookalike result runs');
});

test('#1914 unknown, invalid and duplicate artifact ids fail closed with ValidationError',()=>{
  const {verified}=boundFixture();
  const good=artifactBytes['runtime-personal'];
  for(const id of ['missing-artifact','constructor','toString','hasOwnProperty','runtime-personal-x','Runtime-personal']){
    assertValidationError(()=>verifyInstallReleaseArtifact(verified,id,good),`unknown id ${id}`);
    assert.throws(()=>verifyInstallReleaseArtifact(verified,id,good),/not in the verified manifest/);
  }
  for(const id of ['','x','__proto__','runtime-personal\n',' runtime-personal','a'.repeat(300)]){
    assertValidationError(()=>verifyInstallReleaseArtifact(verified,id,good),`invalid id ${JSON.stringify(id).slice(0,40)}`);
    assert.throws(()=>verifyInstallReleaseArtifact(verified,id,good),/Release artifact id is invalid/);
  }
  // A non-string id never selects the bound form, and is still rejected.
  for(const id of [7,null,{toString(){ throw new Sentinel('coerced'); }}]){
    assertValidationError(()=>verifyInstallReleaseArtifact(verified,id,good),`non-string id ${typeof id}`);
  }
  // A manifest that names an artifact id twice never yields a verified result,
  // so no binding with a duplicate id can exist; the bound lookup also refuses
  // anything but exactly one match (defense in depth).
  const duplicate=manifest();
  duplicate.artifacts.push({...duplicate.artifacts[0]});
  assertValidationError(()=>verify(signPackage(duplicate)),'duplicate id manifest');
  assert.throws(()=>verify(signPackage(duplicate)),/artifact id is duplicated/);
});

test('#1914 mutating the source package or manifest after verification does not change the bound result',()=>{
  const {packageValue,verified}=boundFixture();
  const good=artifactBytes['runtime-personal'];
  const tampered=Buffer.from('attacker image bytes');
  const before=verifyInstallReleaseArtifact(verified,'runtime-personal',good);
  const target=packageValue.manifest.artifacts[0];
  target.sha256=sha256(tampered);
  target.byte_length=tampered.length;
  target.kind='source-archive';
  packageValue.manifest.artifacts.push(artifact('injected','oci-image',['personal-local']));
  packageValue.manifest.artifacts[1]={...packageValue.manifest.artifacts[1],artifact_id:'renamed'};
  packageValue.manifest.release_id='axiom-mesh/attacker';
  packageValue.signature.digest='0'.repeat(64);
  packageValue.manifest=manifest({release_id:'axiom-mesh/replaced'});

  assert.deepEqual(verifyInstallReleaseArtifact(verified,'runtime-personal',good),before);
  assertValidationError(()=>verifyInstallReleaseArtifact(verified,'runtime-personal',tampered),'tampered bytes after mutation');
  assertValidationError(()=>verifyInstallReleaseArtifact(verified,'injected',Buffer.from('artifact:injected')),'injected artifact');
  assertValidationError(()=>verifyInstallReleaseArtifact(verified,'renamed',artifactBytes['runtime-infrastructure']),'renamed artifact');
  assert.equal(
    verifyInstallReleaseArtifact(verified,'runtime-infrastructure',artifactBytes['runtime-infrastructure']).release_id,
    'axiom-mesh/0.12.0-dev.3/test-release'
  );
});

test('#1914 bound form rejects byte tampering, length mismatch and substituted artifact bytes',()=>{
  const {verified}=boundFixture();
  const good=artifactBytes['runtime-personal'];
  const flipped=Buffer.from(good);
  flipped[0]^=1;
  assert.throws(()=>verifyInstallReleaseArtifact(verified,'runtime-personal',flipped),/digest mismatch: runtime-personal/);
  assertValidationError(()=>verifyInstallReleaseArtifact(verified,'runtime-personal',flipped),'same-length tamper');
  assert.throws(()=>verifyInstallReleaseArtifact(verified,'runtime-personal',good.subarray(0,good.length-1)),/byte length mismatch/);
  assert.throws(()=>verifyInstallReleaseArtifact(verified,'runtime-personal',Buffer.concat([good,Buffer.from([0])])),/byte length mismatch/);
  assertValidationError(()=>verifyInstallReleaseArtifact(verified,'runtime-personal',Buffer.alloc(0)),'empty bytes');
  // Bytes of another signed artifact (a different source) under this id.
  for(const other of ['runtime-infrastructure','documentation','sbom','provenance']){
    assertValidationError(()=>verifyInstallReleaseArtifact(verified,'runtime-personal',artifactBytes[other]),`bytes of ${other}`);
  }
  const sameLength=Buffer.from('oci image personaX');
  assert.equal(sameLength.length,good.length);
  assert.throws(()=>verifyInstallReleaseArtifact(verified,'runtime-personal',sameLength),/digest mismatch/);

  const {proxy,counter}=countingProxy(Buffer.from(good));
  assertValidationError(()=>verifyInstallReleaseArtifact(verified,'runtime-personal',proxy),'Proxy bytes');
  assert.equal(counter.traps,0);
  class LyingBytes extends Uint8Array { get length(){ return good.length; } }
  const lying=new LyingBytes(good.length+3);
  lying.set(good,0);
  assert.throws(()=>verifyInstallReleaseArtifact(verified,'runtime-personal',lying),/byte length mismatch/);
  const detached=new Uint8Array(good);
  detached.buffer.transfer();
  assert.throws(()=>verifyInstallReleaseArtifact(verified,'runtime-personal',detached),/bytes are unreadable/);
  for(const bytes of [[...good],good.toString('hex'),undefined,null,new DataView(new ArrayBuffer(4))]){
    assertValidationError(()=>verifyInstallReleaseArtifact(verified,'runtime-personal',bytes),`non-byte input ${typeof bytes}`);
  }
  assertValidationError(()=>verifyInstallReleaseArtifact(verified,'runtime-personal'),'missing bytes');
  assertValidationError(()=>verifyInstallReleaseArtifact(verified,'runtime-personal',good,{policy:releasePolicy}),'bound form takes no options');
  assert.equal(verifyInstallReleaseArtifact(verified,'runtime-personal',new Uint8Array(good)).manifest_bound,true);
});

test('#1914 a result from a different manifest or release does not verify another release\'s artifact',()=>{
  const first=boundFixture();
  const otherBytes=Buffer.from('oci image personal, release two');
  const secondManifest=manifest({release_id:'axiom-mesh/0.12.0-dev.3/second-release'});
  secondManifest.artifacts[0]={
    ...secondManifest.artifacts[0],
    sha256:sha256(otherBytes),
    byte_length:otherBytes.length
  };
  secondManifest.artifacts=secondManifest.artifacts.filter(item=>item.artifact_id!=='sbom');
  secondManifest.artifacts.push(artifact('sbom-two','sbom',['personal-local','infrastructure-node']));
  const second=boundFixture(secondManifest);
  assert.notEqual(second.verified.manifest_digest,first.verified.manifest_digest);

  // Release one's bytes do not pass against release two's signed digest.
  assertValidationError(
    ()=>verifyInstallReleaseArtifact(second.verified,'runtime-personal',artifactBytes['runtime-personal']),
    'release one bytes against release two'
  );
  // An id only release one signed is unknown to release two, and vice versa.
  assertValidationError(()=>verifyInstallReleaseArtifact(second.verified,'sbom',artifactBytes.sbom),'release one id in release two');
  assertValidationError(()=>verifyInstallReleaseArtifact(first.verified,'sbom-two',Buffer.from('artifact:sbom-two')),'release two id in release one');
  // Where an artifact is identical in both, each bound result names its own
  // manifest, so a consumer expecting release one rejects release two's result.
  const one=verifyInstallReleaseArtifact(first.verified,'documentation',artifactBytes.documentation);
  const two=verifyInstallReleaseArtifact(second.verified,'documentation',artifactBytes.documentation);
  assert.equal(one.manifest_digest,first.verified.manifest_digest);
  assert.equal(two.manifest_digest,second.verified.manifest_digest);
  assert.notEqual(one.manifest_digest,two.manifest_digest);
  assert.notEqual(one.release_id,two.release_id);
  assert.equal(verifyInstallReleaseArtifact(second.verified,'runtime-personal',otherBytes).release_id,secondManifest.release_id);

  // Splicing release two's identity into release one's result is a lookalike.
  assertValidationError(
    ()=>verifyInstallReleaseArtifact(Object.freeze({...first.verified,manifest_digest:second.verified.manifest_digest,release_id:second.verified.release_id}),'runtime-personal',artifactBytes['runtime-personal']),
    'spliced identity'
  );
});

test('#1914 residual 1: unbound artifact options are own enumerable data only',()=>{
  const target=manifest().artifacts[0];
  const good=artifactBytes['runtime-personal'];
  let reads=0;
  const getter=Object.defineProperty({},'policy',{enumerable:true,get(){ reads+=1; return releasePolicy; }});
  const throwing=Object.defineProperty({},'policy',{enumerable:true,get(){ reads+=1; throw new Sentinel('policy getter'); }});
  const hidden=Object.defineProperty({},'policy',{enumerable:false,value:releasePolicy});
  const cases=[
    ['accessor policy',getter],
    ['throwing accessor policy',throwing],
    ['non-enumerable policy',hidden],
    ['inherited policy',Object.create({policy:releasePolicy})],
    ['inherited weakened policy',Object.create({policy:{...releasePolicy,allowed_platforms:['any','linux','windows']}})],
    ['array options',[]],
    ['array options with policy',Object.assign([],{policy:releasePolicy})],
    ['unknown field',{trustedSigners:[]}],
    ['symbol field',{[Symbol('policy')]:releasePolicy}],
    ['own __proto__ key',JSON.parse('{"__proto__":{"policy":{}}}')],
    ['class instance',new (class Options { constructor(){ this.policy=releasePolicy; } })()],
    ['Map',new Map([['policy',releasePolicy]])],
    ['function',()=>({})],
    ['null',null],
    ['number',7]
  ];
  for(const [name,options] of cases){
    assertValidationError(()=>verifyInstallReleaseArtifact(target,good,options),name);
  }
  assert.equal(reads,0,'no options getter runs');
  assert.equal(verifyInstallReleaseArtifact(target,good,{}).manifest_bound,false);
  assert.equal(verifyInstallReleaseArtifact(target,good,{policy:structuredClone(releasePolicy)}).valid,true);
  assert.equal(verifyInstallReleaseArtifact(target,good,Object.assign(Object.create(null),{policy:structuredClone(releasePolicy)})).valid,true);
  assert.equal(verifyInstallReleaseArtifact(target,good,undefined).valid,true);
});

test('#1914 hostile-input contract: bound verifyInstallReleaseArtifact',async()=>{
  const packageValue=signPackage();
  const verified=verify(packageValue);
  await assertHostileInputContract({
    name:'verifyInstallReleaseArtifact (bound)',
    fn:verifyInstallReleaseArtifact,
    validArgs:()=>[verified,'runtime-personal',Buffer.from(artifactBytes['runtime-personal'])],
    // Byte indexes of a Buffer are not property slots; the root bytes argument
    // still receives every hostile variant.
    skipPaths:[/^arg2\./],
    // Expando properties on the byte container are never read: only its byte
    // content is copied (as in #1903) and hashed, so the exact bytes still pass.
    acceptablePaths:{arg2:['hidden-mind-id','symbol-key','cycle']}
  },assert);
});

// Options and their defaults come from own properties only: a polluted
// Object.prototype (or any inherited key) can neither replace a default
// control-plane input nor supply a missing signer set or evaluation time.
function withPollutedPrototype(key,value,callback){
  assert.equal(Object.hasOwn(Object.prototype,key),false,key);
  Object.defineProperty(Object.prototype,key,{value,configurable:true,writable:true,enumerable:false});
  try{
    return callback();
  }finally{
    delete Object.prototype[key];
  }
}

test('verifier option defaults ignore a polluted Object.prototype',()=>{
  const expected=verify(signPackage());
  const drifted={...hostInstallPolicy,kernel_version:'9.9.9'};
  const weakPolicy={...releasePolicy,max_validity_seconds:1};
  for(const [key,value] of [
    ['policy',weakPolicy],
    ['currentInstallTargets',{...installTargets,kernel_version:'9.9.9'}],
    ['currentHostInstallPolicy',drifted],
    ['currentCapabilityRegistry',{...capabilityRegistry,kernel_version:'9.9.9'}],
    ['currentApplicationCatalog',{}],
    ['currentServiceNetworkPolicy',{}],
    ['currentSourceSetupPolicy',{...sourceSetupPolicy,kernel_version:'9.9.9'}],
    ['migrationGeneration',MIGRATIONS.length+1]
  ]){
    const result=withPollutedPrototype(key,value,()=>verify(signPackage()));
    assert.deepEqual(result,expected,key);
    const nullPrototype=Object.assign(Object.create(null),{trustedSigners:[trustedSigner()],evaluatedAt:EVALUATED_AT});
    assert.deepEqual(withPollutedPrototype(key,value,()=>verifyInstallReleaseManifest(signPackage(),nullPrototype)),expected,`${key} null-prototype`);
  }
});

test('verifier options never take signers or evaluation time from the prototype',()=>{
  const packageValue=signPackage();
  withPollutedPrototype('trustedSigners',[trustedSigner()],()=>{
    assert.throws(()=>verifyInstallReleaseManifest(packageValue,{evaluatedAt:EVALUATED_AT}),/Trusted release signers/);
  });
  withPollutedPrototype('evaluatedAt',EVALUATED_AT,()=>{
    assert.throws(()=>verifyInstallReleaseManifest(packageValue,{trustedSigners:[trustedSigner()]}),/evaluatedAt/);
  });
});

test('own option values and own undefined defaults behave exactly as before',()=>{
  const packageValue=signPackage();
  const expected=verify(packageValue);
  const explicit={
    trustedSigners:[trustedSigner()],evaluatedAt:EVALUATED_AT,policy:releasePolicy,
    currentInstallTargets:installTargets,currentHostInstallPolicy:hostInstallPolicy,
    currentCapabilityRegistry:capabilityRegistry,currentApplicationCatalog:applicationCatalog,
    currentServiceNetworkPolicy:serviceNetworkPolicy,currentSourceSetupPolicy:sourceSetupPolicy,
    migrationGeneration:MIGRATIONS.length
  };
  assert.deepEqual(verifyInstallReleaseManifest(packageValue,explicit),expected);
  const undefinedDefaults=Object.fromEntries(Object.keys(explicit).map(key=>[key,key==='trustedSigners'||key==='evaluatedAt'?explicit[key]:undefined]));
  assert.deepEqual(verifyInstallReleaseManifest(packageValue,undefinedDefaults),expected);
  assert.throws(()=>verifyInstallReleaseManifest(packageValue,{...explicit,currentHostInstallPolicy:{...hostInstallPolicy,kernel_version:'9.9.9'}}),/kernel version/);
  assert.throws(()=>verifyInstallReleaseManifest(packageValue,{...explicit,trustedSigners:undefined}),/Trusted release signers/);
});

// ---------------------------------------------------------------------------
// A1 (#1918 trust-root design): the verifier records which trust root it used.

const secondPair=generateKeyPairSync('ed25519');
const secondPem=secondPair.publicKey.export({type:'spki',format:'pem'});

// Independent restatement of the documented canonical form.
function expectedTrustRootDigest(signers){
  const pem=value=>`${value.replace(/\r\n/g,'\n').replace(/\n?$/,'')}\n`;
  return digestObject({
    schema:'axiom-install-release-signer-set.v1',
    signers:signers
      .map(item=>({key_id:item.key_id,public_key:pem(item.public_key),roles:[...item.roles].sort(),status:item.status}))
      .sort((left,right)=>(left.key_id<right.key_id?-1:1))
  });
}

test('A1: the verified result records the canonical digest of the whole signer inventory, unpinned',()=>{
  assert.equal(TRUST_ROOT_SIGNER_SET_SCHEMA,'axiom-install-release-signer-set.v1');
  const signers=[trustedSigner()];
  const result=verify(signPackage(),{trustedSigners:signers});
  assert.match(result.trust_root_digest,/^[a-f0-9]{64}$/);
  assert.equal(result.trust_root_digest,expectedTrustRootDigest(signers));
  assert.equal(result.trust_root_pinned,false);
  assert.equal(Object.isFrozen(result),true);
  // Every other field is exactly what the verifier returned before A1.
  const {trust_root_digest:_digest,trust_root_pinned:_pinned,...rest}=result;
  assert.equal(Object.hasOwn(rest,'trust_root_digest'),false);
  assert.equal(rest.signer_key_id,KEY_ID);
  assert.equal(rest.valid,true);
});

test('A1: the trust-root digest ignores signer order, roles order, key order and PEM line-ending spelling',()=>{
  const primary=trustedSigner({roles:['release-installer-authority','audit-reader']});
  const other={key_id:'release:test-key-2',public_key:secondPem,roles:['release-installer-authority'],status:'retired'};
  const baseline=verify(signPackage(),{trustedSigners:[primary,other]}).trust_root_digest;
  assert.equal(baseline,expectedTrustRootDigest([primary,other]));
  const reorderedKeys=obj=>Object.fromEntries(Object.entries(obj).reverse());
  for(const [name,signers] of [
    ['signer order',[other,primary]],
    ['roles order',[{...primary,roles:['audit-reader','release-installer-authority']},other]],
    ['object key order',[reorderedKeys(primary),reorderedKeys(other)]],
    ['CRLF PEM',[{...primary,public_key:publicPem.replace(/\n/g,'\r\n')},other]],
    ['PEM without trailing newline',[{...primary,public_key:publicPem.replace(/\n$/,'')},{...other,public_key:secondPem.replace(/\n$/,'')}]],
    ['null-prototype signer records',[Object.assign(Object.create(null),primary),Object.assign(Object.create(null),other)]]
  ]){
    assert.equal(verify(signPackage(),{trustedSigners:signers}).trust_root_digest,baseline,name);
  }
});

test('A1: any other change to the accepted inventory changes the trust-root digest',()=>{
  const primary=trustedSigner();
  const other={key_id:'release:test-key-2',public_key:secondPem,roles:['release-installer-authority'],status:'retired'};
  const baseline=verify(signPackage(),{trustedSigners:[primary,other]}).trust_root_digest;
  const seen=new Set([baseline]);
  for(const [name,signers] of [
    ['other signer removed',[primary]],
    ['other signer revoked',[primary,{...other,status:'revoked'}]],
    ['other signer active',[primary,{...other,status:'active'}]],
    ['other signer renamed',[primary,{...other,key_id:'release:test-key-3'}]],
    ['other signer gains a role',[primary,{...other,roles:['release-installer-authority','x']}]],
    ['other signer key swapped',[primary,{...other,public_key:publicPem}]],
    ['primary gains a role',[trustedSigner({roles:['release-installer-authority','x']}),other]],
    ['third signer added',[primary,other,{...other,key_id:'release:test-key-4'}]]
  ]){
    const result=verify(signPackage(),{trustedSigners:signers});
    assert.equal(result.valid,true,name);
    assert.equal(result.trust_root_digest,expectedTrustRootDigest(signers),name);
    assert.equal(seen.has(result.trust_root_digest),false,name);
    seen.add(result.trust_root_digest);
  }
});

test('A1: a rejected inventory yields no digest and the same rejection as before',()=>{
  const packageValue=signPackage();
  for(const [name,trustedSigners,pattern] of [
    ['empty',[],/Trusted release signers/],
    ['unknown key id',[trustedSigner({key_id:'release:other'})],/not actively trusted/],
    ['retired signer',[trustedSigner({status:'retired'})],/not actively trusted/],
    ['wrong role',[trustedSigner({roles:['audit-reader']})],/not actively trusted/],
    ['duplicate key id',[trustedSigner(),trustedSigner()],/inventory is invalid/],
    ['extra signer field',[{...trustedSigner(),not_after:'2027-01-01T00:00:00.000Z'}],/key inventory drifted/]
  ]){
    assert.throws(()=>verifyInstallReleaseManifest(packageValue,{trustedSigners,evaluatedAt:EVALUATED_AT}),
      error=>error instanceof ValidationError&&pattern.test(error.message),name);
  }
});
