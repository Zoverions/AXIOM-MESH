import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';

import {
  PraxisRuntimeError,
  compile,
  createOperationDescriptorPraxis,
  createSyntheticCharter,
  run
} from '../../labs/praxis/index.mjs';
import {
  DECISION_DENIAL_CODES,
  LEDGER_ENTRY_KINDS,
  createDecisionReceiptBody,
  createSyntheticAuditLedger,
  decideCharteredAuthority,
  ledgerEntries,
  recordPreparedEffect,
  recordTerminalEffect,
  signDecisionReceipt,
  verifyDecisionReceipt,
  verifyDecisionReceiptForOperation,
  verifyLedger,
  verifyLedgerChain,
  verifyLedgerEntry
} from '../../labs/praxis/ledger.mjs';

function keypair() {
  return generateKeyPairSync('ed25519');
}

const root = keypair();
const audit = keypair();
const other = keypair();
const deployer = keypair();

const principals = {
  Deployer: { kind: 'agent', publicKey: deployer.publicKey }
};

const charter = createSyntheticCharter({
  principals,
  agents: {
    ReleaseAgent: 'Deployer'
  },
  effectEnvelopes: {
    Deployer: ['deploy_release']
  },
  policies: {
    DeployPolicy: {
      authority_kind: 'Permit',
      action: 'Deploy',
      scope: 'Production',
      expires_ms: 60_000
    }
  }
}, root.privateKey);

const vetoCharter = createSyntheticCharter({
  principals,
  agents: {
    ReleaseAgent: 'Deployer'
  },
  effectEnvelopes: {
    Deployer: ['deploy_release']
  },
  policies: {
    VetoPolicy: {
      authority_kind: 'Permit',
      action: 'Deploy',
      scope: 'Production',
      expires_ms: 60_000,
      advisor: 'VetoAdvisor'
    }
  }
}, root.privateKey);

const trustedRoots = [root.publicKey];

function measuredOperation() {
  return createOperationDescriptorPraxis({
    action: 'Deploy',
    scope: 'Production',
    args: ['artifact'],
    effect: 'deploy_release',
    irreversible: false,
    egress: 'provider:prod',
    hostOperation: 'Deploy'
  });
}

const PREPARATION_DIGEST = 'sha256:' + 'd'.repeat(64);
const EXECUTOR_RECEIPT_DIGEST = 'sha256:' + 'e'.repeat(64);
const COMPLETION_DIGEST = 'sha256:' + 'c'.repeat(64);

function freshLedger(now = 1_000) {
  return createSyntheticAuditLedger({
    privateKey: audit.privateKey,
    auditId: 'audit:test',
    genesisNote: 'synthetic test ledger',
    now
  });
}

function decisionOptions(ledger, overrides = {}) {
  return {
    ledger,
    id: 'decision:test-1',
    charter,
    trustedRootKeys: trustedRoots,
    policyName: 'DeployPolicy',
    operation: measuredOperation(),
    requester: 'ReleaseAgent',
    now: 1_000,
    ...overrides
  };
}

function throwsCode(code) {
  return error => error instanceof PraxisRuntimeError && error.code === code;
}

// ---------------------------------------------------------------------------
// Ledger construction and chain verification
// ---------------------------------------------------------------------------

test('ledger starts with an explicit signed genesis entry', () => {
  const ledger = freshLedger();
  const entries = ledgerEntries(ledger);
  assert.equal(entries.length, 1);
  assert.equal(entries[0].kind, 'genesis');
  assert.equal(entries[0].sequence, 0);
  assert.equal(entries[0].previous_entry_digest, null);
  assert.match(entries[0].entry_digest, /^sha256:[a-f0-9]{64}$/);
  assert.equal(entries[0].body.audit_id, 'audit:test');
  const result = verifyLedger(ledger);
  assert.equal(result.entries, 1);
  assert.equal(result.head_digest, entries[0].entry_digest);
});

test('closed entry kinds and denial codes are sealed', () => {
  assert.deepEqual([...LEDGER_ENTRY_KINDS], [
    'genesis',
    'authority_decision',
    'authority_issued',
    'prepared',
    'terminal_completed',
    'terminal_uncertain',
    'terminal_cancelled'
  ]);
  assert.ok(DECISION_DENIAL_CODES.includes('POLICY_UNPINNED'));
  assert.ok(DECISION_DENIAL_CODES.includes('ADVISOR_VETO'));
  assert.ok(Object.isFrozen(LEDGER_ENTRY_KINDS));
  assert.ok(Object.isFrozen(DECISION_DENIAL_CODES));
});

