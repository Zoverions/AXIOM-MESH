import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { digestObject } from '../src/lib/canonical.mjs';
import { ensureMeshIdentity } from '../src/lib/identity.mjs';
import { loadDataProtector } from '../src/lib/protector.mjs';
import { CircleGridStore } from '../src/grid/circle-store.mjs';
import {
  attestCircleCredentialPossession,
  circleCredentialPublicKeyFingerprint,
  createCircleCredentialPossessionChallenge,
  getCircleCredentialPossessionAttestationPolicy,
  signCircleCredentialPossessionChallenge,
  validateCircleCredentialPossessionAttestationPolicy,
  verifyCircleCredentialPossessionAttestation,
  verifyCircleCredentialPossessionChallenge,
  verifyCircleCredentialPossessionResponse
} from '../src/grid/circle-credential-possession-attestation.mjs';
import {
  buildCircleMemberLifecycleGridHeadCandidate
} from '../../packages/axiom-circle-lifecycle-grid-head/index.mjs';
import {
  FIXTURE_CIRCLE_ID,
  FIXTURE_CREDENTIAL_ID,
  FIXTURE_MEMBERSHIP_ID,
  FIXTURE_NOW,
  FIXTURE_PRINCIPAL,
  buildLifecycleGridFixtureInput,
  lifecycleCredentialHistory
} from './helpers/circle-lifecycle-grid-fixture.mjs';

const NOW_SECONDS = Math.floor(FIXTURE_NOW.valueOf() / 1000);
const REQUEST_DIGEST = digestObject({ schema: 'test-circle-possession-request.v0', event: 'invitation.beta' });

function credentialKeyPair() {
  const pair = generateKeyPairSync('ed25519');
  return {
    privateKey: pair.privateKey,
    publicKey: pair.publicKey,
    fingerprint: circleCredentialPublicKeyFingerprint(pair.publicKey)
  };
}

function credentialLifecycleWithKey(keyPair, { events = [] } = {}) {
  const base = lifecycleCredentialHistory();
  const credential = {
    ...base.credentials[0],
    public_key_fingerprint: keyPair.fingerprint
  };
  return lifecycleCredentialHistory({ credentials: [credential], events });
}

function credentialEvent({ kind, at, targetType = 'credential', targetId = FIXTURE_CREDENTIAL_ID, id = null }) {
  return {
    schema: 'axiom-circle-member-credential-event.v0',
    event_id: id ?? `credential.possession.${kind}`,
    circle_id: FIXTURE_CIRCLE_ID,
    membership_id: FIXTURE_MEMBERSHIP_ID,
    principal_id: FIXTURE_PRINCIPAL,
    target_type: targetType,
    target_id: targetId,
    kind,
    at,
    reason_code: 'possession-test',
    authority_effect: 'none',
    network_effect: 'none'
  };
}

async function createStore(t) {
  const dataDir = await mkdtemp(join(tmpdir(), 'axiom-circle-possession-'));
  const hypervisor = await ensureMeshIdentity(dataDir, 'hypervisor', { create: true });
  const grid = await ensureMeshIdentity(dataDir, 'grid', { create: true });
  const protector = await loadDataProtector({ dataDir, autoBootstrap: true });
  const store = new CircleGridStore({
    path: join(dataDir, 'grid.sqlite'),
    dataDir,
    identity: grid,
    protector,
    checkpointInterval: 10_000
  });
  t.after(async () => {
    try { store.close(); } catch {}
    await rm(dataDir, { recursive: true, force: true });
  });
  return { hypervisor, grid, store };
}

