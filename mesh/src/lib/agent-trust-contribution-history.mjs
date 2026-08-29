import {
  createPrivateKey,
  createPublicKey,
  sign,
  verify
} from 'node:crypto';

import {
  ValidationError,
  assertPlainObject,
  assertString,
  canonicalJson,
  digestObject
} from './canonical.mjs';
import {
  machineIdentityKeyId,
  verifyMachineIdentityCredential
} from './agent-trust-machine-identity.mjs';

export const AGENT_CONTRIBUTION_HISTORY_RECEIPT_SCHEMA =
  'axiom-agent-contribution-history-receipt.v1';

const ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,191}$/;
const DIGEST = /^[a-f0-9]{64}$/;
const BASE64URL = /^[A-Za-z0-9_-]+$/;
const REASON = /^[a-z][a-z0-9._-]{0,63}$/;
const REPOSITORY = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;

const CONTRIBUTION_KINDS = new Set([
  'finding',
  'reproduction',
  'test',
  'security-finding',
  'reversion',
  'claim'
]);
const DISPOSITIONS = new Set([
  'accepted',
  'rejected',
  'reproduced',
  'failed-reproduction',
  'superseded',
  'invalidated',
  'reverted'
]);
const REVERSING_DISPOSITIONS = new Set(['superseded', 'invalidated', 'reverted']);

const TOP_KEYS = new Set([
  'schema', 'statement', 'statement_digest', 'reviewer_signature', 'receipt_digest'
]);
const STATEMENT_KEYS = new Set([
  'receipt_id', 'history_sequence', 'predecessor_receipt_digest',
  'contribution_id', 'contributor_principal_id', 'contributor_credential_digest',
  'reviewer_principal_id', 'reviewer_credential_digest', 'reviewer_operational_key_id',
  'repository_scope', 'capability_contexts', 'contribution_kind', 'disposition',
  'subject_digest', 'evidence_digests', 'work_receipt_digests',
  'supersedes_receipt_digests', 'review_reason_code', 'reviewed_at',
  'history_use', 'history_completeness_scope', 'global_history_completeness_claimed',
  'chain_entry_omission_allowed', 'negative_evidence_erasure_allowed',
  'superseded_evidence_erasure_allowed', 'authority_effect', 'delegation_effect',
  'scope_grant_claimed', 'merge_rights_claimed', 'execution_rights_claimed',
  'approval_exemption_claimed', 'global_reputation_score_claimed',
  'global_history_currentness_claimed', 'sybil_resistance_claimed',
  'collusion_resistance_claimed', 'identity_reset_resistance_claimed',
  'model_brand_signal_used', 'popularity_signal_used', 'self_review_allowed'
]);

const FIXED_SEMANTICS = Object.freeze({
  history_use: 'review-prioritization-evidence-only',
  history_completeness_scope: 'verified-chain-and-expected-head-only',
  global_history_completeness_claimed: false,
  chain_entry_omission_allowed: false,
  negative_evidence_erasure_allowed: false,
  superseded_evidence_erasure_allowed: false,
  authority_effect: 'none',
  delegation_effect: 'none',
  scope_grant_claimed: false,
  merge_rights_claimed: false,
  execution_rights_claimed: false,
  approval_exemption_claimed: false,
  global_reputation_score_claimed: false,
  global_history_currentness_claimed: false,
  sybil_resistance_claimed: false,
  collusion_resistance_claimed: false,
  identity_reset_resistance_claimed: false,
  model_brand_signal_used: false,
  popularity_signal_used: false,
  self_review_allowed: false
});

function exactObject(raw, allowed, label) {
  const value = assertPlainObject(raw, label);
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) throw new ValidationError(`${label} contains unsupported field ${key}`);
  }
  for (const key of allowed) {
    if (!Object.hasOwn(value, key)) throw new ValidationError(`${label} is missing required field ${key}`);
  }
  return value;
}

function identifier(value, label) {
  return assertString(value, label, { min: 1, max: 192, pattern: ID });
}

function digest(value, label) {
  return assertString(value, label, { min: 64, max: 64, pattern: DIGEST });
}

function nullableDigest(value, label) {
  return value === null ? null : digest(value, label);
}

function canonicalTimestamp(value, label) {
  const text = assertString(value, label, { min: 24, max: 24 });
  const parsed = new Date(text);
  if (Number.isNaN(parsed.valueOf()) || parsed.toISOString() !== text) {
    throw new ValidationError(`${label} must be a canonical UTC ISO timestamp`);
  }
  return text;
}

