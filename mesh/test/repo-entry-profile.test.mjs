import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url));

function runProfile(configText) {
  const tempRoot = mkdtempSync(join(tmpdir(), 'axiom-repo-entry-profile-'));
  const configPath = join(tempRoot, 'config');
  writeFileSync(configPath, configText, 'utf8');

  const result = spawnSync(process.execPath, ['repo-entry-profile.mjs', configPath], {
    cwd: repositoryRoot,
    encoding: 'utf8',
    env: process.env,
    windowsHide: true
  });

  return { tempRoot, result, profile: JSON.parse(result.stdout) };
}

test('repo entry profile reports recognized execution-capable git config without exposing values', () => {
  const { tempRoot, result, profile } = runProfile(`
[core]
  fsmonitor = /tmp/helper --arg secret
  hooksPath = .githooks
[filter "demo"]
  process = /tmp/filter-process --token=secret
[alias]
  inspect = !sh -c 'echo secret'
`);

  try {
    assert.equal(result.status, 2, result.stderr || result.stdout);
    assert.equal(profile.schema, 'axiom-repo-entry-profile.v0');
    assert.equal(profile.scope, 'explicit-git-config-static-scan');
    assert.equal(profile.production_certification, false);
    assert.equal(profile.absence_proves_safety, false);
    assert.equal(profile.network_access_required, false);
    assert.equal(profile.telemetry_sent, false);
    assert.equal(profile.authority_granted, false);
    assert.equal(profile.passed, false);
    assert.equal(profile.finding_count, 4);
    assert.equal(profile.files[0].input_index, 0);
    assert.equal(profile.files[0].file_name, 'config');
    assert.equal(result.stdout.includes(tempRoot), false);
    assert.deepEqual(profile.files[0].findings.map(({ key, risk_class, value }) => ({ key, risk_class, value })), [
      { key: 'core.fsmonitor', risk_class: 'automatic-helper', value: 'REDACTED' },
      { key: 'core.hookspath', risk_class: 'hook-redirection', value: 'REDACTED' },
      { key: 'filter.*.process', risk_class: 'content-filter-command', value: 'REDACTED' },
      { key: 'alias.inspect', risk_class: 'shell-alias', value: 'REDACTED' }
    ]);
    assert.doesNotMatch(result.stdout, /secret/u);
    assert.doesNotMatch(result.stdout, /\/tmp\/helper/u);
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});

test('repo entry profile passes only when explicit config is readable and no recognized surface is present', () => {
  const { tempRoot, result, profile } = runProfile(`
[core]
  repositoryformatversion = 0
  filemode = true
[remote "origin"]
  url = https://example.invalid/repo.git
`);

  try {
    assert.equal(result.status, 0, result.stderr || result.stdout);
    assert.equal(profile.finding_count, 0);
    assert.equal(profile.passed, true);
    assert.equal(profile.absence_proves_safety, false);
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});

test('repo entry profile fails closed when no input is supplied', () => {
  const result = spawnSync(process.execPath, ['repo-entry-profile.mjs'], {
    cwd: repositoryRoot,
    encoding: 'utf8',
    env: process.env,
    windowsHide: true
  });

  assert.equal(result.status, 1, result.stderr || result.stdout);
  const profile = JSON.parse(result.stdout);
  assert.equal(profile.error, 'NO_INPUT');
  assert.equal(profile.passed, false);
});
