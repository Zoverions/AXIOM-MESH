import assert from 'node:assert/strict';
import test from 'node:test';

import { canonicalJson, sha256 } from '../src/lib/canonical.mjs';
import {
  AGENT_COLLECT_BENCHMARK_METRICS_ADAPTER_SCRIPT_SHA256,
  AGENT_COLLECT_BENCHMARK_METRICS_EXPECTED_CHECKSUM,
  AGENT_COLLECT_BENCHMARK_METRICS_ITERATIONS,
  AGENT_COLLECT_BENCHMARK_METRICS_POLICY_ID,
  AGENT_COLLECT_BENCHMARK_METRICS_WORKLOAD_ID,
  verifyAgentCollectBenchmarkMetricsEffectReceipt
} from '../src/lib/agent-collect-benchmark-metrics-effect.mjs';
import {
  createAgentCollectBenchmarkMetricsEffectAdmission,
  validateCollectBenchmarkMetricsEffectPlan,
  verifyAgentCollectBenchmarkMetricsEffectAdmission
} from '../src/lib/agent-collect-benchmark-metrics-effect-admission.mjs';
import {
  BENCHMARK_REVISION,
  benchmarkKeyPair,
  cleanupBenchmarkFixture,
  createBenchmarkFixture
} from './fixtures/agent-collect-benchmark-metrics-effect-fixture.mjs';

function clone(value) { return JSON.parse(JSON.stringify(value)); }
function observation(overrides = {}) {
  const elapsedNs = overrides.elapsed_ns ?? 1_234_567;
  const body = {
    benchmark_policy_id: AGENT_COLLECT_BENCHMARK_METRICS_POLICY_ID,
    workload_id: AGENT_COLLECT_BENCHMARK_METRICS_WORKLOAD_ID,
    iterations: AGENT_COLLECT_BENCHMARK_METRICS_ITERATIONS,
    checksum_u32: AGENT_COLLECT_BENCHMARK_METRICS_EXPECTED_CHECKSUM,
    timer_source: 'process.hrtime.bigint',
    elapsed_ns: elapsedNs
  };
  const metricsOutput = overrides.metrics_output ?? canonicalJson(body);
  return {
    adapter_script_sha256: AGENT_COLLECT_BENCHMARK_METRICS_ADAPTER_SCRIPT_SHA256,
    benchmark_policy_id: AGENT_COLLECT_BENCHMARK_METRICS_POLICY_ID,
    workload_id: AGENT_COLLECT_BENCHMARK_METRICS_WORKLOAD_ID,
    iterations: AGENT_COLLECT_BENCHMARK_METRICS_ITERATIONS,
    checksum_u32: AGENT_COLLECT_BENCHMARK_METRICS_EXPECTED_CHECKSUM,
    timer_source: 'process.hrtime.bigint',
    elapsed_ns: elapsedNs,
    metrics_output: metricsOutput,
    output_sha256: sha256(metricsOutput),
    output_bytes: Buffer.byteLength(metricsOutput, 'utf8'),
    exit_status: 0,
    stderr_empty: true,
    network_mode: 'none',
    repository_code_execution: false,
    host_telemetry_read: false,
    container_absent_after_cleanup: true,
    ...overrides
  };
}
function begin(fixture, revocationState = 'active') {
  return fixture.controller.begin({
    currentLifecycleTranscript: fixture.lifecycleTranscript,
    currentLifecycleReceipt: fixture.lifecycleReceipt,
    trustedLifecyclePublicKey: fixture.ledger.ledgerPublicKey,
    revocationState,
    occurredAt: '2026-08-18T15:05:05.000Z'
  });
}
function verifyReceipt(fixture, descriptor, receipt, overrides = {}) {
  return verifyAgentCollectBenchmarkMetricsEffectReceipt(receipt, {
    trustedExecutorPublicKey: fixture.controller.executorPublicKey,
    trustedAdmissionIssuerPublicKey: fixture.issuer.publicKey,
    trustedDurableStorePublicKey: fixture.store.storePublicKey,
    durableConsumeHeadReceipt: descriptor.durable_consume_head_receipt,
    plan: fixture.plan,
    admission: fixture.admission,
    isolationConformanceReceipt: fixture.isolation,
    ...overrides
  });
}

