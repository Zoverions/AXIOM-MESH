import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import test from 'node:test';

import {
  createAttestationVerifier,
  createNullifierRegistry,
  signAttestation,
  verifyAttestation
} from '../../labs/praxis/attestation.mjs';

// Characterize the existing verifier. Synthetic keys and in-memory replay state
// only: these tests issue no permit, invoke no executor, and make no network call.
const NOW = 1_700_000_000_000;
const REQUIRED = ['live_output_truth'];

function fixture(overrides = {}) {
  const key = generateKeyPairSync('ed25519');
  const store = new Map();
  const nullifiers = createNullifierRegistry({ store });
  const fields = {
    attestor: 'attest:ordering',
    subject: 'tests:attestation-ordering',
    mergeTarget: `pr:1831@sha256:${'a'.repeat(64)}`,
    kind: 'tests-reproduced',
    claims: { tests_failed: 0 },
    nonClaims: [...REQUIRED],
    nullifier: `sha256:${'b'.repeat(64)}`,
    issuedAtMs: NOW - 1000,
    expiresAtMs: NOW + 1000,
    evidenceRefs: ['evidence:synthetic-ordering'],
    ...overrides
  };
  const options = {
    trustedKeys: { 'attest:ordering': key.publicKey },
    trustedAttestorsByKind: { 'tests-reproduced': ['attest:ordering'] },
    now: NOW,
    requiredNonClaims: REQUIRED
  };
  return {
    attestation: signAttestation(fields, key.privateKey),
    options, nullifiers, store,
    corrected: () => signAttestation({ ...fields, nonClaims: [...REQUIRED] }, key.privateKey)
  };
}

function rejectsWithoutSpending(f, attestation, code, overrides = {}) {
  assert.throws(() => verifyAttestation(attestation, {
    ...f.options, nullifiers: f.nullifiers, ...overrides
  }), error => error.code === code);
  assert.equal(f.store.size, 0);
  assert.equal(f.nullifiers.has(f.attestation.nullifier), false);
}

test('structural non-claims rejection precedes signature failure and preserves replay state', () => {
  const f = fixture();
  rejectsWithoutSpending(f, { ...f.attestation, non_claims: [], signature: '' },
    'PRAXIS_ATTESTATION_NON_CLAIMS');
});

test('signature failure precedes caller-required non-claims rejection without spending', () => {
  const f = fixture({ nonClaims: ['signer_custody'] });
  rejectsWithoutSpending(f, { ...f.attestation, signature: '' },
    'PRAXIS_ATTESTATION_SIGNATURE');
});

test('signer-role rejection precedes caller-required non-claims rejection without spending', () => {
  const f = fixture({ nonClaims: ['signer_custody'] });
  rejectsWithoutSpending(f, f.attestation, 'PRAXIS_ATTESTATION_ATTESTOR_ROLE', {
    trustedAttestorsByKind: { 'tests-reproduced': [] }
  });
});

test('freshness rejection precedes caller-required non-claims rejection without spending', () => {
  for (const [times, code] of [
    [{ issuedAtMs: NOW + 1, expiresAtMs: NOW + 1000 }, 'PRAXIS_ATTESTATION_STALE'],
    [{ issuedAtMs: NOW - 900001, expiresAtMs: NOW + 1000 }, 'PRAXIS_ATTESTATION_STALE'],
    [{ issuedAtMs: NOW - 1000, expiresAtMs: NOW }, 'PRAXIS_ATTESTATION_EXPIRED']
  ]) {
    const f = fixture({ ...times, nonClaims: ['signer_custody'] });
    rejectsWithoutSpending(f, f.attestation, code);
  }
});

test('caller-required non-claims rejection leaves the nullifier available for corrected evidence', () => {
  const f = fixture({ nonClaims: ['signer_custody'] });
  rejectsWithoutSpending(f, f.attestation, 'PRAXIS_ATTESTATION_NON_CLAIMS');
  const result = verifyAttestation(f.corrected(), { ...f.options, nullifiers: f.nullifiers });
  assert.deepEqual(result.evidence.non_claims, REQUIRED);
  assert.equal(f.store.size, 1);
  assert.equal(f.store.get(f.attestation.nullifier), NOW);
});

test('in-language attestation rechecks remain repeatable without a replay registry', async () => {
  const f = fixture();
  const verifier = createAttestationVerifier(f.options);
  const input = { kind: 'Observed', value: JSON.stringify(f.attestation) };
  const first = await verifier(input);
  const second = await verifier(input);
  assert.equal(first.ok, true);
  assert.deepEqual(second, first);
  assert.equal(f.store.size, 0);
  assert.equal(verifyAttestation(f.attestation, { ...f.options, nullifiers: null }).digest, first.digest);
});

test('caller-supplied replay state consumes success exactly once and retains the original spend', () => {
  const f = fixture();
  const result = verifyAttestation(f.attestation, { ...f.options, nullifiers: f.nullifiers });
  assert.equal(result.evidence.nullifier, f.attestation.nullifier);
  assert.equal(f.store.size, 1);
  assert.equal(f.store.get(f.attestation.nullifier), NOW);
  assert.throws(() => verifyAttestation(f.attestation, {
    ...f.options, now: NOW + 1, nullifiers: f.nullifiers
  }), error => error.code === 'PRAXIS_ATTESTATION_REPLAY');
  assert.deepEqual([...f.store], [[f.attestation.nullifier, NOW]]);
});
