import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import test from 'node:test';

import {
  createAgentAttenuationProof,
  createAgentAuthorityCeiling
} from '../src/lib/agent-trust-attenuation-proof.mjs';
import {
  createSubagentDelegationAdmission,
  subagentDelegationAdmissionKeyId,
  verifySubagentDelegationAdmission
} from '../src/lib/agent-trust-subagent-delegation-admission.mjs';

const PARENT_CURRENTNESS = 'a'.repeat(64);
const PARENT_CURRENTNESS_VERIFICATION = 'b'.repeat(64);
const NEWER_PARENT_CURRENTNESS = 'c'.repeat(64);

function parentCeiling(overrides = {}) {
  return createAgentAuthorityCeiling({
    capabilities: ['cap.echo', 'cap.hash'],
    actions: [
      {
        id: 'system.echo',
        effect_destination: 'local',
        required_assurance: 'A1',
        required_confirmations: 1,
        required_confirmation_values: ['confirm.echo'],
        requires_independent_approval: false,
        timeout_ms: 5_000
      },
      {
        id: 'system.hash',
        effect_destination: 'local',
        required_assurance: 'A2',
        required_confirmations: 2,
        required_confirmation_values: ['confirm.hash'],
        requires_independent_approval: true,
        timeout_ms: 4_000
      }
    ],
    scopes: ['intent:execute', 'memory:read'],
    purposes: ['research.assist', 'test.conformance'],
    destinations: ['local', 'provider:fixture'],
    data_classes: ['public', 'user-private'],
    budgets: {
      max_requests_per_minute: 20,
      max_concurrent_requests: 4,
      max_execution_ms: 5_000,
      max_request_bytes: 131_072,
      max_response_bytes: 524_288,
      max_cost_units: 100
    },
    delegation: { may_subdelegate: true, remaining_depth: 2 },
    valid_from: '2026-09-01T17:00:00.000Z',
    expires_at: '2026-09-01T19:00:00.000Z',
    ...overrides
  });
}

function childCeiling(overrides = {}) {
  return createAgentAuthorityCeiling({
    capabilities: ['cap.echo'],
    actions: [
      {
        id: 'system.echo',
        effect_destination: 'local',
        required_assurance: 'A2',
        required_confirmations: 2,
        required_confirmation_values: ['confirm.echo', 'confirm.extra'],
        requires_independent_approval: true,
        timeout_ms: 2_500
      }
    ],
    scopes: ['intent:execute'],
    purposes: ['test.conformance'],
    destinations: ['local'],
    data_classes: ['public'],
    budgets: {
      max_requests_per_minute: 10,
      max_concurrent_requests: 2,
      max_execution_ms: 2_500,
      max_request_bytes: 65_536,
      max_response_bytes: 262_144,
      max_cost_units: 25
    },
    delegation: { may_subdelegate: true, remaining_depth: 1 },
    valid_from: '2026-09-01T17:05:00.000Z',
    expires_at: '2026-09-01T18:30:00.000Z',
    ...overrides
  });
}

function fixture() {
  const delegator = generateKeyPairSync('ed25519');
  const admissionAuthority = generateKeyPairSync('ed25519');
  const parent = parentCeiling();
  const child = childCeiling();
  const proof = createAgentAttenuationProof({
    proofId: 'attenuation.subagent.1',
    delegatorId: 'agent.parent.1',
    delegateId: 'agent.child.1',
    delegatorPrivateKey: delegator.privateKey,
    parentAuthority: parent,
    childAuthority: child,
    parentContextDigest: PARENT_CURRENTNESS,
    issuedAt: '2026-09-01T17:06:00.000Z',
    expiresAt: '2026-09-01T18:20:00.000Z'
  });
  return { delegator, admissionAuthority, parent, child, proof };
}

function createAdmission(f, overrides = {}) {
  return createSubagentDelegationAdmission({
    delegationId: 'delegation.subagent.1',
    attenuationProof: f.proof,
    delegatorPublicKey: f.delegator.publicKey,
    parentAuthority: f.parent,
    childAuthority: f.child,
    expectedDelegatorId: 'agent.parent.1',
    expectedDelegateId: 'agent.child.1',
    parentCurrentnessDigest: PARENT_CURRENTNESS,
    parentCurrentnessVerificationDigest: PARENT_CURRENTNESS_VERIFICATION,
    retainedLatestParentCurrentnessDigest: PARENT_CURRENTNESS,
    admissionAuthorityId: 'authority.local.delegation',
    admissionAuthorityPrivateKey: f.admissionAuthority.privateKey,
    issuedAt: '2026-09-01T17:07:00.000Z',
    expiresAt: '2026-09-01T18:00:00.000Z',
    ...overrides
  });
}

