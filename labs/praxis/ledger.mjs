// labs/praxis/ledger.mjs
//
// Praxis P0.5: synthetic, hash-linked, Ed25519-signed decision and effect
// provenance for chartered authority.
//
// This module is P0 / synthetic-only / production-unreachable. It adds an
// in-memory audit ledger and evidence-only decision receipts WITHOUT making
// the audit record an authority source:
//
// - Decision receipts (`praxis-decision-receipt.v0`) are plain, unbranded
//   records. They carry no Praxis host-authority symbol, so they can never
//   satisfy `authorize`, mint a Permit/Quorum, or serve as granting premises.
// - Ledger entries (`praxis-ledger-entry.v0`) are canonical, hash-linked
//   (sequence + previous-entry digest), Ed25519-signed by an explicitly
//   injected synthetic audit key, and restricted to a closed set of kinds.
// - `decideCharteredAuthority` is a non-throwing wrapper around chartered
//   issuance: it returns signed allow/deny evidence and fails closed (throws)
//   when the ledger or its signing key is unavailable. Denials never become
//   authority.
// - `recordPreparedEffect` / `recordTerminalEffect` bind preparation and
//   terminal effect evidence to exact operation/preparation digests, enforce
//   commit/finalize finality agreement, and refuse second terminal
//   transitions (uncertainty cannot be rewritten as completion; cancellation
//   cannot coexist with another terminal transition).
//
// No execution authority, no network calls, no ambient key material: every
// key is an explicitly injected KeyObject, and every digest follows the
// `sha256:<hex>` canonical-JSON conventions of `./index.mjs`.

import {
  createPublicKey,
  randomBytes,
  sign as cryptoSign,
  verify as cryptoVerify
} from 'node:crypto';

import {
  PraxisRuntimeError,
  canonicalizePraxis,
  createCharteredHostPermit,
  createCharteredHostQuorum,
  digestPraxis,
  verifySyntheticCharter
} from './index.mjs';

export const PRAXIS_AUDIT_LEDGER_SCHEMA = 'praxis-audit-ledger.v0';
export const PRAXIS_LEDGER_ENTRY_SCHEMA = 'praxis-ledger-entry.v0';
export const PRAXIS_DECISION_RECEIPT_SCHEMA = 'praxis-decision-receipt.v0';

// Closed entry kinds. `genesis` anchors every chain; all other entries are
// append-only. Corrections and revocations are new entries, never rewrites.
export const LEDGER_ENTRY_KINDS = Object.freeze([
  'genesis',
  'authority_decision',
  'authority_issued',
  'prepared',
  'terminal_completed',
  'terminal_uncertain',
  'terminal_cancelled'
]);

// Closed, stable denial codes for `praxis-decision-receipt.v0`.
export const DECISION_DENIAL_CODES = Object.freeze([
  'POLICY_UNPINNED',
  'SUBJECT_INVALID',
  'EVIDENCE_UNVERIFIED',
  'PREMISE_FAILED',
  'ADVISOR_VETO',
  'QUORUM_INSUFFICIENT',
  'EFFECT_ENVELOPE_DENIED',
  'PROGRAM_UNPINNED',
  'REQUEST_MALFORMED',
  'AUTHORITY_EXPIRED',
  'AUTHORITY_REVOKED',
  'OPERATION_MISMATCH',
  'ISSUANCE_UNAVAILABLE',
  'INTERNAL_ERROR'
]);

const DENIAL_CODE_BY_ERROR_CODE = Object.freeze({
  PRAXIS_POLICY_UNPINNED: 'POLICY_UNPINNED',
  PRAXIS_POLICY_SUBJECT_INVALID: 'SUBJECT_INVALID',
  PRAXIS_POLICY_SUBJECT_REQUIRED: 'SUBJECT_INVALID',
  PRAXIS_EVIDENCE_REQUIRED: 'EVIDENCE_UNVERIFIED',
  PRAXIS_EVIDENCE_AMBIGUOUS: 'EVIDENCE_UNVERIFIED',
  PRAXIS_EVIDENCE_STALE: 'EVIDENCE_UNVERIFIED',
  PRAXIS_UNVERIFIED: 'EVIDENCE_UNVERIFIED',
  PRAXIS_CHARTER_SIGNATURE: 'EVIDENCE_UNVERIFIED',
  PRAXIS_VERIFIER_REQUIRED: 'EVIDENCE_UNVERIFIED',
  PRAXIS_VERIFIER_UNPINNED: 'EVIDENCE_UNVERIFIED',
  PRAXIS_VERIFIER_ORIGIN: 'EVIDENCE_UNVERIFIED',
  PRAXIS_VERIFY_REQUIRES_EVIDENCE: 'EVIDENCE_UNVERIFIED',
  PRAXIS_POLICY_REQUIRE: 'PREMISE_FAILED',
  PRAXIS_POLICY_PREMISE: 'PREMISE_FAILED',
  PRAXIS_POLICY_ERROR: 'PREMISE_FAILED',
  PRAXIS_ASSESSMENT_DENIED: 'PREMISE_FAILED',
  PRAXIS_POLICY_VETO: 'ADVISOR_VETO',
  PRAXIS_ADVISOR_REQUIRED: 'ADVISOR_VETO',
  PRAXIS_QUORUM: 'QUORUM_INSUFFICIENT',
  PRAXIS_INVALID_QUORUM: 'QUORUM_INSUFFICIENT',
  PRAXIS_HOST_QUORUM_MISMATCH: 'QUORUM_INSUFFICIENT',
  PRAXIS_HOST_QUORUM_INSUFFICIENT: 'QUORUM_INSUFFICIENT',
  PRAXIS_EFFECT_ENVELOPE: 'EFFECT_ENVELOPE_DENIED',
  PRAXIS_EFFECT_ENVELOPE_REQUIRED: 'EFFECT_ENVELOPE_DENIED',
  PRAXIS_EFFECT_AUTHORITY_REQUIRED: 'EFFECT_ENVELOPE_DENIED',
  PRAXIS_PROGRAM_UNPINNED: 'PROGRAM_UNPINNED',
  PRAXIS_CHARTER_REQUIRED: 'REQUEST_MALFORMED',
  PRAXIS_HOST_AUTHORITY_EXPIRED: 'AUTHORITY_EXPIRED',
  PRAXIS_HOST_AUTHORITY_REVOKED: 'AUTHORITY_REVOKED',
  PRAXIS_HOST_AUTHORITY_MISMATCH: 'OPERATION_MISMATCH',
  PRAXIS_HOST_AUTHORITY_PLAN_MISMATCH: 'OPERATION_MISMATCH'
});

