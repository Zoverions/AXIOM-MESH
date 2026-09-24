import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, randomBytes } from 'node:crypto';

import {
  PraxisRuntimeError,
  createOperationDescriptorPraxis,
  createSyntheticCharter,
  run
} from '../../labs/praxis/index.mjs';
import { createHostOperationRegistry } from '../../labs/praxis/registry.mjs';
import {
  ATTESTATION_KIND_VERIFIERS,
  MESH_ATTESTATION_SCHEMA,
  attestationJson,
  attestationSetDigest,
  attestationToHostObservation,
  createAttestationVerifier,
  createNullifierRegistry,
  signAttestation,
  verifyAttestation
} from '../../labs/praxis/attestation.mjs';
import {
  DECISION_DENIAL_CODES,
  createSyntheticAuditLedger,
  decideCharteredAuthority,
  ledgerEntries,
  verifyDecisionReceipt,
  verifyLedgerChain
} from '../../labs/praxis/ledger.mjs';

// ---------------------------------------------------------------------------
// Fixtures: the first real Praxis program — a merge gate whose evidence is
// loop-emitted attestations. Synthetic keys throughout; nothing here grants
// production authority.
// ---------------------------------------------------------------------------

const NOW = 1_700_000_000_000;
const MERGE_TARGET = 'pr:attestation-gate@sha256:' + 'a'.repeat(64);
const OTHER_MERGE_TARGET = 'pr:other@sha256:' + 'b'.repeat(64);

function keypair() {
  return generateKeyPairSync('ed25519');
}

const root = keypair();
const audit = keypair();
const gateHost = keypair();
const gateOperator = keypair();
const attestorTests = keypair();
const attestorReview = keypair();
const attestorCi = keypair();

const ATTESTOR_IDS = {
  tests: 'attest:tests',
  review: 'attest:review',
  ci: 'attest:ci'
};

// The B5 zero-claim set: every gate attestation must explicitly disclaim these.
const ZERO_CLAIMS = Object.freeze([
  'provider_identity',
  'live_output_truth',
  'budget_enforcement',
  'signer_custody'
]);

const trustedKeys = {
  [ATTESTOR_IDS.tests]: attestorTests.publicKey,
  [ATTESTOR_IDS.review]: attestorReview.publicKey,
  [ATTESTOR_IDS.ci]: attestorCi.publicKey
};
const trustedAttestorsByKind = {
  'tests-reproduced': [ATTESTOR_IDS.tests],
  'adversarial-review': [ATTESTOR_IDS.review],
  'protected-ci': [ATTESTOR_IDS.ci],
  'scope-honesty': [ATTESTOR_IDS.ci]
};

function freshNullifier() {
  return 'sha256:' + randomBytes(32).toString('hex');
}

function makeAttestation({
  key,
  attestorId,
  kind,
  subject,
  mergeTarget = MERGE_TARGET,
  claims,
  nonClaims = [...ZERO_CLAIMS],
  issuedAtMs = NOW - 60_000,
  expiresAtMs = NOW + 600_000,
  nullifier = freshNullifier(),
  evidenceRefs = ['evidence:synthetic']
}) {
  return signAttestation(
    {
      attestor: attestorId,
      subject,
      kind,
      mergeTarget,
      claims,
      nonClaims,
      nullifier,
      issuedAtMs,
      expiresAtMs,
      evidenceRefs
    },
    key.privateKey
  );
}

function testsAttestation(overrides = {}) {
  return makeAttestation({
    key: attestorTests,
    attestorId: ATTESTOR_IDS.tests,
    kind: 'tests-reproduced',
    subject: 'tests:praxis-attestation-gate',
    claims: { tests_passed: 12, tests_failed: 0, tests_total: 12 },
    ...overrides
  });
}

function reviewAttestation(overrides = {}) {
  return makeAttestation({
    key: attestorReview,
    attestorId: ATTESTOR_IDS.review,
    kind: 'adversarial-review',
    subject: 'review:attestation-gate:round-1',
    claims: { verdict: 'APPROVE', rounds_used: 1, probes_passed: 12 },
    ...overrides
  });
}

