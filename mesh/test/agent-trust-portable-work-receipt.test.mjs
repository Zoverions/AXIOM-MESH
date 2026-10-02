import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import test from 'node:test';

import { ValidationError, digestObject } from '../src/lib/canonical.mjs';
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
import {
  containerPaths,
  countingProxy,
  label,
  propertyPaths,
  withAccessorAt,
  withProxyAt
} from '../test-support/hostile-plain-data.mjs';

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
    expires_at: '2099-01-01T00:00:00.000Z',
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

function capabilities(extra = []) {
  return {
    schema: 'axiom-capabilities.v1',
    capabilities: [
      { id: 'core.echo', status: 'implemented' },
      ...extra
    ]
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
  const capabilityRegistry = capabilities();
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
  }), /machine identity credential principal_id mismatch|executor principal does not match handoff intended executor|credential does not match handoff target identity/);
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
  signatureTamper.executor_signature = 'A'.repeat(64);
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

// P3: validate/verifyMachineIntentReceipt used to hand the caller's own object
// back, and verifyBoundInputs read `statement` off it again. A getter or lying
// Proxy could show the genuine signed statement to the Grid checks and a forged
// outcome digest and chain head to the portable receipt being minted.
function forgedGridStatement(gridReceipt) {
  const forged = structuredClone(gridReceipt.statement);
  const field = forged.intent.status === 'completed' ? 'result_digest' : 'error_digest';
  forged.outcome[field] = 'f'.repeat(64);
  forged.chain.head = 'e'.repeat(64);
  return forged;
}

function insideMachineReceiptVerifier() {
  return /(validate|verify)MachineIntentReceipt/.test(new Error().stack);
}

function assertNotForged(run, label) {
  let minted;
  try {
    minted = run();
  } catch (error) {
    assert.ok(error instanceof ValidationError, `${label}: expected ValidationError, got ${error?.name}: ${error?.message}`);
    return error;
  }
  assert.fail(
    `${label}: accepted (terminal_outcome_digest=${minted?.statement?.terminal_outcome_digest?.slice(0, 8)}`
    + ` grid_chain_head=${minted?.statement?.grid_chain_head?.slice(0, 8)} valid=${minted?.valid})`
  );
}

test('P3: a statement getter cannot show the Grid checks one statement and the minted receipt another', () => {
  const f = fixture();
  const genuine = f.gridReceipt;
  const forged = forgedGridStatement(genuine);
  assert.throws(
    () => create(f, { gridMachineReceipt: { ...genuine, statement: forged } }),
    /digest does not match the envelope/
  );
  let getterCalls = 0;
  const hostile = { ...genuine };
  Object.defineProperty(hostile, 'statement', {
    enumerable: true,
    configurable: true,
    get() {
      getterCalls += 1;
      return insideMachineReceiptVerifier() ? genuine.statement : forged;
    }
  });
  const createError = assertNotForged(() => create(f, { gridMachineReceipt: hostile }), 'P3 getter create');
  assert.match(createError.message, /must be plain data; statement is an accessor/);
  const minted = create(f);
  assertNotForged(
    () => verifyAgentPortableWorkReceipt(minted, { ...verifyEvidence(f), gridMachineReceipt: hostile }),
    'P3 getter verify'
  );
  assert.equal(getterCalls, 0, 'the statement getter must never run');
});

test('P3: a lying Proxy cannot show the Grid checks one statement and the minted receipt another', () => {
  const f = fixture();
  const genuine = f.gridReceipt;
  const forged = forgedGridStatement(genuine);
  const counter = { traps: 0 };
  const hostile = countingProxy({ ...genuine }, counter, {
    statement: () => (insideMachineReceiptVerifier() ? genuine.statement : forged)
  });
  const createError = assertNotForged(() => create(f, { gridMachineReceipt: hostile }), 'P3 Proxy create');
  assert.match(createError.message, /must be plain data; <root> is a Proxy/);
  const minted = create(f);
  assertNotForged(
    () => verifyAgentPortableWorkReceipt(minted, { ...verifyEvidence(f), gridMachineReceipt: hostile }),
    'P3 Proxy verify'
  );
  assert.equal(counter.traps, 0, 'the Proxy must be rejected before any trap runs');
});

