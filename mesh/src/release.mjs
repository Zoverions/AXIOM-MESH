import { execFileSync } from 'node:child_process';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, join, relative } from 'node:path';
import { pathToFileURL } from 'node:url';
import { canonicalJson, digestObject, sha256, ValidationError } from './lib/canonical.mjs';
import { MESH_ROOT } from './lib/config.mjs';
import { validateCapabilityRegistry } from './check-registry.mjs';
import { MIGRATIONS, migrationChecksum } from './grid/migrations.mjs';
import { validatePolicy } from './lib/policy.mjs';
import {
  normalizeLineEndings,
  renderCapabilityStatus,
  verifyRegistryMarkers
} from './status.mjs';
import { CANONICAL_DOCUMENTS, verifyCanonicalDocumentation } from './check-docs.mjs';

const REPOSITORY_ROOT = dirname(MESH_ROOT);
const SUPPORTED_DEPENDENCY_MANIFESTS = new Set([
  'package.json',
  'package-lock.json',
  'mesh/package.json',
  'mesh/package-lock.json'
]);
const UNSUPPORTED_RUNTIME_PREFIXES = [
  'certs/',
  'cli/',
  'config/',
  'evidence/',
  'gateway/',
  'grid/',
  'hypervisor/',
  'kernel/',
  'live-installer/',
  'sandbox/',
  'schemas/',
  'scripts/',
  'services/',
  'shared/',
  'skills/',
  'tests/',
  'website/'
];