const DENIAL_REASON_CLASS_BY_CODE = Object.freeze({
  POLICY_UNPINNED: 'policy_not_charter_pinned',
  SUBJECT_INVALID: 'operation_subject_invalid',
  EVIDENCE_UNVERIFIED: 'evidence_unverified',
  PREMISE_FAILED: 'granting_premise_failed',
  ADVISOR_VETO: 'pinned_advisor_veto',
  QUORUM_INSUFFICIENT: 'quorum_requirements_unsatisfied',
  EFFECT_ENVELOPE_DENIED: 'effect_envelope_denied',
  PROGRAM_UNPINNED: 'program_not_charter_pinned',
  REQUEST_MALFORMED: 'request_malformed',
  AUTHORITY_EXPIRED: 'authority_expired',
  AUTHORITY_REVOKED: 'authority_revoked',
  OPERATION_MISMATCH: 'operation_digest_mismatch',
  ISSUANCE_UNAVAILABLE: 'issuance_unavailable',
  INTERNAL_ERROR: 'internal_error'
});

const DIGEST_PATTERN = /^sha256:[a-f0-9]{64}$/;
const LEDGER_BRAND = Symbol('praxis.synthetic-audit-ledger');
const ledgerStates = new WeakMap();

function ledgerError(code, message, details = undefined) {
  return new PraxisRuntimeError(code, message, details);
}

function normalizeTimeMs(value, label) {
  const ms = typeof value === 'number' ? value : Date.parse(String(value));
  if (!Number.isFinite(ms)) {
    throw new TypeError(`${label} must be a finite timestamp or parseable date`);
  }
  return ms;
}

function normalizeDigest(value, label) {
  if (typeof value !== 'string' || !DIGEST_PATTERN.test(value)) {
    throw new TypeError(`${label} must be a sha256:<hex> digest`);
  }
  return value;
}

function normalizeOptionalDigest(value, label) {
  if (value === null || value === undefined) return null;
  return normalizeDigest(value, label);
}

function normalizeNonEmptyString(value, label) {
  if (typeof value !== 'string' || value.length === 0) {
    throw new TypeError(`${label} must be a non-empty string`);
  }
  return value;
}

function deepFreezeLedgerValue(value) {
  if (value === null || typeof value !== 'object' || Object.isFrozen(value)) {
    return value;
  }
  for (const item of Object.values(value)) deepFreezeLedgerValue(item);
  return Object.freeze(value);
}

function snapshotLedgerBody(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new TypeError('ledger body must be a plain record');
  }
  return deepFreezeLedgerValue(canonicalizePraxis(body));
}

function spkiDerBase64(key) {
  const publicKey = key?.type === 'public' ? key : createPublicKey(key);
  return publicKey.export({ type: 'spki', format: 'der' }).toString('base64');
}

function publicKeyFromDerBase64(value) {
  return createPublicKey({
    key: Buffer.from(value, 'base64'),
    format: 'der',
    type: 'spki'
  });
}

function requireEd25519PrivateKey(privateKey, label) {
  if (
    !privateKey
    || typeof privateKey !== 'object'
    || privateKey.type !== 'private'
    || privateKey.asymmetricKeyType !== 'ed25519'
  ) {
    throw new TypeError(`${label} requires an explicit Ed25519 private KeyObject`);
  }
  return privateKey;
}

function signDigest(digest, privateKey) {
  return cryptoSign(null, Buffer.from(digest, 'utf8'), privateKey).toString('base64');
}