async function possessionFixture(t, { keyPair = credentialKeyPair(), events = [] } = {}) {
  const runtime = await createStore(t);
  const credentialLifecycle = credentialLifecycleWithKey(keyPair, { events });
  const input = await buildLifecycleGridFixtureInput({ credentialLifecycle });
  const lifecycleCandidate = buildCircleMemberLifecycleGridHeadCandidate(input);
  runtime.store.appendEvents({
    traceId: 'circle_possession_lifecycle_head',
    actor: FIXTURE_PRINCIPAL,
    events: [lifecycleCandidate.event]
  });
  const lifecycleHead = runtime.store.getCircleMemberLifecycleHead(FIXTURE_CIRCLE_ID, FIXTURE_MEMBERSHIP_ID);
  return {
    ...runtime,
    keyPair,
    credentialLifecycle,
    input,
    lifecycleCandidate,
    lifecycleHead
  };
}

function createChallenge(fixture, { nowSeconds = NOW_SECONDS, ttlSeconds = 20, requestDigest = REQUEST_DIGEST } = {}) {
  return createCircleCredentialPossessionChallenge(fixture.hypervisor, {
    circleId: FIXTURE_CIRCLE_ID,
    membershipId: FIXTURE_MEMBERSHIP_ID,
    principalId: FIXTURE_PRINCIPAL,
    credentialId: FIXTURE_CREDENTIAL_ID,
    requestDigest,
    lifecycleHead: fixture.lifecycleHead,
    nowSeconds,
    ttlSeconds
  });
}

function signChallenge(fixture, challenge, keyPair = fixture.keyPair, nowSeconds = NOW_SECONDS + 1) {
  return signCircleCredentialPossessionChallenge(
    challenge,
    keyPair.privateKey,
    keyPair.publicKey,
    {
      hypervisorPublicKey: fixture.hypervisor.publicKey,
      nowSeconds,
      maxTtlSeconds: 20
    }
  );
}

function verifyResponse(fixture, challenge, response, nowSeconds = NOW_SECONDS + 1) {
  return verifyCircleCredentialPossessionResponse({
    challenge,
    response,
    hypervisorPublicKey: fixture.hypervisor.publicKey,
    credentialPolicy: fixture.input.credentialPolicy,
    circlePackage: fixture.input.circlePackage,
    credentialLifecycle: fixture.credentialLifecycle,
    lifecycleHead: fixture.lifecycleHead,
    nowSeconds,
    maxTtlSeconds: 20
  });
}

test('Circle credential possession policy is exact, inert, and non-authorizing', () => {
  const policy = getCircleCredentialPossessionAttestationPolicy();
  assert.equal(validateCircleCredentialPossessionAttestationPolicy(policy), true);
  assert.equal(policy.runtime_activation, false);
  assert.equal(policy.credential_algorithm, 'Ed25519');
  assert.equal(policy.public_key_fingerprint_scheme, 'sha256-spki-der');
  assert.equal(policy.requirements.credential_must_be_authentication_eligible_at_observation, true);
  assert.equal(policy.requirements.challenge_single_use_persisted, false);
  assert.equal(policy.requirements.human_identity_proved, false);
  assert.equal(policy.requirements.role_authority_granted, false);
});

