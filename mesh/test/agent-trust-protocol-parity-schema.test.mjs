import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { AGENT_PROTOCOL_ADAPTER_PROFILE_SCHEMA } from '../src/lib/agent-trust-protocol-parity.mjs';

const schemaUrl = new URL(
  '../../agent-commons/contracts/agent-protocol-adapter-profile.v1.schema.json',
  import.meta.url
);

test('A9a protocol profile schema stays synchronized with non-authorizing runtime semantics', async () => {
  const schema = JSON.parse(await readFile(schemaUrl, 'utf8'));
  assert.equal(schema.properties.schema.const, AGENT_PROTOCOL_ADAPTER_PROFILE_SCHEMA);
  assert.deepEqual(schema.properties.protocol.enum, ['native', 'mcp', 'a2a']);
  const semantics = schema.properties.semantics.properties;
  assert.equal(semantics.native_axiom_semantics_authoritative.const, true);
  for (const field of [
    'profile_is_authority',
    'discovery_is_permission',
    'adapter_metadata_trusted',
    'protocol_switch_can_expand_authority',
    'protocol_conformance_claimed'
  ]) assert.equal(semantics[field].const, false, `${field} must remain false`);
  assert.equal(semantics.authority_effect.const, 'none');
  assert.equal(semantics.delegation_effect.const, 'none');
});
