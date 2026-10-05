import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const gateUrl = new URL('../../agent-commons/research-relevance-resource-gate.v1.json', import.meta.url);

test('research gate treats transparency as a trust-critical override', async () => {
  const gate = JSON.parse(await readFile(gateUrl, 'utf8'));
  const ids = new Set(gate.categories.map(({ id }) => id));
  assert.ok(ids.has('reimplement_for_trust'));
  assert.ok(gate.evaluation_dimensions.includes('transparency'));
  assert.ok(gate.evaluation_dimensions.includes('independent verifiability'));
  assert.equal(gate.evidence_requirements.transparency_assessment, true);
  assert.equal(gate.evidence_requirements.independent_verification_assessment, true);
  assert.match(gate.trust_transparency_override.principle, /independently inspectable trust/i);
});

test('research gate prefers transparency repair before reimplementation', async () => {
  const gate = JSON.parse(await readFile(gateUrl, 'utf8'));
  assert.deepEqual(gate.trust_transparency_override.preferred_response_order.slice(0, 3), [
    'request/publish missing transparency',
    'add independent verification or evidence adapter',
    'use an open compatible alternative'
  ]);
  assert.equal(
    gate.trust_transparency_override.preferred_response_order.at(-1),
    'reimplement only the minimum trust-critical surface when justified'
  );
});
