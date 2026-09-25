import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { open, rm } from 'node:fs/promises';
import { canonicalJson, ValidationError } from './canonical.mjs';

/**
 * Chunked protected artifacts (scalability audit S-13).
 *
 * A single-envelope protected artifact must be read, sealed and opened whole,
 * so memory grows with its size. A chunked artifact is sealed and opened one
 * chunk at a time, from file to file, holding at most two plaintext chunks.
 *
 * Layout: an 8-byte magic, then records of
 *   [u32 plaintext length][u8 final flag][12-byte nonce][ciphertext][16-byte tag].
 *
 * Each artifact has its own AES-256-GCM key, derived with HKDF-SHA256 from the
 * data-protection key, a fresh random salt and the artifact context. Every
 * chunk's associated data binds the format, the context, its index and
 * whether it is the final chunk. So:
 * - an edited, reordered, replayed or duplicated chunk fails authentication;
 * - a chunk from another artifact (another salt or context) fails;
 * - dropping trailing chunks leaves no final chunk, and bytes after the final
 *   chunk are refused;
 * - every chunk but the last holds exactly `chunk_bytes` of plaintext, so the
 *   chunking itself is canonical.
 * The caller signs the returned metadata (ciphertext and plaintext digests,
 * sizes, chunk count and salt) and passes it back to open.
 */

export const CHUNKED_ARTIFACT_FORMAT = 'axiom-chunked-artifact.v1';
export const DEFAULT_CHUNK_BYTES = 1024 * 1024;
const MAGIC = Buffer.from('AXCHUNK1');
const HEADER_BYTES = 4 + 1 + 12;
const TAG_BYTES = 16;
const MIN_CHUNK_BYTES = 1024;
const MAX_CHUNK_BYTES = 16 * 1024 * 1024;
const DIGEST = /^[a-f0-9]{64}$/;
const SALT = /^[A-Za-z0-9_-]{43}$/;

export async function sealFileChunked({
  protector,
  sourcePath,
  targetPath,
  context,
  chunkBytes = DEFAULT_CHUNK_BYTES
}) {
  assertChunkBytes(chunkBytes);
  assertContext(context);
  const salt = randomBytes(32);
  const key = protector.deriveArtifactKey(salt, keyInfo(context));
  const source = await open(sourcePath, 'r');
  let target;
  try {
    target = await open(targetPath, 'wx', 0o600);
    const cipherHash = createHash('sha256');
    const plainHash = createHash('sha256');
    let cipherBytes = 0;
    let plainBytes = 0;
    const write = async buffer => {
      await target.write(buffer);
      cipherHash.update(buffer);
      cipherBytes += buffer.length;
    };
    await write(MAGIC);

    // Read one chunk ahead so each chunk knows whether it is the last.
    let current = await readChunk(source, chunkBytes);
    let index = 0;
    for (;;) {
      const next = current.length === chunkBytes ? await readChunk(source, chunkBytes) : Buffer.alloc(0);
      const final = next.length === 0;
      plainHash.update(current);
      plainBytes += current.length;
      const nonce = randomBytes(12);
      const cipher = createCipheriv('aes-256-gcm', key, nonce, { authTagLength: TAG_BYTES });
      cipher.setAAD(chunkAad(context, index, final));
      const ciphertext = Buffer.concat([cipher.update(current), cipher.final()]);
      const header = Buffer.alloc(HEADER_BYTES);
      header.writeUInt32BE(current.length, 0);
      header.writeUInt8(final ? 1 : 0, 4);
      nonce.copy(header, 5);
      await write(header);
      await write(ciphertext);
      await write(cipher.getAuthTag());
      index += 1;
      if (final) break;
      current = next;
    }
    await target.sync();
    return Object.freeze({
      format: CHUNKED_ARTIFACT_FORMAT,
      algorithm: 'A256GCM',
      kdf: 'HKDF-SHA256',
      salt: salt.toString('base64url'),
      chunk_bytes: chunkBytes,
      chunks: index,
      bytes: cipherBytes,
      sha256: cipherHash.digest('hex'),
      plaintext: Object.freeze({ bytes: plainBytes, sha256: plainHash.digest('hex') })
    });
  } catch (error) {
    await target?.close().catch(() => {});
    target = null;
    await rm(targetPath, { force: true });
    throw error;
  } finally {
    await target?.close();
    await source.close();
  }
}

/**
 * Opens a chunked artifact against its signed metadata, writing the plaintext
 * to `targetPath` (created exclusively) when given. Nothing is left at
 * `targetPath` unless every check passes.
 */
