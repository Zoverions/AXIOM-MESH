import assert from 'node:assert/strict';
import test from 'node:test';

import {
  RUNTIME_ADAPTER_CONTRACT_SHA256,
  verifyRuntimeAdapterContract
} from '../src/lib/runtime-adapter-contract.mjs';
import { digestObject, sha256 } from '../src/lib/canonical.mjs';
import {
  HERMES_AXIOM_ACTION,
  HERMES_PIN_COMMIT,
  HERMES_PIN_VERSION,
  HERMES_RUNTIME_OPERATION,
  HermesIdentityFixtureAdapter,
  createHermesIdentityAdapterManifest,
  createHermesIdentityFixtureAuthorities,
  createHermesIdentityFixtureGrant,
  createHermesIdentityFixtureRequest,
  loadHermesIdentityPinProfile,
  pinnedHermesIdentityFixture,
  rejectHermesRuntimeOperation,
  validateHermesCodeIdentityObservation,
  verifyHermesIdentityFixtureReceipt
} from '../src/lib/hermes-identity-fixture-adapter.mjs';

const NOW = Date.UTC(2026, 8, 5, 21, 40, 0);

function buildAdapter() {
  const profile = loadHermesIdentityPinProfile();
  const manifest = createHermesIdentityAdapterManifest({ profile });
  const authorities = createHermesIdentityFixtureAuthorities();
  const adapter = new HermesIdentityFixtureAdapter({
    profile,
    manifest,
    now: () => NOW,
    receiptSigner: authorities.receipt.signer,
    grantAuthority: authorities.grant.verifier
  });
  return { profile, manifest, authorities, adapter };
}

test('Hermes identity pin fixture records exact provisional pin and profile constraints', () => {
  const profile = loadHermesIdentityPinProfile();
  assert.equal(profile.upstream.immutable_commit, HERMES_PIN_COMMIT);
  assert.equal(profile.upstream.project_version, HERMES_PIN_VERSION);
  assert.equal(profile.pin_accepted, false);
  assert.equal(profile.production_certification_claimed, false);
  assert.equal(profile.live_hermes_spawned, false);
  assert.equal(profile.execution_profile.network, 'disabled');
  assert.equal(profile.execution_profile.subprocess_spawn, false);
  assert.equal(profile.execution_profile.driver, 'fixture-backed');
  assert.deepEqual(profile.first_operation.allowed_fields, [
    'sha',
    'short_sha',
    'version',
    'source'
  ]);
  assert.deepEqual(profile.first_operation.rejected_operations, [
    'hermes.dump',
    'hermes dump'
  ]);
});

test('exact pinned identity observation is accepted and field-bounded', () => {
  const identity = validateHermesCodeIdentityObservation(pinnedHermesIdentityFixture());
  assert.equal(identity.sha, HERMES_PIN_COMMIT);
  assert.equal(identity.short_sha, HERMES_PIN_COMMIT.slice(0, 8));
  assert.equal(identity.version, HERMES_PIN_VERSION);
  assert.equal(identity.source, 'git');
  assert.deepEqual(Object.keys(identity).sort(), [
    'sha',
    'short_sha',
    'source',
    'version'
  ]);
});

test('build-file source is accepted only when SHA still equals the provisional pin', () => {
  const identity = validateHermesCodeIdentityObservation({
    ...pinnedHermesIdentityFixture(),
    source: 'build-file'
  });
  assert.equal(identity.source, 'build-file');
  assert.equal(identity.sha, HERMES_PIN_COMMIT);
});

test('unknown identity fails closed', () => {
  assert.throws(
    () => validateHermesCodeIdentityObservation({
      sha: null,
      short_sha: null,
      version: HERMES_PIN_VERSION,
      source: 'unknown'
    }),
    /unknown|fail closed/i
  );
});

test('SHA mismatch against provisional pin is denied', () => {
  const forged = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
  assert.throws(
    () => validateHermesCodeIdentityObservation({
      sha: forged,
      short_sha: forged.slice(0, 8),
      version: HERMES_PIN_VERSION,
      source: 'git'
    }),
    /does not match provisional pin/
  );
});

