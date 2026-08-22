import {
  assertPlainObject,
  assertString,
  digestObject,
  ValidationError
} from './canonical.mjs';

export const PERSONAL_AGENT_PACK_V2_SCHEMA = 'axiom-personal-agent-pack.v2';
export const PERSONAL_MODEL_ADAPTATION_AUTHORIZATION_V1_SCHEMA =
  'axiom-personal-model-adaptation-authorization.v1';

const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/;
const VERSION_PATTERN = /^[0-9]+\.[0-9]+\.[0-9]+(?:-[0-9A-Za-z.-]+)?$/;
const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const DATE_TIME_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;

const PACK_TOP_LEVEL_KEYS = Object.freeze([
  'schema',
  'pack_id',
  'pack_version',
  'owner_subject_ref',
  'created_at',
  'updated_at',
  'minimum_kernel_version',
  'manifest_sha256',
  'signature_ref',
  'vaults',
  'companion_components',
  'runtime_preferences',
  'recovery',
  'portability',
  'raw_vault_content_included',
  'secret_material_included',
  'grants_vault_access',
  'grants_execution_authority',
  'personalized_weights_are_verified_identity'
]);

const PACK_REQUIRED_KEYS = Object.freeze([
  'schema',
  'pack_id',
  'pack_version',
  'owner_subject_ref',
  'created_at',
  'vaults',
  'companion_components',
  'runtime_preferences',
  'recovery',
  'portability',
  'raw_vault_content_included',
  'secret_material_included',
  'grants_vault_access',
  'grants_execution_authority',
  'personalized_weights_are_verified_identity'
]);

const VAULT_KEYS = Object.freeze([
  'vault_id',
  'domain',
  'vault_manifest_ref',
  'vault_manifest_sha256',
  'recovery_policy_ref',
  'backup_refs',
  'selective_restore_supported'
]);

const COMPONENT_KEYS = Object.freeze([
  'component_id',
  'role',
  'media_type',
  'content_ref',
  'sha256',
  'encryption',
  'schema_ref',
  'licence_ref',
  'required_for_minimum_continuity',
  'training_authorization_ref',
  'base_model_ref',
  'allowed_execution_location_refs',
  'known_privacy_limitations',
  'deletion_retraining_consequences'
]);

const COMPONENT_ROLES = new Set([
  'agent-runtime-capsule',
  'correction-ledger',
  'evaluation-ledger',
  'preferences-accessibility',
  'owner-policy',
  'consent',
  'routing-policy',
  'voice-configuration',
  'avatar-persona-configuration',
  'semantic-index-metadata',
  'personalized-model-artifact',
  'recovery-metadata',
  'licence'
]);

const ENCRYPTION_CLASSES = new Set([
  'owner-local-encrypted',
  'recipient-encrypted',
  'public'
]);

const ROUTING_MODES = new Set(['private', 'balanced', 'best', 'budget']);

const ADAPTATION_TOP_LEVEL_KEYS = Object.freeze([
  'schema',
  'authorization_id',
  'owner_subject_ref',
  'purpose',
  'operation',
  'source_scope',
  'target',
  'execution',
  'source_data_retention',
  'resulting_artifact',
  'evaluation',
  'licence_and_use',
  'lifecycle',
  'issued_at',
  'expires_at',
  'wildcard_source_authority',
  'includes_secret_recovery_material',
  'grants_vault_access_to_resulting_model',
  'grants_execution_authority'
]);

const ADAPTATION_OPERATIONS = new Set([
  'lora-or-equivalent-adapter',
  'fine-tune',
  'distillation',
  'durable-embedding-index',
  'other-reviewed-adaptation'
]);

const SENSITIVITY_CLASSES = new Set([
  'ordinary-private',
  'sensitive',
  'restricted',
  'critical-secret'
]);

const OUTPUT_ARTIFACT_CLASSES = new Set([
  'personalized-adapter',
  'personalized-model',
  'personalized-derived-index'
]);

