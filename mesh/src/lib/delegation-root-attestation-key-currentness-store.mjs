import { dirname } from 'node:path';
import { lstat, mkdir, open, readFile } from 'node:fs/promises';

import { ValidationError, canonicalJson } from './canonical.mjs';
import {
  validateDelegationRootAttestationKeyCurrentnessCheckpointPath,
  verifyDelegationRootAttestationKeyCurrentnessCheckpoint
} from './delegation-root-attestation-key-currentness-checkpoint.mjs';
import {
  verifyDelegationRootAttestationKeyCurrentnessAnchor
} from './delegation-root-attestation-key-currentness-anchor.mjs';

export const DELEGATION_ROOT_ATTESTATION_KEY_CURRENTNESS_STORE_SCHEMA =
  'axiom-delegation-root-attestation-key-currentness-store.v1';

const DEFAULT_MAX_STATE_BYTES = 64 * 1024 * 1024;
const HARD_MAX_STATE_BYTES = 512 * 1024 * 1024;
const DEFAULT_MAX_CHECKPOINT_BYTES = 2 * 1024 * 1024;
const HARD_MAX_CHECKPOINT_BYTES = 16 * 1024 * 1024;
const DIGEST_PATTERN = /^[a-f0-9]{64}$/;

const FIXED_NONCLAIMS = Object.freeze({
  state_path_disclosed: false,
  local_durable_retention_claimed: true,
  storage_rollback_proof_claimed: false,
  hardware_monotonicity_claimed: false,
  global_currentness_claimed: false,
  external_timestamp_claimed: false,
  external_anchor_storage_independence_proved: false,
  external_anchor_monotonicity_proved: false,
  authority_effect: 'none',
  delegation_effect: 'none',
  execution_authority_granted: false,
  capability_promotion_effect: 'none',
  network_effect: 'none'
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
    throw new ValidationError('Delegation currentness durable state path must be a non-empty string');
  }
  return value;
}

function requireExpectedDigest(value, label) {
  if (value === undefined || value === null || value === '') {
    throw new ValidationError(`${label} is required`);
  }
  if (typeof value !== 'string' || !DIGEST_PATTERN.test(value)) {
    throw new ValidationError(`${label} must be a lowercase SHA-256 digest`);
  }
  return value;
}

function requireExpectedRootHolder(value) {
  if (typeof value !== 'string' || value.length === 0 || value.trim() !== value) {
    throw new ValidationError('Delegation currentness expected root holder is required');
  }
  return value;
}

function normalizeExternalAnchorPair(retainedExternalAnchor, trustedExternalWitnessPublicKey) {
  const hasAnchor = retainedExternalAnchor !== undefined && retainedExternalAnchor !== null;
  const hasWitnessKey = trustedExternalWitnessPublicKey !== undefined
    && trustedExternalWitnessPublicKey !== null;
  if (hasAnchor !== hasWitnessKey) {
    throw new ValidationError(
      'Delegation currentness external anchor and trusted external witness public key are required together'
    );
  }
  if (!hasAnchor) return null;
  return Object.freeze({
    anchor: retainedExternalAnchor,
    trustedWitnessPublicKey: trustedExternalWitnessPublicKey
  });
}

