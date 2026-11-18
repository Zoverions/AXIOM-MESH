import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url));
const trustProfilePath = join(repositoryRoot, 'trust-profile.mjs');

function runGit(cwd, args) {
  const result = spawnSync('git', args, {
    cwd,
    encoding: 'utf8',
    windowsHide: true
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return result;
}

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
  assert.equal(profile.working_tree_clean, true);
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

test('dirty worktree cannot produce a passing exact-commit trust profile', () => {
  const tempRoot = mkdtempSync(join(tmpdir(), 'axiom-trust-profile-'));

  try {
    runGit(tempRoot, ['init', '--quiet']);
    runGit(tempRoot, ['config', 'user.email', 'axiom-test@example.invalid']);
    runGit(tempRoot, ['config', 'user.name', 'AXIOM test']);
    writeFileSync(join(tempRoot, 'tracked.txt'), 'clean\n', 'utf8');
    runGit(tempRoot, ['add', 'tracked.txt']);
    runGit(tempRoot, ['commit', '--quiet', '-m', 'initial']);
    writeFileSync(join(tempRoot, 'untracked.txt'), 'dirty\n', 'utf8');

    const result = spawnSync(process.execPath, [trustProfilePath], {
      cwd: tempRoot,
      encoding: 'utf8',
      env: process.env,
      windowsHide: true
    });

    assert.equal(result.status, 1, result.stderr || result.stdout);
    const profile = JSON.parse(result.stdout);
    assert.match(profile.source_ref, /^[0-9a-f]{40}$/u);
    assert.equal(profile.working_tree_clean, false);
    assert.equal(profile.passed, false);
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});
