import {
  closeSync,
  fsyncSync,
  ftruncateSync,
  mkdirSync,
  openSync,
  readFileSync,
  rmSync,
  writeSync
} from 'node:fs';
import { dirname } from 'node:path';
import { canonicalJson, sha256, ValidationError } from './canonical.mjs';

/**
 * A durable spend-once store for attestation nullifiers (laboratory).
 *
 * The Praxis attestation gate spends a nullifier through an injectable
 * store (`createNullifierRegistry({ store })` in labs/praxis/attestation.mjs,
 * which exposes only `has` and `set`). Praxis modules never touch the file
 * system, so persistence belongs to the host that owns replay state; this is
 * that store. It is not wired to any service.
 *
 * - Append-only JSON Lines, one spend per line, each hash-linked to the one
 *   before (`previous` is the digest of the previous line's body).
 * - A spend is written and fsynced before `set` returns, so a spend that was
 *   acknowledged survives a crash.
 * - A final line cut short by a crash was never acknowledged: opening
 *   removes it. Any other damage (an edited, removed or reordered line, a
 *   malformed value or a repeated nullifier) fails closed.
 * - One process at a time: opening takes an exclusive lock file, taken over
 *   only from a process that no longer runs.
 * - Removing whole lines from the end cannot be told from a shorter history
 *   by the file alone. A caller that records `head()` elsewhere (a signed
 *   ledger, say) passes it back as `expectedHead`, and a store that is behind
 *   or differs refuses to open.
 */

export const NULLIFIER_SPEND_SCHEMA = 'praxis-nullifier-spend.v0';
const NULLIFIER = /^sha256:[a-f0-9]{64}$/;
const DIGEST = /^[a-f0-9]{64}$/;
const MAX_FILE_BYTES = 64 * 1024 * 1024;

export function openDurableNullifierStore(path, { expectedHead = null } = {}) {
  if (typeof path !== 'string' || !path.length) throw new ValidationError('Nullifier store path is required');
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  const lock = acquireLock(`${path}.lock`);
  let fd;
  try {
    fd = openSync(path, 'a+', 0o600);
    const { spent, head, digests, validLength } = load(path);
    if (validLength !== null) {
      // A torn final line: the spend it began was never acknowledged.
      ftruncateSync(fd, validLength);
      fsyncSync(fd);
    }
    if (expectedHead !== null) checkExpectedHead(digests, expectedHead);
    let current = head;
    let closed = false;
    const requireOpen = () => {
      if (closed) throw new ValidationError('Nullifier store is closed');
    };
    return Object.freeze({
      schema: 'praxis-durable-nullifier-store.v0',
      has(nullifier) {
        requireOpen();
        return spent.has(nullifier);
      },
      set(nullifier, spentAtMs) {
        requireOpen();
        if (typeof nullifier !== 'string' || !NULLIFIER.test(nullifier)) {
          throw new ValidationError('Nullifier is invalid');
        }
        if (!Number.isSafeInteger(spentAtMs) || spentAtMs < 0) {
          throw new ValidationError('Nullifier spend time is invalid');
        }
        if (spent.has(nullifier)) throw new ValidationError('Nullifier has already been spent');
        const body = {
          schema: NULLIFIER_SPEND_SCHEMA,
          seq: current.seq + 1,
          nullifier,
          spent_at_ms: spentAtMs,
          previous: current.digest
        };
        writeSync(fd, `${canonicalJson(body)}\n`);
        fsyncSync(fd);
        spent.set(nullifier, spentAtMs);
        current = { seq: body.seq, digest: sha256(canonicalJson(body)) };
        digests.push(current.digest);
        return this;
      },
      /** The last spend's sequence and digest, to record outside the file. */
      head() {
        return Object.freeze({ ...current });
      },
      get size() {
        return spent.size;
      },
      close() {
        if (closed) return;
        closed = true;
        closeSync(fd);
        lock.release();
      }
    });
  } catch (error) {
    if (fd !== undefined) closeSync(fd);
    lock.release();
    throw error;
  }
}

function load(path) {
  const bytes = readFileSync(path);
  if (bytes.length > MAX_FILE_BYTES) throw new ValidationError('Nullifier store is too large');
  const text = bytes.toString('utf8');
  const spent = new Map();
  // digests[seq] is the digest of spend `seq`; digests[0] is the empty store.
  const digests = [null];
  let head = { seq: 0, digest: null };
  let offset = 0;
  let validLength = null;
  while (offset < text.length) {
    const end = text.indexOf('\n', offset);
    if (end === -1) {
      // Only the final line may be incomplete.
      validLength = Buffer.byteLength(text.slice(0, offset));
      break;
    }
    const line = text.slice(offset, end);
    let body;
    try {
      body = JSON.parse(line);
    } catch {
      throw new ValidationError(`Nullifier store line ${head.seq + 1} is malformed`);
    }
    if (
      body === null || typeof body !== 'object' || Array.isArray(body)
      || Object.keys(body).sort().join(',') !== 'nullifier,previous,schema,seq,spent_at_ms'
      || body.schema !== NULLIFIER_SPEND_SCHEMA
      || body.seq !== head.seq + 1
      || body.previous !== head.digest
      || typeof body.nullifier !== 'string' || !NULLIFIER.test(body.nullifier)
      || !Number.isSafeInteger(body.spent_at_ms) || body.spent_at_ms < 0
      || canonicalJson(body) !== line
    ) {
      throw new ValidationError(`Nullifier store line ${head.seq + 1} does not continue the chain`);
    }
    if (spent.has(body.nullifier)) {
      throw new ValidationError(`Nullifier store spends ${body.nullifier} twice`);
    }
    spent.set(body.nullifier, body.spent_at_ms);
    head = { seq: body.seq, digest: sha256(line) };
    digests.push(head.digest);
    offset = end + 1;
  }
  return { spent, head, digests, validLength };
}

// A store may have grown since the head was recorded, but it must still
// hold that exact spend at that sequence.
function checkExpectedHead(digests, expected) {
  if (
    expected === null || typeof expected !== 'object'
    || !Number.isSafeInteger(expected.seq) || expected.seq < 0
    || !(expected.digest === null ? expected.seq === 0 : DIGEST.test(expected.digest ?? ''))
  ) throw new ValidationError('Expected nullifier store head is invalid');
  if (digests.length - 1 < expected.seq) {
    throw new ValidationError('Nullifier store is behind its recorded head: spends are missing');
  }
  if (digests[expected.seq] !== expected.digest) {
    throw new ValidationError('Nullifier store does not match its recorded head');
  }
}

function acquireLock(path) {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const fd = openSync(path, 'wx', 0o600);
      writeSync(fd, JSON.stringify({ pid: process.pid }));
      closeSync(fd);
      let released = false;
      return {
        release() {
          if (released) return;
          released = true;
          rmSync(path, { force: true });
        }
      };
    } catch (error) {
      if (error?.code !== 'EEXIST') throw error;
      let owner;
      try {
        owner = JSON.parse(readFileSync(path, 'utf8'));
      } catch {
        owner = null;
      }
      if (attempt === 0 && owner && !processIsActive(owner.pid)) {
        rmSync(path, { force: true });
        continue;
      }
      throw new ValidationError('Nullifier store is in use by another process');
    }
  }
  throw new ValidationError('Nullifier store is in use by another process');
}

function processIsActive(pid) {
  if (!Number.isSafeInteger(pid) || pid < 1) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error?.code === 'EPERM';
  }
}
