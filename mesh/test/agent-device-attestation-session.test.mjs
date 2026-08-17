import assert from 'node:assert/strict';
import { generateKeyPairSync, sign } from 'node:crypto';
import test from 'node:test';

import { canonicalJson, sha256 } from '../src/lib/canonical.mjs';
import {
  validateAgentDeviceAttestation,
  validateAgentTestSessionAuthorization
} from '../src/lib/agent-device-attestation-session.mjs';

const PROFILE_SHA = 'b'.repeat(64);
const BASE_SHA = 'a'.repeat(40);
const NONCE = 'challenge_nonce_0123456789ABCDEF';
const NOW = new Date('2026-08-18T12:05:00Z');

function offer() {
  return {
    schema: 'axiom-agent-infrastructure-offer.v1',
    offer_id: 'offer:macmini:m4:attested',
    repository: 'Zoverions/AXIOM-MESH',
    publisher: { type: 'human', id: 'contributor:test' },
    node_profile: {
      schema: 'axiom-compute-node-profile.v1',
      profile_id: 'node:macmini:m4:attested',
      profile_sha256: PROFILE_SHA
    },
    custody: { physical_control: 'contributor', remote_access_available: false },
    availability: {
      starts_at: '2026-08-18T11:00:00Z',
      expires_at: '2026-08-18T13:00:00Z',
      maximum_sessions: 4
    },
    challenge_classes: ['hardware-validation'],
    evidence: { fact_status: 'declared', evidence_refs: [] },
    boundaries: {
      destructive_actions_allowed: false,
      production_enrollment_allowed: false,
      credential_issuance_allowed: false,
      secret_access_allowed: false,
      firmware_changes_allowed: false,
      purchases_allowed: false,
      authority_granted: false,
      payment_promised: false
    }
  };
}

function challenge() {
  return {
    schema: 'axiom-agent-infrastructure-challenge.v1',
    challenge_id: 'infra:macos:m4:attested-check',
    repository: 'Zoverions/AXIOM-MESH',
    base_sha: BASE_SHA,
    class: 'hardware-validation',
    target: { offer_id: 'offer:macmini:m4:attested', node_profile_sha256: PROFILE_SHA },
    plan: {
      allowed_operations: ['read-system-facts', 'run-tests', 'collect-sanitized-logs'],
      prohibited_operations: [
        'production-node-enrollment',
        'credential-issuance',
        'secret-retrieval',
        'firmware-change',
        'boot-chain-change',
        'disk-erasure',
        'purchase-or-subscription',
        'security-boundary-weakening',
        'unbounded-remote-shell',
        'permanent-system-mutation'
      ],
      network: {
        mode: 'bounded-public-read',
        allowed_origins: ['https://github.com', 'https://registry.npmjs.org'],
        credentials_allowed: false
      }
    },
    acceptance: ['Run the exact-base hardware compatibility check.'],
    evidence_requirements: ['Return sanitized evidence.'],
    security_reporting: { public_safe: true, private_route: 'SECURITY.md' },
    boundaries: {
      production_enrollment_allowed: false,
      credential_issuance_allowed: false,
      secret_access_allowed: false,
      firmware_changes_allowed: false,
      purchases_allowed: false,
      destructive_actions_allowed: false,
      authority_granted: false,
      payment_promised: false
    },
    expires_at: '2026-08-18T12:15:00Z'
  };
}