function checkpointSequence(checkpoint) {
  return checkpoint.statement.checkpoint_sequence;
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
      'Delegation currentness durable state path must resolve to a regular non-symlink file'
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

function verifyCheckpoint(raw, trust) {
  return verifyDelegationRootAttestationKeyCurrentnessCheckpoint(raw, {
    trustedControllerPublicKey: trust.trustedControllerPublicKey,
    expectedRootBindingDigest: trust.expectedRootBindingDigest,
    expectedRootAuthorityDigest: trust.expectedRootAuthorityDigest,
    expectedRootHolder: trust.expectedRootHolder
  });
}

function verifyCheckpointPath(checkpoints, trust) {
  if (checkpoints.length === 0) return null;
  if (checkpointSequence(checkpoints[0]) !== 1) {
    throw new ValidationError(
      'Delegation currentness durable checkpoint path must begin at sequence 1; truncated path rejected'
    );
  }
  return validateDelegationRootAttestationKeyCurrentnessCheckpointPath(checkpoints, {
    trustedControllerPublicKey: trust.trustedControllerPublicKey,
    expectedRootBindingDigest: trust.expectedRootBindingDigest,
    expectedRootAuthorityDigest: trust.expectedRootAuthorityDigest,
    expectedRootHolder: trust.expectedRootHolder
  });
}

function externalAnchorSequence(rawAnchor) {
  const sequence = rawAnchor?.statement?.checkpoint_sequence;
  if (!Number.isSafeInteger(sequence) || sequence < 1) {
    throw new ValidationError(
      'Delegation currentness external anchor has an invalid anchored checkpoint sequence'
    );
  }
  return sequence;
}

function verifyExternalAnchorAgainstState(checkpoints, trust, externalAnchorTrust) {
  if (externalAnchorTrust === null) return null;
  const sequence = externalAnchorSequence(externalAnchorTrust.anchor);
  if (checkpoints.length < sequence) {
    throw new ValidationError(
      'Delegation currentness external anchor rollback detected: anchored checkpoint is missing from local durable history'
    );
  }
  const anchoredCheckpoint = checkpoints[sequence - 1];
  try {
    return verifyDelegationRootAttestationKeyCurrentnessAnchor(
      externalAnchorTrust.anchor,
      {
        trustedWitnessPublicKey: externalAnchorTrust.trustedWitnessPublicKey,
        trustedControllerPublicKey: trust.trustedControllerPublicKey,
        anchoredCheckpoint,
        expectedRootBindingDigest: trust.expectedRootBindingDigest,
        expectedRootAuthorityDigest: trust.expectedRootAuthorityDigest,
        expectedRootHolder: trust.expectedRootHolder
      }
    );
  } catch (error) {
    if (error instanceof ValidationError && /checkpoint.*digest|equivocation/i.test(error.message)) {
      throw new ValidationError(
        `Delegation currentness external anchor equivocation detected: anchored checkpoint digest does not match local durable history (${error.message})`
      );
    }
    throw error;
  }
}

async function readVerifiedState(path, limits, trust) {
  const stats = await ensureRegularNonSymlink(path);
  if (stats.size > limits.maxStateBytes) {
    throw new ValidationError('Delegation currentness durable state exceeds configured byte limit');
  }

  const text = await readFile(path, 'utf8');
  if (text === '') {
    return Object.freeze({ text, checkpoints: Object.freeze([]), path: null });
  }
  if (!text.endsWith('\n')) {
    throw new ValidationError(
      'Delegation currentness durable state has an incomplete trailing checkpoint; torn write rejected'
    );
  }

  const lines = text.slice(0, -1).split('\n');
  const checkpoints = [];
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const sequenceLabel = index + 1;
    const lineBytes = Buffer.byteLength(line, 'utf8');
    if (lineBytes > limits.maxCheckpointBytes) {
      throw new ValidationError(
        `Delegation currentness durable checkpoint ${sequenceLabel} exceeds configured byte limit`
      );
    }
    if (line.length === 0) {
      throw new ValidationError('Delegation currentness durable state must contain canonical JSON records');
    }

    let parsed;
    try {
      parsed = JSON.parse(line);
    } catch {
      throw new ValidationError('Delegation currentness durable state must contain canonical JSON records');
    }
    if (canonicalJson(parsed) !== line) {
      throw new ValidationError('Delegation currentness durable state must contain canonical JSON records');
    }
    checkpoints.push(verifyCheckpoint(parsed, trust));
  }

  const pathSummary = verifyCheckpointPath(checkpoints, trust);
  return Object.freeze({
    text,
    checkpoints: Object.freeze(checkpoints),
    path: pathSummary
  });
}

