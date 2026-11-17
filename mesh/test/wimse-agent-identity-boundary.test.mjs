import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { createMachineIdentityCredential } from '../src/lib/agent-trust-machine-identity.mjs';
import {
  createMachineHolderPresentation,
  verifyMachineHolderPresentation
} from '../src/lib/machine-holder-presentation.mjs';
import {
  createSyntheticReferenceAdapterManifest,
  createSyntheticReferenceGrant,
  createSyntheticReferenceGrantAuthority,
  createSyntheticReferenceRequest,
  SyntheticReferenceRuntimeAdapter
} from '../src/runtime-adapter-conformance.mjs';

const NOW = Date.UTC(2026, 10, 17, 14, 0, 0);
const REVISION = 'd8d480a933d631f6e8d807be4f5ce92ee5a7d694';
const ISSUED_AT = '2026-11-17T13:58:00.000Z';
const PRESENTED_AT = '2026-11-17T13:59:00.000Z';
const EVALUATED_AT = '2026-11-17T14:00:00.000Z';
const PRESENTATION_EXPIRES_AT = '2026-11-17T14:03:00.000Z';
const CREDENTIAL_EXPIRES_AT = '2026-11-17T15:00:00.000Z';
const AUDIENCE = 'verifier:wimse-boundary-fixture';
const PURPOSE = 'test.identity-boundary';

function principal(id, runtimeId, type = 'agent') {
  return {
    id,
    type,
    sponsor: 'human:wimse-fixture-owner',
    roles: ['test-subject'],
    scopes: ['intent:execute'],
    lifetime: 'session',
    expires_at: CREDENTIAL_EXPIRES_AT,
    runtime: {
      id: runtimeId,
      kind: 'local-process',
      software_digest: 'a'.repeat(64)
    },
    constraints: {
      actions: ['system.echo'],
      purposes: [PURPOSE],
      destinations: ['local'],
      budgets: {
        max_requests_per_minute: 3,
        max_concurrent_requests: 1,
        max_execution_ms: 1000,
        max_request_bytes: 4096,
        max_response_bytes: 4096
      },
      delegation: { allowed: false, max_depth: 0 }
    }
  };
}

function identityEvidence({
  principalId,
  principalType,
  runtimeId,
  issuer,
  holder,
  nonce
}) {
  const credential = createMachineIdentityCredential({
    principal: principal(principalId, runtimeId, principalType),
    issuerId: 'issuer:wimse-boundary-fixture',
    issuerPrivateKey: issuer.privateKey,
    operationalPublicKey: holder.publicKey,
    keyEpoch: 1,
    issuedAt: ISSUED_AT,
    validFrom: ISSUED_AT,
    expiresAt: CREDENTIAL_EXPIRES_AT,
    knownHumanPrincipals: new Set(['human:wimse-fixture-owner'])
  });
  const presentation = createMachineHolderPresentation({
    credential,
    trustedIssuerPublicKey: issuer.publicKey,
    expectedIssuerId: 'issuer:wimse-boundary-fixture',
    holderPrivateKey: holder.privateKey,
    audienceId: AUDIENCE,
    purpose: PURPOSE,
    nonce,
    issuedAt: PRESENTED_AT,
    expiresAt: PRESENTATION_EXPIRES_AT
  });
  return { credential, presentation, nonce };
}

