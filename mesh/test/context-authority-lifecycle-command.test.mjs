import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import test from 'node:test';

import { MeshIdentity } from '../src/lib/identity.mjs';
import {
  CONTEXT_AUTHORITY_LIFECYCLE_COMMAND_V1_SCHEMA,
  verifyContextAuthorityLifecycleCommand
} from '../src/lib/context-authority-lifecycle-command.mjs';

const NOW = Date.parse('2026-08-23T12:00:00.000Z');
const SHA_A = 'a'.repeat(64);
const SHA_B = 'b'.repeat(64);

function makeIdentity(service) {
  const pair = generateKeyPairSync('ed25519');
  return new MeshIdentity(
    service,
    pair.privateKey.export({ type: 'pkcs8', format: 'pem' }),
    pair.publicKey.export({ type: 'spki', format: 'pem' })
  );
}

const ownerLifecycleIdentity = makeIdentity('owner-lifecycle');
const revokeOnlyIdentity = makeIdentity('revoke-only');
const rogueIdentity = makeIdentity('rogue-lifecycle');

function publicPem(identity) {
  return String(identity.publicKey.export({ type: 'spki', format: 'pem' }));
}

function trustPins() {
  return [
    {
      issuer_principal_ref: 'owner_lifecycle_1',
      key_id: ownerLifecycleIdentity.keyId,
      public_key_pem: publicPem(ownerLifecycleIdentity),
      allowed_transitions: ['revoked', 'superseded']
    },
    {
      issuer_principal_ref: 'revoke_authority_1',
      key_id: revokeOnlyIdentity.keyId,
      public_key_pem: publicPem(revokeOnlyIdentity),
      allowed_transitions: ['revoked']
    }
  ];
}

function target({
  evidenceId = 'evidence_policy_1',
  evidenceType = 'context-disclosure-policy-decision',
  evidenceIssuer = 'policy_authority_1',
  envelopeSha256 = SHA_A
} = {}) {
  return {
    evidence_id: evidenceId,
    evidence_type: evidenceType,
    issuer_principal_ref: evidenceIssuer,
    envelope_sha256: envelopeSha256
  };
}

function unsignedCommand({
  identity = ownerLifecycleIdentity,
  issuer = 'owner_lifecycle_1',
  commandId = 'lifecycle_command_1',
  nonce = 'lifecycle_nonce_1',
  transition = 'revoked',
  targetBinding = target(),
  replacement = null,
  reasonCode = 'owner_revoked',
  issuedAt = '2026-08-23T11:55:00.000Z',
  expiresAt = '2026-08-23T12:05:00.000Z',
  authorityEffect = 'deny-future-context-use-only',
  grantsVaultAccess = false,
  grantsExecutionAuthority = false
} = {}) {
  return {
    identity,
    body: {
      schema: CONTEXT_AUTHORITY_LIFECYCLE_COMMAND_V1_SCHEMA,
      command_id: commandId,
      issuer_principal_ref: issuer,
      issued_at: issuedAt,
      expires_at: expiresAt,
      nonce,
      transition,
      target: structuredClone(targetBinding),
      replacement: replacement === null ? null : structuredClone(replacement),
      reason_code: reasonCode,
      authority_effect: authorityEffect,
      grants_vault_access: grantsVaultAccess,
      grants_execution_authority: grantsExecutionAuthority
    }
  };
}

function signCommand(options = {}) {
  const { identity, body } = unsignedCommand(options);
  return {
    ...body,
    attestation: identity.signObject(body)
  };
}

function supersessionCommand(options = {}) {
  return signCommand({
    transition: 'superseded',
    reasonCode: 'policy_reissued',
    replacement: target({
      evidenceId: 'evidence_policy_2',
      envelopeSha256: SHA_B
    }),
    ...options
  });
}

function verify(command, options = {}) {
  return verifyContextAuthorityLifecycleCommand(command, {
    trustPins: trustPins(),
    now: NOW,
    ...options
  });
}

