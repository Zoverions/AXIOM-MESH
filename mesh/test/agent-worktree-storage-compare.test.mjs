import assert from 'node:assert/strict';
import test from 'node:test';

import {
  compareAgentWorktreeStorageEvidence,
  STORAGE_COMPARISON_SCHEMA,
  verifyAgentWorktreeStorageComparison
} from '../src/agent-worktree-storage-compare.mjs';
import {
  STORAGE_BENCHMARK_SCHEMA
} from '../src/agent-worktree-storage-benchmark.mjs';

function benchmarkEvidence({
  profileId,
  physicalBytes,
  filesystemBytes = physicalBytes,
  revision = 'a'.repeat(40),
  workers = 8,
  withObserver = true
}) {
  return {
    schema: STORAGE_BENCHMARK_SCHEMA,
    status: 'passed',
    generated_at: '2026-08-12T22:00:00.000Z',
    source: {
      kernel_version: '0.12.0-dev.3',
      repository_path_recorded: false,
      revision,
      tree: 'b'.repeat(40),
      tracked_files: 100,
      git_version: 'git version test'
    },
    profile: {
      profile_id: profileId,
      materialization: 'git-linked-worktree-from-disposable-control-clone',
      filesystem_type: '0x58465342',
      filesystem_block_size: 4096,
      physical_observer: {
        configured: withObserver,
        command_digest: withObserver ? 'c'.repeat(64) : null
      }
    },
    workload: {
      workers,
      parallelism: 4,
      mutation_bytes_per_worker: 4096,
      post_materialization_command: {
        program: 'npm',
        args: ['ci', '--ignore-scripts'],
        inherited_secret_environment: false
      }
    },
    measurements: {
      creation: {
        operations: workers,
        wall_ms: 100,
        median_ms: 10,
        p95_ms: 12,
        min_ms: 9,
        max_ms: 13
      },
      post_materialization: {
        operations: workers,
        wall_ms: 200,
        median_ms: 20,
        p95_ms: 24,
        min_ms: 18,
        max_ms: 25
      },
      mutation_wall_ms: 50,
      worktree_tree: {
        files: 1000,
        directories: 100,
        symlinks: 0,
        logical_bytes: 100_000,
        allocated_bytes_visible_to_filesystem: 120_000
      },
      filesystem: {
        before: {},
        after: {},
        used_delta_bytes: filesystemBytes,
        interpretation: 'test fixture'
      },
      backing_observer: withObserver
        ? {
            before_physical_used_bytes: 10_000,
            after_physical_used_bytes: 10_000 + physicalBytes,
            physical_used_delta_bytes: physicalBytes
          }
        : null
    },
    controls: {
      config_digest: 'd'.repeat(64),
      exact_commit_required: true,
      disposable_control_clone: true,
      explicit_empty_workspace_required: true,
      axiom_data_dir_overlap_rejected: true,
      shell_execution_used: false,
      package_manager_lifecycle_scripts_allowed: false,
      production_runtime_changed: false,
      capability_registry_changed: false,
      scheduler_authority_changed: false,
      storage_profile_promoted: false
    },
    limitations: ['test fixture'],
    cleanup: {
      retained: false,
      completed: true
    }
  };
}

test('storage comparison binds identical fixture shape and computes physical savings', () => {
  const baseline = benchmarkEvidence({
    profileId: 'plain-xfs',
    physicalBytes: 1000
  });
  const vdo = benchmarkEvidence({
    profileId: 'vdo-xfs',
    physicalBytes: 400
  });

  const comparison = compareAgentWorktreeStorageEvidence(
    [baseline, vdo],
    { baselineProfileId: 'plain-xfs' }
  );

  assert.equal(comparison.schema, STORAGE_COMPARISON_SCHEMA);
  assert.equal(comparison.status, 'passed');
  assert.equal(
    comparison.measurement.storage_class,
    'backing-device-physical-used-delta-bytes'
  );
  assert.equal(comparison.rows[0].storage_savings_vs_baseline_pct, 0);
  assert.equal(comparison.rows[1].storage_vs_baseline_ratio, 0.4);
  assert.equal(comparison.rows[1].storage_savings_vs_baseline_pct, 60);
  assert.equal(comparison.controls.storage_profile_promoted, false);
  assert.equal(verifyAgentWorktreeStorageComparison(comparison).valid, true);
});

test('storage comparison rejects fixture drift and mixed measurement classes', () => {
  const baseline = benchmarkEvidence({
    profileId: 'plain-xfs',
    physicalBytes: 1000
  });
  const differentWorkers = benchmarkEvidence({
    profileId: 'different-workers',
    physicalBytes: 500,
    workers: 9
  });
  assert.throws(
    () => compareAgentWorktreeStorageEvidence([baseline, differentWorkers]),
    /not fixture-compatible/
  );

  const filesystemOnly = benchmarkEvidence({
    profileId: 'filesystem-only',
    physicalBytes: 500,
    withObserver: false
  });
  assert.throws(
    () => compareAgentWorktreeStorageEvidence([baseline, filesystemOnly]),
    /cannot mix backing-device physical measurements/
  );
});

test('storage comparison supports explicit filesystem-allocation proxy mode without calling it physical', () => {
  const baseline = benchmarkEvidence({
    profileId: 'ext4-proxy',
    physicalBytes: 0,
    filesystemBytes: 1200,
    withObserver: false
  });
  const xfs = benchmarkEvidence({
    profileId: 'xfs-proxy',
    physicalBytes: 0,
    filesystemBytes: 900,
    withObserver: false
  });
  const comparison = compareAgentWorktreeStorageEvidence([baseline, xfs]);
  assert.equal(
    comparison.measurement.storage_class,
    'filesystem-used-delta-bytes-proxy'
  );
  assert.equal(comparison.rows[1].storage_savings_vs_baseline_pct, 25);
  assert.match(comparison.limitations.join(' '), /must not be described as backing-device physical usage/);
});

test('storage comparison verifier rejects promotion and fixture tampering', () => {
  const comparison = compareAgentWorktreeStorageEvidence([
    benchmarkEvidence({ profileId: 'plain-xfs', physicalBytes: 1000 }),
    benchmarkEvidence({ profileId: 'vdo-xfs', physicalBytes: 500 })
  ]);

  const promoted = structuredClone(comparison);
  promoted.controls.storage_profile_promoted = true;
  assert.throws(
    () => verifyAgentWorktreeStorageComparison(promoted),
    /comparison is invalid/
  );

  const tampered = structuredClone(comparison);
  tampered.fixture.workload.workers = 99;
  assert.throws(
    () => verifyAgentWorktreeStorageComparison(tampered),
    /fixture digest is invalid/
  );
});
