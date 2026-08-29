import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import test from 'node:test';
import {
  ENTITY_ASSURANCE_EVIDENCE_SCHEMA,
  ENTITY_ASSURANCE_POLICY_SCHEMA,
  evaluateEntityAssurance,
  normalizeEntityAssuranceEvidence,
  normalizeEntityAssurancePolicy
} from '../src/lib/entity-assurance.mjs';

const DIGEST = 'a'.repeat(64);
const NOW = '2026-08-29T18:00:00.000Z';

const moduleUrl = new URL('../src/lib/entity-assurance.mjs', import.meta.url);

function evidence({
  id,
  dimension,
  result = 'pass',
  strength = 'strong',
  evidenceClass = 'independently_verified',
  bindingScope = 'pseudonymous',
  observedAt = '2026-08-29T17:30:00.000Z',
  expiresAt = '2026-08-30T17:30:00.000Z'
}) {
  return {
    schema: ENTITY_ASSURANCE_EVIDENCE_SCHEMA,
    evidence_id: id,
    subject_id: 'agent.alice',
    dimension,
    result,
    strength,
    evidence_class: evidenceClass,
    basis_digest: DIGEST,
    issuer_id: 'issuer.local',
    binding_scope: bindingScope,
    observed_at: observedAt,
    expires_at: expiresAt,
    non_authorizing: true
  };
}

function policy(overrides = {}) {
  return {
    schema: ENTITY_ASSURANCE_POLICY_SCHEMA,
    policy_id: 'policy.assurance.standard',
    identity_requirement: 'persistent-pseudonymous',
    requirements: [
      {
        dimension: 'continuity',
        minimum_strength: 'moderate',
        accepted_evidence_classes: ['authenticated_assertion', 'independently_verified']
      },
      {
        dimension: 'independence',
        minimum_strength: 'moderate',
        accepted_evidence_classes: ['measured', 'independently_verified']
      }
    ],
    authority_effect: 'none',
    delegation_effect: 'none',
    ...overrides
  };
}

test('entity assurance exists as a first-class trust primitive', () => {
  assert.equal(existsSync(moduleUrl), true);
});

test('normalizes evidence without granting authority', () => {
  const normalized = normalizeEntityAssuranceEvidence(evidence({
    id: 'evidence.continuity.1',
    dimension: 'continuity'
  }));
  assert.equal(normalized.subject_id, 'agent.alice');
  assert.equal(normalized.dimension, 'continuity');
  assert.equal(normalized.non_authorizing, true);
  assert.equal(normalized.authority_granted, false);
  assert.match(normalized.evidence_digest, /^[a-f0-9]{64}$/);
  assert.equal(Object.isFrozen(normalized), true);
});

test('satisfies a pseudonymous policy without requiring legal identity', () => {
  const result = evaluateEntityAssurance({
    policy: policy(),
    subjectId: 'agent.alice',
    now: NOW,
    evidence: [
      evidence({ id: 'evidence.continuity.1', dimension: 'continuity' }),
      evidence({ id: 'evidence.independence.1', dimension: 'independence' })
    ]
  });
  assert.equal(result.decision, 'satisfied');
  assert.equal(result.satisfied, true);
  assert.equal(result.identity_requirement, 'persistent-pseudonymous');
  assert.equal(result.legal_identity_required, false);
  assert.deepEqual(result.missing_dimensions, []);
  assert.deepEqual(result.denied_dimensions, []);
  assert.equal(result.authority_granted, false);
  assert.equal(result.delegation_granted, false);
});

test('fresh negative evidence is deny-dominant for a required dimension', () => {
  const result = evaluateEntityAssurance({
    policy: policy(),
    subjectId: 'agent.alice',
    now: NOW,
    evidence: [
      evidence({ id: 'evidence.continuity.pass', dimension: 'continuity' }),
      evidence({ id: 'evidence.continuity.fail', dimension: 'continuity', result: 'fail' }),
      evidence({ id: 'evidence.independence.pass', dimension: 'independence' })
    ]
  });
  assert.equal(result.decision, 'denied');
  assert.equal(result.satisfied, false);
  assert.deepEqual(result.denied_dimensions, ['continuity']);
});

test('missing required evidence fails closed', () => {
  const result = evaluateEntityAssurance({
    policy: policy(),
    subjectId: 'agent.alice',
    now: NOW,
    evidence: [evidence({ id: 'evidence.continuity.1', dimension: 'continuity' })]
  });
  assert.equal(result.decision, 'denied');
  assert.deepEqual(result.missing_dimensions, ['independence']);
});

test('expired evidence cannot satisfy a requirement', () => {
  const result = evaluateEntityAssurance({
    policy: policy(),
    subjectId: 'agent.alice',
    now: NOW,
    evidence: [
      evidence({
        id: 'evidence.continuity.expired',
        dimension: 'continuity',
        expiresAt: '2026-08-29T17:59:59.000Z'
      }),
      evidence({ id: 'evidence.independence.1', dimension: 'independence' })
    ]
  });
  assert.equal(result.decision, 'denied');
  assert.deepEqual(result.missing_dimensions, ['continuity']);
});

test('legal identity is optional and policy-selected', () => {
  const legalPolicy = policy({ identity_requirement: 'legal' });
  const withoutLegalBinding = evaluateEntityAssurance({
    policy: legalPolicy,
    subjectId: 'agent.alice',
    now: NOW,
    evidence: [
      evidence({ id: 'evidence.continuity.1', dimension: 'continuity' }),
      evidence({ id: 'evidence.independence.1', dimension: 'independence' })
    ]
  });
  assert.equal(withoutLegalBinding.decision, 'denied');
  assert.equal(withoutLegalBinding.identity_satisfied, false);

  const withLegalBinding = evaluateEntityAssurance({
    policy: legalPolicy,
    subjectId: 'agent.alice',
    now: NOW,
    evidence: [
      evidence({ id: 'evidence.continuity.legal', dimension: 'continuity', bindingScope: 'legal' }),
      evidence({ id: 'evidence.independence.1', dimension: 'independence' })
    ]
  });
  assert.equal(withLegalBinding.decision, 'satisfied');
  assert.equal(withLegalBinding.identity_satisfied, true);
  assert.equal(withLegalBinding.legal_identity_required, true);
});

test('evidence and policies cannot widen authority', () => {
  const authorizingEvidence = evidence({ id: 'evidence.bad', dimension: 'continuity' });
  authorizingEvidence.non_authorizing = false;
  assert.throws(() => normalizeEntityAssuranceEvidence(authorizingEvidence), /non-authorizing|authority/i);

  const authorizingPolicy = policy({ authority_effect: 'grant' });
  assert.throws(() => normalizeEntityAssurancePolicy(authorizingPolicy), /authority/i);
});

test('unknown dimensions and duplicate requirements fail closed', () => {
  const unknown = evidence({ id: 'evidence.unknown', dimension: 'mind-reading' });
  assert.throws(() => normalizeEntityAssuranceEvidence(unknown), /dimension/i);

  const duplicate = policy();
  duplicate.requirements.push({ ...duplicate.requirements[0] });
  assert.throws(() => normalizeEntityAssurancePolicy(duplicate), /duplicate/i);
});
