import { spawnSync } from 'node:child_process';
import { lstat, readFile } from 'node:fs/promises';
import { dirname, isAbsolute, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  canonicalJson,
  digestObject,
  ValidationError
} from './lib/canonical.mjs';
import { MESH_ROOT } from './lib/config.mjs';

export const SOURCE_SETUP_POLICY_SCHEMA = 'axiom-source-setup-policy.v1';

const REPOSITORY_ROOT = dirname(MESH_ROOT);
const ENGINE = '>=24.14.0 <25';
const INSTALL_ARGUMENTS = Object.freeze([
  'ci',
  '--ignore-scripts',
  '--no-audit',
  '--no-fund'
]);
const WORKSPACES = Object.freeze([
  {
    id: 'command_surface',
    path: '.',
    package_name: 'axiom-mesh'
  },
  {
    id: 'kernel',
    path: 'mesh',
    package_name: '@axiom-mesh/kernel'
  }
]);
const DEPENDENCY_FIELDS = Object.freeze([
  'dependencies',
  'devDependencies',
  'optionalDependencies',
  'peerDependencies',
  'bundleDependencies',
  'bundledDependencies'
]);
const INSTALL_LIFECYCLE_SCRIPTS = Object.freeze([
  'preinstall',
  'install',
  'postinstall',
  'prepare'
]);
const REQUIRED_ROOT_SCRIPTS = Object.freeze({
  setup: 'node mesh/src/setup.mjs install --verify',
  'setup:install': 'node mesh/src/setup.mjs install',
  'setup:check': 'node mesh/src/setup.mjs check',
  check: 'npm --prefix mesh run check',
  'release:verify': 'npm --prefix mesh run release:verify'
});
const REQUIRED_KERNEL_SCRIPTS = Object.freeze({
  setup: 'node src/setup.mjs install --verify',
  'setup:install': 'node src/setup.mjs install',
  'setup:check': 'node src/setup.mjs check',
  check:
    'node src/setup.mjs check && node src/check-service-network-policy.mjs && node src/check-gateway-client-contract.mjs && node src/check-axiom-one.mjs && node src/check-registry.mjs && node src/status.mjs && node src/check-docs.mjs && node --test --test-reporter=spec',
  'release:verify': 'node src/release.mjs'
});
const SEMVER = /^\d+\.\d+\.\d+$/;

export function validateSourceSetupPolicy(policy) {
  exactObject(policy, 'Source setup policy', [
    'schema',
    'version',
    'kernel_version',
    'runtime',
    'package_manager',
    'workspaces',
    'verification'
  ]);
  if (
    policy.schema !== SOURCE_SETUP_POLICY_SCHEMA
    || policy.version !== 1
    || !/^\d+\.\d+\.\d+(?:-[A-Za-z0-9.-]+)?$/.test(
      policy.kernel_version ?? ''
    )
  ) throw new ValidationError('Source setup policy identity is invalid');

  exactObject(policy.runtime, 'Source setup runtime policy', [
    'name',
    'engine',
    'minimum_version',
    'maximum_major_exclusive',
    'ci_version',
    'production_version'
  ]);
  if (
    policy.runtime.name !== 'node'
    || policy.runtime.engine !== ENGINE
    || policy.runtime.minimum_version !== '24.14.0'
    || policy.runtime.maximum_major_exclusive !== 25
    || policy.runtime.ci_version !== '24.18.0'
    || policy.runtime.production_version !== '24.19.0'
  ) throw new ValidationError('Source setup runtime policy weakens the current build');

  exactObject(policy.package_manager, 'Source setup package-manager policy', [
    'name',
    'minimum_version',
    'maximum_major_exclusive',
    'lockfile_version',
    'install_arguments'
  ]);
  if (
    policy.package_manager.name !== 'npm'
    || policy.package_manager.minimum_version !== '11.0.0'
    || policy.package_manager.maximum_major_exclusive !== 12
    || policy.package_manager.lockfile_version !== 3
    || canonicalJson(policy.package_manager.install_arguments)
      !== canonicalJson(INSTALL_ARGUMENTS)
  ) throw new ValidationError('Source setup package-manager policy weakens deterministic installation');

  if (canonicalJson(policy.workspaces) !== canonicalJson(WORKSPACES)) {
    throw new ValidationError('Source setup workspaces are incomplete or unordered');
  }
  policy.workspaces.forEach((workspace, index) => {
    exactObject(workspace, `Source setup workspace ${index}`, [
      'id',
      'path',
      'package_name'
    ]);
  });

  exactObject(policy.verification, 'Source setup verification policy', [
    'check_command',
    'release_command',
    'requires_clean_locks',
    'expected_dependency_packages'
  ]);
  if (
    policy.verification.check_command !== 'npm run check'
    || policy.verification.release_command !== 'npm run release:verify'
    || policy.verification.requires_clean_locks !== true
    || policy.verification.expected_dependency_packages !== 0
  ) throw new ValidationError('Source setup verification policy weakens the current gates');

  return {
    valid: true,
    schema: policy.schema,
    kernel_version: policy.kernel_version,
    policy_digest: digestObject(policy),
    workspaces: policy.workspaces.length
  };
}

