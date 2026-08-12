import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import {
  EDUCATION_LEARNER_MEMORY_EVENT_TYPE_TO_KIND,
  EDUCATION_LEARNER_MEMORY_EVENT_TYPE_TO_OWNER,
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
const EXPECTED_OWNERS = Object.freeze({
  'appeal.filed': 'subject',
  'assignment.created': 'actor',
  'correction.recorded': 'actor',
  'feedback.recorded': 'actor',
  'revision.requested': 'actor',
  'submission.created': 'subject',
  'submission.resubmitted': 'subject',
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

test('learner-memory ownership profile bytes and runtime projection are exactly pinned', async () => {
  const raw = await readFile(EDUCATION_LEARNER_MEMORY_PROFILE_PATH);
  assert.equal(raw.length, 1246);
  assert.equal(
    createHash('sha256').update(raw).digest('hex'),
    '3763a28919d36721467160ef772e30da1d5a536a8733fd88b65f2c60c9107d78',
  );
  assert.equal(
    EDUCATION_LEARNER_MEMORY_PROFILE_SHA256,
    '3763a28919d36721467160ef772e30da1d5a536a8733fd88b65f2c60c9107d78',
  );
  assert.equal(EDUCATION_LEARNER_MEMORY_PROFILE.profile_version, '1.1.0');
  assert.deepEqual(EDUCATION_LEARNER_MEMORY_EVENT_TYPE_TO_KIND, EXPECTED_MAPPING);
  assert.deepEqual(EDUCATION_LEARNER_MEMORY_EVENT_TYPE_TO_OWNER, EXPECTED_OWNERS);
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
    EDUCATION_LEARNER_MEMORY_PROFILE.invariants.memory_owner_binding_required,
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

test('learner-record provider contract pins the ownership profile instead of subject-only ownership', async () => {
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
  assert.equal(provider.memory_reference.content_address_integrity_required, true);
  assert.equal(provider.memory_reference.payload_decryption_required_for_assertion, false);
  assert.deepEqual(provider.memory_reference.ownership_profile, {
    profile_id: 'axiom.education.learner-memory',
    profile_version: '1.1.0',
    profile_sha256: EDUCATION_LEARNER_MEMORY_PROFILE_SHA256,
  });
  assert.equal(provider.memory_reference.new_content_owner_binding_required, true);
  assert.deepEqual(provider.memory_reference.unmapped_event_owner_options, ['actor', 'subject']);
  assert.equal(Object.hasOwn(provider.memory_reference, 'exact_subject_owner_required'), false);
});
