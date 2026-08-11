import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import {
  EDUCATION_CONTRACT_ID,
  EDUCATION_CONTRACT_SHA256,
  EDUCATION_CONTRACT_VERSION,
} from '../src/domain/education-contract.mjs';
import {
  createEducationLearnerRecordProvider,
  executeEducationLearnerRecordAction,
} from '../src/domain/education-learner-record-provider.mjs';

const PROVIDER_CONTRACT_PATH = fileURLToPath(
  new URL('../config/domain-providers/education-learner-record.v1.json', import.meta.url),
);
const CAPABILITIES_PATH = fileURLToPath(
  new URL('../config/capabilities.json', import.meta.url),
);

const DIGEST_A = 'a'.repeat(64);
const DIGEST_B = 'b'.repeat(64);
const DIGEST_C = 'c'.repeat(64);

function appendInput(overrides = {}) {
  return {
    contract_id: EDUCATION_CONTRACT_ID,
    contract_version: EDUCATION_CONTRACT_VERSION,
    contract_sha256: EDUCATION_CONTRACT_SHA256,
    subject_id: 'subject:learner-001',
    consent_id: 'consent:learning-progress-001',
    purpose: 'learning-progress-recording',
    event_id: 'event:assignment-001',
    event_type: 'assignment.created',
    occurred_at: '2026-08-11T18:30:00-04:00',
    payload_digest: DIGEST_A,
    memory_object_id: 'memory:assignment-001',
    course_code: 'MTH1W',
    expectation_ids: ['MTH1W-A1.1'],
    review_state: 'assigned',
    ...overrides,
  };
}

function readInput(overrides = {}) {
  return {
    contract_id: EDUCATION_CONTRACT_ID,
    contract_version: EDUCATION_CONTRACT_VERSION,
    contract_sha256: EDUCATION_CONTRACT_SHA256,
    subject_id: 'subject:learner-001',
    consent_id: 'consent:learning-progress-001',
    purpose: 'learning-progress-review',
    course_code: 'MTH1W',
    expectation_ids: ['MTH1W-A1.1'],
    as_of: '2026-08-11T18:45:00-04:00',
    ...overrides,
  };
}

function providerFixture(overrides = {}) {
  const calls = [];
  const provider = createEducationLearnerRecordProvider({
    provider_id: 'provider:test-learner-record',
    provider_version: '0.1.0',
    assertConsent: async request => {
      calls.push(['consent', request]);
      return true;
    },
    assertMemoryReference: async request => {
      calls.push(['memory', request]);
      return true;
    },
    appendEvent: async input => {
      calls.push(['append', input]);
      return {
        status: 'recorded',
        subject_id: input.subject_id,
        event_id: input.event_id,
        payload_digest: input.payload_digest,
        memory_object_id: input.memory_object_id,
        record_digest: DIGEST_B,
        evidence_refs: ['evidence:append-001'],
      };
    },
    readProgress: async input => {
      calls.push(['read', input]);
      return {
        status: 'available',
        subject_id: input.subject_id,
        course_code: input.course_code,
        as_of: input.as_of,
        events: [
          {
            event_id: 'event:assignment-001',
            event_type: 'assignment.created',
            occurred_at: '2026-08-11T18:30:00-04:00',
            payload_digest: DIGEST_A,
            memory_object_id: 'memory:assignment-001',
            expectation_ids: ['MTH1W-A1.1'],
            review_state: 'assigned',
          },
        ],
        evidence_refs: ['evidence:read-001'],
      };
    },
    ...overrides,
  });
  return { provider, calls };
}

