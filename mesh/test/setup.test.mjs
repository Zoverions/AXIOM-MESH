import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import {
  installRepositorySetup,
  validateSourceSetupPolicy,
  validateSourceSetupState,
  verifyRepositorySetup
} from '../src/setup.mjs';

const MESH_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const REPOSITORY_ROOT = dirname(MESH_ROOT);

test('current-build setup preflight verifies runtime pins, exact locks, and zero dependencies', async () => {
  const result = await verifyRepositorySetup({
    repositoryRoot: REPOSITORY_ROOT,
    nodeVersion: 'v24.18.0',
    npmVersion: '11.9.0',
    npmCliPath: 'synthetic-unused'
  });

  assert.equal(result.valid, true);
  assert.equal(result.schema, 'axiom-source-setup-policy.v1');
  assert.equal(result.kernel_version, '0.12.0-dev.4');
  assert.equal(result.runtime.node, '24.18.0');
  assert.equal(result.runtime.npm, '11.9.0');
  assert.equal(result.runtime.ci_pin, '24.18.0');
  assert.equal(result.runtime.production_pin, '24.19.0');
  assert.equal(result.workspaces, 2);
  assert.equal(result.dependency_packages, 0);
  assert.equal(result.install_scripts_allowed, false);
  assert.equal(result.setup_status, 'ready');
  assert.equal(result.production_credentials_created, false);
});

test('setup policy rejects weaker runtimes, package managers, install arguments, workspaces, and verification', async () => {
  const { policy } = await fixture();

  const runtime = structuredClone(policy);
  runtime.runtime.minimum_version = '24.0.0';
  assert.throws(
    () => validateSourceSetupPolicy(runtime),
    /runtime policy weakens/
  );

  const packageManager = structuredClone(policy);
  packageManager.package_manager.maximum_major_exclusive = 13;
  assert.throws(
    () => validateSourceSetupPolicy(packageManager),
    /package-manager policy weakens/
  );

  const argumentsDrift = structuredClone(policy);
  argumentsDrift.package_manager.install_arguments.push('--force');
  assert.throws(
    () => validateSourceSetupPolicy(argumentsDrift),
    /package-manager policy weakens/
  );

  const missingWorkspace = structuredClone(policy);
  missingWorkspace.workspaces.pop();
  assert.throws(
    () => validateSourceSetupPolicy(missingWorkspace),
    /workspaces are incomplete/
  );

  const skippedRelease = structuredClone(policy);
  skippedRelease.verification.release_command = 'npm run check';
  assert.throws(
    () => validateSourceSetupPolicy(skippedRelease),
    /release verification is invalid/
  );
});

test('setup state rejects unsupported versions, dependencies, lifecycle scripts, and lock drift', async () => {
  const { policy, rootPackage, rootLock, kernelPackage, kernelLock } = await fixture();

  const oldNode = state(policy, rootPackage, rootLock, kernelPackage, kernelLock, {
    nodeVersion: 'v24.13.9'
  });
  assert.throws(() => validateSourceSetupState(oldNode), /Node.js version is unsupported/);

  const futureNode = state(policy, rootPackage, rootLock, kernelPackage, kernelLock, {
    nodeVersion: 'v25.0.0'
  });
  assert.throws(() => validateSourceSetupState(futureNode), /Node.js version is unsupported/);

  const oldNpm = state(policy, rootPackage, rootLock, kernelPackage, kernelLock, {
    npmVersion: '10.9.0'
  });
  assert.throws(() => validateSourceSetupState(oldNpm), /npm version is unsupported/);

  const rootDependency = structuredClone(rootLock);
  rootDependency.packages['node_modules/example'] = { version: '1.0.0' };
  assert.throws(
    () => validateSourceSetupState(state(policy, rootPackage, rootDependency, kernelPackage, kernelLock)),
    /dependency packages are unsupported/
  );

  const lifecyclePackage = structuredClone(rootPackage);
  lifecyclePackage.scripts.preinstall = 'node bad.mjs';
  assert.throws(
    () => validateSourceSetupState(state(policy, lifecyclePackage, rootLock, kernelPackage, kernelLock)),
    /lifecycle scripts are forbidden/
  );

  const lockDrift = structuredClone(kernelLock);
  lockDrift.packages[''].version = '9.9.9';
  assert.throws(
    () => validateSourceSetupState(state(policy, rootPackage, rootLock, kernelPackage, lockDrift)),
    /package metadata is invalid/
  );
});

test('setup state binds local, CI, and production runtime pins', async () => {
  const { policy, rootPackage, rootLock, kernelPackage, kernelLock } = await fixture();
  const local = validateSourceSetupState(state(policy, rootPackage, rootLock, kernelPackage, kernelLock, {
    nodeVersion: process.version,
    npmVersion: '11.9.0'
  }));
  const ci = validateSourceSetupState(state(policy, rootPackage, rootLock, kernelPackage, kernelLock, {
    nodeVersion: `v${policy.runtime.ci_version}`,
    npmVersion: '11.9.0'
  }));
  const production = validateSourceSetupState(state(policy, rootPackage, rootLock, kernelPackage, kernelLock, {
    nodeVersion: `v${policy.runtime.production_version}`,
    npmVersion: '11.9.0'
  }));
  assert.equal(local.valid, true);
  assert.equal(ci.valid, true);
  assert.equal(production.valid, true);
});

test('setup installer executes only fixed lock installs and optional fixed verification commands', async () => {
  const { policy, rootPackage, rootLock, kernelPackage, kernelLock } = await fixture();
  const commands = [];
  const result = await installRepositorySetup({
    repositoryRoot: REPOSITORY_ROOT,
    nodeVersion: 'v24.18.0',
    npmVersion: '11.9.0',
    npmCliPath: 'synthetic-npm',
    verify: true,
    execute: async (command, args, options) => {
      commands.push({ command, args, cwd: options.cwd });
    },
    sourceState: state(policy, rootPackage, rootLock, kernelPackage, kernelLock)
  });
  assert.equal(result.valid, true);
  assert.equal(result.installation, 'completed-from-committed-locks');
  assert.equal(result.full_verification_completed, true);
  assert.deepEqual(commands.map(item => item.args), [
    ['ci', '--ignore-scripts', '--no-audit', '--no-fund'],
    ['ci', '--ignore-scripts', '--no-audit', '--no-fund'],
    ['run', 'check'],
    ['run', 'release:verify']
  ]);
});

async function fixture() {
  const [policy, rootPackage, rootLock, kernelPackage, kernelLock] = await Promise.all([
    json(join(MESH_ROOT, 'config', 'setup.json')),
    json(join(REPOSITORY_ROOT, 'package.json')),
    json(join(REPOSITORY_ROOT, 'package-lock.json')),
    json(join(MESH_ROOT, 'package.json')),
    json(join(MESH_ROOT, 'package-lock.json'))
  ]);
  return { policy, rootPackage, rootLock, kernelPackage, kernelLock };
}

function state(policy, rootPackage, rootLock, kernelPackage, kernelLock, overrides = {}) {
  return {
    policy,
    nodeVersion: overrides.nodeVersion ?? 'v24.18.0',
    npmVersion: overrides.npmVersion ?? '11.9.0',
    npmCliPath: overrides.npmCliPath ?? 'synthetic-unused',
    workspaces: {
      command_surface: {
        packageJson: rootPackage,
        packageLock: rootLock
      },
      kernel: {
        packageJson: kernelPackage,
        packageLock: kernelLock
      }
    }
  };
}

async function json(path) {
  return JSON.parse(await readFile(path, 'utf8'));
}
