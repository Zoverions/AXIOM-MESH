import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import { buildProbe, classifyMemory } from '../../community-testnet-probe.mjs';

const GIB = 1024 ** 3;
const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url));
const probePath = join(repositoryRoot, 'community-testnet-probe.mjs');

function runGit(cwd, args) {
  const result = spawnSync('git', args, {
    cwd,
    encoding: 'utf8',
    windowsHide: true
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return result;
}

function runProbe(cwd) {
  return spawnSync(process.execPath, [probePath], {
    cwd,
    encoding: 'utf8',
    env: process.env,
    windowsHide: true
  });
}

test('classifyMemory reports broad non-identifying resource buckets', () => {
  assert.equal(classifyMemory(2 * GIB), '<4GiB');
  assert.equal(classifyMemory(4 * GIB), '4-8GiB');
  assert.equal(classifyMemory(8 * GIB), '8-16GiB');
  assert.equal(classifyMemory(16 * GIB), '16-32GiB');
  assert.equal(classifyMemory(32 * GIB), '32-64GiB');
  assert.equal(classifyMemory(64 * GIB), '>=64GiB');
  assert.equal(classifyMemory(Number.NaN), 'unknown');
});

test('buildProbe binds exact source and exposes only bounded environment preflight data', () => {
  const probe = buildProbe({
    sourceRef: 'a'.repeat(40),
    workingTreeClean: true,
    platformName: 'linux',
    architecture: 'arm64',
    nodeVersion: 'v24.18.0',
    totalMemoryBytes: 8 * GIB
  });

  assert.equal(probe.schema, 'axiom-community-testnet-probe.v0');
  assert.equal(probe.campaign_reference, 'ua-2026-09-22-community-testnet-probe');
  assert.equal(probe.source_ref, 'a'.repeat(40));
  assert.equal(probe.working_tree_clean, true);
  assert.equal(probe.scope, 'community-testnet-environment-preflight-only');
  assert.deepEqual(probe.environment, {
    platform: 'linux',
    architecture: 'arm64',
    node_version: 'v24.18.0',
    memory_class: '8-16GiB'
  });
  assert.deepEqual(probe.suggested_lanes, ['T4', 'T5']);
  assert.deepEqual(probe.required_result_fields, [
    'participation_role',
    'testnet_lane',
    'environment_custody',
    'exact_method',
    'observed_disposition',
    'observations',
    'independence_status',
    'limitations'
  ]);
  assert.equal(probe.network_accessed, false);
  assert.equal(probe.telemetry_sent, false);
  assert.equal(probe.authority_granted, false);
  assert.equal(probe.production_certification, false);
  assert.equal(probe.environment_preflight_ready, true);
  assert.equal(probe.submission_ready, false);

  const serialized = JSON.stringify(probe);
  for (const forbidden of [
    'hostname',
    'username',
    'homedir',
    'ip_address',
    'mac_address',
    'environment_variables',
    'credential',
    'serial_number'
  ]) {
    assert.equal(serialized.includes(forbidden), false, `probe must omit ${forbidden}`);
  }
});

test('buildProbe fails closed for dirty or unverifiable source state', () => {
  const dirty = buildProbe({
    sourceRef: 'b'.repeat(40),
    workingTreeClean: false,
    platformName: 'win32',
    architecture: 'x64',
    nodeVersion: 'v24.18.0',
    totalMemoryBytes: 16 * GIB
  });
  assert.equal(dirty.environment_preflight_ready, false);
  assert.equal(dirty.submission_ready, false);

  const unknown = buildProbe({
    sourceRef: 'main',
    workingTreeClean: null,
    platformName: 'darwin',
    architecture: 'arm64',
    nodeVersion: 'v24.18.0',
    totalMemoryBytes: 16 * GIB
  });
  assert.equal(unknown.source_ref, null);
  assert.equal(unknown.working_tree_clean, null);
  assert.equal(unknown.environment_preflight_ready, false);
  assert.equal(unknown.submission_ready, false);
});

test('CLI reports a clean exact-revision environment as preflight-ready but not submission-ready', () => {
  const tempRoot = mkdtempSync(join(tmpdir(), 'axiom-testnet-probe-clean-'));

  try {
    runGit(tempRoot, ['init', '--quiet']);
    runGit(tempRoot, ['config', 'user.email', 'axiom-test@example.invalid']);
    runGit(tempRoot, ['config', 'user.name', 'AXIOM test']);
    runGit(tempRoot, ['config', 'commit.gpgsign', 'false']);
    writeFileSync(join(tempRoot, 'tracked.txt'), 'clean\n', 'utf8');
    runGit(tempRoot, ['add', 'tracked.txt']);
    runGit(tempRoot, ['commit', '--quiet', '-m', 'initial']);

    const result = runProbe(tempRoot);
    assert.equal(result.status, 0, result.stderr || result.stdout);

    const probe = JSON.parse(result.stdout);
    assert.match(probe.source_ref, /^[0-9a-f]{40}$/u);
    assert.equal(probe.working_tree_clean, true);
    assert.equal(probe.environment_preflight_ready, true);
    assert.equal(probe.submission_ready, false);
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});

test('CLI rejects a dirty repository as environment-preflight ready', () => {
  const tempRoot = mkdtempSync(join(tmpdir(), 'axiom-testnet-probe-dirty-'));

  try {
    runGit(tempRoot, ['init', '--quiet']);
    runGit(tempRoot, ['config', 'user.email', 'axiom-test@example.invalid']);
    runGit(tempRoot, ['config', 'user.name', 'AXIOM test']);
    runGit(tempRoot, ['config', 'commit.gpgsign', 'false']);
    writeFileSync(join(tempRoot, 'tracked.txt'), 'clean\n', 'utf8');
    runGit(tempRoot, ['add', 'tracked.txt']);
    runGit(tempRoot, ['commit', '--quiet', '-m', 'initial']);
    writeFileSync(join(tempRoot, 'untracked.txt'), 'dirty\n', 'utf8');

    const result = runProbe(tempRoot);
    assert.equal(result.status, 1, result.stderr || result.stdout);

    const probe = JSON.parse(result.stdout);
    assert.match(probe.source_ref, /^[0-9a-f]{40}$/u);
    assert.equal(probe.working_tree_clean, false);
    assert.equal(probe.environment_preflight_ready, false);
    assert.equal(probe.submission_ready, false);
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});
