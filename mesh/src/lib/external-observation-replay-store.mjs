import {
  lstat,
  mkdir,
  open,
  readFile,
  rename,
  unlink
} from 'node:fs/promises';
import { dirname, isAbsolute } from 'node:path';

import {
  ValidationError,
  assertPlainObject,
  assertString,
  canonicalJson,
  digestObject
} from './canonical.mjs';

export const EXTERNAL_OBSERVATION_REPLAY_STATE_SCHEMA =
  'axiom-external-observation-replay-state.v0';

const IDENTIFIER_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/;
const NONCE_PATTERN = /^[A-Za-z0-9_.:-]{16,160}$/;
const DIGEST_PATTERN = /^[a-f0-9]{64}$/;
const DEFAULT_MAX_ENTRIES = 4096;
const HARD_MAX_ENTRIES = 65536;
const DEFAULT_MAX_STATE_BYTES = 2 * 1024 * 1024;
const HARD_MAX_STATE_BYTES = 16 * 1024 * 1024;
const STATE_KEYS = Object.freeze([
  'schema',
  'version',
  'status',
  'authority_effect',
  'network_effect',
  'runtime_activation',
  'entries',
  'state_digest'
]);
const ENTRY_KEYS = Object.freeze([
  'replay_key',
  'sender_id',
  'expires_at'
]);

export async function readExternalObservationReplayState({
  state_path,
  now,
  max_entries,
  max_state_bytes
} = {}) {
  const statePath = validateStatePath(state_path);
  const nowIso = normalizeInstant(now, 'replay state now');
  const limits = normalizeLimits({ max_entries, max_state_bytes });
  const persisted = await loadPersistedState(statePath, limits.maxStateBytes);
  const activeEntries = persisted.entries.filter(entry => Date.parse(entry.expires_at) > Date.parse(nowIso));

  if (activeEntries.length > limits.maxEntries) {
    throw new ValidationError('External observation replay state exceeds configured active-entry capacity');
  }

  return freezeState(makeState(activeEntries));
}

export async function claimExternalObservationReplay({
  state_path,
  sender_id,
  nonce,
  now,
  expires_at,
  max_entries,
  max_state_bytes
} = {}) {
  const statePath = validateStatePath(state_path);
  const senderId = assertString(sender_id, 'external replay sender_id', {
    min: 1,
    max: 160,
    pattern: IDENTIFIER_PATTERN
  });
  const normalizedNonce = assertString(nonce, 'external replay nonce', {
    min: 16,
    max: 160,
    pattern: NONCE_PATTERN
  });
  const nowIso = normalizeInstant(now, 'external replay now');
  const expiresAt = normalizeInstant(expires_at, 'external replay expires_at');
  if (Date.parse(expiresAt) <= Date.parse(nowIso)) {
    throw new ValidationError('External replay expires_at must be after now');
  }

  const limits = normalizeLimits({ max_entries, max_state_bytes });
  const replayKey = digestObject({ sender_id: senderId, nonce: normalizedNonce });
  const lock = await acquireWriterLock(statePath);

  try {
    const persisted = await loadPersistedState(statePath, limits.maxStateBytes);
    const activeEntries = persisted.entries.filter(
      entry => Date.parse(entry.expires_at) > Date.parse(nowIso)
    );

    if (activeEntries.some(entry => entry.replay_key === replayKey)) {
      throw new ValidationError('External observation replay detected for sender nonce');
    }
    if (activeEntries.length >= limits.maxEntries) {
      throw new ValidationError('External observation replay state capacity is full');
    }

    const entries = [...activeEntries, {
      replay_key: replayKey,
      sender_id: senderId,
      expires_at: expiresAt
    }].sort((left, right) => left.replay_key.localeCompare(right.replay_key));
    const state = makeState(entries);
    await writeStateAtomically(statePath, state, limits.maxStateBytes);

    return Object.freeze({
      accepted: true,
      replay_key: replayKey,
      active_entries: entries.length,
      state_digest: state.state_digest,
      replay_persistence: true,
      authority_effect: 'none',
      network_effect: 'none',
      runtime_activation: false
    });
  } finally {
    await releaseWriterLock(lock);
  }
}

function makeState(entries) {
  const normalizedEntries = entries.map(normalizeEntry);
  assertUniqueReplayKeys(normalizedEntries);
  const core = {
    schema: EXTERNAL_OBSERVATION_REPLAY_STATE_SCHEMA,
    version: 0,
    status: 'durable-replay-state',
    authority_effect: 'none',
    network_effect: 'none',
    runtime_activation: false,
    entries: normalizedEntries
  };
  return {
    ...core,
    state_digest: digestObject(core)
  };
}

function normalizePersistedState(raw) {
  assertPlainObject(raw, 'external observation replay state');
  assertExactKeys(raw, 'external observation replay state', STATE_KEYS);
  if (raw.schema !== EXTERNAL_OBSERVATION_REPLAY_STATE_SCHEMA) {
    throw new ValidationError('External observation replay state schema is invalid');
  }
  if (raw.version !== 0 || raw.status !== 'durable-replay-state') {
    throw new ValidationError('External observation replay state version or status is invalid');
  }
  if (
    raw.authority_effect !== 'none'
    || raw.network_effect !== 'none'
    || raw.runtime_activation !== false
  ) {
    throw new ValidationError('External observation replay state boundary cannot grant authority or effects');
  }
  if (!Array.isArray(raw.entries)) {
    throw new ValidationError('External observation replay state entries must be an array');
  }
  const entries = raw.entries.map(normalizeEntry);
  assertUniqueReplayKeys(entries);
  const normalized = makeState(entries);
  const suppliedDigest = assertString(
    raw.state_digest,
    'external observation replay state state_digest',
    { min: 64, max: 64, pattern: DIGEST_PATTERN }
  );
  if (suppliedDigest !== normalized.state_digest) {
    throw new ValidationError('External observation replay state digest does not match normalized state');
  }
  if (canonicalJson(raw) !== canonicalJson(normalized)) {
    throw new ValidationError('External observation replay state is not canonical');
  }
  return normalized;
}

