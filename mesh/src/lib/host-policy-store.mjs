import { randomUUID } from 'node:crypto';
import {
  open,
  readFile,
  rename,
  rm,
  stat
} from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import {
  ValidationError,
  canonicalJson,
  digestObject
} from './canonical.mjs';
import {
  normalizeContributionPolicy,
  normalizeHostProfile,
  normalizeSovereigntyReserve
} from './host-sovereignty.mjs';

const MAX_POLICY_BYTES = 65_536;
const LOCAL_AUTHORITIES = new Set(['local_owner', 'local_guardian']);

export function normalizeHostPolicySet(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new ValidationError('host policy set must be an object');
  }
  assertExactKeys(input, [
    'format',
    'revision',
    'updated_at',
    'updated_by',
    'host_profile',
    'contribution_policy',
    'sovereignty_reserve'
  ], 'host policy set');
  if (input.format !== 'host.policy-set.v1') {
    throw new ValidationError('host policy set format must be host.policy-set.v1');
  }
  if (!Number.isSafeInteger(input.revision) || input.revision < 1) {
    throw new ValidationError('host policy revision must be a positive integer');
  }
  const updatedAt = normalizeTimestamp(input.updated_at, 'updated_at');
  if (!LOCAL_AUTHORITIES.has(input.updated_by)) {
    throw new ValidationError('host policy updates require local authority');
  }
  return {
    format: 'host.policy-set.v1',
    revision: input.revision,
    updated_at: updatedAt,
    updated_by: input.updated_by,
    host_profile: normalizeHostProfile(input.host_profile),
    contribution_policy: normalizeContributionPolicy(input.contribution_policy),
    sovereignty_reserve: normalizeSovereigntyReserve(input.sovereignty_reserve)
  };
}

export async function readHostPolicySet(path) {
  let info;
  try {
    info = await stat(path);
  } catch (error) {
    throw error;
  }
  if (!info.isFile()) {
    throw new ValidationError('host policy path must be a file');
  }
  if (info.size > MAX_POLICY_BYTES) {
    throw new ValidationError('host policy file is too large');
  }
  let parsed;
  try {
    parsed = JSON.parse(await readFile(path, 'utf8'));
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new ValidationError('host policy file must contain valid JSON');
    }
    throw error;
  }
  const policySet = normalizeHostPolicySet(parsed);
  return Object.freeze({
    policy_set: Object.freeze(policySet),
    digest: digestObject(policySet)
  });
}

export async function writeHostPolicySet(path, input) {
  const policySet = normalizeHostPolicySet(input);
  try {
    const current = await readHostPolicySet(path);
    if (policySet.revision <= current.policy_set.revision) {
      throw new ValidationError(
        'host policy revision must increase monotonically'
      );
    }
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }

  const directory = dirname(path);
  const tempPath = join(
    directory,
    `.${basename(path)}.${process.pid}.${randomUUID()}.tmp`
  );
  let handle;
  try {
    handle = await open(tempPath, 'wx', 0o600);
    await handle.writeFile(`${canonicalJson(policySet)}\n`, 'utf8');
    await handle.sync();
    await handle.close();
    handle = undefined;
    await rename(tempPath, path);
    await fsyncDirectory(directory);
  } catch (error) {
    if (handle) await handle.close().catch(() => {});
    await rm(tempPath, { force: true }).catch(() => {});
    throw error;
  }
  return Object.freeze({
    policy_set: Object.freeze(policySet),
    digest: digestObject(policySet)
  });
}

async function fsyncDirectory(directory) {
  let handle;
  try {
    handle = await open(directory, 'r');
    await handle.sync();
  } catch (error) {
    if (!['EINVAL', 'EPERM', 'EISDIR', 'ENOTSUP'].includes(error?.code)) {
      throw error;
    }
  } finally {
    if (handle) await handle.close().catch(() => {});
  }
}

function assertExactKeys(value, expected, name) {
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (
    actual.length !== wanted.length
    || actual.some((key, index) => key !== wanted[index])
  ) {
    throw new ValidationError(
      `${name} must contain exactly: ${wanted.join(', ')}`
    );
  }
}

function normalizeTimestamp(value, name) {
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value))) {
    throw new ValidationError(`${name} must be an ISO timestamp`);
  }
  return new Date(value).toISOString();
}
