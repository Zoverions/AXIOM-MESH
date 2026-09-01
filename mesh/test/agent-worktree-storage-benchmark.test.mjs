import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import {
  access,
  mkdir,
  mkdtemp,
  rm,
  writeFile
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import test from 'node:test';

import {
  assertLaboratoryPathSafety,
  LAB_ACKNOWLEDGEMENT,
  normalizeStorageBenchmarkOptions,
  runAgentWorktreeStorageBenchmark,
  STORAGE_BENCHMARK_SCHEMA,
  verifyAgentWorktreeStorageBenchmarkEvidence
} from '../src/agent-worktree-storage-benchmark.mjs';

const execFileAsync = promisify(execFile);

function baseOptions(root = join(tmpdir(), 'axiom-storage-benchmark-options')) {
  return {
    sourceRepo: join(root, 'source'),
    workspace: join(root, 'workspace'),
    revision: 'a'.repeat(40),
    profileId: 'xfs-linked-worktree-lab',
    workers: 4,
    parallelism: 2,
    acknowledgement: LAB_ACKNOWLEDGEMENT,
    generatedAt: '2026-08-12T22:00:00.000Z'
  };
}

test('storage benchmark normalization is explicit and fail-closed', () => {
  const normalized = normalizeStorageBenchmarkOptions(baseOptions());
  assert.equal(normalized.workers, 4);
  assert.equal(normalized.parallelism, 2);
  assert.equal(normalized.profileId, 'xfs-linked-worktree-lab');
  assert.equal(normalized.retainWorkspace, false);

  assert.throws(
    () => normalizeStorageBenchmarkOptions({
      ...baseOptions(),
      acknowledgement: undefined
    }),
    /requires acknowledgement/
  );
  assert.throws(
    () => normalizeStorageBenchmarkOptions({
      ...baseOptions(),
      revision: 'abc123'
    }),
    /exact 40-character commit SHA/
  );
  assert.throws(
    () => normalizeStorageBenchmarkOptions({
      ...baseOptions(),
      parallelism: 5
    }),
    /parallelism cannot exceed workers/
  );
  assert.throws(
    () => normalizeStorageBenchmarkOptions({
      ...baseOptions(),
      workload: {
        program: process.platform === 'win32' ? 'npm.cmd' : 'npm',
        args: ['ci']
      }
    }),
    /must include --ignore-scripts/
  );
});

test('storage benchmark rejects source and protected-data path overlap', () => {
  const root = join(tmpdir(), 'axiom-storage-benchmark-path-safety');
  const source = join(root, 'source');
  const data = join(root, 'data');

  assert.equal(assertLaboratoryPathSafety({
    sourceRepo: source,
    workspace: join(root, 'workspace'),
    dataDir: data
  }), true);

  assert.throws(
    () => assertLaboratoryPathSafety({
      sourceRepo: source,
      workspace: join(source, 'nested-workspace'),
      dataDir: data
    }),
    /sourceRepo and workspace must not overlap/
  );

  assert.throws(
    () => assertLaboratoryPathSafety({
      sourceRepo: source,
      workspace: join(data, 'nested-workspace'),
      dataDir: data
    }),
    /must not overlap AXIOM_DATA_DIR/
  );
});

test('storage benchmark materializes exact disposable worktrees and emits non-promotion evidence', async () => {
  const root = await mkdtemp(join(tmpdir(), 'axiom-storage-benchmark-'));
  const source = join(root, 'source');
  const workspace = join(root, 'workspace');
  await mkdir(source, { recursive: true });

  try {
    await git(['init', source]);
    await git(['-C', source, 'config', 'user.name', 'AXIOM Storage Test']);
    await git(['-C', source, 'config', 'user.email', 'storage-test@axiom.invalid']);
    await writeFile(join(source, 'alpha.txt'), 'alpha\n', 'utf8');
    await writeFile(join(source, 'beta.txt'), 'beta\n', 'utf8');
    await git(['-C', source, 'add', 'alpha.txt', 'beta.txt']);
    await git(['-C', source, 'commit', '-m', 'storage fixture']);

    const revision = (await git(['-C', source, 'rev-parse', 'HEAD'])).trim();
    const tree = (await git(['-C', source, 'rev-parse', 'HEAD^{tree}'])).trim();
    const originalWorktreesBefore = await git([
      '-C',
      source,
      'worktree',
      'list',
      '--porcelain'
    ]);

    const evidence = await runAgentWorktreeStorageBenchmark({
      sourceRepo: source,
      workspace,
      revision,
      profileId: 'ci-linked-worktree-lab',
      workers: 3,
      parallelism: 1,
      mutationBytesPerWorker: 4096,
      acknowledgement: LAB_ACKNOWLEDGEMENT,
      generatedAt: '2026-08-12T22:00:00.000Z'
    });

    assert.equal(evidence.schema, STORAGE_BENCHMARK_SCHEMA);
    assert.equal(evidence.status, 'passed');
    assert.equal(evidence.source.revision, revision);
    assert.equal(evidence.source.tree, tree);
    assert.equal(evidence.source.tracked_files, 2);
    assert.equal(evidence.source.repository_path_recorded, false);
    assert.equal(evidence.workload.workers, 3);
    assert.equal(evidence.workload.parallelism, 1);
    assert.equal(evidence.workload.mutation_bytes_per_worker, 4096);
    assert.equal(evidence.measurements.creation.operations, 3);
    assert.ok(evidence.measurements.worktree_tree.logical_bytes >= 12_000);
    assert.equal(evidence.measurements.backing_observer, null);
    assert.equal(evidence.controls.exact_commit_required, true);
    assert.equal(evidence.controls.disposable_control_clone, true);
    assert.equal(evidence.controls.axiom_data_dir_overlap_rejected, true);
    assert.equal(evidence.controls.shell_execution_used, false);
    assert.equal(evidence.controls.production_runtime_changed, false);
    assert.equal(evidence.controls.capability_registry_changed, false);
    assert.equal(evidence.controls.scheduler_authority_changed, false);
    assert.equal(evidence.controls.storage_profile_promoted, false);
    assert.equal(evidence.cleanup.retained, false);
    assert.equal(evidence.cleanup.completed, true);
    assert.equal(verifyAgentWorktreeStorageBenchmarkEvidence(evidence).valid, true);
    assert.doesNotMatch(JSON.stringify(evidence), /storage-test@axiom\.invalid/);
    assert.doesNotMatch(JSON.stringify(evidence), new RegExp(escapeRegExp(source)));

    const originalWorktreesAfter = await git([
      '-C',
      source,
      'worktree',
      'list',
      '--porcelain'
    ]);
    assert.equal(originalWorktreesAfter, originalWorktreesBefore);
    await assert.rejects(access(workspace), /ENOENT|no such file/i);

    const tampered = structuredClone(evidence);
    tampered.controls.storage_profile_promoted = true;
    assert.throws(
      () => verifyAgentWorktreeStorageBenchmarkEvidence(tampered),
      /evidence is invalid/
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

async function git(args) {
  const result = await execFileAsync('git', args, {
    windowsHide: true,
    maxBuffer: 4 * 1024 * 1024
  });
  return result.stdout;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
