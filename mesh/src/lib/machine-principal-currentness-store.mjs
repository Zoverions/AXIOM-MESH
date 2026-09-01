import { dirname } from 'node:path';
import { lstat, mkdir, open, readFile } from 'node:fs/promises';

import { ValidationError, canonicalJson } from './canonical.mjs';
import {
  validateMachinePrincipalCurrentnessCheckpointTransition,
  verifyMachinePrincipalCurrentnessCheckpoint
} from './machine-principal-currentness-checkpoint.mjs';

export const MACHINE_PRINCIPAL_CURRENTNESS_STORE_SCHEMA =
  'axiom-machine-principal-currentness-store.v1';

const DEFAULT_MAX_STATE_BYTES = 32 * 1024 * 1024;
const HARD_MAX_STATE_BYTES = 256 * 1024 * 1024;
const DEFAULT_MAX_CHECKPOINT_BYTES = 1024 * 1024;
const HARD_MAX_CHECKPOINT_BYTES = 8 * 1024 * 1024;

const FIXED_NONCLAIMS = Object.freeze({
  state_path_disclosed: false,
  local_durable_retention_claimed: true,
  storage_rollback_proof_claimed: false,
  hardware_monotonicity_claimed: false,
  external_witness_claimed: false,
  global_currentness_claimed: false,
  authority_effect: 'none',
  execution_authority_granted: false,
  capability_promotion_effect: 'none'
});

function boundedPositiveInteger(value, fallback, hardMaximum, label) {
  const candidate = value ?? fallback;
  if (!Number.isSafeInteger(candidate) || candidate < 1 || candidate > hardMaximum) {
    throw new ValidationError(`${label} must be an integer from 1 to ${hardMaximum}`);
  }
  return candidate;
}

function requireStatePath(value) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new ValidationError('Machine principal currentness durable state path must be a non-empty string');
  }
  return value;
}

function requirePrincipalId(value) {
  if (
    typeof value !== 'string'
    || !/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/.test(value)
  ) {
    throw new ValidationError('Machine principal currentness expected principal id is invalid');
  }
  return value;
}

function requirePrincipalType(value) {
  if (value !== 'agent' && value !== 'service') {
    throw new ValidationError('Machine principal currentness expected principal type is invalid');
  }
  return value;
}

function checkpointSequence(checkpoint) {
  return checkpoint.statement.sequence;
}

function stateText(checkpoints) {
  return checkpoints.length === 0
    ? ''
    : `${checkpoints.map(checkpoint => canonicalJson(checkpoint)).join('\n')}\n`;
}

function sameRetainedHistory(left, right) {
  if (left.length !== right.length) return false;
  return left.every((checkpoint, index) => (
    checkpoint.checkpoint_digest === right[index].checkpoint_digest
  ));
}

async function ensureRegularNonSymlink(path, { allowMissing = false } = {}) {
  let stats;
  try {
    stats = await lstat(path);
  } catch (error) {
    if (allowMissing && error?.code === 'ENOENT') return null;
    throw error;
  }
  if (stats.isSymbolicLink() || !stats.isFile()) {
    throw new ValidationError(
      'Machine principal currentness durable state path must resolve to a regular non-symlink file'
    );
  }
  return stats;
}

async function createStateFileIfMissing(path) {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  const existing = await ensureRegularNonSymlink(path, { allowMissing: true });
  if (existing) return;
  try {
    const handle = await open(path, 'ax', 0o600);
    try {
      await handle.sync();
    } finally {
      await handle.close();
    }
  } catch (error) {
    if (error?.code !== 'EEXIST') throw error;
  }
  await ensureRegularNonSymlink(path);
}

function verifyCheckpoint(raw, trust, retainedCheckpoint = null) {
  return verifyMachinePrincipalCurrentnessCheckpoint(raw, {
    trustedControllerPublicKey: trust.trustedControllerPublicKey,
    expectedPrincipalId: trust.expectedPrincipalId,
    expectedPrincipalType: trust.expectedPrincipalType,
    retainedCheckpoint
  });
}

function verifyCheckpointPath(checkpoints, trust) {
  if (checkpoints.length === 0) return null;
  if (checkpointSequence(checkpoints[0]) !== 1) {
    throw new ValidationError(
      'Machine principal currentness durable checkpoint path must begin at sequence 1; truncated path rejected'
    );
  }
  for (let index = 1; index < checkpoints.length; index += 1) {
    validateMachinePrincipalCurrentnessCheckpointTransition(
      checkpoints[index - 1],
      checkpoints[index],
      { trustedControllerPublicKey: trust.trustedControllerPublicKey }
    );
  }
  return checkpoints.at(-1);
}

