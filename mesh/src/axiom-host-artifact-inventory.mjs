import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { lstat, readdir } from 'node:fs/promises';
import { join, posix, relative, sep } from 'node:path';
import { canonicalJson, sha256, ValidationError } from './lib/canonical.mjs';

const SHA256 = /^[a-f0-9]{64}$/;
const ARTIFACT_COMPONENT = /^[A-Za-z0-9][A-Za-z0-9._+-]{0,255}$/;
const MAX_ARTIFACTS = 256;
const MAX_DEPTH = 8;

export async function inventoryAxiomHostArtifacts(directory, { exclude = [] } = {}) {
  const excluded = new Set(exclude);
  const files = [];
  await collectRegularFiles(directory, directory, files, excluded, 0);
  files.sort((left, right) => left.name.localeCompare(right.name));

  if (files.length === 0) {
    throw new ValidationError('AXIOM Host H0 artifact directory is empty');
  }
  if (files.length > MAX_ARTIFACTS) {
    throw new ValidationError(`AXIOM Host H0 artifact directory exceeds ${MAX_ARTIFACTS} regular files`);
  }

  const inventory = [];
  for (const artifact of files) {
    const metadata = await lstat(artifact.path);
    if (!metadata.isFile() || metadata.isSymbolicLink()) {
      throw new ValidationError(`AXIOM Host H0 output artifact is not a regular file: ${artifact.name}`);
    }
    inventory.push({
      name: artifact.name,
      bytes: metadata.size,
      sha256: await hashFile(artifact.path)
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
    ) {
      throw new ValidationError('AXIOM Host H0 artifact inventory contains an invalid entry');
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

async function collectRegularFiles(root, directory, files, excluded, depth) {
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
      await collectRegularFiles(root, path, files, excluded, depth + 1);
      continue;
    }
    if (!entry.isFile()) {
      throw new ValidationError(`AXIOM Host H0 output contains unsupported non-file artifact ${relativeName}`);
    }
    files.push({ name: relativeName, path });
    if (files.length > MAX_ARTIFACTS) {
      throw new ValidationError(`AXIOM Host H0 artifact directory exceeds ${MAX_ARTIFACTS} regular files`);
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

async function hashFile(path) {
  const hash = createHash('sha256');
  const stream = createReadStream(path);
  for await (const chunk of stream) hash.update(chunk);
  return hash.digest('hex');
}
