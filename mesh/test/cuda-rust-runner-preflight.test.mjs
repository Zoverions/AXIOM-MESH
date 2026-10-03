import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  evaluateCudaRustRunnerEvidence,
  parseCudaToolkitVersion,
  parseNvidiaSmiRows,
  parseRustVersion
} from '../../labs/cuda-rust-acceleration/probe-runner.mjs';

const eligibilityUrl = new URL('../../labs/cuda-rust-acceleration/runner-eligibility-v0.json', import.meta.url);
const supplyUrl = new URL('../../labs/cuda-rust-acceleration/cutile-rs-a0-supply-chain.json', import.meta.url);

function command(status, stdout = '') {
  return { available: status === 0, status, stdout, stderr: '', error_code: null };
}

function evidence({
  platform = 'linux',
  arch = 'x64',
  rust = 'rustc 1.90.0 (synthetic)',
  cuda = 'Cuda compilation tools, release 13.3, V13.3.0',
  tileirasStatus = 0,
  gpu = 'NVIDIA GeForce RTX 4090, 8.9, 580.65.06, 24564'
} = {}) {
  return {
    platform,
    arch,
    rustc: command(0, rust),
    nvcc: command(0, cuda),
    tileiras: command(tileirasStatus, tileirasStatus === 0 ? 'tileiras synthetic help' : ''),
    nvidia_smi: command(0, gpu)
  };
}

test('CUDA Rust runner parsers recognize bounded version and GPU evidence', () => {
  assert.deepEqual(parseRustVersion('rustc 1.89.0 (abc)'), [1, 89, 0]);
  assert.deepEqual(parseCudaToolkitVersion('release 13.2, V13.2.1'), [13, 2]);
  assert.deepEqual(parseNvidiaSmiRows('NVIDIA A100, 8.0, 580.1, 40960'), [{
    name: 'NVIDIA A100',
    compute_capability: 8,
    driver_version: '580.1',
    memory_mib: 40960
  }]);
});

test('eligible Ampere-or-newer Linux x64 or ARM64 runner passes only the probe gate', () => {
  const result = evaluateCudaRustRunnerEvidence(evidence());
  assert.equal(result.eligible, true);
  assert.equal(result.checks.sm_80_plus, true);
  assert.equal(result.execution_effect, 'probe-only');
  assert.equal(result.authority_effect, 'none');
  assert.equal(result.runtime_activation, false);
  assert.equal(result.capability_promotion, false);

  const arm = evaluateCudaRustRunnerEvidence(evidence({
    arch: 'arm64',
    gpu: 'NVIDIA GB10, 12.1, 580.65.06, 131072'
  }));
  assert.equal(arm.eligible, true);
  assert.equal(arm.checks.supported_arch, true);
});

test('GitHub hosted T4-shaped evidence fails the sm_80 gate', () => {
  const result = evaluateCudaRustRunnerEvidence(evidence({
    gpu: 'NVIDIA Tesla T4, 7.5, 580.65.06, 16384'
  }));
  assert.equal(result.eligible, false);
  assert.equal(result.checks.sm_80_plus, false);
});

test('toolchain platform and Tile IR requirements fail closed independently', () => {
  for (const fixture of [
    { platform: 'win32' },
    { arch: 'riscv64' },
    { rust: 'rustc 1.88.0 (synthetic)' },
    { cuda: 'Cuda compilation tools, release 13.1, V13.1.0' },
    { tileirasStatus: 1 }
  ]) {
    assert.equal(evaluateCudaRustRunnerEvidence(evidence(fixture)).eligible, false);
  }
});

test('runner eligibility record blocks dispatch and paid provisioning', async () => {
  const record = JSON.parse(await readFile(eligibilityUrl, 'utf8'));
  assert.equal(record.schema, 'axiom-cuda-rust-runner-eligibility.v0');
  assert.equal(record.github_hosted_gpu.observed_gpu, 'NVIDIA Tesla T4');
  assert.equal(record.github_hosted_gpu.observed_compute_capability, 7.5);
  assert.equal(record.github_hosted_gpu.compatibility, 'rejected');
  assert.deepEqual(record.requirements.architecture, ['x64', 'arm64']);
  assert.equal(record.requirements.minimum_compute_capability, 8);
  assert.equal(record.execution.status, 'BLOCKED_ENVIRONMENT');
  assert.equal(record.execution.eligible_runner_verified, false);
  assert.equal(record.execution.allow_gpu_job_dispatch, false);
  assert.equal(record.execution.gpu_execution_status, 'NOT_RUN');
  assert.equal(record.execution.benchmark_evidence, null);
  assert.deepEqual(record.execution.performance_claims, []);
  assert.equal(record.spend_boundary.paid_infrastructure_authorized, false);
  assert.equal(record.spend_boundary.auto_provision_paid_runner, false);
  assert.equal(record.boundaries.authority_effect, 'none');
});

test('supply-chain review keeps generated FFI and advisory limits explicit', async () => {
  const review = JSON.parse(await readFile(supplyUrl, 'utf8'));
  assert.equal(review.schema, 'axiom-cuda-rust-supply-chain-review.v0');
  assert.equal(review.upstream.revision, 'd92c160949f58328ba6e96d81005e7110ba6f2b3');
  assert.equal(review.cargo_lock.package_records, 263);
  assert.equal(review.cargo_lock.crates_io_registry_packages, 251);
  assert.equal(review.cargo_lock.workspace_or_path_packages, 12);
  assert.equal(review.cargo_lock.git_packages, 0);
  assert.equal(review.generated_ffi_boundary.build_time_bindgen, true);
  assert.equal(review.generated_ffi_boundary.runtime_dynamic_loading, true);
  assert.equal(review.generated_ffi_boundary.unsafe_ffi_boundary_present, true);
  assert.equal(review.source_policy.locally_executed_cargo_deny, false);
  assert.equal(review.source_policy.locally_executed_cargo_audit, false);
  assert.equal(review.source_policy.ignored_advisories[0].id, 'RUSTSEC-2024-0436');
  assert.equal(review.review_result.classification, 'lab-only-preflight-acceptable');
  assert.equal(review.review_result.production_dependency_eligible, false);
  assert.equal(review.review_result.execution_eligible, false);
  assert.equal(review.boundaries.production_dependency, false);
});
