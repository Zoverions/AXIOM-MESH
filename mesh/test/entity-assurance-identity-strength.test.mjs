import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ENTITY_ASSURANCE_EVIDENCE_SCHEMA,
  ENTITY_ASSURANCE_POLICY_SCHEMA,
  evaluateEntityAssurance
} from '../src/lib/entity-assurance.mjs';

const DIGEST = 'b'.repeat(64);
const NOW = '2026-08-29T18:00:00.000Z';

test('weak declarations cannot satisfy persistent identity binding by themselves', () => {
  const result = evaluateEntityAssurance({
    subjectId: 'agent.synthetic',
    now: NOW,
    policy: {
      schema: ENTITY_ASSURANCE_POLICY_SCHEMA,
      policy_id: 'policy.identity-only',
      identity_requirement: 'persistent-pseudonymous',
      requirements: [],
      authority_effect: 'none',
      delegation_effect: 'none'
    },
    evidence: [{
      schema: ENTITY_ASSURANCE_EVIDENCE_SCHEMA,
      evidence_id: 'evidence.self-declared-continuity',
      subject_id: 'agent.synthetic',
      dimension: 'continuity',
      result: 'pass',
      strength: 'weak',
      evidence_class: 'declaration',
      basis_digest: DIGEST,
      issuer_id: null,
      binding_scope: 'pseudonymous',
      observed_at: '2026-08-29T17:30:00.000Z',
      expires_at: '2026-08-30T17:30:00.000Z',
      non_authorizing: true
    }]
  });

  assert.equal(result.decision, 'denied');
  assert.equal(result.identity_satisfied, false);
});
