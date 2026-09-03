import assert from 'node:assert/strict';
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

const NOW = Date.UTC(2026, 8, 3, 23, 45, 0);
const PRINCIPAL_ID = 'principal:rt-auth-012-preservation';

test('MCP projection preserves widened signed constraints for native denial', async () => {
  const manifest = createSyntheticReferenceAdapterManifest();
  const grantAuthority = createSyntheticReferenceGrantAuthority();
  const adapter = new SyntheticReferenceRuntimeAdapter({
    manifest,
    now: () => NOW,
    grantAuthority: grantAuthority.verifier
  });
  const grantId = 'grant:rt-auth-012-action-widening';
  const translated = translateSyntheticMcpToolCallAuthorizationRequest({
    requestId: 'request:rt-auth-012-action-widening',
    principalId: PRINCIPAL_ID,
    grantId,
    idempotencyKey: 'idempotency:rt-auth-012-action-widening',
    authorization_details: [{
      type: 'axiom-runtime-effect.v1',
      runtime_operation: 'reference.echo',
      axiom_action: 'adapter.reference.write',
      requested_scopes: ['synthetic.read'],
      destinations: ['local:reference'],
      credential_handles: ['credential:synthetic-reference']
    }],
    mcpRequest: {
      jsonrpc: '2.0',
      id: 'mcp:rt-auth-012-action-widening',
      method: 'tools/call',
      params: {
        name: 'reference.echo',
        arguments: { message: 'hello' }
      }
    }
  });

  assert.equal(translated.axiom_action, 'adapter.reference.write');
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
  assert.equal(result.code, 'action-mismatch');
  assert.equal(result.receipt.external_effect_performed, false);
});
