import {
  ValidationError,
  assertPlainObject,
  assertString,
  canonicalJson,
  digestObject,
  sha256
} from './canonical.mjs';
import {
  PROJECT_EVENT_SCHEMA,
  normalizeProjectEvent
} from './project-continuity-events.mjs';
import { SOURCE_CONTENT_ADDRESS_PROFILE } from './source-continuity.mjs';

export const CI_EVIDENCE_RECORD_SCHEMA = 'axiom-ci-evidence-record.v1';

const DIGEST = /^[a-f0-9]{64}$/;
const ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,255}$/;
const MEDIA_TYPE = /^[A-Za-z0-9][A-Za-z0-9!#$&^_.+-]*\/[A-Za-z0-9][A-Za-z0-9!#$&^_.+-]*$/;
const PROTECTED_REF = /^protected:[A-Za-z0-9][A-Za-z0-9_.:-]{0,191}$/;
const CONCLUSIONS = new Set(['passed', 'failed', 'neutral', 'cancelled', 'skipped', 'unknown']);
const TIME_ASSURANCE = new Set(['provider_reported', 'axiom_observed', 'independently_attested']);
const EXECUTION_CLASSES = new Set(['hosted', 'self_hosted', 'local', 'unknown']);
const ISOLATION_CLASSES = new Set(['container', 'vm', 'bare_metal', 'process', 'unknown']);
const NETWORK_CLASSES = new Set(['disabled', 'restricted', 'available', 'unknown']);
const OUTPUT_KINDS = new Set([
  'log',
  'test_report',
  'coverage_report',
  'security_report',
  'build_artifact',
  'benchmark_report',
  'other'
]);
const VISIBILITY = new Set(['public', 'private', 'sensitive']);
const OUTPUT_MODES = new Set(['digest_only', 'protected_reference']);

function rejectUnknown(value, allowed, name) {
  const unknown = Object.keys(value).filter(key => !allowed.has(key));
  if (unknown.length) {
    throw new ValidationError(`${name} contains unsupported fields: ${unknown.join(', ')}`);
  }
}

function present(value) {
  return value !== null && value !== undefined;
}

function id(value, name, { max = 256 } = {}) {
  return assertString(value, name, { min: 1, max, pattern: ID });
}

function digest(value, name) {
  return assertString(value, name, { min: 64, max: 64, pattern: DIGEST });
}

function iso(value, name) {
  const raw = assertString(value, name, { min: 1, max: 64 });
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.valueOf())) throw new ValidationError(`${name} must be an ISO timestamp`);
  return parsed.toISOString();
}

function boundedInteger(value, name, { min = 0, max = 64 * 1024 * 1024 * 1024 } = {}) {
  if (!Number.isSafeInteger(value) || value < min || value > max) {
    throw new ValidationError(`${name} must be an integer between ${min} and ${max}`);
  }
  return value;
}

function boundedString(value, name, { max = 256 } = {}) {
  const raw = assertString(value, name, { min: 1, max });
  if (/[\r\n\u0000]/.test(raw)) throw new ValidationError(`${name} contains control characters`);
  return raw;
}

function normalizeRunner(raw) {
  const value = assertPlainObject(raw, 'CI runner facts');
  rejectUnknown(value, new Set([
    'execution_class',
    'os',
    'architecture',
    'runtime',
    'isolation_class',
    'network_class',
    'environment_digest',
    'runner_evidence_digest'
  ]), 'CI runner facts');
  if (!EXECUTION_CLASSES.has(value.execution_class)) {
    throw new ValidationError('CI runner execution class is unsupported');
  }
  if (!ISOLATION_CLASSES.has(value.isolation_class)) {
    throw new ValidationError('CI runner isolation class is unsupported');
  }
  if (!NETWORK_CLASSES.has(value.network_class)) {
    throw new ValidationError('CI runner network class is unsupported');
  }
  return {
    execution_class: value.execution_class,
    os: boundedString(value.os, 'runner.os', { max: 128 }),
    architecture: boundedString(value.architecture, 'runner.architecture', { max: 64 }),
    runtime: boundedString(value.runtime, 'runner.runtime', { max: 128 }),
    isolation_class: value.isolation_class,
    network_class: value.network_class,
    environment_digest: digest(value.environment_digest, 'runner.environment_digest'),
    runner_evidence_digest: digest(value.runner_evidence_digest, 'runner.runner_evidence_digest')
  };
}

function normalizeOutput(raw, index) {
  const value = assertPlainObject(raw, `outputs[${index}]`);
  rejectUnknown(value, new Set([
    'output_id',
    'kind',
    'media_type',
    'sha256',
    'byte_length',
    'visibility',
    'mode',
    'protected_ref'
  ]), `outputs[${index}]`);
  if (!OUTPUT_KINDS.has(value.kind)) {
    throw new ValidationError(`outputs[${index}].kind is unsupported`);
  }
  if (!VISIBILITY.has(value.visibility)) {
    throw new ValidationError(`outputs[${index}].visibility is unsupported`);
  }
  if (!OUTPUT_MODES.has(value.mode)) {
    throw new ValidationError(`outputs[${index}].mode is unsupported`);
  }
  const protectedRef = present(value.protected_ref)
    ? assertString(value.protected_ref, `outputs[${index}].protected_ref`, {
        min: 11,
        max: 202,
        pattern: PROTECTED_REF
      })
    : null;
  if (value.mode === 'protected_reference' && protectedRef === null) {
    throw new ValidationError('CI protected output requires an opaque protected reference');
  }
  if (value.mode === 'digest_only' && protectedRef !== null) {
    throw new ValidationError('CI digest-only output cannot carry a protected reference');
  }
  return {
    output_id: id(value.output_id, `outputs[${index}].output_id`),
    kind: value.kind,
    media_type: assertString(value.media_type, `outputs[${index}].media_type`, {
      min: 3,
      max: 128,
      pattern: MEDIA_TYPE
    }),
    sha256: digest(value.sha256, `outputs[${index}].sha256`),
    byte_length: boundedInteger(value.byte_length, `outputs[${index}].byte_length`),
    visibility: value.visibility,
    mode: value.mode,
    protected_ref: protectedRef
  };
}

