import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '../..');

async function read(path) {
  return readFile(resolve(ROOT, path), 'utf8');
}

test('release-bound install admission documentation retains composition and zero-authority boundaries', async () => {
  const content = await read('docs/operations/RELEASE-BOUND-INSTALL-INPUT-ADMISSION.md');
  for (const marker of [
    '## Architectural rule',
    '## Lower-layer verification is re-run',
    '## Host-fact binding',
    '## Artifact-set selection',
    '## Mandatory nonclaims',
    '## Threats covered in v1',
    '## Remaining boundary before host mutation',
    '## Current nonclaims',
    'axiom-install-input-admission.v1',
    'may_request_privileged_install_review: true',
    'privileged_install_authorized: false',
    'host_mutation_authorized: false',
    'mesh_authority_granted: false',
    'network_authority_granted: false',
    'artifact_transport_trusted: false',
    'host_facts_authenticated: false',
    'physical_host_attested: false',
    'runtime_safety_established: false',
    'authority_effect: none',
    'network_effect: none'
  ]) {
    assert.ok(content.includes(marker), `install admission documentation must retain: ${marker}`);
  }
  assert.match(content, /not permission to alter a host/i);
  assert.match(content, /privileged install authorization.*not a root installer/is);
  assert.match(content, /recomputes the entire expected object/i);
});

test('install admission documentation keeps the release, plan, fact, and byte bindings distinct', async () => {
  const content = await read('docs/operations/RELEASE-BOUND-INSTALL-INPUT-ADMISSION.md');
  for (const concept of [
    'signed release manifest',
    'host-plan digest',
    'host-facts digest',
    'artifact[_-]set(?:_| )digest',
    'admission digest'
  ]) {
    assert.match(content, new RegExp(concept, 'i'));
  }
});