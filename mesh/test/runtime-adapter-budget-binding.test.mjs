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

const NOW = Date.UTC(2026, 8, 4, 4, 0, 0);
const ACTION = 'adapter.reference.echo';
const PURPOSE = 'test.conformance';
const PRINCIPAL_ID = 'principal:rt-auth-015';
const DEFAULT_INPUT_SHA256 = sha256('synthetic reference input');
const BUDGET = Object.freeze({
  max_requests_per_minute: 60,
  max_concurrent_requests: 1,
  max_execution_ms: 1_000,
  max_request_bytes: 4_096,
  max_response_bytes: 4_096
});

function expectedPurposeCommitment(inputSha256 = DEFAULT_INPUT_SHA256) {
  return sha256(canonicalJson({
    schema: 'axiom-effect-purpose-commitment.v1',
    axiom_action: ACTION,
    purpose: PURPOSE,
    input_sha256: inputSha256
  }));
}

function expectedBudgetCommitment(budget = BUDGET, inputSha256 = expectedPurposeCommitment()) {
  return sha256(canonicalJson({
    schema: 'axiom-effect-budget-commitment.v1',
    axiom_action: ACTION,
    budget,
    input_sha256: inputSha256
  }));
}

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

function externalRequest({ suffix, grantId, detail = authorizationDetail() }) {
  return {
    requestId: `request:rt-auth-015-${suffix}`,
    principalId: PRINCIPAL_ID,
    grantId,
    idempotencyKey: `idempotency:rt-auth-015-${suffix}-0001`,
    authorization_details: [detail]
  };
}

test('recognized external budget is bound into the signed input commitment', () => {
  const translated = translateSyntheticExternalAuthorizationRequest(externalRequest({
    suffix: 'translated',
    grantId: 'grant:rt-auth-015-translated'
  }));

  assert.equal(translated.input_sha256, expectedBudgetCommitment());
  assert.equal(Object.hasOwn(translated, 'budget'), false);
  assert.equal(canonicalJson(translated).includes('max_execution_ms'), false);
});

test('recognized exact-effect authorization requires an explicit budget', () => {
  const detail = authorizationDetail();
  delete detail.budget;
  assert.throws(
    () => translateSyntheticExternalAuthorizationRequest(externalRequest({
      suffix: 'missing-budget',
      grantId: 'grant:rt-auth-015-missing-budget',
      detail
    })),
    /missing authorization detail fields: budget/
  );
});

test('budget commitment is stable across equivalent object key order', () => {
  const reorderedBudget = {
    max_response_bytes: BUDGET.max_response_bytes,
    max_request_bytes: BUDGET.max_request_bytes,
    max_execution_ms: BUDGET.max_execution_ms,
    max_concurrent_requests: BUDGET.max_concurrent_requests,
    max_requests_per_minute: BUDGET.max_requests_per_minute
  };
  const first = translateSyntheticExternalAuthorizationRequest(externalRequest({
    suffix: 'canonical-first',
    grantId: 'grant:rt-auth-015-canonical-first'
  }));
  const second = translateSyntheticExternalAuthorizationRequest(externalRequest({
    suffix: 'canonical-second',
    grantId: 'grant:rt-auth-015-canonical-second',
    detail: authorizationDetail({ budget: reorderedBudget })
  }));

  assert.equal(first.input_sha256, second.input_sha256);
});

test('budget schema is closed-world, complete, and positive-safe-integer bounded', () => {
  assert.throws(
    () => translateSyntheticExternalAuthorizationRequest(externalRequest({
      suffix: 'unknown-budget-field',
      grantId: 'grant:rt-auth-015-unknown-budget-field',
      detail: authorizationDetail({
        budget: { ...BUDGET, max_cost_micros: 1 }
      })
    })),
    /unsupported authorization budget fields: max_cost_micros/
  );

  const missing = { ...BUDGET };
  delete missing.max_response_bytes;
  assert.throws(
    () => translateSyntheticExternalAuthorizationRequest(externalRequest({
      suffix: 'missing-budget-field',
      grantId: 'grant:rt-auth-015-missing-budget-field',
      detail: authorizationDetail({ budget: missing })
    })),
    /missing authorization budget fields: max_response_bytes/
  );

  for (const [suffix, maxExecutionMs] of [
    ['zero', 0],
    ['negative', -1],
    ['fractional', 1.5],
    ['unsafe', Number.MAX_SAFE_INTEGER + 1]
  ]) {
    assert.throws(
      () => translateSyntheticExternalAuthorizationRequest(externalRequest({
        suffix: `invalid-budget-${suffix}`,
        grantId: `grant:rt-auth-015-invalid-budget-${suffix}`,
        detail: authorizationDetail({
          budget: { ...BUDGET, max_execution_ms: maxExecutionMs }
        })
      })),
      /external authorization detail budget max_execution_ms must be a positive safe integer/
    );
  }
});

test('budget widening cannot reuse the signed effect grant', async () => {
  const manifest = createSyntheticReferenceAdapterManifest();
  const grantAuthority = createSyntheticReferenceGrantAuthority();
  const adapter = new SyntheticReferenceRuntimeAdapter({
    manifest,
    now: () => NOW,
    grantAuthority: grantAuthority.verifier
  });

  const grantId = 'grant:rt-auth-015-budget-widened';
  const authorizedRequest = translateSyntheticExternalAuthorizationRequest(externalRequest({
    suffix: 'widened-authorized',
    grantId
  }));
  const widenedRequest = translateSyntheticExternalAuthorizationRequest(externalRequest({
    suffix: 'widened-attempted',
    grantId,
    detail: authorizationDetail({
      budget: {
        ...BUDGET,
        max_execution_ms: BUDGET.max_execution_ms + 1
      }
    })
  }));
  assert.notEqual(widenedRequest.input_sha256, authorizedRequest.input_sha256);

  adapter.registerGrant(createSyntheticReferenceGrant({
    grantId,
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
