import { readFileSync } from 'node:fs';
import { canonicalJson, ValidationError } from './canonical.mjs';

export const RUNTIME_CONNECTOR_CATALOG_SCHEMA =
  'axiom-runtime-connector-catalog-entry.v1';
export const RUNTIME_CONNECTOR_CATALOG_SCHEMA_ID =
  'urn:axiom:contract:runtime-connector-catalog-entry:v1';
export const TASK_ARTIFACT_HANDOFF_SCHEMA = 'axiom-task-artifact-handoff.v1';
export const TASK_ARTIFACT_HANDOFF_SCHEMA_ID =
  'urn:axiom:contract:task-artifact-handoff:v1';

const CATALOG_URL = new URL(
  '../../../docs/architecture/contracts/runtime-connector-catalog-entry.v1.schema.json',
  import.meta.url
);
const HANDOFF_URL = new URL(
  '../../../docs/architecture/contracts/task-artifact-handoff.v1.schema.json',
  import.meta.url
);

const CATALOG_REQUIRED = Object.freeze([
  'schema',
  'entry_id',
  'entry_version',
  'integration_class',
  'subject',
  'provenance',
  'compatibility',
  'requested_access',
  'orchestration',
  'assurance',
  'lifecycle',
  'non_claims'
]);

const CATALOG_CLASSES = Object.freeze([
  'agent-runtime',
  'model-provider',
  'tool-service-connector',
  'protocol-adapter',
  'compute-backend',
  'evidence-oracle'
]);

const CATALOG_REVIEW_STATES = Object.freeze([
  'unreviewed',
  'research',
  'conformance-candidate',
  'conformance-reviewed',
  'pilot-evidence',
  'quarantined',
  'deprecated',
  'retired'
]);

const SOURCE_KINDS = Object.freeze([
  'source-repository',
  'release-artifact',
  'container-image',
  'service-endpoint',
  'local-artifact',
  'other'
]);

const PLATFORMS = Object.freeze([
  'linux', 'windows', 'macos', 'android', 'ios', 'container', 'browser', 'other'
]);
const DEPLOYMENT_FORMS = Object.freeze([
  'process', 'sidecar', 'plugin', 'container', 'remote-service', 'library', 'device', 'other'
]);
const ORCHESTRATION_MODES = Object.freeze([
  'none', 'single-agent', 'multi-agent', 'worker-pool', 'tool-host', 'workflow-engine', 'other'
]);
const UPDATE_MODES = Object.freeze(['manual-reviewed', 'operator-reviewed', 'disabled']);
const OBSERVATION_TYPES = Object.freeze([
  'source-review',
  'license-review',
  'dependency-review',
  'sbom-match',
  'signature-verification',
  'conformance-test',
  'security-review',
  'vulnerability-advisory',
  'reproducible-build',
  'benchmark',
  'operational-observation',
  'other'
]);
const OBSERVATION_RESULTS = Object.freeze([
  'pass', 'fail', 'warning', 'unknown', 'not-applicable'
]);

const HANDOFF_REQUIRED = Object.freeze([
  'schema',
  'task_id',
  'causal_id',
  'requester',
  'execution_target',
  'request',
  'authority',
  'budgets',
  'lifecycle',
  'inputs',
  'outputs'
]);
const TASK_STATES = Object.freeze([
  'queued',
  'running',
  'awaiting-approval',
  'blocked',
  'completed',
  'failed',
  'cancelled',
  'expired',
  'uncertain'
]);
const TASK_EVENT_TYPES = Object.freeze([
  'task.created',
  'task.started',
  'task.awaiting-approval',
  'task.blocked',
  'task.handoff',
  'artifact.observed',
  'task.cancel-requested',
  'task.cancelled',
  'task.completed',
  'task.failed',
  'task.expired',
  'task.uncertain'
]);

const CATALOG_ID_RE = /^[a-z0-9][a-z0-9._:-]{1,127}$/;
const ID_RE = /^[a-zA-Z0-9][a-zA-Z0-9._:-]{1,191}$/;
const VERSION_RE = /^[0-9]+\.[0-9]+\.[0-9]+(?:[-+][0-9A-Za-z.-]+)?$/;
const SHA256_RE = /^[a-f0-9]{64}$/;
const GIT_COMMIT_RE = /^[a-fA-F0-9]{40,64}$/;

function readJson(url, name) {
  try {
    return JSON.parse(readFileSync(url, 'utf8'));
  } catch {
    throw new ValidationError(`${name} is not valid JSON`);
  }
}

function exactArray(actual, expected, name) {
  if (
    !Array.isArray(actual)
    || canonicalJson([...actual].sort()) !== canonicalJson([...expected].sort())
  ) throw new ValidationError(`${name} are invalid`);
}

