import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const schemaUrl = new URL(
  '../../docs/architecture/contracts/capability-surfaces.v0.schema.json',
  import.meta.url
);

test('capability surface schema locks lifecycle and non-authority discovery semantics', async () => {
  const schema = JSON.parse(await readFile(schemaUrl, 'utf8'));
  assert.equal(schema.$id, 'axiom-capability-surfaces.v0');
  assert.equal(schema.additionalProperties, false);
  assert.equal(schema.properties.executable_registry_ref.const, 'mesh/config/capabilities.json');
  assert.equal(schema.properties.discovery_grants_authority.const, false);
  assert.equal(schema.properties.authority_effect.const, 'none');
  assert.equal(schema.properties.network_effect.const, 'none');
  assert.equal(schema.properties.runtime_activation.const, false);
  assert.deepEqual(
    schema.properties.entries.items.properties.lifecycle.enum,
    [
      'conceptual',
      'specified',
      'implemented',
      'tested',
      'enabled',
      'exposed',
      'pilot-proven',
      'production-promoted',
      'marketed'
    ]
  );
});
