import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createSyntheticReferenceAdapterManifest,
  createSyntheticReferenceGrantAuthority,
  createSyntheticReferenceGrant,
  createSyntheticReferenceRequest,
  runRuntimeAdapterReferenceConformance,
  SyntheticReferenceRuntimeAdapter,
  validateSyntheticReferenceAdapterManifest,
  verifyRuntimeAdapterReferenceConformanceEvidence,
  verifySyntheticReferenceReceipt
} from '../src/runtime-adapter-conformance.mjs';
import {
  RUNTIME_ADAPTER_CONTRACT_SHA256,
  verifyRuntimeAdapterContract
} from '../src/lib/runtime-adapter-contract.mjs';

const NOW = Date.UTC(2026, 7, 11, 20, 35, 0);
const REVISION = 'd'.repeat(40);

test('reference adapter manifest is immutable-source and fail-closed', () => {
  const contract = verifyRuntimeAdapterContract();
  assert.equal(contract.valid, true);
  assert.equal(contract.contract_sha256, RUNTIME_ADAPTER_CONTRACT_SHA256);
  assert.equal(contract.capability_promoted, false);
  const manifest = createSyntheticReferenceAdapterManifest({
    sourceRevision: REVISION
  });
  assert.equal(validateSyntheticReferenceAdapterManifest(manifest), true);
  assert.equal(manifest.compatibility.source_pin_required, true);
  assert.equal(manifest.contract.contract_sha256, RUNTIME_ADAPTER_CONTRACT_SHA256);
  assert.equal(manifest.compatibility.mutable_ref_allowed, false);
  assert.equal(manifest.authority.install_grants_authority, false);
  assert.equal(manifest.authority.runtime_may_self_authorize, false);
  assert.equal(manifest.authority.runtime_approvals_are_authoritative, false);
  assert.equal(manifest.capability_translation.unmapped_behavior, 'deny');
  assert.equal(manifest.execution.failure_mode, 'deny');
  assert.equal(manifest.execution.unknown_outcome, 'uncertain');

  const failOpen = structuredClone(manifest);
  failOpen.authority.install_grants_authority = true;
  assert.throws(
    () => validateSyntheticReferenceAdapterManifest(failOpen),
    /not fail closed/
  );
});

test('synthetic adapter completes only an exact granted request and signs a receipt', async () => {
  const manifest = createSyntheticReferenceAdapterManifest({
    sourceRevision: REVISION
  });
  const grantAuthority = createSyntheticReferenceGrantAuthority();
  const adapter = new SyntheticReferenceRuntimeAdapter({
    manifest,
    now: () => NOW,
    grantAuthority: grantAuthority.verifier
  });
  const installation = adapter.install();
  assert.deepEqual(installation, {
    installed: true,
    authority_granted: false,
    external_runtime_loaded: false,
    external_effects_enabled: false
  });

  const grant = createSyntheticReferenceGrant({
    grantId: 'grant:test-exact',
    principalId: 'principal:test-owner',
    adapterId: manifest.adapter_id,
    runtimeId: manifest.runtime.runtime_id,
    now: NOW,
    signer: grantAuthority.signer
  });
  adapter.registerGrant(grant);
  assert.throws(() => adapter.registerGrant(grant), /replay is not allowed/);
  const request = createSyntheticReferenceRequest({
    requestId: 'request:test-exact',
    principalId: grant.principal_id,
    grantId: grant.grant_id,
    idempotencyKey: 'idempotency:test-exact-0001'
  });
  const result = await adapter.execute(request);
  const receipt = verifySyntheticReferenceReceipt(result.receipt);

  assert.equal(result.state, 'completed');
  assert.equal(result.replayed, false);
  assert.equal(receipt.valid, true);
  assert.equal(receipt.external_effect_performed, false);
  assert.equal(receipt.production_conformance_claimed, false);
  assert.equal(result.receipt.contract.contract_sha256, RUNTIME_ADAPTER_CONTRACT_SHA256);
  assert.match(result.receipt.grant.attestation_digest, /^[a-f0-9]{64}$/);

  const replay = await adapter.execute(request);
  assert.equal(replay.replayed, true);
  assert.deepEqual(replay.receipt, result.receipt);

  const reused = await adapter.execute(createSyntheticReferenceRequest({
    requestId: 'request:test-reused-grant',
    principalId: grant.principal_id,
    grantId: grant.grant_id,
    idempotencyKey: 'idempotency:test-reused-grant-0001'
  }));
  assert.equal(reused.state, 'denied');
  assert.equal(reused.code, 'grant-consumed');

  const unexpectedField = structuredClone(result.receipt);
  unexpectedField.execution.secret = 'forbidden';
  assert.throws(
    () => verifySyntheticReferenceReceipt(unexpectedField),
    /fields are invalid/
  );
});

