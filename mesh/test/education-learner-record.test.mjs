import assert from 'node:assert/strict';
import test from 'node:test';
import {
  EDUCATION_CONTRACT_CONTROLLER,
  loadEducationContract
} from '../src/domain/education-contract.mjs';
import {
  EDUCATION_LEARNER_EVENT_ACTION,
  EDUCATION_SELF_AUTHORITY_MODE,
  evaluateEducationLearnerEventConsent,
  executeEducationLearnerEvent
} from '../src/domain/education-learner-record.mjs';

const DIGEST = 'a'.repeat(64);
const PACK_DIGEST = 'b'.repeat(64);

function intent(overrides = {}) {
  return {
    intent_id: 'intent_education_test',
    principal: {
      id: 'learner.self',
      type: 'human',
      roles: ['learner'],
      scopes: ['education:learner:write']
    },
    action: EDUCATION_LEARNER_EVENT_ACTION,
    input: {
      contract_id: 'axiom.education',
      contract_version: '1.0.0',
      contract_sha256: 'a20e191a05308ef85bdc1cc74bfa0d54b98a176818f8030a172b4c3709a28fa2',
      subject_id: 'learner.self',
      consent_id: 'consent_self_learning',
      purpose: 'learning-progress-recording',
      event_id: 'event_bridge_1',
      event_type: 'claw.activity.completed',
      occurred_at: '2026-08-11T05:10:00.000Z',
      payload_digest: DIGEST,
      memory_object_id: 'memory_bridge_1'
    },
    purpose: 'operator-request',
    data_scopes: [],
    confirmations: [],
    approval_ids: [],
    submitted_at: '2026-08-11T05:10:01.000Z',
    ...overrides,
    principal: {
      id: 'learner.self',
      type: 'human',
      roles: ['learner'],
      scopes: ['education:learner:write'],
      ...(overrides.principal ?? {})
    },
    input: {
      contract_id: 'axiom.education',
      contract_version: '1.0.0',
      contract_sha256: 'a20e191a05308ef85bdc1cc74bfa0d54b98a176818f8030a172b4c3709a28fa2',
      subject_id: 'learner.self',
      consent_id: 'consent_self_learning',
      purpose: 'learning-progress-recording',
      event_id: 'event_bridge_1',
      event_type: 'claw.activity.completed',
      occurred_at: '2026-08-11T05:10:00.000Z',
      payload_digest: DIGEST,
      memory_object_id: 'memory_bridge_1',
      ...(overrides.input ?? {})
    }
  };
}

function consent(overrides = {}) {
  return {
    consent_id: 'consent_self_learning',
    subject: 'learner.self',
    controller: EDUCATION_CONTRACT_CONTROLLER,
    purpose: 'learning-progress-recording',
    scopes_json: ['learning-progress:write'],
    expires_at: '2027-08-11T05:10:00.000Z',
    status: 'active',
    created_at: '2026-08-11T05:00:00.000Z',
    revoked_at: null,
    ...overrides
  };
}

function executionBindings(authorization) {
  const educationConsent = {
    schema: 'axiom-education-consent-binding.v1',
    facts: authorization.facts,
    consent_digest: authorization.consent_digest
  };
  return {
    capability: {
      constraints: { education_consent: structuredClone(educationConsent) }
    },
    plan: {
      steps: [{
        id: 'execute',
        constraints: { education_consent: structuredClone(educationConsent) }
      }]
    }
  };
}

test('self-consent produces a minimal digest-bound education authorization', async () => {
  const contract = await loadEducationContract();
  const result = evaluateEducationLearnerEventConsent({
    contract,
    intent: intent(),
    consents: [consent()],
    now: '2026-08-11T05:10:00.000Z'
  });
  assert.equal(result.allow, true);
  assert.equal(result.facts.authority_mode, EDUCATION_SELF_AUTHORITY_MODE);
  assert.equal(result.facts.subject_id, 'learner.self');
  assert.equal(result.facts.controller, EDUCATION_CONTRACT_CONTROLLER);
  assert.deepEqual(result.facts.data_scopes, ['learning-progress:write']);
  assert.match(result.consent_digest, /^[a-f0-9]{64}$/);
  assert.equal('revocation_handle' in result.facts, false);
});

test('another subject cannot be laundered through self-consent', async () => {
  const contract = await loadEducationContract();
  const request = intent({ input: { subject_id: 'child.other' } });
  const result = evaluateEducationLearnerEventConsent({
    contract,
    intent: request,
    consents: [consent({ subject: 'child.other' })],
    now: '2026-08-11T05:10:00.000Z'
  });
  assert.deepEqual(result, {
    allow: false,
    code: 'education_subject_authority_unavailable',
    http_status: 403,
    reason: 'Only direct human subject self-authorization is implemented for education learner events.'
  });
});