test('explicit admission establishes only the exact attenuated child ceiling and never authorizes execution', () => {
  const f = fixture();
  const admission = createAdmission(f);
  const verified = verifySubagentDelegationAdmission(admission, {
    admissionAuthorityPublicKey: f.admissionAuthority.publicKey,
    attenuationProof: f.proof,
    delegatorPublicKey: f.delegator.publicKey,
    parentAuthority: f.parent,
    childAuthority: f.child,
    expectedDelegatorId: 'agent.parent.1',
    expectedDelegateId: 'agent.child.1',
    expectedParentCurrentnessDigest: PARENT_CURRENTNESS,
    retainedLatestParentCurrentnessDigest: PARENT_CURRENTNESS
  });

  assert.equal(
    verified.statement.admission_authority_key_id,
    subagentDelegationAdmissionKeyId(f.admissionAuthority.publicKey)
  );
  assert.equal(verified.statement.attenuation_proof_digest, f.proof.proof_digest);
  assert.equal(verified.statement.parent_ceiling_digest, f.parent.ceiling_digest);
  assert.equal(verified.statement.child_ceiling_digest, f.child.ceiling_digest);
  assert.equal(verified.statement.parent_currentness_digest, PARENT_CURRENTNESS);
  assert.equal(
    verified.statement.parent_currentness_verification_digest,
    PARENT_CURRENTNESS_VERIFICATION
  );
  assert.equal(verified.statement.delegation_effect, 'establish-child-ceiling');
  assert.equal(verified.statement.execution_authorized, false);
  assert.equal(verified.statement.effect_authority, 'none');
  assert.equal(verified.statement.bearer_token, false);
  assert.equal(verified.statement.communication_can_delegate, false);
  assert.equal(verified.statement.discovery_can_delegate, false);
  assert.equal(verified.statement.runtime_attestation_can_delegate, false);
  assert.equal(verified.statement.global_currentness_claimed, false);
  assert.equal(verified.statement.descendant_effect_requires_recheck, true);
});

test('stale-but-valid parent currentness cannot mint or verify a new child delegation', () => {
  const f = fixture();

  assert.throws(
    () => createAdmission(f, {
      retainedLatestParentCurrentnessDigest: NEWER_PARENT_CURRENTNESS
    }),
    /latest parent currentness/i
  );

  const admission = createAdmission(f);
  assert.throws(
    () => verifySubagentDelegationAdmission(admission, {
      admissionAuthorityPublicKey: f.admissionAuthority.publicKey,
      attenuationProof: f.proof,
      delegatorPublicKey: f.delegator.publicKey,
      parentAuthority: f.parent,
      childAuthority: f.child,
      expectedDelegatorId: 'agent.parent.1',
      expectedDelegateId: 'agent.child.1',
      expectedParentCurrentnessDigest: PARENT_CURRENTNESS,
      retainedLatestParentCurrentnessDigest: NEWER_PARENT_CURRENTNESS
    }),
    /latest parent currentness/i
  );
});

test('attenuation proof must be bound to the same parent-currentness evidence used for admission', () => {
  const f = fixture();
  assert.throws(
    () => createAdmission(f, {
      parentCurrentnessDigest: NEWER_PARENT_CURRENTNESS,
      retainedLatestParentCurrentnessDigest: NEWER_PARENT_CURRENTNESS
    }),
    /parent context/i
  );
});

test('peer communication, discovered credentials, or metadata cannot substitute for an explicit attenuation proof', () => {
  const f = fixture();
  assert.throws(
    () => createAdmission(f, {
      attenuationProof: null,
      communicationEvidenceDigests: ['d'.repeat(64)],
      discoveredCredentialDigest: 'e'.repeat(64),
      agentCardDigest: 'f'.repeat(64)
    }),
    /attenuation proof/i
  );
});

test('admission rejects child-authority substitution and signed statement tamper', () => {
  const f = fixture();
  const admission = createAdmission(f);
  const widerChild = childCeiling({
    capabilities: ['cap.echo', 'cap.hash']
  });

  assert.throws(
    () => verifySubagentDelegationAdmission(admission, {
      admissionAuthorityPublicKey: f.admissionAuthority.publicKey,
      attenuationProof: f.proof,
      delegatorPublicKey: f.delegator.publicKey,
      parentAuthority: f.parent,
      childAuthority: widerChild,
      expectedDelegatorId: 'agent.parent.1',
      expectedDelegateId: 'agent.child.1',
      expectedParentCurrentnessDigest: PARENT_CURRENTNESS,
      retainedLatestParentCurrentnessDigest: PARENT_CURRENTNESS
    }),
    /(authority binding mismatch|widens parent authority)/i
  );

  const tampered = structuredClone(admission);
  tampered.statement.execution_authorized = true;
  assert.throws(
    () => verifySubagentDelegationAdmission(tampered, {
      admissionAuthorityPublicKey: f.admissionAuthority.publicKey,
      attenuationProof: f.proof,
      delegatorPublicKey: f.delegator.publicKey,
      parentAuthority: f.parent,
      childAuthority: f.child,
      expectedDelegatorId: 'agent.parent.1',
      expectedDelegateId: 'agent.child.1',
      expectedParentCurrentnessDigest: PARENT_CURRENTNESS,
      retainedLatestParentCurrentnessDigest: PARENT_CURRENTNESS
    }),
    /(proof-only boundary|statement digest mismatch|unsupported)/i
  );
});

test('delegation admission cannot outlive the attenuation proof or child authority', () => {
  const f = fixture();
  assert.throws(
    () => createAdmission(f, { expiresAt: '2026-09-01T18:21:00.000Z' }),
    /(attenuation proof|child authority)/i
  );
});
