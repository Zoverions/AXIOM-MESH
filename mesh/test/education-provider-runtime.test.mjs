import test from 'node:test';
import assert from 'node:assert/strict';

import {
  EDUCATION_CONTRACT_ID,
  EDUCATION_CONTRACT_SHA256,
  EDUCATION_CONTRACT_VERSION,
} from '../src/domain/education-contract.mjs';
import {
  createEducationLearnerRecordProvider,
} from '../src/domain/education-learner-record-provider.mjs';
import {
  describeEducationProviderRuntime,
  executeEducationAction,
} from '../src/domain/education-provider-runtime.mjs';

const DIGEST_A = 'a'.repeat(64);
const DIGEST_B = 'b'.repeat(64);

function contractFields() {
  return {
    contract_id: EDUCATION_CONTRACT_ID,
    contract_version: EDUCATION_CONTRACT_VERSION,
    contract_sha256: EDUCATION_CONTRACT_SHA256,
  };
}

function appendInput() {
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
  };
}

function readInput() {
  return {
    ...contractFields(),
    subject_id: 'subject:learner-001',
    consent_id: 'consent:learning-progress-001',
    purpose: 'learning-progress-review',
    course_code: 'MTH1W',
    expectation_ids: ['MTH1W-A1.1'],
  };
}

function learnerRecordProvider() {
  return createEducationLearnerRecordProvider({
    provider_id: 'provider:test-runtime',
    provider_version: '0.1.0',
    assertConsent: async () => true,
    assertMemoryReference: async () => true,
    appendEvent: async input => ({
      status: 'recorded',
      subject_id: input.subject_id,
      event_id: input.event_id,
      payload_digest: input.payload_digest,
      memory_object_id: input.memory_object_id,
      record_digest: DIGEST_B,
    }),
    readProgress: async input => ({
      status: 'available',
      subject_id: input.subject_id,
      course_code: input.course_code,
      events: [],
    }),
  });
}

test('runtime without provider preserves learner-record capability_unavailable', async () => {
  const result = await executeEducationAction('education.learner.event.append', appendInput());
  assert.equal(result.ok, false);
  assert.equal(result.http_status, 503);
  assert.equal(result.error.code, 'capability_unavailable');
  assert.equal(result.error.details.provider_capability, 'education.learner-record');
});

test('runtime injects learner-record provider only for learner-record actions', async () => {
  const provider = learnerRecordProvider();
  const append = await executeEducationAction('education.learner.event.append', appendInput(), {
    learnerRecordProvider: provider,
  });
  const read = await executeEducationAction('education.learner.progress.read', readInput(), {
    learnerRecordProvider: provider,
  });

  assert.equal(append.ok, true);
  assert.equal(append.result.status, 'recorded');
  assert.equal(read.ok, true);
  assert.equal(read.result.status, 'available');
});

test('learner-record provider does not enable curriculum capability', async () => {
  const result = await executeEducationAction(
    'education.curriculum.query',
    {
      ...contractFields(),
      active_pack_manifest_sha256: DIGEST_A,
      course_code: 'MTH1W',
      expectation_ids: ['MTH1W-A1.1'],
    },
    { learnerRecordProvider: learnerRecordProvider() },
  );

  assert.equal(result.ok, false);
  assert.equal(result.http_status, 503);
  assert.equal(result.error.code, 'capability_unavailable');
  assert.equal(result.error.details.provider_capability, 'education.curriculum');
});

test('runtime readiness description remains adapter_required even with one injected provider', () => {
  const unbound = describeEducationProviderRuntime();
  assert.equal(unbound.domain_status, 'adapter_required');
  assert.deepEqual(unbound.configured_provider_capabilities, []);
  assert.ok(unbound.unconfigured_provider_capabilities.includes('education.learner-record'));

  const bound = describeEducationProviderRuntime({ learnerRecordProvider: learnerRecordProvider() });
  assert.equal(bound.domain_status, 'adapter_required');
  assert.deepEqual(bound.configured_provider_capabilities, ['education.learner-record']);
  assert.deepEqual(bound.unconfigured_provider_capabilities, [
    'education.curriculum',
    'education.tutor',
  ]);
  assert.match(bound.claim_boundary, /does not promote domains\.education/);
});

test('runtime readiness description rejects wrong provider capability', () => {
  assert.throws(
    () =>
      describeEducationProviderRuntime({
        learnerRecordProvider: { provider_capability: 'education.curriculum' },
      }),
    /provider capability mismatch/,
  );
});
