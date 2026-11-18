import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { validatePersistentEntityBundle } from '../src/lib/persistent-entity-bundle.mjs';

const schemaUrl = new URL('../config/persistent-entity-bundle-v0.schema.json', import.meta.url);

function minimalBundle(createdAt = '2026-09-17T20:00:00.000Z') {
  return {
    schema: 'axiom-persistent-entity-bundle.v0',
    version: 0,
    status: 'inert-portability-contract',
    bundle_id: 'bundle.calendar.parity',
    entity_ref: 'entity.calendar.parity',
    source_composition_digest: null,
    scopes: ['identity'],
    records: [
      { kind: 'identity', display_name: 'Calendar Parity', handle_intent: null }
    ],
    created_at: createdAt,
    authority_effect: 'none',
    network_effect: 'none',
    runtime_activation: false,
    credential_material: false
  };
}

test('schema requires semantic validation for calendar-valid canonical timestamps', async () => {
  const schema = JSON.parse(await readFile(schemaUrl, 'utf8'));

  assert.equal(schema.properties.created_at.format, 'date-time');
  assert.equal(schema['x-axiom-validation-requirement'], 'semantic-validator-required');
  assert.equal(
    schema['x-axiom-semantic-validator'],
    'mesh/src/lib/persistent-entity-bundle.mjs'
  );
  assert.ok(
    schema['x-axiom-semantic-invariants'].includes(
      'created_at calendar validity and canonical ISO round-trip are enforced by the semantic validator'
    )
  );

  assert.doesNotThrow(() => validatePersistentEntityBundle(minimalBundle()));
  assert.throws(
    () => validatePersistentEntityBundle(minimalBundle('2026-02-31T20:00:00.000Z')),
    /created_at|timestamp/i
  );
});
