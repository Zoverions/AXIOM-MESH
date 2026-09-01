import { ValidationError } from './canonical.mjs';
import {
  readMachinePrincipalCurrentnessRetainedHead
} from './machine-principal-currentness-store.mjs';

export const MACHINE_PRINCIPAL_CURRENTNESS_FILE_SOURCE_SCHEMA =
  'axiom-machine-principal-currentness-file-source.v1';

const PRINCIPAL_ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/;

function requirePrincipalId(value, label) {
  if (typeof value !== 'string' || !PRINCIPAL_ID.test(value)) {
    throw new ValidationError(`${label} is invalid`);
  }
  return value;
}

function requirePrincipalType(value, label) {
  if (value !== 'agent' && value !== 'service') {
    throw new ValidationError(`${label} is invalid`);
  }
  return value;
}

function requireStatePath(value) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new ValidationError(
      'Machine currentness file-source state path must be a non-empty configured string'
    );
  }
  return value;
}

function normalizeEntry(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new ValidationError('Machine currentness file-source entry must be an object');
  }
  const allowed = new Set([
    'principalId',
    'principalType',
    'statePath',
    'trustedControllerPublicKey',
    'maxStateBytes',
    'maxCheckpointBytes'
  ]);
  for (const key of Object.keys(raw)) {
    if (!allowed.has(key)) {
      throw new ValidationError(
        `Machine currentness file-source entry contains unsupported field: ${key}`
      );
    }
  }
  if (raw.trustedControllerPublicKey === undefined || raw.trustedControllerPublicKey === null) {
    throw new ValidationError(
      'Machine currentness file-source trusted controller public key is required'
    );
  }
  return Object.freeze({
    principalId: requirePrincipalId(
      raw.principalId,
      'Machine currentness file-source principal id'
    ),
    principalType: requirePrincipalType(
      raw.principalType,
      'Machine currentness file-source principal type'
    ),
    statePath: requireStatePath(raw.statePath),
    trustedControllerPublicKey: raw.trustedControllerPublicKey,
    ...(raw.maxStateBytes === undefined ? {} : { maxStateBytes: raw.maxStateBytes }),
    ...(raw.maxCheckpointBytes === undefined
      ? {}
      : { maxCheckpointBytes: raw.maxCheckpointBytes })
  });
}

export function createMachinePrincipalCurrentnessFileSource({ entries } = {}) {
  if (!Array.isArray(entries) || entries.length < 1 || entries.length > 4096) {
    throw new ValidationError(
      'Machine currentness file-source entries must contain 1-4096 configured principals'
    );
  }
  const configured = new Map();
  for (const raw of entries) {
    const entry = normalizeEntry(raw);
    if (configured.has(entry.principalId)) {
      throw new ValidationError(
        `Duplicate machine currentness file-source principal: ${entry.principalId}`
      );
    }
    configured.set(entry.principalId, entry);
  }

  return Object.freeze({
    schema: MACHINE_PRINCIPAL_CURRENTNESS_FILE_SOURCE_SCHEMA,
    configured_principal_count: configured.size,
    state_paths_disclosed: false,
    caller_selected_path_allowed: false,
    authority_effect: 'none',
    execution_authority_granted: false,
    global_currentness_claimed: false,

    async resolveRetainedHead({ principalId, principalType } = {}) {
      const id = requirePrincipalId(
        principalId,
        'Machine currentness source request principal id'
      );
      const type = requirePrincipalType(
        principalType,
        'Machine currentness source request principal type'
      );
      const entry = configured.get(id);
      if (!entry) {
        throw new ValidationError(
          'Machine currentness source has no configured principal'
        );
      }
      if (entry.principalType !== type) {
        throw new ValidationError(
          'Machine currentness source principal type does not match configured trust'
        );
      }
      const resolved = await readMachinePrincipalCurrentnessRetainedHead({
        statePath: entry.statePath,
        trustedControllerPublicKey: entry.trustedControllerPublicKey,
        expectedPrincipalId: entry.principalId,
        expectedPrincipalType: entry.principalType,
        maxStateBytes: entry.maxStateBytes,
        maxCheckpointBytes: entry.maxCheckpointBytes
      });
      if (!resolved.retained_latest_checkpoint) {
        throw new ValidationError(
          'Machine currentness source has no retained checkpoint'
        );
      }
      return Object.freeze({
        schema: MACHINE_PRINCIPAL_CURRENTNESS_FILE_SOURCE_SCHEMA,
        principal_id: entry.principalId,
        principal_type: entry.principalType,
        retained_latest_checkpoint: resolved.retained_latest_checkpoint,
        retained_checkpoint_digest:
          resolved.retained_latest_checkpoint.checkpoint_digest,
        retained_source_head_digest:
          resolved.retained_latest_checkpoint.statement.source_head_digest,
        checkpoint_count: resolved.checkpoint_count,
        local_durable_retention_observed: true,
        fresh_disk_read_performed: true,
        state_path_disclosed: false,
        caller_selected_path_allowed: false,
        state_mutation_performed: false,
        storage_rollback_proof_claimed: false,
        hardware_monotonicity_claimed: false,
        external_witness_claimed: false,
        authority_effect: 'none',
        execution_authority_granted: false,
        global_currentness_claimed: false
      });
    }
  });
}