test('Hypervisor observes exact Ed25519 credential possession and signs a bounded non-authorizing attestation', async t => {
  const fixture = await possessionFixture(t);
  const challenge = createChallenge(fixture);
  const verifiedChallenge = verifyCircleCredentialPossessionChallenge(challenge, fixture.hypervisor.publicKey, {
    nowSeconds: NOW_SECONDS + 1,
    maxTtlSeconds: 20
  });
  assert.equal(verifiedChallenge.challenge.statement.request_digest, REQUEST_DIGEST);
  assert.equal(verifiedChallenge.challenge.statement.lifecycle_head_digest, fixture.lifecycleHead.lifecycle_head_digest);

  const response = signChallenge(fixture, challenge);
  const verifiedResponse = verifyResponse(fixture, challenge, response);
  assert.equal(verifiedResponse.credential_possession_verified, true);
  assert.equal(verifiedResponse.public_key_fingerprint, fixture.keyPair.fingerprint);
  assert.equal(verifiedResponse.human_identity_verified, false);
  assert.equal(verifiedResponse.role_authority_granted, false);

  const attestation = attestCircleCredentialPossession(fixture.hypervisor, {
    challenge,
    response,
    hypervisorPublicKey: fixture.hypervisor.publicKey,
    credentialPolicy: fixture.input.credentialPolicy,
    circlePackage: fixture.input.circlePackage,
    credentialLifecycle: fixture.credentialLifecycle,
    lifecycleHead: fixture.lifecycleHead,
    nowSeconds: NOW_SECONDS + 1,
    maxTtlSeconds: 20
  });
  const verifiedAttestation = verifyCircleCredentialPossessionAttestation(
    attestation,
    fixture.hypervisor.publicKey,
    {
      requestDigest: REQUEST_DIGEST,
      lifecycleHeadDigest: fixture.lifecycleHead.lifecycle_head_digest,
      circleId: FIXTURE_CIRCLE_ID,
      membershipId: FIXTURE_MEMBERSHIP_ID,
      principalId: FIXTURE_PRINCIPAL,
      credentialId: FIXTURE_CREDENTIAL_ID,
      nowSeconds: NOW_SECONDS + 2,
      maxAgeSeconds: 60
    }
  );
  assert.equal(verifiedAttestation.credential_possession_verified, true);
  assert.equal(verifiedAttestation.human_identity_verified, false);
  assert.equal(verifiedAttestation.legal_identity_verified, false);
  assert.equal(verifiedAttestation.runtime_authority, false);
  assert.equal(verifiedAttestation.external_effect_authority, false);
});

test('wrong key or public-key substitution cannot satisfy the lifecycle credential fingerprint', async t => {
  const fixture = await possessionFixture(t);
  const challenge = createChallenge(fixture);
  const wrongPair = credentialKeyPair();
  const wrongResponse = signChallenge(fixture, challenge, wrongPair);
  assert.throws(
    () => verifyResponse(fixture, challenge, wrongResponse),
    error => error?.code === 'circle_possession_key_fingerprint_mismatch' && error.status === 403
  );

  assert.throws(
    () => signCircleCredentialPossessionChallenge(
      challenge,
      fixture.keyPair.privateKey,
      wrongPair.publicKey,
      {
        hypervisorPublicKey: fixture.hypervisor.publicKey,
        nowSeconds: NOW_SECONDS + 1,
        maxTtlSeconds: 20
      }
    ),
    /private\/public key pair does not match/
  );
});

test('expired challenge and request substitution fail closed', async t => {
  const fixture = await possessionFixture(t);
  const challenge = createChallenge(fixture, { ttlSeconds: 10 });
  assert.throws(
    () => verifyCircleCredentialPossessionChallenge(challenge, fixture.hypervisor.publicKey, {
      nowSeconds: NOW_SECONDS + 10,
      maxTtlSeconds: 20
    }),
    error => error?.code === 'expired_circle_possession_challenge'
  );

  const activeChallenge = createChallenge(fixture);
  const response = signChallenge(fixture, activeChallenge);
  const attestation = attestCircleCredentialPossession(fixture.hypervisor, {
    challenge: activeChallenge,
    response,
    hypervisorPublicKey: fixture.hypervisor.publicKey,
    credentialPolicy: fixture.input.credentialPolicy,
    circlePackage: fixture.input.circlePackage,
    credentialLifecycle: fixture.credentialLifecycle,
    lifecycleHead: fixture.lifecycleHead,
    nowSeconds: NOW_SECONDS + 1,
    maxTtlSeconds: 20
  });
  assert.throws(
    () => verifyCircleCredentialPossessionAttestation(attestation, fixture.hypervisor.publicKey, {
      requestDigest: 'f'.repeat(64),
      lifecycleHeadDigest: fixture.lifecycleHead.lifecycle_head_digest,
      circleId: FIXTURE_CIRCLE_ID,
      membershipId: FIXTURE_MEMBERSHIP_ID,
      principalId: FIXTURE_PRINCIPAL,
      credentialId: FIXTURE_CREDENTIAL_ID,
      nowSeconds: NOW_SECONDS + 2,
      maxAgeSeconds: 60
    }),
    error => error?.code === 'circle_possession_attestation_context_mismatch'
  );
});

