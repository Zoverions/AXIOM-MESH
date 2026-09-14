import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { evaluateThreatApplicability, verifyBuildFacts } from '../src/lib/threat-applicability.mjs';
import { normalizeOfflineThreatSource } from '../src/lib/threat-observation-normalizer.mjs';

const modules = [
  new URL('../src/lib/threat-intelligence-contracts.mjs', import.meta.url),
  new URL('../src/lib/threat-observation-normalizer.mjs', import.meta.url),
  new URL('../src/lib/threat-applicability.mjs', import.meta.url)
];
const forbiddenImports = [
  'node:child_process',
  'node:net',
  'node:http',
  'node:https',
  'node:dns',
  'node:tls'
];

test('A/B threat intelligence modules contain no live effect or network imports', async () => {
  for (const url of modules) {
    const source = await readFile(url, 'utf8');
    for (const forbidden of forbiddenImports) {
      assert.equal(source.includes(forbidden), false, `${url.pathname} imports ${forbidden}`);
    }
    assert.equal(source.includes('capabilities.json'), false);
    assert.equal(source.includes('process.env'), false);
  }
});

test('threat intelligence schemas do not expose authority-bearing output fields', async () => {
  const forbidden = [
    'bearer_token',
    'credential_value',
    'mint_capability',
    'execute_action',
    'policy_patch'
  ];
  for (const relative of [
    '../../docs/architecture/contracts/threat-observation.v0.schema.json',
    '../../docs/architecture/contracts/threat-hypothesis.v0.schema.json',
    '../../docs/architecture/contracts/reproduction-case.v0.schema.json',
    '../../docs/architecture/contracts/regression-candidate.v0.schema.json',
    '../../docs/architecture/contracts/threat-adaptation-receipt.v0.schema.json'
  ]) {
    const text = await readFile(new URL(relative, import.meta.url), 'utf8');
    for (const key of forbidden) {
      assert.equal(text.includes(key), false, `${relative} exposes ${key}`);
    }
  }
});

test('vendor observation cannot become a confirmed vulnerability or executable effect in A/B', async () => {
  const sourceFixture = JSON.parse(await readFile(
    new URL('../fixtures/threat-intelligence/anthropic-september-2026.normalized.v0.json', import.meta.url),
    'utf8'
  ));
  const buildFacts = verifyBuildFacts(JSON.parse(await readFile(
    new URL('../fixtures/threat-intelligence/axiom-build-facts.v0.json', import.meta.url),
    'utf8'
  )));
  const normalized = normalizeOfflineThreatSource(sourceFixture);
  const observation = normalized.observations.find(item =>
    item.observation_id === 'obs:anthropic:evaluation-credential-theft'
  );
  assert.ok(observation);

  const hypothesis = evaluateThreatApplicability({
    observation,
    buildFacts,
    hypothesisId: 'hyp:anthropic:evaluation-credential-theft',
    createdAt: '2026-09-10T21:00:00.000Z',
    reviewAt: '2026-10-10T21:00:00.000Z'
  });

  assert.ok(['plausible', 'not_applicable', 'unassessed'].includes(hypothesis.applicability_state));
  assert.notEqual(hypothesis.applicability_state, 'current_build_vulnerable');
  for (const forbidden of ['capability', 'authorize', 'execute', 'credential', 'policy_patch']) {
    assert.equal(Object.hasOwn(hypothesis, forbidden), false);
  }
});
