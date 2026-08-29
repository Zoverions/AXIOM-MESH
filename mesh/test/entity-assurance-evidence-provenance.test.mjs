import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ENTITY_ASSURANCE_EVIDENCE_SCHEMA,
  normalizeEntityAssuranceEvidence
} from '../src/lib/entity-assurance.mjs';

const DIGEST = 'c'.repeat(64);

function assertedEvidence(evidenceClass) {
  return {
    schema: ENTITY_ASSURANCE_EVIDENCE_SCHEMA,
    evidence_id: `evidence.${evidenceClass}`,
    subject_id: 'agent.synthetic',
    dimension: 'continuity',
    result: 'pass',
    strength: 'strong',
    evidence_class: evidenceClass,
    basis_digest: DIGEST,
    issuer_id: null,
    binding_scope: 'pseudonymous',
    observed_at: '2026-08-29T17:30:00.000Z',
    expires_at: '2026-08-30T17:30:00.000Z',
    non_authorizing: true
  };
}

test('authenticated and independently verified evidence require an issuer', () => {
  assert.throws(
    () => normalizeEntityAssuranceEvidence(assertedEvidence('authenticated_assertion')),
    /issuer/i
  );
  assert.throws(
    () => normalizeEntityAssuranceEvidence(assertedEvidence('independently_verified')),
    /issuer/i
  );
});