export async function verifyReleaseReadiness() {
  const trackedPaths = git(['ls-files']).split(/\r?\n/).filter(Boolean);
  const sourceBoundary = validateSupportedSourceBoundary(trackedPaths);
  const paths = {
    registry: join(MESH_ROOT, 'config', 'capabilities.json'),
    policy: join(MESH_ROOT, 'config', 'policy.json'),
    package: join(MESH_ROOT, 'package.json'),
    lock: join(MESH_ROOT, 'package-lock.json'),
    rootPackage: join(REPOSITORY_ROOT, 'package.json'),
    rootLock: join(REPOSITORY_ROOT, 'package-lock.json'),
    operatorSurface: join(MESH_ROOT, 'config', 'operator-surface.json'),
    status: join(REPOSITORY_ROOT, 'docs', 'rebuild', 'STATUS.md'),
    rollback: join(REPOSITORY_ROOT, 'docs', 'rebuild', 'ROLLBACK.md'),
    dockerfile: join(MESH_ROOT, 'Dockerfile'),
    dockerignore: join(MESH_ROOT, '.dockerignore'),
    compose: join(MESH_ROOT, 'compose.production.yml'),
    productionDocs: join(MESH_ROOT, 'PRODUCTION.md'),
    workflow: join(REPOSITORY_ROOT, '.github', 'workflows', 'kernel.yml'),
    repositoryIgnore: join(REPOSITORY_ROOT, '.gitignore')
  };
  const [
    registry,
    policy,
    packageJson,
    lock,
    rootPackage,
    rootLock,
    operatorSurface,
    status,
    rollback,
    dockerfile,
    dockerignore,
    compose,
    productionDocs,
    workflow,
    repositoryIgnore
  ] = await Promise.all([
    readJson(paths.registry),
    readJson(paths.policy),
    readJson(paths.package),
    readJson(paths.lock),
    readJson(paths.rootPackage),
    readJson(paths.rootLock),
    readJson(paths.operatorSurface),
    readFile(paths.status, 'utf8'),
    readFile(paths.rollback, 'utf8'),
    readFile(paths.dockerfile, 'utf8'),
    readFile(paths.dockerignore, 'utf8'),
    readFile(paths.compose, 'utf8'),
    readFile(paths.productionDocs, 'utf8'),
    readFile(paths.workflow, 'utf8'),
    readFile(paths.repositoryIgnore, 'utf8')
  ]);
  const registryResult = validateCapabilityRegistry(registry);
  validatePolicy(policy);
  if (packageJson.version !== registry.kernel_version || lock.version !== packageJson.version) {
    throw new ValidationError('Package, lockfile, and capability registry versions must match');
  }
  if (lock.packages?.['']?.version !== packageJson.version) {
    throw new ValidationError('Lockfile root package version is stale');
  }
  if (
    rootPackage.version !== packageJson.version
    || rootLock.version !== packageJson.version
    || rootLock.packages?.['']?.version !== packageJson.version
  ) {
    throw new ValidationError('Repository command-surface package metadata is stale');
  }
  await verifyOperatorSurface(operatorSurface, {
    packageJson,
    policy,
    gatewaySource: await readFile(join(MESH_ROOT, 'src', 'gateway', 'server.mjs'), 'utf8'),
    executorSource: await readFile(join(MESH_ROOT, 'src', 'sandbox', 'executor.mjs'), 'utf8'),
    operatorDocs: await readFile(join(MESH_ROOT, 'README.md'), 'utf8')
  });
  const documentation = await verifyCanonicalDocumentation(REPOSITORY_ROOT);
  const dependencies = Object.keys(lock.packages ?? {}).filter(key => key !== '');
  if (dependencies.length) {
    throw new ValidationError(`Kernel runtime lock contains unexpected packages: ${dependencies.join(', ')}`);
  }
  const rootDependencies = Object.keys(rootLock.packages ?? {}).filter(key => key !== '');
  if (rootDependencies.length) {
    throw new ValidationError(
      `Repository command-surface lock contains unexpected packages: ${rootDependencies.join(', ')}`
    );
  }
  if (normalizeLineEndings(status) !== normalizeLineEndings(renderCapabilityStatus(registry))) {
    throw new ValidationError('Generated capability status is stale');
  }
  await verifyRegistryMarkers(REPOSITORY_ROOT, registry);
  if (!rollback.includes('## Rollback procedure') || !rollback.includes('## Migration compatibility')) {
    throw new ValidationError('Rollback plan is incomplete');
  }
  const deployment = verifyProductionDeployment({
    dockerfile,
    dockerignore,
    compose,
    productionDocs,
    packageJson,
    workflow,
    repositoryIgnore
  });
  for (const capability of registry.capabilities.filter(item => item.status === 'implemented')) {
    for (const evidence of capability.evidence) {
      await readFile(join(REPOSITORY_ROOT, evidence));
    }
  }
  const migrationEvidence = MIGRATIONS.map((migration, index) => {
    if (migration.version !== index + 1) throw new ValidationError('Database migrations must be contiguous');
    return {
      version: migration.version,
      name: migration.name,
      checksum: migrationChecksum(migration)
    };
  });
  const activeWorkflows = (await readdir(join(REPOSITORY_ROOT, '.github', 'workflows')))
    .filter(name => name.endsWith('.yml') || name.endsWith('.yaml'))
    .sort();
  if (canonicalJson(activeWorkflows) !== canonicalJson(['kernel.yml'])) {
    throw new ValidationError('Unsupported legacy GitHub workflows are still active');
  }
  const inputs = await sourceInputs([
    join(MESH_ROOT, 'src'),
    join(MESH_ROOT, 'config'),
    join(MESH_ROOT, 'test'),
    join(MESH_ROOT, 'README.md'),
    join(MESH_ROOT, '.node-version'),
    paths.package,
    paths.lock,
    paths.rootPackage,
    paths.rootLock,
    join(REPOSITORY_ROOT, 'README.md'),
    join(REPOSITORY_ROOT, 'CONSTITUTION.md'),
    join(REPOSITORY_ROOT, 'docs', 'rebuild', 'PRODUCT-DEFINITION.md'),
    join(REPOSITORY_ROOT, 'docs', 'rebuild', 'REQUIREMENTS.md'),
    join(REPOSITORY_ROOT, 'docs', 'rebuild', 'SOURCE-TRACEABILITY.md'),
    paths.status,
    paths.rollback,
    paths.dockerfile,
    paths.dockerignore,
    paths.compose,
    paths.productionDocs,
    paths.workflow,
    paths.repositoryIgnore,
    ...CANONICAL_DOCUMENTS.map(path => join(REPOSITORY_ROOT, path))
  ]);
  const commit = git(['rev-parse', 'HEAD']);
  const dirty = git(['status', '--porcelain']).length > 0;
  const generatedAt = new Date().toISOString();
  const sbom = {
    spdxVersion: 'SPDX-2.3',
    dataLicense: 'CC0-1.0',
    SPDXID: 'SPDXRef-DOCUMENT',
    name: `AXIOM-MESH-kernel-${packageJson.version}`,
    documentNamespace: `https://github.com/Zoverions/AXIOM-MESH/spdx/${packageJson.version}/${commit}`,
    creationInfo: {
      created: generatedAt,
      creators: ['Tool: mesh/src/release.mjs']
    },
    packages: [
      {
        name: packageJson.name,
        SPDXID: 'SPDXRef-Package-kernel',
        versionInfo: packageJson.version,
        downloadLocation: 'NOASSERTION',
        filesAnalyzed: false,
        supplier: 'NOASSERTION'
      },
      {
        name: deployment.base_image,
        SPDXID: 'SPDXRef-Package-node-base-image',
        versionInfo: deployment.base_image.replace(/^node:/, ''),
        downloadLocation: 'https://hub.docker.com/_/node',
        filesAnalyzed: false,
        supplier: 'Organization: Node.js Docker Official Image',
        checksums: [{
          algorithm: 'SHA256',
          checksumValue: deployment.base_digest.replace(/^sha256:/, '')
        }]
      }
    ],
    relationships: [{
      spdxElementId: 'SPDXRef-Package-kernel',
      relationshipType: 'DEPENDS_ON',
      relatedSpdxElement: 'SPDXRef-Package-node-base-image'
    }]
  };
  const provenance = {
    format: 'axiom-release-evidence.v1',
    generated_at: generatedAt,
    kernel_version: packageJson.version,
    source: {
      commit,
      dirty
    },
    verification: {
      command: 'npm run check',
      required_before_evidence_write: true
    },
    source_boundary: sourceBoundary,
    documentation,
    registry: {
      digest: registryResult.digest,
      verified_at: registry.verified_at,
      counts: registryResult.counts
    },
    policy_digest: digestObject(policy),
    operator_surface_digest: digestObject(operatorSurface),
    deployment,
    migrations: migrationEvidence,
    rollback: {
      path: relative(REPOSITORY_ROOT, paths.rollback),
      sha256: sha256(rollback)
    },
    inputs
  };
  return {
    valid: true,
    version: packageJson.version,
    commit,
    dirty,
    registry: registryResult,
    deployment,
    documentation,
    source_boundary: sourceBoundary,
    migrations: migrationEvidence.length,
    inputs: inputs.length,
    sbom,
    provenance
  };
}

