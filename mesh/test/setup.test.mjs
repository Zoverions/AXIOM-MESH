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
import { meshConfig } from '../src/lib/config.mjs';
import * as setupRuntime from '../src/setup.mjs';

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
  assert.equal(result.runtime.profile, 'primary');
  assert.equal(result.runtime.ci_pin, '24.18.0');
  assert.equal(result.runtime.production_pin, '24.19.0');
  assert.equal(result.workspaces, 2);
  assert.equal(result.dependency_packages, 0);
  assert.equal(result.install_scripts_allowed, false);
  assert.equal(result.setup_status, 'ready');
  assert.equal(result.production_credentials_created, false);
});

test('Rebel hosting compatibility accepts Node 22.23.2 with its bundled npm 10.9.8', async () => {
  const result = await verifyRepositorySetup({
    repositoryRoot: REPOSITORY_ROOT,
    nodeVersion: 'v22.23.2',
    npmVersion: '10.9.8',
    npmCliPath: 'synthetic-unused'
  });

  assert.equal(result.valid, true);
  assert.equal(result.runtime.node, '22.23.2');
  assert.equal(result.runtime.npm, '10.9.8');
  assert.equal(result.runtime.profile, 'compatibility');
  assert.equal(result.runtime.ci_pin, '24.18.0');
  assert.equal(result.runtime.production_pin, '24.19.0');
  assert.equal(result.production_credentials_created, false);
});

test('Node 22 compatibility also accepts the unchanged npm 11 lane', async () => {
  const input = await fixture();
  const result = validateSourceSetupState({
    ...input,
    nodeVersion: '22.23.2',
    npmVersion: '11.9.0'
  });

  assert.equal(result.runtime.profile, 'compatibility');
  assert.equal(result.runtime.npm, '11.9.0');
});

test('supported runtime profiles reject unreviewed majors and outdated Node 22 patches', async () => {
  const input = await fixture();

  for (const nodeVersion of ['20.20.2', '21.9.0', '22.23.1', '23.11.1', '24.13.9', '25.0.0']) {
    assert.throws(
      () => validateSourceSetupState({
        ...input,
        nodeVersion,
        npmVersion: nodeVersion.startsWith('22.') ? '10.9.8' : '11.9.0'
      }),
      /Node\.js .* is outside/,
      `unsupported Node.js ${nodeVersion} was accepted`
    );
  }
});

test('npm 10 compatibility remains isolated from the protected Node 24 profile', async () => {
  const input = await fixture();

  assert.throws(
    () => validateSourceSetupState({
      ...input,
      nodeVersion: '22.23.2',
      npmVersion: '10.9.7'
    }),
    /npm .* is outside/
  );
  assert.throws(
    () => validateSourceSetupState({
      ...input,
      nodeVersion: '24.18.0',
      npmVersion: '10.9.8'
    }),
    /npm .* is outside/
  );
});

test('production runtime guard permits only the approved Node 22 host pin and protected Node 24 range', () => {
  assert.equal(setupRuntime.assertProductionRuntime('v22.23.2'), '22.23.2');
  assert.equal(setupRuntime.assertProductionRuntime('v24.18.0'), '24.18.0');
  assert.equal(setupRuntime.assertProductionRuntime('24.19.0'), '24.19.0');

  for (const nodeVersion of ['20.20.2', '22.23.1', '22.23.3', '22.24.0', '23.11.1', '24.13.9', '25.0.0']) {
    assert.throws(
      () => setupRuntime.assertProductionRuntime(nodeVersion),
      /production requires Node\.js 22\.23\.2 exactly or >=24\.14\.0 <25/i,
      `unapproved production Node.js ${nodeVersion} was accepted`
    );
  }
});

test('production hosting approval does not relax bootstrap, mutual TLS, or credential-directory requirements', () => {
  assert.throws(
    () => meshConfig({ environment: 'production', autoBootstrap: true }),
    /AXIOM_AUTO_BOOTSTRAP must be false in production/
  );
  assert.throws(
    () => meshConfig({
      environment: 'production',
      autoBootstrap: false,
      internalTlsEnabled: false
    }),
    /Production internal services require mutually authenticated TLS/
  );
  assert.throws(
    () => meshConfig({
      environment: 'production',
      autoBootstrap: false,
      internalTlsEnabled: true,
      transportDir: ''
    }),
    /AXIOM_TRANSPORT_DIR is required when internal TLS is enabled/
  );
});

test('production supervisor enforces the protected runtime before deployment side effects', async () => {
  const supervisor = await readFile(join(REPOSITORY_ROOT, 'mesh', 'src', 'supervisor.mjs'), 'utf8');
  assert.match(supervisor, /import \{ assertProductionRuntime \} from '\.\/setup\.mjs';/);
  const guardPosition = supervisor.indexOf('assertProductionRuntime();');
  const egressPosition = supervisor.indexOf('if (config.requireDenyEgress)');
  assert.ok(guardPosition >= 0, 'production supervisor must enforce its protected runtime');
  assert.ok(guardPosition < egressPosition, 'runtime guard must run before deployment side effects');
});

test('doctor diagnostics explain the exact approved hosted-production pin and protected Node 24 track', async () => {
  const doctor = await readFile(join(REPOSITORY_ROOT, 'mesh', 'src', 'doctor.mjs'), 'utf8');
  assert.match(doctor, />=22\.23\.2 <23 \|\| >=24\.14\.0 <25/);
  assert.match(doctor, /npm >=10\.9\.8 <11/);
  assert.match(doctor, /production supports pinned Node 22\.23\.2 and Node 24/i);
});

test('hosted production runtime policy is an exact separately reviewed Node 22 pin', async () => {
  const { policy } = await fixture();
  assert.equal(policy.runtime.hosted_production_version, '22.23.2');

  for (const unapprovedVersion of ['22.23.1', '22.23.3', '22.24.0', '24.19.0']) {
    const changed = structuredClone(policy);
    changed.runtime.hosted_production_version = unapprovedVersion;
    assert.throws(
      () => validateSourceSetupPolicy(changed),
      /runtime policy (?:weakens|fields are invalid)/,
      `unreviewed hosted production pin ${unapprovedVersion} was accepted`
    );
  }

  const missing = structuredClone(policy);
  delete missing.runtime.hosted_production_version;
  assert.throws(
    () => validateSourceSetupPolicy(missing),
    /runtime policy fields are invalid/
  );
});

test('setup policy rejects weaker runtimes, package managers, install arguments, workspaces, and verification', async () => {
  const { policy } = await fixture();

  const runtime = structuredClone(policy);
  runtime.runtime.minimum_version = '24.0.0';
  assert.throws(
    () => validateSourceSetupPolicy(runtime),
    /runtime policy weakens/
  );

  const compatibilityRuntime = structuredClone(policy);
  compatibilityRuntime.runtime.compatibility_minimum_version = '22.0.0';
  assert.throws(
    () => validateSourceSetupPolicy(compatibilityRuntime),
    /runtime policy (?:weakens|fields are invalid)/
  );

  const compatibilityPackageManager = structuredClone(policy);
  compatibilityPackageManager.package_manager.compatibility_minimum_version = '10.0.0';
  assert.throws(
    () => validateSourceSetupPolicy(compatibilityPackageManager),
    /package-manager policy (?:weakens|fields are invalid)/
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
        'node-version: "22.23.2"',
        'node-version: "22.23.1"'
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
