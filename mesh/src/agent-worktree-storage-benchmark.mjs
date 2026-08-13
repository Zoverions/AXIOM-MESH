#!/usr/bin/env node

import { randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';
import {
  lstat,
  mkdir,
  readdir,
  readFile,
  rm,
  statfs,
  writeFile
} from 'node:fs/promises';
import { basename, join, relative, resolve, sep } from 'node:path';
import { performance } from 'node:perf_hooks';
import { pathToFileURL } from 'node:url';
import {
  canonicalJson,
  sha256,
  ValidationError
} from './lib/canonical.mjs';

export const STORAGE_BENCHMARK_SCHEMA = 'axiom-agent-worktree-storage-benchmark-evidence.v1';
export const LAB_ACKNOWLEDGEMENT = 'I_UNDERSTAND_THIS_IS_NON_PRODUCTION';

const REVISION = /^[a-f0-9]{40}$/;
const PROFILE_ID = /^[a-z0-9][a-z0-9._-]{1,63}$/;
const MAX_WORKERS = 500;
const MAX_PARALLELISM = 32;
const MAX_MUTATION_BYTES_PER_WORKER = 256 * 1024 * 1024;
const SAFE_ENV_KEYS = [
  'PATH',
  'HOME',
  'USERPROFILE',
  'TMPDIR',
  'TMP',
  'TEMP',
  'SystemRoot',
  'ComSpec',
  'PATHEXT',
  'LOCALAPPDATA',
  'APPDATA'
];

export function normalizeStorageBenchmarkOptions(options = {}) {
  const sourceRepo = normalizePath(options.sourceRepo, 'sourceRepo');
  const workspace = normalizePath(options.workspace, 'workspace');
  const revision = String(options.revision ?? '').toLowerCase();
  if (!REVISION.test(revision)) {
    throw new ValidationError('Storage benchmark revision must be an exact 40-character commit SHA');
  }
  const profileId = String(options.profileId ?? 'unclassified-lab').toLowerCase();
  if (!PROFILE_ID.test(profileId)) {
    throw new ValidationError('Storage benchmark profileId has an invalid format');
  }
  const workers = normalizeInteger(options.workers ?? 8, 'workers', 1, MAX_WORKERS);
  const parallelism = normalizeInteger(
    options.parallelism ?? Math.min(workers, 8),
    'parallelism',
    1,
    MAX_PARALLELISM
  );
  if (parallelism > workers) {
    throw new ValidationError('Storage benchmark parallelism cannot exceed workers');
  }
  const mutationBytesPerWorker = normalizeInteger(
    options.mutationBytesPerWorker ?? 0,
    'mutationBytesPerWorker',
    0,
    MAX_MUTATION_BYTES_PER_WORKER
  );
  const acknowledgement = String(options.acknowledgement ?? '');
  if (acknowledgement !== LAB_ACKNOWLEDGEMENT) {
    throw new ValidationError(
      `Storage benchmark requires acknowledgement ${LAB_ACKNOWLEDGEMENT}`
    );
  }
  const workload = normalizeOptionalCommand(options.workload, 'workload');
  if (workload && looksLikePackageManager(workload.program)) {
    if (!workload.args.includes('--ignore-scripts')) {
      throw new ValidationError(
        'Package-manager benchmark workloads must include --ignore-scripts'
      );
    }
  }
  const physicalObserver = normalizeOptionalCommand(
    options.physicalObserver,
    'physicalObserver'
  );
  return Object.freeze({
    sourceRepo,
    workspace,
    revision,
    profileId,
    workers,
    parallelism,
    mutationBytesPerWorker,
    workload,
    physicalObserver,
    retainWorkspace: options.retainWorkspace === true,
    generatedAt: normalizeTimestamp(options.generatedAt ?? new Date().toISOString())
  });
}

export function assertLaboratoryPathSafety({ sourceRepo, workspace, dataDir } = {}) {
  const source = normalizePath(sourceRepo, 'sourceRepo');
  const target = normalizePath(workspace, 'workspace');
  if (pathsOverlap(source, target)) {
    throw new ValidationError(
      'Storage benchmark sourceRepo and workspace must not overlap'
    );
  }
  const protectedDataDir = dataDir ? resolve(dataDir) : null;
  if (protectedDataDir && pathsOverlap(protectedDataDir, target)) {
    throw new ValidationError(
      'Storage benchmark workspace must not overlap AXIOM_DATA_DIR'
    );
  }
  return true;
}

export async function runAgentWorktreeStorageBenchmark(options = {}) {
  const config = normalizeStorageBenchmarkOptions(options);
  assertLaboratoryPathSafety({
    sourceRepo: config.sourceRepo,
    workspace: config.workspace,
    dataDir: options.dataDir ?? process.env.AXIOM_DATA_DIR
  });

  await prepareEmptyWorkspace(config.workspace);
  const controlDir = join(config.workspace, 'control');
  const worktreesDir = join(config.workspace, 'worktrees');
  await mkdir(controlDir, { recursive: true, mode: 0o700 });
  await mkdir(worktreesDir, { recursive: true, mode: 0o700 });

  const sourceRevision = (
    await execProgram('git', ['-C', config.sourceRepo, 'rev-parse', '--verify', `${config.revision}^{commit}`])
  ).stdout.trim().toLowerCase();
  if (sourceRevision !== config.revision) {
    throw new ValidationError('Storage benchmark source revision resolution drifted');
  }

  const controlRepo = join(controlDir, 'source');
  await execProgram('git', [
    'clone',
    '--no-checkout',
    '--local',
    config.sourceRepo,
    controlRepo
  ]);
  const controlRevision = (
    await execProgram('git', ['-C', controlRepo, 'rev-parse', '--verify', `${config.revision}^{commit}`])
  ).stdout.trim().toLowerCase();
  if (controlRevision !== config.revision) {
    throw new ValidationError('Storage benchmark control clone does not contain the exact source revision');
  }
  const sourceTree = (
    await execProgram('git', ['-C', controlRepo, 'rev-parse', `${config.revision}^{tree}`])
  ).stdout.trim().toLowerCase();
  const trackedFiles = countLines((
    await execProgram('git', [
      '-C',
      controlRepo,
      'ls-tree',
      '-r',
      '--name-only',
      config.revision
    ])
  ).stdout);
  const gitVersion = (
    await execProgram('git', ['--version'])
  ).stdout.trim();

  const beforeFs = await filesystemSnapshot(config.workspace);
  const beforePhysical = await runPhysicalObserver(config, 'before');
  const workerPaths = Array.from({ length: config.workers }, (_, index) => (
    join(worktreesDir, `worker-${String(index + 1).padStart(4, '0')}`)
  ));

  const creationStarted = performance.now();
  const creationResults = await mapWithConcurrency(
    workerPaths,
    config.parallelism,
    async (workerPath, index) => {
      const started = performance.now();
      await execProgram('git', [
        '-C',
        controlRepo,
        'worktree',
        'add',
        '--detach',
        workerPath,
        config.revision
      ]);
      const resolved = (
        await execProgram('git', ['-C', workerPath, 'rev-parse', 'HEAD'])
      ).stdout.trim().toLowerCase();
      if (resolved !== config.revision) {
        throw new ValidationError(`Worker ${index + 1} did not resolve to the exact source revision`);
      }
      return {
        worker: index + 1,
        duration_ms: elapsed(started)
      };
    }
  );
  const creationWallMs = elapsed(creationStarted);

  let workloadResults = [];
  let workloadWallMs = 0;
  if (config.workload) {
    const workloadStarted = performance.now();
    workloadResults = await mapWithConcurrency(
      workerPaths,
      config.parallelism,
      async (workerPath, index) => {
        const started = performance.now();
        await execProgram(
          config.workload.program,
          config.workload.args,
          {
            cwd: workerPath,
            env: laboratoryEnvironment({
              AXIOM_STORAGE_BENCHMARK: '1',
              AXIOM_STORAGE_BENCHMARK_WORKER: String(index + 1)
            })
          }
        );
        return {
          worker: index + 1,
          duration_ms: elapsed(started)
        };
      }
    );
    workloadWallMs = elapsed(workloadStarted);
  }

  let mutationWallMs = 0;
  if (config.mutationBytesPerWorker > 0) {
    const mutationStarted = performance.now();
    await mapWithConcurrency(
      workerPaths,
      config.parallelism,
      async (workerPath, index) => {
        const output = join(workerPath, '.axiom-storage-benchmark-unique.bin');
        await writeUniqueFile(output, config.mutationBytesPerWorker, index + 1);
      }
    );
    mutationWallMs = elapsed(mutationStarted);
  }

  const treeMetrics = await aggregateTreeMetrics(workerPaths);
  const afterFs = await filesystemSnapshot(config.workspace);
  const afterPhysical = await runPhysicalObserver(config, 'after');
  const filesystemUsedDeltaBytes = Math.max(
    0,
    afterFs.used_bytes - beforeFs.used_bytes
  );
  const observerDeltaBytes = (
    beforePhysical && afterPhysical
      ? Math.max(0, afterPhysical.physical_used_bytes - beforePhysical.physical_used_bytes)
      : null
  );

  const sourcePackage = JSON.parse(
    await readFile(new URL('../package.json', import.meta.url), 'utf8')
  );
  const configForDigest = {
    profile_id: config.profileId,
    workers: config.workers,
    parallelism: config.parallelism,
    mutation_bytes_per_worker: config.mutationBytesPerWorker,
    workload: config.workload
      ? {
          program: basename(config.workload.program),
          args: config.workload.args
        }
      : null,
    physical_observer_configured: Boolean(config.physicalObserver),
    retain_workspace: config.retainWorkspace
  };
  const evidence = {
    schema: STORAGE_BENCHMARK_SCHEMA,
    status: 'passed',
    generated_at: config.generatedAt,
    source: {
      kernel_version: sourcePackage.version,
      repository_path_recorded: false,
      revision: config.revision,
      tree: sourceTree,
      tracked_files: trackedFiles,
      git_version: gitVersion
    },
    profile: {
      profile_id: config.profileId,
      materialization: 'git-linked-worktree-from-disposable-control-clone',
      filesystem_type: afterFs.type,
      filesystem_block_size: afterFs.block_size,
      physical_observer: config.physicalObserver
        ? {
            configured: true,
            command_digest: sha256(canonicalJson([
              config.physicalObserver.program,
              ...config.physicalObserver.args
            ]))
          }
        : {
            configured: false,
            command_digest: null
          }
    },
    workload: {
      workers: config.workers,
      parallelism: config.parallelism,
      mutation_bytes_per_worker: config.mutationBytesPerWorker,
      post_materialization_command: config.workload
        ? {
            program: basename(config.workload.program),
            args: config.workload.args,
            inherited_secret_environment: false
          }
        : null
    },
    measurements: {
      creation: summarizeDurations(creationResults, creationWallMs),
      post_materialization: config.workload
        ? summarizeDurations(workloadResults, workloadWallMs)
        : null,
      mutation_wall_ms: mutationWallMs,
      worktree_tree: treeMetrics,
      filesystem: {
        before: beforeFs,
        after: afterFs,
        used_delta_bytes: filesystemUsedDeltaBytes,
        interpretation: 'filesystem allocation delta; not guaranteed to equal backing-device physical use'
      },
      backing_observer: (
        beforePhysical && afterPhysical
          ? {
              before_physical_used_bytes: beforePhysical.physical_used_bytes,
              after_physical_used_bytes: afterPhysical.physical_used_bytes,
              physical_used_delta_bytes: observerDeltaBytes
            }
          : null
      )
    },
    controls: {
      config_digest: sha256(canonicalJson(configForDigest)),
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
    limitations: [
      'This is laboratory evidence and does not promote a storage profile or runtime capability.',
      'Filesystem allocation deltas can include unrelated host activity and do not expose dm-vdo backing allocation by themselves.',
      'A configured physical observer is operator-supplied and must be independently reviewed for the target storage stack.',
      'Git linked worktrees share repository administration inside the disposable control clone and are not an adversarial sandbox boundary.',
      'The harness does not create or configure XFS, ext4, OverlayFS, reflink, dm-vdo, encryption, integrity, quotas, or mounts; those are externally prepared test profiles.',
      'The harness does not block network access for an optional workload command; run that command inside the intended laboratory network boundary.'
    ],
    cleanup: {
      retained: config.retainWorkspace,
      completed: false
    }
  };

  verifyAgentWorktreeStorageBenchmarkEvidence(evidence);

  if (!config.retainWorkspace) {
    await cleanupBenchmarkWorkspace({ controlRepo, workerPaths, workspace: config.workspace });
    evidence.cleanup.completed = true;
  }
  return evidence;
}

export function verifyAgentWorktreeStorageBenchmarkEvidence(evidence) {
  if (
    !evidence
    || typeof evidence !== 'object'
    || Array.isArray(evidence)
    || evidence.schema !== STORAGE_BENCHMARK_SCHEMA
    || evidence.status !== 'passed'
    || !REVISION.test(evidence.source?.revision ?? '')
    || !/^[a-f0-9]{40}$/.test(evidence.source?.tree ?? '')
    || !Number.isSafeInteger(evidence.workload?.workers)
    || evidence.workload.workers < 1
    || evidence.workload.workers > MAX_WORKERS
    || evidence.controls?.exact_commit_required !== true
    || evidence.controls?.disposable_control_clone !== true
    || evidence.controls?.explicit_empty_workspace_required !== true
    || evidence.controls?.axiom_data_dir_overlap_rejected !== true
    || evidence.controls?.shell_execution_used !== false
    || evidence.controls?.package_manager_lifecycle_scripts_allowed !== false
    || evidence.controls?.production_runtime_changed !== false
    || evidence.controls?.capability_registry_changed !== false
    || evidence.controls?.scheduler_authority_changed !== false
    || evidence.controls?.storage_profile_promoted !== false
    || !Number.isFinite(evidence.measurements?.creation?.wall_ms)
    || !Number.isSafeInteger(evidence.measurements?.worktree_tree?.files)
    || evidence.measurements.worktree_tree.files < 0
  ) {
    throw new ValidationError('Agent worktree storage benchmark evidence is invalid');
  }
  return {
    valid: true,
    schema: evidence.schema,
    profile_id: evidence.profile.profile_id,
    workers: evidence.workload.workers,
    physical_observer: Boolean(evidence.measurements.backing_observer)
  };
}

async function cleanupBenchmarkWorkspace({ controlRepo, workerPaths, workspace }) {
  for (const workerPath of workerPaths) {
    try {
      await execProgram('git', [
        '-C',
        controlRepo,
        'worktree',
        'remove',
        '--force',
        workerPath
      ]);
    } catch {
      await rm(workerPath, { recursive: true, force: true });
    }
  }
  await rm(workspace, { recursive: true, force: true });
}

async function runPhysicalObserver(config, phase) {
  if (!config.physicalObserver) return null;
  const result = await execProgram(
    config.physicalObserver.program,
    config.physicalObserver.args,
    {
      cwd: config.workspace,
      env: laboratoryEnvironment({
        AXIOM_STORAGE_BENCHMARK: '1',
        AXIOM_STORAGE_BENCHMARK_WORKSPACE: config.workspace,
        AXIOM_STORAGE_BENCHMARK_PHASE: phase
      })
    }
  );
  let parsed;
  try {
    parsed = JSON.parse(result.stdout);
  } catch {
    throw new ValidationError('Physical observer must emit one JSON object on stdout');
  }
  const value = Number(parsed?.physical_used_bytes);
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new ValidationError('Physical observer physical_used_bytes must be a non-negative safe integer');
  }
  return { physical_used_bytes: value };
}

async function filesystemSnapshot(path) {
  const snapshot = await statfs(path, { bigint: true });
  const blockSize = Number(snapshot.bsize);
  const blocks = Number(snapshot.blocks);
  const freeBlocks = Number(snapshot.bfree);
  const availableBlocks = Number(snapshot.bavail);
  return {
    type: `0x${snapshot.type.toString(16)}`,
    block_size: blockSize,
    total_bytes: blocks * blockSize,
    free_bytes: freeBlocks * blockSize,
    available_bytes: availableBlocks * blockSize,
    used_bytes: (blocks - freeBlocks) * blockSize
  };
}

async function aggregateTreeMetrics(paths) {
  const totals = {
    files: 0,
    directories: 0,
    symlinks: 0,
    logical_bytes: 0,
    allocated_bytes_visible_to_filesystem: 0
  };
  for (const path of paths) {
    const metrics = await treeMetrics(path);
    for (const key of Object.keys(totals)) totals[key] += metrics[key];
  }
  return totals;
}

async function treeMetrics(root) {
  const totals = {
    files: 0,
    directories: 0,
    symlinks: 0,
    logical_bytes: 0,
    allocated_bytes_visible_to_filesystem: 0
  };
  const visit = async path => {
    const stats = await lstat(path);
    const allocated = Number(stats.blocks ?? 0) * 512;
    totals.allocated_bytes_visible_to_filesystem += allocated;
    if (stats.isSymbolicLink()) {
      totals.symlinks += 1;
      totals.logical_bytes += Number(stats.size ?? 0);
      return;
    }
    if (stats.isDirectory()) {
      totals.directories += 1;
      for (const entry of await readdir(path)) await visit(join(path, entry));
      return;
    }
    totals.files += 1;
    totals.logical_bytes += Number(stats.size ?? 0);
  };
  await visit(root);
  return totals;
}

async function writeUniqueFile(path, bytes, worker) {
  const chunkSize = 1024 * 1024;
  const chunks = [];
  let remaining = bytes;
  while (remaining > 0) {
    const size = Math.min(chunkSize, remaining);
    const chunk = randomBytes(size);
    if (chunks.length === 0 && size >= 8) {
      chunk.writeUInt32BE(worker >>> 0, 0);
      chunk.writeUInt32BE(bytes >>> 0, 4);
    }
    chunks.push(chunk);
    remaining -= size;
  }
  await writeFile(path, Buffer.concat(chunks));
}

function summarizeDurations(results, wallMs) {
  const values = results.map(item => item.duration_ms).sort((a, b) => a - b);
  return {
    operations: values.length,
    wall_ms: wallMs,
    median_ms: percentile(values, 0.5),
    p95_ms: percentile(values, 0.95),
    min_ms: values[0] ?? 0,
    max_ms: values.at(-1) ?? 0
  };
}

function percentile(values, fraction) {
  if (!values.length) return 0;
  const index = Math.min(values.length - 1, Math.ceil(values.length * fraction) - 1);
  return Number(values[index].toFixed(3));
}

async function mapWithConcurrency(items, limit, worker) {
  const results = new Array(items.length);
  let cursor = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const index = cursor;
      cursor += 1;
      if (index >= items.length) return;
      results[index] = await worker(items[index], index);
    }
  });
  await Promise.all(runners);
  return results;
}

