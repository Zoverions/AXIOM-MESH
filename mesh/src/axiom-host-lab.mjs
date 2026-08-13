#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import { canonicalJson, ValidationError } from './lib/canonical.mjs';
import {
  HOST_LAB_SNAPSHOT_UNRESOLVED,
  normalizeSnapshotLock,
  verifyAxiomHostLabConfiguration
} from './check-axiom-host-lab.mjs';
import {
  assertEmptyAxiomHostOutput,
  inventoryAxiomHostArtifacts
} from './axiom-host-artifact-inventory.mjs';
import { generateAxiomHostH0ArtifactMetadata } from './axiom-host-artifact-metadata.mjs';
import { scanAxiomHostH0Secrets } from './axiom-host-secret-scan.mjs';

const execFileAsync = promisify(execFile);

export const HOST_LAB_ACKNOWLEDGEMENT = 'I_UNDERSTAND_THIS_IS_NON_PRODUCTION';
export const HOST_LAB_BUILD_SCHEMA = 'axiom-host-h0-build-evidence.v1';
export const HOST_LAB_EXT4_HASH_SEED = '6e56f338-f1f4-5cc8-a7fb-3dc1c107485c';

const REQUIRED_TOOL_OBSERVATIONS = Object.freeze([
  'systemd_repart',
  'mkfs_ext4',
  'mkfs_vfat',
  'mcopy'
]);

const REPOSITORY_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const HOST_DIRECTORY = resolve(REPOSITORY_ROOT, 'host');
const OUTPUT_DIRECTORY = resolve(HOST_DIRECTORY, 'mkosi.output');
const PRIVATE_DIRECTORY = resolve(HOST_DIRECTORY, '.mkosi-private');
const BUILD_LOG_PATH = resolve(PRIVATE_DIRECTORY, 'mkosi-build.log');
const FORBIDDEN_LOCAL_INPUTS = Object.freeze([
  'mkosi.key',
  'mkosi.crt',
  'mkosi.passphrase',
  'mkosi.rootpw',
  'mkosi.credentials',
  'mkosi.env',
  'mkosi.local.conf',
  'mkosi.local'
]);
const SAFE_ENVIRONMENT_KEYS = Object.freeze([
  'PATH',
  'HOME',
  'USER',
  'LOGNAME',
  'TMPDIR',
  'TMP',
  'TEMP',
  'LANG',
  'LC_ALL',
  'TERM'
]);

