import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const schemaUrl = new URL('../config/bounded-decision-provider-profile-v0.schema.json', import.meta.url);

test('Bounded Decision Provider Profile v0 schema preserves inert zero-authority metadata', async () => {
  const schema = JSON.parse(await readFile(schemaUrl, 'utf8'));

  assert.equal(schema.$schema, 'https://json-schema.org/draft/2020-12/schema');
  assert.equal(schema.properties.schema.const, 'axiom-bounded-decision-provider-profile.v0');
  assert.equal(schema.properties.version.const, 0);
  assert.equal(schema.properties.status.const, 'inert-bounded-decision-metadata');
  assert.equal(schema.additionalProperties, false);

  assert.deepEqual(schema.properties.offering_revision_evidence.enum, [
    'exact-artifact', 'provider-versioned', 'mutable-alias', 'unknown'
  ]);
  assert.deepEqual(schema.properties.provider_mode.enum, [
    'owner-local', 'owner-remote', 'provider-remote', 'hybrid'
  ]);
  assert.deepEqual(schema.properties.supported_question_kinds.items.enum, [
    'choice', 'score', 'binary-probability'
  ]);
  assert.equal(schema.properties.supported_question_kinds.uniqueItems, true);
  assert.deepEqual(schema.properties.type_guarantee.enum, [
    'provider-native-closed-set', 'adapter-constrained', 'best-effort'
  ]);
  assert.deepEqual(schema.properties.probability_support.enum, [
    'full-distribution', 'binary-probability-only', 'confidence-only', 'none'
  ]);
  assert.deepEqual(schema.properties.latency_class.enum, [
    'local-fast', 'interactive', 'slow', 'batch', 'unknown'
  ]);
  assert.deepEqual(schema.properties.calibration_claim.enum, [
    'none', 'provider-claimed', 'local-experimental', 'local-reviewed'
  ]);

  assert.equal(schema.properties.max_questions_per_request.minimum, 1);
  assert.equal(schema.properties.max_questions_per_request.maximum, 1024);
  assert.equal(schema.properties.max_choice_cardinality.minimum, 2);
  assert.equal(schema.properties.max_choice_cardinality.maximum, 256);
  assert.equal(schema.properties.max_score_levels.minimum, 2);
  assert.equal(schema.properties.max_score_levels.maximum, 64);

  assert.equal(schema.properties.authority_effect.const, 'none');
  assert.equal(schema.properties.network_effect.const, 'none');
  assert.equal(schema.properties.credential_visibility.const, 'none');
  assert.equal(schema.properties.runtime_activation.const, false);
  assert.equal(schema.properties.selection_effect.const, 'eligibility-only');
  assert.equal(schema.properties.assurance_effect.const, 'none');

  assert.equal(
    schema['x-axiom-semantic-validator'],
    'mesh/src/lib/bounded-decision-provider-profile.mjs'
  );
  assert.ok(schema['x-axiom-semantic-rules'].some(rule => rule.includes('catalog')));
  assert.ok(schema['x-axiom-semantic-rules'].some(rule => rule.includes('network')));
  assert.ok(schema['x-axiom-semantic-rules'].some(rule => rule.includes('mutable-alias')));
  assert.deepEqual(schema['x-axiom-non-claims'], [
    'provider-availability',
    'provider-invocation',
    'credential-access',
    'network-egress',
    'semantic-correctness',
    'calibration-truth',
    'authority-grant',
    'assurance-promotion',
    'production-routing'
  ]);
});
