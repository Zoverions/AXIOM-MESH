import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const sourceUrl = new URL('../src/lib/inference-measurement-contracts.mjs', import.meta.url);
const profileSchemaUrl = new URL('../config/inference-workload-profile-v0.schema.json', import.meta.url);
const evidenceSchemaUrl = new URL('../config/inference-benchmark-evidence-v0.schema.json', import.meta.url);

test('inference measurement schemas preserve closed zero-authority boundaries', async () => {
  const profile = JSON.parse(await readFile(profileSchemaUrl, 'utf8'));
  const evidence = JSON.parse(await readFile(evidenceSchemaUrl, 'utf8'));

  for (const schema of [profile, evidence]) {
    assert.equal(schema.type, 'object');
    assert.equal(schema.additionalProperties, false);
    assert.equal(schema.properties.authority_effect.const, 'none');
    assert.equal(schema.properties.network_effect.const, 'none');
    assert.equal(schema.properties.credential_visibility.const, 'none');
    assert.equal(schema.properties.runtime_activation.const, false);
    assert.equal(schema.properties.selection_effect.const, 'none');
    assert.equal(schema.properties.capability_promotion.const, false);
    assert.equal(
      schema['x-axiom-semantic-validator'],
      'mesh/src/lib/inference-measurement-contracts.mjs'
    );
  }

  assert.equal(profile.properties.schema.const, 'axiom-inference-workload-profile.v0');
  assert.equal(evidence.properties.schema.const, 'axiom-inference-benchmark-evidence.v0');
  assert.equal(profile.properties.token_shape.additionalProperties, false);
  assert.equal(profile.properties.objectives.additionalProperties, false);
  assert.equal(evidence.properties.workload.additionalProperties, false);
  assert.equal(evidence.properties.subject.additionalProperties, false);
  assert.equal(evidence.properties.environment.additionalProperties, false);
  assert.equal(evidence.properties.protocol.additionalProperties, false);
  assert.equal(evidence.properties.observations.additionalProperties, false);
  assert.equal(evidence.properties.quality.additionalProperties, false);
});

test('inference measurement validator imports no network subprocess credential Grid provider or GPU runtime surface', async () => {
  const source = await readFile(sourceUrl, 'utf8');
  const imports = [...source.matchAll(/^import\s+[^;]+from\s+['"]([^'"]+)['"];?$/gm)].map(match => match[1]);

  assert.deepEqual(imports, ['./canonical.mjs']);

  for (const forbidden of [
    'node:http',
    'node:https',
    'node:net',
    'node:tls',
    'node:dgram',
    'node:child_process',
    'node:worker_threads',
    'node:fs',
    'gateway',
    'hypervisor',
    'sandbox',
    'grid',
    'wallet',
    'cuda-oxide',
    'cutile',
    'nvidia-smi',
    'vllm',
    'sglang',
    'tensorrt'
  ]) {
    assert.equal(
      source.toLowerCase().includes(forbidden.toLowerCase()),
      false,
      `source unexpectedly references forbidden runtime surface: ${forbidden}`
    );
  }
});
