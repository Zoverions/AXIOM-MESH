import assert from 'node:assert/strict';
import test from 'node:test';
import { loadEducationContract } from '../src/domain/education-contract.mjs';
import { applyEducationRuntimeGate } from '../src/domain/education-runtime-gate.mjs';

const CONTRACT_SHA = 'a20e191a05308ef85bdc1cc74bfa0d54b98a176818f8030a172b4c3709a28fa2';

function request({ subjectId = 'learner.self', consentId = 'consent_self_learning' } = {}) {
  return {
    intent_id: 'intent_education_gate',
    principal: {
      id: 'learner.self',
      type: 'human',
      roles: ['learner'],
      scopes: ['education:learner:write']
    },
    action: 'education.learner.event.append',
    input: {
      contract_id: 'axiom.education',
      contract_version: '1.0.0',
      contract_sha256: CONTRACT_SHA,
      subject_id: subjectId,
      consent_id: consentId,
      purpose: 'learning-progress-recording',
      event_id: 'event_bridge_1',
      event_type: 'claw.activity.completed',
      occurred_at: '2026-08-11T05:10:00.000Z',
      payload_digest: 'a'.repeat(64),
      memory_object_id: 'memory_bridge_1'
    }
  };
}

function allowedDecision(overrides = {}) {
  return {
    allow: true,
    risk: 'medium',
    tool: 'adapter.education-learner-record',
    constraints: {},
    effect: 'education.learner.event.append',
    timeout_ms: 10_000,
    requires_independent_approval: false,
    rule_id: 'policy:education.learner.event.append',
    policy_version: 'test-policy',
    policy_digest: 'b'.repeat(64),
    policy_layers: [],
    ...overrides
  };
}

function consent(overrides = {}) {
  return {
    consent_id: 'consent_self_learning',
    subject: 'learner.self',
    controller: 'capsule:axiom.education',
    purpose: 'learning-progress-recording',
    scopes_json: ['learning-progress:write'],
    expires_at: '2027-08-11T05:10:00.000Z',
    status: 'active',
    created_at: '2026-08-11T05:00:00.000Z',
    revoked_at: null,
    ...overrides
  };
}

test('denied education policy remains denied without consulting a receipt', async () => {
  const contract = await loadEducationContract();
  const denied = {
    allow: false,
    risk: 'medium',
    code: 'capability_unavailable',
    http_status: 503,
    reason: 'Unavailable',
    policy_version: 'test-policy',
    policy_digest: 'b'.repeat(64),
    policy_layers: []
  };
  const result = applyEducationRuntimeGate({
    contract,
    intent: request(),
    decision: denied,
    consents: [consent()],
    now: '2026-08-11T05:10:00.000Z'
  });
  assert.deepEqual(result, denied);
});

test('allowed learner append gains only the exact Grid-observed consent binding', async () => {
  const contract = await loadEducationContract();
  const result = applyEducationRuntimeGate({
    contract,
    intent: request(),
    decision: allowedDecision({ constraints: { max_event_bytes: 8192 } }),
    consents: [consent()],
    now: '2026-08-11T05:10:00.000Z'
  });
  assert.equal(result.allow, true);
  assert.equal(result.constraints.max_event_bytes, 8192);
  assert.equal(result.constraints.education_consent.facts.subject_id, 'learner.self');
  assert.equal(result.constraints.education_consent.facts.consent_id, 'consent_self_learning');
  assert.match(result.constraints.education_consent.consent_digest, /^[a-f0-9]{64}$/);
});

test('different subject requires delegated Grid authorization and cannot reuse self-consent', async () => {
  const contract = await loadEducationContract();
  const result = applyEducationRuntimeGate({
    contract,
    intent: request({ subjectId: 'child.other' }),
    decision: allowedDecision(),
    consents: [consent({ subject: 'child.other' })],
    now: '2026-08-11T05:10:00.000Z'
  });
  assert.equal(result.allow, false);
  assert.equal(result.code, 'education_delegated_authorization_unavailable');
  assert.equal(result.http_status, 403);
});

test('revocation between grant and intent prevents plan/capability authorization', async () => {
  const contract = await loadEducationContract();
  const result = applyEducationRuntimeGate({
    contract,
    intent: request(),
    decision: allowedDecision(),
    consents: [consent({
      status: 'revoked',
      revoked_at: '2026-08-11T05:09:00.000Z'
    })],
    now: '2026-08-11T05:10:00.000Z'
  });
  assert.equal(result.allow, false);
  assert.equal(result.code, 'education_consent_mismatch');
});

test('runtime facts cannot be injected through static policy constraints', async () => {
  const contract = await loadEducationContract();
  for (const forged of [
    { education_consent: { forged: true } },
    { education_delegated_consent: { forged: true } }
  ]) {
    assert.throws(
      () => applyEducationRuntimeGate({
        contract,
        intent: request(),
        decision: allowedDecision({ constraints: forged }),
        consents: [consent()],
        now: '2026-08-11T05:10:00.000Z'
      }),
      /may not pre-populate runtime education consent facts/
    );
  }
});