export async function createAxiomHostLabPlan({ repositoryRoot = REPOSITORY_ROOT } = {}) {
  const root = resolve(repositoryRoot);
  if (root !== REPOSITORY_ROOT) {
    throw new ValidationError('AXIOM Host laboratory plan may only target the active repository root');
  }

  const staticVerification = await verifyAxiomHostLabConfiguration();
  await assertNoImplicitMkosiSecrets();

  const revision = (await git(['rev-parse', '--verify', 'HEAD'], root)).trim().toLowerCase();
  const tree = (await git(['rev-parse', 'HEAD^{tree}'], root)).trim().toLowerCase();
  const sourceDateEpochText = (await git(['show', '-s', '--format=%ct', 'HEAD'], root)).trim();
  const sourceDateEpoch = Number(sourceDateEpochText);
  if (!/^[a-f0-9]{40}$/.test(revision) || !/^[a-f0-9]{40}$/.test(tree)) {
    throw new ValidationError('AXIOM Host laboratory requires exact Git commit and tree identities');
  }
  if (!Number.isSafeInteger(sourceDateEpoch) || sourceDateEpoch <= 0) {
    throw new ValidationError('AXIOM Host laboratory could not resolve a safe source-date epoch');
  }

  const status = await git(['status', '--porcelain=v1', '--untracked-files=all'], root);
  if (status.trim()) {
    throw new ValidationError('AXIOM Host laboratory requires a clean Git worktree');
  }

  const [
    mkosiConfig,
    toolsConfig,
    espRepart,
    rootRepart,
    policy,
    version,
    snapshotLock
  ] = await Promise.all([
    readFile(resolve(HOST_DIRECTORY, 'mkosi.conf'), 'utf8'),
    readFile(resolve(HOST_DIRECTORY, 'mkosi.tools.conf'), 'utf8'),
    readFile(resolve(HOST_DIRECTORY, 'mkosi.repart', '00-esp.conf'), 'utf8'),
    readFile(resolve(HOST_DIRECTORY, 'mkosi.repart', '10-root.conf'), 'utf8'),
    readFile(resolve(HOST_DIRECTORY, 'axiom-host-lab-policy.json'), 'utf8'),
    readFile(resolve(HOST_DIRECTORY, 'mkosi.version'), 'utf8'),
    readFile(resolve(HOST_DIRECTORY, 'mkosi.snapshot'), 'utf8')
  ]);

  return {
    schema: 'axiom-host-h0-build-plan.v1',
    status: 'laboratory-only',
    generated_from_clean_commit: true,
    source: {
      revision,
      tree,
      source_date_epoch: sourceDateEpoch
    },
    configuration: {
      policy_sha256: sha256(policy),
      mkosi_config_sha256: sha256(mkosiConfig),
      tools_config_sha256: sha256(toolsConfig),
      repart_definitions_sha256: sha256(`${espRepart}\0${rootRepart}`),
      snapshot_lock_sha256: sha256(snapshotLock),
      snapshot: staticVerification.snapshot,
      snapshot_locked: staticVerification.snapshot_locked,
      image_version: version.trim(),
      static_verification: staticVerification
    },
    execution: {
      directory: 'host',
      output_directory: 'host/mkosi.output',
      builder: 'mkosi',
      builder_minimum_version: staticVerification.builder_minimum_version,
      build_environment_sanitized: true,
      builder_home_isolated: true,
      builder_workspace_outside_source_tree: true,
      production_credentials_forwarded: false,
      network_profile: staticVerification.network,
      virtual_tpm: staticVerification.virtual_tpm
    },
    authority: {
      capability_registry_changed: false,
      production_policy_changed: false,
      node_admission_changed: false,
      scheduler_authority_changed: false,
      remote_execution_promoted: false,
      production_host_profile_promoted: false
    }
  };
}

