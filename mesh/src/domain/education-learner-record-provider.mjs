import { digestObject, ValidationError, assertPlainObject, assertString, assertStringArray } from '../lib/canonical.mjs';
import {
  loadEducationContract,
  validateEducationIntent,
} from './education-contract.mjs';

const SHA256_RE = /^[a-f0-9]{64}$/;
const LEARNER_ACTIONS = new Set([
  'education.learner.event.append',
  'education.learner.progress.read',
]);
const APPEND_RESULT_FIELDS = new Set([
  'status',
  'subject_id',
  'event_id',
  'payload_digest',
  'memory_object_id',
  'record_digest',
  'evidence_refs',
]);
const READ_RESULT_FIELDS = new Set([
  'status',
  'subject_id',
  'course_code',
  'events',
  'as_of',
  'next_cursor',
  'evidence_refs',
]);
const EVENT_PROJECTION_FIELDS = new Set([
  'event_id',
  'event_type',
  'occurred_at',
  'payload_digest',
  'memory_object_id',
  'expectation_ids',
  'review_state',
]);
const FORBIDDEN_PROVIDER_FIELDS = new Set([
  'raw_student_work',
  'raw_feedback',
  'grade',
  'credit',
  'transcript',
  'mastery',
  'automatic_mastery',
]);

function assertExactFields(value, allowed, name) {
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) throw new ValidationError(`${name} contains unsupported field: ${key}`);
  }
}

function assertDigest(value, name) {
  assertString(value, name, { min: 64, max: 64, pattern: SHA256_RE });
  return value;
}

function assertOptionalEvidenceRefs(value) {
  if (value === undefined) return undefined;
  return assertStringArray(value, 'provider result evidence_refs', { maxItems: 64, itemMax: 512 });
}

function assertNoForbiddenFields(value, path = 'provider result') {
  if (!value || typeof value !== 'object') return;
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertNoForbiddenFields(item, `${path}[${index}]`));
    return;
  }
  for (const [key, item] of Object.entries(value)) {
    if (FORBIDDEN_PROVIDER_FIELDS.has(key)) {
      throw new ValidationError(`${path} contains forbidden learner-record field: ${key}`);
    }
    assertNoForbiddenFields(item, `${path}.${key}`);
  }
}

function validateAppendResult(result, input) {
  const value = assertPlainObject(result, 'learner-record append result');
  assertExactFields(value, APPEND_RESULT_FIELDS, 'learner-record append result');
  assertNoForbiddenFields(value);
  if (value.status !== 'recorded') {
    throw new ValidationError('learner-record append result status must be recorded');
  }
  if (value.subject_id !== input.subject_id) {
    throw new ValidationError('learner-record append result subject_id mismatch');
  }
  if (value.event_id !== input.event_id) {
    throw new ValidationError('learner-record append result event_id mismatch');
  }
  if (value.payload_digest !== input.payload_digest) {
    throw new ValidationError('learner-record append result payload_digest mismatch');
  }
  if (value.memory_object_id !== input.memory_object_id) {
    throw new ValidationError('learner-record append result memory_object_id mismatch');
  }
  assertDigest(value.record_digest, 'learner-record append result record_digest');
  assertOptionalEvidenceRefs(value.evidence_refs);
  return Object.freeze({ ...value });
}

function validateProgressEvent(event, index) {
  const value = assertPlainObject(event, `learner-record progress events[${index}]`);
  assertExactFields(value, EVENT_PROJECTION_FIELDS, `learner-record progress events[${index}]`);
  assertNoForbiddenFields(value, `learner-record progress events[${index}]`);
  assertString(value.event_id, `events[${index}].event_id`, { max: 256 });
  assertString(value.event_type, `events[${index}].event_type`, { max: 128 });
  assertString(value.occurred_at, `events[${index}].occurred_at`, { max: 64 });
  assertDigest(value.payload_digest, `events[${index}].payload_digest`);
  assertString(value.memory_object_id, `events[${index}].memory_object_id`, { max: 256 });
  if (value.expectation_ids !== undefined) {
    assertStringArray(value.expectation_ids, `events[${index}].expectation_ids`, {
      maxItems: 256,
      itemMax: 256,
    });
  }
  if (value.review_state !== undefined) {
    assertString(value.review_state, `events[${index}].review_state`, { max: 128 });
  }
  return Object.freeze({ ...value });
}