function externalAnchorProjection(externalAnchor) {
  return Object.freeze({
    retained_external_anchor_checked: externalAnchor !== null,
    external_anchor_digest: externalAnchor?.anchor_digest ?? null,
    external_anchor_checkpoint_sequence: externalAnchor?.statement.checkpoint_sequence ?? null,
    rollback_checked_relative_to_external_anchor: externalAnchor !== null
  });
}

function verificationProjection(checkpoints, externalAnchor = null) {
  const head = checkpoints.at(-1) ?? null;
  return Object.freeze({
    valid: true,
    schema: DELEGATION_ROOT_ATTESTATION_KEY_CURRENTNESS_STORE_SCHEMA,
    checkpoint_count: checkpoints.length,
    head_checkpoint_sequence: head ? checkpointSequence(head) : null,
    head_checkpoint_digest: head?.checkpoint_digest ?? null,
    root_binding_digest: head?.statement.root_binding_digest ?? null,
    root_authority_digest: head?.statement.root_authority_digest ?? null,
    root_holder: head?.statement.root_holder ?? null,
    ...externalAnchorProjection(externalAnchor),
    ...FIXED_NONCLAIMS
  });
}

function snapshotProjection(checkpoints, externalAnchor = null) {
  const head = checkpoints.at(-1) ?? null;
  return Object.freeze({
    schema: DELEGATION_ROOT_ATTESTATION_KEY_CURRENTNESS_STORE_SCHEMA,
    durable_checkpoint_count: checkpoints.length,
    durable_head_checkpoint_sequence: head ? checkpointSequence(head) : null,
    durable_head_checkpoint_digest: head?.checkpoint_digest ?? null,
    root_binding_digest: head?.statement.root_binding_digest ?? null,
    root_authority_digest: head?.statement.root_authority_digest ?? null,
    root_holder: head?.statement.root_holder ?? null,
    ...externalAnchorProjection(externalAnchor),
    ...FIXED_NONCLAIMS
  });
}

class DelegationRootAttestationKeyCurrentnessStore {
  #statePath;
  #limits;
  #trust;
  #externalAnchorTrust;
  #externalAnchor;
  #checkpoints;
  #tail = Promise.resolve();

  constructor({ statePath, limits, trust, externalAnchorTrust, externalAnchor, checkpoints }) {
    this.#statePath = statePath;
    this.#limits = limits;
    this.#trust = trust;
    this.#externalAnchorTrust = externalAnchorTrust;
    this.#externalAnchor = externalAnchor;
    this.#checkpoints = [...checkpoints];
  }