function verifyDigestSignature(digest, signature, publicKey) {
  try {
    return cryptoVerify(
      null,
      Buffer.from(digest, 'utf8'),
      publicKey,
      Buffer.from(signature, 'base64')
    );
  } catch {
    return false;
  }
}

function requireLedgerState(ledger) {
  const state = ledger && typeof ledger === 'object' ? ledgerStates.get(ledger) : undefined;
  if (!state || ledger[LEDGER_BRAND] !== true) {
    throw ledgerError(
      'PRAXIS_LEDGER_REQUIRED',
      'a synthetic audit ledger handle is required; refusing to decide without provenance'
    );
  }
  return state;
}

function appendLedgerEntry(state, kind, body, issuedAtMs) {
  if (!LEDGER_ENTRY_KINDS.includes(kind)) {
    throw ledgerError('PRAXIS_LEDGER_KIND', `unknown ledger entry kind ${kind}`);
  }
  const sequence = state.entries.length;
  if (sequence === 0 && kind !== 'genesis') {
    throw ledgerError('PRAXIS_LEDGER_GENESIS', 'the first ledger entry must be genesis');
  }
  if (sequence !== 0 && kind === 'genesis') {
    throw ledgerError('PRAXIS_LEDGER_GENESIS', 'genesis is only valid as the first ledger entry');
  }
  const previous = sequence === 0 ? null : state.entries[sequence - 1].entry_digest;
  const unsigned = {
    schema: PRAXIS_LEDGER_ENTRY_SCHEMA,
    sequence,
    previous_entry_digest: previous,
    kind,
    issued_at_ms: normalizeTimeMs(issuedAtMs, 'ledger entry time'),
    body: snapshotLedgerBody(body)
  };
  const entryDigest = `sha256:${digestPraxis(unsigned)}`;
  // Fail-closed signing: any signing failure propagates before the entry is
  // stored, so an unsigned entry can never enter the chain.
  const entry = Object.freeze({
    ...unsigned,
    entry_digest: entryDigest,
    signature: signDigest(entryDigest, state.privateKey)
  });
  state.entries.push(entry);
  return entry;
}

// ---------------------------------------------------------------------------
// Ledger construction and inspection
// ---------------------------------------------------------------------------

export function createSyntheticAuditLedger({
  privateKey,
  auditId,
  genesisNote = null,
  now = Date.now()
} = {}) {
  requireEd25519PrivateKey(privateKey, 'synthetic audit ledger');
  normalizeNonEmptyString(auditId, 'audit id');
  const createdAtMs = normalizeTimeMs(now, 'ledger creation time');
  const signerPublicKey = spkiDerBase64(privateKey);
  const handle = {
    [LEDGER_BRAND]: true,
    schema: PRAXIS_AUDIT_LEDGER_SCHEMA,
    audit_id: auditId,
    audit_public_key: signerPublicKey,
    created_at_ms: createdAtMs
  };
  const state = {
    handle,
    privateKey,
    entries: [],
    prepared: new Map(),
    terminals: new Map()
  };
  ledgerStates.set(handle, state);
  appendLedgerEntry(state, 'genesis', {
    audit_id: auditId,
    signer_public_key: signerPublicKey,
    genesis_note: genesisNote === null || genesisNote === undefined ? null : String(genesisNote),
    created_at_ms: createdAtMs
  }, createdAtMs);
  return Object.freeze(handle);
}

export function ledgerEntries(ledger) {
  const state = requireLedgerState(ledger);
  return Object.freeze([...state.entries]);
}

// ---------------------------------------------------------------------------
// Ledger verification
// ---------------------------------------------------------------------------

const ENTRY_TOP_LEVEL_KEYS = new Set([
  'schema',
  'sequence',
  'previous_entry_digest',
  'kind',
  'issued_at_ms',
  'body',
  'entry_digest',
  'signature'
]);

