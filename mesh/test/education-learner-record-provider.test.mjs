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
    ...contractFields(),
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
  const defaults = {
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
  };
  const provider = createEducationLearnerRecordProvider({
    ...defaults,
    ...overrides,
  });
  return { provider, calls };
}

test('provider contract is foundation-only and domains.education remains adapter_required', async () => {
  const providerContract = JSON.parse(await readFile(PROVIDER_CONTRACT_PATH, 'utf8'));
  const capabilities = JSON.parse(await readFile(CAPABILITIES_PATH, 'utf8'));
  const education = capabilities.capabilities.find(item => item.id === 'domains.education');

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
  assert.equal(Object.hasOwn(education, 'provider'), false);
});

test('missing provider preserves capability_unavailable', async () => {
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

test('append requires consent then memory assertion before mutation', async () => {
  const { provider, calls } = providerFixture();
  const input = appendInput();
  const result = await executeEducationLearnerRecordAction(
    'education.learner.event.append',
    input,
    { provider },
  );

  assert.equal(result.ok, true);
  assert.equal(result.result.status, 'recorded');
  assert.equal(result.result.subject_id, input.subject_id);
  assert.equal(result.result.event_id, input.event_id);
  assert.equal(result.result.payload_digest, input.payload_digest);
  assert.equal(result.result.memory_object_id, input.memory_object_id);
  assert.equal(result.result.record_digest, DIGEST_B);
  assert.match(result.result_digest, /^[a-f0-9]{64}$/);
  assert.deepEqual(
    calls.map(([kind]) => kind),
    ['consent', 'memory', 'append'],
  );
});

test('failed consent blocks memory assertion and mutation', async () => {
  const calls = [];
  const { provider } = providerFixture({
    assertConsent: async request => {
      calls.push(['consent', request]);
      return false;
    },
    assertMemoryReference: async request => {
      calls.push(['memory', request]);
      return true;
    },
    appendEvent: async input => {
      calls.push(['append', input]);
      return {};
    },
  });

  await assert.rejects(
    () => executeEducationLearnerRecordAction(
      'education.learner.event.append',
      appendInput(),
      { provider },
    ),
    /consent assertion failed/,
  );
  assert.deepEqual(calls.map(([kind]) => kind), ['consent']);
});

test('failed memory-reference assertion blocks mutation', async () => {
  const calls = [];
  const { provider } = providerFixture({
    assertConsent: async request => {
      calls.push(['consent', request]);
      return true;
    },
    assertMemoryReference: async request => {
      calls.push(['memory', request]);
      return false;
    },
    appendEvent: async input => {
      calls.push(['append', input]);
      return {};
    },
  });

  await assert.rejects(
    () => executeEducationLearnerRecordAction(
      'education.learner.event.append',
      appendInput(),
      { provider },
    ),
    /memory reference assertion failed/,
  );
  assert.deepEqual(calls.map(([kind]) => kind), ['consent', 'memory']);
});

test('append result cannot substitute request bindings', async () => {
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
      () => executeEducationLearnerRecordAction(
        'education.learner.event.append',
        appendInput(),
        { provider },
      ),
      new RegExp(message),
    );
  }
});

test('provider results reject raw work and authority-bearing learner state', async () => {
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
      () => executeEducationLearnerRecordAction(
        'education.learner.event.append',
        appendInput(),
        { provider },
      ),
      /unsupported field|forbidden learner-record field/,
    );
  }
});

test('progress read requires consent and returns bounded references only', async () => {
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
  assert.deepEqual(
    calls.map(([kind]) => kind),
    ['consent', 'read'],
  );
  assert.deepEqual(Object.keys(result.result.events[0]).sort(), [
    'event_id',
    'event_type',
    'expectation_ids',
    'memory_object_id',
    'occurred_at',
    'payload_digest',
    'review_state',
  ]);
});

test('provider boundary rejects non learner-record actions after contract validation', async () => {
  const { provider } = providerFixture();
  await assert.rejects(
    () => executeEducationLearnerRecordAction(
      'education.curriculum.query',
      {
        ...contractFields(),
        active_pack_manifest_sha256: DIGEST_A,
        course_code: 'MTH1W',
        expectation_ids: ['MTH1W-A1.1'],
      },
      { provider },
    ),
    /does not handle action/,
  );
});

test('provider construction requires all authority and adapter methods', () => {
  assert.throws(
    () => createEducationLearnerRecordProvider({
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
