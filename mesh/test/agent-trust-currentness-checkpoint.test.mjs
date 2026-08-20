import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import test from 'node:test';

import { normalizeMachinePrincipalDefinition } from '../src/lib/machine-principal.mjs';
import {
  createMachineIdentityCredential,
  createMachineIdentityRevocation
} from '../src/lib/agent-trust-machine-identity.mjs';
import {
  AGENT_CURRENTNESS_CHECKPOINT_KIND,
  MAX_EFFECT_CURRENTNESS_AGE_MS,
  createAgentCurrentnessCheckpoint,
  evaluateAgentCurrentnessAtEffect,
  evaluateAgentCurrentnessSetAtEffect,
  verifyAgentCurrentnessCheckpoint,
  verifyAgentCurrentnessCheckpointChain
} from '../src/lib/agent-trust-currentness-checkpoint.mjs';

const humans = new Set(['owner.alice']);

function principal(id = 'agent.currentness.1') {
  return normalizeMachinePrincipalDefinition({
    id,
    type: 'agent',
    sponsor: 'owner.alice',
    roles: ['researcher'],
    scopes: ['intent:execute'],
    lifetime: 'session',
    expires_at: '2026-09-01T00:00:00.000Z',
    runtime: {
      id: `runtime.${id}`,
      kind: 'local-process',
      software_digest: 'a'.repeat(64)
    },
    constraints: {
      actions: ['system.echo'],
      purposes: ['test.conformance'],
      destinations: ['local'],
      budgets: {
        max_requests_per_minute: 10,
        max_concurrent_requests: 2,
        max_execution_ms: 5_000,
        max_request_bytes: 65_536,
        max_response_bytes: 262_144
      },
      delegation: { allowed: false, max_depth: 0 }
    }
  }, {
    knownHumanPrincipals: humans,
    now: new Date('2026-08-17T19:00:00.000Z')
  });
}

function identityFixture(id = 'agent.currentness.1') {
  const issuer = generateKeyPairSync('ed25519');
  const observer = generateKeyPairSync('ed25519');
  const operational1 = generateKeyPairSync('ed25519');
  const operational2 = generateKeyPairSync('ed25519');
  const machine = principal(id);
  const credential1 = createMachineIdentityCredential({
    principal: machine,
    issuerId: `identity.${id}`,
    issuerPrivateKey: issuer.privateKey,
    operationalPublicKey: operational1.publicKey,
    keyEpoch: 1,
    issuedAt: '2026-08-17T20:00:00.000Z',
    validFrom: '2026-08-17T20:00:00.000Z',
    expiresAt: '2026-08-25T20:00:00.000Z',
    knownHumanPrincipals: humans
  });
  const credential2 = createMachineIdentityCredential({
    principal: machine,
    issuerId: `identity.${id}`,
    issuerPrivateKey: issuer.privateKey,
    operationalPublicKey: operational2.publicKey,
    keyEpoch: 2,
    issuedAt: '2026-08-17T20:04:00.000Z',
    validFrom: '2026-08-17T20:05:00.000Z',
    expiresAt: '2026-08-25T20:00:00.000Z',
    transitionKind: 'rotation',
    predecessorDisposition: 'retired',
    credentialHistory: [credential1],
    knownHumanPrincipals: humans
  });
  return { issuer, observer, operational1, operational2, machine, credential1, credential2 };
}

function checkpoint1(f) {
  return createAgentCurrentnessCheckpoint({
    checkpointId: 'currentness.cp.1',
    checkpointSequence: 1,
    credentialHistory: [f.credential1],
    revocations: [],
    trustedIssuerPublicKey: f.issuer.publicKey,
    observerId: 'observer.local.1',
    observerPrivateKey: f.observer.privateKey,
    evaluatedAt: '2026-08-17T20:01:00.000Z'
  });
}

function checkpoint2(f, previous = checkpoint1(f)) {
  return createAgentCurrentnessCheckpoint({
    checkpointId: 'currentness.cp.2',
    checkpointSequence: 2,
    previousCheckpoint: previous,
    credentialHistory: [f.credential1, f.credential2],
    revocations: [],
    trustedIssuerPublicKey: f.issuer.publicKey,
    observerId: 'observer.local.1',
    observerPrivateKey: f.observer.privateKey,
    evaluatedAt: '2026-08-17T20:06:00.000Z'
  });
}