export function verifyLedgerEntry(entry, {
  publicKey,
  expectedSequence = null,
  expectedPreviousDigest = undefined
} = {}) {
  if (!publicKey) {
    throw new TypeError('ledger entry verification requires an explicit public key');
  }
  const verifier = typeof publicKey === 'string' ? publicKeyFromDerBase64(publicKey) : publicKey;
  const fail = (message, details) => {
    throw ledgerError('PRAXIS_LEDGER_ENTRY_INVALID', message, details);
  };
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
    fail('ledger entry must be a record');
  }
  for (const key of Object.keys(entry)) {
    if (!ENTRY_TOP_LEVEL_KEYS.has(key)) fail(`ledger entry has unknown field ${key}`);
  }
  if (Object.getOwnPropertySymbols(entry).length !== 0) {
    fail('ledger entry must not carry symbol-keyed state');
  }
  if (entry.schema !== PRAXIS_LEDGER_ENTRY_SCHEMA) fail('ledger entry schema mismatch');
  if (!LEDGER_ENTRY_KINDS.includes(entry.kind)) fail(`ledger entry kind ${entry.kind} is not closed`);
  if (!Number.isSafeInteger(entry.sequence) || entry.sequence < 0) {
    fail('ledger entry sequence must be a non-negative integer');
  }
  if (entry.kind === 'genesis' && entry.sequence !== 0) fail('genesis must be sequence 0');
  if (entry.kind !== 'genesis' && entry.sequence === 0) fail('only genesis may use sequence 0');
  if (!Number.isFinite(entry.issued_at_ms)) fail('ledger entry time must be finite');
  if (
    entry.previous_entry_digest !== null
    && !DIGEST_PATTERN.test(entry.previous_entry_digest)
  ) {
    fail('ledger entry previous digest is malformed');
  }
  if (entry.kind === 'genesis' && entry.previous_entry_digest !== null) {
    fail('genesis must not reference a previous entry');
  }
  if (entry.kind !== 'genesis' && entry.previous_entry_digest === null) {
    fail('non-genesis entry must reference a previous entry digest');
  }
  if (!entry.body || typeof entry.body !== 'object' || Array.isArray(entry.body)) {
    fail('ledger entry body must be a record');
  }
  if (typeof entry.signature !== 'string' || entry.signature.length === 0) {
    fail('ledger entry signature is missing');
  }
  if (expectedSequence !== null && entry.sequence !== expectedSequence) {
    fail(`ledger entry sequence ${entry.sequence} does not match expected ${expectedSequence}`);
  }
  if (
    expectedPreviousDigest !== undefined
    && entry.previous_entry_digest !== expectedPreviousDigest
  ) {
    fail('ledger entry previous digest does not match the chain head');
  }
  const unsigned = {
    schema: entry.schema,
    sequence: entry.sequence,
    previous_entry_digest: entry.previous_entry_digest,
    kind: entry.kind,
    issued_at_ms: entry.issued_at_ms,
    body: entry.body
  };
  const expectedDigest = `sha256:${digestPraxis(unsigned)}`;
  if (entry.entry_digest !== expectedDigest) {
    fail('ledger entry digest does not match its canonical content', {
      sequence: entry.sequence,
      kind: entry.kind
    });
  }
  if (!verifyDigestSignature(expectedDigest, entry.signature, verifier)) {
    fail('ledger entry signature is not valid for the trusted audit key', {
      sequence: entry.sequence,
      kind: entry.kind
    });
  }
  return Object.freeze({ entry_digest: expectedDigest, sequence: entry.sequence, kind: entry.kind });
}

export function verifyLedgerChain(entries, { publicKey } = {}) {
  if (!publicKey) {
    throw new TypeError('ledger chain verification requires an explicit public key');
  }
  if (!Array.isArray(entries) || entries.length === 0) {
    throw ledgerError('PRAXIS_LEDGER_CHAIN_INVALID', 'ledger chain must be a non-empty array');
  }
  if (entries[0]?.kind !== 'genesis') {
    throw ledgerError('PRAXIS_LEDGER_CHAIN_INVALID', 'ledger chain must start with an explicit genesis entry');
  }
  let previousDigest = null;
  for (let index = 0; index < entries.length; index += 1) {
    verifyLedgerEntry(entries[index], {
      publicKey,
      expectedSequence: index,
      expectedPreviousDigest: previousDigest
    });
    previousDigest = entries[index].entry_digest;
  }
  return Object.freeze({ entries: entries.length, head_digest: previousDigest });
}

export function verifyLedger(ledger, { publicKey = null } = {}) {
  const state = requireLedgerState(ledger);
  const trusted = publicKey === null || publicKey === undefined
    ? state.handle.audit_public_key
    : (typeof publicKey === 'string' ? publicKey : spkiDerBase64(publicKey));
  return verifyLedgerChain(state.entries, { publicKey: trusted });
}

// ---------------------------------------------------------------------------
// Evidence-only decision receipts (`praxis-decision-receipt.v0`)
// ---------------------------------------------------------------------------
//
// A decision receipt is EVIDENCE ONLY. It is a plain, unbranded record: it
// carries no host-authority symbol, so it can never satisfy `authorize`,
// mint a Permit/Quorum, or serve as a granting premise. `verifyDecisionReceipt`
// additionally rejects any receipt carrying symbol-keyed state.

const RECEIPT_TOP_LEVEL_KEYS = new Set([
  'schema',
  'receipt_id',
  'decision',
  'denial_code',
  'denial_reason_class',
  'issued_at_ms',
  'charter_digest',
  'policy_name',
  'policy_digest',
  'operation_digest',
  'evidence_digests',
  'premise_digests',
  'requester',
  'approval_request_digest',
  'approval_principals',
  'advisor_identity',
  'veto_identity',
  'authority_id',
  'receipt_digest',
  'signature',
  'signer_public_key'
]);

function normalizeDigestArray(value, label) {
  if (!Array.isArray(value)) throw new TypeError(`${label} must be an array`);
  const output = value.map(item => normalizeDigest(item, `${label} entry`));
  if (new Set(output).size !== output.length) {
    throw new TypeError(`${label} must not contain duplicates`);
  }
  return Object.freeze(output);
}