const ARTIFACT_CUSTODY_CLASSES = new Set([
  'owner-local-encrypted',
  'owner-controlled-remote-encrypted',
  'managed-encrypted'
]);

const ALLOWED_USE_SCOPES = new Set([
  'personal',
  'education',
  'work',
  'research',
  'commercial-owner-use',
  'restricted'
]);

const DELETION_CONSEQUENCES = new Set([
  'destroy-artifact',
  'retrain-without-revoked-source',
  'replace-artifact',
  'documented-mitigation-required'
]);

export function validatePersonalAgentPackV2(pack) {
  assertPlainObject(pack, 'personal agent pack');
  exactKeys(pack, PACK_TOP_LEVEL_KEYS, PACK_REQUIRED_KEYS, 'personal agent pack');

  assertConst(pack.schema, PERSONAL_AGENT_PACK_V2_SCHEMA, 'pack schema');
  assertId(pack.pack_id, 'pack_id');
  assertVersion(pack.pack_version, 'pack_version');
  assertId(pack.owner_subject_ref, 'owner_subject_ref');
  const createdAt = assertDateTime(pack.created_at, 'created_at');
  const updatedAt = pack.updated_at === undefined
    ? null
    : assertDateTime(pack.updated_at, 'updated_at');
  if (updatedAt && updatedAt < createdAt) {
    throw new ValidationError('updated_at cannot predate created_at');
  }
  if (pack.minimum_kernel_version !== undefined) {
    assertVersion(pack.minimum_kernel_version, 'minimum_kernel_version');
  }
  if (pack.manifest_sha256 !== undefined) {
    assertSha256(pack.manifest_sha256, 'manifest_sha256');
  }
  if (pack.signature_ref !== undefined) assertId(pack.signature_ref, 'signature_ref');

  const vaults = assertArray(pack.vaults, 'vaults', { min: 1, max: 128 });
  const vaultIds = new Set();
  for (const [index, vault] of vaults.entries()) {
    assertPlainObject(vault, `vaults[${index}]`);
    exactKeys(
      vault,
      VAULT_KEYS,
      [
        'vault_id',
        'domain',
        'vault_manifest_ref',
        'vault_manifest_sha256',
        'recovery_policy_ref',
        'selective_restore_supported'
      ],
      `vaults[${index}]`
    );
    const vaultId = assertId(vault.vault_id, `vaults[${index}].vault_id`);
    assertUnique(vaultIds, vaultId, 'vault_id');
    assertString(vault.domain, `vaults[${index}].domain`, { min: 1, max: 160 });
    assertString(vault.vault_manifest_ref, `vaults[${index}].vault_manifest_ref`, {
      min: 1,
      max: 1024
    });
    assertSha256(vault.vault_manifest_sha256, `vaults[${index}].vault_manifest_sha256`);
    assertId(vault.recovery_policy_ref, `vaults[${index}].recovery_policy_ref`);
    if (vault.backup_refs !== undefined) {
      assertRefList(vault.backup_refs, `vaults[${index}].backup_refs`, { min: 0, max: 256 });
    }
    assertBoolean(vault.selective_restore_supported, `vaults[${index}].selective_restore_supported`);
  }

  const components = assertArray(pack.companion_components, 'companion_components', {
    min: 1,
    max: 256
  });
  const componentIds = new Set();
  const personalizedComponents = [];
  for (const [index, component] of components.entries()) {
    assertPlainObject(component, `companion_components[${index}]`);
    exactKeys(
      component,
      COMPONENT_KEYS,
      [
        'component_id',
        'role',
        'media_type',
        'content_ref',
        'sha256',
        'encryption',
        'required_for_minimum_continuity'
      ],
      `companion_components[${index}]`
    );
    const componentId = assertId(
      component.component_id,
      `companion_components[${index}].component_id`
    );
    assertUnique(componentIds, componentId, 'component_id');
    assertEnum(component.role, COMPONENT_ROLES, `companion_components[${index}].role`);
    assertString(component.media_type, `companion_components[${index}].media_type`, {
      min: 3,
      max: 160
    });
    assertString(component.content_ref, `companion_components[${index}].content_ref`, {
      min: 1,
      max: 1024
    });
    assertSha256(component.sha256, `companion_components[${index}].sha256`);
    assertEnum(
      component.encryption,
      ENCRYPTION_CLASSES,
      `companion_components[${index}].encryption`
    );
    assertBoolean(
      component.required_for_minimum_continuity,
      `companion_components[${index}].required_for_minimum_continuity`
    );
    for (const optionalId of ['training_authorization_ref', 'base_model_ref']) {
      if (component[optionalId] !== undefined) {
        assertId(component[optionalId], `companion_components[${index}].${optionalId}`);
      }
    }
    for (const optionalRef of ['schema_ref', 'licence_ref']) {
      if (component[optionalRef] !== undefined) {
        assertString(component[optionalRef], `companion_components[${index}].${optionalRef}`, {
          min: 1,
          max: 512
        });
      }
    }
    if (component.allowed_execution_location_refs !== undefined) {
      assertRefList(
        component.allowed_execution_location_refs,
        `companion_components[${index}].allowed_execution_location_refs`,
        { min: 0, max: 256 }
      );
    }
    for (const optionalText of [
      'known_privacy_limitations',
      'deletion_retraining_consequences'
    ]) {
      if (component[optionalText] !== undefined) {
        assertString(component[optionalText], `companion_components[${index}].${optionalText}`, {
          min: 0,
          max: 4000
        });
      }
    }

    if (component.role === 'personalized-model-artifact') {
      for (const required of [
        'training_authorization_ref',
        'base_model_ref',
        'allowed_execution_location_refs',
        'known_privacy_limitations',
        'deletion_retraining_consequences'
      ]) {
        if (component[required] === undefined) {
          throw new ValidationError(
            `personalized-model-artifact ${componentId} requires ${required}`
          );
        }
      }
      assertRefList(
        component.allowed_execution_location_refs,
        `companion_components[${index}].allowed_execution_location_refs`,
        { min: 1, max: 256 }
      );
      personalizedComponents.push(component);
    }
  }

  validateRuntimePreferences(pack.runtime_preferences);
  validateRecovery(pack.recovery);
  validatePortability(pack.portability);
  assertConst(pack.raw_vault_content_included, false, 'raw_vault_content_included');
  assertConst(pack.secret_material_included, false, 'secret_material_included');
  assertConst(pack.grants_vault_access, false, 'grants_vault_access');
  assertConst(pack.grants_execution_authority, false, 'grants_execution_authority');
  assertConst(
    pack.personalized_weights_are_verified_identity,
    false,
    'personalized_weights_are_verified_identity'
  );

  return Object.freeze({
    valid: true,
    schema: PERSONAL_AGENT_PACK_V2_SCHEMA,
    pack_id: pack.pack_id,
    owner_subject_ref: pack.owner_subject_ref,
    vaults: vaults.length,
    companion_components: components.length,
    personalized_model_components: personalizedComponents.map(component => component.component_id),
    canonical_sha256: digestObject(pack),
    grants_vault_access: false,
    grants_execution_authority: false
  });
}