function validateReadResult(result, input) {
  const value = assertPlainObject(result, 'learner-record progress result');
  assertExactFields(value, READ_RESULT_FIELDS, 'learner-record progress result');
  assertNoForbiddenFields(value);
  if (value.status !== 'available') {
    throw new ValidationError('learner-record progress result status must be available');
  }
  if (value.subject_id !== input.subject_id) {
    throw new ValidationError('learner-record progress result subject_id mismatch');
  }
  if (value.course_code !== input.course_code) {
    throw new ValidationError('learner-record progress result course_code mismatch');
  }
  if (!Array.isArray(value.events) || value.events.length > 4096) {
    throw new ValidationError('learner-record progress result events must contain at most 4096 items');
  }
  const events = value.events.map(validateProgressEvent);
  if (value.as_of !== undefined) {
    assertString(value.as_of, 'learner-record progress result as_of', { max: 64 });
  }
  if (value.next_cursor !== undefined) {
    assertString(value.next_cursor, 'learner-record progress result next_cursor', { max: 512 });
  }
  assertOptionalEvidenceRefs(value.evidence_refs);
  return Object.freeze({ ...value, events: Object.freeze(events) });
}

function validateProvider(provider) {
  const value = assertPlainObject(provider, 'education learner-record provider');
  assertString(value.provider_id, 'education learner-record provider.provider_id', { max: 128 });
  assertString(value.provider_version, 'education learner-record provider.provider_version', { max: 64 });
  if (value.provider_capability !== 'education.learner-record') {
    throw new ValidationError('education learner-record provider capability mismatch');
  }
  for (const method of ['assertConsent', 'assertMemoryReference', 'appendEvent', 'readProgress']) {
    if (typeof value[method] !== 'function') {
      throw new ValidationError(`education learner-record provider requires ${method}()`);
    }
  }
  return value;
}

function educationUnavailableResult(actionName, action) {
  return {
    ok: false,
    http_status: 503,
    error: {
      code: 'capability_unavailable',
      message: `Education capability ${action.provider_capability} has no configured adapter`,
      details: {
        action: actionName,
        provider_capability: action.provider_capability,
        capability_status: 'adapter_required',
      },
    },
  };
}

export function createEducationLearnerRecordProvider({
  provider_id,
  provider_version,
  assertConsent,
  assertMemoryReference,
  appendEvent,
  readProgress,
}) {
  return Object.freeze(
    validateProvider({
      provider_id,
      provider_version,
      provider_capability: 'education.learner-record',
      assertConsent,
      assertMemoryReference,
      appendEvent,
      readProgress,
    }),
  );
}

async function authorizeConsent(provider, input, { purpose, data_scope }) {
  const result = await provider.assertConsent({
    subject_id: input.subject_id,
    consent_id: input.consent_id,
    purpose,
    data_scope,
  });
  if (result !== true) {
    throw new ValidationError('education learner-record consent assertion failed');
  }
}

export async function executeEducationLearnerRecordAction(
  actionName,
  input,
  { provider = null } = {},
) {
  const contract = await loadEducationContract();
  validateEducationIntent(contract, actionName, input);
  const action = contract.actions[actionName];
  if (!LEARNER_ACTIONS.has(actionName) || action.provider_capability !== 'education.learner-record') {
    throw new ValidationError(`education learner-record provider does not handle action: ${actionName}`);
  }
  if (provider === null) return educationUnavailableResult(actionName, action);
  const adapter = validateProvider(provider);

  if (actionName === 'education.learner.event.append') {
    await authorizeConsent(adapter, input, {
      purpose: 'learning-progress-recording',
      data_scope: 'learning-progress:write',
    });
    const memoryOk = await adapter.assertMemoryReference({
      subject_id: input.subject_id,
      consent_id: input.consent_id,
      purpose: input.purpose,
      memory_object_id: input.memory_object_id,
      payload_digest: input.payload_digest,
    });
    if (memoryOk !== true) {
      throw new ValidationError('education learner-record memory reference assertion failed');
    }
    const result = await adapter.appendEvent(Object.freeze({ ...input }));
    return {
      ok: true,
      http_status: 200,
      provider_id: adapter.provider_id,
      provider_version: adapter.provider_version,
      provider_capability: adapter.provider_capability,
      result: validateAppendResult(result, input),
      result_digest: digestObject(result),
    };
  }

  await authorizeConsent(adapter, input, {
    purpose: 'learning-progress-review',
    data_scope: 'learning-progress:read',
  });
  const result = await adapter.readProgress(Object.freeze({ ...input }));
  return {
    ok: true,
    http_status: 200,
    provider_id: adapter.provider_id,
    provider_version: adapter.provider_version,
    provider_capability: adapter.provider_capability,
    result: validateReadResult(result, input),
    result_digest: digestObject(result),
  };
}
