import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createSyntheticReferenceRequest
} from '../src/runtime-adapter-conformance.mjs';

test('external authorization constraints cannot silently disappear during request translation', () => {
  assert.throws(
    () => createSyntheticReferenceRequest({
      requestId: 'request:rt-auth-009-unknown-constraint',
      principalId: 'principal:rt-auth-009',
      grantId: 'grant:rt-auth-009',
      idempotencyKey: 'idempotency:rt-auth-009-0001',
      authorization_details: [{
        type: 'axiom-unknown-constraint',
        resource: 'local:reference',
        requirement: 'must-preserve'
      }]
    }),
    /unsupported authorization translation fields: authorization_details/
  );
});
