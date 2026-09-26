import { createHash, createPublicKey } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { lstat, readFile } from 'node:fs/promises';
import { isAbsolute, join } from 'node:path';
import {
  CHUNKED_ARTIFACT_FORMAT,
  openFileChunked,
  sealFileChunked,
  validateChunkedMetadata
} from './chunked-artifact.mjs';
import {
  ValidationError,
  canonicalJson,
  sha256
} from './canonical.mjs';
import { verifyObjectSignature } from './identity.mjs';

const REWRAP_FORMAT = 'axiom-protected-artifact-rewrap.v1';
const DIGEST = /^[a-f0-9]{64}$/;
const ROTATION_ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/;
const MAX_ARTIFACT_BYTES = 512 * 1024 * 1024;
// Chunked artifacts are never read whole, so they are not held to the
// single-envelope limit.
const MAX_CHUNKED_ARTIFACT_BYTES = Number.MAX_SAFE_INTEGER;
const MAX_SIDECAR_BYTES = 4 * 1024 * 1024;
const MAX_REWRAP_DEPTH = 64;
const SIDECAR_SUFFIX = '.key-rotation.json';

export async function prepareProtectedArtifactRewrap({
  artifactPath,
  relativePath,
  context,
  encoding,
  expected,
  expectedPlaintext,
  sourceProtector,
  targetProtector,
  identity,
  rotationId,
  verificationKeys,
  transform
}) {
  assertRewrapInputs({
    relativePath,
    context,
    encoding,
    expected,
    expectedPlaintext,
    sourceProtector,
    targetProtector,
    identity,
    rotationId
  });
  const current = await readRegularFile(artifactPath, MAX_ARTIFACT_BYTES);
  const prior = await readProtectedArtifactRewrap(artifactPath);
  verifyProtectedArtifactState({
    rewrap: prior,
    expected,
    actual: metadata(current),
    relativePath,
    context,
    encoding,
    expectedPlaintext,
    verificationKeys
  });

  const plaintext = encoding === 'bytes'
    ? sourceProtector.openBytes(current.toString('utf8'), context)
    : sourceProtector.open(current.toString('utf8'), context);
  const sourcePlaintext = expectedPlaintext
    ? metadata(Buffer.from(plaintext))
    : null;
  if (
    expectedPlaintext
    && !sameMetadata(
      sourcePlaintext,
      latestPlaintextMetadata(prior, expectedPlaintext)
    )
  ) {
    throw new ValidationError(
      'Protected artifact plaintext does not match its rewrap history'
    );
  }
  const transformed = transform ? await transform(plaintext) : plaintext;
  let protectedValue;
  if (encoding === 'bytes') {
    if (!Buffer.isBuffer(transformed) && !(transformed instanceof Uint8Array)) {
      throw new ValidationError('Protected artifact transform returned invalid bytes');
    }
    protectedValue = targetProtector.sealBytes(transformed, context);
  } else {
    protectedValue = targetProtector.seal(transformed, context);
  }
  const content = Buffer.from(`${protectedValue}\n`, 'utf8');
  const publicKeyPem = String(identity.publicKey.export({
    type: 'spki',
    format: 'pem'
  }));
  const unsigned = {
    format: REWRAP_FORMAT,
    schema_version: 1,
    rotation_id: rotationId,
    created_at: new Date().toISOString(),
    artifact: {
      path: relativePath,
      context,
      encoding
    },
    source: metadata(current),
    target: metadata(content),
    ...(expectedPlaintext ? {
      plaintext: {
        source: sourcePlaintext,
        target: metadata(Buffer.from(transformed))
      }
    } : {}),
    prior,
    signer: {
      service: 'grid',
      key_id: identity.keyId,
      public_key_pem: publicKeyPem
    }
  };
  const rewrap = {
    ...unsigned,
    attestation: identity.signObject(unsigned)
  };
  verifyProtectedArtifactState({
    rewrap,
    expected,
    actual: metadata(content),
    relativePath,
    context,
    encoding,
    expectedPlaintext,
    verificationKeys
  });
  return {
    artifact: content,
    sidecar: Buffer.from(`${canonicalJson(rewrap)}\n`, 'utf8'),
    sidecar_path: `${artifactPath}${SIDECAR_SUFFIX}`,
    before: metadata(current),
    after: metadata(content),
    rewrap
  };
}

