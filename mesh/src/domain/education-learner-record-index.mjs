import { digestObject, ValidationError, assertString } from '../lib/canonical.mjs';
import { createEducationLearnerRecordProvider } from './education-learner-record-provider.mjs';

const KEY_SEP = '\u001f';

function freezeEvent(event) {
  return Object.freeze({
    event_id: event.event_id,
    event_type: event.event_type,
    occurred_at: event.occurred_at,
    payload_digest: event.payload_digest,
    memory_object_id: event.memory_object_id,
    ...(Array.isArray(event.expectation_ids)
      ? { expectation_ids: Object.freeze([...event.expectation_ids]) }
      : {}),
    ...(typeof event.review_state === 'string'
      ? { review_state: event.review_state }
      : {}),
  });
}

function parseInstant(value, name) {
  assertString(value, name, { min: 1, max: 64 });
  if (!/(?:Z|[+-]\d{2}:\d{2})$/.test(value)) {
    throw new ValidationError(`${name} must include an explicit timezone`);
  }
  const millis = Date.parse(value);
  if (!Number.isFinite(millis)) throw new ValidationError(`${name} must be ISO-8601`);
  return millis;
}

function appendRecordFromInput(input) {
  return Object.freeze({
    subject_id: input.subject_id,
    event_id: input.event_id,
    event_type: input.event_type,
    occurred_at: input.occurred_at,
    payload_digest: input.payload_digest,
    memory_object_id: input.memory_object_id,
    course_code: input.course_code ?? null,
    expectation_ids: Object.freeze([...(input.expectation_ids ?? [])]),
    review_state: input.review_state ?? null,
  });
}

function eventKey(subjectId, eventId) {
  return `${subjectId}${KEY_SEP}${eventId}`;
}

/**
 * Reference learner-record index implementing the storage semantics required by
 * the education provider contract.
 *
 * This class is deliberately not wired into AXIOM runtime configuration and is
 * not a production datastore. It exists as an executable conformance model for
 * later Grid-backed adapters.
 */
export class InMemoryEducationLearnerRecordIndex {
  #records = new Map();

  get size() {
    return this.#records.size;
  }

  async appendEvent(input) {
    const record = appendRecordFromInput(input);
    parseInstant(record.occurred_at, 'learner record occurred_at');
    const key = eventKey(record.subject_id, record.event_id);
    const recordDigest = digestObject(record);
    const existing = this.#records.get(key);
    if (existing) {
      if (existing.record_digest !== recordDigest) {
        throw new ValidationError(
          'learner record event_id conflict: existing event binding differs',
        );
      }
      return Object.freeze({
        status: 'recorded',
        subject_id: existing.record.subject_id,
        event_id: existing.record.event_id,
        payload_digest: existing.record.payload_digest,
        memory_object_id: existing.record.memory_object_id,
        record_digest: existing.record_digest,
        evidence_refs: Object.freeze([
          `learner-record:${existing.record_digest}`,
        ]),
      });
    }

    this.#records.set(
      key,
      Object.freeze({ record, record_digest: recordDigest }),
    );
    return Object.freeze({
      status: 'recorded',
      subject_id: record.subject_id,
      event_id: record.event_id,
      payload_digest: record.payload_digest,
      memory_object_id: record.memory_object_id,
      record_digest: recordDigest,
      evidence_refs: Object.freeze([`learner-record:${recordDigest}`]),
    });
  }

  async readProgress(input) {
    const asOfMillis = input.as_of === undefined
      ? Number.POSITIVE_INFINITY
      : parseInstant(input.as_of, 'learner progress as_of');
    const requestedExpectations = new Set(input.expectation_ids ?? []);

    const selected = [];
    for (const { record } of this.#records.values()) {
      if (record.subject_id !== input.subject_id) continue;
      if (record.course_code !== input.course_code) continue;
      const occurredMillis = parseInstant(record.occurred_at, 'learner record occurred_at');
      if (occurredMillis > asOfMillis) continue;
      if (
        requestedExpectations.size > 0 &&
        !record.expectation_ids.some(id => requestedExpectations.has(id))
      ) {
        continue;
      }
      selected.push({ record, occurredMillis });
    }

    selected.sort((left, right) => {
      if (left.occurredMillis !== right.occurredMillis) {
        return left.occurredMillis - right.occurredMillis;
      }
      return left.record.event_id.localeCompare(right.record.event_id);
    });

    return Object.freeze({
      status: 'available',
      subject_id: input.subject_id,
      course_code: input.course_code,
      ...(input.as_of === undefined ? {} : { as_of: input.as_of }),
      events: Object.freeze(selected.map(({ record }) => freezeEvent(record))),
      evidence_refs: Object.freeze(
        selected.map(({ record }) => `learner-record:${digestObject(record)}`),
      ),
    });
  }
}

export function createIndexedEducationLearnerRecordProvider({
  provider_id,
  provider_version,
  index,
  assertConsent,
  assertMemoryReference,
}) {
  if (
    !index ||
    typeof index.appendEvent !== 'function' ||
    typeof index.readProgress !== 'function'
  ) {
    throw new ValidationError(
      'indexed education learner-record provider requires appendEvent/readProgress index',
    );
  }
  return createEducationLearnerRecordProvider({
    provider_id,
    provider_version,
    assertConsent,
    assertMemoryReference,
    appendEvent: input => index.appendEvent(input),
    readProgress: input => index.readProgress(input),
  });
}
