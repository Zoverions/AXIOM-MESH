import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  inferenceWorkloadProfileDigest,
  validateInferenceWorkloadProfile
} from '../src/lib/inference-measurement-contracts.mjs';

const manifestUrl = new URL('../../labs/cuda-rust-acceleration/cutile-rs-a0.manifest.json', import.meta.url);
const referenceUrl = new URL('../../labs/cuda-rust-acceleration/vector-add-a0.reference.json', import.meta.url);
const workloadsUrl = new URL('../fixtures/inference-measurement/workload-profiles-v0.json', import.meta.url);

test('CUDA Rust A0 pins exact upstream candidates without adding authority or execution claims', async () => {
  const manifest = JSON.parse(await readFile(manifestUrl, 'utf8'));

  assert.equal(manifest.schema, 'axiom-cuda-rust-acceleration-candidate.v0');
  assert.equal(manifest.version, 0);
  assert.equal(manifest.candidate_id, 'cuda-rust.cutile-rs.a0');
  assert.equal(manifest.status, 'laboratory-only');
  assert.equal(manifest.issue, 1637);
  assert.deepEqual(manifest.parent_programmes, [1468, 1607]);

  assert.equal(manifest.upstream.repository, 'https://github.com/NVlabs/cutile-rs');
  assert.equal(manifest.upstream.revision, 'd92c160949f58328ba6e96d81005e7110ba6f2b3');
  assert.match(manifest.upstream.revision, /^[a-f0-9]{40}$/);
  assert.equal(manifest.upstream.license, 'Apache-2.0');
  assert.equal(manifest.toolchain_constraints.rust.channel, 'stable');
  assert.equal(manifest.toolchain_constraints.rust.minimum_version, '1.89.0');
  assert.equal(manifest.toolchain_constraints.cuda.recommended_toolkit, '13.3');
  assert.equal(manifest.toolchain_constraints.cuda.minimum_compute_capability, 'sm_80');

  assert.equal(manifest.deferred_candidate.repository, 'https://github.com/NVlabs/cuda-oxide');
  assert.equal(manifest.deferred_candidate.revision, 'b631e5d7a13b9d1524f4b56a355a32376e4075ac');
  assert.match(manifest.deferred_candidate.revision, /^[a-f0-9]{40}$/);
  assert.equal(manifest.deferred_candidate.rust_toolchain, 'nightly-2026-08-28');
  assert.equal(manifest.deferred_candidate.minimum_llvm_major, 21);

  assert.equal(manifest.execution.hardware_execution_status, 'NOT_RUN');
  assert.equal(manifest.execution.benchmark_evidence, null);
  assert.deepEqual(manifest.execution.performance_claims, []);
  assert.equal(manifest.supply_chain_review.dependency_closure, 'pending');
  assert.equal(manifest.supply_chain_review.production_dependency, false);

  assert.deepEqual(manifest.boundaries, {
    authority_effect: 'none',
    network_effect: 'none',
    credential_visibility: 'none',
    runtime_activation: false,
    capability_promotion: false,
    grid_mutation: false,
    gateway_route_added: false
  });
});

test('CUDA Rust A0 binds to the exact validated W0 workload evidence contract', async () => {
  const manifest = JSON.parse(await readFile(manifestUrl, 'utf8'));
  const workloads = JSON.parse(await readFile(workloadsUrl, 'utf8'));
  const profile = workloads.profiles.find(item => item.profile_id === manifest.workload_binding.profile_id);

  assert.ok(profile, 'bound workload profile must exist');
  const validated = validateInferenceWorkloadProfile(profile);
  assert.equal(validated.profile_version, manifest.workload_binding.profile_version);
  assert.equal(profile.fixture_digest, manifest.workload_binding.fixture_digest);
  assert.equal(inferenceWorkloadProfileDigest(profile), manifest.workload_binding.profile_digest);
});

test('CUDA Rust A0 CPU reference vector is deterministic and contains no GPU result', async () => {
  const vector = JSON.parse(await readFile(referenceUrl, 'utf8'));

  assert.equal(vector.schema, 'axiom-cuda-rust-reference-vector.v0');
  assert.equal(vector.operation, 'elementwise-add-f32');
  assert.equal(vector.dtype, 'f32');
  assert.equal(vector.x.length, vector.y.length);
  assert.equal(vector.x.length, vector.expected.length);
  assert.equal(vector.absolute_tolerance, 0);
  assert.equal(vector.authority_effect, 'none');

  const actual = vector.x.map((value, index) => Math.fround(Math.fround(value) + Math.fround(vector.y[index])));
  assert.deepEqual(actual, vector.expected.map(Math.fround));
  assert.match(vector.purpose, /CPU reference/i);
  assert.doesNotMatch(vector.purpose, /GPU result (was|is) measured/i);
});

test('CUDA Rust A0 adds no cutile or cuda-oxide production package dependency', async () => {
  const files = [
    new URL('../../package.json', import.meta.url),
    new URL('../../package-lock.json', import.meta.url),
    new URL('../package.json', import.meta.url),
    new URL('../package-lock.json', import.meta.url)
  ];
  for (const url of files) {
    const source = (await readFile(url, 'utf8')).toLowerCase();
    assert.equal(source.includes('cutile-rs'), false, `${url.pathname} unexpectedly contains cutile-rs`);
    assert.equal(source.includes('cuda-oxide'), false, `${url.pathname} unexpectedly contains cuda-oxide`);
  }
});