export async function runAxiomHostLab({ action = 'summary', acknowledgement = '' } = {}) {
  if (!['summary', 'snapshot', 'build'].includes(action)) {
    throw new ValidationError('AXIOM Host laboratory action must be summary, snapshot, or build');
  }
  if (process.platform !== 'linux') {
    throw new ValidationError('AXIOM Host image construction is restricted to a Linux laboratory host');
  }
  if (acknowledgement !== HOST_LAB_ACKNOWLEDGEMENT) {
    throw new ValidationError(`AXIOM Host laboratory requires acknowledgement ${HOST_LAB_ACKNOWLEDGEMENT}`);
  }

  const plan = await createAxiomHostLabPlan();
  await mkdir(PRIVATE_DIRECTORY, { recursive: true, mode: 0o700 });
  const privateHome = await mkdtemp(join(tmpdir(), 'axiom-host-lab-'));
  await Promise.all([
    mkdir(join(privateHome, 'config'), { recursive: true, mode: 0o700 }),
    mkdir(join(privateHome, 'cache'), { recursive: true, mode: 0o700 }),
    mkdir(join(privateHome, 'runtime'), { recursive: true, mode: 0o700 })
  ]);
  const environment = laboratoryEnvironment(
    plan.source.source_date_epoch,
    process.env,
    { privateHome }
  );

  try {
    const mkosiVersion = (await execProgram('mkosi', ['--version'], {
      cwd: HOST_DIRECTORY,
      env: environment
    })).trim();

    if (action === 'snapshot') {
      if (plan.configuration.snapshot_locked) {
        throw new ValidationError('AXIOM Host snapshot discovery is disabled after a snapshot has been committed');
      }
      const candidateText = await execProgram('mkosi', ['--directory', HOST_DIRECTORY, 'latest-snapshot'], {
        cwd: REPOSITORY_ROOT,
        env: environment,
        maxBuffer: 4 * 1024 * 1024
      });
      const candidate = normalizeSnapshotLock(candidateText);
      if (candidate === HOST_LAB_SNAPSHOT_UNRESOLVED) {
        throw new ValidationError('mkosi latest-snapshot did not resolve a concrete Fedora snapshot');
      }
      return {
        ...plan,
        builder_observation: {
          mkosi_version: mkosiVersion,
          latest_snapshot_candidate: candidate,
          snapshot_committed: false,
          image_built: false
        },
        next_action: 'Review the candidate, commit it to host/mkosi.snapshot, and add the exact same Snapshot= value under [Distribution] in host/mkosi.conf.'
      };
    }

    await execProgram('mkosi', ['--directory', HOST_DIRECTORY, 'summary'], {
      cwd: REPOSITORY_ROOT,
      env: environment,
      maxBuffer: 16 * 1024 * 1024
    });

    if (action === 'summary') {
      return {
        ...plan,
        builder_observation: {
          mkosi_version: mkosiVersion,
          summary_validated: true,
          image_built: false
        }
      };
    }

    if (!plan.configuration.snapshot_locked) {
      throw new ValidationError(
        'AXIOM Host H0 build is blocked until host/mkosi.snapshot and [Distribution] Snapshot are pinned to the same reviewed snapshot'
      );
    }

    await assertEmptyAxiomHostOutput(OUTPUT_DIRECTORY);
    await mkdir(OUTPUT_DIRECTORY, { recursive: true, mode: 0o700 });
    await rm(BUILD_LOG_PATH, { force: true });
    await execProgram('mkosi', ['--directory', HOST_DIRECTORY, 'build'], {
      cwd: REPOSITORY_ROOT,
      env: environment,
      maxBuffer: 32 * 1024 * 1024,
      captureLogPath: BUILD_LOG_PATH
    });

    const beforeToolObservation = await inventoryAxiomHostArtifacts(OUTPUT_DIRECTORY, {
      exclude: ['axiom-host-h0-build-evidence.json']
    });
    const toolVersions = await observeBuilderTools(environment);
    const preliminaryArtifacts = await inventoryAxiomHostArtifacts(OUTPUT_DIRECTORY, {
      exclude: ['axiom-host-h0-build-evidence.json']
    });
    if (beforeToolObservation.digest !== preliminaryArtifacts.digest) {
      throw new ValidationError('AXIOM Host H0 tool observation mutated the built artifact set');
    }
    const artifactMetadata = await generateAxiomHostH0ArtifactMetadata({
      outputDirectory: OUTPUT_DIRECTORY,
      artifactInventory: preliminaryArtifacts.inventory,
      source: plan.source,
      imageVersion: plan.configuration.image_version,
      snapshot: plan.configuration.snapshot
    });
    const rawArtifact = preliminaryArtifacts.inventory.find(item => (
      item.link_target === undefined && item.name.endsWith('.raw')
    ));
    if (!rawArtifact) {
      throw new ValidationError('AXIOM Host H0 build did not produce a raw disk image');
    }
    const secretScan = await scanAxiomHostH0Secrets([
      { label: rawArtifact.name, path: resolve(OUTPUT_DIRECTORY, rawArtifact.name) },
      { label: 'mkosi-build.log', path: BUILD_LOG_PATH }
    ]);
    if (!secretScan.passed) {
      throw new ValidationError(
        `AXIOM Host H0 image or build log matched forbidden credential patterns: ${secretScan.matched_pattern_ids.join(', ')}`
      );
    }
    const artifacts = await inventoryAxiomHostArtifacts(OUTPUT_DIRECTORY, {
      exclude: ['axiom-host-h0-build-evidence.json']
    });

    const evidence = {
      schema: HOST_LAB_BUILD_SCHEMA,
      status: 'built-not-promoted',
      generated_at: new Date().toISOString(),
      source: plan.source,
      configuration: plan.configuration,
      builder_observation: {
        mkosi_version: mkosiVersion,
        tool_versions: toolVersions,
        tool_versions_sha256: sha256(canonicalJson(toolVersions)),
        summary_validated: true,
        image_built: true,
        artifact_metadata: artifactMetadata,
        secret_scan: secretScan,
        artifact_inventory: artifacts.inventory,
        artifact_set_sha256: artifacts.digest
      },
      controls: {
        linux_host_required: true,
        explicit_non_production_acknowledgement: true,
        clean_git_worktree_required: true,
        exact_commit_bound: true,
        source_date_epoch_from_commit: true,
      package_snapshot_locked: true,
      tools_tree_snapshot_locked: true,
      explicit_repart_layout: true,
        deterministic_ext4_time: true,
        deterministic_ext4_hash_seed: true,
        machine_readable_sbom_generated: true,
        draft_host_profile_generated: true,
        image_and_build_log_secret_scan_passed: true,
        exact_builder_tool_versions_recorded: true,
        clean_output_directory_required: true,
        artifact_bytes_hashed: true,
        build_environment_sanitized: true,
        builder_home_isolated: true,
        builder_workspace_outside_source_tree: true,
        implicit_mkosi_secret_files_rejected: true,
        production_credentials_forwarded: false,
        capability_registry_changed: false,
        production_policy_changed: false,
        node_admission_changed: false,
        scheduler_authority_changed: false,
        remote_execution_promoted: false,
        production_host_profile_promoted: false
      },
      limitations: [
        'A successful image build is laboratory evidence only and does not establish production readiness.',
        'H0 does not claim Secure Boot, measured boot, remote attestation, dm-verity, encrypted mutable state, or H1 isolation properties.',
        'Reproducibility requires a second independent clean build and comparison; this evidence records only one build.',
        'Artifact SHA-256 values bind produced bytes but do not establish authenticity, boot success, or runtime correctness.'
      ]
    };

    await writeFile(
      resolve(OUTPUT_DIRECTORY, 'axiom-host-h0-build-evidence.json'),
      `${JSON.stringify(evidence, null, 2)}\n`,
      { mode: 0o600 }
    );
    return evidence;
  } finally {
    await rm(privateHome, { recursive: true, force: true });
  }
}

