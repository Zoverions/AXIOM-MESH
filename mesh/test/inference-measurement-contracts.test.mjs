import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  INFERENCE_BENCHMARK_EVIDENCE_SCHEMA,
  INFERENCE_WORKLOAD_PROFILE_SCHEMA,
  inferenceBenchmarkEvidenceDigest,
  inferenceWorkloadProfileDigest,
  resolveInferenceBenchmarkEvidence,
  validateInferenceBenchmarkEvidence,
  validateInferenceWorkloadProfile
} from '../src/lib/inference-measurement-contracts.mjs';

const workloadFixtureUrl = new URL('../fixtures/inference-measurement/workload-profiles-v0.json', import.meta.url);
const benchmarkFixtureUrl = new URL('../fixtures/inference-measurement/benchmark-evidence-v0.json', import.meta.url);

async function fixtures() {
  const workloads = JSON.parse(await readFile(workloadFixtureUrl, 'utf8'));
  const benchmarks = JSON.parse(await readFile(benchmarkFixtureUrl, 'utf8'));
  return { workloads, benchmarks };
}

test('W0-W5 workload fixtures validate as inert deterministic evidence definitions', async () => {
  const { workloads } = await fixtures();
  assert.equal(workloads.schema, 'axiom-inference-workload-fixtures.v0');
  assert.equal(workloads.profiles.length, 6);
  assert.deepEqual(
    workloads.profiles.map(item => item.profile_id),
    [
      'inference.w0.interactive-agent',
      'inference.w1.long-context-research',
      'inference.w2.repeated-personalized-prefix',
      'inference.w3.structured-agent-operation',
      'inference.w4.code-agent',
      'inference.w5.batch-intelligence'
    ]
  );

  for (const profile of workloads.profiles) {
    const before = JSON.stringify(profile);
    const result = validateInferenceWorkloadProfile(profile);
    assert.equal(result.valid, true);
    assert.equal(result.schema, INFERENCE_WORKLOAD_PROFILE_SCHEMA);
    assert.equal(result.profile_digest, inferenceWorkloadProfileDigest(profile));
    assert.equal(result.authority_effect, 'none');
    assert.equal(result.network_effect, 'none');
    assert.equal(result.credential_visibility, 'none');
    assert.equal(result.runtime_activation, false);
    assert.equal(result.selection_effect, 'none');
    assert.equal(result.capability_promotion, false);
    assert.equal(Object.isFrozen(result), true);
    assert.equal(JSON.stringify(profile), before);
  }

  assert.equal(
    inferenceWorkloadProfileDigest(workloads.profiles[0]),
    'd59572bf8946c544b0ebec1f08eacbcf7648dc3b99b137c8ae00409fe47769d6'
  );
});

test('workload profile digest is stable across object key order', async () => {
  const { workloads } = await fixtures();
  const first = workloads.profiles[0];
  const reordered = Object.fromEntries(Object.entries(first).reverse());
  assert.equal(inferenceWorkloadProfileDigest(first), inferenceWorkloadProfileDigest(reordered));
});

test('workload profile validation rejects structural drift and authority widening', async () => {
  const { workloads } = await fixtures();
  const base = workloads.profiles[0];

  const unknown = structuredClone(base);
  unknown.provider_api_key = 'forbidden';
  assert.throws(() => validateInferenceWorkloadProfile(unknown), /unknown field/i);

  const duplicate = structuredClone(base);
  duplicate.token_shape.concurrency_values.push(4);
  assert.throws(() => validateInferenceWorkloadProfile(duplicate), /duplicate/i);

  const badOrder = structuredClone(base);
  badOrder.token_shape.input_min = 2000;
  assert.throws(() => validateInferenceWorkloadProfile(badOrder), /min <= nominal <= max/i);

  const nonFinite = structuredClone(base);
  nonFinite.objectives.ttft_ms_p95 = Number.POSITIVE_INFINITY;
  assert.throws(() => validateInferenceWorkloadProfile(nonFinite), /finite number/i);

  for (const [field, value] of [
    ['authority_effect', 'grant'],
    ['network_effect', 'outbound'],
    ['credential_visibility', 'provider'],
    ['runtime_activation', true],
    ['selection_effect', 'winner'],
    ['capability_promotion', true]
  ]) {
    const changed = structuredClone(base);
    changed[field] = value;
    assert.throws(() => validateInferenceWorkloadProfile(changed), /boundary/i);
  }
});

