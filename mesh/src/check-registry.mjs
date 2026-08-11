import { lstat, readFile, realpath } from 'node:fs/promises';
import { isAbsolute, posix, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { meshConfig } from './lib/config.mjs';
import { ValidationError, digestObject } from './lib/canonical.mjs';

const STATUSES = new Set(['implemented', 'adapter_required', 'experimental', 'specified', 'disabled']);
export const CAPABILITY_REGISTRY_SCHEMA = 'axiom-capabilities.v1';
export const CAPABILITY_EVIDENCE_BINDINGS_SCHEMA = 'axiom-capability-evidence-bindings.v1';
const MESH_ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const REPOSITORY_ROOT = resolve(MESH_ROOT, '..');
const DEFAULT_BINDINGS_PATH = resolve(
  MESH_ROOT,
  'config',
  'capability-evidence-bindings.json'
);
const REQUIRED_CAPABILITIES = new Set([
  'core.intent-loop',
  'core.evidence-chain',
  'core.layered-policy',
  'ai.providers',
  'memory.graph',
  'research.autonomy',
  'tools.scientific',
  'channels.messaging',
  'identity.ssi',
  'consent.receipts',
  'capsules.registry',
  'capsules.marketplace',
  'nodes.registry',
  'nodes.discovery-scheduling',
  'storage.offers',
  'storage.backup-restore',
  'offline.causal-sync',
  'governance.local-records',
  'governance.delegation-emergency-appeals',
  'domains.education',
  'domains.health',
  'domains.government',
  'domains.business-finance',
  'workforce.task-market-payroll-legacy',
  'workforce.embodied',
  'economics.accounting',
  'economics.token-bridge-liquidity',
  'zk.proof-verifiers',
  'portability.export',
  'portability.import',
  'ui.operator-api',
  'ui.gateway-client',
  'ui.cli',
  'ui.dashboard',
  'operations.setup-automation',
  'operations.service-network-policy',
  'operations.independent-service-units',
  'operations.provider-runtime',
  'operations.pilot-dossier-verification',
  'operations.security-review-intake',
  'operations.installer-observability-release'
]);

export function validateCapabilityRegistry(registry) {
  if (!registry || !Array.isArray(registry.capabilities) || !registry.capabilities.length) {
    throw new ValidationError('Capability registry must contain capabilities');
  }
  if (registry.schema !== CAPABILITY_REGISTRY_SCHEMA) {
    throw new ValidationError(`Capability registry schema must be ${CAPABILITY_REGISTRY_SCHEMA}`);
  }
  if (!/^\d+\.\d+\.\d+(?:-[A-Za-z0-9.-]+)?$/.test(registry.kernel_version ?? '')) {
    throw new ValidationError('Capability registry kernel_version must be semantic');
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(registry.verified_at ?? '')) {
    throw new ValidationError('Capability registry verified_at must be an ISO date');
  }
  const seen = new Set();
  const counts = {};
  for (const item of registry.capabilities) {
    if (!/^[a-z][a-z0-9.-]+$/.test(item.id ?? '')) throw new ValidationError('Capability id is invalid');
    if (seen.has(item.id)) throw new ValidationError(`Duplicate capability id: ${item.id}`);
    seen.add(item.id);
    if (!STATUSES.has(item.status)) throw new ValidationError(`Invalid status for ${item.id}`);
    if (typeof item.family !== 'string' || typeof item.summary !== 'string' || item.summary.length < 20) {
      throw new ValidationError(`Capability ${item.id} is missing family or summary metadata`);
    }
    if (item.evidence !== undefined) {
      if (!Array.isArray(item.evidence) || !item.evidence.length) {
        throw new ValidationError(`Capability ${item.id} evidence must be a non-empty array`);
      }
      const evidence = item.evidence.map(path => validateEvidencePath(item.id, path));
      if (new Set(evidence).size !== evidence.length) {
        throw new ValidationError(`Capability ${item.id} contains duplicate evidence paths`);
      }
    }
    if (item.status === 'implemented') {
      if (!Array.isArray(item.evidence) || !item.evidence.length) {
        throw new ValidationError(`Implemented capability ${item.id} must name executable evidence`);
      }
      if (!item.evidence.some(isRunnableTestPath)) {
        throw new ValidationError(
          `Implemented capability ${item.id} must name at least one runnable Node test`
        );
      }
    }
    counts[item.status] = (counts[item.status] ?? 0) + 1;
  }
  const missing = [...REQUIRED_CAPABILITIES].filter(id => !seen.has(id));
  if (missing.length) throw new ValidationError(`Capability registry is missing: ${missing.join(', ')}`);
  return {
    valid: true,
    schema: registry.schema,
    kernel_version: registry.kernel_version,
    verified_at: registry.verified_at,
    digest: digestObject(registry),
    capabilities: registry.capabilities.length,
    counts
  };
}

export async function validateCapabilityEvidenceBindings(registry, {
  repositoryRoot = REPOSITORY_ROOT,
  bindingsPath = DEFAULT_BINDINGS_PATH
} = {}) {
  // Resolve the root itself before comparing descendants. Hosted Windows
  // runners can expose the temp directory through a short-name alias while
  // realpath() returns its long form, which otherwise makes an in-tree file
  // appear to escape the repository.
  const root = await realpath(resolve(repositoryRoot));
  const bindingsFile = resolve(bindingsPath);
  const bindingsRelativePath = repositoryRelativePath(root, bindingsFile, 'Capability evidence bindings');
  await validateRepositoryFile(root, bindingsRelativePath);

  let document;
  try {
    document = JSON.parse(await readFile(bindingsFile, 'utf8'));
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new ValidationError('Capability evidence bindings must contain valid JSON');
    }
    throw error;
  }
  const expectedDocumentFields = [
    'bindings',
    'kernel_version',
    'registry_digest',
    'schema'
  ];
  if (
    !document
    || typeof document !== 'object'
    || Array.isArray(document)
    || Object.keys(document).sort().join(',') !== expectedDocumentFields.join(',')
  ) {
    throw new ValidationError('Capability evidence bindings fields are invalid');
  }
  if (document.schema !== CAPABILITY_EVIDENCE_BINDINGS_SCHEMA) {
    throw new ValidationError(
      `Capability evidence bindings schema must be ${CAPABILITY_EVIDENCE_BINDINGS_SCHEMA}`
    );
  }
  if (document.kernel_version !== registry.kernel_version) {
    throw new ValidationError('Capability evidence bindings kernel_version must match the registry');
  }
  const registryDigest = digestObject(registry);
  if (document.registry_digest !== registryDigest) {
    throw new ValidationError('Capability evidence bindings registry_digest must match the registry');
  }
  if (!Array.isArray(document.bindings) || !document.bindings.length) {
    throw new ValidationError('Capability evidence bindings must contain bindings');
  }

  const files = new Map();
  for (const item of registry.capabilities ?? []) {
    for (const path of item.evidence ?? []) {
      const normalized = validateEvidencePath(item.id, path);
      const absolute = await validateRepositoryFile(root, normalized);
      files.set(normalized, absolute);
    }
  }

  const implemented = new Map(
    (registry.capabilities ?? [])
      .filter(item => item.status === 'implemented')
      .map(item => [item.id, item])
  );
  const seen = new Set();
  const sourceCache = new Map();

  for (const binding of document.bindings) {
    validateBindingShape(binding);
    const item = implemented.get(binding.capability_id);
    if (!item) {
      throw new ValidationError(
        `Capability evidence binding names a non-implemented or unknown capability: ${binding.capability_id}`
      );
    }
    if (seen.has(binding.capability_id)) {
      throw new ValidationError(`Duplicate capability evidence binding: ${binding.capability_id}`);
    }
    seen.add(binding.capability_id);

    const path = validateEvidencePath(binding.capability_id, binding.path);
    if (!item.evidence.includes(path)) {
      throw new ValidationError(
        `Capability ${binding.capability_id} binding path is not named by its registry evidence`
      );
    }
    if (!isRunnableTestPath(path)) {
      throw new ValidationError(
        `Capability ${binding.capability_id} binding must target a runnable Node test`
      );
    }
    const absolute = files.get(path) ?? await validateRepositoryFile(root, path);
    let source = sourceCache.get(path);
    if (source === undefined) {
      source = await readFile(absolute, 'utf8');
      sourceCache.set(path, source);
    }
    const testBlock = findTestBlock(source, binding.test);
    if (testBlock === null) {
      throw new ValidationError(
        `Capability ${binding.capability_id} test declaration was not found in ${path}: ${binding.test}`
      );
    }
    for (const assertion of binding.assertions) {
      if (!hasExactAssertionLine(testBlock, assertion)) {
        throw new ValidationError(
          `Capability ${binding.capability_id} assertion binding is missing from ${path}: ${assertion}`
        );
      }
    }
  }

  const missing = [...implemented.keys()].filter(id => !seen.has(id));
  if (missing.length) {
    throw new ValidationError(
      `Implemented capabilities are missing executable assertion bindings: ${missing.join(', ')}`
    );
  }
  const extras = [...seen].filter(id => !implemented.has(id));
  if (extras.length) {
    throw new ValidationError(`Unexpected capability evidence bindings: ${extras.join(', ')}`);
  }
  return {
    valid: true,
    schema: document.schema,
    kernel_version: document.kernel_version,
    registry_digest: registryDigest,
    digest: digestObject(document),
    bindings: seen.size,
    evidence_files: files.size,
    binding_file: bindingsRelativePath
  };
}

