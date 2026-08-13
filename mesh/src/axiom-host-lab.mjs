#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { access, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import { ValidationError } from './lib/canonical.mjs';
import {
  HOST_LAB_SNAPSHOT_UNRESOLVED,
  normalizeSnapshotLock,
  verifyAxiomHostLabConfiguration
} from './check-axiom-host-lab.mjs';

const execFileAsync = promisify(execFile);

export const HOST_LAB_ACKNOWLEDGEMENT = 'I_UNDERSTAND_THIS_IS_NON_PRODUCTION';
export const HOST_LAB_BUILD_SCHEMA = 'axiom-host-h0-build-evidence.v1';

const REPOSITORY_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const HOST_DIRECTORY = resolve(REPOSITORY_ROOT, 'host');
const OUTPUT_DIRECTORY = resolve(HOST_DIRECTORY, 'mkosi.output');
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
  'XDG_CACHE_HOME',
  'XDG_RUNTIME_DIR',
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

  const [mkosiConfig, policy, version, snapshotLock] = await Promise.all([
    readFile(resolve(HOST_DIRECTORY, 'mkosi.conf'), 'utf8'),
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
  const environment = laboratoryEnvironment(plan.source.source_date_epoch);
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

  await mkdir(OUTPUT_DIRECTORY, { recursive: true });
  await execProgram('mkosi', ['--directory', HOST_DIRECTORY, 'build'], {
    cwd: REPOSITORY_ROOT,
    env: environment,
    maxBuffer: 32 * 1024 * 1024
  });

  const outputFiles = (await readdir(OUTPUT_DIRECTORY, { withFileTypes: true }))
    .filter(entry => entry.isFile())
    .map(entry => entry.name)
    .sort();
  if (outputFiles.length === 0) {
    throw new ValidationError('AXIOM Host laboratory build produced no files in the declared output directory');
  }

  const evidence = {
    schema: HOST_LAB_BUILD_SCHEMA,
    status: 'built-not-promoted',
    generated_at: new Date().toISOString(),
    source: plan.source,
    configuration: plan.configuration,
    builder_observation: {
      mkosi_version: mkosiVersion,
      summary_validated: true,
      image_built: true,
      output_files: outputFiles
    },
    controls: {
      linux_host_required: true,
      explicit_non_production_acknowledgement: true,
      clean_git_worktree_required: true,
      exact_commit_bound: true,
      source_date_epoch_from_commit: true,
      package_snapshot_locked: true,
      build_environment_sanitized: true,
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
      'The build output inventory records file names, while mkosi-generated checksums remain the artifact-integrity source for this stage.'
    ]
  };

  await writeFile(
    resolve(OUTPUT_DIRECTORY, 'axiom-host-h0-build-evidence.json'),
    `${JSON.stringify(evidence, null, 2)}\n`,
    { mode: 0o600 }
  );
  return evidence;
}

export function laboratoryEnvironment(sourceDateEpoch, source = process.env) {
  const environment = {};
  for (const key of SAFE_ENVIRONMENT_KEYS) {
    const current = source[key];
    if (typeof current === 'string' && current.length > 0) environment[key] = current;
  }
  environment.SOURCE_DATE_EPOCH = String(sourceDateEpoch);
  environment.AXIOM_HOST_LAB = '1';
  return environment;
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
    return result.stdout;
  } catch (error) {
    const stderr = String(error?.stderr ?? '').trim();
    const suffix = stderr ? `: ${stderr.slice(0, 2000)}` : '';
    throw new ValidationError(`AXIOM Host laboratory command failed: ${program} ${args.join(' ')}${suffix}`);
  }
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
