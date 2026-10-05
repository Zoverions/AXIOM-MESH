import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const schemaUrl = new URL('../config/cognitive-lineage-manifest-v0.schema.json', import.meta.url);

test('Cognitive Lineage Manifest v0 schema preserves strict inert lineage semantics', async () => {
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

  assert.equal(schema.$defs.descriptor.additionalProperties, false);
  assert.equal(schema.$defs.procedure.additionalProperties, false);
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
  assert.deepEqual(schema.$defs.evidence.properties.assurance_class.enum, ['declared', 'verified']);
  assert.equal(schema.$defs.digest.pattern, '^[a-f0-9]{64}$');
  assert.equal(schema.$defs.descriptor.required.length, 5);
  assert.equal(schema.$defs.procedure.required.length, 4);
  assert.equal(schema.$defs.evidence.required.length, 5);

  assert.equal(
    schema['x-axiom-semantic-validator'],
    'mesh/src/lib/cognitive-lineage-manifest.mjs'
  );
  assert.deepEqual(schema['x-axiom-semantic-rules'], [
    'topology_id and topology_digest must bind to one exact Cognitive Topology',
    'reference node_id and model_id must bind to one exact current topology node',
    'candidate may be outside the current topology only when candidate.node_id is null',
    'descriptor artifact_ref and artifact_digest must both be null or both be present',
    'topology-bound descriptor artifact digests must exactly match the bound topology node artifact digest',
    'descendant and provider-version successor relationships require procedure_ref and procedure_digest',
    'declared assurance cannot carry verification evidence and verified assurance requires verification_ref and verification_digest',
    'recorded_at cannot precede created_at',
    'lineage evidence never activates or adopts the candidate'
  ]);
  assert.deepEqual(schema['x-axiom-non-claims'], [
    'principal-lineage-proof',
    'principal-continuity-proof',
    'subjective-identity-proof',
    'candidate-activation',
    'model-substitution',
    'procedure-execution',
    'training-or-adaptation-execution',
    'authority-grant',
    'network-effect',
    'runtime-activation'
  ]);
});