export async function openProtectedArtifact({
  artifactPath,
  relativePath,
  context,
  encoding,
  expected,
  expectedPlaintext,
  protector,
  verificationKeys
}) {
  if (!protector) throw new ValidationError('Protected artifact protector is missing');
  assertArtifactDescriptor({
    relativePath,
    context,
    encoding,
    expected,
    expectedPlaintext
  });
  const content = await readRegularFile(artifactPath, MAX_ARTIFACT_BYTES);
  const rewrap = await readProtectedArtifactRewrap(artifactPath);
  verifyProtectedArtifactState({
    rewrap,
    expected,
    actual: metadata(content),
    relativePath,
    context,
    encoding,
    expectedPlaintext,
    verificationKeys
  });
  const value = encoding === 'bytes'
    ? protector.openBytes(content.toString('utf8'), context)
    : protector.open(content.toString('utf8'), context);
  const plaintextMetadata = expectedPlaintext
    ? latestPlaintextMetadata(rewrap, expectedPlaintext)
    : null;
  if (
    plaintextMetadata
    && !sameMetadata(metadata(Buffer.from(value)), plaintextMetadata)
  ) {
    throw new ValidationError(
      'Protected artifact plaintext does not match its latest rewrap attestation'
    );
  }
  return {
    content,
    rewrapped: Boolean(rewrap),
    value,
    plaintext_metadata: plaintextMetadata
  };
}

export function verifyProtectedArtifactState({
  rewrap,
  expected,
  actual,
  relativePath,
  context,
  encoding,
  expectedPlaintext,
  expectedChunked,
  verificationKeys
}) {
  assertArtifactDescriptor({
    relativePath,
    context,
    encoding,
    expected,
    expectedPlaintext,
    expectedChunked
  });
  assertMetadata(actual, 'actual artifact', maxArtifactBytes(encoding));
  if (!rewrap) {
    if (!sameMetadata(actual, expected)) {
      throw new ValidationError(
        'Protected artifact no longer matches its signed source metadata'
      );
    }
    return { valid: true, rewrapped: false, rotations: 0 };
  }
  const verified = verifyRewrapNode({
    rewrap,
    expected,
    relativePath,
    context,
    encoding,
    expectedPlaintext,
    expectedChunked,
    verificationKeys,
    depth: 0
  });
  if (!sameMetadata(actual, verified.target)) {
    throw new ValidationError(
      'Protected artifact does not match its latest rewrap attestation'
    );
  }
  return {
    valid: true,
    rewrapped: true,
    rotations: verified.rotations
  };
}

export async function readProtectedArtifactRewrap(artifactPath) {
  const path = `${artifactPath}${SIDECAR_SUFFIX}`;
  try {
    return JSON.parse(
      await readRegularFile(path, MAX_SIDECAR_BYTES, 'utf8')
    );
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    if (error instanceof SyntaxError) {
      throw new ValidationError('Protected artifact rewrap sidecar is invalid JSON');
    }
    throw error;
  }
}

