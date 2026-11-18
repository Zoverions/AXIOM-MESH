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

const NOW = Date.UTC(2026, 8, 3, 23, 5, 0);
const ACTION = 'adapter.reference.echo';
const INPUT_SCHEMA_REF = 'synthetic://schemas/reference-echo-input.v1';
const PURPOSE = 'test.conformance';
const PRINCIPAL_ID = 'principal:rt-auth-011';
const BUDGET = Object.freeze({
  max_requests_per_minute: 60,
  max_concurrent_requests: 1,
  max_execution_ms: 1_000,
  max_request_bytes: 4_096,
  max_response_bytes: 4_096
});

function expectedCommitment(structuredArguments) {
  const structuredInputSha256 = sha256(canonicalJson({
    schema: 'axiom-effect-input-commitment.v1',
    axiom_action: ACTION,
    input_schema_ref: INPUT_SCHEMA_REF,
    arguments: structuredArguments
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

function authorizationDetail() {
  return {
    type: 'axiom-runtime-effect.v1',
    runtime_operation: 'reference.echo',
    axiom_action: ACTION,
    purpose: PURPOSE,
    budget: BUDGET,
    requested_scopes: ['synthetic.read'],
    destinations: ['local:reference'],
    credential_handles: ['credential:synthetic-reference']
  };
}

function translatedRequest({ suffix, grantId, structuredArguments }) {
  return translateSyntheticExternalAuthorizationRequest({
    requestId: `request:rt-auth-011-${suffix}`,
    principalId: PRINCIPAL_ID,
    grantId,
    idempotencyKey: `idempotency:rt-auth-011-${suffix}`,
    structuredArguments,
    authorization_details: [authorizationDetail()]
  });
}

test('structured input commitment is domain-separated and object-order stable', () => {
  const grantId = 'grant:rt-auth-011-order';
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

  const requestA = translatedRequest({
    suffix: 'order-a',
    grantId,
    structuredArguments: first
  });
  const requestB = translatedRequest({
    suffix: 'order-b',
    grantId,
    structuredArguments: reordered
  });

  assert.equal(requestA.input_sha256, expectedCommitment(first));
  assert.equal(requestB.input_sha256, expectedCommitment(reordered));
  assert.equal(requestA.input_sha256, requestB.input_sha256);
  assert.equal(Object.hasOwn(requestA, 'structuredArguments'), false);
  assert.equal(Object.hasOwn(requestA, 'budget'), false);
  assert.equal(canonicalJson(requestA).includes('hello'), false);
});

test('canonical-equivalent structured input retains signed effect authority', async () => {
  const manifest = createSyntheticReferenceAdapterManifest();
  const grantAuthority = createSyntheticReferenceGrantAuthority();
  const adapter = new SyntheticReferenceRuntimeAdapter({
    manifest,
    now: () => NOW,
    grantAuthority: grantAuthority.verifier
  });
  const grantId = 'grant:rt-auth-011-equivalent';
  const original = {
    message: 'hello',
    options: { mode: 'strict', targets: ['alpha', 'beta'] }
  };
  const reordered = {
    options: { targets: ['alpha', 'beta'], mode: 'strict' },
    message: 'hello'
  };
  const authorized = translatedRequest({
    suffix: 'equivalent-authorized',
    grantId,
    structuredArguments: original
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

  const result = await adapter.execute(translatedRequest({
    suffix: 'equivalent-executed',
    grantId,
    structuredArguments: reordered
  }));

  assert.equal(result.state, 'completed');
  assert.equal(result.receipt.external_effect_performed, false);
});

test('effect-relevant structured mutations cannot reuse signed authority', async () => {
  const manifest = createSyntheticReferenceAdapterManifest();
  const grantAuthority = createSyntheticReferenceGrantAuthority();
  const adapter = new SyntheticReferenceRuntimeAdapter({
    manifest,
    now: () => NOW,
    grantAuthority: grantAuthority.verifier
  });
  const baseline = {
    message: 'hello',
    count: 1,
    enabled: true,
    options: { mode: 'strict', target: 'alpha' },
    targets: ['alpha', 'beta']
  };
  const mutations = [
    ['field-change', { ...baseline, message: 'goodbye' }],
    ['field-insertion', { ...baseline, extra: 'unexpected' }],
    ['field-deletion', (() => {
      const value = structuredClone(baseline);
      delete value.enabled;
      return value;
    })()],
    ['type-change', { ...baseline, count: '1' }],
    ['nested-change', {
      ...baseline,
      options: { ...baseline.options, mode: 'permissive' }
    }],
    ['unknown-field', {
      ...baseline,
      options: { ...baseline.options, unknown: true }
    }],
    ['array-reorder', { ...baseline, targets: ['beta', 'alpha'] }]
  ];

  for (const [suffix, mutated] of mutations) {
    const grantId = `grant:rt-auth-011-${suffix}`;
    const authorized = translatedRequest({
      suffix: `${suffix}-authorized`,
      grantId,
      structuredArguments: baseline
    });
    const attempted = translatedRequest({
      suffix: `${suffix}-mutated`,
      grantId,
      structuredArguments: mutated
    });
    assert.notEqual(attempted.input_sha256, authorized.input_sha256, suffix);

    adapter.registerGrant(createSyntheticReferenceGrant({
      grantId,
      principalId: PRINCIPAL_ID,
      adapterId: manifest.adapter_id,
      runtimeId: manifest.runtime.runtime_id,
      now: NOW,
      signer: grantAuthority.signer,
      inputSha256: authorized.input_sha256
    }));
    const result = await adapter.execute(attempted);
    assert.equal(result.state, 'denied', suffix);
    assert.equal(result.code, 'input-mismatch', suffix);
    assert.equal(result.receipt.external_effect_performed, false, suffix);
  }
});

test('structured input translation rejects ambiguous or context-free commitments', () => {
  assert.throws(
    () => translateSyntheticExternalAuthorizationRequest({
      requestId: 'request:rt-auth-011-ambiguous',
      principalId: PRINCIPAL_ID,
      grantId: 'grant:rt-auth-011-ambiguous',
      idempotencyKey: 'idempotency:rt-auth-011-ambiguous',
      inputSha256: 'a'.repeat(64),
      structuredArguments: { message: 'hello' },
      authorization_details: [authorizationDetail()]
    }),
    /structuredArguments and inputSha256 cannot both be supplied/
  );

  assert.throws(
    () => translateSyntheticExternalAuthorizationRequest({
      requestId: 'request:rt-auth-011-context-free',
      principalId: PRINCIPAL_ID,
      grantId: 'grant:rt-auth-011-context-free',
      idempotencyKey: 'idempotency:rt-auth-011-context-free',
      structuredArguments: { message: 'hello' }
    }),
    /structuredArguments require recognized authorization_details/
  );
});