function validationError(pattern) {
  return error => {
    assert.equal(error?.name, 'ValidationError');
    assert.match(error.message, pattern);
    return true;
  };
}

test('pinned signed revocation command verifies without applying lifecycle authority', () => {
  const command = signCommand();
  const verified = verify(command);

  assert.equal(verified.valid, true);
  assert.equal(verified.command_id, 'lifecycle_command_1');
  assert.equal(verified.transition, 'revoked');
  assert.equal(verified.target.evidence_id, 'evidence_policy_1');
  assert.equal(verified.target.envelope_sha256, SHA_A);
  assert.equal(verified.replacement, null);
  assert.equal(verified.signature_verified, true);
  assert.equal(verified.key_pin_verified, true);
  assert.equal(verified.target_binding_verified, true);
  assert.equal(verified.transition_scope_verified, true);
  assert.match(verified.command_sha256, /^[a-f0-9]{64}$/);
  assert.equal(verified.verifier_consumes_command, false);
  assert.equal(verified.verifier_applies_lifecycle_transition, false);
  assert.equal(verified.verifier_reads_vaults, false);
  assert.equal(verified.verifier_delivers_capsules, false);
  assert.equal(verified.grants_vault_access, false);
  assert.equal(verified.grants_execution_authority, false);
  assert.equal(Object.isFrozen(verified), true);
  assert.equal(Object.isFrozen(verified.target), true);

  const serialized = JSON.stringify(verified);
  assert.doesNotMatch(serialized, /BEGIN PUBLIC KEY/);
  assert.doesNotMatch(serialized, /"signature":/);
  assert.doesNotMatch(serialized, /"attestation":/);
  assert.doesNotMatch(serialized, /"public_key_pem":/);
});

test('signed supersession command binds a distinct same-class same-issuer replacement', () => {
  const verified = verify(supersessionCommand());
  assert.equal(verified.transition, 'superseded');
  assert.equal(verified.target.evidence_id, 'evidence_policy_1');
  assert.equal(verified.replacement.evidence_id, 'evidence_policy_2');
  assert.equal(
    verified.replacement.evidence_type,
    verified.target.evidence_type
  );
  assert.equal(
    verified.replacement.issuer_principal_ref,
    verified.target.issuer_principal_ref
  );
});

test('a valid signer is limited to the transitions in its local pin', () => {
  const revoked = signCommand({
    identity: revokeOnlyIdentity,
    issuer: 'revoke_authority_1',
    commandId: 'revoke_only_command_1',
    nonce: 'revoke_only_nonce_1'
  });
  assert.equal(verify(revoked).transition, 'revoked');

  const superseded = supersessionCommand({
    identity: revokeOnlyIdentity,
    issuer: 'revoke_authority_1',
    commandId: 'revoke_only_command_2',
    nonce: 'revoke_only_nonce_2'
  });
  assert.throws(
    () => verify(superseded),
    validationError(/not trusted for transition superseded/)
  );
});

test('forged key and signing-key substitution fail closed', () => {
  const legitimate = signCommand();
  const body = structuredClone(legitimate);
  delete body.attestation;
  const forged = {
    ...body,
    attestation: {
      ...rogueIdentity.signObject(body),
      key_id: ownerLifecycleIdentity.keyId
    }
  };
  assert.throws(
    () => verify(forged),
    validationError(/signature is invalid/)
  );

  const wrongKeyId = structuredClone(legitimate);
  wrongKeyId.attestation.key_id = rogueIdentity.keyId;
  assert.throws(
    () => verify(wrongKeyId),
    validationError(/signing key does not match the local pin/)
  );
});

test('target digest tampering after signature is rejected', () => {
  const command = signCommand();
  command.target.envelope_sha256 = SHA_B;
  assert.throws(
    () => verify(command),
    validationError(/signature is invalid/)
  );
});