function ciAttestation(overrides = {}) {
  return makeAttestation({
    key: attestorCi,
    attestorId: ATTESTOR_IDS.ci,
    kind: 'protected-ci',
    subject: 'ci:kernel+windows',
    claims: { protected_workflows_green: true, workflows: 2 },
    ...overrides
  });
}

function premise(verifier, path, op, value) {
  return {
    op,
    left: { source: 'evidence', verifier, path },
    right: { source: 'const', value }
  };
}

const charter = createSyntheticCharter(
  {
    principals: {
      GateHost: { kind: 'service', publicKey: gateHost.publicKey },
      GateOperator: { kind: 'agent', publicKey: gateOperator.publicKey }
    },
    agents: { GateAgent: 'GateOperator' },
    effectEnvelopes: { GateOperator: ['gate_open'] },
    verifiers: {
      'attestation:tests': { source: 'loop:attestation', signers: ['GateHost'], freshness_ms: 600_000 },
      'attestation:review': { source: 'loop:attestation', signers: ['GateHost'], freshness_ms: 600_000 },
      'attestation:ci': { source: 'loop:attestation', signers: ['GateHost'], freshness_ms: 600_000 },
      'attestation:scope': { source: 'loop:attestation', signers: ['GateHost'], freshness_ms: 600_000 }
    },
    policies: {
      MergeGate: {
        authority_kind: 'Permit',
        action: 'OpenGate',
        scope: 'MergeQueue',
        expires_ms: 300_000,
        requires_evidence: ['attestation:tests', 'attestation:review', 'attestation:ci'],
        require: [
          premise('attestation:tests', ['claims', 'tests_failed'], 'eq', 0),
          premise('attestation:tests', ['claims', 'tests_passed'], 'gte', 1),
          premise('attestation:review', ['claims', 'verdict'], 'eq', 'APPROVE'),
          premise('attestation:review', ['claims', 'rounds_used'], 'lte', 2),
          premise('attestation:ci', ['claims', 'protected_workflows_green'], 'eq', true),
          ...['attestation:tests', 'attestation:review', 'attestation:ci'].map(verifier => ({
            op: 'eq',
            left: { source: 'evidence', verifier, path: ['merge_target'] },
            right: { source: 'operation', path: ['args', 0] }
          }))
        ]
      }
    }
  },
  root.privateKey
);

const hostOperations = createHostOperationRegistry({
  OpenGate: {
    action: 'OpenGate',
    scope: 'MergeQueue',
    effect: 'gate_open',
    irreversible: true,
    egress: null
  }
});

const PREPARATION_DIGEST = 'sha256:' + 'd'.repeat(64);

function testPreparer() {
  return async request => ({
    ok: true,
    evidence: {
      durable: true,
      operation_digest: request.operation.operation_digest,
      preparation_digest: PREPARATION_DIGEST
    }
  });
}

function testExecutor() {
  return async request => ({
    status: 'completed',
    receipt: {
      operation_digest: request.operation.operation_digest,
      preparation_digest: request.preparation.preparation_digest,
      finality: request.finality,
      executor: 'synthetic-attestation-gate-test'
    }
  });
}

function testCompleter() {
  return async request => ({
    ok: true,
    evidence: {
      durable: true,
      operation_digest: request.operation_digest,
      preparation_digest: request.preparation_digest,
      finality: request.finality,
      completion_ref: 'synthetic:attestation-gate-test'
    }
  });
}