export function validateSourceSetupState({
  policy,
  nodeVersion,
  npmVersion,
  nodeVersionPin,
  rootPackage,
  rootLock,
  kernelPackage,
  kernelLock,
  dockerfile,
  workflow
}) {
  const policyResult = validateSourceSetupPolicy(policy);
  validateVersionInRange(
    nodeVersion,
    policy.runtime.minimum_version,
    policy.runtime.maximum_major_exclusive,
    'Node.js'
  );
  validateVersionInRange(
    npmVersion,
    policy.package_manager.minimum_version,
    policy.package_manager.maximum_major_exclusive,
    'npm'
  );
  if (nodeVersionPin.trim() !== policy.runtime.ci_version) {
    throw new ValidationError('The committed Node.js version pin has drifted');
  }

  validatePackage(
    rootPackage,
    rootLock,
    WORKSPACES[0],
    policy,
    REQUIRED_ROOT_SCRIPTS,
    false
  );
  validatePackage(
    kernelPackage,
    kernelLock,
    WORKSPACES[1],
    policy,
    REQUIRED_KERNEL_SCRIPTS,
    true
  );
  if (
    !dockerfile.startsWith(`FROM node:${policy.runtime.production_version}-`)
    || !workflow.includes(`node-version: "${policy.runtime.ci_version}"`)
    || !workflow.includes('npm run setup:install')
  ) throw new ValidationError('CI or production runtime setup pins have drifted');

  const dependencyPackages = (
    Object.keys(rootLock.packages).length
    + Object.keys(kernelLock.packages).length
    - 2
  );
  if (
    dependencyPackages
    !== policy.verification.expected_dependency_packages
  ) throw new ValidationError('Installed dependency package count is outside setup policy');

  return {
    valid: true,
    schema: policy.schema,
    kernel_version: policy.kernel_version,
    policy_digest: policyResult.policy_digest,
    runtime: {
      node: normalizeVersion(nodeVersion, 'Node.js'),
      npm: normalizeVersion(npmVersion, 'npm'),
      ci_pin: policy.runtime.ci_version,
      production_pin: policy.runtime.production_version
    },
    lockfile_version: policy.package_manager.lockfile_version,
    workspaces: policy.workspaces.length,
    dependency_packages: dependencyPackages,
    install_scripts_allowed: false,
    lock_digests: {
      root: digestObject(rootLock),
      kernel: digestObject(kernelLock)
    },
    setup_status: 'ready',
    production_credentials_created: false
  };
}

export async function verifyRepositorySetup({
  repositoryRoot = REPOSITORY_ROOT,
  nodeVersion = process.version,
  npmVersion,
  npmCliPath
} = {}) {
  const inputs = await readSetupInputs(repositoryRoot);
  const resolvedNpmCli = npmCliPath ?? await resolveNpmCli();
  const detectedNpmVersion = npmVersion ?? detectNpmVersion(resolvedNpmCli);
  return validateSourceSetupState({
    ...inputs,
    nodeVersion,
    npmVersion: detectedNpmVersion
  });
}

