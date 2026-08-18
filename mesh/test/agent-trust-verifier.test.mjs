import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { PolicyEngine } from '../src/lib/policy.mjs';
import { buildMachineDiscovery } from '../src/lib/machine-discovery.mjs';
import { normalizeMachinePrincipalDefinition } from '../src/lib/machine-principal.mjs';
import { createMachineIdentityCredential } from '../src/lib/agent-trust-machine-identity.mjs';
import { createAgentAuthorityManifest } from '../src/lib/agent-trust-authority-manifest.mjs';
import {
  createAgentAttenuationProof,
  createAgentAuthorityCeiling
} from '../src/lib/agent-trust-attenuation-proof.mjs';
import { createAgentSignedHandoff } from '../src/lib/agent-trust-signed-handoff.mjs';
import {
  verifyAgentTrustBundle,
  verifyAgentTrustVerificationReport
} from '../src/lib/agent-trust-verifier.mjs';

const humans = new Set(['owner.alice']);
const INPUT = '1'.repeat(64);
const RECIPIENT_IDENTITY = '2'.repeat(64);
const EXECUTOR_IDENTITY = '3'.repeat(64);

function principal() {
  return normalizeMachinePrincipalDefinition({
    id: 'agent.verify.sender.1',
    type: 'agent',
    sponsor: 'owner.alice',
    roles: ['researcher'],
    scopes: ['intent:execute'],
    lifetime: 'session',
    expires_at: '2026-09-01T00:00:00.000Z',
    runtime: {
      id: 'runtime.verify.sender.1',
      kind: 'local-process',
      software_digest: 'a'.repeat(64)
    },
    constraints: {
      actions: ['system.echo'],
      purposes: ['test.conformance'],
      destinations: ['local'],
      budgets: {
        max_requests_per_minute: 10,
        max_concurrent_requests: 1,
        max_execution_ms: 5_000,
        max_request_bytes: 65_536,
        max_response_bytes: 262_144
      },
      delegation: { allowed: false, max_depth: 0 }
    }
  }, {
    knownHumanPrincipals: humans,
    now: new Date('2026-08-17T19:00:00.000Z')
  });
}

function policy() {
  return {
    version: 'atp-verifier-fixture-v1',
    actions: {
      'system.echo': {
        decision: 'allow',
        risk: 'low',
        required_scopes: ['intent:execute'],
        required_confirmations: 0,
        required_confirmation_values: [],
        requires_independent_approval: false,
        required_assurance: 'A1',
        timeout_ms: 4_000,
        constraints: {},
        tool: 'builtin.echo',
        effect: 'system.echo'
      }
    }
  };
}

