import assert from 'node:assert/strict';
import test from 'node:test';

import {
  EDUCATION_CONTRACT_ID,
  EDUCATION_CONTRACT_SHA256,
  EDUCATION_CONTRACT_VERSION,
} from '../src/domain/education-contract.mjs';
import { executeSandboxBuiltin } from '../src/sandbox/education-executor.mjs';

const DIGEST = 'a'.repeat(64);

function educationIntent() {
  return {
    action: 'education.learner.event.append',
    principal: { id: 'human:learner-001' },
    input: {
      contract_id: EDUCATION_CONTRACT_ID,
      contract_version: EDUCATION_CONTRACT_VERSION,
      contract_sha256: EDUCATION_CONTRACT_SHA256,
      subject_id: 'human:learner-001',
      consent_id: 'consent:test',
      purpose: 'learning-progress-recording',
      event_id: 'workflow-event:test',
      event_type: 'submission.created',
      occurred_at: '2026-08-11T22:00:00-04:00',
      payload_digest: DIGEST,
      memory_object_id: `memory_${'b'.repeat(64)}`,
      course_code: 'MTH1W',
      expectation_ids: ['MTH1W-A1.1'],
      review_state: 'submitted',
    },
  };
}

test('education append uses the existing mutation-validator tool', () => {
  const result = executeSandboxBuiltin({
    tool: 'builtin.validate-mutation',
    intent: educationIntent(),
  });
  assert.equal(result.mutation.kind, 'education.learner.event.recorded');
  assert.equal(result.mutation.subject, 'human:learner-001');
  assert.equal(result.output.learner_record_status, 'recorded');
});

test('education append is not available through unrelated builtin tools', () => {
  assert.throws(
    () => executeSandboxBuiltin({ tool: 'builtin.echo', intent: educationIntent() }),
    /Capability tool does not match intent action/,
  );
});

test('non-education builtin behavior delegates unchanged', () => {
  const intent = {
    action: 'system.echo',
    principal: { id: 'human:test' },
    input: { value: 'unchanged' },
  };
  const result = executeSandboxBuiltin({ tool: 'builtin.echo', intent });
  assert.deepEqual(result, { output: { value: 'unchanged' } });
});
