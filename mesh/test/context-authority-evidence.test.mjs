import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import test from 'node:test';
import { digestObject } from '../src/lib/canonical.mjs';
import { MeshIdentity } from '../src/lib/identity.mjs';
import {
  compileContextCapsuleFromSignedEvidence,
  verifyContextAuthorityEvidence,
  verifyContextAuthorityEvidenceBundle
} from '../src/lib/context-authority-evidence.mjs';

const NOW = Date.parse('2026-08-22T17:00:00.000Z');
const ISSUED_AT = '2026-08-22T16:45:00.000Z';
const EXPIRES_AT = '2026-08-22T17:15:00.000Z';

function makeIdentity(service) {
  const pair = generateKeyPairSync('ed25519');
  return new MeshIdentity(
    service,
    pair.privateKey.export({ type: 'pkcs8', format: 'pem' }),
    pair.publicKey.export({ type: 'spki', format: 'pem' })
  );
}

const policyIdentity = makeIdentity('context-policy');
const gatekeeperIdentity = makeIdentity('vault-gatekeeper');
const receiptIdentity = makeIdentity('context-receipt');
const rogueIdentity = makeIdentity('rogue-context');

function publicPem(identity) {
  return String(identity.publicKey.export({ type: 'spki', format: 'pem' }));
}

function trustPins() {
  return [
    {
      issuer_principal_ref: 'policy_authority_1',
      key_id: policyIdentity.keyId,
      public_key_pem: publicPem(policyIdentity),
      allowed_evidence_types: ['context-disclosure-policy-decision']
    },
    {
      issuer_principal_ref: 'vault_gatekeeper_1',
      key_id: gatekeeperIdentity.keyId,
      public_key_pem: publicPem(gatekeeperIdentity),
      allowed_evidence_types: [
        'vault-access-lease',
        'vault-lease-revocation-check'
      ]
    },
    {
      issuer_principal_ref: 'receipt_authority_1',
      key_id: receiptIdentity.keyId,
      public_key_pem: publicPem(receiptIdentity),
      allowed_evidence_types: ['vault-access-receipt']
    }
  ];
}

function request() {
  return {
    schema: 'axiom-context-request.v1',
    request_id: 'request_1',
    owner_subject_ref: 'owner_1',
    requester_principal_ref: 'assistant_1',
    recipient_principal_ref: 'travel_agent_1',
    purpose: 'choose an accessible hotel',
    task_class: 'travel.hotel-selection',
    issued_at: '2026-08-22T16:00:00.000Z',
    expires_at: '2026-08-22T18:00:00.000Z',
    semantic_needs: [{
      semantic_type: 'travel.accessibility.requirements',
      need: 'minimum accommodation constraints for hotel selection',
      required: true,
      maximum_sensitivity: 'restricted',
      acceptable_disclosure_modes: ['transformed-constraint'],
      minimum_confidence: 0.8
    }],
    retention_request: {
      max_seconds: 600,
      recipient_may_persist_requested: false
    },
    minimum_necessary_requested: true,
    source_vault_selector_in_request: false,
    requests_vault_mount: false,
    requests_raw_vault_object: false,
    grants_vault_access: false,
    grants_execution_authority: false,
    onward_disclosure_requested: false
  };
}

function policyDecision() {
  return {
    schema: 'axiom-context-disclosure-policy-decision.v1',
    decision_ref: 'policy_decision_1',
    request_id: 'request_1',
    owner_subject_ref: 'owner_1',
    recipient_principal_ref: 'travel_agent_1',
    allowed: true,
    allowed_semantic_types: ['travel.accessibility.requirements'],
    allowed_disclosure_modes: ['transformed-constraint'],
    maximum_sensitivity: 'restricted',
    max_retention_seconds: 600,
    recipient_may_persist: false,
    max_capsule_lifetime_seconds: 600,
    minimum_necessary_confirmed: true
  };
}

function lease() {
  return {
    schema: 'axiom-vault-access-lease.v1',
    lease_id: 'lease_1',
    owner_subject_ref: 'owner_1',
    holder_principal_ref: 'broker_1',
    vault_id: 'vault_health_1',
    purpose: 'choose an accessible hotel',
    task_class: 'travel.hotel-selection',
    issued_at: '2026-08-22T16:30:00.000Z',
    expires_at: '2026-08-22T17:30:00.000Z',
    allowed_operations: ['derive'],
    resource_scope: {
      wildcard_scope: false,
      resource_refs: ['record_accessibility_1'],
      semantic_types: ['travel.accessibility.requirements'],
      maximum_sensitivity: 'restricted'
    },
    policy_decision_ref: 'lease_policy_1',
    grant_ref: 'lease_grant_1',
    access_receipt_reservation_ref: 'reservation_1',
    delegable: false,
    usable_outside_owner_trust_domain: false,
    contains_raw_key_material: false,
    grants_other_vault_access: false,
    grants_kernel_effect_authority: false,
    permits_raw_content_export: false,
    mutation_authority: false,
    requires_revocation_check_before_use: true,
    access_receipt_required: true
  };
}