function fixture() {
  const issuer = generateKeyPairSync('ed25519');
  const operational = generateKeyPairSync('ed25519');
  const machine = principal();
  const identityCredential = createMachineIdentityCredential({
    principal: machine,
    issuerId: 'identity.owner.alice',
    issuerPrivateKey: issuer.privateKey,
    operationalPublicKey: operational.publicKey,
    keyEpoch: 1,
    issuedAt: '2026-08-17T20:00:00.000Z',
    validFrom: '2026-08-17T20:00:00.000Z',
    expiresAt: '2026-08-25T20:00:00.000Z',
    knownHumanPrincipals: humans
  });
  const activePolicy = policy();
  const engine = new PolicyEngine(activePolicy);
  const discovery = buildMachineDiscovery({
    principal: machine,
    policy: engine,
    kernelVersion: '0.12.0-dev.3'
  });
  const capabilityRegistry = {
    schema: 'axiom-capabilities.v1',
    capabilities: [{ id: 'core.echo', status: 'implemented' }]
  };
  const authorityManifest = createAgentAuthorityManifest({
    principal: machine,
    identityCredential,
    trustedIssuerPublicKey: issuer.publicKey,
    discovery,
    policy: activePolicy,
    capabilityRegistry,
    createdAt: '2026-08-17T20:01:00.000Z',
    expiresAt: '2026-08-17T20:10:00.000Z',
    knownHumanPrincipals: humans
  });
  const authorityEvidence = {
    principal: machine,
    identityCredential,
    trustedIssuerPublicKey: issuer.publicKey,
    discovery,
    policy: activePolicy,
    capabilityRegistry,
    knownHumanPrincipals: humans
  };
  const handoff = createAgentSignedHandoff({
    handoffId: 'handoff.verify.1',
    parentTaskId: 'task.verify.root.1',
    recipientPrincipalId: 'agent.verify.recipient.1',
    recipientIdentityDigest: RECIPIENT_IDENTITY,
    intendedExecutorId: 'executor.verify.1',
    intendedExecutorIdentityDigest: EXECUTOR_IDENTITY,
    identityCredential,
    trustedIssuerPublicKey: issuer.publicKey,
    authorityManifest,
    authorityEvidence,
    operationalPrivateKey: operational.privateKey,
    action: 'system.echo',
    purpose: 'test.conformance',
    destination: 'local',
    inputDigest: INPUT,
    contextDigests: [],
    evidenceObligations: ['verification.report'],
    expectedOutputClasses: ['verification.report'],
    resourceCeiling: {
      max_requests_per_minute: 5,
      max_concurrent_requests: 1,
      max_execution_ms: 3_000,
      max_request_bytes: 32_768,
      max_response_bytes: 131_072
    },
    notBefore: '2026-08-17T20:02:00.000Z',
    expiresAt: '2026-08-17T20:06:00.000Z',
    nonce: 'nonce.verify.1',
    idempotencyKey: 'idem.verify.1'
  });
  return {
    issuer,
    operational,
    machine,
    identityCredential,
    authorityManifest,
    authorityEvidence,
    handoff
  };
}

function bundleEvidence(f) {
  return {
    identityCredential: f.identityCredential,
    trustedIssuerPublicKey: f.issuer.publicKey,
    authorityManifest: f.authorityManifest,
    authorityEvidence: f.authorityEvidence,
    handoff: f.handoff,
    expectedRecipientPrincipalId: 'agent.verify.recipient.1',
    expectedRecipientIdentityDigest: RECIPIENT_IDENTITY,
    expectedExecutorId: 'executor.verify.1',
    expectedExecutorIdentityDigest: EXECUTOR_IDENTITY,
    expectedInputDigest: INPUT,
    expectedParentTaskId: 'task.verify.root.1'
  };
}

function attenuationFixture() {
  const delegator = generateKeyPairSync('ed25519');
  const parentAuthority = createAgentAuthorityCeiling({
    capabilities: ['cap.echo'],
    actions: [{
      id: 'system.echo',
      effect_destination: 'local',
      required_assurance: 'A1',
      required_confirmations: 0,
      required_confirmation_values: [],
      requires_independent_approval: false,
      timeout_ms: 3_000
    }],
    scopes: ['intent:execute'],
    purposes: ['test.conformance'],
    destinations: ['local'],
    data_classes: ['public'],
    budgets: {
      max_requests_per_minute: 10,
      max_concurrent_requests: 2,
      max_execution_ms: 3_000,
      max_request_bytes: 65_536,
      max_response_bytes: 262_144,
      max_cost_units: 10
    },
    delegation: { may_subdelegate: true, remaining_depth: 2 },
    valid_from: '2026-08-17T20:00:00.000Z',
    expires_at: '2026-08-17T21:00:00.000Z'
  });
  const childAuthority = createAgentAuthorityCeiling({
    capabilities: ['cap.echo'],
    actions: [{
      id: 'system.echo',
      effect_destination: 'local',
      required_assurance: 'A2',
      required_confirmations: 1,
      required_confirmation_values: ['confirm.child'],
      requires_independent_approval: true,
      timeout_ms: 2_000
    }],
    scopes: ['intent:execute'],
    purposes: ['test.conformance'],
    destinations: ['local'],
    data_classes: ['public'],
    budgets: {
      max_requests_per_minute: 5,
      max_concurrent_requests: 1,
      max_execution_ms: 2_000,
      max_request_bytes: 32_768,
      max_response_bytes: 131_072,
      max_cost_units: 5
    },
    delegation: { may_subdelegate: false, remaining_depth: 0 },
    valid_from: '2026-08-17T20:05:00.000Z',
    expires_at: '2026-08-17T20:45:00.000Z'
  });
  const attenuationProof = createAgentAttenuationProof({
    proofId: 'attenuation.verify.1',
    delegatorId: 'agent.synthetic.parent.1',
    delegateId: 'agent.synthetic.child.1',
    delegatorPrivateKey: delegator.privateKey,
    parentAuthority,
    childAuthority,
    parentContextDigest: '4'.repeat(64),
    issuedAt: '2026-08-17T20:06:00.000Z',
    expiresAt: '2026-08-17T20:40:00.000Z'
  });
  return {
    attenuationProof,
    attenuationEvidence: {
      delegatorPublicKey: delegator.publicKey,
      parentAuthority,
      childAuthority,
      expectedDelegatorId: 'agent.synthetic.parent.1',
      expectedDelegateId: 'agent.synthetic.child.1',
      expectedParentContextDigest: '4'.repeat(64)
    }
  };
}