test('decide allow records decision and issuance entries with a signed receipt', async () => {
  const ledger = freshLedger();
  const outcome = await decideCharteredAuthority(decisionOptions(ledger, { receiptId: 'receipt:allow-1' }));

  assert.equal(outcome.decision, 'allow');
  assert.equal(outcome.denial, null);
  assert.ok(outcome.authority);
  assert.equal(outcome.authority.id, 'decision:test-1');

  const { receipt } = outcome;
  assert.equal(receipt.schema, 'praxis-decision-receipt.v0');
  assert.equal(receipt.decision, 'allow');
  assert.equal(receipt.denial_code, null);
  assert.equal(receipt.policy_name, 'DeployPolicy');
  assert.equal(receipt.requester, 'ReleaseAgent');
  assert.equal(receipt.authority_id, 'decision:test-1');
  assert.equal(receipt.operation_digest, outcome.authority.operation_digest);
  assert.deepEqual(receipt.premise_digests, outcome.authority.premises.map(item => item.predicate_digest));
  // Receipts are evidence only: no symbol-keyed brand of any kind.
  assert.equal(Object.getOwnPropertySymbols(receipt).length, 0);

  const entries = ledgerEntries(ledger);
  assert.equal(entries.length, 3);
  assert.deepEqual(entries.map(entry => entry.kind), ['genesis', 'authority_decision', 'authority_issued']);
  assert.deepEqual(entries.map(entry => entry.sequence), [0, 1, 2]);
  assert.equal(entries[1].body.receipt_digest, receipt.receipt_digest);
  assert.equal(entries[2].body.authority_id, 'decision:test-1');

  verifyLedger(ledger);
  const verified = verifyDecisionReceipt(receipt, { publicKey: audit.publicKey });
  assert.equal(verified.decision, 'allow');
});

test('decide deny is non-throwing, mints no authority, and records only a decision entry', async () => {
  const ledger = freshLedger();
  const outcome = await decideCharteredAuthority(decisionOptions(ledger, {
    receiptId: 'receipt:deny-1',
    policyName: 'MissingPolicy'
  }));

  assert.equal(outcome.decision, 'deny');
  assert.equal(outcome.authority, null);
  assert.equal(outcome.denial.code, 'POLICY_UNPINNED');
  assert.equal(outcome.denial.reason_class, 'policy_not_charter_pinned');

  const { receipt } = outcome;
  assert.equal(receipt.decision, 'deny');
  assert.equal(receipt.denial_code, 'POLICY_UNPINNED');
  assert.equal(receipt.authority_id, null);

  const entries = ledgerEntries(ledger);
  assert.equal(entries.length, 2);
  assert.deepEqual(entries.map(entry => entry.kind), ['genesis', 'authority_decision']);

  verifyLedger(ledger);
  verifyDecisionReceipt(receipt, { publicKey: audit.publicKey });
});

test('advisor veto becomes a signed deny receipt with a stable denial code', async () => {
  const ledger = freshLedger();
  const outcome = await decideCharteredAuthority(decisionOptions(ledger, {
    receiptId: 'receipt:veto-1',
    charter: vetoCharter,
    policyName: 'VetoPolicy',
    advisors: { VetoAdvisor: async () => ({ ok: true, deny: true }) }
  }));

  assert.equal(outcome.decision, 'deny');
  assert.equal(outcome.authority, null);
  assert.equal(outcome.denial.code, 'ADVISOR_VETO');
  assert.equal(outcome.receipt.advisor_identity, null);
  verifyLedger(ledger);
});

test('wrapper fails closed when the ledger handle is unavailable', async () => {
  await assert.rejects(
    decideCharteredAuthority(decisionOptions(null)),
    throwsCode('PRAXIS_LEDGER_REQUIRED')
  );
  await assert.rejects(
    decideCharteredAuthority(decisionOptions({ not: 'a ledger' })),
    throwsCode('PRAXIS_LEDGER_REQUIRED')
  );
});

// ---------------------------------------------------------------------------
// Evidence-only enforcement: receipts can never become authority
// ---------------------------------------------------------------------------

