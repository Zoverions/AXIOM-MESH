import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const moduleUrl = new URL('../src/lib/axiom-science-contracts.mjs', import.meta.url);
const fixtureUrl = new URL('../fixtures/axiom-science/axiom-science-v0.vectors.json', import.meta.url);
const studySchemaUrl = new URL('../../docs/architecture/contracts/axiom-science-study.v0.schema.json', import.meta.url);
const proposalSchemaUrl = new URL('../../docs/architecture/contracts/axiom-science-experiment-proposal.v0.schema.json', import.meta.url);

test('Axiom Science S0 verifier exists before contract checks run', async () => {
  assert.equal(existsSync(moduleUrl), true, 'Axiom Science S0 verifier is not implemented');
  const vectors = JSON.parse(await readFile(fixtureUrl, 'utf8'));
  assert.equal(vectors.schema, 'axiom-science-test-vectors.v0');
});
