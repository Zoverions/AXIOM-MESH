import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../', import.meta.url);
const EPISTEMIC_CLASSES = [
  'observation',
  'clinical-record',
  'derived-feature',
  'model-hypothesis',
  'clinical-assessment',
  'diagnosis-assertion',
  'recommendation',
  'authorized-care-action-record'
];
const RELATIONSHIPS = [
  'derived-from',
  'supports',
  'contradicts',
  'supersedes-without-erasure',
  'corrects-without-erasure',
  'interprets',
  'reviews',
  'result-of',
  'authorized-by-record',
  'collected-from',
  'custody-successor'
];

async function schema(path) {
  return JSON.parse(await readFile(new URL(path, root), 'utf8'));
}

test('HealthEvidenceNode v0 schema is exact, inert, and epistemically typed', async () => {
  const document = await schema('config/health-evidence-node-v0.schema.json');
  assert.equal(document.$schema, 'https://json-schema.org/draft/2020-12/schema');
  assert.equal(document.additionalProperties, false);
  assert.equal(document.properties.schema.const, 'axiom-health-evidence-node.v0');
  assert.equal(document.properties.status.const, 'inert-health-evidence');
  assert.deepEqual(document.properties.epistemic_class.enum, EPISTEMIC_CLASSES);
  assert.equal(document.properties.contains_raw_health_data.const, false);
  assert.equal(document.properties.contains_secret_material.const, false);
  assert.equal(document.properties.authority_effect.const, 'none');
  assert.equal(document.properties.network_effect.const, 'none');
  assert.equal(document.properties.runtime_activation.const, false);
  assert.equal(document.properties.artifact.additionalProperties, false);
  assert.equal(Object.hasOwn(document.properties.artifact.properties, 'content'), false);
  assert.equal(Object.hasOwn(document.properties.artifact.properties, 'raw_content'), false);
});

test('HealthProvenanceEdge v0 schema is exact, inert, and relationship typed', async () => {
  const document = await schema('config/health-provenance-edge-v0.schema.json');
  assert.equal(document.$schema, 'https://json-schema.org/draft/2020-12/schema');
  assert.equal(document.additionalProperties, false);
  assert.equal(document.properties.schema.const, 'axiom-health-provenance-edge.v0');
  assert.equal(document.properties.status.const, 'inert-health-provenance-edge');
  assert.deepEqual(document.properties.relationship.enum, RELATIONSHIPS);
  assert.equal(document.properties.authority_effect.const, 'none');
  assert.equal(document.properties.network_effect.const, 'none');
  assert.equal(document.properties.runtime_activation.const, false);
});
