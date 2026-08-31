import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

const SCHEMAS = Object.freeze([
  {
    name: 'source',
    url: new URL(
      '../../docs/architecture/contracts/discovery-source-envelope.v0.schema.json',
      import.meta.url
    ),
    schema: 'axiom-discovery-source-envelope.v0',
    fullBoundary: true
  },
  {
    name: 'candidate',
    url: new URL(
      '../../docs/architecture/contracts/discovery-insight-candidate.v0.schema.json',
      import.meta.url
    ),
    schema: 'axiom-discovery-insight-candidate.v0',
    fullBoundary: true
  },
  {
    name: 'blindspot',
    url: new URL(
      '../../docs/architecture/contracts/blindspot-record.v0.schema.json',
      import.meta.url
    ),
    schema: 'axiom-blindspot-record.v0',
    fullBoundary: true
  },
  {
    name: 'impact',
    url: new URL(
      '../../docs/architecture/contracts/architecture-impact-record.v0.schema.json',
      import.meta.url
    ),
    schema: 'axiom-architecture-impact-record.v0',
    fullBoundary: true
  },
  {
    name: 'disposition',
    url: new URL(
      '../../docs/architecture/contracts/discovery-review-disposition.v0.schema.json',
      import.meta.url
    ),
    schema: 'axiom-discovery-review-disposition.v0',
    fullBoundary: false
  }
]);

function load(url) {
  return JSON.parse(readFileSync(url, 'utf8'));
}

test('DCF JSON schemas are closed JSON Schema 2020-12 contracts', () => {
  for (const entry of SCHEMAS) {
    const schema = load(entry.url);
    assert.equal(schema.$schema, 'https://json-schema.org/draft/2020-12/schema');
    assert.equal(schema.type, 'object');
    assert.equal(schema.additionalProperties, false);
    assert.equal(schema.properties.schema.const, entry.schema);
    assert.equal(schema.properties.authority_effect.const, 'none');

    if (entry.fullBoundary) {
      assert.equal(schema.properties.runtime_effect.const, 'none');
      assert.equal(schema.properties.capability_promotion.const, false);
      assert.equal(schema.properties.canonical_truth_effect.const, 'none');
      assert.equal(schema.properties.mutation_effect.const, 'none');
    }
  }
});

test('architecture impact schema cannot claim implementation authorization', () => {
  const impact = load(SCHEMAS.find(entry => entry.name === 'impact').url);
  assert.equal(impact.properties.implementation_status.const, 'not-authorized');
});

test('review disposition exposes only proposal decisions and no authority effect', () => {
  const disposition = load(SCHEMAS.find(entry => entry.name === 'disposition').url);
  assert.deepEqual(disposition.properties.decision.enum, [
    'reject',
    'archive',
    'monitor',
    'request-more-evidence',
    'create-test-proposal',
    'create-rfc-proposal',
    'threat-model-proposal',
    'ui-design-proposal',
    'implementation-proposal'
  ]);
  assert.equal(disposition.properties.authority_effect.const, 'none');
});
