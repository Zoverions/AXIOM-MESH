import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import test from 'node:test';

import { digestObject } from '../src/lib/canonical.mjs';
import { MeshIdentity } from '../src/lib/identity.mjs';
import { PolicyEngine } from '../src/lib/policy.mjs';
import { buildMachineDiscovery } from '../src/lib/machine-discovery.mjs';
import { normalizeMachinePrincipalDefinition } from '../src/lib/machine-principal.mjs';
import { buildMachineIntentReceipt } from '../src/lib/machine-receipt.mjs';
import { createMachineIdentityCredential } from '../src/lib/agent-trust-machine-identity.mjs';
import { createAgentAuthorityManifest } from '../src/lib/agent-trust-authority-manifest.mjs';
import { createAgentSignedHandoff } from '../src/lib/agent-trust-signed-handoff.mjs';
import {
  createAgentPortableWorkReceipt,
  verifyAgentPortableWorkReceipt
} from '../src/lib/agent-trust-portable-work-receipt.mjs';

const humans = new Set(['owner.alice']);
const INPUT = '1'.repeat(64);
const RECIPIENT_IDENTITY = '2'.repeat(64);
const ARTIFACT_A = '3'.repeat(64);
const ARTIFACT_B = '4'.repeat(64);
const EVIDENCE_A = '5'.repeat(64);
const EVIDENCE_B = '6'.repeat(64);

