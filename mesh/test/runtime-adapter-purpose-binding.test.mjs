import assert from 'node:assert/strict';
import test from 'node:test';

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
const PURPOSE = 'test.conformance';
const PRINCIPAL_ID = 'principal:rt-auth-014';

function authorizationDetail(overrides = {}) {
  return {
    type: 'axiom-runtime-effect.v1',
    runtime_operation: 'reference.echo',
    axiom_action: 'adapter.reference.echo',
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

test('recognized external purpose maps into the native effect request', () => {
  const translated = translateSyntheticExternalAuthorizationRequest(externalRequest({
    suffix: 'translated',
    grantId: 'grant:rt-auth-014-translated'
  }));

  assert.equal(translated.purpose, PURPOSE);
});

test('purpose widening is denied before synthetic effect completion', async () => {
  const manifest = createSyntheticReferenceAdapterManifest();
  const grantAuthority = createSyntheticReferenceGrantAuthority();
  const adapter = new SyntheticReferenceRuntimeAdapter({
    manifest,
    now: () => NOW,
    grantAuthority: grantAuthority.verifier
  });
  const grantId = 'grant:rt-auth-014-purpose';
  adapter.registerGrant(createSyntheticReferenceGrant({
    grantId,
    principalId: PRINCIPAL_ID,
    adapterId: manifest.adapter_id,
    runtimeId: manifest.runtime.runtime_id,
    now: NOW,
    purpose: PURPOSE,
    signer: grantAuthority.signer
  }));

  const allowed = await adapter.execute(
    translateSyntheticExternalAuthorizationRequest(externalRequest({
      suffix: 'allowed',
      grantId
    }))
  );
  assert.equal(allowed.state, 'completed');

  const widenedGrantId = 'grant:rt-auth-014-purpose-widened';
  adapter.registerGrant(createSyntheticReferenceGrant({
    grantId: widenedGrantId,
    principalId: PRINCIPAL_ID,
    adapterId: manifest.adapter_id,
    runtimeId: manifest.runtime.runtime_id,
    now: NOW,
    purpose: PURPOSE,
    signer: grantAuthority.signer
  }));
  const widened = await adapter.execute(
    translateSyntheticExternalAuthorizationRequest(externalRequest({
      suffix: 'widened',
      grantId: widenedGrantId,
      detail: authorizationDetail({ purpose: 'research.assist' })
    }))
  );
  assert.equal(widened.state, 'denied');
  assert.equal(widened.code, 'purpose-not-mapped');
});
