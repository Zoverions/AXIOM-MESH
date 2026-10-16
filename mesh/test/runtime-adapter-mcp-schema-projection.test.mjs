import assert from 'node:assert/strict';
import test from 'node:test';

import { canonicalJson, sha256 } from '../src/lib/canonical.mjs';
import {
  translateSyntheticMcpToolCallAuthorizationRequest
} from '../src/runtime-adapter-authorization-translation.mjs';
import {
  createSyntheticReferenceAdapterManifest,
  createSyntheticReferenceGrant,
  createSyntheticReferenceGrantAuthority,
  SyntheticReferenceRuntimeAdapter
} from '../src/runtime-adapter-conformance.mjs';

const NOW = Date.UTC(2026, 8, 3, 23, 40, 0);
const ACTION = 'adapter.reference.echo';
const INPUT_SCHEMA_REF = 'synthetic://schemas/reference-echo-input.v1';
const PURPOSE = 'test.conformance';
const PRINCIPAL_ID = 'principal:rt-auth-012';
const BUDGET = Object.freeze({
  max_requests_per_minute: 60,
  max_concurrent_requests: 1,
  max_execution_ms: 1_000,
  max_request_bytes: 4_096,
  max_response_bytes: 4_096
});

function authorizationDetail(overrides = {}) {
  return {
    type: 'axiom-runtime-effect.v1',
    runtime_operation: 'reference.echo',
    axiom_action: ACTION,
    purpose: PURPOSE,
    budget: BUDGET,
    requested_scopes: ['synthetic.read'],
    destinations: ['local:reference'],
    credential_handles: ['credential:synthetic-reference'],
    ...overrides
  };
}

function expectedCommitment(argumentsObject) {
  const structuredInputSha256 = sha256(canonicalJson({
    schema: 'axiom-effect-input-commitment.v1',
    axiom_action: ACTION,
    input_schema_ref: INPUT_SCHEMA_REF,
    arguments: argumentsObject
  }));
  const purposeBoundInputSha256 = sha256(canonicalJson({
    schema: 'axiom-effect-purpose-commitment.v1',
    axiom_action: ACTION,
    purpose: PURPOSE,
    input_sha256: structuredInputSha256
  }));
  return sha256(canonicalJson({
    schema: 'axiom-effect-budget-commitment.v1',
    axiom_action: ACTION,
    budget: BUDGET,
    input_sha256: purposeBoundInputSha256
  }));
}

function mcpRequest({
  id = 'mcp:rt-auth-012',
  name = 'reference.echo',
  argumentsObject = { message: 'hello' },
  meta,
  params = {},
  request = {}
} = {}) {
  return {
    jsonrpc: '2.0',
    id,
    method: 'tools/call',
    params: {
      name,
      arguments: argumentsObject,
      ...(meta === undefined ? {} : { _meta: meta }),
      ...params
    },
    ...request
  };
}

function translatedRequest({
  suffix,
  grantId = `grant:rt-auth-012-${suffix}`,
  detail = authorizationDetail(),
  request = mcpRequest()
}) {
  return translateSyntheticMcpToolCallAuthorizationRequest({
    requestId: `request:rt-auth-012-${suffix}`,
    principalId: PRINCIPAL_ID,
    grantId,
    idempotencyKey: `idempotency:rt-auth-012-${suffix}`,
    authorization_details: [detail],
    mcpRequest: request
  });
}

test('MCP tools/call projects schema-valid arguments into native effect authority', () => {
  const argumentsObject = {
    message: 'hello',
    options: {
      mode: 'strict',
      targets: ['alpha', 'beta']
    }
  };
  const translated = translatedRequest({
    suffix: 'valid',
    request: mcpRequest({
      argumentsObject,
      meta: {
        'io.modelcontextprotocol/clientInfo': {
          name: 'axiom-conformance',
          version: '1.0.0'
        }
      }
    })
  });

  assert.equal(translated.runtime_operation, 'reference.echo');
  assert.equal(translated.axiom_action, ACTION);
  assert.equal(translated.input_sha256, expectedCommitment(argumentsObject));
  assert.equal(Object.hasOwn(translated, 'mcpRequest'), false);
  assert.equal(Object.hasOwn(translated, 'budget'), false);
  assert.equal(canonicalJson(translated).includes('hello'), false);
  assert.equal(canonicalJson(translated).includes(PURPOSE), false);
  assert.equal(canonicalJson(translated).includes('max_execution_ms'), false);
});

test('MCP metadata is non-authoritative and object-key order is canonical', () => {
  const firstArguments = {
    message: 'hello',
    options: {
      mode: 'strict',
      targets: ['alpha', 'beta']
    }
  };
  const reorderedArguments = {
    options: {
      targets: ['alpha', 'beta'],
      mode: 'strict'
    },
    message: 'hello'
  };
  const first = translatedRequest({
    suffix: 'meta-first',
    request: mcpRequest({
      argumentsObject: firstArguments,
      meta: { trace: 'first', retry: 1 }
    })
  });
  const second = translatedRequest({
    suffix: 'meta-second',
    request: mcpRequest({
      argumentsObject: reorderedArguments,
      meta: { retry: 99, trace: 'second' }
    })
  });

  assert.equal(first.input_sha256, second.input_sha256);
  assert.equal(first.input_sha256, expectedCommitment(firstArguments));
});