test('an allow receipt cannot be passed to run as an authority token', async () => {
  const ledger = freshLedger();
  const outcome = await decideCharteredAuthority(decisionOptions(ledger, { receiptId: 'receipt:authz-1' }));
  assert.equal(outcome.decision, 'allow');

  const ir = compile([
    'requires permit gate: Deploy @ Production;',
    'op release = Deploy("artifact") @ Production;',
    'authorize release using gate as armed;'
  ].join('\n'));

  await assert.rejects(
    run(ir, { authorities: { gate: outcome.receipt }, now: 1_000 }),
    throwsCode('PRAXIS_HOST_AUTHORITY_REQUIRED')
  );
});

test('a receipt presented as granting evidence is rejected and mints no authority', async () => {
  const ledger = freshLedger();
  const allow = await decideCharteredAuthority(decisionOptions(ledger, { receiptId: 'receipt:ev-1' }));
  assert.equal(allow.decision, 'allow');

  // A receipt is not kernel-verified evidence, so issuance with it as
  // evidence must deny rather than mint a second authority.
  const replay = await decideCharteredAuthority(decisionOptions(ledger, {
    receiptId: 'receipt:ev-2',
    id: 'decision:test-2',
    evidence: [allow.receipt]
  }));
  assert.equal(replay.decision, 'deny');
  assert.equal(replay.authority, null);
  assert.equal(replay.denial.code, 'EVIDENCE_UNVERIFIED');
  verifyLedger(ledger);
});

test('a receipt for release A cannot be replayed onto release B', async () => {
  const ledger = freshLedger();
  const outcome = await decideCharteredAuthority(decisionOptions(ledger, { receiptId: 'receipt:replay-1' }));
  const otherDigest = 'sha256:' + 'b'.repeat(64);

  assert.throws(
    () => verifyDecisionReceiptForOperation(outcome.receipt, {
      operationDigest: otherDigest,
      publicKey: audit.publicKey
    }),
    throwsCode('PRAXIS_LEDGER_RECEIPT_MISMATCH')
  );
  verifyDecisionReceiptForOperation(outcome.receipt, {
    operationDigest: outcome.receipt.operation_digest,
    publicKey: audit.publicKey
  });
});

test('receipt alone grants no new effect or capability', async () => {
  const ledger = freshLedger();
  const outcome = await decideCharteredAuthority(decisionOptions(ledger, { receiptId: 'receipt:cap-1' }));
  const { receipt } = outcome;

  assert.equal(Object.getOwnPropertySymbols(receipt).length, 0);
  assert.ok(!('authority_id' in receipt) || receipt.decision === 'allow');
  // An allow receipt still cannot stand in for the branded authority token:
  // it is not frozen with host authority and run() rejects it.
  assert.notEqual(receipt.schema, 'praxis-chartered-permit.v0');
  verifyDecisionReceipt(receipt, { publicKey: audit.publicKey });
});

// ---------------------------------------------------------------------------
// Tamper evidence
// ---------------------------------------------------------------------------

function freshEntries() {
  const ledger = freshLedger();
  return ledgerEntries(ledger).map(entry => ({ ...entry }));
}

test('tampering with a ledger entry body breaks digest verification', () => {
  const entries = freshEntries();
  entries[0] = { ...entries[0], body: { ...entries[0].body, genesis_note: 'forged note' } };
  assert.throws(
    () => verifyLedgerChain(entries, { publicKey: audit.publicKey }),
    throwsCode('PRAXIS_LEDGER_ENTRY_INVALID')
  );
});

test('a signature from the wrong audit key is rejected', () => {
  const ledger = freshLedger();
  const entries = ledgerEntries(ledger);
  assert.throws(
    () => verifyLedgerChain(entries, { publicKey: other.publicKey }),
    throwsCode('PRAXIS_LEDGER_ENTRY_INVALID')
  );
  // ...while the correct key verifies.
  verifyLedgerChain(entries, { publicKey: audit.publicKey });
});

test('mutating a previous-entry digest breaks the chain', async () => {
  const ledger = freshLedger();
  await decideCharteredAuthority(decisionOptions(ledger, { receiptId: 'receipt:chain-1', now: 1_000 }));
  const entries = ledgerEntries(ledger).map(entry => ({ ...entry }));
  // Point entry 1 at a different (but well-formed) previous digest.
  entries[1] = { ...entries[1], previous_entry_digest: 'sha256:' + 'a'.repeat(64) };
  assert.throws(
    () => verifyLedgerChain(entries, { publicKey: audit.publicKey }),
    throwsCode('PRAXIS_LEDGER_ENTRY_INVALID')
  );
});