export function laboratoryEnvironment(sourceDateEpoch, source = process.env, { privateHome } = {}) {
  const environment = {};
  for (const key of SAFE_ENVIRONMENT_KEYS) {
    const current = source[key];
    if (typeof current === 'string' && current.length > 0) environment[key] = current;
  }
  if (privateHome) {
    const home = resolve(privateHome);
    environment.HOME = home;
    environment.XDG_CONFIG_HOME = join(home, 'config');
    environment.XDG_CACHE_HOME = join(home, 'cache');
    environment.XDG_RUNTIME_DIR = join(home, 'runtime');
  }
  environment.SOURCE_DATE_EPOCH = String(sourceDateEpoch);
  environment.E2FSPROGS_FAKE_TIME = String(sourceDateEpoch);
  environment.SYSTEMD_REPART_MKFS_OPTIONS_EXT4 = `-E hash_seed=${HOST_LAB_EXT4_HASH_SEED}`;
  environment.TZ = 'UTC';
  environment.AXIOM_HOST_LAB = '1';
  return environment;
}

export function parseAxiomHostToolObservations(text) {
  const normalized = String(text).replace(/\r\n?/g, '\n');
  const observations = {};
  for (const name of REQUIRED_TOOL_OBSERVATIONS) {
    const begin = `AXIOM_TOOL_BEGIN:${name}\n`;
    const end = `\nAXIOM_TOOL_END:${name}`;
    const start = normalized.indexOf(begin);
    if (start < 0 || normalized.indexOf(begin, start + begin.length) >= 0) {
      throw new ValidationError(`AXIOM Host H0 tool observation is missing or repeats ${name}`);
    }
    const contentStart = start + begin.length;
    const finish = normalized.indexOf(end, contentStart);
    if (finish < 0 || normalized.indexOf(end, finish + end.length) >= 0) {
      throw new ValidationError(`AXIOM Host H0 tool observation has an invalid end marker for ${name}`);
    }
    const value = normalized.slice(contentStart, finish).trim();
    if (!value || value.length > 4096 || /AXIOM_TOOL_(?:BEGIN|END):/.test(value)) {
      throw new ValidationError(`AXIOM Host H0 tool observation is invalid for ${name}`);
    }
    observations[name] = value;
  }
  return observations;
}

