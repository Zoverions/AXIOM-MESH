import assert from 'node:assert/strict';
import { test } from 'node:test';
import { checkAgentCommons } from '../src/check-agent-commons.mjs';

test('Agent Commons challenge, feedback, and result boundaries remain fail closed', async () => {
  const result = await checkAgentCommons();

  assert.equal(result.ok, true);
  assert.equal(result.challenge_schema, 'axiom-agent-challenge.v1');
  assert.equal(result.feedback_schema, 'axiom-agent-feedback.v1');
  assert.equal(result.canonical_result_schema, 'axiom-agent-contribution-result.v1');
  assert.equal(result.public_issue_forms, 3);
  assert.equal(result.duplicate_result_schema_absent, true);
});