function accessReceipt() {
  return {
    receipt_ref: 'receipt_1',
    reservation_ref: 'reservation_1',
    lease_id: 'lease_1',
    owner_subject_ref: 'owner_1',
    holder_principal_ref: 'broker_1',
    vault_id: 'vault_health_1',
    purpose: 'choose an accessible hotel',
    task_class: 'travel.hotel-selection',
    recorded_at: '2026-08-22T16:50:00.000Z',
    committed: true
  };
}

function revocationCheck() {
  return {
    check_ref: 'revocation_check_1',
    lease_id: 'lease_1',
    checked_at: '2026-08-22T16:40:00.000Z',
    valid_until: '2026-08-22T17:20:00.000Z',
    revoked: false
  };
}

function claims() {
  return [{
    claim_id: 'claim_1',
    semantic_type: 'travel.accessibility.requirements',
    value: {
      step_free_entry_required: true,
      elevator_required_if_room_above_ground: true
    },
    disclosure_type: 'transformed-constraint',
    sensitivity: 'sensitive',
    confidence: 0.95,
    limitations: 'Constraint only; diagnosis and source topology omitted.',
    source_vault_id: 'vault_health_1',
    source_resource_refs: ['record_accessibility_1']
  }];
}

function signEvidence({
  identity,
  issuer,
  type,
  evidenceId,
  nonce,
  payload,
  issuedAt = ISSUED_AT,
  expiresAt = EXPIRES_AT
}) {
  const unsigned = {
    schema: 'axiom-context-authority-evidence.v1',
    evidence_id: evidenceId,
    evidence_type: type,
    issuer_principal_ref: issuer,
    issued_at: issuedAt,
    expires_at: expiresAt,
    nonce,
    payload_sha256: digestObject(payload),
    payload: structuredClone(payload)
  };
  return {
    ...unsigned,
    attestation: identity.signObject(unsigned)
  };
}

function evidenceSet(overrides = {}) {
  return {
    policyDecisionEvidence: signEvidence({
      identity: policyIdentity,
      issuer: 'policy_authority_1',
      type: 'context-disclosure-policy-decision',
      evidenceId: 'evidence_policy_1',
      nonce: 'nonce_policy_1',
      payload: policyDecision()
    }),
    leaseEvidence: [signEvidence({
      identity: gatekeeperIdentity,
      issuer: 'vault_gatekeeper_1',
      type: 'vault-access-lease',
      evidenceId: 'evidence_lease_1',
      nonce: 'nonce_lease_1',
      payload: lease()
    })],
    accessReceiptEvidence: [signEvidence({
      identity: receiptIdentity,
      issuer: 'receipt_authority_1',
      type: 'vault-access-receipt',
      evidenceId: 'evidence_receipt_1',
      nonce: 'nonce_receipt_1',
      payload: accessReceipt()
    })],
    revocationCheckEvidence: [signEvidence({
      identity: gatekeeperIdentity,
      issuer: 'vault_gatekeeper_1',
      type: 'vault-lease-revocation-check',
      evidenceId: 'evidence_revocation_1',
      nonce: 'nonce_revocation_1',
      payload: revocationCheck()
    })],
    ...overrides
  };
}

function compileSigned(overrides = {}) {
  return compileContextCapsuleFromSignedEvidence({
    request: request(),
    ...evidenceSet(),
    trustPins: trustPins(),
    claims: claims(),
    brokerPrincipalRef: 'broker_1',
    capsuleId: 'capsule_signed_1',
    issuedAt: '2026-08-22T17:00:00.000Z',
    localProvenanceReceiptRefs: ['provenance_1'],
    now: NOW,
    ...overrides
  });
}

function clone(value) {
  return structuredClone(value);
}

function rejects(pattern) {
  return error => {
    assert.equal(error?.name, 'ValidationError');
    assert.match(error.message, pattern);
    return true;
  };
}

test('pinned Ed25519 evidence compiles through the existing no-authority broker', () => {
  const result = compileSigned();

  assert.equal(result.authority_evidence_verified, true);
  assert.equal(result.authority_evidence_signatures_verified, true);
  assert.equal(result.authority_evidence_key_pins_verified, true);
  assert.deepEqual(result.authority_evidence_ids, [
    'evidence_lease_1',
    'evidence_policy_1',
    'evidence_receipt_1',
    'evidence_revocation_1'
  ]);
  assert.equal(result.capsule.disclosures.length, 1);
  assert.equal(result.evidence_verifier_reads_vaults, false);
  assert.equal(result.evidence_verifier_issues_leases, false);
  assert.equal(result.evidence_verifier_commits_receipts, false);
  assert.equal(result.evidence_verifier_delivers_capsule, false);
  assert.equal(result.grants_vault_access, false);
  assert.equal(result.grants_execution_authority, false);

  const serialized = JSON.stringify(result);
  assert.doesNotMatch(serialized, /BEGIN PUBLIC KEY/);
  assert.doesNotMatch(serialized, /"attestation"/);
  assert.doesNotMatch(serialized, /"signature":/);
  assert.doesNotMatch(serialized, /"public_key_pem"/);
});

