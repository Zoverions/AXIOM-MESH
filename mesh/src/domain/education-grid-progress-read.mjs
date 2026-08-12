import {
  AxiomError,
  ValidationError,
  assertPlainObject,
  assertString,
  digestObject,
} from '../lib/canonical.mjs';
import { createGridEducationConsentAssertion } from './education-grid-consent.mjs';
import {
  EDUCATION_LEARNER_EVENT_RECORDED_KIND,
  validateEducationLearnerEventRecordPayload,
} from './education-learner-append-mutation.mjs';
import { createEducationLearnerRecordProvider } from './education-learner-record-provider.mjs';

const PRINCIPAL_ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/;
const MAX_PROGRESS_EVENTS = 4096;
const MAX_SCANNED_RECORDS = 32768;
const SCAN_BATCH = 512;

function parseInstant(value, name) {
  const text = assertString(value, name, { max: 64 });
  if (!/(?:Z|[+-]\d{2}:\d{2})$/.test(text)) {
    throw new ValidationError(`${name} must include an explicit timezone`);
  }
  const millis = Date.parse(text);
  if (!Number.isFinite(millis)) throw new ValidationError(`${name} must be ISO-8601`);
  return millis;
}

function projectedEvent(input) {
  return Object.freeze({
    event_id: input.event_id,
    event_type: input.event_type,
    occurred_at: input.occurred_at,
    payload_digest: input.payload_digest,
    memory_object_id: input.memory_object_id,
    ...(Array.isArray(input.expectation_ids)
      ? { expectation_ids: Object.freeze([...input.expectation_ids]) }
      : {}),
    ...(typeof input.review_state === 'string'
      ? { review_state: input.review_state }
      : {}),
  });
}

function scanLearnerEvents(store, subjectId) {
  if (!store?.db || typeof store.decodeEventRow !== 'function') {
    throw new ValidationError('Native education progress read requires a GridStore');
  }
  const statement = store.db.prepare(`
    SELECT * FROM events
    WHERE kind = ? AND subject = ? AND seq > ?
    ORDER BY seq
    LIMIT ?
  `);
  const events = [];
  let after = 0;
  let scanned = 0;
  for (;;) {
    const rows = statement.all(
      EDUCATION_LEARNER_EVENT_RECORDED_KIND,
      subjectId,
      after,
      SCAN_BATCH,
    );
    if (!rows.length) break;
    scanned += rows.length;
    if (scanned > MAX_SCANNED_RECORDS) {
      throw new AxiomError(
        'education_progress_scan_limit',
        'Learner progress history exceeds the bounded native read scan limit',
        409,
      );
    }
    for (const row of rows) events.push(store.decodeEventRow(row));
    after = rows[rows.length - 1].seq;
    if (rows.length < SCAN_BATCH) break;
  }
  return events;
}

async function readProgressFromGrid(store, input) {
  const asOfMillis = input.as_of === undefined
    ? Number.POSITIVE_INFINITY
    : parseInstant(input.as_of, 'learner progress as_of');
  const requestedExpectations = new Set(input.expectation_ids ?? []);
  const selected = [];

  for (const event of scanLearnerEvents(store, input.subject_id)) {
    const payloadWithEvidence = assertPlainObject(
      event.payload,
      'education learner Grid record payload',
    );
    const payload = { ...payloadWithEvidence };
    delete payload.evidence;
    const { input: recordedInput, record_digest } =
      validateEducationLearnerEventRecordPayload(payload);
    if (recordedInput.subject_id !== input.subject_id) {
      throw new ValidationError('Native learner progress record subject mismatch');
    }
    if (recordedInput.course_code !== input.course_code) continue;
    const occurredMillis = parseInstant(
      recordedInput.occurred_at,
      'learner record occurred_at',
    );
    if (occurredMillis > asOfMillis) continue;
    if (
      requestedExpectations.size > 0
      && !(recordedInput.expectation_ids ?? []).some(id => requestedExpectations.has(id))
    ) {
      continue;
    }
    selected.push({
      input: recordedInput,
      record_digest,
      event_hash: event.event_hash,
      occurredMillis,
    });
    if (selected.length > MAX_PROGRESS_EVENTS) {
      throw new AxiomError(
        'education_progress_result_limit',
        'Learner progress result exceeds the current bounded native result limit',
        409,
      );
    }
  }

  selected.sort((left, right) => {
    if (left.occurredMillis !== right.occurredMillis) {
      return left.occurredMillis - right.occurredMillis;
    }
    return left.input.event_id.localeCompare(right.input.event_id);
  });

  return Object.freeze({
    status: 'available',
    subject_id: input.subject_id,
    course_code: input.course_code,
    ...(input.as_of === undefined ? {} : { as_of: input.as_of }),
    events: Object.freeze(selected.map(({ input: record }) => projectedEvent(record))),
    evidence_refs: Object.freeze(
      selected.map(({ event_hash, record_digest }) =>
        `grid-event:${event_hash}:learner-record:${record_digest}`),
    ),
  });
}

export function createGridNativeEducationLearnerReadProvider({
  store,
  now = () => new Date().toISOString(),
  provider_id = 'provider:grid-native-education-learner-read',
  provider_version = '0.1.0',
} = {}) {
  const assertConsent = createGridEducationConsentAssertion({ store, now });
  return createEducationLearnerRecordProvider({
    provider_id,
    provider_version,
    assertConsent,
    assertMemoryReference: async () => false,
    appendEvent: async () => {
      throw new ValidationError('Native learner read provider does not append events');
    },
    readProgress: input => readProgressFromGrid(store, input),
  });
}

export async function executeGridNativeEducationLearnerProgressRead({
  store,
  rawInput,
  actor,
  now = () => new Date().toISOString(),
}) {
  const actorId = assertString(actor, 'native education progress read actor', {
    max: 160,
    pattern: PRINCIPAL_ID,
  });
  const input = assertPlainObject(rawInput, 'native education progress read input');
  const subjectId = assertString(input.subject_id, 'native education progress subject_id', {
    max: 160,
    pattern: PRINCIPAL_ID,
  });
  if (actorId !== subjectId) {
    throw new AxiomError(
      'education_cross_subject_read_unavailable',
      'Native learner progress read is limited to the authenticated learner subject until delegated authority is implemented',
      403,
    );
  }
  const provider = createGridNativeEducationLearnerReadProvider({ store, now });
  const { executeEducationLearnerRecordAction } = await import(
    './education-learner-record-provider.mjs'
  );
  const executed = await executeEducationLearnerRecordAction(
    'education.learner.progress.read',
    input,
    { provider, actor: actorId },
  );
  if (!executed.ok) {
    throw new AxiomError(
      executed.error?.code ?? 'education_progress_unavailable',
      executed.error?.message ?? 'Learner progress is unavailable',
      executed.http_status ?? 503,
    );
  }
  return Object.freeze({
    provider_id: executed.provider_id,
    provider_version: executed.provider_version,
    provider_capability: executed.provider_capability,
    result: executed.result,
    result_digest: digestObject(executed.result),
  });
}