export function createDecisionReceiptBody({
  receiptId = `receipt:${randomBytes(16).toString('hex')}`,
  decision,
  denialCode = null,
  denialReasonClass = null,
  issuedAtMs = Date.now(),
  charterDigest = null,
  policyName,
  policyDigest = null,
  operationDigest = null,
  evidenceDigests = [],
  premiseDigests = [],
  requester,
  approvalRequestDigest = null,
  approvalPrincipals = null,
  advisorIdentity = null,
  vetoIdentity = null,
  authorityId = null
} = {}) {
  if (decision !== 'allow' && decision !== 'deny') {
    throw new TypeError('decision receipt decision must be allow or deny');
  }
  normalizeNonEmptyString(policyName, 'policy name');
  normalizeNonEmptyString(requester, 'requester');
  if (decision === 'deny') {
    if (!DECISION_DENIAL_CODES.includes(denialCode)) {
      throw new TypeError('deny receipt requires a closed stable denial code');
    }
    normalizeNonEmptyString(denialReasonClass, 'denial reason class');
    if (authorityId !== null) {
      throw new TypeError('a deny receipt must never bind an authority id');
    }
  } else {
    if (denialCode !== null || denialReasonClass !== null) {
      throw new TypeError('an allow receipt must not carry denial fields');
    }
  }
  if (approvalPrincipals !== null && approvalPrincipals !== undefined) {
    if (!Array.isArray(approvalPrincipals)) {
      throw new TypeError('approval principals must be an array or null');
    }
  }
  return snapshotLedgerBody({
    schema: PRAXIS_DECISION_RECEIPT_SCHEMA,
    receipt_id: normalizeNonEmptyString(receiptId, 'receipt id'),
    decision,
    denial_code: denialCode,
    denial_reason_class: denialReasonClass,
    issued_at_ms: normalizeTimeMs(issuedAtMs, 'decision time'),
    charter_digest: normalizeOptionalDigest(charterDigest, 'charter digest'),
    policy_name: policyName,
    policy_digest: normalizeOptionalDigest(policyDigest, 'policy digest'),
    operation_digest: normalizeOptionalDigest(operationDigest, 'operation digest'),
    evidence_digests: normalizeDigestArray(evidenceDigests, 'evidence digests'),
    premise_digests: normalizeDigestArray(premiseDigests, 'premise digests'),
    requester,
    approval_request_digest: normalizeOptionalDigest(approvalRequestDigest, 'approval request digest'),
    approval_principals: approvalPrincipals == null
      ? null
      : Object.freeze([...approvalPrincipals].map(item => normalizeNonEmptyString(item, 'approval principal'))),
    advisor_identity: advisorIdentity === null || advisorIdentity === undefined
      ? null
      : normalizeNonEmptyString(advisorIdentity, 'advisor identity'),
    veto_identity: vetoIdentity === null || vetoIdentity === undefined
      ? null
      : normalizeNonEmptyString(vetoIdentity, 'veto identity'),
    authority_id: authorityId === null || authorityId === undefined
      ? null
      : normalizeNonEmptyString(authorityId, 'authority id')
  });
}

export function signDecisionReceipt({ privateKey, body } = {}) {
  requireEd25519PrivateKey(privateKey, 'decision receipt signing');
  const unsigned = snapshotLedgerBody({ ...body });
  if (unsigned.schema !== PRAXIS_DECISION_RECEIPT_SCHEMA) {
    throw new TypeError('decision receipt signing requires a praxis-decision-receipt.v0 body');
  }
  const receiptDigest = `sha256:${digestPraxis(unsigned)}`;
  // Fail-closed signing: the receipt is only returned once both digest and
  // signature are computed; a signing failure throws instead of producing
  // an unsigned receipt.
  return Object.freeze({
    ...unsigned,
    receipt_digest: receiptDigest,
    signature: signDigest(receiptDigest, privateKey),
    signer_public_key: spkiDerBase64(privateKey)
  });
}

