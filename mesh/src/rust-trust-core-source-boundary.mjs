import { execFileSync } from 'node:child_process';
import { dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { MESH_ROOT } from './lib/config.mjs';
import { ValidationError } from './lib/canonical.mjs';

const REPOSITORY_ROOT = dirname(MESH_ROOT);
const LABORATORY_RUST_PREFIX = 'labs/rust-trust-core/';
const APPROVED_CANDIDATE_RUST_SOURCES = new Set([
  'trust-core/rust/canonical_value_v0.rs'
]);

export function validateCandidateRustSourceBoundary(trackedPaths) {
  if (!Array.isArray(trackedPaths) || trackedPaths.some(path => typeof path !== 'string')) {
    throw new ValidationError('Tracked source paths must be an array of strings');
  }

  const candidateRustSources = trackedPaths
    .filter(path => path.endsWith('.rs'))
    .filter(path => !path.startsWith(LABORATORY_RUST_PREFIX))
    .sort();
  const unsupported = candidateRustSources.filter(
    path => !APPROVED_CANDIDATE_RUST_SOURCES.has(path)
  );

  if (unsupported.length) {
    throw new ValidationError(
      `Unsupported Rust candidate source paths: ${unsupported.join(', ')}`
    );
  }

  return {
    valid: true,
    candidate_rust_sources: candidateRustSources
  };
}

export function verifyTrackedCandidateRustSourceBoundary() {
  const trackedPaths = execFileSync(
    'git',
    ['-C', REPOSITORY_ROOT, 'ls-files'],
    { encoding: 'utf8' }
  ).split(/\r?\n/).filter(Boolean);
  return validateCandidateRustSourceBoundary(trackedPaths);
}

function main() {
  const result = verifyTrackedCandidateRustSourceBoundary();
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
