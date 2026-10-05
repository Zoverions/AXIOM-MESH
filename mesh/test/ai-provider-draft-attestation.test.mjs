import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import test from 'node:test';

import { sha256 } from '../src/lib/canonical.mjs';
import { MeshIdentity } from '../src/lib/identity.mjs';
import { buildAiProviderReceipt } from '../src/lib/ai-provider-invoke.mjs';
import {
  createAiProviderDraftAttestation, verifyAiProviderDraftAttestation
} from '../src/lib/ai-provider-draft-attestation.mjs';

const T0 = '2026-09-24T12:00:00.000Z';
const T1 = '2026-09-24T12:01:00.000Z';
const T2 = '2026-09-24T12:02:00.000Z';
const T4 = '2026-09-24T12:04:00.000Z';
const NONCE = 'synthetic-verifier-challenge-001';

function fixture() {
  const pair = generateKeyPairSync('ed25519');
  const signer = new MeshIdentity(
    'synthetic-attestor',
    pair.privateKey.export({ type: 'pkcs8', format: 'pem' }),
    pair.publicKey.export({ type: 'spki', format: 'pem' })
  );
  const invoke = {
    schema: 'axiom-ai-provider-invoke.v0',
    provider_id: 'local.organize.v0',
    model: 'deterministic-organize-v0',
    purpose: 'owner-local-organize-draft',
    data_scope: { kind: 'owner-selected-note-text', max_chars: 8000 },
    budget: { max_input_chars: 8000, max_output_chars: 4000, max_wall_ms: 10000 },
    timeout_ms: 10000,
    cancel: { allowed: true, signal: 'owner-abort' },
    retention: { kind: 'ephemeral-draft', persist: false },
    included_text: 'Synthetic note text.',
    note_digest: sha256('Synthetic note text.'),
    draft_only: true,
    principal_id: 'owner.alice'
  };
  const receipt = buildAiProviderReceipt({
    invoke,
    suggestion: {
      title: 'Synthetic note', headings: ['Synthetic note'], bullets: ['Synthetic'],
      summary_text: 'Synthetic draft summary.', truncated: false, char_count: 24
    }
  });
  const create = (changes = {}) => createAiProviderDraftAttestation({
    invoke, receipt, attestorIdentity: signer, audienceId: 'owner.verifier',
    nonce: NONCE, issuedAt: T1, expiresAt: T4, ...changes
  });
  const check = (proof, changes = {}) => verifyAiProviderDraftAttestation(proof, {
    invoke, receipt, trustedAttestorPublicKey: pair.publicKey,
    expectedAttestorId: 'synthetic-attestor', expectedAudienceId: 'owner.verifier',
    expectedNonce: NONCE, at: T2, ...changes
  });
  return { pair, signer, invoke, receipt, create, check };
}

test('pinned synthetic attestor signs exact invoke and draft receipt with zero authority', () => {
  const f = fixture();
  const result = f.check(f.create());
  assert.equal(result.valid, true);
  assert.equal(result.provider_id, 'local.organize.v0');
  assert.equal(result.authority_effect, 'none');
  assert.equal(result.truth_claimed, false);
  assert.equal(result.live_provider_claimed, false);
  assert.equal(Object.hasOwn(result, 'receipt'), false);
  assert.equal(Object.hasOwn(result, 'included_text'), false);
});

test('swapped invoke, output, provider, model and principal reject', () => {
  const f = fixture();
  const proof = f.create();
  const invoke = structuredClone(f.invoke);
  invoke.purpose = 'other-purpose';
  assert.throws(() => f.check(proof, { invoke }), /invoke|digest|binding/i);
  const receipt = structuredClone(f.receipt);
  receipt.suggestion.summary_text = 'Replaced draft.';
  assert.throws(() => f.check(proof, { receipt }), /receipt|digest|binding/i);
  const validDifferentReceipt = buildAiProviderReceipt({
    invoke: f.invoke,
    suggestion: { ...f.receipt.suggestion, summary_text: 'Replaced draft.' }
  });
  assert.throws(() => f.check(proof, { receipt: validDifferentReceipt }), /receipt|digest|binding/i);
  for (const field of ['provider_id', 'model', 'principal_id']) {
    const changed = structuredClone(f.invoke);
    changed[field] = `other.${field}`;
    assert.throws(() => f.check(proof, { invoke: changed }), /receipt|invoke|binding/i);
    const matchingReceipt = buildAiProviderReceipt({ invoke: changed, suggestion: f.receipt.suggestion });
    assert.throws(() => f.check(proof, { invoke: changed, receipt: matchingReceipt }), /invoke|receipt|binding/i);
  }
});

test('wrong pinned signer key, audience, challenge and signature tamper reject', () => {
  const f = fixture();
  const proof = f.create();
  const other = generateKeyPairSync('ed25519');
  assert.throws(() => f.check(proof, { trustedAttestorPublicKey: other.publicKey }), /key|signature/i);
  assert.throws(() => f.check(proof, { expectedAttestorId: 'other-attestor' }), /attestor|key/i);
  assert.throws(() => f.check(proof, { expectedAudienceId: 'other.verifier' }), /audience/i);
  assert.throws(() => f.check(proof, { expectedNonce: 'different-challenge-001' }), /nonce/i);
  const tampered = structuredClone(proof);
  tampered.attestation.signature = `${tampered.attestation.signature[0] === 'A' ? 'B' : 'A'}${tampered.attestation.signature.slice(1)}`;
  assert.throws(() => f.check(tampered), /signature|digest/i);
});

test('future, expiry, overlong lifetime and consumed nonce reject', () => {
  const f = fixture();
  const proof = f.create();
  assert.throws(() => f.check(proof, { at: T0 }), /future/i);
  assert.throws(() => f.check(proof, { at: T4 }), /expired/i);
  assert.throws(() => f.create({ expiresAt: '2026-09-24T12:07:00.000Z' }), /lifetime|five minutes/i);
  const prior = f.check(proof);
  assert.throws(() => f.check(proof, { consumedNonceDigests: [prior.nonce_digest] }), /consumed|replay/i);
  const reissued = f.create({ issuedAt: T2 });
  assert.notEqual(reissued.proof_digest, proof.proof_digest);
  assert.throws(() => f.check(reissued, { consumedNonceDigests: [prior.nonce_digest] }), /consumed|replay/i);
});

test('unknown fields in signed material and recomputed receipt fail closed', () => {
  const f = fixture();
  const proof = f.create();
  const unknown = structuredClone(proof);
  unknown.authorized = true;
  assert.throws(() => f.check(unknown), /unsupported|unknown|field/i);
  const statement = structuredClone(proof);
  statement.statement.auto_approve = true;
  assert.throws(() => f.check(statement), /unsupported|unknown|field/i);
  const receipt = structuredClone(f.receipt);
  receipt.grant = 'forged';
  assert.throws(() => f.check(proof, { receipt }), /receipt|unknown|field/i);
  const invoke = structuredClone(f.invoke);
  invoke.grant = 'forged';
  assert.throws(() => f.check(proof, { invoke }), /invoke|unknown|field/i);
});
