import assert from 'node:assert/strict';
import test from 'node:test';

import { canonicalJson, sha256 } from '../src/lib/canonical.mjs';
import * as translation from '../src/runtime-adapter-authorization-translation.mjs';

const ACTION = 'adapter.reference.echo';
const INPUT_SCHEMA_REF = 'synthetic://schemas/reference-echo-input.v1';

function authorizationDetail() {
  return {
    type: 'axiom-runtime-effect.v1',
    runtime_operation: 'reference.echo',
    axiom_action: ACTION,
    requested_scopes: ['synthetic.read'],
    destinations: ['local:reference'],
    credential_handles: ['credential:synthetic-reference']
  };
}

function expectedCommitment(argumentsObject) {
  return sha256(canonicalJson({
    schema: 'axiom-effect-input-commitment.v1',
    axiom_action: ACTION,
    input_schema_ref: INPUT_SCHEMA_REF,
    arguments: argumentsObject
  }));
}

test('MCP tools/call projects schema-valid arguments into native effect authority', () => {
  assert.equal(
    typeof translation.translateSyntheticMcpToolCallAuthorizationRequest,
    'function'
  );

  const argumentsObject = {
    message: 'hello',
    options: {
      mode: 'strict',
      targets: ['alpha', 'beta']
    }
  };
  const translated = translation.translateSyntheticMcpToolCallAuthorizationRequest({
    requestId: 'request:rt-auth-012-valid',
    principalId: 'principal:rt-auth-012',
    grantId: 'grant:rt-auth-012-valid',
    idempotencyKey: 'idempotency:rt-auth-012-valid',
    authorization_details: [authorizationDetail()],
    mcpRequest: {
      jsonrpc: '2.0',
      id: 'mcp:rt-auth-012-valid',
      method: 'tools/call',
      params: {
        name: 'reference.echo',
        arguments: argumentsObject,
        _meta: {
          'io.modelcontextprotocol/clientInfo': {
            name: 'axiom-conformance',
            version: '1.0.0'
          }
        }
      }
    }
  });

  assert.equal(translated.runtime_operation, 'reference.echo');
  assert.equal(translated.axiom_action, ACTION);
  assert.equal(translated.input_sha256, expectedCommitment(argumentsObject));
  assert.equal(Object.hasOwn(translated, 'mcpRequest'), false);
  assert.equal(canonicalJson(translated).includes('hello'), false);
});