// The coordinator's gate flow: verify attestations (spending nullifiers at
// the authority boundary), wrap as chartered observations, decide.
async function gateDecide({ testsAtt, reviewAtt, ciAtt, nullifiers, ledger, now = NOW }) {
  const verified = [
    verifyAttestation(testsAtt, { trustedKeys, trustedAttestorsByKind, nullifiers, now, requiredNonClaims: ZERO_CLAIMS }),
    verifyAttestation(reviewAtt, { trustedKeys, trustedAttestorsByKind, nullifiers, now, requiredNonClaims: ZERO_CLAIMS }),
    verifyAttestation(ciAtt, { trustedKeys, trustedAttestorsByKind, nullifiers, now, requiredNonClaims: ZERO_CLAIMS })
  ];
  const mergeTarget = verified[0].evidence.merge_target;
  if (!mergeTarget || verified.some(item => item.evidence.merge_target !== mergeTarget)) {
    throw new PraxisRuntimeError('PRAXIS_ATTESTATION_TARGET_MISMATCH', 'gate attestations must bind one merge target');
  }
  const observations = verified.map(v =>
    attestationToHostObservation({
      verified: v,
      charter,
      trustedRootKeys: [root.publicKey],
      principal: 'GateHost',
      privateKey: gateHost.privateKey,
      issuedAt: now,
      now
    })
  );
  const setDigest = attestationSetDigest(verified.map(v => v.digest), { mergeTarget });
  const operation = createOperationDescriptorPraxis({
    action: 'OpenGate',
    scope: 'MergeQueue',
    args: [mergeTarget, setDigest],
    effect: 'gate_open',
    irreversible: true,
    egress: null,
    hostOperation: 'OpenGate'
  });
  const decision = await decideCharteredAuthority({
    ledger,
    authorityKind: 'Permit',
    id: 'permit:merge-gate:' + randomBytes(4).toString('hex'),
    charter,
    trustedRootKeys: [root.publicKey],
    policyName: 'MergeGate',
    operation,
    evidence: observations,
    requester: 'GateAgent',
    now
  });
  return { decision, operation, setDigest, mergeTarget, verified, observations };
}

function gateProgram(testsAtt, reviewAtt, ciAtt, mergeTarget, setDigest) {
  return [
    'requires permit open_merge_gate: OpenGate @ MergeQueue;',
    `observe tests_att = ${JSON.stringify(attestationJson(testsAtt))} from "loop:tests";`,
    `observe review_att = ${JSON.stringify(attestationJson(reviewAtt))} from "loop:review";`,
    `observe ci_att = ${JSON.stringify(attestationJson(ciAtt))} from "loop:ci";`,
    'verify v_tests = tests_att with AttestationV0;',
    'verify v_review = review_att with AttestationV0;',
    'verify v_ci = ci_att with AttestationV0;',
    `op open_gate = OpenGate(${JSON.stringify(mergeTarget)}, ${JSON.stringify(setDigest)}) @ MergeQueue effect gate_open irreversible;`,
    'authorize open_gate using open_merge_gate as armed_gate;',
    'prepare armed_gate as prepared_gate;',
    'finalize prepared_gate as gate_receipt;'
  ].join('\n');
}

async function runGateProgram({ testsAtt, reviewAtt, ciAtt, mergeTarget = MERGE_TARGET, setDigest, authority, now = NOW }) {
  return run(gateProgram(testsAtt, reviewAtt, ciAtt, mergeTarget, setDigest), {
    authorities: { open_merge_gate: authority },
    verifiers: {
      // In-language re-check: stateless (no nullifier spend). Replay state
      // stays with the host that owns it; the spend happened in gateDecide.
      AttestationV0: createAttestationVerifier({ trustedKeys, trustedAttestorsByKind, now, requiredNonClaims: ZERO_CLAIMS })
    },
    charter,
    trustedCharterKeys: [root.publicKey],
    hostOperations,
    now,
    preparer: testPreparer(),
    executor: testExecutor(),
    completer: testCompleter()
  });
}

function freshLedger(tag) {
  return createSyntheticAuditLedger({
    privateKey: audit.privateKey,
    auditId: 'audit:attestation-gate:' + tag,
    now: NOW
  });
}

function freshSet() {
  return {
    testsAtt: testsAttestation(),
    reviewAtt: reviewAttestation(),
    ciAtt: ciAttestation()
  };
}

// ---------------------------------------------------------------------------
// Unit: attestation verification
// ---------------------------------------------------------------------------