test('revoked credential proves no authentication eligibility even with the correct private key', async t => {
  const revoke = credentialEvent({
    kind: 'credential-revoke',
    at: '2026-08-20T12:50:00.000Z'
  });
  const fixture = await possessionFixture(t, { events: [revoke] });
  const challenge = createChallenge(fixture);
  const response = signChallenge(fixture, challenge);
  assert.throws(
    () => verifyResponse(fixture, challenge, response),
    error => error?.code === 'circle_credential_not_authentication_eligible' && error.status === 403
  );
});

test('compromised device cannot authenticate even when its credential signature remains cryptographically valid', async t => {
  const base = lifecycleCredentialHistory();
  const compromise = credentialEvent({
    kind: 'device-compromise',
    at: '2026-08-20T12:50:00.000Z',
    targetType: 'device',
    targetId: base.devices[0].device_id,
    id: 'credential.possession.device-compromise'
  });
  const fixture = await possessionFixture(t, { events: [compromise] });
  const challenge = createChallenge(fixture);
  const response = signChallenge(fixture, challenge);
  assert.throws(
    () => verifyResponse(fixture, challenge, response),
    error => error?.code === 'circle_credential_not_authentication_eligible'
  );
});

test('challenge cannot be verified against a substituted lifecycle head or lifecycle body', async t => {
  const fixture = await possessionFixture(t);
  const challenge = createChallenge(fixture);
  const response = signChallenge(fixture, challenge);
  const wrongHead = {
    ...fixture.lifecycleHead,
    lifecycle_head_digest: 'e'.repeat(64)
  };
  assert.throws(
    () => verifyCircleCredentialPossessionResponse({
      challenge,
      response,
      hypervisorPublicKey: fixture.hypervisor.publicKey,
      credentialPolicy: fixture.input.credentialPolicy,
      circlePackage: fixture.input.circlePackage,
      credentialLifecycle: fixture.credentialLifecycle,
      lifecycleHead: wrongHead,
      nowSeconds: NOW_SECONDS + 1,
      maxTtlSeconds: 20
    }),
    error => error?.code === 'circle_possession_lifecycle_mismatch'
  );

  const changedLifecycle = structuredClone(fixture.credentialLifecycle);
  changedLifecycle.recovery_proposals.push({
    schema: 'fabricated',
    value: true
  });
  assert.throws(
    () => verifyCircleCredentialPossessionResponse({
      challenge,
      response,
      hypervisorPublicKey: fixture.hypervisor.publicKey,
      credentialPolicy: fixture.input.credentialPolicy,
      circlePackage: fixture.input.circlePackage,
      credentialLifecycle: changedLifecycle,
      lifecycleHead: fixture.lifecycleHead,
      nowSeconds: NOW_SECONDS + 1,
      maxTtlSeconds: 20
    }),
    error => error?.code === 'circle_possession_lifecycle_mismatch'
  );
});

test('possession contract remains unwired from runtime servers and exposes no secret material', async () => {
  const proofSource = await readFile(new URL('../src/grid/circle-credential-possession-attestation.mjs', import.meta.url), 'utf8');
  const gridServer = await readFile(new URL('../src/grid/server.mjs', import.meta.url), 'utf8');
  const hypervisorServer = await readFile(new URL('../src/hypervisor/server.mjs', import.meta.url), 'utf8');
  const gatewayServer = await readFile(new URL('../src/gateway/server.mjs', import.meta.url), 'utf8');
  for (const source of [gridServer, hypervisorServer, gatewayServer]) {
    assert.doesNotMatch(source, /circle-credential-possession-attestation\.mjs/);
    assert.doesNotMatch(source, /createCircleCredentialPossessionChallenge/);
    assert.doesNotMatch(source, /attestCircleCredentialPossession/);
  }
  assert.doesNotMatch(proofSource, /private_key_spki|private_key_pem|secret_material:/);
});
