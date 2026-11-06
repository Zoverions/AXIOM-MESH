import { constants } from 'node:fs';
import {
  access,
  lstat,
  mkdir,
  rename,
  rm,
  writeFile
} from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { dirname } from 'node:path';
import { performance } from 'node:perf_hooks';

const WINDOWS_TRANSIENT_RENAME_CODES = new Set(['EACCES', 'EBUSY', 'EPERM']);
const MAX_DEADLINE_MS = 10_000;

function codedError(code, message, cause) {
  return Object.assign(new Error(message, cause ? { cause } : undefined), { code });
}

function identity(stat) {
  return {
    birthtimeMs: stat.birthtimeMs,
    ctimeMs: stat.ctimeMs,
    dev: stat.dev,
    ino: stat.ino,
    size: stat.size
  };
}

function sameIdentity(left, right) {
  return left.birthtimeMs === right.birthtimeMs
    && left.ctimeMs === right.ctimeMs
    && left.dev === right.dev
    && left.ino === right.ino
    && left.size === right.size;
}

async function statPath(path) {
  try {
    return await lstat(path, { bigint: true });
  } catch (error) {
    if (error?.code === 'ENOENT') return null;
    throw error;
  }
}

async function inspectRegularFile(path, role, { allowMissing = false } = {}) {
  const stat = await statPath(path);
  if (!stat) {
    if (allowMissing) return null;
    throw codedError('ENOENT', `${role} does not exist: ${path}`);
  }
  if (stat.isSymbolicLink()) {
    throw codedError('ELOOP', `${role} must not be a symbolic link: ${path}`);
  }
  if (stat.isDirectory()) {
    throw codedError('EISDIR', `${role} must not be a directory: ${path}`);
  }
  if (!stat.isFile()) {
    throw codedError('EINVAL', `${role} must be a regular file: ${path}`);
  }
  return stat;
}

async function assertWritableTarget(path, stat) {
  if ((stat.mode & 0o222n) === 0n) {
    throw codedError('EACCES', `destination is read-only: ${path}`);
  }
  try {
    await access(path, constants.W_OK);
  } catch (error) {
    throw codedError('EACCES', `destination is not writable: ${path}`, error);
  }
}

async function assertRetryIdentity(path, expected, role, { allowMissing = false } = {}) {
  const current = await inspectRegularFile(path, role, { allowMissing });
  if (!current && expected === null) return;
  if (!current || expected === null || !sameIdentity(identity(current), expected)) {
    throw codedError('ESTALE', `${role} changed while atomic publication was pending: ${path}`);
  }
}

function validateDeadline(deadlineMs) {
  if (!Number.isInteger(deadlineMs) || deadlineMs < 1 || deadlineMs > MAX_DEADLINE_MS) {
    throw codedError('EINVAL', `deadlineMs must be an integer between 1 and ${MAX_DEADLINE_MS}`);
  }
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

export async function replaceFileWithWindowsRetry(source, destination, { deadlineMs = MAX_DEADLINE_MS } = {}) {
  validateDeadline(deadlineMs);

  const sourceStat = await inspectRegularFile(source, 'source');
  const destinationStat = await inspectRegularFile(destination, 'destination', { allowMissing: true });
  if (destinationStat) await assertWritableTarget(destination, destinationStat);

  const sourceIdentity = identity(sourceStat);
  const destinationIdentity = destinationStat ? identity(destinationStat) : null;
  const deadline = performance.now() + deadlineMs;
  let waitMs = 20;

  for (;;) {
    await assertRetryIdentity(source, sourceIdentity, 'source');
    await assertRetryIdentity(destination, destinationIdentity, 'destination', {
      allowMissing: true
    });
    try {
      await rename(source, destination);
      return;
    } catch (error) {
      const transientWindowsLock = process.platform === 'win32'
        && destinationIdentity !== null
        && WINDOWS_TRANSIENT_RENAME_CODES.has(error?.code);
      if (!transientWindowsLock || performance.now() >= deadline) throw error;

      await assertRetryIdentity(source, sourceIdentity, 'source');
      await assertRetryIdentity(destination, destinationIdentity, 'destination');

      const remaining = deadline - performance.now();
      if (remaining <= 0) throw error;
      await delay(Math.min(waitMs, remaining));
      waitMs = Math.min(waitMs * 2, 500);
    }
  }
}

export async function writeFileAtomically(path, content, mode) {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  const temporary = `${path}.${process.pid}.${randomUUID()}.tmp`;

  try {
    await writeFile(temporary, content, { mode, flag: 'wx' });
    await replaceFileWithWindowsRetry(temporary, path);
  } catch (error) {
    await rm(temporary, { force: true }).catch(() => {});
    throw error;
  }
}