export async function openFileChunked({
  protector,
  sourcePath,
  targetPath = null,
  context,
  expected
}) {
  assertContext(context);
  const metadata = validateChunkedMetadata(expected);
  const key = protector.deriveArtifactKey(Buffer.from(metadata.salt, 'base64url'), keyInfo(context));
  const source = await open(sourcePath, 'r');
  let target = null;
  try {
    if (targetPath) target = await open(targetPath, 'wx', 0o600);
    const cipherHash = createHash('sha256');
    const plainHash = createHash('sha256');
    let cipherBytes = 0;
    let plainBytes = 0;
    const readExact = async (length, label) => {
      const buffer = await readChunk(source, length);
      if (buffer.length !== length) throw new ValidationError(`Chunked artifact is truncated in ${label}`);
      cipherHash.update(buffer);
      cipherBytes += length;
      return buffer;
    };
    if (!(await readExact(MAGIC.length, 'its header')).equals(MAGIC)) {
      throw new ValidationError('Chunked artifact header is invalid');
    }
    let index = 0;
    for (;;) {
      if (index >= metadata.chunks) throw new ValidationError('Chunked artifact has more chunks than signed');
      const header = await readExact(HEADER_BYTES, `chunk ${index}`);
      const length = header.readUInt32BE(0);
      const flag = header.readUInt8(4);
      if (flag > 1 || length > metadata.chunk_bytes) {
        throw new ValidationError(`Chunked artifact chunk ${index} header is invalid`);
      }
      const final = flag === 1;
      if (!final && length !== metadata.chunk_bytes) {
        throw new ValidationError(`Chunked artifact chunk ${index} is not full`);
      }
      const ciphertext = await readExact(length, `chunk ${index}`);
      const tag = await readExact(TAG_BYTES, `chunk ${index}`);
      let plaintext;
      try {
        const decipher = createDecipheriv('aes-256-gcm', key, header.subarray(5), { authTagLength: TAG_BYTES });
        decipher.setAAD(chunkAad(context, index, final));
        decipher.setAuthTag(tag);
        plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
      } catch {
        throw new ValidationError(`Chunked artifact chunk ${index} failed authentication`);
      }
      plainHash.update(plaintext);
      plainBytes += plaintext.length;
      if (target) await target.write(plaintext);
      index += 1;
      if (final) break;
    }
    if ((await readChunk(source, 1)).length !== 0) {
      throw new ValidationError('Chunked artifact has bytes after its final chunk');
    }
    const actual = {
      chunks: index,
      bytes: cipherBytes,
      sha256: cipherHash.digest('hex'),
      plaintext: { bytes: plainBytes, sha256: plainHash.digest('hex') }
    };
    if (
      actual.chunks !== metadata.chunks
      || actual.bytes !== metadata.bytes
      || actual.sha256 !== metadata.sha256
      || actual.plaintext.bytes !== metadata.plaintext.bytes
      || actual.plaintext.sha256 !== metadata.plaintext.sha256
    ) throw new ValidationError('Chunked artifact does not match its signed metadata');
    if (target) {
      await target.sync();
      await target.close();
      target = null;
    }
    return Object.freeze(actual);
  } catch (error) {
    if (target) {
      await target.close().catch(() => {});
      target = null;
    }
    if (targetPath) await rm(targetPath, { force: true });
    throw error;
  } finally {
    await target?.close();
    await source.close();
  }
}

export function validateChunkedMetadata(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new ValidationError('Chunked artifact metadata is invalid');
  }
  if (
    value.format !== CHUNKED_ARTIFACT_FORMAT
    || value.algorithm !== 'A256GCM'
    || value.kdf !== 'HKDF-SHA256'
    || typeof value.salt !== 'string'
    || !SALT.test(value.salt)
    || !Number.isSafeInteger(value.chunk_bytes)
    || value.chunk_bytes < MIN_CHUNK_BYTES
    || value.chunk_bytes > MAX_CHUNK_BYTES
    || !Number.isSafeInteger(value.chunks)
    || value.chunks < 1
    || !Number.isSafeInteger(value.bytes)
    || value.bytes < MAGIC.length
    || !DIGEST.test(value.sha256 ?? '')
    || !Number.isSafeInteger(value.plaintext?.bytes)
    || value.plaintext.bytes < 0
    || !DIGEST.test(value.plaintext?.sha256 ?? '')
    || value.chunks !== Math.max(1, Math.ceil(value.plaintext.bytes / value.chunk_bytes))
  ) throw new ValidationError('Chunked artifact metadata is invalid');
  return value;
}

async function readChunk(handle, length) {
  const buffer = Buffer.alloc(length);
  let filled = 0;
  while (filled < length) {
    const { bytesRead } = await handle.read(buffer, filled, length - filled, null);
    if (bytesRead === 0) break;
    filled += bytesRead;
  }
  return filled === length ? buffer : buffer.subarray(0, filled);
}

function chunkAad(context, index, final) {
  return Buffer.from(canonicalJson({ format: CHUNKED_ARTIFACT_FORMAT, context, index, final }));
}

function keyInfo(context) {
  return Buffer.from(`${CHUNKED_ARTIFACT_FORMAT}\u0000${context}`);
}

function assertChunkBytes(value) {
  if (!Number.isSafeInteger(value) || value < MIN_CHUNK_BYTES || value > MAX_CHUNK_BYTES) {
    throw new ValidationError('Chunk size is invalid');
  }
}

function assertContext(value) {
  if (typeof value !== 'string' || value.length < 1 || value.length > 512) {
    throw new ValidationError('Chunked artifact context is invalid');
  }
}
