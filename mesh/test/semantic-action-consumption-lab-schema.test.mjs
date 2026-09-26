import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { sha256 } from '../src/lib/canonical.mjs';
import {
  SEMANTIC_ADMISSION_LIFECYCLE_STATES,
  SEMANTIC_EFFECT_CANONICALIZATION_VERSION,
  buildSemanticAuthorizationInstance,
  canonicalSemanticEffect,
  createInMemorySemanticLabStore,
  createSemanticActionConsumptionLab
} from '../src/lib/semantic-action-consumption-lab.mjs';

const schemaUrl = new URL('../config/semantic-action-consumption-lab-v0.schema.json', import.meta.url);

function everyObjectSchemaIsClosed(node, path = '$') {
  if (Array.isArray(node)) return node.forEach((item, index) => everyObjectSchemaIsClosed(item, `${path}[${index}]`));
  if (!node || typeof node !== 'object') return;
  if (node.type === 'object') assert.equal(node.additionalProperties, false, `${path} must be closed`);
  for (const [key, value] of Object.entries(node)) everyObjectSchemaIsClosed(value, `${path}.${key}`);
}

function conforms(document, properties, defs) {
  for (const [key, rule] of Object.entries(properties)) {
    const value = document[key];
    const resolved = rule.$ref ? defs[rule.$ref.split('/').at(-1)] : rule;
    if (Object.hasOwn(resolved, 'const')) assert.equal(value, resolved.const, key);
    if (resolved.enum) assert.ok(resolved.enum.includes(value), `${key}=${value}`);
    if (resolved.pattern) assert.match(value, new RegExp(resolved.pattern), key);
    if (resolved.type === 'integer') {
      assert.ok(Number.isSafeInteger(value) && value >= resolved.minimum && value <= resolved.maximum, key);
    }
  }
}

test('Semantic Action Consumption Lab v0 schema pins hard zeros, non-authority flags, and is closed everywhere', async () => {
  const schema = JSON.parse(await readFile(schemaUrl, 'utf8'));
  assert.equal(schema.$schema, 'https://json-schema.org/draft/2020-12/schema');
  assert.equal(schema.properties.schema.const, 'axiom-semantic-action-consumption-lab-receipt.v0');
  assert.equal(schema.properties.status.const, 'inert-reference-model');
  for (const field of ['authority_effect', 'execution_effect', 'network_effect']) {
    assert.equal(schema.properties[field].const, 'none');
    assert.equal(schema.$defs.authorization_instance.properties[field].const, 'none');
  }
  assert.equal(schema.properties.runtime_activation.const, false);
  assert.equal(schema.$defs.authorization_instance.properties.runtime_activation.const, false);
  assert.equal(schema.properties.exactly_once_claimed.const, false);
  assert.equal(schema.properties.receipt_is_authority.const, false);
  assert.equal(schema.properties.token_is_authority.const, false);
  assert.equal(schema.properties.admission_consumed.const, true);
  assert.deepEqual(schema.properties.lifecycle_state.enum, [...SEMANTIC_ADMISSION_LIFECYCLE_STATES]);
  everyObjectSchemaIsClosed(schema);
  assert.deepEqual([...schema.required].sort(), Object.keys(schema.properties).sort());
  const instanceSchema = schema.$defs.authorization_instance;
  assert.deepEqual([...instanceSchema.required].sort(), Object.keys(instanceSchema.properties).sort());
  assert.doesNotMatch(JSON.stringify(schema.properties), /model_intent|grants_authority|exactly_once_delivered/);
  assert.equal(schema['x-axiom-semantic-validator'], 'mesh/src/lib/semantic-action-consumption-lab.mjs');
  assert.equal(schema['x-axiom-runtime-activation'], false);
  for (const claim of ['authority-grant', 'runtime-wiring', 'live-consumption-replacement', 'exactly-once-delivery', 'global-parameter-dedupe']) {
    assert.ok(schema['x-axiom-non-claims'].includes(claim), claim);
  }
});

test('lab outputs match the schema field set and value constraints', async () => {
  const schema = JSON.parse(await readFile(schemaUrl, 'utf8'));
  const profiles = [{
    action: 'ledger.entry.write', mcp_tool_name: 'write_entry', consequential: true, sink_idempotency: 'idempotency-key',
    parameters: { entry_id: 'id', amount: 'decimal' }
  }];
  const { effect_identity_digest: effectDigest } = canonicalSemanticEffect({
    canonicalization_version: SEMANTIC_EFFECT_CANONICALIZATION_VERSION,
    protocol: 'axiom.structured-effect.v0',
    input: { action: 'ledger.entry.write', purpose: 'p', destination: 'd', object: 'o', parameters: { entry_id: 'e1', amount: '1.50' } }
  }, profiles);
  const instance = buildSemanticAuthorizationInstance({
    authorization_instance_id: 'authz-schema-1',
    mandate_digest: sha256('mandate-schema'),
    principal_id: 'owner.schema',
    effect_identity_digest: effectDigest,
    execution_budget: 1,
    issued_at: '2026-09-26T11:00:00.000Z',
    expires_at: '2026-09-26T13:00:00.000Z'
  });
  assert.deepEqual(Object.keys(instance).sort(), Object.keys(schema.$defs.authorization_instance.properties).sort());
  conforms(instance, schema.$defs.authorization_instance.properties, schema.$defs);

  const lab = createSemanticActionConsumptionLab({
    store: createInMemorySemanticLabStore(), profiles, now: () => Date.parse('2026-09-26T12:00:00.000Z')
  });
  await lab.registerAuthorizationInstance(instance);
  const admitted = await lab.admit({
    presentation: {
      jti: 'jti-schema', nonce: 'nonce-schema', holder_id: 'agent.schema', authorization_instance_id: 'authz-schema-1',
      effect_identity_digest: effectDigest, issued_at: '2026-09-26T11:00:00.000Z', expires_at: '2026-09-26T13:00:00.000Z'
    },
    effect: {
      canonicalization_version: SEMANTIC_EFFECT_CANONICALIZATION_VERSION,
      protocol: 'mcp.tools-call.v0',
      input: {
        message: { jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'write_entry', arguments: { amount: '1.5', entry_id: 'e1' } } },
        purpose: 'p', destination: 'd', object: 'o'
      }
    }
  });
  assert.equal(admitted.decision, 'admit');
  assert.deepEqual(Object.keys(admitted.receipt).sort(), Object.keys(schema.properties).sort());
  assert.equal(admitted.receipt.sink_idempotency, 'idempotency-key');
  assert.equal(admitted.receipt.remaining_budget, 0);
  conforms(admitted.receipt, schema.properties, schema.$defs);
});
