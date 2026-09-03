import assert from 'node:assert/strict';
import test from 'node:test';
import { canonicalJson, sha256 } from '../src/lib/canonical.mjs';
import { createSyntheticReferenceRequest } from '../src/runtime-adapter-conformance.mjs';

const ACTION = 'adapter.reference.echo';
const INPUT_SCHEMA_REF = 'synthetic://schemas/reference-echo-input.v1';

function expectedCommitment(structuredArguments) {
  return sha256(canonicalJson({
    schema: 'axiom-effect-input-commitment.v1',
    axiom_action: ACTION,
    input_schema_ref: INPUT_SCHEMA_REF,
    arguments: structuredArguments
  }));
}

test('structured input commitment is domain-separated and object-order stable', () => {
  const first = {
    message: 'hello',
    options: {
      mode: 'strict',
      targets: ['alpha', 'beta']
    }
  };
  const reordered = {
    options: {
      targets: ['alpha', 'beta'],
      mode: 'strict'
    },
    message: 'hello'
  };

  const requestA = createSyntheticReferenceRequest({
    requestId: 'request:rt-auth-011-order-a',
    principalId: 'principal:rt-auth-011',
    grantId: 'grant:rt-auth-011-order',
    idempotencyKey: 'idempotency:rt-auth-011-order-a',
    structuredArguments: first
  });
  const requestB = createSyntheticReferenceRequest({
    requestId: 'request:rt-auth-011-order-b',
    principalId: 'principal:rt-auth-011',
    grantId: 'grant:rt-auth-011-order',
    idempotencyKey: 'idempotency:rt-auth-011-order-b',
    structuredArguments: reordered
  });

  assert.equal(requestA.input_sha256, expectedCommitment(first));
  assert.equal(requestB.input_sha256, expectedCommitment(reordered));
  assert.equal(requestA.input_sha256, requestB.input_sha256);
});
