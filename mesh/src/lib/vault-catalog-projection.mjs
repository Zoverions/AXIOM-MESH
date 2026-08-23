import { createPublicKey } from 'node:crypto';

import {
  ValidationError,
  assertPlainObject,
  assertString,
  canonicalJson,
  digestObject
} from './canonical.mjs';
import { verifyObjectSignature } from './identity.mjs';
import {
  CONTEXT_VAULT_CATALOG_ENTRY_V1_SCHEMA,
  validateContextVaultCatalogEntry
} from './context-retrieval-planner.mjs';

export const SOVEREIGN_VAULT_V1_SCHEMA = 'axiom-sovereign-vault.v1';
export const VAULT_SEMANTIC_INDEX_V1_SCHEMA = 'axiom-vault-semantic-index.v1';

const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/;
const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const SENSITIVITY = new Set([
  'ordinary-private',
  'sensitive',
  'restricted',
  'critical-secret'
]);
const ACCESS = new Set([
  'none',
  'metadata-only',
  'lease-read',
  'lease-read-derive'
]);
const STORAGE_CUSTODY = new Set([
  'owner-local',
  'owner-controlled-remote',
  'managed-encrypted'
]);
const OPERATION = new Set(['read', 'derive']);

export function projectContextVaultCatalogEntry({
  vaultManifest,
  semanticIndex,
  trustedIndexer,
  now = Date.now()
} = {}) {
  const manifest = validateSovereignVaultManifest(vaultManifest);
  const verifiedIndex = verifyVaultSemanticIndex(semanticIndex, {
    trustedIndexer,
    now
  });

  if (!manifest.content_manifest_ref || !manifest.content_manifest_sha256) {
    throw new ValidationError(
      'Retrievable Sovereign Vault manifest must bind a content manifest reference and sha256'
    );
  }
  if (
    verifiedIndex.vault_id !== manifest.vault_id
    || verifiedIndex.owner_subject_ref !== manifest.owner_subject_ref
    || verifiedIndex.content_manifest_ref !== manifest.content_manifest_ref
    || verifiedIndex.content_manifest_sha256 !== manifest.content_manifest_sha256
  ) {
    throw new ValidationError(
      'Vault semantic index does not match the exact governed vault content manifest'
    );
  }

  const access = manifest.access_policy.local_companion_access;
  if (!['lease-read', 'lease-read-derive'].includes(access)) {
    throw new ValidationError(
      'Sovereign Vault does not permit lease-bound content retrieval for the local companion'
    );
  }
  const maxLeaseSeconds = manifest.access_policy.max_local_lease_seconds;
  if (!Number.isSafeInteger(maxLeaseSeconds)) {
    throw new ValidationError(
      'Retrievable Sovereign Vault must declare max_local_lease_seconds'
    );
  }

  const allowedOperations = access === 'lease-read'
    ? new Set(['read'])
    : new Set(['read', 'derive']);
  for (const capability of verifiedIndex.semantic_capabilities) {
    for (const operation of capability.operations) {
      if (!allowedOperations.has(operation)) {
        throw new ValidationError(
          'Vault semantic index claims an operation not permitted by the governed vault manifest'
        );
      }
    }
  }

  const projection = {
    schema: CONTEXT_VAULT_CATALOG_ENTRY_V1_SCHEMA,
    vault_id: manifest.vault_id,
    owner_subject_ref: manifest.owner_subject_ref,
    domain: manifest.domain,
    sensitivity_ceiling: manifest.sensitivity_ceiling,
    local_companion_access: access,
    local_lease_required: true,
    max_local_lease_seconds: maxLeaseSeconds,
    cross_vault_synthesis: manifest.access_policy.cross_vault_synthesis,
    raw_external_disclosure: manifest.access_policy.raw_external_disclosure,
    allowed_purposes: [...manifest.access_policy.allowed_purposes].sort(),
    high_risk_disclosure_requires_owner_confirmation:
      manifest.access_policy.high_risk_disclosure_requires_owner_confirmation ?? true,
    semantic_capabilities: verifiedIndex.semantic_capabilities.map(capability => ({
      semantic_type: capability.semantic_type,
      resource_refs: [...capability.resource_refs].sort(),
      sensitivity: capability.sensitivity,
      operations: [...capability.operations].sort()
    })),
    secret_material_in_catalog: false
  };
  validateContextVaultCatalogEntry(projection);

  return deepFreeze({
    catalog_entry: projection,
    provenance: {
      vault_manifest_sha256: digestObject(manifest),
      content_manifest_ref: manifest.content_manifest_ref,
      content_manifest_sha256: manifest.content_manifest_sha256,
      semantic_index_id: verifiedIndex.index_id,
      semantic_index_sha256: verifiedIndex.index_sha256,
      indexer_principal_ref: verifiedIndex.indexer_principal_ref,
      indexer_key_id: verifiedIndex.indexer_key_id,
      semantic_index_signature_verified: true
    },
    local_only: true,
    recipient_visible: false,
    contains_raw_vault_content: false,
    contains_secret_material: false,
    reads_vaults: false,
    issues_leases: false,
    grants_vault_access: false,
    grants_execution_authority: false
  });
}