function revocation2(f, {
  effectiveAt = '2026-08-17T20:07:00.000Z',
  reasonCode = 'compromised'
} = {}) {
  return createMachineIdentityRevocation({
    credential: f.credential2,
    issuerPrivateKey: f.issuer.privateKey,
    effectiveAt,
    reasonCode
  });
}

function checkpoint3(f, previous = checkpoint2(f), revocation = revocation2(f)) {
  return createAgentCurrentnessCheckpoint({
    checkpointId: 'currentness.cp.3',
    checkpointSequence: 3,
    previousCheckpoint: previous,
    credentialHistory: [f.credential1, f.credential2],
    revocations: [revocation],
    trustedIssuerPublicKey: f.issuer.publicKey,
    observerId: 'observer.local.1',
    observerPrivateKey: f.observer.privateKey,
    evaluatedAt: '2026-08-17T20:08:00.000Z'
  });
}

test('A6a signs retained issuer-evidence currentness without claiming global currentness or authority', () => {
  const f = identityFixture();
  const cp = checkpoint1(f);
  const verified = verifyAgentCurrentnessCheckpoint(cp, {
    trustedObserverPublicKey: f.observer.publicKey,
    credentialHistory: [f.credential1],
    revocations: [],
    trustedIssuerPublicKey: f.issuer.publicKey,
    expectedLatestCheckpointDigest: cp.checkpoint_digest
  });

  assert.equal(verified.statement.checkpoint_kind, AGENT_CURRENTNESS_CHECKPOINT_KIND);
  assert.equal(verified.statement.currentness_status, 'active');
  assert.equal(verified.statement.current_credential_digest, f.credential1.credential_digest);
  assert.equal(verified.statement.current_key_epoch, 1);
  assert.equal(verified.statement.global_currentness_claimed, false);
  assert.equal(verified.statement.effect_admission_authorized, false);
  assert.equal(verified.statement.ancestor_relationship_verified, false);
  assert.equal(verified.statement.authority_effect, 'none');
});

test('routine rotation advances retained history while historical checkpoint remains independently verifiable', () => {
  const f = identityFixture();
  const cp1 = checkpoint1(f);
  const cp2 = checkpoint2(f, cp1);

  assert.equal(cp2.statement.currentness_status, 'active');
  assert.equal(cp2.statement.current_credential_digest, f.credential2.credential_digest);
  assert.equal(cp2.statement.current_key_epoch, 2);
  assert.deepEqual(cp2.statement.credential_digests, [
    f.credential1.credential_digest,
    f.credential2.credential_digest
  ]);
  assert.equal(cp2.statement.predecessor_checkpoint_digest, cp1.checkpoint_digest);

  assert.equal(verifyAgentCurrentnessCheckpoint(cp1, {
    trustedObserverPublicKey: f.observer.publicKey,
    credentialHistory: [f.credential1],
    revocations: [],
    trustedIssuerPublicKey: f.issuer.publicKey
  }).checkpoint_digest, cp1.checkpoint_digest);

  assert.throws(() => verifyAgentCurrentnessCheckpoint(cp1, {
    trustedObserverPublicKey: f.observer.publicKey,
    credentialHistory: [f.credential1],
    revocations: [],
    trustedIssuerPublicKey: f.issuer.publicKey,
    expectedLatestCheckpointDigest: cp2.checkpoint_digest
  }), /not the expected retained latest head/);
});