function requirePlain(value, name) {
  if (
    value === null
    || typeof value !== 'object'
    || Array.isArray(value)
    || Object.getPrototypeOf(value) !== Object.prototype
  ) throw new ValidationError(`${name} must be a plain object`);
}

function requireFields(value, fields, name) {
  requirePlain(value, name);
  for (const field of fields) {
    if (!Object.hasOwn(value, field)) {
      throw new ValidationError(`${name} is missing required field ${field}`);
    }
  }
}

function rejectUnknown(value, fields, name) {
  const allowed = new Set(fields);
  for (const field of Object.keys(value)) {
    if (!allowed.has(field)) {
      throw new ValidationError(`${name} contains unsupported field ${field}`);
    }
  }
}

function requireString(value, name, maxLength = 2048) {
  if (typeof value !== 'string' || value.length < 1 || value.length > maxLength) {
    throw new ValidationError(`${name} must be a bounded non-empty string`);
  }
}

function requireId(value, name, pattern = ID_RE) {
  if (typeof value !== 'string' || !pattern.test(value)) {
    throw new ValidationError(`${name} is invalid`);
  }
}

function requireVersion(value, name) {
  if (typeof value !== 'string' || value.length > 80 || !VERSION_RE.test(value)) {
    throw new ValidationError(`${name} is invalid`);
  }
}

function requireSha256(value, name) {
  if (typeof value !== 'string' || !SHA256_RE.test(value)) {
    throw new ValidationError(`${name} must be a lowercase SHA-256 digest`);
  }
}

function requireBoolean(value, name) {
  if (typeof value !== 'boolean') throw new ValidationError(`${name} must be boolean`);
}

function requireInteger(value, name, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}) {
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new ValidationError(`${name} is invalid`);
  }
}

function requireDateTime(value, name) {
  requireString(value, name, 80);
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) throw new ValidationError(`${name} is invalid`);
  return parsed;
}

function requireHttps(value, name) {
  requireString(value, name, 2048);
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new ValidationError(`${name} must be an https URL`);
  }
  if (parsed.protocol !== 'https:') throw new ValidationError(`${name} must be an https URL`);
}

function requireEnum(value, values, name) {
  if (!values.includes(value)) throw new ValidationError(`${name} is invalid`);
}

function requireArray(value, name, { min = 0, max = 256 } = {}) {
  if (!Array.isArray(value) || value.length < min || value.length > max) {
    throw new ValidationError(`${name} must be an array with ${min}-${max} items`);
  }
}

function validateStringArray(value, name, { min = 0, max = 128 } = {}) {
  requireArray(value, name, { min, max });
  const seen = new Set();
  for (const item of value) {
    requireString(item, `${name} item`, 512);
    if (seen.has(item)) throw new ValidationError(`${name} contains duplicate values`);
    seen.add(item);
  }
}

function validateEnumArray(value, values, name, { min = 0, max = 128 } = {}) {
  requireArray(value, name, { min, max });
  const seen = new Set();
  for (const item of value) {
    requireEnum(item, values, `${name} item`);
    if (seen.has(item)) throw new ValidationError(`${name} contains duplicate values`);
    seen.add(item);
  }
}

function validateContractPin(value, name) {
  requireFields(value, ['contract_id', 'contract_version', 'contract_sha256'], name);
  rejectUnknown(value, ['contract_id', 'contract_version', 'contract_sha256'], name);
  requireId(value.contract_id, `${name}.contract_id`);
  requireVersion(value.contract_version, `${name}.contract_version`);
  requireSha256(value.contract_sha256, `${name}.contract_sha256`);
}

function validateObservation(value, name) {
  requireFields(value, ['claim_type', 'observer_id', 'subject_ref', 'observed_at', 'result'], name);
  rejectUnknown(value, [
    'claim_type',
    'observer_id',
    'subject_ref',
    'observed_at',
    'fresh_until',
    'result',
    'evidence_sha256',
    'evidence_uri',
    'note'
  ], name);
  requireEnum(value.claim_type, OBSERVATION_TYPES, `${name}.claim_type`);
  requireId(value.observer_id, `${name}.observer_id`, CATALOG_ID_RE);
  requireString(value.subject_ref, `${name}.subject_ref`, 512);
  const observed = requireDateTime(value.observed_at, `${name}.observed_at`);
  if (value.fresh_until !== undefined) {
    const fresh = requireDateTime(value.fresh_until, `${name}.fresh_until`);
    if (fresh < observed) throw new ValidationError(`${name}.fresh_until precedes observed_at`);
  }
  requireEnum(value.result, OBSERVATION_RESULTS, `${name}.result`);
  if (value.evidence_sha256 !== undefined) requireSha256(value.evidence_sha256, `${name}.evidence_sha256`);
  if (value.evidence_uri !== undefined) requireString(value.evidence_uri, `${name}.evidence_uri`, 2048);
  if (value.evidence_sha256 === undefined && value.evidence_uri === undefined) {
    throw new ValidationError(`${name} requires an evidence digest or URI`);
  }
  if (value.note !== undefined) requireString(value.note, `${name}.note`, 1000);
}