export function validateSovereignVaultManifest(input) {
  const value = cloneCanonical(input, 'Sovereign Vault manifest');
  exactKeys(value, new Set([
    'schema', 'vault_id', 'owner_subject_ref', 'parent_vault_ref', 'domain',
    'sensitivity_ceiling', 'key_domain_ref', 'storage_policy', 'access_policy',
    'recovery_policy', 'content_manifest_ref', 'content_manifest_sha256',
    'created_at', 'updated_at', 'secret_material_in_manifest'
  ]), new Set([
    'schema', 'vault_id', 'owner_subject_ref', 'domain', 'sensitivity_ceiling',
    'key_domain_ref', 'storage_policy', 'access_policy', 'recovery_policy',
    'secret_material_in_manifest'
  ]), 'Sovereign Vault manifest');

  if (value.schema !== SOVEREIGN_VAULT_V1_SCHEMA) {
    throw new ValidationError('Sovereign Vault manifest schema is invalid');
  }
  assertId(value.vault_id, 'vault manifest vault_id');
  assertId(value.owner_subject_ref, 'vault manifest owner_subject_ref');
  if (value.parent_vault_ref !== undefined) {
    assertId(value.parent_vault_ref, 'vault manifest parent_vault_ref');
  }
  assertString(value.domain, 'vault manifest domain', { min: 1, max: 160 });
  assertEnum(value.sensitivity_ceiling, SENSITIVITY, 'vault manifest sensitivity_ceiling');
  assertId(value.key_domain_ref, 'vault manifest key_domain_ref');

  validateStoragePolicy(value.storage_policy);
  validateAccessPolicy(value.access_policy);
  validateRecoveryPolicy(value.recovery_policy);

  if (value.content_manifest_ref !== undefined) {
    assertString(value.content_manifest_ref, 'vault manifest content_manifest_ref', {
      min: 1,
      max: 1024
    });
  }
  if (value.content_manifest_sha256 !== undefined) {
    assertSha256(value.content_manifest_sha256, 'vault manifest content_manifest_sha256');
  }
  if (
    (value.content_manifest_ref === undefined)
    !== (value.content_manifest_sha256 === undefined)
  ) {
    throw new ValidationError(
      'Sovereign Vault content manifest reference and digest must appear together'
    );
  }
  if (value.created_at !== undefined) assertDateTime(value.created_at, 'vault manifest created_at');
  if (value.updated_at !== undefined) assertDateTime(value.updated_at, 'vault manifest updated_at');
  if (
    value.created_at !== undefined
    && value.updated_at !== undefined
    && Date.parse(value.updated_at) < Date.parse(value.created_at)
  ) {
    throw new ValidationError('Sovereign Vault updated_at cannot precede created_at');
  }
  if (value.secret_material_in_manifest !== false) {
    throw new ValidationError('Sovereign Vault manifest cannot contain secret material');
  }
  return deepFreeze(value);
}