export function validatePersonalModelAdaptationAuthorization(authorization) {
  assertPlainObject(authorization, 'personal model adaptation authorization');
  exactKeys(
    authorization,
    ADAPTATION_TOP_LEVEL_KEYS,
    ADAPTATION_TOP_LEVEL_KEYS,
    'personal model adaptation authorization'
  );

  assertConst(
    authorization.schema,
    PERSONAL_MODEL_ADAPTATION_AUTHORIZATION_V1_SCHEMA,
    'adaptation schema'
  );
  assertId(authorization.authorization_id, 'authorization_id');
  assertId(authorization.owner_subject_ref, 'owner_subject_ref');
  assertString(authorization.purpose, 'purpose', { min: 1, max: 500 });
  assertEnum(authorization.operation, ADAPTATION_OPERATIONS, 'operation');

  const sourceScope = assertArray(authorization.source_scope, 'source_scope', {
    min: 1,
    max: 128
  });
  const sourceVaultIds = new Set();
  for (const [index, source] of sourceScope.entries()) {
    assertPlainObject(source, `source_scope[${index}]`);
    exactKeys(
      source,
      [
        'vault_id',
        'resource_refs',
        'purpose_authorized',
        'maximum_sensitivity',
        'source_policy_decision_ref',
        'owner_confirmation_ref'
      ],
      ['vault_id', 'resource_refs', 'purpose_authorized', 'maximum_sensitivity'],
      `source_scope[${index}]`
    );
    const vaultId = assertId(source.vault_id, `source_scope[${index}].vault_id`);
    assertUnique(sourceVaultIds, vaultId, 'source_scope vault_id');
    assertRefList(source.resource_refs, `source_scope[${index}].resource_refs`, {
      min: 1,
      max: 4096
    });
    assertConst(source.purpose_authorized, true, `source_scope[${index}].purpose_authorized`);
    assertEnum(
      source.maximum_sensitivity,
      SENSITIVITY_CLASSES,
      `source_scope[${index}].maximum_sensitivity`
    );
    if (source.source_policy_decision_ref !== undefined) {
      assertId(
        source.source_policy_decision_ref,
        `source_scope[${index}].source_policy_decision_ref`
      );
    }
    if (source.owner_confirmation_ref !== undefined) {
      assertId(source.owner_confirmation_ref, `source_scope[${index}].owner_confirmation_ref`);
    }
  }

  const target = assertPlainObject(authorization.target, 'target');
  exactKeys(
    target,
    ['base_model_ref', 'base_model_digest_or_version_ref', 'output_artifact_class'],
    ['base_model_ref', 'base_model_digest_or_version_ref', 'output_artifact_class'],
    'target'
  );
  assertId(target.base_model_ref, 'target.base_model_ref');
  assertString(target.base_model_digest_or_version_ref, 'target.base_model_digest_or_version_ref', {
    min: 1,
    max: 512
  });
  assertEnum(target.output_artifact_class, OUTPUT_ARTIFACT_CLASSES, 'target.output_artifact_class');

  const execution = assertPlainObject(authorization.execution, 'execution');
  exactKeys(
    execution,
    [
      'execution_location_ref',
      'provider_ref',
      'destination_ref',
      'local_only',
      'source_data_egress_allowed',
      'egress_policy_decision_ref'
    ],
    ['execution_location_ref', 'local_only', 'source_data_egress_allowed'],
    'execution'
  );
  assertId(execution.execution_location_ref, 'execution.execution_location_ref');
  if (execution.provider_ref !== undefined) assertId(execution.provider_ref, 'execution.provider_ref');
  if (execution.destination_ref !== undefined) {
    assertId(execution.destination_ref, 'execution.destination_ref');
  }
  assertBoolean(execution.local_only, 'execution.local_only');
  assertBoolean(execution.source_data_egress_allowed, 'execution.source_data_egress_allowed');
  if (execution.egress_policy_decision_ref !== undefined) {
    assertId(execution.egress_policy_decision_ref, 'execution.egress_policy_decision_ref');
  }
  if (execution.local_only && execution.source_data_egress_allowed) {
    throw new ValidationError('local-only adaptation cannot allow source-data egress');
  }
  if (execution.source_data_egress_allowed && execution.egress_policy_decision_ref === undefined) {
    throw new ValidationError('source-data egress requires an egress policy decision reference');
  }

  validateSourceRetention(authorization.source_data_retention);
  validateResultingArtifact(authorization.resulting_artifact);
  validateEvaluation(authorization.evaluation);
  validateLicenceAndUse(authorization.licence_and_use);
  validateLifecycle(authorization.lifecycle);

  const issuedAt = assertDateTime(authorization.issued_at, 'issued_at');
  const expiresAt = assertDateTime(authorization.expires_at, 'expires_at');
  if (!(issuedAt < expiresAt)) {
    throw new ValidationError('expires_at must follow issued_at');
  }

  assertConst(authorization.wildcard_source_authority, false, 'wildcard_source_authority');
  assertConst(
    authorization.includes_secret_recovery_material,
    false,
    'includes_secret_recovery_material'
  );
  assertConst(
    authorization.grants_vault_access_to_resulting_model,
    false,
    'grants_vault_access_to_resulting_model'
  );
  assertConst(authorization.grants_execution_authority, false, 'grants_execution_authority');

  return Object.freeze({
    valid: true,
    schema: PERSONAL_MODEL_ADAPTATION_AUTHORIZATION_V1_SCHEMA,
    authorization_id: authorization.authorization_id,
    owner_subject_ref: authorization.owner_subject_ref,
    source_vaults: sourceScope.length,
    canonical_sha256: digestObject(authorization),
    grants_vault_access_to_resulting_model: false,
    grants_execution_authority: false
  });
}