test('a Proxy or accessor anywhere in the Grid receipt input is rejected by create and verify before any trap or getter runs', () => {
  const f = fixture();
  const minted = create(f);
  const document = f.gridReceipt;
  const runs = [
    ['create', value => create(f, { gridMachineReceipt: value })],
    ['verify', value => verifyAgentPortableWorkReceipt(minted, { ...verifyEvidence(f), gridMachineReceipt: value })]
  ];
  let checked = 0;
  for (const [name, run] of runs) {
    for (const path of containerPaths(document)) {
      const counter = { traps: 0 };
      assert.throws(
        () => run(withProxyAt(document, path, counter)),
        error => error instanceof ValidationError && /must be plain data/.test(error.message) && /Proxy/.test(error.message),
        `${name} Proxy at ${label(path)}`
      );
      assert.equal(counter.traps, 0, `${name} Proxy at ${label(path)} ran a trap`);
      checked += 1;
    }
    for (const path of propertyPaths(document)) {
      const counter = { getters: 0 };
      assert.throws(
        () => run(withAccessorAt(document, path, counter)),
        error => error instanceof ValidationError && /must be plain data/.test(error.message) && /accessor/.test(error.message),
        `${name} accessor at ${label(path)}`
      );
      assert.equal(counter.getters, 0, `${name} accessor at ${label(path)} ran its getter`);
      checked += 1;
    }
  }
  assert.ok(checked > 100, `expected to cover every position, covered ${checked}`);
});

// Hostile caller options around a PLAIN Grid receipt. node:crypto reads the
// `gridPublicKey` `{ key }` getter inside the Grid signature check, after the
// receipt has been checked: it swaps the raw statement for a forged one (and
// corrupts receipt_digest). The `reportedArtifactDigests` iterable runs after
// the first bound-input pass and before the second, and restores the genuine
// statement so a raw re-validation would pass.
function rewritingOptions(f) {
  const genuine = f.gridReceipt;
  const genuineStatement = structuredClone(genuine.statement);
  const forged = forgedGridStatement(genuine);
  const raw = structuredClone(genuine);
  const pem = f.executor.grid.publicKey.export({ type: 'spki', format: 'pem' });
  const counts = { keyReads: 0, restores: 0 };
  const restore = () => {
    raw.statement = genuineStatement;
    raw.receipt_digest = genuine.receipt_digest;
  };
  const gridPublicKey = {
    format: 'pem',
    get key() {
      counts.keyReads += 1;
      raw.statement = forged;
      raw.receipt_digest = '0'.repeat(64);
      return pem;
    }
  };
  const reportedArtifactDigests = {
    *[Symbol.iterator]() {
      counts.restores += 1;
      restore();
      yield ARTIFACT_A;
    }
  };
  return { genuine, forged, raw, counts, restore, gridPublicKey, reportedArtifactDigests };
}

test('P3 key-getter: a plain Grid receipt rewritten through a hostile gridPublicKey getter and restored by a reportedArtifactDigests iterable cannot mint a forged outcome', () => {
  for (const status of ['completed', 'denied']) {
    const f = fixture({ status });
    const h = rewritingOptions(f);
    const field = status === 'completed' ? 'result_digest' : 'error_digest';
    let minted;
    try {
      minted = create(f, {
        gridMachineReceipt: h.raw,
        gridPublicKey: h.gridPublicKey,
        reportedArtifactDigests: h.reportedArtifactDigests
      });
    } catch (error) {
      // Rejecting is an acceptable fail-closed outcome.
      assert.ok(error instanceof ValidationError, `${status}: ${error?.name}: ${error?.message}`);
      continue;
    }
    assert.ok(h.counts.keyReads > 0 && h.counts.restores > 0, `${status}: both option hooks ran after the snapshot`);
    assert.notEqual(minted.statement.terminal_outcome_digest, h.forged.outcome[field], `${status}: forged terminal_outcome_digest minted`);
    assert.notEqual(minted.statement.grid_chain_head, h.forged.chain.head, `${status}: forged grid_chain_head minted`);
    // Otherwise the receipt must carry exactly the Grid-signed snapshot values.
    assert.equal(minted.statement.terminal_outcome_digest, h.genuine.statement.outcome[field]);
    assert.equal(minted.statement.grid_chain_head, h.genuine.statement.chain.head);
    assert.equal(minted.statement.grid_machine_receipt_digest, h.genuine.receipt_digest);
  }
});

