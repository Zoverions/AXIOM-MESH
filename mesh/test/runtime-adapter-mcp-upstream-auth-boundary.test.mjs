import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  translateSyntheticMcpToolCallAuthorizationRequest
} from '../src/runtime-adapter-authorization-translation.mjs';
import {
  createSyntheticReferenceAdapterManifest,
  createSyntheticReferenceGrant,
  createSyntheticReferenceGrantAuthority,
  SyntheticReferenceRuntimeAdapter
} from '../src/runtime-adapter-conformance.mjs';

const FIXTURE = JSON.parse(readFileSync(
  new URL('./fixtures/rt-auth-015-mcp-upstream-auth.json', import.meta.url),
  'utf8'
));
const NOW = Date.UTC(2026, 8, 4, 8, 20, 0);
const PRINCIPAL_ID = 'principal:rt-auth-015';
const EXPECTED_CASE_IDS = [
  'empty-auth-object-no-grant',
  'oauth-fallback-no-grant',
  'arbitrary-bearer-no-grant',
  'query-token-no-grant',
  'tools-list-then-call-denied',
  'scope-injection-denied',
  'principal-substitution-denied'
];

function authorizationDetail(overrides = {}) {
  return {
    type: 'axiom-runtime-effect.v1',
    runtime_operation: 'reference.echo',
    axiom_action: 'adapter.reference.echo',
    purpose: 'test.conformance',
    requested_scopes: ['synthetic.read'],
    destinations: ['local:reference'],
    credential_handles: ['credential:synthetic-reference'],
    ...overrides
  };
}

function mcpRequest({
  id = 'mcp:rt-auth-015',
  method = 'tools/call',
  meta = {},
  argumentsObject = { message: 'hello' }
} = {}) {
  return {
    jsonrpc: '2.0',
    id,
    method,
    params: {
      name: 'reference.echo',
      arguments: argumentsObject,
      _meta: meta
    }
  };
}

function translate({
  suffix,
  principalId = PRINCIPAL_ID,
  grantId = `grant:rt-auth-015-${suffix}`,
  detail = authorizationDetail(),
  request = mcpRequest()
}) {
  return translateSyntheticMcpToolCallAuthorizationRequest({
    requestId: `request:rt-auth-015-${suffix}`,
    principalId,
    grantId,
    idempotencyKey: `idempotency:rt-auth-015-${suffix}`,
    authorization_details: [detail],
    mcpRequest: request
  });
}

function harness() {
  const manifest = createSyntheticReferenceAdapterManifest();
  const grantAuthority = createSyntheticReferenceGrantAuthority();
  const adapter = new SyntheticReferenceRuntimeAdapter({
    manifest,
    now: () => NOW,
    grantAuthority: grantAuthority.verifier
  });
  return { adapter, grantAuthority, manifest };
}

async function assertNoGrantCannotAuthorize(vector) {
  const { adapter } = harness();
  const translated = translate({
    suffix: vector.id,
    request: mcpRequest({
      id: `mcp:rt-auth-015-${vector.id}`,
      meta: vector.upstream_metadata
    })
  });

  const serialized = JSON.stringify(translated);
  for (const marker of vector.must_not_project ?? []) {
    assert.equal(
      serialized.includes(marker),
      false,
      `upstream auth marker must remain non-authoritative: ${marker}`
    );
  }

  const result = await adapter.execute(translated);
  assert.equal(result.state, 'denied');
  assert.equal(result.code, 'grant-required');
  assert.equal(result.receipt.external_effect_performed, false);
}

test('RT-AUTH-015 fixture is complete and bounded to the MCP upstream-auth threat', () => {
  assert.equal(FIXTURE.schema, 'axiom-rt-auth-015-mcp-upstream-auth.v1');
  assert.equal(FIXTURE.target, 'RT-AUTH-015');
  assert.match(FIXTURE.invariant, /outside the AXIOM authority boundary/i);
  assert.deepEqual(
    FIXTURE.cases.map((vector) => vector.id),
    EXPECTED_CASE_IDS
  );
});

for (const vector of FIXTURE.cases) {
  test(`RT-AUTH-015 ${vector.id}`, async () => {
    switch (vector.mode) {
      case 'inert-upstream-auth-no-grant': {
        await assertNoGrantCannotAuthorize(vector);
        return;
      }
      case 'enumeration-then-call-denied': {
        assert.throws(
          () => translate({
            suffix: `${vector.id}-list`,
            request: mcpRequest({
              id: `mcp:rt-auth-015-${vector.id}-list`,
              method: 'tools/list',
              meta: vector.upstream_metadata
            })
          }),
          /MCP request method must be tools\/call/
        );
        await assertNoGrantCannotAuthorize(vector);
        return;
      }
      case 'scope-injection-denied': {
        const { adapter, grantAuthority, manifest } = harness();
        const grantId = `grant:rt-auth-015-${vector.id}`;
        const translated = translate({
          suffix: vector.id,
          grantId,
          detail: authorizationDetail({
            requested_scopes: vector.requested_scopes
          }),
          request: mcpRequest({
            id: `mcp:rt-auth-015-${vector.id}`,
            meta: vector.upstream_metadata
          })
        });
        adapter.registerGrant(createSyntheticReferenceGrant({
          grantId,
          principalId: PRINCIPAL_ID,
          adapterId: manifest.adapter_id,
          runtimeId: manifest.runtime.runtime_id,
          now: NOW,
          signer: grantAuthority.signer,
          inputSha256: translated.input_sha256
        }));

        const result = await adapter.execute(translated);
        assert.equal(result.state, 'denied');
        assert.equal(result.code, 'scope-not-mapped');
        assert.equal(result.receipt.external_effect_performed, false);
        return;
      }
      case 'principal-substitution-denied': {
        const { adapter, grantAuthority, manifest } = harness();
        const grantId = `grant:rt-auth-015-${vector.id}`;
        const translated = translate({
          suffix: vector.id,
          principalId: vector.attempted_principal_id,
          grantId,
          request: mcpRequest({
            id: `mcp:rt-auth-015-${vector.id}`,
            meta: vector.upstream_metadata
          })
        });
        adapter.registerGrant(createSyntheticReferenceGrant({
          grantId,
          principalId: PRINCIPAL_ID,
          adapterId: manifest.adapter_id,
          runtimeId: manifest.runtime.runtime_id,
          now: NOW,
          signer: grantAuthority.signer,
          inputSha256: translated.input_sha256
        }));

        const result = await adapter.execute(translated);
        assert.equal(result.state, 'denied');
        assert.equal(result.code, 'grant-binding-mismatch');
        assert.equal(result.receipt.external_effect_performed, false);
        return;
      }
      default:
        assert.fail(`unsupported RT-AUTH-015 fixture mode: ${vector.mode}`);
    }
  });
}