test('forged .hermes_build_sha inconsistent with pin is denied', () => {
  const forged = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
  assert.throws(
    () => validateHermesCodeIdentityObservation({
      sha: forged,
      short_sha: forged.slice(0, 8),
      version: HERMES_PIN_VERSION,
      source: 'build-file'
    }),
    /does not match provisional pin/
  );
});

test('extra identity fields are rejected (field bounding)', () => {
  assert.throws(
    () => validateHermesCodeIdentityObservation({
      ...pinnedHermesIdentityFixture(),
      provider: 'openai',
      api_key_present: true
    }),
    /fields are invalid/
  );
});

test('hermes dump and broader diagnostics are explicitly rejected', () => {
  assert.throws(
    () => rejectHermesRuntimeOperation('hermes dump'),
    /dump|rejected/i
  );
  assert.throws(
    () => rejectHermesRuntimeOperation('hermes.dump'),
    /dump|rejected/i
  );
  assert.equal(
    rejectHermesRuntimeOperation(HERMES_RUNTIME_OPERATION),
    HERMES_RUNTIME_OPERATION
  );
});

test('fixture adapter completes pin-matching identity and binds contract + manifest digests', async () => {
  const { profile, manifest, authorities, adapter } = buildAdapter();
  const install = adapter.install();
  assert.equal(install.authority_granted, false);
  assert.equal(install.live_hermes_spawned, false);
  assert.equal(install.production_conformance_claimed, false);
  assert.equal(install.pin_accepted, false);

  const contract = verifyRuntimeAdapterContract();
  assert.equal(contract.contract_sha256, RUNTIME_ADAPTER_CONTRACT_SHA256);

  const grant = createHermesIdentityFixtureGrant({
    grantId: 'grant:hermes-identity-ok',
    principalId: 'principal:hermes-identity',
    adapterId: manifest.adapter_id,
    runtimeId: manifest.runtime.runtime_id,
    now: NOW,
    signer: authorities.grant.signer
  });
  adapter.registerGrant(grant);

  const outcome = await adapter.execute(
    createHermesIdentityFixtureRequest({
      requestId: 'request:hermes-identity-ok',
      principalId: 'principal:hermes-identity',
      grantId: grant.grant_id,
      idempotencyKey: 'idempotency:hermes-identity-ok-0001'
    }),
    { identityFixture: pinnedHermesIdentityFixture() }
  );

  assert.equal(outcome.state, 'completed');
  assert.equal(outcome.code, 'hermes-identity-fixture-completed');
  assert.equal(outcome.receipt.contract.contract_sha256, RUNTIME_ADAPTER_CONTRACT_SHA256);
  assert.equal(outcome.receipt.manifest_digest, digestObject(manifest));
  assert.equal(outcome.receipt.pin_digest, digestObject(profile));
  assert.equal(outcome.receipt.runtime.source_commit, HERMES_PIN_COMMIT);
  assert.equal(outcome.receipt.identity.sha, HERMES_PIN_COMMIT);
  assert.equal(outcome.receipt.identity.version, HERMES_PIN_VERSION);
  assert.equal(outcome.receipt.live_hermes_spawned, false);
  assert.equal(outcome.receipt.production_conformance_claimed, false);
  assert.equal(outcome.receipt.pin_accepted, false);
  assert.equal(
    outcome.receipt.request.runtime_operation,
    HERMES_RUNTIME_OPERATION
  );
  assert.equal(outcome.receipt.request.axiom_action, HERMES_AXIOM_ACTION);

  assert.equal(
    verifyHermesIdentityFixtureReceipt(
      outcome.receipt,
      adapter.receiptAuthority,
      manifest
    ),
    true
  );
});