export function verifyProductionDeployment({
  dockerfile,
  dockerignore,
  compose,
  productionDocs,
  packageJson,
  workflow,
  repositoryIgnore
}) {
  const pinnedBase = dockerfile.match(
    /^FROM (node:24\.18\.0-alpine3\.23)@(sha256:[a-f0-9]{64})$/m
  );
  if (!pinnedBase) {
    throw new ValidationError('Production Dockerfile must use the approved digest-pinned Node.js base');
  }
  for (const required of [
    'USER 10001:10001',
    'HEALTHCHECK ',
    'ENTRYPOINT ["node", "src/supervisor.mjs"]'
  ]) {
    if (!dockerfile.includes(required)) {
      throw new ValidationError(`Production Dockerfile is missing: ${required}`);
    }
  }
  if (/FROM\s+\S+:latest\b/i.test(dockerfile)) {
    throw new ValidationError('Production Dockerfile may not use a latest tag');
  }
  for (const excluded of ['.data', 'node_modules', 'test', 'production-data', 'production-secrets']) {
    if (!dockerignore.split(/\r?\n/).includes(excluded)) {
      throw new ValidationError(`Production Docker context does not exclude: ${excluded}`);
    }
  }
  for (const excluded of [
    'production-data/',
    'production-secrets/',
    'api-tokens.json',
    'operator.token'
  ]) {
    if (!repositoryIgnore.split(/\r?\n/).includes(excluded)) {
      throw new ValidationError(`Repository ignore policy does not exclude: ${excluded}`);
    }
  }
  for (const required of [
    `image: axiom-mesh-kernel:${packageJson.version}`,
    'user: "10001:10001"',
    'read_only: true',
    'cap_drop:',
    '- ALL',
    'no-new-privileges:true',
    'pids_limit:',
    'mem_limit:',
    'cpus:',
    '127.0.0.1:${AXIOM_GATEWAY_PORT_HOST:-8080}:8080',
    'AXIOM_DATA_KEY_FILE: /run/secrets/data-protection.key',
    'AXIOM_API_TOKENS_FILE: /run/secrets/api-tokens.json',
    'healthcheck:',
    'driver: bridge',
    'com.docker.network.bridge.host_binding_ipv4: "127.0.0.1"'
  ]) {
    if (!compose.includes(required)) {
      throw new ValidationError(`Production compose policy is missing: ${required}`);
    }
  }
  if (
    /privileged:\s*true/.test(compose)
    || /network_mode:\s*host/.test(compose)
    || /pid:\s*host/.test(compose)
  ) {
    throw new ValidationError('Production compose policy contains a forbidden host-privilege setting');
  }
  for (const boundary of [
    'four supervised Node.js processes',
    '`operations:read`',
    'Compose does not enforce deny-egress',
    '40 measured',
    'Host mode does not enforce the candidate two-CPU ceiling',
    'not evidence of a live deployment'
  ]) {
    if (!productionDocs.includes(boundary)) {
      throw new ValidationError(`Production operator documentation is missing boundary: ${boundary}`);
    }
  }
  for (const required of [
    'branches: ["main"]',
    'node-version: "24.18.0"',
    'npm ci --ignore-scripts',
    'node src/recovery-drill.mjs',
    'node src/slo-drill.mjs',
    'actions/upload-artifact@v7',
    'axiom-recovery-drill-evidence-${{ github.sha }}',
    'axiom-slo-baseline-evidence-${{ github.sha }}',
    `docker build --pull=false --tag axiom-mesh-kernel:${packageJson.version} .`,
    'docker compose -f compose.production.yml up --detach --no-build',
    'docker compose -f compose.production.yml down --volumes --remove-orphans'
  ]) {
    if (!workflow.includes(required)) {
      throw new ValidationError(`Kernel CI workflow is missing: ${required}`);
    }
  }
  return {
    schema: 'axiom-deployment-policy.v1',
    base_image: pinnedBase[1],
    base_digest: pinnedBase[2],
    dockerfile_sha256: sha256(dockerfile),
    dockerignore_sha256: sha256(dockerignore),
    compose_sha256: sha256(compose),
    documentation_sha256: sha256(productionDocs),
    workflow_sha256: sha256(workflow)
  };
}

