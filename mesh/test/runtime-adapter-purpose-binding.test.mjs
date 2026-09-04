import assert from 'node:assert/strict';
import test from 'node:test';

import { canonicalJson, sha256 } from '../src/lib/canonical.mjs';
import {
  translateSyntheticExternalAuthorizationRequest
} from '../src/runtime-adapter-authorization-translation.mjs';
import {
  createSyntheticReferenceAdapterManifest,
  createSyntheticReferenceGrant,
  createSyntheticReferenceGrantAuthority,
  SyntheticReferenceRuntimeAdapter
} from '../src/runtime-adapter-conformance.mjs';

const NOW = Date.UTC(2026, 8, 4, 1, 0, 0);
const ACTION = 'adapter.reference.echo';
const PURPOSE = 'test.conformance';
const PRINCIPAL_ID = 'principal:rt-auth-014';
const DEFAULT_INPUT_SHA256 = sha256('synthetic-reference-input');

function expectedPurposeCommitment(purpose, inputSha256 = DEFAULT_INPUT_SHA256) {
  return sha256(canonicalJson({
    schema: 'axiom-effect-purpose-commitment.v1',
    axiom_action: ACTION,
    purpose,
    input_sha256: inputSha256
  }));
}

function authorizationDetail(overrides = {}) {
  return {
    type: 'axiom-runtime-effect.v1',
    runtime_operation: 'reference.echo',
    axiom_action: ACTION,
    purpose: PURPOSE,
    requested_scopes: ['synthetic.read'],
    destinations: ['local:reference'],
    credential_handles: ['credential:synthetic-reference'],
    ...overrides
  };
}

function externalRequest({ suffix, grantId, detail = authorizationDetail() }) {
  return {
    requestId: `request:rt-auth-014-${suffix}`,
    principalId: PRINCIPAL_ID,
    grantId,
    idempotencyKey: `idempotency:rt-auth-014-${suffix}-0001`,
    authorization_details: [detail]
  };
}

test('recognized external purpose is bound into the signed input commitment', () => {
  const translated = translateSyntheticExternalAuthorizationRequest(externalRequest({
    suffix: 'translated',
    grantId: 'grant:rt-auth-014-translated'
  }));

  assert.equal(translated.input_sha256, expectedPurposeCommitment(PURPOSE));
  assert.equal(Object.hasOwn(translated, 'purpose'), false);
  assert.equal(canonicalJson(translated).includes(PURPOSE), false);
});

test('recognized exact-effect authorization requires an explicit purpose', () => {
  const detail = authorizationDetail();
  delete detail.purpose;
  assert.throws(
    () => translateSyntheticExternalAuthorizationRequest(externalRequest({
      suffix: 'missing-purpose',
      grantId: 'grant:rt-auth-014-missing-purpose',
      detail
    })),
    /missing authorization detail fields: purpose/
  );
});

test('purpose widening cannot reuse the signed effect grant', async () => {
  const manifest = createSyntheticReferenceAdapterManifest();
  const grantAuthority = createSyntheticReferenceGrantAuthority();
  const adapter = new SyntheticReferenceRuntimeAdapter({
    manifest,
    now: () => NOW,
    grantAuthority: grantAuthority.verifier
  });

  const allowedGrantId = 'grant:rt-auth-014-purpose-allowed';
  const allowedRequest = translateSyntheticExternalAuthorizationRequest(externalRequest({
    suffix: 'allowed',
    grantId: allowedGrantId
  }));
  adapter.registerGrant(createSyntheticReferenceGrant({
    grantId: allowedGrantId,
    principalId: PRINCIPAL_ID,
    adapterId: manifest.adapter_id,
    runtimeId: manifest.runtime.runtime_id,
    now: NOW,
    inputSha256: allowedRequest.input_sha256,
    signer: grantAuthority.signer
  }));
  const allowed = await adapter.execute(allowedRequest);
  assert.equal(allowed.state, 'completed');

  const widenedGrantId = 'grant:rt-auth-014-purpose-widened';
  const authorizedRequest = translateSyntheticExternalAuthorizationRequest(externalRequest({
    suffix: 'widened-authorized',
    grantId: widenedGrantId
  }));
  const widenedRequest = translateSyntheticExternalAuthorizationRequest(externalRequest({
    suffix: 'widened-attempted',
    grantId: widenedGrantId,
    detail: authorizationDetail({ purpose: 'research.assist' })
  }));
  assert.notEqual(widenedRequest.input_sha256, authorizedRequest.input_sha256);

  adapter.registerGrant(createSyntheticReferenceGrant({
    grantId: widenedGrantId,
    principalId: PRINCIPAL_ID,
    adapterId: manifest.adapter_id,
    runtimeId: manifest.runtime.runtime_id,
    now: NOW,
    inputSha256: authorizedRequest.input_sha256,
    signer: grantAuthority.signer
  }));
  const widened = await adapter.execute(widenedRequest);
  assert.equal(widened.state, 'denied');
  assert.equal(widened.code, 'input-mismatch');
  assert.equal(widened.receipt.external_effect_performed, false);
});