test('duplicate sequence numbers are rejected', () => {
  const entries = freshEntries();
  const duplicate = { ...entries[0], sequence: 0 };
  assert.throws(
    () => verifyLedgerChain([...entries, duplicate], { publicKey: audit.publicKey }),
    throwsCode('PRAXIS_LEDGER_ENTRY_INVALID')
  );
});

test('reordering ledger entries breaks the chain', async () => {
  const ledger = freshLedger();
  await decideCharteredAuthority(decisionOptions(ledger, { receiptId: 'receipt:order-1', now: 1_000 }));
  const entries = ledgerEntries(ledger);
  const reordered = [entries[0], entries[2], entries[1]];
  assert.throws(
    () => verifyLedgerChain(reordered, { publicKey: audit.publicKey }),
    throwsCode('PRAXIS_LEDGER_ENTRY_INVALID')
  );
});

test('hand-forged entries without a valid signature are rejected', () => {
  const ledger = freshLedger();
  const [genesis] = ledgerEntries(ledger);
  const forged = {
    schema: 'praxis-ledger-entry.v0',
    sequence: 1,
    previous_entry_digest: genesis.entry_digest,
    kind: 'authority_issued',
    issued_at_ms: 2_000,
    body: { authority_id: 'forged' },
    entry_digest: 'sha256:' + 'f'.repeat(64),
    signature: Buffer.from('not-a-signature').toString('base64')
  };
  assert.throws(
    () => verifyLedgerEntry(forged, { publicKey: audit.publicKey, expectedSequence: 1 }),
    throwsCode('PRAXIS_LEDGER_ENTRY_INVALID')
  );
});

test('flipping allow to deny breaks receipt digest and signature verification', () => {
  const body = createDecisionReceiptBody({
    receiptId: 'receipt:flip-1',
    decision: 'allow',
    issuedAtMs: 1_000,
    policyName: 'DeployPolicy',
    requester: 'ReleaseAgent'
  });
  const receipt = signDecisionReceipt({ privateKey: audit.privateKey, body });
  verifyDecisionReceipt(receipt, { publicKey: audit.publicKey });

  const flipped = {
    ...receipt,
    decision: 'deny',
    denial_code: 'INTERNAL_ERROR',
    denial_reason_class: 'internal_error'
  };
  assert.throws(
    () => verifyDecisionReceipt(flipped, { publicKey: audit.publicKey }),
    throwsCode('PRAXIS_LEDGER_RECEIPT_INVALID')
  );
});

test('changing the denial reason breaks receipt verification', () => {
  const body = createDecisionReceiptBody({
    receiptId: 'receipt:reason-1',
    decision: 'deny',
    denialCode: 'POLICY_UNPINNED',
    denialReasonClass: 'policy_not_charter_pinned',
    issuedAtMs: 1_000,
    policyName: 'MissingPolicy',
    requester: 'ReleaseAgent'
  });
  const receipt = signDecisionReceipt({ privateKey: audit.privateKey, body });
  const mutated = { ...receipt, denial_reason_class: 'tampered_reason' };
  assert.throws(
    () => verifyDecisionReceipt(mutated, { publicKey: audit.publicKey }),
    throwsCode('PRAXIS_LEDGER_RECEIPT_INVALID')
  );
});

test('a receipt signed by the wrong audit key is rejected', () => {
  const body = createDecisionReceiptBody({
    receiptId: 'receipt:wrongkey-1',
    decision: 'allow',
    issuedAtMs: 1_000,
    policyName: 'DeployPolicy',
    requester: 'ReleaseAgent'
  });
  const receipt = signDecisionReceipt({ privateKey: other.privateKey, body });
  assert.throws(
    () => verifyDecisionReceipt(receipt, { publicKey: audit.publicKey }),
    throwsCode('PRAXIS_LEDGER_RECEIPT_INVALID')
  );
});

// ---------------------------------------------------------------------------
// Preparation and terminal effect linkage
// ---------------------------------------------------------------------------