test('attestation signs and verifies with normalized evidence', () => {
  const att = testsAttestation();
  const { evidence, digest } = verifyAttestation(att, {
    trustedKeys,
    trustedAttestorsByKind,
    nullifiers: createNullifierRegistry(),
    now: NOW,
    requiredNonClaims: ZERO_CLAIMS
  });
  assert.equal(evidence.kind, 'tests-reproduced');
  assert.equal(evidence.merge_target, MERGE_TARGET);
  assert.equal(evidence.claims.tests_failed, 0);
  assert.deepEqual([...evidence.non_claims], [...ZERO_CLAIMS]);
  assert.match(digest, /^sha256:[a-f0-9]{64}$/);
  assert.equal(att.schema, MESH_ATTESTATION_SCHEMA);
});

test('tampered claims fail signature verification', () => {
  const att = testsAttestation();
  const tampered = { ...att, claims: { ...att.claims, tests_failed: 5 } };
  assert.throws(
    () =>
      verifyAttestation(tampered, {
        trustedKeys,
        trustedAttestorsByKind,
        nullifiers: createNullifierRegistry(),
        now: NOW
      }),
    error => error instanceof PraxisRuntimeError && error.code === 'PRAXIS_ATTESTATION_SIGNATURE'
  );
  assert.throws(
    () => verifyAttestation({ ...att, merge_target: OTHER_MERGE_TARGET }, {
      trustedKeys, trustedAttestorsByKind, nullifiers: createNullifierRegistry(), now: NOW
    }),
    error => error instanceof PraxisRuntimeError && error.code === 'PRAXIS_ATTESTATION_SIGNATURE'
  );
});

test('unknown attestor is rejected', () => {
  const rogue = keypair();
  const att = makeAttestation({
    key: rogue,
    attestorId: 'attest:rogue',
    kind: 'tests-reproduced',
    subject: 'tests:rogue',
    claims: { tests_passed: 1, tests_failed: 0 }
  });
  assert.throws(
    () => verifyAttestation(att, { trustedKeys, trustedAttestorsByKind, nullifiers: createNullifierRegistry(), now: NOW }),
    error => error instanceof PraxisRuntimeError && error.code === 'PRAXIS_ATTESTATION_UNKNOWN_ATTESTOR'
  );
});

test('verifier requires an explicit trusted attestor role map', () => {
  assert.throws(
    () => verifyAttestation(testsAttestation(), {
      trustedKeys,
      nullifiers: createNullifierRegistry(),
      now: NOW
    }),
    error => error instanceof TypeError && /trustedAttestorsByKind/.test(error.message)
  );
});

test('nullifier reuse is a replay and fails closed', () => {
  const nullifiers = createNullifierRegistry();
  const att = testsAttestation();
  verifyAttestation(att, { trustedKeys, trustedAttestorsByKind, nullifiers, now: NOW });
  assert.throws(
    () => verifyAttestation(att, { trustedKeys, trustedAttestorsByKind, nullifiers, now: NOW }),
    error => error instanceof PraxisRuntimeError && error.code === 'PRAXIS_ATTESTATION_REPLAY'
  );
});

test('expired and future-dated attestations are rejected', () => {
  const expired = testsAttestation({ expiresAtMs: NOW - 1 });
  assert.throws(
    () => verifyAttestation(expired, { trustedKeys, trustedAttestorsByKind, nullifiers: createNullifierRegistry(), now: NOW }),
    error => error instanceof PraxisRuntimeError && error.code === 'PRAXIS_ATTESTATION_EXPIRED'
  );
  const future = testsAttestation({ issuedAtMs: NOW + 60_000, expiresAtMs: NOW + 600_000 });
  assert.throws(
    () => verifyAttestation(future, { trustedKeys, trustedAttestorsByKind, nullifiers: createNullifierRegistry(), now: NOW }),
    error => error instanceof PraxisRuntimeError && error.code === 'PRAXIS_ATTESTATION_STALE'
  );
});

test('missing non_claims fails the honesty check', () => {
  // Structural honesty is checked before cryptography: this attestation is
  // hand-built (it could never have been signed, since signing enforces the
  // same shape) and must be rejected on its missing non_claims alone.
  const bare = {
    schema: MESH_ATTESTATION_SCHEMA,
    attestor: ATTESTOR_IDS.tests,
    subject: 'tests:bare',
    merge_target: MERGE_TARGET,
    kind: 'tests-reproduced',
    claims: { tests_passed: 1, tests_failed: 0 },
    non_claims: [],
    nullifier: freshNullifier(),
    issued_at_ms: NOW - 1000,
    expires_at_ms: NOW + 600_000,
    evidence_refs: [],
    signature: 'bogus'
  };
  assert.throws(
    () => verifyAttestation(bare, { trustedKeys, trustedAttestorsByKind, nullifiers: createNullifierRegistry(), now: NOW }),
    error => error instanceof PraxisRuntimeError && error.code === 'PRAXIS_ATTESTATION_NON_CLAIMS'
  );
});

