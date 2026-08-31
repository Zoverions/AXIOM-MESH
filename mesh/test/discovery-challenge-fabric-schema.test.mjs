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
    schema: 'axiom-discovery-source-envelope.v0'
  },
  {
    name: 'candidate',
    url: new URL(
      '../../docs/architecture/contracts/discovery-insight-candidate.v0.schema.json',
      import.meta.url
    ),
    schema: 'axiom-discovery-insight-candidate.v0'
  },
  {
    name: 'blindspot',
    url: new URL(
      '../../docs/architecture/contracts/blindspot-record.v0.schema.json',
      import.meta.url
    ),
    schema: 'axiom-blindspot-record.v0'
  },
  {
    name: 'impact',
    url: new URL(
      '../../docs/architecture/contracts/architecture-impact-record.v0.schema.json',
      import.meta.url
    ),
    schema: 'axiom-architecture-impact-record.v0'
  },
  {
    name: 'disposition',
    url: new URL(
      '../../docs/architecture/contracts/discovery-review-disposition.v0.schema.json',
      import.meta.url
    ),
    schema: 'axiom-discovery-review-disposition.v0'
  }
]);

function load(url) {
  return JSON.parse(readFileSync(url, 'utf8'));
}

function schemaNamed(name) {
  return load(SCHEMAS.find(entry => entry.name === name).url);
}

test('DCF JSON schemas are closed JSON Schema 2020-12 zero-authority contracts', () => {
  for (const entry of SCHEMAS) {
    const schema = load(entry.url);
    assert.equal(schema.$schema, 'https://json-schema.org/draft/2020-12/schema');
    assert.equal(schema.type, 'object');
    assert.equal(schema.additionalProperties, false);
    assert.equal(schema.properties.schema.const, entry.schema);
    assert.equal(schema.properties.authority_effect.const, 'none');
    assert.equal(schema.properties.runtime_effect.const, 'none');
    assert.equal(schema.properties.capability_promotion.const, false);
    assert.equal(schema.properties.canonical_truth_effect.const, 'none');
    assert.equal(schema.properties.mutation_effect.const, 'none');
  }
});

test('source schema mirrors provenance, lineage, evidence, sensitivity, and hard-boundary fields', () => {
  const source = schemaNamed('source');
  assert.deepEqual(source.properties.source_class.enum, [
    'formal',
    'empirical',
    'frontier',
    'expert-hypothesis',
    'practitioner',
    'community',
    'adjacent-domain'
  ]);
  assert.deepEqual(source.properties.evidence_status.enum, [
    'observed',
    'fetched',
    'reproduced',
    'independently-verified',
    'unverified'
  ]);
  assert.deepEqual(source.properties.sensitivity.enum, [
    'public',
    'restricted',
    'private-security'
  ]);
  for (const field of [
    'source_id',
    'captured_at',
    'source_class',
    'title',
    'locator',
    'publisher_or_origin',
    'published_at',
    'content_digest',
    'upstream_refs',
    'evidence_status',
    'sensitivity',
    'notes',
    'authority_effect',
    'runtime_effect',
    'capability_promotion',
    'canonical_truth_effect',
    'mutation_effect'
  ]) assert.ok(source.required.includes(field), field);
});

test('candidate schema keeps claim dimensions separate and supports suspicion decomposition', () => {
  const candidate = schemaNamed('candidate');
  assert.deepEqual(candidate.properties.candidate_type.enum, [
    'finding',
    'hypothesis',
    'contradiction',
    'negative-result',
    'standard-change',
    'incident-pattern',
    'architecture-analogy',
    'ui-human-factors',
    'open-question'
  ]);
  assert.deepEqual(candidate.properties.evidence_strength.enum, [
    'weak', 'moderate', 'strong', 'mixed', 'unknown'
  ]);
  assert.deepEqual(candidate.properties.claim_confidence.enum, [
    'low', 'medium', 'high', 'unknown'
  ]);
  assert.deepEqual(candidate.properties.novelty_status.enum, [
    'already-covered', 'stronger-evidence', 'partially-new', 'materially-new', 'unknown'
  ]);

  const suspicion = candidate.properties.suspicion_decomposition;
  assert.equal(suspicion.type, 'object');
  assert.equal(suspicion.additionalProperties, false);
  assert.deepEqual(suspicion.required, [
    'observation',
    'incentive',
    'capability',
    'opportunity',
    'preparation',
    'response',
    'causation'
  ]);
  for (const lane of suspicion.required) {
    assert.deepEqual(suspicion.properties[lane].properties.status.enum, [
      'supported', 'mixed', 'unsupported', 'unknown'
    ]);
  }

  const openness = candidate.properties.adversarial_openness;
  assert.equal(openness.type, 'object');
  assert.equal(openness.additionalProperties, false);
  assert.deepEqual(openness.properties.confidence_update.enum, [
    'increased', 'decreased', 'unchanged', 'unknown'
  ]);
});

test('blindspot and impact schemas preserve explicit classes rather than implied trust or authority', () => {
  const blindspot = schemaNamed('blindspot');
  assert.deepEqual(blindspot.properties.blindspot_class.enum, [
    'unknown',
    'assumption',
    'contradiction',
    'unowned-boundary',
    'unmodelled-threat',
    'unmodelled-user',
    'unmodelled-environment',
    'missing-standard',
    'missing-test',
    'missing-ui',
    'unknown-unknown-candidate'
  ]);
  assert.ok(blindspot.properties.affected_domain.enum.includes('protocol'));
  assert.ok(blindspot.properties.affected_domain.enum.includes('ui'));
  assert.ok(blindspot.properties.affected_domain.enum.includes('physical'));

  const impact = schemaNamed('impact');
  assert.equal(impact.properties.implementation_status.const, 'not-authorized');
  assert.deepEqual(impact.properties.impact_class.items.enum, [
    'no-change',
    'documentation',
    'threat-model',
    'test',
    'contract',
    'runtime-design',
    'ui',
    'recovery',
    'policy',
    'capability-candidate',
    'research-needed'
  ]);
});

test('review disposition exposes proposal decisions while retaining all zero-effect boundaries', () => {
  const disposition = schemaNamed('disposition');
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
  for (const field of [
    'disposition_id',
    'impact_ref',
    'reviewer_identity',
    'reviewed_at',
    'decision',
    'rationale',
    'next_locator',
    'authority_effect',
    'runtime_effect',
    'capability_promotion',
    'canonical_truth_effect',
    'mutation_effect'
  ]) assert.ok(disposition.required.includes(field), field);
});
