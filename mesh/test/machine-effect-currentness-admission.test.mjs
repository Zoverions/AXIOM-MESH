import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import test from 'node:test';

import { normalizeMachinePrincipalDefinition } from '../src/lib/machine-principal.mjs';
import { createMachineIdentityCredential } from '../src/lib/agent-trust-machine-identity.mjs';
import {
  createAgentCurrentnessCheckpoint,
  evaluateAgentCurrentnessAtEffect
} from '../src/lib/agent-trust-currentness-checkpoint.mjs';
import { evaluateMachineEffectAuthorityCurrentness } from '../src/lib/machine-effect-currentness-admission.mjs';

const HUMANS = new Set(['owner.currentness-test', 'owner.currentness-other']);
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

function verifiedCapabilityClaims(principal) {
  return {
    subject: principal.id,
    principal_type: principal.type,
    sponsor: principal.sponsor,
    authority_digest: principal.authority_digest,
    runtime_id: principal.runtime.id
  };
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

test('late authority-currentness gate passes only when current authority exactly matches issued capability authority', () => {
  const principal = machinePrincipal();
  const decision = evaluateMachineEffectAuthorityCurrentness({
    verifiedCapabilityClaims: verifiedCapabilityClaims(principal),
    currentPrincipal: principal,
    effectAt: EFFECT_AT
  });

  assert.equal(decision.allow, true);
  assert.equal(decision.code, 'machine_effect_authority_current');
  assert.equal(decision.principal_id, principal.id);
  assert.equal(decision.capability_authority_digest, principal.authority_digest);
  assert.equal(decision.current_authority_digest, principal.authority_digest);
  assert.equal(decision.effect_at, EFFECT_AT);
  assert.equal(decision.effect_admission_authorized, false);
  assert.equal(decision.authority_effect, 'none');
});

test('late authority-currentness gate denies an issued capability after the principal authority changes', () => {
  const issuedPrincipal = machinePrincipal();
  const narrowedPrincipal = machinePrincipal({
    scopes: ['intent:execute:limited']
  });
  assert.notEqual(issuedPrincipal.authority_digest, narrowedPrincipal.authority_digest);

  const decision = evaluateMachineEffectAuthorityCurrentness({
    verifiedCapabilityClaims: verifiedCapabilityClaims(issuedPrincipal),
    currentPrincipal: narrowedPrincipal,
    effectAt: EFFECT_AT
  });

  assert.equal(decision.allow, false);
  assert.equal(decision.code, 'machine_authority_stale');
  assert.equal(decision.principal_id, issuedPrincipal.id);
  assert.equal(decision.capability_authority_digest, issuedPrincipal.authority_digest);
  assert.equal(decision.current_authority_digest, narrowedPrincipal.authority_digest);
  assert.equal(decision.effect_admission_authorized, false);
  assert.equal(decision.authority_effect, 'none');
});

test('late authority-currentness gate fails closed when no current principal authority is available', () => {
  const issuedPrincipal = machinePrincipal();
  const decision = evaluateMachineEffectAuthorityCurrentness({
    verifiedCapabilityClaims: verifiedCapabilityClaims(issuedPrincipal),
    currentPrincipal: null,
    effectAt: EFFECT_AT
  });

  assert.equal(decision.allow, false);
  assert.equal(decision.code, 'machine_principal_currentness_missing');
  assert.equal(decision.principal_id, issuedPrincipal.id);
  assert.equal(decision.current_authority_digest, null);
  assert.equal(decision.effect_admission_authorized, false);
  assert.equal(decision.authority_effect, 'none');
});
