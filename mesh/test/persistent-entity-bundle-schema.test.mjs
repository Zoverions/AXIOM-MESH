import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const schemaUrl = new URL('../config/persistent-entity-bundle-v0.schema.json', import.meta.url);

const SCOPES = [
  'identity',
  'character',
  'personal_model_projection',
  'runtime_policy',
  'private_memory_ref',
  'private_artifact_ref',
  'skill_ref',
  'relationship_projection'
];

const NON_CLAIMS = [
  'credential-portability',
  'authority-portability',
  'standing-approval-portability',
  'runtime-activation',
  'machine-delegation',
  'server-bound-identity-portability',
  'canonical-embedding-portability',
  'production-machine-person'
];

test('Persistent Entity Bundle v0 schema preserves the inert portability boundary', async () => {
  const schema = JSON.parse(await readFile(schemaUrl, 'utf8'));
  assert.equal(schema.$schema, 'https://json-schema.org/draft/2020-12/schema');
  assert.equal(schema.properties.schema.const, 'axiom-persistent-entity-bundle.v0');
  assert.equal(schema.properties.version.const, 0);
  assert.equal(schema.properties.status.const, 'inert-portability-contract');
  assert.deepEqual(schema.properties.scopes.items.enum, SCOPES);
  assert.equal(schema.properties.created_at.format, 'date-time');
  assert.equal(schema.properties.authority_effect.const, 'none');
  assert.equal(schema.properties.network_effect.const, 'none');
  assert.equal(schema.properties.runtime_activation.const, false);
  assert.equal(schema.properties.credential_material.const, false);
  assert.equal(schema.additionalProperties, false);
  assert.equal(schema['x-axiom-semantic-validator'], 'mesh/src/lib/persistent-entity-bundle.mjs');
  assert.equal(schema['x-axiom-validation-requirement'], 'semantic-validator-required');
  assert.deepEqual(schema['x-axiom-non-claims'], NON_CLAIMS);
  assert.equal(schema.$defs.skill_ref.properties.disabled_by_default.const, true);
  assert.equal(schema.$defs.relationship_projection.properties.third_party_private_data.const, false);
  assert.deepEqual(schema['x-axiom-semantic-invariants'], [
    'declared scopes exactly match carried record kinds',
    'singleton record kinds occur at most once',
    'reference record identifiers are unique within their kind',
    'forbidden credential authority and implementation-lock-in field names are rejected recursively',
    'created_at calendar validity and canonical ISO round-trip are enforced by the semantic validator'
  ]);
});