function normalizeEntry(raw) {
  assertPlainObject(raw, 'external observation replay entry');
  assertExactKeys(raw, 'external observation replay entry', ENTRY_KEYS);
  return {
    replay_key: assertString(raw.replay_key, 'external replay entry replay_key', {
      min: 64,
      max: 64,
      pattern: DIGEST_PATTERN
    }),
    sender_id: assertString(raw.sender_id, 'external replay entry sender_id', {
      min: 1,
      max: 160,
      pattern: IDENTIFIER_PATTERN
    }),
    expires_at: normalizeInstant(raw.expires_at, 'external replay entry expires_at')
  };
}

async function loadPersistedState(statePath, maxStateBytes) {
  let info;
  try {
    info = await lstat(statePath);
  } catch (error) {
    if (error?.code === 'ENOENT') return makeState([]);
    throw error;
  }
  assertRegularStateFile(info);
  if (info.size > maxStateBytes) {
    throw new ValidationError('External observation replay state exceeds configured byte limit');
  }

  let text;
  try {
    text = await readFile(statePath, 'utf8');
  } catch (error) {
    throw new ValidationError(`External observation replay state is unavailable: ${error?.code ?? 'read_failed'}`);
  }
  if (Buffer.byteLength(text, 'utf8') > maxStateBytes) {
    throw new ValidationError('External observation replay state exceeds configured byte limit');
  }

  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new ValidationError('External observation replay state contains corrupt JSON');
  }
  return normalizePersistedState(parsed);
}

async function acquireWriterLock(statePath) {
  await mkdir(dirname(statePath), { recursive: true, mode: 0o700 });
  const lockPath = `${statePath}.lock`;
  try {
    const handle = await open(lockPath, 'wx', 0o600);
    return { handle, lockPath };
  } catch (error) {
    if (error?.code === 'EEXIST') {
      throw new ValidationError('External observation replay writer lock is unavailable');
    }
    throw new ValidationError(`External observation replay writer lock failed: ${error?.code ?? 'lock_failed'}`);
  }
}

async function releaseWriterLock(lock) {
  if (!lock) return;
  try {
    await lock.handle.close();
  } finally {
    try {
      await unlink(lock.lockPath);
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
    }
  }
}

async function writeStateAtomically(statePath, state, maxStateBytes) {
  const payload = `${canonicalJson(state)}\n`;
  if (Buffer.byteLength(payload, 'utf8') > maxStateBytes) {
    throw new ValidationError('External observation replay state exceeds configured byte limit');
  }

  const tempPath = `${statePath}.tmp`;
  let handle;
  try {
    handle = await open(tempPath, 'wx', 0o600);
  } catch (error) {
    if (error?.code === 'EEXIST') {
      throw new ValidationError('External observation replay temporary state is unavailable');
    }
    throw error;
  }

  let installed = false;
  try {
    await handle.writeFile(payload, 'utf8');
    await handle.sync();
    await handle.close();
    handle = null;
    await rename(tempPath, statePath);
    installed = true;
  } finally {
    if (handle) await handle.close();
    if (!installed) {
      try {
        await unlink(tempPath);
      } catch (error) {
        if (error?.code !== 'ENOENT') throw error;
      }
    }
  }
}

function validateStatePath(value) {
  if (typeof value !== 'string' || value.length < 1 || value.length > 4096 || !isAbsolute(value)) {
    throw new ValidationError('External observation replay state_path must be an absolute path');
  }
  return value;
}

function normalizeLimits({ max_entries, max_state_bytes }) {
  return {
    maxEntries: normalizeBoundedInteger(
      max_entries,
      DEFAULT_MAX_ENTRIES,
      HARD_MAX_ENTRIES,
      'external replay max_entries'
    ),
    maxStateBytes: normalizeBoundedInteger(
      max_state_bytes,
      DEFAULT_MAX_STATE_BYTES,
      HARD_MAX_STATE_BYTES,
      'external replay max_state_bytes'
    )
  };
}

function normalizeBoundedInteger(value, fallback, hardMax, label) {
  if (value === undefined) return fallback;
  if (!Number.isSafeInteger(value) || value < 1 || value > hardMax) {
    throw new ValidationError(`${label} must be an integer between 1 and ${hardMax}`);
  }
  return value;
}

function normalizeInstant(value, label) {
  if (typeof value !== 'string') {
    throw new ValidationError(`${label} must be a canonical ISO timestamp`);
  }
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString() !== value) {
    throw new ValidationError(`${label} must be a canonical ISO timestamp`);
  }
  return value;
}

function assertRegularStateFile(info) {
  if (!info.isFile() || info.isSymbolicLink()) {
    throw new ValidationError('External observation replay state path must be a regular non-symlink file');
  }
}

function assertUniqueReplayKeys(entries) {
  const seen = new Set();
  for (const entry of entries) {
    if (seen.has(entry.replay_key)) {
      throw new ValidationError('External observation replay state contains a duplicate replay key');
    }
    seen.add(entry.replay_key);
  }
}

function assertExactKeys(value, label, expectedKeys) {
  const actual = Object.keys(value).sort();
  const expected = [...expectedKeys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    throw new ValidationError(`${label} fields are invalid`);
  }
}

function freezeState(state) {
  const entries = state.entries.map(entry => Object.freeze({ ...entry }));
  return Object.freeze({
    ...state,
    entries: Object.freeze(entries),
    replay_persistence: true
  });
}
