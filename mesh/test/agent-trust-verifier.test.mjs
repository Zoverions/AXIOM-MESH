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
  checkAgentTrustVerificationReportIntegrity,
  verifyAgentTrustBundle
} from '../src/lib/agent-trust-verifier.mjs';

const humans = new Set(['owner.alice']);
const INPUT = '1'.repeat(64);
const RECIPIENT_IDENTITY = '2'.repeat(64);
const EXECUTOR_IDENTITY = '3'.repeat(64);

function fixture() {
  const issuer = generateKeyPairSync('ed25519');
  const operational = generateKeyPairSync('ed25519');
  const principal = normalizeMachinePrincipalDefinition({
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
  const identityCredential = createMachineIdentityCredential({
    principal,
    issuerId: 'identity.owner.alice',
    issuerPrivateKey: issuer.privateKey,
    operationalPublicKey: operational.publicKey,
    keyEpoch: 1,
    issuedAt: '2026-08-17T20:00:00.000Z',
    validFrom: '2026-08-17T20:00:00.000Z',
    expiresAt: '2026-08-25T20:00:00.000Z',
    knownHumanPrincipals: humans
  });
  const policy = {
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
  const discovery = buildMachineDiscovery({
    principal,
    policy: new PolicyEngine(policy),
    kernelVersion: '0.12.0-dev.3'
  });
  const capabilityRegistry = {
    schema: 'axiom-capabilities.v1',
    capabilities: [{ id: 'core.echo', status: 'implemented' }]
  };
  const authorityManifest = createAgentAuthorityManifest({
    principal,
    identityCredential,
    trustedIssuerPublicKey: issuer.publicKey,
    discovery,
    policy,
    capabilityRegistry,
    createdAt: '2026-08-17T20:01:00.000Z',
    expiresAt: '2026-08-17T20:10:00.000Z',
    knownHumanPrincipals: humans
  });
  const authorityEvidence = {
    principal,
    identityCredential,
    trustedIssuerPublicKey: issuer.publicKey,
    discovery,
    policy,
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
  return { issuer, operational, principal, identityCredential, authorityManifest, authorityEvidence, handoff };
}

function bundle(f) {
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

function attenuation() {
  const key = generateKeyPairSync('ed25519');
  const parentAuthority = createAgentAuthorityCeiling({
    capabilities: ['cap.echo'],
    actions: [{
      id: 'system.echo', effect_destination: 'local', required_assurance: 'A1',
      required_confirmations: 0, required_confirmation_values: [],
      requires_independent_approval: false, timeout_ms: 3_000
    }],
    scopes: ['intent:execute'], purposes: ['test.conformance'], destinations: ['local'],
    data_classes: ['public'],
    budgets: {
      max_requests_per_minute: 10, max_concurrent_requests: 2, max_execution_ms: 3_000,
      max_request_bytes: 65_536, max_response_bytes: 262_144, max_cost_units: 10
    },
    delegation: { may_subdelegate: true, remaining_depth: 2 },
    valid_from: '2026-08-17T20:00:00.000Z', expires_at: '2026-08-17T21:00:00.000Z'
  });
  const childAuthority = createAgentAuthorityCeiling({
    capabilities: ['cap.echo'],
    actions: [{
      id: 'system.echo', effect_destination: 'local', required_assurance: 'A2',
      required_confirmations: 1, required_confirmation_values: ['confirm.child'],
      requires_independent_approval: true, timeout_ms: 2_000
    }],
    scopes: ['intent:execute'], purposes: ['test.conformance'], destinations: ['local'],
    data_classes: ['public'],
    budgets: {
      max_requests_per_minute: 5, max_concurrent_requests: 1, max_execution_ms: 2_000,
      max_request_bytes: 32_768, max_response_bytes: 131_072, max_cost_units: 5
    },
    delegation: { may_subdelegate: false, remaining_depth: 0 },
    valid_from: '2026-08-17T20:05:00.000Z', expires_at: '2026-08-17T20:45:00.000Z'
  });
  const attenuationProof = createAgentAttenuationProof({
    proofId: 'attenuation.verify.1', delegatorId: 'agent.synthetic.parent.1',
    delegateId: 'agent.synthetic.child.1', delegatorPrivateKey: key.privateKey,
    parentAuthority, childAuthority, parentContextDigest: '4'.repeat(64),
    issuedAt: '2026-08-17T20:06:00.000Z', expiresAt: '2026-08-17T20:40:00.000Z'
  });
  return {
    attenuationProof,
    attenuationEvidence: {
      delegatorPublicKey: key.publicKey, parentAuthority, childAuthority,
      expectedDelegatorId: 'agent.synthetic.parent.1',
      expectedDelegateId: 'agent.synthetic.child.1',
      expectedParentContextDigest: '4'.repeat(64)
    }
  };
}

test('live A10a bundle verification reverifies A1/A2/A4a while granting nothing', () => {
  const f = fixture();
  const result = verifyAgentTrustBundle(bundle(f));
  assert.equal(result.valid, true);
  assert.equal(result.underlying_artifacts_reverified, true);
  assert.equal(result.report_authenticated, false);
  assert.equal(result.portable_assurance, false);
  assert.equal(result.authority_granted, false);
  assert.equal(result.execution_authorized, false);
  assert.equal(result.report.sender.credential_digest, f.identityCredential.credential_digest);
  assert.equal(result.report.authority_manifest.manifest_digest, f.authorityManifest.manifest_digest);
  assert.equal(result.report.handoff.handoff_digest, f.handoff.handoff_digest);
  assert.equal(result.report.claims.delegation_authority_verified, false);
  assert.equal(result.report.claims.global_currentness_verified, false);
  assert.match(result.report.verification_report_digest, /^[a-f0-9]{64}$/);
});

test('detached report checking proves only self-consistency, never underlying artifact verification', () => {
  const f = fixture();
  const { report } = verifyAgentTrustBundle(bundle(f));
  const checked = checkAgentTrustVerificationReportIntegrity(report, {
    sender_principal_id: 'agent.verify.sender.1',
    credential_digest: f.identityCredential.credential_digest,
    authority_manifest_digest: f.authorityManifest.manifest_digest,
    handoff_digest: f.handoff.handoff_digest,
    action: 'system.echo',
    recipient_principal_id: 'agent.verify.recipient.1',
    intended_executor_id: 'executor.verify.1',
    input_digest: INPUT
  });
  assert.equal(checked.valid_report_integrity, true);
  assert.equal(checked.report_authenticated, false);
  assert.equal(checked.underlying_artifacts_reverified, false);
  assert.equal(checked.portable_assurance, false);
  assert.equal(checked.authority_granted, false);
});

test('A3a may be verified only as a separate proof-only artifact', () => {
  const f = fixture();
  const a = attenuation();
  const result = verifyAgentTrustBundle({ ...bundle(f), ...a });
  assert.equal(result.report.attenuation_proof.proof_only, true);
  assert.equal(result.report.attenuation_proof.authority_relation, 'strictly-equal-or-narrower');
  assert.equal(result.report.claims.delegation_authority_verified, false);
  assert.equal(result.report.handoff.delegation_chain_head_digest, null);
});

test('bundle verification rejects identity, target and input substitution', () => {
  const f = fixture();
  const other = fixture();
  assert.throws(() => verifyAgentTrustBundle({
    ...bundle(f), identityCredential: other.identityCredential,
    trustedIssuerPublicKey: other.issuer.publicKey
  }), /does not reproduce|credential does not match|credential digest mismatch/);
  assert.throws(() => verifyAgentTrustBundle({
    ...bundle(f), expectedRecipientIdentityDigest: '9'.repeat(64)
  }), /recipient identity digest mismatch/);
  assert.throws(() => verifyAgentTrustBundle({
    ...bundle(f), expectedInputDigest: '8'.repeat(64)
  }), /input digest mismatch/);
});

test('attenuation evidence without proof fails closed', () => {
  const f = fixture();
  const a = attenuation();
  assert.throws(() => verifyAgentTrustBundle({
    ...bundle(f), attenuationEvidence: a.attenuationEvidence
  }), /attenuation evidence requires an attenuation proof/);
});

test('detached report cannot elevate metadata or authority/currentness/success claims', () => {
  const f = fixture();
  const { report } = verifyAgentTrustBundle(bundle(f));
  for (const [field, value, pattern] of [
    ['authority_granted', true, /authority_granted must remain false/],
    ['execution_authorized', true, /execution_authorized must remain false/],
    ['global_currentness_verified', true, /global_currentness_verified must remain false/],
    ['task_success_verified', true, /task_success_verified must remain false/]
  ]) {
    const altered = structuredClone(report);
    altered.claims[field] = value;
    assert.throws(() => checkAgentTrustVerificationReportIntegrity(altered), pattern);
  }
  const authenticated = structuredClone(report);
  authenticated.report_authentication = 'self-signed';
  assert.throws(
    () => checkAgentTrustVerificationReportIntegrity(authenticated),
    /report_authentication must remain none/
  );
  const portable = structuredClone(report);
  portable.portable_assurance = true;
  assert.throws(
    () => checkAgentTrustVerificationReportIntegrity(portable),
    /portable_assurance must remain false/
  );
});

test('detached report digest and expected checks reject substitution', () => {
  const f = fixture();
  const { report } = verifyAgentTrustBundle(bundle(f));
  assert.throws(() => checkAgentTrustVerificationReportIntegrity({
    ...report, verification_report_digest: '0'.repeat(64)
  }), /verification report digest mismatch/);
  assert.throws(
    () => checkAgentTrustVerificationReportIntegrity(report, { action: 'system.hash' }),
    /action mismatch/
  );
  assert.throws(
    () => checkAgentTrustVerificationReportIntegrity(report, { unsupported_field: 'x' }),
    /expected check unsupported_field is unsupported/
  );
});

test('A10a verifier module contains no private-key, creation, filesystem, network or process-effect path', async () => {
  const source = await readFile(new URL('../src/lib/agent-trust-verifier.mjs', import.meta.url), 'utf8');
  for (const forbidden of [
    "from 'node:crypto'", "from 'node:fs'", "from 'node:fs/promises'",
    "from 'node:child_process'", "from 'node:net'", "from 'node:http'", "from 'node:https'",
    'createPrivateKey', 'generateKeyPair', 'createMachineIdentityCredential',
    'createAgentAuthorityManifest', 'createAgentAttenuationProof', 'createAgentSignedHandoff',
    'spawn(', 'exec(', 'fetch('
  ]) {
    assert.equal(source.includes(forbidden), false, `verifier source must not contain ${forbidden}`);
  }
  for (const required of [
    'verifyMachineIdentityCredential', 'verifyAgentAuthorityManifest',
    'verifyAgentAttenuationProof', 'verifyAgentSignedHandoff'
  ]) assert.equal(source.includes(required), true, `verifier source must use ${required}`);
});
