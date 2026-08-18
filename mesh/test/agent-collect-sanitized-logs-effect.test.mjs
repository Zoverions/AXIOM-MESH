import assert from 'node:assert/strict';
import test from 'node:test';

import { canonicalJson, sha256 } from '../src/lib/canonical.mjs';
import {
  AGENT_COLLECT_SANITIZED_LOGS_ADAPTER_SCRIPT_SHA256,
  AGENT_COLLECT_SANITIZED_LOGS_EXPECTED_RECORDS,
  AGENT_COLLECT_SANITIZED_LOGS_FORBIDDEN_SENTINEL,
  AGENT_COLLECT_SANITIZED_LOGS_SOURCE_LOGICAL_PATH,
  verifyAgentCollectSanitizedLogsEffectReceipt
} from '../src/lib/agent-collect-sanitized-logs-effect.mjs';
import {
  createAgentCollectSanitizedLogsEffectAdmission,
  validateCollectSanitizedLogsEffectPlan,
  verifyAgentCollectSanitizedLogsEffectAdmission
} from '../src/lib/agent-collect-sanitized-logs-effect-admission.mjs';
import {
  COLLECT_LOGS_REVISION,
  cleanupCollectSanitizedLogsFixture,
  collectLogsKeyPair,
  createCollectSanitizedLogsFixture
} from './fixtures/agent-collect-sanitized-logs-effect-fixture.mjs';

