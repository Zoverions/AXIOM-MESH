import assert from 'node:assert/strict';
import test from 'node:test';
import { digestObject } from '../src/lib/canonical.mjs';
import {
  EDUCATION_DELEGATED_AUTHORITY_MODE,
  evaluateEducationDelegatedAuthorization,
  validateEducationDelegatedBinding
} from '../src/domain/education-delegated-authorization.mjs';

const NOW = new Date(Date.now() + 3_600_000).toISOString();
const AUTHORITY_STATE = 'a'.repeat(64);
const AUTHORITY_OBSERVATION = 'b'.repeat(64);
const RECEIPT = 'c'.repeat(64);

function intent(overrides = {}) {
  return {
    principal: { id: 'adult.guardian.1', type: 'human' },
    action: 'education.learner.event.append',
    input: {
      subject_id: 'learner.child.1',
      consent_id: 'delegated_consent_1',
      purpose: 'learning-progress-recording'
    },
    ...overrides
  };
}

function authorization(overrides = {}) {
  const facts = {
    schema: 'axiom-human-delegated-consent-facts.v1',
    consent_id: 'delegated_consent_1',
    subject_id: 'learner.child.1',
    holder_id: 'adult.guardian.1',
    authority_grant_id: 'authority_guardian_child_1',
    relationship_claim_id: 'relationship_guardian_child_1',
    authority_digest: AUTHORITY_STATE,
    authority_observation_digest: AUTHORITY_OBSERVATION,
    controller: 'capsule:axiom.education',
    purpose: 'learning-progress-recording',
    action: 'education.learner.event.append',
    data_scopes: ['learning-progress:write'],
    consent_expires_at: NOW,
    resolved_at: new Date().toISOString(),
    ...(overrides.facts ?? {})
  };
  return {
    allow: true,
    facts,
    delegated_consent_digest: digestObject(facts),
    receipt_digest: RECEIPT,
    ...Object.fromEntries(Object.entries(overrides).filter(([key]) => key !== 'facts'))
  };
}

test('delegated authorization minimizes volatile observations into stable education facts', () => {
  const first = evaluateEducationDelegatedAuthorization({ intent: intent(), authorization: authorization() });
  assert.equal(first.allow, true);
  assert.equal(first.facts.authority_mode, EDUCATION_DELEGATED_AUTHORITY_MODE);
  assert.equal(first.facts.authority_digest, AUTHORITY_STATE);
  assert.equal(first.facts.receipt_digest, RECEIPT);
  assert.equal(Object.hasOwn(first.facts, 'resolved_at'), false);
  assert.equal(Object.hasOwn(first.facts, 'authority_observation_digest'), false);

  const second = evaluateEducationDelegatedAuthorization({
    intent: intent(),
    authorization: authorization({
      facts: {
        authority_observation_digest: 'd'.repeat(64),
        resolved_at: new Date(Date.now() + 1_000).toISOString()
      }
    })
  });
  assert.equal(second.allow, true);
  assert.equal(second.authorization_digest, first.authorization_digest);
});

test('current delegated denial remains denial and cannot be converted into education authority', () => {
  const result = evaluateEducationDelegatedAuthorization({
    intent: intent(),
    authorization: {
      allow: false,
      code: 'authority_conflict_unresolved',
      reason: 'conflict'
    }
  });
  assert.equal(result.allow, false);
  assert.equal(result.code, 'authority_conflict_unresolved');
});

test('holder, subject, receipt, controller, purpose, action and scope substitution fail closed', () => {
  for (const changed of [
    authorization({ facts: { holder_id: 'adult.other' } }),
    authorization({ facts: { subject_id: 'learner.child.2' } }),
    authorization({ facts: { consent_id: 'delegated_consent_2' } }),
    authorization({ facts: { controller: 'capsule:other' } }),
    authorization({ facts: { purpose: 'learning-progress-review' } }),
    authorization({ facts: { action: 'education.learner.progress.read' } }),
    authorization({ facts: { data_scopes: ['learning-progress:read'] } })
  ]) {
    const result = evaluateEducationDelegatedAuthorization({ intent: intent(), authorization: changed });
    assert.equal(result.allow, false);
    assert.equal(result.code, 'education_delegated_authorization_mismatch');
  }
});

test('self-subject and machine holders cannot use delegated education mode', () => {
  const self = intent({
    principal: { id: 'learner.child.1', type: 'human' }
  });
  assert.equal(
    evaluateEducationDelegatedAuthorization({ intent: self, authorization: authorization() }).allow,
    false
  );
  const machine = intent({ principal: { id: 'adult.guardian.1', type: 'service' } });
  assert.equal(
    evaluateEducationDelegatedAuthorization({ intent: machine, authorization: authorization() }).allow,
    false
  );
});

test('plan/capability binding validates exact stable facts and rejects stale substitution', () => {
  const resolved = evaluateEducationDelegatedAuthorization({ intent: intent(), authorization: authorization() });
  const binding = {
    schema: 'axiom-education-delegated-consent-binding.v1',
    facts: resolved.facts,
    authorization_digest: resolved.authorization_digest
  };
  assert.equal(validateEducationDelegatedBinding(binding, intent()).facts.subject_id, 'learner.child.1');
  assert.throws(
    () => validateEducationDelegatedBinding({
      ...binding,
      facts: { ...binding.facts, authority_digest: '0'.repeat(64) }
    }, intent()),
    /binding digest is invalid/
  );
});
