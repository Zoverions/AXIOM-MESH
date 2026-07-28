import { createPublicKey } from 'node:crypto';
import { lstat, readFile } from 'node:fs/promises';
import { isAbsolute } from 'node:path';
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
  verificationKeys
}) {
  assertArtifactDescriptor({
    relativePath,
    context,
    encoding,
    expected,
    expectedPlaintext
  });
  assertMetadata(actual, 'actual artifact');
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
  assertMetadata(rewrap.source, 'rewrap source');
  assertMetadata(rewrap.target, 'rewrap target');
  if (expectedPlaintext) {
    assertMetadata(rewrap.plaintext?.source, 'rewrap plaintext source');
    assertMetadata(rewrap.plaintext?.target, 'rewrap plaintext target');
  } else if (rewrap.plaintext !== undefined) {
    throw new ValidationError('Unexpected protected artifact plaintext metadata');
  }
  const prior = rewrap.prior
    ? verifyRewrapNode({
      rewrap: rewrap.prior,
      expected,
      relativePath,
      context,
      encoding,
      expectedPlaintext,
      verificationKeys,
      depth: depth + 1
    })
    : {
      target: expected,
      plaintext: expectedPlaintext,
      rotations: 0
    };
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
    rotations: prior.rotations + 1
  };
}

function assertRewrapInputs({
  relativePath,
  context,
  encoding,
  expected,
  expectedPlaintext,
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
    expectedPlaintext
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
  expectedPlaintext
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
  if (!['bytes', 'json'].includes(encoding)) {
    throw new ValidationError('Protected artifact encoding is invalid');
  }
  assertMetadata(expected, 'expected artifact');
  if (expectedPlaintext) {
    if (encoding !== 'bytes') {
      throw new ValidationError(
        'Protected artifact plaintext metadata requires byte encoding'
      );
    }
    assertMetadata(expectedPlaintext, 'expected artifact plaintext');
  }
}

function latestPlaintextMetadata(rewrap, expectedPlaintext) {
  return rewrap ? rewrap.plaintext.target : expectedPlaintext;
}

function assertMetadata(value, label) {
  if (
    !value
    || !Number.isSafeInteger(value.bytes)
    || value.bytes < 1
    || value.bytes > MAX_ARTIFACT_BYTES
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