test('revocation and cancellation preempt the synthetic effect boundary', async () => {
  const manifest = createSyntheticReferenceAdapterManifest({
    sourceRevision: REVISION
  });
  const grantAuthority = createSyntheticReferenceGrantAuthority();
  const adapter = new SyntheticReferenceRuntimeAdapter({
    manifest,
    now: () => NOW,
    grantAuthority: grantAuthority.verifier
  });
  const revokedGrant = createSyntheticReferenceGrant({
    grantId: 'grant:test-revocation',
    principalId: 'principal:test-owner',
    adapterId: manifest.adapter_id,
    runtimeId: manifest.runtime.runtime_id,
    now: NOW,
    signer: grantAuthority.signer
  });
  adapter.registerGrant(revokedGrant);
  const revokedRequest = createSyntheticReferenceRequest({
    requestId: 'request:test-revocation',
    principalId: revokedGrant.principal_id,
    grantId: revokedGrant.grant_id,
    idempotencyKey: 'idempotency:test-revocation-0001'
  });
  const revoked = await adapter.execute(revokedRequest, {
    beforeEffect: ({ adapter: current }) => current.revokeGrant(revokedGrant.grant_id)
  });
  assert.equal(revoked.state, 'revoked');
  assert.equal(revoked.code, 'grant-revoked');
  assert.equal(revoked.receipt.external_effect_performed, false);

  const cancelGrant = createSyntheticReferenceGrant({
    grantId: 'grant:test-cancel',
    principalId: 'principal:test-owner',
    adapterId: manifest.adapter_id,
    runtimeId: manifest.runtime.runtime_id,
    now: NOW,
    signer: grantAuthority.signer
  });
  adapter.registerGrant(cancelGrant);
  const cancelRequest = createSyntheticReferenceRequest({
    requestId: 'request:test-cancel',
    principalId: cancelGrant.principal_id,
    grantId: cancelGrant.grant_id,
    idempotencyKey: 'idempotency:test-cancel-0001'
  });
  const cancelled = await adapter.execute(cancelRequest, {
    beforeEffect: ({ adapter: current }) => current.cancel(cancelRequest.request_id)
  });
  assert.equal(cancelled.state, 'cancelled');
  assert.equal(cancelled.code, 'cancelled-before-effect');
  assert.equal(cancelled.receipt.external_effect_performed, false);
});

test('signed reference conformance covers all negative cases without production claims', async () => {
  const evidence = await runRuntimeAdapterReferenceConformance({
    now: NOW,
    sourceRevision: REVISION
  });
  const result = verifyRuntimeAdapterReferenceConformanceEvidence(evidence);

  assert.equal(result.valid, true);
  assert.equal(result.check_count, 28);
  assert.equal(result.external_runtime_loaded, false);
  assert.equal(result.external_effects_performed, false);
  assert.equal(result.production_conformance_claimed, false);
  assert.equal(evidence.source.commit_bound, true);
  assert.equal(evidence.source.revision, REVISION);
  assert.ok(Object.values(evidence.checks).every(Boolean));

  await assert.rejects(
    () => runRuntimeAdapterReferenceConformance({
      now: NOW,
      sourceRevision: '',
      requireCommitBound: true
    }),
    /requires GITHUB_SHA/
  );

  const tampered = structuredClone(evidence);
  tampered.results.check_count -= 1;
  assert.throws(
    () => verifyRuntimeAdapterReferenceConformanceEvidence(tampered),
    /results are invalid/
  );
});
