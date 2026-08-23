import { createHash } from 'node:crypto';
import {
  existsSync,
  readFileSync,
  realpathSync,
  statSync
} from 'node:fs';
import {
  dirname,
  isAbsolute,
  join,
  resolve
} from 'node:path';
import { ValidationError } from './canonical.mjs';

const HEX40 = /^[a-f0-9]{40}$/;
const PROFILE_ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/;
const RELATIVE_PATH = /^[A-Za-z0-9._/-]+$/;
const OUTPUT_FIELDS = Object.freeze(['sha', 'short_sha', 'source', 'version']);

const PYTHON_IDENTITY_SCRIPT = String.raw`
import importlib.util
import json
import pathlib
import sys

module_path = pathlib.Path(sys.argv[1]).resolve()
spec = importlib.util.spec_from_file_location("_axiom_hermes_build_info", module_path)
if spec is None or spec.loader is None:
    raise RuntimeError("unable to create module spec")
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
value = module.get_code_identity(refresh=True)
expected = {"sha", "short_sha", "source", "version"}
if not isinstance(value, dict) or set(value.keys()) != expected:
    raise RuntimeError("unexpected Hermes code-identity output shape")
sys.stdout.write(json.dumps(value, sort_keys=True, separators=(",", ":")))
`.trim();

export const HERMES_RUNTIME_002_PROFILE = deepFreeze({
  schema: 'axiom-runtime-source-inspection-profile.v0',
  profile_id: 'axiom.runtime.hermes.code-identity.v0',
  runtime_id: 'hermes-agent',
  project_name: 'Hermes Agent',
  upstream_repository: 'https://github.com/NousResearch/hermes-agent',
  source_commit: 'b6bcb3e791c673e63974029bbab40cc9326803ff',
  source_commit_signature_verified: false,
  project_version: '0.20.5',
  license_spdx: 'MIT',
  proposed_axiom_action: 'runtime.identity.inspect',
  action_authorized: false,
  capability_promoted: false,
  external_runtime_loaded: false,
  external_effect_performed: false,
  package_import_allowed: false,
  dependency_installation_allowed: false,
  lazy_installation_allowed: false,
  provider_credentials_allowed: false,
  network_required: false,
  direct_host_tool_access: false,
  build_identity_file_allowed: false,
  python: {
    minimum_version: '3.11',
    maximum_version_exclusive: '3.14',
    flags: ['-I', '-S', '-B']
  },
  probe: {
    module_path: 'hermes_cli/build_info.py',
    function: 'get_code_identity',
    expected_source: 'git',
    output_fields: OUTPUT_FIELDS,
    timeout_ms: 2_000,
    maximum_stdout_bytes: 1_024,
    maximum_stderr_bytes: 2_048
  },
  required_files: [
    {
      path: 'hermes_cli/build_info.py',
      git_blob_sha1: 'e2ae06ba73e5ec5ae737c3c4691362c0f99d6fc8',
      execution_role: 'executed-module'
    },
    {
      path: 'pyproject.toml',
      git_blob_sha1: '863115484515e1f80495da54da20ff8912ede3e6',
      execution_role: 'read-by-module'
    },
    {
      path: 'uv.lock',
      git_blob_sha1: '0b058b8e70aaaaee618b5e9e4529fac863b84c03',
      execution_role: 'review-provenance-only'
    },
    {
      path: 'tools/lazy_deps.py',
      git_blob_sha1: '3887d3a2575c0fefb8226de89619cad0cf11a305',
      execution_role: 'review-provenance-only'
    },
    {
      path: 'LICENSE',
      git_blob_sha1: '75410e73319c72cd3e991a501c5455eb78f38375',
      execution_role: 'review-provenance-only'
    }
  ]
});

export function gitBlobSha1(value) {
  const bytes = Buffer.isBuffer(value) ? value : Buffer.from(value);
  return createHash('sha1')
    .update(Buffer.from(`blob ${bytes.length}\0`, 'utf8'))
    .update(bytes)
    .digest('hex');
}

