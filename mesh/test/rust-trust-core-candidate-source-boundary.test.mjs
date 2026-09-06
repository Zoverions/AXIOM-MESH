import assert from 'node:assert/strict';
import test from 'node:test';
import { validateSupportedSourceBoundary } from '../src/release.mjs';

test('release source boundary classifies only the approved Stage 3 Rust candidate source', () => {
  const result = validateSupportedSourceBoundary([
    'README.md',
    'package.json',
    'package-lock.json',
    'mesh/package.json',
    'mesh/package-lock.json',
    'labs/rust-trust-core/Cargo.toml',
    'labs/rust-trust-core/Cargo.lock',
    'trust-core/rust/canonical_value_v0.rs'
  ]);

  assert.deepEqual(result.candidate_rust_sources, [
    'trust-core/rust/canonical_value_v0.rs'
  ]);
  assert.deepEqual(result.dependency_manifests, [
    'mesh/package-lock.json',
    'mesh/package.json',
    'package-lock.json',
    'package.json'
  ]);
  assert.deepEqual(result.laboratory_dependency_manifests, [
    'labs/rust-trust-core/Cargo.lock',
    'labs/rust-trust-core/Cargo.toml'
  ]);
});

test('release source boundary rejects unapproved Rust source beside the Stage 3 candidate', () => {
  assert.throws(
    () => validateSupportedSourceBoundary([
      'mesh/package.json',
      'trust-core/rust/canonical_value_v0.rs',
      'trust-core/rust/extra.rs'
    ]),
    /Unsupported legacy runtime or dependency paths/
  );
});

test('release source boundary still rejects unapproved Cargo manifests', () => {
  assert.throws(
    () => validateSupportedSourceBoundary([
      'mesh/package.json',
      'trust-core/rust/Cargo.toml'
    ]),
    /Unsupported legacy runtime or dependency paths/
  );
});
