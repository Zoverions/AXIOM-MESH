import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const moduleUrl = new URL('../src/lib/research-capsule-contracts.mjs', import.meta.url);
const fixtureUrl = new URL(
  '../fixtures/research-capsules/research-claim-adjudication-v0.vectors.json',
  import.meta.url
);

function materializeCase(raw, api) {
  const sourceManifest = {
    ...raw.source_manifest,
    manifest_digest: api.researchContractDigest(raw.source_manifest, 'manifest_digest')
  };

  const projectionBase = {
    ...raw.knowledge_projection,
    source_manifest_digest: sourceManifest.manifest_digest
  };
  const knowledgeProjection = {
    ...projectionBase,
    projection_digest: api.researchContractDigest(projectionBase, 'projection_digest')
  };

  const entry = knowledgeProjection.entries[0];
  const adjudicationBase = {
    ...raw.adjudication,
    source_manifest_digest: sourceManifest.manifest_digest,
    knowledge_projection_digest: knowledgeProjection.projection_digest,
    entry_id: entry.entry_id,
    entry_content_digest: entry.content_digest
  };
  const adjudication = {
    ...adjudicationBase,
    adjudication_digest: api.researchContractDigest(adjudicationBase, 'adjudication_digest')
  };

  return {
    source_manifest: sourceManifest,
    knowledge_projection: knowledgeProjection,
    adjudication
  };
}

function redigest(adjudication, api) {
  const copy = { ...adjudication };
  delete copy.adjudication_digest;
  return {
    ...copy,
    adjudication_digest: api.researchContractDigest(copy, 'adjudication_digest')
  };
}

test('Research Claim Adjudication v0 preserves incorrect source statements while binding corrections as non-authorizing evidence', async () => {
  const api = await import(moduleUrl.href);
  assert.equal(
    typeof api.verifyResearchClaimAdjudication,
    'function',
    'Research Claim Adjudication v0 verifier is not implemented'
  );
  assert.equal(
    typeof api.verifyResearchClaimAdjudicationBinding,
    'function',
    'Research Claim Adjudication v0 binding verifier is not implemented'
  );
  assert.equal(api.RESEARCH_CLAIM_ADJUDICATION_SCHEMA, 'axiom-research-claim-adjudication.v0');

  const vectors = JSON.parse(await readFile(fixtureUrl, 'utf8'));
  assert.equal(vectors.schema, 'axiom-research-claim-adjudication-test-vectors.v0');
  assert.deepEqual(vectors.cases.map(item => item.id), ['benign-math-source-corrected']);

  const fixture = materializeCase(vectors.cases[0], api);
  const originalProjection = JSON.stringify(fixture.knowledge_projection);
  const originalSummary = fixture.knowledge_projection.entries[0].summary;

  const verified = api.verifyResearchClaimAdjudication(fixture.adjudication);
  assert.equal(verified.status, 'corrected');
  assert.equal(verified.source_statement_mutation, 'none');
  assert.equal(verified.truth_established, false);
  assert.equal(verified.instruction_authority, 'none');
  assert.equal(verified.authority_effect, 'none');
  assert.match(verified.correction_summary, /gradient descent/);

  const bound = api.verifyResearchClaimAdjudicationBinding(
    fixture.adjudication,
    fixture.knowledge_projection,
    fixture.source_manifest
  );
  assert.equal(bound.adjudication_id, fixture.adjudication.adjudication_id);
  assert.equal(JSON.stringify(fixture.knowledge_projection), originalProjection);
  assert.equal(
    fixture.knowledge_projection.entries[0].summary,
    'Stepping in the direction opposite the gradient is an algorithm for maximizing the objective.'
  );
  assert.equal(fixture.knowledge_projection.entries[0].summary, originalSummary);

  const sourceManifestBase = {
    ...fixture.source_manifest,
    manifest_id: 'research:math-roadmap:substituted'
  };
  delete sourceManifestBase.manifest_digest;
  const substitutedSourceManifest = {
    ...sourceManifestBase,
    manifest_digest: api.researchContractDigest(sourceManifestBase, 'manifest_digest')
  };
  assert.throws(
    () => api.verifyResearchClaimAdjudicationBinding(
      fixture.adjudication,
      fixture.knowledge_projection,
      substitutedSourceManifest
    ),
    /source manifest.*binding|manifest digest.*binding/i
  );

  assert.throws(
    () => api.verifyResearchClaimAdjudicationBinding(
      redigest({
        ...fixture.adjudication,
        entry_content_digest: 'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
      }, api),
      fixture.knowledge_projection,
      fixture.source_manifest
    ),
    /entry.*content.*digest|content.*digest.*binding/i
  );

  assert.throws(
    () => api.verifyResearchClaimAdjudicationBinding(
      redigest({
        ...fixture.adjudication,
        knowledge_projection_digest: 'sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'
      }, api),
      fixture.knowledge_projection,
      fixture.source_manifest
    ),
    /projection.*digest|digest.*binding/i
  );

  assert.throws(
    () => api.verifyResearchClaimAdjudicationBinding(
      redigest({ ...fixture.adjudication, entry_id: 'entry:missing' }, api),
      fixture.knowledge_projection,
      fixture.source_manifest
    ),
    /entry.*not found|entry.*binding/i
  );

  assert.throws(
    () => api.verifyResearchClaimAdjudication({
      ...fixture.adjudication,
      replacement_source_text: 'Corrected replacement source text.'
    }),
    /unsupported field/
  );

  assert.throws(
    () => api.verifyResearchClaimAdjudication(
      redigest({ ...fixture.adjudication, truth_established: true }, api)
    ),
    /truth_established/
  );

  assert.throws(
    () => api.verifyResearchClaimAdjudication(
      redigest({ ...fixture.adjudication, instruction_authority: 'system' }, api)
    ),
    /instruction_authority/
  );

  assert.throws(
    () => api.verifyResearchClaimAdjudication(
      redigest({ ...fixture.adjudication, authority_effect: 'execute' }, api)
    ),
    /authority_effect/
  );

  assert.throws(
    () => api.verifyResearchClaimAdjudication(
      redigest({ ...fixture.adjudication, source_statement_mutation: 'replace' }, api)
    ),
    /source_statement_mutation/
  );

  assert.throws(
    () => api.verifyResearchClaimAdjudication(
      redigest({ ...fixture.adjudication, correction_summary: null }, api)
    ),
    /correction_summary/
  );

  assert.throws(
    () => api.verifyResearchClaimAdjudication(
      redigest({ ...fixture.adjudication, status: 'true' }, api)
    ),
    /status/
  );

  assert.throws(
    () => api.verifyResearchClaimAdjudication(
      redigest({
        ...fixture.adjudication,
        evidence_refs: [],
        evidence_digests: []
      }, api)
    ),
    /evidence/
  );

  assert.throws(
    () => api.verifyResearchClaimAdjudication({
      ...fixture.adjudication,
      adjudication_digest: 'sha256:0000000000000000000000000000000000000000000000000000000000000000'
    }),
    /digest/
  );
});
