import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { lstat, readlink, readdir } from 'node:fs/promises';
import { dirname, isAbsolute, join, posix, relative, resolve, sep } from 'node:path';
import { canonicalJson, sha256, ValidationError } from './lib/canonical.mjs';

const SHA256 = /^[a-f0-9]{64}$/;
const ARTIFACT_COMPONENT = /^[A-Za-z0-9][A-Za-z0-9._+-]{0,255}$/;
const LINK_TARGET = /^[A-Za-z0-9._+\/-]{1,1024}$/;
const MAX_ARTIFACTS = 256;
const MAX_DEPTH = 8;

export async function inventoryAxiomHostArtifacts(directory, { exclude = [] } = {}) {
  const excluded = new Set(exclude);
  const artifacts = [];
  await collectArtifacts(directory, directory, artifacts, excluded, 0);
  artifacts.sort((left, right) => left.name.localeCompare(right.name));

  if (artifacts.length === 0) {
    throw new ValidationError('AXIOM Host H0 artifact directory is empty');
  }
  if (artifacts.length > MAX_ARTIFACTS) {
    throw new ValidationError(`AXIOM Host H0 artifact directory exceeds ${MAX_ARTIFACTS} artifacts`);
  }

  const inventory = [];
  for (const artifact of artifacts) {
    const metadata = await lstat(artifact.path);
    if (artifact.kind === 'file') {
      if (!metadata.isFile() || metadata.isSymbolicLink()) {
        throw new ValidationError(`AXIOM Host H0 output artifact is not a regular file: ${artifact.name}`);
      }
      inventory.push({
        name: artifact.name,
        bytes: metadata.size,
        sha256: await hashFile(artifact.path)
      });
      continue;
    }

    if (!metadata.isSymbolicLink()) {
      throw new ValidationError(`AXIOM Host H0 output artifact is not the expected symlink: ${artifact.name}`);
    }
    const linkTarget = await readlink(artifact.path, 'utf8');
    const resolvedTarget = resolve(dirname(artifact.path), linkTarget);
    if (
      !validLinkTarget(linkTarget)
      || !isWithin(directory, resolvedTarget)
      || resolve(resolvedTarget) === resolve(artifact.path)
    ) {
      throw new ValidationError(`AXIOM Host H0 output symlink escapes or has an invalid target: ${artifact.name}`);
    }
    let targetMetadata;
    try {
      targetMetadata = await lstat(resolvedTarget);
    } catch {
      throw new ValidationError(`AXIOM Host H0 output symlink target is missing: ${artifact.name}`);
    }
    if (targetMetadata.isSymbolicLink() || (!targetMetadata.isFile() && !targetMetadata.isDirectory())) {
      throw new ValidationError(`AXIOM Host H0 output symlink target has an unsupported type: ${artifact.name}`);
    }
    inventory.push({
      name: artifact.name,
      bytes: Buffer.byteLength(linkTarget),
      sha256: sha256(Buffer.from(linkTarget, 'utf8')),
      link_target: linkTarget
    });
  }

  verifyAxiomHostArtifactInventory(inventory);
  return {
    inventory,
    digest: sha256(canonicalJson(inventory))
  };
}

export function verifyAxiomHostArtifactInventory(inventory) {
  if (!Array.isArray(inventory) || inventory.length < 1 || inventory.length > MAX_ARTIFACTS) {
    throw new ValidationError('AXIOM Host H0 artifact inventory has invalid cardinality');
  }

  const names = new Set();
  let prior = null;
  for (const artifact of inventory) {
    if (
      !artifact
      || typeof artifact !== 'object'
      || Array.isArray(artifact)
      || !validArtifactName(artifact.name)
      || !Number.isSafeInteger(artifact.bytes)
      || artifact.bytes < 0
      || !SHA256.test(artifact.sha256 ?? '')
      || (
        artifact.link_target !== undefined
        && (!validLinkTarget(artifact.link_target) || artifact.bytes !== Buffer.byteLength(artifact.link_target))
      )
      || Object.keys(artifact).some(key => !['name', 'bytes', 'sha256', 'link_target'].includes(key))
    ) {
      throw new ValidationError('AXIOM Host H0 artifact inventory contains an invalid entry');
    }
    if (artifact.link_target !== undefined) {
      const expected = sha256(Buffer.from(artifact.link_target, 'utf8'));
      if (expected !== artifact.sha256) {
        throw new ValidationError(`AXIOM Host H0 symlink digest does not match its target: ${artifact.name}`);
      }
    }
    if (names.has(artifact.name)) {
      throw new ValidationError(`AXIOM Host H0 artifact inventory repeats ${artifact.name}`);
    }
    if (prior !== null && prior.localeCompare(artifact.name) >= 0) {
      throw new ValidationError('AXIOM Host H0 artifact inventory must be strictly name-sorted');
    }
    names.add(artifact.name);
    prior = artifact.name;
  }
  return true;
}

export async function assertEmptyAxiomHostOutput(directory) {
  try {
    const entries = await readdir(directory);
    if (entries.length > 0) {
      throw new ValidationError('AXIOM Host H0 output directory must be empty before build');
    }
  } catch (error) {
    if (error instanceof ValidationError) throw error;
    if (error?.code !== 'ENOENT') throw error;
  }
  return true;
}

async function collectArtifacts(root, directory, artifacts, excluded, depth) {
  if (depth > MAX_DEPTH) {
    throw new ValidationError(`AXIOM Host H0 output nesting exceeds ${MAX_DEPTH} directories`);
  }
  const entries = (await readdir(directory, { withFileTypes: true }))
    .sort((left, right) => left.name.localeCompare(right.name));
  for (const entry of entries) {
    const path = join(directory, entry.name);
    const relativeName = relative(root, path).split(sep).join(posix.sep);
    if (excluded.has(relativeName)) continue;
    if (!validArtifactName(relativeName)) {
      throw new ValidationError(`AXIOM Host H0 output contains unsupported artifact path ${relativeName}`);
    }
    if (entry.isDirectory()) {
      await collectArtifacts(root, path, artifacts, excluded, depth + 1);
      continue;
    }
    if (entry.isFile()) {
      artifacts.push({ name: relativeName, path, kind: 'file' });
    } else if (entry.isSymbolicLink()) {
      artifacts.push({ name: relativeName, path, kind: 'symlink' });
    } else {
      throw new ValidationError(`AXIOM Host H0 output contains unsupported non-file artifact ${relativeName}`);
    }
    if (artifacts.length > MAX_ARTIFACTS) {
      throw new ValidationError(`AXIOM Host H0 artifact directory exceeds ${MAX_ARTIFACTS} artifacts`);
    }
  }
}

function validArtifactName(name) {
  if (typeof name !== 'string' || name.length < 1 || name.length > 1024 || name.includes('\\')) {
    return false;
  }
  const components = name.split('/');
  return components.length >= 1
    && components.length <= MAX_DEPTH + 1
    && components.every(component => ARTIFACT_COMPONENT.test(component));
}

function validLinkTarget(target) {
  return typeof target === 'string'
    && LINK_TARGET.test(target)
    && !isAbsolute(target)
    && !target.includes('\\')
    && !target.includes('//');
}

function isWithin(root, target) {
  const rel = relative(resolve(root), resolve(target));
  return rel === '' || (!isAbsolute(rel) && rel !== '..' && !rel.startsWith(`..${sep}`));
}

async function hashFile(path) {
  const hash = createHash('sha256');
  const stream = createReadStream(path);
  for await (const chunk of stream) hash.update(chunk);
  return hash.digest('hex');
}