function validateArtifact(value, name) {
  requireFields(value, ['artifact_id', 'sha256', 'size_bytes', 'source_principal_id'], name);
  rejectUnknown(value, [
    'artifact_id',
    'sha256',
    'size_bytes',
    'mime_type',
    'schema_id',
    'source_principal_id',
    'source_task_id',
    'data_class',
    'retention_class'
  ], name);
  requireId(value.artifact_id, `${name}.artifact_id`);
  requireSha256(value.sha256, `${name}.sha256`);
  requireInteger(value.size_bytes, `${name}.size_bytes`);
  requireId(value.source_principal_id, `${name}.source_principal_id`);
  if (value.source_task_id !== undefined) requireId(value.source_task_id, `${name}.source_task_id`);
  for (const field of ['mime_type', 'schema_id', 'data_class', 'retention_class']) {
    if (value[field] !== undefined) requireString(value[field], `${name}.${field}`, 300);
  }
}

export function validateRuntimeConnectorCatalogSchema(schema) {
  exactArray(schema?.required, CATALOG_REQUIRED, 'Runtime connector catalog required fields');
  exactArray(schema?.properties?.integration_class?.enum, CATALOG_CLASSES, 'Runtime connector catalog integration classes');
  exactArray(schema?.properties?.subject?.required, ['subject_id', 'display_name', 'review_state'], 'Runtime connector catalog subject required fields');
  exactArray(schema?.properties?.subject?.properties?.review_state?.enum, CATALOG_REVIEW_STATES, 'Runtime connector catalog review states');
  exactArray(
    schema?.properties?.requested_access?.required,
    ['install_grants_authority', 'capabilities', 'actions', 'purposes', 'destinations', 'data_classes', 'credential_classes', 'network_required'],
    'Runtime connector catalog requested-access required fields'
  );
  exactArray(
    schema?.properties?.orchestration?.required,
    ['mode', 'may_spawn_workers', 'independent_child_authority_requested', 'remote_execution_requested'],
    'Runtime connector catalog orchestration required fields'
  );
  exactArray(schema?.properties?.assurance?.required, ['observations', 'cataloged_at'], 'Runtime connector catalog assurance required fields');
  exactArray(schema?.$defs?.observation?.properties?.claim_type?.enum, OBSERVATION_TYPES, 'Runtime connector catalog observation types');

  if (
    schema?.$schema !== 'https://json-schema.org/draft/2020-12/schema'
    || schema?.$id !== RUNTIME_CONNECTOR_CATALOG_SCHEMA_ID
    || schema?.type !== 'object'
    || schema?.additionalProperties !== false
    || schema?.properties?.schema?.const !== RUNTIME_CONNECTOR_CATALOG_SCHEMA
    || schema?.properties?.provenance?.properties?.mutable_ref_allowed?.const !== false
    || schema?.properties?.requested_access?.properties?.install_grants_authority?.const !== false
    || schema?.properties?.lifecycle?.properties?.silent_permission_widening_allowed?.const !== false
    || schema?.properties?.lifecycle?.properties?.quarantine_supported?.const !== true
    || schema?.properties?.non_claims?.minItems !== 1
    || canonicalJson(schema?.$defs?.observation?.anyOf ?? null) !== canonicalJson([
      { required: ['evidence_sha256'] },
      { required: ['evidence_uri'] }
    ])
  ) throw new ValidationError('Runtime connector catalog contract invariants are invalid');
  return true;
}

export function validateTaskArtifactHandoffSchema(schema) {
  exactArray(schema?.required, HANDOFF_REQUIRED, 'Task artifact handoff required fields');
  exactArray(schema?.properties?.lifecycle?.properties?.state?.enum, TASK_STATES, 'Task artifact handoff lifecycle states');
  exactArray(
    schema?.properties?.request?.required,
    ['runtime_operation', 'axiom_action', 'purpose', 'destinations'],
    'Task artifact handoff request required fields'
  );
  exactArray(
    schema?.properties?.authority?.required,
    ['authority_source', 'grant_required_before_effect', 'coordination_is_authorization', 'handoff_transfers_authority', 'delegation_required_for_independent_child_authority'],
    'Task artifact handoff authority required fields'
  );

  if (
    schema?.$schema !== 'https://json-schema.org/draft/2020-12/schema'
    || schema?.$id !== TASK_ARTIFACT_HANDOFF_SCHEMA_ID
    || schema?.type !== 'object'
    || schema?.additionalProperties !== false
    || schema?.properties?.schema?.const !== TASK_ARTIFACT_HANDOFF_SCHEMA
    || schema?.properties?.authority?.properties?.authority_source?.const !== 'axiom-gateway'
    || schema?.properties?.authority?.properties?.grant_required_before_effect?.const !== true
    || schema?.properties?.authority?.properties?.coordination_is_authorization?.const !== false
    || schema?.properties?.authority?.properties?.handoff_transfers_authority?.const !== false
    || schema?.properties?.authority?.properties?.delegation_required_for_independent_child_authority?.const !== true
  ) throw new ValidationError('Task artifact handoff contract invariants are invalid');
  return true;
}

