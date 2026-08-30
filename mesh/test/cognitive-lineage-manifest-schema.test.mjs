import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const schemaUrl = new URL('../config/cognitive-lineage-manifest-v0.schema.json', import.meta.url);

test('Cognitive Lineage Manifest v0 schema preserves one-edge zero-authority semantics', async () => {
  const schema = JSON.parse(await readFile(schemaUrl, 'utf8'));

  assert.equal(schema.$schema, 'https://json-schema.org/draft/2020-12/schema');
  assert.equal(schema.properties.schema.const, 'axiom-cognitive-lineage-manifest.v0');
  assert.equal(schema.properties.version.const, 0);
  assert.equal(schema.properties.status.const, 'inert-evidence');
  assert.equal(schema.properties.contains_secret_material.const, false);
  assert.equal(schema.properties.authority_effect.const, 'none');
  assert.equal(schema.properties.network_effect.const, 'none');
  assert.equal(schema.properties.runtime_activation.const, false);
  assert.equal(schema.additionalProperties, false);
  assert.equal(schema.$defs.endpoint.additionalProperties, false);
  assert.equal(schema.$defs.evidence.additionalProperties, false);

  assert.deepEqual(schema.properties.relationship.enum, [
    'successor',
    'replacement',
    'fine-tuned-descendant',
    'distilled-descendant',
    'quantized-derivative',
    'adapter-derived',
    'provider-version-successor',
    'functionally-unrelated'
  ]);
  assert.equal(schema.properties.lineage_id.pattern, '^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$');
  assert.equal(schema.properties.topology_digest.pattern, '^[a-f0-9]{64}$');
  assert.equal(schema.$defs.endpoint.properties.artifact_digest.anyOf[0].pattern, '^[a-f0-9]{64}$');

  assert.equal(
    schema['x-axiom-semantic-validator'],
    'mesh/src/lib/cognitive-lineage-manifest.mjs'
  );
  assert.deepEqual(schema['x-axiom-semantic-rules'], [
    'topology_id and topology_digest must bind to one exact Cognitive Topology',
    'source and destination must be different nodes in the same exact Cognitive Topology',
    'source and destination node_id/model_id pairs must exactly match their topology nodes',
    'owner-addressable endpoint artifact digests must equal the topology artifact digest; non-owner-addressable endpoint digests must be null',
    'relationship is explicit evidence only and no hidden ancestry is inferred from model names, identifiers, or provider labels',
    'cognitive lineage never proves or implies AXIOM principal lineage, principal continuity, or subjective identity'
  ]);
  assert.deepEqual(schema['x-axiom-non-claims'], [
    'behavioral-equivalence',
    'capability-equivalence',
    'memory-equivalence',
    'runtime-compatibility',
    'principal-lineage-proof',
    'principal-continuity-proof',
    'subjective-identity-proof',
    'replacement-approval',
    'authority-grant',
    'network-effect',
    'runtime-activation'
  ]);
});