function timestampValue(value) {
  return new Date(value).valueOf();
}

function positiveInteger(value, label, max = Number.MAX_SAFE_INTEGER) {
  if (!Number.isSafeInteger(value) || value < 1 || value > max) {
    throw new ValidationError(`${label} must be a positive safe integer`);
  }
  return value;
}

function canonicalStringSet(raw, label, { minItems = 0, maxItems = 128, maxLength = 192 } = {}) {
  if (!Array.isArray(raw) || raw.length < minItems || raw.length > maxItems) {
    throw new ValidationError(`${label} must contain ${minItems}-${maxItems} strings`);
  }
  const values = raw.map((item, index) => assertString(item, `${label}[${index}]`, {
    min: 1,
    max: maxLength
  }));
  const canonical = [...new Set(values)].sort();
  if (canonicalJson(values) !== canonicalJson(canonical)) {
    throw new ValidationError(`${label} must be sorted and unique`);
  }
  return Object.freeze(canonical);
}

function canonicalDigestSet(raw, label, { minItems = 0, maxItems = 256 } = {}) {
  if (!Array.isArray(raw) || raw.length < minItems || raw.length > maxItems) {
    throw new ValidationError(`${label} must contain ${minItems}-${maxItems} digests`);
  }
  const values = raw.map((item, index) => digest(item, `${label}[${index}]`));
  const canonical = [...new Set(values)].sort();
  if (canonicalJson(values) !== canonicalJson(canonical)) {
    throw new ValidationError(`${label} must be sorted and unique`);
  }
  return Object.freeze(canonical);
}

function parsePrivateKey(value, label) {
  let key;
  try {
    key = value && typeof value === 'object' && value.type === 'private'
      ? value
      : createPrivateKey(value);
  } catch {
    throw new ValidationError(`${label} is invalid`);
  }
  if (key.asymmetricKeyType !== 'ed25519') throw new ValidationError(`${label} must be Ed25519`);
  return key;
}

function parsePublicKey(value, label) {
  let key;
  try {
    key = value && typeof value === 'object' && value.type === 'public'
      ? value
      : createPublicKey(value);
  } catch {
    throw new ValidationError(`${label} is invalid`);
  }
  if (key.asymmetricKeyType !== 'ed25519') throw new ValidationError(`${label} must be Ed25519`);
  return key;
}

function assertFixedSemantics(raw) {
  for (const [key, expected] of Object.entries(FIXED_SEMANTICS)) {
    if (raw[key] !== expected) {
      throw new ValidationError(`agent contribution history ${key} must remain ${String(expected)}`);
    }
  }
}