async function prepareEmptyWorkspace(workspace) {
  await mkdir(workspace, { recursive: true, mode: 0o700 });
  const entries = await readdir(workspace);
  if (entries.length !== 0) {
    throw new ValidationError('Storage benchmark workspace must be empty');
  }
}

function normalizeOptionalCommand(value, name) {
  if (value === null || value === undefined) return null;
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new ValidationError(`${name} must be an object`);
  }
  if (typeof value.program !== 'string' || !value.program.trim()) {
    throw new ValidationError(`${name}.program must be a non-empty string`);
  }
  if (!Array.isArray(value.args) || value.args.length > 64) {
    throw new ValidationError(`${name}.args must be an array with at most 64 items`);
  }
  const args = value.args.map((item, index) => {
    if (typeof item !== 'string' || item.length > 4096) {
      throw new ValidationError(`${name}.args[${index}] must be a bounded string`);
    }
    return item;
  });
  return Object.freeze({ program: value.program, args: Object.freeze(args) });
}

function looksLikePackageManager(program) {
  return /^(npm|pnpm|yarn|bun)(\.cmd|\.exe)?$/i.test(basename(program));
}

function laboratoryEnvironment(additions = {}) {
  const env = {};
  for (const key of SAFE_ENV_KEYS) {
    if (process.env[key] !== undefined) env[key] = process.env[key];
  }
  return { ...env, ...additions };
}