test('MCP projection rejects unsupported wrapper, request, and parameter dimensions', () => {
  assert.throws(
    () => translateSyntheticMcpToolCallAuthorizationRequest({
      requestId: 'request:rt-auth-012-wrapper-field',
      principalId: PRINCIPAL_ID,
      grantId: 'grant:rt-auth-012-wrapper-field',
      idempotencyKey: 'idempotency:rt-auth-012-wrapper-field',
      authorization_details: [authorizationDetail()],
      mcpRequest: mcpRequest(),
      inputSha256: 'a'.repeat(64)
    }),
    /unsupported MCP authorization translation fields: inputSha256/
  );

  assert.throws(
    () => translatedRequest({
      suffix: 'request-field',
      request: mcpRequest({ request: { extra: true } })
    }),
    /unsupported MCP request fields: extra/
  );

  assert.throws(
    () => translatedRequest({
      suffix: 'param-field',
      request: mcpRequest({ params: { inputResponses: ['approved'] } })
    }),
    /unsupported MCP tools\/call params fields: inputResponses/
  );
});

test('MCP projection requires a consequential tools/call request identity and method', () => {
  assert.throws(
    () => translatedRequest({
      suffix: 'wrong-method',
      request: mcpRequest({ request: { method: 'tools/list' } })
    }),
    /MCP request method must be tools\/call/
  );

  assert.throws(
    () => translatedRequest({
      suffix: 'null-id',
      request: mcpRequest({ id: null })
    }),
    /MCP request id must be a non-empty string or safe integer/
  );

  assert.throws(
    () => translatedRequest({
      suffix: 'fractional-id',
      request: mcpRequest({ id: 1.5 })
    }),
    /MCP request id must be a non-empty string or safe integer/
  );
});

test('MCP tool identity cannot be substituted or silently normalized', () => {
  assert.throws(
    () => translatedRequest({
      suffix: 'tool-mismatch',
      request: mcpRequest({ name: 'reference.other' })
    }),
    /MCP tool name must match authorization detail runtime_operation/
  );

  assert.throws(
    () => translatedRequest({
      suffix: 'unknown-tool',
      detail: authorizationDetail({ runtime_operation: 'reference.other' }),
      request: mcpRequest({ name: 'reference.other' })
    }),
    /unsupported MCP tool name: reference.other/
  );
});

test('reference.echo schema rejects missing, unknown, and mistyped arguments', () => {
  assert.throws(
    () => translatedRequest({
      suffix: 'missing-message',
      request: mcpRequest({ argumentsObject: {} })
    }),
    /reference.echo arguments require message/
  );

  assert.throws(
    () => translatedRequest({
      suffix: 'unknown-argument',
      request: mcpRequest({
        argumentsObject: { message: 'hello', admin: true }
      })
    }),
    /unsupported reference.echo argument fields: admin/
  );

  assert.throws(
    () => translatedRequest({
      suffix: 'wrong-message-type',
      request: mcpRequest({ argumentsObject: { message: 7 } })
    }),
    /reference.echo arguments.message must be a string/
  );
});

test('reference.echo nested options are closed-world and bounded', () => {
  assert.throws(
    () => translatedRequest({
      suffix: 'unknown-option',
      request: mcpRequest({
        argumentsObject: {
          message: 'hello',
          options: { mode: 'strict', elevate: true }
        }
      })
    }),
    /unsupported reference.echo option fields: elevate/
  );

  assert.throws(
    () => translatedRequest({
      suffix: 'invalid-mode',
      request: mcpRequest({
        argumentsObject: {
          message: 'hello',
          options: { mode: 'unbounded' }
        }
      })
    }),
    /reference.echo arguments.options.mode is unsupported/
  );

  assert.throws(
    () => translatedRequest({
      suffix: 'target-type',
      request: mcpRequest({
        argumentsObject: {
          message: 'hello',
          options: { targets: ['alpha', 7] }
        }
      })
    }),
    /reference.echo arguments.options.targets\[1\] must be a string/
  );

  assert.throws(
    () => translatedRequest({
      suffix: 'target-count',
      request: mcpRequest({
        argumentsObject: {
          message: 'hello',
          options: { targets: Array.from({ length: 17 }, (_, index) => `t-${index}`) }
        }
      })
    }),
    /reference.echo arguments.options.targets must be an array with at most 16 items/
  );
});

test('MCP metadata must be canonical data even though it is not authority', () => {
  assert.throws(
    () => translatedRequest({
      suffix: 'bad-meta',
      request: mcpRequest({ meta: 'trace-data' })
    }),
    /MCP tools\/call params._meta must be an object/
  );
});

test('MCP semantic mutation cannot reuse a signed native effect grant', async () => {
  const manifest = createSyntheticReferenceAdapterManifest();
  const grantAuthority = createSyntheticReferenceGrantAuthority();
  const adapter = new SyntheticReferenceRuntimeAdapter({
    manifest,
    now: () => NOW,
    grantAuthority: grantAuthority.verifier
  });
  const grantId = 'grant:rt-auth-012-native-mutation';
  const authorized = translatedRequest({
    suffix: 'native-authorized',
    grantId,
    request: mcpRequest({
      argumentsObject: {
        message: 'hello',
        options: { mode: 'strict', targets: ['alpha', 'beta'] }
      }
    })
  });
  adapter.registerGrant(createSyntheticReferenceGrant({
    grantId,
    principalId: PRINCIPAL_ID,
    adapterId: manifest.adapter_id,
    runtimeId: manifest.runtime.runtime_id,
    now: NOW,
    signer: grantAuthority.signer,
    inputSha256: authorized.input_sha256
  }));

  const attempted = translatedRequest({
    suffix: 'native-mutated',
    grantId,
    request: mcpRequest({
      argumentsObject: {
        message: 'goodbye',
        options: { mode: 'strict', targets: ['alpha', 'beta'] }
      }
    })
  });
  assert.notEqual(attempted.input_sha256, authorized.input_sha256);

  const result = await adapter.execute(attempted);
  assert.equal(result.state, 'denied');
  assert.equal(result.code, 'input-mismatch');
  assert.equal(result.receipt.external_effect_performed, false);
});
