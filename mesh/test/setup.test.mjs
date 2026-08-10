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
  assert.equal(result.kernel_version, '0.12.0-dev.3');
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
    /verification policy weakens/
  );
});

test('setup state rejects unsupported versions, dependencies, lifecycle scripts, and lock drift', async () => {
  const input = await fixture();

  assert.throws(
    () => validateSourceSetupState({
      ...input,
      nodeVersion: '24.13.0'
    }),
    /Node.js .* is outside/
  );
  assert.throws(
    () => validateSourceSetupState({
      ...input,
      npmVersion: '12.0.0'
    }),
    /npm .* is outside/
  );

  const dependency = structuredClone(input);
  dependency.rootPackage.dependencies = { unreviewed: '1.0.0' };
  assert.throws(
    () => validateSourceSetupState(dependency),
    /rejects dependencies/
  );

  const lifecycle = structuredClone(input);
  lifecycle.kernelPackage.scripts.postinstall = 'node unreviewed.mjs';
  assert.throws(
    () => validateSourceSetupState(lifecycle),
    /rejects install lifecycle script/
  );

  const lock = structuredClone(input);
  lock.kernelLock.packages['node_modules/unreviewed'] = {
    version: '1.0.0'
  };
  assert.throws(
    () => validateSourceSetupState(lock),
    /lock is invalid/
  );

  const script = structuredClone(input);
  script.rootPackage.scripts.setup = 'npm install';
  assert.throws(
    () => validateSourceSetupState(script),
    /setup command has drifted/
  );
});

test('setup state binds local, CI, and production runtime pins', async () => {
  const input = await fixture();

  assert.throws(
    () => validateSourceSetupState({
      ...input,
      nodeVersionPin: '24.19.0\n'
    }),
    /version pin has drifted/
  );
  assert.throws(
    () => validateSourceSetupState({
      ...input,
      dockerfile: input.dockerfile.replace(
        'FROM node:24.19.0-',
        'FROM node:24.20.0-'
      )
    }),
    /runtime setup pins have drifted/
  );
  assert.throws(
    () => validateSourceSetupState({
      ...input,
      workflow: input.workflow.replace(
        'npm run setup:install',
        'npm ci'
      )
    }),
    /runtime setup pins have drifted/
  );
});

test('setup installer executes only fixed lock installs and optional fixed verification commands', async () => {
  const installPlans = [];
  const installed = await installRepositorySetup({
    repositoryRoot: REPOSITORY_ROOT,
    npmVersion: '11.9.0',
    npmCliPath: 'synthetic-npm-cli',
    execute: plan => installPlans.push(plan)
  });
  assert.equal(installed.full_verification_completed, false);
  assert.equal(installed.production_credentials_created, false);
  assert.deepEqual(
    installPlans.map(item => item.arguments),
    [
      ['ci', '--ignore-scripts', '--no-audit', '--no-fund'],
      ['ci', '--ignore-scripts', '--no-audit', '--no-fund']
    ]
  );
  assert.equal(installPlans[0].cwd, REPOSITORY_ROOT);
  assert.equal(installPlans[1].cwd, join(REPOSITORY_ROOT, 'mesh'));

  const verifiedPlans = [];
  const verified = await installRepositorySetup({
    repositoryRoot: REPOSITORY_ROOT,
    verify: true,
    npmVersion: '11.9.0',
    npmCliPath: 'synthetic-npm-cli',
    execute: plan => verifiedPlans.push(plan)
  });
  assert.equal(verified.full_verification_completed, true);
  assert.deepEqual(
    verifiedPlans.slice(2).map(item => item.arguments),
    [
      ['run', 'check'],
      ['run', 'release:verify']
    ]
  );
  assert.ok(
    verifiedPlans.every(item => item.npmCliPath === 'synthetic-npm-cli')
  );
});

async function fixture() {
  const [
    policy,
    rootPackage,
    rootLock,
    kernelPackage,
    kernelLock,
    nodeVersionPin,
    dockerfile,
    workflow
  ] = await Promise.all([
    readJson(join(MESH_ROOT, 'config', 'setup.json')),
    readJson(join(REPOSITORY_ROOT, 'package.json')),
    readJson(join(REPOSITORY_ROOT, 'package-lock.json')),
    readJson(join(MESH_ROOT, 'package.json')),
    readJson(join(MESH_ROOT, 'package-lock.json')),
    readFile(join(MESH_ROOT, '.node-version'), 'utf8'),
    readFile(join(MESH_ROOT, 'Dockerfile'), 'utf8'),
    readFile(join(REPOSITORY_ROOT, '.github', 'workflows', 'kernel.yml'), 'utf8')
  ]);
  return {
    policy,
    nodeVersion: '24.18.0',
    npmVersion: '11.9.0',
    nodeVersionPin,
    rootPackage,
    rootLock,
    kernelPackage,
    kernelLock,
    dockerfile,
    workflow
  };
}

async function readJson(path) {
  return JSON.parse(await readFile(path, 'utf8'));
}