test('machine or service identity cannot silently reuse the human self-consent profile', async () => {
  const contract = await loadEducationContract();
  for (const type of ['agent', 'service']) {
    const request = intent({ principal: { type } });
    const result = evaluateEducationLearnerEventConsent({
      contract,
      intent: request,
      consents: [consent()],
      now: '2026-08-11T05:10:00.000Z'
    });
    assert.equal(result.allow, false);
    assert.equal(result.code, 'education_subject_authority_unavailable');
  }
});

test('revoked, expired, wrong-controller, wrong-purpose, and widened-scope consent fail closed', async () => {
  const contract = await loadEducationContract();
  for (const receipt of [
    consent({ status: 'revoked', revoked_at: '2026-08-11T05:05:00.000Z' }),
    consent({ expires_at: '2026-08-11T05:09:59.000Z' }),
    consent({ controller: 'capsule:other' }),
    consent({ purpose: 'learning-progress-review' }),
    consent({ scopes_json: ['learning-progress:read', 'learning-progress:write'] })
  ]) {
    const result = evaluateEducationLearnerEventConsent({
      contract,
      intent: intent(),
      consents: [receipt],
      now: '2026-08-11T05:10:00.000Z'
    });
    assert.equal(result.allow, false);
    assert.equal(result.code, 'education_consent_mismatch');
  }
});

test('adapter emits digest/reference-only learner evidence without raw learner work', async () => {
  const contract = await loadEducationContract();
  const request = intent();
  const authorization = evaluateEducationLearnerEventConsent({
    contract,
    intent: request,
    consents: [consent()],
    now: '2026-08-11T05:10:00.000Z'
  });
  assert.equal(authorization.allow, true);
  const result = executeEducationLearnerEvent({
    contract,
    intent: request,
    ...executionBindings(authorization)
  });
  assert.equal(result.output.status, 'recorded');
  assert.equal(result.output.standards_bound, false);
  assert.equal(result.mutation.kind, 'education.learner.event.appended');
  assert.equal(result.mutation.payload.payload_digest, DIGEST);
  assert.equal(result.mutation.payload.memory_object_id, 'memory_bridge_1');
  assert.equal(result.mutation.payload.consent.consent_id, 'consent_self_learning');
  assert.match(result.mutation.payload.record_digest, /^[a-f0-9]{64}$/);
  const serialized = JSON.stringify(result);
  assert.equal(serialized.includes('raw_reflection'), false);
  assert.equal(serialized.includes('student_work'), false);
});

test('official standards are all-or-none and canonical when bound', async () => {
  const contract = await loadEducationContract();
  const request = intent({
    input: {
      active_pack_manifest_sha256: PACK_DIGEST,
      course_code: 'ONT-ELEM-G3',
      expectation_ids: ['ON-G3-LANG-B1', 'ON-G3-SS-A2']
    }
  });
  const authorization = evaluateEducationLearnerEventConsent({
    contract,
    intent: request,
    consents: [consent()],
    now: '2026-08-11T05:10:00.000Z'
  });
  assert.equal(authorization.allow, true);
  const result = executeEducationLearnerEvent({
    contract,
    intent: request,
    ...executionBindings(authorization)
  });
  assert.equal(result.output.standards_bound, true);
  assert.deepEqual(result.mutation.payload.standards.expectation_ids, [
    'ON-G3-LANG-B1',
    'ON-G3-SS-A2'
  ]);

  const partial = intent({ input: { active_pack_manifest_sha256: PACK_DIGEST } });
  const partialAuthorization = evaluateEducationLearnerEventConsent({
    contract,
    intent: partial,
    consents: [consent()],
    now: '2026-08-11T05:10:00.000Z'
  });
  assert.equal(partialAuthorization.allow, true);
  assert.throws(
    () => executeEducationLearnerEvent({
      contract,
      intent: partial,
      ...executionBindings(partialAuthorization)
    }),
    /must include pack digest, course code, and expectation IDs together/
  );
});

test('adapter refuses substituted bound consent even when plan and capability are tampered separately', async () => {
  const contract = await loadEducationContract();
  const request = intent();
  const authorization = evaluateEducationLearnerEventConsent({
    contract,
    intent: request,
    consents: [consent()],
    now: '2026-08-11T05:10:00.000Z'
  });
  assert.equal(authorization.allow, true);
  const bindings = executionBindings(authorization);
  bindings.capability.constraints.education_consent.facts.subject_id = 'other.subject';
  assert.throws(
    () => executeEducationLearnerEvent({ contract, intent: request, ...bindings }),
    /bindings differ|binding digest|does not match/
  );
});
