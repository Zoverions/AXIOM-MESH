import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  finalizeEpistemicProposal,
  validateEpistemicProposal
} from '../src/lib/epistemic-contracts.mjs';
import {
  researchContractDigest,
  verifyResearchOperationCandidate,
  verifyResearchSourceManifest
} from '../src/lib/research-capsule-contracts.mjs';

const moduleUrl = new URL('../src/lib/axiom-science-contracts.mjs', import.meta.url);
const fixtureUrl = new URL('../fixtures/axiom-science/axiom-science-v0.vectors.json', import.meta.url);
const researchFixtureUrl = new URL('../fixtures/research-capsules/research-capsule-v0.vectors.json', import.meta.url);
const studySchemaUrl = new URL('../../docs/architecture/contracts/axiom-science-study.v0.schema.json', import.meta.url);
const proposalSchemaUrl = new URL('../../docs/architecture/contracts/axiom-science-experiment-proposal.v0.schema.json', import.meta.url);

function materializeResearchCase(raw) {
  const sourceBase = { ...raw.source_manifest };
  const sourceManifest = {
    ...sourceBase,
    manifest_digest: researchContractDigest(sourceBase, 'manifest_digest')
  };
  verifyResearchSourceManifest(sourceManifest);

  let operationCandidate = null;
  if (raw.operation) {
    const operationBase = {
      ...raw.operation,
      source_manifest_digest: sourceManifest.manifest_digest
    };
    operationCandidate = {
      ...operationBase,
      operation_digest: researchContractDigest(operationBase, 'operation_digest')
    };
    verifyResearchOperationCandidate(operationCandidate);
  }

  return { sourceManifest, operationCandidate };
}

function finalizeScienceCase(raw, researchRaw, api) {
  const hypothesis = finalizeEpistemicProposal(raw.hypothesis_claim);
  assert.equal(validateEpistemicProposal(hypothesis).claim_kind, 'hypothesis');

  const research = materializeResearchCase(researchRaw);
  const studyBase = {
    ...raw.study,
    source_manifest_digests: [research.sourceManifest.manifest_digest],
    epistemic_object_refs: [hypothesis.content_digest]
  };
  const study = {
    ...studyBase,
    study_digest: api.scienceContractDigest(studyBase, 'study_digest')
  };
  const proposalBase = {
    ...raw.proposal,
    study_digest: study.study_digest,
    hypothesis_claim_refs: [hypothesis.content_digest],
    operation_candidate_refs: research.operationCandidate
      ? [research.operationCandidate.operation_digest]
      : []
  };
  const proposal = {
    ...proposalBase,
    proposal_digest: api.scienceContractDigest(proposalBase, 'proposal_digest')
  };
  return { ...raw, hypothesis, research, study, proposal };
}

test('Axiom Science S0 contracts compose Research Capsule and Epistemic Fabric without authority', async () => {
  assert.equal(existsSync(moduleUrl), true, 'Axiom Science S0 verifier is not implemented');
  assert.equal(existsSync(studySchemaUrl), true, 'Science Study v0 schema is not implemented');
  assert.equal(existsSync(proposalSchemaUrl), true, 'Experiment Proposal v0 schema is not implemented');

  const studySchema = JSON.parse(await readFile(studySchemaUrl, 'utf8'));
  const proposalSchema = JSON.parse(await readFile(proposalSchemaUrl, 'utf8'));
  assert.equal(studySchema.properties.schema.const, 'axiom-science-study.v0');
  assert.equal(proposalSchema.properties.schema.const, 'axiom-science-experiment-proposal.v0');
  assert.equal(studySchema.properties.authority_effect.const, 'none');
  assert.equal(proposalSchema.properties.execution_authority.const, 'none');
  assert.equal(proposalSchema.properties.authority_effect.const, 'none');

  const api = await import(moduleUrl.href);
  assert.equal(api.AXIOM_SCIENCE_STUDY_SCHEMA, 'axiom-science-study.v0');
  assert.equal(api.AXIOM_SCIENCE_EXPERIMENT_PROPOSAL_SCHEMA, 'axiom-science-experiment-proposal.v0');

  const rawVectors = JSON.parse(await readFile(fixtureUrl, 'utf8'));
  const researchVectors = JSON.parse(await readFile(researchFixtureUrl, 'utf8'));
  assert.equal(rawVectors.schema, 'axiom-science-test-vectors.v0');
  assert.equal(researchVectors.schema, 'axiom-research-capsule-test-vectors.v0');
  assert.deepEqual(rawVectors.cases.map(item => item.id), [
    'computational-hypothesis',
    'resource-only-exploration',
    'explicit-unknown-requirements'
  ]);

  const researchById = new Map(researchVectors.cases.map(item => [item.id, item]));
  const cases = new Map(rawVectors.cases.map(raw => {
    const researchRaw = researchById.get(raw.research_capsule_case_id);
    assert.ok(researchRaw, `missing Research Capsule fixture ${raw.research_capsule_case_id}`);
    return [raw.id, finalizeScienceCase(raw, researchRaw, api)];
  }));
  const computational = cases.get('computational-hypothesis');
  const resourceOnly = cases.get('resource-only-exploration');
  const unknown = cases.get('explicit-unknown-requirements');

  assert.equal(computational.hypothesis.claim_kind, 'hypothesis');
  assert.deepEqual(computational.study.epistemic_object_refs, [computational.hypothesis.content_digest]);
  assert.deepEqual(computational.study.source_manifest_digests, [computational.research.sourceManifest.manifest_digest]);
  assert.deepEqual(computational.proposal.hypothesis_claim_refs, [computational.hypothesis.content_digest]);
  assert.deepEqual(computational.proposal.operation_candidate_refs, [computational.research.operationCandidate.operation_digest]);
  assert.equal(api.verifyScienceStudy(computational.study).authority_effect, 'none');
  assert.equal(api.verifyScienceExperimentProposal(computational.proposal).execution_authority, 'none');
  assert.equal(Object.hasOwn(computational.study, 'source_manifest'), false);
  assert.equal(Object.hasOwn(computational.proposal, 'operation_candidate'), false);

  assert.equal(resourceOnly.research.operationCandidate, null);
  assert.deepEqual(resourceOnly.proposal.operation_candidate_refs, []);
  assert.equal(api.verifyScienceExperimentProposal(resourceOnly.proposal).declared_effect_classes[0], 'read_only');

  assert.equal(unknown.research.sourceManifest.currentness_state, 'stale_revision');
  assert.equal(api.verifyScienceExperimentProposal(unknown.proposal).network_requirement, 'unknown');
  assert.deepEqual(unknown.proposal.declared_effect_classes, ['unknown']);

  assert.throws(
    () => api.verifyScienceStudy({ ...computational.study, authority_effect: 'execute' }),
    /authority_effect/
  );
  assert.throws(
    () => api.verifyScienceExperimentProposal({ ...computational.proposal, execution_authority: 'granted' }),
    /execution_authority/
  );
  assert.throws(
    () => api.verifyScienceExperimentProposal({ ...unknown.proposal, declared_effect_classes: ['read_only'] }),
    /unknown requirements/
  );
  assert.throws(
    () => api.verifyScienceExperimentProposal({ ...computational.proposal, grant_ref: 'grant:test' }),
    /unsupported field/
  );
  assert.throws(
    () => api.verifyScienceStudy({
      ...computational.study,
      study_digest: 'sha256:0000000000000000000000000000000000000000000000000000000000000000'
    }),
    /digest mismatch/
  );
});