test('individual evidence verification binds issuer, pin, type, payload digest, and signature', () => {
  const envelope = evidenceSet().policyDecisionEvidence;
  const verified = verifyContextAuthorityEvidence(envelope, {
    trustPins: trustPins(),
    expectedEvidenceType: 'context-disclosure-policy-decision',
    now: NOW
  });

  assert.equal(verified.valid, true);
  assert.equal(verified.issuer_principal_ref, 'policy_authority_1');
  assert.equal(verified.key_id, policyIdentity.keyId);
  assert.equal(verified.payload_sha256, digestObject(policyDecision()));
  assert.equal(verified.authenticates_payload, true);
  assert.equal(Object.isFrozen(verified), true);
  assert.equal(Object.isFrozen(verified.payload), true);
});

test('payload tampering after signing is rejected before semantic compilation', () => {
  const policyDecisionEvidence = clone(evidenceSet().policyDecisionEvidence);
  policyDecisionEvidence.payload.allowed = false;

  assert.throws(
    () => compileSigned({ policyDecisionEvidence }),
    rejects(/payload digest does not match/)
  );
});

test('forged signature using an unpinned private key is rejected', () => {
  const legitimate = evidenceSet().policyDecisionEvidence;
  const unsigned = {
    schema: legitimate.schema,
    evidence_id: legitimate.evidence_id,
    evidence_type: legitimate.evidence_type,
    issuer_principal_ref: legitimate.issuer_principal_ref,
    issued_at: legitimate.issued_at,
    expires_at: legitimate.expires_at,
    nonce: legitimate.nonce,
    payload_sha256: legitimate.payload_sha256,
    payload: legitimate.payload
  };
  const forged = {
    ...unsigned,
    attestation: {
      ...rogueIdentity.signObject(unsigned),
      key_id: policyIdentity.keyId
    }
  };

  assert.throws(
    () => compileSigned({ policyDecisionEvidence: forged }),
    rejects(/signature is invalid/)
  );
});

test('key identifier must exactly match the local issuer pin', () => {
  const policyDecisionEvidence = clone(evidenceSet().policyDecisionEvidence);
  policyDecisionEvidence.attestation.key_id = rogueIdentity.keyId;

  assert.throws(
    () => compileSigned({ policyDecisionEvidence }),
    rejects(/signing key does not match the local pin/)
  );
});

test('a trusted issuer cannot sign an evidence class outside its local pin', () => {
  const receiptPayload = accessReceipt();
  const wronglyIssuedReceipt = signEvidence({
    identity: policyIdentity,
    issuer: 'policy_authority_1',
    type: 'vault-access-receipt',
    evidenceId: 'evidence_receipt_wrong_issuer',
    nonce: 'nonce_receipt_wrong_issuer',
    payload: receiptPayload
  });

  assert.throws(
    () => compileSigned({ accessReceiptEvidence: [wronglyIssuedReceipt] }),
    rejects(/issuer is not trusted for type vault-access-receipt/)
  );
});

test('evidence type confusion is rejected even when the envelope is validly signed', () => {
  const leaseEnvelope = evidenceSet().leaseEvidence[0];
  assert.throws(
    () => compileSigned({ accessReceiptEvidence: [leaseEnvelope] }),
    rejects(/evidence type mismatch/)
  );
});

