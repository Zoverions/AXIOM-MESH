import assert from 'node:assert/strict';
import {
  generateKeyPairSync,
  sign as signBytes
} from 'node:crypto';
import test from 'node:test';
import {
  beaconEntityAssuranceSubjectId,
  normalizeBeaconObservationEntityAssuranceEvidence
} from '../src/lib/beacon-entity-assurance-evidence.mjs';
import {
  beaconObservationReplayKey,
  verifyBeaconObservationEnvelope
} from '../src/lib/beacon-observation-candidate.mjs';
import { canonicalJson, sha256 } from '../src/lib/canonical.mjs';
import { evaluateEntityAssurance } from '../src/lib/entity-assurance.mjs';

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
  const { signature_base64: _signature, ...document } = envelope;
  return document;
}

function signedEnvelope(keypair = keys()) {
  const envelope = unsignedEnvelope(keypair.publicKeySpki);
  envelope.signature_base64 = signBytes(
    null,
    Buffer.from(canonicalJson(signingDocument(envelope)), 'utf8'),
    keypair.privateKey
  ).toString('base64');
  return envelope;
}

function providerProfile(overrides = {}) {
  const profile = {
    schema: 'axiom-agent-provider-profile.v0',
    version: 0,
    status: 'inert-provider-laboratory',
    provider_id: 'provider.interop.beacon',
    provider_class: 'agent-interop',
    implementation: {
      artifact_ref: 'artifact.interop.beacon.v0',
      artifact_digest: '3'.repeat(64),
      source_kind: 'external',
      upstream_ref: 'upstream.scottcjn.beacon-skill'
    },
    profile_ref: 'profile.interop.beacon.v0',
    capabilities: ['agent.discovery', 'agent.signed-envelope', 'agent.replay-protection'],
    evidence_classes: ['signed-envelope', 'replay-protected-envelope'],
    assurance_ceiling: 'cryptographic',
    created_at: '2026-08-29T12:00:00.000Z',
    updated_at: '2026-08-29T12:00:00.000Z',
    authority_effect: 'none',
    trust_effect: 'evidence-only',
    credential_visibility: 'none',
    network_effect: 'none',
    runtime_activation: false,
    settlement_activation: false
  };
  return { ...profile, ...overrides };
}

function input(envelope, overrides = {}) {
  return {
    envelope,
    provider_profile: providerProfile(),
    now: '2026-08-29T19:01:00.000Z',
    seen_replay_keys: [],
    ...overrides
  };
}

test('normalizes a verified Beacon observation into bounded portable Entity Assurance provenance evidence', () => {
  const envelope = signedEnvelope();
  const verification = verifyBeaconObservationEnvelope(envelope, {
    now: '2026-08-29T19:01:00.000Z',
    seen_replay_keys: []
  });
  const evidence = normalizeBeaconObservationEntityAssuranceEvidence(input(envelope));

  assert.equal(
    evidence.subject_id,
    beaconEntityAssuranceSubjectId(verification.sender_key_fingerprint)
  );
  assert.match(evidence.subject_id, /^external\.beacon\.key\.[a-f0-9]{64}$/);
  assert.equal(evidence.dimension, 'provenance');
  assert.equal(evidence.result, 'pass');
  assert.equal(evidence.strength, 'moderate');
  assert.equal(evidence.evidence_class, 'measured');
  assert.equal(evidence.issuer_id, null);
  assert.equal(evidence.binding_scope, 'pseudonymous');
  assert.equal(evidence.observed_at, envelope.issued_at);
  assert.equal(evidence.expires_at, envelope.expires_at);
  assert.equal(evidence.non_authorizing, true);
  assert.equal(Object.hasOwn(evidence, 'authority_granted'), false);
  assert.match(evidence.basis_digest, /^[a-f0-9]{64}$/);
  assert.match(evidence.evidence_digest, /^[a-f0-9]{64}$/);
  assert.match(evidence.evidence_id, /^evidence\.beacon\.provenance\.[a-f0-9]{64}$/);
  assert.equal(Object.isFrozen(evidence), true);
});

test('normalization is deterministic for the same provider, envelope, and replay snapshot', () => {
  const envelope = signedEnvelope();
  const first = normalizeBeaconObservationEntityAssuranceEvidence(input(envelope));
  const second = normalizeBeaconObservationEntityAssuranceEvidence(input(envelope));
  assert.deepEqual(first, second);
});

test('tampered or replayed Beacon observations fail closed during normalization', () => {
  const tampered = signedEnvelope();
  tampered.payload_text = JSON.stringify({ type: 'presence', message: 'tampered' });
  tampered.payload_digest = sha256(tampered.payload_text);
  assert.throws(
    () => normalizeBeaconObservationEntityAssuranceEvidence(input(tampered)),
    /signature/i
  );

  const replayed = signedEnvelope();
  const replayKey = beaconObservationReplayKey(replayed);
  assert.throws(
    () => normalizeBeaconObservationEntityAssuranceEvidence(input(replayed, {
      seen_replay_keys: [replayKey]
    })),
    /replay/i
  );
});

test('normalization requires an interop profile with signed and replay-protected cryptographic evidence', () => {
  const envelope = signedEnvelope();

  assert.throws(
    () => normalizeBeaconObservationEntityAssuranceEvidence(input(envelope, {
      provider_profile: providerProfile({ provider_class: 'memory' })
    })),
    /agent-interop/i
  );

  assert.throws(
    () => normalizeBeaconObservationEntityAssuranceEvidence(input(envelope, {
      provider_profile: providerProfile({ evidence_classes: ['replay-protected-envelope'] })
    })),
    /signed-envelope/i
  );

  assert.throws(
    () => normalizeBeaconObservationEntityAssuranceEvidence(input(envelope, {
      provider_profile: providerProfile({ evidence_classes: ['signed-envelope'] })
    })),
    /replay-protected-envelope/i
  );

  assert.throws(
    () => normalizeBeaconObservationEntityAssuranceEvidence(input(envelope, {
      provider_profile: providerProfile({ assurance_ceiling: 'behavioral' })
    })),
    /cryptographic/i
  );
});

test('caller cannot override the key-derived Entity Assurance subject', () => {
  const envelope = signedEnvelope();
  assert.throws(
    () => normalizeBeaconObservationEntityAssuranceEvidence({
      ...input(envelope),
      subject_id: 'agent.personal.primary'
    }),
    /unknown field/i
  );
});

test('portable normalized evidence can satisfy Entity Assurance without granting authority or delegation', () => {
  const envelope = signedEnvelope();
  const evidence = normalizeBeaconObservationEntityAssuranceEvidence(input(envelope));
  const policy = {
    schema: 'axiom-entity-assurance-policy.v1',
    policy_id: 'policy.external.beacon.provenance',
    identity_requirement: 'none',
    requirements: [{
      dimension: 'provenance',
      minimum_strength: 'moderate',
      accepted_evidence_classes: ['measured']
    }],
    authority_effect: 'none',
    delegation_effect: 'none'
  };

  const decision = evaluateEntityAssurance({
    policy,
    evidence: [evidence],
    subjectId: evidence.subject_id,
    now: '2026-08-29T19:01:00.000Z'
  });

  assert.equal(decision.satisfied, true);
  assert.equal(decision.decision, 'satisfied');
  assert.equal(decision.identity_requirement, 'none');
  assert.equal(decision.authority_granted, false);
  assert.equal(decision.delegation_granted, false);
});