export function validatePersonalAgentPackV2Bindings(
  pack,
  authorizations,
  { at = pack?.updated_at ?? pack?.created_at } = {}
) {
  const packResult = validatePersonalAgentPackV2(pack);
  const referenceTime = assertDateTime(at, 'binding reference time');
  const authorizationMap = new Map();

  for (const authorization of assertArray(authorizations, 'authorizations', { min: 0, max: 256 })) {
    validatePersonalModelAdaptationAuthorization(authorization);
    if (authorizationMap.has(authorization.authorization_id)) {
      throw new ValidationError(
        `duplicate adaptation authorization_id: ${authorization.authorization_id}`
      );
    }
    authorizationMap.set(authorization.authorization_id, authorization);
  }

  let boundPersonalizedArtifacts = 0;
  for (const component of pack.companion_components) {
    if (component.role !== 'personalized-model-artifact') continue;
    const authorization = authorizationMap.get(component.training_authorization_ref);
    if (!authorization) {
      throw new ValidationError(
        `personalized model component ${component.component_id} has no matching adaptation authorization`
      );
    }
    if (authorization.owner_subject_ref !== pack.owner_subject_ref) {
      throw new ValidationError(
        `personalized model component ${component.component_id} adaptation owner does not match pack owner`
      );
    }
    if (authorization.target.base_model_ref !== component.base_model_ref) {
      throw new ValidationError(
        `personalized model component ${component.component_id} base model does not match its adaptation authorization`
      );
    }
    const issuedAt = assertDateTime(authorization.issued_at, 'authorization issued_at');
    const expiresAt = assertDateTime(authorization.expires_at, 'authorization expires_at');
    if (referenceTime < issuedAt || referenceTime >= expiresAt) {
      throw new ValidationError(
        `personalized model component ${component.component_id} adaptation authorization is not current`
      );
    }
    const allowedLocations = new Set(
      authorization.resulting_artifact.allowed_execution_location_refs
    );
    for (const location of component.allowed_execution_location_refs) {
      if (!allowedLocations.has(location)) {
        throw new ValidationError(
          `personalized model component ${component.component_id} broadens an authorized execution location`
        );
      }
    }
    boundPersonalizedArtifacts += 1;
  }

  return Object.freeze({
    valid: true,
    pack_id: packResult.pack_id,
    owner_subject_ref: packResult.owner_subject_ref,
    personalized_model_components: packResult.personalized_model_components.length,
    bound_personalized_model_components: boundPersonalizedArtifacts,
    reference_time: at,
    grants_vault_access: false,
    grants_execution_authority: false
  });
}