function verifyRewrapNode({
  rewrap,
  expected,
  relativePath,
  context,
  encoding,
  expectedPlaintext,
  expectedChunked,
  verificationKeys,
  depth
}) {
  if (depth >= MAX_REWRAP_DEPTH) {
    throw new ValidationError('Protected artifact rewrap history is too deep');
  }
  if (
    rewrap?.format !== REWRAP_FORMAT
    || rewrap?.schema_version !== 1
    || !ROTATION_ID.test(rewrap.rotation_id ?? '')
    || rewrap.artifact?.path !== relativePath
    || rewrap.artifact?.context !== context
    || rewrap.artifact?.encoding !== encoding
  ) {
    throw new ValidationError('Protected artifact rewrap metadata is invalid');
  }
  const maxBytes = maxArtifactBytes(encoding);
  assertMetadata(rewrap.source, 'rewrap source', maxBytes);
  assertMetadata(rewrap.target, 'rewrap target', maxBytes);
  if (expectedPlaintext) {
    assertMetadata(rewrap.plaintext?.source, 'rewrap plaintext source', maxBytes);
    assertMetadata(rewrap.plaintext?.target, 'rewrap plaintext target', maxBytes);
  } else if (rewrap.plaintext !== undefined) {
    throw new ValidationError('Unexpected protected artifact plaintext metadata');
  }
  if (encoding === 'chunked') {
    assertChunkParameters(rewrap.chunked?.source, 'rewrap chunk source');
    assertChunkParameters(rewrap.chunked?.target, 'rewrap chunk target');
  } else if (rewrap.chunked !== undefined) {
    throw new ValidationError('Unexpected protected artifact chunk metadata');
  }
  const prior = rewrap.prior
    ? verifyRewrapNode({
      rewrap: rewrap.prior,
      expected,
      relativePath,
      context,
      encoding,
      expectedPlaintext,
      expectedChunked,
      verificationKeys,
      depth: depth + 1
    })
    : {
      target: expected,
      plaintext: expectedPlaintext,
      chunked: expectedChunked ?? null,
      rotations: 0
    };
  if (encoding === 'chunked' && !sameChunkParameters(rewrap.chunked.source, prior.chunked)) {
    throw new ValidationError('Protected artifact chunk rewrap chain is discontinuous');
  }
  if (!sameMetadata(rewrap.source, prior.target)) {
    throw new ValidationError('Protected artifact rewrap chain is discontinuous');
  }
  if (
    expectedPlaintext
    && !sameMetadata(rewrap.plaintext.source, prior.plaintext)
  ) {
    throw new ValidationError(
      'Protected artifact plaintext rewrap chain is discontinuous'
    );
  }
  if (
    rewrap.signer?.service !== 'grid'
    || typeof rewrap.signer?.public_key_pem !== 'string'
    || rewrap.attestation?.key_id !== rewrap.signer?.key_id
    || rewrap.signer.key_id !== (
      `grid:${sha256(rewrap.signer.public_key_pem).slice(0, 16)}`
    )
  ) {
    throw new ValidationError('Protected artifact rewrap signer metadata is invalid');
  }
  let publicKey;
  try {
    publicKey = createPublicKey(rewrap.signer.public_key_pem);
  } catch {
    throw new ValidationError('Protected artifact rewrap signer key is invalid');
  }
  if (publicKey.asymmetricKeyType !== 'ed25519') {
    throw new ValidationError('Protected artifact rewrap signer is not Ed25519');
  }
  const trustedKey = verificationKeys?.get?.(rewrap.signer.key_id);
  if (
    !trustedKey
    || !Buffer.from(trustedKey.export({
      type: 'spki',
      format: 'der'
    })).equals(Buffer.from(publicKey.export({
      type: 'spki',
      format: 'der'
    })))
  ) {
    throw new ValidationError(
      'Protected artifact rewrap signer is outside the trusted Grid key history'
    );
  }
  const unsigned = structuredClone(rewrap);
  delete unsigned.attestation;
  if (!verifyObjectSignature(unsigned, rewrap.attestation, publicKey)) {
    throw new ValidationError('Protected artifact rewrap attestation is invalid');
  }
  return {
    target: rewrap.target,
    plaintext: expectedPlaintext ? rewrap.plaintext.target : null,
    chunked: encoding === 'chunked' ? rewrap.chunked.target : null,
    rotations: prior.rotations + 1
  };
}

function assertRewrapInputs({
  relativePath,
  context,
  encoding,
  expected,
  expectedPlaintext,
  expectedChunked,
  sourceProtector,
  targetProtector,
  identity,
  rotationId
}) {
  assertArtifactDescriptor({
    relativePath,
    context,
    encoding,
    expected,
    expectedPlaintext,
    expectedChunked
  });
  if (!sourceProtector || !targetProtector || !identity) {
    throw new ValidationError('Protected artifact rewrap dependencies are missing');
  }
  if (!ROTATION_ID.test(rotationId ?? '')) {
    throw new ValidationError('Protected artifact rotation identifier is invalid');
  }
}

function assertArtifactDescriptor({
  relativePath,
  context,
  encoding,
  expected,
  expectedPlaintext,
  expectedChunked
}) {
  if (
    typeof relativePath !== 'string'
    || relativePath.length < 1
    || relativePath.length > 1000
    || relativePath.includes('\\')
    || isAbsolute(relativePath)
    || relativePath.split('/').includes('..')
  ) {
    throw new ValidationError('Protected artifact relative path is invalid');
  }
  if (typeof context !== 'string' || context.length < 1 || context.length > 512) {
    throw new ValidationError('Protected artifact context is invalid');
  }
  if (!['bytes', 'json', 'chunked'].includes(encoding)) {
    throw new ValidationError('Protected artifact encoding is invalid');
  }
  const maxBytes = maxArtifactBytes(encoding);
  assertMetadata(expected, 'expected artifact', maxBytes);
  if (encoding === 'chunked') {
    if (!expectedPlaintext) {
      throw new ValidationError('Chunked protected artifacts require plaintext metadata');
    }
    assertChunkParameters(expectedChunked, 'expected artifact chunk');
  } else if (expectedChunked !== undefined) {
    throw new ValidationError('Only chunked protected artifacts carry chunk metadata');
  }
  if (expectedPlaintext) {
    if (encoding === 'json') {
      throw new ValidationError(
        'Protected artifact plaintext metadata requires byte encoding'
      );
    }
    assertMetadata(expectedPlaintext, 'expected artifact plaintext', maxBytes);
  }
}