test('retained checkpoint chain rejects credential-history truncation and revocation rollback', () => {
  const f = identityFixture();
  const cp1 = checkpoint1(f);
  const cp2 = checkpoint2(f, cp1);
  const revocation = revocation2(f);
  const cp3 = checkpoint3(f, cp2, revocation);

  const evidence = new Map([
    [cp1.checkpoint_digest, {
      credentialHistory: [f.credential1],
      revocations: [],
      trustedIssuerPublicKey: f.issuer.publicKey
    }],
    [cp2.checkpoint_digest, {
      credentialHistory: [f.credential1, f.credential2],
      revocations: [],
      trustedIssuerPublicKey: f.issuer.publicKey
    }],
    [cp3.checkpoint_digest, {
      credentialHistory: [f.credential1, f.credential2],
      revocations: [revocation],
      trustedIssuerPublicKey: f.issuer.publicKey
    }]
  ]);
  const chain = verifyAgentCurrentnessCheckpointChain([cp1, cp2, cp3], {
    trustedObserverPublicKey: f.observer.publicKey,
    evidenceByCheckpointDigest: evidence
  });
  assert.equal(chain.length, 3);
  assert.equal(chain.at(-1).statement.currentness_status, 'revoked');

  assert.throws(() => verifyAgentCurrentnessCheckpoint(cp2, {
    trustedObserverPublicKey: f.observer.publicKey,
    credentialHistory: [f.credential1],
    revocations: [],
    trustedIssuerPublicKey: f.issuer.publicKey
  }), /credential history does not match supplied evidence/);

  assert.throws(() => verifyAgentCurrentnessCheckpoint(cp3, {
    trustedObserverPublicKey: f.observer.publicKey,
    credentialHistory: [f.credential1, f.credential2],
    revocations: [],
    trustedIssuerPublicKey: f.issuer.publicKey
  }), /revocation set does not match supplied evidence/);
});

test('revoked or compromised credential cannot pass a new-effect currentness check', () => {
  const f = identityFixture();
  const cp1 = checkpoint1(f);
  const cp2 = checkpoint2(f, cp1);
  const revocation = revocation2(f);
  const cp3 = checkpoint3(f, cp2, revocation);

  assert.equal(cp3.statement.currentness_status, 'revoked');
  assert.equal(cp3.statement.current_reason_code, 'compromised');
  assert.throws(() => evaluateAgentCurrentnessAtEffect({
    checkpoint: cp3,
    trustedObserverPublicKey: f.observer.publicKey,
    credentialHistory: [f.credential1, f.credential2],
    revocations: [revocation],
    trustedIssuerPublicKey: f.issuer.publicKey,
    expectedLatestCheckpointDigest: cp3.checkpoint_digest,
    effectAt: '2026-08-17T20:08:10.000Z',
    maxEvidenceAgeMs: 30_000
  }), /revoked; new effect denied/);
});

test('fresh active retained evidence can pass a non-authorizing effect-boundary currentness check', () => {
  const f = identityFixture();
  const cp1 = checkpoint1(f);
  const cp2 = checkpoint2(f, cp1);
  const check = evaluateAgentCurrentnessAtEffect({
    checkpoint: cp2,
    trustedObserverPublicKey: f.observer.publicKey,
    credentialHistory: [f.credential1, f.credential2],
    revocations: [],
    trustedIssuerPublicKey: f.issuer.publicKey,
    expectedLatestCheckpointDigest: cp2.checkpoint_digest,
    effectAt: '2026-08-17T20:06:20.000Z',
    maxEvidenceAgeMs: 30_000
  });
  assert.equal(check.known_active_under_retained_evidence, true);
  assert.equal(check.active_credential_digest, f.credential2.credential_digest);
  assert.equal(check.global_currentness_claimed, false);
  assert.equal(check.effect_admission_authorized, false);
  assert.equal(check.consume_before_effect_observed, false);
});

