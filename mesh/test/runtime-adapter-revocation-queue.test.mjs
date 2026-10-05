import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createSyntheticReferenceAdapterManifest,
  createSyntheticReferenceGrantAuthority,
  createSyntheticReferenceGrant,
  createSyntheticReferenceReceiptAuthority,
  createSyntheticReferenceRequest,
  SyntheticReferenceRuntimeAdapter,
  verifySyntheticReferenceReceipt
} from '../src/runtime-adapter-conformance.mjs';

const NOW = Date.UTC(2026, 8, 20, 22, 30, 0);
const REVISION = 'e'.repeat(40);

function createFixture(label) {
  const manifest = createSyntheticReferenceAdapterManifest({
    sourceRevision: REVISION
  });
  const grantAuthority = createSyntheticReferenceGrantAuthority();
  const receiptAuthority = createSyntheticReferenceReceiptAuthority();
  const adapter = new SyntheticReferenceRuntimeAdapter({
    manifest,
    now: () => NOW,
    receiptSigner: receiptAuthority.signer,
    grantAuthority: grantAuthority.verifier
  });
  const grant = createSyntheticReferenceGrant({
    grantId: `grant:${label}`,
    principalId: 'principal:test-owner',
    adapterId: manifest.adapter_id,
    runtimeId: manifest.runtime.runtime_id,
    now: NOW,
    signer: grantAuthority.signer
  });
  adapter.registerGrant(grant);
  const request = createSyntheticReferenceRequest({
    requestId: `request:${label}`,
    principalId: grant.principal_id,
    grantId: grant.grant_id,
    idempotencyKey: `idempotency:${label}-0001`
  });
  return { adapter, grant, request, receiptAuthority };
}

test('queued work admitted before revocation cannot later complete or revive on retry', async () => {
  const { adapter, grant, request, receiptAuthority } = createFixture('queued-revocation');

  let signalAdmitted;
  let releaseQueuedWork;
  const admitted = new Promise(resolve => {
    signalAdmitted = resolve;
  });
  const holdAtEffectBoundary = new Promise(resolve => {
    releaseQueuedWork = resolve;
  });

  const queued = adapter.execute(request, {
    beforeEffect: async () => {
      signalAdmitted();
      await holdAtEffectBoundary;
    }
  });

  await admitted;
  assert.equal(adapter.revokeGrant(grant.grant_id), true);
  releaseQueuedWork();

  const terminal = await queued;
  assert.equal(terminal.state, 'revoked');
  assert.equal(terminal.code, 'grant-revoked');
  assert.equal(terminal.receipt.external_effect_performed, false);
  assert.equal(terminal.receipt.effect.output_sha256, null);
  assert.equal(terminal.receipt.execution.state, 'revoked');
  assert.equal(
    verifySyntheticReferenceReceipt(
      terminal.receipt,
      receiptAuthority.verifier
    ).valid,
    true
  );

  const cachedRetry = await adapter.execute(request);
  assert.equal(cachedRetry.replayed, true);
  assert.equal(cachedRetry.state, 'revoked');
  assert.deepEqual(cachedRetry.receipt, terminal.receipt);

  const freshRetry = await adapter.execute({
    ...request,
    idempotency_key: 'idempotency:queued-revocation-0002'
  });
  assert.equal(freshRetry.replayed, false);
  assert.equal(freshRetry.state, 'revoked');
  assert.equal(freshRetry.code, 'grant-revoked');
  assert.equal(freshRetry.receipt.external_effect_performed, false);
  assert.equal(freshRetry.receipt.effect.output_sha256, null);
});

test('queued work cancelled before commit preserves a terminal no-effect receipt on stale replay', async () => {
  const { adapter, request, receiptAuthority } = createFixture('queued-cancellation');

  let signalAdmitted;
  let releaseQueuedWork;
  const admitted = new Promise(resolve => {
    signalAdmitted = resolve;
  });
  const holdAtEffectBoundary = new Promise(resolve => {
    releaseQueuedWork = resolve;
  });

  const queued = adapter.execute(request, {
    beforeEffect: async () => {
      signalAdmitted();
      await holdAtEffectBoundary;
    }
  });

  await admitted;
  adapter.cancel(request.request_id);
  releaseQueuedWork();

  const terminal = await queued;
  assert.equal(terminal.state, 'cancelled');
  assert.equal(terminal.code, 'cancelled-before-effect');
  assert.equal(terminal.receipt.external_effect_performed, false);
  assert.equal(terminal.receipt.effect.output_sha256, null);
  assert.equal(terminal.receipt.execution.state, 'cancelled');
  assert.equal(
    verifySyntheticReferenceReceipt(
      terminal.receipt,
      receiptAuthority.verifier
    ).valid,
    true
  );

  const cachedRetry = await adapter.execute(request);
  assert.equal(cachedRetry.replayed, true);
  assert.equal(cachedRetry.state, 'cancelled');
  assert.deepEqual(cachedRetry.receipt, terminal.receipt);
});