export function validateRuntimeConnectorCatalogEntry(entry) {
  requireFields(entry, CATALOG_REQUIRED, 'Runtime connector catalog entry');
  rejectUnknown(entry, CATALOG_REQUIRED, 'Runtime connector catalog entry');
  if (entry.schema !== RUNTIME_CONNECTOR_CATALOG_SCHEMA) {
    throw new ValidationError('Runtime connector catalog entry schema is invalid');
  }
  requireId(entry.entry_id, 'Runtime connector catalog entry_id', CATALOG_ID_RE);
  requireVersion(entry.entry_version, 'Runtime connector catalog entry_version');
  requireEnum(entry.integration_class, CATALOG_CLASSES, 'Runtime connector catalog integration_class');

  requireFields(entry.subject, ['subject_id', 'display_name', 'review_state'], 'Runtime connector catalog subject');
  rejectUnknown(entry.subject, ['subject_id', 'display_name', 'description', 'review_state'], 'Runtime connector catalog subject');
  requireId(entry.subject.subject_id, 'Runtime connector catalog subject_id', CATALOG_ID_RE);
  requireString(entry.subject.display_name, 'Runtime connector catalog display_name', 160);
  if (entry.subject.description !== undefined) requireString(entry.subject.description, 'Runtime connector catalog description', 2000);
  requireEnum(entry.subject.review_state, CATALOG_REVIEW_STATES, 'Runtime connector catalog review_state');

  requireFields(entry.provenance, ['source_kind', 'license_spdx', 'mutable_ref_allowed'], 'Runtime connector catalog provenance');
  rejectUnknown(entry.provenance, [
    'source_kind',
    'source_repository',
    'source_commit',
    'release_ref',
    'artifact_sha256',
    'sbom_sha256',
    'service_origin',
    'service_version',
    'license_spdx',
    'mutable_ref_allowed'
  ], 'Runtime connector catalog provenance');
  requireEnum(entry.provenance.source_kind, SOURCE_KINDS, 'Runtime connector catalog source_kind');
  if (entry.provenance.mutable_ref_allowed !== false) {
    throw new ValidationError('Runtime connector catalog mutable source references are forbidden');
  }
  requireString(entry.provenance.license_spdx, 'Runtime connector catalog license_spdx', 100);
  if (entry.provenance.source_repository !== undefined) requireHttps(entry.provenance.source_repository, 'Runtime connector catalog source_repository');
  if (entry.provenance.source_commit !== undefined && !GIT_COMMIT_RE.test(entry.provenance.source_commit)) {
    throw new ValidationError('Runtime connector catalog source_commit is invalid');
  }
  if (entry.provenance.release_ref !== undefined) requireString(entry.provenance.release_ref, 'Runtime connector catalog release_ref', 200);
  if (entry.provenance.artifact_sha256 !== undefined) requireSha256(entry.provenance.artifact_sha256, 'Runtime connector catalog artifact_sha256');
  if (entry.provenance.sbom_sha256 !== undefined) requireSha256(entry.provenance.sbom_sha256, 'Runtime connector catalog sbom_sha256');
  if (entry.provenance.service_origin !== undefined) requireHttps(entry.provenance.service_origin, 'Runtime connector catalog service_origin');
  if (entry.provenance.service_version !== undefined) requireString(entry.provenance.service_version, 'Runtime connector catalog service_version', 200);

  if (entry.provenance.source_kind === 'source-repository') {
    if (!entry.provenance.source_repository || !entry.provenance.source_commit) {
      throw new ValidationError('Runtime connector catalog source-repository requires repository and immutable commit');
    }
  } else if (entry.provenance.source_kind === 'release-artifact') {
    if (!entry.provenance.release_ref || !entry.provenance.artifact_sha256) {
      throw new ValidationError('Runtime connector catalog release-artifact requires release ref and artifact digest');
    }
  } else if (['container-image', 'local-artifact'].includes(entry.provenance.source_kind)) {
    if (!entry.provenance.artifact_sha256) {
      throw new ValidationError(`Runtime connector catalog ${entry.provenance.source_kind} requires artifact digest`);
    }
  } else if (entry.provenance.source_kind === 'service-endpoint') {
    if (!entry.provenance.service_origin) {
      throw new ValidationError('Runtime connector catalog service-endpoint requires service origin');
    }
  } else if (entry.provenance.source_kind === 'other') {
    const repoPinned = Boolean(entry.provenance.source_repository && entry.provenance.source_commit);
    if (!repoPinned && !entry.provenance.artifact_sha256 && !entry.provenance.service_origin) {
      throw new ValidationError('Runtime connector catalog other provenance requires an inspectable identity');
    }
  }

  requireFields(entry.compatibility, ['platforms', 'deployment_forms', 'adapter_contracts'], 'Runtime connector catalog compatibility');
  rejectUnknown(entry.compatibility, ['platforms', 'deployment_forms', 'adapter_contracts', 'protocol_profiles'], 'Runtime connector catalog compatibility');
  validateEnumArray(entry.compatibility.platforms, PLATFORMS, 'Runtime connector catalog platforms', { min: 1, max: 12 });
  validateEnumArray(entry.compatibility.deployment_forms, DEPLOYMENT_FORMS, 'Runtime connector catalog deployment_forms', { min: 1, max: 12 });
  requireArray(entry.compatibility.adapter_contracts, 'Runtime connector catalog adapter_contracts', { max: 16 });
  entry.compatibility.adapter_contracts.forEach((pin, index) => validateContractPin(pin, `Runtime connector catalog adapter_contracts[${index}]`));
  if (entry.compatibility.protocol_profiles !== undefined) validateStringArray(entry.compatibility.protocol_profiles, 'Runtime connector catalog protocol_profiles', { max: 32 });

  const accessFields = [
    'install_grants_authority', 'capabilities', 'actions', 'purposes', 'destinations',
    'data_classes', 'credential_classes', 'network_required'
  ];
  requireFields(entry.requested_access, accessFields, 'Runtime connector catalog requested_access');
  rejectUnknown(entry.requested_access, [...accessFields, 'network_destinations', 'resource_bounds'], 'Runtime connector catalog requested_access');
  if (entry.requested_access.install_grants_authority !== false) {
    throw new ValidationError('Runtime connector catalog install authority is forbidden');
  }
  for (const field of ['capabilities', 'actions', 'purposes', 'destinations', 'data_classes', 'credential_classes']) {
    validateStringArray(entry.requested_access[field], `Runtime connector catalog requested_access.${field}`);
  }
  requireBoolean(entry.requested_access.network_required, 'Runtime connector catalog network_required');
  if (entry.requested_access.network_destinations !== undefined) {
    validateStringArray(entry.requested_access.network_destinations, 'Runtime connector catalog network_destinations');
  }
  if (entry.requested_access.network_required) {
    if (!entry.requested_access.network_destinations?.length) {
      throw new ValidationError('Runtime connector catalog network-required integration needs explicit destinations');
    }
  } else if (entry.requested_access.network_destinations?.length) {
    throw new ValidationError('Runtime connector catalog no-network integration cannot declare network destinations');
  }
  if (entry.requested_access.resource_bounds !== undefined) {
    requirePlain(entry.requested_access.resource_bounds, 'Runtime connector catalog resource_bounds');
    rejectUnknown(entry.requested_access.resource_bounds, [
      'timeout_ms', 'max_concurrency', 'max_request_bytes', 'max_response_bytes', 'cost_ceiling_minor_units'
    ], 'Runtime connector catalog resource_bounds');
    const bounds = entry.requested_access.resource_bounds;
    if (bounds.timeout_ms !== undefined) requireInteger(bounds.timeout_ms, 'Runtime connector catalog timeout_ms', { min: 1, max: 86400000 });
    if (bounds.max_concurrency !== undefined) requireInteger(bounds.max_concurrency, 'Runtime connector catalog max_concurrency', { min: 1, max: 1024 });
    if (bounds.max_request_bytes !== undefined) requireInteger(bounds.max_request_bytes, 'Runtime connector catalog max_request_bytes', { min: 1 });
    if (bounds.max_response_bytes !== undefined) requireInteger(bounds.max_response_bytes, 'Runtime connector catalog max_response_bytes', { min: 1 });
    if (bounds.cost_ceiling_minor_units !== undefined) requireInteger(bounds.cost_ceiling_minor_units, 'Runtime connector catalog cost_ceiling_minor_units');
  }

  const orchestrationFields = ['mode', 'may_spawn_workers', 'independent_child_authority_requested', 'remote_execution_requested'];
  requireFields(entry.orchestration, orchestrationFields, 'Runtime connector catalog orchestration');
  rejectUnknown(entry.orchestration, [...orchestrationFields, 'handoff_contracts'], 'Runtime connector catalog orchestration');
  requireEnum(entry.orchestration.mode, ORCHESTRATION_MODES, 'Runtime connector catalog orchestration mode');
  requireBoolean(entry.orchestration.may_spawn_workers, 'Runtime connector catalog may_spawn_workers');
  requireBoolean(entry.orchestration.independent_child_authority_requested, 'Runtime connector catalog independent_child_authority_requested');
  requireBoolean(entry.orchestration.remote_execution_requested, 'Runtime connector catalog remote_execution_requested');
  if (entry.orchestration.handoff_contracts !== undefined) {
    requireArray(entry.orchestration.handoff_contracts, 'Runtime connector catalog handoff_contracts', { max: 16 });
    entry.orchestration.handoff_contracts.forEach((pin, index) => validateContractPin(pin, `Runtime connector catalog handoff_contracts[${index}]`));
  }

  requireFields(entry.assurance, ['observations', 'cataloged_at'], 'Runtime connector catalog assurance');
  rejectUnknown(entry.assurance, ['observations', 'cataloged_at', 'last_reviewed_at', 'evidence_fresh_until'], 'Runtime connector catalog assurance');
  requireArray(entry.assurance.observations, 'Runtime connector catalog observations', { max: 64 });
  entry.assurance.observations.forEach((observation, index) => validateObservation(observation, `Runtime connector catalog observations[${index}]`));
  const catalogedAt = requireDateTime(entry.assurance.cataloged_at, 'Runtime connector catalog cataloged_at');
  let reviewedAt = null;
  if (entry.assurance.last_reviewed_at !== undefined) {
    reviewedAt = requireDateTime(entry.assurance.last_reviewed_at, 'Runtime connector catalog last_reviewed_at');
    if (reviewedAt < catalogedAt) throw new ValidationError('Runtime connector catalog last_reviewed_at precedes cataloged_at');
  }
  if (entry.assurance.evidence_fresh_until !== undefined) {
    const freshUntil = requireDateTime(entry.assurance.evidence_fresh_until, 'Runtime connector catalog evidence_fresh_until');
    const freshnessBaseline = reviewedAt ?? catalogedAt;
    if (freshUntil < freshnessBaseline) {
      throw new ValidationError('Runtime connector catalog evidence_fresh_until precedes review/catalog baseline');
    }
  }

  requireFields(entry.lifecycle, ['update_mode', 'silent_permission_widening_allowed', 'rollback_available', 'quarantine_supported'], 'Runtime connector catalog lifecycle');
  rejectUnknown(entry.lifecycle, ['update_mode', 'silent_permission_widening_allowed', 'rollback_available', 'quarantine_supported', 'supersedes_entry_id'], 'Runtime connector catalog lifecycle');
  requireEnum(entry.lifecycle.update_mode, UPDATE_MODES, 'Runtime connector catalog update_mode');
  if (entry.lifecycle.silent_permission_widening_allowed !== false) {
    throw new ValidationError('Runtime connector catalog silent permission widening is forbidden');
  }
  requireBoolean(entry.lifecycle.rollback_available, 'Runtime connector catalog rollback_available');
  if (entry.lifecycle.quarantine_supported !== true) {
    throw new ValidationError('Runtime connector catalog quarantine support is required');
  }
  if (entry.lifecycle.supersedes_entry_id !== undefined) requireId(entry.lifecycle.supersedes_entry_id, 'Runtime connector catalog supersedes_entry_id', CATALOG_ID_RE);

  validateStringArray(entry.non_claims, 'Runtime connector catalog non_claims', { min: 1, max: 64 });
  return true;
}