export function verifyDecisionReceipt(receipt, { publicKey } = {}) {
  if (!publicKey) {
    throw new TypeError('decision receipt verification requires an explicit public key');
  }
  const verifier = typeof publicKey === 'string' ? publicKeyFromDerBase64(publicKey) : publicKey;
  const fail = (message, details) => {
    throw ledgerError('PRAXIS_LEDGER_RECEIPT_INVALID', message, details);
  };
  if (!receipt || typeof receipt !== 'object' || Array.isArray(receipt)) {
    fail('decision receipt must be a record');
  }
  if (Object.getOwnPropertySymbols(receipt).length !== 0) {
    fail('decision receipt must not carry symbol-keyed state; receipts are evidence only');
  }
  for (const key of Object.keys(receipt)) {
    if (!RECEIPT_TOP_LEVEL_KEYS.has(key)) fail(`decision receipt has unknown field ${key}`);
  }
  if (receipt.schema !== PRAXIS_DECISION_RECEIPT_SCHEMA) fail('decision receipt schema mismatch');
  if (receipt.decision !== 'allow' && receipt.decision !== 'deny') {
    fail('decision receipt decision must be allow or deny');
  }
  if (receipt.decision === 'deny') {
    if (!DECISION_DENIAL_CODES.includes(receipt.denial_code)) {
      fail('deny receipt requires a closed stable denial code');
    }
    if (typeof receipt.denial_reason_class !== 'string' || receipt.denial_reason_class.length === 0) {
      fail('deny receipt requires a denial reason class');
    }
    if (receipt.authority_id !== null) {
      fail('a deny receipt must never bind an authority id');
    }
  } else if (receipt.denial_code !== null || receipt.denial_reason_class !== null) {
    fail('an allow receipt must not carry denial fields');
  }
  if (!Number.isFinite(receipt.issued_at_ms)) fail('decision receipt time must be finite');
  for (const field of [
    'charter_digest',
    'policy_digest',
    'operation_digest',
    'approval_request_digest'
  ]) {
    if (receipt[field] !== null && !DIGEST_PATTERN.test(receipt[field])) {
      fail(`decision receipt field ${field} is malformed`);
    }
  }
  for (const field of ['evidence_digests', 'premise_digests']) {
    if (
      !Array.isArray(receipt[field])
      || receipt[field].some(digest => !DIGEST_PATTERN.test(digest))
    ) {
      fail(`decision receipt field ${field} is malformed`);
    }
  }
  if (typeof receipt.signature !== 'string' || receipt.signature.length === 0) {
    fail('decision receipt signature is missing');
  }
  const {
    receipt_digest: ignoredDigest,
    signature: ignoredSignature,
    signer_public_key: ignoredSigner,
    ...unsigned
  } = receipt;
  const expectedDigest = `sha256:${digestPraxis(unsigned)}`;
  if (receipt.receipt_digest !== expectedDigest) {
    fail('decision receipt digest does not match its canonical content');
  }
  if (!verifyDigestSignature(expectedDigest, receipt.signature, verifier)) {
    fail('decision receipt signature is not valid for the trusted audit key');
  }
  return Object.freeze({ receipt_digest: expectedDigest, decision: receipt.decision });
}

// Binds a verified receipt to one exact operation digest: a receipt recorded
// for release A cannot be replayed as evidence for release B.
export function verifyDecisionReceiptForOperation(receipt, { operationDigest, publicKey } = {}) {
  const verified = verifyDecisionReceipt(receipt, { publicKey });
  normalizeDigest(operationDigest, 'operation digest');
  if (receipt.operation_digest !== operationDigest) {
    throw ledgerError(
      'PRAXIS_LEDGER_RECEIPT_MISMATCH',
      'decision receipt is not bound to this operation digest',
      { receipt_digest: verified.receipt_digest }
    );
  }
  return verified;
}

// ---------------------------------------------------------------------------
// Non-throwing chartered decision wrapper
// ---------------------------------------------------------------------------

function mapIssuanceDenial(error) {
  const code = typeof error?.code === 'string' && Object.hasOwn(DENIAL_CODE_BY_ERROR_CODE, error.code)
    ? DENIAL_CODE_BY_ERROR_CODE[error.code]
    : (error instanceof TypeError ? 'REQUEST_MALFORMED' : 'INTERNAL_ERROR');
  return Object.freeze({
    code,
    reason_class: DENIAL_REASON_CLASS_BY_CODE[code],
    message: String(error?.message ?? error)
  });
}

function bestEffortCharterDigest(charter, trustedRootKeys) {
  try {
    return verifySyntheticCharter(charter, trustedRootKeys).digest;
  } catch {
    return null;
  }
}

function bestEffortOperationDigest(operation, operationDigest) {
  if (operation && typeof operation === 'object' && typeof operation.operation_digest === 'string') {
    try {
      return normalizeDigest(operation.operation_digest, 'operation digest');
    } catch {
      return null;
    }
  }
  if (typeof operationDigest === 'string') {
    try {
      return normalizeDigest(operationDigest, 'operation digest');
    } catch {
      return null;
    }
  }
  return null;
}

