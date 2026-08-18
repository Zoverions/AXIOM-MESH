import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import test from 'node:test';

import { normalizeMachinePrincipalDefinition } from '../src/lib/machine-principal.mjs';
import { createMachineIdentityCredential } from '../src/lib/agent-trust-machine-identity.mjs';
import {
  createAgentContributionHistoryReceipt,
  verifyAgentContributionHistoryChain,
  verifyAgentContributionHistoryReceipt
} from '../src/lib/agent-trust-contribution-history.mjs';

const humans = new Set(['owner.alice']);
const SUBJECT_A = 'a'.repeat(64);
const SUBJECT_B = 'b'.repeat(64);
const SUBJECT_C = 'c'.repeat(64);
const EVIDENCE_A = 'd'.repeat(64);
const EVIDENCE_B = 'e'.repeat(64);
const EVIDENCE_C = 'f'.repeat(64);

function principal(id, runtimeId) {
  return normalizeMachinePrincipalDefinition({
    id,
    type: 'agent',
    sponsor: 'owner.alice',
    roles: ['researcher'],
    scopes: ['intent:execute'],
    lifetime: 'session',
    expires_at: '2026-09-01T00:00:00.000Z',
    runtime: {
      id: runtimeId,
      kind: 'local-process',
      software_digest: '1'.repeat(64)
    },
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

function identity(id, runtimeId) {
  const issuer = generateKeyPairSync('ed25519');
  const operational = generateKeyPairSync('ed25519');
  const machine = principal(id, runtimeId);
  const credential = createMachineIdentityCredential({
    principal: machine,
    issuerId: `identity.${id}`,
    issuerPrivateKey: issuer.privateKey,
    operationalPublicKey: operational.publicKey,
    keyEpoch: 1,
    issuedAt: '2026-08-17T20:00:00.000Z',
    validFrom: '2026-08-17T20:00:00.000Z',
    expiresAt: '2026-08-25T20:00:00.000Z',
    knownHumanPrincipals: humans
  });
  return { issuer, operational, machine, credential };
}

function fixture() {
  return {
    contributor: identity('agent.contributor.1', 'runtime.contributor.1'),
    reviewer: identity('agent.reviewer.1', 'runtime.reviewer.1')
  };
}

function evidence(f) {
  return {
    contributorIdentityCredential: f.contributor.credential,
    trustedContributorIssuerPublicKey: f.contributor.issuer.publicKey,
    reviewerIdentityCredential: f.reviewer.credential,
    trustedReviewerIssuerPublicKey: f.reviewer.issuer.publicKey
  };
}

function createReceipt(f, {
  receiptId,
  sequence,
  previousReceipt = null,
  contributionId,
  kind,
  disposition,
  subjectDigest,
  evidenceDigests,
  workReceiptDigests = [],
  supersedesReceiptDigests = [],
  reviewedAt,
  reviewReasonCode = 'reviewed'
}) {
  return createAgentContributionHistoryReceipt({
    receiptId,
    historySequence: sequence,
    previousReceipt,
    contributionId,
    contributorIdentityCredential: f.contributor.credential,
    trustedContributorIssuerPublicKey: f.contributor.issuer.publicKey,
    reviewerIdentityCredential: f.reviewer.credential,
    trustedReviewerIssuerPublicKey: f.reviewer.issuer.publicKey,
    reviewerOperationalPrivateKey: f.reviewer.operational.privateKey,
    repositoryScope: 'Zoverions/AXIOM-MESH',
    capabilityContexts: ['agent-trust', 'core.echo'],
    contributionKind: kind,
    disposition,
    subjectDigest,
    evidenceDigests,
    workReceiptDigests,
    supersedesReceiptDigests,
    reviewReasonCode,
    reviewedAt
  });
}

function history(f) {
  const first = createReceipt(f, {
    receiptId: 'history.receipt.1',
    sequence: 1,
    contributionId: 'contribution.finding.1',
    kind: 'finding',
    disposition: 'accepted',
    subjectDigest: SUBJECT_A,
    evidenceDigests: [EVIDENCE_A],
    workReceiptDigests: ['2'.repeat(64)],
    reviewedAt: '2026-08-17T20:01:00.000Z'
  });
  const second = createReceipt(f, {
    receiptId: 'history.receipt.2',
    sequence: 2,
    previousReceipt: first,
    contributionId: 'contribution.test.2',
    kind: 'test',
    disposition: 'rejected',
    subjectDigest: SUBJECT_B,
    evidenceDigests: [EVIDENCE_B],
    reviewedAt: '2026-08-17T20:02:00.000Z',
    reviewReasonCode: 'not-reproducible'
  });
  const third = createReceipt(f, {
    receiptId: 'history.receipt.3',
    sequence: 3,
    previousReceipt: second,
    contributionId: 'contribution.claim.3',
    kind: 'claim',
    disposition: 'invalidated',
    subjectDigest: SUBJECT_C,
    evidenceDigests: [EVIDENCE_C],
    supersedesReceiptDigests: [first.receipt_digest],
    reviewedAt: '2026-08-17T20:03:00.000Z',
    reviewReasonCode: 'contradicted-by-evidence'
  });
  return { first, second, third };
}

test('A8a signed contribution receipt is evidence for review prioritization only', () => {
  const f = fixture();
  const { first } = history(f);
  const verified = verifyAgentContributionHistoryReceipt(first, evidence(f));
  assert.equal(verified.statement.contributor_principal_id, f.contributor.machine.id);
  assert.equal(verified.statement.reviewer_principal_id, f.reviewer.machine.id);
  assert.equal(verified.statement.history_use, 'review-prioritization-evidence-only');
  assert.equal(verified.statement.authority_effect, 'none');
  assert.equal(verified.statement.scope_grant_claimed, false);
  assert.equal(verified.statement.merge_rights_claimed, false);
  assert.equal(verified.statement.execution_rights_claimed, false);
  assert.equal(verified.statement.approval_exemption_claimed, false);
  assert.equal(verified.statement.global_reputation_score_claimed, false);
  assert.equal(verified.statement.model_brand_signal_used, false);
  assert.equal(verified.statement.popularity_signal_used, false);
});

test('A8a history chain preserves accepted, rejected and invalidated evidence without producing a scalar score', () => {
  const f = fixture();
  const { first, second, third } = history(f);
  const verified = verifyAgentContributionHistoryChain([
    { receipt: first, evidence: evidence(f) },
    { receipt: second, evidence: evidence(f) },
    { receipt: third, evidence: evidence(f) }
  ], {
    expectedLatestReceiptDigest: third.receipt_digest
  });
  assert.equal(verified.receipts_verified, 3);
  assert.equal(verified.disposition_counts.accepted, 1);
  assert.equal(verified.disposition_counts.rejected, 1);
  assert.equal(verified.disposition_counts.invalidated, 1);
  assert.equal(verified.contribution_kind_counts.finding, 1);
  assert.equal(verified.contribution_kind_counts.test, 1);
  assert.equal(verified.contribution_kind_counts.claim, 1);
  assert.equal(verified.review_priority_evidence_available, true);
  assert.equal(verified.scalar_reputation_score_produced, false);
  assert.equal(verified.authority_granted, false);
  assert.equal(verified.merge_rights_granted, false);
  assert.equal(verified.execution_rights_granted, false);
  assert.equal(verified.approval_exemption_granted, false);
  assert.equal(verified.sybil_resistance_claimed, false);
  assert.equal(verified.collusion_resistance_claimed, false);
  assert.equal(verified.identity_reset_resistance_claimed, false);
});

test('known latest head prevents selective presentation of an older all-positive prefix', () => {
  const f = fixture();
  const { first, third } = history(f);
  assert.throws(() => verifyAgentContributionHistoryChain([
    { receipt: first, evidence: evidence(f) }
  ], {
    expectedLatestReceiptDigest: third.receipt_digest
  }), /does not end at the expected retained latest head/);

  const historical = verifyAgentContributionHistoryChain([
    { receipt: first, evidence: evidence(f) }
  ]);
  assert.equal(historical.global_history_completeness_claimed, false);
  assert.equal(historical.global_history_currentness_claimed, false);
});

test('evidence-backed history refuses empty evidence sets', () => {
  const f = fixture();
  assert.throws(() => createReceipt(f, {
    receiptId: 'history.no-evidence',
    sequence: 1,
    contributionId: 'contribution.no-evidence',
    kind: 'finding',
    disposition: 'accepted',
    subjectDigest: SUBJECT_A,
    evidenceDigests: [],
    reviewedAt: '2026-08-17T20:01:00.000Z'
  }), /evidence_digests must contain 1-256 digests/);
});

test('self-review fails closed even with a structurally valid A1 credential', () => {
  const f = fixture();
  assert.throws(() => createAgentContributionHistoryReceipt({
    receiptId: 'history.self-review',
    historySequence: 1,
    contributionId: 'contribution.self-review',
    contributorIdentityCredential: f.contributor.credential,
    trustedContributorIssuerPublicKey: f.contributor.issuer.publicKey,
    reviewerIdentityCredential: f.contributor.credential,
    trustedReviewerIssuerPublicKey: f.contributor.issuer.publicKey,
    reviewerOperationalPrivateKey: f.contributor.operational.privateKey,
    repositoryScope: 'Zoverions/AXIOM-MESH',
    capabilityContexts: ['agent-trust'],
    contributionKind: 'finding',
    disposition: 'accepted',
    subjectDigest: SUBJECT_A,
    evidenceDigests: [EVIDENCE_A],
    reviewReasonCode: 'self-review',
    reviewedAt: '2026-08-17T20:01:00.000Z'
  }), /does not permit self-review/);
});

test('reviewer key substitution and receipt tamper fail closed', () => {
  const f = fixture();
  const { first } = history(f);
  const otherReviewer = identity('agent.reviewer.other', 'runtime.reviewer.other');
  assert.throws(() => verifyAgentContributionHistoryReceipt(first, {
    ...evidence(f),
    reviewerIdentityCredential: otherReviewer.credential,
    trustedReviewerIssuerPublicKey: otherReviewer.issuer.publicKey
  }), /principal_id mismatch|credential digest mismatch/);

  const tampered = structuredClone(first);
  tampered.statement.merge_rights_claimed = true;
  assert.throws(
    () => verifyAgentContributionHistoryReceipt(tampered, evidence(f)),
    /merge_rights_claimed must remain false/
  );
});

test('reversing dispositions require explicit superseded receipt evidence', () => {
  const f = fixture();
  const { first } = history(f);
  assert.throws(() => createReceipt(f, {
    receiptId: 'history.invalidated-without-link',
    sequence: 2,
    previousReceipt: first,
    contributionId: 'contribution.invalidated',
    kind: 'claim',
    disposition: 'invalidated',
    subjectDigest: SUBJECT_C,
    evidenceDigests: [EVIDENCE_C],
    reviewedAt: '2026-08-17T20:02:00.000Z'
  }), /invalidated contribution history requires superseded receipt evidence/);

  assert.throws(() => createReceipt(f, {
    receiptId: 'history.accepted-with-fake-supersedes',
    sequence: 2,
    previousReceipt: first,
    contributionId: 'contribution.accepted',
    kind: 'claim',
    disposition: 'accepted',
    subjectDigest: SUBJECT_C,
    evidenceDigests: [EVIDENCE_C],
    supersedesReceiptDigests: [first.receipt_digest],
    reviewedAt: '2026-08-17T20:02:00.000Z'
  }), /accepted contribution history cannot name superseded receipts/);
});

test('identity reset cannot silently continue an existing contributor history chain', () => {
  const f = fixture();
  const { first } = history(f);
  const resetContributor = identity('agent.contributor.reset', 'runtime.contributor.reset');
  assert.throws(() => createAgentContributionHistoryReceipt({
    receiptId: 'history.reset.2',
    historySequence: 2,
    previousReceipt: first,
    previousReceiptEvidence: evidence(f),
    contributionId: 'contribution.reset.2',
    contributorIdentityCredential: resetContributor.credential,
    trustedContributorIssuerPublicKey: resetContributor.issuer.publicKey,
    reviewerIdentityCredential: f.reviewer.credential,
    trustedReviewerIssuerPublicKey: f.reviewer.issuer.publicKey,
    reviewerOperationalPrivateKey: f.reviewer.operational.privateKey,
    repositoryScope: 'Zoverions/AXIOM-MESH',
    capabilityContexts: ['agent-trust'],
    contributionKind: 'test',
    disposition: 'accepted',
    subjectDigest: SUBJECT_B,
    evidenceDigests: [EVIDENCE_B],
    reviewReasonCode: 'new-identity',
    reviewedAt: '2026-08-17T20:02:00.000Z'
  }), /history chain changed contributor, reviewer or repository/);
});

test('history chain rejects omission, reordering and reviewer/repository switching', () => {
  const f = fixture();
  const { first, second, third } = history(f);
  assert.throws(() => verifyAgentContributionHistoryChain([
    { receipt: first, evidence: evidence(f) },
    { receipt: third, evidence: evidence(f) }
  ]), /sequence must advance exactly one|predecessor receipt digest mismatch/);
  assert.throws(() => verifyAgentContributionHistoryChain([
    { receipt: second, evidence: evidence(f) },
    { receipt: third, evidence: evidence(f) }
  ]), /must start at sequence one/);
});

test('unknown popularity or model-brand fields cannot be smuggled into a receipt', () => {
  const f = fixture();
  const { first } = history(f);
  const popularity = structuredClone(first);
  popularity.statement.popularity_score = 999999;
  assert.throws(
    () => verifyAgentContributionHistoryReceipt(popularity, evidence(f)),
    /unsupported field popularity_score/
  );
  const brand = structuredClone(first);
  brand.statement.model_brand = 'prestigious-model';
  assert.throws(
    () => verifyAgentContributionHistoryReceipt(brand, evidence(f)),
    /unsupported field model_brand/
  );
});
