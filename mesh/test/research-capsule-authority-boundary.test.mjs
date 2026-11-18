import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  researchContractDigest,
  verifyResearchKnowledgeProjection,
  verifyResearchSourceManifest
} from '../src/lib/research-capsule-contracts.mjs';

const moduleUrl = new URL('../src/lib/research-capsule-contracts.mjs', import.meta.url);
const fixtureUrl = new URL('../fixtures/research-capsules/research-capsule-v0.vectors.json', import.meta.url);
const schemaUrls = [
  new URL('../../docs/architecture/contracts/research-source-manifest.v0.schema.json', import.meta.url),
  new URL('../../docs/architecture/contracts/research-knowledge-projection.v0.schema.json', import.meta.url),
  new URL('../../docs/architecture/contracts/research-operation-candidate.v0.schema.json', import.meta.url),
  new URL('../../docs/architecture/contracts/research-reproduction-evidence.v0.schema.json', import.meta.url)
];

function materializeManifest(raw) {
  return {
    ...raw,
    manifest_digest: researchContractDigest(raw, 'manifest_digest')
  };
}

function materializeProjection(raw, manifestDigest) {
  const base = {
    ...raw,
    source_manifest_digest: manifestDigest
  };
  return {
    ...base,
    projection_digest: researchContractDigest(base, 'projection_digest')
  };
}

test('Research Capsule v0 contains no live effect or network imports', async () => {
  const source = await readFile(moduleUrl, 'utf8');
  for (const forbidden of [
    'node:child_process',
    'node:net',
    'node:http',
    'node:https',
    'node:dns',
    'node:tls',
    'process.env',
    'capabilities.json'
  ]) {
    assert.equal(source.includes(forbidden), false, `research capsule verifier contains ${forbidden}`);
  }
});

test('Research Capsule schemas do not expose authority-bearing output fields', async () => {
  for (const url of schemaUrls) {
    const text = await readFile(url, 'utf8');
    for (const forbidden of [
      'bearer_token',
      'credential_value',
      'mint_capability',
      'execute_action',
      'policy_patch',
      'merge_authorized',
      'deployment_authorized'
    ]) {
      assert.equal(text.includes(forbidden), false, `${url.pathname} exposes ${forbidden}`);
    }
  }
});

test('instruction-like research content remains data with no instruction authority', async () => {
  const vectors = JSON.parse(await readFile(fixtureUrl, 'utf8'));
  const raw = vectors.cases.find(item => item.id === 'malicious-source-instruction');
  assert.ok(raw);

  const manifest = verifyResearchSourceManifest(materializeManifest(raw.source_manifest));
  const projection = verifyResearchKnowledgeProjection(
    materializeProjection(raw.knowledge_projection, manifest.manifest_digest)
  );

  assert.match(projection.entries[0].summary, /Ignore previous instructions/);
  assert.equal(projection.entries[0].instruction_authority, 'none');
});

test('missing executable artifacts are a valid resource-only research state', async () => {
  const vectors = JSON.parse(await readFile(fixtureUrl, 'utf8'));
  const raw = vectors.cases.find(item => item.id === 'resource-only-paper');
  assert.ok(raw);

  const manifest = verifyResearchSourceManifest(materializeManifest(raw.source_manifest));
  const projection = verifyResearchKnowledgeProjection(
    materializeProjection(raw.knowledge_projection, manifest.manifest_digest)
  );

  assert.equal(manifest.currentness_state, 'current');
  assert.equal(projection.entries.length, 1);
  assert.equal(raw.operation, null);
  assert.equal(raw.reproduction, null);
});
