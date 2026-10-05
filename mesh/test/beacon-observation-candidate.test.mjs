import assert from 'node:assert/strict';
import {
  generateKeyPairSync,
  sign as signBytes
} from 'node:crypto';
import test from 'node:test';
import {
  BEACON_OBSERVATION_CANDIDATE_SCHEMA,
  beaconObservationReplayKey,
  verifyBeaconObservationEnvelope
} from '../src/lib/beacon-observation-candidate.mjs';
import { canonicalJson, sha256 } from '../src/lib/canonical.mjs';

function keys() {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  return {
    privateKey,
    publicKeySpki: publicKey.export({ format: 'der', type: 'spki' }).toString('base64')
  };
}

function unsignedEnvelope(publicKeySpki) {
  const payloadText = JSON.stringify({ type: 'presence', message: 'hello from external peer' });
  return {
    schema: 'axiom-beacon-observation-candidate.v0',
    version: 0,
    status: 'read-only-external-observation',
    sender_id: 'beacon.peer.example',
    sender_public_key_spki: publicKeySpki,
    nonce: 'nonce_0123456789abcdef0123456789abcdef',
    issued_at: '2026-08-29T19:00:00.000Z',
    expires_at: '2026-08-29T19:05:00.000Z',
    content_type: 'application/json',
    payload_text: payloadText,
    payload_digest: sha256(payloadText),
    signature_algorithm: 'ed25519',
    authority_effect: 'none',
    network_effect: 'none',
    runtime_activation: false,
    compatibility_claimed: false
  };
}

function signingDocument(envelope) {
  const {
    signature_base64: _signature,
    ...document
  } = envelope;
  return document;
}

function signedEnvelope(keypair = keys()) {
  const envelope = unsignedEnvelope(keypair.publicKeySpki);
  const signature = signBytes(
    null,
    Buffer.from(canonicalJson(signingDocument(envelope)), 'utf8'),
    keypair.privateKey
  );
  return {
    ...envelope,
    signature_base64: signature.toString('base64')
  };
}

function verificationOptions(envelope, seenReplayKeys = []) {
  return {
    now: '2026-08-29T19:01:00.000Z',
    seen_replay_keys: seenReplayKeys.length
      ? seenReplayKeys
      : []
  };
}

test('verifies a signed fresh external observation without granting authority', () => {
  const envelope = signedEnvelope();
  const result = verifyBeaconObservationEnvelope(envelope, verificationOptions(envelope));

  assert.equal(BEACON_OBSERVATION_CANDIDATE_SCHEMA, envelope.schema);
  assert.equal(result.valid, true);
  assert.equal(result.sender_id, envelope.sender_id);
  assert.equal(result.signature_verified, true);
  assert.equal(result.freshness_verified, true);
  assert.equal(result.replay_checked, true);
  assert.equal(result.replay_persistence, false);
  assert.equal(result.network_listener, false);
  assert.equal(result.authority_effect, 'none');
  assert.equal(result.network_effect, 'none');
  assert.equal(result.runtime_activation, false);
  assert.equal(result.compatibility_claimed, false);
  assert.match(result.sender_key_fingerprint, /^[a-f0-9]{64}$/);
  assert.match(result.observation_digest, /^[a-f0-9]{64}$/);
  assert.equal(result.replay_key, beaconObservationReplayKey(envelope));
  assert.equal(Object.isFrozen(result), true);
});

test('tampering with the payload after signing fails signature verification', () => {
  const envelope = signedEnvelope();
  envelope.payload_text = JSON.stringify({ type: 'presence', message: 'tampered' });
  envelope.payload_digest = sha256(envelope.payload_text);
  assert.throws(
    () => verifyBeaconObservationEnvelope(envelope, verificationOptions(envelope)),
    /signature/i
  );
});

test('payload digest is checked independently of the signature', () => {
  const envelope = signedEnvelope();
  envelope.payload_digest = '0'.repeat(64);
  assert.throws(
    () => verifyBeaconObservationEnvelope(envelope, verificationOptions(envelope)),
    /payload digest/i
  );
});

test('expired and excessively future-dated observations fail closed', () => {
  const expired = signedEnvelope();
  assert.throws(
    () => verifyBeaconObservationEnvelope(expired, {
      now: '2026-08-29T19:05:00.001Z',
      seen_replay_keys: []
    }),
    /expired/i
  );

  const keypair = keys();
  const future = unsignedEnvelope(keypair.publicKeySpki);
  future.issued_at = '2026-08-29T19:02:00.000Z';
  future.expires_at = '2026-08-29T19:07:00.000Z';
  future.signature_base64 = signBytes(
    null,
    Buffer.from(canonicalJson(signingDocument(future)), 'utf8'),
    keypair.privateKey
  ).toString('base64');
  assert.throws(
    () => verifyBeaconObservationEnvelope(future, {
      now: '2026-08-29T19:01:00.000Z',
      seen_replay_keys: []
    }),
    /future/i
  );
});

test('observation lifetime cannot exceed the bounded five-minute window', () => {
  const keypair = keys();
  const envelope = unsignedEnvelope(keypair.publicKeySpki);
  envelope.expires_at = '2026-08-29T19:05:00.001Z';
  envelope.signature_base64 = signBytes(
    null,
    Buffer.from(canonicalJson(signingDocument(envelope)), 'utf8'),
    keypair.privateKey
  ).toString('base64');
  assert.throws(
    () => verifyBeaconObservationEnvelope(envelope, verificationOptions(envelope)),
    /lifetime/i
  );
});

test('explicit caller replay snapshot rejects a previously seen sender nonce', () => {
  const envelope = signedEnvelope();
  const replayKey = beaconObservationReplayKey(envelope);
  assert.throws(
    () => verifyBeaconObservationEnvelope(
      envelope,
      verificationOptions(envelope, [replayKey])
    ),
    /replay/i
  );
});

test('authority, network, runtime, and compatibility widening fail closed', () => {
  const keypair = keys();
  for (const [field, value] of [
    ['authority_effect', 'grant'],
    ['network_effect', 'outbound'],
    ['runtime_activation', true],
    ['compatibility_claimed', true]
  ]) {
    const envelope = unsignedEnvelope(keypair.publicKeySpki);
    envelope[field] = value;
    envelope.signature_base64 = signBytes(
      null,
      Buffer.from(canonicalJson(signingDocument(envelope)), 'utf8'),
      keypair.privateKey
    ).toString('base64');
    assert.throws(
      () => verifyBeaconObservationEnvelope(envelope, verificationOptions(envelope)),
      /boundary/i
    );
  }
});

test('unknown fields and malformed replay state fail closed', () => {
  const envelope = signedEnvelope();
  envelope.authorization = 'please trust me';
  assert.throws(
    () => verifyBeaconObservationEnvelope(envelope, verificationOptions(envelope)),
    /unknown field/i
  );

  const fresh = signedEnvelope();
  assert.throws(
    () => verifyBeaconObservationEnvelope(fresh, {
      now: '2026-08-29T19:01:00.000Z',
      seen_replay_keys: ['not-a-digest']
    }),
    /replay state/i
  );
});