export async function verifyOperatorSurface(surface, {
  packageJson,
  policy,
  gatewaySource,
  executorSource,
  operatorDocs
}) {
  if (surface?.schema !== 'axiom-operator-surface.v1') {
    throw new ValidationError('Operator surface schema is invalid');
  }
  if (surface.kernel_version !== packageJson.version) {
    throw new ValidationError('Operator surface kernel version is stale');
  }
  if (
    !Array.isArray(surface.public_endpoints)
    || !Array.isArray(surface.intent_actions)
    || !surface.public_endpoints.length
    || !surface.intent_actions.length
  ) throw new ValidationError('Operator surface is incomplete');
  assertUnique(surface.public_endpoints, 'operator endpoints');
  assertUnique(surface.intent_actions, 'operator actions');
  for (const endpoint of surface.public_endpoints) {
    const separator = endpoint.indexOf(' ');
    const method = endpoint.slice(0, separator);
    const path = endpoint.slice(separator + 1);
    if (!gatewaySource.includes(`router.add('${method}', '${path}'`)) {
      throw new ValidationError(`Operator endpoint is not implemented: ${endpoint}`);
    }
    if (!operatorDocs.includes(`- \`${endpoint}\``)) {
      throw new ValidationError(`Operator endpoint is not documented: ${endpoint}`);
    }
  }
  for (const action of surface.intent_actions) {
    if (!Object.hasOwn(policy.actions, action)) {
      throw new ValidationError(`Operator action is missing from policy: ${action}`);
    }
    if (!executorSource.includes(`'${action}'`)) {
      throw new ValidationError(`Operator action is not implemented: ${action}`);
    }
    if (!operatorDocs.includes(`- \`${action}\``)) {
      throw new ValidationError(`Operator action is not documented: ${action}`);
    }
  }
  return {
    valid: true,
    endpoints: surface.public_endpoints.length,
    actions: surface.intent_actions.length,
    digest: digestObject(surface)
  };
}

