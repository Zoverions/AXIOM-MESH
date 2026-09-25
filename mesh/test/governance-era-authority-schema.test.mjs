import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const schemaUrl = new URL('../config/governance-era-authority-v0.schema.json', import.meta.url);

test('Governance Era / Authority v0 schema is inert and non-executing', async () => {
  const schema = JSON.parse(await readFile(schemaUrl, 'utf8'));

  assert.equal(schema.$schema, 'https://json-schema.org/draft/2020-12/schema');
  assert.equal(schema.properties.schema.const, 'axiom-governance-era-authority-package.v0');
  assert.equal(schema.properties.status.const, 'inert-contract-laboratory');
  assert.equal(schema.properties.authority_effect.const, 'none');
  assert.equal(schema.properties.network_effect.const, 'none');
  assert.equal(schema.properties.runtime_activation.const, false);

  const authority = schema.$defs.authority.properties;
  assert.equal(authority.execution_binding.const, false);
  assert.equal(authority.requires_local_authority_evaluation.const, true);
  assert.equal(authority.authority_effect.const, 'none');
  assert.equal(authority.runtime_activation.const, false);

  assert.equal(
    schema['x-axiom-semantic-validator'],
    'mesh/src/lib/governance-era-authority.mjs'
  );
  assert.deepEqual(schema['x-axiom-non-claims'], [
    'live-era-transition',
    'live-governance-authority',
    'automatic-authority-decay',
    'production-polycentric-governance',
    'runtime-authority',
    'automatic-execution'
  ]);
});