export async function installRepositorySetup({
  repositoryRoot = REPOSITORY_ROOT,
  verify = false,
  npmVersion,
  npmCliPath,
  execute = executeNpm
} = {}) {
  const resolvedNpmCli = npmCliPath ?? await resolveNpmCli();
  const detectedNpmVersion = npmVersion ?? detectNpmVersion(resolvedNpmCli);
  const before = await verifyRepositorySetup({
    repositoryRoot,
    npmVersion: detectedNpmVersion,
    npmCliPath: resolvedNpmCli
  });
  const policy = JSON.parse(
    await readFile(join(repositoryRoot, 'mesh', 'config', 'setup.json'), 'utf8')
  );

  for (const workspace of policy.workspaces) {
    execute({
      npmCliPath: resolvedNpmCli,
      cwd: join(repositoryRoot, workspace.path),
      arguments: [...policy.package_manager.install_arguments]
    });
  }
  const after = await verifyRepositorySetup({
    repositoryRoot,
    npmVersion: detectedNpmVersion,
    npmCliPath: resolvedNpmCli
  });
  if (canonicalJson(before.lock_digests) !== canonicalJson(after.lock_digests)) {
    throw new ValidationError('Deterministic installation changed a committed lock');
  }

  if (verify) {
    execute({
      npmCliPath: resolvedNpmCli,
      cwd: repositoryRoot,
      arguments: ['run', 'check']
    });
    execute({
      npmCliPath: resolvedNpmCli,
      cwd: repositoryRoot,
      arguments: ['run', 'release:verify']
    });
  }
  return {
    ...after,
    installation: 'completed-from-committed-locks',
    full_verification_completed: verify,
    production_credentials_created: false
  };
}

function validatePackage(
  packageJson,
  lock,
  workspace,
  policy,
  requiredScripts,
  requireModule
) {
  if (
    packageJson.name !== workspace.package_name
    || packageJson.version !== policy.kernel_version
    || packageJson.private !== true
    || packageJson.engines?.node !== policy.runtime.engine
    || (requireModule && packageJson.type !== 'module')
  ) throw new ValidationError(`Source setup package metadata is invalid: ${workspace.id}`);

  for (const field of DEPENDENCY_FIELDS) {
    if (
      Object.hasOwn(packageJson, field)
      && (
        !plainObject(packageJson[field])
        || Object.keys(packageJson[field]).length !== 0
      )
    ) throw new ValidationError(`Source setup rejects ${field}: ${workspace.id}`);
  }
  for (const script of INSTALL_LIFECYCLE_SCRIPTS) {
    if (Object.hasOwn(packageJson.scripts ?? {}, script)) {
      throw new ValidationError(
        `Source setup rejects install lifecycle script ${script}: ${workspace.id}`
      );
    }
  }
  for (const [name, command] of Object.entries(requiredScripts)) {
    if (packageJson.scripts?.[name] !== command) {
      throw new ValidationError(`Source setup command has drifted: ${workspace.id}:${name}`);
    }
  }

  exactObject(lock, `Source setup lock ${workspace.id}`, [
    'name',
    'version',
    'lockfileVersion',
    'requires',
    'packages'
  ]);
  if (
    lock.name !== workspace.package_name
    || lock.version !== policy.kernel_version
    || lock.lockfileVersion !== policy.package_manager.lockfile_version
    || lock.requires !== true
    || !plainObject(lock.packages)
    || canonicalJson(Object.keys(lock.packages)) !== canonicalJson([''])
  ) throw new ValidationError(`Source setup lock is invalid: ${workspace.id}`);
  exactObject(lock.packages[''], `Source setup lock root ${workspace.id}`, [
    'name',
    'version',
    'engines'
  ]);
  if (
    lock.packages[''].name !== workspace.package_name
    || lock.packages[''].version !== policy.kernel_version
    || canonicalJson(lock.packages[''].engines)
      !== canonicalJson({ node: policy.runtime.engine })
  ) throw new ValidationError(`Source setup lock root is stale: ${workspace.id}`);
}