test('widened claims fail closed even with a valid signature', () => {
  // The attestation is genuinely signed, but it omits a required non-claim:
  // it silently widens what it asserts. The non-claim check fires before any
  // authority can be derived from the signature.
  const widened = testsAttestation({
    nonClaims: ['provider_identity', 'live_output_truth']
  });
  assert.throws(
    () =>
      verifyAttestation(widened, {
        trustedKeys,
        trustedAttestorsByKind,
        nullifiers: createNullifierRegistry(),
        now: NOW,
        requiredNonClaims: ZERO_CLAIMS
      }),
    error =>
      error instanceof PraxisRuntimeError &&
      error.code === 'PRAXIS_ATTESTATION_NON_CLAIMS' &&
      /budget_enforcement/.test(error.message)
  );
});

test('malformed attestations are rejected', () => {
  assert.throws(
    () =>
      verifyAttestation('not json', { trustedKeys, trustedAttestorsByKind, nullifiers: createNullifierRegistry(), now: NOW }),
    error => error instanceof PraxisRuntimeError && error.code === 'PRAXIS_ATTESTATION_MALFORMED'
  );
  const wrongKind = {
    schema: MESH_ATTESTATION_SCHEMA,
    attestor: ATTESTOR_IDS.tests,
    subject: 'x',
    merge_target: MERGE_TARGET,
    kind: 'vibes',
    claims: {},
    non_claims: [...ZERO_CLAIMS],
    nullifier: freshNullifier(),
    issued_at_ms: NOW - 1000,
    expires_at_ms: NOW + 600_000,
    evidence_refs: [],
    signature: 'bogus'
  };
  assert.throws(
    () => verifyAttestation(wrongKind, { trustedKeys, trustedAttestorsByKind, nullifiers: createNullifierRegistry(), now: NOW }),
    error => error instanceof PraxisRuntimeError && error.code === 'PRAXIS_ATTESTATION_MALFORMED'
  );
});

test('verifier factory returns explicit ok:true for the interpreter', async () => {
  const verifier = createAttestationVerifier({ trustedKeys, trustedAttestorsByKind, now: NOW });
  const result = await verifier({ kind: 'Observed', value: attestationJson(testsAttestation()) });
  assert.equal(result.ok, true);
  assert.equal(result.evidence.kind, 'tests-reproduced');
});

test('kind-to-verifier mapping covers every known kind', () => {
  assert.deepEqual(Object.keys(ATTESTATION_KIND_VERIFIERS).sort(), [
    'adversarial-review',
    'protected-ci',
    'scope-honesty',
    'tests-reproduced'
  ]);
});

// ---------------------------------------------------------------------------
// End to end: the gate program. Loops emit, Praxis verifies, the gate opens
// only on verification.
// ---------------------------------------------------------------------------

test('gate opens: verified attestations -> chartered permit -> finalized gate_open', async () => {
  const ledger = freshLedger('allow');
  const nullifiers = createNullifierRegistry();
  const { testsAtt, reviewAtt, ciAtt } = freshSet();

  const { decision, setDigest } = await gateDecide({
    testsAtt,
    reviewAtt,
    ciAtt,
    nullifiers,
    ledger
  });
  assert.equal(decision.decision, 'allow');
  assert.equal(decision.denial, null);
  assert.ok(decision.authority, 'allow issues an authority token');

  const verifiedReceipt = verifyDecisionReceipt(decision.receipt, { publicKey: audit.publicKey });
  assert.equal(verifiedReceipt.decision, 'allow');
  assert.equal(decision.receipt.policy_name, 'MergeGate');

  const result = await runGateProgram({
    testsAtt,
    reviewAtt,
    ciAtt,
    setDigest,
    authority: decision.authority
  });
  assert.equal(result.values.gate_receipt.finality, 'finalize');
  assert.equal(result.values.open_gate.effect, 'gate_open');

  const entries = ledgerEntries(ledger);
  const kinds = entries.map(entry => entry.kind);
  assert.ok(kinds.includes('authority_decision'), 'decision recorded');
  assert.ok(kinds.includes('authority_issued'), 'issuance recorded');
  assert.doesNotThrow(() => verifyLedgerChain(entries, { publicKey: audit.publicKey }));
});