test('benchmark admission binds only the exact inert builtin plan', () => {
  const f = createBenchmarkFixture();
  try {
    const checked = validateCollectBenchmarkMetricsEffectPlan(f.plan);
    assert.equal(checked.effects.effect_reachable, false);
    assert.equal(checked.steps.length, 1);
    assert.equal(checked.steps[0].step_id, 'collect-benchmark-metrics:builtin');
    assert.equal(checked.steps[0].kind, 'builtin');
    assert.equal(checked.steps[0].executable_id, null);
    assert.deepEqual(checked.steps[0].arguments, []);
    const admission = verifyAgentCollectBenchmarkMetricsEffectAdmission(f.admission, {
      trustedIssuerPublicKey: f.issuer.publicKey,
      plan: f.plan,
      expectedRevision: BENCHMARK_REVISION,
      now: '2026-08-18T15:05:00.000Z'
    });
    assert.equal(admission.statement.operation_id, 'collect-benchmark-metrics');
    assert.equal(admission.statement.benchmark_policy_id, AGENT_COLLECT_BENCHMARK_METRICS_POLICY_ID);
    assert.equal(admission.statement.arbitrary_benchmark_authority, false);
    assert.equal(admission.statement.host_telemetry_authority, false);
    assert.equal(admission.statement.general_executor_authority, false);
  } finally { cleanupBenchmarkFixture(f); }
});

test('benchmark admission rejects signer, plan, lifetime and authority widening', () => {
  const f = createBenchmarkFixture();
  try {
    const wrong = benchmarkKeyPair();
    assert.throws(() => verifyAgentCollectBenchmarkMetricsEffectAdmission(f.admission, {
      trustedIssuerPublicKey: wrong.publicKey, plan: f.plan, expectedRevision: BENCHMARK_REVISION, now: '2026-08-18T15:05:00.000Z'
    }), /issuer|signature|key/i);
    const widenedPlan = clone(f.plan);
    widenedPlan.steps[0].kind = 'process-template';
    assert.throws(() => validateCollectBenchmarkMetricsEffectPlan(widenedPlan), /builtin|template|mapping|plan/i);
    const elevated = clone(f.admission);
    elevated.statement.host_telemetry_authority = true;
    assert.throws(() => verifyAgentCollectBenchmarkMetricsEffectAdmission(elevated, {
      trustedIssuerPublicKey: f.issuer.publicKey, plan: f.plan, expectedRevision: BENCHMARK_REVISION, now: '2026-08-18T15:05:00.000Z'
    }), /widen|digest|signature/i);
    assert.throws(() => createAgentCollectBenchmarkMetricsEffectAdmission({
      admissionId: 'effect-admission:benchmark:too-long', issuerId: 'issuer:benchmark:test', issuerPrivateKey: f.issuer.privateKey,
      plan: f.plan, revision: BENCHMARK_REVISION, notBefore: '2026-08-18T15:04:00.000Z', expiresAt: '2026-08-18T15:10:00.000Z'
    }), /lifetime|ceiling/i);
  } finally { cleanupBenchmarkFixture(f); }
});

test('unknown revocation fails before consumption; active state returns signed consumed head before benchmark effect', () => {
  const f = createBenchmarkFixture();
  try {
    assert.throws(() => begin(f, 'unknown'), /known-active/i);
    assert.equal(f.store.status, 'issued');
    const descriptor = begin(f);
    assert.equal(f.store.status, 'consumed');
    assert.equal(f.store.generation, 2);
    assert.equal(descriptor.operation_id, 'collect-benchmark-metrics');
    assert.equal(descriptor.workload_id, AGENT_COLLECT_BENCHMARK_METRICS_WORKLOAD_ID);
    assert.equal(descriptor.repository_mount_allowed, false);
    assert.equal(descriptor.host_telemetry_allowed, false);
    assert.equal(descriptor.durable_consume_head_receipt.statement.lifecycle_status, 'consumed');
    assert.equal(descriptor.durable_consume_head_receipt.statement.generation, 2);
    assert.throws(() => begin(f), /already consumed/i);
  } finally { cleanupBenchmarkFixture(f); }
});