  snapshot() {
    return snapshotProjection(this.#checkpoints, this.#externalAnchor);
  }

  async verifyState() {
    const disk = await readVerifiedState(this.#statePath, this.#limits, this.#trust);
    if (!sameRetainedHistory(disk.checkpoints, this.#checkpoints)) {
      throw new ValidationError(
        'Delegation currentness durable state changed outside active store; disk and memory histories differ'
      );
    }
    const externalAnchor = verifyExternalAnchorAgainstState(
      disk.checkpoints,
      this.#trust,
      this.#externalAnchorTrust
    );
    return verificationProjection(disk.checkpoints, externalAnchor);
  }

  async retain(rawCheckpoint) {
    return this.#enqueue(async () => this.#retain(rawCheckpoint));
  }

  async #retain(rawCheckpoint) {
    const candidate = verifyCheckpoint(rawCheckpoint, this.#trust);
    const disk = await readVerifiedState(this.#statePath, this.#limits, this.#trust);
    if (!sameRetainedHistory(disk.checkpoints, this.#checkpoints)) {
      throw new ValidationError(
        'Delegation currentness durable state changed outside active store; disk and memory histories differ'
      );
    }
    verifyExternalAnchorAgainstState(
      disk.checkpoints,
      this.#trust,
      this.#externalAnchorTrust
    );

    const head = this.#checkpoints.at(-1) ?? null;
    const candidateSequence = checkpointSequence(candidate);
    if (!head) {
      if (candidateSequence !== 1) {
        throw new ValidationError(
          'Delegation currentness durable store first retained checkpoint must be genesis sequence 1'
        );
      }
    } else {
      const headSequence = checkpointSequence(head);
      if (candidateSequence < headSequence) {
        throw new ValidationError(
          'Delegation currentness durable checkpoint rollback rejected: checkpoint is older than retained head'
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
          'Delegation currentness durable checkpoint equivocation rejected: same sequence has a different signed digest'
        );
      }
      if (candidateSequence !== headSequence + 1) {
        throw new ValidationError(
          'Delegation currentness durable checkpoint must advance by one; sequence gap rejected'
        );
      }
    }

    const proposed = [...this.#checkpoints, candidate];
    verifyCheckpointPath(proposed, this.#trust);

    const line = `${canonicalJson(candidate)}\n`;
    const checkpointBytes = Buffer.byteLength(line.slice(0, -1), 'utf8');
    if (checkpointBytes > this.#limits.maxCheckpointBytes) {
      throw new ValidationError(
        `Delegation currentness durable checkpoint ${candidateSequence} exceeds configured byte limit`
      );
    }
    const proposedStateBytes = Buffer.byteLength(stateText(proposed), 'utf8');
    if (proposedStateBytes > this.#limits.maxStateBytes) {
      throw new ValidationError('Delegation currentness durable state exceeds configured byte limit');
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
          'Delegation currentness durable state changed outside active store during append'
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

export async function openDelegationRootAttestationKeyCurrentnessStore({
  statePath,
  trustedControllerPublicKey,
  expectedRootBindingDigest,
  expectedRootAuthorityDigest,
  expectedRootHolder,
  retainedExternalAnchor,
  trustedExternalWitnessPublicKey,
  maxStateBytes,
  maxCheckpointBytes
} = {}) {
  const normalizedPath = requireStatePath(statePath);
  const limits = Object.freeze({
    maxStateBytes: boundedPositiveInteger(
      maxStateBytes,
      DEFAULT_MAX_STATE_BYTES,
      HARD_MAX_STATE_BYTES,
      'Delegation currentness durable maximum state bytes'
    ),
    maxCheckpointBytes: boundedPositiveInteger(
      maxCheckpointBytes,
      DEFAULT_MAX_CHECKPOINT_BYTES,
      HARD_MAX_CHECKPOINT_BYTES,
      'Delegation currentness durable maximum checkpoint bytes'
    )
  });
  const trust = Object.freeze({
    trustedControllerPublicKey,
    expectedRootBindingDigest: requireExpectedDigest(
      expectedRootBindingDigest,
      'Delegation currentness expected root binding digest'
    ),
    expectedRootAuthorityDigest: requireExpectedDigest(
      expectedRootAuthorityDigest,
      'Delegation currentness expected root authority digest'
    ),
    expectedRootHolder: requireExpectedRootHolder(expectedRootHolder)
  });
  const externalAnchorInput = normalizeExternalAnchorPair(
    retainedExternalAnchor,
    trustedExternalWitnessPublicKey
  );

  await createStateFileIfMissing(normalizedPath);
  const disk = await readVerifiedState(normalizedPath, limits, trust);
  const externalAnchor = verifyExternalAnchorAgainstState(
    disk.checkpoints,
    trust,
    externalAnchorInput
  );
  const externalAnchorTrust = externalAnchorInput === null
    ? null
    : Object.freeze({
      anchor: externalAnchor,
      trustedWitnessPublicKey: externalAnchorInput.trustedWitnessPublicKey
    });
  return new DelegationRootAttestationKeyCurrentnessStore({
    statePath: normalizedPath,
    limits,
    trust,
    externalAnchorTrust,
    externalAnchor,
    checkpoints: disk.checkpoints
  });
}
