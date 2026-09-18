import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const moduleUrl = new URL('../src/lib/research-capsule-contracts.mjs', import.meta.url);
const fixtureUrl = new URL('../fixtures/research-capsules/research-capsule-v0.vectors.json', import.meta.url);
const schemaUrls = [
  new URL('../../docs/architecture/contracts/research-source-manifest.v0.schema.json', import.meta.url),
  new URL('../../docs/architecture/contracts/research-knowledge-projection.v0.schema.json', import.meta.url),
  new URL('../../docs/architecture/contracts/research-operation-candidate.v0.schema.json', import.meta.url),
  new URL('../../docs/architecture/contracts/research-reproduction-evidence.v0.schema.json', import.meta.url)
];

function materializeCase(raw, api) {
  const sourceManifest = {
    ...raw.source_manifest,
    manifest_digest: api.researchContractDigest(raw.source_manifest, 'manifest_digest')
  };

  const knowledgeBase = {
    ...raw.knowledge_projection,
    source_manifest_digest: sourceManifest.manifest_digest
  };
  const knowledgeProjection = {
    ...knowledgeBase,
    projection_digest: api.researchContractDigest(knowledgeBase, 'projection_digest')
  };

  let operationCandidate = null;
  if (raw.operation) {
    const operationBase = {
      ...raw.operation,
      source_manifest_digest: sourceManifest.manifest_digest
    };
    operationCandidate = {
      ...operationBase,
      operation_digest: api.researchContractDigest(operationBase, 'operation_digest')
    };
  }

  let reproductionEvidence = null;
  if (raw.reproduction) {
    const reproductionBase = {
      ...raw.reproduction,
      source_manifest_digest: sourceManifest.manifest_digest,
      operation_digest: operationCandidate.operation_digest
    };
    reproductionEvidence = {
      ...reproductionBase,
      evidence_digest: api.researchContractDigest(reproductionBase, 'evidence_digest')
    };
  }

  return {
    ...raw,
    source_manifest: sourceManifest,
    knowledge_projection: knowledgeProjection,
    operation: operationCandidate,
    reproduction: reproductionEvidence
  };
}

test('Research Capsule v0 contracts are closed, provenance-bound, and non-authorizing', async () => {
  assert.equal(existsSync(moduleUrl), true, 'Research Capsule v0 verifier is not implemented');

  for (const url of schemaUrls) {
    assert.equal(existsSync(url), true, `missing Research Capsule schema: ${url.pathname}`);
  }

  const api = await import(moduleUrl.href);
  assert.equal(api.RESEARCH_SOURCE_MANIFEST_SCHEMA, 'axiom-research-source-manifest.v0');
  assert.equal(api.RESEARCH_KNOWLEDGE_PROJECTION_SCHEMA, 'axiom-research-knowledge-projection.v0');
  assert.equal(api.RESEARCH_OPERATION_CANDIDATE_SCHEMA, 'axiom-research-operation-candidate.v0');
  assert.equal(api.RESEARCH_REPRODUCTION_EVIDENCE_SCHEMA, 'axiom-research-reproduction-evidence.v0');

  const vectors = JSON.parse(await readFile(fixtureUrl, 'utf8'));
  assert.equal(vectors.schema, 'axiom-research-capsule-test-vectors.v0');
  assert.deepEqual(vectors.cases.map(item => item.id), [
    'executable-paper',
    'resource-only-paper',
    'stale-repository',
    'malicious-source-instruction'
  ]);

  const cases = new Map(vectors.cases.map(raw => [raw.id, materializeCase(raw, api)]));
  const executable = cases.get('executable-paper');
  const resourceOnly = cases.get('resource-only-paper');
  const stale = cases.get('stale-repository');
  const malicious = cases.get('malicious-source-instruction');

  assert.equal(api.verifyResearchSourceManifest(executable.source_manifest).currentness_state, 'current');
  assert.equal(api.verifyResearchKnowledgeProjection(executable.knowledge_projection).entries.length, 1);
  assert.equal(api.verifyResearchOperationCandidate(executable.operation).execution_authority, 'none');
  assert.equal(api.verifyResearchOperationCandidate(executable.operation).adapter_kind, 'paper2agent_mcp_metadata_v0');
  assert.equal(api.verifyResearchReproductionEvidence(executable.reproduction).disposition, 'pass');
  assert.equal(executable.reproduction.truth_established, false);
  assert.equal(executable.reproduction.authority_effect, 'none');

  assert.equal(api.verifyResearchSourceManifest(resourceOnly.source_manifest).manifest_id, 'research:resource-only:example');
  assert.equal(api.verifyResearchKnowledgeProjection(resourceOnly.knowledge_projection).entries[0].entry_kind, 'source_statement');
  assert.equal(resourceOnly.operation, null);
  assert.equal(resourceOnly.reproduction, null);

  assert.equal(api.verifyResearchSourceManifest(stale.source_manifest).currentness_state, 'stale_revision');
  assert.equal(api.verifyResearchReproductionEvidence(stale.reproduction).source_revision, 'old-pinned-revision');
  assert.match(stale.reproduction.claim_scope, /Historical reproduction/);

  const maliciousProjection = api.verifyResearchKnowledgeProjection(malicious.knowledge_projection);
  assert.match(maliciousProjection.entries[0].summary, /Ignore previous instructions/);
  assert.equal(maliciousProjection.entries[0].instruction_authority, 'none');

  assert.throws(
    () => api.verifyResearchSourceManifest({ ...executable.source_manifest, authorize: true }),
    /unsupported field/
  );
  assert.throws(
    () => api.verifyResearchOperationCandidate({ ...executable.operation, execution_authority: 'granted' }),
    /execution_authority/
  );
  assert.throws(
    () => api.verifyResearchReproductionEvidence({ ...executable.reproduction, truth_established: true }),
    /truth_established/
  );
  assert.throws(
    () => api.verifyResearchReproductionEvidence({ ...executable.reproduction, authority_effect: 'execute' }),
    /authority_effect/
  );
  assert.throws(
    () => api.verifyResearchKnowledgeProjection({
      ...malicious.knowledge_projection,
      entries: [{ ...malicious.knowledge_projection.entries[0], instruction_authority: 'system' }]
    }),
    /instruction_authority/
  );
  assert.throws(
    () => api.verifyResearchSourceManifest({
      ...executable.source_manifest,
      manifest_digest: 'sha256:0000000000000000000000000000000000000000000000000000000000000000'
    }),
    /digest/
  );
});