// Non-throwing wrapper around chartered issuance. On success it returns the
// issued authority token together with a signed allow receipt; on denial it
// returns a signed deny receipt and NO authority token. The wrapper itself
// throws (fails closed) when the ledger handle or its signing key is
// unavailable, so a decision is never produced without provenance.
export async function decideCharteredAuthority({
  ledger,
  authorityKind = 'Permit',
  receiptId = null,
  id,
  charter,
  trustedRootKeys = [],
  policyName,
  operation = null,
  operationDigest = null,
  evidence = [],
  requester,
  request = null,
  approvals = [],
  advisors = {},
  now = Date.now()
} = {}) {
  const state = requireLedgerState(ledger);
  if (authorityKind !== 'Permit' && authorityKind !== 'Quorum') {
    throw new TypeError('chartered decision authority kind must be Permit or Quorum');
  }
  const nowMs = normalizeTimeMs(now, 'decision time');

  let authority = null;
  let failure = null;
  try {
    const issuer = authorityKind === 'Quorum' ? createCharteredHostQuorum : createCharteredHostPermit;
    authority = await issuer({
      id,
      charter,
      trustedRootKeys,
      policyName,
      operation,
      operationDigest,
      evidence,
      requester,
      request,
      approvals,
      advisors,
      now: nowMs
    });
  } catch (error) {
    failure = error;
  }

  const decision = failure ? 'deny' : 'allow';
  const denial = failure ? mapIssuanceDenial(failure) : null;

  const receiptBody = createDecisionReceiptBody({
    ...(receiptId === null ? {} : { receiptId }),
    decision,
    denialCode: denial?.code ?? null,
    denialReasonClass: denial?.reason_class ?? null,
    issuedAtMs: nowMs,
    charterDigest: authority
      ? authority.charter_digest
      : bestEffortCharterDigest(charter, trustedRootKeys),
    policyName,
    policyDigest: authority ? authority.policy_digest : null,
    operationDigest: authority
      ? authority.operation_digest
      : bestEffortOperationDigest(operation, operationDigest),
    evidenceDigests: authority ? authority.evidence.map(item => item.evidence_digest) : [],
    premiseDigests: authority ? authority.premises.map(item => item.predicate_digest) : [],
    requester,
    approvalRequestDigest: authority
      ? authority.request_digest
      : (request && typeof request.digest === 'string' ? request.digest : null),
    approvalPrincipals: authority ? [...authority.approved_by] : null,
    advisorIdentity: authority?.advice?.advisor ?? null,
    vetoIdentity: null,
    authorityId: authority ? authority.id : null
  });

  const receipt = signDecisionReceipt({ privateKey: state.privateKey, body: receiptBody });

  const decisionEntry = appendLedgerEntry(state, 'authority_decision', {
    receipt_digest: receipt.receipt_digest,
    receipt_id: receipt.receipt_id,
    decision,
    denial_code: receipt.denial_code,
    policy_name: policyName,
    operation_digest: receipt.operation_digest,
    requester
  }, nowMs);

  let issuedEntry = null;
  if (authority) {
    issuedEntry = appendLedgerEntry(state, 'authority_issued', {
      receipt_digest: receipt.receipt_digest,
      authority_id: authority.id,
      policy_name: policyName,
      policy_digest: authority.policy_digest,
      operation_digest: authority.operation_digest,
      requester
    }, nowMs);
  }

  return Object.freeze({
    decision,
    receipt,
    authority,
    denial,
    ledger_entry_digests: Object.freeze(
      issuedEntry
        ? [decisionEntry.entry_digest, issuedEntry.entry_digest]
        : [decisionEntry.entry_digest]
    )
  });
}

// ---------------------------------------------------------------------------
// Preparation and terminal effect linkage
// ---------------------------------------------------------------------------

function resolveOperationDigest(operation, operationDigest) {
  if (operation !== null && operation !== undefined) {
    if (typeof operation !== 'object' || typeof operation.operation_digest !== 'string') {
      throw new TypeError('prepared effect operation must carry an operation digest');
    }
    const computed = normalizeDigest(operation.operation_digest, 'operation digest');
    if (operationDigest !== null && operationDigest !== undefined) {
      const supplied = normalizeDigest(operationDigest, 'operation digest');
      if (supplied !== computed) {
        throw ledgerError(
          'PRAXIS_LEDGER_DIGEST_MISMATCH',
          'supplied operation digest does not match the operation descriptor digest'
        );
      }
    }
    return computed;
  }
  return normalizeDigest(operationDigest, 'operation digest');
}

function preparedKeyFor(operationDigest, preparationDigest) {
  return `${operationDigest}|${preparationDigest}`;
}

// Records durable preparation evidence. The entry binds the exact operation
// digest, preparation digest, issuing authority id, and (for measured
// operations) the expected terminal finality. Recording the same prepared
// effect twice is refused: corrections are append-only terminal entries.
export function recordPreparedEffect({
  ledger,
  operation = null,
  operationDigest = null,
  preparationDigest,
  authorityId,
  policyDigest = null,
  finality = null,
  irreversible = null,
  now = Date.now()
} = {}) {
  const state = requireLedgerState(ledger);
  const opDigest = resolveOperationDigest(operation, operationDigest);
  const prepDigest = normalizeDigest(preparationDigest, 'preparation digest');
  normalizeNonEmptyString(authorityId, 'authority id');
  const policy = normalizeOptionalDigest(policyDigest, 'policy digest');
  if (finality !== null && finality !== 'commit' && finality !== 'finalize') {
    throw new TypeError('prepared effect finality must be commit, finalize, or null');
  }
  if (irreversible !== null && typeof irreversible !== 'boolean') {
    throw new TypeError('prepared effect irreversibility must be a boolean or null');
  }
  if (irreversible === true && finality !== null && finality !== 'finalize') {
    throw ledgerError(
      'PRAXIS_LEDGER_FINALITY_MISMATCH',
      'an irreversible prepared effect requires finalize finality'
    );
  }
  if (irreversible === false && finality !== null && finality !== 'commit') {
    throw ledgerError(
      'PRAXIS_LEDGER_FINALITY_MISMATCH',
      'a reversible prepared effect requires commit finality'
    );
  }
  const preparedKey = preparedKeyFor(opDigest, prepDigest);
  if (state.prepared.has(preparedKey)) {
    throw ledgerError(
      'PRAXIS_LEDGER_DUPLICATE_PREPARATION',
      'this prepared effect is already recorded; corrections are append-only terminal entries'
    );
  }
  const entry = appendLedgerEntry(state, 'prepared', {
    operation_digest: opDigest,
    preparation_digest: prepDigest,
    authority_id: authorityId,
    policy_digest: policy,
    finality,
    irreversible
  }, normalizeTimeMs(now, 'preparation time'));
  state.prepared.set(preparedKey, entry.entry_digest);
  return Object.freeze({ entry, prepared_key: preparedKey });
}

