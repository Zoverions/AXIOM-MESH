import assert from 'node:assert/strict';
import test from 'node:test';
import { buildPersonalAgentPackRestorePlan } from '../src/lib/personal-agent-pack-restore-plan.mjs';

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
    minimum_kernel_version: '0.12.0-dev.3',
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

function fullObservations() {
  return [
    {
      content_ref: 'manifest:vault-memory',
      available: true,
      observed_sha256: SHA_A
    },
    {
      content_ref: 'content:corrections',
      available: true,
      observed_sha256: SHA_B
    },
    {
      content_ref: 'content:personalized-adapter',
      available: true,
      observed_sha256: SHA_C
    }
  ];
}

function fullEnvironment() {
  return {
    kernel_version: '0.12.0-dev.3',
    available_capsule_ids: ['capsule:companion'],
    available_provider_ids: [],
    available_model_ids: ['model:base-1'],
    available_execution_location_refs: ['node:local-1']
  };
}

function clone(value) {
  return structuredClone(value);
}

test('complete artifact observations produce a deterministic full restore plan', () => {
  const pack = validPack();
  const original = clone(pack);
  const first = buildPersonalAgentPackRestorePlan(
    pack,
    fullObservations(),
    fullEnvironment()
  );
  const second = buildPersonalAgentPackRestorePlan(
    pack,
    [...fullObservations()].reverse(),
    {
      ...fullEnvironment(),
      available_model_ids: [...fullEnvironment().available_model_ids].reverse()
    }
  );

  assert.equal(first.restore_ready, true);
  assert.equal(first.continuity_status, 'full');
  assert.deepEqual(first.blockers, []);
  assert.deepEqual(first.warnings, []);
  assert.equal(first.plan_sha256, second.plan_sha256);
  assert.deepEqual(pack, original);
  assert.equal(Object.isFrozen(first), true);
  assert.equal(Object.isFrozen(first.vaults[0]), true);
});

test('planner is plan-only and requires fresh post-restore vault leases', () => {
  const plan = buildPersonalAgentPackRestorePlan(
    validPack(),
    fullObservations(),
    fullEnvironment()
  );

  assert.deepEqual(plan.authority_boundary, {
    opens_or_decrypts_vaults: false,
    writes_files: false,
    performs_network_effects: false,
    substitutes_missing_components: false,
    restores_secret_material_from_pack: false,
    artifact_observation_is_content_authenticity_proof: false,
    fresh_vault_access_leases_required_after_restore: true,
    grants_vault_access: false,
    grants_execution_authority: false
  });
  assert.equal(plan.vaults[0].independently_recoverable, true);
  assert.equal(plan.vaults[0].cross_vault_key_dependency_allowed, false);
  assert.equal(plan.vaults[0].planner_opens_or_decrypts_vault, false);
  assert.equal(plan.vaults[0].fresh_access_lease_required_after_restore, true);
});

test('missing or mismatched required artifacts block restore', () => {
  const missingRequired = fullObservations().filter(
    observation => observation.content_ref !== 'content:corrections'
  );
  const missingPlan = buildPersonalAgentPackRestorePlan(
    validPack(),
    missingRequired,
    fullEnvironment()
  );
  assert.equal(missingPlan.restore_ready, false);
  assert.ok(missingPlan.blockers.includes(
    'required-component-missing:component:corrections'
  ));

  const mismatch = fullObservations();
  mismatch.find(entry => entry.content_ref === 'manifest:vault-memory').observed_sha256 = SHA_C;
  const mismatchPlan = buildPersonalAgentPackRestorePlan(
    validPack(),
    mismatch,
    fullEnvironment()
  );
  assert.equal(mismatchPlan.restore_ready, false);
  assert.ok(mismatchPlan.blockers.includes('vault-manifest-digest-mismatch:vault:memory'));
});

test('missing optional component is explicit degraded continuity, never substitution', () => {
  const observations = fullObservations().filter(
    observation => observation.content_ref !== 'content:personalized-adapter'
  );
  const plan = buildPersonalAgentPackRestorePlan(
    validPack(),
    observations,
    fullEnvironment()
  );
  const component = plan.components.find(
    candidate => candidate.component_id === 'component:personalized'
  );

  assert.equal(plan.restore_ready, true);
  assert.equal(plan.continuity_status, 'degraded');
  assert.ok(plan.warnings.includes('optional-component-missing:component:personalized'));
  assert.equal(component.planned_action, 'owner-decision-required');
  assert.equal(component.silent_substitution_allowed, false);
});

