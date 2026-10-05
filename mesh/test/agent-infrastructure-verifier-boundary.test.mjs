import assert from 'node:assert/strict';
import test from 'node:test';

import { validateAgentInfrastructureResult } from '../src/lib/agent-infrastructure-lab.mjs';

function verifiedClaim() {
  return {
    schema: 'axiom-agent-infrastructure-result.v1',
    result_id: 'infra-result:verification-boundary:001',
    challenge_id: 'infra:verification-boundary:001',
    offer_id: 'offer:verification-boundary:001',
    repository: 'Zoverions/AXIOM-MESH',
    base_sha: 'a'.repeat(40),
    node_profile_sha256: 'b'.repeat(64),
    execution: {
      started_at: '2026-08-18T12:00:00Z',
      completed_at: '2026-08-18T12:01:00Z',
      status: 'passed',
      operations_performed: ['read-system-facts']
    },
    evidence: {
      fact_status: 'measured',
      evidence_refs: ['artifact:verification-boundary:001'],
      logs_redacted: true,
      secrets_embedded: false,
      private_user_content_embedded: false
    },
    effects: {
      production_enrolled: false,
      credentials_issued: false,
      secrets_accessed: false,
      firmware_changed: false,
      purchase_performed: false,
      destructive_action_performed: false,
      security_boundary_weakened: false,
      authority_granted: false,
      capability_promoted: false
    },
    limitations: [],
    producer: {
      type: 'machine',
      id: 'agent:test',
      attestation_ref: 'attestation:test:001',
      verification_status: 'verified-by-challenge-verifier'
    }
  };
}

test('infrastructure producer cannot self-assert independent verification', () => {
  const claimed = verifiedClaim();
  assert.throws(
    () => validateAgentInfrastructureResult(claimed),
    /cannot self-assert independent verifier confirmation/
  );
  const independentlyConfirmed = validateAgentInfrastructureResult(claimed, {
    verifierConfirmed: true
  });
  assert.equal(independentlyConfirmed.valid, true);
  assert.equal(independentlyConfirmed.verification_status, 'verified-by-challenge-verifier');
  assert.equal(independentlyConfirmed.authority_granted, false);
});