function maxArtifactBytes(encoding) {
  return encoding === 'chunked' ? MAX_CHUNKED_ARTIFACT_BYTES : MAX_ARTIFACT_BYTES;
}

function latestPlaintextMetadata(rewrap, expectedPlaintext) {
  return rewrap ? rewrap.plaintext.target : expectedPlaintext;
}

function latestChunkParameters(rewrap, expectedChunked) {
  return rewrap ? rewrap.chunked.target : expectedChunked;
}

// The per-artifact parameters a chunked artifact is opened with; the
// digests and sizes come from the artifact metadata alongside them.
function assertChunkParameters(value, label) {
  if (
    value === null
    || typeof value !== 'object'
    || Array.isArray(value)
    || Object.keys(value).sort().join(',') !== 'chunk_bytes,chunks,salt'
    || typeof value.salt !== 'string'
    || !/^[A-Za-z0-9_-]{43}$/.test(value.salt)
    || !Number.isSafeInteger(value.chunk_bytes)
    || !Number.isSafeInteger(value.chunks)
    || value.chunks < 1
  ) {
    throw new ValidationError(`${label} metadata is invalid`);
  }
}

function sameChunkParameters(left, right) {
  return Boolean(left && right)
    && left.salt === right.salt
    && left.chunk_bytes === right.chunk_bytes
    && left.chunks === right.chunks;
}

function chunkedExpectation(artifact, plaintext, chunked) {
  return validateChunkedMetadata({
    format: CHUNKED_ARTIFACT_FORMAT,
    algorithm: 'A256GCM',
    kdf: 'HKDF-SHA256',
    ...chunked,
    bytes: artifact.bytes,
    sha256: artifact.sha256,
    plaintext: { bytes: plaintext.bytes, sha256: plaintext.sha256 }
  });
}

/**
 * Rewraps a chunked artifact under a new data-protection key without
 * holding its plaintext in memory: the current state is verified against
 * the signed rewrap history, the artifact is decrypted into `workDir`,
 * `transformFile` may rewrite that plaintext file in place, and the result
 * is sealed again chunk by chunk. The signed rewrap record binds the source
 * and target ciphertext, plaintext and chunk parameters. The resealed bytes
 * are returned for the caller's file transaction.
 */
export async function prepareChunkedArtifactRewrap({
  artifactPath,
  relativePath,
  context,
  expected,
  expectedPlaintext,
  expectedChunked,
  sourceProtector,
  targetProtector,
  identity,
  rotationId,
  verificationKeys,
  workDir,
  transformFile
}) {
  assertRewrapInputs({
    relativePath,
    context,
    encoding: 'chunked',
    expected,
    expectedPlaintext,
    expectedChunked,
    sourceProtector,
    targetProtector,
    identity,
    rotationId
  });
  const prior = await readProtectedArtifactRewrap(artifactPath);
  const current = await fileMetadata(artifactPath);
  verifyProtectedArtifactState({
    rewrap: prior,
    expected,
    actual: current,
    relativePath,
    context,
    encoding: 'chunked',
    expectedPlaintext,
    expectedChunked,
    verificationKeys
  });
  const sourcePlaintext = latestPlaintextMetadata(prior, expectedPlaintext);
  const sourceChunked = latestChunkParameters(prior, expectedChunked);
  const plainPath = join(workDir, 'chunked-rewrap.plain');
  const sealedPath = join(workDir, 'chunked-rewrap.sealed');
  await openFileChunked({
    protector: sourceProtector,
    sourcePath: artifactPath,
    targetPath: plainPath,
    context,
    expected: chunkedExpectation(current, sourcePlaintext, sourceChunked)
  });
  const transformedPath = transformFile ? await transformFile(plainPath) : plainPath;
  const sealed = await sealFileChunked({
    protector: targetProtector,
    sourcePath: transformedPath,
    targetPath: sealedPath,
    context,
    chunkBytes: sourceChunked.chunk_bytes
  });
  const target = { bytes: sealed.bytes, sha256: sealed.sha256 };
  const publicKeyPem = String(identity.publicKey.export({ type: 'spki', format: 'pem' }));
  const unsigned = {
    format: REWRAP_FORMAT,
    schema_version: 1,
    rotation_id: rotationId,
    created_at: new Date().toISOString(),
    artifact: { path: relativePath, context, encoding: 'chunked' },
    source: current,
    target,
    plaintext: {
      source: sourcePlaintext,
      target: { bytes: sealed.plaintext.bytes, sha256: sealed.plaintext.sha256 }
    },
    chunked: {
      source: sourceChunked,
      target: { salt: sealed.salt, chunk_bytes: sealed.chunk_bytes, chunks: sealed.chunks }
    },
    prior,
    signer: { service: 'grid', key_id: identity.keyId, public_key_pem: publicKeyPem }
  };
  const rewrap = { ...unsigned, attestation: identity.signObject(unsigned) };
  verifyProtectedArtifactState({
    rewrap,
    expected,
    actual: target,
    relativePath,
    context,
    encoding: 'chunked',
    expectedPlaintext,
    expectedChunked,
    verificationKeys
  });
  // Today's rotation stages every rewrapped artifact in memory.
  if (sealed.bytes > MAX_ARTIFACT_BYTES) {
    throw new ValidationError('Chunked artifact is too large to rewrap in memory');
  }
  const content = await readFile(sealedPath);
  return {
    artifact: content,
    sidecar: Buffer.from(`${canonicalJson(rewrap)}\n`, 'utf8'),
    sidecar_path: `${artifactPath}${SIDECAR_SUFFIX}`,
    before: current,
    after: target,
    rewrap
  };
}