test('P3 key-getter: create ignores the raw rewrite and binds exactly the Grid receipt snapshot', () => {
  // Pins the current fail-safe behaviour precisely (no rejection, no forged
  // value) so a raw read anywhere after the snapshot changes the outcome.
  const f = fixture();
  const h = rewritingOptions(f);
  const minted = create(f, {
    gridMachineReceipt: h.raw,
    gridPublicKey: h.gridPublicKey,
    reportedArtifactDigests: h.reportedArtifactDigests
  });
  assert.ok(h.counts.keyReads > 0 && h.counts.restores > 0, 'both option hooks ran after the snapshot');
  h.restore();
  assert.deepEqual(minted.statement, create(f, { reportedArtifactDigests: [ARTIFACT_A] }).statement);
});

test('P3 key-getter: verify reads only the Grid receipt snapshot while a gridPublicKey getter rewrites the raw receipt', () => {
  const f = fixture();
  const h = rewritingOptions(f);
  const verified = verifyAgentPortableWorkReceipt(create(f), {
    ...verifyEvidence(f),
    gridMachineReceipt: h.raw,
    gridPublicKey: h.gridPublicKey
  });
  assert.ok(h.counts.keyReads > 0, 'the key getter ran after the snapshot');
  assert.equal(verified.valid, true);
  assert.equal(verified.terminal_outcome_digest, h.genuine.statement.outcome.result_digest);
  assert.equal(verified.grid_machine_receipt_digest, h.genuine.receipt_digest);
});

test('plain, JSON and structuredClone Grid receipts still mint and verify identically', () => {
  for (const status of ['completed', 'denied']) {
    const f = fixture({ status });
    const baseline = create(f);
    for (const [name, gridMachineReceipt] of [
      ['json', JSON.parse(JSON.stringify(f.gridReceipt))],
      ['structuredClone', structuredClone(f.gridReceipt)]
    ]) {
      const minted = create(f, { gridMachineReceipt });
      assert.deepEqual(minted.statement, baseline.statement, `${status} ${name} create`);
      const verified = verifyAgentPortableWorkReceipt(JSON.parse(JSON.stringify(baseline)), {
        ...verifyEvidence(f),
        gridMachineReceipt
      });
      assert.equal(verified.valid, true, `${status} ${name} verify`);
    }
  }
});

function revokedProxy(target = []) {
  const revocable = Proxy.revocable(target, {});
  revocable.revoke();
  return revocable.proxy;
}

test('digest-list options, grid key and receipt arguments are validated up front with ValidationError, never a raw TypeError', () => {
  const f = fixture();
  const receipt = create(f);
  for (const [label, value] of [['5', 5], ['{}', {}], ['null', null], ['revoked Proxy', revokedProxy()]]) {
    for (const field of ['reportedArtifactDigests', 'reportedEvidenceDigests']) {
      assert.throws(() => create(f, { [field]: value }), ValidationError, `create ${field}=${label}`);
    }
    for (const field of ['expectedArtifactDigests', 'expectedEvidenceDigests']) {
      assert.throws(() => verifyAgentPortableWorkReceipt(receipt, { ...verifyEvidence(f), [field]: value }), ValidationError, `verify ${field}=${label}`);
    }
  }
  const throwingIterable = { *[Symbol.iterator]() { throw new Error('caller iterator'); } };
  assert.throws(() => create(f, { reportedArtifactDigests: throwingIterable }), ValidationError);
  for (const [label, key] of [['revoked Proxy', revokedProxy({})], ['{}', {}], ['x', 'x']]) {
    assert.throws(() => create(f, { gridPublicKey: key }), ValidationError, `create gridPublicKey=${label}`);
    assert.throws(() => verifyAgentPortableWorkReceipt(receipt, { ...verifyEvidence(f), gridPublicKey: key }), ValidationError, `verify gridPublicKey=${label}`);
  }
  assert.throws(() => verifyAgentPortableWorkReceipt(revokedProxy({}), verifyEvidence(f)), ValidationError, 'revoked receipt');
  assert.throws(() => verifyAgentPortableWorkReceipt({ ...receipt, statement: revokedProxy({}) }, verifyEvidence(f)), ValidationError, 'revoked statement');
  // Arrays, Sets and generators of digests still work, deduplicated and sorted.
  assert.deepEqual(create(f, { reportedArtifactDigests: new Set([ARTIFACT_B, ARTIFACT_A]) }).statement.reported_artifact_digests, [ARTIFACT_A, ARTIFACT_B]);
  assert.equal(verifyAgentPortableWorkReceipt(receipt, { ...verifyEvidence(f), expectedArtifactDigests: [ARTIFACT_A, ARTIFACT_B, ARTIFACT_A] }).valid, true);
});