async function observeBuilderTools(environment) {
  const script = [
    'set -eu',
    "printf 'AXIOM_TOOL_BEGIN:systemd_repart\\n'",
    'systemd-repart --version',
    "rpm -qf --qf '%{NEVRA}\\n' \"$(command -v systemd-repart)\"",
    "printf 'AXIOM_TOOL_END:systemd_repart\\n'",
    "printf 'AXIOM_TOOL_BEGIN:mkfs_ext4\\n'",
    "rpm -qf --qf '%{NEVRA}\\n' \"$(command -v mkfs.ext4)\"",
    "printf 'AXIOM_TOOL_END:mkfs_ext4\\n'",
    "printf 'AXIOM_TOOL_BEGIN:mkfs_vfat\\n'",
    "rpm -qf --qf '%{NEVRA}\\n' \"$(command -v mkfs.vfat)\"",
    "printf 'AXIOM_TOOL_END:mkfs_vfat\\n'",
    "printf 'AXIOM_TOOL_BEGIN:mcopy\\n'",
    "rpm -qf --qf '%{NEVRA}\\n' \"$(command -v mcopy)\"",
    "printf 'AXIOM_TOOL_END:mcopy\\n'"
  ].join('\n');
  const output = await execProgram(
    'mkosi',
    ['--directory', HOST_DIRECTORY, 'box', '--', '/bin/sh', '-c', script],
    {
      cwd: REPOSITORY_ROOT,
      env: environment,
      maxBuffer: 4 * 1024 * 1024
    }
  );
  return parseAxiomHostToolObservations(output);
}

async function assertNoImplicitMkosiSecrets() {
  for (const relativePath of FORBIDDEN_LOCAL_INPUTS) {
    const target = resolve(HOST_DIRECTORY, relativePath);
    try {
      await access(target);
      throw new ValidationError(`AXIOM Host laboratory rejects implicit mkosi input ${relativePath}`);
    } catch (error) {
      if (error instanceof ValidationError) throw error;
      if (error?.code !== 'ENOENT') throw error;
    }
  }

  const protectedDataDir = process.env.AXIOM_DATA_DIR;
  if (protectedDataDir && pathsOverlap(resolve(protectedDataDir), OUTPUT_DIRECTORY)) {
    throw new ValidationError('AXIOM Host laboratory output must not overlap AXIOM_DATA_DIR');
  }
}

function pathsOverlap(left, right) {
  return isWithin(left, right) || isWithin(right, left);
}

function isWithin(parent, child) {
  const rel = relative(resolve(parent), resolve(child));
  return rel === '' || (!rel.startsWith(`..${sep}`) && rel !== '..' && !rel.startsWith('..'));
}

async function git(args, cwd) {
  return execProgram('git', ['-C', cwd, ...args], { cwd, env: laboratoryEnvironment(1) });
}

async function execProgram(program, args, options = {}) {
  try {
    const result = await execFileAsync(program, args, {
      cwd: options.cwd,
      env: options.env,
      windowsHide: true,
      maxBuffer: options.maxBuffer ?? 4 * 1024 * 1024
    });
    if (options.captureLogPath) {
      await writeCommandLog(options.captureLogPath, result.stdout, result.stderr);
    }
    return result.stdout;
  } catch (error) {
    if (options.captureLogPath) {
      await writeCommandLog(options.captureLogPath, error?.stdout, error?.stderr);
    }
    const stderr = String(error?.stderr ?? '').trim();
    const suffix = stderr ? `: ${stderr.slice(-4000)}` : '';
    throw new ValidationError(`AXIOM Host laboratory command failed: ${program} ${args.join(' ')}${suffix}`);
  }
}

async function writeCommandLog(path, stdout, stderr) {
  const content = [
    '=== stdout ===',
    String(stdout ?? ''),
    '=== stderr ===',
    String(stderr ?? '')
  ].join('\n');
  await writeFile(path, content, { mode: 0o600 });
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

async function main() {
  const command = process.argv[2] ?? 'plan';
  if (command === 'plan') {
    process.stdout.write(`${JSON.stringify(await createAxiomHostLabPlan())}\n`);
    return;
  }
  if (command === 'summary' || command === 'snapshot' || command === 'build') {
    const acknowledgement = process.env.AXIOM_HOST_LAB_ACK ?? '';
    process.stdout.write(`${JSON.stringify(await runAxiomHostLab({ action: command, acknowledgement }))}\n`);
    return;
  }
  throw new ValidationError('Usage: axiom-host-lab.mjs plan|summary|snapshot|build');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
