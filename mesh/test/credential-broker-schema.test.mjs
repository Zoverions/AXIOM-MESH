import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

async function schema(name) {
  return JSON.parse(await readFile(new URL(`../config/${name}`, import.meta.url), 'utf8'));
}

test('Credential Broker Provider v0 schema is inert, secret-hiding, and human-approved', async () => {
  const document = await schema('credential-broker-provider-v0.schema.json');
  assert.equal(document.$schema, 'https://json-schema.org/draft/2020-12/schema');
  assert.equal(document.properties.schema.const, 'axiom-credential-broker-provider.v0');
  assert.equal(document.properties.status.const, 'inert-contract-laboratory');
  assert.equal(document.properties.approval_mode.const, 'always-human');
  assert.equal(document.properties.secret_visibility.const, 'trusted-broker-only');
  assert.equal(document.properties.model_secret_access.const, false);
  assert.equal(document.properties.live_invocation.const, false);
  assert.equal(document.properties.authority_effect.const, 'none');
  assert.equal(document.properties.network_effect.const, 'none');
  assert.equal(document.additionalProperties, false);
  assert.equal(document['x-axiom-semantic-validator'], 'mesh/src/lib/credential-broker-contract.mjs');
  assert(document['x-axiom-non-claims'].includes('production-provider-support'));
});

test('Credential Broker Request v0 schema cannot invoke a broker or widen authority', async () => {
  const document = await schema('credential-broker-request-v0.schema.json');
  assert.equal(document.properties.schema.const, 'axiom-credential-broker-request.v0');
  assert.equal(document.properties.status.const, 'inert-contract-laboratory');
  assert.equal(document.properties.single_use.const, true);
  assert.equal(document.properties.requires_human_approval.const, true);
  assert.equal(document.properties.authority_effect.const, 'none');
  assert.equal(document.properties.network_effect.const, 'none');
  assert.equal(document.properties.broker_invocation.const, false);
  assert.equal(document.additionalProperties, false);
  assert.equal(document['x-axiom-semantic-validator'], 'mesh/src/lib/credential-broker-contract.mjs');
  assert(document['x-axiom-non-claims'].includes('replay-ledger'));
});
