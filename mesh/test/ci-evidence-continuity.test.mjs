import assert from 'node:assert/strict';
import test from 'node:test';

import { sha256 } from '../src/lib/canonical.mjs';
import {
  CI_EVIDENCE_RECORD_SCHEMA,
  buildCiEvidenceProjectEvent,
  ciEvidenceProjectContent,
  normalizeCiEvidenceRecord
} from '../src/lib/ci-evidence-continuity.mjs';
import { SOURCE_CONTENT_ADDRESS_PROFILE } from '../src/lib/source-continuity.mjs';

const SOURCE_STATE = 'a'.repeat(64);

function output({
  id = 'ci-output:test-report',
  kind = 'test_report',
  bytes = 'test report bytes',
  visibility = 'public',
  mode = 'digest_only',
  protectedRef = null
} = {}) {
  return {
    output_id: id,
    kind,
    media_type: 'application/json',
    sha256: sha256(bytes),
    byte_length: Buffer.byteLength(bytes),
    visibility,
    mode,
    protected_ref: protectedRef
  };
}

function record(overrides = {}) {
  return normalizeCiEvidenceRecord({
    schema: CI_EVIDENCE_RECORD_SCHEMA,
    project_id: 'axiom-mesh',
    check_id: 'ci-check:clean-kernel',
    workflow_id: 'workflow:clean-kernel',
    workflow_revision_digest: sha256('kernel.yml revision'),
    source_state_digest: SOURCE_STATE,
    started_at: '2026-08-12T12:00:00.000Z',
    completed_at: '2026-08-12T12:10:00.000Z',
    time_assurance: 'axiom_observed',
    conclusion: 'passed',
    runner: {
      execution_class: 'hosted',
      os: 'ubuntu-24.04',
      architecture: 'x86_64',
      runtime: 'node-24.18.0',
      isolation_class: 'vm',
      network_class: 'available',
      environment_digest: sha256('runner environment'),
      runner_evidence_digest: sha256('runner evidence')
    },
    result_evidence_digest: sha256('clean kernel result evidence'),
    outputs: [
      output(),
      output({
        id: 'ci-output:security-report',
        kind: 'security_report',
        bytes: 'sensitive security report',
        visibility: 'sensitive',
        mode: 'protected_reference',
        protectedRef: 'protected:ci-security-report-001'
      })
    ],
    provider_run_is_identity: false,
    governance_authority_granted: false,
    release_promotion_granted: false,
    capability_promotion_granted: false,
    content_address_profile: SOURCE_CONTENT_ADDRESS_PROFILE,
    ...overrides
  });
}

test('CI evidence identity is provider-independent and content-addressed', () => {
  const first = record();
  const second = record({ outputs: [...record().outputs].reverse() });
  assert.deepEqual(first, second);
  assert.match(first.record_id, /^ci-evidence-record:[a-f0-9]{64}$/);
  assert.match(first.record_digest, /^[a-f0-9]{64}$/);
  assert.equal(first.provider_run_is_identity, false);
  assert.equal(first.governance_authority_granted, false);
  assert.equal(first.release_promotion_granted, false);
  assert.equal(first.capability_promotion_granted, false);
  assert.equal('provider' in first, false);
  assert.equal('run_url' in first, false);
  assert.equal('run_id' in first, false);
});

test('provider run ids, URLs, and provider runner ids cannot enter canonical CI evidence', () => {
  assert.throws(() => record({ provider: 'github' }), /unsupported fields: provider/);
  assert.throws(() => record({ run_id: '31596234706' }), /unsupported fields: run_id/);
  assert.throws(
    () => record({ run_url: 'https://github.com/Zoverions/AXIOM-MESH/actions/runs/31596234706' }),
    /unsupported fields: run_url/
  );
  const raw = {
    execution_class: 'hosted',
    os: 'ubuntu',
    architecture: 'x86_64',
    runtime: 'node-24',
    isolation_class: 'vm',
    network_class: 'available',
    environment_digest: sha256('env'),
    runner_evidence_digest: sha256('runner'),
    provider_runner_id: 'hosted-agent-17'
  };
  assert.throws(() => record({ runner: raw }), /unsupported fields: provider_runner_id/);
});

test('passing CI can never self-promote release, governance, or capability authority', () => {
  for (const field of [
    'governance_authority_granted',
    'release_promotion_granted',
    'capability_promotion_granted'
  ]) {
    assert.throws(
      () => record({ [field]: true }),
      /claim boundary is weakened/
    );
  }
  const passed = record({ conclusion: 'passed' });
  assert.equal(passed.conclusion, 'passed');
  assert.equal(passed.governance_authority_granted, false);
  assert.equal(passed.release_promotion_granted, false);
  assert.equal(passed.capability_promotion_granted, false);
});