async function readSetupInputs(repositoryRoot) {
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
    readJson(join(repositoryRoot, 'mesh', 'config', 'setup.json')),
    readJson(join(repositoryRoot, 'package.json')),
    readJson(join(repositoryRoot, 'package-lock.json')),
    readJson(join(repositoryRoot, 'mesh', 'package.json')),
    readJson(join(repositoryRoot, 'mesh', 'package-lock.json')),
    readFile(join(repositoryRoot, 'mesh', '.node-version'), 'utf8'),
    readFile(join(repositoryRoot, 'mesh', 'Dockerfile'), 'utf8'),
    readFile(join(repositoryRoot, '.github', 'workflows', 'kernel.yml'), 'utf8')
  ]);
  return {
    policy,
    rootPackage,
    rootLock,
    kernelPackage,
    kernelLock,
    nodeVersionPin,
    dockerfile,
    workflow
  };
}

async function resolveNpmCli() {
  const candidates = [
    process.env.npm_execpath,
    join(dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js')
  ].filter(value => typeof value === 'string' && isAbsolute(value));
  for (const candidate of candidates) {
    try {
      const metadata = await lstat(candidate);
      if (metadata.isFile() && !metadata.isSymbolicLink()) return candidate;
    } catch {
      // Continue to the next trusted runtime-local candidate.
    }
  }
  throw new ValidationError(
    'npm CLI cannot be located; run setup through the documented npm command'
  );
}

function detectNpmVersion(npmCliPath) {
  const result = spawnSync(process.execPath, [npmCliPath, '--version'], {
    encoding: 'utf8',
    windowsHide: true,
    env: setupEnvironment()
  });
  if (result.status !== 0 || !SEMVER.test(result.stdout?.trim() ?? '')) {
    throw new ValidationError('npm version cannot be verified');
  }
  return result.stdout.trim();
}

function executeNpm({ npmCliPath, cwd, arguments: npmArguments }) {
  const result = spawnSync(
    process.execPath,
    [npmCliPath, ...npmArguments],
    {
      cwd,
      stdio: 'inherit',
      windowsHide: true,
      env: setupEnvironment()
    }
  );
  if (result.status !== 0) {
    throw new ValidationError(
      `Setup command failed (${npmArguments.join(' ')}) with status ${result.status ?? 'unknown'}`
    );
  }
}

function setupEnvironment() {
  return {
    ...process.env,
    npm_config_ignore_scripts: 'true',
    npm_config_audit: 'false',
    npm_config_fund: 'false',
    npm_config_update_notifier: 'false',
    npm_config_package_lock: 'true',
    npm_config_save: 'false'
  };
}

function validateVersionInRange(value, minimum, maximumMajorExclusive, name) {
  const normalized = normalizeVersion(value, name);
  const actual = versionTuple(normalized, name);
  const lower = versionTuple(minimum, `${name} minimum`);
  if (
    compareVersion(actual, lower) < 0
    || actual[0] >= maximumMajorExclusive
  ) throw new ValidationError(
    `${name} ${normalized} is outside ${minimum} <= version < ${maximumMajorExclusive}.0.0`
  );
}

function normalizeVersion(value, name) {
  const normalized = String(value ?? '').replace(/^v/, '');
  if (!SEMVER.test(normalized)) {
    throw new ValidationError(`${name} version is invalid`);
  }
  return normalized;
}

function versionTuple(value, name) {
  return normalizeVersion(value, name).split('.').map(Number);
}

function compareVersion(left, right) {
  for (let index = 0; index < 3; index += 1) {
    if (left[index] !== right[index]) return left[index] - right[index];
  }
  return 0;
}

function exactObject(value, name, keys) {
  if (
    !plainObject(value)
    || canonicalJson(Object.keys(value).sort()) !== canonicalJson([...keys].sort())
  ) throw new ValidationError(`${name} fields are invalid`);
}

function plainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

async function readJson(path) {
  try {
    return JSON.parse(await readFile(path, 'utf8'));
  } catch {
    throw new ValidationError(`Source setup input cannot be read: ${path}`);
  }
}

async function main() {
  const [command, option] = process.argv.slice(2);
  if (
    !['check', 'install'].includes(command)
    || (command === 'check' && option !== undefined)
    || (command === 'install' && ![undefined, '--verify'].includes(option))
    || process.argv.length > 4
  ) {
    throw new ValidationError(
      'Usage: node mesh/src/setup.mjs check | install [--verify]'
    );
  }
  const result = command === 'check'
    ? await verifyRepositorySetup()
    : await installRepositorySetup({ verify: option === '--verify' });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