test('synthetic local provider-remote and multi-device benchmark vectors validate and bind to W0', async () => {
  const { workloads, benchmarks } = await fixtures();
  const profile = workloads.profiles[0];

  assert.equal(benchmarks.schema, 'axiom-inference-benchmark-fixtures.v0');
  assert.equal(benchmarks.vectors.length, 3);
  for (const evidence of benchmarks.vectors) {
    const before = JSON.stringify(evidence);
    const result = validateInferenceBenchmarkEvidence(evidence);
    const resolved = resolveInferenceBenchmarkEvidence(evidence, profile);
    assert.equal(result.valid, true);
    assert.equal(result.schema, INFERENCE_BENCHMARK_EVIDENCE_SCHEMA);
    assert.equal(result.evidence_digest, inferenceBenchmarkEvidenceDigest(evidence));
    assert.equal(resolved.profile_digest, inferenceWorkloadProfileDigest(profile));
    assert.equal(resolved.authority_effect, 'none');
    assert.equal(resolved.network_effect, 'none');
    assert.equal(resolved.runtime_activation, false);
    assert.equal(resolved.capability_promotion, false);
    assert.equal(Object.isFrozen(result), true);
    assert.equal(Object.isFrozen(resolved), true);
    assert.equal(JSON.stringify(evidence), before);
  }

  assert.equal(benchmarks.vectors[0].environment.accelerator_count, 1);
  assert.equal(benchmarks.vectors[1].evidence_class, 'provider-reported');
  assert.equal(benchmarks.vectors[2].environment.accelerator_count, 2);
});

test('benchmark evidence preserves failures OOMs and percentile ordering', async () => {
  const { benchmarks } = await fixtures();
  const base = benchmarks.vectors[0];

  const hiddenFailure = structuredClone(base);
  hiddenFailure.observations.counts.success_count = 100;
  assert.throws(() => validateInferenceBenchmarkEvidence(hiddenFailure), /request_count.*success/i);

  const mismatchedMeasuredCount = structuredClone(base);
  mismatchedMeasuredCount.protocol.measured_requests = 101;
  assert.throws(() => validateInferenceBenchmarkEvidence(mismatchedMeasuredCount), /measured_requests/i);

  const badPercentiles = structuredClone(base);
  badPercentiles.observations.latency.ttft_ms.p50 = 200;
  badPercentiles.observations.latency.ttft_ms.p95 = 150;
  assert.throws(() => validateInferenceBenchmarkEvidence(badPercentiles), /p50 <= p95 <= p99/i);

  const partialPercentiles = structuredClone(base);
  partialPercentiles.observations.latency.itl_ms.p99 = null;
  assert.throws(() => validateInferenceBenchmarkEvidence(partialPercentiles), /all null or all measured/i);
});

test('benchmark provenance quality reproduction and accelerator semantics fail closed', async () => {
  const { benchmarks } = await fixtures();
  const base = benchmarks.vectors[0];

  const badRevision = structuredClone(base);
  badRevision.subject.repository_revision = 'main';
  assert.throws(() => validateInferenceBenchmarkEvidence(badRevision), /40-hex git revision/i);

  const independent = structuredClone(base);
  independent.evidence_class = 'independently-reproduced';
  assert.throws(() => validateInferenceBenchmarkEvidence(independent), /reproducer_ref/i);

  const missingQuality = structuredClone(base);
  missingQuality.quality.state = 'externally-bound';
  assert.throws(() => validateInferenceBenchmarkEvidence(missingQuality), /artifact_ref.*artifact_digest/i);

  const fakeQualityOnUnknown = structuredClone(base);
  fakeQualityOnUnknown.quality.artifact_ref = 'quality.fixture';
  fakeQualityOnUnknown.quality.artifact_digest = 'a'.repeat(64);
  assert.throws(() => validateInferenceBenchmarkEvidence(fakeQualityOnUnknown), /not-established/i);

  const impossibleCpuOnly = structuredClone(base);
  impossibleCpuOnly.environment.accelerator_kind = 'none';
  assert.throws(() => validateInferenceBenchmarkEvidence(impossibleCpuOnly), /inconsistent/i);
});

test('benchmark workload substitution and authority widening fail closed', async () => {
  const { workloads, benchmarks } = await fixtures();
  const profile = workloads.profiles[0];
  const base = benchmarks.vectors[0];

  const changedDigest = structuredClone(base);
  changedDigest.workload.profile_digest = 'f'.repeat(64);
  assert.throws(() => resolveInferenceBenchmarkEvidence(changedDigest, profile), /profile_digest mismatch/i);

  const changedFixture = structuredClone(base);
  changedFixture.workload.fixture_digest = 'e'.repeat(64);
  assert.throws(() => resolveInferenceBenchmarkEvidence(changedFixture, profile), /fixture_digest mismatch/i);

  for (const [field, value] of [
    ['authority_effect', 'grant'],
    ['network_effect', 'outbound'],
    ['credential_visibility', 'provider'],
    ['runtime_activation', true],
    ['selection_effect', 'winner'],
    ['capability_promotion', true]
  ]) {
    const changed = structuredClone(base);
    changed[field] = value;
    assert.throws(() => validateInferenceBenchmarkEvidence(changed), /boundary/i);
  }
});