test('provider contract remains adapter foundation and domains.education stays adapter_required', async () => {
  const providerContract = JSON.parse(await readFile(PROVIDER_CONTRACT_PATH, 'utf8'));
  const capabilities = JSON.parse(await readFile(CAPABILITIES_PATH, 'utf8'));
  const education = capabilities.capabilities.find(item => item.name === 'domains.education');

  assert.equal(providerContract.schema, 'axiom-domain-provider-contract.v1');
  assert.equal(providerContract.provider_contract_id, 'axiom.education.learner-record');
  assert.equal(providerContract.provider_capability, 'education.learner-record');
  assert.equal(providerContract.status, 'adapter-foundation-only');
  assert.equal(providerContract.invariants.install_grants_authority, false);
  assert.equal(providerContract.invariants.provider_owns_consent, false);
  assert.equal(providerContract.invariants.provider_owns_identity, false);
  assert.equal(providerContract.invariants.provider_may_infer_mastery, false);
  assert.equal(providerContract.invariants.provider_may_issue_grade_or_credit, false);
  assert.equal(providerContract.invariants.provider_may_modify_transcript, false);

  assert.ok(education);
  assert.equal(education.status, 'adapter_required');
  assert.equal(education.provider, null);
});

test('missing provider preserves the existing capability_unavailable behavior', async () => {
  const result = await executeEducationLearnerRecordAction(
    'education.learner.event.append',
    appendInput(),
  );
  assert.deepEqual(result, {
    ok: false,
    http_status: 503,
    error: {
      code: 'capability_unavailable',
      message: 'Education capability education.learner-record has no configured adapter',
      details: {
        action: 'education.learner.event.append',
        provider_capability: 'education.learner-record',
        capability_status: 'adapter_required',
      },
    },
  });
});

test('append requires consent and memory-reference assertions before provider mutation', async () => {
  const { provider, calls } = providerFixture();
  const input = appendInput();
  const result = await executeEducationLearnerRecordAction(
    'education.learner.event.append',
    input,
    { provider },
  );

  assert.equal(result.ok, true);
  assert.equal(result.provider_capability, 'education.learner-record');
  assert.equal(result.result.status, 'recorded');
  assert.equal(result.result.subject_id, input.subject_id);
  assert.equal(result.result.event_id, input.event_id);
  assert.equal(result.result.payload_digest, input.payload_digest);
  assert.equal(result.result.memory_object_id, input.memory_object_id);
  assert.equal(result.result.record_digest, DIGEST_B);
  assert.match(result.result_digest, /^[a-f0-9]{64}$/);

  assert.equal(calls.length, 3);
  assert.equal(calls[0][0], 'consent');
  assert.deepEqual(calls[0][1], {
    subject_id: input.subject_id,
    consent_id: input.consent_id,
    purpose: 'learning-progress-recording',
    data_scope: 'learning-progress:write',
  });
  assert.equal(calls[1][0], 'memory');
  assert.deepEqual(calls[1][1], {
    subject_id: input.subject_id,
    consent_id: input.consent_id,
    purpose: input.purpose,
    memory_object_id: input.memory_object_id,
    payload_digest: input.payload_digest,
  });
  assert.equal(calls[2][0], 'append');
});

test('failed consent assertion blocks append before memory or storage adapter calls', async () => {
  const { provider, calls } = providerFixture({
    assertConsent: async request => {
      calls.push(['consent', request]);
      return false;
    },
  });
  await assert.rejects(
    () =>
      executeEducationLearnerRecordAction('education.learner.event.append', appendInput(), {
        provider,
      }),
    /consent assertion failed/,
  );
  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], 'consent');
});

test('failed memory-reference assertion blocks append before storage mutation', async () => {
  const { provider, calls } = providerFixture({
    assertMemoryReference: async request => {
      calls.push(['memory', request]);
      return false;
    },
  });
  await assert.rejects(
    () =>
      executeEducationLearnerRecordAction('education.learner.event.append', appendInput(), {
        provider,
      }),
    /memory reference assertion failed/,
  );
  assert.deepEqual(
    calls.map(([kind]) => kind),
    ['consent', 'memory'],
  );
});