function validateRuntimePreferences(preferences) {
  assertPlainObject(preferences, 'runtime_preferences');
  exactKeys(
    preferences,
    [
      'routing_mode',
      'allowed_capsule_ids',
      'denied_capsule_ids',
      'allowed_provider_ids',
      'denied_provider_ids',
      'pinned_model_ids',
      'base_model_replaceable'
    ],
    ['routing_mode', 'allowed_capsule_ids', 'allowed_provider_ids', 'base_model_replaceable'],
    'runtime_preferences'
  );
  assertEnum(preferences.routing_mode, ROUTING_MODES, 'runtime_preferences.routing_mode');
  const allowedCapsules = assertRefList(
    preferences.allowed_capsule_ids,
    'runtime_preferences.allowed_capsule_ids',
    { min: 0, max: 256 }
  );
  const deniedCapsules = preferences.denied_capsule_ids === undefined
    ? []
    : assertRefList(preferences.denied_capsule_ids, 'runtime_preferences.denied_capsule_ids', {
        min: 0,
        max: 256
      });
  const allowedProviders = assertRefList(
    preferences.allowed_provider_ids,
    'runtime_preferences.allowed_provider_ids',
    { min: 0, max: 256 }
  );
  const deniedProviders = preferences.denied_provider_ids === undefined
    ? []
    : assertRefList(preferences.denied_provider_ids, 'runtime_preferences.denied_provider_ids', {
        min: 0,
        max: 256
      });
  if (preferences.pinned_model_ids !== undefined) {
    assertRefList(preferences.pinned_model_ids, 'runtime_preferences.pinned_model_ids', {
      min: 0,
      max: 256
    });
  }
  assertNoOverlap(allowedCapsules, deniedCapsules, 'capsule allow/deny lists');
  assertNoOverlap(allowedProviders, deniedProviders, 'provider allow/deny lists');
  assertConst(preferences.base_model_replaceable, true, 'runtime_preferences.base_model_replaceable');
}