test('gate denies with reasons: review verdict DENY -> signed denial receipt, no permit', async () => {
  const ledger = freshLedger('deny');
  const nullifiers = createNullifierRegistry();
  const { testsAtt, ciAtt } = freshSet();
  const reviewAtt = reviewAttestation({ claims: { verdict: 'DENY', rounds_used: 1, probes_passed: 3 } });

  const { decision } = await gateDecide({ testsAtt, reviewAtt, ciAtt, nullifiers, ledger });
  assert.equal(decision.decision, 'deny');
  assert.equal(decision.authority, null);

  assert.ok(
    DECISION_DENIAL_CODES.includes(decision.denial.code),
    'denial carries a closed-vocabulary code, got ' + decision.denial.code
  );
  assert.equal(decision.denial.code, 'PREMISE_FAILED');

  const verifiedReceipt = verifyDecisionReceipt(decision.receipt, { publicKey: audit.publicKey });
  assert.equal(verifiedReceipt.decision, 'deny');
  assert.equal(decision.receipt.denial_code, 'PREMISE_FAILED');

  // Without a permit the program cannot authorize: fail closed.
  await assert.rejects(
    () =>
      runGateProgram({
        testsAtt,
        reviewAtt,
        ciAtt,
        setDigest: attestationSetDigest(['sha256:' + 'e'.repeat(64)], { mergeTarget: MERGE_TARGET }),
        authority: undefined
      }),
    error => error instanceof PraxisRuntimeError && error.code === 'PRAXIS_HOST_AUTHORITY_REQUIRED'
  );
});

test('gate denies on replayed attestation: nullifier spent at the authority boundary', async () => {
  const ledger = freshLedger('replay');
  const nullifiers = createNullifierRegistry();
  const first = freshSet();
  await gateDecide({ ...first, nullifiers, ledger });

  // Same attestations, second gate decision: the nullifiers are spent.
  const second = { ...first };
  await assert.rejects(
    (async () => gateDecide({ ...second, nullifiers, ledger }))(),
    error => error instanceof PraxisRuntimeError && error.code === 'PRAXIS_ATTESTATION_REPLAY'
  );
});

test('gate denies when a required attestation kind is missing', async () => {
  const ledger = freshLedger('missing');
  const nullifiers = createNullifierRegistry();
  const { testsAtt, reviewAtt } = freshSet();
  // A scope-honesty attestation is not the protected-ci evidence the policy needs.
  const scopeAtt = makeAttestation({
    key: attestorCi,
    attestorId: ATTESTOR_IDS.ci,
    kind: 'scope-honesty',
    subject: 'scope:merge-queue',
    claims: { labels_honest: true }
  });
  const { decision } = await gateDecide({
    testsAtt,
    reviewAtt,
    ciAtt: scopeAtt,
    nullifiers,
    ledger
  });
  assert.equal(decision.decision, 'deny');
  assert.equal(decision.denial.code, 'EVIDENCE_UNVERIFIED');
});

test('exact-plan binding: permit is valid for exactly one attestation set', async () => {
  const ledger = freshLedger('binding');
  const nullifiers = createNullifierRegistry();
  const set = freshSet();
  const { decision } = await gateDecide({ ...set, nullifiers, ledger });
  assert.equal(decision.decision, 'allow');

  // Same permit, different evidence set digest in the program: the operation
  // digest no longer matches the permit's bound digest.
  const otherDigest = attestationSetDigest(['sha256:' + 'f'.repeat(64), 'sha256:' + '0'.repeat(64)], {
    mergeTarget: MERGE_TARGET
  });
  await assert.rejects(
    () =>
      runGateProgram({
        ...set,
        setDigest: otherDigest,
        authority: decision.authority
      }),
    error =>
      error instanceof PraxisRuntimeError && error.code === 'PRAXIS_HOST_AUTHORITY_PLAN_MISMATCH'
  );
});

