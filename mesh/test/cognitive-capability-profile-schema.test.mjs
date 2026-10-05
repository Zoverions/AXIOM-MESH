import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const schemaUrl = new URL('../config/cognitive-capability-profile-v0.schema.json', import.meta.url);

test('Cognitive Capability Profile v0 schema preserves strict zero-authority routing metadata', async () => {
  const schema = JSON.parse(await readFile(schemaUrl, 'utf8'));

  assert.equal(schema.$schema, 'https://json-schema.org/draft/2020-12/schema');
  assert.equal(schema.properties.schema.const, 'axiom-cognitive-capability-profile.v0');
  assert.equal(schema.properties.version.const, 0);
  assert.equal(schema.properties.status.const, 'inert-routing-metadata-laboratory');
  assert.equal(schema.additionalProperties, false);
  assert.equal(schema.$defs.catalogEntry.additionalProperties, false);
  assert.equal(schema.$defs.modalities.additionalProperties, false);
  assert.equal(schema.$defs.deployment.additionalProperties, false);
  assert.equal(schema.$defs.dataPolicy.additionalProperties, false);
  assert.equal(schema.$defs.economics.additionalProperties, false);
  assert.equal(schema.$defs.openness.additionalProperties, false);
  assert.equal(schema.$defs.assurance.additionalProperties, false);

  assert.deepEqual(schema.properties.integration_class.enum, [
    'agent-runtime', 'model-provider', 'compute-backend'
  ]);
  assert.deepEqual(schema.properties.capabilities.items.enum, [
    'reasoning',
    'coding',
    'vision',
    'computer-use',
    'research',
    'planning',
    'critique',
    'summarization',
    'embedding',
    'tool-use',
    'agent-orchestration',
    'other'
  ]);
  assert.deepEqual(schema.$defs.modality.enum, [
    'text', 'image', 'audio', 'video', 'embedding'
  ]);
  assert.deepEqual(schema.$defs.deployment.properties.locality.enum, [
    'owner-local', 'owner-remote', 'provider-remote', 'hybrid'
  ]);
  assert.deepEqual(schema.$defs.deployment.properties.access_mode.enum, [
    'local-runtime', 'api', 'remote-runtime', 'hybrid'
  ]);
  assert.deepEqual(schema.$defs.dataPolicy.properties.retention.enum, [
    'none', 'transient', 'persistent', 'unknown'
  ]);
  assert.deepEqual(schema.$defs.dataPolicy.properties.training_use.enum, [
    'excluded', 'possible', 'unknown'
  ]);
  assert.deepEqual(schema.$defs.dataPolicy.properties.exportability.enum, [
    'none', 'partial', 'full', 'unknown'
  ]);
  assert.deepEqual(schema.$defs.economics.properties.cost_class.enum, [
    'none', 'low', 'medium', 'high', 'unknown'
  ]);
  assert.deepEqual(schema.$defs.economics.properties.latency_class.enum, [
    'local-fast', 'interactive', 'slow', 'batch', 'unknown'
  ]);
  assert.deepEqual(schema.$defs.economics.properties.context_class.enum, [
    'small', 'medium', 'large', 'very-large', 'unknown'
  ]);
  assert.deepEqual(schema.$defs.openness.properties.weight_access.enum, [
    'closed', 'open-remote', 'open-acquired', 'local-proprietary', 'not-applicable'
  ]);
  assert.deepEqual(schema.$defs.assurance.properties.ceiling.enum, [
    'none', 'self-asserted', 'behavioral', 'cryptographic', 'hardware-rooted'
  ]);

  assert.equal(schema.properties.authority_effect.const, 'none');
  assert.equal(schema.properties.network_effect.const, 'none');
  assert.equal(schema.properties.credential_visibility.const, 'none');
  assert.equal(schema.properties.runtime_activation.const, false);
  assert.equal(schema.properties.selection_effect.const, 'eligibility-only');

  assert.equal(
    schema['x-axiom-semantic-validator'],
    'mesh/src/lib/cognitive-capability-profile.mjs'
  );
  assert.deepEqual(schema['x-axiom-semantic-rules'], [
    'profile catalog_entry identity version and digest must match one exact validated runtime/provider catalog entry',
    'profile integration_class must match the bound catalog entry',
    'owner-local local-runtime profiles require catalog entries with network_required false',
    'provider-remote api or remote-runtime profiles require catalog entries with network_required true',
    'open-acquired and local-proprietary weight access require an exact artifact digest; other states require null',
    'eligibility metadata never grants authority activates runtimes reveals credentials or performs network access'
  ]);
  assert.deepEqual(schema['x-axiom-non-claims'], [
    'provider-availability',
    'model-invocation',
    'credential-brokerage',
    'network-egress',
    'automatic-routing-winner',
    'learned-routing',
    'benchmark-truth',
    'exact-price-truth',
    'provider-policy-freshness',
    'authority-grant'
  ]);
});
