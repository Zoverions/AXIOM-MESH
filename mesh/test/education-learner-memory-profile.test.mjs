import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import {
  EDUCATION_LEARNER_MEMORY_EVENT_TYPE_TO_KIND,
  EDUCATION_LEARNER_MEMORY_PROFILE,
  EDUCATION_LEARNER_MEMORY_PROFILE_PATH,
  EDUCATION_LEARNER_MEMORY_PROFILE_SHA256,
  EDUCATION_LEARNER_RECORD_MEMORY_KINDS,
} from '../src/domain/education-learner-memory-profile.mjs';

const PROVIDER_CONTRACT_PATH = fileURLToPath(
  new URL('../config/domain-providers/education-learner-record.v1.json', import.meta.url),
);

const EXPECTED_MAPPING = Object.freeze({
  'appeal.filed': 'education.appeal-reason',
  'assignment.created': 'education.assignment-artifact',
  'correction.recorded': 'education.correction-evidence',
  'feedback.recorded': 'education.educator-feedback',
  'revision.requested': 'education.educator-feedback',
  'submission.created': 'education.learner-submission',
  'submission.resubmitted': 'education.learner-submission',
});
const EXPECTED_KINDS = Object.freeze([
  'education.appeal-reason',
  'education.assignment-artifact',
  'education.correction-evidence',
  'education.educator-feedback',
  'education.learner-submission',
]);
const EXPECTED_METADATA_FIELDS = Object.freeze([
  'schema',
  'workflow_id',
  'assignment_id',
  'event_id',
  'event_type',
  'workflow_payload_digest',
]);

test('learner-memory profile bytes and runtime projection are exactly pinned', async () => {
  const raw = await readFile(EDUCATION_LEARNER_MEMORY_PROFILE_PATH);
  assert.equal(raw.length, 971);
  assert.equal(
    createHash('sha256').update(raw).digest('hex'),
    '9289753c2db2eaa4c18653526f248c5b87c83dc2ab1337ef82b46cf8b23af59d',
  );
  assert.equal(
    EDUCATION_LEARNER_MEMORY_PROFILE_SHA256,
    '9289753c2db2eaa4c18653526f248c5b87c83dc2ab1337ef82b46cf8b23af59d',
  );
  assert.deepEqual(EDUCATION_LEARNER_MEMORY_EVENT_TYPE_TO_KIND, EXPECTED_MAPPING);
  assert.deepEqual(EDUCATION_LEARNER_RECORD_MEMORY_KINDS, EXPECTED_KINDS);
  assert.equal(EDUCATION_LEARNER_MEMORY_PROFILE.memory_action, 'memory.put');
  assert.equal(
    EDUCATION_LEARNER_MEMORY_PROFILE.metadata_schema,
    'axiom-education-governed-memory-ref.v1',
  );
  assert.deepEqual(
    EDUCATION_LEARNER_MEMORY_PROFILE.metadata_fields,
    EXPECTED_METADATA_FIELDS,
  );
  assert.equal(
    EDUCATION_LEARNER_MEMORY_PROFILE.object_id_pattern,
    '^memory_[a-f0-9]{64}$',
  );
  assert.equal(
    EDUCATION_LEARNER_MEMORY_PROFILE.invariants.automatic_tombstone_on_append_failure,
    false,
  );
  assert.equal(
    EDUCATION_LEARNER_MEMORY_PROFILE.invariants.caller_selects_memory_kind,
    false,
  );
  assert.equal(
    EDUCATION_LEARNER_MEMORY_PROFILE.invariants.content_address_required,
    true,
  );
  assert.equal(
    EDUCATION_LEARNER_MEMORY_PROFILE.invariants
      .memory_write_precedes_learner_event_for_new_content,
    true,
  );
  assert.equal(
    EDUCATION_LEARNER_MEMORY_PROFILE.invariants.raw_content_in_learner_event,
    false,
  );
});

test('learner-record provider contract matches pinned learner-memory profile', async () => {
  const provider = JSON.parse(await readFile(PROVIDER_CONTRACT_PATH, 'utf8'));
  assert.deepEqual(
    [...provider.memory_reference.allowed_kinds].sort(),
    EXPECTED_KINDS,
  );
  assert.equal(
    provider.memory_reference.object_id_pattern,
    EDUCATION_LEARNER_MEMORY_PROFILE.object_id_pattern,
  );
  assert.equal(provider.memory_reference.active_required, true);
  assert.equal(provider.memory_reference.exact_subject_owner_required, true);
  assert.equal(provider.memory_reference.content_address_integrity_required, true);
  assert.equal(provider.memory_reference.payload_decryption_required_for_assertion, false);
});