test('fixture adapter denies pin-mismatched identity and still binds contract digest on denial receipt', async () => {
  const { manifest, authorities, adapter } = buildAdapter();
  const grant = createHermesIdentityFixtureGrant({
    grantId: 'grant:hermes-identity-mismatch',
    principalId: 'principal:hermes-identity',
    adapterId: manifest.adapter_id,
    runtimeId: manifest.runtime.runtime_id,
    now: NOW,
    signer: authorities.grant.signer
  });
  adapter.registerGrant(grant);

  const forged = 'cccccccccccccccccccccccccccccccccccccccc';
  const outcome = await adapter.execute(
    createHermesIdentityFixtureRequest({
      requestId: 'request:hermes-identity-mismatch',
      principalId: 'principal:hermes-identity',
      grantId: grant.grant_id,
      idempotencyKey: 'idempotency:hermes-identity-mismatch-0001'
    }),
    {
      identityFixture: {
        sha: forged,
        short_sha: forged.slice(0, 8),
        version: HERMES_PIN_VERSION,
        source: 'git'
      }
    }
  );

  assert.equal(outcome.state, 'denied');
  assert.equal(outcome.code, 'identity-pin-mismatch');
  assert.equal(outcome.receipt.identity, null);
  assert.equal(outcome.receipt.contract.contract_sha256, RUNTIME_ADAPTER_CONTRACT_SHA256);
  assert.equal(outcome.receipt.manifest_digest, digestObject(manifest));
  assert.equal(outcome.receipt.production_conformance_claimed, false);
});

test('receipt tampering is rejected by verifier', async () => {
  const { manifest, authorities, adapter } = buildAdapter();
  const grant = createHermesIdentityFixtureGrant({
    grantId: 'grant:hermes-identity-tamper',
    principalId: 'principal:hermes-identity',
    adapterId: manifest.adapter_id,
    runtimeId: manifest.runtime.runtime_id,
    now: NOW,
    signer: authorities.grant.signer
  });
  adapter.registerGrant(grant);
  const outcome = await adapter.execute(
    createHermesIdentityFixtureRequest({
      requestId: 'request:hermes-identity-tamper',
      principalId: 'principal:hermes-identity',
      grantId: grant.grant_id,
      idempotencyKey: 'idempotency:hermes-identity-tamper-0001'
    }),
    { identityFixture: pinnedHermesIdentityFixture() }
  );

  const tampered = structuredClone(outcome.receipt);
  tampered.execution.state = 'failed';
  assert.throws(
    () => verifyHermesIdentityFixtureReceipt(
      tampered,
      adapter.receiptAuthority,
      manifest
    ),
    /signature is invalid|invariants are invalid/
  );
});

test('forged build-sha fixture is denied through the adapter path', async () => {
  const { manifest, authorities, adapter } = buildAdapter();
  const grant = createHermesIdentityFixtureGrant({
    grantId: 'grant:hermes-identity-forged-build',
    principalId: 'principal:hermes-identity',
    adapterId: manifest.adapter_id,
    runtimeId: manifest.runtime.runtime_id,
    now: NOW,
    signer: authorities.grant.signer
  });
  adapter.registerGrant(grant);
  const forged = 'dddddddddddddddddddddddddddddddddddddddd';
  const outcome = await adapter.execute(
    createHermesIdentityFixtureRequest({
      requestId: 'request:hermes-identity-forged-build',
      principalId: 'principal:hermes-identity',
      grantId: grant.grant_id,
      idempotencyKey: 'idempotency:hermes-identity-forged-build-0001'
    }),
    {
      identityFixture: {
        sha: forged,
        short_sha: forged.slice(0, 8),
        version: HERMES_PIN_VERSION,
        source: 'build-file'
      }
    }
  );
  assert.equal(outcome.state, 'denied');
  assert.equal(outcome.code, 'identity-pin-mismatch');
});

test('manifest research non-claims stay fail-closed', () => {
  const manifest = createHermesIdentityAdapterManifest();
  assert.equal(manifest.research_non_claims.fixture_backed, true);
  assert.equal(manifest.research_non_claims.live_hermes_spawned, false);
  assert.equal(manifest.research_non_claims.production_conformance_claimed, false);
  assert.equal(manifest.research_non_claims.pin_accepted, false);
  assert.equal(manifest.runtime.source_commit, HERMES_PIN_COMMIT);
  assert.equal(
    manifest.capability_translation.mappings[0].runtime_operation,
    HERMES_RUNTIME_OPERATION
  );
  assert.deepEqual(
    manifest.capability_translation.mappings[0].credential_handles,
    []
  );
  // artifact digest is deterministic for the pin
  assert.equal(
    manifest.implementation.artifact_sha256,
    sha256(`hermes-identity-fixture-adapter\n${HERMES_PIN_COMMIT}`)
  );
});