function normalizeStatement(raw) {
  const value = exactObject(raw, STATEMENT_KEYS, 'agent contribution history statement');
  assertFixedSemantics(value);
  const sequence = positiveInteger(value.history_sequence, 'agent contribution history_sequence', 1_000_000);
  const predecessor = nullableDigest(
    value.predecessor_receipt_digest,
    'agent contribution predecessor_receipt_digest'
  );
  if (sequence === 1 && predecessor !== null) {
    throw new ValidationError('agent contribution genesis receipt cannot name a predecessor');
  }
  if (sequence > 1 && predecessor === null) {
    throw new ValidationError('agent contribution non-genesis receipt requires a predecessor');
  }
  const kind = assertString(value.contribution_kind, 'agent contribution contribution_kind', {
    min: 4,
    max: 32
  });
  if (!CONTRIBUTION_KINDS.has(kind)) {
    throw new ValidationError('agent contribution contribution_kind is unsupported');
  }
  const disposition = assertString(value.disposition, 'agent contribution disposition', {
    min: 7,
    max: 32
  });
  if (!DISPOSITIONS.has(disposition)) {
    throw new ValidationError('agent contribution disposition is unsupported');
  }
  const supersedes = canonicalDigestSet(
    value.supersedes_receipt_digests,
    'agent contribution supersedes_receipt_digests',
    { maxItems: 64 }
  );
  if (REVERSING_DISPOSITIONS.has(disposition) && supersedes.length < 1) {
    throw new ValidationError(`${disposition} contribution history requires superseded receipt evidence`);
  }
  if (!REVERSING_DISPOSITIONS.has(disposition) && supersedes.length > 0) {
    throw new ValidationError(`${disposition} contribution history cannot name superseded receipts`);
  }
  const repositoryScope = assertString(value.repository_scope, 'agent contribution repository_scope', {
    min: 3,
    max: 192,
    pattern: REPOSITORY
  });
  return Object.freeze({
    receipt_id: identifier(value.receipt_id, 'agent contribution receipt_id'),
    history_sequence: sequence,
    predecessor_receipt_digest: predecessor,
    contribution_id: identifier(value.contribution_id, 'agent contribution contribution_id'),
    contributor_principal_id: identifier(
      value.contributor_principal_id,
      'agent contribution contributor_principal_id'
    ),
    contributor_credential_digest: digest(
      value.contributor_credential_digest,
      'agent contribution contributor_credential_digest'
    ),
    reviewer_principal_id: identifier(
      value.reviewer_principal_id,
      'agent contribution reviewer_principal_id'
    ),
    reviewer_credential_digest: digest(
      value.reviewer_credential_digest,
      'agent contribution reviewer_credential_digest'
    ),
    reviewer_operational_key_id: digest(
      value.reviewer_operational_key_id,
      'agent contribution reviewer_operational_key_id'
    ),
    repository_scope: repositoryScope,
    capability_contexts: canonicalStringSet(
      value.capability_contexts,
      'agent contribution capability_contexts',
      { minItems: 1, maxItems: 64, maxLength: 160 }
    ),
    contribution_kind: kind,
    disposition,
    subject_digest: digest(value.subject_digest, 'agent contribution subject_digest'),
    evidence_digests: canonicalDigestSet(
      value.evidence_digests,
      'agent contribution evidence_digests',
      { minItems: 1, maxItems: 256 }
    ),
    work_receipt_digests: canonicalDigestSet(
      value.work_receipt_digests,
      'agent contribution work_receipt_digests',
      { maxItems: 128 }
    ),
    supersedes_receipt_digests: supersedes,
    review_reason_code: assertString(value.review_reason_code, 'agent contribution review_reason_code', {
      min: 1,
      max: 64,
      pattern: REASON
    }),
    reviewed_at: canonicalTimestamp(value.reviewed_at, 'agent contribution reviewed_at'),
    ...FIXED_SEMANTICS
  });
}

function verifyIdentityBinding({
  credential,
  trustedIssuerPublicKey,
  expectedPrincipalId,
  expectedCredentialDigest,
  label
}) {
  const verified = verifyMachineIdentityCredential(credential, {
    trustedIssuerPublicKey,
    expectedPrincipalId
  });
  if (verified.credential_digest !== expectedCredentialDigest) {
    throw new ValidationError(`${label} credential digest mismatch`);
  }
  return verified;
}

function verifySignedEnvelope(raw, evidence = {}) {
  const value = exactObject(raw, TOP_KEYS, 'agent contribution history receipt');
  if (value.schema !== AGENT_CONTRIBUTION_HISTORY_RECEIPT_SCHEMA) {
    throw new ValidationError(
      `agent contribution history schema must be ${AGENT_CONTRIBUTION_HISTORY_RECEIPT_SCHEMA}`
    );
  }
  const statement = normalizeStatement(value.statement);
  const statementDigest = digest(value.statement_digest, 'agent contribution statement_digest');
  if (statementDigest !== digestObject(statement)) {
    throw new ValidationError('agent contribution statement digest mismatch');
  }

  const contributor = verifyIdentityBinding({
    credential: evidence.contributorIdentityCredential,
    trustedIssuerPublicKey: evidence.trustedContributorIssuerPublicKey,
    expectedPrincipalId: statement.contributor_principal_id,
    expectedCredentialDigest: statement.contributor_credential_digest,
    label: 'agent contribution contributor'
  });
  const reviewer = verifyIdentityBinding({
    credential: evidence.reviewerIdentityCredential,
    trustedIssuerPublicKey: evidence.trustedReviewerIssuerPublicKey,
    expectedPrincipalId: statement.reviewer_principal_id,
    expectedCredentialDigest: statement.reviewer_credential_digest,
    label: 'agent contribution reviewer'
  });
  if (contributor.statement.principal_id === reviewer.statement.principal_id) {
    throw new ValidationError('agent contribution history does not permit self-review');
  }
  if (reviewer.statement.operational_key_id !== statement.reviewer_operational_key_id) {
    throw new ValidationError('agent contribution reviewer operational key binding mismatch');
  }

  const reviewerPublicKey = parsePublicKey(
    reviewer.statement.operational_public_key,
    'agent contribution reviewer operational public key'
  );
  const signature = assertString(value.reviewer_signature, 'agent contribution reviewer_signature', {
    min: 32,
    max: 1024,
    pattern: BASE64URL
  });
  let validSignature = false;
  try {
    validSignature = verify(
      null,
      Buffer.from(canonicalJson({
        schema: AGENT_CONTRIBUTION_HISTORY_RECEIPT_SCHEMA,
        statement,
        statement_digest: statementDigest
      })),
      reviewerPublicKey,
      Buffer.from(signature, 'base64url')
    );
  } catch {
    validSignature = false;
  }
  if (!validSignature) throw new ValidationError('agent contribution reviewer signature is invalid');
  const signed = Object.freeze({
    schema: AGENT_CONTRIBUTION_HISTORY_RECEIPT_SCHEMA,
    statement,
    statement_digest: statementDigest,
    reviewer_signature: signature
  });
  const receiptDigest = digest(value.receipt_digest, 'agent contribution receipt_digest');
  if (receiptDigest !== digestObject(signed)) {
    throw new ValidationError('agent contribution receipt digest mismatch');
  }
  return Object.freeze({ ...signed, receipt_digest: receiptDigest });
}