function validateRecovery(recovery) {
  assertPlainObject(recovery, 'recovery');
  exactKeys(
    recovery,
    [
      'pack_backup_refs',
      'selective_restore_supported',
      'cross_vault_key_dependency',
      'recovery_secret_material_in_pack',
      'recovery_policy_ref'
    ],
    [
      'pack_backup_refs',
      'selective_restore_supported',
      'cross_vault_key_dependency',
      'recovery_secret_material_in_pack'
    ],
    'recovery'
  );
  assertRefList(recovery.pack_backup_refs, 'recovery.pack_backup_refs', { min: 0, max: 256 });
  assertConst(recovery.selective_restore_supported, true, 'recovery.selective_restore_supported');
  assertConst(recovery.cross_vault_key_dependency, false, 'recovery.cross_vault_key_dependency');
  assertConst(
    recovery.recovery_secret_material_in_pack,
    false,
    'recovery.recovery_secret_material_in_pack'
  );
  if (recovery.recovery_policy_ref !== undefined) {
    assertId(recovery.recovery_policy_ref, 'recovery.recovery_policy_ref');
  }
}

function validatePortability(portability) {
  assertPlainObject(portability, 'portability');
  exactKeys(
    portability,
    [
      'subscription_required_for_export',
      'single_provider_required',
      'single_model_family_required',
      'missing_optional_component_may_be_silently_substituted'
    ],
    [
      'subscription_required_for_export',
      'single_provider_required',
      'single_model_family_required',
      'missing_optional_component_may_be_silently_substituted'
    ],
    'portability'
  );
  assertConst(
    portability.subscription_required_for_export,
    false,
    'portability.subscription_required_for_export'
  );
  assertConst(portability.single_provider_required, false, 'portability.single_provider_required');
  assertConst(
    portability.single_model_family_required,
    false,
    'portability.single_model_family_required'
  );
  assertConst(
    portability.missing_optional_component_may_be_silently_substituted,
    false,
    'portability.missing_optional_component_may_be_silently_substituted'
  );
}

