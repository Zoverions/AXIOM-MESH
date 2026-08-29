import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { digestObject } from '../src/lib/canonical.mjs';
import { MeshIdentity } from '../src/lib/identity.mjs';
import { PolicyEngine } from '../src/lib/policy.mjs';
import { buildMachineDiscovery } from '../src/lib/machine-discovery.mjs';
import { normalizeMachinePrincipalDefinition } from '../src/lib/machine-principal.mjs';
import { buildMachineIntentReceipt } from '../src/lib/machine-receipt.mjs';
import {
  createMachineIdentityCredential,
  createMachineIdentityRevocation
} from '../src/lib/agent-trust-machine-identity.mjs';
import { createAgentAuthorityManifest } from '../src/lib/agent-trust-authority-manifest.mjs';
import { createAgentSignedHandoff } from '../src/lib/agent-trust-signed-handoff.mjs';
import { createAgentPortableWorkReceipt } from '../src/lib/agent-trust-portable-work-receipt.mjs';
import { createAgentCurrentnessCheckpoint } from '../src/lib/agent-trust-currentness-checkpoint.mjs';
import {
  checkAgentTrustVerificationReportIntegrity,
  verifyAgentTrustBundle
} from '../src/lib/agent-trust-verifier.mjs';

const humans = new Set(['owner.alice']);
const INPUT = '1'.repeat(64);
const RECIPIENT_IDENTITY = '2'.repeat(64);