test('expired, future, and overlong authority evidence fail closed', () => {
  const expired = signEvidence({
    identity: policyIdentity,
    issuer: 'policy_authority_1',
    type: 'context-disclosure-policy-decision',
    evidenceId: 'evidence_policy_expired',
    nonce: 'nonce_policy_expired',
    payload: policyDecision(),
    issuedAt: '2026-08-22T15:00:00.000Z',
    expiresAt: '2026-08-22T16:59:59.000Z'
  });
  assert.throws(
    () => compileSigned({ policyDecisionEvidence: expired }),
    rejects(/not currently valid/)
  );

  const future = signEvidence({
    identity: policyIdentity,
    issuer: 'policy_authority_1',
    type: 'context-disclosure-policy-decision',
    evidenceId: 'evidence_policy_future',
    nonce: 'nonce_policy_future',
    payload: policyDecision(),
    issuedAt: '2026-08-22T17:01:00.000Z',
    expiresAt: '2026-08-22T17:10:00.000Z'
  });
  assert.throws(
    () => compileSigned({ policyDecisionEvidence: future }),
    rejects(/not currently valid/)
  );

  const overlong = signEvidence({
    identity: policyIdentity,
    issuer: 'policy_authority_1',
    type: 'context-disclosure-policy-decision',
    evidenceId: 'evidence_policy_overlong',
    nonce: 'nonce_policy_overlong',
    payload: policyDecision(),
    issuedAt: '2026-08-22T16:00:00.000Z',
    expiresAt: '2026-08-22T18:00:00.000Z'
  });
  assert.throws(
    () => compileSigned({
      policyDecisionEvidence: overlong,
      maxEvidenceLifetimeSeconds: 1800
    }),
    rejects(/lifetime exceeds the local safety limit/)
  );
});

test('duplicate evidence identifiers and issuer nonces are rejected within one bundle', () => {
  const set = evidenceSet();
  const duplicateIdLease = signEvidence({
    identity: gatekeeperIdentity,
    issuer: 'vault_gatekeeper_1',
    type: 'vault-access-lease',
    evidenceId: 'evidence_policy_1',
    nonce: 'nonce_lease_unique',
    payload: lease()
  });
  assert.throws(
    () => verifyContextAuthorityEvidenceBundle({
      ...set,
      leaseEvidence: [duplicateIdLease],
      trustPins: trustPins(),
      now: NOW
    }),
    rejects(/duplicate evidence_id/)
  );

  const duplicateNonceRevocation = signEvidence({
    identity: gatekeeperIdentity,
    issuer: 'vault_gatekeeper_1',
    type: 'vault-lease-revocation-check',
    evidenceId: 'evidence_revocation_unique',
    nonce: 'nonce_lease_1',
    payload: revocationCheck()
  });
  assert.throws(
    () => verifyContextAuthorityEvidenceBundle({
      ...set,
      revocationCheckEvidence: [duplicateNonceRevocation],
      trustPins: trustPins(),
      now: NOW
    }),
    rejects(/duplicate issuer nonce/)
  );
});

test('raw unsigned authority objects are not accepted in signed evidence slots', () => {
  assert.throws(
    () => compileSigned({ leaseEvidence: [lease()] }),
    rejects(/Context authority evidence contains unknown field/)
  );
});

test('authentic policy denial remains denial', () => {
  const denied = policyDecision();
  denied.allowed = false;
  const policyDecisionEvidence = signEvidence({
    identity: policyIdentity,
    issuer: 'policy_authority_1',
    type: 'context-disclosure-policy-decision',
    evidenceId: 'evidence_policy_denied',
    nonce: 'nonce_policy_denied',
    payload: denied
  });

  assert.throws(
    () => compileSigned({ policyDecisionEvidence }),
    rejects(/denied the request/)
  );
});

test('an authentic lease with the wrong holder remains unauthorized', () => {
  const wrongHolder = lease();
  wrongHolder.holder_principal_ref = 'other_broker';
  const signedWrongHolder = signEvidence({
    identity: gatekeeperIdentity,
    issuer: 'vault_gatekeeper_1',
    type: 'vault-access-lease',
    evidenceId: 'evidence_lease_wrong_holder',
    nonce: 'nonce_lease_wrong_holder',
    payload: wrongHolder
  });

  assert.throws(
    () => compileSigned({ leaseEvidence: [signedWrongHolder] }),
    rejects(/holder is not the compiling broker/)
  );
});

test('verification is non-consuming: a signed lease can support multiple separately authorized reads', () => {
  const input = {
    request: request(),
    ...evidenceSet(),
    trustPins: trustPins(),
    claims: claims(),
    brokerPrincipalRef: 'broker_1',
    capsuleId: 'capsule_reuse_1',
    issuedAt: '2026-08-22T17:00:00.000Z',
    now: NOW
  };

  const first = compileContextCapsuleFromSignedEvidence(input);
  const second = compileContextCapsuleFromSignedEvidence({
    ...input,
    capsuleId: 'capsule_reuse_2'
  });

  assert.equal(first.authority_evidence_verified, true);
  assert.equal(second.authority_evidence_verified, true);
  assert.deepEqual(first.authority_evidence_ids, second.authority_evidence_ids);
});

test('signed-evidence compilation does not mutate envelopes, pins, request, or claims', () => {
  const set = evidenceSet();
  const pins = trustPins();
  const req = request();
  const candidateClaims = claims();
  const before = clone({ set, pins, req, candidateClaims });

  compileSigned({
    request: req,
    ...set,
    trustPins: pins,
    claims: candidateClaims
  });

  assert.deepEqual({ set, pins, req, candidateClaims }, before);
});
