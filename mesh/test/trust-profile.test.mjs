import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url));

test('trust profile emits bounded machine-readable evidence', () => {
  const result = spawnSync(process.execPath, ['trust-profile.mjs'], {
    cwd: repositoryRoot,
    encoding: 'utf8',
    env: process.env,
    windowsHide: true
  });

  assert.equal(result.status, 0, result.stderr || result.stdout);

  const profile = JSON.parse(result.stdout);

  assert.equal(profile.schema, 'axiom-trust-profile.v0');
  assert.match(profile.source_ref, /^[0-9a-f]{40}$/u);
  assert.equal(profile.scope, 'source-level-offline');
  assert.equal(profile.production_certification, false);
  assert.equal(profile.authority_granted, false);
  assert.equal(profile.telemetry_sent, false);
  assert.equal(profile.passed, true);
  assert.deepEqual(
    profile.checks.map(({ id, status, test: testPath }) => ({ id, status, test: testPath })),
    [
      {
        id: 'metadata-authority-boundary',
        status: 'pass',
        test: 'mesh/test/agent-commons-mcp-readonly.test.mjs'
      },
      {
        id: 'revocation-outcome-boundary',
        status: 'pass',
        test: 'mesh/test/runtime-adapter-revocation-queue.test.mjs'
      }
    ]
  );
});