// Records a terminal transition for a prepared effect recorded in the SAME
// ledger. The terminal entry must agree with the prepared entry on operation
// and preparation digests and on finality: a commit/finalize mismatch is
// refused. At most one terminal transition is allowed per prepared effect,
// so an uncertain state cannot later be rewritten as completed and a
// cancellation cannot coexist with another terminal transition. The ledger
// records provenance; it never decides external success independently.
export function recordTerminalEffect({
  ledger,
  preparedEntryDigest,
  operationDigest = null,
  preparationDigest = null,
  finality,
  outcome = 'completed',
  executorReceiptDigest = null,
  completionEvidenceDigest = null,
  uncertainty = null,
  cancellationRef = null,
  now = Date.now()
} = {}) {
  const state = requireLedgerState(ledger);
  const kind = outcome === 'completed'
    ? 'terminal_completed'
    : outcome === 'uncertain'
      ? 'terminal_uncertain'
      : outcome === 'cancelled'
        ? 'terminal_cancelled'
        : null;
  if (kind === null) {
    throw new TypeError('terminal outcome must be completed, uncertain, or cancelled');
  }
  if (finality !== 'commit' && finality !== 'finalize') {
    throw new TypeError('terminal finality must be commit or finalize');
  }
  normalizeDigest(preparedEntryDigest, 'prepared entry digest');
  const preparedEntry = state.entries.find(entry => entry.entry_digest === preparedEntryDigest);
  if (!preparedEntry || preparedEntry.kind !== 'prepared') {
    throw ledgerError(
      'PRAXIS_LEDGER_UNKNOWN_PREPARATION',
      'terminal entries must reference a prepared entry recorded in this ledger'
    );
  }
  const preparedBody = preparedEntry.body;
  if (operationDigest !== null && operationDigest !== preparedBody.operation_digest) {
    throw ledgerError(
      'PRAXIS_LEDGER_DIGEST_MISMATCH',
      'terminal entry claims a different operation digest than its prepared entry'
    );
  }
  if (preparationDigest !== null && preparationDigest !== preparedBody.preparation_digest) {
    throw ledgerError(
      'PRAXIS_LEDGER_DIGEST_MISMATCH',
      'terminal entry claims a different preparation digest than its prepared entry'
    );
  }
  const preparedKey = preparedKeyFor(preparedBody.operation_digest, preparedBody.preparation_digest);
  if (state.terminals.has(preparedKey)) {
    throw ledgerError(
      'PRAXIS_LEDGER_TERMINAL_EXISTS',
      'this prepared effect already has a terminal transition; ' +
      'uncertainty cannot be rewritten as completion and cancellation cannot coexist with another terminal'
    );
  }
  if (preparedBody.irreversible === true && finality !== 'finalize') {
    throw ledgerError(
      'PRAXIS_LEDGER_FINALITY_MISMATCH',
      'an irreversible prepared effect requires a finalize terminal transition'
    );
  }
  if (preparedBody.irreversible === false && finality !== 'commit') {
    throw ledgerError(
      'PRAXIS_LEDGER_FINALITY_MISMATCH',
      'a reversible prepared effect requires a commit terminal transition'
    );
  }
  if (preparedBody.finality !== null && preparedBody.finality !== finality) {
    throw ledgerError(
      'PRAXIS_LEDGER_FINALITY_MISMATCH',
      'terminal finality does not match the prepared entry finality'
    );
  }

  const common = {
    prepared_entry_digest: preparedEntryDigest,
    operation_digest: preparedBody.operation_digest,
    preparation_digest: preparedBody.preparation_digest,
    authority_id: preparedBody.authority_id,
    finality
  };
  let body;
  if (kind === 'terminal_completed') {
    body = {
      ...common,
      executor_receipt_digest: normalizeDigest(executorReceiptDigest, 'executor receipt digest'),
      completion_evidence_digest: normalizeDigest(completionEvidenceDigest, 'completion evidence digest')
    };
  } else if (kind === 'terminal_uncertain') {
    if (!uncertainty || typeof uncertainty !== 'object' || Array.isArray(uncertainty)) {
      throw new TypeError('an uncertain terminal entry requires an uncertainty record');
    }
    body = {
      ...common,
      uncertainty: snapshotLedgerBody(uncertainty),
      completion_claimed: false
    };
  } else {
    body = {
      ...common,
      cancellation_ref: cancellationRef === null || cancellationRef === undefined
        ? null
        : normalizeNonEmptyString(cancellationRef, 'cancellation ref')
    };
  }

  const entry = appendLedgerEntry(state, kind, body, normalizeTimeMs(now, 'terminal time'));
  state.terminals.set(preparedKey, entry.entry_digest);
  return Object.freeze({ entry });
}