function validateSourceRetention(retention) {
  assertPlainObject(retention, 'source_data_retention');
  exactKeys(
    retention,
    [
      'provider_may_retain_source',
      'max_source_retention_seconds',
      'source_may_be_used_for_provider_training'
    ],
    [
      'provider_may_retain_source',
      'max_source_retention_seconds',
      'source_may_be_used_for_provider_training'
    ],
    'source_data_retention'
  );
  assertBoolean(retention.provider_may_retain_source, 'source_data_retention.provider_may_retain_source');
  assertInteger(
    retention.max_source_retention_seconds,
    'source_data_retention.max_source_retention_seconds',
    { min: 0, max: 31536000 }
  );
  assertConst(
    retention.source_may_be_used_for_provider_training,
    false,
    'source_data_retention.source_may_be_used_for_provider_training'
  );
}

function validateResultingArtifact(artifact) {
  assertPlainObject(artifact, 'resulting_artifact');
  exactKeys(
    artifact,
    [
      'custody',
      'allowed_execution_location_refs',
      'exportable_by_owner',
      'public_by_default',
      'retention_policy_ref'
    ],
    ['custody', 'allowed_execution_location_refs', 'exportable_by_owner', 'public_by_default'],
    'resulting_artifact'
  );
  assertEnum(artifact.custody, ARTIFACT_CUSTODY_CLASSES, 'resulting_artifact.custody');
  assertRefList(
    artifact.allowed_execution_location_refs,
    'resulting_artifact.allowed_execution_location_refs',
    { min: 1, max: 128 }
  );
  assertBoolean(artifact.exportable_by_owner, 'resulting_artifact.exportable_by_owner');
  assertConst(artifact.public_by_default, false, 'resulting_artifact.public_by_default');
  if (artifact.retention_policy_ref !== undefined) {
    assertId(artifact.retention_policy_ref, 'resulting_artifact.retention_policy_ref');
  }
}

function validateEvaluation(evaluation) {
  assertPlainObject(evaluation, 'evaluation');
  exactKeys(
    evaluation,
    [
      'baseline_refs',
      'privacy_memorization_review_required',
      'usefulness_regression_review_required',
      'additional_evaluation_refs'
    ],
    [
      'baseline_refs',
      'privacy_memorization_review_required',
      'usefulness_regression_review_required'
    ],
    'evaluation'
  );
  assertRefList(evaluation.baseline_refs, 'evaluation.baseline_refs', { min: 1, max: 256 });
  assertConst(
    evaluation.privacy_memorization_review_required,
    true,
    'evaluation.privacy_memorization_review_required'
  );
  assertConst(
    evaluation.usefulness_regression_review_required,
    true,
    'evaluation.usefulness_regression_review_required'
  );
  if (evaluation.additional_evaluation_refs !== undefined) {
    assertRefList(evaluation.additional_evaluation_refs, 'evaluation.additional_evaluation_refs', {
      min: 1,
      max: 256
    });
  }
}

function validateLicenceAndUse(licenceAndUse) {
  assertPlainObject(licenceAndUse, 'licence_and_use');
  exactKeys(
    licenceAndUse,
    ['licence_refs', 'allowed_use_scopes'],
    ['licence_refs', 'allowed_use_scopes'],
    'licence_and_use'
  );
  assertRefList(licenceAndUse.licence_refs, 'licence_and_use.licence_refs', {
    min: 1,
    max: 256
  });
  const scopes = assertArray(licenceAndUse.allowed_use_scopes, 'licence_and_use.allowed_use_scopes', {
    min: 1,
    max: 16
  });
  const seen = new Set();
  for (const [index, scope] of scopes.entries()) {
    assertEnum(scope, ALLOWED_USE_SCOPES, `licence_and_use.allowed_use_scopes[${index}]`);
    assertUnique(seen, scope, 'allowed use scope');
  }
}