async function execProgram(program, args, { cwd, env = laboratoryEnvironment() } = {}) {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(program, args, {
      cwd,
      env,
      shell: false,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe']
    });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', chunk => {
      stdout += chunk;
      if (stdout.length > 16 * 1024 * 1024) child.kill();
    });
    child.stderr.on('data', chunk => {
      stderr += chunk;
      if (stderr.length > 16 * 1024 * 1024) child.kill();
    });
    child.once('error', error => rejectPromise(error));
    child.once('close', code => {
      if (code !== 0) {
        rejectPromise(new ValidationError(
          `Storage benchmark command failed: ${basename(program)} (${code})`,
          { stderr: stderr.slice(-4096) }
        ));
        return;
      }
      resolvePromise({ stdout, stderr });
    });
  });
}

function normalizePath(value, name) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new ValidationError(`${name} must be a non-empty path`);
  }
  return resolve(value);
}

function pathsOverlap(a, b) {
  return isWithin(a, b) || isWithin(b, a);
}

function isWithin(parent, child) {
  const rel = relative(resolve(parent), resolve(child));
  return rel === '' || (!rel.startsWith(`..${sep}`) && rel !== '..' && !resolve(rel).startsWith(sep));
}

function normalizeInteger(value, name, minimum, maximum) {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < minimum || number > maximum) {
    throw new ValidationError(`${name} must be an integer between ${minimum} and ${maximum}`);
  }
  return number;
}