async function readVerifiedState(path, limits, trust) {
  const stats = await ensureRegularNonSymlink(path);
  if (stats.size > limits.maxStateBytes) {
    throw new ValidationError('Machine principal currentness durable state exceeds configured byte limit');
  }
  const text = await readFile(path, 'utf8');
  if (text === '') return Object.freeze({ text, checkpoints: Object.freeze([]) });
  if (!text.endsWith('\n')) {
    throw new ValidationError(
      'Machine principal currentness durable state has an incomplete trailing checkpoint; torn write rejected'
    );
  }

  const lines = text.slice(0, -1).split('\n');
  const checkpoints = [];
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (line.length === 0) {
      throw new ValidationError(
        'Machine principal currentness durable state must contain canonical JSON records'
      );
    }
    if (Buffer.byteLength(line, 'utf8') > limits.maxCheckpointBytes) {
      throw new ValidationError(
        `Machine principal currentness durable checkpoint ${index + 1} exceeds configured byte limit`
      );
    }
    let parsed;
    try {
      parsed = JSON.parse(line);
    } catch {
      throw new ValidationError(
        'Machine principal currentness durable state must contain canonical JSON records'
      );
    }
    if (canonicalJson(parsed) !== line) {
      throw new ValidationError(
        'Machine principal currentness durable state must contain canonical JSON records'
      );
    }
    checkpoints.push(verifyCheckpoint(parsed, trust));
  }
  verifyCheckpointPath(checkpoints, trust);
  return Object.freeze({ text, checkpoints: Object.freeze(checkpoints) });
}

function snapshotProjection(checkpoints) {
  const head = checkpoints.at(-1) ?? null;
  return Object.freeze({
    schema: MACHINE_PRINCIPAL_CURRENTNESS_STORE_SCHEMA,
    durable_checkpoint_count: checkpoints.length,
    durable_head_checkpoint_sequence: head ? checkpointSequence(head) : null,
    durable_head_checkpoint_digest: head?.checkpoint_digest ?? null,
    durable_source_head_digest: head?.statement.source_head_digest ?? null,
    principal_id: head?.statement.principal_id ?? null,
    principal_type: head?.statement.principal_type ?? null,
    authority_digest: head?.statement.authority_digest ?? null,
    status: head?.statement.status ?? null,
    observed_at: head?.statement.observed_at ?? null,
    ...FIXED_NONCLAIMS
  });
}

class MachinePrincipalCurrentnessStore {
  #statePath;
  #limits;
  #trust;
  #checkpoints;
  #tail = Promise.resolve();

  constructor({ statePath, limits, trust, checkpoints }) {
    this.#statePath = statePath;
    this.#limits = limits;
    this.#trust = trust;
    this.#checkpoints = [...checkpoints];
  }

