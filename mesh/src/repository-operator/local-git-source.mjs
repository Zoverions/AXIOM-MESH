import { execFile } from 'node:child_process';
import { realpath, stat } from 'node:fs/promises';
import { isAbsolute } from 'node:path';

import {
  AxiomError,
  ValidationError,
  assertPlainObject,
  assertString,
  digestObject,
  sha256
} from '../lib/canonical.mjs';
import {
  SOURCE_CONTENT_ADDRESS_PROFILE,
  SOURCE_STATE_SCHEMA,
  normalizeSourceState
} from '../lib/source-continuity.mjs';
import {
  buildRepositoryAdapterReplicaObservation,
  normalizeRepositoryAdapterDescriptor
} from '../lib/repository-adapter.mjs';

export const LOCAL_GIT_SOURCE_MANIFEST_SCHEMA = 'axiom-local-git-source-manifest.v2';
export const LOCAL_GIT_INSPECTION_SCHEMA = 'axiom-local-git-source-inspection.v1';

const MAX_GIT_OUTPUT_BYTES = 64 * 1024 * 1024;
const MAX_REF_BYTES = 256;
const GIT_SHA1 = /^[a-f0-9]{40}$/;
const GIT_SHA256 = /^[a-f0-9]{64}$/;
const REF = /^(?:refs\/(?:heads|tags)\/[A-Za-z0-9][A-Za-z0-9._/-]{0,220}|[a-f0-9]{40}|[a-f0-9]{64})$/;

function gitOid(value, objectFormat, name) {
  const pattern = objectFormat === 'sha1' ? GIT_SHA1 : GIT_SHA256;
  const length = objectFormat === 'sha1' ? 40 : 64;
  return assertString(value, name, { min: length, max: length, pattern });
}

function normalizeRef(value) {
  const ref = assertString(value, 'Git ref', { min: 1, max: MAX_REF_BYTES, pattern: REF });
  if (
    ref.includes('..')
    || ref.includes('//')
    || ref.includes('@{')
    || ref.endsWith('/')
    || ref.endsWith('.')
  ) {
    throw new ValidationError('local Git ref is not canonical');
  }
  return ref;
}

function safeGitEnvironment() {
  const env = {};
  for (const key of [
    'PATH',
    'Path',
    'PATHEXT',
    'SYSTEMROOT',
    'SystemRoot',
    'WINDIR',
    'COMSPEC',
    'TMPDIR',
    'TMP',
    'TEMP',
    'LANG',
    'LC_ALL'
  ]) {
    if (typeof process.env[key] === 'string') env[key] = process.env[key];
  }
  env.GIT_CONFIG_NOSYSTEM = '1';
  env.GIT_CONFIG_GLOBAL = process.platform === 'win32' ? 'NUL' : '/dev/null';
  env.GIT_TERMINAL_PROMPT = '0';
  env.GIT_OPTIONAL_LOCKS = '0';
  return env;
}

async function canonicalRepositoryPath(repositoryPath) {
  const raw = assertString(repositoryPath, 'local Git repository path', { min: 1, max: 4096 });
  if (!isAbsolute(raw) || /[\r\n\u0000]/.test(raw)) {
    throw new ValidationError('local Git repository path must be an absolute path without control characters');
  }
  let path;
  try {
    path = await realpath(raw);
  } catch {
    throw new AxiomError('local_git_repository_unavailable', 'Local Git repository is unavailable', 404);
  }
  const metadata = await stat(path);
  if (!metadata.isDirectory()) {
    throw new ValidationError('local Git repository path must resolve to a directory');
  }
  return path;
}

function executeGit(path, args, {
  execFileImpl = execFile,
  timeoutMs = 10_000,
  maxOutputBytes = MAX_GIT_OUTPUT_BYTES
} = {}) {
  return new Promise((resolve, reject) => {
    execFileImpl(
      'git',
      ['-C', path, ...args],
      {
        encoding: 'buffer',
        env: safeGitEnvironment(),
        timeout: timeoutMs,
        maxBuffer: maxOutputBytes,
        windowsHide: true
      },
      (error, stdout, stderr) => {
        if (error) {
          reject(new AxiomError(
            'local_git_command_failed',
            'Local Git source inspection failed closed',
            409,
            {
              operation: args[0],
              exit_code: Number.isSafeInteger(error.code) ? error.code : null,
              stderr_bytes: Buffer.isBuffer(stderr) ? stderr.length : 0
            }
          ));
          return;
        }
        const output = Buffer.isBuffer(stdout) ? stdout : Buffer.from(stdout ?? '');
        if (output.length > maxOutputBytes) {
          reject(new ValidationError('local Git command output exceeds the configured ceiling'));
          return;
        }
        resolve(output);
      }
    );
  });
}

function textOutput(buffer, name) {
  const text = buffer.toString('utf8');
  if (!Buffer.from(text, 'utf8').equals(buffer)) {
    throw new ValidationError(`${name} is not valid UTF-8`);
  }
  return text.trim();
}

