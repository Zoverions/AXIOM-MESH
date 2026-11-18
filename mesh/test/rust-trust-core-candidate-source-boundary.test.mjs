import assert from 'node:assert/strict';
import test from 'node:test';
import { validateSupportedSourceBoundary } from '../src/release.mjs';
import {
  validateCandidateRustSourceBoundary,
  verifyTrackedCandidateRustSourceBoundary
} from '../src/rust-trust-core-source-boundary.mjs';

test('tracked repository admits only the approved Stage 3 Rust candidate source', () => {
  const candidate = verifyTrackedCandidateRustSourceBoundary();
  assert.deepEqual(candidate.candidate_rust_sources, [
    'trust-core/rust/canonical_value_v0.rs'
  ]);
});

test('candidate Rust source boundary classifies only the approved Stage 3 source', () => {
  const trackedPaths = [
    'README.md',
    'package.json',
    'package-lock.json',
    'mesh/package.json',
    'mesh/package-lock.json',
    'labs/rust-trust-core/Cargo.toml',
    'labs/rust-trust-core/Cargo.lock',
    'labs/rust-trust-core/src/lib.rs',
    'trust-core/rust/canonical_value_v0.rs'
  ];
  const candidate = validateCandidateRustSourceBoundary(trackedPaths);
  const release = validateSupportedSourceBoundary(trackedPaths);

  assert.deepEqual(candidate.candidate_rust_sources, [
    'trust-core/rust/canonical_value_v0.rs'
  ]);
  assert.deepEqual(release.dependency_manifests, [
    'mesh/package-lock.json',
    'mesh/package.json',
    'package-lock.json',
    'package.json'
  ]);
  assert.deepEqual(release.laboratory_dependency_manifests, [
    'labs/rust-trust-core/Cargo.lock',
    'labs/rust-trust-core/Cargo.toml'
  ]);
});

test('candidate Rust source boundary rejects an unapproved source beside the Stage 3 candidate', () => {
  assert.throws(
    () => validateCandidateRustSourceBoundary([
      'mesh/package.json',
      'labs/rust-trust-core/src/lib.rs',
      'trust-core/rust/canonical_value_v0.rs',
      'trust-core/rust/extra.rs'
    ]),
    /Unsupported Rust candidate source paths/
  );
});

test('release dependency boundary still rejects an unapproved Cargo manifest', () => {
  assert.throws(
    () => validateSupportedSourceBoundary([
      'mesh/package.json',
      'trust-core/rust/Cargo.toml'
    ]),
    /Unsupported legacy runtime or dependency paths/
  );
});
