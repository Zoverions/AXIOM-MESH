import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ENTITY_ASSURANCE_EVIDENCE_SCHEMA,
  ENTITY_ASSURANCE_POLICY_SCHEMA
} from '../src/lib/entity-assurance.mjs';
import {
  admitEntityAssuranceSource,
  collectBrokerVerifiedSourceBindings
} from '../src/lib/assurance-source-broker.mjs';

const NOW = '2026-09-01T12:00:00.000Z';

function policy() {
  return {
    schema: ENTITY_ASSURANCE_POLICY_SCHEMA,
    policy_id: 'policy.broker.entity',
    identity_requirement: 'none',
    requirements: [
      {
        dimension: 'reputation',
        minimum_strength: 'moderate',
        accepted_evidence_classes: ['independently_verified']
      }
    ],
    authority_effect: 'none',
    delegation_effect: 'none'
  };
}

function evidence(result = 'pass') {
  return {
    schema: ENTITY_ASSURANCE_EVIDENCE_SCHEMA,
    evidence_id: 'evidence.broker.reputation',
    subject_id: 'agent.broker-subject',
    dimension: 'reputation',
    result,
    strength: 'strong',
    evidence_class: 'independently_verified',
    basis_digest: 'a'.repeat(64),
    issuer_id: 'issuer.broker',
    binding_scope: 'pseudonymous',
    observed_at: '2026-09-01T11:00:00.000Z',
    expires_at: '2026-09-02T11:00:00.000Z',
    non_authorizing: true
  };
}

test('source broker admits a satisfied upstream entity-assurance decision', () => {
  const admission = admitEntityAssuranceSource({
    sourceId: 'source.entity-assurance',
    policy: policy(),
    evidence: [evidence()],
    subjectId: 'agent.broker-subject',
    now: NOW
  });
  assert.equal(admission.source_class, 'entity-assurance');
  assert.equal(admission.authority_effect, 'none');
  assert.equal(admission.truth_established, false);
  assert.match(admission.source_verification_digest, /^[a-f0-9]{64}$/);

  const bindings = collectBrokerVerifiedSourceBindings([admission]);
  assert.deepEqual(bindings.get(admission.source_verification_digest), {
    source_id: 'source.entity-assurance',
    source_class: 'entity-assurance'
  });
});

test('source broker refuses an unsatisfied upstream entity-assurance decision', () => {
  assert.throws(
    () => admitEntityAssuranceSource({
      sourceId: 'source.entity-assurance',
      policy: policy(),
      evidence: [evidence('fail')],
      subjectId: 'agent.broker-subject',
      now: NOW
    }),
    /cannot admit an unsatisfied/
  );
});

test('lookalike or cloned admissions cannot manufacture verified source status', () => {
  const admission = admitEntityAssuranceSource({
    sourceId: 'source.entity-assurance',
    policy: policy(),
    evidence: [evidence()],
    subjectId: 'agent.broker-subject',
    now: NOW
  });
  const forged = { ...admission };
  assert.throws(
    () => collectBrokerVerifiedSourceBindings([forged]),
    /only live admissions/
  );
});

test('broker admissions remain runtime-local and non-authorizing', () => {
  const admission = admitEntityAssuranceSource({
    sourceId: 'source.entity-assurance',
    policy: policy(),
    evidence: [evidence()],
    subjectId: 'agent.broker-subject',
    now: NOW
  });
  assert.equal(admission.authority_effect, 'none');
  assert.equal('execution_authority' in admission, false);
});
