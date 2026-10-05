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

test('sovereign vault manifest keeps external access closed and local access lease-bound', async () => {
  const schema = await loadContract('sovereign-vault.v1.schema.json');
  assert.equal(schema.$schema, 'https://json-schema.org/draft/2020-12/schema');
  assert.equal(schema.properties.schema.const, 'axiom-sovereign-vault.v1');

  const access = schema.properties.access_policy.properties;
  assert.equal(access.default_external_vault_access.const, false);
  assert.equal(access.local_lease_required.const, true);
  assert.equal(access.mutation_requires_kernel_effect.const, true);
  assert.deepEqual(access.local_companion_access.enum, [
    'none',
    'metadata-only',
    'lease-read',
    'lease-read-derive'
  ]);

  const storage = schema.properties.storage_policy.properties;
  assert.equal(storage.encrypted_at_rest.const, true);
  assert.equal(storage.plaintext_index_outside_vault.const, false);

  const recovery = schema.properties.recovery_policy.properties;
  assert.equal(recovery.cross_vault_key_dependency.const, false);
  assert.equal(schema.properties.secret_material_in_manifest.const, false);
});

test('context capsule is minimized disclosure rather than vault or execution authority', async () => {
  const schema = await loadContract('context-capsule.v1.schema.json');
  assert.equal(schema.$schema, 'https://json-schema.org/draft/2020-12/schema');
  assert.equal(schema.properties.schema.const, 'axiom-context-capsule.v1');
  assert.equal(schema.properties.grants_vault_access.const, false);
  assert.equal(schema.properties.grants_execution_authority.const, false);
  assert.equal(schema.properties.contains_raw_vault_object.const, false);
  assert.equal(schema.properties.source_content_resolvable_by_recipient.const, false);
  assert.equal(schema.properties.onward_disclosure_allowed.const, false);

  const disclosures = schema.properties.disclosures.items.properties;
  assert.deepEqual(disclosures.disclosure_type.enum, [
    'verbatim-approved',
    'redacted',
    'transformed-constraint',
    'aggregate',
    'derived-inference'
  ]);
  assert.ok(schema.required.includes('policy_decision_ref'));
  assert.ok(schema.required.includes('access_receipt_refs'));
});

test('vault and capsule drafts do not claim runtime capability', async () => {
  const architecture = await readFile(
    resolve(REPOSITORY_ROOT, 'docs/architecture/SOVEREIGN-VAULTS-AND-CONTEXT-BROKER.md'),
    'utf8'
  );

  assert.match(architecture, /no runtime or production-promotion claim/i);
  assert.match(architecture, /generative model is never the vault access authority/i);
  assert.match(architecture, /External agents receive capsules, not vault mounts/i);
  assert.match(architecture, /Keep revocable personal memory outside model weights/i);
  assert.match(architecture, /does \*\*not\*\* claim that AXIOM-MESH currently implements/i);
});