test('optional digest mismatch is degraded and does not restore the mismatched artifact', () => {
  const observations = fullObservations();
  observations.find(
    entry => entry.content_ref === 'content:personalized-adapter'
  ).observed_sha256 = SHA_A;
  const plan = buildPersonalAgentPackRestorePlan(
    validPack(),
    observations,
    fullEnvironment()
  );
  const component = plan.components.find(
    candidate => candidate.component_id === 'component:personalized'
  );

  assert.equal(plan.restore_ready, true);
  assert.ok(plan.warnings.includes(
    'optional-component-digest-mismatch:component:personalized'
  ));
  assert.equal(component.artifact_observation_state, 'digest-mismatch');
  assert.equal(component.planned_action, 'owner-decision-required');
});

test('kernel below the Pack minimum is an explicit restore blocker', () => {
  const environment = fullEnvironment();
  environment.kernel_version = '0.11.9';
  const plan = buildPersonalAgentPackRestorePlan(
    validPack(),
    fullObservations(),
    environment
  );

  assert.equal(plan.restore_ready, false);
  assert.equal(plan.compatibility.kernel.state, 'incompatible');
  assert.ok(plan.blockers.includes('kernel-version-below-pack-minimum'));
});

test('missing runtime or pinned model is a degraded continuity warning', () => {
  const environment = fullEnvironment();
  environment.available_capsule_ids = ['capsule:other'];
  environment.available_model_ids = ['model:other'];
  const plan = buildPersonalAgentPackRestorePlan(
    validPack(),
    fullObservations(),
    environment
  );

  assert.equal(plan.restore_ready, true);
  assert.equal(plan.continuity_status, 'degraded');
  assert.ok(plan.warnings.includes('runtime-capsule-availability-degraded'));
  assert.ok(plan.warnings.includes('pinned-model-availability-degraded'));
});

test('personalized execution location loss is warning unless component is required', () => {
  const environment = fullEnvironment();
  environment.available_execution_location_refs = ['node:other'];
  const optionalPlan = buildPersonalAgentPackRestorePlan(
    validPack(),
    fullObservations(),
    environment
  );
  assert.equal(optionalPlan.restore_ready, true);
  assert.ok(optionalPlan.warnings.includes(
    'optional-personalized-execution-unavailable:component:personalized'
  ));

  const requiredPack = validPack();
  requiredPack.companion_components[1].required_for_minimum_continuity = true;
  const requiredPlan = buildPersonalAgentPackRestorePlan(
    requiredPack,
    fullObservations(),
    environment
  );
  assert.equal(requiredPlan.restore_ready, false);
  assert.ok(requiredPlan.blockers.includes(
    'required-personalized-execution-unavailable:component:personalized'
  ));
});

test('vault backup omission is visible but does not invent a recovery source', () => {
  const pack = validPack();
  delete pack.vaults[0].backup_refs;
  const plan = buildPersonalAgentPackRestorePlan(
    pack,
    fullObservations(),
    fullEnvironment()
  );

  assert.equal(plan.restore_ready, true);
  assert.ok(plan.warnings.includes('vault-backup-source-not-declared:vault:memory'));
  assert.deepEqual(plan.vaults[0].backup_refs, []);
  assert.equal(
    plan.vaults[0].backup_integrity_verification_deferred_to_vault_recovery,
    true
  );
});

test('artifact observations fail closed on duplicates and contradictory digest claims', () => {
  const duplicate = fullObservations();
  duplicate.push(clone(duplicate[0]));
  assert.throws(
    () => buildPersonalAgentPackRestorePlan(validPack(), duplicate, fullEnvironment()),
    /duplicate artifact observation/
  );

  const noDigest = fullObservations();
  delete noDigest[0].observed_sha256;
  assert.throws(
    () => buildPersonalAgentPackRestorePlan(validPack(), noDigest, fullEnvironment()),
    /requires observed_sha256/
  );

  const unavailableWithDigest = fullObservations();
  unavailableWithDigest[0].available = false;
  assert.throws(
    () => buildPersonalAgentPackRestorePlan(
      validPack(),
      unavailableWithDigest,
      fullEnvironment()
    ),
    /cannot assert observed_sha256/
  );
});

test('unassessed compatibility is surfaced instead of silently assumed', () => {
  const plan = buildPersonalAgentPackRestorePlan(
    validPack(),
    fullObservations(),
    {}
  );

  assert.equal(plan.restore_ready, true);
  assert.equal(plan.continuity_status, 'degraded');
  assert.ok(plan.warnings.includes('kernel-compatibility-unassessed'));
  assert.ok(plan.warnings.includes('runtime-capsule-availability-unassessed'));
  assert.ok(plan.warnings.includes('pinned-model-availability-unassessed'));
  assert.ok(plan.warnings.includes(
    'personalized-execution-unassessed:component:personalized'
  ));
});