/**
 * Opens a chunked artifact at its current state: the signed rewrap history
 * (if any) is verified against the file on disk, and the artifact is
 * decrypted with its latest chunk parameters into `targetPath`.
 */
export async function openChunkedProtectedArtifact({
  artifactPath,
  relativePath,
  context,
  expected,
  expectedPlaintext,
  expectedChunked,
  protector,
  verificationKeys,
  targetPath
}) {
  if (!protector) throw new ValidationError('Protected artifact protector is missing');
  const rewrap = await readProtectedArtifactRewrap(artifactPath);
  const current = await fileMetadata(artifactPath);
  const state = verifyProtectedArtifactState({
    rewrap,
    expected,
    actual: current,
    relativePath,
    context,
    encoding: 'chunked',
    expectedPlaintext,
    expectedChunked,
    verificationKeys
  });
  const plaintext = latestPlaintextMetadata(rewrap, expectedPlaintext);
  await openFileChunked({
    protector,
    sourcePath: artifactPath,
    targetPath,
    context,
    expected: chunkedExpectation(current, plaintext, latestChunkParameters(rewrap, expectedChunked))
  });
  return { rewrapped: state.rewrapped, rotations: state.rotations, plaintext_metadata: plaintext };
}

async function fileMetadata(path) {
  const stat = await lstat(path);
  if (stat.isSymbolicLink() || !stat.isFile()) {
    throw new ValidationError('Protected artifact must be a regular file');
  }
  if (stat.size < 1 || stat.size > MAX_CHUNKED_ARTIFACT_BYTES) {
    throw new ValidationError('Protected artifact has an invalid size');
  }
  const hash = createHash('sha256');
  let bytes = 0;
  for await (const chunk of createReadStream(path)) {
    hash.update(chunk);
    bytes += chunk.length;
  }
  return { bytes, sha256: hash.digest('hex') };
}

function assertMetadata(value, label, maxBytes = MAX_ARTIFACT_BYTES) {
  if (
    !value
    || !Number.isSafeInteger(value.bytes)
    || value.bytes < 1
    || value.bytes > maxBytes
    || !DIGEST.test(value.sha256 ?? '')
  ) {
    throw new ValidationError(`${label} metadata is invalid`);
  }
}

function metadata(content) {
  return {
    bytes: content.length,
    sha256: sha256(content)
  };
}

function sameMetadata(left, right) {
  return left.bytes === right.bytes && left.sha256 === right.sha256;
}

async function readRegularFile(path, maxBytes, encoding) {
  const stat = await lstat(path);
  if (stat.isSymbolicLink() || !stat.isFile()) {
    throw new ValidationError('Protected artifact must be a regular file');
  }
  if (stat.size < 1 || stat.size > maxBytes) {
    throw new ValidationError('Protected artifact has an invalid size');
  }
  return readFile(path, encoding);
}

export { REWRAP_FORMAT, SIDECAR_SUFFIX };