test('stale known-active evidence cannot be stretched into a late effect admission claim', () => {
  const f = identityFixture();
  const cp = checkpoint2(f);
  assert.throws(() => evaluateAgentCurrentnessAtEffect({
    checkpoint: cp,
    trustedObserverPublicKey: f.observer.publicKey,
    credentialHistory: [f.credential1, f.credential2],
    revocations: [],
    trustedIssuerPublicKey: f.issuer.publicKey,
    expectedLatestCheckpointDigest: cp.checkpoint_digest,
    effectAt: '2026-08-17T20:07:01.000Z',
    maxEvidenceAgeMs: MAX_EFFECT_CURRENTNESS_AGE_MS
  }), /too stale/);
  assert.throws(() => evaluateAgentCurrentnessAtEffect({
    checkpoint: cp,
    trustedObserverPublicKey: f.observer.publicKey,
    credentialHistory: [f.credential1, f.credential2],
    revocations: [],
    trustedIssuerPublicKey: f.issuer.publicKey,
    expectedLatestCheckpointDigest: cp.checkpoint_digest,
    effectAt: '2026-08-17T20:06:01.000Z',
    maxEvidenceAgeMs: MAX_EFFECT_CURRENTNESS_AGE_MS + 1
  }), /maxEvidenceAgeMs must be/);
});

test('observer signer substitution and checkpoint tamper fail closed', () => {
  const f = identityFixture();
  const cp = checkpoint1(f);
  const otherObserver = generateKeyPairSync('ed25519');
  assert.throws(() => verifyAgentCurrentnessCheckpoint(cp, {
    trustedObserverPublicKey: otherObserver.publicKey,
    credentialHistory: [f.credential1],
    revocations: [],
    trustedIssuerPublicKey: f.issuer.publicKey
  }), /observer key substitution/);

  const tampered = structuredClone(cp);
  tampered.statement.global_currentness_claimed = true;
  assert.throws(() => verifyAgentCurrentnessCheckpoint(tampered, {
    trustedObserverPublicKey: f.observer.publicKey,
    credentialHistory: [f.credential1],
    revocations: [],
    trustedIssuerPublicKey: f.issuer.publicKey
  }), /global_currentness_claimed must remain false/);
});

test('v1 rejects ambiguous duplicate revocations for one credential', () => {
  const f = identityFixture();
  const one = revocation2(f, {
    effectiveAt: '2026-08-17T20:07:00.000Z',
    reasonCode: 'compromised'
  });
  const two = revocation2(f, {
    effectiveAt: '2026-08-17T20:07:30.000Z',
    reasonCode: 'operator-request'
  });
  assert.throws(() => createAgentCurrentnessCheckpoint({
    checkpointId: 'currentness.duplicate-revocation',
    checkpointSequence: 1,
    credentialHistory: [f.credential1, f.credential2],
    revocations: [one, two],
    trustedIssuerPublicKey: f.issuer.publicKey,
    observerId: 'observer.local.1',
    observerPrivateKey: f.observer.privateKey,
    evaluatedAt: '2026-08-17T20:08:00.000Z'
  }), /at most one revocation record per credential/);
});

