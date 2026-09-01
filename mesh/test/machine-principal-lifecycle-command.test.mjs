import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import test from 'node:test';

import {
  createMachinePrincipalLifecycleCommand,
  machinePrincipalLifecycleIssuerKeyId,
  verifyMachinePrincipalLifecycleCommand
} from '../src/lib/machine-principal-lifecycle-command.mjs';

const POLICY_DIGEST = 'a'.repeat(64);
const CHECKPOINT = 'b'.repeat(64);
const SOURCE_HEAD = 'c'.repeat(64);
const AUTHORITY = 'd'.repeat(64);
const SUCCESSOR = 'e'.repeat(64);
const NOW = new Date('2026-09-01T18:31:00.000Z');

function issuer() {
  return generateKeyPairSync('ed25519');
}

function target() {
  return {
    principal_id: 'agent.lifecycle.1',
    principal_type: 'agent',
    predecessor_sequence: 7,
    predecessor_checkpoint_digest: CHECKPOINT,
    predecessor_source_head_digest: SOURCE_HEAD,
    predecessor_authority_digest: AUTHORITY
  };
}

function pin(pair, allowedTransitions = ['narrowed', 'revoked']) {
  return {
    issuer_principal_ref: 'operator.lifecycle.1',
    key_id: machinePrincipalLifecycleIssuerKeyId(pair.publicKey),
    public_key_pem: pair.publicKey.export({ type: 'spki', format: 'pem' }).toString(),
    allowed_transitions: allowedTransitions
  };
}

function command(pair, overrides = {}) {
  return createMachinePrincipalLifecycleCommand({
    issuerPrincipalRef: 'operator.lifecycle.1',
    issuerPrivateKey: pair.privateKey,
    commandId: 'cmd.lifecycle.1',
    issuedAt: '2026-09-01T18:30:00.000Z',
    expiresAt: '2026-09-01T18:35:00.000Z',
    nonce: 'nonce.lifecycle.1',
    transition: 'narrowed',
    reasonCode: 'scope-reduction',
    policyVersion: 'policy-v1',
    policyDigest: POLICY_DIGEST,
    target: target(),
    successorAuthorityDigest: SUCCESSOR,
    ...overrides
  });
}

function verify(commandRaw, pair, extra = {}) {
  return verifyMachinePrincipalLifecycleCommand(commandRaw, {
    trustPins: [pin(pair)],
    expectedPolicyVersion: 'policy-v1',
    expectedPolicyDigest: POLICY_DIGEST,
    expectedPrincipalId: 'agent.lifecycle.1',
    expectedPrincipalType: 'agent',
    expectedPredecessorCheckpointDigest: CHECKPOINT,
    expectedPredecessorSourceHeadDigest: SOURCE_HEAD,
    expectedPredecessorAuthorityDigest: AUTHORITY,
    expectedPredecessorSequence: 7,
    now: NOW,
    ...extra
  });
}

test('locally pinned signed narrowing command verifies without granting execution authority', () => {
  const pair = issuer();
  const result = verify(command(pair), pair);
  assert.equal(result.valid, true);
  assert.equal(result.transition, 'narrowed');
  assert.equal(result.successor_authority_digest, SUCCESSOR);
  assert.equal(result.execution_authority_granted, false);
  assert.equal(result.sandbox_mutation_allowed, false);
  assert.equal(result.verifier_applies_lifecycle_transition, false);
});

test('revocation command cannot invent successor authority digest', () => {
  const pair = issuer();
  const revoked = command(pair, {
    transition: 'revoked',
    successorAuthorityDigest: null,
    commandId: 'cmd.lifecycle.revoke'
  });
  assert.equal(
    verify(revoked, pair, {
      trustPins: [pin(pair, ['revoked'])]
    }).transition,
    'revoked'
  );
  assert.throws(
    () => command(pair, {
      transition: 'revoked',
      successorAuthorityDigest: SUCCESSOR
    }),
    /cannot declare successor/
  );
});

test('wrong issuer key, unauthorized transition, policy drift and predecessor substitution fail closed', () => {
  const pair = issuer();
  const other = issuer();
  const signed = command(pair);

  assert.throws(
    () => verify(signed, pair, { trustPins: [pin(other)] }),
    /key|signature|trusted/
  );
  assert.throws(
    () => verify(signed, pair, { trustPins: [pin(pair, ['revoked'])] }),
    /not trusted for requested transition/
  );
  assert.throws(
    () => verify(signed, pair, { expectedPolicyDigest: 'f'.repeat(64) }),
    /policy digest mismatch/
  );
  assert.throws(
    () => verify(signed, pair, { expectedPredecessorAuthorityDigest: 'f'.repeat(64) }),
    /predecessor authority mismatch/
  );
  assert.throws(
    () => verify(signed, pair, { expectedPredecessorSequence: 8 }),
    /predecessor sequence mismatch/
  );
});

test('expired, future, overlong and tampered lifecycle commands fail closed', () => {
  const pair = issuer();
  const signed = command(pair);
  assert.throws(
    () => verify(signed, pair, { now: new Date('2026-09-01T18:36:00.000Z') }),
    /not currently valid/
  );

  const future = command(pair, {
    commandId: 'cmd.future',
    issuedAt: '2026-09-01T18:32:00.000Z',
    expiresAt: '2026-09-01T18:34:00.000Z'
  });
  assert.throws(() => verify(future, pair), /not currently valid/);

  const long = command(pair, {
    commandId: 'cmd.long',
    expiresAt: '2026-09-01T19:00:00.000Z'
  });
  assert.throws(() => verify(long, pair), /lifetime is invalid/);

  assert.throws(() => verify({
    ...signed,
    statement: {
      ...signed.statement,
      transition: 'revoked'
    }
  }, pair), /digest mismatch|signature/);
});


test('lifecycle command rejects unknown envelope, statement, target, and trust-pin fields', () => {
  const pair = issuer();
  const signed = command(pair);

  assert.throws(
    () => verify({ ...signed, surprise: true }, pair),
    /unsupported field/
  );
  assert.throws(
    () => verify({
      ...signed,
      statement: { ...signed.statement, surprise: true }
    }, pair),
    /unsupported field/
  );
  assert.throws(
    () => verify({
      ...signed,
      statement: {
        ...signed.statement,
        target: { ...signed.statement.target, surprise: true }
      }
    }, pair),
    /unsupported field/
  );
  assert.throws(
    () => verify(signed, pair, {
      trustPins: [{ ...pin(pair), surprise: true }]
    }),
    /unsupported field/
  );
});
