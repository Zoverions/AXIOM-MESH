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

const NOW = Date.UTC(2026, 8, 3, 22, 30, 0);
const BUDGET = Object.freeze({
  max_requests_per_minute: 60,
  max_concurrent_requests: 1,
  max_execution_ms: 1_000,
  max_request_bytes: 4_096,
  max_response_bytes: 4_096
});

function recognizedAuthorizationDetails(overrides = {}) {
  return {
    type: 'axiom-runtime-effect.v1',
    runtime_operation: 'reference.echo',
    axiom_action: 'adapter.reference.echo',
    purpose: 'test.conformance',
    budget: BUDGET,
    requested_scopes: ['synthetic.read'],
    destinations: ['local:reference'],
    credential_handles: ['credential:synthetic-reference'],
    ...overrides
  };
}

function externalRequest({ suffix, grantId, authorizationDetails }) {
  return {
    requestId: `request:rt-auth-009-${suffix}`,
    principalId: 'principal:rt-auth-009',
    grantId,
    idempotencyKey: `idempotency:rt-auth-009-${suffix}-0001`,
    authorization_details: [authorizationDetails]
  };
}

test('recognized external authorization details map exactly into native effect constraints', () => {
  const translated = translateSyntheticExternalAuthorizationRequest(externalRequest({
    suffix: 'recognized',
    grantId: 'grant:rt-auth-009-recognized',
    authorizationDetails: recognizedAuthorizationDetails()
  }));

  assert.equal(translated.runtime_operation, 'reference.echo');
  assert.equal(translated.axiom_action, 'adapter.reference.echo');
  assert.deepEqual(translated.requested_scopes, ['synthetic.read']);
  assert.deepEqual(translated.destinations, ['local:reference']);
  assert.deepEqual(translated.credential_handles, ['credential:synthetic-reference']);
  assert.equal(Object.hasOwn(translated, 'budget'), false);
});

test('recognized authorization detail types still reject unmapped constraint axes', () => {
  assert.throws(
    () => translateSyntheticExternalAuthorizationRequest(externalRequest({
      suffix: 'unmapped-approval-floor',
      grantId: 'grant:rt-auth-009-unmapped-approval-floor',
      authorizationDetails: recognizedAuthorizationDetails({
        approval_floor: 'independent'
      })
    })),
    /unsupported authorization detail fields: approval_floor/
  );
});

test('translated external widening reaches native deny checks instead of being normalized away', async () => {
  const manifest = createSyntheticReferenceAdapterManifest();
  const grantAuthority = createSyntheticReferenceGrantAuthority();
  const adapter = new SyntheticReferenceRuntimeAdapter({
    manifest,
    now: () => NOW,
    grantAuthority: grantAuthority.verifier
  });

  async function executeMutation(suffix, authorizationDetails) {
    const grantId = `grant:rt-auth-009-${suffix}`;
    const grant = createSyntheticReferenceGrant({
      grantId,
      principalId: 'principal:rt-auth-009',
      adapterId: manifest.adapter_id,
      runtimeId: manifest.runtime.runtime_id,
      now: NOW,
      signer: grantAuthority.signer
    });
    adapter.registerGrant(grant);
    return adapter.execute(translateSyntheticExternalAuthorizationRequest(externalRequest({
      suffix,
      grantId,
      authorizationDetails
    })));
  }

  const operation = await executeMutation(
    'operation-widening',
    recognizedAuthorizationDetails({ runtime_operation: 'host.shell' })
  );
  assert.equal(operation.state, 'denied');
  assert.equal(operation.code, 'unmapped-operation');

  const action = await executeMutation(
    'action-widening',
    recognizedAuthorizationDetails({ axiom_action: 'adapter.reference.write' })
  );
  assert.equal(action.state, 'denied');
  assert.equal(action.code, 'action-mismatch');

  const scope = await executeMutation(
    'scope-widening',
    recognizedAuthorizationDetails({
      requested_scopes: ['synthetic.read', 'synthetic.admin']
    })
  );
  assert.equal(scope.state, 'denied');
  assert.equal(scope.code, 'scope-not-mapped');

  const destination = await executeMutation(
    'destination-widening',
    recognizedAuthorizationDetails({
      destinations: ['local:reference', 'https://unapproved.example']
    })
  );
  assert.equal(destination.state, 'denied');
  assert.equal(destination.code, 'destination-not-mapped');

  const credential = await executeMutation(
    'credential-widening',
    recognizedAuthorizationDetails({
      credential_handles: ['credential:synthetic-reference', 'credential:admin']
    })
  );
  assert.equal(credential.state, 'denied');
  assert.equal(credential.code, 'credential-handle-not-mapped');
});

test('unknown external authorization detail types fail closed', () => {
  assert.throws(
    () => translateSyntheticExternalAuthorizationRequest(externalRequest({
      suffix: 'unknown-type',
      grantId: 'grant:rt-auth-009-unknown-type',
      authorizationDetails: {
        type: 'axiom-unknown-constraint',
        resource: 'local:reference',
        requirement: 'must-preserve'
      }
    })),
    /unsupported authorization detail type: axiom-unknown-constraint/
  );
});