test('append result cannot substitute subject, event, payload, or memory binding', async () => {
  for (const [field, value, message] of [
    ['subject_id', 'subject:other', 'subject_id mismatch'],
    ['event_id', 'event:other', 'event_id mismatch'],
    ['payload_digest', DIGEST_C, 'payload_digest mismatch'],
    ['memory_object_id', 'memory:other', 'memory_object_id mismatch'],
  ]) {
    const { provider } = providerFixture({
      appendEvent: async input => ({
        status: 'recorded',
        subject_id: input.subject_id,
        event_id: input.event_id,
        payload_digest: input.payload_digest,
        memory_object_id: input.memory_object_id,
        record_digest: DIGEST_B,
        [field]: value,
      }),
    });
    await assert.rejects(
      () =>
        executeEducationLearnerRecordAction('education.learner.event.append', appendInput(), {
          provider,
        }),
      new RegExp(message),
    );
  }
});

test('provider cannot return raw work, raw feedback, mastery, grade, credit, or transcript fields', async () => {
  for (const forbidden of [
    'raw_student_work',
    'raw_feedback',
    'mastery',
    'grade',
    'credit',
    'transcript',
  ]) {
    const { provider } = providerFixture({
      appendEvent: async input => ({
        status: 'recorded',
        subject_id: input.subject_id,
        event_id: input.event_id,
        payload_digest: input.payload_digest,
        memory_object_id: input.memory_object_id,
        record_digest: DIGEST_B,
        [forbidden]: 'not allowed',
      }),
    });
    await assert.rejects(
      () =>
        executeEducationLearnerRecordAction('education.learner.event.append', appendInput(), {
          provider,
        }),
      /unsupported field|forbidden learner-record field/,
    );
  }
});

test('progress read requires consent assertion and returns bounded event references only', async () => {
  const { provider, calls } = providerFixture();
  const input = readInput();
  const result = await executeEducationLearnerRecordAction(
    'education.learner.progress.read',
    input,
    { provider },
  );

  assert.equal(result.ok, true);
  assert.equal(result.result.status, 'available');
  assert.equal(result.result.subject_id, input.subject_id);
  assert.equal(result.result.course_code, input.course_code);
  assert.equal(result.result.events.length, 1);
  assert.deepEqual(Object.keys(result.result.events[0]).sort(), [
    'event_id',
    'event_type',
    'expectation_ids',
    'memory_object_id',
    'occurred_at',
    'payload_digest',
    'review_state',
  ]);
  assert.deepEqual(
    calls.map(([kind]) => kind),
    ['consent', 'read'],
  );
  assert.deepEqual(calls[0][1], {
    subject_id: input.subject_id,
    consent_id: input.consent_id,
    purpose: 'learning-progress-review',
    data_scope: 'learning-progress:read',
  });
});

test('progress result cannot claim mastery, grades, credits, or transcript state', async () => {
  const { provider } = providerFixture({
    readProgress: async input => ({
      status: 'available',
      subject_id: input.subject_id,
      course_code: input.course_code,
      events: [],
      mastery: true,
    }),
  });
  await assert.rejects(
    () =>
      executeEducationLearnerRecordAction('education.learner.progress.read', readInput(), {
        provider,
      }),
    /unsupported field|forbidden learner-record field/,
  );
});

test('provider boundary refuses non learner-record education actions', async () => {
  const { provider } = providerFixture();
  await assert.rejects(
    () =>
      executeEducationLearnerRecordAction(
        'education.curriculum.query',
        {
          contract_id: EDUCATION_CONTRACT_ID,
          contract_version: EDUCATION_CONTRACT_VERSION,
          contract_sha256: EDUCATION_CONTRACT_SHA256,
          jurisdiction: 'ca:on',
          course_code: 'MTH1W',
          expectation_ids: ['MTH1W-A1.1'],
        },
        { provider },
      ),
    /does not handle action/,
  );
});

test('provider construction requires all kernel authority and adapter methods', () => {
  assert.throws(
    () =>
      createEducationLearnerRecordProvider({
        provider_id: 'provider:incomplete',
        provider_version: '0.1.0',
        assertConsent: async () => true,
        assertMemoryReference: async () => true,
        appendEvent: async () => ({}),
        readProgress: null,
      }),
    /requires readProgress\(\)/,
  );
});