test('revocation cannot smuggle a replacement and supersession cannot change evidence class or issuer', () => {
  assert.throws(
    () => verify(signCommand({
      replacement: target({
        evidenceId: 'evidence_policy_2',
        envelopeSha256: SHA_B
      })
    })),
    validationError(/Revocation command cannot include replacement evidence/)
  );

  assert.throws(
    () => verify(supersessionCommand({
      replacement: target({
        evidenceId: 'evidence_lease_2',
        evidenceType: 'vault-access-lease',
        evidenceIssuer: 'vault_gatekeeper_1',
        envelopeSha256: SHA_B
      })
    })),
    validationError(/same evidence type and evidence issuer/)
  );

  assert.throws(
    () => verify(supersessionCommand({
      replacement: target({
        evidenceId: 'evidence_policy_1',
        envelopeSha256: SHA_A
      })
    })),
    validationError(/replacement must differ from target/)
  );
});

test('expired future and overlong lifecycle commands fail closed', () => {
  assert.throws(
    () => verify(signCommand({
      commandId: 'expired_command',
      nonce: 'expired_nonce',
      issuedAt: '2026-08-23T11:40:00.000Z',
      expiresAt: '2026-08-23T11:59:59.000Z'
    })),
    validationError(/not currently valid/)
  );

  assert.throws(
    () => verify(signCommand({
      commandId: 'future_command',
      nonce: 'future_nonce',
      issuedAt: '2026-08-23T12:01:00.000Z',
      expiresAt: '2026-08-23T12:05:00.000Z'
    })),
    validationError(/not currently valid/)
  );

  assert.throws(
    () => verify(signCommand({
      commandId: 'overlong_command',
      nonce: 'overlong_nonce',
      issuedAt: '2026-08-23T11:30:00.000Z',
      expiresAt: '2026-08-23T12:30:00.000Z'
    }), { maxCommandLifetimeSeconds: 900 }),
    validationError(/lifetime exceeds the local safety limit/)
  );
});

test('authority smuggling and unknown fields are rejected before signature meaning can widen', () => {
  assert.throws(
    () => verify(signCommand({ grantsVaultAccess: true })),
    validationError(/cannot grant authority/)
  );
  assert.throws(
    () => verify(signCommand({ grantsExecutionAuthority: true })),
    validationError(/cannot grant authority/)
  );
  assert.throws(
    () => verify(signCommand({ authorityEffect: 'execute-revocation' })),
    validationError(/cannot grant authority/)
  );

  const command = signCommand();
  command.hidden_authority = true;
  assert.throws(
    () => verify(command),
    validationError(/unknown field hidden_authority/)
  );
});

test('untrusted issuer duplicate pins and transition-list ambiguity fail closed', () => {
  const untrusted = signCommand({
    identity: rogueIdentity,
    issuer: 'rogue_lifecycle_1',
    commandId: 'rogue_command_1',
    nonce: 'rogue_nonce_1'
  });
  assert.throws(
    () => verify(untrusted),
    validationError(/issuer is not locally trusted/)
  );

  assert.throws(
    () => verifyContextAuthorityLifecycleCommand(signCommand(), {
      trustPins: [...trustPins(), trustPins()[0]],
      now: NOW
    }),
    validationError(/duplicate issuer/)
  );

  const ambiguousPin = trustPins()[0];
  ambiguousPin.allowed_transitions = ['revoked', 'revoked'];
  assert.throws(
    () => verifyContextAuthorityLifecycleCommand(signCommand(), {
      trustPins: [ambiguousPin],
      now: NOW
    }),
    validationError(/duplicate transition/)
  );
});

test('verification is deterministic and non-consuming for the same current command', () => {
  const command = signCommand();
  const first = verify(command);
  const second = verify(command);
  assert.deepEqual(second, first);
  assert.equal(first.command_sha256, second.command_sha256);
  assert.equal(first.verifier_consumes_command, false);
});