function clone(value) { return JSON.parse(JSON.stringify(value)); }
function observation(overrides = {}) {
  const body = {
    sanitization_policy_id: 'synthetic-jsonl-allowlist-v1',
    source_record_count: 3,
    source_bytes: 703,
    records: AGENT_COLLECT_SANITIZED_LOGS_EXPECTED_RECORDS.map(record => ({ ...record }))
  };
  const sanitizedOutput = overrides.sanitized_output ?? canonicalJson(body);
  return {
    adapter_script_sha256: AGENT_COLLECT_SANITIZED_LOGS_ADAPTER_SCRIPT_SHA256,
    source_logical_path: AGENT_COLLECT_SANITIZED_LOGS_SOURCE_LOGICAL_PATH,
    source_record_count: 3,
    source_bytes: 703,
    sanitized_record_count: 3,
    sanitized_output: sanitizedOutput,
    output_sha256: sha256(sanitizedOutput),
    output_bytes: Buffer.byteLength(sanitizedOutput, 'utf8'),
    source_open_nofollow: true,
    source_regular_file: true,
    source_inside_disposable_workspace: true,
    forbidden_sentinel_absent: true,
    exit_status: 0,
    stderr_empty: true,
    network_mode: 'none',
    repository_code_execution: false,
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
    occurredAt: '2026-08-18T14:05:05.000Z'
  });
}
function verifyReceipt(fixture, descriptor, receipt, overrides = {}) {
  return verifyAgentCollectSanitizedLogsEffectReceipt(receipt, {
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

test('sanitized-log admission binds only the exact inert builtin plan', () => {
  const f = createCollectSanitizedLogsFixture();
  try {
    const checked = validateCollectSanitizedLogsEffectPlan(f.plan);
    assert.equal(checked.effects.effect_reachable, false);
    assert.equal(checked.steps.length, 1);
    assert.equal(checked.steps[0].step_id, 'collect-sanitized-logs:builtin');
    assert.equal(checked.steps[0].kind, 'builtin');
    assert.equal(checked.steps[0].executable_id, null);
    assert.deepEqual(checked.steps[0].arguments, []);
    const admission = verifyAgentCollectSanitizedLogsEffectAdmission(f.admission, {
      trustedIssuerPublicKey: f.issuer.publicKey,
      plan: f.plan,
      expectedRevision: COLLECT_LOGS_REVISION,
      now: '2026-08-18T14:05:00.000Z'
    });
    assert.equal(admission.statement.operation_id, 'collect-sanitized-logs');
    assert.equal(admission.statement.arbitrary_path_authority, false);
    assert.equal(admission.statement.host_or_repository_log_authority, false);
    assert.equal(admission.statement.general_executor_authority, false);
  } finally { cleanupCollectSanitizedLogsFixture(f); }
});

test('admission rejects signer, plan, operation, lifetime and authority widening', () => {
  const f = createCollectSanitizedLogsFixture();
  try {
    const wrong = collectLogsKeyPair();
    assert.throws(() => verifyAgentCollectSanitizedLogsEffectAdmission(f.admission, {
      trustedIssuerPublicKey: wrong.publicKey, plan: f.plan, expectedRevision: COLLECT_LOGS_REVISION, now: '2026-08-18T14:05:00.000Z'
    }), /issuer|signature|key/i);
    const widenedPlan = clone(f.plan);
    widenedPlan.steps[0].kind = 'process-template';
    assert.throws(() => validateCollectSanitizedLogsEffectPlan(widenedPlan), /builtin|template|mapping|plan/i);
    const elevated = clone(f.admission);
    elevated.statement.arbitrary_path_authority = true;
    assert.throws(() => verifyAgentCollectSanitizedLogsEffectAdmission(elevated, {
      trustedIssuerPublicKey: f.issuer.publicKey, plan: f.plan, expectedRevision: COLLECT_LOGS_REVISION, now: '2026-08-18T14:05:00.000Z'
    }), /widen|digest|signature/i);
    assert.throws(() => createAgentCollectSanitizedLogsEffectAdmission({
      admissionId: 'effect-admission:collect-logs:too-long', issuerId: 'issuer:collect-logs:test', issuerPrivateKey: f.issuer.privateKey,
      plan: f.plan, revision: COLLECT_LOGS_REVISION, notBefore: '2026-08-18T14:04:00.000Z', expiresAt: '2026-08-18T14:10:00.000Z'
    }), /lifetime|ceiling/i);
  } finally { cleanupCollectSanitizedLogsFixture(f); }
});

test('unknown revocation fails before consumption; active state returns signed consumed head before effect', () => {
  const f = createCollectSanitizedLogsFixture();
  try {
    assert.throws(() => begin(f, 'unknown'), /known-active/i);
    assert.equal(f.store.status, 'issued');
    const descriptor = begin(f);
    assert.equal(f.store.status, 'consumed');
    assert.equal(f.store.generation, 2);
    assert.equal(descriptor.operation_id, 'collect-sanitized-logs');
    assert.equal(descriptor.source_logical_path, 'work/session/logs/lab.jsonl');
    assert.equal(descriptor.repository_mount_allowed, false);
    assert.equal(descriptor.host_log_mount_allowed, false);
    assert.equal(descriptor.durable_consume_head_receipt.statement.lifecycle_status, 'consumed');
    assert.equal(descriptor.durable_consume_head_receipt.statement.generation, 2);
    assert.throws(() => begin(f), /already consumed/i);
  } finally { cleanupCollectSanitizedLogsFixture(f); }
});

test('exact sanitized projection completes and verifies with the signed consumed head', () => {
  const f = createCollectSanitizedLogsFixture();
  try {
    const descriptor = begin(f);
    const receipt = f.controller.complete({ observation: observation(), finishedAt: '2026-08-18T14:05:10.000Z' });
    const checked = verifyReceipt(f, descriptor, receipt);
    assert.equal(f.store.status, 'completed');
    assert.equal(f.store.generation, 3);
    assert.equal(checked.statement.disposable_filesystem_write_observed, true);
    assert.equal(checked.statement.disposable_filesystem_read_observed, true);
    assert.equal(checked.statement.sanitization_allowlist_observed, true);
    assert.equal(checked.statement.arbitrary_path_used, false);
    assert.equal(checked.statement.host_or_repository_logs_read, false);
    assert.equal(checked.statement.task_success_claimed, false);
    assert.equal(checked.statement.general_executor_available, false);
  } finally { cleanupCollectSanitizedLogsFixture(f); }
});

test('sanitized output rejects forbidden material, noncanonical projection, extra fields and path drift', () => {
  for (const mutate of [
    value => {
      value.sanitized_output = canonicalJson({
        sanitization_policy_id: 'synthetic-jsonl-allowlist-v1',
        source_record_count: 3,
        source_bytes: 703,
        records: [
          { ...AGENT_COLLECT_SANITIZED_LOGS_EXPECTED_RECORDS[0], component: AGENT_COLLECT_SANITIZED_LOGS_FORBIDDEN_SENTINEL },
          ...AGENT_COLLECT_SANITIZED_LOGS_EXPECTED_RECORDS.slice(1)
        ]
      });
      value.output_sha256 = sha256(value.sanitized_output);
      value.output_bytes = Buffer.byteLength(value.sanitized_output);
    },
    value => {
      const parsed = JSON.parse(value.sanitized_output);
      value.sanitized_output = JSON.stringify({
        sanitization_policy_id: parsed.sanitization_policy_id,
        source_record_count: parsed.source_record_count,
        source_bytes: parsed.source_bytes,
        records: parsed.records
      });
      value.output_sha256 = sha256(value.sanitized_output);
      value.output_bytes = Buffer.byteLength(value.sanitized_output);
    },
    value => {
      const parsed = JSON.parse(value.sanitized_output);
      parsed.records[0].message = 'free form';
      value.sanitized_output = canonicalJson(parsed);
      value.output_sha256 = sha256(value.sanitized_output);
      value.output_bytes = Buffer.byteLength(value.sanitized_output);
    },
    value => { value.source_logical_path = '../host.log'; }
  ]) {
    const f = createCollectSanitizedLogsFixture();
    try {
      begin(f);
      const candidate = observation();
      mutate(candidate);
      assert.throws(() => f.controller.complete({ observation: candidate, finishedAt: '2026-08-18T14:05:10.000Z' }), /sanitized|forbidden|canonical|projection|record|mapping/i);
      assert.equal(f.store.status, 'consumed');
      f.controller.interrupt({ occurredAt: '2026-08-18T14:05:11.000Z', reasonCode: 'test-invalid-sanitized-log' });
      assert.equal(f.store.status, 'interrupted');
    } finally { cleanupCollectSanitizedLogsFixture(f); }
  }
});

test('effect receipt rejects consumed-head/store signer substitution and claim elevation', () => {
  const f = createCollectSanitizedLogsFixture();
  try {
    const descriptor = begin(f);
    const receipt = f.controller.complete({ observation: observation(), finishedAt: '2026-08-18T14:05:10.000Z' });
    const wrongStore = collectLogsKeyPair();
    assert.throws(() => verifyReceipt(f, descriptor, receipt, { trustedDurableStorePublicKey: wrongStore.publicKey }), /store|key|signature/i);
    const stale = clone(descriptor.durable_consume_head_receipt);
    stale.statement.lifecycle_status = 'issued';
    assert.throws(() => verifyReceipt(f, descriptor, receipt, { durableConsumeHeadReceipt: stale }), /consumed|digest|signature|state/i);
    const elevated = clone(receipt);
    elevated.statement.host_or_repository_logs_read = true;
    assert.throws(() => verifyReceipt(f, descriptor, elevated), /elevate|digest|signature/i);
  } finally { cleanupCollectSanitizedLogsFixture(f); }
});