test('CI record requires exact workflow revision and source-state commitments', () => {
  assert.throws(
    () => record({ workflow_revision_digest: 'not-a-digest' }),
    /invalid format|64-64/
  );
  assert.throws(
    () => record({ source_state_digest: 'b'.repeat(63) }),
    /invalid format|64-64/
  );
  const first = record();
  const second = record({ source_state_digest: 'b'.repeat(64) });
  assert.notEqual(first.record_digest, second.record_digest);
});

test('CI completion cannot precede start and unsupported conclusions fail closed', () => {
  assert.throws(
    () => record({
      started_at: '2026-08-12T12:10:01.000Z',
      completed_at: '2026-08-12T12:10:00.000Z'
    }),
    /completion cannot precede start/
  );
  assert.throws(
    () => record({ conclusion: 'green-enough' }),
    /conclusion is unsupported/
  );
});

test('private and sensitive CI outputs can remain protected without embedding raw bytes', () => {
  const evidence = record();
  const security = evidence.outputs.find(item => item.output_id === 'ci-output:security-report');
  assert.equal(security.visibility, 'sensitive');
  assert.equal(security.mode, 'protected_reference');
  assert.equal(security.protected_ref, 'protected:ci-security-report-001');
  assert.equal(JSON.stringify(evidence).includes('sensitive security report'), false);

  assert.throws(
    () => record({ outputs: [output({
      visibility: 'sensitive',
      mode: 'protected_reference',
      protectedRef: 'https://storage.example.invalid/private/report'
    })] }),
    /invalid format/
  );
  assert.throws(
    () => record({ outputs: [output({
      mode: 'digest_only',
      protectedRef: 'protected:should-not-exist'
    })] }),
    /cannot carry a protected reference/
  );
});

test('CI output ids are unique and output order does not alter record identity', () => {
  const same = output();
  assert.throws(
    () => record({ outputs: [same, same] }),
    /output ids must be unique/
  );
  const a = output({ id: 'ci-output:a', bytes: 'a' });
  const b = output({ id: 'ci-output:b', bytes: 'b' });
  assert.deepEqual(record({ outputs: [a, b] }), record({ outputs: [b, a] }));
});

test('runner facts are content-bound evidence rather than actor identity', () => {
  const first = record();
  const changed = record({
    runner: {
      ...first.runner,
      isolation_class: 'container',
      runner_evidence_digest: sha256('different runner evidence')
    }
  });
  assert.notEqual(first.record_digest, changed.record_digest);
  assert.equal('actor_id' in first.runner, false);
  assert.equal('authority' in first.runner, false);
});

test('CI evidence bridges exactly into portable ci.check_completed project evidence', () => {
  const evidence = record();
  const content = ciEvidenceProjectContent(evidence);
  const event = buildCiEvidenceProjectEvent(evidence);

  assert.equal(event.object_kind, 'ci_check');
  assert.equal(event.event_kind, 'ci.check_completed');
  assert.equal(event.project_object_id, evidence.check_id);
  assert.equal(event.source_state_digest, evidence.source_state_digest);
  assert.equal(event.ci_outcome, evidence.conclusion);
  assert.deepEqual(event.content, {
    ...content,
    inline_utf8: null,
    protected_ref: null
  });
  assert.deepEqual(
    event.related_object_ids,
    evidence.outputs.map(item => item.output_id).sort()
  );
  assert.equal(event.governance_authority_granted, false);
  assert.equal(event.capability_promotion, false);
});

test('CI record and project bridge detect result/output substitution', () => {
  const original = record();
  const changedResult = record({ result_evidence_digest: sha256('different result') });
  assert.notEqual(original.record_digest, changedResult.record_digest);
  assert.notEqual(
    buildCiEvidenceProjectEvent(original).event_digest,
    buildCiEvidenceProjectEvent(changedResult).event_digest
  );

  const changedOutput = record({ outputs: [output({ bytes: 'different report bytes' })] });
  assert.notEqual(original.record_digest, changedOutput.record_digest);
});

test('normalized CI record cannot be re-addressed after tampering', () => {
  const original = record();
  const forged = structuredClone(original);
  forged.conclusion = 'failed';
  assert.throws(
    () => normalizeCiEvidenceRecord(forged),
    /digest does not match canonical content/
  );
});
