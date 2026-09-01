import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import test from 'node:test';

import { normalizeMachinePrincipalDefinition } from '../src/lib/machine-principal.mjs';
import { createMachineIdentityCredential } from '../src/lib/agent-trust-machine-identity.mjs';
import {
  createAgentCurrentnessCheckpoint,
  evaluateAgentCurrentnessAtEffect
} from '../src/lib/agent-trust-currentness-checkpoint.mjs';

const HUMANS = new Set(['owner.currentness-test']);
const ISSUED_AT = '2026-08-31T20:00:00.000Z';
const EVALUATED_AT = '2026-08-31T20:00:10.000Z';
const EFFECT_AT = '2026-08-31T20:00:20.000Z';

function machinePrincipal(overrides = {}) {
  return normalizeMachinePrincipalDefinition({
    id: 'agent.currentness-admission.1',
    type: 'agent',
    sponsor: 'owner.currentness-test',
    roles: ['researcher'],
    scopes: ['intent:execute'],
    lifetime: 'session',
    expires_at: '2026-09-30T00:00:00.000Z',
    runtime: {
      id: 'runtime.currentness-admission.1',
      kind: 'local-process',
      software_digest: 'a'.repeat(64)
    },
    constraints: {
      actions: ['system.echo'],
      purposes: ['test.conformance'],
      destinations: ['local'],
      budgets: {
        max_requests_per_minute: 10,
        max_concurrent_requests: 1,
        max_execution_ms: 5_000,
        max_request_bytes: 65_536,
        max_response_bytes: 262_144
      },
      delegation: { allowed: false, max_depth: 0 }
    },
    ...overrides
  }, {
    knownHumanPrincipals: HUMANS,
    now: new Date('2026-08-31T19:00:00.000Z')
  });
}

function activeCurrentnessFixture(principal = machinePrincipal()) {
  const issuer = generateKeyPairSync('ed25519');
  const observer = generateKeyPairSync('ed25519');
  const operational = generateKeyPairSync('ed25519');
  const credential = createMachineIdentityCredential({
    principal,
    issuerId: 'identity.currentness-admission.1',
    issuerPrivateKey: issuer.privateKey,
    operationalPublicKey: operational.publicKey,
    keyEpoch: 1,
    issuedAt: ISSUED_AT,
    validFrom: ISSUED_AT,
    expiresAt: '2026-09-30T00:00:00.000Z',
    knownHumanPrincipals: HUMANS
  });
  const checkpoint = createAgentCurrentnessCheckpoint({
    checkpointId: 'currentness.admission.1',
    checkpointSequence: 1,
    credentialHistory: [credential],
    revocations: [],
    trustedIssuerPublicKey: issuer.publicKey,
    observerId: 'observer.currentness-admission.1',
    observerPrivateKey: observer.privateKey,
    evaluatedAt: EVALUATED_AT
  });
  return { principal, issuer, observer, credential, checkpoint };
}

test('effect-time currentness exposes the exact active principal authority digest it verified', () => {
  const f = activeCurrentnessFixture();
  const currentness = evaluateAgentCurrentnessAtEffect({
    checkpoint: f.checkpoint,
    trustedObserverPublicKey: f.observer.publicKey,
    credentialHistory: [f.credential],
    revocations: [],
    trustedIssuerPublicKey: f.issuer.publicKey,
    expectedLatestCheckpointDigest: f.checkpoint.checkpoint_digest,
    effectAt: EFFECT_AT,
    maxEvidenceAgeMs: 30_000
  });

  assert.equal(currentness.known_active_under_retained_evidence, true);
  assert.equal(
    currentness.active_principal_authority_digest,
    f.principal.authority_digest
  );
  assert.equal(
    currentness.active_principal_authority_digest,
    f.credential.statement.principal_authority_digest
  );
});
