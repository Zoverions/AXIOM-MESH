import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { lstat, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { canonicalJson, sha256, ValidationError } from './lib/canonical.mjs';

const SHA256 = /^[a-f0-9]{64}$/;

export async function inventoryAxiomHostArtifacts(directory, { exclude = [] } = {}) {
  const excluded = new Set(exclude);
  const entries = await readdir(directory, { withFileTypes: true });
  const selected = entries
    .filter(entry => !excluded.has(entry.name))
    .sort((left, right) => left.name.localeCompare(right.name));

  if (selected.length === 0) {
    throw new ValidationError('AXIOM Host H0 artifact directory is empty');
  }

  const inventory = [];
  for (const entry of selected) {
    if (!entry.isFile()) {
      throw new ValidationError(`AXIOM Host H0 output contains unsupported non-file artifact ${entry.name}`);
    }
    const path = join(directory, entry.name);
    const metadata = await lstat(path);
    if (!metadata.isFile() || metadata.isSymbolicLink()) {
      throw new ValidationError(`AXIOM Host H0 output artifact is not a regular file: ${entry.name}`);
    }
    inventory.push({
      name: entry.name,
      bytes: metadata.size,
      sha256: await hashFile(path)
    });
  }

  verifyAxiomHostArtifactInventory(inventory);
  return {
    inventory,
    digest: sha256(canonicalJson(inventory))
  };
}

export function verifyAxiomHostArtifactInventory(inventory) {
  if (!Array.isArray(inventory) || inventory.length < 1 || inventory.length > 64) {
    throw new ValidationError('AXIOM Host H0 artifact inventory has invalid cardinality');
  }

  const names = new Set();
  let prior = null;
  for (const artifact of inventory) {
    if (
      !artifact
      || typeof artifact !== 'object'
      || Array.isArray(artifact)
      || typeof artifact.name !== 'string'
      || !/^[A-Za-z0-9][A-Za-z0-9._+-]{0,255}$/.test(artifact.name)
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

async function hashFile(path) {
  const hash = createHash('sha256');
  const stream = createReadStream(path);
  for await (const chunk of stream) hash.update(chunk);
  return hash.digest('hex');
}