function validateBindingShape(binding) {
  const expectedFields = ['assertions', 'capability_id', 'path', 'test'];
  if (
    !binding
    || typeof binding !== 'object'
    || Array.isArray(binding)
    || Object.keys(binding).sort().join(',') !== expectedFields.join(',')
  ) {
    throw new ValidationError('Capability evidence binding fields are invalid');
  }
  if (!/^[a-z][a-z0-9.-]+$/.test(binding.capability_id ?? '')) {
    throw new ValidationError('Capability evidence binding id is invalid');
  }
  if (
    typeof binding.test !== 'string'
    || binding.test.length < 10
    || binding.test.length > 240
    || /[\r\n]/.test(binding.test)
  ) {
    throw new ValidationError(`Capability ${binding.capability_id} test name is invalid`);
  }
  if (
    !Array.isArray(binding.assertions)
    || !binding.assertions.length
    || binding.assertions.length > 8
  ) {
    throw new ValidationError(
      `Capability ${binding.capability_id} must bind at least one assertion`
    );
  }
  for (const assertion of binding.assertions) {
    if (
      typeof assertion !== 'string'
      || assertion.length < 10
      || assertion.length > 500
      || /[\r\n]/.test(assertion)
      || !/\bassert(?:\.|\s*\()/.test(assertion)
    ) {
      throw new ValidationError(
        `Capability ${binding.capability_id} assertion anchor is invalid`
      );
    }
  }
}

function validateEvidencePath(capabilityId, path) {
  if (
    typeof path !== 'string'
    || path.length < 3
    || path.length > 320
    || path.includes('\0')
    || path.includes('\\')
    || path.includes('//')
    || isAbsolute(path)
    || !/^[A-Za-z0-9._/-]+$/.test(path)
  ) {
    throw new ValidationError(`Capability ${capabilityId} evidence path is invalid`);
  }
  const normalized = posix.normalize(path);
  if (
    normalized !== path
    || normalized === '.'
    || normalized === '..'
    || normalized.startsWith('../')
  ) {
    throw new ValidationError(
      `Capability ${capabilityId} evidence path must be normalized and repository-relative`
    );
  }
  return normalized;
}

function isRunnableTestPath(path) {
  return /^mesh\/test\/[A-Za-z0-9._/-]+\.test\.mjs$/.test(path);
}

async function validateRepositoryFile(repositoryRoot, repositoryPath) {
  const absolute = resolve(repositoryRoot, repositoryPath);
  repositoryRelativePath(repositoryRoot, absolute, `Evidence path ${repositoryPath}`);
  let metadata;
  try {
    metadata = await lstat(absolute);
  } catch (error) {
    if (error?.code === 'ENOENT') {
      throw new ValidationError(`Evidence path does not exist: ${repositoryPath}`);
    }
    throw error;
  }
  if (metadata.isSymbolicLink()) {
    throw new ValidationError(`Evidence path must not be a symbolic link: ${repositoryPath}`);
  }
  if (!metadata.isFile()) {
    throw new ValidationError(`Evidence path must be a regular file: ${repositoryPath}`);
  }
  const canonical = await realpath(absolute);
  repositoryRelativePath(repositoryRoot, canonical, `Evidence path ${repositoryPath}`);
  if (resolve(canonical) !== resolve(absolute)) {
    throw new ValidationError(
      `Evidence path must not traverse symbolic links: ${repositoryPath}`
    );
  }
  return absolute;
}

function repositoryRelativePath(repositoryRoot, absolutePath, label) {
  const repositoryRelative = relative(repositoryRoot, absolutePath);
  if (
    repositoryRelative === ''
    || repositoryRelative === '..'
    || repositoryRelative.startsWith(`..${sep}`)
    || isAbsolute(repositoryRelative)
  ) {
    throw new ValidationError(`${label} must remain inside the repository`);
  }
  return repositoryRelative.split(sep).join('/');
}

function findTestBlock(source, testName) {
  const declaration = new RegExp(
    `^[ \\t]*test\\s*\\(\\s*(['"])${escapeRegex(testName)}\\1\\s*,`,
    'm'
  );
  const match = declaration.exec(source);
  if (!match) return null;
  const remainderStart = match.index + match[0].length;
  const remainder = source.slice(remainderStart);
  const nextTest = /^\s*test\s*\(/m.exec(remainder);
  return source.slice(
    match.index,
    nextTest ? remainderStart + nextTest.index : source.length
  );
}

function hasExactAssertionLine(testBlock, assertion) {
  return testBlock
    .split(/\r?\n/)
    .some(line => line.trim() === assertion);
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function main() {
  const config = meshConfig();
  const registry = JSON.parse(await readFile(config.capabilitiesPath, 'utf8'));
  const registryResult = validateCapabilityRegistry(registry);
  const evidenceResult = await validateCapabilityEvidenceBindings(registry);
  process.stdout.write(`${JSON.stringify({
    ...registryResult,
    evidence: evidenceResult
  }, null, 2)}\n`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