test('a Proxy digest array cannot pass the 256 cap with one length and supply 300 digests (length read at most once)', () => {
  const f = fixture();
  const receipt = structuredClone(create(f));
  const many = Array.from({ length: 300 }, (_, index) => index.toString(16).padStart(64, '0'));
  let lengthReads = 0;
  let traps = 0;
  const lying = new Proxy([...receipt.statement.reported_artifact_digests], {
    get(target, key, receiver) {
      traps += 1;
      if (key === 'length') { lengthReads += 1; return lengthReads === 1 ? 1 : many.length; }
      if (typeof key === 'string' && /^\d+$/.test(key)) return many[Number(key)];
      return Reflect.get(target, key, receiver);
    },
    has(target, key) { return (typeof key === 'string' && /^\d+$/.test(key) && Number(key) < many.length) || Reflect.has(target, key); }
  });
  receipt.statement.reported_artifact_digests = lying;
  assert.throws(
    () => verifyAgentPortableWorkReceipt(receipt, verifyEvidence(f)),
    error => error instanceof ValidationError && /reported_artifact_digests must contain at most 256 digests/.test(error.message)
  );
  assert.ok(lengthReads <= 1, `length read ${lengthReads} times`);
  assert.equal(traps, 0, 'the Proxy is rejected before any trap runs');
  // A real 257-item array is still capped and a 256-item one reaches the digest checks.
  const over = structuredClone(create(f));
  over.statement.reported_artifact_digests = many.slice(0, 257);
  assert.throws(() => verifyAgentPortableWorkReceipt(over, verifyEvidence(f)), /at most 256 digests/);
  const atCap = structuredClone(create(f));
  atCap.statement.reported_artifact_digests = many.slice(0, 256);
  assert.throws(() => verifyAgentPortableWorkReceipt(atCap, verifyEvidence(f)), /statement digest mismatch/);
});

test('M13: an iterable that swaps in another genuinely signed Grid receipt after the snapshot cannot rebind the minted receipt', () => {
  const f = fixture();
  const alternate = buildGridReceipt({ executor: f.executor, status: 'denied' });
  const raw = structuredClone(f.gridReceipt);
  let swaps = 0;
  const swapping = {
    *[Symbol.iterator]() {
      swaps += 1;
      for (const key of Object.keys(raw)) delete raw[key];
      Object.assign(raw, structuredClone(alternate));
      yield ARTIFACT_A;
    }
  };
  let minted;
  try {
    minted = create(f, { gridMachineReceipt: raw, reportedArtifactDigests: swapping });
  } catch (error) {
    assert.ok(error instanceof ValidationError, `${error?.name}: ${error?.message}`);
    return;
  }
  assert.equal(swaps, 1);
  assert.equal(minted.statement.grid_machine_receipt_digest, f.gridReceipt.receipt_digest);
  assert.notEqual(minted.statement.grid_machine_receipt_digest, alternate.receipt_digest);
  assert.equal(minted.statement.grid_terminal_status, 'completed');
  // The minted receipt verifies only against the snapshotted receipt, never the swapped one.
  assert.equal(verifyAgentPortableWorkReceipt(minted, verifyEvidence(f)).valid, true);
  assert.throws(() => verifyAgentPortableWorkReceipt(minted, { ...verifyEvidence(f), gridMachineReceipt: raw }), ValidationError);
});
