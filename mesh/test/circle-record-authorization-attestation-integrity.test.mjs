import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import test from 'node:test';

import { MeshIdentity } from '../src/lib/identity.mjs';
import {
  issueCircleDecisionParticipationAttestation,
  verifyCircleDecisionParticipationAttestation
} from '../../packages/axiom-circle-record-authorization/index.mjs';

function identity(service = 'hypervisor') {
  const pair = generateKeyPairSync('ed25519');
  return new MeshIdentity(
    service,
    pair.privateKey.export({ type: 'pkcs8', format: 'pem' }),
    pair.publicKey.export({ type: 'spki', format: 'pem' })
  );
}

function participantInput() {
  return {
    authenticated_principal: 'human.alpha',
    circle_id: 'circle.authz',
    decision_id: 'decision.authz',
    proposal_id: 'proposal.authz',
    proposal_binding_id: 'binding.proposal.authz',
    proposal_record_digest: 'a'.repeat(64),
    governing_charter_digest: 'b'.repeat(64),
    membership_id: 'membership.alpha',
    vote: 'approve',
    participated_at: '2026-08-20T12:20:00.000Z'
  };
}

test('Circle participant attestation verifies only under the exact trusted Hypervisor signature envelope', () => {
  const hypervisor = identity();
  const issued = issueCircleDecisionParticipationAttestation(hypervisor, participantInput());
  const verified = verifyCircleDecisionParticipationAttestation(
    issued.attestation,
    hypervisor.publicKey
  );
  assert.equal(verified.attestation_digest, issued.attestation_digest);
  assert.equal(verified.statement.principal_id, 'human.alpha');
  assert.equal(verified.statement.runtime_authority, false);
});

test('key-id substitution cannot re-address an otherwise valid signed participant statement', () => {
  const hypervisor = identity();
  const issued = issueCircleDecisionParticipationAttestation(hypervisor, participantInput());
  const tampered = structuredClone(issued.attestation);
  tampered.signature.key_id = `hypervisor:${'0'.repeat(16)}`;
  assert.throws(
    () => verifyCircleDecisionParticipationAttestation(tampered, hypervisor.publicKey),
    /signature envelope is invalid/
  );
});

test('hidden signature metadata and malformed signature bytes fail closed before attestation addressing', () => {
  const hypervisor = identity();
  const issued = issueCircleDecisionParticipationAttestation(hypervisor, participantInput());

  const hidden = structuredClone(issued.attestation);
  hidden.signature.note = 'unsigned-malleability';
  assert.throws(
    () => verifyCircleDecisionParticipationAttestation(hidden, hypervisor.publicKey),
    /signature fields are invalid/
  );

  const malformed = structuredClone(issued.attestation);
  malformed.signature.signature = 'not-base64url';
  assert.throws(
    () => verifyCircleDecisionParticipationAttestation(malformed, hypervisor.publicKey),
    /signature envelope is invalid/
  );
});

test('a different Hypervisor key cannot verify or relabel another Hypervisor participation attestation', () => {
  const issuer = identity();
  const substitute = identity();
  const issued = issueCircleDecisionParticipationAttestation(issuer, participantInput());
  assert.throws(
    () => verifyCircleDecisionParticipationAttestation(issued.attestation, substitute.publicKey),
    /signature envelope is invalid/
  );
});