test('adversarial: forged attestor key cannot mint gate evidence', async () => {
  const ledger = freshLedger('forged');
  const nullifiers = createNullifierRegistry();
  const rogue = keypair();
  // The rogue claims the tests attestor's id, but the signature cannot verify
  // against the trusted key: the forgery dies at the signature check.
  const forged = makeAttestation({
    key: rogue,
    attestorId: ATTESTOR_IDS.tests,
    kind: 'tests-reproduced',
    subject: 'tests:forged',
    claims: { tests_passed: 99, tests_failed: 0 }
  });
  const { reviewAtt, ciAtt } = freshSet();
  await assert.rejects(
    (async () =>
      gateDecide({ testsAtt: forged, reviewAtt, ciAtt, nullifiers, ledger }))(),
    error => error instanceof PraxisRuntimeError && error.code === 'PRAXIS_ATTESTATION_SIGNATURE'
  );
  const entries = ledgerEntries(ledger);
  assert.ok(
    !entries.some(entry => entry.kind === 'authority_issued'),
    'no authority was issued for forged evidence'
  );
});

test('one trusted tests key cannot impersonate review or protected CI evidence', async () => {
  for (const kind of ['adversarial-review', 'protected-ci']) {
    const ledger = freshLedger(`cross-role-${kind}`);
    const nullifiers = createNullifierRegistry();
    const set = freshSet();
    const impersonated = {
      key: attestorTests,
      attestorId: ATTESTOR_IDS.tests
    };
    if (kind === 'adversarial-review') set.reviewAtt = reviewAttestation(impersonated);
    else set.ciAtt = ciAttestation(impersonated);
    await assert.rejects(
      () => gateDecide({ ...set, nullifiers, ledger }),
      error => error instanceof PraxisRuntimeError && error.code === 'PRAXIS_ATTESTATION_ATTESTOR_ROLE'
    );
    assert.ok(!ledgerEntries(ledger).some(entry => entry.kind === 'authority_issued'));
  }
});

test('attestations for different merge targets cannot mint one gate permit', async () => {
  const ledger = freshLedger('cross-target');
  const nullifiers = createNullifierRegistry();
  const { testsAtt, reviewAtt } = freshSet();
  const ciAtt = ciAttestation({ mergeTarget: OTHER_MERGE_TARGET });
  await assert.rejects(
    () => gateDecide({ testsAtt, reviewAtt, ciAtt, nullifiers, ledger }),
    error => error instanceof PraxisRuntimeError && error.code === 'PRAXIS_ATTESTATION_TARGET_MISMATCH'
  );
  assert.ok(!ledgerEntries(ledger).some(entry => entry.kind === 'authority_issued'));
});

test('chartered policy binds each signed merge target to the operation target', async () => {
  const { observations, setDigest } = await gateDecide({
    ...freshSet(),
    nullifiers: createNullifierRegistry(),
    ledger: freshLedger('policy-target-baseline')
  });
  const substitutedOperation = createOperationDescriptorPraxis({
    action: 'OpenGate',
    scope: 'MergeQueue',
    args: [OTHER_MERGE_TARGET, setDigest],
    effect: 'gate_open',
    irreversible: true,
    egress: null,
    hostOperation: 'OpenGate'
  });
  const decision = await decideCharteredAuthority({
    ledger: freshLedger('policy-target-substitution'),
    authorityKind: 'Permit',
    id: 'permit:merge-gate:wrong-target',
    charter,
    trustedRootKeys: [root.publicKey],
    policyName: 'MergeGate',
    operation: substitutedOperation,
    evidence: observations,
    requester: 'GateAgent',
    now: NOW
  });
  assert.equal(decision.decision, 'deny');
  assert.equal(decision.authority, null);
  assert.equal(decision.denial.code, 'PREMISE_FAILED');
});
