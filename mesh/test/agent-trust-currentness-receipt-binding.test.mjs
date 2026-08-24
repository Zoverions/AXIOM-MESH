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
  createAgentPortableReceiptCurrentnessBinding,
  verifyAgentPortableReceiptCurrentnessBinding
} from '../src/lib/agent-trust-currentness-receipt-binding.mjs';

const HUMANS = new Set(['owner.alice']);
const INPUT = '1'.repeat(64);
const RECIPIENT_IDENTITY = '2'.repeat(64);

function machineDefinition({ id, runtimeId, software = 'a'.repeat(64) }) {
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
    knownHumanPrincipals: HUMANS,
    now: new Date('2026-08-17T19:00:00.000Z')
  });
}

function activePolicy() {
  return {
    version: 'portable-currentness-binding-fixture-v1',
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

function capabilities() {
  return {
    schema: 'axiom-capabilities.v1',
    capabilities: [{ id: 'core.echo', status: 'implemented' }]
  };
}

function credential(principal, issuer, operational, overrides = {}) {
  return createMachineIdentityCredential({
    principal,
    issuerId: `identity.${principal.id}`,
    issuerPrivateKey: issuer.privateKey,
    operationalPublicKey: operational.publicKey,
    keyEpoch: 1,
    issuedAt: '2026-08-17T20:00:00.000Z',
    validFrom: '2026-08-17T20:00:00.000Z',
    expiresAt: '2026-08-25T20:00:00.000Z',
    knownHumanPrincipals: HUMANS,
    ...overrides
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

function buildGridReceipt({ executor, grid }) {
  const invocationDigest = '7'.repeat(64);
  const requestDigest = '8'.repeat(64);
  const intentId = `intent_${'9'.repeat(64)}`;
  const traceId = 'trace.portable-currentness-binding';
  const createdAt = '2026-08-17T20:03:00.000Z';
  const updatedAt = '2026-08-17T20:04:00.000Z';
  const result = {
    message: 'terminal lifecycle output',
    intent_id: intentId,
    trace_id: traceId,
    status: 'completed',
    evidence: {
      invocation_digest: invocationDigest,
      machine_authority_digest: executor.credential.statement.principal_authority_digest
    }
  };
  const intent = {
    intent_id: intentId,
    trace_id: traceId,
    principal: executor.principal.id,
    action: 'system.echo',
    risk: 'low',
    status: 'completed',
    input_digest: INPUT,
    request_digest: requestDigest,
    result_json: result,
    error_json: null,
    created_at: createdAt,
    updated_at: updatedAt
  };
  const acceptedPayload = {
    intent_id: intentId,
    principal: executor.principal.id,
    action: 'system.echo',
    input_digest: INPUT,
    request_digest: requestDigest,
    invocation_digest: invocationDigest,
    machine_authority: {
      authority_digest: executor.credential.statement.principal_authority_digest
    }
  };
  const terminalPayload = { intent_id: intentId, result };
  const events = [
    {
      seq: 20,
      event_id: 'evt.portable-currentness.accepted',
      trace_id: traceId,
      actor: executor.principal.id,
      kind: 'intent.accepted',
      subject: intentId,
      occurred_at: createdAt,
      payload: acceptedPayload,
      payload_digest: digestObject(acceptedPayload),
      event_hash: 'a'.repeat(64),
      signature: { key_id: 'grid:test' }
    },
    {
      seq: 21,
      event_id: 'evt.portable-currentness.completed',
      trace_id: traceId,
      actor: executor.principal.id,
      kind: 'intent.completed',
      subject: intentId,
      occurred_at: updatedAt,
      payload: terminalPayload,
      payload_digest: digestObject(terminalPayload),
      event_hash: 'b'.repeat(64),
      signature: { key_id: 'grid:test' }
    }
  ];
  const chain = {
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
  };
  return buildMachineIntentReceipt({
    intent,
    events,
    chain,
    identity: grid,
    kernelVersion: '0.12.0-dev.3'
  });
}

function fixture() {
  const senderIssuer = generateKeyPairSync('ed25519');
  const senderOperational = generateKeyPairSync('ed25519');
  const executorIssuer = generateKeyPairSync('ed25519');
  const executorOperational = generateKeyPairSync('ed25519');
  const observer = generateKeyPairSync('ed25519');
  const senderPrincipal = machineDefinition({
    id: 'agent.sender.binding.1',
    runtimeId: 'runtime.sender.binding.1'
  });
  const executorPrincipal = machineDefinition({
    id: 'agent.executor.binding.1',
    runtimeId: 'runtime.executor.binding.1',
    software: 'd'.repeat(64)
  });
  const senderCredential = credential(senderPrincipal, senderIssuer, senderOperational);
  const executorCredential = credential(executorPrincipal, executorIssuer, executorOperational);

  const policy = activePolicy();
  const discovery = buildMachineDiscovery({
    principal: senderPrincipal,
    policy: new PolicyEngine(policy),
    kernelVersion: '0.12.0-dev.3'
  });
  const capabilityRegistry = capabilities();
  const authorityManifest = createAgentAuthorityManifest({
    principal: senderPrincipal,
    identityCredential: senderCredential,
    trustedIssuerPublicKey: senderIssuer.publicKey,
    discovery,
    policy,
    capabilityRegistry,
    createdAt: '2026-08-17T20:01:00.000Z',
    expiresAt: '2026-08-17T20:10:00.000Z',
    knownHumanPrincipals: HUMANS
  });
  const authorityEvidence = {
    principal: senderPrincipal,
    identityCredential: senderCredential,
    trustedIssuerPublicKey: senderIssuer.publicKey,
    discovery,
    policy,
    capabilityRegistry,
    knownHumanPrincipals: HUMANS
  };
  const handoff = createAgentSignedHandoff({
    handoffId: 'handoff.binding.1',
    parentTaskId: 'task.binding.root.1',
    recipientPrincipalId: 'agent.receiver.binding.1',
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
    evidenceObligations: ['grid.terminal-receipt', 'identity.currentness'],
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
    nonce: 'nonce.binding.1',
    idempotencyKey: 'idem.binding.1'
  });
  const handoffEvidence = {
    identityCredential: senderCredential,
    trustedIssuerPublicKey: senderIssuer.publicKey,
    authorityManifest,
    authorityEvidence
  };
  const grid = gridIdentity();
  const executor = {
    principal: executorPrincipal,
    credential: executorCredential,
    issuer: executorIssuer,
    operational: executorOperational
  };
  const gridReceipt = buildGridReceipt({ executor, grid });
  const portableWorkReceipt = createAgentPortableWorkReceipt({
    receiptId: 'work.binding.1',
    handoff,
    handoffEvidence,
    executorIdentityCredential: executorCredential,
    trustedExecutorIssuerPublicKey: executorIssuer.publicKey,
    executorOperationalPrivateKey: executorOperational.privateKey,
    gridMachineReceipt: gridReceipt,
    gridPublicKey: grid.publicKey,
    reportedArtifactDigests: [],
    reportedEvidenceDigests: []
  });
  const portableReceiptEvidence = {
    handoff,
    handoffEvidence,
    executorIdentityCredential: executorCredential,
    trustedExecutorIssuerPublicKey: executorIssuer.publicKey,
    gridMachineReceipt: gridReceipt,
    gridPublicKey: grid.publicKey
  };
  const checkpoint = createAgentCurrentnessCheckpoint({
    checkpointId: 'currentness.binding.1',
    checkpointSequence: 1,
    credentialHistory: [executorCredential],
    revocations: [],
    trustedIssuerPublicKey: executorIssuer.publicKey,
    observerId: 'observer.binding.1',
    observerPrivateKey: observer.privateKey,
    evaluatedAt: '2026-08-17T20:02:45.000Z'
  });
  const currentnessEvidence = {
    checkpoint,
    trustedObserverPublicKey: observer.publicKey,
    credentialHistory: [executorCredential],
    revocations: [],
    trustedIssuerPublicKey: executorIssuer.publicKey,
    expectedLatestCheckpointDigest: checkpoint.checkpoint_digest,
    maxEvidenceAgeMs: 30_000
  };
  return {
    senderIssuer,
    senderOperational,
    executorIssuer,
    executorOperational,
    observer,
    executorPrincipal,
    executorCredential,
    portableWorkReceipt,
    portableReceiptEvidence,
    currentnessEvidence
  };
}

function createBinding(f = fixture(), overrides = {}) {
  return createAgentPortableReceiptCurrentnessBinding({
    portableWorkReceipt: f.portableWorkReceipt,
    portableReceiptEvidence: f.portableReceiptEvidence,
    currentnessEvidence: f.currentnessEvidence,
    ...overrides
  });
}

test('A5/A6 composition rechecks exact executor currentness at Grid intent start without creating authority', () => {
  const f = fixture();
  const binding = createBinding(f);
  const verified = verifyAgentPortableReceiptCurrentnessBinding(binding, {
    portableWorkReceipt: f.portableWorkReceipt,
    portableReceiptEvidence: f.portableReceiptEvidence,
    currentnessEvidence: f.currentnessEvidence
  });

  assert.equal(binding.executor_principal_id, f.executorPrincipal.id);
  assert.equal(binding.executor_credential_digest, f.executorCredential.credential_digest);
  assert.equal(binding.currentness_active_credential_digest, f.executorCredential.credential_digest);
  assert.equal(binding.grid_intent_started_at, '2026-08-17T20:03:00.000Z');
  assert.equal(binding.currentness_rechecked_at, binding.grid_intent_started_at);
  assert.equal(binding.currentness_evidence_age_ms, 15_000);
  assert.equal(binding.currentness_consulted_by_original_effect_path, false);
  assert.equal(binding.effect_admission_authorized, false);
  assert.equal(binding.consume_before_effect_observed, false);
  assert.equal(binding.task_success_claimed, false);
  assert.equal(binding.effect_specific_execution_claimed, false);
  assert.equal(binding.binding_signature_present, false);
  assert.equal(binding.authority_effect, 'none');
  assert.equal(verified.valid, true);
});

test('caller cannot move the currentness recheck away from the verified Grid intent start', () => {
  const f = fixture();
  const binding = createBinding(f, {
    currentnessEvidence: {
      ...f.currentnessEvidence,
      effectAt: '2026-08-17T20:02:46.000Z'
    }
  });
  assert.equal(binding.currentness_rechecked_at, '2026-08-17T20:03:00.000Z');
});

test('rotated active credential cannot be substituted for the credential that signed A5', () => {
  const f = fixture();
  const operational2 = generateKeyPairSync('ed25519');
  const credential2 = credential(f.executorPrincipal, f.executorIssuer, operational2, {
    keyEpoch: 2,
    issuedAt: '2026-08-17T20:02:30.000Z',
    validFrom: '2026-08-17T20:02:40.000Z',
    transitionKind: 'rotation',
    predecessorDisposition: 'retired',
    credentialHistory: [f.executorCredential]
  });
  const checkpoint = createAgentCurrentnessCheckpoint({
    checkpointId: 'currentness.binding.rotation.1',
    checkpointSequence: 1,
    credentialHistory: [f.executorCredential, credential2],
    revocations: [],
    trustedIssuerPublicKey: f.executorIssuer.publicKey,
    observerId: 'observer.binding.1',
    observerPrivateKey: f.observer.privateKey,
    evaluatedAt: '2026-08-17T20:02:50.000Z'
  });

  assert.throws(() => createBinding(f, {
    currentnessEvidence: {
      checkpoint,
      trustedObserverPublicKey: f.observer.publicKey,
      credentialHistory: [f.executorCredential, credential2],
      revocations: [],
      trustedIssuerPublicKey: f.executorIssuer.publicKey,
      expectedLatestCheckpointDigest: checkpoint.checkpoint_digest,
      maxEvidenceAgeMs: 30_000
    }
  }), /active credential does not match verified executor credential/);
});

test('revoked executor identity fails before a composite can be created', () => {
  const f = fixture();
  const revocation = createMachineIdentityRevocation({
    credential: f.executorCredential,
    issuerPrivateKey: f.executorIssuer.privateKey,
    effectiveAt: '2026-08-17T20:02:30.000Z',
    reasonCode: 'compromised'
  });
  const checkpoint = createAgentCurrentnessCheckpoint({
    checkpointId: 'currentness.binding.revoked.1',
    checkpointSequence: 1,
    credentialHistory: [f.executorCredential],
    revocations: [revocation],
    trustedIssuerPublicKey: f.executorIssuer.publicKey,
    observerId: 'observer.binding.1',
    observerPrivateKey: f.observer.privateKey,
    evaluatedAt: '2026-08-17T20:02:45.000Z'
  });

  assert.throws(() => createBinding(f, {
    currentnessEvidence: {
      checkpoint,
      trustedObserverPublicKey: f.observer.publicKey,
      credentialHistory: [f.executorCredential],
      revocations: [revocation],
      trustedIssuerPublicKey: f.executorIssuer.publicKey,
      expectedLatestCheckpointDigest: checkpoint.checkpoint_digest,
      maxEvidenceAgeMs: 30_000
    }
  }), /revoked; new effect denied/);
});

test('stale retained evidence cannot be stretched to the receipt start boundary', () => {
  const f = fixture();
  const checkpoint = createAgentCurrentnessCheckpoint({
    checkpointId: 'currentness.binding.stale.1',
    checkpointSequence: 1,
    credentialHistory: [f.executorCredential],
    revocations: [],
    trustedIssuerPublicKey: f.executorIssuer.publicKey,
    observerId: 'observer.binding.1',
    observerPrivateKey: f.observer.privateKey,
    evaluatedAt: '2026-08-17T20:01:00.000Z'
  });
  assert.throws(() => createBinding(f, {
    currentnessEvidence: {
      checkpoint,
      trustedObserverPublicKey: f.observer.publicKey,
      credentialHistory: [f.executorCredential],
      revocations: [],
      trustedIssuerPublicKey: f.executorIssuer.publicKey,
      expectedLatestCheckpointDigest: checkpoint.checkpoint_digest,
      maxEvidenceAgeMs: 30_000
    }
  }), /too stale/);
});

test('latest retained checkpoint head remains mandatory through the composite', () => {
  const f = fixture();
  const { expectedLatestCheckpointDigest, ...withoutLatest } = f.currentnessEvidence;
  void expectedLatestCheckpointDigest;
  assert.throws(
    () => createBinding(f, { currentnessEvidence: withoutLatest }),
    /expectedLatestCheckpointDigest/
  );
});

test('binding tamper and semantic elevation fail closed', () => {
  const f = fixture();
  const binding = createBinding(f);

  const elevated = { ...binding, effect_admission_authorized: true };
  assert.throws(
    () => verifyAgentPortableReceiptCurrentnessBinding(elevated, {
      portableWorkReceipt: f.portableWorkReceipt,
      portableReceiptEvidence: f.portableReceiptEvidence,
      currentnessEvidence: f.currentnessEvidence
    }),
    /effect_admission_authorized must remain false/
  );

  const extra = { ...binding, execution_authorized: true };
  assert.throws(
    () => verifyAgentPortableReceiptCurrentnessBinding(extra, {
      portableWorkReceipt: f.portableWorkReceipt,
      portableReceiptEvidence: f.portableReceiptEvidence,
      currentnessEvidence: f.currentnessEvidence
    }),
    /unsupported field execution_authorized/
  );

  const digestTamper = { ...binding, binding_digest: 'f'.repeat(64) };
  assert.throws(
    () => verifyAgentPortableReceiptCurrentnessBinding(digestTamper, {
      portableWorkReceipt: f.portableWorkReceipt,
      portableReceiptEvidence: f.portableReceiptEvidence,
      currentnessEvidence: f.currentnessEvidence
    }),
    /does not reproduce from bound evidence/
  );
});

test('currentness receipt binding implementation remains pure and effect-inert', async () => {
  const source = await readFile(
    new URL('../src/lib/agent-trust-currentness-receipt-binding.mjs', import.meta.url),
    'utf8'
  );
  for (const forbidden of [
    'node:fs',
    'node:child_process',
    'node:net',
    'node:http',
    'node:https',
    'node:dgram',
    'node:worker_threads',
    'fetch('
  ]) {
    assert.equal(source.includes(forbidden), false, `unexpected effect-capable primitive: ${forbidden}`);
  }
});
