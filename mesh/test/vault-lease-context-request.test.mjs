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

test('context request asks for semantic need without selecting a source vault', async () => {
  const schema = await loadContract('context-request.v1.schema.json');

  assert.equal(schema.$schema, 'https://json-schema.org/draft/2020-12/schema');
  assert.equal(schema.properties.schema.const, 'axiom-context-request.v1');
  assert.equal(schema.properties.minimum_necessary_requested.const, true);
  assert.equal(schema.properties.source_vault_selector_in_request.const, false);
  assert.equal(schema.properties.requests_vault_mount.const, false);
  assert.equal(schema.properties.requests_raw_vault_object.const, false);
  assert.equal(schema.properties.grants_vault_access.const, false);
  assert.equal(schema.properties.grants_execution_authority.const, false);
  assert.equal(schema.properties.onward_disclosure_requested.const, false);

  const need = schema.properties.semantic_needs.items;
  assert.equal(need.additionalProperties, false);
  assert.ok(need.required.includes('semantic_type'));
  assert.ok(need.required.includes('need'));
  assert.equal(Object.hasOwn(need.properties, 'vault_id'), false);
  assert.equal(Object.hasOwn(need.properties, 'vault_ref'), false);
});

test('vault access lease is one-vault local read/derive authority only', async () => {
  const schema = await loadContract('vault-access-lease.v1.schema.json');

  assert.equal(schema.$schema, 'https://json-schema.org/draft/2020-12/schema');
  assert.equal(schema.properties.schema.const, 'axiom-vault-access-lease.v1');
  assert.deepEqual(schema.properties.allowed_operations.items.enum, [
    'read',
    'derive'
  ]);
  assert.equal(schema.properties.resource_scope.properties.wildcard_scope.const, false);
  assert.equal(schema.properties.delegable.const, false);
  assert.equal(schema.properties.usable_outside_owner_trust_domain.const, false);
  assert.equal(schema.properties.contains_raw_key_material.const, false);
  assert.equal(schema.properties.grants_other_vault_access.const, false);
  assert.equal(schema.properties.grants_kernel_effect_authority.const, false);
  assert.equal(schema.properties.permits_raw_content_export.const, false);
  assert.equal(schema.properties.mutation_authority.const, false);
  assert.equal(schema.properties.requires_revocation_check_before_use.const, true);
  assert.equal(schema.properties.access_receipt_required.const, true);
});

test('protocol keeps need, local access, disclosure, and effect authority separate', async () => {
  const architecture = await readFile(
    resolve(REPOSITORY_ROOT, 'docs/architecture/VAULT-LEASE-AND-CONTEXT-REQUEST.md'),
    'utf8'
  );

  assert.match(architecture, /Need.*what information a task requires/s);
  assert.match(architecture, /Access.*temporarily inspect which private source/s);
  assert.match(architecture, /Disclosure.*minimized claims may leave/s);
  assert.match(architecture, /Effect authority.*whether any action may be performed/s);
  assert.match(architecture, /A Vault Access Lease is not permission to train a model/i);
  assert.match(architecture, /does \*\*not\*\* claim an implemented Context Request endpoint/i);
});
