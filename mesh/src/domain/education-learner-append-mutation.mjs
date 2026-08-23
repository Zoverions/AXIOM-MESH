import { readFileSync } from 'node:fs';

import {
  ValidationError,
  assertPlainObject,
  assertString,
  digestObject,
} from '../lib/canonical.mjs';
import {
  EDUCATION_CONTRACT_PATH,
  validateEducationContract,
  validateEducationIntent,
} from './education-contract.mjs';

export const EDUCATION_LEARNER_EVENT_RECORDED_KIND =
  'education.learner.event.recorded';
export const EDUCATION_LEARNER_EVENT_RECORD_SCHEMA =
  'axiom.education.learner-event-record.v1';

const EDUCATION_CONTRACT = loadPinnedEducationContractSync();
const GRID_EVENT_ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/;

function loadPinnedEducationContractSync() {
  let raw;
  try {
    raw = readFileSync(EDUCATION_CONTRACT_PATH);
  } catch (error) {
    throw new ValidationError(
      `Pinned Axiom Education contract cannot be read: ${error.message}`,
    );
  }
  let contract;
  try {
    contract = JSON.parse(raw.toString('utf8'));
  } catch (error) {
    throw new ValidationError(
      `Pinned Axiom Education contract is invalid JSON: ${error.message}`,
    );
  }
  validateEducationContract(contract, { rawBytes: raw });
  return Object.freeze(contract);
}

function boundedProjection(input) {
  const record = {
    schema: EDUCATION_LEARNER_EVENT_RECORD_SCHEMA,
    contract_id: input.contract_id,
    contract_version: input.contract_version,
    contract_sha256: input.contract_sha256,
    subject_id: input.subject_id,
    consent_id: input.consent_id,
    purpose: input.purpose,
    event_id: input.event_id,
    event_type: input.event_type,
    occurred_at: input.occurred_at,
    payload_digest: input.payload_digest,
    memory_object_id: input.memory_object_id,
  };
  for (const field of [
    'active_pack_manifest_sha256',
    'course_code',
    'expectation_ids',
    'review_state',
  ]) {
    if (Object.hasOwn(input, field)) record[field] = structuredClone(input[field]);
  }
  return record;
}

export function deriveEducationLearnerGridEventId(subjectId, eventId) {
  assertString(subjectId, 'education learner subject_id', { max: 160 });
  assertString(eventId, 'education learner event_id', { max: 256 });
  return `education_evt_${digestObject({ subject_id: subjectId, event_id: eventId })}`;
}

export function validateEducationLearnerEventRecordPayload(rawPayload) {
  const payload = assertPlainObject(rawPayload, 'education learner event record payload');
  if (payload.schema !== EDUCATION_LEARNER_EVENT_RECORD_SCHEMA) {
    throw new ValidationError('Education learner event record schema mismatch');
  }
  const input = { ...payload };
  delete input.schema;
  const recordDigest = input.record_digest;
  delete input.record_digest;
  validateEducationIntent(
    EDUCATION_CONTRACT,
    'education.learner.event.append',
    input,
  );
  const expectedDigest = digestObject(boundedProjection(input));
  if (recordDigest !== expectedDigest) {
    throw new ValidationError('Education learner event record digest mismatch');
  }
  return Object.freeze({
    input: Object.freeze(structuredClone(input)),
    record_digest: recordDigest,
  });
}

export function createEducationLearnerAppendMutation(intent) {
  const value = assertPlainObject(intent, 'intent');
  if (value.action !== 'education.learner.event.append') {
    throw new ValidationError('Education learner append validator action mismatch');
  }
  const input = assertPlainObject(value.input, 'intent.input');
  validateEducationIntent(
    EDUCATION_CONTRACT,
    'education.learner.event.append',
    input,
  );
  const record = boundedProjection(input);
  const recordDigest = digestObject(record);
  const gridEventId = deriveEducationLearnerGridEventId(
    input.subject_id,
    input.event_id,
  );
  if (!GRID_EVENT_ID.test(gridEventId)) {
    throw new ValidationError('Derived education learner Grid event id is invalid');
  }
  return {
    output: {
      learner_record_status: 'recorded',
      learner_record_digest: recordDigest,
      learner_record_event_id: gridEventId,
      memory_object_id: input.memory_object_id,
    },
    mutation: {
      event_id: gridEventId,
      kind: EDUCATION_LEARNER_EVENT_RECORDED_KIND,
      subject: input.subject_id,
      payload: {
        ...record,
        record_digest: recordDigest,
      },
    },
  };
}