export function verifyPinnedGitCheckout({
  projectRoot,
  expectedCommit,
  requiredFiles,
  rejectPaths = []
}) {
  if (typeof projectRoot !== 'string' || !projectRoot.length || !isAbsolute(projectRoot)) {
    throw new ValidationError('Pinned runtime checkout root must be an absolute path');
  }
  if (!HEX40.test(expectedCommit)) {
    throw new ValidationError('Pinned runtime checkout commit must be a lowercase 40-character Git SHA');
  }
  if (!Array.isArray(requiredFiles) || requiredFiles.length === 0) {
    throw new ValidationError('Pinned runtime checkout requires at least one pinned file');
  }
  if (!Array.isArray(rejectPaths)) {
    throw new ValidationError('Pinned runtime checkout reject paths must be an array');
  }

  const root = realDirectory(projectRoot, 'Pinned runtime checkout root');
  const head = resolveGitHeadSha(root);
  if (head !== expectedCommit) {
    throw new ValidationError(
      `Pinned runtime checkout HEAD mismatch: expected ${expectedCommit}, received ${head ?? 'unknown'}`
    );
  }

  const files = [];
  const seen = new Set();
  for (const entry of requiredFiles) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      throw new ValidationError('Pinned runtime checkout file entry must be an object');
    }
    const relativePath = validateRelativePath(entry.path, 'Pinned runtime checkout file path');
    if (seen.has(relativePath)) {
      throw new ValidationError(`Pinned runtime checkout file is duplicated: ${relativePath}`);
    }
    seen.add(relativePath);
    if (!HEX40.test(entry.git_blob_sha1 ?? '')) {
      throw new ValidationError(`Pinned runtime checkout blob SHA is invalid for ${relativePath}`);
    }

    const filePath = joinRelative(root, relativePath);
    if (!existsSync(filePath) || !statSync(filePath).isFile()) {
      throw new ValidationError(`Pinned runtime checkout file is missing: ${relativePath}`);
    }
    const bytes = readFileSync(filePath);
    const actualBlob = gitBlobSha1(bytes);
    if (actualBlob !== entry.git_blob_sha1) {
      throw new ValidationError(
        `Pinned runtime checkout blob mismatch for ${relativePath}: expected ${entry.git_blob_sha1}, received ${actualBlob}`
      );
    }
    files.push({
      path: relativePath,
      git_blob_sha1: actualBlob,
      bytes: bytes.length
    });
  }

  for (const rejected of rejectPaths) {
    const relativePath = validateRelativePath(rejected, 'Pinned runtime checkout reject path');
    if (existsSync(joinRelative(root, relativePath))) {
      throw new ValidationError(`Pinned runtime checkout contains forbidden path: ${relativePath}`);
    }
  }

  return deepFreeze({
    valid: true,
    project_root: root,
    source_commit: head,
    files,
    complete_worktree_cleanliness_claimed: false,
    publisher_signature_verified: false,
    external_runtime_loaded: false,
    external_effect_performed: false
  });
}

export function verifyHermesRuntime002Checkout(projectRoot) {
  const result = verifyPinnedGitCheckout({
    projectRoot,
    expectedCommit: HERMES_RUNTIME_002_PROFILE.source_commit,
    requiredFiles: HERMES_RUNTIME_002_PROFILE.required_files,
    rejectPaths: HERMES_RUNTIME_002_PROFILE.build_identity_file_allowed
      ? []
      : ['.hermes_build_sha']
  });
  return deepFreeze({
    ...result,
    profile_id: HERMES_RUNTIME_002_PROFILE.profile_id,
    runtime_id: HERMES_RUNTIME_002_PROFILE.runtime_id,
    project_version: HERMES_RUNTIME_002_PROFILE.project_version,
    action_authorized: false,
    capability_promoted: false
  });
}

export function createRuntimeIdentityInvocation({
  profile,
  projectRoot,
  pythonExecutable
}) {
  validateInspectionProfile(profile);
  const checkout = verifyPinnedGitCheckout({
    projectRoot,
    expectedCommit: profile.source_commit,
    requiredFiles: profile.required_files,
    rejectPaths: profile.build_identity_file_allowed ? [] : ['.hermes_build_sha']
  });

  if (typeof pythonExecutable !== 'string' || !pythonExecutable.length || !isAbsolute(pythonExecutable)) {
    throw new ValidationError('Runtime identity probe Python executable must be an absolute path');
  }
  const executable = realFile(pythonExecutable, 'Runtime identity probe Python executable');
  const modulePath = joinRelative(checkout.project_root, profile.probe.module_path);

  return deepFreeze({
    schema: 'axiom-runtime-source-inspection-invocation.v0',
    profile_id: profile.profile_id,
    runtime_id: profile.runtime_id,
    proposed_axiom_action: profile.proposed_axiom_action,
    action_authorized: false,
    capability_promoted: false,
    external_runtime_loaded: false,
    external_effect_performed: false,
    source: {
      repository: profile.upstream_repository,
      commit: checkout.source_commit,
      selected_files_verified: true,
      complete_worktree_cleanliness_claimed: false,
      publisher_signature_verified: false
    },
    command: executable,
    args: [
      ...profile.python.flags,
      '-c',
      PYTHON_IDENTITY_SCRIPT,
      modulePath
    ],
    cwd: checkout.project_root,
    environment: {
      inherit: false,
      variables: {}
    },
    sandbox_requirements: {
      sandbox_required: true,
      filesystem_mode: 'read-only',
      network_mode: 'deny',
      provider_credentials_allowed: false,
      dependency_installation_allowed: false,
      package_import_allowed: false,
      direct_host_tool_access: false
    },
    bounds: {
      timeout_ms: profile.probe.timeout_ms,
      maximum_stdout_bytes: profile.probe.maximum_stdout_bytes,
      maximum_stderr_bytes: profile.probe.maximum_stderr_bytes,
      maximum_attempts: 1
    },
    expected_observation: {
      fields: [...profile.probe.output_fields],
      sha: profile.source_commit,
      short_sha: profile.source_commit.slice(0, 8),
      version: profile.project_version,
      source: profile.probe.expected_source
    }
  });
}