test('prepared and terminal entries bind exact digests and agree on finality', async () => {
  const ledger = freshLedger();
  const outcome = await decideCharteredAuthority(decisionOptions(ledger, { receiptId: 'receipt:fx-1' }));
  const operationDigest = outcome.authority.operation_digest;

  const prepared = recordPreparedEffect({
    ledger,
    operationDigest,
    preparationDigest: PREPARATION_DIGEST,
    authorityId: outcome.authority.id,
    policyDigest: outcome.authority.policy_digest,
    finality: 'commit',
    irreversible: false,
    now: 2_000
  });
  assert.equal(prepared.entry.kind, 'prepared');

  const terminal = recordTerminalEffect({
    ledger,
    preparedEntryDigest: prepared.entry.entry_digest,
    finality: 'commit',
    executorReceiptDigest: EXECUTOR_RECEIPT_DIGEST,
    completionEvidenceDigest: COMPLETION_DIGEST,
    now: 3_000
  });
  assert.equal(terminal.entry.kind, 'terminal_completed');
  assert.equal(terminal.entry.body.executor_receipt_digest, EXECUTOR_RECEIPT_DIGEST);

  verifyLedger(ledger);
  const entries = ledgerEntries(ledger);
  assert.deepEqual(
    entries.map(entry => entry.kind),
    ['genesis', 'authority_decision', 'authority_issued', 'prepared', 'terminal_completed']
  );
});

test('a preparation entry cannot claim another operation digest', async () => {
  const ledger = freshLedger();
  const outcome = await decideCharteredAuthority(decisionOptions(ledger, { receiptId: 'receipt:px-1' }));
  const prepared = recordPreparedEffect({
    ledger,
    operationDigest: outcome.authority.operation_digest,
    preparationDigest: PREPARATION_DIGEST,
    authorityId: outcome.authority.id,
    now: 2_000
  });

  assert.throws(
    () => recordTerminalEffect({
      ledger,
      preparedEntryDigest: prepared.entry.entry_digest,
      operationDigest: 'sha256:' + 'b'.repeat(64),
      finality: 'commit',
      executorReceiptDigest: EXECUTOR_RECEIPT_DIGEST,
      completionEvidenceDigest: COMPLETION_DIGEST,
      now: 3_000
    }),
    throwsCode('PRAXIS_LEDGER_DIGEST_MISMATCH')
  );
});

test('commit/finalize mismatch between prepared and terminal entries is refused', async () => {
  const ledger = freshLedger();
  const outcome = await decideCharteredAuthority(decisionOptions(ledger, { receiptId: 'receipt:fm-1' }));
  const prepared = recordPreparedEffect({
    ledger,
    operationDigest: outcome.authority.operation_digest,
    preparationDigest: PREPARATION_DIGEST,
    authorityId: outcome.authority.id,
    finality: 'commit',
    irreversible: false,
    now: 2_000
  });

  assert.throws(
    () => recordTerminalEffect({
      ledger,
      preparedEntryDigest: prepared.entry.entry_digest,
      finality: 'finalize',
      executorReceiptDigest: EXECUTOR_RECEIPT_DIGEST,
      completionEvidenceDigest: COMPLETION_DIGEST,
      now: 3_000
    }),
    throwsCode('PRAXIS_LEDGER_FINALITY_MISMATCH')
  );
});

test('irreversible preparation refuses a commit terminal transition', async () => {
  const ledger = freshLedger();
  const outcome = await decideCharteredAuthority(decisionOptions(ledger, { receiptId: 'receipt:irr-1' }));
  const prepared = recordPreparedEffect({
    ledger,
    operationDigest: outcome.authority.operation_digest,
    preparationDigest: PREPARATION_DIGEST,
    authorityId: outcome.authority.id,
    irreversible: true,
    now: 2_000
  });

  assert.throws(
    () => recordTerminalEffect({
      ledger,
      preparedEntryDigest: prepared.entry.entry_digest,
      finality: 'commit',
      executorReceiptDigest: EXECUTOR_RECEIPT_DIGEST,
      completionEvidenceDigest: COMPLETION_DIGEST,
      now: 3_000
    }),
    throwsCode('PRAXIS_LEDGER_FINALITY_MISMATCH')
  );
});

