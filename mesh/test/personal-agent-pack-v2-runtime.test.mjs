import assert from 'node:assert/strict';
import test from 'node:test';
import {
  validatePersonalAgentPackV2,
  validatePersonalAgentPackV2Bindings,
  validatePersonalModelAdaptationAuthorization
} from '../src/lib/personal-agent-pack-v2.mjs';

const SHA_A = 'a'.repeat(64);
const SHA_B = 'b'.repeat(64);
const SHA_C = 'c'.repeat(64);

function validPack() {
  return {
    schema: 'axiom-personal-agent-pack.v2',
    pack_id: 'pack:owner-1',
    pack_version: '2.0.0-draft.1',
    owner_subject_ref: 'subject:owner-1',
    created_at: '2026-08-22T16:00:00Z',
    updated_at: '2026-08-22T16:30:00Z',
    vaults: [
      {
        vault_id: 'vault:memory',
        domain: 'personal-memory',
        vault_manifest_ref: 'manifest:vault-memory',
        vault_manifest_sha256: SHA_A,
        recovery_policy_ref: 'recovery:vault-memory',
        backup_refs: ['backup:vault-memory'],
        selective_restore_supported: true
      }
    ],
    companion_components: [
      {
        component_id: 'component:corrections',
        role: 'correction-ledger',
        media_type: 'application/json',
        content_ref: 'content:corrections',
        sha256: SHA_B,
        encryption: 'owner-local-encrypted',
        required_for_minimum_continuity: true
      },
      {
        component_id: 'component:personalized',
        role: 'personalized-model-artifact',
        media_type: 'application/octet-stream',
        content_ref: 'content:personalized-adapter',
        sha256: SHA_C,
        encryption: 'owner-local-encrypted',
        required_for_minimum_continuity: false,
        training_authorization_ref: 'adaptation:1',
        base_model_ref: 'model:base-1',
        allowed_execution_location_refs: ['node:local-1'],
        known_privacy_limitations: 'Privacy and memorization review remains required.',
        deletion_retraining_consequences: 'Destroy or retrain the artifact when required.'
      }
    ],
    runtime_preferences: {
      routing_mode: 'private',
      allowed_capsule_ids: ['capsule:companion'],
      denied_capsule_ids: [],
      allowed_provider_ids: [],
      denied_provider_ids: [],
      pinned_model_ids: ['model:base-1'],
      base_model_replaceable: true
    },
    recovery: {
      pack_backup_refs: ['backup:pack-1'],
      selective_restore_supported: true,
      cross_vault_key_dependency: false,
      recovery_secret_material_in_pack: false,
      recovery_policy_ref: 'recovery:pack-1'
    },
    portability: {
      subscription_required_for_export: false,
      single_provider_required: false,
      single_model_family_required: false,
      missing_optional_component_may_be_silently_substituted: false
    },
    raw_vault_content_included: false,
    secret_material_included: false,
    grants_vault_access: false,
    grants_execution_authority: false,
    personalized_weights_are_verified_identity: false
  };
}

function validAuthorization() {
  return {
    schema: 'axiom-personal-model-adaptation-authorization.v1',
    authorization_id: 'adaptation:1',
    owner_subject_ref: 'subject:owner-1',
    purpose: 'Create an owner-local personalized companion adapter.',
    operation: 'lora-or-equivalent-adapter',
    source_scope: [
      {
        vault_id: 'vault:memory',
        resource_refs: ['record:1', 'record:2'],
        purpose_authorized: true,
        maximum_sensitivity: 'sensitive',
        source_policy_decision_ref: 'policy:adaptation-1',
        owner_confirmation_ref: 'confirmation:owner-1'
      }
    ],
    target: {
      base_model_ref: 'model:base-1',
      base_model_digest_or_version_ref: 'model-version:base-1',
      output_artifact_class: 'personalized-adapter'
    },
    execution: {
      execution_location_ref: 'node:local-1',
      local_only: true,
      source_data_egress_allowed: false
    },
    source_data_retention: {
      provider_may_retain_source: false,
      max_source_retention_seconds: 0,
      source_may_be_used_for_provider_training: false
    },
    resulting_artifact: {
      custody: 'owner-local-encrypted',
      allowed_execution_location_refs: ['node:local-1'],
      exportable_by_owner: true,
      public_by_default: false
    },
    evaluation: {
      baseline_refs: ['evaluation:baseline-1'],
      privacy_memorization_review_required: true,
      usefulness_regression_review_required: true
    },
    licence_and_use: {
      licence_refs: ['licence:base-1'],
      allowed_use_scopes: ['personal']
    },
    lifecycle: {
      revocation_stops_future_adaptation: true,
      source_deletion_guarantees_weight_unlearning: false,
      deletion_retraining_consequence: 'destroy-artifact',
      artifact_deletion_supported: true
    },
    issued_at: '2026-08-22T15:00:00Z',
    expires_at: '2026-08-23T15:00:00Z',
    wildcard_source_authority: false,
    includes_secret_recovery_material: false,
    grants_vault_access_to_resulting_model: false,
    grants_execution_authority: false
  };
}

function clone(value) {
  return structuredClone(value);
}

test('valid Pack v2 produces a stable canonical digest and no authority', () => {
  const pack = validPack();
  const first = validatePersonalAgentPackV2(pack);
  const reordered = Object.fromEntries(Object.entries(pack).reverse());
  const second = validatePersonalAgentPackV2(reordered);

  assert.equal(first.valid, true);
  assert.equal(first.vaults, 1);
  assert.equal(first.companion_components, 2);
  assert.deepEqual(first.personalized_model_components, ['component:personalized']);
  assert.equal(first.grants_vault_access, false);
  assert.equal(first.grants_execution_authority, false);
  assert.equal(first.canonical_sha256, second.canonical_sha256);
});