export function createHermesRuntime002Invocation({ projectRoot, pythonExecutable }) {
  return createRuntimeIdentityInvocation({
    profile: HERMES_RUNTIME_002_PROFILE,
    projectRoot,
    pythonExecutable
  });
}

export function validateRuntimeIdentityObservation({ profile, value }) {
  validateInspectionProfile(profile);
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new ValidationError('Runtime identity observation must be an object');
  }
  exactFields(value, profile.probe.output_fields, 'Runtime identity observation');
  if (
    value.sha !== profile.source_commit
    || value.short_sha !== profile.source_commit.slice(0, 8)
    || value.version !== profile.project_version
    || value.source !== profile.probe.expected_source
  ) {
    throw new ValidationError('Runtime identity observation does not match the admitted source profile');
  }
  return true;
}

export function validateHermesRuntime002Observation(value) {
  return validateRuntimeIdentityObservation({
    profile: HERMES_RUNTIME_002_PROFILE,
    value
  });
}

export function parseHermesRuntime002Observation(stdout) {
  const bytes = Buffer.isBuffer(stdout) ? stdout : Buffer.from(String(stdout), 'utf8');
  if (bytes.length === 0 || bytes.length > HERMES_RUNTIME_002_PROFILE.probe.maximum_stdout_bytes) {
    throw new ValidationError('Hermes runtime identity stdout is empty or exceeds its bound');
  }
  const text = bytes.toString('utf8').trim();
  if (!text.length || text.includes('\0') || text.includes('\n') || text.includes('\r')) {
    throw new ValidationError('Hermes runtime identity stdout must contain exactly one JSON record');
  }
  let value;
  try {
    value = JSON.parse(text);
  } catch {
    throw new ValidationError('Hermes runtime identity stdout is not valid JSON');
  }
  validateHermesRuntime002Observation(value);
  return deepFreeze({
    valid: true,
    observation: { ...value },
    capability_promoted: false,
    external_effect_performed: false
  });
}

function validateInspectionProfile(profile) {
  if (!profile || typeof profile !== 'object' || Array.isArray(profile)) {
    throw new ValidationError('Runtime identity profile must be an object');
  }
  if (profile.schema !== 'axiom-runtime-source-inspection-profile.v0') {
    throw new ValidationError('Runtime identity profile schema is invalid');
  }
  if (!PROFILE_ID.test(profile.profile_id ?? '') || !PROFILE_ID.test(profile.runtime_id ?? '')) {
    throw new ValidationError('Runtime identity profile identifiers are invalid');
  }
  if (!HEX40.test(profile.source_commit ?? '')) {
    throw new ValidationError('Runtime identity profile source commit is invalid');
  }
  if (
    typeof profile.upstream_repository !== 'string'
    || !profile.upstream_repository.startsWith('https://')
    || typeof profile.project_version !== 'string'
    || !profile.project_version.length
    || profile.proposed_axiom_action !== 'runtime.identity.inspect'
    || profile.action_authorized !== false
    || profile.capability_promoted !== false
    || profile.external_runtime_loaded !== false
    || profile.external_effect_performed !== false
    || profile.package_import_allowed !== false
    || profile.dependency_installation_allowed !== false
    || profile.lazy_installation_allowed !== false
    || profile.provider_credentials_allowed !== false
    || profile.network_required !== false
    || profile.direct_host_tool_access !== false
    || !profile.python
    || profile.python.minimum_version !== '3.11'
    || profile.python.maximum_version_exclusive !== '3.14'
    || JSON.stringify(profile.python.flags) !== JSON.stringify(['-I', '-S', '-B'])
    || !profile.probe
    || profile.probe.function !== 'get_code_identity'
    || profile.probe.expected_source !== 'git'
    || JSON.stringify(profile.probe.output_fields) !== JSON.stringify(OUTPUT_FIELDS)
    || !Number.isInteger(profile.probe.timeout_ms)
    || profile.probe.timeout_ms <= 0
    || !Number.isInteger(profile.probe.maximum_stdout_bytes)
    || profile.probe.maximum_stdout_bytes <= 0
    || !Number.isInteger(profile.probe.maximum_stderr_bytes)
    || profile.probe.maximum_stderr_bytes <= 0
  ) {
    throw new ValidationError('Runtime identity profile invariants are invalid');
  }
  validateRelativePath(profile.probe.module_path, 'Runtime identity profile module path');
  if (!Array.isArray(profile.required_files) || profile.required_files.length < 2) {
    throw new ValidationError('Runtime identity profile required files are invalid');
  }
  const moduleEntry = profile.required_files.find(entry => entry?.path === profile.probe.module_path);
  if (!moduleEntry || moduleEntry.execution_role !== 'executed-module') {
    throw new ValidationError('Runtime identity profile must pin its executed module');
  }
  return true;
}