function assertProgression(previous, current) {
  if (current.statement.history_sequence !== previous.statement.history_sequence + 1) {
    throw new ValidationError('agent contribution history sequence must advance exactly one');
  }
  if (current.statement.predecessor_receipt_digest !== previous.receipt_digest) {
    throw new ValidationError('agent contribution predecessor receipt digest mismatch');
  }
  if (
    current.statement.contributor_principal_id !== previous.statement.contributor_principal_id
    || current.statement.reviewer_principal_id !== previous.statement.reviewer_principal_id
    || current.statement.repository_scope !== previous.statement.repository_scope
  ) {
    throw new ValidationError('agent contribution history chain changed contributor, reviewer or repository');
  }
  if (timestampValue(current.statement.reviewed_at) < timestampValue(previous.statement.reviewed_at)) {
    throw new ValidationError('agent contribution history review time moved backward');
  }
}

export function createAgentContributionHistoryReceipt({
  receiptId,
  historySequence,
  previousReceipt = null,
  previousReceiptEvidence = null,
  contributionId,
  contributorIdentityCredential,
  trustedContributorIssuerPublicKey,
  reviewerIdentityCredential,
  trustedReviewerIssuerPublicKey,
  reviewerOperationalPrivateKey,
  repositoryScope,
  capabilityContexts,
  contributionKind,
  disposition,
  subjectDigest,
  evidenceDigests,
  workReceiptDigests = [],
  supersedesReceiptDigests = [],
  reviewReasonCode,
  reviewedAt
} = {}) {
  const contributor = verifyMachineIdentityCredential(contributorIdentityCredential, {
    trustedIssuerPublicKey: trustedContributorIssuerPublicKey
  });
  const reviewer = verifyMachineIdentityCredential(reviewerIdentityCredential, {
    trustedIssuerPublicKey: trustedReviewerIssuerPublicKey
  });
  if (contributor.statement.principal_id === reviewer.statement.principal_id) {
    throw new ValidationError('agent contribution history does not permit self-review');
  }
  const privateKey = parsePrivateKey(
    reviewerOperationalPrivateKey,
    'agent contribution reviewer operational private key'
  );
  if (machineIdentityKeyId(createPublicKey(privateKey)) !== reviewer.statement.operational_key_id) {
    throw new ValidationError('agent contribution reviewer private key does not match reviewer credential');
  }
  const sequence = positiveInteger(historySequence, 'agent contribution historySequence', 1_000_000);

  let previous = null;
  if (previousReceipt !== null) {
    const priorEvidence = previousReceiptEvidence ?? {
      contributorIdentityCredential,
      trustedContributorIssuerPublicKey,
      reviewerIdentityCredential,
      trustedReviewerIssuerPublicKey
    };
    previous = verifySignedEnvelope(previousReceipt, priorEvidence);
  }
  if (sequence === 1 && previous !== null) {
    throw new ValidationError('agent contribution genesis receipt cannot provide previousReceipt');
  }
  if (sequence > 1 && previous === null) {
    throw new ValidationError('agent contribution non-genesis receipt requires previousReceipt');
  }

  const statement = normalizeStatement({
    receipt_id: receiptId,
    history_sequence: sequence,
    predecessor_receipt_digest: previous?.receipt_digest ?? null,
    contribution_id: contributionId,
    contributor_principal_id: contributor.statement.principal_id,
    contributor_credential_digest: contributor.credential_digest,
    reviewer_principal_id: reviewer.statement.principal_id,
    reviewer_credential_digest: reviewer.credential_digest,
    reviewer_operational_key_id: reviewer.statement.operational_key_id,
    repository_scope: repositoryScope,
    capability_contexts: [...new Set(capabilityContexts ?? [])].sort(),
    contribution_kind: contributionKind,
    disposition,
    subject_digest: subjectDigest,
    evidence_digests: [...new Set(evidenceDigests ?? [])].sort(),
    work_receipt_digests: [...new Set(workReceiptDigests ?? [])].sort(),
    supersedes_receipt_digests: [...new Set(supersedesReceiptDigests ?? [])].sort(),
    review_reason_code: reviewReasonCode,
    reviewed_at: reviewedAt,
    ...FIXED_SEMANTICS
  });
  const statementDigest = digestObject(statement);
  const signable = Object.freeze({
    schema: AGENT_CONTRIBUTION_HISTORY_RECEIPT_SCHEMA,
    statement,
    statement_digest: statementDigest
  });
  const reviewerSignature = sign(
    null,
    Buffer.from(canonicalJson(signable)),
    privateKey
  ).toString('base64url');
  const signed = Object.freeze({
    schema: AGENT_CONTRIBUTION_HISTORY_RECEIPT_SCHEMA,
    statement,
    statement_digest: statementDigest,
    reviewer_signature: reviewerSignature
  });
  const receipt = Object.freeze({ ...signed, receipt_digest: digestObject(signed) });
  if (previous) assertProgression(previous, receipt);
  return receipt;
}

