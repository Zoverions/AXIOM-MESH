import { execFile } from 'node:child_process';
import { lstat, realpath, readFile, stat } from 'node:fs/promises';
import { isAbsolute, relative, resolve, sep } from 'node:path';

import {
  AxiomError,
  ValidationError,
  assertString,
  digestObject,
  sha256
} from './canonical.mjs';

export const CI_CHECKOUT_FRESHNESS_SCHEMA = 'axiom-ci-checkout-freshness.v1';

const EVENT_NAMES = new Set([
  'pull_request',
  'push',
  'workflow_dispatch',
  'schedule'
]);
const WORKFLOW_PATH = /^\.github\/workflows\/[A-Za-z0-9][A-Za-z0-9._-]{0,190}\.ya?ml$/;
const MAX_GIT_OUTPUT_BYTES = 1024 * 1024;

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
  env.GIT_NO_LAZY_FETCH = '1';
  env.GIT_NO_REPLACE_OBJECTS = '1';
  return env;
}

function executeGit(path, args, { execFileImpl = execFile, timeoutMs = 10_000 } = {}) {
  return new Promise((resolvePromise, reject) => {
    execFileImpl(
      'git',
      ['-C', path, ...args],
      {
        encoding: 'buffer',
        env: safeGitEnvironment(),
        timeout: timeoutMs,
        maxBuffer: MAX_GIT_OUTPUT_BYTES,
        windowsHide: true
      },
      (error, stdout, stderr) => {
        if (error) {
          reject(new AxiomError(
            'ci_checkout_git_verification_failed',
            'CI checkout freshness Git verification failed closed',
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
        if (output.length > MAX_GIT_OUTPUT_BYTES) {
          reject(new ValidationError('CI checkout Git output exceeds the configured ceiling'));
          return;
        }
        resolvePromise(output);
      }
    );
  });
}

function utf8Text(buffer, name) {
  const text = buffer.toString('utf8');
  if (!Buffer.from(text, 'utf8').equals(buffer)) {
    throw new ValidationError(`${name} is not valid UTF-8`);
  }
  return text.trim();
}

function oidPattern(objectFormat) {
  if (objectFormat === 'sha1') return /^[a-f0-9]{40}$/;
  if (objectFormat === 'sha256') return /^[a-f0-9]{64}$/;
  throw new ValidationError('CI checkout Git object format is unsupported');
}

function oid(value, objectFormat, name) {
  const pattern = oidPattern(objectFormat);
  const length = objectFormat === 'sha1' ? 40 : 64;
  return assertString(value, name, {
    min: length,
    max: length,
    pattern
  }).toLowerCase();
}

async function canonicalRepositoryPath(repositoryPath) {
  const raw = assertString(repositoryPath, 'repository_path', { min: 1, max: 4096 });
  if (!isAbsolute(raw) || /[\r\n\u0000]/.test(raw)) {
    throw new ValidationError(
      'repository_path must be an absolute path without control characters'
    );
  }
  let path;
  try {
    path = await realpath(raw);
  } catch {
    throw new AxiomError(
      'ci_checkout_repository_unavailable',
      'CI checkout repository is unavailable',
      404
    );
  }
  const metadata = await stat(path);
  if (!metadata.isDirectory()) {
    throw new ValidationError('repository_path must resolve to a directory');
  }
  return path;
}

function normalizeEventName(value) {
  const eventName = assertString(value, 'event_name', {
    min: 1,
    max: 64,
    pattern: /^[a-z_]+$/
  });
  if (!EVENT_NAMES.has(eventName)) {
    throw new ValidationError(`unsupported CI checkout event: ${eventName}`);
  }
  return eventName;
}

function normalizeWorkflowPath(value) {
  return assertString(value, 'workflow_path', {
    min: 1,
    max: 220,
    pattern: WORKFLOW_PATH
  }).replaceAll('\\', '/');
}

function ensureWithinRepository(repositoryPath, targetPath) {
  const rel = relative(repositoryPath, targetPath);
  if (!rel || rel === '.') return;
  if (rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel)) {
    throw new ValidationError('workflow_path escapes the repository');
  }
}

async function workflowDigest(repositoryPath, workflowPath, testedRevision, options) {
  const absolute = resolve(repositoryPath, ...workflowPath.split('/'));
  ensureWithinRepository(repositoryPath, absolute);
  let metadata;
  try {
    metadata = await lstat(absolute);
  } catch {
    throw new AxiomError(
      'ci_checkout_workflow_unavailable',
      'CI checkout workflow file is unavailable',
      404
    );
  }
  if (!metadata.isFile() || metadata.isSymbolicLink()) {
    throw new ValidationError('CI checkout workflow must be a regular file, not a link');
  }
  if (metadata.size > MAX_GIT_OUTPUT_BYTES) {
    throw new ValidationError('CI checkout workflow exceeds the configured byte ceiling');
  }
  let bytes;
  try {
    bytes = await readFile(absolute);
  } catch {
    throw new AxiomError(
      'ci_checkout_workflow_unavailable',
      'CI checkout workflow file is unavailable',
      404
    );
  }
  const committedBytes = await executeGit(
    repositoryPath,
    ['cat-file', 'blob', `${testedRevision}:${workflowPath}`],
    options
  );
  if (!bytes.equals(committedBytes)) {
    throw new ValidationError(
      'CI checkout workflow bytes do not match the exact tested revision'
    );
  }
  return {
    path: workflowPath,
    sha256: sha256(bytes),
    byte_length: bytes.length
  };
}

async function requireCommit(path, revision, objectFormat, options) {
  const normalized = oid(revision, objectFormat, 'expected revision');
  await executeGit(path, ['cat-file', '-e', `${normalized}^{commit}`], options);
  return normalized;
}

function evidenceBody({
  eventName,
  objectFormat,
  workflow,
  testedRevision,
  eventRevision,
  proposalHeadRevision,
  baseRevision,
  testedParents,
  observedAt,
  relation
}) {
  return {
    schema: CI_CHECKOUT_FRESHNESS_SCHEMA,
    event_name: eventName,
    object_format: objectFormat,
    workflow,
    tested_revision: testedRevision,
    event_revision: eventRevision,
    proposal_head_revision: proposalHeadRevision,
    base_revision: baseRevision,
    tested_parents: testedParents,
    checkout_relation: relation,
    checkout_exact: true,
    commit_relationship_measured_locally: true,
    commit_objects_verified_locally: true,
    source_bytes_independently_verified: false,
    provider_event_is_source_identity: false,
    provider_run_is_identity: false,
    merge_authority_granted: false,
    release_promotion_granted: false,
    capability_promotion_granted: false,
    provider_mutation_performed: false,
    network_access_performed: false,
    observed_at: observedAt
  };
}

export async function verifyCiCheckoutFreshness({
  repository_path,
  event_name,
  event_revision,
  proposal_head_revision = null,
  base_revision = null,
  workflow_path,
  observed_at = new Date().toISOString(),
  execFileImpl = execFile,
  timeoutMs = 10_000
}) {
  const repositoryPath = await canonicalRepositoryPath(repository_path);
  const eventName = normalizeEventName(event_name);
  const workflowPath = normalizeWorkflowPath(workflow_path);
  const options = { execFileImpl, timeoutMs };
  const objectFormat = utf8Text(
    await executeGit(repositoryPath, ['rev-parse', '--show-object-format'], options),
    'CI checkout Git object format'
  );
  oidPattern(objectFormat);

  const testedRevision = oid(
    utf8Text(
      await executeGit(repositoryPath, ['rev-parse', '--verify', 'HEAD^{commit}'], options),
      'CI tested revision'
    ),
    objectFormat,
    'tested revision'
  );
  const eventRevision = await requireCommit(
    repositoryPath,
    event_revision,
    objectFormat,
    options
  );
  if (testedRevision !== eventRevision) {
    throw new ValidationError(
      'CI checkout HEAD does not equal the event revision supplied to the verifier'
    );
  }

  const parentsText = utf8Text(
    await executeGit(
      repositoryPath,
      ['show', '-s', '--format=%P', testedRevision],
      options
    ),
    'CI tested revision parents'
  );
  const testedParents = parentsText
    ? parentsText.split(/\s+/).map(parent => oid(parent, objectFormat, 'tested parent revision'))
    : [];
  const workflow = await workflowDigest(
    repositoryPath,
    workflowPath,
    testedRevision,
    options
  );
  const observedAt = new Date(observed_at);
  if (Number.isNaN(observedAt.valueOf())) {
    throw new ValidationError('observed_at must be an ISO timestamp');
  }

  let proposalHeadRevision = null;
  let baseRevision = null;
  let relation;
  if (eventName === 'pull_request') {
    if (proposal_head_revision === null || base_revision === null) {
      throw new ValidationError(
        'pull_request checkout verification requires proposal head and base revisions'
      );
    }
    proposalHeadRevision = await requireCommit(
      repositoryPath,
      proposal_head_revision,
      objectFormat,
      options
    );
    baseRevision = await requireCommit(
      repositoryPath,
      base_revision,
      objectFormat,
      options
    );
    if (testedParents.length !== 2) {
      throw new ValidationError(
        'pull_request checkout must be the exact two-parent merge candidate'
      );
    }
    if (
      testedParents[0] !== baseRevision
      || testedParents[1] !== proposalHeadRevision
    ) {
      throw new ValidationError(
        'pull_request merge candidate parents do not match the event base and proposal head'
      );
    }
    relation = 'pull_request_merge_candidate';
  } else {
    if (proposal_head_revision !== null || base_revision !== null) {
      throw new ValidationError(
        `${eventName} checkout verification cannot carry pull-request head/base revisions`
      );
    }
    relation = 'direct_event_revision';
  }

  const body = evidenceBody({
    eventName,
    objectFormat,
    workflow,
    testedRevision,
    eventRevision,
    proposalHeadRevision,
    baseRevision,
    testedParents,
    observedAt: observedAt.toISOString(),
    relation
  });
  const evidenceDigest = digestObject(body);
  return {
    ...body,
    evidence_id: `ci-checkout-freshness:${evidenceDigest}`,
    evidence_digest: evidenceDigest
  };
}

export const CI_CHECKOUT_FRESHNESS_EVENTS = Object.freeze([...EVENT_NAMES].sort());