function resolveGitHeadSha(projectRoot) {
  try {
    const dotGit = join(projectRoot, '.git');
    let gitDir;
    if (existsSync(dotGit) && statSync(dotGit).isDirectory()) {
      gitDir = dotGit;
    } else if (existsSync(dotGit) && statSync(dotGit).isFile()) {
      const pointer = readFileSync(dotGit, 'utf8').trim();
      if (!pointer.startsWith('gitdir:')) return null;
      const raw = pointer.slice('gitdir:'.length).trim();
      if (!raw.length) return null;
      gitDir = isAbsolute(raw) ? raw : resolve(projectRoot, raw);
    } else {
      return null;
    }

    let commonDir = gitDir;
    const commonDirFile = join(gitDir, 'commondir');
    if (existsSync(commonDirFile) && statSync(commonDirFile).isFile()) {
      const raw = readFileSync(commonDirFile, 'utf8').trim();
      if (!raw.length) return null;
      commonDir = isAbsolute(raw) ? raw : resolve(gitDir, raw);
    }

    const headFile = join(gitDir, 'HEAD');
    if (!existsSync(headFile)) return null;
    const head = readFileSync(headFile, 'utf8').trim();
    if (HEX40.test(head)) return head;
    if (!head.startsWith('ref:')) return null;
    const refName = head.slice('ref:'.length).trim();
    if (!isSafeRefName(refName)) return null;

    const loose = join(commonDir, ...refName.split('/'));
    if (existsSync(loose) && statSync(loose).isFile()) {
      const sha = readFileSync(loose, 'utf8').trim();
      return HEX40.test(sha) ? sha : null;
    }

    const packedRefs = join(commonDir, 'packed-refs');
    if (!existsSync(packedRefs) || !statSync(packedRefs).isFile()) return null;
    for (const rawLine of readFileSync(packedRefs, 'utf8').split(/\r?\n/u)) {
      const line = rawLine.trim();
      if (!line || line.startsWith('#') || line.startsWith('^')) continue;
      const separator = line.indexOf(' ');
      if (separator <= 0) continue;
      const sha = line.slice(0, separator).trim();
      const name = line.slice(separator + 1).trim();
      if (name === refName && HEX40.test(sha)) return sha;
    }
  } catch {
    return null;
  }
  return null;
}

function isSafeRefName(value) {
  return value.startsWith('refs/')
    && RELATIVE_PATH.test(value)
    && !value.includes('..')
    && !value.includes('//')
    && !value.endsWith('/');
}

function validateRelativePath(value, label) {
  if (
    typeof value !== 'string'
    || !value.length
    || isAbsolute(value)
    || !RELATIVE_PATH.test(value)
    || value.startsWith('/')
    || value.includes('..')
    || value.includes('//')
    || value.endsWith('/')
  ) {
    throw new ValidationError(`${label} is invalid`);
  }
  return value;
}

function joinRelative(root, relativePath) {
  return join(root, ...relativePath.split('/'));
}

function realDirectory(value, label) {
  try {
    const path = realpathSync(value);
    if (!statSync(path).isDirectory()) throw new Error('not-directory');
    return path;
  } catch {
    throw new ValidationError(`${label} is unavailable`);
  }
}

function realFile(value, label) {
  try {
    const path = realpathSync(value);
    if (!statSync(path).isFile()) throw new Error('not-file');
    return path;
  } catch {
    throw new ValidationError(`${label} is unavailable`);
  }
}

function exactFields(value, expected, label) {
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (JSON.stringify(actual) !== JSON.stringify(wanted)) {
    throw new ValidationError(`${label} fields are invalid`);
  }
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}