function machineDefinition({ id, runtimeId, software = 'a'.repeat(64), actions = ['system.echo'] }) {
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
      actions,
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
    version: 'portable-work-receipt-fixture-v1',
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

function credential(principal, issuer, operational) {
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

function buildGridReceipt({
  executor,
  status = 'completed',
  action = 'system.echo',
  inputDigest = INPUT,
  principal = executor.principal.id,
  authorityDigest = executor.credential.statement.principal_authority_digest,
  createdAt = '2026-08-17T20:03:00.000Z',
  updatedAt = '2026-08-17T20:04:00.000Z',
  grid = executor.grid
} = {}) {
  const invocationDigest = '7'.repeat(64);
  const requestDigest = '8'.repeat(64);
  const intentId = `intent_${'9'.repeat(64)}`;
  const traceId = 'trace.portable-work-receipt';
  const result = {
    message: 'terminal lifecycle output',
    intent_id: intentId,
    trace_id: traceId,
    status: 'completed',
    evidence: {
      invocation_digest: invocationDigest,
      machine_authority_digest: authorityDigest
    }
  };
  const error = { code: 'policy_denied', message: 'not exposed in receipt' };
  const intent = {
    intent_id: intentId,
    trace_id: traceId,
    principal,
    action,
    risk: status === 'completed' ? 'low' : 'high',
    status,
    input_digest: inputDigest,
    request_digest: requestDigest,
    result_json: status === 'completed' ? result : null,
    error_json: status === 'completed' ? null : error,
    created_at: createdAt,
    updated_at: updatedAt
  };
  const acceptedPayload = {
    intent_id: intentId,
    principal,
    action,
    input_digest: inputDigest,
    request_digest: requestDigest,
    invocation_digest: invocationDigest,
    machine_authority: { authority_digest: authorityDigest }
  };
  const terminalPayload = status === 'completed'
    ? { intent_id: intentId, result }
    : { intent_id: intentId, error };
  const events = [
    {
      seq: 20,
      event_id: 'evt.portable.accepted',
      trace_id: traceId,
      actor: principal,
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
      event_id: 'evt.portable.terminal',
      trace_id: traceId,
      actor: principal,
      kind: `intent.${status}`,
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

function fixture({ status = 'completed' } = {}) {
  const senderIssuer = generateKeyPairSync('ed25519');
  const senderOperational = generateKeyPairSync('ed25519');
  const executorIssuer = generateKeyPairSync('ed25519');
  const executorOperational = generateKeyPairSync('ed25519');
  const senderPrincipal = machineDefinition({
    id: 'agent.sender.work.1',
    runtimeId: 'runtime.sender.work.1'
  });
  const executorPrincipal = machineDefinition({
    id: 'agent.executor.work.1',
    runtimeId: 'runtime.executor.work.1',
    software: 'd'.repeat(64)
  });
  const senderCredential = credential(senderPrincipal, senderIssuer, senderOperational);
  const executorCredential = credential(executorPrincipal, executorIssuer, executorOperational);
  const activePolicy = policy();
  const engine = new PolicyEngine(activePolicy);
  const discovery = buildMachineDiscovery({
    principal: senderPrincipal,
    policy: engine,
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
    handoffId: 'handoff.work.1',
    parentTaskId: 'task.root.1',
    recipientPrincipalId: 'agent.receiver.work.1',
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
    nonce: 'nonce.work.1',
    idempotencyKey: 'idem.work.1'
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
    operational: executorOperational,
    grid
  };
  const gridReceipt = buildGridReceipt({ executor, status });
  return {
    senderIssuer,
    senderOperational,
    senderPrincipal,
    senderCredential,
    authorityManifest,
    authorityEvidence,
    handoff,
    handoffEvidence,
    executor,
    gridReceipt
  };
}

function create(f = fixture(), overrides = {}) {
  return createAgentPortableWorkReceipt({
    receiptId: 'work.receipt.1',
    handoff: f.handoff,
    handoffEvidence: f.handoffEvidence,
    executorIdentityCredential: f.executor.credential,
    trustedExecutorIssuerPublicKey: f.executor.issuer.publicKey,
    executorOperationalPrivateKey: f.executor.operational.privateKey,
    gridMachineReceipt: f.gridReceipt,
    gridPublicKey: f.executor.grid.publicKey,
    reportedArtifactDigests: [ARTIFACT_B, ARTIFACT_A, ARTIFACT_A],
    reportedEvidenceDigests: [EVIDENCE_B, EVIDENCE_A, EVIDENCE_A],
    ...overrides
  });
}

function verifyEvidence(f) {
  return {
    handoff: f.handoff,
    handoffEvidence: f.handoffEvidence,
    executorIdentityCredential: f.executor.credential,
    trustedExecutorIssuerPublicKey: f.executor.issuer.publicKey,
    gridMachineReceipt: f.gridReceipt,
    gridPublicKey: f.executor.grid.publicKey
  };
}

test('A5a binds A4 handoff, A1 executor identity and Grid terminal evidence into a portable completed receipt', () => {
  const f = fixture();
  const receipt = create(f);
  const verified = verifyAgentPortableWorkReceipt(receipt, {
    ...verifyEvidence(f),
    expectedReceiptId: 'work.receipt.1',
    expectedArtifactDigests: [ARTIFACT_B, ARTIFACT_A],
    expectedEvidenceDigests: [EVIDENCE_B, EVIDENCE_A]
  });

  assert.equal(receipt.statement.handoff_digest, f.handoff.handoff_digest);
  assert.equal(receipt.statement.executor_principal_id, 'agent.executor.work.1');
  assert.equal(receipt.statement.executor_credential_digest, f.executor.credential.credential_digest);
  assert.equal(receipt.statement.grid_machine_receipt_digest, f.gridReceipt.receipt_digest);
  assert.equal(receipt.statement.grid_terminal_status, 'completed');
  assert.equal(receipt.statement.grid_action, 'system.echo');
  assert.equal(receipt.statement.grid_input_digest, INPUT);
  assert.equal(
    receipt.statement.grid_machine_authority_digest,
    f.executor.credential.statement.principal_authority_digest
  );
  assert.equal(receipt.statement.terminal_outcome_kind, 'intent.completed');
  assert.deepEqual(receipt.statement.reported_artifact_digests, [ARTIFACT_A, ARTIFACT_B]);
  assert.deepEqual(receipt.statement.reported_evidence_digests, [EVIDENCE_A, EVIDENCE_B]);
  assert.equal(receipt.statement.task_success_claimed, false);
  assert.equal(receipt.statement.application_correctness_claimed, false);
  assert.equal(receipt.statement.truth_claimed, false);
  assert.equal(receipt.statement.effect_specific_execution_claimed, false);
  assert.equal(receipt.statement.effect_specific_receipt_bound, false);
  assert.equal(receipt.statement.artifact_availability_claimed, false);
  assert.equal(receipt.statement.handoff_authority_claimed, false);
  assert.equal(receipt.statement.global_currentness_claimed, false);
  assert.equal(receipt.statement.authority_effect, 'none');
  assert.equal(verified.valid, true);
  assert.equal(verified.grid_terminal_receipt_verified, true);
  assert.equal(verified.executor_signature_verified, true);
  assert.equal(verified.task_success_claimed, false);
});

test('A5a carries denied terminal state without converting denial into task truth', () => {
  const f = fixture({ status: 'denied' });
  const receipt = create(f);
  const verified = verifyAgentPortableWorkReceipt(receipt, verifyEvidence(f));
  assert.equal(receipt.statement.grid_terminal_status, 'denied');
  assert.equal(receipt.statement.terminal_outcome_kind, 'intent.denied');
  assert.equal(receipt.statement.task_success_claimed, false);
  assert.equal(verified.terminal_status, 'denied');
});

test('portable receipt requires executor credential to match the A4 target identity and ID', () => {
  const f = fixture();
  const wrongIssuer = generateKeyPairSync('ed25519');
  const wrongOperational = generateKeyPairSync('ed25519');
  const wrongPrincipal = machineDefinition({
    id: 'agent.executor.other.1',
    runtimeId: 'runtime.executor.other.1'
  });
  const wrongCredential = credential(wrongPrincipal, wrongIssuer, wrongOperational);

  assert.throws(() => create(f, {
    executorIdentityCredential: wrongCredential,
    trustedExecutorIssuerPublicKey: wrongIssuer.publicKey,
    executorOperationalPrivateKey: wrongOperational.privateKey
  }), /executor principal does not match handoff intended executor|credential does not match handoff target identity/);
});

test('portable receipt rejects executor operational key substitution', () => {
  const f = fixture();
  const wrong = generateKeyPairSync('ed25519');
  assert.throws(
    () => create(f, { executorOperationalPrivateKey: wrong.privateKey }),
    /executor operational key does not match identity credential/
  );
});

test('portable receipt rejects Grid signature substitution', () => {
  const f = fixture();
  const wrongGrid = gridIdentity();
  assert.throws(
    () => create(f, { gridPublicKey: wrongGrid.publicKey }),
    /requires a valid Grid machine intent receipt signature/
  );
});

test('portable receipt rejects Grid principal action input and authority substitution', () => {
  const f = fixture();

  const wrongPrincipal = buildGridReceipt({
    executor: f.executor,
    principal: 'agent.other.1'
  });
  assert.throws(
    () => create(f, { gridMachineReceipt: wrongPrincipal }),
    /Grid intent principal does not match executor identity/
  );

  const wrongAction = buildGridReceipt({
    executor: f.executor,
    action: 'system.hash'
  });
  assert.throws(
    () => create(f, { gridMachineReceipt: wrongAction }),
    /Grid intent action does not match handoff/
  );

  const wrongInput = buildGridReceipt({
    executor: f.executor,
    inputDigest: 'e'.repeat(64)
  });
  assert.throws(
    () => create(f, { gridMachineReceipt: wrongInput }),
    /Grid intent input digest does not match handoff/
  );

  const wrongAuthority = buildGridReceipt({
    executor: f.executor,
    authorityDigest: 'f'.repeat(64)
  });
  assert.throws(
    () => create(f, { gridMachineReceipt: wrongAuthority }),
    /Grid machine authority does not match executor credential/
  );
});

test('Grid intent must begin inside the signed A4 proposal window but may finish later', () => {
  const f = fixture();
  const tooEarly = buildGridReceipt({
    executor: f.executor,
    createdAt: '2026-08-17T20:01:59.000Z',
    updatedAt: '2026-08-17T20:03:00.000Z'
  });
  assert.throws(
    () => create(f, { gridMachineReceipt: tooEarly }),
    /did not start inside handoff proposal window/
  );

  const tooLate = buildGridReceipt({
    executor: f.executor,
    createdAt: '2026-08-17T20:06:00.000Z',
    updatedAt: '2026-08-17T20:07:00.000Z'
  });
  assert.throws(
    () => create(f, { gridMachineReceipt: tooLate }),
    /did not start inside handoff proposal window/
  );

  const finishesAfterHandoff = buildGridReceipt({
    executor: f.executor,
    createdAt: '2026-08-17T20:05:59.000Z',
    updatedAt: '2026-08-17T20:07:00.000Z'
  });
  const receipt = create(f, { gridMachineReceipt: finishesAfterHandoff });
  assert.equal(receipt.statement.started_at, '2026-08-17T20:05:59.000Z');
  assert.equal(receipt.statement.finished_at, '2026-08-17T20:07:00.000Z');
});

test('portable receipt semantic elevation is rejected before normalization', () => {
  const f = fixture();
  const receipt = create(f);

  const successClaim = structuredClone(receipt);
  successClaim.statement.task_success_claimed = true;
  assert.throws(
    () => verifyAgentPortableWorkReceipt(successClaim, verifyEvidence(f)),
    /task_success_claimed must remain false/
  );

  const effectClaim = structuredClone(receipt);
  effectClaim.statement.effect_specific_execution_claimed = true;
  assert.throws(
    () => verifyAgentPortableWorkReceipt(effectClaim, verifyEvidence(f)),
    /effect_specific_execution_claimed must remain false/
  );

  const authorityClaim = structuredClone(receipt);
  authorityClaim.statement.authority_effect = 'grant-execution';
  assert.throws(
    () => verifyAgentPortableWorkReceipt(authorityClaim, verifyEvidence(f)),
    /authority_effect must remain none/
  );
});

test('reported artifact and evidence digests are signed reports, not availability or verification claims', () => {
  const f = fixture();
  const receipt = create(f);
  assert.equal(receipt.statement.artifact_availability_claimed, false);
  assert.equal(receipt.statement.reported_artifacts_verified, false);
  assert.equal(receipt.statement.reported_evidence_verified, false);

  assert.throws(() => verifyAgentPortableWorkReceipt(receipt, {
    ...verifyEvidence(f),
    expectedArtifactDigests: ['0'.repeat(64)]
  }), /artifact digest set mismatch/);
  assert.throws(() => verifyAgentPortableWorkReceipt(receipt, {
    ...verifyEvidence(f),
    expectedEvidenceDigests: ['0'.repeat(64)]
  }), /evidence digest set mismatch/);
});

test('portable receipt detects Grid receipt substitution even when substituted receipt is independently valid', () => {
  const f = fixture();
  const receipt = create(f);
  const alternate = buildGridReceipt({
    executor: f.executor,
    status: 'denied'
  });
  assert.throws(
    () => verifyAgentPortableWorkReceipt(receipt, {
      ...verifyEvidence(f),
      gridMachineReceipt: alternate
    }),
    /grid_machine_receipt_digest does not match bound evidence|grid_terminal_status does not match bound evidence|terminal_outcome/
  );
});

test('portable receipt detects statement signature and receipt-digest tamper', () => {
  const f = fixture();
  const receipt = create(f);

  const statementTamper = structuredClone(receipt);
  statementTamper.statement.reported_artifact_digests = ['0'.repeat(64)];
  assert.throws(
    () => verifyAgentPortableWorkReceipt(statementTamper, verifyEvidence(f)),
    /statement digest mismatch/
  );

  const signatureTamper = structuredClone(receipt);
  signatureTamper.executor_signature = `${signatureTamper.executor_signature.slice(0, -1)}A`;
  assert.throws(
    () => verifyAgentPortableWorkReceipt(signatureTamper, verifyEvidence(f)),
    /executor signature is invalid|receipt_digest mismatch/
  );

  assert.throws(
    () => verifyAgentPortableWorkReceipt({ ...receipt, receipt_digest: '0'.repeat(64) }, verifyEvidence(f)),
    /receipt_digest mismatch/
  );
});

test('portable receipt verifier rejects a different executor credential even before signature trust', () => {
  const f = fixture();
  const receipt = create(f);
  const otherIssuer = generateKeyPairSync('ed25519');
  const otherOperational = generateKeyPairSync('ed25519');
  const otherPrincipal = machineDefinition({
    id: 'agent.executor.work.1',
    runtimeId: 'runtime.executor.rekeyed.1',
    software: 'e'.repeat(64)
  });
  const otherCredential = credential(otherPrincipal, otherIssuer, otherOperational);
  assert.throws(
    () => verifyAgentPortableWorkReceipt(receipt, {
      ...verifyEvidence(f),
      executorIdentityCredential: otherCredential,
      trustedExecutorIssuerPublicKey: otherIssuer.publicKey
    }),
    /executor credential does not match handoff target identity digest|Grid machine authority does not match executor credential/
  );
});

test('unknown portable receipt fields fail closed', () => {
  const f = fixture();
  const receipt = create(f);
  assert.throws(
    () => verifyAgentPortableWorkReceipt({ ...receipt, magic: true }, verifyEvidence(f)),
    /unsupported field magic/
  );
  const statementExtra = structuredClone(receipt);
  statementExtra.statement.magic = true;
  assert.throws(
    () => verifyAgentPortableWorkReceipt(statementExtra, verifyEvidence(f)),
    /unsupported field magic/
  );
});