function validateLifecycle(lifecycle) {
  assertPlainObject(lifecycle, 'lifecycle');
  exactKeys(
    lifecycle,
    [
      'revocation_stops_future_adaptation',
      'source_deletion_guarantees_weight_unlearning',
      'deletion_retraining_consequence',
      'artifact_deletion_supported',
      'lifecycle_policy_ref'
    ],
    [
      'revocation_stops_future_adaptation',
      'source_deletion_guarantees_weight_unlearning',
      'deletion_retraining_consequence',
      'artifact_deletion_supported'
    ],
    'lifecycle'
  );
  assertConst(
    lifecycle.revocation_stops_future_adaptation,
    true,
    'lifecycle.revocation_stops_future_adaptation'
  );
  assertConst(
    lifecycle.source_deletion_guarantees_weight_unlearning,
    false,
    'lifecycle.source_deletion_guarantees_weight_unlearning'
  );
  assertEnum(
    lifecycle.deletion_retraining_consequence,
    DELETION_CONSEQUENCES,
    'lifecycle.deletion_retraining_consequence'
  );
  assertBoolean(lifecycle.artifact_deletion_supported, 'lifecycle.artifact_deletion_supported');
  if (lifecycle.lifecycle_policy_ref !== undefined) {
    assertId(lifecycle.lifecycle_policy_ref, 'lifecycle.lifecycle_policy_ref');
  }
}

function exactKeys(value, allowed, required, name) {
  const allowedSet = new Set(allowed);
  for (const key of Object.keys(value)) {
    if (!allowedSet.has(key)) throw new ValidationError(`${name} contains unknown field ${key}`);
  }
  for (const key of required) {
    if (!Object.hasOwn(value, key)) throw new ValidationError(`${name} is missing required field ${key}`);
  }
}

function assertArray(value, name, { min = 0, max = 256 } = {}) {
  if (!Array.isArray(value) || value.length < min || value.length > max) {
    throw new ValidationError(`${name} must contain ${min}-${max} items`);
  }
  return value;
}

function assertId(value, name) {
  return assertString(value, name, { min: 1, max: 160, pattern: ID_PATTERN });
}

function assertVersion(value, name) {
  return assertString(value, name, { min: 5, max: 160, pattern: VERSION_PATTERN });
}

function assertSha256(value, name) {
  return assertString(value, name, { min: 64, max: 64, pattern: SHA256_PATTERN });
}

function assertDateTime(value, name) {
  assertString(value, name, { min: 20, max: 64, pattern: DATE_TIME_PATTERN });
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) throw new ValidationError(`${name} is not a valid date-time`);
  return timestamp;
}

function assertRefList(value, name, { min = 0, max = 256 } = {}) {
  const list = assertArray(value, name, { min, max });
  const seen = new Set();
  for (const [index, ref] of list.entries()) {
    const normalized = assertId(ref, `${name}[${index}]`);
    assertUnique(seen, normalized, `${name} reference`);
  }
  return list;
}

function assertBoolean(value, name) {
  if (typeof value !== 'boolean') throw new ValidationError(`${name} must be a boolean`);
  return value;
}

function assertInteger(value, name, { min, max }) {
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new ValidationError(`${name} must be an integer between ${min} and ${max}`);
  }
  return value;
}

function assertConst(value, expected, name) {
  if (value !== expected) {
    throw new ValidationError(`${name} must equal ${JSON.stringify(expected)}`);
  }
  return value;
}

function assertEnum(value, allowed, name) {
  if (!allowed.has(value)) throw new ValidationError(`${name} has an unsupported value`);
  return value;
}

function assertUnique(seen, value, name) {
  if (seen.has(value)) throw new ValidationError(`duplicate ${name}: ${value}`);
  seen.add(value);
}

function assertNoOverlap(left, right, name) {
  const rightSet = new Set(right);
  for (const value of left) {
    if (rightSet.has(value)) throw new ValidationError(`${name} overlap on ${value}`);
  }
}
