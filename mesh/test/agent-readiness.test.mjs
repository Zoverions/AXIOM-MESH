import assert from 'node:assert/strict';
import test from 'node:test';
import { verifyAgentReadiness } from '../src/check-agent-readiness.mjs';

test('agent-readiness surface is fail-closed, digest-bound, and prepared-not-published', async () => {
  const result = await verifyAgentReadiness();
  assert.equal(result.valid, true);
  assert.equal(result.deployment_status, 'prepared_not_published');
  assert.ok(result.target_agent_readability_score >= 90);
  assert.equal(result.target_llms_score, 100);
  assert.match(result.skill_digest, /^sha256:[a-f0-9]{64}$/);
  assert.equal(result.generated_files, 14);
});