export function normalizeCiEvidenceRecord(raw) {
  const value = assertPlainObject(raw, 'CI evidence record');
  rejectUnknown(value, new Set([
    'schema',
    'project_id',
    'check_id',
    'workflow_id',
    'workflow_revision_digest',
    'source_state_digest',
    'started_at',
    'completed_at',
    'time_assurance',
    'conclusion',
    'runner',
    'result_evidence_digest',
    'outputs',
    'provider_run_is_identity',
    'governance_authority_granted',
    'release_promotion_granted',
    'capability_promotion_granted',
    'content_address_profile',
    'record_id',
    'record_digest'
  ]), 'CI evidence record');
  if (value.schema !== CI_EVIDENCE_RECORD_SCHEMA) {
    throw new ValidationError(`CI evidence record schema must be ${CI_EVIDENCE_RECORD_SCHEMA}`);
  }
  if (!CONCLUSIONS.has(value.conclusion)) {
    throw new ValidationError('CI evidence conclusion is unsupported');
  }
  if (!TIME_ASSURANCE.has(value.time_assurance)) {
    throw new ValidationError('CI evidence time assurance is unsupported');
  }
  if (
    value.provider_run_is_identity !== false
    || value.governance_authority_granted !== false
    || value.release_promotion_granted !== false
    || value.capability_promotion_granted !== false
  ) {
    throw new ValidationError('CI evidence authority/identity claim boundary is weakened');
  }
  if (value.content_address_profile !== SOURCE_CONTENT_ADDRESS_PROFILE) {
    throw new ValidationError('CI evidence content-address profile is unsupported');
  }
  const startedAt = iso(value.started_at, 'started_at');
  const completedAt = iso(value.completed_at, 'completed_at');
  if (new Date(completedAt) < new Date(startedAt)) {
    throw new ValidationError('CI evidence completion cannot precede start');
  }
  if (!Array.isArray(value.outputs) || value.outputs.length > 512) {
    throw new ValidationError('CI evidence outputs must be an array with at most 512 items');
  }
  const outputs = value.outputs
    .map(normalizeOutput)
    .sort((a, b) => a.output_id.localeCompare(b.output_id));
  if (new Set(outputs.map(output => output.output_id)).size !== outputs.length) {
    throw new ValidationError('CI evidence output ids must be unique');
  }
  const body = {
    schema: CI_EVIDENCE_RECORD_SCHEMA,
    project_id: id(value.project_id, 'project_id'),
    check_id: id(value.check_id, 'check_id'),
    workflow_id: id(value.workflow_id, 'workflow_id'),
    workflow_revision_digest: digest(value.workflow_revision_digest, 'workflow_revision_digest'),
    source_state_digest: digest(value.source_state_digest, 'source_state_digest'),
    started_at: startedAt,
    completed_at: completedAt,
    time_assurance: value.time_assurance,
    conclusion: value.conclusion,
    runner: normalizeRunner(value.runner),
    result_evidence_digest: digest(value.result_evidence_digest, 'result_evidence_digest'),
    outputs,
    provider_run_is_identity: false,
    governance_authority_granted: false,
    release_promotion_granted: false,
    capability_promotion_granted: false,
    content_address_profile: SOURCE_CONTENT_ADDRESS_PROFILE
  };
  const recordDigest = digestObject(body);
  const recordId = `ci-evidence-record:${recordDigest}`;
  if (present(value.record_digest) && digest(value.record_digest, 'record_digest') !== recordDigest) {
    throw new ValidationError('CI evidence record digest does not match canonical content');
  }
  if (
    present(value.record_id)
    && assertString(value.record_id, 'record_id', { min: 1, max: 320 }) !== recordId
  ) {
    throw new ValidationError('CI evidence record id does not match canonical content');
  }
  return { ...body, record_id: recordId, record_digest: recordDigest };
}

export function ciEvidenceProjectContent(record) {
  const normalized = normalizeCiEvidenceRecord(record);
  const bytes = Buffer.from(canonicalJson(normalized), 'utf8');
  return {
    visibility: 'public',
    mode: 'digest_only',
    media_type: 'application/json',
    content_digest: sha256(bytes),
    byte_length: bytes.length
  };
}

export function buildCiEvidenceProjectEvent(record) {
  const normalized = normalizeCiEvidenceRecord(record);
  return normalizeProjectEvent({
    schema: PROJECT_EVENT_SCHEMA,
    project_id: normalized.project_id,
    project_object_id: normalized.check_id,
    object_kind: 'ci_check',
    event_kind: 'ci.check_completed',
    occurred_at: normalized.completed_at,
    time_assurance: normalized.time_assurance,
    actor: { actor_id: null, actor_binding_digest: null },
    content: ciEvidenceProjectContent(normalized),
    source_state_digest: normalized.source_state_digest,
    previous_event_digest: null,
    related_object_ids: normalized.outputs.map(output => output.output_id),
    ci_outcome: normalized.conclusion,
    governance_authority_granted: false,
    capability_promotion: false,
    content_address_profile: SOURCE_CONTENT_ADDRESS_PROFILE
  });
}

export const CI_EVIDENCE_CONCLUSIONS = Object.freeze([...CONCLUSIONS].sort());
export const CI_EVIDENCE_OUTPUT_KINDS = Object.freeze([...OUTPUT_KINDS].sort());