test('multi-principal currentness set is deny-dominant but does not claim an ancestor relationship', () => {
  const a = identityFixture('agent.currentness.a');
  const b = identityFixture('agent.currentness.b');
  const aCp = createAgentCurrentnessCheckpoint({
    checkpointId: 'currentness.a.1',
    checkpointSequence: 1,
    credentialHistory: [a.credential1],
    revocations: [],
    trustedIssuerPublicKey: a.issuer.publicKey,
    observerId: 'observer.a',
    observerPrivateKey: a.observer.privateKey,
    evaluatedAt: '2026-08-17T20:01:00.000Z'
  });
  const bCp = createAgentCurrentnessCheckpoint({
    checkpointId: 'currentness.b.1',
    checkpointSequence: 1,
    credentialHistory: [b.credential1],
    revocations: [],
    trustedIssuerPublicKey: b.issuer.publicKey,
    observerId: 'observer.b',
    observerPrivateKey: b.observer.privateKey,
    evaluatedAt: '2026-08-17T20:01:00.000Z'
  });
  const set = evaluateAgentCurrentnessSetAtEffect([
    {
      checkpoint: aCp,
      trustedObserverPublicKey: a.observer.publicKey,
      credentialHistory: [a.credential1],
      revocations: [],
      trustedIssuerPublicKey: a.issuer.publicKey,
      expectedLatestCheckpointDigest: aCp.checkpoint_digest
    },
    {
      checkpoint: bCp,
      trustedObserverPublicKey: b.observer.publicKey,
      credentialHistory: [b.credential1],
      revocations: [],
      trustedIssuerPublicKey: b.issuer.publicKey,
      expectedLatestCheckpointDigest: bCp.checkpoint_digest
    }
  ], {
    effectAt: '2026-08-17T20:01:10.000Z',
    maxEvidenceAgeMs: 30_000
  });
  assert.equal(set.all_known_active_under_retained_evidence, true);
  assert.equal(set.relationship_between_principals_claimed, false);
  assert.equal(set.effect_admission_authorized, false);
  assert.equal(set.global_currentness_claimed, false);

  const revocation = createMachineIdentityRevocation({
    credential: b.credential1,
    issuerPrivateKey: b.issuer.privateKey,
    effectiveAt: '2026-08-17T20:01:05.000Z',
    reasonCode: 'compromised'
  });
  const bRevoked = createAgentCurrentnessCheckpoint({
    checkpointId: 'currentness.b.2',
    checkpointSequence: 2,
    previousCheckpoint: bCp,
    credentialHistory: [b.credential1],
    revocations: [revocation],
    trustedIssuerPublicKey: b.issuer.publicKey,
    observerId: 'observer.b',
    observerPrivateKey: b.observer.privateKey,
    evaluatedAt: '2026-08-17T20:01:06.000Z'
  });
  assert.throws(() => evaluateAgentCurrentnessSetAtEffect([
    {
      checkpoint: aCp,
      trustedObserverPublicKey: a.observer.publicKey,
      credentialHistory: [a.credential1],
      revocations: [],
      trustedIssuerPublicKey: a.issuer.publicKey,
      expectedLatestCheckpointDigest: aCp.checkpoint_digest
    },
    {
      checkpoint: bRevoked,
      trustedObserverPublicKey: b.observer.publicKey,
      credentialHistory: [b.credential1],
      revocations: [revocation],
      trustedIssuerPublicKey: b.issuer.publicKey,
      expectedLatestCheckpointDigest: bRevoked.checkpoint_digest
    }
  ], {
    effectAt: '2026-08-17T20:01:10.000Z',
    maxEvidenceAgeMs: 30_000
  }), /revoked; new effect denied/);
});

test('checkpoint chain refuses skipped sequence, rewritten history and missing revocation evidence', () => {
  const f = identityFixture();
  const cp1 = checkpoint1(f);
  assert.throws(() => createAgentCurrentnessCheckpoint({
    checkpointId: 'currentness.skipped',
    checkpointSequence: 3,
    previousCheckpoint: cp1,
    credentialHistory: [f.credential1, f.credential2],
    revocations: [],
    trustedIssuerPublicKey: f.issuer.publicKey,
    observerId: 'observer.local.1',
    observerPrivateKey: f.observer.privateKey,
    evaluatedAt: '2026-08-17T20:06:00.000Z'
  }), /sequence must advance exactly one/);

  const revocation = createMachineIdentityRevocation({
    credential: f.credential1,
    issuerPrivateKey: f.issuer.privateKey,
    effectiveAt: '2026-08-17T20:02:00.000Z',
    reasonCode: 'compromised'
  });
  const cpWithRevocation = createAgentCurrentnessCheckpoint({
    checkpointId: 'currentness.revoked.2',
    checkpointSequence: 2,
    previousCheckpoint: cp1,
    credentialHistory: [f.credential1],
    revocations: [revocation],
    trustedIssuerPublicKey: f.issuer.publicKey,
    observerId: 'observer.local.1',
    observerPrivateKey: f.observer.privateKey,
    evaluatedAt: '2026-08-17T20:03:00.000Z'
  });
  assert.throws(() => createAgentCurrentnessCheckpoint({
    checkpointId: 'currentness.rollback.3',
    checkpointSequence: 3,
    previousCheckpoint: cpWithRevocation,
    credentialHistory: [f.credential1, f.credential2],
    revocations: [],
    trustedIssuerPublicKey: f.issuer.publicKey,
    observerId: 'observer.local.1',
    observerPrivateKey: f.observer.privateKey,
    evaluatedAt: '2026-08-17T20:06:00.000Z'
  }), /revocation evidence was truncated/);
});