export function verifyVaultSemanticIndex(input, {
  trustedIndexer,
  now = Date.now()
} = {}) {
  if (!Number.isSafeInteger(now) || now < 0) {
    throw new ValidationError('Vault semantic index verification time is invalid');
  }
  const value = cloneCanonical(input, 'Vault semantic index');
  exactKeys(value, new Set([
    'schema', 'index_id', 'vault_id', 'owner_subject_ref',
    'content_manifest_ref', 'content_manifest_sha256', 'generated_at',
    'indexer_principal_ref', 'semantic_capabilities', 'attestation'
  ]), new Set([
    'schema', 'index_id', 'vault_id', 'owner_subject_ref',
    'content_manifest_ref', 'content_manifest_sha256', 'generated_at',
    'indexer_principal_ref', 'semantic_capabilities', 'attestation'
  ]), 'Vault semantic index');

  if (value.schema !== VAULT_SEMANTIC_INDEX_V1_SCHEMA) {
    throw new ValidationError('Vault semantic index schema is invalid');
  }
  assertId(value.index_id, 'semantic index index_id');
  assertId(value.vault_id, 'semantic index vault_id');
  assertId(value.owner_subject_ref, 'semantic index owner_subject_ref');
  assertString(value.content_manifest_ref, 'semantic index content_manifest_ref', {
    min: 1,
    max: 1024
  });
  assertSha256(value.content_manifest_sha256, 'semantic index content_manifest_sha256');
  const generatedAt = assertDateTime(value.generated_at, 'semantic index generated_at');
  if (generatedAt > now) {
    throw new ValidationError('Vault semantic index cannot be generated in the future');
  }
  assertId(value.indexer_principal_ref, 'semantic index indexer_principal_ref');
  const capabilities = validateSemanticCapabilities(value.semantic_capabilities);

  const pin = normalizeIndexerPin(trustedIndexer);
  if (value.indexer_principal_ref !== pin.indexer_principal_ref) {
    throw new ValidationError('Vault semantic index signer principal does not match local trust pin');
  }
  if (value.attestation?.key_id !== pin.key_id) {
    throw new ValidationError('Vault semantic index key does not match local trust pin');
  }
  const unsigned = {
    schema: value.schema,
    index_id: value.index_id,
    vault_id: value.vault_id,
    owner_subject_ref: value.owner_subject_ref,
    content_manifest_ref: value.content_manifest_ref,
    content_manifest_sha256: value.content_manifest_sha256,
    generated_at: value.generated_at,
    indexer_principal_ref: value.indexer_principal_ref,
    semantic_capabilities: value.semantic_capabilities
  };
  if (!verifyObjectSignature(unsigned, value.attestation, pin.public_key)) {
    throw new ValidationError('Vault semantic index signature is invalid');
  }

  return deepFreeze({
    ...unsigned,
    semantic_capabilities: capabilities,
    indexer_key_id: pin.key_id,
    index_sha256: digestObject(value)
  });
}

function validateStoragePolicy(value) {
  assertPlainObject(value, 'vault manifest storage_policy');
  exactKeys(value, new Set([
    'primary_custody', 'encrypted_at_rest', 'plaintext_index_outside_vault',
    'storage_node_ref', 'retention_policy_ref'
  ]), new Set([
    'primary_custody', 'encrypted_at_rest', 'plaintext_index_outside_vault'
  ]), 'vault manifest storage_policy');
  assertEnum(value.primary_custody, STORAGE_CUSTODY, 'storage_policy primary_custody');
  if (value.encrypted_at_rest !== true) {
    throw new ValidationError('Sovereign Vault must be encrypted at rest');
  }
  if (value.plaintext_index_outside_vault !== false) {
    throw new ValidationError('Sovereign Vault cannot expose a plaintext index outside the vault');
  }
  if (value.storage_node_ref !== undefined) assertId(value.storage_node_ref, 'storage_policy storage_node_ref');
  if (value.retention_policy_ref !== undefined) assertId(value.retention_policy_ref, 'storage_policy retention_policy_ref');
}

