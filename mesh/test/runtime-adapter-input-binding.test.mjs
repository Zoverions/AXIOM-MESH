import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createSyntheticReferenceAdapterManifest,
  createSyntheticReferenceGrantAuthority,
  createSyntheticReferenceGrant,
  createSyntheticReferenceRequest,
  SyntheticReferenceRuntimeAdapter
} from '../src/runtime-adapter-conformance.mjs';

const NOW = Date.UTC(2026, 8, 3, 22, 45, 0);
const AUTHORIZED_INPUT_SHA256 = 'a'.repeat(64);
const MUTATED_INPUT_SHA256 = 'b'.repeat(64);

test('signed runtime grant binds the exact consequential input digest', async () => {
  const manifest = createSyntheticReferenceAdapterManifest();
  const grantAuthority = createSyntheticReferenceGrantAuthority();
  const adapter = new SyntheticReferenceRuntimeAdapter({
    manifest,
    now: () => NOW,
    grantAuthority: grantAuthority.verifier
  });

  const grant = createSyntheticReferenceGrant({
    grantId: 'grant:rt-auth-010-input-bound',
    principalId: 'principal:rt-auth-010',
    adapterId: manifest.adapter_id,
    runtimeId: manifest.runtime.runtime_id,
    now: NOW,
    signer: grantAuthority.signer,
    inputSha256: AUTHORIZED_INPUT_SHA256
  });
  adapter.registerGrant(grant);

  const result = await adapter.execute(createSyntheticReferenceRequest({
    requestId: 'request:rt-auth-010-mutated-input',
    principalId: grant.principal_id,
    grantId: grant.grant_id,
    idempotencyKey: 'idempotency:rt-auth-010-mutated-input-0001',
    inputSha256: MUTATED_INPUT_SHA256
  }));

  assert.equal(result.state, 'denied');
  assert.equal(result.code, 'input-mismatch');
  assert.equal(result.receipt.external_effect_performed, false);
  assert.equal(result.receipt.request.input_sha256, MUTATED_INPUT_SHA256);
});
