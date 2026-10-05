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

test('Personal Agent Pack v2 is a manifest, not a vault or authority token', async () => {
  const schema = await loadContract('personal-agent-pack.v2.schema.json');

  assert.equal(schema.properties.schema.const, 'axiom-personal-agent-pack.v2');
  assert.equal(schema.properties.raw_vault_content_included.const, false);
  assert.equal(schema.properties.secret_material_included.const, false);
  assert.equal(schema.properties.grants_vault_access.const, false);
  assert.equal(schema.properties.grants_execution_authority.const, false);
  assert.equal(schema.properties.personalized_weights_are_verified_identity.const, false);
  assert.equal(schema.properties.runtime_preferences.properties.base_model_replaceable.const, true);
  assert.equal(schema.properties.recovery.properties.selective_restore_supported.const, true);
  assert.equal(schema.properties.recovery.properties.cross_vault_key_dependency.const, false);
  assert.equal(schema.properties.recovery.properties.recovery_secret_material_in_pack.const, false);
  assert.equal(schema.properties.portability.properties.subscription_required_for_export.const, false);
  assert.equal(schema.properties.portability.properties.single_provider_required.const, false);
  assert.equal(schema.properties.portability.properties.single_model_family_required.const, false);
  assert.equal(
    schema.properties.portability.properties.missing_optional_component_may_be_silently_substituted.const,
    false
  );
});

test('personalized model components require explicit adaptation provenance', async () => {
  const schema = await loadContract('personal-agent-pack.v2.schema.json');
  const component = schema.properties.companion_components.items;
  const conditional = component.allOf[0];

  assert.equal(
    conditional.if.properties.role.const,
    'personalized-model-artifact'
  );
  for (const required of [
    'training_authorization_ref',
    'base_model_ref',
    'allowed_execution_location_refs',
    'known_privacy_limitations',
    'deletion_retraining_consequences'
  ]) {
    assert.ok(conditional.then.required.includes(required));
  }
});

test('personal model adaptation authorization is exact-scope and not effect authority', async () => {
  const schema = await loadContract('personal-model-adaptation-authorization.v1.schema.json');

  assert.equal(
    schema.properties.schema.const,
    'axiom-personal-model-adaptation-authorization.v1'
  );
  assert.equal(schema.properties.wildcard_source_authority.const, false);
  assert.equal(schema.properties.includes_secret_recovery_material.const, false);
  assert.equal(schema.properties.grants_vault_access_to_resulting_model.const, false);
  assert.equal(schema.properties.grants_execution_authority.const, false);
  assert.equal(
    schema.properties.source_data_retention.properties.source_may_be_used_for_provider_training.const,
    false
  );
  assert.equal(schema.properties.resulting_artifact.properties.public_by_default.const, false);
  assert.equal(
    schema.properties.evaluation.properties.privacy_memorization_review_required.const,
    true
  );
  assert.equal(
    schema.properties.lifecycle.properties.source_deletion_guarantees_weight_unlearning.const,
    false
  );
  assert.equal(
    schema.properties.lifecycle.properties.revocation_stops_future_adaptation.const,
    true
  );
});

test('architecture preserves replaceable model and lease-bound vault access after restore', async () => {
  const architecture = await readFile(
    resolve(
      REPOSITORY_ROOT,
      'docs/architecture/PERSONAL-AGENT-PACK-V2-AND-COMPANION-CONTINUITY.md'
    ),
    'utf8'
  );

  assert.match(architecture, /replace a base model.*without losing the durable context/s);
  assert.match(architecture, /revocable personal context stays in Sovereign Vaults by default/i);
  assert.match(architecture, /Restoring a Pack does not give the companion ambient access/i);
  assert.match(architecture, /Knowledge does not imply authority/i);
  assert.match(architecture, /does \*\*not\*\* claim implemented Pack v2 export\/import/i);
});