function validateAccessPolicy(value) {
  assertPlainObject(value, 'vault manifest access_policy');
  exactKeys(value, new Set([
    'default_external_vault_access', 'local_companion_access',
    'local_lease_required', 'max_local_lease_seconds', 'cross_vault_synthesis',
    'raw_external_disclosure', 'mutation_requires_kernel_effect',
    'allowed_purposes', 'high_risk_disclosure_requires_owner_confirmation'
  ]), new Set([
    'default_external_vault_access', 'local_companion_access',
    'local_lease_required', 'cross_vault_synthesis', 'raw_external_disclosure',
    'mutation_requires_kernel_effect', 'allowed_purposes'
  ]), 'vault manifest access_policy');
  if (value.default_external_vault_access !== false) {
    throw new ValidationError('Sovereign Vault external access must default closed');
  }
  assertEnum(value.local_companion_access, ACCESS, 'access_policy local_companion_access');
  if (value.local_lease_required !== true) {
    throw new ValidationError('Sovereign Vault local companion access must require a lease');
  }
  if (value.max_local_lease_seconds !== undefined) {
    assertInteger(value.max_local_lease_seconds, 'access_policy max_local_lease_seconds', 1, 86400);
  }
  assertBoolean(value.cross_vault_synthesis, 'access_policy cross_vault_synthesis');
  assertBoolean(value.raw_external_disclosure, 'access_policy raw_external_disclosure');
  if (value.mutation_requires_kernel_effect !== true) {
    throw new ValidationError('Sovereign Vault mutation must require a kernel effect');
  }
  assertStringArray(value.allowed_purposes, 'access_policy allowed_purposes', 1, 128, 160);
  if (value.high_risk_disclosure_requires_owner_confirmation !== undefined) {
    assertBoolean(
      value.high_risk_disclosure_requires_owner_confirmation,
      'access_policy high_risk_disclosure_requires_owner_confirmation'
    );
  }
}

function validateRecoveryPolicy(value) {
  assertPlainObject(value, 'vault manifest recovery_policy');
  exactKeys(value, new Set([
    'independently_recoverable', 'cross_vault_key_dependency', 'backup_refs',
    'recovery_policy_ref'
  ]), new Set([
    'independently_recoverable', 'cross_vault_key_dependency', 'backup_refs'
  ]), 'vault manifest recovery_policy');
  assertBoolean(value.independently_recoverable, 'recovery_policy independently_recoverable');
  if (value.cross_vault_key_dependency !== false) {
    throw new ValidationError('Sovereign Vault recovery cannot depend on another vault key');
  }
  assertIdArray(value.backup_refs, 'recovery_policy backup_refs', 0, 32);
  if (value.recovery_policy_ref !== undefined) {
    assertId(value.recovery_policy_ref, 'recovery_policy recovery_policy_ref');
  }
}

function validateSemanticCapabilities(value) {
  if (!Array.isArray(value) || value.length < 1 || value.length > 128) {
    throw new ValidationError('Vault semantic index must contain 1-128 capabilities');
  }
  const seen = new Set();
  return value.map((capability, index) => {
    assertPlainObject(capability, `semantic_capabilities[${index}]`);
    exactKeys(capability, new Set([
      'semantic_type', 'resource_refs', 'sensitivity', 'operations'
    ]), new Set([
      'semantic_type', 'resource_refs', 'sensitivity', 'operations'
    ]), `semantic_capabilities[${index}]`);
    const semanticType = assertString(
      capability.semantic_type,
      `semantic_capabilities[${index}].semantic_type`,
      { min: 1, max: 240 }
    );
    if (seen.has(semanticType)) {
      throw new ValidationError('Vault semantic index contains duplicate semantic type');
    }
    seen.add(semanticType);
    assertIdArray(capability.resource_refs, `semantic_capabilities[${index}].resource_refs`, 1, 128);
    assertEnum(capability.sensitivity, SENSITIVITY, `semantic_capabilities[${index}].sensitivity`);
    assertEnumArray(capability.operations, OPERATION, `semantic_capabilities[${index}].operations`, 1, 2);
    return {
      semantic_type: semanticType,
      resource_refs: [...capability.resource_refs].sort(),
      sensitivity: capability.sensitivity,
      operations: [...capability.operations].sort()
    };
  }).sort((left, right) => left.semantic_type.localeCompare(right.semantic_type));
}

