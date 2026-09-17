import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const moduleUrl = new URL('../src/lib/axiom-science-contracts.mjs', import.meta.url);
const fixtureUrl = new URL('../fixtures/axiom-science/axiom-science-v0.vectors.json', import.meta.url);
const studySchemaUrl = new URL('../../docs/architecture/contracts/axiom-science-study.v0.schema.json', import.meta.url);
const proposalSchemaUrl = new URL('../../docs/architecture/contracts/axiom-science-experiment-proposal.v0.schema.json', import.meta.url);

function finalizeScienceCase(raw, api) {
  const studyBase = { ...raw.study };
  const study = {
    ...studyBase,
    study_digest: api.scienceContractDigest(studyBase, 'study_digest')
  };
  const proposalBase = {
    ...raw.proposal,
    study_digest: study.study_digest
  };
  const proposal = {
    ...proposalBase,
    proposal_digest: api.scienceContractDigest(proposalBase, 'proposal_digest')
  };
  return { ...raw, study, proposal };
}

test('Axiom Science S0 contracts are closed, digest-bound, and non-authorizing', async () => {
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
  assert.equal(rawVectors.schema, 'axiom-science-test-vectors.v0');
  assert.deepEqual(rawVectors.cases.map(item => item.id), [
    'computational-hypothesis',
    'resource-only-exploration',
    'explicit-unknown-requirements'
  ]);

  const cases = new Map(rawVectors.cases.map(raw => [raw.id, finalizeScienceCase(raw, api)]));
  const computational = cases.get('computational-hypothesis');
  const resourceOnly = cases.get('resource-only-exploration');
  const unknown = cases.get('explicit-unknown-requirements');

  assert.equal(api.verifyScienceStudy(computational.study).authority_effect, 'none');
  assert.equal(api.verifyScienceExperimentProposal(computational.proposal).execution_authority, 'none');
  assert.equal(resourceOnly.proposal.operation_candidate_refs.length, 0);
  assert.equal(api.verifyScienceExperimentProposal(resourceOnly.proposal).declared_effect_classes[0], 'read_only');
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