test('A10a independently verifies the A1 -> A2 -> A4a integrity chain without granting authority', () => {
  const f = fixture();
  const report = verifyAgentTrustBundle(bundleEvidence(f));

  assert.equal(report.sender.principal_id, 'agent.verify.sender.1');
  assert.equal(report.sender.credential_digest, f.identityCredential.credential_digest);
  assert.equal(report.authority_manifest.manifest_digest, f.authorityManifest.manifest_digest);
  assert.equal(report.handoff.handoff_digest, f.handoff.handoff_digest);
  assert.equal(report.handoff.input_digest, INPUT);
  assert.equal(report.authority_manifest.delegation_allowed, false);
  assert.equal(report.authority_manifest.max_delegation_depth, 0);
  assert.equal(report.handoff.delegation_chain_head_digest, null);
  assert.equal(report.handoff.remaining_delegation_depth, 0);
  assert.equal(report.claims.authority_granted, false);
  assert.equal(report.claims.execution_authorized, false);
  assert.equal(report.claims.delegation_authority_verified, false);
  assert.equal(report.claims.global_currentness_verified, false);
  assert.equal(report.claims.task_success_verified, false);
  assert.equal(report.claims.effect_execution_verified, false);
  assert.equal(report.claims.authority_effect, 'none');
  assert.match(report.verification_report_digest, /^[a-f0-9]{64}$/);
});

test('verification report is content-addressed and supports independent expected-field checks', () => {
  const f = fixture();
  const report = verifyAgentTrustBundle(bundleEvidence(f));
  const result = verifyAgentTrustVerificationReport(report, {
    sender_principal_id: 'agent.verify.sender.1',
    credential_digest: f.identityCredential.credential_digest,
    authority_manifest_digest: f.authorityManifest.manifest_digest,
    handoff_digest: f.handoff.handoff_digest,
    action: 'system.echo',
    recipient_principal_id: 'agent.verify.recipient.1',
    intended_executor_id: 'executor.verify.1',
    input_digest: INPUT
  });
  assert.equal(result.valid, true);
  assert.equal(result.claims.execution_authorized, false);
});

test('A10a can verify an A3a attenuation proof only as a separate proof-only artifact', () => {
  const f = fixture();
  const a = attenuationFixture();
  const report = verifyAgentTrustBundle({
    ...bundleEvidence(f),
    ...a
  });
  assert.equal(report.attenuation_proof.proof_digest, a.attenuationProof.proof_digest);
  assert.equal(report.attenuation_proof.authority_relation, 'strictly-equal-or-narrower');
  assert.equal(report.attenuation_proof.proof_only, true);
  assert.equal(report.claims.delegation_authority_verified, false);
  assert.equal(report.handoff.delegation_chain_head_digest, null);
});

