import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { digestObject } from '../src/lib/canonical.mjs';
import { ensureMeshIdentity } from '../src/lib/identity.mjs';
import {
  createCircleCredentialPossessionChallenge,
  signCircleCredentialPossessionChallenge,
  verifyCircleCredentialPossessionChallenge
} from '../src/grid/circle-credential-possession-attestation.mjs';

const NOW_SECONDS = Math.floor(Date.parse('2026-08-20T13:00:00.000Z') / 1000);

function lifecycleHead() {
  return {
    circle_id: 'circle.possession.trust',
    membership_id: 'membership.possession.trust',
    principal_id: 'human.possession.trust',
    lifecycle_head_digest: 'a'.repeat(64),
    membership_lifecycle_digest: 'b'.repeat(64),
    credential_lifecycle_digest: 'c'.repeat(64),
    event_id: 'circle_lifecycle_head_trust_fixture',
    event_seq: 1,
    updated_at: '2026-08-20T12:59:00.000Z'
  };
}

async function hypervisorIdentity(t, prefix) {
  const dataDir = await mkdtemp(join(tmpdir(), prefix));
  const identity = await ensureMeshIdentity(dataDir, 'hypervisor', { create: true });
  t.after(() => rm(dataDir, { recursive: true, force: true }));
  return identity;
}

test('possession challenge verifies only under the exact trusted Hypervisor key', async t => {
  const trusted = await hypervisorIdentity(t, 'axiom-possession-trusted-');
  const substituted = await hypervisorIdentity(t, 'axiom-possession-substituted-');
  const requestDigest = digestObject({ schema: 'test-request.v0', value: 'trust-root' });
  const challenge = createCircleCredentialPossessionChallenge(trusted, {
    circleId: 'circle.possession.trust',
    membershipId: 'membership.possession.trust',
    principalId: 'human.possession.trust',
    credentialId: 'credential.possession.trust',
    requestDigest,
    lifecycleHead: lifecycleHead(),
    nowSeconds: NOW_SECONDS,
    ttlSeconds: 20
  });

  const verified = verifyCircleCredentialPossessionChallenge(challenge, trusted.publicKey, {
    nowSeconds: NOW_SECONDS + 1,
    maxTtlSeconds: 20
  });
  assert.equal(verified.challenge.statement.request_digest, requestDigest);

  assert.throws(
    () => verifyCircleCredentialPossessionChallenge(challenge, substituted.publicKey, {
      nowSeconds: NOW_SECONDS + 1,
      maxTtlSeconds: 20
    }),
    error => error?.code === 'invalid_circle_possession_challenge' && error.status === 401
  );
});

test('challenge tampering fails before a member private key is used', async t => {
  const trusted = await hypervisorIdentity(t, 'axiom-possession-tamper-');
  const requestDigest = digestObject({ schema: 'test-request.v0', value: 'original' });
  const challenge = createCircleCredentialPossessionChallenge(trusted, {
    circleId: 'circle.possession.trust',
    membershipId: 'membership.possession.trust',
    principalId: 'human.possession.trust',
    credentialId: 'credential.possession.trust',
    requestDigest,
    lifecycleHead: lifecycleHead(),
    nowSeconds: NOW_SECONDS,
    ttlSeconds: 20
  });
  const tampered = structuredClone(challenge);
  tampered.statement.request_digest = digestObject({ schema: 'test-request.v0', value: 'substituted' });
  const memberKey = generateKeyPairSync('ed25519');

  assert.throws(
    () => signCircleCredentialPossessionChallenge(
      tampered,
      memberKey.privateKey,
      memberKey.publicKey,
      {
        hypervisorPublicKey: trusted.publicKey,
        nowSeconds: NOW_SECONDS + 1,
        maxTtlSeconds: 20
      }
    ),
    error => error?.code === 'invalid_circle_possession_challenge'
  );
});
