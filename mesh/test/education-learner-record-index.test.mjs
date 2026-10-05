import test from 'node:test';
import assert from 'node:assert/strict';

import {
  EDUCATION_CONTRACT_ID,
  EDUCATION_CONTRACT_SHA256,
  EDUCATION_CONTRACT_VERSION,
} from '../src/domain/education-contract.mjs';
import {
  executeEducationLearnerRecordAction,
} from '../src/domain/education-learner-record-provider.mjs';
import {
  InMemoryEducationLearnerRecordIndex,
  createIndexedEducationLearnerRecordProvider,
} from '../src/domain/education-learner-record-index.mjs';

const DIGEST_A = 'a'.repeat(64);
const DIGEST_B = 'b'.repeat(64);
const DIGEST_C = 'c'.repeat(64);
const ACTOR = 'human:educator-index';

function contractFields() {
  return {
    contract_id: EDUCATION_CONTRACT_ID,
    contract_version: EDUCATION_CONTRACT_VERSION,
    contract_sha256: EDUCATION_CONTRACT_SHA256,
  };
}

function appendInput(overrides = {}) {
  return {
    ...contractFields(),
    subject_id: 'subject:learner-001',
    consent_id: 'consent:learning-progress-001',
    purpose: 'learning-progress-recording',
    event_id: 'event:001',
    event_type: 'assignment.created',
    occurred_at: '2026-08-11T18:30:00-04:00',
    payload_digest: DIGEST_A,
    memory_object_id: 'memory:001',
    course_code: 'MTH1W',
    expectation_ids: ['MTH1W-A1.1'],
    review_state: 'assigned',
    ...overrides,
  };
}

function readInput(overrides = {}) {
  return {
    ...contractFields(),
    subject_id: 'subject:learner-001',
    consent_id: 'consent:learning-progress-001',
    purpose: 'learning-progress-review',
    course_code: 'MTH1W',
    ...overrides,
  };
}

function providerFor(index) {
  return createIndexedEducationLearnerRecordProvider({
    provider_id: 'provider:index-conformance',
    provider_version: '0.1.0',
    index,
    assertConsent: async () => true,
    assertMemoryReference: async () => true,
  });
}

function appendWith(provider, input) {
  return executeEducationLearnerRecordAction(
    'education.learner.event.append',
    input,
    { provider, actor: ACTOR },
  );
}

test('exact append replay returns the same record digest without duplicating the index', async () => {
  const index = new InMemoryEducationLearnerRecordIndex();
  const provider = providerFor(index);
  const input = appendInput();

  const first = await appendWith(provider, input);
  const second = await appendWith(provider, input);

  assert.equal(index.size, 1);
  assert.equal(first.result.record_digest, second.result.record_digest);
  assert.deepEqual(first.result.evidence_refs, second.result.evidence_refs);
});

test('same subject/event_id with substituted payload is rejected as a conflict', async () => {
  const index = new InMemoryEducationLearnerRecordIndex();
  const provider = providerFor(index);
  await appendWith(provider, appendInput());

  await assert.rejects(
    () => appendWith(provider, appendInput({ payload_digest: DIGEST_B })),
    /event_id conflict/,
  );
  assert.equal(index.size, 1);
});

test('same event_id may exist for a different learner subject without collision', async () => {
  const index = new InMemoryEducationLearnerRecordIndex();
  const provider = providerFor(index);
  await appendWith(provider, appendInput());
  await appendWith(
    provider,
    appendInput({
      subject_id: 'subject:learner-002',
      consent_id: 'consent:learning-progress-002',
      payload_digest: DIGEST_B,
      memory_object_id: 'memory:002',
    }),
  );
  assert.equal(index.size, 2);
});

test('progress read is deterministically ordered by instant then event_id', async () => {
  const index = new InMemoryEducationLearnerRecordIndex();
  const provider = providerFor(index);
  const rows = [
    appendInput({
      event_id: 'event:c',
      payload_digest: DIGEST_C,
      memory_object_id: 'memory:c',
      occurred_at: '2026-08-11T18:40:00-04:00',
    }),
    appendInput({
      event_id: 'event:b',
      payload_digest: DIGEST_B,
      memory_object_id: 'memory:b',
      occurred_at: '2026-08-11T18:35:00-04:00',
    }),
    appendInput({
      event_id: 'event:a',
      payload_digest: DIGEST_A,
      memory_object_id: 'memory:a',
      occurred_at: '2026-08-11T22:35:00Z',
    }),
  ];
  for (const input of rows) await appendWith(provider, input);

  const result = await executeEducationLearnerRecordAction(
    'education.learner.progress.read',
    readInput(),
    { provider },
  );
  assert.deepEqual(
    result.result.events.map(event => event.event_id),
    ['event:a', 'event:b', 'event:c'],
  );
});

test('progress read filters by subject, course, expectations, and as_of', async () => {
  const index = new InMemoryEducationLearnerRecordIndex();
  const provider = providerFor(index);
  const rows = [
    appendInput({
      event_id: 'event:keep',
      memory_object_id: 'memory:keep',
      expectation_ids: ['MTH1W-A1.1'],
      occurred_at: '2026-08-11T18:30:00-04:00',
    }),
    appendInput({
      event_id: 'event:other-expectation',
      payload_digest: DIGEST_B,
      memory_object_id: 'memory:other-expectation',
      expectation_ids: ['MTH1W-B1.1'],
      occurred_at: '2026-08-11T18:31:00-04:00',
    }),
    appendInput({
      event_id: 'event:future',
      payload_digest: DIGEST_C,
      memory_object_id: 'memory:future',
      expectation_ids: ['MTH1W-A1.1'],
      occurred_at: '2026-08-11T19:00:00-04:00',
    }),
  ];
  for (const input of rows) await appendWith(provider, input);

  const result = await executeEducationLearnerRecordAction(
    'education.learner.progress.read',
    readInput({
      expectation_ids: ['MTH1W-A1.1'],
      as_of: '2026-08-11T18:45:00-04:00',
    }),
    { provider },
  );
  assert.deepEqual(
    result.result.events.map(event => event.event_id),
    ['event:keep'],
  );
});

test('read projection contains references only and never raw learner content', async () => {
  const index = new InMemoryEducationLearnerRecordIndex();
  const provider = providerFor(index);
  await appendWith(provider, appendInput());

  const result = await executeEducationLearnerRecordAction(
    'education.learner.progress.read',
    readInput(),
    { provider },
  );
  const serialized = JSON.stringify(result.result);
  for (const forbidden of [
    'raw_student_work',
    'raw_feedback',
    'mastery',
    'grade',
    'credit',
    'transcript',
  ]) {
    assert.equal(serialized.includes(forbidden), false);
  }
});

test('explicit timezone is required for stored event and as_of bounds', async () => {
  const index = new InMemoryEducationLearnerRecordIndex();
  const provider = providerFor(index);
  await assert.rejects(
    () => appendWith(provider, appendInput({ occurred_at: '2026-08-11T18:30:00' })),
    /explicit timezone/,
  );

  await appendWith(provider, appendInput());
  await assert.rejects(
    () =>
      executeEducationLearnerRecordAction(
        'education.learner.progress.read',
        readInput({ as_of: '2026-08-11T18:45:00' }),
        { provider },
      ),
    /explicit timezone/,
  );
});

test('reference index is not configured or promoted by construction', () => {
  const index = new InMemoryEducationLearnerRecordIndex();
  assert.equal(index.size, 0);
  const provider = providerFor(index);
  assert.equal(provider.provider_capability, 'education.learner-record');
  assert.equal(provider.provider_id, 'provider:index-conformance');
});
