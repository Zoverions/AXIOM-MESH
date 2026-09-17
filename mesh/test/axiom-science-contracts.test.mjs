import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const moduleUrl = new URL('../src/lib/axiom-science-contracts.mjs', import.meta.url);
const fixtureUrl = new URL('../fixtures/axiom-science/axiom-science-v0.vectors.json', import.meta.url);
const studySchemaUrl = new URL('../../docs/architecture/contracts/axiom-science-study.v0.schema.json', import.meta.url);
const proposalSchemaUrl = new URL('../../docs/architecture/contracts/axiom-science-experiment-proposal.v0.schema.json', import.meta.url);

// Deliberate RED: production verifier is intentionally absent at this checkpoint.
test('Axiom Science S0 verifier exists before contract checks run', async () => {
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

  const vectors = JSON.parse(await readFile(fixtureUrl, 'utf8'));
  assert.equal(vectors.schema, 'axiom-science-test-vectors.v0');
});