function machineDefinition({ id, runtimeId, software }) {
  return normalizeMachinePrincipalDefinition({
    id,
    type: 'agent',
    sponsor: 'owner.alice',
    roles: ['researcher'],
    scopes: ['intent:execute'],
    lifetime: 'session',
    expires_at: '2026-09-01T00:00:00.000Z',
    runtime: { id: runtimeId, kind: 'local-process', software_digest: software },
    constraints: {
      actions: ['system.echo'],
      purposes: ['test.conformance'],
      destinations: ['local'],
      budgets: {
        max_requests_per_minute: 10,
        max_concurrent_requests: 2,
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
    version: 'atp-verifier-a10b-fixture-v1',
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

function createCredential(principal, issuer, operational) {
  return createMachineIdentityCredential({
    principal,
    issuerId: `identity.${principal.id}`,
    issuerPrivateKey: issuer.privateKey,
    operationalPublicKey: operational.publicKey,
    keyEpoch: 1,
    issuedAt: '2026-08-17T20:00:00.000Z',
    validFrom: '2026-08-17T20:00:00.000Z',
    expiresAt: '2026-08-25T20:00:00.000Z',
    knownHumanPrincipals: humans
  });
}

function gridIdentity() {
  const pair = generateKeyPairSync('ed25519');
  return new MeshIdentity(
    'grid',
    pair.privateKey.export({ type: 'pkcs8', format: 'pem' }),
    pair.publicKey.export({ type: 'spki', format: 'pem' })
  );
}

function buildGridReceipt({ executorPrincipal, executorCredential, grid, status = 'completed' }) {
  const invocationDigest = '7'.repeat(64);
  const requestDigest = '8'.repeat(64);
  const intentId = `intent_${'9'.repeat(64)}`;
  const traceId = 'trace.atp.verifier.a10b';
  const result = {
    message: 'terminal lifecycle output',
    intent_id: intentId,
    trace_id: traceId,
    status: 'completed',
    evidence: {
      invocation_digest: invocationDigest,
      machine_authority_digest: executorCredential.statement.principal_authority_digest
    }
  };
  const error = { code: 'policy_denied', message: 'not exposed in receipt' };
  const intent = {
    intent_id: intentId,
    trace_id: traceId,
    principal: executorPrincipal.id,
    action: 'system.echo',
    risk: status === 'completed' ? 'low' : 'high',
    status,
    input_digest: INPUT,
    request_digest: requestDigest,
    result_json: status === 'completed' ? result : null,
    error_json: status === 'completed' ? null : error,
    created_at: '2026-08-17T20:03:00.000Z',
    updated_at: '2026-08-17T20:04:00.000Z'
  };
  const acceptedPayload = {
    intent_id: intentId,
    principal: executorPrincipal.id,
    action: 'system.echo',
    input_digest: INPUT,
    request_digest: requestDigest,
    invocation_digest: invocationDigest,
    machine_authority: {
      authority_digest: executorCredential.statement.principal_authority_digest
    }
  };
  const terminalPayload = status === 'completed'
    ? { intent_id: intentId, result }
    : { intent_id: intentId, error };
  const events = [
    {
      seq: 20,
      event_id: 'evt.a10b.accepted',
      trace_id: traceId,
      actor: executorPrincipal.id,
      kind: 'intent.accepted',
      subject: intentId,
      occurred_at: intent.created_at,
      payload: acceptedPayload,
      payload_digest: digestObject(acceptedPayload),
      event_hash: 'a'.repeat(64),
      signature: { key_id: 'grid:test' }
    },
    {
      seq: 21,
      event_id: 'evt.a10b.terminal',
      trace_id: traceId,
      actor: executorPrincipal.id,
      kind: `intent.${status}`,
      subject: intentId,
      occurred_at: intent.updated_at,
      payload: terminalPayload,
      payload_digest: digestObject(terminalPayload),
      event_hash: 'b'.repeat(64),
      signature: { key_id: 'grid:test' }
    }
  ];
  return buildMachineIntentReceipt({
    intent,
    events,
    chain: {
      valid: true,
      events: 21,
      head: 'c'.repeat(64),
      verification_mode: 'checkpoint',
      prefix_assurance: 'signed_checkpoint',
      verified_events: 1,
      verified_from_seq: 21,
      verified_through_seq: 21,
      checkpoint_count: 1,
      checkpoint_seq: 20,
      full_verification_required_for_checkpointed_prefix_revalidation: true
    },
    identity: grid,
    kernelVersion: '0.12.0-dev.3'
  });
}

function fixture({ status = 'completed' } = {}) {
  const senderIssuer = generateKeyPairSync('ed25519');
  const senderOperational = generateKeyPairSync('ed25519');
  const executorIssuer = generateKeyPairSync('ed25519');
  const executorOperational = generateKeyPairSync('ed25519');
  const senderObserver = generateKeyPairSync('ed25519');
  const executorObserver = generateKeyPairSync('ed25519');

  const senderPrincipal = machineDefinition({
    id: 'agent.verify.sender.1',
    runtimeId: 'runtime.verify.sender.1',
    software: 'a'.repeat(64)
  });
  const executorPrincipal = machineDefinition({
    id: 'agent.verify.executor.1',
    runtimeId: 'runtime.verify.executor.1',
    software: 'd'.repeat(64)
  });
  const senderCredential = createCredential(senderPrincipal, senderIssuer, senderOperational);
  const executorCredential = createCredential(executorPrincipal, executorIssuer, executorOperational);

  const activePolicy = policy();
  const discovery = buildMachineDiscovery({
    principal: senderPrincipal,
    policy: new PolicyEngine(activePolicy),
    kernelVersion: '0.12.0-dev.3'
  });
  const capabilityRegistry = {
    schema: 'axiom-capabilities.v1',
    capabilities: [{ id: 'core.echo', status: 'implemented' }]
  };
  const authorityManifest = createAgentAuthorityManifest({
    principal: senderPrincipal,
    identityCredential: senderCredential,
    trustedIssuerPublicKey: senderIssuer.publicKey,
    discovery,
    policy: activePolicy,
    capabilityRegistry,
    createdAt: '2026-08-17T20:01:00.000Z',
    expiresAt: '2026-08-17T20:10:00.000Z',
    knownHumanPrincipals: humans
  });
  const authorityEvidence = {
    principal: senderPrincipal,
    identityCredential: senderCredential,
    trustedIssuerPublicKey: senderIssuer.publicKey,
    discovery,
    policy: activePolicy,
    capabilityRegistry,
    knownHumanPrincipals: humans
  };
  const handoff = createAgentSignedHandoff({
    handoffId: 'handoff.verify.a10b.1',
    parentTaskId: 'task.verify.a10b.root.1',
    recipientPrincipalId: 'agent.verify.recipient.1',
    recipientIdentityDigest: RECIPIENT_IDENTITY,
    intendedExecutorId: executorPrincipal.id,
    intendedExecutorIdentityDigest: executorCredential.credential_digest,
    identityCredential: senderCredential,
    trustedIssuerPublicKey: senderIssuer.publicKey,
    authorityManifest,
    authorityEvidence,
    operationalPrivateKey: senderOperational.privateKey,
    action: 'system.echo',
    purpose: 'test.conformance',
    destination: 'local',
    inputDigest: INPUT,
    contextDigests: [],
    evidenceObligations: ['grid.terminal-receipt'],
    expectedOutputClasses: ['portable.work-receipt'],
    resourceCeiling: {
      max_requests_per_minute: 5,
      max_concurrent_requests: 1,
      max_execution_ms: 3_000,
      max_request_bytes: 32_768,
      max_response_bytes: 131_072
    },
    notBefore: '2026-08-17T20:02:00.000Z',
    expiresAt: '2026-08-17T20:06:00.000Z',
    nonce: 'nonce.verify.a10b.1',
    idempotencyKey: 'idem.verify.a10b.1'
  });
  const grid = gridIdentity();
  const gridMachineReceipt = buildGridReceipt({
    executorPrincipal,
    executorCredential,
    grid,
    status
  });
  const portableWorkReceipt = createAgentPortableWorkReceipt({
    receiptId: 'work.receipt.verify.a10b.1',
    handoff,
    handoffEvidence: {
      identityCredential: senderCredential,
      trustedIssuerPublicKey: senderIssuer.publicKey,
      authorityManifest,
      authorityEvidence
    },
    executorIdentityCredential: executorCredential,
    trustedExecutorIssuerPublicKey: executorIssuer.publicKey,
    executorOperationalPrivateKey: executorOperational.privateKey,
    gridMachineReceipt,
    gridPublicKey: grid.publicKey,
    reportedArtifactDigests: [],
    reportedEvidenceDigests: []
  });

  const senderCheckpoint = createAgentCurrentnessCheckpoint({
    checkpointId: 'currentness.verify.sender.1',
    checkpointSequence: 1,
    credentialHistory: [senderCredential],
    revocations: [],
    trustedIssuerPublicKey: senderIssuer.publicKey,
    observerId: 'observer.verify.sender.1',
    observerPrivateKey: senderObserver.privateKey,
    evaluatedAt: '2026-08-17T20:02:50.000Z'
  });
  const executorCheckpoint = createAgentCurrentnessCheckpoint({
    checkpointId: 'currentness.verify.executor.1',
    checkpointSequence: 1,
    credentialHistory: [executorCredential],
    revocations: [],
    trustedIssuerPublicKey: executorIssuer.publicKey,
    observerId: 'observer.verify.executor.1',
    observerPrivateKey: executorObserver.privateKey,
    evaluatedAt: '2026-08-17T20:02:50.000Z'
  });

  return {
    senderIssuer,
    senderOperational,
    senderPrincipal,
    senderCredential,
    executorIssuer,
    executorOperational,
    executorPrincipal,
    executorCredential,
    senderObserver,
    executorObserver,
    authorityManifest,
    authorityEvidence,
    handoff,
    grid,
    gridMachineReceipt,
    portableWorkReceipt,
    senderCheckpoint,
    executorCheckpoint
  };
}

function bundle(f) {
  return {
    identityCredential: f.senderCredential,
    trustedIssuerPublicKey: f.senderIssuer.publicKey,
    authorityManifest: f.authorityManifest,
    authorityEvidence: f.authorityEvidence,
    handoff: f.handoff,
    expectedRecipientPrincipalId: 'agent.verify.recipient.1',
    expectedRecipientIdentityDigest: RECIPIENT_IDENTITY,
    expectedExecutorId: f.executorPrincipal.id,
    expectedExecutorIdentityDigest: f.executorCredential.credential_digest,
    expectedInputDigest: INPUT,
    expectedParentTaskId: 'task.verify.a10b.root.1',
    portableWorkReceipt: f.portableWorkReceipt,
    portableWorkReceiptEvidence: {
      executorIdentityCredential: f.executorCredential,
      trustedExecutorIssuerPublicKey: f.executorIssuer.publicKey,
      gridMachineReceipt: f.gridMachineReceipt,
      gridPublicKey: f.grid.publicKey
    },
    senderCurrentnessEvidence: {
      checkpoint: f.senderCheckpoint,
      trustedObserverPublicKey: f.senderObserver.publicKey,
      credentialHistory: [f.senderCredential],
      revocations: [],
      expectedLatestCheckpointDigest: f.senderCheckpoint.checkpoint_digest,
      maxEvidenceAgeMs: 30_000
    },
    executorCurrentnessEvidence: {
      checkpoint: f.executorCheckpoint,
      trustedObserverPublicKey: f.executorObserver.publicKey,
      credentialHistory: [f.executorCredential],
      revocations: [],
      expectedLatestCheckpointDigest: f.executorCheckpoint.checkpoint_digest,
      maxEvidenceAgeMs: 30_000
    }
  };
}

test('A10b live verifier reverifies A1/A2/A4/A5a/A6a but does not infer effect or global currentness', () => {
  const f = fixture();
  const result = verifyAgentTrustBundle(bundle(f));
  assert.equal(result.valid, true);
  assert.equal(result.underlying_artifacts_reverified, true);
  assert.equal(result.component_verification.identity, true);
  assert.equal(result.component_verification.authority_manifest, true);
  assert.equal(result.component_verification.signed_handoff, true);
  assert.equal(result.component_verification.portable_work_receipt, true);
  assert.equal(result.component_verification.sender_retained_currentness, true);
  assert.equal(result.component_verification.executor_retained_currentness, true);
  assert.equal(result.component_verification.effect_specific_receipt, false);
  assert.equal(result.retained_currentness_reverified, true);
  assert.equal(result.currentness_context, 'grid-intent-start-not-proven-first-effect-boundary');
  assert.equal(result.global_currentness_verified, false);
  assert.equal(result.effect_boundary_currentness_verified, false);
  assert.equal(result.effect_specific_receipt_verified, false);
  assert.equal(result.authority_granted, false);
  assert.equal(result.execution_authorized, false);
  assert.equal(result.report.portable_work_receipt.receipt_digest, f.portableWorkReceipt.receipt_digest);
  assert.equal(result.report.retained_currentness.sender.checkpoint_digest, f.senderCheckpoint.checkpoint_digest);
  assert.equal(result.report.retained_currentness.executor.checkpoint_digest, f.executorCheckpoint.checkpoint_digest);
  assert.equal(result.report.retained_currentness.checked_at, '2026-08-17T20:03:00.000Z');
  assert.equal(result.report.claims.effect_execution_verified, false);
  assert.equal(result.report.claims.effect_boundary_currentness_verified, false);
  assert.equal(result.report.claims.memory_provenance_verified, false);
});

test('detached A10b report checking proves self-consistency only, not that live reverification happened', () => {
  const f = fixture();
  const { report } = verifyAgentTrustBundle(bundle(f));
  const checked = checkAgentTrustVerificationReportIntegrity(report, {
    sender_principal_id: f.senderPrincipal.id,
    credential_digest: f.senderCredential.credential_digest,
    authority_manifest_digest: f.authorityManifest.manifest_digest,
    handoff_digest: f.handoff.handoff_digest,
    portable_work_receipt_digest: f.portableWorkReceipt.receipt_digest,
    grid_machine_receipt_digest: f.gridMachineReceipt.receipt_digest,
    executor_credential_digest: f.executorCredential.credential_digest,
    sender_currentness_checkpoint_digest: f.senderCheckpoint.checkpoint_digest,
    executor_currentness_checkpoint_digest: f.executorCheckpoint.checkpoint_digest
  });
  assert.equal(checked.valid_report_integrity, true);
  assert.equal(checked.report_authenticated, false);
  assert.equal(checked.underlying_artifacts_reverified, false);
  assert.equal(checked.retained_currentness_reverified, false);
  assert.equal(checked.global_currentness_verified, false);
  assert.equal(checked.effect_boundary_currentness_verified, false);
  assert.equal(checked.effect_specific_receipt_verified, false);
});

test('revoked executor evidence causes the live A10b bundle to fail closed', () => {
  const f = fixture();
  const revocation = createMachineIdentityRevocation({
    credential: f.executorCredential,
    issuerPrivateKey: f.executorIssuer.privateKey,
    effectiveAt: '2026-08-17T20:02:55.000Z',
    reasonCode: 'compromised'
  });
  const revokedCheckpoint = createAgentCurrentnessCheckpoint({
    checkpointId: 'currentness.verify.executor.revoked',
    checkpointSequence: 1,
    credentialHistory: [f.executorCredential],
    revocations: [revocation],
    trustedIssuerPublicKey: f.executorIssuer.publicKey,
    observerId: 'observer.verify.executor.1',
    observerPrivateKey: f.executorObserver.privateKey,
    evaluatedAt: '2026-08-17T20:02:56.000Z'
  });
  assert.throws(() => verifyAgentTrustBundle({
    ...bundle(f),
    executorCurrentnessEvidence: {
      checkpoint: revokedCheckpoint,
      trustedObserverPublicKey: f.executorObserver.publicKey,
      credentialHistory: [f.executorCredential],
      revocations: [revocation],
      expectedLatestCheckpointDigest: revokedCheckpoint.checkpoint_digest,
      maxEvidenceAgeMs: 30_000
    }
  }), /revoked; new effect denied/);
});

test('A10b requires exact retained latest-head evidence for both sender and executor', () => {
  const f = fixture();
  const missingSenderHead = structuredClone(bundle(f));
  delete missingSenderHead.senderCurrentnessEvidence.expectedLatestCheckpointDigest;
  assert.throws(
    () => verifyAgentTrustBundle(missingSenderHead),
    /expectedLatestCheckpointDigest/
  );

  assert.throws(() => verifyAgentTrustBundle({
    ...bundle(f),
    executorCurrentnessEvidence: {
      ...bundle(f).executorCurrentnessEvidence,
      expectedLatestCheckpointDigest: '0'.repeat(64)
    }
  }), /not the expected retained latest head/);
});

test('A10b rejects portable-receipt or executor identity substitution before report creation', () => {
  const f = fixture();
  const other = fixture();
  assert.throws(() => verifyAgentTrustBundle({
    ...bundle(f),
    portableWorkReceiptEvidence: {
      ...bundle(f).portableWorkReceiptEvidence,
      executorIdentityCredential: other.executorCredential,
      trustedExecutorIssuerPublicKey: other.executorIssuer.publicKey
    }
  }), /principal_id mismatch|executor credential does not match handoff target identity digest/);
});

test('detached A10b report cannot elevate currentness, effect, task-success, authority or authentication claims', () => {
  const f = fixture();
  const { report } = verifyAgentTrustBundle(bundle(f));
  for (const [field, pattern] of [
    ['authority_granted', /authority_granted must remain false/],
    ['global_currentness_verified', /global_currentness_verified must remain false/],
    ['effect_boundary_currentness_verified', /effect_boundary_currentness_verified must remain false/],
    ['effect_execution_verified', /effect_execution_verified must remain false/],
    ['task_success_verified', /task_success_verified must remain false/]
  ]) {
    const altered = structuredClone(report);
    altered.claims[field] = true;
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

test('detached A10b report digest and expected-field substitution fail closed', () => {
  const f = fixture();
  const { report } = verifyAgentTrustBundle(bundle(f));
  assert.throws(() => checkAgentTrustVerificationReportIntegrity({
    ...report,
    verification_report_digest: '0'.repeat(64)
  }), /verification report digest mismatch/);
  assert.throws(
    () => checkAgentTrustVerificationReportIntegrity(report, {
      portable_work_receipt_digest: '0'.repeat(64)
    }),
    /portable_work_receipt_digest mismatch/
  );
  assert.throws(
    () => checkAgentTrustVerificationReportIntegrity(report, { unsupported_field: 'x' }),
    /expected check unsupported_field is unsupported/
  );
});

test('A10b verifier source remains verification-only and effect-inert', async () => {
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
    'createAgentPortableWorkReceipt',
    'createAgentCurrentnessCheckpoint',
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
    'verifyAgentSignedHandoff',
    'verifyAgentPortableWorkReceipt',
    'evaluateAgentCurrentnessAtEffect'
  ]) {
    assert.equal(source.includes(required), true, `verifier source must use ${required}`);
  }
});
