import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPOSITORY_ROOT = resolve(HERE, '../..');

async function loadContract(name) {
  return JSON.parse(await readFile(
    resolve(REPOSITORY_ROOT, 'docs/architecture/contracts', name),
    'utf8'
  ));
}

test('secret reference is provider-neutral metadata and never secret material', async () => {
  const schema = await loadContract('secret-reference.v1.schema.json');

  assert.equal(schema.$schema, 'https://json-schema.org/draft/2020-12/schema');
  assert.equal(schema.properties.schema.const, 'axiom-secret-reference.v1');
  assert.equal(schema.properties.plaintext_embedded.const, false);
  assert.equal(schema.properties.secret_material_in_reference.const, false);
  assert.equal(schema.properties.raw_key_material_embedded.const, false);
  assert.equal(schema.properties.grants_secret_use_authority.const, false);
  assert.equal(schema.properties.grants_effect_authority.const, false);
  assert.equal(Object.hasOwn(schema.properties, 'secret_value'), false);
  assert.equal(Object.hasOwn(schema.properties, 'password'), false);
  assert.equal(Object.hasOwn(schema.properties, 'api_token'), false);
  assert.equal(schema.properties.custody.oneOf.length, 3);
});

test('secret use grant is one-use and cannot reveal export persist log or delegate', async () => {
  const schema = await loadContract('secret-use-grant.v1.schema.json');

  assert.equal(schema.properties.schema.const, 'axiom-secret-use-grant.v1');
  assert.equal(schema.properties.one_use.const, true);
  assert.equal(schema.properties.delegable.const, false);
  assert.equal(schema.properties.permits_reveal.const, false);
  assert.equal(schema.properties.permits_export.const, false);
  assert.equal(schema.properties.permits_persistence.const, false);
  assert.equal(schema.properties.permits_logging.const, false);
  assert.equal(schema.properties.permits_model_context_exposure.const, false);
  assert.equal(schema.properties.returns_secret_bytes_to_requester.const, false);
  assert.equal(schema.properties.wildcard_destination.const, false);
  assert.equal(schema.properties.requires_execution_time_authorization_recheck.const, true);
  assert.equal(schema.properties.requires_revocation_check_before_use.const, true);
  assert.equal(schema.properties.receipt_required.const, true);
});

test('secret use receipt is digest-only evidence and creates no authority', async () => {
  const schema = await loadContract('secret-use-receipt.v1.schema.json');

  assert.equal(schema.properties.schema.const, 'axiom-secret-use-receipt.v1');
  assert.equal(schema.properties.contains_secret_material.const, false);
  assert.equal(schema.properties.contains_plaintext_secret.const, false);
  assert.equal(schema.properties.contains_reusable_provider_credential.const, false);
  assert.equal(schema.properties.grants_authority.const, false);
  assert.equal(Object.hasOwn(schema.properties, 'secret_value'), false);
  assert.equal(Object.hasOwn(schema.properties, 'provider_credential'), false);
});

test('architecture keeps custody use reveal export delegation and effect authority separate', async () => {
  const architecture = await readFile(
    resolve(REPOSITORY_ROOT, 'docs/architecture/SECRET-CONTAINMENT-AND-BROKERAGE.md'),
    'utf8'
  );

  assert.match(architecture, /Permission to use a secret does not imply permission to reveal/i);
  assert.match(architecture, /Secret use is not secret reveal/i);
  assert.match(architecture, /Gateway -> Hypervisor -> Sandbox -> Grid/);
  assert.match(architecture, /AXIOM-native local custody/i);
  assert.match(architecture, /External providers remain adapters/i);
  assert.match(architecture, /creates no Gateway route/i);
  assert.match(architecture, /capability registry remains authoritative/i);
});