test('attenuation evidence without a proof fails closed', () => {
  const f = fixture();
  const a = attenuationFixture();
  assert.throws(
    () => verifyAgentTrustBundle({
      ...bundleEvidence(f),
      attenuationEvidence: a.attenuationEvidence
    }),
    /attenuation evidence requires an attenuation proof/
  );
});

test('bundle verification rejects identity, target and input substitution', () => {
  const f = fixture();
  const other = fixture();
  assert.throws(
    () => verifyAgentTrustBundle({
      ...bundleEvidence(f),
      identityCredential: other.identityCredential,
      trustedIssuerPublicKey: other.issuer.publicKey
    }),
    /does not reproduce|credential does not match|credential digest mismatch/
  );
  assert.throws(
    () => verifyAgentTrustBundle({
      ...bundleEvidence(f),
      expectedRecipientIdentityDigest: '9'.repeat(64)
    }),
    /recipient identity digest mismatch/
  );
  assert.throws(
    () => verifyAgentTrustBundle({
      ...bundleEvidence(f),
      expectedInputDigest: '8'.repeat(64)
    }),
    /input digest mismatch/
  );
});

test('verification report cannot elevate integrity into authority/currentness/success claims', () => {
  const f = fixture();
  const report = verifyAgentTrustBundle(bundleEvidence(f));
  const elevated = structuredClone(report);
  elevated.claims.execution_authorized = true;
  assert.throws(
    () => verifyAgentTrustVerificationReport(elevated),
    /claim execution_authorized must remain false/
  );
  const current = structuredClone(report);
  current.claims.global_currentness_verified = true;
  assert.throws(
    () => verifyAgentTrustVerificationReport(current),
    /claim global_currentness_verified must remain false/
  );
  const success = structuredClone(report);
  success.claims.task_success_verified = true;
  assert.throws(
    () => verifyAgentTrustVerificationReport(success),
    /claim task_success_verified must remain false/
  );
});

test('verification report digest and expected fields reject substitution', () => {
  const f = fixture();
  const report = verifyAgentTrustBundle(bundleEvidence(f));
  assert.throws(
    () => verifyAgentTrustVerificationReport({
      ...report,
      verification_report_digest: '0'.repeat(64)
    }),
    /verification report digest mismatch/
  );
  assert.throws(
    () => verifyAgentTrustVerificationReport(report, { action: 'system.hash' }),
    /action mismatch/
  );
  assert.throws(
    () => verifyAgentTrustVerificationReport(report, { unsupported_field: 'x' }),
    /expected check unsupported_field is unsupported/
  );
});

test('A10a verifier module is verification-only and contains no private-key or effect-capable imports', async () => {
  const source = await readFile(new URL('../src/lib/agent-trust-verifier.mjs', import.meta.url), 'utf8');
  for (const forbidden of [
    "from 'node:crypto'",
    "from 'node:fs'",
    "from 'node:fs/promises'",
    "from 'node:child_process'",
    "from 'node:net'",
    "from 'node:http'",
    "from 'node:https'",
    'createPrivateKey',
    'generateKeyPair',
    'createMachineIdentityCredential',
    'createAgentAuthorityManifest',
    'createAgentAttenuationProof',
    'createAgentSignedHandoff',
    'spawn(',
    'exec(',
    'fetch('
  ]) {
    assert.equal(source.includes(forbidden), false, `verifier source must not contain ${forbidden}`);
  }
  for (const required of [
    'verifyMachineIdentityCredential',
    'verifyAgentAuthorityManifest',
    'verifyAgentAttenuationProof',
    'verifyAgentSignedHandoff'
  ]) {
    assert.equal(source.includes(required), true, `verifier source must use ${required}`);
  }
});
