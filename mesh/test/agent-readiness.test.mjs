import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { parse, resolve } from 'node:path';
import test from 'node:test';
import { resolveAgentReadinessOutputRoot } from '../../agent-readiness/build.mjs';
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

test('agent-readiness output path rejects destructive targets before cleanup', () => {
  const repositoryRoot = resolve(tmpdir(), 'axiom-agent-readiness-repository');
  assert.equal(
    resolveAgentReadinessOutputRoot(repositoryRoot, '.data/site'),
    resolve(repositoryRoot, '.data/site')
  );
  assert.throws(
    () => resolveAgentReadinessOutputRoot(repositoryRoot, '..'),
    /must remain inside the repository root/
  );
  assert.throws(
    () => resolveAgentReadinessOutputRoot(repositoryRoot, '.'),
    /must not be the repository root/
  );
  assert.throws(
    () => resolveAgentReadinessOutputRoot(repositoryRoot, parse(repositoryRoot).root),
    /must not be a filesystem root/
  );
});
