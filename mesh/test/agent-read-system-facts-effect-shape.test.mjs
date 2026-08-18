import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createAgentReadSystemFactsEffectAdmission,
  verifyAgentReadSystemFactsEffectAdmission
} from '../src/lib/agent-read-system-facts-effect-admission.mjs';
import {
  cleanupDurableState,
  createDurableStateFixture,
  durableKeyPair
} from './fixtures/agent-executor-durable-fixture.mjs';

const REVISION = 'f'.repeat(40);
const clone = value => JSON.parse(JSON.stringify(value));

test('effect admission parser rejects hidden top-level and statement fields', () => {
  const fixture = createDurableStateFixture();
  try {
    const issuer = durableKeyPair();
    const admission = createAgentReadSystemFactsEffectAdmission({
      admissionId: 'effect-admission:test:hidden-fields',
      issuerId: 'issuer:test:hidden-fields',
      issuerPrivateKey: issuer.privateKey,
      plan: fixture.plan,
      revision: REVISION,
      notBefore: '2026-08-18T12:05:00.000Z',
      expiresAt: '2026-08-18T12:09:00.000Z'
    });
    const top = clone(admission);
    top.remote_command = 'whoami';
    assert.throws(() => verifyAgentReadSystemFactsEffectAdmission(top, {
      trustedIssuerPublicKey: issuer.publicKey,
      plan: fixture.plan,
      expectedRevision: REVISION,
      now: '2026-08-18T12:06:00.000Z'
    }), /unsupported field: remote_command/i);

    const nested = clone(admission);
    nested.statement.network_override = 'host';
    assert.throws(() => verifyAgentReadSystemFactsEffectAdmission(nested, {
      trustedIssuerPublicKey: issuer.publicKey,
      plan: fixture.plan,
      expectedRevision: REVISION,
      now: '2026-08-18T12:06:00.000Z'
    }), /unsupported field: network_override/i);
  } finally {
    cleanupDurableState(fixture);
  }
});
