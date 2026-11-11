import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import { canonicalJson } from '../src/lib/canonical.mjs';

const CLI=fileURLToPath(new URL('../src/install-release-manifest.mjs',import.meta.url));
const REPOSITORY_ROOT=resolve(dirname(CLI),'../..');

function artifact(artifactId,kind,requiredForProfiles){
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
    sha256:'a'.repeat(64),
    byte_length:1,
    required_for_profiles:requiredForProfiles
  };
}

function input(){
  return {
    release_id:'axiom-mesh/0.12.0-dev.3/cli-test',
    channel:'development',
    source_revision:'b'.repeat(40),
    issued_at:'2026-11-11T22:00:00.000Z',
    valid_until:'2026-11-12T00:00:00.000Z',
    signing_key_id:'release:external-test-key-1',
    install_profiles:['personal-local','infrastructure-node'],
    rollback_mode:'migration-specific',
    minimum_compatible_kernel:'0.12.0-dev.3',
    artifacts:[
      artifact('runtime-personal','oci-image',['personal-local']),
      artifact('runtime-infrastructure','oci-image',['infrastructure-node']),
      artifact('documentation','documentation-bundle',['personal-local','infrastructure-node']),
      artifact('sbom','sbom',['personal-local','infrastructure-node']),
      artifact('provenance','provenance',['personal-local','infrastructure-node'])
    ]
  };
}

function run(stdin,argv=['build-unsigned']){
  return spawnSync(process.execPath,[CLI,...argv],{
    input:stdin,
    encoding:'utf8',
    maxBuffer:4*1024*1024
  });
}

function runPackageScript(stdin){
  return spawnSync('npm run --silent release:manifest:build',{
    cwd:REPOSITORY_ROOT,
    input:stdin,
    encoding:'utf8',
    maxBuffer:4*1024*1024,
    shell:true
  });
}

test('CLI emits one canonical unsigned statement without authority or signature fields',()=>{
  const result=run(JSON.stringify(input()));

  assert.equal(result.status,0,result.stderr);
  assert.equal(result.stderr,'');
  const statement=JSON.parse(result.stdout);
  assert.equal(result.stdout,`${canonicalJson(statement)}\n`);
  assert.equal(statement.release_id,'axiom-mesh/0.12.0-dev.3/cli-test');
  assert.equal(statement.source_revision,'b'.repeat(40));
  assert.equal(statement.signing_key_id,'release:external-test-key-1');
  assert.equal(statement.production_promoted,false);
  assert.equal(statement.installation_grants_authority,false);
  assert.equal(statement.host_mutation_authorized,false);
  assert.equal(statement.authority_effect,'none');
  assert.equal(statement.network_effect,'none');
  assert.equal(Object.hasOwn(statement,'signature'),false);
});

test('CLI rejects invalid JSON without echoing the supplied content',()=>{
  const secret='do-not-echo-this-content';
  const result=run(`{"release_id":"${secret}"`);

  assert.equal(result.status,1);
  assert.match(result.stderr,/not valid JSON/);
  assert.doesNotMatch(result.stderr,new RegExp(secret));
  assert.equal(result.stdout,'');
});

test('documented quiet package command emits only the canonical statement',()=>{
  const result=runPackageScript(JSON.stringify(input()));

  assert.equal(result.status,0,result.stderr);
  assert.equal(result.stderr,'');
  const statement=JSON.parse(result.stdout);
  assert.equal(result.stdout,`${canonicalJson(statement)}\n`);
});

test('CLI rejects malformed UTF-8 instead of replacement-decoding it',()=>{
  const bytes=Buffer.from(JSON.stringify(input()));
  const marker=Buffer.from('runtime-personal');
  const index=bytes.indexOf(marker);
  assert.notEqual(index,-1);
  bytes[index]=0xff;

  const result=run(bytes);

  assert.equal(result.status,1);
  assert.match(result.stderr,/not valid UTF-8/);
  assert.equal(result.stdout,'');
});

test('CLI schema failures never echo caller-controlled property names',()=>{
  const value=input();
  const secret='do-not-echo-semantic-input';
  let nested={};
  for(let depth=0; depth<66; depth+=1){
    nested={[secret]:nested};
  }
  value.artifacts[0].unexpected=nested;

  const result=run(JSON.stringify(value));

  assert.equal(result.status,1);
  assert.match(result.stderr,/input failed validation/);
  assert.doesNotMatch(result.stderr,new RegExp(secret));
  assert.equal(result.stdout,'');
});

test('CLI rejects oversized stdin before parsing or emitting output',()=>{
  const result=run(' '.repeat(1_048_577));

  assert.equal(result.status,1);
  assert.match(result.stderr,/input exceeds 1048576 bytes/);
  assert.equal(result.stdout,'');
});

test('CLI rejects commands other than the bounded unsigned build',()=>{
  const result=run(JSON.stringify(input()),['sign']);

  assert.equal(result.status,1);
  assert.match(result.stderr,/Usage:/);
  assert.equal(result.stdout,'');
});