test('Pack v2 fails closed on secret, authority, ambiguity, and duplicate identity', () => {
  const secret = validPack();
  secret.secret_material_included = true;
  assert.throws(() => validatePersonalAgentPackV2(secret), /secret_material_included/);

  const authority = validPack();
  authority.grants_execution_authority = true;
  assert.throws(() => validatePersonalAgentPackV2(authority), /grants_execution_authority/);

  const overlap = validPack();
  overlap.runtime_preferences.allowed_provider_ids = ['provider:1'];
  overlap.runtime_preferences.denied_provider_ids = ['provider:1'];
  assert.throws(() => validatePersonalAgentPackV2(overlap), /allow\/deny lists overlap/);

  const duplicateVault = validPack();
  duplicateVault.vaults.push(clone(duplicateVault.vaults[0]));
  assert.throws(() => validatePersonalAgentPackV2(duplicateVault), /duplicate vault_id/);

  const unknown = validPack();
  unknown.ambient_vault_access = true;
  assert.throws(() => validatePersonalAgentPackV2(unknown), /unknown field ambient_vault_access/);
});

test('personalized model components require explicit provenance and bounded locations', () => {
  const missing = validPack();
  delete missing.companion_components[1].training_authorization_ref;
  assert.throws(
    () => validatePersonalAgentPackV2(missing),
    /requires training_authorization_ref/
  );

  const emptyLocations = validPack();
  emptyLocations.companion_components[1].allowed_execution_location_refs = [];
  assert.throws(() => validatePersonalAgentPackV2(emptyLocations), /must contain 1-256 items/);
});

test('adaptation authorization is exact-scope and cannot create ambient authority', () => {
  const authorization = validAuthorization();
  const result = validatePersonalModelAdaptationAuthorization(authorization);

  assert.equal(result.valid, true);
  assert.equal(result.source_vaults, 1);
  assert.equal(result.grants_vault_access_to_resulting_model, false);
  assert.equal(result.grants_execution_authority, false);

  const wildcard = validAuthorization();
  wildcard.wildcard_source_authority = true;
  assert.throws(
    () => validatePersonalModelAdaptationAuthorization(wildcard),
    /wildcard_source_authority/
  );

  const providerTraining = validAuthorization();
  providerTraining.source_data_retention.source_may_be_used_for_provider_training = true;
  assert.throws(
    () => validatePersonalModelAdaptationAuthorization(providerTraining),
    /source_may_be_used_for_provider_training/
  );

  const localEgress = validAuthorization();
  localEgress.execution.source_data_egress_allowed = true;
  localEgress.execution.egress_policy_decision_ref = 'policy:egress-1';
  assert.throws(
    () => validatePersonalModelAdaptationAuthorization(localEgress),
    /local-only adaptation cannot allow source-data egress/
  );
});

test('adaptation authorization rejects duplicate source vaults and invalid lifetime', () => {
  const duplicateSource = validAuthorization();
  duplicateSource.source_scope.push(clone(duplicateSource.source_scope[0]));
  duplicateSource.source_scope[1].resource_refs = ['record:3'];
  assert.throws(
    () => validatePersonalModelAdaptationAuthorization(duplicateSource),
    /duplicate source_scope vault_id/
  );

  const invalidLifetime = validAuthorization();
  invalidLifetime.expires_at = invalidLifetime.issued_at;
  assert.throws(
    () => validatePersonalModelAdaptationAuthorization(invalidLifetime),
    /expires_at must follow issued_at/
  );
});

test('Pack bindings require current exact-owner and exact-base-model authorization', () => {
  const result = validatePersonalAgentPackV2Bindings(
    validPack(),
    [validAuthorization()]
  );
  assert.equal(result.valid, true);
  assert.equal(result.personalized_model_components, 1);
  assert.equal(result.bound_personalized_model_components, 1);
  assert.equal(result.grants_vault_access, false);
  assert.equal(result.grants_execution_authority, false);

  assert.throws(
    () => validatePersonalAgentPackV2Bindings(validPack(), []),
    /no matching adaptation authorization/
  );

  const wrongOwner = validAuthorization();
  wrongOwner.owner_subject_ref = 'subject:other';
  assert.throws(
    () => validatePersonalAgentPackV2Bindings(validPack(), [wrongOwner]),
    /adaptation owner does not match pack owner/
  );

  const wrongBase = validAuthorization();
  wrongBase.target.base_model_ref = 'model:other';
  assert.throws(
    () => validatePersonalAgentPackV2Bindings(validPack(), [wrongBase]),
    /base model does not match/
  );
});

test('Pack bindings cannot broaden authorized execution locations or use expired adaptation', () => {
  const broadened = validPack();
  broadened.companion_components[1].allowed_execution_location_refs.push('node:remote-1');
  assert.throws(
    () => validatePersonalAgentPackV2Bindings(broadened, [validAuthorization()]),
    /broadens an authorized execution location/
  );

  const expired = validAuthorization();
  expired.expires_at = '2026-08-22T16:15:00Z';
  assert.throws(
    () => validatePersonalAgentPackV2Bindings(validPack(), [expired]),
    /adaptation authorization is not current/
  );
});

test('Pack without personalized model does not require adaptation authorization', () => {
  const pack = validPack();
  pack.companion_components = pack.companion_components.filter(
    component => component.role !== 'personalized-model-artifact'
  );

  const result = validatePersonalAgentPackV2Bindings(pack, []);
  assert.equal(result.personalized_model_components, 0);
  assert.equal(result.bound_personalized_model_components, 0);
});