test('fixed synthetic benchmark observation completes without machine-score or SLO elevation', () => {
  const f = createBenchmarkFixture();
  try {
    const descriptor = begin(f);
    const receipt = f.controller.complete({ observation: observation(), finishedAt: '2026-08-18T15:05:10.000Z' });
    const checked = verifyReceipt(f, descriptor, receipt);
    assert.equal(f.store.status, 'completed');
    assert.equal(f.store.generation, 3);
    assert.equal(checked.statement.real_process_effect_observed, true);
    assert.equal(checked.statement.synthetic_workload_observed, true);
    assert.equal(checked.statement.monotonic_timer_observed, true);
    assert.equal(checked.statement.host_telemetry_observed, false);
    assert.equal(checked.statement.machine_comparison_score_claimed, false);
    assert.equal(checked.statement.production_slo_claimed, false);
    assert.equal(checked.statement.task_success_claimed, false);
    assert.equal(checked.statement.general_executor_available, false);
  } finally { cleanupBenchmarkFixture(f); }
});

test('benchmark metrics reject checksum, timer, noncanonical output, hidden fields and telemetry claims', () => {
  for (const mutate of [
    value => { value.checksum_u32 = 7; },
    value => { value.elapsed_ns = 0; },
    value => {
      const parsed = JSON.parse(value.metrics_output);
      value.metrics_output = JSON.stringify({ elapsed_ns: parsed.elapsed_ns, timer_source: parsed.timer_source, checksum_u32: parsed.checksum_u32, iterations: parsed.iterations, workload_id: parsed.workload_id, benchmark_policy_id: parsed.benchmark_policy_id });
      value.output_sha256 = sha256(value.metrics_output);
      value.output_bytes = Buffer.byteLength(value.metrics_output);
    },
    value => {
      const parsed = JSON.parse(value.metrics_output);
      parsed.cpu_model = 'host-leak';
      value.metrics_output = canonicalJson(parsed);
      value.output_sha256 = sha256(value.metrics_output);
      value.output_bytes = Buffer.byteLength(value.metrics_output);
    },
    value => { value.host_telemetry_read = true; }
  ]) {
    const f = createBenchmarkFixture();
    try {
      begin(f);
      const candidate = observation();
      mutate(candidate);
      assert.throws(() => f.controller.complete({ observation: candidate, finishedAt: '2026-08-18T15:05:10.000Z' }), /benchmark|checksum|elapsed|canonical|output|telemetry|mapping/i);
      assert.equal(f.store.status, 'consumed');
      f.controller.interrupt({ occurredAt: '2026-08-18T15:05:11.000Z', reasonCode: 'test-invalid-benchmark' });
      assert.equal(f.store.status, 'interrupted');
    } finally { cleanupBenchmarkFixture(f); }
  }
});

test('benchmark effect receipt rejects consumed-head/store signer substitution and claim elevation', () => {
  const f = createBenchmarkFixture();
  try {
    const descriptor = begin(f);
    const receipt = f.controller.complete({ observation: observation(), finishedAt: '2026-08-18T15:05:10.000Z' });
    const wrongStore = benchmarkKeyPair();
    assert.throws(() => verifyReceipt(f, descriptor, receipt, { trustedDurableStorePublicKey: wrongStore.publicKey }), /store|key|signature/i);
    const stale = clone(descriptor.durable_consume_head_receipt);
    stale.statement.lifecycle_status = 'issued';
    assert.throws(() => verifyReceipt(f, descriptor, receipt, { durableConsumeHeadReceipt: stale }), /consumed|digest|signature|state/i);
    const elevated = clone(receipt);
    elevated.statement.machine_comparison_score_claimed = true;
    assert.throws(() => verifyReceipt(f, descriptor, elevated), /elevate|digest|signature/i);
  } finally { cleanupBenchmarkFixture(f); }
});
