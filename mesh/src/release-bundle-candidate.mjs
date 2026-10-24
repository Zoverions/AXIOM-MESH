import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { lstat, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { types as utilTypes } from 'node:util';

import {
  ValidationError,
  assertPlainObject,
  canonicalJson,
  digestObject,
  sha256
} from './lib/canonical.mjs';

export const CI_RELEASE_BUNDLE_CANDIDATE_SCHEMA = 'axiom-ci-release-bundle-candidate.v0';

const REVISION = /^[a-f0-9]{40}$/;
const VERSION = /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?$/;
const ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,191}$/;
const MEDIA_TYPE = /^[A-Za-z0-9][A-Za-z0-9!#$&^_.+-]*\/[A-Za-z0-9][A-Za-z0-9!#$&^_.+-]*$/;
const PLATFORM = /^[A-Za-z0-9][A-Za-z0-9._/+:-]{0,127}$/;
const REQUIRED_KINDS = Object.freeze([
  'documentation-bundle',
  'oci-image',
  'provenance',
  'sbom',
  'source-archive'
]);
const PRIVATE_BIRTH_TOKEN = /(^|[._:/-])(birth|genesis|spark)([._:/-]|$)/i;
const MAX_ARTIFACT_BYTES = 1_000_000_000_000;

export function buildReleaseBundleCandidate(input) {
  exactRecord(input, 'Release bundle candidate input', [
    'sourceRevision', 'kernelVersion', 'createdAt', 'artifacts'
  ]);
  const descriptors = artifactArray(input.artifacts).map((artifact, index) => {
    exactRecord(artifact, `Release bundle artifact ${index}`, [
      'artifact_id', 'kind', 'media_type', 'platform', 'bytes'
    ]);
    const bytes = byteCopy(artifact.bytes, `Release bundle artifact ${index} bytes`);
    return artifactDescriptor(artifact, bytes.length, sha256(bytes), index);
  });
  return finalizeCandidate(input, descriptors);
}

export async function writeReleaseBundleCandidate(input) {
  exactRecord(input, 'Release bundle writer input', [
    'sourceRevision', 'kernelVersion', 'createdAt', 'artifacts', 'output'
  ]);
  if (typeof input.output !== 'string' || input.output.length < 1 || input.output.includes('\0')) {
    throw new ValidationError('Release bundle output path is invalid');
  }
  const descriptors = [];
  for (const [index, artifact] of artifactArray(input.artifacts).entries()) {
    exactRecord(artifact, `Release bundle file artifact ${index}`, [
      'artifact_id', 'kind', 'media_type', 'platform', 'path'
    ]);
    if (typeof artifact.path !== 'string' || artifact.path.length < 1 || artifact.path.includes('\0')) {
      throw new ValidationError(`Release bundle file artifact ${index} path is invalid`);
    }
    const metadata = await lstat(artifact.path);
    if (!metadata.isFile() || metadata.size < 1 || metadata.size > MAX_ARTIFACT_BYTES) {
      throw new ValidationError(`Release bundle file artifact ${index} is not a bounded regular file`);
    }
    descriptors.push(artifactDescriptor(
      artifact,
      metadata.size,
      await fileSha256(artifact.path),
      index
    ));
  }
  const candidate = finalizeCandidate(input, descriptors);
  await writeFile(input.output, `${canonicalJson(candidate)}\n`, { mode: 0o600 });
  return candidate;
}

function finalizeCandidate(input, descriptors) {
  string(input.sourceRevision, 'sourceRevision', REVISION, 40);
  string(input.kernelVersion, 'kernelVersion', VERSION, 128);
  const instant = Date.parse(input.createdAt);
  if (!Number.isFinite(instant) || new Date(instant).toISOString() !== input.createdAt) {
    throw new ValidationError('createdAt must be a canonical UTC ISO timestamp');
  }
  descriptors.sort((left, right) => left.kind.localeCompare(right.kind));
  if (
    descriptors.length !== REQUIRED_KINDS.length
    || descriptors.some((artifact, index) => artifact.kind !== REQUIRED_KINDS[index])
  ) {
    throw new ValidationError('Release bundle artifact inventory must contain each required kind exactly once');
  }
  if (new Set(descriptors.map(artifact => artifact.artifact_id)).size !== descriptors.length) {
    throw new ValidationError('Release bundle artifact inventory contains duplicate artifact identities');
  }
  const body = {
    schema: CI_RELEASE_BUNDLE_CANDIDATE_SCHEMA,
    version: 0,
    status: 'non-authorizing-ci-candidate',
    source_revision: input.sourceRevision,
    kernel_version: input.kernelVersion,
    generated_at: input.createdAt,
    artifacts: descriptors,
    install_release_manifest_present: false,
    release_signature_verified: false,
    production_promoted: false,
    release_ready: false,
    host_mutation_authorized: false,
    authority_effect: 'none',
    network_effect: 'none'
  };
  return deepFreeze({ ...body, inventory_digest: digestObject(body) });
}

function artifactDescriptor(artifact, byteLength, digest, index) {
  string(artifact.artifact_id, `artifacts[${index}].artifact_id`, ID, 192);
  if (PRIVATE_BIRTH_TOKEN.test(artifact.artifact_id)) {
    throw new ValidationError('Birth, Genesis, and Spark material is excluded from the standard release bundle');
  }
  if (!REQUIRED_KINDS.includes(artifact.kind)) {
    throw new ValidationError(`artifacts[${index}].kind is unsupported`);
  }
  string(artifact.media_type, `artifacts[${index}].media_type`, MEDIA_TYPE, 128);
  string(artifact.platform, `artifacts[${index}].platform`, PLATFORM, 128);
  if (!Number.isSafeInteger(byteLength) || byteLength < 1 || byteLength > MAX_ARTIFACT_BYTES) {
    throw new ValidationError(`artifacts[${index}].byte_length is invalid`);
  }
  return {
    artifact_id: artifact.artifact_id,
    kind: artifact.kind,
    media_type: artifact.media_type,
    platform: artifact.platform,
    sha256: digest,
    byte_length: byteLength
  };
}

function artifactArray(value) {
  if (
    utilTypes.isProxy(value)
    || !Array.isArray(value)
    || Object.getPrototypeOf(value) !== Array.prototype
    || value.length < 1
    || value.length > 16
    || Reflect.ownKeys(value).some(key => key !== 'length' && !/^\d+$/.test(String(key)))
    || Array.from({ length: value.length }, (_, index) => Object.hasOwn(value, index)).includes(false)
  ) throw new ValidationError('Release bundle artifacts must be a bounded plain array');
  return value;
}

function byteCopy(value, label) {
  if (utilTypes.isProxy(value) || !(value instanceof Uint8Array)) {
    throw new ValidationError(`${label} must be a Uint8Array`);
  }
  if (value.byteLength < 1 || value.byteLength > MAX_ARTIFACT_BYTES) {
    throw new ValidationError(`${label} has invalid length`);
  }
  return Buffer.from(value);
}

function exactRecord(value, label, fields) {
  assertPlainObject(value, label);
  const keys = Reflect.ownKeys(value);
  if (keys.some(key => typeof key === 'symbol')) {
    throw new ValidationError(`${label} contains an unsupported field`);
  }
  for (const key of keys) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor?.enumerable || !Object.hasOwn(descriptor, 'value')) {
      throw new ValidationError(`${label} must contain only enumerable data properties`);
    }
  }
  if (keys.map(String).sort().join(',') !== [...fields].sort().join(',')) {
    throw new ValidationError(`${label} contains an unsupported field or missing field`);
  }
}