function assertUnique(values, label) {
  if (values.some(value => typeof value !== 'string' || value.length < 3 || value.length > 200)) {
    throw new ValidationError(`${label} contain an invalid value`);
  }
  if (new Set(values).size !== values.length) throw new ValidationError(`${label} contain duplicates`);
}

export function validateSupportedSourceBoundary(trackedPaths) {
  if (!Array.isArray(trackedPaths) || trackedPaths.some(path => typeof path !== 'string')) {
    throw new ValidationError('Tracked source paths must be an array of strings');
  }
  const unsupported = trackedPaths.filter(path => (
    UNSUPPORTED_RUNTIME_PREFIXES.some(prefix => path.startsWith(prefix))
    || (isDependencyManifest(path) && !SUPPORTED_DEPENDENCY_MANIFESTS.has(path))
  ));
  if (unsupported.length) {
    throw new ValidationError(
      `Unsupported legacy runtime or dependency paths are tracked: ${unsupported.slice(0, 10).join(', ')}`
    );
  }
  return {
    valid: true,
    tracked_paths: trackedPaths.length,
    dependency_manifests: [...SUPPORTED_DEPENDENCY_MANIFESTS].sort()
  };
}

function isDependencyManifest(path) {
  const name = path.split('/').at(-1);
  return (
    name === 'package.json'
    || name === 'package-lock.json'
    || name === 'go.mod'
    || name === 'go.sum'
    || name === 'Cargo.toml'
    || name === 'Cargo.lock'
    || /^requirements(?:[-_.].*)?\.txt$/i.test(name)
  );
}

async function sourceInputs(entries) {
  const files = [];
  for (const entry of entries) {
    const stat = await import('node:fs/promises').then(module => module.stat(entry));
    if (stat.isDirectory()) {
      const children = await readdir(entry, { recursive: true, withFileTypes: true });
      for (const child of children) {
        if (child.isFile()) files.push(join(child.parentPath, child.name));
      }
    } else {
      files.push(entry);
    }
  }
  files.sort();
  return Promise.all(files.map(async path => ({
    path: relative(REPOSITORY_ROOT, path),
    sha256: sha256(await readFile(path))
  })));
}

function git(args) {
  return execFileSync('git', args, {
    cwd: REPOSITORY_ROOT,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore']
  }).trim();
}

async function readJson(path) {
  return JSON.parse(await readFile(path, 'utf8'));
}

async function main() {
  const result = await verifyReleaseReadiness();
  if (process.argv.includes('--write')) {
    if (result.dirty && process.env.AXIOM_ALLOW_DIRTY_RELEASE !== 'true') {
      throw new ValidationError('Release evidence requires a clean Git worktree');
    }
    const directory = join(MESH_ROOT, '.data', 'release', result.version);
    await mkdir(directory, { recursive: true, mode: 0o700 });
    await Promise.all([
      writeFile(join(directory, 'sbom.spdx.json'), `${canonicalJson(result.sbom)}\n`, { mode: 0o600 }),
      writeFile(join(directory, 'provenance.json'), `${canonicalJson(result.provenance)}\n`, { mode: 0o600 })
    ]);
    process.stdout.write(`${JSON.stringify({
      valid: true,
      version: result.version,
      directory
    }, null, 2)}\n`);
    return;
  }
  const printable = { ...result };
  delete printable.sbom;
  delete printable.provenance;
  process.stdout.write(`${JSON.stringify(printable, null, 2)}\n`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