function signedAttestation() {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  const publicKeyDer = publicKey.export({ format: 'der', type: 'spki' });
  const statement = {
    attestation_id: 'attestation:macmini:m4:001',
    repository: 'Zoverions/AXIOM-MESH',
    offer_id: 'offer:macmini:m4:attested',
    node_profile_sha256: PROFILE_SHA,
    nonce: NONCE,
    issued_at: '2026-08-18T12:00:00Z',
    expires_at: '2026-08-18T12:15:00Z',
    claims: {
      physical_ownership_verified: false,
      platform_backed_key_verified: false,
      secure_element_verified: false,
      boot_integrity_verified: false,
      external_verifier_confirmed: false
    }
  };
  return {
    schema: 'axiom-agent-device-attestation.v1',
    statement,
    key: {
      algorithm: 'ed25519',
      public_key_spki_der_base64: publicKeyDer.toString('base64'),
      fingerprint_sha256: sha256(publicKeyDer)
    },
    signature_base64: sign(
      null,
      Buffer.from(canonicalJson(statement), 'utf8'),
      privateKey
    ).toString('base64'),
    evidence_refs: ['evidence:key-possession:001'],
    boundaries: {
      production_enrollment_allowed: false,
      remote_execution_allowed: false,
      credential_issuance_allowed: false,
      secret_access_allowed: false,
      firmware_changes_allowed: false,
      platform_trust_inferred: false,
      authority_granted: false
    }
  };
}

function authorization(attestation) {
  return {
    schema: 'axiom-agent-test-session-authorization.v1',
    authorization_id: 'session-auth:macmini:m4:001',
    repository: 'Zoverions/AXIOM-MESH',
    sponsor: { type: 'human', id: 'sponsor:test-human', approval_ref: 'approval:issue:1109' },
    subject: { type: 'machine', id: 'agent:test-runtime' },
    challenge: {
      challenge_id: 'infra:macos:m4:attested-check',
      offer_id: 'offer:macmini:m4:attested',
      node_profile_sha256: PROFILE_SHA
    },
    attestation: {
      attestation_id: attestation.statement.attestation_id,
      key_fingerprint_sha256: attestation.key.fingerprint_sha256
    },
    timing: {
      issued_at: '2026-08-18T12:04:00Z',
      not_before: '2026-08-18T12:05:00Z',
      expires_at: '2026-08-18T12:10:00Z',
      maximum_duration_seconds: 300
    },
    scope: {
      allowed_operations: ['read-system-facts', 'run-tests'],
      network: {
        mode: 'bounded-public-read',
        allowed_origins: ['https://github.com']
      },
      filesystem_scope: 'disposable-workspace-only',
      credentials_allowed: false,
      secret_access_allowed: false,
      interactive_shell_allowed: false,
      unbounded_remote_shell_allowed: false
    },
    revocation: {
      revocable: true,
      one_time: true,
      fail_closed_on_unknown: true,
      revocation_ref: 'revocation:session-auth:macmini:m4:001'
    },
    effects: {
      effect_reachable: false,
      production_enrollment: false,
      persistent_remote_administration: false,
      credentials_issued: false,
      secrets_accessed: false,
      firmware_changed: false,
      boot_chain_changed: false,
      purchase_performed: false,
      destructive_action_performed: false,
      permanent_system_mutation: false,
      deployment_authority: false,
      capability_promoted: false
    }
  };
}

test('device attestation proves fresh Ed25519 key possession only', () => {
  const attestation = signedAttestation();
  const result = validateAgentDeviceAttestation(attestation, {
    offer: offer(),
    expectedNonce: NONCE,
    now: NOW
  });
  assert.equal(result.valid, true);
  assert.equal(result.proof, 'ed25519-key-possession-only');
  assert.equal(result.platform_trust_inferred, false);
  assert.equal(result.authority_granted, false);
});

test('device attestation rejects nonce substitution and stale evidence', () => {
  assert.throws(
    () => validateAgentDeviceAttestation(signedAttestation(), {
      offer: offer(), expectedNonce: 'different_nonce_0123456789ABCD', now: NOW
    }),
    /nonce does not match/
  );
  assert.throws(
    () => validateAgentDeviceAttestation(signedAttestation(), {
      offer: offer(), expectedNonce: NONCE, now: new Date('2026-08-18T12:16:00Z')
    }),
    /freshness window/
  );
});

test('device attestation signature detects statement substitution', () => {
  const attestation = signedAttestation();
  attestation.statement.node_profile_sha256 = 'c'.repeat(64);
  assert.throws(
    () => validateAgentDeviceAttestation(attestation, { expectedNonce: NONCE, now: NOW }),
    /signature is invalid/
  );
});