function parseLsTree(buffer, objectFormat) {
  const records = [];
  let offset = 0;
  while (offset < buffer.length) {
    const end = buffer.indexOf(0, offset);
    if (end < 0) throw new ValidationError('local Git ls-tree output is not NUL terminated');
    if (end === offset) {
      offset = end + 1;
      continue;
    }
    const record = buffer.subarray(offset, end);
    const tab = record.indexOf(9);
    if (tab <= 0) throw new ValidationError('local Git ls-tree record is malformed');
    const metadata = record.subarray(0, tab).toString('ascii');
    const parts = metadata.split(' ');
    if (parts.length !== 3) throw new ValidationError('local Git ls-tree metadata is malformed');
    const [mode, type, oidRaw] = parts;
    if (!/^[0-7]{6}$/.test(mode)) throw new ValidationError('local Git tree mode is invalid');
    if (type === 'commit') {
      throw new ValidationError('local Git source continuity v1 does not support submodule commit entries');
    }
    if (type !== 'blob') {
      throw new ValidationError('local Git tree object type is unsupported');
    }
    const oid = gitOid(oidRaw, objectFormat, 'local Git tree object id');
    const pathBytes = record.subarray(tab + 1);
    const path = pathBytes.toString('utf8');
    if (!Buffer.from(path, 'utf8').equals(pathBytes) || !path.length) {
      throw new ValidationError('local Git tree path must be non-empty valid UTF-8');
    }
    records.push({ mode, type, oid, path });
    offset = end + 1;
  }
  return records;
}

export async function inspectLocalGitSource({
  repository_path,
  ref = 'refs/heads/main',
  execFileImpl = execFile,
  timeoutMs = 10_000,
  maxOutputBytes = MAX_GIT_OUTPUT_BYTES
}) {
  const path = await canonicalRepositoryPath(repository_path);
  const selectedRef = normalizeRef(ref);
  const options = { execFileImpl, timeoutMs, maxOutputBytes };

  const objectFormat = textOutput(
    await executeGit(path, ['rev-parse', '--show-object-format'], options),
    'local Git object format'
  );
  if (!['sha1', 'sha256'].includes(objectFormat)) {
    throw new ValidationError('local Git object format is unsupported');
  }
  const commitOid = gitOid(
    textOutput(
      await executeGit(path, ['rev-parse', '--verify', `${selectedRef}^{commit}`], options),
      'local Git commit id'
    ),
    objectFormat,
    'local Git commit id'
  );
  const treeOid = gitOid(
    textOutput(
      await executeGit(path, ['show', '-s', '--format=%T', commitOid], options),
      'local Git tree id'
    ),
    objectFormat,
    'local Git tree id'
  );

  const entries = parseLsTree(
    await executeGit(path, ['ls-tree', '-r', '-z', '--full-tree', commitOid], options),
    objectFormat
  );
  await executeGit(
    path,
    ['fsck', '--connectivity-only', '--no-dangling', '--no-reflogs', commitOid],
    options
  );
  const archive = await executeGit(
    path,
    ['archive', '--format=tar', commitOid],
    options
  );
  const archiveSha256 = sha256(archive);

  const manifest = {
    schema: LOCAL_GIT_SOURCE_MANIFEST_SCHEMA,
    vcs: 'git',
    object_format: objectFormat,
    commit_oid: commitOid,
    tree_oid: treeOid,
    archive_sha256: archiveSha256,
    entries
  };
  return {
    schema: LOCAL_GIT_INSPECTION_SCHEMA,
    vcs: 'git',
    object_format: objectFormat,
    ref: selectedRef,
    commit_oid: commitOid,
    tree_oid: treeOid,
    source_archive_sha256: archiveSha256,
    source_manifest_digest: digestObject(manifest),
    manifest_entries: entries.length,
    object_complete: true,
    source_bytes_independently_committed: true,
    network_required: false,
    provider_api_required: false,
    repository_path_exposed: false
  };
}

export async function deriveLocalGitSourceState({
  repository_path,
  repository_id,
  build,
  ref = 'refs/heads/main',
  execFileImpl = execFile,
  timeoutMs = 10_000,
  maxOutputBytes = MAX_GIT_OUTPUT_BYTES
}) {
  const binding = assertPlainObject(build, 'local Git source build binding');
  const inspection = await inspectLocalGitSource({
    repository_path,
    ref,
    execFileImpl,
    timeoutMs,
    maxOutputBytes
  });
  return normalizeSourceState({
    schema: SOURCE_STATE_SCHEMA,
    repository_id,
    vcs: 'git',
    object_format: inspection.object_format,
    commit_oid: inspection.commit_oid,
    tree_oid: inspection.tree_oid,
    source_manifest_digest: inspection.source_manifest_digest,
    build: binding,
    content_address_profile: SOURCE_CONTENT_ADDRESS_PROFILE
  });
}

export async function observeLocalGitReplica({
  repository_path,
  descriptor,
  source_state,
  ref = 'refs/heads/main',
  observed_at = new Date().toISOString(),
  execFileImpl = execFile,
  timeoutMs = 10_000,
  maxOutputBytes = MAX_GIT_OUTPUT_BYTES
}) {
  const adapter = normalizeRepositoryAdapterDescriptor(descriptor);
  if (!['local_git', 'bare_git'].includes(adapter.transport)) {
    throw new ValidationError('local Git source observer requires a local_git or bare_git adapter');
  }
  const state = normalizeSourceState(source_state);
  const inspection = await inspectLocalGitSource({
    repository_path,
    ref,
    execFileImpl,
    timeoutMs,
    maxOutputBytes
  });
  if (inspection.object_format !== adapter.object_format) {
    throw new ValidationError('local Git adapter object format does not match the inspected repository');
  }
  const exact = (
    inspection.object_format === state.object_format
    && inspection.commit_oid === state.commit_oid
    && inspection.tree_oid === state.tree_oid
    && inspection.source_manifest_digest === state.source_manifest_digest
    && inspection.object_complete === true
    && inspection.source_bytes_independently_committed === true
  );
  return {
    inspection,
    observation: buildRepositoryAdapterReplicaObservation({
      descriptor: adapter,
      source_state: state,
      observed_commit_oid: inspection.commit_oid,
      object_complete: inspection.object_complete,
      digest_verified: exact,
      status: exact ? 'reachable' : 'divergent',
      observed_at
    })
  };
}