export function verifyAgentContributionHistoryReceipt(raw, evidence = {}) {
  return verifySignedEnvelope(raw, evidence);
}

export function verifyAgentContributionHistoryChain(entries, {
  expectedLatestReceiptDigest
} = {}) {
  if (!Array.isArray(entries) || entries.length < 1 || entries.length > 10_000) {
    throw new ValidationError('agent contribution history chain must contain 1-10000 entries');
  }
  const verified = entries.map((entry, index) => {
    const source = assertPlainObject(entry, `agent contribution history chain entry[${index}]`);
    return verifySignedEnvelope(source.receipt, source.evidence);
  });
  if (verified[0].statement.history_sequence !== 1) {
    throw new ValidationError('agent contribution history chain must start at sequence one');
  }
  for (let index = 1; index < verified.length; index += 1) {
    assertProgression(verified[index - 1], verified[index]);
  }
  if (
    expectedLatestReceiptDigest !== undefined
    && verified.at(-1).receipt_digest !== digest(
      expectedLatestReceiptDigest,
      'agent contribution expectedLatestReceiptDigest'
    )
  ) {
    throw new ValidationError('agent contribution history does not end at the expected retained latest head');
  }

  const dispositionCounts = Object.fromEntries([...DISPOSITIONS].sort().map(item => [item, 0]));
  const kindCounts = Object.fromEntries([...CONTRIBUTION_KINDS].sort().map(item => [item, 0]));
  for (const receipt of verified) {
    dispositionCounts[receipt.statement.disposition] += 1;
    kindCounts[receipt.statement.contribution_kind] += 1;
  }
  return Object.freeze({
    valid: true,
    schema: 'axiom-agent-contribution-history-verification.v1',
    contributor_principal_id: verified[0].statement.contributor_principal_id,
    reviewer_principal_id: verified[0].statement.reviewer_principal_id,
    repository_scope: verified[0].statement.repository_scope,
    receipts_verified: verified.length,
    latest_receipt_digest: verified.at(-1).receipt_digest,
    disposition_counts: Object.freeze(dispositionCounts),
    contribution_kind_counts: Object.freeze(kindCounts),
    review_priority_evidence_available: true,
    scalar_reputation_score_produced: false,
    authority_granted: false,
    merge_rights_granted: false,
    execution_rights_granted: false,
    approval_exemption_granted: false,
    global_history_completeness_claimed: false,
    global_history_currentness_claimed: false,
    sybil_resistance_claimed: false,
    collusion_resistance_claimed: false,
    identity_reset_resistance_claimed: false,
    model_brand_signal_used: false,
    popularity_signal_used: false,
    authority_effect: 'none',
    delegation_effect: 'none'
  });
}
