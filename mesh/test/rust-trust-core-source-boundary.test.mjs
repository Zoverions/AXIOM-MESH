import assert from 'node:assert/strict';
import test from 'node:test';
import { validateSupportedSourceBoundary } from '../src/release.mjs';

test('release source boundary classifies Rust trust-core manifests as laboratory-only', () => {
  const result = validateSupportedSourceBoundary([
    'README.md',
    'package.json',
    'package-lock.json',
    'mesh/package.json',
    'mesh/package-lock.json',
    'labs/rust-trust-core/Cargo.toml',
    'labs/rust-trust-core/Cargo.lock'
  ]);

  assert.equal(result.valid, true);
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

test('release source boundary still rejects unrecognized Cargo manifests', () => {
  assert.throws(
    () => validateSupportedSourceBoundary([
      'mesh/package.json',
      'labs/other-experiment/Cargo.toml'
    ]),
    /Unsupported legacy runtime or dependency paths/
  );
});
