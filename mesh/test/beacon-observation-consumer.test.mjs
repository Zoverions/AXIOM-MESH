import assert from 'node:assert/strict';
import {
  generateKeyPairSync,
  sign as signBytes
} from 'node:crypto';
import {
  mkdtemp,
  rm,
  writeFile
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { canonicalJson, sha256 } from '../src/lib/canonical.mjs';
import { readExternalObservationReplayState } from '../src/lib/external-observation-replay-store.mjs';

async function consumer() {
  return import('../src/lib/beacon-observation-consumer.mjs');
}

async function withTempDir(fn) {
  const dir = await mkdtemp(join(tmpdir(), 'axiom-beacon-consumer-'));
  try {
    await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

function keypair() {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  return {
    privateKey,
    publicKeySpki: publicKey.export({ format: 'der', type: 'spki' }).toString('base64')
  };
}

function signingDocument(envelope) {
  const { signature_base64: _signature, ...document } = envelope;
  return document;
}

function signedEnvelope({
  senderId = 'did:example/agent.one',
  issuedAt = '2026-08-29T19:01:20.000Z',
  expiresAt = '2026-08-29T19:06:20.000Z',
  nonce = 'nonce_0123456789abcdef0123456789abcdef'
} = {}) {
  const keys = keypair();
  const payloadText = JSON.stringify({ type: 'presence', message: 'external observation' });
  const envelope = {
    schema: 'axiom-beacon-observation-candidate.v0',
    version: 0,
    status: 'read-only-external-observation',
    sender_id: senderId,
    sender_public_key_spki: keys.publicKeySpki,
    nonce,
    issued_at: issuedAt,
    expires_at: expiresAt,
    content_type: 'application/json',
    payload_text: payloadText,
    payload_digest: sha256(payloadText),
    signature_algorithm: 'ed25519',
    authority_effect: 'none',
    network_effect: 'none',
    runtime_activation: false,
    compatibility_claimed: false
  };
  envelope.signature_base64 = signBytes(
    null,
    Buffer.from(canonicalJson(signingDocument(envelope)), 'utf8'),
    keys.privateKey
  ).toString('base64');
  return envelope;
}

function options(statePath, overrides = {}) {
  return {
    state_path: statePath,
    now: '2026-08-29T19:01:00.000Z',
    ...overrides
  };
}

test('verifies then durably claims a verifier-valid external observation without authority', async () => {
  const { consumeBeaconObservationCandidate } = await consumer();

  await withTempDir(async dir => {
    const statePath = join(dir, 'replay-state.json');
    const envelope = signedEnvelope();
    const result = await consumeBeaconObservationCandidate(envelope, options(statePath));

    assert.equal(result.valid, true);
    assert.equal(result.sender_id, envelope.sender_id);
    assert.equal(result.signature_verified, true);
    assert.equal(result.freshness_verified, true);
    assert.equal(result.replay_checked, true);
    assert.equal(result.replay_persistence, true);
    assert.equal(result.replay_claimed, true);
    assert.equal(result.network_listener, false);
    assert.equal(result.authority_effect, 'none');
    assert.equal(result.network_effect, 'none');
    assert.equal(result.runtime_activation, false);
    assert.equal(result.compatibility_claimed, false);
    assert.match(result.replay_state_digest, /^[a-f0-9]{64}$/);
    assert.equal(Object.isFrozen(result), true);

    await assert.rejects(
      () => consumeBeaconObservationCandidate(envelope, options(statePath)),
      /replay/i
    );
  });
});

test('invalid signatures cannot poison durable replay state', async () => {
  const { consumeBeaconObservationCandidate } = await consumer();

  await withTempDir(async dir => {
    const statePath = join(dir, 'replay-state.json');
    const valid = signedEnvelope({
      issuedAt: '2026-08-29T19:00:00.000Z',
      expiresAt: '2026-08-29T19:05:00.000Z'
    });
    const invalid = {
      ...valid,
      payload_text: JSON.stringify({ type: 'presence', message: 'tampered after signing' })
    };
    invalid.payload_digest = sha256(invalid.payload_text);

    await assert.rejects(
      () => consumeBeaconObservationCandidate(invalid, options(statePath)),
      /signature/i
    );

    const state = await readExternalObservationReplayState({
      state_path: statePath,
      now: '2026-08-29T19:01:00.000Z'
    });
    assert.equal(state.entries.length, 0);

    const accepted = await consumeBeaconObservationCandidate(valid, options(statePath));
    assert.equal(accepted.replay_claimed, true);
  });
});

test('concurrent duplicate consumption fails closed with only one accepted claim', async () => {
  const { consumeBeaconObservationCandidate } = await consumer();

  await withTempDir(async dir => {
    const statePath = join(dir, 'replay-state.json');
    const envelope = signedEnvelope({
      issuedAt: '2026-08-29T19:00:00.000Z',
      expiresAt: '2026-08-29T19:05:00.000Z'
    });

    const results = await Promise.allSettled([
      consumeBeaconObservationCandidate(envelope, options(statePath)),
      consumeBeaconObservationCandidate(envelope, options(statePath))
    ]);
    const fulfilled = results.filter(item => item.status === 'fulfilled');
    const rejected = results.filter(item => item.status === 'rejected');

    assert.equal(fulfilled.length, 1);
    assert.equal(rejected.length, 1);
    assert.match(String(rejected[0].reason?.message ?? rejected[0].reason), /replay|lock/i);

    const state = await readExternalObservationReplayState({
      state_path: statePath,
      now: '2026-08-29T19:01:00.000Z'
    });
    assert.equal(state.entries.length, 1);
  });
});

test('valid observations fail closed when durable replay state cannot be claimed', async () => {
  const { consumeBeaconObservationCandidate } = await consumer();

  await withTempDir(async dir => {
    const statePath = join(dir, 'replay-state.json');
    await writeFile(`${statePath}.lock`, 'busy\n', 'utf8');

    await assert.rejects(
      () => consumeBeaconObservationCandidate(
        signedEnvelope({
          issuedAt: '2026-08-29T19:00:00.000Z',
          expiresAt: '2026-08-29T19:05:00.000Z'
        }),
        options(statePath)
      ),
      /lock|unavailable/i
    );
  });
});

test('consumer options are closed-world and do not accept authority or network controls', async () => {
  const { consumeBeaconObservationCandidate } = await consumer();

  await withTempDir(async dir => {
    await assert.rejects(
      () => consumeBeaconObservationCandidate(
        signedEnvelope({
          issuedAt: '2026-08-29T19:00:00.000Z',
          expiresAt: '2026-08-29T19:05:00.000Z'
        }),
        options(join(dir, 'replay-state.json'), { authorization: 'grant' })
      ),
      /unknown|option|field/i
    );
  });
});
