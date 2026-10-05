import { digestObject, ValidationError } from './canonical.mjs';
import { assessFounderCastingVote } from './founder-casting-vote.mjs';

export const FOUNDER_CASTING_VOTE_RECEIPT_SCHEMA =
  'axiom-founder-casting-vote-receipt.v0';

const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/;
const DIGEST = /^[a-f0-9]{64}$/;

export function assessFounderCastingVoteReceipt(
  foundationDocument,
  castingAssessment,
  receipt
) {
  const assessment = assessFounderCastingVote(foundationDocument, castingAssessment);
  validateFounderCastingVoteReceipt(receipt);

  if (!assessment.casting_vote_eligible) {
    throw new ValidationError(
      `Founder casting-vote receipt requires eligible tie: ${assessment.reason}`
    );
  }

  if (
    receipt.proposal_id !== assessment.proposal_id
    || receipt.founder_mind_id !== assessment.founder_mind_id
    || receipt.foundation_digest !== assessment.foundation_digest
    || receipt.assessment_digest !== assessment.assessment_digest
    || receipt.pre_cast_votes_for !== assessment.votes_for
    || receipt.pre_cast_votes_against !== assessment.votes_against
  ) {
    throw new ValidationError('Founder casting-vote receipt assessment binding is invalid');
  }

  const finalVotesFor =
    assessment.votes_for + (receipt.casting_vote === 'for' ? 1 : 0);
  const finalVotesAgainst =
    assessment.votes_against + (receipt.casting_vote === 'against' ? 1 : 0);

  return Object.freeze({
    valid: true,
    receipt_id: receipt.receipt_id,
    receipt_digest: digestObject(receipt),
    proposal_id: receipt.proposal_id,
    founder_mind_id: receipt.founder_mind_id,
    casting_vote: receipt.casting_vote,
    pre_cast_votes_for: assessment.votes_for,
    pre_cast_votes_against: assessment.votes_against,
    final_votes_for: finalVotesFor,
    final_votes_against: finalVotesAgainst,
    final_outcome: finalVotesFor > finalVotesAgainst ? 'accepted' : 'rejected',
    manual_confirmation_evidence_bound: true,
    authority_effect: 'none',
    execution_authority: false,
    runtime_activation: false
  });
}

export function validateFounderCastingVoteReceipt(receipt) {
  exactObject(receipt, 'Founder casting-vote receipt', [
    'schema',
    'receipt_id',
    'proposal_id',
    'founder_mind_id',
    'foundation_digest',
    'assessment_digest',
    'pre_cast_votes_for',
    'pre_cast_votes_against',
    'casting_vote',
    'manual_founder_confirmation_evidence_digest',
    'cast_at',
    'authority_effect',
    'execution_authority',
    'runtime_activation'
  ]);

  if (
    receipt.schema !== FOUNDER_CASTING_VOTE_RECEIPT_SCHEMA
    || !id(receipt.receipt_id)
    || !id(receipt.proposal_id)
    || !id(receipt.founder_mind_id)
    || !digest(receipt.foundation_digest)
    || !digest(receipt.assessment_digest)
    || !integerBetween(receipt.pre_cast_votes_for, 0, 20)
    || !integerBetween(receipt.pre_cast_votes_against, 0, 20)
    || !['for', 'against'].includes(receipt.casting_vote)
    || !digest(receipt.manual_founder_confirmation_evidence_digest)
    || receipt.authority_effect !== 'none'
    || receipt.execution_authority !== false
    || receipt.runtime_activation !== false
  ) {
    throw new ValidationError('Founder casting-vote receipt activation boundary is invalid');
  }

  const castAt = new Date(receipt.cast_at);
  if (Number.isNaN(castAt.valueOf()) || castAt.toISOString() !== receipt.cast_at) {
    throw new ValidationError('Founder casting-vote receipt cast_at is invalid');
  }

  return receipt;
}

export function assessFounderCastingVoteReceiptReplay(existingReceipts, candidateReceipt) {
  if (!Array.isArray(existingReceipts) || existingReceipts.length > 1024) {
    throw new ValidationError('Founder casting-vote receipt history is invalid');
  }
  const candidate = validateFounderCastingVoteReceipt(candidateReceipt);
  const candidateDigest = digestObject(candidate);
  const seenDigests = new Set();

  for (const existing of existingReceipts) {
    validateFounderCastingVoteReceipt(existing);
    const existingDigest = digestObject(existing);
    if (seenDigests.has(existingDigest)) {
      throw new ValidationError('Founder casting-vote receipt history contains duplicates');
    }
    seenDigests.add(existingDigest);

    if (existingDigest === candidateDigest) {
      return replayResult('idempotent-replay', candidate);
    }

    if (
      existing.receipt_id === candidate.receipt_id
      || existing.proposal_id === candidate.proposal_id
      || existing.assessment_digest === candidate.assessment_digest
    ) {
      return replayResult('conflict-denied', candidate);
    }
  }

  return replayResult('new-receipt-candidate', candidate);
}

function replayResult(status, receipt) {
  return Object.freeze({
    valid: true,
    status,
    receipt_id: receipt.receipt_id,
    proposal_id: receipt.proposal_id,
    mutation_authorized: false,
    authority_effect: 'none',
    runtime_activation: false
  });
}

function exactObject(value, label, keys) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new ValidationError(`${label} must be an object`);
  }
  const expected = [...keys].sort();
  const actual = Object.keys(value).sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    throw new ValidationError(`${label} fields are invalid`);
  }
}

function integerBetween(value, min, max) {
  return Number.isSafeInteger(value) && value >= min && value <= max;
}

function id(value) {
  return typeof value === 'string' && IDENTIFIER.test(value);
}

function digest(value) {
  return typeof value === 'string' && DIGEST.test(value);
}