test('an uncertain terminal state cannot be rewritten as completed', async () => {
  const ledger = freshLedger();
  const outcome = await decideCharteredAuthority(decisionOptions(ledger, { receiptId: 'receipt:unc-1' }));
  const prepared = recordPreparedEffect({
    ledger,
    operationDigest: outcome.authority.operation_digest,
    preparationDigest: PREPARATION_DIGEST,
    authorityId: outcome.authority.id,
    finality: 'commit',
    irreversible: false,
    now: 2_000
  });

  const uncertain = recordTerminalEffect({
    ledger,
    preparedEntryDigest: prepared.entry.entry_digest,
    finality: 'commit',
    outcome: 'uncertain',
    uncertainty: { state: 'prepared', completion_committed: false },
    now: 3_000
  });
  assert.equal(uncertain.entry.kind, 'terminal_uncertain');
  assert.equal(uncertain.entry.body.completion_claimed, false);

  assert.throws(
    () => recordTerminalEffect({
      ledger,
      preparedEntryDigest: prepared.entry.entry_digest,
      finality: 'commit',
      executorReceiptDigest: EXECUTOR_RECEIPT_DIGEST,
      completionEvidenceDigest: COMPLETION_DIGEST,
      now: 4_000
    }),
    throwsCode('PRAXIS_LEDGER_TERMINAL_EXISTS')
  );
  verifyLedger(ledger);
});

test('cancellation cannot coexist as a second terminal transition', async () => {
  const ledger = freshLedger();
  const outcome = await decideCharteredAuthority(decisionOptions(ledger, { receiptId: 'receipt:cx-1' }));
  const prepared = recordPreparedEffect({
    ledger,
    operationDigest: outcome.authority.operation_digest,
    preparationDigest: PREPARATION_DIGEST,
    authorityId: outcome.authority.id,
    finality: 'commit',
    irreversible: false,
    now: 2_000
  });

  const completed = recordTerminalEffect({
    ledger,
    preparedEntryDigest: prepared.entry.entry_digest,
    finality: 'commit',
    executorReceiptDigest: EXECUTOR_RECEIPT_DIGEST,
    completionEvidenceDigest: COMPLETION_DIGEST,
    now: 3_000
  });
  assert.equal(completed.entry.kind, 'terminal_completed');

  assert.throws(
    () => recordTerminalEffect({
      ledger,
      preparedEntryDigest: prepared.entry.entry_digest,
      finality: 'commit',
      outcome: 'cancelled',
      cancellationRef: 'cancel:1',
      now: 4_000
    }),
    throwsCode('PRAXIS_LEDGER_TERMINAL_EXISTS')
  );
});

test('a terminal entry must reference a prepared entry in the same ledger', () => {
  const ledger = freshLedger();
  const foreign = freshLedger();

  const prepared = recordPreparedEffect({
    ledger: foreign,
    operationDigest: 'sha256:' + 'a'.repeat(64),
    preparationDigest: PREPARATION_DIGEST,
    authorityId: 'authority:foreign',
    now: 2_000
  });

  assert.throws(
    () => recordTerminalEffect({
      ledger,
      preparedEntryDigest: prepared.entry.entry_digest,
      finality: 'commit',
      executorReceiptDigest: EXECUTOR_RECEIPT_DIGEST,
      completionEvidenceDigest: COMPLETION_DIGEST,
      now: 3_000
    }),
    throwsCode('PRAXIS_LEDGER_UNKNOWN_PREPARATION')
  );
});

test('duplicate preparation recording is refused', async () => {
  const ledger = freshLedger();
  const outcome = await decideCharteredAuthority(decisionOptions(ledger, { receiptId: 'receipt:dup-1' }));
  const params = {
    ledger,
    operationDigest: outcome.authority.operation_digest,
    preparationDigest: PREPARATION_DIGEST,
    authorityId: outcome.authority.id,
    now: 2_000
  };
  recordPreparedEffect(params);
  assert.throws(
    () => recordPreparedEffect(params),
    throwsCode('PRAXIS_LEDGER_DUPLICATE_PREPARATION')
  );
});

test('terminal entries require completion evidence for completed outcomes', async () => {
  const ledger = freshLedger();
  const outcome = await decideCharteredAuthority(decisionOptions(ledger, { receiptId: 'receipt:te-1' }));
  const prepared = recordPreparedEffect({
    ledger,
    operationDigest: outcome.authority.operation_digest,
    preparationDigest: PREPARATION_DIGEST,
    authorityId: outcome.authority.id,
    now: 2_000
  });

  assert.throws(
    () => recordTerminalEffect({
      ledger,
      preparedEntryDigest: prepared.entry.entry_digest,
      finality: 'commit',
      now: 3_000
    }),
    /executor receipt digest/
  );
});