test('device attestation cannot self-assert platform or external verification', () => {
  for (const key of [
    'physical_ownership_verified',
    'platform_backed_key_verified',
    'secure_element_verified',
    'boot_integrity_verified',
    'external_verifier_confirmed'
  ]) {
    const attestation = signedAttestation();
    attestation.statement.claims[key] = true;
    assert.throws(
      () => validateAgentDeviceAttestation(attestation, { expectedNonce: NONCE, now: NOW }),
      /cannot elevate/
    );
  }
});

test('bounded test session composes exact offer, challenge, and attestation without reachable effects', () => {
  const attestation = signedAttestation();
  const session = authorization(attestation);
  const result = validateAgentTestSessionAuthorization(session, {
    offer: offer(),
    challenge: challenge(),
    attestation,
    expectedNonce: NONCE,
    now: NOW
  });
  assert.equal(result.valid, true);
  assert.equal(result.one_time, true);
  assert.equal(result.revocable, true);
  assert.equal(result.effect_reachable, false);
  assert.equal(result.production_authority, false);
});

test('test session requires human sponsor and machine subject', () => {
  const attestation = signedAttestation();
  const nonHuman = authorization(attestation);
  nonHuman.sponsor.type = 'machine';
  assert.throws(() => validateAgentTestSessionAuthorization(nonHuman), /human sponsor/);
  const nonMachine = authorization(attestation);
  nonMachine.subject.type = 'human';
  assert.throws(() => validateAgentTestSessionAuthorization(nonMachine), /machine principal/);
});

test('test session cannot widen challenge operations or network', () => {
  const attestation = signedAttestation();
  const widerOperation = authorization(attestation);
  widerOperation.scope.allowed_operations.push('collect-benchmark-metrics');
  assert.throws(
    () => validateAgentTestSessionAuthorization(widerOperation, {
      offer: offer(), challenge: challenge(), attestation, expectedNonce: NONCE, now: NOW
    }),
    /widens the challenge operation set/
  );
  const widerOrigin = authorization(attestation);
  widerOrigin.scope.network.allowed_origins.push('https://example.invalid');
  assert.throws(
    () => validateAgentTestSessionAuthorization(widerOrigin, {
      offer: offer(), challenge: challenge(), attestation, expectedNonce: NONCE, now: NOW
    }),
    /widens the challenge network origins/
  );
});

test('test session rejects credential, shell, reusable, or reachable-effect elevation', () => {
  const attestation = signedAttestation();
  for (const mutate of [
    session => { session.scope.credentials_allowed = true; },
    session => { session.scope.interactive_shell_allowed = true; },
    session => { session.revocation.one_time = false; },
    session => { session.effects.effect_reachable = true; },
    session => { session.effects.production_enrollment = true; },
    session => { session.effects.capability_promoted = true; }
  ]) {
    const session = authorization(attestation);
    mutate(session);
    assert.throws(
      () => validateAgentTestSessionAuthorization(session, {
        offer: offer(), challenge: challenge(), attestation, expectedNonce: NONCE, now: NOW
      })
    );
  }
});

test('test session cannot outlive challenge or attestation freshness', () => {
  const attestation = signedAttestation();
  const session = authorization(attestation);
  session.timing.expires_at = '2026-08-18T12:16:00Z';
  session.timing.maximum_duration_seconds = 660;
  assert.throws(
    () => validateAgentTestSessionAuthorization(session, {
      offer: offer(), challenge: challenge(), attestation, expectedNonce: NONCE, now: NOW
    }),
    /outlives the infrastructure challenge|attestation freshness window/
  );
});

test('test session rejects attestation substitution', () => {
  const attestation = signedAttestation();
  const session = authorization(attestation);
  session.attestation.key_fingerprint_sha256 = 'd'.repeat(64);
  assert.throws(
    () => validateAgentTestSessionAuthorization(session, {
      offer: offer(), challenge: challenge(), attestation, expectedNonce: NONCE, now: NOW
    }),
    /does not bind the exact device attestation/
  );
});