  snapshot() {
    return snapshotProjection(this.#checkpoints);
  }

  retainedHead() {
    return this.#checkpoints.at(-1) ?? null;
  }

  async verifyState() {
    const disk = await readVerifiedState(this.#statePath, this.#limits, this.#trust);
    if (!sameRetainedHistory(disk.checkpoints, this.#checkpoints)) {
      throw new ValidationError(
        'Machine principal currentness durable state changed outside active store; disk and memory histories differ'
      );
    }
    return Object.freeze({
      valid: true,
      checkpoint_count: disk.checkpoints.length,
      ...snapshotProjection(disk.checkpoints)
    });
  }

  async retain(rawCheckpoint) {
    return this.#enqueue(async () => this.#retain(rawCheckpoint));
  }

  async #retain(rawCheckpoint) {
    const head = this.#checkpoints.at(-1) ?? null;
    const candidate = verifyCheckpoint(rawCheckpoint, this.#trust, head);
    const disk = await readVerifiedState(this.#statePath, this.#limits, this.#trust);
    if (!sameRetainedHistory(disk.checkpoints, this.#checkpoints)) {
      throw new ValidationError(
        'Machine principal currentness durable state changed outside active store; disk and memory histories differ'
      );
    }

    const candidateSequence = checkpointSequence(candidate);
    if (!head) {
      if (candidateSequence !== 1) {
        throw new ValidationError(
          'Machine principal currentness durable store first retained checkpoint must be genesis sequence 1'
        );
      }
    } else {
      const headSequence = checkpointSequence(head);
      if (candidateSequence < headSequence) {
        throw new ValidationError(
          'Machine principal currentness durable checkpoint rollback rejected: checkpoint is older than retained head'
        );
      }
      if (candidateSequence === headSequence) {
        if (candidate.checkpoint_digest === head.checkpoint_digest) {
          return Object.freeze({
            status: 'already-retained',
            checkpoint_sequence: candidateSequence,
            checkpoint_digest: candidate.checkpoint_digest,
            ...FIXED_NONCLAIMS
          });
        }
        throw new ValidationError(
          'Machine principal currentness durable checkpoint equivocation rejected: same sequence has a different signed digest'
        );
      }
      if (candidateSequence !== headSequence + 1) {
        throw new ValidationError(
          'Machine principal currentness durable checkpoint must advance by one; sequence gap rejected'
        );
      }
      validateMachinePrincipalCurrentnessCheckpointTransition(head, candidate, {
        trustedControllerPublicKey: this.#trust.trustedControllerPublicKey
      });
    }

    const proposed = [...this.#checkpoints, candidate];
    const line = `${canonicalJson(candidate)}\n`;
    if (Buffer.byteLength(line.slice(0, -1), 'utf8') > this.#limits.maxCheckpointBytes) {
      throw new ValidationError(
        `Machine principal currentness durable checkpoint ${candidateSequence} exceeds configured byte limit`
      );
    }
    if (Buffer.byteLength(stateText(proposed), 'utf8') > this.#limits.maxStateBytes) {
      throw new ValidationError('Machine principal currentness durable state exceeds configured byte limit');
    }

    const beforeOpen = await ensureRegularNonSymlink(this.#statePath);
    const handle = await open(this.#statePath, 'a', 0o600);
    try {
      const opened = await handle.stat();
      if (
        typeof beforeOpen.dev === 'number'
        && typeof beforeOpen.ino === 'number'
        && typeof opened.dev === 'number'
        && typeof opened.ino === 'number'
        && (beforeOpen.dev !== opened.dev || beforeOpen.ino !== opened.ino)
      ) {
        throw new ValidationError(
          'Machine principal currentness durable state changed outside active store during append'
        );
      }
      await handle.writeFile(line, 'utf8');
      await handle.sync();
    } finally {
      await handle.close();
    }

    this.#checkpoints = proposed;
    return Object.freeze({
      status: 'retained',
      checkpoint_sequence: candidateSequence,
      checkpoint_digest: candidate.checkpoint_digest,
      durable_checkpoint_count: this.#checkpoints.length,
      ...FIXED_NONCLAIMS
    });
  }

  #enqueue(operation) {
    const pending = this.#tail.then(operation, operation);
    this.#tail = pending.catch(() => {});
    return pending;
  }
}

export async function openMachinePrincipalCurrentnessStore({
  statePath,
  trustedControllerPublicKey,
  expectedPrincipalId,
  expectedPrincipalType,
  maxStateBytes,
  maxCheckpointBytes
} = {}) {
  const normalizedPath = requireStatePath(statePath);
  const limits = Object.freeze({
    maxStateBytes: boundedPositiveInteger(
      maxStateBytes,
      DEFAULT_MAX_STATE_BYTES,
      HARD_MAX_STATE_BYTES,
      'Machine principal currentness durable maximum state bytes'
    ),
    maxCheckpointBytes: boundedPositiveInteger(
      maxCheckpointBytes,
      DEFAULT_MAX_CHECKPOINT_BYTES,
      HARD_MAX_CHECKPOINT_BYTES,
      'Machine principal currentness durable maximum checkpoint bytes'
    )
  });
  const trust = Object.freeze({
    trustedControllerPublicKey,
    expectedPrincipalId: requirePrincipalId(expectedPrincipalId),
    expectedPrincipalType: requirePrincipalType(expectedPrincipalType)
  });

  await createStateFileIfMissing(normalizedPath);
  const disk = await readVerifiedState(normalizedPath, limits, trust);
  return new MachinePrincipalCurrentnessStore({
    statePath: normalizedPath,
    limits,
    trust,
    checkpoints: disk.checkpoints
  });
}