function normalizeIndexerPin(value) {
  const pin = cloneCanonical(value, 'trusted semantic indexer');
  exactKeys(pin, new Set([
    'indexer_principal_ref', 'key_id', 'public_key_pem'
  ]), new Set([
    'indexer_principal_ref', 'key_id', 'public_key_pem'
  ]), 'trusted semantic indexer');
  assertId(pin.indexer_principal_ref, 'trusted indexer principal');
  assertString(pin.key_id, 'trusted indexer key_id', { min: 1, max: 160 });
  assertString(pin.public_key_pem, 'trusted indexer public_key_pem', {
    min: 64,
    max: 8192
  });
  let publicKey;
  try {
    publicKey = createPublicKey(pin.public_key_pem);
  } catch {
    throw new ValidationError('Trusted semantic indexer public key is invalid');
  }
  if (publicKey.asymmetricKeyType !== 'ed25519') {
    throw new ValidationError('Trusted semantic indexer must use Ed25519');
  }
  return { ...pin, public_key: publicKey };
}

function cloneCanonical(value, label) {
  try {
    return JSON.parse(canonicalJson(value));
  } catch {
    throw new ValidationError(`${label} must be canonical JSON`);
  }
}

function exactKeys(value, allowed, required, label) {
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) throw new ValidationError(`${label} contains unknown field ${key}`);
  }
  for (const key of required) {
    if (!Object.hasOwn(value, key)) throw new ValidationError(`${label} is missing required field ${key}`);
  }
}

function assertId(value, label) {
  assertString(value, label, { min: 1, max: 160 });
  if (!ID_PATTERN.test(value)) throw new ValidationError(`${label} has an invalid identifier`);
  return value;
}

function assertSha256(value, label) {
  assertString(value, label, { min: 64, max: 64 });
  if (!SHA256_PATTERN.test(value)) throw new ValidationError(`${label} must be lowercase sha256`);
}

function assertDateTime(value, label) {
  assertString(value, label, { min: 20, max: 40 });
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) throw new ValidationError(`${label} must be a valid date-time`);
  return parsed;
}

function assertEnum(value, allowed, label) {
  if (!allowed.has(value)) throw new ValidationError(`${label} is invalid`);
}

function assertBoolean(value, label) {
  if (typeof value !== 'boolean') throw new ValidationError(`${label} must be boolean`);
}

function assertInteger(value, label, min, max) {
  if (!Number.isSafeInteger(value) || value < min || value > max) {
    throw new ValidationError(`${label} must be an integer between ${min} and ${max}`);
  }
}

function assertStringArray(value, label, min, max, maxLength) {
  if (!Array.isArray(value) || value.length < min || value.length > max) {
    throw new ValidationError(`${label} must contain ${min}-${max} strings`);
  }
  const seen = new Set();
  for (const [index, item] of value.entries()) {
    assertString(item, `${label}[${index}]`, { min: 1, max: maxLength });
    if (seen.has(item)) throw new ValidationError(`${label} contains a duplicate value`);
    seen.add(item);
  }
}

function assertIdArray(value, label, min, max) {
  if (!Array.isArray(value) || value.length < min || value.length > max) {
    throw new ValidationError(`${label} must contain ${min}-${max} identifiers`);
  }
  const seen = new Set();
  for (const [index, item] of value.entries()) {
    assertId(item, `${label}[${index}]`);
    if (seen.has(item)) throw new ValidationError(`${label} contains a duplicate identifier`);
    seen.add(item);
  }
}

function assertEnumArray(value, allowed, label, min, max) {
  if (!Array.isArray(value) || value.length < min || value.length > max) {
    throw new ValidationError(`${label} must contain ${min}-${max} values`);
  }
  const seen = new Set();
  for (const item of value) {
    if (!allowed.has(item)) throw new ValidationError(`${label} contains an invalid value`);
    if (seen.has(item)) throw new ValidationError(`${label} contains a duplicate value`);
    seen.add(item);
  }
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const item of Object.values(value)) deepFreeze(item);
  return Object.freeze(value);
}