export function validateTaskArtifactHandoff(value) {
  requireFields(value, HANDOFF_REQUIRED, 'Task artifact handoff');
  rejectUnknown(value, [...HANDOFF_REQUIRED, 'parent_task_id', 'handoff_from_task_id', 'events'], 'Task artifact handoff');
  if (value.schema !== TASK_ARTIFACT_HANDOFF_SCHEMA) {
    throw new ValidationError('Task artifact handoff schema is invalid');
  }
  requireId(value.task_id, 'Task artifact handoff task_id');
  requireId(value.causal_id, 'Task artifact handoff causal_id');
  if (value.parent_task_id !== undefined) requireId(value.parent_task_id, 'Task artifact handoff parent_task_id');
  if (value.handoff_from_task_id !== undefined) requireId(value.handoff_from_task_id, 'Task artifact handoff handoff_from_task_id');

  requireFields(value.requester, ['principal_id'], 'Task artifact handoff requester');
  rejectUnknown(value.requester, ['principal_id', 'sponsor_principal_id'], 'Task artifact handoff requester');
  requireId(value.requester.principal_id, 'Task artifact handoff requester principal_id');
  if (value.requester.sponsor_principal_id !== undefined) requireId(value.requester.sponsor_principal_id, 'Task artifact handoff sponsor_principal_id');

  requireFields(value.execution_target, ['integration_id', 'integration_class', 'adapter_contract'], 'Task artifact handoff execution_target');
  rejectUnknown(value.execution_target, ['integration_id', 'integration_class', 'artifact_sha256', 'adapter_contract'], 'Task artifact handoff execution_target');
  requireId(value.execution_target.integration_id, 'Task artifact handoff integration_id');
  requireEnum(value.execution_target.integration_class, CATALOG_CLASSES, 'Task artifact handoff integration_class');
  if (value.execution_target.artifact_sha256 !== undefined) requireSha256(value.execution_target.artifact_sha256, 'Task artifact handoff artifact_sha256');
  validateContractPin(value.execution_target.adapter_contract, 'Task artifact handoff adapter_contract');

  requireFields(value.request, ['runtime_operation', 'axiom_action', 'purpose', 'destinations'], 'Task artifact handoff request');
  rejectUnknown(value.request, ['runtime_operation', 'axiom_action', 'capability_id', 'purpose', 'destinations', 'data_classes'], 'Task artifact handoff request');
  requireId(value.request.runtime_operation, 'Task artifact handoff runtime_operation');
  requireId(value.request.axiom_action, 'Task artifact handoff axiom_action');
  if (value.request.capability_id !== undefined) requireId(value.request.capability_id, 'Task artifact handoff capability_id');
  requireId(value.request.purpose, 'Task artifact handoff purpose');
  validateStringArray(value.request.destinations, 'Task artifact handoff destinations', { max: 64 });
  if (value.request.data_classes !== undefined) validateStringArray(value.request.data_classes, 'Task artifact handoff data_classes', { max: 64 });

  const authorityFields = [
    'authority_source',
    'grant_required_before_effect',
    'coordination_is_authorization',
    'handoff_transfers_authority',
    'delegation_required_for_independent_child_authority'
  ];
  requireFields(value.authority, authorityFields, 'Task artifact handoff authority');
  rejectUnknown(value.authority, [...authorityFields, 'grant_id', 'grant_digest', 'delegation_id'], 'Task artifact handoff authority');
  if (value.authority.authority_source !== 'axiom-gateway') {
    throw new ValidationError('Task artifact handoff authority source must be axiom-gateway');
  }
  if (value.authority.grant_required_before_effect !== true) {
    throw new ValidationError('Task artifact handoff grant-before-effect gate is required');
  }
  if (value.authority.coordination_is_authorization !== false) {
    throw new ValidationError('Task artifact handoff coordination authorization is forbidden');
  }
  if (value.authority.handoff_transfers_authority !== false) {
    throw new ValidationError('Task artifact handoff handoff authority is forbidden');
  }
  if (value.authority.delegation_required_for_independent_child_authority !== true) {
    throw new ValidationError('Task artifact handoff delegation gate is required');
  }
  const hasGrantId = value.authority.grant_id !== undefined;
  const hasGrantDigest = value.authority.grant_digest !== undefined;
  if (hasGrantId !== hasGrantDigest) {
    throw new ValidationError('Task artifact handoff grant id and digest must appear together');
  }
  if (hasGrantId) {
    requireId(value.authority.grant_id, 'Task artifact handoff grant_id');
    requireSha256(value.authority.grant_digest, 'Task artifact handoff grant_digest');
  }
  if (value.authority.delegation_id !== undefined) requireId(value.authority.delegation_id, 'Task artifact handoff delegation_id');

  requireFields(value.budgets, ['timeout_ms'], 'Task artifact handoff budgets');
  rejectUnknown(value.budgets, ['timeout_ms', 'deadline_at', 'max_steps', 'max_tool_calls', 'max_child_tasks', 'cost_ceiling_minor_units'], 'Task artifact handoff budgets');
  requireInteger(value.budgets.timeout_ms, 'Task artifact handoff timeout_ms', { min: 1, max: 86400000 });
  if (value.budgets.max_steps !== undefined) requireInteger(value.budgets.max_steps, 'Task artifact handoff max_steps', { min: 1, max: 1000000 });
  if (value.budgets.max_tool_calls !== undefined) requireInteger(value.budgets.max_tool_calls, 'Task artifact handoff max_tool_calls', { max: 1000000 });
  if (value.budgets.max_child_tasks !== undefined) requireInteger(value.budgets.max_child_tasks, 'Task artifact handoff max_child_tasks', { max: 100000 });
  if (value.budgets.cost_ceiling_minor_units !== undefined) requireInteger(value.budgets.cost_ceiling_minor_units, 'Task artifact handoff cost_ceiling_minor_units');

  requireFields(value.lifecycle, ['state', 'created_at', 'updated_at'], 'Task artifact handoff lifecycle');
  rejectUnknown(value.lifecycle, ['state', 'created_at', 'updated_at', 'cancel_requested_at', 'state_reason', 'terminal_receipt_id', 'uncertainty_record_id'], 'Task artifact handoff lifecycle');
  requireEnum(value.lifecycle.state, TASK_STATES, 'Task artifact handoff lifecycle state');
  const created = requireDateTime(value.lifecycle.created_at, 'Task artifact handoff created_at');
  const updated = requireDateTime(value.lifecycle.updated_at, 'Task artifact handoff updated_at');
  if (updated < created) throw new ValidationError('Task artifact handoff updated_at precedes created_at');
  if (value.lifecycle.cancel_requested_at !== undefined) {
    const cancelledAt = requireDateTime(value.lifecycle.cancel_requested_at, 'Task artifact handoff cancel_requested_at');
    if (cancelledAt < created) throw new ValidationError('Task artifact handoff cancel_requested_at precedes created_at');
  }
  if (value.lifecycle.state_reason !== undefined) requireString(value.lifecycle.state_reason, 'Task artifact handoff state_reason', 1000);
  if (value.lifecycle.terminal_receipt_id !== undefined) requireId(value.lifecycle.terminal_receipt_id, 'Task artifact handoff terminal_receipt_id');
  if (value.lifecycle.uncertainty_record_id !== undefined) requireId(value.lifecycle.uncertainty_record_id, 'Task artifact handoff uncertainty_record_id');

  const nonTerminal = ['queued', 'running', 'awaiting-approval', 'blocked'];
  const terminal = ['completed', 'failed', 'cancelled', 'expired'];
  if (nonTerminal.includes(value.lifecycle.state)) {
    if (value.lifecycle.terminal_receipt_id || value.lifecycle.uncertainty_record_id) {
      throw new ValidationError('Task artifact handoff nonterminal state cannot carry terminal or uncertainty receipt');
    }
  } else if (terminal.includes(value.lifecycle.state)) {
    if (!value.lifecycle.terminal_receipt_id || value.lifecycle.uncertainty_record_id) {
      throw new ValidationError('Task artifact handoff terminal state requires terminal receipt and no uncertainty record');
    }
    if (['failed', 'cancelled', 'expired'].includes(value.lifecycle.state) && !value.lifecycle.state_reason) {
      throw new ValidationError('Task artifact handoff failed/cancelled/expired state requires state_reason');
    }
  } else if (value.lifecycle.state === 'uncertain') {
    if (!value.lifecycle.uncertainty_record_id || value.lifecycle.terminal_receipt_id) {
      throw new ValidationError('Task artifact handoff uncertain state requires uncertainty record and no terminal receipt');
    }
  }

  if (value.budgets.deadline_at !== undefined) {
    const deadline = requireDateTime(value.budgets.deadline_at, 'Task artifact handoff deadline_at');
    if (deadline < created) throw new ValidationError('Task artifact handoff deadline precedes created_at');
  }

  requireArray(value.inputs, 'Task artifact handoff inputs', { max: 256 });
  requireArray(value.outputs, 'Task artifact handoff outputs', { max: 256 });
  value.inputs.forEach((artifact, index) => validateArtifact(artifact, `Task artifact handoff inputs[${index}]`));
  value.outputs.forEach((artifact, index) => validateArtifact(artifact, `Task artifact handoff outputs[${index}]`));
  if (value.events !== undefined) {
    requireArray(value.events, 'Task artifact handoff events', { max: 1024 });
    for (const [index, event] of value.events.entries()) {
      requireFields(event, ['event_id', 'type', 'at', 'actor_principal_id'], `Task artifact handoff events[${index}]`);
      rejectUnknown(event, ['event_id', 'type', 'at', 'actor_principal_id', 'detail_digest'], `Task artifact handoff events[${index}]`);
      requireId(event.event_id, `Task artifact handoff events[${index}].event_id`);
      requireEnum(event.type, TASK_EVENT_TYPES, `Task artifact handoff events[${index}].type`);
      const eventAt = requireDateTime(event.at, `Task artifact handoff events[${index}].at`);
      if (eventAt < created) throw new ValidationError(`Task artifact handoff events[${index}].at precedes created_at`);
      requireId(event.actor_principal_id, `Task artifact handoff events[${index}].actor_principal_id`);
      if (event.detail_digest !== undefined) requireSha256(event.detail_digest, `Task artifact handoff events[${index}].detail_digest`);
    }
  }
  return true;
}

export function verifyRuntimeConnectorFabricContracts() {
  const catalog = readJson(CATALOG_URL, 'Runtime connector catalog contract');
  const handoff = readJson(HANDOFF_URL, 'Task artifact handoff contract');
  validateRuntimeConnectorCatalogSchema(catalog);
  validateTaskArtifactHandoffSchema(handoff);
  return Object.freeze({
    valid: true,
    catalog_schema: RUNTIME_CONNECTOR_CATALOG_SCHEMA,
    catalog_schema_id: RUNTIME_CONNECTOR_CATALOG_SCHEMA_ID,
    task_handoff_schema: TASK_ARTIFACT_HANDOFF_SCHEMA,
    task_handoff_schema_id: TASK_ARTIFACT_HANDOFF_SCHEMA_ID,
    contract_frozen: false,
    contract_byte_pinned: false,
    instance_validation: 'draft-critical-invariants',
    capability_promoted: false,
    external_runtime_loaded: false,
    external_effect_performed: false
  });
}