test('RT-WIMSE-AGENT-IDENTITY-001: a shared workload credential authenticates only the shared principal', async () => {
  const profile = JSON.parse(await readFile(
    new URL('./fixtures/rt-wimse-agent-identity-001.json', import.meta.url),
    'utf8'
  ));
  assert.equal(profile.schema, 'axiom-rt-wimse-agent-identity-001.v2');
  assert.equal(profile.target, 'RT-WIMSE-AGENT-IDENTITY-001');
  assert.deepEqual(
    profile.cases.map(item => item.id),
    [
      'shared-holder-presentation-authenticates-only-shared-principal',
      'shared-credential-does-not-authenticate-logical-agent',
      'shared-principal-remains-explicit',
      'distinct-agent-requires-distinct-identity-and-current-grant'
    ]
  );

  const issuer = generateKeyPairSync('ed25519');
  const sharedHolder = generateKeyPairSync('ed25519');
  const logicalAgentHolder = generateKeyPairSync('ed25519');
  const sharedIdentity = identityEvidence({
    principalId: profile.shared_principal_id,
    principalType: 'service',
    runtimeId: 'runtime:wimse-shared-workload',
    issuer,
    holder: sharedHolder,
    nonce: 'challenge:wimse-shared-workload-0001'
  });
  const sharedVerified = verifyMachineHolderPresentation(sharedIdentity.presentation, {
    credential: sharedIdentity.credential,
    trustedIssuerPublicKey: issuer.publicKey,
    expectedIssuerId: 'issuer:wimse-boundary-fixture',
    expectedPrincipalId: profile.shared_principal_id,
    expectedAudienceId: AUDIENCE,
    expectedPurpose: PURPOSE,
    expectedNonce: sharedIdentity.nonce,
    at: EVALUATED_AT
  });
  assert.equal(sharedVerified.valid, true);
  assert.equal(sharedVerified.principal_id, profile.shared_principal_id);
  assert.equal(sharedVerified.authority_effect, 'none');
  assert.throws(() => verifyMachineHolderPresentation(sharedIdentity.presentation, {
    credential: sharedIdentity.credential,
    trustedIssuerPublicKey: issuer.publicKey,
    expectedIssuerId: 'issuer:wimse-boundary-fixture',
    expectedPrincipalId: profile.logical_agent_principal_ids[0],
    expectedAudienceId: AUDIENCE,
    expectedPurpose: PURPOSE,
    expectedNonce: sharedIdentity.nonce,
    at: EVALUATED_AT
  }), /principal/i);
  assert.throws(() => createMachineHolderPresentation({
    credential: sharedIdentity.credential,
    trustedIssuerPublicKey: issuer.publicKey,
    expectedIssuerId: 'issuer:wimse-boundary-fixture',
    holderPrivateKey: logicalAgentHolder.privateKey,
    audienceId: AUDIENCE,
    purpose: PURPOSE,
    nonce: 'challenge:wimse-wrong-holder-0001',
    issuedAt: PRESENTED_AT,
    expiresAt: PRESENTATION_EXPIRES_AT
  }), /holder|operational/i);

  const manifest = createSyntheticReferenceAdapterManifest({
    sourceRevision: REVISION
  });
  const grantAuthority = createSyntheticReferenceGrantAuthority();
  const adapter = new SyntheticReferenceRuntimeAdapter({
    manifest,
    now: () => NOW,
    grantAuthority: grantAuthority.verifier
  });

  const sharedGrant = createSyntheticReferenceGrant({
    grantId: 'grant:wimse-shared-workload',
    principalId: profile.shared_principal_id,
    adapterId: manifest.adapter_id,
    runtimeId: manifest.runtime.runtime_id,
    now: NOW,
    signer: grantAuthority.signer
  });
  adapter.registerGrant(sharedGrant);

  const relabeled = await adapter.execute(createSyntheticReferenceRequest({
    requestId: 'request:wimse-relabeled-agent',
    principalId: profile.logical_agent_principal_ids[0],
    grantId: sharedGrant.grant_id,
    idempotencyKey: 'idempotency:wimse-relabeled-agent-0001'
  }));
  assert.equal(relabeled.state, 'denied');
  assert.equal(relabeled.code, 'grant-binding-mismatch');
  assert.equal(relabeled.receipt.request.principal_id, 'principal:logical-agent-a');
  assert.equal(relabeled.receipt.external_effect_performed, false);

  const shared = await adapter.execute(createSyntheticReferenceRequest({
    requestId: 'request:wimse-shared-principal',
    principalId: profile.shared_principal_id,
    grantId: sharedGrant.grant_id,
    idempotencyKey: 'idempotency:wimse-shared-principal-0001'
  }));
  assert.equal(shared.state, 'completed');
  assert.equal(shared.receipt.request.principal_id, 'principal:shared-workload');
  assert.equal(shared.receipt.external_effect_performed, false);

  const agentGrant = createSyntheticReferenceGrant({
    grantId: 'grant:wimse-logical-agent-a',
    principalId: profile.logical_agent_principal_ids[0],
    adapterId: manifest.adapter_id,
    runtimeId: manifest.runtime.runtime_id,
    now: NOW,
    signer: grantAuthority.signer
  });
  adapter.registerGrant(agentGrant);

  const logicalAgentIdentity = identityEvidence({
    principalId: profile.logical_agent_principal_ids[0],
    principalType: 'agent',
    runtimeId: 'runtime:wimse-logical-agent-a',
    issuer,
    holder: logicalAgentHolder,
    nonce: 'challenge:wimse-logical-agent-a-0001'
  });
  const logicalAgentVerified = verifyMachineHolderPresentation(logicalAgentIdentity.presentation, {
    credential: logicalAgentIdentity.credential,
    trustedIssuerPublicKey: issuer.publicKey,
    expectedIssuerId: 'issuer:wimse-boundary-fixture',
    expectedPrincipalId: profile.logical_agent_principal_ids[0],
    expectedAudienceId: AUDIENCE,
    expectedPurpose: PURPOSE,
    expectedNonce: logicalAgentIdentity.nonce,
    at: EVALUATED_AT
  });
  assert.equal(logicalAgentVerified.valid, true);
  assert.equal(logicalAgentVerified.principal_id, profile.logical_agent_principal_ids[0]);
  assert.notEqual(logicalAgentVerified.credential_digest, sharedVerified.credential_digest);
  assert.notEqual(logicalAgentVerified.holder_key_id, sharedVerified.holder_key_id);
  assert.equal(logicalAgentVerified.authority_effect, 'none');

  const distinct = await adapter.execute(createSyntheticReferenceRequest({
    requestId: 'request:wimse-distinct-agent',
    principalId: profile.logical_agent_principal_ids[0],
    grantId: agentGrant.grant_id,
    idempotencyKey: 'idempotency:wimse-distinct-agent-0001'
  }));
  assert.equal(distinct.state, 'completed');
  assert.equal(distinct.receipt.request.principal_id, 'principal:logical-agent-a');
  assert.equal(distinct.receipt.external_effect_performed, false);
});