function string(value, label, pattern, maximum) {
  if (typeof value !== 'string' || value.length < 1 || value.length > maximum || !pattern.test(value)) {
    throw new ValidationError(`${label} is invalid`);
  }
}

async function fileSha256(path) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest('hex');
}

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

async function main(argv = process.argv.slice(2)) {
  if (argv.length !== 9) {
    throw new ValidationError(
      'Usage: node src/release-bundle-candidate.mjs <revision> <version> <created-at> <source.tar> <image.tar> <docs.tar> <sbom.json> <provenance.json> <inventory.json>'
    );
  }
  const [sourceRevision, kernelVersion, createdAt, source, image, docs, sbom, provenance, output] = argv;
  const candidate = await writeReleaseBundleCandidate({
    sourceRevision,
    kernelVersion,
    createdAt,
    output,
    artifacts: [
      { artifact_id: 'source.archive', kind: 'source-archive', media_type: 'application/x-tar', platform: 'any', path: source },
      { artifact_id: 'kernel.oci.linux-amd64', kind: 'oci-image', media_type: 'application/x-tar', platform: 'linux/amd64', path: image },
      { artifact_id: 'documentation.bundle', kind: 'documentation-bundle', media_type: 'application/x-tar', platform: 'any', path: docs },
      { artifact_id: 'release.sbom', kind: 'sbom', media_type: 'application/spdx+json', platform: 'any', path: sbom },
      { artifact_id: 'release.provenance', kind: 'provenance', media_type: 'application/json', platform: 'any', path: provenance }
    ]
  });
  process.stdout.write(`${JSON.stringify({ valid: true, inventory_digest: candidate.inventory_digest })}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    await main();
  } catch (error) {
    process.stderr.write(`${error.name ?? 'Error'}: ${error.message}\n`);
    process.exitCode = 1;
  }
}