function normalizeTimestamp(value) {
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value))) {
    throw new ValidationError('Storage benchmark generatedAt is invalid');
  }
  return new Date(value).toISOString();
}

function countLines(value) {
  if (!value) return 0;
  return value.endsWith('\n')
    ? value.slice(0, -1).split('\n').length
    : value.split('\n').length;
}

function elapsed(startedAt) {
  return Number((performance.now() - startedAt).toFixed(3));
}

function parseArgs(argv) {
  const output = {};
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (!flag?.startsWith('--') || value === undefined) {
      throw new ValidationError('Storage benchmark arguments must be --name value pairs');
    }
    output[flag.slice(2)] = value;
  }
  return output;
}

function parseJsonArray(value, name) {
  if (value === undefined) return [];
  let parsed;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new ValidationError(`${name} must be a JSON string array`);
  }
  if (!Array.isArray(parsed) || parsed.some(item => typeof item !== 'string')) {
    throw new ValidationError(`${name} must be a JSON string array`);
  }
  return parsed;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const evidence = await runAgentWorktreeStorageBenchmark({
    sourceRepo: args['source-repo'],
    workspace: args.workspace,
    revision: args.revision,
    profileId: args['profile-id'],
    workers: Number(args.workers ?? 8),
    parallelism: Number(args.parallelism ?? 8),
    mutationBytesPerWorker: Number(args['mutation-bytes-per-worker'] ?? 0),
    acknowledgement: args.ack,
    retainWorkspace: args.retain === 'true',
    workload: args['workload-program']
      ? {
          program: args['workload-program'],
          args: parseJsonArray(args['workload-args-json'], 'workload-args-json')
        }
      : null,
    physicalObserver: args['physical-observer-program']
      ? {
          program: args['physical-observer-program'],
          args: parseJsonArray(
            args['physical-observer-args-json'],
            'physical-observer-args-json'
          )
        }
      : null
  });
  process.stdout.write(`${JSON.stringify(evidence, null, 2)}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
