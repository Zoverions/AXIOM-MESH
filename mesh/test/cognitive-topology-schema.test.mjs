import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const schemaUrl = new URL('../config/cognitive-topology-v0.schema.json', import.meta.url);

test('Cognitive Topology v0 schema preserves strict inert dependency semantics', async () => {
  const schema = JSON.parse(await readFile(schemaUrl, 'utf8'));

  assert.equal(schema.$schema, 'https://json-schema.org/draft/2020-12/schema');
  assert.equal(schema.properties.schema.const, 'axiom-cognitive-topology.v0');
  assert.equal(schema.properties.version.const, 0);
  assert.equal(schema.properties.status.const, 'inert-contract-laboratory');
  assert.equal(schema.properties.nodes.maxItems, 64);
  assert.equal(schema.properties.contains_secret_material.const, false);
  assert.equal(schema.properties.authority_effect.const, 'none');
  assert.equal(schema.properties.network_effect.const, 'none');
  assert.equal(schema.properties.runtime_activation.const, false);
  assert.equal(schema.additionalProperties, false);
  assert.equal(schema.$defs.node.additionalProperties, false);
  assert.equal(schema.$defs.weights.additionalProperties, false);
  assert.equal(schema.$defs.persistence.additionalProperties, false);

  assert.deepEqual(schema.$defs.node.properties.engagement.enum, [
    'ephemeral', 'session', 'persistent', 'primary'
  ]);
  assert.deepEqual(schema.$defs.node.properties.topology_role.enum, [
    'augmentation', 'primary-embodiment', 'identity-kernel', 'router', 'evaluator'
  ]);
  assert.deepEqual(schema.$defs.node.properties.access_mode.enum, [
    'api', 'local-runtime', 'remote-runtime', 'hybrid'
  ]);
  assert.deepEqual(schema.$defs.node.properties.custody.enum, [
    'provider-controlled', 'owner-local', 'owner-remote', 'shared'
  ]);
  assert.deepEqual(schema.$defs.weights.properties.state.enum, [
    'closed', 'open-remote', 'open-acquired', 'local-proprietary', 'not-applicable'
  ]);
  assert.deepEqual(schema.$defs.persistence.properties.mode.enum, [
    'none', 'local', 'provider-bound', 'mirrored'
  ]);
  assert.deepEqual(schema.$defs.persistence.properties.exportability.enum, [
    'none', 'partial', 'full', 'unknown'
  ]);
  assert.deepEqual(schema.$defs.node.properties.continuity_importance.enum, [
    'optional', 'important', 'critical'
  ]);
  assert.deepEqual(schema.$defs.node.properties.fidelity_importance.enum, [
    'optional', 'important', 'critical'
  ]);

  assert.equal(
    schema['x-axiom-semantic-validator'],
    'mesh/src/lib/cognitive-topology.mjs'
  );
  assert.deepEqual(schema['x-axiom-semantic-rules'], [
    'every topology model_id must exist in the exact bound Agent Composition',
    'duplicate node_id and model_id values fail closed',
    'open-acquired and local-proprietary weights require an exact artifact digest; other weight states require null',
    'provider-bound and mirrored persistence require provider_id and state_ref; none/local persistence cannot name a provider; none cannot name state',
    'identity-kernel nodes cannot use ephemeral engagement'
  ]);
  assert.deepEqual(schema['x-axiom-non-claims'], [
    'authority-grant',
    'runtime-activation',
    'model-invocation',
    'training-or-adaptation-execution',
    'provider-persistence-availability',
    'subjective-identity-proof'
  ]);
});
