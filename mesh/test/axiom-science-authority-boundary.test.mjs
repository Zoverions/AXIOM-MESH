import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const moduleUrl = new URL('../src/lib/axiom-science-contracts.mjs', import.meta.url);
const fixtureUrl = new URL('../fixtures/axiom-science/axiom-science-v0.vectors.json', import.meta.url);
const studySchemaUrl = new URL('../../docs/architecture/contracts/axiom-science-study.v0.schema.json', import.meta.url);
const proposalSchemaUrl = new URL('../../docs/architecture/contracts/axiom-science-experiment-proposal.v0.schema.json', import.meta.url);

function finalizeRawScienceCase(raw, api) {
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
  return { study, proposal };
}

test('Axiom Science S0 exposes no alternate authority or effect surface', async () => {
  const source = await readFile(moduleUrl, 'utf8');
  for (const forbidden of [
    'node:child_process',
    'node:net',
    'node:http',
    'node:https',
    'node:dns',
    'node:tls',
    'process.env',
    'capabilities.json',
    'Gateway',
    'Hypervisor',
    'Sandbox',
    'Grid'
  ]) {
    assert.equal(source.includes(forbidden), false, `unexpected effect surface token: ${forbidden}`);
  }
  assert.match(source, /from '\.\/canonical\.mjs'/);
  assert.equal(source.includes('createHash('), false, 'Axiom Science must reuse canonical.mjs hashing');

  const schemaText = `${await readFile(studySchemaUrl, 'utf8')}\n${await readFile(proposalSchemaUrl, 'utf8')}`;
  for (const forbiddenField of [
    'bearer_token',
    'credential_value',
    'mint_capability',
    'grant_authority',
    'execute_action',
    'merge_authorized',
    'deployment_authorized',
    'global_truth'
  ]) {
    assert.equal(schemaText.includes(forbiddenField), false, `unexpected authority field: ${forbiddenField}`);
  }

  const api = await import(moduleUrl.href);
  assert.deepEqual(Object.keys(api).sort(), [
    'AXIOM_SCIENCE_EXPERIMENT_PROPOSAL_SCHEMA',
    'AXIOM_SCIENCE_STUDY_SCHEMA',
    'scienceContractDigest',
    'verifyScienceExperimentProposal',
    'verifyScienceStudy'
  ]);

  const vectors = JSON.parse(await readFile(fixtureUrl, 'utf8'));
  const computational = finalizeRawScienceCase(
    vectors.cases.find(item => item.id === 'computational-hypothesis'),
    api
  );
  const unknown = finalizeRawScienceCase(
    vectors.cases.find(item => item.id === 'explicit-unknown-requirements'),
    api
  );

  assert.equal(api.verifyScienceStudy(computational.study).authority_effect, 'none');
  assert.equal(api.verifyScienceExperimentProposal(computational.proposal).execution_authority, 'none');
  assert.equal(api.verifyScienceExperimentProposal(unknown.proposal).declared_effect_classes.includes('unknown'), true);

  assert.throws(
    () => api.verifyScienceExperimentProposal({ ...computational.proposal, execution_authority: 'granted' }),
    /execution_authority/
  );
  assert.throws(
    () => api.verifyScienceExperimentProposal({ ...computational.proposal, authority_effect: 'execute' }),
    /authority_effect/
  );
  assert.throws(
    () => api.verifyScienceExperimentProposal({ ...computational.proposal, grant_authority: true }),
    /unsupported field/
  );
  assert.throws(
    () => api.verifyScienceStudy({ ...computational.study, global_truth: true }),
    /unsupported field/
  );
});
